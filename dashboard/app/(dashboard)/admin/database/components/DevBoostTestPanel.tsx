"use client";

import { useMemo, useCallback } from "react";
import { TextField } from "./TextField";
import {
  DEV_BOOST_KINDS,
  formatDevBoostKindLabel,
} from "../constants/dev-boost-kinds";

type FormData = Record<string, unknown>;

type DevBoostTestPanelProps = {
  label: string;
  helpText?: string;
  formData: FormData;
  /** Merge updates into editor state (multiple dot-keys at once) */
  onBatchChange: (updates: Record<string, unknown>) => void;
  boostedBySuggestions: string[];
};

export function DevBoostTestPanel({
  label,
  helpText,
  formData,
  onBatchChange,
  boostedBySuggestions,
}: DevBoostTestPanelProps) {
  const enabled = Boolean(formData["devBoostOverride.enabled"]);
  const job = String(formData["devBoostOverride.boosterJob"] ?? "").trim();
  const category = String(formData["devBoostOverride.category"] ?? "").trim();
  const targetVillage = String(formData["devBoostOverride.targetVillage"] ?? "").trim();
  const boostedBy = String(formData["boostedBy"] ?? "");

  const selectedKindId = useMemo(() => {
    if (!job || !category) return "";
    const id = `${job}|${category}`;
    return DEV_BOOST_KINDS.some((k) => k.id === id) ? id : "";
  }, [job, category]);

  const sortedKinds = useMemo(() => {
    return [...DEV_BOOST_KINDS].sort((a, b) =>
      formatDevBoostKindLabel(a).localeCompare(formatDevBoostKindLabel(b))
    );
  }, []);

  const needsScholarVillage =
    enabled &&
    job.toLowerCase() === "scholar" &&
    category.toLowerCase() === "gathering";

  const applyKind = useCallback(
    (kindId: string) => {
      if (!kindId) {
        onBatchChange({
          "devBoostOverride.boosterJob": "",
          "devBoostOverride.category": "",
          "devBoostOverride.targetVillage": "",
        });
        return;
      }
      const kind = DEV_BOOST_KINDS.find((k) => k.id === kindId);
      if (!kind) return;
      const updates: Record<string, unknown> = {
        "devBoostOverride.boosterJob": kind.job,
        "devBoostOverride.category": kind.category,
      };
      if (kind.job !== "Scholar" || kind.category !== "Gathering") {
        updates["devBoostOverride.targetVillage"] = "";
      }
      onBatchChange(updates);
    },
    [onBatchChange]
  );

  const setEnabled = (v: boolean) => {
    if (!v) {
      onBatchChange({
        "devBoostOverride.enabled": false,
        "devBoostOverride.boosterJob": "",
        "devBoostOverride.category": "",
        "devBoostOverride.targetVillage": "",
      });
      return;
    }
    onBatchChange({ "devBoostOverride.enabled": true });
  };

  return (
    <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/40 p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--totk-light-ocher)]">{label}</h3>
        {helpText ? (
          <p className="mt-1 text-xs text-[var(--totk-grey-200)]">{helpText}</p>
        ) : null}
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--botw-pale)]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-[var(--totk-dark-ocher)]"
        />
        Enable dev boost override (testing)
      </label>

      <div className={enabled ? "space-y-4 opacity-100" : "pointer-events-none space-y-4 opacity-50"}>
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--botw-pale)]">
            Boost type
          </label>
          <p className="mb-1.5 text-xs text-[var(--totk-grey-200)]">
            Pick which job effect and which action category to simulate (one menu).
          </p>
          <select
            value={selectedKindId}
            onChange={(e) => applyKind(e.target.value)}
            disabled={!enabled}
            className="w-full rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/40 min-h-[2.5rem]"
          >
            <option value="">— Choose job &amp; category —</option>
            {sortedKinds.map((k) => (
              <option key={k.id} value={k.id}>
                {formatDevBoostKindLabel(k)}
              </option>
            ))}
          </select>
        </div>

        {needsScholarVillage ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-[var(--botw-pale)]">
              Scholar gather — target village
            </label>
            <input
              type="text"
              value={targetVillage}
              onChange={(e) =>
                onBatchChange({ "devBoostOverride.targetVillage": e.target.value })
              }
              placeholder="e.g. Inariko"
              className="w-full rounded-md border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/40"
            />
            <p className="mt-1 text-xs text-[var(--totk-grey-200)]">
              Required for Scholar + Gathering (cross-region table).
            </p>
          </div>
        ) : null}

        <TextField
          label="Boosted by (display name)"
          value={boostedBy}
          onChange={(v) => onBatchChange({ boostedBy: v })}
          helpText='Shown as the booster name in-game. First suggestion is “(Dummy booster)”; then pick any character name, or type your own.'
          suggestions={boostedBySuggestions}
        />
      </div>
    </div>
  );
}
