import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";

export const dynamic = "force-dynamic";

const GRID_COLS = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function parseSquareId(squareId: string): boolean {
  const m = String(squareId).trim().match(/^([A-J])(1[0-2]|[1-9])$/);
  if (!m) return false;
  const colIndex = GRID_COLS.indexOf(m[1]);
  const row = parseInt(m[2], 10);
  return colIndex >= 0 && row >= 1 && row <= 12;
}

/** GET ?square=H5 — returns quadrant statuses for the ROTW map (text color only).
 * Reads from exploringMap collection in the tinglebot DB (dashboard must use MONGODB_TINGLEBOT_URI or same MONGODB_URI as bot). */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const square = searchParams.get("square")?.trim().toUpperCase() || "";

    if (!square || !parseSquareId(square)) {
      return NextResponse.json({ error: "Invalid or missing square" }, { status: 400 });
    }

    const quadrantStatuses: Record<string, string> = { Q1: "unexplored", Q2: "unexplored", Q3: "unexplored", Q4: "unexplored" };

    try {
      await connect();
      const Square = (await import("@/models/mapModel.js")).default;
      const doc = await Square.findOne({ squareId: square }).lean() as {
        quadrants?: Array<{ quadrantId: string; status?: string }>;
      } | null;
      if (doc?.quadrants && Array.isArray(doc.quadrants)) {
        for (const q of doc.quadrants) {
          const id = String(q.quadrantId || "").trim().toUpperCase();
          if (id === "Q1" || id === "Q2" || id === "Q3" || id === "Q4") {
            const s = String(q.status ?? "").trim().toLowerCase();
            quadrantStatuses[id] =
              ["inaccessible", "unexplored", "explored", "secured"].includes(s) ? s : "unexplored";
          }
        }
      }
    } catch {
      // DB optional
    }

    const res = NextResponse.json({ squareId: square, quadrantStatuses });
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (err) {
    console.error("[map-quadrant-statuses]", err);
    return NextResponse.json({ error: "Failed to get quadrant statuses" }, { status: 500 });
  }
}
