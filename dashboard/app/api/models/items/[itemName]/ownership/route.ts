// ============================================================================
// ------------------- Imports -------------------
// ============================================================================
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { logger } from "@/utils/logger";

// ============================================================================
// ------------------- GET Handler -------------------
// ============================================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemName: string }> }
) {
  try {
    await connect();
    
    const { itemName: itemNameParam } = await params;
    const itemName = decodeURIComponent(itemNameParam);
    
    // Connect to inventories database (using cached connection)
    const db = await getInventoriesDb();
    
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    logger.info("ownership", `Found ${collectionNames.length} collections`);
    
    // Get Character model from main database
    let Character: mongoose.Model<unknown>;
    if (mongoose.models.Character) {
      Character = mongoose.models.Character;
    } else {
      const { default: CharacterModel } = await import("@/models/CharacterModel.js");
      Character = CharacterModel as unknown as mongoose.Model<unknown>;
    }
    
    // Query all collections and aggregate results
    const escapedItemName = itemName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const allInventoryData: Array<{ _id: mongoose.Types.ObjectId; totalQuantity: number }> = [];
    
    // Query each collection
    for (const collectionName of collectionNames) {
      try {
        if (!db) {
          throw new Error("Database connection lost");
        }
        const collection = db.collection(collectionName);
        const collectionData = await collection.aggregate([
          {
            $match: {
              itemName: { $regex: new RegExp(`^${escapedItemName}$`, "i") }
            }
          },
          {
            $group: {
              _id: "$characterId",
              totalQuantity: { $sum: "$quantity" }
            }
          }
        ]).toArray();
        
        // Merge results
        for (const item of collectionData) {
          const existingIndex = allInventoryData.findIndex(
            (d) => d._id.toString() === item._id.toString()
          );
          if (existingIndex >= 0) {
            allInventoryData[existingIndex].totalQuantity += item.totalQuantity;
          } else {
            allInventoryData.push({
              _id: typeof item._id === 'string' 
                ? new mongoose.Types.ObjectId(item._id) 
                : item._id as mongoose.Types.ObjectId,
              totalQuantity: item.totalQuantity
            });
          }
        }
      } catch (err) {
        // Skip collections that fail (might be system collections or invalid)
        logger.info("ownership", `Skipped collection "${collectionName}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    
    // Sort by total quantity descending
    const inventoryData = allInventoryData.sort((a, b) => b.totalQuantity - a.totalQuantity);
    
    logger.info("ownership", `"${itemName}" → ${inventoryData.length} characters`);
    
    // Get character names for each characterId
    const characterIds = inventoryData.map((item: { _id: unknown }) => 
      typeof item._id === 'string' ? new mongoose.Types.ObjectId(item._id) : item._id as mongoose.Types.ObjectId
    );
    
    type CharacterSelectDoc = {
      _id: mongoose.Types.ObjectId;
      name: string;
    };
    const characters = await Character.find({
      _id: { $in: characterIds }
    })
      .select("_id name")
      .lean<CharacterSelectDoc[]>();
    
    // Create a map of characterId -> characterName
    const characterMap = new Map(
      characters.map((char) => [
        char._id.toString(),
        char.name
      ])
    );
    
    // Combine inventory data with character names
    const ownershipData = inventoryData.map((item: { _id: unknown; totalQuantity: number }) => {
      const charId = typeof item._id === 'string' ? item._id : (item._id as mongoose.Types.ObjectId).toString();
      return {
        characterId: charId,
        characterName: characterMap.get(charId) || "Unknown",
        quantity: item.totalQuantity
      };
    });
    
    // Calculate total in world
    const totalInWorld = ownershipData.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);
    
    return NextResponse.json({
      itemName,
      totalInWorld,
      characters: ownershipData
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    const errorStack = e instanceof Error ? e.stack : undefined;
    logger.error("ownership", `Failed to fetch character ownership: ${errorMessage}`);
    if (errorStack) {
      logger.error("ownership", errorStack);
    }
    return NextResponse.json(
      { error: "Failed to fetch character ownership", details: errorMessage },
      { status: 500 }
    );
  }
}
