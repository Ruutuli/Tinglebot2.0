"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { formatItemImageUrl } from "@/lib/item-utils";
import { formatOpenCommissionSeekingLine } from "@/lib/crafting-request-helpers";
import { elixirTierLabel, isMixerOutputElixirName } from "@/lib/elixir-catalog";
import {
  computeMixerAutoPickedQuantities,
  computeMixerRecipeLineProgress,
  MIXER_BREW_BASE_ROLE_UNITS,
  MIXER_BREW_MAX_EXTRAS,
  MIXER_BREW_MAX_INGREDIENT_UNITS,
  mixerBrewOverBudgetMessage,
  mixerBrewTooFewUnitsMessage,
  mixerRecipeMinimumTotalUnits,
  mixerStackRoleBadge,
} from "@/lib/elixir-material-line-match";

type CraftingRequestRow = {
  _id: string;
  /** Public workshop code (K + 6 digits); legacy rows may omit */
  commissionID?: string;
  requesterDiscordId: string;
  requesterUsername?: string;
  requesterCharacterName: string;
  craftItemName: string;
  /** From list API join — raw Item.image */
  craftItemImage?: string;
  craftingJobsSnapshot: string[];
  staminaToCraftSnapshot: number;
  targetMode: "open" | "specific";
  targetCharacterId?: string | null;
  targetCharacterName?: string;
  targetCharacterHomeVillage?: string;
  providingAllMaterials: boolean;
  materialsDescription?: string;
  paymentOffer?: string;
  /** 1–3 Basic / Mid / High for mixer elixirs */
  elixirTier?: number | null;
  /** Commissioner stack picks for mixer elixirs */
  elixirMaterialSelections?: Array<{ inventoryDocumentId: string; maxQuantity: number }>;
  status: string;
  acceptedAt?: string | null;
  acceptedByUserId?: string | null;
  acceptedByCharacterName?: string;
  createdAt?: string;
  /** Live requester location (for same-village accept UI); from list API */
  requesterCurrentVillage?: string | null;
};

type ListChar = {
  _id: string;
  name: string;
  job: string;
  /** Mirrors OC sheet / bot — active voucher qualifies for recipe jobs */
  jobVoucher?: boolean;
  jobVoucherJob?: string | null;
  currentStamina: number;
  /** Present from /api/characters/list after voucher support */
  maxStamina?: number;
  /** Current in-world village (workshop commissions require same village as requester) */
  currentVillage?: string;
  isModCharacter: boolean;
};

type SearchChar = ListChar & {
  userId: string;
  homeVillage?: string;
  /** From character search API; used to warn when max stamina < recipe base. */
  maxStamina?: number;
  jobVoucher?: boolean;
  jobVoucherJob?: string | null;
  currentVillage?: string;
};

type OcMaterialLine = { itemName: string; quantity: number; ownedQty: number; sufficient: boolean };
type OcMaterialCheckResult = { hasRecipe: boolean; allMaterialsMet: boolean; lines: OcMaterialLine[] };

type CraftItemOpt = {
  itemName: string;
  craftingJobs?: string[];
  staminaToCraft?: unknown;
  isElixir?: boolean;
  elixirLevel?: number | null;
};

type ElixirGuideResponse = {
  craftItemName: string;
  targetLevel: number;
  tierLabel: string;
  /** Catalog recipe lines — same rules as claim validation (categories + exact names). */
  craftingMaterial: Array<{ itemName: string; quantity: number }>;
  /** True when the catalog row has no usable recipe lines (data issue). */
  recipeIncomplete?: boolean;
};

/** Trim mixer stack picks so total committed units ≤ per-brew limit (same as /crafting brew). */
function trimMixerSelectionsToIngredientBudget(
  qtyById: Record<string, number>,
  maxTotal: number
): Record<string, number> {
  const entries = Object.entries(qtyById)
    .map(([id, raw]) => ({
      id,
      v: Math.max(0, Math.floor(Number(raw)) || 0),
    }))
    .filter((e) => e.v > 0);
  let sum = entries.reduce((a, e) => a + e.v, 0);
  if (sum <= maxTotal) return Object.fromEntries(entries.map((e) => [e.id, e.v]));
  const list = entries.sort((a, b) => b.v - a.v);
  while (sum > maxTotal && list.length > 0) {
    const head = list[0]!;
    head.v -= 1;
    sum -= 1;
    if (head.v <= 0) list.shift();
  }
  return Object.fromEntries(list.filter((e) => e.v > 0).map((e) => [e.id, e.v]));
}

function parseStamina(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
  if (v && typeof v === "object" && "base" in v) {
    const n = Number((v as { base: unknown }).base);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Dark green panels — reads clearly on the brown modal (won’t blend into warm-black fields). */
const CRAFTING_MODAL_DROPPANEL_CHROME =
  "border-2 border-[var(--totk-light-green)]/40 bg-[var(--totk-dark-green)]/95 shadow-lg shadow-black/45 ring-1 ring-[var(--totk-light-green)]/25";

/** Custom dropdown trigger — matches green search fields (`modalGreenControlShell`). */
const GREEN_SELECT_TRIGGER_CLASS =
  "relative w-full min-h-[2.5rem] rounded-md border-2 border-[var(--totk-light-green)]/40 bg-[var(--totk-dark-green)]/65 px-3 py-2 pr-10 text-left text-sm leading-normal focus:border-[var(--totk-light-green)]/75 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/30 disabled:cursor-not-allowed disabled:opacity-[0.62] md:min-h-12 md:px-4 md:py-3 md:pr-11 md:text-base";

/** Open list panel for custom selects (native `<option>` menus can’t be themed — OS paints brown). */
const GREEN_SELECT_LIST_CLASS = `absolute z-[85] mt-1 max-h-[min(50vh,16rem)] w-full overflow-auto overscroll-contain rounded-md py-0.5 ${CRAFTING_MODAL_DROPPANEL_CHROME}`;

type CraftingModalGreenSelectOption = { value: string; label: string };

/** Themed dropdown list — replaces `<select>` so the options list isn’t OS brown. */
function CraftingModalGreenSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  options: CraftingModalGreenSelectOption[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        id={id}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={GREEN_SELECT_TRIGGER_CLASS}
      >
        <span className={selectedLabel ? "text-[var(--totk-light-green)]" : "text-[var(--totk-mid-ocher)]"}>
          {selectedLabel ?? placeholder}
        </span>
        <i
          className={`fa-solid fa-chevron-${open ? "up" : "down"} pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--totk-light-green)]/85`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul role="listbox" aria-labelledby={id} className={GREEN_SELECT_LIST_CLASS}>
          {options.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--totk-mid-ocher)]">No options available</li>
          ) : (
            options.map((opt) => (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === opt.value}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors md:min-h-11 md:px-4 md:py-2.5 md:text-base ${
                    value === opt.value
                      ? "bg-[var(--totk-light-green)]/22 text-[var(--totk-light-green)]"
                      : "text-[var(--totk-light-green)] hover:bg-[var(--totk-light-green)]/14 hover:text-[var(--totk-ivory)]"
                  }`}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

/** Item craftingJobs vs permanent job, restricted voucher job, or unrestricted voucher (any recipe job). */
function characterMatchesCraftingJobsSnapshot(
  craftingJobs: string[] | undefined,
  c: Pick<ListChar, "job" | "jobVoucher" | "jobVoucherJob">
): boolean {
  const jobs = craftingJobs ?? [];
  if (!jobs.length) return true;
  if (c.jobVoucher && (c.jobVoucherJob == null || String(c.jobVoucherJob).trim() === "")) {
    return true;
  }
  if (c.jobVoucher && c.jobVoucherJob != null && String(c.jobVoucherJob).trim() !== "") {
    const jl = String(c.jobVoucherJob).trim().toLowerCase();
    return jobs.some((g) => String(g).trim().toLowerCase() === jl);
  }
  const jl = c.job.trim().toLowerCase();
  return jobs.some((g) => String(g).trim().toLowerCase() === jl);
}

/** Effective max stamina for UI (named-crafter validation uses max on the server). */
function effectiveMaxStamina(c: SearchChar): number {
  if (typeof c.maxStamina === "number" && Number.isFinite(c.maxStamina)) {
    return Math.max(0, c.maxStamina);
  }
  return Math.max(0, c.currentStamina);
}

/** True when a non-mod character cannot meet the recipe base cost at full stamina. */
function isBelowRecipeMaxStamina(c: SearchChar, recipeBaseCost: number): boolean {
  if (c.isModCharacter || recipeBaseCost <= 0) return false;
  return effectiveMaxStamina(c) < recipeBaseCost;
}

function canAcceptWithCharacter(row: CraftingRequestRow, c: ListChar): boolean {
  if (row.targetMode === "specific" && row.targetCharacterId) {
    if (String(c._id) !== String(row.targetCharacterId)) return false;
  }
  const rv = row.requesterCurrentVillage?.trim().toLowerCase() ?? "";
  if (rv) {
    const cv = (c.currentVillage ?? "").trim().toLowerCase();
    if (!cv || cv !== rv) return false;
  }
  const jobs = row.craftingJobsSnapshot ?? [];
  if (!characterMatchesCraftingJobsSnapshot(jobs, c)) return false;
  const cost = row.staminaToCraftSnapshot ?? 0;
  if (c.isModCharacter) return true;
  return c.currentStamina >= cost;
}

function resetFormState() {
  return {
    requesterCharacterName: "",
    craftItemName: "",
    selectedItemMeta: null as CraftItemOpt | null,
    itemQuery: "",
    targetMode: "open" as const,
    targetSearch: "",
    targetPick: null as SearchChar | null,
    providingAllMaterials: true,
    materialsDescription: "",
    paymentOffer: "",
    elixirTier: 1 as 1 | 2 | 3,
  };
}

function CraftingRequestsPageContent() {
  const { user, loading: sessionLoading } = useSession();
  const searchParams = useSearchParams();
  const requestFocusFromUrl = searchParams.get("request")?.trim() ?? "";
  const scrolledToRequestRef = useRef(false);

  const [openRequests, setOpenRequests] = useState<CraftingRequestRow[]>([]);
  const [loadingOpen, setLoadingOpen] = useState(true);
  const [openListError, setOpenListError] = useState<string | null>(null);

  const [myActivityOpen, setMyActivityOpen] = useState(false);
  const [myRequests, setMyRequests] = useState<CraftingRequestRow[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);

  const [formModalOpen, setFormModalOpen] = useState(false);
  const [myChars, setMyChars] = useState<ListChar[]>([]);

  const [requesterCharacterName, setRequesterCharacterName] = useState("");
  const [craftItemName, setCraftItemName] = useState("");
  const [selectedItemMeta, setSelectedItemMeta] = useState<CraftItemOpt | null>(null);
  const [itemQuery, setItemQuery] = useState("");
  const [itemOptions, setItemOptions] = useState<CraftItemOpt[]>([]);
  const [itemLoading, setItemLoading] = useState(false);

  const [targetMode, setTargetMode] = useState<"open" | "specific">("open");
  const [targetSearch, setTargetSearch] = useState("");
  const [targetResults, setTargetResults] = useState<SearchChar[]>([]);
  const [targetPick, setTargetPick] = useState<SearchChar | null>(null);
  const [targetLoading, setTargetLoading] = useState(false);

  const recipeBaseStaminaCost = useMemo(
    () => (selectedItemMeta ? parseStamina(selectedItemMeta.staminaToCraft) : 0),
    [selectedItemMeta]
  );

  const [providingAllMaterials, setProvidingAllMaterials] = useState(true);
  const [materialsDescription, setMaterialsDescription] = useState("");
  const [paymentOffer, setPaymentOffer] = useState("");
  const [elixirTier, setElixirTier] = useState<1 | 2 | 3>(1);
  const [elixirGuide, setElixirGuide] = useState<ElixirGuideResponse | null>(null);
  const [elixirGuideLoading, setElixirGuideLoading] = useState(false);
  const [elixirGuideFetchError, setElixirGuideFetchError] = useState<string | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [acceptFor, setAcceptFor] = useState<CraftingRequestRow | null>(null);
  const [acceptCharId, setAcceptCharId] = useState<string | null>(null);
  const [acceptSubmitting, setAcceptSubmitting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  /** In-flight dashboard claim (one-click) without opening the picker modal. */
  const [claimingRequestId, setClaimingRequestId] = useState<string | null>(null);

  const [itemPickerOpen, setItemPickerOpen] = useState(false);

  const [ocMaterialCheck, setOcMaterialCheck] = useState<OcMaterialCheckResult | null>(null);
  const [ocMaterialLoading, setOcMaterialLoading] = useState(false);

  /** When set, form submits PATCH to update this open request instead of POST create. */
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);

  /** Mixer elixir: commissioner inventory rows (`maxQuantity` = up to this much may be consumed at claim). */
  const [elixirStacks, setElixirStacks] = useState<Array<{ _id: string; itemName: string; quantity: number }>>(
    []
  );
  const [elixirStacksLoading, setElixirStacksLoading] = useState(false);
  const [elixirStacksError, setElixirStacksError] = useState<string | null>(null);
  const [elixirStackQtyById, setElixirStackQtyById] = useState<Record<string, number>>({});

  /** Includes `mixerCraftItemName` for mixer outputs so the API applies `/crafting brew` extra eligibility. */
  const mixerInventoryStacksFetchUrl = useMemo(() => {
    const cn = requesterCharacterName.trim();
    if (!cn) return "";
    const q = new URLSearchParams({ characterName: cn });
    const craft = craftItemName.trim();
    if (craft && isMixerOutputElixirName(craft)) q.set("mixerCraftItemName", craft);
    return `/api/crafting-requests/inventory-stacks?${q.toString()}`;
  }, [requesterCharacterName, craftItemName]);

  /** API returns stacks already filtered for mixer brew parity when `mixerCraftItemName` is passed. */
  const mixerEligibleStacks = useMemo(() => {
    if (!elixirGuide?.craftingMaterial?.length) return [];
    return elixirStacks;
  }, [elixirStacks, elixirGuide?.craftingMaterial?.length]);

  const mixerIngredientCommitTotal = useMemo(() => {
    let s = 0;
    for (const st of mixerEligibleStacks) {
      const v = elixirStackQtyById[st._id];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) s += v;
    }
    return s;
  }, [mixerEligibleStacks, elixirStackQtyById]);

  /**
   * Units required to satisfy every catalog line once (e.g. 1× Deep Firefly + 1× Any Monster Part → 2).
   * Same idea as bot brew: base ingredients, then up to MIXER_BREW_MAX_EXTRAS optional units (5 cap total).
   */
  const mixerCatalogBaseUnits = useMemo(() => {
    const mats = elixirGuide?.craftingMaterial;
    if (!mats?.length) return MIXER_BREW_BASE_ROLE_UNITS;
    const n = mixerRecipeMinimumTotalUnits(mats);
    return n > 0 ? n : MIXER_BREW_BASE_ROLE_UNITS;
  }, [elixirGuide]);

  const mixerCommittedExtras = Math.max(0, mixerIngredientCommitTotal - mixerCatalogBaseUnits);
  const mixerExtrasRemaining = Math.max(0, MIXER_BREW_MAX_EXTRAS - mixerCommittedExtras);
  const mixerExtrasCommittedDisplay = Math.min(MIXER_BREW_MAX_EXTRAS, mixerCommittedExtras);

  const mixerLineProgress = useMemo(
    () =>
      elixirGuide?.craftingMaterial?.length && mixerEligibleStacks.length
        ? computeMixerRecipeLineProgress(
            elixirGuide.craftingMaterial,
            mixerEligibleStacks,
            elixirStackQtyById
          )
        : [],
    [elixirGuide?.craftingMaterial, mixerEligibleStacks, elixirStackQtyById]
  );

  useEffect(() => {
    const mats = elixirGuide?.craftingMaterial;
    if (elixirGuide && Array.isArray(mats) && mats.length === 0) {
      setElixirStackQtyById({});
      return;
    }
    if (!mats?.length) return;
    const allowed = new Set(elixirStacks.map((s) => s._id));
    setElixirStackQtyById((prev) => {
      const filtered: Record<string, number> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (allowed.has(k)) filtered[k] = v;
      }
      let trimmed = trimMixerSelectionsToIngredientBudget(filtered, MIXER_BREW_MAX_INGREDIENT_UNITS);
      trimmed = trimMixerSelectionsToIngredientBudget(
        computeMixerAutoPickedQuantities(mats, elixirStacks, trimmed),
        MIXER_BREW_MAX_INGREDIENT_UNITS
      );
      const same =
        Object.keys(trimmed).length === Object.keys(prev).length &&
        Object.entries(trimmed).every(([k, v]) => prev[k] === v);
      return same ? prev : trimmed;
    });
  }, [elixirStacks, elixirGuide]);

  const loadOpenRequests = useCallback(async () => {
    if (!user?.id) return;
    setLoadingOpen(true);
    setOpenListError(null);
    try {
      const res = await fetch("/api/crafting-requests", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setOpenRequests(data.requests ?? []);
    } catch (e) {
      setOpenListError(e instanceof Error ? e.message : "Failed to load");
      setOpenRequests([]);
    } finally {
      setLoadingOpen(false);
    }
  }, [user?.id]);

  const loadMyRequests = useCallback(async () => {
    if (!user?.id) return;
    setLoadingMine(true);
    try {
      const res = await fetch("/api/crafting-requests?mine=1", { credentials: "include" });
      const data = await res.json();
      if (res.ok) setMyRequests(data.requests ?? []);
    } catch {
      setMyRequests([]);
    } finally {
      setLoadingMine(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    loadOpenRequests();
  }, [user?.id, loadOpenRequests]);

  /** Deep link from Discord / embed: `?request=` = commission code (e.g. K384521) or legacy Mongo id */
  useEffect(() => {
    if (!requestFocusFromUrl || scrolledToRequestRef.current) return;
    if (loadingOpen) return;
    const raw = requestFocusFromUrl.trim();
    let el = document.getElementById(`crafting-open-${raw}`);
    if (!el && /^[A-Za-z][0-9]{6}$/.test(raw)) {
      const code = raw.charAt(0).toUpperCase() + raw.slice(1);
      el = document.querySelector(`[data-commission-id="${code}"]`);
    }
    if (el) {
      const t = window.setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
      scrolledToRequestRef.current = true;
      return () => window.clearTimeout(t);
    }
  }, [requestFocusFromUrl, loadingOpen, openRequests]);

  useEffect(() => {
    if (!user?.id || !myActivityOpen) return;
    loadMyRequests();
  }, [user?.id, myActivityOpen, loadMyRequests]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const res = await fetch("/api/characters/list", { credentials: "include" });
        const data = await res.json();
        if (res.ok && data.characters) setMyChars(data.characters);
      } catch {
        setMyChars([]);
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!itemPickerOpen || craftItemName || !formModalOpen) {
      if (!itemPickerOpen) setItemOptions([]);
      return;
    }
    const q = itemQuery.trim();
    const delay = q.length > 0 ? 200 : 0;
    const t = setTimeout(async () => {
      setItemLoading(true);
      try {
        const url =
          q.length > 0
            ? `/api/crafting-requests/items?q=${encodeURIComponent(q)}&limit=30`
            : `/api/crafting-requests/items?limit=30`;
        const res = await fetch(url, { credentials: "include" });
        const data = await res.json();
        if (res.ok) setItemOptions(data.items ?? []);
      } catch {
        setItemOptions([]);
      } finally {
        setItemLoading(false);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [itemQuery, itemPickerOpen, craftItemName, formModalOpen]);

  useEffect(() => {
    if (targetMode !== "specific" || !formModalOpen || !craftItemName || !selectedItemMeta) {
      setTargetResults([]);
      return;
    }
    const jobs = (selectedItemMeta.craftingJobs ?? []).filter(Boolean);
    if (!jobs.length) {
      setTargetResults([]);
      return;
    }
    const q = targetSearch.trim();
    const browseByJobs = q.length === 0;
    const searchOk = q.length >= 2 || (jobs.length > 0 && q.length >= 1);
    if (!browseByJobs && !searchOk) {
      setTargetResults([]);
      return;
    }
    const delay = browseByJobs ? 0 : q.length >= 2 ? 220 : 160;
    const t = setTimeout(async () => {
      setTargetLoading(true);
      try {
        const params = new URLSearchParams();
        if (q.length > 0) params.set("q", q);
        for (const j of jobs) params.append("job", j);
        params.set("limit", "24");
        const reqOc = myChars.find(
          (c) => c.name.trim().toLowerCase() === requesterCharacterName.trim().toLowerCase()
        );
        const commissionVillage = reqOc?.currentVillage?.trim();
        if (commissionVillage) params.set("village", commissionVillage);
        const res = await fetch(`/api/characters/search?${params.toString()}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (res.ok) setTargetResults(data.characters ?? []);
      } catch {
        setTargetResults([]);
      } finally {
        setTargetLoading(false);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [
    targetSearch,
    targetMode,
    formModalOpen,
    craftItemName,
    selectedItemMeta,
    requesterCharacterName,
    myChars,
  ]);

  useEffect(() => {
    if (!formModalOpen || !craftItemName.trim() || !requesterCharacterName.trim()) {
      setOcMaterialCheck(null);
      setOcMaterialLoading(false);
      return;
    }
    const t = setTimeout(async () => {
      setOcMaterialLoading(true);
      setOcMaterialCheck(null);
      try {
        const params = new URLSearchParams({
          craftItemName: craftItemName.trim(),
          requesterCharacterName: requesterCharacterName.trim(),
        });
        const res = await fetch(`/api/crafting-requests/material-check?${params}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Check failed");
        setOcMaterialCheck({
          hasRecipe: Boolean(data.hasRecipe),
          allMaterialsMet: Boolean(data.allMaterialsMet),
          lines: Array.isArray(data.lines) ? data.lines : [],
        });
      } catch {
        setOcMaterialCheck(null);
      } finally {
        setOcMaterialLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [formModalOpen, craftItemName, requesterCharacterName]);

  useEffect(() => {
    if (!formModalOpen || !craftItemName.trim() || !selectedItemMeta?.isElixir) {
      setElixirGuide(null);
      setElixirGuideLoading(false);
      setElixirGuideFetchError(null);
      return;
    }
    setElixirGuide(null);
    setElixirGuideFetchError(null);
    setElixirGuideLoading(true);
    let cancelled = false;
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/crafting-requests/elixir-guide?craftItemName=${encodeURIComponent(craftItemName.trim())}&targetLevel=${elixirTier}`,
            { credentials: "include" }
          );
          let data: (Partial<ElixirGuideResponse> & { error?: string; recipeIncomplete?: boolean }) | null =
            null;
          try {
            data = (await res.json()) as Partial<ElixirGuideResponse> & {
              error?: string;
              recipeIncomplete?: boolean;
            };
          } catch {
            data = null;
          }
          if (cancelled) return;
          if (!res.ok) {
            const msg =
              (data && typeof data.error === "string" && data.error.trim()) ||
              (res.status === 401
                ? "You were signed out — refresh the page and log in again."
                : res.status === 404
                  ? "That elixir was not found in the craftable catalog."
                  : "Could not load mixer recipe from the server.");
            setElixirGuideFetchError(msg);
            setElixirGuide(null);
            return;
          }
          if (!data || !Array.isArray(data.craftingMaterial)) {
            setElixirGuideFetchError(
              "Mixer recipe response was unreadable. Change potency tier or close and reopen the form to retry."
            );
            setElixirGuide(null);
            return;
          }
          const rawMats = data.craftingMaterial;
          const craftingMaterial = rawMats
            .map((m) => {
              if (!m || typeof m !== "object") return null;
              const itemName = String((m as { itemName?: unknown }).itemName ?? "").trim();
              const quantity = Math.floor(Number((m as { quantity?: unknown }).quantity));
              if (!itemName || !Number.isFinite(quantity) || quantity <= 0) return null;
              return { itemName, quantity };
            })
            .filter(Boolean) as Array<{ itemName: string; quantity: number }>;
          setElixirGuide({
            craftItemName: String(data.craftItemName ?? craftItemName.trim()),
            targetLevel:
              typeof data.targetLevel === "number" && data.targetLevel >= 1 && data.targetLevel <= 3
                ? data.targetLevel
                : elixirTier,
            tierLabel: String(data.tierLabel ?? ""),
            craftingMaterial,
            recipeIncomplete: Boolean(data.recipeIncomplete) || craftingMaterial.length === 0,
          });
          setElixirGuideFetchError(null);
        } catch {
          if (!cancelled) {
            setElixirGuideFetchError(
              "Network error while loading the mixer recipe. Check your connection and try changing potency tier to retry."
            );
            setElixirGuide(null);
          }
        } finally {
          if (!cancelled) setElixirGuideLoading(false);
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [formModalOpen, craftItemName, selectedItemMeta?.isElixir, elixirTier]);

  useEffect(() => {
    if (!targetPick || !selectedItemMeta) return;
    const jobs = selectedItemMeta.craftingJobs ?? [];
    if (jobs.length > 0 && !characterMatchesCraftingJobsSnapshot(jobs, targetPick)) {
      setTargetPick(null);
      setTargetSearch("");
    }
  }, [selectedItemMeta, targetPick]);

  /** Block Post/Save until inventory satisfies catalog recipe (when recipe exists). */
  const materialsSubmitBlocked = useMemo(() => {
    if (!craftItemName.trim() || !requesterCharacterName.trim()) return false;
    if (ocMaterialLoading) return true;
    if (!ocMaterialCheck) return false;
    if (!ocMaterialCheck.hasRecipe) return false;
    return !ocMaterialCheck.allMaterialsMet;
  }, [craftItemName, requesterCharacterName, ocMaterialLoading, ocMaterialCheck]);

  const eligibleAcceptors = useMemo(() => {
    if (!acceptFor || !myChars.length) return [];
    return myChars.filter((c) => canAcceptWithCharacter(acceptFor, c));
  }, [acceptFor, myChars]);

  /** Open-board rows your roster can claim (job + stamina; named posts only for the target OC). */
  const requestIdsYouCanAccept = useMemo(() => {
    if (!user?.id || !myChars.length) return new Set<string>();
    const ids = new Set<string>();
    for (const row of openRequests) {
      if (row.requesterDiscordId === user.id) continue;
      if (myChars.some((c) => canAcceptWithCharacter(row, c))) ids.add(row._id);
    }
    return ids;
  }, [openRequests, myChars, user?.id]);

  useEffect(() => {
    if (!acceptFor) {
      setAcceptCharId(null);
      return;
    }
    const eligible = myChars.filter((c) => canAcceptWithCharacter(acceptFor, c));
    setAcceptCharId(eligible[0]?._id ?? null);
  }, [acceptFor, myChars]);

  useEffect(() => {
    if (!formModalOpen || !selectedItemMeta?.isElixir || !mixerInventoryStacksFetchUrl) {
      return;
    }
    let cancelled = false;
    (async () => {
      setElixirStacksLoading(true);
      setElixirStacksError(null);
      try {
        const res = await fetch(mixerInventoryStacksFetchUrl, { credentials: "include" });
        const data = (await res.json()) as {
          stacks?: Array<{ _id: string; itemName: string; quantity: number }>;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" && data.error.trim()
              ? data.error
              : "Failed to load inventory stacks."
          );
        }
        if (!cancelled) {
          setElixirStacks(Array.isArray(data.stacks) ? data.stacks : []);
          setElixirStacksError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setElixirStacks([]);
          setElixirStacksError(
            e instanceof Error && e.message
              ? e.message
              : "Could not load this OC's inventory. Try another character or refresh the page."
          );
        }
      } finally {
        if (!cancelled) setElixirStacksLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formModalOpen, selectedItemMeta?.isElixir, mixerInventoryStacksFetchUrl]);

  const refreshAfterMutation = useCallback(async () => {
    await loadOpenRequests();
    if (myActivityOpen) await loadMyRequests();
  }, [loadOpenRequests, loadMyRequests, myActivityOpen]);

  const closeFormModal = () => {
    setFormModalOpen(false);
    setFormError(null);
    setEditingRequestId(null);
    const r = resetFormState();
    setRequesterCharacterName(r.requesterCharacterName);
    setCraftItemName(r.craftItemName);
    setSelectedItemMeta(r.selectedItemMeta);
    setItemQuery(r.itemQuery);
    setTargetMode(r.targetMode);
    setTargetSearch(r.targetSearch);
    setTargetPick(r.targetPick);
    setProvidingAllMaterials(r.providingAllMaterials);
    setMaterialsDescription(r.materialsDescription);
    setPaymentOffer(r.paymentOffer);
    setElixirTier(r.elixirTier);
    setElixirGuide(null);
    setElixirGuideLoading(false);
    setElixirGuideFetchError(null);
    setElixirStacksError(null);
    setItemPickerOpen(false);
    setOcMaterialCheck(null);
    setOcMaterialLoading(false);
    setElixirStacks([]);
    setElixirStacksLoading(false);
    setElixirStackQtyById({});
  };

  const openEditRequest = useCallback(
    async (row: CraftingRequestRow) => {
      if (!user?.id || row.requesterDiscordId !== user.id || row.status !== "open") return;
      setFormError(null);
      setEditingRequestId(row.commissionID || row._id);
      setRequesterCharacterName(row.requesterCharacterName);
      setCraftItemName(row.craftItemName);
      const isEx = isMixerOutputElixirName(row.craftItemName);
      setSelectedItemMeta({
        itemName: row.craftItemName,
        craftingJobs: row.craftingJobsSnapshot,
        staminaToCraft: row.staminaToCraftSnapshot,
        isElixir: isEx,
        elixirLevel: null,
      });
      setTargetMode(row.targetMode);
      setProvidingAllMaterials(row.providingAllMaterials);
      setMaterialsDescription(row.materialsDescription ?? "");
      setPaymentOffer(row.paymentOffer ?? "");
      const tier = row.elixirTier;
      setElixirTier(
        isEx && (tier === 2 || tier === 3) ? tier : isEx ? 1 : 1
      );
      setElixirGuide(null);
      setElixirGuideFetchError(null);
      setItemQuery("");
      setItemOptions([]);
      setItemPickerOpen(false);
      setTargetSearch("");
      setTargetResults([]);

      if (row.targetMode === "specific" && row.targetCharacterId) {
        try {
          const res = await fetch(
            `/api/characters/${row.targetCharacterId}?skipHelpWanted=true`,
            { credentials: "include" }
          );
          const payload = (await res.json()) as Record<string, unknown>;
          const data =
            payload.character && typeof payload.character === "object"
              ? (payload.character as Record<string, unknown>)
              : payload;
          if (res.ok && payload && !("error" in payload)) {
            const pick: SearchChar = {
              _id: String(data._id ?? row.targetCharacterId),
              name: String(data.name ?? row.targetCharacterName ?? ""),
              job: String(data.job ?? ""),
              userId: String(data.userId ?? ""),
              homeVillage: String(data.homeVillage ?? row.targetCharacterHomeVillage ?? ""),
              currentStamina: Math.max(0, Number(data.currentStamina) || 0),
              isModCharacter: Boolean(data.isModCharacter),
            };
            if (data.maxStamina != null && String(data.maxStamina) !== "") {
              const m = Number(data.maxStamina);
              if (Number.isFinite(m)) pick.maxStamina = Math.max(0, m);
            }
            setTargetPick(pick);
          } else {
            setTargetPick(null);
          }
        } catch {
          setTargetPick(null);
        }
      } else {
        setTargetPick(null);
      }
      const qtyInit: Record<string, number> = {};
      for (const s of row.elixirMaterialSelections ?? []) {
        qtyInit[String(s.inventoryDocumentId)] = Math.max(1, Math.floor(Number(s.maxQuantity)) || 1);
      }
      setElixirStackQtyById(trimMixerSelectionsToIngredientBudget(qtyInit, MIXER_BREW_MAX_INGREDIENT_UNITS));
      setElixirStacks([]);
      setElixirStacksLoading(false);
      setElixirStacksError(null);
      setFormModalOpen(true);
    },
    [user?.id]
  );

  const handleSelectItem = (it: CraftItemOpt) => {
    setCraftItemName(it.itemName);
    setSelectedItemMeta(it);
    if (it.isElixir) {
      const lv = it.elixirLevel;
      setElixirTier(lv === 2 || lv === 3 ? lv : 2);
    } else {
      setElixirTier(1);
    }
    setElixirGuide(null);
    setElixirGuideFetchError(null);
    setItemQuery("");
    setItemOptions([]);
    setItemPickerOpen(false);
    setTargetPick(null);
    setTargetSearch("");
    setTargetResults([]);
    setElixirStacks([]);
    setElixirStacksError(null);
    setElixirStackQtyById({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!user) {
      setFormError("You must be logged in.");
      return;
    }
    if (!craftItemName.trim()) {
      setFormError("Choose a craftable item first.");
      return;
    }
    if (!requesterCharacterName.trim()) {
      setFormError("Choose your OC (who the item is for).");
      return;
    }
    if (targetMode === "specific" && !targetPick) {
      setFormError("Search and select a crafter whose job matches this item.");
      return;
    }
    if (
      targetMode === "specific" &&
      targetPick &&
      selectedItemMeta?.craftingJobs?.length &&
      !characterMatchesCraftingJobsSnapshot(selectedItemMeta.craftingJobs, targetPick)
    ) {
      setFormError("That character's job can't craft this item — pick someone else or use Open.");
      return;
    }

    if (materialsSubmitBlocked) {
      setFormError(
        "Add every recipe material to your character's inventory first — you can't post until the checklist is green."
      );
      return;
    }

    let elixirMaterialSelections: Array<{ inventoryDocumentId: string; maxQuantity: number }> | undefined;
    if (selectedItemMeta?.isElixir) {
      const lines: Array<{ inventoryDocumentId: string; maxQuantity: number }> = [];
      for (const [id, raw] of Object.entries(elixirStackQtyById)) {
        const n = Math.floor(Number(raw));
        if (!Number.isFinite(n) || n <= 0) continue;
        lines.push({ inventoryDocumentId: id, maxQuantity: n });
      }
      if (lines.length === 0) {
        setFormError(
          `For mixer elixirs, commit units from inventory stacks so every recipe line is covered (typically 1 critter + 1 monster part, then up to ${MIXER_BREW_MAX_EXTRAS} extras) — ${MIXER_BREW_MAX_INGREDIENT_UNITS} units max total.`
        );
        return;
      }
      const sumMax = lines.reduce((a, l) => a + l.maxQuantity, 0);
      if (sumMax > MIXER_BREW_MAX_INGREDIENT_UNITS) {
        setFormError(mixerBrewOverBudgetMessage(sumMax));
        return;
      }
      const guideMats = elixirGuide?.craftingMaterial;
      if (Array.isArray(guideMats) && guideMats.length > 0) {
        const recipeMin = mixerRecipeMinimumTotalUnits(guideMats);
        if (recipeMin > 0 && sumMax < recipeMin) {
          setFormError(mixerBrewTooFewUnitsMessage(sumMax, recipeMin));
          return;
        }
      }
      elixirMaterialSelections = lines;
    }

    setSubmitting(true);
    try {
      const payload = {
        requesterCharacterName: requesterCharacterName.trim(),
        craftItemName: craftItemName.trim(),
        targetMode,
        targetCharacterId: targetMode === "specific" && targetPick ? targetPick._id : undefined,
        providingAllMaterials,
        materialsDescription,
        paymentOffer,
        elixirTier: selectedItemMeta?.isElixir ? elixirTier : undefined,
        ...(elixirMaterialSelections ? { elixirMaterialSelections } : {}),
      };
      const editTargetId = editingRequestId?.trim();
      const isEdit = Boolean(editTargetId);
      const res = await fetch(
        isEdit && editTargetId
          ? `/api/crafting-requests/${encodeURIComponent(editTargetId)}`
          : "/api/crafting-requests",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (isEdit ? "Failed to save" : "Failed to submit"));

      closeFormModal();
      await refreshAfterMutation();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (row: CraftingRequestRow) => {
    if (
      !confirm(
        "Delete this commission? It will be removed from the board and the Discord post will be deleted."
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/crafting-requests/${encodeURIComponent(row.commissionID || row._id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      await refreshAfterMutation();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleCancel = async (row: CraftingRequestRow) => {
    if (!confirm("Cancel this open request?")) return;
    try {
      const res = await fetch(
        `/api/crafting-requests/${encodeURIComponent(row.commissionID || row._id)}/cancel`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Cancel failed");
      await refreshAfterMutation();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Cancel failed");
    }
  };

  const handleAccept = async () => {
    if (!acceptFor || !acceptCharId || !user) return;
    setAcceptError(null);
    setAcceptSubmitting(true);
    try {
      const res = await fetch(
        `/api/crafting-requests/${encodeURIComponent(acceptFor.commissionID || acceptFor._id)}/accept`,
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ acceptorCharacterId: acceptCharId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Claim failed");
      setAcceptFor(null);
      setAcceptCharId(null);
      await refreshAfterMutation();
    } catch (e) {
      setAcceptError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setAcceptSubmitting(false);
    }
  };

  const handleClaimDirect = async (row: CraftingRequestRow, charId: string) => {
    if (!user?.id) return;
    setClaimingRequestId(row._id);
    try {
      const res = await fetch(
        `/api/crafting-requests/${encodeURIComponent(row.commissionID || row._id)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ acceptorCharacterId: charId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Claim failed");
      await refreshAfterMutation();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setClaimingRequestId(null);
    }
  };

  useEffect(() => {
    if (!formModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFormModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [formModalOpen]);

  useEffect(() => {
    if (!formModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [formModalOpen]);

  if (sessionLoading) {
    return (
      <div className="h-full flex min-h-[50vh] items-center justify-center p-4">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl text-[var(--totk-light-green)] mb-4 block" />
          <p className="text-[var(--botw-pale)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-full px-3 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] sm:p-6 md:p-8">
        <div className="mx-auto max-w-lg text-center">
          <div className="mb-6 flex items-center justify-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative header SVG */}
            <img alt="" className="h-5 w-auto sm:h-6" src="/Side=Left.svg" />
            <h1 className="text-2xl font-bold text-[var(--totk-light-ocher)]">Crafting requests</h1>
            {/* eslint-disable-next-line @next/next/no-img-element -- decorative header SVG */}
            <img alt="" className="h-5 w-auto sm:h-6" src="/Side=Right.svg" />
          </div>
          <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/90 to-[var(--botw-warm-black)] p-8 shadow-xl">
            <i className="fa-solid fa-hammer mb-4 text-3xl text-[var(--totk-light-green)]" aria-hidden />
            <p className="mb-6 text-[var(--botw-pale)]">
              Log in to browse open commissions, claim them here with your OCs, and post new requests to the
              community board.
            </p>
            <a
              href="/api/auth/discord"
              className="inline-flex items-center gap-2 rounded-lg bg-[#5865F2] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#4752C4]"
            >
              <i className="fa-brands fa-discord" aria-hidden />
              Login with Discord
            </a>
          </div>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--botw-border)] bg-[var(--botw-deep)]/90 px-3 py-2.5 text-[var(--botw-pale)] shadow-inner placeholder:text-[var(--botw-pale)]/50 focus:border-[var(--totk-light-green)] focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-green)]/40";

  /** Modal-only: brown panel + pale text (notes, payment — blends into modal chrome). */
  const modalFieldClass =
    "w-full rounded-md border border-[var(--totk-dark-ocher)]/55 bg-[var(--botw-black)]/28 px-3 py-2 text-sm leading-snug text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-200)]/85 focus:border-[var(--totk-light-green)]/65 focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-green)]/30 md:min-h-12 md:px-4 md:py-3 md:text-base";
  /** Shared shell for green modal controls (search + native selects must match). */
  const modalGreenControlShell =
    "rounded-md border-2 border-[var(--totk-light-green)]/40 bg-[var(--totk-dark-green)]/65";
  /** Search rows that open dark-green suggestion lists. */
  const modalGreenSearchClass = `w-full ${modalGreenControlShell} px-3 py-2 text-sm leading-snug text-[var(--totk-light-green)] placeholder:text-[var(--totk-mid-ocher)] caret-[var(--totk-light-green)] focus:border-[var(--totk-light-green)]/75 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/30 md:min-h-12 md:px-4 md:py-3 md:text-base`;
  const modalLabelClass =
    "mb-1 block text-sm font-medium text-[var(--totk-light-ocher)] md:mb-1.5 md:text-[0.9375rem]";
  const modalHintClass =
    "text-xs leading-snug text-[var(--botw-pale)]/78 md:text-[0.8125rem] md:leading-relaxed";

  return (
    <div className="min-h-full w-full pb-[max(4rem,env(safe-area-inset-bottom,0px))]">
      <div className="relative mx-auto max-w-6xl px-3 pt-4 sm:px-4 sm:pt-6 md:px-5 md:pt-8 lg:px-6 lg:pt-10">
        <div className="mb-6 overflow-hidden rounded-2xl border-2 border-[var(--totk-dark-ocher)]/80 bg-gradient-to-br from-[var(--totk-brown)]/95 via-[var(--botw-warm-black)] to-[var(--botw-deep)] shadow-[0_8px_32px_rgba(0,0,0,0.35)] sm:mb-8">
          <div className="border-b border-[var(--botw-border)]/60 bg-black/20 px-4 py-4 sm:px-5 sm:py-5 md:px-8 md:py-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--totk-light-green)]/15 ring-1 ring-[var(--totk-light-green)]/30 sm:h-14 sm:w-14">
                  <i className="fa-solid fa-hammer text-xl text-[var(--totk-light-green)] sm:text-2xl" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" className="hidden h-4 w-auto sm:inline sm:h-5" src="/Side=Left.svg" />
                    <h1 className="text-[1.35rem] font-bold tracking-tight text-[var(--totk-light-ocher)] min-[400px]:text-2xl md:text-3xl">
                      Crafting requests
                    </h1>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" className="hidden h-4 w-auto sm:inline sm:h-5" src="/Side=Right.svg" />
                  </div>
                  <p className="max-w-xl text-sm leading-relaxed text-[var(--botw-pale)] md:text-base">
                    Open commissions from the village board (and Discord).{" "}
                    <strong className="font-semibold text-[var(--botw-cream)]">
                      Claim here with one of your OCs
                    </strong>{" "}
                    when the job and base stamina match—or work it out with the requester in RP if boosts
                    change the numbers.
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end md:gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRequestId(null);
                    setFormModalOpen(true);
                    setFormError(null);
                  }}
                  className="inline-flex min-h-[2.75rem] w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-[var(--totk-light-green)] px-5 py-3 text-sm font-bold text-black shadow-lg shadow-black/20 transition hover:brightness-110 active:scale-[0.98] sm:w-auto md:min-h-[3rem] md:px-6 md:text-base"
                >
                  <i className="fa-solid fa-plus" aria-hidden />
                  Post a request
                </button>
                <button
                  type="button"
                  onClick={() => setMyActivityOpen((v) => !v)}
                  aria-expanded={myActivityOpen}
                  aria-controls="crafting-my-activity-panel"
                  className={`group inline-flex min-h-[2.75rem] w-full min-w-0 touch-manipulation items-center justify-center gap-2.5 rounded-xl border-2 px-4 py-3 text-sm font-bold shadow-md shadow-black/15 transition active:scale-[0.98] sm:w-auto sm:min-w-[10.5rem] sm:px-5 md:min-h-[3rem] md:px-6 md:text-base ${
                    myActivityOpen
                      ? "border-[var(--totk-light-green)]/80 bg-gradient-to-br from-[var(--totk-light-green)]/18 to-[var(--totk-light-green)]/6 text-[var(--totk-light-green)] ring-1 ring-[var(--totk-light-green)]/25"
                      : "border-[var(--totk-dark-ocher)]/55 bg-[var(--botw-deep)]/70 text-[var(--botw-cream)] hover:border-[var(--totk-light-ocher)]/45 hover:bg-[var(--botw-deep)]/90"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                      myActivityOpen
                        ? "bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]"
                        : "bg-black/25 text-[var(--totk-light-ocher)] group-hover:text-[var(--totk-light-green)]"
                    }`}
                  >
                    <i className="fa-solid fa-clipboard-list text-sm" aria-hidden />
                  </span>
                  <span className="flex flex-col items-start leading-tight">
                    <span>My activity</span>
                    <span
                      className={`text-[10px] font-medium uppercase tracking-wide ${
                        myActivityOpen ? "text-[var(--totk-light-green)]/75" : "text-[var(--botw-pale)]/65"
                      }`}
                    >
                      {myActivityOpen ? "Hide panel" : "Posts & claims"}
                    </span>
                  </span>
                  <i
                    className={`fa-solid fa-chevron-down text-xs opacity-70 transition duration-200 ${myActivityOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs sm:mt-5 sm:gap-3 md:text-sm">
              <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 text-[var(--botw-pale)] ring-1 ring-white/10">
                <i className="fa-solid fa-list-ul shrink-0 text-[var(--totk-light-green)]" aria-hidden />
                <span className="min-w-0">
                  <strong className="text-[var(--botw-cream)]">{openRequests.length}</strong> open
                </span>
              </span>
              <span className="inline-flex max-w-full items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 text-[var(--botw-pale)] ring-1 ring-white/10">
                <i className="fa-brands fa-discord shrink-0 text-[#5865F2]" aria-hidden />
                <span className="min-w-0 leading-snug">
                  <span className="hidden min-[380px]:inline">Announced on </span>community board
                </span>
              </span>
            </div>
          </div>
        </div>

        {myActivityOpen && (
          <section
            id="crafting-my-activity-panel"
            className="relative mb-10 overflow-hidden rounded-2xl border-2 border-[var(--totk-dark-ocher)]/45 bg-gradient-to-b from-[var(--botw-panel)]/95 via-[var(--botw-deep)]/88 to-[var(--botw-warm-black)]/75 shadow-[0_8px_32px_rgba(0,0,0,0.28)] ring-1 ring-black/20"
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.06]"
              style={{
                background:
                  "radial-gradient(900px 280px at 10% -20%, var(--totk-light-green), transparent 55%), radial-gradient(700px 200px at 100% 0%, var(--totk-light-ocher), transparent 50%)",
              }}
            />
            <div className="relative border-b border-[var(--botw-border)]/50 bg-gradient-to-r from-black/20 via-black/12 to-transparent px-4 py-4 sm:px-5 md:px-6 md:py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--totk-light-green)]/14 ring-1 ring-[var(--totk-light-green)]/30 shadow-inner">
                    <i className="fa-solid fa-user-clock text-xl text-[var(--totk-light-green)]" aria-hidden />
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1">
                      <h2 className="text-lg font-bold tracking-tight text-[var(--totk-light-ocher)] md:text-xl">
                        Your requests &amp; acceptances
                      </h2>
                      {!loadingMine && myRequests.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--totk-light-green)]/15 px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-[var(--totk-light-green)] ring-1 ring-[var(--totk-light-green)]/25">
                          {myRequests.length}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 max-w-prose text-xs leading-relaxed text-[var(--botw-pale)]/88 md:text-sm">
                      Commissions you posted and jobs you claimed stay listed here.
                    </p>
                  </div>
                </div>
                {!loadingMine && myRequests.length > 0 ? (
                  <span className="inline-flex w-fit shrink-0 items-center gap-2 rounded-full border border-[var(--botw-border)]/55 bg-black/28 px-3.5 py-1.5 text-[11px] font-semibold text-[var(--botw-cream)] shadow-sm">
                    <i className="fa-solid fa-list-check text-[var(--totk-light-ocher)]" aria-hidden />
                    {myRequests.length} {myRequests.length === 1 ? "entry" : "entries"}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="relative p-3 sm:p-4 md:p-6">
              {loadingMine ? (
                <div className="flex min-h-[8.5rem] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--botw-border)]/70 bg-black/20 py-10">
                  <i className="fa-solid fa-spinner fa-spin text-2xl text-[var(--totk-light-green)]" aria-hidden />
                  <p className="text-sm text-[var(--botw-pale)]">Loading your activity…</p>
                </div>
              ) : myRequests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--botw-border)]/60 bg-black/15 px-5 py-10 text-center">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--totk-light-ocher)]/10 ring-1 ring-[var(--totk-light-ocher)]/20">
                    <i className="fa-solid fa-scroll text-[var(--totk-light-ocher)]/90" aria-hidden />
                  </div>
                  <p className="text-sm font-medium text-[var(--botw-cream)]">Nothing here yet</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--botw-pale)]/85">
                    Post a commission or claim one from the open board — it will show up in this list.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3 sm:gap-4">
                  {myRequests.map((row) => {
                    const youPosted = row.requesterDiscordId === user?.id;
                    const statusLabel =
                      row.status === "open"
                        ? "Open"
                        : row.status === "accepted"
                          ? "Accepted"
                          : row.status;
                    const accentClass = youPosted
                      ? "from-[var(--totk-light-ocher)]/35"
                      : "from-[var(--totk-light-green)]/40";
                    return (
                      <li key={row._id}>
                        <div
                          className={`group relative overflow-hidden rounded-2xl border border-[var(--totk-dark-ocher)]/40 bg-gradient-to-br from-[var(--botw-deep)]/80 to-[var(--botw-warm-black)]/55 shadow-[0_2px_16px_rgba(0,0,0,0.2)] ring-1 ring-black/15 transition hover:border-[var(--totk-light-green)]/30 hover:ring-[var(--totk-light-green)]/10`}
                        >
                          <div
                            className={`pointer-events-none absolute left-0 top-0 h-full w-1 bg-gradient-to-b ${accentClass} to-transparent`}
                            aria-hidden
                          />
                          <div className="flex flex-col gap-4 p-4 pl-5 sm:p-5 md:flex-row md:items-stretch md:justify-between md:gap-5 md:pl-6">
                            <div className="min-w-0 flex-1 space-y-3">
                              <div className="flex flex-wrap items-start justify-between gap-2 gap-y-2">
                                <h3 className="text-base font-bold leading-snug text-[var(--botw-cream)] sm:text-lg">
                                  {row.craftItemName}
                                </h3>
                                <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                                  <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                                      row.status === "open"
                                        ? "bg-emerald-950/75 text-emerald-100 ring-1 ring-emerald-400/35"
                                        : row.status === "accepted"
                                          ? "bg-sky-950/75 text-sky-100 ring-1 ring-sky-400/35"
                                          : "bg-zinc-900/85 text-zinc-300 ring-1 ring-zinc-600/35"
                                    }`}
                                  >
                                    {row.status === "open" ? (
                                      <i className="fa-solid fa-circle-notch text-[9px] opacity-90" aria-hidden />
                                    ) : row.status === "accepted" ? (
                                      <i className="fa-solid fa-check text-[9px]" aria-hidden />
                                    ) : null}
                                    {statusLabel}
                                  </span>
                                  <span
                                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                                      youPosted
                                        ? "bg-[var(--totk-light-ocher)]/18 text-[var(--totk-light-ocher)] ring-1 ring-[var(--totk-light-ocher)]/25"
                                        : "bg-[var(--totk-light-green)]/14 text-[var(--totk-light-green)] ring-1 ring-[var(--totk-light-green)]/22"
                                    }`}
                                  >
                                    <i
                                      className={`fa-solid ${youPosted ? "fa-paper-plane" : "fa-hand-holding-heart"} text-[10px] opacity-90`}
                                      aria-hidden
                                    />
                                    {youPosted ? "You posted" : "You accepted"}
                                  </span>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--botw-border)]/35 pt-2.5 text-[11px] text-[var(--botw-pale)]/80 sm:text-xs">
                                <span className="inline-flex items-center gap-1.5 tabular-nums text-[var(--botw-pale)]/85">
                                  <i className="fa-regular fa-calendar shrink-0 text-[var(--totk-light-ocher)]/90" aria-hidden />
                                  {row.createdAt
                                    ? new Date(row.createdAt).toLocaleString(undefined, {
                                        dateStyle: "medium",
                                        timeStyle: "short",
                                      })
                                    : "—"}
                                </span>
                              </div>
                            </div>
                            {youPosted && row.status === "open" && user?.id ? (
                              <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--botw-border)]/40 pt-3 md:w-[min(100%,13.5rem)] md:border-l md:border-t-0 md:pl-5 md:pt-0">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--botw-pale)]/55 md:pt-1">
                                  Manage
                                </p>
                                <div className="flex flex-col gap-2">
                                  <button
                                    type="button"
                                    onClick={() => void openEditRequest(row)}
                                    className="inline-flex min-h-[2.5rem] w-full items-center justify-center gap-2 rounded-xl border border-[var(--totk-light-green)]/40 bg-[var(--totk-light-green)]/15 px-3 py-2 text-xs font-bold text-[var(--totk-light-green)] shadow-sm transition hover:bg-[var(--totk-light-green)]/25 md:min-h-[2.35rem]"
                                  >
                                    <i className="fa-solid fa-pen-to-square text-[13px]" aria-hidden />
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void handleDelete(row)}
                                    className="inline-flex min-h-[2.5rem] w-full items-center justify-center gap-2 rounded-xl border border-red-400/35 bg-red-950/35 px-3 py-2 text-xs font-bold text-red-100 shadow-sm transition hover:bg-red-950/55 md:min-h-[2.35rem]"
                                  >
                                    <i className="fa-solid fa-trash text-[13px]" aria-hidden />
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCancel(row)}
                                    className="inline-flex min-h-[2.5rem] w-full items-center justify-center gap-2 rounded-xl border border-[var(--botw-border)]/45 bg-black/25 px-3 py-2 text-xs font-semibold text-[var(--botw-pale)] transition hover:bg-white/8 md:min-h-[2.35rem]"
                                  >
                                    <i className="fa-solid fa-ban text-[12px] opacity-90" aria-hidden />
                                    Withdraw
                                  </button>
                                </div>
                                <p className="hidden text-[10px] leading-snug text-[var(--botw-pale)]/60 md:block">
                                  Withdraw keeps a record; Delete removes the board post.
                                </p>
                              </div>
                            ) : youPosted && row.status === "accepted" ? (
                              <div className="flex items-center border-t border-[var(--botw-border)]/40 pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                                <p className="text-[11px] leading-relaxed text-[var(--botw-pale)]/75 md:max-w-[16rem] md:self-center md:pt-1">
                                  <i className="fa-solid fa-circle-check mr-1 text-[var(--totk-light-green)]" aria-hidden />
                                  {row.acceptedByCharacterName?.trim() ? (
                                    <>
                                      <span className="font-semibold text-[var(--botw-cream)]/95">
                                        {row.acceptedByCharacterName.trim()}
                                      </span>{" "}
                                      claimed this!
                                    </>
                                  ) : (
                                    <>Someone claimed this commission.</>
                                  )}
                                </p>
                              </div>
                            ) : !youPosted ? (
                              <div className="flex items-center border-t border-[var(--botw-border)]/40 pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                                <p className="text-[11px] leading-relaxed text-[var(--botw-pale)]/75 md:max-w-[12rem] md:self-center md:pt-1">
                                  <i className="fa-solid fa-hammer mr-1 text-[var(--totk-light-ocher)]" aria-hidden />
                                  You&apos;re crafting this one.
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        <section>
          <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-[var(--totk-light-ocher)] sm:text-xl md:text-2xl">
                Open requests
              </h2>
              <p className="mt-1 text-sm leading-snug text-[var(--botw-pale)]">
                Newest first. Use <strong className="text-[var(--botw-cream)]">Claim with your OC</strong>{" "}
                when your roster qualifies.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadOpenRequests()}
              className="inline-flex min-h-[2.5rem] w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--botw-border)] bg-[var(--botw-deep)]/60 px-3 py-2 text-xs font-medium text-[var(--botw-pale)] transition hover:border-[var(--totk-light-green)]/40 hover:text-[var(--totk-light-green)] sm:w-auto sm:justify-start"
            >
              <i className={`fa-solid fa-rotate ${loadingOpen ? "fa-spin" : ""}`} aria-hidden />
              Refresh
            </button>
          </div>

          {loadingOpen && !openRequests.length ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--botw-border)] bg-[var(--botw-panel)]/30 py-20">
              <i className="fa-solid fa-spinner fa-spin mb-3 text-3xl text-[var(--totk-light-green)]" />
              <p className="text-sm text-[var(--botw-pale)]">Loading the board…</p>
            </div>
          ) : null}

          {openListError && (
            <div className="mb-6 rounded-xl border border-red-500/40 bg-red-950/30 px-4 py-3 text-sm text-red-200">
              {openListError}
            </div>
          )}

          {!loadingOpen && openRequests.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-[var(--botw-border)] bg-gradient-to-b from-[var(--botw-panel)]/40 to-transparent px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--totk-light-green)]/10 ring-1 ring-[var(--totk-light-green)]/25">
                <i className="fa-solid fa-inbox text-2xl text-[var(--totk-light-green)]/80" />
              </div>
              <p className="text-lg font-medium text-[var(--botw-cream)]">No open requests right now</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--botw-pale)]">
                Be the first to post a commission—crafters will see it here and on Discord.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingRequestId(null);
                  setFormModalOpen(true);
                }}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--totk-light-green)] px-5 py-2.5 text-sm font-bold text-black hover:brightness-110"
              >
                <i className="fa-solid fa-plus" aria-hidden />
                Post a request
              </button>
            </div>
          )}

          <ul className="grid list-none grid-cols-1 gap-5 p-0 sm:gap-6 lg:grid-cols-2 lg:gap-7">
            {openRequests.map((row) => {
              const thumbSrc = formatItemImageUrl(row.craftItemImage);
              const isOpenCall = row.targetMode !== "specific" || !row.targetCharacterName;
              const youCanTake =
                user && row.requesterDiscordId !== user.id && requestIdsYouCanAccept.has(row._id);
              return (
                <li
                  key={row._id}
                  id={`crafting-open-${row._id}`}
                  data-commission-id={row.commissionID || undefined}
                >
                  <article
                    className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--totk-dark-ocher)]/45 bg-gradient-to-b from-[var(--botw-panel)]/95 via-[var(--botw-deep)]/88 to-[var(--botw-warm-black)]/75 shadow-[0_4px_24px_rgba(0,0,0,0.28)] ring-1 ring-black/20 transition duration-300 hover:border-[var(--totk-light-green)]/40 hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                  >
                    <div
                      className="pointer-events-none absolute inset-0 opacity-[0.07]"
                      style={{
                        backgroundImage: `radial-gradient(ellipse 120% 80% at 100% -20%, var(--totk-light-green), transparent 55%),
                          radial-gradient(ellipse 90% 70% at 0% 100%, var(--totk-light-ocher), transparent 50%)`,
                      }}
                      aria-hidden
                    />
                    <div
                      className="relative h-1.5 w-full shrink-0 bg-gradient-to-r from-[var(--totk-light-green)] via-[var(--totk-mid-ocher)] to-[var(--totk-light-ocher)]"
                      aria-hidden
                    />

                    <div className="relative flex flex-1 flex-col gap-4 p-4 sm:p-5 md:p-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                        <div className="relative mx-auto shrink-0 sm:mx-0">
                          <div className="flex h-[4.75rem] w-[4.75rem] items-center justify-center overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)]/55 bg-[radial-gradient(ellipse_at_center,_rgba(0,0,0,0.35)_0%,_transparent_70%)] shadow-inner ring-1 ring-white/5 min-[400px]:h-[5.25rem] min-[400px]:w-[5.25rem] sm:h-[5.75rem] sm:w-[5.75rem]">
                            {/* eslint-disable-next-line @next/next/no-img-element -- dynamic catalog URLs */}
                            <img
                              src={thumbSrc}
                              alt=""
                              className="h-[85%] w-[85%] object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] transition duration-300 group-hover:scale-[1.04]"
                            />
                          </div>
                          {youCanTake ? (
                            <span className="absolute -bottom-1 left-1/2 z-[1] max-w-[11rem] -translate-x-1/2 rounded-full bg-[var(--totk-light-green)] px-2 py-0.5 text-center text-[9px] font-bold uppercase leading-tight tracking-wide text-black shadow-md ring-2 ring-[var(--botw-deep)] sm:max-w-none sm:whitespace-nowrap">
                              You can claim this
                            </span>
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1 pt-0.5 text-center sm:text-left">
                          <div className="mb-1.5 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--totk-light-green)]">
                              Commission
                            </span>
                            {isOpenCall ? (
                              <span className="rounded-full bg-emerald-950/65 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100 ring-1 ring-emerald-400/25">
                                Open call
                              </span>
                            ) : (
                              <span className="rounded-full bg-sky-950/65 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-100 ring-1 ring-sky-400/25">
                                Named artisan
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-bold leading-snug text-[var(--botw-cream)] min-[400px]:text-lg sm:text-xl">
                            {row.craftItemName}
                          </h3>
                          <div className="mt-2.5 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                            {(row.craftingJobsSnapshot ?? []).slice(0, 5).map((j) => (
                              <span
                                key={j}
                                className="rounded-md border border-[var(--botw-border)]/50 bg-black/30 px-2 py-0.5 text-[11px] font-medium text-[var(--botw-pale)]"
                              >
                                {j}
                              </span>
                            ))}
                            <span className="inline-flex items-center gap-1 rounded-md border border-[var(--totk-light-ocher)]/35 bg-[var(--totk-light-ocher)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--totk-light-ocher)]">
                              <i className="fa-solid fa-bolt text-[10px] opacity-90" aria-hidden />
                              {row.staminaToCraftSnapshot ?? 0} stamina
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-xl border border-[var(--botw-border)]/35 bg-black/22 px-3 py-3 backdrop-blur-sm sm:px-4">
                        <dl className="grid gap-2.5 text-sm text-[var(--botw-pale)]">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <dt className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--botw-pale)]/75">
                              <i className="fa-solid fa-user text-[var(--totk-light-green)]" aria-hidden />
                              For
                            </dt>
                            <dd className="font-semibold text-[var(--botw-cream)]">{row.requesterCharacterName}</dd>
                          </div>
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <dt className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--botw-pale)]/75">
                              <i className="fa-solid fa-feather-pointed text-[var(--totk-light-green)]" aria-hidden />
                              Posted by
                            </dt>
                            <dd className="text-[var(--botw-pale)]">
                              {row.requesterUsername?.trim() || row.requesterDiscordId}
                            </dd>
                          </div>
                          <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
                            <dt className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--botw-pale)]/75">
                              <i className="fa-solid fa-compass text-[var(--totk-light-green)]" aria-hidden />
                              Seeking
                            </dt>
                            <dd className="min-w-0 text-[var(--botw-pale)]">
                              {row.targetMode === "specific" && row.targetCharacterName ? (
                                <span>
                                  <span className="font-medium text-[var(--botw-cream)]">{row.targetCharacterName}</span>
                                  {row.targetCharacterHomeVillage ? (
                                    <span className="mt-0.5 block text-xs text-[var(--totk-mid-ocher)]">
                                      <i className="fa-solid fa-house-chimney mr-1 text-[10px]" aria-hidden />
                                      {row.targetCharacterHomeVillage}
                                    </span>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="font-medium text-[var(--botw-cream)]">
                                  {formatOpenCommissionSeekingLine(
                                    row.craftingJobsSnapshot ?? [],
                                    row.staminaToCraftSnapshot ?? 0
                                  )}
                                </span>
                              )}
                            </dd>
                          </div>
                          <div className="border-t border-[var(--botw-border)]/30 pt-2.5">
                            <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                              <dt className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--botw-pale)]/75">
                                <i className="fa-solid fa-box-open text-[var(--totk-light-green)]" aria-hidden />
                                Materials
                              </dt>
                              <dd className="min-w-0">
                                {row.providingAllMaterials ? (
                                  <span className="text-emerald-200/95">Commissioner brings everything listed.</span>
                                ) : (
                                  <span className="text-amber-200/95">Still gathering supplies — see notes.</span>
                                )}
                                {row.materialsDescription ? (
                                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--botw-pale)]/88">
                                    {row.materialsDescription}
                                  </p>
                                ) : null}
                              </dd>
                            </div>
                          </div>
                          {row.paymentOffer ? (
                            <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
                              <dt className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--botw-pale)]/75">
                                <i className="fa-solid fa-coins text-[var(--totk-light-green)]" aria-hidden />
                                Offer
                              </dt>
                              <dd className="min-w-0 text-[var(--botw-pale)]">{row.paymentOffer}</dd>
                            </div>
                          ) : null}
                          {isMixerOutputElixirName(row.craftItemName) &&
                          row.elixirTier != null &&
                          row.elixirTier >= 1 &&
                          row.elixirTier <= 3 ? (
                            <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5">
                              <dt className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--botw-pale)]/75">
                                <i className="fa-solid fa-flask text-[var(--totk-light-green)]" aria-hidden />
                                Elixir tier
                              </dt>
                              <dd className="min-w-0 text-[var(--botw-pale)]">
                                {elixirTierLabel(row.elixirTier)} (mixer)
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>

                      <div className="mt-auto flex flex-col gap-3 border-t border-[var(--botw-border)]/40 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <time
                          className="order-2 text-[11px] tabular-nums text-[var(--botw-pale)]/55 sm:order-1"
                          dateTime={row.createdAt ?? undefined}
                        >
                          {row.createdAt ? new Date(row.createdAt).toLocaleString() : ""}
                        </time>
                        <div className="order-1 flex w-full flex-wrap gap-2 sm:order-2 sm:w-auto sm:justify-end">
                          {row.requesterDiscordId === user.id && (
                            <>
                              <button
                                type="button"
                                onClick={() => void openEditRequest(row)}
                                className="min-h-[2.5rem] flex-1 basis-[calc(50%-0.25rem)] rounded-lg border border-[var(--totk-light-green)]/45 bg-[var(--totk-light-green)]/12 px-3 py-2 text-xs font-semibold text-[var(--totk-light-green)] transition hover:bg-[var(--totk-light-green)]/22 sm:flex-initial sm:basis-auto"
                              >
                                <i className="fa-solid fa-pen-to-square mr-1" aria-hidden />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(row)}
                                className="min-h-[2.5rem] flex-1 basis-[calc(50%-0.25rem)] rounded-lg border border-red-400/45 bg-red-950/25 px-3 py-2 text-xs font-semibold text-red-100 transition hover:bg-red-950/45 sm:flex-initial sm:basis-auto"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancel(row)}
                                className="min-h-[2.5rem] w-full flex-[1_1_100%] rounded-lg border border-[var(--botw-border)] bg-[var(--botw-deep)]/50 px-3 py-2 text-xs font-semibold text-[var(--botw-pale)] transition hover:bg-[var(--botw-deep)]/80 sm:w-auto sm:flex-initial"
                              >
                                Withdraw
                              </button>
                            </>
                          )}
                          {row.requesterDiscordId !== user.id &&
                            (() => {
                              const eligible = myChars.filter((c) => canAcceptWithCharacter(row, c));
                              const claiming = claimingRequestId === row._id;
                              if (eligible.length === 0) {
                                if (row.targetMode === "specific" && row.targetCharacterName) {
                                  return (
                                    <p className="w-full text-left text-[11px] leading-snug text-[var(--botw-pale)]/75 sm:ml-auto sm:max-w-[14rem] sm:text-right">
                                      Only{" "}
                                      <span className="font-medium text-[var(--botw-cream)]">
                                        {row.targetCharacterName}
                                      </span>{" "}
                                      can claim this commission.
                                    </p>
                                  );
                                }
                                return (
                                  <p className="w-full text-left text-[11px] leading-snug text-[var(--botw-pale)]/75 sm:ml-auto sm:max-w-[14rem] sm:text-right">
                                    No OC on your roster matches job + base stamina.
                                  </p>
                                );
                              }
                              if (eligible.length === 1) {
                                const oc = eligible[0]!;
                                return (
                                  <button
                                    type="button"
                                    disabled={claiming}
                                    onClick={() => void handleClaimDirect(row, oc._id)}
                                    className="min-h-[2.75rem] w-full touch-manipulation rounded-lg bg-[var(--totk-light-green)] px-4 py-2.5 text-xs font-bold text-black shadow-md shadow-black/15 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 sm:w-auto md:min-h-[3rem] md:px-5 md:text-sm"
                                  >
                                    {claiming ? (
                                      <>
                                        <i className="fa-solid fa-spinner fa-spin mr-1.5" aria-hidden />
                                        Claiming…
                                      </>
                                    ) : (
                                      <>
                                        <i className="fa-solid fa-hand-holding-heart mr-1.5" aria-hidden />
                                        Claim as {oc.name}
                                      </>
                                    )}
                                  </button>
                                );
                              }
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAcceptFor(row);
                                    setAcceptError(null);
                                  }}
                                  className="min-h-[2.75rem] w-full touch-manipulation rounded-lg bg-[var(--totk-light-green)] px-4 py-2.5 text-xs font-bold text-black shadow-md shadow-black/15 transition hover:brightness-110 active:scale-[0.98] sm:w-auto md:min-h-[3rem] md:px-5 md:text-sm"
                                >
                                  <i className="fa-solid fa-hand-holding-heart mr-1.5" aria-hidden />
                                  Claim with your OC
                                </button>
                              );
                            })()}
                        </div>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {formModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 pt-[env(safe-area-inset-top,0px)] backdrop-blur-[3px] sm:items-center sm:p-3 md:top-14 md:left-[var(--sidebar-width,240px)] md:p-2 md:pt-[max(0.75rem,env(safe-area-inset-top,0px))] md:pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] lg:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="craft-form-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFormModal();
          }}
        >
          <div
            className="flex max-h-[min(92dvh,100dvh)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border-2 border-[var(--totk-dark-ocher)]/75 bg-gradient-to-b from-[var(--totk-brown)] via-[var(--totk-brown)] to-[var(--botw-warm-black)] text-[var(--botw-pale)] shadow-[0_-8px_40px_rgba(0,0,0,0.45)] sm:max-h-[min(94dvh,calc(100svh-1.25rem))] sm:max-w-[min(64rem,calc(100vw-1.5rem))] sm:rounded-2xl sm:shadow-2xl md:max-h-[min(96dvh,calc(100svh-0.75rem))] md:max-w-[min(64rem,calc(100vw-0.75rem))] lg:max-h-[min(92dvh,880px)] lg:max-w-[min(72rem,calc(100vw-2.5rem))]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="relative flex shrink-0 items-start justify-between gap-3 border-b border-[var(--totk-dark-ocher)]/55 bg-[var(--botw-black)]/15 px-4 py-3 sm:px-5 sm:py-4 md:px-6 md:py-4 md:pt-4">
              <div className="min-w-0 pr-2 pt-1">
                <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-[var(--totk-mid-ocher)]/45 sm:hidden" aria-hidden />
                <h2
                  id="craft-form-title"
                  className="text-base font-semibold tracking-tight text-[var(--totk-light-ocher)] md:text-lg"
                >
                  {editingRequestId ? "Edit crafting request" : "New crafting request"}
                </h2>
                <p className={modalHintClass}>
                  {editingRequestId
                    ? "Saving updates the board and your Discord post."
                    : "Discord + board · Esc or outside click to close"}
                </p>
              </div>
              <button
                type="button"
                onClick={closeFormModal}
                className="mt-0.5 flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-md text-[var(--botw-pale)]/70 transition hover:bg-[var(--botw-black)]/35 hover:text-[var(--totk-light-ocher)] md:h-11 md:w-11"
                aria-label="Close dialog"
              >
                <i className="fa-solid fa-xmark text-sm" />
              </button>
            </header>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 touch-pan-y sm:px-5 sm:py-4 md:px-6 md:py-5 [scrollbar-gutter:stable]">
                <div className="space-y-5 md:space-y-6">
                  <section className="space-y-2 md:space-y-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--totk-mid-ocher)] md:text-[11px]">
                      1 · Item to craft
                    </p>
                    <p className={modalHintClass}>
                      Choose the recipe first — a specific crafter must have a matching job.
                    </p>
                    <div className="relative z-[1]">
                      <label className={modalLabelClass} htmlFor="craft-item-search">
                        Craftable item
                      </label>
                      {craftItemName ? (
                        <div className={`${modalFieldClass} flex flex-wrap items-center gap-2`}>
                          <span className="text-[var(--totk-ivory)]">{craftItemName}</span>
                          <button
                            type="button"
                            className="ml-auto text-xs font-medium text-[var(--totk-light-green)] hover:underline"
                            onClick={() => {
                              setCraftItemName("");
                              setSelectedItemMeta(null);
                              setElixirTier(1);
                              setElixirGuide(null);
                              setElixirGuideFetchError(null);
                              setItemPickerOpen(false);
                              setTargetPick(null);
                              setTargetSearch("");
                              setTargetResults([]);
                              setElixirStacks([]);
                              setElixirStacksError(null);
                              setElixirStackQtyById({});
                            }}
                          >
                            Change
                          </button>
                          {selectedItemMeta ? (
                            <div className="w-full space-y-1 text-xs text-[var(--totk-mid-ocher)]">
                              <p>
                                <span className="font-semibold text-[var(--totk-light-ocher)]">
                                  Crafting jobs:{" "}
                                </span>
                                {(selectedItemMeta.craftingJobs ?? []).join(", ") || "—"}
                              </p>
                              <p>
                                <span className="font-semibold text-[var(--totk-light-ocher)]">
                                  Base stamina:{" "}
                                </span>
                                {parseStamina(selectedItemMeta.staminaToCraft)}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          <input
                            id="craft-item-search"
                            type="search"
                            value={itemQuery}
                            onChange={(e) => setItemQuery(e.target.value)}
                            onFocus={() => setItemPickerOpen(true)}
                            placeholder="Search catalog…"
                            className={modalGreenSearchClass}
                            autoComplete="off"
                          />
                          {itemLoading ? (
                            <p className={`${modalHintClass} mt-1`}>Searching…</p>
                          ) : null}
                          {itemOptions.length > 0 ? (
                            <ul className={`absolute z-[80] mt-1 max-h-36 w-full overflow-auto overscroll-contain rounded-md py-0.5 md:max-h-[min(50vh,20rem)] ${CRAFTING_MODAL_DROPPANEL_CHROME}`}>
                              {itemOptions.map((it) => (
                                <li key={it.itemName}>
                                  <button
                                    type="button"
                                    className="w-full touch-manipulation px-3 py-2 text-left text-sm text-[var(--totk-light-green)] transition-colors hover:bg-[var(--totk-light-green)]/14 hover:text-[var(--totk-ivory)] md:min-h-12 md:px-4 md:py-3 md:text-base"
                                    onClick={() => handleSelectItem(it)}
                                  >
                                    {it.itemName}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </>
                      )}
                    </div>
                  </section>

                  {craftItemName && selectedItemMeta?.isElixir ? (
                    <section className="space-y-3 rounded-xl border border-[var(--totk-light-green)]/40 bg-[var(--totk-light-green)]/08 p-4 ring-1 ring-[var(--totk-light-green)]/15 md:space-y-4 md:p-5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--totk-light-green)] md:text-[11px]">
                        Elixir mixer — customize
                      </p>
                      <p className="text-sm leading-relaxed text-[var(--botw-pale)] md:text-base md:leading-relaxed">
                        You chose{" "}
                        <strong className="text-[var(--botw-cream)]">{craftItemName}</strong>. Pick the{" "}
                        <strong className="text-[var(--botw-cream)]">potency tier</strong> you want. After you
                        choose <strong className="text-[var(--botw-cream)]">your OC</strong> in step 2, you must
                        select <strong className="text-[var(--botw-cream)]">exact inventory stacks</strong> (and how
                        much from each) so the brew matches what you are actually providing.
                      </p>
                      <div>
                        <label className={modalLabelClass} htmlFor="craft-elixir-tier">
                          What level do you want?
                        </label>
                        <CraftingModalGreenSelect
                          id="craft-elixir-tier"
                          value={String(elixirTier)}
                          onChange={(v) =>
                            setElixirTier(Number(v) as 1 | 2 | 3)
                          }
                          options={[
                            { value: "1", label: "Basic" },
                            { value: "2", label: "Mid" },
                            { value: "3", label: "High" },
                          ]}
                          placeholder="Choose tier"
                        />
                      </div>
                      {elixirGuideFetchError ? (
                        <p className="rounded-md border border-amber-500/40 bg-amber-950/35 px-3 py-2 text-xs leading-relaxed text-amber-100/95">
                          {elixirGuideFetchError}{" "}
                          <span className="text-amber-200/80">
                            Try another potency tier or close and reopen this form.
                          </span>
                        </p>
                      ) : null}
                      {elixirGuideLoading ? (
                        <p className={`${modalHintClass} flex items-center gap-2`}>
                          <i className="fa-solid fa-spinner fa-spin text-xs" aria-hidden />
                          Loading recipe…
                        </p>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="space-y-2 md:space-y-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--totk-mid-ocher)] md:text-[11px]">
                      2 · Who&apos;s involved
                    </p>
                    {!craftItemName ? (
                      <p className="rounded-md border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-black)]/25 px-3 py-2.5 text-xs leading-relaxed text-[var(--totk-mid-ocher)]">
                        Select an item in step 1 to unlock your OC, acceptance mode, and the rest of the
                        form.
                      </p>
                    ) : null}
                    <fieldset
                      disabled={!craftItemName}
                      className="min-w-0 space-y-4 border-0 p-0 disabled:opacity-[0.62] [&:disabled_*]:cursor-not-allowed"
                    >
                      <legend className="sr-only">Characters and request details</legend>

                      <div
                        className={`space-y-2 rounded-xl p-4 md:space-y-2.5 md:p-5 ${CRAFTING_MODAL_DROPPANEL_CHROME} rounded-xl`}
                      >
                        <label
                          className={`${modalLabelClass} text-[var(--botw-cream)]`}
                          htmlFor="craft-requester-oc"
                        >
                          Your OC
                        </label>
                        <CraftingModalGreenSelect
                          id="craft-requester-oc"
                          value={requesterCharacterName}
                          onChange={(v) => {
                            setRequesterCharacterName(v);
                            setElixirStackQtyById({});
                            setElixirStacksError(null);
                          }}
                          options={myChars.map((c) => ({
                            value: c.name,
                            label: c.name,
                          }))}
                          placeholder="Choose…"
                        />
                      </div>

                      {selectedItemMeta?.isElixir ? (
                        <div className="rounded-lg border border-[var(--totk-light-green)]/35 bg-[var(--totk-light-green)]/06 p-3 md:p-4">
                          <p className={modalLabelClass}>Mixer ingredients — specific stacks on this OC</p>
                          <p className={`${modalHintClass} mb-2`}>
                            Same rules as <strong className="text-[var(--botw-cream)]">/crafting brew</strong>. Listed stacks
                            are recipe materials plus valid extras (same-effect-family critters, neutral/thread monster parts
                            for this elixir, Fairy / Mock Fairy). Critter lines{" "}
                            <strong className="text-[var(--botw-cream)]">auto-fill</strong> when only one stack matches; you
                            always pick the <strong className="text-[var(--botw-cream)]">monster part</strong> yourself.
                            Then up to <strong className="text-[var(--botw-cream)]">{MIXER_BREW_MAX_EXTRAS}</strong> optional
                            extra units (max{" "}
                            <strong className="text-[var(--botw-cream)]">{MIXER_BREW_MAX_INGREDIENT_UNITS}</strong> total).
                            Scholar/village may use less at claim.
                          </p>
                          {!requesterCharacterName.trim() ? (
                            <p className="text-xs text-amber-200/90">Choose your OC above to load inventory rows.</p>
                          ) : elixirGuideLoading ? (
                            <p className={`${modalHintClass} flex items-center gap-2`}>
                              <i className="fa-solid fa-spinner fa-spin text-xs" aria-hidden />
                              Loading mixer recipe…
                            </p>
                          ) : elixirGuideFetchError ? (
                            <p className="rounded-md border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-xs leading-relaxed text-amber-100/95">
                              {elixirGuideFetchError}
                            </p>
                          ) : !elixirGuide ? (
                            <p className="text-xs text-amber-200/90">
                              Mixer recipe not ready yet — confirm the elixir and potency tier in step 1.
                            </p>
                          ) : elixirGuide.recipeIncomplete || elixirGuide.craftingMaterial.length === 0 ? (
                            <p className="text-xs text-amber-200/90">
                              This catalog elixir has no usable recipe lines (data issue). Pick a different elixir or ask
                              staff to fix <strong className="text-[var(--botw-cream)]">{craftItemName}</strong> in the
                              item database.
                            </p>
                          ) : elixirStacksLoading ? (
                            <p className={`${modalHintClass} flex items-center gap-2`}>
                              <i className="fa-solid fa-spinner fa-spin text-xs" aria-hidden />
                              Loading inventory…
                            </p>
                          ) : elixirStacksError ? (
                            <p className="rounded-md border border-amber-500/35 bg-amber-950/30 px-3 py-2 text-xs leading-relaxed text-amber-100/95">
                              {elixirStacksError}{" "}
                              <button
                                type="button"
                                className="ml-1 underline decoration-amber-200/60 underline-offset-2 hover:text-[var(--botw-cream)]"
                                onClick={() => {
                                  const n = requesterCharacterName.trim();
                                  if (!n) return;
                                  setElixirStacksError(null);
                                  setElixirStacksLoading(true);
                                  void (async () => {
                                    try {
                                      const q = new URLSearchParams({ characterName: n });
                                      const c = craftItemName.trim();
                                      if (c && isMixerOutputElixirName(c)) q.set("mixerCraftItemName", c);
                                      const res = await fetch(
                                        `/api/crafting-requests/inventory-stacks?${q}`,
                                        { credentials: "include" }
                                      );
                                      const data = (await res.json()) as {
                                        stacks?: Array<{ _id: string; itemName: string; quantity: number }>;
                                        error?: string;
                                      };
                                      if (!res.ok) {
                                        throw new Error(
                                          typeof data.error === "string" && data.error.trim()
                                            ? data.error
                                            : "Failed to load inventory stacks."
                                        );
                                      }
                                      setElixirStacks(Array.isArray(data.stacks) ? data.stacks : []);
                                      setElixirStacksError(null);
                                    } catch (e) {
                                      setElixirStacks([]);
                                      setElixirStacksError(
                                        e instanceof Error && e.message
                                          ? e.message
                                          : "Could not load inventory. Try again."
                                      );
                                    } finally {
                                      setElixirStacksLoading(false);
                                    }
                                  })();
                                }}
                              >
                                Retry
                              </button>
                            </p>
                          ) : elixirStacks.length === 0 ? (
                            <p className="text-xs text-amber-200/90">No items in this OC&apos;s inventory.</p>
                          ) : mixerEligibleStacks.length === 0 ? (
                            <p className="text-xs text-amber-200/90">
                              No recipe materials for this elixir in this OC&apos;s inventory — add items that match
                              this elixir&apos;s catalog recipe, then refresh or reopen the form.
                            </p>
                          ) : (
                            <>
                              <div
                                className={`${modalHintClass} mb-3 space-y-3 rounded-md border border-[var(--totk-dark-ocher)]/35 bg-[var(--botw-black)]/20 p-3 font-medium text-[var(--totk-light-ocher)] md:p-3.5`}
                                role="status"
                              >
                                <p className="text-base leading-tight text-[var(--botw-ivory)] md:text-lg">
                                  <span className="tabular-nums text-2xl font-bold text-[var(--botw-cream)] md:text-[1.65rem]">
                                    {mixerIngredientCommitTotal}
                                  </span>
                                  <span className="tabular-nums text-2xl font-bold text-[var(--totk-mid-ocher)] md:text-[1.65rem]">
                                    {" "}
                                    / {MIXER_BREW_MAX_INGREDIENT_UNITS}
                                  </span>
                                  <span className="block text-xs font-normal text-[var(--totk-mid-ocher)] md:text-sm">
                                    ingredients for this brew
                                  </span>
                                </p>
                                <ul className="space-y-2.5 text-xs leading-snug text-[var(--botw-pale)] md:text-sm">
                                  {mixerLineProgress
                                    .filter((l) => !l.isBroadPart)
                                    .map((l) => (
                                      <li key={`critter-${l.itemName}`}>
                                        <strong className="text-[var(--botw-ivory)]">Critter</strong>{" "}
                                        <span className="text-[var(--totk-mid-ocher)]">({l.itemName})</span>
                                        {": "}
                                        {l.satisfied ? (
                                          l.matchingStackCount === 1 ? (
                                            <span className="text-[var(--totk-light-green)]">
                                              auto-chosen — only one matching stack.
                                            </span>
                                          ) : (
                                            <span className="text-[var(--totk-light-green)]">covered.</span>
                                          )
                                        ) : l.matchingStackCount === 0 ? (
                                          <span className="text-amber-200/90">
                                            no matching stack in inventory — add one or pick another OC.
                                          </span>
                                        ) : l.matchingStackCount === 1 ? (
                                          <span className="text-amber-200/90">
                                            one stack matches — confirm quantity below (should auto-fill to {l.need}).
                                          </span>
                                        ) : (
                                          <span className="text-amber-200/90">
                                            choose which stack to use — several match this line.
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                  {mixerLineProgress
                                    .filter((l) => l.isBroadPart)
                                    .map((l) => (
                                      <li key={`part-${l.itemName}`}>
                                        <strong className="text-[var(--botw-ivory)]">Monster part</strong>{" "}
                                        <span className="text-[var(--totk-mid-ocher)]">({l.itemName})</span>
                                        {": "}
                                        {l.satisfied ? (
                                          <span className="text-[var(--totk-light-green)]">
                                            covered ({l.committed}/{l.need}).
                                          </span>
                                        ) : (
                                          <span className="text-amber-200/90">
                                            please choose <span className="tabular-nums font-semibold">{l.need}</span> from the
                                            stacks below (never auto-picked).
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                  <li>
                                    <strong className="text-[var(--botw-ivory)]">Optional extras</strong> (same as brew:
                                    extra critters in this family, allowed parts, fairies): up to{" "}
                                    <span className="tabular-nums text-[var(--botw-cream)]">{MIXER_BREW_MAX_EXTRAS}</span>{" "}
                                    units after the recipe is satisfied —{" "}
                                    <span className="tabular-nums">{mixerExtrasCommittedDisplay}</span> /{" "}
                                    {MIXER_BREW_MAX_EXTRAS} used,{" "}
                                    <span className="tabular-nums">{mixerExtrasRemaining}</span> left.
                                  </li>
                                </ul>
                              </div>
                              <ul className={`max-h-48 space-y-2 overflow-auto overscroll-contain rounded-md p-2 md:max-h-[min(52vh,24rem)] md:space-y-2.5 md:p-3 ${CRAFTING_MODAL_DROPPANEL_CHROME}`}>
                                {mixerEligibleStacks.map((st) => {
                                  const stackRole = mixerStackRoleBadge(st.itemName);
                                  const stackRolePhrase =
                                    stackRole === "Monster part"
                                      ? "monster part"
                                      : stackRole === "Critter"
                                        ? "critter"
                                        : "fairy / special";
                                  const numCommitted =
                                    typeof elixirStackQtyById[st._id] === "number" &&
                                    elixirStackQtyById[st._id]! > 0
                                      ? elixirStackQtyById[st._id]!
                                      : 0;
                                  const otherTotal = mixerIngredientCommitTotal - numCommitted;
                                  const remainingForRow = MIXER_BREW_MAX_INGREDIENT_UNITS - otherTotal;
                                  const maxCommit = Math.max(0, Math.min(st.quantity, remainingForRow));
                                  const displayQty =
                                    elixirStackQtyById[st._id] === undefined ? "" : elixirStackQtyById[st._id];
                                  return (
                                    <li
                                      key={st._id}
                                      className="rounded-lg border border-[var(--totk-light-green)]/30 bg-[var(--botw-black)]/50 px-3 py-3 text-[var(--botw-pale)] md:px-4 md:py-3.5"
                                    >
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                                        <p className="text-sm font-medium leading-snug text-[var(--totk-ivory)] md:text-base">
                                          {st.itemName}
                                        </p>
                                        <span
                                          className={`inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                                            stackRole === "Monster part"
                                              ? "border-orange-300/45 bg-orange-950/40 text-orange-100/95"
                                              : stackRole === "Critter"
                                                ? "border-cyan-300/40 bg-cyan-950/35 text-cyan-100/95"
                                                : "border-violet-300/40 bg-violet-950/35 text-violet-100/95"
                                          }`}
                                        >
                                          {stackRole}
                                        </span>
                                      </div>
                                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--totk-mid-ocher)]">
                                            In inventory
                                          </span>
                                          <span className="text-xl font-bold tabular-nums text-[var(--botw-cream)] leading-none">
                                            {st.quantity}
                                          </span>
                                        </div>
                                        <label className="flex min-w-0 flex-col gap-1 sm:items-end sm:text-right touch-manipulation">
                                          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--totk-mid-ocher)]">
                                            Commit up to
                                          </span>
                                          <span className="text-[10px] leading-snug text-[var(--botw-pale)]/75">
                                            {maxCommit < 1
                                              ? "At full 5-ingredient cap — lower another row first"
                                              : `Up to ${maxCommit} on this ${stackRolePhrase} stack · ${remainingForRow} slot${remainingForRow === 1 ? "" : "s"} left (recipe + up to ${MIXER_BREW_MAX_EXTRAS} extras)`}
                                          </span>
                                          <input
                                            type="number"
                                            inputMode="numeric"
                                            min={0}
                                            max={Math.max(0, maxCommit)}
                                            disabled={maxCommit < 1}
                                            value={displayQty}
                                            onChange={(e) => {
                                              const raw = e.target.value;
                                              if (raw === "") {
                                                setElixirStackQtyById((prev) => {
                                                  const next = { ...prev };
                                                  delete next[st._id];
                                                  return next;
                                                });
                                                return;
                                              }
                                              const n = Math.max(
                                                0,
                                                Math.min(maxCommit, Math.floor(Number(raw)) || 0)
                                              );
                                              setElixirStackQtyById((prev) => {
                                                const next = { ...prev };
                                                if (n <= 0) delete next[st._id];
                                                else next[st._id] = n;
                                                return next;
                                              });
                                            }}
                                            className="h-11 w-full min-w-[5.5rem] rounded-lg border-2 border-[var(--totk-light-green)]/40 bg-[var(--botw-black)]/80 px-3 text-center text-base font-semibold tabular-nums text-[var(--totk-light-green)] shadow-inner focus:border-[var(--totk-light-green)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/30 enabled:cursor-text disabled:cursor-not-allowed disabled:opacity-45 sm:max-w-[7rem] md:h-12 md:text-lg"
                                            aria-label={`Commit up to how many ${st.itemName} (${stackRole}, max ${maxCommit} with current brew budget)`}
                                          />
                                        </label>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </>
                          )}
                        </div>
                      ) : null}

                      <div className="space-y-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--totk-light-ocher)]">
                          Who can accept
                        </p>
                        <div className="flex flex-col gap-2 text-sm text-[var(--botw-pale)] sm:flex-row sm:flex-wrap sm:gap-x-5 sm:gap-y-2">
                          <label className="inline-flex min-h-[2.5rem] cursor-pointer items-center gap-2 sm:min-h-0">
                            <input
                              type="radio"
                              name="targetMode"
                              checked={targetMode === "open"}
                              onChange={() => {
                                setTargetMode("open");
                                setTargetPick(null);
                                setTargetSearch("");
                                setTargetResults([]);
                              }}
                              className="accent-[var(--totk-light-green)]"
                            />
                            Open — any matching crafter
                          </label>
                          <label className="inline-flex min-h-[2.5rem] cursor-pointer items-center gap-2 sm:min-h-0">
                            <input
                              type="radio"
                              name="targetMode"
                              checked={targetMode === "specific"}
                              onChange={() => setTargetMode("specific")}
                              className="accent-[var(--totk-light-green)]"
                            />
                            Specific crafter
                          </label>
                        </div>

                        {targetMode === "specific" && craftItemName ? (
                          <div
                            className={`relative z-[2] overflow-hidden rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${CRAFTING_MODAL_DROPPANEL_CHROME} rounded-xl`}
                          >
                            <div className="border-b border-[var(--totk-light-green)]/25 bg-black/25 px-3 py-2.5 sm:px-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wide text-[var(--totk-light-ocher)]">
                                  Find crafter
                                </span>
                                {(selectedItemMeta?.craftingJobs ?? []).filter(Boolean).length ? (
                                  <span className="text-[10px] text-[var(--totk-mid-ocher)]">
                                    Eligible jobs
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {(selectedItemMeta?.craftingJobs ?? []).filter(Boolean).length ? (
                                  (selectedItemMeta?.craftingJobs ?? []).filter(Boolean).map((j) => (
                                    <span
                                      key={j}
                                      className="rounded-md border border-[var(--totk-light-green)]/35 bg-[var(--totk-dark-green)]/40 px-2 py-0.5 text-[11px] font-medium text-[var(--totk-light-green)]"
                                    >
                                      {j}
                                    </span>
                                  ))
                                ) : (
                                  <p className="text-xs text-amber-200/85">
                                    No crafting jobs on file for this item — use Open or pick a different
                                    item.
                                  </p>
                                )}
                              </div>
                              <p className={`${modalHintClass} mt-2`}>
                                Type a name for browser autocomplete, or open the list below. Only
                                characters with one of the jobs above are shown.
                              </p>
                            </div>

                            <div className="p-3 sm:p-4">
                              {targetPick ? (
                                <div
                                  className={`${modalFieldClass} flex flex-wrap items-center gap-2 border-[var(--totk-light-green)]/35`}
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-[var(--totk-ivory)]">{targetPick.name}</p>
                                    <p className="text-xs text-[var(--totk-mid-ocher)]">
                                      {targetPick.job}
                                      {targetPick.isModCharacter
                                        ? " · mod character"
                                        : ` · ${targetPick.currentStamina} stam (max ${effectiveMaxStamina(targetPick)})`}
                                    </p>
                                    <p className="mt-1 text-xs text-[var(--totk-light-ocher)]">
                                      <i className="fa-solid fa-house-chimney mr-1 text-[10px] opacity-80" aria-hidden />
                                      {targetPick.homeVillage?.trim()
                                        ? targetPick.homeVillage.trim()
                                        : "Village not set"}
                                    </p>
                                    {isBelowRecipeMaxStamina(targetPick, recipeBaseStaminaCost) ? (
                                      <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/35 bg-amber-950/25 px-2 py-1.5 text-[11px] leading-snug text-amber-100">
                                        <i
                                          className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0 text-amber-400"
                                          aria-hidden
                                        />
                                        <span>
                                          <span className="font-semibold text-amber-50">
                                            Doesn&apos;t have enough stamina to craft this!
                                          </span>
                                          <span className="mt-0.5 block text-amber-100/90">
                                            This recipe needs {recipeBaseStaminaCost} stamina (base); their max
                                            is {effectiveMaxStamina(targetPick)}.
                                          </span>
                                        </span>
                                      </p>
                                    ) : null}
                                  </div>
                                  <button
                                    type="button"
                                    className="shrink-0 text-xs font-medium text-[var(--totk-light-green)] hover:underline"
                                    onClick={() => {
                                      setTargetPick(null);
                                      setTargetSearch("");
                                    }}
                                  >
                                    Change
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <label className={modalLabelClass} htmlFor="craft-crafter-search">
                                    Search by name
                                  </label>
                                  <input
                                    id="craft-crafter-search"
                                    type="search"
                                    value={targetSearch}
                                    onChange={(e) => setTargetSearch(e.target.value)}
                                    placeholder="Start typing — suggestions match eligible jobs"
                                    className={modalGreenSearchClass}
                                    list="crafting-crafter-suggest"
                                    autoComplete="off"
                                    aria-autocomplete="list"
                                  />
                                  <datalist id="crafting-crafter-suggest">
                                    {targetResults.map((c) => (
                                      <option key={c._id} value={c.name}>
                                        {c.job}
                                        {c.homeVillage ? ` · ${c.homeVillage}` : ""}
                                      </option>
                                    ))}
                                  </datalist>
                                  {targetLoading ? (
                                    <p className={`${modalHintClass} mt-2 flex items-center gap-2`}>
                                      <i className="fa-solid fa-spinner fa-spin text-xs" aria-hidden />
                                      Loading…
                                    </p>
                                  ) : null}
                                  {!targetLoading &&
                                  (selectedItemMeta?.craftingJobs ?? []).filter(Boolean).length > 0 &&
                                  targetResults.length === 0 ? (
                                    <p className={`${modalHintClass} mt-2`}>
                                      {targetSearch.trim()
                                        ? "No one matched — check spelling or try Open instead."
                                        : "Type a name to search, or pick from the list when it appears."}
                                    </p>
                                  ) : null}
                                  {targetResults.length > 0 ? (
                                    <ul className={`mt-2 max-h-44 overflow-auto rounded-lg ${CRAFTING_MODAL_DROPPANEL_CHROME}`}>
                                      {targetResults.map((c) => {
                                        const stamShort = c.isModCharacter
                                          ? "mod"
                                          : `${c.currentStamina} stam (max ${effectiveMaxStamina(c)})`;
                                        const stamWarn = isBelowRecipeMaxStamina(c, recipeBaseStaminaCost);
                                        return (
                                          <li
                                            key={c._id}
                                            className="border-b border-[var(--totk-light-green)]/15 last:border-b-0"
                                          >
                                            <button
                                              type="button"
                                              className={`group flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm text-[var(--totk-light-green)] transition-colors hover:bg-[var(--totk-light-green)]/14 hover:text-[var(--totk-ivory)] ${
                                                stamWarn
                                                  ? "border-l-2 border-amber-400/90 bg-amber-950/15"
                                                  : ""
                                              }`}
                                              onClick={() => {
                                                setTargetPick(c);
                                                setTargetResults([]);
                                                setTargetSearch("");
                                              }}
                                            >
                                              <span className="font-medium text-[var(--totk-light-green)] group-hover:text-[var(--totk-ivory)]">
                                                {c.name}
                                              </span>
                                              <span className="text-xs text-[var(--totk-mid-ocher)]">
                                                {c.job}
                                                {c.homeVillage ? ` · ${c.homeVillage}` : ""}
                                                {c.isModCharacter ? " · mod" : ` · ${stamShort}`}
                                              </span>
                                              {stamWarn ? (
                                                <span className="mt-1 flex items-start gap-1.5 text-[11px] font-medium leading-snug text-amber-200">
                                                  <i
                                                    className="fa-solid fa-triangle-exclamation mt-0.5 shrink-0 text-amber-400"
                                                    aria-hidden
                                                  />
                                                  <span>
                                                    Doesn&apos;t have enough stamina to craft this! (needs{" "}
                                                    {recipeBaseStaminaCost} base; max {effectiveMaxStamina(c)})
                                                  </span>
                                                </span>
                                              ) : null}
                                            </button>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-2 border-t border-[var(--totk-dark-ocher)]/45 pt-3">
                    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[var(--botw-pale)]">
                      <input
                        type="checkbox"
                        checked={providingAllMaterials}
                        onChange={(e) => setProvidingAllMaterials(e.target.checked)}
                        className="accent-[var(--totk-light-green)]"
                      />
                      I&apos;m supplying all materials listed
                    </label>
                    <div>
                      <label className={modalLabelClass} htmlFor="craft-materials">
                        Materials &amp; notes
                      </label>
                      {craftItemName && requesterCharacterName ? (
                        <div className="mb-2 space-y-2">
                          {ocMaterialLoading ? (
                            <p className={`${modalHintClass} flex items-center gap-2`}>
                              <i className="fa-solid fa-spinner fa-spin text-xs" aria-hidden />
                              Checking {requesterCharacterName}&apos;s inventory against this recipe…
                            </p>
                          ) : ocMaterialCheck ? (
                            !ocMaterialCheck.hasRecipe ? (
                              <p className="rounded-md border border-[var(--totk-dark-ocher)]/45 bg-[var(--botw-black)]/25 px-2.5 py-2 text-xs leading-relaxed text-[var(--totk-mid-ocher)]">
                                No recipe materials are listed in the catalog for this item. Use the
                                notes field for what you&apos;re bringing; inventory can&apos;t be
                                compared automatically.
                              </p>
                            ) : ocMaterialCheck.allMaterialsMet ? (
                              <p className="rounded-md border border-emerald-500/35 bg-emerald-950/25 px-2.5 py-2 text-xs leading-relaxed text-emerald-100">
                                <i className="fa-solid fa-circle-check mr-1.5 text-emerald-400" aria-hidden />
                                <strong className="text-emerald-50">{requesterCharacterName}</strong> has
                                enough of each recipe material in inventory (stack totals; same rules as
                                the crafting guide).
                              </p>
                            ) : (
                              <div
                                role="alert"
                                className="rounded-xl border-2 border-amber-500/75 bg-gradient-to-br from-amber-950/95 via-red-950/55 to-[var(--botw-black)]/90 px-4 py-4 shadow-[0_8px_28px_rgba(0,0,0,0.45)] ring-1 ring-amber-400/25"
                              >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                                  <div
                                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-2xl text-amber-300"
                                    aria-hidden
                                  >
                                    <i className="fa-solid fa-triangle-exclamation" />
                                  </div>
                                  <div className="min-w-0 space-y-2">
                                    <p className="text-base font-bold leading-snug text-amber-50">
                                      Please make sure your character has all items before submitting this request.
                                    </p>
                                    <p className="text-sm font-medium leading-relaxed text-amber-100/95">
                                      <strong className="text-amber-50">{requesterCharacterName}</strong> is
                                      missing recipe materials. Post / save stays disabled until their inventory
                                      matches the full recipe (same totals as the crafting guide).
                                    </p>
                                    <ul className="mt-2 space-y-1.5 rounded-lg border border-amber-500/30 bg-black/35 px-3 py-2.5 text-sm text-amber-50/95">
                                      {ocMaterialCheck.lines
                                        .filter((l) => !l.sufficient)
                                        .map((l) => (
                                          <li key={l.itemName} className="flex flex-wrap gap-x-1">
                                            <span className="font-semibold text-amber-100">{l.itemName}</span>
                                            <span className="text-amber-200/80">
                                              — need {l.quantity}, have {l.ownedQty}
                                            </span>
                                          </li>
                                        ))}
                                    </ul>
                                  </div>
                                </div>
                              </div>
                            )
                          ) : null}
                        </div>
                      ) : craftItemName ? (
                        <p className={`${modalHintClass} mb-2`}>
                          Choose your OC in step 2 to compare their inventory to this recipe.
                        </p>
                      ) : null}
                      <textarea
                        id="craft-materials"
                        value={materialsDescription}
                        onChange={(e) => setMaterialsDescription(e.target.value)}
                        rows={2}
                        className={modalFieldClass}
                        placeholder="Quantities, elixir bottle details, who brings which parts…"
                      />
                    </div>
                      </div>

                      <div>
                        <label className={modalLabelClass} htmlFor="craft-payment">
                          Payment / trade
                        </label>
                        <textarea
                          id="craft-payment"
                          value={paymentOffer}
                          onChange={(e) => setPaymentOffer(e.target.value)}
                          rows={2}
                          className={modalFieldClass}
                          placeholder="Optional"
                        />
                      </div>
                    </fieldset>
                  </section>
                </div>

                {formError ? (
                  <div
                    className="mt-3 flex gap-2.5 rounded-md border border-red-400/35 bg-red-950/40 px-3 py-2.5 text-sm text-red-100"
                    role="alert"
                  >
                    <i className="fa-solid fa-circle-exclamation mt-0.5 shrink-0 text-red-300/90" aria-hidden />
                    <p>{formError}</p>
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--totk-dark-ocher)]/55 bg-[var(--botw-black)]/22 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:flex-col md:items-stretch md:gap-3 md:px-6 md:py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-2">
                <p
                  className={`${modalHintClass} order-2 min-w-0 sm:order-1 sm:max-w-[55%] md:order-2 md:max-w-none lg:order-1 lg:max-w-[55%] ${materialsSubmitBlocked ? "text-amber-200/95 sm:block" : "hidden sm:block"}`}
                >
                  {materialsSubmitBlocked ? (
                    <>
                      <i className="fa-solid fa-lock mr-1 text-amber-400" aria-hidden />
                      Fix inventory materials above to enable {editingRequestId ? "Save" : "Post"}.
                    </>
                  ) : (
                    <>
                      <i className="fa-brands fa-discord mr-1 text-[#5865F2]" aria-hidden />
                      {editingRequestId
                        ? "Discord post is updated when you save."
                        : "Announced on the community channel when posted."}
                    </>
                  )}
                </p>
                <div className="order-1 flex w-full gap-2 sm:order-2 sm:w-auto sm:shrink-0 md:order-1 md:w-full md:gap-3 lg:order-2 lg:w-auto lg:justify-end lg:gap-2">
                  <button
                    type="button"
                    onClick={closeFormModal}
                    className="min-h-12 flex-1 touch-manipulation rounded-md border border-[var(--totk-dark-ocher)]/65 bg-[var(--botw-black)]/25 px-4 py-3 text-sm font-medium text-[var(--botw-pale)] hover:bg-[var(--botw-black)]/45 sm:flex-initial md:min-h-[3rem] md:flex-1 md:px-5 md:text-base lg:flex-initial"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || materialsSubmitBlocked}
                    className="flex min-h-12 flex-1 touch-manipulation items-center justify-center gap-2 rounded-md bg-[var(--totk-light-green)] px-4 py-3 text-sm font-semibold text-black hover:brightness-105 disabled:opacity-50 sm:flex-initial sm:min-w-[9.5rem] md:min-h-[3rem] md:flex-1 md:px-6 md:text-base lg:flex-initial lg:min-w-[9.5rem]"
                  >
                    {submitting ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin text-xs" aria-hidden />
                        {editingRequestId ? "Save…" : "Post…"}
                      </>
                    ) : editingRequestId ? (
                      "Save changes"
                    ) : (
                      "Post"
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {acceptFor && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 p-0 pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] backdrop-blur-[2px] sm:items-center sm:p-3 md:top-14 md:left-[var(--sidebar-width,240px)] md:p-2 md:pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] md:pt-[max(0.75rem,env(safe-area-inset-top,0px))] lg:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="accept-title"
        >
          <div className="max-h-[min(90dvh,100dvh)] w-full max-w-md overflow-x-hidden overflow-y-auto overscroll-contain rounded-t-2xl border border-[var(--botw-border)] bg-[var(--botw-deep)] p-4 shadow-2xl touch-pan-y sm:max-h-[min(94dvh,calc(100svh-1.25rem))] sm:max-w-lg sm:rounded-2xl sm:p-6 md:max-h-[min(96dvh,calc(100svh-0.75rem))] md:max-w-[min(36rem,calc(100vw-0.75rem))] md:p-8">
            <h3
              id="accept-title"
              className="text-lg font-bold text-[var(--totk-light-ocher)] md:text-xl"
            >
              Claim on the dashboard
            </h3>
            <p className="mt-2 text-sm text-[var(--botw-pale)] md:text-base md:leading-relaxed">
              <strong className="text-[var(--botw-cream)]">{acceptFor.craftItemName}</strong> — base stamina{" "}
              {acceptFor.staminaToCraftSnapshot ?? 0}. Which OC is taking this commission?
            </p>
            {eligibleAcceptors.length === 0 ? (
              <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-sm text-amber-100">
                None of your characters qualify here (job + base stamina
                {acceptFor.targetMode === "specific" ? ", or this post names someone else" : ""}). You can
                still sort it out with the requester in RP if boosts change the numbers.
              </p>
            ) : (
              <ul className={`mt-4 max-h-[min(50vh,18rem)] space-y-2 overflow-auto overscroll-contain rounded-lg p-2 md:max-h-72 md:space-y-1.5 md:p-3 ${CRAFTING_MODAL_DROPPANEL_CHROME}`}>
                {eligibleAcceptors.map((c) => (
                  <li key={c._id}>
                    <label className="flex min-h-[3rem] cursor-pointer touch-manipulation items-center gap-3 rounded-md px-3 py-3 text-sm transition-colors hover:bg-[var(--totk-light-green)]/14 has-[:checked]:bg-[var(--totk-light-green)]/22 md:min-h-[3.25rem] md:text-base">
                      <input
                        type="radio"
                        name="acceptChar"
                        checked={acceptCharId === c._id}
                        onChange={() => setAcceptCharId(c._id)}
                        className="h-4 w-4 shrink-0 accent-[var(--totk-light-green)] md:h-5 md:w-5"
                      />
                      <span>
                        <span
                          className={
                            acceptCharId === c._id
                              ? "font-semibold text-[var(--botw-cream)]"
                              : "font-medium text-[var(--totk-light-green)]"
                          }
                        >
                          {c.name}
                        </span>{" "}
                        <span className="text-[var(--totk-mid-ocher)]">
                          ({c.job}
                          {c.isModCharacter ? ", mod" : `, ${c.currentStamina} stam`})
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {acceptError && <p className="mt-3 text-sm text-red-300">{acceptError}</p>}
            <div className="mt-5 flex flex-col-reverse gap-3 sm:mt-6 sm:flex-row sm:justify-end md:gap-3">
              <button
                type="button"
                className="min-h-12 w-full touch-manipulation rounded-lg border border-[var(--botw-border)] px-4 py-3 text-sm font-medium text-[var(--botw-pale)] hover:bg-white/5 sm:w-auto md:min-h-[3rem] md:px-5 md:text-base"
                onClick={() => {
                  setAcceptFor(null);
                  setAcceptCharId(null);
                  setAcceptError(null);
                }}
              >
                Close
              </button>
              <button
                type="button"
                disabled={!acceptCharId || acceptSubmitting}
                onClick={() => void handleAccept()}
                className="min-h-12 w-full touch-manipulation rounded-lg bg-[var(--totk-light-green)] px-4 py-3 text-sm font-bold text-black disabled:opacity-50 sm:w-auto sm:min-w-[12rem] md:min-h-[3rem] md:px-6 md:text-base"
              >
                {acceptSubmitting ? "…" : "Claim commission"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CraftingRequestsPage() {
  return (
    <Suspense
      fallback={<div className="mx-auto max-w-4xl p-8 text-center text-slate-500">Loading…</div>}
    >
      <CraftingRequestsPageContent />
    </Suspense>
  );
}
