"use client";

type BooleanFieldProps = {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  helpText: string;
  isChanged?: boolean;
};

export function BooleanField({ label, value, onChange, helpText, isChanged }: BooleanFieldProps) {
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
      <div className="flex items-center gap-3">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => onChange(e.target.checked)}
            className="sr-only peer"
          />
          <div className={`w-11 h-6 rounded-full transition-colors duration-200 ${
            value 
              ? "bg-[var(--totk-light-green)] peer-focus:ring-2 peer-focus:ring-[var(--totk-light-green)] peer-focus:ring-offset-2 peer-focus:ring-offset-[var(--totk-brown)]" 
              : "bg-[var(--totk-dark-ocher)] peer-focus:ring-2 peer-focus:ring-[var(--totk-dark-ocher)] peer-focus:ring-offset-2 peer-focus:ring-offset-[var(--totk-brown)]"
          } ${isChanged ? "ring-2 ring-[var(--totk-light-green)] ring-offset-2 ring-offset-[var(--totk-brown)]" : ""}`}>
            <div className={`absolute top-0.5 left-0.5 bg-white rounded-full h-5 w-5 transition-transform duration-200 ${
              value ? "translate-x-5" : "translate-x-0"
            } shadow-md`} />
          </div>
          <span className="ml-3 text-sm font-medium text-[var(--botw-pale)]">
            {value ? "Yes" : "No"}
          </span>
        </label>
      </div>
    </div>
  );
}
