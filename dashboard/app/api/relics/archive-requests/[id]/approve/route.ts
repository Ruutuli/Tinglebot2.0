import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import path from "path";
import { notifyRelicArchiveApproved } from "@/lib/relicArchiveNotify";

const { getAppraisalText } = require(path.join(process.cwd(), "..", "bot", "data", "relicOutcomes.js"));

export const dynamic = "force-dynamic";

/** POST /api/relics/archive-requests/[id]/approve — mod approves; archive the relic and apply request data. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
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
    return NextResponse.json({ error: "Request ID required" }, { status: 400 });
  }

  try {
    await connect();

    const RelicModule = await import("@/models/RelicModel.js");
    const Relic = RelicModule.default || RelicModule;
    const RelicArchiveRequestModule = await import("@/models/RelicArchiveRequestModel.js");
    const RelicArchiveRequest = RelicArchiveRequestModule.default || RelicArchiveRequestModule;
    const UserModule = await import("@/models/UserModel.js");
    const User = UserModule.default || UserModule;
    const TokenTransactionModule = await import("@/models/TokenTransactionModel.js");
    const TokenTransaction = TokenTransactionModule.default || TokenTransactionModule;

    const archiveRequest = await RelicArchiveRequest.findById(id);
    if (!archiveRequest) {
      return NextResponse.json({ error: "Archive request not found" }, { status: 404 });
    }
    if (archiveRequest.status !== "pending") {
      return NextResponse.json({ error: "Request has already been processed" }, { status: 400 });
    }

    const relic = await Relic.findById(archiveRequest.relicMongoId);
    if (!relic) {
      return NextResponse.json({ error: "Relic not found" }, { status: 404 });
    }
    if (relic.archived) {
      return NextResponse.json({ error: "Relic is already archived" }, { status: 400 });
    }

    const discovererUserId = archiveRequest.submitterUserId; // submitter is the discoverer's owner

    const req = archiveRequest.toObject?.() ?? archiveRequest;
    const posX = req.libraryPositionX != null ? Number(req.libraryPositionX) : NaN;
    const posY = req.libraryPositionY != null ? Number(req.libraryPositionY) : NaN;
    const displaySize = req.libraryDisplaySize != null ? Number(req.libraryDisplaySize) : 8;

    const canonicalAppraisal = getAppraisalText(archiveRequest.title);
    const descriptionForLibrary = (canonicalAppraisal && canonicalAppraisal.trim() !== "")
      ? canonicalAppraisal.trim()
      : archiveRequest.info;

    // Atomic first-archive: use a transaction so only one approval can claim the 1000-token reward.
    // "First" = first by approval time (no other archived relic exists when we run).
    let wasFirstArchived = false;
    const txnSession = await mongoose.startSession();
    try {
      await txnSession.startTransaction();
      const archivedCount = await Relic.countDocuments({ archived: true }).session(txnSession);
      wasFirstArchived = archivedCount === 0;
      const updateData: Record<string, unknown> = {
        artSubmitted: true,
        imageUrl: archiveRequest.imageUrl,
        archived: true,
        rollOutcome: archiveRequest.title,
        discoveredBy: archiveRequest.discoveredBy,
        appraisedBy: archiveRequest.appraisedBy,
        appraisalDescription: descriptionForLibrary,
        description: descriptionForLibrary,
        region: archiveRequest.region,
        square: archiveRequest.square,
        quadrant: archiveRequest.quadrant,
        ...(wasFirstArchived && { firstCompletionRewardGiven: true }),
      };
      if (!Number.isNaN(posX) && !Number.isNaN(posY) && posX >= 0 && posX <= 100 && posY >= 0 && posY <= 100) {
        updateData.libraryPositionX = posX;
        updateData.libraryPositionY = posY;
        updateData.libraryDisplaySize = Math.max(2, Math.min(25, Number.isNaN(displaySize) ? 8 : displaySize));
      }
      await Relic.findByIdAndUpdate(relic._id, updateData, { session: txnSession });
      await txnSession.commitTransaction();
    } catch (txnErr) {
      await txnSession.abortTransaction().catch(() => {});
      throw txnErr;
    } finally {
      txnSession.endSession();
    }

    await RelicArchiveRequest.findByIdAndUpdate(id, {
      status: "approved",
      modApprovedBy: user.id,
      modApprovedAt: new Date(),
      updatedAt: new Date(),
    });

    notifyRelicArchiveApproved({
      title: archiveRequest.title,
      relicId: archiveRequest.relicId,
      discoveredBy: archiveRequest.discoveredBy,
      appraisedBy: archiveRequest.appraisedBy,
      region: archiveRequest.region ?? undefined,
      square: archiveRequest.square ?? undefined,
      quadrant: archiveRequest.quadrant ?? undefined,
      imageUrl: archiveRequest.imageUrl ?? undefined,
    });

    if (wasFirstArchived && discovererUserId) {
      const userDoc = await User.findOne({ discordId: discovererUserId }).exec();
      if (userDoc) {
        const balanceBefore = userDoc.tokens ?? 0;
        const balanceAfter = balanceBefore + 1000;
        userDoc.tokens = balanceAfter;
        await userDoc.save();
        await (TokenTransaction as unknown as { createTransaction: (data: unknown) => Promise<unknown> }).createTransaction({
          userId: discovererUserId,
          amount: 1000,
          type: "earned",
          category: "relic_first_completion",
          description: "First relic archived in Library",
          balanceBefore,
          balanceAfter,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "Relic archived. It will appear on the Library Archives page.",
    });
  } catch (err) {
    console.error("[api/relics/archive-requests/approve]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to approve" },
      { status: 500 }
    );
  }
}
