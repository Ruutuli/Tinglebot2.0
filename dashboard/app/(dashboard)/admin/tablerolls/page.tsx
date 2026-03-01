"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession } from "@/hooks/use-session";
import { Loading, Modal } from "@/components/ui";

const NAME_REGEX = /^[a-zA-Z0-9\s\-_]+$/;

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
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
};

type FormEntry = { weight: string; flavor: string; item: string; thumbnailImage: string };

type FormState = {
  name: string;
  isActive: boolean;
  maxRollsPerDay: string;
  entries: FormEntry[];
};

const emptyEntry: FormEntry = { weight: "1", flavor: "", item: "", thumbnailImage: "" };

function defaultForm(): FormState {
  return {
    name: "",
    isActive: true,
    maxRollsPerDay: "0",
    entries: [{ ...emptyEntry }],
  };
}

function recordToForm(r: TableRollRecord): FormState {
  return {
    name: r.name ?? "",
    isActive: r.isActive ?? true,
    maxRollsPerDay: String(r.maxRollsPerDay ?? 0),
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
  const [nameValidationMessage, setNameValidationMessage] = useState<string | null>(null);
  const initialFormRef = useRef<string>("");

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
        setSuccess(editingId ? "Table roll updated." : "Table roll created.");
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
        setSuccess(row.isActive ? "Table roll deactivated." : "Table roll activated.");
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
      <div className="mx-auto max-w-[90rem] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex flex-col items-center sm:items-start gap-2">
            <div className="flex items-center gap-4 sm:gap-6">
              <img src="/Side=Left.svg" alt="" className="h-6 sm:h-8 w-auto opacity-80" />
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-[var(--totk-light-ocher)] tracking-tighter uppercase italic">
                Table Rolls
              </h1>
              <img src="/Side=Right.svg" alt="" className="h-6 sm:h-8 w-auto opacity-80" />
            </div>
            <p className="text-sm text-[var(--totk-grey-200)]">
              Create and manage table rolls (used by quests and /tableroll)
            </p>
          </div>
          {!showForm && (
            <button
              type="button"
              onClick={handleOpenCreate}
              className="shrink-0 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--totk-mid-ocher)] px-4 py-2.5 text-sm font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)] focus:ring-2 focus:ring-offset-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:outline-none"
            >
              <i className="fa-solid fa-plus mr-2" aria-hidden="true" />
              Create table roll
            </button>
          )}
        </div>

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
          <section className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] p-5 sm:p-6 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h2 className="text-lg font-semibold text-[var(--totk-ivory)]">
                {editingId ? "Edit table roll" : "Create table roll"}
              </h2>
              <button
                type="button"
                onClick={() => handleCloseForm()}
                className="text-sm text-[var(--totk-light-green)] hover:underline transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-[var(--totk-mid-ocher)]/50 rounded"
              >
                Cancel
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-black)]/30 p-4 space-y-4">
                <h3 className="text-sm font-semibold text-[var(--totk-ivory)]">Details</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Name *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => { setField("name", e.target.value); setNameValidationMessage(null); }}
                      onBlur={() => {
                        const n = form.name.trim();
                        if (!n) setNameValidationMessage("Name is required.");
                        else if (!NAME_REGEX.test(n)) setNameValidationMessage("Only letters, numbers, spaces, hyphens, and underscores.");
                        else setNameValidationMessage(null);
                      }}
                      className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)] focus:ring-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)] transition-colors"
                      placeholder="e.g. Loot Table A"
                      required
                    />
                    {nameValidationMessage ? (
                      <p className="mt-1 text-xs text-red-400">{nameValidationMessage}</p>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--totk-grey-200)]">Letters, numbers, spaces, hyphens, underscores only.</p>
                    )}
                  </div>
                  <div className="flex items-end gap-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-[var(--totk-grey-200)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setField("isActive", e.target.checked)}
                        className="rounded border-[var(--totk-dark-ocher)] focus:ring-2 focus:ring-[var(--totk-mid-ocher)]/50"
                      />
                      Active (visible for quests / rolling)
                    </label>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Max rolls per day</label>
                    <input
                      type="number"
                      min={0}
                      value={form.maxRollsPerDay}
                      onChange={(e) => setField("maxRollsPerDay", e.target.value)}
                      className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)] focus:ring-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)] transition-colors"
                    />
                    <p className="mt-1 text-xs text-[var(--totk-grey-200)]">0 = unlimited</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-black)]/30 p-4 space-y-2">
                <button
                  type="button"
                  onClick={() => setShowCsvImport((v) => !v)}
                  className="text-sm font-medium text-[var(--totk-light-green)] hover:underline transition-colors"
                >
                  {showCsvImport ? "Hide CSV import" : "Import from CSV"}
                </button>
                {showCsvImport && (
                  <>
                    <p className="text-xs text-[var(--totk-grey-200)]">
                      First line = header (skipped). Columns: <strong>weight</strong>, <strong>flavor</strong>, <strong>item</strong>, <strong>thumbnail URL</strong>. Use double quotes for values that contain commas.
                    </p>
                    <textarea
                      value={csvImportText}
                      onChange={(e) => setCsvImportText(e.target.value)}
                      placeholder={"weight,flavor,item,thumbnailURL\n1,A Korok pops out...,Acorn,https://..."}
                      rows={5}
                      className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-200)]/60 font-mono focus:ring-2 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)]"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => applyCsvImport(false)}
                        disabled={!csvImportText.trim()}
                        className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--totk-mid-ocher)]/30 px-3 py-1.5 text-sm font-medium text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-mid-ocher)]/50 disabled:opacity-50"
                      >
                        Replace entries with CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => applyCsvImport(true)}
                        disabled={!csvImportText.trim()}
                        className="rounded-lg border border-[var(--totk-dark-ocher)] px-3 py-1.5 text-sm text-[var(--totk-grey-200)] transition-colors hover:bg-[var(--totk-dark-ocher)]/30 disabled:opacity-50"
                      >
                        Append CSV to entries
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-[var(--totk-ivory)]">Entries</h3>
                <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/95 px-3 py-2 backdrop-blur-sm">
                  <span className="text-sm font-medium text-[var(--totk-grey-200)]">
                    Entries * ({form.entries.length})
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={entryFilter}
                      onChange={(e) => setEntryFilter(e.target.value)}
                      placeholder="Filter by flavor, item, URL…"
                      className="w-48 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2 py-1.5 text-sm text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-200)]/70 focus:ring-1 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)]"
                    />
                    <button
                      type="button"
                      onClick={addEntry}
                      className="rounded-md border border-[var(--totk-dark-ocher)] bg-[var(--totk-mid-ocher)]/30 px-3 py-1.5 text-xs font-medium text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-mid-ocher)]/50"
                    >
                      Add row
                    </button>
                    <button
                      type="button"
                      onClick={addFiveEntries}
                      className="rounded-md border border-[var(--totk-dark-ocher)] px-3 py-1.5 text-xs text-[var(--totk-grey-200)] transition-colors hover:bg-[var(--totk-dark-ocher)]/30"
                    >
                      Add 5 rows
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 overflow-hidden">
                  <div className="max-h-[50vh] overflow-auto bg-[var(--botw-black)]/50">
                    <table className="w-full border-collapse text-sm">
                      <thead className="sticky top-0 bg-[var(--botw-warm-black)] shadow-sm">
                        <tr className="text-left text-xs text-[var(--totk-grey-200)]">
                          <th className="w-10 py-2 pl-2 pr-1 font-medium">#</th>
                          <th className="w-16 py-2 px-1 font-medium">Weight</th>
                          <th className="min-w-[180px] py-2 px-1 font-medium">Flavor</th>
                          <th className="w-32 py-2 px-1 font-medium">Item</th>
                          <th className="min-w-[120px] py-2 px-1 font-medium">Thumbnail URL</th>
                          <th className="w-14 py-2 pr-2 pl-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.entries.map((entry, i) => {
                          const show = entryMatchesFilter(entry, entryFilter);
                          return (
                          <tr
                            key={i}
                            className={`border-t border-[var(--totk-dark-ocher)]/30 hover:bg-[var(--totk-dark-ocher)]/10 transition-colors ${!show ? "hidden" : ""}`}
                          >
                            <td className="py-1 pl-2 pr-1 text-[var(--totk-grey-200)]">
                              {i + 1}
                            </td>
                            <td className="py-1 px-1">
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={entry.weight}
                                onChange={(e) => setEntry(i, "weight", e.target.value)}
                                className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2 py-1 text-[var(--totk-ivory)] focus:ring-1 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)]"
                                title="Weight"
                              />
                            </td>
                            <td className="py-1 px-1 min-w-0 max-w-[280px]">
                              <input
                                type="text"
                                value={entry.flavor}
                                onChange={(e) => setEntry(i, "flavor", e.target.value)}
                                className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2 py-1 text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-200)]/60 focus:ring-1 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)]"
                                placeholder="Flavor text"
                                title={entry.flavor || "Flavor text"}
                              />
                            </td>
                            <td className="py-1 px-1">
                              <ItemNameAutocomplete
                                value={entry.item}
                                onChange={(name) => setEntry(i, "item", name)}
                                placeholder="Item name"
                                className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2 py-1 text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-200)]/60 focus:ring-1 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)]"
                              />
                            </td>
                            <td className="py-1 px-1 min-w-0">
                              <input
                                type="text"
                                value={entry.thumbnailImage}
                                onChange={(e) => setEntry(i, "thumbnailImage", e.target.value)}
                                className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2 py-1 text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-200)]/60 focus:ring-1 focus:ring-[var(--totk-mid-ocher)]/50 focus:border-[var(--totk-mid-ocher)]"
                                placeholder="https://…"
                              />
                            </td>
                            <td className="py-1 pr-2 pl-1">
                              <button
                                type="button"
                                onClick={() => removeEntry(i)}
                                disabled={form.entries.length <= 1}
                                className="rounded border border-red-500/60 px-2 py-1 text-red-300 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
                  Use the filter to find entries by flavor, item, or URL. Scroll the table to see all. Hover over a flavor field to see full text.
                </p>
              </div>

              <div className="pt-2 border-t border-[var(--totk-dark-ocher)]/40 space-y-3">
                {(() => {
                  const name = form.name.trim();
                  const hasValidEntry = form.entries.some((e) => parseInt(e.weight, 10) >= 1);
                  const valid = name && NAME_REGEX.test(name) && hasValidEntry;
                  const hint = !name
                    ? "Name is required."
                    : !NAME_REGEX.test(name)
                      ? "Name can only contain letters, numbers, spaces, hyphens, and underscores."
                      : !hasValidEntry
                        ? "At least one entry with a weight of 1 or more is required."
                        : null;
                  return (
                    <>
                      {hint && (
                        <p className="text-xs text-[var(--totk-grey-200)]">{hint}</p>
                      )}
                      <div className="flex gap-3">
                        <button
                          type="submit"
                          disabled={submitting || !valid}
                          className="rounded-lg bg-[var(--totk-mid-ocher)] px-4 py-2.5 text-sm font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)] disabled:opacity-50 focus:ring-2 focus:ring-offset-2 focus:ring-[var(--totk-mid-ocher)]/50"
                        >
                          {submitting ? "Saving…" : editingId ? "Update" : "Create"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCloseForm()}
                          className="rounded-lg border border-[var(--totk-dark-ocher)] px-4 py-2.5 text-sm text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)]/30 focus:ring-2 focus:ring-offset-2 focus:ring-[var(--totk-mid-ocher)]/50"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  );
                })()}
              </div>
            </form>
          </section>
        )}

        <section className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] p-5 sm:p-6 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-[var(--totk-ivory)]">Table rolls</h2>
            <div className="flex items-center gap-2">
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
          ) : listViewMode === "cards" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {list.map((row) => (
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
                    >
                      {row.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--totk-grey-200)] mb-4">
                    {row.entries?.length ?? 0} entries · Total weight {row.totalWeight ?? "—"} · Max/day {row.maxRollsPerDay == null || row.maxRollsPerDay === 0 ? "Unlimited" : row.maxRollsPerDay} · Updated {formatDate(row.updatedAt)}
                  </p>
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
                      {togglingId === row._id ? "…" : row.isActive ? "Deactivate" : "Activate"}
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
                    <th className="pb-2 pt-2 pr-4 font-semibold">Status</th>
                    <th className="pb-2 pt-2 pr-4 font-semibold">Entries</th>
                    <th className="pb-2 pt-2 pr-4 font-semibold">Total weight</th>
                    <th className="pb-2 pt-2 pr-4 font-semibold">Max/day</th>
                    <th className="pb-2 pt-2 pr-4 font-semibold">Updated</th>
                    <th className="pb-2 pt-2 pr-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((row) => (
                    <tr key={row._id} className="border-b border-[var(--totk-dark-ocher)]/50 hover:bg-[var(--totk-dark-ocher)]/10 transition-colors">
                      <td className="py-2 pr-4 pl-4 font-medium text-[var(--totk-ivory)]">{row.name}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                            row.isActive
                              ? "bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]"
                              : "bg-[var(--totk-grey-200)]/20 text-[var(--totk-grey-200)]"
                          }`}
                        >
                          {row.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-[var(--totk-ivory)]">{row.entries?.length ?? 0}</td>
                      <td className="py-2 pr-4 text-[var(--totk-ivory)]">{row.totalWeight ?? "—"}</td>
                      <td className="py-2 pr-4 text-[var(--totk-ivory)]">
                        {row.maxRollsPerDay == null || row.maxRollsPerDay === 0 ? "Unlimited" : row.maxRollsPerDay}
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
                            {togglingId === row._id ? "…" : row.isActive ? "Deactivate" : "Activate"}
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
