"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useModelList } from "@/hooks/use-model-list";
import { Pagination } from "@/components/ui";
import { ModelListPageLayout } from "@/components/layout/model-list-page-layout";
import { formatItemImageUrl, getMainCategory, getMainType } from "@/lib/item-utils";

type VillageShopItem = {
  _id: string;
  itemId: string;
  itemName: string;
  image?: string;
  imageType?: string;
  itemRarity: number;
  category: string[] | string;
  type: string[] | string;
  buyPrice: number;
  sellPrice: number;
  stock: number;
  crafting: boolean;
  gathering: boolean;
  looting: boolean;
  specialWeather: boolean;
  [key: string]: unknown;
};

export default function VillageShopsPage() {
  const pathname = usePathname();
  const {
    data: shopItems,
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
  } = useModelList<VillageShopItem>("village-shops");

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
      title="Village Shops"
      loadingMessage="Loading village shop items..."
      errorMessage="This page will display all village shop items from the database once MongoDB connection is configured."
      itemName="shop items"
      searchPlaceholder="Search shop items by name, category, or type..."
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
      {shopItems.length === 0 ? (
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
          <p className="text-center text-[var(--botw-pale)]">No village shop items found.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shopItems.filter((item) => item.stock > 0).map((item) => {
              const imageUrl = formatItemImageUrl(item.image);
              const mainCategory = getMainCategory(item);
              const mainType = getMainType(item);
              
              return (
                <div
                  key={item._id}
                  className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-3 sm:p-4 shadow-lg flex flex-col"
                >
                  {/* Image Section */}
                  <div className="flex justify-center mb-2 sm:mb-3">
                    <div className="relative">
                      <img
                        src={imageUrl}
                        alt={item.itemName}
                        className="h-20 w-20 sm:h-24 sm:w-24 rounded border-2 border-[var(--totk-dark-ocher)] object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "/ankle_icon.png";
                        }}
                      />
                      {item.imageType && item.imageType !== "No Image Type" && (
                        <div className="absolute -top-1 -right-1 bg-[var(--botw-warm-black)] rounded-full p-0.5 border border-[var(--totk-dark-ocher)]">
                          <img
                            src={item.imageType}
                            alt="Type Icon"
                            width={20}
                            height={20}
                            className="flex-shrink-0"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Name */}
                  <h2 className="text-center text-sm sm:text-base font-semibold text-[var(--totk-light-green)] mb-2 sm:mb-3 line-clamp-2">
                    {item.itemName}
                  </h2>
                  
                  {/* Details Grid */}
                  <div className="space-y-1.5 sm:space-y-2 mb-2 sm:mb-3 flex-1">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <div className="flex items-center gap-2 text-[var(--botw-pale)]">
                        <i className="fa-solid fa-box text-[var(--totk-light-ocher)]" />
                        <span className="font-medium">Material:</span>
                      </div>
                      <span className="text-[var(--botw-pale)]">{mainCategory}</span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-[var(--botw-pale)]">
                        <i className="fa-solid fa-gem text-[var(--botw-blue)]" />
                        <span className="font-medium">Ore:</span>
                      </div>
                      <span className="text-[var(--botw-pale)]">{mainType}</span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-[var(--botw-pale)]">
                        <i className="fa-solid fa-coins text-[var(--totk-light-green)]" />
                        <span className="font-medium">Buy:</span>
                      </div>
                      <span className="text-[var(--totk-light-green)] font-semibold">{item.buyPrice}</span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-[var(--botw-pale)]">
                        <i className="fa-solid fa-coins text-[var(--totk-light-green)]" />
                        <span className="font-medium">Sell:</span>
                      </div>
                      <span className="text-[var(--totk-light-green)] font-semibold">{item.sellPrice}</span>
                    </div>
                  </div>
                  
                  {/* Stock Badge */}
                  <div className="mt-auto pt-2 sm:pt-3 border-t border-[var(--totk-dark-ocher)]/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 sm:gap-1.5 text-xs text-[var(--botw-pale)]">
                        <i className="fa-solid fa-warehouse" />
                        <span className="font-medium">Stock:</span>
                      </div>
                      <div
                        className={`text-xl sm:text-2xl font-bold ${
                          item.stock > 0 ? "text-[var(--totk-light-green)]" : "text-[var(--blight-border)]"
                        }`}
                      >
                        {item.stock}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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
