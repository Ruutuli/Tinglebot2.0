"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useModelList } from "@/hooks/use-model-list";
import { Pagination } from "@/components/ui";
import { ModelListPageLayout } from "@/components/layout/model-list-page-layout";
import { capitalize } from "@/lib/string-utils";
import { imageUrlForGcsUrl } from "@/lib/image-url";

type Pet = {
  _id: string;
  name: string;
  species: string;
  petType: string;
  level: number;
  ownerName: string;
  owner?: {
    _id: string;
    name: string;
    icon?: string;
  };
  status: "active" | "stored" | "retired" | "for_sale";
  rollsRemaining: number;
  rollCombination: string[];
  imageUrl?: string;
  [key: string]: unknown;
};

export default function PetsPage() {
  const pathname = usePathname();
  const {
    data: pets,
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
  } = useModelList<Pet>("pets");

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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-gradient-to-br from-[var(--totk-light-green)]/25 to-[var(--totk-light-green)]/15 text-[var(--totk-light-green)] border-[var(--totk-light-green)]/30 shadow-[0_0_8px_rgba(73,213,156,0.3)]";
      case "stored":
        return "bg-gradient-to-br from-[var(--botw-blue)]/25 to-[var(--botw-blue)]/15 text-[var(--botw-blue)] border-[var(--botw-blue)]/30 shadow-[0_0_8px_rgba(0,163,218,0.3)]";
      case "retired":
        return "bg-gradient-to-br from-[var(--totk-grey-200)]/25 to-[var(--totk-grey-200)]/15 text-[var(--totk-grey-200)] border-[var(--totk-grey-200)]/30 shadow-[0_0_8px_rgba(136,136,136,0.2)]";
      case "for_sale":
        return "bg-gradient-to-br from-[var(--totk-light-ocher)]/25 to-[var(--totk-light-ocher)]/15 text-[var(--totk-light-ocher)] border-[var(--totk-light-ocher)]/30 shadow-[0_0_8px_rgba(229,220,183,0.3)]";
      default:
        return "bg-gradient-to-br from-[var(--totk-grey-200)]/25 to-[var(--totk-grey-200)]/15 text-[var(--totk-grey-200)] border-[var(--totk-grey-200)]/30 shadow-[0_0_8px_rgba(136,136,136,0.2)]";
    }
  };

  return (
    <ModelListPageLayout
      title="Pets"
      loadingMessage="Loading pets..."
      errorMessage="This page will display all pets from the database once MongoDB connection is configured."
      itemName="pets"
      searchPlaceholder="Search pets by name, owner, species, or type..."
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
      {pets.length === 0 ? (
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4 sm:p-6 shadow-lg">
          <p className="text-center text-sm sm:text-base text-[var(--botw-pale)]">No pets found.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {pets.map((pet) => (
              <div
                key={pet._id}
                className="pet-card group relative overflow-hidden rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/40 via-[var(--botw-warm-black)]/50 to-[var(--totk-brown)]/40 p-6 shadow-lg transition-all duration-300 hover:border-[var(--totk-light-green)] hover:shadow-xl hover:shadow-[var(--totk-light-green)]/30 hover:-translate-y-1"
              >
                {/* Pet Image */}
                {pet.imageUrl && (
                  <div className="mb-3 sm:mb-4 flex justify-center">
                    <div className="relative h-24 w-24 sm:h-32 sm:w-32 overflow-hidden rounded-lg border-2 border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)] shadow-inner">
                      <Image
                        src={pet.imageUrl.startsWith("https://storage.googleapis.com/tinglebot/")
                          ? imageUrlForGcsUrl(pet.imageUrl)
                          : pet.imageUrl}
                        alt={pet.name}
                        fill
                        className="object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = "/ankle_icon.png";
                        }}
                        unoptimized
                      />
                    </div>
                  </div>
                )}
                
                {/* Header */}
                <div className="relative mb-4 flex items-start justify-between">
                  <div className="flex-1 pr-2">
                    <h2 className="text-2xl font-bold text-[var(--totk-light-green)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                      {pet.name}
                    </h2>
                    <p className="mt-1.5 text-sm font-medium text-[var(--botw-pale)] opacity-90">
                      {pet.species} <span className="text-[var(--totk-grey-200)]">•</span> {pet.petType}
                    </p>
                  </div>
                  <span
                    className={`ml-2 shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide shadow-md transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg ${getStatusColor(pet.status)}`}
                  >
                    {capitalize(pet.status)}
                  </span>
                </div>

                {/* Owner Section */}
                <div className="mb-3 sm:mb-4 rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/70 to-[var(--totk-brown)]/40 p-3 sm:p-4 shadow-inner transition-all duration-300 group-hover:border-[var(--totk-light-green)]/40 group-hover:bg-gradient-to-br group-hover:from-[var(--botw-warm-black)]/80 group-hover:to-[var(--totk-brown)]/50">
                  <div className="flex items-center gap-2 sm:gap-3">
                    {pet.owner?._id ? (
                      <Link 
                        href={`/characters/${pet.owner._id}`}
                        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--totk-light-ocher)]/40 bg-gradient-to-br from-[var(--totk-light-ocher)]/20 to-[var(--totk-brown)]/30 transition-all duration-200 hover:border-[var(--totk-light-ocher)]/60 hover:scale-110 hover:shadow-lg hover:shadow-[var(--totk-light-ocher)]/30"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {pet.owner.icon ? (
                          <Image
                            src={pet.owner.icon}
                            alt={pet.owner.name}
                            width={40}
                            height={40}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.src = "/ankle_icon.png";
                            }}
                            unoptimized
                          />
                        ) : (
                          <i className="fas fa-user text-sm text-[var(--totk-light-ocher)]" aria-hidden="true"></i>
                        )}
                      </Link>
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--totk-light-ocher)]/40 bg-gradient-to-br from-[var(--totk-light-ocher)]/20 to-[var(--totk-brown)]/30">
                        <i className="fas fa-user text-sm text-[var(--totk-light-ocher)]" aria-hidden="true"></i>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="mb-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                        Owner
                      </p>
                      {pet.owner?._id ? (
                        <Link 
                          href={`/characters/${pet.owner._id}`}
                          className="text-sm sm:text-base font-bold text-[var(--totk-light-ocher)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] transition-colors hover:text-[var(--totk-light-green)] truncate block"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {pet.ownerName}
                        </Link>
                      ) : (
                        <p className="text-sm sm:text-base font-bold text-[var(--totk-light-ocher)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] truncate">
                          {pet.ownerName}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/60 to-[var(--totk-brown)]/30 p-2.5 sm:p-3.5 shadow-inner transition-all duration-300 group-hover:border-[var(--totk-light-green)]/30 group-hover:bg-gradient-to-br group-hover:from-[var(--botw-warm-black)]/70 group-hover:to-[var(--totk-brown)]/40">
                    <p className="mb-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                      Level
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-[var(--totk-light-green)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                      {pet.level}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/60 to-[var(--totk-brown)]/30 p-2.5 sm:p-3.5 shadow-inner transition-all duration-300 group-hover:border-[var(--botw-blue)]/30 group-hover:bg-gradient-to-br group-hover:from-[var(--botw-warm-black)]/70 group-hover:to-[var(--totk-brown)]/40">
                    <p className="mb-1 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                      Rolls Remaining
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-[var(--botw-blue)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                      {pet.rollsRemaining}
                    </p>
                  </div>
                </div>

                {/* Roll Combination */}
                {pet.rollCombination && pet.rollCombination.length > 0 && (
                  <div className="mt-4 rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/60 to-[var(--totk-brown)]/30 p-4 shadow-inner transition-all duration-300 group-hover:border-[var(--totk-light-ocher)]/30 group-hover:bg-gradient-to-br group-hover:from-[var(--botw-warm-black)]/70 group-hover:to-[var(--totk-brown)]/40">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                      Roll Combination
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {pet.rollCombination.map((roll, idx) => (
                        <span
                          key={idx}
                          className="rounded-md border border-[var(--totk-light-ocher)]/30 bg-gradient-to-br from-[var(--totk-light-ocher)]/25 to-[var(--totk-light-ocher)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--totk-light-ocher)] shadow-md transition-all duration-200 hover:border-[var(--totk-light-ocher)]/50 hover:bg-gradient-to-br hover:from-[var(--totk-light-ocher)]/35 hover:to-[var(--totk-light-ocher)]/25 hover:scale-105"
                        >
                          {roll}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
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
