"use client";

// ============================================================================
// MapSquareCard - Detailed view of one map square and its quadrants
// ============================================================================

import { useEffect, useState } from "react";

export type QuadrantDoc = {
  quadrantId?: string;
  status?: string;
  blighted?: boolean;
  noCamp?: boolean;
  hazards?: string[];
  terrain?: string[];
  items?: string[];
  monsters?: string[];
  bossMonsters?: string[];
  special?: string[];
  discoveries?: { type?: string; number?: string; name?: string; grottoStatus?: string }[];
  exploredBy?: string;
  exploredAt?: string | Date | null;
  oldMapNumber?: number | null;
  oldMapLeadsTo?: string | null;
  ruinRestStamina?: number | null;
};

export type MapSquare = {
  _id: string;
  squareId: string;
  region: string;
  status: string;
  quadrants?: QuadrantDoc[];
  image?: string;
  pathImageUrl?: string | null;
  displayProperties?: { visible?: boolean; opacity?: number; zIndex?: number };
  mapCoordinates?: unknown;
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

type SquarePreviewLayer = { name: string; url: string };
type SquarePreview = {
  layers: SquarePreviewLayer[];
  quadrantStatuses?: Record<string, string>;
};

const FOG_QUADRANT_LAYOUT: Record<number, { left: string; top: string; width: string; height: string; bgPos: string }> = {
  1: { left: "0%", top: "0%", width: "50%", height: "50%", bgPos: "0% 0%" },
  2: { left: "50%", top: "0%", width: "50%", height: "50%", bgPos: "100% 0%" },
  3: { left: "0%", top: "50%", width: "50%", height: "50%", bgPos: "0% 100%" },
  4: { left: "50%", top: "50%", width: "50%", height: "50%", bgPos: "100% 100%" },
};

function formatDate(v: string | Date | null | undefined): string {
  if (v == null) return "—";
  try {
    const d = typeof v === "string" ? new Date(v) : v;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function TagList({
  labels,
  emptyText = "None",
  getTagClass,
}: {
  labels: string[] | undefined;
  emptyText?: string;
  getTagClass?: (label: string) => string;
}) {
  const arr = Array.isArray(labels) ? labels.filter(Boolean) : [];
  if (arr.length === 0) return <span className="text-[var(--totk-grey-200)] text-xs italic">{emptyText}</span>;
  const baseClass = "map-square-tag inline-flex items-center rounded-full border px-2 py-0.5 text-xs shadow-sm";
  return (
    <div className="flex flex-wrap gap-1.5">
      {arr.map((s, i) => {
        const extra = getTagClass ? getTagClass(s) : "";
        return (
          <span
            key={i}
            className={`${baseClass} ${extra || "border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/70 text-[var(--botw-pale)]"}`}
          >
            {s}
          </span>
        );
      })}
    </div>
  );
}

function getTerrainClass(terrainName: string): string {
  const raw = String(terrainName ?? "").replace(/\p{Emoji}/gu, "").trim().toLowerCase();
  const n = raw.replace(/\s+/g, " ");
  if (n.includes("mountain") || n.includes("highland")) return "terrain-mountain";
  if (n.includes("snow") || n.includes("ice")) return "terrain-snow";
  if (n.includes("water") || n.includes("wetland")) return "terrain-water";
  if (n.includes("desert") || n.includes("arid")) return "terrain-desert";
  if (n.includes("volcanic")) return "terrain-volcanic";
  if (n.includes("forest") || n.includes("woodland")) return "terrain-forest";
  if (n.includes("grassland") || n.includes("plains")) return "terrain-grasslands";
  if (n.includes("coastal") || n.includes("sea")) return "terrain-coastal";
  return "terrain-default";
}

function getHazardClass(hazard: string): string {
  const n = String(hazard ?? "").toLowerCase();
  if (n.includes("cold")) return "quad-hazard-cold";
  if (n.includes("hot")) return "quad-hazard-hot";
  if (n.includes("thunder") || n.includes("electric")) return "quad-hazard-thunder";
  return "quad-hazard-default";
}

function getItemTypeClass(item: string): string {
  const n = String(item ?? "").toLowerCase();
  if (n.includes("fish")) return "quad-item-fish";
  if (n.includes("mushroom")) return "quad-item-mushroom";
  if (n.includes("plant")) return "quad-item-plant";
  if (n.includes("ore")) return "quad-item-ore";
  if (n.includes("natural")) return "quad-item-natural";
  if (n.includes("creature")) return "quad-item-creature";
  if (n.includes("fruit")) return "quad-item-fruit";
  return "quad-item-default";
}

function getMonsterClass(name: string): string {
  const n = String(name ?? "").toLowerCase();
  if (n.includes("chuchu")) return "quad-monster-chuchu";
  if (n.includes("lizalfos")) return "quad-monster-lizalfos";
  if (n.includes("octorok")) return "quad-monster-octorok";
  if (n.includes("talus") || n.includes("pebblit")) return "quad-monster-talus";
  if (n.includes("keese")) return "quad-monster-keese";
  if (n.includes("wizzrobe")) return "quad-monster-wizzrobe";
  if (n.includes("stal") || n.includes("stalkoblin")) return "quad-monster-stal";
  if (n.includes("hinox") || n.includes("moblin") || n.includes("bokoblin")) return "quad-monster-bokoblin";
  if (n.includes("lynel")) return "quad-monster-lynel";
  return "quad-monster-default";
}

function MetaRow({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="flex-shrink-0 w-5 text-center text-[var(--totk-dark-ocher)]" aria-hidden>
        <i className={`fas ${icon} text-xs`} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-[var(--totk-grey-200)]">{label}: </span>
        {children}
      </div>
    </div>
  );
}

type QuadrantBlockProps = {
  q: QuadrantDoc;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  /** When false, hide the "Old map #N → ..." line (e.g. on model list page). */
  showOldMapLine?: boolean;
};

function QuadrantBlock({ q, defaultOpen = false, isOpen: controlledOpen, onToggle, showOldMapLine = true }: QuadrantBlockProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onToggle ?? (() => setInternalOpen((o) => !o));
  const id = q.quadrantId ?? "?";
  const status = (q.status ?? "unexplored").toLowerCase();
  const isInaccessible = status === "inaccessible";
  const discoveryCount = Array.isArray(q.discoveries) ? q.discoveries.length : 0;
  const showBlight = q.blighted && status !== "unexplored";
  const statusClass =
    status === "secured"
      ? "quad-tag-secured"
      : status === "explored"
        ? "quad-tag-explored"
        : status === "inaccessible"
          ? "quad-tag-inaccessible"
          : "quad-tag-unexplored";

  const glowClass =
    status === "secured"
      ? "quad-glow-secured"
      : status === "explored"
        ? "quad-glow-explored"
        : status === "inaccessible"
          ? "quad-glow-inaccessible"
          : "quad-glow-unexplored";
  const wrapperClass = `map-square-quadrant rounded-xl overflow-hidden shadow-inner ${glowClass}${
    showBlight ? " quad-glow-blighted" : ""
  }`;

  if (isInaccessible) {
    return (
      <div className={wrapperClass}>
        <div className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl">
          <span className="font-bold text-[var(--totk-light-ocher)]">{id}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClass}`}>
            {status}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <button
        type="button"
        onClick={() => setOpen()}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--totk-dark-ocher)]/15 transition-colors rounded-xl"
      >
        <span className="font-bold text-[var(--totk-light-ocher)]">{id}</span>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusClass}`}>
            {status}
          </span>
          {showBlight && (
            <img src="/blight_eye.png" alt="Blighted" className="h-4 w-4 object-contain" title="Blighted" />
          )}
          {discoveryCount > 0 && (
            <span className="text-xs text-[var(--totk-grey-200)] flex items-center gap-1">
              <i className="fas fa-compass" aria-hidden />
              {discoveryCount}
            </span>
          )}
          <i className={`fas fa-chevron-${open ? "up" : "down"} text-[var(--totk-grey-200)] text-xs`} aria-hidden />
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-2 space-y-2.5 border-t border-[var(--totk-dark-ocher)]/30">
          {q.noCamp && (
            <p className="quad-nocamp text-xs flex items-center gap-1.5">
              <i className="fas fa-info-circle" aria-hidden /> No camp (path/village)
            </p>
          )}
          {(q.hazards?.length ?? 0) > 0 && (
            <MetaRow icon="fa-bolt" label="Hazards">
              <TagList labels={q.hazards} getTagClass={getHazardClass} />
            </MetaRow>
          )}
          {(q.terrain?.length ?? 0) > 0 && (
            <MetaRow icon="fa-mountain" label="Terrain">
              <TagList labels={q.terrain} getTagClass={getTerrainClass} />
            </MetaRow>
          )}
          {(q.items?.length ?? 0) > 0 && (
            <MetaRow icon="fa-cube" label="Items">
              <TagList labels={q.items} getTagClass={getItemTypeClass} />
            </MetaRow>
          )}
          {(q.monsters?.length ?? 0) > 0 && (
            <MetaRow icon="fa-dragon" label="Monsters">
              <TagList labels={q.monsters} getTagClass={getMonsterClass} />
            </MetaRow>
          )}
          {(q.bossMonsters?.length ?? 0) > 0 && (
            <MetaRow icon="fa-skull" label="Boss monsters">
              <TagList labels={q.bossMonsters} getTagClass={getMonsterClass} />
            </MetaRow>
          )}
          {(q.special?.length ?? 0) > 0 && (
            <MetaRow icon="fa-star" label="Special">
              <TagList labels={q.special} />
            </MetaRow>
          )}
          {discoveryCount > 0 && (
            <MetaRow icon="fa-compass" label="Discoveries">
              <div className="flex flex-wrap gap-1.5">
                {(Array.isArray(q.discoveries) ? q.discoveries : []).map((d, i) => {
                  const type = (d?.type ?? "").toString();
                  const number = (d?.number ?? "").toString();
                  const name = (d?.name ?? "").toString();
                  const typeLower = type.toLowerCase();
                  let label: string;
                  if (typeLower === "grotto" || typeLower.startsWith("grotto_")) {
                    label = name.trim() || "Grotto";
                  } else if (typeLower.startsWith("monster_camp")) {
                    label = "Monster camp";
                  } else if (typeLower === "ruin_rest") {
                    label = "Ruin rest spot";
                  } else if (number) {
                    label = `${type} #${number}`;
                  } else {
                    label = type || "Discovery";
                  }
                  return (
                    <span
                      key={i}
                      className="map-square-tag inline-flex items-center rounded-full border border-emerald-600/40 bg-emerald-950/40 px-2 py-0.5 text-xs text-[var(--totk-light-ocher)] shadow-sm"
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            </MetaRow>
          )}
          {showOldMapLine && (q.oldMapNumber != null || q.oldMapLeadsTo) && (
            <p className="text-xs text-[var(--totk-grey-200)] flex items-center gap-1.5">
              <i className="fas fa-map" aria-hidden /> Old map #{q.oldMapNumber ?? "?"} → {q.oldMapLeadsTo ?? "—"}
            </p>
          )}
          {q.ruinRestStamina != null && q.ruinRestStamina > 0 && (
            <p className="text-xs text-[var(--totk-light-green)] flex items-center gap-1.5">
              <i className="fas fa-campground" aria-hidden /> Ruin rest: +{q.ruinRestStamina} stamina
            </p>
          )}
          {q.exploredBy && (
            <p className="text-xs text-[var(--totk-grey-200)]">
              Explored by {q.exploredBy}
              {q.exploredAt ? ` · ${formatDate(q.exploredAt)}` : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function MapSquareCard({ square, showOldMapLine = true }: { square: MapSquare; showOldMapLine?: boolean }) {
  const quadrants = Array.isArray(square.quadrants) ? square.quadrants : [];
  const firstExpandableIndex = quadrants.findIndex(
    (q) => (q.status ?? "").toLowerCase() !== "inaccessible"
  );
  const [openQuadrantIndex, setOpenQuadrantIndex] = useState<number | null>(null);
  const [squarePreview, setSquarePreview] = useState<SquarePreview | null>(null);
  const imageUrl = square.pathImageUrl || square.image;
  const status = (square.status ?? "explorable").toLowerCase();
  const explorableQuadrants = quadrants.filter(
    (q) => (q.status ?? "").toLowerCase() !== "inaccessible"
  );
  const totalQuads = explorableQuadrants.length;
  const exploredCount = explorableQuadrants.filter(
    (q) => (q.status ?? "").toLowerCase() === "explored" || (q.status ?? "").toLowerCase() === "secured"
  ).length;

  useEffect(() => {
    // Load square preview (includes fog layer and quadrant statuses) so the thumbnail matches the main map/explore pages
    let cancelled = false;
    const base =
      (typeof window !== "undefined" && (window as any).__NEXT_DATA__ && (window as any).__NEXT_DATA__.basePath) || "";
    const apiBase = typeof base === "string" ? base.replace(/\/$/, "") : "";
    const url = `${apiBase}/api/explore/square-preview?square=${encodeURIComponent(square.squareId)}`;
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.layers)) {
          setSquarePreview({
            layers: data.layers as SquarePreviewLayer[],
            quadrantStatuses: data.quadrantStatuses as Record<string, string> | undefined,
          });
        }
      })
      .catch(() => {
        // ignore preview failures; fallback to plain image
      });
    return () => {
      cancelled = true;
    };
  }, [square.squareId]);

  return (
    <article className="map-square-card rounded-xl border-2 border-[var(--totk-light-ocher)] bg-[var(--glass-bg)] shadow-lg overflow-hidden flex flex-col min-h-0 transition-shadow duration-200 hover:shadow-xl hover:border-[var(--totk-light-ocher)]/90 w-full">
      {/* Header */}
      <header className="flex items-start gap-3 p-4 border-b-2 border-[var(--totk-dark-ocher)]/30 bg-gradient-to-br from-[var(--totk-dark-ocher)]/10 to-transparent">
        {imageUrl && (
          <div
            className="relative flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border-2 border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)] shadow-md"
            aria-label="Map square preview"
          >
            {/* When preview data is available, layer base/blight/paths and actual fog tiles just like explore party page.
                Fallback to the stored imageUrl if preview is missing or fails. */}
            {squarePreview && squarePreview.layers.length > 0 ? (
              <>
                {squarePreview.layers
                  .filter(
                    (layer) =>
                      layer.name !== "MAP_0001_hidden-areas" &&
                      !(
                        layer.name.startsWith("MAP_0002s_") &&
                        layer.name.includes("CIRCLE-")
                      )
                  )
                  .map((layer) => (
                    <img
                      key={layer.name}
                      src={layer.url}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ))}
                {(() => {
                  const fogLayer = squarePreview.layers.find((l) => l.name === "MAP_0001_hidden-areas");
                  if (!fogLayer) return null;
                  const statuses = squarePreview.quadrantStatuses ?? {};
                  const fogQuadrants: number[] = [];
                  (["Q1", "Q2", "Q3", "Q4"] as const).forEach((qId, i) => {
                    const s = (statuses[qId] ?? "unexplored").toLowerCase();
                    if (s !== "explored" && s !== "secured") fogQuadrants.push(i + 1);
                  });
                  if (fogQuadrants.length === 0) return null;
                  return (
                    <div className="pointer-events-none absolute inset-0" aria-hidden>
                      {fogQuadrants.map((q) => {
                        const pos = FOG_QUADRANT_LAYOUT[q];
                        if (!pos) return null;
                        return (
                          <div
                            key={q}
                            className="absolute bg-cover bg-no-repeat"
                            style={{
                              left: pos.left,
                              top: pos.top,
                              width: pos.width,
                              height: pos.height,
                              backgroundImage: `url(${fogLayer.url})`,
                              backgroundSize: "200% 200%",
                              backgroundPosition: pos.bgPos,
                            }}
                          />
                        );
                      })}
                    </div>
                  );
                })()}
              </>
            ) : (
              <img
                src={imageUrl}
                alt=""
                className="w-full h-full object-cover pointer-events-none"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-bold text-[var(--totk-light-ocher)] truncate tracking-tight">
            Square {square.squareId}
          </h3>
          <p className="text-sm text-[var(--botw-pale)] mt-1 font-medium">{square.region}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                status === "inaccessible"
                  ? "bg-gray-600 text-white"
                  : "bg-[var(--totk-light-green)]/25 text-[var(--totk-light-green)] border border-[var(--totk-light-green)]/40"
              }`}
            >
              {status}
            </span>
            {totalQuads > 0 && (
              <span className="text-xs text-[var(--totk-grey-200)] flex items-center gap-1">
                <i className="fas fa-check-circle text-[var(--totk-light-green)]/80" aria-hidden />
                {exploredCount}/{totalQuads} explored
              </span>
            )}
          </div>
          {totalQuads > 0 && (
            <div className="mt-2 h-1.5 w-full max-w-[140px] rounded-full bg-[var(--totk-dark-ocher)]/30 overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--totk-light-green)]/80 transition-all duration-300"
                style={{ width: `${totalQuads ? (exploredCount / totalQuads) * 100 : 0}%` }}
              />
            </div>
          )}
        </div>
      </header>

      {/* Quadrants */}
      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <h4 className="text-sm font-semibold text-[var(--totk-light-ocher)] flex items-center gap-2 pb-1 border-b border-[var(--totk-dark-ocher)]/20">
          <i className="fas fa-th-large" aria-hidden />
          Quadrants
        </h4>
        {quadrants.length === 0 ? (
          <p className="text-sm text-[var(--totk-grey-200)] italic py-2">No quadrant data.</p>
        ) : (
          <div className="space-y-2.5">
            {quadrants.map((q, i) => {
              const isExpandable = (q.status ?? "").toLowerCase() !== "inaccessible";
              return (
                <QuadrantBlock
                  key={q.quadrantId ?? i}
                  q={q}
                  defaultOpen={false}
                  isOpen={isExpandable ? openQuadrantIndex === i : undefined}
                  onToggle={isExpandable ? () => setOpenQuadrantIndex((prev) => (prev === i ? null : i)) : undefined}
                  showOldMapLine={showOldMapLine}
                />
              );
            })}
          </div>
        )}
      </div>
    </article>
  );
}
