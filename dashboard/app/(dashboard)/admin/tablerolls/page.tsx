"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/hooks/use-session";
import { Loading, Modal } from "@/components/ui";

const NAME_REGEX = /^[a-zA-Z0-9\s\-_]+$/;

const VILLAGES = ["Rudania", "Inariko", "Vhintl"] as const;

function villagesFromRestrictions(
  rudania: boolean,
  inariko: boolean,
  vhintl: boolean
): string[] {
  const out: string[] = [];
  if (rudania) out.push("Rudania");
  if (inariko) out.push("Inariko");
  if (vhintl) out.push("Vhintl");
  return out;
}

function villagesToRestrictions(arr: string[] | undefined | null) {
  const set = new Set((arr ?? []).map((s) => s.trim().toLowerCase()).filter(Boolean));
  return {
    restrictRudania: set.has("rudania"),
    restrictInariko: set.has("inariko"),
    restrictVhintl: set.has("vhintl"),
  };
}

/** How many rolls per Discord day (shared pool for the whole table doc). */
function formatDailyLimitDisplay(maxPerDay?: number | null): string {
  const n =
    maxPerDay == null || typeof maxPerDay !== "number" || Number.isNaN(maxPerDay) ? 0 : Math.max(0, Math.floor(maxPerDay));
  if (n === 0) return "Unlimited";
  if (n === 1) return "1/day";
  return `${n}/day`;
}

function formatVillageLockDisplay(allowed?: string[] | null): string {
  const list =
    Array.isArray(allowed) && allowed.length > 0
      ? [...new Set(allowed.map((s) => String(s).trim()).filter(Boolean))]
      : [];
  if (list.length === 0) return "Any village";
  return list.join(", ");
}

/** Rows for flavor textareas (~72ch wrapping in the narrow table column). */
function flavorEditRowCount(text: string): number {
  let lines = Math.max(1, text.split("\n").length);
  for (const segment of text.split("\n")) {
    if (segment.length > 72) {
      lines += Math.ceil(segment.length / 72) - 1;
    }
  }
  return Math.min(14, Math.max(4, lines));
}

function ItemNameAutocomplete({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dropdownRect, setDropdownRect] = useState({ top: 0, left: 0, width: 0 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!value.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/models/items?search=${encodeURIComponent(value.trim())}&limit=15`)
        .then((r) => r.json())
        .then((data: { data?: Array<{ itemName?: string }> }) => {
          const names = (data.data ?? [])
            .map((i) => i.itemName)
            .filter((n): n is string => typeof n === "string" && n.length > 0);
          setSuggestions(names);
          setOpen(names.length > 0);
        })
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useLayoutEffect(() => {
    if (!open || suggestions.length === 0 || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownRect({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 192),
    });
  }, [open, suggestions.length]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showDropdown = open && suggestions.length > 0 && typeof document !== "undefined";

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => value.trim() && suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {showDropdown &&
        createPortal(
          <ul
            ref={dropdownRef}
            role="listbox"
            className="fixed z-[100] max-h-48 overflow-auto rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] py-1 shadow-lg"
            style={{
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              minWidth: "8rem",
            }}
          >
            {suggestions.map((name) => (
              <li
                key={name}
                role="option"
                className="cursor-pointer px-2 py-1.5 text-sm text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/40"
                onMouseDown={() => {
                  onChange(name);
                  setOpen(false);
                }}
              >
                {name}
              </li>
            ))}
          </ul>,
          document.body
        )}
      {loading && value.trim() && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--totk-grey-200)]">...</span>
      )}
    </div>
  );
}

type TableRollEntry = {
  weight: number;
  flavor: string;
  item: string;
  thumbnailImage: string;
};

type TableRollRecord = {
  _id: string;
  name: string;
  isActive: boolean;
  entries: TableRollEntry[];
  totalWeight?: number;
  maxRollsPerDay?: number;
  allowedVillages?: string[];
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

type FormEntry = { weight: string; flavor: string; item: string; thumbnailImage: string };

type FormState = {
  name: string;
  isActive: boolean;
  maxRollsPerDay: string;
  restrictRudania: boolean;
  restrictInariko: boolean;
  restrictVhintl: boolean;
  entries: FormEntry[];
};

const emptyEntry: FormEntry = { weight: "1", flavor: "", item: "", thumbnailImage: "" };

function defaultForm(): FormState {
  return {
    name: "",
    isActive: false,
    maxRollsPerDay: "0",
    restrictRudania: false,
    restrictInariko: false,
    restrictVhintl: false,
    entries: [{ ...emptyEntry }],
  };
}

function recordToForm(r: TableRollRecord): FormState {
  const vr = villagesToRestrictions(r.allowedVillages);
  return {
    name: r.name ?? "",
    isActive: r.isActive ?? true,
    maxRollsPerDay: String(r.maxRollsPerDay ?? 0),
    restrictRudania: vr.restrictRudania,
    restrictInariko: vr.restrictInariko,
    restrictVhintl: vr.restrictVhintl,
    entries:
      r.entries?.length > 0
        ? r.entries.map((e) => ({
            weight: String(Math.max(1, Math.round(Number(e.weight ?? 1)))),
            flavor: e.flavor ?? "",
            item: e.item ?? "",
            thumbnailImage: e.thumbnailImage ?? "",
          }))
        : [{ ...emptyEntry }],
  };
}

function formToBody(form: FormState): {
  name: string;
  isActive: boolean;
  maxRollsPerDay: number;
  entries: TableRollEntry[];
  allowedVillages: string[];
} {
  const entries = form.entries
    .map((e) => {
      const w = parseInt(e.weight, 10);
      const whole = Number.isFinite(w) && w >= 1 ? w : 1;
      return {
        weight: whole,
        flavor: e.flavor.trim(),
        item: e.item.trim(),
        thumbnailImage: e.thumbnailImage.trim(),
      };
    })
    .filter((e) => e.weight > 0);
  return {
    name: form.name.trim(),
    isActive: form.isActive,
    maxRollsPerDay: Math.max(0, parseInt(form.maxRollsPerDay, 10) || 0),
    entries: entries.length ? entries : [{ weight: 1, flavor: "", item: "", thumbnailImage: "" }],
    allowedVillages: villagesFromRestrictions(form.restrictRudania, form.restrictInariko, form.restrictVhintl),
  };
}

function formatDate(s: string | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return s;
  }
}

function entryMatchesFilter(entry: FormEntry, filter: string): boolean {
  if (!filter.trim()) return true;
  const q = filter.trim().toLowerCase();
  return (
    entry.flavor.toLowerCase().includes(q) ||
    entry.item.toLowerCase().includes(q) ||
    entry.thumbnailImage.toLowerCase().includes(q)
  );
}

/** Parse a single CSV line with quote handling (double-quote for commas inside values). */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

/**
 * Parse CSV text into FormEntry[].
 * Format: first line = header (skipped). Columns: weight, flavor, item, thumbnail URL.
 * Matches bot tableRollUtils parseCSVData (columns 0–3).
 */
function parseCSVToEntries(csvText: string): { success: true; entries: FormEntry[] } | { success: false; error: string } {
  try {
    const lines = csvText.split(/\r?\n/);
    const entries: FormEntry[] = [];
    const errors: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = parseCSVLine(line);
      if (values.length >= 3) {
        const weight = parseInt(values[0], 10);
        const numWeight = Number.isFinite(weight) && weight >= 1 ? weight : 1;
        entries.push({
          weight: String(numWeight),
          flavor: (values[1] ?? "").trim(),
          item: (values[2] ?? "").trim(),
          thumbnailImage: (values[3] ?? "").trim(),
        });
      } else {
        errors.push(`Row ${i + 1}: need at least 3 columns (weight, flavor, item)`);
      }
    }
    if (errors.length > 0) {
      return { success: false, error: errors.join("\n") };
    }
    if (entries.length === 0) {
      return { success: false, error: "No data rows found. Add a header line, then rows with: weight, flavor, item, thumbnail URL." };
    }
    return { success: true, entries };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export default function AdminTablerollsPage() {
  const { isAdmin, loading: sessionLoading } = useSession();
  const [list, setList] = useState<TableRollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [entryFilter, setEntryFilter] = useState("");
  const [csvImportText, setCsvImportText] = useState("");
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [listViewMode, setListViewMode] = useState<"table" | "cards">("table");
  /** Admin list filter: drafts do not appear in Discord /tableroll or public pickers regardless. */
  const [publishedListFilter, setPublishedListFilter] = useState<"all" | "published" | "draft">("all");
  const [nameValidationMessage, setNameValidationMessage] = useState<string | null>(null);
  const initialFormRef = useRef<string>("");

  const filteredList = useMemo(() => {
    if (publishedListFilter === "published") return list.filter((r) => r.isActive);
    if (publishedListFilter === "draft") return list.filter((r) => !r.isActive);
    return list;
  }, [list, publishedListFilter]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tablerolls");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? "Failed to load table rolls");
      }
      const data = (await res.json()) as TableRollRecord[];
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin && !sessionLoading) fetchList();
  }, [isAdmin, sessionLoading, fetchList]);

  const openCreate = useCallback(() => {
    setForm(defaultForm());
    setEditingId(null);
    setShowForm(true);
    setError(null);
    setSuccess(null);
  }, []);

  const openEdit = useCallback(
    async (id: string) => {
      if (showForm && JSON.stringify(form) !== initialFormRef.current && !window.confirm("You have unsaved changes. Leave anyway?")) return;
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch(`/api/admin/tablerolls/${id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { message?: string }).message ?? "Failed to load table roll");
        }
        const doc = (await res.json()) as TableRollRecord;
        const nextForm = recordToForm(doc);
        setForm(nextForm);
        setEditingId(id);
        setShowForm(true);
        setNameValidationMessage(null);
        initialFormRef.current = JSON.stringify(nextForm);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [showForm, form]
  );

  const applyCsvImport = useCallback((append: boolean) => {
    const result = parseCSVToEntries(csvImportText);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError(null);
    setSuccess(append ? `Appended ${result.entries.length} entries.` : `Replaced with ${result.entries.length} entries from CSV.`);
    setForm((prev) => ({
      ...prev,
      entries: append ? [...prev.entries, ...result.entries] : result.entries,
    }));
    setCsvImportText("");
    setShowCsvImport(false);
  }, [csvImportText]);

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setEntry = useCallback((index: number, field: keyof FormEntry, value: string) => {
    setForm((prev) => {
      const next = [...prev.entries];
      if (index < 0 || index >= next.length) return prev;
      next[index] = { ...next[index], [field]: value };
      return { ...prev, entries: next };
    });
  }, []);

  const addEntry = useCallback(() => {
    setForm((prev) => ({ ...prev, entries: [...prev.entries, { ...emptyEntry }] }));
  }, []);

  const addFiveEntries = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      entries: [...prev.entries, ...Array(5).fill(null).map(() => ({ ...emptyEntry }))],
    }));
  }, []);

  const removeEntry = useCallback((index: number) => {
    setForm((prev) => {
      const next = prev.entries.filter((_, i) => i !== index);
      return { ...prev, entries: next.length ? next : [{ ...emptyEntry }] };
    });
  }, []);

  const doCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setForm(defaultForm());
    setError(null);
    setEntryFilter("");
    setCsvImportText("");
    setShowCsvImport(false);
    setNameValidationMessage(null);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = form.name.trim();
      if (!name) {
        setError("Name is required.");
        return;
      }
      if (!NAME_REGEX.test(name)) {
        setError("Name can only contain letters, numbers, spaces, hyphens, and underscores.");
        return;
      }
      const entries = form.entries.filter((e) => parseInt(e.weight, 10) >= 1);
      if (entries.length === 0) {
        setError("At least one entry with a weight of 1 or more is required.");
        return;
      }
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      try {
        const body = formToBody(form);
        const url = editingId ? `/api/admin/tablerolls/${editingId}` : "/api/admin/tablerolls";
        const method = editingId ? "PUT" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        if (!res.ok) {
          throw new Error(data.message ?? data.error ?? "Request failed");
        }
        if (editingId) {
          setSuccess(
            body.isActive ? "Table roll updated." : "Table roll updated — draft (hidden from Discord until published)."
          );
        } else {
          setSuccess(
            body.isActive ? "Table roll created." : "Table roll created as draft — not visible in Discord until published."
          );
        }
        doCloseForm();
        await fetchList();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSubmitting(false);
      }
    },
    [form, editingId, doCloseForm, fetchList]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      setError(null);
      try {
        const res = await fetch(`/api/admin/tablerolls/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { message?: string }).message ?? "Failed to delete");
        }
        setSuccess("Table roll deleted.");
        setDeleteConfirmId(null);
        await fetchList();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDeletingId(null);
      }
    },
    [fetchList]
  );

  const handleToggleActive = useCallback(
    async (row: TableRollRecord) => {
      const id = row._id;
      setTogglingId(id);
      setError(null);
      try {
        const res = await fetch(`/api/admin/tablerolls/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !row.isActive }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error((data as { message?: string }).message ?? "Failed to update");
        }
        setSuccess(row.isActive ? "Marked as draft — hidden from Discord lists and autocomplete." : "Published — visible in /tableroll and quest selectors.");
        await fetchList();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setTogglingId(null);
      }
    },
    [fetchList]
  );

  const formRef = useRef<FormState>(form);
  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const formDirty = useCallback(() => {
    return JSON.stringify(form) !== initialFormRef.current;
  }, [form]);

  useEffect(() => {
    if (!showForm) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(formRef.current) !== initialFormRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [showForm]);

  const handleOpenCreate = useCallback(() => {
    if (showForm && formDirty() && !window.confirm("You have unsaved changes. Leave anyway?")) return;
    setForm(defaultForm());
    setEditingId(null);
    setShowForm(true);
    setError(null);
    setSuccess(null);
    setNameValidationMessage(null);
    initialFormRef.current = JSON.stringify(defaultForm());
  }, [showForm, formDirty]);

  const handleCloseForm = useCallback((force?: boolean) => {
    if (!force && formDirty() && !window.confirm("You have unsaved changes. Leave anyway?")) return;
    doCloseForm();
  }, [formDirty, doCloseForm]);

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--totk-light-green)]/10">
        <Loading />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4 sm:p-6 md:p-8 flex items-center justify-center bg-[var(--botw-warm-black)]">
        <div className="mx-auto max-w-md w-full text-center px-4">
          <div className="mb-6 flex items-center justify-center gap-2 sm:gap-4">
            <img src="/Side=Left.svg" alt="" className="h-5 w-auto sm:h-6" />
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--totk-light-ocher)] uppercase">
              Access Denied
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-5 w-auto sm:h-6 md:h-8" />
          </div>
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6 sm:p-8 shadow-2xl">
            <p className="text-sm sm:text-base text-[var(--botw-pale)] mb-4 sm:mb-6">
              You must be an admin to access the table rolls editor.
            </p>
            <a
              href="/"
              className="inline-block rounded-md bg-[var(--totk-mid-ocher)] px-5 py-2.5 text-sm font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)]"
            >
              Return Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 md:p-8 bg-[var(--totk-light-green)]/10">
      <div className={`mx-auto space-y-6 ${showForm ? "max-w-7xl" : "max-w-[90rem]"}`}>
        {showForm ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--totk-dark-ocher)]/50 pb-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <button
                type="button"
                onClick={() => handleCloseForm()}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 px-3 py-2 text-sm font-medium text-[var(--totk-grey-200)] transition-colors hover:border-[var(--totk-mid-ocher)] hover:text-[var(--totk-ivory)]"
              >
                <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
                All table rolls
              </button>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-bold text-[var(--totk-light-ocher)] tracking-tight">
                    {editingId ? `Edit "${(form.name || "…").trim() || "Untitled"}"` : "New table roll"}
                  </h1>
                  {!form.isActive ? (
                    <span className="rounded-md border border-[var(--totk-dark-ocher)] bg-[var(--totk-grey-200)]/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--totk-grey-200)]">
                      Draft
                    </span>
                  ) : (
                    <span className="rounded-md border border-[var(--totk-light-green)]/40 bg-[var(--totk-light-green)]/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--totk-light-green)]">
                      Published
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-[var(--totk-grey-200)]">
                  Name, loot weights, Discord visibility, optional village locks and daily caps.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
            <div className="flex flex-col items-center sm:items-start gap-2">
              <div className="flex items-center gap-4 sm:gap-6">
                <img src="/Side=Left.svg" alt="" className="h-6 sm:h-8 w-auto opacity-80" />
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-[var(--totk-light-ocher)] tracking-tighter uppercase italic">
                  Table Rolls
                </h1>
                <img src="/Side=Right.svg" alt="" className="h-6 sm:h-8 w-auto opacity-80" />
              </div>
              <p className="text-sm text-[var(--totk-grey-200)] text-center sm:text-left max-w-xl">
                Create and manage rolls for quests and <code className="text-xs">/tableroll</code>. Drafts stay admin-only until you publish.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenCreate}
              className="shrink-0 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--totk-mid-ocher)] px-4 py-2.5 text-sm font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)] focus:ring-2 focus:ring-offset-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:outline-none"
            >
              <i className="fa-solid fa-plus mr-2" aria-hidden="true" />
              Create table roll
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-lg border-2 border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg border-2 border-[var(--totk-light-green)]/60 bg-[var(--totk-light-green)]/10 px-4 py-3 text-sm text-[var(--totk-light-green)]">
            {success}
          </div>
        )}

        {showForm && (
          <section className="rounded-2xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] shadow-[0_8px_40px_rgba(0,0,0,0.35)] overflow-hidden">
            <form onSubmit={handleSubmit} className="flex flex-col">
              <div className="p-5 sm:p-7 space-y-8">
                {/* Identity & visibility */}
                <div className="space-y-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--totk-dark-ocher)]/40 pb-3">
                    <h2 className="text-base font-semibold text-[var(--totk-ivory)]">Basics</h2>
                    <span className="text-xs text-[var(--totk-grey-200)]">Required fields marked *</span>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-sm font-medium text-[var(--totk-grey-200)]">Table name *</label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => {
                          setField("name", e.target.value);
                          setNameValidationMessage(null);
                        }}
                        onBlur={() => {
                          const n = form.name.trim();
                          if (!n) setNameValidationMessage("Name is required.");
                          else if (!NAME_REGEX.test(n)) setNameValidationMessage("Only letters, numbers, spaces, hyphens, and underscores.");
                          else setNameValidationMessage(null);
                        }}
                        className="w-full rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3.5 py-2.5 text-[var(--totk-ivory)] focus:ring-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)] transition-colors"
                        placeholder="e.g. fishing_loot_rare"
                        autoComplete="off"
                        required
                      />
                      {nameValidationMessage ? (
                        <p className="mt-1.5 text-xs text-red-400">{nameValidationMessage}</p>
                      ) : (
                        <p className="mt-1.5 text-xs text-[var(--totk-grey-200)]">Letters, numbers, spaces, hyphens, underscores only.</p>
                      )}
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={form.isActive}
                      onClick={() => setField("isActive", !form.isActive)}
                      className={`rounded-xl border-2 px-4 py-3 text-left transition-all sm:col-span-2 flex flex-wrap items-start gap-4 ${
                        form.isActive
                          ? "border-[var(--totk-light-green)]/45 bg-[var(--totk-light-green)]/[0.06]"
                          : "border-[var(--totk-dark-ocher)] bg-[var(--botw-black)]/30"
                      }`}
                    >
                      <span
                        className={`relative mt-0.5 inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full transition-colors border ${
                          form.isActive ? "bg-[var(--totk-light-green)]/40 border-[var(--totk-light-green)]/50" : "bg-[var(--totk-dark-ocher)]/40 border-[var(--totk-dark-ocher)]"
                        }`}
                      >
                        <span
                          className={`pointer-events-none absolute top-1 h-6 w-6 rounded-full shadow transition-all ${
                            form.isActive
                              ? "left-8 bg-[var(--totk-light-green)]"
                              : "left-1 bg-[var(--totk-grey-200)]"
                          }`}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-[var(--totk-ivory)]">{form.isActive ? "Published" : "Draft"}</span>
                        <span className="block text-sm text-[var(--totk-grey-200)] mt-0.5">
                          When published, appears in Discord <code className="text-[0.8125rem]">/tableroll</code>, autocomplete, and quest pickers.
                        </span>
                        {!form.isActive && (
                          <span className="inline-block mt-2 text-xs text-[var(--totk-grey-200)]">Drafts stay private here until you publish.</span>
                        )}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Roll limits & villages */}
                <div className="space-y-5">
                  <div className="border-b border-[var(--totk-dark-ocher)]/40 pb-3">
                    <h2 className="text-base font-semibold text-[var(--totk-ivory)]">Where &amp; how often</h2>
                    <p className="mt-1 text-xs text-[var(--totk-grey-200)]">Optional locks; rolls always use Town Hall channel rules per village.</p>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[var(--totk-grey-200)]">Max rolls per day</label>
                      <input
                        type="number"
                        min={0}
                        value={form.maxRollsPerDay}
                        onChange={(e) => setField("maxRollsPerDay", e.target.value)}
                        className="w-full max-w-[12rem] rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3.5 py-2.5 text-[var(--totk-ivory)] tabular-nums focus:ring-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)]"
                      />
                      <p className="mt-1.5 text-xs text-[var(--totk-grey-200)]">Shared across everyone for this table · 0 = unlimited</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="mb-2 block text-sm font-medium text-[var(--totk-grey-200)]">Village restriction</p>
                      <p className="mb-3 text-xs text-[var(--totk-grey-200)] max-w-xl">
                        Leave unchecked for any village. Select villages to restrict to characters stationed there only.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {VILLAGES.map((v) => (
                          <label
                            key={v}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                              (v === "Rudania"
                                ? form.restrictRudania
                                : v === "Inariko"
                                  ? form.restrictInariko
                                  : form.restrictVhintl)
                                ? "border-[var(--totk-light-green)]/50 bg-[var(--totk-light-green)]/[0.08] text-[var(--totk-ivory)]"
                                : "border-[var(--totk-dark-ocher)]/80 bg-[var(--botw-black)]/20 text-[var(--totk-grey-200)] hover:border-[var(--totk-mid-ocher)]/50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={
                                v === "Rudania"
                                  ? form.restrictRudania
                                  : v === "Inariko"
                                    ? form.restrictInariko
                                    : form.restrictVhintl
                              }
                              onChange={(e) =>
                                setField(
                                  v === "Rudania"
                                    ? "restrictRudania"
                                    : v === "Inariko"
                                      ? "restrictInariko"
                                      : "restrictVhintl",
                                  e.target.checked
                                )
                              }
                            />
                            <span>{v}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* CSV */}
                <div className="rounded-xl border border-[var(--totk-dark-ocher)]/70 bg-[var(--botw-black)]/35 p-4">
                  <button
                    type="button"
                    onClick={() => setShowCsvImport((prev) => !prev)}
                    className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-[var(--totk-light-green)] hover:text-[var(--totk-ivory)]"
                  >
                    <span>Bulk import (CSV)</span>
                    <i className={`fa-solid fa-chevron-${showCsvImport ? "up" : "down"} text-xs opacity-80`} aria-hidden="true" />
                  </button>
                  {showCsvImport && (
                    <div className="mt-4 space-y-3 border-t border-[var(--totk-dark-ocher)]/40 pt-4">
                      <p className="text-xs text-[var(--totk-grey-200)]">
                        First row = header (skipped). Columns: <strong>weight</strong>, <strong>flavor</strong>,{" "}
                        <strong>item</strong>, <strong>thumbnail URL</strong>. Quote fields that contain commas.
                      </p>
                      <textarea
                        value={csvImportText}
                        onChange={(e) => setCsvImportText(e.target.value)}
                        placeholder={"weight,flavor,item,thumbnailURL\n1,A Korok pops out...,Acorn,https://..."}
                        rows={5}
                        className="w-full rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2.5 text-sm text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-200)]/60 font-mono focus:ring-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)]"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => applyCsvImport(false)}
                          disabled={!csvImportText.trim()}
                          className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--totk-mid-ocher)]/30 px-3 py-2 text-sm font-medium text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-mid-ocher)]/50 disabled:opacity-50"
                        >
                          Replace all entries
                        </button>
                        <button
                          type="button"
                          onClick={() => applyCsvImport(true)}
                          disabled={!csvImportText.trim()}
                          className="rounded-lg border border-[var(--totk-dark-ocher)] px-3 py-2 text-sm text-[var(--totk-grey-200)] transition-colors hover:bg-[var(--totk-dark-ocher)]/30 disabled:opacity-50"
                        >
                          Append rows
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Entries */}
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--totk-dark-ocher)]/40 pb-3">
                    <div>
                      <h2 className="text-base font-semibold text-[var(--totk-ivory)]">
                        Entries <span className="tabular-nums text-[var(--totk-mid-ocher)]">{form.entries.length}</span>
                      </h2>
                      <p className="mt-1 text-xs text-[var(--totk-grey-200)]">Weight = relative chance · each row must have weight ≥ 1.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={entryFilter}
                        onChange={(e) => setEntryFilter(e.target.value)}
                        placeholder="Filter rows…"
                        className="w-44 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-200)]/70 focus:ring-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)]"
                      />
                      <button
                        type="button"
                        onClick={addEntry}
                        className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--totk-mid-ocher)]/30 px-3 py-2 text-xs font-medium text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-mid-ocher)]/50"
                      >
                        + Row
                      </button>
                      <button
                        type="button"
                        onClick={addFiveEntries}
                        className="rounded-lg border border-[var(--totk-dark-ocher)] px-3 py-2 text-xs text-[var(--totk-grey-200)] transition-colors hover:bg-[var(--totk-dark-ocher)]/30"
                      >
                        + 5 rows
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--totk-dark-ocher)]/60 overflow-hidden">
                    <div className="max-h-[min(60vh,560px)] overflow-auto">
                      <table className="w-full border-collapse text-sm">
                        <thead className="sticky top-0 z-[1] bg-[var(--botw-warm-black)] shadow-[0_1px_0_0_rgba(0,0,0,0.2)]">
                          <tr className="text-left text-xs uppercase tracking-wide text-[var(--totk-grey-200)]">
                            <th className="w-10 py-3 pl-3 pr-1 font-semibold">#</th>
                            <th className="w-14 py-3 px-1 font-semibold">Wt</th>
                            <th className="min-w-[220px] sm:min-w-[280px] py-3 px-1 font-semibold">Flavor</th>
                            <th className="min-w-[100px] py-3 px-1 font-semibold">Item</th>
                            <th className="min-w-[100px] py-3 px-1 font-semibold">Image URL</th>
                            <th className="w-12 py-3 pr-3 pl-1"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {form.entries.map((entry, i) => {
                            const show = entryMatchesFilter(entry, entryFilter);
                            return (
                              <tr
                                key={i}
                                className={`border-t border-[var(--totk-dark-ocher)]/25 transition-colors ${
                                  i % 2 === 1 ? "bg-[var(--totk-dark-ocher)]/[0.12]" : "bg-transparent"
                                } ${show ? "" : "hidden"} hover:bg-[var(--totk-mid-ocher)]/[0.08]`}
                              >
                                <td className="py-2 pl-3 pr-1 align-middle text-xs text-[var(--totk-grey-200)]">{i + 1}</td>
                                <td className="py-2 px-1 align-middle">
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    value={entry.weight}
                                    onChange={(e) => setEntry(i, "weight", e.target.value)}
                                    className="w-full min-w-[3rem] rounded-md border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2 py-1.5 text-[var(--totk-ivory)] tabular-nums focus:ring-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)]"
                                    title="Weight"
                                  />
                                </td>
                                <td className="py-2 px-1 align-top min-w-0">
                                  <textarea
                                    value={entry.flavor}
                                    onChange={(e) => setEntry(i, "flavor", e.target.value)}
                                    rows={flavorEditRowCount(entry.flavor)}
                                    className="w-full rounded-md border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2 py-1.5 text-sm leading-snug text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-200)]/60 focus:ring-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)] min-h-[5.5rem] resize-y overflow-y-auto"
                                    placeholder="Flavor text"
                                  />
                                </td>
                                <td className="py-2 px-1 align-middle">
                                  <ItemNameAutocomplete
                                    value={entry.item}
                                    onChange={(name) => setEntry(i, "item", name)}
                                    placeholder="Item"
                                    className="w-full rounded-md border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2 py-1.5 text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-200)]/60 focus:ring-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)]"
                                  />
                                </td>
                                <td className="py-2 px-1 align-middle min-w-0">
                                  <input
                                    type="text"
                                    value={entry.thumbnailImage}
                                    onChange={(e) => setEntry(i, "thumbnailImage", e.target.value)}
                                    className="w-full rounded-md border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2 py-1.5 text-xs text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-200)]/60 focus:ring-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)]"
                                    placeholder="https://…"
                                  />
                                </td>
                                <td className="py-2 pr-3 pl-1 align-middle">
                                  <button
                                    type="button"
                                    onClick={() => removeEntry(i)}
                                    disabled={form.entries.length <= 1}
                                    className="rounded-md border border-red-500/50 px-2 py-1.5 text-red-300 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                                    title="Remove row"
                                  >
                                    <i className="fa-solid fa-trash text-xs" aria-hidden="true" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--totk-grey-200)]">
                    Filter hides non-matching rows; all rows stay saved. Flavor uses a tall textarea (drag corner to resize). On small screens scroll the table horizontally if needed.
                  </p>

                  {/* Validation hint */}
                  {(() => {
                    const nameTrim = form.name.trim();
                    const hasValidEntry = form.entries.some((e) => parseInt(e.weight, 10) >= 1);
                    const hint = !nameTrim
                      ? "Name is required."
                      : !NAME_REGEX.test(nameTrim)
                        ? "Name can only contain letters, numbers, spaces, hyphens, and underscores."
                        : !hasValidEntry
                          ? "At least one row with weight ≥ 1."
                          : null;
                    return hint ? (
                      <p className="text-xs text-amber-100/95 bg-amber-500/[0.12] rounded-lg px-3 py-2 border border-amber-500/35">{hint}</p>
                    ) : null;
                  })()}
                </div>
              </div>

              {/* Sticky actions */}
              <div className="sticky bottom-0 z-10 border-t border-[var(--totk-dark-ocher)] bg-gradient-to-t from-[var(--botw-black)] via-[var(--botw-black)]/95 to-[var(--botw-warm-black)]/90 backdrop-blur-sm px-5 py-4 sm:px-7">
                {(() => {
                  const nameTrim = form.name.trim();
                  const hasValidEntry = form.entries.some((e) => parseInt(e.weight, 10) >= 1);
                  const valid = nameTrim && NAME_REGEX.test(nameTrim) && hasValidEntry;
                  return (
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => handleCloseForm()}
                        className="rounded-lg border border-[var(--totk-dark-ocher)] px-5 py-2.5 text-sm font-medium text-[var(--totk-grey-200)] transition-colors hover:bg-[var(--totk-dark-ocher)]/40"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={submitting || !valid}
                        className="rounded-lg bg-[var(--totk-mid-ocher)] px-6 py-2.5 text-sm font-bold text-[var(--totk-ivory)] shadow-lg transition-colors hover:bg-[var(--totk-dark-ocher)] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--totk-mid-ocher)] focus:ring-offset-2 focus:ring-offset-[var(--botw-black)]"
                      >
                        {submitting ? "Saving…" : editingId ? "Save changes" : "Create table roll"}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </form>
          </section>
        )}

        {!showForm && (
        <section className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] p-5 sm:p-6 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--totk-ivory)]">Table rolls</h2>
                <p className="text-xs text-[var(--totk-grey-200)] mt-1">
                  Daily limit applies to each table globally (Discord day). Village lock means only characters stationed there may roll—still uses Town Hall channel rules. Draft rolls do not appear in Discord or public selectors.
                </p>
              </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex items-center gap-2 text-xs text-[var(--totk-grey-200)]">
                <span className="text-[var(--totk-grey-200)] whitespace-nowrap">List:</span>
                <select
                  value={publishedListFilter}
                  onChange={(e) => setPublishedListFilter(e.target.value as "all" | "published" | "draft")}
                  className="rounded-md border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2 py-1.5 text-xs text-[var(--totk-ivory)]"
                >
                  <option value="all">All</option>
                  <option value="published">Published only</option>
                  <option value="draft">Draft only</option>
                </select>
              </label>
              <span className="text-xs text-[var(--totk-grey-200)]">View:</span>
              <button
                type="button"
                onClick={() => setListViewMode("table")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  listViewMode === "table"
                    ? "bg-[var(--totk-mid-ocher)] text-[var(--totk-ivory)]"
                    : "border border-[var(--totk-dark-ocher)] text-[var(--totk-grey-200)] hover:bg-[var(--totk-dark-ocher)]/20"
                }`}
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => setListViewMode("cards")}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  listViewMode === "cards"
                    ? "bg-[var(--totk-mid-ocher)] text-[var(--totk-ivory)]"
                    : "border border-[var(--totk-dark-ocher)] text-[var(--totk-grey-200)] hover:bg-[var(--totk-dark-ocher)]/20"
                }`}
              >
                Cards
              </button>
            </div>
          </div>
          {loading ? (
            <Loading />
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 rounded-lg border-2 border-dashed border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-black)]/30">
              <i className="fa-solid fa-dice mb-4 text-4xl text-[var(--totk-grey-200)]" aria-hidden="true" />
              <p className="text-sm font-medium text-[var(--totk-ivory)] mb-1">No table rolls yet</p>
              <p className="text-xs text-[var(--totk-grey-200)] mb-4">Create one to get started.</p>
              <button
                type="button"
                onClick={handleOpenCreate}
                className="rounded-lg bg-[var(--totk-mid-ocher)] px-4 py-2.5 text-sm font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)] focus:ring-2 focus:ring-offset-2 focus:ring-[var(--totk-mid-ocher)]/50"
              >
                <i className="fa-solid fa-plus mr-2" aria-hidden="true" />
                Create table roll
              </button>
            </div>
          ) : filteredList.length === 0 ? (
            <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-black)]/30 px-4 py-8 text-center text-sm text-[var(--totk-grey-200)]">
              No table rolls match this list filter.{publishedListFilter !== "all" && (
                <button
                  type="button"
                  onClick={() => setPublishedListFilter("all")}
                  className="ml-2 underline text-[var(--totk-light-green)] hover:text-[var(--totk-ivory)]"
                >
                  Show all
                </button>
              )}
            </div>
          ) : listViewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredList.map((row) => (
                <div
                  key={row._id}
                  className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4 hover:border-[var(--totk-light-green)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="text-lg font-bold text-[var(--totk-light-ocher)] truncate">{row.name}</h3>
                    <span
                      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                        row.isActive
                          ? "bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]"
                          : "bg-[var(--totk-grey-200)]/20 text-[var(--totk-grey-200)]"
                      }`}
                      title={row.isActive ? "Visible in Discord and selectors" : "Draft — hidden from Discord lists"}
                    >
                      {row.isActive ? "Published" : "Draft"}
                    </span>
                  </div>
                  <dl className="text-xs space-y-1 mb-4 text-[var(--totk-grey-200)]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--totk-grey-200)] shrink-0">Entries / weight</dt>
                      <dd className="text-right text-[var(--totk-ivory)] tabular-nums">
                        {(row.entries?.length ?? 0).toString()} · {row.totalWeight ?? "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-[var(--totk-grey-200)] shrink-0">Daily limit</dt>
                      <dd className="text-right font-medium text-[var(--totk-ivory)]">{formatDailyLimitDisplay(row.maxRollsPerDay)}</dd>
                    </div>
                    <div className="flex justify-between gap-2 items-start">
                      <dt className="text-[var(--totk-grey-200)] shrink-0 pt-0.5">Villages</dt>
                      <dd className="text-right text-[var(--totk-ivory)] leading-snug max-w-[65%]" title={formatVillageLockDisplay(row.allowedVillages)}>
                        {formatVillageLockDisplay(row.allowedVillages)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2 pt-1 border-t border-[var(--totk-dark-ocher)]/40">
                      <dt className="text-[var(--totk-grey-200)]">Updated</dt>
                      <dd className="text-[var(--totk-grey-200)]">{formatDate(row.updatedAt)}</dd>
                    </div>
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(row._id)}
                      className="rounded-md bg-[var(--totk-mid-ocher)] px-3 py-1.5 text-xs font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(row)}
                      disabled={togglingId === row._id}
                      className="rounded-md border border-[var(--totk-dark-ocher)] px-3 py-1.5 text-xs text-[var(--totk-grey-200)] hover:bg-[var(--totk-dark-ocher)]/30 disabled:opacity-50"
                    >
                      {togglingId === row._id ? "…" : row.isActive ? "Unpublish (draft)" : "Publish"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmId(row._id)}
                      className="rounded-md border border-red-500/60 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[var(--totk-dark-ocher)]/60">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-left text-[var(--totk-grey-200)]">
                    <th className="pb-2 pt-2 pr-4 pl-4 font-semibold">Name</th>
                    <th className="pb-2 pt-2 pr-4 font-semibold">Visibility</th>
                    <th className="pb-2 pt-2 pr-4 font-semibold">Entries</th>
                    <th className="pb-2 pt-2 pr-4 font-semibold">Total weight</th>
                    <th
                      className="pb-2 pt-2 pr-4 font-semibold max-w-[7rem]"
                      title="Max rolls on this table per day (shared across everyone). 0 = unlimited."
                    >
                      Daily limit
                    </th>
                    <th
                      className="pb-2 pt-2 pr-4 font-semibold min-w-[6rem]"
                      title="If set, characters must be stationed in one of these villages to roll."
                    >
                      Villages
                    </th>
                    <th className="pb-2 pt-2 pr-4 font-semibold">Updated</th>
                    <th className="pb-2 pt-2 pr-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map((row) => (
                    <tr key={row._id} className="border-b border-[var(--totk-dark-ocher)]/50 hover:bg-[var(--totk-dark-ocher)]/10 transition-colors">
                      <td className="py-2 pr-4 pl-4 font-medium text-[var(--totk-ivory)]">{row.name}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                            row.isActive
                              ? "bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]"
                              : "bg-[var(--totk-grey-200)]/20 text-[var(--totk-grey-200)]"
                          }`}
                          title={row.isActive ? "Visible in Discord and selectors" : "Draft — hidden from Discord lists"}
                        >
                          {row.isActive ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-[var(--totk-ivory)]">{row.entries?.length ?? 0}</td>
                      <td className="py-2 pr-4 text-[var(--totk-ivory)]">{row.totalWeight ?? "—"}</td>
                      <td
                        className="py-2 pr-4 text-[var(--totk-ivory)] tabular-nums"
                        title="Shared daily cap on this table in Discord."
                      >
                        {formatDailyLimitDisplay(row.maxRollsPerDay)}
                      </td>
                      <td
                        className="py-2 pr-4 max-w-[10rem] text-[var(--totk-ivory)] truncate"
                        title={formatVillageLockDisplay(row.allowedVillages)}
                      >
                        {formatVillageLockDisplay(row.allowedVillages)}
                      </td>
                      <td className="py-2 pr-4 text-[var(--totk-grey-200)]">{formatDate(row.updatedAt)}</td>
                      <td className="py-2 pr-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(row._id)}
                            className="rounded-md border border-[var(--totk-dark-ocher)] bg-[var(--totk-mid-ocher)]/30 px-2.5 py-1 text-xs font-medium text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-mid-ocher)]/50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleActive(row)}
                            disabled={togglingId === row._id}
                            className="rounded-md border border-[var(--totk-dark-ocher)] px-2.5 py-1 text-xs text-[var(--totk-grey-200)] hover:bg-[var(--totk-dark-ocher)]/30 disabled:opacity-50"
                          >
                            {togglingId === row._id ? "…" : row.isActive ? "Unpublish (draft)" : "Publish"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(row._id)}
                            className="rounded-md border border-red-500/60 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/20 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        )}

        <Modal
          open={deleteConfirmId != null}
          onOpenChange={(open) => !open && setDeleteConfirmId(null)}
          title="Delete table roll?"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--totk-grey-200)]">
              This cannot be undone. Quests using this table roll may break.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="rounded border border-[var(--totk-dark-ocher)] px-4 py-2 text-sm text-[var(--totk-ivory)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                disabled={deletingId != null}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingId ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
