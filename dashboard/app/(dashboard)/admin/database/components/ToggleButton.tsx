"use client";

type ToggleButtonProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  isChanged?: boolean;
  className?: string;
};

export function ToggleButton({ label, value, onChange, isChanged, className = "" }: ToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
        value
          ? "bg-[var(--totk-light-green)]/20 border-2 border-[var(--totk-light-green)] text-[var(--totk-light-green)]"
          : "bg-[var(--botw-warm-black)] border-2 border-[var(--totk-dark-ocher)] text-[var(--botw-pale)] hover:border-[var(--totk-light-ocher)]"
      } ${isChanged ? "ring-2 ring-[var(--totk-light-green)]/50" : ""} ${className}`}
    >
      {label}
    </button>
  );
}
