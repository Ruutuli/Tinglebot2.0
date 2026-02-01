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
    recordsByVillage: Array<{ village: string; count: number }>;
    recordsBySeason: Array<{ season: string; count: number }>;
    specialByVillage: Array<{ village: string; count: number }>;
    specialBySeason: Array<{ season: string; count: number }>;
    specialByVillageAndType: Array<{ village: string; type: string; count: number }>;
    precipitationByVillageAndType: Array<{ village: string; type: string; count: number }>;
    precipitationBySeason: Array<{ season: string; type: string; count: number }>;
    temperatureByVillage: Array<{ village: string; type: string; count: number }>;
    windByVillage: Array<{ village: string; type: string; count: number }>;
  };
  pets: {
    total: number;
    byStatus: Array<{ status: string; count: number }>;
    bySpecies: Array<{ species: string; count: number }>;
    byType: Array<{ type: string; count: number }>;
    averageLevel: number;
    ownerCount: number;
  };
  mounts: {
    total: number;
    bySpecies: Array<{ species: string; count: number }>;
    byLevel: Array<{ level: string; count: number }>;
    byRegion: Array<{ region: string; count: number }>;
  };
  quests: {
    total: number;
    byType: Array<{ type: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
  };
  helpWanted: {
    total: number;
    completed: number;
    byVillage: Array<{ village: string; count: number }>;
    byType: Array<{ type: string; count: number }>;
  };
  relics: {
    total: number;
    appraised: number;
    unique: number;
  };
  relationships: {
    total: number;
    byType: Array<{ type: string; count: number }>;
  };
  raids: {
    total: number;
    byVillage: Array<{ village: string; count: number }>;
    byResult: Array<{ result: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
    byTier: Array<{ tier: number; count: number }>;
  };
  stealStats: {
    totalAttempts: number;
    successfulSteals: number;
    successRate: number;
    byRarity: { common: number; uncommon: number; rare: number };
    topVictims: Array<{ name: string; count: number }>;
  };
  minigames: {
    total: number;
    byGameType: Array<{ gameType: string; count: number }>;
    byStatus: Array<{ status: string; count: number }>;
    byVillage: Array<{ village: string; count: number }>;
  };
  inventory: {
    topCharactersByItems: Array<{ characterName: string; slug: string; totalItems: number; uniqueItems: number }>;
    topItemsByCharacterCount: Array<{ itemName: string; characterCount: number }>;
  };
}

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
/* ------------------- Chart theme & palette ------------------- */
/* ============================================================================ */

const SECTION_ACCENT_COLORS: Record<string, string> = {
  characters: "var(--totk-light-green)",
  weather: "var(--botw-blue)",
  pets: "var(--totk-light-ocher)",
  mounts: "var(--totk-mid-ocher)",
  quests: "var(--totk-light-green)",
  helpWanted: "var(--botw-blue)",
  relics: "var(--totk-light-ocher)",
  relationships: "var(--stats-accent-relationship)",
  raids: "var(--totk-mid-ocher)",
  stealStats: "var(--stats-accent-steal)",
  minigames: "var(--totk-light-green)",
  inventory: "var(--botw-blue)",
};

/** Hex fallbacks for bar fills so SVG charts don't rely on CSS variables. */
const SECTION_ACCENT_HEX: Record<string, string> = {
  characters: "#49d59c",
  weather: "#00a3da",
  pets: "#e5dcb7",
  mounts: "#b99f65",
  quests: "#49d59c",
  helpWanted: "#00a3da",
  relics: "#e5dcb7",
  relationships: "#e07a7a",
  raids: "#b99f65",
  stealStats: "#b494e3",
  minigames: "#49d59c",
};

const VILLAGE_COLORS: Record<string, string> = {
  Rudania: "#FF6B6B",
  Inariko: "#7FB3FF",
  Vhintl: "#6BCF7F",
};

function getVillageColor(village: string): string {
  const key = capitalize((village || "").trim());
  if (VILLAGE_COLORS[key]) return VILLAGE_COLORS[key];
  const lower = (village || "").toLowerCase();
  if (lower.includes("rudania")) return VILLAGE_COLORS.Rudania;
  if (lower.includes("inariko")) return VILLAGE_COLORS.Inariko;
  if (lower.includes("vhintl")) return VILLAGE_COLORS.Vhintl;
  return "#49d59c";
}

const CHART_SEQUENTIAL_COLORS = [
  "#FFB3BA", "#FFDFBA", "#FFFFBA", "#BAFFC9", "#BAE1FF", "#D4B3FF",
  "#E1BAFF", "#FFB3E6", "#B3E5FF", "#FFF4BA", "#B3FFB3", "#B3D9FF",
  "#FFD4B3", "#E6B3FF", "#B3F5FF", "#FFE6B3", "#D4FFB3", "#FFB3D4",
  "#C9BAFF",
];

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "var(--botw-warm-black)",
    border: "1px solid var(--totk-dark-ocher)",
    borderRadius: "8px",
    color: "var(--botw-pale)",
    fontSize: "13px",
  },
  itemStyle: { color: "var(--botw-pale)", fontSize: "13px" },
  labelStyle: { color: "var(--totk-light-green)", fontSize: "14px", fontWeight: 600 },
  cursor: { fill: "rgba(255, 255, 255, 0.1)" },
};

const CHART_AXIS_PROPS = {
  stroke: "var(--totk-grey-200)" as const,
  tickFill: "var(--totk-grey-200)",
  gridStroke: "var(--totk-grey-400)",
  gridOpacity: 0.3,
};

/* ============================================================================ */
/* ------------------- Shared chart components ------------------- */
/* ============================================================================ */

type BarChartDataItem = { name: string; count: number; [key: string]: unknown };

function SharedBarChart({
  data,
  dataKey = "count",
  nameKey = "name",
  barColor,
  colorByIndex,
  layout = "vertical",
  onBarClick,
  height = 256,
  barSize = 24,
  nameLabel,
}: {
  data: BarChartDataItem[];
  dataKey?: string;
  nameKey?: string;
  barColor?: string;
  colorByIndex?: boolean;
  layout?: "vertical" | "horizontal";
  onBarClick?: (payload: { name?: string }) => void;
  height?: number;
  barSize?: number;
  nameLabel?: string;
}) {
  const horizontalBars = layout === "vertical";
  return (
    <div className="min-w-0 w-full overflow-hidden" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart
          data={data}
          layout={layout}
          margin={{ top: 8, right: 32, left: horizontalBars ? 4 : 12, bottom: horizontalBars ? 20 : 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={CHART_AXIS_PROPS.gridStroke}
            opacity={CHART_AXIS_PROPS.gridOpacity}
          />
          <XAxis
            type={horizontalBars ? "number" : "category"}
            dataKey={horizontalBars ? undefined : nameKey}
            stroke={CHART_AXIS_PROPS.stroke}
            tick={{ fill: CHART_AXIS_PROPS.tickFill, fontSize: horizontalBars ? 10 : 11 }}
            angle={!horizontalBars && data.length > 6 ? -30 : 0}
            textAnchor={!horizontalBars && data.length > 6 ? "end" : "middle"}
            height={!horizontalBars && data.length > 6 ? 80 : undefined}
            interval={0}
            dy={!horizontalBars && data.length > 6 ? 15 : undefined}
            dx={!horizontalBars && data.length > 6 ? -8 : undefined}
          />
          <YAxis
            type={horizontalBars ? "category" : "number"}
            dataKey={horizontalBars ? nameKey : undefined}
            stroke={CHART_AXIS_PROPS.stroke}
            tick={{ fill: CHART_AXIS_PROPS.tickFill, fontSize: 10 }}
            width={horizontalBars ? 88 : undefined}
            interval={0}
          />
          <Tooltip
            {...CHART_TOOLTIP_STYLE}
            formatter={(value: number | undefined) => [`${value ?? 0}`, nameLabel ?? "Count"]}
          />
          <Bar
            dataKey={dataKey}
            name={nameLabel ?? "Count"}
            radius={horizontalBars ? [0, 8, 8, 0] : [8, 8, 0, 0]}
            barSize={barSize}
            onClick={onBarClick}
            style={onBarClick ? { cursor: "pointer" } : undefined}
          >
            {barColor
              ? data.map((_, index) => <Cell key={index} fill={barColor} />)
              : data.map((_, index) => (
                  <Cell
                    key={index}
                    fill={
                      colorByIndex
                        ? CHART_SEQUENTIAL_COLORS[index % CHART_SEQUENTIAL_COLORS.length]
                        : CHART_SEQUENTIAL_COLORS[0]
                    }
                  />
                ))}
            <LabelList
              dataKey={dataKey}
              position={horizontalBars ? "right" : "top"}
              fill="#d6cecd"
              fontSize={12}
              fontWeight="bold"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

type PieChartDataItem = { name: string; value: number; [key: string]: unknown };

function SharedPieChart({
  data,
  valueKey = "value",
  nameKey = "name",
  colors,
  outerRadius = 80,
  labelFormatter,
}: {
  data: PieChartDataItem[];
  valueKey?: string;
  nameKey?: string;
  colors: string[] | "village";
  outerRadius?: number;
  labelFormatter?: (name: string, percent: number) => string;
}) {
  const getColor = (entry: PieChartDataItem, index: number) =>
    colors === "village" ? getVillageColor(entry.name) : colors[index % colors.length];
  const defaultLabel = (props: { name?: string; percent?: number }) =>
    labelFormatter ? labelFormatter(props.name ?? "", props.percent ?? 0) : `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`;
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={defaultLabel}
            outerRadius={outerRadius}
            dataKey={valueKey}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getColor(entry, index)} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE.contentStyle}
            itemStyle={CHART_TOOLTIP_STYLE.itemStyle}
            labelStyle={CHART_TOOLTIP_STYLE.labelStyle}
            formatter={(value: number | undefined) => [`${value ?? 0}`, "Count"]}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

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
    <div className="min-h-screen overflow-x-hidden p-3 sm:p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-4 sm:space-y-6">
        {/* Page Header */}
        <div className="mb-3 sm:mb-6 flex items-center justify-center gap-2 sm:gap-4">
          <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
          <h1 className="text-center text-xl sm:text-2xl md:text-3xl font-bold text-[var(--totk-light-ocher)]">Statistics</h1>
          <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <StatCard icon="fa-user" label="Characters" value={statsData.characters.total.toLocaleString()} color={SECTION_ACCENT_COLORS.characters} />
          <StatCard icon="fa-cloud" label="Weather" value={statsData.weather.total.toLocaleString()} color={SECTION_ACCENT_COLORS.weather} />
          <StatCard icon="fa-paw" label="Pets" value={statsData.pets.total.toLocaleString()} color={SECTION_ACCENT_COLORS.pets} />
          <StatCard icon="fa-horse" label="Mounts" value={statsData.mounts.total.toLocaleString()} color={SECTION_ACCENT_COLORS.mounts} />
          <StatCard icon="fa-scroll" label="Quests" value={statsData.quests.total.toLocaleString()} color={SECTION_ACCENT_COLORS.quests} />
          <StatCard icon="fa-gem" label="Relics" value={statsData.relics.total.toLocaleString()} color={SECTION_ACCENT_COLORS.relics} />
          <StatCard icon="fa-dragon" label="Raids" value={(statsData.raids?.total ?? 0).toLocaleString()} color={SECTION_ACCENT_COLORS.raids} />
        </div>

        {/* Character Statistics */}
        <CharacterStatsSection data={statsData.characters} onBarClick={handleBarClick} />

        {/* Weather Statistics */}
        <WeatherStatsSection data={statsData.weather} />

        {/* Pet Statistics */}
        <PetStatsSection data={statsData.pets} />

        {/* Mount Statistics */}
        <MountStatsSection data={statsData.mounts} />

        {/* Quest Statistics */}
        <QuestStatsSection data={statsData.quests} />

        {/* Help Wanted Statistics */}
        <HelpWantedStatsSection data={statsData.helpWanted} />

        {/* Relic Statistics */}
        <RelicStatsSection data={statsData.relics} />

        {/* Relationship Statistics */}
        <RelationshipStatsSection data={statsData.relationships} />

        {/* Raid Statistics */}
        {statsData.raids && <RaidStatsSection data={statsData.raids} />}

        {/* Steal Statistics */}
        {statsData.stealStats && <StealStatsSection data={statsData.stealStats} />}

        {/* Minigame Statistics */}
        {statsData.minigames && <MinigameStatsSection data={statsData.minigames} />}

        {/* Inventory Statistics */}
        {statsData.inventory && <InventoryStatsSection data={statsData.inventory} />}
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

function normalizeVillageName(village: string): string {
  if (!village) return "Unknown";
  const normalized = village.toLowerCase().trim();
  if (normalized === "rudania" || normalized.startsWith("rudania")) return "Rudania";
  if (normalized === "inariko" || normalized.startsWith("inariko")) return "Inariko";
  if (normalized === "vhintl" || normalized.startsWith("vhintl")) return "Vhintl";
  if (normalized.includes("rudania")) return "Rudania";
  if (normalized.includes("inariko")) return "Inariko";
  if (normalized.includes("vhintl")) return "Vhintl";
  return capitalize(village);
}

function CharacterStatsSection({ 
  data, 
  onBarClick 
}: { 
  data: StatsData["characters"];
  onBarClick: (type: "race" | "job", value: string) => void;
}) {
  const villageChartData = useMemo(() => {
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

  const villagePieData = useMemo(
    () => villageChartData.map(({ name, count }) => ({ name, value: count })),
    [villageChartData]
  );

  const jobChartData = useMemo(() => {
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

  return (
    <div className="space-y-6">
      <SectionCard title="Character Statistics" icon="fa-user" accentColor={SECTION_ACCENT_COLORS.characters}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Total Characters" value={data.total.toLocaleString()} accent="green" />
          <Metric label="Blighted" value={data.statusCounts.blighted} accent="muted" />
          <Metric label="KO'd" value={data.statusCounts.ko} accent="muted" />
          <Metric label="In Jail" value={data.statusCounts.inJail} accent="muted" />
        </div>
      </SectionCard>

      {villagePieData.length > 0 && (
        <SectionCard title="Characters by Home Village" icon="fa-map-marker-alt" accentColor={SECTION_ACCENT_COLORS.characters}>
          <SharedPieChart
            data={villagePieData}
            valueKey="value"
            colors="village"
            outerRadius={100}
            labelFormatter={(name, percent) => `${name} ${(percent * 100).toFixed(0)}%`}
          />
        </SectionCard>
      )}

      {jobChartData.length > 0 && (
        <SectionCard title="Characters by Job" icon="fa-briefcase" accentColor={SECTION_ACCENT_COLORS.characters}>
          <div className="-mx-2 overflow-x-auto px-2 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
            <div className="h-[28rem] min-w-[280px] sm:h-[32rem]" style={{ width: Math.max(280, jobChartData.length * 48) }}>
              <SharedBarChart
                data={jobChartData}
                layout="horizontal"
                height={448}
                colorByIndex
                onBarClick={(payload) => payload?.name && onBarClick("job", payload.name)}
                nameLabel="Characters"
              />
            </div>
          </div>
        </SectionCard>
      )}

      {raceChartData.length > 0 && (
        <SectionCard title="Characters by Race" icon="fa-users" accentColor={SECTION_ACCENT_COLORS.characters}>
          <div className="-mx-2 overflow-x-auto px-2 sm:-mx-4 sm:px-4">
            <div className="h-[28rem] min-w-[280px] sm:h-[32rem]" style={{ width: Math.max(280, raceChartData.length * 48) }}>
              <SharedBarChart
                data={raceChartData}
                layout="horizontal"
                height={448}
                colorByIndex
                onBarClick={(payload) => payload?.name && onBarClick("race", payload.name)}
                nameLabel="Characters"
              />
            </div>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Average Character Stats" icon="fa-chart-bar" accentColor={SECTION_ACCENT_COLORS.characters}>
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

const SEASON_ORDER = ["spring", "summer", "fall", "winter"];

function WeatherStatsSection({ data }: { data: StatsData["weather"] }) {
  // Special weather per village: array of { village, data: [{ type, count }] }
  const specialByVillagePerVillage = useMemo(() => {
    const villages = [...new Set(data.specialByVillageAndType.map((p) => p.village))];
    return villages.map((village) => {
      const items = data.specialByVillageAndType
        .filter((p) => p.village === village)
        .sort((a, b) => b.count - a.count)
        .map((p) => ({ name: p.type, count: p.count }));
      return { village, data: items };
    }).filter((v) => v.data.length > 0);
  }, [data.specialByVillageAndType]);

  // Per-village: array of { village, data: [{ type, count }] }
  const precipitationByVillagePerVillage = useMemo(() => {
    const villages = [...new Set(data.precipitationByVillageAndType.map((p) => p.village))];
    return villages.map((village) => {
      const items = data.precipitationByVillageAndType
        .filter((p) => p.village === village)
        .sort((a, b) => b.count - a.count)
        .map((p) => ({ name: p.type, count: p.count }));
      return { village, data: items };
    }).filter((v) => v.data.length > 0);
  }, [data.precipitationByVillageAndType]);

  // Per-season: array of { season, data: [{ type, count }] }
  const precipitationBySeasonPerSeason = useMemo(() => {
    const seasons = ["spring", "summer", "fall", "winter"];
    return seasons.map((season) => {
      const items = data.precipitationBySeason
        .filter((p) => p.season === season)
        .sort((a, b) => b.count - a.count)
        .map((p) => ({ name: p.type, count: p.count }));
      return { season, data: items };
    }).filter((s) => s.data.length > 0);
  }, [data.precipitationBySeason]);

  return (
    <div className="space-y-6">
      <SectionCard title="Weather Statistics" icon="fa-cloud" accentColor={SECTION_ACCENT_COLORS.weather}>
        <p className="text-sm text-[var(--botw-pale)]">
          {data.total.toLocaleString()} total records across villages and seasons
        </p>
      </SectionCard>

      {specialByVillagePerVillage.length > 0 && (
        <SectionCard title="Special Weather by Village" icon="fa-star" accentColor={SECTION_ACCENT_COLORS.weather}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {specialByVillagePerVillage.map(({ village, data: chartData }) => (
              <div
                key={village}
                className="rounded-xl border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/10 p-4"
              >
                <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">{capitalize(village)}</h4>
                <SharedBarChart
                  data={chartData}
                  layout="vertical"
                  height={Math.max(180, chartData.length * 32)}
                  barColor={getVillageColor(village)}
                  barSize={20}
                />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {precipitationByVillagePerVillage.length > 0 && (
        <SectionCard title="Precipitation by Village" icon="fa-cloud-rain" accentColor={SECTION_ACCENT_COLORS.weather}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {precipitationByVillagePerVillage.map(({ village, data: chartData }) => (
              <div
                key={village}
                className="rounded-xl border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/10 p-4"
              >
                <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">{capitalize(village)}</h4>
                <SharedBarChart
                  data={chartData}
                  layout="vertical"
                  height={Math.max(180, chartData.length * 32)}
                  barColor={getVillageColor(village)}
                  barSize={20}
                />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {precipitationBySeasonPerSeason.length > 0 && (
        <SectionCard title="Precipitation by Season" icon="fa-cloud-rain" accentColor={SECTION_ACCENT_COLORS.weather}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {precipitationBySeasonPerSeason.map(({ season, data: chartData }) => (
              <div
                key={season}
                className="rounded-xl border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/10 p-4"
              >
                <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">{capitalize(season)}</h4>
                <SharedBarChart
                  data={chartData}
                  layout="vertical"
                  height={Math.max(180, chartData.length * 32)}
                  barColor={CHART_SEQUENTIAL_COLORS[SEASON_ORDER.indexOf(season) % CHART_SEQUENTIAL_COLORS.length]}
                  barSize={20}
                />
              </div>
            ))}
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
  const speciesChartData = useMemo(() => {
    return data.bySpecies.slice(0, 10).map((item) => ({
      name: capitalize(item.species),
      count: item.count,
    }));
  }, [data.bySpecies]);

  const typeChartData = useMemo(() => {
    return data.byType.map((item) => ({
      name: capitalize((item.type || "").replace(/_/g, " ")),
      count: item.count,
    }));
  }, [data.byType]);

  return (
    <div className="space-y-6">
      <SectionCard title="Pet Statistics" icon="fa-paw" accentColor={SECTION_ACCENT_COLORS.pets}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Total Pets" value={data.total.toLocaleString()} accent="green" />
          <Metric label="Avg Level" value={data.averageLevel.toFixed(1)} accent="blue" />
          <Metric label="Owners" value={data.ownerCount.toLocaleString()} accent="ocher" />
        </div>
      </SectionCard>

      {(speciesChartData.length > 0 || typeChartData.length > 0) && (
        <SectionCard title="Pets by Species and Type" icon="fa-paw" accentColor={SECTION_ACCENT_COLORS.pets}>
          <p className="mb-4 text-xs text-[var(--totk-grey-200)]">
            Species = kind of animal (e.g. dog, cat). Type = pet category (e.g. companion, battle).
          </p>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            {speciesChartData.length > 0 && (
              <div className="min-w-0">
                <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Species</h4>
                <SharedBarChart
                  data={speciesChartData}
                  layout="vertical"
                  height={256}
                  barColor={SECTION_ACCENT_HEX.pets}
                  nameLabel="Pets"
                />
              </div>
            )}
            {typeChartData.length > 0 && (
              <div className="min-w-0">
                <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Type</h4>
                <SharedBarChart
                  data={typeChartData}
                  layout="vertical"
                  height={256}
                  barColor={CHART_SEQUENTIAL_COLORS[2]}
                  nameLabel="Pets"
                />
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Mount Statistics Section ------------------- */
/* ============================================================================ */

function MountStatsSection({ data }: { data: StatsData["mounts"] }) {
  const speciesData = useMemo(() => data.bySpecies.map((i) => ({ name: i.species, count: i.count })), [data.bySpecies]);
  const levelData = useMemo(() => data.byLevel.map((i) => ({ name: i.level, count: i.count })), [data.byLevel]);
  const regionData = useMemo(() => data.byRegion.map((i) => ({ name: i.region || "Unknown", count: i.count })), [data.byRegion]);

  if (data.total === 0) return null;
  return (
    <div className="space-y-6">
      <SectionCard title="Mount Statistics" icon="fa-horse" accentColor={SECTION_ACCENT_COLORS.mounts}>
        <p className="mb-4 text-sm text-[var(--botw-pale)]">{data.total.toLocaleString()} total mounts</p>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {speciesData.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Species</h4>
              <SharedBarChart data={speciesData} layout="vertical" height={256} barColor={CHART_SEQUENTIAL_COLORS[0]} barSize={24} />
            </div>
          )}
          {levelData.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Level</h4>
              <SharedBarChart data={levelData} layout="vertical" height={256} barColor={CHART_SEQUENTIAL_COLORS[2]} barSize={24} />
            </div>
          )}
          {regionData.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Region</h4>
              <SharedBarChart data={regionData} layout="vertical" height={256} barColor={CHART_SEQUENTIAL_COLORS[3]} barSize={24} />
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Quest Statistics Section ------------------- */
/* ============================================================================ */

function QuestStatsSection({ data }: { data: StatsData["quests"] }) {
  const byTypeData = useMemo(() => data.byType.map((i) => ({ name: i.type, count: i.count })), [data.byType]);
  const byStatusData = useMemo(() => data.byStatus.map((i) => ({ name: capitalize(i.status), count: i.count })), [data.byStatus]);

  if (data.total === 0) return null;
  return (
    <div className="space-y-6">
      <SectionCard title="Quest Statistics" icon="fa-scroll" accentColor={SECTION_ACCENT_COLORS.quests}>
        <p className="mb-4 text-sm text-[var(--botw-pale)]">{data.total.toLocaleString()} total quests</p>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          {byTypeData.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Type</h4>
              <SharedBarChart data={byTypeData} layout="vertical" height={256} barColor={SECTION_ACCENT_HEX.quests} barSize={28} />
            </div>
          )}
          {byStatusData.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Status</h4>
              <SharedBarChart data={byStatusData} layout="vertical" height={256} barColor={SECTION_ACCENT_HEX.quests} barSize={28} />
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Help Wanted Statistics Section ------------------- */
/* ============================================================================ */

function HelpWantedStatsSection({ data }: { data: StatsData["helpWanted"] }) {
  const byVillageData = useMemo(() => data.byVillage.map((i) => ({ name: capitalize(i.village), count: i.count })), [data.byVillage]);
  const byTypeData = useMemo(() => data.byType.map((i) => ({ name: capitalize(i.type), count: i.count })), [data.byType]);
  const completionPct = data.total > 0 ? ((data.completed / data.total) * 100).toFixed(1) : "0";

  if (data.total === 0) return null;
  return (
    <div className="space-y-6">
      <SectionCard title="Help Wanted Statistics" icon="fa-clipboard-list" accentColor={SECTION_ACCENT_COLORS.helpWanted}>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Total" value={data.total.toLocaleString()} accent="blue" />
          <Metric label="Completed" value={data.completed.toLocaleString()} accent="green" />
          <Metric label="Completion Rate" value={`${completionPct}%`} accent="ocher" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          {byVillageData.length > 0 && (
            <div className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Village</h4>
              <SharedBarChart data={byVillageData} layout="vertical" height={220} barColor={SECTION_ACCENT_HEX.helpWanted} barSize={24} />
            </div>
          )}
          {byTypeData.length > 0 && (
            <div className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Type</h4>
              <SharedBarChart data={byTypeData} layout="vertical" height={220} barColor={SECTION_ACCENT_HEX.helpWanted} barSize={24} />
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Relic Statistics Section ------------------- */
/* ============================================================================ */

function RelicStatsSection({ data }: { data: StatsData["relics"] }) {
  if (data.total === 0) return null;
  const appraisedPct = data.total > 0 ? ((data.appraised / data.total) * 100).toFixed(1) : "0";
  return (
    <SectionCard title="Relic Statistics" icon="fa-gem" accentColor={SECTION_ACCENT_COLORS.relics}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Total Relics" value={data.total.toLocaleString()} accent="ocher" />
        <Metric label="Appraised" value={data.appraised.toLocaleString()} accent="green" />
        <Metric label="Appraisal Rate" value={`${appraisedPct}%`} accent="blue" />
        <Metric label="Unique" value={data.unique.toLocaleString()} accent="ocher" />
      </div>
    </SectionCard>
  );
}

/* ============================================================================ */
/* ------------------- Relationship Statistics Section ------------------- */
/* ============================================================================ */

function RelationshipStatsSection({ data }: { data: StatsData["relationships"] }) {
  const byTypeData = useMemo(
    () => data.byType.map((i) => ({ name: i.type.replace(/_/g, " "), count: i.count })).sort((a, b) => b.count - a.count),
    [data.byType]
  );
  if (data.total === 0) return null;
  return (
    <SectionCard title="Relationship Statistics" icon="fa-heart" accentColor={SECTION_ACCENT_COLORS.relationships}>
      <p className="mb-4 text-sm text-[var(--botw-pale)]">{data.total.toLocaleString()} total relationships</p>
      {byTypeData.length > 0 && (
        <SharedBarChart
          data={byTypeData}
          layout="vertical"
          height={320}
          barColor={SECTION_ACCENT_HEX.relationships}
          barSize={24}
        />
      )}
    </SectionCard>
  );
}

/* ============================================================================ */
/* ------------------- Raid Statistics Section ------------------- */
/* ============================================================================ */

function RaidStatsSection({ data }: { data: StatsData["raids"] }) {
  const byVillageData = useMemo(() => data.byVillage.map((i) => ({ name: i.village, count: i.count })), [data.byVillage]);
  const byResultData = useMemo(() => data.byResult.map((i) => ({ name: capitalize(i.result), count: i.count })), [data.byResult]);
  const byTierData = useMemo(() => data.byTier.map((i) => ({ name: `Tier ${i.tier}`, count: i.count })), [data.byTier]);

  if (data.total === 0) return null;
  return (
    <div className="space-y-6">
      <SectionCard title="Raid Statistics" icon="fa-dragon" accentColor={SECTION_ACCENT_COLORS.raids}>
        <p className="mb-4 text-sm text-[var(--botw-pale)]">{data.total.toLocaleString()} total raids</p>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {byVillageData.length > 0 && (
            <div className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Village</h4>
              <SharedBarChart data={byVillageData} layout="vertical" height={180} barColor={SECTION_ACCENT_HEX.raids} barSize={24} />
            </div>
          )}
          {byResultData.length > 0 && (
            <div className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Result</h4>
              <SharedBarChart data={byResultData} layout="vertical" height={120} barColor={SECTION_ACCENT_HEX.raids} barSize={24} />
            </div>
          )}
          {byTierData.length > 0 && (
            <div className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Monster Tier</h4>
              <SharedBarChart data={byTierData} layout="vertical" height={180} barColor={SECTION_ACCENT_HEX.raids} barSize={24} />
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Steal Statistics Section ------------------- */
/* ============================================================================ */

function StealStatsSection({ data }: { data: StatsData["stealStats"] }) {
  const rarityData = useMemo(
    () => [
      { name: "Common", count: data.byRarity.common },
      { name: "Uncommon", count: data.byRarity.uncommon },
      { name: "Rare", count: data.byRarity.rare },
    ].filter((d) => d.count > 0),
    [data.byRarity]
  );
  const topVictimsData = useMemo(() => data.topVictims.map((i) => ({ name: i.name || "Unknown", count: i.count })), [data.topVictims]);

  if (data.totalAttempts === 0) return null;
  return (
    <div className="space-y-6">
      <SectionCard title="Steal Statistics" icon="fa-hand-holding" accentColor={SECTION_ACCENT_COLORS.stealStats}>
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Total Attempts" value={data.totalAttempts.toLocaleString()} accent="ocher" />
          <Metric label="Successful" value={data.successfulSteals.toLocaleString()} accent="green" />
          <Metric label="Success Rate" value={`${data.successRate}%`} accent="blue" />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          {rarityData.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">Items by Rarity</h4>
              <SharedBarChart data={rarityData} layout="vertical" height={140} barColor={SECTION_ACCENT_HEX.stealStats} barSize={28} />
            </div>
          )}
          {topVictimsData.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">Top Victims</h4>
              <SharedBarChart data={topVictimsData} layout="vertical" height={Math.max(200, topVictimsData.length * 28)} barColor={SECTION_ACCENT_HEX.stealStats} barSize={22} />
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Minigame Statistics Section ------------------- */
/* ============================================================================ */

function MinigameStatsSection({ data }: { data: StatsData["minigames"] }) {
  const byGameTypeData = useMemo(() => data.byGameType.map((i) => ({ name: i.gameType.replace(/_/g, " "), count: i.count })), [data.byGameType]);
  const byStatusData = useMemo(() => data.byStatus.map((i) => ({ name: capitalize(i.status), count: i.count })), [data.byStatus]);
  const byVillageData = useMemo(() => data.byVillage.map((i) => ({ name: capitalize(i.village), count: i.count })), [data.byVillage]);

  if (data.total === 0) return null;
  return (
    <div className="space-y-6">
      <SectionCard title="Minigame Statistics" icon="fa-gamepad" accentColor={SECTION_ACCENT_COLORS.minigames}>
        <p className="mb-4 text-sm text-[var(--botw-pale)]">{data.total.toLocaleString()} total sessions</p>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {byGameTypeData.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Game Type</h4>
              <SharedBarChart data={byGameTypeData} layout="vertical" height={140} barColor={SECTION_ACCENT_HEX.minigames} barSize={24} />
            </div>
          )}
          {byStatusData.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Status</h4>
              <SharedBarChart data={byStatusData} layout="vertical" height={140} barColor={SECTION_ACCENT_HEX.minigames} barSize={24} />
            </div>
          )}
          {byVillageData.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Village</h4>
              <SharedBarChart data={byVillageData} layout="vertical" height={140} barColor={SECTION_ACCENT_HEX.minigames} barSize={24} />
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Inventory Statistics Section ------------------- */
/* ============================================================================ */

type InventoryCharacterRow = { characterName: string; slug: string; totalItems: number; uniqueItems: number };
type InventoryItemRow = { itemName: string; characterCount: number };

function InventoryStatsSection({ data }: { data: StatsData["inventory"] }) {
  const topCharactersData = useMemo(
    () =>
      data.topCharactersByItems.map((c: InventoryCharacterRow) => ({
        name: c.characterName,
        count: c.totalItems,
        slug: c.slug,
        uniqueItems: c.uniqueItems,
      })),
    [data.topCharactersByItems]
  );
  const topItemsData = useMemo(
    () => data.topItemsByCharacterCount.map((i: InventoryItemRow) => ({ name: i.itemName, count: i.characterCount })),
    [data.topItemsByCharacterCount]
  );

  if (data.topCharactersByItems.length === 0 && data.topItemsByCharacterCount.length === 0) return null;
  return (
    <div className="space-y-6">
      <SectionCard title="Inventory" icon="fa-box" accentColor={SECTION_ACCENT_COLORS.inventory}>
        <p className="mb-4 text-sm text-[var(--botw-pale)]">
          Characters with the most items (total quantity) and items owned by the most characters.
        </p>
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          {topCharactersData.length > 0 && (
            <div className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">Characters with most items</h4>
              <div className="space-y-1.5 sm:space-y-2">
                {topCharactersData.slice(0, 15).map((c: { name: string; count: number; slug: string; uniqueItems: number }) => (
                  <Link
                    key={c.slug}
                    href={`/characters/${c.slug}`}
                    className="flex min-h-[44px] min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/20 px-3 py-2 transition-colors hover:bg-[var(--totk-dark-ocher)]/20 active:bg-[var(--totk-dark-ocher)]/20 sm:px-4"
                  >
                    <span className="min-w-0 truncate font-medium text-[var(--botw-pale)]" title={c.name}>{c.name}</span>
                    <span className="shrink-0 tabular-nums text-sm text-[var(--totk-light-green)] sm:text-base">
                      {c.count.toLocaleString()} items{c.uniqueItems !== c.count ? ` (${c.uniqueItems})` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {topItemsData.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">Items owned by most characters</h4>
              <div className="min-h-[200px] min-w-[200px]">
                <SharedBarChart
                  data={topItemsData}
                  layout="vertical"
                  height={Math.max(220, topItemsData.length * 28)}
                  barColor={SECTION_ACCENT_HEX.inventory}
                  barSize={22}
                  nameLabel="Characters"
                />
              </div>
            </div>
          )}
        </div>
      </SectionCard>
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

  if (!data && !loading) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85dvh] w-full max-w-4xl overflow-y-auto rounded-t-2xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/95 p-4 shadow-xl backdrop-blur-sm sm:rounded-2xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button - touch-friendly min size */}
        <button
          onClick={onClose}
          className="absolute right-2 top-2 flex h-11 w-11 min-w-[44px] items-center justify-center rounded-lg text-[var(--totk-grey-200)] transition-colors hover:bg-[var(--totk-dark-ocher)]/20 hover:text-[var(--totk-light-green)] active:bg-[var(--totk-dark-ocher)]/30 sm:right-4 sm:top-4 sm:h-auto sm:w-auto sm:min-w-0 sm:p-2"
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
              <div className="flex flex-wrap gap-2 sm:gap-2">
                {data.characterNames.map((char, idx) => {
                  const villageColor = getVillageColor(char.homeVillage);
                  return (
                    <Link
                      key={idx}
                      href={`/characters/${char.slug}`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border px-3 py-2 text-sm transition-colors hover:opacity-80 active:opacity-90 sm:py-1"
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
    <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/80 p-3 shadow-sm backdrop-blur-sm sm:p-4 md:p-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11"
          style={{ backgroundColor: `${color}20` }}
        >
          <i className={`fa-solid ${icon} text-sm sm:text-base`} style={{ color }} />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-[10px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)] sm:text-[11px]">
            {label}
          </p>
          <p className="mt-0.5 truncate text-base font-bold tabular-nums sm:text-lg md:text-xl" style={{ color }} title={String(value)}>
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
  accentColor,
  children,
}: {
  title: string;
  icon: string;
  accentColor?: string;
  children: React.ReactNode;
}) {
  const color = accentColor ?? "var(--totk-light-green)";
  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/80 p-4 shadow-sm backdrop-blur-sm md:p-6">
      <div className="mb-3 flex min-w-0 items-center gap-3 md:mb-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}20` }}>
          <i className={`fa-solid ${icon}`} style={{ color }} />
        </div>
        <h2 className="min-w-0 truncate text-sm font-semibold tracking-tight text-[var(--totk-light-ocher)] sm:text-base">{title}</h2>
      </div>
      <div className="min-w-0">{children}</div>
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
    <div className="min-w-0 overflow-hidden rounded-xl border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/50 px-3 py-2 sm:px-4 sm:py-3">
      <p className="mb-0.5 truncate text-[10px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)] sm:text-[11px]">
        {label}
      </p>
      <p className={`truncate text-base font-bold tabular-nums sm:text-lg ${accentColor}`} title={typeof value === "string" ? value : undefined}>{value}</p>
    </div>
  );
}
