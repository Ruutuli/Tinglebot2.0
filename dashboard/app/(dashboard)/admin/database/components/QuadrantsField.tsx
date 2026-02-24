"use client";

import { useState, useMemo } from "react";

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
  { value: "shrine", label: "Shrine" },
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
    discoveries: [],
    exploredBy: "",
    exploredAt: null,
    oldMapNumber: null,
    oldMapLeadsTo: null,
    ruinRestStamina: null,
  });
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
