/**
 * GET /api/levels/blupee-hunters — fetch top 10 users by blupee count
 */

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";
import type { BlupeeHuntersResponse } from "@/types/levels";

export async function GET() {
  try {
    await connect();
    const { default: User } = await import("@/models/UserModel.js");

    // Get top 10 users sorted by totalClaimed (descending)
    const topHunters = await User.find({})
      .sort({ 'blupeeHunt.totalClaimed': -1 })
      .limit(10)
      .select('username nickname blupeeHunt.totalClaimed blupeeHunt.lastClaimed avatar discordId')
      .lean();

    const leaderboard = topHunters
      .filter((user) => user.blupeeHunt && typeof user.blupeeHunt.totalClaimed === 'number')
      .map((user, index) => ({
        rank: index + 1,
        username: user.username || 'Unknown',
        nickname: user.nickname,
        totalClaimed: user.blupeeHunt.totalClaimed || 0,
        lastClaimed: user.blupeeHunt.lastClaimed || null,
        avatar: user.avatar,
        discordId: user.discordId,
      }));

    const response: BlupeeHuntersResponse = { leaderboard };
    return NextResponse.json(response);
  } catch (e) {
    logger.error("api/levels/blupee-hunters", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch blupee hunters leaderboard" },
      { status: 500 }
    );
  }
}
