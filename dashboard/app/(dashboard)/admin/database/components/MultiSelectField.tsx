"use client";

import { useState, useRef, useEffect } from "react";

type MultiSelectFieldProps = {
  label: string;
  value: string[];
  options: string[];
  onChange: (value: string[]) => void;
  helpText?: string;
  isChanged?: boolean;
  error?: string;
  placeholder?: string;
};

export function MultiSelectField({
  label,
  value,
  options,
  onChange,
  helpText,
  isChanged,
  error,
  placeholder = "Select options...",
}: MultiSelectFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const filteredOptions = options.filter(opt => opt && opt.trim() !== "").sort();

  const toggleOption = (option: string) => {
    if (value.includes(option)) {
      onChange(value.filter(v => v !== option));
    } else {
      onChange([...value, option]);
    }
  };

  const removeOption = (option: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter(v => v !== option));
  };

  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-[var(--botw-pale)]">
        {label}
        {helpText && (
          <span className="ml-2 text-xs text-[var(--totk-grey-200)] font-normal">
            <i className="fa-solid fa-circle-info mr-1" aria-hidden="true" />
            {helpText}
          </span>
        )}
      </label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full min-h-[42px] px-3 py-2 text-left bg-[var(--botw-warm-black)] border-2 rounded-md transition-colors ${
            error
              ? "border-red-500 focus:border-red-400"
              : isChanged
              ? "border-[var(--totk-light-green)] focus:border-[var(--totk-light-green)]"
              : "border-[var(--totk-dark-ocher)] focus:border-[var(--totk-light-ocher)]"
          } text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50 flex flex-wrap gap-1.5 items-center`}
        >
          {value.length === 0 ? (
            <span className="text-[var(--totk-grey-200)]">{placeholder}</span>
          ) : (
            value.map((val) => (
              <span
                key={val}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--totk-light-green)]/20 border border-[var(--totk-light-green)]/50 rounded text-sm text-[var(--totk-light-green)]"
              >
                {val}
                <span
                  onClick={(e) => removeOption(val, e)}
                  className="hover:text-[var(--totk-light-green)]/70 focus:outline-none cursor-pointer"
                  role="button"
                  tabIndex={0}
                  aria-label={`Remove ${val}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      removeOption(val, e as unknown as React.MouseEvent);
                    }
                  }}
                >
                  <i className="fa-solid fa-times text-xs" aria-hidden="true" />
                </span>
              </span>
            ))
          )}
          <i className={`fa-solid fa-chevron-${isOpen ? "up" : "down"} ml-auto text-[var(--totk-grey-200)]`} aria-hidden="true" />
        </button>
        
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-[var(--botw-black)] border-2 border-[var(--totk-dark-ocher)] rounded-md shadow-xl max-h-60 overflow-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-[var(--totk-grey-200)]">
                No options available
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = value.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => toggleOption(option)}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors flex items-center gap-2 ${
                      isSelected
                        ? "bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]"
                        : "text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/50"
                    }`}
                  >
                    <i className={`fa-solid fa-${isSelected ? "check-square" : "square"} text-xs`} aria-hidden="true" />
                    {option}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
