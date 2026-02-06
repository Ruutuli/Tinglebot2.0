"use client";

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  helpText: string;
  isChanged?: boolean;
  error?: string;
  min?: number;
  max?: number;
  required?: boolean;
  disabled?: boolean;
};

export function NumberField({ label, value, onChange, helpText, isChanged, error, min, max, required, disabled }: NumberFieldProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-[var(--totk-light-ocher)] mb-1">
        {label}
        {required && <span className="text-[#ff6347] ml-1">*</span>}
        {isChanged && (
          <span className="ml-2 text-xs text-[var(--totk-light-green)]">
            <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
            Changed
          </span>
        )}
      </label>
      <p className="text-xs text-[var(--totk-grey-200)] mb-2">{helpText}</p>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        disabled={disabled}
        className={`w-full rounded-md border-2 ${
          isChanged ? "border-[var(--totk-light-green)]" : "border-[var(--totk-dark-ocher)]"
        } bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] disabled:opacity-50 disabled:cursor-not-allowed`}
      />
      {error && <p className="mt-1 text-xs text-[#ff6347]">{error}</p>}
    </div>
  );
}
