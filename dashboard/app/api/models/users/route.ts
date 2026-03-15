import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect, isDatabaseUnavailableError, logDatabaseUnavailableOnce } from "@/lib/db";
import {
  parsePaginatedQuery,
  getFilterParamMultiple,
  buildListResponse,
  buildSearchRegex,
} from "@/lib/api-utils";
import { logger } from "@/utils/logger";
import { discordApiRequest } from "@/lib/discord";
import type { FilterQuery } from "mongoose";

export const dynamic = "force-dynamic";

type DiscordGuildMember = {
  nick?: string | null;
  avatar?: string | null;
  roles?: string[];
  user?: { id: string; username: string; global_name?: string | null; avatar?: string | null };
};

type EnrichedUser = Record<string, unknown> & {
  discordId?: string;
  dbStatus?: unknown;
  status?: unknown;
  serverDisplayName: string;
  characterCount: number;
  avatarUrl: string;
  inGuild: boolean;
  hasTravelerRole: boolean;
  hasInactiveRole: boolean;
  confirmedNotInGuild: boolean;
};

type DiscordUnknownMemberError = { code?: number; message?: string };

async function isConfirmedUnknownMember(
  guildId: string,
  userId: string,
  token: string
): Promise<boolean> {
  const url = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`;
  const res = await fetch(url, { headers: { Authorization: `Bot ${token}` } });
  if (res.status !== 404) return false;
  const bodyText = await res.text().catch(() => "");
  const body: DiscordUnknownMemberError = (() => {
    try {
      return JSON.parse(bodyText);
    } catch {
      return {};
    }
  })();
  // Discord "Unknown Member" is code 10007. Only treat that as a definite "left server".
  return body?.code === 10007;
}

function makeAvatarUrl(params: {
  guildId: string;
  userId: string;
  guildAvatarHash?: string | null;
  userAvatarHash?: string | null;
}): string {
  const { guildId, userId, guildAvatarHash, userAvatarHash } = params;
  if (guildAvatarHash && guildAvatarHash.trim()) {
    return `https://cdn.discordapp.com/guilds/${guildId}/users/${userId}/avatars/${guildAvatarHash}.png?size=128`;
  }
  if (userAvatarHash && userAvatarHash.trim()) {
    return `https://cdn.discordapp.com/avatars/${userId}/${userAvatarHash}.png?size=128`;
  }
  const mod = (parseInt(userId.slice(-4), 10) || 0) % 5;
  return `https://cdn.discordapp.com/embed/avatars/${mod}.png`;
}

type GuildMemberIndex = {
  displayName: string;
  avatarUrl: string;
  roles: string[];
};

async function fetchGuildMemberIndex(): Promise<{
  guildId: string;
  travelerRoleId: string;
  inactiveRoleId: string;
  members: Map<string, GuildMemberIndex>;
}> {
  const guildId = process.env.GUILD_ID;
  if (!guildId) {
    return {
      guildId: "",
      travelerRoleId: process.env.TRAVELER_ROLE_ID || "788137818135330837",
      inactiveRoleId: process.env.INACTIVE_ROLE_ID || "788148064182730782",
      members: new Map(),
    };
  }

  const travelerRoleId = process.env.TRAVELER_ROLE_ID || "788137818135330837";
  const inactiveRoleId = process.env.INACTIVE_ROLE_ID || "788148064182730782";

  const members = new Map<string, GuildMemberIndex>();
  let after: string | undefined = undefined;

  // Pull the full guild member list in chunks of 1000 so we can:
  // - reliably determine in-guild membership
  // - filter by Traveler role without per-user calls
  // - sort/search by server nickname consistently
  for (let i = 0; i < 10_000; i++) {
    const qs = new URLSearchParams();
    qs.set("limit", "1000");
    if (after) qs.set("after", after);
    const batch = await discordApiRequest<DiscordGuildMember[]>(
      `guilds/${guildId}/members?${qs.toString()}`,
      "GET"
    );
    if (!Array.isArray(batch) || batch.length === 0) break;

    for (const m of batch) {
      const id = m?.user?.id;
      if (!id) continue;
      const displayName =
        (m.nick && m.nick.trim()) ||
        (m.user?.global_name && m.user.global_name.trim()) ||
        m.user?.username ||
        "";
      const roles = Array.isArray(m.roles) ? m.roles : [];
      members.set(id, {
        displayName,
        roles,
        avatarUrl: makeAvatarUrl({
          guildId,
          userId: id,
          guildAvatarHash: m.avatar,
          userAvatarHash: m.user?.avatar,
        }),
      });
    }

    const last = batch[batch.length - 1];
    after = last?.user?.id;
    if (!after) break;
    if (batch.length < 1000) break;
  }

  return { guildId, travelerRoleId, inactiveRoleId, members };
}

type SortKey =
  | "name"
  | "name-desc"
  | "discordId"
  | "discordId-desc"
  | "tokens"
  | "tokens-desc"
  | "level"
  | "level-desc";

const SORT_MAP: Record<
  SortKey,
  { sort: Record<string, 1 | -1>; secondary?: Record<string, 1 | -1> }
> = {
  // "name" sorts happen after Discord enrichment (serverDisplayName),
  // so DB sort just needs to be stable/deterministic.
  name: { sort: { discordId: 1 } },
  "name-desc": { sort: { discordId: 1 } },
  discordId: { sort: { discordId: 1 } },
  "discordId-desc": { sort: { discordId: -1 } },
  tokens: { sort: { tokens: 1 }, secondary: { discordId: 1 } },
  "tokens-desc": { sort: { tokens: -1 }, secondary: { discordId: 1 } },
  level: { sort: { "leveling.level": 1 }, secondary: { discordId: 1 } },
  "level-desc": { sort: { "leveling.level": -1 }, secondary: { discordId: 1 } },
};

export async function GET(req: NextRequest) {
  try {
    await connect();
    const { default: User } = await import("@/models/UserModel.js");
    const CharacterModule = await import("@/models/CharacterModel.js");
    const Character = CharacterModule.default || CharacterModule;

    // Hard exclude list for this page (Discord user IDs).
    const EXCLUDED_USER_IDS = new Set<string>(["211748804746149888"]);

    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;

    const statusRaw = getFilterParamMultiple(params, "status");
    const sortBy = (params.get("sortBy") || "name") as SortKey;
    const sortConfig = SORT_MAP[sortBy] ?? SORT_MAP.discordId;

    const filter: FilterQuery<unknown> = {};

    const sortQuery: Record<string, 1 | -1> = {
      ...sortConfig.sort,
      ...(sortConfig.secondary ?? {}),
    };

    const select =
      [
        "discordId",
        "username",
        "tokens",
        "status",
        "characterSlot",
        "leveling.level",
        "leveling.xp",
        "quests",
        "helpWanted.lastCompletion",
        "helpWanted.cooldownUntil",
        "helpWanted.totalCompletions",
        "helpWanted.currentCompletions",
        "helpWanted.lastExchangeAmount",
        "helpWanted.lastExchangeAt",
      ].join(" ");

    const re = buildSearchRegex(search);

    // Pull all DB users (we need to join/filter/sort by guild nickname which isn't in Mongo).
    // Keep the projection tight to avoid huge payloads.
    const data = await User.find(filter).select(select).lean().sort(sortQuery);

    const discordIdsAll = (data as Array<{ discordId?: unknown }>)
      .map((d) => (typeof d.discordId === "string" ? d.discordId : ""))
      .filter((id) => Boolean(id));

    const [{ guildId, travelerRoleId, inactiveRoleId, members }, characterCountsAgg] =
      await Promise.all([
        fetchGuildMemberIndex(),
        Character?.aggregate
          ? Character.aggregate([
              { $match: { userId: { $in: discordIdsAll } } },
              { $group: { _id: "$userId", count: { $sum: 1 } } },
            ])
          : Promise.resolve([]),
      ]);

    const characterCounts: Record<string, number> = {};
    for (const row of characterCountsAgg as Array<{ _id?: unknown; count?: unknown }>) {
      const id = typeof row._id === "string" ? row._id : "";
      const count = typeof row.count === "number" ? row.count : Number(row.count);
      if (id) characterCounts[id] = Number.isFinite(count) ? count : 0;
    }

    const enriched: EnrichedUser[] = (data as Array<Record<string, unknown>>).map((doc) => {
      const discordIdRaw = doc.discordId;
      const discordId = typeof discordIdRaw === "string" ? discordIdRaw : "";
      const member = discordId ? members.get(discordId) : undefined;
      const serverDisplayName = member?.displayName ?? "";
      const characterCount = discordId ? characterCounts[discordId] ?? 0 : 0;
      const avatarUrl = member?.avatarUrl ?? "";
      const roles = member?.roles ?? [];
      const hasTravelerRole = roles.includes(travelerRoleId);
      const hasInactiveRole = roles.includes(inactiveRoleId);
      const dbStatus = doc.status;
      const effectiveStatus =
        discordId && hasInactiveRole === true ? "inactive" : dbStatus;
      return {
        ...doc,
        discordId,
        dbStatus,
        status: effectiveStatus,
        serverDisplayName,
        characterCount,
        avatarUrl,
        inGuild: Boolean(member),
        hasTravelerRole,
        hasInactiveRole,
        confirmedNotInGuild: false,
      };
    });

    // Hide users not in guild and travelers, plus explicit exclusions.
    let visible = enriched.filter((u) => {
      const id = String(u.discordId ?? "");
      if (!id) return false;
      if (EXCLUDED_USER_IDS.has(id)) return false;
      if (u.inGuild !== true) return false;
      if (u.hasTravelerRole === true) return false;
      if (typeof u.serverDisplayName !== "string" || u.serverDisplayName.trim().length === 0) return false;
      return true;
    });

    // Search by server nickname (and allow searching by DB discordId as fallback).
    if (re) {
      visible = visible.filter((u) => re.test(String(u.serverDisplayName ?? "")) || re.test(String(u.discordId ?? "")));
    }

    // Apply status filter against effective status (includes Discord INACTIVE role override).
    if (statusRaw.length) {
      const wanted = new Set(statusRaw.map((s) => String(s).toLowerCase().trim()));
      const wantsActive = wanted.has("active");
      const wantsInactive = wanted.has("inactive");
      if (wantsActive !== wantsInactive) {
        const target = wantsInactive ? "inactive" : "active";
        visible = visible.filter(
          (u) => String(u.status ?? "").toLowerCase().trim() === target
        );
      }
    }

    // Sort by Discord nickname (serverDisplayName) when requested.
    if (sortBy === "name" || sortBy === "name-desc") {
      visible.sort((a, b) => {
        const an = String(a.serverDisplayName ?? "");
        const bn = String(b.serverDisplayName ?? "");
        const cmp = an.localeCompare(bn, "en", { sensitivity: "base" });
        return sortBy === "name-desc" ? -cmp : cmp;
      });
    }

    // Extra-safe deletion pass for DB users not in guild:
    // only delete after double-confirmed "Unknown Member" from Discord.
    const token = process.env.DISCORD_TOKEN;
    const maybeLeft = enriched
      .filter((u) => String(u.discordId ?? "").length > 0 && u.inGuild !== true)
      .map((u) => String(u.discordId ?? ""));
    const toCheck = maybeLeft.slice(0, 25);
    const confirmedLeft: string[] = [];
    if (guildId && token && toCheck.length > 0) {
      for (const id of toCheck) {
        const first = await isConfirmedUnknownMember(guildId, id, token);
        if (!first) continue;
        await new Promise((r) => setTimeout(r, 250));
        const second = await isConfirmedUnknownMember(guildId, id, token);
        if (second) confirmedLeft.push(id);
      }
    }
    if (confirmedLeft.length > 0) {
      try {
        await User.deleteMany({ discordId: { $in: confirmedLeft } });
      } catch (delErr) {
        logger.warn(
          "api/models/users",
          `Failed to delete ${confirmedLeft.length} users not in guild: ${delErr instanceof Error ? delErr.message : String(delErr)}`
        );
      }
    }

    const totalVisible = visible.length;
    const start = (page - 1) * limit;
    const pageData = visible.slice(start, start + limit);

    const filterOptions: Record<string, (string | number)[]> = {
      status: ["active", "inactive"],
    };

    const response = NextResponse.json(
      buildListResponse({
        data: pageData,
        total: totalVisible,
        page,
        limit,
        filterOptions,
      })
    );

    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    return response;
  } catch (e) {
    if (isDatabaseUnavailableError(e)) {
      logDatabaseUnavailableOnce("models/users");
      return NextResponse.json(
        buildListResponse({ data: [], total: 0, page: 1, limit: 10 }),
        { status: 200, headers: { "X-Degraded": "database" } }
      );
    }
    logger.error("api/models/users", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

