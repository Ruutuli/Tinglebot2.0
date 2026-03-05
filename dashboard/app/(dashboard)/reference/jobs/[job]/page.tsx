"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loading } from "@/components/ui";

type GatherableItem = {
  _id: string;
  itemName: string;
  emoji?: string;
  image?: string;
  category?: string | string[];
  itemRarity?: number;
};

type MonsterSummary = {
  _id: string;
  name: string;
  image?: string;
};

type JobDetail = {
  job: {
    name: string;
    slug: string;
    perk: string;
    description: string;
    villages: string[];
    exclusive: boolean;
  };
  gatherableByVillage: Record<string, GatherableItem[]>;
  gatherableByRegion: Record<string, GatherableItem[]>;
  craftableItems?: GatherableItem[];
  monstersByRegion?: Record<string, MonsterSummary[]>;
};

const REGION_TABS = [
  { value: "Eldin", label: "Eldin", icon: "fa-fire" },
  { value: "Lanayru", label: "Lanayru", icon: "fa-droplet" },
  { value: "Faron", label: "Faron", icon: "fa-tree" },
  { value: "Central Hyrule", label: "Central Hyrule", icon: "fa-map-location-dot" },
  { value: "Gerudo", label: "Gerudo", icon: "fa-sun" },
  { value: "Hebra", label: "Hebra", icon: "fa-snowflake" },
  { value: "Path of Scarlet Leaves", label: "Path of Scarlet Leaves", icon: "fa-leaf" },
  { value: "Leaf Dew Way", label: "Leaf Dew Way", icon: "fa-road" },
];

/** Region colors matching globals.css location-* classes (Eldin=red, Gerudo=orange, etc.) */
const REGION_COLORS: Record<string, string> = {
  "Central Hyrule": "#17a2b8",
  Eldin: "#d9534f",
  Faron: "#5cb85c",
  Gerudo: "#f0ad4e",
  Hebra: "#b39ddb",
  Lanayru: "#337ab7",
  "Path of Scarlet Leaves": "#a259e6",
  "Leaf Dew Way": "#20cfcf",
};

/** Village badge colors (Rudania=red, Inariko=blue, Vhintl=green) */
const VILLAGE_BADGE_CLASSES: Record<string, string> = {
  Rudania: "border-red-500/50 bg-red-500/15 text-red-200",
  Inariko: "border-blue-500/50 bg-blue-500/15 text-blue-200",
  Vhintl: "border-green-500/50 bg-green-500/15 text-green-200",
};

/** Perk display name for badge */
function getPerkLabel(perk: string): string {
  if (perk === "N/A" || perk === "NONE") return "None";
  return perk;
}

export default function ReferenceJobDetailPage() {
  const params = useParams();
  const slug = typeof params.job === "string" ? params.job : "";
  const [data, setData] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeRegion, setActiveRegion] = useState<string>(REGION_TABS[0].value);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      setError("Missing job");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/reference/jobs/${encodeURIComponent(slug)}`)
      .then((res) => {
        if (res.status === 404) throw new Error("Job not found");
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((d: JobDetail) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load job");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[90rem]">
          <Loading message="Loading job..." variant="inline" size="lg" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-[90rem]">
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
            <p className="text-[var(--botw-pale)]">{error ?? "Job not found."}</p>
            <Link
              href="/reference/jobs"
              className="mt-4 inline-flex items-center gap-2 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--totk-brown)]/30 px-4 py-2 text-sm font-semibold text-[var(--totk-light-ocher)] transition-colors hover:border-[var(--totk-light-ocher)] hover:bg-[var(--totk-brown)]/50 hover:text-[var(--totk-ivory)]"
            >
              <i className="fa-solid fa-arrow-left text-xs" aria-hidden />
              Back to Jobs
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { job } = data;
  const perkLabel = getPerkLabel(job.perk);

  return (
    <div className="min-h-full bg-gradient-to-b from-[var(--botw-warm-black)] to-[var(--totk-brown)]/5 p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            href="/reference/jobs"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 px-4 py-2 text-sm font-semibold text-[var(--totk-light-ocher)] shadow-sm transition-all hover:border-[var(--totk-light-ocher)] hover:bg-[var(--totk-brown)]/30 hover:text-[var(--totk-ivory)]"
          >
            <i className="fa-solid fa-arrow-left text-xs" aria-hidden />
            Jobs
          </Link>
          <div className="flex flex-1 items-center justify-center gap-3 min-w-0">
            <span className="h-px w-8 shrink-0 bg-[var(--totk-dark-ocher)]/60 sm:w-12" aria-hidden />
            <img src="/Side=Left.svg" alt="" className="h-5 w-auto shrink-0 opacity-90" />
            <h1 className="text-2xl font-bold tracking-tight text-[var(--totk-ivory)] drop-shadow-sm shrink-0 sm:text-3xl">
              {job.name}
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-5 w-auto shrink-0 opacity-90" />
            <span className="h-px w-8 shrink-0 bg-[var(--totk-dark-ocher)]/60 sm:w-12" aria-hidden />
          </div>
          <span className="w-[88px] shrink-0 sm:w-[108px]" aria-hidden />
        </header>

        <div className="mb-8 overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-lg">
          <div className="border-b border-[var(--totk-dark-ocher)]/50 bg-[var(--totk-brown)]/10 px-6 py-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
              Overview
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-[var(--totk-light-ocher)]/50 bg-[var(--totk-light-ocher)]/10 px-4 py-1.5 text-sm font-semibold text-[var(--totk-light-ocher)]">
                {perkLabel}
              </span>
              {job.villages.map((v) => (
                <span
                  key={v}
                  className={`rounded-full border px-4 py-1.5 text-sm font-medium ${VILLAGE_BADGE_CLASSES[v] ?? "border-[var(--totk-dark-ocher)] bg-[var(--totk-brown)]/40 text-[var(--botw-pale)]"}`}
                >
                  {v}
                </span>
              ))}
              {job.exclusive && (
                <span className="rounded-full border border-amber-400/60 bg-amber-400/15 px-4 py-1.5 text-sm font-medium text-amber-200">
                  Exclusive
                </span>
              )}
            </div>
          </div>
          <div className="px-6 py-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">
              Description
            </h2>
            <p className="text-[var(--botw-pale)] leading-relaxed">
              {job.description || "—"}
            </p>
          </div>
        </div>

        {(() => {
          const isCraftingJob = job.perk.includes("CRAFTING");
          const isGatheringJob = job.perk.includes("GATHERING");
          const isLootingJob = job.perk.includes("LOOTING");
          const craftableItems = data.craftableItems ?? [];
          const regionItems = data.gatherableByRegion[activeRegion] ?? [];
          const regionMonsters = (data.monstersByRegion ?? {})[activeRegion] ?? [];
          const regionColor = REGION_COLORS[activeRegion] ?? "#6b7280";

          const regionTabsBlock = (
            <nav
              className="mb-5 flex flex-wrap gap-2"
              aria-label="Region tabs"
            >
              {REGION_TABS.map(({ value, label, icon }) => {
                const isActive = activeRegion === value;
                const color = REGION_COLORS[value] ?? "#6b7280";
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setActiveRegion(value)}
                    className="flex min-w-[90px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-200 sm:min-w-[110px] sm:text-sm"
                    style={
                      isActive
                        ? {
                            backgroundColor: color,
                            color: "#fff",
                            border: `2px solid ${color}`,
                            boxShadow: `0 2px 10px ${color}50`,
                          }
                        : {
                            backgroundColor: "var(--botw-warm-black)",
                            color: "var(--totk-grey-200)",
                            border: "2px solid var(--totk-dark-ocher)",
                          }
                    }
                    aria-current={isActive ? "true" : undefined}
                  >
                    <i className={`fa-solid ${icon} shrink-0 text-sm opacity-90`} aria-hidden />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </nav>
          );

          return (
            <>
              {isCraftingJob && (
                <section className="overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-lg">
                  <div className="border-b border-[var(--totk-dark-ocher)]/50 bg-[var(--totk-brown)]/10 px-6 py-4">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--totk-ivory)]">
                      <i className="fa-solid fa-hammer text-[var(--totk-light-ocher)]" aria-hidden />
                      Items you can craft
                    </h2>
                    <p className="mt-1 text-sm text-[var(--totk-grey-200)]">
                      Items that {job.name} can craft.
                    </p>
                  </div>
                  <div className="p-4 sm:p-5">
                    <div className="overflow-hidden rounded-lg border-2 border-[var(--totk-dark-ocher)]/60 bg-[var(--totk-brown)]/10 p-4 sm:p-5">
                      <div className="mb-4 flex items-center justify-between gap-2">
                        <span className="rounded-full border border-[var(--totk-light-ocher)]/50 bg-[var(--totk-light-ocher)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--totk-light-ocher)]">
                          {craftableItems.length} {craftableItems.length === 1 ? "item" : "items"}
                        </span>
                      </div>
                      {craftableItems.length === 0 ? (
                        <p className="rounded-lg bg-[var(--botw-warm-black)]/40 py-8 text-center text-sm text-[var(--totk-grey-200)]">
                          No craftable items for this job.
                        </p>
                      ) : (
                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                          {craftableItems.map((item) => {
                            const showImage = item.image && item.image !== "No Image";
                            return (
                              <li key={item._id}>
                                <Link
                                  href="/models/items"
                                  className="flex flex-col items-center rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/80 p-3 text-center transition-all hover:border-[var(--totk-light-ocher)]/50 hover:bg-[var(--totk-brown)]/20 hover:shadow-md"
                                >
                                  <div className="mb-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--totk-brown)]/30">
                                    {showImage ? (
                                      <img
                                        src={item.image}
                                        alt=""
                                        className="h-full w-full object-cover object-center"
                                        onError={(e) => {
                                          const img = e.target as HTMLImageElement;
                                          img.style.display = "none";
                                          img.nextElementSibling?.classList.remove("hidden");
                                        }}
                                      />
                                    ) : null}
                                    {!showImage && item.emoji ? (
                                      <span className="text-2xl leading-none" aria-hidden>
                                        {item.emoji}
                                      </span>
                                    ) : null}
                                    {showImage && item.emoji ? (
                                      <span className="hidden text-2xl leading-none" aria-hidden>
                                        {item.emoji}
                                      </span>
                                    ) : null}
                                  </div>
                                  <span className="line-clamp-2 text-sm font-medium text-[var(--botw-pale)]">
                                    {item.itemName}
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {isGatheringJob && (
                <section className="overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-lg">
                  <div className="border-b border-[var(--totk-dark-ocher)]/50 bg-[var(--totk-brown)]/10 px-6 py-4">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--totk-ivory)]">
                      <i className="fa-solid fa-map-location-dot text-[var(--totk-light-ocher)]" aria-hidden />
                      Gatherable Items by Region
                    </h2>
                    <p className="mt-1 text-sm text-[var(--totk-grey-200)]">
                      Choose a region to see what {job.name} can find there.
                    </p>
                  </div>
                  <div className="p-4 sm:p-5">
                    {regionTabsBlock}
                    <div
                      className="overflow-hidden rounded-lg border-2 p-4 sm:p-5"
                      style={{
                        borderColor: regionColor,
                        backgroundColor: `${regionColor}0c`,
                        boxShadow: `inset 0 1px 0 ${regionColor}20, 0 2px 12px rgba(0,0,0,0.2)`,
                      }}
                    >
                      <div className="mb-4 flex items-center justify-between gap-2">
                        <h3
                          className="flex items-center gap-2 text-lg font-semibold"
                          style={{ color: regionColor }}
                        >
                          <i className="fa-solid fa-mountain-sun opacity-80" aria-hidden />
                          {activeRegion}
                        </h3>
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: `${regionColor}30`, color: regionColor }}
                        >
                          {regionItems.length} {regionItems.length === 1 ? "item" : "items"}
                        </span>
                      </div>
                      {regionItems.length === 0 ? (
                        <p className="rounded-lg bg-[var(--botw-warm-black)]/40 py-8 text-center text-sm text-[var(--totk-grey-200)]">
                          No gatherable items for this job in this region.
                        </p>
                      ) : (
                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                          {regionItems.map((item) => {
                            const showImage = item.image && item.image !== "No Image";
                            return (
                              <li key={item._id}>
                                <Link
                                  href="/models/items"
                                  className="flex flex-col items-center rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/80 p-3 text-center transition-all hover:border-[var(--totk-light-ocher)]/50 hover:bg-[var(--totk-brown)]/20 hover:shadow-md"
                                >
                                  <div className="mb-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--totk-brown)]/30">
                                    {showImage ? (
                                      <img
                                        src={item.image}
                                        alt=""
                                        className="h-full w-full object-cover object-center"
                                        onError={(e) => {
                                          const img = e.target as HTMLImageElement;
                                          img.style.display = "none";
                                          img.nextElementSibling?.classList.remove("hidden");
                                        }}
                                      />
                                    ) : null}
                                    {!showImage && item.emoji ? (
                                      <span className="text-2xl leading-none" aria-hidden>
                                        {item.emoji}
                                      </span>
                                    ) : null}
                                    {showImage && item.emoji ? (
                                      <span className="hidden text-2xl leading-none" aria-hidden>
                                        {item.emoji}
                                      </span>
                                    ) : null}
                                  </div>
                                  <span className="line-clamp-2 text-sm font-medium text-[var(--botw-pale)]">
                                    {item.itemName}
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {isLootingJob && (
                <section className="overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-lg">
                  <div className="border-b border-[var(--totk-dark-ocher)]/50 bg-[var(--totk-brown)]/10 px-6 py-4">
                    <h2 className="flex items-center gap-2 text-base font-semibold text-[var(--totk-ivory)]">
                      <i className="fa-solid fa-dragon text-[var(--totk-light-ocher)]" aria-hidden />
                      Monsters you can encounter
                    </h2>
                    <p className="mt-1 text-sm text-[var(--totk-grey-200)]">
                      Choose a region to see which monsters {job.name} can encounter there.
                    </p>
                  </div>
                  <div className="p-4 sm:p-5">
                    {regionTabsBlock}
                    <div
                      className="overflow-hidden rounded-lg border-2 p-4 sm:p-5"
                      style={{
                        borderColor: regionColor,
                        backgroundColor: `${regionColor}0c`,
                        boxShadow: `inset 0 1px 0 ${regionColor}20, 0 2px 12px rgba(0,0,0,0.2)`,
                      }}
                    >
                      <div className="mb-4 flex items-center justify-between gap-2">
                        <h3
                          className="flex items-center gap-2 text-lg font-semibold"
                          style={{ color: regionColor }}
                        >
                          <i className="fa-solid fa-mountain-sun opacity-80" aria-hidden />
                          {activeRegion}
                        </h3>
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                          style={{ backgroundColor: `${regionColor}30`, color: regionColor }}
                        >
                          {regionMonsters.length} {regionMonsters.length === 1 ? "monster" : "monsters"}
                        </span>
                      </div>
                      {regionMonsters.length === 0 ? (
                        <p className="rounded-lg bg-[var(--botw-warm-black)]/40 py-8 text-center text-sm text-[var(--totk-grey-200)]">
                          No monsters for this job in this region.
                        </p>
                      ) : (
                        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                          {regionMonsters.map((monster) => {
                            const showImage = monster.image && monster.image !== "No Image";
                            return (
                              <li key={monster._id}>
                                <Link
                                  href="/models/monsters"
                                  className="flex flex-col items-center rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/80 p-3 text-center transition-all hover:border-[var(--totk-light-ocher)]/50 hover:bg-[var(--totk-brown)]/20 hover:shadow-md"
                                >
                                  <div className="mb-2 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--totk-brown)]/30">
                                    {showImage ? (
                                      <>
                                        <img
                                          src={monster.image}
                                          alt=""
                                          className="h-full w-full object-cover object-center"
                                          onError={(e) => {
                                            const img = e.target as HTMLImageElement;
                                            img.style.display = "none";
                                            img.nextElementSibling?.classList.remove("hidden");
                                          }}
                                        />
                                        <span className="hidden text-xl text-[var(--totk-grey-300)]" aria-hidden>
                                          <i className="fa-solid fa-dragon" />
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-xl text-[var(--totk-grey-300)]" aria-hidden>
                                        <i className="fa-solid fa-dragon" />
                                      </span>
                                    )}
                                  </div>
                                  <span className="line-clamp-2 text-sm font-medium text-[var(--botw-pale)]">
                                    {monster.name}
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
