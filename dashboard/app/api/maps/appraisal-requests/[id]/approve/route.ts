import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";

export const dynamic = "force-dynamic";

export async function POST(
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
      return NextResponse.json({ error: "Missing request ID" }, { status: 400 });
    }

    await connect();

    const MapAppraisalRequestModule = await import("@/models/MapAppraisalRequestModel.js");
    const MapAppraisalRequest = MapAppraisalRequestModule.default || MapAppraisalRequestModule;
    const OldMapFoundModule = await import("@/models/OldMapFoundModel.js");
    const OldMapFound = OldMapFoundModule.default || OldMapFoundModule;

    const request = await MapAppraisalRequest.findById(id);
    if (!request) {
      return NextResponse.json({ error: "Map appraisal request not found" }, { status: 404 });
    }
    if (request.status !== "pending") {
      return NextResponse.json({ error: "Request has already been processed" }, { status: 400 });
    }
    if (!request.npcAppraisal) {
      return NextResponse.json({
        error: "This is a PC appraisal request. A Scholar must use /map appraisal-accept in Discord.",
      }, { status: 400 });
    }

    const mapDoc = await OldMapFound.findById(request.oldMapFoundId);
    if (!mapDoc) {
      return NextResponse.json({ error: "Map record not found" }, { status: 404 });
    }
    if (mapDoc.appraised) {
      return NextResponse.json({ error: "Map has already been appraised" }, { status: 400 });
    }

    const UserModule = await import("@/models/UserModel.js");
    const User = UserModule.default || UserModule;
    const TokenTransactionModule = await import("@/models/TokenTransactionModel.js");
    const TokenTransaction = TokenTransactionModule.default || TokenTransactionModule;

    const tokenUser = await User.findOne({ discordId: request.mapOwnerUserId });
    const balance = tokenUser?.tokens ?? 0;
    if (balance < 500) {
      return NextResponse.json({
        error: `Map owner has insufficient tokens (${balance}). NPC appraisal requires 500 tokens.`,
      }, { status: 400 });
    }

    const balanceBefore = balance;
    const balanceAfter = balance - 500;
    await User.updateOne(
      { discordId: request.mapOwnerUserId },
      { $set: { tokens: balanceAfter } }
    );
    await (TokenTransaction as unknown as { createTransaction: (data: unknown) => Promise<unknown> }).createTransaction({
      userId: request.mapOwnerUserId,
      amount: 500,
      type: "spent",
      category: "map_npc_appraisal",
      description: "NPC map appraisal",
      balanceBefore,
      balanceAfter,
    });

    await OldMapFound.findByIdAndUpdate(mapDoc._id, {
      appraised: true,
      appraisedAt: new Date(),
      appraisedBy: "NPC",
    });

    request.status = "approved";
    request.modApprovedBy = user.id;
    request.modApprovedAt = new Date();
    request.updatedAt = new Date();
    await request.save();

    return NextResponse.json({
      ok: true,
      message: "NPC map appraisal approved. The map owner will be DMed with coordinates by the bot shortly.",
    });
  } catch (err) {
    console.error("[api/maps/appraisal-requests/approve]", err);
    return NextResponse.json(
      { error: "Failed to approve map appraisal" },
      { status: 500 }
    );
  }
}
