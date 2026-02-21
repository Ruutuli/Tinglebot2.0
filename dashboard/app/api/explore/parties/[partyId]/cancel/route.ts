// POST /api/explore/parties/[partyId]/cancel — cancel an open expedition (any party member)

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ partyId: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const partyCharacters = (p.characters as Array<{ userId: string }>) ?? [];
    const isPartyMember = partyCharacters.some((c) => String(c.userId) === user.id);

    if (!isPartyMember) {
      return NextResponse.json({ error: "Only party members can cancel the expedition" }, { status: 403 });
    }
    if (status !== "open") {
      return NextResponse.json(
        { error: "Only open expeditions can be cancelled. This one has already started or ended." },
        { status: 400 }
      );
    }

    await Party.updateOne({ partyId }, { $set: { status: "cancelled" } });

    return NextResponse.json({ ok: true, message: "Expedition cancelled" });
  } catch (err) {
    console.error("[explore/parties/[partyId]/cancel POST]", err);
    return NextResponse.json(
      { error: "Failed to cancel expedition" },
      { status: 500 }
    );
  }
}
