/**
 * Notify a Discord channel when a new member quest proposal is submitted.
 * Uses MEMBER_QUEST_PROPOSALS_CHANNEL_ID. Fire-and-forget; does not block or throw.
 */

import { discordApiRequest } from "@/lib/discord";
import { getAppUrl } from "@/lib/config";

const MEMBER_QUEST_PROPOSALS_CHANNEL_ID =
  process.env.MEMBER_QUEST_PROPOSALS_CHANNEL_ID || "1078339678425583730";

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
