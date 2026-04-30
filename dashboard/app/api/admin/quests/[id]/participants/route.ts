// ============================================================================
// PATCH /api/admin/quests/[id]/participants - Mark participants completed and reward (admin only)
// Body: { userIds: string[] } - Discord IDs to mark as completed and reward
//
// PUT /api/admin/quests/[id]/participants - Set participant progress only (no token payout)
// Body (single): { userId: string, progress: "active" | "completed" | "failed" | "rewarded" | "disqualified" }
// Body (bulk):  { updates: Record<userId, progress> }
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { postQuestModCompletionAnnouncement } from "@/lib/discord";
import { getSession, isAdminUser } from "@/lib/session";
import { logger } from "@/utils/logger";

const PARTICIPANT_PROGRESS = [
  "active",
  "completed",
  "failed",
  "rewarded",
  "disqualified",
] as const;

function normalizeDiscordId(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const unwrapped = s.replace(/[<@!>]/g, "").trim();
  const digitsOnly = unwrapped.replace(/\D/g, "");
  return digitsOnly.length >= 16 ? digitsOnly : unwrapped;
}

type ParticipantProgressDoc = {
  progress?: string;
  updatedAt?: Date;
  completedAt?: Date | null;
  rewardedAt?: Date | null;
  disqualifiedAt?: Date | null;
  disqualificationReason?: string | null;
  userId?: string;
};

function applyParticipantProgress(
  participant: ParticipantProgressDoc,
  progressRaw: (typeof PARTICIPANT_PROGRESS)[number],
  now: Date
) {
  participant.progress = progressRaw;
  participant.updatedAt = now;

  if (progressRaw === "active" || progressRaw === "failed") {
    participant.completedAt = null;
    participant.rewardedAt = null;
    participant.disqualifiedAt = null;
    participant.disqualificationReason = null;
  } else if (progressRaw === "completed") {
    if (!participant.completedAt) participant.completedAt = now;
    participant.disqualifiedAt = null;
    participant.disqualificationReason = null;
  } else if (progressRaw === "rewarded") {
    if (!participant.rewardedAt) participant.rewardedAt = now;
    participant.disqualifiedAt = null;
    participant.disqualificationReason = null;
  } else if (progressRaw === "disqualified") {
    if (!participant.disqualifiedAt) participant.disqualifiedAt = now;
    if (
      participant.disqualificationReason == null ||
      participant.disqualificationReason === ""
    ) {
      participant.disqualificationReason = "dashboard";
    }
  }
}

// ----------------------------------------------------------------------------
// PUT - Set participant progress (staff correction; does not mint tokens)
// ----------------------------------------------------------------------------
export async function PUT(
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

    let body: { userId?: unknown; progress?: unknown; updates?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    await connect();
    const Quest = (await import("@/models/QuestModel.js")).default;

    const quest = await Quest.findById(id);
    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    const participants = quest.participants;
    if (!participants || typeof participants.get !== "function") {
      return NextResponse.json(
        { error: "Quest has no participants map" },
        { status: 500 }
      );
    }

    const now = new Date();

    const updatesPayload = body.updates;
    if (
      updatesPayload &&
      typeof updatesPayload === "object" &&
      !Array.isArray(updatesPayload)
    ) {
      const pairs: { key: string; progress: (typeof PARTICIPANT_PROGRESS)[number] }[] =
        [];
      for (const [uidRaw, progVal] of Object.entries(
        updatesPayload as Record<string, unknown>
      )) {
        const key = String(uidRaw ?? "").trim();
        const progressCandidate =
          typeof progVal === "string" ? progVal.trim() : "";
        if (!key || !progressCandidate) {
          return NextResponse.json(
            {
              error: "Invalid updates",
              message: "Each updates entry needs a non-empty userId key and string progress",
            },
            { status: 400 }
          );
        }
        if (
          !PARTICIPANT_PROGRESS.includes(
            progressCandidate as (typeof PARTICIPANT_PROGRESS)[number]
          )
        ) {
          return NextResponse.json(
            {
              error: "Invalid progress",
              message: `progress for ${key} must be one of: ${PARTICIPANT_PROGRESS.join(", ")}`,
            },
            { status: 400 }
          );
        }
        pairs.push({
          key,
          progress: progressCandidate as (typeof PARTICIPANT_PROGRESS)[number],
        });
      }

      if (pairs.length === 0) {
        return NextResponse.json(
          {
            error: "updates required",
            message: "Provide updates with at least one participant",
          },
          { status: 400 }
        );
      }

      let updated = 0;
      for (const { key, progress: progressRaw } of pairs) {
        const participant =
          participants.get(key) ??
          participants.get(normalizeDiscordId(key)) ??
          null;
        if (!participant) {
          return NextResponse.json(
            {
              error: "Participant not found on this quest",
              message: `No participant for user id: ${key}`,
            },
            { status: 404 }
          );
        }
        applyParticipantProgress(
          participant as ParticipantProgressDoc,
          progressRaw,
          now
        );
        updated += 1;
      }

      await quest.save();

      return NextResponse.json({
        ok: true,
        updated,
      });
    }

    const userIdRaw = typeof body.userId === "string" ? body.userId.trim() : "";
    const progressRaw =
      typeof body.progress === "string" ? body.progress.trim() : "";
    if (!userIdRaw || !progressRaw) {
      return NextResponse.json(
        { error: "userId and progress are required (or send updates map)" },
        { status: 400 }
      );
    }
    if (
      !PARTICIPANT_PROGRESS.includes(
        progressRaw as (typeof PARTICIPANT_PROGRESS)[number]
      )
    ) {
      return NextResponse.json(
        {
          error: "Invalid progress",
          message: `progress must be one of: ${PARTICIPANT_PROGRESS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const key = userIdRaw;
    const participant =
      participants.get(key) ?? participants.get(normalizeDiscordId(key));
    if (!participant) {
      return NextResponse.json(
        { error: "Participant not found on this quest" },
        { status: 404 }
      );
    }

    applyParticipantProgress(
      participant as ParticipantProgressDoc,
      progressRaw as (typeof PARTICIPANT_PROGRESS)[number],
      now
    );

    await quest.save();

    return NextResponse.json({
      ok: true,
      userId: String(
        (participant as ParticipantProgressDoc).userId ?? key
      ),
      progress: progressRaw,
    });
  } catch (e) {
    logger.error(
      "api/admin/quests/[id]/participants PUT",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to update participant progress" },
      { status: 500 }
    );
  }
}

// ----------------------------------------------------------------------------
// PATCH - Mark selected participants as completed and distribute tokens + log
// ----------------------------------------------------------------------------
export async function PATCH(
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

    let body: { userIds?: string[] };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const userIds = Array.isArray(body.userIds) ? body.userIds : [];
    if (userIds.length === 0) {
      return NextResponse.json(
        { error: "userIds must be a non-empty array" },
        { status: 400 }
      );
    }

    await connect();
    const Quest = (await import("@/models/QuestModel.js")).default;
    const User = (await import("@/models/UserModel.js")).default;
    const TokenTransaction = (await import("@/models/TokenTransactionModel.js")).default;

    const quest = await Quest.findById(id);
    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    const questID = quest.questID?.trim?.();
    if (!questID) {
      logger.error("api/admin/quests/[id]/participants", "Quest has no questID; cannot record completions");
      return NextResponse.json(
        { error: "Quest has no questID; add questID to the quest document to record completions" },
        { status: 400 }
      );
    }

    const participants = quest.participants;
    if (!participants || typeof participants.get !== "function") {
      return NextResponse.json(
        { error: "Quest has no participants map" },
        { status: 500 }
      );
    }

    const rewarded: string[] = [];
    const now = new Date();
    const questTitle = quest.title || `Quest ${questID}`;
    const questType = quest.questType || "Other";

    for (const userId of userIds) {
      if (!userId || typeof userId !== "string") continue;

      const key = userId.trim();
      const participant =
        participants.get(key) ??
        participants.get(normalizeDiscordId(key));
      if (!participant) continue;
      if (participant.progress === "rewarded") continue;
      if (
        typeof participant.tokensEarned === "number" &&
        participant.tokensEarned > 0
      ) {
        continue;
      }

      participant.progress = "completed";
      participant.completedAt = now;

      let tokensToAward = 0;
      if (typeof quest.getNormalizedTokenReward === "function") {
        tokensToAward = Math.max(0, Number(quest.getNormalizedTokenReward()) || 0);
      }

      const discordId = normalizeDiscordId(participant.userId ?? key);
      const userDoc = await User.findOne({ discordId }).exec();
      if (!userDoc) {
        logger.error(
          "api/admin/quests/[id]/participants",
          `User not found: ${discordId || userId}`
        );
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

    if (rewarded.length > 0) {
      const posted = await postQuestModCompletionAnnouncement({
        questTitle,
        mentionUserIds: rewarded,
      });
      if (!posted) {
        logger.warn(
          "api/admin/quests/[id]/participants",
          "Participants updated but failed to post mod-completion announcement to Discord (check DISCORD_TOKEN and channel permissions)."
        );
      }
    }

    return NextResponse.json({
      updated: rewarded.length,
      rewarded,
    });
  } catch (e) {
    logger.error(
      "api/admin/quests/[id]/participants PATCH",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to update participants" },
      { status: 500 }
    );
  }
}
