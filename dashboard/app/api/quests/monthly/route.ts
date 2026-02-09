import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

/** Parse "March 2026" or "2026-03" to YYYY-MM for duration math. Returns empty string if invalid. */
function questDateToYYYYMM(dateStr: string): string {
  const s = (dateStr ?? "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const monthIdx = MONTH_NAMES.findIndex((m) => s.startsWith(m));
  if (monthIdx < 0) return "";
  const rest = s.slice(MONTH_NAMES[monthIdx].length).trim();
  const yearMatch = rest.match(/^\d{4}$/);
  if (yearMatch) return `${yearMatch[0]}-${String(monthIdx + 1).padStart(2, "0")}`;
  return "";
}

/** Compute end date (exclusive: first day after the duration) from start YYYY-MM and timeLimit string. */
function getEndDateFromDuration(startYYYYMM: string, duration: string): Date | null {
  if (!startYYYYMM || !/^\d{4}-\d{2}$/.test(startYYYYMM)) return null;
  const [y, m] = startYYYYMM.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  if (Number.isNaN(start.getTime())) return null;
  const d = String(duration).toLowerCase();
  let end: Date;
  const weekMatch = d.match(/(\d+)\s*week/);
  const monthMatch = d.match(/(\d+)\s*month/);
  const dayMatch = d.match(/(\d+)\s*day/);
  if (weekMatch) {
    end = new Date(start);
    end.setDate(end.getDate() + parseInt(weekMatch[1], 10) * 7);
  } else if (monthMatch) {
    end = new Date(start);
    end.setMonth(end.getMonth() + parseInt(monthMatch[1], 10));
  } else if (dayMatch) {
    end = new Date(start);
    end.setDate(end.getDate() + parseInt(dayMatch[1], 10));
  } else if (duration === "Custom") {
    return null;
  } else {
    end = new Date(start);
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

/** True if today (local date) is within [start of quest month, end of duration). */
function isQuestCurrent(dateStr: string, timeLimit: string | undefined): boolean {
  const yyyyMm = questDateToYYYYMM(dateStr);
  if (!yyyyMm || !timeLimit?.trim()) return false;
  const [y, m] = yyyyMm.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  if (Number.isNaN(start.getTime())) return false;
  const end = getEndDateFromDuration(yyyyMm, timeLimit);
  if (!end) return false;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today.getTime() >= start.getTime() && today.getTime() < end.getTime();
}

/** Current month display string e.g. "February 2026". */
function currentMonthDisplay(): string {
  const now = new Date();
  return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
}

/**
 * GET /api/quests/monthly
 * Returns only active quests whose date/duration window includes today.
 */
export async function GET() {
  try {
    await connect();
    const Quest = (await import("@/models/QuestModel.js")).default;

    type QuestDoc = {
      date?: string;
      timeLimit?: string;
      status?: string;
      [key: string]: unknown;
    };
    const docs = await Quest.find({ status: "active" })
      .lean<QuestDoc[]>()
      .exec();

    const quests = docs.filter((q) => isQuestCurrent(q.date ?? "", q.timeLimit));
    const month = quests.length > 0 ? currentMonthDisplay() : null;
    return NextResponse.json({ quests, month });
  } catch (e) {
    logger.error("api/quests/monthly", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch monthly quests" },
      { status: 500 }
    );
  }
}
