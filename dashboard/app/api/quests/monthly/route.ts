import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";

/** Parse "Month Year" (e.g. "January 2026") to Date (first of month). Returns null if invalid. */
function parseMonthYear(dateStr: string): Date | null {
  const s = (dateStr || "").trim();
  if (!s) return null;
  const parts = s.split(/\s+/);
  if (parts.length < 2) return null;
  const year = parseInt(parts[parts.length - 1], 10);
  const month = parts.slice(0, -1).join(" ");
  if (Number.isNaN(year) || !month) return null;
  const d = new Date(`${month} 1, ${year}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * GET /api/quests/monthly
 * Returns quests for the most recent month only (e.g. if Oct 2025 and Jan 2026 exist, only Jan 2026).
 */
export async function GET() {
  try {
    await connect();
    const Quest = (await import("@/models/QuestModel.js")).default;

    const docs = await Quest.find({})
      .lean()
      .exec();

    const dateStrings = [...new Set((docs as { date?: string }[]).map((d) => d.date).filter(Boolean))] as string[];
    if (dateStrings.length === 0) {
      return NextResponse.json({ quests: [], month: null });
    }

    let latestDate: Date | null = null;
    let latestStr: string | null = null;
    for (const s of dateStrings) {
      const d = parseMonthYear(s);
      if (d && (!latestDate || d > latestDate)) {
        latestDate = d;
        latestStr = s;
      }
    }

    if (!latestStr || !latestDate) {
      return NextResponse.json({ quests: [], month: null });
    }

    const latestYear = latestDate.getFullYear();
    const latestMonth = latestDate.getMonth();

    const quests = (docs as { date?: string }[]).filter((q) => {
      const d = parseMonthYear(q.date ?? "");
      return d && d.getFullYear() === latestYear && d.getMonth() === latestMonth;
    });
    return NextResponse.json({ quests, month: latestStr });
  } catch (e) {
    logger.error("api/quests/monthly", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch monthly quests" },
      { status: 500 }
    );
  }
}
