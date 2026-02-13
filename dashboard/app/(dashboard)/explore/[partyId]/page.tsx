"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "@/hooks/use-session";
import { formatItemImageUrl } from "@/lib/item-utils";

const REGION_BANNERS: Record<string, string> = {
  eldin: "/assets/banners/Rudania1.png",
  lanayru: "/assets/banners/Inariko1.png",
  faron: "/assets/banners/Vhintl1.png",
};

const QUADRANT_STATUS_COLORS: Record<string, string> = {
  inaccessible: "#1a1a1a",
  unexplored: "#b91c1c",
  explored: "#ca8a04",
  secured: "#15803d",
};

const REGIONS: Record<string, { label: string; village: string; square: string; quadrant: string }> = {
  eldin: { label: "Eldin", village: "Rudania", square: "H5", quadrant: "Q3" },
  lanayru: { label: "Lanayru", village: "Inariko", square: "H8", quadrant: "Q2" },
  faron: { label: "Faron", village: "Vhintl", square: "F10", quadrant: "Q4" },
};


const POLL_INTERVAL_MS = 6000;

type PartyMember = {
  characterId: string;
  userId: string;
  name: string;
  currentHearts?: number;
  currentStamina?: number;
  icon?: string;
  items: Array<{ itemName: string; modifierHearts?: number; staminaRecovered?: number; emoji?: string }>;
};

type GatheredItem = {
  characterId: string;
  characterName: string;
  itemName: string;
  quantity: number;
  emoji?: string;
};

type ProgressEntry = {
  at: string;
  characterName: string;
  outcome: string;
  message: string;
  loot?: { itemName: string; emoji?: string };
  heartsLost?: number;
  staminaLost?: number;
  heartsRecovered?: number;
  staminaRecovered?: number;
};

type PartyData = {
  partyId: string;
  region: string;
  square: string;
  quadrant: string;
  status: string;
  totalHearts: number;
  totalStamina: number;
  leaderId: string;
  members: PartyMember[];
  currentUserJoined: boolean;
  currentUserMember: PartyMember | null;
  isLeader: boolean;
  discordThreadUrl?: string | null;
  currentTurn?: number;
  quadrantState?: string;
  /** Q1–Q4 status from exploring map model (Square.quadrants[].status); drives quadrant colors */
  quadrantStatuses?: Record<string, string>;
  gatheredItems?: GatheredItem[];
  progressLog?: ProgressEntry[];
};

type Character = {
  _id: string;
  name: string;
  currentVillage: string;
  currentHearts?: number;
  currentStamina?: number;
  maxHearts?: number;
  maxStamina?: number;
  icon?: string | null;
};

type ExploreItem = {
  _id: string;
  itemName: string;
  emoji?: string;
  modifierHearts?: number;
  staminaRecovered?: number;
  image?: string;
};

function normalizeVillage(v: string): string {
  return (v || "").trim().toLowerCase();
}

export default function ExplorePartyPage() {
  const params = useParams();
  const router = useRouter();
  const partyId = (params?.partyId as string) ?? "";
  const { user, loading: sessionLoading } = useSession();
  const userId = user?.id ?? null;

  const [party, setParty] = useState<PartyData | null>(null);
  const [partyError, setPartyError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [exploreItemNames, setExploreItemNames] = useState<Set<string>>(new Set());
  const [exploreItemStats, setExploreItemStats] = useState<Map<string, { modifierHearts: number; staminaRecovered: number }>>(new Map());
  const [exploreItemImages, setExploreItemImages] = useState<Map<string, string>>(new Map());
  const [inventoryWithQuantity, setInventoryWithQuantity] = useState<Array<{ itemName: string; quantity: number }>>([]);
  const [loadingChars, setLoadingChars] = useState(false);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [editingItems, setEditingItems] = useState(false);
  const [editItems, setEditItems] = useState<string[]>([]);
  const [editInventoryWithQuantity, setEditInventoryWithQuantity] = useState<Array<{ itemName: string; quantity: number }>>([]);
  const [updatingItems, setUpdatingItems] = useState(false);
  const [updateItemsError, setUpdateItemsError] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [itemHighlightIndex, setItemHighlightIndex] = useState(0);
  const [itemSuggestionsOpen, setItemSuggestionsOpen] = useState(false);
  const [editItemSearch, setEditItemSearch] = useState("");
  const [editItemHighlightIndex, setEditItemHighlightIndex] = useState(0);
  const [editSuggestionsOpen, setEditSuggestionsOpen] = useState(false);
  const [startingExpedition, setStartingExpedition] = useState(false);
  const [startExpeditionError, setStartExpeditionError] = useState<string | null>(null);
  const [squarePreview, setSquarePreview] = useState<{
    layers: Array<{ name: string; url: string }>;
    quadrantBounds: { x: number; y: number; w: number; h: number } | null;
  } | null>(null);

  const regionVillage = party?.region ? normalizeVillage(REGIONS[party.region]?.village ?? party.region) : "";
  const eligibleCharacters = regionVillage
    ? characters.filter((c) => normalizeVillage(c.currentVillage) === regionVillage)
    : [];

  const fetchParty = useCallback(async () => {
    if (!partyId) return;
    try {
      const res = await fetch(`/api/explore/parties/${encodeURIComponent(partyId)}`, { cache: "no-store" });
      if (res.status === 404) {
        setParty(null);
        setPartyError("Expedition not found.");
        return;
      }
      if (!res.ok) {
        setPartyError("Failed to load expedition.");
        return;
      }
      const data = await res.json();
      setParty(data);
      setPartyError(null);
    } catch {
      setPartyError("Failed to load expedition.");
    }
  }, [partyId]);

  useEffect(() => {
    fetchParty();
  }, [fetchParty]);

  useEffect(() => {
    if (!partyId || !party) return;
    const t = setInterval(fetchParty, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [partyId, party, fetchParty]);

  useEffect(() => {
    if (!party?.square) {
      setSquarePreview(null);
      return;
    }
    const q = party.quadrant || "";
    fetch(`/api/explore/square-preview?square=${encodeURIComponent(party.square)}${q ? `&quadrant=${encodeURIComponent(q)}` : ""}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.layers) {
          setSquarePreview({
            layers: data.layers,
            quadrantBounds: data.quadrantBounds ?? null,
          });
        } else {
          setSquarePreview(null);
        }
      })
      .catch(() => setSquarePreview(null));
  }, [party?.square, party?.quadrant]);

  useEffect(() => {
    if (!userId) return;
    setLoadingChars(true);
    fetch("/api/characters/my-ocs?limit=100")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        setCharacters(list);
      })
      .catch(() => setCharacters([]))
      .finally(() => setLoadingChars(false));
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetch("/api/explore/items")
      .then((r) => r.json())
      .then((list) => (Array.isArray(list) ? list : []))
      .then((items: ExploreItem[]) => {
        const names = new Set<string>();
        const stats = new Map<string, { modifierHearts: number; staminaRecovered: number }>();
        const images = new Map<string, string>();
        for (const it of items) {
          const name = (it.itemName || "").trim();
          if (!name) continue;
          names.add(name);
          stats.set(name.toLowerCase(), {
            modifierHearts: it.modifierHearts ?? 0,
            staminaRecovered: it.staminaRecovered ?? 0,
          });
          images.set(name.toLowerCase(), formatItemImageUrl(it.image));
        }
        setExploreItemNames(names);
        setExploreItemStats(stats);
        setExploreItemImages(images);
      })
      .catch(() => {
        setExploreItemNames(new Set());
        setExploreItemStats(new Map());
        setExploreItemImages(new Map());
      });
  }, [userId]);

  const selectedCharacter = eligibleCharacters.find((c) => String(c._id) === String(selectedCharacterId));

  // Paving bundles: 5 Eldin Ore = 1 bundle, 10 Wood = 1 bundle (per plan)
  const bundleQuantities = useCallback(
    (byName: Map<string, number>) => {
      const eldin = byName.get("eldin ore") ?? 0;
      const wood = byName.get("wood") ?? 0;
      return {
        "Eldin Ore Bundle": Math.floor(eldin / 5),
        "Wood Bundle": Math.floor(wood / 10),
      };
    },
    []
  );

  useEffect(() => {
    if (!selectedCharacter?.name || !userId || exploreItemNames.size === 0) {
      setInventoryWithQuantity([]);
      return;
    }
    setLoadingInventory(true);
    setSelectedItems([]);
    fetch(`/api/inventories/character/${encodeURIComponent(selectedCharacter.name)}/items`)
      .then((r) => r.json())
      .then((data: { data?: Array<{ itemName: string; quantity?: number }> }) => {
        const list = Array.isArray(data?.data) ? data.data : [];
        const all = list.map((it) => ({ itemName: (it.itemName || "").trim(), quantity: Math.max(0, Number(it.quantity) ?? 0) })).filter((it) => it.itemName);
        const byName = new Map<string, number>();
        for (const it of all) {
          const key = it.itemName.toLowerCase();
          byName.set(key, (byName.get(key) ?? 0) + it.quantity);
        }
        const validLower = new Set([...exploreItemNames].map((n) => n.toLowerCase()));
        const bundles = bundleQuantities(byName);
        const fromInventory = Array.from(byName.entries())
          .filter(([k]) => validLower.has(k) && k !== "eldin ore" && k !== "wood")
          .map(([k, q]) => ({ itemName: all.find((v) => v.itemName.toLowerCase() === k)?.itemName ?? k, quantity: q }));
        const fromBundles = (["Eldin Ore Bundle", "Wood Bundle"] as const)
          .filter((name) => exploreItemNames.has(name) && (bundles[name] ?? 0) > 0)
          .map((name) => ({ itemName: name, quantity: bundles[name] ?? 0 }));
        const arr = [...fromInventory, ...fromBundles].sort((a, b) => a.itemName.localeCompare(b.itemName));
        setInventoryWithQuantity(arr);
      })
      .catch(() => setInventoryWithQuantity([]))
      .finally(() => setLoadingInventory(false));
  }, [selectedCharacter?.name, userId, exploreItemNames, bundleQuantities]);

  const inventoryQty = useCallback(
    (itemName: string) => inventoryWithQuantity.find((it) => it.itemName.toLowerCase() === itemName.toLowerCase())?.quantity ?? 0,
    [inventoryWithQuantity]
  );

  const countSelected = useCallback(
    (itemName: string) => selectedItems.filter((s) => s.toLowerCase() === itemName.toLowerCase()).length,
    [selectedItems]
  );

  const canAddItem = useCallback(
    (itemName: string) => {
      if (selectedItems.length >= 3) return false;
      const qty = inventoryQty(itemName);
      const already = countSelected(itemName);
      return already < qty;
    },
    [selectedItems.length, inventoryQty, countSelected]
  );

  const itemSuggestionsList = inventoryWithQuantity
    .filter((it) => {
      const matchesSearch = !itemSearch.trim() || it.itemName.toLowerCase().includes(itemSearch.trim().toLowerCase());
      return matchesSearch && canAddItem(it.itemName);
    })
    .slice(0, 12);

  const addSelectedItem = useCallback(
    (itemName: string) => {
      if (!canAddItem(itemName)) return;
      setSelectedItems((prev) => (prev.length >= 3 ? prev : [...prev, itemName]));
    },
    [canAddItem]
  );

  const removeSelectedItem = useCallback((index: number) => {
    setSelectedItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const startEditingItems = useCallback(() => {
    if (!party?.currentUserMember?.items) return;
    setEditItems(party.currentUserMember.items.map((it) => it.itemName));
    setEditingItems(true);
    setUpdateItemsError(null);
  }, [party?.currentUserMember?.items]);

  useEffect(() => {
    if (!editingItems || !party?.currentUserMember?.name || !userId || exploreItemNames.size === 0) {
      if (!editingItems) setEditInventoryWithQuantity([]);
      return;
    }
    const name = party.currentUserMember.name;
    fetch(`/api/inventories/character/${encodeURIComponent(name)}/items`)
      .then((r) => r.json())
      .then((data: { data?: Array<{ itemName: string; quantity?: number }> }) => {
        const list = Array.isArray(data?.data) ? data.data : [];
        const all = list.map((it) => ({ itemName: (it.itemName || "").trim(), quantity: Math.max(0, Number(it.quantity) ?? 0) })).filter((it) => it.itemName);
        const byName = new Map<string, number>();
        for (const it of all) {
          const key = it.itemName.toLowerCase();
          byName.set(key, (byName.get(key) ?? 0) + it.quantity);
        }
        const validLower = new Set([...exploreItemNames].map((n) => n.toLowerCase()));
        const bundles = bundleQuantities(byName);
        const fromInventory = Array.from(byName.entries())
          .filter(([k]) => validLower.has(k) && k !== "eldin ore" && k !== "wood")
          .map(([k, q]) => ({ itemName: all.find((v) => v.itemName.toLowerCase() === k)?.itemName ?? k, quantity: q }));
        const fromBundles = (["Eldin Ore Bundle", "Wood Bundle"] as const)
          .filter((name) => exploreItemNames.has(name) && (bundles[name] ?? 0) > 0)
          .map((name) => ({ itemName: name, quantity: bundles[name] ?? 0 }));
        const arr = [...fromInventory, ...fromBundles].sort((a, b) => a.itemName.localeCompare(b.itemName));
        setEditInventoryWithQuantity(arr);
      })
      .catch(() => setEditInventoryWithQuantity([]));
  }, [editingItems, party?.currentUserMember?.name, userId, exploreItemNames, bundleQuantities]);

  const cancelEditingItems = useCallback(() => {
    setEditingItems(false);
    setUpdateItemsError(null);
  }, []);

  const editQty = useCallback(
    (itemName: string) => editInventoryWithQuantity.find((it) => it.itemName.toLowerCase() === itemName.toLowerCase())?.quantity ?? 0,
    [editInventoryWithQuantity]
  );
  const editCount = useCallback((itemName: string) => editItems.filter((s) => s.toLowerCase() === itemName.toLowerCase()).length, [editItems]);
  const canAddEditItem = useCallback(
    (itemName: string) => editItems.length < 3 && editCount(itemName) < editQty(itemName),
    [editItems.length, editCount, editQty]
  );

  const editSuggestionsList = editInventoryWithQuantity
    .filter((it) => {
      const matchesSearch = !editItemSearch.trim() || it.itemName.toLowerCase().includes(editItemSearch.trim().toLowerCase());
      return matchesSearch && canAddEditItem(it.itemName);
    })
    .slice(0, 12);
  const addEditItem = useCallback((itemName: string) => {
    if (editItems.length >= 3) return;
    setEditItems((prev) => [...prev, itemName]);
  }, [editItems.length]);
  const removeEditItem = useCallback((index: number) => {
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const saveEditItems = useCallback(async () => {
    if (editItems.length > 3) return;
    setUpdatingItems(true);
    setUpdateItemsError(null);
    try {
      const res = await fetch(`/api/explore/parties/${encodeURIComponent(partyId)}/items`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemNames: editItems }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUpdateItemsError(data.error ?? "Failed to update items");
        return;
      }
      setEditingItems(false);
      await fetchParty();
    } catch (e) {
      setUpdateItemsError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setUpdatingItems(false);
    }
  }, [partyId, editItems, fetchParty]);

  const joinParty = useCallback(async () => {
    if (!partyId || !selectedCharacterId) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(`/api/explore/parties/${encodeURIComponent(partyId)}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: selectedCharacterId, itemNames: selectedItems }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.error ?? "Failed to join");
        return;
      }
      await fetchParty();
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setJoining(false);
    }
  }, [partyId, selectedCharacterId, selectedItems, fetchParty]);

  const copyShareLink = useCallback(() => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/explore/${partyId}` : "";
    void navigator.clipboard.writeText(url);
  }, [partyId]);

  const startExpedition = useCallback(async () => {
    setStartExpeditionError(null);
    setStartingExpedition(true);
    try {
      const res = await fetch(`/api/explore/parties/${encodeURIComponent(partyId)}/start`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStartExpeditionError(data.error ?? "Failed to start expedition");
        return;
      }
      await fetchParty();
    } finally {
      setStartingExpedition(false);
    }
  }, [partyId, fetchParty]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <i className="fa-solid fa-spinner fa-spin text-2xl text-[var(--totk-light-green)]" aria-hidden />
      </div>
    );
  }

  if (!partyId) {
    return (
      <div className="min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-lg rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/20 to-[var(--botw-warm-black)]/60 p-6 shadow-lg">
          <p className="text-[var(--totk-grey-200)]">Missing expedition ID.</p>
          <Link href="/explore" className="mt-3 inline-block font-medium text-[var(--totk-light-green)] hover:underline">
            Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  if (partyError && !party) {
    return (
      <div className="min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-lg rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/20 to-[var(--botw-warm-black)]/60 p-6 shadow-lg">
          <p className="text-red-400">{partyError}</p>
          <Link href="/explore" className="mt-3 inline-block font-medium text-[var(--totk-light-green)] hover:underline">
            Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  if (!party) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <i className="fa-solid fa-spinner fa-spin text-2xl text-[var(--totk-light-green)]" aria-hidden />
      </div>
    );
  }

  const regionInfo = REGIONS[party.region];
  const canJoin =
    userId &&
    !party.currentUserJoined &&
    party.status === "open" &&
    party.members.length < 4 &&
    selectedCharacterId &&
    selectedItems.length <= 3;

  const showYourSlotPreview =
    userId &&
    !party.currentUserJoined &&
    party.status === "open" &&
    (selectedCharacterId || selectedItems.length > 0);

  function PartySlotCard({
    name,
    icon,
    hearts,
    stamina,
    items,
    isYou,
    label,
  }: {
    name: string;
    icon?: string | null;
    hearts?: number;
    stamina?: number;
    items: Array<{ itemName: string }>;
    isYou?: boolean;
    label?: string;
  }) {
    return (
      <div
        className={[
          "min-w-[12rem] flex-1 rounded-2xl border px-5 py-4 shadow-lg transition-shadow",
          isYou
            ? "border-[var(--totk-light-green)]/80 bg-gradient-to-br from-[var(--totk-dark-green)]/40 to-[var(--botw-warm-black)]/60 ring-1 ring-[var(--totk-light-green)]/30"
            : "border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40",
        ].join(" ")}
      >
        <div className="flex items-center gap-4">
          <div
            className={[
              "relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-full bg-[var(--botw-warm-black)]",
              isYou ? "ring-2 ring-[var(--totk-light-green)]/60 ring-offset-2 ring-offset-[var(--botw-warm-black)]" : "border border-[var(--totk-dark-ocher)]/60",
            ].join(" ")}
          >
            {icon ? (
              <img src={icon} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--totk-grey-200)]">
                <i className="fa-solid fa-user" aria-hidden />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-bold text-[var(--totk-ivory)]">{name}</p>
            {label && (
              <span className="inline-block text-xs font-medium text-[var(--totk-light-green)]">{label}</span>
            )}
            <div className="mt-1 flex items-center gap-3 text-sm text-[var(--totk-grey-200)]">
              <span className="flex items-center gap-1" title="Hearts">
                <i className="fa-solid fa-heart text-[10px] text-red-400/90" aria-hidden />
                <span>{hearts ?? "?"}</span>
              </span>
              <span className="flex items-center gap-1" title="Stamina">
                <i className="fa-solid fa-bolt text-[10px] text-[var(--totk-light-green)]/90" aria-hidden />
                <span>{stamina ?? "?"}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          {([0, 1, 2] as const).map((i) => {
            const it = items[i];
            if (!it) return <div key={i} className="h-9 rounded border border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/40" />;
            const imgUrl = exploreItemImages.get(it.itemName.toLowerCase()) ?? null;
            const stats = exploreItemStats.get(it.itemName.toLowerCase());
            const h = stats?.modifierHearts ?? 0;
            const s = stats?.staminaRecovered ?? 0;
            const statStr = `❤️${h} | 🟩${s}`;
            return (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/60 px-2 py-1.5"
              >
                <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded border border-[var(--totk-dark-ocher)]/50">
                  {imgUrl ? (
                    <Image
                      src={imgUrl}
                      alt=""
                      width={32}
                      height={32}
                      className="h-full w-full object-cover"
                      unoptimized={imgUrl.startsWith("http") || imgUrl.startsWith("/api/")}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-[var(--totk-grey-200)]">
                      {it.itemName.slice(0, 1)}
                    </div>
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate text-xs text-[var(--totk-ivory)]">{it.itemName}</span>
                <span className="flex-shrink-0 text-[10px] text-[var(--totk-grey-200)]">{statStr}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const regionBanner = party.region ? REGION_BANNERS[party.region] : null;

  return (
    <div className="min-h-full bg-gradient-to-b from-[var(--botw-warm-black)]/30 to-transparent p-4 sm:p-6 md:p-8">
      <div className="mx-auto flex max-w-[88rem] flex-col gap-8 lg:flex-row lg:items-start">
        <main className="min-w-0 flex-1">
          <div className="mb-4">
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 text-sm font-medium text-[var(--totk-grey-200)] transition-colors hover:text-[var(--totk-light-green)]"
            >
              <i className="fa-solid fa-arrow-left text-xs" aria-hidden />
              Back to Explore
            </Link>
          </div>
          {startExpeditionError && (
            <p className="mb-2 text-sm text-red-400">{startExpeditionError}</p>
          )}
          {/* Hero: banner + title + meta */}
          <header className="relative mb-6 overflow-hidden rounded-xl border border-[var(--totk-dark-ocher)]/60 shadow-lg">
            {regionBanner ? (
              <div className="relative h-24 w-full sm:h-28">
                <Image
                  src={regionBanner}
                  alt=""
                  fill
                  className="object-cover object-center"
                  sizes="(max-width: 1024px) 100vw, 72rem"
                  priority
                />
                <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[var(--botw-warm-black)]/95 via-[var(--botw-warm-black)]/40 to-transparent px-3 pb-2.5 sm:px-4 sm:pb-3">
                  <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                    <img src="/Side=Left.svg" alt="" className="h-3.5 w-auto sm:h-4 opacity-90" aria-hidden />
                    <h1 className="text-lg font-bold tracking-tight text-[var(--totk-ivory)] sm:text-xl md:text-2xl">
                      Expedition {party.partyId}
                      {party.status === "completed" && (
                        <span className="ml-2 inline-block rounded-full bg-[var(--totk-dark-ocher)]/60 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                          Ended
                        </span>
                      )}
                    </h1>
                    <img src="/Side=Right.svg" alt="" className="h-3.5 w-auto sm:h-4 opacity-90" aria-hidden />
                  </div>
                  <p className="mt-0.5 text-center text-xs text-[var(--totk-grey-200)] sm:text-sm">
                    {regionInfo?.label ?? party.region} · {party.status === "completed" ? "Ended at" : "Start"} {party.square} {party.quadrant}
                  </p>
                </div>
              </div>
            ) : (
              <div className="px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                  <img src="/Side=Left.svg" alt="" className="h-3.5 w-auto sm:h-4 opacity-90" aria-hidden />
                  <h1 className="text-lg font-bold tracking-tight text-[var(--totk-ivory)] sm:text-xl md:text-2xl">
                    Expedition {party.partyId}
                    {party.status === "completed" && (
                      <span className="ml-2 inline-block rounded-full bg-[var(--totk-dark-ocher)]/60 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                        Ended
                      </span>
                    )}
                  </h1>
                  <img src="/Side=Right.svg" alt="" className="h-3.5 w-auto sm:h-4 opacity-90" aria-hidden />
                </div>
                <p className="mt-0.5 text-center text-xs text-[var(--totk-grey-200)] sm:text-sm">
                  {regionInfo?.label ?? party.region} · {party.status === "completed" ? "Ended at" : "Start"} {party.square} {party.quadrant}
                </p>
              </div>
            )}
            {squarePreview && squarePreview.layers.length > 0 && party.status !== "started" && party.status !== "completed" && (
              <div className="border-t border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/60 px-3 py-2.5 sm:px-4 sm:py-3">
                <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)] sm:text-xs">
                  Map · {party.square} {party.quadrant}
                </p>
                <div className="relative mx-auto max-w-[18rem] overflow-hidden rounded border border-[var(--totk-dark-ocher)]/50 shadow-lg sm:max-w-[22rem]" style={{ aspectRatio: "2400/1666" }}>
                  {squarePreview.layers.map((layer) => (
                    <img
                      key={layer.name}
                      src={layer.url}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ))}
                  {squarePreview.quadrantBounds && (
                    <div
                      className="pointer-events-none absolute border-2 border-[var(--totk-light-green)]/90 bg-[var(--totk-light-green)]/10"
                      style={{
                        left: `${squarePreview.quadrantBounds.x}%`,
                        top: `${squarePreview.quadrantBounds.y}%`,
                        width: `${squarePreview.quadrantBounds.w}%`,
                        height: `${squarePreview.quadrantBounds.h}%`,
                      }}
                      aria-hidden
                    />
                  )}
                  {/* Grid overlay: quadrant divider lines */}
                  <div className="pointer-events-none absolute inset-0" aria-hidden>
                    <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/40" style={{ transform: "translateX(-50%)" }} />
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-white/40" style={{ transform: "translateY(-50%)" }} />
                  </div>
                  {/* Quadrant labels Q1–Q4: text color = status (inaccessible / unexplored / explored / secured) */}
                  <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2" aria-hidden>
                    {(["Q1", "Q2", "Q3", "Q4"] as const).map((qId) => {
                      const status = party.quadrantStatuses?.[qId] ?? "unexplored";
                      const color = QUADRANT_STATUS_COLORS[status] ?? QUADRANT_STATUS_COLORS.unexplored;
                      return (
                        <div
                          key={qId}
                          className="flex items-center justify-center p-1 text-xl font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                          style={{
                            color,
                            WebkitTextStroke: "1px white",
                            paintOrder: "stroke fill",
                          } as React.CSSProperties}
                          title={`${qId}: ${status}`}
                        >
                          {qId}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Quadrant status legend (same as ROTW map page) */}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10px] text-[var(--totk-grey-200)]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-sm bg-[#1a1a1a]" aria-hidden />
                    Inaccessible
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-sm bg-[#b91c1c]" aria-hidden />
                    Unexplored
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-sm bg-[#ca8a04]" aria-hidden />
                    Explored
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-2 w-2 shrink-0 rounded-sm bg-[#15803d]" aria-hidden />
                    Secured
                  </span>
                </div>
              </div>
            )}
            {!regionBanner && <div className="h-px bg-[var(--totk-dark-ocher)]/40" />}
            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/40 px-3 py-2.5 sm:gap-3 sm:py-3">
              <button
                type="button"
                onClick={copyShareLink}
                className="inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/80 px-3 py-2 text-xs font-medium text-[var(--totk-ivory)] transition-colors hover:border-[var(--totk-mid-ocher)] hover:bg-[var(--totk-dark-ocher)]/30 sm:text-sm sm:px-4 sm:py-2.5"
              >
                <i className="fa-solid fa-link shrink-0 text-xs opacity-80" aria-hidden />
                <span className="truncate">Copy link</span>
              </button>
              {(party.status === "started" || party.status === "completed") && (
                <>
                  {party.discordThreadUrl ? (
                    <a
                      href={party.discordThreadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-full border-2 border-[var(--totk-light-green)]/60 bg-[var(--totk-dark-green)]/80 px-3 py-2 text-xs font-bold text-[var(--totk-ivory)] transition hover:opacity-90 sm:text-sm sm:px-4 sm:py-2.5"
                    >
                      <i className="fa-brands fa-discord shrink-0 text-xs opacity-90" aria-hidden />
                      <span className="truncate">Open thread</span>
                    </a>
                  ) : (
                    <span className="text-xs text-[var(--totk-grey-200)]">Thread link not available.</span>
                  )}
                </>
              )}
              {party.isLeader && party.status === "open" && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Are you sure? Once started you cannot edit it and you are locked in!")) {
                      startExpedition();
                    }
                  }}
                  disabled={startingExpedition}
                  className="inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-[var(--totk-light-green)]/60 bg-[var(--totk-dark-green)]/80 px-3 py-2 text-xs font-bold text-[var(--totk-ivory)] transition-opacity hover:opacity-90 disabled:opacity-60 sm:text-sm sm:px-4 sm:py-2.5"
                >
                  {startingExpedition ? (
                    <i className="fa-solid fa-spinner fa-spin shrink-0 text-xs" aria-hidden />
                  ) : (
                    <i className="fa-solid fa-play shrink-0 text-xs opacity-90" aria-hidden />
                  )}
                  <span className="truncate">Start expedition</span>
                </button>
              )}
            </div>
          </header>

          {!userId && (
            <section className="mb-8 rounded-2xl border border-[var(--totk-dark-ocher)]/50 bg-gradient-to-br from-[var(--totk-brown)]/15 to-[var(--botw-warm-black)]/50 p-5 shadow-lg md:p-6">
              <p className="text-sm text-[var(--botw-pale)]">
                <a href="/api/auth/discord" className="font-medium text-[var(--totk-light-green)] underline-offset-2 hover:underline">
                  Log in with Discord
                </a>{" "}
                to join this expedition with your character.
              </p>
            </section>
          )}

          {userId && party.status === "open" && party.members.length < 4 && (
            <section className="mb-8 rounded-2xl border border-[var(--totk-dark-ocher)]/50 bg-gradient-to-br from-[var(--totk-brown)]/15 to-[var(--botw-warm-black)]/50 p-5 shadow-lg md:p-6">
              <div className="mb-4 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]">
                  <i className={party.currentUserJoined ? "fa-solid fa-circle-check text-sm" : "fa-solid fa-user-plus text-sm"} aria-hidden />
                </span>
                <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                  {party.currentUserJoined ? "You're in this expedition" : "Join this expedition"}
                </h2>
              </div>
              {party.currentUserJoined && party.currentUserMember && !editingItems && (() => {
                const myCharFromList = characters.find((c) => String(c._id) === String(party.currentUserMember!.characterId));
                const displayIcon = (party.currentUserMember!.icon && String(party.currentUserMember!.icon).trim()) || (myCharFromList?.icon && String(myCharFromList.icon).trim()) || undefined;
                return (
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[var(--totk-light-green)]/30 bg-[var(--botw-warm-black)]/40 p-4 shadow-inner">
                  <div className="flex items-center gap-3">
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-[var(--totk-light-green)]/50 bg-[var(--botw-warm-black)]">
                      {displayIcon ? (
                        <img
                          src={displayIcon}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xl text-[var(--totk-grey-200)]">
                          <i className="fa-solid fa-user" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-semibold text-[var(--totk-ivory)]">{party.currentUserMember.name}</p>
                      <p className="text-xs text-[var(--totk-light-green)]">In party · turn order in panel →</p>
                    </div>
                  </div>
                  {party.status === "open" && (
                    <button
                      type="button"
                      onClick={startEditingItems}
                      className="ml-auto shrink-0 rounded-lg border border-[var(--totk-mid-ocher)]/60 bg-[var(--botw-warm-black)]/80 px-4 py-2 text-sm font-medium text-[var(--totk-ivory)] transition-colors hover:border-[var(--totk-mid-ocher)] hover:bg-[var(--totk-dark-ocher)]/30"
                    >
                      <i className="fa-solid fa-pen-to-square mr-2 text-xs opacity-80" aria-hidden />
                      Edit items
                    </button>
                  )}
                </div>
                );
              })()}
              {party.currentUserJoined && party.currentUserMember && editingItems && (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--botw-pale)]">Change items you’re bringing (up to 3, optional). Your character: <strong>{party.currentUserMember.name}</strong></p>
                  <div className="flex flex-wrap items-center gap-2">
                    <div
                      className="relative flex-1 min-w-[200px]"
                      onBlur={() => setTimeout(() => setEditSuggestionsOpen(false), 150)}
                    >
                      <input
                        type="text"
                        value={editItemSearch}
                        onChange={(e) => {
                          setEditItemSearch(e.target.value);
                          setEditSuggestionsOpen(true);
                          setEditItemHighlightIndex(0);
                        }}
                        onFocus={() => {
                          setEditSuggestionsOpen(true);
                          setEditItemHighlightIndex(0);
                        }}
                        onKeyDown={(e) => {
                          if (!editSuggestionsOpen || editSuggestionsList.length === 0) return;
                          if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setEditItemHighlightIndex((i) => Math.min(i + 1, editSuggestionsList.length - 1));
                            return;
                          }
                          if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setEditItemHighlightIndex((i) => Math.max(i - 1, 0));
                            return;
                          }
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const it = editSuggestionsList[Math.min(editItemHighlightIndex, editSuggestionsList.length - 1)];
                            if (it && canAddEditItem(it.itemName)) {
                              addEditItem(it.itemName);
                              setEditItemSearch("");
                              setEditItemHighlightIndex(0);
                            }
                            return;
                          }
                          if (e.key === "Escape") setEditSuggestionsOpen(false);
                        }}
                        placeholder="Type to search your inventory…"
                        className="w-full rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm text-[var(--totk-ivory)] placeholder-[var(--totk-grey-200)] focus:border-[var(--totk-light-green)] focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-green)]/30"
                      />
                      {editSuggestionsOpen && editItems.length < 3 && (
                        <ul className="absolute top-full left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] py-1 shadow-xl">
                          {editSuggestionsList.length === 0 ? (
                            <li className="px-3 py-2 text-sm text-[var(--totk-grey-200)]">
                              {editItemSearch.trim() ? "No matching items" : "No items available to add"}
                            </li>
                          ) : (
                            editSuggestionsList.map((it, idx) => {
                              const st = exploreItemStats.get(it.itemName.toLowerCase());
                              const h = st?.modifierHearts ?? 0;
                              const s = st?.staminaRecovered ?? 0;
                              const statPart = `❤️${h}|🟩${s}`;
                              const highlighted = idx === editItemHighlightIndex;
                              return (
                                <li key={it.itemName}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      addEditItem(it.itemName);
                                      setEditItemSearch("");
                                    }}
                                    className={`w-full px-3 py-2 text-left text-sm ${highlighted ? "bg-[var(--totk-dark-ocher)]/50 text-[var(--totk-ivory)]" : "text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/30"}`}
                                  >
                                    {it.itemName} — {statPart} — Qty: {it.quantity}
                                  </button>
                                </li>
                              );
                            })
                          )}
                        </ul>
                      )}
                    </div>
                    <span className="text-xs text-[var(--totk-grey-200)]">{editItems.length}/3</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editItems.map((itemName, idx) => {
                      const img = exploreItemImages.get(itemName.toLowerCase());
                      return (
                        <div key={`edit-${idx}-${itemName}`} className="flex items-center gap-1 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 p-1">
                          <div className="h-10 w-10 overflow-hidden rounded">
                            {img ? (
                              <Image src={img} alt={itemName} width={40} height={40} className="h-full w-full object-cover" unoptimized={img.startsWith("http") || img.startsWith("/api/")} />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[var(--totk-grey-200)]">{itemName.slice(0, 1)}</div>
                            )}
                          </div>
                          <span className="max-w-[100px] truncate text-xs text-[var(--totk-ivory)]">{itemName}</span>
                          <button type="button" onClick={() => removeEditItem(idx)} className="rounded p-0.5 text-[var(--totk-grey-200)] hover:bg-[var(--totk-dark-ocher)]/40 hover:text-[var(--totk-ivory)]" aria-label="Remove">
                            <i className="fa-solid fa-times text-xs" aria-hidden />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {updateItemsError && <p className="text-sm text-red-400">{updateItemsError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={saveEditItems} disabled={editItems.length > 3 || updatingItems} className="rounded-md border-2 border-[var(--totk-light-green)] bg-[var(--totk-dark-green)] px-3 py-2 text-sm font-bold text-[var(--totk-ivory)] hover:opacity-90 disabled:opacity-50">
                      {updatingItems ? "Saving…" : "Save items"}
                    </button>
                    <button type="button" onClick={cancelEditingItems} disabled={updatingItems} className="rounded-md border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm font-medium text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/40">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {!party.currentUserJoined && (
                <>
                  {regionInfo && (
                    <p className="mb-3 text-xs text-[var(--totk-grey-200)]">
                      Your character must be in <strong>{regionInfo.village}</strong>. Order below is turn order.
                    </p>
                  )}
                  {loadingChars && <p className="text-sm text-[var(--totk-grey-200)]">Loading your characters…</p>}
                  {!loadingChars && eligibleCharacters.length === 0 && (
                    <p className="text-sm text-[var(--totk-grey-200)]">
                      No character in {regionInfo?.village ?? party.region}. Move one there to join.
                    </p>
                  )}
                  {!loadingChars && eligibleCharacters.length > 0 && (
                    <div className="space-y-4">
                      <div>
                        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                          Your character
                        </label>
                        <div className="flex flex-wrap items-center gap-4 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 p-3">
                          <select
                            value={selectedCharacterId}
                            onChange={(e) => setSelectedCharacterId(e.target.value)}
                            className="min-w-[200px] flex-1 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm text-[var(--totk-ivory)] focus:border-[var(--totk-light-green)] focus:outline-none"
                          >
                            <option value="">Select character…</option>
                            {eligibleCharacters.map((c) => (
                              <option key={String(c._id)} value={String(c._id)}>
                                {c.name} · ❤️ {c.currentHearts ?? c.maxHearts ?? "?"} · 🟩 {c.currentStamina ?? c.maxStamina ?? "?"}
                              </option>
                            ))}
                          </select>
                          {selectedCharacter && (
                            <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]">
                              {selectedCharacter.icon && String(selectedCharacter.icon).trim() ? (
                                <img
                                  src={String(selectedCharacter.icon).trim()}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[var(--totk-grey-200)]">
                                  <i className="fa-solid fa-user text-xl" aria-hidden />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                          Items to bring (optional, up to 3 — from this character’s inventory)
                        </label>
                        <p className="mb-2 text-xs text-[var(--totk-grey-200)]">
                          Type to search or pick from the list. You can join with 0, 1, 2, or 3 items.
                        </p>
                        {loadingInventory && (
                          <p className="mb-2 text-xs text-[var(--totk-grey-200)]">Loading inventory…</p>
                        )}
                        {!loadingInventory && inventoryWithQuantity.length === 0 && selectedCharacterId && (
                          <p className="mb-2 text-xs text-[var(--totk-grey-200)]">No exploration items in this character’s inventory. You can still join with no items.</p>
                        )}
                        {!loadingInventory && inventoryWithQuantity.length > 0 && (
                          <>
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <div
                                className="relative flex-1 min-w-[200px]"
                                onBlur={() => setTimeout(() => setItemSuggestionsOpen(false), 150)}
                              >
                                <input
                                  type="text"
                                  value={itemSearch}
                                  onChange={(e) => {
                                    setItemSearch(e.target.value);
                                    setItemSuggestionsOpen(true);
                                    setItemHighlightIndex(0);
                                  }}
                                  onFocus={() => {
                                    setItemSuggestionsOpen(true);
                                    setItemHighlightIndex(0);
                                  }}
                                  onKeyDown={(e) => {
                                    if (!itemSuggestionsOpen || itemSuggestionsList.length === 0) {
                                      if (e.key === "Enter" && selectedItems.length <= 3) e.preventDefault();
                                      return;
                                    }
                                    if (e.key === "ArrowDown") {
                                      e.preventDefault();
                                      setItemHighlightIndex((i) => Math.min(i + 1, itemSuggestionsList.length - 1));
                                      return;
                                    }
                                    if (e.key === "ArrowUp") {
                                      e.preventDefault();
                                      setItemHighlightIndex((i) => Math.max(i - 1, 0));
                                      return;
                                    }
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      const it = itemSuggestionsList[Math.min(itemHighlightIndex, itemSuggestionsList.length - 1)];
                                      if (it && canAddItem(it.itemName)) {
                                        addSelectedItem(it.itemName);
                                        setItemSearch("");
                                        setItemHighlightIndex(0);
                                      }
                                      return;
                                    }
                                    if (e.key === "Escape") {
                                      setItemSuggestionsOpen(false);
                                    }
                                  }}
                                  placeholder="Type to search your inventory…"
                                  className="w-full rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm text-[var(--totk-ivory)] placeholder-[var(--totk-grey-200)] focus:border-[var(--totk-light-green)] focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-green)]/30"
                                />
                                {itemSuggestionsOpen && selectedItems.length < 3 && (
                                  <ul className="absolute top-full left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] py-1 shadow-xl">
                                    {itemSuggestionsList.length === 0 ? (
                                      <li className="px-3 py-2 text-sm text-[var(--totk-grey-200)]">
                                        {itemSearch.trim() ? "No matching items" : "No items available to add (max 3 or out of stock)"}
                                      </li>
                                    ) : (
                                      itemSuggestionsList.map((it, idx) => {
                                        const st = exploreItemStats.get(it.itemName.toLowerCase());
                                        const h = st?.modifierHearts ?? 0;
                                        const s = st?.staminaRecovered ?? 0;
                                        const statPart = `❤️${h}|🟩${s}`;
                                        const highlighted = idx === itemHighlightIndex;
                                        return (
                                          <li key={it.itemName}>
                                            <button
                                              type="button"
                                              onMouseDown={(e) => e.preventDefault()}
                                              onClick={() => {
                                                addSelectedItem(it.itemName);
                                                setItemSearch("");
                                              }}
                                              className={`w-full px-3 py-2 text-left text-sm ${highlighted ? "bg-[var(--totk-dark-ocher)]/50 text-[var(--totk-ivory)]" : "text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/30"}`}
                                            >
                                              {it.itemName} — {statPart} — Qty: {it.quantity}
                                            </button>
                                          </li>
                                        );
                                      })
                                    )}
                                  </ul>
                                )}
                              </div>
                              <span className="text-xs text-[var(--totk-grey-200)]">{selectedItems.length}/3</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {selectedItems.map((itemName, idx) => {
                                const img = exploreItemImages.get(itemName.toLowerCase());
                                return (
                                  <div key={`${idx}-${itemName}`} className="flex items-center gap-1 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 p-1">
                                    <div className="h-10 w-10 overflow-hidden rounded">
                                      {img ? (
                                        <Image src={img} alt={itemName} width={40} height={40} className="h-full w-full object-cover" unoptimized={img.startsWith("http") || img.startsWith("/api/")} />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-[var(--totk-grey-200)]">{itemName.slice(0, 1)}</div>
                                      )}
                                    </div>
                                    <span className="max-w-[100px] truncate text-xs text-[var(--totk-ivory)]">{itemName}</span>
                                    <button type="button" onClick={() => removeSelectedItem(idx)} className="rounded p-0.5 text-[var(--totk-grey-200)] hover:bg-[var(--totk-dark-ocher)]/40 hover:text-[var(--totk-ivory)]" aria-label="Remove">
                                      <i className="fa-solid fa-times text-xs" aria-hidden />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                      {joinError && <p className="text-sm text-red-400">{joinError}</p>}
                      <button
                        type="button"
                        onClick={joinParty}
                        disabled={!canJoin || joining}
                        className="rounded-md border-2 border-[var(--totk-light-green)] bg-[var(--totk-dark-green)] px-4 py-2.5 text-sm font-bold text-[var(--totk-ivory)] shadow-md hover:opacity-90 disabled:opacity-50"
                      >
                        {joining ? "Joining…" : "Join expedition"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {(party.status === "started" || party.status === "completed") && (
            <>
              {/* 1. Map | Journey — side by side */}
              <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Map */}
                {squarePreview && squarePreview.layers.length > 0 && (
                  <section className="rounded-2xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 p-4 shadow-inner">
                    <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--totk-grey-200)]">Map · {party.square} {party.quadrant}</h2>
                    <div className="relative mx-auto max-w-md overflow-hidden rounded-lg border border-[var(--totk-dark-ocher)]/50" style={{ aspectRatio: "2400/1666" }}>
                      {squarePreview.layers.map((layer) => (
                        <img
                          key={layer.name}
                          src={layer.url}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = "none"; }}
                        />
                      ))}
                      {squarePreview.quadrantBounds && (
                        <div
                          className="pointer-events-none absolute border-2 border-[var(--totk-light-green)]/90 bg-[var(--totk-light-green)]/10"
                          style={{
                            left: `${squarePreview.quadrantBounds.x}%`,
                            top: `${squarePreview.quadrantBounds.y}%`,
                            width: `${squarePreview.quadrantBounds.w}%`,
                            height: `${squarePreview.quadrantBounds.h}%`,
                          }}
                          aria-hidden
                        />
                      )}
                      <div className="pointer-events-none absolute inset-0" aria-hidden>
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/40" style={{ transform: "translateX(-50%)" }} />
                        <div className="absolute top-1/2 left-0 right-0 h-px bg-white/40" style={{ transform: "translateY(-50%)" }} />
                      </div>
                      <div className="pointer-events-none absolute inset-0 grid grid-cols-2 grid-rows-2">
                        {(["Q1", "Q2", "Q3", "Q4"] as const).map((qId) => {
                          const status = party.quadrantStatuses?.[qId] ?? "unexplored";
                          const color = QUADRANT_STATUS_COLORS[status] ?? QUADRANT_STATUS_COLORS.unexplored;
                          return (
                            <div key={qId} className="flex items-center justify-center p-1 text-sm font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" style={{ color, WebkitTextStroke: "1px white", paintOrder: "stroke fill" } as React.CSSProperties}>
                              {qId}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                )}
                {/* Journey */}
                <section className="rounded-2xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 p-4 shadow-inner">
                  <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--totk-light-green)]">Journey</h2>
                  {(() => {
                    const start = REGIONS[party.region?.toLowerCase()];
                    const startLoc = start ? `${start.square} ${start.quadrant}` : `${party.square} ${party.quadrant}`;
                    const journey: string[] = [startLoc];
                    const moveRe = /Moved from \S+ \S+ to (\S+ \S+)/;
                    for (const e of party.progressLog ?? []) {
                      if (e.outcome !== "move") continue;
                      const m = moveRe.exec(e.message);
                      if (m && m[1]) journey.push(m[1]);
                    }
                    const currentLoc = `${party.square} ${party.quadrant}`;
                    const hasMoves = journey.length > 1;
                    return (
                      <div className="flex flex-wrap items-center gap-2" title={hasMoves ? journey.join(" → ") : undefined}>
                        {journey.map((loc: string, i: number) => {
                          const isStart = i === 0;
                          const isCurrent = loc === currentLoc;
                          const isOnly = journey.length === 1;
                          return (
                            <span key={`${loc}-${i}`} className="flex items-center gap-2">
                              {i > 0 && (
                                <span className="flex-shrink-0 text-[var(--totk-dark-ocher)]" aria-hidden>
                                  <svg width="16" height="12" viewBox="0 0 16 12" fill="none" className="opacity-70">
                                    <path d="M1 6h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </span>
                              )}
                              <span
                                className={[
                                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm font-medium",
                                  isCurrent
                                    ? "border-[var(--totk-light-green)]/50 bg-[var(--totk-dark-green)]/30 text-[var(--totk-ivory)]"
                                    : "border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/60 text-[var(--botw-pale)]",
                                ].join(" ")}
                              >
                                <span className="tabular-nums">{loc}</span>
                                {isOnly && (
                                  <span className="rounded bg-[var(--totk-grey-200)]/20 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-[var(--totk-grey-200)]">
                                    Start & current
                                  </span>
                                )}
                                {!isOnly && isStart && (
                                  <span className="rounded bg-[var(--totk-dark-ocher)]/30 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-[var(--totk-grey-200)]">
                                    Start
                                  </span>
                                )}
                                {!isOnly && isCurrent && !isStart && (
                                  <span className="rounded bg-[var(--totk-light-green)]/25 px-1.5 py-0.5 text-[10px] font-normal uppercase tracking-wider text-[var(--totk-light-green)]">
                                    Current
                                  </span>
                                )}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    );
                  })()}
                </section>
              </div>

              {/* Current turn, location, stats */}
              <section className="mb-6 rounded-2xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 p-4 shadow-inner">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 md:gap-3">
                  <div className="rounded-xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/50 px-3 py-2">
                    <span className="block text-[10px] uppercase tracking-wider text-[var(--totk-grey-200)]">{party.status === "completed" ? "Last turn" : "Current turn"}</span>
                    <span className="mt-0.5 block truncate font-semibold text-[var(--totk-ivory)] text-sm">
                      {party.members[party.currentTurn ?? 0]?.name ?? "—"}
                    </span>
                  </div>
                  <div className="rounded-xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/50 px-3 py-2">
                    <span className="block text-[10px] uppercase tracking-wider text-[var(--totk-grey-200)]">{party.status === "completed" ? "Quadrant" : "Current quadrant"}</span>
                    <span className="mt-0.5 block font-semibold text-[var(--totk-ivory)] text-sm">
                      {party.quadrant ?? "—"} · {party.square ?? "—"}
                    </span>
                  </div>
                  <div className="rounded-xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/50 px-3 py-2">
                    <span className="block text-[10px] uppercase tracking-wider text-[var(--totk-grey-200)]">Area status</span>
                    <span className="mt-0.5 block font-semibold capitalize text-[var(--totk-ivory)] text-sm">
                      {party.quadrantState ?? "unexplored"}
                    </span>
                  </div>
                  <div className="rounded-xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/50 px-3 py-2">
                    <span className="block text-[10px] uppercase tracking-wider text-[var(--totk-grey-200)]">Party hearts</span>
                    <span className="mt-0.5 flex items-center gap-1 font-semibold text-[var(--totk-ivory)] text-sm">
                      <i className="fa-solid fa-heart text-[10px] text-red-400/90" aria-hidden />
                      {party.totalHearts}
                    </span>
                  </div>
                  <div className="rounded-xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/50 px-3 py-2">
                    <span className="block text-[10px] uppercase tracking-wider text-[var(--totk-grey-200)]">Party stamina</span>
                    <span className="mt-0.5 flex items-center gap-1 font-semibold text-[var(--totk-ivory)] text-sm">
                      <i className="fa-solid fa-bolt text-[10px] text-[var(--totk-light-green)]/90" aria-hidden />
                      {party.totalStamina}
                    </span>
                  </div>
                </div>
              </section>

              {/* 2. Progress log | Party — two columns */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Progress log */}
                <section className="rounded-2xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 p-4 shadow-inner min-w-0">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                    <i className="fa-solid fa-list text-[10px] opacity-80" aria-hidden />
                    Progress log
                  </h3>
                  {party.gatheredItems && party.gatheredItems.length > 0 && (
                    <div className="mb-2 rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/50 px-2 py-1.5">
                      <span className="text-[10px] uppercase text-[var(--totk-grey-200)]">Items gathered</span>
                      <p className="truncate text-xs text-[var(--botw-pale)]" title={party.gatheredItems.map((g) => `${g.emoji ?? ""} ${g.itemName} x${g.quantity} (${g.characterName})`.trim()).join(" · ")}>
                        {party.gatheredItems.map((g) => `${g.emoji ?? ""} ${g.itemName}×${g.quantity}`).join(" · ")}
                      </p>
                    </div>
                  )}
                  {(party.progressLog?.length ?? 0) === 0 ? (
                    <p className="rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/50 px-2 py-3 text-xs text-[var(--totk-grey-200)]">
                      No rolls yet. Use <code className="rounded bg-[var(--totk-dark-ocher)]/40 px-1">/explore roll</code> in Discord.
                    </p>
                  ) : (
                    <ul className="max-h-[20rem] overflow-y-auto rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/50 py-1.5" role="list">
                      {[...(party.progressLog ?? [])].reverse().map((entry, i) => (
                        <li key={i} className="flex flex-col gap-0.5 border-b border-[var(--totk-dark-ocher)]/20 px-2 py-1.5 last:border-0">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                            <span className="font-semibold text-[var(--totk-ivory)]">{entry.characterName}</span>
                            <span className="rounded bg-[var(--totk-dark-ocher)]/50 px-1 py-0.5 text-[10px] uppercase text-[var(--totk-grey-200)]">{entry.outcome}</span>
                            <span className="text-[var(--totk-grey-200)]">
                              {typeof entry.at === "string" ? new Date(entry.at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : ""}
                            </span>
                            {(entry.heartsLost != null && entry.heartsLost > 0) || (entry.staminaLost != null && entry.staminaLost > 0) || (entry.heartsRecovered != null && entry.heartsRecovered > 0) || (entry.staminaRecovered != null && entry.staminaRecovered > 0) ? (
                              <span className="ml-auto flex flex-wrap items-center gap-1.5 text-[var(--totk-grey-200)]">
                                {entry.heartsLost != null && entry.heartsLost > 0 && <span className="text-red-400/90">−{entry.heartsLost} ❤</span>}
                                {entry.staminaLost != null && entry.staminaLost > 0 && <span className="text-amber-400/90">−{entry.staminaLost}</span>}
                                {entry.heartsRecovered != null && entry.heartsRecovered > 0 && <span className="text-red-400/90">+{entry.heartsRecovered} ❤</span>}
                                {entry.staminaRecovered != null && entry.staminaRecovered > 0 && <span className="text-[var(--totk-light-green)]/90">+{entry.staminaRecovered}</span>}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-[var(--botw-pale)] leading-snug">{entry.message}</p>
                          {entry.loot?.itemName && <p className="text-[11px] text-[var(--totk-light-green)]">Loot: {entry.loot.itemName}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Party — turn order (same content as sidebar) */}
                <section className="rounded-2xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 p-4 shadow-inner">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                    <i className="fa-solid fa-list-ol text-[10px] opacity-80" aria-hidden />
                    Party
                  </h3>
                  <p className="mb-3 text-[10px] text-[var(--totk-grey-200)]">Turn order. {party.members.length}/4 slots.</p>
                  <div className="mb-3 flex items-center justify-between rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/50 px-3 py-2">
                    <span className="text-[10px] uppercase text-[var(--totk-grey-200)]">Total</span>
                    <span className="flex items-center gap-2 text-sm font-bold text-[var(--totk-ivory)]">
                      <span className="flex items-center gap-1"><i className="fa-solid fa-heart text-[10px] text-red-400/90" aria-hidden />{party.totalHearts}</span>
                      <span className="flex items-center gap-1"><i className="fa-solid fa-bolt text-[10px] text-[var(--totk-light-green)]/90" aria-hidden />{party.totalStamina}</span>
                    </span>
                  </div>
                  <div className="space-y-3">
                    {party.members.map((m, index) => {
                      const charFromList = characters.find((c) => String(c._id) === String(m.characterId));
                      const displayIcon = (m.icon && String(m.icon).trim()) || (charFromList?.icon && String(charFromList.icon).trim()) || undefined;
                      const displayHearts = typeof m.currentHearts === "number" ? m.currentHearts : (typeof charFromList?.currentHearts === "number" ? charFromList.currentHearts : charFromList?.maxHearts);
                      const displayStamina = typeof m.currentStamina === "number" ? m.currentStamina : (typeof charFromList?.currentStamina === "number" ? charFromList.currentStamina : charFromList?.maxStamina);
                      const isCurrentTurn = party.status === "started" && (party.currentTurn ?? 0) === index;
                      return (
                        <div key={m.characterId} className="flex items-start gap-2">
                          <span className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${isCurrentTurn ? "bg-[var(--totk-light-green)]/60 text-[var(--botw-warm-black)]" : "bg-[var(--totk-dark-ocher)]/70 text-[var(--totk-ivory)]"}`}>
                            {index + 1}
                          </span>
                          <PartySlotCard name={m.name} icon={displayIcon} hearts={displayHearts} stamina={displayStamina} items={m.items} isYou={userId === m.userId} label={[isCurrentTurn && "Current turn", userId === m.userId && "(you)"].filter(Boolean).join(" ") || undefined} />
                        </div>
                      );
                    })}
                    {showYourSlotPreview && (
                      <div className="flex items-start gap-2">
                        <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[var(--totk-light-green)]/70 bg-[var(--totk-light-green)]/10 text-[10px] font-bold text-[var(--totk-light-green)]">{party.members.length + 1}</span>
                        <PartySlotCard name={selectedCharacter?.name ?? "Your character"} icon={selectedCharacter?.icon ?? null} hearts={selectedCharacter?.currentHearts ?? selectedCharacter?.maxHearts} stamina={selectedCharacter?.currentStamina ?? selectedCharacter?.maxStamina} items={selectedItems.map((itemName) => ({ itemName: itemName || "" }))} isYou label="(preview)" />
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </>
          )}

        </main>

        {(party.status !== "started" && party.status !== "completed") && (
        <aside className="w-full flex-shrink-0 lg:sticky lg:top-6 lg:w-80">
          <section className="rounded-2xl border border-[var(--totk-dark-ocher)]/50 bg-gradient-to-br from-[var(--totk-brown)]/15 to-[var(--botw-warm-black)]/50 p-5 shadow-xl">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]">
                <i className="fa-solid fa-list-ol text-sm" aria-hidden />
              </span>
              <h2 className="text-sm font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                Turn order
              </h2>
            </div>
            <p className="mb-3 text-xs text-[var(--totk-grey-200)]">
              Join order = turn order. {party.members.length}/4 slots filled.
            </p>
            <div className="mb-4 flex items-center justify-between rounded-xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/50 px-4 py-2.5">
              <span className="text-xs font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">Party total</span>
              <span className="flex items-center gap-3 text-sm font-bold text-[var(--totk-ivory)]">
                <span className="flex items-center gap-1">
                  <i className="fa-solid fa-heart text-[10px] text-red-400/90" aria-hidden />
                  {party.totalHearts}
                </span>
                <span className="flex items-center gap-1">
                  <i className="fa-solid fa-bolt text-[10px] text-[var(--totk-light-green)]/90" aria-hidden />
                  {party.totalStamina}
                </span>
              </span>
            </div>
            <div className="space-y-4">
              {party.members.map((m, index) => {
                const charFromList = characters.find((c) => String(c._id) === String(m.characterId));
                const displayIcon = (m.icon && String(m.icon).trim()) || (charFromList?.icon && String(charFromList.icon).trim()) || undefined;
                const displayHearts = typeof m.currentHearts === "number" ? m.currentHearts : (typeof charFromList?.currentHearts === "number" ? charFromList.currentHearts : charFromList?.maxHearts);
                const displayStamina = typeof m.currentStamina === "number" ? m.currentStamina : (typeof charFromList?.currentStamina === "number" ? charFromList.currentStamina : charFromList?.maxStamina);
                const isCurrentTurn = party.status === "started" && (party.currentTurn ?? 0) === index;
                return (
                  <div key={m.characterId} className="flex items-start gap-3">
                    <span
                      className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold shadow-inner ${
                        isCurrentTurn
                          ? "bg-[var(--totk-light-green)]/60 text-[var(--botw-warm-black)]"
                          : "bg-[var(--totk-dark-ocher)]/70 text-[var(--totk-ivory)]"
                      }`}
                      title={isCurrentTurn ? "Current turn" : undefined}
                    >
                      {index + 1}
                    </span>
                    <PartySlotCard
                      name={m.name}
                      icon={displayIcon}
                      hearts={displayHearts}
                      stamina={displayStamina}
                      items={m.items}
                      isYou={userId === m.userId}
                      label={[isCurrentTurn && "Current turn", userId === m.userId && "(you)"].filter(Boolean).join(" ") || undefined}
                    />
                  </div>
                );
              })}
              {showYourSlotPreview && (
                <div className="flex items-start gap-3">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[var(--totk-light-green)]/70 bg-[var(--totk-light-green)]/10 text-xs font-bold text-[var(--totk-light-green)]">
                    {party.members.length + 1}
                  </span>
                  <PartySlotCard
                    name={selectedCharacter?.name ?? "Your character"}
                    icon={selectedCharacter?.icon ?? null}
                    hearts={selectedCharacter?.currentHearts ?? selectedCharacter?.maxHearts}
                    stamina={selectedCharacter?.currentStamina ?? selectedCharacter?.maxStamina}
                    items={selectedItems.map((itemName) => ({ itemName: itemName || "" }))}
                    isYou
                    label="(preview)"
                  />
                </div>
              )}
            </div>
          </section>
        </aside>
        )}
      </div>
    </div>
  );
}
