"use client";

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useSession } from "@/hooks/use-session";
import { formatItemImageUrl } from "@/lib/item-utils";
import { explorationIconValue, getExplorationIconUrl, isExplorationIcon } from "@/lib/explorationIcons";

// ============================================================================
// ------------------- Constants & types -------------------
// ============================================================================

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

// Map grid: 10 cols x 12 rows, each square 2400 x 1666 (canvas 24000 x 20000)
const SQUARE_W = 2400;
const SQUARE_H = 1666;

/** Parse "H8 Q3" from messages like "Found a monster camp in H8 Q3...", "Found ruins in H8 Q3...", "Found a grotto in H8 Q3..." */
const REPORTABLE_LOC_RE = /\s+(?:in|at)\s+([A-J](?:[1-9]|1[0-2])\s+Q[1-4])(?:\s|;|,|\.|$)/i;

const REPORTABLE_OUTCOMES: Record<string, string> = {
  monster_camp: "Monster Camp",
  ruins: "Ruins",
  grotto: "Grotto",
  relic: "Relic",
};

type ReportableDiscovery = { square: string; quadrant: string; outcome: string; label: string; occurrenceIndex: number; at: string };

// ------------------- Map / discovery helpers ------------------
// getReportableDiscoveries, discoveryKey, wasSecuredThisSession, squareQuadrantToCoordinates, getSquareBounds, fogClipPathForQuadrants, isClickInQuadrant -

function getReportableDiscoveries(progressLog: ProgressEntry[] | undefined): ReportableDiscovery[] {
  if (!Array.isArray(progressLog)) return [];
  const countByKey = new Map<string, number>();
  const out: ReportableDiscovery[] = [];
  for (const e of progressLog) {
    const baseLabel = REPORTABLE_OUTCOMES[e.outcome];
    if (!baseLabel) continue;
    const m = REPORTABLE_LOC_RE.exec(e.message);
    if (!m || !m[1]) continue;
    const parts = m[1].trim().split(/\s+/);
    const square = parts[0] ?? "";
    const quadrant = parts[1] ?? "";
    if (!square || !quadrant) continue;
    const locKey = `${e.outcome}|${square}|${quadrant}`;
    const occurrenceIndex = (countByKey.get(locKey) ?? 0) + 1;
    countByKey.set(locKey, occurrenceIndex);
    const label = occurrenceIndex > 1 ? `${baseLabel} #${occurrenceIndex}` : baseLabel;
    const at = typeof e.at === "string" ? e.at : "";
    out.push({ square, quadrant, outcome: e.outcome, label, occurrenceIndex, at });
  }
  return out;
}

/** Stable key for a discovery (uses log entry timestamp so it survives party refetch/poll). */
function discoveryKey(d: { outcome: string; square: string; quadrant: string; at: string }): string {
  return `${d.outcome}|${d.square}|${d.quadrant}|${d.at}`;
}

/** Render message with Discord-style **bold** (for progress log). */
function renderMessageWithBold(message: string): React.ReactNode {
  const parts = (message ?? "").split(/\*\*/);
  if (parts.length <= 1) return message;
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-semibold text-[var(--totk-ivory)]">{part}</strong> : part));
}

/** True if the current quadrant was secured during this expedition (progress log has "secure" for this location). */
function wasSecuredThisSession(progressLog: ProgressEntry[] | undefined, square: string, quadrant: string): boolean {
  if (!Array.isArray(progressLog)) return false;
  const loc = `${square} ${quadrant}`;
  return progressLog.some((e) => e.outcome === "secure" && e.message.includes(loc));
}

/** Return map coordinates (lat, lng) for the center of a square+quadrant. Canvas: lng 0–24000, lat 0–20000. */
function squareQuadrantToCoordinates(square: string, quadrant: string): { lat: number; lng: number } {
  const letter = (square.charAt(0) ?? "A").toUpperCase();
  const num = Math.min(12, Math.max(1, parseInt((square.slice(1) ?? "1"), 10) || 1));
  const colIndex = letter.charCodeAt(0) - 65; // A=0 .. J=9
  const rowIndex = num - 1; // 1–12 -> 0–11
  const lngBase = Math.max(0, Math.min(9, colIndex)) * SQUARE_W;
  const latBase = Math.max(0, Math.min(11, rowIndex)) * SQUARE_H;
  const q = (quadrant.toUpperCase().match(/Q([1-4])/)?.[1] ?? "1") as "1" | "2" | "3" | "4";
  const offsets: Record<string, { lng: number; lat: number }> = {
    "1": { lng: 0.25 * SQUARE_W, lat: 0.25 * SQUARE_H },
    "2": { lng: 0.75 * SQUARE_W, lat: 0.25 * SQUARE_H },
    "3": { lng: 0.25 * SQUARE_W, lat: 0.75 * SQUARE_H },
    "4": { lng: 0.75 * SQUARE_W, lat: 0.75 * SQUARE_H },
  };
  const off = offsets[q] ?? offsets["1"];
  return { lat: latBase + off.lat, lng: lngBase + off.lng };
}

/** Bounds of a square in map coordinates (lat 0–20000, lng 0–24000). */
function getSquareBounds(square: string): { lngMin: number; lngMax: number; latMin: number; latMax: number } {
  const letter = (square.charAt(0) ?? "A").toUpperCase();
  const num = Math.min(12, Math.max(1, parseInt((square.slice(1) ?? "1"), 10) || 1));
  const colIndex = Math.max(0, Math.min(9, letter.charCodeAt(0) - 65));
  const rowIndex = num - 1;
  const lngMin = colIndex * SQUARE_W;
  const lngMax = lngMin + SQUARE_W;
  const latMin = rowIndex * SQUARE_H;
  const latMax = latMin + SQUARE_H;
  return { lngMin, lngMax, latMin, latMax };
}

/** Quadrant Q1–Q4 as percentage of square (0–1). Q1=top-left, Q2=top-right, Q3=bottom-left, Q4=bottom-right. */
const QUADRANT_PCT: Record<string, { x: number; y: number; w: number; h: number }> = {
  Q1: { x: 0, y: 0, w: 0.5, h: 0.5 },
  Q2: { x: 0.5, y: 0, w: 0.5, h: 0.5 },
  Q3: { x: 0, y: 0.5, w: 0.5, h: 0.5 },
  Q4: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
};

/** Z-index for explore map layers so base is under blight, blight under borders/paths, fog rendered separately on top. */
function getExploreLayerZIndex(layerName: string): number {
  if (layerName === "MAP_0002_Map-Base") return 0;
  if (layerName === "MAP_0000_BLIGHT") return 1;
  if (layerName === "MAP_0001_hidden-areas") return 20; // fog is rendered in its own div with z-10
  if (layerName === "MAP_0001s_0003_Region-Borders") return 2;
  if (layerName.startsWith("MAP_0002s_") && layerName.includes("CIRCLE")) return 3;
  if (layerName.startsWith("MAP_0003s_")) return 4; // path layers
  return 1;
}

/** CSS clip-path polygon for fog to show only given quadrants (1–4). Matches map-layers.js _fogClipPathForQuadrants. */
function fogClipPathForQuadrants(quads: number[]): string | null {
  if (!quads.length || quads.length === 4) return null;
  const q = [...quads].sort((a, b) => a - b);
  const key = q.join(",");
  const polygons: Record<string, string> = {
    "1": "0% 0%, 50% 0%, 50% 50%, 0% 50%",
    "2": "50% 0%, 100% 0%, 100% 50%, 50% 50%",
    "3": "0% 50%, 50% 50%, 50% 100%, 0% 100%",
    "4": "50% 50%, 100% 50%, 100% 100%, 50% 100%",
    "1,2": "0% 0%, 100% 0%, 100% 50%, 0% 50%",
    "1,3": "0% 0%, 50% 0%, 50% 50%, 0% 50%, 0% 100%, 50% 100%, 50% 50%, 0% 50%",
    "1,4": "0% 0%, 50% 0%, 50% 50%, 0% 50%, 50% 50%, 100% 50%, 100% 100%, 50% 100%, 50% 50%, 0% 50%",
    "2,3": "50% 0%, 100% 0%, 100% 50%, 50% 50%, 50% 100%, 0% 100%, 0% 50%, 50% 50%",
    "2,4": "50% 0%, 100% 0%, 100% 100%, 50% 100%, 50% 50%, 100% 50%",
    "3,4": "0% 50%, 100% 50%, 100% 100%, 0% 100%",
    "1,2,3": "0% 0%, 100% 0%, 100% 50%, 50% 50%, 50% 100%, 0% 100%, 0% 50%, 50% 50%",
    "1,2,4": "0% 0%, 100% 0%, 100% 100%, 50% 100%, 50% 50%, 0% 50%",
    "1,3,4": "0% 0%, 50% 0%, 50% 100%, 100% 100%, 100% 50%, 50% 50%, 0% 50%",
    "2,3,4": "50% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 50%, 50% 50%",
  };
  const poly = polygons[key];
  return poly ? `polygon(${poly})` : null;
}

/** True if (pctX, pctY) in 0–1 is inside the given quadrant (Q1–Q4). */
function isClickInQuadrant(pctX: number, pctY: number, quadrant: string): boolean {
  const q = QUADRANT_PCT[quadrant.toUpperCase()];
  if (!q) return true;
  return pctX >= q.x && pctX < q.x + q.w && pctY >= q.y && pctY < q.y + q.h;
}

// ------------------- Constants (regions, poll) ------------------

const REGIONS: Record<string, { label: string; village: string; square: string; quadrant: string }> = {
  eldin: { label: "Eldin", village: "Rudania", square: "H5", quadrant: "Q3" },
  lanayru: { label: "Lanayru", village: "Inariko", square: "H8", quadrant: "Q2" },
  faron: { label: "Faron", village: "Vhintl", square: "F10", quadrant: "Q4" },
};


const POLL_INTERVAL_MS = 6000;

// ------------------- Types ------------------
// PartyMember, GatheredItem, ProgressEntry, PartyData, Character, ExploreItem -

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
  /** Discovery keys that have been placed as a pin (stored in DB). */
  reportedDiscoveryKeys?: string[];
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

// ------------------- buildExploreInventoryList ------------------
// Builds sorted explore inventory list from API data (byName, bundles, fromInventory, fromBundles). -

function buildExploreInventoryList(
  data: { data?: Array<{ itemName: string; quantity?: number }> },
  exploreItemNames: Set<string>,
  bundleQuantities: (byName: Map<string, number>) => { "Eldin Ore Bundle": number; "Wood Bundle": number }
): Array<{ itemName: string; quantity: number }> {
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
  return [...fromInventory, ...fromBundles].sort((a, b) => a.itemName.localeCompare(b.itemName));
}

// ------------------- formatItemStat ------------------
// Hearts + stamina display string for item stats. -

function formatItemStat(modifierHearts: number, staminaRecovered: number): string {
  return `❤️${modifierHearts} | 🟩${staminaRecovered}`;
}

// ------------------- QuadrantStatusLegend ------------------
// Inaccessible, Unexplored, Explored, Secured legend. -

function QuadrantStatusLegend() {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-[var(--totk-grey-200)]">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#1a1a1a]" aria-hidden />
        Inaccessible
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#b91c1c]" aria-hidden />
        Unexplored
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#ca8a04]" aria-hidden />
        Explored
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[#15803d]" aria-hidden />
        Secured
      </span>
    </div>
  );
}

// ------------------- getMemberDisplay ------------------
// displayIcon, displayHearts, displayStamina, isCurrentTurn from member + characters + party. -

function getMemberDisplay(
  m: PartyMember,
  characters: Character[],
  party: PartyData,
  index: number
): { displayIcon: string | undefined; displayHearts: number | undefined; displayStamina: number | undefined; isCurrentTurn: boolean } {
  const charFromList = characters.find((c) => String(c._id) === String(m.characterId));
  const displayIcon = (m.icon && String(m.icon).trim()) || (charFromList?.icon && String(charFromList.icon).trim()) || undefined;
  const displayHearts = typeof m.currentHearts === "number" ? m.currentHearts : (typeof charFromList?.currentHearts === "number" ? charFromList.currentHearts : charFromList?.maxHearts);
  const displayStamina = typeof m.currentStamina === "number" ? m.currentStamina : (typeof charFromList?.currentStamina === "number" ? charFromList.currentStamina : charFromList?.maxStamina);
  const isCurrentTurn = party.status === "started" && (party.currentTurn ?? 0) === index;
  return { displayIcon, displayHearts, displayStamina, isCurrentTurn };
}

// ============================================================================
// ------------------- Component: ExplorePartyPage -------------------
// ============================================================================

export default function ExplorePartyPage() {
  const params = useParams();
  const router = useRouter();
  const partyId = (params?.partyId as string) ?? "";
  const { user, loading: sessionLoading } = useSession();
  const userId = user?.id ?? null;

  // ------------------- Component: state declarations ------------------

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
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
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
  const [cancellingExpedition, setCancellingExpedition] = useState(false);
  const [reportedDiscoveryKeys, setReportedDiscoveryKeys] = useState<Set<string>>(new Set());
  const [placingPinForKey, setPlacingPinForKey] = useState<string | null>(null);
  const [placePinError, setPlacePinError] = useState<string | null>(null);
  const [discoveryPreviewBySquare, setDiscoveryPreviewBySquare] = useState<Record<string, { layers: Array<{ name: string; url: string }>; quadrantBounds: { x: number; y: number; w: number; h: number } | null; quadrantStatuses?: Record<string, string> } | null>>({});
  const discoveryPreviewFetchedRef = useRef<Set<string>>(new Set());
  const [placingForDiscovery, setPlacingForDiscovery] = useState<ReportableDiscovery | null>(null);
  const [mapHovered, setMapHovered] = useState(false);
  const [mapHoverPct, setMapHoverPct] = useState({ x: 0.5, y: 0.5 });
  const [pathImageFile, setPathImageFile] = useState<File | null>(null);
  const [pathImageUploading, setPathImageUploading] = useState(false);
  const [pathImageStatus, setPathImageStatus] = useState("");
  const [pathImageSuccessUrl, setPathImageSuccessUrl] = useState<string | null>(null);
  /** URL of the path image for the current party's square (if any). Shown on explore map and updated after upload. */
  const [pathImageForSquare, setPathImageForSquare] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [userPins, setUserPins] = useState<Array<{ _id: string; name: string; coordinates: { lat: number; lng: number }; gridLocation: string; icon?: string; color?: string; sourceDiscoveryKey?: string | null }>>([]);
  const [squarePreview, setSquarePreview] = useState<{
    layers: Array<{ name: string; url: string }>;
    quadrantBounds: { x: number; y: number; w: number; h: number } | null;
    quadrantStatuses?: Record<string, string>;
  } | null>(null);

  // ------------------- Component: derived values & callbacks ------------------
  // isDiscoveryReported, eligibleCharacters, fetchParty, etc. -

  /** Discovery is reported if DB (party.reportedDiscoveryKeys), session state, or a saved pin has the same discovery key. */
  const isDiscoveryReported = useCallback(
    (d: ReportableDiscovery) => {
      const key = discoveryKey(d);
      if (party?.reportedDiscoveryKeys?.includes(key)) return true;
      if (reportedDiscoveryKeys.has(key)) return true;
      return userPins.some((p) => p.sourceDiscoveryKey === key);
    },
    [party?.reportedDiscoveryKeys, reportedDiscoveryKeys, userPins]
  );

  const regionVillage = party?.region ? normalizeVillage(REGIONS[party.region]?.village ?? party.region) : "";
  const eligibleCharacters = regionVillage
    ? characters.filter((c) => normalizeVillage(c.currentVillage) === regionVillage)
    : [];

  const fetchParty = useCallback(async () => {
    if (!partyId) return;
    try {
      const res = await fetch(`/api/explore/parties/${encodeURIComponent(partyId)}`, { cache: "no-store" });
      if (res.status === 404) {
        const data = await res.json().catch(() => ({}));
        const code = (data as { code?: string })?.code;
        setParty(null);
        if (code === "expired") {
          setPartyError("This expedition has expired. Open expeditions expire after 24 hours.");
        } else if (code === "cancelled") {
          setPartyError("This expedition was cancelled.");
        } else {
          setPartyError("Expedition not found.");
        }
        return;
      }
      if (!res.ok) {
        console.error("[page.tsx]❌ Failed to load expedition:", res.status);
        setPartyError("Failed to load expedition.");
        return;
      }
      const data = await res.json();
      setParty(data);
      setPartyError(null);
    } catch (err) {
      console.error("[page.tsx]❌ Failed to load expedition:", err);
      setPartyError("Failed to load expedition.");
    }
  }, [partyId]);

  // ------------------- Component: effects ------------------
  // fetch party, sync reported keys, poll party, square preview, path image, discovery previews, pins, characters, explore items, inventory, edit inventory -

  useEffect(() => {
    fetchParty();
  }, [fetchParty]);

  // Sync reported-discovery state from server so "already placed" persists across reloads
  useEffect(() => {
    if (party?.reportedDiscoveryKeys && Array.isArray(party.reportedDiscoveryKeys)) {
      setReportedDiscoveryKeys((prev) => {
        const next = new Set(prev);
        for (const k of party.reportedDiscoveryKeys!) {
          if (typeof k === "string" && k.length > 0) next.add(k);
        }
        return next;
      });
    }
  }, [party?.reportedDiscoveryKeys]);

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
    const controller = new AbortController();
    const { signal } = controller;
    const q = party.quadrant || "";
    fetch(`/api/explore/square-preview?square=${encodeURIComponent(party.square)}${q ? `&quadrant=${encodeURIComponent(q)}` : ""}`, { signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (signal.aborted) return;
        if (data?.layers) {
          setSquarePreview({
            layers: data.layers,
            quadrantBounds: data.quadrantBounds ?? null,
            quadrantStatuses: data.quadrantStatuses ?? undefined,
          });
        } else {
          setSquarePreview(null);
        }
      })
      .catch((err) => {
        if (signal.aborted) return;
        setSquarePreview(null);
      });
    return () => controller.abort();
  }, [party?.square, party?.quadrant, party?.quadrantState]);

  // Load path image for current party+square so the map can show it (and refetch after upload via success URL)
  useEffect(() => {
    if (!partyId || !party?.square) {
      setPathImageForSquare(null);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    fetch(`/api/explore/path-images?partyId=${encodeURIComponent(partyId)}`, { signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { pathImages?: Array<{ squareId: string; imageUrl: string }> }) => {
        if (signal.aborted) return;
        const list = Array.isArray(data?.pathImages) ? data.pathImages : [];
        const forSquare = list.find((p) => p.squareId === party.square);
        setPathImageForSquare(forSquare?.imageUrl ?? null);
      })
      .catch(() => {
        if (signal.aborted) return;
        setPathImageForSquare(null);
      });
    return () => controller.abort();
  }, [partyId, party?.square]);

  // Load square previews for unreported discoveries (for click-to-place map)
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const list = getReportableDiscoveries(party?.progressLog);
    const unreported = list.filter((d) => !isDiscoveryReported(d));
    const squares = Array.from(new Set(unreported.map((d) => d.square)));
    squares.forEach((square) => {
      if (discoveryPreviewFetchedRef.current.has(square)) return;
      discoveryPreviewFetchedRef.current.add(square);
      fetch(`/api/explore/square-preview?square=${encodeURIComponent(square)}`, { signal })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          if (signal.aborted) return;
          if (data?.layers) {
            setDiscoveryPreviewBySquare((prev) => ({
              ...prev,
              [square]: { layers: data.layers, quadrantBounds: data.quadrantBounds ?? null, quadrantStatuses: data.quadrantStatuses ?? undefined },
            }));
          }
        })
        .catch(() => {
          if (signal.aborted) return;
          setDiscoveryPreviewBySquare((prev) => ({ ...prev, [square]: null }));
        });
    });
    return () => controller.abort();
  }, [party?.progressLog, isDiscoveryReported]);

  // When user clicks "Place on map", ensure we have the preview for that discovery's square (fetch on demand if missing)
  useEffect(() => {
    const square = placingForDiscovery?.square;
    if (!square) return;
    const existing = discoveryPreviewBySquare[square];
    if (existing?.layers?.length) return;
    const controller = new AbortController();
    const { signal } = controller;
    fetch(`/api/explore/square-preview?square=${encodeURIComponent(square)}`, { signal })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (signal.aborted) return;
        if (data?.layers) {
          setDiscoveryPreviewBySquare((prev) => ({
            ...prev,
            [square]: { layers: data.layers, quadrantBounds: data.quadrantBounds ?? null, quadrantStatuses: data.quadrantStatuses ?? undefined },
          }));
        } else {
          setDiscoveryPreviewBySquare((prev) => ({ ...prev, [square]: null }));
        }
      })
      .catch(() => {
        if (signal.aborted) return;
        setDiscoveryPreviewBySquare((prev) => ({ ...prev, [square]: null }));
      });
    return () => controller.abort();
  }, [placingForDiscovery?.square, discoveryPreviewBySquare]);

  const fetchPins = useCallback((signal?: AbortSignal) => {
    if (!userId) return;
    fetch("/api/pins", { credentials: "include", ...(signal && { signal }) })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (signal?.aborted) return;
        if (data?.pins && Array.isArray(data.pins)) {
          setUserPins(data.pins);
        } else {
          setUserPins([]);
        }
      })
      .catch(() => {
        if (signal?.aborted) return;
        setUserPins([]);
      });
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setUserPins([]);
      return;
    }
    const controller = new AbortController();
    fetchPins(controller.signal);
    return () => controller.abort();
  }, [userId, fetchPins]);

  // Poll pins so when someone else adds a pin, everyone sees it
  useEffect(() => {
    if (!userId) return;
    const t = setInterval(fetchPins, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [userId, fetchPins]);

  // Refetch pins when tab becomes visible (e.g. after another tab added a pin)
  useEffect(() => {
    if (!userId) return;
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchPins();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [userId, fetchPins]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const { signal } = controller;
    setLoadingChars(true);
    fetch("/api/characters/my-ocs?limit=100", { signal })
      .then((r) => r.json())
      .then((data) => {
        if (signal.aborted) return;
        const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        setCharacters(list);
      })
      .catch(() => {
        if (signal.aborted) return;
        setCharacters([]);
      })
      .finally(() => {
        if (signal.aborted) return;
        setLoadingChars(false);
      });
    return () => controller.abort();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const { signal } = controller;
    fetch("/api/explore/items", { signal })
      .then((r) => r.json())
      .then((list) => (Array.isArray(list) ? list : []))
      .then((items: ExploreItem[]) => {
        if (signal.aborted) return;
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
        if (signal.aborted) return;
        setExploreItemNames(new Set());
        setExploreItemStats(new Map());
        setExploreItemImages(new Map());
      });
    return () => controller.abort();
  }, [userId]);

  const selectedCharacter = eligibleCharacters.find((c) => String(c._id) === String(selectedCharacterId));

  // Paving bundles: 5 Eldin Ore = 1 bundle, 5 Wood = 1 bundle
  const bundleQuantities = useCallback(
    (byName: Map<string, number>) => {
      const eldin = byName.get("eldin ore") ?? 0;
      const wood = byName.get("wood") ?? 0;
      return {
        "Eldin Ore Bundle": Math.floor(eldin / 5),
        "Wood Bundle": Math.floor(wood / 5),
      };
    },
    []
  );

  useEffect(() => {
    if (!selectedCharacter?.name || !userId || exploreItemNames.size === 0) {
      setInventoryWithQuantity([]);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    setLoadingInventory(true);
    setSelectedItems([]);
    fetch(`/api/inventories/character/${encodeURIComponent(selectedCharacter.name)}/items`, { signal })
      .then((r) => r.json())
      .then((data: { data?: Array<{ itemName: string; quantity?: number }> }) => {
        if (signal.aborted) return;
        setInventoryWithQuantity(buildExploreInventoryList(data, exploreItemNames, bundleQuantities));
      })
      .catch(() => {
        if (signal.aborted) return;
        setInventoryWithQuantity([]);
      })
      .finally(() => {
        if (signal.aborted) return;
        setLoadingInventory(false);
      });
    return () => controller.abort();
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

  // ------------------- Component: handlers ------------------
  // join, copy link, start expedition, createDiscoveryPinAt, item add/remove, edit items save/cancel -

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
    const controller = new AbortController();
    const { signal } = controller;
    const name = party.currentUserMember.name;
    fetch(`/api/inventories/character/${encodeURIComponent(name)}/items`, { signal })
      .then((r) => r.json())
      .then((data: { data?: Array<{ itemName: string; quantity?: number }> }) => {
        if (signal.aborted) return;
        setEditInventoryWithQuantity(buildExploreInventoryList(data, exploreItemNames, bundleQuantities));
      })
      .catch(() => {
        if (signal.aborted) return;
        setEditInventoryWithQuantity([]);
      });
    return () => controller.abort();
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
        console.error("[page.tsx]❌ Failed to update items:", data.error ?? res.status);
        setUpdateItemsError(data.error ?? "Failed to update items");
        return;
      }
      setEditingItems(false);
      await fetchParty();
    } catch (e) {
      console.error("[page.tsx]❌ Update items request failed:", e);
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
        console.error("[page.tsx]❌ Failed to join:", data.error ?? res.status);
        setJoinError(data.error ?? "Failed to join");
        return;
      }
      await fetchParty();
    } catch (e) {
      console.error("[page.tsx]❌ Join request failed:", e);
      setJoinError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setJoining(false);
    }
  }, [partyId, selectedCharacterId, selectedItems, fetchParty]);

  const leaveParty = useCallback(async () => {
    if (!partyId) return;
    setLeaving(true);
    setLeaveError(null);
    try {
      const res = await fetch(`/api/explore/parties/${encodeURIComponent(partyId)}/leave`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setLeaveError(data.error ?? "Failed to leave");
        return;
      }
      await fetchParty();
    } catch (e) {
      console.error("[page.tsx]❌ Leave request failed:", e);
      setLeaveError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLeaving(false);
    }
  }, [partyId, fetchParty]);

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
        console.error("[page.tsx]❌ Failed to start expedition:", data.error ?? res.status);
        setStartExpeditionError(data.error ?? "Failed to start expedition");
        return;
      }
      await fetchParty();
    } catch (e) {
      console.error("[page.tsx]❌ Start expedition failed:", e);
      setStartExpeditionError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setStartingExpedition(false);
    }
  }, [partyId, fetchParty]);

  const cancelExpedition = useCallback(async () => {
    if (!window.confirm("Cancel this expedition? No one will be able to join or use it.")) return;
    setCancellingExpedition(true);
    try {
      const res = await fetch(`/api/explore/parties/${encodeURIComponent(partyId)}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[page.tsx]❌ Failed to cancel expedition:", data.error ?? res.status);
        setPartyError(data.error ?? "Failed to cancel expedition");
        return;
      }
      router.push("/explore");
    } catch (e) {
      console.error("[page.tsx]❌ Cancel expedition failed:", e);
      setPartyError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setCancellingExpedition(false);
    }
  }, [partyId, router]);

  const reportableDiscoveries = getReportableDiscoveries(party?.progressLog);

  /** Create a pin at the given coordinates (from map click). Saves to DB and shows on /map. */
  const createDiscoveryPinAt = useCallback(
    async (coords: { lat: number; lng: number }, d: ReportableDiscovery) => {
      const key = discoveryKey(d);
      setPlacePinError(null);
      setPlacingPinForKey(key);
      try {
        let description = `Reported from expedition. ${d.label} discovered in ${d.square} ${d.quadrant}.`;
        if (d.outcome === "ruins") {
          try {
            const previewRes = await fetch(
              `/api/explore/square-preview?square=${encodeURIComponent(d.square)}&quadrant=${encodeURIComponent(d.quadrant)}`,
              { credentials: "include" }
            );
            const preview = await previewRes.json().catch(() => ({}));
            const restStamina = typeof preview.ruinRestStamina === "number" && preview.ruinRestStamina > 0 ? preview.ruinRestStamina : null;
            if (restStamina != null) {
              description = `Reported from expedition. ${d.label} (rest spot: +${restStamina} stamina) discovered in ${d.square} ${d.quadrant}.`;
            }
          } catch {
            // keep default description if fetch fails
          }
        }
        const body: Record<string, unknown> = {
          name: d.label,
          description,
          coordinates: coords,
          category: "points-of-interest",
          color: "#b91c1c",
          icon: explorationIconValue(d.outcome),
          sourceDiscoveryKey: key,
          partyId: partyId || undefined,
        };
        const res = await fetch("/api/pins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (res.status === 401) {
            setPlacePinError("Please log in to place a marker.");
            return;
          }
          console.error("[page.tsx]❌ Failed to save marker:", data.error ?? res.status);
          setPlacePinError((data.error as string) ?? `Failed to save marker (${res.status}).`);
          return;
        }
        setReportedDiscoveryKeys((prev) => new Set(prev).add(key));
        setPlacingForDiscovery(null);
        fetchPins();
        await fetchParty();
      } catch (e) {
        console.error("[page.tsx]❌ Save marker failed:", e);
        setPlacePinError(e instanceof Error ? e.message : "Failed to save marker.");
      } finally {
        setPlacingPinForKey(null);
      }
    },
    [partyId, fetchPins, fetchParty]
  );

  // ------------------- Component: early returns ------------------
  // session loading, no partyId, partyError, !party -

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

  // ------------------- Component: main render ------------------
  // header, join section, map + progress, journey, party, sidebar -

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
            const statStr = formatItemStat(h, s);
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
                      src={layer.name === "MAP_0002_Map-Base" && pathImageForSquare ? pathImageForSquare : layer.url}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      style={{ zIndex: getExploreLayerZIndex(layer.name) }}
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
                          className="flex items-center justify-center p-1 text-3xl font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                          style={{
                            color,
                            WebkitTextStroke: "2px white",
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
                <QuadrantStatusLegend />
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
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm("Are you sure? Once started you cannot edit it and you are locked in!")) {
                        startExpedition();
                      }
                    }}
                    disabled={startingExpedition || cancellingExpedition}
                    className="inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-[var(--totk-light-green)]/60 bg-[var(--totk-dark-green)]/80 px-3 py-2 text-xs font-bold text-[var(--totk-ivory)] transition-opacity hover:opacity-90 disabled:opacity-60 sm:text-sm sm:px-4 sm:py-2.5"
                  >
                    {startingExpedition ? (
                      <i className="fa-solid fa-spinner fa-spin shrink-0 text-xs" aria-hidden />
                    ) : (
                      <i className="fa-solid fa-play shrink-0 text-xs opacity-90" aria-hidden />
                    )}
                    <span className="truncate">Start expedition</span>
                  </button>
                  <button
                    type="button"
                    onClick={cancelExpedition}
                    disabled={startingExpedition || cancellingExpedition}
                    className="inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-full border border-red-500/60 bg-red-900/50 px-3 py-2 text-xs font-bold text-red-200 transition-opacity hover:opacity-90 disabled:opacity-60 sm:text-sm sm:px-4 sm:py-2.5"
                  >
                    {cancellingExpedition ? (
                      <i className="fa-solid fa-spinner fa-spin shrink-0 text-xs" aria-hidden />
                    ) : (
                      <i className="fa-solid fa-times shrink-0 text-xs opacity-90" aria-hidden />
                    )}
                    <span className="truncate">Cancel expedition</span>
                  </button>
                </>
              )}
            </div>
          </header>

          {party.status === "completed" && (
            <section className="mb-6 rounded-2xl border-2 border-[var(--totk-dark-ocher)]/60 bg-[var(--totk-dark-ocher)]/20 px-5 py-4 shadow-lg sm:px-6 sm:py-5" role="status" aria-live="polite">
              <div className="flex flex-wrap items-center justify-center gap-3 text-center">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--totk-dark-ocher)]/50 text-[var(--totk-ivory)]">
                  <i className="fa-solid fa-flag-checkered text-lg" aria-hidden />
                </span>
                <div>
                  <h2 className="text-lg font-bold uppercase tracking-wider text-[var(--totk-ivory)] sm:text-xl">
                    Expedition ended!
                  </h2>
                  <p className="mt-0.5 text-sm text-[var(--totk-grey-200)]">
                    This expedition has been completed. Members returned to the village with remaining stamina and items.
                  </p>
                </div>
              </div>
            </section>
          )}

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

          {userId && ((party.status === "open" && party.members.length < 4) || party.currentUserJoined) && (
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
                  {leaveError && (
                    <p className="mt-2 text-sm text-red-400">{leaveError}</p>
                  )}
                  <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                    {party.status === "open" && (
                      <button
                        type="button"
                        onClick={startEditingItems}
                        className="rounded-lg border border-[var(--totk-mid-ocher)]/60 bg-[var(--botw-warm-black)]/80 px-4 py-2 text-sm font-medium text-[var(--totk-ivory)] transition-colors hover:border-[var(--totk-mid-ocher)] hover:bg-[var(--totk-dark-ocher)]/30"
                      >
                        <i className="fa-solid fa-pen-to-square mr-2 text-xs opacity-80" aria-hidden />
                        Edit items
                      </button>
                    )}
                    {party.status !== "completed" && (
                      <button
                        type="button"
                        onClick={leaveParty}
                        disabled={leaving}
                        className="rounded-lg border border-red-500/50 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:border-red-500/70 hover:bg-red-950/50 disabled:opacity-50"
                      >
                        {leaving ? "Leaving…" : "Leave expedition"}
                      </button>
                    )}
                  </div>
                </div>
                );
              })()}
              {party.currentUserJoined && party.currentUserMember && editingItems && (
                <div className="space-y-4">
                  <p className="text-sm text-[var(--botw-pale)]">Change items you’re bringing (up to 3, optional). Your character: <strong className="text-[var(--totk-ivory)]">{party.currentUserMember.name}</strong></p>
                  <p className="text-xs font-medium text-[var(--totk-grey-200)]">Selected</p>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    {[0, 1, 2].map((slot) => {
                      const itemName = editItems[slot];
                      if (!itemName) {
                        return (
                          <div
                            key={`edit-empty-${slot}`}
                            className="flex min-h-[72px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 py-3 text-center"
                          >
                            <span className="text-xs text-[var(--totk-grey-200)]">Slot {slot + 1}</span>
                            <span className="mt-0.5 text-[10px] text-[var(--totk-grey-200)]/80">Add below</span>
                          </div>
                        );
                      }
                      const img = exploreItemImages.get(itemName.toLowerCase());
                      return (
                        <div key={`edit-${slot}-${itemName}`} className="flex items-center gap-2 rounded-xl border border-[var(--totk-light-green)]/40 bg-[var(--botw-warm-black)]/80 py-2 pl-2 pr-2 shadow-sm">
                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                            {img ? (
                              <Image src={img} alt={itemName} width={40} height={40} className="h-full w-full object-cover" unoptimized={img.startsWith("http") || img.startsWith("/api/")} />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-xs font-medium text-[var(--totk-grey-200)]">{itemName.slice(0, 1)}</div>
                            )}
                          </div>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--totk-ivory)]" title={itemName}>{itemName}</span>
                          <button type="button" onClick={() => removeEditItem(slot)} className="shrink-0 rounded p-1.5 text-[var(--totk-grey-200)] transition-colors hover:bg-red-500/20 hover:text-red-300" aria-label={`Remove ${itemName}`}>
                            <i className="fa-solid fa-times text-xs" aria-hidden />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs font-medium text-[var(--totk-grey-200)]">Pick from inventory</p>
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
                        placeholder="Search by name…"
                        className="w-full rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm text-[var(--totk-ivory)] placeholder-[var(--totk-grey-200)] focus:border-[var(--totk-light-green)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/20"
                      />
                      {editSuggestionsOpen && editItems.length < 3 && (
                        <ul className="absolute top-full left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] py-1 shadow-xl">
                          {editSuggestionsList.length === 0 ? (
                            <li className="px-3 py-3 text-sm text-[var(--totk-grey-200)]">
                              {editItemSearch.trim() ? "No matching items" : "No items available to add"}
                            </li>
                          ) : (
                            editSuggestionsList.map((it, idx) => {
                              const st = exploreItemStats.get(it.itemName.toLowerCase());
                              const h = st?.modifierHearts ?? 0;
                              const s = st?.staminaRecovered ?? 0;
                              const statPart = formatItemStat(h, s);
                              const highlighted = idx === editItemHighlightIndex;
                              const thumb = exploreItemImages.get(it.itemName.toLowerCase());
                              return (
                                <li key={it.itemName}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      addEditItem(it.itemName);
                                      setEditItemSearch("");
                                    }}
                                    className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${highlighted ? "bg-[var(--totk-dark-ocher)]/50 text-[var(--totk-ivory)]" : "text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/30"}`}
                                  >
                                    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[var(--botw-warm-black)]">
                                      {thumb ? (
                                        <Image src={thumb} alt="" width={36} height={36} className="h-full w-full object-cover" unoptimized={thumb.startsWith("http") || thumb.startsWith("/api/")} />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--totk-grey-200)]">{it.itemName.slice(0, 1)}</div>
                                      )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <span className="block truncate font-medium">{it.itemName}</span>
                                      <span className="text-xs text-[var(--totk-grey-200)]">{statPart} · {it.quantity - editCount(it.itemName)} left</span>
                                    </div>
                                  </button>
                                </li>
                              );
                            })
                          )}
                        </ul>
                      )}
                    </div>
                    <span className="rounded-md bg-[var(--totk-dark-ocher)]/40 px-2 py-1.5 text-xs font-medium tabular-nums text-[var(--totk-grey-200)]">
                      {editItems.length}/3
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {editSuggestionsList.slice(0, 12).map((it) => {
                      const st = exploreItemStats.get(it.itemName.toLowerCase());
                      const h = st?.modifierHearts ?? 0;
                      const s = st?.staminaRecovered ?? 0;
                      const statPart = formatItemStat(h, s);
                      const thumb = exploreItemImages.get(it.itemName.toLowerCase());
                      const remaining = it.quantity - editCount(it.itemName);
                      return (
                        <button
                          key={it.itemName}
                          type="button"
                          onClick={() => addEditItem(it.itemName)}
                          className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/60 py-3 transition-colors hover:border-[var(--totk-light-green)]/40 hover:bg-[var(--totk-dark-ocher)]/30"
                        >
                          <div className="h-12 w-12 overflow-hidden rounded-lg bg-[var(--botw-warm-black)]">
                            {thumb ? (
                              <Image src={thumb} alt="" width={48} height={48} className="h-full w-full object-cover" unoptimized={thumb.startsWith("http") || thumb.startsWith("/api/")} />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm font-medium text-[var(--totk-grey-200)]">{it.itemName.slice(0, 1)}</div>
                            )}
                          </div>
                          <span className="max-w-full truncate px-1 text-xs font-medium text-[var(--totk-ivory)]" title={it.itemName}>{it.itemName}</span>
                          <span className="text-[10px] text-[var(--totk-grey-200)]">{statPart}</span>
                          <span className="text-[10px] text-[var(--totk-grey-200)]/80">×{remaining} left</span>
                        </button>
                      );
                    })}
                  </div>
                  {updateItemsError && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">
                      <i className="fa-solid fa-circle-exclamation shrink-0" aria-hidden />
                      {updateItemsError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button type="button" onClick={saveEditItems} disabled={editItems.length > 3 || updatingItems} className="rounded-xl border-2 border-[var(--totk-light-green)] bg-[var(--totk-dark-green)] px-4 py-2.5 text-sm font-bold text-[var(--totk-ivory)] hover:opacity-90 disabled:opacity-50">
                      {updatingItems ? "Saving…" : "Save items"}
                    </button>
                    <button type="button" onClick={cancelEditingItems} disabled={updatingItems} className="rounded-xl border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-4 py-2.5 text-sm font-medium text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/40">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {!party.currentUserJoined && (
                <>
                  {regionInfo && (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-[var(--totk-light-green)]/30 bg-[var(--totk-light-green)]/5 px-3 py-2.5">
                      <i className="fa-solid fa-map-pin mt-0.5 text-sm text-[var(--totk-light-green)]/80" aria-hidden />
                      <p className="text-xs text-[var(--botw-pale)]">
                        Your character must be in <strong className="text-[var(--totk-ivory)]">{regionInfo.village}</strong>. Order below is turn order.
                      </p>
                    </div>
                  )}
                  {loadingChars && (
                    <div className="flex items-center gap-2 rounded-xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/40 px-4 py-3">
                      <i className="fa-solid fa-spinner fa-spin text-[var(--totk-grey-200)]" aria-hidden />
                      <p className="text-sm text-[var(--totk-grey-200)]">Loading your characters…</p>
                    </div>
                  )}
                  {!loadingChars && eligibleCharacters.length === 0 && (
                    <p className="rounded-xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/40 px-4 py-3 text-sm text-[var(--totk-grey-200)]">
                      No character in {regionInfo?.village ?? party.region}. Move one there to join.
                    </p>
                  )}
                  {!loadingChars && eligibleCharacters.length > 0 && (
                    <div className="space-y-5">
                      <div className="rounded-xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/50 p-4 shadow-inner">
                        <label className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                          <i className="fa-solid fa-user text-[10px] opacity-70" aria-hidden />
                          Your character
                        </label>
                        <div className="flex flex-wrap items-center gap-4">
                          {selectedCharacter && (
                            <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-full border-2 border-[var(--totk-light-green)]/40 bg-[var(--botw-warm-black)] ring-2 ring-[var(--totk-dark-ocher)]/30">
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
                          <select
                            value={selectedCharacterId}
                            onChange={(e) => setSelectedCharacterId(e.target.value)}
                            className="min-w-[220px] flex-1 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2.5 text-sm text-[var(--totk-ivory)] transition-colors placeholder-[var(--totk-grey-200)] focus:border-[var(--totk-light-green)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/20"
                          >
                            <option value="">Select character…</option>
                            {eligibleCharacters.map((c) => (
                              <option key={String(c._id)} value={String(c._id)}>
                                {c.name} · ❤️ {c.currentHearts ?? c.maxHearts ?? "?"} · 🟩 {c.currentStamina ?? c.maxStamina ?? "?"}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="rounded-xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/50 p-4 shadow-inner">
                        <label className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                          <i className="fa-solid fa-backpack text-[10px] opacity-70" aria-hidden />
                          Items to bring
                          <span className="rounded bg-[var(--totk-dark-ocher)]/40 px-1.5 py-0.5 text-[10px] font-normal normal-case tracking-normal text-[var(--botw-pale)]">
                            optional, up to 3
                          </span>
                        </label>
                        <p className="mb-3 text-xs text-[var(--totk-grey-200)]">
                          From this character’s inventory. Type to search or pick from the list — you can join with 0, 1, 2, or 3 items.
                        </p>
                        {loadingInventory && (
                          <p className="flex items-center gap-2 text-xs text-[var(--totk-grey-200)]">
                            <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                            Loading inventory…
                          </p>
                        )}
                        {!loadingInventory && inventoryWithQuantity.length === 0 && selectedCharacterId && (
                          <p className="rounded-lg border border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-warm-black)]/60 px-3 py-2 text-xs text-[var(--totk-grey-200)]">
                            No exploration items in this character’s inventory. You can still join with no items.
                          </p>
                        )}
                        {!loadingInventory && inventoryWithQuantity.length > 0 && (
                          <>
                            <p className="mb-2 text-xs font-medium text-[var(--totk-grey-200)]">Selected</p>
                            <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
                              {[0, 1, 2].map((slot) => {
                                const itemName = selectedItems[slot];
                                if (!itemName) {
                                  return (
                                    <div
                                      key={`empty-${slot}`}
                                      className="flex min-h-[72px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 py-3 text-center"
                                    >
                                      <span className="text-xs text-[var(--totk-grey-200)]">Slot {slot + 1}</span>
                                      <span className="mt-0.5 text-[10px] text-[var(--totk-grey-200)]/80">Add below</span>
                                    </div>
                                  );
                                }
                                const img = exploreItemImages.get(itemName.toLowerCase());
                                return (
                                  <div key={`${slot}-${itemName}`} className="flex items-center gap-2 rounded-xl border border-[var(--totk-light-green)]/40 bg-[var(--botw-warm-black)]/80 py-2 pl-2 pr-2 shadow-sm">
                                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
                                      {img ? (
                                        <Image src={img} alt={itemName} width={40} height={40} className="h-full w-full object-cover" unoptimized={img.startsWith("http") || img.startsWith("/api/")} />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-xs font-medium text-[var(--totk-grey-200)]">{itemName.slice(0, 1)}</div>
                                      )}
                                    </div>
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--totk-ivory)]" title={itemName}>{itemName}</span>
                                    <button type="button" onClick={() => removeSelectedItem(slot)} className="shrink-0 rounded p-1.5 text-[var(--totk-grey-200)] transition-colors hover:bg-red-500/20 hover:text-red-300" aria-label={`Remove ${itemName}`}>
                                      <i className="fa-solid fa-times text-xs" aria-hidden />
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                            <p className="mb-2 text-xs font-medium text-[var(--totk-grey-200)]">Pick from inventory</p>
                            <div className="mb-3 flex flex-wrap items-center gap-2">
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
                                  placeholder="Search by name…"
                                  className="w-full rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm text-[var(--totk-ivory)] placeholder-[var(--totk-grey-200)] focus:border-[var(--totk-light-green)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/20"
                                />
                                {itemSuggestionsOpen && selectedItems.length < 3 && (
                                  <ul className="absolute top-full left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] py-1 shadow-xl">
                                    {itemSuggestionsList.length === 0 ? (
                                      <li className="px-3 py-3 text-sm text-[var(--totk-grey-200)]">
                                        {itemSearch.trim() ? "No matching items" : "No items available to add (max 3 or out of stock)"}
                                      </li>
                                    ) : (
                                      itemSuggestionsList.map((it, idx) => {
                                        const st = exploreItemStats.get(it.itemName.toLowerCase());
                                        const h = st?.modifierHearts ?? 0;
                                        const s = st?.staminaRecovered ?? 0;
                                        const statPart = formatItemStat(h, s);
                                        const highlighted = idx === itemHighlightIndex;
                                        const thumb = exploreItemImages.get(it.itemName.toLowerCase());
                                        return (
                                          <li key={it.itemName}>
                                            <button
                                              type="button"
                                              onMouseDown={(e) => e.preventDefault()}
                                              onClick={() => {
                                                addSelectedItem(it.itemName);
                                                setItemSearch("");
                                              }}
                                              className={`flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${highlighted ? "bg-[var(--totk-dark-ocher)]/50 text-[var(--totk-ivory)]" : "text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/30"}`}
                                            >
                                              <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-[var(--botw-warm-black)]">
                                                {thumb ? (
                                                  <Image src={thumb} alt="" width={36} height={36} className="h-full w-full object-cover" unoptimized={thumb.startsWith("http") || thumb.startsWith("/api/")} />
                                                ) : (
                                                  <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--totk-grey-200)]">{it.itemName.slice(0, 1)}</div>
                                                )}
                                              </div>
                                              <div className="min-w-0 flex-1">
                                                <span className="block truncate font-medium">{it.itemName}</span>
                                                <span className="text-xs text-[var(--totk-grey-200)]">{statPart} · {it.quantity - countSelected(it.itemName)} left</span>
                                              </div>
                                            </button>
                                          </li>
                                        );
                                      })
                                    )}
                                  </ul>
                                )}
                              </div>
                              <span className="rounded-md bg-[var(--totk-dark-ocher)]/40 px-2 py-1.5 text-xs font-medium tabular-nums text-[var(--totk-grey-200)]">
                                {selectedItems.length}/3
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                              {itemSuggestionsList.slice(0, 12).map((it) => {
                                const st = exploreItemStats.get(it.itemName.toLowerCase());
                                const h = st?.modifierHearts ?? 0;
                                const s = st?.staminaRecovered ?? 0;
                                const statPart = formatItemStat(h, s);
                                const thumb = exploreItemImages.get(it.itemName.toLowerCase());
                                const remaining = it.quantity - countSelected(it.itemName);
                                return (
                                  <button
                                    key={it.itemName}
                                    type="button"
                                    onClick={() => addSelectedItem(it.itemName)}
                                    className="flex flex-col items-center gap-1.5 rounded-xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/60 py-3 transition-colors hover:border-[var(--totk-light-green)]/40 hover:bg-[var(--totk-dark-ocher)]/30"
                                  >
                                    <div className="h-12 w-12 overflow-hidden rounded-lg bg-[var(--botw-warm-black)]">
                                      {thumb ? (
                                        <Image src={thumb} alt="" width={48} height={48} className="h-full w-full object-cover" unoptimized={thumb.startsWith("http") || thumb.startsWith("/api/")} />
                                      ) : (
                                        <div className="flex h-full w-full items-center justify-center text-sm font-medium text-[var(--totk-grey-200)]">{it.itemName.slice(0, 1)}</div>
                                      )}
                                    </div>
                                    <span className="max-w-full truncate px-1 text-xs font-medium text-[var(--totk-ivory)]" title={it.itemName}>{it.itemName}</span>
                                    <span className="text-[10px] text-[var(--totk-grey-200)]">{statPart}</span>
                                    <span className="text-[10px] text-[var(--totk-grey-200)]/80">×{remaining} left</span>
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                      {joinError && (
                        <div className="flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/20 px-3 py-2 text-sm text-red-300">
                          <i className="fa-solid fa-circle-exclamation shrink-0" aria-hidden />
                          {joinError}
                        </div>
                      )}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={joinParty}
                          disabled={!canJoin || joining}
                          className="inline-flex items-center gap-2 rounded-xl border-2 border-[var(--totk-light-green)] bg-[var(--totk-dark-green)] px-5 py-3 text-sm font-bold text-[var(--totk-ivory)] shadow-lg shadow-[var(--totk-dark-green)]/30 transition-all hover:opacity-95 hover:shadow-[var(--totk-light-green)]/10 disabled:opacity-50 disabled:shadow-none"
                        >
                          {joining ? (
                            <>
                              <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                              Joining…
                            </>
                          ) : (
                            <>
                              <i className="fa-solid fa-user-plus text-sm opacity-90" aria-hidden />
                              Join expedition
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {(party.status === "started" || party.status === "completed") && (
            <>
              {/* 1. Map | Progress log — side by side */}
              <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Map — same container used for current location and for placing discovery markers */}
                {(() => {
                  const isPlacing = placingForDiscovery != null;
                  const displayPreview = isPlacing
                    ? discoveryPreviewBySquare[placingForDiscovery!.square]
                    : squarePreview;
                  const displaySquare = isPlacing ? placingForDiscovery!.square : party.square;
                  const displayQuadrant = isPlacing ? placingForDiscovery!.quadrant : party.quadrant;
                  const showMap = displayPreview?.layers?.length;
                  const canPlacePins = !!(userId && party.currentUserJoined);
                  const unreported = reportableDiscoveries.filter((d) => !isDiscoveryReported(d));
                  const pinned = reportableDiscoveries.filter((d) => isDiscoveryReported(d));
                  const showReportToTownHall = unreported.length > 0;
                  const handleMapClick = (e: React.MouseEvent<HTMLDivElement>) => {
                    if (!isPlacing || !placingForDiscovery) return;
                    const el = e.currentTarget;
                    const rect = el.getBoundingClientRect();
                    const pctX = (e.clientX - rect.left) / rect.width;
                    const pctY = (e.clientY - rect.top) / rect.height;
                    if (!isClickInQuadrant(pctX, pctY, placingForDiscovery.quadrant)) {
                      setPlacePinError(`Click inside the highlighted quadrant (${placingForDiscovery.quadrant}) to place this marker.`);
                      return;
                    }
                    setPlacePinError(null);
                    const bounds = getSquareBounds(placingForDiscovery.square);
                    const lng = bounds.lngMin + pctX * (bounds.lngMax - bounds.lngMin);
                    const lat = bounds.latMin + pctY * (bounds.latMax - bounds.latMin);
                    createDiscoveryPinAt({ lat, lng }, placingForDiscovery);
                  };
                  return (
                    <section className="rounded-2xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 p-4 shadow-inner">
                      {showReportToTownHall && (
                        <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-950/20 px-3 py-2">
                          <h3 className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-400">
                            <i className="fa-solid fa-landmark text-[10px] opacity-80" aria-hidden />
                            Report to town hall
                          </h3>
                          <p className="mb-2 text-[11px] font-medium text-amber-300/95">
                            Place pins before the party moves to another square — unmarked discoveries in the current square are cleared and considered lost when you move.
                          </p>
                          {!userId ? (
                            <p className="mb-2 text-[11px] text-[var(--totk-grey-200)]">
                              You found something to report. <Link href="/api/auth/discord" className="font-medium text-amber-300 underline">Log in</Link> to place these on the map (saved pins appear on the main Map page).
                            </p>
                          ) : !canPlacePins ? (
                            <p className="mb-2 text-[11px] text-[var(--totk-grey-200)]">
                              Party members can place these on the map. Join this expedition to add markers.
                            </p>
                          ) : (
                            <p className="mb-2 text-[11px] text-[var(--totk-grey-200)]">
                              Click &quot;Place on map&quot; then click <strong>inside the highlighted quadrant</strong> for that discovery (it will be saved and appear on the main Map page).
                            </p>
                          )}
                          {placePinError && canPlacePins && (
                            <div className="mb-2 rounded border border-red-500/60 bg-red-950/40 px-2 py-1.5 text-xs text-red-300" role="alert">
                              {placePinError}
                              {placePinError.includes("log in") && (
                                <Link href="/api/auth/discord" className="ml-1 font-medium text-amber-300 underline">Log in</Link>
                              )}
                            </div>
                          )}
                          <ul className="flex flex-wrap gap-2">
                            {unreported.map((d) => {
                              const key = discoveryKey(d);
                              const isThisPlacing = placingForDiscovery && discoveryKey(placingForDiscovery) === key;
                              const isSaving = placingPinForKey === key;
                              return (
                                <li key={key} className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-[var(--botw-warm-black)]/50 px-2.5 py-1.5">
                                  <span className="text-xs font-medium text-[var(--totk-ivory)]">{d.square} {d.quadrant} — {d.label}</span>
                                  {!userId ? (
                                    <span className="text-[10px] text-amber-400/90">Log in to place on map</span>
                                  ) : !canPlacePins ? (
                                    <span className="text-[10px] text-amber-400/90">Party members only</span>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={isSaving || (isPlacing && !isThisPlacing)}
                                      onClick={() => {
                                        setPlacingForDiscovery(d);
                                        setPlacePinError(null);
                                        setTimeout(() => mapContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 100);
                                      }}
                                      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition ${isThisPlacing ? "border-2 border-amber-400 bg-amber-900/60 text-amber-200" : "border border-amber-500/60 bg-amber-900/50 text-amber-200 hover:bg-amber-800/50"} disabled:opacity-50`}
                                    >
                                      {isSaving ? <i className="fa-solid fa-spinner fa-spin" aria-hidden /> : <i className="fa-solid fa-map-pin" aria-hidden />}
                                      {isSaving ? "Saving…" : isThisPlacing ? "Click map below" : "Place on map"}
                                    </button>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                          {pinned.length > 0 && (
                            <div className="mt-2 border-t border-amber-500/20 pt-2">
                              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-amber-400/80">Already on map</p>
                              <ul className="flex flex-wrap gap-2">
                                {pinned.map((d) => (
                                  <li key={discoveryKey(d)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-600/30 bg-emerald-950/30 px-2.5 py-1.5">
                                    <span className="text-xs font-medium text-[var(--totk-ivory)]">{d.square} {d.quadrant} — {d.label}</span>
                                    <span className="text-[10px] font-medium text-emerald-400">Discovery pinned</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                      {party.quadrantState === "secured" && wasSecuredThisSession(party.progressLog, party.square, party.quadrant) && !pathImageForSquare && (
                        <div className="mb-3 rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--totk-mid-ocher)]/20 px-3 py-2">
                          <h3 className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--totk-ivory)]">
                            <i className="fa-solid fa-route text-[10px] opacity-80" aria-hidden />
                            Draw path on map
                          </h3>
                          <p className="mb-2 text-[11px] text-[var(--totk-grey-200)]">
                            Download the full square image below, draw your path on it (e.g. in Paint or any image editor), save the image, then upload it here. It will appear on the main Map page and update automatically if you upload again.
                          </p>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <a
                              href={`/api/images/maps/squares/MAP_0002_Map-Base/MAP_0002_Map-Base_${party.square}.png`}
                              download={`square-${party.square}.png`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/50 px-2 py-1 text-[10px] font-medium text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/30"
                            >
                              <i className="fa-solid fa-download" aria-hidden />
                              Download square image ({party.square})
                            </a>
                            <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/50 px-2 py-1 text-[10px] font-medium text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/30">
                              <input
                                type="file"
                                accept="image/*"
                                className="sr-only"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  setPathImageFile(f ?? null);
                                  setPathImageStatus("");
                                }}
                              />
                              <i className="fa-solid fa-file-image" aria-hidden />
                              {pathImageFile ? pathImageFile.name : "Choose image"}
                            </label>
                            <button
                              type="button"
                              disabled={!pathImageFile || pathImageUploading}
                              onClick={async () => {
                                if (!pathImageFile || pathImageUploading) return;
                                setPathImageUploading(true);
                                setPathImageSuccessUrl(null);
                                setPathImageStatus("Uploading…");
                                try {
                                  const form = new FormData();
                                  form.append("file", pathImageFile);
                                  form.append("partyId", party.partyId ?? "");
                                  form.append("squareId", party.square);
                                  const res = await fetch("/api/explore/path-images/upload", {
                                    method: "POST",
                                    credentials: "include",
                                    body: form,
                                  });
                                  const data = (await res.json().catch(() => ({}))) as { error?: string; url?: string };
                                  if (!res.ok) {
                                    console.error("[page.tsx]❌ Path image upload failed:", data.error ?? res.status);
                                    setPathImageSuccessUrl(null);
                                    setPathImageStatus((data.error as string) || `Upload failed (${res.status}).`);
                                    return;
                                  }
                                  setPathImageFile(null);
                                  const url = data.url as string | undefined;
                                  setPathImageSuccessUrl(url ?? null);
                                  if (url) setPathImageForSquare(url);
                                  setPathImageStatus(
                                    url
                                      ? "Path image uploaded and saved to Google Cloud. It will appear on the main Map page. Verify the image:"
                                      : "Path image uploaded! It appears on the main Map page."
                                  );
                                  fetchParty();
                                } catch (e) {
                                  console.error("[page.tsx]❌ Path image upload failed:", e);
                                  setPathImageSuccessUrl(null);
                                  setPathImageStatus("Upload failed: " + (e instanceof Error ? e.message : "Try again."));
                                } finally {
                                  setPathImageUploading(false);
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded border border-[var(--totk-light-green)]/60 bg-[var(--totk-dark-green)]/50 px-2 py-1 text-[10px] font-medium text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-green)]/70 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {pathImageUploading ? <i className="fa-solid fa-spinner fa-spin" aria-hidden /> : <i className="fa-solid fa-upload" aria-hidden />}
                              Upload path image
                            </button>
                          </div>
                          {pathImageStatus && (
                            <p className="text-[11px] text-[var(--totk-grey-200)]">
                              {pathImageStatus}
                              {pathImageSuccessUrl && (
                                <>
                                  {" "}
                                  <a
                                    href={pathImageSuccessUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[var(--totk-light-green)] underline"
                                  >
                                    Open image
                                  </a>
                                </>
                              )}
                            </p>
                          )}
                        </div>
                      )}
                      <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--totk-grey-200)]">
                        {isPlacing ? `Place marker — ${placingForDiscovery!.label} · ${displaySquare} ${displayQuadrant}` : `Map · ${party.square} ${party.quadrant}`}
                      </h2>
                      {showMap ? (
                        <>
                        <div
                          ref={mapContainerRef}
                          role={isPlacing && canPlacePins ? "button" : undefined}
                          tabIndex={isPlacing && canPlacePins ? 0 : undefined}
                          onClick={isPlacing && canPlacePins ? handleMapClick : undefined}
                          onKeyDown={isPlacing && canPlacePins ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); const coords = squareQuadrantToCoordinates(placingForDiscovery!.square, placingForDiscovery!.quadrant); createDiscoveryPinAt(coords, placingForDiscovery!); } } : undefined}
                          onMouseEnter={isPlacing ? () => setMapHovered(true) : undefined}
                          onMouseLeave={isPlacing ? () => setMapHovered(false) : undefined}
                          onMouseMove={isPlacing ? (e) => {
                            const el = mapContainerRef.current;
                            if (!el) return;
                            const rect = el.getBoundingClientRect();
                            const x = (e.clientX - rect.left) / rect.width;
                            const y = (e.clientY - rect.top) / rect.height;
                            setMapHoverPct({ x, y });
                          } : undefined}
                          className={`relative mx-auto max-w-2xl overflow-hidden rounded-lg border-2 ${isPlacing ? "cursor-crosshair border-amber-500/70" : "border-[var(--totk-dark-ocher)]/50"}`}
                          style={{ aspectRatio: "2400/1666" }}
                          aria-label={isPlacing ? `Click to place marker for ${placingForDiscovery!.label}` : undefined}
                        >
                          <div
                            className="absolute inset-0 transition-transform duration-200 ease-out"
                            style={{
                              transform: isPlacing && mapHovered ? "scale(1.75)" : "scale(1)",
                              transformOrigin: `${mapHoverPct.x * 100}% ${mapHoverPct.y * 100}%`,
                            }}
                            aria-hidden
                          >
                          {isPlacing && placingPinForKey === discoveryKey(placingForDiscovery!) && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60">
                              <span className="text-sm font-medium text-amber-200"><i className="fa-solid fa-spinner fa-spin mr-2" aria-hidden />Saving…</span>
                            </div>
                          )}
                          {displayPreview!.layers
                            .filter((layer) => layer.name !== "MAP_0001_hidden-areas")
                            .map((layer) => (
                              <img
                                key={layer.name}
                                src={layer.name === "MAP_0002_Map-Base" && displayPreview === squarePreview && pathImageForSquare ? pathImageForSquare : layer.url}
                                alt=""
                                className="absolute inset-0 h-full w-full object-cover"
                                style={{
                                  zIndex: getExploreLayerZIndex(layer.name),
                                  ...(isPlacing ? { pointerEvents: "none" as const } : {}),
                                }}
                                onError={(e) => { e.currentTarget.style.display = "none"; }}
                              />
                            ))}
                          {(() => {
                            const fogLayer = displayPreview!.layers.find((l) => l.name === "MAP_0001_hidden-areas");
                            if (!fogLayer) return null;
                            const statuses = displayPreview!.quadrantStatuses ?? party.quadrantStatuses ?? {};
                            const fogQuadrants: number[] = [];
                            (["Q1", "Q2", "Q3", "Q4"] as const).forEach((qId, i) => {
                              const s = (statuses[qId] ?? "unexplored").toLowerCase();
                              if (s === "unexplored" || s === "inaccessible") fogQuadrants.push(i + 1);
                            });
                            if (fogQuadrants.length === 0) return null;
                            const clipPath = fogClipPathForQuadrants(fogQuadrants);
                            return (
                              <div
                                className="pointer-events-none absolute inset-0 z-10"
                                aria-hidden
                              >
                                <img
                                  src={fogLayer.url}
                                  alt=""
                                  className="absolute inset-0 h-full w-full object-cover"
                                  style={
                                    clipPath
                                      ? { clipPath, WebkitClipPath: clipPath }
                                      : undefined
                                  }
                                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                                />
                              </div>
                            );
                          })()}
                          {isPlacing && placingForDiscovery && (() => {
                            const q = QUADRANT_PCT[placingForDiscovery.quadrant.toUpperCase()];
                            if (!q) return null;
                            return (
                              <>
                                <div className="pointer-events-none absolute inset-0 bg-black/50" aria-hidden />
                                <div
                                  className="pointer-events-none absolute border-2 border-amber-400 bg-amber-400/20"
                                  style={{
                                    left: `${q.x * 100}%`,
                                    top: `${q.y * 100}%`,
                                    width: `${q.w * 100}%`,
                                    height: `${q.h * 100}%`,
                                  }}
                                  aria-hidden
                                />
                                <div
                                  className="pointer-events-none absolute flex items-center justify-center text-sm font-bold text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                                  style={{
                                    left: `${q.x * 100}%`,
                                    top: `${q.y * 100}%`,
                                    width: `${q.w * 100}%`,
                                    height: `${q.h * 100}%`,
                                  }}
                                  aria-hidden
                                >
                                  {placingForDiscovery.quadrant}
                                </div>
                              </>
                            );
                          })()}
                          {!isPlacing && (() => {
                            const b = getSquareBounds(displaySquare);
                            const pinsInSquare = userPins.filter(
                              (pin) =>
                                pin.coordinates.lng >= b.lngMin &&
                                pin.coordinates.lng < b.lngMax &&
                                pin.coordinates.lat >= b.latMin &&
                                pin.coordinates.lat < b.latMax
                            );
                            return (
                              <div className="pointer-events-none absolute inset-0" aria-hidden>
                                {pinsInSquare.map((pin) => {
                                  const pctX = (pin.coordinates.lng - b.lngMin) / (b.lngMax - b.lngMin);
                                  const pctY = (pin.coordinates.lat - b.latMin) / (b.latMax - b.latMin);
                                  const isExploration = isExplorationIcon(pin.icon) && getExplorationIconUrl(pin.icon);
                                  return (
                                    <div
                                      key={pin._id}
                                      className={
                                        isExploration
                                          ? "absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center"
                                          : "absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 shadow-md"
                                      }
                                      style={{
                                        left: `${pctX * 100}%`,
                                        top: `${pctY * 100}%`,
                                      }}
                                      title={pin.name}
                                    >
                                      {isExploration ? (
                                        <img
                                          src={getExplorationIconUrl(pin.icon)!}
                                          alt=""
                                          className="h-8 w-8 object-contain"
                                          aria-hidden
                                        />
                                      ) : (
                                        <i
                                          className={`${pin.icon ?? "fas fa-map-marker-alt"} text-sm`}
                                          style={{ color: pin.color ?? "#00A3DA" }}
                                          aria-hidden
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          {!isPlacing && squarePreview?.quadrantBounds && displayPreview === squarePreview && (
                            <div
                              className="pointer-events-none absolute border-2 border-[var(--totk-light-green)]/90 bg-[var(--totk-light-green)]/10"
                              style={{
                                left: `${squarePreview.quadrantBounds!.x}%`,
                                top: `${squarePreview.quadrantBounds!.y}%`,
                                width: `${squarePreview.quadrantBounds!.w}%`,
                                height: `${squarePreview.quadrantBounds!.h}%`,
                              }}
                              aria-hidden
                            />
                          )}
                          <div className="pointer-events-none absolute inset-0" aria-hidden>
                            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/40" style={{ transform: "translateX(-50%)" }} />
                            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/40" style={{ transform: "translateY(-50%)" }} />
                          </div>
                          <div className="pointer-events-none absolute inset-0 z-20 grid grid-cols-2 grid-rows-2">
                            {(["Q1", "Q2", "Q3", "Q4"] as const).map((qId) => {
                              const status = displayPreview!.quadrantStatuses?.[qId] ?? party.quadrantStatuses?.[qId] ?? "unexplored";
                              const color = QUADRANT_STATUS_COLORS[status] ?? QUADRANT_STATUS_COLORS.unexplored;
                              return (
                                <div key={qId} className="flex items-center justify-center p-1 text-2xl font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" style={{ color, WebkitTextStroke: "2px white", paintOrder: "stroke fill" } as React.CSSProperties}>
                                  {qId}
                                </div>
                              );
                            })}
                          </div>
                          </div>
                        </div>
                        <QuadrantStatusLegend />
                      </>
                      ) : (
                        <div ref={mapContainerRef} className="relative mx-auto flex max-w-2xl items-center justify-center rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/60" style={{ aspectRatio: "2400/1666" }}>
                          <i className="fa-solid fa-spinner fa-spin text-2xl text-[var(--totk-grey-200)]" aria-hidden />
                        </div>
                      )}
                      {isPlacing && showMap && placingForDiscovery && (
                        <p className="mt-1.5 text-[10px] text-amber-400/90">Hover over the map to zoom in. Click inside the highlighted {placingForDiscovery.quadrant} quadrant to place your marker.</p>
                      )}
                    </section>
                  );
                })()}
                {/* Progress log */}
                <section className="flex min-h-0 flex-col rounded-2xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 p-4 shadow-inner min-w-0">
                  <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--totk-light-green)]">
                    <i className="fa-solid fa-list text-[10px] opacity-80" aria-hidden />
                    Progress log
                  </h3>
                  {party.gatheredItems && party.gatheredItems.length > 0 && (
                    <div className="mb-2 flex-shrink-0 rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/50 px-2 py-1.5">
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
                    <ul className="max-h-[40rem] min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/50 py-1.5" role="list">
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
                                {entry.staminaLost != null && entry.staminaLost > 0 && <span className="text-amber-400/90" title="Stamina">−{entry.staminaLost} <i className="fa-solid fa-bolt text-[10px] opacity-90" aria-hidden /></span>}
                                {entry.heartsRecovered != null && entry.heartsRecovered > 0 && <span className="text-red-400/90">+{entry.heartsRecovered} ❤</span>}
                                {entry.staminaRecovered != null && entry.staminaRecovered > 0 && <span className="text-[var(--totk-light-green)]/90" title="Stamina">+{entry.staminaRecovered} <i className="fa-solid fa-bolt text-[10px] opacity-90" aria-hidden /></span>}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-[var(--botw-pale)] leading-snug">{renderMessageWithBold(entry.message ?? "")}</p>
                          {entry.loot?.itemName && <p className="text-[11px] text-[var(--totk-light-green)]">Loot: {entry.loot.itemName}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
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

              {/* 2. Journey | Party — two columns */}
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Journey */}
                <section className="rounded-2xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 p-4 shadow-inner">
                  <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--totk-light-green)]">Journey</h2>
                  {(() => {
                    const start = REGIONS[party.region?.toLowerCase()];
                    const startLoc = start ? `${start.square} ${start.quadrant}` : `${party.square} ${party.quadrant}`;
                    const journey: string[] = [startLoc];
                    // Bot logs moves as "Moved to **H6 Q2** (quadrant explored). (-1 stamina)" — capture location in **
                    const moveRe = /\*\*(\S+ \S+)\*\*/;
                    for (const e of party.progressLog ?? []) {
                      if (e.outcome !== "move") continue;
                      const m = moveRe.exec(e.message ?? "");
                      if (m && m[1]) journey.push(m[1]);
                    }
                    const currentLoc = `${party.square} ${party.quadrant}`;
                    // Ensure journey ends with current location (in case of polling/format mismatch)
                    if (journey.length > 0 && journey[journey.length - 1] !== currentLoc) {
                      journey.push(currentLoc);
                    }
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
                      const { displayIcon, displayHearts, displayStamina, isCurrentTurn } = getMemberDisplay(m, characters, party, index);
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
                const { displayIcon, displayHearts, displayStamina, isCurrentTurn } = getMemberDisplay(m, characters, party, index);
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
