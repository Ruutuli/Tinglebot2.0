import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import {
  getCurrentCharacterOfWeek,
  rotateCharacterOfWeek,
  serializeCharacterOfWeek,
  buildRotationInfo,
} from "@/lib/character-of-week";
import { formatTimeUntil, getNextSundayMidnightEST } from "@/lib/date-utils";
import { logger } from "@/utils/logger";

/**
 * POST /api/character-of-week/random
 * Randomly select and set a character as Character of the Week
 * Uses the fair rotation algorithm
 */
export async function POST(req: NextRequest) {
  try {
    await connect();
    
    await rotateCharacterOfWeek("Random selection");
    
    // Return the updated character of the week
    const current = await getCurrentCharacterOfWeek();
    const nextRotation = getNextSundayMidnightEST();
    const timeUntilRotation = formatTimeUntil(nextRotation);
    
    if (!current) {
      return NextResponse.json(
        { error: "Failed to get updated character of the week" },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      characterOfWeek: serializeCharacterOfWeek(current),
      rotationInfo: buildRotationInfo(nextRotation, timeUntilRotation),
    });
  } catch (error) {
    logger.error(
      "api/character-of-week/random",
      `Error rotating character of the week: ${error instanceof Error ? error.message : String(error)}`
    );
    return NextResponse.json(
      { error: "Failed to rotate character of the week" },
      { status: 500 }
    );
  }
}
