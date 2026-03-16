"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useModelList } from "@/hooks/use-model-list";
import { ModelListPageLayout } from "@/components/layout/model-list-page-layout";
import { MapSquareCard, type MapSquare } from "@/components/features/maps/MapSquareCard";
import { Pagination } from "@/components/ui";

export default function MapsPage() {
  const pathname = usePathname();
  const {
    data: squares,
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
  } = useModelList<MapSquare>("maps");

  const scrollToTop = useCallback(() => {
    const mainElement = document.querySelector("main");
    window.scrollTo({ top: 0, behavior: "instant" });
    mainElement?.scrollTo({ top: 0, behavior: "instant" });
    document.documentElement.scrollTo({ top: 0, behavior: "instant" });
    setTimeout(() => {
      const mainEl = document.querySelector("main");
      if (window.scrollY > 0 || (mainEl?.scrollTop ?? 0) > 0) {
        window.scrollTo({ top: 0, behavior: "instant" });
        mainEl?.scrollTo({ top: 0, behavior: "instant" });
        document.documentElement.scrollTo({ top: 0, behavior: "instant" });
      }
    }, 50);
  }, []);

  useEffect(() => {
    scrollToTop();
  }, [pathname, scrollToTop]);

  useEffect(() => {
    scrollToTop();
  }, [currentPage, scrollToTop]);

  useEffect(() => {
    scrollToTop();
  }, [search, scrollToTop]);

  return (
    <ModelListPageLayout
      title="Map squares"
      loadingMessage="Loading map squares..."
      errorMessage="This page will display all map squares and quadrants once the database is configured."
      itemName="map squares"
      searchPlaceholder="Search by square (e.g. A1, B2) or region..."
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
      {squares.length === 0 ? (
        <div className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-b from-[var(--botw-warm-black)] to-[var(--totk-brown)]/20 p-8 text-center shadow-inner">
          <i className="fas fa-map text-4xl text-[var(--totk-dark-ocher)]/60 mb-3" aria-hidden />
          <p className="text-[var(--botw-pale)] font-medium">No map squares found.</p>
          <p className="text-sm text-[var(--totk-grey-200)] mt-1">Try adjusting search or filters.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-6 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 items-start">
            {squares.map((square) => (
              <MapSquareCard key={square._id} square={square} showMapDetails={false} />
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
