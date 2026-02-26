// GET /api/inventories/character/[characterName] — get detailed inventory for a specific character

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { createSlug } from "@/lib/string-utils";
import { logger } from "@/utils/logger";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type ItemDocument = {
  itemName: string;
  category?: string | string[];
  type?: string | string[];
  subtype?: string | string[];
  image?: string;
};

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ characterName: string }> }
) {
  try {
    await connect();

    const { characterName: characterNameParam } = await params;
    const characterName = decodeURIComponent(characterNameParam);
    const escapedName = escapeRegExp(characterName);

    // Import Character models
    let Character, ModCharacter;
    try {
      const CharacterModule = await import("@/models/CharacterModel.js");
      const ModCharacterModule = await import("@/models/ModCharacterModel.js");
      Character = CharacterModule.default || CharacterModule;
      ModCharacter = ModCharacterModule.default || ModCharacterModule;
    } catch (importError) {
      const errorMsg = importError instanceof Error ? importError.message : String(importError);
      logger.error("api/inventories/character/[characterName]", `Failed to import models: ${errorMsg}`);
      return NextResponse.json(
        { error: "Failed to load character models" },
        { status: 500 }
      );
    }

    // Find character (case-insensitive). Supports both:
    // - direct name lookups (e.g. "Aemu")
    // - slug lookups (e.g. "aemu", "link-the-hero")
    type CharacterDoc = {
      _id: mongoose.Types.ObjectId;
      name: string;
      icon?: string;
    };
    let foundCharacter = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
    })
      .select("_id name icon")
      .lean<CharacterDoc>();

    if (!foundCharacter) {
      const modCharacter = await ModCharacter.findOne({
        name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      })
        .select("_id name icon")
        .lean<CharacterDoc>();

      if (modCharacter) {
        foundCharacter = modCharacter;
      }
    }

    // If direct name lookup failed, try slug lookup (used in /characters routes)
    if (!foundCharacter) {
      const slug = createSlug(characterName);

      const regularCandidates = await Character.find({})
        .select("_id name icon")
        .lean<CharacterDoc[]>();
      const slugMatch = regularCandidates.find((c) => createSlug(c.name) === slug);
      if (slugMatch) {
        foundCharacter = slugMatch;
      } else {
        const modCandidates = await ModCharacter.find({})
          .select("_id name icon")
          .lean<CharacterDoc[]>();
        const modSlugMatch = modCandidates.find((c) => createSlug(c.name) === slug);
        if (modSlugMatch) {
          foundCharacter = modSlugMatch;
        }
      }
    }

    if (!foundCharacter) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const collectionName = foundCharacter.name.toLowerCase();

    // Connect to inventories database (using cached connection)
    const db = await getInventoriesDb();

    // Get character's inventory (filter by characterId to match Bot behavior)
    const collection = db.collection(collectionName);
    const charId = typeof foundCharacter._id === "string"
      ? new mongoose.Types.ObjectId(foundCharacter._id)
      : foundCharacter._id;
    const inventoryItems = await collection.find({ characterId: charId }).toArray();

    // Aggregate by item name (case-insensitive): sum quantities across all stacks so multiple acquisition methods show as one combined total
    const ownedItemsMap = new Map<
      string,
      {
        quantity: number;
        category?: unknown;
        type?: unknown;
        subtype?: unknown;
        obtain?: string;
        location?: string;
        date?: Date;
      }
    >();
    const ownedItemsOriginalByLower = new Map<string, string>();
    inventoryItems.forEach((item) => {
      if (item.quantity > 0) {
        const key = String(item.itemName).toLowerCase();
        ownedItemsOriginalByLower.set(key, String(item.itemName));
        const existing = ownedItemsMap.get(key);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          ownedItemsMap.set(key, {
            quantity: item.quantity,
            category: item.category,
            type: item.type,
            subtype: item.subtype,
            obtain: item.obtain,
            location: item.location,
            date: item.date,
          });
        }
      }
    });

    // Get all items from items collection (this route shows all items with owned flag)
    let Item: mongoose.Model<unknown>;
    if (mongoose.models.Item) {
      Item = mongoose.models.Item;
    } else {
      const { default: ItemModel } = await import("@/models/ItemModel.js");
      Item = ItemModel as unknown as mongoose.Model<unknown>;
    }

    // Fetch ALL items so the UI can show owned + not-owned items
    const allItems = await (Item as unknown as mongoose.Model<ItemDocument>)
      .find({})
      .select("itemName category type subtype image")
      .sort({ itemName: 1 })
      .lean<ItemDocument[]>();

    // Merge all items with owned status
    const completeInventory = allItems.map((item: ItemDocument) => {
      const owned = ownedItemsMap.get(item.itemName.toLowerCase());
      return {
        itemName: item.itemName,
        quantity: owned ? owned.quantity : 0,
        category: Array.isArray(item.category) ? item.category : (item.category ? [item.category] : []),
        type: Array.isArray(item.type) ? item.type : (item.type ? [item.type] : []),
        subtype: Array.isArray(item.subtype) ? item.subtype : (item.subtype ? [item.subtype] : []),
        image: item.image,
        owned: !!owned,
        obtain: owned ? owned.obtain : null,
        location: owned ? owned.location : null,
      };
    });

    // If inventories contain items not present in the global items collection,
    // include them so the character's owned list is never missing entries.
    const allItemNamesLower = new Set(
      allItems.map((i) => String(i.itemName ?? "").toLowerCase()).filter(Boolean)
    );
    for (const [itemNameLower, owned] of ownedItemsMap.entries()) {
      if (allItemNamesLower.has(itemNameLower)) continue;
      const originalItemName = ownedItemsOriginalByLower.get(itemNameLower) || itemNameLower;
      completeInventory.push({
        itemName: originalItemName,
        quantity: owned.quantity,
        category: Array.isArray(owned.category) ? owned.category.map(String) : (owned.category ? [String(owned.category)] : []),
        type: Array.isArray(owned.type) ? owned.type.map(String) : (owned.type ? [String(owned.type)] : []),
        subtype: Array.isArray(owned.subtype) ? owned.subtype.map(String) : (owned.subtype ? [String(owned.subtype)] : []),
        image: undefined,
        owned: true,
        obtain: owned.obtain ?? null,
        location: owned.location ?? null,
      });
    }

    const totalItems = Array.from(ownedItemsMap.values()).reduce((sum, owned) => sum + owned.quantity, 0);
    const uniqueItems = ownedItemsMap.size;

    return NextResponse.json({
      data: {
        characterName: foundCharacter.name,
        characterId: foundCharacter._id,
        icon: foundCharacter.icon,
        totalItems,
        uniqueItems,
        inventory: completeInventory,
      },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/inventories/character/[characterName]", errorMessage);
    return NextResponse.json(
      {
        error: "Failed to fetch character inventory",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
