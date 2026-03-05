"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Loading, SearchFilterBar } from "@/components/ui";
import type { FilterGroup } from "@/components/ui";
import { jobsReference, PERK_CATEGORIES } from "@/data/jobsReference";
import type { JobReference } from "@/data/jobsReference";

const VILLAGES = ["Rudania", "Inariko", "Vhintl"] as const;
const SHORT_DESC_LENGTH = 100;

/** Perk type → Tailwind text/background color classes for badges. */
const PERK_COLORS: Record<string, string> = {
  Gathering: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50",
  Crafting: "bg-amber-500/20 text-amber-300 border-amber-500/50",
  Looting: "bg-rose-500/20 text-rose-300 border-rose-500/50",
  Boost: "bg-violet-500/20 text-violet-300 border-violet-500/50",
  Delivering: "bg-sky-500/20 text-sky-300 border-sky-500/50",
  Healing: "bg-green-500/20 text-green-300 border-green-500/50",
  Vending: "bg-lime-500/20 text-lime-300 border-lime-500/50",
  Stealing: "bg-red-500/20 text-red-300 border-red-500/50",
  None: "bg-[var(--totk-grey-200)]/20 text-[var(--totk-grey-200)] border-[var(--totk-dark-ocher)]/50",
};

/** Village → Tailwind color classes for badges. */
const VILLAGE_COLORS: Record<string, string> = {
  Rudania: "bg-red-500/20 text-red-300 border-red-500/50",
  Inariko: "bg-blue-500/20 text-blue-300 border-blue-500/50",
  Vhintl: "bg-green-500/20 text-green-300 border-green-500/50",
};

/** Font Awesome icon per job for card header. */
const JOB_ICONS: Record<string, string> = {
  Adventurer: "fa-compass",
  Artist: "fa-palette",
  Bandit: "fa-mask",
  Beekeeper: "fa-bug",
  Blacksmith: "fa-hammer",
  Cook: "fa-utensils",
  Courier: "fa-envelope",
  Craftsman: "fa-tools",
  Entertainer: "fa-music",
  Farmer: "fa-wheat-awn",
  Fisherman: "fa-fish",
  Forager: "fa-basket-shopping",
  "Fortune Teller": "fa-crystal-ball",
  Graveskeeper: "fa-monument",
  Guard: "fa-shield-halved",
  Healer: "fa-hand-holding-medical",
  Herbalist: "fa-leaf",
  Hunter: "fa-crosshairs",
  "Mask Maker": "fa-masks-theater",
  Mercenary: "fa-hand-fist",
  Merchant: "fa-store",
  Miner: "fa-helmet-safety",
  Priest: "fa-cross",
  Rancher: "fa-cow",
  Researcher: "fa-flask",
  Scholar: "fa-book-open",
  Scout: "fa-binoculars",
  Shopkeeper: "fa-cash-register",
  Stablehand: "fa-paw",
  Teacher: "fa-chalkboard-teacher",
  Villager: "fa-person",
  Weaver: "fa-shirt",
  Witch: "fa-broom",
};

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trim() + "…";
}

function normalizePerkForFilter(perk: string): string {
  const u = perk.toUpperCase();
  if (u === "N/A" || u === "NONE") return "None";
  if (u.includes("GATHERING")) return "Gathering";
  if (u.includes("CRAFTING")) return "Crafting";
  if (u.includes("LOOTING")) return "Looting";
  if (u.includes("BOOST")) return "Boost";
  if (u.includes("DELIVERING")) return "Delivering";
  if (u.includes("HEALING")) return "Healing";
  if (u.includes("VENDING")) return "Vending";
  if (u.includes("STEALING")) return "Stealing";
  return "None";
}

function getPerkDisplay(perk: string): string {
  return perk === "N/A" || perk === "NONE" ? "None" : perk;
}

function getPerkColorClass(perk: string): string {
  const normalized = normalizePerkForFilter(perk);
  return PERK_COLORS[normalized] ?? PERK_COLORS.None;
}

function JobCard({ job }: { job: JobReference }) {
  const icon = JOB_ICONS[job.name] ?? "fa-briefcase";
  const perkDisplay = getPerkDisplay(job.perk);
  const perkClass = getPerkColorClass(job.perk);

  return (
    <Link
      href={`/reference/jobs/${job.slug}`}
      className="flex flex-col overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-lg transition-shadow hover:border-[var(--totk-light-ocher)]/60 hover:shadow-xl"
    >
      <div className="relative h-28 w-full overflow-hidden bg-gradient-to-br from-[var(--totk-brown)] to-[var(--totk-dark-ocher)]">
        <div className="absolute inset-0 flex items-center justify-center">
          <i className={`fa-solid ${icon} text-5xl text-[var(--totk-ivory)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]`} />
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-black/80 to-transparent" />
        <h2 className="absolute bottom-2 left-2 right-2 text-lg font-bold text-[var(--totk-ivory)] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          {job.name}
        </h2>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <span className={`mb-2 inline-block w-fit rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${perkClass}`}>
          {perkDisplay}
        </span>
        <div className="mb-2 flex flex-wrap gap-1">
          {job.villages.map((v) => (
            <span
              key={v}
              className={`rounded border px-2 py-0.5 text-xs font-medium ${VILLAGE_COLORS[v] ?? "bg-[var(--totk-brown)]/30 text-[var(--botw-pale)] border-[var(--totk-dark-ocher)]/50"}`}
            >
              {v}
            </span>
          ))}
          {job.exclusive && (
            <span className="rounded border border-[var(--totk-light-ocher)]/60 bg-[var(--totk-light-ocher)]/10 px-2 py-0.5 text-xs font-medium text-[var(--totk-light-ocher)]">
              Exclusive
            </span>
          )}
        </div>
        <p className="mb-4 flex-1 text-sm text-[var(--totk-grey-200)]">
          {truncate(job.description || "—", SHORT_DESC_LENGTH)}
        </p>
        <span className="text-sm font-medium text-[var(--totk-light-ocher)] underline hover:no-underline">
          View details →
        </span>
      </div>
    </Link>
  );
}

export default function ReferenceJobsPage() {
  const [jobs, setJobs] = useState<typeof jobsReference>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [villageFilter, setVillageFilter] = useState<string[]>([]);
  const [perkFilter, setPerkFilter] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/reference/jobs")
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText);
        return res.json();
      })
      .then((data: typeof jobsReference) => {
        if (!cancelled) setJobs(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load jobs");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredJobs = useMemo(() => {
    let list = [...jobs];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (j) =>
          j.name.toLowerCase().includes(q) ||
          j.description.toLowerCase().includes(q) ||
          j.perk.toLowerCase().includes(q)
      );
    }
    if (villageFilter.length) {
      list = list.filter((j) =>
        villageFilter.some((v) => j.villages.some((vill) => vill.toLowerCase() === v.toLowerCase()))
      );
    }
    if (perkFilter.length) {
      list = list.filter((j) => {
        const jobPerkNorm = normalizePerkForFilter(j.perk);
        return perkFilter.some((p) => p === jobPerkNorm);
      });
    }
    list.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    return list;
  }, [jobs, search, villageFilter, perkFilter]);

  const filterGroups: FilterGroup[] = useMemo(() => {
    const villageOptions = VILLAGES.map((v) => ({
      id: v.toLowerCase(),
      label: v,
      value: v,
      active: villageFilter.includes(v),
    }));
    const perkOptions = PERK_CATEGORIES.map((p) => ({
      id: p.toLowerCase(),
      label: p,
      value: p,
      active: perkFilter.includes(p),
    }));
    return [
      { id: "village", label: "Village", type: "multiple", options: villageOptions },
      { id: "perk", label: "Perk", type: "multiple", options: perkOptions },
    ];
  }, [villageFilter, perkFilter]);

  const handleFilterChange = (groupId: string, optionId: string, active: boolean) => {
    if (groupId === "village") {
      setVillageFilter((prev) =>
        active ? [...prev, optionId.charAt(0).toUpperCase() + optionId.slice(1)] : prev.filter((v) => v.toLowerCase() !== optionId)
      );
    } else if (groupId === "perk") {
      setPerkFilter((prev) =>
        active
          ? [...prev, optionId.charAt(0).toUpperCase() + optionId.slice(1)]
          : prev.filter((p) => p.toLowerCase() !== optionId)
      );
    }
  };

  const clearAll = () => {
    setSearch("");
    setVillageFilter([]);
    setPerkFilter([]);
  };

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[90rem]">
        <div className="mb-4 sm:mb-6 flex items-center justify-center gap-2 sm:gap-4">
          <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" />
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[var(--totk-light-ocher)]">
            Jobs
          </h1>
          <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" />
        </div>
        <SearchFilterBar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search jobs by name, description, or perk..."
          filterGroups={filterGroups}
          onFilterChange={handleFilterChange}
          onClearAll={clearAll}
          className="mb-4"
        />
        {loading ? (
          <Loading message="Loading jobs..." variant="inline" size="lg" />
        ) : error ? (
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
            <p className="text-[var(--botw-pale)]">{error}</p>
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6">
            <p className="text-center text-[var(--botw-pale)]">No jobs match your filters.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {filteredJobs.map((job) => (
              <JobCard key={job.slug} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
