// POST /api/inventories/equip — update inventory when equipping/unequipping items

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Type for character document returned from MongoDB
interface CharacterDocument {
  _id: unknown;
  name: string;
  job?: string;
  perk?: string;
  currentVillage?: string;
  homeVillage?: string;
  [key: string]: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { characterName, itemName, action } = body; // action: "equip" | "unequip"

    // Validate input
    if (!characterName || !itemName || !action) {
      return NextResponse.json(
        { error: "Missing required fields: characterName, itemName, action" },
        { status: 400 }
      );
    }

    if (action !== "equip" && action !== "unequip") {
      return NextResponse.json(
        { error: "Action must be 'equip' or 'unequip'" },
        { status: 400 }
      );
    }

    await connect();

    // Import Character models
    let Character, ModCharacter;
    try {
      const CharacterModule = await import("@/models/CharacterModel.js");
      const ModCharacterModule = await import("@/models/ModCharacterModel.js");
      Character = CharacterModule.default || CharacterModule;
      ModCharacter = ModCharacterModule.default || ModCharacterModule;
    } catch (importError) {
      const errorMsg = importError instanceof Error ? importError.message : String(importError);
      logger.error("api/inventories/equip", `Failed to import models: ${errorMsg}`);
      return NextResponse.json(
        { error: "Failed to load character models" },
        { status: 500 }
      );
    }

    // Find character
    const escapedCharacterName = escapeRegExp(characterName);
    let character: CharacterDocument | null = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedCharacterName}$`, "i") },
      userId: user.id,
    }).lean() as CharacterDocument | null;

    if (!character) {
      character = await ModCharacter.findOne({
        name: { $regex: new RegExp(`^${escapedCharacterName}$`, "i") },
        userId: user.id,
      }).lean() as CharacterDocument | null;
    }

    if (!character) {
      return NextResponse.json(
        { error: "Character not found or you don't have permission" },
        { status: 404 }
      );
    }

    // Connect to inventories database (using cached connection)
    const db = await getInventoriesDb();

    // Get character's inventory collection
    const collectionName = character.name.toLowerCase();
    const collection = db.collection(collectionName);
    const charId = typeof character._id === "string"
      ? new mongoose.Types.ObjectId(character._id)
      : character._id;

    // Find the item in character's inventory (filter by characterId to match Bot behavior)
    const escapedItemName = escapeRegExp(itemName);
    const inventoryEntries = await collection
      .find({
        characterId: charId,
        itemName: { $regex: new RegExp(`^${escapedItemName}$`, "i") },
        quantity: { $gt: 0 },
      })
      .toArray();

    if (!inventoryEntries || inventoryEntries.length === 0) {
      return NextResponse.json(
        { error: `Item "${itemName}" not found in ${character.name}'s inventory` },
        { status: 404 }
      );
    }

    if (action === "equip") {
      // When equipping:
      // 1. Remove Equipped:true from all instances of this item (safeguard)
      // 2. If user has multiple, remove one and mark one as Equipped:true
      // 3. If user has only one, mark it as Equipped:true
      // 4. Ensure only one entry per itemName has Equipped:true at any time

      const totalQuantity = inventoryEntries.reduce(
        (sum, entry) => sum + (entry.quantity || 0),
        0
      );

      // Find entry that was previously equipped (if any) - we'll reuse it if possible
      const previouslyEquippedEntry = inventoryEntries.find((e) => e.Equipped === true);
      const previouslyEquippedEntryId = previouslyEquippedEntry?._id;
      
      // SAFEGUARD: First, remove Equipped flag from ALL entries with this itemName
      // This ensures no duplicate equipped entries exist
      await collection.updateMany(
        {
          characterId: charId,
          itemName: { $regex: new RegExp(`^${escapedItemName}$`, "i") },
          Equipped: true,
        },
        { $unset: { Equipped: "" } }
      );

      // Refetch entries after unsetting flags to ensure we have latest state
      // This handles edge cases where entries might have been modified
      const refreshedEntries = await collection
        .find({
          characterId: charId,
          itemName: { $regex: new RegExp(`^${escapedItemName}$`, "i") },
          quantity: { $gt: 0 },
        })
        .toArray();

      if (!refreshedEntries || refreshedEntries.length === 0) {
        return NextResponse.json(
          { error: `Item "${itemName}" not found in ${character.name}'s inventory after refresh` },
          { status: 404 }
        );
      }

      // If user has multiple items, we need to ensure one is marked as equipped
      if (totalQuantity > 1) {
        // Try to find the previously equipped entry in refreshed entries
        const refreshedPreviouslyEquipped = previouslyEquippedEntryId
          ? refreshedEntries.find((e) => e._id.toString() === previouslyEquippedEntryId.toString())
          : null;

        // If there was a previously equipped entry with quantity 1, reuse it
        if (refreshedPreviouslyEquipped && refreshedPreviouslyEquipped.quantity === 1) {
          // Reuse the previously equipped entry
          await collection.updateOne(
            { _id: refreshedPreviouslyEquipped._id },
            { $set: { Equipped: true } }
          );
        } else {
          // Find an entry with quantity > 1 to split, or use the first entry
          let entryToEquip = refreshedEntries.find((e) => e.quantity > 1) || refreshedEntries[0];
          
          if (!entryToEquip) {
            return NextResponse.json(
              { error: `No valid entry found to equip for "${itemName}"` },
              { status: 500 }
            );
          }
          
          // If the entry has quantity > 1, decrement it and create a new entry with Equipped:true
          if (entryToEquip.quantity > 1) {
            // Decrement the existing entry
            await collection.updateOne(
              { _id: entryToEquip._id },
              { $inc: { quantity: -1 } }
            );
            
            // Create a new entry with Equipped:true (its own slot)
            await collection.insertOne({
              characterId: charId,
              itemName: entryToEquip.itemName,
              itemId: entryToEquip.itemId,
              quantity: 1,
              category: entryToEquip.category || "",
              type: entryToEquip.type || "",
              subtype: entryToEquip.subtype || "",
              job: entryToEquip.job || character.job || "",
              perk: entryToEquip.perk || character.perk || "",
              location: entryToEquip.location || character.currentVillage || character.homeVillage || "",
              date: new Date(),
              obtain: entryToEquip.obtain || "",
              Equipped: true,
            });
          } else {
            // Entry has quantity 1, just mark it as equipped
            await collection.updateOne(
              { _id: entryToEquip._id },
              { $set: { Equipped: true } }
            );
          }
        }
      } else {
        // User has only one, mark it as equipped
        await collection.updateOne(
          { _id: refreshedEntries[0]._id },
          { $set: { Equipped: true } }
        );
      }

      // Final safeguard: Verify only one entry has Equipped:true
      const finalCheck = await collection
        .find({
          characterId: charId,
          itemName: { $regex: new RegExp(`^${escapedItemName}$`, "i") },
          Equipped: true,
        })
        .toArray();

      if (finalCheck.length > 1) {
        // This should never happen, but if it does, fix it
        logger.error("api/inventories/equip", `Multiple equipped entries found for "${itemName}", fixing...`);
        // Keep only the first one, unset the rest
        for (let i = 1; i < finalCheck.length; i++) {
          await collection.updateOne(
            { _id: finalCheck[i]._id },
            { $unset: { Equipped: "" } }
          );
        }
      }
    } else if (action === "unequip") {
      // When unequipping:
      // 1. Find the entry with Equipped:true
      // 2. Remove the Equipped flag
      // 3. Keep the item in its own slot (don't merge with other entries)

      const equippedEntry = inventoryEntries.find((e) => e.Equipped === true);
      
      if (!equippedEntry) {
        // SAFEGUARD: Check if there are any equipped entries (might be a different entry)
        const allEquippedEntries = await collection
          .find({
            characterId: charId,
            itemName: { $regex: new RegExp(`^${escapedItemName}$`, "i") },
            Equipped: true,
          })
          .toArray();

        if (allEquippedEntries.length === 0) {
          // No equipped entry found, but that's okay - maybe it was already unequipped
          return NextResponse.json({
            success: true,
            message: `Item "${itemName}" unequipped (was not marked as equipped)`,
          });
        }

        // If we found equipped entries but not in the initial query, use the first one
        const entryToUnequip = allEquippedEntries[0];
        await collection.updateOne(
          { _id: entryToUnequip._id },
          { $unset: { Equipped: "" } }
        );
      } else {
        // Remove Equipped flag - keep the item in its own slot (don't merge)
        // This ensures equipped items maintain their own inventory entry
        await collection.updateOne(
          { _id: equippedEntry._id },
          { $unset: { Equipped: "" } }
        );
      }
      
      // Note: We intentionally do NOT merge equipped items back with other entries
      // This keeps equipped items in their own slot as requested by the user
    }

    return NextResponse.json({
      success: true,
      message: `Successfully ${action === "equip" ? "equipped" : "unequipped"} ${itemName}`,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/inventories/equip", errorMessage);
    return NextResponse.json(
      {
        error: "Failed to update item equipment status",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
