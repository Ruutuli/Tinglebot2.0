// GET /api/characters/my-ocs — paginated list of current user's characters

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import {
  parsePaginatedQuery,
  getFilterParamMultiple,
  buildListResponse,
  buildSearchRegex,
} from "@/lib/api-utils";
import { logger } from "@/utils/logger";

// ------------------- Sort config (matches models/characters) -------------------

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
  if (config.useSecondarySort) {
    sort.name = 1;
  }
  return sort;
}

// ------------------- GET handler -------------------

// Uses session cookies; must be dynamically rendered per-request.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connect();
    
    let Character, ModCharacter;
    try {
      const CharacterModule = await import("@/models/CharacterModel.js");
      const ModCharacterModule = await import("@/models/ModCharacterModel.js");
      // Handle both ESM default export and CommonJS module.exports
      // CommonJS modules imported via dynamic import have the export as .default
      Character = CharacterModule.default || CharacterModule;
      ModCharacter = ModCharacterModule.default || ModCharacterModule;
      
      // Verify the models have the expected methods
      if (!Character || typeof Character.find !== 'function') {
        const debugInfo = {
          hasCharacter: !!Character,
          characterType: typeof Character,
          characterKeys: Character ? Object.keys(Character) : []
        };
        logger.error("api/characters/my-ocs", `Character model invalid or missing find method: ${JSON.stringify(debugInfo)}`);
        return NextResponse.json(
          { error: "Character model not available" },
          { status: 500 }
        );
      }
      
      if (!ModCharacter || typeof ModCharacter.find !== 'function') {
        const debugInfo = {
          hasModCharacter: !!ModCharacter,
          modCharacterType: typeof ModCharacter,
          modCharacterKeys: ModCharacter ? Object.keys(ModCharacter) : []
        };
        logger.error("api/characters/my-ocs", `ModCharacter model invalid or missing find method: ${JSON.stringify(debugInfo)}`);
        return NextResponse.json(
          { error: "ModCharacter model not available" },
          { status: 500 }
        );
      }
    } catch (importError) {
      const errorMsg = importError instanceof Error ? importError.message : String(importError);
      logger.error("api/characters/my-ocs", `Failed to import models: ${errorMsg}`);
      return NextResponse.json(
        { error: "Failed to load character models" },
        { status: 500 }
      );
    }

    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;
    const races = getFilterParamMultiple(params, "race");
    const villages = getFilterParamMultiple(params, "village");
    const jobs = getFilterParamMultiple(params, "job");
    const sortBy = params.get("sortBy") || "name";

    const filter: Record<string, unknown> = { userId: user.id };

    // If "pendingOnly" is set, only return characters that are not 'accepted'
    // This includes characters with status: null (drafts), 'pending', or 'needs_changes'
    // When pendingOnly is NOT set, return ALL characters (no status filter)
    const pendingOnly = params.get("pendingOnly") === "true";
    const statusConditions: Array<Record<string, unknown>> = [];
    if (pendingOnly) {
      // Explicitly include all non-accepted statuses: null (draft), 'pending', 'needs_changes'
      // Also handle cases where status field might be missing or undefined
      statusConditions.push(
        { status: null },
        { status: { $exists: false } }, // Field doesn't exist
        { status: "pending" },
        { status: "needs_changes" }
      );
    }
    // When pendingOnly is false/not set, no status filter is applied - returns ALL characters

    const re = buildSearchRegex(search);
    const searchConditions: Array<Record<string, unknown>> = [];
    if (re) {
      searchConditions.push(
        { name: re },
        { job: re },
        { race: re },
        { currentVillage: re },
        { homeVillage: re },
      );
    }

    // Combine status and search conditions properly
    if (statusConditions.length > 0 && searchConditions.length > 0) {
      filter.$and = [
        { $or: statusConditions },
        { $or: searchConditions }
      ];
    } else if (statusConditions.length > 0) {
      filter.$or = statusConditions;
    } else if (searchConditions.length > 0) {
      filter.$or = searchConditions;
    }
    if (races.length) filter.race = { $in: races };
    if (villages.length) filter.currentVillage = { $in: villages };
    if (jobs.length) filter.job = { $in: jobs };

    const sort = buildSort(sortBy);

    // Build mod character filter (userId matches user.id - mod characters also have userId field)
    const modFilter: Record<string, unknown> = { userId: user.id };
    
    // Apply pendingOnly filter to mod characters as well
    // This includes characters with status: null (drafts), 'pending', or 'needs_changes'
    // When pendingOnly is NOT set, return ALL characters (no status filter)
    const modStatusConditions: Array<Record<string, unknown>> = [];
    if (pendingOnly) {
      // Explicitly include all non-accepted statuses: null (draft), 'pending', 'needs_changes'
      // Also handle cases where status field might be missing or undefined
      modStatusConditions.push(
        { status: null },
        { status: { $exists: false } }, // Field doesn't exist
        { status: "pending" },
        { status: "needs_changes" }
      );
    }
    // When pendingOnly is false/not set, no status filter is applied - returns ALL characters
    
    const modSearchConditions: Array<Record<string, unknown>> = [];
    if (re) {
      modSearchConditions.push(
        { name: re },
        { job: re },
        { race: re },
        { currentVillage: re },
        { homeVillage: re },
      );
    }

    // Combine status and search conditions properly for mod characters
    if (modStatusConditions.length > 0 && modSearchConditions.length > 0) {
      modFilter.$and = [
        { $or: modStatusConditions },
        { $or: modSearchConditions }
      ];
    } else if (modStatusConditions.length > 0) {
      modFilter.$or = modStatusConditions;
    } else if (modSearchConditions.length > 0) {
      modFilter.$or = modSearchConditions;
    }
    if (races.length) modFilter.race = { $in: races };
    if (villages.length) modFilter.currentVillage = { $in: villages };
    if (jobs.length) modFilter.job = { $in: jobs };

    // Log the filter for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      logger.info("api/characters/my-ocs", `Filter: ${JSON.stringify(filter)}`);
      logger.info("api/characters/my-ocs", `ModFilter: ${JSON.stringify(modFilter)}`);
    }

    // Fetch both regular and mod characters (fetch enough to fill the page after combining)
    const [regularChars, modChars, regularTotal, modTotal, raceOpts, villageOpts, jobOpts] = await Promise.all([
      Character.find(filter).sort(sort).lean(),
      ModCharacter.find(modFilter).sort(sort).lean(),
      Character.countDocuments(filter),
      ModCharacter.countDocuments(modFilter),
      // Combine distinct values from both collections
      Promise.all([
        Character.distinct("race", filter),
        ModCharacter.distinct("race", modFilter),
      ]).then(([r1, r2]) => [...new Set([...r1, ...r2])]),
      Promise.all([
        Character.distinct("currentVillage", filter),
        ModCharacter.distinct("currentVillage", modFilter),
      ]).then(([v1, v2]) => [...new Set([...v1, ...v2])]),
      Promise.all([
        Character.distinct("job", filter),
        ModCharacter.distinct("job", modFilter),
      ]).then(([j1, j2]) => [...new Set([...j1, ...j2])]),
    ]);

    // Combine results and add isModCharacter flag, then sort and paginate
    // Preserve character's actual status (including null for drafts) for both regular and mod characters
    const combined: Array<Record<string, unknown> & { isModCharacter: boolean; name?: string }> = [
      ...regularChars.map((c) => ({ 
        ...c, 
        isModCharacter: false,
        // Explicitly preserve status field - keep null as null for drafts
        // Only default to "accepted" if status is undefined (old characters without status field)
        status: c.status !== undefined ? c.status : "accepted"
      })),
      ...modChars.map((c) => ({ 
        ...c, 
        isModCharacter: true,
        // Preserve the mod character's actual status (can be null/draft, 'pending', 'needs_changes', or 'accepted')
        // Keep null as null so draft characters show up in the "In Review" section
        // Only default to "accepted" if status is undefined (old characters without status field)
        status: c.status !== undefined ? c.status : "accepted"
      })),
    ];
    
    // Log status distribution for debugging (only in development)
    if (process.env.NODE_ENV === 'development') {
      const statusCounts: Record<string, number> = combined.reduce((acc: Record<string, number>, c) => {
        const status: string = c.status === null ? 'null' : (typeof c.status === 'string' ? c.status : 'undefined');
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      logger.info("api/characters/my-ocs", `Status distribution: ${JSON.stringify(statusCounts)}`);
      logger.info("api/characters/my-ocs", `Total characters returned: ${combined.length}`);
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

    const total = regularTotal + modTotal;
    const rawData = combined.slice((page - 1) * limit, page * limit);

    const filterOptions: Record<string, (string | number)[]> = {
      race: (raceOpts as string[]).filter(Boolean).sort(),
      village: (villageOpts as string[]).filter(Boolean).sort(),
      job: (jobOpts as string[]).filter(Boolean).sort(),
    };

    const response = NextResponse.json(
      buildListResponse({
        data: rawData,
        total,
        page,
        limit,
        filterOptions,
      })
    );

    // Add cache headers - private cache since this is user-specific
    response.headers.set(
      "Cache-Control",
      "private, s-maxage=60, stale-while-revalidate=120"
    );

    return response;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : undefined;
    const fullError = errorStack ? `${errorMessage}\n${errorStack}` : errorMessage;
    logger.error("api/characters/my-ocs", fullError);
    return NextResponse.json(
      { 
        error: "Failed to fetch your characters",
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}
