"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useModelList } from "@/hooks/use-model-list";
import { Pagination } from "@/components/ui";
import { ModelListPageLayout } from "@/components/layout/model-list-page-layout";
import { capitalize } from "@/lib/string-utils";

// ------------------- Types -------------------
type MaterialsProgressItem = {
  material: string;
  donated: number;
  required: number;
  remaining: number;
};

type TokenProgress = {
  current: number;
  required: number;
  remaining: number;
};

type ContributorEnriched = {
  characterId: string;
  characterName: string;
  items: Record<string, number>;
  tokens: number;
  totalItems: number;
};

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
  materials?: Record<string, unknown>;
  contributors?: ContributorEnriched[];
  tokenRequirements?: Record<string, number>;
  materialsProgress?: MaterialsProgressItem[];
  tokenProgress?: TokenProgress;
  raidQuotaCount?: number;
  raidQuotaPeriodStart?: string | null;
  raidQuotaPeriodType?: string | null;
  lastQuotaRaidTime?: string | null;
  levelHealth?: Record<string, number>;
  lastDamageTime?: string | null;
  cooldowns?: Record<string, unknown>;
  [key: string]: unknown;
};

// ------------------- Helpers -------------------
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

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
          <div className="mb-6 grid gap-4 sm:grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            {villages.map((village) => {
              const maxHealth = village.level != null && village.levelHealth?.[String(village.level)]
                ? village.levelHealth[String(village.level)]
                : village.health;
              return (
                <div
                  key={village._id}
                  className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--totk-brown)]/30 p-4"
                  style={
                    village.color
                      ? { borderLeftColor: village.color as string, borderLeftWidth: "4px" }
                      : undefined
                  }
                >
                  {/* ------------------- Header ------------------- */}
                  <div className="flex items-center gap-2 border-b border-[var(--totk-dark-ocher)]/60 pb-2">
                    {village.emoji && <span className="text-xl">{String(village.emoji)}</span>}
                    <h2 className="text-lg font-semibold text-[var(--totk-light-ocher)]">{village.name}</h2>
                  </div>
                  <div className="mt-3 space-y-3 text-sm text-[var(--botw-pale)]">
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
                          {capitalize(String(village.status))}
                        </span>
                      </div>
                    )}
                    {/* ------------------- Health ------------------- */}
                    {village.health != null && (
                      <div className="flex justify-between">
                        <span className="font-medium">Health:</span>
                        <span className="text-[var(--totk-light-ocher)]">
                          {village.health}{maxHealth != null ? ` / ${maxHealth}` : ""}
                        </span>
                      </div>
                    )}
                    {village.lastDamageTime && (
                      <div className="flex justify-between text-xs text-[var(--totk-grey-200)]">
                        <span className="font-medium">Last Damage:</span>
                        <span>{formatDate(village.lastDamageTime)}</span>
                      </div>
                    )}
                    {/* ------------------- Materials ------------------- */}
                    {village.materialsProgress && village.materialsProgress.length > 0 && (
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50 p-2">
                        <div className="mb-2 font-medium text-[var(--totk-light-ocher)]">
                          Materials{village.level != null && village.level < 3 ? ` (Level ${village.level + 1})` : ""}
                        </div>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {village.materialsProgress.map((m) => (
                            <div key={m.material} className="flex justify-between text-xs">
                              <span className="truncate">{m.material}</span>
                              <span className="shrink-0 text-[var(--totk-light-ocher)]">{m.donated}/{m.required}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* ------------------- Tokens ------------------- */}
                    {village.tokenProgress && village.tokenProgress.required > 0 && (
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50 p-2">
                        <div className="flex justify-between font-medium">
                          <span>Tokens</span>
                          <span className="text-[var(--botw-blue)]">
                            {village.tokenProgress.current} / {village.tokenProgress.required}
                          </span>
                        </div>
                        {village.tokenProgress.remaining > 0 && (
                          <div className="text-xs text-[var(--totk-grey-200)] mt-0.5">
                            {village.tokenProgress.remaining} remaining
                          </div>
                        )}
                      </div>
                    )}
                    {/* ------------------- Contributors ------------------- */}
                    {village.contributors && village.contributors.length > 0 && (
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50 p-2">
                        <div className="mb-2 font-medium text-[var(--totk-light-ocher)]">Contributors</div>
                        <div className="space-y-1 text-xs max-h-24 overflow-y-auto">
                          {village.contributors.slice(0, 10).map((c) => (
                            <div key={c.characterId} className="flex justify-between">
                              <span className="truncate">{c.characterName}</span>
                              <span className="shrink-0 text-[var(--totk-grey-200)]">
                                {c.totalItems} items, {c.tokens} tokens
                              </span>
                            </div>
                          ))}
                          {village.contributors.length > 10 && (
                            <div className="text-[var(--totk-grey-200)]">+{village.contributors.length - 10} more</div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* ------------------- Raid Quota ------------------- */}
                    {(village.raidQuotaPeriodType || village.raidQuotaCount != null) && (
                      <div className="space-y-1 text-xs">
                        {village.raidQuotaPeriodType && (
                          <div className="flex justify-between">
                            <span className="font-medium">Raid Period:</span>
                            <span>{capitalize(village.raidQuotaPeriodType)}</span>
                          </div>
                        )}
                        {village.raidQuotaCount != null && (
                          <div className="flex justify-between">
                            <span className="font-medium">Raid Count:</span>
                            <span>{village.raidQuotaCount}</span>
                          </div>
                        )}
                        {village.raidQuotaPeriodStart && (
                          <div className="flex justify-between">
                            <span className="font-medium">Period Start:</span>
                            <span>{formatDate(village.raidQuotaPeriodStart)}</span>
                          </div>
                        )}
                        {village.lastQuotaRaidTime && (
                          <div className="flex justify-between">
                            <span className="font-medium">Last Raid:</span>
                            <span>{formatDate(village.lastQuotaRaidTime)}</span>
                          </div>
                        )}
                      </div>
                    )}
                    {/* ------------------- Vending ------------------- */}
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
                    {/* ------------------- Cooldowns ------------------- */}
                    {village.cooldowns && Object.keys(village.cooldowns).length > 0 && (
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/50 p-2">
                        <div className="mb-2 font-medium text-[var(--totk-light-ocher)]">Cooldowns</div>
                        <div className="space-y-1 text-xs">
                          {Object.entries(village.cooldowns).map(([key, val]) => (
                            <div key={key} className="flex justify-between">
                              <span>{key}</span>
                              <span>{typeof val === "string" ? formatDate(val) : String(val)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
