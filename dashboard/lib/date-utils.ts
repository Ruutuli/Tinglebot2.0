/**
 * Date utilities for Character of the Week rotation
 * Eastern week boundaries use America/New_York (EST/EDT), not a fixed UTC offset.
 */

import moment from "moment-timezone";

const EASTERN_TZ = "America/New_York";

/**
 * Next Sunday at 00:00 Eastern (end of the current weekly window / start of next).
 */
export function getNextSundayMidnightEST(): Date {
  const m = moment.tz(EASTERN_TZ);
  const weekStart = m.clone().startOf("day").subtract(m.day(), "days");
  return weekStart.clone().add(7, "days").toDate();
}

/**
 * Format time remaining until a target date
 * Returns formatted string like "3d 12h 30m 15s"
 */
export function formatTimeUntil(targetDate: Date, currentDate: Date = new Date()): string {
  const diff = targetDate.getTime() - currentDate.getTime();

  if (diff <= 0) {
    return "00d 00h 00m 00s";
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return `${String(days).padStart(2, "0")}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

/**
 * Start of the current Eastern week (last Sunday 00:00 local).
 */
export function getCurrentWeekStartDate(): Date {
  const m = moment.tz(EASTERN_TZ);
  return m.clone().startOf("day").subtract(m.day(), "days").toDate();
}
