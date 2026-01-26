// ============================================================================
// ------------------- Character submit (resubmission) -------------------
// POST /api/characters/:id/submit
// For resubmission after NEEDS_CHANGES. Uses shared submit helper.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { submitCharacter } from "@/lib/character-submit";
import { logger } from "@/utils/logger";
import { createSlug } from "@/lib/string-utils";

type CharDoc = {
  _id: unknown;
  userId: string;
  name: string;
  status: string | null;
  submittedAt: Date | null;
  applicationVersion?: number;
  set: (o: Record<string, unknown>) => void;
  save: () => Promise<unknown>;
  toObject: () => Record<string, unknown>;
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: slugOrId } = await params;
    if (!slugOrId?.trim()) {
      return NextResponse.json({ error: "Character ID required" }, { status: 400 });
    }

    await connect();
    const { default: Character } = await import("@/models/CharacterModel.js");
    const { default: ModCharacter } = await import("@/models/ModCharacterModel.js");
    
    // Try to find by slug (name) first, then by ID
    let char: CharDoc | null = null;
    
    // Check if it looks like an ObjectId (24 hex characters)
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(slugOrId);
    
    if (isObjectId) {
      // Try by ID first (for backward compatibility)
      char = (await (Character as { findById: (id: string) => Promise<CharDoc | null> }).findById(slugOrId)) as CharDoc | null;
      if (!char) {
        char = (await (ModCharacter as { findById: (id: string) => Promise<CharDoc | null> }).findById(slugOrId)) as CharDoc | null;
      }
    } else {
      // Try by slug (name) - search all characters and match by slug
      const regularChars = await (Character as { find: (filter: Record<string, unknown>) => Promise<CharDoc[]> }).find({}) as CharDoc[];
      char = regularChars.find((c) => createSlug(c.name) === slugOrId.toLowerCase()) ?? null;
      
      if (!char) {
        const modChars = await (ModCharacter as { find: (filter: Record<string, unknown>) => Promise<CharDoc[]> }).find({}) as CharDoc[];
        char = modChars.find((c) => createSlug(c.name) === slugOrId.toLowerCase()) ?? null;
      }
    }
    
    if (!char) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (char.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Only allow resubmission if status is null (draft) or "needs_changes"
    const currentStatus = char.status ?? null;
    if (currentStatus === "pending" || currentStatus === "accepted") {
      return NextResponse.json(
        { error: `Character cannot be resubmitted. Current status: ${currentStatus === "pending" ? "pending review" : "accepted"}` },
        { status: 400 }
      );
    }

    await submitCharacter(char);
    const out = typeof char.toObject === "function" ? char.toObject() : (char as unknown as Record<string, unknown>);
    return NextResponse.json({ character: out });
  } catch (e) {
    logger.error(
      "api/characters/[id]/submit",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to submit character" },
      { status: 500 }
    );
  }
}
