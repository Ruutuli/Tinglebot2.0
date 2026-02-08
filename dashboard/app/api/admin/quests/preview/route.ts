// ============================================================================
// POST /api/admin/quests/preview - Post quest embed preview to Discord (admin only)
// Posts ONLY the embed to the preview channel. Does NOT save the quest or make it go live.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdminUser } from "@/lib/session";
import { discordApiRequest } from "@/lib/discord";
import { logger } from "@/utils/logger";

const QUEST_PREVIEW_CHANNEL_ID = "1391812848099004578";
const BORDER_IMAGE = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const EMBED_COLOR_ACTIVE = 0x00ff00; // Green
const EMBED_COLOR_COMPLETED = 0xfee75c; // Yellow

function formatLocation(location: string): string {
  if (!location?.trim()) return "Not specified";
  const l = location.toLowerCase();
  const parts: string[] = [];
  if (l.includes("rudania")) parts.push(":rudania: Rudania");
  if (l.includes("inariko")) parts.push(":inariko: Inariko");
  if (l.includes("vhintl")) parts.push(":vhintl: Vhintl");
  if (parts.length) return parts.join(", ");
  return location.trim();
}

function buildRewardsText(body: Record<string, unknown>): string {
  const parts: string[] = [];
  const tokenReward = body.tokenReward;
  if (tokenReward && typeof tokenReward === "string" && tokenReward !== "N/A" && !["None", "No reward"].includes(tokenReward)) {
    parts.push(`💰 ${tokenReward}`);
  }
  if (body.collabAllowed && body.collabRule) {
    parts.push(`(${String(body.collabRule).trim()})`);
  }
  const itemRewards = body.itemRewards as Array<{ name: string; quantity?: number }> | undefined;
  if (Array.isArray(itemRewards) && itemRewards.length > 0) {
    const items = itemRewards.filter((r) => r?.name?.trim()).map((r) => `${r.name} x${r.quantity ?? 1}`);
    if (items.length) parts.push(items.join(", "));
  }
  return parts.length ? parts.join("\n") : "—";
}

function buildQuestPreviewEmbed(body: Record<string, unknown>) {
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
  const minRequirements = (body.minRequirements as string)?.trim() || "";

  const color = status === "completed" ? EMBED_COLOR_COMPLETED : EMBED_COLOR_ACTIVE;
  const locationPreview = formatLocation(location);
  const rewardsText = buildRewardsText(body);

  const fields: { name: string; value: string; inline?: boolean }[] = [
    {
      name: "**__📋 Details__**",
      value: [
        `Type: ${questType}`,
        `ID: ${questID}`,
        `Location: ${locationPreview}`,
        `Duration: ${timeLimit}`,
        `Date: ${date}`,
      ].join("\n"),
      inline: false,
    },
    { name: "**__🏆 Rewards__**", value: rewardsText, inline: false },
    {
      name: "**__🗓️ Participation__**",
      value: minRequirements
        ? `📝 Min requirement: ${minRequirements}`
        : questType === "RP"
          ? `📝 RP Posts Required (${postReq})`
          : "—",
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

  return {
    title,
    description: description.length > 4096 ? description.slice(0, 4093) + "..." : description,
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

    const embed = buildQuestPreviewEmbed(body);

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
