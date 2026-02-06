"use client";

import { useEffect, useState } from "react";

type ArrayFieldInputProps = {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  helpText: string;
  isChanged?: boolean;
  error?: string;
  readOnly?: boolean;
  autoPopulated?: boolean;
};

export function ArrayFieldInput({ label, value, onChange, helpText, isChanged, error, readOnly = false, autoPopulated = false }: ArrayFieldInputProps) {
  const [inputValue, setInputValue] = useState(value.join(", "));

  useEffect(() => {
    setInputValue(value.join(", "));
  }, [value]);

  const handleBlur = () => {
    if (readOnly || autoPopulated) return;
    // Parse comma-separated values
    // Note: Trimming is intentional here to clean up user input when parsing comma-separated lists
    // Special characters within values (like <, :, etc.) are preserved - only leading/trailing whitespace is removed
    const parsed = inputValue
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    onChange(parsed);
    setInputValue(parsed.join(", "));
  };

  // If readOnly OR autoPopulated, show as read-only display
  if (readOnly || autoPopulated) {
    return (
      <div className="mb-4">
        <label className="block text-sm font-medium text-[var(--totk-light-ocher)] mb-1">
          {label}
          {autoPopulated && (
            <span className="ml-2 text-xs text-[var(--totk-light-green)]">
              <i className="fa-solid fa-magic mr-1" aria-hidden="true" />
              Auto-populated
            </span>
          )}
          {isChanged && (
            <span className="ml-2 text-xs text-[var(--totk-light-green)]">
              <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
              Changed
            </span>
          )}
        </label>
        <p className="text-xs text-[var(--totk-grey-200)] mb-2">{helpText}</p>
        <div className={`w-full rounded-md border-2 min-h-[44px] flex items-center px-3 py-2 ${
          isChanged ? "border-[var(--totk-light-green)]" : "border-[var(--totk-dark-ocher)]"
        } ${autoPopulated ? "bg-[var(--totk-light-green)]/15 border-[var(--totk-light-green)]/50 shadow-sm shadow-[var(--totk-light-green)]/10" : "bg-[var(--botw-warm-black)]/50"}`}>
          {value.length > 0 ? (
            <div className="flex flex-wrap gap-2 w-full">
              {value.map((item, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/40 text-xs text-[var(--botw-pale)]"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs italic text-[var(--totk-grey-200)]">No items</span>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-[#ff6347]">{error}</p>}
      </div>
    );
  }

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
      <p className="text-xs text-[var(--totk-grey-200)] mb-2">{helpText}</p>
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        className={`w-full rounded-md border-2 ${
          isChanged ? "border-[var(--totk-light-green)]" : "border-[var(--totk-dark-ocher)]"
        } bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]`}
        placeholder="e.g., Armor, Weapon, Food"
      />
      {error && <p className="mt-1 text-xs text-[#ff6347]">{error}</p>}
    </div>
  );
}
