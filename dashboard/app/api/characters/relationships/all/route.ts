// GET /api/characters/relationships/all — get all relationships (public)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";
import type { Types } from "mongoose";

// Uses session cookies; must be dynamically rendered per-request.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
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

    // Fetch all relationships
    const relationshipsRaw = await Relationship.find({})
      .lean()
      .sort({ createdAt: -1 })
      .exec();

    // Manually populate character references
    const relationships = await Promise.all(
      relationshipsRaw.map(async (rel) => {
        const [sourceChar, targetChar] = await Promise.all([
          populateCharacter(rel.characterId as unknown as Types.ObjectId),
          populateCharacter(rel.targetCharacterId as unknown as Types.ObjectId),
        ]);
        
        return {
          ...rel,
          characterId: sourceChar || rel.characterId,
          targetCharacterId: targetChar || rel.targetCharacterId,
        };
      })
    );

    const response = NextResponse.json({
      relationships: relationships || [],
    });

    // Add cache headers - public cache since this is all relationships
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=600"
    );

    return response;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/characters/relationships/all", errorMessage);
    return NextResponse.json(
      { 
        error: "Failed to fetch all relationships",
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}
