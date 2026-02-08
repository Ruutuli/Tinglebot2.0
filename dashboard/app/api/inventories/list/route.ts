// GET /api/inventories/list — get inventory summaries for all user's characters

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";

// Type definition for character documents from MongoDB
type CharacterLean = {
  _id: unknown;
  __v: number;
  name: string;
  icon?: string | null;
  job?: string | null;
  currentVillage?: string | null;
  homeVillage?: string | null;
  [key: string]: unknown;
};

type CharacterWithModFlag = CharacterLean & {
  isModCharacter: boolean;
};

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Uses session cookies; must be dynamically rendered per-request.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      logger.error("api/inventories/list", `Failed to import models: ${errorMsg}`);
      return NextResponse.json(
        { error: "Failed to load character models" },
        { status: 500 }
      );
    }

    // Get user's characters (both regular and mod)
    const [regularChars, modChars] = await Promise.all([
      Character.find({ userId: user.id }).lean(),
      ModCharacter.find({ userId: user.id }).lean(),
    ]) as [CharacterLean[], CharacterLean[]];

    const allCharacters: CharacterWithModFlag[] = [
      ...regularChars.map((c) => ({ ...c, isModCharacter: false })),
      ...modChars.map((c) => ({ ...c, isModCharacter: true })),
    ];

    // Connect to inventories database (using cached connection)
    const db = await getInventoriesDb();

    // Get inventory summaries for each character
    const inventorySummaries = await Promise.all(
      allCharacters.map(async (character) => {
        try {
          const collectionName = character.name.toLowerCase();
          const collection = db.collection(collectionName);
          const charId = typeof character._id === "string"
            ? new mongoose.Types.ObjectId(character._id)
            : character._id;

          // Get all inventory items for this character (filter by characterId to match Bot behavior)
          const inventoryItems = await collection
            .find({ characterId: charId, quantity: { $gt: 0 } })
            .toArray();
          
          // Calculate stats
          const totalItems = inventoryItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
          const uniqueItemNames = new Set(inventoryItems.map((item) => item.itemName));
          const uniqueItems = uniqueItemNames.size;

          return {
            characterName: character.name,
            characterId: character._id,
            icon: character.icon || null,
            job: character.job || null,
            currentVillage: character.currentVillage || character.homeVillage || null,
            uniqueItems,
            totalItems,
          };
        } catch (error) {
          // If collection doesn't exist or error, return zero stats
          logger.warn(
            "api/inventories/list",
            `Error fetching inventory for ${character.name}: ${error instanceof Error ? error.message : String(error)}`
          );
          return {
            characterName: character.name,
            characterId: character._id,
            icon: character.icon || null,
            job: character.job || null,
            currentVillage: character.currentVillage || character.homeVillage || null,
            uniqueItems: 0,
            totalItems: 0,
          };
        }
      })
    );

    const response = NextResponse.json({
      data: inventorySummaries,
    });

    // Add cache headers - private cache since this is user-specific
    response.headers.set(
      "Cache-Control",
      "private, s-maxage=60, stale-while-revalidate=120"
    );

    return response;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/inventories/list", errorMessage);
    return NextResponse.json(
      {
        error: "Failed to fetch inventory summaries",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
