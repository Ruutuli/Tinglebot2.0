/**
 * Blood Moon utilities
 * Handles Blood Moon cycle calculations (26-day cycle)
 * Based on the actual blood moon dates from the calendar module
 */

const BLOOD_MOON_CYCLE_DAYS = 26;

// Actual blood moon dates from the calendar module (MM-DD format)
export const BLOOD_MOON_DATES = [
  '01-13', '02-08', '03-06', '04-01', '04-27', '05-23', '06-18',
  '07-14', '08-09', '09-04', '09-30', '10-26', '11-21', '12-17'
];

/**
 * Parse MM-DD date string and return Date object for the current or next year
 */
function parseBloodMoonDate(dateStr: string, referenceYear: number): Date {
  const [month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(referenceYear, month - 1, day, 0, 0, 0, 0));
}

/**
 * Format date as MM-DD string
 */
function formatDateMMDD(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}-${day}`;
}

/**
 * Get the next Blood Moon date based on actual blood moon dates
 * 
 * @param currentDate - The current date (defaults to now)
 * @returns The next Blood Moon date
 */
export function getNextBloodMoonDate(
  currentDate: Date = new Date()
): Date {
  const currentYear = currentDate.getUTCFullYear();
  const currentMMDD = formatDateMMDD(currentDate);
  
  // Find all blood moon dates for this year and next year
  const thisYearBloodMoons = BLOOD_MOON_DATES.map(dateStr => 
    parseBloodMoonDate(dateStr, currentYear)
  );
  const nextYearBloodMoons = BLOOD_MOON_DATES.map(dateStr => 
    parseBloodMoonDate(dateStr, currentYear + 1)
  );
  
  // Combine and sort all blood moon dates
  const allBloodMoons = [...thisYearBloodMoons, ...nextYearBloodMoons].sort(
    (a, b) => a.getTime() - b.getTime()
  );
  
  // Find the next blood moon date that is >= current date
  const nextBloodMoon = allBloodMoons.find(bm => bm.getTime() >= currentDate.getTime());
  
  // If we found one, return it; otherwise return the first one from next year (shouldn't happen)
  return nextBloodMoon || parseBloodMoonDate(BLOOD_MOON_DATES[0], currentYear + 1);
}

/**
 * Get the current day in the Blood Moon cycle (1-26)
 * Day 1 is the Blood Moon day
 * 
 * @param currentDate - The current date (defaults to now)
 * @returns The current day in the cycle (1-26)
 */
export function getCurrentBloodMoonCycleDay(
  currentDate: Date = new Date()
): number {
  const currentYear = currentDate.getUTCFullYear();
  const currentMMDD = formatDateMMDD(currentDate);
  
  // Find the most recent blood moon date
  const thisYearBloodMoons = BLOOD_MOON_DATES.map(dateStr => 
    parseBloodMoonDate(dateStr, currentYear)
  );
  const lastYearBloodMoons = BLOOD_MOON_DATES.map(dateStr => 
    parseBloodMoonDate(dateStr, currentYear - 1)
  );
  
  // Combine and sort all blood moon dates
  const allBloodMoons = [...lastYearBloodMoons, ...thisYearBloodMoons].sort(
    (a, b) => b.getTime() - a.getTime() // Sort descending to find most recent
  );
  
  // Find the most recent blood moon that has already occurred
  const mostRecentBloodMoon = allBloodMoons.find(bm => bm.getTime() <= currentDate.getTime());
  
  if (!mostRecentBloodMoon) {
    // If no blood moon found (shouldn't happen), return 1
    return 1;
  }
  
  // Calculate days since the most recent blood moon
  const daysSinceBloodMoon = Math.floor(
    (currentDate.getTime() - mostRecentBloodMoon.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  // Calculate the cycle day (1-26), where day 1 is the blood moon day
  const cycleDay = (daysSinceBloodMoon % BLOOD_MOON_CYCLE_DAYS) + 1;
  
  return cycleDay;
}

/**
 * Check if today is a Blood Moon day
 * 
 * @param currentDate - The current date (defaults to now)
 * @returns True if today is a Blood Moon day
 */
export function isBloodMoonDay(
  currentDate: Date = new Date()
): boolean {
  const currentMMDD = formatDateMMDD(currentDate);
  return BLOOD_MOON_DATES.includes(currentMMDD);
}
