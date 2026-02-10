"use client";

import { useState } from "react";

type VillageCooldownsFieldProps = {
  label: string;
  value: Record<string, Date | string | null>;
  onChange: (value: Record<string, Date | string | null>) => void;
  helpText?: string;
  isChanged?: boolean;
  error?: string;
};

export function VillageCooldownsField({
  label,
  value,
  onChange,
  helpText,
  isChanged,
  error,
}: VillageCooldownsFieldProps) {
  const [newCooldownKey, setNewCooldownKey] = useState("");

  const cooldowns = value || {};

  const addCooldown = () => {
    if (!newCooldownKey.trim()) return;
    
    const cooldownKey = newCooldownKey.trim();
    if (cooldowns[cooldownKey]) {
      setNewCooldownKey("");
      return; // Cooldown already exists
    }

    onChange({
      ...cooldowns,
      [cooldownKey]: null,
    });
    setNewCooldownKey("");
  };

  const removeCooldown = (cooldownKey: string) => {
    const updated = { ...cooldowns };
    delete updated[cooldownKey];
    onChange(updated);
  };

  const updateCooldownDate = (cooldownKey: string, dateString: string) => {
    let value: string | null = null;
    if (dateString) {
      try {
        const d = new Date(dateString);
        value = Number.isFinite(d.getTime()) ? d.toISOString() : null;
      } catch {
        value = null;
      }
    }
    onChange({
      ...cooldowns,
      [cooldownKey]: value,
    });
  };

  const formatDateForInput = (date: Date | string | null | undefined): string => {
    if (!date) return "";
    try {
      const d = typeof date === "string" ? new Date(date) : date;
      if (!Number.isFinite(d.getTime())) return "";
      return d.toISOString().slice(0, 16); // Format for datetime-local input
    } catch {
      return "";
    }
  };

  return (
    <div className="space-y-3">
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

      {/* Add Cooldown */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newCooldownKey}
          onChange={(e) => setNewCooldownKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCooldown();
            }
          }}
          placeholder="Enter cooldown key and press Enter..."
          className={`flex-1 px-3 py-2 bg-[var(--botw-warm-black)] border-2 rounded-md transition-colors ${
            error
              ? "border-red-500 focus:border-red-400"
              : isChanged
              ? "border-[var(--totk-light-green)] focus:border-[var(--totk-light-green)]"
              : "border-[var(--totk-dark-ocher)] focus:border-[var(--totk-light-ocher)]"
          } text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50`}
        />
        <button
          type="button"
          onClick={addCooldown}
          className="px-4 py-2 bg-[var(--totk-dark-ocher)] hover:bg-[var(--totk-light-ocher)] text-[var(--botw-pale)] rounded-md transition-colors font-medium"
        >
          Add
        </button>
      </div>

      {/* Cooldowns List */}
      {Object.keys(cooldowns).length > 0 ? (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-[var(--totk-light-ocher)] pb-2 border-b border-[var(--totk-dark-ocher)]">
            <div className="col-span-6">Cooldown Key</div>
            <div className="col-span-4 text-center">Date/Time</div>
            <div className="col-span-2 text-center">Actions</div>
          </div>
          {Object.entries(cooldowns).map(([cooldownKey, dateValue]) => (
            <div
              key={cooldownKey}
              className="grid grid-cols-12 gap-2 items-center p-2 bg-[var(--botw-warm-black)] border-2 border-[var(--totk-dark-ocher)] rounded-md"
            >
              <div className="col-span-6 text-sm text-[var(--botw-pale)] font-mono break-all">
                {cooldownKey}
              </div>
              <div className="col-span-4">
                <input
                  type="datetime-local"
                  value={formatDateForInput(dateValue)}
                  onChange={(e) => {
                    updateCooldownDate(cooldownKey, e.target.value);
                  }}
                  className="w-full px-2 py-1 bg-[var(--botw-black)] border border-[var(--totk-dark-ocher)] rounded text-sm text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50"
                />
              </div>
              <div className="col-span-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => removeCooldown(cooldownKey)}
                  className="px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                  aria-label={`Remove ${cooldownKey}`}
                >
                  <i className="fa-solid fa-times" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 bg-[var(--botw-warm-black)]/50 border-2 border-[var(--totk-dark-ocher)]/50 rounded-md text-sm text-[var(--totk-grey-200)] italic text-center">
          No cooldowns added
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
