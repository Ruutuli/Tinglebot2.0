"use client";

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================
// [page.tsx]✨ Core deps -
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { clsx } from "clsx";
import { getQuestTypeStyle, QuestDetailsModal, type DetailedQuestItem } from "@/components/modals/quest-modal";
import {
  getActiveSvgTypesForPrecip,
  getBannerForVillage,
  getOverlayForWeather,
  getSeasonImagePath,
  getVillageCrestPath,
  getWeatherSvgPath,
  precipLabelToIconType,
  WEATHER_SVG_TYPES,
} from "@/lib/weather-display";
import { capitalize, createSlug, formatLocationsDisplay } from "@/lib/string-utils";
import { getNextBloodMoonDate } from "@/lib/blood-moon-utils";
import { getNextBlightRollCallTime } from "@/lib/blight-roll-call-utils";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================
// [page.tsx]🧷 Countdown item -
type CountdownItem = {
  label: string;
  targetDate: Date;
  icon: string;
  color: string;
  borderColor: string;
  description: string;
  showDays: boolean;
  iconImage?: string;
};

/* [page.tsx]🧷 Village weather - */
type VillageWeatherItem = {
  activeSvgTypes: ("Clear" | "Cloudy" | "Rain" | "Storm")[];
  bannerUrl: string;
  name: string;
  overlayPath: string | null;
  precipitation: string;
  season: string;
  specialWeather?: string;
  tempLabel: string;
  temperature: string;
  wind: string;
  windLabel: string;
};

/* [page.tsx]🧷 Village level - */
type VillageLevelItem = {
  bannerUrl: string;
  health: number;
  maxHealth: number;
  maxLevel: number;
  name: string;
  nextLevel: number;
  status: string;
  statusIcon: string;
  level: number;
  tokens: number;
  tokensNeeded: number;
};

/* [page.tsx]🧷 Monthly quest (simplified for card display) - */
type MonthlyQuestItem = {
  id?: string;
  maxParticipants: number;
  month: string;
  name: string;
  participants: number;
  type: string;
  village: string;
  // Optional: full details for modal
  fullDetails?: DetailedQuestItem;
};

/* [page.tsx]🧷 Member stats from Discord roles - */
type MemberStatsData = {
  rudania: number;
  inariko: number;
  vhintl: number;
  traveler: number;
  resident: number;
  inactive: number;
  totalMembers: number;
};

/* ============================================================================ */
/* ------------------- Constants ------------------- */
/* ============================================================================ */

// [page.tsx]🧷 Character of the Week type -
type CharacterOfWeekData = {
  _id: string;
  characterId: string;
  characterName: string;
  userId: string;
  startDate: string;
  endDate: string;
  featuredReason: string;
  views: number;
  character: {
    _id: string;
    name: string;
    race: string;
    job: string;
    currentVillage: string;
    homeVillage: string;
    icon: string;
    userId: string;
  };
};

type CharacterOfWeekResponse = {
  characterOfWeek: CharacterOfWeekData;
  rotationInfo: {
    nextRotation: string;
    timeUntilRotation: string;
    totalRotations: number;
  };
};

// Calculate countdown targets dynamically
function getCountdownTargets(currentTime: Date): CountdownItem[] {
  const nextBloodMoon = getNextBloodMoonDate(currentTime);
  const nextBlightRollCall = getNextBlightRollCallTime(currentTime);
  
  return [
    {
      borderColor: "var(--totk-light-ocher)",
      color: "var(--totk-light-ocher)",
      description: "Next Blood Moon (26-day cycle) - Channel renaming, Blood Moon announcements",
      icon: "fa-moon",
      iconImage: "/HWAoCBloodMoon.png",
      label: "Blood Moon",
      showDays: true,
      targetDate: nextBloodMoon,
    },
    {
      borderColor: "var(--blight-border)",
      color: "var(--blight-text)",
      description: "Blight roll submissions and missed rolls check (Daily at 8pm ET)",
      icon: "fa-dice-d20",
      iconImage: "/blight_eye.png",
      label: "Blight Roll Call",
      showDays: false,
      targetDate: nextBlightRollCall,
    },
  ];
}

const WEATHER_VILLAGES_ORDER = ["Rudania", "Inariko", "Vhintl"] as const;
const VILLAGE_LEVELS_ORDER = ["Rudania", "Inariko", "Vhintl"] as const;

const DEFAULT_LEVEL_HEALTH: Record<number, number> = { 1: 100, 2: 200, 3: 300 };
const DEFAULT_TOKEN_REQUIREMENTS: Record<number, number> = { 2: 10000, 3: 50000 };

type WeatherApiDoc = {
  village: string;
  temperature?: { label?: string; emoji?: string; probability?: string };
  wind?: { label?: string; emoji?: string; probability?: string };
  precipitation?: { label?: string; emoji?: string; probability?: string };
  special?: { label?: string; emoji?: string; probability?: string };
  season?: string;
};

/** Extract short label (e.g. "Cool") from "52°F / 11°C - Cool" or "Calm" from "< 2(km/h) // Calm". */
function shortLabel(full: string | undefined, sep: string): string {
  if (!full || typeof full !== "string") return "—";
  const i = full.indexOf(sep);
  return i >= 0 ? full.slice(i + sep.length).trim() : full.trim();
}

/** Extract part before separator (e.g. "52°F / 11°C" from "52°F / 11°C - Cool", "< 2(km/h)" from "< 2(km/h) // Calm"). */
function partBefore(full: string | undefined, sep: string): string {
  if (!full || typeof full !== "string") return "—";
  const i = full.indexOf(sep);
  return i >= 0 ? full.slice(0, i).trim() : full.trim();
}

function mapWeatherDocToItem(doc: WeatherApiDoc | null, villageName: string): VillageWeatherItem {
  if (!doc) {
    return {
      activeSvgTypes: [],
      bannerUrl: getBannerForVillage(villageName),
      name: villageName,
      overlayPath: null,
      precipitation: "—",
      season: "—",
      tempLabel: "—",
      temperature: "—",
      wind: "—",
      windLabel: "—",
    };
  }
  const prec = doc.precipitation?.label ?? "—";
  const tempLabel = shortLabel(doc.temperature?.label, " - ") || "—";
  const windLabel = shortLabel(doc.wind?.label, " // ") || "—";
  const overlayPath = getOverlayForWeather(doc);
  const activeSvgTypes = getActiveSvgTypesForPrecip(prec);
  return {
    activeSvgTypes,
    bannerUrl: getBannerForVillage(doc.village),
    name: doc.village,
    overlayPath,
    precipitation: prec,
    season: doc.season ? capitalize(doc.season) : "—",
    specialWeather: doc.special?.label,
    tempLabel,
    temperature: partBefore(doc.temperature?.label, " - ") || "—",
    wind: partBefore(doc.wind?.label, " // ") || "—",
    windLabel,
  };
}

type VillageLevelsApiDoc = {
  name: string;
  health?: number;
  level?: number;
  currentTokens?: number;
  status?: string;
  levelHealth?: Record<string, number>;
  tokenRequirements?: Record<string, number>;
};

function mapVillageDocToItem(doc: VillageLevelsApiDoc | null, villageName: string): VillageLevelItem {
  const maxLevel = 3;
  if (!doc) {
    return {
      bannerUrl: getBannerForVillage(villageName),
      health: 0,
      level: 1,
      maxHealth: DEFAULT_LEVEL_HEALTH[1],
      maxLevel,
      name: villageName,
      nextLevel: 2,
      status: "—",
      statusIcon: "fa-circle-question",
      tokens: 0,
      tokensNeeded: DEFAULT_TOKEN_REQUIREMENTS[2],
    };
  }
  const level = Math.min(maxLevel, Math.max(1, doc.level ?? 1));
  const nextLevel = level < maxLevel ? level + 1 : maxLevel;
  const lh = doc.levelHealth ?? {};
  const maxHealth = lh[String(level)] ?? lh[level] ?? DEFAULT_LEVEL_HEALTH[level] ?? 100;
  const tr = doc.tokenRequirements ?? {};
  const tokensNeeded = tr[String(nextLevel)] ?? tr[nextLevel] ?? DEFAULT_TOKEN_REQUIREMENTS[nextLevel as 2 | 3] ?? 0;
  const tokens = doc.currentTokens ?? 0;
  const health = doc.health ?? 0;
  const isDamaged = doc.status === "damaged";
  return {
    bannerUrl: getBannerForVillage(doc.name),
    health,
    level,
    maxHealth,
    maxLevel,
    name: doc.name,
    nextLevel,
    status: isDamaged ? "Damaged" : "Healthy",
    statusIcon: isDamaged ? "fa-triangle-exclamation" : "fa-circle-check",
    tokens,
    tokensNeeded,
  };
}

type QuestApiDoc = {
  _id?: string;
  questID?: string;
  title: string;
  description?: string;
  questType: string;
  location: string;
  date: string;
  timeLimit?: string;
  participantCap?: number | null;
  participants?: Record<string, { characterName?: string; progress?: string }>;
  tokenReward?: unknown;
  rules?: string | null;
  specialNote?: string | null;
  status?: string;
  postedAt?: string | null;
  postRequirement?: number | null;
  minRequirements?: unknown;
};

function participantCount(participants: QuestApiDoc["participants"]): number {
  if (!participants || typeof participants !== "object") return 0;
  return Object.keys(participants).length;
}

function mapQuestToMonthlyItem(doc: QuestApiDoc): MonthlyQuestItem {
  const participants = participantCount(doc.participants);
  const maxParticipants = doc.participantCap ?? Infinity;
  const village = doc.location ?? "—";
  const month = doc.date ?? "—";
  const type = doc.questType ?? "—";
  const name = doc.title ?? "—";

  const participantList = doc.participants
    ? Object.values(doc.participants)
        .filter((p) => p && typeof p === "object")
        .map((p) => ({
          name: p.characterName ?? "—",
          status: (p.progress === "active" ? "Active" : "Completed") as "Active" | "Completed",
        }))
    : [];

  const rulesStr = doc.rules ?? doc.specialNote ?? "";
  const rules = rulesStr ? rulesStr.split(/\n/).map((s) => s.trim()).filter(Boolean) : [];

  const tokenVal = doc.tokenReward;
  const rewards: { tokens?: number; flat?: number; perUnit?: number; description?: string } = {};
  if (typeof tokenVal === "number" && tokenVal >= 0) {
    rewards.flat = tokenVal;
    rewards.tokens = tokenVal;
  } else if (typeof tokenVal === "string" && tokenVal.trim()) {
    const s = tokenVal.trim();
    const flatMatch = s.match(/^flat:\s*(\d+)$/i);
    const perUnitMatch = s.match(/^per_unit:\s*(\d+)$/i);
    if (flatMatch) {
      rewards.flat = Math.max(0, parseInt(flatMatch[1], 10));
      rewards.tokens = rewards.flat;
    } else if (perUnitMatch) {
      rewards.perUnit = Math.max(0, parseInt(perUnitMatch[1], 10));
    } else {
      rewards.description = tokenVal.trim();
    }
  }

  const participationRequirements: string[] = [];
  if (doc.questType === "RP" && typeof doc.postRequirement === "number" && doc.postRequirement > 0) {
    participationRequirements.push(`${doc.postRequirement} RP posts required`);
  }
  if (doc.minRequirements != null && typeof doc.minRequirements === "number" && doc.minRequirements > 0) {
    participationRequirements.push(`Minimum requirement: ${doc.minRequirements}`);
  }

  let postedDate: string | undefined;
  if (doc.postedAt) {
    try {
      const d = new Date(doc.postedAt);
      if (!Number.isNaN(d.getTime())) {
        postedDate = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      }
    } catch {
      postedDate = String(doc.postedAt);
    }
  }

  const fullDetails: DetailedQuestItem = {
    category: type,
    description: doc.description ?? "",
    locations: village === "Multiple" ? ["Rudania", "Inariko", "Vhintl"] : [village],
    maxParticipants,
    month,
    name,
    participants: participantList,
    participationRequirements,
    postedDate,
    rewards,
    rules,
    specialNote: doc.specialNote ?? undefined,
    status: doc.status === "completed" ? "Completed" : "Active",
    timeLimit: doc.timeLimit ?? "1 month",
    type,
    village,
  };

  return {
    id: doc.questID ?? doc._id,
    maxParticipants,
    month,
    name,
    participants,
    type,
    village,
    fullDetails,
  };
}

// ============================================================================
// ------------------- Utils -------------------
// ============================================================================
// [page.tsx]🧠 Get village-specific color -
function getVillageColor(villageName: string): { color: string; rgb: string } {
  const normalized = (villageName ?? "").toLowerCase();
  if (normalized === "rudania") {
    return { color: "var(--village-rudania)", rgb: "198, 0, 10" };
  }
  if (normalized === "inariko") {
    return { color: "var(--village-inariko)", rgb: "0, 77, 199" };
  }
  if (normalized === "vhintl") {
    return { color: "var(--village-vhintl)", rgb: "74, 161, 68" };
  }
  // Default to light green for non-village specific items
  return { color: "var(--totk-light-green)", rgb: "73, 213, 156" };
}

// [page.tsx]🧠 Temp label → FA icon (weatherData.js temperatures) -
const TEMP_LABEL_ICONS: Record<string, string> = {
  Frigid: "fa-snowflake",
  Freezing: "fa-snowflake",
  Cold: "fa-snowflake",
  Chilly: "fa-snowflake",
  Brisk: "fa-temperature-quarter",
  Cool: "fa-snowflake",
  Mild: "fa-temperature-half",
  Perfect: "fa-sun",
  Warm: "fa-sun",
  Hot: "fa-fire",
  Scorching: "fa-fire",
  "Heat Wave": "fa-fire",
};

function getTempLabelIcon(label: string): { type: "fa"; icon: string } {
  const k = label.trim();
  const exact = TEMP_LABEL_ICONS[k];
  if (exact) return { type: "fa", icon: exact };
  const match = Object.entries(TEMP_LABEL_ICONS).find(([key]) => key.toLowerCase() === k.toLowerCase());
  if (match) return { type: "fa", icon: match[1] };
  if (/(frigid|freezing|cold|chilly|cool)/i.test(k)) return { type: "fa", icon: "fa-snowflake" };
  if (/(warm|perfect)/i.test(k)) return { type: "fa", icon: "fa-sun" };
  if (/(hot|scorching|heat)/i.test(k)) return { type: "fa", icon: "fa-fire" };
  if (/brisk/i.test(k)) return { type: "fa", icon: "fa-temperature-quarter" };
  if (/mild/i.test(k)) return { type: "fa", icon: "fa-temperature-half" };
  return { type: "fa", icon: "fa-temperature-half" };
}

/* [page.tsx]🧠 Wind label → FA icon (weatherData.js winds) - */
const WIND_LABEL_ICONS: Record<string, string> = {
  Calm: "fa-feather",
  Breeze: "fa-wind",
  Moderate: "fa-wind",
  Fresh: "fa-wind",
  Strong: "fa-wind",
  Gale: "fa-wind",
  Storm: "fa-cloud-bolt",
  Hurricane: "fa-tornado",
};

function getWindLabelIcon(label: string): { type: "fa"; icon: string } {
  const k = label.trim();
  const exact = WIND_LABEL_ICONS[k];
  if (exact) return { type: "fa", icon: exact };
  const match = Object.entries(WIND_LABEL_ICONS).find(([key]) => key.toLowerCase() === k.toLowerCase());
  if (match) return { type: "fa", icon: match[1] };
  if (/calm/i.test(k)) return { type: "fa", icon: "fa-feather" };
  if (/hurricane/i.test(k)) return { type: "fa", icon: "fa-tornado" };
  if (/storm/i.test(k)) return { type: "fa", icon: "fa-cloud-bolt" };
  return { type: "fa", icon: "fa-wind" };
}

// [page.tsx]🧠 Countdown formatted string -
function formatTimeRemaining(targetDate: Date, currentTime: Date): string {
  const diff = targetDate.getTime() - currentTime.getTime();
  if (diff <= 0) return "00:00:00:00";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return `${String(days).padStart(2, "0")}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
}

/* ============================================================================ */
/* ------------------- Styles / className Maps ------------------- */
/* ============================================================================ */

/* [page.tsx]✨ Class maps - */
const styles = {
  cardCountdown: "group relative overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4 transition-all duration-300 hover:scale-[1.02]",
  cardGradient: "overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] transition-all duration-300 hover:border-[var(--totk-light-green)] hover:shadow-[0_0_20px_rgba(73,213,156,0.25)] hover:scale-[1.02]",
  divider: "my-8 h-px w-full bg-gradient-to-r from-transparent via-[var(--totk-dark-ocher)] to-transparent",
  sectionHeader: {
    section: {
      image: "opacity-90 transition-opacity duration-200 hover:opacity-100",
      title: "text-xl font-bold text-[var(--totk-light-ocher)]",
      wrapper: "mb-4 flex items-center justify-center gap-3",
    },
    welcome: {
      image: "opacity-70 transition-opacity duration-200 hover:opacity-100",
      inner: "relative z-10 flex items-center justify-center gap-4",
      outer: "relative overflow-hidden rounded-lg border-2 border-[var(--totk-dark-ocher)] p-3 md:p-4 shadow-lg transition-all duration-300 hover:border-[var(--totk-light-green)]/50 hover:shadow-[0_0_20px_rgba(73,213,156,0.2)]",
      title: "text-lg md:text-xl font-bold text-[var(--totk-white)]",
    },
  },
};

const publicFile = (filename: string) => `/${encodeURIComponent(filename)}`;

const SECTION_HEADER_IMAGES = {
  section: {
    left: publicFile("Side=Left, Type=Spoken.svg"),
    right: publicFile("Side=Right, Type=Spoken.svg"),
    width: 10,
    height: 40,
  },
  welcome: {
    left: publicFile("Side=Left.svg"),
    right: publicFile("Side=Right.svg"),
    width: 24,
    height: 10,
  },
} as const;

// ============================================================================
// ------------------- Subcomponents -------------------
// ============================================================================
// [page.tsx]🧩 Section title with ornament images -
function SectionHeader({
  as: Tag = "h2",
  title,
  variant,
}: {
  as?: "h1" | "h2";
  title: string;
  variant: "section" | "welcome";
}) {
  const imgs = SECTION_HEADER_IMAGES[variant];

  if (variant === "welcome") {
    const s = styles.sectionHeader.welcome;
    return (
      <div
        className={s.outer}
        style={{
          background: "linear-gradient(to bottom right, var(--totk-brown), var(--botw-warm-black))",
          color: "var(--totk-ivory)",
        }}
      >
        <div className={s.inner}>
          <Image
            alt=""
            aria-hidden
            className={s.image}
            height={imgs.height}
            unoptimized
            src={imgs.left}
            width={imgs.width}
          />
          <Tag className={s.title}>{title}</Tag>
          <Image
            alt=""
            aria-hidden
            className={s.image}
            height={imgs.height}
            unoptimized
            src={imgs.right}
            width={imgs.width}
          />
        </div>
      </div>
    );
  }

  const s = styles.sectionHeader.section;
  return (
    <div className={s.wrapper}>
      <Image
        alt=""
        aria-hidden
        className={s.image}
        height={imgs.height}
        unoptimized
        src={imgs.left}
        width={imgs.width}
      />
      <Tag className={s.title}>{title}</Tag>
      <Image
        alt=""
        aria-hidden
        className={s.image}
        height={imgs.height}
        unoptimized
        src={imgs.right}
        width={imgs.width}
      />
    </div>
  );
}

/* [page.tsx]🧩 Gradient divider between sections - */
function Divider() {
  return <div className={styles.divider} />;
}

// [page.tsx]🧩 Auth error message from callback redirect -
function getAuthErrorMessage(
  authError: string | null,
  details: string | null
): { message: string; showDetails: boolean } | null {
  if (!authError) return null;
  const showDetails =
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    !!details?.trim();
  const map: Record<string, string> = {
    missing_code: "Login was cancelled or interrupted. Please try again.",
    config: "Login is not configured. Contact an administrator.",
    token: "Something went wrong during login. Please try again.",
    no_token: "Something went wrong during login. Please try again.",
    user: "Something went wrong during login. Please try again.",
    access_denied: "You denied access. Try again when you're ready to sign in.",
    invalid_state: "Login link expired or invalid. Please try again.",
  };
  const message = map[authError] ?? "Login failed. Please try again.";
  return { message, showDetails };
}

/* [page.tsx]🧩 Dismissible auth error banner - */
function AuthErrorBanner({
  message,
  details,
  showDetails,
  onDismiss,
}: {
  message: string;
  details: string | null;
  showDetails: boolean;
  onDismiss: () => void;
}) {
  return (
    <div
      className="mb-4 flex flex-col gap-3 rounded-xl border-2 p-4 sm:flex-row sm:items-center sm:justify-between"
      style={{
        borderColor: "var(--totk-dark-ocher)",
        backgroundColor: "var(--totk-brown)",
      }}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--totk-ivory)]">{message}</p>
        {showDetails && details && (
          <p className="mt-1 truncate text-xs text-[var(--totk-grey-200)]" title={details}>
            {details}
          </p>
        )}
        <p className="mt-2 text-xs text-[var(--totk-grey-200)]">
          Using Discord&apos;s in-app browser? Open this site in Chrome, Firefox, or Edge, then try again.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href="/api/auth/discord"
          title="If login fails, open this site in Chrome, Firefox, or Edge (not in Discord's app)."
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 hover:scale-[1.02] hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] sm:px-4"
          style={{
            backgroundColor: "var(--botw-dark-blue)",
            color: "var(--botw-white)",
          }}
        >
          <i aria-hidden className="fa-brands fa-discord" />
          Login with Discord
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/60 p-2 text-[var(--totk-ivory)] transition-all duration-200 hover:border-[var(--totk-light-green)] hover:bg-[var(--totk-dark-green)] hover:shadow-[0_0_12px_rgba(73,213,156,0.4)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]"
          aria-label="Dismiss"
        >
          <i aria-hidden className="fa-solid fa-xmark" />
        </button>
      </div>
    </div>
  );
}

// [page.tsx]🧩 Single countdown unit (value + label) for DRY display -
function CountdownUnit({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className="text-2xl font-bold leading-none" style={{ color }} suppressHydrationWarning>
        {value}
      </div>
      <div className="mt-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
        {label}
      </div>
    </div>
  );
}

/* [page.tsx]🧩 Countdown tile - */
/* [page.tsx]❌ TODO: Confirm focus order after refactor */
function CountdownCard({
  borderColor,
  color,
  currentTime,
  description,
  icon,
  iconImage,
  label,
  showDays,
  targetDate,
}: CountdownItem & { currentTime: Date }) {
  const timeRemaining = formatTimeRemaining(targetDate, currentTime);
  const parts = timeRemaining.split(" ");
  const days = parts[0]?.replace("d", "") ?? "00";
  const hours = parts[1]?.replace("h", "") ?? "00";
  const minutes = parts[2]?.replace("m", "") ?? "00";
  const seconds = parts[3]?.replace("s", "") ?? "00";

  // Determine if this is Blood Moon (left, rounded left) or Blight Roll Call (right, rounded right)
  const isBloodMoon = label === "Blood Moon";
  const isBlightRollCall = label === "Blight Roll Call";
  const hoverClass = label === "Blood Moon" ? "countdown-card-blood-moon" : label === "Blight Roll Call" ? "countdown-card-blight" : "";

  return (
    <div className="relative flex items-center justify-center">
      {/* Left Sheikah decoration for Blood Moon */}
      {isBloodMoon && (
        <div className="absolute -left-32 top-[55%] z-20 -translate-y-1/2 translate-x-2 hidden lg:block">
          <div className="sheikah-decoration-wrapper relative h-[320px] w-auto">
            <Image
              alt=""
              aria-hidden
              unoptimized
              className="relative z-10 h-full w-auto animate-sheikah-pulse opacity-70 transition-all duration-500 group-hover:opacity-100"
              height={156}
              src={publicFile("Side=Left, Type=Shekiah.svg")}
              width={66}
            />
          </div>
        </div>
      )}
      
      {/* Right Sheikah decoration for Blight Roll Call */}
      {isBlightRollCall && (
        <div className="absolute -right-32 top-[55%] z-20 -translate-y-1/2 -translate-x-2 hidden lg:block">
          <div className="sheikah-decoration-wrapper relative h-[320px] w-auto">
            <Image
              alt=""
              aria-hidden
              unoptimized
              className="relative z-10 h-full w-auto animate-sheikah-pulse opacity-70 transition-all duration-500 group-hover:opacity-100"
              height={156}
              src={publicFile("Side=Right, Type=Shekiah.svg")}
              width={66}
            />
          </div>
        </div>
      )}

      <div
        className={clsx(
          "group relative flex h-[300px] overflow-hidden bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] transition-all duration-500 hover:scale-[1.02] shadow-[0_0_20px_rgba(0,0,0,0.3)]",
          // Mobile: half circle (to combine into full circle), Desktop: half circle
          isBloodMoon && "w-[150px] rounded-l-full lg:w-[200px] lg:rounded-l-full lg:rounded-r-none",
          isBlightRollCall && "w-[150px] rounded-r-full lg:w-[200px] lg:rounded-r-full lg:rounded-l-none",
          hoverClass
        )}
        style={{
          borderColor: borderColor,
          borderWidth: "3px",
          borderTopWidth: "3px",
          borderBottomWidth: "3px",
          borderLeftWidth: isBloodMoon ? "3px" : isBlightRollCall ? "3px" : "0px",
          borderRightWidth: isBloodMoon ? "3px" : isBlightRollCall ? "3px" : "0px",
          boxShadow: `0 0 20px ${borderColor}40`,
          maxWidth: "100%",
        }}
      >
        {/* Redesigned layout for half-circle */}
        <div className="relative z-10 flex w-full flex-col h-full items-center justify-center px-4 py-6 gap-4">
          {/* Icon - larger and centered */}
          <div className="flex items-center justify-center">
            {iconImage ? (
              <Image
                alt=""
                aria-hidden
                unoptimized
                className="object-contain transition-transform duration-300 group-hover:scale-110"
                height={40}
                src={iconImage}
                width={40}
              />
            ) : (
              <i
                aria-hidden
                className={`fa-solid ${icon} text-3xl transition-transform duration-300 group-hover:scale-110`}
                style={{ color }}
              />
            )}
          </div>

          {/* Label */}
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-[var(--totk-ivory)] text-center">
            {label}
          </h3>

          {/* Countdown - centered */}
          <div className="flex items-center justify-center">
            {showDays ? (
              <div className="flex items-center gap-1.5">
                <CountdownUnit color={color} label="Days" value={days} />
                <div className="pt-1 text-xl font-bold leading-none" style={{ color }}>
                  :
                </div>
                <CountdownUnit color={color} label="Hours" value={hours} />
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <CountdownUnit color={color} label="H" value={hours} />
                <div className="pt-1 text-xl font-bold leading-none" style={{ color }}>
                  :
                </div>
                <CountdownUnit color={color} label="M" value={minutes} />
                <div className="pt-1 text-xl font-bold leading-none" style={{ color }}>
                  :
                </div>
                <CountdownUnit color={color} label="S" value={seconds} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// [page.tsx]🧩 Village weather card -
function WeatherCard(v: VillageWeatherItem) {
  const tempIcon = getTempLabelIcon(v.tempLabel);
  const windIcon = getWindLabelIcon(v.windLabel);
  const seasonImagePath = getSeasonImagePath(v.season);
  const villageCrestPath = getVillageCrestPath(v.name);
  const villageName = String(v.name ?? "").toLowerCase();
  const villageClass = villageName === "rudania" ? "village-card-rudania" : villageName === "inariko" ? "village-card-inariko" : villageName === "vhintl" ? "village-card-vhintl" : "";

  return (
    <div className={clsx("group overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] transition-all duration-300 hover:scale-[1.02]", villageClass)}>
      <div className="relative h-20 w-full overflow-hidden">
        <Image
          alt={`${capitalize(v.name)} banner`}
          className="object-cover"
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 33vw"
          src={v.bannerUrl}
        />
        {v.overlayPath != null && (
          <Image
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 object-cover opacity-80"
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 33vw"
            src={v.overlayPath}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--botw-warm-black)]/80 via-[var(--botw-warm-black)]/60 to-[var(--botw-warm-black)]/80" />
        <div className="absolute inset-0 flex items-center justify-between px-4">
          <div className="flex min-w-0 shrink items-center">
            {villageCrestPath ? (
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--botw-warm-black)]">
                <img
                  alt=""
                  aria-hidden
                  className="h-9 w-9 object-contain"
                  height={36}
                  src={villageCrestPath}
                  width={36}
                />
              </div>
            ) : (
              <i aria-hidden className="fa-solid fa-map-marker-alt shrink-0 text-2xl text-[var(--totk-light-ocher)]" />
            )}
          </div>
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-0.5 text-center">
            <div className="text-lg font-bold text-[var(--totk-light-ocher)] drop-shadow-[0_0_4px_rgba(0,0,0,0.8)]">
              {capitalize(v.name)}
            </div>
            {v.specialWeather != null && (
              <div className="flex items-center gap-2 text-sm font-semibold text-[var(--totk-light-green)] drop-shadow-[0_0_4px_rgba(0,0,0,0.8)]">
                <i aria-hidden className="fa-solid fa-star text-xs" />
                <span>{v.specialWeather}</span>
                <i aria-hidden className="fa-solid fa-star text-xs" />
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-end">
            {seasonImagePath ? (
              <Image
                alt=""
                aria-hidden
                className="h-20 w-20 object-contain"
                height={80}
                src={seasonImagePath}
                width={80}
              />
            ) : (
              <i aria-hidden className="fa-solid fa-leaf text-2xl text-[var(--totk-light-green)]" />
            )}
          </div>
        </div>
      </div>
      <div className="space-y-2.5 p-5">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 px-3 py-2.5">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
            <i aria-hidden className="fa-solid fa-temperature-half text-base text-[var(--totk-light-green)]" />
            Temp
          </span>
          <span className="text-right text-sm font-semibold text-[var(--totk-light-green)]">{v.temperature}</span>
          <span className="flex items-center gap-1.5 text-xs text-[var(--botw-pale)]">
            {tempIcon.type === "fa" ? (
              <i aria-hidden className={`fa-solid ${tempIcon.icon} text-sm text-[var(--totk-light-green)]`} />
            ) : (
              <span>{tempIcon.icon}</span>
            )}
            {v.tempLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 px-3 py-2.5">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
            <i aria-hidden className="fa-solid fa-wind text-base text-[var(--botw-blue)]" />
            Wind
          </span>
          <span className="text-right text-sm font-medium text-[var(--totk-grey-200)]">{v.wind}</span>
          <span className="flex items-center gap-1.5 text-xs italic text-[var(--botw-pale)]">
            {windIcon.type === "fa" ? (
              <i aria-hidden className={`fa-solid ${windIcon.icon} text-sm text-[var(--botw-blue)]`} />
            ) : (
              <span>{windIcon.icon}</span>
            )}
            {v.windLabel}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 px-3 py-2.5">
          <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
            <i aria-hidden className="fa-solid fa-droplet text-base text-[var(--botw-blue)]" />
            Precip
          </span>
          <div className="flex items-center gap-1.5">
            {WEATHER_SVG_TYPES.map((type) => {
              const isActive = v.activeSvgTypes.includes(type);
              const iconPath = getWeatherSvgPath(type, isActive);
              return (
                <Image
                  key={type}
                  alt={`${type} weather icon`}
                  unoptimized
                  className={isActive ? "opacity-100" : "opacity-50"}
                  height={80}
                  src={iconPath}
                  style={{ width: "auto" }}
                  width={80}
                />
              );
            })}
          </div>
          <span className="text-sm font-semibold text-[var(--totk-light-green)]">{v.precipitation}</span>
        </div>
      </div>
    </div>
  );
}

// [page.tsx]🧩 Village level card -
function VillageLevelCard(v: VillageLevelItem) {
  const healthPercent = v.maxHealth > 0 ? (v.health / v.maxHealth) * 100 : 0;
  const tokensPercent = v.tokensNeeded > 0 ? (v.tokens / v.tokensNeeded) * 100 : 0;
  const isHealthy = v.status === "Healthy";
  const villageName = String(v.name ?? "").toLowerCase();
  const villageClass = villageName === "rudania" ? "village-card-rudania" : villageName === "inariko" ? "village-card-inariko" : villageName === "vhintl" ? "village-card-vhintl" : "";

  return (
    <Link href="/models/villages">
      <div className={clsx("group overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] transition-all duration-300 hover:scale-[1.02] cursor-pointer", villageClass)}>
      <div className="relative h-24 w-full overflow-hidden">
        <Image
          alt={`${capitalize(v.name)} banner`}
          className="object-cover"
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 33vw, 33vw"
          src={v.bannerUrl}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--botw-warm-black)]/80 via-[var(--botw-warm-black)]/50 to-[var(--botw-warm-black)]/80" />
        <div className="absolute inset-0 flex flex-col">
          <div className="flex flex-1 items-center justify-center">
            <h4 className="text-lg font-bold text-[var(--totk-ivory)] drop-shadow-[0_0_6px_rgba(0,0,0,0.9),0_0_12px_rgba(0,0,0,0.5)]">
              {capitalize(v.name)}
            </h4>
          </div>
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/95 px-2.5 py-1.5 shadow-[0_0_8px_rgba(0,0,0,0.6)] backdrop-blur-sm">
              <i
                aria-hidden
                className={clsx("fa-solid text-xs", v.statusIcon, isHealthy ? "text-[var(--totk-light-green)]" : "text-[var(--gold)]")}
              />
              <span className="text-xs font-bold text-[var(--totk-ivory)]">{v.status}</span>
            </div>
            <div className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/95 px-2.5 py-1.5 shadow-[0_0_8px_rgba(0,0,0,0.6)] backdrop-blur-sm">
              <span className="text-xs font-bold text-[var(--totk-light-green)]">
                Level {v.level}/{v.maxLevel}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-3 p-4 md:p-5">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-[var(--botw-pale)]">
              <i aria-hidden className="fa-solid fa-heart text-[var(--totk-light-green)]" />
              Health
            </span>
            <span className="font-semibold text-[var(--totk-light-green)]">
              {v.health}/{v.maxHealth} ({Math.round(healthPercent)}%)
            </span>
          </div>
          <div className="mb-2 h-1.5 overflow-hidden rounded-full border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]">
            <div
              className="h-full transition-all duration-300"
              style={{
                backgroundColor: healthPercent < 50 ? "var(--blight-border)" : "var(--totk-light-green)",
                width: `${healthPercent}%`,
              }}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-[var(--botw-pale)]">
              <i aria-hidden className="fa-solid fa-coins text-[var(--totk-light-ocher)]" />
              Tokens
            </span>
            <span className="font-semibold text-[var(--totk-light-green)]">{Math.round(tokensPercent)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]">
            <div
              className="h-full transition-all duration-300"
              style={{
                backgroundColor: "var(--botw-blue)",
                width: `${tokensPercent}%`,
              }}
            />
          </div>
          <div className="mt-1.5 text-xs font-medium text-[var(--botw-pale)]">
            {v.tokens.toLocaleString()}/{v.tokensNeeded.toLocaleString()} until level {v.nextLevel}
          </div>
        </div>
      </div>
    </div>
    </Link>
  );
}

/* [page.tsx]🧩 Monthly quest card - */
function QuestCard(q: MonthlyQuestItem) {
  const participantsDisplay =
    q.maxParticipants === Infinity ? `${q.participants}/∞` : `${q.participants}/${q.maxParticipants}`;
  const typeStyle = getQuestTypeStyle(q.type);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Create a default detailed quest if fullDetails is not provided
  const defaultQuestDetails: DetailedQuestItem = {
    category: q.type,
      description: `Join the ${q.name} quest in ${formatLocationsDisplay([q.village])} this ${q.month}. This ${String(q.type ?? "").toLowerCase()} quest${
        q.maxParticipants === Infinity ? " welcomes all participants." : ` has space for ${q.maxParticipants} participants.`
      }`,
    locations: [q.village],
    maxParticipants: q.maxParticipants,
    month: q.month,
    name: q.name,
    participants: [],
    participationRequirements: [],
    rewards: {},
    rules: [],
    status: "Active",
    timeLimit: "1 month",
    type: q.type,
    village: q.village,
  };

  const questDetails = q.fullDetails || defaultQuestDetails;
  const villageName = q.village !== "Multiple" ? String(q.village ?? "").toLowerCase() : "";
  const villageClass = villageName === "rudania" ? "village-card-rudania" : villageName === "inariko" ? "village-card-inariko" : villageName === "vhintl" ? "village-card-vhintl" : "";

  return (
    <>
      <div
        className={clsx("group overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] transition-all duration-300 hover:scale-[1.02]", villageClass)}
        style={{ ["--card-type" as string]: typeStyle.color }}
      >
        <div
          className="relative h-16 w-full overflow-hidden"
          style={{ backgroundColor: typeStyle.color }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--botw-warm-black)]/60" />
          <div className="absolute inset-0 flex items-center justify-center gap-2">
            <i
              aria-hidden
              className={`fa-solid ${typeStyle.icon} text-base text-[var(--totk-ivory)] drop-shadow-[0_0_4px_rgba(0,0,0,0.8)]`}
            />
            <span className="text-sm font-bold uppercase tracking-wider text-[var(--totk-ivory)] drop-shadow-[0_0_4px_rgba(0,0,0,0.8)]">
              {q.type}
            </span>
          </div>
        </div>
        <div className="p-4 md:p-5">
          <div className="mb-4 space-y-2">
            <h4 className="text-lg font-bold text-[var(--totk-ivory)] drop-shadow-[0_0_4px_rgba(0,0,0,0.5)]">
              {q.name}
            </h4>
            <div className="flex items-center gap-2 text-sm text-[var(--botw-pale)]">
              <i aria-hidden className="fa-solid fa-map-marker-alt text-[var(--totk-light-green)]" />
              <span>{formatLocationsDisplay([q.village])}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--botw-pale)]">
              <i aria-hidden className="fa-solid fa-calendar-days text-[var(--totk-light-ocher)]" />
              <span>{q.month}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-sm text-[var(--botw-pale)]">
              <span className="flex items-center gap-1.5 font-medium">
                <i aria-hidden className="fa-solid fa-users text-[var(--botw-blue)]" />
                Participants
              </span>
              <span className="font-semibold text-[var(--totk-light-green)]">{participantsDisplay}</span>
            </div>
          </div>
          <button
            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 px-4 py-3 text-sm font-semibold text-[var(--totk-ivory)] shadow-lg transition-all duration-200 hover:scale-[1.02] hover:border-[var(--card-type)] hover:bg-[var(--card-type)] hover:text-[var(--botw-warm-black)] hover:shadow-[0_0_16px_var(--card-type)]"
            onClick={() => setIsModalOpen(true)}
            type="button"
          >
            <Image
              alt=""
              aria-hidden
              className="opacity-80"
              height={14}
              src="/Directional Arrow.svg"
              style={{ width: "auto" }}
              width={14}
            />
            View Details
          </button>
        </div>
      </div>
      <QuestDetailsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} quest={questDetails} />
    </>
  );
}

// ============================================================================
// ------------------- Main Component -------------------
// ============================================================================
// [page.tsx]🧱 Homepage shell -
export default function HomePage() {
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);
  const [authDetails, setAuthDetails] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setAuthError(params.get("auth_error"));
    setAuthDetails(params.get("details"));
  }, []);

  const authErrorInfo = useMemo(
    () => getAuthErrorMessage(authError, authDetails),
    [authError, authDetails]
  );

  const dismissAuthError = useCallback(() => {
    setAuthError(null);
    setAuthDetails(null);
    router.replace("/");
  }, [router]);

  // Initialize with a date to avoid hydration mismatch - will be updated immediately on mount
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [characterOfWeek, setCharacterOfWeek] = useState<CharacterOfWeekData | null>(null);
  const [rotationInfo, setRotationInfo] = useState<{
    nextRotation: string;
    timeUntilRotation: string;
    totalRotations: number;
  } | null>(null);
  const [isLoadingCharacter, setIsLoadingCharacter] = useState(true);
  const [characterError, setCharacterError] = useState<string | null>(null);
  const [characterImageError, setCharacterImageError] = useState(false);

  const [weatherItems, setWeatherItems] = useState<VillageWeatherItem[]>([]);
  const [isLoadingWeather, setIsLoadingWeather] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [villageLevelItems, setVillageLevelItems] = useState<VillageLevelItem[]>([]);
  const [isLoadingVillageLevels, setIsLoadingVillageLevels] = useState(true);
  const [villageLevelsError, setVillageLevelsError] = useState<string | null>(null);

  const [monthlyQuestItems, setMonthlyQuestItems] = useState<MonthlyQuestItem[]>([]);
  const [isLoadingQuests, setIsLoadingQuests] = useState(true);
  const [questsError, setQuestsError] = useState<string | null>(null);

  const [memberStats, setMemberStats] = useState<MemberStatsData | null>(null);
  const [isLoadingMemberStats, setIsLoadingMemberStats] = useState(true);
  const [memberStatsError, setMemberStatsError] = useState<string | null>(null);

  useEffect(() => {
    // Update immediately on mount to sync with client time
    setCurrentTime(new Date());
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Calculate countdown targets dynamically based on current time
  const countdownTargets = useMemo(() => getCountdownTargets(currentTime), [currentTime]);

  // Fetch Character of the Week data
  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;
    async function fetchCharacterOfWeek() {
      try {
        setIsLoadingCharacter(true);
        setCharacterError(null);
        const response = await fetch("/api/character-of-week", { signal });
        if (signal.aborted) return;
        if (!response.ok) {
          throw new Error("Failed to fetch Character of the Week");
        }
        const data: CharacterOfWeekResponse = await response.json();
        if (signal.aborted) return;
        setCharacterOfWeek(data.characterOfWeek);
        setRotationInfo(data.rotationInfo);
        setCharacterImageError(false);
      } catch (error) {
        if (signal.aborted) return;
        setCharacterError(error instanceof Error ? error.message : "Failed to load Character of the Week");
        console.error("Error fetching Character of the Week:", error);
      } finally {
        if (!signal.aborted) {
          setIsLoadingCharacter(false);
        }
      }
    }
    fetchCharacterOfWeek();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;
    async function fetchWeather() {
      try {
        setIsLoadingWeather(true);
        setWeatherError(null);
        const res = await fetch("/api/weather", { signal, cache: "no-store" });
        if (signal.aborted) return;
        if (!res.ok) throw new Error("Failed to fetch weather");
        const data: { weather: WeatherApiDoc[] } = await res.json();
        if (signal.aborted) return;
        const byVillage = new Map<string, WeatherApiDoc>();
        for (const w of data.weather ?? []) byVillage.set(w.village, w);
        const ordered = WEATHER_VILLAGES_ORDER.map((name) =>
          mapWeatherDocToItem(byVillage.get(name) ?? null, name)
        );
        setWeatherItems(ordered);
      } catch (e) {
        if (signal.aborted) return;
        setWeatherError(e instanceof Error ? e.message : "Failed to load weather");
        setWeatherItems(
          WEATHER_VILLAGES_ORDER.map((name) => mapWeatherDocToItem(null, name))
        );
      } finally {
        if (!signal.aborted) {
          setIsLoadingWeather(false);
        }
      }
    }
    fetchWeather();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;
    async function fetchVillageLevels() {
      try {
        setIsLoadingVillageLevels(true);
        setVillageLevelsError(null);
        const res = await fetch("/api/village-levels", { signal });
        if (signal.aborted) return;
        if (!res.ok) throw new Error("Failed to fetch village levels");
        const data: { villages: (VillageLevelsApiDoc | null)[] } = await res.json();
        if (signal.aborted) return;
        const raw = data.villages ?? [];
        const ordered = VILLAGE_LEVELS_ORDER.map((name, i) =>
          mapVillageDocToItem(raw[i] ?? null, name)
        );
        setVillageLevelItems(ordered);
      } catch (e) {
        if (signal.aborted) return;
        setVillageLevelsError(e instanceof Error ? e.message : "Failed to load village levels");
        setVillageLevelItems(
          VILLAGE_LEVELS_ORDER.map((name) => mapVillageDocToItem(null, name))
        );
      } finally {
        if (!signal.aborted) {
          setIsLoadingVillageLevels(false);
        }
      }
    }
    fetchVillageLevels();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;
    async function fetchMonthlyQuests() {
      try {
        setIsLoadingQuests(true);
        setQuestsError(null);
        const res = await fetch("/api/quests/monthly", { signal });
        if (signal.aborted) return;
        if (!res.ok) throw new Error("Failed to fetch monthly quests");
        const data: { quests: QuestApiDoc[]; month: string | null } = await res.json();
        if (signal.aborted) return;
        const items = (data.quests ?? []).map(mapQuestToMonthlyItem);
        setMonthlyQuestItems(items);
      } catch (e) {
        if (signal.aborted) return;
        setQuestsError(e instanceof Error ? e.message : "Failed to load monthly quests");
        setMonthlyQuestItems([]);
      } finally {
        if (!signal.aborted) {
          setIsLoadingQuests(false);
        }
      }
    }
    fetchMonthlyQuests();
    return () => abortController.abort();
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    const signal = abortController.signal;
    async function fetchMemberStats() {
      try {
        setIsLoadingMemberStats(true);
        setMemberStatsError(null);
        const res = await fetch("/api/member-stats", { signal });
        if (signal.aborted) return;
        if (!res.ok) throw new Error("Failed to fetch member stats");
        const data: MemberStatsData = await res.json();
        if (signal.aborted) return;
        setMemberStats(data);
      } catch (e) {
        if (signal.aborted) return;
        setMemberStatsError(e instanceof Error ? e.message : "Failed to load member stats");
        setMemberStats(null);
      } finally {
        if (!signal.aborted) {
          setIsLoadingMemberStats(false);
        }
      }
    }
    fetchMemberStats();
    return () => abortController.abort();
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden p-4 sm:p-6 md:p-8 lg:p-10">
      <div className="mx-auto max-w-[1400px] space-y-6 sm:space-y-8">
        {authErrorInfo && (
          <AuthErrorBanner
            message={authErrorInfo.message}
            details={authDetails}
            showDetails={authErrorInfo.showDetails}
            onDismiss={dismissAuthError}
          />
        )}
        <SectionHeader as="h1" title="Welcome to Tinglebot" variant="welcome" />

        {/* Member Stats - Compact row below welcome */}
        {isLoadingMemberStats ? (
          <div className="flex items-center justify-center py-2">
            <i className="fa-solid fa-spinner fa-spin text-[var(--totk-light-green)]" />
            <span className="ml-2 text-sm text-[var(--totk-grey-200)]">Loading member stats...</span>
          </div>
        ) : memberStats ? (
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 md:gap-4">
            {/* Village counts */}
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/60 px-2.5 py-1.5 sm:px-3 sm:py-2">
              <span className="text-sm sm:text-base">🔥</span>
              <span className="text-xs font-medium text-[var(--totk-grey-200)] sm:text-sm">Rudania</span>
              <span className="text-sm font-bold text-[var(--village-rudania)] sm:text-base">{memberStats.rudania}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/60 px-2.5 py-1.5 sm:px-3 sm:py-2">
              <span className="text-sm sm:text-base">💧</span>
              <span className="text-xs font-medium text-[var(--totk-grey-200)] sm:text-sm">Inariko</span>
              <span className="text-sm font-bold text-[var(--village-inariko)] sm:text-base">{memberStats.inariko}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/60 px-2.5 py-1.5 sm:px-3 sm:py-2">
              <span className="text-sm sm:text-base">🌱</span>
              <span className="text-xs font-medium text-[var(--totk-grey-200)] sm:text-sm">Vhintl</span>
              <span className="text-sm font-bold text-[var(--village-vhintl)] sm:text-base">{memberStats.vhintl}</span>
            </div>
            {/* Divider */}
            <div className="hidden h-6 w-px bg-[var(--totk-dark-ocher)]/50 sm:block" />
            {/* Status counts */}
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/60 px-2.5 py-1.5 sm:px-3 sm:py-2">
              <span className="text-sm sm:text-base">🗺️</span>
              <span className="text-xs font-medium text-[var(--totk-grey-200)] sm:text-sm">Travelers</span>
              <span className="text-sm font-bold text-[var(--totk-light-green)] sm:text-base">{memberStats.traveler}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/60 px-2.5 py-1.5 sm:px-3 sm:py-2">
              <i className="fa-solid fa-house-user text-xs text-[var(--botw-blue)] sm:text-sm" />
              <span className="text-xs font-medium text-[var(--totk-grey-200)] sm:text-sm">Residents</span>
              <span className="text-sm font-bold text-[var(--botw-blue)] sm:text-base">{memberStats.resident}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/60 px-2.5 py-1.5 sm:px-3 sm:py-2">
              <i className="fa-solid fa-moon text-xs text-[var(--totk-grey-200)] sm:text-sm" />
              <span className="text-xs font-medium text-[var(--totk-grey-200)] sm:text-sm">Inactive</span>
              <span className="text-sm font-bold text-[var(--totk-grey-200)] sm:text-base">{memberStats.inactive}</span>
            </div>
          </div>
        ) : null}

        <Divider />

        {/* Mobile: Countdowns together as full circle, Character separate | Desktop: 3-column layout */}
        <div className="space-y-6 lg:space-y-0">
          {/* Mobile: Countdowns combined as full circle */}
          <div className="flex flex-col items-center gap-0 lg:hidden">
            <SectionHeader title="System Countdown" variant="section" />
            <div className="mt-4 flex flex-row items-center justify-center gap-0">
              {countdownTargets.map((item) => (
                <CountdownCard key={item.label} {...item} currentTime={currentTime} />
              ))}
            </div>
          </div>

          {/* Desktop: 3-column layout */}
          <div className="hidden lg:grid lg:grid-cols-3 lg:gap-6 lg:items-start">
            {/* Left Column: Blood Moon */}
            <div className="flex flex-col items-center lg:items-start">
              <div className="flex-1 w-full flex justify-center lg:justify-end">
                {countdownTargets
                  .filter((item) => item.label === "Blood Moon")
                  .map((item) => (
                    <CountdownCard key={item.label} {...item} currentTime={currentTime} />
                  ))}
              </div>
            </div>

            {/* Middle Column: Character of the Week */}
            <div className="flex flex-col items-center">
              <div className="flex-1 w-full">
              {isLoadingCharacter ? (
                <div className="flex h-[300px] items-center justify-center rounded-2xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] transition-all duration-300 hover:border-[var(--totk-light-green)]/50 hover:shadow-[0_0_20px_rgba(73,213,156,0.2)]">
                  <div className="text-center">
                    <div className="mb-2 text-2xl text-[var(--totk-light-green)]">
                      <i className="fa-solid fa-spinner fa-spin" />
                    </div>
                    <p className="text-sm text-[var(--totk-grey-200)]">Loading Character of the Week...</p>
                  </div>
                </div>
              ) : characterError || !characterOfWeek ? (
                <div className="flex h-[300px] items-center justify-center rounded-2xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] transition-all duration-300 hover:border-[var(--blight-border)]/50 hover:shadow-[0_0_20px_rgba(173,20,87,0.2)]">
                  <div className="text-center">
                    <div className="mb-2 text-2xl text-[var(--blight-border)]">
                      <i className="fa-solid fa-triangle-exclamation" />
                    </div>
                    <p className="text-sm text-[var(--totk-grey-200)]">
                      {characterError || "No Character of the Week found"}
                    </p>
                  </div>
                </div>
              ) : (
                <Link href={`/characters/${createSlug(characterOfWeek.character.name)}`}>
                  <div className="group relative mx-auto flex h-[300px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border-3 bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] p-6 transition-all duration-500 hover:shadow-[0_0_32px_rgba(255,215,0,0.5)] hover:scale-[1.01] shadow-[0_0_20px_rgba(255,215,0,0.3)]" style={{ borderColor: "#FFD700", borderWidth: "3px", boxShadow: "0 0 20px rgba(255,215,0,0.4)" }}>
                    <div className="relative z-10 flex flex-col items-center gap-6">
                      <div className="relative shrink-0">
                        <div className="character-icon-wrapper relative shrink-0 animate-float">
                          <div className="absolute -inset-2 rounded-lg bg-gradient-to-br from-[#FFD700] via-[#DAA520] to-[#FFD700] opacity-40 blur-sm transition-all duration-500 group-hover:opacity-60 group-hover:blur-md" />
                          <div className="relative h-20 w-20 overflow-hidden rounded-lg border-4 border-[#FFD700] shadow-[0_0_24px_rgba(255,215,0,0.4)] transition-all duration-500 group-hover:border-[#FFE55C] group-hover:shadow-[0_0_32px_rgba(255,215,0,0.7)] sm:h-24 sm:w-24">
                            {characterOfWeek.character.icon && !characterImageError ? (
                              <Image
                                alt={characterOfWeek.character.name}
                                className="object-cover transition-transform duration-700 group-hover:scale-110"
                                fill
                                sizes="(max-width: 640px) 80px, 96px"
                                src={characterOfWeek.character.icon}
                                onError={() => setCharacterImageError(true)}
                              />
                            ) : (
                              <Image
                                alt={characterOfWeek.character.name}
                                className="object-cover"
                                fill
                                sizes="(max-width: 640px) 80px, 96px"
                                src="/ankle_icon.png"
                              />
                            )}
                            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-center space-y-3">
                        <div className="flex flex-col items-center">
                          <h4 className="mb-1.5 text-xl font-bold text-[#FFD700] drop-shadow-[0_0_12px_rgba(255,215,0,0.4)] transition-all duration-300 group-hover:text-[#FFE55C] group-hover:drop-shadow-[0_0_16px_rgba(255,215,0,0.6)] sm:text-2xl">
                            {characterOfWeek.character.name}
                          </h4>
                          <div className="h-0.5 w-20 rounded-full bg-gradient-to-r from-transparent via-[#FFD700] to-transparent transition-all duration-300 group-hover:w-24" />
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs sm:text-sm">
                          <div className="flex items-center gap-1.5 text-[var(--botw-pale)]">
                            <i aria-hidden className="fa-solid fa-map-marker-alt text-[10px] text-[var(--totk-light-green)]" />
                            <span className="font-medium">
                              {capitalize(characterOfWeek.character.currentVillage || characterOfWeek.character.homeVillage)}
                            </span>
                          </div>
                          <span className="text-[var(--totk-grey-200)] opacity-40">•</span>
                          <div className="flex items-center gap-1.5 text-[var(--botw-pale)]">
                            <i aria-hidden className="fa-solid fa-briefcase text-[10px] text-[var(--botw-blue)]" />
                            <span className="font-medium">
                              {capitalize(characterOfWeek.character.job)}
                            </span>
                          </div>
                          <span className="text-[var(--totk-grey-200)] opacity-40">•</span>
                          <div className="flex items-center gap-1.5 text-[var(--botw-pale)]">
                            <i aria-hidden className="fa-solid fa-users text-[10px] text-[var(--totk-light-green)]" />
                            <span className="font-medium">
                              {capitalize(characterOfWeek.character.race)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              )}
            </div>
          </div>

            {/* Right Column: Blight Roll Call */}
            <div className="flex flex-col items-center lg:items-start">
              <div className="flex-1 w-full flex justify-center lg:justify-start">
                {countdownTargets
                  .filter((item) => item.label === "Blight Roll Call")
                  .map((item) => (
                    <CountdownCard key={item.label} {...item} currentTime={currentTime} />
                  ))}
              </div>
            </div>
          </div>

          {/* Mobile: Character of the Week */}
          <div className="flex flex-col lg:hidden">
            <div className="flex-1">
              {isLoadingCharacter ? (
                <div className="flex h-[300px] items-center justify-center rounded-2xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] transition-all duration-300 hover:border-[var(--totk-light-green)]/50 hover:shadow-[0_0_20px_rgba(73,213,156,0.2)]">
                  <div className="text-center">
                    <div className="mb-2 text-2xl text-[var(--totk-light-green)]">
                      <i className="fa-solid fa-spinner fa-spin" />
                    </div>
                    <p className="text-sm text-[var(--totk-grey-200)]">Loading Character of the Week...</p>
                  </div>
                </div>
              ) : characterError || !characterOfWeek ? (
                <div className="flex h-[300px] items-center justify-center rounded-2xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] transition-all duration-300 hover:border-[var(--blight-border)]/50 hover:shadow-[0_0_20px_rgba(173,20,87,0.2)]">
                  <div className="text-center">
                    <div className="mb-2 text-2xl text-[var(--blight-border)]">
                      <i className="fa-solid fa-triangle-exclamation" />
                    </div>
                    <p className="text-sm text-[var(--totk-grey-200)]">
                      {characterError || "No Character of the Week found"}
                    </p>
                  </div>
                </div>
              ) : (
                <Link href={`/characters/${createSlug(characterOfWeek.character.name)}`}>
                  <div className="group relative mx-auto flex h-[300px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border-3 bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] p-6 transition-all duration-500 hover:shadow-[0_0_32px_rgba(255,215,0,0.5)] hover:scale-[1.01] shadow-[0_0_20px_rgba(255,215,0,0.3)]" style={{ borderColor: "#FFD700", borderWidth: "3px", boxShadow: "0 0 20px rgba(255,215,0,0.4)" }}>
                    <div className="relative z-10 flex flex-col items-center gap-6">
                      <div className="relative shrink-0">
                        <div className="character-icon-wrapper relative shrink-0 animate-float">
                          <div className="absolute -inset-2 rounded-lg bg-gradient-to-br from-[#FFD700] via-[#DAA520] to-[#FFD700] opacity-40 blur-sm transition-all duration-500 group-hover:opacity-60 group-hover:blur-md" />
                          <div className="relative h-20 w-20 overflow-hidden rounded-lg border-4 border-[#FFD700] shadow-[0_0_24px_rgba(255,215,0,0.4)] transition-all duration-500 group-hover:border-[#FFE55C] group-hover:shadow-[0_0_32px_rgba(255,215,0,0.7)] sm:h-24 sm:w-24">
                            {characterOfWeek.character.icon && !characterImageError ? (
                              <Image
                                alt={characterOfWeek.character.name}
                                className="object-cover transition-transform duration-700 group-hover:scale-110"
                                fill
                                sizes="(max-width: 640px) 80px, 96px"
                                src={characterOfWeek.character.icon}
                                onError={() => setCharacterImageError(true)}
                              />
                            ) : (
                              <Image
                                alt={characterOfWeek.character.name}
                                className="object-cover"
                                fill
                                sizes="(max-width: 640px) 80px, 96px"
                                src="/ankle_icon.png"
                              />
                            )}
                            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-center space-y-3">
                        <div className="flex flex-col items-center">
                          <h4 className="mb-1.5 text-xl font-bold text-[#FFD700] drop-shadow-[0_0_12px_rgba(255,215,0,0.4)] transition-all duration-300 group-hover:text-[#FFE55C] group-hover:drop-shadow-[0_0_16px_rgba(255,215,0,0.6)] sm:text-2xl">
                            {characterOfWeek.character.name}
                          </h4>
                          <div className="h-0.5 w-20 rounded-full bg-gradient-to-r from-transparent via-[#FFD700] to-transparent transition-all duration-300 group-hover:w-24" />
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-2.5 text-xs sm:text-sm">
                          <div className="flex items-center gap-1.5 text-[var(--botw-pale)]">
                            <i aria-hidden className="fa-solid fa-map-marker-alt text-[10px] text-[var(--totk-light-green)]" />
                            <span className="font-medium">
                              {capitalize(characterOfWeek.character.currentVillage || characterOfWeek.character.homeVillage)}
                            </span>
                          </div>
                          <span className="text-[var(--totk-grey-200)] opacity-40">•</span>
                          <div className="flex items-center gap-1.5 text-[var(--botw-pale)]">
                            <i aria-hidden className="fa-solid fa-briefcase text-[10px] text-[var(--botw-blue)]" />
                            <span className="font-medium">
                              {capitalize(characterOfWeek.character.job)}
                            </span>
                          </div>
                          <span className="text-[var(--totk-grey-200)] opacity-40">•</span>
                          <div className="flex items-center gap-1.5 text-[var(--botw-pale)]">
                            <i aria-hidden className="fa-solid fa-users text-[10px] text-[var(--totk-light-green)]" />
                            <span className="font-medium">
                              {capitalize(characterOfWeek.character.race)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              )}
            </div>
          </div>
        </div>

        <Divider />

        <div>
          <SectionHeader title="Today's Weather" variant="section" />
          {weatherError && (
            <p className="mb-3 text-center text-sm text-[var(--blight-border)]">
              {weatherError}
            </p>
          )}
          {isLoadingWeather ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-2xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] transition-all duration-300">
              <div className="text-center">
                <div className="mb-2 text-2xl text-[var(--totk-light-green)]">
                  <i className="fa-solid fa-spinner fa-spin" />
                </div>
                <p className="text-sm text-[var(--totk-grey-200)]">Loading weather…</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {weatherItems.map((v) => (
                <WeatherCard key={v.name} {...v} />
              ))}
            </div>
          )}
        </div>

        <Divider />

        <div>
          <SectionHeader title="Village Levels" variant="section" />
          {villageLevelsError && (
            <p className="mb-3 text-center text-sm text-[var(--blight-border)]">
              {villageLevelsError}
            </p>
          )}
          {isLoadingVillageLevels ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-2xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] transition-all duration-300">
              <div className="text-center">
                <div className="mb-2 text-2xl text-[var(--totk-light-green)]">
                  <i className="fa-solid fa-spinner fa-spin" />
                </div>
                <p className="text-sm text-[var(--totk-grey-200)]">Loading village levels…</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {villageLevelItems.map((v) => (
                <VillageLevelCard key={v.name} {...v} />
              ))}
            </div>
          )}
        </div>

        <Divider />

        <div>
          <SectionHeader title="Monthly Quests" variant="section" />
          {questsError && (
            <p className="mb-3 text-center text-sm text-[var(--blight-border)]">
              {questsError}
            </p>
          )}
          {isLoadingQuests ? (
            <div className="flex min-h-[200px] items-center justify-center rounded-2xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)] transition-all duration-300">
              <div className="text-center">
                <div className="mb-2 text-2xl text-[var(--totk-light-green)]">
                  <i className="fa-solid fa-spinner fa-spin" />
                </div>
                <p className="text-sm text-[var(--totk-grey-200)]">Loading monthly quests…</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {monthlyQuestItems.map((q) => (
                <QuestCard key={q.id ?? q.name} {...q} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
