"use client";

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helpText: string;
  isChanged?: boolean;
  error?: string;
  required?: boolean;
  placeholder?: string;
  /** When > 1, render a textarea with this many rows instead of a single-line input */
  rows?: number;
};

export function TextField({ label, value, onChange, helpText, isChanged, error, required, placeholder, rows }: TextFieldProps) {
  const inputClass = `w-full rounded-md border-2 ${
    isChanged ? "border-[var(--totk-light-green)]" : "border-[var(--totk-dark-ocher)]"
  } bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] min-h-[2.5rem]`;

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
      {helpText && <p className="text-xs text-[var(--totk-grey-200)] mb-2">{helpText}</p>}
      {rows != null && rows > 1 ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className={`${inputClass} resize-y min-h-[6rem]`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      )}
      {error && <p className="mt-1 text-xs text-[#ff6347]">{error}</p>}
    </div>
  );
}
