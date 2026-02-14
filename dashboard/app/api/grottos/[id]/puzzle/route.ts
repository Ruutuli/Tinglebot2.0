import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";

export const dynamic = "force-dynamic";

/** PATCH: Approve or deny a grotto puzzle offering (mod only). Body: { approved: boolean } */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [isAdmin, isMod] = await Promise.all([
      isAdminUser(user.id),
      isModeratorUser(user.id),
    ]);
    if (!isAdmin && !isMod) {
      return NextResponse.json({ error: "Moderator or admin access required" }, { status: 403 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing grotto ID" }, { status: 400 });
    }

    const body = await req.json();
    const approved = body.approved as boolean;
    if (typeof approved !== "boolean") {
      return NextResponse.json({ error: "Body must include approved: true or false" }, { status: 400 });
    }

    await connect();
    const GrottoModule = await import("@/models/GrottoModel.js");
    const Grotto = GrottoModule.default || GrottoModule;
    const mongoose = await import("mongoose");

    const grotto = await Grotto.findById(mongoose.default.Types.ObjectId.isValid(id) ? id : undefined);
    if (!grotto) {
      return NextResponse.json({ error: "Grotto not found" }, { status: 404 });
    }
    if (grotto.trialType !== "puzzle") {
      return NextResponse.json({ error: "This grotto is not a puzzle trial" }, { status: 400 });
    }
    if (!grotto.puzzleState?.offeringSubmitted) {
      return NextResponse.json({ error: "No offering has been submitted for this grotto" }, { status: 400 });
    }
    if (grotto.puzzleState.offeringApproved !== null && grotto.puzzleState.offeringApproved !== undefined) {
      return NextResponse.json({ error: "This offering has already been approved or denied" }, { status: 400 });
    }

    grotto.puzzleState = grotto.puzzleState || {};
    grotto.puzzleState.offeringApproved = approved;
    if (approved) {
      grotto.completedAt = new Date();
    } else {
      grotto.puzzleState.offeringDeniedAt = new Date();
    }
    await grotto.save();

    return NextResponse.json({
      ok: true,
      message: approved
        ? "Puzzle offering approved. The party can use /explore grotto continue in Discord to receive Spirit Orbs."
        : "Puzzle offering denied. Items are still consumed; no Spirit Orbs.",
    });
  } catch (err) {
    console.error("[api/grottos/[id]/puzzle]", err);
    return NextResponse.json(
      { error: "Failed to update puzzle offering" },
      { status: 500 }
    );
  }
}
