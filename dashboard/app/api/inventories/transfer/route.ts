// POST /api/inventories/transfer — transfer items between characters

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Type definitions for Character documents
type CharacterDocument = {
  _id: mongoose.Types.ObjectId;
  name: string;
  job?: string;
  perk?: string;
  currentVillage?: string;
  homeVillage?: string;
  userId: string;
  [key: string]: unknown;
};

// Type definition for Item document
type ItemDocument = {
  _id: mongoose.Types.ObjectId;
  itemName: string;
  category?: string | string[];
  type?: string | string[];
  subtype?: string | string[];
  [key: string]: unknown;
};

// Type definition for InventoryLog model
interface InventoryLogModel {
  getCharacterLogs(
    characterName: string,
    filters?: Record<string, unknown>
  ): Promise<unknown[]>;
  create(data: Record<string, unknown>): Promise<unknown>;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { sourceCharacterName, destinationCharacterName, itemName, quantity } = body;

    // Validate input
    if (!sourceCharacterName || !destinationCharacterName || !itemName || !quantity) {
      return NextResponse.json(
        { error: "Missing required fields: sourceCharacterName, destinationCharacterName, itemName, quantity" },
        { status: 400 }
      );
    }

    if (sourceCharacterName === destinationCharacterName) {
      return NextResponse.json(
        { error: "Source and destination characters must be different" },
        { status: 400 }
      );
    }

    const quantityNum = Number(quantity);
    if (isNaN(quantityNum) || quantityNum <= 0) {
      return NextResponse.json(
        { error: "Quantity must be a positive number" },
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
      logger.error("api/inventories/transfer", `Failed to import models: ${errorMsg}`);
      return NextResponse.json(
        { error: "Failed to load character models" },
        { status: 500 }
      );
    }

    // Find source character
    const escapedSourceName = escapeRegExp(sourceCharacterName);
    let sourceCharacter = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedSourceName}$`, "i") },
      userId: user.id,
    })
      .select("_id name userId job perk currentVillage homeVillage")
      .lean<CharacterDocument>();

    if (!sourceCharacter) {
      sourceCharacter = await ModCharacter.findOne({
        name: { $regex: new RegExp(`^${escapedSourceName}$`, "i") },
        userId: user.id,
      })
        .select("_id name userId job perk currentVillage homeVillage")
        .lean<CharacterDocument>();
    }

    if (!sourceCharacter) {
      return NextResponse.json(
        { error: "Source character not found or you don't have permission" },
        { status: 404 }
      );
    }

    const sourceChar = sourceCharacter;

    // Find destination character
    const escapedDestName = escapeRegExp(destinationCharacterName);
    let destinationCharacter = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedDestName}$`, "i") },
      userId: user.id,
    })
      .select("_id name userId job perk currentVillage homeVillage")
      .lean<CharacterDocument>();

    if (!destinationCharacter) {
      destinationCharacter = await ModCharacter.findOne({
        name: { $regex: new RegExp(`^${escapedDestName}$`, "i") },
        userId: user.id,
      })
        .select("_id name userId job perk currentVillage homeVillage")
        .lean<CharacterDocument>();
    }

    if (!destinationCharacter) {
      return NextResponse.json(
        { error: "Destination character not found or you don't have permission" },
        { status: 404 }
      );
    }

    const destChar = destinationCharacter;

    // Connect to inventories database (using cached connection)
    const db = await getInventoriesDb();

    // Get source character's inventory collection
    const sourceCollectionName = sourceChar.name.toLowerCase();
    const sourceCollection = db.collection(sourceCollectionName);

    // Find the item in source character's inventory
    const escapedItemName = escapeRegExp(itemName);
    const sourceInventoryEntries = await sourceCollection
      .find({
        itemName: { $regex: new RegExp(`^${escapedItemName}$`, "i") },
        quantity: { $gt: 0 },
      })
      .toArray();

    if (!sourceInventoryEntries || sourceInventoryEntries.length === 0) {
      return NextResponse.json(
        { error: `Item "${itemName}" not found in ${sourceChar.name}'s inventory` },
        { status: 404 }
      );
    }

    // Calculate total available quantity
    const totalAvailable = sourceInventoryEntries.reduce(
      (sum, entry) => sum + (entry.quantity || 0),
      0
    );

    if (totalAvailable < quantityNum) {
      return NextResponse.json(
        { error: `Insufficient quantity. Available: ${totalAvailable}, Requested: ${quantityNum}` },
        { status: 400 }
      );
    }

    // Get item details from Item model
    let Item: mongoose.Model<unknown>;
    if (mongoose.models.Item) {
      Item = mongoose.models.Item;
    } else {
      const { default: ItemModel } = await import("@/models/ItemModel.js");
      Item = ItemModel as unknown as mongoose.Model<unknown>;
    }

    const itemDetails = await Item.findOne({
      itemName: { $regex: new RegExp(`^${escapedItemName}$`, "i") },
    })
      .select("_id itemName category type subtype")
      .lean<ItemDocument>();

    if (!itemDetails) {
      return NextResponse.json(
        { error: `Item "${itemName}" not found in item database` },
        { status: 404 }
      );
    }

    const item = itemDetails;

    // Remove items from source character's inventory
    let remainingToRemove = quantityNum;
    const canonicalItemName = sourceInventoryEntries[0].itemName; // Use canonical name from first entry

    for (const entry of sourceInventoryEntries) {
      if (remainingToRemove <= 0) break;

      const quantityFromThisEntry = Math.min(remainingToRemove, entry.quantity);
      const newQuantity = entry.quantity - quantityFromThisEntry;

      if (newQuantity === 0) {
        // Delete entry if quantity reaches 0
        await sourceCollection.deleteOne({ _id: entry._id });
      } else {
        // Update entry with remaining quantity
        await sourceCollection.updateOne(
          { _id: entry._id },
          { $inc: { quantity: -quantityFromThisEntry } }
        );
      }

      remainingToRemove -= quantityFromThisEntry;
    }

    // Add items to destination character's inventory
    const destinationCollectionName = destChar.name.toLowerCase();
    const destinationCollection = db.collection(destinationCollectionName);

    // Check if item already exists in destination inventory
    const existingDestinationItem = await destinationCollection.findOne({
      itemName: canonicalItemName,
    });

    const category = Array.isArray(item.category)
      ? item.category.join(", ")
      : item.category || "";
    const type = Array.isArray(item.type)
      ? item.type.join(", ")
      : item.type || "";
    const subtype = Array.isArray(item.subtype)
      ? item.subtype.join(", ")
      : item.subtype || "";

    if (existingDestinationItem) {
      // Update existing item by incrementing quantity
      await destinationCollection.updateOne(
        { itemName: canonicalItemName },
        { $inc: { quantity: quantityNum } }
      );
    } else {
      // Insert new item
      await destinationCollection.insertOne({
        characterId: destChar._id,
        itemName: canonicalItemName,
        itemId: item._id,
        quantity: quantityNum,
        category,
        type,
        subtype,
        job: destChar.job || "",
        perk: destChar.perk || "",
        location: destChar.currentVillage || destChar.homeVillage || "",
        date: new Date(),
        obtain: `Transfer from ${sourceChar.name}`,
      });
    }

    // Log removal to InventoryLog
    try {
      const InventoryLogModule = await import("@/models/InventoryLogModel.js");
      const InventoryLog = (InventoryLogModule.default || InventoryLogModule) as unknown as InventoryLogModel;
      await InventoryLog.create({
        characterName: sourceChar.name,
        characterId: sourceChar._id,
        itemName: canonicalItemName,
        itemId: item._id,
        quantity: -quantityNum, // Negative for removal
        category,
        type,
        subtype,
        obtain: "Transfer",
        job: sourceChar.job || "",
        perk: sourceChar.perk || "",
        location: sourceChar.currentVillage || sourceChar.homeVillage || "",
        link: "",
        dateTime: new Date(),
        confirmedSync: "",
      });
    } catch (logError) {
      logger.warn(
        "api/inventories/transfer",
        `Failed to log removal: ${logError instanceof Error ? logError.message : String(logError)}`
      );
    }

    // Log addition to InventoryLog
    try {
      const InventoryLogModule = await import("@/models/InventoryLogModel.js");
      const InventoryLog = (InventoryLogModule.default || InventoryLogModule) as unknown as InventoryLogModel;
      await InventoryLog.create({
        characterName: destChar.name,
        characterId: destChar._id,
        itemName: canonicalItemName,
        itemId: item._id,
        quantity: quantityNum, // Positive for addition
        category,
        type,
        subtype,
        obtain: `Transfer from ${sourceChar.name}`,
        job: destChar.job || "",
        perk: destChar.perk || "",
        location: destChar.currentVillage || destChar.homeVillage || "",
        link: "",
        dateTime: new Date(),
        confirmedSync: "",
      });
    } catch (logError) {
      logger.warn(
        "api/inventories/transfer",
        `Failed to log addition: ${logError instanceof Error ? logError.message : String(logError)}`
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully transferred ${quantityNum} ${canonicalItemName} from ${sourceChar.name} to ${destChar.name}`,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/inventories/transfer", errorMessage);
    return NextResponse.json(
      {
        error: "Failed to transfer items",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
