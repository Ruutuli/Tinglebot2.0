"use client";

import { useState } from "react";

type ContributorData = {
  items?: Record<string, number>;
  tokens?: number;
};

type VillageContributorsFieldProps = {
  label: string;
  value: Record<string, ContributorData>;
  onChange: (value: Record<string, ContributorData>) => void;
  helpText?: string;
  isChanged?: boolean;
  error?: string;
};

export function VillageContributorsField({
  label,
  value,
  onChange,
  helpText,
  isChanged,
  error,
}: VillageContributorsFieldProps) {
  const [newContributorId, setNewContributorId] = useState("");

  const contributors = value || {};

  const addContributor = () => {
    if (!newContributorId.trim()) return;
    
    const contributorId = newContributorId.trim();
    if (contributors[contributorId]) {
      setNewContributorId("");
      return; // Contributor already exists
    }

    onChange({
      ...contributors,
      [contributorId]: {
        items: {},
        tokens: 0,
      },
    });
    setNewContributorId("");
  };

  const removeContributor = (contributorId: string) => {
    const updated = { ...contributors };
    delete updated[contributorId];
    onChange(updated);
  };

  const updateContributor = (contributorId: string, updates: Partial<ContributorData>) => {
    onChange({
      ...contributors,
      [contributorId]: {
        ...contributors[contributorId],
        ...updates,
      },
    });
  };

  const updateTokens = (contributorId: string, tokens: number) => {
    const contributor = contributors[contributorId];
    if (!contributor) return;

    onChange({
      ...contributors,
      [contributorId]: {
        ...contributor,
        tokens: tokens,
      },
    });
  };

  const addItem = (contributorId: string, itemName: string) => {
    const contributor = contributors[contributorId];
    if (!contributor) return;

    const items = contributor.items || {};
    if (items[itemName]) return; // Item already exists

    onChange({
      ...contributors,
      [contributorId]: {
        ...contributor,
        items: {
          ...items,
          [itemName]: 0,
        },
      },
    });
  };

  const removeItem = (contributorId: string, itemName: string) => {
    const contributor = contributors[contributorId];
    if (!contributor) return;

    const items = { ...(contributor.items || {}) };
    delete items[itemName];

    onChange({
      ...contributors,
      [contributorId]: {
        ...contributor,
        items: items,
      },
    });
  };

  const updateItemQuantity = (contributorId: string, itemName: string, quantity: number) => {
    const contributor = contributors[contributorId];
    if (!contributor) return;

    const items = { ...(contributor.items || {}) };
    items[itemName] = quantity;

    onChange({
      ...contributors,
      [contributorId]: {
        ...contributor,
        items: items,
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

      {/* Add Contributor */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newContributorId}
          onChange={(e) => setNewContributorId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addContributor();
            }
          }}
          placeholder="Enter contributor ID and press Enter..."
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
          onClick={addContributor}
          className="px-4 py-2 bg-[var(--totk-dark-ocher)] hover:bg-[var(--totk-light-ocher)] text-[var(--botw-pale)] rounded-md transition-colors font-medium"
        >
          Add
        </button>
      </div>

      {/* Contributors List */}
      {Object.keys(contributors).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(contributors).map(([contributorId, contributorData]) => {
            const items = contributorData.items || {};
            
            return (
              <ContributorItem
                key={contributorId}
                contributorId={contributorId}
                contributorData={contributorData}
                onRemove={removeContributor}
                onUpdateTokens={updateTokens}
                onAddItem={addItem}
                onRemoveItem={removeItem}
                onUpdateItemQuantity={updateItemQuantity}
              />
            );
          })}
        </div>
      ) : (
        <div className="p-3 bg-[var(--botw-warm-black)]/50 border-2 border-[var(--totk-dark-ocher)]/50 rounded-md text-sm text-[var(--totk-grey-200)] italic text-center">
          No contributors added
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

// Separate component for each contributor item to handle local state
function ContributorItem({
  contributorId,
  contributorData,
  onRemove,
  onUpdateTokens,
  onAddItem,
  onRemoveItem,
  onUpdateItemQuantity,
}: {
  contributorId: string;
  contributorData: ContributorData;
  onRemove: (id: string) => void;
  onUpdateTokens: (id: string, tokens: number) => void;
  onAddItem: (id: string, itemName: string) => void;
  onRemoveItem: (id: string, itemName: string) => void;
  onUpdateItemQuantity: (id: string, itemName: string, quantity: number) => void;
}) {
  const [newItemName, setNewItemName] = useState("");
  const items = contributorData.items || {};

  return (
              <div
                key={contributorId}
                className="p-4 bg-[var(--botw-warm-black)] border-2 border-[var(--totk-dark-ocher)] rounded-md"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[var(--totk-light-ocher)] mb-1">
                      Contributor ID: <span className="text-[var(--botw-pale)] font-mono text-xs">{contributorId}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <label className="text-xs text-[var(--totk-grey-200)]">Tokens:</label>
                      <input
                        type="number"
                        min="0"
                        value={contributorData.tokens || 0}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          updateTokens(contributorId, val);
                        }}
                        className="w-24 px-2 py-1 bg-[var(--botw-black)] border border-[var(--totk-dark-ocher)] rounded text-sm text-[var(--botw-pale)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeContributor(contributorId)}
                    className="px-3 py-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                    aria-label={`Remove contributor ${contributorId}`}
                  >
                    <i className="fa-solid fa-times" aria-hidden="true" />
                  </button>
                </div>

                {/* Items Section */}
                <div className="mt-3 pt-3 border-t border-[var(--totk-dark-ocher)]/50">
                  <div className="text-xs font-semibold text-[var(--totk-light-ocher)] mb-2">Items:</div>
                  
                  {/* Add Item */}
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newItemName.trim()) {
                          e.preventDefault();
                          onAddItem(contributorId, newItemName.trim());
                          setNewItemName("");
                        }
                      }}
                      placeholder="Item name..."
                      className="flex-1 px-2 py-1 bg-[var(--botw-black)] border border-[var(--totk-dark-ocher)] rounded text-xs text-[var(--botw-pale)] focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-ocher)]/50"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newItemName.trim()) {
                          onAddItem(contributorId, newItemName.trim());
                          setNewItemName("");
                        }
                      }}
                      className="px-2 py-1 bg-[var(--totk-dark-ocher)] hover:bg-[var(--totk-light-ocher)] text-[var(--botw-pale)] rounded text-xs transition-colors"
                    >
                      Add Item
                    </button>
                  </div>

                  {/* Items List */}
                  {Object.keys(items).length > 0 ? (
                    <div className="space-y-1">
                      {Object.entries(items).map(([itemName, quantity]) => (
                        <div key={itemName} className="flex items-center gap-2 p-2 bg-[var(--botw-black)] rounded">
                          <span className="flex-1 text-xs text-[var(--botw-pale)]">{itemName}</span>
                          <input
                            type="number"
                            min="0"
                            value={quantity}
                            onChange={(e) => {
                              const val = parseInt(e.target.value, 10) || 0;
                              onUpdateItemQuantity(contributorId, itemName, val);
                            }}
                            className="w-20 px-2 py-1 bg-[var(--botw-warm-black)] border border-[var(--totk-dark-ocher)] rounded text-xs text-[var(--botw-pale)] focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-ocher)]/50"
                          />
                          <button
                            type="button"
                            onClick={() => onRemoveItem(contributorId, itemName)}
                            className="px-2 py-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors"
                            aria-label={`Remove ${itemName}`}
                          >
                            <i className="fa-solid fa-times text-xs" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--totk-grey-200)] italic text-center py-2">
                      No items added
                    </div>
                  )}
                </div>
              </div>
            );
}
