// ============================================================================
// ------------------- GET /api/inventories/aggregated -------------------
// ============================================================================
// Get aggregated inventory data across all user's characters

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type CharacterWithModFlag = {
  _id: unknown;
  name: string;
  isModCharacter: boolean;
};

type InventoryEntry = {
  itemName: string;
  characterName: string;
  quantity: number;
  category?: unknown;
  type?: unknown;
  image?: string;
};

type ItemDetail = {
  itemName: string;
  category?: unknown;
  type?: unknown;
  image?: string;
};

type AggregatedItem = {
  itemName: string;
  total: number;
  characters: Array<{ characterName: string; quantity: number }>;
  category: string[];
  type: string[];
  image?: string;
};

type CharacterSelectDoc = {
  _id: mongoose.Types.ObjectId;
  name: string;
};

type CharacterModel = {
  find: (query: { userId: string }) => {
    select: (fields: string) => {
      lean: () => Promise<CharacterSelectDoc[]>;
    };
  };
};

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- normalizeError ------------------
// Normalize error to Error instance for consistent handling
function normalizeError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

// ------------------- normalizeArrayField ------------------
// Normalize a field to string array (handles array, single value, or undefined)
function normalizeArrayField(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  if (value !== undefined && value !== null) {
    return [String(value)];
  }
  return [];
}

// ------------------- loadCharacterModels ------------------
// Load Character and ModCharacter models with error handling
async function loadCharacterModels(): Promise<{
  Character: CharacterModel;
  ModCharacter: CharacterModel;
}> {
  try {
    const CharacterModule = await import("@/models/CharacterModel.js");
    const ModCharacterModule = await import("@/models/ModCharacterModel.js");
    const Character = (CharacterModule.default || CharacterModule) as unknown as CharacterModel;
    const ModCharacter = (ModCharacterModule.default || ModCharacterModule) as unknown as CharacterModel;
    return { Character, ModCharacter };
  } catch (importError) {
    const error = normalizeError(importError);
    logger.error("[aggregated/route.ts] ❌ Failed to import character models:", error.message);
    throw new Error(`Failed to load character models: ${error.message}`);
  }
}

// ------------------- loadItemModel ------------------
// Load Item model with error handling
async function loadItemModel(): Promise<mongoose.Model<unknown>> {
  try {
    if (mongoose.models.Item) {
      return mongoose.models.Item;
    }
    const { default: ItemModel } = await import("@/models/ItemModel.js");
    return ItemModel as unknown as mongoose.Model<unknown>;
  } catch (importError) {
    const error = normalizeError(importError);
    logger.error("[aggregated/route.ts] ❌ Failed to import Item model:", error.message);
    throw new Error(`Failed to load Item model: ${error.message}`);
  }
}

// ------------------- collectInventoryData ------------------
// Collect inventory data from all characters and build item maps
async function collectInventoryData(
  characters: CharacterWithModFlag[],
  db: ReturnType<typeof getInventoriesDb> extends Promise<infer T> ? T : never
): Promise<{
  uniqueItemNames: Set<string>;
  inventoryDataByItem: Map<string, InventoryEntry[]>;
}> {
  const uniqueItemNames = new Set<string>();
  const inventoryDataByItem = new Map<string, InventoryEntry[]>();

  for (const character of characters) {
    try {
      const collectionName = character.name.toLowerCase();
      const collection = db.collection(collectionName);
      const charId = typeof character._id === "string"
        ? new mongoose.Types.ObjectId(character._id)
        : character._id;
      const inventoryItems = await collection
        .find({ characterId: charId, quantity: { $gt: 0 } })
        .toArray();

      for (const item of inventoryItems) {
        const itemName = String(item.itemName || "");
        if (!itemName) continue;

        const itemNameLower = itemName.toLowerCase();
        uniqueItemNames.add(itemName);

        if (!inventoryDataByItem.has(itemNameLower)) {
          inventoryDataByItem.set(itemNameLower, []);
        }

        inventoryDataByItem.get(itemNameLower)!.push({
          itemName,
          characterName: character.name,
          quantity: Number(item.quantity) || 0,
          category: item.category,
          type: item.type,
          image: item.image ? String(item.image) : undefined,
        });
      }
    } catch (error) {
      const err = normalizeError(error);
      logger.warn(
        "[aggregated/route.ts]",
        `⚠️ Error processing inventory for ${character.name}: ${err.message}`
      );
    }
  }

  return { uniqueItemNames, inventoryDataByItem };
}

// ------------------- fetchItemDetails ------------------
// Fetch item details from Item model
async function fetchItemDetails(
  Item: mongoose.Model<unknown>,
  uniqueItemNames: Set<string>
): Promise<ItemDetail[]> {
  if (uniqueItemNames.size === 0) {
    return [];
  }

  try {
    const itemDetails = await Item.find({
      itemName: { $in: Array.from(uniqueItemNames) },
    })
      .select("itemName category type image")
      .lean();

    return itemDetails as unknown as ItemDetail[];
  } catch (queryError) {
    const error = normalizeError(queryError);
    logger.error("[aggregated/route.ts] ❌ Failed to query items:", error.message);
    throw new Error(`Failed to query items: ${error.message}`);
  }
}

// ------------------- aggregateItems ------------------
// Aggregate inventory data into final item list
function aggregateItems(
  inventoryDataByItem: Map<string, InventoryEntry[]>,
  itemsMap: Map<string, ItemDetail>
): AggregatedItem[] {
  const itemMap = new Map<string, AggregatedItem>();

  for (const [itemNameLower, inventoryEntries] of inventoryDataByItem.entries()) {
    const originalItemName = inventoryEntries[0]?.itemName || itemNameLower;
    const itemDetails = itemsMap.get(itemNameLower);

    const category = normalizeArrayField(
      itemDetails?.category ?? inventoryEntries[0]?.category
    );
    const type = normalizeArrayField(itemDetails?.type ?? inventoryEntries[0]?.type);
    const total = inventoryEntries.reduce((sum, entry) => sum + entry.quantity, 0);

    itemMap.set(itemNameLower, {
      itemName: originalItemName,
      total,
      characters: inventoryEntries.map((entry) => ({
        characterName: entry.characterName,
        quantity: entry.quantity,
      })),
      category,
      type,
      image: itemDetails?.image || inventoryEntries[0]?.image,
    });
  }

  return Array.from(itemMap.values()).sort((a, b) =>
    a.itemName.localeCompare(b.itemName)
  );
}

// ============================================================================
// ------------------- API Route Handler -------------------
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connect();

    // Load character models
    const { Character, ModCharacter } = await loadCharacterModels();

    // Get user's characters (both regular and mod)
    const [regularChars, modChars] = await Promise.all([
      Character.find({ userId: user.id }).select("_id name").lean(),
      ModCharacter.find({ userId: user.id }).select("_id name").lean(),
    ]);

    const allCharacters: CharacterWithModFlag[] = [
      ...regularChars.map((c) => ({ ...c, isModCharacter: false })),
      ...modChars.map((c) => ({ ...c, isModCharacter: true })),
    ];

    // Connect to inventories database
    const db = await getInventoriesDb();

    // Collect inventory data from all characters
    const { uniqueItemNames, inventoryDataByItem } = await collectInventoryData(
      allCharacters,
      db
    );

    // Load Item model and fetch item details
    const Item = await loadItemModel();
    const itemDetails = await fetchItemDetails(Item, uniqueItemNames);

    // Create map of item details
    const itemsMap = new Map<string, ItemDetail>();
    itemDetails.forEach((item) => {
      itemsMap.set(item.itemName.toLowerCase(), item);
    });

    // Aggregate items
    const aggregatedItems = aggregateItems(inventoryDataByItem, itemsMap);

    return NextResponse.json({
      data: aggregatedItems,
    });
  } catch (err) {
    const error = normalizeError(err);
    logger.error("[aggregated/route.ts] ❌ Failed to fetch aggregated inventory:", error.message);
    return NextResponse.json(
      {
        error: "Failed to fetch aggregated inventory",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500 }
    );
  }
}
