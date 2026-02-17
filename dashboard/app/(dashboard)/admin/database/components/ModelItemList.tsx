"use client";

import { useState, useMemo } from "react";
import type { ModelConfig } from "../types/model-types";

type ModelItemListProps = {
  items: Array<Record<string, unknown>>;
  modelConfig: ModelConfig;
  onEdit: (item: Record<string, unknown>) => void;
  /** When provided, each row shows a Delete button (e.g. for Inventory entries). */
  onDelete?: (item: Record<string, unknown>) => void | Promise<void>;
};

type ViewMode = "table" | "cards";

export function ModelItemList({ items, modelConfig, onEdit, onDelete }: ModelItemListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortField, setSortField] = useState<string>(modelConfig.sortField);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const sortedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" 
          ? aVal.toLowerCase().localeCompare(bVal.toLowerCase())
          : bVal.toLowerCase().localeCompare(aVal.toLowerCase());
      } else if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }

      return 0;
    });

    return sorted;
  }, [items, sortField, sortDirection]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) {
      return <i className="fa-solid fa-sort text-[var(--totk-grey-200)] text-xs ml-1" aria-hidden="true" />;
    }
    return (
      <i 
        className={`fa-solid fa-sort-${sortDirection === "asc" ? "up" : "down"} text-[var(--totk-light-green)] text-xs ml-1`} 
        aria-hidden="true" 
      />
    );
  };

  const nameField = modelConfig.nameField;
  const displayName = modelConfig.displayName;

  /** Get a stable string ID for list keys. Handles _id as string, ObjectId-like, or plain object. */
  const getItemKey = (item: Record<string, unknown>, index: number): string => {
    const id = item._id;
    if (typeof id === "string" && id) return id;
    if (id && typeof id === "object") {
      const oid = (id as Record<string, unknown>).$oid ?? (id as Record<string, unknown>).oid;
      if (typeof oid === "string" && oid) return oid;
      if ("toString" in (id as object) && typeof (id as { toString: () => string }).toString === "function") {
        const s = (id as { toString: () => string }).toString();
        if (s && s !== "[object Object]") return s;
      }
    }
    return `item-${index}`;
  };

  // Get common display fields based on model type
  const getDisplayFields = () => {
    if (modelConfig.name === "Item") {
      return [
        { key: "category", label: "Category", type: "array" },
        { key: "itemRarity", label: "Rarity", type: "number" },
        { key: "buyPrice", label: "Buy Price", type: "number" },
        { key: "sellPrice", label: "Sell Price", type: "number" },
      ];
    } else if (modelConfig.name === "Monster") {
      return [
        { key: "species", label: "Species", type: "string" },
        { key: "type", label: "Type", type: "string" },
        { key: "tier", label: "Tier", type: "number" },
      ];
    } else if (modelConfig.name === "Pet") {
      return [
        { key: "species", label: "Species", type: "string" },
        { key: "petType", label: "Type", type: "string" },
        { key: "status", label: "Status", type: "string" },
        { key: "level", label: "Level", type: "number" },
      ];
    } else if (modelConfig.name === "Character") {
      return [
        { key: "race", label: "Race", type: "string" },
        { key: "homeVillage", label: "Village", type: "string" },
        { key: "job", label: "Job", type: "string" },
      ];
    } else if (modelConfig.name === "Village") {
      return [
        { key: "region", label: "Region", type: "string" },
        { key: "level", label: "Level", type: "number" },
        { key: "health", label: "Health", type: "number" },
      ];
    } else if (modelConfig.name === "Inventory") {
      return [
        { key: "quantity", label: "Qty", type: "number" },
        { key: "category", label: "Category", type: "string" },
        { key: "type", label: "Type", type: "string" },
        { key: "obtain", label: "Obtain", type: "string" },
      ];
    }
    return [];
  };

  const displayFields = getDisplayFields();

  const formatValue = (value: unknown, type: string): string => {
    if (value === undefined || value === null) return "—";
    if (type === "array" && Array.isArray(value)) {
      return value.slice(0, 2).join(", ") + (value.length > 2 ? ` +${value.length - 2}` : "");
    }
    return String(value);
  };

  return (
    <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--totk-dark-ocher)]">
        <h2 className="text-xl font-bold text-[var(--totk-light-ocher)]">
          {displayName} ({items.length})
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-1">
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-[var(--totk-mid-ocher)] text-[var(--totk-ivory)]"
                  : "text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/20"
              }`}
              aria-label="Table view"
            >
              <i className="fa-solid fa-table mr-1.5" aria-hidden="true" />
              Table
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                viewMode === "cards"
                  ? "bg-[var(--totk-mid-ocher)] text-[var(--totk-ivory)]"
                  : "text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/20"
              }`}
              aria-label="Cards view"
            >
              <i className="fa-solid fa-th-large mr-1.5" aria-hidden="true" />
              Cards
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]">
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-sm font-semibold text-[var(--totk-light-ocher)] cursor-pointer hover:bg-[var(--totk-dark-ocher)]/20 transition-colors"
                  onClick={() => handleSort(nameField)}
                >
                  <div className="flex items-center">
                    Name
                    <SortIcon field={nameField} />
                  </div>
                </th>
                {displayFields.map((field) => (
                  <th
                    key={field.key}
                    scope="col"
                    className={`px-4 py-3 text-left text-sm font-semibold text-[var(--totk-light-ocher)] ${
                      field.type === "number" || field.type === "string"
                        ? "cursor-pointer hover:bg-[var(--totk-dark-ocher)]/20 transition-colors"
                        : ""
                    }`}
                    onClick={field.type === "number" || field.type === "string" ? () => handleSort(field.key) : undefined}
                  >
                    <div className="flex items-center">
                      {field.label}
                      {(field.type === "number" || field.type === "string") && <SortIcon field={field.key} />}
                    </div>
                  </th>
                ))}
                <th scope="col" className="px-4 py-3 text-right text-sm font-semibold text-[var(--totk-light-ocher)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item, index) => {
                const itemId = getItemKey(item, index);
                const itemName = String(item[nameField] || "Unnamed");
                const imageValue = item.image || item.imageUrl || item.icon;
                const image = imageValue && typeof imageValue === "string" ? imageValue : undefined;

                return (
                  <tr
                    key={itemId}
                    className="border-b border-[var(--totk-dark-ocher)]/50 hover:bg-[var(--totk-dark-ocher)]/10 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {image && typeof image === "string" && (
                          <img 
                            src={image} 
                            alt={itemName} 
                            className="w-8 h-8 object-contain rounded"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        )}
                        <span className="font-medium text-[var(--botw-pale)]">{itemName}</span>
                      </div>
                    </td>
                    {displayFields.map((field) => (
                      <td key={field.key} className="px-4 py-3">
                        {item[field.key] !== undefined && item[field.key] !== null ? (
                          <span className={`${
                            field.type === "array" 
                              ? "flex flex-wrap gap-1" 
                              : "text-sm text-[var(--botw-pale)]"
                          }`}>
                            {field.type === "array" && Array.isArray(item[field.key]) ? (
                              <>
                                {(item[field.key] as unknown[]).slice(0, 2).map((val, idx) => {
                                  const valStr = typeof val === "object" && val !== null && !Array.isArray(val)
                                    ? JSON.stringify(val)
                                    : String(val);
                                  return (
                                  <span
                                    key={`${itemId}-${field.key}-${idx}-${valStr}`}
                                    className="px-2 py-0.5 rounded bg-[var(--totk-dark-ocher)]/30 text-xs text-[var(--botw-pale)]"
                                  >
                                    {valStr}
                                  </span>
                                  );
                                })}
                                {(item[field.key] as unknown[]).length > 2 && (
                                  <span className="px-2 py-0.5 text-xs text-[var(--totk-grey-200)]">
                                    +{(item[field.key] as unknown[]).length - 2}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-[var(--totk-dark-ocher)]/30 text-xs text-[var(--botw-pale)]">
                                {formatValue(item[field.key], field.type)}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--totk-grey-200)] italic">—</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onEdit(item)}
                          className="rounded-md bg-[var(--totk-mid-ocher)] px-3 py-1.5 text-xs font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)]"
                        >
                          <i className="fa-solid fa-pencil mr-1.5" aria-hidden="true" />
                          Edit
                        </button>
                        {onDelete && (
                          <button
                            onClick={() => onDelete(item)}
                            className="rounded-md bg-red-900/80 px-3 py-1.5 text-xs font-bold text-red-100 transition-colors hover:bg-red-800"
                            title="Delete this entry"
                          >
                            <i className="fa-solid fa-trash mr-1.5" aria-hidden="true" />
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedItems.map((item, index) => {
              const itemId = getItemKey(item, index);
              const itemName = String(item[nameField] || "Unnamed");
              const imageValue = item.image || item.imageUrl || item.icon;
              const image = imageValue && typeof imageValue === "string" ? imageValue : undefined;

              return (
                <div
                  key={itemId}
                  className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4 hover:border-[var(--totk-light-green)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        {image ? (
                          <img 
                            src={image} 
                            alt={itemName} 
                            className="w-10 h-10 object-contain rounded flex-shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : null}
                        <h3 className="text-lg font-bold text-[var(--totk-light-ocher)] truncate">
                          {itemName}
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs text-[var(--totk-grey-200)]">
                        {displayFields.map((field) => {
                          const value = item[field.key];
                          if (value === undefined || value === null) return null;
                          return (
                            <span key={field.key} className="px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/30">
                              {field.label}: {formatValue(value, field.type)}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onEdit(item)}
                      className="flex-1 rounded-md bg-[var(--totk-mid-ocher)] px-4 py-2 text-sm font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)]"
                    >
                      <i className="fa-solid fa-pencil mr-2" aria-hidden="true" />
                      Edit
                    </button>
                    {onDelete && (
                      <button
                        onClick={() => onDelete(item)}
                        className="rounded-md bg-red-900/80 px-4 py-2 text-sm font-bold text-red-100 transition-colors hover:bg-red-800"
                        title="Delete this entry"
                      >
                        <i className="fa-solid fa-trash" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
