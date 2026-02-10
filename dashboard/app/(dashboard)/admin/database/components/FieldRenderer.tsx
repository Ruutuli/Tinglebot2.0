"use client";

import type { FieldConfig } from "../types/model-types";
import { TextField } from "./TextField";
import { NumberField } from "./NumberField";
import { BooleanField } from "./BooleanField";
import { SelectField } from "./SelectField";
import { MultiSelectField } from "./MultiSelectField";
import { ArrayFieldInput } from "./ArrayFieldInput";
import { ToggleGrid } from "./ToggleGrid";
import { CraftingMaterialsField } from "./CraftingMaterialsField";
import { VillageMaterialsField } from "./VillageMaterialsField";
import { VillageContributorsField } from "./VillageContributorsField";
import { VillageCooldownsField } from "./VillageCooldownsField";

type FieldRendererProps = {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  isChanged?: boolean;
  error?: string;
  // For custom components that need additional props
  items?: Array<{ _id: string; itemName: string }>;
  [key: string]: unknown;
};

export function FieldRenderer({
  field,
  value,
  onChange,
  isChanged,
  error,
  items = [],
  ...extraProps
}: FieldRendererProps) {
  // Check if field should be shown
  if (field.showIf && !field.showIf({ ...extraProps, [field.key]: value })) {
    return null;
  }

  // Get dynamic label/helpText if provided
  const label = field.getLabel ? field.getLabel({ ...extraProps, [field.key]: value }) : field.label;
  const helpText = field.getHelpText ? field.getHelpText({ ...extraProps, [field.key]: value }) : field.helpText;

  switch (field.type) {
    case "text":
      return (
        <TextField
          label={label}
          value={(value as string) || ""}
          onChange={(val) => onChange(val)}
          helpText={helpText || ""}
          isChanged={isChanged}
          error={error}
          required={field.required}
          placeholder={field.placeholder}
        />
      );

    case "number":
      return (
        <NumberField
          label={label}
          value={(value as number) ?? 0}
          onChange={(val) => onChange(val)}
          helpText={helpText || ""}
          isChanged={isChanged}
          error={error}
          min={field.min}
          max={field.max}
          required={field.required}
          disabled={field.disabled}
        />
      );

    case "boolean":
      return (
        <BooleanField
          label={label}
          value={(value as boolean) ?? false}
          onChange={(val) => onChange(val)}
          helpText={helpText || ""}
          isChanged={isChanged}
        />
      );

    case "select":
      if (!field.options) {
        return null;
      }
      return (
        <SelectField
          label={label}
          value={(value as string) || ""}
          options={field.options.map((opt) => String(opt.value))}
          onChange={(val) => onChange(val)}
          helpText={helpText}
          isChanged={isChanged}
          error={error}
          placeholder={field.placeholder}
        />
      );

    case "multiselect":
      if (!field.options) {
        return null;
      }
      return (
        <MultiSelectField
          label={label}
          value={Array.isArray(value) ? (value as string[]) : []}
          options={field.options.map((opt) => String(opt.value))}
          onChange={(val) => onChange(val)}
          helpText={helpText}
          isChanged={isChanged}
          error={error}
          placeholder={field.placeholder}
        />
      );

    case "array":
      return (
        <ArrayFieldInput
          label={label}
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={(val) => onChange(val)}
          helpText={helpText || ""}
          isChanged={isChanged}
          error={error}
          readOnly={field.readOnly}
          autoPopulated={field.autoPopulated}
        />
      );

    case "toggle-grid":
      if (!field.options) {
        return null;
      }
      // Convert field options to ToggleGrid format
      const toggleOptions = field.options.map((opt) => ({
        key: String(opt.value),
        label: opt.label,
        helpText: undefined,
      }));

      // Build values object from current value
      const values: Record<string, boolean> = {};
      if (typeof value === "object" && value !== null) {
        Object.entries(value as Record<string, unknown>).forEach(([key, val]) => {
          values[key] = Boolean(val);
        });
      } else {
        // If value is not an object, check if any of the field keys match
        toggleOptions.forEach((opt) => {
          values[opt.key] = false;
        });
      }

      // Handle onChange - ToggleGrid calls with (key, value) but we need to update the whole object
      const handleToggleChange = (key: string, toggleValue: boolean) => {
        const newValues = { ...values, [key]: toggleValue };
        onChange(newValues);
      };

      // Type guard for columns
      const columnsValue = field.columns && (field.columns === 2 || field.columns === 3 || field.columns === 4)
        ? (field.columns as 2 | 3 | 4)
        : 3;

      // For changes, we don't have granular tracking at FieldRenderer level, so pass empty object
      // The isChanged prop on individual toggles would need to be tracked at a higher level
      return (
        <ToggleGrid
          groupTitle={field.groupTitle}
          options={toggleOptions}
          values={values}
          onChange={handleToggleChange}
          changes={{}}
          columns={columnsValue}
        />
      );

    case "date": {
      const safeDateValue = (() => {
        if (value === undefined || value === null) return "";
        try {
          const d = value instanceof Date ? value : new Date(value as string | number);
          return Number.isFinite(d.getTime()) ? d.toISOString().split("T")[0] : "";
        } catch {
          return "";
        }
      })();
      return (
        <TextField
          label={label}
          value={safeDateValue}
          onChange={(val) => {
            if (!val) {
              onChange(null);
              return;
            }
            try {
              const d = new Date(val);
              onChange(Number.isFinite(d.getTime()) ? d.toISOString() : null);
            } catch {
              onChange(null);
            }
          }}
          helpText={helpText || ""}
          isChanged={isChanged}
          error={error}
          required={field.required}
          placeholder={field.placeholder || "YYYY-MM-DD"}
        />
      );
    }

    case "custom":
      if (field.component === "CraftingMaterialsField") {
        // Ensure CraftingMaterial has _id field
        const craftingMaterials: Array<{ _id: string; itemName: string; quantity: number }> = Array.isArray(value)
          ? (value as Array<{ _id?: string; itemName: string; quantity: number }>).map((mat) => ({
              _id: mat._id || "",
              itemName: mat.itemName,
              quantity: mat.quantity,
            }))
          : [];
        
        return (
          <CraftingMaterialsField
            label={label}
            value={craftingMaterials}
            onChange={(val) => onChange(val)}
            items={items}
            helpText={helpText}
            isChanged={isChanged}
            error={error}
          />
        );
      }
      if (field.component === "VillageMaterialsField") {
        // Convert value to Record<string, MaterialData> format
        let materialsValue: Record<string, { current: number; required: { "2"?: number; "3"?: number } }> = {};
        
        if (value && typeof value === "object") {
          if (value instanceof Map) {
            materialsValue = Object.fromEntries(value);
          } else {
            materialsValue = value as Record<string, { current: number; required: { "2"?: number; "3"?: number } }>;
          }
        }

        return (
          <VillageMaterialsField
            label={label}
            value={materialsValue}
            onChange={(val) => onChange(val)}
            helpText={helpText || ""}
            isChanged={isChanged}
            error={error}
          />
        );
      }
      if (field.component === "VillageContributorsField") {
        // Convert value to Record<string, ContributorData> format
        let contributorsValue: Record<string, { items?: Record<string, number>; tokens?: number }> = {};
        
        if (value && typeof value === "object") {
          if (value instanceof Map) {
            contributorsValue = Object.fromEntries(value);
          } else {
            contributorsValue = value as Record<string, { items?: Record<string, number>; tokens?: number }>;
          }
        }

        return (
          <VillageContributorsField
            label={label}
            value={contributorsValue}
            onChange={(val) => onChange(val)}
            helpText={helpText || ""}
            isChanged={isChanged}
            error={error}
          />
        );
      }
      if (field.component === "VillageCooldownsField") {
        // Convert value to Record<string, Date | string | null> format
        let cooldownsValue: Record<string, Date | string | null> = {};
        
        if (value && typeof value === "object") {
          if (value instanceof Map) {
            cooldownsValue = Object.fromEntries(value);
          } else {
            cooldownsValue = value as Record<string, Date | string | null>;
          }
        }

        return (
          <VillageCooldownsField
            label={label}
            value={cooldownsValue}
            onChange={(val) => onChange(val)}
            helpText={helpText || ""}
            isChanged={isChanged}
            error={error}
          />
        );
      }
      // Add more custom components here as needed
      return null;

    default:
      return null;
  }
}
