"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";
import type {
  MyRankData,
  LeaderboardEntry,
  BlupeeHunterEntry,
  ExchangePreview,
} from "@/types/levels";

const TAB_VALUES = ["my-rank", "leaderboard", "blupee-hunters", "exchange"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function parseTab(s: string | null): TabValue {
  if (s && TAB_VALUES.includes(s as TabValue)) return s as TabValue;
  return "my-rank";
}

function formatRelativeTime(date: Date | string | null): string {
  if (!date) return "Never";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 365) return `${diffDays}d ago`;
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y ago`;
}

function getMedalEmoji(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return `#${rank}`;
}

export default function LevelsPage() {
  const { user: sessionUser, loading: sessionLoading } = useSession();
  const searchParams = useSearchParams();
  const tab = useMemo(() => parseTab(searchParams.get("tab")), [searchParams]);

  const [myRankData, setMyRankData] = useState<MyRankData | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [blupeeHunters, setBlupeeHunters] = useState<BlupeeHunterEntry[]>([]);
  const [exchangePreview, setExchangePreview] = useState<ExchangePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(false);

  const tabs: { value: TabValue; label: string; icon: string }[] = [
    { value: "my-rank", label: "My Rank", icon: "fa-user-circle" },
    { value: "leaderboard", label: "Leaderboard", icon: "fa-trophy" },
    { value: "blupee-hunters", label: "Blupee Hunters", icon: "fa-paw" },
    { value: "exchange", label: "Exchange", icon: "fa-exchange-alt" },
  ];

  useEffect(() => {
    if (sessionLoading) return;

    if (!sessionUser) {
      setError("Please log in to view levels & progression");
      setLoading(false);
      return;
    }

    const abortController = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [rankRes, leaderboardRes, blupeeRes, exchangeRes] = await Promise.all([
          fetch("/api/levels/my-rank", { signal: abortController.signal }),
          fetch("/api/levels/leaderboard", { signal: abortController.signal }),
          fetch("/api/levels/blupee-hunters", { signal: abortController.signal }),
          fetch("/api/levels/exchange", { signal: abortController.signal }),
        ]);

        if (abortController.signal.aborted) return;

        if (!rankRes.ok || !leaderboardRes.ok || !blupeeRes.ok || !exchangeRes.ok) {
          throw new Error("Failed to fetch data");
        }

        const [rankData, leaderboardData, blupeeData, exchangeData] = await Promise.all([
          rankRes.json(),
          leaderboardRes.json(),
          blupeeRes.json(),
          exchangeRes.json(),
        ]);

        if (abortController.signal.aborted) return;

        setMyRankData(rankData);
        setLeaderboard(leaderboardData.leaderboard);
        setBlupeeHunters(blupeeData.leaderboard);
        setExchangePreview(exchangeData);
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

    fetchData();

    return () => {
      abortController.abort();
    };
  }, [sessionUser, sessionLoading]);

  const handleExchange = async () => {
    if (!exchangePreview || exchangePreview.exchangeableLevels <= 0) return;

    try {
      setExchanging(true);
      const res = await fetch("/api/levels/exchange", { method: "POST" });
      const data = await res.json();

      if (data.success) {
        // Refresh exchange preview, rank data, and leaderboard
        const [exchangeRes, rankRes, leaderboardRes] = await Promise.all([
          fetch("/api/levels/exchange"),
          fetch("/api/levels/my-rank"),
          fetch("/api/levels/leaderboard"),
        ]);
        const [exchangeData, rankData, leaderboardData] = await Promise.all([
          exchangeRes.json(),
          rankRes.json(),
          leaderboardRes.json(),
        ]);
        setExchangePreview(exchangeData);
        setMyRankData(rankData);
        setLeaderboard(leaderboardData.leaderboard);
        alert(`Successfully exchanged ${data.levelsExchanged} levels for ${data.tokensReceived} tokens!`);
      } else {
        alert(data.error || "Failed to exchange levels");
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      alert(`Failed to exchange levels: ${error.message}`);
    } finally {
      setExchanging(false);
    }
  };

  if (sessionLoading || loading) {
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

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-[var(--totk-light-green)] mb-2">
            Levels & Progression
          </h1>
          <p className="text-[var(--botw-pale)]">
            Track your server activity level, view the leaderboard, and exchange your earned levels for tokens!
          </p>
        </div>

        <nav
          className="flex flex-wrap gap-2 rounded-2xl border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/60 p-2 shadow-inner backdrop-blur-md"
          aria-label="Levels sections"
        >
          {tabs.map(({ value, label, icon }) => (
            <Link
              key={value}
              href={`/levels?tab=${value}`}
              className={`flex min-w-[140px] flex-1 items-center justify-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${
                tab === value
                  ? "bg-gradient-to-r from-[var(--totk-dark-ocher)] to-[var(--totk-mid-ocher)] text-[var(--totk-ivory)] shadow-lg shadow-[var(--totk-dark-ocher)]/20 scale-[1.02] z-10"
                  : "bg-[var(--totk-dark-ocher)]/10 text-[var(--botw-pale)] hover:bg-[var(--totk-dark-ocher)]/20 hover:text-[var(--totk-light-ocher)]"
              }`}
              aria-current={tab === value ? "page" : undefined}
            >
              <i className={`fa-solid ${icon} text-base opacity-90`} />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        {tab === "my-rank" && myRankData && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Your Level Card */}
            <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/40 via-[var(--botw-warm-black)]/50 to-[var(--totk-brown)]/40 p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <i className="fa-solid fa-star text-[var(--botw-blue)] text-xl" />
                <h2 className="text-xl font-bold text-[var(--totk-light-green)]">Your Level</h2>
              </div>
              <div className="text-4xl font-bold text-[var(--botw-blue)] mb-4">
                Level {myRankData.level}
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-[var(--totk-grey-200)]">Rank</span>
                  <span className="text-sm font-semibold text-[var(--botw-pale)]">#{myRankData.rank}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[var(--totk-grey-200)]">Total XP</span>
                  <span className="text-sm font-semibold text-[var(--botw-pale)]">{myRankData.totalXP.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[var(--totk-grey-200)]">Messages</span>
                  <span className="text-sm font-semibold text-[var(--botw-pale)]">{myRankData.messages.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Progress to Next Level Card */}
            <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/40 via-[var(--botw-warm-black)]/50 to-[var(--totk-brown)]/40 p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-4">
                <i className="fa-solid fa-chart-line text-[var(--botw-blue)] text-xl" />
                <h2 className="text-xl font-bold text-[var(--totk-light-green)]">Progress to Next Level</h2>
              </div>
              <div className="text-4xl font-bold text-[var(--botw-blue)] mb-4">
                Level {myRankData.level + 1}
              </div>
              <div className="mb-2 flex items-center justify-between text-xs text-[var(--botw-pale)]">
                <span>{myRankData.progressPercentage}%</span>
                <span>
                  {myRankData.currentXP.toLocaleString()} / {myRankData.nextLevelXP.toLocaleString()} XP
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-[var(--totk-grey-400)]/80 mb-4">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${myRankData.progressPercentage}%`,
                    background: "linear-gradient(90deg, var(--botw-blue), var(--botw-dark-blue))",
                  }}
                />
              </div>
              {myRankData.hasImportedFromMee6 && myRankData.importedMee6Level && (
                <div className="flex items-center gap-2 rounded-lg bg-[var(--totk-green)]/20 border border-[var(--totk-green)]/40 p-2">
                  <i className="fa-solid fa-info-circle text-[var(--totk-light-green)] text-xs" />
                  <p className="text-xs text-[var(--totk-light-green)]">
                    Imported from MEE6 (Level {myRankData.importedMee6Level})
                  </p>
                </div>
              )}
            </div>

            {/* Exchange Preview Card */}
            {exchangePreview && (
              <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/40 via-[var(--botw-warm-black)]/50 to-[var(--totk-brown)]/40 p-6 shadow-lg">
                <div className="flex items-center gap-2 mb-2">
                  <i className="fa-solid fa-coins text-[var(--botw-blue)] text-xl" />
                  <h2 className="text-xl font-bold text-[var(--totk-light-green)]">Exchange Preview</h2>
                </div>
                <p className="text-sm text-[var(--botw-pale)] mb-4">Convert levels to tokens</p>
                <div className="space-y-3 mb-4">
                  <div>
                    <div className="text-xs text-[var(--totk-grey-200)] mb-1">Exchangeable Levels</div>
                    <div className="text-2xl font-bold text-[var(--botw-blue)]">
                      {exchangePreview.exchangeableLevels}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--totk-grey-200)] mb-1">Potential Tokens</div>
                    <div className="text-2xl font-bold text-[var(--botw-blue)]">
                      {exchangePreview.potentialTokens.toLocaleString()}
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleExchange}
                  disabled={exchanging || exchangePreview.exchangeableLevels <= 0}
                  className={`w-full rounded-lg px-4 py-2 font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${
                    exchangePreview.exchangeableLevels > 0 && !exchanging
                      ? "bg-gradient-to-r from-[var(--botw-blue)] to-[var(--botw-dark-blue)] text-white hover:shadow-lg hover:shadow-[var(--botw-blue)]/30"
                      : "bg-[var(--totk-grey-400)] text-[var(--totk-grey-200)] cursor-not-allowed"
                  }`}
                >
                  <i className="fa-solid fa-exchange-alt" />
                  <span>{exchanging ? "Exchanging..." : "Go to Exchange"}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "leaderboard" && (
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/40 via-[var(--botw-warm-black)]/50 to-[var(--totk-brown)]/40 p-6 shadow-lg">
            <h2 className="text-2xl font-bold text-[var(--totk-light-green)] mb-6">Top Yappers</h2>
            <div className="space-y-3">
              {leaderboard.map((entry) => {
                const avatarUrl = entry.avatar
                  ? `https://cdn.discordapp.com/avatars/${entry.discordId}/${entry.avatar}.png?size=64`
                  : null;
                return (
                  <div
                    key={entry.discordId}
                    className="flex items-center gap-4 rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/60 p-4 hover:bg-[var(--botw-warm-black)]/80 transition-colors"
                  >
                    <div className="text-2xl font-bold text-[var(--totk-light-green)] min-w-[3rem]">
                      {getMedalEmoji(entry.rank)}
                    </div>
                    <img
                      src={avatarUrl || "/ankle_icon.png"}
                      alt={entry.username}
                      className="h-12 w-12 rounded-full border-2 border-[var(--totk-dark-ocher)] object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = "/ankle_icon.png";
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[var(--totk-light-green)] truncate">
                        {entry.nickname || entry.username}
                      </div>
                      <div className="text-sm text-[var(--botw-pale)]">
                        Level {entry.level} • {entry.totalXP.toLocaleString()} XP • {entry.messages.toLocaleString()} messages
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "blupee-hunters" && (
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/40 via-[var(--botw-warm-black)]/50 to-[var(--totk-brown)]/40 p-6 shadow-lg">
            <h2 className="text-2xl font-bold text-[var(--totk-light-green)] mb-6">Top Blupee Hunters</h2>
            <div className="space-y-3">
              {blupeeHunters.map((entry) => {
                const avatarUrl = entry.avatar
                  ? `https://cdn.discordapp.com/avatars/${entry.discordId}/${entry.avatar}.png?size=64`
                  : null;
                return (
                  <div
                    key={entry.discordId}
                    className="flex items-center gap-4 rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/60 p-4 hover:bg-[var(--botw-warm-black)]/80 transition-colors"
                  >
                    <div className="text-2xl font-bold text-[var(--totk-light-green)] min-w-[3rem]">
                      {getMedalEmoji(entry.rank)}
                    </div>
                    <img
                      src={avatarUrl || "/ankle_icon.png"}
                      alt={entry.username}
                      className="h-12 w-12 rounded-full border-2 border-[var(--totk-dark-ocher)] object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = "/ankle_icon.png";
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[var(--totk-light-green)] truncate">
                        {entry.nickname || entry.username}
                      </div>
                      <div className="text-sm text-[var(--botw-pale)]">
                        🐰 {entry.totalClaimed} Blupees • Last: {formatRelativeTime(entry.lastClaimed)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "exchange" && exchangePreview && (
          <div className="space-y-6">
            <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/40 via-[var(--botw-warm-black)]/50 to-[var(--totk-brown)]/40 p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <i className="fa-solid fa-exchange-alt text-[var(--totk-light-green)] text-xl" />
                <h2 className="text-2xl font-bold text-[var(--totk-light-green)]">Exchange Levels for Tokens</h2>
              </div>
              <p className="text-[var(--botw-pale)] mb-6">Convert your earned levels into tokens to spend in the village shops!</p>
              
              {/* Four cards in a row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/60 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fa-solid fa-arrow-up text-[var(--totk-light-green)]" />
                    <div className="text-sm font-semibold text-[var(--totk-grey-200)]">Current Level</div>
                  </div>
                  <div className="text-2xl font-bold text-[var(--totk-light-green)]">
                    Level {exchangePreview.currentLevel}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/60 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fa-solid fa-rotate text-[var(--totk-light-green)]" />
                    <div className="text-sm font-semibold text-[var(--totk-grey-200)]">Last Exchanged Level</div>
                  </div>
                  <div className="text-2xl font-bold text-[var(--totk-light-green)]">
                    Level {exchangePreview.lastExchangedLevel}
                  </div>
                </div>
                <div className="rounded-lg border-2 border-[var(--botw-blue)]/60 bg-[var(--botw-warm-black)]/60 p-4 shadow-[0_0_10px_rgba(0,163,218,0.3)]">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fa-solid fa-arrow-up text-[var(--botw-blue)]" />
                    <div className="text-sm font-semibold text-[var(--totk-grey-200)]">Exchangeable Levels</div>
                  </div>
                  <div className="text-2xl font-bold text-[var(--botw-blue)]">
                    {exchangePreview.exchangeableLevels}
                  </div>
                </div>
                <div className="rounded-lg border-2 border-[var(--botw-blue)]/60 bg-[var(--botw-warm-black)]/60 p-4 shadow-[0_0_10px_rgba(0,163,218,0.3)]">
                  <div className="flex items-center gap-2 mb-2">
                    <i className="fa-solid fa-coins text-[var(--botw-blue)]" />
                    <div className="text-sm font-semibold text-[var(--totk-grey-200)]">Tokens You'll Receive</div>
                  </div>
                  <div className="text-2xl font-bold text-[var(--botw-blue)]">
                    {exchangePreview.potentialTokens.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Exchange Rate */}
              <div className="mb-6 p-3 rounded-lg bg-[var(--totk-green)]/10 border-2 border-[var(--totk-green)]/40 flex items-center justify-center gap-2">
                <i className="fa-solid fa-info-circle text-[var(--totk-light-green)]" />
                <p className="text-sm text-[var(--botw-pale)]">
                  <span className="font-semibold text-[var(--totk-light-green)]">Exchange Rate:</span> 1 Level = 100 Tokens
                </p>
              </div>

              {/* Exchange Button */}
              <button
                onClick={handleExchange}
                disabled={exchanging || exchangePreview.exchangeableLevels <= 0}
                className={`w-full rounded-lg px-6 py-3 font-semibold transition-all duration-300 flex items-center justify-center gap-2 mb-4 ${
                  exchangePreview.exchangeableLevels > 0 && !exchanging
                    ? "bg-gradient-to-r from-[var(--botw-blue)] to-[var(--botw-dark-blue)] text-white hover:shadow-lg hover:shadow-[var(--botw-blue)]/30"
                    : "bg-[var(--totk-grey-400)] text-[var(--totk-grey-200)] cursor-not-allowed"
                }`}
              >
                <i className="fa-solid fa-exchange-alt" />
                <span>{exchanging ? "Exchanging..." : "Exchange Levels"}</span>
              </button>

              {/* Confirmation Message */}
              {exchangePreview.exchangeableLevels > 0 ? (
                <div className="p-3 rounded-lg">
                  <p className="text-sm text-[var(--totk-light-green)] text-center font-medium">
                    You can exchange {exchangePreview.exchangeableLevels} level(s) for {exchangePreview.potentialTokens.toLocaleString()} tokens!
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-lg">
                  <p className="text-sm text-[var(--botw-pale)] text-center">
                    No levels available to exchange. Level up to earn exchangeable levels!
                  </p>
                </div>
              )}
            </div>

            {/* Exchange History */}
            <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--totk-brown)]/40 via-[var(--botw-warm-black)]/50 to-[var(--totk-brown)]/40 p-6 shadow-lg">
              <div className="flex items-center gap-2 mb-6">
                <i className="fa-solid fa-rotate text-[var(--totk-light-green)] text-xl" />
                <h2 className="text-2xl font-bold text-[var(--totk-light-green)]">Exchange History</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/60 p-4">
                  <div className="text-sm font-semibold text-[var(--totk-grey-200)] mb-1">Total Levels Exchanged</div>
                  <div className="text-2xl font-bold text-[var(--totk-light-green)]">
                    {exchangePreview.totalLevelsExchanged}
                  </div>
                </div>
                <div className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/60 p-4">
                  <div className="text-sm font-semibold text-[var(--totk-grey-200)] mb-1">Current Token Balance</div>
                  <div className="text-2xl font-bold text-[var(--totk-light-green)]">
                    {exchangePreview.currentTokenBalance.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
