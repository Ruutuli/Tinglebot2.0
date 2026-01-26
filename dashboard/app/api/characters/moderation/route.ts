// ============================================================================
// ------------------- Character Moderation List -------------------
// GET /api/characters/moderation
// List all characters with status='pending' for moderation, including vote counts
// Requires moderator access
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { checkModAccess, getVotesForCharacter } from "@/lib/ocApplicationService";
import { fetchDiscordUsernames } from "@/lib/discord";
import { logger } from "@/utils/logger";

type CharacterDoc = {
  _id: unknown;
  userId: string;
  name: string;
  status: string | null;
  applicationVersion: number;
  submittedAt: Date | null;
  race?: string;
  job?: string;
  homeVillage?: string;
  toObject: () => Record<string, unknown>;
};

export async function GET(_req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin or moderator access (matching frontend check)
    const isAdmin = await isAdminUser(user.id);
    const isMod = await checkModAccess(user.id);
    
    logger.info(
      "api/characters/moderation",
      `Access check for user ${user.id} (${user.username}): isAdmin=${isAdmin}, isMod=${isMod}`
    );
    
    if (!isAdmin && !isMod) {
      logger.warn(
        "api/characters/moderation",
        `Access denied for user ${user.id} (${user.username}): not admin or moderator`
      );
      return NextResponse.json(
        { 
          error: "Forbidden",
          message: "You don't have permission to access character moderation. You need to be a moderator or admin.",
          userId: user.id,
          username: user.username
        },
        { status: 403 }
      );
    }

    await connect();
    const { default: Character } = await import("@/models/CharacterModel.js");

    // Get all characters needing moderation (pending or needs_changes)
    // Query for characters with status='pending' or status='needs_changes', sorted by submittedAt (oldest first)
    // Ensure we're querying for the exact string values to match the enum values
    // Also ensure submittedAt exists (characters should have been submitted)
    const pendingChars = (await Character.find({
      status: { $in: ["pending", "needs_changes"] },
      submittedAt: { $ne: null },
    })
      .sort({ submittedAt: 1 })
      .exec()) as CharacterDoc[];

    logger.info(
      "api/characters/moderation",
      `Found ${pendingChars.length} characters (pending or needs_changes) for moderation`
    );

    // Get votes for each character
    const charactersWithVotes = await Promise.all(
      pendingChars.map(async (char) => {
        type Vote = {
          vote: "approve" | "needs_changes";
          modId: string;
          modUsername: string;
          reason: string | null;
          note: string | null;
          createdAt: Date;
        };
        let votes: Vote[] = [];
        try {
          votes = await getVotesForCharacter(
            String(char._id),
            char.applicationVersion ?? 1
          );
        } catch (voteError) {
          logger.error(
            "api/characters/moderation",
            `Failed to get votes for character ${String(char._id)}: ${voteError instanceof Error ? voteError.message : String(voteError)}`
          );
          // Continue with empty votes array if vote fetching fails
        }

        const approveCount = votes.filter((v) => v.vote === "approve").length;
        const needsChangesCount = votes.filter((v) => v.vote === "needs_changes").length;
        const currentUserVote = votes.find((v) => v.modId === user.id);

        return {
          ...char.toObject(),
          voteSummary: {
            approveCount,
            needsChangesCount,
            totalVotes: votes.length,
            currentUserVote: currentUserVote
              ? {
                  vote: currentUserVote.vote,
                  reason: currentUserVote.reason,
                  note: currentUserVote.note,
                }
              : null,
            votes: votes.map((v) => ({
              modId: v.modId,
              modUsername: v.modUsername,
              vote: v.vote,
              reason: v.reason,
              note: v.note,
              createdAt: v.createdAt,
            })),
          },
        };
      })
    );

    // Fetch Discord usernames for all user IDs
    const userIds = [...new Set(pendingChars.map((c) => c.userId))];
    let usernameMap: Record<string, string> = {};
    try {
      usernameMap = await fetchDiscordUsernames(userIds);
    } catch (usernameError) {
      logger.error(
        "api/characters/moderation",
        `Failed to fetch Discord usernames: ${usernameError instanceof Error ? usernameError.message : String(usernameError)}`
      );
      // Continue with empty username map if fetching fails
    }

    // Add usernames to characters
    const enriched = charactersWithVotes.map((char) => ({
      ...char,
      username: usernameMap[char.userId] || char.userId,
    }));

    return NextResponse.json({ characters: enriched });
  } catch (e) {
    let errorMessage = "Unknown error occurred";
    let errorStack: string | undefined;
    let errorName = "Error";
    
    if (e instanceof Error) {
      errorMessage = e.message || "Unknown error occurred";
      errorStack = e.stack;
      errorName = e.name;
    } else if (typeof e === "string") {
      errorMessage = e;
    } else {
      try {
        errorMessage = JSON.stringify(e);
      } catch {
        errorMessage = String(e);
      }
    }
    
    logger.error(
      "api/characters/moderation",
      `Error: ${errorName} - ${errorMessage}${errorStack ? `\nStack: ${errorStack}` : ""}`
    );
    
    return NextResponse.json(
      { 
        error: "Failed to fetch pending characters",
        message: errorMessage,
        name: errorName,
        details: process.env.NODE_ENV === "development" ? {
          message: errorMessage,
          name: errorName,
          stack: errorStack
        } : undefined
      },
      { status: 500 }
    );
  }
}
