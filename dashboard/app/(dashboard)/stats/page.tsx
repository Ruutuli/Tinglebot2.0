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
  Legend,
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
    byGender: Array<{ gender: string; count: number }>;
    byRaceByVillage: Array<{ race: string; village: string; count: number }>;
    birthdayByMonth: Array<{ month: number; monthName: string; count: number }>;
    birthdayBySeason: Array<{ season: string; count: number }>;
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
    byType: Array<{ type: string; count: number }>;
    byNpc?: Array<{ npc: string; count: number }>;
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
    topItemsByTotalQuantity: Array<{ itemName: string; totalQuantity: number }>;
  };
}

type CharacterBreakdown = {
  kind: "characters";
  type: string;
  value: string;
  total: number;
  characterNames: Array<{ name: string; id: string; slug: string; homeVillage: string }>;
  breakdown: {
    byHomeVillage: Array<{ village: string; count: number }>;
    byJob?: Array<{ job: string; count: number }>;
    byRace?: Array<{ race: string; count: number }>;
    byGender?: Array<{ gender: string; count: number }>;
    byGenderDetailed?: Array<{ gender: string; count: number }>;
  };
};

type PetBreakdown = {
  kind: "pets";
  type: string;
  value: string;
  total: number;
  pets: Array<{ name: string; species: string; petType: string; level: number; ownerName: string; ownerSlug: string }>;
};

type InventoryCharacterBreakdown = {
  kind: "inventoryCharacter";
  type: string;
  value: string;
  characterName: string | null;
  slug: string | null;
  totalItems: number;
  uniqueItems: number;
};

type InventoryItemBreakdown = {
  kind: "inventoryItem";
  type: string;
  value: string;
  itemName: string;
  total: number;
  characters: Array<{ characterName: string; slug: string }>;
};

type BreakdownData = CharacterBreakdown | PetBreakdown | InventoryCharacterBreakdown | InventoryItemBreakdown;

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
  Unknown: "#9ca3af",
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

const MOBILE_BREAKPOINT = 768;

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

/* ============================================================================ */
/* ------------------- Shared chart components ------------------- */
/* ============================================================================ */

type BarChartDataItem = { name: string; count: number; [key: string]: unknown };

/** Dedupe chart data by name (aggregate counts) and ensure unique tick keys for recharts. */
function dedupeBarChartData(
  data: BarChartDataItem[],
  dataKey: string,
  nameKey: string
): BarChartDataItem[] {
  const map = new Map<string, number>();
  for (const item of data) {
    const name = String(item[nameKey] ?? "Unknown").trim() || "Unknown";
    const val = Number(item[dataKey] ?? 0) || 0;
    map.set(name, (map.get(name) ?? 0) + val);
  }
  return Array.from(map.entries()).map(([name, count]) => ({ [nameKey]: name, [dataKey]: count }));
}

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
  const isMobile = useIsMobile();
  const horizontalBars = layout === "vertical";
  const deduped = useMemo(
    () => dedupeBarChartData(data, dataKey, nameKey),
    [data, dataKey, nameKey]
  );
  const categoryTicks = horizontalBars ? deduped.map((d) => d.name) : undefined;
  const effectiveHeight = isMobile ? Math.min(height, horizontalBars ? 320 : 280) : height;
  const effectiveBarSize = isMobile ? (horizontalBars ? 18 : 22) : barSize;
  const yAxisWidth = horizontalBars ? (isMobile ? 90 : 180) : undefined;
  const tickFontSize = isMobile ? 10 : (horizontalBars ? 10 : 14);
  const labelListFontSize = isMobile ? 11 : 14;
  return (
    <div className={`min-w-0 w-full ${horizontalBars ? "overflow-visible" : "overflow-hidden"}`} style={{ height: effectiveHeight }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <BarChart
          data={deduped}
          layout={layout}
          margin={{ top: horizontalBars ? (isMobile ? 40 : 52) : 32, right: horizontalBars ? (isMobile ? 36 : 80) : 32, left: horizontalBars ? 12 : 12, bottom: horizontalBars ? (isMobile ? 16 : 20) : 8 }}
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
            tick={{ fill: horizontalBars ? CHART_AXIS_PROPS.tickFill : "var(--totk-light-ocher)", fontSize: tickFontSize, fontWeight: horizontalBars ? undefined : 600 }}
            angle={!horizontalBars && data.length > 6 ? -30 : 0}
            textAnchor={!horizontalBars && data.length > 6 ? "end" : "middle"}
            height={!horizontalBars && data.length > 6 ? (isMobile ? 60 : 80) : undefined}
            interval={0}
            dy={!horizontalBars && data.length > 6 ? 15 : undefined}
            dx={!horizontalBars && data.length > 6 ? -8 : undefined}
          />
          <YAxis
            type={horizontalBars ? "category" : "number"}
            dataKey={horizontalBars ? nameKey : undefined}
            stroke={CHART_AXIS_PROPS.stroke}
            tick={{ fill: "var(--totk-light-ocher)", fontSize: isMobile ? 10 : 14, fontWeight: 600 }}
            width={yAxisWidth}
            interval={0}
            ticks={categoryTicks}
            minTickGap={horizontalBars ? 0 : undefined}
          />
          <Tooltip
            {...CHART_TOOLTIP_STYLE}
            formatter={(value: number | undefined) => [`${value ?? 0}`, nameLabel ?? "Count"]}
          />
          <Bar
            dataKey={dataKey}
            name={nameLabel ?? "Count"}
            radius={horizontalBars ? [0, 8, 8, 0] : [8, 8, 0, 0]}
            barSize={effectiveBarSize}
            onClick={onBarClick}
            style={onBarClick ? { cursor: "pointer" } : undefined}
          >
            {barColor
              ? deduped.map((_, index) => <Cell key={index} fill={barColor} />)
              : deduped.map((_, index) => (
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
              fill="var(--totk-light-ocher)"
              fontSize={labelListFontSize}
              fontWeight="bold"
              offset={horizontalBars ? (isMobile ? 4 : 8) : 5}
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
  onSliceClick,
}: {
  data: PieChartDataItem[];
  valueKey?: string;
  nameKey?: string;
  colors: string[] | "village";
  outerRadius?: number;
  labelFormatter?: (name: string, percent: number) => string;
  onSliceClick?: (payload: { name?: string }) => void;
}) {
  const isMobile = useIsMobile();
  const effectiveRadius = isMobile ? Math.min(outerRadius, 70) : outerRadius;
  const getColor = (entry: PieChartDataItem, index: number) =>
    colors === "village" ? getVillageColor(entry.name) : colors[index % colors.length];
  const defaultLabel = (props: { name?: string; percent?: number }) =>
    labelFormatter ? labelFormatter(props.name ?? "", props.percent ?? 0) : `${props.name ?? ""} ${((props.percent ?? 0) * 100).toFixed(0)}%`;
  return (
    <div className={`w-full ${onSliceClick ? "cursor-pointer" : ""} h-48 sm:h-64`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={defaultLabel}
            outerRadius={effectiveRadius}
            dataKey={valueKey}
            onClick={onSliceClick ? (_, index) => {
              const entry = data[index];
              if (entry && typeof entry === "object" && "name" in entry) {
                onSliceClick({ name: String(entry.name) });
              }
            } : undefined}
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

  const handleBreakdownClick = async (type: string, value: string) => {
    try {
      setLoadingBreakdown(true);
      setShowBreakdown(true);
      const res = await fetch(`/api/stats/breakdown?type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}`);
      if (!res.ok) {
        throw new Error("Failed to fetch breakdown");
      }
      const raw = (await res.json()) as BreakdownData | { kind?: string };
      if (raw.kind === "pets") {
        setBreakdownData(raw as PetBreakdown);
      } else if (raw.kind === "inventoryCharacter") {
        setBreakdownData(raw as InventoryCharacterBreakdown);
      } else if (raw.kind === "inventoryItem") {
        setBreakdownData(raw as InventoryItemBreakdown);
      } else {
        setBreakdownData({ ...raw, kind: "characters" } as CharacterBreakdown);
      }
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
        <CharacterStatsSection data={statsData.characters} onBreakdownClick={handleBreakdownClick} />

        {/* Weather Statistics */}
        <WeatherStatsSection data={statsData.weather} />

        {/* Pet Statistics */}
        <PetStatsSection data={statsData.pets} onBreakdownClick={handleBreakdownClick} />

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
        {statsData.inventory && <InventoryStatsSection data={statsData.inventory} onBreakdownClick={handleBreakdownClick} />}
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
  onBreakdownClick,
}: {
  data: StatsData["characters"];
  onBreakdownClick: (type: string, value: string) => void;
}) {
  const isMobile = useIsMobile();
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

  const genderChartData = useMemo(() => {
    const genderMap = new Map<string, number>();
    data.byGender?.forEach((item) => {
      const normalizedName = capitalize((item.gender || "").trim() || "Unknown");
      const currentCount = genderMap.get(normalizedName) || 0;
      genderMap.set(normalizedName, currentCount + item.count);
    });
    return Array.from(genderMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [data.byGender]);

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

  const STACK_VILLAGES = ["Rudania", "Inariko", "Vhintl", "Unknown"];
  type RaceStackRow = { name: string; [k: string]: string | number };
  const raceStackedData = useMemo((): RaceStackRow[] => {
    if (!data.byRaceByVillage?.length) return [];
    const byRace = new Map<string, RaceStackRow>();
    data.byRaceByVillage.forEach(({ race, village, count }) => {
      const normalizedRace = capitalize(race.trim());
      const normalizedVillage = normalizeVillageName(village);
      if (!byRace.has(normalizedRace)) {
        const row: RaceStackRow = { name: normalizedRace };
        STACK_VILLAGES.forEach((v) => (row[v] = 0));
        byRace.set(normalizedRace, row);
      }
      const row = byRace.get(normalizedRace)!;
      row[normalizedVillage] = (Number(row[normalizedVillage]) || 0) + count;
    });
    return Array.from(byRace.values())
      .sort((a, b) => {
        const totalA = STACK_VILLAGES.reduce((s, v) => s + (Number(a[v]) || 0), 0);
        const totalB = STACK_VILLAGES.reduce((s, v) => s + (Number(b[v]) || 0), 0);
        return totalB - totalA;
      });
  }, [data.byRaceByVillage]);

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
          <p className="mb-2 text-xs text-[var(--totk-grey-200)]">Click a slice to see more info.</p>
          <SharedPieChart
            data={villagePieData}
            valueKey="value"
            colors="village"
            outerRadius={100}
            labelFormatter={(name, percent) => `${name} ${(percent * 100).toFixed(0)}%`}
            onSliceClick={(p) => p?.name && onBreakdownClick("homeVillage", p.name)}
          />
        </SectionCard>
      )}

      {jobChartData.length > 0 && (
        <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/80 p-4 shadow-sm backdrop-blur-sm md:p-6">
          <div className="mb-3 flex min-w-0 items-center gap-3 md:mb-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${SECTION_ACCENT_COLORS.characters}20` }}>
              <i className="fa-solid fa-briefcase" style={{ color: SECTION_ACCENT_COLORS.characters }} />
            </div>
            <h2 className="min-w-0 truncate text-sm font-semibold tracking-tight text-[var(--totk-light-ocher)] sm:text-base">Characters by Job</h2>
          </div>
          <div className="min-w-0 overflow-x-auto">
            <p className="mb-2 text-xs text-[var(--totk-grey-200)]">Click a bar to see more info.</p>
            <div className="w-full pt-4">
              <div className="w-full min-w-0 max-h-[20rem] overflow-y-auto overflow-x-auto md:max-h-none md:h-[38rem] md:overflow-visible">
                <SharedBarChart
                  data={jobChartData}
                  layout="horizontal"
                  height={600}
                  barSize={36}
                  colorByIndex
                  onBarClick={(payload) => payload?.name && onBreakdownClick("job", payload.name)}
                  nameLabel="Characters"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {genderChartData.length > 0 && (
        <SectionCard title="Characters by Gender" icon="fa-venus-mars" accentColor={SECTION_ACCENT_COLORS.characters}>
          <p className="mb-2 text-xs text-[var(--totk-grey-200)]">Click a bar to see more info.</p>
          <SharedBarChart
            data={genderChartData}
            layout="vertical"
            height={Math.max(200, genderChartData.length * 40 + 50)}
            barColor={SECTION_ACCENT_HEX.characters}
            barSize={32}
            onBarClick={(payload) => payload?.name && onBreakdownClick("gender", payload.name)}
            nameLabel="Characters"
          />
        </SectionCard>
      )}

      {raceChartData.length > 0 && (
        <div className="min-w-0 overflow-hidden rounded-2xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/80 p-4 shadow-sm backdrop-blur-sm md:p-6">
          <div className="mb-3 flex min-w-0 items-center gap-3 md:mb-5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${SECTION_ACCENT_COLORS.characters}20` }}>
              <i className="fa-solid fa-users" style={{ color: SECTION_ACCENT_COLORS.characters }} />
            </div>
            <h2 className="min-w-0 truncate text-sm font-semibold tracking-tight text-[var(--totk-light-ocher)] sm:text-base">Characters by Race</h2>
          </div>
          <div className="min-w-0 overflow-x-auto">
            <p className="mb-2 text-xs text-[var(--totk-grey-200)]">Click a bar to see more info.</p>
            <div className="w-full pt-4">
              <div className="w-full min-w-0 max-h-[20rem] overflow-y-auto overflow-x-auto md:max-h-none md:overflow-visible" style={{ minHeight: "12rem" }}>
                <SharedBarChart
                  data={raceChartData}
                  layout="horizontal"
                  height={Math.max(600, raceChartData.length * 50 + 100)}
                  barSize={86}
                  colorByIndex
                  onBarClick={(payload) => payload?.name && onBreakdownClick("race", payload.name)}
                  nameLabel="Characters"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {raceStackedData.length > 0 && (
        <SectionCard title="Characters by Race by Village" icon="fa-users" accentColor={SECTION_ACCENT_COLORS.characters}>
          <p className="mb-2 text-xs text-[var(--totk-grey-200)]">Stacked by home village. Click a bar to see more info.</p>
          <div className="w-full min-w-0 overflow-x-auto">
            <div className="w-full min-w-0 max-h-[20rem] overflow-y-auto overflow-x-auto md:max-h-none md:overflow-visible" style={{ height: isMobile ? 320 : Math.max(600, raceStackedData.length * 50 + 100), minHeight: isMobile ? 200 : undefined }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                  <BarChart
                    data={raceStackedData}
                    layout="vertical"
                    margin={{ top: 8, right: isMobile ? 28 : 44, left: 4, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_AXIS_PROPS.gridStroke} opacity={CHART_AXIS_PROPS.gridOpacity} />
                    <XAxis type="number" stroke={CHART_AXIS_PROPS.stroke} tick={{ fill: CHART_AXIS_PROPS.tickFill, fontSize: isMobile ? 10 : 11 }} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" stroke={CHART_AXIS_PROPS.stroke} tick={{ fill: "var(--botw-pale)", fontSize: isMobile ? 10 : 13, fontWeight: 600 }} width={isMobile ? 100 : 160} interval={0} tickLine={false} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length || !label) return null;
                        const row = payload[0]?.payload as RaceStackRow;
                        const total = STACK_VILLAGES.reduce((s, v) => s + (Number(row?.[v]) || 0), 0);
                        return (
                          <div className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2.5 shadow-lg" style={CHART_TOOLTIP_STYLE.contentStyle as React.CSSProperties}>
                            <p className="font-semibold text-[var(--totk-light-green)]">{label}</p>
                            <p className="mt-1 text-xs text-[var(--botw-pale)]">Total: {total} character{total !== 1 ? "s" : ""}</p>
                            <ul className="mt-1.5 space-y-0.5 border-t border-[var(--totk-dark-ocher)]/30 pt-1.5">
                              {STACK_VILLAGES.filter((v) => (Number(row?.[v]) || 0) > 0).map((v) => (
                                <li key={v} className="flex items-center gap-2 text-xs">
                                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: getVillageColor(v) }} />
                                  {v}: {Number(row?.[v]) || 0}
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      }}
                      cursor={CHART_TOOLTIP_STYLE.cursor}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} formatter={(value) => <span style={{ color: "var(--botw-pale)" }}>{value}</span>} />
                    {STACK_VILLAGES.map((village, idx) => (
                      <Bar
                        key={village}
                        dataKey={village}
                        stackId="race"
                        fill={getVillageColor(village)}
                        name={village}
                        barSize={isMobile ? 18 : 28}
                        radius={idx === STACK_VILLAGES.length - 1 ? [0, 6, 6, 0] : 0}
                        onClick={(data: { name?: string }) => data?.name && onBreakdownClick("race", data.name)}
                        style={{ cursor: "pointer" }}
                      >
                        {idx === STACK_VILLAGES.length - 1 && (
                          <LabelList
                            position="right"
                            content={(props: unknown) => {
                              const p = props as { x?: string | number; y?: string | number; width?: string | number; height?: string | number; payload?: RaceStackRow };
                              const row = p.payload;
                              const total = row ? STACK_VILLAGES.reduce((s, v) => s + (Number(row[v]) || 0), 0) : 0;
                              if (total === 0) return null;
                              const x = Number(p.x) + Number(p.width) + 6;
                              const y = Number(p.y) + Number(p.height) / 2;
                              return (
                                <text x={x} y={y} fill="var(--totk-light-ocher)" fontSize={isMobile ? 11 : 14} fontWeight={600} dominantBaseline="middle">
                                  {total}
                                </text>
                              );
                            }}
                          />
                        )}
                      </Bar>
                    ))}
                  </BarChart>
                </ResponsiveContainer>
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

      {/* Birthdays by month / season */}
      {(data.birthdayByMonth?.some((m) => m.count > 0) || data.birthdayBySeason?.some((s) => s.count > 0)) && (
        <SectionCard title="Birthdays" icon="fa-calendar-star" accentColor={SECTION_ACCENT_COLORS.characters}>
          <p className="mb-4 text-xs text-[var(--totk-grey-200)]">Character birthdays by month and season.</p>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {data.birthdayByMonth?.some((m) => m.count > 0) && (
              <div className="min-w-0">
                <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Month</h4>
                <SharedBarChart
                  data={data.birthdayByMonth.map((m) => ({ name: m.monthName.slice(0, 3), count: m.count }))}
                  layout="vertical"
                  height={280}
                  barColor={SECTION_ACCENT_HEX.characters}
                  barSize={20}
                  nameLabel="Characters"
                />
              </div>
            )}
            {data.birthdayBySeason?.some((s) => s.count > 0) && (
              <div className="min-w-0">
                <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Season</h4>
                <SharedPieChart
                  data={data.birthdayBySeason.map((s) => ({ name: s.season, value: s.count }))}
                  valueKey="value"
                  colors={[VILLAGE_COLORS.Rudania, SECTION_ACCENT_HEX.characters, "#7FB3FF", "#b99f65"]}
                  outerRadius={80}
                  labelFormatter={(name, percent) => `${name} ${(percent * 100).toFixed(0)}%`}
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

function PetStatsSection({ data, onBreakdownClick }: { data: StatsData["pets"]; onBreakdownClick: (type: string, value: string) => void }) {
  const speciesChartData = useMemo(() => {
    return data.bySpecies.map((item) => ({
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

  const getRawTypeFromDisplayName = (displayName: string): string | undefined => {
    const found = data.byType.find(
      (i) => capitalize((i.type || "").replace(/_/g, " ")) === displayName
    );
    return found?.type;
  };

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
          <p className="mb-2 text-xs text-[var(--totk-grey-200)]">
            Species = kind of animal (e.g. dog, cat). Type = pet category (e.g. companion, battle).
          </p>
          <p className="mb-4 text-xs text-[var(--totk-grey-200)]">Click a bar to see more info.</p>
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
            {speciesChartData.length > 0 && (
              <div className="min-w-0 overflow-x-auto">
                <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Species</h4>
                <SharedBarChart
                  data={speciesChartData}
                  layout="vertical"
                  height={Math.max(256, speciesChartData.length * 32 + 50)}
                  barColor={SECTION_ACCENT_HEX.pets}
                  nameLabel="Pets"
                  onBarClick={(payload) => payload?.name && onBreakdownClick("petSpecies", payload.name)}
                />
              </div>
            )}
            {typeChartData.length > 0 && (
              <div className="min-w-0 overflow-x-auto">
                <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Type</h4>
                <SharedBarChart
                  data={typeChartData}
                  layout="vertical"
                  height={256}
                  barColor={CHART_SEQUENTIAL_COLORS[2]}
                  nameLabel="Pets"
                  onBarClick={(payload) => {
                    if (!payload?.name) return;
                    const raw = getRawTypeFromDisplayName(payload.name);
                    if (raw) onBreakdownClick("petType", raw);
                  }}
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
            <div className="min-w-0 overflow-x-auto">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Species</h4>
              <SharedBarChart data={speciesData} layout="vertical" height={256} barColor={CHART_SEQUENTIAL_COLORS[0]} barSize={24} />
            </div>
          )}
          {levelData.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Level</h4>
              <SharedBarChart data={levelData} layout="vertical" height={256} barColor={CHART_SEQUENTIAL_COLORS[2]} barSize={24} />
            </div>
          )}
          {regionData.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
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
            <div className="min-w-0 overflow-x-auto">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Type</h4>
              <SharedBarChart data={byTypeData} layout="vertical" height={256} barColor={SECTION_ACCENT_HEX.quests} barSize={28} />
            </div>
          )}
          {byStatusData.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
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
  const byTypeData = useMemo(() => data.byType.map((i) => ({ name: capitalize(i.type), count: i.count })), [data.byType]);
  const byNpcData = useMemo(() => (data.byNpc ?? []).map((i) => ({ name: i.npc || "Unknown", count: i.count })), [data.byNpc]);
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
          {byTypeData.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Type</h4>
              <SharedBarChart data={byTypeData} layout="vertical" height={220} barColor={SECTION_ACCENT_HEX.helpWanted} barSize={24} />
            </div>
          )}
          {byNpcData.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By NPC</h4>
              <SharedBarChart data={byNpcData} layout="horizontal" height={220} barColor={SECTION_ACCENT_HEX.helpWanted} barSize={24} />
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
        <div className="min-w-0 overflow-x-auto">
          <SharedBarChart
            data={byTypeData}
            layout="vertical"
            height={320}
            barColor={SECTION_ACCENT_HEX.relationships}
            barSize={24}
          />
        </div>
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
  const byResultPieData = useMemo(() => byResultData.map((d) => ({ name: d.name, value: d.count })), [byResultData]);
  const byTierData = useMemo(() => data.byTier.map((i) => ({ name: `Tier ${i.tier}`, count: i.count })), [data.byTier]);

  if (data.total === 0) return null;
  return (
    <div className="space-y-6">
      <SectionCard title="Raid Statistics" icon="fa-dragon" accentColor={SECTION_ACCENT_COLORS.raids}>
        <p className="mb-4 text-sm text-[var(--botw-pale)]">{data.total.toLocaleString()} total raids</p>
        <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {byVillageData.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Village</h4>
              <SharedBarChart data={byVillageData} layout="vertical" height={180} barColor={SECTION_ACCENT_HEX.raids} barSize={24} />
            </div>
          )}
          {byResultPieData.length > 0 && (
            <div className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Result</h4>
              <SharedPieChart
                data={byResultPieData}
                valueKey="value"
                colors={CHART_SEQUENTIAL_COLORS.slice(0, 4)}
                outerRadius={80}
                labelFormatter={(name, percent) => `${name} ${(percent * 100).toFixed(0)}%`}
              />
            </div>
          )}
          {byTierData.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
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
          {topVictimsData.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
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
            <div className="min-w-0 overflow-x-auto">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Game Type</h4>
              <SharedBarChart data={byGameTypeData} layout="vertical" height={140} barColor={SECTION_ACCENT_HEX.minigames} barSize={24} />
            </div>
          )}
          {byStatusData.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">By Status</h4>
              <SharedBarChart data={byStatusData} layout="vertical" height={140} barColor={SECTION_ACCENT_HEX.minigames} barSize={24} />
            </div>
          )}
          {byVillageData.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
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
type InventoryItemRow = { itemName: string; totalQuantity: number };

function InventoryStatsSection({ data, onBreakdownClick }: { data: StatsData["inventory"]; onBreakdownClick: (type: string, value: string) => void }) {
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
    () => data.topItemsByTotalQuantity.map((i: InventoryItemRow) => ({ name: i.itemName, count: i.totalQuantity })),
    [data.topItemsByTotalQuantity]
  );

  if (data.topCharactersByItems.length === 0 && data.topItemsByTotalQuantity.length === 0) return null;
  return (
    <div className="space-y-6">
      <SectionCard title="Inventory" icon="fa-box" accentColor={SECTION_ACCENT_COLORS.inventory}>
        <p className="mb-2 text-sm text-[var(--botw-pale)]">
          Characters with the most items (total quantity) and items owned by the most characters.
        </p>
        <p className="mb-4 text-xs text-[var(--totk-grey-200)]">Click a character to see more info.</p>
        <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
          {topCharactersData.length > 0 && (
            <div className="min-w-0">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">Characters with most items</h4>
              <div className="space-y-1.5 sm:space-y-2">
                {topCharactersData.slice(0, 15).map((c: { name: string; count: number; slug: string; uniqueItems: number }) => (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => onBreakdownClick("inventoryCharacter", c.slug)}
                    className="flex min-h-[44px] min-w-0 w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/20 px-3 py-2 text-left transition-colors hover:bg-[var(--totk-dark-ocher)]/20 active:bg-[var(--totk-dark-ocher)]/20 sm:px-4"
                  >
                    <span className="min-w-0 truncate font-medium text-[var(--botw-pale)]" title={c.name}>{c.name}</span>
                    <span className="shrink-0 tabular-nums text-sm text-[var(--totk-light-green)] sm:text-base">
                      {c.count.toLocaleString()} items{c.uniqueItems !== c.count ? ` (${c.uniqueItems})` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {topItemsData.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
              <h4 className="mb-2 text-sm font-semibold text-[var(--totk-light-ocher)]">Items by total quantity</h4>
              <div className="min-w-[200px] min-h-0 max-h-[20rem] overflow-y-auto overflow-x-auto md:max-h-none md:min-h-[600px] md:overflow-visible">
                <SharedBarChart
                  data={topItemsData}
                  layout="vertical"
                  height={Math.max(600, topItemsData.length * 40)}
                  barColor={SECTION_ACCENT_HEX.inventory}
                  barSize={22}
                  nameLabel="Total quantity"
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
          data.kind === "inventoryCharacter" ? (
            <div className="space-y-6">
              <div className="border-b border-[var(--totk-dark-ocher)]/30 pb-4">
                <h2 className="text-2xl font-bold text-[var(--totk-light-ocher)]">
                  Inventory: {data.characterName ?? data.value}
                </h2>
                {data.slug && (
                  <Link
                    href={`/characters/${data.slug}`}
                    className="mt-2 inline-block text-sm text-[var(--totk-light-green)] underline hover:opacity-80"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View character page
                  </Link>
                )}
                <p className="mt-1 text-[var(--botw-pale)]">
                  Total items: {data.totalItems.toLocaleString()} · Unique: {data.uniqueItems.toLocaleString()}
                </p>
              </div>
            </div>
          ) : data.kind === "inventoryItem" ? (
            <div className="space-y-6">
              <div className="border-b border-[var(--totk-dark-ocher)]/30 pb-4">
                <h2 className="text-2xl font-bold text-[var(--totk-light-ocher)]">Item: {capitalize(data.itemName)}</h2>
                <p className="mt-1 text-[var(--botw-pale)]">
                  Owned by {data.total} character{data.total !== 1 ? "s" : ""}
                </p>
              </div>
              <div>
                <h3 className="mb-3 text-lg font-semibold text-[var(--totk-light-green)]">Characters</h3>
                <div className="flex flex-wrap gap-2 sm:gap-2">
                  {data.characters.map((c, idx) => (
                    <Link
                      key={idx}
                      href={`/characters/${c.slug}`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--totk-grey-400)]/20 px-3 py-2 text-sm text-[var(--botw-pale)] transition-colors hover:opacity-80 active:opacity-90 sm:py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {c.characterName}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : data.kind === "pets" ? (
            <div className="space-y-6">
              <div className="border-b border-[var(--totk-dark-ocher)]/30 pb-4">
                <h2 className="text-2xl font-bold text-[var(--totk-light-ocher)]">
                  {data.type === "petSpecies" ? "Species" : "Type"}: {capitalize(data.value.replace(/_/g, " "))}
                </h2>
                <p className="mt-1 text-[var(--botw-pale)]">
                  Total: {data.total} pet{data.total !== 1 ? "s" : ""}
                </p>
              </div>
              <div>
                <h3 className="mb-3 text-lg font-semibold text-[var(--totk-light-green)]">Pets</h3>
                <div className="flex flex-wrap gap-2 sm:gap-2">
                  {data.pets.map((pet, idx) => (
                    <Link
                      key={idx}
                      href={`/characters/${pet.ownerSlug}`}
                      className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--totk-grey-400)]/20 px-3 py-2 text-sm text-[var(--botw-pale)] transition-colors hover:opacity-80 active:opacity-90 sm:py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {pet.name} <span className="text-[var(--totk-grey-200)]">({pet.ownerName})</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="border-b border-[var(--totk-dark-ocher)]/30 pb-4">
                <h2 className="text-2xl font-bold text-[var(--totk-light-ocher)]">
                  {capitalize(data.type)}: {capitalize(data.value)}
                </h2>
                <p className="mt-1 text-[var(--botw-pale)]">
                  Total: {data.total} character{data.total !== 1 ? "s" : ""}
                </p>
              </div>

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

              <div className="grid gap-6 md:grid-cols-2">
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

                {data.breakdown.byGenderDetailed && (
                  <div>
                    <h3 className="mb-3 text-lg font-semibold text-[var(--totk-light-green)]">
                      Detailed Gender Breakdown
                    </h3>
                    <div className="space-y-2">
                      {data.breakdown.byGenderDetailed.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/20 px-4 py-2"
                        >
                          <span className="text-[var(--botw-pale)]">{item.gender || "Unknown"}</span>
                          <span className="font-semibold text-[var(--totk-light-green)]">
                            {item.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

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

                {data.breakdown.byGender && (
                  <div>
                    <h3 className="mb-3 text-lg font-semibold text-[var(--totk-light-green)]">
                      By Gender
                    </h3>
                    <div className="space-y-2">
                      {data.breakdown.byGender.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/20 px-4 py-2"
                        >
                          <span className="text-[var(--botw-pale)]">{capitalize(item.gender)}</span>
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
          )
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
