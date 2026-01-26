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
import mongoose, { type Model } from "mongoose";

// ============================================================================
// ------------------- Route Segment Config (Caching) -------------------
// ============================================================================
// Cache this route for 5 minutes (300 seconds) on the server
export const revalidate = 300;

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
    const filter: Record<string, unknown> = {};

    // Search filter (creates $or condition)
    const re = buildSearchRegex(search);
    if (re) {
      filter.$or = [
        { itemName: re },
        { category: re },
        { type: re },
      ];
    }
    
    // Category filter
    if (categories.length) {
      filter.category = { $in: categories };
    }
    
    // Type filter
    if (types.length) {
      filter.type = { $in: types };
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
