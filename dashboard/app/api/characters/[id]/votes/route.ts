// ============================================================================
// ------------------- Character Votes -------------------
// GET /api/characters/:id/votes
// Get all votes for a character (current application version)
// Requires moderator access
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { checkModAccess, getVotesForCharacter } from "@/lib/ocApplicationService";
import { logger } from "@/utils/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check moderator access
    const isMod = await checkModAccess(user.id);
    if (!isMod) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Character ID required" }, { status: 400 });
    }

    await connect();
    const { default: Character } = await import("@/models/CharacterModel.js");

    // Get character to get current application version
    const char = (await (Character as {
      findById: (id: string) => Promise<{ applicationVersion?: number } | null>;
    }).findById(id)) as { applicationVersion?: number } | null;

    if (!char) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const applicationVersion = char.applicationVersion ?? 1;
    const votes = await getVotesForCharacter(id, applicationVersion);

    return NextResponse.json({
      votes: votes.map((v) => ({
        modId: v.modId,
        modUsername: v.modUsername,
        vote: v.vote,
        reason: v.reason,
        note: v.note,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
      })),
      applicationVersion,
    });
  } catch (e) {
    logger.error(
      "api/characters/[id]/votes",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to fetch votes" },
      { status: 500 }
    );
  }
}
