"use client";

import { ReactNode } from "react";
import { Loading, SearchFilterBar, Pagination, ResultsBar } from "@/components/ui";
import type { FilterGroup } from "@/components/ui";

/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

export type ModelListPageLayoutProps = {
  title: string;
  loadingMessage: string;
  errorMessage: string;
  itemName: string;
  searchPlaceholder: string;
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  filterGroups?: FilterGroup[];
  onFilterChange?: (groupId: string, optionId: string, active: boolean) => void;
  onClearAll?: () => void;
  currentPage: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  children: ReactNode;
};

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

export function ModelListPageLayout({
  title,
  loadingMessage,
  errorMessage,
  itemName,
  searchPlaceholder,
  loading,
  error,
  search,
  onSearchChange,
  filterGroups,
  onFilterChange,
  onClearAll,
  currentPage,
  totalItems,
  itemsPerPage,
  onPageChange,
  children,
}: ModelListPageLayoutProps) {
  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[90rem]">
        <div className="mb-4 sm:mb-6 flex items-center justify-center gap-2 sm:gap-4">
          <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" />
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[var(--totk-light-ocher)]">{title}</h1>
          <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" />
        </div>
        <SearchFilterBar
          searchValue={search}
          onSearchChange={onSearchChange}
          searchPlaceholder={searchPlaceholder}
          filterGroups={filterGroups}
          onFilterChange={onFilterChange}
          onClearAll={onClearAll}
          className="mb-4"
        />
        {loading ? (
          <Loading message={loadingMessage} variant="inline" size="lg" />
        ) : error ? (
          <>
            <ResultsBar
              currentPage={currentPage}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              itemName={itemName}
              className="mb-4"
            />
            <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
              <p className="text-[var(--botw-pale)]">{error}</p>
              <p className="mt-2 text-sm text-[var(--totk-grey-200)]">{errorMessage}</p>
            </div>
          </>
        ) : (
          <>
            <ResultsBar
              currentPage={currentPage}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              itemName={itemName}
              className="mb-4"
            />
            {children}
          </>
        )}
      </div>
    </div>
  );
}
