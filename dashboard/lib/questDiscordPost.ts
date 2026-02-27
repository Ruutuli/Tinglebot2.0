/**
 * Post a quest embed to the quest channel (e.g. when a member quest is approved).
 * Uses QUESTS_BOARD env or fallback channel ID. Does not throw; returns null on failure.
 */

import { discordApiRequest } from "@/lib/discord";

const QUEST_CHANNEL_ID = process.env.QUESTS_BOARD || "706880599863853097";
const MOD_ROLE_ID = process.env.MOD_ROLE_ID || "";
const BORDER_IMAGE = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const EMBED_COLOR = 0xaa916a;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const VILLAGE_EMOJIS: Record<string, string> = {
  rudania: "<:rudania:899492917452890142>",
  inariko: "<:inariko:899493009073274920>",
  vhintl: "<:vhintl:899492879205007450>",
};

function formatLocation(location: string): string {
  if (!location?.trim()) return "Not specified";
  const l = location.toLowerCase();
  const parts: string[] = [];
  if (l.includes("rudania")) parts.push(`${VILLAGE_EMOJIS.rudania} Rudania`);
  if (l.includes("inariko")) parts.push(`${VILLAGE_EMOJIS.inariko} Inariko`);
  if (l.includes("vhintl")) parts.push(`${VILLAGE_EMOJIS.vhintl} Vhintl`);
  if (parts.length) return parts.join(", ");
  return location.trim();
}

function dateToYYYYMM(dateStr: string): string {
  const s = (dateStr ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const monthIdx = MONTH_NAMES.findIndex((m) => s.startsWith(m));
  if (monthIdx < 0) return s;
  const rest = s.slice(MONTH_NAMES[monthIdx].length).trim();
  const yearMatch = rest.match(/^\d{4}$/);
  if (yearMatch) return `${yearMatch[0]}-${String(monthIdx + 1).padStart(2, "0")}`;
  return s;
}

function yyyyMmToDisplay(ym: string): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  const monthIdx = parseInt(m, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return ym;
  return `${MONTH_NAMES[monthIdx]} ${y}`;
}

function getEndDateFromDuration(startYYYYMM: string, duration: string): Date | null {
  if (!startYYYYMM || !/^\d{4}-\d{2}$/.test(startYYYYMM)) return null;
  const [y, m] = startYYYYMM.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  if (Number.isNaN(start.getTime())) return null;
  const d = String(duration).toLowerCase();
  const weekMatch = d.match(/(\d+)\s*week/);
  const monthMatch = d.match(/(\d+)\s*month/);
  const dayMatch = d.match(/(\d+)\s*day/);
  let end: Date;
  if (weekMatch) {
    end = new Date(start);
    end.setDate(end.getDate() + parseInt(weekMatch[1], 10) * 7);
  } else if (monthMatch) {
    end = new Date(start);
    end.setMonth(end.getMonth() + parseInt(monthMatch[1], 10));
  } else if (dayMatch) {
    end = new Date(start);
    end.setDate(end.getDate() + parseInt(dayMatch[1], 10));
  } else {
    end = new Date(start);
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

function formatEndDateWithTime(d: Date): string {
  const day = d.getDate();
  const ord = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
  const month = d.toLocaleDateString("en-US", { month: "long" });
  return `${month} ${day}${ord} 11:59 pm`;
}

function formatSignupDeadline(signupDeadline: unknown): string | null {
  if (signupDeadline == null || signupDeadline === "") return null;
  const s = String(signupDeadline).trim();
  if (!s) return null;
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return s;
  }
}

type QuestDoc = {
  title?: string | null;
  description?: string | null;
  rules?: string | null;
  date?: string | null;
  questType?: string | null;
  location?: string | null;
  timeLimit?: string | null;
  questID?: string | null;
  tokenReward?: string | null;
  collabAllowed?: boolean;
  collabRule?: string | null;
  postRequirement?: number | null;
  minRequirements?: string | number | null;
  participantCap?: number | null;
  signupDeadline?: string | null;
  tableroll?: string | null;
  tableRollName?: string | null;
  specialNote?: string | null;
  isMemberQuest?: boolean;
  runByUsername?: string | null;
};

function buildQuestEmbed(quest: QuestDoc): Record<string, unknown> {
  const title = (quest.title ?? "").trim() || "Quest";
  const description = (quest.description ?? "").trim() || "";
  const questType = quest.questType ?? "—";
  const questID = (quest.questID ?? "").trim() || "Q000000";
  const location = quest.location ?? "";
  const timeLimit = quest.timeLimit ?? "—";
  const dateStr = (quest.date ?? "").trim() || "—";
  const rules = (quest.rules ?? "").trim() || "—";
  const postReq = quest.postRequirement != null && !Number.isNaN(Number(quest.postRequirement)) ? Number(quest.postRequirement) : 15;
  const minRequirements = quest.minRequirements != null ? String(quest.minRequirements).trim() : "";

  const locationPreview = formatLocation(location);

  let rewardsText = "—";
  if (quest.tokenReward && String(quest.tokenReward).trim() && String(quest.tokenReward) !== "N/A") {
    rewardsText = `💰 ${String(quest.tokenReward).trim()}`;
    if (quest.collabAllowed && quest.collabRule) rewardsText += `\n(${String(quest.collabRule).trim()})`;
  } else if (quest.isMemberQuest && quest.specialNote) {
    const rewardsMatch = String(quest.specialNote).match(/Rewards \(member-supplied\):\s*(.+?)(?:\n|$)/i);
    rewardsText = rewardsMatch ? `💰 ${rewardsMatch[1].trim()}` : "💰 Member-supplied (see quest)";
  } else {
    rewardsText = "💰 N/A";
  }

  const dateYYYYMM = dateToYYYYMM(dateStr);
  const durationStr = timeLimit === "Custom" ? "" : timeLimit;
  const endDate = dateYYYYMM && durationStr ? getEndDateFromDuration(dateYYYYMM, durationStr) : null;
  const durationDisplay = endDate ? `${timeLimit} | Ends ${formatEndDateWithTime(endDate)}` : timeLimit;
  const signupDeadlineDisplay = formatSignupDeadline(quest.signupDeadline);

  const tableroll = (quest.tableroll ?? quest.tableRollName ?? "").trim();
  const participantCap = quest.participantCap != null && !Number.isNaN(Number(quest.participantCap)) ? Number(quest.participantCap) : null;
  const participationLines: string[] = [];
  if (participantCap != null) participationLines.push(`👥 Participation cap: ${participantCap}`);
  if (minRequirements && minRequirements !== "0") participationLines.push(`📝 Participation Requirement: ${minRequirements}`);
  if (questType === "RP") participationLines.push(`📝 Post requirement: ${postReq}`);
  if (tableroll) participationLines.push(`🎲 Table roll: **${tableroll}**`);
  const participationValue = participationLines.length ? participationLines.join("\n") : "—";

  const detailsLines = [
    `**Type:** ${questType}`,
    `**ID:** \`${questID}\``,
    `**Location:** ${locationPreview}`,
    `**Duration:** ${durationDisplay}`,
    `**Date:** ${dateStr.match(/^\d{4}-\d{2}$/) ? yyyyMmToDisplay(dateStr) : dateStr}`,
  ];
  if (signupDeadlineDisplay) detailsLines.push(`**Signup deadline:** ${signupDeadlineDisplay}`);
  if (quest.isMemberQuest && quest.runByUsername) detailsLines.push(`**Run by:** ${quest.runByUsername}`);

  const desc = description.length > 4096 ? description.slice(0, 4093) + "..." : description;
  const descriptionBlockquote = desc.trimEnd().split("\n").map((line) => (line === "" ? "" : `> ${line}`)).join("\n");

  return {
    title,
    description: descriptionBlockquote,
    color: EMBED_COLOR,
    fields: [
      { name: "**__📋 Details__**", value: detailsLines.join("\n"), inline: false },
      { name: "**__🏆 Rewards__**", value: rewardsText, inline: false },
      { name: "**__🗓️ Participation__**", value: participationValue, inline: false },
      { name: "**__📋 Rules__**", value: rules.length > 1024 ? rules.slice(0, 1021) + "..." : rules, inline: false },
      { name: "**__🎯 Join This Quest__**", value: `\`/quest join questid:${questID}\``, inline: false },
      { name: "**__👥 Participants (0)__**", value: "None", inline: false },
      { name: "**__📊 Recent Activity__**", value: "—", inline: false },
    ],
    image: { url: BORDER_IMAGE },
    timestamp: new Date().toISOString(),
    footer: quest.isMemberQuest ? { text: "Member quest" } : undefined,
  };
}

/**
 * Post a quest to the quest channel. Returns the Discord message ID or null on failure.
 */
export async function postQuestToQuestChannel(quest: QuestDoc): Promise<string | null> {
  if (!QUEST_CHANNEL_ID) {
    console.warn("[questDiscordPost] QUESTS_BOARD not set");
    return null;
  }
  try {
    const embed = buildQuestEmbed(quest);
    const content = MOD_ROLE_ID ? `<@&${MOD_ROLE_ID}>` : undefined;
    const payload: { embeds: unknown[]; content?: string; allowed_mentions?: { roles: string[] } } = { embeds: [embed] };
    if (content) {
      payload.content = content;
      payload.allowed_mentions = { roles: [MOD_ROLE_ID] };
    }
    const result = await discordApiRequest<{ id: string }>(
      `channels/${QUEST_CHANNEL_ID}/messages`,
      "POST",
      payload
    );
    return result?.id ?? null;
  } catch (err) {
    console.warn("[questDiscordPost] Failed to post quest to channel:", err);
    return null;
  }
}
