import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";

const VILLAGE_ORDER = ["Rudania", "Inariko", "Vhintl"] as const;
const DEFAULT_HEALTH: Record<number, number> = { 1: 100, 2: 200, 3: 300 };
const DEFAULT_TOKEN_REQUIREMENTS: Record<number, number> = { 2: 10000, 3: 50000 };

type VillageDoc = {
  name: string;
  health?: number;
  level?: number;
  currentTokens?: number;
  status?: string;
  levelHealth?: Record<string, number>;
  tokenRequirements?: Record<string, number>;
};

/**
 * GET /api/village-levels
 * Returns Rudania, Inariko, Vhintl for homepage village level cards.
 */

// Cache village levels for 1 minute - they change when users contribute
export const revalidate = 60;

export async function GET() {
  try {
    await connect();
    const { Village } = await import("@/models/VillageModel.js");

    const docs = await Village.find({
      name: { $in: [...VILLAGE_ORDER] },
    })
      .lean()
      .exec();

    const byName = new Map<string, VillageDoc>();
    for (const d of docs) {
      const doc = d as unknown as VillageDoc;
      byName.set(doc.name, doc);
    }

    const villages = VILLAGE_ORDER.map((name) => byName.get(name) ?? null);
    const response = NextResponse.json({ villages });
    
    // Add cache headers
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=180"
    );
    
    return response;
  } catch (e) {
    logger.error("api/village-levels", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch village levels" },
      { status: 500 }
    );
  }
}
