"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useModelList } from "@/hooks/use-model-list";
import { Pagination } from "@/components/ui";
import { ModelListPageLayout } from "@/components/layout/model-list-page-layout";

type Village = {
  _id: string;
  name: string;
  region: string;
  color?: string;
  emoji?: string;
  health?: number;
  level?: number;
  status?: string;
  currentTokens?: number;
  vendingTier?: number;
  vendingDiscount?: number;
  [key: string]: unknown;
};

export default function VillagesPage() {
  const pathname = usePathname();
  const {
    data: villages,
    total,
    loading,
    error,
    search,
    setSearch,
    currentPage,
    setCurrentPage,
    filterGroups,
    handleFilterChange,
    itemsPerPage,
    clearAll,
  } = useModelList<Village>("villages");

  // Scroll to top function
  const scrollToTop = useCallback(() => {
    const mainElement = document.querySelector('main');
    window.scrollTo({ top: 0, behavior: 'instant' });
    mainElement?.scrollTo({ top: 0, behavior: 'instant' });
    document.documentElement.scrollTo({ top: 0, behavior: 'instant' });
    
    // Double-check after a brief delay
    setTimeout(() => {
      const mainEl = document.querySelector('main');
      if (window.scrollY > 0 || (mainEl?.scrollTop ?? 0) > 0) {
        window.scrollTo({ top: 0, behavior: 'instant' });
        mainEl?.scrollTo({ top: 0, behavior: 'instant' });
        document.documentElement.scrollTo({ top: 0, behavior: 'instant' });
      }
    }, 50);
  }, []);

  // Ensure scroll to top when pathname changes (page navigation)
  useEffect(() => {
    scrollToTop();
  }, [pathname, scrollToTop]);

  // Scroll to top when pagination changes
  useEffect(() => {
    scrollToTop();
  }, [currentPage, scrollToTop]);

  // Scroll to top when search changes
  useEffect(() => {
    scrollToTop();
  }, [search, scrollToTop]);

  return (
    <ModelListPageLayout
      title="Villages"
      loadingMessage="Loading villages..."
      errorMessage="This page will display all villages from the database once MongoDB connection is configured."
      itemName="villages"
      searchPlaceholder="Search villages by name or region..."
      loading={loading}
      error={error}
      search={search}
      onSearchChange={setSearch}
      filterGroups={filterGroups}
      onFilterChange={handleFilterChange}
      onClearAll={clearAll}
      currentPage={currentPage}
      totalItems={total}
      itemsPerPage={itemsPerPage}
      onPageChange={setCurrentPage}
    >
      {villages.length === 0 ? (
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
          <p className="text-center text-[var(--botw-pale)]">No villages found.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {villages.map((village) => (
              <div
                key={village._id}
                className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--totk-brown)]/30 p-4"
                style={
                  village.color
                    ? { borderLeftColor: village.color as string, borderLeftWidth: "4px" }
                    : undefined
                }
              >
                <div className="flex items-center gap-2">
                  {village.emoji && <span className="text-xl">{String(village.emoji)}</span>}
                  <h2 className="text-lg font-semibold text-[var(--totk-light-ocher)]">{village.name}</h2>
                </div>
                <div className="mt-3 space-y-2 text-sm text-[var(--botw-pale)]">
                  <div className="flex justify-between">
                    <span className="font-medium">Region:</span>
                    <span>{village.region}</span>
                  </div>
                  {village.level != null && (
                    <div className="flex justify-between">
                      <span className="font-medium">Level:</span>
                      <span className="text-[var(--totk-light-ocher)]">{village.level}</span>
                    </div>
                  )}
                  {village.health != null && (
                    <div className="flex justify-between">
                      <span className="font-medium">Health:</span>
                      <span className="text-[var(--totk-light-ocher)]">{village.health}</span>
                    </div>
                  )}
                  {village.status != null && (
                    <div className="flex justify-between">
                      <span className="font-medium">Status:</span>
                      <span
                        className={
                          village.status === "max"
                            ? "text-[var(--totk-light-green)]"
                            : village.status === "damaged"
                              ? "text-[var(--gold)]"
                              : "text-[var(--totk-light-ocher)]"
                        }
                      >
                        {String(village.status)}
                      </span>
                    </div>
                  )}
                  {village.currentTokens != null && (
                    <div className="flex justify-between">
                      <span className="font-medium">Tokens:</span>
                      <span className="text-[var(--botw-blue)]">{village.currentTokens}</span>
                    </div>
                  )}
                  {village.vendingTier != null && (
                    <div className="flex justify-between">
                      <span className="font-medium">Vending Tier:</span>
                      <span>{village.vendingTier}</span>
                    </div>
                  )}
                  {typeof village.vendingDiscount === "number" && village.vendingDiscount > 0 && (
                    <div className="flex justify-between">
                      <span className="font-medium">Vending Discount:</span>
                      <span className="text-[var(--totk-light-ocher)]">{village.vendingDiscount}%</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {total > itemsPerPage && (
            <Pagination
              currentPage={currentPage}
              totalItems={total}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
            />
          )}
        </>
      )}
    </ModelListPageLayout>
  );
}
