"use client";

import { useState, useMemo } from "react";

type Item = {
  _id: string;
  itemName: string;
  image?: string;
  itemRarity?: number;
  category?: string[];
  buyPrice?: number;
  sellPrice?: number;
  [key: string]: unknown;
};

type DatabaseItemListProps = {
  items: Item[];
  onEdit: (item: Item) => void;
};

type SortField = "name" | "rarity" | "buyPrice" | "sellPrice";
type SortDirection = "asc" | "desc";
type ViewMode = "table" | "cards";

export function DatabaseItemList({ items, onEdit }: DatabaseItemListProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const sortedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => {
      let aVal: string | number = "";
      let bVal: string | number = "";

      switch (sortField) {
        case "name":
          aVal = (a.itemName || "").toLowerCase();
          bVal = (b.itemName || "").toLowerCase();
          break;
        case "rarity":
          aVal = a.itemRarity ?? 0;
          bVal = b.itemRarity ?? 0;
          break;
        case "buyPrice":
          aVal = a.buyPrice ?? 0;
          bVal = b.buyPrice ?? 0;
          break;
        case "sellPrice":
          aVal = a.sellPrice ?? 0;
          bVal = b.sellPrice ?? 0;
          break;
      }

      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDirection === "asc" 
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      } else {
        return sortDirection === "asc" 
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      }
    });

    return sorted;
  }, [items, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
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

  return (
    <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 border-b border-[var(--totk-dark-ocher)]">
        <h2 className="text-xl font-bold text-[var(--totk-light-ocher)]">
          Items ({items.length})
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
                  onClick={() => handleSort("name")}
                >
                  <div className="flex items-center">
                    Name
                    <SortIcon field="name" />
                  </div>
                </th>
                <th scope="col" className="px-4 py-3 text-left text-sm font-semibold text-[var(--totk-light-ocher)]">
                  Category
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-sm font-semibold text-[var(--totk-light-ocher)] cursor-pointer hover:bg-[var(--totk-dark-ocher)]/20 transition-colors"
                  onClick={() => handleSort("rarity")}
                >
                  <div className="flex items-center">
                    Rarity
                    <SortIcon field="rarity" />
                  </div>
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-sm font-semibold text-[var(--totk-light-ocher)] cursor-pointer hover:bg-[var(--totk-dark-ocher)]/20 transition-colors"
                  onClick={() => handleSort("buyPrice")}
                >
                  <div className="flex items-center">
                    Buy Price
                    <SortIcon field="buyPrice" />
                  </div>
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-sm font-semibold text-[var(--totk-light-ocher)] cursor-pointer hover:bg-[var(--totk-dark-ocher)]/20 transition-colors"
                  onClick={() => handleSort("sellPrice")}
                >
                  <div className="flex items-center">
                    Sell Price
                    <SortIcon field="sellPrice" />
                  </div>
                </th>
                <th scope="col" className="px-4 py-3 text-right text-sm font-semibold text-[var(--totk-light-ocher)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item, index) => {
                // Safely extract ID - handle string IDs and ObjectIds; never use object as key (plain object.toString() → "[object Object]")
                let itemId: string;
                if (typeof item._id === "string" && item._id) {
                  itemId = item._id;
                } else if (item._id && typeof item._id === "object") {
                  const idStr = typeof (item._id as { toString?: () => string }).toString === "function"
                    ? (item._id as { toString: () => string }).toString()
                    : "";
                  itemId = idStr && idStr !== "[object Object]" ? idStr : `item-${index}`;
                } else {
                  itemId = `item-${index}`;
                }
                return (
                <tr
                  key={itemId}
                  className="border-b border-[var(--totk-dark-ocher)]/50 hover:bg-[var(--totk-dark-ocher)]/10 transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {item.image && (
                        <img 
                          src={item.image} 
                          alt={item.itemName || "Item"} 
                          className="w-8 h-8 object-contain rounded"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <span className="font-medium text-[var(--botw-pale)]">{item.itemName || "Unnamed Item"}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {item.category && item.category.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {item.category.slice(0, 2).map((cat, idx) => {
                          const catStr = typeof cat === "string" ? cat : String(cat);
                          return (
                            <span
                              key={`${itemId}-cat-${idx}-${catStr}`}
                              className="px-2 py-0.5 rounded bg-[var(--totk-dark-ocher)]/30 text-xs text-[var(--botw-pale)]"
                            >
                              {catStr}
                            </span>
                          );
                        })}
                        {item.category.length > 2 && (
                          <span className="px-2 py-0.5 text-xs text-[var(--totk-grey-200)]">
                            +{item.category.length - 2}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-[var(--totk-grey-200)] italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.itemRarity !== undefined ? (
                      <span className="px-2 py-0.5 rounded bg-[var(--totk-dark-ocher)]/30 text-xs text-[var(--botw-pale)]">
                        {item.itemRarity}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--totk-grey-200)] italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.buyPrice !== undefined && item.buyPrice > 0 ? (
                      <span className="text-sm text-[var(--botw-pale)]">{item.buyPrice}</span>
                    ) : (
                      <span className="text-xs text-[var(--totk-grey-200)] italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {item.sellPrice !== undefined && item.sellPrice > 0 ? (
                      <span className="text-sm text-[var(--botw-pale)]">{item.sellPrice}</span>
                    ) : (
                      <span className="text-xs text-[var(--totk-grey-200)] italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onEdit(item)}
                      className="rounded-md bg-[var(--totk-mid-ocher)] px-3 py-1.5 text-xs font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)]"
                    >
                      <i className="fa-solid fa-pencil mr-1.5" aria-hidden="true" />
                      Edit
                    </button>
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
              // Safely extract ID - handle string IDs and ObjectIds; never use object as key (plain object.toString() → "[object Object]")
              let itemId: string;
              if (typeof item._id === "string" && item._id) {
                itemId = item._id;
              } else if (item._id && typeof item._id === "object") {
                const idStr = typeof (item._id as { toString?: () => string }).toString === "function"
                  ? (item._id as { toString: () => string }).toString()
                  : "";
                itemId = idStr && idStr !== "[object Object]" ? idStr : `item-${index}`;
              } else {
                itemId = `item-${index}`;
              }
              return (
              <div
                key={itemId}
                className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4 hover:border-[var(--totk-light-green)] transition-colors"
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {item.image && (
                        <img 
                          src={item.image} 
                          alt={item.itemName || "Item"} 
                          className="w-10 h-10 object-contain rounded flex-shrink-0"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <h3 className="text-lg font-bold text-[var(--totk-light-ocher)] truncate">
                        {item.itemName || "Unnamed Item"}
                      </h3>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--totk-grey-200)]">
                      {item.category && item.category.length > 0 && (
                        <span className="px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/30">
                          {item.category.slice(0, 2).join(", ")}
                          {item.category.length > 2 && ` +${item.category.length - 2}`}
                        </span>
                      )}
                      {item.itemRarity !== undefined && (
                        <span className="px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/30">
                          Rarity: {item.itemRarity}
                        </span>
                      )}
                      {item.buyPrice !== undefined && item.buyPrice > 0 && (
                        <span className="px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/30">
                          Buy: {item.buyPrice}
                        </span>
                      )}
                      {item.sellPrice !== undefined && item.sellPrice > 0 && (
                        <span className="px-2 py-1 rounded bg-[var(--totk-dark-ocher)]/30">
                          Sell: {item.sellPrice}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => onEdit(item)}
                  className="w-full rounded-md bg-[var(--totk-mid-ocher)] px-4 py-2 text-sm font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)]"
                >
                  <i className="fa-solid fa-pencil mr-2" aria-hidden="true" />
                  Edit
                </button>
              </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
