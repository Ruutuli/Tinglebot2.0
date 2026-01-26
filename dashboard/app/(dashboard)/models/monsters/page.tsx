"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useModelList } from "@/hooks/use-model-list";
import { Pagination } from "@/components/ui";
import { ModelListPageLayout } from "@/components/layout/model-list-page-layout";

type Monster = {
  _id: string;
  name: string;
  nameMapping: string;
  image?: string;
  species: string;
  type: string;
  tier: number;
  hearts: number;
  dmg: number;
  bloodmoon: boolean;
  locations: string[];
  [key: string]: unknown;
};

export default function MonstersPage() {
  const pathname = usePathname();
  const {
    data: monsters,
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
  } = useModelList<Monster>("monsters");

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
      title="Monsters"
      loadingMessage="Loading monsters..."
      errorMessage="This page will display all monsters from the database once MongoDB connection is configured."
      itemName="monsters"
      searchPlaceholder="Search monsters by name, species, or type..."
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
      {monsters.length === 0 ? (
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
          <p className="text-center text-[var(--botw-pale)]">No monsters found.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {monsters.map((monster) => (
              <div
                key={monster._id}
                className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--totk-brown)]/30 p-4"
              >
                <h2 className="text-lg font-semibold text-[var(--totk-light-green)]">{monster.name}</h2>
                <div className="mt-3 space-y-2 text-sm text-[var(--botw-pale)]">
                  <div className="flex justify-between">
                    <span className="font-medium">Species:</span>
                    <span>{monster.species}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Type:</span>
                    <span>{monster.type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Tier:</span>
                    <span className="text-[var(--totk-light-ocher)]">{monster.tier}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Hearts:</span>
                    <span className="text-[var(--totk-light-green)]">{monster.hearts}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Damage:</span>
                    <span className="text-[var(--blight-border)]">{monster.dmg}</span>
                  </div>
                  {monster.bloodmoon && (
                    <div className="rounded bg-[var(--blight-border)]/30 px-2 py-1 text-center text-xs">
                      Blood Moon Monster
                    </div>
                  )}
                  {monster.locations && monster.locations.length > 0 && (
                    <div className="mt-2">
                      <span className="font-medium">Locations:</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {monster.locations.map((loc, idx) => (
                          <span
                            key={idx}
                            className="rounded bg-[var(--totk-dark-ocher)]/30 px-2 py-0.5 text-xs"
                          >
                            {loc}
                          </span>
                        ))}
                      </div>
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
