"use client";

import { useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { useModelList } from "@/hooks/use-model-list";
import { Pagination } from "@/components/ui";
import { ModelListPageLayout } from "@/components/layout/model-list-page-layout";
import { capitalize } from "@/lib/string-utils";

type User = {
  _id: string;
  discordId: string;
  username?: string;
  serverDisplayName?: string;
  avatarUrl?: string;
  tokens?: number;
  status?: "active" | "inactive" | string;
  characterCount?: number;
  characterSlot?: number;
  leveling?: {
    level?: number;
    xp?: number;
  };
  quests?: {
    bot?: { completed?: number; pending?: number };
    legacy?: { completed?: number; pending?: number };
    typeTotals?: {
      art?: number;
      writing?: number;
      interactive?: number;
      rp?: number;
      artWriting?: number;
      other?: number;
    };
  };
  helpWanted?: {
    totalCompletions?: number;
    currentCompletions?: number;
    lastCompletion?: string | null;
    cooldownUntil?: string | Date | null;
  };
  [key: string]: unknown;
};

function formatInt(n: unknown): string {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v)) return "0";
  return Math.round(v).toLocaleString("en-US");
}

function StatTile({
  label,
  value,
  icon,
  accentClass,
}: {
  label: string;
  value: string;
  icon: string;
  accentClass: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/70 to-[var(--totk-brown)]/35 p-3 shadow-inner">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
          {label}
        </div>
        <i aria-hidden className={`fa-solid ${icon} text-xs ${accentClass}`} />
      </div>
      <div className={`mt-1 text-lg font-extrabold tabular-nums ${accentClass}`}>
        {value}
      </div>
    </div>
  );
}

function SectionStat({
  label,
  value,
  icon,
  valueClass,
}: {
  label: string;
  value: string;
  icon: string;
  valueClass: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/35 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--totk-grey-200)]">
          <i aria-hidden className={`fa-solid ${icon} text-[10px]`} />
          {label}
        </div>
        <div className={`text-sm font-extrabold tabular-nums ${valueClass}`}>
          {value}
        </div>
      </div>
    </div>
  );
}

function statusPillClass(status: string | undefined): string {
  const s = String(status ?? "").toLowerCase();
  if (s === "active") {
    return "border-[var(--totk-light-green)]/35 bg-[var(--totk-light-green)]/15 text-[var(--totk-light-green)]";
  }
  if (s === "inactive") {
    return "border-[var(--totk-grey-200)]/40 bg-[var(--totk-grey-200)]/15 text-[var(--totk-grey-200)]";
  }
  return "border-[var(--totk-dark-ocher)]/50 bg-[var(--totk-brown)]/20 text-[var(--botw-pale)]";
}

function formatDateTimeShort(value: unknown): string {
  if (!value) return "—";
  const d =
    value instanceof Date
      ? value
      : typeof value === "string"
        ? new Date(value)
        : new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UsersPage() {
  const pathname = usePathname();
  const {
    data: users,
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
  } = useModelList<User>("users");

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
      title="Users"
      loadingMessage="Loading users..."
      errorMessage="This page will display all users from the database once MongoDB connection is configured."
      itemName="users"
      searchPlaceholder="Search users by Discord ID or username..."
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
      currentCount={users.length}
      onPageChange={setCurrentPage}
    >
      {users.length === 0 ? (
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
          <p className="text-center text-[var(--botw-pale)]">No users found.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:gap-6 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
            {users.map((u) => {
              const status = u.status ? capitalize(String(u.status)) : "Unknown";
              const level = u.leveling?.level ?? 0;
              const xp = u.leveling?.xp ?? 0;
              const questsCompleted = u.quests?.bot?.completed ?? (u.quests as { totalCompleted?: number })?.totalCompleted ?? 0;
              const pendingTurnIns = u.quests?.bot?.pending ?? (u.quests as { pendingTurnIns?: number })?.pendingTurnIns ?? 0;
              const legacyTransferred = u.quests?.legacy?.completed ?? (u.quests?.legacy as { totalTransferred?: number })?.totalTransferred ?? 0;
              const legacyPending = u.quests?.legacy?.pending ?? (u.quests?.legacy as { pendingTurnIns?: number })?.pendingTurnIns ?? 0;
              const allTimeQuests = questsCompleted + legacyTransferred;
              const totalPending = pendingTurnIns + legacyPending;
              const helpWantedTotal = u.helpWanted?.totalCompletions ?? 0;
              const helpWantedCurrent = u.helpWanted?.currentCompletions ?? 0;
              const ownedCharacters = u.characterCount ?? 0;
              const displayName =
                u.serverDisplayName?.trim() || u.username?.trim() || "Unknown user";
              return (
                <div
                  key={u._id}
                  className="group relative overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/35 via-[var(--botw-warm-black)]/60 to-[var(--totk-brown)]/30 p-5 shadow-lg transition-all duration-300 hover:border-[var(--totk-light-ocher)]/60 hover:shadow-xl"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex flex-1 items-center gap-3">
                      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/40 shadow-inner">
                        <img
                          src={u.avatarUrl?.trim() ? u.avatarUrl : "/ankle_icon.png"}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src =
                              "/ankle_icon.png";
                          }}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="truncate text-lg font-extrabold text-[var(--totk-light-green)] drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
                            {displayName}
                          </h2>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${statusPillClass(
                              u.status
                            )}`}
                          >
                            <i
                              aria-hidden
                              className={`fa-solid ${
                                String(u.status ?? "")
                                  .toLowerCase()
                                  .trim() === "inactive"
                                  ? "fa-moon"
                                  : "fa-sparkles"
                              } text-[10px]`}
                            />
                            {status}
                          </span>
                          {typeof u.characterSlot === "number" && (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/30 px-2.5 py-1 text-[11px] font-semibold text-[var(--totk-grey-200)]">
                              <i
                                aria-hidden
                                className="fa-solid fa-id-card text-[10px]"
                              />
                              slots {formatInt(u.characterSlot)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Primary stats */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <StatTile
                      label="Tokens"
                      value={formatInt(u.tokens ?? 0)}
                      icon="fa-coins"
                      accentClass="text-[var(--totk-light-ocher)]"
                    />
                    <StatTile
                      label="Level"
                      value={formatInt(level)}
                      icon="fa-chart-line"
                      accentClass="text-[var(--botw-blue)]"
                    />
                    <StatTile
                      label="XP"
                      value={formatInt(xp)}
                      icon="fa-bolt"
                      accentClass="text-[var(--botw-pale)]"
                    />
                    <StatTile
                      label="Characters"
                      value={formatInt(ownedCharacters)}
                      icon="fa-users"
                      accentClass="text-[var(--totk-light-green)]"
                    />
                  </div>

                  {/* Quest summary */}
                  <div className="mt-4 rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/55 to-[var(--totk-brown)]/25 p-3 shadow-inner">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <i
                          aria-hidden
                          className="fa-solid fa-scroll text-xs text-[var(--totk-light-ocher)]"
                        />
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                          Quests
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-[var(--totk-grey-200)]">
                        all-time{" "}
                        <span className="text-[var(--botw-pale)]">
                          {formatInt(allTimeQuests)}
                        </span>{" "}
                        • pending{" "}
                        <span className="text-[var(--totk-light-green)]">
                          {formatInt(totalPending)}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <SectionStat
                        label="Completed"
                        value={formatInt(questsCompleted)}
                        icon="fa-check"
                        valueClass="text-[var(--botw-pale)]"
                      />
                      <SectionStat
                        label="Pending"
                        value={formatInt(totalPending)}
                        icon="fa-ticket"
                        valueClass="text-[var(--totk-light-green)]"
                      />
                      <SectionStat
                        label="Legacy"
                        value={formatInt(legacyTransferred)}
                        icon="fa-box-archive"
                        valueClass="text-[var(--totk-light-ocher)]"
                      />
                    </div>

                    {(pendingTurnIns > 0 || legacyPending > 0) && (
                      <div className="mt-2 text-xs font-semibold text-[var(--totk-grey-200)]">
                        current pending{" "}
                        <span className="text-[var(--totk-light-green)] tabular-nums">
                          {formatInt(pendingTurnIns)}
                        </span>{" "}
                        • legacy pending{" "}
                        <span className="text-[var(--totk-grey-200)] tabular-nums">
                          {formatInt(legacyPending)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Help Wanted */}
                  <div className="mt-4 rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-gradient-to-br from-[var(--botw-warm-black)]/55 to-[var(--totk-brown)]/25 p-3 shadow-inner">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <i
                          aria-hidden
                          className="fa-solid fa-briefcase text-xs text-[var(--botw-blue)]"
                        />
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
                          Help Wanted
                        </div>
                      </div>
                      <div className="text-xs font-semibold text-[var(--totk-grey-200)]">
                        total{" "}
                        <span className="text-[var(--botw-pale)]">
                          {formatInt(helpWantedTotal)}
                        </span>{" "}
                        • current{" "}
                        <span className="text-[var(--totk-light-green)]">
                          {formatInt(helpWantedCurrent)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/35 px-3 py-2">
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--totk-grey-200)]">
                          <i aria-hidden className="fa-solid fa-calendar-check text-[10px]" />
                          Last completion
                        </div>
                        <div className="mt-1 font-extrabold text-[var(--botw-pale)] tabular-nums">
                          {u.helpWanted?.lastCompletion ?? "—"}
                        </div>
                      </div>
                      <div className="rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/35 px-3 py-2">
                        <div className="flex items-center gap-2 text-[11px] font-semibold text-[var(--totk-grey-200)]">
                          <i aria-hidden className="fa-solid fa-hourglass-half text-[10px]" />
                          Cooldown until
                        </div>
                        <div className="mt-1 font-extrabold text-[var(--botw-pale)] tabular-nums">
                          {formatDateTimeShort(u.helpWanted?.cooldownUntil)}
                        </div>
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

