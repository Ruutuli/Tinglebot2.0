// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import { NextResponse } from "next/server";
import { connect, isDatabaseUnavailableError, logDatabaseUnavailableOnce } from "@/lib/db";
import { logger } from "@/utils/logger";

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

// Cache weather for 5 minutes - changes daily at 8am EST
export const revalidate = 300;

// Weather day is 8:00am–7:59:59am America/New_York (handles DST).
const WEATHER_TIME_ZONE = "America/New_York";

const VILLAGES = ["Rudania", "Inariko", "Vhintl"] as const;

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type WeatherDayRange = {
  start: Date;
  end: Date;
};

// ============================================================================
// ------------------- Pure Helpers -------------------
// ============================================================================

function getZonedParts(date: Date, timeZone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  type PartType = "year" | "month" | "day" | "hour" | "minute" | "second";
  const get = (type: PartType) => parts.find((p) => p.type === type)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

/**
 * Convert a wall-clock time in a specific IANA time zone into a UTC Date.
 * This is DST-safe without extra deps (similar approach to date-fns-tz).
 */
function zonedTimeToUtc(
  input: { year: number; month: number; day: number; hour: number; minute: number; second: number; ms?: number },
  timeZone: string
): Date {
  // First pass: treat the wall-clock time as if it were UTC.
  const utcGuess = new Date(Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second, input.ms ?? 0));
  // See what that instant looks like in the target zone.
  const inZone = getZonedParts(utcGuess, timeZone);

  // Compute the wall-clock delta between desired and observed, then correct the guess.
  const desiredMs = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, input.second, input.ms ?? 0);
  const observedMs = Date.UTC(inZone.year, inZone.month - 1, inZone.day, inZone.hour, inZone.minute, inZone.second, input.ms ?? 0);
  const diffMs = desiredMs - observedMs;
  return new Date(utcGuess.getTime() + diffMs);
}

// Calculates the current weather day range in UTC for 8:00am–7:59:59am America/New_York.
function getCurrentWeatherDayRangeUTC(): WeatherDayRange {
  const now = new Date();
  const nowNY = getZonedParts(now, WEATHER_TIME_ZONE);

  // "Weather day" starts at 08:00 local. If it's before 08:00 local, use previous local date.
  let startYear = nowNY.year;
  let startMonth = nowNY.month;
  let startDay = nowNY.day;
  if (nowNY.hour < 8) {
    const midnightLocalAsUtc = zonedTimeToUtc(
      { year: nowNY.year, month: nowNY.month, day: nowNY.day, hour: 0, minute: 0, second: 0, ms: 0 },
      WEATHER_TIME_ZONE
    );
    midnightLocalAsUtc.setUTCDate(midnightLocalAsUtc.getUTCDate() - 1);
    const prevNY = getZonedParts(midnightLocalAsUtc, WEATHER_TIME_ZONE);
    startYear = prevNY.year;
    startMonth = prevNY.month;
    startDay = prevNY.day;
  }

  const start = zonedTimeToUtc(
    { year: startYear, month: startMonth, day: startDay, hour: 8, minute: 0, second: 0, ms: 0 },
    WEATHER_TIME_ZONE
  );

  // End = next local day 07:59:59.999
  const end = zonedTimeToUtc(
    { year: startYear, month: startMonth, day: startDay + 1, hour: 7, minute: 59, second: 59, ms: 999 },
    WEATHER_TIME_ZONE
  );

  return { start, end };
}

// ============================================================================
// ------------------- API Route Handlers -------------------
// ============================================================================

// ------------------- GET ------------------
// GET /api/weather
// Returns today's weather for Rudania, Inariko, Vhintl (weather day = 8am EST–7:59am EST next, in UTC).
export async function GET() {
  try {
    await connect();
    const Weather = (await import("@/models/WeatherModel.js")).default;
    const { start, end } = getCurrentWeatherDayRangeUTC();

    type WeatherDoc = {
      village: string;
      date: Date;
      [key: string]: unknown;
    };
    const docs = await Weather.find({
      village: { $in: VILLAGES },
      date: { $gte: start, $lte: end },
    })
      .lean<WeatherDoc[]>()
      .exec();

    const response = NextResponse.json({
      weather: docs,
      range: {
        start: start.toISOString(),
        end: end.toISOString(),
        timeZone: WEATHER_TIME_ZONE,
      },
    });

    // Add cache headers - weather changes daily, so cache longer
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    return response;
  } catch (err: unknown) {
    if (isDatabaseUnavailableError(err)) {
      logDatabaseUnavailableOnce("weather");
      return NextResponse.json(
        { weather: [] },
        { status: 200, headers: { "X-Degraded": "database" } }
      );
    }
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("[route.ts]❌ Failed to fetch weather:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch weather" },
      { status: 500 }
    );
  }
}
