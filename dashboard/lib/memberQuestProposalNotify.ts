/**
 * Notify a Discord channel when a new member quest proposal is submitted.
 * Also notifies the member (DM + dashboard) when a revision is requested.
 */

import { discordApiRequest } from "@/lib/discord";
import { connect } from "@/lib/db";
import { getAppUrl } from "@/lib/config";

const MEMBER_QUEST_PROPOSALS_CHANNEL_ID =
  process.env.MEMBER_QUEST_PROPOSALS_CHANNEL_ID || "1078339678425583730";

/** Channel to post when a member's quest has new feedback/decision (e.g. revision requested). */
const MEMBER_QUEST_FEEDBACK_CHANNEL_ID =
  process.env.MEMBER_QUEST_FEEDBACK_CHANNEL_ID || "641858948802150400";

function formatDateDisplay(dateStr: string | undefined): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return dateStr ?? "—";
  const d = new Date(dateStr + "T12:00:00");
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function notifyMemberQuestProposal(options: {
  proposalId: string;
  title: string;
  submitterUsername: string;
  type?: string;
  locations?: string;
  date?: string;
  timeLimit?: string;
}): void {
  if (!MEMBER_QUEST_PROPOSALS_CHANNEL_ID) {
    console.warn("[memberQuestProposalNotify] No MEMBER_QUEST_PROPOSALS_CHANNEL_ID configured");
    return;
  }

  const baseUrl = getAppUrl().replace(/\/$/, "");
  const reviewUrl = `${baseUrl}/admin/member-quest-proposals`;

  const description = [
    `**Title:** ${options.title}`,
    `**Submitted by:** ${options.submitterUsername || "—"}`,
    `**Type:** ${options.type || "—"}`,
    `**Locations:** ${options.locations || "—"}`,
    `**Start date:** ${formatDateDisplay(options.date)}`,
    `**Duration:** ${options.timeLimit || "—"}`,
    "",
    `**[Review in dashboard](${reviewUrl})**`,
  ].join("\n");

  const embed = {
    title: "📋 New member quest proposal",
    description,
    color: 0xbf8b37, // ocher/gold
    footer: { text: "Member Quest Proposals" },
    timestamp: new Date().toISOString(),
  };

  discordApiRequest(
    `channels/${MEMBER_QUEST_PROPOSALS_CHANNEL_ID}/messages`,
    "POST",
    { embeds: [embed] }
  ).catch((err) => {
    console.warn("[memberQuestProposalNotify] Discord post failed:", err);
  });
}

/**
 * Notify the mod channel when a member resubmits a proposal after revision.
 */
export function notifyMemberQuestProposalResubmitted(options: {
  title: string;
  submitterUsername: string;
  type?: string;
  locations?: string;
  date?: string;
  timeLimit?: string;
}): void {
  if (!MEMBER_QUEST_PROPOSALS_CHANNEL_ID) {
    console.warn("[memberQuestProposalNotify] No MEMBER_QUEST_PROPOSALS_CHANNEL_ID configured");
    return;
  }

  const baseUrl = getAppUrl().replace(/\/$/, "");
  const reviewUrl = `${baseUrl}/admin/member-quest-proposals`;

  const description = [
    `**Title:** ${options.title}`,
    `**Resubmitted by:** ${options.submitterUsername || "—"}`,
    `**Type:** ${options.type || "—"}`,
    `**Locations:** ${options.locations || "—"}`,
    `**Start date:** ${formatDateDisplay(options.date)}`,
    `**Duration:** ${options.timeLimit || "—"}`,
    "",
    `**[Review in dashboard](${reviewUrl})**`,
  ].join("\n");

  const embed = {
    title: "🔄 Member quest proposal resubmitted",
    description,
    color: 0xbf8b37,
    footer: { text: "Member Quest Proposals" },
    timestamp: new Date().toISOString(),
  };

  discordApiRequest(
    `channels/${MEMBER_QUEST_PROPOSALS_CHANNEL_ID}/messages`,
    "POST",
    { embeds: [embed] }
  ).catch((err) => {
    console.warn("[memberQuestProposalNotify] Resubmit Discord post failed:", err);
  });
}

/**
 * When a mod requests revision: send DM to submitter (with embed stating revision + feedback) and create dashboard notification.
 * DM is like character needs_changes: says what it is, shows moderator feedback, and link to edit & resubmit.
 */
export async function notifyMemberQuestRevisionRequested(options: {
  submitterUserId: string;
  proposalTitle: string;
  revisionReason: string | null;
}): Promise<void> {
  const { submitterUserId, proposalTitle, revisionReason } = options;
  const baseUrl = getAppUrl().replace(/\/$/, "");
  const memberQuestsUrl = `${baseUrl}/member-quests`;

  // 1) Dashboard notification (so they see it in the dashboard)
  try {
    await connect();
    const Notification = (await import("@/models/NotificationModel.js")).default;
    const title = "Member quest – revision requested";
    const message =
      revisionReason && revisionReason.trim()
        ? `A moderator has requested changes to your quest proposal **${proposalTitle}**.\n\n**Feedback:**\n\n${revisionReason.trim()}\n\nEdit your proposal and resubmit when ready.`
        : `A moderator has requested changes to your quest proposal **${proposalTitle}**. Edit your proposal and resubmit when ready.`;
    const doc = new (Notification as new (opts: Record<string, unknown>) => { save: () => Promise<unknown> })({
      userId: submitterUserId,
      type: "member_quest_needs_revision",
      title,
      message,
      read: false,
      links: [{ text: "View & edit proposal", url: memberQuestsUrl }],
    });
    await doc.save();
  } catch (err) {
    console.warn("[memberQuestRevisionNotify] Dashboard notification failed:", err);
  }

  // 2) DM to submitter: embed saying what it is (revision needed) + feedback, like character needs_changes
  try {
    const channelData = await discordApiRequest<{ id: string }>("users/@me/channels", "POST", {
      recipient_id: submitterUserId,
    });
    const dmChannelId = channelData?.id;
    if (!dmChannelId) return;

    const feedbackText =
      revisionReason && revisionReason.trim()
        ? revisionReason.trim()
        : "No specific feedback provided. Please review your proposal and resubmit.";

    const embed = {
      title: "⚠️ Member Quest Needs Revision",
      description: `Your member quest proposal **${proposalTitle}** needs some changes before it can be approved.\n\n**📝 MODERATOR FEEDBACK:**\n\n${feedbackText}`,
      color: 0xffa500, // Orange, same as character needs_changes
      fields: [
        {
          name: "✏️ Next Steps",
          value: `Please review the feedback above and make the necessary changes to your proposal.\n\nOnce you've made the changes, you can resubmit for review.\n\n[Edit & resubmit proposal](${memberQuestsUrl})`,
          inline: false,
        },
      ],
      footer: {
        text: "💬 If you need to discuss any of the changes, please reach out to the mod team!",
      },
      timestamp: new Date().toISOString(),
    };

    await discordApiRequest(`channels/${dmChannelId}/messages`, "POST", {
      embeds: [embed],
    });
  } catch (err) {
    console.warn("[memberQuestRevisionNotify] DM failed:", err);
  }

  // 3) Post to feedback channel so the user sees it there (e.g. "hey user, your member quest has new feedback")
  if (MEMBER_QUEST_FEEDBACK_CHANNEL_ID) {
    discordApiRequest(
      `channels/${MEMBER_QUEST_FEEDBACK_CHANNEL_ID}/messages`,
      "POST",
      {
        content: `<@${submitterUserId}> Your member quest has new feedback — check your [dashboard](${memberQuestsUrl}) for details.`,
      }
    ).catch((err) => {
      console.warn("[memberQuestRevisionNotify] Feedback channel post failed:", err);
    });
  }
}
