/**
 * Fetch Discord usernames for a list of user IDs using the Discord API.
 * Uses DISCORD_TOKEN (bot token) from env. Server-side only.
 * Returns a map of userId -> display name (global_name or username).
 */

const DISCORD_API_BASE = "https://discord.com/api/v10";

// Cache for userHasGuildRole results to avoid rate limiting
const roleCheckCache = new Map<string, { hasRole: boolean; expiresAt: number }>();
const ROLE_CHECK_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function fetchOneUser(
  userId: string,
  token: string
): Promise<{ id: string; username: string; global_name?: string | null } | null> {
  const res = await fetch(`${DISCORD_API_BASE}/users/${userId}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Fetch display names for Discord user IDs.
 * Uses global_name when set, otherwise username.
 * Missing/failed lookups are omitted; caller can fall back to userId.
 */
export async function fetchDiscordUsernames(
  userIds: string[]
): Promise<Record<string, string>> {
  const token = process.env.DISCORD_TOKEN;
  if (!token || !userIds.length) return {};

  const unique = [...new Set(userIds)];
  const results = await Promise.all(
    unique.map(async (id) => {
      try {
        const user = await fetchOneUser(id, token);
        if (!user) return { id, name: "" };
        const name = (user.global_name && user.global_name.trim()) || user.username || "";
        return { id, name };
      } catch {
        return { id, name: "" };
      }
    })
  );

  const map: Record<string, string> = {};
  for (const { id, name } of results) {
    if (name) map[id] = name;
  }
  return map;
}

/**
 * Check if a user has a specific role in a guild.
 * Uses DISCORD_TOKEN (bot). Bot must be in the guild; Guild Members intent required.
 * Returns false if user not in guild or API fails.
 * Results are cached for 5 minutes to avoid rate limiting.
 */
export async function userHasGuildRole(
  guildId: string,
  userId: string,
  roleId: string
): Promise<boolean> {
  const token = process.env.DISCORD_TOKEN;
  if (!token || !guildId || !userId || !roleId) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `userHasGuildRole: Missing required parameters. token=${!!token}, guildId=${guildId}, userId=${userId}, roleId=${roleId}`
      );
    }
    return false;
  }

  // Check cache first
  const cacheKey = `${guildId}:${userId}:${roleId}`;
  const now = Date.now();
  const cached = roleCheckCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.hasRole;
  }

  try {
    // Retry logic for rate limiting
    let res: Response | null = null;
    let retries = 0;
    const maxRetries = 3;
    
    while (retries <= maxRetries) {
      res = await fetch(
        `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`,
        { headers: { Authorization: `Bot ${token}` } }
      );
      
      // Handle rate limiting with retry
      if (res.status === 429) {
        const errorText = await res.text().catch(() => "{}");
        let retryAfter = 1; // Default 1 second
        
        try {
          const errorJson = JSON.parse(errorText);
          retryAfter = errorJson.retry_after ? parseFloat(errorJson.retry_after) : 1;
        } catch {
          // If we can't parse, use default
        }
        
        if (retries < maxRetries) {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              `[userHasGuildRole] Rate limited, retrying after ${retryAfter}s (attempt ${retries + 1}/${maxRetries + 1})`
            );
          }
          await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
          retries++;
          continue;
        } else {
          // Max retries reached - cache a short negative result to avoid hammering
          roleCheckCache.set(cacheKey, { hasRole: false, expiresAt: now + 30_000 });
          if (process.env.NODE_ENV === "development") {
            console.error(
              `[userHasGuildRole] Rate limited, max retries (${maxRetries}) reached for user ${userId}`
            );
          }
          return false;
        }
      }
      
      // Break out of retry loop if not rate limited
      break;
    }
    
    // TypeScript guard - res should always be set after the loop, but just in case
    if (!res) {
      return false;
    }
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => "Unable to read error");
      const errorJson = (() => {
        try {
          return JSON.parse(errorText);
        } catch {
          return { message: errorText };
        }
      })();
      
      // 404 = Unknown Member (user left guild or not in cache) — expected, no log
      // Log 403 (permission) and other errors; in development optionally log 404 for debugging
      const isUnknownMember = res.status === 404 && errorJson?.code === 10007;
      if (!isUnknownMember && (process.env.NODE_ENV === "development" || res.status === 403)) {
        console.error(
          `[userHasGuildRole] Discord API error (${res.status}) for user ${userId} in guild ${guildId}:\n` +
          `  Role ID being checked: ${roleId}\n` +
          `  Error: ${JSON.stringify(errorJson, null, 2)}\n` +
          `  Common causes:\n` +
          `    - Bot missing "Server Members Intent" in Discord Developer Portal\n` +
          `    - Bot not in the guild\n` +
          `    - User not in the guild\n` +
          `    - Bot missing permissions`
        );
      }
      
      // Cache negative result for errors (shorter TTL for transient errors)
      roleCheckCache.set(cacheKey, { hasRole: false, expiresAt: now + 60_000 });
      return false;
    }
    
    const data = (await res.json()) as { roles?: string[] };
    const roles = data.roles ?? [];
    const hasRole = roles.includes(roleId);
    
    // Cache the result
    roleCheckCache.set(cacheKey, { hasRole, expiresAt: now + ROLE_CHECK_CACHE_TTL_MS });
    
    return hasRole;
  } catch (error) {
    console.error(
      `[userHasGuildRole] Exception checking role for user ${userId} in guild ${guildId}:\n` +
      `  Role ID: ${roleId}\n` +
      `  Error: ${error instanceof Error ? error.message : String(error)}\n` +
      `  Stack: ${error instanceof Error ? error.stack : "N/A"}`
    );
    return false;
  }
}

/**
 * Invalidate cached role check for a user (call when roles change).
 * If no roleId specified, clears all cached role checks for that user in that guild.
 */
export function invalidateRoleCache(guildId: string, userId: string, roleId?: string): void {
  if (roleId) {
    roleCheckCache.delete(`${guildId}:${userId}:${roleId}`);
  } else {
    const prefix = `${guildId}:${userId}:`;
    for (const key of roleCheckCache.keys()) {
      if (key.startsWith(prefix)) {
        roleCheckCache.delete(key);
      }
    }
  }
}

/**
 * Generic Discord API request handler.
 * Uses DISCORD_TOKEN from environment. Handles rate limiting and errors.
 * @param endpoint - Discord API endpoint (e.g., "/channels/123/messages")
 * @param method - HTTP method (GET, POST, PATCH, PUT, DELETE)
 * @param body - Request body (will be JSON stringified)
 * @returns Response data or null on error
 */

/**
 * POST with file attachments (e.g. for embed image via attachment://filename).
 */
export async function discordApiPostWithFile<T = unknown>(
  endpoint: string,
  payload: Record<string, unknown>,
  files: Array<{ data: Buffer | Uint8Array; filename: string }>
): Promise<T | null> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("DISCORD_TOKEN not configured");
    return null;
  }
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  const url = `${DISCORD_API_BASE}/${cleanEndpoint}`;

  try {
    const boundary = `----DiscordBoundary${Date.now()}`;
    const parts: Uint8Array[] = [];

    parts.push(
      new TextEncoder().encode(
        `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n`
      )
    );
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      parts.push(
        new TextEncoder().encode(
          `--${boundary}\r\nContent-Disposition: form-data; name="files[${i}]"; filename="${file.filename}"\r\nContent-Type: image/png\r\n\r\n`
        )
      );
      parts.push(file.data instanceof Buffer ? file.data : Buffer.from(file.data));
      parts.push(new TextEncoder().encode("\r\n"));
    }
    parts.push(new TextEncoder().encode(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
      duplex: "half",
    } as RequestInit);

    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
      await new Promise((r) => setTimeout(r, delay));
      const retryRes = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bot ${token}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": String(body.length),
        },
        body,
        duplex: "half",
      } as RequestInit);
      if (!retryRes.ok) return null;
      return retryRes.json() as Promise<T>;
    }
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Discord API error (${res.status}): ${errorText}`);
      return null;
    }
    if (res.status === 204) return null as T;
    return res.json() as Promise<T>;
  } catch (error) {
    console.error(`Discord API request failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function discordApiRequest<T = unknown>(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = "GET",
  body?: unknown
): Promise<T | null> {
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("DISCORD_TOKEN not configured");
    return null;
  }

  // Remove leading slash if present
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  const url = `${DISCORD_API_BASE}/${cleanEndpoint}`;

  try {
    const headers: HeadersInit = {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body && (method === "POST" || method === "PATCH" || method === "PUT")) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);

    // Handle rate limiting
    if (res.status === 429) {
      const retryAfter = res.headers.get("retry-after");
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));
      // Retry once
      const retryRes = await fetch(url, options);
      if (!retryRes.ok) return null;
      return retryRes.json() as Promise<T>;
    }

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Discord API error (${res.status}): ${errorText}`);
      return null;
    }

    // Handle 204 No Content
    if (res.status === 204) {
      return null as T;
    }

    return res.json() as Promise<T>;
  } catch (error) {
    console.error(`Discord API request failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/** Fallback explore command ID when Discord API fetch fails */
const EXPLORE_CMD_ID_FALLBACK = "1471454947089580107";

let exploreCmdIdCache: { id: string; expiresAt: number } | null = null;
const EXPLORE_CMD_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch the /explore command ID from Discord for clickable slash mentions.
 * Command IDs can change when commands are re-registered.
 */
export async function getExploreCommandId(): Promise<string> {
  const clientId = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.GUILD_ID;
  if (!clientId || !guildId) return EXPLORE_CMD_ID_FALLBACK;

  const now = Date.now();
  if (exploreCmdIdCache && exploreCmdIdCache.expiresAt > now) {
    return exploreCmdIdCache.id;
  }

  const commands = await discordApiRequest<Array<{ id: string; name: string }>>(
    `applications/${clientId}/guilds/${guildId}/commands`,
    "GET"
  );
  const explore = commands?.find((c) => c.name === "explore");
  if (explore?.id) {
    exploreCmdIdCache = {
      id: explore.id,
      expiresAt: now + EXPLORE_CMD_CACHE_TTL_MS,
    };
    return explore.id;
  }
  return EXPLORE_CMD_ID_FALLBACK;
}

/**
 * Add a role to a guild member. Returns the Discord API error message on failure
 * so callers can log it (e.g. role hierarchy, missing permission).
 */
export async function assignGuildMemberRole(
  guildId: string,
  userId: string,
  roleId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.DISCORD_TOKEN;
  if (!token || !guildId || !userId || !roleId) {
    return { ok: false, error: "Missing DISCORD_TOKEN, GUILD_ID, userId, or roleId" };
  }
  const url = `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}/roles/${roleId}`;
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
    });
    if (res.ok || res.status === 204) return { ok: true };
    const errorText = await res.text();
    const error = `Discord API (${res.status}): ${errorText}`;
    console.error(error);
    return { ok: false, error };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`Assign role request failed: ${error}`);
    return { ok: false, error };
  }
}

/**
 * Remove a role from a guild member. Returns the Discord API error message on failure.
 * 404 from Discord (e.g. user not in guild, role not found) is treated as non-fatal.
 */
export async function removeGuildMemberRole(
  guildId: string,
  userId: string,
  roleId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.DISCORD_TOKEN;
  if (!token || !guildId || !userId || !roleId) {
    return { ok: false, error: "Missing DISCORD_TOKEN, GUILD_ID, userId, or roleId" };
  }
  const url = `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}/roles/${roleId}`;
  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    if (res.ok || res.status === 204) return { ok: true };
    // 404 = user/role not found or user doesn't have role — treat as success (nothing to remove)
    if (res.status === 404) return { ok: true };
    const errorText = await res.text();
    const error = `Discord API (${res.status}): ${errorText}`;
    console.error(error);
    return { ok: false, error };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error(`Remove role request failed: ${error}`);
    return { ok: false, error };
  }
}
