// GET /api/inventories/character/[characterName]/logs — get acquisition history/logs for a character

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { createSlug } from "@/lib/string-utils";
import { logger } from "@/utils/logger";

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Type definition for InventoryLog model
interface InventoryLogModel {
  getCharacterLogs(
    characterName: string,
    filters?: Record<string, unknown>
  ): Promise<unknown[]>;
  create(data: Record<string, unknown>): Promise<unknown>;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ characterName: string }> }
) {
  try {
    await connect();

    const { characterName: characterNameParam } = await params;
    const identifier = decodeURIComponent(characterNameParam);
    const escapedName = escapeRegExp(identifier);

    // Import Character models to verify character exists
    let Character, ModCharacter;
    try {
      const CharacterModule = await import("@/models/CharacterModel.js");
      const ModCharacterModule = await import("@/models/ModCharacterModel.js");
      Character = CharacterModule.default || CharacterModule;
      ModCharacter = ModCharacterModule.default || ModCharacterModule;
    } catch (importError) {
      const errorMsg = importError instanceof Error ? importError.message : String(importError);
      logger.error("api/inventories/character/[characterName]/logs", `Failed to import models: ${errorMsg}`);
      return NextResponse.json(
        { error: "Failed to load character models" },
        { status: 500 }
      );
    }

    // Find character (case-insensitive). Supports both direct name and slug.
    type CharacterIdDoc = {
      _id: mongoose.Types.ObjectId;
      name: string;
    };
    let foundCharacter = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
    })
      .select("_id name")
      .lean<CharacterIdDoc>();

    if (!foundCharacter) {
      // Try mod characters
      foundCharacter = await ModCharacter.findOne({
        name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      })
        .select("_id name")
        .lean<CharacterIdDoc>();
    }

    // Slug fallback (used by /characters routes)
    if (!foundCharacter) {
      const slug = createSlug(identifier);

      const regularCandidates = await Character.find({})
        .select("_id name")
        .lean<CharacterIdDoc[]>();
      const slugMatch = regularCandidates.find((c) => createSlug(c.name) === slug);
      if (slugMatch) {
        foundCharacter = slugMatch;
      } else {
        const modCandidates = await ModCharacter.find({})
          .select("_id name")
          .lean<CharacterIdDoc[]>();
        const modSlugMatch = modCandidates.find((c) => createSlug(c.name) === slug);
        if (modSlugMatch) {
          foundCharacter = modSlugMatch;
        }
      }
    }

    if (!foundCharacter) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const characterName = foundCharacter.name;

    // Import InventoryLog model
    let InventoryLog: InventoryLogModel;
    try {
      const InventoryLogModule = await import("@/models/InventoryLogModel.js");
      InventoryLog = (InventoryLogModule.default || InventoryLogModule) as unknown as InventoryLogModel;
    } catch (importError) {
      const errorMsg = importError instanceof Error ? importError.message : String(importError);
      logger.error("api/inventories/character/[characterName]/logs", `Failed to import InventoryLog model: ${errorMsg}`);
      return NextResponse.json(
        { error: "Failed to load InventoryLog model" },
        { status: 500 }
      );
    }

    // Parse query parameters
    const { searchParams } = new URL(req.url);
    const item = searchParams.get("item");
    const itemName = searchParams.get("itemName") || item;
    const obtain = searchParams.get("obtain");
    const category = searchParams.get("category");
    const type = searchParams.get("type");
    const location = searchParams.get("location");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = parseInt(searchParams.get("limit") || "1000", 10);
    const skip = parseInt(searchParams.get("skip") || "0", 10);

    // Build filters object
    const filters: Record<string, unknown> = {
      limit,
      skip,
    };

    if (itemName && itemName.trim().length > 0) {
      filters.itemName = itemName.trim();
    }
    if (obtain) filters.obtain = obtain;
    if (category) filters.category = category;
    if (type) filters.type = type;
    if (location) filters.location = location;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    // Use the static method from InventoryLog model
    const logs = await InventoryLog.getCharacterLogs(characterName, filters);

    return NextResponse.json({
      data: {
        characterName,
        characterId: foundCharacter._id,
        logs,
        total: logs.length,
      },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/inventories/character/[characterName]/logs", errorMessage);
    return NextResponse.json(
      {
        error: "Failed to fetch inventory logs",
        details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
      },
      { status: 500 }
    );
  }
}
