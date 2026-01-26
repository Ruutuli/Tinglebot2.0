/**
 * GET /api/levels/my-rank — fetch current user's rank and leveling stats
 */

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";
import type { MyRankData } from "@/types/levels";

function getXPRequiredForLevel(targetLevel: number): number {
  if (targetLevel < 1) return 0;
  return 5 * Math.pow(targetLevel, 2) + 50 * targetLevel + 100;
}

function calculateLevelProgress(leveling: { level: number; xp: number }) {
  // Calculate XP needed for current level
  let currentLevelTotalXP = 0;
  for (let i = 2; i <= leveling.level; i++) {
    currentLevelTotalXP += getXPRequiredForLevel(i);
  }

  // Calculate XP needed for next level
  const xpNeededForNextLevel = getXPRequiredForLevel(leveling.level + 1);

  // Calculate progress within current level
  const progressXP = leveling.xp - currentLevelTotalXP;
  const percentage = Math.min(100, Math.max(0, Math.round((progressXP / xpNeededForNextLevel) * 100)));

  return {
    currentXP: progressXP,
    nextLevelXP: xpNeededForNextLevel,
    percentage,
  };
}

export async function GET() {
  try {
    const session = await getSession();
    const discordId = session.user?.id;

    if (!discordId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    await connect();
    const { default: User } = await import("@/models/UserModel.js");

    // Get current user
    type UserLeveling = {
      leveling?: {
        level: number;
        xp?: number;
        totalMessages?: number;
        lastExchangedLevel?: number;
        hasImportedFromMee6?: boolean;
        importedMee6Level?: number | null;
      };
    };
    const user = await User.findOne({ discordId })
      .select("leveling")
      .lean<UserLeveling>();
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    if (!user.leveling || typeof user.leveling.level !== 'number') {
      return NextResponse.json(
        { error: "User leveling data not found" },
        { status: 404 }
      );
    }

    // Calculate rank by counting users with higher level/XP
    const rank = await User.countDocuments({
      $or: [
        { 'leveling.level': { $gt: user.leveling.level } },
        {
          'leveling.level': user.leveling.level,
          'leveling.xp': { $gt: user.leveling.xp || 0 }
        }
      ]
    }) + 1;

    // Calculate progress
    const progress = calculateLevelProgress({
      level: user.leveling.level,
      xp: user.leveling.xp || 0,
    });

    // Calculate exchangeable levels
    const lastExchangedLevel = user.leveling.lastExchangedLevel || 0;
    const exchangeableLevels = user.leveling.level - lastExchangedLevel;
    const potentialTokens = exchangeableLevels * 100;

    const response: MyRankData = {
      level: user.leveling.level,
      rank,
      totalXP: user.leveling.xp || 0,
      messages: user.leveling.totalMessages || 0,
      currentXP: progress.currentXP,
      nextLevelXP: progress.nextLevelXP,
      progressPercentage: progress.percentage,
      exchangeableLevels,
      potentialTokens,
      hasImportedFromMee6: user.leveling.hasImportedFromMee6 || false,
      importedMee6Level: user.leveling.importedMee6Level || null,
    };

    return NextResponse.json(response);
  } catch (e) {
    logger.error("api/levels/my-rank", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch rank data" },
      { status: 500 }
    );
  }
}
