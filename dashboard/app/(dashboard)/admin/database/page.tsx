"use client";

/* ============================================================================ */
/* ------------------- Admin Database Editor Page ------------------- */
/* User-friendly interface for admins to edit database items */
/* Testing mode: Only first 10 items are editable */
/* ============================================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import Link from "next/link";
import { syncAllFields, type ItemFormData as SyncItemFormData } from "@/lib/item-field-sync";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type AvailableModel = {
  name: string;
  displayName: string;
  icon: string;
};

const AVAILABLE_MODELS: AvailableModel[] = [
  { name: "Item", displayName: "Items", icon: "fa-cube" },
  // More models will be added here in the future
];

type Item = {
  _id: string;
  // Identity & Display
  itemName: string;
  image?: string;
  imageType?: string;
  emoji?: string;
  // Classification
  itemRarity?: number;
  category?: string[];
  categoryGear?: string;
  type?: string[];
  subtype?: string[];
  recipeTag?: string[];
  // Economics
  buyPrice?: number;
  sellPrice?: number;
  // Effects / Stats
  modifierHearts?: number;
  staminaRecovered?: number;
  // Stack Rules
  stackable?: boolean;
  maxStackSize?: number;
  // Crafting
  craftingMaterial?: Array<{ _id: string; itemName: string; quantity: number }>;
  staminaToCraft?: number | null;
  crafting?: boolean;
  craftingJobs?: string[];
  // Activities & Obtain
  gathering?: boolean;
  looting?: boolean;
  vending?: boolean;
  traveling?: boolean;
  exploring?: boolean;
  obtain?: string[];
  gatheringJobs?: string[];
  lootingJobs?: string[];
  // Weather
  specialWeather?: {
    muggy?: boolean;
    flowerbloom?: boolean;
    fairycircle?: boolean;
    jubilee?: boolean;
    meteorShower?: boolean;
    rockslide?: boolean;
    avalanche?: boolean;
  };
  // Pet Perks
  petPerk?: boolean;
  petperkobtain?: string[];
  petprey?: boolean;
  petforage?: boolean;
  lgpetprey?: boolean;
  petmon?: boolean;
  petchu?: boolean;
  petfirechu?: boolean;
  peticechu?: boolean;
  petelectricchu?: boolean;
  // Location Metadata
  locations?: string[];
  centralHyrule?: boolean;
  eldin?: boolean;
  faron?: boolean;
  gerudo?: boolean;
  hebra?: boolean;
  lanayru?: boolean;
  pathOfScarletLeaves?: boolean;
  leafDewWay?: boolean;
  // Job Flags
  adventurer?: boolean;
  artist?: boolean;
  beekeeper?: boolean;
  blacksmith?: boolean;
  cook?: boolean;
  craftsman?: boolean;
  farmer?: boolean;
  fisherman?: boolean;
  forager?: boolean;
  gravekeeper?: boolean;
  guard?: boolean;
  maskMaker?: boolean;
  rancher?: boolean;
  herbalist?: boolean;
  hunter?: boolean;
  hunterLooting?: boolean;
  mercenary?: boolean;
  miner?: boolean;
  researcher?: boolean;
  scout?: boolean;
  weaver?: boolean;
  witch?: boolean;
  // Boost/Item Tags
  allJobs?: string[];
  entertainerItems?: boolean;
  divineItems?: boolean;
  // Monsters
  monsterList?: string[];
  blackBokoblin?: boolean;
  blueBokoblin?: boolean;
  cursedBokoblin?: boolean;
  goldenBokoblin?: boolean;
  silverBokoblin?: boolean;
  bokoblin?: boolean;
  electricChuchuLarge?: boolean;
  fireChuchuLarge?: boolean;
  iceChuchuLarge?: boolean;
  chuchuLarge?: boolean;
  electricChuchuMedium?: boolean;
  fireChuchuMedium?: boolean;
  iceChuchuMedium?: boolean;
  chuchuMedium?: boolean;
  electricChuchuSmall?: boolean;
  fireChuchuSmall?: boolean;
  iceChuchuSmall?: boolean;
  chuchuSmall?: boolean;
  blackHinox?: boolean;
  blueHinox?: boolean;
  hinox?: boolean;
  electricKeese?: boolean;
  fireKeese?: boolean;
  iceKeese?: boolean;
  keese?: boolean;
  blackLizalfos?: boolean;
  blueLizalfos?: boolean;
  cursedLizalfos?: boolean;
  electricLizalfos?: boolean;
  fireBreathLizalfos?: boolean;
  goldenLizalfos?: boolean;
  iceBreathLizalfos?: boolean;
  silverLizalfos?: boolean;
  lizalfos?: boolean;
  blueManedLynel?: boolean;
  goldenLynel?: boolean;
  silverLynel?: boolean;
  whiteManedLynel?: boolean;
  lynel?: boolean;
  blackMoblin?: boolean;
  blueMoblin?: boolean;
  cursedMoblin?: boolean;
  goldenMoblin?: boolean;
  silverMoblin?: boolean;
  moblin?: boolean;
  molduga?: boolean;
  molduking?: boolean;
  forestOctorok?: boolean;
  rockOctorok?: boolean;
  skyOctorok?: boolean;
  snowOctorok?: boolean;
  treasureOctorok?: boolean;
  waterOctorok?: boolean;
  frostPebblit?: boolean;
  igneoPebblit?: boolean;
  stonePebblit?: boolean;
  stalizalfos?: boolean;
  stalkoblin?: boolean;
  stalmoblin?: boolean;
  stalnox?: boolean;
  frostTalus?: boolean;
  igneoTalus?: boolean;
  luminousTalus?: boolean;
  rareTalus?: boolean;
  stoneTalus?: boolean;
  blizzardWizzrobe?: boolean;
  electricWizzrobe?: boolean;
  fireWizzrobe?: boolean;
  iceWizzrobe?: boolean;
  meteoWizzrobe?: boolean;
  thunderWizzrobe?: boolean;
  likeLike?: boolean;
  evermean?: boolean;
  gibdo?: boolean;
  horriblin?: boolean;
  gloomHands?: boolean;
  bossBokoblin?: boolean;
  mothGibdo?: boolean;
  littleFrox?: boolean;
  yigaBlademaster?: boolean;
  yigaFootsoldier?: boolean;
  normalBokoblin?: boolean;
  normalGibdo?: boolean;
  normalHinox?: boolean;
  normalHorriblin?: boolean;
  normalKeese?: boolean;
  normalLizalfos?: boolean;
  normalLynel?: boolean;
  normalMoblin?: boolean;
  [key: string]: unknown; // Allow any other fields
};

type ItemFormData = Partial<Item>;

type ItemChanges = {
  [key: string]: { original: unknown; current: unknown };
};

// ============================================================================
// ------------------- Subcomponents -------------------
// ============================================================================

/* [admin/database/page.tsx]🧩 Model selector - */
type ModelSelectorProps = {
  selectedModel: string;
  onModelChange: (model: string) => void;
};

function ModelSelector({ selectedModel, onModelChange }: ModelSelectorProps) {
  return (
    <div className="mb-6 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4">
      <label className="block text-sm font-medium text-[var(--totk-light-ocher)] mb-2">
        Select Model to Edit
      </label>
      <p className="text-xs text-[var(--totk-grey-200)] mb-3">
        Choose which database model you want to edit. Currently, only Items are available for editing.
      </p>
      <select
        value={selectedModel}
        onChange={(e) => onModelChange(e.target.value)}
        className="w-full rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]"
      >
        {AVAILABLE_MODELS.map((model) => (
          <option key={model.name} value={model.name}>
            {model.displayName}
          </option>
        ))}
      </select>
    </div>
  );
}

/* [admin/database/page.tsx]🧩 Testing mode banner - */
function TestingModeBanner({ modelName }: { modelName: string }) {
  return (
    <div className="mb-6 rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--totk-light-green)]/10 p-4">
      <div className="flex items-start gap-3">
        <i className="fa-solid fa-triangle-exclamation text-xl text-[var(--totk-light-green)] mt-0.5" aria-hidden="true" />
        <div>
          <h3 className="text-base font-bold text-[var(--totk-light-green)] mb-1">
            Testing Mode Active
          </h3>
          <p className="text-sm text-[var(--botw-pale)]">
            Only the first 10 {modelName.toLowerCase()} are editable. This is a testing environment to ensure everything works correctly.
          </p>
        </div>
      </div>
    </div>
  );
}

/* [admin/database/page.tsx]🧩 Search bar - */
type SearchBarProps = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  resultCount: number;
};

function SearchBar({ searchQuery, onSearchChange, resultCount }: SearchBarProps) {
  return (
    <div className="mb-6 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4">
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex-1 w-full sm:w-auto">
          <label htmlFor="item-search" className="block text-sm font-medium text-[var(--totk-light-ocher)] mb-2">
            Search Items
          </label>
          <div className="relative">
            <i className="fa-solid fa-search absolute left-3 top-1/2 -translate-y-1/2 text-[var(--totk-grey-200)]" aria-hidden="true" />
            <input
              id="item-search"
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search by name, category, or type..."
              className="w-full pl-10 pr-4 py-2 rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] focus:border-[var(--totk-light-green)]"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--totk-grey-200)] hover:text-[var(--botw-pale)] transition-colors"
                aria-label="Clear search"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
        <div className="text-sm text-[var(--totk-grey-200)] whitespace-nowrap">
          {resultCount} {resultCount === 1 ? "item" : "items"} found
        </div>
      </div>
    </div>
  );
}

/* [admin/database/page.tsx]🧩 Message banner - */
type MessageBannerProps = {
  type: "success" | "error";
  message: string;
  onDismiss?: () => void;
};

function MessageBanner({ type, message, onDismiss }: MessageBannerProps) {
  const isSuccess = type === "success";
  const borderColor = isSuccess ? "border-[var(--totk-light-green)]" : "border-[#ff6347]";
  const bgColor = isSuccess ? "bg-[var(--totk-light-green)]/10" : "bg-[#ff6347]/10";
  const textColor = isSuccess ? "text-[var(--totk-light-green)]" : "text-[#ff6347]";
  const icon = isSuccess ? "fa-check-circle" : "fa-exclamation-triangle";

  return (
    <div className={`mb-4 rounded-lg border-2 ${borderColor} ${bgColor} p-4 flex items-start justify-between gap-3`}>
      <div className="flex items-start gap-2">
        <i className={`fa-solid ${icon} mt-0.5 ${textColor}`} aria-hidden="true" />
        <p className={`text-sm font-medium ${textColor}`}>{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-[var(--botw-pale)] hover:text-[var(--totk-light-ocher)] transition-colors"
          aria-label="Dismiss message"
        >
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/* [admin/database/page.tsx]🧩 Helper: Array field input - */
type ArrayFieldInputProps = {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  helpText: string;
  isChanged?: boolean;
  error?: string;
  readOnly?: boolean;
  autoPopulated?: boolean;
};

function ArrayFieldInput({ label, value, onChange, helpText, isChanged, error, readOnly = false, autoPopulated = false }: ArrayFieldInputProps) {
  const [inputValue, setInputValue] = useState(value.join(", "));

  useEffect(() => {
    setInputValue(value.join(", "));
  }, [value]);

  const handleBlur = () => {
    if (readOnly) return;
    // Parse comma-separated values
    const parsed = inputValue
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    onChange(parsed);
    setInputValue(parsed.join(", "));
  };

  if (readOnly || autoPopulated) {
    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-[var(--totk-light-ocher)] mb-1">
          {label}
          {autoPopulated && (
            <span className="ml-2 text-xs text-[var(--totk-light-green)]">
              <i className="fa-solid fa-magic mr-1" aria-hidden="true" />
              Auto-populated
            </span>
          )}
          {isChanged && (
            <span className="ml-2 text-xs text-[var(--totk-light-green)]">
              <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
              Changed
            </span>
          )}
        </label>
        <p className="text-xs text-[var(--totk-grey-200)] mb-2">{helpText}</p>
        <div className={`w-full rounded-md border-2 min-h-[44px] flex items-center px-3 py-2 ${
          isChanged ? "border-[var(--totk-light-green)]" : "border-[var(--totk-dark-ocher)]"
        } ${autoPopulated ? "bg-[var(--totk-light-green)]/5 border-[var(--totk-light-green)]/30" : "bg-[var(--botw-warm-black)]/50"}`}>
          {value.length > 0 ? (
            <div className="flex flex-wrap gap-2 w-full">
              {value.map((item, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/40 text-xs text-[var(--botw-pale)]"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs italic text-[var(--totk-grey-200)]">No items</span>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-[#ff6347]">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-[var(--totk-light-ocher)] mb-1">
        {label}
        {isChanged && (
          <span className="ml-2 text-xs text-[var(--totk-light-green)]">
            <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
            Changed
          </span>
        )}
      </label>
      <p className="text-xs text-[var(--totk-grey-200)] mb-2">{helpText}</p>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        className={`w-full rounded-md border-2 ${
          isChanged ? "border-[var(--totk-light-green)]" : "border-[var(--totk-dark-ocher)]"
        } bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]`}
        placeholder="e.g., Armor, Weapon, Food"
      />
      {error && <p className="mt-1 text-xs text-[#ff6347]">{error}</p>}
    </div>
  );
}

/* [admin/database/page.tsx]🧩 Helper: Boolean checkbox field - */
type BooleanFieldProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  helpText: string;
  isChanged?: boolean;
};

function BooleanField({ label, value, onChange, helpText, isChanged }: BooleanFieldProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-[var(--totk-light-ocher)] mb-1">
        {label}
        {isChanged && (
          <span className="ml-2 text-xs text-[var(--totk-light-green)]">
            <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
            Changed
          </span>
        )}
      </label>
      <p className="text-xs text-[var(--totk-grey-200)] mb-2">{helpText}</p>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => onChange(e.target.checked)}
          className={`h-5 w-5 rounded border-2 ${
            isChanged ? "border-[var(--totk-light-green)]" : "border-[var(--totk-dark-ocher)]"
          } bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] focus:ring-2 focus:ring-[var(--totk-light-green)]`}
        />
        <span className="text-sm text-[var(--botw-pale)]">
          {value ? "Yes" : "No"}
        </span>
      </div>
    </div>
  );
}

/* [admin/database/page.tsx]🧩 Helper: Number field - */
type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  helpText: string;
  isChanged?: boolean;
  error?: string;
  min?: number;
  max?: number;
  required?: boolean;
  disabled?: boolean;
};

function NumberField({ label, value, onChange, helpText, isChanged, error, min, max, required, disabled }: NumberFieldProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-[var(--totk-light-ocher)] mb-1">
        {label}
        {required && <span className="text-[#ff6347] ml-1">*</span>}
        {isChanged && (
          <span className="ml-2 text-xs text-[var(--totk-light-green)]">
            <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
            Changed
          </span>
        )}
      </label>
      <p className="text-xs text-[var(--totk-grey-200)] mb-2">{helpText}</p>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        disabled={disabled}
        className={`w-full rounded-md border-2 ${
          isChanged ? "border-[var(--totk-light-green)]" : "border-[var(--totk-dark-ocher)]"
        } bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] disabled:opacity-50 disabled:cursor-not-allowed`}
      />
      {error && <p className="mt-1 text-xs text-[#ff6347]">{error}</p>}
    </div>
  );
}

/* [admin/database/page.tsx]🧩 Helper: Text field - */
type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helpText: string;
  isChanged?: boolean;
  error?: string;
  required?: boolean;
  placeholder?: string;
};

function TextField({ label, value, onChange, helpText, isChanged, error, required, placeholder }: TextFieldProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-[var(--totk-light-ocher)] mb-1">
        {label}
        {required && <span className="text-[#ff6347] ml-1">*</span>}
        {isChanged && (
          <span className="ml-2 text-xs text-[var(--totk-light-green)]">
            <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
            Changed
          </span>
        )}
      </label>
      <p className="text-xs text-[var(--totk-grey-200)] mb-2">{helpText}</p>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-md border-2 ${
          isChanged ? "border-[var(--totk-light-green)]" : "border-[var(--totk-dark-ocher)]"
        } bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]`}
      />
      {error && <p className="mt-1 text-xs text-[#ff6347]">{error}</p>}
    </div>
  );
}

/* [admin/database/page.tsx]🧩 Collapsible section - */
type CollapsibleSectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  icon?: string;
};

function CollapsibleSection({ title, defaultOpen = true, children, icon }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-6 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-[var(--totk-dark-ocher)]/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          {icon && <i className={`fa-solid ${icon} text-[var(--totk-light-ocher)]`} aria-hidden="true" />}
          <h4 className="text-base font-semibold text-[var(--totk-light-ocher)]">{title}</h4>
        </div>
        <i
          className={`fa-solid fa-chevron-${isOpen ? "up" : "down"} text-[var(--totk-grey-200)] transition-transform`}
          aria-hidden="true"
        />
      </button>
      {isOpen && <div className="p-4 pt-0">{children}</div>}
    </div>
  );
}

/* [admin/database/page.tsx]🧩 Item list item - */
type ItemListItemProps = {
  item: Item;
  onEdit: (item: Item) => void;
};

function ItemListItem({ item, onEdit }: ItemListItemProps) {
  return (
    <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4 mb-3 hover:border-[var(--totk-light-green)] transition-colors">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-[var(--totk-light-ocher)] truncate">
              {item.itemName || "Unnamed Item"}
            </h3>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-[var(--totk-grey-200)]">
              {item.category && item.category.length > 0 && (
                <span className="px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/30">
                  {item.category.join(", ")}
                </span>
              )}
              {item.itemRarity !== undefined && (
                <span className="px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/30">
                  Rarity: {item.itemRarity}
                </span>
              )}
              {item.buyPrice !== undefined && item.buyPrice > 0 && (
                <span className="px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/30">
                  Buy: {item.buyPrice} tokens
                </span>
              )}
              {item.sellPrice !== undefined && item.sellPrice > 0 && (
                <span className="px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/30">
                  Sell: {item.sellPrice} tokens
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={() => onEdit(item)}
          className="rounded-md bg-[var(--totk-mid-ocher)] px-4 py-2 text-sm font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)] min-h-[44px] flex-shrink-0"
        >
          <i className="fa-solid fa-pencil mr-2" aria-hidden="true" />
          Edit
        </button>
      </div>
    </div>
  );
}

/* [admin/database/page.tsx]🧩 Item editor form (in modal) - */
type ItemEditorProps = {
  item: Item;
  onSave: (itemId: string, updates: Partial<ItemFormData>) => Promise<void>;
  saving: boolean;
  onClose: () => void;
};

function ItemEditor({ item, onSave, saving, onClose }: ItemEditorProps) {
  // Initialize form data with all fields from item
  const [formData, setFormData] = useState<ItemFormData>(() => ({
    itemName: item.itemName || "",
    image: item.image || "",
    imageType: item.imageType || "",
    emoji: item.emoji || "",
    itemRarity: item.itemRarity ?? 1,
    category: item.category || [],
    categoryGear: item.categoryGear || "",
    type: item.type || [],
    subtype: item.subtype || [],
    recipeTag: item.recipeTag || [],
    buyPrice: item.buyPrice ?? 0,
    sellPrice: item.sellPrice ?? 0,
    modifierHearts: item.modifierHearts ?? 0,
    staminaRecovered: item.staminaRecovered ?? 0,
    stackable: item.stackable ?? false,
    maxStackSize: item.maxStackSize ?? 10,
    craftingMaterial: item.craftingMaterial || [],
    staminaToCraft: item.staminaToCraft ?? null,
    crafting: item.crafting ?? false,
    craftingJobs: item.craftingJobs || [],
    gathering: item.gathering ?? false,
    looting: item.looting ?? false,
    vending: item.vending ?? false,
    traveling: item.traveling ?? false,
    exploring: item.exploring ?? false,
    obtain: item.obtain || [],
    gatheringJobs: item.gatheringJobs || [],
    lootingJobs: item.lootingJobs || [],
    specialWeather: item.specialWeather || {
      muggy: false,
      flowerbloom: false,
      fairycircle: false,
      jubilee: false,
      meteorShower: false,
      rockslide: false,
      avalanche: false,
    },
    petPerk: item.petPerk ?? false,
    petperkobtain: item.petperkobtain || [],
    petprey: item.petprey ?? false,
    petforage: item.petforage ?? false,
    lgpetprey: item.lgpetprey ?? false,
    petmon: item.petmon ?? false,
    petchu: item.petchu ?? false,
    petfirechu: item.petfirechu ?? false,
    peticechu: item.peticechu ?? false,
    petelectricchu: item.petelectricchu ?? false,
    locations: item.locations || [],
    centralHyrule: item.centralHyrule ?? false,
    eldin: item.eldin ?? false,
    faron: item.faron ?? false,
    gerudo: item.gerudo ?? false,
    hebra: item.hebra ?? false,
    lanayru: item.lanayru ?? false,
    pathOfScarletLeaves: item.pathOfScarletLeaves ?? false,
    leafDewWay: item.leafDewWay ?? false,
    adventurer: item.adventurer ?? false,
    artist: item.artist ?? false,
    beekeeper: item.beekeeper ?? false,
    blacksmith: item.blacksmith ?? false,
    cook: item.cook ?? false,
    craftsman: item.craftsman ?? false,
    farmer: item.farmer ?? false,
    fisherman: item.fisherman ?? false,
    forager: item.forager ?? false,
    gravekeeper: item.gravekeeper ?? false,
    guard: item.guard ?? false,
    maskMaker: item.maskMaker ?? false,
    rancher: item.rancher ?? false,
    herbalist: item.herbalist ?? false,
    hunter: item.hunter ?? false,
    hunterLooting: item.hunterLooting ?? false,
    mercenary: item.mercenary ?? false,
    miner: item.miner ?? false,
    researcher: item.researcher ?? false,
    scout: item.scout ?? false,
    weaver: item.weaver ?? false,
    witch: item.witch ?? false,
    allJobs: item.allJobs || [],
    entertainerItems: item.entertainerItems ?? false,
    divineItems: item.divineItems ?? false,
    monsterList: item.monsterList || [],
    blackBokoblin: item.blackBokoblin ?? false,
    blueBokoblin: item.blueBokoblin ?? false,
    cursedBokoblin: item.cursedBokoblin ?? false,
    goldenBokoblin: item.goldenBokoblin ?? false,
    silverBokoblin: item.silverBokoblin ?? false,
    bokoblin: item.bokoblin ?? false,
    electricChuchuLarge: item.electricChuchuLarge ?? false,
    fireChuchuLarge: item.fireChuchuLarge ?? false,
    iceChuchuLarge: item.iceChuchuLarge ?? false,
    chuchuLarge: item.chuchuLarge ?? false,
    electricChuchuMedium: item.electricChuchuMedium ?? false,
    fireChuchuMedium: item.fireChuchuMedium ?? false,
    iceChuchuMedium: item.iceChuchuMedium ?? false,
    chuchuMedium: item.chuchuMedium ?? false,
    electricChuchuSmall: item.electricChuchuSmall ?? false,
    fireChuchuSmall: item.fireChuchuSmall ?? false,
    iceChuchuSmall: item.iceChuchuSmall ?? false,
    chuchuSmall: item.chuchuSmall ?? false,
    blackHinox: item.blackHinox ?? false,
    blueHinox: item.blueHinox ?? false,
    hinox: item.hinox ?? false,
    electricKeese: item.electricKeese ?? false,
    fireKeese: item.fireKeese ?? false,
    iceKeese: item.iceKeese ?? false,
    keese: item.keese ?? false,
    blackLizalfos: item.blackLizalfos ?? false,
    blueLizalfos: item.blueLizalfos ?? false,
    cursedLizalfos: item.cursedLizalfos ?? false,
    electricLizalfos: item.electricLizalfos ?? false,
    fireBreathLizalfos: item.fireBreathLizalfos ?? false,
    goldenLizalfos: item.goldenLizalfos ?? false,
    iceBreathLizalfos: item.iceBreathLizalfos ?? false,
    silverLizalfos: item.silverLizalfos ?? false,
    lizalfos: item.lizalfos ?? false,
    blueManedLynel: item.blueManedLynel ?? false,
    goldenLynel: item.goldenLynel ?? false,
    silverLynel: item.silverLynel ?? false,
    whiteManedLynel: item.whiteManedLynel ?? false,
    lynel: item.lynel ?? false,
    blackMoblin: item.blackMoblin ?? false,
    blueMoblin: item.blueMoblin ?? false,
    cursedMoblin: item.cursedMoblin ?? false,
    goldenMoblin: item.goldenMoblin ?? false,
    silverMoblin: item.silverMoblin ?? false,
    moblin: item.moblin ?? false,
    molduga: item.molduga ?? false,
    molduking: item.molduking ?? false,
    forestOctorok: item.forestOctorok ?? false,
    rockOctorok: item.rockOctorok ?? false,
    skyOctorok: item.skyOctorok ?? false,
    snowOctorok: item.snowOctorok ?? false,
    treasureOctorok: item.treasureOctorok ?? false,
    waterOctorok: item.waterOctorok ?? false,
    frostPebblit: item.frostPebblit ?? false,
    igneoPebblit: item.igneoPebblit ?? false,
    stonePebblit: item.stonePebblit ?? false,
    stalizalfos: item.stalizalfos ?? false,
    stalkoblin: item.stalkoblin ?? false,
    stalmoblin: item.stalmoblin ?? false,
    stalnox: item.stalnox ?? false,
    frostTalus: item.frostTalus ?? false,
    igneoTalus: item.igneoTalus ?? false,
    luminousTalus: item.luminousTalus ?? false,
    rareTalus: item.rareTalus ?? false,
    stoneTalus: item.stoneTalus ?? false,
    blizzardWizzrobe: item.blizzardWizzrobe ?? false,
    electricWizzrobe: item.electricWizzrobe ?? false,
    fireWizzrobe: item.fireWizzrobe ?? false,
    iceWizzrobe: item.iceWizzrobe ?? false,
    meteoWizzrobe: item.meteoWizzrobe ?? false,
    thunderWizzrobe: item.thunderWizzrobe ?? false,
    likeLike: item.likeLike ?? false,
    evermean: item.evermean ?? false,
    gibdo: item.gibdo ?? false,
    horriblin: item.horriblin ?? false,
    gloomHands: item.gloomHands ?? false,
    bossBokoblin: item.bossBokoblin ?? false,
    mothGibdo: item.mothGibdo ?? false,
    littleFrox: item.littleFrox ?? false,
    yigaBlademaster: item.yigaBlademaster ?? false,
    yigaFootsoldier: item.yigaFootsoldier ?? false,
    normalBokoblin: item.normalBokoblin ?? false,
    normalGibdo: item.normalGibdo ?? false,
    normalHinox: item.normalHinox ?? false,
    normalHorriblin: item.normalHorriblin ?? false,
    normalKeese: item.normalKeese ?? false,
    normalLizalfos: item.normalLizalfos ?? false,
    normalLynel: item.normalLynel ?? false,
    normalMoblin: item.normalMoblin ?? false,
  }));

  const [originalData] = useState<ItemFormData>({ ...formData });
  const [changes, setChanges] = useState<ItemChanges>({});
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // ------------------- Track Changes -------------------
  useEffect(() => {
    const newChanges: ItemChanges = {};
    (Object.keys(formData) as Array<keyof ItemFormData>).forEach((key) => {
      const formValue = formData[key];
      const origValue = originalData[key];
      
      // Deep comparison for objects/arrays
      if (JSON.stringify(formValue) !== JSON.stringify(origValue)) {
        newChanges[key] = {
          original: origValue,
          current: formValue,
        };
      }
    });
    setChanges(newChanges);
  }, [formData, originalData]);

  // ------------------- Validation -------------------
  const validate = useCallback((): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.itemName?.trim()) {
      errors.itemName = "Item name is required";
    }

    if (formData.itemRarity !== undefined && (formData.itemRarity < 1 || formData.itemRarity > 5)) {
      errors.itemRarity = "Rarity must be between 1 and 5";
    }

    if (formData.buyPrice !== undefined && formData.buyPrice < 0) {
      errors.buyPrice = "Buy price cannot be negative";
    }

    if (formData.sellPrice !== undefined && formData.sellPrice < 0) {
      errors.sellPrice = "Sell price cannot be negative";
    }

    if (formData.maxStackSize !== undefined && formData.maxStackSize < 1) {
      errors.maxStackSize = "Max stack size must be at least 1";
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ------------------- Handle Save -------------------
  const handleSaveClick = useCallback(() => {
    if (Object.keys(changes).length === 0) {
      return; // No changes to save
    }

    if (!validate()) {
      return; // Validation failed
    }

    setShowConfirmModal(true);
  }, [changes, validate]);

  // ------------------- Confirm Save -------------------
  const handleConfirmSave = useCallback(async () => {
    setShowConfirmModal(false);
    const updates: Partial<ItemFormData> = {};
    Object.keys(changes).forEach((key) => {
      updates[key as keyof ItemFormData] = formData[key as keyof ItemFormData];
    });
    await onSave(item._id, updates);
  }, [changes, formData, item._id, onSave]);

  // ------------------- Reset Changes -------------------
  const handleReset = useCallback(() => {
    setFormData({ ...originalData });
    setValidationErrors({});
  }, [originalData]);

  // ------------------- Field Change Handlers -------------------
  const handleFieldChange = useCallback((field: keyof ItemFormData, value: unknown) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      
      // Auto-sync related fields when job/location/monster flags change
      const fieldName = typeof field === 'string' ? field : String(field);
      const syncResult = syncAllFields(updated as SyncItemFormData, fieldName, value);
      
      if (syncResult.updated) {
        // Apply sync changes
        const synced = { ...updated };
        Object.entries(syncResult.changes).forEach(([key, change]) => {
          synced[key as keyof ItemFormData] = change.to as never;
        });
        return synced;
      }
      
      return updated;
    });
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [validationErrors]);

  const hasChanges = Object.keys(changes).length > 0;
  const hasErrors = Object.keys(validationErrors).length > 0;

  // Helper to get field display name
  const getFieldDisplayName = (field: string): string => {
    const fieldMap: Record<string, string> = {
      itemName: "Item Name",
      image: "Image URL",
      imageType: "Image Type",
      emoji: "Emoji",
      itemRarity: "Rarity Level",
      category: "Category",
      categoryGear: "Category Gear",
      type: "Type",
      subtype: "Subtype",
      recipeTag: "Recipe Tag",
      buyPrice: "Buy Price",
      sellPrice: "Sell Price",
      modifierHearts: "Hearts Restored",
      staminaRecovered: "Stamina Restored",
      stackable: "Can Stack",
      maxStackSize: "Max Stack Size",
      craftingMaterial: "Crafting Materials",
      staminaToCraft: "Stamina to Craft",
      crafting: "Craftable",
      craftingJobs: "Crafting Jobs",
      gathering: "Gathering",
      looting: "Looting",
      vending: "Vending",
      traveling: "Traveling",
      exploring: "Exploring",
      obtain: "Obtain Methods",
      gatheringJobs: "Gathering Jobs",
      lootingJobs: "Looting Jobs",
      specialWeather: "Special Weather",
      petPerk: "Pet Perk",
      petperkobtain: "Pet Perk Obtain",
      petprey: "Pet Prey",
      petforage: "Pet Forage",
      lgpetprey: "Large Pet Prey",
      petmon: "Pet Monster",
      petchu: "Pet Chuchu",
      petfirechu: "Pet Fire Chuchu",
      peticechu: "Pet Ice Chuchu",
      petelectricchu: "Pet Electric Chuchu",
      locations: "Locations",
      centralHyrule: "Central Hyrule",
      eldin: "Eldin",
      faron: "Faron",
      gerudo: "Gerudo",
      hebra: "Hebra",
      lanayru: "Lanayru",
      pathOfScarletLeaves: "Path of Scarlet Leaves",
      leafDewWay: "Leaf Dew Way",
      allJobs: "All Jobs",
      entertainerItems: "Entertainer Items",
      divineItems: "Divine Items",
      monsterList: "Monster List",
    };
    return fieldMap[field] || field;
  };

  return (
    <div>
      {/* Item Header (in modal) */}
      <div className="mb-6 pb-4 border-b border-[var(--totk-dark-ocher)] sticky top-0 bg-[var(--totk-brown)] z-10">
        <div>
          <h3 className="text-xl font-bold text-[var(--totk-light-ocher)]">
            {formData.itemName || "Unnamed Item"}
          </h3>
          <p className="text-xs text-[var(--totk-grey-200)] mt-1">
            Item ID: {item._id}
          </p>
        </div>
      </div>

      {/* Form Sections - Organized by ItemModel.js structure with collapsible sections */}
      
      {/* Identity & Display */}
      <CollapsibleSection title="Identity & Display" icon="fa-tag" defaultOpen={true}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextField
            label="Item Name *"
            value={formData.itemName || ""}
            onChange={(v) => handleFieldChange("itemName", v)}
            helpText="The name players see in-game"
            isChanged={!!changes.itemName}
            error={validationErrors.itemName}
            required
          />
          <TextField
            label="Image URL"
            value={formData.image || ""}
            onChange={(v) => handleFieldChange("image", v)}
            helpText="URL or path to the item image"
            isChanged={!!changes.image}
          />
          <TextField
            label="Image Type"
            value={formData.imageType || ""}
            onChange={(v) => handleFieldChange("imageType", v)}
            helpText="Type of image (e.g., PNG, JPG)"
            isChanged={!!changes.imageType}
          />
          <TextField
            label="Emoji"
            value={formData.emoji || ""}
            onChange={(v) => handleFieldChange("emoji", v)}
            helpText="Emoji for Discord display (optional - Discord only)"
            isChanged={!!changes.emoji}
            placeholder="e.g., 🍎"
          />
        </div>
      </CollapsibleSection>

      {/* Classification */}
      <CollapsibleSection title="Classification" icon="fa-layer-group" defaultOpen={true}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberField
            label="Rarity Level"
            value={formData.itemRarity ?? 1}
            onChange={(v) => handleFieldChange("itemRarity", v)}
            helpText="Rarity from 1 (common) to 5 (rarest)"
            isChanged={!!changes.itemRarity}
            error={validationErrors.itemRarity}
            min={1}
            max={5}
          />
          <ArrayFieldInput
            label="Category"
            value={formData.category || []}
            onChange={(v) => handleFieldChange("category", v)}
            helpText="Categories this item belongs to (comma-separated)"
            isChanged={!!changes.category}
          />
          <TextField
            label="Category Gear"
            value={formData.categoryGear || ""}
            onChange={(v) => handleFieldChange("categoryGear", v)}
            helpText="Gear category (e.g., Armor, Weapon)"
            isChanged={!!changes.categoryGear}
          />
          <ArrayFieldInput
            label="Type"
            value={formData.type || []}
            onChange={(v) => handleFieldChange("type", v)}
            helpText="Item types (comma-separated, e.g., Material, Food)"
            isChanged={!!changes.type}
          />
          <ArrayFieldInput
            label="Subtype"
            value={formData.subtype || []}
            onChange={(v) => handleFieldChange("subtype", v)}
            helpText="Item subtypes (comma-separated, e.g., Head, Bow)"
            isChanged={!!changes.subtype}
          />
          <ArrayFieldInput
            label="Recipe Tag"
            value={formData.recipeTag || []}
            onChange={(v) => handleFieldChange("recipeTag", v)}
            helpText="Recipe tags (comma-separated)"
            isChanged={!!changes.recipeTag}
          />
        </div>
      </CollapsibleSection>

      {/* Economics */}
      <CollapsibleSection title="Pricing" icon="fa-coins" defaultOpen={true}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberField
            label="Buy Price"
            value={formData.buyPrice ?? 0}
            onChange={(v) => handleFieldChange("buyPrice", v)}
            helpText="How much shops charge to buy this item (in tokens)"
            isChanged={!!changes.buyPrice}
            error={validationErrors.buyPrice}
            min={0}
          />
          <NumberField
            label="Sell Price"
            value={formData.sellPrice ?? 0}
            onChange={(v) => handleFieldChange("sellPrice", v)}
            helpText="How much players get when selling this item (in tokens)"
            isChanged={!!changes.sellPrice}
            error={validationErrors.sellPrice}
            min={0}
          />
        </div>
      </CollapsibleSection>

      {/* Effects / Stats */}
      <CollapsibleSection title="Effects" icon="fa-heart" defaultOpen={true}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumberField
            label="Hearts Restored"
            value={formData.modifierHearts ?? 0}
            onChange={(v) => handleFieldChange("modifierHearts", v)}
            helpText="Health restored when this item is used"
            isChanged={!!changes.modifierHearts}
          />
          <NumberField
            label="Stamina Restored"
            value={formData.staminaRecovered ?? 0}
            onChange={(v) => handleFieldChange("staminaRecovered", v)}
            helpText="Stamina restored when this item is used"
            isChanged={!!changes.staminaRecovered}
          />
        </div>
      </CollapsibleSection>

      {/* Stack Rules */}
      <CollapsibleSection title="Stack Rules" icon="fa-boxes" defaultOpen={true}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BooleanField
            label="Can Stack?"
            value={formData.stackable ?? false}
            onChange={(v) => handleFieldChange("stackable", v)}
            helpText="Can players hold multiple in one inventory slot?"
            isChanged={!!changes.stackable}
          />
          <NumberField
            label="Max Stack Size"
            value={formData.maxStackSize ?? 10}
            onChange={(v) => handleFieldChange("maxStackSize", v)}
            helpText="Maximum items per stack (if stackable)"
            isChanged={!!changes.maxStackSize}
            error={validationErrors.maxStackSize}
            min={1}
            disabled={!formData.stackable}
          />
        </div>
      </CollapsibleSection>

      {/* Crafting */}
      <CollapsibleSection title="Crafting" icon="fa-hammer" defaultOpen={false}>
        <div className="mb-4 p-3 rounded border border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
          <p className="text-xs text-[var(--totk-grey-200)]">
            <i className="fa-solid fa-info-circle mr-1.5 text-[var(--totk-light-green)]" aria-hidden="true" />
            <strong>Auto-sync:</strong> When you enable job flags with CRAFTING perk, they automatically populate the crafting jobs and tags arrays.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <BooleanField
            label="Craftable"
            value={formData.crafting ?? false}
            onChange={(v) => handleFieldChange("crafting", v)}
            helpText="Can this item be crafted?"
            isChanged={!!changes.crafting}
          />
          <NumberField
            label="Stamina to Craft"
            value={formData.staminaToCraft ?? 0}
            onChange={(v) => handleFieldChange("staminaToCraft", v)}
            helpText="Stamina required to craft this item"
            isChanged={!!changes.staminaToCraft}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <h5 className="text-sm font-semibold text-[var(--totk-light-ocher)] mb-3">Auto-Populated Fields</h5>
          </div>
          <ArrayFieldInput
            label="Crafting Jobs"
            value={formData.craftingJobs || []}
            onChange={(v) => handleFieldChange("craftingJobs", v)}
            helpText="Jobs that can craft this item (auto-populated from job flags)"
            isChanged={!!changes.craftingJobs}
            autoPopulated={true}
            readOnly={true}
          />
        </div>
        <div className="mt-4 p-3 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50">
          <p className="text-xs text-[var(--totk-grey-200)]">
            <i className="fa-solid fa-info-circle mr-1.5" aria-hidden="true" />
            <strong>Note:</strong> Crafting materials editing is not yet available in this interface. Use the database directly for complex crafting material configurations.
          </p>
        </div>
      </CollapsibleSection>

      {/* Activities & Obtain */}
      <CollapsibleSection title="Activities & Obtain Methods" icon="fa-compass" defaultOpen={false}>
        <div className="mb-4 p-3 rounded border border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
          <p className="text-xs text-[var(--totk-grey-200)]">
            <i className="fa-solid fa-info-circle mr-1.5 text-[var(--totk-light-green)]" aria-hidden="true" />
            <strong>Auto-sync:</strong> Toggle activity flags below to automatically populate the obtain methods and tags. Auto-populated fields are read-only.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="md:col-span-2">
            <h5 className="text-sm font-semibold text-[var(--totk-light-ocher)] mb-3">Activity Flags</h5>
          </div>
          <BooleanField
            label="Gathering"
            value={formData.gathering ?? false}
            onChange={(v) => handleFieldChange("gathering", v)}
            helpText="Can be obtained through gathering"
            isChanged={!!changes.gathering}
          />
          <BooleanField
            label="Looting"
            value={formData.looting ?? false}
            onChange={(v) => handleFieldChange("looting", v)}
            helpText="Can be obtained through looting"
            isChanged={!!changes.looting}
          />
          <BooleanField
            label="Crafting"
            value={formData.crafting ?? false}
            onChange={(v) => handleFieldChange("crafting", v)}
            helpText="Can be obtained through crafting"
            isChanged={!!changes.crafting}
          />
          <BooleanField
            label="Vending"
            value={formData.vending ?? false}
            onChange={(v) => handleFieldChange("vending", v)}
            helpText="Can be obtained from vending machines"
            isChanged={!!changes.vending}
          />
          <BooleanField
            label="Traveling"
            value={formData.traveling ?? false}
            onChange={(v) => handleFieldChange("traveling", v)}
            helpText="Can be obtained while traveling"
            isChanged={!!changes.traveling}
          />
          <BooleanField
            label="Exploring"
            value={formData.exploring ?? false}
            onChange={(v) => handleFieldChange("exploring", v)}
            helpText="Can be obtained while exploring"
            isChanged={!!changes.exploring}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <h5 className="text-sm font-semibold text-[var(--totk-light-ocher)] mb-3">Auto-Populated Fields</h5>
          </div>
          <ArrayFieldInput
            label="Obtain Methods"
            value={formData.obtain || []}
            onChange={(v) => handleFieldChange("obtain", v)}
            helpText="Ways to obtain this item (auto-populated from activity flags)"
            isChanged={!!changes.obtain}
            autoPopulated={true}
            readOnly={true}
          />
        </div>
      </CollapsibleSection>

      {/* Special Weather */}
      <CollapsibleSection title="Special Weather Conditions" icon="fa-cloud-sun" defaultOpen={false}>
        <div className="mb-4 p-3 rounded border border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
          <p className="text-xs text-[var(--totk-grey-200)]">
            <i className="fa-solid fa-info-circle mr-1.5 text-[var(--totk-light-green)]" aria-hidden="true" />
            <strong>Auto-sync:</strong> Toggle weather conditions below to automatically populate the obtain methods and tags arrays.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <BooleanField
            label="Muggy"
            value={formData.specialWeather?.muggy ?? false}
            onChange={(v) => handleFieldChange("specialWeather", { ...formData.specialWeather, muggy: v })}
            helpText="Available during muggy weather"
            isChanged={!!changes.specialWeather}
          />
          <BooleanField
            label="Flower Bloom"
            value={formData.specialWeather?.flowerbloom ?? false}
            onChange={(v) => handleFieldChange("specialWeather", { ...formData.specialWeather, flowerbloom: v })}
            helpText="Available during flower bloom"
            isChanged={!!changes.specialWeather}
          />
          <BooleanField
            label="Fairy Circle"
            value={formData.specialWeather?.fairycircle ?? false}
            onChange={(v) => handleFieldChange("specialWeather", { ...formData.specialWeather, fairycircle: v })}
            helpText="Available near fairy circles"
            isChanged={!!changes.specialWeather}
          />
          <BooleanField
            label="Jubilee"
            value={formData.specialWeather?.jubilee ?? false}
            onChange={(v) => handleFieldChange("specialWeather", { ...formData.specialWeather, jubilee: v })}
            helpText="Available during jubilee events"
            isChanged={!!changes.specialWeather}
          />
          <BooleanField
            label="Meteor Shower"
            value={formData.specialWeather?.meteorShower ?? false}
            onChange={(v) => handleFieldChange("specialWeather", { ...formData.specialWeather, meteorShower: v })}
            helpText="Available during meteor showers"
            isChanged={!!changes.specialWeather}
          />
          <BooleanField
            label="Rockslide"
            value={formData.specialWeather?.rockslide ?? false}
            onChange={(v) => handleFieldChange("specialWeather", { ...formData.specialWeather, rockslide: v })}
            helpText="Available during rockslides"
            isChanged={!!changes.specialWeather}
          />
          <BooleanField
            label="Avalanche"
            value={formData.specialWeather?.avalanche ?? false}
            onChange={(v) => handleFieldChange("specialWeather", { ...formData.specialWeather, avalanche: v })}
            helpText="Available during avalanches"
            isChanged={!!changes.specialWeather}
          />
        </div>
      </CollapsibleSection>

      {/* Pet Perks */}
      <CollapsibleSection title="Pet Perks" icon="fa-paw" defaultOpen={false}>
        <div className="mb-4 p-3 rounded border border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
          <p className="text-xs text-[var(--totk-grey-200)]">
            <i className="fa-solid fa-info-circle mr-1.5 text-[var(--totk-light-green)]" aria-hidden="true" />
            <strong>Auto-sync:</strong> Toggle pet flags below to automatically populate the pet perk obtain array.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="md:col-span-2">
            <h5 className="text-sm font-semibold text-[var(--totk-light-ocher)] mb-3">Pet Flags</h5>
          </div>
          <BooleanField
            label="Pet Perk"
            value={formData.petPerk ?? false}
            onChange={(v) => handleFieldChange("petPerk", v)}
            helpText="Has pet perk benefits"
            isChanged={!!changes.petPerk}
          />
          <BooleanField
            label="Pet Prey"
            value={formData.petprey ?? false}
            onChange={(v) => handleFieldChange("petprey", v)}
            helpText="Can be obtained as pet prey"
            isChanged={!!changes.petprey}
          />
          <BooleanField
            label="Pet Forage"
            value={formData.petforage ?? false}
            onChange={(v) => handleFieldChange("petforage", v)}
            helpText="Can be foraged by pets"
            isChanged={!!changes.petforage}
          />
          <BooleanField
            label="Large Pet Prey"
            value={formData.lgpetprey ?? false}
            onChange={(v) => handleFieldChange("lgpetprey", v)}
            helpText="Can be obtained as large pet prey"
            isChanged={!!changes.lgpetprey}
          />
          <BooleanField
            label="Pet Monster"
            value={formData.petmon ?? false}
            onChange={(v) => handleFieldChange("petmon", v)}
            helpText="Related to pet monsters"
            isChanged={!!changes.petmon}
          />
          <BooleanField
            label="Pet Chuchu"
            value={formData.petchu ?? false}
            onChange={(v) => handleFieldChange("petchu", v)}
            helpText="Related to pet chuchus"
            isChanged={!!changes.petchu}
          />
          <BooleanField
            label="Pet Fire Chuchu"
            value={formData.petfirechu ?? false}
            onChange={(v) => handleFieldChange("petfirechu", v)}
            helpText="Related to pet fire chuchus"
            isChanged={!!changes.petfirechu}
          />
          <BooleanField
            label="Pet Ice Chuchu"
            value={formData.peticechu ?? false}
            onChange={(v) => handleFieldChange("peticechu", v)}
            helpText="Related to pet ice chuchus"
            isChanged={!!changes.peticechu}
          />
          <BooleanField
            label="Pet Electric Chuchu"
            value={formData.petelectricchu ?? false}
            onChange={(v) => handleFieldChange("petelectricchu", v)}
            helpText="Related to pet electric chuchus"
            isChanged={!!changes.petelectricchu}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <h5 className="text-sm font-semibold text-[var(--totk-light-ocher)] mb-3">Auto-Populated Fields</h5>
          </div>
          <ArrayFieldInput
            label="Pet Perk Obtain"
            value={formData.petperkobtain || []}
            onChange={(v) => handleFieldChange("petperkobtain", v)}
            helpText="Ways pets can obtain this (auto-populated from pet flags)"
            isChanged={!!changes.petperkobtain}
            autoPopulated={true}
            readOnly={true}
          />
          <BooleanField
            label="Pet Prey"
            value={formData.petprey ?? false}
            onChange={(v) => handleFieldChange("petprey", v)}
            helpText="Can be obtained as pet prey"
            isChanged={!!changes.petprey}
          />
        </div>
      </CollapsibleSection>

      {/* Location Metadata */}
      <CollapsibleSection title="Locations" icon="fa-map" defaultOpen={false}>
        <div className="mb-4 p-3 rounded border border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
          <p className="text-xs text-[var(--totk-grey-200)]">
            <i className="fa-solid fa-info-circle mr-1.5 text-[var(--totk-light-green)]" aria-hidden="true" />
            <strong>Auto-sync:</strong> Toggle location flags below to automatically populate the locations and location tags arrays.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="md:col-span-2">
            <h5 className="text-sm font-semibold text-[var(--totk-light-ocher)] mb-3">Location Flags</h5>
          </div>
          <BooleanField
            label="Central Hyrule"
            value={formData.centralHyrule ?? false}
            onChange={(v) => handleFieldChange("centralHyrule", v)}
            helpText="Found in Central Hyrule"
            isChanged={!!changes.centralHyrule}
          />
          <BooleanField
            label="Eldin"
            value={formData.eldin ?? false}
            onChange={(v) => handleFieldChange("eldin", v)}
            helpText="Found in Eldin region"
            isChanged={!!changes.eldin}
          />
          <BooleanField
            label="Faron"
            value={formData.faron ?? false}
            onChange={(v) => handleFieldChange("faron", v)}
            helpText="Found in Faron region"
            isChanged={!!changes.faron}
          />
          <BooleanField
            label="Gerudo"
            value={formData.gerudo ?? false}
            onChange={(v) => handleFieldChange("gerudo", v)}
            helpText="Found in Gerudo region"
            isChanged={!!changes.gerudo}
          />
          <BooleanField
            label="Hebra"
            value={formData.hebra ?? false}
            onChange={(v) => handleFieldChange("hebra", v)}
            helpText="Found in Hebra region"
            isChanged={!!changes.hebra}
          />
          <BooleanField
            label="Lanayru"
            value={formData.lanayru ?? false}
            onChange={(v) => handleFieldChange("lanayru", v)}
            helpText="Found in Lanayru region"
            isChanged={!!changes.lanayru}
          />
          <BooleanField
            label="Path of Scarlet Leaves"
            value={formData.pathOfScarletLeaves ?? false}
            onChange={(v) => handleFieldChange("pathOfScarletLeaves", v)}
            helpText="Found on Path of Scarlet Leaves"
            isChanged={!!changes.pathOfScarletLeaves}
          />
          <BooleanField
            label="Leaf Dew Way"
            value={formData.leafDewWay ?? false}
            onChange={(v) => handleFieldChange("leafDewWay", v)}
            helpText="Found on Leaf Dew Way"
            isChanged={!!changes.leafDewWay}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div className="md:col-span-2">
            <h5 className="text-sm font-semibold text-[var(--totk-light-ocher)] mb-3">Auto-Populated Fields</h5>
          </div>
          <ArrayFieldInput
            label="Locations"
            value={formData.locations || []}
            onChange={(v) => handleFieldChange("locations", v)}
            helpText="Locations where this item can be found (auto-populated from location flags)"
            isChanged={!!changes.locations}
            autoPopulated={true}
            readOnly={true}
          />
        </div>
      </CollapsibleSection>

      {/* Job Flags */}
      <CollapsibleSection title="Jobs" icon="fa-briefcase" defaultOpen={false}>
        <div className="mb-4 p-3 rounded border border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
          <p className="text-xs text-[var(--totk-grey-200)]">
            <i className="fa-solid fa-info-circle mr-1.5 text-[var(--totk-light-green)]" aria-hidden="true" />
            <strong>Auto-sync:</strong> When you enable a job flag, it automatically adds the job to the appropriate arrays (gatheringJobs, lootingJobs, craftingJobs) and updates related tags. Auto-populated fields are read-only.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { key: "adventurer", label: "Adventurer" },
            { key: "artist", label: "Artist" },
            { key: "beekeeper", label: "Beekeeper" },
            { key: "blacksmith", label: "Blacksmith" },
            { key: "cook", label: "Cook" },
            { key: "craftsman", label: "Craftsman" },
            { key: "farmer", label: "Farmer" },
            { key: "fisherman", label: "Fisherman" },
            { key: "forager", label: "Forager" },
            { key: "gravekeeper", label: "Gravekeeper" },
            { key: "guard", label: "Guard" },
            { key: "maskMaker", label: "Mask Maker" },
            { key: "rancher", label: "Rancher" },
            { key: "herbalist", label: "Herbalist" },
            { key: "hunter", label: "Hunter" },
            { key: "hunterLooting", label: "Hunter (Looting)" },
            { key: "mercenary", label: "Mercenary" },
            { key: "miner", label: "Miner" },
            { key: "researcher", label: "Researcher" },
            { key: "scout", label: "Scout" },
            { key: "weaver", label: "Weaver" },
            { key: "witch", label: "Witch" },
          ].map(({ key, label }) => (
            <BooleanField
              key={key}
              label={label}
              value={(formData[key as keyof ItemFormData] as boolean) ?? false}
              onChange={(v) => handleFieldChange(key as keyof ItemFormData, v)}
              helpText={`Related to ${label.toLowerCase()} job`}
              isChanged={!!changes[key]}
            />
          ))}
        </div>
        
        {/* Auto-Populated Fields */}
        <div className="mt-6 pt-4 border-t border-[var(--totk-dark-ocher)]">
          <h5 className="text-sm font-semibold text-[var(--totk-light-ocher)] mb-3">Auto-Populated Fields</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ArrayFieldInput
              label="All Jobs"
              value={formData.allJobs || []}
              onChange={(v) => handleFieldChange("allJobs", v)}
              helpText="Jobs that benefit from this item (auto-populated from job flags)"
              isChanged={!!changes.allJobs}
              autoPopulated={true}
              readOnly={true}
            />
            <ArrayFieldInput
              label="Gathering Jobs"
              value={formData.gatheringJobs || []}
              onChange={(v) => handleFieldChange("gatheringJobs", v)}
              helpText="Jobs that can gather this item (auto-populated from job flags)"
              isChanged={!!changes.gatheringJobs}
              autoPopulated={true}
              readOnly={true}
            />
            <ArrayFieldInput
              label="Looting Jobs"
              value={formData.lootingJobs || []}
              onChange={(v) => handleFieldChange("lootingJobs", v)}
              helpText="Jobs that can loot this item (auto-populated from job flags)"
              isChanged={!!changes.lootingJobs}
              autoPopulated={true}
              readOnly={true}
            />
            <ArrayFieldInput
              label="Crafting Jobs"
              value={formData.craftingJobs || []}
              onChange={(v) => handleFieldChange("craftingJobs", v)}
              helpText="Jobs that can craft this item (auto-populated from job flags)"
              isChanged={!!changes.craftingJobs}
              autoPopulated={true}
              readOnly={true}
            />
          </div>
        </div>
      </CollapsibleSection>

      {/* Boost/Item Tags */}
      <CollapsibleSection title="Boost & Item Tags" icon="fa-star" defaultOpen={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BooleanField
            label="Entertainer Items"
            value={formData.entertainerItems ?? false}
            onChange={(v) => handleFieldChange("entertainerItems", v)}
            helpText="Item for entertainers"
            isChanged={!!changes.entertainerItems}
          />
          <BooleanField
            label="Divine Items"
            value={formData.divineItems ?? false}
            onChange={(v) => handleFieldChange("divineItems", v)}
            helpText="Divine or sacred item"
            isChanged={!!changes.divineItems}
          />
        </div>
      </CollapsibleSection>

      {/* Monsters - Grouped by type */}
      <CollapsibleSection title="Monsters" icon="fa-dragon" defaultOpen={false}>
        <div className="mb-4 p-3 rounded border border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5">
          <p className="text-xs text-[var(--totk-grey-200)]">
            <i className="fa-solid fa-info-circle mr-1.5 text-[var(--totk-light-green)]" aria-hidden="true" />
            <strong>Auto-sync:</strong> When you enable a monster flag, it automatically adds the monster name to the monsterList array. Auto-populated fields are read-only.
          </p>
        </div>
        
        {/* Monster Flags */}
        {/* Bokoblin Variants */}
        <div className="mt-4 mb-4">
          <h5 className="text-sm font-medium text-[var(--totk-light-ocher)] mb-2">Bokoblin Variants</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: "blackBokoblin", label: "Black Bokoblin" },
              { key: "blueBokoblin", label: "Blue Bokoblin" },
              { key: "cursedBokoblin", label: "Cursed Bokoblin" },
              { key: "goldenBokoblin", label: "Golden Bokoblin" },
              { key: "silverBokoblin", label: "Silver Bokoblin" },
              { key: "bokoblin", label: "Bokoblin" },
              { key: "normalBokoblin", label: "Normal Bokoblin" },
            ].map(({ key, label }) => (
              <BooleanField
                key={key}
                label={label}
                value={(formData[key as keyof ItemFormData] as boolean) ?? false}
                onChange={(v) => handleFieldChange(key as keyof ItemFormData, v)}
                helpText={`Dropped by ${label.toLowerCase()}`}
                isChanged={!!changes[key]}
              />
            ))}
          </div>
        </div>

        {/* Chuchu Variants */}
        <div className="mt-4 mb-4">
          <h5 className="text-sm font-medium text-[var(--totk-light-ocher)] mb-3">Chuchu Variants</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: "electricChuchuLarge", label: "Electric Chuchu (Large)" },
              { key: "fireChuchuLarge", label: "Fire Chuchu (Large)" },
              { key: "iceChuchuLarge", label: "Ice Chuchu (Large)" },
              { key: "chuchuLarge", label: "Chuchu (Large)" },
              { key: "electricChuchuMedium", label: "Electric Chuchu (Medium)" },
              { key: "fireChuchuMedium", label: "Fire Chuchu (Medium)" },
              { key: "iceChuchuMedium", label: "Ice Chuchu (Medium)" },
              { key: "chuchuMedium", label: "Chuchu (Medium)" },
              { key: "electricChuchuSmall", label: "Electric Chuchu (Small)" },
              { key: "fireChuchuSmall", label: "Fire Chuchu (Small)" },
              { key: "iceChuchuSmall", label: "Ice Chuchu (Small)" },
              { key: "chuchuSmall", label: "Chuchu (Small)" },
            ].map(({ key, label }) => (
              <BooleanField
                key={key}
                label={label}
                value={(formData[key as keyof ItemFormData] as boolean) ?? false}
                onChange={(v) => handleFieldChange(key as keyof ItemFormData, v)}
                helpText={`Dropped by ${label.toLowerCase()}`}
                isChanged={!!changes[key]}
              />
            ))}
          </div>
        </div>

        {/* Other Monster Types - Grouped */}
        <div className="mt-4 mb-4">
          <h5 className="text-sm font-medium text-[var(--totk-light-ocher)] mb-3">Hinox Variants</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: "blackHinox", label: "Black Hinox" },
              { key: "blueHinox", label: "Blue Hinox" },
              { key: "hinox", label: "Hinox" },
            ].map(({ key, label }) => (
              <BooleanField
                key={key}
                label={label}
                value={(formData[key as keyof ItemFormData] as boolean) ?? false}
                onChange={(v) => handleFieldChange(key as keyof ItemFormData, v)}
                helpText={`Dropped by ${label.toLowerCase()}`}
                isChanged={!!changes[key]}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 mb-4">
          <h5 className="text-sm font-medium text-[var(--totk-light-ocher)] mb-3">Keese Variants</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: "electricKeese", label: "Electric Keese" },
              { key: "fireKeese", label: "Fire Keese" },
              { key: "iceKeese", label: "Ice Keese" },
              { key: "keese", label: "Keese" },
            ].map(({ key, label }) => (
              <BooleanField
                key={key}
                label={label}
                value={(formData[key as keyof ItemFormData] as boolean) ?? false}
                onChange={(v) => handleFieldChange(key as keyof ItemFormData, v)}
                helpText={`Dropped by ${label.toLowerCase()}`}
                isChanged={!!changes[key]}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 mb-4">
          <h5 className="text-sm font-medium text-[var(--totk-light-ocher)] mb-3">Lizalfos Variants</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: "blackLizalfos", label: "Black Lizalfos" },
              { key: "blueLizalfos", label: "Blue Lizalfos" },
              { key: "cursedLizalfos", label: "Cursed Lizalfos" },
              { key: "electricLizalfos", label: "Electric Lizalfos" },
              { key: "fireBreathLizalfos", label: "Fire Breath Lizalfos" },
              { key: "goldenLizalfos", label: "Golden Lizalfos" },
              { key: "iceBreathLizalfos", label: "Ice Breath Lizalfos" },
              { key: "silverLizalfos", label: "Silver Lizalfos" },
              { key: "lizalfos", label: "Lizalfos" },
            ].map(({ key, label }) => (
              <BooleanField
                key={key}
                label={label}
                value={(formData[key as keyof ItemFormData] as boolean) ?? false}
                onChange={(v) => handleFieldChange(key as keyof ItemFormData, v)}
                helpText={`Dropped by ${label.toLowerCase()}`}
                isChanged={!!changes[key]}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 mb-4">
          <h5 className="text-sm font-medium text-[var(--totk-light-ocher)] mb-3">Lynel Variants</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: "blueManedLynel", label: "Blue-Maned Lynel" },
              { key: "goldenLynel", label: "Golden Lynel" },
              { key: "silverLynel", label: "Silver Lynel" },
              { key: "whiteManedLynel", label: "White-Maned Lynel" },
              { key: "lynel", label: "Lynel" },
            ].map(({ key, label }) => (
              <BooleanField
                key={key}
                label={label}
                value={(formData[key as keyof ItemFormData] as boolean) ?? false}
                onChange={(v) => handleFieldChange(key as keyof ItemFormData, v)}
                helpText={`Dropped by ${label.toLowerCase()}`}
                isChanged={!!changes[key]}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 mb-4">
          <h5 className="text-sm font-medium text-[var(--totk-light-ocher)] mb-3">Moblin Variants</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: "blackMoblin", label: "Black Moblin" },
              { key: "blueMoblin", label: "Blue Moblin" },
              { key: "cursedMoblin", label: "Cursed Moblin" },
              { key: "goldenMoblin", label: "Golden Moblin" },
              { key: "silverMoblin", label: "Silver Moblin" },
              { key: "moblin", label: "Moblin" },
            ].map(({ key, label }) => (
              <BooleanField
                key={key}
                label={label}
                value={(formData[key as keyof ItemFormData] as boolean) ?? false}
                onChange={(v) => handleFieldChange(key as keyof ItemFormData, v)}
                helpText={`Dropped by ${label.toLowerCase()}`}
                isChanged={!!changes[key]}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 mb-4">
          <h5 className="text-sm font-medium text-[var(--totk-light-ocher)] mb-3">Other Monsters</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { key: "molduga", label: "Molduga" },
              { key: "molduking", label: "Molduking" },
              { key: "forestOctorok", label: "Forest Octorok" },
              { key: "rockOctorok", label: "Rock Octorok" },
              { key: "skyOctorok", label: "Sky Octorok" },
              { key: "snowOctorok", label: "Snow Octorok" },
              { key: "treasureOctorok", label: "Treasure Octorok" },
              { key: "waterOctorok", label: "Water Octorok" },
              { key: "frostPebblit", label: "Frost Pebblit" },
              { key: "igneoPebblit", label: "Igneo Pebblit" },
              { key: "stonePebblit", label: "Stone Pebblit" },
              { key: "stalizalfos", label: "Stalizalfos" },
              { key: "stalkoblin", label: "Stalkoblin" },
              { key: "stalmoblin", label: "Stalmoblin" },
              { key: "stalnox", label: "Stalnox" },
              { key: "frostTalus", label: "Frost Talus" },
              { key: "igneoTalus", label: "Igneo Talus" },
              { key: "luminousTalus", label: "Luminous Talus" },
              { key: "rareTalus", label: "Rare Talus" },
              { key: "stoneTalus", label: "Stone Talus" },
              { key: "blizzardWizzrobe", label: "Blizzard Wizzrobe" },
              { key: "electricWizzrobe", label: "Electric Wizzrobe" },
              { key: "fireWizzrobe", label: "Fire Wizzrobe" },
              { key: "iceWizzrobe", label: "Ice Wizzrobe" },
              { key: "meteoWizzrobe", label: "Meteo Wizzrobe" },
              { key: "thunderWizzrobe", label: "Thunder Wizzrobe" },
              { key: "likeLike", label: "Like Like" },
              { key: "evermean", label: "Evermean" },
              { key: "gibdo", label: "Gibdo" },
              { key: "horriblin", label: "Horriblin" },
              { key: "gloomHands", label: "Gloom Hands" },
              { key: "bossBokoblin", label: "Boss Bokoblin" },
              { key: "mothGibdo", label: "Moth Gibdo" },
              { key: "littleFrox", label: "Little Frox" },
              { key: "yigaBlademaster", label: "Yiga Blademaster" },
              { key: "yigaFootsoldier", label: "Yiga Footsoldier" },
              { key: "normalBokoblin", label: "Normal Bokoblin" },
              { key: "normalGibdo", label: "Normal Gibdo" },
              { key: "normalHinox", label: "Normal Hinox" },
              { key: "normalHorriblin", label: "Normal Horriblin" },
              { key: "normalKeese", label: "Normal Keese" },
              { key: "normalLizalfos", label: "Normal Lizalfos" },
              { key: "normalLynel", label: "Normal Lynel" },
              { key: "normalMoblin", label: "Normal Moblin" },
            ].map(({ key, label }) => (
              <BooleanField
                key={key}
                label={label}
                value={(formData[key as keyof ItemFormData] as boolean) ?? false}
                onChange={(v) => handleFieldChange(key as keyof ItemFormData, v)}
                helpText={`Dropped by ${label.toLowerCase()}`}
                isChanged={!!changes[key]}
              />
            ))}
          </div>
        </div>
        
        {/* Auto-Populated Monster List */}
        <div className="mt-6 pt-4 border-t border-[var(--totk-dark-ocher)]">
          <h5 className="text-sm font-semibold text-[var(--totk-light-ocher)] mb-3">Auto-Populated Fields</h5>
          <ArrayFieldInput
            label="Monster List"
            value={formData.monsterList || []}
            onChange={(v) => handleFieldChange("monsterList", v)}
            helpText="List of associated monsters (auto-populated from monster flags)"
            isChanged={!!changes.monsterList}
            autoPopulated={true}
            readOnly={true}
          />
        </div>
      </CollapsibleSection>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3 pt-4 border-t border-[var(--totk-dark-ocher)] sticky bottom-0 bg-[var(--totk-brown)] pb-2 mt-6">
        <button
          onClick={handleSaveClick}
          disabled={!hasChanges || hasErrors || saving}
          className="rounded-md bg-[var(--totk-mid-ocher)] px-5 py-2.5 text-sm font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)] disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {saving ? (
            <>
              <i className="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true" />
              Saving...
            </>
          ) : hasChanges ? (
            <>
              <i className="fa-solid fa-floppy-disk mr-2" aria-hidden="true" />
              Save Changes
            </>
          ) : (
            <>
              <i className="fa-solid fa-check mr-2" aria-hidden="true" />
              No Changes
            </>
          )}
        </button>
        {hasChanges && (
          <button
            onClick={handleReset}
            disabled={saving}
            className="rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-5 py-2.5 text-sm font-bold text-[var(--botw-pale)] transition-colors hover:bg-[var(--totk-dark-ocher)] disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
          >
            <i className="fa-solid fa-rotate-left mr-2" aria-hidden="true" />
            Discard Changes
          </button>
        )}
        <button
          onClick={onClose}
          disabled={saving}
          className="rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-5 py-2.5 text-sm font-bold text-[var(--botw-pale)] transition-colors hover:bg-[var(--totk-dark-ocher)] disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] ml-auto"
        >
          Close
        </button>
      </div>

      {/* Confirmation Modal */}
      <Modal
        open={showConfirmModal}
        onOpenChange={setShowConfirmModal}
        title="Confirm Changes"
        description={`Are you sure you want to save changes to "${formData.itemName || "this item"}"?`}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-[var(--botw-pale)] mb-2">
              You're changing the following fields:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm text-[var(--totk-grey-200)] max-h-60 overflow-y-auto">
              {Object.entries(changes).slice(0, 20).map(([field, change]) => (
                <li key={field}>
                  <strong className="text-[var(--totk-light-ocher)]">
                    {getFieldDisplayName(field)}
                  </strong>
                  : {String(change.original)} → {String(change.current)}
                </li>
              ))}
              {Object.keys(changes).length > 20 && (
                <li className="text-[var(--totk-grey-200)] italic">
                  ... and {Object.keys(changes).length - 20} more fields
                </li>
              )}
            </ul>
          </div>
          <div className="flex gap-3 justify-end pt-4 border-t border-[var(--totk-dark-ocher)]">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-5 py-2.5 text-sm font-bold text-[var(--botw-pale)] transition-colors hover:bg-[var(--totk-dark-ocher)] min-h-[44px]"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmSave}
              className="rounded-md bg-[var(--totk-light-green)] px-5 py-2.5 text-sm font-bold text-[var(--botw-warm-black)] transition-colors hover:bg-[var(--totk-mid-green)] min-h-[44px]"
            >
              <i className="fa-solid fa-check mr-2" aria-hidden="true" />
              Yes, Save
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================================
// ------------------- Main Page Component -------------------
// ============================================================================

export default function AdminDatabasePage() {
  const { user, isAdmin, loading: sessionLoading } = useSession();
  const [selectedModel, setSelectedModel] = useState<string>("Item");
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ------------------- Filter Items Based on Search -------------------
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredItems(items);
      return;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = items.filter((item) => {
      const nameMatch = item.itemName?.toLowerCase().includes(query);
      const categoryMatch = item.category?.some((cat) => cat.toLowerCase().includes(query));
      const typeMatch = item.type?.some((t) => t.toLowerCase().includes(query));
      const subtypeMatch = item.subtype?.some((st) => st.toLowerCase().includes(query));
      
      return nameMatch || categoryMatch || typeMatch || subtypeMatch;
    });
    
    setFilteredItems(filtered);
  }, [searchQuery, items]);

  // ------------------- Fetch Items -------------------
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      fetchAbortControllerRef.current?.abort();
      fetchAbortControllerRef.current = new AbortController();
      const signal = fetchAbortControllerRef.current.signal;

      const res = await fetch(`/api/admin/database/items?model=${selectedModel}`, { signal });
      if (signal.aborted) return;

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string; message?: string }).message ||
          (data as { error?: string }).error ||
          `Request failed: ${res.status}`
        );
      }

      const data = (await res.json()) as { items?: Item[] };
      if (signal.aborted) return;

      if (!data.items) {
        throw new Error("No items found");
      }

      setItems(data.items);
    } catch (e) {
      if (fetchAbortControllerRef.current?.signal.aborted) return;
      if (e instanceof Error && e.name === "AbortError") return;
      if (e instanceof Error && (e.message.toLowerCase().includes("aborted") || e.message.toLowerCase().includes("signal"))) return;
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      if (!fetchAbortControllerRef.current?.signal.aborted) {
        setLoading(false);
      }
    }
  }, [selectedModel]);

  // ------------------- Save Item -------------------
  const handleSaveItem = useCallback(async (itemId: string, updates: Partial<ItemFormData>) => {
    setSavingItemId(itemId);
    try {
      const res = await fetch("/api/admin/database/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, updates }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string; message?: string }).message ||
          (data as { error?: string }).error ||
          "Failed to save changes"
        );
      }

      const item = items.find((i) => i._id === itemId);
      setSuccessMessage(`✓ Successfully saved "${item?.itemName || "item"}"!`);
      
      // Clear success message after 5 seconds
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = setTimeout(() => {
        setSuccessMessage(null);
        successTimeoutRef.current = null;
      }, 5000);

      // Refresh items to get updated data
      await fetchItems();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingItemId(null);
    }
  }, [items, fetchItems]);

  // ------------------- Effects -------------------
  useEffect(() => {
    if (isAdmin && !sessionLoading) {
      fetchItems();
    }
    return () => {
      fetchAbortControllerRef.current?.abort();
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, [isAdmin, sessionLoading, selectedModel, fetchItems]);

  // ------------------- Loading State -------------------
  if (sessionLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--botw-warm-black)]">
        <Loading message="Loading..." variant="inline" size="lg" />
      </div>
    );
  }

  // ------------------- Not Logged In -------------------
  if (!user) {
    return (
      <div className="min-h-screen p-4 sm:p-6 md:p-8 flex items-center justify-center bg-[var(--botw-warm-black)]">
        <div className="mx-auto max-w-md w-full text-center px-4">
          <div className="mb-6 sm:mb-8 flex items-center justify-center gap-2 sm:gap-4">
            <img src="/Side=Left.svg" alt="" className="h-5 w-auto sm:h-6" />
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--totk-light-ocher)] uppercase">
              Access Denied
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-5 w-auto sm:h-6 md:h-8" />
          </div>
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6 sm:p-8 shadow-2xl">
            <p className="text-sm sm:text-base text-[var(--botw-pale)] mb-4 sm:mb-6">
              You must be logged in to access the database editor.
            </p>
            <a
              href="/api/auth/discord"
              className="inline-block rounded-md bg-[#5865F2] px-5 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-bold text-white transition-colors hover:bg-[#4752C4]"
            >
              Login with Discord
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ------------------- Not Admin -------------------
  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4 sm:p-6 md:p-8 flex items-center justify-center bg-[var(--botw-warm-black)]">
        <div className="mx-auto max-w-md w-full text-center px-4">
          <div className="mb-6 sm:mb-8 flex items-center justify-center gap-2 sm:gap-4">
            <img src="/Side=Left.svg" alt="" className="h-5 w-auto sm:h-6" />
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--totk-light-ocher)] uppercase">
              Access Denied
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-5 w-auto sm:h-6 md:h-8" />
          </div>
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6 sm:p-8 shadow-2xl">
            <p className="text-sm sm:text-base text-[var(--botw-pale)] mb-4 sm:mb-6">
              You must be an admin to access the database editor.
            </p>
            <Link
              href="/"
              className="inline-block rounded-md bg-[var(--totk-mid-ocher)] px-5 py-2.5 sm:px-6 sm:py-3 text-sm sm:text-base font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)]"
            >
              Return Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ------------------- Main Content -------------------
  const selectedModelDisplay = AVAILABLE_MODELS.find((m) => m.name === selectedModel)?.displayName || selectedModel;

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[90rem]">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-6">
            <img src="/Side=Left.svg" alt="" className="h-8 w-auto opacity-80" />
            <h1 className="text-4xl sm:text-5xl font-black text-[var(--totk-light-ocher)] tracking-tighter uppercase italic">
              Database Editor
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-8 w-auto opacity-80" />
          </div>
          <p className="text-[var(--totk-grey-200)] font-medium tracking-widest uppercase text-sm opacity-60">
            Edit database entries
          </p>
        </div>

        {/* Model Selector */}
        <ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />

        {/* Testing Mode Banner */}
        <TestingModeBanner modelName={selectedModelDisplay} />

        {/* Success/Error Messages */}
        {successMessage && (
          <MessageBanner
            type="success"
            message={successMessage}
            onDismiss={() => {
              setSuccessMessage(null);
              if (successTimeoutRef.current) {
                clearTimeout(successTimeoutRef.current);
                successTimeoutRef.current = null;
              }
            }}
          />
        )}
        {error && (
          <MessageBanner
            type="error"
            message={error}
            onDismiss={() => setError(null)}
          />
        )}

        {/* Search Bar */}
        {items.length > 0 && (
          <SearchBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            resultCount={filteredItems.length}
          />
        )}

        {/* Items List */}
        {items.length === 0 ? (
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
            <p className="text-center text-[var(--botw-pale)]">
              {error ? "Failed to load items. Please try refreshing the page." : "No items found."}
            </p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
            <p className="text-center text-[var(--botw-pale)]">
              No items match your search "{searchQuery}". Try a different search term.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-[var(--totk-light-ocher)]">
                Items
              </h2>
              <span className="text-sm text-[var(--totk-grey-200)]">
                Showing {filteredItems.length} of {items.length}
              </span>
            </div>
            <div>
              {filteredItems.map((item) => (
                <ItemListItem
                  key={item._id}
                  item={item}
                  onEdit={(item) => {
                    setEditingItem(item);
                    setShowEditModal(true);
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {editingItem && (
          <Modal
            open={showEditModal}
            onOpenChange={(open) => {
              setShowEditModal(open);
              if (!open) {
                setEditingItem(null);
              }
            }}
            title={`Edit: ${editingItem.itemName || "Item"}`}
            description="Edit all fields for this item"
            size="full"
          >
            <div className="h-[calc(100vh-8rem)] overflow-y-auto">
              <ItemEditor
                item={editingItem}
                onSave={async (itemId, updates) => {
                  await handleSaveItem(itemId, updates);
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
                saving={savingItemId === editingItem._id}
                onClose={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
              />
            </div>
          </Modal>
        )}
      </div>
    </div>
  );
}
