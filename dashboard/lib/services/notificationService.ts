// ============================================================================
// ------------------- Notification Service -------------------
// Handles DM notifications and fallback channel posting for character decisions
// ============================================================================

import { discordApiRequest } from "@/lib/discord";
import {
  buildNeedsChangesDMEmbed,
  buildApprovedDMEmbed,
  buildApprovalChannelEmbed,
  buildDecisionChannelEmbed,
  APPROVED_NEXT_STEPS,
} from "./discordEmbeds";
import { logger } from "@/utils/logger";
import { connect } from "@/lib/db";
import { getAppUrl } from "@/lib/config";

const DECISION_CHANNEL_ID =
  process.env.DECISION_CHANNEL_ID || "641858948802150400";
const CHARACTER_CREATION_CHANNEL_ID =
  process.env.CHARACTER_CREATION_CHANNEL_ID || "";
const APP_URL = getAppUrl();

type CharacterDocument = {
  _id: unknown;
  userId: string;
  name: string;
  race?: string;
  homeVillage?: string;
  job?: string;
  applicationVersion?: number;
  publicSlug?: string | null;
  applicationFeedback?: Array<{
    modId: string;
    modUsername: string;
    text: string;
    createdAt: Date;
  }>;
};

type FeedbackEntry = {
  modId: string;
  modUsername: string;
  text: string;
  createdAt: Date;
};

/**
 * Create DM channel with user
 */
async function createDMChannel(userId: string): Promise<string | null> {
  try {
    const channelData = await discordApiRequest<{ id: string }>(
      "users/@me/channels",
      "POST",
      {
        recipient_id: userId,
      }
    );

    return channelData?.id || null;
  } catch (error) {
    logger.error(
      "notificationService",
      `Failed to create DM channel for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Send DM message
 */
async function sendDM(
  dmChannelId: string,
  embed: Record<string, unknown>
): Promise<boolean> {
  try {
    const result = await discordApiRequest(
      `channels/${dmChannelId}/messages`,
      "POST",
      {
        embeds: [embed],
      }
    );

    return result !== null;
  } catch (error) {
    logger.error(
      "notificationService",
      `Failed to send DM: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Create dashboard notification entry
 */
async function createDashboardNotification(
  userId: string,
  type: "oc_needs_changes" | "oc_approved",
  character: CharacterDocument,
  data: {
    feedback?: FeedbackEntry[];
    editUrl?: string;
    viewUrl?: string;
  }
): Promise<void> {
  try {
    await connect();
    const { default: Notification } = await import(
      "@/models/NotificationModel.js"
    );

    const characterId = String(character._id);
    const ocPageUrl = character.publicSlug
      ? `${APP_URL}/characters/${character.publicSlug}`
      : `${APP_URL}/characters/${characterId}`;

    let title = "";
    let message = "";
    const links: Array<{ text: string; url: string }> = [];

    if (type === "oc_needs_changes") {
      title = "⚠️ Character Needs Changes";
      const feedbackText = data.feedback
        ?.map((f) => f.text)
        .join("\n\n") || "No feedback provided";
      message = `Your character **${character.name}** needs some changes before it can be approved.\n\n**Moderator Feedback:**\n\n${feedbackText}\n\nIf you need to discuss further before resubmitting, please reach out to the roots.admin discord account!`;
      links.push({
        text: "Edit Character",
        url: ocPageUrl,
      });
    } else if (type === "oc_approved") {
      title = "✅ Character Approved!";
      message =
        `Your character **${character.name}** has been approved and is now active!\n\n` +
        APPROVED_NEXT_STEPS;
      links.push({
        text: "View Character",
        url: ocPageUrl,
      });
    }

    const NotificationModel = Notification as new (doc: Record<string, unknown>) => {
      save: () => Promise<unknown>;
    };

    const notification = new NotificationModel({
      userId,
      type,
      title,
      message,
      characterId,
      characterName: character.name,
      links,
      read: false,
      dmDelivered: false,
      fallbackPosted: false,
    });

    await notification.save();

    logger.info(
      "notificationService",
      `Created dashboard notification for user ${userId}, type: ${type}`
    );
  } catch (error) {
    logger.error(
      "notificationService",
      `Failed to create dashboard notification: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Post decision notification to decision channel
 * Always posts to the decision channel when a decision is made
 * For needs_changes, uses a generic message to protect privacy
 */
async function postDecisionChannelNotification(
  userId: string,
  character: CharacterDocument,
  decision: "needs_changes" | "approved"
): Promise<void> {
  try {
    // For needs_changes, use a simple generic message (public channel, don't reveal details)
    if (decision === "needs_changes") {
      const dashboardUrl = `${APP_URL}/profile`;
      await discordApiRequest(`channels/${DECISION_CHANNEL_ID}/messages`, "POST", {
        content: `<@${userId}> A decision has been made on your OC application. Please check your DMs from Tinglebot or your [Dashboard Notifications](${dashboardUrl}) for more information.`,
      });
    } else {
      // For approved, use the full embed
      const embed = buildDecisionChannelEmbed(decision);
      await discordApiRequest(`channels/${DECISION_CHANNEL_ID}/messages`, "POST", {
        content: `<@${userId}>`,
        embeds: [embed],
      });
    }

    const decisionText = decision === "approved" ? "approved" : "needs changes";
    logger.info(
      "notificationService",
      `Posted decision notification to channel for user ${userId}, decision: ${decisionText}`
    );
  } catch (error) {
    logger.error(
      "notificationService",
      `Failed to post decision channel notification: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Post fallback notification to channel (when DMs fail; for approved, include full next steps)
 */
async function postFallbackNotification(
  userId: string,
  character: CharacterDocument,
  decision: "needs_changes" | "approved"
): Promise<void> {
  try {
    const dashboardUrl = `${APP_URL}/profile`;
    if (decision === "approved") {
      const embed = buildApprovedDMEmbed(character) as Record<string, unknown>;
      await discordApiRequest(`channels/${DECISION_CHANNEL_ID}/messages`, "POST", {
        content: `<@${userId}> Your character has been approved! (Could not DM you—see below and [Dashboard Notifications](${dashboardUrl}).)`,
        embeds: [embed],
      });
    } else {
      await discordApiRequest(`channels/${DECISION_CHANNEL_ID}/messages`, "POST", {
        content: `<@${userId}> A determination has been made on your OC application. Please check your DMs from Tinglebot or your [Dashboard Notifications](${dashboardUrl}).`,
      });
    }

    // Update notification to mark fallback as posted
    await connect();
    const { default: Notification } = await import(
      "@/models/NotificationModel.js"
    );

    await (Notification as {
      updateOne: (
        filter: Record<string, unknown>,
        update: Record<string, unknown>
      ) => Promise<unknown>;
    }).updateOne(
      {
        userId,
        characterId: String(character._id),
        type: decision === "needs_changes" ? "oc_needs_changes" : "oc_approved",
      },
      {
        $set: { fallbackPosted: true },
      }
    );

    logger.info(
      "notificationService",
      `Posted fallback notification for user ${userId}`
    );
  } catch (error) {
    logger.error(
      "notificationService",
      `Failed to post fallback notification: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Main notification handler - sends DM, creates dashboard notification, and handles fallback
 */
export async function sendOCDecisionNotification(
  userId: string,
  character: CharacterDocument,
  decision: "needs_changes" | "approved",
  feedback?: FeedbackEntry[]
): Promise<void> {
  try {
    // Always create dashboard notification first
    await createDashboardNotification(
      userId,
      decision === "needs_changes" ? "oc_needs_changes" : "oc_approved",
      character,
      {
        feedback,
      }
    );

    // Always post to decision channel when a decision is made
    // For needs_changes, use a generic message that doesn't reveal details
    await postDecisionChannelNotification(userId, character, decision);

    // Try to send DM
    const dmChannelId = await createDMChannel(userId);
    let dmSent = false;

    if (dmChannelId) {
      let embed: Record<string, unknown>;
      if (decision === "needs_changes") {
        embed = buildNeedsChangesDMEmbed(
          character,
          feedback || []
        ) as Record<string, unknown>;
      } else {
        embed = buildApprovedDMEmbed(character) as Record<string, unknown>;
      }

      dmSent = await sendDM(dmChannelId, embed);

      // Update notification if DM was sent
      if (dmSent) {
        await connect();
        const { default: Notification } = await import(
          "@/models/NotificationModel.js"
        );

        await (Notification as {
          updateOne: (
            filter: Record<string, unknown>,
            update: Record<string, unknown>
          ) => Promise<unknown>;
        }).updateOne(
          {
            userId,
            characterId: String(character._id),
            type:
              decision === "needs_changes" ? "oc_needs_changes" : "oc_approved",
          },
          {
            $set: { dmDelivered: true },
          }
        );
      }
    }

    // If DM failed, also post fallback notification (skip for needs_changes since we already posted a generic message)
    if (!dmSent && decision !== "needs_changes") {
      await postFallbackNotification(userId, character, decision);
    }

    // For approvals, also post to character creation channel
    if (decision === "approved" && CHARACTER_CREATION_CHANNEL_ID) {
      const embed = buildApprovalChannelEmbed(character);
      await discordApiRequest(
        `channels/${CHARACTER_CREATION_CHANNEL_ID}/messages`,
        "POST",
        {
          content: `<@${userId}>`,
          embeds: [embed],
        }
      );
    }

    logger.info(
      "notificationService",
      `Sent ${decision} notification for character ${String(character._id)} to user ${userId}`
    );
  } catch (error) {
    logger.error(
      "notificationService",
      `Error sending notification: ${error instanceof Error ? error.message : String(error)}`
    );
    // Ensure dashboard notification is created even if Discord fails
    try {
      await createDashboardNotification(
        userId,
        decision === "needs_changes" ? "oc_needs_changes" : "oc_approved",
        character,
        {
          feedback,
        }
      );
    } catch (e) {
      logger.error(
        "notificationService",
        `Failed to create dashboard notification as fallback: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
}
