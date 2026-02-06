"use client";

import { useState } from "react";

type MaterialData = {
  current: number;
  required: {
    "2"?: number;
    "3"?: number;
  };
};

type VillageMaterialsFieldProps = {
  label: string;
  value: Record<string, MaterialData>;
  onChange: (value: Record<string, MaterialData>) => void;
  helpText?: string;
  isChanged?: boolean;
  error?: string;
};

export function VillageMaterialsField({
  label,
  value,
  onChange,
  helpText,
  isChanged,
  error,
}: VillageMaterialsFieldProps) {
  const [newMaterialName, setNewMaterialName] = useState("");

  const materials = value || {};

  const addMaterial = () => {
    if (!newMaterialName.trim()) return;
    
    const materialName = newMaterialName.trim();
    if (materials[materialName]) {
      setNewMaterialName("");
      return; // Material already exists
    }

    onChange({
      ...materials,
      [materialName]: {
        current: 0,
        required: {
          "2": 0,
          "3": 0,
        },
      },
    });
    setNewMaterialName("");
  };

  const removeMaterial = (materialName: string) => {
    const updated = { ...materials };
    delete updated[materialName];
    onChange(updated);
  };

  const updateMaterial = (materialName: string, updates: Partial<MaterialData>) => {
    onChange({
      ...materials,
      [materialName]: {
        ...materials[materialName],
        ...updates,
      },
    });
  };

  const updateRequired = (materialName: string, level: "2" | "3", amount: number) => {
    const material = materials[materialName];
    if (!material) return;

    onChange({
      ...materials,
      [materialName]: {
        ...material,
        required: {
          ...material.required,
          [level]: amount,
        },
      },
    });
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-[var(--totk-light-ocher)]">
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

      {/* Add Material */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newMaterialName}
          onChange={(e) => setNewMaterialName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addMaterial();
            }
          }}
          placeholder="Enter material name and press Enter..."
          className={`flex-1 px-3 py-2 bg-[var(--botw-warm-black)] border-2 rounded-md transition-colors ${
            error
              ? "border-red-500 focus:border-red-400"
              : isChanged
              ? "border-[var(--totk-light-green)] focus:border-[var(--totk-light-green)]"
              : "border-[var(--totk-dark-ocher)] focus:border-[var(--totk-light-ocher)]"
          } text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50`}
        />
        <button
          type="button"
          onClick={addMaterial}
          className="px-4 py-2 bg-[var(--totk-dark-ocher)] hover:bg-[var(--totk-light-ocher)] text-[var(--botw-pale)] rounded-md transition-colors font-medium"
        >
          Add
        </button>
      </div>

      {/* Materials List */}
      {Object.keys(materials).length > 0 ? (
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-[var(--totk-light-ocher)] pb-2 border-b border-[var(--totk-dark-ocher)]">
            <div className="col-span-4">Material</div>
            <div className="col-span-2 text-center">Current</div>
            <div className="col-span-2 text-center">Req. Lvl 2</div>
            <div className="col-span-2 text-center">Req. Lvl 3</div>
            <div className="col-span-2 text-center">Actions</div>
          </div>
          {Object.entries(materials).map(([materialName, materialData]) => (
            <div
              key={materialName}
              className="grid grid-cols-12 gap-2 items-center p-2 bg-[var(--botw-warm-black)] border-2 border-[var(--totk-dark-ocher)] rounded-md"
            >
              <div className="col-span-4 text-sm text-[var(--botw-pale)] font-medium">
                {materialName}
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  min="0"
                  value={materialData.current || 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 0;
                    updateMaterial(materialName, { current: val });
                  }}
                  className="w-full px-2 py-1 bg-[var(--botw-black)] border border-[var(--totk-dark-ocher)] rounded text-sm text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  min="0"
                  value={materialData.required?.["2"] || 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 0;
                    updateRequired(materialName, "2", val);
                  }}
                  className="w-full px-2 py-1 bg-[var(--botw-black)] border border-[var(--totk-dark-ocher)] rounded text-sm text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50"
                />
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  min="0"
                  value={materialData.required?.["3"] || 0}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 0;
                    updateRequired(materialName, "3", val);
                  }}
                  className="w-full px-2 py-1 bg-[var(--botw-black)] border border-[var(--totk-dark-ocher)] rounded text-sm text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50"
                />
              </div>
              <div className="col-span-2 flex justify-center">
                <button
                  type="button"
                  onClick={() => removeMaterial(materialName)}
                  className="px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                  aria-label={`Remove ${materialName}`}
                >
                  <i className="fa-solid fa-times" aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-3 bg-[var(--botw-warm-black)]/50 border-2 border-[var(--totk-dark-ocher)]/50 rounded-md text-sm text-[var(--totk-grey-200)] italic text-center">
          No materials added
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
