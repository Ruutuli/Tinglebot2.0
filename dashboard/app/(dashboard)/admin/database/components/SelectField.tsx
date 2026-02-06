"use client";

import { useState, useRef, useEffect } from "react";

type SelectFieldProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  helpText?: string;
  isChanged?: boolean;
  error?: string;
  placeholder?: string;
};

export function SelectField({
  label,
  value,
  options,
  onChange,
  helpText,
  isChanged,
  error,
  placeholder = "Select an option...",
}: SelectFieldProps) {
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
          className={`w-full px-3 py-2 text-left bg-[var(--botw-warm-black)] border-2 rounded-md transition-colors ${
            error
              ? "border-red-500 focus:border-red-400"
              : isChanged
              ? "border-[var(--totk-light-green)] focus:border-[var(--totk-light-green)]"
              : "border-[var(--totk-dark-ocher)] focus:border-[var(--totk-light-ocher)]"
          } text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50`}
        >
          <span className={value ? "" : "text-[var(--totk-grey-200)]"}>
            {value || placeholder}
          </span>
          <i className={`fa-solid fa-chevron-${isOpen ? "up" : "down"} absolute right-3 top-1/2 -translate-y-1/2 text-[var(--totk-grey-200)]`} aria-hidden="true" />
        </button>
        
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-[var(--botw-black)] border-2 border-[var(--totk-dark-ocher)] rounded-md shadow-xl max-h-60 overflow-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-[var(--totk-grey-200)]">
                No options available
              </div>
            ) : (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    onChange(option);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                    value === option
                      ? "bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]"
                      : "text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/50"
                  }`}
                >
                  {option}
                </button>
              ))
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
