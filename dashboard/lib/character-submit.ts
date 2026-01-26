// ============================================================================
// ------------------- Character submission -------------------
// Shared helper for create (submit=true) and resubmission (POST :id/submit).
// Updates status → PENDING, submittedAt. Handles Discord posting and resubmission.
// Handles resubmission from NEEDS_CHANGES by clearing votes and incrementing version.
// ============================================================================

import { logger } from "@/utils/logger";
import { clearVotesForResubmission } from "@/lib/ocApplicationService";
import { postApplicationEmbed, handleResubmission } from "@/lib/services/discordPostingService";

type CharacterDocument = {
  _id: unknown;
  userId: string;
  name: string;
  race?: string;
  homeVillage?: string;
  job?: string;
  status: string | null;
  submittedAt: Date | null;
  applicationVersion?: number;
  discordMessageId?: string | null;
  discordThreadId?: string | null;
  publicSlug?: string | null;
  save: () => Promise<unknown>;
  set: (opts: Record<string, unknown>) => void;
};

export async function submitCharacter(char: CharacterDocument): Promise<void> {
  const isResubmission = char.status === "needs_changes";
  const currentVersion = char.applicationVersion ?? 1;

  // If resubmitting from NEEDS_CHANGES, clear votes and increment version
  if (isResubmission) {
    await clearVotesForResubmission(String(char._id));
    char.set({
      applicationVersion: currentVersion + 1,
    });
    logger.info(
      "character-submit",
      `Character ${String(char._id)} resubmitted (version ${currentVersion + 1}) by user ${char.userId}`
    );
  }

  char.set({
    status: "pending",
    submittedAt: new Date(),
    applicationVersion: char.applicationVersion ?? currentVersion,
  });
  await char.save();

  // Handle Discord posting
  try {
    // Type assertion: character documents from DB have all fields needed
    const charWithFields = char as CharacterDocument & {
      name: string;
      race?: string;
      homeVillage?: string;
      job?: string;
      publicSlug?: string | null;
    };
    
    if (isResubmission) {
      // Update existing embed and post notification
      await handleResubmission(charWithFields);
    } else {
      // Post new application embed
      await postApplicationEmbed(charWithFields);
    }
  } catch (error) {
    logger.error(
      "character-submit",
      `Failed to post Discord message for character ${String(char._id)}: ${error instanceof Error ? error.message : String(error)}`
    );
    // Continue even if Discord posting fails
  }

  logger.info(
    "character-submit",
    `Character ${String(char._id)} submitted by user ${char.userId}`
  );
}
