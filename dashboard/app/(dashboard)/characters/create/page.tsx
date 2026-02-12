"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

/* [create/page.tsx]✨ Core dependencies - */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";
import { capitalize, createSlug } from "@/lib/string-utils";
import {
  DEFAULT_HEARTS,
  DEFAULT_STAMINA,
  VIRTUES,
  validateRequired,
  validateAge,
  validateHeight,
  validateHearts,
  validateStamina,
  validateAppLink,
  validateFileTypes,
  validateFileSizes,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_BYTES,
} from "@/lib/character-validation";
import {
  equipItem,
  getArmorSlot,
  getWeaponType,
  isShield,
  type EquippedGear,
  type ItemData,
} from "@/lib/gear-equip";
import { isFieldEditable } from "@/lib/character-field-editability";
import type { CharacterStatus } from "@/lib/character-field-editability";

/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

/* [create/page.tsx]🧷 Data contracts - */
type StarterGearOption = {
  id: string;
  name: string;
  slot: "weapon" | "shield" | "chest" | "legs";
  stats: { attack: number; defense: number };
};

type GearItemOption = {
  id: string;
  name: string;
  slot: "weapon" | "shield" | "head" | "chest" | "legs";
  modifierHearts: number;
  categoryGear?: string;
  type?: string[];
  subtype?: string[];
};

export type CreateMetadata = {
  races: { name: string; value: string }[];
  jobs: string[];
  jobsByVillage: Record<string, string[]>;
  villages: string[];
  starterGear: StarterGearOption[];
  gearItems: {
    weapons: GearItemOption[];
    shields: GearItemOption[];
    headArmor: GearItemOption[];
    chestArmor: GearItemOption[];
    legsArmor: GearItemOption[];
  };
};

type CharacterData = {
  _id?: string;
  name?: string;
  age?: number | null;
  height?: number | null;
  pronouns?: string;
  gender?: string;
  race?: string;
  homeVillage?: string;
  village?: string;
  job?: string;
  virtue?: string;
  personality?: string;
  history?: string;
  extras?: string;
  appLink?: string;
  icon?: string;
  appArt?: string;
  maxHearts?: number;
  maxStamina?: number;
  birthday?: string | null;
  gearWeapon?: { name: string; stats: Record<string, number> | Map<string, number> };
  gearShield?: { name: string; stats: Record<string, number> | Map<string, number> };
  gearArmor?: {
    head?: { name: string; stats: Record<string, number> | Map<string, number> };
    chest?: { name: string; stats: Record<string, number> | Map<string, number> };
    legs?: { name: string; stats: Record<string, number> | Map<string, number> };
  };
};

type CreateFormProps = {
  metadata: CreateMetadata;
  submitError: string | null;
  submitLoading: boolean;
  submitSuccess: string | null;
  setSubmitError: (v: string | null) => void;
  setSubmitLoading: (v: boolean) => void;
  setSubmitSuccess: (v: string | null) => void;
  characterId?: string;
  initialCharacter?: CharacterData | null;
  onSubmitForReview?: () => void;
  submittingForReview?: boolean;
  characterStatus?: CharacterStatus;
};

/* ============================================================================ */
/* ------------------- Constants ------------------- */
/* ============================================================================ */

/* [create/page.tsx]✨ Default equipment names - */
const DEFAULT_CHEST_ARMOR = "Old Shirt";
const DEFAULT_LEGS_ARMOR = "Well-Worn Trousers";

/* ============================================================================ */
/* ------------------- Utils ------------------- */
/* ============================================================================ */

/* [create/page.tsx]🧠 Height conversion helper - */
function convertCmToFeetInches(cm: number): { feet: number; inches: number } | null {
  if (isNaN(cm) || cm <= 0) return null;
  const totalInches = cm / 2.54;
  const feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches % 12); // Round to whole inches
  // If inches rounds to 12, increment feet and set inches to 0
  if (inches >= 12) {
    return { feet: feet + 1, inches: 0 };
  }
  return { feet, inches };
}

/* [create/page.tsx]🧠 Item data conversion helper - */
function gearItemToItemData(item: GearItemOption): ItemData {
  return {
    _id: item.id,
    itemName: item.name,
    categoryGear: item.categoryGear,
    type: item.type,
    subtype: item.subtype,
    modifierHearts: item.modifierHearts,
  };
}

/* [create/page.tsx]🧠 Find and validate gear item by name across all categories - */
function findGearItemByName(
  itemName: string,
  availableGearItems: {
    weapons: GearItemOption[];
    shields: GearItemOption[];
    headArmor: GearItemOption[];
    chestArmor: GearItemOption[];
    legsArmor: GearItemOption[];
  }
): { item: GearItemOption; actualType: "weapon" | "shield" | "armor" } | null {
  // Search all gear categories
  const allItems = [
    ...availableGearItems.weapons.map((w) => ({ item: w, category: "weapons" as const })),
    ...availableGearItems.shields.map((s) => ({ item: s, category: "shields" as const })),
    ...availableGearItems.headArmor.map((h) => ({ item: h, category: "headArmor" as const })),
    ...availableGearItems.chestArmor.map((c) => ({ item: c, category: "chestArmor" as const })),
    ...availableGearItems.legsArmor.map((l) => ({ item: l, category: "legsArmor" as const })),
  ];

  const trimLower = (s: string) => s.trim().toLowerCase();
  const found = allItems.find(
    ({ item }) =>
      item.name === itemName ||
      trimLower(item.name) === trimLower(itemName)
  );
  if (!found) return null;

  // Determine actual type using gear-equip functions
  const itemData = gearItemToItemData(found.item);
  const weaponType = getWeaponType(itemData);
  const isShieldItem = isShield(itemData);
  const armorSlot = getArmorSlot(itemData);

  let actualType: "weapon" | "shield" | "armor";
  if (weaponType) {
    actualType = "weapon";
  } else if (isShieldItem) {
    actualType = "shield";
  } else if (armorSlot) {
    actualType = "armor";
  } else {
    // Fallback to category-based type if type detection fails
    if (found.category === "weapons") actualType = "weapon";
    else if (found.category === "shields") actualType = "shield";
    else actualType = "armor";
  }

  return { item: found.item, actualType };
}

/* [create/page.tsx]🧠 Helper function to convert stats to Record - */
function statsToRecord(stats: Map<string, number> | Record<string, number>): Record<string, number> {
  if (stats instanceof Map) {
    return Object.fromEntries(stats);
  }
  return stats;
}

/* [create/page.tsx]🧠 Equipped gear builder - */
function buildEquippedGearState(
  weapon: GearItemOption | null,
  shield: GearItemOption | null,
  head: GearItemOption | null,
  chest: GearItemOption | null,
  legs: GearItemOption | null
): EquippedGear {
  return {
    gearWeapon: weapon
      ? {
          name: weapon.name,
          stats: new Map([
            ["attack", weapon.modifierHearts],
            ["defense", weapon.modifierHearts],
          ]),
        }
      : undefined,
    gearShield: shield
      ? {
          name: shield.name,
          stats: new Map([
            ["attack", shield.modifierHearts],
            ["defense", shield.modifierHearts],
          ]),
        }
      : undefined,
    gearArmor: {
      head: head
        ? {
            name: head.name,
            stats: new Map([
              ["attack", head.modifierHearts],
              ["defense", head.modifierHearts],
            ]),
          }
        : undefined,
      chest: chest
        ? {
            name: chest.name,
            stats: new Map([
              ["attack", chest.modifierHearts],
              ["defense", chest.modifierHearts],
            ]),
          }
        : undefined,
      legs: legs
        ? {
            name: legs.name,
            stats: new Map([
              ["attack", legs.modifierHearts],
              ["defense", legs.modifierHearts],
            ]),
          }
        : undefined,
    },
  };
}

/* ============================================================================ */
/* ------------------- Subcomponents ------------------- */
/* ============================================================================ */

/* [create/page.tsx]🧩 Page header component - */
function PageHeader() {
  return (
    <div className="mb-3 sm:mb-4 md:mb-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3 md:gap-4">
      <img
        alt=""
        className="h-4 w-auto sm:h-5 md:h-6"
        src="/Side=Left.svg"
      />
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[var(--totk-light-green)]">
        Create Character
      </h1>
      <img
        alt=""
        className="h-4 w-auto sm:h-5 md:h-6"
        src="/Side=Right.svg"
      />
    </div>
  );
}

/* [create/page.tsx]🧩 File upload zone component - */
type FileUploadZoneProps = {
  accept: string;
  file: File | null;
  id: string;
  label: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  preview: string | null;
  required?: boolean;
  disabled?: boolean;
};

function FileUploadZone({
  accept,
  file,
  id,
  label,
  onChange,
  preview,
  required = false,
  disabled = false,
}: FileUploadZoneProps) {
  const hasPreview = !!preview;
  const uploadZoneCls =
    "flex min-h-[120px] sm:min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[var(--totk-green)] bg-[var(--botw-warm-black)]/50 p-3 sm:p-4 transition-colors hover:border-[var(--totk-light-green)] hover:bg-[var(--botw-warm-black)]/70 touch-manipulation";
  const uploadBtnCls =
    "rounded border-2 border-[var(--totk-light-green)] bg-[var(--totk-light-green)] px-3 py-2 sm:px-4 sm:py-2.5 min-h-[44px] text-xs sm:text-sm font-medium text-[var(--totk-dark-green)] shadow-[0_2px_8px_rgba(73,213,156,0.4)] transition-all hover:bg-[var(--botw-blue)] hover:border-[var(--botw-blue)] hover:shadow-[0_4px_12px_rgba(0,163,218,0.6)] cursor-pointer touch-manipulation inline-flex items-center justify-center";

  return (
    <div>
      <input
        accept={accept}
        className="sr-only"
        id={id}
        required={required && !file}
        type="file"
        onChange={onChange}
        disabled={disabled}
      />
      <label
        className={`${uploadZoneCls} block ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${
          hasPreview
            ? "border-[var(--totk-light-green)] bg-[var(--botw-warm-black)] shadow-[0_0_12px_rgba(73,213,156,0.3)]"
            : ""
        }`}
        htmlFor={id}
      >
        {hasPreview ? (
          <>
            <img
              alt={`${label} preview`}
              className="h-20 w-20 sm:h-28 sm:w-28 rounded-lg border-2 border-[var(--totk-light-green)] object-cover shadow-inner"
              src={preview}
            />
            <span className="text-xs sm:text-sm text-[var(--totk-grey-200)] text-center px-2 break-words max-w-full">
              {file?.name ?? "No file chosen"}
            </span>
            <span className={uploadBtnCls}>Change {label.toLowerCase()}</span>
          </>
        ) : (
          <>
            <i
              aria-hidden
              className="fa-solid fa-image h-8 w-8 sm:h-10 sm:w-10 text-[var(--totk-grey-200)]"
            />
            <span className="text-xs sm:text-sm font-medium text-[var(--totk-light-green)] text-center">
              {label}
            </span>
            <span className={uploadBtnCls}>Choose file</span>
          </>
        )}
      </label>
    </div>
  );
}

/* [create/page.tsx]🧩 Gear select component - */
type GearSelectProps = {
  availableItems: GearItemOption[];
  disabled?: boolean;
  formatItemDisplay: (item: GearItemOption) => string;
  icon: string;
  label: string;
  onChange: (selected: GearItemOption | null) => void;
  selectedId: string | null | undefined;
  selectClassName: string;
  labelClassName: string;
  mutedClassName: string;
  helpText: string;
};

function GearSelect({
  availableItems,
  disabled = false,
  formatItemDisplay,
  icon,
  label,
  onChange,
  selectedId,
  selectClassName,
  labelClassName,
  mutedClassName,
  helpText,
}: GearSelectProps) {
  if (availableItems.length === 0) return null;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const selected = value
      ? availableItems.find((item) => item.id === value) ?? null
      : null;
    onChange(selected);
  };

  return (
    <div>
      <label className={labelClassName}>
        <i
          aria-hidden
          className={`${icon} mr-1.5 sm:mr-2 text-[var(--totk-light-green)]`}
        />
        {label}
      </label>
      <select
        className={selectClassName}
        value={selectedId ?? ""}
        onChange={handleChange}
        disabled={disabled}
      >
        <option value="">None</option>
        {availableItems.map((item) => (
          <option key={item.id} value={item.id}>
            {formatItemDisplay(item)}
          </option>
        ))}
      </select>
      <p className={mutedClassName}>{helpText}</p>
    </div>
  );
}

/* [create/page.tsx]🧩 Stat card component - */
type StatCardProps = {
  icon: string;
  iconColor: string;
  label: string;
  value: string;
  description: string;
  borderColor: string;
  bgColor: string;
};

function StatCard({
  icon,
  iconColor,
  label,
  value,
  description,
  borderColor,
  bgColor,
}: StatCardProps) {
  return (
    <div className={`flex min-w-0 items-center gap-2 sm:gap-3 rounded-lg border-2 ${borderColor} ${bgColor} px-3 py-2.5 sm:px-4 sm:py-3`}>
      <i
        aria-hidden
        className={`${icon} shrink-0 text-xl sm:text-2xl ${iconColor}`}
      />
      <div className="min-w-0 flex-1">
        <span className={`block text-xs sm:text-sm font-medium ${iconColor}`}>
          {label}
        </span>
        <span className={`block text-sm sm:text-base md:text-lg font-bold ${iconColor}`}>
          {value}
        </span>
        <p className="mt-0.5 text-[10px] sm:text-xs text-[var(--totk-grey-200)]">
          {description}
        </p>
      </div>
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

/* [create/page.tsx]🧱 Page shell - */
export default function CreateCharacterPage() {
  const { loading: sessionLoading, user } = useSession();
  const [metaError, setMetaError] = useState<string | null>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [metadata, setMetadata] = useState<CreateMetadata | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const fetchMetadata = useCallback(async () => {
    setMetaLoading(true);
    setMetaError(null);
    try {
      const res = await fetch("/api/characters/create-metadata");
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(
          (b as { error?: string }).error ?? `Request failed: ${res.status}`
        );
      }
      const data = (await res.json()) as CreateMetadata;
      setMetadata(data);
    } catch (e) {
      setMetaError(e instanceof Error ? e.message : String(e));
      setMetadata(null);
    } finally {
      setMetaLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  const loading = sessionLoading || metaLoading;
  const error = metaError;

  if (loading) {
    return (
      <div className="create-character-page min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[90rem]">
          <Loading
            message="Loading..."
            size="lg"
            variant="inline"
          />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="create-character-page min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[90rem]">
          <PageHeader />
          <div className="rounded-lg border-2 border-[var(--totk-green)] bg-[var(--totk-brown)]/80 p-4 sm:p-6">
            <p className="text-center text-[var(--botw-pale)]">
              Sign in to create a character.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !metadata) {
    return (
      <div className="create-character-page min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[90rem]">
          <PageHeader />
          <div className="rounded-lg border-2 border-[var(--totk-green)] bg-[var(--totk-brown)]/80 p-4 sm:p-6">
            <p className="text-center text-[var(--botw-pale)]">
              {error ?? "Failed to load form data."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="create-character-page min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[90rem]">
        <PageHeader />
        <CreateForm
          metadata={metadata}
          submitError={submitError}
          submitLoading={submitLoading}
          submitSuccess={submitSuccess}
          setSubmitError={setSubmitError}
          setSubmitLoading={setSubmitLoading}
          setSubmitSuccess={setSubmitSuccess}
        />
      </div>
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Create Form Component ------------------- */
/* ============================================================================ */

/* [create/page.tsx]🧱 Form component - */
export function CreateForm({
  metadata,
  setSubmitError,
  setSubmitLoading,
  setSubmitSuccess,
  submitError,
  submitLoading,
  submitSuccess,
  characterId,
  initialCharacter,
  onSubmitForReview,
  submittingForReview,
  characterStatus,
}: CreateFormProps) {
  const router = useRouter();
  const isEditMode = !!characterId && !!initialCharacter;
  
  // Helper function to check if a field is editable
  const isEditable = useCallback(
    (fieldName: string) => {
      if (!isEditMode) return true; // All fields editable in create mode
      return isFieldEditable(fieldName, characterStatus);
    },
    [isEditMode, characterStatus]
  );
  
  const [age, setAge] = useState(initialCharacter?.age?.toString() || "");
  const [appArtFile, setAppArtFile] = useState<File | null>(null);
  const [appArtPreview, setAppArtPreview] = useState<string | null>(
    initialCharacter?.appArt || null
  );
  const [appLink, setAppLink] = useState(initialCharacter?.appLink || "");
  // Parse birthday from MM-DD format to month and day
  const parseBirthday = (birthday: string | null | undefined): { month: string; day: string } => {
    if (!birthday || typeof birthday !== "string" || birthday.trim() === "") {
      return { month: "", day: "" };
    }
    const trimmed = birthday.trim();
    const [month, day] = trimmed.split("-");
    if (!month || !day) {
      return { month: "", day: "" };
    }
    // Ensure month and day are properly padded
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    if (isNaN(monthNum) || isNaN(dayNum) || monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) {
      return { month: "", day: "" };
    }
    return {
      month: String(monthNum).padStart(2, "0"),
      day: String(dayNum).padStart(2, "0"),
    };
  };
  const initialBirthday = parseBirthday(initialCharacter?.birthday || null);
  const [birthdayMonth, setBirthdayMonth] = useState(initialBirthday.month);
  const [birthdayDay, setBirthdayDay] = useState(initialBirthday.day);
  const [equippedChest, setEquippedChest] = useState<GearItemOption | null>(
    null
  );
  const [equippedHead, setEquippedHead] = useState<GearItemOption | null>(null);
  const [equippedLegs, setEquippedLegs] = useState<GearItemOption | null>(null);
  const [equippedShield, setEquippedShield] = useState<GearItemOption | null>(
    null
  );
  const [equippedWeapon, setEquippedWeapon] = useState<GearItemOption | null>(
    null
  );
  // Refs always hold latest weapon/shield so submit uses current selection (avoids stale closure)
  const equippedWeaponRef = useRef<GearItemOption | null>(null);
  const equippedShieldRef = useRef<GearItemOption | null>(null);
  equippedWeaponRef.current = equippedWeapon;
  equippedShieldRef.current = equippedShield;
  const [extras, setExtras] = useState(initialCharacter?.extras || "");
  const [gearConflictAlert, setGearConflictAlert] = useState<string | null>(
    null
  );
  const [gender, setGender] = useState(initialCharacter?.gender || "");
  const [height, setHeight] = useState(initialCharacter?.height?.toString() || "");
  const [history, setHistory] = useState(initialCharacter?.history || "");
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string | null>(
    initialCharacter?.icon || null
  );
  const [job, setJob] = useState(initialCharacter?.job || "");
  const [name, setName] = useState(initialCharacter?.name || "");
  const [personality, setPersonality] = useState(initialCharacter?.personality || "");
  const [pronouns, setPronouns] = useState(initialCharacter?.pronouns || "");
  const [race, setRace] = useState(initialCharacter?.race || "");
  const [village, setVillage] = useState(initialCharacter?.homeVillage || initialCharacter?.village || "");
  // Capitalize virtue to match VIRTUES array format (API stores lowercase)
  const [virtue, setVirtue] = useState(
    initialCharacter?.virtue 
      ? initialCharacter.virtue.charAt(0).toUpperCase() + initialCharacter.virtue.slice(1).toLowerCase()
      : ""
  );

  /* [create/page.tsx]✨ Pre-submission checklist (required before Submit for Review / Submit Character) - */
  const [checklist, setChecklist] = useState({
    reservation: false,
    visualApp: false,
    guide: false,
    villageLore: false,
    groupLore: false,
    coreRules: false,
  });
  const allChecklistChecked =
    checklist.reservation &&
    checklist.visualApp &&
    checklist.guide &&
    checklist.villageLore &&
    checklist.groupLore &&
    checklist.coreRules;

  const setChecklistItem = useCallback((key: keyof typeof checklist, value: boolean) => {
    setChecklist((prev) => ({ ...prev, [key]: value }));
  }, []);

  /* [create/page.tsx]✨ Class name constants - */
  const styles = {
    input:
      "w-full rounded border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] px-3 py-2.5 text-base text-[var(--botw-pale)] placeholder-[var(--totk-grey-300)] focus:border-[var(--totk-light-green)] focus:bg-[var(--botw-warm-black)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/30 disabled:opacity-60 disabled:cursor-not-allowed [&:not(textarea)]:min-h-[44px] sm:text-base",
    label: "block text-sm sm:text-base font-medium text-[var(--totk-light-green)] mb-1.5 sm:mb-2",
    labelMuted: "block text-xs sm:text-sm text-[var(--totk-grey-200)] mb-1.5 sm:mb-2 leading-relaxed",
    section:
      "rounded-lg border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] p-3 sm:p-4 md:p-6 shadow-[0_4px_12px_rgba(0,0,0,0.4)]",
    sectionHeader:
      "mb-3 sm:mb-4 flex items-center gap-2 border-b border-[var(--totk-green)] pb-2",
    sectionTitle:
      "text-base sm:text-lg md:text-xl font-semibold text-[var(--totk-light-green)]",
    select:
      "w-full rounded border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] px-3 py-3 text-base text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:bg-[var(--botw-warm-black)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/30 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-h-[48px] touch-manipulation sm:py-2.5 sm:min-h-[44px]",
  };

  /* [create/page.tsx]🧠 Gear filtering and utilities - */
  const starterGearIds = useMemo(
    () => new Set(metadata.starterGear.map((g) => g.id)),
    [metadata.starterGear]
  );

  const availableGearItems = useMemo(() => {
    const filterWeapon = (w: GearItemOption) => {
      if (!starterGearIds.has(w.id)) return false;
      const itemData = gearItemToItemData(w);
      return getWeaponType(itemData) !== null && !isShield(itemData);
    };

    return {
      chestArmor: metadata.gearItems.chestArmor.filter((c) =>
        starterGearIds.has(c.id)
      ),
      headArmor: metadata.gearItems.headArmor.filter((h) =>
        starterGearIds.has(h.id)
      ),
      legsArmor: metadata.gearItems.legsArmor.filter((l) =>
        starterGearIds.has(l.id)
      ),
      shields: metadata.gearItems.shields.filter((s) =>
        starterGearIds.has(s.id)
      ),
      weapons: metadata.gearItems.weapons.filter(filterWeapon),
    };
  }, [metadata.gearItems, starterGearIds]);

  const formatItemDisplay = useCallback((item: GearItemOption): string => {
    const itemData = gearItemToItemData(item);
    const weaponType = getWeaponType(itemData);

    if (weaponType) {
      return `${item.name} | ${weaponType.toUpperCase()}`;
    }

    if (isShield(itemData)) {
      return `${item.name} | Shield`;
    }

    const armorSlot = getArmorSlot(itemData);
    if (armorSlot) {
      const slotDisplay =
        armorSlot.charAt(0).toUpperCase() + armorSlot.slice(1);
      return `${item.name} | ${slotDisplay}`;
    }

    return item.name;
  }, []);

  /* [create/page.tsx]🧠 Load initial gear from character data once per character — do not re-run when availableGearItems ref changes or we overwrite user's weapon/shield selection. */
  const gearInitKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isEditMode || !initialCharacter || availableGearItems.weapons.length === 0) return;
    const key = String(initialCharacter._id ?? "new");
    if (gearInitKeyRef.current === key) return;
    gearInitKeyRef.current = key;

    const gearWeapon = initialCharacter.gearWeapon;
    const gearShield = initialCharacter.gearShield;

    if (gearWeapon) {
      const found = findGearItemByName(gearWeapon.name, availableGearItems);
      if (found) {
        if (found.actualType === "weapon") {
          setEquippedWeapon(found.item);
        } else if (found.actualType === "shield" && !gearShield) {
          console.warn(
            `Character has shield "${gearWeapon.name}" incorrectly stored in gearWeapon slot. Moving to shield slot.`
          );
          setEquippedShield(found.item);
        } else {
          console.warn(
            `Character has non-weapon item "${gearWeapon.name}" in gearWeapon slot. Ignoring.`
          );
        }
      }
    }

    if (gearShield) {
      const found = findGearItemByName(gearShield.name, availableGearItems);
      if (found) {
        if (found.actualType === "shield") {
          setEquippedShield(found.item);
        } else {
          console.warn(
            `Character has non-shield item "${gearShield.name}" in gearShield slot. Ignoring.`
          );
        }
      }
    }
  }, [isEditMode, initialCharacter, availableGearItems.weapons.length, availableGearItems.shields.length]);

  useEffect(() => {
    if (isEditMode && initialCharacter && availableGearItems.headArmor.length > 0) {
      const gearHead = initialCharacter.gearArmor?.head;
      if (gearHead) {
        const head = availableGearItems.headArmor.find(
          (h) => h.name === gearHead.name
        );
        if (head) setEquippedHead(head);
      }
    }
  }, [isEditMode, initialCharacter, availableGearItems.headArmor]);

  useEffect(() => {
    if (isEditMode && initialCharacter && availableGearItems.chestArmor.length > 0) {
      const gearChest = initialCharacter.gearArmor?.chest;
      if (gearChest) {
        const chest = availableGearItems.chestArmor.find(
          (c) => c.name === gearChest.name
        );
        if (chest) setEquippedChest(chest);
      }
      // Don't pre-fill defaults when editing existing characters
    } else if (!isEditMode && availableGearItems.chestArmor.length > 0 && !equippedChest) {
      // Only pre-fill defaults for newly created characters
      const oldShirt = availableGearItems.chestArmor.find(
        (item) => item.name === DEFAULT_CHEST_ARMOR
      );
      if (oldShirt) {
        setEquippedChest(oldShirt);
      }
    }
  }, [isEditMode, initialCharacter, availableGearItems.chestArmor, equippedChest]);

  useEffect(() => {
    if (isEditMode && initialCharacter && availableGearItems.legsArmor.length > 0) {
      const gearLegs = initialCharacter.gearArmor?.legs;
      if (gearLegs) {
        const legs = availableGearItems.legsArmor.find(
          (l) => l.name === gearLegs.name
        );
        if (legs) setEquippedLegs(legs);
      }
      // Don't pre-fill defaults when editing existing characters
    } else if (!isEditMode && availableGearItems.legsArmor.length > 0 && !equippedLegs) {
      // Only pre-fill defaults for newly created characters
      const wellWornTrousers = availableGearItems.legsArmor.find(
        (item) => item.name === DEFAULT_LEGS_ARMOR
      );
      if (wellWornTrousers) {
        setEquippedLegs(wellWornTrousers);
      }
    }
  }, [isEditMode, initialCharacter, availableGearItems.legsArmor, equippedLegs]);

  /* [create/page.tsx]🧠 Sync village value when metadata loads (initial load only; do not overwrite user's selection). */
  useEffect(() => {
    if (isEditMode && initialCharacter && metadata?.villages && metadata.villages.length > 0) {
      const charVillage = initialCharacter.homeVillage || initialCharacter.village;
      if (charVillage) {
        let matchedVillage = metadata.villages.find(v => v === charVillage);
        if (!matchedVillage) {
          matchedVillage = metadata.villages.find(
            v => v.toLowerCase() === charVillage.toLowerCase()
          );
        }
        if (!matchedVillage) {
          matchedVillage = metadata.villages.find(
            v => v.trim().toLowerCase() === charVillage.trim().toLowerCase()
          );
        }
        if (matchedVillage) {
          setVillage(matchedVillage);
        }
      }
    }
    // Intentionally omit village from deps so we only sync from initialCharacter/metadata, not when user changes village
  }, [isEditMode, initialCharacter, metadata?.villages]);

  /* [create/page.tsx]🧠 Sync job value when metadata and village are loaded (initial load only; do not overwrite user's selection). */
  useEffect(() => {
    if (isEditMode && initialCharacter?.job && village && metadata?.jobsByVillage) {
      const availableJobs = metadata.jobsByVillage[village] ?? metadata.jobs ?? [];
      let matchedJob = availableJobs.find(j => j === initialCharacter.job);
      if (!matchedJob) {
        matchedJob = availableJobs.find(
          j => j.toLowerCase() === initialCharacter.job?.toLowerCase()
        );
      }
      if (!matchedJob) {
        matchedJob = availableJobs.find(
          j => j.trim().toLowerCase() === initialCharacter.job?.trim().toLowerCase()
        );
      }
      if (matchedJob) {
        setJob(matchedJob);
      }
    }
    // Intentionally omit job from deps so we only sync from initialCharacter/village/metadata, not when user changes job
  }, [isEditMode, initialCharacter?.job, village, metadata?.jobsByVillage, metadata?.jobs]);

  /* [create/page.tsx]🧠 Sync race value when metadata loads (initial load only; do not overwrite user's selection). */
  useEffect(() => {
    if (isEditMode && initialCharacter?.race && metadata?.races?.length) {
      const races = metadata.races as Array<{ name: string; value: string }>;
      let matched = races.find(r => r.value === initialCharacter.race);
      if (!matched) {
        matched = races.find(
          r => r.value.toLowerCase() === initialCharacter.race?.toLowerCase()
        );
      }
      if (!matched) {
        matched = races.find(
          r => r.value.trim().toLowerCase() === initialCharacter.race?.trim().toLowerCase()
        );
      }
      if (matched) {
        setRace(matched.value);
      }
    }
    // Intentionally omit race from deps so we only sync from initialCharacter/metadata, not when user changes race
  }, [isEditMode, initialCharacter?.race, metadata?.races]);

  /* [create/page.tsx]🧠 Sync birthday value when initialCharacter changes - */
  useEffect(() => {
    if (isEditMode && initialCharacter) {
      const parsed = parseBirthday(initialCharacter.birthday || null);
      setBirthdayMonth(parsed.month);
      setBirthdayDay(parsed.day);
    }
  }, [isEditMode, initialCharacter?.birthday]);

  /* [create/page.tsx]🧠 Unsaved changes: warn before leaving (edit mode) so users don't lose edits by accident. */
  const isDirty = useMemo(() => {
    if (!isEditMode || !initialCharacter) return false;
    const trim = (s: string | undefined) => (s ?? "").trim();
    const init = initialCharacter;
    const initBday = parseBirthday(init.birthday ?? null);
    const currentBday = birthdayMonth.trim() && birthdayDay.trim()
      ? `${String(parseInt(birthdayMonth.trim(), 10)).padStart(2, "0")}-${String(parseInt(birthdayDay.trim(), 10)).padStart(2, "0")}`
      : "";
    const initBdayStr = initBday.month && initBday.day ? `${initBday.month.padStart(2, "0")}-${initBday.day.padStart(2, "0")}` : "";
    if (trim(name) !== trim(init.name ?? "")) return true;
    if (trim(age) !== trim(String(init.age ?? ""))) return true;
    if (trim(height) !== trim(String(init.height ?? ""))) return true;
    if (trim(pronouns) !== trim(init.pronouns ?? "")) return true;
    if (trim(gender) !== trim(init.gender ?? "")) return true;
    if (trim(race) !== trim(init.race ?? "")) return true;
    if (trim(village) !== (trim(init.homeVillage ?? init.village ?? ""))) return true;
    if (trim(job) !== trim(init.job ?? "")) return true;
    if (trim(virtue) !== trim(init.virtue ?? "")) return true;
    if (trim(personality) !== trim(init.personality ?? "")) return true;
    if (trim(history) !== trim(init.history ?? "")) return true;
    if (trim(extras) !== trim(init.extras ?? "")) return true;
    if (trim(appLink) !== trim(init.appLink ?? "")) return true;
    if (currentBday !== initBdayStr) return true;
    if (iconFile && iconFile instanceof File && iconFile.size > 0) return true;
    if (appArtFile && appArtFile instanceof File && appArtFile.size > 0) return true;
    return false;
  }, [
    isEditMode,
    initialCharacter,
    name,
    age,
    height,
    pronouns,
    gender,
    race,
    village,
    job,
    virtue,
    personality,
    history,
    extras,
    appLink,
    birthdayMonth,
    birthdayDay,
    iconFile,
    appArtFile,
  ]);

  useEffect(() => {
    if (!isEditMode || !isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isEditMode, isDirty]);

  /* [create/page.tsx]🧠 Auto-dismiss alerts - */
  useEffect(() => {
    if (gearConflictAlert) {
      const timer = setTimeout(() => {
        setGearConflictAlert(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [gearConflictAlert]);

  /* [create/page.tsx]🧠 File preview cleanup - */
  const iconPreviewRef = useRef<string | null>(null);
  const appArtPreviewRef = useRef<string | null>(null);
  useEffect(() => {
    iconPreviewRef.current = iconPreview;
    appArtPreviewRef.current = appArtPreview;
    return () => {
      if (iconPreviewRef.current) {
        URL.revokeObjectURL(iconPreviewRef.current);
      }
      if (appArtPreviewRef.current) {
        URL.revokeObjectURL(appArtPreviewRef.current);
      }
    };
  }, [appArtPreview, iconPreview]);

  /* [create/page.tsx]🧠 File handlers - */
  const handleAppArtChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      setAppArtFile(f ?? null);
      setAppArtPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return f ? URL.createObjectURL(f) : null;
      });
    },
    []
  );

  const handleIconChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      setIconFile(f ?? null);
      setIconPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return f ? URL.createObjectURL(f) : null;
      });
    },
    []
  );

  /* [create/page.tsx]🧠 Validation - */
  const validate = useCallback((): string | null => {
    const o: Record<string, unknown> = {
      age: age.trim(),
      appArt: appArtFile,
      gender: gender.trim(),
      history: history.trim(),
      icon: iconFile,
      job: job.trim(),
      name: name.trim(),
      personality: personality.trim(),
      pronouns: pronouns.trim(),
      race: race.trim(),
      village: village.trim(),
      virtue: virtue.trim(),
    };

    let r = validateRequired(o, [
      "name",
      "pronouns",
      "gender",
      "race",
      "village",
      "job",
      "virtue",
      "personality",
      "history",
    ]);
    if (!r.ok) return r.error;

    // Only require files on create. Editing should not force re-uploads (legacy OCs may have blank URLs).
    if (!isEditMode) {
      if (!iconFile || iconFile.size === 0) return "Icon file is required.";
      if (!appArtFile || appArtFile.size === 0) return "App art file is required.";
    }

    r = validateAge(age || undefined);
    if (!r.ok) return r.error;

    r = validateHeight(height || undefined);
    if (!r.ok) return r.error;

    r = validateHearts(DEFAULT_HEARTS);
    if (!r.ok) return r.error;

    r = validateStamina(DEFAULT_STAMINA);
    if (!r.ok) return r.error;

    r = validateAppLink(appLink || undefined);
    if (!r.ok) return r.error;

    const filesToValidate: File[] = [];
    if (iconFile) filesToValidate.push(iconFile);
    if (appArtFile) filesToValidate.push(appArtFile);
    
    if (filesToValidate.length > 0) {
      r = validateFileTypes(filesToValidate, [...ALLOWED_IMAGE_TYPES]);
      if (!r.ok) return r.error;

      r = validateFileSizes(filesToValidate, MAX_FILE_BYTES);
      if (!r.ok) return r.error;
    }

    return null;
  }, [
    age,
    appArtFile,
    appArtPreview,
    appLink,
    gender,
    height,
    history,
    iconFile,
    iconPreview,
    isEditMode,
    job,
    name,
    personality,
    pronouns,
    race,
    village,
    virtue,
  ]);

  /* [create/page.tsx]🧠 Gear conflict handlers - */
  const handleWeaponChange = useCallback(
    (selected: GearItemOption | null) => {
      // When unequipping (selected is null), just set weapon to null
      // Don't touch shield or call equipItem
      if (!selected) {
        setEquippedWeapon(null);
        return;
      }

      const currentGear = buildEquippedGearState(
        equippedWeapon,
        equippedShield,
        equippedHead,
        equippedChest,
        equippedLegs
      );

      const itemData = gearItemToItemData(selected);
      const newGear = equipItem(itemData, currentGear);
      const hadShield = !!currentGear.gearShield;
      const shieldUnequipped = !newGear.gearShield && hadShield;

      setEquippedWeapon(selected);
      if (shieldUnequipped) {
        setEquippedShield(null);
        const weaponType = getWeaponType(itemData);
        if (weaponType === "2h") {
          setGearConflictAlert(
            `Equipped ${selected.name} (2H weapon). Shield automatically unequipped.`
          );
        } else if (weaponType === "bow") {
          setGearConflictAlert(
            `Equipped ${selected.name} (bow). Shield automatically unequipped.`
          );
        }
      } else if (!newGear.gearShield) {
        setEquippedShield(null);
      }
    },
    [equippedChest, equippedHead, equippedLegs, equippedShield, equippedWeapon]
  );

  const handleShieldChange = useCallback(
    (selected: GearItemOption | null) => {
      const currentGear = buildEquippedGearState(
        equippedWeapon,
        equippedShield,
        equippedHead,
        equippedChest,
        equippedLegs
      );

      if (selected) {
        const itemData = gearItemToItemData(selected);
        const currentWeaponItem = equippedWeapon
          ? gearItemToItemData(equippedWeapon)
          : undefined;
        const newGear = equipItem(itemData, currentGear, currentWeaponItem);
        const hadWeapon = !!currentGear.gearWeapon;
        const weaponUnequipped = !newGear.gearWeapon && hadWeapon;

        setEquippedShield(selected);
        if (weaponUnequipped && equippedWeapon) {
          const weaponType = getWeaponType(currentWeaponItem!);
          setEquippedWeapon(null);
          if (weaponType === "2h") {
            setGearConflictAlert(
              `Equipped ${selected.name}. ${equippedWeapon.name} (2H weapon) automatically unequipped.`
            );
          } else if (weaponType === "bow") {
            setGearConflictAlert(
              `Equipped ${selected.name}. ${equippedWeapon.name} (bow) automatically unequipped.`
            );
          }
        } else if (!newGear.gearWeapon) {
          setEquippedWeapon(null);
        }
      } else {
        setEquippedShield(null);
      }
    },
    [equippedChest, equippedHead, equippedLegs, equippedShield, equippedWeapon]
  );

  const handleHeadChange = useCallback(
    (selected: GearItemOption | null) => {
      setEquippedHead(selected);
    },
    []
  );

  const handleChestChange = useCallback(
    (selected: GearItemOption | null) => {
      setEquippedChest(selected);
    },
    []
  );

  const handleLegsChange = useCallback(
    (selected: GearItemOption | null) => {
      setEquippedLegs(selected);
    },
    []
  );

  /* [create/page.tsx]🧠 Submit handler - */
  const submit = useCallback(
    async (doSubmit: boolean) => {
      setSubmitError(null);
      setSubmitSuccess(null);
      if (doSubmit && !allChecklistChecked) {
        setSubmitError("Please complete all items in the “Before you submit for review” checklist before submitting.");
        return;
      }
      const err = validate();
      if (err) {
        setSubmitError(err);
        return;
      }

      setSubmitLoading(true);
      try {
        const submitLockedString = (fieldName: string, value: string, initialValue?: string) => {
          if (isEditMode && initialCharacter && !isEditable(fieldName)) {
            return typeof initialValue === "string" ? initialValue : value;
          }
          return value.trim();
        };
        const submitLockedOptionalNumberString = (
          fieldName: string,
          value: string,
          initialValue?: number | null
        ) => {
          if (isEditMode && initialCharacter && !isEditable(fieldName)) {
            return initialValue == null ? "" : String(initialValue);
          }
          return value.trim() || "";
        };

        const form = new FormData();
        form.set(
          "age",
          submitLockedOptionalNumberString("age", age, initialCharacter?.age ?? null)
        );
        form.set("appLink", submitLockedString("appLink", appLink, initialCharacter?.appLink));
        form.set("extras", submitLockedString("extras", extras, initialCharacter?.extras));
        form.set("gender", submitLockedString("gender", gender, initialCharacter?.gender));
        form.set("hearts", String(isEditMode && initialCharacter?.maxHearts ? initialCharacter.maxHearts : DEFAULT_HEARTS));
        form.set(
          "height",
          submitLockedOptionalNumberString("height", height, initialCharacter?.height ?? null)
        );
        form.set(
          "history",
          submitLockedString("history", history, initialCharacter?.history)
        );
        form.set("job", submitLockedString("job", job, initialCharacter?.job));
        form.set("name", submitLockedString("name", name, initialCharacter?.name));
        form.set(
          "personality",
          submitLockedString("personality", personality, initialCharacter?.personality)
        );
        form.set(
          "pronouns",
          submitLockedString("pronouns", pronouns, initialCharacter?.pronouns)
        );
        form.set("race", submitLockedString("race", race, initialCharacter?.race));
        form.set("stamina", String(isEditMode && initialCharacter?.maxStamina ? initialCharacter.maxStamina : DEFAULT_STAMINA));
        if (!isEditMode) {
          form.set("submit", doSubmit ? "true" : "false");
        }
        form.set(
          "village",
          submitLockedString(
            "homeVillage",
            village,
            initialCharacter?.homeVillage ?? initialCharacter?.village
          )
        );
        form.set("virtue", submitLockedString("virtue", virtue, initialCharacter?.virtue) || "TBA");
        // Combine month and day into MM-DD format
        if (birthdayMonth.trim() && birthdayDay.trim()) {
          const monthNum = parseInt(birthdayMonth.trim(), 10);
          const dayNum = parseInt(birthdayDay.trim(), 10);
          // Validate month (1-12) and day (1-31)
          if (!isNaN(monthNum) && !isNaN(dayNum) && monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
            const month = String(monthNum).padStart(2, "0");
            const day = String(dayNum).padStart(2, "0");
            form.set("birthday", `${month}-${day}`);
          } else {
            form.set("birthday", "");
          }
        } else {
          form.set("birthday", "");
        }

        if (iconFile) form.set("icon", iconFile);
        if (appArtFile) form.set("appArt", appArtFile);

        // Check if gear fields are editable
        const canEditGear = isEditable("gearWeapon") && isEditable("gearShield") && isEditable("gearArmor");

        let gearForSubmit: {
          gearArmor: {
            chest: { name: string; stats: Record<string, number> } | null;
            head: { name: string; stats: Record<string, number> } | null;
            legs: { name: string; stats: Record<string, number> } | null;
          } | null;
          gearShield: { name: string; stats: Record<string, number> } | null;
          gearWeapon: { name: string; stats: Record<string, number> } | null;
        };

        // If gear is not editable (e.g., status is "accepted"), preserve existing gear from initialCharacter
        if (isEditMode && !canEditGear && initialCharacter) {
          // Convert existing gear from initialCharacter to the format expected by API
          const convertStats = (stats: Record<string, number> | Map<string, number> | undefined): Record<string, number> => {
            if (!stats) return {};
            if (stats instanceof Map) {
              return Object.fromEntries(stats);
            }
            return stats;
          };

          gearForSubmit = {
            gearArmor: initialCharacter.gearArmor
              ? {
                  chest: initialCharacter.gearArmor.chest
                    ? {
                        name: initialCharacter.gearArmor.chest.name,
                        stats: convertStats(initialCharacter.gearArmor.chest.stats),
                      }
                    : null,
                  head: initialCharacter.gearArmor.head
                    ? {
                        name: initialCharacter.gearArmor.head.name,
                        stats: convertStats(initialCharacter.gearArmor.head.stats),
                      }
                    : null,
                  legs: initialCharacter.gearArmor.legs
                    ? {
                        name: initialCharacter.gearArmor.legs.name,
                        stats: convertStats(initialCharacter.gearArmor.legs.stats),
                      }
                    : null,
                }
              : null,
            gearShield: initialCharacter.gearShield
              ? {
                  name: initialCharacter.gearShield.name,
                  stats: convertStats(initialCharacter.gearShield.stats),
                }
              : null,
            gearWeapon: initialCharacter.gearWeapon
              ? {
                  name: initialCharacter.gearWeapon.name,
                  stats: convertStats(initialCharacter.gearWeapon.stats),
                }
              : null,
          };
        } else {
          // Build gear from form state (for create mode or when gear is editable).
          // Use refs for weapon/shield so we always send the latest selection (avoids stale closure on fast click).
          const latestWeapon = equippedWeaponRef.current;
          const latestShield = equippedShieldRef.current;
          let currentGear: EquippedGear = { gearArmor: {} };

          if (latestWeapon) {
            currentGear = equipItem(gearItemToItemData(latestWeapon), currentGear);
          }

          if (latestShield) {
            const currentWeaponItem = latestWeapon
              ? gearItemToItemData(latestWeapon)
              : undefined;
            currentGear = equipItem(
              gearItemToItemData(latestShield),
              currentGear,
              currentWeaponItem
            );
          }

          if (equippedHead) {
            currentGear = equipItem(gearItemToItemData(equippedHead), currentGear);
          }

          if (equippedChest) {
            currentGear = equipItem(gearItemToItemData(equippedChest), currentGear);
          }

          if (equippedLegs) {
            currentGear = equipItem(gearItemToItemData(equippedLegs), currentGear);
          }

          // Convert gear to format for API
          const convertStats = (stats: Record<string, number> | Map<string, number> | undefined): Record<string, number> => {
            if (!stats) return {};
            if (stats instanceof Map) return Object.fromEntries(stats);
            return stats;
          };
          // Client-side safeguard: never send a shield in weapon slot or a weapon in shield slot
          let gearWeaponForSubmit: { name: string; stats: Record<string, number> } | null =
            currentGear.gearWeapon
              ? {
                  name: currentGear.gearWeapon.name,
                  stats: statsToRecord(currentGear.gearWeapon.stats),
                }
              : null;
          let gearShieldForSubmit: { name: string; stats: Record<string, number> } | null =
            currentGear.gearShield
              ? {
                  name: currentGear.gearShield.name,
                  stats: statsToRecord(currentGear.gearShield.stats),
                }
              : null;
          if (latestWeapon && isShield(gearItemToItemData(latestWeapon))) {
            gearWeaponForSubmit = null;
            if (!gearShieldForSubmit) {
              gearShieldForSubmit = {
                name: latestWeapon.name,
                stats: { attack: latestWeapon.modifierHearts, defense: latestWeapon.modifierHearts },
              };
            }
          }
          if (latestShield && getWeaponType(gearItemToItemData(latestShield)) !== null) {
            gearShieldForSubmit = null;
          }
          gearForSubmit = {
            gearArmor: currentGear.gearArmor
              ? {
                  chest: currentGear.gearArmor.chest
                    ? {
                        name: currentGear.gearArmor.chest.name,
                        stats: statsToRecord(
                          currentGear.gearArmor.chest.stats
                        ),
                      }
                    : (isEditMode && initialCharacter?.gearArmor?.chest
                        ? {
                            name: initialCharacter.gearArmor.chest.name,
                            stats: convertStats(initialCharacter.gearArmor.chest.stats),
                          }
                        : null),
                  head: currentGear.gearArmor.head
                    ? {
                        name: currentGear.gearArmor.head.name,
                        stats: statsToRecord(
                          currentGear.gearArmor.head.stats
                        ),
                      }
                    : null,
                  legs: currentGear.gearArmor.legs
                    ? {
                        name: currentGear.gearArmor.legs.name,
                        stats: statsToRecord(
                          currentGear.gearArmor.legs.stats
                        ),
                      }
                    : (isEditMode && initialCharacter?.gearArmor?.legs
                        ? {
                            name: initialCharacter.gearArmor.legs.name,
                            stats: convertStats(initialCharacter.gearArmor.legs.stats),
                          }
                        : null),
                }
              : null,
            gearShield: gearShieldForSubmit,
            gearWeapon: gearWeaponForSubmit,
          };
        }

        form.set("equippedGear", JSON.stringify(gearForSubmit));
        // Backup: send weapon/shield names as plain fields so API always persists user's selection
        if (isEditMode && canEditGear) {
          const w = equippedWeaponRef.current ?? equippedWeapon;
          const s = equippedShieldRef.current ?? equippedShield;
          if (w?.name) form.set("gearWeaponName", w.name);
          if (s?.name) form.set("gearShieldName", s.name);
        }

        const url = isEditMode ? `/api/characters/${characterId}` : "/api/characters/create";
        const method = isEditMode ? "PUT" : "POST";
        
        const res = await fetch(url, {
          body: form,
          method,
        });
        const data = (await res.json()) as {
          character?: { _id?: string; name?: string };
          error?: string;
        };

        if (!res.ok) {
          throw new Error(data.error ?? `Request failed: ${res.status}`);
        }

        if (isEditMode) {
          setSubmitSuccess(
            data.character?.name
              ? `All changes saved. "${data.character.name}" has been updated. Redirecting…`
              : "All changes saved. Redirecting…"
          );
          // Redirect after a short delay so the user sees the success message (avoids "did my stuff save?" confusion)
          if (data.character?.name) {
            const slug = createSlug(data.character.name);
            const redirectUrl = `/characters/${slug}?t=${Date.now()}&saved=1`;
            setTimeout(() => router.push(redirectUrl), 2200);
          }
        } else {
          setSubmitSuccess(
            data.character?.name
              ? `Character "${data.character.name}" created${
                  doSubmit ? " and submitted for review" : ""
                }.`
              : "Character created."
          );
          // Redirect to character page after successful creation using slug
          // Add cache-busting param so the detail page fetches fresh data
          if (data.character?.name) {
            const slug = createSlug(data.character.name);
            router.push(`/characters/${slug}?t=${Date.now()}`);
          }
        }
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : String(e));
      } finally {
        setSubmitLoading(false);
      }
    },
    [
      age,
      appArtFile,
      appLink,
      birthdayMonth,
      birthdayDay,
      equippedChest,
      equippedHead,
      equippedLegs,
      equippedShield,
      equippedWeapon,
      extras,
      gender,
      height,
      history,
      iconFile,
      job,
      name,
      personality,
      pronouns,
      race,
      setSubmitError,
      setSubmitLoading,
      setSubmitSuccess,
      validate,
      village,
      virtue,
      isEditMode,
      characterId,
      initialCharacter,
      allChecklistChecked,
    ]
  );

  /* [create/page.tsx]🧠 Job options helper - */
  const jobOptions = useMemo(() => {
    if (!village) return metadata.jobs;
    return metadata.jobsByVillage[village] ?? metadata.jobs;
  }, [metadata.jobs, metadata.jobsByVillage, village]);

  /* [create/page.tsx]🧠 Status banner config helper - */
  const getStatusBannerConfig = useCallback((status: CharacterStatus | null | undefined) => {
    if (!status) return null;
    
    if (status === "pending") {
      return {
        borderColor: "border-[#ffa500]",
        bgColor: "bg-[#ffa500]/10",
        icon: "fa-solid fa-clock",
        iconColor: "text-[#ffa500]",
        title: "Character Under Review",
        titleColor: "text-[#ffa500]",
        description: "This character is currently under review. No fields can be edited until moderation is complete.",
      };
    }
    
    if (status === "accepted") {
      return {
        borderColor: "border-[var(--totk-light-green)]",
        bgColor: "bg-[var(--totk-light-green)]/10",
        icon: "fa-solid fa-lock",
        iconColor: "text-[var(--totk-light-green)]",
        title: "Character Approved - Limited Editing",
        titleColor: "text-[var(--totk-light-green)]",
        description: "This character has been approved. Only profile fields (age, height, pronouns, icon, personality, history, extras, gender, virtue, appLink, appArt, birthday) can be edited.",
      };
    }
    
    return {
      borderColor: "border-[var(--botw-blue)]",
      bgColor: "bg-[var(--botw-blue)]/10",
      icon: "fa-solid fa-edit",
      iconColor: "text-[var(--botw-blue)]",
      title: "Changes Requested - Editing Enabled",
      titleColor: "text-[var(--botw-blue)]",
      description: "Moderators have requested changes. You can now edit all fields except name, stats, and gear to address their feedback.",
    };
  }, []);

  /* [create/page.tsx]🧠 Height conversion - */
  const heightConversion = useMemo(() => {
    const heightNum = parseFloat(height);
    if (!height || isNaN(heightNum) || heightNum <= 0) return null;
    return convertCmToFeetInches(heightNum);
  }, [height]);

  return (
    <form
      className="space-y-3 sm:space-y-4 md:space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isEditMode && !allChecklistChecked) return;
        submit(false);
      }}
    >
      {/* Warning Banner */}
      <div className="rounded-lg border-2 border-[#ff6347] bg-[#ff6347]/10 px-3 py-2.5 sm:px-4 sm:py-3 text-[var(--botw-pale)]">
        <div className="flex items-start gap-2 sm:gap-3">
          <i
            aria-hidden
            className="fa-solid fa-triangle-exclamation text-lg sm:text-xl text-[#ff6347] shrink-0 mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm sm:text-base font-semibold text-[#ff6347] mb-1">Important Warning</p>
            <p className="text-xs sm:text-sm leading-relaxed">
              Please save all your information in an external document as it will not be saved if something happens or your connection is lost.
            </p>
          </div>
        </div>
      </div>

      {/* Status Banner - Show when editing and fields are locked */}
      {isEditMode && characterStatus && (() => {
        const config = getStatusBannerConfig(characterStatus);
        if (!config) return null;
        
        return (
          <div className={`rounded-lg border-2 px-3 py-2.5 sm:px-4 sm:py-3 text-[var(--botw-pale)] ${config.borderColor} ${config.bgColor}`}>
            <div className="flex items-start gap-2 sm:gap-3">
              <i
                aria-hidden
                className={`${config.icon} text-lg sm:text-xl shrink-0 mt-0.5 ${config.iconColor}`}
              />
              <div className="min-w-0 flex-1">
                <p className={`text-sm sm:text-base font-semibold mb-1 ${config.titleColor}`}>
                  {config.title}
                </p>
                <p className="text-xs sm:text-sm leading-relaxed">
                  {config.description}
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Basic Information */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <i
            aria-hidden
            className="fa-solid fa-user text-xl text-[var(--totk-light-green)]"
          />
          <h2 className={styles.sectionTitle}>Basic Information</h2>
        </div>
        <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
          <div>
            <label
              className={styles.label}
              htmlFor="name"
            >
              <i
                aria-hidden
                className="fa-solid fa-signature mr-1.5 sm:mr-2 text-[var(--totk-light-green)]"
              />
              Character Name *
            </label>
            <input
              className={styles.input}
              id="name"
              placeholder="Enter character name"
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isEditable("name")}
            />
            <p className={styles.labelMuted}>
              Choose a unique name for your character
            </p>
          </div>
          <div>
            <label
              className={styles.label}
              htmlFor="age"
            >
              <i
                aria-hidden
                className="fa-solid fa-birthday-cake mr-2 text-[var(--totk-light-green)]"
              />
              Age *
            </label>
            <input
              className={styles.input}
              id="age"
              min={1}
              placeholder="Enter age"
              required
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              disabled={!isEditable("age")}
            />
            <p className={styles.labelMuted}>
              Character&apos;s age (must be 1 or greater)
            </p>
          </div>
          <div>
            <label
              className={styles.label}
              htmlFor="height"
            >
              <i
                aria-hidden
                className="fa-solid fa-ruler-vertical mr-2 text-[var(--totk-light-green)]"
              />
              Height (cm) *
            </label>
            <input
              className={styles.input}
              id="height"
              min={0}
              placeholder="Enter height in centimeters"
              required
              step={0.1}
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              disabled={!isEditable("height")}
            />
            <p className={styles.labelMuted}>
              Character&apos;s height in centimeters
            </p>
            {heightConversion && (
              <p className="mt-1 text-sm font-medium text-[var(--totk-light-green)]">
                ≈ {heightConversion.feet}&apos;{heightConversion.inches}&quot;
              </p>
            )}
          </div>
          <div className="sm:col-span-2">
            <label
              className={styles.label}
            >
              <i
                aria-hidden
                className="fa-solid fa-calendar-day mr-2 text-[var(--totk-light-green)]"
              />
              Birthday
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4">
              <div>
                <label
                  className="block text-sm font-medium text-[var(--totk-light-green)] mb-2 sm:text-sm sm:mb-1.5"
                  htmlFor="birthdayMonth"
                >
                  Month
                </label>
                <select
                  className="w-full rounded border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] px-4 py-3.5 text-base text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:bg-[var(--botw-warm-black)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/30 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-h-[52px] touch-manipulation sm:py-2.5 sm:min-h-[44px] sm:text-base"
                  id="birthdayMonth"
                  value={birthdayMonth}
                  onChange={(e) => setBirthdayMonth(e.target.value)}
                  disabled={!isEditable("birthday")}
                >
                  <option value="">Select month...</option>
                  <option value="01">January</option>
                  <option value="02">February</option>
                  <option value="03">March</option>
                  <option value="04">April</option>
                  <option value="05">May</option>
                  <option value="06">June</option>
                  <option value="07">July</option>
                  <option value="08">August</option>
                  <option value="09">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
              </div>
              <div>
                <label
                  className="block text-sm font-medium text-[var(--totk-light-green)] mb-2 sm:text-sm sm:mb-1.5"
                  htmlFor="birthdayDay"
                >
                  Day
                </label>
                <select
                  className="w-full rounded border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] px-4 py-3.5 text-base text-[var(--botw-pale)] focus:border-[var(--totk-light-green)] focus:bg-[var(--botw-warm-black)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/30 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-h-[52px] touch-manipulation sm:py-2.5 sm:min-h-[44px] sm:text-base"
                  id="birthdayDay"
                  value={birthdayDay}
                  onChange={(e) => setBirthdayDay(e.target.value)}
                  disabled={!isEditable("birthday")}
                >
                  <option value="">Select day...</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={String(day).padStart(2, "0")}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className={styles.labelMuted}>
              Character&apos;s birthday (optional)
            </p>
          </div>
          <div>
            <label
              className={styles.label}
              htmlFor="pronouns"
            >
              <i
                aria-hidden
                className="fa-solid fa-user-tag mr-2 text-[var(--totk-light-green)]"
              />
              Pronouns *
            </label>
            <input
              className={styles.input}
              id="pronouns"
              placeholder="e.g., they/them, he/him, she/her"
              required
              type="text"
              value={pronouns}
              onChange={(e) => setPronouns(e.target.value)}
              disabled={!isEditable("pronouns")}
            />
            <p className={styles.labelMuted}>Character&apos;s pronouns</p>
          </div>
          <div>
            <label
              className={styles.label}
              htmlFor="gender"
            >
              <i
                aria-hidden
                className="fa-solid fa-venus-mars mr-2 text-[var(--totk-light-green)]"
              />
              Gender *
            </label>
            <input
              className={styles.input}
              id="gender"
              placeholder="e.g., Female | she/her"
              required
              type="text"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              disabled={!isEditable("gender")}
            />
            <p className={styles.labelMuted}>Character&apos;s gender</p>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <i
            aria-hidden
            className="fa-solid fa-chart-bar text-xl text-[var(--totk-light-green)]"
          />
          <h2 className={styles.sectionTitle}>Stats</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
          <StatCard
            icon="fa-solid fa-heart"
            iconColor="text-[var(--totk-light-green)]"
            label="Hearts"
            value={`${DEFAULT_HEARTS} Hearts (Default)`}
            description="All new characters start with 3 hearts"
            borderColor="border-[var(--totk-green)]"
            bgColor="bg-[var(--totk-dark-green)]"
          />
          <StatCard
            icon="fa-solid fa-bolt"
            iconColor="text-[var(--botw-blue)]"
            label="Stamina"
            value={`${DEFAULT_STAMINA} Stamina (Default)`}
            description="All new characters start with 5 stamina"
            borderColor="border-[var(--botw-blue)]"
            bgColor="bg-[var(--botw-darkest-blue)]"
          />
        </div>
      </section>

      {/* World & Role */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <i
            aria-hidden
            className="fa-solid fa-globe text-xl text-[var(--totk-light-green)]"
          />
          <h2 className={styles.sectionTitle}>World & Role</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              className={styles.label}
              htmlFor="race"
            >
              <i
                aria-hidden
                className="fa-solid fa-users mr-2 text-[var(--totk-light-green)]"
              />
              Race *
            </label>
            {metadata.races.length > 0 ? (
              <select
                className={styles.select}
                id="race"
                required
                value={race}
                onChange={(e) => setRace(e.target.value)}
                disabled={!isEditable("race")}
              >
                <option value="">Select a race...</option>
                {metadata.races.map((r) => (
                  <option
                    key={r.value}
                    value={r.value}
                  >
                    {r.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={styles.input}
                id="race"
                placeholder="Enter race"
                required
                type="text"
                value={race}
                onChange={(e) => setRace(e.target.value)}
                disabled={!isEditable("race")}
              />
            )}
            <p className={styles.labelMuted}>Character&apos;s race</p>
          </div>
          <div>
            <label
              className={styles.label}
              htmlFor="village"
            >
              <i
                aria-hidden
                className="fa-solid fa-house mr-1.5 sm:mr-2 text-[var(--totk-light-green)]"
              />
              Home Village *
            </label>
            <select
              className={styles.select}
              id="village"
              required
              value={village}
              onChange={(e) => {
                setVillage(e.target.value);
                setJob("");
              }}
              disabled={!isEditable("homeVillage")}
            >
              <option value="">Select a village...</option>
              {metadata.villages.map((v) => (
                <option
                  key={v}
                  value={v}
                >
                  {v}
                </option>
              ))}
            </select>
            <p className={styles.labelMuted}>Character&apos;s home village</p>
          </div>
          <div>
            <label
              className={styles.label}
              htmlFor="job"
            >
              <i
                aria-hidden
                className="fa-solid fa-briefcase mr-2 text-[var(--totk-light-green)]"
              />
              Job *
            </label>
            {metadata.jobs.length > 0 ? (
              <select
                className={styles.select}
                disabled={!village || !isEditable("job")}
                id="job"
                required
                value={job}
                onChange={(e) => setJob(e.target.value)}
              >
                <option value="">
                  {village ? "Select a job..." : "Select a village first..."}
                </option>
                {jobOptions.map((j) => (
                  <option
                    key={j}
                    value={j}
                  >
                    {capitalize(j)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={styles.input}
                disabled={!village || !isEditable("job")}
                id="job"
                placeholder={village ? "Enter job" : "Select a village first"}
                required
                type="text"
                value={job}
                onChange={(e) => setJob(e.target.value)}
              />
            )}
            <p className={styles.labelMuted}>
              Character&apos;s job (filtered by village)
            </p>
          </div>
          <div>
            <label
              className={styles.label}
              htmlFor="virtue"
            >
              <i
                aria-hidden
                className="fa-solid fa-gem mr-1.5 sm:mr-2 text-[var(--totk-light-green)]"
              />
              Virtue *
            </label>
            <select
              className={styles.select}
              id="virtue"
              required
              value={virtue}
              onChange={(e) => setVirtue(e.target.value)}
              disabled={!isEditable("virtue")}
            >
              <option value="">Select a virtue...</option>
              {(VIRTUES as readonly string[]).map((v) => (
                <option
                  key={v}
                  value={v}
                >
                  {v}
                </option>
              ))}
            </select>
            <p className={styles.labelMuted}>
              Which virtue of the Triforce does your character embody?
            </p>
          </div>
        </div>
      </section>

      {/* Application */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <i
            aria-hidden
            className="fa-solid fa-file-upload text-xl text-[var(--totk-light-green)]"
          />
          <h2 className={styles.sectionTitle}>Application</h2>
        </div>
        <div className="space-y-6">
          <div>
            <label
              className={styles.label}
              htmlFor="appLink"
            >
              <i
                aria-hidden
                className="fa-solid fa-link mr-2 text-[var(--totk-light-green)]"
              />
              Application Link
            </label>
            <input
              className={styles.input}
              id="appLink"
              placeholder="https://..."
              type="url"
              value={appLink}
              onChange={(e) => setAppLink(e.target.value)}
            />
            <p className={styles.labelMuted}>
              This field is obsolete — we now use the bot to store all info.
              However, if you still want to make your own external app, you can
              link it here! (Optional)
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <span className={styles.label}>
                <i
                  aria-hidden
                  className="fa-solid fa-image mr-1.5 sm:mr-2 text-[var(--totk-light-green)]"
                />
                Application Art Image *
              </span>
              <p className={styles.labelMuted}>
                Application from the website with your OC and info. JPEG, PNG,
                GIF, or WebP, max 7MB.
              </p>
              <FileUploadZone
                accept=".jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp"
                file={appArtFile}
                id="appArt"
                label="Application Art Image"
                preview={appArtPreview}
                required={!isEditMode}
                onChange={handleAppArtChange}
                disabled={!isEditable("appArt")}
              />
            </div>
            <div>
              <span className={styles.label}>
                <i
                  aria-hidden
                  className="fa-solid fa-user-circle mr-1.5 sm:mr-2 text-[var(--totk-light-green)]"
                />
                Character Icon *
              </span>
              <p className={styles.labelMuted}>
                Upload a character icon (JPEG, PNG, GIF, or WebP, max 7MB)
              </p>
              <FileUploadZone
                accept=".jpg,.jpeg,.png,.gif,.webp,image/jpeg,image/png,image/gif,image/webp"
                file={iconFile}
                id="icon"
                label="Character Icon"
                preview={iconPreview}
                required={!isEditMode}
                onChange={handleIconChange}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Equip Gear - Hidden for accepted characters */}
      {characterStatus !== "accepted" && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <i
              aria-hidden
              className="fa-solid fa-shield-halved text-xl text-[var(--totk-light-green)]"
            />
            <h2 className={styles.sectionTitle}>Equip Gear</h2>
          </div>
          <p className={styles.labelMuted}>
            Equip weapons, shields, and armor for your character. Only starting
            gear can be equipped during character creation. All new characters are
            automatically equipped with &quot;Old Shirt&quot; (chest) and
            &quot;Well-Worn Trousers&quot; (legs). Conflicts are automatically
            resolved (e.g., equipping a 2H weapon will unequip your shield).
          </p>
          {gearConflictAlert && (
            <div className="mb-4 rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--totk-light-green)]/10 px-4 py-3 text-sm text-[var(--botw-pale)] animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <i
                  aria-hidden
                  className="fa-solid fa-info-circle text-[var(--totk-light-green)]"
                />
                <span>{gearConflictAlert}</span>
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <GearSelect
              availableItems={availableGearItems.weapons}
              disabled={!isEditable("gearWeapon")}
              formatItemDisplay={formatItemDisplay}
              icon="fa-solid fa-hand-fist"
              label="Weapon"
              onChange={handleWeaponChange}
              selectedId={equippedWeapon?.id}
              selectClassName={styles.select}
              labelClassName={styles.label}
              mutedClassName={styles.labelMuted}
              helpText="Select a weapon to equip"
            />
            <GearSelect
              availableItems={availableGearItems.shields}
              disabled={!isEditable("gearShield")}
              formatItemDisplay={formatItemDisplay}
              icon="fa-solid fa-shield"
              label="Shield"
              onChange={handleShieldChange}
              selectedId={equippedShield?.id}
              selectClassName={styles.select}
              labelClassName={styles.label}
              mutedClassName={styles.labelMuted}
              helpText="Select a shield to equip"
            />
            <GearSelect
              availableItems={availableGearItems.headArmor}
              disabled={!isEditable("gearArmor")}
              formatItemDisplay={formatItemDisplay}
              icon="fa-solid fa-hat-wizard"
              label="Head Armor"
              onChange={handleHeadChange}
              selectedId={equippedHead?.id}
              selectClassName={styles.select}
              labelClassName={styles.label}
              mutedClassName={styles.labelMuted}
              helpText="Select head armor to equip"
            />
            <GearSelect
              availableItems={availableGearItems.chestArmor}
              disabled={!isEditMode ? true : !isEditable("gearArmor.chest")}
              formatItemDisplay={formatItemDisplay}
              icon="fa-solid fa-vest"
              label="Chest Armor"
              onChange={handleChestChange}
              selectedId={equippedChest?.id}
              selectClassName={styles.select}
              labelClassName={styles.label}
              mutedClassName={styles.labelMuted}
              helpText={!isEditMode ? "Old Shirt (fixed for new characters)" : "Select chest armor to equip"}
            />
            <GearSelect
              availableItems={availableGearItems.legsArmor}
              disabled={!isEditMode ? true : !isEditable("gearArmor")}
              formatItemDisplay={formatItemDisplay}
              icon="fa-solid fa-socks"
              label="Legs Armor"
              onChange={handleLegsChange}
              selectedId={equippedLegs?.id}
              selectClassName={styles.select}
              labelClassName={styles.label}
              mutedClassName={styles.labelMuted}
              helpText={!isEditMode ? "Well-Worn Trousers (fixed for new characters)" : "Select legs armor to equip"}
            />
          </div>
        </section>
      )}

      {/* Biography Information */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <i
            aria-hidden
            className="fa-solid fa-scroll text-xl text-[var(--totk-light-green)]"
          />
          <h2 className={styles.sectionTitle}>Biography Information</h2>
        </div>
        <div className="space-y-3 sm:space-y-4">
          <div>
            <label
              className={styles.label}
              htmlFor="personality"
            >
              <i
                aria-hidden
                className="fa-solid fa-brain mr-1.5 sm:mr-2 text-[var(--totk-light-green)]"
              />
              Personality *
            </label>
            <textarea
              className={styles.input}
              id="personality"
              placeholder="Describe your character's personality, core values, attitude, and temperament. Include at least 5 sentences."
              required
              rows={4}
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              disabled={!isEditable("personality")}
            />
            <p className={styles.labelMuted}>
              Describe your character&apos;s personality, core values, attitude,
              and temperament. Include at least 5 sentences.{" "}
              <span className="text-[var(--totk-light-green)]">
                Basic markdown is supported.{" "}
                <a
                  href="https://www.markdownguide.org/basic-syntax/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-[var(--botw-blue)] break-words"
                >
                  View markdown guide
                </a>
              </span>
            </p>
          </div>
          <div>
            <label
              className={styles.label}
              htmlFor="history"
            >
              <i
                aria-hidden
                className="fa-solid fa-book mr-1.5 sm:mr-2 text-[var(--totk-light-green)]"
              />
              History *
            </label>
            <textarea
              className={styles.input}
              id="history"
              placeholder="Describe influential moments in your character's backstory. Include at least 5 sentences."
              required
              rows={4}
              value={history}
              onChange={(e) => setHistory(e.target.value)}
              disabled={!isEditable("history")}
            />
            <p className={styles.labelMuted}>
              Describe influential moments in your character&apos;s backstory.
              Include at least 5 sentences.{" "}
              <span className="text-[var(--totk-light-green)]">
                Basic markdown is supported.{" "}
                <a
                  href="https://www.markdownguide.org/basic-syntax/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-[var(--botw-blue)] break-words"
                >
                  View markdown guide
                </a>
              </span>
            </p>
          </div>
          <div>
            <label
              className={styles.label}
              htmlFor="extras"
            >
              <i
                aria-hidden
                className="fa-solid fa-plus-circle mr-1.5 sm:mr-2 text-[var(--totk-light-green)]"
              />
              Extras
            </label>
            <textarea
              className={styles.input}
              id="extras"
              placeholder="Any additional random facts about your character (optional)"
              rows={2}
              value={extras}
              onChange={(e) => setExtras(e.target.value)}
              disabled={!isEditable("extras")}
            />
            <p className={styles.labelMuted}>
              Optional additional information about your character.{" "}
              <span className="text-[var(--totk-light-green)]">
                Basic markdown is supported.{" "}
                <a
                  href="https://www.markdownguide.org/basic-syntax/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-[var(--botw-blue)] break-words"
                >
                  View markdown guide
                </a>
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Pre-submission checklist (always shown on character forms) */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <i
            aria-hidden
            className="fa-solid fa-clipboard-check text-xl text-[var(--totk-light-green)]"
          />
          <h2 className={styles.sectionTitle}>Character checklist</h2>
        </div>
        <p className={styles.labelMuted + " mb-4"}>
          Please confirm the following. <strong>This checklist is required to submit for moderator review.</strong>
        </p>
        <ul className="space-y-3 text-[var(--botw-pale)]">
          <li className="flex flex-wrap items-start gap-2">
            <label className="inline-flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={checklist.reservation}
                onChange={(e) => setChecklistItem("reservation", e.target.checked)}
                className="mt-1.5 h-4 w-4 rounded border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] focus:ring-[var(--totk-light-green)]"
              />
              <span>
                <strong>Did you post a reservation in #roster?</strong> All OCs must have an approved reservation before moving forward.{" "}
                <a
                  href="https://rootsofthewild.com/character-creation/oc-guide#reservation"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--botw-blue)] underline hover:text-[var(--totk-light-green)]"
                >
                  Reservation guide
                </a>
              </span>
            </label>
          </li>
          <li className="flex flex-wrap items-start gap-2">
            <label className="inline-flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={checklist.visualApp}
                onChange={(e) => setChecklistItem("visualApp", e.target.checked)}
                className="mt-1.5 h-4 w-4 rounded border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] focus:ring-[var(--totk-light-green)]"
              />
              <span>
                <strong>Did you complete the full visual application?</strong> Front-facing, full body art; clean lines + flat colors; all required fields filled in; proper formatting and legible font.{" "}
                <a
                  href="https://rootsofthewild.com/character-creation/oc-guide#application"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--botw-blue)] underline hover:text-[var(--totk-light-green)]"
                >
                  Application guide
                </a>
              </span>
            </label>
          </li>
          <li className="flex flex-wrap items-start gap-2">
            <label className="inline-flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={checklist.guide}
                onChange={(e) => setChecklistItem("guide", e.target.checked)}
                className="mt-1.5 h-4 w-4 rounded border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] focus:ring-[var(--totk-light-green)]"
              />
              <span>
                <strong>Did you read the Character Creation Guide fully?</strong>{" "}
                <a
                  href="https://rootsofthewild.com/character-creation/oc-guide"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--botw-blue)] underline hover:text-[var(--totk-light-green)]"
                >
                  Full OC guide
                </a>
              </span>
            </label>
          </li>
          <li className="flex flex-wrap items-start gap-2">
            <label className="inline-flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={checklist.villageLore}
                onChange={(e) => setChecklistItem("villageLore", e.target.checked)}
                className="mt-1.5 h-4 w-4 rounded border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] focus:ring-[var(--totk-light-green)]"
              />
              <span>
                <strong>Did you read the Village + World Lore pages?</strong>{" "}
                <a
                  href="https://rootsofthewild.com/world/villages"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--botw-blue)] underline hover:text-[var(--totk-light-green)]"
                >
                  Villages &amp; world
                </a>
              </span>
            </label>
          </li>
          <li className="flex flex-wrap items-start gap-2">
            <label className="inline-flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={checklist.groupLore}
                onChange={(e) => setChecklistItem("groupLore", e.target.checked)}
                className="mt-1.5 h-4 w-4 rounded border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] focus:ring-[var(--totk-light-green)]"
              />
              <span>
                <strong>Did you review the Group Lore + Timeline?</strong>{" "}
                <a
                  href="https://rootsofthewild.com/world/group-lore-events"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--botw-blue)] underline hover:text-[var(--totk-light-green)]"
                >
                  Group lore &amp; timeline
                </a>
              </span>
            </label>
          </li>
          <li className="flex flex-wrap items-start gap-2">
            <label className="inline-flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                checked={checklist.coreRules}
                onChange={(e) => setChecklistItem("coreRules", e.target.checked)}
                className="mt-1.5 h-4 w-4 rounded border-2 border-[var(--totk-green)] bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] focus:ring-[var(--totk-light-green)]"
              />
              <span>
                <strong>Does your character follow these core rules?</strong> Born and raised in one of the three villages; not living outside the safe zones; travel history matches the timeline; no modern elements; no money-based economy.
              </span>
            </label>
          </li>
        </ul>
      </section>

      {/* Submit */}
      {submitError && (
        <div className="rounded-lg border-2 border-red-500 bg-red-500/10 px-4 py-3 text-[var(--botw-pale)]">
          {submitError}
        </div>
      )}
      {submitSuccess && (
        <div className="rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--totk-light-green)]/10 px-4 py-3 text-[var(--botw-pale)]">
          {submitSuccess}
        </div>
      )}
      {isEditMode && (
        <p className="text-sm text-[var(--totk-grey-200)]">
          Click &quot;Update Character&quot; to save <strong>all</strong> your changes (personality, history, job, race, etc.) before leaving or resubmitting for review.
        </p>
      )}
      <div className="flex flex-col gap-4 border-t-2 border-[var(--totk-green)] pt-4 sm:flex-row sm:flex-wrap sm:pt-6">
        <button
          className="w-full min-h-[44px] rounded-lg border-2 border-[var(--botw-blue)] bg-[var(--botw-blue)] px-5 py-2.5 font-medium text-[var(--botw-white)] shadow-md transition-colors hover:bg-[var(--botw-dark-blue)] hover:border-[var(--botw-dark-blue)] hover:shadow-[0_0_12px_rgba(0,163,218,0.4)] disabled:opacity-50 touch-manipulation sm:w-auto"
          disabled={submitLoading}
          type="submit"
          title={isEditMode ? "Save all your changes to this character" : undefined}
        >
          {submitLoading ? (isEditMode ? "Updating…" : "Saving…") : (isEditMode ? "Update Character" : "Create and Save Character")}
        </button>
        {!isEditMode && (
          <button
            className="w-full min-h-[44px] rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--botw-warm-black)] px-5 py-2.5 font-medium text-[var(--totk-light-green)] shadow-md transition-colors hover:bg-[var(--totk-light-green)] hover:text-[var(--totk-dark-green)] hover:shadow-[var(--sheikah-glow-soft)] disabled:opacity-50 touch-manipulation sm:w-auto"
            disabled={submitLoading || !allChecklistChecked}
            type="button"
            onClick={() => submit(true)}
            title={!allChecklistChecked ? "Complete all items in the checklist above before submitting." : undefined}
          >
            {submitLoading ? "Submitting…" : "Submit Character"}
          </button>
        )}
        {isEditMode && onSubmitForReview && (characterStatus === null || characterStatus === undefined || characterStatus === "needs_changes") && (
          <button
            className="w-full min-h-[44px] rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--totk-light-green)] px-5 py-2.5 font-medium text-[var(--botw-warm-black)] shadow-md transition-all hover:bg-[var(--totk-light-green)] hover:shadow-[0_0_16px_rgba(73,213,156,0.6)] hover:scale-[1.02] hover:border-[var(--totk-light-green)] disabled:opacity-50 touch-manipulation sm:w-auto"
            disabled={submittingForReview || submitLoading || !allChecklistChecked}
            type="button"
            onClick={onSubmitForReview}
            title={!allChecklistChecked ? "Complete all items in the checklist above before submitting." : undefined}
          >
            {submittingForReview ? "Submitting…" : (characterStatus === null || characterStatus === undefined ? "Submit for Review" : "Resubmit for Review")}
          </button>
        )}
      </div>
    </form>
  );
}
