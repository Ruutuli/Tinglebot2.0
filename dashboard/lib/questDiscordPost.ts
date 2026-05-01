/**
 * Post a quest embed to the quest channel (e.g. when a member quest is approved).
 * Uses QUESTS_BOARD env or fallback channel ID. Does not throw; returns null on failure.
 */

import { discordApiRequest } from "@/lib/discord";

const QUEST_CHANNEL_ID = process.env.QUESTS_BOARD || "706880599863853097";
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

export type QuestDoc = {
  title?: string | null;
  description?: string | null;
  rules?: string | null;
  date?: string | null;
  questType?: string | null;
  location?: string | null;
  timeLimit?: string | null;
  /** YYYY-MM-DD; end of that civil day US Eastern (matches QuestModel). */
  timeLimitEndDate?: string | null;
  questID?: string | null;
  tokenReward?: string | null;
  collabAllowed?: boolean;
  collabRule?: string | null;
  postRequirement?: number | null;
  minRequirements?: string | number | null;
  participantCap?: number | null;
  signupDeadline?: string | null;
  tableroll?: string | null;
  /** When timeLimit is "Custom", optional display text (e.g. dashboard preview). */
  timeLimitCustom?: string | null;
  tableRollName?: string | null;
  tableRollNames?: string[] | null;
  specialNote?: string | null;
  isMemberQuest?: boolean;
  runByUsername?: string | null;
  /** When set (e.g. dashboard preview with item emojis), used instead of token/specialNote reward formatting. */
  rewardsDisplayText?: string | null;
};

const QUEST_EMBED_DESC_MAX = 4096;
const QUEST_EMBED_FIELD_MAX = 1024;
const QUEST_EMBED_MAX_FIELDS = 25;
export const QUEST_EMBED_MAX_PER_MESSAGE = 10;

function linesToBlockquote(lines: string[]): string {
  return lines.map((line) => (line === "" ? "" : `> ${line}`)).join("\n");
}

function splitRawIntoBlockquotedDescChunks(rawDesc: string, maxLen = QUEST_EMBED_DESC_MAX): string[] {
  const trimmed = (rawDesc ?? "").trimEnd();
  if (!trimmed) return [];
  const lines = trimmed.split("\n");
  const chunks: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) {
      chunks.push(linesToBlockquote(buf));
      buf = [];
    }
  };
  for (const line of lines) {
    const segment = line === "" ? "" : `> ${line}`;
    const addLen = buf.length === 0 ? segment.length : segment.length + 1;
    if (segment.length > maxLen) {
      flush();
      const prefix = "> ";
      const maxRaw = maxLen - prefix.length;
      let rest = line;
      while (rest.length > 0) {
        chunks.push(prefix + rest.slice(0, maxRaw));
        rest = rest.slice(maxRaw);
      }
      continue;
    }
    if (buf.length > 0 && linesToBlockquote(buf).length + 1 + segment.length > maxLen) {
      flush();
    }
    buf.push(line);
  }
  flush();
  return chunks;
}

function splitEmbedFieldValue(text: string, maxLen = QUEST_EMBED_FIELD_MAX): string[] {
  const t = String(text ?? "");
  if (t.length <= maxLen) return [t];
  const parts: string[] = [];
  let rest = t;
  while (rest.length > 0) {
    if (rest.length <= maxLen) {
      parts.push(rest);
      break;
    }
    let cut = rest.lastIndexOf("\n", maxLen);
    if (cut < 0 || cut < maxLen / 2) cut = maxLen;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }
  return parts;
}

function fieldPartsToDescChunks(parts: string[], maxDesc = QUEST_EMBED_DESC_MAX): string[] {
  const chunks: string[] = [];
  let buf = "";
  for (const part of parts) {
    const block = part.split("\n").map((l) => (l === "" ? "" : `> ${l}`)).join("\n");
    const next = buf ? `${buf}\n\n${block}` : block;
    if (next.length > maxDesc && buf) {
      chunks.push(buf);
      buf = block;
    } else {
      buf = next;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function mergePrefixIntoDescChunks(prefix: string, chunks: string[]): string[] {
  if (!prefix) return chunks;
  if (chunks.length === 0) {
    if (!prefix.trim()) return [];
    return prefix.length <= QUEST_EMBED_DESC_MAX ? [prefix] : [prefix.slice(0, QUEST_EMBED_DESC_MAX)];
  }
  const first = prefix + chunks[0];
  if (first.length <= QUEST_EMBED_DESC_MAX) return [first, ...chunks.slice(1)];
  const room = QUEST_EMBED_DESC_MAX - prefix.length;
  if (room < 1) return [prefix.slice(0, QUEST_EMBED_DESC_MAX), ...chunks];
  const head = prefix + chunks[0].slice(0, room);
  const tail = chunks[0].slice(room);
  const next = tail ? [tail, ...chunks.slice(1)] : chunks.slice(1);
  return [head, ...next];
}

function truncateDiscordEmbedTitle(title: string, suffix: string): string {
  const s = String(suffix ?? "");
  const maxTitle = 256 - s.length;
  const base = (title ?? "").trim() || "Quest";
  if (base.length <= maxTitle) return base + s;
  return `${base.slice(0, Math.max(1, maxTitle - 1))}…${s}`;
}

/** Multiple embeds when description, rewards, or rules exceed Discord limits (max 10 per message). */
export function buildQuestEmbeds(quest: QuestDoc): Record<string, unknown>[] {
  const title = (quest.title ?? "").trim() || "Quest";
  const displayTitle = quest.isMemberQuest ? `🏠 ${title}` : title;
  const description = (quest.description ?? "").trim() || "";
  const questType = quest.questType ?? "—";
  const questID = (quest.questID ?? "").trim() || "Q000000";
  const location = quest.location ?? "";
  const timeLimit = quest.timeLimit ?? "—";
  const dateStr = (quest.date ?? "").trim() || "—";
  const rulesRaw = (quest.rules ?? "").trim() || "—";
  const postReq = quest.postRequirement != null && !Number.isNaN(Number(quest.postRequirement)) ? Number(quest.postRequirement) : 15;
  const minRequirements = quest.minRequirements != null ? String(quest.minRequirements).trim() : "";

  const locationPreview = formatLocation(location);

  let rewardsText = "—";
  if (quest.rewardsDisplayText != null && String(quest.rewardsDisplayText).trim() !== "") {
    rewardsText = String(quest.rewardsDisplayText).trim();
  } else if (quest.tokenReward && String(quest.tokenReward).trim() && String(quest.tokenReward) !== "N/A") {
    rewardsText = `💰 ${String(quest.tokenReward).trim()}`;
    if (quest.collabAllowed && quest.collabRule) rewardsText += `\n(${String(quest.collabRule).trim()})`;
  } else if (quest.isMemberQuest && quest.specialNote) {
    const rewardsMatch = String(quest.specialNote).match(/Rewards \(member-supplied\):\s*(.+?)(?:\n|$)/i);
    rewardsText = rewardsMatch ? `💰 ${rewardsMatch[1].trim()}` : "💰 Member-supplied (see quest)";
  } else {
    rewardsText = "💰 N/A";
  }

  const dateYYYYMM = dateToYYYYMM(dateStr);
  const durationStr = timeLimit === "Custom" ? (quest.timeLimitCustom?.trim() || "") : timeLimit;
  const endDateExplicit = (() => {
    const raw = quest.timeLimitEndDate?.trim();
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const [y, mo, d] = raw.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  })();
  const endDate =
    endDateExplicit ?? (dateYYYYMM && durationStr ? getEndDateFromDuration(dateYYYYMM, durationStr) : null);
  const durationDisplay = endDate ? `${timeLimit} | Ends ${formatEndDateWithTime(endDate)}` : timeLimit;
  const signupDeadlineDisplay = formatSignupDeadline(quest.signupDeadline);

  const rollNameList =
    Array.isArray(quest.tableRollNames) && quest.tableRollNames.length > 0
      ? [...new Set(quest.tableRollNames.map((s) => String(s).trim()).filter(Boolean))]
      : [];
  const tableroll =
    rollNameList.length > 0
      ? rollNameList.join(", ")
      : (quest.tableroll ?? quest.tableRollName ?? "").trim();
  const participantCap = quest.participantCap != null && !Number.isNaN(Number(quest.participantCap)) ? Number(quest.participantCap) : null;
  const participationLines: string[] = [];
  if (participantCap != null) participationLines.push(`👥 Participation cap: ${participantCap}`);
  if (minRequirements && minRequirements !== "0") participationLines.push(`📝 Participation Requirement: ${minRequirements}`);
  if (questType === "RP" || questType === "Interactive / RP") participationLines.push(`📝 Post requirement: ${postReq}`);
  if (tableroll)
    participationLines.push(
      `🎲 Table roll${tableroll.includes(",") ? "s" : ""}: **${tableroll}**`
    );
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

  const memberRunLabel = quest.isMemberQuest
    ? `**🏠 MEMBER-RUN QUEST** — Run by: **${(quest.runByUsername ?? "Member").trim()}**\n\n`
    : "";
  let descChunks = splitRawIntoBlockquotedDescChunks(description);
  descChunks = mergePrefixIntoDescChunks(memberRunLabel, descChunks);

  const rewardsParts = splitEmbedFieldValue(rewardsText);
  const rulesParts = splitEmbedFieldValue(rulesRaw);
  const tailFieldSlots = 4;
  const midFieldBudget = Math.max(0, QUEST_EMBED_MAX_FIELDS - 1 - tailFieldSlots);
  const rewardsOnMain = rewardsParts.slice(0, Math.min(rewardsParts.length, midFieldBudget));
  const rulesSlots = midFieldBudget - rewardsOnMain.length;
  const rulesOnMain = rulesParts.slice(0, Math.max(0, rulesSlots));
  const rewardsRemainingParts = rewardsParts.slice(rewardsOnMain.length);
  const rulesRemainingParts = rulesParts.slice(rulesOnMain.length);

  const memberFooter = quest.isMemberQuest ? { text: "Member-run quest — not an official mod-run quest" } : undefined;

  const main: Record<string, unknown> = {
    title: displayTitle,
    color: EMBED_COLOR,
    fields: [
      { name: "**__📋 Details__**", value: detailsLines.join("\n"), inline: false },
      ...rewardsOnMain.map((part, i) => ({
        name: i === 0 ? "**__🏆 Rewards__**" : "**__🏆 Rewards (continued)__**",
        value: part,
        inline: false,
      })),
      { name: "**__🗓️ Participation__**", value: participationValue, inline: false },
      ...rulesOnMain.map((part, i) => ({
        name: i === 0 ? "**__📋 Rules__**" : `**__📋 Rules (${i + 1})__**`,
        value: part,
        inline: false,
      })),
      {
        name: "**__🎯 Join This Quest__**",
        value: `\`/quest join questid:${questID}\``,
        inline: false,
      },
      { name: "**__👥 Participants (0)__**", value: "None", inline: false },
      { name: "**__📊 Recent Activity__**", value: "—", inline: false },
    ],
    image: { url: BORDER_IMAGE },
    timestamp: new Date().toISOString(),
    footer: memberFooter,
  };
  if (descChunks.length > 0) main.description = descChunks[0];

  const embeds: Record<string, unknown>[] = [main];

  for (let i = 1; i < descChunks.length; i++) {
    embeds.push({
      title: truncateDiscordEmbedTitle(displayTitle, " (continued)"),
      description: descChunks[i],
      color: EMBED_COLOR,
    });
  }

  const rewardsDescChunks = fieldPartsToDescChunks(rewardsRemainingParts);
  for (let i = 0; i < rewardsDescChunks.length; i++) {
    const suf = rewardsDescChunks.length > 1 ? ` (${i + 1}/${rewardsDescChunks.length})` : "";
    embeds.push({
      title: truncateDiscordEmbedTitle(displayTitle, ` — Rewards${suf}`),
      description: rewardsDescChunks[i],
      color: EMBED_COLOR,
    });
  }

  const rulesDescChunks = fieldPartsToDescChunks(rulesRemainingParts);
  for (let i = 0; i < rulesDescChunks.length; i++) {
    const suf = rulesDescChunks.length > 1 ? ` (${i + 1}/${rulesDescChunks.length})` : "";
    embeds.push({
      title: truncateDiscordEmbedTitle(displayTitle, ` — Rules${suf}`),
      description: rulesDescChunks[i],
      color: EMBED_COLOR,
    });
  }

  if (embeds.length > QUEST_EMBED_MAX_PER_MESSAGE) {
    const kept = embeds.slice(0, QUEST_EMBED_MAX_PER_MESSAGE);
    const last = kept[QUEST_EMBED_MAX_PER_MESSAGE - 1] as { description?: string };
    const prevDesc = typeof last.description === "string" ? last.description : "";
    const note = "\n\n> _[Content truncated: Discord allows at most 10 embeds per message.]_";
    if (prevDesc.length + note.length <= QUEST_EMBED_DESC_MAX) last.description = prevDesc + note;
    return kept;
  }

  return embeds;
}

/** @deprecated Prefer buildQuestEmbeds for long content; this returns only the first embed. */
export function buildQuestEmbed(quest: QuestDoc): Record<string, unknown> {
  return buildQuestEmbeds(quest)[0];
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
    const embeds = buildQuestEmbeds(quest);
    const result = await discordApiRequest<{ id: string }>(
      `channels/${QUEST_CHANNEL_ID}/messages`,
      "POST",
      { embeds: embeds.slice(0, QUEST_EMBED_MAX_PER_MESSAGE) }
    );
    return result?.id ?? null;
  } catch (err) {
    console.warn("[questDiscordPost] Failed to post quest to channel:", err);
    return null;
  }
}
