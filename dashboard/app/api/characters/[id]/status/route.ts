// ============================================================================
// ------------------- Character Status -------------------
// GET /api/characters/:id/status
// Get character status and vote summary
// Public endpoint (for users to check their character status)
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getVotesForCharacter } from "@/lib/ocApplicationService";
import { logger } from "@/utils/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Character ID required" }, { status: 400 });
    }

    await connect();
    const { default: Character } = await import("@/models/CharacterModel.js");

    // Get character
    const char = (await (Character as {
      findById: (id: string) => Promise<{
        status: string | null;
        applicationVersion?: number;
        submittedAt: Date | null;
        decidedAt: Date | null;
        approvedAt: Date | null;
        applicationFeedback: Array<{
          modId: string;
          modUsername: string;
          text: string;
          createdAt: Date;
        }>;
      } | null>;
    }).findById(id)) as {
      status: string | null;
      applicationVersion?: number;
      submittedAt: Date | null;
      decidedAt: Date | null;
      approvedAt: Date | null;
      applicationFeedback: Array<{
        modId: string;
        modUsername: string;
        text: string;
        createdAt: Date;
      }>;
    } | null;

    if (!char) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const applicationVersion = char.applicationVersion ?? 1;

    // Get votes for current version (only if status is pending)
    let voteSummary = null;
    if (char.status === "pending") {
      const votes = await getVotesForCharacter(id, applicationVersion);
      voteSummary = {
        approveCount: votes.filter((v) => v.vote === "approve").length,
        needsChangesCount: votes.filter((v) => v.vote === "needs_changes").length,
        totalVotes: votes.length,
      };
    }

    return NextResponse.json({
      status: char.status,
      applicationVersion,
      submittedAt: char.submittedAt,
      decidedAt: char.decidedAt,
      approvedAt: char.approvedAt,
      applicationFeedback: char.applicationFeedback,
      voteSummary,
    });
  } catch (e) {
    logger.error(
      "api/characters/[id]/status",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to fetch character status" },
      { status: 500 }
    );
  }
}
