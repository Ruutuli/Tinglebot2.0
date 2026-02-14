// POST /api/explore/parties/[partyId]/leave — remove your character from the party (unjoin)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose, { type Model } from "mongoose";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
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
      ((await import("@/models/PartyModel.js")) as unknown as { default: Model<unknown> }).default;

    const party = await Party.findOne({ partyId }).lean();
    if (!party) {
      return NextResponse.json({ error: "Expedition not found." }, { status: 404 });
    }

    const partyObj = party as Record<string, unknown>;
    const charArray = (partyObj.characters as Array<Record<string, unknown>>) ?? [];
    const myIndex = charArray.findIndex((c) => c.userId === user.id);
    if (myIndex < 0) {
      return NextResponse.json(
        { error: "You are not in this expedition." },
        { status: 400 }
      );
    }

    const me = charArray[myIndex];
    const currentHearts = Number(me.currentHearts) || 0;
    const currentStamina = Number(me.currentStamina) || 0;
    const totalHearts = Number(partyObj.totalHearts) || 0;
    const totalStamina = Number(partyObj.totalStamina) || 0;
    const currentTurn = Number(partyObj.currentTurn) || 0;
    const newLength = charArray.length - 1;
    let newCurrentTurn = currentTurn;
    if (myIndex < currentTurn) {
      newCurrentTurn = currentTurn - 1;
    } else if (myIndex === currentTurn && newLength > 0) {
      newCurrentTurn = Math.min(currentTurn, newLength - 1);
    }
    newCurrentTurn = Math.max(0, Math.min(newCurrentTurn, newLength - 1));

    const isLeader = String(partyObj.leaderId ?? "") === user.id;
    const newLeaderId =
      isLeader && newLength > 0
        ? (charArray.find((c) => c.userId !== user.id)?.userId as string) ?? ""
        : undefined;

    const updatePayload: Record<string, unknown> = {
      $pull: { characters: { userId: user.id } },
      $set: {
        totalHearts: Math.max(0, totalHearts - currentHearts),
        totalStamina: Math.max(0, totalStamina - currentStamina),
        currentTurn: newCurrentTurn,
      },
    };
    if (newLeaderId !== undefined) {
      (updatePayload.$set as Record<string, unknown>).leaderId = newLeaderId;
    }

    await Party.updateOne({ partyId }, updatePayload);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[explore/parties/[partyId]/leave]", err);
    return NextResponse.json(
      { error: "Failed to leave expedition" },
      { status: 500 }
    );
  }
}
