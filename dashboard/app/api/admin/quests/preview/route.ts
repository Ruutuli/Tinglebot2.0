// ============================================================================
// POST /api/admin/quests/preview - Post quest embed preview to Discord (admin only)
// Posts ONLY the embed to the preview channel. Does NOT save the quest or make it go live.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getSession, isAdminUser } from "@/lib/session";
import { connect } from "@/lib/db";
import { discordApiRequest } from "@/lib/discord";
import { buildQuestEmbeds, QUEST_EMBED_MAX_PER_MESSAGE, type QuestDoc } from "@/lib/questDiscordPost";
import { logger } from "@/utils/logger";

const QUEST_PREVIEW_CHANNEL_ID = "1391812848099004578";

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

async function buildQuestPreviewEmbeds(body: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const rewardsText = await buildRewardsText(body);
  const timeLimit = (body.timeLimit as string) || "—";
  const questDoc: QuestDoc = {
    title: (body.title as string)?.trim() || "Quest title",
    description: (body.description as string)?.trim() || "Quest description will appear here.",
    rules: (body.rules as string)?.trim() || "—",
    date: (body.date as string)?.trim() || "—",
    questType: (body.questType as string) || "—",
    location: (body.location as string) || "",
    timeLimit,
    timeLimitCustom: timeLimit === "Custom" ? (body.timeLimitCustom as string)?.trim() || undefined : undefined,
    timeLimitEndDate: typeof body.timeLimitEndDate === "string" ? body.timeLimitEndDate.trim() : null,
    questID: (body.questID as string)?.trim() || "Q000000",
    tokenReward: typeof body.tokenReward === "string" ? body.tokenReward : undefined,
    collabAllowed: body.collabAllowed === true,
    collabRule: typeof body.collabRule === "string" ? body.collabRule : undefined,
    postRequirement:
      body.postRequirement != null && !Number.isNaN(Number(body.postRequirement))
        ? Number(body.postRequirement)
        : 15,
    minRequirements: body.minRequirements != null ? String(body.minRequirements).trim() : "",
    participantCap:
      body.participantCap != null && !Number.isNaN(Number(body.participantCap))
        ? Number(body.participantCap)
        : null,
    signupDeadline: body.signupDeadline as string | undefined,
    tableRollNames: Array.isArray(body.tableRollNames)
      ? [
          ...new Set(
            (body.tableRollNames as unknown[])
              .filter((x): x is string => typeof x === "string")
              .map((s) => s.trim())
              .filter(Boolean)
          ),
        ]
      : undefined,
    tableroll: typeof body.tableroll === "string" ? body.tableroll.trim() : undefined,
    rewardsDisplayText: rewardsText,
  };
  const embeds = buildQuestEmbeds(questDoc);
  const first = embeds[0] as Record<string, unknown> | undefined;
  if (first) first.footer = { text: "Preview – Quest not yet live" };
  return embeds.slice(0, QUEST_EMBED_MAX_PER_MESSAGE);
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

    const embeds = await buildQuestPreviewEmbeds(body);

    const result = await discordApiRequest<{ id: string }>(
      `channels/${QUEST_PREVIEW_CHANNEL_ID}/messages`,
      "POST",
      { embeds }
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
