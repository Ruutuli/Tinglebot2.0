"use client";

import { useState, useMemo } from "react";
import {
  TERRAIN_OPTIONS,
  HAZARDS_OPTIONS,
  ITEMS_OPTIONS,
  MONSTERS_OPTIONS,
  BOSS_MONSTERS_OPTIONS,
  SPECIAL_OPTIONS,
} from "./quadrant-options";

const QUADRANT_IDS = ["Q1", "Q2", "Q3", "Q4"] as const;
const STATUS_OPTIONS = [
  { value: "inaccessible", label: "Inaccessible" },
  { value: "unexplored", label: "Unexplored" },
  { value: "explored", label: "Explored" },
  { value: "secured", label: "Secured" },
];
const OLD_MAP_LEADS_TO_OPTIONS = [
  { value: "", label: "(none)" },
  { value: "chest", label: "Chest" },
  { value: "ruins", label: "Ruins" },
  { value: "relic", label: "Relic" },
  { value: "grotto", label: "Grotto" },
  { value: "shrine", label: "shrine (legacy—change to Grotto)" },
];

type Discovery = {
  type?: string;
  number?: string;
  name?: string;
  discoveredBy?: string;
  discoveredAt?: string | Date;
  discoveryKey?: string | null;
  pinned?: boolean;
  pinnedAt?: string | Date | null;
  pinId?: string | null;
  grottoStatus?: string | null;
};

export type Quadrant = {
  quadrantId: string;
  status?: string;
  blighted?: boolean;
  noCamp?: boolean;
  hazards?: string[];
  terrain?: string[];
  items?: string[];
  monsters?: string[];
  bossMonsters?: string[];
  special?: string[];
  discoveries?: Discovery[];
  exploredBy?: string;
  exploredAt?: string | Date | null;
  oldMapNumber?: number | null;
  oldMapLeadsTo?: string | null;
  ruinRestStamina?: number | null;
};

type QuadrantsFieldProps = {
  label: string;
  value: Quadrant[];
  onChange: (value: Quadrant[]) => void;
  helpText?: string;
  isChanged?: boolean;
  error?: string;
};

function normalizeQuadrants(value: unknown): Quadrant[] {
  const raw = Array.isArray(value) ? value : [];
  const byId = new Map<string | number, Quadrant>();
  raw.forEach((q, i) => {
    const id = (q && typeof q === "object" && (q as Quadrant).quadrantId) || `Q${i + 1}`;
    byId.set(id, {
      quadrantId: String(id),
      status: (q as Quadrant).status ?? "unexplored",
      blighted: (q as Quadrant).blighted ?? false,
      noCamp: (q as Quadrant).noCamp ?? false,
      hazards: arrayOrEmpty((q as Quadrant).hazards),
      terrain: arrayOrEmpty((q as Quadrant).terrain),
      items: arrayOrEmpty((q as Quadrant).items),
      monsters: arrayOrEmpty((q as Quadrant).monsters),
      bossMonsters: arrayOrEmpty((q as Quadrant).bossMonsters),
      special: arrayOrEmpty((q as Quadrant).special),
      discoveries: Array.isArray((q as Quadrant).discoveries) ? (q as Quadrant).discoveries : [],
      exploredBy: (q as Quadrant).exploredBy ?? "",
      exploredAt: (q as Quadrant).exploredAt ?? null,
      oldMapNumber: (q as Quadrant).oldMapNumber ?? null,
      oldMapLeadsTo: (q as Quadrant).oldMapLeadsTo ?? null,
      ruinRestStamina: (q as Quadrant).ruinRestStamina ?? null,
    });
  });
  return QUADRANT_IDS.map((id) => byId.get(id) ?? {
    quadrantId: id,
    status: "unexplored",
    blighted: false,
    noCamp: false,
    hazards: [],
    terrain: [],
    items: [],
    monsters: [],
    bossMonsters: [],
    special: [],
    discoveries: [],
    exploredBy: "",
    exploredAt: null,
    oldMapNumber: null,
    oldMapLeadsTo: null,
    ruinRestStamina: null,
  });
}

function arrayOrEmpty(arr: unknown): string[] {
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
}

/** Multi-select with visible tags and clear "Add from list" flow. */
function MultiSelectPicker({
  label,
  options,
  value,
  onChange,
  maxHeight = "8rem",
  defaultExpanded = false,
}: {
  label: string;
  options: readonly string[];
  value: string[];
  onChange: (selected: string[]) => void;
  maxHeight?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [filter, setFilter] = useState("");
  const selectedList = value;
  const selectedSet = new Set(value);
  const filtered = useMemo(() => {
    if (!filter.trim()) return [...options];
    const q = filter.trim().toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, filter]);
  const toggle = (opt: string) => {
    const next = new Set(selectedSet);
    if (next.has(opt)) next.delete(opt);
    else next.add(opt);
    onChange([...next]);
  };
  const remove = (opt: string) => {
    onChange(selectedList.filter((x) => x !== opt));
  };

  return (
    <div>
      <span className="text-[var(--totk-grey-200)] text-xs block mb-1">{label}</span>
      {/* Same box style as Locations: bordered container with tags */}
      <div className="w-full rounded-md border-2 min-h-[44px] flex items-center px-3 py-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50">
        {selectedList.length > 0 ? (
          <div className="flex flex-wrap gap-2 w-full items-center">
            {selectedList.map((opt) => (
              <span
                key={opt}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/40 text-xs text-[var(--botw-pale)]"
              >
                <span className="max-w-[140px] truncate">{opt}</span>
                <button
                  type="button"
                  onClick={() => remove(opt)}
                  className="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-[var(--totk-dark-ocher)]/60 text-[var(--totk-grey-200)] hover:text-[var(--botw-pale)]"
                  aria-label={`Remove ${opt}`}
                >
                  <i className="fa-solid fa-times text-[10px]" aria-hidden />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-[var(--totk-light-ocher)] hover:underline flex items-center gap-1"
            >
              <i className="fa-solid fa-plus" aria-hidden />
              {expanded ? "Close list" : "Add from list"}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 w-full items-center">
            <span className="text-xs italic text-[var(--totk-grey-200)]">No items</span>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="text-xs text-[var(--totk-light-ocher)] hover:underline flex items-center gap-1"
            >
              <i className="fa-solid fa-plus" aria-hidden />
              Add from list
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <div className="mt-2 rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 px-3 py-3">
          <p className="text-xs text-[var(--totk-grey-200)] mb-2">Select all that apply:</p>
          {options.length > 5 && (
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search list…"
              className="w-full mb-2 px-2 py-1 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] text-[var(--botw-pale)] text-xs placeholder:text-[var(--totk-grey-200)]"
              autoFocus
            />
          )}
          <div
            className="overflow-y-auto flex flex-col gap-0 rounded border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-black)]/60 mb-2"
            style={{ maxHeight }}
          >
            {filtered.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2.5 cursor-pointer px-2 py-1.5 text-sm text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/15 border-b border-[var(--totk-dark-ocher)]/30 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedSet.has(opt)}
                  onChange={() => toggle(opt)}
                  className="rounded border-[var(--totk-dark-ocher)] shrink-0"
                />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="text-xs text-[var(--totk-grey-200)] py-1 mb-2">No matches. Try a different search.</p>
          )}
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="w-full py-1.5 rounded text-xs font-medium bg-[var(--totk-dark-ocher)]/40 text-[var(--totk-light-ocher)] hover:bg-[var(--totk-dark-ocher)]/60 transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function formatDate(v: string | Date | null | undefined): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 16);
  const s = String(v);
  if (s.slice(0, 4) === "20" && s.length >= 10) return s.slice(0, 16);
  return s;
}

export function QuadrantsField({
  label,
  value,
  onChange,
  helpText,
  isChanged,
  error,
}: QuadrantsFieldProps) {
  const quadrants = useMemo(() => normalizeQuadrants(value), [value]);
  const [expandedDiscoveries, setExpandedDiscoveries] = useState<Set<string>>(new Set());
  const [discoveriesDraft, setDiscoveriesDraft] = useState<Record<string, string>>({});

  const updateQuadrant = (index: number, updates: Partial<Quadrant>) => {
    const next = quadrants.map((q, i) => (i === index ? { ...q, ...updates } : q));
    onChange(next);
  };

  const toggleDiscoveries = (qId: string) => {
    setExpandedDiscoveries((prev) => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-[var(--totk-light-ocher)]">
          {label}
          {helpText && (
            <span className="ml-2 text-xs text-[var(--totk-grey-200)] font-normal">
              <i className="fa-solid fa-circle-info mr-1" aria-hidden="true" />
              {helpText}
            </span>
          )}
          {isChanged && (
            <span className="ml-2 text-xs text-[var(--totk-light-green)]">
              <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
              Changed
            </span>
          )}
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quadrants.map((q, index) => (
          <div
            key={q.quadrantId}
            className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/60 p-4 space-y-3"
          >
            <div className="flex items-center gap-2 border-b border-[var(--totk-dark-ocher)]/50 pb-2 mb-2">
              <span className="font-semibold text-[var(--totk-light-ocher)]">{q.quadrantId}</span>
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm">
              <div>
                <span className="text-[var(--totk-grey-200)] text-xs">Status</span>
                <select
                  value={q.status ?? "unexplored"}
                  onChange={(e) => updateQuadrant(index, { status: e.target.value })}
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] text-[var(--botw-pale)]"
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={q.blighted ?? false}
                  onChange={(e) => updateQuadrant(index, { blighted: e.target.checked })}
                  className="rounded border-[var(--totk-dark-ocher)]"
                />
                <span className="text-xs text-[var(--totk-grey-200)]">Blighted</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={q.noCamp ?? false}
                  onChange={(e) => updateQuadrant(index, { noCamp: e.target.checked })}
                  className="rounded border-[var(--totk-dark-ocher)]"
                />
                <span className="text-xs text-[var(--totk-grey-200)]">No camp (pass-through only)</span>
              </label>
              <MultiSelectPicker
                label="Hazards"
                options={[...HAZARDS_OPTIONS]}
                value={(q.hazards ?? []).filter((h) => (HAZARDS_OPTIONS as readonly string[]).includes(h))}
                onChange={(selected) => updateQuadrant(index, { hazards: selected })}
                maxHeight="5rem"
                defaultExpanded
              />
              <MultiSelectPicker
                label="Terrain"
                options={[...TERRAIN_OPTIONS]}
                value={(q.terrain ?? []).filter((t) => (TERRAIN_OPTIONS as readonly string[]).includes(t))}
                onChange={(selected) => updateQuadrant(index, { terrain: selected })}
                maxHeight="6rem"
              />
              <MultiSelectPicker
                label="Items (gather labels)"
                options={[...ITEMS_OPTIONS]}
                value={(q.items ?? []).filter((i) => (ITEMS_OPTIONS as readonly string[]).includes(i))}
                onChange={(selected) => updateQuadrant(index, { items: selected })}
                maxHeight="6rem"
              />
              <MultiSelectPicker
                label="Monsters (match monster DB)"
                options={[...MONSTERS_OPTIONS]}
                value={(q.monsters ?? []).filter((m) => (MONSTERS_OPTIONS as readonly string[]).includes(m))}
                onChange={(selected) => updateQuadrant(index, { monsters: selected })}
                maxHeight="10rem"
              />
              <MultiSelectPicker
                label="Boss monsters"
                options={[...BOSS_MONSTERS_OPTIONS]}
                value={(q.bossMonsters ?? []).filter((b) => (BOSS_MONSTERS_OPTIONS as readonly string[]).includes(b))}
                onChange={(selected) => updateQuadrant(index, { bossMonsters: selected })}
                maxHeight="4rem"
                defaultExpanded
              />
              <MultiSelectPicker
                label="Special (notes/flags)"
                options={[...SPECIAL_OPTIONS]}
                value={(q.special ?? []).filter((s) => (SPECIAL_OPTIONS as readonly string[]).includes(s))}
                onChange={(selected) => updateQuadrant(index, { special: selected })}
                maxHeight="4rem"
                defaultExpanded
              />
              <div>
                <span className="text-[var(--totk-grey-200)] text-xs">Explored by (Discord ID)</span>
                <input
                  type="text"
                  value={q.exploredBy ?? ""}
                  onChange={(e) => updateQuadrant(index, { exploredBy: e.target.value })}
                  placeholder="Discord ID"
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] text-[var(--botw-pale)]"
                />
              </div>
              <div>
                <span className="text-[var(--totk-grey-200)] text-xs">Explored at</span>
                <input
                  type="datetime-local"
                  value={formatDate(q.exploredAt)}
                  onChange={(e) => updateQuadrant(index, { exploredAt: e.target.value ? new Date(e.target.value) : null })}
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] text-[var(--botw-pale)]"
                />
              </div>
              <div>
                <span className="text-[var(--totk-grey-200)] text-xs">Old map number</span>
                <input
                  type="number"
                  value={q.oldMapNumber ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateQuadrant(index, { oldMapNumber: v === "" ? null : Number(v) });
                  }}
                  placeholder="—"
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] text-[var(--botw-pale)]"
                />
              </div>
              <div>
                <span className="text-[var(--totk-grey-200)] text-xs">Old map leads to</span>
                <select
                  value={q.oldMapLeadsTo ?? ""}
                  onChange={(e) => updateQuadrant(index, { oldMapLeadsTo: e.target.value || null })}
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] text-[var(--botw-pale)]"
                >
                  {OLD_MAP_LEADS_TO_OPTIONS.map((opt) => (
                    <option key={opt.value || "none"} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <span className="text-[var(--totk-grey-200)] text-xs">Ruin rest stamina</span>
                <input
                  type="number"
                  value={q.ruinRestStamina ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    updateQuadrant(index, { ruinRestStamina: v === "" ? null : Number(v) });
                  }}
                  placeholder="—"
                  min={0}
                  className="w-full mt-0.5 px-2 py-1.5 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] text-[var(--botw-pale)]"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--totk-dark-ocher)]/50">
              <button
                type="button"
                onClick={() => toggleDiscoveries(q.quadrantId)}
                className="text-xs text-[var(--totk-light-ocher)] hover:underline flex items-center gap-1"
              >
                <i className={`fa-solid fa-chevron-${expandedDiscoveries.has(q.quadrantId) ? "up" : "down"}`} aria-hidden="true" />
                Discoveries ({Array.isArray(q.discoveries) ? q.discoveries.length : 0})
              </button>
              {expandedDiscoveries.has(q.quadrantId) && (
                <div className="mt-2">
                  <textarea
                    value={discoveriesDraft[q.quadrantId] ?? JSON.stringify(q.discoveries ?? [], null, 2)}
                    onChange={(e) => setDiscoveriesDraft((prev) => ({ ...prev, [q.quadrantId]: e.target.value }))}
                    onBlur={() => {
                      const raw = discoveriesDraft[q.quadrantId];
                      if (raw === undefined) return;
                      try {
                        const parsed = JSON.parse(raw || "[]");
                        if (Array.isArray(parsed)) {
                          updateQuadrant(index, { discoveries: parsed });
                          setDiscoveriesDraft((prev) => {
                            const next = { ...prev };
                            delete next[q.quadrantId];
                            return next;
                          });
                        }
                      } catch {
                        // leave draft in place for user to fix
                      }
                    }}
                    rows={6}
                    className="w-full px-2 py-1.5 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] text-[var(--botw-pale)] font-mono text-xs"
                    placeholder="[]"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="mt-1 text-xs text-[#ff6347]">{error}</p>}
    </div>
  );
}
