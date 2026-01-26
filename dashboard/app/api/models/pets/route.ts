import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import {
  parsePaginatedQuery,
  getFilterParamMultiple,
  getFilterParamNumeric,
  buildListResponse,
  buildSearchRegex,
} from "@/lib/api-utils";
import { logger } from "@/utils/logger";

// Uses query params (`nextUrl.searchParams`); must be dynamically rendered per-request.
// Caching is handled via `Cache-Control` response headers below.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await connect();
    const { default: Pet } = await import("@/models/PetModel.js");

    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;
    const statusRaw = getFilterParamMultiple(params, "status");
    const speciesRaw = getFilterParamMultiple(params, "species");
    const petTypeRaw = getFilterParamMultiple(params, "petType");
    const levelMin = params.get("levelMin");
    const levelMax = params.get("levelMax");
    const rollsMin = params.get("rollsMin");
    const rollsMax = params.get("rollsMax");

    const filter: Record<string, unknown> = {};

    // Search filter
    const re = buildSearchRegex(search);
    if (re) {
      filter.$or = [
        { name: re },
        { ownerName: re },
        { species: re },
        { petType: re },
      ];
    }

    // Status filter
    if (statusRaw.length === 1) {
      filter.status = statusRaw[0];
    } else if (statusRaw.length > 1) {
      filter.status = { $in: statusRaw };
    }

    // Species filter
    if (speciesRaw.length === 1) {
      filter.species = speciesRaw[0];
    } else if (speciesRaw.length > 1) {
      filter.species = { $in: speciesRaw };
    }

    // Pet type filter
    if (petTypeRaw.length === 1) {
      filter.petType = petTypeRaw[0];
    } else if (petTypeRaw.length > 1) {
      filter.petType = { $in: petTypeRaw };
    }

    // Level range filter
    const levelFilter: Record<string, number> = {};
    if (levelMin) {
      const min = parseInt(levelMin, 10);
      if (!Number.isNaN(min) && min >= 0) {
        levelFilter.$gte = min;
      }
    }
    if (levelMax) {
      const max = parseInt(levelMax, 10);
      if (!Number.isNaN(max) && max >= 0) {
        levelFilter.$lte = max;
      }
    }
    // Only apply filter if both min and max are valid and min <= max
    if (Object.keys(levelFilter).length > 0) {
      if (levelFilter.$gte !== undefined && levelFilter.$lte !== undefined) {
        if (levelFilter.$gte <= levelFilter.$lte) {
          filter.level = levelFilter;
        }
      } else {
        filter.level = levelFilter;
      }
    }

    // Rolls remaining range filter
    const rollsFilter: Record<string, number> = {};
    if (rollsMin) {
      const min = parseInt(rollsMin, 10);
      if (!Number.isNaN(min) && min >= 0) {
        rollsFilter.$gte = min;
      }
    }
    if (rollsMax) {
      const max = parseInt(rollsMax, 10);
      if (!Number.isNaN(max) && max >= 0) {
        rollsFilter.$lte = max;
      }
    }
    // Only apply filter if both min and max are valid and min <= max
    if (Object.keys(rollsFilter).length > 0) {
      if (rollsFilter.$gte !== undefined && rollsFilter.$lte !== undefined) {
        if (rollsFilter.$gte <= rollsFilter.$lte) {
          filter.rollsRemaining = rollsFilter;
        }
      } else {
        filter.rollsRemaining = rollsFilter;
      }
    }

    // Parse sort parameter
    const sortBy = params.get("sortBy") || "name";
    let sortQuery: Record<string, 1 | -1> = { name: 1 };
    
    if (sortBy === "name-desc") {
      sortQuery = { name: -1 };
    } else if (sortBy === "level-asc") {
      sortQuery = { level: 1, name: 1 };
    } else if (sortBy === "level-desc") {
      sortQuery = { level: -1, name: 1 };
    } else if (sortBy === "rolls-asc") {
      sortQuery = { rollsRemaining: 1, name: 1 };
    } else if (sortBy === "rolls-desc") {
      sortQuery = { rollsRemaining: -1, name: 1 };
    } else if (sortBy === "status") {
      sortQuery = { status: 1, name: 1 };
    } else if (sortBy === "status-desc") {
      sortQuery = { status: -1, name: 1 };
    }

    const [data, total, statusOpts, speciesOpts, petTypeOpts, levelStats, rollsStats] = await Promise.all([
      Pet.find(filter)
        .populate("owner", "name icon")
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .sort(sortQuery),
      Pet.countDocuments(filter),
      Pet.distinct("status"),
      Pet.distinct("species"),
      Pet.distinct("petType"),
      Pet.aggregate([
        { $group: { _id: null, min: { $min: "$level" }, max: { $max: "$level" } } }
      ]),
      Pet.aggregate([
        { $group: { _id: null, min: { $min: "$rollsRemaining" }, max: { $max: "$rollsRemaining" } } }
      ]),
    ]);

    // Extract min/max values for filter options
    const levelMinVal = levelStats[0]?.min ?? 0;
    const levelMaxVal = levelStats[0]?.max ?? 100;
    const rollsMinVal = rollsStats[0]?.min ?? 0;
    const rollsMaxVal = rollsStats[0]?.max ?? 100;

    // Format and sort filter options
    const filterOptions: Record<string, (string | number)[]> = {
      status: (statusOpts as string[])
        .filter((s): s is string => Boolean(s))
        .sort((a, b) => a.localeCompare(b)),
      species: (speciesOpts as string[])
        .filter((s): s is string => Boolean(s))
        .sort((a, b) => a.localeCompare(b)),
      petType: (petTypeOpts as string[])
        .filter((s): s is string => Boolean(s))
        .sort((a, b) => a.localeCompare(b)),
      levelMin: [levelMinVal],
      levelMax: [levelMaxVal],
      rollsMin: [rollsMinVal],
      rollsMax: [rollsMaxVal],
    };

    const response = NextResponse.json(
      buildListResponse({
        data,
        total,
        page,
        limit,
        filterOptions,
      })
    );

    // Add cache headers for browser/CDN caching
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    return response;
  } catch (e) {
    logger.error("api/models/pets", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch pets" },
      { status: 500 }
    );
  }
}
