// POST /api/admin/quests/[id]/sync-reward-progress
// Sets participant progress to "rewarded" when tokensEarned > 0 but progress is still "completed".
// Same rules as Quest pre-save and bot fix; explicit button for mods without running a script.

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { logger } from "@/utils/logger";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  normalizeParticipantsRewardProgress,
} = require("@/lib/questParticipantRewardSync");

async function canAccessQuestAdmin(userId: string): Promise<boolean> {
  const [admin, mod] = await Promise.all([isAdminUser(userId), isModeratorUser(userId)]);
  return admin || mod;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const allowed = await canAccessQuestAdmin(user.id);
    if (!allowed) {
      return NextResponse.json(
        { error: "Forbidden", message: "Admin or moderator access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid quest id" }, { status: 400 });
    }

    await connect();
    const Quest = (await import("@/models/QuestModel.js")).default;
    const quest = await Quest.findById(id).exec();
    if (!quest) {
      return NextResponse.json({ error: "Quest not found" }, { status: 404 });
    }

    if (!quest.participants || typeof quest.participants.entries !== "function") {
      return NextResponse.json(
        { error: "Quest has no participants map", fixed: 0 },
        { status: 400 }
      );
    }

    const { fixedCount } = normalizeParticipantsRewardProgress(quest.participants);
    if (fixedCount > 0) {
      quest.markModified("participants");
      await quest.save();
    }

    return NextResponse.json({
      fixed: fixedCount,
      questID: quest.questID ?? null,
    });
  } catch (e) {
    logger.error(
      "api/admin/quests/[id]/sync-reward-progress POST",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to sync participant reward progress" },
      { status: 500 }
    );
  }
}
