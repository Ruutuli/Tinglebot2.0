// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

// Cache weather for 5 minutes - changes daily at 8am EST
export const revalidate = 300;

// Weather posts 8am EST–7:59am EST next day. EST = UTC−5 → 13:00 UTC–12:59 UTC next day.
const WEATHER_DAY_START_HOUR_UTC = 13;
const WEATHER_DAY_END_HOUR_UTC = 12;
const WEATHER_DAY_END_MINUTE_UTC = 59;
const WEATHER_DAY_END_SECOND_UTC = 59;
const WEATHER_DAY_END_MS_UTC = 999;

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

// ------------------- getCurrentWeatherDayRangeUTC ------------------
// Calculates the current weather day range in UTC.
// Weather day = 8am EST–7:59am EST next day (13:00 UTC–12:59 UTC next day).
function getCurrentWeatherDayRangeUTC(): WeatherDayRange {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const h = now.getUTCHours();

  let wy = y;
  let wm = m;
  let wd = d;
  if (h < WEATHER_DAY_START_HOUR_UTC) {
    const prev = new Date(Date.UTC(y, m, d));
    prev.setUTCDate(prev.getUTCDate() - 1);
    wy = prev.getUTCFullYear();
    wm = prev.getUTCMonth();
    wd = prev.getUTCDate();
  }

  const start = new Date(Date.UTC(wy, wm, wd, WEATHER_DAY_START_HOUR_UTC, 0, 0, 0));
  const end = new Date(
    Date.UTC(wy, wm, wd + 1, WEATHER_DAY_END_HOUR_UTC, WEATHER_DAY_END_MINUTE_UTC, WEATHER_DAY_END_SECOND_UTC, WEATHER_DAY_END_MS_UTC)
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

    const response = NextResponse.json({ weather: docs });

    // Add cache headers - weather changes daily, so cache longer
    response.headers.set(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600"
    );

    return response;
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error("[route.ts]❌ Failed to fetch weather:", error.message);
    return NextResponse.json(
      { error: "Failed to fetch weather" },
      { status: 500 }
    );
  }
}
