"use client";

import { useState, useRef, useEffect } from "react";

type CraftingMaterial = {
  _id: string;
  itemName: string;
  quantity: number;
};

type CraftingMaterialsFieldProps = {
  label: string;
  value: CraftingMaterial[];
  items: Array<{ _id: string; itemName: string }>;
  onChange: (value: CraftingMaterial[]) => void;
  helpText?: string;
  isChanged?: boolean;
  error?: string;
};

export function CraftingMaterialsField({
  label,
  value,
  items,
  onChange,
  helpText,
  isChanged,
  error,
}: CraftingMaterialsFieldProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Filter items that aren't already in the materials list
  const availableItems = items.filter(
    (item) => !value.some((mat) => mat._id === item._id)
  );

  const filteredItems = availableItems.filter((item) =>
    item.itemName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const addMaterial = (item: { _id: string; itemName: string }) => {
    onChange([...value, { _id: item._id, itemName: item.itemName, quantity: 1 }]);
    setSearchQuery("");
    setIsDropdownOpen(false);
  };

  const removeMaterial = (materialId: string) => {
    onChange(value.filter((mat) => mat._id !== materialId));
  };

  const updateQuantity = (materialId: string, quantity: number) => {
    if (quantity < 1) return;
    onChange(
      value.map((mat) => (mat._id === materialId ? { ...mat, quantity } : mat))
    );
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
        {isChanged && (
          <span className="ml-2 text-xs text-[var(--totk-light-green)]">
            <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
            Changed
          </span>
        )}
      </label>

      {/* Add Material Search */}
      <div className="relative" ref={dropdownRef}>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder="Search for an item to add..."
            className={`flex-1 px-3 py-2 bg-[var(--botw-warm-black)] border-2 rounded-md transition-colors ${
              error
                ? "border-red-500 focus:border-red-400"
                : isChanged
                ? "border-[var(--totk-light-green)] focus:border-[var(--totk-light-green)]"
                : "border-[var(--totk-dark-ocher)] focus:border-[var(--totk-light-ocher)]"
            } text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50`}
          />
        </div>

        {isDropdownOpen && searchQuery && filteredItems.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-[var(--botw-black)] border-2 border-[var(--totk-dark-ocher)] rounded-md shadow-xl max-h-60 overflow-auto">
            {filteredItems.slice(0, 10).map((item) => (
              <button
                key={item._id}
                type="button"
                onClick={() => addMaterial(item)}
                className="w-full px-3 py-2 text-left text-sm text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/50 transition-colors"
              >
                {item.itemName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Materials List */}
      {value.length > 0 && (
        <div className="space-y-2 mt-3">
          {value.map((material) => (
            <div
              key={material._id}
              className="flex items-center gap-2 p-3 bg-[var(--botw-warm-black)] border-2 border-[var(--totk-dark-ocher)] rounded-md"
            >
              <span className="flex-1 text-sm text-[var(--botw-pale)] font-medium">
                {material.itemName}
              </span>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[var(--totk-grey-200)]">Quantity:</label>
                <input
                  type="number"
                  min="1"
                  value={material.quantity}
                  onChange={(e) => {
                    const qty = parseInt(e.target.value, 10);
                    if (!isNaN(qty) && qty > 0) {
                      updateQuantity(material._id, qty);
                    }
                  }}
                  className="w-20 px-2 py-1 bg-[var(--botw-black)] border border-[var(--totk-dark-ocher)] rounded text-sm text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50"
                />
                <button
                  type="button"
                  onClick={() => removeMaterial(material._id)}
                  className="px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                  aria-label={`Remove ${material.itemName}`}
                >
                  <i className="fa-solid fa-times" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {value.length === 0 && (
        <div className="p-3 bg-[var(--botw-warm-black)]/50 border-2 border-[var(--totk-dark-ocher)]/50 rounded-md text-sm text-[var(--totk-grey-200)] italic text-center">
          No crafting materials added
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
