"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loading, SearchFilterBar, Pagination } from "@/components/ui";
import type { FilterGroup } from "@/components/ui";
import { capitalize } from "@/lib/string-utils";
import { CraftableItemCard } from "@/components/features/crafters-guide/CraftersGuideTab";
import { generalCategories } from "@/lib/general-item-categories";

const ITEMS_PER_PAGE = 24;
const AUTOCOMPLETE_DEBOUNCE_MS = 280;
const MIN_QUERY_LEN = 2;

type CatalogItemSuggestion = {
  itemName: string;
};

type CraftingMaterial = {
  itemName: string;
  quantity: number;
  emoji?: string;
};

type RecipeRow = {
  itemName: string;
  emoji?: string;
  category?: string | string[];
  staminaToCraft?: number;
  allJobs?: string[];
  craftingMaterial: CraftingMaterial[];
  image?: string;
};

export function CraftingIngredientSearchTab() {
  const [inputValue, setInputValue] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<"any" | "all">("all");
  const [results, setResults] = useState<RecipeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showHelp, setShowHelp] = useState(false);
  const [inputHint, setInputHint] = useState<string | null>(null);
  const [itemSuggestions, setItemSuggestions] = useState<CatalogItemSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");

  const comboRef = useRef<HTMLDivElement>(null);

  const addTag = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setTags((prev) => {
      if (prev.some((p) => p.toLowerCase() === t.toLowerCase())) return prev;
      return [...prev, t];
    });
    setInputValue("");
    setInputHint(null);
    setSuggestionsOpen(false);
    setItemSuggestions([]);
  }, []);

  const removeTag = useCallback((tag: string) => {
    setTags((prev) => prev.filter((p) => p !== tag));
  }, []);

  const slotSuggestions = useMemo(() => {
    const q = inputValue.trim().toLowerCase();
    if (q.length < MIN_QUERY_LEN) return [];
    const keys = Object.keys(generalCategories).filter((k) => k.toLowerCase().includes(q));
    keys.sort((a, b) => a.localeCompare(b));
    return keys.slice(0, 12);
  }, [inputValue]);

  const filteredItemSuggestions = useMemo(
    () =>
      itemSuggestions.filter((i) => !tags.some((t) => t.toLowerCase() === i.itemName.toLowerCase())),
    [itemSuggestions, tags]
  );

  const filteredSlotSuggestions = useMemo(
    () => slotSuggestions.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase())),
    [slotSuggestions, tags]
  );

  const showSuggestionPanel = suggestionsOpen && inputValue.trim().length >= MIN_QUERY_LEN;

  useEffect(() => {
    const q = inputValue.trim();
    if (q.length < MIN_QUERY_LEN) {
      setItemSuggestions([]);
      setSuggestionsLoading(false);
      return;
    }

    setSuggestionsLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          search: q,
          limit: "15",
          page: "1",
        });
        const response = await fetch(`/api/models/items?${params.toString()}`);
        if (!response.ok) {
          setItemSuggestions([]);
          return;
        }
        const json = (await response.json()) as { data?: { itemName?: string }[] };
        const rows = json.data || [];
        const seen = new Set<string>();
        const deduped: CatalogItemSuggestion[] = [];
        for (const row of rows) {
          const name = row.itemName;
          if (!name) continue;
          const k = name.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          deduped.push({ itemName: name });
        }
        setItemSuggestions(deduped);
      } catch {
        setItemSuggestions([]);
      } finally {
        setSuggestionsLoading(false);
      }
    }, AUTOCOMPLETE_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [inputValue]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!comboRef.current?.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const tryCommitInput = useCallback(() => {
    const q = inputValue.trim();
    if (!q) return;
    const lower = q.toLowerCase();

    const itemExact = filteredItemSuggestions.find((i) => i.itemName.toLowerCase() === lower);
    if (itemExact) {
      addTag(itemExact.itemName);
      return;
    }
    const slotExact = filteredSlotSuggestions.find((s) => s.toLowerCase() === lower);
    if (slotExact) {
      addTag(slotExact);
      return;
    }

    if (filteredItemSuggestions.length === 1 && filteredSlotSuggestions.length === 0) {
      addTag(filteredItemSuggestions[0]!.itemName);
      return;
    }
    if (filteredSlotSuggestions.length === 1 && filteredItemSuggestions.length === 0) {
      addTag(filteredSlotSuggestions[0]!);
      return;
    }

    setInputHint("Choose an item or material slot from the list, or keep typing to narrow results.");
  }, [inputValue, filteredItemSuggestions, filteredSlotSuggestions, addTag]);

  const runSearch = useCallback(async () => {
    if (inputValue.trim()) {
      setError(null);
      setInputHint("Add the ingredient from the suggestions list, or clear the field.");
      return;
    }
    if (tags.length === 0) {
      setError("Add at least one ingredient using the catalog search.");
      return;
    }

    setLoading(true);
    setError(null);
    setInputHint(null);
    setHasSearched(true);
    try {
      const params = new URLSearchParams();
      params.set("ingredients", tags.join(","));
      params.set("match", matchMode);
      const response = await fetch(`/api/crafting/by-ingredients?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error || "Search failed");
      }
      const data = await response.json();
      setResults((data.data || []) as RecipeRow[]);
      setCurrentPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [tags, matchMode, inputValue]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedJob, selectedCategory]);

  const filteredItems = useMemo(() => {
    let filtered = [...results];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.itemName.toLowerCase().includes(q) ||
          (Array.isArray(item.category)
            ? item.category.some((c) => c.toLowerCase().includes(q))
            : item.category?.toLowerCase().includes(q))
      );
    }
    if (selectedJob) {
      filtered = filtered.filter(
        (item) => item.allJobs?.length && item.allJobs.some((job) => job.toLowerCase() === selectedJob.toLowerCase())
      );
    }
    if (selectedCategory) {
      filtered = filtered.filter((item) => {
        const cat = Array.isArray(item.category) ? item.category[0] : item.category || "";
        return cat.toLowerCase() === selectedCategory.toLowerCase();
      });
    }
    return filtered;
  }, [results, searchQuery, selectedJob, selectedCategory]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    results.forEach((item) => {
      if (Array.isArray(item.category)) item.category.forEach((c) => cats.add(c));
      else if (item.category) cats.add(item.category);
    });
    return Array.from(cats).sort();
  }, [results]);

  const jobs = useMemo(() => {
    const jobSet = new Set<string>();
    results.forEach((item) => {
      item.allJobs?.forEach((job) => jobSet.add(job));
    });
    return Array.from(jobSet).sort();
  }, [results]);

  const filterGroups: FilterGroup[] = useMemo(
    () => [
      {
        id: "job",
        label: "Job",
        options: [
          { id: "job-all", value: "", label: "All Jobs", active: selectedJob === "" },
          ...jobs.map((job) => ({
            id: `job-${job.toLowerCase().replace(/\s+/g, "-")}`,
            value: job,
            label: capitalize(job),
            active: selectedJob === job,
          })),
        ],
      },
      {
        id: "category",
        label: "Category",
        options: [
          { id: "category-all", value: "", label: "All Categories", active: selectedCategory === "" },
          ...categories.map((cat) => ({
            id: `category-${cat.toLowerCase().replace(/\s+/g, "-")}`,
            value: cat,
            label: capitalize(cat),
            active: selectedCategory === cat,
          })),
        ],
      },
    ],
    [jobs, categories, selectedJob, selectedCategory]
  );

  const handleFilterChange = useCallback(
    (groupId: string, optionId: string, active: boolean) => {
      if (!active) {
        if (groupId === "job") setSelectedJob("");
        if (groupId === "category") setSelectedCategory("");
        return;
      }
      const group = filterGroups.find((g) => g.id === groupId);
      const option = group?.options.find((o) => o.id === optionId);
      if (option) {
        if (groupId === "job") setSelectedJob(String(option.value));
        if (groupId === "category") setSelectedCategory(String(option.value));
      }
    },
    [filterGroups]
  );

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = useMemo(
    () => filteredItems.slice(start, start + ITEMS_PER_PAGE),
    [filteredItems, start]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--totk-light-green)] mb-1">Recipe search</h2>
          <p className="text-white/80 text-sm max-w-2xl">
            Find every craftable item in the catalog that uses your ingredients. This does not check your inventories or
            stamina—use the Crafters Guide tab to see what you can make right now.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHelp(!showHelp)}
          className="px-4 py-2 rounded-md bg-[var(--botw-warm-black)] text-white border-2 border-[var(--totk-dark-ocher)] hover:border-[var(--totk-green)] transition-all text-sm"
        >
          <i className={`fa-solid ${showHelp ? "fa-chevron-up" : "fa-question-circle"} mr-2`} />
          {showHelp ? "Hide Help" : "How to Use"}
        </button>
      </div>

      {showHelp && (
        <div className="rounded-lg border-2 border-[var(--totk-green)] bg-[var(--totk-green)]/10 p-4 text-white/90 text-sm">
          <h3 className="font-bold text-[var(--totk-light-green)] mb-2">How to Use</h3>
          <ul className="list-disc list-inside space-y-1 text-white/80">
            <li>
              Type at least two characters, then <strong className="text-white">click a catalog item</strong> or{" "}
              <strong className="text-white">general slot</strong> (e.g. Any Fish) from the list so the name is guaranteed
              to exist in the database.
            </li>
            <li>
              <strong className="text-white">Match all</strong> (default): every chip must appear in the recipe materials.
            </li>
            <li>
              <strong className="text-white">Match any</strong>: recipe uses at least one of the chips.
            </li>
          </ul>
        </div>
      )}

      <div className="p-4 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50 space-y-4">
        <div>
          <label className="text-white font-semibold text-sm block mb-2">Ingredients</label>
          <div className="flex flex-wrap gap-2 mb-2 min-h-[2rem]">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--totk-green)]/20 border border-[var(--totk-green)]/50 text-white text-sm"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="text-white/80 hover:text-white"
                  aria-label={`Remove ${tag}`}
                >
                  <i className="fa-solid fa-times text-xs" />
                </button>
              </span>
            ))}
          </div>
          <div ref={comboRef} className="relative flex flex-wrap gap-2 items-start">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                autoComplete="off"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setInputHint(null);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    tryCommitInput();
                  }
                  if (e.key === "Escape") {
                    setSuggestionsOpen(false);
                  }
                }}
                placeholder="Search catalog (2+ letters), then pick a row or press Enter if only one match"
                className="w-full px-4 py-2 rounded-md bg-[var(--botw-warm-black)] text-white border-2 border-[var(--totk-dark-ocher)] focus:ring-2 focus:ring-[var(--totk-green)]"
                aria-autocomplete="list"
                aria-expanded={showSuggestionPanel}
              />
              {inputHint && (
                <p className="mt-1.5 text-amber-200/90 text-xs">{inputHint}</p>
              )}
              {showSuggestionPanel && (
                <div
                  className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-xl"
                  role="listbox"
                >
                  {suggestionsLoading && (
                    <div className="px-3 py-2 text-white/70 text-sm">
                      <i className="fa-solid fa-spinner fa-spin mr-2" />
                      Loading catalog…
                    </div>
                  )}
                  {!suggestionsLoading &&
                    filteredItemSuggestions.length === 0 &&
                    filteredSlotSuggestions.length === 0 && (
                      <div className="px-3 py-2 text-white/60 text-sm">No matches in catalog or material slots.</div>
                    )}
                  {filteredItemSuggestions.length > 0 && (
                    <div>
                      <div className="sticky top-0 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--totk-mid-ocher)] bg-[var(--botw-warm-black)] border-b border-[var(--totk-dark-ocher)]">
                        Catalog items
                      </div>
                      {filteredItemSuggestions.map((row) => (
                        <button
                          key={row.itemName}
                          type="button"
                          role="option"
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-[var(--totk-green)]/20 border-b border-[var(--totk-dark-ocher)]/50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addTag(row.itemName)}
                        >
                          {row.itemName}
                        </button>
                      ))}
                    </div>
                  )}
                  {filteredSlotSuggestions.length > 0 && (
                    <div>
                      <div className="sticky top-0 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--totk-mid-ocher)] bg-[var(--botw-warm-black)] border-b border-[var(--totk-dark-ocher)]">
                        General material slots
                      </div>
                      {filteredSlotSuggestions.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          role="option"
                          className="w-full text-left px-3 py-2 text-sm text-white hover:bg-[var(--totk-green)]/20 flex items-center gap-2 border-b border-[var(--totk-dark-ocher)]/50"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => addTag(slot)}
                        >
                          <span className="text-[var(--totk-light-green)] shrink-0">
                            <i className="fa-solid fa-layer-group text-xs" />
                          </span>
                          <span>{slot}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={tryCommitInput}
              className="px-4 py-2 rounded-md font-semibold text-sm border-2 bg-[var(--botw-warm-black)] text-white border-[var(--totk-dark-ocher)] hover:border-[var(--totk-green)]/50"
            >
              Add
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <span className="text-white font-semibold text-sm">Match:</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMatchMode("all")}
              className={`px-4 py-2 rounded-md font-semibold text-sm border-2 transition-all ${
                matchMode === "all"
                  ? "bg-[var(--totk-green)] text-white border-[var(--totk-green)]"
                  : "bg-[var(--botw-warm-black)] text-white/70 border-[var(--totk-dark-ocher)] hover:border-[var(--totk-green)]/50"
              }`}
            >
              All ingredients
            </button>
            <button
              type="button"
              onClick={() => setMatchMode("any")}
              className={`px-4 py-2 rounded-md font-semibold text-sm border-2 transition-all ${
                matchMode === "any"
                  ? "bg-[var(--totk-green)] text-white border-[var(--totk-green)]"
                  : "bg-[var(--botw-warm-black)] text-white/70 border-[var(--totk-dark-ocher)] hover:border-[var(--totk-green)]/50"
              }`}
            >
              Any ingredient
            </button>
          </div>
          <button
            type="button"
            onClick={runSearch}
            disabled={loading}
            className="px-6 py-2 rounded-md font-bold text-sm border-2 bg-[var(--totk-light-green)] text-[var(--botw-warm-black)] border-[var(--totk-light-green)] hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (
              <>
                <i className="fa-solid fa-spinner fa-spin mr-2" />
                Searching…
              </>
            ) : (
              <>
                <i className="fa-solid fa-magnifying-glass mr-2" />
                Search
              </>
            )}
          </button>
        </div>
      </div>

      {hasSearched && !loading && (
        <>
          <SearchFilterBar
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Filter results by name or category..."
            filterGroups={filterGroups}
            onFilterChange={handleFilterChange}
          />

          {error ? (
            <div className="rounded-lg border-2 border-red-500 bg-red-500/10 p-6 text-red-400">
              <p className="font-semibold mb-2">Error</p>
              <p>{error}</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)] p-12 text-center text-white">
              {results.length === 0
                ? "No recipes use those ingredients (with the current match mode)."
                : "No results match the filters above."}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-white text-sm">
                  Recipes:{" "}
                  <span className="font-bold text-[var(--totk-light-green)]">{filteredItems.length}</span>
                  {results.length !== filteredItems.length && (
                    <span className="text-white/60 ml-1">(of {results.length} from search)</span>
                  )}
                </p>
                {totalPages > 1 && (
                  <Pagination
                    currentPage={currentPage}
                    totalItems={filteredItems.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                  />
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedItems.map((item, idx) => (
                  <CraftableItemCard
                    key={`${item.itemName}-${idx}`}
                    item={{
                      ...item,
                      canCraft: false,
                    }}
                    mode="public"
                    isPublic
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex justify-center pt-4">
                  <Pagination
                    currentPage={currentPage}
                    totalItems={filteredItems.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    onPageChange={setCurrentPage}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loading />
        </div>
      )}
    </div>
  );
}
