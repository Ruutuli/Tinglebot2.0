import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getCurrentCharacterOfWeek, serializeCharacterOfWeek } from "@/lib/character-of-week";
import { getNextSundayMidnightEST } from "@/lib/date-utils";
import { logger } from "@/utils/logger";

/**
 * GET /api/character-of-week/rotation-status
 * Returns rotation history and upcoming rotation info
 */
export async function GET(req: NextRequest) {
  try {
    await connect();
    
    const CharacterOfWeek = (await import("@/models/CharacterOfWeekModel.js")).default;
    
    // Get current featured character
    const current = await getCurrentCharacterOfWeek();
    
    // Get rotation history (last 10)
    const history = await CharacterOfWeek.find()
      .sort({ startDate: -1 })
      .limit(10)
      .lean();
    
    // Get statistics
    const totalRotations = await CharacterOfWeek.countDocuments();
    const uniqueCharactersFeatured = await CharacterOfWeek.distinct("characterId");
    
    const nextRotation = getNextSundayMidnightEST();
    
    return NextResponse.json({
      current: serializeCharacterOfWeek(current),
      nextRotation: {
        date: nextRotation.toISOString(),
        timestamp: nextRotation.getTime(),
      },
      statistics: {
        totalRotations,
        uniqueCharactersFeatured: uniqueCharactersFeatured.length,
      },
      history: history.map((item) => ({
        _id: item._id,
        characterId: item.characterId,
        characterName: item.characterName,
        userId: item.userId,
        startDate: item.startDate,
        endDate: item.endDate,
        featuredReason: item.featuredReason,
        isActive: item.isActive,
        views: item.views,
      })),
    });
  } catch (error) {
    logger.error(
      "api/character-of-week/rotation-status",
      `Error fetching rotation status: ${error instanceof Error ? error.message : String(error)}`
    );
    return NextResponse.json(
      { error: "Failed to fetch rotation status" },
      { status: 500 }
    );
  }
}
