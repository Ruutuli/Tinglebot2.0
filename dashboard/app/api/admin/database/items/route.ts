// ============================================================================
// ------------------- Admin Database API -------------------
// GET /api/admin/database/items?model=Item - Fetch all items
// PUT /api/admin/database/items - Update an item by ID
// Admin-only access required
// Supports multiple models, currently: Item
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { logger } from "@/utils/logger";
import mongoose, { type Model } from "mongoose";
import { FIELD_OPTIONS } from "@/app/(dashboard)/admin/database/constants/field-options";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type ItemDoc = {
  _id: unknown;
  itemName: string;
  image?: string;
  imageType?: string;
  emoji?: string;
  itemRarity?: number;
  buyPrice?: number;
  sellPrice?: number;
  stackable?: boolean;
  maxStackSize?: number;
  modifierHearts?: number;
  staminaRecovered?: number;
  set: (data: Record<string, unknown>) => void;
  save: () => Promise<unknown>;
  toObject: () => Record<string, unknown>;
};

type ItemLean = {
  _id: unknown;
  itemName: string;
  image?: string;
  imageType?: string;
  emoji?: string;
  itemRarity?: number;
  buyPrice?: number;
  sellPrice?: number;
  stackable?: boolean;
  maxStackSize?: number;
  modifierHearts?: number;
  staminaRecovered?: number;
  // All other ItemModel fields (will be typed as unknown for now)
  [key: string]: unknown;
};

// ============================================================================
// ------------------- GET Handler -------------------
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    // ------------------- Check Authentication -------------------
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ------------------- Check Admin Access -------------------
    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin) {
      logger.warn(
        "api/admin/database/items GET",
        `Access denied for user ${user.id} (${user.username}): not admin`
      );
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    // ------------------- Get Model Parameter -------------------
    const params = req.nextUrl.searchParams;
    const modelName = params.get("model") || "Item"; // Default to Item

    // ------------------- Connect to Database -------------------
    await connect();

    // ------------------- Get Model -------------------
    let Model: Model<unknown>;
    let sortField = "itemName";

    if (modelName === "Item") {
      // Check if already compiled to avoid recompilation error
      if (mongoose.models.Item) {
        Model = mongoose.models.Item;
      } else {
        const { default: ItemModel } = await import("@/models/ItemModel.js");
        Model = ItemModel as unknown as Model<unknown>;
      }
      sortField = "itemName";
    } else {
      return NextResponse.json(
        { error: "Invalid model", message: `Model "${modelName}" is not supported yet` },
        { status: 400 }
      );
    }

    // ------------------- Fetch All Records -------------------
    // Fetch all records sorted by itemName for consistency
    const records = (await Model.find({})
      .sort({ [sortField]: 1 })
      .lean()) as unknown as ItemLean[];

    logger.info(
      "api/admin/database/items GET",
      `Fetched ${records.length} ${modelName} records`
    );

    // ------------------- Build Filter Options -------------------
    // Extract unique values from records for dynamic filters
    const raritySet = new Set<number>();
    records.forEach((record) => {
      if (typeof record.itemRarity === "number" && !Number.isNaN(record.itemRarity)) {
        raritySet.add(record.itemRarity);
      }
    });
    const rarityOpts = Array.from(raritySet).sort((a, b) => a - b);

    const filterOptions: Record<string, (string | number)[]> = {
      category: FIELD_OPTIONS.category,
      type: FIELD_OPTIONS.type,
      categoryGear: FIELD_OPTIONS.categoryGear,
      subtype: FIELD_OPTIONS.subtype,
      rarity: rarityOpts,
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
    };

    // ------------------- Return Response -------------------
    return NextResponse.json({
      items: records,
      filterOptions,
      meta: {
        model: modelName,
        totalFetched: records.length,
      },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : undefined;
    
    logger.error(
      "api/admin/database/items GET",
      `Error: ${errorMessage}${errorStack ? `\nStack: ${errorStack}` : ""}`
    );
    
    return NextResponse.json(
      {
        error: "Failed to fetch records",
        message: errorMessage,
        details: process.env.NODE_ENV === "development" ? {
          message: errorMessage,
          stack: errorStack
        } : undefined
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// ------------------- PUT Handler -------------------
// ============================================================================

export async function PUT(req: NextRequest) {
  try {
    // ------------------- Check Authentication -------------------
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ------------------- Check Admin Access -------------------
    const isAdmin = await isAdminUser(user.id);
    if (!isAdmin) {
      logger.warn(
        "api/admin/database/items PUT",
        `Access denied for user ${user.id} (${user.username}): not admin`
      );
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    // ------------------- Parse Request Body -------------------
    const body = await req.json().catch(() => ({}));
    const { itemId, updates } = body as {
      itemId?: string;
      updates?: Record<string, unknown>;
    };

    if (!itemId || typeof itemId !== "string") {
      return NextResponse.json(
        { error: "Item ID is required" },
        { status: 400 }
      );
    }

    if (!updates || typeof updates !== "object") {
      return NextResponse.json(
        { error: "Updates object is required" },
        { status: 400 }
      );
    }

    // ------------------- Connect to Database -------------------
    await connect();

    // ------------------- Get Item Model -------------------
    let Item: Model<unknown>;
    if (mongoose.models.Item) {
      Item = mongoose.models.Item;
    } else {
      const { default: ItemModel } = await import("@/models/ItemModel.js");
      Item = ItemModel as unknown as Model<unknown>;
    }

    // ------------------- Find Item by ID -------------------
    const item = (await Item.findById(itemId)) as ItemDoc | null;
    if (!item) {
      return NextResponse.json(
        { error: "Item not found" },
        { status: 404 }
      );
    }

    // Item validation - all items can be edited

    // ------------------- Update Item Fields -------------------
    // Only update fields that are provided in updates object
    // For Item model, allow all fields from ItemModel.js
    // Sanitize and validate field values
    const allowedFields = [
      // Identity & Display
      "itemName", "image", "imageType", "emoji",
      // Classification
      "itemRarity", "category", "categoryGear", "type", "subtype", "recipeTag",
      // Economics
      "buyPrice", "sellPrice",
      // Effects / Stats
      "modifierHearts", "staminaRecovered",
      // Stack Rules
      "stackable", "maxStackSize",
      // Crafting
      "craftingMaterial", "staminaToCraft", "crafting", "craftingJobs",
      // Activities & Obtain
      "gathering", "looting", "vending", "traveling", "exploring",
      "obtain", "gatheringJobs", "lootingJobs",
      // Weather
      "specialWeather",
      // Pet Perks
      "petPerk", "petperkobtain", "petprey", "petforage", "lgpetprey",
      "petmon", "petchu", "petfirechu", "peticechu", "petelectricchu",
      // Location Metadata
      "locations", "centralHyrule", "eldin", "faron", "gerudo",
      "hebra", "lanayru", "pathOfScarletLeaves", "leafDewWay",
      // Job Flags (all 20+ job flags)
      "adventurer", "artist", "beekeeper", "blacksmith", "cook", "craftsman",
      "farmer", "fisherman", "forager", "gravekeeper", "guard", "maskMaker",
      "rancher", "herbalist", "hunter", "hunterLooting", "mercenary", "miner",
      "researcher", "scout", "weaver", "witch",
      // Boost/Item Tags
      "allJobs", "entertainerItems", "divineItems",
      // Monsters
      "monsterList", "blackBokoblin", "blueBokoblin", "cursedBokoblin", "goldenBokoblin",
      "silverBokoblin", "bokoblin", "electricChuchuLarge", "fireChuchuLarge", "iceChuchuLarge",
      "chuchuLarge", "electricChuchuMedium", "fireChuchuMedium", "iceChuchuMedium", "chuchuMedium",
      "electricChuchuSmall", "fireChuchuSmall", "iceChuchuSmall", "chuchuSmall",
      "blackHinox", "blueHinox", "hinox", "electricKeese", "fireKeese", "iceKeese", "keese",
      "blackLizalfos", "blueLizalfos", "cursedLizalfos", "electricLizalfos", "fireBreathLizalfos",
      "goldenLizalfos", "iceBreathLizalfos", "silverLizalfos", "lizalfos",
      "blueManedLynel", "goldenLynel", "silverLynel", "whiteManedLynel", "lynel",
      "blackMoblin", "blueMoblin", "cursedMoblin", "goldenMoblin", "silverMoblin", "moblin",
      "molduga", "molduking", "forestOctorok", "rockOctorok", "skyOctorok", "snowOctorok",
      "treasureOctorok", "waterOctorok", "frostPebblit", "igneoPebblit", "stonePebblit",
      "stalizalfos", "stalkoblin", "stalmoblin", "stalnox",
      "frostTalus", "igneoTalus", "luminousTalus", "rareTalus", "stoneTalus",
      "blizzardWizzrobe", "electricWizzrobe", "fireWizzrobe", "iceWizzrobe", "meteoWizzrobe", "thunderWizzrobe",
      "likeLike", "evermean", "gibdo", "horriblin", "gloomHands", "bossBokoblin",
      "mothGibdo", "littleFrox", "yigaBlademaster", "yigaFootsoldier",
      "normalBokoblin", "normalGibdo", "normalHinox", "normalHorriblin",
      "normalKeese", "normalLizalfos", "normalLynel", "normalMoblin",
    ];

    // ------------------- Update Item Fields -------------------
    // Only update fields that are provided in updates object
    // Data integrity: Preserve special characters (<, :, etc.) and only trim where necessary
    // Arrays and objects are passed through unchanged to maintain structure
    const updateData: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        // Type validation and conversion based on field type
        // Only trim specific user-input fields that should not have leading/trailing whitespace
        if (key === "itemName" && typeof value === "string") {
          updateData[key] = value.trim();
        } else if (key === "image" && typeof value === "string") {
          updateData[key] = value.trim();
        } else if (key === "imageType" && typeof value === "string") {
          updateData[key] = value.trim();
        } else if (key === "emoji" && typeof value === "string") {
          updateData[key] = value.trim();
        } else if (key === "categoryGear" && typeof value === "string") {
          // categoryGear comes from dropdown - preserve as-is (no trimming needed)
          updateData[key] = value;
        } else if (key === "itemRarity" && typeof value === "number") {
          updateData[key] = Math.max(1, Math.min(5, value)); // Clamp between 1-5
        } else if ((key === "buyPrice" || key === "sellPrice") && typeof value === "number") {
          updateData[key] = Math.max(0, value); // No negative prices
        } else if (key === "maxStackSize" && typeof value === "number") {
          updateData[key] = Math.max(1, value); // At least 1
        } else if (key === "specialWeather" && typeof value === "object" && value !== null) {
          // Handle nested specialWeather object - preserve structure
          updateData[key] = value;
        } else if (key === "craftingMaterial" && Array.isArray(value)) {
          // Handle craftingMaterial array - preserve array structure and all special characters
          updateData[key] = value;
        } else if (Array.isArray(value)) {
          // Handle array fields (category, type, subtype, etc.) - preserve all elements and special characters
          updateData[key] = value;
        } else if (typeof value === "boolean") {
          // Handle boolean fields
          updateData[key] = value;
        } else if (typeof value === "number") {
          // Handle number fields
          updateData[key] = value;
        } else if (typeof value === "string") {
          // Handle other string fields - preserve as-is (no trimming) to maintain special characters
          // Only itemName, image, imageType, and emoji are trimmed above
          updateData[key] = value;
        } else if (value === null || value === undefined) {
          // Allow null/undefined for optional fields
          updateData[key] = value;
        }
      }
    }

    // ------------------- Apply Updates -------------------
    if (Object.keys(updateData).length > 0) {
      item.set(updateData);
      await item.save();
      
      logger.info(
        "api/admin/database/items PUT",
        `Updated item ${itemId} (${item.itemName}): ${Object.keys(updateData).join(", ")}`
      );
    }

    // ------------------- Return Updated Item -------------------
    const updatedItem = typeof item.toObject === "function" 
      ? item.toObject() 
      : (item as unknown as Record<string, unknown>);

    return NextResponse.json({
      item: updatedItem,
      message: "Item updated successfully",
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : undefined;
    
    logger.error(
      "api/admin/database/items PUT",
      `Error: ${errorMessage}${errorStack ? `\nStack: ${errorStack}` : ""}`
    );
    
    return NextResponse.json(
      {
        error: "Failed to update item",
        message: errorMessage,
        details: process.env.NODE_ENV === "development" ? {
          message: errorMessage,
          stack: errorStack
        } : undefined
      },
      { status: 500 }
    );
  }
}
