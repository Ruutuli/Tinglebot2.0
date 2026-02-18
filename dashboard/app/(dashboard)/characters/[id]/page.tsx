"use client";

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================
// [page.tsx]✨ External dependencies and internal imports -

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import { Loading } from "@/components/ui";
import { useSession } from "@/hooks/use-session";
import { capitalize, createSlug } from "@/lib/string-utils";
import { RELATIONSHIP_CONFIG, type RelationshipType } from "@/data/relationshipConfig";
import {
  type Character,
  type GearItem,
  formatHeight,
  formatGearName,
  formatGearStats,
  getVillageBorderClass,
  getVillageBorderStyle,
  getVillageTextStyle,
  getVillageCrestIcon,
  VILLAGE_COLORS,
  MOD_CHARACTER_GOLD,
} from "@/app/(dashboard)/models/characters/page";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================
// [page.tsx]🧷 Character detail type definition -

type CharacterDetail = Character & {
  personality?: string;
  history?: string;
  extras?: string;
  appArt?: string;
  virtue?: string;
  spiritOrbs?: number;
  vendingPoints?: number;
  vendorType?: string;
  shopPouch?: string;
  pouchSize?: number;
  shopLink?: string;
  shopImage?: string;
  jobDateChanged?: Date | string | null;
  lastStaminaUsage?: Date | string | null;
  lastSpecialWeatherGather?: Date | string | null;
  blightedAt?: Date | string | null;
  blightPaused?: boolean;
  blightPauseInfo?: {
    pausedAt?: Date | string | null;
    pausedBy?: string | null;
    pausedByUsername?: string | null;
    reason?: string | null;
  };
  blightEffects?: {
    rollMultiplier?: number;
    noMonsters?: boolean;
    noGathering?: boolean;
  };
  lastRollDate?: Date | string | null;
  deathDeadline?: Date | string | null;
  debuff?: {
    active?: boolean;
    endDate?: Date | string | null;
  };
  buff?: {
    active?: boolean;
    type?: string | null;
    effects?: {
      blightResistance?: number;
      electricResistance?: number;
      staminaBoost?: number;
      staminaRecovery?: number;
      fireResistance?: number;
      speedBoost?: number;
      extraHearts?: number;
      attackBoost?: number;
      stealthBoost?: number;
      coldResistance?: number;
      defenseBoost?: number;
    };
  };
  jailReleaseTime?: Date | string | null;
  jailStartTime?: Date | string | null;
  jailDurationMs?: number | null;
  stealProtection?: {
    isProtected?: boolean;
    protectionEndTime?: Date | string | null;
  };
  helpWanted?: {
    lastCompletion?: string | null;
    cooldownUntil?: Date | string | null;
    completions?: Array<{
      date?: string;
      village?: string;
      questType?: string;
    }>;
  };
  travelLog?: Array<{
    from?: string;
    to?: string;
    date?: Date | string;
    success?: boolean;
  }>;
  submittedAt?: Date | string | null;
  decidedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  applicationFeedback?: Array<{
    modId?: string;
    modUsername?: string;
    text?: string;
    createdAt?: Date | string;
  }>;
  boostedBy?: string | null;
  currentActivePet?: {
    _id?: string;
    name?: string;
    species?: string;
    petType?: string;
    level?: number;
    status?: string;
    imageUrl?: string;
    rollsRemaining?: number;
    rollCombination?: string[];
    tableDescription?: string;
    lastRollDate?: Date | string | null;
  } | null;
  currentActiveMount?: {
    _id?: string;
    name?: string;
    species?: string;
    mountType?: string;
    level?: number;
    status?: string;
    imageUrl?: string;
  } | null;
};

type CharacterRef = {
  _id: string;
  name: string;
  race?: string;
  job?: string;
  currentVillage?: string;
  homeVillage?: string;
  icon?: string;
};

type Relationship = {
  _id: string;
  userId: string;
  characterId: CharacterRef | string;
  targetCharacterId: CharacterRef | string;
  characterName: string;
  targetCharacterName: string;
  relationshipTypes: RelationshipType[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================
// [page.tsx]✨ Shared configuration and reusable values -

type MarkdownComponentProps = {
  children?: ReactNode;
  href?: string;
};

/**
 * Convert plain URLs in text to markdown links and fix malformed links.
 * Fixes "Label](URL)" (missing opening bracket) -> "[Label](URL)"
 */
function convertUrlsToMarkdown(text: string): string {
  let result = text;
  // Fix malformed links: "Link Text](URL)" -> "[Link Text](URL)" (missing opening [)
  // Use negative lookbehind to avoid doubling already-correct links
  result = result.replace(
    /(?<!\[)([^\n\[]+)\]\((https?:\/\/[^\s\)]+)\)/g,
    (_, label, url) => `[${label}](${url})`
  );
  // Convert plain bare URLs to markdown links (skip URLs already inside ](url) )
  const urlRegex = /(?<!\]\()(https?:\/\/[^\s\]\)]+)/g;
  result = result.replace(urlRegex, (url) => `[${url}](${url})`);
  return result;
}

const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }: MarkdownComponentProps) => (
    <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>
  ),
  h1: ({ children }: MarkdownComponentProps) => (
    <h1 className="text-xl font-bold text-[var(--totk-light-green)] mb-3 mt-6 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }: MarkdownComponentProps) => (
    <h2 className="text-lg font-bold text-[var(--totk-light-green)] mb-3 mt-5 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }: MarkdownComponentProps) => (
    <h3 className="text-base font-bold text-[var(--totk-light-green)] mb-2 mt-4 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }: MarkdownComponentProps) => (
    <h4 className="text-sm font-bold text-[var(--totk-light-green)] mb-2 mt-3 first:mt-0">
      {children}
    </h4>
  ),
  ul: ({ children }: MarkdownComponentProps) => (
    <ul className="list-disc pl-5 mb-4 space-y-2 [&>li]:leading-relaxed">{children}</ul>
  ),
  ol: ({ children }: MarkdownComponentProps) => (
    <ol className="list-decimal pl-5 mb-4 space-y-2 [&>li]:leading-relaxed">{children}</ol>
  ),
  li: ({ children }: MarkdownComponentProps) => (
    <li className="pl-1">{children}</li>
  ),
  strong: ({ children }: MarkdownComponentProps) => (
    <strong className="font-bold text-[var(--totk-light-green)]">{children}</strong>
  ),
  em: ({ children }: MarkdownComponentProps) => (
    <em className="italic">{children}</em>
  ),
  code: ({ children }: MarkdownComponentProps) => (
    <code className="bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] px-1 py-0.5 rounded text-xs font-mono">
      {children}
    </code>
  ),
  pre: ({ children }: MarkdownComponentProps) => (
    <pre className="bg-[var(--botw-warm-black)] p-3 rounded mb-3 max-w-full overflow-hidden [&>code]:block [&>code]:whitespace-pre-wrap [&>code]:break-words [&>code]:px-0 [&>code]:py-0 [&>code]:bg-transparent">
      {children}
    </pre>
  ),
  blockquote: ({ children }: MarkdownComponentProps) => (
    <blockquote className="border-l-4 border-[var(--totk-green)] pl-4 my-4 italic text-[var(--totk-grey-200)]">
      {children}
    </blockquote>
  ),
  a: ({ children, href }: MarkdownComponentProps) => (
    <a
      href={href}
      className="text-[var(--botw-blue)] underline hover:text-[var(--totk-light-green)]"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="border-[var(--totk-green)] my-6" />,
};

const GEAR_ITEMS_CONFIG = [
  { key: "weapon", label: "Weapon", icon: "fa-hand-fist" },
  { key: "shield", label: "Shield", icon: "fa-shield" },
  { key: "head", label: "Head Armor", icon: "fa-hat-wizard" },
  { key: "chest", label: "Chest Armor", icon: "fa-vest" },
  { key: "legs", label: "Legs Armor", icon: "fa-socks" },
] as const;

const PROSE_BASE_CLASSES =
  "prose prose-invert prose-sm max-w-none rounded-lg border border-[var(--totk-green)] bg-[var(--totk-ocher)]/10 p-4 sm:p-5 text-sm leading-relaxed text-[var(--botw-pale)] prose-headings:text-[var(--totk-light-green)] prose-headings:font-bold prose-p:mb-4 prose-p:last:mb-0 prose-p:leading-relaxed prose-ul:my-4 prose-ol:my-4 prose-li:my-1 prose-a:text-[var(--botw-blue)] prose-a:underline hover:prose-a:text-[var(--totk-light-green)] prose-strong:text-[var(--totk-light-green)] prose-code:text-[var(--totk-light-green)] prose-code:bg-[var(--botw-warm-black)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-[var(--botw-warm-black)] prose-blockquote:border-[var(--totk-green)] prose-blockquote:pl-4 prose-blockquote:italic prose-hr:border-[var(--totk-green)] prose-hr:my-6";

const CARD_BASE_CLASSES =
  "rounded-lg border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] p-4 sm:p-6 shadow-lg";

const INFO_FIELD_VALUE_CLASSES =
  "rounded border border-[var(--totk-green)] bg-[var(--totk-ocher)]/10 px-3 py-2 text-sm text-[var(--botw-pale)]";

const BUTTON_PRIMARY_CLASSES =
  "rounded-md bg-[var(--totk-light-green)] px-4 py-2 text-sm font-medium text-[var(--botw-warm-black)] shadow-sm transition-all hover:bg-[var(--totk-light-green)] hover:shadow-[0_0_12px_rgba(73,213,156,0.5)] hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed";

const BUTTON_SECONDARY_CLASSES =
  "rounded-md bg-[var(--botw-blue)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[var(--botw-blue)]/90 hover:shadow-md";

const BUTTON_TERTIARY_CLASSES =
  "rounded-md bg-[var(--totk-mid-ocher)] px-4 py-2 text-sm font-medium text-[var(--totk-ivory)] shadow-sm transition-all hover:bg-[var(--totk-dark-ocher)] hover:shadow-md";

/* ============================================================================ */
/* ------------------- Utils ------------------- */
/* ============================================================================ */
/* [page.tsx]🧠 Utility functions for data transformation and formatting - */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

function rgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getModCharacterGoldStyle(isHover: boolean) {
  if (isHover) {
    return {
      border: "2px solid #FFD700",
      boxShadow:
        "0 8px 24px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(255, 215, 0, 0.4), 0 0 20px rgba(255, 215, 0, 0.8), inset 0 0 12px rgba(255, 215, 0, 0.3)",
    };
  }
  return {
    border: "2px solid rgba(255, 215, 0, 0.8)",
    boxShadow:
      "0 4px 16px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 12px rgba(255, 215, 0, 0.6), inset 0 0 8px rgba(255, 215, 0, 0.2)",
  };
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "Not set";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Invalid date";
  }
}

function formatTimeRemaining(date: Date | string | null | undefined): string {
  if (!date) return "";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    const now = new Date();
    const diff = d.getTime() - now.getTime();

    if (diff <= 0) return "Expired";

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  } catch {
    return "";
  }
}

function handleImageError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
  (e.target as HTMLImageElement).src = "/ankle_icon.png";
}

function getStatsGridClass(hasSpiritOrbs: boolean): string {
  return hasSpiritOrbs
    ? "grid-cols-2 sm:grid-cols-5"
    : "grid-cols-2 sm:grid-cols-4";
}

function getGearByKey(
  character: CharacterDetail,
  key: string
): GearItem | null | undefined {
  switch (key) {
    case "weapon":
      return character.gearWeapon;
    case "shield":
      return character.gearShield;
    case "head":
      return character.gearArmor?.head;
    case "chest":
      return character.gearArmor?.chest;
    case "legs":
      return character.gearArmor?.legs;
    default:
      return null;
  }
}

/* [page.tsx]🧠 Format roll combination type to readable label - */
function formatRollType(rollType: string | null | undefined): string {
  const rollTypeMap: Record<string, string> = {
    petprey: "Prey",
    petforage: "Forage",
    petmon: "Monster",
    petexplore: "Explore",
  };
  if (!rollType || typeof rollType !== "string") return "Unknown";
  const normalized = rollType.toLowerCase();
  return rollTypeMap[normalized] || capitalize(rollType.replace(/^pet/, ""));
}

/* [page.tsx]🧠 Get quest type styling (icon, color, label) - */
function getQuestTypeConfig(questType: string | undefined | null): {
  icon: string;
  color: string;
  textColor: string;
  bgColor: string;
  borderColor: string;
  label: string;
} {
  const normalized = questType?.toLowerCase() || "unknown";
  
  switch (normalized) {
    case "item":
      return {
        icon: "fa-box",
        color: "#4A90E2",
        textColor: "text-[#6BB3FF]",
        bgColor: "bg-[#4A90E2]/25",
        borderColor: "border-[#4A90E2]",
        label: "Item",
      };
    case "crafting":
      return {
        icon: "fa-hammer",
        color: "#E67E22",
        textColor: "text-[#FF9A4D]",
        bgColor: "bg-[#E67E22]/25",
        borderColor: "border-[#E67E22]",
        label: "Crafting",
      };
    case "monster":
      return {
        icon: "fa-skull",
        color: "#E74C3C",
        textColor: "text-[#FF6B5C]",
        bgColor: "bg-[#E74C3C]/25",
        borderColor: "border-[#E74C3C]",
        label: "Monster",
      };
    case "escort":
      return {
        icon: "fa-people-group",
        color: "#9B59B6",
        textColor: "text-[#B87ED8]",
        bgColor: "bg-[#9B59B6]/25",
        borderColor: "border-[#9B59B6]",
        label: "Escort",
      };
    case "art":
      return {
        icon: "fa-palette",
        color: "#E91E63",
        textColor: "text-[#FF4D8A]",
        bgColor: "bg-[#E91E63]/25",
        borderColor: "border-[#E91E63]",
        label: "Art",
      };
    case "writing":
      return {
        icon: "fa-feather",
        color: "#00BCD4",
        textColor: "text-[#4DD0E1]",
        bgColor: "bg-[#00BCD4]/25",
        borderColor: "border-[#00BCD4]",
        label: "Writing",
      };
    default:
      return {
        icon: "fa-question",
        color: "var(--totk-grey-200)",
        textColor: "text-[var(--totk-light-green)]",
        bgColor: "bg-[var(--totk-grey-200)]/20",
        borderColor: "border-[var(--totk-grey-200)]",
        label: capitalize(questType || "Unknown"),
      };
  }
}

/* [page.tsx]🧠 Extract modifierHearts from gear stats - */
function getModifierHearts(
  stats: Record<string, number> | Map<string, number> | undefined | null
): number {
  if (!stats) return 0;
  
  // Handle Map objects
  if (stats instanceof Map) {
    const value = stats.get("modifierHearts");
    return typeof value === "number" ? value : 0;
  }
  
  // Handle plain objects
  if (typeof stats === "object" && stats !== null) {
    // Check if modifierHearts exists as a property
    if ("modifierHearts" in stats) {
      const value = (stats as Record<string, unknown>).modifierHearts;
      return typeof value === "number" ? value : 0;
    }
    
    // Also check for any numeric value that might represent modifierHearts
    // This handles cases where the structure might be different
    const entries = Object.entries(stats);
    for (const [key, value] of entries) {
      if (key.toLowerCase().includes("modifier") && typeof value === "number") {
        return value;
      }
    }
  }
  
  return 0;
}

/* [page.tsx]🧠 Calculate attack from weapon - */
function calculateAttack(
  character: CharacterDetail,
  gearModifierHearts?: Record<string, number>
): number {
  // Try to get modifierHearts from gearModifierHearts first (more reliable)
  if (gearModifierHearts && character.gearWeapon?.name) {
    const weaponName = character.gearWeapon.name;
    // Try exact match first
    if (gearModifierHearts[weaponName] != null) {
      return gearModifierHearts[weaponName];
    }
    // Try case-insensitive match
    const matchedKey = Object.keys(gearModifierHearts).find(
      (key) => key.toLowerCase() === weaponName.toLowerCase()
    );
    if (matchedKey) {
      return gearModifierHearts[matchedKey];
    }
  }
  // Fallback to reading from stats
  return getModifierHearts(character.gearWeapon?.stats);
}

/* [page.tsx]🧠 Calculate defense from armor and shield - */
function calculateDefense(
  character: CharacterDetail,
  gearModifierHearts?: Record<string, number>
): number {
  let totalDefense = 0;
  
  // Try to get modifierHearts from gearModifierHearts first (more reliable)
  if (gearModifierHearts) {
    if (character.gearArmor?.head?.name) {
      totalDefense += gearModifierHearts[character.gearArmor.head.name] || 0;
    }
    if (character.gearArmor?.chest?.name) {
      totalDefense += gearModifierHearts[character.gearArmor.chest.name] || 0;
    }
    if (character.gearArmor?.legs?.name) {
      totalDefense += gearModifierHearts[character.gearArmor.legs.name] || 0;
    }
    if (character.gearShield?.name) {
      totalDefense += gearModifierHearts[character.gearShield.name] || 0;
    }
  } else {
    // Fallback to reading from stats
    totalDefense += getModifierHearts(character.gearArmor?.head?.stats);
    totalDefense += getModifierHearts(character.gearArmor?.chest?.stats);
    totalDefense += getModifierHearts(character.gearArmor?.legs?.stats);
    totalDefense += getModifierHearts(character.gearShield?.stats);
  }
  
  return totalDefense;
}

function getSubmitButtonText(
  submitting: boolean,
  status: string | null | undefined
): string {
  if (submitting) return "Submitting...";
  if (status === null || status === undefined) return "Submit for Review";
  return "Resubmit";
}

function canSubmitCharacter(status: string | null | undefined): boolean {
  return status === null || status === undefined || status === "needs_changes";
}

function getVillageBorderImages(
  village: string | null | undefined
): { top: string; bottom: string } {
  const villageLower = String(village ?? "").toLowerCase();
  if (villageLower === "rudania") {
    return {
      top: "/assets/BOTW Sheikah Borders/ROTW_border_red_top.png",
      bottom: "/assets/BOTW Sheikah Borders/ROTW_border_red_bottom.png",
    };
  }
  if (villageLower === "inariko") {
    return {
      top: "/assets/BOTW Sheikah Borders/ROTW_border_blue_top.png",
      bottom: "/assets/BOTW Sheikah Borders/ROTW_border_blue_bottom.png",
    };
  }
  if (villageLower === "vhintl") {
    return {
      top: "/assets/BOTW Sheikah Borders/ROTW_border_green_top.png",
      bottom: "/assets/BOTW Sheikah Borders/ROTW_border_green_bottom.png",
    };
  }
  // Default to cyan if village doesn't match
  return {
    top: "/assets/BOTW Sheikah Borders/ROTW_border_cyan_top.png",
    bottom: "/assets/BOTW Sheikah Borders/ROTW_border_cyan_bottom.png",
  };
}

/* ============================================================================ */
/* ------------------- Subcomponents ------------------- */
/* ============================================================================ */
/* [page.tsx]🧩 Reusable UI components - */

interface InfoFieldProps {
  icon: string;
  label: string;
  value: React.ReactNode;
  villageStyle?: React.CSSProperties;
}

function InfoField({ icon, label, value, villageStyle }: InfoFieldProps) {
  return (
    <div>
      <span className="mb-1 flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-medium text-[var(--totk-grey-200)]">
        <i className={`fa-solid ${icon} text-[var(--totk-light-green)] text-[10px] sm:text-xs`} />
        {label}
      </span>
      <div
        className={villageStyle ? "rounded border bg-[var(--totk-ocher)]/10 px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm font-medium" : INFO_FIELD_VALUE_CLASSES}
        style={villageStyle}
      >
        {value}
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  type: "mod" | "blighted" | "ko" | "jail";
}

function StatusBadge({ type }: StatusBadgeProps) {
  const configs = {
    mod: {
      icon: "fa-star",
      text: "Mod Character",
      classes:
        "border-[#FFD700]/60 bg-[#FFD700]/20 text-[#FFD700]",
    },
    blighted: {
      icon: "fa-skull",
      text: "Blighted",
      classes:
        "border-[var(--blight-border)]/60 bg-[var(--blight-border)]/20 text-[var(--blight-border)]",
    },
    ko: {
      icon: "fa-bed",
      text: "KO'd",
      classes:
        "border-[var(--totk-grey-300)]/60 bg-[var(--totk-grey-400)]/20 text-[var(--totk-grey-100)]",
    },
    jail: {
      icon: "fa-lock",
      text: "In Jail",
      classes:
        "border-[var(--botw-dark-blue)]/60 bg-[var(--botw-dark-blue)]/20 text-[var(--botw-blue)]",
    },
  };

  const config = configs[type];

  return (
    <span
      className={`rounded-full border px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs font-bold shadow-md ${config.classes}`}
    >
      <i className={`fa-solid ${config.icon} mr-1 sm:mr-1.5 text-[10px] sm:text-xs`} aria-hidden="true" />
      {config.text}
    </span>
  );
}

function RelationshipTypeBadge({ type }: { type: RelationshipType }) {
  const config = RELATIONSHIP_CONFIG[type];
  return (
    <span
      className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-semibold shadow-sm"
      style={{
        color: config.color,
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
      }}
    >
      <i className={`fa-solid ${config.icon} mr-1`} aria-hidden="true" />
      {config.label}
    </span>
  );
}

const normalizeImageUrl = (imageUrl: string | undefined): string => {
  if (!imageUrl) return "/ankle_icon.png";
  if (imageUrl.startsWith("https://storage.googleapis.com/tinglebot/")) {
    return `/api/images/${imageUrl.replace("https://storage.googleapis.com/tinglebot/", "")}`;
  }
  return imageUrl;
};

const getCharacter = (char: CharacterRef | string): CharacterRef | null => {
  if (typeof char === "string") return null;
  return char;
};

const getCharacterId = (char: CharacterRef | string | null | undefined): string | null => {
  if (!char) return null;
  if (typeof char === "string") return char;
  if (typeof char === "object" && char !== null && "_id" in char) {
    return typeof char._id === "string" ? char._id : String(char._id);
  }
  return null;
};

const getPrimaryRelationshipConfig = (types: RelationshipType[]) => {
  if (types.length === 0) return RELATIONSHIP_CONFIG.NEUTRAL;
  return RELATIONSHIP_CONFIG[types[0]];
};

interface CardSectionProps {
  icon: string;
  title: string;
  children: React.ReactNode;
  titleColor?: string;
}

function CardSection({
  icon,
  title,
  children,
  titleColor = "text-[var(--totk-light-green)]",
}: CardSectionProps) {
  return (
    <div className={CARD_BASE_CLASSES}>
      <h2
        className={`mb-3 sm:mb-4 flex items-center gap-2 border-b border-[var(--totk-green)] pb-2 text-base sm:text-lg font-bold ${titleColor}`}
      >
        <i className={`fa-solid ${icon} text-sm sm:text-base`} />
        {title}
      </h2>
      {children}
    </div>
  );
}

interface GearItemDisplayProps {
  gear: { name?: string | null; stats?: Record<string, number> } | null | undefined;
  gearImages: Record<string, string>;
  gearModifierHearts: Record<string, number>;
  label: string;
  icon: string;
}

function GearItemDisplay({
  gear,
  gearImages,
  gearModifierHearts,
  label,
  icon,
}: GearItemDisplayProps) {
  const gearName = gear?.name;
  const gearImage = gearName ? gearImages[gearName] : null;
  const modifierHearts = gearName ? gearModifierHearts[gearName] : null;

  return (
    <div className="flex items-center gap-2 sm:gap-3 rounded-lg border border-[var(--totk-green)] bg-[var(--totk-ocher)]/10 p-2 sm:p-3">
      {gearImage && (
        <div className="flex-shrink-0">
          <img
            src={gearImage}
            alt={gearName || label}
            className="h-6 w-6 sm:h-8 sm:w-8 rounded object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-medium text-[var(--totk-grey-200)]">
          <i className={`fa-solid ${icon} text-[var(--totk-light-green)] text-[10px] sm:text-xs`} />
          {label}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="text-xs sm:text-sm font-medium text-[var(--botw-pale)] truncate">
            {formatGearName(gear as GearItem | null | undefined)}
          </div>
          {modifierHearts != null && modifierHearts !== 0 && (
            <span className="text-[10px] sm:text-xs font-medium text-[var(--totk-light-green)] whitespace-nowrap">
              +{modifierHearts}
            </span>
          )}
        </div>
        {formatGearStats(gear as GearItem | null | undefined) && (
          <div className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs text-[var(--totk-grey-200)]">
            {formatGearStats(gear as GearItem | null | undefined)}
          </div>
        )}
      </div>
    </div>
  );
}

interface BiographySectionProps {
  personality?: string;
  history?: string;
  extras?: string;
}

function BiographySection({
  personality,
  history,
  extras,
}: BiographySectionProps) {
  if (!personality && !history && !extras) return null;

  const markdownOpts = { components: MARKDOWN_COMPONENTS, remarkPlugins: [remarkBreaks] };

  return (
    <CardSection icon="fa-scroll" title="Biography">
      <div className="space-y-6">
        {personality && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--totk-light-green)]">
              <i className="fa-solid fa-brain" />
              Personality
            </h3>
            <div className={PROSE_BASE_CLASSES}>
              <ReactMarkdown {...markdownOpts}>
                {convertUrlsToMarkdown(personality)}
              </ReactMarkdown>
            </div>
          </div>
        )}
        {history && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--totk-light-green)]">
              <i className="fa-solid fa-book" />
              History
            </h3>
            <div className={PROSE_BASE_CLASSES}>
              <ReactMarkdown {...markdownOpts}>
                {convertUrlsToMarkdown(history)}
              </ReactMarkdown>
            </div>
          </div>
        )}
        {extras && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--totk-light-green)]">
              <i className="fa-solid fa-plus-circle" />
              Additional Information
            </h3>
            <div className={PROSE_BASE_CLASSES}>
              <ReactMarkdown {...markdownOpts}>
                {convertUrlsToMarkdown(extras)}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </CardSection>
  );
}

interface StatCardProps {
  icon: string;
  label: string;
  value: React.ReactNode;
  borderColor: string;
  iconColor: string;
  shadowColor: string;
}

function StatCard({ icon, label, value, borderColor, iconColor, shadowColor }: StatCardProps) {
  return (
    <div className={`flex flex-col items-center gap-1.5 sm:gap-2 rounded-lg border-2 ${borderColor} bg-[var(--totk-ocher)]/10 p-2 sm:p-4`}>
      <i
        className={`fa-solid ${icon} text-xl sm:text-2xl ${iconColor}`}
        style={{ filter: `drop-shadow(0 0 8px ${shadowColor})` }}
        aria-hidden="true"
      />
      <div className="text-center">
        <div className="text-[10px] sm:text-xs font-medium text-[var(--totk-grey-200)]">
          {label}
        </div>
        <div
          className={`text-base sm:text-lg font-bold ${iconColor}`}
          style={{ filter: `drop-shadow(0 0 4px ${shadowColor})` }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

interface CompanionDisplayProps {
  type: "pet" | "mount";
  companion: CharacterDetail["currentActivePet"] | CharacterDetail["currentActiveMount"];
}

function CompanionDisplay({ type, companion }: CompanionDisplayProps) {
  if (!companion) return null;

  const isPet = type === "pet";
  const title = isPet ? "Pet" : "Mount";
  const speciesIcon = isPet ? "fa-paw" : "fa-horse";
  const typeKey = isPet ? "petType" : "mountType";
  const companionType = companion[typeKey as keyof typeof companion] as string | undefined;
  
  const petCompanion = isPet ? companion as CharacterDetail["currentActivePet"] : null;
  const hasRollsInfo = isPet && petCompanion && (
    petCompanion.rollsRemaining != null || 
    petCompanion.rollCombination?.length
  );

  return (
    <div className="rounded-lg border border-[var(--totk-green)] bg-[var(--totk-ocher)]/10 p-3 sm:p-4">
      <div className="flex items-start gap-3 sm:gap-4">
        {companion.imageUrl ? (
          <img
            src={companion.imageUrl}
            alt={companion.name || title}
            className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 rounded-lg object-cover flex-shrink-0 border-2 border-[var(--totk-green)]/30"
            onError={handleImageError}
          />
        ) : (
          <img
            src="/ankle_icon.png"
            alt={companion.name || title}
            className="h-16 w-16 sm:h-20 sm:w-20 md:h-24 md:w-24 rounded-lg object-cover flex-shrink-0 border-2 border-[var(--totk-green)]/30"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap mb-1.5">
            <h3 className="text-sm sm:text-base font-bold text-[var(--totk-light-green)]">
              {title}
            </h3>
            {companionType && (
              <span className="rounded-md bg-[var(--botw-blue)]/20 border border-[var(--botw-blue)]/40 px-2 py-0.5 sm:px-2.5 text-[10px] sm:text-xs font-semibold text-[var(--botw-blue)]">
                <i className="fa-solid fa-tag mr-1" aria-hidden="true" />
                {capitalize(companionType)}
              </span>
            )}
            {companion.status && (
              <span className="rounded-full bg-[var(--totk-green)]/20 px-1.5 py-0.5 sm:px-2 text-[10px] sm:text-xs text-[var(--totk-light-green)]">
                {capitalize(companion.status)}
              </span>
            )}
          </div>
          <div className="text-sm sm:text-base font-semibold text-[var(--botw-pale)] mb-2 truncate">
            {companion.name}
          </div>
          <div className={`flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] sm:text-xs text-[var(--totk-grey-200)] ${hasRollsInfo ? 'mb-2' : ''}`}>
            {companion.species && (
              <div className="flex items-center gap-1">
                <i className={`fa-solid ${speciesIcon} text-[var(--totk-light-green)]`} aria-hidden="true" />
                <span className="font-medium">Species:</span>
                <span>{capitalize(companion.species)}</span>
              </div>
            )}
            {companion.level != null && (
              <div className="flex items-center gap-1">
                <i className="fa-solid fa-star text-[var(--totk-light-green)]" aria-hidden="true" />
                <span className="font-medium">Level:</span>
                <span>{typeof companion.level === 'string' ? capitalize(companion.level) : String(companion.level)}</span>
              </div>
            )}
          </div>
          {/* Rolls Information - Pet only */}
          {hasRollsInfo && petCompanion && (
            <div className="mt-2 pt-2 border-t border-[var(--totk-green)]/20">
              {petCompanion.rollsRemaining != null && (
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold text-[var(--totk-light-green)]">
                    <i className="fa-solid fa-dice text-[var(--totk-light-green)]" aria-hidden="true" />
                    Rolls Remaining:
                  </span>
                  <span className="rounded-md bg-[var(--totk-light-green)]/20 border border-[var(--totk-light-green)]/40 px-2 py-0.5 text-[10px] sm:text-xs font-bold text-[var(--totk-light-green)]">
                    {petCompanion.rollsRemaining}
                  </span>
                </div>
              )}
              {petCompanion.rollCombination && petCompanion.rollCombination.length > 0 && (
                <div className="mb-2">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] sm:text-xs font-semibold text-[var(--totk-grey-200)]">
                    <i className="fa-solid fa-list text-[var(--totk-light-green)]" aria-hidden="true" />
                    Roll Types:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {petCompanion.rollCombination.map((rollType) => (
                      <span
                        key={rollType}
                        className="rounded-md bg-[var(--totk-mid-ocher)]/30 border border-[var(--totk-mid-ocher)]/50 px-2 py-0.5 text-[10px] sm:text-xs font-medium text-[var(--totk-ivory)]"
                      >
                        {formatRollType(rollType)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {petCompanion.lastRollDate && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] sm:text-xs text-[var(--totk-grey-200)]">
                  <i className="fa-solid fa-clock text-[var(--totk-light-green)]" aria-hidden="true" />
                  <span className="font-medium">Last Roll:</span>
                  <span>{formatDate(petCompanion.lastRollDate)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */
/* [page.tsx]🧱 Character detail page component - */

export default function OCDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading: sessionLoading } = useSession();
  const savedParam = searchParams.get("saved") === "1";
  const [savedBannerVisible, setSavedBannerVisible] = useState(false);
  const showSavedBanner = savedParam || savedBannerVisible;
  const [character, setCharacter] = useState<CharacterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gearImages, setGearImages] = useState<Record<string, string>>({});
  const [gearModifierHearts, setGearModifierHearts] = useState<
    Record<string, number>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const submitSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [relationships, setRelationships] = useState<{ outgoing: Relationship[]; incoming: Relationship[] }>({
    outgoing: [],
    incoming: [],
  });
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [relationshipsError, setRelationshipsError] = useState<string | null>(null);

  const characterId = typeof params.id === "string" ? params.id : null;

  // When landing with ?saved=1, show banner, clean URL, and keep banner visible for a few seconds
  useEffect(() => {
    if (!savedParam) return;
    setSavedBannerVisible(true);
    const next = new URLSearchParams(searchParams.toString());
    next.delete("saved");
    const q = next.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    const t = setTimeout(() => setSavedBannerVisible(false), 5000);
    return () => clearTimeout(t);
  }, [savedParam, pathname, router, searchParams]);

  const fetchCharacter = useCallback(async () => {
    if (!characterId) {
      setError("Character ID is required");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      console.log("[OCDetailPage] Fetching character (callback):", {
        characterId,
        params,
        pathname,
      });
      const res = await fetch(`/api/characters/${characterId}`, { cache: "no-store" });
      console.log("[OCDetailPage] /api/characters response (callback):", {
        characterId,
        status: res.status,
        ok: res.ok,
      });
      if (!res.ok) {
        const raw = await res.text().catch(() => "");
        let b: unknown = {};
        try {
          b = raw ? JSON.parse(raw) : {};
        } catch {
          b = { raw };
        }
        console.error("[OCDetailPage] /api/characters non-OK body (callback):", b);
        throw new Error(
          (b as { error?: string }).error ?? `Request failed: ${res.status}`
        );
      }
      const data = (await res.json()) as { character?: CharacterDetail };
      console.log("[OCDetailPage] /api/characters JSON (callback):", {
        hasCharacter: Boolean(data.character),
        characterKeys: data.character ? Object.keys(data.character).slice(0, 25) : [],
      });
      if (!data.character) {
        throw new Error("Character not found");
      }
      setCharacter(data.character);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[OCDetailPage] Failed to fetch character (callback):", error);
      setError(error.message);
      setCharacter(null);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  const fetchGearImages = useCallback(async (character: CharacterDetail) => {
    const gearNames: string[] = [];

    if (character.gearWeapon?.name) gearNames.push(character.gearWeapon.name);
    if (character.gearShield?.name) gearNames.push(character.gearShield.name);
    if (character.gearArmor?.head?.name)
      gearNames.push(character.gearArmor.head.name);
    if (character.gearArmor?.chest?.name)
      gearNames.push(character.gearArmor.chest.name);
    if (character.gearArmor?.legs?.name)
      gearNames.push(character.gearArmor.legs.name);

    if (gearNames.length === 0) return;

    try {
      const images: Record<string, string> = {};
      const modifierHearts: Record<string, number> = {};

      await Promise.all(
        gearNames.map(async (name) => {
          try {
            const response = await fetch(
              `/api/models/items?search=${encodeURIComponent(name)}&limit=1`
            );
            if (response.ok) {
              const data = await response.json();
              if (data.data && data.data.length > 0) {
                const item = data.data.find(
                  (item: { itemName: string }) =>
                    item.itemName.toLowerCase() === name.toLowerCase()
                );
                if (item) {
                  if (item.image && item.image !== "No Image") {
                    images[name] = item.image;
                  }
                  if (item.modifierHearts != null) {
                    modifierHearts[name] = item.modifierHearts;
                  }
                }
              }
            }
          } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            console.warn(`[page.tsx]⚠️ Failed to fetch image for ${name}:`, error);
          }
        })
      );

      setGearImages(images);
      setGearModifierHearts(modifierHearts);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.warn("[page.tsx]⚠️ Failed to fetch gear images:", error);
    }
  }, []);

  const fetchRelationships = useCallback(async (characterId: string) => {
    if (!characterId) return;

    setRelationshipsLoading(true);
    setRelationshipsError(null);
    try {
      const res = await fetch(`/api/characters/relationships/${characterId}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch relationships: ${res.status}`);
      }
      const data = (await res.json()) as { outgoing?: Relationship[]; incoming?: Relationship[] };
      setRelationships({
        outgoing: data.outgoing || [],
        incoming: data.incoming || [],
      });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[OCDetailPage] Failed to fetch relationships:", error);
      setRelationshipsError(error.message);
      setRelationships({ outgoing: [], incoming: [] });
    } finally {
      setRelationshipsLoading(false);
    }
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    const fetchWithAbort = async () => {
      if (!characterId) {
        setError("Character ID is required");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        console.log("[OCDetailPage] Fetching character:", {
          characterId,
          params,
          pathname,
          sessionLoading,
          hasUser: Boolean(user?.id),
        });
        const res = await fetch(`/api/characters/${characterId}`, { signal: abortController.signal, cache: "no-store" });
        if (abortController.signal.aborted) return;
        console.log("[OCDetailPage] /api/characters response:", {
          characterId,
          status: res.status,
          ok: res.ok,
        });
        
        if (!res.ok) {
          const raw = await res.text().catch(() => "");
          let b: unknown = {};
          try {
            b = raw ? JSON.parse(raw) : {};
          } catch {
            b = { raw };
          }
          console.error("[OCDetailPage] /api/characters non-OK body:", b);
          throw new Error(
            (b as { error?: string }).error ?? `Request failed: ${res.status}`
          );
        }
        const data = (await res.json()) as { character?: CharacterDetail };
        if (abortController.signal.aborted) return;
        console.log("[OCDetailPage] /api/characters JSON:", {
          hasCharacter: Boolean(data.character),
          characterKeys: data.character ? Object.keys(data.character).slice(0, 25) : [],
        });
        
        if (!data.character) {
          throw new Error("Character not found");
        }
        setCharacter(data.character);
      } catch (err: unknown) {
        if (abortController.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        console.error("[OCDetailPage] Failed to fetch character:", error);
        setError(error.message);
        setCharacter(null);
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchWithAbort();

    return () => {
      abortController.abort();
    };
  }, [characterId]);

  useEffect(() => {
    if (character) {
      fetchGearImages(character);
      // Fetch relationships when character is loaded and has _id
      if (character._id) {
        const charId = typeof character._id === "string" ? character._id : String(character._id);
        fetchRelationships(charId);
      }
    }
  }, [character, fetchGearImages, fetchRelationships]);

  useLayoutEffect(() => {
    const mainElement = document.querySelector("main");

    window.scrollTo({ top: 0, behavior: "instant" });
    mainElement?.scrollTo({ top: 0, behavior: "instant" });
    document.documentElement.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  useEffect(() => {
    if (!loading && character) {
      const mainElement = document.querySelector("main");

      requestAnimationFrame(() => {
        const mainEl = document.querySelector("main");
        window.scrollTo({ top: 0, behavior: "instant" });
        mainEl?.scrollTo({ top: 0, behavior: "instant" });
        document.documentElement.scrollTo({ top: 0, behavior: "instant" });
      });
    }
  }, [loading, character]);

  useEffect(() => {
    return () => {
      if (submitSuccessTimeoutRef.current) {
        clearTimeout(submitSuccessTimeoutRef.current);
        submitSuccessTimeoutRef.current = null;
      }
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!characterId || !character) return;

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    try {
      if (submitSuccessTimeoutRef.current) {
        clearTimeout(submitSuccessTimeoutRef.current);
        submitSuccessTimeoutRef.current = null;
      }

      const res = await fetch(`/api/characters/${characterId}/submit`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? "Failed to submit character"
        );
      }

      setSubmitSuccess(true);
      await fetchCharacter();

      submitSuccessTimeoutRef.current = setTimeout(() => {
        setSubmitSuccess(false);
        submitSuccessTimeoutRef.current = null;
      }, 3000);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  }, [characterId, character, fetchCharacter]);

  // Merge outgoing and incoming relationships by the "other" character
  // This must be called before any conditional returns to follow Rules of Hooks
  const mergedRelationships = useMemo(() => {
    const map = new Map<string, {
      targetChar: CharacterRef | null;
      targetName: string;
      relationshipTypes: RelationshipType[];
      outgoing?: Relationship;
      incoming?: Relationship;
    }>();

    // Add outgoing relationships
    relationships.outgoing.forEach((rel) => {
      const targetId = getCharacterId(rel.targetCharacterId);
      if (!targetId) return;
      
      const targetChar = getCharacter(rel.targetCharacterId);
      
      if (!map.has(targetId)) {
        map.set(targetId, {
          targetChar,
          targetName: rel.targetCharacterName,
          relationshipTypes: [],
        });
      }
      const entry = map.get(targetId)!;
      entry.outgoing = rel;
      entry.relationshipTypes = [...new Set([...entry.relationshipTypes, ...rel.relationshipTypes])];
    });

    // Add incoming relationships
    relationships.incoming.forEach((rel) => {
      const sourceId = getCharacterId(rel.characterId);
      if (!sourceId) return;
      
      const sourceChar = getCharacter(rel.characterId);
      
      if (!map.has(sourceId)) {
        map.set(sourceId, {
          targetChar: sourceChar,
          targetName: rel.characterName,
          relationshipTypes: [],
        });
      }
      const entry = map.get(sourceId)!;
      entry.incoming = rel;
      entry.relationshipTypes = [...new Set([...entry.relationshipTypes, ...rel.relationshipTypes])];
    });

    return Array.from(map.values());
  }, [relationships]);

  if (loading) {
    return (
      <div className="min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[90rem]">
          <Loading message="Loading character..." size="lg" variant="inline" />
        </div>
      </div>
    );
  }

  if (error || !character) {
    return (
      <div className="min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[90rem]">
          <div className="mb-6 flex items-center justify-center gap-4">
            <img src="/Side=Left.svg" alt="" className="h-6 w-auto" />
            <h1 className="text-3xl font-bold text-[var(--totk-light-ocher)]">
              Character Not Found
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-6 w-auto" />
          </div>
          <div className="rounded-lg border-2 border-[var(--totk-green)] bg-[var(--totk-brown)]/80 p-6 text-center">
            <p className="mb-4 text-[var(--botw-pale)]">
              {error ?? "Character not found"}
            </p>
            <button
              onClick={() => router.back()}
              className="rounded-md border-2 border-[var(--totk-light-green)] bg-[var(--botw-warm-black)] px-4 py-2 text-sm font-medium text-[var(--totk-light-green)] hover:bg-[var(--totk-light-green)] hover:text-[var(--botw-warm-black)] hover:shadow-[0_0_12px_rgba(73,213,156,0.4)] hover:scale-[1.02] transition-all"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isModCharacter = character.isModCharacter ?? false;
  const villageClass = getVillageBorderClass(character.homeVillage);
  const villageStyle = isModCharacter
    ? getModCharacterGoldStyle(false)
    : getVillageBorderStyle(character.homeVillage);
  const villageTextStyle = getVillageTextStyle(character.homeVillage);
  const hasSpiritOrbs =
    character.spiritOrbs != null && character.spiritOrbs > 0;
  const iconBorderClass = isModCharacter
    ? "border-[#FFD700] shadow-[0_0_20px_rgba(255,215,0,0.8)]"
    : "border-[var(--totk-light-green)] shadow-[0_0_20px_rgba(73,213,156,0.8)]";
  const borderImages = getVillageBorderImages(character.homeVillage);

  return (
    <div className="relative overflow-hidden w-full">
      {/* Top Border - Hidden on mobile */}
      <div className="hidden md:block w-full pointer-events-none">
        <img
          src={borderImages.top}
          alt=""
          className="w-full h-auto"
          aria-hidden="true"
        />
      </div>
      <div className="p-4 sm:p-6 md:p-8 md:-mt-80 lg:-mt-96 relative z-10">
      <div className="mx-auto max-w-[90rem]">
        {/* Header */}
        <div className="mb-6 sm:mb-8 flex flex-col items-center gap-3 sm:gap-4">
          <div className="flex w-full items-center justify-between gap-2 sm:gap-4">
            <button
              onClick={() => router.back()}
              className="rounded-lg border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] p-1.5 sm:p-2 text-[var(--totk-light-green)] transition-all hover:bg-[var(--totk-light-green)] hover:text-[var(--botw-warm-black)] hover:border-[var(--totk-light-green)] hover:shadow-[0_0_12px_rgba(73,213,156,0.4)] hover:scale-[1.05] flex-shrink-0"
              aria-label="Go back"
            >
              <i className="fa-solid fa-arrow-left text-sm sm:text-base" aria-hidden="true" />
            </button>
            <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-center min-w-0">
              <img
                src="/Side=Left.svg"
                alt=""
                className="h-4 sm:h-6 w-auto opacity-80 flex-shrink-0"
              />
              <h1 className="text-xl sm:text-3xl font-bold text-[var(--totk-light-green)] md:text-4xl truncate">
                {character.name}
              </h1>
              <img
                src="/Side=Right.svg"
                alt=""
                className="h-4 sm:h-6 w-auto opacity-80 flex-shrink-0"
              />
            </div>
            <div className="w-8 sm:w-10 flex-shrink-0"></div>
          </div>
        </div>

        {/* Feedback Section */}
        {character.status === "needs_changes" &&
          character.applicationFeedback &&
          character.applicationFeedback.length > 0 && (
            <div className="mb-4 sm:mb-6 rounded-lg border-2 border-[#ffa500] bg-[#ffa500]/10 p-4 sm:p-6 shadow-lg">
              <h2 className="mb-3 sm:mb-4 flex items-center gap-2 border-b border-[#ffa500] pb-2 text-base sm:text-lg font-bold text-[#ffa500]">
                <i className="fa-solid fa-comment-dots text-sm sm:text-base" aria-hidden="true" />
                Moderator Feedback
              </h2>
              <div className="space-y-3 sm:space-y-4">
                {character.applicationFeedback.map((feedback, index) => {
                  // Create stable key from available fields
                  const stableKey = feedback.modId && feedback.createdAt
                    ? `feedback-${feedback.modId}-${feedback.createdAt}`
                    : feedback.modId
                    ? `feedback-${feedback.modId}-${index}`
                    : feedback.createdAt
                    ? `feedback-${feedback.createdAt}-${index}`
                    : `feedback-${feedback.text?.slice(0, 20) || 'unknown'}-${index}`;
                  return (
                  <div
                    key={stableKey}
                    className="rounded-lg border border-[#ffa500]/30 bg-[var(--botw-warm-black)]/50 p-3 sm:p-4"
                  >
                    {feedback.createdAt && (
                      <div className="mb-2 flex items-center justify-end">
                        <span className="text-xs text-[var(--totk-grey-200)]">
                          {formatDate(feedback.createdAt)}
                        </span>
                      </div>
                    )}
                    <div className="text-sm leading-relaxed text-[var(--botw-pale)] prose prose-invert prose-sm max-w-none prose-p:mb-2 prose-p:last:mb-0 prose-ul:my-2 prose-ol:my-2">
                      <ReactMarkdown components={MARKDOWN_COMPONENTS} remarkPlugins={[remarkBreaks]}>
                        {convertUrlsToMarkdown(feedback.text || "No feedback provided")}
                      </ReactMarkdown>
                    </div>
                  </div>
                  );
                })}
              </div>
              <div className="mt-4 rounded-lg border border-[#ffa500]/30 bg-[#ffa500]/5 p-3">
                <p className="text-sm text-[var(--botw-pale)]">
                  <i
                    className="fa-solid fa-info-circle mr-2 text-[#ffa500]"
                    aria-hidden="true"
                  />
                  Please review the feedback above and make the necessary
                  changes to your character. Once you&apos;ve made the changes,
                  you can resubmit your character for review.
                </p>
              </div>
            </div>
          )}

        {/* Main Content Grid */}
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-3">
          {/* Left Column */}
          <div className="lg:col-span-1">
            {/* Character Icon/Image */}
            <div className="mb-4 sm:mb-6">
              <div
                className={`rounded-lg border-2 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)] p-4 sm:p-6 shadow-lg ${
                  villageClass ? `${villageClass}` : "border-[var(--totk-dark-ocher)]"
                }`}
                style={villageStyle}
              >
                {character.icon ? (
                  <img
                    src={character.icon}
                    alt={character.name}
                    className={`mx-auto h-32 w-32 sm:h-40 sm:w-40 md:h-48 md:w-48 rounded-lg border-2 object-cover shadow-xl ${iconBorderClass}`}
                    onError={handleImageError}
                  />
                ) : (
                  <img
                    src="/ankle_icon.png"
                    alt={character.name}
                    className={`mx-auto h-32 w-32 sm:h-40 sm:w-40 md:h-48 md:w-48 rounded-lg border-2 object-cover shadow-xl ${iconBorderClass}`}
                  />
                )}
                {/* Character Name */}
                <div className="mt-3 sm:mt-4 text-center">
                  <h2 className="text-base sm:text-lg md:text-xl font-bold text-[var(--totk-light-green)]">
                    {character.name}
                  </h2>
                </div>
                {/* Discord Username */}
                <div className="mt-2 sm:mt-3 flex justify-center">
                  <span className="rounded-md bg-[var(--botw-blue)] px-2.5 py-1 text-xs font-medium text-white shadow-sm">
                    @{character.username ?? character.userId}
                  </span>
                </div>
              </div>

              {/* Status Badges */}
              {(isModCharacter ||
                character.blighted ||
                character.ko ||
                character.inJail) && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  {isModCharacter && <StatusBadge type="mod" />}
                  {character.blighted && <StatusBadge type="blighted" />}
                  {character.ko && <StatusBadge type="ko" />}
                  {character.inJail && <StatusBadge type="jail" />}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
              {character.appLink && (
                <a
                  href={character.appLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={BUTTON_TERTIARY_CLASSES}
                >
                  <i className="fa-solid fa-external-link mr-2" aria-hidden="true" />
                  Character Bio
                </a>
              )}
              <Link
                href={`/characters/inventories/${createSlug(character.name)}`}
                className="rounded-md bg-[var(--totk-grey-300)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[var(--totk-grey-300)]/90 hover:shadow-md"
              >
                <i className="fa-solid fa-box mr-2" aria-hidden="true" />
                Inventory
              </Link>
              {user && character._id && character.userId === user.id && (
                <>
                  <Link href={`/characters/edit/${character._id}`} className={BUTTON_SECONDARY_CLASSES}>
                    <i className="fa-solid fa-pencil mr-2" aria-hidden="true" />
                    Edit
                  </Link>
                  {canSubmitCharacter(character.status) && (
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className={BUTTON_PRIMARY_CLASSES}
                    >
                      <i className="fa-solid fa-paper-plane mr-2" aria-hidden="true" />
                      {getSubmitButtonText(submitting, character.status)}
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Submit Messages */}
            {submitSuccess && (
              <div className="mb-4 rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--totk-light-green)]/10 p-3 text-center">
                <p className="text-sm font-medium text-[var(--totk-light-green)]">
                  <i className="fa-solid fa-check-circle mr-2" aria-hidden="true" />
                  Character submitted successfully!
                </p>
              </div>
            )}
            {submitError && (
              <div className="mb-4 rounded-lg border-2 border-[#ff6347] bg-[#ff6347]/10 p-3 text-center">
                <p className="text-sm font-medium text-[#ff6347]">
                  <i className="fa-solid fa-exclamation-triangle mr-2" aria-hidden="true" />
                  {submitError}
                </p>
              </div>
            )}
            {showSavedBanner && (
              <div className="mb-4 rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--totk-light-green)]/10 p-3 text-center">
                <p className="text-sm font-medium text-[var(--totk-light-green)]">
                  <i className="fa-solid fa-check-circle mr-2" aria-hidden="true" />
                  Your changes have been saved.
                </p>
              </div>
            )}

            {/* Basic Info Card */}
            <CardSection icon="fa-info-circle" title="Basic Information">
              <div className="space-y-3">
                <InfoField
                  icon="fa-users"
                  label="Race"
                  value={capitalize(character.race)}
                />
                <InfoField
                  icon="fa-briefcase"
                  label="Job"
                  value={capitalize(character.job)}
                />
                <InfoField
                  icon="fa-house"
                  label="Home Village"
                  value={capitalize(character.homeVillage)}
                  villageStyle={villageTextStyle}
                />
                {character.currentVillage &&
                  character.currentVillage !== character.homeVillage && (
                    <InfoField
                      icon="fa-map-marker-alt"
                      label="Current Village"
                      value={capitalize(character.currentVillage)}
                      villageStyle={getVillageTextStyle(character.currentVillage)}
                    />
                  )}
                <InfoField
                  icon="fa-user-tag"
                  label="Pronouns"
                  value={character.pronouns}
                />
                {character.age != null && (
                  <InfoField icon="fa-birthday-cake" label="Age" value={character.age} />
                )}
                <InfoField
                  icon="fa-ruler-vertical"
                  label="Height"
                  value={formatHeight(character.height)}
                />
                {character.birthday && (
                  <InfoField
                    icon="fa-calendar-day"
                    label="Birthday"
                    value={character.birthday}
                  />
                )}
                {character.virtue && (
                  <InfoField
                    icon="fa-gem"
                    label="Virtue"
                    value={character.virtue}
                  />
                )}
                {character.jobDateChanged && (
                  <InfoField
                    icon="fa-clock-rotate-left"
                    label="Job Changed"
                    value={formatDate(character.jobDateChanged)}
                  />
                )}
                {character.lastStaminaUsage && (
                  <InfoField
                    icon="fa-bolt"
                    label="Last Stamina Usage"
                    value={formatDate(character.lastStaminaUsage)}
                  />
                )}
              </div>
            </CardSection>

            {/* Pets & Mounts */}
            {(character.currentActivePet || character.currentActiveMount) && (
              <div className="pt-4 sm:pt-6">
                <CardSection icon="fa-paw" title="Companions">
                  <div className="space-y-3 sm:space-y-4">
                    {character.currentActivePet && (
                      <CompanionDisplay type="pet" companion={character.currentActivePet} />
                    )}
                    {character.currentActiveMount && (
                      <CompanionDisplay type="mount" companion={character.currentActiveMount} />
                    )}
                  </div>
                </CardSection>
              </div>
            )}

            {/* Steal Protection */}
            {character.stealProtection && (
              <div className="pt-6">
                <CardSection icon="fa-shield-halved" title="Steal Protection">
                  <div className="space-y-3">
                  {character.stealProtection.isProtected ? (
                    <div className="rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--totk-light-green)]/10 p-4">
                      <div className="flex items-center gap-2">
                        <i
                          className="fa-solid fa-shield-check text-xl text-[var(--totk-light-green)]"
                          aria-hidden="true"
                        />
                        <div>
                          <div className="text-sm font-bold text-[var(--totk-light-green)]">
                            Protected
                          </div>
                          {character.stealProtection.protectionEndTime && (
                            <div className="mt-1 text-xs text-[var(--botw-pale)]">
                              Protection ends:{" "}
                              {formatDate(character.stealProtection.protectionEndTime)}
                              {formatTimeRemaining(
                                character.stealProtection.protectionEndTime
                              ) && (
                                <span className="ml-2 text-[var(--totk-light-green)]">
                                  (
                                  {formatTimeRemaining(
                                    character.stealProtection.protectionEndTime
                                  )}{" "}
                                  remaining)
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-[var(--totk-grey-300)] bg-[var(--totk-ocher)]/10 p-4">
                      <div className="flex items-center gap-2">
                        <i
                          className="fa-solid fa-shield-slash text-xl text-[var(--totk-grey-200)]"
                          aria-hidden="true"
                        />
                        <div className="text-sm font-medium text-[var(--totk-grey-200)]">
                          Not Protected
                        </div>
                      </div>
                    </div>
                  )}
                  </div>
                </CardSection>
              </div>
            )}
          </div>

          {/* Right Column */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            {/* Stats Card */}
            <CardSection icon="fa-chart-bar" title="Stats">
              <div className={`grid gap-3 sm:gap-4 ${getStatsGridClass(hasSpiritOrbs)}`}>
                <StatCard
                  icon="fa-heart"
                  label="HEARTS"
                  value={`${character.currentHearts}/${character.maxHearts}`}
                  borderColor="border-[var(--totk-green)]"
                  iconColor="text-[var(--totk-light-green)]"
                  shadowColor="rgba(73,213,156,0.6)"
                />
                <StatCard
                  icon="fa-bolt"
                  label="STAMINA"
                  value={`${character.currentStamina}/${character.maxStamina}`}
                  borderColor="border-[var(--botw-blue)]"
                  iconColor="text-[var(--botw-blue)]"
                  shadowColor="rgba(0,163,218,0.6)"
                />
                <StatCard
                  icon="fa-hand-fist"
                  label="ATTACK"
                  value={
                    character.gearWeapon
                      ? calculateAttack(character, gearModifierHearts)
                      : (character.attack ?? 0)
                  }
                  borderColor="border-[#ff6347]"
                  iconColor="text-[#ff6347]"
                  shadowColor="rgba(255,99,71,0.6)"
                />
                <StatCard
                  icon="fa-shield-halved"
                  label="DEFENSE"
                  value={
                    character.gearArmor || character.gearShield
                      ? calculateDefense(character, gearModifierHearts)
                      : (character.defense ?? 0)
                  }
                  borderColor="border-[var(--totk-light-ocher)]"
                  iconColor="text-[var(--totk-light-ocher)]"
                  shadowColor="rgba(229,220,183,0.6)"
                />
                {hasSpiritOrbs && (
                  <StatCard
                    icon="fa-circle"
                    label="SPIRIT ORBS"
                    value={character.spiritOrbs}
                    borderColor="border-[#FFD700]"
                    iconColor="text-[#FFD700]"
                    shadowColor="rgba(255,215,0,0.6)"
                  />
                )}
              </div>
            </CardSection>

            {/* Gear Card */}
            <CardSection
              icon="fa-shield-halved"
              title="Equipped Gear"
              titleColor="text-[var(--totk-light-ocher)]"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {GEAR_ITEMS_CONFIG.map(({ key, label, icon }) => {
                  const gear = getGearByKey(character, key);

                  return (
                    <GearItemDisplay
                      key={key}
                      gear={gear}
                      gearImages={gearImages}
                      gearModifierHearts={gearModifierHearts}
                      label={label}
                      icon={icon}
                    />
                  );
                })}
              </div>
            </CardSection>

            {/* Biography Section */}
            <BiographySection
              personality={character.personality}
              history={character.history}
              extras={character.extras}
            />

            {/* Status Effects */}
            {(character.blighted ||
              character.buff?.active ||
              character.debuff?.active ||
              character.inJail ||
              character.ko) && (
              <CardSection icon="fa-exclamation-triangle" title="Status Effects">
                <div className="space-y-3">
                  {character.blighted && (
                    <div className="rounded-lg border-2 border-[var(--blight-border)] bg-[var(--blight-border)]/10 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <i
                          className="fa-solid fa-skull text-xl text-[var(--blight-border)]"
                          aria-hidden="true"
                        />
                        <h3 className="font-bold text-[var(--blight-border)]">Blighted</h3>
                      </div>
                      <div className="space-y-1 text-sm text-[var(--botw-pale)]">
                        {character.blightStage != null && (
                          <div>Stage: {character.blightStage}</div>
                        )}
                        {character.blightedAt && (
                          <div>Blighted at: {formatDate(character.blightedAt)}</div>
                        )}
                        {character.deathDeadline && (
                          <div className="text-[var(--blight-border)] font-medium">
                            Death Deadline: {formatDate(character.deathDeadline)} (
                            {formatTimeRemaining(character.deathDeadline)})
                          </div>
                        )}
                        {character.blightPaused && character.blightPauseInfo && (
                          <div className="mt-2 rounded border border-[var(--totk-green)] bg-[var(--totk-ocher)]/10 p-2">
                            <div className="font-medium text-[var(--totk-light-green)]">
                              Paused
                            </div>
                            {character.blightPauseInfo.pausedByUsername && (
                              <div>By: {character.blightPauseInfo.pausedByUsername}</div>
                            )}
                            {character.blightPauseInfo.reason && (
                              <div>Reason: {character.blightPauseInfo.reason}</div>
                            )}
                            {character.blightPauseInfo.pausedAt && (
                              <div>
                                Since: {formatDate(character.blightPauseInfo.pausedAt)}
                              </div>
                            )}
                          </div>
                        )}
                        {character.blightEffects && (
                          <div className="mt-2 space-y-1">
                            {character.blightEffects.rollMultiplier !== 1 && (
                              <div>
                                Roll Multiplier: {character.blightEffects.rollMultiplier}x
                              </div>
                            )}
                            {character.blightEffects.noMonsters && (
                              <div className="text-[var(--totk-light-green)]">
                                No Monsters
                              </div>
                            )}
                            {character.blightEffects.noGathering && (
                              <div className="text-[var(--totk-light-green)]">
                                No Gathering
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {character.buff?.active && character.buff.type && (
                    <div className="rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--totk-light-green)]/10 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <i
                          className="fa-solid fa-arrow-up text-xl text-[var(--totk-light-green)]"
                          aria-hidden="true"
                        />
                        <h3 className="font-bold text-[var(--totk-light-green)]">
                          Active Buff: {capitalize(character.buff.type)}
                        </h3>
                      </div>
                      {character.buff.effects && (
                        <div className="space-y-1 text-sm text-[var(--botw-pale)]">
                          {Object.entries(character.buff.effects).map(([key, value]) => {
                            if (!value || value === 0) return null;
                            const label = key
                              .replace(/([A-Z])/g, " $1")
                              .replace(/^./, (str) => str.toUpperCase());
                            return (
                              <div key={key}>
                                {label}: +{value}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {character.debuff?.active && (
                    <div className="rounded-lg border-2 border-[#ff6347] bg-[#ff6347]/10 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <i
                          className="fa-solid fa-arrow-down text-xl text-[#ff6347]"
                          aria-hidden="true"
                        />
                        <h3 className="font-bold text-[#ff6347]">Active Debuff</h3>
                      </div>
                      {character.debuff.endDate && (
                        <div className="text-sm text-[var(--botw-pale)]">
                          Ends: {formatDate(character.debuff.endDate)} (
                          {formatTimeRemaining(character.debuff.endDate)})
                        </div>
                      )}
                    </div>
                  )}
                  {character.inJail && (
                    <div className="rounded-lg border-2 border-[var(--botw-dark-blue)] bg-[var(--botw-dark-blue)]/10 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <i
                          className="fa-solid fa-lock text-xl text-[var(--botw-blue)]"
                          aria-hidden="true"
                        />
                        <h3 className="font-bold text-[var(--botw-blue)]">In Jail</h3>
                      </div>
                      <div className="space-y-1 text-sm text-[var(--botw-pale)]">
                        {character.jailStartTime && (
                          <div>Jailed: {formatDate(character.jailStartTime)}</div>
                        )}
                        {character.jailReleaseTime && (
                          <div className="font-medium text-[var(--botw-blue)]">
                            Release: {formatDate(character.jailReleaseTime)} (
                            {formatTimeRemaining(character.jailReleaseTime)})
                          </div>
                        )}
                        {character.jailDurationMs && (
                          <div>
                            Duration:{" "}
                            {Math.round(character.jailDurationMs / (1000 * 60 * 60))}{" "}
                            hours
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {character.ko && (
                    <div className="rounded-lg border-2 border-[var(--totk-grey-300)] bg-[var(--totk-grey-400)]/20 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <i
                          className="fa-solid fa-bed text-xl text-[var(--totk-grey-100)]"
                          aria-hidden="true"
                        />
                        <h3 className="font-bold text-[var(--totk-grey-100)]">KO&apos;d</h3>
                      </div>
                    </div>
                  )}
                </div>
              </CardSection>
            )}

            {/* Vendor/Shop Information */}
            {character.vendorType && character.vendorType.trim() !== "" && (
              <CardSection icon="fa-store" title="Vendor & Shop">
                <div className="space-y-3">
                  {character.vendorType && (
                    <InfoField
                      icon="fa-tag"
                      label="Vendor Type"
                      value={capitalize(character.vendorType)}
                    />
                  )}
                  {character.vendingPoints != null && (
                    <div>
                      <span className="mb-1 flex items-center gap-2 text-xs font-medium text-[var(--totk-grey-200)]">
                        <i
                          className="fa-solid fa-coins text-[var(--totk-light-green)]"
                          aria-hidden="true"
                        />
                        Vending Points
                      </span>
                      <div className="rounded border border-[var(--totk-green)] bg-[var(--totk-ocher)]/10 px-3 py-2 text-sm font-bold text-[var(--totk-light-green)]">
                        {character.vendingPoints}
                      </div>
                    </div>
                  )}
                  {character.shopPouch && (
                    <InfoField icon="fa-sack" label="Shop Pouch" value={character.shopPouch} />
                  )}
                  {character.pouchSize != null && character.pouchSize > 0 && (
                    <InfoField
                      icon="fa-weight"
                      label="Pouch Size"
                      value={character.pouchSize}
                    />
                  )}
                  {character.shopLink && (
                    <div>
                      <a
                        href={character.shopLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={BUTTON_TERTIARY_CLASSES}
                      >
                        <i className="fa-solid fa-external-link" aria-hidden="true" />
                        Visit Shop
                      </a>
                    </div>
                  )}
                  {character.shopImage && (
                    <div className="mt-4">
                      <img
                        src={character.shopImage}
                        alt={`${character.name}'s shop`}
                        className="max-w-full rounded-lg border-2 border-[var(--totk-green)] shadow-xl"
                        onError={handleImageError}
                      />
                    </div>
                  )}
                </div>
              </CardSection>
            )}

            {/* Help Wanted Quests */}
            {character.helpWanted && (
              <CardSection icon="fa-clipboard-list" title="Help Wanted Quests">
                <div className="space-y-3">
                  {character.helpWanted.cooldownUntil && (
                    <div>
                      <span className="mb-1 flex items-center gap-2 text-xs font-medium text-[var(--totk-grey-200)]">
                        <i
                          className="fa-solid fa-hourglass-half text-[var(--totk-light-green)]"
                          aria-hidden="true"
                        />
                        Cooldown Until
                      </span>
                      <div className={INFO_FIELD_VALUE_CLASSES}>
                        {formatDate(character.helpWanted.cooldownUntil)} (
                        {formatTimeRemaining(character.helpWanted.cooldownUntil)})
                      </div>
                    </div>
                  )}
                  {character.helpWanted.completions &&
                    character.helpWanted.completions.length > 0 && (() => {
                      const completions = character.helpWanted.completions!;
                      const totalQuests = completions.length;
                      
                      // Calculate stats by quest type
                      const questTypeStats: Record<string, number> = {};
                      const villageStats: Record<string, number> = {};
                      
                      completions.forEach((completion) => {
                        const questType = completion.questType?.toLowerCase() || "unknown";
                        questTypeStats[questType] = (questTypeStats[questType] || 0) + 1;
                        
                        if (completion.village) {
                            const village = String(completion.village).toLowerCase();
                          villageStats[village] = (villageStats[village] || 0) + 1;
                        }
                      });
                      
                      // Helper function to get village color
                      const getVillageBadgeColor = (village: string): string => {
                        const normalized = String(village).toLowerCase();
                        switch (normalized) {
                          case "rudania":
                            return "#C6000A";
                          case "inariko":
                            return "#6BA3FF";
                          case "vhintl":
                            return "#4AA144";
                          default:
                            return "var(--totk-green)";
                        }
                      };
                      
                      return (
                        <div className="space-y-4">
                          {/* Total Stats */}
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-2 text-sm font-semibold text-[var(--totk-light-green)]">
                              <i className="fa-solid fa-trophy" aria-hidden="true" />
                              Total Quests Completed
                            </span>
                            <span className="text-2xl font-bold text-[var(--botw-pale)]">
                              {totalQuests}
                            </span>
                          </div>
                          
                          {/* Quest Type Breakdown */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {Object.entries(questTypeStats)
                              .sort(([, a], [, b]) => b - a)
                              .map(([type, count]) => {
                                const questConfig = getQuestTypeConfig(type);
                                return (
                                  <div
                                    key={type}
                                    className={`rounded-lg border-2 ${questConfig.borderColor} ${questConfig.bgColor} p-3 flex items-center gap-2.5`}
                                  >
                                    <i
                                      className={`fa-solid ${questConfig.icon} text-base`}
                                      style={{ color: questConfig.color }}
                                      aria-hidden="true"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className={`text-xs font-semibold ${questConfig.textColor}`}>
                                        {questConfig.label}
                                      </div>
                                      <div className="text-xs text-[var(--botw-pale)] font-medium">
                                        {count} {count === 1 ? "quest" : "quests"}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                          
                          {/* Village Breakdown */}
                          {Object.keys(villageStats).length > 0 && (
                            <div className="pt-4 border-t border-[var(--totk-green)]/30">
                              <div className="flex items-center gap-2 mb-3">
                                <i
                                  className="fa-solid fa-map-location-dot text-[var(--totk-light-green)] text-sm"
                                  aria-hidden="true"
                                />
                                <span className="text-xs font-semibold text-[var(--totk-grey-200)]">
                                  By Village
                                </span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                {Object.entries(villageStats)
                                  .sort(([, a], [, b]) => b - a)
                                  .map(([village, count]) => {
                                    const villageColor = getVillageBadgeColor(village);
                                    const rgb = hexToRgb(villageColor);
                                    return (
                                      <div
                                        key={village}
                                        className="rounded-lg border-2 p-3 transition-all hover:shadow-lg hover:scale-[1.02]"
                                        style={{
                                          borderColor: villageColor,
                                          backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
                                          boxShadow: `0 2px 8px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`,
                                        }}
                                      >
                                        <div className="flex items-center justify-between">
                                          <span
                                            className="font-semibold text-sm"
                                            style={{ color: villageColor }}
                                          >
                                            {capitalize(village)}
                                          </span>
                                          <span
                                            className="text-lg font-bold"
                                            style={{ color: villageColor }}
                                          >
                                            {count}
                                          </span>
                                        </div>
                                        <div className="text-xs text-[var(--botw-pale)] font-medium mt-1">
                                          {count === 1 ? "quest" : "quests"} completed
                                        </div>
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                </div>
              </CardSection>
            )}

            {/* Relationships */}
            <CardSection icon="fa-heart" title="Relationships">
              {relationshipsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loading message="Loading relationships..." variant="inline" size="md" />
                </div>
              ) : relationshipsError ? (
                <div className="rounded border border-[#ff6347] bg-[#ff6347]/10 px-3 py-2 text-sm text-[#ff6347]">
                  <i className="fa-solid fa-exclamation-circle mr-2" aria-hidden="true" />
                  {relationshipsError}
                </div>
              ) : mergedRelationships.length === 0 ? (
                <div className="py-8 text-center">
                  <div className="text-4xl mb-2">💝</div>
                  <p className="text-sm text-[var(--botw-pale)] opacity-60 italic mb-3">
                    {character.name} doesn't have any relationships yet.
                  </p>
                  <Link
                    href="/characters/relationships"
                    className="inline-flex items-center gap-2 text-sm text-[var(--botw-blue)] hover:text-[var(--totk-light-green)] underline"
                  >
                    <i className="fa-solid fa-heart" aria-hidden="true" />
                    View all relationships
                  </Link>
                </div>
              ) : (
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2" style={{ overscrollBehavior: 'contain' }}>
                  {mergedRelationships.map((relData, idx) => {
                    const targetChar = relData.targetChar;
                    const targetIconUrl = targetChar?.icon ? normalizeImageUrl(targetChar.icon) : "/ankle_icon.png";
                    const targetVillage = targetChar?.homeVillage || targetChar?.currentVillage || "";
                    const targetVillageCrestIcon = targetVillage ? getVillageCrestIcon(targetVillage) : null;
                    const targetSlug = createSlug(relData.targetName);

                    return (
                      <div
                        key={`${relData.targetName}-${idx}`}
                        className="rounded-lg border-2 border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/80 to-[var(--totk-brown)]/40 p-4 shadow-lg"
                      >
                        {/* Character Header */}
                        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-4 mb-4 pb-3 border-b-2 border-[var(--totk-dark-ocher)]/40">
                          <Link
                            href={`/characters/${targetSlug}`}
                            className="flex flex-col sm:flex-row items-center sm:items-center gap-3 hover:opacity-80 transition-opacity w-full sm:w-auto"
                          >
                            <div className="relative h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-lg border-2 border-[var(--totk-light-green)]/50 bg-[var(--botw-warm-black)] shadow-lg ring-2 ring-[var(--totk-light-green)]/20">
                              <Image
                                src={targetIconUrl}
                                alt={relData.targetName}
                                fill
                                className="object-cover"
                                unoptimized
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = "/ankle_icon.png";
                                }}
                              />
                            </div>
                            <div className="text-center sm:text-left">
                              <h4 className="text-base sm:text-lg font-bold text-[var(--totk-light-green)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                                {relData.targetName}
                              </h4>
                              {targetChar?.race && (
                                <p className="text-xs text-[var(--botw-pale)] opacity-90">
                                  {capitalize(targetChar.race)}
                                </p>
                              )}
                              {targetVillageCrestIcon && (
                                <img
                                  src={targetVillageCrestIcon}
                                  alt={`${targetVillage} crest`}
                                  className="h-6 w-6 object-contain opacity-90 mt-1 mx-auto sm:mx-0"
                                />
                              )}
                            </div>
                          </Link>
                        </div>

                        {/* My character feels this way */}
                        {relData.outgoing && (() => {
                          const primaryConfig = getPrimaryRelationshipConfig(relData.outgoing.relationshipTypes);
                          return (
                            <div 
                              className="relative mb-3 rounded-lg border-2 p-3 sm:p-4 shadow-inner"
                              style={{
                                borderColor: `${primaryConfig.borderColor}`,
                                background: `linear-gradient(to bottom right, ${primaryConfig.bgColor}, transparent)`,
                              }}
                            >
                              <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  {relData.outgoing.relationshipTypes.map((type) => {
                                    const config = RELATIONSHIP_CONFIG[type];
                                    return (
                                      <i 
                                        key={type}
                                        className={`fa-solid ${config.icon} text-base sm:text-lg`}
                                        style={{ color: config.color }}
                                        title={config.label}
                                        aria-hidden="true"
                                      />
                                    );
                                  })}
                                </div>
                                <p 
                                  className="text-xs sm:text-sm font-bold uppercase tracking-wider"
                                  style={{ color: primaryConfig.color }}
                                >
                                  {character.name} feels this way:
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                {relData.outgoing.relationshipTypes.map((type) => (
                                  <RelationshipTypeBadge key={type} type={type} />
                                ))}
                              </div>
                              {relData.outgoing.notes && (
                                <div 
                                  className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t"
                                  style={{ borderColor: `${primaryConfig.borderColor}` }}
                                >
                                  <p className="text-xs sm:text-sm text-[var(--botw-pale)] whitespace-pre-wrap break-words leading-relaxed">
                                    {relData.outgoing.notes}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* This character feels this way */}
                        {relData.incoming && (() => {
                          const primaryConfig = getPrimaryRelationshipConfig(relData.incoming.relationshipTypes);
                          return (
                            <div 
                              className="rounded-lg border-2 p-3 sm:p-4 shadow-inner"
                              style={{
                                borderColor: `${primaryConfig.borderColor}`,
                                background: `linear-gradient(to bottom right, ${primaryConfig.bgColor}, transparent)`,
                              }}
                            >
                              <div className="flex items-center gap-2 mb-2 sm:mb-3 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  {relData.incoming.relationshipTypes.map((type) => {
                                    const config = RELATIONSHIP_CONFIG[type];
                                    return (
                                      <i 
                                        key={type}
                                        className={`fa-solid ${config.icon} text-base sm:text-lg`}
                                        style={{ color: config.color }}
                                        title={config.label}
                                        aria-hidden="true"
                                      />
                                    );
                                  })}
                                </div>
                                <p 
                                  className="text-xs sm:text-sm font-bold uppercase tracking-wider"
                                  style={{ color: primaryConfig.color }}
                                >
                                  {relData.targetName} feels this way:
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                                {relData.incoming.relationshipTypes.map((type) => (
                                  <RelationshipTypeBadge key={type} type={type} />
                                ))}
                              </div>
                              {relData.incoming.notes && (
                                <div 
                                  className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t"
                                  style={{ borderColor: `${primaryConfig.borderColor}` }}
                                >
                                  <p className="text-xs sm:text-sm text-[var(--botw-pale)] whitespace-pre-wrap break-words leading-relaxed">
                                    {relData.incoming.notes}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                  <div className="pt-3 border-t border-[var(--totk-green)]/30">
                    <Link
                      href="/characters/relationships"
                      className="inline-flex items-center gap-2 text-sm text-[var(--botw-blue)] hover:text-[var(--totk-light-green)] underline font-medium"
                    >
                      <i className="fa-solid fa-heart" aria-hidden="true" />
                      View all relationships
                    </Link>
                  </div>
                </div>
              )}
            </CardSection>

            {/* Application Art */}
            {character.appArt && (
              <CardSection icon="fa-image" title="Application Art">
                <div className="flex justify-center">
                  <img
                    src={character.appArt}
                    alt={`${character.name} application art`}
                    className="max-w-full rounded-lg border-2 border-[var(--totk-green)] shadow-xl"
                    onError={handleImageError}
                  />
                </div>
              </CardSection>
            )}
          </div>
        </div>
      </div>
      </div>
      {/* Bottom Border - Hidden on mobile; absolute so it does not add scrollable height */}
      <div className="hidden md:block absolute bottom-0 left-0 right-0 w-full min-w-full pointer-events-none z-0">
        <img
          src={borderImages.bottom}
          alt=""
          className="w-full h-auto max-h-[14rem] object-cover object-bottom"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
