// GET /api/inventories/character/[characterName] — get detailed inventory for a specific character

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
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

    // Find character (case-insensitive)
    const character = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
    }).lean();

    if (!character) {
      // Try mod characters
      const modCharacter = await ModCharacter.findOne({
        name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      }).lean();

      if (!modCharacter) {
        return NextResponse.json({ error: "Character not found" }, { status: 404 });
      }

      // Use mod character
      const foundCharacter = modCharacter;
      const collectionName = foundCharacter.name.toLowerCase();

      // Connect to inventories database (using cached connection)
      const db = await getInventoriesDb();

      // Get character's inventory
      const collection = db.collection(collectionName);
      const inventoryItems = await collection.find().toArray();

      // Create a map of owned items and collect unique item names
      const ownedItemsMap = new Map<string, { quantity: number; category?: string; type?: string; subtype?: string; obtain?: string; location?: string; date?: Date }>();
      const ownedItemNames = new Set<string>();
      inventoryItems.forEach((item) => {
        if (item.quantity > 0) {
          ownedItemNames.add(item.itemName);
          ownedItemsMap.set(item.itemName.toLowerCase(), {
            quantity: item.quantity,
            category: item.category,
            type: item.type,
            subtype: item.subtype,
            obtain: item.obtain,
            location: item.location,
            date: item.date,
          });
        }
      });

      // Get all items from items collection (this route shows all items with owned flag)
      // For optimization, we could limit this, but keeping it for now as it may be intentional
      let Item: mongoose.Model<unknown>;
      if (mongoose.models.Item) {
        Item = mongoose.models.Item;
      } else {
        const { default: ItemModel } = await import("@/models/ItemModel.js");
        Item = ItemModel as unknown as mongoose.Model<unknown>;
      }

      // Only fetch items that are owned or commonly needed (optimization)
      // If you want to show ALL items, remove the $in filter, but it will be slower
      const allItems = ownedItemNames.size > 0
        ? await Item.find({ itemName: { $in: Array.from(ownedItemNames) } })
            .select("itemName category type subtype image")
            .lean()
        : [];

      // Merge all items with owned status
      const completeInventory = allItems.map((item: any) => {
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

      const totalItems = inventoryItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
      const uniqueItems = inventoryItems.filter((item) => (item.quantity || 0) > 0).length;

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
    }

    // Use regular character
    const collectionName = character.name.toLowerCase();

    // Connect to inventories database (using cached connection)
    const db = await getInventoriesDb();

    // Get character's inventory
    const collection = db.collection(collectionName);
    const inventoryItems = await collection.find().toArray();

    // Create a map of owned items and collect unique item names
    const ownedItemsMap = new Map<string, { quantity: number; category?: string; type?: string; subtype?: string; obtain?: string; location?: string; date?: Date }>();
    const ownedItemNames = new Set<string>();
    inventoryItems.forEach((item) => {
      if (item.quantity > 0) {
        ownedItemNames.add(item.itemName);
        ownedItemsMap.set(item.itemName.toLowerCase(), {
          quantity: item.quantity,
          category: item.category,
          type: item.type,
          subtype: item.subtype,
          obtain: item.obtain,
          location: item.location,
          date: item.date,
        });
      }
    });

    // Get all items from items collection (this route shows all items with owned flag)
    // For optimization, we could limit this, but keeping it for now as it may be intentional
    let Item: mongoose.Model<unknown>;
    if (mongoose.models.Item) {
      Item = mongoose.models.Item;
    } else {
      const { default: ItemModel } = await import("@/models/ItemModel.js");
      Item = ItemModel as unknown as mongoose.Model<unknown>;
    }

    // Only fetch items that are owned or commonly needed (optimization)
    // If you want to show ALL items, remove the $in filter, but it will be slower
    const allItems = ownedItemNames.size > 0
      ? await Item.find({ itemName: { $in: Array.from(ownedItemNames) } })
          .select("itemName category type subtype image")
          .lean()
      : [];

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

    const totalItems = inventoryItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const uniqueItems = inventoryItems.filter((item) => (item.quantity || 0) > 0).length;

    return NextResponse.json({
      data: {
        characterName: character.name,
        characterId: character._id,
        icon: character.icon,
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
