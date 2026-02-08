// GET /api/characters/relationships/[characterId] — get relationships for a specific character

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";
import type { Types } from "mongoose";

// Uses session cookies; must be dynamically rendered per-request.
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  try {
    const { characterId } = await params;
    
    if (!characterId) {
      return NextResponse.json({ error: "Character ID is required" }, { status: 400 });
    }

    await connect();
    
    const { default: Relationship } = await import("@/models/RelationshipModel.js");
    const { default: Character } = await import("@/models/CharacterModel.js");
    const { default: ModCharacter } = await import("@/models/ModCharacterModel.js");
    const mongoose = (await import("mongoose")).default;

    // Helper function to populate character from either Character or ModCharacter
    const populateCharacter = async (charId: Types.ObjectId) => {
      if (!charId) return null;
      
      // Try Character first
      const character = await Character.findById(charId)
        .select('name race job currentVillage homeVillage icon')
        .lean()
        .exec();
      
      if (character) return character;
      
      // Try ModCharacter if not found in Character
      const modCharacter = await ModCharacter.findById(charId)
        .select('name race job currentVillage homeVillage icon')
        .lean()
        .exec();
      
      return modCharacter;
    };

    // Fetch relationships in both directions
    const [outgoingRaw, incomingRaw] = await Promise.all([
      Relationship.find({ characterId: new mongoose.Types.ObjectId(characterId) })
        .lean()
        .sort({ createdAt: -1 })
        .exec(),
      Relationship.find({ targetCharacterId: new mongoose.Types.ObjectId(characterId) })
        .lean()
        .sort({ createdAt: -1 })
        .exec(),
    ]);

    // Manually populate character references and use current names from DB (so renames are reflected)
    const outgoingRelationships = await Promise.all(
      outgoingRaw.map(async (rel) => {
        const targetChar = await populateCharacter(rel.targetCharacterId as unknown as Types.ObjectId);
        const targetName = (targetChar as { name?: string } | null)?.name ?? rel.targetCharacterName;
        return {
          ...rel,
          targetCharacterId: targetChar || rel.targetCharacterId,
          targetCharacterName: targetName,
        };
      })
    );

    const incomingRelationships = await Promise.all(
      incomingRaw.map(async (rel) => {
        const sourceChar = await populateCharacter(rel.characterId as unknown as Types.ObjectId);
        const sourceName = (sourceChar as { name?: string } | null)?.name ?? rel.characterName;
        return {
          ...rel,
          characterId: sourceChar || rel.characterId,
          characterName: sourceName,
        };
      })
    );

    const response = NextResponse.json({
      outgoing: outgoingRelationships || [],
      incoming: incomingRelationships || [],
    });

    // Add cache headers
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=120"
    );

    return response;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/characters/relationships/[characterId]", errorMessage);
    return NextResponse.json(
      { 
        error: "Failed to fetch character relationships",
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}
