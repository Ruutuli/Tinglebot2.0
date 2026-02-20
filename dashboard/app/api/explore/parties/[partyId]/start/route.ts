// POST /api/explore/parties/[partyId]/start — create Discord thread for expedition, post embed, @members

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getAppUrl } from "@/lib/config";
import { discordApiRequest, discordApiPostWithFile, getExploreCommandId } from "@/lib/discord";
import mongoose from "mongoose";
import path from "path";
import fs from "fs/promises";

export const dynamic = "force-dynamic";

const DISCORD_EXPEDITION_CHANNEL_ID = "1473589990196908147";

// Discord thread auto-archive (minutes). Discord allows: 60, 1440, 4320, 10080 — no 5h, using 24h
const EXPLORATION_THREAD_AUTO_ARCHIVE_MINUTES = 1440;

const REGIONS: Record<string, { label: string; village: string }> = {
  eldin: { label: "Eldin", village: "Rudania" },
  lanayru: { label: "Lanayru", village: "Inariko" },
  faron: { label: "Faron", village: "Vhintl" },
};

// Banner images from dashboard/public/assets/banners (filename only for reading from disk)
const REGION_BANNER_FILES: Record<string, string> = {
  eldin: "Rudania1.png",
  lanayru: "Inariko1.png",
  faron: "Vhintl1.png",
};

const EMBED_ATTACHMENT_FILENAME = "banner.png";

type PartyMemberDoc = {
  _id: unknown;
  userId: string;
  name: string;
  currentHearts?: number;
  currentStamina?: number;
  items?: Array<{ itemName: string }>;
};

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> }
) {
  try {
    const session = await getSession();
    const currentUserId = session.user?.id ?? null;
    if (!currentUserId) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const { partyId } = await params;
    if (!partyId) {
      return NextResponse.json({ error: "Missing party ID" }, { status: 400 });
    }

    await connect();

    const Party =
      mongoose.models.Party ??
      ((await import("@/models/PartyModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;
    const Character =
      mongoose.models.Character ??
      ((await import("@/models/CharacterModel.js")) as { default: mongoose.Model<unknown> }).default;
    const ModCharacter =
      mongoose.models.ModCharacter ??
      ((await import("@/models/ModCharacterModel.js")) as { default: mongoose.Model<unknown> }).default;

    const party = await Party.findOne({ partyId }).lean();
    if (!party) {
      return NextResponse.json({ error: "Expedition not found" }, { status: 404 });
    }

    const p = party as Record<string, unknown>;
    if (p.status === "cancelled") {
      return NextResponse.json({ error: "Expedition was cancelled" }, { status: 404 });
    }
    if (p.status === "open") {
      const createdAt = p.createdAt instanceof Date ? p.createdAt.getTime() : typeof p.createdAt === "string" ? new Date(p.createdAt).getTime() : NaN;
      if (!Number.isNaN(createdAt) && createdAt < Date.now() - 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "Expedition expired" }, { status: 404 });
      }
    }
    if (String(p.leaderId) !== currentUserId) {
      return NextResponse.json({ error: "Only the expedition leader can start it" }, { status: 403 });
    }

    if (String(p.status) === "started") {
      return NextResponse.json({ error: "Expedition already started" }, { status: 400 });
    }

    const characters = (p.characters as PartyMemberDoc[]) ?? [];
    if (characters.length < 1) {
      return NextResponse.json(
        { error: "Need at least 1 party member to start the expedition." },
        { status: 400 }
      );
    }
    const region = String(p.region ?? "");
    const square = String(p.square ?? "");
    const quadrant = String(p.quadrant ?? "");
    const totalHearts = typeof p.totalHearts === "number" ? p.totalHearts : 0;
    const totalStamina = typeof p.totalStamina === "number" ? p.totalStamina : 0;
    const regionInfo = REGIONS[region];
    const regionLabel = regionInfo?.label ?? region;
    const village = regionInfo?.village ?? "";

    let baseUrl = getAppUrl().replace(/\/$/, "");
    if (baseUrl.includes("localhost") || baseUrl.startsWith("http://127.0.0.1")) {
      baseUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://tinglebot.xyz").replace(/\/$/, "");
    }
    const expeditionUrl = `${baseUrl}/explore/${encodeURIComponent(partyId)}`;
    const bannerFilename = region ? REGION_BANNER_FILES[region] : null;

    const memberBlocks: string[] = [];
    for (let i = 0; i < characters.length; i++) {
      const c = characters[i];
      let hearts: number | string = typeof c.currentHearts === "number" ? c.currentHearts : NaN;
      let stamina: number | string = typeof c.currentStamina === "number" ? c.currentStamina : NaN;
      if (Number.isNaN(hearts) || Number.isNaN(stamina)) {
        const charId = c._id instanceof mongoose.Types.ObjectId ? c._id : new mongoose.Types.ObjectId(String(c._id));
        let charDoc = await Character.findById(charId).select("currentHearts maxHearts currentStamina maxStamina").lean();
        if (!charDoc) {
          charDoc = await ModCharacter.findById(charId).select("currentHearts maxHearts currentStamina maxStamina").lean();
        }
        const ch = charDoc as Record<string, unknown> | null;
        if (Number.isNaN(hearts)) hearts = typeof ch?.currentHearts === "number" ? ch.currentHearts : typeof ch?.maxHearts === "number" ? ch.maxHearts : "?";
        if (Number.isNaN(stamina)) stamina = typeof ch?.currentStamina === "number" ? ch.currentStamina : typeof ch?.maxStamina === "number" ? ch.maxStamina : "?";
      }
      const itemsStr =
        Array.isArray(c.items) && c.items.length > 0
          ? c.items.map((it) => it.itemName).join(", ")
          : "—";
      memberBlocks.push(
        `**Turn ${i + 1} — ${String(c.name)}**\n` +
          `> ❤️ ${hearts} hearts · 🟩 ${stamina} stamina\n` +
          `> 📦 ${itemsStr}`
      );
    }
    const partyValue =
      memberBlocks.length > 0
        ? memberBlocks.join("\n\n")
        : "> —";

    const embed: {
      title: string;
      description: string;
      url: string;
      color: number;
      thumbnail?: { url: string };
      image?: { url: string };
      fields: Array<{ name: string; value: string; inline?: boolean }>;
      footer: { text: string };
      timestamp: string;
    } = {
      title: `🗺️ Expedition ${partyId}`,
      description: `Expedition is **locked in** and ready to run. Use the link below to open the expedition page.`,
      url: expeditionUrl,
      color: 2990110,
      fields: [
        { name: "__📍 Region__", value: `> ${regionLabel}`, inline: true },
        { name: "__🏘️ Village__", value: `> ${village || "—"}`, inline: true },
        { name: "__🔄 Start__", value: `> ${square} ${quadrant}`, inline: true },
        {
          name: "__❤️ Party total__",
          value: `> **${totalHearts}** hearts · **${totalStamina}** stamina`,
          inline: false,
        },
        {
          name: `__👥 Party (${characters.length}/4) — turn order__`,
          value: partyValue,
          inline: false,
        },
        {
          name: "__🆔 Expedition ID__",
          value: `\`\`\`\n${partyId}\n\`\`\``,
          inline: false,
        },
        {
          name: "__📋 Commands__",
          value:
            characters.length > 0
              ? `**Take your turn:**\n• </explore roll:${await getExploreCommandId()}> — id: \`${partyId}\` charactername: **${String(characters[0].name)}**`
              : "Use the expedition page link below to manage the party.",
          inline: false,
        },
        {
          name: "__🔗 Expedition page__",
          value: `> [Open in dashboard](${expeditionUrl})`,
          inline: false,
        },
      ],
      footer: { text: "Tinglebot · Roots of the Wild" },
      timestamp: new Date().toISOString(),
    };
    // embed.image set only when sending file attachment below

    const mentionContent = characters
      .map((c) => `<@${c.userId}>`)
      .filter(Boolean)
      .join(" ");

    const threadName = `📍 | Expedition ${partyId}`.slice(0, 100);
    const existingThreadId = typeof p.discordThreadId === "string" ? p.discordThreadId.trim() : null;

    let threadId: string;

    if (existingThreadId) {
      const existing = await discordApiRequest<{ id: string; archived?: boolean }>(
        `channels/${existingThreadId}`,
        "GET"
      );
      if (existing?.id) {
        if (existing.archived) {
          await discordApiRequest(
            `channels/${existingThreadId}`,
            "PATCH",
            { archived: false }
          );
        }
        threadId = existing.id;
      } else {
        const newThread = await discordApiRequest<{ id: string }>(
          `channels/${DISCORD_EXPEDITION_CHANNEL_ID}/threads`,
          "POST",
          { name: threadName, type: 11, auto_archive_duration: EXPLORATION_THREAD_AUTO_ARCHIVE_MINUTES }
        );
        if (!newThread?.id) {
          console.error("[explore/parties/start] Discord thread creation failed");
          return NextResponse.json(
            { error: "Failed to create Discord thread" },
            { status: 502 }
          );
        }
        threadId = newThread.id;
      }
    } else {
      const newThread = await discordApiRequest<{ id: string }>(
        `channels/${DISCORD_EXPEDITION_CHANNEL_ID}/threads`,
        "POST",
        { name: threadName, type: 11, auto_archive_duration: EXPLORATION_THREAD_AUTO_ARCHIVE_MINUTES }
      );
      if (!newThread?.id) {
        console.error("[explore/parties/start] Discord thread creation failed");
        return NextResponse.json(
          { error: "Failed to create Discord thread" },
          { status: 502 }
        );
      }
      threadId = newThread.id;
    }

    const messageBody = mentionContent
      ? `${mentionContent}\n\nExpedition is starting! See embed for details and link.`
      : "Expedition is starting! See embed for details and link.";

    let postResult: { id: string } | null = null;
    if (bannerFilename) {
      try {
        const bannerPath = path.join(process.cwd(), "public", "assets", "banners", bannerFilename);
        const buffer = await fs.readFile(bannerPath);
        const embedWithImage = { ...embed, image: { url: `attachment://${EMBED_ATTACHMENT_FILENAME}` as string } };
        postResult = await discordApiPostWithFile<{ id: string }>(
          `channels/${threadId}/messages`,
          { content: messageBody, embeds: [embedWithImage] },
          [{ data: buffer, filename: EMBED_ATTACHMENT_FILENAME }]
        );
      } catch (err) {
        console.warn("[explore/parties/start] Could not read banner file, posting without image:", err);
      }
    }
    if (postResult === null) {
      postResult = await discordApiRequest<{ id: string }>(
        `channels/${threadId}/messages`,
        "POST",
        { content: messageBody, embeds: [embed] }
      );
    }
    if (postResult === null) {
      console.error("[explore/parties/start] Discord message post failed");
      return NextResponse.json(
        { error: "Failed to post expedition message to thread" },
        { status: 502 }
      );
    }

    // One-time sync: seed each slot's currentHearts/currentStamina from Character/ModCharacter so "start" is the canonical snapshot
    const charactersToSet = (p.characters as PartyMemberDoc[]) ?? [];
    const updatedCharacters: PartyMemberDoc[] = [];
    let totalHeartsSum = 0;
    let totalStaminaSum = 0;
    for (const c of charactersToSet) {
      const charId = c._id instanceof mongoose.Types.ObjectId ? c._id : new mongoose.Types.ObjectId(String(c._id));
      let charDoc = await Character.findById(charId).select("currentHearts maxHearts currentStamina maxStamina").lean();
      if (!charDoc) {
        charDoc = await ModCharacter.findById(charId).select("currentHearts maxHearts currentStamina maxStamina").lean();
      }
      const ch = charDoc as Record<string, unknown> | null;
      const h = typeof ch?.currentHearts === "number" ? (ch.currentHearts as number) : (typeof ch?.maxHearts === "number" ? (ch.maxHearts as number) : 0);
      const s = typeof ch?.currentStamina === "number" ? (ch.currentStamina as number) : (typeof ch?.maxStamina === "number" ? (ch.maxStamina as number) : 0);
      const updated = { ...c, currentHearts: 0, currentStamina: 0 };
      updatedCharacters.push(updated);
      totalHeartsSum += h;
      totalStaminaSum += s;
    }

    await Party.updateOne(
      { partyId },
      {
        $set: {
          status: "started",
          discordThreadId: threadId,
          exploredQuadrantsThisRun: [],
          visitedQuadrantsThisRun: [{ squareId: square, quadrantId: quadrant }],
          characters: updatedCharacters,
          totalHearts: totalHeartsSum,
          totalStamina: totalStaminaSum,
        },
      }
    );

    console.log(`[explore/parties/start] Expedition started: partyId=${partyId} totalHearts=${totalHeartsSum} totalStamina=${totalStaminaSum}`);

    const threadUrl = `https://discord.com/channels/${process.env.GUILD_ID ?? ""}/${threadId}`;
    return NextResponse.json({
      ok: true,
      threadId,
      threadUrl: process.env.GUILD_ID ? threadUrl : null,
    });
  } catch (err) {
    console.error("[explore/parties/[partyId]/start]", err);
    return NextResponse.json(
      { error: "Failed to start expedition" },
      { status: 500 }
    );
  }
}
