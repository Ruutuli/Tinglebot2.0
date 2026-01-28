import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import {
  parsePaginatedQuery,
  getFilterParamMultiple,
  buildListResponse,
  buildSearchRegex,
} from "@/lib/api-utils";
import { fetchDiscordUsernames } from "@/lib/discord";
import { logger } from "@/utils/logger";
import { RACES, ALL_JOBS, MOD_JOBS } from "@/data/characterData";
import type { PipelineStage } from "mongoose";

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
};

type CharacterListItem = {
  isModCharacter: boolean;
  name?: string;
  userId?: string;
  username?: string;
  [k: string]: unknown;
};

type CharactersFacetResult = {
  data: CharacterListItem[];
  total: Array<{ count: number }>;
};

function getIsModConstraint(values: string[]): boolean | null {
  if (values.length === 0) return null;
  const parsed = values.map((v) => String(v).toLowerCase() === "true");
  const wantsMod = parsed.includes(true);
  const wantsNonMod = parsed.includes(false);
  if (wantsMod && wantsNonMod) return null;
  return wantsMod;
}

// Uses query params (`nextUrl.searchParams`); must be dynamically rendered per-request.
// Caching is handled via `Cache-Control` response headers below.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await connect();
    const CharacterModule = await import("@/models/CharacterModel.js");
    const ModCharacterModule = await import("@/models/ModCharacterModel.js");
    // Handle both ESM default export and CommonJS module.exports
    const Character = CharacterModule.default || CharacterModule;
    // For CommonJS modules, the entire module is the export
    const ModCharacter = ModCharacterModule.default || ModCharacterModule;
    
    if (!ModCharacter) {
      logger.error("api/models/characters", "ModCharacter model not found");
    }

    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;
    const races = getFilterParamMultiple(params, "race");
    const villages = getFilterParamMultiple(params, "village");
    const jobs = getFilterParamMultiple(params, "job");
    const sortBy = params.get("sortBy") || "name";
    const isModCharacterParam = getFilterParamMultiple(params, "isModCharacter");

    const filter: Record<string, unknown> = {};
    // Hide drafts/pending/needs_changes from global list: only show accepted regular characters.
    filter.status = "accepted";

    const re = buildSearchRegex(search);
    if (re) {
      filter.$or = [
        { name: re },
        { job: re },
        { race: re },
        { currentVillage: re },
        { homeVillage: re },
      ];
    }
    // Case-insensitive race filtering to handle both "Zora" and "zora" in database
    if (races.length) {
      // Use $or with regex patterns for case-insensitive matching
      const raceConditions = races.map(race => {
        const escaped = race.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return { race: new RegExp(`^${escaped}$`, "i") };
      });
      if (filter.$or) {
        // If $or already exists (from search), combine with race conditions
        filter.$and = [
          { $or: filter.$or },
          { $or: raceConditions }
        ];
        delete filter.$or;
      } else {
        filter.$or = raceConditions;
      }
    }
    if (villages.length) filter.currentVillage = { $in: villages };
    if (jobs.length) filter.job = { $in: jobs };

    // Build mod character filter (same filters as regular characters)
    const modFilter: Record<string, unknown> = {};
    if (re) {
      modFilter.$or = [
        { name: re },
        { job: re },
        { race: re },
        { currentVillage: re },
        { homeVillage: re },
      ];
    }
    // Case-insensitive race filtering to handle both "Zora" and "zora" in database
    if (races.length) {
      // Use $or with regex patterns for case-insensitive matching
      const raceConditions = races.map(race => {
        const escaped = race.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return { race: new RegExp(`^${escaped}$`, "i") };
      });
      if (modFilter.$or) {
        // If $or already exists (from search), combine with race conditions
        modFilter.$and = [
          { $or: modFilter.$or },
          { $or: raceConditions }
        ];
        delete modFilter.$or;
      } else {
        modFilter.$or = raceConditions;
      }
    }
    if (villages.length) modFilter.currentVillage = { $in: villages };
    if (jobs.length) modFilter.job = { $in: jobs };

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
        {
          $unionWith: {
            coll: modColl,
            pipeline: [
              { $match: modFilter },
              { $addFields: { isModCharacter: true, status: "accepted" } },
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
    const usernames = await fetchDiscordUsernames(userIds);

    const dataWithUsernames: CharacterListItem[] = pageData.map((c) => ({
      ...c,
      username: c.userId ? usernames[c.userId] : undefined,
    }));

    const filterOptions: Record<string, (string | number)[]> = {
      race: raceOpts.sort(),
      village: villageOpts.sort(),
      job: jobOpts.sort(),
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
