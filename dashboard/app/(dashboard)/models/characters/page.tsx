"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useCallback } from "react";
import { useModelList } from "@/hooks/use-model-list";
import { Pagination } from "@/components/ui";
import { ModelListPageLayout } from "@/components/layout/model-list-page-layout";
import { capitalize, createSlug } from "@/lib/string-utils";

// ------------------- Shared (My OCs) -------------------
// Types, constants, and helpers exported for reuse in My OCs page.

export type GearItem = {
  name: string;
  stats?: Record<string, number>;
};

export type Character = {
  _id: string;
  userId: string;
  username?: string;
  name: string;
  age?: number | null;
  height?: number | null;
  pronouns: string;
  race: string;
  homeVillage: string;
  currentVillage: string;
  job: string;
  icon: string;
  maxHearts: number;
  currentHearts: number;
  maxStamina: number;
  currentStamina: number;
  status?: string | null;
  birthday?: string | null;
  attack?: number;
  defense?: number;
  spiritOrbs?: number;
  jobDateChanged?: Date | string | null;
  lastStaminaUsage?: Date | string | null;
  blighted?: boolean;
  blightStage?: number;
  ko?: boolean;
  inJail?: boolean;
  debuff?: {
    active: boolean;
    endDate?: Date | string | null;
  };
  gearWeapon?: GearItem | null;
  gearShield?: GearItem | null;
  gearArmor?: {
    head?: GearItem | null;
    chest?: GearItem | null;
    legs?: GearItem | null;
  };
  inventory?: string;
  appLink?: string;
  isModCharacter?: boolean;
  [key: string]: unknown;
};

export const VILLAGE_COLORS = {
  rudania: "#C6000A",
  inariko: "#6BA3FF", // Lighter, less saturated blue for better visibility
  vhintl: "#4AA144",
} as const;

export const MOD_CHARACTER_GOLD = "#FFD700"; // Gold color for mod characters

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

export function formatHeight(height: number | null | undefined): string {
  if (!height) return "Not specified";
  const cm = height;
  const feet = Math.floor(cm / 30.48);
  const inches = Math.round((cm % 30.48) / 2.54);
  return `${cm} cm | ${feet}'${inches}"`;
}

export function formatGearName(gear: GearItem | null | undefined): string {
  if (!gear || !gear.name) return "None";
  return gear.name;
}

export function formatGearStats(gear: GearItem | null | undefined): string {
  if (!gear || !gear.stats || Object.keys(gear.stats).length === 0) return "";
  const statParts: string[] = [];
  const statLabels: Record<string, string> = {
    attack: "⚔️",
    defense: "🛡️",
    staminaRecovered: "⚡",
  };
  const statOrder = ["modifierHearts", "attack", "defense", "staminaRecovered"];
  for (const statKey of statOrder) {
    if (gear.stats[statKey] !== undefined && gear.stats[statKey] !== 0) {
      const value = gear.stats[statKey];
      if (statKey === "modifierHearts") {
        statParts.push(`${value > 0 ? "+" : ""}${value}`);
      } else {
        const label = statLabels[statKey] || statKey;
        statParts.push(`${label} ${value > 0 ? "+" : ""}${value}`);
      }
    }
  }
  for (const [key, value] of Object.entries(gear.stats)) {
    if (!statOrder.includes(key) && value !== 0) {
      statParts.push(`${key}: ${value > 0 ? "+" : ""}${value}`);
    }
  }
  return statParts.length > 0 ? ` (${statParts.join(", ")})` : "";
}

export function getVillageBorderClass(homeVillage: string): string {
  if (!homeVillage) return "";
  const village = homeVillage.toLowerCase().trim();
  if (village === "rudania") return "character-card-rudania";
  if (village === "inariko") return "character-card-inariko";
  if (village === "vhintl") return "character-card-vhintl";
  return "";
}

export function getVillageColor(villageName: string): string | undefined {
  if (!villageName) return undefined;
  const village = villageName.toLowerCase().trim();
  return VILLAGE_COLORS[village as keyof typeof VILLAGE_COLORS];
}

export function getVillageBorderStyle(
  homeVillage: string,
  hover = false
): React.CSSProperties | undefined {
  if (!homeVillage) return undefined;
  const village = homeVillage.toLowerCase().trim();
  const villageColor = VILLAGE_COLORS[village as keyof typeof VILLAGE_COLORS];
  if (!villageColor) return undefined;
  if (hover) {
    return {
      border: `2px solid ${rgba(villageColor, 1)}`,
      boxShadow: `0 8px 24px rgba(0, 0, 0, 0.5), 0 4px 12px ${rgba(villageColor, 0.4)}, 0 0 20px ${rgba(villageColor, 0.8)}, inset 0 0 12px ${rgba(villageColor, 0.3)}`,
    };
  }
  return {
    border: `2px solid ${rgba(villageColor, 0.8)}`,
    boxShadow: `0 4px 16px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 12px ${rgba(villageColor, 0.6)}, inset 0 0 8px ${rgba(villageColor, 0.2)}`,
  };
}

export function getVillageTextStyle(villageName: string): React.CSSProperties | undefined {
  const villageColor = getVillageColor(villageName);
  if (!villageColor) return undefined;
  return {
    color: villageColor,
    borderColor: rgba(villageColor, 0.5),
  };
}

export function getModCharacterGoldStyle(hover = false): React.CSSProperties {
  if (hover) {
    return {
      border: `2px solid ${rgba(MOD_CHARACTER_GOLD, 1)}`,
      boxShadow: `0 8px 24px rgba(0, 0, 0, 0.5), 0 4px 12px ${rgba(MOD_CHARACTER_GOLD, 0.4)}, 0 0 20px ${rgba(MOD_CHARACTER_GOLD, 0.8)}, inset 0 0 12px ${rgba(MOD_CHARACTER_GOLD, 0.3)}`,
    };
  }
  return {
    border: `2px solid ${rgba(MOD_CHARACTER_GOLD, 0.8)}`,
    boxShadow: `0 4px 16px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 12px ${rgba(MOD_CHARACTER_GOLD, 0.6)}, inset 0 0 8px ${rgba(MOD_CHARACTER_GOLD, 0.2)}`,
  };
}

export function getVillageCrestIcon(homeVillage: string): string | null {
  if (!homeVillage) return null;
  const village = homeVillage.toLowerCase().trim();
  const iconMap: Record<string, string> = {
    rudania: `/assets/icons/${encodeURIComponent("[RotW] village crest_rudania_.png")}`,
    inariko: `/assets/icons/${encodeURIComponent("[RotW] village crest_inariko_.png")}`,
    vhintl: `/assets/icons/${encodeURIComponent("[RotW] village crest_vhintl_.png")}`,
  };
  return iconMap[village] || null;
}

export function CharacterCard({ character }: { character: Character }) {
  const router = useRouter();
  const isModCharacter = character.isModCharacter === true;
  // Defensive: some legacy records may have missing/null village fields.
  const homeVillage = String(character.homeVillage ?? "");
  const currentVillage = String(character.currentVillage ?? "");
  const villageClass = isModCharacter ? null : getVillageBorderClass(homeVillage);
  const villageStyle = isModCharacter ? null : getVillageBorderStyle(homeVillage);
  const goldStyle = isModCharacter ? getModCharacterGoldStyle() : null;
  
  const handleCardClick = () => {
    console.log('[CharacterCard] Navigating to character:', character.name);
    const mainElement = document.querySelector('main');
    console.log('[CharacterCard] Current scroll - Window:', window.scrollY, 'Main:', mainElement?.scrollTop);
    
    // Scroll to top immediately on all scrollable elements
    window.scrollTo({ top: 0, behavior: 'instant' });
    mainElement?.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTo({ top: 0, behavior: 'instant' });
    
    // Navigate and ensure scroll happens after navigation
    router.push(`/characters/${createSlug(character.name)}`);
    
    // Also scroll after a brief delay to ensure it happens after route change
    setTimeout(() => {
      const newMainElement = document.querySelector('main');
      window.scrollTo({ top: 0, behavior: 'instant' });
      newMainElement?.scrollTo({ top: 0, behavior: 'instant' });
      document.documentElement.scrollTo({ top: 0, behavior: 'instant' });
      console.log('[CharacterCard] Post-navigation scroll executed - Window:', window.scrollY, 'Main:', newMainElement?.scrollTop);
    }, 100);
  };
  
  const villageCrestIcon = getVillageCrestIcon(homeVillage);
  
  return (
    <div
      onClick={handleCardClick}
      className={`character-card group relative block rounded-lg p-4 sm:p-5 shadow-lg transition-all cursor-pointer ${
        isModCharacter
          ? "border-2"
          : villageClass
            ? `${villageClass} border-2`
            : "border-2 border-[var(--totk-dark-ocher)] hover:border-[var(--totk-light-green)]/60 hover:shadow-[var(--sheikah-glow-soft)]"
      }`}
      style={isModCharacter ? goldStyle ?? undefined : villageStyle ?? undefined}
      onMouseEnter={(e) => {
        if (isModCharacter) {
          const hoverGoldStyle = getModCharacterGoldStyle(true);
          e.currentTarget.style.border = String(hoverGoldStyle.border || "");
          e.currentTarget.style.boxShadow = String(hoverGoldStyle.boxShadow || "");
        } else if (villageStyle) {
          const village = homeVillage.toLowerCase().trim();
          if (!village) return;
          const villageColor = VILLAGE_COLORS[village as keyof typeof VILLAGE_COLORS];
          if (villageColor) {
            e.currentTarget.style.border = `2px solid ${rgba(villageColor, 1)}`;
            e.currentTarget.style.boxShadow = `0 8px 24px rgba(0, 0, 0, 0.5), 0 4px 12px ${rgba(villageColor, 0.4)}, 0 0 20px ${rgba(villageColor, 0.8)}, inset 0 0 12px ${rgba(villageColor, 0.3)}`;
          }
        }
      }}
      onMouseLeave={(e) => {
        if (isModCharacter) {
          const normalGoldStyle = getModCharacterGoldStyle(false);
          e.currentTarget.style.border = String(normalGoldStyle.border || "");
          e.currentTarget.style.boxShadow = String(normalGoldStyle.boxShadow || "");
        } else if (villageStyle) {
          const village = homeVillage.toLowerCase().trim();
          if (!village) return;
          const villageColor = VILLAGE_COLORS[village as keyof typeof VILLAGE_COLORS];
          if (villageColor) {
            e.currentTarget.style.border = `2px solid ${rgba(villageColor, 0.8)}`;
            e.currentTarget.style.boxShadow = `0 4px 16px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 12px ${rgba(villageColor, 0.6)}, inset 0 0 8px ${rgba(villageColor, 0.2)}`;
          }
        }
      }}
    >
      {villageCrestIcon && (
        <div className="absolute right-2 top-2 sm:right-3 sm:top-3 z-20">
          <img
            src={villageCrestIcon}
            alt={`${homeVillage || "Unknown"} crest`}
            className="h-12 w-12 sm:h-16 sm:w-16 object-contain opacity-80 drop-shadow-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <div className="relative z-10">
        <div className="mb-4 flex items-center gap-4">
          {character.icon ? (
            <img
              src={character.icon}
              alt={character.name}
              className={`h-24 w-24 sm:h-28 sm:w-28 rounded-lg border-2 object-cover ${
                isModCharacter
                  ? "border-[#FFD700] shadow-[0_0_12px_rgba(255,215,0,0.6)]"
                  : "border-[var(--totk-light-green)] shadow-[0_0_12px_rgba(73,213,156,0.6)]"
              }`}
              onError={(e) => {
                (e.target as HTMLImageElement).src = "/ankle_icon.png";
              }}
            />
          ) : (
            <img
              src="/ankle_icon.png"
              alt={character.name}
              className={`h-24 w-24 sm:h-28 sm:w-28 rounded-lg border-2 object-cover ${
                isModCharacter
                  ? "border-[#FFD700] shadow-[0_0_12px_rgba(255,215,0,0.6)]"
                  : "border-[var(--totk-light-green)] shadow-[0_0_12px_rgba(73,213,156,0.6)]"
              }`}
            />
          )}
          <div className="flex-1">
            <div className="mb-2">
              <div className="flex-1">
                <h2 className="text-xl font-bold text-[var(--totk-light-green)]">
                  {character.name}
                </h2>
                <p className="text-sm text-[var(--botw-pale)]">
                  {capitalize(character.race)} • {capitalize(character.job)}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-[var(--botw-blue)] px-2.5 py-1 text-xs font-medium text-white shadow-sm">
                    @{character.username ?? character.userId}
                  </span>
                  {character.blighted && (
                    <span className="rounded-md border border-[var(--blight-border)]/60 bg-[var(--blight-border)]/20 px-2.5 py-1 text-xs font-medium text-[var(--blight-border)] shadow-sm">
                      Blighted
                    </span>
                  )}
                  {character.ko && (
                    <span className="rounded-md border border-[var(--totk-grey-300)] bg-[var(--totk-grey-400)] px-2.5 py-1 text-xs font-medium text-[var(--totk-grey-100)] shadow-sm">
                      KO&apos;d
                    </span>
                  )}
                  {character.inJail && (
                    <span className="rounded-md border border-[var(--botw-dark-blue)]/60 bg-[var(--botw-dark-blue)]/30 px-2.5 py-1 text-xs font-medium text-[var(--botw-blue)] shadow-sm">
                      In Jail
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row flex-wrap" onClick={(e) => e.stopPropagation()}>
              {character.appLink && (
                <a
                  href={character.appLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full sm:w-auto rounded-md bg-[var(--totk-mid-ocher)] px-3 py-1.5 text-xs font-medium text-[var(--totk-ivory)] shadow-sm transition-all hover:bg-[var(--totk-dark-ocher)] hover:shadow-md"
                >
                  <i className="fa-solid fa-external-link mr-1.5" />
                  OC Bio
                </a>
              )}
              <Link
                href={`/characters/${createSlug(character.name)}`}
                className="w-full sm:w-auto rounded-md bg-[var(--botw-blue)] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-[var(--botw-blue)]/90 hover:shadow-md"
              >
                OC Page
              </Link>
              <Link
                href={`/characters/inventories/${createSlug(character.name)}`}
                className="w-full sm:w-auto rounded-md bg-[var(--totk-grey-300)] px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-[var(--totk-grey-300)]/90 hover:shadow-md"
              >
                Inventory
              </Link>
            </div>
          </div>
        </div>
        <div className="character-card-stats mb-4 grid grid-cols-2 gap-3 rounded-lg p-3.5">
          <div className="flex items-center gap-2.5">
            <i className="fa-solid fa-heart text-[var(--totk-light-green)] text-base drop-shadow-[0_0_4px_rgba(73,213,156,0.5)]" />
            <div className="flex-1">
              <div className="text-xs font-medium text-[var(--totk-grey-200)] opacity-90">HEARTS</div>
              <div className="text-sm font-bold text-[var(--totk-light-green)] drop-shadow-[0_0_4px_rgba(73,213,156,0.3)]">
                {character.currentHearts}/{character.maxHearts}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <i className="fa-solid fa-bolt text-[var(--botw-blue)] text-base drop-shadow-[0_0_4px_rgba(0,163,218,0.5)]" />
            <div className="flex-1">
              <div className="text-xs font-medium text-[var(--totk-grey-200)] opacity-90">STAMINA</div>
              <div className="text-sm font-bold text-[var(--botw-blue)] drop-shadow-[0_0_4px_rgba(0,163,218,0.3)]">
                {character.currentStamina}/{character.maxStamina}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <i className="fa-solid fa-hand-fist text-[#ff6347] text-base drop-shadow-[0_0_4px_rgba(255,99,71,0.5)]" />
            <div>
              <div className="text-xs font-medium text-[var(--totk-grey-200)] opacity-90">ATTACK</div>
              <div className="text-sm font-bold text-[#ff6347] drop-shadow-[0_0_4px_rgba(255,99,71,0.3)]">
                {character.attack ?? 0}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <i className="fa-solid fa-shield-halved text-[var(--totk-light-ocher)] text-base drop-shadow-[0_0_4px_rgba(229,220,183,0.5)]" />
            <div>
              <div className="text-xs font-medium text-[var(--totk-grey-200)] opacity-90">DEFENSE</div>
              <div className="text-sm font-bold text-[var(--totk-light-ocher)] drop-shadow-[0_0_4px_rgba(229,220,183,0.3)]">
                {character.defense ?? 0}
              </div>
            </div>
          </div>
        </div>
        <div className="character-card-basic-info mb-4 space-y-2 rounded-lg p-3.5">
          <h3 className="mb-2.5 text-sm font-bold text-[var(--botw-blue)] drop-shadow-[0_0_4px_rgba(0,163,218,0.4)]">
            Basic Info
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <span className="mb-1 block text-[var(--totk-grey-200)]">Home Village:</span>
              <div
                className="character-card-input rounded border px-2.5 py-1.5"
                style={getVillageTextStyle(homeVillage)}
              >
                {homeVillage ? capitalize(homeVillage) : "Unknown"}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-[var(--totk-grey-200)]">Current Village:</span>
              <div
                className="character-card-input rounded border px-2.5 py-1.5"
                style={getVillageTextStyle(currentVillage)}
              >
                {currentVillage ? capitalize(currentVillage) : "Unknown"}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-[var(--totk-grey-200)]">Pronouns:</span>
              <div className="character-card-input rounded border px-2.5 py-1.5">
                {character.pronouns}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-[var(--totk-grey-200)]">Birthday:</span>
              <div className="character-card-input rounded border px-2.5 py-1.5">
                {character.birthday || "Not specified"}
              </div>
            </div>
            {character.age != null && (
              <div>
                <span className="mb-1 block text-[var(--totk-grey-200)]">Age:</span>
                <div className="character-card-input rounded border px-2.5 py-1.5">
                  {character.age}
                </div>
              </div>
            )}
            <div>
              <span className="mb-1 block text-[var(--totk-grey-200)]">Height:</span>
              <div className="character-card-input rounded border px-2.5 py-1.5">
                {formatHeight(character.height)}
              </div>
            </div>
          </div>
        </div>
        <div className="character-card-gear space-y-2 rounded-lg p-3.5">
          <h3 className="mb-2.5 text-sm font-bold text-[var(--totk-light-ocher)] drop-shadow-[0_0_4px_rgba(229,220,183,0.4)]">
            Gear
          </h3>
          <div className="space-y-1.5 text-xs">
            {[
              { key: "gearWeapon", label: "Weapon", gear: character.gearWeapon },
              { key: "gearShield", label: "Shield", gear: character.gearShield },
              { key: "gearArmor.head", label: "Head", gear: character.gearArmor?.head },
              { key: "gearArmor.chest", label: "Chest", gear: character.gearArmor?.chest },
              { key: "gearArmor.legs", label: "Legs", gear: character.gearArmor?.legs },
            ].map(({ key, label, gear }) => (
              <div key={key} className="flex items-start justify-between">
                <span className="text-[var(--totk-grey-200)]">{label}:</span>
                <span className="text-right text-[var(--botw-pale)]">
                  {formatGearName(gear)}
                  {formatGearStats(gear)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------- Characters page -------------------

export default function CharactersPage() {
  const pathname = usePathname();
  const {
    data: characters,
    total,
    loading,
    error,
    search,
    setSearch,
    currentPage,
    setCurrentPage,
    filterGroups,
    handleFilterChange,
    itemsPerPage,
    clearAll,
  } = useModelList<Character>("characters");

  // Scroll to top function
  const scrollToTop = useCallback(() => {
    const mainElement = document.querySelector('main');
    console.log('[CharactersPage] scrollToTop called - Window:', window.scrollY, 'Main:', mainElement?.scrollTop);
    
    window.scrollTo({ top: 0, behavior: 'instant' });
    mainElement?.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTo({ top: 0, behavior: 'instant' });
    
    // Double-check after a brief delay
    setTimeout(() => {
      const mainEl = document.querySelector('main');
      if (window.scrollY > 0 || (mainEl?.scrollTop ?? 0) > 0) {
        console.log('[CharactersPage] Still scrolled after delay, forcing again');
        window.scrollTo({ top: 0, behavior: 'instant' });
        mainEl?.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTo({ top: 0, behavior: 'instant' });
      }
    }, 50);
  }, []);

  // Ensure scroll to top when pathname changes (page navigation)
  useEffect(() => {
    console.log('[CharactersPage] Pathname changed:', pathname);
    scrollToTop();
  }, [pathname, scrollToTop]);

  // Scroll to top when pagination changes
  useEffect(() => {
    console.log('[CharactersPage] Pagination changed - currentPage:', currentPage);
    scrollToTop();
  }, [currentPage, scrollToTop]);

  // Scroll to top when search changes
  useEffect(() => {
    console.log('[CharactersPage] Search changed:', search);
    scrollToTop();
  }, [search, scrollToTop]);

  return (
    <ModelListPageLayout
      title="Characters"
      loadingMessage="Loading characters..."
      errorMessage="This page will display all characters from the database once MongoDB connection is configured."
      itemName="characters"
      searchPlaceholder="Search characters by name..."
      loading={loading}
      error={error}
      search={search}
      onSearchChange={setSearch}
      filterGroups={filterGroups}
      onFilterChange={handleFilterChange}
      onClearAll={clearAll}
      currentPage={currentPage}
      totalItems={total}
      itemsPerPage={itemsPerPage}
      onPageChange={setCurrentPage}
    >
      {characters.length === 0 ? (
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
          <p className="text-center text-[var(--botw-pale)]">
            No characters found.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-6 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            {characters.map((character) => (
              <CharacterCard key={character._id} character={character} />
            ))}
          </div>
          {total > itemsPerPage && (
            <Pagination
              currentPage={currentPage}
              totalItems={total}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          )}
        </>
        )}
    </ModelListPageLayout>
  );
}
