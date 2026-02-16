"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

/* [search-filter-bar.tsx]✨ Core deps - */
import React, { useState, useMemo, useEffect } from "react";

/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

/* [search-filter-bar.tsx]🧷 Filter option type - */
export type FilterOption = {
  id: string;
  label: string;
  value: string | number | boolean;
  active?: boolean;
};

/* [search-filter-bar.tsx]🧷 Filter group type - */
export type FilterGroup = {
  id: string;
  label: string;
  options: FilterOption[];
  type?: "single" | "multiple"; // single = radio, multiple = checkbox
};

/* [search-filter-bar.tsx]🧷 Search and filter bar props - */
export type SearchFilterBarProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filterGroups?: FilterGroup[];
  onFilterChange?: (groupId: string, optionId: string, active: boolean) => void;
  onClearAll?: () => void;
  className?: string;
  customContent?: React.ReactNode;
};

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

/* [search-filter-bar.tsx]🧱 Search and filter bar component - */
export function SearchFilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  filterGroups = [],
  onFilterChange,
  onClearAll,
  className = "",
  customContent,
}: SearchFilterBarProps) {
  const [openDropdowns, setOpenDropdowns] = useState<Set<string>>(new Set());

  // Get active filter count for badge
  const activeFilterCount = useMemo(() => {
    return filterGroups.reduce((count, group) => {
      return count + group.options.filter((opt) => opt.active).length;
    }, 0);
  }, [filterGroups]);

  // Get active options count per group
  const getActiveCountForGroup = (groupId: string) => {
    const group = filterGroups.find((g) => g.id === groupId);
    return group ? group.options.filter((opt) => opt.active).length : 0;
  };

  // Get selected labels for a group (for display in button)
  const getSelectedLabels = (groupId: string) => {
    const group = filterGroups.find((g) => g.id === groupId);
    if (!group) return [];
    return group.options.filter((opt) => opt.active).map((opt) => opt.label);
  };

  const toggleDropdown = (groupId: string) => {
    setOpenDropdowns((prev) => {
      // If clicking the same dropdown that's already open, close it
      if (prev.has(groupId)) {
        return new Set();
      }
      // Otherwise, close all others and open only this one
      return new Set([groupId]);
    });
  };

  const handleFilterClick = (groupId: string, optionId: string, currentActive: boolean, type: "single" | "multiple") => {
    if (!onFilterChange) return;

    if (type === "single") {
      // For single select, deactivate all other options in the group first
      const group = filterGroups.find((g) => g.id === groupId);
      if (group) {
        group.options.forEach((opt) => {
          if (opt.id !== optionId && opt.active) {
            onFilterChange(groupId, opt.id, false);
          }
        });
      }
      // Toggle the clicked option
      onFilterChange(groupId, optionId, !currentActive);
      // Close dropdown after single select
      setOpenDropdowns((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    } else {
      // For multiple select, just toggle
      onFilterChange(groupId, optionId, !currentActive);
    }
  };

  // Clear all search and filters (or use parent-provided clearAll)
  const handleClearAll = () => {
    if (onClearAll) {
      onClearAll();
      return;
    }
    onSearchChange("");
    if (onFilterChange) {
      filterGroups.forEach((group) => {
        group.options.forEach((opt) => {
          if (opt.active) {
            onFilterChange(group.id, opt.id, false);
          }
        });
      });
    }
  };

  // Check if there's anything to clear
  const hasActiveSearchOrFilters = searchValue.trim().length > 0 || activeFilterCount > 0;

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".filter-dropdown")) {
        setOpenDropdowns(new Set());
      }
    };

    if (typeof window !== "undefined") {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, []);

  return (
    <div className={`space-y-3 sm:space-y-4 ${className}`}>
      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2.5 sm:px-4 sm:py-3 pr-16 sm:pr-20 text-sm sm:text-base text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-200)] focus:border-[var(--totk-light-green)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]/20"
        />
        <div className="absolute right-3 sm:right-4 top-1/2 flex -translate-y-1/2 items-center gap-1.5 sm:gap-2">
          {searchValue.trim().length > 0 && (
            <button
              onClick={() => onSearchChange("")}
              className="rounded-full p-1.5 sm:p-1 text-[var(--totk-grey-200)] hover:bg-[var(--totk-brown)]/30 hover:text-[var(--botw-pale)] transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center"
              aria-label="Clear search"
            >
              <i className="fa-solid fa-xmark text-xs sm:text-sm" />
            </button>
          )}
          <i className="fa-solid fa-magnifying-glass text-[var(--totk-grey-200)] text-sm sm:text-base" />
        </div>
      </div>

      {/* Filter Bar */}
      {(filterGroups.length > 0 || customContent) && (
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-3 sm:p-4 shadow-lg">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Custom Content */}
            {customContent && (
              <div className="flex items-center">
                {customContent}
              </div>
            )}
            {/* Filter Groups */}
            <div className="flex flex-wrap gap-2 flex-1 min-w-0">
              {filterGroups.map((group) => {
                const isOpen = openDropdowns.has(group.id);
                const activeCount = getActiveCountForGroup(group.id);
                const selectedLabels = getSelectedLabels(group.id);
                const displayText =
                  selectedLabels.length > 0
                    ? selectedLabels.length === 1
                      ? selectedLabels[0]
                      : `${selectedLabels.length} selected`
                    : group.label;

                // Get icon for filter group
                const getGroupIcon = (groupId: string) => {
                  if (groupId === "perPage") return "fa-list";
                  if (groupId === "sortBy") return "fa-sort";
                  if (groupId === "category") return "fa-tags";
                  if (groupId === "type") return "fa-shapes";
                  if (groupId === "rarity") return "fa-star";
                  if (groupId === "region") return "fa-map";
                  if (groupId === "species") return "fa-paw";
                  if (groupId === "tier") return "fa-layer-group";
                  if (groupId === "isActive") return "fa-toggle-on";
                  return "fa-filter";
                };

                return (
                  <div key={group.id} className="relative filter-dropdown">
                    <button
                      onClick={() => toggleDropdown(group.id)}
                      className={`flex items-center gap-2 rounded-lg border-2 px-3 sm:px-4 py-2.5 text-sm font-medium transition-all min-h-[44px] lg:min-h-0 ${
                        activeCount > 0
                          ? "border-[var(--totk-light-green)] bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)] shadow-sm shadow-[var(--totk-light-green)]/20"
                          : "border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] text-[var(--botw-pale)] hover:border-[var(--totk-light-ocher)] hover:bg-[var(--totk-brown)]/10"
                      }`}
                    >
                      <i className={`fa-solid ${getGroupIcon(group.id)} text-xs sm:text-sm`} />
                      <span className="truncate max-w-[120px] sm:max-w-none">{displayText}</span>
                      {activeCount > 0 && (
                        <span className="rounded-full bg-[var(--totk-light-green)]/30 px-1.5 sm:px-2 py-0.5 text-[10px] sm:text-xs font-semibold min-w-[1.25rem] sm:min-w-[1.5rem] text-center">
                          {activeCount}
                        </span>
                      )}
                      <i
                        className={`fa-solid fa-chevron-down text-xs transition-transform duration-200 flex-shrink-0 ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {/* Dropdown Menu */}
                    {isOpen && (
                      <div className="absolute left-0 right-0 sm:right-auto sm:left-0 top-full z-[100] mt-2 min-w-[220px] max-w-[calc(100vw-2rem)] sm:max-w-[280px] rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-black)] p-2 shadow-xl" style={{ bottom: 'auto', top: '100%' }}>
                        {group.options.length > 0 ? (
                          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                            {group.options.map((option) => (
                              <label
                                key={option.id}
                                className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-3 sm:py-2 text-sm transition-colors min-h-[44px] lg:min-h-0 ${
                                  option.active
                                    ? "bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]"
                                    : "text-[var(--botw-pale)] hover:bg-[var(--totk-brown)]/30"
                                }`}
                              >
                                <input
                                  type={group.type === "single" ? "radio" : "checkbox"}
                                  checked={option.active || false}
                                  onChange={() =>
                                    handleFilterClick(
                                      group.id,
                                      option.id,
                                      option.active || false,
                                      group.type || "multiple"
                                    )
                                  }
                                  className="h-5 w-5 sm:h-4 sm:w-4 cursor-pointer accent-[var(--totk-light-green)]"
                                />
                                <span className="flex-1">{option.label}</span>
                                {option.active && group.type === "multiple" && (
                                  <i className="fa-solid fa-check text-[var(--totk-light-green)] text-xs" />
                                )}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="px-3 py-4 text-sm text-[var(--totk-grey-200)] text-center">
                            No options available
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Clear All Button */}
            {hasActiveSearchOrFilters && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 sm:gap-2 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-medium text-[var(--botw-pale)] hover:border-[var(--blight-border)] hover:bg-[var(--blight-border)]/10 hover:text-[var(--blight-border)] transition-all min-h-[44px] w-full sm:w-auto"
              >
                <i className="fa-solid fa-xmark" />
                <span>Clear All</span>
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-[var(--blight-border)]/30 px-2 py-0.5 text-xs font-semibold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
