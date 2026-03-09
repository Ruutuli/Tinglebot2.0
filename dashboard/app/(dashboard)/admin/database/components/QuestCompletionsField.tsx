"use client";

import { useCallback } from "react";

type CompletionEntry = {
  _id?: string;
  questId?: string;
  questType?: string;
  questTitle?: string;
  completedAt?: Date | string | null;
  rewardedAt?: Date | string | null;
  tokensEarned?: number;
  itemsEarned?: Array<{ name?: string; quantity?: number }>;
  rewardSource?: string;
};

type QuestCompletionsFieldProps = {
  label: string;
  value: CompletionEntry[];
  onChange: (value: CompletionEntry[]) => void;
  helpText?: string;
  isChanged?: boolean;
  error?: string;
};

const REWARD_SOURCES = ["immediate", "monthly", "dashboard_manual", "pending", "other"];

function formatDateTimeForInput(v: Date | string | null | undefined): string {
  if (v == null) return "";
  try {
    const d = typeof v === "string" ? new Date(v) : v;
    if (!Number.isFinite((d as Date).getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${(d as Date).getFullYear()}-${pad((d as Date).getMonth() + 1)}-${pad((d as Date).getDate())}T${pad((d as Date).getHours())}:${pad((d as Date).getMinutes())}`;
  } catch {
    return "";
  }
}

function parseDateTimeInput(s: string): string | null {
  if (!s || !s.trim()) return null;
  try {
    const d = new Date(s);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  } catch {
    return null;
  }
}

function itemsToText(items: CompletionEntry["itemsEarned"]): string {
  if (!items || !Array.isArray(items) || items.length === 0) return "";
  return items
    .map((i) => (i.name ? `${i.name}${i.quantity != null && i.quantity !== 1 ? ` × ${i.quantity}` : ""}` : ""))
    .filter(Boolean)
    .join(", ");
}

function textToItems(text: string): Array<{ name: string; quantity: number }> {
  if (!text || !text.trim()) return [];
  return text
    .split(",")
    .map((part) => {
      const match = part.trim().match(/^(.+?)\s*×\s*(\d+)$/);
      if (match) return { name: match[1].trim(), quantity: parseInt(match[2], 10) || 1 };
      if (part.trim()) return { name: part.trim(), quantity: 1 };
      return null;
    })
    .filter((x): x is { name: string; quantity: number } => x != null);
}

const emptyEntry = (): CompletionEntry => ({
  questId: "",
  questType: "",
  questTitle: "",
  completedAt: null,
  rewardedAt: null,
  tokensEarned: 0,
  itemsEarned: [],
  rewardSource: "immediate",
});

export function QuestCompletionsField({
  label,
  value,
  onChange,
  helpText = "",
  isChanged,
  error,
}: QuestCompletionsFieldProps) {
  const list = Array.isArray(value) ? [...value] : [];

  const updateRow = useCallback(
    (index: number, updates: Partial<CompletionEntry>) => {
      const next = list.map((row, i) => (i === index ? { ...row, ...updates } : row));
      onChange(next);
    },
    [list, onChange]
  );

  const removeRow = useCallback(
    (index: number) => {
      onChange(list.filter((_, i) => i !== index));
    },
    [list, onChange]
  );

  const addRow = useCallback(() => {
    onChange([...list, emptyEntry()]);
  }, [list, onChange]);

  const inputClass = `w-full min-w-0 px-2 py-1.5 rounded border bg-[var(--botw-warm-black)] border-[var(--totk-dark-ocher)]/50 text-[var(--botw-pale)] text-sm focus:border-[var(--totk-light-ocher)] focus:outline-none`;

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
      {helpText && <p className="text-xs text-[var(--totk-grey-200)] mb-2">{helpText}</p>}
      <div
        className={`overflow-hidden rounded-lg border-2 ${
          isChanged ? "border-[var(--totk-light-green)]" : "border-[var(--totk-dark-ocher)]"
        } bg-[var(--botw-warm-black)]/50`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[900px]">
            <thead>
              <tr className="border-b-2 border-[var(--totk-dark-ocher)]/60 bg-[var(--totk-dark-ocher)]/15">
                <th className="px-2 py-2 text-[var(--totk-light-ocher)] font-semibold whitespace-nowrap">Quest title</th>
                <th className="px-2 py-2 text-[var(--totk-light-ocher)] font-semibold whitespace-nowrap">Quest ID</th>
                <th className="px-2 py-2 text-[var(--totk-light-ocher)] font-semibold whitespace-nowrap">Type</th>
                <th className="px-2 py-2 text-[var(--totk-light-ocher)] font-semibold whitespace-nowrap">Completed at</th>
                <th className="px-2 py-2 text-[var(--totk-light-ocher)] font-semibold whitespace-nowrap">Rewarded at</th>
                <th className="px-2 py-2 text-[var(--totk-light-ocher)] font-semibold whitespace-nowrap w-20">Tokens</th>
                <th className="px-2 py-2 text-[var(--totk-light-ocher)] font-semibold whitespace-nowrap">Items earned</th>
                <th className="px-2 py-2 text-[var(--totk-light-ocher)] font-semibold whitespace-nowrap">Source</th>
                <th className="px-2 py-2 text-[var(--totk-light-ocher)] font-semibold w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((row, idx) => (
                <tr
                  key={row._id ?? `row-${idx}`}
                  className="border-b border-[var(--totk-grey-200)]/20 hover:bg-[var(--totk-dark-ocher)]/5 transition-colors"
                >
                  <td className="px-2 py-1.5 align-top">
                    <input
                      type="text"
                      className={inputClass}
                      value={row.questTitle ?? ""}
                      onChange={(e) => updateRow(idx, { questTitle: e.target.value })}
                      placeholder="Title"
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      type="text"
                      className={`${inputClass} font-mono text-xs`}
                      value={row.questId ?? ""}
                      onChange={(e) => updateRow(idx, { questId: e.target.value })}
                      placeholder="Q123456"
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      type="text"
                      className={inputClass}
                      value={row.questType ?? ""}
                      onChange={(e) => updateRow(idx, { questType: e.target.value })}
                      placeholder="e.g. Interactive"
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      type="datetime-local"
                      className={inputClass}
                      value={formatDateTimeForInput(row.completedAt)}
                      onChange={(e) => updateRow(idx, { completedAt: parseDateTimeInput(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      type="datetime-local"
                      className={inputClass}
                      value={formatDateTimeForInput(row.rewardedAt)}
                      onChange={(e) => updateRow(idx, { rewardedAt: parseDateTimeInput(e.target.value) })}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      value={row.tokensEarned ?? 0}
                      onChange={(e) => updateRow(idx, { tokensEarned: parseInt(e.target.value, 10) || 0 })}
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top min-w-[140px]">
                    <input
                      type="text"
                      className={inputClass}
                      value={itemsToText(row.itemsEarned)}
                      onChange={(e) => updateRow(idx, { itemsEarned: textToItems(e.target.value) })}
                      placeholder="Item × 2, Other × 1"
                      title="Format: Name × quantity, Name2 × quantity"
                    />
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <select
                      className={inputClass}
                      value={row.rewardSource ?? "immediate"}
                      onChange={(e) => updateRow(idx, { rewardSource: e.target.value })}
                    >
                      {REWARD_SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 align-top">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="rounded px-2 py-1 text-xs font-medium bg-red-900/70 hover:bg-red-800 text-red-100"
                      title="Remove this completion"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-[var(--totk-dark-ocher)]/30">
          <span className="text-xs text-[var(--totk-grey-200)]">
            {list.length} completion{list.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={addRow}
            className="rounded-md px-4 py-2 bg-[var(--totk-dark-ocher)] hover:bg-[var(--totk-mid-ocher)] text-[var(--botw-pale)] font-medium text-sm transition-colors"
          >
            <i className="fa-solid fa-plus mr-1.5" aria-hidden="true" />
            Add completion
          </button>
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-[#ff6347]">{error}</p>}
    </div>
  );
}
