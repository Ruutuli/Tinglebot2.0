"use client";

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { Loading, Tabs, SearchFilterBar } from "@/components/ui";
import type { FilterGroup } from "@/components/ui";
import { capitalize } from "@/lib/string-utils";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type InventoryItem = {
  itemName: string;
  quantity: number;
  category: string[];
  type: string[];
  subtype: string[];
  image?: string;
  owned: boolean;
  obtain?: string | null;
  location?: string | null;
};

type InventoryData = {
  characterName: string;
  characterId: string;
  icon: string;
  totalItems: number;
  uniqueItems: number;
  inventory: InventoryItem[];
};

type InventoryLog = {
  _id: string;
  characterName: string;
  characterId: string;
  itemName: string;
  quantity: number;
  category: string;
  type: string;
  subtype: string;
  obtain: string;
  job: string;
  perk: string;
  location: string;
  link: string;
  dateTime: string;
};

type LogsData = {
  characterName: string;
  characterId: string;
  logs: InventoryLog[];
  total: number;
};

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const categoryConfig = [
  { name: "Weapon", icon: "https://storage.googleapis.com/tinglebot/Graphics/weapon_white.png" },
  { name: "Armor", icon: "https://storage.googleapis.com/tinglebot/Graphics/attire_white.png" },
  { name: "Ancient Parts", icon: "https://storage.googleapis.com/tinglebot/Graphics/ancient_part_white.png" },
  { name: "Creature", icon: "https://storage.googleapis.com/tinglebot/Graphics/critter_white.png" },
  { name: "Fish", icon: "https://storage.googleapis.com/tinglebot/Graphics/fish_white.png" },
  { name: "Fruit", icon: "https://storage.googleapis.com/tinglebot/Graphics/apple_white.png" },
  { name: "Meat", icon: "https://storage.googleapis.com/tinglebot/Graphics/meat_white.png" },
  { name: "Monster", icon: "https://storage.googleapis.com/tinglebot/Graphics/monster_part_white.png" },
  { name: "Mushroom", icon: "https://storage.googleapis.com/tinglebot/Graphics/fungi_white.png" },
  { name: "Natural", icon: "https://storage.googleapis.com/tinglebot/Graphics/ingredients_white.png" },
  { name: "Ore", icon: "https://storage.googleapis.com/tinglebot/Graphics/ore_white.png" },
  { name: "Plant", icon: "https://storage.googleapis.com/tinglebot/Graphics/plant_white.png" },
  { name: "Special", icon: "https://storage.googleapis.com/tinglebot/Graphics/special_white.png" },
  { name: "Recipe", icon: "https://storage.googleapis.com/tinglebot/Graphics/cooking_white.png" },
];

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ============================================================================
// ------------------- Subcomponents -------------------
// ============================================================================

/* [inventories/[characterName]/page.tsx]🧩 Empty state component - */
type EmptyStateProps = {
  icon: string;
  title: string;
  message: string;
};

function EmptyState({ icon, title, message }: EmptyStateProps) {
  return (
    <div className="rounded-lg border-2 border-dashed border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/50 p-12 text-center">
      <div className="mb-4 inline-flex items-center justify-center rounded-full bg-[var(--totk-brown)]/30 p-4">
        <i className={`fa-solid ${icon} text-4xl text-[var(--totk-grey-200)]`} aria-hidden="true" />
      </div>
      <h3 className="mb-2 text-xl font-bold text-[var(--totk-light-ocher)]">
        {title}
      </h3>
      <p className="text-base text-[var(--botw-pale)] opacity-60 italic">
        {message}
      </p>
    </div>
  );
}

/* [inventories/[characterName]/page.tsx]🧩 Stat card component - */
type StatCardProps = {
  label: string;
  value: number;
  valueColor: string;
};

function StatCard({ label, value, valueColor }: StatCardProps) {
  return (
    <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/60 to-[var(--totk-brown)]/30 p-3 shadow-inner">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
        {label}
      </p>
      <p className={`text-2xl font-bold ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}

/* [inventories/[characterName]/page.tsx]🧩 Quantity badge component - */
type QuantityBadgeProps = {
  quantity: number;
  showPlus?: boolean;
};

function QuantityBadge({ quantity, showPlus = false }: QuantityBadgeProps) {
  const isPositive = quantity > 0;
  const bgColor = isPositive
    ? "bg-[var(--totk-light-green)]/20 border border-[var(--totk-light-green)]/30 text-[var(--totk-light-green)]"
    : "bg-[#ff6347]/20 border border-[#ff6347]/30 text-[#ff6347]";
  const displayValue = showPlus && isPositive ? `+${quantity}` : String(quantity);

  return (
    <span className={`inline-flex items-center justify-center rounded-md px-2.5 py-1 font-bold min-w-[3rem] ${bgColor}`}>
      {displayValue}
    </span>
  );
}

/* [inventories/[characterName]/page.tsx]🧩 Category header component - */
type CategoryHeaderProps = {
  categoryName: string;
  isExpanded: boolean;
  ownedCount: number;
  totalCount: number;
  onToggle: () => void;
  iconUrl?: string;
  iconClass?: string;
};

function CategoryHeader({
  categoryName,
  isExpanded,
  ownedCount,
  totalCount,
  onToggle,
  iconUrl,
  iconClass,
}: CategoryHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 hover:bg-[var(--totk-brown)]/20 transition-colors border-b border-[var(--totk-dark-ocher)]/30"
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? "Collapse" : "Expand"} ${categoryName} category`}
    >
      <div className="flex items-center gap-3">
        <i
          className={`fa-solid fa-chevron-down text-sm text-[var(--totk-grey-200)] transition-transform duration-200 flex-shrink-0 ${
            isExpanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
        {iconUrl ? (
          <img
            src={iconUrl}
            alt={categoryName}
            className="w-6 h-6 object-contain flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/ankle_icon.png";
            }}
          />
        ) : iconClass ? (
          <i className={`${iconClass} text-xl text-[var(--totk-light-green)]`} aria-hidden="true" />
        ) : null}
        <h3 className="text-lg font-bold text-[var(--totk-light-green)]">
          {categoryName}
        </h3>
      </div>
      <span className="px-3 py-1 rounded-md bg-[var(--botw-blue)]/20 border border-[var(--botw-blue)]/30 text-sm font-semibold text-[var(--botw-blue)] flex-shrink-0">
        {ownedCount} / {totalCount}
      </span>
    </button>
  );
}

/* [inventories/[characterName]/page.tsx]🧩 Table header component - */
type TableHeaderProps = {
  columns: Array<{ label: string; align?: "left" | "center" | "right" }>;
};

function TableHeader({ columns }: TableHeaderProps) {
  const headerRowClass = "border-b-2 border-[var(--totk-dark-ocher)] bg-gradient-to-r from-[var(--totk-brown)]/40 to-[var(--totk-dark-ocher)]/20";
  const headerCellClass = "px-4 py-3 sm:py-4 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]";

  return (
    <thead>
      <tr className={headerRowClass}>
        {columns.map((col) => (
          <th
            key={col.label}
            className={`${headerCellClass} ${col.align === "center" ? "text-center" : col.align === "right" ? "text-right" : ""}`}
          >
            {col.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

const formatImageUrl = (url: string): string => {
  if (!url || url === "No Image") return "/ankle_icon.png";
  if (url.startsWith("https://storage.googleapis.com/tinglebot/")) {
    const path = url.replace("https://storage.googleapis.com/tinglebot/", "");
    return `/api/images/${path}`;
  }
  return url;
};

const getItemCategory = (item: InventoryItem): string | null => {
  for (const cat of item.category ?? []) {
    const catLower = String(cat ?? "").toLowerCase();
    for (const config of categoryConfig) {
      if (catLower.includes(config.name.toLowerCase())) {
        return config.name;
      }
    }
  }
  
  for (const type of item.type ?? []) {
    const typeLower = String(type ?? "").toLowerCase();
    for (const config of categoryConfig) {
      if (typeLower.includes(config.name.toLowerCase())) {
        return config.name;
      }
    }
  }
  
  return null;
};

const normalizeError = (err: unknown): Error => {
  return err instanceof Error ? err : new Error(String(err));
};

function getItemId(id: unknown): string {
  if (typeof id === "string" && id) return id;
  if (id && typeof id === "object" && "$oid" in id) return (id as { $oid: string }).$oid;
  if (id && typeof id === "object" && "oid" in id) return (id as { oid: string }).oid;
  if (id != null && typeof (id as { toString?: () => string }).toString === "function") {
    const s = (id as { toString: () => string }).toString();
    return s && s !== "[object Object]" ? s : "";
  }
  return "";
}

// ============================================================================
// ------------------- Component -------------------
// ============================================================================

export default function CharacterInventoryPage() {
  // ============================================================================
  // ------------------- Hooks & State -------------------
  // ============================================================================

  const { user, isAdmin, loading: sessionLoading } = useSession();
  const params = useParams();
  const characterNameParam = params?.characterName;
  const decodedCharacterName = characterNameParam && typeof characterNameParam === "string"
    ? decodeURIComponent(characterNameParam)
    : "";

  const [activeTab, setActiveTab] = useState<"inventory" | "history">("inventory");
  const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);
  const [logsData, setLogsData] = useState<LogsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryFilterGroups, setInventoryFilterGroups] = useState<FilterGroup[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const [historySearch, setHistorySearch] = useState("");
  const [historyFilterGroups, setHistoryFilterGroups] = useState<FilterGroup[]>([]);

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [itemLogs, setItemLogs] = useState<InventoryLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const [itemDetailsForAdmin, setItemDetailsForAdmin] = useState<{
    _id: unknown;
    entertainerItems?: boolean;
    divineItems?: boolean;
  } | null>(null);
  const [loadingItemDetails, setLoadingItemDetails] = useState(false);
  const [savingItemFlags, setSavingItemFlags] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // ============================================================================
  // ------------------- Data Fetching -------------------
  // ============================================================================

  useEffect(() => {
    if (!user || !decodedCharacterName) return;

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [inventoryRes, logsRes] = await Promise.all([
          fetch(
            `/api/inventories/character/${encodeURIComponent(decodedCharacterName)}`,
            { signal }
          ),
          fetch(
            `/api/inventories/character/${encodeURIComponent(decodedCharacterName)}/logs`,
            { signal }
          ),
        ]);

        if (signal.aborted) return;

        if (!inventoryRes.ok) {
          throw new Error("Failed to fetch inventory");
        }
        if (!logsRes.ok) {
          throw new Error("Failed to fetch logs");
        }

        const inventoryJson = await inventoryRes.json();
        const logsJson = await logsRes.json();

        if (signal.aborted) return;

        setInventoryData(inventoryJson.data);
        setLogsData(logsJson.data);
      } catch (err) {
        if (signal.aborted) return;
        const error = normalizeError(err);
        console.error("[inventories/[characterName]/page.tsx]❌ Failed to load inventory data:", error);
        setError(error.message);
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [user, decodedCharacterName]);

  // ============================================================================
  // ------------------- Filter Management -------------------
  // ============================================================================

  useEffect(() => {
    if (!inventoryData) {
      setInventoryFilterGroups([]);
      return;
    }

    const categories = Array.from(
      new Set(inventoryData.inventory.flatMap((item) => item.category))
    ).sort();
    const types = Array.from(
      new Set(inventoryData.inventory.flatMap((item) => item.type))
    ).sort();

    setInventoryFilterGroups([
      {
        id: "category",
        label: "Category",
        options: categories.map((cat) => ({
          id: `category-${cat}`,
          label: capitalize(cat),
          value: cat,
          active: false,
        })),
        type: "multiple",
      },
      {
        id: "type",
        label: "Type",
        options: types.map((type) => ({
          id: `type-${type}`,
          label: capitalize(type),
          value: type,
          active: false,
        })),
        type: "multiple",
      },
      {
        id: "owned",
        label: "Owned Status",
        options: [
          { id: "owned-yes", label: "Owned", value: "owned", active: false },
          { id: "owned-no", label: "Not Owned", value: "not-owned", active: false },
        ],
        type: "multiple",
      },
    ]);
  }, [inventoryData]);

  useEffect(() => {
    if (!logsData) {
      setHistoryFilterGroups([]);
      return;
    }

    const obtainMethods = Array.from(
      new Set(logsData.logs.map((log) => log.obtain))
    ).sort();
    const locations = Array.from(
      new Set(logsData.logs.map((log) => log.location).filter(Boolean))
    ).sort();

    setHistoryFilterGroups([
      {
        id: "obtain",
        label: "Obtain Method",
        options: obtainMethods.map((method) => ({
          id: `obtain-${method}`,
          label: capitalize(method),
          value: method,
          active: false,
        })),
        type: "multiple",
      },
      {
        id: "location",
        label: "Location",
        options: locations.map((loc) => ({
          id: `location-${loc}`,
          label: capitalize(loc),
          value: loc,
          active: false,
        })),
        type: "multiple",
      },
    ]);
  }, [logsData]);

  const updateFilterGroup = useCallback((
    setter: React.Dispatch<React.SetStateAction<FilterGroup[]>>,
    groupId: string,
    optionId: string,
    active: boolean
  ) => {
    setter((prev) =>
      prev.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            options: group.options.map((opt) =>
              opt.id === optionId ? { ...opt, active } : opt
            ),
          };
        }
        return group;
      })
    );
  }, []);

  const handleInventoryFilterChange = useCallback((
    groupId: string,
    optionId: string,
    active: boolean
  ) => {
    updateFilterGroup(setInventoryFilterGroups, groupId, optionId, active);
  }, [updateFilterGroup]);

  const handleHistoryFilterChange = useCallback((
    groupId: string,
    optionId: string,
    active: boolean
  ) => {
    updateFilterGroup(setHistoryFilterGroups, groupId, optionId, active);
  }, [updateFilterGroup]);

  const clearFilters = useCallback((
    setSearch: React.Dispatch<React.SetStateAction<string>>,
    setGroups: React.Dispatch<React.SetStateAction<FilterGroup[]>>
  ) => {
    setSearch("");
    setGroups((prev) =>
      prev.map((group) => ({
        ...group,
        options: group.options.map((opt) => ({ ...opt, active: false })),
      }))
    );
  }, []);

  const clearInventoryFilters = useCallback(() => {
    clearFilters(setInventorySearch, setInventoryFilterGroups);
  }, [clearFilters]);

  const clearHistoryFilters = useCallback(() => {
    clearFilters(setHistorySearch, setHistoryFilterGroups);
  }, [clearFilters]);

  // ============================================================================
  // ------------------- Filtering Logic -------------------
  // ============================================================================

  const getActiveFilterValues = useCallback((groups: FilterGroup[], groupId: string): string[] => {
    return groups
      .find((g) => g.id === groupId)
      ?.options.filter((opt) => opt.active)
      .map((opt) => {
        if (typeof opt.value === "string") return opt.value;
        return String(opt.value);
      }) || [];
  }, []);

  const filteredInventory = useMemo(() => {
    if (!inventoryData) return [];

    let filtered = [...inventoryData.inventory];

    if (inventorySearch.trim()) {
      const searchLower = inventorySearch.toLowerCase();
      filtered = filtered.filter((item) =>
        String(item.itemName ?? "").toLowerCase().includes(searchLower)
      );
    }

    const activeCategories = getActiveFilterValues(inventoryFilterGroups, "category");
    if (activeCategories.length > 0) {
      filtered = filtered.filter((item) =>
        (item.category ?? []).some((cat: unknown) =>
          activeCategories.some((ac) =>
            String(cat ?? "").toLowerCase().includes(String(ac ?? "").toLowerCase())
          )
        )
      );
    }

    const activeTypes = getActiveFilterValues(inventoryFilterGroups, "type");
    if (activeTypes.length > 0) {
      filtered = filtered.filter((item) =>
        (item.type ?? []).some((t: unknown) =>
          activeTypes.some((at) =>
            String(t ?? "").toLowerCase().includes(String(at ?? "").toLowerCase())
          )
        )
      );
    }

    const ownedFilter = getActiveFilterValues(inventoryFilterGroups, "owned");
    if (ownedFilter.includes("owned")) {
      filtered = filtered.filter((item) => item.owned);
    }
    if (ownedFilter.includes("not-owned")) {
      filtered = filtered.filter((item) => !item.owned);
    }

    return filtered;
  }, [inventoryData, inventorySearch, inventoryFilterGroups, getActiveFilterValues]);

  const groupedInventory = useMemo(() => {
    const groups: Record<string, InventoryItem[]> = {};
    
    categoryConfig.forEach((config) => {
      groups[config.name] = [];
    });
    
    groups["Other"] = [];
    
    filteredInventory.forEach((item) => {
      const category = getItemCategory(item);
      if (category && groups[category]) {
        groups[category].push(item);
      } else {
        groups["Other"].push(item);
      }
    });
    
    return groups;
  }, [filteredInventory]);

  const filteredLogs = useMemo(() => {
    if (!logsData) return [];

    let filtered = [...logsData.logs];

    if (historySearch.trim()) {
      const searchLower = historySearch.toLowerCase();
      filtered = filtered.filter((log) =>
        String(log.itemName ?? "").toLowerCase().includes(searchLower)
      );
    }

    const activeObtains = getActiveFilterValues(historyFilterGroups, "obtain");
    if (activeObtains.length > 0) {
      filtered = filtered.filter((log) =>
        activeObtains.some((ao) =>
          String(log.obtain ?? "").toLowerCase().includes(String(ao ?? "").toLowerCase())
        )
      );
    }

    const activeLocations = getActiveFilterValues(historyFilterGroups, "location");
    if (activeLocations.length > 0) {
      filtered = filtered.filter((log) =>
        log.location &&
        activeLocations.some((al) =>
          String(log.location ?? "").toLowerCase().includes(String(al ?? "").toLowerCase())
        )
      );
    }

    return filtered;
  }, [logsData, historySearch, historyFilterGroups, getActiveFilterValues]);

  // ============================================================================
  // ------------------- Category Management -------------------
  // ============================================================================

  const toggleCategory = useCallback((categoryName: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryName)) {
        next.delete(categoryName);
      } else {
        next.add(categoryName);
      }
      return next;
    });
  }, []);

  // ============================================================================
  // ------------------- Item Log Modal -------------------
  // ============================================================================

  const itemLogAbortControllerRef = useRef<AbortController | null>(null);

  const handleItemClick = useCallback(async (item: InventoryItem) => {
    itemLogAbortControllerRef.current?.abort();
    itemLogAbortControllerRef.current = new AbortController();
    const signal = itemLogAbortControllerRef.current.signal;

    setSelectedItem(item);
    setLoadingLogs(true);
    setLogError(null);
    setItemLogs([]);

    try {
      const res = await fetch(
        `/api/inventories/character/${encodeURIComponent(decodedCharacterName)}/logs?item=${encodeURIComponent(item.itemName)}`,
        { signal }
      );

      if (signal.aborted) return;

      if (!res.ok) {
        throw new Error("Failed to fetch item logs");
      }

      const data = await res.json();

      if (signal.aborted) return;

      setItemLogs(data.data?.logs || []);
    } catch (err) {
      if (signal.aborted) return;
      const error = normalizeError(err);
      console.error("[inventories/[characterName]/page.tsx]❌ Failed to load item logs:", error);
      setLogError(error.message);
    } finally {
      if (!signal.aborted) {
        setLoadingLogs(false);
      }
    }
  }, [decodedCharacterName]);

  const closeModal = useCallback(() => {
    itemLogAbortControllerRef.current?.abort();
    setSelectedItem(null);
    setItemLogs([]);
    setLogError(null);
    setItemDetailsForAdmin(null);
  }, []);

  useEffect(() => {
    if (!selectedItem) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeModal();
      }
    };
    
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [selectedItem, closeModal]);

  // Fetch item details for admin (entertainer/divine flags) when modal opens
  const itemDetailsAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!selectedItem || !isAdmin) {
      setItemDetailsForAdmin(null);
      setLoadingItemDetails(false);
      return;
    }
    itemDetailsAbortRef.current?.abort();
    itemDetailsAbortRef.current = new AbortController();
    const signal = itemDetailsAbortRef.current.signal;
    setLoadingItemDetails(true);
    setItemDetailsForAdmin(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/database/items?model=Item&itemName=${encodeURIComponent(selectedItem.itemName)}`,
          { signal }
        );
        if (signal.aborted) return;
        if (res.ok) {
          const data = (await res.json()) as { item: { _id: unknown; entertainerItems?: boolean; divineItems?: boolean } };
          if (data.item && !signal.aborted) {
            setItemDetailsForAdmin({
              _id: data.item._id,
              entertainerItems: data.item.entertainerItems ?? false,
              divineItems: data.item.divineItems ?? false,
            });
          }
        } else {
          setItemDetailsForAdmin(null);
        }
      } catch {
        if (!signal.aborted) setItemDetailsForAdmin(null);
      } finally {
        if (!signal.aborted) setLoadingItemDetails(false);
      }
    })();
    return () => {
      itemDetailsAbortRef.current?.abort();
    };
  }, [selectedItem?.itemName, isAdmin]);

  const updateItemFlags = useCallback(async (updates: { entertainerItems?: boolean; divineItems?: boolean }) => {
    if (!itemDetailsForAdmin || savingItemFlags) return;
    const itemId = getItemId(itemDetailsForAdmin._id);
    if (!itemId) return;
    setSavingItemFlags(true);
    try {
      const res = await fetch("/api/admin/database/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, updates, model: "Item" }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        throw new Error(err.message || "Failed to update item");
      }
      const data = (await res.json()) as { item: { entertainerItems?: boolean; divineItems?: boolean } };
      setItemDetailsForAdmin((prev) =>
        prev
          ? {
              ...prev,
              entertainerItems: data.item?.entertainerItems ?? prev.entertainerItems,
              divineItems: data.item?.divineItems ?? prev.divineItems,
            }
          : null
      );
    } catch (e) {
      console.error("[inventories] Update item flags failed:", e);
    } finally {
      setSavingItemFlags(false);
    }
  }, [itemDetailsForAdmin, savingItemFlags]);

  // ============================================================================
  // ------------------- Render Helpers -------------------
  // ============================================================================

  const renderItemCard = useCallback((item: InventoryItem) => {
    const itemImageUrl = formatImageUrl(item.image || "");
    const quantityDisplay = item.owned ? `Qty: ${item.quantity}` : "Not Owned";
    
    return (
      <button
        key={item.itemName}
        onClick={() => handleItemClick(item)}
        className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all min-h-[72px] text-left ${
          item.owned
            ? "border-[var(--totk-light-green)]/30 bg-[var(--botw-warm-black)]/60 hover:bg-[var(--botw-warm-black)]/80 relative before:content-[''] before:absolute before:left-0 before:top-0 before:w-1 before:h-full before:bg-[var(--totk-light-green)] before:rounded-l-lg"
            : "border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/30 opacity-60 hover:opacity-80"
        }`}
        aria-label={`View details for ${item.itemName}`}
      >
        <div className={`w-12 h-12 flex-shrink-0 rounded-lg border-2 overflow-hidden flex items-center justify-center bg-[var(--botw-warm-black)]/50 ${
          item.owned ? "border-[var(--totk-light-green)]/40" : "border-[var(--totk-dark-ocher)]/40"
        }`}>
          <img
            src={itemImageUrl}
            alt={item.itemName}
            className="w-full h-full object-contain"
            onError={(e) => {
              (e.target as HTMLImageElement).src = "/ankle_icon.png";
            }}
          />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-[var(--totk-light-green)] truncate text-sm mb-0.5">
            {item.itemName}
          </h4>
          <p className={`text-xs ${
            item.owned 
              ? "text-[var(--botw-blue)] font-semibold" 
              : "text-[var(--totk-grey-200)] italic"
          }`}>
            {quantityDisplay}
          </p>
        </div>
      </button>
    );
  }, [handleItemClick]);

  // ============================================================================
  // ------------------- Render -------------------
  // ============================================================================

  if (sessionLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading message="Loading inventory..." variant="inline" size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <h1 className="text-3xl font-bold text-[var(--totk-light-ocher)] mb-6">
            Access Denied
          </h1>
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-8 shadow-2xl">
            <p className="text-base text-[var(--botw-pale)] mb-6">
              You must be logged in to view inventories.
            </p>
            <a
              href="/api/auth/discord"
              className="inline-block rounded-md bg-[#5865F2] px-6 py-3 text-base font-bold text-white transition-colors hover:bg-[#4752C4]"
            >
              Login with Discord
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen p-8 flex items-center justify-center">
        <div className="max-w-md w-full text-center">
          <div className="rounded-lg border-2 border-[#ff6347] bg-[var(--botw-warm-black)] p-8 shadow-2xl">
            <h1 className="text-2xl font-bold text-[#ff6347] mb-4">Error</h1>
            <p className="text-base text-[var(--botw-pale)] mb-6">{error}</p>
            <Link
              href="/characters/inventories"
              className="inline-block rounded-md bg-[var(--totk-mid-ocher)] px-6 py-3 text-base font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)]"
            >
              Back to Inventories
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!inventoryData) {
    return null;
  }

  const iconUrl =
    inventoryData.icon && typeof inventoryData.icon === "string"
      ? inventoryData.icon
      : "/ankle_icon.png";

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[90rem]">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-4">
            <img src="/Side=Left.svg" alt="" className="h-6 md:h-8 opacity-80" />
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-[var(--totk-light-ocher)] tracking-tighter uppercase italic">
              {inventoryData.characterName}'s Inventory
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-6 md:h-8 opacity-80" />
          </div>
          <Link
            href="/characters/inventories"
            className="group inline-flex items-center gap-2.5 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 px-4 py-2.5 text-sm font-semibold text-[var(--botw-pale)] transition-all hover:border-[var(--totk-light-green)]/60 hover:bg-gradient-to-br hover:from-[var(--botw-warm-black)]/90 hover:to-[var(--totk-brown)]/50 hover:text-[var(--totk-light-green)] hover:shadow-lg hover:shadow-[var(--totk-light-green)]/20 hover:-translate-y-0.5"
          >
            <i className="fa-solid fa-arrow-left text-xs transition-transform group-hover:-translate-x-1" />
            <span>Back to Inventories</span>
          </Link>
        </div>

        {/* Character Header */}
        <div className="mb-8 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-6 shadow-lg">
          <div className="flex items-center gap-6">
            <img
              src={iconUrl}
              alt={inventoryData.characterName}
              className="h-20 w-20 sm:h-24 sm:w-24 rounded-lg border-2 border-[var(--totk-dark-ocher)] object-cover shadow-inner"
              onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                (e.target as HTMLImageElement).src = "/ankle_icon.png";
              }}
            />
            <div className="flex-1">
              <h2 className="text-2xl sm:text-3xl font-bold text-[var(--totk-light-green)] mb-4">
                {inventoryData.characterName}
              </h2>
              <div className="grid grid-cols-2 gap-4 max-w-md">
                <StatCard
                  label="Unique Items"
                  value={inventoryData.uniqueItems}
                  valueColor="text-[var(--totk-light-green)]"
                />
                <StatCard
                  label="Total Items"
                  value={inventoryData.totalItems}
                  valueColor="text-[var(--botw-blue)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-8">
          <Tabs
            tabs={[
              { value: "inventory", label: "Complete Inventory", icon: "fa-boxes" },
              { value: "history", label: "Acquisition History", icon: "fa-history" },
            ]}
            activeTab={activeTab}
            onTabChange={(tab) => {
              if (tab === "inventory" || tab === "history") {
                setActiveTab(tab);
              }
            }}
          />
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {/* Inventory Tab */}
          {activeTab === "inventory" && (
            <div className="space-y-6">
              {/* Filters */}
              <SearchFilterBar
                searchValue={inventorySearch}
                onSearchChange={setInventorySearch}
                searchPlaceholder="Search items by name..."
                filterGroups={inventoryFilterGroups}
                onFilterChange={handleInventoryFilterChange}
                onClearAll={clearInventoryFilters}
              />

              {/* Inventory Grid by Categories */}
              {filteredInventory.length === 0 ? (
                <EmptyState
                  icon="fa-box-open"
                  title="No Items Found"
                  message={
                    inventorySearch || inventoryFilterGroups.some(g => g.options.some(o => o.active))
                      ? "No items found matching your filters."
                      : "No items in inventory."
                  }
                />
              ) : (
                <div className="space-y-4">
                  {categoryConfig.map((config) => {
                    const items = groupedInventory[config.name] || [];
                    if (items.length === 0) return null;
                    
                    const isExpanded = expandedCategories.has(config.name);
                    const ownedCount = items.filter((item) => item.owned).length;
                    const categoryIconUrl = formatImageUrl(config.icon);

                    return (
                      <div
                        key={config.name}
                        className={`rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 shadow-lg overflow-hidden ${
                          !isExpanded ? "collapsed" : ""
                        }`}
                      >
                        {/* Category Header */}
                        <CategoryHeader
                          categoryName={config.name}
                          isExpanded={isExpanded}
                          ownedCount={ownedCount}
                          totalCount={items.length}
                          onToggle={() => toggleCategory(config.name)}
                          iconUrl={categoryIconUrl}
                        />

                        {/* Category Items */}
                        {isExpanded && (
                          <div className="p-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                              {items.map((item) => renderItemCard(item))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Other Category */}
                  {groupedInventory["Other"] && groupedInventory["Other"].length > 0 && (
                    <div
                      className={`rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 shadow-lg overflow-hidden ${
                        !expandedCategories.has("Other") ? "collapsed" : ""
                      }`}
                    >
                      <CategoryHeader
                        categoryName="Other"
                        isExpanded={expandedCategories.has("Other")}
                        ownedCount={groupedInventory["Other"].filter((i) => i.owned).length}
                        totalCount={groupedInventory["Other"].length}
                        onToggle={() => toggleCategory("Other")}
                        iconClass="fa-solid fa-box"
                      />
                      {expandedCategories.has("Other") && (
                        <div className="p-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {groupedInventory["Other"].map((item) => renderItemCard(item))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* History Tab */}
          {activeTab === "history" && (
            <div className="space-y-6">
              {/* Filters */}
              <SearchFilterBar
                searchValue={historySearch}
                onSearchChange={setHistorySearch}
                searchPlaceholder="Search history by item name..."
                filterGroups={historyFilterGroups}
                onFilterChange={handleHistoryFilterChange}
                onClearAll={clearHistoryFilters}
              />

              {/* History Table */}
              {filteredLogs.length === 0 ? (
                <EmptyState
                  icon="fa-history"
                  title="No History Found"
                  message={
                    historySearch || historyFilterGroups.some(g => g.options.some(o => o.active))
                      ? "No history found matching your filters."
                      : "No acquisition history available."
                  }
                />
              ) : (
                <div className="rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/80 overflow-hidden shadow-inner">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <TableHeader
                        columns={[
                          { label: "Date" },
                          { label: "Item" },
                          { label: "Quantity" },
                          { label: "Method" },
                          { label: "Location" },
                        ]}
                      />
                      <tbody>
                        {filteredLogs.map((log, index) => (
                          <tr
                            key={log._id}
                            className={`border-b border-[var(--totk-dark-ocher)]/20 last:border-0 transition-all ${
                              index % 2 === 0
                                ? "bg-[var(--botw-warm-black)]/30"
                                : "bg-[var(--totk-brown)]/10"
                            } hover:bg-[var(--totk-brown)]/20 hover:shadow-[0_0_8px_rgba(73,213,156,0.1)]`}
                          >
                            <td className="px-4 py-4 text-sm text-[var(--botw-pale)]">
                              {new Date(log.dateTime).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-4">
                              <span className="font-semibold text-[var(--totk-light-green)]">
                                {log.itemName}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <QuantityBadge quantity={log.quantity} showPlus />
                            </td>
                            <td className="px-4 py-4 text-sm text-[var(--botw-pale)]">
                              {log.obtain}
                            </td>
                            <td className="px-4 py-4 text-sm text-[var(--botw-pale)]">
                              {log.location || (
                                <span className="text-[var(--totk-grey-200)] italic">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Item Log Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-4xl max-h-[90vh] rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center gap-4 p-6 border-b border-[var(--totk-dark-ocher)]/30">
              <div className="w-16 h-16 flex-shrink-0 rounded-lg border-2 border-[var(--totk-light-green)]/40 overflow-hidden flex items-center justify-center bg-[var(--botw-warm-black)]/50">
                <img
                  src={formatImageUrl(selectedItem.image || "")}
                  alt={selectedItem.itemName}
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/ankle_icon.png";
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-[var(--totk-light-green)] truncate">
                  {selectedItem.itemName}
                </h2>
                {selectedItem.owned && (
                  <p className="text-sm text-[var(--botw-blue)] font-semibold mt-1">
                    Quantity: {selectedItem.quantity}
                  </p>
                )}
              </div>
              <button
                onClick={closeModal}
                className="flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50 hover:bg-[var(--botw-warm-black)]/80 text-[var(--totk-grey-200)] hover:text-[var(--botw-pale)] transition-colors"
                aria-label="Close modal"
              >
                <i className="fa-solid fa-times" />
              </button>
            </div>

            {/* Admin: Item flags (Entertainer / Divine) */}
            {isAdmin && (
              <div className="border-b border-[var(--totk-dark-ocher)]/30 px-6 py-4 bg-[var(--botw-warm-black)]/40">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)] mb-3">
                  Item flags (admin)
                </p>
                {loadingItemDetails ? (
                  <p className="text-sm text-[var(--totk-grey-200)] italic">Loading...</p>
                ) : itemDetailsForAdmin ? (
                  <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={itemDetailsForAdmin.entertainerItems ?? false}
                        disabled={savingItemFlags}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setItemDetailsForAdmin((prev) => (prev ? { ...prev, entertainerItems: v } : null));
                          updateItemFlags({ entertainerItems: v });
                        }}
                        className="rounded border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] focus:ring-[var(--totk-light-green)]/50"
                      />
                      <span className="text-sm text-[var(--botw-pale)]">Entertainer item</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={itemDetailsForAdmin.divineItems ?? false}
                        disabled={savingItemFlags}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setItemDetailsForAdmin((prev) => (prev ? { ...prev, divineItems: v } : null));
                          updateItemFlags({ divineItems: v });
                        }}
                        className="rounded border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] focus:ring-[var(--totk-light-green)]/50"
                      />
                      <span className="text-sm text-[var(--botw-pale)]">Divine item</span>
                    </label>
                    {savingItemFlags && (
                      <span className="text-xs text-[var(--totk-grey-200)] italic">Saving...</span>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-[var(--totk-grey-200)] italic">Item not in database.</p>
                )}
              </div>
            )}

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingLogs ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loading message="Loading acquisition logs..." variant="inline" size="lg" />
                </div>
              ) : logError ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <i className="fa-solid fa-exclamation-triangle text-4xl text-[#ff6347] mb-4" />
                  <p className="text-[var(--botw-pale)]">{logError}</p>
                </div>
              ) : itemLogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <i className="fa-solid fa-history text-4xl text-[var(--totk-grey-200)] mb-4 opacity-50" />
                  <p className="text-[var(--botw-pale)] opacity-60 italic">
                    No acquisition history found for this item.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <TableHeader
                      columns={[
                        { label: "Date/Time" },
                        { label: "Quantity" },
                        { label: "Method" },
                        { label: "Location" },
                        { label: "Link", align: "center" },
                      ]}
                    />
                    <tbody>
                      {itemLogs.map((log) => {
                        const quantity = parseInt(String(log.quantity)) || 0;
                        const isPositive = quantity > 0;
                        const dateTime = new Date(log.dateTime);
                        const formattedDate = dateTime.toLocaleString("en-US", {
                          month: "2-digit",
                          day: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        });

                        return (
                          <tr
                            key={log._id}
                            className="border-b border-[var(--totk-dark-ocher)]/20 hover:bg-[var(--totk-brown)]/10 transition-colors"
                          >
                            <td className="px-4 py-3 text-sm text-[var(--botw-pale)]">
                              {formattedDate}
                            </td>
                            <td className="px-4 py-3">
                              <QuantityBadge quantity={quantity} showPlus />
                            </td>
                            <td className="px-4 py-3 text-sm text-[var(--botw-pale)]">
                              {log.obtain || "-"}
                            </td>
                            <td className="px-4 py-3 text-sm text-[var(--botw-pale)]">
                              {log.location || "-"}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {log.link ? (
                                <a
                                  href={log.link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[var(--botw-blue)] hover:text-[var(--totk-light-green)] transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <i className="fa-solid fa-external-link-alt" />
                                </a>
                              ) : (
                                <span className="text-[var(--totk-grey-200)]">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
