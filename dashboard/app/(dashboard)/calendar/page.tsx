"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { clsx } from "clsx";
import { getTodayInfo, convertToHyruleanDate, HYRULEAN_CALENDAR, type HyruleanMonth } from "@/lib/hyrulean-calendar-utils";
import { isBloodMoonDay, getCurrentBloodMoonCycleDay, BLOOD_MOON_DATES, getNextBloodMoonDate } from "@/lib/blood-moon-utils";

/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

type Birthday = {
  name: string;
  birthday: string; // MM-DD format
  icon: string | null;
  type: 'character' | 'user';
  userId: string;
  characterId?: string | null; // MongoDB _id for characters
};

type QuestEvent = {
  questId: string;
  title: string;
  type: 'start' | 'end' | 'signup';
  date: string; // MM-DD format
  questType: string;
  location: string;
};

type CalendarData = {
  hyruleanCalendar: HyruleanMonth[];
  bloodmoonDates: Array<{
    realDate: string;
    month: string;
    day: number;
  }>;
  birthdays: Birthday[];
  questEvents?: QuestEvent[];
};

type TabValue = "monthly" | "birthdays" | "hyrulean" | "bloodmoon";

type DayEventsModalData = {
  date: Date;
  dateStr: string;
  hyruleanDate: string;
  birthdays: Birthday[];
  questEvents: QuestEvent[];
  isBloodMoon: boolean;
} | null;

/* ============================================================================ */
/* ------------------- Constants ------------------- */
/* ============================================================================ */

const TAB_ITEMS: Array<{ value: TabValue; label: string; icon: string }> = [
  { value: "monthly", label: "Monthly View", icon: "fa-calendar-days" },
  { value: "birthdays", label: "Birthdays", icon: "fa-birthday-cake" },
  { value: "hyrulean", label: "Hyrulean Calendar", icon: "fa-calendar-alt" },
  { value: "bloodmoon", label: "Blood Moon", icon: "fa-moon" },
];

// ------------------- Shared ClassName Constants ------------------
// Reusable className strings to prevent duplication -
const CARD_BASE_CLASS = "overflow-hidden rounded-xl border-2 bg-gradient-to-br transition-all duration-300";
const CARD_BORDER_NORMAL = "border-[var(--totk-dark-ocher)] from-[var(--totk-brown)] to-[var(--botw-warm-black)]";
const CARD_BORDER_TODAY = "border-[var(--totk-light-green)] from-[var(--totk-dark-green)] to-[var(--botw-warm-black)]";
const CARD_BORDER_BLOODMOON = "border-[var(--blight-border)] from-[var(--blight-bg-top)] to-[var(--blight-bg-bottom)]";

const BIRTHDAY_CARD_CLASS = "flex items-center gap-3 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/40 p-3 transition-all duration-200 hover:border-[var(--totk-light-green)]/50 hover:bg-[var(--botw-warm-black)]/60 hover:shadow-md";

const EMPTY_STATE_CLASS = "rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] p-12 text-center";

const NAV_BUTTON_CLASS = "flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-[var(--totk-ivory)] transition-all duration-200 hover:bg-[var(--totk-dark-ocher)] hover:text-[var(--totk-light-green)]";

/* ============================================================================ */
/* ------------------- Helper Functions ------------------- */
/* ============================================================================ */

// ------------------- Icon Validation ------------------
// Validates if an icon string is a valid URL or absolute path
const isValidIcon = (icon: string | null): boolean => {
  return !!(
    icon &&
    typeof icon === 'string' &&
    icon.trim() !== '' &&
    (icon.startsWith('http://') ||
     icon.startsWith('https://') ||
     icon.startsWith('/'))
  );
};

// ------------------- Quest Event Helpers ------------------
// Get icon class for quest event type
const getQuestEventIcon = (type: string): string => {
  switch (type) {
    case 'start':
      return 'fa-play';
    case 'end':
      return 'fa-stop';
    case 'signup':
      return 'fa-user-plus';
    default:
      return 'fa-flag';
  }
};

// Get text color class for quest event type
const getQuestEventColor = (type: string): string => {
  switch (type) {
    case 'start':
      return 'text-[var(--totk-light-green)]';
    case 'end':
      return 'text-[var(--blight-border)]';
    case 'signup':
      return 'text-[var(--totk-light-ocher)]';
    default:
      return 'text-[var(--botw-blue)]';
  }
};

// Get background color class for quest event type
const getQuestEventBg = (type: string): string => {
  switch (type) {
    case 'start':
      return 'bg-[var(--totk-dark-green)]/40';
    case 'end':
      return 'bg-[var(--blight-border)]/20';
    case 'signup':
      return 'bg-[var(--totk-dark-ocher)]/40';
    default:
      return 'bg-[var(--botw-dark-blue)]/40';
  }
};

// Get border color class for quest event type (for modal)
const getQuestEventBorder = (type: string): string => {
  switch (type) {
    case 'start':
      return 'border-[var(--totk-light-green)]/30';
    case 'end':
      return 'border-[var(--blight-border)]/30';
    case 'signup':
      return 'border-[var(--totk-light-ocher)]/30';
    default:
      return 'border-[var(--botw-blue)]/30';
  }
};

// Get label text for quest event type
const getQuestEventLabel = (type: string): string => {
  switch (type) {
    case 'start':
      return 'Quest Starts';
    case 'end':
      return 'Quest Ends';
    case 'signup':
      return 'Sign-up Ends';
    default:
      return 'Quest Event';
  }
};

// Get short label for calendar cells
const getQuestEventShortLabel = (type: string): string => {
  switch (type) {
    case 'start':
      return 'Starts';
    case 'end':
      return 'Ends';
    case 'signup':
      return 'Sign-up';
    default:
      return 'Quest';
  }
};

// Truncate quest title to fit in calendar cell
const truncateTitle = (title: string, maxLength: number = 15): string => {
  if (title.length <= maxLength) return title;
  return title.substring(0, maxLength - 3) + '...';
};

// ------------------- Date Formatting ------------------
// Format date as MM-DD string
const formatDateMMDD = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${month}-${day}`;
};

// ------------------- Character Profile URL ------------------
// Helper function to create character profile URL
const getCharacterProfileUrl = (birthday: Birthday): string | null => {
  if (birthday.type !== 'character') return null;
  
  // Use characterId if available, otherwise use name as slug
  if (birthday.characterId) {
    return `/characters/${birthday.characterId}`;
  }
  
  // Create slug from name
  const slug = birthday.name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  
  return `/characters/${slug}`;
};

/* ============================================================================ */
/* ------------------- Reusable Components ------------------- */
/* ============================================================================ */

// ------------------- BirthdayCard Component ------------------
// Renders a birthday card with icon and name -
type BirthdayCardProps = {
  birthday: Birthday;
  size?: "sm" | "md";
  onClick?: () => void;
};

function BirthdayCard({ birthday, size = "md", onClick }: BirthdayCardProps) {
  const iconValid = isValidIcon(birthday.icon);
  const characterUrl = getCharacterProfileUrl(birthday);
  const iconSize = size === "sm" ? "h-4 w-4" : "h-12 w-12";
  const iconRingSize = size === "sm" ? "" : "ring-2 ring-[var(--totk-dark-ocher)] transition-all duration-200 group-hover:ring-[var(--totk-light-green)]";
  const cardClass = size === "sm" 
    ? "flex items-center gap-1 rounded bg-[var(--totk-dark-green)]/40 px-1.5 py-0.5 transition-all duration-200 hover:bg-[var(--totk-dark-green)]/60 hover:shadow-sm"
    : `group ${BIRTHDAY_CARD_CLASS}`;

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = 'none';
    const fallback = e.currentTarget.nextElementSibling as HTMLElement;
    if (fallback) fallback.style.display = 'flex';
  };

  const content = (
    <>
      {iconValid ? (
        <Image
          src={birthday.icon!}
          alt={birthday.name}
          width={size === "sm" ? 16 : 48}
          height={size === "sm" ? 16 : 48}
          className={`${iconSize} rounded-full object-cover ${iconRingSize}`}
          onError={handleImageError}
          unoptimized
        />
      ) : null}
      <div 
        className={clsx(
          `flex ${iconSize} items-center justify-center rounded-full bg-[var(--totk-dark-ocher)] ${iconRingSize}`,
          iconValid ? 'hidden' : ''
        )}
      >
        <i className={`fa-solid ${size === "sm" ? "fa-birthday-cake text-[10px]" : "fa-user text-lg"} text-[var(--totk-grey-200)]`} aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-semibold ${size === "sm" ? "text-[10px] text-[var(--totk-light-green)]" : "text-[var(--totk-ivory)]"} truncate`}>
          {birthday.name}
        </div>
        {size === "md" && (
          <div className="mt-1 flex items-center gap-2">
            <span className={clsx(
              "text-xs font-medium",
              birthday.type === 'character' 
                ? "text-[var(--totk-light-green)]" 
                : "text-[var(--totk-light-ocher)]"
            )}>
              {birthday.type === 'character' ? 'Character' : 'User'}
            </span>
          </div>
        )}
      </div>
    </>
  );

  if (characterUrl) {
    return (
      <Link
        href={characterUrl}
        className={`${cardClass} cursor-pointer`}
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick();
          } else if (size === "sm") {
            e.stopPropagation();
          }
        }}
      >
        {content}
      </Link>
    );
  }

  return (
    <div className={cardClass}>
      {content}
    </div>
  );
}

// ------------------- QuestEventCard Component ------------------
// Renders a quest event card (compact for calendar cells) -
type QuestEventCardProps = {
  event: QuestEvent;
  variant?: "compact" | "full";
};

function QuestEventCard({ event, variant = "compact" }: QuestEventCardProps) {
  if (variant === "compact") {
    const tooltipText = `${event.title} - ${getQuestEventShortLabel(event.type)}${event.location ? ` (${event.location})` : ''}`;
    
    return (
      <div
        className={clsx(
          "group relative flex items-center gap-1 rounded px-1.5 py-0.5 cursor-help",
          getQuestEventBg(event.type)
        )}
        title={tooltipText}
      >
        <i className={clsx(
          `fa-solid ${getQuestEventIcon(event.type)} text-[10px]`,
          getQuestEventColor(event.type)
        )} />
        <span className={clsx(
          "truncate text-[10px] font-medium",
          getQuestEventColor(event.type)
        )}>
          {truncateTitle(event.title)}
        </span>
        {/* Enhanced tooltip on hover */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50">
          <div className="bg-[var(--botw-warm-black)] border-2 border-[var(--totk-dark-ocher)] rounded-lg px-3 py-2 shadow-lg max-w-[200px]">
            <div className={clsx(
              "text-xs font-bold mb-1",
              getQuestEventColor(event.type)
            )}>
              {event.title}
            </div>
            <div className="text-[10px] text-[var(--totk-grey-200)]">
              {getQuestEventShortLabel(event.type)}
              {event.location && ` • ${event.location}`}
            </div>
          </div>
          {/* Tooltip arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="border-4 border-transparent border-t-[var(--totk-dark-ocher)]" />
          </div>
        </div>
      </div>
    );
  }

  // Full variant for modal
  return (
    <article
      className={clsx(
        "rounded-lg border-2 p-4",
        getQuestEventBg(event.type),
        getQuestEventBorder(event.type)
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="mb-2 flex items-center gap-2">
            <i className={clsx(
              `fa-solid ${getQuestEventIcon(event.type)}`,
              getQuestEventColor(event.type)
            )} />
            <span className={clsx(
              "text-sm font-semibold uppercase",
              getQuestEventColor(event.type)
            )}>
              {getQuestEventLabel(event.type)}
            </span>
          </div>
          <h4 className="text-lg font-bold text-[var(--totk-ivory)]">
            {event.title}
          </h4>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--totk-grey-200)]">
            <span className="flex items-center gap-1.5">
              <i className="fa-solid fa-tag" />
              {event.questType}
            </span>
            {event.location && (
              <span className="flex items-center gap-1.5">
                <i className="fa-solid fa-map-marker-alt" />
                {event.location}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

// ------------------- EmptyState Component ------------------
// Renders an empty state message -
type EmptyStateProps = {
  icon?: string;
  title: string;
  description?: string;
};

function EmptyState({ icon = "fa-calendar-xmark", title, description }: EmptyStateProps) {
  return (
    <div className={EMPTY_STATE_CLASS}>
      <i className={`fa-solid ${icon} mb-4 text-5xl text-[var(--totk-grey-200)]`} aria-hidden="true" />
      <p className="text-xl font-semibold text-[var(--totk-grey-200)]">{title}</p>
      {description && (
        <p className="mt-2 text-sm text-[var(--totk-grey-200)]/70">{description}</p>
      )}
    </div>
  );
}

// ------------------- InfoCardItem Component ------------------
// Renders an info card item for the today's info section -
type InfoCardItemProps = {
  label: string;
  value: React.ReactNode;
  subtext?: string;
};

function InfoCardItem({ label, value, subtext }: InfoCardItemProps) {
  return (
    <div className="text-center">
      <div className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
        {label}
      </div>
      <div className="text-lg font-bold text-[var(--totk-ivory)]">
        {value}
      </div>
      {subtext && (
        <div className="mt-1 text-sm text-[var(--totk-grey-200)]">
          {subtext}
        </div>
      )}
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

export default function CalendarPage() {
  const [calendarData, setCalendarData] = useState<CalendarData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewingMonth, setViewingMonth] = useState(new Date());
  const [activeTab, setActiveTab] = useState<TabValue>("monthly");
  const [selectedDayEvents, setSelectedDayEvents] = useState<DayEventsModalData>(null);
  const todayInfo = getTodayInfo();

  // ------------------- Fetch Calendar Data ------------------
  // Fetch calendar data with AbortController for cleanup
  useEffect(() => {
    const abortController = new AbortController();
    
    async function fetchCalendarData() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch("/api/calendar", {
          signal: abortController.signal,
        });
        
        if (!response.ok) {
          throw new Error("Failed to fetch calendar data");
        }
        
        const data: CalendarData = await response.json();
        
        // Don't set state if component unmounted
        if (!abortController.signal.aborted) {
          setCalendarData(data);
        }
      } catch (err: unknown) {
        // Don't set error if fetch was aborted
        if (abortController.signal.aborted) return;
        
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error.message);
        console.error("[calendar/page.tsx]❌ Failed to fetch calendar data:", error);
      } finally {
        // Don't set loading state if component unmounted
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    }
    
    fetchCalendarData();
    
    // Cleanup: abort fetch on unmount
    return () => {
      abortController.abort();
    };
  }, []);

  // Update current date every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Get birthdays for a specific date (MM-DD format)
  const getBirthdaysForDate = (dateStr: string): Birthday[] => {
    if (!calendarData) return [];
    return calendarData.birthdays.filter(b => b.birthday === dateStr);
  };

  // Get quest events for a specific date (MM-DD format)
  const getQuestEventsForDate = (dateStr: string): QuestEvent[] => {
    if (!calendarData || !calendarData.questEvents) return [];
    return calendarData.questEvents.filter(e => e.date === dateStr);
  };

  // ------------------- Date Helpers ------------------
  // Check if a date is a blood moon
  const isBloodMoon = (dateStr: string): boolean => {
    return BLOOD_MOON_DATES.includes(dateStr);
  };

  // Navigate months
  const goToPreviousMonth = () => {
    setViewingMonth(new Date(viewingMonth.getFullYear(), viewingMonth.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setViewingMonth(new Date(viewingMonth.getFullYear(), viewingMonth.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setViewingMonth(new Date());
  };

  // Generate calendar days for the viewing month
  const calendarDays = useMemo(() => {
    if (!calendarData) return [];
    
    const year = viewingMonth.getFullYear();
    const month = viewingMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: Array<{
      date: Date;
      dayNumber: number;
      isCurrentMonth: boolean;
      isToday: boolean;
      dateStr: string;
      hyruleanDate: string;
      birthdays: Birthday[];
      isBloodMoon: boolean;
      questEvents: QuestEvent[];
    }> = [];

    // Helper function to get birthdays for a date
    const getBirthdaysForDateStr = (dateStr: string): Birthday[] => {
      return calendarData.birthdays.filter(b => b.birthday === dateStr);
    };

    // Helper function to get quest events for a date
    const getQuestEventsForDateStr = (dateStr: string): QuestEvent[] => {
      if (!calendarData.questEvents) return [];
      return calendarData.questEvents.filter(e => e.date === dateStr);
    };

    // Add days from previous month to fill the first week
    const prevMonth = new Date(year, month - 1, 0);
    const daysInPrevMonth = prevMonth.getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const date = new Date(year, month - 1, daysInPrevMonth - i);
      const dateStr = formatDateMMDD(date);
      days.push({
        date,
        dayNumber: daysInPrevMonth - i,
        isCurrentMonth: false,
        isToday: false,
        dateStr,
        hyruleanDate: convertToHyruleanDate(date),
        birthdays: getBirthdaysForDateStr(dateStr),
        isBloodMoon: isBloodMoon(dateStr),
        questEvents: getQuestEventsForDateStr(dateStr),
      });
    }

    // Add days from current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = formatDateMMDD(date);
      const today = new Date();
      days.push({
        date,
        dayNumber: day,
        isCurrentMonth: true,
        isToday: date.toDateString() === today.toDateString(),
        dateStr,
        hyruleanDate: convertToHyruleanDate(date),
        birthdays: getBirthdaysForDateStr(dateStr),
        isBloodMoon: isBloodMoon(dateStr),
        questEvents: getQuestEventsForDateStr(dateStr),
      });
    }

    // Add days from next month to fill the last week (to make 6 weeks total)
    const remainingDays = 42 - days.length;
    for (let day = 1; day <= remainingDays; day++) {
      const date = new Date(year, month + 1, day);
      const dateStr = formatDateMMDD(date);
      days.push({
        date,
        dayNumber: day,
        isCurrentMonth: false,
        isToday: false,
        dateStr,
        hyruleanDate: convertToHyruleanDate(date),
        birthdays: getBirthdaysForDateStr(dateStr),
        isBloodMoon: isBloodMoon(dateStr),
        questEvents: getQuestEventsForDateStr(dateStr),
      });
    }

    return days;
  }, [viewingMonth, calendarData]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 sm:p-6 md:p-8 lg:p-10">
        <div className="text-center">
          <div className="mb-4 text-4xl text-[var(--totk-light-green)]">
            <i className="fa-solid fa-spinner fa-spin" />
          </div>
          <p className="text-lg text-[var(--totk-grey-200)]">Loading calendar...</p>
        </div>
      </div>
    );
  }

  if (error || !calendarData) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 sm:p-6 md:p-8 lg:p-10">
        <div className="text-center">
          <div className="mb-4 text-4xl text-[var(--blight-border)]">
            <i className="fa-solid fa-triangle-exclamation" />
          </div>
          <p className="text-lg text-[var(--totk-grey-200)]">{error || "Failed to load calendar data"}</p>
        </div>
      </div>
    );
  }

  // ------------------- Render Helpers ------------------
  // Precompute content to avoid nested ternaries -
  const bloodMoonCycleContent = isBloodMoonDay(currentDate) ? (
    <span className="text-[var(--blight-border)]">Blood Moon Today!</span>
  ) : (
    <span className="text-[var(--totk-light-green)]">
      Day {getCurrentBloodMoonCycleDay(currentDate)} ({26 - getCurrentBloodMoonCycleDay(currentDate) + 1} days until next)
    </span>
  );

  return (
    <main className="min-h-screen p-4 sm:p-6 md:p-8 lg:p-10">
      <div className="mx-auto max-w-[1400px] space-y-6 sm:space-y-8">
        {/* Header */}
        <header className="text-center">
          <h1 className="mb-2 text-3xl font-bold text-[var(--totk-light-ocher)] sm:text-4xl">
            Hyrulean Calendar
          </h1>
          <p className="text-lg text-[var(--totk-grey-200)]">
            {todayInfo.fullRealDate}
          </p>
          <p className="mt-1 text-xl font-semibold text-[var(--totk-light-green)]">
            {todayInfo.hyruleanDate}
          </p>
        </header>

        {/* Today's Info Card */}
        <section className={`${CARD_BASE_CLASS} ${CARD_BORDER_NORMAL} p-6`}>
          <div className="grid gap-4 md:grid-cols-3">
            <InfoCardItem 
              label="Today's Date" 
              value={todayInfo.fullRealDate}
              subtext="Real-world calendar"
            />
            <InfoCardItem 
              label="Hyrulean Date" 
              value={<span className="text-[var(--totk-light-green)]">{todayInfo.hyruleanDate}</span>}
              subtext="In World calendar of Hyrule"
            />
            <InfoCardItem 
              label="Blood Moon Cycle" 
              value={<span className="text-[var(--blight-border)]">{bloodMoonCycleContent}</span>}
              subtext="26-day lunar cycle"
            />
          </div>
        </section>

        {/* Tabs */}
        <div className="overflow-hidden rounded-2xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/60 p-2 shadow-inner backdrop-blur-md">
          <nav className="flex flex-wrap gap-2" aria-label="Tabs">
            {TAB_ITEMS.map((tab) => {
              const isActive = activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={clsx(
                    "flex min-w-[140px] flex-1 items-center justify-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300",
                    isActive
                      ? "bg-gradient-to-r from-[var(--totk-dark-ocher)] to-[var(--totk-mid-ocher)] text-[var(--totk-ivory)] shadow-lg shadow-[var(--totk-dark-ocher)]/20 scale-[1.02] z-10"
                      : "bg-[var(--totk-dark-ocher)]/10 text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/20 hover:text-[var(--totk-light-ocher)]"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  {tab.value === "bloodmoon" ? (
                    <Image
                      src="/HWAoCBloodMoon.png"
                      alt="Blood Moon"
                      width={16}
                      height={16}
                      className={clsx("h-4 w-4 object-contain", isActive ? "opacity-100" : "opacity-70")}
                    />
                  ) : (
                    <i className={`fa-solid ${tab.icon} text-base opacity-90`} />
                  )}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === "monthly" && (
          <section className={`${CARD_BASE_CLASS} ${CARD_BORDER_NORMAL} p-4 sm:p-6`}>
          {/* Calendar Header with Navigation */}
          <header className="mb-4 flex items-center justify-between">
            <button
              onClick={goToPreviousMonth}
              className={NAV_BUTTON_CLASS}
              aria-label="Previous month"
            >
              <i className="fa-solid fa-chevron-left" aria-hidden="true" />
            </button>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-[var(--totk-light-ocher)]">
                {viewingMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <button
                onClick={goToToday}
                className="mt-1 text-sm text-[var(--totk-grey-200)] hover:text-[var(--totk-light-green)] transition-colors"
              >
                Go to Today
              </button>
            </div>
            <button
              onClick={goToNextMonth}
              className={NAV_BUTTON_CLASS}
              aria-label="Next month"
            >
              <i className="fa-solid fa-chevron-right" aria-hidden="true" />
            </button>
          </header>

          {/* Weekday Headers */}
          <div className="mb-2 grid grid-cols-7 gap-1" role="rowgroup">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
              <div
                key={day}
                className="py-2 text-center text-sm font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]"
                role="columnheader"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days Grid */}
          <div className="grid grid-cols-7 gap-1" role="grid">
            {calendarDays.map((day) => {
              const totalEvents = day.birthdays.length + day.questEvents.length;
              const dayKey = `${day.dateStr}-${day.date.getTime()}`;
              
              const handleDayClick = () => {
                if (totalEvents > 0) {
                  setSelectedDayEvents({
                    date: day.date,
                    dateStr: day.dateStr,
                    hyruleanDate: day.hyruleanDate,
                    birthdays: day.birthdays,
                    questEvents: day.questEvents,
                    isBloodMoon: day.isBloodMoon
                  });
                }
              };
              
              return (
                <article
                  key={dayKey}
                  onClick={handleDayClick}
                  className={clsx(
                    "relative min-h-[100px] rounded-lg border-2 p-2 transition-all duration-200",
                    day.isCurrentMonth
                      ? day.isToday
                        ? "border-[var(--totk-light-green)] bg-gradient-to-br from-[var(--totk-dark-green)] to-[var(--botw-warm-black)]"
                        : "border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] hover:border-[var(--totk-light-green)]/50"
                      : "border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/50 opacity-60",
                    totalEvents > 0 && "cursor-pointer hover:scale-[1.02]"
                  )}
                  role="gridcell"
                  aria-label={`${day.date.toLocaleDateString()}, ${day.hyruleanDate}${totalEvents > 0 ? `, ${totalEvents} events` : ''}`}
                >
                  {/* Day Number */}
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={clsx(
                        "text-sm font-bold",
                        day.isToday
                          ? "text-[var(--totk-light-green)]"
                          : day.isCurrentMonth
                          ? "text-[var(--totk-ivory)]"
                          : "text-[var(--totk-grey-200)]"
                      )}
                    >
                      {day.dayNumber}
                    </span>
                    {day.isBloodMoon && (
                      <Image
                        src="/HWAoCBloodMoon.png"
                        alt="Blood Moon"
                        width={16}
                        height={16}
                        className="h-4 w-4 object-contain"
                        aria-hidden="true"
                      />
                    )}
                  </div>

                  {/* Hyrulean Date */}
                  <div className="mb-1 text-[10px] text-[var(--totk-grey-200)]">
                    {day.hyruleanDate}
                  </div>

                  {/* Events */}
                  <div className="mt-1 space-y-1">
                    {/* Quest Events */}
                    {day.questEvents.slice(0, 2).map((event) => (
                      <QuestEventCard key={event.questId || `${event.date}-${event.title}`} event={event} variant="compact" />
                    ))}
                    
                    {/* Birthdays */}
                    {day.birthdays.slice(0, 2).map((birthday) => (
                      <BirthdayCard 
                        key={`${birthday.userId}-${birthday.birthday}-${birthday.name}`} 
                        birthday={birthday} 
                        size="sm"
                      />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Legend */}
          <aside className={`mt-6 ${CARD_BASE_CLASS} ${CARD_BORDER_NORMAL} p-4`}>
            <h3 className="mb-3 text-lg font-bold text-[var(--totk-light-ocher)]">Legend</h3>
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 rounded border-2 border-[var(--totk-light-green)] bg-gradient-to-br from-[var(--totk-dark-green)] to-[var(--botw-warm-black)]" aria-hidden="true" />
                <span className="text-sm text-[var(--totk-ivory)]">Today</span>
              </div>
              <div className="flex items-center gap-2">
                <Image
                  src="/HWAoCBloodMoon.png"
                  alt="Blood Moon"
                  width={16}
                  height={16}
                  className="h-4 w-4 object-contain"
                  aria-hidden="true"
                />
                <span className="text-sm text-[var(--totk-ivory)]">Blood Moon</span>
              </div>
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-birthday-cake text-[var(--totk-light-green)]" aria-hidden="true" />
                <span className="text-sm text-[var(--totk-ivory)]">Birthday</span>
              </div>
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-play text-[var(--totk-light-green)]" aria-hidden="true" />
                <span className="text-sm text-[var(--totk-ivory)]">Quest Starts</span>
              </div>
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-stop text-[var(--blight-border)]" aria-hidden="true" />
                <span className="text-sm text-[var(--totk-ivory)]">Quest Ends</span>
              </div>
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-user-plus text-[var(--totk-light-ocher)]" aria-hidden="true" />
                <span className="text-sm text-[var(--totk-ivory)]">Sign-up Ends</span>
              </div>
            </dl>
          </aside>
        </section>
        )}

        {activeTab === "birthdays" && (
          <section>
            {/* Header */}
            <header className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-[var(--totk-light-ocher)]">
                  Birthdays
                </h2>
                <p className="mt-1 text-sm text-[var(--totk-grey-200)]">
                  {calendarData.birthdays.length} {calendarData.birthdays.length === 1 ? 'birthday' : 'birthdays'} total
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/40 px-4 py-2">
                <i className="fa-solid fa-birthday-cake text-lg text-[var(--totk-light-green)]" aria-hidden="true" />
                <span className="text-sm font-semibold text-[var(--totk-ivory)]">
                  {Array.from(new Set(calendarData.birthdays.map(b => b.birthday))).length} {Array.from(new Set(calendarData.birthdays.map(b => b.birthday))).length === 1 ? 'date' : 'dates'}
                </span>
              </div>
            </header>

            {calendarData.birthdays.length === 0 ? (
              <EmptyState 
                icon="fa-birthday-cake"
                title="No birthdays found"
                description="Add characters or users with birthdays to see them here"
              />
            ) : (
              <div className="space-y-4">
                {/* Group birthdays by date */}
                {Array.from(new Set(calendarData.birthdays.map(b => b.birthday)))
                  .sort((a, b) => {
                    // Sort by month first, then day
                    const [monthA, dayA] = a.split('-').map(Number);
                    const [monthB, dayB] = b.split('-').map(Number);
                    if (monthA !== monthB) return monthA - monthB;
                    return dayA - dayB;
                  })
                  .map((dateStr) => {
                    const birthdays = getBirthdaysForDate(dateStr);
                    const isToday = dateStr === todayInfo.realDate;
                    const [month, day] = dateStr.split('-').map(Number);
                    const dateObj = new Date(Date.UTC(2024, month - 1, day));
                    const hyruleanDate = convertToHyruleanDate(dateObj);
                    const monthName = dateObj.toLocaleDateString('en-US', { month: 'long' });
                  
                    return (
                      <article
                        key={dateStr}
                        className={clsx(
                          `${CARD_BASE_CLASS} p-5 hover:shadow-lg`,
                          isToday
                            ? `${CARD_BORDER_TODAY} shadow-lg shadow-[var(--totk-light-green)]/20`
                            : `${CARD_BORDER_NORMAL} hover:border-[var(--totk-light-green)]/50`
                        )}
                      >
                        <header className="mb-4 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={clsx(
                              "flex h-12 w-12 items-center justify-center rounded-full",
                              isToday
                                ? "bg-[var(--totk-light-green)]/20"
                                : "bg-[var(--totk-dark-ocher)]/20"
                            )}>
                              <i className={clsx(
                                "fa-solid fa-birthday-cake text-xl",
                                isToday ? "text-[var(--totk-light-green)]" : "text-[var(--totk-light-ocher)]"
                              )} aria-hidden="true" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xl font-bold text-[var(--totk-ivory)]">
                                  {monthName} {day}
                                </span>
                                <span className="text-sm font-medium text-[var(--totk-grey-200)]">
                                  ({dateStr})
                                </span>
                                {isToday && (
                                  <span className="rounded-full bg-[var(--totk-light-green)] px-3 py-1 text-xs font-semibold text-[var(--botw-warm-black)] animate-pulse">
                                    Today!
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-sm font-medium text-[var(--totk-light-green)]">
                                {hyruleanDate}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-semibold text-[var(--totk-grey-200)]">
                              {birthdays.length} {birthdays.length === 1 ? 'birthday' : 'birthdays'}
                            </div>
                          </div>
                        </header>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {birthdays.map((birthday) => (
                            <BirthdayCard 
                              key={`${birthday.userId}-${birthday.birthday}-${birthday.name}`}
                              birthday={birthday} 
                              size="md"
                            />
                          ))}
                        </div>
                      </article>
                    );
                  })}
              </div>
            )}
          </section>
        )}

        {activeTab === "hyrulean" && (
          <section>
            <h2 className="mb-4 text-2xl font-bold text-[var(--totk-light-ocher)]">
              Hyrulean Calendar Months
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {HYRULEAN_CALENDAR.map((month) => {
                const isCurrentMonth = getTodayInfo().hyruleanDate.startsWith(month.name);
                return (
                  <article
                    key={month.monthId}
                    className={clsx(
                      `${CARD_BASE_CLASS} p-4 hover:scale-[1.02]`,
                      isCurrentMonth ? CARD_BORDER_TODAY : CARD_BORDER_NORMAL
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-lg font-bold text-[var(--totk-light-ocher)]">
                        {month.name}
                      </h3>
                      <span className="text-sm text-[var(--totk-grey-200)]">
                        #{month.monthId}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--totk-grey-200)]">
                      {month.start} - {month.end}
                    </p>
                    {isCurrentMonth && (
                      <p className="mt-2 text-xs font-semibold text-[var(--totk-light-green)]">
                        Current Month
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "bloodmoon" && (
          <section>
            <h2 className="mb-4 text-2xl font-bold text-[var(--totk-light-ocher)]">
              Blood Moon Dates
            </h2>
            <div className={`mb-6 ${CARD_BASE_CLASS} ${CARD_BORDER_BLOODMOON} p-6`}>
              <div className="mb-4 flex items-center justify-center gap-3">
                <Image
                  src="/HWAoCBloodMoon.png"
                  alt="Blood Moon"
                  width={48}
                  height={48}
                  className="h-12 w-12 object-contain"
                  aria-hidden="true"
                />
                <div>
                  <h3 className="text-xl font-bold text-[var(--blight-text)]">
                    Blood Moon Cycle
                  </h3>
                  <p className="text-sm text-[var(--totk-grey-200)]">
                    26-day lunar cycle
                  </p>
                </div>
              </div>
              <div className="text-center">
                {isBloodMoonDay(currentDate) ? (
                  <p className="text-lg font-semibold text-[var(--blight-border)]">
                    Blood Moon Today!
                  </p>
                ) : (
                  <p className="text-lg font-semibold text-[var(--totk-light-green)]">
                    Day {getCurrentBloodMoonCycleDay(currentDate)} of 26 ({26 - getCurrentBloodMoonCycleDay(currentDate) + 1} days until next)
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {calendarData.bloodmoonDates.map((bm) => {
                const isToday = bm.realDate === todayInfo.realDate;
                return (
                  <article
                    key={bm.realDate}
                    className={clsx(
                      `${CARD_BASE_CLASS} p-4 hover:scale-[1.02]`,
                      isToday ? CARD_BORDER_BLOODMOON : CARD_BORDER_NORMAL
                    )}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <Image
                        src="/HWAoCBloodMoon.png"
                        alt="Blood Moon"
                        width={24}
                        height={24}
                        className="h-6 w-6 object-contain"
                        aria-hidden="true"
                      />
                      <span className="font-bold text-[var(--totk-ivory)]">
                        {bm.realDate}
                      </span>
                      {isToday && (
                        <span className="ml-auto rounded-full bg-[var(--blight-border)] px-2 py-0.5 text-xs font-semibold text-white">
                          Today
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--totk-grey-200)]">
                      {bm.month} {bm.day}
                    </p>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* Day Events Modal */}
        {selectedDayEvents && (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setSelectedDayEvents(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div 
              className={`relative mx-4 w-full max-w-2xl overflow-hidden rounded-xl ${CARD_BASE_CLASS} ${CARD_BORDER_NORMAL} shadow-2xl`}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <header className="border-b-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/60 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 id="modal-title" className="text-2xl font-bold text-[var(--totk-light-ocher)]">
                      {selectedDayEvents.date.toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        month: 'long', 
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--totk-light-green)]">
                      {selectedDayEvents.hyruleanDate}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedDayEvents(null)}
                    className={NAV_BUTTON_CLASS}
                    aria-label="Close modal"
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true" />
                  </button>
                </div>
                {selectedDayEvents.isBloodMoon && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-[var(--blight-border)] bg-[var(--blight-bg-top)]/40 px-4 py-2">
                    <Image
                      src="/HWAoCBloodMoon.png"
                      alt="Blood Moon"
                      width={24}
                      height={24}
                      className="h-6 w-6 object-contain"
                      aria-hidden="true"
                    />
                    <span className="font-semibold text-[var(--blight-text)]">
                      Blood Moon Day
                    </span>
                  </div>
                )}
              </header>

              {/* Modal Content */}
              <div className="max-h-[60vh] overflow-y-auto p-6">
                <div className="space-y-6">
                  {/* Quest Events */}
                  {selectedDayEvents.questEvents.length > 0 && (
                    <section>
                      <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-[var(--totk-light-ocher)]">
                        <i className="fa-solid fa-flag" aria-hidden="true" />
                        Quest Events ({selectedDayEvents.questEvents.length})
                      </h3>
                      <div className="space-y-3">
                        {selectedDayEvents.questEvents.map((event) => (
                          <QuestEventCard 
                            key={event.questId || `${event.date}-${event.title}-${event.type}`}
                            event={event} 
                            variant="full" 
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Birthdays */}
                  {selectedDayEvents.birthdays.length > 0 && (
                    <section>
                      <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-[var(--totk-light-ocher)]">
                        <i className="fa-solid fa-birthday-cake" aria-hidden="true" />
                        Birthdays ({selectedDayEvents.birthdays.length})
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {selectedDayEvents.birthdays.map((birthday) => (
                          <BirthdayCard 
                            key={`${birthday.userId}-${birthday.birthday}-${birthday.name}`}
                            birthday={birthday} 
                            size="md"
                            onClick={() => setSelectedDayEvents(null)}
                          />
                        ))}
                      </div>
                    </section>
                  )}

                  {/* No Events */}
                  {selectedDayEvents.questEvents.length === 0 && selectedDayEvents.birthdays.length === 0 && !selectedDayEvents.isBloodMoon && (
                    <EmptyState 
                      icon="fa-calendar-xmark"
                      title="No events on this day"
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
