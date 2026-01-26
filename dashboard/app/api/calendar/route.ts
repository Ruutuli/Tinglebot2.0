/**
 * GET /api/calendar - Get calendar data including birthdays, blood moons, and Hyrulean calendar
 */

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getHyruleanMonth, convertToHyruleanDate, HYRULEAN_CALENDAR } from "@/lib/hyrulean-calendar-utils";
import { BLOOD_MOON_DATES } from "@/lib/blood-moon-utils";

// Map blood moon dates to Hyrulean calendar format
const bloodmoonDates = BLOOD_MOON_DATES.map((dateStr) => {
  const [month, day] = dateStr.split('-').map(Number);
  const testDate = new Date(Date.UTC(2024, month - 1, day));
  const hyruleanMonth = getHyruleanMonth(testDate);
  const hyruleanDate = convertToHyruleanDate(testDate);
  
  // Extract day from Hyrulean date (format: "Month Name 13")
  const hyruleanDay = parseInt(hyruleanDate.split(' ')[1] || '13', 10);
  
  return {
    realDate: dateStr,
    month: hyruleanMonth?.name || 'Unknown',
    day: hyruleanDay
  };
});

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

/** Parse time limit string (e.g. "1 month", "2 weeks") and return duration in milliseconds */
function parseTimeLimit(timeLimit: string): number {
  const lower = (timeLimit || "").toLowerCase().trim();
  if (lower.includes("month")) {
    const months = parseInt(lower.match(/(\d+)/)?.[1] || "1", 10);
    return months * 30 * 24 * 60 * 60 * 1000; // Approximate month as 30 days
  }
  if (lower.includes("week")) {
    const weeks = parseInt(lower.match(/(\d+)/)?.[1] || "1", 10);
    return weeks * 7 * 24 * 60 * 60 * 1000;
  }
  if (lower.includes("day")) {
    const days = parseInt(lower.match(/(\d+)/)?.[1] || "1", 10);
    return days * 24 * 60 * 60 * 1000;
  }
  if (lower.includes("hour")) {
    const hours = parseInt(lower.match(/(\d+)/)?.[1] || "1", 10);
    return hours * 60 * 60 * 1000;
  }
  // Default to 1 month if format is unrecognized
  return 30 * 24 * 60 * 60 * 1000;
}

/** Format date as MM-DD string */
function formatDateMMDD(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

/** Parse signup deadline string (e.g. "January 15, 2026" or "01-15") */
function parseSignupDeadline(deadlineStr: string | null, questDate: Date): Date | null {
  if (!deadlineStr) return null;
  
  const trimmed = deadlineStr.trim();
  
  // Try parsing as MM-DD format (relative to quest month)
  if (/^\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const [month, day] = trimmed.split("-").map(Number);
    const deadline = new Date(questDate.getFullYear(), month - 1, day);
    return deadline;
  }
  
  // Try parsing as full date string
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  
  return null;
}

export async function GET() {
  try {
    await connect();
    
    // Import models
    const { default: Character } = await import("@/models/CharacterModel.js");
    const { default: User } = await import("@/models/UserModel.js");
    const { default: Quest } = await import("@/models/QuestModel.js");
    
    // Get character birthdays (birthday field is MM-DD format string)
    const characters = await Character.find(
      { birthday: { $exists: true, $ne: '' } },
      { name: 1, birthday: 1, icon: 1, userId: 1, _id: 1 }
    ).lean();
    
    // Get user birthdays (birthday.month and birthday.day are numbers)
    const users = await User.find(
      { 
        'birthday.month': { $exists: true, $ne: null },
        'birthday.day': { $exists: true, $ne: null }
      },
      { 
        username: 1, 
        'birthday.month': 1, 
        'birthday.day': 1,
        avatar: 1,
        discordId: 1
      }
    ).lean();
    
    // Helper function to validate icon URL
    const isValidIconUrl = (icon: unknown): boolean => {
      if (!icon || typeof icon !== 'string') return false;
      const trimmed = icon.trim();
      if (trimmed === '') return false;
      // Must be http/https URL or absolute path starting with /
      return trimmed.startsWith('http://') || 
             trimmed.startsWith('https://') || 
             trimmed.startsWith('/');
    };

    // Format character birthdays
    const characterBirthdays = characters
      .filter(char => char.birthday && typeof char.birthday === 'string')
      .map(char => {
        const birthdayStr = char.birthday as string;
        // Handle MM-DD format
        const [month, day] = birthdayStr.split('-').map(Number);
        if (!month || !day) return null;
        
        const icon = char.icon && isValidIconUrl(char.icon) ? char.icon : null;
        
        return {
          name: char.name,
          birthday: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
          icon,
          type: 'character',
          userId: char.userId,
          characterId: char._id ? String(char._id) : null
        };
      })
      .filter(Boolean);
    
    // Format user birthdays
    const userBirthdays = users
      .filter(user => user.birthday && user.birthday.month && user.birthday.day)
      .map(user => {
        const icon = user.avatar && isValidIconUrl(user.avatar) ? user.avatar : null;
        return {
          name: user.username || `User ${user.discordId}`,
          birthday: `${String(user.birthday.month).padStart(2, '0')}-${String(user.birthday.day).padStart(2, '0')}`,
          icon,
          type: 'user',
          userId: user.discordId
        };
      });
    
    // Combine all birthdays
    const birthdays = [...characterBirthdays, ...userBirthdays];
    
    // Fetch quests and calculate their event dates
    const quests = await Quest.find(
      { status: 'active' },
      { 
        title: 1, 
        questID: 1, 
        date: 1, 
        signupDeadline: 1, 
        timeLimit: 1, 
        postedAt: 1, 
        createdAt: 1,
        questType: 1,
        location: 1
      }
    ).lean();
    
    const questEvents: Array<{
      questId: string;
      title: string;
      type: 'start' | 'end' | 'signup';
      date: string; // MM-DD format
      questType: string;
      location: string;
    }> = [];
    
    for (const quest of quests) {
      const questDate = parseMonthYear(quest.date || "");
      if (!questDate) continue;
      
      // Quest start date: use postedAt if available, otherwise use createdAt, otherwise use first of quest month
      const startDate = quest.postedAt 
        ? new Date(quest.postedAt) 
        : quest.createdAt 
        ? new Date(quest.createdAt)
        : new Date(questDate.getFullYear(), questDate.getMonth(), 1);
      
      // Quest end date: start date + time limit
      const timeLimitMs = parseTimeLimit(quest.timeLimit || "1 month");
      const endDate = new Date(startDate.getTime() + timeLimitMs);
      
      // Signup deadline: parse from signupDeadline field
      const signupDeadline = parseSignupDeadline(quest.signupDeadline || null, questDate);
      
      // Add start event
      questEvents.push({
        questId: quest.questID || String(quest._id),
        title: quest.title || "Untitled Quest",
        type: 'start',
        date: formatDateMMDD(startDate),
        questType: quest.questType || "Quest",
        location: quest.location || "Unknown"
      });
      
      // Add end event
      questEvents.push({
        questId: quest.questID || String(quest._id),
        title: quest.title || "Untitled Quest",
        type: 'end',
        date: formatDateMMDD(endDate),
        questType: quest.questType || "Quest",
        location: quest.location || "Unknown"
      });
      
      // Add signup deadline event if it exists
      if (signupDeadline) {
        questEvents.push({
          questId: quest.questID || String(quest._id),
          title: quest.title || "Untitled Quest",
          type: 'signup',
          date: formatDateMMDD(signupDeadline),
          questType: quest.questType || "Quest",
          location: quest.location || "Unknown"
        });
      }
    }
    
    return NextResponse.json({
      hyruleanCalendar: HYRULEAN_CALENDAR,
      bloodmoonDates,
      birthdays,
      questEvents: questEvents || []
    });
  } catch (error) {
    console.error('Error fetching calendar data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar data' },
      { status: 500 }
    );
  }
}
