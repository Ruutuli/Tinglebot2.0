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
    const characters = (p.characters as Array<Record<string, unknown>>) ?? [];
    const members: PartyMember[] = characters.map((c) => ({
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
      quadrantState: typeof p.quadrantState === "string" ? p.quadrantState : "unexplored",
      gatheredItems,
    });
  } catch (err) {
    console.error("[explore/parties/[partyId] GET]", err);
    return NextResponse.json(
      { error: "Failed to load expedition" },
      { status: 500 }
    );
  }
}
