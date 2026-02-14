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

    const body = await req.json();
    const description = (body.description as string)?.trim();
    if (!description) {
      return NextResponse.json({ error: "Appraisal description is required" }, { status: 400 });
    }

    await connect();

    const RelicAppraisalRequestModule = await import("@/models/RelicAppraisalRequestModel.js");
    const RelicAppraisalRequest = RelicAppraisalRequestModule.default || RelicAppraisalRequestModule;
    const RelicModule = await import("@/models/RelicModel.js");
    const Relic = RelicModule.default || RelicModule;

    const request = await RelicAppraisalRequest.findById(id);
    if (!request) {
      return NextResponse.json({ error: "Appraisal request not found" }, { status: 404 });
    }
    if (request.status !== "pending") {
      return NextResponse.json({ error: "Request has already been processed" }, { status: 400 });
    }
    if (!request.npcAppraisal) {
      return NextResponse.json({
        error: "This is a PC appraisal request. The Artist/Researcher must use /relic appraisal-accept in Discord.",
      }, { status: 400 });
    }

    const relic = await Relic.findOne({
      $or: [{ _id: request.relicMongoId }, { relicId: request.relicId }],
    });
    if (!relic) {
      return NextResponse.json({ error: "Relic not found" }, { status: 404 });
    }
    if (relic.appraised) {
      return NextResponse.json({ error: "Relic has already been appraised" }, { status: 400 });
    }

    const UserModule = await import("@/models/UserModel.js");
    const User = UserModule.default || UserModule;
    const TokenTransactionModule = await import("@/models/TokenTransactionModel.js");
    const TokenTransaction = TokenTransactionModule.default || TokenTransactionModule;

    const tokenUser = await User.findOne({ discordId: request.finderOwnerUserId });
    const balance = tokenUser?.tokens ?? 0;
    if (balance < 500) {
      return NextResponse.json({
        error: `Finder's owner has insufficient tokens (${balance}). NPC appraisal requires 500 tokens.`,
      }, { status: 400 });
    }

    const balanceBefore = balance;
    const balanceAfter = balance - 500;
    await User.updateOne(
      { discordId: request.finderOwnerUserId },
      { $set: { tokens: balanceAfter } }
    );
    await (TokenTransaction as unknown as { createTransaction: (data: unknown) => Promise<unknown> }).createTransaction({
      userId: request.finderOwnerUserId,
      amount: 500,
      type: "spent",
      category: "relic_npc_appraisal",
      description: "NPC relic appraisal",
      balanceBefore,
      balanceAfter,
    });

    await Relic.findByIdAndUpdate(relic._id, {
      appraised: true,
      appraisedBy: "NPC",
      appraisalDate: new Date(),
      appraisalDescription: description,
      artDeadline: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      npcAppraisal: true,
    });

    request.status = "approved";
    request.appraisalDescription = description;
    request.modApprovedBy = user.id;
    request.modApprovedAt = new Date();
    request.updatedAt = new Date();
    await request.save();

    return NextResponse.json({
      ok: true,
      message: "NPC appraisal approved. Finder can now use /relic reveal in Discord.",
    });
  } catch (err) {
    console.error("[api/relics/appraisal-requests/approve]", err);
    return NextResponse.json(
      { error: "Failed to approve appraisal" },
      { status: 500 }
    );
  }
}
