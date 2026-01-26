// GET /api/characters/my-companions — get current user's mounts and pets

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";

// Cache user-specific companions for 1 minute
export const revalidate = 60;

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connect();
    
    const { default: Pet } = await import("@/models/PetModel.js");
    const { default: Mount } = await import("@/models/MountModel.js");

    // Fetch pets and mounts for the current user
    const [pets, mounts] = await Promise.all([
      Pet.find({ discordId: user.id })
        .populate("owner", "name")
        .lean()
        .sort({ name: 1 }),
      Mount.find({ discordId: user.id })
        .populate("characterId", "name")
        .lean()
        .sort({ name: 1 }),
    ]);

    const response = NextResponse.json({
      pets: pets || [],
      mounts: mounts || [],
    });

    // Add cache headers - private cache since this is user-specific
    response.headers.set(
      "Cache-Control",
      "private, s-maxage=60, stale-while-revalidate=120"
    );

    return response;
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    logger.error("api/characters/my-companions", errorMessage);
    return NextResponse.json(
      { 
        error: "Failed to fetch companions",
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}
