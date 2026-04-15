import { NextResponse } from "next/server";
import { connect, isDatabaseUnavailableError, logDatabaseUnavailableOnce } from "@/lib/db";
import { logger } from "@/utils/logger";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BLUPEE_QUEST_TITLE_RE = /\bblupee\b/i;

// This endpoint is backed by live DB state; do not cache.
export const dynamic = "force-dynamic";

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
    const TempData = (await import("@/models/TempDataModel.js")).default;

    type QuestDoc = {
      date?: string;
      timeLimit?: string;
      status?: string;
      title?: string;
      questType?: string;
      requiredRolls?: number;
      participants?: Record<string, { successfulRolls?: number | null }>;
      [key: string]: unknown;
    };
    const docs = await Quest.find({ status: "active" })
      .lean<QuestDoc[]>()
      .exec();

    const quests = docs.filter((q) => isQuestCurrent(q.date ?? "", q.timeLimit));

    // Blupee interactive quests use /minigame blupee and track "rupees earned" in TempData (blupeeRupeeTally).
    // For the dashboard participant list ("Active • 0/1 rolls"), hydrate successfulRolls from the tally so anyone
    // with >=1 rupee shows as having completed the required roll(s).
    const blupeeQuests = quests.filter(
      (q) => q.questType === "Interactive" && BLUPEE_QUEST_TITLE_RE.test(String(q.title ?? ""))
    );
    if (blupeeQuests.length > 0) {
      const seasonKey = String(new Date().getUTCFullYear());
      const userIdSet = new Set<string>();
      for (const q of blupeeQuests) {
        const parts = q.participants;
        if (!parts || typeof parts !== "object") continue;
        for (const uid of Object.keys(parts)) userIdSet.add(uid);
      }
      const userIds = [...userIdSet];
      if (userIds.length > 0) {
        const tallyDocs = await TempData.find({
          type: "blupeeRupeeTally",
          "data.userId": { $in: userIds },
          "data.seasonKey": seasonKey,
          expiresAt: { $gt: new Date() },
        })
          .lean<{ data?: { userId?: string; count?: number } }[]>()
          .exec();
        const countByUser = new Map<string, number>();
        for (const d of tallyDocs) {
          const uid = String(d?.data?.userId ?? "").trim();
          if (!uid) continue;
          const c = Number(d?.data?.count ?? 0);
          if (Number.isFinite(c) && c > 0) countByUser.set(uid, c);
        }

        for (const q of blupeeQuests) {
          if (!q.participants || typeof q.participants !== "object") continue;
          const requiredRolls = typeof q.requiredRolls === "number" && q.requiredRolls > 0 ? q.requiredRolls : 1;
          for (const [uid, p] of Object.entries(q.participants)) {
            const c = countByUser.get(uid) ?? 0;
            // For Blupee, expose the full season tally so UI can show "X caught".
            // (Completion checks can clamp on the client if needed.)
            (p as { successfulRolls?: number | null }).successfulRolls = Math.max(0, c);
          }
        }
      }
    }

    const month = quests.length > 0 ? currentMonthDisplay() : null;
    return NextResponse.json({ quests, month });
  } catch (e) {
    if (isDatabaseUnavailableError(e)) {
      logDatabaseUnavailableOnce("quests/monthly");
      return NextResponse.json(
        { quests: [], month: null },
        { status: 200, headers: { "X-Degraded": "database" } }
      );
    }
    logger.error("api/quests/monthly", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch monthly quests" },
      { status: 500 }
    );
  }
}
