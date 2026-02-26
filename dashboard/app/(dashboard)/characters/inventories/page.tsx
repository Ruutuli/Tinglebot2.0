"use client";

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import { useEffect, useState, useMemo, useCallback, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { Loading, Tabs, SearchFilterBar } from "@/components/ui";
import type { TabItem, FilterGroup } from "@/components/ui";
import { CraftersGuideTab } from "@/components/features/crafters-guide/CraftersGuideTab";
import { capitalize, createSlug } from "@/lib/string-utils";
import { imageUrlForGcsUrl } from "@/lib/image-url";
import { equipItem, getWeaponType, isShield, getArmorSlot, type EquippedGear } from "@/lib/gear-equip";
import { getCachedData, setCachedData } from "@/lib/cache-utils";
import {
  getVillageBorderClass,
  getVillageBorderStyle,
  getVillageTextStyle,
} from "@/app/(dashboard)/models/characters/page";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type InventorySummary = {
  characterName: string;
  characterId: string;
  icon: string | null;
  job: string | null;
  currentVillage: string | null;
  uniqueItems: number;
  totalItems: number;
};

type AggregatedItem = {
  itemName: string;
  total: number;
  characters: Array<{ characterName: string; quantity: number }>;
  category: string[];
  type: string[];
  image?: string;
};

type GearItem = {
  name: string;
  stats?: Record<string, unknown>;
};

type ArmorGear = {
  head?: GearItem | null;
  chest?: GearItem | null;
  legs?: GearItem | null;
};

type CharacterData = {
  _id: string;
  characterName: string;
  equippedGear?: EquippedGear;
  gearWeapon?: GearItem | null;
  gearShield?: GearItem | null;
  gearArmor?: ArmorGear | null;
  [key: string]: unknown;
};

type InventoryItem = {
  _id: unknown;
  itemName: string;
  categoryGear?: string;
  type?: string[];
  subtype?: string[];
  modifierHearts?: number;
  image?: string;
  [key: string]: unknown;
};

type Transaction = {
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

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

const formatImageUrl = (url: string): string => {
  if (!url || url === "No Image") return "/ankle_icon.png";
  if (url.startsWith("https://storage.googleapis.com/tinglebot/")) {
    return imageUrlForGcsUrl(url);
  }
  return url;
};

const normalizeError = (err: unknown): Error => {
  return err instanceof Error ? err : new Error(String(err));
};

// ============================================================================
// ------------------- Components -------------------
// ============================================================================

function InventoryCard({ summary }: { summary: InventorySummary }) {
  const villageClass = getVillageBorderClass(summary.currentVillage || "");
  const villageStyle = getVillageBorderStyle(summary.currentVillage || "");
  const villageTextStyle = getVillageTextStyle(summary.currentVillage || "");

  const iconUrl: string =
    summary.icon && typeof summary.icon === "string"
      ? summary.icon
      : "/ankle_icon.png";
  const hasCustomIcon: boolean = Boolean(
    summary.icon && typeof summary.icon === "string"
  );

  return (
    <Link
      href={`/characters/inventories/${createSlug(summary.characterName)}`}
      className={`group relative block rounded-lg border-2 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)] p-4 shadow-lg transition-all hover:shadow-xl hover:-translate-y-1 ${
        villageClass ||
        "border-[var(--totk-dark-ocher)] hover:border-[var(--totk-light-green)]/60"
      }`}
      style={villageStyle}
    >
      <div className="flex items-start gap-4">
        <img
          src={iconUrl}
          alt={summary.characterName}
          className={`h-20 w-20 sm:h-24 sm:w-24 flex-shrink-0 rounded-lg border-2 object-cover ${
            hasCustomIcon
              ? "border-[var(--totk-light-green)] shadow-[0_0_12px_rgba(73,213,156,0.6)]"
              : "border-[var(--totk-dark-ocher)]"
          }`}
          onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
            (e.target as HTMLImageElement).src = "/ankle_icon.png";
          }}
        />

        <div className="flex-1 min-w-0">
          <h3 className="mb-2 truncate text-lg font-bold text-[var(--totk-light-green)]">
            {summary.characterName}
          </h3>

          <div className="space-y-1.5 mb-3">
            {summary.currentVillage && (
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-home text-xs text-[var(--totk-grey-200)] w-4 flex-shrink-0" />
                <span
                  className="text-sm font-medium truncate"
                  style={villageTextStyle}
                >
                  {capitalize(summary.currentVillage)}
                </span>
              </div>
            )}

            {summary.job && (
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-briefcase text-xs text-[var(--totk-grey-200)] w-4 flex-shrink-0" />
                <span className="text-sm text-[var(--botw-pale)] truncate">
                  {capitalize(summary.job)}
                </span>
              </div>
            )}
          </div>

          {/* Inventory Stats */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/60 to-[var(--totk-brown)]/30 p-2 shadow-inner">
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                Unique Items
              </p>
              <p className="text-lg font-bold text-[var(--totk-light-green)]">
                {summary.uniqueItems}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/60 to-[var(--totk-brown)]/30 p-2 shadow-inner">
              <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                Total Items
              </p>
              <p className="text-lg font-bold text-[var(--botw-blue)]">
                {summary.totalItems}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ============================================================================
// ------------------- Main Component -------------------
// ============================================================================

function InventoriesPageContent() {
  // ============================================================================
  // ------------------- Hooks & State -------------------
  // ============================================================================

  const { user, loading: sessionLoading } = useSession();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<"all-items" | "transfer" | "equip" | "stats" | "transactions" | "crafters-guide">(
    tabParam === "crafters-guide" ? "crafters-guide" : "all-items"
  );

  useEffect(() => {
    if (tabParam === "crafters-guide") setActiveTab("crafters-guide");
  }, [tabParam]);

  const [summaries, setSummaries] = useState<InventorySummary[]>([]);
  const [aggregatedItems, setAggregatedItems] = useState<AggregatedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAggregated, setLoadingAggregated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aggregatedError, setAggregatedError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterGroups, setFilterGroups] = useState<FilterGroup[]>([]);
  
  const [transferSource, setTransferSource] = useState<string>("");
  const [transferDestination, setTransferDestination] = useState<string>("");
  const [transferItem, setTransferItem] = useState<string>("");
  const [transferQuantity, setTransferQuantity] = useState<number>(1);
  const [sourceItems, setSourceItems] = useState<Array<{ itemName: string; quantity: number }>>([]);
  const [loadingSourceItems, setLoadingSourceItems] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferSuccess, setTransferSuccess] = useState<string | null>(null);

  const [selectedCharacter, setSelectedCharacter] = useState<string>("");
  const [characterData, setCharacterData] = useState<CharacterData | null>(null);
  const [equippableItems, setEquippableItems] = useState<InventoryItem[]>([]);
  const [loadingCharacter, setLoadingCharacter] = useState(false);
  const [loadingEquippableItems, setLoadingEquippableItems] = useState(false);
  const [equipping, setEquipping] = useState(false);
  const [equipError, setEquipError] = useState<string | null>(null);
  const [equipSuccess, setEquipSuccess] = useState<string | null>(null);
  const [itemsLookup, setItemsLookup] = useState<Map<string, InventoryItem>>(new Map());
  const [itemsCaseInsensitiveLookup, setItemsCaseInsensitiveLookup] = useState<Map<string, string>>(new Map());
  const [equippedItemsDetails, setEquippedItemsDetails] = useState<Map<string, { image?: string; modifierHearts?: number }>>(new Map());
  const warnedMissingItems = useRef<Set<string>>(new Set());
  const [loadingItems, setLoadingItems] = useState(false);
  const itemsFetchRef = useRef<Promise<void> | null>(null);
  const [equippingItemId, setEquippingItemId] = useState<string | null>(null);

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [transactionsError, setTransactionsError] = useState<string | null>(null);
  const [transactionsSearch, setTransactionsSearch] = useState("");
  const [transactionsFilterGroups, setTransactionsFilterGroups] = useState<FilterGroup[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  // ============================================================================
  // ------------------- Data Fetching -------------------
  // ============================================================================

  useEffect(() => {
    if (!user) return;

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const fetchInventories = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/inventories/list", { signal });
        
        if (signal.aborted) return;

        if (!res.ok) {
          throw new Error("Failed to fetch inventories");
        }
        
        const data = await res.json();
        
        if (signal.aborted) return;

        setSummaries(data.data || []);
      } catch (err) {
        if (signal.aborted) return;
        const error = normalizeError(err);
        console.error("[inventories/page.tsx]❌ Failed to load inventories:", error);
        setError(error.message);
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchInventories();

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [user]);

  const transactionsAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user || activeTab !== "transactions") return;

    transactionsAbortControllerRef.current?.abort();
    transactionsAbortControllerRef.current = new AbortController();
    const signal = transactionsAbortControllerRef.current.signal;

    const fetchAllTransactions = async () => {
      try {
        setLoadingTransactions(true);
        setTransactionsError(null);
        
        const allLogs: Transaction[] = [];

        for (const summary of summaries) {
          if (signal.aborted) return;

          try {
            const res = await fetch(
              `/api/inventories/character/${encodeURIComponent(summary.characterName)}/logs`,
              { signal }
            );
            
            if (signal.aborted) return;

            if (res.ok) {
              const data = await res.json();
              const logs = data.data?.logs || [];
              allLogs.push(...logs);
            }
          } catch (err) {
            if (signal.aborted) return;
            const error = normalizeError(err);
            console.error(`[inventories/page.tsx]❌ Failed to fetch logs for ${summary.characterName}:`, error);
          }
        }

        if (signal.aborted) return;

        allLogs.sort((a, b) => {
          const dateA = new Date(a.dateTime).getTime();
          const dateB = new Date(b.dateTime).getTime();
          return dateB - dateA;
        });

        setAllTransactions(allLogs);
      } catch (err) {
        if (signal.aborted) return;
        const error = normalizeError(err);
        console.error("[inventories/page.tsx]❌ Failed to load transactions:", error);
        setTransactionsError(error.message);
      } finally {
        if (!signal.aborted) {
          setLoadingTransactions(false);
        }
      }
    };

    fetchAllTransactions();

    return () => {
      transactionsAbortControllerRef.current?.abort();
    };
  }, [user, activeTab, summaries]);

  // Build transactions filter groups
  // Create a stable key based on transaction content to prevent infinite loops
  const transactionsContentKey = useMemo(() => {
    if (allTransactions.length === 0) return "";
    const chars = Array.from(new Set(allTransactions.map((t: { characterName: string }) => t.characterName))).sort().join(",");
    const methods = Array.from(new Set(allTransactions.map((t: { obtain: string }) => t.obtain).filter(Boolean))).sort().join(",");
    const locs = Array.from(new Set(allTransactions.map((t: { location: string }) => t.location).filter(Boolean))).sort().join(",");
    return `${allTransactions.length}-${chars}-${methods}-${locs}`;
  }, [allTransactions]);

  useEffect(() => {
    if (allTransactions.length === 0) {
      setTransactionsFilterGroups((prev) => {
        // Only update if we don't already have the default filter groups
        if (prev.length === 1 && prev[0]?.id === "sortBy") {
          return prev;
        }
        return [
          {
            id: "sortBy",
            label: "Sort By",
            options: [
              { id: "sort-date-newest", label: "Newest First", value: "date-newest", active: true },
              { id: "sort-date-oldest", label: "Oldest First", value: "date-oldest", active: false },
            ],
            type: "single",
          },
        ];
      });
      return;
    }

    const characters = Array.from(new Set(allTransactions.map((t: { characterName: string }) => t.characterName))).sort();
    const obtainMethods = Array.from(new Set(allTransactions.map((t: { obtain: string }) => t.obtain).filter(Boolean))).sort();
    const locations = Array.from(new Set(allTransactions.map((t: { location: string }) => t.location).filter(Boolean))).sort();

    const newFilterGroups: FilterGroup[] = [
      {
        id: "sortBy",
        label: "Sort By",
        options: [
          { id: "sort-date-newest", label: "Newest First", value: "date-newest", active: true },
          { id: "sort-date-oldest", label: "Oldest First", value: "date-oldest", active: false },
        ],
        type: "single",
      },
      {
        id: "character",
        label: "Character",
        options: characters.map((char) => ({
          id: `character-${char}`,
          label: char,
          value: char,
          active: false,
        })),
        type: "multiple",
      },
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
    ];

    setTransactionsFilterGroups((prev) => {
      // Compare if the filter groups have actually changed to prevent infinite loops
      if (prev.length === newFilterGroups.length) {
        const hasChanged = prev.some((prevGroup, index) => {
          const newGroup = newFilterGroups[index];
          if (prevGroup.id !== newGroup.id || prevGroup.options.length !== newGroup.options.length) {
            return true;
          }
          // Compare option values (not active states, as those change via user interaction)
          const prevValues = prevGroup.options.map(opt => opt.value).sort().join(',');
          const newValues = newGroup.options.map(opt => opt.value).sort().join(',');
          return prevValues !== newValues;
        });
        
        if (!hasChanged) {
          return prev; // Return previous reference to prevent re-render
        }
      }

      return newFilterGroups;
    });
  }, [transactionsContentKey]);

  // Handle transactions filter changes
  const handleTransactionsFilterChange = (groupId: string, optionId: string, active: boolean) => {
    setTransactionsFilterGroups((prev: FilterGroup[]) =>
      prev.map((group: FilterGroup) => {
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
  };

  // Clear transactions filters
  const clearTransactionsFilters = () => {
    setTransactionsSearch("");
    setTransactionsFilterGroups((prev: FilterGroup[]) =>
      prev.map((group: FilterGroup) => ({
        ...group,
        options: group.options.map((opt) => ({ ...opt, active: false })),
      }))
    );
  };

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    let filtered = [...allTransactions];

    // Apply search filter
    if (transactionsSearch.trim()) {
      const searchLower = transactionsSearch.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          String(t.itemName ?? "").toLowerCase().includes(searchLower) ||
          String(t.characterName ?? "").toLowerCase().includes(searchLower)
      );
    }

    // Apply character filters
    const activeCharacters = transactionsFilterGroups
      .find((g) => g.id === "character")
      ?.options.filter((opt) => opt.active)
      .map((opt) => opt.value as string) || [];
    if (activeCharacters.length > 0) {
      filtered = filtered.filter((t) => activeCharacters.includes(t.characterName));
    }

    // Apply obtain filters
    const activeObtains = transactionsFilterGroups
      .find((g) => g.id === "obtain")
      ?.options.filter((opt) => opt.active)
      .map((opt) => opt.value as string) || [];
    if (activeObtains.length > 0) {
      filtered = filtered.filter((t) =>
        activeObtains.some((ao) =>
          String(t.obtain ?? "").toLowerCase().includes(String(ao ?? "").toLowerCase())
        )
      );
    }

    // Apply location filters
    const activeLocations = transactionsFilterGroups
      .find((g) => g.id === "location")
      ?.options.filter((opt) => opt.active)
      .map((opt) => opt.value as string) || [];
    if (activeLocations.length > 0) {
      filtered = filtered.filter(
        (t) =>
          t.location &&
          activeLocations.some((al) =>
            String(t.location ?? "").toLowerCase().includes(String(al ?? "").toLowerCase())
          )
      );
    }

    // Apply sorting
    const sortByGroup = transactionsFilterGroups.find((g) => g.id === "sortBy");
    const activeSort = sortByGroup?.options.find((opt) => opt.active)?.value as string || "date-newest";

    filtered.sort((a, b) => {
      const dateA = new Date(a.dateTime).getTime();
      const dateB = new Date(b.dateTime).getTime();
      return activeSort === "date-newest" ? dateB - dateA : dateA - dateB;
    });

    return filtered;
  }, [allTransactions, transactionsSearch, transactionsFilterGroups]);

  const aggregatedAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!user || (activeTab !== "all-items" && activeTab !== "stats")) return;

    aggregatedAbortControllerRef.current?.abort();
    aggregatedAbortControllerRef.current = new AbortController();
    const signal = aggregatedAbortControllerRef.current.signal;

    const fetchAggregated = async () => {
      try {
        setLoadingAggregated(true);
        setAggregatedError(null);
        const res = await fetch("/api/inventories/aggregated", { signal });
        
        if (signal.aborted) return;

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const errorMessage = errorData.details || errorData.error || "Failed to fetch aggregated inventory";
          throw new Error(errorMessage);
        }
        
        const data = await res.json();
        
        if (signal.aborted) return;

        setAggregatedItems(data.data || []);
      } catch (err) {
        if (signal.aborted) return;
        const error = normalizeError(err);
        console.error("[inventories/page.tsx]❌ Failed to load aggregated inventory:", error);
        setAggregatedError(error.message);
      } finally {
        if (!signal.aborted) {
          setLoadingAggregated(false);
        }
      }
    };

    fetchAggregated();

    return () => {
      aggregatedAbortControllerRef.current?.abort();
    };
  }, [user, activeTab]);

  // Build filter groups from aggregated items
  // Create a stable key based on aggregated items content to prevent infinite loops
  const aggregatedItemsContentKey = useMemo(() => {
    if (aggregatedItems.length === 0) return "";
    const cats = new Set<string>();
    const types = new Set<string>();
    const chars = new Set<string>();
    aggregatedItems.forEach((item) => {
      item.category.forEach((cat) => cats.add(cat));
      item.type.forEach((t) => types.add(t));
      item.characters.forEach((char) => chars.add(char.characterName));
    });
    return `${aggregatedItems.length}-${Array.from(cats).sort().join(",")}-${Array.from(types).sort().join(",")}-${Array.from(chars).sort().join(",")}`;
  }, [aggregatedItems]);

  useEffect(() => {
    if (aggregatedItems.length === 0) {
      setFilterGroups((prev) => {
        // Only update if we don't already have the default filter groups
        if (prev.length === 1 && prev[0]?.id === "sortBy") {
          return prev;
        }
        return [
          {
            id: "sortBy",
            label: "Sort By",
            options: [
              { id: "sort-name-asc", label: "Name (A-Z)", value: "name-asc", active: true },
              { id: "sort-name-desc", label: "Name (Z-A)", value: "name-desc", active: false },
              { id: "sort-total-asc", label: "Total (Low-High)", value: "total-asc", active: false },
              { id: "sort-total-desc", label: "Total (High-Low)", value: "total-desc", active: false },
            ],
            type: "single",
          },
        ];
      });
      return;
    }

    // Collect unique categories, types, and characters
    const categories = new Set<string>();
    const types = new Set<string>();
    const characters = new Set<string>();

    aggregatedItems.forEach((item) => {
      item.category.forEach((cat) => categories.add(cat));
      item.type.forEach((t) => types.add(t));
      item.characters.forEach((char) => characters.add(char.characterName));
    });

    // Build filter groups
    const categoryOptions = Array.from(categories)
      .sort()
      .map((cat) => ({
        id: `category-${cat}`,
        label: capitalize(cat),
        value: cat,
        active: false,
      }));

    const typeOptions = Array.from(types)
      .sort()
      .map((t) => ({
        id: `type-${t}`,
        label: capitalize(t),
        value: t,
        active: false,
      }));

    const characterOptions = Array.from(characters)
      .sort()
      .map((char) => ({
        id: `character-${char}`,
        label: char,
        value: char,
        active: false,
      }));

    // Check if sortBy group already exists to preserve selection
    setFilterGroups((prev) => {
      const existingSortBy = prev.find((g) => g.id === "sortBy");
      const defaultSortOption = existingSortBy?.options.find((opt) => opt.active)?.id || "sort-name-asc";

      const newFilterGroups: FilterGroup[] = [
        {
          id: "sortBy",
          label: "Sort By",
          options: [
            { id: "sort-name-asc", label: "Name (A-Z)", value: "name-asc", active: defaultSortOption === "sort-name-asc" },
            { id: "sort-name-desc", label: "Name (Z-A)", value: "name-desc", active: defaultSortOption === "sort-name-desc" },
            { id: "sort-total-asc", label: "Total (Low-High)", value: "total-asc", active: defaultSortOption === "sort-total-asc" },
            { id: "sort-total-desc", label: "Total (High-Low)", value: "total-desc", active: defaultSortOption === "sort-total-desc" },
          ],
          type: "single",
        },
        {
          id: "character",
          label: "Character",
          options: characterOptions,
          type: "multiple",
        },
        {
          id: "category",
          label: "Category",
          options: categoryOptions,
          type: "multiple",
        },
        {
          id: "type",
          label: "Type",
          options: typeOptions,
          type: "multiple",
        },
      ];

      // Compare if the filter groups have actually changed to prevent infinite loops
      if (prev.length === newFilterGroups.length) {
        const hasChanged = prev.some((prevGroup, index) => {
          const newGroup = newFilterGroups[index];
          if (prevGroup.id !== newGroup.id || prevGroup.options.length !== newGroup.options.length) {
            return true;
          }
          // Compare option values (not active states, as those change via user interaction)
          const prevValues = prevGroup.options.map(opt => opt.value).sort().join(',');
          const newValues = newGroup.options.map(opt => opt.value).sort().join(',');
          return prevValues !== newValues;
        });
        
        if (!hasChanged) {
          return prev; // Return previous reference to prevent re-render
        }
      }

      return newFilterGroups;
    });
  }, [aggregatedItemsContentKey]);

  // Filter change handler
  const handleFilterChange = (groupId: string, optionId: string, active: boolean) => {
    setFilterGroups((prev) =>
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
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearch("");
    setFilterGroups((prev) =>
      prev.map((group) => ({
        ...group,
        options: group.options.map((opt) => ({ ...opt, active: false })),
      }))
    );
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    let filtered = [...aggregatedItems];

    // Apply search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          String(item.itemName ?? "").toLowerCase().includes(searchLower) ||
          (item.category ?? []).some((cat: unknown) =>
            String(cat ?? "").toLowerCase().includes(searchLower)
          ) ||
          (item.type ?? []).some((t: unknown) =>
            String(t ?? "").toLowerCase().includes(searchLower)
          ) ||
          (item.characters ?? []).some((char: any) =>
            String(char?.characterName ?? "").toLowerCase().includes(searchLower)
          )
      );
    }

    // Apply character filters
    const activeCharacters = filterGroups
      .find((g) => g.id === "character")
      ?.options.filter((opt) => opt.active)
      .map((opt) => opt.value as string) || [];
    if (activeCharacters.length > 0) {
      filtered = filtered.filter((item) =>
        item.characters.some((char) => activeCharacters.includes(char.characterName))
      );
    }

    // Apply category filters
    const activeCategories = filterGroups
      .find((g) => g.id === "category")
      ?.options.filter((opt) => opt.active)
      .map((opt) => opt.value as string) || [];
    if (activeCategories.length > 0) {
      filtered = filtered.filter((item) =>
        item.category.some((cat) => activeCategories.includes(cat))
      );
    }

    // Apply type filters
    const activeTypes = filterGroups
      .find((g) => g.id === "type")
      ?.options.filter((opt) => opt.active)
      .map((opt) => opt.value as string) || [];
    if (activeTypes.length > 0) {
      filtered = filtered.filter((item) =>
        item.type.some((t) => activeTypes.includes(t))
      );
    }

    // Apply sorting
    const sortByGroup = filterGroups.find((g) => g.id === "sortBy");
    const activeSort = sortByGroup?.options.find((opt) => opt.active)?.value as string || "name-asc";

    filtered.sort((a, b) => {
      switch (activeSort) {
        case "name-asc":
          return a.itemName.localeCompare(b.itemName);
        case "name-desc":
          return b.itemName.localeCompare(a.itemName);
        case "total-asc":
          return a.total - b.total;
        case "total-desc":
          return b.total - a.total;
        default:
          return 0;
      }
    });

    return filtered;
  }, [aggregatedItems, search, filterGroups]);

  const sourceItemsAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!transferSource || !user) {
      setSourceItems([]);
      setTransferItem("");
      setTransferQuantity(1);
      return;
    }

    sourceItemsAbortControllerRef.current?.abort();
    sourceItemsAbortControllerRef.current = new AbortController();
    const signal = sourceItemsAbortControllerRef.current.signal;

    const fetchSourceItems = async () => {
      try {
        setLoadingSourceItems(true);
        setTransferError(null);
        const encodedName = encodeURIComponent(transferSource);
        const res = await fetch(`/api/inventories/character/${encodedName}/items`, { signal });
        
        if (signal.aborted) return;

        if (!res.ok) {
          throw new Error("Failed to fetch source character items");
        }
        
        const data = await res.json();
        
        if (signal.aborted) return;

        setSourceItems(data.data || []);
      } catch (err) {
        if (signal.aborted) return;
        const error = normalizeError(err);
        console.error("[inventories/page.tsx]❌ Failed to load source items:", error);
        setTransferError(error.message);
        setSourceItems([]);
      } finally {
        if (!signal.aborted) {
          setLoadingSourceItems(false);
        }
      }
    };

    fetchSourceItems();

    return () => {
      sourceItemsAbortControllerRef.current?.abort();
    };
  }, [transferSource, user]);

  // Update quantity when item changes
  // Create a stable key for sourceItems to prevent infinite loops
  const sourceItemsKey = useMemo(() => 
    JSON.stringify(sourceItems.map(item => `${item.itemName}:${item.quantity}`).sort()),
    [sourceItems]
  );

  useEffect(() => {
    if (transferItem) {
      const selectedItem = sourceItems.find((item) => item.itemName === transferItem);
      if (selectedItem) {
        // Use functional update to avoid stale closure issues
        setTransferQuantity((prevQty) => Math.min(prevQty, selectedItem.quantity));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferItem, sourceItemsKey]);

  // Clear equip messages when switching tabs or characters
  useEffect(() => {
    if (activeTab !== "equip") {
      setEquipError(null);
      setEquipSuccess(null);
      setSelectedCharacter("");
      setCharacterData(null);
      setEquippableItems([]);
    }
  }, [activeTab]);

  const characterFetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const skipEquippableRefetchRef = useRef<boolean>(false);
  const characterAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!selectedCharacter || !user || activeTab !== "equip") {
      setCharacterData(null);
      setEquippableItems([]);
      setEquipError(null);
      setEquipSuccess(null);
      if (characterFetchTimeoutRef.current) {
        clearTimeout(characterFetchTimeoutRef.current);
        characterFetchTimeoutRef.current = null;
      }
      characterAbortControllerRef.current?.abort();
      return;
    }

    if (characterFetchTimeoutRef.current) {
      clearTimeout(characterFetchTimeoutRef.current);
    }

    characterFetchTimeoutRef.current = setTimeout(async () => {
      characterAbortControllerRef.current?.abort();
      characterAbortControllerRef.current = new AbortController();
      const signal = characterAbortControllerRef.current.signal;

      try {
        setLoadingCharacter(true);
        setEquipError(null);
        setEquipSuccess(null);
        const encodedName = encodeURIComponent(selectedCharacter);
        const res = await fetch(`/api/characters/${encodedName}?skipHelpWanted=true`, { signal });
        
        if (signal.aborted) return;

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const errorMessage = errorData.error || errorData.details || `Failed to fetch character (${res.status})`;
          throw new Error(errorMessage);
        }
        
        const data = await res.json();
        
        if (signal.aborted) return;

        if (!data.character) {
          throw new Error("Character data not found in response");
        }
        
        setCharacterData(data.character);
      } catch (err) {
        if (signal.aborted) return;
        const error = normalizeError(err);
        console.error("[inventories/page.tsx]❌ Failed to load character data:", error);
        setEquipError(error.message);
        setCharacterData(null);
      } finally {
        if (!signal.aborted) {
          setLoadingCharacter(false);
        }
        characterFetchTimeoutRef.current = null;
      }
    }, 300);

    return () => {
      if (characterFetchTimeoutRef.current) {
        clearTimeout(characterFetchTimeoutRef.current);
        characterFetchTimeoutRef.current = null;
      }
      characterAbortControllerRef.current?.abort();
    };
  }, [selectedCharacter, user, activeTab]);

  const itemsAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (activeTab !== "equip" || !user) {
      itemsAbortControllerRef.current?.abort();
      return;
    }

    if (itemsFetchRef.current) {
      return;
    }

    const CACHE_KEY = "items_lookup_cache";

    itemsAbortControllerRef.current = new AbortController();
    const signal = itemsAbortControllerRef.current.signal;

    const fetchAllItems = async () => {
      if (itemsFetchRef.current) {
        await itemsFetchRef.current;
        return;
      }

      try {
        setLoadingItems(true);
        
        const cached = getCachedData<{
          lookup: Array<[string, InventoryItem]>;
          caseInsensitiveLookup: Array<[string, string]>;
        }>({
          key: CACHE_KEY,
          version: "1.0",
          expiry: 1000 * 60 * 30,
        });

        if (cached) {
          const lookup = new Map<string, InventoryItem>(cached.lookup);
          const caseInsensitiveLookup = new Map<string, string>(
            cached.caseInsensitiveLookup
          );
          setItemsLookup(lookup);
          setItemsCaseInsensitiveLookup(caseInsensitiveLookup);
          setLoadingItems(false);
          return;
        }

        const res = await fetch("/api/models/items?limit=10000", {
          cache: "default",
          signal,
        });
        
        if (signal.aborted) return;

        if (!res.ok) {
          throw new Error("Failed to fetch items");
        }
        
        const data = await res.json();
        const items = data.data || [];
        
        if (signal.aborted) return;

        const lookup = new Map<string, InventoryItem>();
        const caseInsensitiveLookup = new Map<string, string>();
        
        items.forEach((item: InventoryItem) => {
          if (item.itemName) {
            const normalizedName = item.itemName.trim();
            lookup.set(normalizedName, item);
            const lowerName = normalizedName.toLowerCase();
            if (!caseInsensitiveLookup.has(lowerName)) {
              caseInsensitiveLookup.set(lowerName, normalizedName);
            }
          }
        });
        
        if (signal.aborted) return;

        setItemsLookup(lookup);
        setItemsCaseInsensitiveLookup(caseInsensitiveLookup);

        setCachedData(
          {
            key: CACHE_KEY,
            version: "1.0",
          },
          {
            lookup: Array.from(lookup.entries()),
            caseInsensitiveLookup: Array.from(caseInsensitiveLookup.entries()),
          }
        );
      } catch (err) {
        if (signal.aborted) return;
        const error = normalizeError(err);
        console.error("[inventories/page.tsx]❌ Failed to fetch items for lookup:", error);
      } finally {
        if (!signal.aborted) {
          setLoadingItems(false);
        }
        itemsFetchRef.current = null;
      }
    };

    itemsFetchRef.current = fetchAllItems();

    return () => {
      itemsAbortControllerRef.current?.abort();
    };
  }, [activeTab, user]);

  const getItemDetails = useCallback((itemName: string): InventoryItem | null => {
    if (!itemName) return null;
    
    const normalizedName = itemName.trim();
    
    let itemDetails = itemsLookup.get(normalizedName);
    if (itemDetails) return itemDetails;
    
    const lowerName = normalizedName.toLowerCase();
    const originalCaseName = itemsCaseInsensitiveLookup.get(lowerName);
    if (originalCaseName) {
      itemDetails = itemsLookup.get(originalCaseName);
      if (itemDetails) return itemDetails;
    }
    
    if (itemsLookup.size > 0 && !warnedMissingItems.current.has(normalizedName)) {
      warnedMissingItems.current.add(normalizedName);
      console.debug(`[inventories/page.tsx] Item not found in lookup: "${itemName}" (normalized: "${normalizedName}")`);
    }
    
    return null;
  }, [itemsLookup, itemsCaseInsensitiveLookup]);

  const equippableItemsAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!selectedCharacter || !user || activeTab !== "equip" || itemsLookup.size === 0) {
      if (!selectedCharacter || activeTab !== "equip") {
        setEquippableItems([]);
      }
      equippableItemsAbortControllerRef.current?.abort();
      return;
    }

    equippableItemsAbortControllerRef.current?.abort();
    equippableItemsAbortControllerRef.current = new AbortController();
    const signal = equippableItemsAbortControllerRef.current.signal;

    const fetchEquippableItems = async () => {
      try {
        setLoadingEquippableItems(true);
        setEquipError(null);
        const encodedName = encodeURIComponent(selectedCharacter);
        
        const inventoryRes = await fetch(`/api/inventories/character/${encodedName}/items`, { signal });
        
        if (signal.aborted) return;

        if (!inventoryRes.ok) {
          throw new Error("Failed to fetch inventory items");
        }
        
        const inventoryData = await inventoryRes.json();
        const inventoryItems = inventoryData.data || [];

        const equippedItemNames = new Set<string>();
        if (characterData?.gearWeapon?.name) {
          equippedItemNames.add(characterData.gearWeapon.name.toLowerCase());
        }
        if (characterData?.gearShield?.name) {
          equippedItemNames.add(characterData.gearShield.name.toLowerCase());
        }
        if (characterData?.gearArmor?.head?.name) {
          equippedItemNames.add(characterData.gearArmor.head.name.toLowerCase());
        }
        if (characterData?.gearArmor?.chest?.name) {
          equippedItemNames.add(characterData.gearArmor.chest.name.toLowerCase());
        }
        if (characterData?.gearArmor?.legs?.name) {
          equippedItemNames.add(characterData.gearArmor.legs.name.toLowerCase());
        }

        const equippable: InventoryItem[] = [];
        
        inventoryItems.forEach((item: { itemName?: string | null; Equipped?: boolean }) => {
          if (item.Equipped === true) {
            return;
          }

          const itemName = String(item?.itemName ?? "").trim();
          if (!itemName) {
            return;
          }
          const itemNameLower = itemName.toLowerCase();

          if (equippedItemNames.has(itemNameLower)) {
            return;
          }

          const itemDetails = getItemDetails(itemName);
          
          if (!itemDetails) {
            return;
          }
          
          const itemData = {
            _id: null,
            itemName,
            categoryGear: itemDetails.categoryGear,
            type: itemDetails.type || [],
            subtype: itemDetails.subtype || [],
            modifierHearts: itemDetails.modifierHearts || 0,
          };
          
          const weaponType = getWeaponType(itemData);
          const shieldCheck = isShield(itemData);
          const armorSlot = getArmorSlot(itemData);
          
          if (weaponType || shieldCheck || armorSlot) {
            equippable.push({
              _id: null,
              itemName,
              categoryGear: itemDetails.categoryGear || "",
              type: itemDetails.type || [],
              subtype: itemDetails.subtype || [],
              modifierHearts: itemDetails.modifierHearts || 0,
              image: itemDetails.image,
            });
          }
        });

        if (signal.aborted) return;

        setEquippableItems(equippable);
      } catch (err) {
        if (signal.aborted) return;
        const error = normalizeError(err);
        console.error("[inventories/page.tsx]❌ Failed to load equippable items:", error);
        setEquipError(error.message);
        setEquippableItems([]);
      } finally {
        if (!signal.aborted) {
          setLoadingEquippableItems(false);
        }
      }
    };

    if (skipEquippableRefetchRef.current) {
      skipEquippableRefetchRef.current = false;
      return;
    }
    
    fetchEquippableItems();

    return () => {
      equippableItemsAbortControllerRef.current?.abort();
    };
  }, [selectedCharacter, user, activeTab, itemsLookup, itemsCaseInsensitiveLookup, getItemDetails, characterData]);

  // Fetch item details for equipped items to show images and stats
  // Create a stable key for characterData to prevent infinite loops
  const characterDataKey = useMemo(() => {
    if (!characterData) return "";
    const weapon = characterData.gearWeapon?.name || "";
    const shield = characterData.gearShield?.name || "";
    const head = characterData.gearArmor?.head?.name || "";
    const chest = characterData.gearArmor?.chest?.name || "";
    const legs = characterData.gearArmor?.legs?.name || "";
    return `${weapon}-${shield}-${head}-${chest}-${legs}`;
  }, [characterData]);

  useEffect(() => {
    if (!characterData || !itemsLookup.size) {
      setEquippedItemsDetails(new Map());
      return;
    }

    const fetchEquippedDetails = async () => {
      const details = new Map<string, { image?: string; modifierHearts?: number }>();
      
      // Get equipped item names
      const equippedNames: string[] = [];
      if (characterData.gearWeapon?.name) equippedNames.push(characterData.gearWeapon.name);
      if (characterData.gearShield?.name) equippedNames.push(characterData.gearShield.name);
      if (characterData.gearArmor?.head?.name) equippedNames.push(characterData.gearArmor.head.name);
      if (characterData.gearArmor?.chest?.name) equippedNames.push(characterData.gearArmor.chest.name);
      if (characterData.gearArmor?.legs?.name) equippedNames.push(characterData.gearArmor.legs.name);

      for (const itemName of equippedNames) {
        // Use helper function with case-insensitive fallback
        const itemDetails = getItemDetails(itemName);
        
        if (itemDetails) {
          details.set(itemName, {
            image: itemDetails.image,
            modifierHearts: itemDetails.modifierHearts || 0,
          });
        }
      }
      
      setEquippedItemsDetails(details);
    };

    fetchEquippedDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characterDataKey, itemsLookup.size, itemsCaseInsensitiveLookup.size]);

  // Helper function to build gear update payload for API
  const buildGearUpdatePayload = useCallback((gear: EquippedGear) => {
    return {
      gearWeapon: gear.gearWeapon
        ? {
            name: gear.gearWeapon.name,
            stats: statsToRecord(gear.gearWeapon.stats),
          }
        : null,
      gearShield: gear.gearShield
        ? {
            name: gear.gearShield.name,
            stats: statsToRecord(gear.gearShield.stats),
          }
        : null,
      gearArmor: gear.gearArmor
        ? {
            head: gear.gearArmor.head
              ? {
                  name: gear.gearArmor.head.name,
                  stats: statsToRecord(gear.gearArmor.head.stats),
                }
              : null,
            chest: gear.gearArmor.chest
              ? {
                  name: gear.gearArmor.chest.name,
                  stats: statsToRecord(gear.gearArmor.chest.stats),
                }
              : null,
            legs: gear.gearArmor.legs
              ? {
                  name: gear.gearArmor.legs.name,
                  stats: statsToRecord(gear.gearArmor.legs.stats),
                }
              : null,
          }
        : null,
    };
  }, []);

  // Helper function to convert stats to Record format
  const statsToRecord = (stats: Map<string, number> | Record<string, number>): Record<string, number> => {
    if (stats instanceof Map) {
      return Object.fromEntries(stats);
    }
    return stats;
  };

  // Helper function to convert character gear to EquippedGear format
  const convertStatsToMap = (stats?: Record<string, unknown>): Map<string, number> => {
    const map = new Map<string, number>();
    if (stats) {
      Object.entries(stats).forEach(([key, value]) => {
        const numValue = typeof value === "number" ? value : Number(value) || 0;
        map.set(key, numValue);
      });
    }
    return map;
  };

  const characterDataToEquippedGear = useCallback((charData: CharacterData): EquippedGear => {
    return {
      gearWeapon: charData.gearWeapon
        ? {
            name: charData.gearWeapon.name,
            stats: convertStatsToMap(charData.gearWeapon.stats),
          }
        : undefined,
      gearShield: charData.gearShield
        ? {
            name: charData.gearShield.name,
            stats: convertStatsToMap(charData.gearShield.stats),
          }
        : undefined,
      gearArmor: charData.gearArmor
        ? {
            head: charData.gearArmor.head
              ? {
                  name: charData.gearArmor.head.name,
                  stats: convertStatsToMap(charData.gearArmor.head.stats),
                }
              : undefined,
            chest: charData.gearArmor.chest
              ? {
                  name: charData.gearArmor.chest.name,
                  stats: convertStatsToMap(charData.gearArmor.chest.stats),
                }
              : undefined,
            legs: charData.gearArmor.legs
              ? {
                  name: charData.gearArmor.legs.name,
                  stats: convertStatsToMap(charData.gearArmor.legs.stats),
                }
              : undefined,
          }
        : undefined,
    };
  }, []);

  // Handle equip item with optimistic updates and batched API calls
  const handleEquipItem = async (itemName: string) => {
    if (!selectedCharacter || !characterData || !user) return;

    // Store previous state for rollback
    const previousCharacterData = JSON.parse(JSON.stringify(characterData));
    const previousEquippableItems = [...equippableItems];
    let rollbackNeeded = false;

    try {
      setEquippingItemId(itemName);
      setEquipError(null);
      setEquipSuccess(null);

      // Find the item details
      const item = equippableItems.find((i) => i.itemName === itemName);
      if (!item) {
        throw new Error("Item not found in equippable items");
      }

      // Get current gear
      const currentGear = characterDataToEquippedGear(characterData);

      // Get current weapon item for conflict checking
      const currentWeaponItem = characterData.gearWeapon?.name
        ? equippableItems.find((i) => {
            const weaponName = characterData.gearWeapon?.name;
            return weaponName && i.itemName === weaponName;
          })
        : undefined;

      // Calculate new gear (optimistic update)
      const newGear = equipItem(item, currentGear, currentWeaponItem || undefined);

      // Determine which item was previously equipped (if any) that needs to be unequipped
      let itemToUnequip: string | null = null;
      if (item.categoryGear === "Weapon" && characterData.gearWeapon) {
        itemToUnequip = characterData.gearWeapon.name;
      } else if (item.categoryGear === "Shield" && characterData.gearShield) {
        itemToUnequip = characterData.gearShield.name;
      } else if (item.categoryGear === "Armor") {
        const armorSlot = getArmorSlot(item);
        if (armorSlot === "head" && characterData.gearArmor?.head) {
          itemToUnequip = characterData.gearArmor.head.name;
        } else if (armorSlot === "chest" && characterData.gearArmor?.chest) {
          itemToUnequip = characterData.gearArmor.chest.name;
        } else if (armorSlot === "legs" && characterData.gearArmor?.legs) {
          itemToUnequip = characterData.gearArmor.legs.name;
        }
      }

      // Optimistic UI update - update character data immediately
      const optimisticCharacterData = {
        ...characterData,
        gearWeapon: newGear.gearWeapon ? {
          name: newGear.gearWeapon.name,
          stats: statsToRecord(newGear.gearWeapon.stats),
        } : null,
        gearShield: newGear.gearShield ? {
          name: newGear.gearShield.name,
          stats: statsToRecord(newGear.gearShield.stats),
        } : null,
        gearArmor: newGear.gearArmor ? {
          head: newGear.gearArmor.head ? {
            name: newGear.gearArmor.head.name,
            stats: statsToRecord(newGear.gearArmor.head.stats),
          } : null,
          chest: newGear.gearArmor.chest ? {
            name: newGear.gearArmor.chest.name,
            stats: statsToRecord(newGear.gearArmor.chest.stats),
          } : null,
          legs: newGear.gearArmor.legs ? {
            name: newGear.gearArmor.legs.name,
            stats: statsToRecord(newGear.gearArmor.legs.stats),
          } : null,
        } : null,
      };
      setCharacterData(optimisticCharacterData);
      
      // Update equippableItems optimistically - remove the item being equipped
      const updatedEquippableItems = equippableItems.filter(i => i.itemName !== itemName);
      // If we're replacing an item, add the old item back to equippableItems
      if (itemToUnequip && itemToUnequip !== itemName) {
        const unequippedItem = previousEquippableItems.find(i => i.itemName === itemToUnequip);
        if (unequippedItem) {
          updatedEquippableItems.push(unequippedItem);
        }
      }
      setEquippableItems(updatedEquippableItems);
      
      // Update equippedItemsDetails immediately for optimistic image display
      // Use the item being equipped directly for immediate image availability
      const newEquippedDetails = new Map(equippedItemsDetails);
      
      // Add the newly equipped item immediately (use item from equippableItems for image)
      if (newGear.gearWeapon && newGear.gearWeapon.name === itemName) {
        newEquippedDetails.set(newGear.gearWeapon.name, {
          image: item.image || getItemDetails(newGear.gearWeapon.name)?.image,
          modifierHearts: item.modifierHearts || getItemDetails(newGear.gearWeapon.name)?.modifierHearts || 0,
        });
      }
      if (newGear.gearShield && newGear.gearShield.name === itemName) {
        newEquippedDetails.set(newGear.gearShield.name, {
          image: item.image || getItemDetails(newGear.gearShield.name)?.image,
          modifierHearts: item.modifierHearts || getItemDetails(newGear.gearShield.name)?.modifierHearts || 0,
        });
      }
      if (newGear.gearArmor?.head && newGear.gearArmor.head.name === itemName) {
        newEquippedDetails.set(newGear.gearArmor.head.name, {
          image: item.image || getItemDetails(newGear.gearArmor.head.name)?.image,
          modifierHearts: item.modifierHearts || getItemDetails(newGear.gearArmor.head.name)?.modifierHearts || 0,
        });
      }
      if (newGear.gearArmor?.chest && newGear.gearArmor.chest.name === itemName) {
        newEquippedDetails.set(newGear.gearArmor.chest.name, {
          image: item.image || getItemDetails(newGear.gearArmor.chest.name)?.image,
          modifierHearts: item.modifierHearts || getItemDetails(newGear.gearArmor.chest.name)?.modifierHearts || 0,
        });
      }
      if (newGear.gearArmor?.legs && newGear.gearArmor.legs.name === itemName) {
        newEquippedDetails.set(newGear.gearArmor.legs.name, {
          image: item.image || getItemDetails(newGear.gearArmor.legs.name)?.image,
          modifierHearts: item.modifierHearts || getItemDetails(newGear.gearArmor.legs.name)?.modifierHearts || 0,
        });
      }
      
      // Update other equipped items from lookup if needed (for items that weren't just equipped)
      if (newGear.gearWeapon && newGear.gearWeapon.name !== itemName) {
        const itemDetails = getItemDetails(newGear.gearWeapon.name);
        if (itemDetails) {
          newEquippedDetails.set(newGear.gearWeapon.name, {
            image: itemDetails.image,
            modifierHearts: itemDetails.modifierHearts || 0,
          });
        }
      }
      if (newGear.gearShield && newGear.gearShield.name !== itemName) {
        const itemDetails = getItemDetails(newGear.gearShield.name);
        if (itemDetails) {
          newEquippedDetails.set(newGear.gearShield.name, {
            image: itemDetails.image,
            modifierHearts: itemDetails.modifierHearts || 0,
          });
        }
      }
      if (newGear.gearArmor?.head && newGear.gearArmor.head.name !== itemName) {
        const itemDetails = getItemDetails(newGear.gearArmor.head.name);
        if (itemDetails) {
          newEquippedDetails.set(newGear.gearArmor.head.name, {
            image: itemDetails.image,
            modifierHearts: itemDetails.modifierHearts || 0,
          });
        }
      }
      if (newGear.gearArmor?.chest && newGear.gearArmor.chest.name !== itemName) {
        const itemDetails = getItemDetails(newGear.gearArmor.chest.name);
        if (itemDetails) {
          newEquippedDetails.set(newGear.gearArmor.chest.name, {
            image: itemDetails.image,
            modifierHearts: itemDetails.modifierHearts || 0,
          });
        }
      }
      if (newGear.gearArmor?.legs && newGear.gearArmor.legs.name !== itemName) {
        const itemDetails = getItemDetails(newGear.gearArmor.legs.name);
        if (itemDetails) {
          newEquippedDetails.set(newGear.gearArmor.legs.name, {
            image: itemDetails.image,
            modifierHearts: itemDetails.modifierHearts || 0,
          });
        }
      }
      
      // Remove unequipped items from details
      if (itemToUnequip && itemToUnequip !== itemName) {
        newEquippedDetails.delete(itemToUnequip);
      }
      // Remove items that are no longer equipped
      if (!newGear.gearWeapon && characterData.gearWeapon) {
        newEquippedDetails.delete(characterData.gearWeapon.name);
      }
      if (!newGear.gearShield && characterData.gearShield) {
        newEquippedDetails.delete(characterData.gearShield.name);
      }
      if (item.categoryGear === "Armor") {
        const armorSlot = getArmorSlot(item);
        if (armorSlot === "head" && characterData.gearArmor?.head) {
          newEquippedDetails.delete(characterData.gearArmor.head.name);
        } else if (armorSlot === "chest" && characterData.gearArmor?.chest) {
          newEquippedDetails.delete(characterData.gearArmor.chest.name);
        } else if (armorSlot === "legs" && characterData.gearArmor?.legs) {
          newEquippedDetails.delete(characterData.gearArmor.legs.name);
        }
      }
      setEquippedItemsDetails(newEquippedDetails);
      
      rollbackNeeded = true;

      // Build gear update payload
      const gearForAPI = buildGearUpdatePayload(newGear);

      // Batch API calls - run inventory and character updates in parallel where possible
      const encodedName = encodeURIComponent(selectedCharacter);
      const apiCalls: Promise<Response>[] = [];

      // Unequip previous item from inventory (if needed)
      if (itemToUnequip && itemToUnequip !== itemName) {
        apiCalls.push(
          fetch("/api/inventories/equip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              characterName: selectedCharacter,
              itemName: itemToUnequip,
              action: "unequip",
            }),
          }).catch((e: unknown) => {
            const error = e instanceof Error ? e : new Error(String(e));
            console.warn("[inventories/page.tsx]⚠️ Failed to unequip previous item from inventory:", error);
            return new Response(JSON.stringify({ error: String(e) }), {
              status: 500,
              statusText: "Internal Server Error",
              headers: { "Content-Type": "application/json" },
            });
          })
        );
      }

      // Equip new item in inventory
      apiCalls.push(
        fetch("/api/inventories/equip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterName: selectedCharacter,
            itemName: itemName,
            action: "equip",
          }),
        })
      );

      // Update character gear
      apiCalls.push(
        fetch(`/api/characters/${encodedName}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equippedGear: JSON.stringify(gearForAPI),
          }),
        })
      );

      // Execute all API calls
      const results = await Promise.all(apiCalls);

      // Check results - inventory equip is critical
      const equipInventoryRes = results[itemToUnequip && itemToUnequip !== itemName ? 1 : 0];
      if (!equipInventoryRes.ok) {
        const errorData = await equipInventoryRes.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update inventory");
      }

      // Check character update result
      const characterUpdateRes = results[results.length - 1];
      if (!characterUpdateRes.ok) {
        const errorData = await characterUpdateRes.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update character gear");
      }

      // Refresh character data to get server-calculated stats
      const updatedRes = await fetch(`/api/characters/${encodedName}?skipHelpWanted=true`);
      if (updatedRes.ok) {
        const updatedData = await updatedRes.json();
        const newCharacterData = updatedData.character || null;
        setCharacterData(newCharacterData);
        
        // Update equippableItems based on new characterData to ensure consistency
        // Remove newly equipped item and add back any unequipped items
        skipEquippableRefetchRef.current = true; // Prevent useEffect from refetching
        setEquippableItems(prev => {
          const filtered = prev.filter(i => i.itemName !== itemName);
          // If an item was unequipped, add it back if it's not already there
          if (itemToUnequip && itemToUnequip !== itemName) {
            const alreadyExists = filtered.some(i => i.itemName === itemToUnequip);
            if (!alreadyExists) {
              const unequippedItem = previousEquippableItems.find(i => i.itemName === itemToUnequip);
              if (unequippedItem) {
                filtered.push(unequippedItem);
              }
            }
          }
          return filtered;
        });
        
        rollbackNeeded = false; // Success, no rollback needed
      }

      setEquipSuccess(`Successfully equipped ${itemName}!`);
    } catch (e) {
      // Rollback optimistic update on error
      if (rollbackNeeded) {
        setCharacterData(previousCharacterData);
        setEquippableItems(previousEquippableItems);
        // Rollback equippedItemsDetails - need to recalculate from previousCharacterData
        const previousEquippedDetails = new Map<string, { image?: string; modifierHearts?: number }>();
        if (previousCharacterData.gearWeapon?.name) {
          const itemDetails = getItemDetails(previousCharacterData.gearWeapon.name);
          if (itemDetails) {
            previousEquippedDetails.set(previousCharacterData.gearWeapon.name, {
              image: itemDetails.image,
              modifierHearts: itemDetails.modifierHearts || 0,
            });
          }
        }
        if (previousCharacterData.gearShield?.name) {
          const itemDetails = getItemDetails(previousCharacterData.gearShield.name);
          if (itemDetails) {
            previousEquippedDetails.set(previousCharacterData.gearShield.name, {
              image: itemDetails.image,
              modifierHearts: itemDetails.modifierHearts || 0,
            });
          }
        }
        if (previousCharacterData.gearArmor?.head?.name) {
          const itemDetails = getItemDetails(previousCharacterData.gearArmor.head.name);
          if (itemDetails) {
            previousEquippedDetails.set(previousCharacterData.gearArmor.head.name, {
              image: itemDetails.image,
              modifierHearts: itemDetails.modifierHearts || 0,
            });
          }
        }
        if (previousCharacterData.gearArmor?.chest?.name) {
          const itemDetails = getItemDetails(previousCharacterData.gearArmor.chest.name);
          if (itemDetails) {
            previousEquippedDetails.set(previousCharacterData.gearArmor.chest.name, {
              image: itemDetails.image,
              modifierHearts: itemDetails.modifierHearts || 0,
            });
          }
        }
        if (previousCharacterData.gearArmor?.legs?.name) {
          const itemDetails = getItemDetails(previousCharacterData.gearArmor.legs.name);
          if (itemDetails) {
            previousEquippedDetails.set(previousCharacterData.gearArmor.legs.name, {
              image: itemDetails.image,
              modifierHearts: itemDetails.modifierHearts || 0,
            });
          }
        }
        setEquippedItemsDetails(previousEquippedDetails);
      }
      const error = e instanceof Error ? e : new Error(String(e));
      setEquipError(error.message);
      console.error("[inventories/page.tsx]❌ Failed to equip item:", error);
    } finally {
      setEquippingItemId(null);
    }
  };

  // Helper function to build gear update for unequip
  type GearUpdate = {
    gearWeapon?: null | undefined;
    gearShield?: null | undefined;
    gearArmor?: {
      head?: { name: string; stats?: Record<string, unknown> } | null;
      chest?: { name: string; stats?: Record<string, unknown> } | null;
      legs?: { name: string; stats?: Record<string, unknown> } | null;
    } | undefined;
  };

  const buildUnequipGearUpdate = useCallback((currentGear: EquippedGear, slot: "weapon" | "shield" | "head" | "chest" | "legs"): GearUpdate => {
    const update: GearUpdate = {
      gearWeapon: currentGear.gearWeapon ? null : undefined,
      gearShield: currentGear.gearShield ? null : undefined,
      gearArmor: currentGear.gearArmor ? {} : undefined,
    };

    if (slot === "weapon") {
      update.gearWeapon = null;
    } else if (slot === "shield") {
      update.gearShield = null;
    } else if (slot === "head" || slot === "chest" || slot === "legs") {
      if (currentGear.gearArmor) {
        update.gearArmor = {
          head: slot === "head" ? null : (currentGear.gearArmor.head ? {
            name: currentGear.gearArmor.head.name,
            stats: statsToRecord(currentGear.gearArmor.head.stats) as Record<string, unknown>,
          } : null),
          chest: slot === "chest" ? null : (currentGear.gearArmor.chest ? {
            name: currentGear.gearArmor.chest.name,
            stats: statsToRecord(currentGear.gearArmor.chest.stats) as Record<string, unknown>,
          } : null),
          legs: slot === "legs" ? null : (currentGear.gearArmor.legs ? {
            name: currentGear.gearArmor.legs.name,
            stats: statsToRecord(currentGear.gearArmor.legs.stats) as Record<string, unknown>,
          } : null),
        };
      }
    }

    return update;
  }, []);

  // Handle unequip item with optimistic updates and batched API calls
  const handleUnequipItem = async (slot: "weapon" | "shield" | "head" | "chest" | "legs") => {
    if (!selectedCharacter || !characterData || !user) return;

    // Store previous state for rollback
    const previousCharacterData = JSON.parse(JSON.stringify(characterData));
    const previousEquippableItems = [...equippableItems];
    let rollbackNeeded = false;

    try {
      setEquippingItemId(`${slot}-unequip`);
      setEquipError(null);
      setEquipSuccess(null);

      // Get the item name that's being unequipped
      let itemToUnequip: string | null = null;
      if (slot === "weapon" && characterData.gearWeapon) {
        itemToUnequip = characterData.gearWeapon.name;
      } else if (slot === "shield" && characterData.gearShield) {
        itemToUnequip = characterData.gearShield.name;
      } else if (slot === "head" && characterData.gearArmor?.head) {
        itemToUnequip = characterData.gearArmor.head.name;
      } else if (slot === "chest" && characterData.gearArmor?.chest) {
        itemToUnequip = characterData.gearArmor.chest.name;
      } else if (slot === "legs" && characterData.gearArmor?.legs) {
        itemToUnequip = characterData.gearArmor.legs.name;
      }

      if (!itemToUnequip) {
        throw new Error(`No item equipped in ${slot} slot`);
      }

      // Optimistic UI update - update character data immediately
      const optimisticCharacterData = { ...characterData };
      if (slot === "weapon") {
        optimisticCharacterData.gearWeapon = null;
      } else if (slot === "shield") {
        optimisticCharacterData.gearShield = null;
      } else if (slot === "head" || slot === "chest" || slot === "legs") {
        if (!optimisticCharacterData.gearArmor) {
          optimisticCharacterData.gearArmor = {};
        }
        optimisticCharacterData.gearArmor[slot] = null;
      }
      setCharacterData(optimisticCharacterData);
      
      // Update equippableItems optimistically - add the unequipped item back
      if (itemToUnequip) {
        // Check if item exists in previousEquippableItems (before it was equipped)
        // If not, we'll need to fetch it from inventory or itemsLookup
        const itemDetails = getItemDetails(itemToUnequip);
        if (itemDetails) {
          const unequippedItem = {
            _id: null,
            itemName: itemToUnequip,
            categoryGear: itemDetails.categoryGear || "",
            type: itemDetails.type || [],
            subtype: itemDetails.subtype || [],
            modifierHearts: itemDetails.modifierHearts || 0,
            image: itemDetails.image,
          };
          // Check if it's already in equippableItems
          const alreadyExists = equippableItems.some(i => i.itemName === itemToUnequip);
          if (!alreadyExists) {
            setEquippableItems(prev => [...prev, unequippedItem]);
          }
        }
      }
      
      // Update equippedItemsDetails immediately - remove unequipped item
      const newEquippedDetails = new Map(equippedItemsDetails);
      if (itemToUnequip) {
        newEquippedDetails.delete(itemToUnequip);
      }
      setEquippedItemsDetails(newEquippedDetails);
      
      rollbackNeeded = true;

      // Build gear update payload
      const currentGear = characterDataToEquippedGear(characterData);
      const gearForAPI = buildUnequipGearUpdate(currentGear, slot);

      // Batch API calls - run inventory and character updates in parallel
      const encodedName = encodeURIComponent(selectedCharacter);
      const [inventoryRes, characterRes] = await Promise.all([
        fetch("/api/inventories/equip", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            characterName: selectedCharacter,
            itemName: itemToUnequip,
            action: "unequip",
          }),
        }),
        fetch(`/api/characters/${encodedName}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equippedGear: JSON.stringify(gearForAPI),
          }),
        }),
      ]);

      // Check inventory update result
      if (!inventoryRes.ok) {
        const errorData = await inventoryRes.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update inventory");
      }

      // Check character update result
      if (!characterRes.ok) {
        const errorData = await characterRes.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update character gear");
      }

      // Refresh character data to get server-calculated stats
      const updatedRes = await fetch(`/api/characters/${encodedName}?skipHelpWanted=true`);
      if (updatedRes.ok) {
        const updatedData = await updatedRes.json();
        const newCharacterData = updatedData.character || null;
        setCharacterData(newCharacterData);
        
        // Ensure unequipped item is in equippableItems (should already be there from optimistic update)
        // But verify it's there in case the optimistic update didn't work
        if (itemToUnequip) {
          const itemDetails = getItemDetails(itemToUnequip);
          if (itemDetails) {
            setEquippableItems(prev => {
              const alreadyExists = prev.some(i => i.itemName === itemToUnequip);
              if (!alreadyExists) {
                const unequippedItem = {
                  _id: null,
                  itemName: itemToUnequip,
                  categoryGear: itemDetails.categoryGear || "",
                  type: itemDetails.type || [],
                  subtype: itemDetails.subtype || [],
                  modifierHearts: itemDetails.modifierHearts || 0,
                  image: itemDetails.image,
                };
                return [...prev, unequippedItem];
              }
              return prev;
            });
          }
        }
        
        rollbackNeeded = false; // Success, no rollback needed
      }

      setEquipSuccess(`Successfully unequipped ${slot}!`);
    } catch (e) {
      // Rollback optimistic update on error
      if (rollbackNeeded) {
        setCharacterData(previousCharacterData);
        setEquippableItems(previousEquippableItems);
        // Rollback equippedItemsDetails - restore previous state
        const previousEquippedDetails = new Map<string, { image?: string; modifierHearts?: number }>();
        if (previousCharacterData.gearWeapon?.name) {
          const itemDetails = getItemDetails(previousCharacterData.gearWeapon.name);
          if (itemDetails) {
            previousEquippedDetails.set(previousCharacterData.gearWeapon.name, {
              image: itemDetails.image,
              modifierHearts: itemDetails.modifierHearts || 0,
            });
          }
        }
        if (previousCharacterData.gearShield?.name) {
          const itemDetails = getItemDetails(previousCharacterData.gearShield.name);
          if (itemDetails) {
            previousEquippedDetails.set(previousCharacterData.gearShield.name, {
              image: itemDetails.image,
              modifierHearts: itemDetails.modifierHearts || 0,
            });
          }
        }
        if (previousCharacterData.gearArmor?.head?.name) {
          const itemDetails = getItemDetails(previousCharacterData.gearArmor.head.name);
          if (itemDetails) {
            previousEquippedDetails.set(previousCharacterData.gearArmor.head.name, {
              image: itemDetails.image,
              modifierHearts: itemDetails.modifierHearts || 0,
            });
          }
        }
        if (previousCharacterData.gearArmor?.chest?.name) {
          const itemDetails = getItemDetails(previousCharacterData.gearArmor.chest.name);
          if (itemDetails) {
            previousEquippedDetails.set(previousCharacterData.gearArmor.chest.name, {
              image: itemDetails.image,
              modifierHearts: itemDetails.modifierHearts || 0,
            });
          }
        }
        if (previousCharacterData.gearArmor?.legs?.name) {
          const itemDetails = getItemDetails(previousCharacterData.gearArmor.legs.name);
          if (itemDetails) {
            previousEquippedDetails.set(previousCharacterData.gearArmor.legs.name, {
              image: itemDetails.image,
              modifierHearts: itemDetails.modifierHearts || 0,
            });
          }
        }
        setEquippedItemsDetails(previousEquippedDetails);
      }
      const errorMessage = e instanceof Error ? e.message : "Failed to unequip item";
      setEquipError(errorMessage);
      console.error("Failed to unequip item:", e);
    } finally {
      setEquippingItemId(null);
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferSource || !transferDestination || !transferItem || !transferQuantity) {
      setTransferError("Please fill in all fields");
      return;
    }

    if (transferSource === transferDestination) {
      setTransferError("Source and destination characters must be different");
      return;
    }

    const selectedItem = sourceItems.find((item) => item.itemName === transferItem);
    if (!selectedItem || transferQuantity > selectedItem.quantity) {
      setTransferError("Invalid quantity");
      return;
    }

    try {
      setTransferring(true);
      setTransferError(null);
      setTransferSuccess(null);

      const res = await fetch("/api/inventories/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCharacterName: transferSource,
          destinationCharacterName: transferDestination,
          itemName: transferItem,
          quantity: transferQuantity,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Transfer failed");
      }

      const data = await res.json();
      setTransferSuccess(data.message || "Transfer completed successfully!");
      
      // Reset form
      setTransferItem("");
      setTransferQuantity(1);
      
      // Refresh inventories
      const listRes = await fetch("/api/inventories/list");
      if (listRes.ok) {
        const listData = await listRes.json();
        setSummaries(listData.data || []);
      }

      // Refresh source items
      const encodedName = encodeURIComponent(transferSource);
      const itemsRes = await fetch(`/api/inventories/character/${encodedName}/items`);
      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        setSourceItems(itemsData.data || []);
      }
    } catch (e) {
      setTransferError(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setTransferring(false);
    }
  };

  if (sessionLoading || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading message="Loading inventories..." variant="inline" size="lg" />
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
              You must be logged in to view your inventories.
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

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[90rem]">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-4">
            <img src="/Side=Left.svg" alt="" className="h-6 md:h-8 opacity-80" />
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-[var(--totk-light-ocher)] tracking-tighter uppercase italic">
              My Inventories
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-6 md:h-8 opacity-80" />
          </div>
          <p className="text-[var(--totk-grey-200)] font-medium tracking-widest uppercase text-sm opacity-60 text-center">
            View and manage your character inventories
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 rounded-lg border-2 border-[#ff6347] bg-[var(--botw-warm-black)]/90 p-6 shadow-lg">
            <div className="flex items-start gap-4">
              <i className="fa-solid fa-exclamation-triangle text-2xl text-[#ff6347]" />
              <div className="flex-1">
                <h3 className="mb-2 text-lg font-bold text-[#ff6347]">
                  Failed to Load Inventories
                </h3>
                <p className="text-sm text-[var(--botw-pale)]">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-8">
          <Tabs
            tabs={[
              { value: "all-items", label: "All Items", icon: "fa-boxes" },
              { value: "crafters-guide", label: "Crafters Guide", icon: "fa-hammer" },
              { value: "transactions", label: "All Transactions", icon: "fa-history" },
              { value: "transfer", label: "Transfer Items", icon: "fa-exchange-alt" },
              { value: "equip", label: "Equip Gear", icon: "fa-shield-alt" },
              { value: "stats", label: "Stats", icon: "fa-chart-bar" },
            ]}
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab as typeof activeTab)}
          />
        </div>

        {/* Tab Content */}
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-6 shadow-lg">
          {activeTab === "all-items" && (
            <div className="space-y-6">
              {/* Filter Bar */}
              <SearchFilterBar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search items by name, category, type, or character..."
                filterGroups={filterGroups}
                onFilterChange={handleFilterChange}
                onClearAll={clearAllFilters}
              />

              <div className="rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/80 overflow-hidden shadow-inner">
            {loadingAggregated ? (
              <div className="p-12 text-center">
                <Loading message="Loading items..." variant="inline" size="lg" />
              </div>
            ) : aggregatedError ? (
              <div className="p-12 text-center">
                <div className="mb-4 inline-flex items-center justify-center rounded-full bg-[#ff6347]/20 p-4">
                  <i className="fa-solid fa-exclamation-triangle text-4xl text-[#ff6347]" />
                </div>
                <h3 className="mb-2 text-xl font-bold text-[#ff6347]">
                  Failed to Load Items
                </h3>
                <p className="text-base text-[var(--botw-pale)] opacity-80 mb-4">
                  {aggregatedError}
                </p>
                <button
                  onClick={() => {
                    setAggregatedError(null);
                    const fetchAggregated = async () => {
                      try {
                        setLoadingAggregated(true);
                        setAggregatedError(null);
                        const res = await fetch("/api/inventories/aggregated");
                        if (!res.ok) {
                          const errorData = await res.json().catch(() => ({}));
                          const errorMessage = errorData.details || errorData.error || "Failed to fetch aggregated inventory";
                          throw new Error(errorMessage);
                        }
                        const data = await res.json();
                        setAggregatedItems(data.data || []);
                      } catch (e: unknown) {
                        const error = e instanceof Error ? e : new Error(String(e));
                        setAggregatedError(error.message);
                        console.error("[inventories/page.tsx]❌ Failed to load aggregated inventory:", error);
                      } finally {
                        setLoadingAggregated(false);
                      }
                    };
                    fetchAggregated();
                  }}
                  className="rounded-md bg-[#ff6347] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#ff6347]/80"
                >
                  Retry
                </button>
              </div>
            ) : aggregatedItems.length === 0 ? (
              <div className="p-12 text-center">
                <div className="mb-4 inline-flex items-center justify-center rounded-full bg-[var(--totk-brown)]/30 p-4">
                  <i className="fa-solid fa-box-open text-4xl text-[var(--totk-grey-200)]" />
                </div>
                <h3 className="mb-2 text-xl font-bold text-[var(--totk-light-ocher)]">
                  No Items Found
                </h3>
                <p className="text-base text-[var(--botw-pale)] opacity-60 italic">
                  No items found across your characters.
                </p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-12 text-center">
                <div className="mb-4 inline-flex items-center justify-center rounded-full bg-[var(--totk-brown)]/30 p-4">
                  <i className="fa-solid fa-filter text-4xl text-[var(--totk-grey-200)]" />
                </div>
                <h3 className="mb-2 text-xl font-bold text-[var(--totk-light-ocher)]">
                  No Items Match Filters
                </h3>
                <p className="text-base text-[var(--botw-pale)] opacity-60 italic">
                  Try adjusting your search or filter criteria.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b-2 border-[var(--totk-dark-ocher)] bg-gradient-to-r from-[var(--totk-brown)]/40 to-[var(--totk-dark-ocher)]/20">
                      <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                        Item
                      </th>
                      <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                        Total
                      </th>
                      <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                        Characters
                      </th>
                      <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                        Category
                      </th>
                      <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                        Type
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, index) => (
                      <tr
                        key={item.itemName}
                        className={`border-b border-[var(--totk-dark-ocher)]/20 last:border-0 transition-all ${
                          index % 2 === 0
                            ? "bg-[var(--botw-warm-black)]/30"
                            : "bg-[var(--totk-brown)]/10"
                        } hover:bg-[var(--totk-brown)]/20 hover:shadow-[0_0_8px_rgba(73,213,156,0.1)]`}
                      >
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            {item.image && (
                              <img
                                src={item.image}
                                alt={item.itemName}
                                className="h-8 w-8 object-contain flex-shrink-0"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            )}
                            <span className="font-semibold text-[var(--totk-light-green)]">
                              {item.itemName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="inline-flex items-center justify-center rounded-md bg-[var(--botw-blue)]/20 border border-[var(--botw-blue)]/30 px-2.5 py-1 font-bold text-[var(--botw-blue)] min-w-[3rem]">
                            {item.total}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                              {item.characters.length} holder{item.characters.length !== 1 ? "s" : ""}
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {item.characters.map((char, charIndex) => (
                                <div
                                  key={`${item.itemName}-${char.characterName}-${charIndex}`}
                                  className="flex items-center gap-1.5 rounded-md border border-[var(--totk-dark-ocher)]/40 bg-gradient-to-br from-[var(--botw-warm-black)]/80 to-[var(--totk-brown)]/40 px-2 py-1 shadow-sm hover:border-[var(--totk-light-green)]/40 transition-colors"
                                >
                                  <Link
                                    href={`/characters/inventories/${createSlug(char.characterName)}`}
                                    className="text-sm font-medium text-[var(--totk-light-green)] hover:underline"
                                  >
                                    {char.characterName}
                                  </Link>
                                  <span className="text-xs font-bold text-[var(--botw-blue)] bg-[var(--botw-blue)]/20 rounded px-1.5 py-0.5">
                                    {char.quantity}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {item.category.slice(0, 2).map((cat, catIndex) => (
                              <span
                                key={`${item.itemName}-category-${catIndex}`}
                                className="rounded-md border border-[var(--totk-light-ocher)]/40 bg-gradient-to-br from-[var(--totk-light-ocher)]/30 to-[var(--totk-light-ocher)]/15 px-2 py-1 text-xs font-semibold text-[var(--totk-light-ocher)] shadow-sm"
                              >
                                {cat}
                              </span>
                            ))}
                            {item.category.length > 2 && (
                              <span className="inline-flex items-center rounded-md border border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/50 px-2 py-1 text-xs font-medium text-[var(--totk-grey-200)]">
                                +{item.category.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-1.5">
                            {item.type.slice(0, 2).map((t, typeIndex) => (
                              <span
                                key={`${item.itemName}-type-${typeIndex}`}
                                className="rounded-md border border-[var(--botw-blue)]/40 bg-gradient-to-br from-[var(--botw-blue)]/30 to-[var(--botw-blue)]/15 px-2 py-1 text-xs font-semibold text-[var(--botw-blue)] shadow-sm"
                              >
                                {t}
                              </span>
                            ))}
                            {item.type.length > 2 && (
                              <span className="inline-flex items-center rounded-md border border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/50 px-2 py-1 text-xs font-medium text-[var(--totk-grey-200)]">
                                +{item.type.length - 2}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
              </div>
            </div>
          )}

          {activeTab === "transfer" && (
            <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-8 shadow-lg">
              <div className="mb-8 flex items-center gap-4 border-b-2 border-[var(--totk-dark-ocher)]/30 pb-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--totk-light-green)]/20 to-[var(--totk-green)]/10 border border-[var(--totk-light-green)]/30">
                  <i className="fa-solid fa-exchange-alt text-2xl text-[var(--totk-light-green)]" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-[var(--totk-light-green)]">
                    Transfer Items Between Characters
                  </h2>
                  <p className="mt-1 text-sm text-[var(--totk-grey-200)]">
                    Move items from one character to another
                  </p>
                </div>
              </div>

              {transferError && (
                <div className="mb-6 rounded-lg border-2 border-[#ff6347] bg-gradient-to-br from-[var(--botw-warm-black)]/95 to-[#ff6347]/10 p-4 shadow-md">
                  <div className="flex items-start gap-3">
                    <i className="fa-solid fa-exclamation-triangle text-xl text-[#ff6347] flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-[#ff6347]">{transferError}</p>
                  </div>
                </div>
              )}

              {transferSuccess && (
                <div className="mb-6 rounded-lg border-2 border-[var(--totk-light-green)] bg-gradient-to-br from-[var(--botw-warm-black)]/95 to-[var(--totk-light-green)]/10 p-4 shadow-md">
                  <div className="flex items-start gap-3">
                    <i className="fa-solid fa-check-circle text-xl text-[var(--totk-light-green)] flex-shrink-0 mt-0.5" />
                    <p className="text-sm font-medium text-[var(--totk-light-green)]">{transferSuccess}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleTransfer} className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Source Character */}
                  <div className="flex flex-col">
                    <label htmlFor="transfer-source" className="mb-2.5 block text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                      <i className="fa-solid fa-user-minus mr-2 text-xs" />
                      From Character
                    </label>
                    <div className="relative">
                      <select
                        id="transfer-source"
                        value={transferSource}
                        onChange={(e) => {
                          setTransferSource(e.target.value);
                          setTransferItem("");
                          setTransferQuantity(1);
                        }}
                        className="h-12 w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] pl-4 pr-12 py-2.5 text-base text-[var(--botw-pale)] transition-all focus:border-[var(--totk-light-green)] focus:bg-[var(--botw-warm-black)]/90 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/20 appearance-none"
                        style={{
                          backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2349d59c' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "right 0.75rem center",
                          backgroundSize: "1.25rem 1.25rem"
                        }}
                        required
                      >
                        <option value="">Select source character</option>
                        {summaries.map((summary) => (
                          <option key={summary.characterId} value={summary.characterName}>
                            {summary.characterName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Destination Character */}
                  <div className="flex flex-col">
                    <label htmlFor="transfer-destination" className="mb-2.5 block text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                      <i className="fa-solid fa-user-plus mr-2 text-xs" />
                      To Character
                    </label>
                    <div className="relative">
                      <select
                        id="transfer-destination"
                        value={transferDestination}
                        onChange={(e) => setTransferDestination(e.target.value)}
                        className="h-12 w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] pl-4 pr-12 py-2.5 text-base text-[var(--botw-pale)] transition-all focus:border-[var(--totk-light-green)] focus:bg-[var(--botw-warm-black)]/90 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/20 appearance-none"
                        style={{
                          backgroundImage: "url(\"data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2349d59c' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "right 0.75rem center",
                          backgroundSize: "1.25rem 1.25rem"
                        }}
                        required
                      >
                        <option value="">Select destination character</option>
                        {summaries
                          .filter((summary) => summary.characterName !== transferSource)
                          .map((summary) => (
                            <option key={summary.characterId} value={summary.characterName}>
                              {summary.characterName}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Item Selection */}
                <div className="flex flex-col">
                  <label htmlFor="transfer-item" className="mb-2.5 block text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                    <i className="fa-solid fa-box mr-2 text-xs" />
                    Item
                  </label>
                  {loadingSourceItems ? (
                    <div className="flex h-12 items-center gap-3 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-4">
                      <i className="fa-solid fa-spinner fa-spin text-[var(--totk-light-green)]" />
                      <span className="text-sm text-[var(--totk-grey-200)]">Loading items...</span>
                    </div>
                  ) : sourceItems.length === 0 && transferSource ? (
                    <div className="flex h-12 items-center rounded-lg border-2 border-dashed border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/50 px-4">
                      <p className="text-sm text-[var(--totk-grey-200)] italic">
                        No items available for this character
                      </p>
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        id="transfer-item"
                        value={transferItem}
                        onChange={(e) => {
                          setTransferItem(e.target.value);
                          const selected = sourceItems.find((item) => item.itemName === e.target.value);
                          if (selected) {
                            setTransferQuantity(Math.min(transferQuantity, selected.quantity));
                          }
                        }}
                        className="h-12 w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] pl-4 pr-12 py-2.5 text-base text-[var(--botw-pale)] transition-all focus:border-[var(--totk-light-green)] focus:bg-[var(--botw-warm-black)]/90 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/20 disabled:opacity-50 disabled:cursor-not-allowed appearance-none"
                        style={{
                          backgroundImage: !transferSource || sourceItems.length === 0 
                            ? "url(\"data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")"
                            : "url(\"data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2349d59c' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "right 0.75rem center",
                          backgroundSize: "1.25rem 1.25rem"
                        }}
                        required
                        disabled={!transferSource || sourceItems.length === 0}
                      >
                        <option value="">Select item</option>
                        {sourceItems.map((item, itemIndex) => (
                          <option key={`${transferSource}-${item.itemName}-${itemIndex}`} value={item.itemName}>
                            {item.itemName} (Available: {item.quantity})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Quantity */}
                <div className="flex flex-col">
                  <label htmlFor="transfer-quantity" className="mb-2.5 block text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                    <i className="fa-solid fa-hashtag mr-2 text-xs" />
                    Quantity
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      id="transfer-quantity"
                      min="1"
                      max={transferItem ? sourceItems.find((item) => item.itemName === transferItem)?.quantity || 1 : undefined}
                      value={transferQuantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val > 0) {
                          const maxQty = transferItem
                            ? sourceItems.find((item) => item.itemName === transferItem)?.quantity || 1
                            : 1;
                          setTransferQuantity(Math.min(val, maxQty));
                        }
                      }}
                      className="h-12 w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-4 py-2.5 text-base text-[var(--botw-pale)] transition-all focus:border-[var(--totk-light-green)] focus:bg-[var(--botw-warm-black)]/90 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                      required
                      disabled={!transferItem}
                    />
                  </div>
                  {transferItem && (
                    <p className="mt-2 flex items-center gap-2 text-xs text-[var(--totk-grey-200)]">
                      <i className="fa-solid fa-info-circle text-xs" />
                      Maximum available: <span className="font-bold text-[var(--botw-blue)]">{sourceItems.find((item) => item.itemName === transferItem)?.quantity || 0}</span>
                    </p>
                  )}
                </div>

                {/* Submit Button */}
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={transferring || !transferSource || !transferDestination || !transferItem || !transferQuantity}
                    className="w-full rounded-lg bg-gradient-to-r from-[var(--totk-light-green)] to-[var(--totk-green)] px-6 py-4 text-base font-bold text-[var(--botw-warm-black)] shadow-lg transition-all hover:from-[var(--totk-light-green)]/90 hover:to-[var(--totk-green)]/90 hover:shadow-[0_0_16px_rgba(73,213,156,0.6)] hover:scale-[1.02] active:scale-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 border-2 border-[var(--totk-light-green)]/30"
                  >
                    {transferring ? (
                      <span className="flex items-center justify-center gap-3">
                        <i className="fa-solid fa-spinner fa-spin" />
                        Transferring...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-3">
                        <i className="fa-solid fa-exchange-alt" />
                        Transfer Items
                      </span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === "equip" && (
            <div className="space-y-6">
              {/* Coming Soon Message */}
              <div className="rounded-lg border-2 border-dashed border-[var(--totk-dark-ocher)]/50 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-16 text-center shadow-lg">
                <div className="mb-6 inline-flex items-center justify-center rounded-full bg-[var(--totk-brown)]/30 p-6">
                  <i className="fa-solid fa-shield-alt text-5xl text-[var(--totk-light-green)]" />
                </div>
                <h2 className="mb-4 text-3xl font-bold text-[var(--totk-light-green)]">
                  Coming Soon
                </h2>
                <p className="mx-auto max-w-md text-lg text-[var(--botw-pale)] opacity-80">
                  The Equip Gear feature is currently under development and testing. Check back soon!
                </p>
              </div>
            </div>
          )}

          {activeTab === "transactions" && (
            <div className="space-y-6">
              {/* Filters */}
              <SearchFilterBar
                searchValue={transactionsSearch}
                onSearchChange={setTransactionsSearch}
                searchPlaceholder="Search transactions by item name or character..."
                filterGroups={transactionsFilterGroups}
                onFilterChange={handleTransactionsFilterChange}
                onClearAll={clearTransactionsFilters}
              />

              {/* Transactions Table */}
              {loadingTransactions ? (
                <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 p-12 text-center">
                  <Loading message="Loading transactions..." variant="inline" size="lg" />
                </div>
              ) : transactionsError ? (
                <div className="rounded-lg border-2 border-[#ff6347] bg-[var(--botw-warm-black)]/90 p-6 shadow-lg">
                  <div className="flex items-start gap-4">
                    <i className="fa-solid fa-exclamation-triangle text-2xl text-[#ff6347]" />
                    <div className="flex-1">
                      <h3 className="mb-2 text-lg font-bold text-[#ff6347]">
                        Failed to Load Transactions
                      </h3>
                      <p className="text-sm text-[var(--botw-pale)]">{transactionsError}</p>
                    </div>
                  </div>
                </div>
              ) : filteredTransactions.length === 0 ? (
                <div className="rounded-lg border-2 border-dashed border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/50 p-12 text-center">
                  <div className="mb-4 inline-flex items-center justify-center rounded-full bg-[var(--totk-brown)]/30 p-4">
                    <i className="fa-solid fa-history text-4xl text-[var(--totk-grey-200)]" />
                  </div>
                  <h3 className="mb-2 text-xl font-bold text-[var(--totk-light-ocher)]">
                    No Transactions Found
                  </h3>
                  <p className="text-base text-[var(--botw-pale)] opacity-60 italic">
                    {transactionsSearch || transactionsFilterGroups.some((g: FilterGroup) => g.options.some((o) => o.active))
                      ? "No transactions found matching your filters."
                      : "No transaction history available."}
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/80 overflow-hidden shadow-inner">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b-2 border-[var(--totk-dark-ocher)] bg-gradient-to-r from-[var(--totk-brown)]/40 to-[var(--totk-dark-ocher)]/20">
                          <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                            Date/Time
                          </th>
                          <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                            Character
                          </th>
                          <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                            Item
                          </th>
                          <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                            Quantity
                          </th>
                          <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                            Method
                          </th>
                          <th className="px-4 py-4 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                            Location
                          </th>
                          <th className="px-4 py-4 text-center text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                            Link
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTransactions.map((transaction, index) => {
                          const quantity = parseInt(String(transaction.quantity)) || 0;
                          const isPositive = quantity > 0;
                          const dateTime = new Date(transaction.dateTime);
                          const formattedDate = dateTime.toLocaleString("en-US", {
                            month: "2-digit",
                            day: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          });

                          return (
                            <tr
                              key={transaction._id}
                              className={`border-b border-[var(--totk-dark-ocher)]/20 last:border-0 transition-all ${
                                index % 2 === 0
                                  ? "bg-[var(--botw-warm-black)]/30"
                                  : "bg-[var(--totk-brown)]/10"
                              } hover:bg-[var(--totk-brown)]/20 hover:shadow-[0_0_8px_rgba(73,213,156,0.1)]`}
                            >
                              <td className="px-4 py-4 text-sm text-[var(--botw-pale)]">
                                {formattedDate}
                              </td>
                              <td className="px-4 py-4">
                                <Link
                                  href={`/characters/inventories/${createSlug(transaction.characterName)}`}
                                  className="font-semibold text-[var(--totk-light-green)] hover:text-[var(--botw-blue)] hover:underline transition-colors"
                                >
                                  {transaction.characterName}
                                </Link>
                              </td>
                              <td className="px-4 py-4">
                                <span className="font-semibold text-[var(--totk-light-green)]">
                                  {transaction.itemName}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <span
                                  className={`inline-flex items-center justify-center rounded-md px-2.5 py-1 font-bold min-w-[3rem] ${
                                    isPositive
                                      ? "bg-[var(--totk-light-green)]/20 border border-[var(--totk-light-green)]/30 text-[var(--totk-light-green)]"
                                      : "bg-[#ff6347]/20 border border-[#ff6347]/30 text-[#ff6347]"
                                  }`}
                                >
                                  {isPositive ? "+" : ""}
                                  {quantity}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-sm text-[var(--botw-pale)]">
                                {transaction.obtain || "-"}
                              </td>
                              <td className="px-4 py-4 text-sm text-[var(--botw-pale)]">
                                {transaction.location || (
                                  <span className="text-[var(--totk-grey-200)] italic">-</span>
                                )}
                              </td>
                              <td className="px-4 py-4 text-center">
                                {transaction.link ? (
                                  <a
                                    href={transaction.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[var(--botw-blue)] hover:text-[var(--totk-light-green)] transition-colors"
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
                </div>
              )}
            </div>
          )}

          {activeTab === "crafters-guide" && (
            <CraftersGuideTab />
          )}

          {activeTab === "stats" && (
            <div className="space-y-6">
              {loadingAggregated ? (
                <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 p-12 text-center">
                  <Loading message="Loading statistics..." variant="inline" size="lg" />
                </div>
              ) : aggregatedError ? (
                <div className="rounded-lg border-2 border-[#ff6347] bg-[var(--botw-warm-black)]/90 p-6 shadow-lg">
                  <div className="flex items-start gap-4">
                    <i className="fa-solid fa-exclamation-triangle text-2xl text-[#ff6347]" />
                    <div className="flex-1">
                      <h3 className="mb-2 text-lg font-bold text-[#ff6347]">
                        Failed to Load Statistics
                      </h3>
                      <p className="text-sm text-[var(--botw-pale)]">{aggregatedError}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
              {/* Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-6 shadow-lg">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--totk-light-green)]/20 border border-[var(--totk-light-green)]/30">
                      <i className="fa-solid fa-users text-xl text-[var(--totk-light-green)]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                        Total Characters
                      </p>
                      <p className="text-2xl font-bold text-[var(--totk-light-green)]">
                        {summaries.length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-6 shadow-lg">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--botw-blue)]/20 border border-[var(--botw-blue)]/30">
                      <i className="fa-solid fa-boxes text-xl text-[var(--botw-blue)]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                        Unique Items
                      </p>
                      <p className="text-2xl font-bold text-[var(--botw-blue)]">
                        {aggregatedItems.length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-6 shadow-lg">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--totk-light-ocher)]/20 border border-[var(--totk-light-ocher)]/30">
                      <i className="fa-solid fa-cubes text-xl text-[var(--totk-light-ocher)]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                        Total Items
                      </p>
                      <p className="text-2xl font-bold text-[var(--totk-light-ocher)]">
                        {aggregatedItems.reduce((sum, item) => sum + item.total, 0)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-6 shadow-lg">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[var(--totk-green)]/20 border border-[var(--totk-green)]/30">
                      <i className="fa-solid fa-history text-xl text-[var(--totk-green)]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                        Transactions
                      </p>
                      <p className="text-2xl font-bold text-[var(--totk-green)]">
                        {allTransactions.length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts Grid */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Items by Character Chart */}
                <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-6 shadow-lg">
                  <h3 className="mb-4 text-lg font-bold text-[var(--totk-light-green)] flex items-center gap-2">
                    <i className="fa-solid fa-chart-bar" />
                    Items by Character
                  </h3>
                  {summaries.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={summaries.map((s) => ({
                          name: s.characterName.length > 12 ? s.characterName.substring(0, 12) + "..." : s.characterName,
                          uniqueItems: s.uniqueItems,
                          totalItems: s.totalItems,
                        }))}
                        margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-dark-ocher)" opacity={0.3} />
                        <XAxis
                          dataKey="name"
                          stroke="var(--totk-grey-200)"
                          tick={{ fill: "var(--totk-grey-200)", fontSize: 12 }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis stroke="var(--totk-grey-200)" tick={{ fill: "var(--totk-grey-200)", fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--botw-warm-black)",
                            border: "1px solid var(--totk-dark-ocher)",
                            borderRadius: "8px",
                            color: "var(--botw-pale)",
                          }}
                          itemStyle={{ color: "var(--botw-pale)" }}
                          labelStyle={{ color: "var(--totk-light-green)" }}
                          cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                        />
                        <Legend wrapperStyle={{ color: "var(--botw-pale)" }} />
                        <Bar dataKey="uniqueItems" fill="var(--totk-light-green)" name="Unique Items" radius={[8, 8, 0, 0]}>
                          <LabelList dataKey="uniqueItems" position="top" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                        </Bar>
                        <Bar dataKey="totalItems" fill="var(--botw-blue)" name="Total Items" radius={[8, 8, 0, 0]}>
                          <LabelList dataKey="totalItems" position="top" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center">
                      <p className="text-sm text-[var(--totk-grey-200)] italic">No data available</p>
                    </div>
                  )}
                </div>

                {/* Items by Category Pie Chart */}
                <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-6 shadow-lg">
                  <h3 className="mb-4 text-lg font-bold text-[var(--totk-light-green)] flex items-center gap-2">
                    <i className="fa-solid fa-chart-pie" />
                    Items by Category
                  </h3>
                  {aggregatedItems.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={(() => {
                            const categoryMap = new Map<string, number>();
                            aggregatedItems.forEach((item) => {
                              item.category.forEach((cat) => {
                                categoryMap.set(cat, (categoryMap.get(cat) || 0) + item.total);
                              });
                            });
                            return Array.from(categoryMap.entries())
                              .map(([name, value]) => ({ name, value }))
                              .sort((a, b) => b.value - a.value)
                              .slice(0, 8);
                          })()}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="var(--botw-blue)"
                          dataKey="value"
                        >
                          {[
                            "var(--totk-light-green)",
                            "var(--botw-blue)",
                            "var(--totk-light-ocher)",
                            "var(--totk-green)",
                            "var(--totk-dark-ocher)",
                            "var(--botw-dark-blue)",
                            "var(--botw-beige)",
                            "var(--totk-grey-200)",
                          ].map((color, index) => (
                            <Cell key={`cell-${index}`} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--botw-warm-black)",
                            border: "1px solid var(--totk-dark-ocher)",
                            borderRadius: "8px",
                            color: "var(--botw-pale)",
                          }}
                          itemStyle={{ color: "var(--botw-pale)" }}
                          labelStyle={{ color: "var(--totk-light-green)" }}
                          cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center">
                      <p className="text-sm text-[var(--totk-grey-200)] italic">No data available</p>
                    </div>
                  )}
                </div>

                {/* Top Items by Quantity */}
                <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-6 shadow-lg">
                  <h3 className="mb-4 text-lg font-bold text-[var(--totk-light-green)] flex items-center gap-2">
                    <i className="fa-solid fa-trophy" />
                    Top Items by Quantity
                  </h3>
                  {aggregatedItems.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={aggregatedItems
                          .sort((a, b) => b.total - a.total)
                          .slice(0, 10)
                          .map((item) => ({
                            name: item.itemName.length > 15 ? item.itemName.substring(0, 15) + "..." : item.itemName,
                            quantity: item.total,
                          }))}
                        layout="vertical"
                        margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-dark-ocher)" opacity={0.3} />
                        <XAxis type="number" stroke="var(--totk-grey-200)" tick={{ fill: "var(--totk-grey-200)", fontSize: 12 }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          stroke="var(--totk-grey-200)"
                          tick={{ fill: "var(--totk-grey-200)", fontSize: 11 }}
                          width={120}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--botw-warm-black)",
                            border: "1px solid var(--totk-dark-ocher)",
                            borderRadius: "8px",
                            color: "var(--botw-pale)",
                          }}
                          itemStyle={{ color: "var(--botw-pale)" }}
                          labelStyle={{ color: "var(--totk-light-green)" }}
                          cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                        />
                        <Bar dataKey="quantity" fill="var(--totk-light-green)" radius={[0, 8, 8, 0]}>
                          <LabelList dataKey="quantity" position="right" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center">
                      <p className="text-sm text-[var(--totk-grey-200)] italic">No data available</p>
                    </div>
                  )}
                </div>

                {/* Transaction Trends Over Time */}
                <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-6 shadow-lg">
                  <h3 className="mb-4 text-lg font-bold text-[var(--totk-light-green)] flex items-center gap-2">
                    <i className="fa-solid fa-chart-line" />
                    Transaction Trends (Last 30 Days)
                  </h3>
                  {allTransactions.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart
                        data={(() => {
                          const now = new Date();
                          const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                          const recentTransactions = allTransactions.filter(
                            (t) => new Date(t.dateTime) >= thirtyDaysAgo
                          );

                          const dayMap = new Map<string, { gains: number; losses: number }>();
                          recentTransactions.forEach((t) => {
                            const date = new Date(t.dateTime).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            });
                            const quantity = parseInt(String(t.quantity)) || 0;
                            if (!dayMap.has(date)) {
                              dayMap.set(date, { gains: 0, losses: 0 });
                            }
                            const dayData = dayMap.get(date)!;
                            if (quantity > 0) {
                              dayData.gains += quantity;
                            } else {
                              dayData.losses += Math.abs(quantity);
                            }
                          });

                          return Array.from(dayMap.entries())
                            .map(([date, data]) => ({ date, ...data }))
                            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                        })()}
                        margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-dark-ocher)" opacity={0.3} />
                        <XAxis
                          dataKey="date"
                          stroke="var(--totk-grey-200)"
                          tick={{ fill: "var(--totk-grey-200)", fontSize: 11 }}
                          angle={-45}
                          textAnchor="end"
                          height={80}
                        />
                        <YAxis stroke="var(--totk-grey-200)" tick={{ fill: "var(--totk-grey-200)", fontSize: 12 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--botw-warm-black)",
                            border: "1px solid var(--totk-dark-ocher)",
                            borderRadius: "8px",
                            color: "var(--botw-pale)",
                          }}
                          itemStyle={{ color: "var(--botw-pale)" }}
                          labelStyle={{ color: "var(--totk-light-green)" }}
                          cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                        />
                        <Legend wrapperStyle={{ color: "var(--botw-pale)" }} />
                        <Line
                          type="monotone"
                          dataKey="gains"
                          stroke="var(--totk-light-green)"
                          strokeWidth={2}
                          name="Items Gained"
                          dot={{ fill: "var(--totk-light-green)", r: 3 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="losses"
                          stroke="#ff6347"
                          strokeWidth={2}
                          name="Items Lost"
                          dot={{ fill: "#ff6347", r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex h-[300px] items-center justify-center">
                      <p className="text-sm text-[var(--totk-grey-200)] italic">No transaction data available</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Additional Stats Table */}
              <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-6 shadow-lg">
                <h3 className="mb-4 text-lg font-bold text-[var(--totk-light-green)] flex items-center gap-2">
                  <i className="fa-solid fa-table" />
                  Detailed Statistics
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b-2 border-[var(--totk-dark-ocher)] bg-gradient-to-r from-[var(--totk-brown)]/40 to-[var(--totk-dark-ocher)]/20">
                        <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                          Statistic
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[var(--totk-dark-ocher)]/20 bg-[var(--botw-warm-black)]/30">
                        <td className="px-4 py-3 text-sm text-[var(--botw-pale)]">Average Items per Character</td>
                        <td className="px-4 py-3 text-sm font-semibold text-[var(--totk-light-green)]">
                          {summaries.length > 0
                            ? Math.round(
                                summaries.reduce((sum, s) => sum + s.totalItems, 0) / summaries.length
                              )
                            : 0}
                        </td>
                      </tr>
                      <tr className="border-b border-[var(--totk-dark-ocher)]/20 bg-[var(--totk-brown)]/10">
                        <td className="px-4 py-3 text-sm text-[var(--botw-pale)]">Average Unique Items per Character</td>
                        <td className="px-4 py-3 text-sm font-semibold text-[var(--totk-light-green)]">
                          {summaries.length > 0
                            ? Math.round(
                                summaries.reduce((sum, s) => sum + s.uniqueItems, 0) / summaries.length
                              )
                            : 0}
                        </td>
                      </tr>
                      <tr className="border-b border-[var(--totk-dark-ocher)]/20 bg-[var(--botw-warm-black)]/30">
                        <td className="px-4 py-3 text-sm text-[var(--botw-pale)]">Most Common Category</td>
                        <td className="px-4 py-3 text-sm font-semibold text-[var(--totk-light-green)]">
                          {(() => {
                            const categoryMap = new Map<string, number>();
                            aggregatedItems.forEach((item) => {
                              item.category.forEach((cat) => {
                                categoryMap.set(cat, (categoryMap.get(cat) || 0) + item.total);
                              });
                            });
                            const sorted = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);
                            return sorted.length > 0 ? capitalize(sorted[0][0]) : "N/A";
                          })()}
                        </td>
                      </tr>
                      <tr className="border-b border-[var(--totk-dark-ocher)]/20 bg-[var(--totk-brown)]/10">
                        <td className="px-4 py-3 text-sm text-[var(--botw-pale)]">Most Common Type</td>
                        <td className="px-4 py-3 text-sm font-semibold text-[var(--totk-light-green)]">
                          {(() => {
                            const typeMap = new Map<string, number>();
                            aggregatedItems.forEach((item) => {
                              item.type.forEach((t) => {
                                typeMap.set(t, (typeMap.get(t) || 0) + item.total);
                              });
                            });
                            const sorted = Array.from(typeMap.entries()).sort((a, b) => b[1] - a[1]);
                            return sorted.length > 0 ? capitalize(sorted[0][0]) : "N/A";
                          })()}
                        </td>
                      </tr>
                      <tr className="bg-[var(--botw-warm-black)]/30">
                        <td className="px-4 py-3 text-sm text-[var(--botw-pale)]">Items Shared Across Characters</td>
                        <td className="px-4 py-3 text-sm font-semibold text-[var(--totk-light-green)]">
                          {aggregatedItems.filter((item) => item.characters.length > 1).length}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InventoriesPage() {
  return (
    <Suspense fallback={
      <div className="min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[90rem]">
          <div className="flex items-center justify-center p-12">
            <Loading message="Loading..." variant="inline" size="lg" />
          </div>
        </div>
      </div>
    }>
      <InventoriesPageContent />
    </Suspense>
  );
}
