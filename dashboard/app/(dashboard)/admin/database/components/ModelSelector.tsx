"use client";

import { useState, useRef, useEffect } from "react";

type ModelOption = {
  name: string;
  displayName: string;
  icon: string;
};

type ModelSelectorProps = {
  value: string;
  options: ModelOption[];
  onChange: (value: string) => void;
};

export function ModelSelector({ value, options, onChange }: ModelSelectorProps) {
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

  const selectedModel = options.find((m) => m.name === value) || options[0];

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2.5 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] hover:border-[var(--totk-light-ocher)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] focus:border-[var(--totk-light-green)] transition-all cursor-pointer shadow-sm w-full"
      >
        <div className="p-2 rounded-lg bg-[var(--totk-dark-ocher)]/30 border border-[var(--totk-dark-ocher)]">
          <i className={`fa-solid ${selectedModel.icon} text-lg text-[var(--totk-light-ocher)]`} aria-hidden="true" />
        </div>
        <div className="flex flex-col items-start">
          <span className="text-xs font-medium text-[var(--totk-grey-200)] uppercase tracking-wide">
            Model Type
          </span>
          <span className="text-sm font-semibold text-[var(--botw-pale)]">
            {selectedModel.displayName}
          </span>
        </div>
        <i className={`fa-solid fa-chevron-${isOpen ? "up" : "down"} ml-auto text-[var(--totk-grey-200)]`} aria-hidden="true" />
      </button>
      
      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-[var(--botw-black)] border-2 border-[var(--totk-dark-ocher)] rounded-lg shadow-xl overflow-hidden min-w-[200px] max-h-[400px] overflow-y-auto">
          {options.map((model) => (
            <button
              key={model.name}
              type="button"
              onClick={() => {
                onChange(model.name);
                setIsOpen(false);
              }}
              className={`w-full px-4 py-3 text-left transition-colors flex items-center gap-3 ${
                value === model.name
                  ? "bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)] border-l-4 border-[var(--totk-light-green)]"
                  : "text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/50"
              }`}
            >
              <div className={`p-1.5 rounded ${
                value === model.name
                  ? "bg-[var(--totk-light-green)]/20"
                  : "bg-[var(--totk-dark-ocher)]/30"
              }`}>
                <i className={`fa-solid ${model.icon} text-sm ${
                  value === model.name
                    ? "text-[var(--totk-light-green)]"
                    : "text-[var(--totk-light-ocher)]"
                }`} aria-hidden="true" />
              </div>
              <span className="font-medium">{model.displayName}</span>
              {value === model.name && (
                <i className="fa-solid fa-check ml-auto text-[var(--totk-light-green)]" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
