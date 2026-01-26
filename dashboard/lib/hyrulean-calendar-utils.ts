/**
 * Hyrulean Calendar utilities
 * Handles conversion between real-world dates and Hyrulean calendar dates
 */

export interface HyruleanMonth {
  monthId: number;
  name: string;
  start: string; // MM-DD format
  end: string; // MM-DD format
}

export const HYRULEAN_CALENDAR: HyruleanMonth[] = [
  { monthId: 1, name: 'Yowaka Ita', start: '01-01', end: '01-26' },
  { monthId: 2, name: 'Noe Rajee', start: '01-27', end: '02-21' },
  { monthId: 3, name: 'Ha Dahamar', start: '02-22', end: '03-19' },
  { monthId: 4, name: 'Shae Katha', start: '03-20', end: '04-14' },
  { monthId: 5, name: 'Keo Ruug', start: '04-15', end: '05-10' },
  { monthId: 6, name: 'Gee Ha\'rah', start: '05-11', end: '06-04' },
  { monthId: 7, name: 'Jitan Sa\'mi', start: '06-05', end: '07-01' },
  { monthId: 8, name: 'Sha Warvo', start: '07-02', end: '07-27' },
  { monthId: 9, name: 'Tutsuwa Nima', start: '07-28', end: '08-22' },
  { monthId: 10, name: 'Shae Mo\'sah', start: '08-23', end: '09-17' },
  { monthId: 11, name: 'Hawa Koth', start: '09-18', end: '10-13' },
  { monthId: 12, name: 'Maka Rah', start: '10-14', end: '11-08' },
  { monthId: 13, name: 'Ya Naga', start: '11-09', end: '12-04' },
  { monthId: 14, name: 'Etsu Korima', start: '12-05', end: '12-31' }
];

/**
 * Format date as MM-DD string
 */
function formatDateMMDD(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${month}-${day}`;
}

/**
 * Parse MM-DD date string
 */
function parseMMDD(dateStr: string): { month: number; day: number } {
  const [month, day] = dateStr.split('-').map(Number);
  return { month, day };
}

/**
 * Check if a date (MM-DD) falls within a range (MM-DD to MM-DD)
 */
function isDateInRange(dateStr: string, startStr: string, endStr: string): boolean {
  const date = parseMMDD(dateStr);
  const start = parseMMDD(startStr);
  const end = parseMMDD(endStr);
  
  // If range is within same month
  if (start.month === end.month) {
    return date.month === start.month && date.day >= start.day && date.day <= end.day;
  }
  
  // If range crosses month boundaries
  // Check if date is in start month (after start day) or end month (before end day)
  if (date.month === start.month && date.day >= start.day) {
    return true;
  }
  if (date.month === end.month && date.day <= end.day) {
    return true;
  }
  // Check if date is in months between start and end
  if (date.month > start.month && date.month < end.month) {
    return true;
  }
  
  return false;
}

/**
 * Get the current Hyrulean month for a given date
 */
export function getHyruleanMonth(date: Date): HyruleanMonth | null {
  const dateStr = formatDateMMDD(date);
  return HYRULEAN_CALENDAR.find(month => 
    isDateInRange(dateStr, month.start, month.end)
  ) || null;
}

/**
 * Convert a real-world date to Hyrulean calendar date
 */
export function convertToHyruleanDate(date: Date): string {
  const hyruleanMonth = getHyruleanMonth(date);
  if (!hyruleanMonth) {
    return 'Unknown';
  }
  
  // Calculate day in month
  const startDate = parseMMDD(hyruleanMonth.start);
  const dateStr = formatDateMMDD(date);
  const currentDate = parseMMDD(dateStr);
  
  // Calculate days since start of Hyrulean month
  const startDateObj = new Date(Date.UTC(date.getUTCFullYear(), startDate.month - 1, startDate.day));
  const currentDateObj = new Date(Date.UTC(date.getUTCFullYear(), currentDate.month - 1, currentDate.day));
  
  const daysDiff = Math.floor((currentDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
  const dayInMonth = daysDiff + 1;
  
  // Ensure day is within valid range (1-26)
  if (dayInMonth >= 1 && dayInMonth <= 26) {
    return `${hyruleanMonth.name} ${dayInMonth}`;
  }
  
  return 'Unknown';
}

/**
 * Get today's date in both real-world and Hyrulean formats
 */
export function getTodayInfo() {
  const today = new Date();
  return {
    realDate: formatDateMMDD(today),
    hyruleanDate: convertToHyruleanDate(today),
    fullRealDate: today.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })
  };
}
