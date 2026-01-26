"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useModelList } from "@/hooks/use-model-list";
import { ModelListPageLayout } from "@/components/layout/model-list-page-layout";
import { StarterGearCard, type StarterGearItem } from "@/components/features/items/StarterGearCard";

type Item = StarterGearItem & {
  [key: string]: unknown;
};

export default function StarterGearPage() {
  const pathname = usePathname();
  const {
    data: items,
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
  } = useModelList<Item>("items", {
    apiPath: "/api/models/starter-gear",
  });

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
      title="Starter Gear"
      loadingMessage="Loading starter gear..."
      errorMessage="This page will display all starter gear items from the database once MongoDB connection is configured."
      itemName="starter gear items"
      searchPlaceholder="Search starter gear by name..."
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
      {items.length === 0 ? (
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
          <p className="text-center text-[var(--botw-pale)]">No starter gear items found.</p>
        </div>
      ) : (
        <div className="mb-6 grid gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
          {items.map((item) => (
            <StarterGearCard key={item._id} item={item} />
          ))}
        </div>
      )}
    </ModelListPageLayout>
  );
}
