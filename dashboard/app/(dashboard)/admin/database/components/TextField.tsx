"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helpText: string;
  isChanged?: boolean;
  error?: string;
  required?: boolean;
  placeholder?: string;
  /** When > 1, render a textarea with this many rows instead of a single-line input */
  rows?: number;
  /** Single-line input only: themed suggestion list (custom panel, not native datalist) */
  suggestions?: string[];
};

export function TextField({
  label,
  value,
  onChange,
  helpText,
  isChanged,
  error,
  required,
  placeholder,
  rows,
  suggestions,
}: TextFieldProps) {
  const listId = useId();
  const [panelOpen, setPanelOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const useSuggestionPanel = (suggestions?.length ?? 0) > 0 && !(rows != null && rows > 1);

  /** Preserve catalog order (same as character data) when filtering */
  const filteredSuggestions = useMemo(() => {
    if (!suggestions?.length) return [];
    const q = value.trim().toLowerCase();
    if (!q) return [...suggestions];
    return suggestions.filter((s) => s.toLowerCase().includes(q));
  }, [suggestions, value]);

  useEffect(() => {
    if (!useSuggestionPanel || !panelOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
        setHighlightIndex(0);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [useSuggestionPanel, panelOpen]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [value, filteredSuggestions.length]);

  useEffect(() => {
    if (!panelOpen || !listRef.current) return;
    const row = listRef.current.querySelector<HTMLElement>(`[data-index="${highlightIndex}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, panelOpen]);

  const pickSuggestion = useCallback(
    (s: string) => {
      onChange(s);
      setPanelOpen(false);
      setHighlightIndex(0);
    },
    [onChange]
  );

  const borderError = Boolean(error);
  const comboboxFocusedStyle = panelOpen
    ? borderError
      ? "border-red-500 shadow-[0_0_0_1px_rgba(239,68,68,0.35)]"
      : "border-[var(--totk-light-green)] shadow-[0_0_0_1px_rgba(73,213,156,0.35)]"
    : isChanged
      ? "border-[var(--totk-light-green)]"
      : borderError
        ? "border-red-500"
        : "border-[var(--totk-dark-ocher)]";

  const inputClassPlain = `w-full rounded-md border-2 ${
    isChanged ? "border-[var(--totk-light-green)]" : borderError ? "border-red-500" : "border-[var(--totk-dark-ocher)]"
  } bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/40 min-h-[2.5rem]`;

  const showPanel = useSuggestionPanel && panelOpen;
  const hasResults = filteredSuggestions.length > 0;
  const showEmptyHint =
    showPanel && !hasResults && (suggestions?.length ?? 0) > 0 && value.trim().length > 0;

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-[var(--totk-light-ocher)] mb-1">
        {label}
        {required && <span className="text-[#ff6347] ml-1">*</span>}
        {isChanged && (
          <span className="ml-2 text-xs text-[var(--totk-light-green)]">
            <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
            Changed
          </span>
        )}
      </label>
      {helpText && <p className="text-xs text-[var(--totk-grey-200)] mb-2">{helpText}</p>}
      {rows != null && rows > 1 ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={`${inputClassPlain} resize-y min-h-[6rem]`}
        />
      ) : useSuggestionPanel ? (
        <div className="relative" ref={containerRef}>
          <div
            className={`flex min-h-[2.5rem] items-stretch overflow-hidden rounded-lg border-2 bg-[var(--botw-warm-black)] transition-[border-color,box-shadow] duration-150 ${comboboxFocusedStyle}`}
          >
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-200)] focus:outline-none focus:ring-0"
              autoComplete="off"
              aria-expanded={showPanel}
              aria-autocomplete="list"
              aria-controls={showPanel ? listId : undefined}
              onFocus={() => setPanelOpen(true)}
              onKeyDown={(e) => {
                if (!panelOpen && (e.key === "ArrowDown" || e.key === "ArrowUp") && filteredSuggestions.length > 0) {
                  e.preventDefault();
                  setPanelOpen(true);
                  setHighlightIndex(e.key === "ArrowUp" ? filteredSuggestions.length - 1 : 0);
                  return;
                }
                if (!showPanel || !hasResults) {
                  if (e.key === "Escape" && panelOpen) {
                    e.preventDefault();
                    setPanelOpen(false);
                  }
                  return;
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHighlightIndex((i) => Math.min(i + 1, filteredSuggestions.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHighlightIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter") {
                  const pick = filteredSuggestions[highlightIndex];
                  if (pick) {
                    e.preventDefault();
                    pickSuggestion(pick);
                  }
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setPanelOpen(false);
                }
              }}
            />
            <div className="flex w-11 shrink-0 flex-col justify-stretch border-l border-[var(--totk-dark-ocher)]/70 bg-[var(--botw-black)]/35">
              <button
                type="button"
                tabIndex={-1}
                aria-label={panelOpen ? "Close suggestions" : "Open suggestions"}
                className="flex flex-1 items-center justify-center text-[var(--totk-grey-200)] transition-colors hover:bg-[var(--totk-dark-ocher)]/45 hover:text-[var(--totk-light-green)]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setPanelOpen((o) => !o);
                  if (!panelOpen) setHighlightIndex(0);
                }}
              >
                <i
                  className={`fa-solid fa-chevron-${panelOpen ? "up" : "down"} text-[10px]`}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          {showPanel && (
            <div
              id={listId}
              ref={listRef}
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] shadow-[0_12px_40px_rgba(0,0,0,0.55)] ring-1 ring-[var(--totk-light-green)]/20"
            >
              <div className="flex items-center justify-between gap-2 border-b border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 px-3 py-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--totk-light-ocher)]">
                  Suggested values
                </span>
                <span className="rounded-md bg-[var(--totk-dark-ocher)]/50 px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--totk-grey-200)]">
                  {hasResults ? filteredSuggestions.length : 0}
                  {(suggestions?.length ?? 0) > 0 ? ` / ${suggestions!.length}` : ""}
                </span>
              </div>

              {showEmptyHint ? (
                <div className="px-4 py-5 text-center text-sm leading-relaxed text-[var(--totk-grey-200)]">
                  <p className="mb-1 text-[var(--botw-pale)]">No matching suggestions</p>
                  <p className="text-xs">
                    Clear the field or fix the spelling to see all{" "}
                    <span className="text-[var(--totk-light-green)]">{suggestions!.length}</span> canon
                    jobs — you can still save a custom value.
                  </p>
                </div>
              ) : hasResults ? (
                <div className="max-h-[min(16rem,50vh)] overflow-y-auto py-1 [scrollbar-width:thin] [scrollbar-color:var(--totk-dark-ocher)_var(--botw-black)]">
                  {filteredSuggestions.map((s, i) => {
                    const active = i === highlightIndex;
                    const selected = value === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        data-index={i}
                        className={`relative flex w-full items-center gap-2 border-l-[3px] py-2.5 pl-[calc(0.75rem-3px)] pr-3 text-left text-sm transition-colors ${
                          active
                            ? "border-l-[var(--totk-light-green)] bg-[var(--totk-light-green)]/15 text-[var(--botw-pale)]"
                            : selected
                              ? "border-l-transparent bg-[var(--totk-light-green)]/8 text-[var(--botw-pale)]"
                              : "border-l-transparent text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/40"
                        }`}
                        onMouseEnter={() => setHighlightIndex(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pickSuggestion(s)}
                      >
                        <span className="min-w-0 flex-1 truncate">{s}</span>
                        {selected && (
                          <i
                            className="fa-solid fa-check text-xs text-[var(--totk-light-green)] shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClassPlain}
        />
      )}
      {error && <p className="mt-1 text-xs text-[#ff6347]">{error}</p>}
    </div>
  );
}
