// ============================================================================
// POST /api/admin/quests/[id]/complete - Mark quest as completed and reward all participants (admin only)
// Sets quest status to 'completed' and rewards any participants not yet rewarded.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { logger } from "@/utils/logger";

// ----------------------------------------------------------------------------
// POST - Mark quest completed and reward all non-rewarded participants
// ----------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const admin = await isAdminUser(user.id);
    if (!admin) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid quest id" }, { status: 400 });
    }

    await connect();
    const Quest = (await import("@/models/QuestModel.js")).default;
    const User = (await import("@/models/UserModel.js")).default;
    const TokenTransaction = (await import("@/models/TokenTransactionModel.js")).default;

    const quest = await Quest.findById(id);
    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    quest.status = "completed";
    const participants = quest.participants;
    const userIds: string[] = [];
    if (participants && typeof participants.entries === "function") {
      for (const [uid, p] of participants.entries()) {
        if (p && p.progress !== "rewarded") userIds.push(uid);
      }
    }

    const now = new Date();
    const questTitle = quest.title || `Quest ${quest.questID || id}`;
    const questType = quest.questType || "Other";
    const questID = quest.questID || String(id);
    const rewarded: string[] = [];

    for (const userId of userIds) {
      if (!userId || typeof userId !== "string") continue;

      const participant = participants.get(userId);
      if (!participant) continue;
      if (participant.progress === "rewarded") continue;

      participant.progress = "completed";
      participant.completedAt = now;

      let tokensToAward = 0;
      if (typeof quest.getNormalizedTokenReward === "function") {
        tokensToAward = Math.max(0, Number(quest.getNormalizedTokenReward()) || 0);
      }

      const userDoc = await User.findOne({ discordId: userId }).exec();
      if (!userDoc) {
        logger.error("api/admin/quests/[id]/complete", `User not found: ${userId}`);
        continue;
      }

      if (tokensToAward > 0) {
        const balanceBefore = userDoc.tokens ?? 0;
        const balanceAfter = balanceBefore + tokensToAward;
        userDoc.tokens = balanceAfter;
        await userDoc.save();

        const TT = TokenTransaction as unknown as {
          createTransaction: (opts: {
            userId: string;
            amount: number;
            type: string;
            category: string;
            description: string;
            balanceBefore: number;
            balanceAfter: number;
          }) => Promise<unknown>;
        };
        await TT.createTransaction({
          userId: String(userId),
          amount: tokensToAward,
          type: "earned",
          category: "quest_reward",
          description: questTitle,
          balanceBefore,
          balanceAfter,
        });
      }

      if (typeof userDoc.recordQuestCompletion === "function") {
        await userDoc.recordQuestCompletion({
          questId: questID,
          questType,
          questTitle,
          completedAt: now,
          rewardedAt: now,
          tokensEarned: tokensToAward,
          itemsEarned: [],
          rewardSource: "dashboard_manual",
        });
      }

      participant.progress = "rewarded";
      participant.rewardedAt = now;
      participant.tokensEarned = tokensToAward;
      participant.itemsEarned = [];
      rewarded.push(userId);
    }

    await quest.save();

    return NextResponse.json({
      success: true,
      status: "completed",
      rewarded: rewarded.length,
      rewardedUserIds: rewarded,
    });
  } catch (e) {
    logger.error(
      "api/admin/quests/[id]/complete POST",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to complete quest" },
      { status: 500 }
    );
  }
}
