import { NextResponse } from "next/server";
import { connect } from "@/lib/db";

export const dynamic = "force-dynamic";

type QuadrantDoc = {
  quadrantId: string;
  status?: string;
  blighted?: boolean;
};

type SquareDoc = {
  squareId: string;
  region: string;
  status: string;
  quadrants?: QuadrantDoc[];
};

/**
 * GET /api/explore/map-metadata
 * Returns all square metadata from the exploringMap collection (tinglebot DB).
 * Used by the map page instead of hardcoded map-metadata.js data.
 */
export async function GET() {
  try {
    await connect();
    const Square = (await import("@/models/mapModel.js")).default;
    const docs = await Square.find({})
      .lean()
      .select("squareId region status quadrants")
      .sort({ squareId: 1 });

    const squares = (docs as unknown as SquareDoc[]).map((doc) => {
      const match = String(doc.squareId || "").match(/^([A-J])(\d+)$/);
      const letter = match ? match[1] : doc.squareId?.charAt(0) ?? "";
      const number = match ? parseInt(match[2], 10) : 0;
      const quadrants = Array.isArray(doc.quadrants)
        ? doc.quadrants.map((q) => ({
            quadrantId: String(q.quadrantId ?? "").trim(),
            status:
              ["inaccessible", "unexplored", "explored", "secured"].includes(
                String(q.status ?? "").toLowerCase()
              )
                ? String(q.status).trim().toLowerCase()
                : "unexplored",
            blighted: Boolean(q.blighted),
          }))
        : [];
      return {
        square: doc.squareId,
        letter,
        number,
        region: doc.region ?? "Unknown",
        status: doc.status ?? "explorable",
        quadrants,
      };
    });

    const res = NextResponse.json({ squares });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    console.error("[explore/map-metadata]", err);
    return NextResponse.json(
      { error: "Failed to load map metadata" },
      { status: 500 }
    );
  }
}
