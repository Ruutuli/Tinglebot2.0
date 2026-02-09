/**
 * Fetch Discord usernames for a list of user IDs using the Discord API.
 * Uses DISCORD_TOKEN (bot token) from env. Server-side only.
 * Returns a map of userId -> display name (global_name or username).
 */

const DISCORD_API_BASE = "https://discord.com/api/v10";

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
          // Max retries reached
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
      
      // Return false for any error
      return false;
    }
    
    const data = (await res.json()) as { roles?: string[] };
    const roles = data.roles ?? [];
    return roles.includes(roleId);
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
 * Generic Discord API request handler.
 * Uses DISCORD_TOKEN from environment. Handles rate limiting and errors.
 * @param endpoint - Discord API endpoint (e.g., "/channels/123/messages")
 * @param method - HTTP method (GET, POST, PATCH, DELETE)
 * @param body - Request body (will be JSON stringified)
 * @returns Response data or null on error
 */
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
