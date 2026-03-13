"use client";

import { useState, useMemo } from "react";

export type OptionsMultiSelectProps = {
  label: string;
  helpText?: string;
  options: readonly string[];
  value: string[];
  onChange: (value: string[]) => void;
  isChanged?: boolean;
  maxHeight?: string;
  defaultExpanded?: boolean;
  /** When true, box matches Locations exactly: only tags or "No items"; "Add from list" is below the box */
  lookLikeLocations?: boolean;
};

/** Multi-select with visible tags. When lookLikeLocations, layout matches Locations read-only display. */
export function OptionsMultiSelect({
  label,
  helpText,
  options,
  value,
  onChange,
  isChanged = false,
  maxHeight = "8rem",
  defaultExpanded = false,
  lookLikeLocations = false,
}: OptionsMultiSelectProps) {
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
    <div className="mb-4">
      <label className="block text-sm font-medium text-[var(--totk-light-ocher)] mb-1">
        {label}
        {isChanged && (
          <span className="ml-2 text-xs text-[var(--totk-light-green)]">
            <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
            Changed
          </span>
        )}
      </label>
      {helpText && (
        <p className="text-xs text-[var(--totk-grey-200)] mb-2">{helpText}</p>
      )}
      {/* Box exactly like Locations: only tags or "No items" inside */}
      <div
        className={`w-full rounded-md border-2 min-h-[44px] flex items-center px-3 py-2 ${
          isChanged ? "border-[var(--totk-light-green)]" : "border-[var(--totk-dark-ocher)]"
        } bg-[var(--botw-warm-black)]/50`}
      >
        {selectedList.length > 0 ? (
          <div className="flex flex-wrap gap-2 w-full">
            {selectedList.map((opt) => (
              <span
                key={opt}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/40 text-xs text-[var(--botw-pale)]"
              >
                <span className="max-w-[200px] truncate">{opt}</span>
                {!lookLikeLocations ? (
                  <button
                    type="button"
                    onClick={() => remove(opt)}
                    className="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-[var(--totk-dark-ocher)]/60 text-[var(--totk-grey-200)] hover:text-[var(--botw-pale)]"
                    aria-label={`Remove ${opt}`}
                  >
                    <i className="fa-solid fa-times text-[10px]" aria-hidden />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => remove(opt)}
                    className="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-[var(--totk-dark-ocher)]/60 text-[var(--totk-grey-200)] hover:text-[var(--botw-pale)] opacity-70 hover:opacity-100"
                    aria-label={`Remove ${opt}`}
                  >
                    <i className="fa-solid fa-times text-[10px]" aria-hidden />
                  </button>
                )}
              </span>
            ))}
            {!lookLikeLocations && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="text-xs text-[var(--totk-light-ocher)] hover:underline flex items-center gap-1"
              >
                <i className="fa-solid fa-plus" aria-hidden />
                {expanded ? "Close list" : "Add from list"}
              </button>
            )}
          </div>
        ) : (
          <>
            {!lookLikeLocations ? (
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
            ) : (
              <span className="text-xs italic text-[var(--totk-grey-200)]">No items</span>
            )}
          </>
        )}
      </div>
      {lookLikeLocations && (
        <p className="mt-1 text-xs">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-[var(--totk-light-ocher)] hover:underline"
          >
            {expanded ? "Close list" : "Add from list"}
          </button>
        </p>
      )}

      {/* Expanded: search + checklist + Done (below the box, like a dropdown) */}
      {expanded && (
        <div className="mt-2 rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 px-3 py-3">
          <p className="text-xs text-[var(--totk-grey-200)] mb-2">Select all that apply:</p>
          {options.length > 5 && (
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search list…"
              className="w-full mb-2 px-2 py-1.5 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] text-[var(--botw-pale)] text-sm placeholder:text-[var(--totk-grey-200)]"
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
            className="w-full py-1.5 rounded text-sm font-medium bg-[var(--totk-dark-ocher)]/40 text-[var(--totk-light-ocher)] hover:bg-[var(--totk-dark-ocher)]/60 transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
