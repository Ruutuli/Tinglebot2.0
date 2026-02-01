"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useModelList } from "@/hooks/use-model-list";
import { Loading, Pagination } from "@/components/ui";
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

function getVillageBannerSrc(name: string, level?: number): string {
  const safeName = String(name || "").replace(/[^a-zA-Z]/g, "");
  const lvl = Math.min(3, Math.max(1, level ?? 1));
  const filename = `${safeName}${lvl}.png`;
  return `/assets/banners/${filename}`;
}

function ProgressBar({ value, max, colorClass = "bg-[var(--totk-light-green)]" }: { value: number; max: number; colorClass?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--totk-dark-ocher)]/50">
      <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function VillagesPage() {
  const pathname = usePathname();
  const {
    data: villages,
    total,
    loading,
    error,
    currentPage,
    setCurrentPage,
    itemsPerPage,
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

  useEffect(() => {
    scrollToTop();
  }, [currentPage, scrollToTop]);

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[90rem]">
        <div className="mb-4 sm:mb-6 flex items-center justify-center gap-2 sm:gap-4">
          <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" />
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[var(--totk-light-ocher)]">Villages</h1>
          <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" />
        </div>
        {loading ? (
          <Loading message="Loading villages..." variant="inline" size="lg" />
        ) : error ? (
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
            <p className="text-[var(--botw-pale)]">{error}</p>
            <p className="mt-2 text-sm text-[var(--totk-grey-200)]">
              This page will display all villages from the database once MongoDB connection is configured.
            </p>
          </div>
        ) : villages.length === 0 ? (
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
              const bannerSrc = getVillageBannerSrc(village.name, village.level);
              const borderColor = village.color ?? "var(--totk-dark-ocher)";
              return (
                <div
                  key={village._id}
                  className="overflow-hidden rounded-xl border-2 shadow-lg"
                  style={{ borderColor, backgroundColor: "var(--botw-warm-black)" }}
                >
                  {/* ------------------- Banner Header ------------------- */}
                  <div className="relative h-24 w-full overflow-hidden bg-[var(--totk-brown)]">
                    <img
                      src={bannerSrc}
                      alt=""
                      className="h-full w-full object-cover object-center"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                    <div
                      className="absolute inset-0 flex items-center justify-center bg-black/40"
                      style={{ borderBottom: `2px solid ${borderColor}` }}
                    >
                      <h2 className="text-xl font-bold text-[var(--totk-ivory)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                        {village.name}
                      </h2>
                    </div>
                  </div>
                  <div className="space-y-4 p-4 text-sm text-[var(--botw-pale)]">
                    <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-3 shadow-inner">
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="font-medium">Region</span>
                          <span>{village.region}</span>
                        </div>
                        {village.level != null && (
                          <div className="flex justify-between">
                            <span className="font-medium">Level</span>
                            <span className="text-[var(--totk-light-ocher)]">{village.level}</span>
                          </div>
                        )}
                        {village.status != null && (
                          <div className="flex justify-between">
                            <span className="font-medium">Status</span>
                            <span
                              className={
                                village.status === "max"
                                  ? "font-semibold text-[var(--totk-light-green)]"
                                  : village.status === "damaged"
                                    ? "font-semibold text-[var(--gold)]"
                                    : "font-semibold text-[var(--totk-light-ocher)]"
                              }
                            >
                              {capitalize(String(village.status))}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* ------------------- Health ------------------- */}
                    {village.health != null && (
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-3 shadow-inner">
                        <div className="mb-2 flex justify-between font-semibold">
                          <span className="text-[var(--totk-light-ocher)]">Health</span>
                          <span className="text-[var(--totk-light-green)]">
                            {village.health}{maxHealth != null ? ` / ${maxHealth}` : ""}
                          </span>
                        </div>
                        {maxHealth != null && maxHealth > 0 && (
                          <ProgressBar value={village.health} max={maxHealth} colorClass="bg-[var(--totk-light-green)]" />
                        )}
                        {village.lastDamageTime && (
                          <div className="mt-2 flex justify-between text-xs text-[var(--totk-grey-200)]">
                            <span className="font-medium">Last Damage</span>
                            <span>{formatDate(village.lastDamageTime)}</span>
                          </div>
                        )}
                        {village.status === "damaged" && maxHealth != null && village.health != null && village.health < maxHealth && (
                          <div className="mt-2 rounded border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-2 py-1.5 text-xs font-medium text-[var(--gold)]">
                            {(maxHealth - village.health) * 100} tokens until 100% HP
                          </div>
                        )}
                      </div>
                    )}
                    {/* ------------------- Materials ------------------- */}
                    {village.materialsProgress && village.materialsProgress.length > 0 && (
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-3 shadow-inner">
                        <div className="mb-3 font-semibold text-[var(--totk-light-ocher)]">
                          Materials{village.level != null && village.level < 3 ? ` (Level ${village.level + 1})` : ""}
                        </div>
                        <div className="scrollbar-hide max-h-40 space-y-2.5 overflow-y-auto">
                          {village.materialsProgress.map((m) => (
                            <div key={m.material}>
                              <div className="mb-0.5 flex justify-between text-xs">
                                <span className="truncate text-[var(--botw-pale)]">{m.material}</span>
                                <span className="shrink-0 font-medium text-[var(--totk-light-ocher)]">
                                  {m.donated} / {m.required}
                                </span>
                              </div>
                              <ProgressBar value={m.donated} max={m.required} colorClass="bg-[var(--totk-light-ocher)]" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* ------------------- Tokens ------------------- */}
                    {village.tokenProgress && village.tokenProgress.required > 0 && (
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-3 shadow-inner">
                        <div className="mb-2 flex justify-between font-semibold">
                          <span className="text-[var(--totk-light-ocher)]">Tokens</span>
                          <span className="text-[var(--botw-blue)]">
                            {village.tokenProgress.current.toLocaleString()} / {village.tokenProgress.required.toLocaleString()}
                          </span>
                        </div>
                        <ProgressBar value={village.tokenProgress.current} max={village.tokenProgress.required} colorClass="bg-[var(--botw-blue)]" />
                        {village.tokenProgress.remaining > 0 && (
                          <div className="mt-1.5 text-xs text-[var(--totk-grey-200)]">
                            {village.tokenProgress.remaining.toLocaleString()} remaining
                          </div>
                        )}
                      </div>
                    )}
                    {/* ------------------- Contributors ------------------- */}
                    {village.contributors && village.contributors.length > 0 && (
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-3 shadow-inner">
                        <div className="mb-2 font-semibold text-[var(--totk-light-ocher)]">Contributors</div>
                        <div className="scrollbar-hide max-h-24 space-y-1.5 overflow-y-auto text-xs">
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
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-3 shadow-inner">
                        <div className="mb-2 font-semibold text-[var(--totk-light-ocher)]">Raid Quota</div>
                        <div className="space-y-1.5 text-xs">
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
                      </div>
                    )}
                    {/* ------------------- Vending ------------------- */}
                    {(village.vendingTier != null || (typeof village.vendingDiscount === "number" && village.vendingDiscount > 0)) && (
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-3 shadow-inner">
                        <div className="mb-2 font-semibold text-[var(--totk-light-ocher)]">Vending</div>
                        <div className="space-y-1.5 text-xs">
                          {village.vendingTier != null && (
                            <div className="flex justify-between">
                              <span className="font-medium">Tier:</span>
                              <span>{village.vendingTier}</span>
                            </div>
                          )}
                          {typeof village.vendingDiscount === "number" && village.vendingDiscount > 0 && (
                            <div className="flex justify-between">
                              <span className="font-medium">Discount:</span>
                              <span className="text-[var(--totk-light-ocher)]">{village.vendingDiscount}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    {/* ------------------- Cooldowns ------------------- */}
                    {village.cooldowns && Object.keys(village.cooldowns).length > 0 && (
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)]/40 p-3 shadow-inner">
                        <div className="mb-2 font-semibold text-[var(--totk-light-ocher)]">Cooldowns</div>
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
      </div>
    </div>
  );
}
