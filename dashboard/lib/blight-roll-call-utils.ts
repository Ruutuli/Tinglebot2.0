/**
 * Blight Roll Call utilities
 * Handles Blight Roll Call time calculations (daily at 8pm ET / 1am UTC)
 */

/**
 * Get the next Blight Roll Call time
 * Blight Roll Call occurs every day at 8pm ET (1am UTC the next day)
 * 
 * @param currentDate - The current date (defaults to now)
 * @returns The next Blight Roll Call date/time
 */
export function getNextBlightRollCallTime(
  currentDate: Date = new Date()
): Date {
  // Create a date for today at 1am UTC (8pm ET previous day)
  const todayAt1amUTC = new Date(Date.UTC(
    currentDate.getUTCFullYear(),
    currentDate.getUTCMonth(),
    currentDate.getUTCDate(),
    1, // 1am UTC
    0,
    0,
    0
  ));
  
  // If current time is before 1am UTC today, the next roll call is today at 1am UTC
  // Otherwise, it's tomorrow at 1am UTC
  if (currentDate.getTime() < todayAt1amUTC.getTime()) {
    return todayAt1amUTC;
  } else {
    // Next roll call is tomorrow at 1am UTC
    const tomorrowAt1amUTC = new Date(todayAt1amUTC);
    tomorrowAt1amUTC.setUTCDate(tomorrowAt1amUTC.getUTCDate() + 1);
    return tomorrowAt1amUTC;
  }
}
