import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import {
  parsePaginatedQuery,
  getFilterParamMultiple,
  buildListResponse,
  buildSearchRegex,
} from "@/lib/api-utils";
import { discordApiRequest, fetchDiscordUsernames } from "@/lib/discord";
import { logger } from "@/utils/logger";
import { RACES, ALL_JOBS, MOD_JOBS } from "@/data/characterData";
import type { FilterQuery, PipelineStage } from "mongoose";

type SortConfig = {
  field: string;
  order: 1 | -1;
  useSecondarySort?: boolean;
};

const SORT_MAP: Record<string, SortConfig> = {
  name: { field: "name", order: 1 },
  "name-desc": { field: "name", order: -1 },
  hearts: { field: "maxHearts", order: 1, useSecondarySort: true },
  "hearts-desc": { field: "maxHearts", order: -1, useSecondarySort: true },
  attack: { field: "attack", order: 1, useSecondarySort: true },
  "attack-desc": { field: "attack", order: -1, useSecondarySort: true },
  defense: { field: "defense", order: 1, useSecondarySort: true },
  "defense-desc": { field: "defense", order: -1, useSecondarySort: true },
  stamina: { field: "maxStamina", order: 1, useSecondarySort: true },
  "stamina-desc": { field: "maxStamina", order: -1, useSecondarySort: true },
  age: { field: "age", order: 1, useSecondarySort: true },
  "age-desc": { field: "age", order: -1, useSecondarySort: true },
  owner: { field: "userId", order: 1, useSecondarySort: true },
  "owner-desc": { field: "userId", order: -1, useSecondarySort: true },
};

type CharacterListItem = {
  isModCharacter: boolean;
  name?: string;
  userId?: string;
  username?: string;
  [k: string]: unknown;
};

type UserNameDoc = {
  discordId?: string;
  username?: string;
};

type CharactersFacetResult = {
  data: CharacterListItem[];
  total: Array<{ count: number }>;
};

type DiscordGuildMember = {
  nick?: string | null;
  user?: {
    id?: string;
    username?: string;
    global_name?: string | null;
  };
};

async function fetchGuildDisplayNames(userIds: string[]): Promise<Record<string, string>> {
  const guildId = process.env.GUILD_ID;
  if (!guildId || !userIds.length) return {};

  const out: Record<string, string> = {};
  await Promise.all(
    userIds.map(async (userId) => {
      try {
        const member = await discordApiRequest<DiscordGuildMember>(
          `guilds/${guildId}/members/${userId}`,
          "GET"
        );
        if (!member) return;
        const displayName =
          (typeof member.nick === "string" && member.nick.trim()) ||
          (typeof member.user?.global_name === "string" &&
            member.user.global_name.trim()) ||
          (typeof member.user?.username === "string" &&
            member.user.username.trim()) ||
          "";
        if (displayName) out[userId] = displayName;
      } catch {
        // Ignore and let other name sources handle fallbacks.
      }
    })
  );
  return out;
}

function getIsModConstraint(values: string[]): boolean | null {
  if (values.length === 0) return null;
  const parsed = values.map((v) => String(v).toLowerCase() === "true");
  const wantsMod = parsed.includes(true);
  const wantsNonMod = parsed.includes(false);
  if (wantsMod && wantsNonMod) return null;
  return wantsMod;
}

// Helper function to create case-insensitive filter conditions for string arrays
function buildCaseInsensitiveFilter(field: string, values: string[]): { $or: Array<Record<string, RegExp>> } {
  const conditions = values.map(value => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { [field]: new RegExp(`^${escaped}$`, "i") };
  });
  return { $or: conditions };
}

// Uses query params (`nextUrl.searchParams`); must be dynamically rendered per-request.
// Caching is handled via `Cache-Control` response headers below.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await connect();
    const CharacterModule = await import("@/models/CharacterModel.js");
    const ModCharacterModule = await import("@/models/ModCharacterModel.js");
    const UserModule = await import("@/models/UserModel.js");
    // Handle both ESM default export and CommonJS module.exports
    const Character = CharacterModule.default || CharacterModule;
    // For CommonJS modules, the entire module is the export
    const ModCharacter = ModCharacterModule.default || ModCharacterModule;
    const User = UserModule.default || UserModule;
    
    if (!ModCharacter) {
      logger.error("api/models/characters", "ModCharacter model not found");
    }

    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;
    const races = getFilterParamMultiple(params, "race");
    const villages = getFilterParamMultiple(params, "village");
    const jobs = getFilterParamMultiple(params, "job");
    const owners = getFilterParamMultiple(params, "owner");
    const sortBy = params.get("sortBy") || "name";
    const isModCharacterParam = getFilterParamMultiple(params, "isModCharacter");

    const filter: FilterQuery<unknown> = {};
    // Hide drafts/pending/needs_changes from global list: only show accepted regular characters.
    filter.status = "accepted";

    const re = buildSearchRegex(search);
    if (re) {
      filter.name = re;
    }
    // Case-insensitive filtering for all string-based filters
    if (races.length) {
      const raceFilter = buildCaseInsensitiveFilter("race", races);
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, raceFilter];
        delete filter.$or;
      } else if (filter.name) {
        filter.$and = [{ name: filter.name }, raceFilter];
        delete filter.name;
      } else {
        filter.$or = raceFilter.$or;
      }
    }
    if (villages.length) {
      const villageFilter = buildCaseInsensitiveFilter("homeVillage", villages);
      if (filter.$or || filter.$and) {
        if (!filter.$and) filter.$and = [];
        filter.$and.push(villageFilter);
      } else if (filter.name) {
        filter.$and = [{ name: filter.name }, villageFilter];
        delete filter.name;
      } else {
        filter.$or = villageFilter.$or;
      }
    }
    if (jobs.length) {
      const jobFilter = buildCaseInsensitiveFilter("job", jobs);
      if (filter.$or || filter.$and) {
        if (!filter.$and) filter.$and = [];
        filter.$and.push(jobFilter);
      } else if (filter.name) {
        filter.$and = [{ name: filter.name }, jobFilter];
        delete filter.name;
      } else {
        filter.$or = jobFilter.$or;
      }
    }
    if (owners.length) {
      filter.userId = { $in: owners };
    }

    // Build mod character filter (same filters as regular characters)
    const modFilter: FilterQuery<unknown> = {};
    if (re) {
      modFilter.name = re;
    }
    // Case-insensitive filtering for all string-based filters
    if (races.length) {
      const raceFilter = buildCaseInsensitiveFilter("race", races);
      if (modFilter.$or) {
        modFilter.$and = [{ $or: modFilter.$or }, raceFilter];
        delete modFilter.$or;
      } else if (modFilter.name) {
        modFilter.$and = [{ name: modFilter.name }, raceFilter];
        delete modFilter.name;
      } else {
        modFilter.$or = raceFilter.$or;
      }
    }
    if (villages.length) {
      const villageFilter = buildCaseInsensitiveFilter("homeVillage", villages);
      if (modFilter.$or || modFilter.$and) {
        if (!modFilter.$and) modFilter.$and = [];
        modFilter.$and.push(villageFilter);
      } else if (modFilter.name) {
        modFilter.$and = [{ name: modFilter.name }, villageFilter];
        delete modFilter.name;
      } else {
        modFilter.$or = villageFilter.$or;
      }
    }
    if (jobs.length) {
      const jobFilter = buildCaseInsensitiveFilter("job", jobs);
      if (modFilter.$or || modFilter.$and) {
        if (!modFilter.$and) modFilter.$and = [];
        modFilter.$and.push(jobFilter);
      } else if (modFilter.name) {
        modFilter.$and = [{ name: modFilter.name }, jobFilter];
        delete modFilter.name;
      } else {
        modFilter.$or = jobFilter.$or;
      }
    }
    if (owners.length) {
      modFilter.userId = { $in: owners };
    }

    const sortConfig = SORT_MAP[sortBy] || SORT_MAP.name;
    const sortField = sortConfig.field;
    const sortOrder = sortConfig.order;
    const isModConstraint = getIsModConstraint(isModCharacterParam);

    // Static filter options from data files
    const VILLAGES = ["Rudania", "Inariko", "Vhintl"] as const;
    // Extract race values from RACES (values are lowercase like 'gerudo', 'hylian', etc.)
    const raceOpts = RACES.map(r => r.value);
    const villageOpts = [...VILLAGES];
    // Combine regular jobs and mod jobs
    const jobOpts = [...ALL_JOBS, ...MOD_JOBS];

    const skip = (page - 1) * limit;

    // Compute attack/defense from equipped gear for list display.
    // Bot stores gear stats with "modifierHearts" key (as seen in MongoDB documents).
    // Dashboard gear-equip may use "attack"/"defense" keys. Support both with fallback.
    const addComputedStats: PipelineStage.AddFields = {
      $addFields: {
        attack: {
          $ifNull: [
            { $ifNull: ["$gearWeapon.stats.modifierHearts", "$gearWeapon.stats.attack"] },
            0,
          ],
        },
        defense: {
          $add: [
            { $ifNull: [{ $ifNull: ["$gearArmor.head.stats.modifierHearts", "$gearArmor.head.stats.defense"] }, 0] },
            { $ifNull: [{ $ifNull: ["$gearArmor.chest.stats.modifierHearts", "$gearArmor.chest.stats.defense"] }, 0] },
            { $ifNull: [{ $ifNull: ["$gearArmor.legs.stats.modifierHearts", "$gearArmor.legs.stats.defense"] }, 0] },
            { $ifNull: [{ $ifNull: ["$gearShield.stats.modifierHearts", "$gearShield.stats.defense"] }, 0] },
          ],
        },
      },
    };

    // Preserve previous behavior where null/undefined values sort last for non-name sorts.
    const addSortNullFlag: PipelineStage.AddFields = {
      $addFields: {
        __sortIsNull: {
          $cond: [{ $eq: [`$${sortField}`, null] }, 1, 0],
        },
      },
    };
    const sortStage: PipelineStage.Sort = {
      $sort: {
        __sortIsNull: 1,
        [sortField]: sortOrder,
        ...(sortConfig.useSecondarySort && sortField !== "name" ? { name: 1 } : {}),
      },
    };

    const facetStage: PipelineStage.Facet = {
      $facet: {
        data: [sortStage, { $skip: skip }, { $limit: limit }],
        total: [{ $count: "count" }],
      },
    };

    let pageData: CharacterListItem[] = [];
    let total = 0;

    if (isModConstraint === true) {
      if (!ModCharacter?.collection?.name) {
        pageData = [];
        total = 0;
      } else {
        const pipeline: PipelineStage[] = [
          { $match: modFilter },
          { $addFields: { isModCharacter: true, status: "accepted" } },
          addComputedStats,
          addSortNullFlag,
          facetStage,
        ];
        const out = await ModCharacter.aggregate<CharactersFacetResult>(pipeline);
        const first = out?.[0];
        pageData = first?.data ?? [];
        total = first?.total?.[0]?.count ?? 0;
      }
    } else if (isModConstraint === false) {
      const pipeline: PipelineStage[] = [
        { $match: filter },
        { $addFields: { isModCharacter: false } },
        addComputedStats,
        addSortNullFlag,
        facetStage,
      ];
      const out = await Character.aggregate<CharactersFacetResult>(pipeline);
      const first = out?.[0];
      pageData = first?.data ?? [];
      total = first?.total?.[0]?.count ?? 0;
    } else if (!ModCharacter?.collection?.name) {
      // If mod characters aren't available in this environment, fall back to regular only.
      const pipeline: PipelineStage[] = [
        { $match: filter },
        { $addFields: { isModCharacter: false } },
        addComputedStats,
        addSortNullFlag,
        facetStage,
      ];
      const out = await Character.aggregate<CharactersFacetResult>(pipeline);
      const first = out?.[0];
      pageData = first?.data ?? [];
      total = first?.total?.[0]?.count ?? 0;
    } else {
      const modColl = ModCharacter.collection.name;
      const unionPipeline: PipelineStage[] = [
        { $match: filter },
        { $addFields: { isModCharacter: false } },
        addComputedStats,
        {
          $unionWith: {
            coll: modColl,
            pipeline: [
              { $match: modFilter },
              { $addFields: { isModCharacter: true, status: "accepted" } },
              addComputedStats,
            ],
          },
        },
        addSortNullFlag,
        facetStage,
      ];

      const out = await Character.aggregate<CharactersFacetResult>(unionPipeline);
      const first = out?.[0];
      pageData = first?.data ?? [];
      total = first?.total?.[0]?.count ?? 0;
    }

    const userIds = [
      ...new Set(pageData.map((c) => c.userId).filter((v): v is string => typeof v === "string" && v.length > 0)),
    ];
    const [usernames, userNameDocsRaw] = await Promise.all([
      fetchDiscordUsernames(userIds),
      userIds.length
        ? User.find({ discordId: { $in: userIds } })
            .select("discordId username")
            .lean()
        : Promise.resolve([]),
    ]);
    const userNameDocs = userNameDocsRaw as UserNameDoc[];
    const dbUsernames: Record<string, string> = {};
    userNameDocs.forEach((doc) => {
      const id = typeof doc.discordId === "string" ? doc.discordId : "";
      const name = typeof doc.username === "string" ? doc.username.trim() : "";
      if (id && name) dbUsernames[id] = name;
    });

    const [regularOwnerIds, modOwnerIds] = await Promise.all([
      Character.distinct("userId", { status: "accepted" }),
      ModCharacter?.collection?.name ? ModCharacter.distinct("userId", {}) : Promise.resolve([]),
    ]);
    const ownerOpts = Array.from(
      new Set(
        [...regularOwnerIds, ...modOwnerIds].filter(
          (v): v is string => typeof v === "string" && v.length > 0
        )
      )
    ).sort();
    const [ownerUsernames, ownerNameDocsRaw] = await Promise.all([
      fetchDiscordUsernames(ownerOpts),
      ownerOpts.length
        ? User.find({ discordId: { $in: ownerOpts } })
            .select("discordId username")
            .lean()
        : Promise.resolve([]),
    ]);
    const ownerNameDocs = ownerNameDocsRaw as UserNameDoc[];
    const ownerDbUsernames: Record<string, string> = {};
    ownerNameDocs.forEach((doc) => {
      const id = typeof doc.discordId === "string" ? doc.discordId : "";
      const name = typeof doc.username === "string" ? doc.username.trim() : "";
      if (id && name) ownerDbUsernames[id] = name;
    });
    const unresolvedOwnerIds = ownerOpts.filter(
      (ownerId) =>
        !ownerUsernames[ownerId] &&
        !ownerDbUsernames[ownerId]
    );
    const guildOwnerNames = await fetchGuildDisplayNames(unresolvedOwnerIds);
    const ownerFilterValues = ownerOpts
      .map((ownerId) => {
        const rawDisplayName =
          ownerUsernames[ownerId] ??
          ownerDbUsernames[ownerId] ??
          guildOwnerNames[ownerId];
        const displayName =
          typeof rawDisplayName === "string" ? rawDisplayName.trim() : "";
        if (!displayName) return null;
        return { ownerId, displayName };
      })
      .filter(
        (entry): entry is { ownerId: string; displayName: string } =>
          entry !== null
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map(({ ownerId, displayName }) => `${ownerId}::${displayName}`);

    const unresolvedPageIds = userIds.filter(
      (id) => !usernames[id] && !dbUsernames[id]
    );
    const guildPageNames = await fetchGuildDisplayNames(unresolvedPageIds);
    const dataWithUsernames: CharacterListItem[] = pageData.map((c) => ({
      ...c,
      username: c.userId
        ? usernames[c.userId] ??
          dbUsernames[c.userId] ??
          guildPageNames[c.userId]
        : undefined,
    }));

    const filterOptions: Record<string, (string | number)[]> = {
      race: raceOpts.sort(),
      village: villageOpts.sort(),
      job: jobOpts.sort(),
      owner: ownerFilterValues,
    };

    const response = NextResponse.json(
      buildListResponse({
        data: dataWithUsernames,
        total,
        page,
        limit,
        filterOptions,
      })
    );

    // Add cache headers for browser/CDN caching
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=600"
    );

    return response;
  } catch (e) {
    logger.error("api/models/characters", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch characters" },
      { status: 500 }
    );
  }
}
