import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import {
  getCurrentCharacterOfWeek,
  setCharacterOfWeek,
  serializeCharacterOfWeek,
  buildRotationInfo,
} from "@/lib/character-of-week";
import { formatTimeUntil, getNextSundayMidnightEST } from "@/lib/date-utils";
import { logger } from "@/utils/logger";

/**
 * GET /api/character-of-week
 * Returns the current featured character with rotation info
 */
export async function GET(req: NextRequest) {
  try {
    await connect();
    
    const current = await getCurrentCharacterOfWeek();
    
    if (!current) {
      return NextResponse.json(
        { error: "No character of the week found" },
        { status: 404 }
      );
    }
    
    const nextRotation = getNextSundayMidnightEST();
    const timeUntilRotation = formatTimeUntil(nextRotation);
    
    // Get total rotation count
    const CharacterOfWeek = (await import("@/models/CharacterOfWeekModel.js")).default;
    const totalRotations = await CharacterOfWeek.countDocuments();
    
    return NextResponse.json({
      characterOfWeek: serializeCharacterOfWeek(current),
      rotationInfo: buildRotationInfo(nextRotation, timeUntilRotation, totalRotations),
    });
  } catch (error) {
    logger.error(
      "api/character-of-week",
      `Error fetching character of the week: ${error instanceof Error ? error.message : String(error)}`
    );
    return NextResponse.json(
      { error: "Failed to fetch character of the week" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/character-of-week
 * Manually set a character as Character of the Week
 * Body: { characterId: string, featuredReason?: string }
 */
export async function POST(req: NextRequest) {
  try {
    await connect();
    
    const body = await req.json();
    const { characterId, featuredReason } = body;
    
    if (!characterId || typeof characterId !== "string") {
      return NextResponse.json(
        { error: "characterId is required and must be a string" },
        { status: 400 }
      );
    }
    
    await setCharacterOfWeek(
      characterId,
      featuredReason || "Manual selection"
    );
    
    // Return the updated character of the week
    const current = await getCurrentCharacterOfWeek();
    const nextRotation = getNextSundayMidnightEST();
    const timeUntilRotation = formatTimeUntil(nextRotation);
    
    return NextResponse.json({
      success: true,
      characterOfWeek: serializeCharacterOfWeek(current),
      rotationInfo: buildRotationInfo(nextRotation, timeUntilRotation),
    });
  } catch (error) {
    logger.error(
      "api/character-of-week",
      `Error setting character of the week: ${error instanceof Error ? error.message : String(error)}`
    );
    
    const errorMessage =
      error instanceof Error && error.message.includes("not found")
        ? error.message
        : "Failed to set character of the week";
    
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
