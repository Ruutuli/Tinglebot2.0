// ============================================================================
// ------------------- Imports -------------------
// ============================================================================
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import {
  parsePaginatedQuery,
  getFilterParamMultiple,
  getFilterParamNumeric,
  flatFilterOptions,
  buildListResponse,
  buildSearchRegex,
} from "@/lib/api-utils";
import { logger } from "@/utils/logger";
import mongoose, { type FilterQuery, type Model } from "mongoose";

// Helper function to create case-insensitive filter conditions for string arrays
function buildCaseInsensitiveFilter(field: string, values: string[]): { $or: Array<Record<string, RegExp>> } {
  const conditions = values.map(value => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return { [field]: new RegExp(`^${escaped}$`, "i") };
  });
  return { $or: conditions };
}

// ============================================================================
// Uses query params (`nextUrl.searchParams`); must be dynamically rendered per-request.
// Caching is handled via `Cache-Control` response headers below.
export const revalidate = 3600;

// ============================================================================
// ------------------- GET Handler -------------------
// ============================================================================
export async function GET(req: NextRequest) {
  try {
    await connect();
    
    // ------------------- Get VillageShopItem Model -------------------
    // Check if already compiled to avoid recompilation error
    let VillageShopItem: Model<unknown>;
    if (mongoose.models.VillageShopItem) {
      VillageShopItem = mongoose.models.VillageShopItem;
    } else {
      const { default: VillageShopItemModel } = await import("@/models/VillageShopsModel.js");
      VillageShopItem = VillageShopItemModel as unknown as Model<unknown>;
    }

    // ------------------- Parse Query Parameters -------------------
    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;
    const categories = getFilterParamMultiple(params, "category");
    const types = getFilterParamMultiple(params, "type");
    const rarities = getFilterParamNumeric(params, "rarity");

    // ------------------- Build Filter -------------------
    const filter: FilterQuery<unknown> = {};

    // Search filter (creates $or condition)
    const re = buildSearchRegex(search);
    if (re) {
      filter.$or = [
        { itemName: re },
        { category: re },
        { type: re },
      ];
    }
    
    // Category filter (case-insensitive)
    if (categories.length) {
      const categoryFilter = buildCaseInsensitiveFilter("category", categories);
      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          categoryFilter
        ];
        delete filter.$or;
      } else {
        filter.$or = categoryFilter.$or;
      }
    }
    
    // Type filter (case-insensitive)
    if (types.length) {
      const typeFilter = buildCaseInsensitiveFilter("type", types);
      if (filter.$or || filter.$and) {
        if (!filter.$and) filter.$and = [];
        filter.$and.push(typeFilter);
      } else {
        filter.$or = typeFilter.$or;
      }
    }
    
    // Rarity filter
    if (rarities.length) {
      filter.itemRarity = { $in: rarities };
    }

    // ------------------- Parse Sort Parameter -------------------
    const sortBy = params.get("sortBy") || "name";
    let sortQuery: Record<string, 1 | -1> = { itemName: 1 };
    
    if (sortBy === "name-desc") {
      sortQuery = { itemName: -1 };
    } else if (sortBy === "price-asc") {
      sortQuery = { buyPrice: 1, itemName: 1 };
    } else if (sortBy === "price-desc") {
      sortQuery = { buyPrice: -1, itemName: 1 };
    } else if (sortBy === "rarity-asc") {
      sortQuery = { itemRarity: 1, itemName: 1 };
    } else if (sortBy === "rarity-desc") {
      sortQuery = { itemRarity: -1, itemName: 1 };
    } else if (sortBy === "stock-asc") {
      sortQuery = { stock: 1, itemName: 1 };
    } else if (sortBy === "stock-desc") {
      sortQuery = { stock: -1, itemName: 1 };
    }

    // ------------------- Fetch Data -------------------
    const [data, total, categoryOpts, typeOpts, rarityOpts] = await Promise.all([
      VillageShopItem.find(filter)
        .sort(sortQuery)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      VillageShopItem.countDocuments(filter),
      VillageShopItem.distinct("category"),
      VillageShopItem.distinct("type"),
      VillageShopItem.distinct("itemRarity"),
    ]);

    // ------------------- Build Filter Options -------------------
    const filterOptions: Record<string, (string | number)[]> = {
      category: flatFilterOptions(categoryOpts as unknown[]),
      type: flatFilterOptions(typeOpts as unknown[]),
      rarity: (rarityOpts as number[]).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b),
    };

    // ------------------- Return Response -------------------
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
    logger.error("[route.ts]❌ Failed to fetch village shop items:", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch village shop items" },
      { status: 500 }
    );
  }
}
