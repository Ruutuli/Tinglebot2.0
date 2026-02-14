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

// Helper function to create case-insensitive filter conditions for string arrays
// For array fields (type, category, subtype), MongoDB will match if any element matches the regex
// For single string fields (categoryGear), MongoDB will match the field value directly
function buildCaseInsensitiveFilter(field: string, values: string[]): { $or: Array<Record<string, RegExp>> } {
  const conditions = values.map(value => {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Use regex with anchors for exact case-insensitive matching
    // MongoDB will automatically match array elements when field is an array
    return { [field]: new RegExp(`^${escaped}$`, "i") };
  });
  return { $or: conditions };
}

// Uses query params (`nextUrl.searchParams`); must be dynamically rendered per-request.
// Caching is handled via `Cache-Control` response headers below.
export const dynamic = "force-dynamic";

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
    const { page, limit, search } = parsePaginatedQuery(req);
    const params = req.nextUrl.searchParams;
    const categories = getFilterParamMultiple(params, "category");
    const types = getFilterParamMultiple(params, "type");
    const categoryGears = getFilterParamMultiple(params, "categoryGear");
    const subtypes = getFilterParamMultiple(params, "subtype");
    const rarities = getFilterParamNumeric(params, "rarity");
    const sources = getFilterParamMultiple(params, "source");
    const locations = getFilterParamMultiple(params, "location");
    const jobs = getFilterParamMultiple(params, "job");
    const craftableParam = params.get("craftable");
    const stackableParam = params.get("stackable");
    const entertainerItemsParam = params.get("entertainerItems");
    const divineItemsParam = params.get("divineItems");
    
    // Parse craftable and stackable - if multiple values, check if both true and false are present
    let craftable: string | null = null;
    let stackable: string | null = null;
    let entertainerItems: string | null = null;
    let divineItems: string | null = null;
    
    if (craftableParam) {
      const craftableValues = craftableParam.split(",");
      const hasTrue = craftableValues.includes("true");
      const hasFalse = craftableValues.includes("false");
      // Only apply filter if not both are selected
      if (hasTrue && !hasFalse) craftable = "true";
      else if (hasFalse && !hasTrue) craftable = "false";
      // If both are selected, craftable remains null (no filter)
    }
    
    if (stackableParam) {
      const stackableValues = stackableParam.split(",");
      const hasTrue = stackableValues.includes("true");
      const hasFalse = stackableValues.includes("false");
      // Only apply filter if not both are selected
      if (hasTrue && !hasFalse) stackable = "true";
      else if (hasFalse && !hasTrue) stackable = "false";
      // If both are selected, stackable remains null (no filter)
    }
    
    if (entertainerItemsParam) {
      const v = entertainerItemsParam.split(",");
      const hasTrue = v.includes("true");
      const hasFalse = v.includes("false");
      if (hasTrue && !hasFalse) entertainerItems = "true";
      else if (hasFalse && !hasTrue) entertainerItems = "false";
    }
    
    if (divineItemsParam) {
      const v = divineItemsParam.split(",");
      const hasTrue = v.includes("true");
      const hasFalse = v.includes("false");
      if (hasTrue && !hasFalse) divineItems = "true";
      else if (hasFalse && !hasTrue) divineItems = "false";
    }

    // ------------------- Build Filter -------------------
    const filter: Record<string, unknown> = {};
    const orConditions: Record<string, unknown>[] = [];

    // Exclude old maps (Map #1, Map #2, ...) from the items model page
    filter.itemName = { $not: /^Map #\d+$/ };

    // Search filter (creates $or condition)
    const re = buildSearchRegex(search);
    if (re) {
      orConditions.push({
        $or: [
          { itemName: re },
          { category: re },
          { type: re },
        ],
      });
    }
    
    // Category filter (case-insensitive)
    if (categories.length) {
      const categoryFilter = buildCaseInsensitiveFilter("category", categories);
      // Add to orConditions array which will be combined with $and at the end
      orConditions.push(categoryFilter);
    }
    
    // Type filter (case-insensitive)
    if (types.length) {
      const typeFilter = buildCaseInsensitiveFilter("type", types);
      // Add to orConditions array which will be combined with $and at the end
      orConditions.push(typeFilter);
    }
    
    // CategoryGear filter (case-insensitive, single string field)
    if (categoryGears.length) {
      const categoryGearFilter = buildCaseInsensitiveFilter("categoryGear", categoryGears);
      // Add to orConditions array which will be combined with $and at the end
      orConditions.push(categoryGearFilter);
    }
    
    // Subtype filter (case-insensitive, array field)
    if (subtypes.length) {
      const subtypeFilter = buildCaseInsensitiveFilter("subtype", subtypes);
      // Add to orConditions array which will be combined with $and at the end
      orConditions.push(subtypeFilter);
    }
    
    // Rarity filter
    if (rarities.length) {
      filter.itemRarity = { $in: rarities };
    }
    
    // Source filters (gathering, looting, traveling, exploring, vending, crafting, special weather, pet perk)
    if (sources.length) {
      const sourceConditions: Record<string, unknown>[] = [];
      sources.forEach((source) => {
        const normalizedSource = source.toLowerCase();
        if (normalizedSource === "gathering") sourceConditions.push({ gathering: true });
        else if (normalizedSource === "looting") sourceConditions.push({ looting: true });
        else if (normalizedSource === "traveling") sourceConditions.push({ traveling: true });
        else if (normalizedSource === "exploring") sourceConditions.push({ exploring: true });
        else if (normalizedSource === "vending") sourceConditions.push({ vending: true });
        else if (normalizedSource === "crafting") sourceConditions.push({ crafting: true });
        else if (normalizedSource === "special weather" || normalizedSource === "specialweather") {
          // Special Weather: check if any special weather flag is true
          sourceConditions.push({
            $or: [
              { "specialWeather.muggy": true },
              { "specialWeather.flowerbloom": true },
              { "specialWeather.fairycircle": true },
              { "specialWeather.jubilee": true },
              { "specialWeather.meteorShower": true },
              { "specialWeather.rockslide": true },
              { "specialWeather.avalanche": true },
            ],
          });
        } else if (normalizedSource === "pet perk" || normalizedSource === "petperk") sourceConditions.push({ petPerk: true });
      });
      if (sourceConditions.length) {
        orConditions.push({ $or: sourceConditions });
      }
    }
    
    // Location filters
    if (locations.length) {
      const locationConditions: Record<string, boolean>[] = [];
      locations.forEach((location) => {
        const normalizedLocation = location.toLowerCase().replace(/\s+/g, "");
        if (normalizedLocation === "centralhyrule") locationConditions.push({ centralHyrule: true });
        else if (normalizedLocation === "eldin") locationConditions.push({ eldin: true });
        else if (normalizedLocation === "faron") locationConditions.push({ faron: true });
        else if (normalizedLocation === "gerudo") locationConditions.push({ gerudo: true });
        else if (normalizedLocation === "hebra") locationConditions.push({ hebra: true });
        else if (normalizedLocation === "lanayru") locationConditions.push({ lanayru: true });
        else if (normalizedLocation === "pathofscarletleaves") locationConditions.push({ pathOfScarletLeaves: true });
        else if (normalizedLocation === "leafdewway") locationConditions.push({ leafDewWay: true });
      });
      if (locationConditions.length) {
        orConditions.push({ $or: locationConditions });
      }
    }
    
    // Job filters
    if (jobs.length) {
      const jobConditions: Record<string, boolean>[] = [];
      jobs.forEach((job) => {
        const normalizedJob = job.toLowerCase();
        const jobMap: Record<string, string> = {
          farmer: "farmer",
          forager: "forager",
          rancher: "rancher",
          herbalist: "herbalist",
          adventurer: "adventurer",
          artist: "artist",
          beekeeper: "beekeeper",
          blacksmith: "blacksmith",
          cook: "cook",
          craftsman: "craftsman",
          fisherman: "fisherman",
          gravekeeper: "gravekeeper",
          guard: "guard",
          "mask maker": "maskMaker",
          maskmaker: "maskMaker",
          hunter: "hunter",
          "hunter (looting)": "hunterLooting",
          hunterlooting: "hunterLooting",
          mercenary: "mercenary",
          miner: "miner",
          researcher: "researcher",
          scout: "scout",
          weaver: "weaver",
          witch: "witch",
        };
        const fieldName = jobMap[normalizedJob];
        if (fieldName) {
          jobConditions.push({ [fieldName]: true });
        }
      });
      if (jobConditions.length) {
        orConditions.push({ $or: jobConditions });
      }
    }
    
    // Craftable filter (if both true and false are selected, don't filter)
    if (craftable === "true") {
      filter.craftingMaterial = { $exists: true, $ne: [] };
    } else if (craftable === "false") {
      orConditions.push({
        $or: [
          { craftingMaterial: { $exists: false } },
          { craftingMaterial: [] },
          { craftingMaterial: null },
        ],
      });
    }
    // If craftable contains both "true" and "false", don't add filter (show all)
    
    // Stackable filter (if both true and false are selected, don't filter)
    if (stackable === "true") {
      filter.stackable = true;
    } else if (stackable === "false") {
      filter.stackable = false;
    }
    // If stackable contains both "true" and "false", don't add filter (show all)
    
    // Entertainer items filter
    if (entertainerItems === "true") {
      filter.entertainerItems = true;
    } else if (entertainerItems === "false") {
      orConditions.push({
        $or: [
          { entertainerItems: { $ne: true } },
          { entertainerItems: { $exists: false } },
        ],
      });
    }
    
    // Divine items filter
    if (divineItems === "true") {
      filter.divineItems = true;
    } else if (divineItems === "false") {
      orConditions.push({
        $or: [
          { divineItems: { $ne: true } },
          { divineItems: { $exists: false } },
        ],
      });
    }
    
    // Combine $or conditions with $and if we have multiple
    let finalFilter: Record<string, unknown> = filter;
    if (orConditions.length > 0) {
      if (orConditions.length === 1 && Object.keys(filter).length === 0) {
        // Only one $or condition and no other filters - use it directly
        finalFilter = orConditions[0];
      } else {
        // Multiple $or conditions or mix with direct filters - use $and
        const allConditions = [...orConditions];
        if (Object.keys(filter).length > 0) {
          allConditions.push({ ...filter });
        }
        finalFilter = { $and: allConditions };
      }
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
    }

    // ------------------- Fetch Data -------------------
    // Select all fields needed for flip cards
    // Note: For optimal performance with 700+ items, ensure MongoDB indexes exist on:
    // - itemName (for search)
    // - category (for filtering)
    // - type (for filtering)
    // - itemRarity (for filtering)
    const [data, total, categoryOpts, typeOpts, rarityOpts, categoryGearOpts, subtypeOpts] = await Promise.all([
      Item.find(finalFilter)
        .select(
          "itemName image imageType emoji type subtype category categoryGear buyPrice sellPrice stackable maxStackSize itemRarity " +
          "gathering looting traveling exploring vending crafting petPerk " +
          "locations centralHyrule eldin faron gerudo hebra lanayru pathOfScarletLeaves leafDewWay " +
          "allJobs farmer forager rancher herbalist adventurer artist beekeeper blacksmith cook craftsman " +
          "fisherman gravekeeper guard maskMaker hunter hunterLooting mercenary miner researcher scout weaver witch " +
          "craftingMaterial crafting staminaToCraft craftingJobs " +
          "specialWeather modifierHearts staminaRecovered " +
          "entertainerItems divineItems"
        )
        .sort(sortQuery)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Item.countDocuments(finalFilter),
      Item.distinct("category"),
      Item.distinct("type"),
      Item.distinct("itemRarity"),
      Item.distinct("categoryGear"),
      Item.distinct("subtype"),
    ]);

    // ------------------- Build Filter Options -------------------
    const filterOptions: Record<string, (string | number)[]> = {
      category: flatFilterOptions(categoryOpts as unknown[]),
      type: flatFilterOptions(typeOpts as unknown[]),
      rarity: (rarityOpts as number[]).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b),
      categoryGear: flatFilterOptions(categoryGearOpts as unknown[]),
      subtype: flatFilterOptions(subtypeOpts as unknown[]),
      source: ["Gathering", "Looting", "Traveling", "Exploring", "Vending", "Crafting", "Special Weather", "Pet Perk"],
      location: [
        "Central Hyrule",
        "Eldin",
        "Faron",
        "Gerudo",
        "Hebra",
        "Lanayru",
        "Path of Scarlet Leaves",
        "Leaf Dew Way",
      ],
      job: [
        "Farmer",
        "Forager",
        "Rancher",
        "Herbalist",
        "Adventurer",
        "Artist",
        "Beekeeper",
        "Blacksmith",
        "Cook",
        "Craftsman",
        "Fisherman",
        "Gravekeeper",
        "Guard",
        "Mask Maker",
        "Hunter",
        "Hunter (Looting)",
        "Mercenary",
        "Miner",
        "Researcher",
        "Scout",
        "Weaver",
        "Witch",
      ],
      craftable: ["true", "false"],
      stackable: ["true", "false"],
      entertainerItems: ["true", "false"],
      divineItems: ["true", "false"],
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
    // Public cache for 5 minutes, stale-while-revalidate for 1 hour
    // This allows browsers/CDNs to cache responses and serve stale content
    // while revalidating in the background
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    return response;
  } catch (e) {
    logger.error("[route.ts]❌ Failed to fetch items:", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch items" },
      { status: 500 }
    );
  }
}
