// GET /api/inventories/character/[characterName]/items — get items for a character (for transfer dropdown)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Uses session cookies; must be dynamically rendered per-request.
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ characterName: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connect();

    const { characterName: characterNameParam } = await params;
    const characterNameFromParam = decodeURIComponent(characterNameParam);
    const escapedName = escapeRegExp(characterNameFromParam);

    // Import Character models
    let Character, ModCharacter;
    try {
      const CharacterModule = await import("@/models/CharacterModel.js");
      const ModCharacterModule = await import("@/models/ModCharacterModel.js");
      Character = CharacterModule.default || CharacterModule;
      ModCharacter = ModCharacterModule.default || ModCharacterModule;
    } catch (importError) {
      const errorMsg = importError instanceof Error ? importError.message : String(importError);
      logger.error("api/inventories/character/[characterName]/items", `Failed to import models: ${errorMsg}`);
      return NextResponse.json(
        { error: "Failed to load character models" },
        { status: 500 }
      );
    }

    // Find character (case-insensitive) and verify ownership
    let characterDoc = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      userId: user.id,
    }).lean();

    if (!characterDoc) {
      characterDoc = await ModCharacter.findOne({
        name: { $regex: new RegExp(`^${escapedName}$`, "i") },
        userId: user.id,
      }).lean();
    }

    if (!characterDoc || Array.isArray(characterDoc) || !characterDoc.name || typeof characterDoc.name !== "string") {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const characterName = characterDoc.name;

    // Connect to inventories database (using cached connection)
    const db = await getInventoriesDb();

    // Get character's inventory
    const collectionName = characterName.toLowerCase();
    const collection = db.collection(collectionName);
    const inventoryItems = await collection
      .find({ quantity: { $gt: 0 } })
      .sort({ itemName: 1 })
      .toArray();

    // Return simplified item list with Equipped flag
    const items = inventoryItems.map((item) => ({
      itemName: item.itemName,
      quantity: item.quantity || 0,
      Equipped: item.Equipped === true, // Explicitly check for true
    }));

    const response = NextResponse.json({
      data: items,
    });

    // Add cache headers - private cache since this is user-specific
    response.headers.set(
      "Cache-Control",
      "private, s-maxage=60, stale-while-revalidate=120"
    );

    return response;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/inventories/character/[characterName]/items", errorMessage);
    return NextResponse.json(
      {
        error: "Failed to fetch character items",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
