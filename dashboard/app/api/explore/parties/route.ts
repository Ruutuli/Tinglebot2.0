// POST /api/explore/parties — create expedition party

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

const START_POINTS: Record<string, { square: string; quadrant: string }> = {
  eldin: { square: "D3", quadrant: "Q3" },
  lanayru: { square: "G4", quadrant: "Q2" },
  faron: { square: "H6", quadrant: "Q4" },
};

/** Generate expedition ID in same format as bot: E + 6 digits (e.g. E123456). */
function generateExploreId(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `E${n}`;
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const region = (body.region as string)?.toLowerCase?.();
    if (!region || !START_POINTS[region]) {
      return NextResponse.json(
        { error: "Invalid region. Use eldin, lanayru, or faron." },
        { status: 400 }
      );
    }

    await connect();

    const Party =
      mongoose.models.Party ??
      ((await import("@/models/PartyModel.js")) as { default: { create: (doc: unknown) => Promise<{ partyId: string; region: string; square: string; quadrant: string }> } }).default;

    const start = START_POINTS[region];
    const partyId = generateExploreId();

    const party = await Party.create({
      leaderId: user.id,
      region,
      square: start.square,
      quadrant: start.quadrant,
      partyId,
      characters: [],
      gatheredItems: [],
      status: "open",
      currentTurn: 0,
      totalHearts: 0,
      totalStamina: 0,
      quadrantState: "unexplored",
    });

    return NextResponse.json({
      partyId: party.partyId,
      region: party.region,
      square: party.square,
      quadrant: party.quadrant,
    });
  } catch (err) {
    console.error("[explore/parties POST]", err);
    return NextResponse.json(
      { error: "Failed to create expedition" },
      { status: 500 }
    );
  }
}
