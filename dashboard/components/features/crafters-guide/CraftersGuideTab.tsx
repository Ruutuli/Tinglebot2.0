"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { useSession } from "@/hooks/use-session";
import { Loading, SearchFilterBar, Pagination } from "@/components/ui";
import type { FilterGroup } from "@/components/ui";
import { capitalize } from "@/lib/string-utils";
import { getCachedData, setCachedData } from "@/lib/cache-utils";
import { imageUrlForGcsUrl } from "@/lib/image-url";

const CRAFTERS_CACHE_KEY_PREFIX = "crafters-guide";
const CRAFTERS_CACHE_EXPIRY = 1000 * 60 * 5; // 5 minutes
const ITEMS_PER_PAGE = 24;

const formatImageUrl = (url: string | undefined): string => {
  if (!url || url === "No Image") return "/ankle_icon.png";
  if (url.startsWith("https://storage.googleapis.com/tinglebot/")) {
    return imageUrlForGcsUrl(url);
  }
  return url;
};

type CraftingMaterial = {
  itemName: string;
  quantity: number;
  emoji?: string;
};

type CraftableItem = {
  itemName: string;
  emoji?: string;
  category?: string | string[];
  staminaToCraft?: number;
  allJobs?: string[];
  craftingMaterial: CraftingMaterial[];
  canCraft: boolean;
  hasEnoughStamina?: boolean;
  charactersWithMaterials?: string[];
  image?: string;
};

type CharacterSummary = {
  characterName: string;
  characterId: string;
  icon: string | null;
  job: string | null;
  currentVillage: string | null;
};

function CraftableItemCard({
  item,
  mode,
  isPublic,
}: {
  item: CraftableItem;
  mode: "single" | "all" | "public";
  isPublic?: boolean;
}) {
  const category = Array.isArray(item.category) ? item.category[0] : item.category || "Unknown";
  const jobs = item.allJobs && item.allJobs.length > 0 ? item.allJobs.join(", ") : "Any Job";
  const imageUrl = formatImageUrl(item.image);

  return (
    <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)] p-4 shadow-lg transition-all hover:shadow-xl hover:border-[var(--totk-green)]/50">
      <div className="flex flex-col">
        <div className="flex items-start gap-3 mb-3 border-b border-[var(--totk-dark-ocher)] pb-3">
          <div className="flex-shrink-0">
            <img
              src={imageUrl}
              alt={item.itemName}
              className="w-14 h-14 object-contain rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = "/ankle_icon.png";
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-[var(--totk-light-green)] break-words leading-tight">
              {item.itemName}
            </h3>
          </div>
        </div>
        <div className="space-y-2.5 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-[var(--totk-mid-ocher)] font-semibold text-xs uppercase tracking-wide">Category</span>
            <span className="text-white">{category}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[var(--totk-mid-ocher)] font-semibold text-xs uppercase tracking-wide">Job</span>
            <span className="text-white">{jobs}</span>
          </div>
          {item.staminaToCraft !== undefined && item.staminaToCraft !== null && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--totk-mid-ocher)] font-semibold text-xs uppercase tracking-wide">Stamina</span>
              <span
                className={`font-bold ${
                  !isPublic && item.hasEnoughStamina === false ? "text-red-400" : "text-[var(--totk-light-green)]"
                }`}
              >
                {item.staminaToCraft}
                {!isPublic && item.hasEnoughStamina === false && (
                  <span className="text-red-300 text-xs font-normal ml-1">(Insufficient)</span>
                )}
              </span>
            </div>
          )}
          {!isPublic && mode === "all" && item.charactersWithMaterials && item.charactersWithMaterials.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-[var(--totk-mid-ocher)] font-semibold text-xs uppercase tracking-wide pt-0.5">Characters</span>
              <span className="text-white text-xs">{item.charactersWithMaterials.join(", ")}</span>
            </div>
          )}
          <div className="mt-3 pt-3 border-t border-[var(--totk-dark-ocher)]">
            <div className="text-[var(--totk-mid-ocher)] font-semibold mb-2 text-xs uppercase tracking-wide">Materials Required</div>
            <ul className="space-y-1">
              {item.craftingMaterial.map((material, idx) => (
                <li key={idx} className="text-white text-xs flex items-center">
                  <span className="mr-2 text-[var(--totk-light-green)]">•</span>
                  <span>
                    {material.itemName} <span className="text-[var(--totk-mid-ocher)] font-semibold">x{material.quantity}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function CraftersGuideTab() {
  const { user, loading: sessionLoading } = useSession();
  const [mode, setMode] = useState<"single" | "all" | "public">("all");
  const [selectedCharacter, setSelectedCharacter] = useState<string>("");
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [craftableItems, setCraftableItems] = useState<CraftableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJob, setSelectedJob] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [minStamina, setMinStamina] = useState<string>("");
  const [maxStamina, setMaxStamina] = useState<string>("");

  useEffect(() => {
    if (!sessionLoading) {
      if (!user) setMode("public");
      else if (mode === "public") setMode("all");
    }
  }, [user, sessionLoading, mode]);

  const fetchCharacters = useCallback(async () => {
    try {
      const response = await fetch("/api/inventories/list");
      if (!response.ok) throw new Error("Failed to fetch characters");
      const data = await response.json();
      const chars = data.data || [];
      setCharacters(chars);
      if (chars.length > 0 && !selectedCharacter) setSelectedCharacter(chars[0].characterName);
    } catch (err) {
      console.error("[CraftersGuideTab] Failed to fetch characters:", err);
    }
  }, [selectedCharacter]);

  useEffect(() => {
    if (user && !sessionLoading) fetchCharacters();
  }, [user, sessionLoading, fetchCharacters]);

  const cacheKey = useMemo(
    () => `${CRAFTERS_CACHE_KEY_PREFIX}-${user ? mode : "public"}-${mode === "single" ? selectedCharacter : ""}`,
    [user, mode, selectedCharacter]
  );

  const fetchCraftableItems = useCallback(async () => {
    if (sessionLoading) return;
    if (user && mode === "single" && !selectedCharacter) return;

    const cached = getCachedData<CraftableItem[]>({
      key: cacheKey,
      expiry: CRAFTERS_CACHE_EXPIRY,
    });
    if (cached != null) {
      setCraftableItems(cached);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (user) {
        if (mode === "single" && selectedCharacter) {
          params.set("characterName", selectedCharacter);
          params.set("mode", "single");
        } else params.set("mode", "all");
      } else params.set("mode", "public");

      const response = await fetch(`/api/crafting/guide?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch craftable items");
      }
      const data = await response.json();
      const items = data.data || [];
      setCraftableItems(items);
      setCachedData({ key: cacheKey, expiry: CRAFTERS_CACHE_EXPIRY }, items);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [user, sessionLoading, mode, selectedCharacter, cacheKey]);

  useEffect(() => {
    fetchCraftableItems();
  }, [fetchCraftableItems]);

  const filteredItems = useMemo(() => {
    let filtered = [...craftableItems];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.itemName.toLowerCase().includes(q) ||
          (Array.isArray(item.category) ? item.category.some((c) => c.toLowerCase().includes(q)) : item.category?.toLowerCase().includes(q))
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
    if (minStamina) {
      const min = parseInt(minStamina, 10);
      if (!isNaN(min)) filtered = filtered.filter((item) => (item.staminaToCraft || 0) >= min);
    }
    if (maxStamina) {
      const max = parseInt(maxStamina, 10);
      if (!isNaN(max)) filtered = filtered.filter((item) => (item.staminaToCraft || 0) <= max);
    }
    return filtered;
  }, [craftableItems, searchQuery, selectedJob, selectedCategory, minStamina, maxStamina]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    craftableItems.forEach((item) => {
      if (Array.isArray(item.category)) item.category.forEach((c) => cats.add(c));
      else if (item.category) cats.add(item.category);
    });
    return Array.from(cats).sort();
  }, [craftableItems]);

  const jobs = useMemo(() => {
    const jobSet = new Set<string>();
    craftableItems.forEach((item) => {
      item.allJobs?.forEach((job) => jobSet.add(job));
    });
    return Array.from(jobSet).sort();
  }, [craftableItems]);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedJob, selectedCategory, minStamina, maxStamina]);

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loading />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--totk-light-green)] mb-1">Crafters Guide</h2>
          <p className="text-white/80 text-sm">
            {user
              ? "See what items your characters can craft right now based on their materials and stamina."
              : "Browse all crafting recipes. Log in to see which items you can actually craft."}
          </p>
        </div>
        <button
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
          <p className="text-white/80 mb-2">
            Shows which items you can craft based on materials in your characters&apos; inventories.
            {user ? " Only displays items you can craft right now." : " Log in for personalized results."}
          </p>
          {user && (
            <ul className="list-disc list-inside space-y-0.5 text-white/80">
              <li><strong className="text-white">All Characters:</strong> Combines materials from all characters (stamina ignored)</li>
              <li><strong className="text-white">Single Character:</strong> Uses one character&apos;s materials and stamina</li>
            </ul>
          )}
          {!user && (
            <p className="mt-2">
              <Link href="/api/auth/discord" className="text-[var(--totk-light-green)] underline font-semibold">Log in</Link> to see which items you can actually craft.
            </p>
          )}
        </div>
      )}

      {!user && (
        <div className="rounded-lg border-2 border-[var(--totk-green)] bg-[var(--totk-green)]/10 p-3 text-sm text-white/90">
          <i className="fa-solid fa-info-circle mr-2 text-[var(--totk-light-green)]" />
          You&apos;re viewing all recipes. <Link href="/api/auth/discord" className="text-[var(--totk-light-green)] underline font-semibold">Log in</Link> to see craftable items for your characters.
        </div>
      )}

      {user && (
        <div className="p-4 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-3">
              <label className="text-white font-semibold text-sm">Mode:</label>
              <div className="flex gap-2">
                <button
                  onClick={() => { setMode("all"); setSelectedCharacter(""); }}
                  className={`px-4 py-2 rounded-md font-semibold text-sm border-2 transition-all ${
                    mode === "all" ? "bg-[var(--totk-green)] text-white border-[var(--totk-green)]" : "bg-[var(--botw-warm-black)] text-white/70 border-[var(--totk-dark-ocher)] hover:border-[var(--totk-green)]/50"
                  }`}
                >
                  All Characters
                </button>
                <button
                  onClick={() => setMode("single")}
                  className={`px-4 py-2 rounded-md font-semibold text-sm border-2 transition-all ${
                    mode === "single" ? "bg-[var(--totk-green)] text-white border-[var(--totk-green)]" : "bg-[var(--botw-warm-black)] text-white/70 border-[var(--totk-dark-ocher)] hover:border-[var(--totk-green)]/50"
                  }`}
                >
                  Single Character
                </button>
              </div>
            </div>
            {mode === "single" && (
              <div className="flex items-center gap-3">
                <label className="text-white font-semibold text-sm">Character:</label>
                <select
                  value={selectedCharacter}
                  onChange={(e) => setSelectedCharacter(e.target.value)}
                  className="px-4 py-2 rounded-md bg-[var(--botw-warm-black)] text-white border-2 border-[var(--totk-dark-ocher)] focus:ring-2 focus:ring-[var(--totk-green)] min-w-[200px]"
                >
                  <option value="">Select a character</option>
                  {characters.map((char) => (
                    <option key={char.characterId} value={char.characterName}>{char.characterName}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-white font-semibold text-sm">Min Stamina:</label>
          <input
            type="number"
            value={minStamina}
            onChange={(e) => setMinStamina(e.target.value)}
            placeholder="0"
            min={0}
            className="w-20 px-3 py-2 rounded-md bg-[var(--botw-warm-black)] text-white border-2 border-[var(--totk-dark-ocher)] focus:ring-2 focus:ring-[var(--totk-green)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-white font-semibold text-sm">Max Stamina:</label>
          <input
            type="number"
            value={maxStamina}
            onChange={(e) => setMaxStamina(e.target.value)}
            placeholder="No limit"
            min={0}
            className="w-20 px-3 py-2 rounded-md bg-[var(--botw-warm-black)] text-white border-2 border-[var(--totk-dark-ocher)] focus:ring-2 focus:ring-[var(--totk-green)]"
          />
        </div>
      </div>

      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search items by name or category..."
        filterGroups={filterGroups}
        onFilterChange={handleFilterChange}
      />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loading />
        </div>
      ) : error ? (
        <div className="rounded-lg border-2 border-red-500 bg-red-500/10 p-6 text-red-400">
          <p className="font-semibold mb-2">Error:</p>
          <p>{error}</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)] p-12 text-center text-white">
          {craftableItems.length === 0
            ? user
              ? mode === "single"
                ? "No craftable items found for this character."
                : "No craftable items found across all characters."
              : "No crafting recipes found."
            : "No items match the current filters."}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-white text-sm">
              {user ? "Craftable items" : "Recipes"}: <span className="font-bold text-[var(--totk-light-green)]">{filteredItems.length}</span>
              {craftableItems.length !== filteredItems.length && (
                <span className="text-white/60 ml-1">(of {craftableItems.length} total)</span>
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
                item={item}
                mode={user ? mode : "public"}
                isPublic={!user}
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
    </div>
  );
}
