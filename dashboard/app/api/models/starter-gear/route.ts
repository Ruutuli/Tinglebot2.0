// ============================================================================
// ------------------- Imports -------------------
// ============================================================================
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { parsePaginatedQuery, buildListResponse } from "@/lib/api-utils";
import { logger } from "@/utils/logger";
import mongoose, { type Model } from "mongoose";
import { STARTER_GEAR_NAMES } from "@/data/characterData";

// ============================================================================
// ------------------- Route Segment Config (Caching) -------------------
// ============================================================================
// Cache this route for 5 minutes (300 seconds) on the server
// This reduces database load by serving cached responses
export const revalidate = 300; // 5 minutes

// ============================================================================
// ------------------- GET Handler -------------------
// ============================================================================
export async function GET(req: NextRequest) {
  try {
    await connect();
    
    // ------------------- Get Item Model -------------------
    // Check if already compiled to avoid recompilation error
    let Item: Model<unknown>;
    if (mongoose.models.Item) {
      Item = mongoose.models.Item;
    } else {
      const { default: ItemModel } = await import("@/models/ItemModel.js");
      Item = ItemModel as unknown as Model<unknown>;
    }

    // ------------------- Parse Query Parameters -------------------
    const { page, limit } = parsePaginatedQuery(req);

    // ------------------- Build Filter -------------------
    // Query items that match any name in STARTER_GEAR_NAMES
    const filter = {
      itemName: { $in: STARTER_GEAR_NAMES as readonly string[] },
    };

    // ------------------- Parse Sort Parameter -------------------
    // Default to sorting by name alphabetically
    const sortQuery: Record<string, 1 | -1> = { itemName: 1 };

    // ------------------- Fetch Data -------------------
    // Select all fields needed for flip cards (same as items route)
    const [data, total] = await Promise.all([
      Item.find(filter)
        .select(
          "itemName image imageType emoji type subtype category categoryGear buyPrice sellPrice stackable maxStackSize itemRarity " +
          "gathering looting traveling exploring vending " +
          "locations locationsTags centralHyrule eldin faron gerudo hebra lanayru pathOfScarletLeaves leafDewWay " +
          "allJobs allJobsTags farmer forager rancher herbalist adventurer artist beekeeper blacksmith cook craftsman " +
          "fisherman gravekeeper guard maskMaker hunter hunterLooting mercenary miner researcher scout weaver witch " +
          "craftingMaterial crafting staminaToCraft craftingJobs craftingTags " +
          "specialWeather modifierHearts staminaRecovered"
        )
        .sort(sortQuery)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Item.countDocuments(filter),
    ]);

    // ------------------- Return Response -------------------
    const response = NextResponse.json(
      buildListResponse({
        data,
        total,
        page,
        limit,
      })
    );

    // Add cache headers for browser/CDN caching
    // Public cache for 5 minutes, stale-while-revalidate for 1 hour
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    return response;
  } catch (e) {
    logger.error("[route.ts]❌ Failed to fetch starter gear:", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch starter gear" },
      { status: 500 }
    );
  }
}
