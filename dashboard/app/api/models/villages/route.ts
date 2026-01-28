import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import {
  parsePaginatedQuery,
  getFilterParamMultiple,
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
    const { Village } = await import("@/models/VillageModel.js");

    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;
    const regions = getFilterParamMultiple(params, "region");

    const filter: Record<string, unknown> = {};

    const re = buildSearchRegex(search);
    if (re) {
      filter.$or = [{ name: re }, { region: re }];
    }
    // Region filter (case-insensitive)
    if (regions.length) {
      const regionFilter = buildCaseInsensitiveFilter("region", regions);
      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          regionFilter
        ];
        delete filter.$or;
      } else {
        filter.$or = regionFilter.$or;
      }
    }

    const [data, total, regionOpts] = await Promise.all([
      Village.find(filter).skip((page - 1) * limit).limit(limit).lean(),
      Village.countDocuments(filter),
      Village.distinct("region"),
    ]);

    const filterOptions: Record<string, (string | number)[]> = {
      region: (regionOpts as string[]).filter(Boolean).sort(),
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
    logger.error("api/models/villages", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch villages" },
      { status: 500 }
    );
  }
}
