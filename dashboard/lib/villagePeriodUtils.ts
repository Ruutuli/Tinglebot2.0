/**
 * Village raid period utilities. Matches bot logic in randomMonsterEncounters.js
 * so dashboard "raids this period" uses the same week/biweek/month boundaries.
 * All period starts use EST (UTC-5) where the bot does.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Midnight EST on the given date, as UTC Date. EST = UTC-5, so midnight EST = 05:00 UTC. */
function getMidnightESTInUTC(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 5, 0, 0));
}

/** Current week start: Sunday 00:00 EST (this week). */
export function getCurrentWeekStart(): Date {
  const now = new Date();
  const estOffset = 5 * 60 * 60 * 1000;
  const estNow = new Date(now.getTime() - estOffset);

  const estYear = estNow.getUTCFullYear();
  const estMonth = estNow.getUTCMonth() + 1;
  const estDay = estNow.getUTCDate();
  const dayOfWeek = estNow.getUTCDay(); // 0 = Sunday

  const todayMidnightEST = getMidnightESTInUTC(estYear, estMonth, estDay);
  const todayNoonUTC = new Date(todayMidnightEST);
  todayNoonUTC.setUTCHours(todayNoonUTC.getUTCHours() + 12);

  const sundayNoonUTC = new Date(todayNoonUTC);
  sundayNoonUTC.setUTCDate(sundayNoonUTC.getUTCDate() - dayOfWeek);

  const sundayEST = new Date(sundayNoonUTC.getTime() - estOffset);
  const sy = sundayEST.getUTCFullYear();
  const sm = sundayEST.getUTCMonth() + 1;
  const sd = sundayEST.getUTCDate();
  return getMidnightESTInUTC(sy, sm, sd);
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

/** Current biweek start: Sunday at start of current 2-week block (EST). Reference: Jan 5 2020 00:00 EST. */
export function getCurrentBiweekStart(): Date {
  const refSunday = new Date(Date.UTC(2020, 0, 5, 5, 0, 0));
  const weekStart = getCurrentWeekStart();
  const weeksSince = (weekStart.getTime() - refSunday.getTime()) / WEEK_MS;
  const biweekIndex = Math.floor(weeksSince / 2);
  return new Date(refSunday.getTime() + biweekIndex * 2 * WEEK_MS);
}

/** Period start for a village by level. Level 1 = week, 2 = biweek, 3 = month. */
export function getVillagePeriodStart(level: number): Date {
  if (level === 1) return getCurrentWeekStart();
  if (level === 2) return getCurrentBiweekStart();
  return getCurrentMonthStart();
}
