// ============================================================================
// ------------------- Character Vote -------------------
// POST /api/characters/:id/vote
// Submit or update a vote for a character
// Requires moderator access
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import {
  checkModAccess,
  submitVote,
  checkVoteThresholds,
  getVotesForCharacter,
} from "@/lib/ocApplicationService";
import { fetchDiscordUsernames } from "@/lib/discord";
import { logger } from "@/utils/logger";
import {
  updateApplicationEmbed,
  postVoteNotification,
} from "@/lib/services/discordPostingService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin or moderator access (matching moderation list route)
    const isAdmin = await isAdminUser(user.id);
    const isMod = await checkModAccess(user.id);
    if (!isAdmin && !isMod) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!id?.trim()) {
      return NextResponse.json({ error: "Character ID required" }, { status: 400 });
    }

    const body = await req.json();
    const { vote, reason, note } = body;

    if (!vote || (vote !== "approve" && vote !== "needs_changes")) {
      return NextResponse.json(
        { error: "Invalid vote type. Must be 'approve' or 'needs_changes'" },
        { status: 400 }
      );
    }

    // Validate reason is provided for needs_changes
    if (vote === "needs_changes" && !reason) {
      return NextResponse.json(
        { error: "Reason is required for needs_changes votes" },
        { status: 400 }
      );
    }

    await connect();

    // Fetch mod username
    const usernameMap = await fetchDiscordUsernames([user.id]);
    const modUsername = usernameMap[user.id] || user.username || user.id;

    // Submit vote
    const voteDoc = await submitVote(
      id,
      user.id,
      modUsername,
      vote,
      reason || null,
      note || null
    );

    // Get character to get application version
    const { default: Character } = await import("@/models/CharacterModel.js");
    const char = await (Character as {
      findById: (id: string) => Promise<{
        applicationVersion?: number;
      } | null>;
    }).findById(id);

    if (char) {
      const applicationVersion = char.applicationVersion ?? 1;
      
      // Get updated vote counts
      const votes = await getVotesForCharacter(id, applicationVersion);
      const approveCount = votes.filter((v) => v.vote === "approve").length;
      const needsChangesCount = votes.filter(
        (v) => v.vote === "needs_changes"
      ).length;

      // Update Discord embed with new vote counts
      try {
        await updateApplicationEmbed(id, {
          approveCount,
          needsChangesCount,
        });
      } catch (error) {
        logger.error(
          "api/characters/[id]/vote",
          `Failed to update Discord embed: ${error instanceof Error ? error.message : String(error)}`
        );
        // Continue even if Discord update fails
      }

      // Post vote/feedback notification to same channel as character app
      try {
        await postVoteNotification(
          id,
          modUsername,
          vote,
          reason || note || null
        );
      } catch (error) {
        logger.error(
          "api/characters/[id]/vote",
          `Failed to post vote notification: ${error instanceof Error ? error.message : String(error)}`
        );
        // Continue even if notification fails
      }
    }

    // Check thresholds and update character status if needed
    await checkVoteThresholds(id);

    return NextResponse.json({
      success: true,
      vote: {
        vote: voteDoc.vote,
        reason: voteDoc.reason,
        note: voteDoc.note,
        createdAt: voteDoc.createdAt,
        updatedAt: voteDoc.updatedAt,
      },
    });
  } catch (e) {
    logger.error(
      "api/characters/[id]/vote",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to submit vote" },
      { status: 500 }
    );
  }
}
