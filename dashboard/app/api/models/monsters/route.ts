import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import type { FilterQuery } from "mongoose";
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
export const revalidate = 3600;

export async function GET(req: NextRequest) {
  try {
    await connect();
    const MonsterModule = await import("@/models/MonsterModel.js");
    const Monster = (mongoose.models.Monster ?? MonsterModule.default) as mongoose.Model<unknown>;
    const monsterMapping = MonsterModule.monsterMapping as Record<string, { name?: string; image?: string }> | undefined;

    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;
    const species = getFilterParamMultiple(params, "species");
    const types = getFilterParamMultiple(params, "type");
    const tiers = getFilterParamNumeric(params, "tier");

    const filter: FilterQuery<unknown> = {};

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

    const sortBy = params.get("sortBy") || "name";
    let sortQuery: Record<string, 1 | -1> = { name: 1 };
    if (sortBy === "name-desc") sortQuery = { name: -1 };
    else if (sortBy === "tier-asc") sortQuery = { tier: 1, name: 1 };
    else if (sortBy === "tier-desc") sortQuery = { tier: -1, name: 1 };
    else if (sortBy === "species") sortQuery = { species: 1, name: 1 };
    else if (sortBy === "species-desc") sortQuery = { species: -1, name: 1 };
    else if (sortBy === "hearts-asc") sortQuery = { hearts: 1, name: 1 };
    else if (sortBy === "hearts-desc") sortQuery = { hearts: -1, name: 1 };
    else if (sortBy === "dmg-asc") sortQuery = { dmg: 1, name: 1 };
    else if (sortBy === "dmg-desc") sortQuery = { dmg: -1, name: 1 };

    const [data, total, speciesOpts, typeOpts, tierOpts] = await Promise.all([
      Monster.find(filter).sort(sortQuery).skip((page - 1) * limit).limit(limit).lean(),
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

    // Resolve image from monsterMapping when document has no image or "No Image"
    const dataWithImages = (data as Array<{ nameMapping?: string; image?: string; [k: string]: unknown }>).map((doc) => {
      const hasNoImage = !doc.image || doc.image === "No Image";
      const key = doc.nameMapping?.replace(/\s+/g, "");
      const mappedImage = key != null ? monsterMapping?.[key]?.image : undefined;
      return { ...doc, image: hasNoImage && mappedImage ? mappedImage : doc.image };
    });

    const response = NextResponse.json(
      buildListResponse({
        data: dataWithImages,
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
    const message = e instanceof Error ? e.message : String(e);
    logger.error("api/models/monsters", message);
    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      { error: isDev ? message : "Failed to fetch monsters", details: isDev ? message : undefined },
      { status: 500 }
    );
  }
}
