"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Tabs } from "@/components/ui/tabs";
import type { ModelConfig, FieldConfig } from "../types/model-types";
import { getItemId } from "../utils/id";
import { FieldRenderer } from "./FieldRenderer";
import { ToggleGrid } from "./ToggleGrid";
import { PET_TYPE_DATA } from "../constants/pet-type-data";

/** Get a nested value from an object using dot-notation path (e.g. "gearArmor.head.name"). */
function getNested(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

type GenericEditorFormProps = {
  item: Record<string, unknown>;
  modelConfig: ModelConfig;
  items?: Array<{ _id: string; itemName: string }>;
  onSave: (itemId: string, updates: Record<string, unknown>) => Promise<void>;
  saving: boolean;
  onClose: () => void;
};

export function GenericEditorForm({
  item,
  modelConfig,
  items = [],
  onSave,
  saving,
  onClose,
}: GenericEditorFormProps) {
  const [activeTab, setActiveTab] = useState<string>(modelConfig.tabs[0]?.id || "");
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    // Initialize form data from item
    const initial: Record<string, unknown> = {};
    modelConfig.tabs.forEach((tab) => {
      tab.fields.forEach((field) => {
        if (field.type === "toggle-grid") {
          // Build toggle-grid values from individual boolean fields
          const gridValues: Record<string, boolean> = {};
          field.options?.forEach((opt) => {
            const key = String(opt.value);
            gridValues[key] = Boolean(item[key] ?? false);
          });
          initial[field.key] = gridValues;
        } else {
          const value = field.key.includes(".")
            ? getNested(item as Record<string, unknown>, field.key)
            : (item as Record<string, unknown>)[field.key];
          if (value !== undefined && value !== null) {
            // Handle custom components - keep as object, not JSON string
            if (field.type === "custom" && (
              field.component === "VillageMaterialsField" ||
              field.component === "VillageContributorsField" ||
              field.component === "VillageCooldownsField"
            )) {
              // Keep as object for custom village components
              if (value instanceof Map) {
                initial[field.key] = Object.fromEntries(value);
              } else {
                initial[field.key] = value;
              }
            } else if (field.type === "text" && value instanceof Map) {
              // Convert Map objects to JSON strings for text fields
              const mapObj = Object.fromEntries(value);
              initial[field.key] = JSON.stringify(mapObj, null, 2);
            } else if (field.type === "text" && typeof value === "object" && !Array.isArray(value) && value.constructor === Object) {
              // Handle plain objects that might be Maps converted by Mongoose
              initial[field.key] = JSON.stringify(value, null, 2);
            } else if (field.type === "date") {
              // Normalize date fields so invalid values never cause toISOString() to throw
              try {
                const d = value instanceof Date ? value : new Date(value as string | number);
                initial[field.key] = Number.isFinite(d.getTime()) ? d.toISOString() : "";
              } catch {
                initial[field.key] = "";
              }
            } else {
              initial[field.key] = value;
            }
          } else {
            // Set defaults based on field type
            if (field.type === "boolean") {
              initial[field.key] = false;
            } else if (field.type === "number") {
              initial[field.key] = 0;
            } else if (field.type === "array" || field.type === "multiselect") {
              initial[field.key] = [];
            } else {
              initial[field.key] = "";
            }
          }
        }
      });
    });
    return initial;
  });

  const [changes, setChanges] = useState<Record<string, { original: unknown; current: unknown }>>({});

  // Auto-populate exploreLocations when exploreRegions changes (Monster model)
  useEffect(() => {
    if (modelConfig.name === "Monster" && formData.exploreRegions) {
      const exploreRegions = formData.exploreRegions as Record<string, boolean>;
      const exploreLocations: string[] = [];
      if (exploreRegions.exploreEldin) exploreLocations.push("Eldin");
      if (exploreRegions.exploreLanayru) exploreLocations.push("Lanayru");
      if (exploreRegions.exploreFaron) exploreLocations.push("Faron");
      
      // Keep existing manual entries that aren't auto-populated
      const existingLocations = Array.isArray(formData.exploreLocations) 
        ? (formData.exploreLocations as string[]).filter(loc => 
            loc !== "Eldin" && loc !== "Lanayru" && loc !== "Faron"
          )
        : [];
      
      const newLocations = [...exploreLocations, ...existingLocations];
      
      // Only update if different
      const currentLocations = Array.isArray(formData.exploreLocations) 
        ? (formData.exploreLocations as string[]).sort().join(",")
        : "";
      const newLocationsStr = newLocations.sort().join(",");
      
      if (currentLocations !== newLocationsStr) {
        setFormData((prev) => ({
          ...prev,
          exploreLocations: newLocations,
        }));
      }
    }
  }, [formData.exploreRegions, modelConfig.name]);

  // Track changes
  const handleFieldChange = useCallback((fieldKey: string, value: unknown) => {
    const isPetTypeChange =
      modelConfig.name === "Pet" &&
      fieldKey === "petType" &&
      typeof value === "string";
    const petTypeData = isPetTypeChange ? PET_TYPE_DATA[value] : null;

    setFormData((prev) => {
      const newData = { ...prev, [fieldKey]: value };
      if (petTypeData) {
        newData.rollCombination = petTypeData.rollCombination;
        newData.tableDescription = petTypeData.description;
      }
      return newData;
    });

    setChanges((prevChanges) => {
      const originalValue = fieldKey.includes(".")
        ? getNested(item as Record<string, unknown>, fieldKey)
        : (item as Record<string, unknown>)[fieldKey];
      const next = { ...prevChanges };
      if (JSON.stringify(originalValue) !== JSON.stringify(value)) {
        next[fieldKey] = { original: originalValue, current: value };
      } else {
        delete next[fieldKey];
      }
      if (petTypeData) {
        next.rollCombination = {
          original: (item as Record<string, unknown>).rollCombination,
          current: petTypeData.rollCombination,
        };
        next.tableDescription = {
          original: (item as Record<string, unknown>).tableDescription,
          current: petTypeData.description,
        };
      }
      return next;
    });
  }, [item, modelConfig.name]);

  // Handle toggle grid changes (special case for boolean grids)
  const handleToggleGridChange = useCallback((fieldKey: string, values: Record<string, boolean>) => {
    setFormData((prev) => {
      const newData = { ...prev, [fieldKey]: values };
      
      // Auto-populate exploreLocations based on exploreRegions for Monster model
      if (fieldKey === "exploreRegions" && modelConfig.name === "Monster") {
        const exploreLocations: string[] = [];
        if (values.exploreEldin) exploreLocations.push("Eldin");
        if (values.exploreLanayru) exploreLocations.push("Lanayru");
        if (values.exploreFaron) exploreLocations.push("Faron");
        
        // Keep existing manual entries that aren't auto-populated
        const existingLocations = Array.isArray(prev.exploreLocations) 
          ? (prev.exploreLocations as string[]).filter(loc => 
              loc !== "Eldin" && loc !== "Lanayru" && loc !== "Faron"
            )
          : [];
        
        newData.exploreLocations = [...exploreLocations, ...existingLocations];
      }
      
      // Track changes
      const originalValue = item[fieldKey];
      if (JSON.stringify(originalValue) !== JSON.stringify(values)) {
        setChanges((prevChanges) => ({
          ...prevChanges,
          [fieldKey]: { original: originalValue, current: values },
        }));
      } else {
        setChanges((prevChanges) => {
          const newChanges = { ...prevChanges };
          delete newChanges[fieldKey];
          return newChanges;
        });
      }
      
      return newData;
    });
  }, [item, modelConfig.name]);

  // Get field value helper
  const getFieldValue = useCallback((field: FieldConfig): unknown => {
    // Handle toggle-grid fields specially
    if (field.type === "toggle-grid") {
      const value = formData[field.key];
      if (typeof value === "object" && value !== null) {
        return value;
      }
      // Build from individual boolean fields if needed
      const gridValues: Record<string, boolean> = {};
      field.options?.forEach((opt) => {
        const key = String(opt.value);
        gridValues[key] = Boolean(formData[key] ?? false);
      });
      return gridValues;
    }
    return formData[field.key];
  }, [formData]);

  // Handle save
  const handleSave = useCallback(async () => {
    const itemId = getItemId(item._id) || getItemId((item as Record<string, unknown>).id);

    // Build updates object from formData
    const updates: Record<string, unknown> = {};
    
    // Process all fields, converting toggle-grid values to individual boolean fields
    modelConfig.tabs.forEach((tab) => {
      tab.fields.forEach((field) => {
        if (field.type === "toggle-grid") {
          // Convert toggle-grid object to individual boolean fields
          const gridValues = formData[field.key] as Record<string, boolean> | undefined;
          if (gridValues) {
            field.options?.forEach((opt) => {
              const key = String(opt.value);
              const value = Boolean(gridValues[key] ?? false);
              const originalValue = Boolean(item[key] ?? false);
              if (value !== originalValue) {
                updates[key] = value;
              }
            });
          }
        } else {
          // Regular field
          const key = field.key;
          const formValue = formData[key];
          
          // Handle custom components - they already return objects
          if (field.type === "custom" && (
            field.component === "VillageMaterialsField" ||
            field.component === "VillageContributorsField" ||
            field.component === "VillageCooldownsField"
          )) {
            if (changes[key] || JSON.stringify(formValue) !== JSON.stringify(item[key])) {
              updates[key] = formValue;
            }
          } else if (field.type === "text" && typeof formValue === "string" && formValue.trim().startsWith("{")) {
            // Parse JSON strings back to objects for Map fields
            try {
              const parsed = JSON.parse(formValue);
              // Check if this is a Map field (tokenRequirements, levelHealth, contributors, cooldowns)
              // Note: materials is handled by VillageMaterialsField component
              if (key === "tokenRequirements" || key === "levelHealth" || 
                  key === "contributors" || key === "cooldowns") {
                updates[key] = parsed;
              } else {
                updates[key] = formValue;
              }
            } catch (e) {
              // If JSON parsing fails, just use the string value
              updates[key] = formValue;
            }
          } else {
            const originalValue = key.includes(".")
              ? getNested(item as Record<string, unknown>, key)
              : (item as Record<string, unknown>)[key];
            if (changes[key] || JSON.stringify(formValue) !== JSON.stringify(originalValue)) {
              updates[key] = formValue;
            }
          }
        }
      });
    });

    await onSave(itemId, updates);
  }, [formData, changes, item, onSave, modelConfig]);

  // Check if there are any changes
  const hasChanges = Object.keys(changes).length > 0;

  // Get item name for display
  const itemName = String(item[modelConfig.nameField] || "Item");

  // Convert modelConfig.tabs to Tabs component format
  const tabsArray = modelConfig.tabs.map((tab) => ({
    value: tab.id,
    label: tab.label,
    icon: tab.icon,
  }));

  // Render tab content based on active tab
  const renderTabContent = () => {
    const activeTabConfig = modelConfig.tabs.find((tab) => tab.id === activeTab);
    if (!activeTabConfig) return null;

    const gridColumns = activeTabConfig.gridColumns;
    const fieldsToRender = activeTabConfig.fields.map((field) => {
      const fieldValue = getFieldValue(field);
      const isChanged = Boolean(changes[field.key]);

      if (field.type === "toggle-grid") {
        // Handle toggle-grid fields
        const values = fieldValue as Record<string, boolean>;
        return (
          <ToggleGridRenderer
            key={field.key}
            field={field}
            values={values}
            onChange={(newValues) => handleToggleGridChange(field.key, newValues)}
            isChanged={isChanged}
          />
        );
      }

      return (
        <FieldRenderer
          key={field.key}
          field={field}
          value={fieldValue}
          onChange={(value) => handleFieldChange(field.key, value)}
          isChanged={isChanged}
          items={items}
          formData={formData}
        />
      );
    });

    // If gridColumns is specified, render fields in a grid
    if (gridColumns && gridColumns > 1) {
      const gridClass = gridColumns === 2 
        ? "grid-cols-1 md:grid-cols-2" 
        : gridColumns === 3 
        ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
        : "grid-cols-1 md:grid-cols-2 lg:grid-cols-4";
      return (
        <div className={`grid ${gridClass} gap-4`}>
          {fieldsToRender}
        </div>
      );
    }

    return <div className="space-y-4">{fieldsToRender}</div>;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="mb-4">
        <Tabs
          tabs={tabsArray}
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
        />
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="pb-4 pt-6 min-w-0">{renderTabContent()}</div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-4 pt-4 mt-4 border-t-2 border-[var(--totk-dark-ocher)]">
        <div className="text-sm text-[var(--totk-grey-200)]">
          {hasChanges && (
            <span className="text-[var(--totk-light-green)]">
              <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
              {Object.keys(changes).length} field{Object.keys(changes).length !== 1 ? "s" : ""} changed
            </span>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-[var(--botw-pale)] hover:bg-[var(--totk-brown)]/30 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="px-4 py-2 rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)] hover:bg-[var(--totk-light-green)]/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <i className="fa-solid fa-spinner fa-spin mr-2" aria-hidden="true" />
                Saving...
              </>
            ) : (
              <>
                <i className="fa-solid fa-save mr-2" aria-hidden="true" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper component for toggle-grid rendering
function ToggleGridRenderer({
  field,
  values,
  onChange,
  isChanged,
}: {
  field: FieldConfig;
  values: Record<string, boolean>;
  onChange: (values: Record<string, boolean>) => void;
  isChanged: boolean;
}) {
  if (!field.options) {
    return null;
  }

  const toggleOptions = field.options.map((opt) => ({
    key: String(opt.value),
    label: opt.label,
    helpText: undefined,
  }));

  const handleToggleChange = (key: string, value: boolean) => {
    onChange({ ...values, [key]: value });
  };

  const columnsValue = field.columns && (field.columns === 2 || field.columns === 3 || field.columns === 4) 
    ? field.columns as 2 | 3 | 4
    : 3;

  return (
    <div className="mb-4">
      {field.label && !field.groupTitle && (
        <label className="block text-sm font-medium text-[var(--totk-light-ocher)] mb-1">
          {field.label}
          {isChanged && (
            <span className="ml-2 text-xs text-[var(--totk-light-green)]">
              <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
              Changed
            </span>
          )}
        </label>
      )}
      {field.helpText && (
        <p className="text-xs text-[var(--totk-grey-200)] mb-2">{field.helpText}</p>
      )}
      {field.groupTitle && (
        <h3 className="text-sm font-semibold text-[var(--totk-light-ocher)] mb-2">
          {field.groupTitle}
          {isChanged && (
            <span className="ml-2 text-xs text-[var(--totk-light-green)]">
              <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
              Changed
            </span>
          )}
        </h3>
      )}
      <ToggleGrid
        groupTitle={undefined}
        options={toggleOptions}
        values={values}
        onChange={handleToggleChange}
        changes={isChanged ? Object.fromEntries(Object.keys(values).map(k => [k, true])) as Record<string, boolean> : {}}
        columns={columnsValue}
      />
    </div>
  );
}
