"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { formatItemImageUrl } from "@/lib/item-utils";
import { formatOpenCommissionSeekingLine } from "@/lib/crafting-request-helpers";
import { elixirTierLabel, isMixerOutputElixirName } from "@/lib/elixir-catalog";

type CraftingRequestRow = {
  _id: string;
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
  status: string;
  acceptedAt?: string | null;
  acceptedByUserId?: string | null;
  acceptedByCharacterName?: string;
  createdAt?: string;
};

type ListChar = {
  _id: string;
  name: string;
  job: string;
  currentStamina: number;
  isModCharacter: boolean;
};

type SearchChar = ListChar & {
  userId: string;
  homeVillage?: string;
  /** From character search API; used to warn when max stamina < recipe base. */
  maxStamina?: number;
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
  effectFamily: string;
  targetLevel: number;
  tierLabel: string;
  partRequirement: string;
  rarityGuidance: string;
  eligibleCritters: string[];
  eligibleParts: string[];
  eligibleCrittersCapped?: boolean;
  eligiblePartsCapped?: boolean;
  slots: { role: string; detail: string }[];
};

function parseStamina(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
  if (v && typeof v === "object" && "base" in v) {
    const n = Number((v as { base: unknown }).base);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Custom chevron: native arrow + `leading-snug` + global select `background-color` were misaligned. */
const craftingModalSelectBg = {
  backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23c9b896' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat" as const,
  backgroundPosition: "right 0.65rem center",
  backgroundSize: "1rem 1rem",
};

/** Item craftingJobs vs character.job (DB casing may differ). */
function characterJobMatchesCraftingJobs(craftingJobs: string[] | undefined, characterJob: string): boolean {
  const jobs = craftingJobs ?? [];
  if (!jobs.length) return true;
  const jl = characterJob.trim().toLowerCase();
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
  const jobs = row.craftingJobsSnapshot ?? [];
  if (!characterJobMatchesCraftingJobs(jobs, c.job)) return false;
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

export default function CraftingRequestsPage() {
  const { user, loading: sessionLoading } = useSession();
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
  }, [targetSearch, targetMode, formModalOpen, craftItemName, selectedItemMeta]);

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
      return;
    }
    const t = window.setTimeout(() => {
      (async () => {
        setElixirGuideLoading(true);
        try {
          const res = await fetch(
            `/api/crafting-requests/elixir-guide?craftItemName=${encodeURIComponent(craftItemName.trim())}&targetLevel=${elixirTier}`,
            { credentials: "include" }
          );
          const data = (await res.json()) as Partial<ElixirGuideResponse> & { error?: string };
          if (res.ok && data && Array.isArray(data.slots)) {
            setElixirGuide(data as ElixirGuideResponse);
          } else {
            setElixirGuide(null);
          }
        } catch {
          setElixirGuide(null);
        } finally {
          setElixirGuideLoading(false);
        }
      })();
    }, 220);
    return () => clearTimeout(t);
  }, [formModalOpen, craftItemName, selectedItemMeta?.isElixir, elixirTier]);

  useEffect(() => {
    if (!targetPick || !selectedItemMeta) return;
    const jobs = selectedItemMeta.craftingJobs ?? [];
    if (jobs.length > 0 && !characterJobMatchesCraftingJobs(jobs, targetPick.job)) {
      setTargetPick(null);
      setTargetSearch("");
    }
  }, [selectedItemMeta, targetPick]);

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
    setItemPickerOpen(false);
    setOcMaterialCheck(null);
    setOcMaterialLoading(false);
  };

  const openEditRequest = useCallback(
    async (row: CraftingRequestRow) => {
      if (!user?.id || row.requesterDiscordId !== user.id || row.status !== "open") return;
      setFormError(null);
      setEditingRequestId(row._id);
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
    setItemQuery("");
    setItemOptions([]);
    setItemPickerOpen(false);
    setTargetPick(null);
    setTargetSearch("");
    setTargetResults([]);
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
      !characterJobMatchesCraftingJobs(selectedItemMeta.craftingJobs, targetPick.job)
    ) {
      setFormError("That character's job can't craft this item — pick someone else or use Open.");
      return;
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
      };
      const isEdit = Boolean(editingRequestId);
      const res = await fetch(
        isEdit ? `/api/crafting-requests/${editingRequestId}` : "/api/crafting-requests",
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
      const res = await fetch(`/api/crafting-requests/${row._id}`, {
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
      const res = await fetch(`/api/crafting-requests/${row._id}/cancel`, {
        method: "POST",
        credentials: "include",
      });
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
      const res = await fetch(`/api/crafting-requests/${acceptFor._id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ acceptorCharacterId: acceptCharId }),
      });
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
      const res = await fetch(`/api/crafting-requests/${row._id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ acceptorCharacterId: charId }),
      });
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

  /** Modal-only: brown panel + pale text (matches dashboard hero cards). */
  const modalFieldClass =
    "w-full rounded-md border border-[var(--totk-dark-ocher)]/55 bg-[var(--botw-black)]/28 px-3 py-2 text-sm leading-snug text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-200)]/85 focus:border-[var(--totk-light-green)]/65 focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-green)]/30";
  /** Selects: avoid `leading-snug` + native chevron clash; reserve space for SVG arrow. */
  const modalSelectClass =
    "w-full min-h-[2.5rem] rounded-md border border-[var(--totk-dark-ocher)]/55 px-3 py-2 pr-9 text-sm leading-normal text-[var(--botw-pale)] focus:border-[var(--totk-light-green)]/65 focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-green)]/30 appearance-none";
  const modalLabelClass = "mb-1 block text-sm font-medium text-[var(--totk-light-ocher)]";
  const modalHintClass = "text-xs leading-snug text-[var(--botw-pale)]/78";

  return (
    <div className="min-h-full w-full pb-[max(4rem,env(safe-area-inset-bottom,0px))]">
      <div className="relative mx-auto max-w-6xl px-3 pt-4 sm:px-4 sm:pt-6 md:px-6 md:pt-10">
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
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end lg:flex-col lg:items-stretch xl:flex-row xl:items-center">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRequestId(null);
                    setFormModalOpen(true);
                    setFormError(null);
                  }}
                  className="inline-flex min-h-[2.75rem] w-full items-center justify-center gap-2 rounded-xl bg-[var(--totk-light-green)] px-5 py-3 text-sm font-bold text-black shadow-lg shadow-black/20 transition hover:brightness-110 active:scale-[0.98] sm:w-auto"
                >
                  <i className="fa-solid fa-plus" aria-hidden />
                  Post a request
                </button>
                <button
                  type="button"
                  onClick={() => setMyActivityOpen((v) => !v)}
                  aria-expanded={myActivityOpen}
                  aria-controls="crafting-my-activity-panel"
                  className={`group inline-flex min-h-[2.75rem] w-full min-w-0 items-center justify-center gap-2.5 rounded-xl border-2 px-4 py-3 text-sm font-bold shadow-md shadow-black/15 transition active:scale-[0.98] sm:w-auto sm:min-w-[10.5rem] sm:px-5 ${
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
e have de                                  </button>
                                </div>
                                <p className="hidden text-[10px] leading-snug text-[var(--botw-pale)]/60 md:block">
                                  Withdraw keeps a record; Delete removes the board post.
                                </p>
                              </div>
                            ) : youPosted && row.status === "accepted" ? (
                              <div className="flex items-center border-t border-[var(--botw-border)]/40 pt-3 md:border-l md:border-t-0 md:pl-5 md:pt-0">
                                <p className="text-[11px] leading-relaxed text-[var(--botw-pale)]/75 md:max-w-[12rem] md:self-center md:pt-1">
                                  <i className="fa-solid fa-circle-check mr-1 text-[var(--totk-light-green)]" aria-hidden />
                                  Someone claimed this commission.
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

          <ul className="grid list-none gap-5 p-0 sm:gap-6 md:grid-cols-2 md:gap-6 lg:gap-7">
            {openRequests.map((row) => {
              const thumbSrc = formatItemImageUrl(row.craftItemImage);
              const isOpenCall = row.targetMode !== "specific" || !row.targetCharacterName;
              const youCanTake =
                user && row.requesterDiscordId !== user.id && requestIdsYouCanAccept.has(row._id);
              return (
                <li key={row._id}>
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
                                    className="min-h-[2.75rem] w-full rounded-lg bg-[var(--totk-light-green)] px-4 py-2.5 text-xs font-bold text-black shadow-md shadow-black/15 transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 sm:w-auto"
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
                                  className="min-h-[2.75rem] w-full rounded-lg bg-[var(--totk-light-green)] px-4 py-2.5 text-xs font-bold text-black shadow-md shadow-black/15 transition hover:brightness-110 active:scale-[0.98] sm:w-auto"
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 pt-[env(safe-area-inset-top,0px)] backdrop-blur-[3px] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="craft-form-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeFormModal();
          }}
        >
          <div
            className="flex max-h-[min(92dvh,100dvh)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border-2 border-[var(--totk-dark-ocher)]/75 bg-gradient-to-b from-[var(--totk-brown)] via-[var(--totk-brown)] to-[var(--botw-warm-black)] text-[var(--botw-pale)] shadow-[0_-8px_40px_rgba(0,0,0,0.45)] sm:max-h-[min(88dvh,720px)] sm:max-w-5xl sm:rounded-xl sm:shadow-2xl lg:max-w-6xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="relative flex shrink-0 items-start justify-between gap-3 border-b border-[var(--totk-dark-ocher)]/55 bg-[var(--botw-black)]/15 px-4 py-3 sm:px-5 sm:py-3">
              <div className="min-w-0 pr-2 pt-1">
                <div className="mx-auto mb-2.5 h-1 w-9 rounded-full bg-[var(--totk-mid-ocher)]/45 sm:hidden" aria-hidden />
                <h2 id="craft-form-title" className="text-base font-semibold tracking-tight text-[var(--totk-light-ocher)]">
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
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--botw-pale)]/70 transition hover:bg-[var(--botw-black)]/35 hover:text-[var(--totk-light-ocher)]"
                aria-label="Close dialog"
              >
                <i className="fa-solid fa-xmark text-sm" />
              </button>
            </header>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 touch-pan-y sm:px-5 sm:py-3 [scrollbar-gutter:stable]">
                <div className="space-y-5">
                  <section className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--totk-mid-ocher)]">
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
                              setItemPickerOpen(false);
                              setTargetPick(null);
                              setTargetSearch("");
                              setTargetResults([]);
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
                            className={modalFieldClass}
                            autoComplete="off"
                          />
                          {itemLoading ? (
                            <p className={`${modalHintClass} mt-1`}>Searching…</p>
                          ) : null}
                          {itemOptions.length > 0 ? (
                            <ul className="absolute z-[80] mt-1 max-h-36 w-full overflow-auto rounded-md border border-[var(--totk-dark-ocher)]/55 bg-[var(--botw-warm-black)] py-0.5 shadow-xl">
                              {itemOptions.map((it) => (
                                <li key={it.itemName}>
                                  <button
                                    type="button"
                                    className="w-full px-3 py-2 text-left text-sm text-[var(--botw-pale)] hover:bg-[var(--totk-brown)]/90"
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
                    <section className="space-y-3 rounded-xl border border-[var(--totk-light-green)]/40 bg-[var(--totk-light-green)]/08 p-4 ring-1 ring-[var(--totk-light-green)]/15">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--totk-light-green)]">
                        Elixir mixer — customize
                      </p>
                      <p className="text-sm leading-relaxed text-[var(--botw-pale)]">
                        You chose{" "}
                        <strong className="text-[var(--botw-cream)]">{craftItemName}</strong>. Pick the{" "}
                        <strong className="text-[var(--botw-cream)]">potency tier</strong> you want. Mixer recipes
                        are flexible — use{" "}
                        <strong className="text-[var(--botw-cream)]">Materials &amp; notes</strong> for exact
                        bottles, fairies, or who brings which critters/parts.
                      </p>
                      <div>
                        <label className={modalLabelClass} htmlFor="craft-elixir-tier">
                          What level do you want?
                        </label>
                        <select
                          id="craft-elixir-tier"
                          value={elixirTier}
                          onChange={(e) =>
                            setElixirTier(Number(e.target.value) as 1 | 2 | 3)
                          }
                          className={modalSelectClass}
                          style={craftingModalSelectBg}
                        >
                          <option value={1}>Basic</option>
                          <option value={2}>Mid</option>
                          <option value={3}>High</option>
                        </select>
                      </div>
                      {elixirGuideLoading ? (
                        <p className={`${modalHintClass} flex items-center gap-2`}>
                          <i className="fa-solid fa-spinner fa-spin text-xs" aria-hidden />
                          Calculating mixer slots &amp; examples…
                        </p>
                      ) : elixirGuide ? (
                        <div className="space-y-3 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-black/22 p-3 text-xs leading-relaxed text-[var(--botw-pale)]">
                          <p className="font-semibold text-[var(--totk-light-ocher)]">
                            What to bring (flexible recipe)
                          </p>
                          <ul className="list-inside list-disc space-y-1.5">
                            {elixirGuide.slots.map((s) => (
                              <li key={s.role}>
                                <span className="font-medium text-[var(--botw-cream)]">{s.role}:</span>{" "}
                                {s.detail}
                              </li>
                            ))}
                          </ul>
                          <p>
                            <span className="font-semibold text-[var(--totk-light-ocher)]">
                              Monster part rule:
                            </span>{" "}
                            {elixirGuide.partRequirement}
                          </p>
                          <p className="text-[var(--botw-pale)]/92">{elixirGuide.rarityGuidance}</p>
                          {elixirGuide.eligibleCritters.length > 0 ? (
                            <div className="space-y-1.5">
                              <p className="font-semibold text-[var(--totk-light-ocher)]">
                                Eligible critters ({elixirGuide.eligibleCritters.length}
                                {elixirGuide.eligibleCrittersCapped ? "+" : ""})
                              </p>
                              <p className="text-[10px] leading-snug text-[var(--botw-pale)]/75">
                                Same effect family as this elixir — any one satisfies the critter slot; extras
                                optional.
                              </p>
                              <div className="max-h-52 overflow-y-auto rounded-md border border-[var(--botw-border)]/35 bg-black/28 px-2.5 py-2">
                                <ul className="grid list-none gap-x-3 gap-y-0.5 sm:grid-cols-2">
                                  {elixirGuide.eligibleCritters.map((name) => (
                                    <li
                                      key={name}
                                      className="flex gap-1.5 text-[11px] leading-snug text-[var(--botw-pale)]/90"
                                    >
                                      <span className="shrink-0 text-[var(--totk-mid-ocher)]" aria-hidden>
                                        •
                                      </span>
                                      <span className="min-w-0">{name}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          ) : null}
                          {elixirGuide.eligibleParts.length > 0 ? (
                            <div className="space-y-1.5">
                              <p className="font-semibold text-[var(--totk-light-ocher)]">
                                Eligible monster parts ({elixirGuide.eligibleParts.length}
                                {elixirGuide.eligiblePartsCapped ? "+" : ""})
                              </p>
                              <p className="text-[10px] leading-snug text-[var(--botw-pale)]/75">
                                Element rule: {elixirGuide.partRequirement}. Any one satisfies the part slot.
                              </p>
                              <div className="max-h-52 overflow-y-auto rounded-md border border-[var(--botw-border)]/35 bg-black/28 px-2.5 py-2">
                                <ul className="grid list-none gap-x-3 gap-y-0.5 sm:grid-cols-2">
                                  {elixirGuide.eligibleParts.map((name) => (
                                    <li
                                      key={name}
                                      className="flex gap-1.5 text-[11px] leading-snug text-[var(--botw-pale)]/90"
                                    >
                                      <span className="shrink-0 text-[var(--totk-mid-ocher)]" aria-hidden>
                                        •
                                      </span>
                                      <span className="min-w-0">{name}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  <section className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--totk-mid-ocher)]">
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

                      <div>
                        <label className={modalLabelClass} htmlFor="craft-requester-oc">
                          Your OC
                        </label>
                        <select
                          id="craft-requester-oc"
                          value={requesterCharacterName}
                          onChange={(e) => setRequesterCharacterName(e.target.value)}
                          className={modalSelectClass}
                          style={craftingModalSelectBg}
                          required
                        >
                          <option value="">Choose…</option>
                          {myChars.map((c) => (
                            <option key={c._id} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>

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
                          <div className="relative z-[2] overflow-hidden rounded-xl border border-[var(--totk-dark-ocher)]/55 bg-[var(--botw-black)]/28 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                            <div className="border-b border-[var(--totk-dark-ocher)]/35 bg-[var(--botw-black)]/20 px-3 py-2.5 sm:px-4">
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
                                      className="rounded-md border border-[var(--totk-dark-ocher)]/45 bg-[var(--totk-brown)]/35 px-2 py-0.5 text-[11px] font-medium text-[var(--totk-ivory)]"
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
                                    className={modalFieldClass}
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
                                    <ul className="mt-2 max-h-44 overflow-auto rounded-lg border border-[var(--totk-dark-ocher)]/45 bg-[var(--botw-warm-black)]/95 shadow-lg">
                                      {targetResults.map((c) => {
                                        const stamShort = c.isModCharacter
                                          ? "mod"
                                          : `${c.currentStamina} stam (max ${effectiveMaxStamina(c)})`;
                                        const stamWarn = isBelowRecipeMaxStamina(c, recipeBaseStaminaCost);
                                        return (
                                          <li
                                            key={c._id}
                                            className="border-b border-[var(--totk-dark-ocher)]/25 last:border-b-0"
                                          >
                                            <button
                                              type="button"
                                              className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm text-[var(--botw-pale)] transition hover:bg-[var(--totk-brown)]/90 ${
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
                                              <span className="font-medium text-[var(--totk-ivory)]">
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
                              <div className="rounded-md border border-amber-500/40 bg-amber-950/25 px-2.5 py-2 text-xs leading-relaxed text-amber-50">
                                <p className="font-semibold text-amber-100">
                                  {requesterCharacterName} is short on recipe materials
                                </p>
                                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-amber-100/95">
                                  {ocMaterialCheck.lines
                                    .filter((l) => !l.sufficient)
                                    .map((l) => (
                                      <li key={l.itemName}>
                                        <span className="font-medium">{l.itemName}</span>: need{" "}
                                        {l.quantity}, have {l.ownedQty}
                                      </li>
                                    ))}
                                </ul>
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
              <div className="flex shrink-0 flex-col gap-2 border-t border-[var(--totk-dark-ocher)]/55 bg-[var(--botw-black)]/22 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-2.5 sm:pb-3">
                <p className={`${modalHintClass} order-2 hidden min-w-0 sm:order-1 sm:block sm:max-w-[55%]`}>
                  <i className="fa-brands fa-discord mr-1 text-[#5865F2]" aria-hidden />
                  {editingRequestId
                    ? "Discord post is updated when you save."
                    : "Announced on the community channel when posted."}
                </p>
                <div className="order-1 flex w-full gap-2 sm:order-2 sm:w-auto sm:shrink-0">
                  <button
                    type="button"
                    onClick={closeFormModal}
                    className="min-h-[2.75rem] flex-1 rounded-md border border-[var(--totk-dark-ocher)]/65 bg-[var(--botw-black)]/25 px-4 py-2.5 text-sm font-medium text-[var(--botw-pale)] hover:bg-[var(--botw-black)]/45 sm:min-h-0 sm:flex-initial sm:py-2"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex min-h-[2.75rem] flex-1 items-center justify-center gap-2 rounded-md bg-[var(--totk-light-green)] px-4 py-2.5 text-sm font-semibold text-black hover:brightness-105 disabled:opacity-50 sm:min-h-0 sm:flex-initial sm:min-w-[8.5rem] sm:py-2"
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
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/65 p-0 pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] backdrop-blur-[2px] sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="accept-title"
        >
          <div className="max-h-[min(90dvh,100dvh)] w-full max-w-md overflow-y-auto rounded-t-2xl border border-[var(--botw-border)] bg-[var(--botw-deep)] p-4 shadow-2xl sm:rounded-2xl sm:p-6">
            <h3 id="accept-title" className="text-lg font-bold text-[var(--totk-light-ocher)]">
              Claim on the dashboard
            </h3>
            <p className="mt-2 text-sm text-[var(--botw-pale)]">
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
              <ul className="mt-4 max-h-48 space-y-2 overflow-auto rounded-lg border border-[var(--botw-border)]/60 p-2">
                {eligibleAcceptors.map((c) => (
                  <li key={c._id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-[var(--botw-pale)] hover:bg-white/5 has-[:checked]:bg-[var(--totk-light-green)]/10">
                      <input
                        type="radio"
                        name="acceptChar"
                        checked={acceptCharId === c._id}
                        onChange={() => setAcceptCharId(c._id)}
                        className="accent-[var(--totk-light-green)]"
                      />
                      <span>
                        {c.name}{" "}
                        <span className="text-[var(--botw-pale)]/70">
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
            <div className="mt-5 flex flex-col-reverse gap-2 sm:mt-6 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="min-h-[2.75rem] w-full rounded-lg border border-[var(--botw-border)] px-4 py-2.5 text-sm font-medium text-[var(--botw-pale)] hover:bg-white/5 sm:w-auto sm:min-h-0 sm:py-2"
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
                className="min-h-[2.75rem] w-full rounded-lg bg-[var(--totk-light-green)] px-4 py-2.5 text-sm font-bold text-black disabled:opacity-50 sm:w-auto sm:min-h-0 sm:py-2"
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
