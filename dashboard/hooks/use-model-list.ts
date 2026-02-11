"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import type { FilterGroup, FilterOption } from "@/components/ui";
import type { PaginatedResponse } from "@/types/api";
import { capitalize } from "@/lib/string-utils";

const DEBOUNCE_MS = 300;
const DEFAULT_LIMIT = 12;
const DEFAULT_LIMIT_ITEMS = 48; // Higher default for items since there are 700+
const DEFAULT_LIMIT_VILLAGE_SHOPS = 36; // Default for village shops

export type ModelListResource =
  | "characters"
  | "items"
  | "monsters"
  | "pets"
  | "villages"
  | "village-shops";

export type FilterKeyConfig = Record<string, string>;

const FILTER_LABELS: Record<ModelListResource, FilterKeyConfig> = {
  characters: { race: "Race", village: "Village", job: "Job" },
  items: { 
    category: "Category", 
    type: "Type",
    categoryGear: "Gear Type",
    subtype: "Subtype",
    rarity: "Rarity",
    source: "Source",
    location: "Location",
    job: "Job",
    craftable: "Craftable",
    stackable: "Stackable",
    entertainerItems: "Entertainer item",
    divineItems: "Divine item",
  },
  monsters: { species: "Species", type: "Type", tier: "Tier" },
  pets: { status: "Status", species: "Species", petType: "Type" },
  villages: { region: "Region" },
  "village-shops": { category: "Category", type: "Type", rarity: "Rarity" },
};

function buildFilterGroups(
  filterOptions: Record<string, (string | number)[]> | undefined,
  filters: Record<string, (string | number | boolean)[]>,
  resource: ModelListResource,
  sortBy?: string,
  itemsPerPage?: number
): FilterGroup[] {
  const groups: FilterGroup[] = [];
  const labels = FILTER_LABELS[resource];
  
  // Add Mod Characters filter for characters resource (before other filters)
  if (resource === "characters") {
    const modFilter = filters["isModCharacter"] ?? [];
    const isModActive = modFilter.some(v => v === true || v === "true");
    groups.push({
      id: "isModCharacter",
      label: "Type",
      type: "multiple" as const,
      options: [
        {
          id: "mod",
          label: "Mod OCs",
          value: true,
          active: isModActive,
        },
        {
          id: "regular",
          label: "Regular OCs",
          value: false,
          active: modFilter.some(v => v === false || v === "false"),
        },
      ],
    });
  }
  
  // Add regular filter groups with "All" option
  if (filterOptions && Object.keys(filterOptions).length > 0) {
    Object.entries(filterOptions).forEach(([key, values]) => {
      // Skip isModCharacter if it's in filterOptions (we handle it above)
      if (key === "isModCharacter") return;
      // Skip range filter keys (these are handled separately, not as filter groups)
      if (key === "levelMin" || key === "levelMax" || key === "rollsMin" || key === "rollsMax") return;
      
      const label = labels[key] ?? key;
      const selected = filters[key] ?? [];
      
      // Add "All" option for race, village, and job
      const options: FilterOption[] = [];
      if (key === "race" || key === "village" || key === "job") {
        const allActive = selected.length === 0;
        options.push({
          id: `all-${key}`,
          label: `All ${label}s`,
          value: `all-${key}`,
          active: allActive,
        });
      }
      
      // Add regular options
      values.forEach((v) => {
        const id = String(v);
        let labelVal: string;
        if (typeof v === "number" && (key === "rarity" || key === "tier")) {
          labelVal = key === "tier" ? `Tier ${v}` : `Rarity ${v}`;
        } else if (key === "isActive") {
          labelVal = String(v) === "true" ? "Active" : "Inactive";
        } else if (key === "craftable" || key === "stackable" || key === "entertainerItems" || key === "divineItems") {
          labelVal = String(v) === "true" ? "Yes" : "No";
        } else if (key === "race" || key === "village" || key === "job" || key === "source" || key === "location" || key === "status" || key === "species" || key === "petType") {
          labelVal = capitalize(String(v));
        } else {
          labelVal = String(v);
        }
        options.push({
          id,
          label: labelVal,
          value: v,
          active: selected.includes(v as string | number),
        });
      });
      
      groups.push({
        id: key,
        label,
        type: "multiple" as const,
        options,
      });
    });
  }
  
  // Add Sort By group (single select)
  if (resource === "characters") {
    groups.push({
      id: "sortBy",
      label: "Sort By",
      type: "single" as const,
      options: [
        {
          id: "name",
          label: "Name (A-Z)",
          value: "name",
          active: sortBy === "name" || !sortBy,
        },
        {
          id: "name-desc",
          label: "Name (Z-A)",
          value: "name-desc",
          active: sortBy === "name-desc",
        },
        {
          id: "hearts-desc",
          label: "Hearts (Most)",
          value: "hearts-desc",
          active: sortBy === "hearts-desc",
        },
        {
          id: "hearts",
          label: "Hearts (Least)",
          value: "hearts",
          active: sortBy === "hearts",
        },
        {
          id: "attack-desc",
          label: "Attack (Most)",
          value: "attack-desc",
          active: sortBy === "attack-desc",
        },
        {
          id: "attack",
          label: "Attack (Least)",
          value: "attack",
          active: sortBy === "attack",
        },
        {
          id: "defense-desc",
          label: "Defense (Most)",
          value: "defense-desc",
          active: sortBy === "defense-desc",
        },
        {
          id: "defense",
          label: "Defense (Least)",
          value: "defense",
          active: sortBy === "defense",
        },
        {
          id: "stamina-desc",
          label: "Stamina (Most)",
          value: "stamina-desc",
          active: sortBy === "stamina-desc",
        },
        {
          id: "stamina",
          label: "Stamina (Least)",
          value: "stamina",
          active: sortBy === "stamina",
        },
        {
          id: "age-desc",
          label: "Age (Most)",
          value: "age-desc",
          active: sortBy === "age-desc",
        },
        {
          id: "age",
          label: "Age (Least)",
          value: "age",
          active: sortBy === "age",
        },
      ],
    });
  } else if (resource === "items") {
    groups.push({
      id: "sortBy",
      label: "Sort By",
      type: "single" as const,
      options: [
        {
          id: "name",
          label: "Name (A-Z)",
          value: "name",
          active: sortBy === "name" || !sortBy,
        },
        {
          id: "name-desc",
          label: "Name (Z-A)",
          value: "name-desc",
          active: sortBy === "name-desc",
        },
        {
          id: "price-asc",
          label: "Price (Low to High)",
          value: "price-asc",
          active: sortBy === "price-asc",
        },
        {
          id: "price-desc",
          label: "Price (High to Low)",
          value: "price-desc",
          active: sortBy === "price-desc",
        },
        {
          id: "rarity-asc",
          label: "Rarity (Low to High)",
          value: "rarity-asc",
          active: sortBy === "rarity-asc",
        },
        {
          id: "rarity-desc",
          label: "Rarity (High to Low)",
          value: "rarity-desc",
          active: sortBy === "rarity-desc",
        },
      ],
    });
  } else if (resource === "pets") {
    groups.push({
      id: "sortBy",
      label: "Sort By",
      type: "single" as const,
      options: [
        {
          id: "name",
          label: "Name (A-Z)",
          value: "name",
          active: sortBy === "name" || !sortBy,
        },
        {
          id: "name-desc",
          label: "Name (Z-A)",
          value: "name-desc",
          active: sortBy === "name-desc",
        },
        {
          id: "level-asc",
          label: "Level (Low to High)",
          value: "level-asc",
          active: sortBy === "level-asc",
        },
        {
          id: "level-desc",
          label: "Level (High to Low)",
          value: "level-desc",
          active: sortBy === "level-desc",
        },
        {
          id: "rolls-asc",
          label: "Rolls Remaining (Low to High)",
          value: "rolls-asc",
          active: sortBy === "rolls-asc",
        },
        {
          id: "rolls-desc",
          label: "Rolls Remaining (High to Low)",
          value: "rolls-desc",
          active: sortBy === "rolls-desc",
        },
        {
          id: "status",
          label: "Status (A-Z)",
          value: "status",
          active: sortBy === "status",
        },
        {
          id: "status-desc",
          label: "Status (Z-A)",
          value: "status-desc",
          active: sortBy === "status-desc",
        },
      ],
    });
  } else if (resource === "village-shops") {
    groups.push({
      id: "sortBy",
      label: "Sort By",
      type: "single" as const,
      options: [
        {
          id: "name",
          label: "Name (A-Z)",
          value: "name",
          active: sortBy === "name" || !sortBy,
        },
        {
          id: "name-desc",
          label: "Name (Z-A)",
          value: "name-desc",
          active: sortBy === "name-desc",
        },
        {
          id: "price-asc",
          label: "Buy Price (Low to High)",
          value: "price-asc",
          active: sortBy === "price-asc",
        },
        {
          id: "price-desc",
          label: "Buy Price (High to Low)",
          value: "price-desc",
          active: sortBy === "price-desc",
        },
        {
          id: "rarity-asc",
          label: "Rarity (Low to High)",
          value: "rarity-asc",
          active: sortBy === "rarity-asc",
        },
        {
          id: "rarity-desc",
          label: "Rarity (High to Low)",
          value: "rarity-desc",
          active: sortBy === "rarity-desc",
        },
        {
          id: "stock-desc",
          label: "Stock (High to Low)",
          value: "stock-desc",
          active: sortBy === "stock-desc",
        },
        {
          id: "stock-asc",
          label: "Stock (Low to High)",
          value: "stock-asc",
          active: sortBy === "stock-asc",
        },
      ],
    });
  } else if (resource === "monsters") {
    groups.push({
      id: "sortBy",
      label: "Sort By",
      type: "single" as const,
      options: [
        {
          id: "name",
          label: "Name (A-Z)",
          value: "name",
          active: sortBy === "name" || !sortBy,
        },
        {
          id: "name-desc",
          label: "Name (Z-A)",
          value: "name-desc",
          active: sortBy === "name-desc",
        },
        {
          id: "tier-asc",
          label: "Tier (Low to High)",
          value: "tier-asc",
          active: sortBy === "tier-asc",
        },
        {
          id: "tier-desc",
          label: "Tier (High to Low)",
          value: "tier-desc",
          active: sortBy === "tier-desc",
        },
        {
          id: "species",
          label: "Species (A-Z)",
          value: "species",
          active: sortBy === "species",
        },
        {
          id: "species-desc",
          label: "Species (Z-A)",
          value: "species-desc",
          active: sortBy === "species-desc",
        },
        {
          id: "hearts-asc",
          label: "Hearts (Least to Most)",
          value: "hearts-asc",
          active: sortBy === "hearts-asc",
        },
        {
          id: "hearts-desc",
          label: "Hearts (Most to Least)",
          value: "hearts-desc",
          active: sortBy === "hearts-desc",
        },
        {
          id: "dmg-asc",
          label: "Damage (Least to Most)",
          value: "dmg-asc",
          active: sortBy === "dmg-asc",
        },
        {
          id: "dmg-desc",
          label: "Damage (Most to Least)",
          value: "dmg-desc",
          active: sortBy === "dmg-desc",
        },
      ],
    });
  }

  // Add Per Page group (single select)
  if (resource === "characters" || resource === "items" || resource === "village-shops" || resource === "monsters") {
    let perPageOptions: number[];
    if (resource === "items") {
      perPageOptions = [24, 48, 96, 192];
    } else if (resource === "village-shops") {
      // Options that work well with 4 columns: 36 (9 rows), 72 (18 rows), 108 (27 rows), 144 (36 rows)
      perPageOptions = [36, 72, 108, 144];
    } else if (resource === "monsters") {
      perPageOptions = [12, 24, 48, 96];
    } else {
      perPageOptions = [12, 24, 48, 96];
    }
    groups.push({
      id: "perPage",
      label: "Per Page",
      type: "single" as const,
      options: perPageOptions.map((val) => ({
        id: String(val),
        label: `${val} per page`,
        value: val,
        active: itemsPerPage === val,
      })),
    });
  }
  
  return groups;
}

function buildQueryParams(
  page: number,
  limit: number,
  search: string,
  filters: Record<string, (string | number | boolean)[]>,
  sortBy?: string
): string {
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("limit", String(limit));
  if (search.trim()) p.set("search", search.trim());
  if (sortBy) p.set("sortBy", sortBy);
  Object.entries(filters).forEach(([key, values]) => {
    if (values.length && key !== "sortBy" && key !== "perPage") {
      // Handle boolean values for isModCharacter, craftable, stackable
      // These are stored as strings "true"/"false" in filters
      if (key === "isModCharacter" || key === "craftable" || key === "stackable" || key === "entertainerItems" || key === "divineItems") {
        const boolValues = values.map(v => {
          if (typeof v === "boolean") {
            return String(v);
          }
          // Handle string "true"/"false" or number (shouldn't happen but be safe)
          return typeof v === "string" ? v : String(v);
        });
        // Send all values - API will handle if both true and false are present
        const uniqueValues = Array.from(new Set(boolValues));
        if (uniqueValues.length > 0) {
          p.set(key, uniqueValues.join(","));
        }
      } else if (key === "levelMin" || key === "levelMax" || key === "rollsMin" || key === "rollsMax") {
        // Handle range filter parameters - single value expected
        const value = values[0];
        if (value !== undefined && value !== null && value !== "") {
          p.set(key, String(value));
        }
      } else {
        p.set(key, values.map(String).join(","));
      }
    }
  });
  return p.toString();
}

export type UseModelListOptions = {
  apiPath?: string;
  /** Override default items-per-page (e.g. 100 for My OCs so all characters load without pagination). */
  defaultLimit?: number;
};

function getDefaultLimit(
  resource: ModelListResource,
  defaultLimit?: number
): number {
  if (defaultLimit != null && defaultLimit > 0) return defaultLimit;
  if (resource === "items") return DEFAULT_LIMIT_ITEMS;
  if (resource === "village-shops") return DEFAULT_LIMIT_VILLAGE_SHOPS;
  return DEFAULT_LIMIT;
}

export function useModelList<T>(
  resource: ModelListResource,
  options?: UseModelListOptions
) {
  const apiPath = options?.apiPath;
  const defaultLimit = options?.defaultLimit;
  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [filterOptions, setFilterOptions] = useState<Record<string, (string | number)[]>>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, (string | number | boolean)[]>>({});
  const [sortBy, setSortBy] = useState<string>("name");
  const [itemsPerPage, setItemsPerPage] = useState<number>(
    getDefaultLimit(resource, defaultLimit)
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
      timerRef.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [search]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);

    // Abort any in-flight request to prevent updates after unmount / stale responses.
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    try {
      const qs = buildQueryParams(currentPage, itemsPerPage, debouncedSearch, filters, sortBy);
      const base = apiPath ?? `/api/models/${resource}`;
      const url = `${base}?${qs}`;
      const res = await fetch(url, { signal });
      if (signal.aborted) return;
      if (!res.ok) {
        let errorMessage = `Request failed with status ${res.status}`;
        try {
          const body = await res.json();
          errorMessage = body?.error ?? body?.details ?? errorMessage;
        } catch {
          // If response is not JSON, use status text
          errorMessage = res.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      const json: PaginatedResponse<T> = await res.json();
      if (signal.aborted) return;
      setData(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
      if (json.filterOptions && Object.keys(json.filterOptions).length > 0) {
        setFilterOptions(json.filterOptions);
      }
    } catch (e) {
      // Ignore aborted requests - they're expected when navigating away or refetching
      if (signal.aborted) return;
      // Ignore DOMException with name "AbortError" - this is the standard abort error
      if (e instanceof Error && e.name === "AbortError") return;
      // Ignore errors that mention "aborted" or "signal"
      if (e instanceof Error && (e.message.toLowerCase().includes("aborted") || e.message.toLowerCase().includes("signal"))) return;
      
      const errorMessage = e instanceof Error ? e.message : String(e);
      // Provide more context for network errors
      if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
        setError(`Failed to fetch characters. Please check your connection and try again.`);
      } else {
        setError(errorMessage);
      }
      console.error("Failed to fetch list:", e);
      setData([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [resource, apiPath, currentPage, itemsPerPage, debouncedSearch, filters, sortBy]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const filterGroups = useMemo(
    () => buildFilterGroups(filterOptions, filters, resource, sortBy, itemsPerPage),
    [filterOptions, filters, resource, sortBy, itemsPerPage]
  );

  const handleFilterChange = useCallback((groupId: string, optionId: string, active: boolean) => {
    setCurrentPage(1);
    
    // Handle sortBy
    if (groupId === "sortBy") {
      if (active) {
        setSortBy(optionId);
      }
      return;
    }
    
    // Handle perPage
    if (groupId === "perPage") {
      if (active) {
        const newLimit = parseInt(optionId, 10);
        if (!Number.isNaN(newLimit)) {
          setItemsPerPage(newLimit);
        }
      }
      return;
    }
    
    // Handle "All" options for race, village, job
    if (optionId.startsWith("all-")) {
      setFilters((prev) => {
        const nextFilters = { ...prev };
        delete nextFilters[groupId];
        return nextFilters;
      });
      return;
    }
    
    // Handle isModCharacter filter (boolean)
    if (groupId === "isModCharacter") {
      setFilters((prev) => {
        const current = prev[groupId] ?? [];
        const boolValue = optionId === "mod" ? true : false;
        let next: (string | number | boolean)[];
        if (active) {
          // Add the value if not already present
          const v = boolValue;
          next = current.some(val => val === v) ? current : [...current, v];
        } else {
          // Remove the value
          next = current.filter((v) => v !== boolValue);
        }
        const nextFilters = { ...prev };
        if (next.length) nextFilters[groupId] = next;
        else delete nextFilters[groupId];
        return nextFilters;
      });
      return;
    }
    
    // Handle regular filters
    setFilters((prev) => {
      const opts = filterOptions?.[groupId] ?? [];
      const opt = opts.find((v) => String(v) === optionId);
      let value: string | number | boolean = opt ?? (groupId === "rarity" || groupId === "tier" ? parseInt(optionId, 10) : optionId);
      
      // Handle boolean filters (craftable, stackable, entertainerItems, divineItems) - store as strings for API compatibility
      if (groupId === "craftable" || groupId === "stackable" || groupId === "entertainerItems" || groupId === "divineItems") {
        value = optionId; // Keep as string "true" or "false"
      }
      
      const current = prev[groupId] ?? [];
      let next: (string | number | boolean)[];
      if (active) {
        const v = typeof value === "number" && Number.isNaN(value) ? optionId : value;
        next = current.some(val => val === v || String(val) === String(v)) ? current : [...current, v as string | number | boolean];
      } else {
        next = current.filter((v) => v !== value && String(v) !== optionId && String(v) !== String(value));
      }
      const nextFilters = { ...prev };
      if (next.length) nextFilters[groupId] = next;
      else delete nextFilters[groupId];
      return nextFilters;
    });
  }, [filterOptions]);

  const clearAll = useCallback(() => {
    setSearch("");
    setFilters({});
    setSortBy("name");
    setItemsPerPage(getDefaultLimit(resource, defaultLimit));
    setCurrentPage(1);
  }, [resource, defaultLimit]);

  return {
    data,
    total,
    totalPages,
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
    refetch: fetchList,
  };
}
