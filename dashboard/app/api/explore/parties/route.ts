// GET /api/explore/parties — list expeditions the current user created (leader)
// POST /api/explore/parties — create expedition party

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

const START_POINTS: Record<string, { square: string; quadrant: string }> = {
  eldin: { square: "H5", quadrant: "Q3" },
  lanayru: { square: "H8", quadrant: "Q2" },
  faron: { square: "F10", quadrant: "Q4" },
};

/** Generate expedition ID in same format as bot: E + 6 digits (e.g. E123456). */
function generateExploreId(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `E${n}`;
}

export async function GET() {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connect();

    const Party =
      mongoose.models.Party ??
      ((await import("@/models/PartyModel.js")) as unknown as { default: mongoose.Model<unknown> }).default;

    const openExpiryCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const parties = await Party.find({
      leaderId: user.id,
      status: { $ne: "cancelled" },
      $or: [
        { status: { $ne: "open" } },
        { createdAt: { $gte: openExpiryCutoff } },
      ],
    })
      .select("partyId region status square quadrant createdAt")
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const list = (parties as Array<Record<string, unknown>>).map((p) => ({
      partyId: p.partyId,
      region: p.region,
      status: p.status,
      square: p.square,
      quadrant: p.quadrant,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    }));

    return NextResponse.json({ parties: list });
  } catch (err) {
    console.error("[explore/parties GET]", err);
    return NextResponse.json(
      { error: "Failed to load your expeditions" },
      { status: 500 }
    );
  }
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
