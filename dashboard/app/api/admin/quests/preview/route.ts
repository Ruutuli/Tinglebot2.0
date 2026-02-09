// ============================================================================
// POST /api/admin/quests/preview - Post quest embed preview to Discord (admin only)
// Posts ONLY the embed to the preview channel. Does NOT save the quest or make it go live.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdminUser } from "@/lib/session";
import { connect } from "@/lib/db";
import { discordApiRequest } from "@/lib/discord";
import { logger } from "@/utils/logger";

const QUEST_PREVIEW_CHANNEL_ID = "1391812848099004578";
const BORDER_IMAGE = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const EMBED_COLOR = 0xaa916a; // #AA916A

const VILLAGE_EMOJIS = {
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

function getEndDateFromDuration(startYYYYMM: string, duration: string): Date | null {
  if (!startYYYYMM || !/^\d{4}-\d{2}$/.test(startYYYYMM)) return null;
  const [y, m] = startYYYYMM.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  if (Number.isNaN(start.getTime())) return null;
  const d = String(duration).toLowerCase();
  let end: Date;
  const weekMatch = d.match(/(\d+)\s*week/);
  const monthMatch = d.match(/(\d+)\s*month/);
  const dayMatch = d.match(/(\d+)\s*day/);
  if (weekMatch) {
    end = new Date(start);
    end.setDate(end.getDate() + parseInt(weekMatch[1], 10) * 7);
  } else if (monthMatch) {
    end = new Date(start);
    end.setMonth(end.getMonth() + parseInt(monthMatch[1], 10));
  } else if (dayMatch) {
    end = new Date(start);
    end.setDate(end.getDate() + parseInt(dayMatch[1], 10));
  } else if (duration === "Custom") {
    return null;
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

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function yyyyMmToDisplay(ym: string): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  const monthIdx = parseInt(m, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return ym;
  return `${MONTH_NAMES[monthIdx]} ${y}`;
}

/** Parse "March 2026" (display) back to "2026-03" for end-date math, or return as-is if already YYYY-MM. */
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

/** Format signup deadline (ISO date or YYYY-MM-DD) for display. */
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

/** Known emojis for items that may not have emoji in DB */
const KNOWN_ITEM_EMOJIS: Record<string, string> = {
  "spirit orb": "<:spiritorb:1171310851748270121>",
};

/** Parse raw token string (flat:300 per_unit:200 etc) to human-readable display. Omit collab when collab not allowed and bonus is 0. */
function formatTokenRewardForDisplay(
  raw: string,
  opts?: { collabAllowed?: boolean }
): string | null {
  if (!raw?.trim() || raw === "N/A" || ["None", "No reward"].includes(raw)) return null;
  const s = String(raw).trim();
  const flat = s.match(/flat:(\d+)/i)?.[1];
  const perUnit = s.match(/per_unit:(\d+)/i)?.[1];
  const unitQuoted = s.match(/\bunit:"((?:[^"\\]|\\.)*)"/i)?.[1];
  const unitUnquoted = !unitQuoted ? s.match(/\bunit:(\S+)/i)?.[1] : null;
  const unit = unitQuoted ? unitQuoted.replace(/\\"/g, '"') : (unitUnquoted ?? null);
  const max = s.match(/max:(\d+)/i)?.[1];
  const collab = s.match(/collab_bonus:(\d+)/i)?.[1];
  const parts: string[] = [];
  if (flat) parts.push(`${flat} tokens base`);
  if (perUnit) parts.push(max && unit ? `${perUnit} tokens per ${unit} (cap ${max})` : unit ? `${perUnit} tokens per ${unit}` : `${perUnit} tokens per unit`);
  const showCollab = collab && (opts?.collabAllowed === true || (collab !== "0" && collab !== ""));
  if (showCollab) parts.push(`${collab} tokens collab bonus`);
  if (parts.length) return parts.join(" + ");
  return s;
}

async function buildRewardsText(body: Record<string, unknown>): Promise<string> {
  const parts: string[] = [];
  const tokenReward = body.tokenReward;
  if (tokenReward && typeof tokenReward === "string") {
    const collabAllowed = body.collabAllowed === true;
    const display = formatTokenRewardForDisplay(tokenReward, { collabAllowed });
    if (display) parts.push(display.includes("tokens") ? `💰 ${display}` : `💰 ${display} tokens`);
  }
  if (body.collabAllowed && body.collabRule) {
    parts.push(`(${String(body.collabRule).trim()})`);
  }
  const itemRewards = body.itemRewards as Array<{ name: string; quantity?: number }> | undefined;
  if (Array.isArray(itemRewards) && itemRewards.length > 0) {
    const names = itemRewards.filter((r) => r?.name?.trim()).map((r) => r.name);
    let emojiMap: Record<string, string> = {};
    if (names.length > 0) {
      try {
        await connect();
        const Item = (await import("@/models/ItemModel.js")).default;
        const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
        const items = await Item.find({
          $or: escaped.map((e) => ({ itemName: new RegExp(`^${e}$`, "i") })),
        })
          .select("itemName emoji")
          .lean();
        for (const item of items) {
          const name = (item as { itemName?: string }).itemName;
          const emoji = (item as { emoji?: string }).emoji;
          const s = emoji && String(emoji).trim() ? String(emoji).trim() : "";
          if (name) emojiMap[name.toLowerCase()] = s || KNOWN_ITEM_EMOJIS[name.toLowerCase()] || "";
        }
        for (const r of itemRewards) {
          const key = r?.name?.trim()?.toLowerCase();
          if (key && !(key in emojiMap)) emojiMap[key] = KNOWN_ITEM_EMOJIS[key] || "";
        }
      } catch {
        /* ignore */
      }
    }
    const items = itemRewards
      .filter((r) => r?.name?.trim())
      .map((r) => {
        const emoji = emojiMap[r.name.toLowerCase()]?.trim();
        return emoji ? `${emoji} ${r.name} x${r.quantity ?? 1}` : `${r.name} x${r.quantity ?? 1}`;
      });
    if (items.length) parts.push(items.map((i) => `> ${i}`).join("\n"));
  }
  return parts.length ? parts.join("\n") : "—";
}

async function buildQuestPreviewEmbed(body: Record<string, unknown>) {
  const title = (body.title as string)?.trim() || "Quest title";
  const description = (body.description as string)?.trim() || "Quest description will appear here.";
  const questType = (body.questType as string) || "—";
  const questID = (body.questID as string)?.trim() || "Q000000";
  const location = (body.location as string) || "";
  const timeLimit = (body.timeLimit as string) || "—";
  const date = (body.date as string)?.trim() || "—";
  const rules = (body.rules as string)?.trim() || "—";
  const status = (body.status as string) || "active";
  const postReq = body.postRequirement != null && !Number.isNaN(Number(body.postRequirement))
    ? Number(body.postRequirement)
    : 15;
  const minRequirements =
    (body.minRequirements != null ? String(body.minRequirements) : "").trim() || "";

  const color = EMBED_COLOR;
  const locationPreview = formatLocation(location);
  const rewardsText = await buildRewardsText(body);

  const dateStr = (body.date as string)?.trim() || "";
  const dateYYYYMM = dateToYYYYMM(dateStr);
  const durationStr = timeLimit === "Custom" ? (body.timeLimitCustom as string)?.trim() || "" : timeLimit;
  const endDate = dateYYYYMM && durationStr && timeLimit !== "Custom"
    ? getEndDateFromDuration(dateYYYYMM, durationStr)
    : null;
  const durationDisplay = endDate
    ? `${durationStr} | Ends ${formatEndDateWithTime(endDate)}`
    : timeLimit;
  const signupDeadlineDisplay = formatSignupDeadline(body.signupDeadline);

  const tableroll = (body.tableroll as string)?.trim() || "";
  const participationLines: string[] = [];
  if (minRequirements && minRequirements !== "0") participationLines.push(`📝 Participation Requirement: ${minRequirements}`);
  if (questType === "RP") participationLines.push(`📝 Post requirement: ${postReq}`);
  if (tableroll) participationLines.push(`🎲 Table roll: **${tableroll}**`);
  const participationValue = participationLines.length ? participationLines.join("\n") : "—";

  const detailsLines = [
    `**Type:** ${questType}`,
    `**ID:** \`${questID}\``,
    `**Location:** ${locationPreview}`,
    `**Duration:** ${durationDisplay}`,
    `**Date:** ${dateStr ? (dateStr.match(/^\d{4}-\d{2}$/) ? yyyyMmToDisplay(dateStr) : dateStr) : "—"}`,
  ];
  if (signupDeadlineDisplay) {
    detailsLines.push(`**Signup deadline:** ${signupDeadlineDisplay}`);
  }
  const fields: { name: string; value: string; inline?: boolean }[] = [
    {
      name: "**__📋 Details__**",
      value: detailsLines.join("\n"),
      inline: false,
    },
    { name: "**__🏆 Rewards__**", value: rewardsText, inline: false },
    {
      name: "**__🗓️ Participation__**",
      value: participationValue,
      inline: false,
    },
    { name: "**__📋 Rules__**", value: rules.length > 1024 ? rules.slice(0, 1021) + "..." : rules, inline: false },
    {
      name: "**__🎯 Join This Quest__**",
      value: `\`/quest join questid:${questID}\``,
      inline: false,
    },
    { name: "**__👥 Participants (0)__**", value: "None", inline: false },
    { name: "**__📊 Recent Activity__**", value: "—", inline: false },
  ];

  const desc = description.length > 4096 ? description.slice(0, 4093) + "..." : description;
  const descriptionBlockquote = desc.trimEnd().split("\n").map((line) => (line === "" ? "" : `> ${line}`)).join("\n");

  return {
    title,
    description: descriptionBlockquote,
    color,
    fields,
    image: { url: BORDER_IMAGE },
    timestamp: new Date().toISOString(),
    footer: { text: "Preview – Quest not yet live" },
  };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = await isAdminUser(user.id);
    if (!admin) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await req.json();

    // Minimal validation - at least title and description for a sensible preview
    const title = (body.title as string)?.trim();
    if (!title) {
      return NextResponse.json(
        { error: "Validation failed", message: "Title is required for preview" },
        { status: 400 }
      );
    }

    const embed = await buildQuestPreviewEmbed(body);

    const result = await discordApiRequest<{ id: string }>(
      `channels/${QUEST_PREVIEW_CHANNEL_ID}/messages`,
      "POST",
      { embeds: [embed] }
    );

    if (!result?.id) {
      logger.error(
        "api/admin/quests/preview POST",
        "Failed to post preview to Discord. Check channel ID and bot permissions."
      );
      return NextResponse.json(
        { error: "Failed to post preview to Discord" },
        { status: 500 }
      );
    }

    logger.info("api/admin/quests/preview POST", `Posted quest preview to channel ${QUEST_PREVIEW_CHANNEL_ID}`);
    return NextResponse.json({ success: true, messageId: result.id });
  } catch (e) {
    logger.error(
      "api/admin/quests/preview POST",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to post preview" },
      { status: 500 }
    );
  }
}
