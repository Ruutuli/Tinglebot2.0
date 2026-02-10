"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

import { useEffect, useState, useMemo, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import { useSession } from "@/hooks/use-session";
import type {
  UserProfile,
  UserProfileResponse,
  HelpWantedCompletion,
  QuestCompletion,
  ActivityData,
} from "@/types/user";
import { Loading, Tabs } from "@/components/ui";
import { capitalize } from "@/lib/string-utils";
import {
  LineChart,
  Line,
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
  AreaChart,
  Area,
  ComposedChart,
  LabelList,
} from "recharts";

const TAB_VALUES = ["profile", "levels", "notifications", "quests", "help-wanted", "tokens"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function parseTab(s: string | null): TabValue {
  if (s && TAB_VALUES.includes(s as TabValue)) return s as TabValue;
  return "profile";
}

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

export default function ProfilePage() {
  const { user: sessionUser, loading: sessionLoading } = useSession();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [activityData, setActivityData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionLoading) return;

    if (!sessionUser) {
      setError("Please log in to view your profile");
      setLoading(false);
      return;
    }

    const abortController = new AbortController();

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/users/profile", { signal: abortController.signal });
        if (abortController.signal.aborted) return;
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to fetch profile");
        }
        const data = (await res.json()) as UserProfileResponse;
        if (abortController.signal.aborted) return;
        
        setUserProfile(data.user);
        setActivityData(data.activity || null);
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

    fetchProfile();

    return () => {
      abortController.abort();
    };
  }, [sessionUser, sessionLoading]);

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

  if (!userProfile) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6 text-center">
          <p className="text-lg font-semibold text-[var(--totk-light-green)]">No Profile Found</p>
          <p className="mt-2 text-[var(--botw-pale)]">Your profile could not be loaded.</p>
        </div>
      </div>
    );
  }

  return (
    <ProfileTabbedLayout userProfile={userProfile} sessionUser={sessionUser} activityData={activityData} />
  );
}

/* ============================================================================ */
/* ------------------- Tabbed Layout ------------------- */
/* ============================================================================ */

function ProfileTabbedLayout({
  userProfile,
  sessionUser,
  activityData,
}: {
  userProfile: UserProfile;
  sessionUser: { id: string; username: string; avatar?: string | null } | null;
  activityData: ActivityData | null;
}) {
  const [tab, setTab] = useState<TabValue>("profile");

  // Keep `tab` in sync with the URL without `useSearchParams` (avoids build-time
  // prerender/Suspense errors).
  useEffect(() => {
    const syncTabFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      setTab(parseTab(params.get("tab")));
    };

    syncTabFromUrl();
    window.addEventListener("popstate", syncTabFromUrl);
    return () => {
      window.removeEventListener("popstate", syncTabFromUrl);
    };
  }, []);

  const tabs: { value: TabValue; label: string; icon: string }[] = [
    { value: "profile", label: "Profile", icon: "fa-user-circle" },
    { value: "levels", label: "Levels", icon: "fa-chart-line" },
    { value: "notifications", label: "Notifications", icon: "fa-bell" },
    { value: "quests", label: "Quests", icon: "fa-scroll" },
    { value: "help-wanted", label: "Help Wanted", icon: "fa-hand-holding-heart" },
    { value: "tokens", label: "Tokens", icon: "fa-coins" },
  ];

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <ProfileHeader user={userProfile} sessionUser={sessionUser} />

        <Tabs
          tabs={tabs.map(({ value, label, icon }) => ({
            value,
            label,
            icon,
            href: `/profile?tab=${value}`,
          }))}
          activeTab={tab}
          onTabChange={setTab}
        />

        {tab === "profile" && (
          <div className="space-y-6">
            <PrimaryStats user={userProfile} activity={activityData} />
          </div>
        )}

        {tab === "levels" && (
          <div className="space-y-6">
            <LevelingSection user={userProfile} />
            <div className="grid gap-6 lg:grid-cols-2">
              <BoostRewardsSection user={userProfile} />
              <BlupeeHuntSection user={userProfile} />
            </div>
          </div>
        )}

        {tab === "notifications" && (
          <div className="w-full">
            <NotificationsTabContent />
          </div>
        )}

        {tab === "quests" && (
          <div className="w-full">
            <QuestSection user={userProfile} />
          </div>
        )}

        {tab === "help-wanted" && (
          <div className="w-full">
            <HelpWantedSection user={userProfile} />
          </div>
        )}

        {tab === "tokens" && (
          <div className="w-full">
            <TokensTabContent />
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================================ */
/* ------------------- Subcomponents ------------------- */
/* ============================================================================ */

function DownloadDataButton() {
  const [downloading, setDownloading] = useState(false);

  // ------------------- Download Handler ------------------
  // Handle download of user data as ZIP file

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const response = await fetch("/api/users/download-data");
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to download data" }));
        throw new Error(error.error || "Failed to download data");
      }

      // Get the ZIP file as a blob
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      // Use consistent filename format
      const dateStr = new Date().toISOString().split("T")[0];
      a.download = `user-data-${dateStr}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[profile.tsx]❌ Error downloading data:", error);
      alert(error.message);
    } finally {
      setDownloading(false);
    }
  };

  // Precompute className to avoid duplication
  const buttonBaseClass = "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200";
  const buttonDisabledClass = "cursor-not-allowed bg-[var(--totk-grey-400)]/30 text-[var(--totk-grey-200)] opacity-50 border border-[var(--totk-grey-300)]";
  const buttonEnabledClass = "bg-gradient-to-r from-[var(--totk-light-green)] to-[var(--totk-green)] text-[var(--totk-black)] border-2 border-[var(--totk-ivory)] shadow-lg shadow-[var(--totk-light-green)]/40 hover:from-[var(--totk-green)] hover:to-[var(--totk-light-green)] hover:shadow-[var(--totk-light-green)]/60 hover:border-[var(--totk-light-green)] hover:scale-105";
  const buttonClassName = `${buttonBaseClass} ${downloading ? buttonDisabledClass : buttonEnabledClass}`;

  const iconClass = downloading ? "fa-spinner fa-spin" : "fa-download";
  const buttonText = downloading ? "Downloading..." : "Download All Data";
  const ariaLabel = downloading ? "Downloading user data" : "Download all user data";

  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className={buttonClassName}
        aria-label={ariaLabel}
        aria-busy={downloading}
      >
        <i className={`fa-solid ${iconClass}`} aria-hidden />
        {buttonText}
      </button>
    </div>
  );
}

function ProfileHeader({
  user,
  sessionUser,
}: {
  user: UserProfile;
  sessionUser: { id: string; username: string; avatar?: string | null } | null;
}) {
  const avatarUrl = sessionUser?.avatar
    ? `https://cdn.discordapp.com/avatars/${sessionUser.id}/${sessionUser.avatar}.png?size=256`
    : null;
  const [avatarError, setAvatarError] = useState(false);
  const hasBirthday = user.birthday.month && user.birthday.day;
  const hasDiscount = user.birthday.birthdayDiscountExpiresAt
    ? new Date(user.birthday.birthdayDiscountExpiresAt) > new Date()
    : false;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--totk-dark-ocher)]/40 bg-gradient-to-br from-[var(--totk-brown)] to-[var(--botw-warm-black)]/90 p-4 shadow-sm backdrop-blur-sm md:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col items-center gap-4 md:flex-row md:items-start">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-[var(--totk-dark-ocher)] sm:h-24 sm:w-24">
            {avatarUrl && !avatarError ? (
              <Image src={avatarUrl} alt="Avatar" fill className="object-cover" onError={() => setAvatarError(true)} />
            ) : (
              <Image src="/ankle_icon.png" alt="Avatar" fill className="object-cover" />
            )}
          </div>
          <div className="min-w-0 flex-1 text-center md:text-left">
            <h1 className="text-2xl font-bold text-[var(--totk-light-green)] sm:text-3xl">
              {sessionUser?.username || "User"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              <StatusBadge status={user.status} />
              {hasBirthday && (
                <span className="rounded-full bg-[var(--totk-mid-ocher)]/20 px-3 py-1 text-xs font-medium text-[var(--totk-light-ocher)]">
                  <i className="fa-solid fa-birthday-cake mr-1.5 opacity-80" />
                  {formatBirthday(user.birthday.month!, user.birthday.day!)}
                </span>
              )}
              {hasDiscount && (
                <span className="rounded-full bg-[var(--totk-light-green)]/20 px-3 py-1 text-xs font-medium text-[var(--totk-light-green)]">
                  <i className="fa-solid fa-gift mr-1.5 opacity-80" />
                  75% discount
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex justify-center md:justify-end">
          <DownloadDataButton />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "active" | "inactive" }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        status === "active"
          ? "bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]"
          : "bg-[var(--totk-grey-200)]/20 text-[var(--totk-grey-200)]"
      }`}
    >
      {status === "active" ? "Active" : "Inactive"}
    </span>
  );
}

function PrimaryStats({ user, activity }: { user: UserProfile; activity?: ActivityData | null }) {
  const progress = calculateLevelProgress(user.leveling);
  const questTurnInSummary = calculateQuestTurnInSummary(user.quests);
  
  // Calculate activity data for charts (kept for potential future use)
  const activityData = useMemo(() => {
    const questCompletions = user.quests.completions || [];
    const helpWantedCompletions = user.helpWanted.completions || [];
    
    // Get last 30 days of activity
    const days: Array<{
      date: string;
      quests: number;
      helpWanted: number;
      messages: number;
      characterRolls: number;
      petRolls: number;
      mountActivity: number;
    }> = [];
    const now = new Date();
    
    // Create lookup maps for activity data
    const messageMap = new Map<string, number>();
    if (activity?.messages) {
      activity.messages.forEach((msg) => {
        messageMap.set(msg.dayKey, msg.count);
      });
    }
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      
      const questCount = questCompletions.filter((q) => {
        const qDate = new Date(q.completedAt);
        if (Number.isNaN(qDate.getTime())) return false;
        return qDate.toISOString().slice(0, 10) === dateStr;
      }).length;
      
      const hwCount = helpWantedCompletions.filter((h) => h.date === dateStr).length;
      
      // Message activity
      const messageCount = messageMap.get(dateStr) || 0;
      
      // Character rolls - count characters with lastRollDate matching this day
      // Also check dailyRoll Map for date keys or roll counts
      let characterRollCount = 0;
      if (activity?.characters) {
        activity.characters.forEach((char) => {
          let counted = false;
          
          // Check lastRollDate
          if (char.lastRollDate) {
            try {
              const rollDate = new Date(char.lastRollDate);
              const rollDateStr = rollDate.toISOString().slice(0, 10);
              if (rollDateStr === dateStr) {
                characterRollCount++;
                counted = true;
              }
            } catch (e) {
              // Invalid date, skip
            }
          }
          
          // Check dailyRoll Map - it might store date keys or other roll data
          // Only check if we haven't already counted this character for today
          if (!counted && char.dailyRoll && typeof char.dailyRoll === 'object' && char.dailyRoll !== null) {
            const dailyRollKeys = Object.keys(char.dailyRoll);
            // Check if any key matches the date string
            const hasDateKey = dailyRollKeys.some((key) => {
              // Check if key is a date string (YYYY-MM-DD format)
              if (key === dateStr) return true;
              // Check if key contains the date
              if (key.includes(dateStr)) return true;
              // Check if the value is a date that matches
              try {
                const value = char.dailyRoll[key];
                if (value && typeof value === 'object' && value !== null && 'date' in value) {
                  const valueDate = new Date(value.date as string | Date);
                  return valueDate.toISOString().slice(0, 10) === dateStr;
                }
                // Check if value itself is a date string
                if (typeof value === 'string') {
                  const valueDate = new Date(value);
                  return valueDate.toISOString().slice(0, 10) === dateStr;
                }
              } catch (e: unknown) {
                // Skip invalid dates
              }
              return false;
            });
            
            if (hasDateKey) {
              characterRollCount++;
            }
          }
        });
      }
      
      // Pet rolls - count pets with lastRollDate matching this day
      let petRollCount = 0;
      if (activity?.pets) {
        activity.pets.forEach((pet) => {
          if (pet.lastRollDate) {
            const rollDate = new Date(pet.lastRollDate);
            if (!Number.isNaN(rollDate.getTime()) && rollDate.toISOString().slice(0, 10) === dateStr) {
              petRollCount++;
            }
          }
        });
      }
      
      // Mount activity - count mounts with lastMountTravel matching this day
      let mountActivityCount = 0;
      if (activity?.mounts) {
        activity.mounts.forEach((mount) => {
          if (mount.lastMountTravel) {
            const travelDate = new Date(mount.lastMountTravel);
            if (!Number.isNaN(travelDate.getTime()) && travelDate.toISOString().slice(0, 10) === dateStr) {
              mountActivityCount++;
            }
          }
        });
      }
      
      days.push({
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        quests: questCount,
        helpWanted: hwCount,
        messages: messageCount,
        characterRolls: characterRollCount,
        petRolls: petRollCount,
        mountActivity: mountActivityCount,
      });
    }
    
    return days;
  }, [user.quests.completions, user.helpWanted.completions, activity]);
  
  // Get recent activity
  const lastQuest = user.quests.completions && user.quests.completions.length > 0
    ? user.quests.completions[user.quests.completions.length - 1]
    : null;
  const lastHelpWanted = user.helpWanted.completions && user.helpWanted.completions.length > 0
    ? user.helpWanted.completions[user.helpWanted.completions.length - 1]
    : null;
  
  // Get last character roll
  const lastCharacterRoll = useMemo(() => {
    if (!activity?.characters || activity.characters.length === 0) return null;
    const charactersWithRolls = activity.characters
      .filter((char) => char.lastRollDate)
      .sort((a, b) => {
        const dateA = new Date(a.lastRollDate!).getTime();
        const dateB = new Date(b.lastRollDate!).getTime();
        return dateB - dateA;
      });
    return charactersWithRolls.length > 0 ? charactersWithRolls[0] : null;
  }, [activity?.characters]);
  
  // Get last pet roll
  const lastPetRoll = useMemo(() => {
    if (!activity?.pets || activity.pets.length === 0) return null;
    const petsWithRolls = activity.pets
      .filter((pet) => pet.lastRollDate)
      .sort((a, b) => {
        const dateA = new Date(a.lastRollDate!).getTime();
        const dateB = new Date(b.lastRollDate!).getTime();
        return dateB - dateA;
      });
    return petsWithRolls.length > 0 ? petsWithRolls[0] : null;
  }, [activity?.pets]);
  
  // Get last mount activity
  const lastMountActivity = useMemo(() => {
    if (!activity?.mounts || activity.mounts.length === 0) return null;
    const mountsWithActivity = activity.mounts
      .filter((mount) => mount.lastMountTravel)
      .sort((a, b) => {
        const dateA = new Date(a.lastMountTravel!).getTime();
        const dateB = new Date(b.lastMountTravel!).getTime();
        return dateB - dateA;
      });
    return mountsWithActivity.length > 0 ? mountsWithActivity[0] : null;
  }, [activity?.mounts]);
  
  // Get today's message count
  const todayMessageCount = useMemo(() => {
    if (!activity?.messages || activity.messages.length === 0) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const todayMessage = activity.messages.find((msg) => msg.dayKey === today);
    return todayMessage?.count || 0;
  }, [activity?.messages]);

  return (
    <div className="space-y-6">
      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon="fa-trophy"
          label="Level"
          value={user.leveling.level}
          subtitle={`${progress.currentXP} / ${progress.nextLevelXP} XP`}
          color="var(--totk-light-green)"
        />
        <StatCard
          icon="fa-coins"
          label="Tokens"
          value={user.tokens.toLocaleString()}
          color="var(--totk-light-ocher)"
        />
        <StatCard
          icon="fa-scroll"
          label="Quests"
          value={user.quests.totalCompleted + (user.quests.legacy.totalTransferred || 0)}
          subtitle={`${questTurnInSummary.totalPending} pending`}
          color="var(--botw-blue)"
        />
        <StatCard
          icon="fa-user"
          label="Character Slots"
          value={user.characterSlot}
          subtitle="Available"
          color="var(--totk-mid-ocher)"
        />
      </div>

      {/* Quick Stats Section */}
      <SectionCard title="Quick Stats" icon="fa-chart-bar">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Total XP" value={user.leveling.xp.toLocaleString()} accent="green" />
          <Metric label="Messages" value={user.leveling.totalMessages.toLocaleString()} accent="green" />
          <Metric label="Help Wanted" value={user.helpWanted.totalCompletions} accent="blue" />
          <Metric label="Blupee Claims" value={user.blupeeHunt.totalClaimed} accent="ocher" />
        </div>
      </SectionCard>

      {/* Activity Overview Cards */}
      <SectionCard title="Activity Overview" icon="fa-clock">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {lastQuest && (
            <div className="rounded-xl border border-[var(--botw-blue)]/30 bg-[var(--botw-dark-blue)]/15 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <i className="fa-solid fa-scroll text-sm text-[var(--botw-blue)]" />
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--botw-blue)]">
                  Last Quest
                </p>
              </div>
              <p className="text-sm font-semibold text-[var(--botw-pale)] truncate">
                {lastQuest.questTitle || "Unknown Quest"}
              </p>
              <p className="text-xs text-[var(--totk-grey-200)] mt-1">
                {formatDate(lastQuest.completedAt)}
              </p>
            </div>
          )}
          
          {lastHelpWanted && (
            <div className="rounded-xl border border-[var(--totk-light-green)]/30 bg-[var(--totk-dark-green)]/15 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <i className="fa-solid fa-hand-holding-heart text-sm text-[var(--totk-light-green)]" />
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--totk-light-green)]">
                  Last Help Wanted
                </p>
              </div>
              <p className="text-sm font-semibold text-[var(--botw-pale)]">
                {capitalize(lastHelpWanted.questType)}
              </p>
              <p className="text-xs text-[var(--totk-grey-200)] mt-1">
                {capitalize(lastHelpWanted.village)} · {formatShortDate(lastHelpWanted.date)}
              </p>
            </div>
          )}
          
          {lastCharacterRoll && (
            <div className="rounded-xl border border-[var(--totk-mid-ocher)]/30 bg-[var(--totk-mid-ocher)]/15 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <i className="fa-solid fa-dice text-sm text-[var(--totk-mid-ocher)]" />
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--totk-mid-ocher)]">
                  Last Character Roll
                </p>
              </div>
              <p className="text-sm font-semibold text-[var(--botw-pale)] truncate">
                {lastCharacterRoll.name}
              </p>
              <p className="text-xs text-[var(--totk-grey-200)] mt-1">
                {formatDate(lastCharacterRoll.lastRollDate!)}
              </p>
            </div>
          )}
          
          {lastPetRoll && (
            <div className="rounded-xl border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-dark-ocher)]/15 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <i className="fa-solid fa-paw text-sm text-[var(--totk-dark-ocher)]" />
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--totk-dark-ocher)]">
                  Last Pet Roll
                </p>
              </div>
              <p className="text-sm font-semibold text-[var(--botw-pale)] truncate">
                {lastPetRoll.name}
              </p>
              <p className="text-xs text-[var(--totk-grey-200)] mt-1">
                {formatDate(lastPetRoll.lastRollDate!)}
              </p>
            </div>
          )}
          
          {lastMountActivity && (
            <div className="rounded-xl border border-[var(--botw-pale)]/30 bg-[var(--botw-pale)]/15 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <i className="fa-solid fa-horse text-sm text-[var(--botw-pale)]" />
                <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--botw-pale)]">
                  Last Mount Activity
                </p>
              </div>
              <p className="text-sm font-semibold text-[var(--botw-pale)] truncate">
                {lastMountActivity.name}
              </p>
              <p className="text-xs text-[var(--totk-grey-200)] mt-1">
                {formatDate(lastMountActivity.lastMountTravel!)}
              </p>
            </div>
          )}
          
          <div className="rounded-xl border border-[var(--totk-light-ocher)]/30 bg-[var(--totk-mid-ocher)]/15 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <i className="fa-solid fa-coins text-sm text-[var(--totk-light-ocher)]" />
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--totk-light-ocher)]">
                Current Balance
              </p>
            </div>
            <p className="text-lg font-bold text-[var(--totk-light-ocher)]">
              {user.tokens.toLocaleString()}
            </p>
            <p className="text-xs text-[var(--totk-grey-200)] mt-1">
              Available tokens
            </p>
          </div>
          
          <div className="rounded-xl border border-[var(--totk-light-ocher)]/30 bg-[var(--totk-light-ocher)]/15 px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <i className="fa-solid fa-comments text-sm text-[var(--totk-light-ocher)]" />
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--totk-light-ocher)]">
                Messages Today
              </p>
            </div>
            <p className="text-lg font-bold text-[var(--totk-light-ocher)]">
              {todayMessageCount.toLocaleString()}
            </p>
            <p className="text-xs text-[var(--totk-grey-200)] mt-1">
              Daily message count
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function calculateLevelFromXP(xp: number): number {
  let level = 1;
  let requiredXP = 0;
  
  while (requiredXP <= xp) {
    level++;
    requiredXP += getXPRequiredForLevel(level);
    if (requiredXP > xp) {
      return level - 1;
    }
  }
  
  return level;
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: string;
  label: string;
  value: string | number;
  subtitle?: string;
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
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--totk-grey-200)]">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function LevelingSection({ user }: { user: UserProfile }) {
  const progress = calculateLevelProgress(user.leveling);
  const exchangeable = user.leveling.level - user.leveling.lastExchangedLevel;
  const potentialTokens = exchangeable * 100;

  // Calculate XP history data
  const xpHistoryData = useMemo(() => {
    if (!user.leveling.xpHistory || user.leveling.xpHistory.length === 0) {
      return [];
    }
    
    const history = user.leveling.xpHistory.slice(-30); // Last 30 entries
    let cumulativeXP = 0;
    
    return history.map((entry) => {
      cumulativeXP += entry.amount;
      const date = new Date(entry.timestamp);
      return {
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        xp: cumulativeXP,
        amount: entry.amount,
        source: entry.source,
      };
    });
  }, [user.leveling.xpHistory]);

  // Calculate exchange history data
  const exchangeHistoryData = useMemo(() => {
    if (!user.leveling.exchangeHistory || user.leveling.exchangeHistory.length === 0) {
      return [];
    }
    
    const history = user.leveling.exchangeHistory.slice(-12); // Last 12 exchanges
    
    return history.map((entry) => {
      const date = new Date(entry.timestamp);
      return {
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        levels: entry.levelsExchanged,
        tokens: entry.tokensReceived,
      };
    });
  }, [user.leveling.exchangeHistory]);

  // Calculate message activity (simplified - would need message history for real data)
  const messageActivityData = useMemo(() => {
    // Since we don't have daily message data, we'll create a placeholder
    // In a real implementation, this would come from message history
    const days: Array<{ date: string; messages: number }> = [];
    const now = new Date();
    const avgMessagesPerDay = user.leveling.totalMessages > 0 
      ? Math.round(user.leveling.totalMessages / 30) 
      : 0;
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      days.push({
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        messages: Math.floor(avgMessagesPerDay * (0.5 + Math.random())), // Simulated data
      });
    }
    
    return days;
  }, [user.leveling.totalMessages]);

  return (
    <div className="space-y-6">
      <SectionCard title="Leveling" icon="fa-chart-line">
        <div className="space-y-5">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--botw-pale)]">
                Level {user.leveling.level}
              </span>
              <span className="text-xs font-semibold text-[var(--totk-light-green)]">
                {progress.percentage}% → Lv.{user.leveling.level + 1}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[var(--totk-grey-400)]/80">
              <div
                className="h-full rounded-full transition-all duration-500 ease-out"
                style={{
                  width: `${progress.percentage}%`,
                  background: "linear-gradient(90deg, var(--totk-light-green), var(--totk-green))",
                }}
              />
            </div>
            <p className="mt-2 text-xs text-[var(--totk-grey-200)]">
              {progress.currentXP.toLocaleString()} / {progress.nextLevelXP.toLocaleString()} XP
            </p>
          </div>

          <Divider />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Metric label="Total XP" value={user.leveling.xp.toLocaleString()} accent="green" />
            <Metric label="Messages" value={user.leveling.totalMessages.toLocaleString()} accent="green" />
            {exchangeable > 0 && (
              <>
                <Metric label="Exchangeable" value={exchangeable} accent="ocher" />
                <Metric label="Potential tokens" value={potentialTokens.toLocaleString()} accent="ocher" />
              </>
            )}
          </div>

          {user.leveling.hasImportedFromMee6 && (
            <Pill className="bg-[var(--totk-dark-green)]/30 text-[var(--botw-pale)]">
              <i className="fa-solid fa-download mr-1.5" />
              MEE6 import (Lv.{user.leveling.importedMee6Level})
            </Pill>
          )}
        </div>
      </SectionCard>

      {/* XP History Chart */}
      {xpHistoryData.length > 0 && (
        <SectionCard title="XP History" icon="fa-chart-area">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={xpHistoryData}>
                <defs>
                  <linearGradient id="colorXP" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--totk-light-green)" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="var(--totk-light-green)" stopOpacity={0.1} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--totk-grey-200)"
                  tick={{ fill: "var(--totk-grey-200)", fontSize: 10 }}
                  interval="preserveStartEnd"
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
                  itemStyle={{ color: "var(--botw-pale)" }}
                  labelStyle={{ color: "var(--totk-light-green)" }}
                  cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                />
                <Area
                  type="monotone"
                  dataKey="xp"
                  stroke="var(--totk-light-green)"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorXP)"
                  name="Cumulative XP"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* Exchange History Chart */}
      {exchangeHistoryData.length > 0 && (
        <SectionCard title="Exchange History" icon="fa-exchange-alt">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={exchangeHistoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--totk-grey-200)"
                  tick={{ fill: "var(--totk-grey-200)", fontSize: 10 }}
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
                  itemStyle={{ color: "var(--botw-pale)" }}
                  labelStyle={{ color: "var(--totk-light-green)" }}
                  cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                />
                <Legend 
                  wrapperStyle={{ color: "var(--botw-pale)" }}
                  iconType="square"
                />
                <Bar dataKey="levels" fill="var(--totk-light-ocher)" name="Levels Exchanged" radius={[8, 8, 0, 0]}>
                  <LabelList dataKey="levels" position="top" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                </Bar>
                <Bar dataKey="tokens" fill="var(--totk-light-green)" name="Tokens Received" radius={[8, 8, 0, 0]}>
                  <LabelList dataKey="tokens" position="top" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* Message Activity Chart */}
      {messageActivityData.length > 0 && user.leveling.totalMessages > 0 && (
        <SectionCard title="Message Activity (Estimated)" icon="fa-comments">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={messageActivityData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                <XAxis 
                  dataKey="date" 
                  stroke="var(--totk-grey-200)"
                  tick={{ fill: "var(--totk-grey-200)", fontSize: 10 }}
                  interval="preserveStartEnd"
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
                  itemStyle={{ color: "var(--botw-pale)" }}
                  labelStyle={{ color: "var(--totk-light-green)" }}
                  cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                />
                <Bar dataKey="messages" fill="var(--botw-blue)" name="Messages" radius={[8, 8, 0, 0]}>
                  <LabelList dataKey="messages" position="top" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-center text-[var(--totk-grey-200)]">
            Note: This is estimated data. Actual daily message counts require message history.
          </p>
        </SectionCard>
      )}
    </div>
  );
}

function QuestSection({ user }: { user: UserProfile }) {
  const turnInSummary = calculateQuestTurnInSummary(user.quests);
  const allTimeTotal = user.quests.totalCompleted + (user.quests.legacy.totalTransferred || 0);
  const completions = user.quests.completions || [];
  
  // Calculate statistics
  const questStats = useMemo(() => {
    const monthlyData = calculateQuestMonthlyData(completions);
    const weeklyData = calculateQuestWeeklyData(completions);
    const typeData = calculateQuestTypeChartData(user.quests.typeTotals);
    const totalTokens = completions.reduce((sum, c) => sum + (c.tokensEarned || 0), 0);
    const avgPerMonth = monthlyData.length > 0 
      ? Math.round(monthlyData.reduce((sum, m) => sum + m.count, 0) / monthlyData.length * 10) / 10
      : 0;
    const thisMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].count : 0;
    const lastMonth = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2].count : 0;
    
    // Calculate tokens earned per month
    const tokensByMonth: Record<string, number> = {};
    completions.forEach((completion) => {
      const date = new Date(completion.completedAt);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      tokensByMonth[monthKey] = (tokensByMonth[monthKey] || 0) + (completion.tokensEarned || 0);
    });
    
    const tokensMonthlyData = Object.entries(tokensByMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, tokens]) => ({
        month: month.slice(5) + "/" + month.slice(0, 4),
        tokens,
      }));
    
    return {
      monthlyData,
      weeklyData,
      typeData,
      totalTokens,
      avgPerMonth,
      thisMonth,
      lastMonth,
      tokensMonthlyData,
    };
  }, [completions, user.quests.typeTotals]);

  const questListDisplay = useMemo(() => {
    const c = user.quests.completions || [];
    return [...c].reverse().map((entry) => ({
      name: entry.questTitle || "Unknown",
      year: entry.completedAt
        ? String(new Date(entry.completedAt).getFullYear())
        : "",
      category: entry.questType || "",
    }));
  }, [user.quests.completions]);

  // Improved pie chart colors - more vibrant and visible
  const PIE_CHART_COLORS = [
    "var(--botw-blue)",           // Blue
    "var(--totk-light-green)",    // Green
    "#ff6b6b",                     // Red
    "var(--totk-light-ocher)",    // Ocher/Yellow
    "#9b59b6",                     // Purple
    "#3498db",                     // Light Blue
    "#e67e22",                     // Orange
    "#1abc9c",                     // Teal
  ];

  const COLORS = {
    blue: "var(--botw-blue)",
    green: "var(--totk-light-green)",
    ocher: "var(--totk-light-ocher)",
    pale: "var(--botw-pale)",
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Quest Statistics" icon="fa-scroll">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="All-time" value={allTimeTotal} accent="blue" />
            <Metric label="Current" value={user.quests.totalCompleted} accent="green" />
            {user.quests.legacy.totalTransferred > 0 && (
              <Metric
                label="Legacy"
                value={user.quests.legacy.totalTransferred}
                accent="ocher"
              />
            )}
            <Metric label="Total Tokens" value={questStats.totalTokens.toLocaleString()} accent="green" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="This Month" value={questStats.thisMonth} accent="blue" />
            <Metric label="Last Month" value={questStats.lastMonth} accent="ocher" />
            <Metric label="Avg/Month" value={questStats.avgPerMonth} accent="muted" />
          </div>

          {Object.keys(user.quests.typeTotals).length > 0 && (
            <>
              <Divider />
              <div>
                <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                  By type
                </p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(user.quests.typeTotals).map(([type, count]) => (
                    <Pill
                      key={type}
                      className="bg-[var(--totk-grey-400)]/50 text-[var(--botw-pale)]"
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                      <span className="ml-1.5 font-semibold text-[var(--totk-light-green)]">{count}</span>
                    </Pill>
                  ))}
                </div>
              </div>
            </>
          )}

          <Divider />

          <div className="rounded-xl border border-[var(--botw-blue)]/25 bg-[var(--botw-dark-blue)]/15 px-4 py-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--botw-blue)]">
              Pending turn-ins
            </p>
            <div className="flex flex-wrap gap-2">
              <Pill className="bg-[var(--botw-blue)]/20 text-[var(--botw-blue)]">
                {turnInSummary.totalPending} total
              </Pill>
              <Pill className="bg-[var(--botw-blue)]/20 text-[var(--botw-blue)]">
                {turnInSummary.redeemableSets} sets
              </Pill>
              <Pill className="bg-[var(--totk-grey-400)]/50 text-[var(--botw-pale)]">
                {turnInSummary.remainder} left
              </Pill>
            </div>
          </div>

          {questListDisplay.length > 0 && (
            <>
              <Divider />
              <div>
                <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                  Quest List
                </p>
                <ul className="space-y-1.5 text-sm text-[var(--botw-pale)]">
                  {questListDisplay.map((entry, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-medium text-[var(--totk-light-green)]">
                        {entry.name || "Unknown"}
                        {entry.year ? ` (${entry.year})` : ""}
                      </span>
                      {entry.category && String(entry.category).trim() && (
                        <Pill className="bg-[var(--totk-grey-400)]/50 text-[var(--totk-grey-200)] text-xs">
                          {entry.category}
                        </Pill>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {completions.length > 0 && (
        <>
          {/* Trends Section - Side by Side */}
          <div className="grid gap-6 lg:grid-cols-2">
            {questStats.monthlyData.length > 0 && (
              <SectionCard title="Monthly Trends" icon="fa-chart-line">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={questStats.monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                      <XAxis 
                        dataKey="month" 
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
                        itemStyle={{ color: "var(--botw-pale)" }}
                        labelStyle={{ color: "var(--totk-light-green)" }}
                        cursor={{ fill: "transparent" }}
                      />
                      <Legend 
                        wrapperStyle={{ color: "var(--botw-pale)" }}
                        iconType="line"
                      />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke={COLORS.green}
                        strokeWidth={2}
                        name="Completions"
                        dot={{ fill: COLORS.green, r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            )}

            {questStats.tokensMonthlyData.length > 0 && (
              <SectionCard title="Tokens Earned" icon="fa-coins">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={questStats.tokensMonthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                      <XAxis 
                        dataKey="month" 
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
                        itemStyle={{ color: "var(--botw-pale)" }}
                        labelStyle={{ color: "var(--totk-light-green)" }}
                        cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                      />
                      <Bar dataKey="tokens" fill="var(--totk-light-ocher)" name="Tokens" radius={[8, 8, 0, 0]}>
                        <LabelList dataKey="tokens" position="top" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            )}
          </div>

          {questStats.weeklyData.length > 0 && (
            <SectionCard title="Weekly Activity" icon="fa-calendar-week">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={questStats.weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                    <XAxis 
                      dataKey="week" 
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
                      itemStyle={{ color: "var(--botw-pale)" }}
                      labelStyle={{ color: "var(--totk-light-green)" }}
                      cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                    />
                    <Bar dataKey="count" fill={COLORS.green} name="Completions" radius={[8, 8, 0, 0]}>
                      <LabelList dataKey="count" position="top" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}

          {questStats.typeData.length > 0 && (
            <SectionCard title="Quest Type Distribution" icon="fa-chart-pie">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={questStats.typeData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={false}
                        outerRadius={100}
                        innerRadius={30}
                        fill="var(--botw-blue)"
                        dataKey="value"
                        paddingAngle={2}
                      >
                        {questStats.typeData.map((entry) => {
                          const index = questStats.typeData.findIndex(e => e.name === entry.name);
                          return (
                          <Cell 
                            key={entry.name} 
                            fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]}
                            stroke="var(--botw-warm-black)"
                            strokeWidth={2}
                          />
                          );
                        })}
                      </Pie>
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
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-center gap-2">
                  {questStats.typeData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between rounded-lg bg-[var(--totk-grey-400)]/30 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: [COLORS.blue, COLORS.green, COLORS.ocher, COLORS.pale][index % 4] }}
                        />
                        <span className="text-sm text-[var(--botw-pale)]">{entry.name}</span>
                      </div>
                      <span className="font-semibold text-[var(--totk-light-green)]">{entry.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}

          <SectionCard title="Recent Completions" icon="fa-history">
            <div className="divide-y divide-[var(--totk-grey-400)]/50">
              {completions.slice(-10).reverse().map((completion, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--botw-pale)]">
                      {completion.questTitle || "Unknown Quest"}
                    </span>
                    <div className="mt-1 flex items-center gap-3 text-xs text-[var(--totk-grey-200)]">
                      <span className="capitalize">{completion.questType}</span>
                      {completion.tokensEarned > 0 && (
                        <span className="text-[var(--totk-light-green)]">
                          +{completion.tokensEarned} tokens
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--totk-grey-200)]">
                    {formatDate(completion.completedAt)}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

type QuestWithCompletion = {
  questId: string;
  village: string;
  date: string;
  type: string;
  npcName: string;
  requirements: unknown;
  completed: boolean;
  completedBy: {
    userId: string;
    characterId: string;
    characterName?: string;
    timestamp?: string;
  } | null;
};

function HelpWantedSection({ user }: { user: UserProfile }) {
  const completions = user.helpWanted.completions ?? [];
  const cooldownActive = user.helpWanted.cooldownUntil
    ? new Date(user.helpWanted.cooldownUntil) > new Date()
    : false;
  const today = helpWantedToday(completions);
  const thisWeek = helpWantedThisWeek(completions);
  const thisMonth = helpWantedThisMonth(completions);
  const lastQuest = lastHelpWantedQuest(completions);
  const byVillage = helpWantedByVillage(completions);
  const byType = helpWantedByType(completions);
  const total = user.helpWanted.totalCompletions;

  const [allQuests, setAllQuests] = useState<QuestWithCompletion[]>([]);
  const [completedQuests, setCompletedQuests] = useState<QuestWithCompletion[]>([]);
  const [loadingQuests, setLoadingQuests] = useState(true);
  const [questError, setQuestError] = useState<string | null>(null);

  useEffect(() => {
    const fetchQuests = async () => {
      try {
        setLoadingQuests(true);
        setQuestError(null);
        const res = await fetch("/api/help-wanted");
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to fetch quests");
        }
        const data = await res.json() as { completedQuests: QuestWithCompletion[]; allQuests: QuestWithCompletion[] };
        setCompletedQuests(data.completedQuests);
        setAllQuests(data.allQuests);
      } catch (err) {
        setQuestError(err instanceof Error ? err.message : "Failed to load quests");
      } finally {
        setLoadingQuests(false);
      }
    };

    fetchQuests();
  }, []);

  const COLORS = {
    blue: "var(--botw-blue)",
    green: "var(--totk-light-green)",
    ocher: "var(--totk-light-ocher)",
    pale: "var(--botw-pale)",
    red: "#ff6b6b",
  };

  // Village-specific color mapping
  const VILLAGE_COLORS: Record<string, string> = {
    vhintl: COLORS.green,
    inariko: COLORS.blue,
    rudania: COLORS.red,
  };

  const CHART_COLORS = [
    COLORS.blue,
    COLORS.green,
    COLORS.ocher,
    COLORS.pale,
    "var(--totk-mid-ocher)",
    "var(--botw-dark-blue)",
    COLORS.red,
    "var(--totk-dark-green)",
  ];

  // Improved pie chart colors - more vibrant and visible
  const PIE_CHART_COLORS = [
    "var(--botw-blue)",           // Blue
    "var(--totk-light-green)",    // Green
    "#ff6b6b",                     // Red
    "var(--totk-light-ocher)",    // Ocher/Yellow
    "#9b59b6",                     // Purple
    "#3498db",                     // Light Blue
    "#e67e22",                     // Orange
    "#1abc9c",                     // Teal
  ];

  // Calculate character breakdown
  const characterBreakdown = useMemo(() => {
    if (!completedQuests || completedQuests.length === 0) {
      return [];
    }
    
    const charMap: Record<string, number> = {};
    completedQuests.forEach((quest) => {
      if (quest.completedBy?.characterName) {
        const charName = quest.completedBy.characterName;
        charMap[charName] = (charMap[charName] || 0) + 1;
      }
    });
    
    return Object.entries(charMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count], index) => ({
        name,
        count,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }));
  }, [completedQuests]);

  // Calculate quest type trends over time
  const typeTrendsData = useMemo(() => {
    if (completions.length === 0) return [];
    
    const monthlyTypeMap: Record<string, Record<string, number>> = {};
    
    completions.forEach((completion) => {
      const dateStr = completion.date;
      const monthKey = dateStr.slice(0, 7); // YYYY-MM
      const type = capitalize(completion.questType);
      
      if (!monthlyTypeMap[monthKey]) {
        monthlyTypeMap[monthKey] = {};
      }
      
      monthlyTypeMap[monthKey][type] = (monthlyTypeMap[monthKey][type] || 0) + 1;
    });
    
    // Get all unique types
    const allTypes = new Set<string>();
    Object.values(monthlyTypeMap).forEach((types) => {
      Object.keys(types).forEach((type) => allTypes.add(type));
    });
    
    // Create data array
    return Object.entries(monthlyTypeMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, types]) => {
        const dataPoint: Record<string, string | number> = {
          month: month.slice(5) + "/" + month.slice(0, 4),
        };
        
        allTypes.forEach((type) => {
          dataPoint[type] = types[type] || 0;
        });
        
        return dataPoint;
      });
  }, [completions]);

  // Calculate chart data
  const chartData = useMemo(() => {
    const monthlyData = calculateHelpWantedMonthlyData(completions);
    const weeklyData = calculateHelpWantedWeeklyData(completions);
    const villageChartData = Object.entries(byVillage)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, value], index) => {
        const lowerName = name.toLowerCase();
        const color = VILLAGE_COLORS[lowerName] || CHART_COLORS[index % CHART_COLORS.length];
        return { 
          name: capitalize(name), 
          value,
          color
        };
      });
    const typeChartData = Object.entries(byType)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name: capitalize(name), value }));
    
    const avgPerMonth = monthlyData.length > 0
      ? Math.round(monthlyData.reduce((sum, m) => sum + m.count, 0) / monthlyData.length * 10) / 10
      : 0;
    const thisMonthCount = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1].count : 0;
    const lastMonthCount = monthlyData.length > 1 ? monthlyData[monthlyData.length - 2].count : 0;

    return {
      monthlyData,
      weeklyData,
      villageChartData,
      typeChartData,
      avgPerMonth,
      thisMonthCount,
      lastMonthCount,
    };
  }, [completions, byVillage, byType]);

  return (
    <div className="space-y-6">
      <SectionCard title="Help Wanted Quests" icon="fa-hand-holding-heart">
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Total Completed" value={total} accent="green" />
            <Metric label="Today" value={today} accent="ocher" />
            <Metric label="This Week" value={thisWeek} accent="ocher" />
            <Metric label="This Month" value={thisMonth} accent="blue" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Available" value={user.helpWanted.currentCompletions} accent="blue" />
            <Metric label="This Month" value={chartData.thisMonthCount} accent="green" />
            <Metric label="Last Month" value={chartData.lastMonthCount} accent="ocher" />
            <Metric label="Avg/Month" value={chartData.avgPerMonth} accent="muted" />
          </div>

          {lastQuest && (
            <div className="rounded-xl border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/50 px-4 py-3">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                Last Quest
              </p>
              <p className="text-sm font-semibold text-[var(--totk-light-green)]">
                {capitalize(lastQuest.questType)}
              </p>
              <p className="text-xs text-[var(--botw-pale)]">
                {capitalize(lastQuest.village)} · {formatShortDate(lastQuest.date)}
              </p>
            </div>
          )}

          {cooldownActive && user.helpWanted.cooldownUntil && (
            <div className="rounded-xl border border-[var(--totk-dark-green)]/40 bg-[var(--totk-dark-green)]/15 px-4 py-3 text-sm text-[var(--botw-pale)]">
              <i className="fa-solid fa-clock mr-2 opacity-80" />
              Cooldown until {formatDate(user.helpWanted.cooldownUntil)}
            </div>
          )}

          {user.helpWanted.lastExchangeAmount > 0 && (
            <div className="rounded-xl border border-[var(--totk-light-ocher)]/30 bg-[var(--totk-mid-ocher)]/10 px-4 py-3">
              <p className="text-xs text-[var(--totk-grey-200)]">
                Last exchange{" "}
                <span className="font-semibold text-[var(--totk-light-green)]">
                  {user.helpWanted.lastExchangeAmount}
                </span>{" "}
                on {user.helpWanted.lastExchangeAt ? formatDate(user.helpWanted.lastExchangeAt) : "—"}
              </p>
            </div>
          )}
        </div>
      </SectionCard>

      {completions.length > 0 && (
        <>
          {/* Trends Section - Side by Side */}
          <div className="grid gap-6 lg:grid-cols-2">
            {chartData.monthlyData.length > 0 && (
              <SectionCard title="Monthly Completion Trends" icon="fa-chart-line">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData.monthlyData}>
                      <defs>
                        <linearGradient id="colorCompletions" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={COLORS.green} stopOpacity={0.8} />
                          <stop offset="95%" stopColor={COLORS.green} stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                      <XAxis 
                        dataKey="month" 
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
                        itemStyle={{ color: "var(--botw-pale)" }}
                        labelStyle={{ color: "var(--totk-light-green)" }}
                        cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                      />
                      <Legend 
                        wrapperStyle={{ color: "var(--botw-pale)" }}
                        iconType="square"
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke={COLORS.green}
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorCompletions)"
                        name="Completions"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            )}

            {chartData.weeklyData.length > 0 && (
              <SectionCard title="Weekly Activity" icon="fa-calendar-week">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData.weeklyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                      <XAxis 
                        dataKey="week" 
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
                        itemStyle={{ color: "var(--botw-pale)" }}
                        labelStyle={{ color: "var(--totk-light-green)" }}
                        cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                      />
                      <Bar dataKey="count" fill={COLORS.green} name="Completions" radius={[8, 8, 0, 0]}>
                        <LabelList dataKey="count" position="top" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </SectionCard>
            )}
          </div>

          {/* Quest Type Trends Over Time */}
          {typeTrendsData.length > 0 && Object.keys(typeTrendsData[0]).length > 1 && (
            <SectionCard title="Quest Type Trends Over Time" icon="fa-chart-area">
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={typeTrendsData}>
                    <defs>
                      {Object.keys(typeTrendsData[0] || {})
                        .filter((key) => key !== "month")
                        .map((type, index) => (
                          <linearGradient key={type} id={`color${type.replace(/\s+/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]} stopOpacity={0.8} />
                            <stop offset="95%" stopColor={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]} stopOpacity={0.1} />
                          </linearGradient>
                        ))}
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                    <XAxis 
                      dataKey="month" 
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
                      itemStyle={{ color: "var(--botw-pale)" }}
                      labelStyle={{ color: "var(--totk-light-green)" }}
                      cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                    />
                    <Legend 
                      wrapperStyle={{ color: "var(--botw-pale)" }}
                      iconType="square"
                    />
                    {Object.keys(typeTrendsData[0] || {})
                      .filter((key) => key !== "month")
                      .map((type, index) => (
                        <Area
                          key={type}
                          type="monotone"
                          dataKey={type}
                          stackId="1"
                          stroke={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]}
                          fill={`url(#color${type.replace(/\s+/g, "")})`}
                          name={type}
                        />
                      ))}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
          )}

          {/* Distribution Section - Side by Side */}
          <div className="grid gap-6 lg:grid-cols-2">
            {chartData.villageChartData.length > 0 && (
              <SectionCard title="Village Distribution" icon="fa-map-marked-alt">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData.villageChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                        <XAxis 
                          type="number" 
                          stroke="var(--totk-grey-200)" 
                          tick={{ fill: "var(--totk-grey-200)", fontSize: 12 }}
                        />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          stroke="var(--totk-grey-200)"
                          tick={{ fill: "var(--totk-grey-200)", fontSize: 12 }}
                          width={80}
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
                          dataKey="value" 
                          name="Completions" 
                          radius={[0, 8, 8, 0]}
                          isAnimationActive={false}
                        >
                          {chartData.villageChartData.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                          <LabelList dataKey="value" position="right" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col justify-center gap-2">
                    {chartData.villageChartData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center justify-between rounded-lg bg-[var(--totk-grey-400)]/30 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-sm text-[var(--botw-pale)]">{entry.name}</span>
                        </div>
                        <span className="font-semibold text-[var(--botw-blue)]">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>
            )}

            {chartData.typeChartData.length > 0 && (
              <SectionCard title="Quest Type Distribution" icon="fa-chart-pie">
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData.typeChartData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={false}
                          outerRadius={80}
                          innerRadius={30}
                          fill="var(--botw-blue)"
                          dataKey="value"
                          paddingAngle={2}
                        >
                          {chartData.typeChartData.map((entry) => {
                            const index = chartData.typeChartData.findIndex(e => e.name === entry.name);
                            return (
                            <Cell 
                              key={entry.name} 
                              fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]}
                              stroke="var(--botw-warm-black)"
                              strokeWidth={2}
                            />
                            );
                          })}
                        </Pie>
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
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-col justify-center gap-2">
                    {chartData.typeChartData.map((entry, index) => (
                      <div key={entry.name} className="flex items-center justify-between rounded-lg bg-[var(--totk-grey-400)]/30 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: PIE_CHART_COLORS[index % PIE_CHART_COLORS.length] }}
                          />
                          <span className="text-sm text-[var(--botw-pale)]">{entry.name}</span>
                        </div>
                        <span className="font-semibold text-[var(--totk-light-green)]">{entry.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </SectionCard>
            )}
          </div>

          {/* Character Breakdown Chart */}
          {characterBreakdown.length > 0 && (
            <SectionCard title="Quests by Character" icon="fa-users">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={characterBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                      <XAxis 
                        type="number" 
                        stroke="var(--totk-grey-200)" 
                        tick={{ fill: "var(--totk-grey-200)", fontSize: 12 }}
                      />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        stroke="var(--totk-grey-200)"
                        tick={{ fill: "var(--totk-grey-200)", fontSize: 12 }}
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
                        name="Quests Completed" 
                        radius={[0, 8, 8, 0]}
                      >
                        {characterBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                        <LabelList dataKey="count" position="right" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-center gap-2">
                  {characterBreakdown.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between rounded-lg bg-[var(--totk-grey-400)]/30 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-sm text-[var(--botw-pale)] truncate">{entry.name}</span>
                      </div>
                      <span className="font-semibold text-[var(--totk-light-green)] shrink-0">{entry.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}

          {(Object.keys(byVillage).length > 0 || Object.keys(byType).length > 0) && (
            <SectionCard title="Detailed Breakdown" icon="fa-list">
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.keys(byVillage).length > 0 && (
                  <div className="rounded-xl bg-[var(--totk-grey-400)]/30 px-4 py-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                      Villages Helped
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(byVillage)
                        .sort(([, a], [, b]) => b - a)
                        .map(([v, n]) => (
                          <Pill
                            key={v}
                            className="bg-[var(--botw-dark-blue)]/30 text-[var(--botw-blue)]"
                          >
                            {v} <span className="ml-1 font-semibold">{n}</span>
                          </Pill>
                        ))}
                    </div>
                  </div>
                )}
                {Object.keys(byType).length > 0 && (
                  <div className="rounded-xl border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/50 px-4 py-3">
                    <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                      Quest Types
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(byType)
                        .sort(([, a], [, b]) => b - a)
                        .map(([t, n]) => (
                          <Pill
                            key={t}
                            className="bg-[var(--totk-dark-green)]/30 text-[var(--totk-light-green)]"
                          >
                            {t} <span className="ml-1 font-semibold">{n}</span>
                          </Pill>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* All Help Wanted Quests */}
      {!loadingQuests && allQuests.length > 0 && (
        <SectionCard title="All My Help Wanted Quests" icon="fa-clipboard-list">
          {questError ? (
            <p className="text-sm text-[var(--totk-grey-200)]">{questError}</p>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--totk-grey-200)]">
                Complete list of all your help wanted quests ({allQuests.length} total)
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {allQuests.slice(0, 200).map((quest, idx) => {
                  const getQuestTypeColor = (type: string) => {
                    const normalized = type.toLowerCase();
                    switch (normalized) {
                      case "item": return "border-[#4A90E2] bg-[#4A90E2]/20 text-[#6BB3FF]";
                      case "crafting": return "border-[#E67E22] bg-[#E67E22]/20 text-[#FF9A4D]";
                      case "monster": return "border-[#E74C3C] bg-[#E74C3C]/20 text-[#FF6B5C]";
                      case "escort": return "border-[#9B59B6] bg-[#9B59B6]/20 text-[#B87ED8]";
                      case "art": return "border-[#E91E63] bg-[#E91E63]/20 text-[#FF4D8A]";
                      case "writing": return "border-[#00BCD4] bg-[#00BCD4]/20 text-[#4DD0E1]";
                      default: return "border-[var(--totk-green)] bg-[var(--totk-green)]/20 text-[var(--totk-light-green)]";
                    }
                  };
                  
                  const getVillageColor = (village: string) => {
                    const normalized = village.toLowerCase();
                    switch (normalized) {
                      case "rudania": return "text-[#C6000A]";
                      case "inariko": return "text-[#6BA3FF]";
                      case "vhintl": return "text-[#4AA144]";
                      default: return "text-[var(--botw-blue)]";
                    }
                  };

                  return (
                    <div
                      key={`${quest.questId}-${idx}`}
                      className={`group rounded-lg border-2 p-4 transition-all hover:shadow-lg hover:scale-[1.02] ${
                        quest.completed
                          ? "border-[var(--totk-light-green)]/50 bg-gradient-to-br from-[var(--totk-light-green)]/10 to-[var(--botw-warm-black)]/60"
                          : "border-[var(--totk-dark-ocher)]/30 bg-gradient-to-br from-[var(--botw-warm-black)]/60 to-[var(--totk-brown)]/20 opacity-60"
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {quest.completed && (
                            <span className="text-xs font-semibold text-[var(--totk-light-green)] flex items-center gap-1">
                              <i className="fa-solid fa-check-circle" />
                              Completed
                            </span>
                          )}
                          {quest.completedBy?.characterName && (
                            <span className="text-xs font-medium text-[var(--botw-pale)]">
                              by {quest.completedBy.characterName}
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`rounded border px-2 py-0.5 text-xs font-semibold ${getQuestTypeColor(quest.type)}`}>
                            {capitalize(quest.type)}
                          </span>
                          <span className={`text-xs font-medium ${getVillageColor(quest.village)}`}>
                            {capitalize(quest.village)}
                          </span>
                        </div>
                        
                        <div className="space-y-1.5">
                          <div className="text-sm font-semibold text-[var(--botw-pale)]">
                            {quest.npcName}
                          </div>
                          <div className="text-xs text-[var(--totk-grey-200)] font-medium">
                            {formatShortDate(quest.date)}
                            {quest.completedBy?.timestamp && (
                              <span className="ml-2 text-[var(--totk-grey-200)]">· {formatDate(quest.completedBy.timestamp)}</span>
                            )}
                          </div>
                          <div className="text-xs text-[var(--totk-grey-200)] font-mono font-medium tracking-wide">
                            {quest.questId}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {allQuests.length > 200 && (
                <p className="text-xs text-center text-[var(--totk-grey-200)] pt-2">
                  Showing 200 of {allQuests.length} quests
                </p>
              )}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}

function BoostRewardsSection({ user }: { user: UserProfile }) {
  return (
    <SectionCard title="Boost Rewards" icon="fa-rocket">
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Metric
            label="Total rewards"
            value={`${user.boostRewards.totalRewards.toLocaleString()} tokens`}
            accent="green"
          />
          {user.boostRewards.lastRewardMonth && (
            <Metric
              label="Last reward"
              value={user.boostRewards.lastRewardMonth}
              accent="muted"
            />
          )}
        </div>
        {user.boostRewards.rewardHistory.length > 0 && (
          <>
            <Divider />
            <div>
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                History
              </p>
              <div className="divide-y divide-[var(--totk-grey-400)]/50">
                {user.boostRewards.rewardHistory.slice(-5).reverse().map((reward, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="text-sm text-[var(--botw-pale)]">{reward.month}</span>
                    <span className="font-semibold tabular-nums text-[var(--totk-light-green)]">
                      {reward.tokensReceived.toLocaleString()} tokens
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}

function BlupeeHuntSection({ user }: { user: UserProfile }) {
  return (
    <SectionCard title="Blupee Hunt" icon="fa-paw">
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Metric label="Total claimed" value={user.blupeeHunt.totalClaimed} accent="green" />
          <Metric label="Daily" value={user.blupeeHunt.dailyCount} accent="ocher" />
          {user.blupeeHunt.lastClaimed && (
            <Metric
              label="Last claimed"
              value={formatDate(user.blupeeHunt.lastClaimed)}
              accent="muted"
            />
          )}
        </div>
      </div>
    </SectionCard>
  );
}

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

/* [profile/page.tsx]✨ Markdown components for notification rendering - */

/**
 * Convert plain URLs in text to markdown links
 */
function convertUrlsToMarkdown(text: string): string {
  // URL regex pattern - matches http(s):// URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => `[${url}](${url})`);
}

type MarkdownComponentProps = {
  children?: ReactNode;
  href?: string;
};

const NOTIFICATION_MARKDOWN_COMPONENTS: Components = {
  p: ({ children }: MarkdownComponentProps) => (
    <p className="mb-1.5 last:mb-0 break-words">{children}</p>
  ),
  h1: ({ children }: MarkdownComponentProps) => (
    <h1 className="text-xl font-bold mb-2 mt-3 first:mt-0 break-words" style={{ color: "var(--totk-light-ocher)" }}>{children}</h1>
  ),
  h2: ({ children }: MarkdownComponentProps) => (
    <h2 className="text-lg font-bold mb-1.5 mt-2.5 first:mt-0 break-words" style={{ color: "var(--totk-light-ocher)" }}>{children}</h2>
  ),
  h3: ({ children }: MarkdownComponentProps) => (
    <h3 className="text-base font-bold mb-1.5 mt-2 first:mt-0 break-words" style={{ color: "var(--totk-light-ocher)" }}>{children}</h3>
  ),
  h4: ({ children }: MarkdownComponentProps) => (
    <h4 className="text-sm font-semibold mb-1 mt-1.5 first:mt-0 break-words" style={{ color: "var(--totk-light-ocher)" }}>{children}</h4>
  ),
  h5: ({ children }: MarkdownComponentProps) => (
    <h5 className="text-sm font-semibold mb-1 mt-1.5 first:mt-0 break-words" style={{ color: "var(--totk-light-ocher)" }}>{children}</h5>
  ),
  h6: ({ children }: MarkdownComponentProps) => (
    <h6 className="text-xs font-medium mb-1 mt-1 first:mt-0 break-words" style={{ color: "var(--totk-light-ocher)" }}>{children}</h6>
  ),
  ul: ({ children }: MarkdownComponentProps) => (
    <ul className="list-disc list-inside mb-1.5 space-y-1 break-words">{children}</ul>
  ),
  ol: ({ children }: MarkdownComponentProps) => (
    <ol className="list-decimal list-inside mb-1.5 space-y-1 break-words">{children}</ol>
  ),
  li: ({ children }: MarkdownComponentProps) => (
    <li className="ml-2 break-words">{children}</li>
  ),
  strong: ({ children }: MarkdownComponentProps) => (
    <strong className="font-bold text-[var(--totk-light-green)] break-words">{children}</strong>
  ),
  em: ({ children }: MarkdownComponentProps) => (
    <em className="italic break-words">{children}</em>
  ),
  code: ({ children }: MarkdownComponentProps) => (
    <code className="bg-[var(--botw-warm-black)] text-[var(--totk-light-green)] px-1 py-0.5 rounded text-xs font-mono break-words">
      {children}
    </code>
  ),
  pre: ({ children }: MarkdownComponentProps) => (
    <pre className="bg-[var(--botw-warm-black)] p-2 rounded overflow-x-auto mb-1.5 text-xs break-words">
      {children}
    </pre>
  ),
  blockquote: ({ children }: MarkdownComponentProps) => (
    <blockquote className="border-l-4 border-[var(--totk-green)] pl-2 italic mb-1.5 break-words">
      {children}
    </blockquote>
  ),
  a: ({ children, href }: MarkdownComponentProps) => (
    <a
      href={href}
      className="text-[var(--botw-blue)] underline hover:text-[var(--totk-light-green)] break-words"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  br: () => <br />,
};

function NotificationsTabContent() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/users/notifications");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch notifications");
      }
      const data = (await res.json()) as { notifications: NotificationItem[] };
      setNotifications(data.notifications);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  // Scroll to notification when hash is present in URL
  useEffect(() => {
    if (typeof window === "undefined" || loading) return;
    
    const hash = window.location.hash;
    if (hash && hash.startsWith("#notification-")) {
      const notificationId = hash.replace("#notification-", "");
      // Wait a bit for notifications to render
      const timer = setTimeout(() => {
        const element = document.getElementById(`notification-${notificationId}`);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          // Highlight the notification briefly
          element.classList.add("ring-2", "ring-[var(--totk-light-green)]", "ring-offset-2");
          setTimeout(() => {
            element.classList.remove("ring-2", "ring-[var(--totk-light-green)]", "ring-offset-2");
          }, 2000);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading, notifications]);

  const handleMarkAllAsRead = async () => {
    try {
      setMarkingAll(true);
      const res = await fetch("/api/users/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to mark all as read");
      }
      // Update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark all as read");
    } finally {
      setMarkingAll(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm("Are you sure you want to delete all notifications? This action cannot be undone.")) {
      return;
    }
    try {
      setDeletingAll(true);
      const res = await fetch("/api/users/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteAll: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete notifications");
      }
      // Clear notifications from state
      setNotifications([]);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message);
    } finally {
      setDeletingAll(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      setProcessingIds((prev) => new Set(prev).add(notificationId));
      const res = await fetch("/api/users/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to mark as read");
      }
      // Update local state
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error.message);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    }
  };

  const handleDelete = async (notificationId: string) => {
    if (!confirm("Are you sure you want to delete this notification?")) {
      return;
    }
    try {
      setProcessingIds((prev) => new Set(prev).add(notificationId));
      const res = await fetch("/api/users/notifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete notification");
      }
      // Remove notification from state
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete notification");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <SectionCard title="Notifications" icon="fa-bell">
        <div className="flex min-h-[200px] items-center justify-center py-12">
          <Loading />
        </div>
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title="Notifications" icon="fa-bell">
        <p className="text-sm text-[var(--totk-grey-200)]">{error}</p>
      </SectionCard>
    );
  }

  const hasUnreadNotifications = notifications.some((n) => !n.read);

  return (
    <SectionCard title="Notifications" icon="fa-bell">
      <div className="space-y-5">
        {notifications.length > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--totk-dark-ocher)]/40 bg-gradient-to-r from-[var(--botw-warm-black)]/60 to-[var(--totk-brown)]/30 p-3 shadow-sm backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-bars-staggered text-sm text-[var(--totk-light-ocher)]" />
              <span className="text-sm font-medium text-[var(--botw-pale)]">
                {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
                {hasUnreadNotifications && (
                  <span className="ml-2 rounded-full bg-[var(--totk-light-green)]/20 px-2 py-0.5 text-xs font-semibold text-[var(--totk-light-green)]">
                    {notifications.filter((n) => !n.read).length} unread
                  </span>
                )}
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                onClick={handleMarkAllAsRead}
                disabled={markingAll || !hasUnreadNotifications}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 sm:w-auto ${
                  markingAll || !hasUnreadNotifications
                    ? "cursor-not-allowed bg-[var(--totk-grey-400)]/30 text-[var(--totk-grey-200)] opacity-50"
                    : "bg-gradient-to-r from-[var(--totk-dark-green)] to-[var(--totk-green)] text-[var(--totk-ivory)] shadow-md shadow-[var(--totk-dark-green)]/20 hover:shadow-[var(--totk-dark-green)]/30 hover:scale-105"
                }`}
              >
                <i className={`fa-solid ${markingAll ? "fa-spinner fa-spin" : "fa-check-double"} text-xs`} />
                {markingAll ? "Marking..." : "Mark all read"}
              </button>
              <button
                onClick={handleDeleteAll}
                disabled={deletingAll}
                className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 sm:w-auto ${
                  deletingAll
                    ? "cursor-not-allowed bg-[var(--totk-grey-400)]/30 text-[var(--totk-grey-200)] opacity-50"
                    : "bg-gradient-to-r from-[#dc2626] to-[#ef4444] text-white shadow-md shadow-[#dc2626]/20 hover:shadow-[#dc2626]/30 hover:scale-105"
                }`}
              >
                <i className={`fa-solid ${deletingAll ? "fa-spinner fa-spin" : "fa-trash"} text-xs`} />
                {deletingAll ? "Deleting..." : "Delete all"}
              </button>
            </div>
          </div>
        )}
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--totk-grey-400)]/50 bg-[var(--totk-grey-400)]/20 px-6 py-10 text-center">
            <i className="fa-regular fa-bell-slash mb-3 text-2xl text-[var(--totk-grey-200)]" />
            <p className="text-sm font-medium text-[var(--botw-pale)]">No notifications yet</p>
            <p className="mt-1 text-xs text-[var(--totk-grey-200)]">
              Quest reminders, level-ups, and other updates will show here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--totk-grey-400)]/30">
            {notifications.map((n) => {
              const isProcessing = processingIds.has(n.id);
              return (
                <div
                  key={n.id}
                  id={`notification-${n.id}`}
                  className={`group relative flex gap-3 border-l-2 py-4 pl-4 pr-4 transition-all duration-200 first:pt-0 last:pb-0 hover:bg-[var(--totk-grey-400)]/10 scroll-mt-4 ${
                    !n.read ? "border-l-[var(--totk-light-green)] bg-[var(--totk-light-green)]/5" : "border-l-transparent"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                      n.type === "oc_approved" || n.type === "character_accepted"
                        ? "bg-[var(--totk-light-green)]/20"
                        : n.type === "oc_needs_changes"
                          ? "bg-[var(--totk-light-ocher)]/20"
                          : "bg-[var(--botw-blue)]/20"
                    }`}
                  >
                    <i
                      className={`fa-solid text-sm ${
                        n.type === "oc_approved" || n.type === "character_accepted"
                          ? "fa-check text-[var(--totk-light-green)]"
                          : n.type === "oc_needs_changes"
                            ? "fa-exclamation text-[var(--totk-light-ocher)]"
                            : "fa-info text-[var(--botw-blue)]"
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <p className="break-words text-sm font-semibold text-[var(--botw-pale)]">{n.title}</p>
                        <div className="mt-1 break-words text-xs leading-relaxed text-[var(--totk-grey-200)] overflow-wrap-anywhere">
                          <ReactMarkdown components={NOTIFICATION_MARKDOWN_COMPONENTS}>
                            {convertUrlsToMarkdown(n.message)}
                          </ReactMarkdown>
                        </div>
                        <div className="mt-2 flex items-center gap-3 flex-wrap">
                          <p className="text-[11px] text-[var(--totk-grey-200)]">
                            {formatDate(n.createdAt)}
                          </p>
                          {!n.read && (
                            <span className="rounded-full bg-[var(--totk-light-green)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--totk-light-green)]">
                              Unread
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100">
                        {!n.read && (
                          <button
                            onClick={() => handleMarkAsRead(n.id)}
                            disabled={isProcessing}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--totk-dark-green)]/20 text-[var(--totk-light-green)] transition-all duration-200 hover:bg-[var(--totk-dark-green)]/30 hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Mark as read"
                          >
                            <i className={`fa-solid ${isProcessing ? "fa-spinner fa-spin" : "fa-check"} text-xs`} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(n.id)}
                          disabled={isProcessing}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#dc2626]/20 text-[#ef4444] transition-all duration-200 hover:bg-[#dc2626]/30 hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50"
                          title="Delete notification"
                        >
                          <i className={`fa-solid ${isProcessing ? "fa-spinner fa-spin" : "fa-trash"} text-xs`} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </SectionCard>
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

function Divider() {
  return <div className="my-4 border-t border-[var(--totk-grey-400)]/60" />;
}

function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

/* ============================================================================ */
/* ------------------- Utility Functions ------------------- */
/* ============================================================================ */

function calculateLevelProgress(leveling: UserProfile["leveling"]) {
  // Calculate XP needed for current level
  let currentLevelTotalXP = 0;
  for (let i = 2; i <= leveling.level; i++) {
    currentLevelTotalXP += getXPRequiredForLevel(i);
  }

  // Calculate XP needed for next level
  const xpNeededForNextLevel = getXPRequiredForLevel(leveling.level + 1);

  // Calculate progress within current level
  const progressXP = leveling.xp - currentLevelTotalXP;
  const percentage = Math.min(100, Math.max(0, Math.round((progressXP / xpNeededForNextLevel) * 100)));

  return {
    currentXP: progressXP,
    nextLevelXP: xpNeededForNextLevel,
    percentage,
  };
}

function getXPRequiredForLevel(targetLevel: number): number {
  if (targetLevel < 1) return 0;
  return 5 * Math.pow(targetLevel, 2) + 50 * targetLevel + 100;
}

function calculateQuestTurnInSummary(quests: UserProfile["quests"]) {
  const legacyPending = quests.legacy?.pendingTurnIns || 0;
  const currentPending = quests.pendingTurnIns || 0;
  const totalPending = legacyPending + currentPending;
  const redeemableSets = Math.floor(totalPending / 10);
  const remainder = totalPending % 10;

  return {
    totalPending,
    redeemableSets,
    remainder,
    legacyPending,
    currentPending,
  };
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatShortDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}


function helpWantedToday(completions: HelpWantedCompletion[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return completions.filter((c) => c.date === today).length;
}

function helpWantedThisWeek(completions: HelpWantedCompletion[]): number {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day;
  const sun = new Date(now);
  sun.setDate(diff);
  const weekStart = sun.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  return completions.filter((c) => c.date >= weekStart && c.date <= today).length;
}

function lastHelpWantedQuest(
  completions: HelpWantedCompletion[],
): { questType: string; village: string; date: string } | null {
  if (!completions.length) return null;
  const sorted = [...completions].sort(
    (a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const last = sorted[0];
  return {
    questType: last.questType,
    village: last.village,
    date: last.date,
  };
}

function helpWantedByVillage(
  completions: HelpWantedCompletion[],
): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const c of completions) {
    const v = capitalize(c.village);
    acc[v] = (acc[v] ?? 0) + 1;
  }
  return acc;
}

function helpWantedByType(
  completions: HelpWantedCompletion[],
): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const c of completions) {
    const t = capitalize(c.questType);
    acc[t] = (acc[t] ?? 0) + 1;
  }
  return acc;
}

function formatBirthday(month: number, day: number): string {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${months[month - 1]} ${day}`;
}

function calculateQuestMonthlyData(completions: QuestCompletion[]) {
  const monthlyMap: Record<string, number> = {};
  
  completions.forEach((completion) => {
    const date = new Date(completion.completedAt);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap[monthKey] = (monthlyMap[monthKey] || 0) + 1;
  });

  return Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({
      month: month.slice(5) + "/" + month.slice(0, 4),
      count,
    }));
}

function calculateQuestWeeklyData(completions: QuestCompletion[]) {
  const weeklyMap: Record<string, number> = {};
  
  completions.forEach((completion) => {
    const date = new Date(completion.completedAt);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = `${weekStart.getFullYear()}-W${String(Math.ceil((weekStart.getDate() + weekStart.getDay()) / 7)).padStart(2, "0")}`;
    const displayKey = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
    weeklyMap[displayKey] = (weeklyMap[displayKey] || 0) + 1;
  });

  return Object.entries(weeklyMap)
    .slice(-12)
    .map(([week, count]) => ({
      week,
      count,
    }));
}

function calculateQuestTypeChartData(typeTotals: UserProfile["quests"]["typeTotals"]) {
  return Object.entries(typeTotals)
    .filter(([, count]) => count > 0)
    .map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }))
    .sort((a, b) => b.value - a.value);
}

function helpWantedThisMonth(completions: HelpWantedCompletion[]): number {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  return completions.filter((c) => c.date >= monthStartStr && c.date <= today).length;
}

function calculateHelpWantedMonthlyData(completions: HelpWantedCompletion[]) {
  const monthlyMap: Record<string, number> = {};
  
  completions.forEach((completion) => {
    const dateStr = completion.date;
    const monthKey = dateStr.slice(0, 7); // YYYY-MM
    monthlyMap[monthKey] = (monthlyMap[monthKey] || 0) + 1;
  });

  return Object.entries(monthlyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, count]) => ({
      month: month.slice(5) + "/" + month.slice(0, 4),
      count,
    }));
}

function calculateHelpWantedWeeklyData(completions: HelpWantedCompletion[]) {
  const weeklyMap: Record<string, number> = {};
  
  completions.forEach((completion) => {
    const date = new Date(completion.date);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const displayKey = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
    weeklyMap[displayKey] = (weeklyMap[displayKey] || 0) + 1;
  });

  return Object.entries(weeklyMap)
    .slice(-12)
    .map(([week, count]) => ({
      week,
      count,
    }));
}

/* ============================================================================ */
/* ------------------- Tokens Tab ------------------- */
/* ============================================================================ */

type TokenTransaction = {
  id: string;
  amount: number;
  type: "earned" | "spent";
  category: string;
  description: string;
  link: string;
  balanceBefore: number;
  balanceAfter: number;
  timestamp: string;
};

type TokenData = {
  currentBalance: number;
  totalEarned: number;
  totalSpent: number;
  totalTransactions: number;
  transactions: TokenTransaction[];
};

function TokensTabContent() {
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "earned" | "spent">("all");

  useEffect(() => {
    const fetchTokenData = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch("/api/users/tokens");
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to fetch token data");
        }
        const data = (await res.json()) as TokenData;
        setTokenData(data);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTokenData();
  }, []);

  const filteredTransactions = useMemo(() => {
    if (!tokenData) return [];
    if (filter === "all") return tokenData.transactions;
    return tokenData.transactions.filter((t) => t.type === filter);
  }, [tokenData, filter]);

  // Calculate token balance over time
  const tokenBalanceData = useMemo(() => {
    if (!tokenData || tokenData.transactions.length === 0) return [];
    
    const sortedTransactions = [...tokenData.transactions].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    return sortedTransactions.map((t) => {
      const date = new Date(t.timestamp);
      return {
        date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        balance: t.balanceAfter,
        earned: t.type === "earned" ? t.amount : 0,
        spent: t.type === "spent" ? t.amount : 0,
      };
    });
  }, [tokenData]);

  // Calculate monthly token flow
  const monthlyFlowData = useMemo(() => {
    if (!tokenData || tokenData.transactions.length === 0) return [];
    
    const monthlyMap: Record<string, { earned: number; spent: number }> = {};
    
    tokenData.transactions.forEach((t) => {
      const date = new Date(t.timestamp);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      
      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { earned: 0, spent: 0 };
      }
      
      if (t.type === "earned") {
        monthlyMap[monthKey].earned += t.amount;
      } else {
        monthlyMap[monthKey].spent += t.amount;
      }
    });
    
    return Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: month.slice(5) + "/" + month.slice(0, 4),
        earned: data.earned,
        spent: data.spent,
      }));
  }, [tokenData]);

  // Calculate category breakdown
  const categoryData = useMemo(() => {
    if (!tokenData || tokenData.transactions.length === 0) return [];
    
    const categoryMap: Record<string, number> = {};
    
    tokenData.transactions.forEach((t) => {
      const category = t.category || "Other";
      categoryMap[category] = (categoryMap[category] || 0) + Math.abs(t.amount);
    });
    
    return Object.entries(categoryMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([name, value]) => ({ name, value }));
  }, [tokenData]);

  const PIE_CHART_COLORS = [
    "var(--botw-blue)",
    "var(--totk-light-green)",
    "#ff6b6b",
    "var(--totk-light-ocher)",
    "#9b59b6",
    "#3498db",
    "#e67e22",
    "#1abc9c",
  ];

  // Example transactions to show when none exist
  const exampleTransactions: TokenTransaction[] = useMemo(() => {
    const now = Date.now();
    const baseBalance = tokenData?.currentBalance || 56032;
    
    return [
      {
        id: "example-1",
        amount: 500,
        type: "earned",
        category: "Quest Completion",
        description: "Completed Monthly Quest: Winter & Spring Cleaning Resolutions",
        link: "",
        balanceBefore: baseBalance - 500,
        balanceAfter: baseBalance,
        timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "example-2",
        amount: 300,
        type: "earned",
        category: "Quest Completion",
        description: "Completed RP Quest: Village Festival",
        link: "",
        balanceBefore: baseBalance - 800,
        balanceAfter: baseBalance - 500,
        timestamp: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "example-3",
        amount: 1000,
        type: "spent",
        category: "Character Creation",
        description: "Created new character: Character Name",
        link: "",
        balanceBefore: baseBalance - 300,
        balanceAfter: baseBalance - 1300,
        timestamp: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "example-4",
        amount: 200,
        type: "earned",
        category: "Help Wanted",
        description: "Completed Help Wanted Quest in Rudania",
        link: "",
        balanceBefore: baseBalance - 1500,
        balanceAfter: baseBalance - 1300,
        timestamp: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "example-5",
        amount: 750,
        type: "spent",
        category: "Item Purchase",
        description: "Purchased Master Sword from Village Shop",
        link: "",
        balanceBefore: baseBalance - 750,
        balanceAfter: baseBalance - 1500,
        timestamp: new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
  }, [tokenData?.currentBalance]);

  const displayTransactions = filteredTransactions.length > 0 ? filteredTransactions : (filter === "all" ? exampleTransactions : exampleTransactions.filter((t) => t.type === filter));
  const showingExamples = filteredTransactions.length === 0 && tokenData;

  if (loading) {
    return (
      <SectionCard title="Token Transaction History" icon="fa-coins">
        <div className="flex min-h-[200px] items-center justify-center py-12">
          <Loading />
        </div>
      </SectionCard>
    );
  }

  if (error) {
    return (
      <SectionCard title="Token Transaction History" icon="fa-coins">
        <p className="text-sm text-[var(--totk-grey-200)]">{error}</p>
      </SectionCard>
    );
  }

  if (!tokenData) {
    return (
      <SectionCard title="Token Transaction History" icon="fa-coins">
        <p className="text-sm text-[var(--totk-grey-200)]">No token data available</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Token Overview" icon="fa-coins">
        <p className="mb-6 text-sm leading-relaxed text-[var(--totk-grey-200)]">
          Track all your token transactions, including earned and spent tokens. View detailed history, statistics, and transaction details.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="group relative overflow-hidden rounded-xl border-2 border-[#FFD700]/60 bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--totk-brown)] px-4 py-4 shadow-[0_0_16px_rgba(255,215,0,0.2)] transition-all duration-300 hover:border-[#FFD700] hover:shadow-[0_0_24px_rgba(255,215,0,0.4)]">
            <div className="absolute right-0 top-0 h-16 w-16 rounded-bl-full bg-[#FFD700]/10" />
            <div className="relative">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                Current Balance
              </p>
              <div className="flex items-baseline gap-2">
                <i className="fa-solid fa-coins text-lg text-[#FFD700]" />
                <p className="text-2xl font-bold tabular-nums text-[#FFD700] drop-shadow-[0_0_8px_rgba(255,215,0,0.5)]">
                  {tokenData.currentBalance.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
          <Metric label="Total Earned" value={tokenData.totalEarned.toLocaleString()} accent="green" />
          <Metric label="Total Spent" value={tokenData.totalSpent.toLocaleString()} accent="blue" />
          <Metric label="Total Transactions" value={tokenData.totalTransactions} accent="muted" />
        </div>
      </SectionCard>

      {/* Token Charts */}
      {tokenBalanceData.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Token Balance Over Time" icon="fa-chart-line">
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={tokenBalanceData}>
                  <defs>
                    <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFD700" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#FFD700" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    stroke="var(--totk-grey-200)"
                    tick={{ fill: "var(--totk-grey-200)", fontSize: 10 }}
                    interval="preserveStartEnd"
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
                    itemStyle={{ color: "var(--botw-pale)" }}
                    labelStyle={{ color: "var(--totk-light-green)" }}
                    cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                  />
                  <Legend 
                    wrapperStyle={{ color: "var(--botw-pale)" }}
                    iconType="line"
                  />
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke="#FFD700"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorBalance)"
                    name="Balance"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {categoryData.length > 0 && (
            <SectionCard title="Category Breakdown" icon="fa-chart-pie">
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={false}
                        outerRadius={80}
                        innerRadius={30}
                        fill="var(--botw-blue)"
                        dataKey="value"
                        paddingAngle={2}
                      >
                        {categoryData.map((entry) => {
                          const index = categoryData.findIndex(e => e.name === entry.name);
                          return (
                            <Cell 
                              key={entry.name} 
                              fill={PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]}
                              stroke="var(--botw-warm-black)"
                              strokeWidth={2}
                            />
                          );
                        })}
                      </Pie>
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
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-center gap-2">
                  {categoryData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center justify-between rounded-lg bg-[var(--totk-grey-400)]/30 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: PIE_CHART_COLORS[index % PIE_CHART_COLORS.length] }}
                        />
                        <span className="text-sm text-[var(--botw-pale)] truncate">{entry.name}</span>
                      </div>
                      <span className="font-semibold text-[var(--totk-light-green)] shrink-0">{entry.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {/* Monthly Flow Chart */}
      {monthlyFlowData.length > 0 && (
        <SectionCard title="Monthly Token Flow" icon="fa-exchange-alt">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyFlowData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--totk-grey-400)" opacity={0.3} />
                <XAxis 
                  dataKey="month" 
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
                  itemStyle={{ color: "var(--botw-pale)" }}
                  labelStyle={{ color: "var(--totk-light-green)" }}
                  cursor={{ fill: "rgba(255, 255, 255, 0.1)" }}
                />
                <Legend 
                  wrapperStyle={{ color: "var(--botw-pale)" }}
                  iconType="square"
                />
                <Bar dataKey="earned" fill="var(--totk-light-green)" name="Earned" radius={[8, 8, 0, 0]}>
                  <LabelList dataKey="earned" position="top" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                </Bar>
                <Bar dataKey="spent" fill="var(--botw-blue)" name="Spent" radius={[8, 8, 0, 0]}>
                  <LabelList dataKey="spent" position="top" fill="var(--botw-pale)" fontSize={11} fontWeight="bold" />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      <SectionCard title="Recent Transactions" icon="fa-list">
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2 rounded-lg border border-[var(--totk-dark-ocher)]/30 bg-[var(--totk-grey-400)]/30 p-2">
            <button
              onClick={() => setFilter("all")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                filter === "all"
                  ? "bg-gradient-to-r from-[var(--totk-dark-green)] to-[var(--totk-green)] text-[var(--totk-ivory)] shadow-lg shadow-[var(--totk-dark-green)]/20"
                  : "bg-[var(--totk-grey-400)]/50 text-[var(--botw-pale)] hover:bg-[var(--totk-grey-400)]/70 hover:text-[var(--totk-light-green)]"
              }`}
            >
              <i className={`fa-solid ${filter === "all" ? "fa-check-circle" : "fa-circle"} text-xs`} />
              All
            </button>
            <button
              onClick={() => setFilter("earned")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                filter === "earned"
                  ? "bg-gradient-to-r from-[var(--totk-dark-green)] to-[var(--totk-green)] text-[var(--totk-ivory)] shadow-lg shadow-[var(--totk-dark-green)]/20"
                  : "bg-[var(--totk-grey-400)]/50 text-[var(--botw-pale)] hover:bg-[var(--totk-grey-400)]/70 hover:text-[var(--totk-light-green)]"
              }`}
            >
              <i className={`fa-solid ${filter === "earned" ? "fa-check-circle" : "fa-circle"} text-xs`} />
              <i className="fa-solid fa-plus text-xs" />
              Earned
            </button>
            <button
              onClick={() => setFilter("spent")}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                filter === "spent"
                  ? "bg-gradient-to-r from-[var(--totk-dark-green)] to-[var(--totk-green)] text-[var(--totk-ivory)] shadow-lg shadow-[var(--totk-dark-green)]/20"
                  : "bg-[var(--totk-grey-400)]/50 text-[var(--botw-pale)] hover:bg-[var(--totk-grey-400)]/70 hover:text-[var(--totk-light-green)]"
              }`}
            >
              <i className={`fa-solid ${filter === "spent" ? "fa-check-circle" : "fa-circle"} text-xs`} />
              <i className="fa-solid fa-minus text-xs" />
              Spent
            </button>
          </div>

          {showingExamples && (
            <div className="mb-4 rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--totk-mid-ocher)]/10 px-4 py-3">
              <div className="flex items-start gap-2">
                <i className="fa-solid fa-info-circle mt-0.5 text-sm text-[var(--totk-light-ocher)]" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-[var(--totk-light-ocher)]">Showing Example Transactions</p>
                  <p className="mt-1 text-xs text-[var(--totk-grey-200)]">
                    These are example transactions to show what your transaction history will look like. Once you start earning or spending tokens, your real transactions will appear here.
                  </p>
                </div>
              </div>
            </div>
          )}

          {displayTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--totk-grey-400)]/50 bg-gradient-to-br from-[var(--totk-grey-400)]/20 to-[var(--botw-warm-black)]/40 px-6 py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--totk-grey-400)]/30">
                <i className="fa-solid fa-inbox text-2xl text-[var(--totk-grey-200)] opacity-50" />
              </div>
              <p className="text-sm font-semibold text-[var(--botw-pale)]">No transactions found</p>
              <p className="mt-1.5 text-xs text-[var(--totk-grey-200)]">
                {filter === "all" ? "You haven't made any token transactions yet." : `No ${filter} transactions found.`}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {displayTransactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className={`group relative overflow-hidden rounded-xl border p-4 transition-all duration-300 ${
                    showingExamples && transaction.id.startsWith("example-")
                      ? "border-[var(--totk-dark-ocher)]/20 bg-gradient-to-br from-[var(--botw-warm-black)]/40 to-[var(--totk-brown)]/20 opacity-60"
                      : "border-[var(--totk-dark-ocher)]/30 bg-gradient-to-br from-[var(--botw-warm-black)]/60 to-[var(--totk-brown)]/40 hover:border-[var(--totk-dark-ocher)]/60 hover:shadow-lg hover:shadow-[var(--totk-dark-ocher)]/20"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-lg transition-all duration-300 group-hover:scale-110 ${
                            transaction.type === "earned"
                              ? "bg-gradient-to-br from-[var(--totk-dark-green)] to-[var(--totk-green)] shadow-[var(--totk-light-green)]/30"
                              : "bg-gradient-to-br from-[var(--botw-dark-blue)] to-[var(--botw-blue)] shadow-[var(--botw-blue)]/30"
                          }`}
                        >
                          <i
                            className={`fa-solid text-sm ${
                              transaction.type === "earned" ? "fa-plus text-[var(--totk-light-green)]" : "fa-minus text-[var(--botw-blue)]"
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-[var(--botw-pale)] truncate">
                              {transaction.description || transaction.category || "Transaction"}
                            </span>
                            {transaction.link && (
                              <Link
                                href={transaction.link}
                                className="shrink-0 text-[var(--botw-blue)] transition-colors hover:text-[var(--botw-blue)]/80"
                                target="_blank"
                                rel="noopener noreferrer"
                                title="View related content"
                              >
                                <i className="fa-solid fa-external-link text-xs" />
                              </Link>
                            )}
                          </div>
                          {transaction.category && transaction.description && (
                            <p className="mt-0.5 text-xs text-[var(--totk-grey-200)]">{transaction.category}</p>
                          )}
                        </div>
                      </div>
                      <div className="ml-11 flex items-center gap-3 text-xs text-[var(--totk-grey-200)]">
                        <div className="flex items-center gap-1.5">
                          <i className="fa-solid fa-clock text-[10px]" />
                          <span>{formatDate(transaction.timestamp)}</span>
                        </div>
                        <span className="opacity-50">•</span>
                        <div className="flex items-center gap-1.5">
                          <i className="fa-solid fa-wallet text-[10px]" />
                          <span>Balance: {transaction.balanceAfter.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`text-xl font-bold tabular-nums drop-shadow-[0_0_4px_rgba(0,0,0,0.3)] ${
                          transaction.type === "earned"
                            ? "text-[var(--totk-light-green)]"
                            : "text-[var(--botw-blue)]"
                        }`}
                      >
                        {transaction.type === "earned" ? "+" : "-"}
                        {Math.abs(transaction.amount).toLocaleString()}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                        {transaction.type === "earned" ? "Earned" : "Spent"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
