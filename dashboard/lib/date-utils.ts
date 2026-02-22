/**
 * Date utilities for Character of the Week rotation
 * Handles EST/UTC conversion and date calculations
 */

/**
 * Get the next Sunday at midnight EST (05:00 UTC)
 * EST is UTC-5, so midnight EST = 05:00 UTC
 */
export function getNextSundayMidnightEST(): Date {
  const now = new Date();
  
  // Get current UTC day of week (0 = Sunday, 6 = Saturday)
  const currentDay = now.getUTCDay();
  const currentHour = now.getUTCHours();
  
  // Calculate days until next Sunday
  let daysUntilSunday = 7 - currentDay;
  
  // If it's already Sunday, check if we've passed 05:00 UTC
  if (currentDay === 0) {
    // If it's before 05:00 UTC on Sunday, next rotation is today
    if (currentHour < 5) {
      daysUntilSunday = 0;
    } else {
      // If it's 05:00 UTC or later on Sunday, next rotation is next Sunday
      daysUntilSunday = 7;
    }
  }
  
  // Create date for next Sunday at 05:00 UTC
  const nextSunday = new Date(now);
  nextSunday.setUTCDate(now.getUTCDate() + daysUntilSunday);
  nextSunday.setUTCHours(5, 0, 0, 0);
  
  return nextSunday;
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
 * Get the start date for the current week (last Sunday at midnight EST)
 * If today is Sunday and before 05:00 UTC, use last Sunday
 */
export function getCurrentWeekStartDate(): Date {
  const nextSunday = getNextSundayMidnightEST();
  const currentWeekStart = new Date(nextSunday);
  currentWeekStart.setUTCDate(currentWeekStart.getUTCDate() - 7);
  return currentWeekStart;
}
