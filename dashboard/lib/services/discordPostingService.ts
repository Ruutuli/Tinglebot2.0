// ============================================================================
// ------------------- Discord Posting Service -------------------
// Handles posting and updating embeds in Discord channels for character reviews
// ============================================================================

import { discordApiRequest } from "@/lib/discord";
import { buildApplicationEmbed } from "./discordEmbeds";
import { logger } from "@/utils/logger";
import { getVotesForCharacter } from "@/lib/ocApplicationService";
import { getAppUrl } from "@/lib/config";
import { createSlug } from "@/lib/string-utils";

const ADMIN_REVIEW_CHANNEL_ID =
  process.env.ADMIN_REVIEW_CHANNEL_ID || "964342870796537909";
const ADMIN_REVIEW_THREAD_ID = process.env.ADMIN_REVIEW_THREAD_ID || null;

type CharacterDocument = {
  _id: unknown;
  userId: string;
  name: string;
  pronouns?: string;
  age?: number | null;
  height?: number | null;
  race?: string;
  homeVillage?: string;
  job?: string;
  applicationVersion?: number;
  publicSlug?: string | null;
  appLink?: string;
  icon?: string;
  appArt?: string;
  discordMessageId?: string | null;
  discordThreadId?: string | null;
  maxHearts?: number;
  currentHearts?: number;
  maxStamina?: number;
  currentStamina?: number;
  attack?: number;
  defense?: number;
  gearWeapon?: { name: string };
  gearShield?: { name: string };
  gearArmor?: {
    head?: { name: string };
    chest?: { name: string };
    legs?: { name: string };
  };
  set: (opts: Record<string, unknown>) => void;
  save: () => Promise<unknown>;
};

/**
 * Post application embed to admin review channel
 * Returns message ID and thread ID (if applicable)
 */
export async function postApplicationEmbed(
  character: CharacterDocument
): Promise<{ messageId: string | null; threadId: string | null }> {
  try {
    // Get current vote counts
    const votes = await getVotesForCharacter(
      String(character._id),
      character.applicationVersion ?? 1
    );
    const approveCount = votes.filter((v) => v.vote === "approve").length;
    const needsChangesCount = votes.filter(
      (v) => v.vote === "needs_changes"
    ).length;

    const embed = buildApplicationEmbed(character, {
      approveCount,
      needsChangesCount,
    });

    // Determine target channel (thread if available, otherwise main channel)
    const targetChannelId = ADMIN_REVIEW_THREAD_ID || ADMIN_REVIEW_CHANNEL_ID;

    // Verify channel exists before posting
    if (!targetChannelId) {
      logger.error(
        "discordPostingService",
        `No channel ID configured for posting (ADMIN_REVIEW_THREAD_ID: ${ADMIN_REVIEW_THREAD_ID}, ADMIN_REVIEW_CHANNEL_ID: ${ADMIN_REVIEW_CHANNEL_ID})`
      );
      return { messageId: null, threadId: null };
    }

    logger.info(
      "discordPostingService",
      `Attempting to post to channel ${targetChannelId} for character ${String(character._id)}`
    );

    // Post message
    const messageData = await discordApiRequest<{ id: string }>(
      `channels/${targetChannelId}/messages`,
      "POST",
      {
        embeds: [embed],
      }
    );

    if (!messageData || !messageData.id) {
      logger.error(
        "discordPostingService",
        `Failed to post application embed for character ${String(character._id)} to channel ${targetChannelId}. Check: 1) Channel ID is correct, 2) Bot has access to channel, 3) Bot has Send Messages permission`
      );
      return { messageId: null, threadId: null };
    }

    const messageId = messageData.id;
    let threadId: string | null = null;

    // If thread ID is configured, use it
    if (ADMIN_REVIEW_THREAD_ID) {
      threadId = ADMIN_REVIEW_THREAD_ID;
    }

    // Store IDs in character document
    character.set({
      discordMessageId: messageId,
      discordThreadId: threadId,
    });
    await character.save();

    logger.info(
      "discordPostingService",
      `Posted application embed for character ${String(character._id)} (message: ${messageId})`
    );

    return { messageId, threadId };
  } catch (error) {
    logger.error(
      "discordPostingService",
      `Error posting application embed: ${error instanceof Error ? error.message : String(error)}`
    );
    return { messageId: null, threadId: null };
  }
}

/**
 * Update application embed with new vote counts
 */
export async function updateApplicationEmbed(
  characterId: string,
  voteCounts: { approveCount: number; needsChangesCount: number }
): Promise<boolean> {
  try {
    await import("@/lib/db").then((m) => m.connect());
    const { default: Character } = await import("@/models/CharacterModel.js");

    const char = (await (Character as {
      findById: (id: string) => Promise<CharacterDocument | null>;
    }).findById(characterId)) as CharacterDocument | null;

    if (!char || !char.discordMessageId) {
      logger.warn(
        "discordPostingService",
        `Character ${characterId} has no Discord message ID`
      );
      return false;
    }

    // Determine channel (use thread if available, otherwise main channel)
    const channelId = char.discordThreadId || ADMIN_REVIEW_CHANNEL_ID;

    // Build updated embed
    const embed = buildApplicationEmbed(char, voteCounts);

    // Update message
    const result = await discordApiRequest(
      `channels/${channelId}/messages/${char.discordMessageId}`,
      "PATCH",
      {
        embeds: [embed],
      }
    );

    if (result === null) {
      logger.error(
        "discordPostingService",
        `Failed to update embed for character ${characterId}`
      );
      return false;
    }

    logger.info(
      "discordPostingService",
      `Updated application embed for character ${characterId}`
    );

    return true;
  } catch (error) {
    logger.error(
      "discordPostingService",
      `Error updating application embed: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Handle resubmission - update existing embed and post notification
 */
export async function handleResubmission(
  character: CharacterDocument
): Promise<boolean> {
  try {
    if (!character.discordMessageId) {
      // If no message ID, post new embed
      await postApplicationEmbed(character);
      return true;
    }

    // Get current vote counts (should be 0 after clearing)
    const votes = await getVotesForCharacter(
      String(character._id),
      character.applicationVersion ?? 1
    );
    const approveCount = votes.filter((v) => v.vote === "approve").length;
    const needsChangesCount = votes.filter(
      (v) => v.vote === "needs_changes"
    ).length;

    // Update embed with new version
    const channelId = character.discordThreadId || ADMIN_REVIEW_CHANNEL_ID;
    const embed = buildApplicationEmbed(character, {
      approveCount,
      needsChangesCount,
    });

    await discordApiRequest(
      `channels/${channelId}/messages/${character.discordMessageId}`,
      "PATCH",
      {
        embeds: [embed],
      }
    );

    // Post notification message as embed
    const version = character.applicationVersion ?? 1;
    const approvalUrl = process.env.APPROVA_LS_URL || "https://approva.ls";

    const updateEmbed = {
      title: `🔄 Character Application Update`,
      description: `**${character.name}** has an updated application!`,
      color: 0x4caf50, // Green
      fields: [
        {
          name: "📋 Version",
          value: `v${version}`,
          inline: true,
        },
        {
          name: "🔗 Review",
          value: `[View on approva.ls](${approvalUrl})`,
          inline: true,
        },
      ],
    };
    
    await discordApiRequest(`channels/${channelId}/messages`, "POST", {
      embeds: [updateEmbed],
    });

    logger.info(
      "discordPostingService",
      `Handled resubmission for character ${String(character._id)} (v${version})`
    );

    return true;
  } catch (error) {
    logger.error(
      "discordPostingService",
      `Error handling resubmission: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Post a vote/feedback notification to the same channel as the character app
 * Format: "User provided feedback! {modUsername} votes on {characterName} app"
 */
export async function postVoteNotification(
  characterId: string,
  modUsername: string,
  vote: "approve" | "needs_changes",
  note?: string | null
): Promise<void> {
  try {
    await import("@/lib/db").then((m) => m.connect());
    const { default: Character } = await import("@/models/CharacterModel.js");

    const char = (await (Character as {
      findById: (id: string) => Promise<CharacterDocument | null>;
    }).findById(characterId)) as CharacterDocument | null;

    if (!char) {
      logger.warn(
        "discordPostingService",
        `Character ${characterId} not found for vote notification`
      );
      return;
    }

    const channelId = char.discordThreadId || ADMIN_REVIEW_CHANNEL_ID;
    if (!channelId) {
      logger.warn(
        "discordPostingService",
        "No channel configured for vote notification"
      );
      return;
    }

    const voteEmoji = vote === "approve" ? "✅" : "⚠️";
    const voteText =
      vote === "approve"
        ? "approved"
        : "provided feedback (needs changes)";

    let content = `${voteEmoji} **${modUsername}** ${voteText} on **${char.name}** app`;
    if (vote === "needs_changes" && note) {
      content += `\n\n**Feedback:** ${note}`;
    }

    await discordApiRequest(`channels/${channelId}/messages`, "POST", {
      content,
    });

    logger.info(
      "discordPostingService",
      `Posted vote notification for character ${characterId} (${char.name}) by ${modUsername}`
    );
  } catch (error) {
    logger.error(
      "discordPostingService",
      `Error posting vote notification: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Notify moderators when a new character is created
 * Sends a simple message to the admin review channel with a link to the character
 */
export async function notifyCharacterCreation(
  character: CharacterDocument
): Promise<void> {
  try {
    if (!ADMIN_REVIEW_CHANNEL_ID) {
      logger.warn(
        "discordPostingService",
        "ADMIN_REVIEW_CHANNEL_ID not configured, skipping character creation notification"
      );
      return;
    }

    const APP_URL = getAppUrl();
    const characterId = String(character._id);
    
    // Construct character URL - prefer publicSlug, fallback to slug from name, then ID
    const characterSlug = character.publicSlug || createSlug(character.name) || characterId;
    const characterUrl = `${APP_URL}/characters/${characterSlug}`;

    const message = `new character created! [View Character](${characterUrl})`;

    await discordApiRequest(
      `channels/${ADMIN_REVIEW_CHANNEL_ID}/messages`,
      "POST",
      {
        content: message,
      }
    );

    logger.info(
      "discordPostingService",
      `Sent character creation notification for character ${characterId} (${character.name})`
    );
  } catch (error) {
    // Log error but don't throw - character creation should succeed even if notification fails
    logger.error(
      "discordPostingService",
      `Error sending character creation notification: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
