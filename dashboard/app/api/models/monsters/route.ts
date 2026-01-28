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
    const { default: Monster } = await import("@/models/MonsterModel.js");

    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;
    const species = getFilterParamMultiple(params, "species");
    const types = getFilterParamMultiple(params, "type");
    const tiers = getFilterParamNumeric(params, "tier");

    const filter: Record<string, unknown> = {};

    const re = buildSearchRegex(search);
    if (re) {
      filter.$or = [
        { name: re },
        { nameMapping: re },
        { species: re },
        { type: re },
      ];
    }
    // Case-insensitive filtering for string-based filters
    if (species.length) {
      const speciesFilter = buildCaseInsensitiveFilter("species", species);
      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          speciesFilter
        ];
        delete filter.$or;
      } else {
        filter.$or = speciesFilter.$or;
      }
    }
    if (types.length) {
      const typeFilter = buildCaseInsensitiveFilter("type", types);
      if (filter.$or || filter.$and) {
        if (!filter.$and) filter.$and = [];
        filter.$and.push(typeFilter);
      } else {
        filter.$or = typeFilter.$or;
      }
    }
    if (tiers.length) filter.tier = { $in: tiers };

    const [data, total, speciesOpts, typeOpts, tierOpts] = await Promise.all([
      Monster.find(filter).skip((page - 1) * limit).limit(limit).lean(),
      Monster.countDocuments(filter),
      Monster.distinct("species"),
      Monster.distinct("type"),
      Monster.distinct("tier"),
    ]);

    const filterOptions: Record<string, (string | number)[]> = {
      species: (speciesOpts as string[]).filter(Boolean).sort(),
      type: (typeOpts as string[]).filter(Boolean).sort(),
      tier: (tierOpts as number[]).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b),
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
    logger.error("api/models/monsters", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch monsters" },
      { status: 500 }
    );
  }
}
