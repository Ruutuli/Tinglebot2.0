"use client";

import { ToggleButton } from "./ToggleButton";

type ToggleOption = {
  key: string;
  label: string;
  helpText?: string;
};

type ToggleGridProps = {
  options: ToggleOption[];
  values: Record<string, boolean>;
  onChange: (key: string, value: boolean) => void;
  changes?: Record<string, boolean>;
  columns?: 2 | 3 | 4;
  groupTitle?: string;
};

export function ToggleGrid({ 
  options, 
  values, 
  onChange, 
  changes = {},
  columns = 3,
  groupTitle 
}: ToggleGridProps) {
  const gridCols = {
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className="space-y-3">
      {groupTitle && (
        <h5 className="text-sm font-semibold text-[var(--totk-light-ocher)] mb-2">
          {groupTitle}
        </h5>
      )}
      <div className={`grid ${gridCols[columns]} gap-2.5`}>
        {options.map((option) => {
          const value = values[option.key] ?? false;
          const isChanged = !!changes[option.key];
          
          return (
            <div key={option.key} className="relative group">
              <ToggleButton
                label={option.label}
                value={value}
                onChange={(v) => onChange(option.key, v)}
                isChanged={isChanged}
                className="w-full text-center"
              />
              {option.helpText && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-50">
                  <div className="bg-[var(--botw-black)] border-2 border-[var(--totk-dark-ocher)] rounded-lg px-3 py-2 text-xs text-[var(--botw-pale)] shadow-xl whitespace-nowrap max-w-xs">
                    {option.helpText}
                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[var(--totk-dark-ocher)]" />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
