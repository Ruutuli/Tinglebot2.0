"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Loading } from "@/components/ui";
import { capitalize } from "@/lib/string-utils";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList,
} from "recharts";

/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

type StatsData = {
  characters: {
    total: number;
    byHomeVillage: Array<{ village: string; count: number }>;
    byCurrentVillage: Array<{ village: string; count: number }>;
    byJob: Array<{ job: string; count: number }>;
    byRace: Array<{ race: string; count: number }>;
    statusCounts: {
      blighted: number;
      ko: number;
      inJail: number;
    };
    averages: {
      maxHearts: number;
      currentHearts: number;
      maxStamina: number;
      currentStamina: number;
      attack: number;
      defense: number;
    };
  };
  weather: {
    total: number;
    specialCount: number;
    precipitationByVillage: Array<{
      village: string;
      mostCommon: { type: string; count: number } | null;
      allPrecipitations: Array<{ type: string; count: number }>;
    }>;
  };
  pets: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    bySpecies: Array<{ species: string; count: number }>;
    byType: Array<{ type: string; count: number }>;
    averageLevel: number;
    ownerCount: number;
  };
};

type BreakdownData = {
  type: "race" | "job";
  value: string;
  total: number;
  characterNames: Array<{ name: string; id: string; slug: string; homeVillage: string }>;
  breakdown: {
    byHomeVillage: Array<{ village: string; count: number }>;
    byJob?: Array<{ job: string; count: number }>;
    byRace?: Array<{ race: string; count: number }>;
  };
};

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

export default function StatsPage() {
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breakdownData, setBreakdownData] = useState<BreakdownData | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    const fetchStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/stats", { signal: abortController.signal });
        if (abortController.signal.aborted) return;
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to fetch stats");
        }
        const data = (await res.json()) as StatsData;
        if (abortController.signal.aborted) return;
        
        setStatsData(data);
      } catch (err: unknown) {
        if (abortController.signal.aborted) return;
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error.message);
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchStats();

    return () => {
      abortController.abort();
    };
  }, []);

  const handleBarClick = async (type: "race" | "job", value: string) => {
    try {
      setLoadingBreakdown(true);
      setShowBreakdown(true);
      const res = await fetch(`/api/stats/breakdown?type=${type}&value=${encodeURIComponent(value)}`);
      if (!res.ok) {
        throw new Error("Failed to fetch breakdown");
      }
      const data = (await res.json()) as BreakdownData;
      setBreakdownData(data);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message);
      setShowBreakdown(false);
    } finally {
      setLoadingBreakdown(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6 text-center">
          <p className="text-lg font-semibold text-[var(--totk-light-green)]">Error</p>
          <p className="mt-2 text-[var(--botw-pale)]">{error}</p>
        </div>
      </div>
    );
  }

  if (!statsData) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6 text-center">
          <p className="text-lg font-semibold text-[var(--totk-light-green)]">No Stats Found</p>
          <p className="mt-2 text-[var(--botw-pale)]">Stats could not be loaded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Page Header */}
        <div className="mb-4 sm:mb-6 flex items-center justify-center gap-2 sm:gap-4">
          <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" />
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[var(--totk-light-ocher)]">Statistics</h1>
          <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            icon="fa-user"
            label="Total Characters"
            value={statsData.characters.total.toLocaleString()}
            color="var(--totk-light-green)"
          />
          <StatCard
            icon="fa-cloud"
            label="Weather Records"
            value={statsData.weather.total.toLocaleString()}
            color="var(--botw-blue)"
          />
          <StatCard
            icon="fa-paw"
            label="Total Pets"
            value={statsData.pets.total.toLocaleString()}
            color="var(--totk-light-ocher)"
          />
        </div>

        {/* Character Statistics */}
        <CharacterStatsSection data={statsData.characters} onBarClick={handleBarClick} />

        {/* Weather Statistics */}
        <WeatherStatsSection data={statsData.weather} />

        {/* Pet Statistics */}
        <PetStatsSection data={statsData.pets} />
      </div>

      {/* Breakdown Modal */}
      {showBreakdown && (
        <BreakdownModal
          data={breakdownData}
          loading={loadingBreakdown}
          onClose={() => {
            setShowBreakdown(false);
            setBreakdownData(null);
          }}
        />
      )}
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Character Statistics Section ------------------- */
/* ============================================================================ */

function CharacterStatsSection({ 
  data, 
  onBarClick 
}: { 
  data: StatsData["characters"];
  onBarClick: (type: "race" | "job", value: string) => void;
}) {
  // ------------------- Normalize Village Names -------------------
  const normalizeVillageName = (village: string): string => {
    if (!village) return "Unknown";
    const normalized = village.toLowerCase().trim();
    // Handle any case variation
    if (normalized === "rudania" || normalized.startsWith("rudania")) return "Rudania";
    if (normalized === "inariko" || normalized.startsWith("inariko")) return "Inariko";
    if (normalized === "vhintl" || normalized.startsWith("vhintl")) return "Vhintl";
    // Fallback: try to match partial strings
    if (normalized.includes("rudania")) return "Rudania";
    if (normalized.includes("inariko")) return "Inariko";
    if (normalized.includes("vhintl")) return "Vhintl";
    return capitalize(village);
  };

  const villageChartData = useMemo(() => {
    // Aggregate by normalized village name to prevent duplicates
    const villageMap = new Map<string, number>();
    data.byHomeVillage.forEach((item) => {
      const normalizedName = normalizeVillageName(item.village);
      const currentCount = villageMap.get(normalizedName) || 0;
      villageMap.set(normalizedName, currentCount + item.count);
    });
    return Array.from(villageMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [data.byHomeVillage]);

  const jobChartData = useMemo(() => {
    // Normalize and aggregate job names to prevent duplicates
    const jobMap = new Map<string, number>();
    data.byJob.forEach((item) => {
      const normalizedName = capitalize(item.job.trim());
      const currentCount = jobMap.get(normalizedName) || 0;
      jobMap.set(normalizedName, currentCount + item.count);
    });
    return Array.from(jobMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [data.byJob]);

  const raceChartData = useMemo(() => {
    // Normalize and aggregate race names to prevent duplicates
    const raceMap = new Map<string, number>();
    data.byRace.forEach((item) => {
      const normalizedName = capitalize(item.race.trim());
      const currentCount = raceMap.get(normalizedName) || 0;
      raceMap.set(normalizedName, currentCount + item.count);
    });
    return Array.from(raceMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [data.byRace]);

  // ------------------- Village Colors -------------------
  const getVillageColor = (village: string): string => {
    const normalized = normalizeVillageName(village);
    if (normalized === "Rudania") return "#C6000A"; // Red
    if (normalized === "Inariko") return "#6BA3FF"; // Blue
    if (normalized === "Vhintl") return "#4AA144"; // Green
    return "var(--totk-light-green)";
  };

  // ------------------- Pastel Rainbow Colors -------------------
  const PASTEL_COLORS = [
    "#FFB3BA", // Pastel Red
    "#FFDFBA", // Pastel Orange
    "#FFFFBA", // Pastel Yellow
    "#BAFFC9", // Pastel Green
    "#BAE1FF", // Pastel Blue
    "#D4B3FF", // Pastel Indigo
    "#E1BAFF", // Pastel Violet
    "#FFB3E6", // Pastel Pink
    "#B3E5FF", // Pastel Sky Blue
    "#FFF4BA", // Pastel Gold
    "#FFC0CB", // Pastel Pink
    "#B3FFB3", // Pastel Lime
    "#B3D9FF", // Pastel Light Blue
    "#FFD4B3", // Pastel Peach
    "#E6B3FF", // Pastel Lavender
    "#B3F5FF", // Pastel Cyan
    "#FFE6B3", // Pastel Cream
    "#D4FFB3", // Pastel Mint
    "#FFB3D4", // Pastel Rose
    "#C9BAFF", // Pastel Periwinkle
  ];

  return (
    <div className="space-y-6">
      <SectionCard title="Character Statistics" icon="fa-user">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Total Characters" value={data.total.toLocaleString()} accent="green" />
          <Metric label="Blighted" value={data.statusCounts.blighted} accent="muted" />
          <Metric label="KO'd" value={data.statusCounts.ko} accent="muted" />
          <Metric label="In Jail" value={data.statusCounts.inJail} accent="muted" />
        </div>
      </SectionCard>

      {/* Village Distribution */}
      {villageChartData.length > 0 && (
        <SectionCard title="Characters by Home Village" icon="fa-map-marker-alt">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={villageChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {villageChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getVillageColor(entry.name)} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--botw-warm-black)",
                    border: "1px solid var(--totk-dark-ocher)",
                    borderRadius: "8px",
                    color: "var(--botw-pale)",
                  }}
                  itemStyle={{ color: "var(--botw-pale)", fontSize: "13px" }}
                  labelStyle={{ color: "var(--totk-light-green)", fontSize: "14px", fontWeight: 600 }}
                  formatter={(value: number | undefined) => [`${value ?? 0} characters`, "Count"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* All Jobs */}
      {jobChartData.length > 0 && (
        <SectionCard title="Characters by Job" icon="fa-briefcase">
          <div className="h-[32rem] w-full -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={jobChartData} margin={{ top: 80, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                <XAxis 
                  dataKey="name"
                  stroke="var(--totk-grey-200)"
                  tick={{ fill: "var(--totk-light-green)", fontSize: 13, fontWeight: 600 }}
                  angle={-30}
                  textAnchor="end"
                  height={80}
                  interval={0}
                  dy={15}
                  dx={-8}
                />
                <YAxis 
                  stroke="var(--totk-grey-200)"
                  tick={{ fill: "var(--totk-grey-200)", fontSize: 14, fontWeight: 500 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--botw-warm-black)",
                    border: "1px solid var(--totk-dark-ocher)",
                    borderRadius: "8px",
                    color: "var(--botw-pale)",
                    fontSize: "13px",
                  }}
                  itemStyle={{ color: "var(--botw-pale)", fontSize: "13px" }}
                  labelStyle={{ color: "var(--totk-light-green)", fontSize: "14px", fontWeight: 600 }}
                  cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                />
                <Bar 
                  dataKey="count" 
                  name="Characters" 
                  radius={[8, 8, 0, 0]}
                  onClick={(data: { name?: string }) => {
                    if (data?.name) {
                      onBarClick("job", data.name);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {jobChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={PASTEL_COLORS[index % PASTEL_COLORS.length]}
                    />
                  ))}
                  <LabelList 
                    dataKey="count" 
                    position="top" 
                    fill="var(--botw-pale)" 
                    fontSize={13} 
                    fontWeight="bold"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* Race Distribution */}
      {raceChartData.length > 0 && (
        <SectionCard title="Characters by Race" icon="fa-users">
          <div className="h-[32rem] w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={raceChartData} margin={{ top: 80, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                <XAxis 
                  dataKey="name"
                  stroke="var(--totk-grey-200)"
                  tick={{ fill: "var(--totk-light-green)", fontSize: 13, fontWeight: 600 }}
                  angle={-30}
                  textAnchor="end"
                  height={80}
                  interval={0}
                  dy={15}
                  dx={-8}
                />
                <YAxis 
                  stroke="var(--totk-grey-200)"
                  tick={{ fill: "var(--totk-grey-200)", fontSize: 14, fontWeight: 500 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--botw-warm-black)",
                    border: "1px solid var(--totk-dark-ocher)",
                    borderRadius: "8px",
                    color: "var(--botw-pale)",
                    fontSize: "13px",
                  }}
                  itemStyle={{ color: "var(--botw-pale)", fontSize: "13px" }}
                  labelStyle={{ color: "var(--totk-light-green)", fontSize: "14px", fontWeight: 600 }}
                  cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                />
                <Bar 
                  dataKey="count" 
                  name="Characters" 
                  radius={[8, 8, 0, 0]}
                  onClick={(data: { name?: string }) => {
                    if (data?.name) {
                      onBarClick("race", data.name);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {raceChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={PASTEL_COLORS[index % PASTEL_COLORS.length]}
                    />
                  ))}
                  <LabelList 
                    dataKey="count" 
                    position="top" 
                    fill="var(--botw-pale)" 
                    fontSize={13} 
                    fontWeight="bold"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* Average Stats */}
      <SectionCard title="Average Character Stats" icon="fa-chart-bar">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Avg Max Hearts" value={data.averages.maxHearts.toFixed(1)} accent="green" />
          <Metric label="Avg Max Stamina" value={data.averages.maxStamina.toFixed(1)} accent="blue" />
          <Metric label="Avg Attack" value={data.averages.attack.toFixed(1)} accent="ocher" />
          <Metric label="Avg Defense" value={data.averages.defense.toFixed(1)} accent="ocher" />
        </div>
      </SectionCard>
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Weather Statistics Section ------------------- */
/* ============================================================================ */

function WeatherStatsSection({ data }: { data: StatsData["weather"] }) {
  // Helper function to normalize village names
  const normalizeVillageName = (village: string): string => {
    if (!village) return "Unknown";
    const normalized = village.toLowerCase().trim();
    if (normalized === "rudania" || normalized.startsWith("rudania")) return "Rudania";
    if (normalized === "inariko" || normalized.startsWith("inariko")) return "Inariko";
    if (normalized === "vhintl" || normalized.startsWith("vhintl")) return "Vhintl";
    if (normalized.includes("rudania")) return "Rudania";
    if (normalized.includes("inariko")) return "Inariko";
    if (normalized.includes("vhintl")) return "Vhintl";
    return village
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  // Get village color
  const getVillageColor = (village: string): string => {
    const normalized = normalizeVillageName(village);
    if (normalized === "Rudania") return "#FF6B6B"; // Red
    if (normalized === "Inariko") return "#7FB3FF"; // Blue
    if (normalized === "Vhintl") return "#6BCF7F"; // Green
    return "var(--totk-light-green)";
  };

  const precipitationChartData = useMemo(() => {
    return data.precipitationByVillage
      .filter((item) => item.mostCommon)
      .map((item) => ({
        name: capitalize(item.village),
        precipitation: item.mostCommon!.type,
        count: item.mostCommon!.count,
        village: item.village,
      }))
      .sort((a, b) => b.count - a.count);
  }, [data.precipitationByVillage]);

  return (
    <div className="space-y-6">
      <SectionCard title="Weather Statistics" icon="fa-cloud">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric label="Total Records" value={data.total.toLocaleString()} accent="blue" />
          <Metric label="Special Weather" value={data.specialCount.toLocaleString()} accent="green" />
        </div>
      </SectionCard>

      {/* Special Weather */}
      <SectionCard title="Special Weather" icon="fa-star">
        <div className="rounded-xl border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/20 px-4 py-3">
          <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
            Total Special Weather Events
          </p>
          <p className="text-2xl font-bold tabular-nums text-[var(--totk-light-green)]">
            {data.specialCount.toLocaleString()}
          </p>
          {data.total > 0 && (
            <p className="mt-1 text-xs text-[var(--botw-pale)]">
              {((data.specialCount / data.total) * 100).toFixed(1)}% of all weather records
            </p>
          )}
        </div>
      </SectionCard>

      {/* Most Common Precipitation by Village */}
      {precipitationChartData.length > 0 && (
        <SectionCard title="Most Common Precipitation by Village" icon="fa-cloud-rain">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={precipitationChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                <XAxis 
                  dataKey="name" 
                  stroke="var(--totk-grey-200)"
                  tick={{ fill: "var(--totk-grey-200)", fontSize: 12 }}
                />
                <YAxis 
                  stroke="var(--totk-grey-200)"
                  tick={{ fill: "var(--totk-grey-200)", fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--botw-warm-black)",
                    border: "1px solid var(--totk-dark-ocher)",
                    borderRadius: "8px",
                    color: "var(--botw-pale)",
                  }}
                  itemStyle={{ color: "var(--botw-pale)", fontSize: "13px" }}
                  labelStyle={{ color: "var(--totk-light-green)", fontSize: "14px", fontWeight: 600 }}
                  formatter={(value: number | undefined) => [`${value ?? 0} times`, "Count"]}
                  cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                />
                <Bar 
                  dataKey="count" 
                  name="Count"
                  radius={[8, 8, 0, 0]}
                >
                  {precipitationChartData.map((entry: { village: string }, index: number) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={getVillageColor(entry.village)}
                    />
                  ))}
                  <LabelList 
                    dataKey="precipitation" 
                    position="top" 
                    fill="var(--botw-pale)" 
                    fontSize={11} 
                    fontWeight="bold"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Pet Statistics Section ------------------- */
/* ============================================================================ */

function PetStatsSection({ data }: { data: StatsData["pets"] }) {
  const statusChartData = useMemo(() => {
    return data.byStatus.map((item) => ({
      name: capitalize(item.status.replace("_", " ")),
      value: item.count,
    }));
  }, [data.byStatus]);

  const speciesChartData = useMemo(() => {
    return data.bySpecies.slice(0, 10).map((item) => ({
      name: capitalize(item.species),
      count: item.count,
    }));
  }, [data.bySpecies]);

  const COLORS = ["var(--totk-light-green)", "var(--botw-blue)", "var(--totk-light-ocher)", "var(--totk-mid-ocher)"];

  return (
    <div className="space-y-6">
      <SectionCard title="Pet Statistics" icon="fa-paw">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Total Pets" value={data.total.toLocaleString()} accent="green" />
          <Metric label="Avg Level" value={data.averageLevel.toFixed(1)} accent="blue" />
          <Metric label="Owners" value={data.ownerCount.toLocaleString()} accent="ocher" />
        </div>
      </SectionCard>

      {/* Pet Status Distribution */}
      {statusChartData.length > 0 && (
        <SectionCard title="Pets by Status" icon="fa-info-circle">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie
                  data={statusChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {statusChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--botw-warm-black)",
                    border: "1px solid var(--totk-dark-ocher)",
                    borderRadius: "8px",
                    color: "var(--botw-pale)",
                  }}
                  itemStyle={{ color: "var(--botw-pale)", fontSize: "13px" }}
                  labelStyle={{ color: "var(--totk-light-green)", fontSize: "14px", fontWeight: 600 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* Top Species */}
      {speciesChartData.length > 0 && (
        <SectionCard title="Top 10 Pet Species" icon="fa-dog">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={speciesChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                <XAxis 
                  type="number"
                  stroke="var(--totk-grey-200)"
                  tick={{ fill: "var(--totk-grey-200)", fontSize: 10 }}
                />
                <YAxis 
                  type="category"
                  dataKey="name"
                  stroke="var(--totk-grey-200)"
                  tick={{ fill: "var(--totk-grey-200)", fontSize: 10 }}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--botw-warm-black)",
                    border: "1px solid var(--totk-dark-ocher)",
                    borderRadius: "8px",
                    color: "var(--botw-pale)",
                  }}
                  itemStyle={{ color: "var(--botw-pale)" }}
                  labelStyle={{ color: "var(--totk-light-green)" }}
                  cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                />
                <Bar 
                  dataKey="count" 
                  fill="var(--totk-light-ocher)" 
                  name="Pets" 
                  radius={[0, 8, 8, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Breakdown Modal ------------------- */
/* ============================================================================ */

function BreakdownModal({
  data,
  loading,
  onClose,
}: {
  data: BreakdownData | null;
  loading: boolean;
  onClose: () => void;
}) {
  // Helper function to normalize village names
  const normalizeVillageName = (village: string): string => {
    if (!village) return "Unknown";
    const normalized = village.toLowerCase().trim();
    if (normalized === "rudania" || normalized.startsWith("rudania")) return "Rudania";
    if (normalized === "inariko" || normalized.startsWith("inariko")) return "Inariko";
    if (normalized === "vhintl" || normalized.startsWith("vhintl")) return "Vhintl";
    if (normalized.includes("rudania")) return "Rudania";
    if (normalized.includes("inariko")) return "Inariko";
    if (normalized.includes("vhintl")) return "Vhintl";
    return village
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  };

  // Get village color (lighter, more readable versions)
  const getVillageColor = (village: string): string => {
    const normalized = normalizeVillageName(village);
    if (normalized === "Rudania") return "#FF6B6B"; // Lighter Red
    if (normalized === "Inariko") return "#7FB3FF"; // Lighter Blue
    if (normalized === "Vhintl") return "#6BCF7F"; // Lighter Green
    return "#B8E6B8"; // Light green for unknown
  };

  if (!data && !loading) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/95 p-6 shadow-xl backdrop-blur-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-2 text-[var(--totk-grey-200)] transition-colors hover:bg-[var(--totk-dark-ocher)]/20 hover:text-[var(--totk-light-green)]"
          aria-label="Close"
        >
          <i className="fa-solid fa-times text-xl" />
        </button>

        {loading ? (
          <div className="flex min-h-[400px] items-center justify-center">
            <Loading />
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Header */}
            <div className="border-b border-[var(--totk-dark-ocher)]/30 pb-4">
              <h2 className="text-2xl font-bold text-[var(--totk-light-ocher)]">
                {capitalize(data.type)}: {capitalize(data.value)}
              </h2>
              <p className="mt-1 text-[var(--botw-pale)]">
                Total: {data.total} character{data.total !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Character Names */}
            <div>
              <h3 className="mb-3 text-lg font-semibold text-[var(--totk-light-green)]">
                Character Names
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.characterNames.map((char, idx) => {
                  const villageColor = getVillageColor(char.homeVillage);
                  return (
                    <Link
                      key={idx}
                      href={`/characters/${char.slug}`}
                      className="rounded-lg border px-3 py-1 text-sm transition-colors hover:opacity-80"
                      style={{
                        borderColor: `${villageColor}40`,
                        backgroundColor: `${villageColor}15`,
                        color: villageColor,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {char.name}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Breakdown Sections */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* By Home Village */}
              <div>
                <h3 className="mb-3 text-lg font-semibold text-[var(--totk-light-green)]">
                  By Home Village
                </h3>
                <div className="space-y-2">
                  {data.breakdown.byHomeVillage.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/20 px-4 py-2"
                    >
                      <span className="text-[var(--botw-pale)]">{capitalize(item.village)}</span>
                      <span className="font-semibold text-[var(--totk-light-green)]">
                        {item.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* By Job (if race breakdown) */}
              {data.breakdown.byJob && (
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-[var(--totk-light-green)]">
                    By Job
                  </h3>
                  <div className="space-y-2">
                    {data.breakdown.byJob.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/20 px-4 py-2"
                      >
                        <span className="text-[var(--botw-pale)]">{capitalize(item.job)}</span>
                        <span className="font-semibold text-[var(--totk-light-green)]">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* By Race (if job breakdown) */}
              {data.breakdown.byRace && (
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-[var(--totk-light-green)]">
                    By Race
                  </h3>
                  <div className="space-y-2">
                    {data.breakdown.byRace.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-lg border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/20 px-4 py-2"
                      >
                        <span className="text-[var(--botw-pale)]">{capitalize(item.race)}</span>
                        <span className="font-semibold text-[var(--totk-light-green)]">
                          {item.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Reusable Components ------------------- */
/* ============================================================================ */

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/80 p-4 shadow-sm backdrop-blur-sm md:p-5">
      <div className="flex min-w-0 items-center gap-4">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${color}20` }}
        >
          <i className={`fa-solid ${icon} text-base`} style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
            {label}
          </p>
          <p className="mt-0.5 break-all text-lg font-bold tabular-nums sm:text-xl" style={{ color }}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/80 p-4 shadow-sm backdrop-blur-sm md:p-6">
      <div className="mb-4 flex items-center gap-3 md:mb-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--totk-light-green)]/15">
          <i className={`fa-solid ${icon} text-[var(--totk-light-green)]`} />
        </div>
        <h2 className="text-sm font-semibold tracking-tight text-[var(--totk-light-ocher)] sm:text-base">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  accent?: "green" | "blue" | "ocher" | "muted";
}) {
  const accentColor =
    accent === "green"
      ? "text-[var(--totk-light-green)]"
      : accent === "blue"
        ? "text-[var(--botw-blue)]"
        : accent === "ocher"
          ? "text-[var(--totk-light-ocher)]"
          : "text-[var(--botw-pale)]";
  return (
    <div className="rounded-xl border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/50 px-4 py-3">
      <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
        {label}
      </p>
      <p className={`text-lg font-bold tabular-nums ${accentColor}`}>{value}</p>
    </div>
  );
}
