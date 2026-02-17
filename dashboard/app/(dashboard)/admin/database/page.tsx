"use client";

/* ============================================================================ */
/* ------------------- Admin Database Editor Page ------------------- */
/* User-friendly interface for admins to edit database items */
/* ============================================================================ */

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useSession } from "@/hooks/use-session";
import { Loading, Pagination } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { SearchFilterBar, type FilterGroup } from "@/components/ui/search-filter-bar";
import Link from "next/link";
import { DatabaseItemList } from "./DatabaseItemList";
import { ItemEditorForm } from "./ItemEditorForm";
import { GenericEditorForm } from "./components/GenericEditorForm";
import { ModelItemList } from "./components/ModelItemList";
import { MessageBanner } from "./components/MessageBanner";
import { ModelSelector } from "./components/ModelSelector";
import { FIELD_OPTIONS } from "./constants/field-options";
import { MODEL_CONFIGS, getModelConfig } from "./config/model-configs";
import { getItemId } from "./utils/id";
import { capitalize } from "@/lib/string-utils";

// ============================================================================
// ------------------- Types -------------------
// ============================================================================

type AvailableModel = {
  name: string;
  displayName: string;
  icon: string;
};

const AVAILABLE_MODELS: AvailableModel[] = Object.values(MODEL_CONFIGS).map((config) => ({
  name: config.name,
  displayName: config.displayName,
  icon: config.icon,
}));

type DatabaseRecord = Record<string, unknown> & {
  _id: string;
};

// ============================================================================
// ------------------- Main Page Component -------------------
// ============================================================================

export default function AdminDatabasePage() {
  const { user, isAdmin, loading: sessionLoading } = useSession();
  const [selectedModel, setSelectedModel] = useState<string>("Item");
  const [items, setItems] = useState<DatabaseRecord[]>([]);
  const [filteredItems, setFilteredItems] = useState<DatabaseRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<DatabaseRecord | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const modelConfig = useMemo(() => getModelConfig(selectedModel), [selectedModel]);
  const [fieldOptions, setFieldOptions] = useState<{
    category: string[];
    type: string[];
    categoryGear: string[];
    subtype: string[];
  }>(FIELD_OPTIONS);
  const [filterOptions, setFilterOptions] = useState<Record<string, (string | number)[]>>({});
  const [filters, setFilters] = useState<Record<string, (string | number | boolean)[]>>({});
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage] = useState<number>(50);
  const fetchAbortControllerRef = useRef<AbortController | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Tracks last model we fetched for; null = user has not clicked Load yet. Used to avoid fetch on mount and to refetch when model changes after first load. */
  const lastLoadedModelRef = useRef<string | null>(null);
  /** True after user has clicked Load at least once; used for empty-state message. */
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  /** When save fails, store payload so user can click Try again without re-editing. */
  const lastSavePayloadRef = useRef<{ itemId: string; updates: Record<string, unknown> } | null>(null);
  /** Character Inventories: list of characters (when no character selected). */
  const [inventoryCharacters, setInventoryCharacters] = useState<DatabaseRecord[]>([]);
  /** Character Inventories: selected character id; when set, items are that character's inventory. */
  const [inventoryCharacterId, setInventoryCharacterId] = useState<string | null>(null);

  // ------------------- Build Filter Groups -------------------
  const filterGroups = useMemo((): FilterGroup[] => {
    const groups: FilterGroup[] = [];
    
    if (!filterOptions || Object.keys(filterOptions).length === 0) {
      return groups;
    }

    Object.entries(filterOptions).forEach(([key, values]) => {
      const selected = filters[key] ?? [];
      
      const options = values.map((v) => {
        const id = String(v);
        let labelVal: string;
        if (typeof v === "number" && key === "rarity") {
          labelVal = `Rarity ${v}`;
        } else if (key === "craftable" || key === "stackable") {
          labelVal = String(v) === "true" ? "Yes" : "No";
        } else {
          labelVal = capitalize(String(v));
        }
        return {
          id,
          label: labelVal,
          value: v,
          active: selected.includes(v as string | number),
        };
      });
      
      const labelMap: Record<string, string> = {
        category: "Category",
        type: "Type",
        rarity: "Rarity",
        categoryGear: "Gear Type",
        subtype: "Subtype",
        source: "Source",
        location: "Location",
        job: "Job",
        craftable: "Craftable",
        stackable: "Stackable",
        characterId: "Character ID",
        region: "Region",
        species: "Species",
        petType: "Pet Type",
        status: "Status",
        tier: "Tier",
        village: "Village",
        race: "Race",
      };
      
      groups.push({
        id: key,
        label: labelMap[key] || capitalize(key),
        type: "multiple" as const,
        options,
      });
    });
    
    return groups;
  }, [filterOptions, filters]);

  // ------------------- Filter Items Based on Search and Filters -------------------
  useEffect(() => {
    let filtered = [...items];

    // Apply search filter
    if (searchQuery.trim() && modelConfig) {
      const query = searchQuery.toLowerCase().trim();
      const nameField = modelConfig.nameField;
      filtered = filtered.filter((item) => {
        const nameValue = item[nameField];
        const nameMatch = nameValue && String(nameValue).toLowerCase().includes(query);
        // For Items, also search category
        if (selectedModel === "Item") {
          const categoryMatch = Array.isArray(item.category) && item.category.some((cat: unknown) => 
            String(cat).toLowerCase().includes(query)
          );
          return nameMatch || categoryMatch;
        }
        return nameMatch;
      });
    }

    // Apply filters
    Object.entries(filters).forEach(([key, selectedValues]) => {
      if (selectedValues.length === 0) return;

      filtered = filtered.filter((item) => {
        if (key === "category") {
          const category = item.category;
          return Array.isArray(category) && category.some((cat: string) => selectedValues.includes(cat));
        }
        if (key === "type") {
          const type = item.type;
          return Array.isArray(type) && type.some((t: string) => selectedValues.includes(t));
        }
        if (key === "categoryGear") {
          const categoryGear = Array.isArray(item.categoryGear) ? item.categoryGear : item.categoryGear ? [item.categoryGear] : [];
          return categoryGear.length > 0 && selectedValues.some((v) => categoryGear.includes(v as string));
        }
        if (key === "subtype") {
          const subtype = item.subtype;
          return Array.isArray(subtype) && subtype.some((st: string) => selectedValues.includes(st));
        }
        if (key === "rarity") {
          const rarity = item.itemRarity;
          return rarity !== undefined && rarity !== null && selectedValues.includes(rarity as string | number | boolean);
        }
        if (key === "stackable") {
          const isStackable = item.stackable === true;
          return selectedValues.includes(isStackable ? "true" : "false");
        }
        if (key === "craftable") {
          const isCraftable = item.crafting === true;
          return selectedValues.includes(isCraftable ? "true" : "false");
        }
        if (key === "source") {
          const sources: Record<string, string> = {
            "Gathering": "gathering",
            "Looting": "looting",
            "Traveling": "traveling",
            "Exploring": "exploring",
            "Vending": "vending",
            "Crafting": "crafting",
            "Special Weather": "specialWeather",
            "Pet Perk": "petPerk",
          };
          return selectedValues.some((v) => {
            const field = sources[v as string];
            return field && item[field] === true;
          });
        }
        if (key === "location") {
          const locations: Record<string, string> = {
            "Central Hyrule": "centralHyrule",
            "Eldin": "eldin",
            "Faron": "faron",
            "Gerudo": "gerudo",
            "Hebra": "hebra",
            "Lanayru": "lanayru",
            "Path of Scarlet Leaves": "pathOfScarletLeaves",
            "Leaf Dew Way": "leafDewWay",
          };
          return selectedValues.some((v) => {
            const field = locations[v as string];
            return field && item[field] === true;
          });
        }
        if (key === "job") {
          const jobs: Record<string, string> = {
            "Farmer": "farmer",
            "Forager": "forager",
            "Rancher": "rancher",
            "Herbalist": "herbalist",
            "Adventurer": "adventurer",
            "Artist": "artist",
            "Beekeeper": "beekeeper",
            "Blacksmith": "blacksmith",
            "Cook": "cook",
            "Craftsman": "craftsman",
            "Fisherman": "fisherman",
            "Gravekeeper": "gravekeeper",
            "Guard": "guard",
            "Mask Maker": "maskMaker",
            "Hunter": "hunter",
            "Hunter (Looting)": "hunterLooting",
            "Mercenary": "mercenary",
            "Miner": "miner",
            "Researcher": "researcher",
            "Scout": "scout",
            "Weaver": "weaver",
            "Witch": "witch",
          };
          return selectedValues.some((v) => {
            const field = jobs[v as string];
            return field && item[field] === true;
          });
        }
        if (selectedModel === "Inventory") {
          if (key === "category") {
            const cat = item.category;
            return typeof cat === "string" && selectedValues.includes(cat);
          }
          if (key === "type") {
            const t = item.type;
            return typeof t === "string" && selectedValues.includes(t);
          }
          if (key === "characterId") {
            const id = item.characterId;
            return id != null && selectedValues.includes(String(id));
          }
        }
        return true;
      });
    });
    
    setFilteredItems(filtered);
    // Reset to first page when filters change
    setCurrentPage(1);
  }, [searchQuery, items, filters, selectedModel, modelConfig]);

  // ------------------- Paginate Filtered Items -------------------
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredItems.slice(startIndex, endIndex);
  }, [filteredItems, currentPage, itemsPerPage]);

  // ------------------- Inventory: filtered and paginated character list -------------------
  const isInventoryCharacterList = selectedModel === "Inventory" && !inventoryCharacterId;
  const filteredInventoryCharacters = useMemo(() => {
    if (!isInventoryCharacterList || !inventoryCharacters.length) return [];
    if (!searchQuery.trim()) return inventoryCharacters;
    const q = searchQuery.toLowerCase().trim();
    return inventoryCharacters.filter((c) => {
      const name = c.name;
      return name && String(name).toLowerCase().includes(q);
    });
  }, [isInventoryCharacterList, inventoryCharacters, searchQuery]);
  const paginatedInventoryCharacters = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredInventoryCharacters.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredInventoryCharacters, currentPage, itemsPerPage]);

  // ------------------- Scroll to Top Function -------------------
  const scrollToTop = useCallback(() => {
    const mainElement = document.querySelector('main');
    window.scrollTo({ top: 0, behavior: 'instant' });
    mainElement?.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTo({ top: 0, behavior: 'instant' });
    
    // Double-check after a brief delay
    setTimeout(() => {
      const mainEl = document.querySelector('main');
      if (window.scrollY > 0 || (mainEl?.scrollTop ?? 0) > 0) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        mainEl?.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTo({ top: 0, behavior: 'instant' });
      }
    }, 50);
  }, []);

  // ------------------- Scroll to Top When Page Changes -------------------
  useEffect(() => {
    scrollToTop();
  }, [currentPage, scrollToTop]);

  // ------------------- Handle Filter Change -------------------
  const handleFilterChange = useCallback((groupId: string, optionId: string, active: boolean) => {
    setFilters((prev) => {
      const groupFilters = prev[groupId] || [];
      const optionValue = filterOptions[groupId]?.find((v) => String(v) === optionId);
      
      if (!optionValue) return prev;
      
      let newFilters: (string | number | boolean)[];
      if (active) {
        newFilters = [...groupFilters, optionValue];
      } else {
        newFilters = groupFilters.filter((v) => v !== optionValue);
      }
      
      return {
        ...prev,
        [groupId]: newFilters,
      };
    });
  }, [filterOptions]);

  // ------------------- Clear All Filters -------------------
  const handleClearAll = useCallback(() => {
    setSearchQuery("");
    setFilters({});
  }, []);

  // ------------------- Fetch Items -------------------
  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      fetchAbortControllerRef.current?.abort();
      fetchAbortControllerRef.current = new AbortController();
      const signal = fetchAbortControllerRef.current.signal;

      const url =
        selectedModel === "Inventory" && inventoryCharacterId
          ? `/api/admin/database/items?model=Inventory&characterId=${encodeURIComponent(inventoryCharacterId)}`
          : `/api/admin/database/items?model=${selectedModel}`;
      const res = await fetch(url, { signal });
      if (signal.aborted) return;

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string; message?: string }).message ||
          (data as { error?: string }).error ||
          `Request failed: ${res.status}`
        );
      }

      const response = (await res.json()) as { 
        items?: DatabaseRecord[];
        characters?: DatabaseRecord[];
        filterOptions?: Record<string, (string | number)[]>;
      };
      if (signal.aborted) return;

      // Inventory without characterId returns characters list
      if (selectedModel === "Inventory" && response.characters) {
        setInventoryCharacters(response.characters);
        setItems(response.items ?? []);
      } else {
        if (!response.items && !response.characters) {
          throw new Error("No items found");
        }
        setItems(response.items ?? []);
      }
      
      // Use filterOptions from API if available
      if (response.filterOptions) {
        setFilterOptions(response.filterOptions);
        
        // Update fieldOptions for Item model only
        if (selectedModel === "Item") {
          setFieldOptions({
            category: (response.filterOptions.category || []) as string[],
            type: (response.filterOptions.type || []) as string[],
            categoryGear: (response.filterOptions.categoryGear || []) as string[],
            subtype: (response.filterOptions.subtype || []) as string[],
          });
        }
      }
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
  }, [selectedModel, inventoryCharacterId]);

  // ------------------- Save Item -------------------
  // JSON.stringify preserves all special characters (<, :, etc.) correctly
  // No data modification occurs during serialization - values are passed through as-is
  const handleSaveItem = useCallback(async (itemId: string, updates: Record<string, unknown>) => {
    if (!itemId || itemId === "[object Object]") {
      setError("Cannot save: missing or invalid item ID");
      return;
    }
    lastSavePayloadRef.current = { itemId, updates };
    setSavingItemId(itemId);
    try {
      const res = await fetch("/api/admin/database/items", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          updates,
          model: selectedModel,
          ...(selectedModel === "Inventory" && inventoryCharacterId ? { characterId: inventoryCharacterId } : {}),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        const message =
          res.status === 400 && (data.message === "No valid fields to update" || data.error === "No valid fields to update")
            ? "No changes were saved. Your edits may not be allowed for this field."
            : data.message || data.error || "Failed to save changes";
        throw new Error(message);
      }

      lastSavePayloadRef.current = null;
      const item = items.find((i) => getItemId(i._id) === itemId);
      const nameField = modelConfig?.nameField || "name";
      const itemName = item?.[nameField] || "item";
      setSuccessMessage(`✓ Successfully saved "${String(itemName)}"!`);
      setError(null);

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
  }, [items, fetchItems, selectedModel, modelConfig, inventoryCharacterId]);

  const handleRetrySave = useCallback(() => {
    const payload = lastSavePayloadRef.current;
    if (payload) handleSaveItem(payload.itemId, payload.updates);
  }, [handleSaveItem]);

  // ------------------- Delete Item (used for Inventory entries) -------------------
  const handleDeleteItem = useCallback(
    async (item: Record<string, unknown>) => {
      const itemId = getItemId(item._id);
      if (!itemId) return;
      const nameField = modelConfig?.nameField ?? "itemName";
      const itemName = String(item[nameField] || "this entry");
      if (!window.confirm(`Are you sure you want to delete "${itemName}"?`)) {
        return;
      }
      setDeletingItemId(itemId);
      setError(null);
      try {
        const res = await fetch("/api/admin/database/items", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            itemId,
            model: selectedModel,
            ...(selectedModel === "Inventory" && inventoryCharacterId ? { characterId: inventoryCharacterId } : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (!res.ok) {
          throw new Error(data.message || data.error || "Failed to delete");
        }
        setSuccessMessage("✓ Entry deleted.");
        if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
        successTimeoutRef.current = setTimeout(() => {
          setSuccessMessage(null);
          successTimeoutRef.current = null;
        }, 3000);
        await fetchItems();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDeletingItemId(null);
      }
    },
    [selectedModel, inventoryCharacterId, fetchItems, modelConfig]
  );

  // ------------------- Load button: trigger first fetch; effect refetches when model changes after first load -------------------
  const handleLoadClick = useCallback(() => {
    setHasLoadedOnce(true);
    lastLoadedModelRef.current = selectedModel;
    if (selectedModel === "Inventory") {
      setInventoryCharacterId(null);
    }
    fetchItems();
  }, [selectedModel, fetchItems]);

  // ------------------- When Inventory and a character is selected, fetch that character's inventory items -------------------
  useEffect(() => {
    if (selectedModel !== "Inventory" || !inventoryCharacterId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/database/items?model=Inventory&characterId=${encodeURIComponent(inventoryCharacterId)}`)
      .then((res) => {
        if (!res.ok) return res.json().then((d) => { throw new Error((d as { message?: string }).message || "Failed to load inventory"); });
        return res.json();
      })
      .then((data: { items?: DatabaseRecord[]; filterOptions?: Record<string, (string | number)[]> }) => {
        if (cancelled) return;
        setItems(data.items ?? []);
        if (data.filterOptions) setFilterOptions(data.filterOptions);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedModel, inventoryCharacterId]);

  // ------------------- Clear Inventory state when switching away from Inventory -------------------
  useEffect(() => {
    if (selectedModel !== "Inventory") {
      setInventoryCharacterId(null);
      setInventoryCharacters([]);
    }
  }, [selectedModel]);

  useEffect(() => {
    if (!isAdmin || sessionLoading) return;
    if (lastLoadedModelRef.current === null) return;
    if (lastLoadedModelRef.current === selectedModel) return;
    lastLoadedModelRef.current = selectedModel;
    fetchItems();
  }, [isAdmin, sessionLoading, selectedModel, fetchItems]);

  useEffect(() => {
    return () => {
      fetchAbortControllerRef.current?.abort();
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

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

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8 bg-[var(--totk-light-green)]/10">
      <div className="mx-auto max-w-[90rem]">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col items-center justify-center gap-4 mb-6">
            <div className="flex items-center gap-4 sm:gap-6">
              <img src="/Side=Left.svg" alt="" className="h-6 sm:h-8 w-auto opacity-80" />
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-[var(--totk-light-ocher)] tracking-tighter uppercase italic">
                Database Editor
              </h1>
              <img src="/Side=Right.svg" alt="" className="h-6 sm:h-8 w-auto opacity-80" />
            </div>
            <p className="text-sm sm:text-base text-[var(--totk-grey-200)] text-center">
              Manage and edit database items
            </p>
          </div>

          {/* Toolbar - Redesigned */}
          <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] p-5 sm:p-6 shadow-lg">
            <div className="flex flex-col gap-4">
              {/* Top Row - Model Selector, Load button, and Item Count */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-wrap">
                <ModelSelector
                  value={selectedModel}
                  options={AVAILABLE_MODELS}
                  onChange={setSelectedModel}
                />
                <button
                  type="button"
                  onClick={handleLoadClick}
                  disabled={loading}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--totk-mid-ocher)] hover:bg-[var(--totk-light-ocher)] hover:border-[var(--totk-light-ocher)] text-[var(--botw-pale)] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <i className="fa-solid fa-download" aria-hidden="true" />
                  Load {modelConfig?.displayName ?? selectedModel}
                </button>

                {/* Item Count Badge */}
                {(items.length > 0 || (selectedModel === "Inventory" && inventoryCharacters.length > 0)) && (
                  <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--totk-light-green)]/10 border border-[var(--totk-light-green)]/30">
                    <i className="fa-solid fa-database text-sm text-[var(--totk-light-green)]" aria-hidden="true" />
                    <span className="text-sm font-semibold text-[var(--totk-light-green)]">
                      {selectedModel === "Inventory" && !inventoryCharacterId ? (
                        filteredInventoryCharacters.length > 0
                          ? `Showing ${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, filteredInventoryCharacters.length)} of ${filteredInventoryCharacters.length} characters`
                          : "0 characters"
                      ) : filteredItems.length > 0 ? (
                        `${(currentPage - 1) * itemsPerPage + 1}-${Math.min(currentPage * itemsPerPage, filteredItems.length)} of ${filteredItems.length} ${filteredItems.length === 1 ? "item" : "items"}${filteredItems.length !== items.length ? ` (${items.length} total)` : ""}`
                      ) : (
                        "0"
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* Search and Filters */}
              {(items.length > 0 || (selectedModel === "Inventory" && inventoryCharacters.length > 0)) && (
                <SearchFilterBar
                  searchValue={searchQuery}
                  onSearchChange={setSearchQuery}
                  searchPlaceholder={
                    selectedModel === "Inventory" && !inventoryCharacterId
                      ? "Search characters by name..."
                      : modelConfig
                        ? `Search ${modelConfig.displayName.toLowerCase()} by name...`
                        : "Search..."
                  }
                  filterGroups={selectedModel === "Inventory" && !inventoryCharacterId ? [] : filterGroups}
                  onFilterChange={handleFilterChange}
                  onClearAll={handleClearAll}
                />
              )}
            </div>
          </div>
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="mb-6">
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
          </div>
        )}
        {error && (
          <div className="mb-6 flex flex-col gap-2">
            <MessageBanner
              type="error"
              message={error}
              onDismiss={() => {
                lastSavePayloadRef.current = null;
                setError(null);
              }}
            />
            {lastSavePayloadRef.current && (
              <button
                type="button"
                onClick={handleRetrySave}
                disabled={savingItemId !== null}
                className="self-start px-4 py-2 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--totk-mid-ocher)] hover:bg-[var(--totk-light-ocher)] text-[var(--botw-pale)] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {/* Items List */}
        {selectedModel === "Inventory" && inventoryCharacterId ? (
          /* Inventory: viewing a character's items — Back button + table */
          <>
            <div className="mb-4">
              <button
                type="button"
                onClick={() => {
                  setInventoryCharacterId(null);
                  setItems([]);
                  setCurrentPage(1);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] hover:bg-[var(--totk-mid-ocher)] text-[var(--botw-pale)] font-medium transition-colors"
              >
                <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                Back to characters
              </button>
            </div>
            {items.length === 0 && !loading ? (
              <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] p-12 shadow-lg">
                <div className="text-center">
                  <p className="text-[var(--botw-pale)] text-xl font-semibold">No inventory items for this character</p>
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] p-12 shadow-lg">
                <div className="text-center">
                  <p className="text-[var(--botw-pale)] text-xl font-semibold mb-2">No items match your search</p>
                  <button onClick={() => setSearchQuery("")} className="px-4 py-2 rounded-lg bg-[var(--totk-dark-ocher)] hover:bg-[var(--totk-mid-ocher)] text-[var(--botw-pale)] font-medium">
                    Clear Search
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] shadow-lg overflow-hidden">
                  {modelConfig && (
                    <ModelItemList
                      items={paginatedItems}
                      modelConfig={modelConfig}
                      onEdit={(item) => {
                        setEditingItem(item as DatabaseRecord);
                        setShowEditModal(true);
                      }}
                      onDelete={handleDeleteItem}
                    />
                  )}
                </div>
                {filteredItems.length > itemsPerPage && (
                  <div className="mt-6 flex justify-center">
                    <Pagination
                      currentPage={currentPage}
                      totalItems={filteredItems.length}
                      itemsPerPage={itemsPerPage}
                      onPageChange={setCurrentPage}
                    />
                  </div>
                )}
              </>
            )}
          </>
        ) : isInventoryCharacterList && inventoryCharacters.length > 0 ? (
          /* Inventory: character list — click a character to see their inventory */
          filteredInventoryCharacters.length === 0 ? (
            <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] p-12 shadow-lg">
              <div className="text-center">
                <p className="text-[var(--botw-pale)] text-xl font-semibold mb-2">No characters match your search</p>
                <button onClick={() => setSearchQuery("")} className="px-4 py-2 rounded-lg bg-[var(--totk-dark-ocher)] hover:bg-[var(--totk-mid-ocher)] text-[var(--botw-pale)] font-medium">
                  Clear Search
                </button>
              </div>
            </div>
          ) : (
          <>
            <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-[var(--totk-dark-ocher)]/50 bg-[var(--totk-dark-ocher)]/10">
                      <th className="px-4 py-3 text-[var(--totk-light-ocher)] font-semibold">Name</th>
                      <th className="px-4 py-3 text-[var(--totk-light-ocher)] font-semibold">Race</th>
                      <th className="px-4 py-3 text-[var(--totk-light-ocher)] font-semibold">Village</th>
                      <th className="px-4 py-3 text-[var(--totk-light-ocher)] font-semibold">Job</th>
                      <th className="px-4 py-3 text-[var(--totk-light-ocher)] font-semibold w-24">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedInventoryCharacters.map((char, idx) => {
                      const id = getItemId(char._id);
                      return (
                        <tr
                          key={id || `char-${idx}`}
                          className="border-b border-[var(--totk-grey-200)]/20 hover:bg-[var(--totk-dark-ocher)]/10 transition-colors"
                        >
                          <td className="px-4 py-3 text-[var(--botw-pale)]">{String(char.name ?? "")}</td>
                          <td className="px-4 py-3 text-[var(--totk-grey-200)]">{String(char.race ?? "")}</td>
                          <td className="px-4 py-3 text-[var(--totk-grey-200)]">{String(char.homeVillage ?? "")}</td>
                          <td className="px-4 py-3 text-[var(--totk-grey-200)]">{String(char.job ?? "")}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => {
                                setInventoryCharacterId(id);
                                setCurrentPage(1);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-[var(--totk-mid-ocher)] hover:bg-[var(--totk-light-ocher)] text-[var(--botw-pale)] text-sm font-medium"
                            >
                              View inventory
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            {filteredInventoryCharacters.length > itemsPerPage && (
              <div className="mt-6 flex justify-center">
                <Pagination
                  currentPage={currentPage}
                  totalItems={filteredInventoryCharacters.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </>
          )
        ) : !isInventoryCharacterList && items.length === 0 ? (
          <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] p-12 shadow-lg">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[var(--totk-dark-ocher)]/20 mb-4">
                <i className="fa-solid fa-inbox text-4xl text-[var(--totk-grey-200)]" aria-hidden="true" />
              </div>
              <p className="text-[var(--botw-pale)] text-xl font-semibold mb-2">
                {error ? "Failed to load items" : selectedModel === "Inventory" && hasLoadedOnce ? "No characters found" : hasLoadedOnce ? "No items found" : "Select a model and click Load to fetch data"}
              </p>
              <p className="text-sm text-[var(--totk-grey-200)]">
                {error ? "Please try refreshing the page." : hasLoadedOnce ? (selectedModel === "Inventory" ? "Characters will appear here once loaded." : "Items will appear here once loaded.") : "Choose a model type above and click the Load button to load records."}
              </p>
            </div>
          </div>
        ) : isInventoryCharacterList && inventoryCharacters.length === 0 && hasLoadedOnce ? (
          <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] p-12 shadow-lg">
            <div className="text-center">
              <p className="text-[var(--botw-pale)] text-xl font-semibold">No characters found</p>
              <p className="text-sm text-[var(--totk-grey-200)] mt-2">Load again to refresh.</p>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] p-12 shadow-lg">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[var(--totk-dark-ocher)]/20 mb-4">
                <i className="fa-solid fa-magnifying-glass text-4xl text-[var(--totk-grey-200)]" aria-hidden="true" />
              </div>
              <p className="text-[var(--botw-pale)] text-xl font-semibold mb-2">
                No items match your search
              </p>
              <p className="text-sm text-[var(--totk-grey-200)] mb-4">
                Try a different search term or clear your search.
              </p>
              <button
                onClick={() => setSearchQuery("")}
                className="px-4 py-2 rounded-lg bg-[var(--totk-dark-ocher)] hover:bg-[var(--totk-mid-ocher)] text-[var(--botw-pale)] font-medium transition-colors"
              >
                Clear Search
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] shadow-lg overflow-hidden">
              {selectedModel === "Item" && modelConfig ? (
                <DatabaseItemList
                  items={paginatedItems as unknown as Parameters<typeof DatabaseItemList>[0]['items']}
                  onEdit={(item) => {
                    setEditingItem(item as DatabaseRecord);
                    setShowEditModal(true);
                  }}
                />
              ) : modelConfig ? (
                <ModelItemList
                  items={paginatedItems}
                  modelConfig={modelConfig}
                  onEdit={(item) => {
                    setEditingItem(item as DatabaseRecord);
                    setShowEditModal(true);
                  }}
                />
              ) : null}
            </div>
            {filteredItems.length > itemsPerPage && (
              <div className="mt-6 flex justify-center">
                <Pagination
                  currentPage={currentPage}
                  totalItems={filteredItems.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </>
        )}

        {/* Edit Modal */}
        {editingItem && modelConfig && (
          <Modal
            open={showEditModal}
            onOpenChange={(open) => {
              setShowEditModal(open);
              if (!open) {
                setEditingItem(null);
              }
            }}
            title={`Edit: ${String(editingItem[modelConfig.nameField] || "Item")}`}
            description={
              selectedModel === "Inventory"
                ? "Edit this character inventory entry. Changes save to the character's inventory collection."
                : `Edit ${modelConfig.displayName.toLowerCase()} properties`
            }
            hideTitle={false}
            size="full"
          >
            {selectedModel === "Item" ? (
              <ItemEditorForm
                item={editingItem as unknown as Parameters<typeof ItemEditorForm>[0]['item']}
                items={items.map((item) => ({ 
                  _id: item._id, 
                  itemName: String(item.itemName || item[modelConfig.nameField] || "") 
                }))}
                fieldOptions={fieldOptions}
                onSave={async (itemId, updates) => {
                  await handleSaveItem(itemId, updates as Record<string, unknown>);
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
                saving={savingItemId === getItemId(editingItem._id)}
                onClose={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
              />
            ) : (
              <GenericEditorForm
                item={editingItem}
                modelConfig={modelConfig}
                items={selectedModel === "Item" ? items.map((item) => ({
                  _id: item._id,
                  itemName: String(item.itemName || item[modelConfig.nameField] || "")
                })) : []}
                onSave={async (itemId, updates) => {
                  await handleSaveItem(itemId, updates);
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
                saving={savingItemId === getItemId(editingItem._id)}
                onClose={() => {
                  setShowEditModal(false);
                  setEditingItem(null);
                }}
              />
            )}
          </Modal>
        )}
      </div>
    </div>
  );
}
