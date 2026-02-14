// GET /api/explore/parties/[partyId] — party summary for shared expedition page (live updates)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

type PartyMember = {
  characterId: string;
  userId: string;
  name: string;
  currentHearts?: number;
  currentStamina?: number;
  icon?: string;
  items: Array<{
    itemName: string;
    modifierHearts?: number;
    staminaRecovered?: number;
    emoji?: string;
  }>;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> }
) {
  try {
    const session = await getSession();
    const currentUserId = session.user?.id ?? null;

    const { partyId } = await params;
    if (!partyId) {
      return NextResponse.json({ error: "Missing party ID" }, { status: 400 });
    }

    await connect();

    const Party =
      mongoose.models.Party ??
      ((await import("@/models/PartyModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;

    const party = await Party.findOne({ partyId }).lean();
    if (!party) {
      return NextResponse.json({ error: "Expedition not found" }, { status: 404 });
    }

    const p = party as Record<string, unknown>;
    const status = typeof p.status === "string" ? p.status : "open";
    if (status === "cancelled") {
      return NextResponse.json({ error: "Expedition was cancelled", code: "cancelled" }, { status: 404 });
    }
    // Open parties expire after 24 hours so ghost explores don't linger
    if (status === "open") {
      const createdAt = p.createdAt instanceof Date ? p.createdAt.getTime() : typeof p.createdAt === "string" ? new Date(p.createdAt).getTime() : NaN;
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      if (!Number.isNaN(createdAt) && createdAt < cutoff) {
        return NextResponse.json({ error: "Expedition expired", code: "expired" }, { status: 404 });
      }
    }

    const partyCharacters = (p.characters as Array<Record<string, unknown>>) ?? [];
    const members: PartyMember[] = partyCharacters.map((c) => ({
      characterId: String(c._id),
      userId: String(c.userId),
      name: String(c.name),
      currentHearts: typeof c.currentHearts === "number" ? c.currentHearts : undefined,
      currentStamina: typeof c.currentStamina === "number" ? c.currentStamina : undefined,
      icon: typeof c.icon === "string" ? c.icon : undefined,
      items: Array.isArray(c.items)
        ? (c.items as Array<Record<string, unknown>>).map((it) => ({
            itemName: String(it.itemName),
            modifierHearts: typeof it.modifierHearts === "number" ? it.modifierHearts : undefined,
            staminaRecovered: typeof it.staminaRecovered === "number" ? it.staminaRecovered : undefined,
            emoji: typeof it.emoji === "string" ? it.emoji : undefined,
          }))
        : [],
    }));

    const myMember = currentUserId
      ? members.find((m) => m.userId === currentUserId)
      : null;

    const discordThreadId = typeof p.discordThreadId === "string" ? p.discordThreadId.trim() : null;
    const guildId = process.env.GUILD_ID ?? null;
    const discordThreadUrl =
      discordThreadId && guildId
        ? `https://discord.com/channels/${guildId}/${discordThreadId}`
        : null;

    const gatheredItems = Array.isArray(p.gatheredItems)
      ? (p.gatheredItems as Array<Record<string, unknown>>).map((g) => ({
          characterId: String(g.characterId),
          characterName: String(g.characterName ?? ""),
          itemName: String(g.itemName ?? ""),
          quantity: typeof g.quantity === "number" ? g.quantity : 1,
          emoji: typeof g.emoji === "string" ? g.emoji : undefined,
        }))
      : [];

    const progressLog = Array.isArray(p.progressLog)
      ? (p.progressLog as Array<Record<string, unknown>>).map((e) => {
          const loot = e.loot as Record<string, unknown> | undefined;
          const heartsLost = typeof e.heartsLost === "number" && e.heartsLost > 0 ? e.heartsLost : undefined;
          const staminaLost = typeof e.staminaLost === "number" && e.staminaLost > 0 ? e.staminaLost : undefined;
          const heartsRecovered = typeof e.heartsRecovered === "number" && e.heartsRecovered > 0 ? e.heartsRecovered : undefined;
          const staminaRecovered = typeof e.staminaRecovered === "number" && e.staminaRecovered > 0 ? e.staminaRecovered : undefined;
          return {
            at: e.at instanceof Date ? e.at.toISOString() : typeof e.at === "string" ? e.at : String(e.at ?? ""),
            characterName: String(e.characterName ?? ""),
            outcome: String(e.outcome ?? ""),
            message: String(e.message ?? ""),
            ...(loot && (loot.itemName || loot.emoji)
              ? { loot: { itemName: String(loot.itemName ?? ""), emoji: String(loot.emoji ?? "") } }
              : {}),
            ...(heartsLost != null ? { heartsLost } : {}),
            ...(staminaLost != null ? { staminaLost } : {}),
            ...(heartsRecovered != null ? { heartsRecovered } : {}),
            ...(staminaRecovered != null ? { staminaRecovered } : {}),
          };
        })
      : [];

    // Quadrant state and statuses: read from exploring map model (Square / exploringMap collection) so dashboard colors match DB
    let quadrantState: string = typeof p.quadrantState === "string" ? p.quadrantState : "unexplored";
    const squareId = typeof p.square === "string" ? p.square.trim() : "";
    const quadrantId = typeof p.quadrant === "string" ? String(p.quadrant).trim().toUpperCase() : "";
    const quadrantStatuses: Record<string, string> = { Q1: "unexplored", Q2: "unexplored", Q3: "unexplored", Q4: "unexplored" };
    if (squareId) {
      const Square =
        mongoose.models.Square ??
        ((await import("@/models/mapModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;
      const squareIdRegex = new RegExp(`^${squareId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
      const mapSquare = await Square.findOne({ squareId: squareIdRegex }).lean();
      if (mapSquare && Array.isArray((mapSquare as Record<string, unknown>).quadrants)) {
        const quads = (mapSquare as Record<string, unknown>).quadrants as Array<Record<string, unknown>>;
        for (const qu of quads) {
          const id = String(qu.quadrantId ?? "").trim().toUpperCase();
          if (id === "Q1" || id === "Q2" || id === "Q3" || id === "Q4") {
            const raw = typeof qu.status === "string" ? String(qu.status).trim().toLowerCase() : "";
            const s = ["inaccessible", "unexplored", "explored", "secured"].includes(raw) ? raw : "unexplored";
            quadrantStatuses[id] = s;
          }
        }
        if (quadrantId) {
          const q = quads.find((qu) => String(qu.quadrantId).toUpperCase() === quadrantId);
          const raw = q && typeof q.status === "string" ? String(q.status).trim().toLowerCase() : "";
          if (["explored", "secured"].includes(raw)) {
            quadrantState = raw;
          }
        }
      }
    }

    const reportedDiscoveryKeys = Array.isArray(p.reportedDiscoveryKeys)
      ? (p.reportedDiscoveryKeys as string[]).filter((k) => typeof k === "string" && k.length > 0)
      : [];

    return NextResponse.json({
      partyId: p.partyId,
      region: p.region,
      square: p.square,
      quadrant: p.quadrant,
      status: p.status,
      totalHearts: p.totalHearts ?? 0,
      totalStamina: p.totalStamina ?? 0,
      leaderId: p.leaderId,
      members,
      currentUserJoined: !!myMember,
      currentUserMember: myMember ?? null,
      isLeader: currentUserId === p.leaderId,
      discordThreadUrl,
      currentTurn: typeof p.currentTurn === "number" ? p.currentTurn : 0,
      quadrantState,
      quadrantStatuses,
      gatheredItems,
      progressLog,
      reportedDiscoveryKeys,
    });
  } catch (err) {
    console.error("[explore/parties/[partyId] GET]", err);
    return NextResponse.json(
      { error: "Failed to load expedition" },
      { status: 500 }
    );
  }
}
