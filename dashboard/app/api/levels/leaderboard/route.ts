/**
 * GET /api/levels/leaderboard — fetch top 10 users by level/XP (Top Yappers)
 */

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";
import type { LeaderboardResponse } from "@/types/levels";

// Cache leaderboard for 2 minutes - updates frequently but not constantly
export const revalidate = 120;

export async function GET() {
  try {
    await connect();
    const { default: User } = await import("@/models/UserModel.js");

    // Get top 10 users sorted by level (descending), then XP (descending)
    type LeaderboardUserDoc = {
      username?: string;
      nickname?: string;
      leveling: {
        level: number;
        xp?: number;
        totalMessages?: number;
      };
      avatar?: string;
      discordId: string;
    };
    const topUsers = await User.find({})
      .sort({ 'leveling.level': -1, 'leveling.xp': -1 })
      .limit(10)
      .select('username nickname leveling.xp leveling.level leveling.totalMessages avatar discordId')
      .lean<LeaderboardUserDoc[]>();

    const leaderboard = topUsers
      .filter((user) => user.leveling && typeof user.leveling.level === 'number')
      .map((user, index) => ({
        rank: index + 1,
        username: user.username || 'Unknown',
        nickname: user.nickname,
        level: user.leveling.level,
        totalXP: user.leveling.xp || 0,
        messages: user.leveling.totalMessages || 0,
        avatar: user.avatar,
        discordId: user.discordId,
      }));

    const response: LeaderboardResponse = { leaderboard };
    const httpResponse = NextResponse.json(response);
    
    // Add cache headers
    httpResponse.headers.set(
      "Cache-Control",
      "public, s-maxage=120, stale-while-revalidate=300"
    );
    
    return httpResponse;
  } catch (e) {
    logger.error("api/levels/leaderboard", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}
