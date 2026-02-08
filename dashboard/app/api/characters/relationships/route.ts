// GET /api/characters/relationships — get current user's character relationships
// POST /api/characters/relationships — create a new relationship
// PUT /api/characters/relationships — update a relationship
// DELETE /api/characters/relationships — delete a relationship

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";
import type { Types } from "mongoose";

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

    // Fetch relationships for the current user
    const relationshipsRaw = await Relationship.find({ userId: user.id })
      .lean()
      .sort({ createdAt: -1 })
      .exec();

    // Manually populate character references and use current names (so renames are reflected)
    const relationships = await Promise.all(
      relationshipsRaw.map(async (rel) => {
        const [sourceChar, targetChar] = await Promise.all([
          populateCharacter(rel.characterId as unknown as Types.ObjectId),
          populateCharacter(rel.targetCharacterId as unknown as Types.ObjectId),
        ]);
        const characterName = (sourceChar as { name?: string } | null)?.name ?? rel.characterName;
        const targetCharacterName = (targetChar as { name?: string } | null)?.name ?? rel.targetCharacterName;
        return {
          ...rel,
          characterId: sourceChar || rel.characterId,
          targetCharacterId: targetChar || rel.targetCharacterId,
          characterName,
          targetCharacterName,
        };
      })
    );

    const response = NextResponse.json({
      relationships: relationships || [],
    });

    // Add cache headers - private cache since this is user-specific
    response.headers.set(
      "Cache-Control",
      "private, s-maxage=60, stale-while-revalidate=120"
    );

    return response;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/characters/relationships", errorMessage);
    return NextResponse.json(
      { 
        error: "Failed to fetch relationships",
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { characterId, targetCharacterId, relationshipTypes, notes } = body;

    // Validation
    if (!characterId || !targetCharacterId) {
      return NextResponse.json(
        { error: "Both characters must be selected" },
        { status: 400 }
      );
    }

    if (!relationshipTypes || !Array.isArray(relationshipTypes) || relationshipTypes.length === 0) {
      return NextResponse.json(
        { error: "At least one relationship type must be selected" },
        { status: 400 }
      );
    }

    if (characterId === targetCharacterId) {
      return NextResponse.json(
        { error: "A character cannot have a relationship with themselves" },
        { status: 400 }
      );
    }

    // Validate relationship types
    const validTypes = ['LOVERS', 'CRUSH', 'CLOSE_FRIEND', 'FRIEND', 'ACQUAINTANCE', 'DISLIKE', 'HATE', 'NEUTRAL', 'FAMILY', 'RIVAL', 'ADMIRE', 'OTHER'];
    for (const type of relationshipTypes) {
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: `Invalid relationship type: ${type}` },
          { status: 400 }
        );
      }
    }

    // Validate notes length
    if (notes && typeof notes === 'string' && notes.length > 1000) {
      return NextResponse.json(
        { error: "Notes cannot exceed 1000 characters" },
        { status: 400 }
      );
    }

    await connect();
    
    const { default: Relationship } = await import("@/models/RelationshipModel.js");
    const { default: Character } = await import("@/models/CharacterModel.js");
    const { default: ModCharacter } = await import("@/models/ModCharacterModel.js");
    const mongoose = (await import("mongoose")).default;

    // Helper function to find character and get name
    const findCharacter = async (charId: string): Promise<{ name: string } | null> => {
      if (!mongoose.Types.ObjectId.isValid(charId)) {
        return null;
      }
      
      const objectId = new mongoose.Types.ObjectId(charId);
      
      // Try Character first
      const character = await Character.findById(objectId)
        .select('name')
        .lean()
        .exec();
      
      if (character && !Array.isArray(character)) {
        return character as unknown as { name: string };
      }
      
      // Try ModCharacter if not found in Character
      const modCharacter = await ModCharacter.findById(objectId)
        .select('name')
        .lean()
        .exec();
      
      if (modCharacter && !Array.isArray(modCharacter)) {
        return modCharacter as unknown as { name: string };
      }
      
      return null;
    };

    // Verify both characters exist
    const [sourceChar, targetChar] = await Promise.all([
      findCharacter(characterId),
      findCharacter(targetCharacterId),
    ]);

    if (!sourceChar) {
      return NextResponse.json(
        { error: "Source character not found" },
        { status: 404 }
      );
    }

    if (!targetChar) {
      return NextResponse.json(
        { error: "Target character not found" },
        { status: 404 }
      );
    }

    // Check for duplicate relationship
    const existing = await Relationship.findOne({
      userId: user.id,
      characterId: new mongoose.Types.ObjectId(characterId),
      targetCharacterId: new mongoose.Types.ObjectId(targetCharacterId),
    });

    if (existing) {
      return NextResponse.json(
        { error: "A relationship between these characters already exists" },
        { status: 409 }
      );
    }

    // Create the relationship
    const relationship = new Relationship({
      userId: user.id,
      characterId: new mongoose.Types.ObjectId(characterId),
      targetCharacterId: new mongoose.Types.ObjectId(targetCharacterId),
      characterName: sourceChar.name,
      targetCharacterName: targetChar.name,
      relationshipTypes,
      notes: notes || '',
    });

    await relationship.save();

    // Return the created relationship with populated character data
    const [populatedSourceChar, populatedTargetChar] = await Promise.all([
      findCharacter(characterId),
      findCharacter(targetCharacterId),
    ]);

    const response = NextResponse.json({
      relationship: {
        _id: relationship._id,
        userId: relationship.userId,
        characterId: populatedSourceChar,
        targetCharacterId: populatedTargetChar,
        characterName: relationship.characterName,
        targetCharacterName: relationship.targetCharacterName,
        relationshipTypes: relationship.relationshipTypes,
        notes: relationship.notes,
        createdAt: relationship.createdAt,
        updatedAt: relationship.updatedAt,
      },
    });

    return response;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/characters/relationships POST", errorMessage);
    
    // Handle duplicate key error (unique constraint violation)
    if (errorMessage.includes('duplicate key') || errorMessage.includes('E11000')) {
      return NextResponse.json(
        { error: "A relationship between these characters already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { 
        error: "Failed to create relationship",
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { relationshipId, relationshipTypes, notes } = body;

    // Validation
    if (!relationshipId) {
      return NextResponse.json(
        { error: "Relationship ID is required" },
        { status: 400 }
      );
    }

    if (!relationshipTypes || !Array.isArray(relationshipTypes) || relationshipTypes.length === 0) {
      return NextResponse.json(
        { error: "At least one relationship type must be selected" },
        { status: 400 }
      );
    }

    // Validate relationship types
    const validTypes = ['LOVERS', 'CRUSH', 'CLOSE_FRIEND', 'FRIEND', 'ACQUAINTANCE', 'DISLIKE', 'HATE', 'NEUTRAL', 'FAMILY', 'RIVAL', 'ADMIRE', 'OTHER'];
    for (const type of relationshipTypes) {
      if (!validTypes.includes(type)) {
        return NextResponse.json(
          { error: `Invalid relationship type: ${type}` },
          { status: 400 }
        );
      }
    }

    // Validate notes length
    if (notes && typeof notes === 'string' && notes.length > 1000) {
      return NextResponse.json(
        { error: "Notes cannot exceed 1000 characters" },
        { status: 400 }
      );
    }

    await connect();
    
    const { default: Relationship } = await import("@/models/RelationshipModel.js");
    const mongoose = (await import("mongoose")).default;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(relationshipId)) {
      return NextResponse.json(
        { error: "Invalid relationship ID format" },
        { status: 400 }
      );
    }

    // Update the relationship, ensuring it belongs to the user
    const updatedRelationship = await Relationship.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(relationshipId),
        userId: user.id,
      },
      {
        relationshipTypes,
        notes: notes || '',
      },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!updatedRelationship) {
      return NextResponse.json(
        { error: "Relationship not found or you don't have permission to update it" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      relationship: {
        _id: updatedRelationship._id,
        userId: updatedRelationship.userId,
        characterId: updatedRelationship.characterId,
        targetCharacterId: updatedRelationship.targetCharacterId,
        characterName: updatedRelationship.characterName,
        targetCharacterName: updatedRelationship.targetCharacterName,
        relationshipTypes: updatedRelationship.relationshipTypes,
        notes: updatedRelationship.notes,
        createdAt: updatedRelationship.createdAt,
        updatedAt: updatedRelationship.updatedAt,
      },
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/characters/relationships PUT", errorMessage);
    return NextResponse.json(
      { 
        error: "Failed to update relationship",
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body: { relationshipId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Body parsing failed, use empty object
    }

    const { relationshipId } = body;

    if (!relationshipId) {
      return NextResponse.json(
        { error: "Relationship ID is required" },
        { status: 400 }
      );
    }

    await connect();
    
    const { default: Relationship } = await import("@/models/RelationshipModel.js");
    const mongoose = (await import("mongoose")).default;

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(relationshipId)) {
      return NextResponse.json(
        { error: "Invalid relationship ID format" },
        { status: 400 }
      );
    }

    // Delete the relationship, ensuring it belongs to the user
    const result = await Relationship.deleteOne({
      _id: new mongoose.Types.ObjectId(relationshipId),
      userId: user.id,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json(
        { error: "Relationship not found or you don't have permission to delete it" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/characters/relationships DELETE", errorMessage);
    return NextResponse.json(
      { 
        error: "Failed to delete relationship",
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}
