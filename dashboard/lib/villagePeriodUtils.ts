/**
 * Village raid period utilities. Matches bot logic in randomMonsterEncounters.js
 * so dashboard "raids this period" uses the same week/biweek/month boundaries.
 * Week boundaries use America/New_York (EST/EDT).
 */

import moment from "moment-timezone";

const EASTERN_TZ = "America/New_York";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Current week start: Sunday 00:00 Eastern */
export function getCurrentWeekStart(): Date {
  const m = moment.tz(EASTERN_TZ);
  return m.clone().startOf("day").subtract(m.day(), "days").toDate();
}

/** Current month start: first Monday of the calendar month (UTC). Matches bot getCurrentMonthStart. */
export function getCurrentMonthStart(): Date {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const dayOfWeek = date.getUTCDay();
  if (dayOfWeek === 0) {
    date.setUTCDate(2);
  } else if (dayOfWeek > 1) {
    date.setUTCDate(1 + (8 - dayOfWeek));
  }
  return date;
}

/** Current biweek start: Sunday at start of current 2-week block (Eastern). Reference: Jan 5 2020 00:00 Eastern. */
export function getCurrentBiweekStart(): Date {
  const refSunday = moment.tz([2020, 0, 5, 0, 0, 0, 0], EASTERN_TZ).valueOf();
  const weekStart = getCurrentWeekStart().getTime();
  const weeksSince = (weekStart - refSunday) / WEEK_MS;
  const biweekIndex = Math.floor(weeksSince / 2);
  return new Date(refSunday + biweekIndex * 2 * WEEK_MS);
}

/** Period start for a village by level. Level 1 = week, 2 = biweek, 3 = month. */
export function getVillagePeriodStart(level: number): Date {
  if (level === 1) return getCurrentWeekStart();
  if (level === 2) return getCurrentBiweekStart();
  return getCurrentMonthStart();
}
