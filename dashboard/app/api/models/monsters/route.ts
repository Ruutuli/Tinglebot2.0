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
    if (species.length) filter.species = { $in: species };
    if (types.length) filter.type = { $in: types };
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
