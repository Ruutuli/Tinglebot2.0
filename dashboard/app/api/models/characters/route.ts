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

function buildSort(sortBy: string): Record<string, 1 | -1> {
  const config = SORT_MAP[sortBy] || SORT_MAP.name;
  const sort: Record<string, 1 | -1> = {
    [config.field]: config.order,
  };
  // Add secondary sort by name for non-name sorts
  if (config.useSecondarySort) {
    sort.name = 1;
  }
  return sort;
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
    if (races.length) filter.race = { $in: races };
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
    if (races.length) modFilter.race = { $in: races };
    if (villages.length) modFilter.currentVillage = { $in: villages };
    if (jobs.length) modFilter.job = { $in: jobs };

    // Build sort object - MongoDB handles nulls automatically (nulls sort last)
    const sort = buildSort(sortBy);

    // Static filter options from data files
    const VILLAGES = ["Rudania", "Inariko", "Vhintl"] as const;
    // Extract race values from RACES (values are lowercase like 'gerudo', 'hylian', etc.)
    const raceOpts = RACES.map(r => r.value);
    const villageOpts = [...VILLAGES];
    // Combine regular jobs and mod jobs
    const jobOpts = [...ALL_JOBS, ...MOD_JOBS];

    // Fetch both regular and mod characters (fetch all, then combine, sort, and paginate)
    const [regularChars, modChars, regularTotal, modTotal] = await Promise.all([
      Character.find(filter).sort(sort).lean(),
      ModCharacter.find(modFilter).sort(sort).lean(),
      Character.countDocuments(filter),
      ModCharacter.countDocuments(modFilter),
    ]);

    // Combine results and add isModCharacter flag, then sort and paginate
    let combined: Array<Record<string, unknown> & { isModCharacter: boolean; name?: string }> = [
      ...regularChars.map((c) => ({ ...c, isModCharacter: false })),
      ...modChars.map((c) => ({ ...c, isModCharacter: true, status: "accepted" })),
    ];
    
    // Filter by isModCharacter if specified
    if (isModCharacterParam.length > 0) {
      const modValues = isModCharacterParam.map(v => {
        const str = String(v).toLowerCase();
        return str === "true";
      });
      console.log('[API] isModCharacter filter:', { isModCharacterParam, modValues, combinedLengthBefore: combined.length });
      combined = combined.filter((c) => {
        const isMod = c.isModCharacter === true;
        const shouldInclude = modValues.includes(isMod);
        return shouldInclude;
      });
      console.log('[API] Filtered combined length:', combined.length);
    }
    
    // Sort combined results (simple sort by the sort field)
    const sortField = buildSort(sortBy);
    const sortKey = Object.keys(sortField)[0];
    const sortOrder = sortField[sortKey];
    combined.sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      
      // Compare values
      let comparison = 0;
      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      // Apply sort order
      const result = comparison * sortOrder;
      if (result !== 0) return result;
      
      // Secondary sort by name if useSecondarySort
      if (sortKey !== "name") {
        const nameA = ((a.name as string) || "").toLowerCase();
        const nameB = ((b.name as string) || "").toLowerCase();
        return nameA.localeCompare(nameB);
      }
      return 0;
    });

    // Calculate total based on filtered results
    const total = isModCharacterParam.length > 0 
      ? combined.length 
      : regularTotal + modTotal;
    const rawData = combined.slice((page - 1) * limit, page * limit);

    const data = rawData as Array<{ userId?: string; modOwner?: string; isModCharacter?: boolean; [k: string]: unknown }>;
    // Get userIds from both regular and mod chars (mod chars also have userId field)
    const userIds = [
      ...new Set(
        data.map((c) => c.userId).filter(Boolean)
      ),
    ] as string[];
    const usernames = await fetchDiscordUsernames(userIds);

    const dataWithUsernames = data.map((c) => ({
      ...c,
      username: (c.userId && usernames[c.userId]) || undefined,
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
