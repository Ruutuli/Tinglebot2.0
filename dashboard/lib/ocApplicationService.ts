// ============================================================================
// ------------------- Character Application Approval Service -------------------
// Core approval logic for character application voting system
// ============================================================================

import { connect } from "@/lib/db";
import { fetchDiscordUsernames } from "@/lib/discord";
import { isModeratorUser } from "@/lib/moderator";
import { logger } from "@/utils/logger";
import { sendOCDecisionNotification } from "@/lib/services/notificationService";
import { assignCharacterRoles } from "@/lib/services/roleAssignmentService";
import { addEquippedGearToInventory } from "@/lib/addStarterGearToInventory";

// Approval threshold: number of approve votes needed (set to 1 for testing; use 4 for production)
export const APPROVAL_THRESHOLD = 1;

type VoteDocument = {
  _id: unknown;
  characterId: unknown;
  modId: string;
  modUsername: string;
  vote: "approve" | "needs_changes";
  reason: string | null;
  note: string | null;
  applicationVersion: number;
  createdAt: Date;
  updatedAt: Date;
  save: () => Promise<unknown>;
};

type CharacterDocument = {
  _id: unknown;
  userId: string;
  name: string;
  status: string | null;
  applicationVersion: number;
  submittedAt: Date | null;
  decidedAt: Date | null;
  approvedAt: Date | null;
  applicationFeedback: Array<{
    modId: string;
    modUsername: string;
    text: string;
    createdAt: Date;
  }>;
  set: (opts: Record<string, unknown>) => void;
  save: () => Promise<unknown>;
};

/**
 * Check if user has moderator access.
 * Wrapper around isModeratorUser for consistency.
 */
export async function checkModAccess(userId: string): Promise<boolean> {
  return isModeratorUser(userId);
}

/**
 * Get all votes for a specific character and application version.
 */
export async function getVotesForCharacter(
  characterId: string,
  applicationVersion: number
): Promise<VoteDocument[]> {
  await connect();
  const { default: CharacterModeration } = await import("@/models/CharacterModerationModel.js");
  
  const votes = (await (CharacterModeration as {
    find: (filter: Record<string, unknown>) => Promise<VoteDocument[]>;
  }).find({
    characterId,
    applicationVersion,
  })) as VoteDocument[];

  return votes;
}

/**
 * Submit or update a vote for a character.
 * If mod already voted for this version, updates existing vote.
 * Returns the vote document.
 */
export async function submitVote(
  characterId: string,
  modId: string,
  modUsername: string,
  vote: "approve" | "needs_changes",
  reason: string | null = null,
  note: string | null = null
): Promise<VoteDocument> {
  await connect();
  const { default: Character } = await import("@/models/CharacterModel.js");
  const { default: CharacterModeration } = await import("@/models/CharacterModerationModel.js");

  // Get character to get current application version
  const char = (await (Character as {
    findById: (id: string) => Promise<CharacterDocument | null>;
  }).findById(characterId)) as CharacterDocument | null;

  if (!char) {
    throw new Error("Character not found");
  }

  const applicationVersion = char.applicationVersion ?? 1;

  // Validate reason is provided for needs_changes votes
  if (vote === "needs_changes" && !reason) {
    throw new Error("Reason is required for needs_changes votes");
  }

  // Find existing vote or create new one
  const existingVote = (await (CharacterModeration as {
    findOne: (filter: Record<string, unknown>) => Promise<VoteDocument | null>;
  }).findOne({
    characterId,
    modId,
    applicationVersion,
  })) as VoteDocument | null;

  if (existingVote) {
    // Update existing vote
    existingVote.vote = vote;
    existingVote.reason = reason;
    existingVote.note = note;
    existingVote.modUsername = modUsername;
    await existingVote.save();
    logger.info(
      "ocApplicationService",
      `Mod ${modId} updated vote for character ${characterId} (version ${applicationVersion}): ${vote}`
    );
    return existingVote;
  } else {
    // Create new vote
    const VoteModel = CharacterModeration as new (doc: Record<string, unknown>) => VoteDocument;
    const newVote = new VoteModel({
      characterId,
      characterName: char.name,
      userId: char.userId,
      isModCharacter: false,
      modId,
      modUsername,
      vote,
      reason,
      note,
      applicationVersion,
    });
    await newVote.save();
    logger.info(
      "ocApplicationService",
      `Mod ${modId} submitted vote for character ${characterId} (version ${applicationVersion}): ${vote}`
    );
    return newVote;
  }
}

/**
 * Check vote thresholds and update character status accordingly.
 * - If 1+ approve votes: status → 'accepted', set approvedAt
 * - If 1+ needs_changes votes: status → 'needs_changes', set decidedAt
 * Returns the updated character document.
 */
export async function checkVoteThresholds(characterId: string): Promise<CharacterDocument> {
  await connect();
  const { default: Character } = await import("@/models/CharacterModel.js");

  const char = (await (Character as {
    findById: (id: string) => Promise<CharacterDocument | null>;
  }).findById(characterId)) as CharacterDocument | null;

  if (!char) {
    throw new Error("Character not found");
  }

  const applicationVersion = char.applicationVersion ?? 1;
  const votes = await getVotesForCharacter(characterId, applicationVersion);

  // Count votes
  const approveVotes = votes.filter((v) => v.vote === "approve");
  const needsChangesVotes = votes.filter((v) => v.vote === "needs_changes");

  // Check thresholds
  // Needs changes takes priority (immediate rejection)
  if (needsChangesVotes.length >= 1) {
    if (char.status !== "needs_changes") {
      char.set({
        status: "needs_changes",
        decidedAt: new Date(),
      });

      // Add feedback from needs_changes votes
      const feedbackEntries = needsChangesVotes.map((v) => ({
        modId: v.modId,
        modUsername: v.modUsername,
        text: v.reason || "No feedback provided",
        createdAt: new Date(),
      }));

      char.set({
        applicationFeedback: feedbackEntries,
      });

      await char.save();
      logger.info(
        "ocApplicationService",
        `Character ${characterId} status updated to needs_changes (version ${applicationVersion})`
      );

      // Send notification
      try {
        await sendOCDecisionNotification(
          char.userId,
          char,
          "needs_changes",
          feedbackEntries
        );
      } catch (error) {
        logger.error(
          "ocApplicationService",
          `Failed to send needs_changes notification: ${error instanceof Error ? error.message : String(error)}`
        );
        // Continue even if notification fails
      }
    }
  } else if (approveVotes.length >= APPROVAL_THRESHOLD) {
    if (char.status !== "accepted") {
      char.set({
        status: "accepted",
        approvedAt: new Date(),
        decidedAt: new Date(),
      });
      await char.save();
      logger.info(
        "ocApplicationService",
        `Character ${characterId} status updated to accepted (version ${applicationVersion})`
      );

      // Add equipped weapon/armor/gear to character's inventory
      try {
        await addEquippedGearToInventory(char as Parameters<typeof addEquippedGearToInventory>[0]);
      } catch (error) {
        logger.error(
          "ocApplicationService",
          `Failed to add starter gear to inventory: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Assign roles and send notification
      try {
        await assignCharacterRoles(char.userId, char);
        await sendOCDecisionNotification(char.userId, char, "approved");
      } catch (error) {
        logger.error(
          "ocApplicationService",
          `Failed to assign roles or send approval notification: ${error instanceof Error ? error.message : String(error)}`
        );
        // Continue even if role assignment/notification fails
      }
    }
  }

  return char;
}

/**
 * Clear votes for a character when resubmitting from NEEDS_CHANGES.
 * This is called before incrementing applicationVersion.
 */
export async function clearVotesForResubmission(characterId: string): Promise<void> {
  await connect();
  const { default: Character } = await import("@/models/CharacterModel.js");
  const { default: CharacterModeration } = await import("@/models/CharacterModerationModel.js");

  const char = (await (Character as {
    findById: (id: string) => Promise<CharacterDocument | null>;
  }).findById(characterId)) as CharacterDocument | null;

  if (!char) {
    throw new Error("Character not found");
  }

  const currentVersion = char.applicationVersion ?? 1;

  // Delete all votes for the current version
  await (CharacterModeration as {
    deleteMany: (filter: Record<string, unknown>) => Promise<unknown>;
  }).deleteMany({
    characterId,
    applicationVersion: currentVersion,
  });

  logger.info(
    "ocApplicationService",
    `Cleared votes for character ${characterId} version ${currentVersion} (resubmission)`
  );
}
