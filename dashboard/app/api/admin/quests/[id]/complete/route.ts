// ============================================================================
// POST /api/admin/quests/[id]/complete - Mark quest as completed and reward all participants (admin only)
// Sets quest status to 'completed' and rewards any participants not yet rewarded.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { postQuestModCompletionAnnouncement, removeGuildMemberRole } from "@/lib/discord";
import { getSession, isAdminUser } from "@/lib/session";
import { logger } from "@/utils/logger";
import { ensureParticipantEligibleForDashboardReward } from "@/lib/questParticipantRewardSync.js";

function normalizeDiscordId(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const unwrapped = s.replace(/[<@!>]/g, "").trim();
  const digitsOnly = unwrapped.replace(/\D/g, "");
  return digitsOnly.length >= 16 ? digitsOnly : unwrapped;
}

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

    const { markActiveParticipantsFailedAfterQuestPeriod } = await import(
      "@/lib/questParticipantRewardSync.js"
    );
    await markActiveParticipantsFailedAfterQuestPeriod(quest);

    const questID = quest.questID?.trim?.();
    if (!questID) {
      logger.error("api/admin/quests/[id]/complete", "Quest has no questID; cannot record completions");
      return NextResponse.json(
        { error: "Quest has no questID; add questID to the quest document to record completions" },
        { status: 400 }
      );
    }

    quest.status = "completed";
    const participants = quest.participants;
    const userIds: string[] = [];
    if (participants && typeof participants.entries === "function") {
      for (const [uid, p] of participants.entries()) {
        if (!p) continue;
        if (p.progress === "rewarded") continue;
        if (typeof p.tokensEarned === "number" && p.tokensEarned > 0) continue;
        userIds.push(uid);
      }
    }

    const now = new Date();
    const questTitle = quest.title || `Quest ${questID}`;
    const questType = quest.questType || "Other";
    const rewarded: string[] = [];

    for (const userId of userIds) {
      if (!userId || typeof userId !== "string") continue;

      const participant =
        participants.get(userId) ??
        participants.get(userId.trim()) ??
        participants.get(normalizeDiscordId(userId));
      if (!participant) continue;
      if (participant.progress === "rewarded") continue;
      if (
        typeof participant.tokensEarned === "number" &&
        participant.tokensEarned > 0
      ) {
        continue;
      }

      const pidForLog = normalizeDiscordId(participant.userId ?? userId);
      const eligible = await ensureParticipantEligibleForDashboardReward(
        quest,
        participant as Record<string, unknown>
      );
      if (!eligible) {
        logger.warn(
          "api/admin/quests/[id]/complete",
          `Skipping reward: participant does not meet quest requirements (${questID}) user=${pidForLog || userId}`
        );
        continue;
      }

      participant.progress = "completed";
      participant.completedAt = now;

      let tokensToAward = 0;
      if (typeof quest.getNormalizedTokenReward === "function") {
        tokensToAward = Math.max(0, Number(quest.getNormalizedTokenReward()) || 0);
      }

      const discordId = normalizeDiscordId(participant.userId ?? userId);
      const userDoc = await User.findOne({ discordId }).exec();
      if (!userDoc) {
        logger.error("api/admin/quests/[id]/complete", `User not found: ${discordId || userId}`);
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
          userId: String(discordId || userId),
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
      rewarded.push(discordId || userId);
    }

    await quest.save();

    const questRoleId = quest.roleID ? String(quest.roleID).trim() : "";
    const roleGuildId = String(
      (quest.guildId && String(quest.guildId).trim()) ||
        (process.env.GUILD_ID && String(process.env.GUILD_ID).trim()) ||
        ""
    );
    if (questRoleId && roleGuildId && participants && typeof participants.entries === "function") {
      for (const [uid, p] of participants.entries()) {
        if (!p) continue;
        const userId = normalizeDiscordId(
          (p as { userId?: string }).userId ?? uid
        );
        if (!userId) continue;
        const rm = await removeGuildMemberRole(roleGuildId, userId, questRoleId);
        if (!rm.ok) {
          logger.warn(
            "api/admin/quests/[id]/complete",
            `Could not remove quest role for ${userId}: ${rm.error}`
          );
        }
      }
      (quest as { participantQuestRolesStrippedAt?: Date }).participantQuestRolesStrippedAt =
        new Date();
      await quest.save();
    }

    if (rewarded.length > 0) {
      const posted = await postQuestModCompletionAnnouncement({
        questTitle,
        mentionUserIds: rewarded,
      });
      if (!posted) {
        logger.warn(
          "api/admin/quests/[id]/complete",
          "Quest completed but failed to post mod-completion announcement to Discord (check DISCORD_TOKEN and channel permissions)."
        );
      }
    }

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
