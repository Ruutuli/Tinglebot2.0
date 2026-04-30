"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { TOP_BAR_HEIGHT } from "@/components/layout/top-bar";
import { useSession } from "@/hooks/use-session";
import { Loading, Tabs } from "@/components/ui";

type QuestTab = "create" | "list";

function ItemNameAutocomplete({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (name: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!value.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      fetch(`/api/models/items?search=${encodeURIComponent(value.trim())}&limit=15`)
        .then((r) => r.json())
        .then((data: { data?: Array<{ itemName?: string }> }) => {
          const names = (data.data ?? [])
            .map((i) => i.itemName)
            .filter((n): n is string => typeof n === "string" && n.length > 0);
          setSuggestions(names);
          setOpen(names.length > 0);
        })
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => value.trim() && suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] py-1 shadow-lg">
          {suggestions.map((name) => (
            <li
              key={name}
              className="cursor-pointer px-3 py-2 text-sm text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/40"
              onMouseDown={() => {
                onChange(name);
                setOpen(false);
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
      {loading && value.trim() && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--totk-grey-200)]">...</span>
      )}
    </div>
  );
}
const QUEST_TABS: { value: QuestTab; label: string; icon: string }[] = [
  { value: "create", label: "Create new quest", icon: "fa-plus" },
  { value: "list", label: "Quest list", icon: "fa-list" },
];

const QUEST_TYPES = ["Art", "Writing", "Interactive", "Interactive / RP", "RP", "Art / Writing"] as const;

function isInteractiveStyleQuestType(t: string): boolean {
  return t === "Interactive" || t === "Interactive / RP";
}

function isRpStyleQuestType(t: string): boolean {
  return t === "RP" || t === "Interactive / RP";
}
const STATUSES = ["draft", "pending", "active", "completed"] as const;
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Complete" },
];
function statusDisplay(s: string | undefined): string {
  if (!s) return "—";
  const o = STATUS_OPTIONS.find((x) => x.value === s);
  return o ? o.label : s;
}

const PARTICIPANT_PROGRESS_VALUES = ["active", "completed", "failed", "rewarded", "disqualified"] as const;

/** Row background tint in the manage-participants table (scannable at a glance). */
function participantProgressRowClass(progress: string): string {
  const base =
    "border-b border-[var(--totk-dark-ocher)]/30 last:border-b-0 transition-colors";
  switch (progress) {
    case "active":
      return `${base} bg-cyan-500/10`;
    case "completed":
      return `${base} bg-amber-500/12`;
    case "failed":
      return `${base} bg-red-500/12`;
    case "rewarded":
      return `${base} bg-emerald-500/12`;
    case "disqualified":
      return `${base} bg-violet-500/12`;
    default:
      return `${base} bg-[var(--botw-black)]/20`;
  }
}

const LOCATION_PRESETS = ["Rudania", "Inariko", "Vhintl", "ALL"] as const;
const TIME_LIMIT_PRESETS = ["1 week", "2 weeks", "1 month", "2 months"] as const;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Parse stored date (e.g. "January 2026" or "2026-01") to YYYY-MM for month input */
function parseDateToYYYYMM(s: string): string {
  const trimmed = String(s ?? "").trim();
  if (!trimmed) return "";
  const yyyyMm = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (yyyyMm) return `${yyyyMm[1]}-${yyyyMm[2]}`;
  const monthMatch = trimmed.match(/^(\w+)\s+(\d{4})$/i);
  if (monthMatch) {
    const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === monthMatch[1].toLowerCase());
    if (idx >= 0) return `${monthMatch[2]}-${String(idx + 1).padStart(2, "0")}`;
  }
  return trimmed;
}

/** Convert YYYY-MM to "January 2026" for API storage */
function yyyyMmToDisplay(ym: string): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  const monthIdx = parseInt(m, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return ym;
  return `${MONTH_NAMES[monthIdx]} ${y}`;
}

/** Calculate end date from start (YYYY-MM, first of month) + duration string */
function getEndDateFromDuration(startYYYYMM: string, duration: string): Date | null {
  if (!startYYYYMM || !/^\d{4}-\d{2}$/.test(startYYYYMM)) return null;
  const [y, m] = startYYYYMM.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  if (Number.isNaN(start.getTime())) return null;
  const d = String(duration).toLowerCase();
  let end: Date;
  const weekMatch = d.match(/(\d+)\s*week/);
  const monthMatch = d.match(/(\d+)\s*month/);
  const dayMatch = d.match(/(\d+)\s*day/);
  if (weekMatch) {
    end = new Date(start);
    end.setDate(end.getDate() + parseInt(weekMatch[1], 10) * 7);
  } else if (monthMatch) {
    end = new Date(start);
    end.setMonth(end.getMonth() + parseInt(monthMatch[1], 10));
  } else if (dayMatch) {
    end = new Date(start);
    end.setDate(end.getDate() + parseInt(dayMatch[1], 10));
  } else if (duration === "Custom") {
    return null;
  } else {
    end = new Date(start);
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

/** Last day YYYY-MM-DD of the month that ends an N-month window starting at quest `date` (YYYY-MM or parsed label). Matches bot QuestModel month expiry. */
function computeDefaultTimeLimitEndDateYyyyMmDd(f: FormState): string | null {
  const tl = f.timeLimit === "Custom" ? f.timeLimitCustom.trim() : f.timeLimit;
  const monthMatch = tl.toLowerCase().match(/(\d+)\s*month/);
  if (!monthMatch) return null;
  const n = Math.max(1, parseInt(monthMatch[1], 10));
  const ym = parseDateToYYYYMM(f.date.trim());
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [yStr, mStr] = ym.split("-");
  const y = parseInt(yStr, 10);
  const month0 = parseInt(mStr, 10) - 1;
  const total = month0 + (n - 1);
  const ey = y + Math.floor(total / 12);
  const em0 = ((total % 12) + 12) % 12;
  const lastDay = new Date(ey, em0 + 1, 0).getDate();
  return `${ey}-${String(em0 + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function formatEndDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Civil YYYY-MM-DD → display line matching formatEndDateWithTime (11:59 pm label). */
function formatEndDateFromYyyyMmDd(ymd: string): string {
  const m = String(ymd).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return ymd;
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  const dt = new Date(y, mo - 1, d);
  if (Number.isNaN(dt.getTime())) return ymd;
  return formatEndDateWithTime(dt);
}

/** Format end date for Duration line: "April 30th 11:59 pm" */
function formatEndDateWithTime(d: Date): string {
  const day = d.getDate();
  const ord = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
  const month = d.toLocaleDateString("en-US", { month: "long" });
  return `${month} ${day}${ord} 11:59 pm`;
}

/**
 * RP thread parent picker options (forum / RP channels).
 * Sync with bot: `QUEST_RP_PARENT_IDS_BY_VILLAGE` + `QUEST_RP_SHARED_PARENT_IDS` in `bot/utils/tableRollUtils.js`.
 */
const RP_THREAD_CHANNELS: { id: string; name: string }[] = [
  { id: "629027808274022410", name: "🔥》rudania" },
  { id: "717090447369043990", name: "🔥》akkala-parade-grounds" },
  { id: "629027788229443623", name: "💧》inariko" },
  { id: "717090521218285670", name: "💧》lanayru-promenade" },
  { id: "629027942437224498", name: "🌱》vhintl" },
  { id: "717090589690298419", name: "🌱》damel-forest" },
  { id: "717091108295016448", name: "⭐》casual-rp" },
];

const DEFAULT_RP_RULES = `- 1-week signup window.
- Stay in the quest village for the entire duration.
- Posts: 20+ characters, meaningful content only.
- Member-capped: max 15 participants. Only one member-capped quest per person.
- Reward requirement: 15 posts.
- Keep all replies to two paragraphs or less. Strictly enforced—going over the Discord character limit and posting twice is forbidden with the bot-driven quest system.`;

type QuestRecord = {
  _id: string;
  title?: string;
  questID?: string;
  date?: string;
  createdAt?: string;
  questType?: string;
  status?: string;
  posted?: boolean;
  postedAt?: string | null;
  tokenReward?: string | number;
  itemRewards?: Array<{ name: string; quantity: number }>;
  itemReward?: string;
  itemRewardQty?: number;
  tableRollName?: string;
  tableRollNames?: string[];
  requiredRolls?: number;
  participants?: Record<
    string,
    {
      userId?: string;
      username?: string | null;
      characterName?: string;
      progress?: string;
      completedAt?: string;
      rewardedAt?: string;
      tokensEarned?: number;
      questTokensPaidViaSubmission?: boolean;
      submissionRewardTokenAmount?: number | null;
      rpPostCount?: number;
    }
  >;
  participantCap?: number | null;
  createdByUserId?: string | null;
  createdByUsername?: string | null;
  [key: string]: unknown;
};

function buildRpParentsForForm(q: QuestRecord, threadCount: number): string[] {
  const n = Math.min(10, Math.max(1, threadCount));
  const rawArr = (q as Record<string, unknown>).rpThreadParentChannels;
  let slots: string[] = [];
  if (Array.isArray(rawArr) && rawArr.length > 0) {
    slots = rawArr.slice(0, n).map((x) => String(x ?? "").trim());
  }
  const legacy = String((q as Record<string, unknown>).rpThreadParentChannel ?? "").trim();
  while (slots.length < n) {
    const prev = slots[slots.length - 1];
    slots.push((prev ?? legacy ?? "").trim() || legacy || "");
  }
  return slots.slice(0, n);
}

/** Parse quest date (e.g. "January 2026" or "2026-01") to a sortable string YYYY-MM, or use createdAt. */
function getQuestSortKey(q: QuestRecord): string {
  const dateStr = String(q.date ?? "").trim();
  if (dateStr) {
    const yyyyMm = parseDateToYYYYMM(dateStr);
    if (yyyyMm) return yyyyMm;
  }
  const created = q.createdAt;
  if (created) {
    try {
      const d = new Date(created);
      if (!Number.isNaN(d.getTime())) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      }
    } catch { /* ignore */ }
  }
  return "0000-00";
}

function isQuestPosted(q: QuestRecord): boolean {
  if (q.posted === true) return true;
  const messageID = q.messageID ?? (q as Record<string, unknown>).messageID;
  if (messageID && String(messageID).trim()) return true;
  const postedAt = q.postedAt ?? (q as Record<string, unknown>).postedAt;
  if (postedAt) return true;
  return false;
}

/** Build request body for POST /api/admin/quests/preview from a loaded quest (view modal). */
function viewQuestToPreviewBody(q: QuestRecord): Record<string, unknown> {
  const location = (q as Record<string, unknown>).location as string | undefined;
  const timeLimit = (q as Record<string, unknown>).timeLimit as string | undefined;
  const rules = (q as Record<string, unknown>).rules as string | undefined;
  const signupDeadline = (q as Record<string, unknown>).signupDeadline as string | undefined;
  const collabAllowed = (q as Record<string, unknown>).collabAllowed as boolean | undefined;
  const collabRule = (q as Record<string, unknown>).collabRule as string | undefined;
  const qr = Array.isArray((q as QuestRecord).tableRollNames)
    ? (q as QuestRecord).tableRollNames!.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
    : [];
  const legacyRoll = q.tableRollName ?? (q as Record<string, unknown>).tableroll as string | undefined;
  let namesResolved = qr;
  const qtPv = String(q.questType ?? "");
  if (
    !namesResolved.length &&
    (isInteractiveStyleQuestType(qtPv) || qtPv === "RP") &&
    typeof legacyRoll === "string" &&
    legacyRoll.trim()
  ) {
    namesResolved = [
      ...new Set(legacyRoll.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)),
    ];
  }
  const tableroll =
    namesResolved.length > 0
      ? namesResolved.join(", ")
      : typeof legacyRoll === "string"
        ? legacyRoll.trim()
        : "";
  const postRequirement = (q as Record<string, unknown>).postRequirement as number | undefined;
  const minRequirements = (q as Record<string, unknown>).minRequirements;
  const itemRewards = q.itemRewards ?? (q.itemReward ? [{ name: String(q.itemReward), quantity: q.itemRewardQty ?? 1 }] : []);
  return {
    title: q.title ?? "",
    description: (q as Record<string, unknown>).description ?? "",
    rules: rules ?? "",
    date: q.date ?? "",
    questType: q.questType ?? "RP",
    questID: q.questID ?? "",
    location: location ?? "",
    timeLimit: timeLimit ?? "1 month",
    timeLimitEndDate: (() => {
      const raw = (q as { timeLimitEndDate?: string }).timeLimitEndDate;
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return null;
      return raw.trim();
    })(),
    signupDeadline: signupDeadline ?? null,
    status: q.status ?? "active",
    tokenReward: q.tokenReward ?? "N/A",
    collabAllowed: collabAllowed ?? false,
    collabRule: collabRule ?? null,
    itemRewards: Array.isArray(itemRewards) ? itemRewards : [],
    tableroll: tableroll || null,
    tableRollName: (namesResolved[0] ?? (typeof legacyRoll === "string" ? legacyRoll.trim() || null : null)),
    tableRollNames: namesResolved,
    postRequirement: postRequirement ?? 15,
    minRequirements: minRequirements ?? "",
  };
}

type ItemRewardRow = { name: string; quantity: number };

type FormState = {
  title: string;
  description: string;
  rules: string;
  date: string;
  questType: string;
  location: string;
  locationOther: string;
  timeLimit: string;
  timeLimitCustom: string;
  /** YYYY-MM-DD; quest ends 11:59:59.999 PM US Eastern on this civil day (overrides duration for bot expiration). */
  timeLimitEndDate: string;
  signupDeadline: string;
  participantCap: string;
  postRequirement: string;
  minRequirements: string;
  tableroll: string;
  requiredRolls: string;
  tokenFlat: string;
  tokenPerUnit: string;
  tokenUnit: string;
  tokenMax: string;
  tokenCollabBonus: string;
  tokenRewardCustom: string;
  itemRewards: ItemRewardRow[];
  rpThreadParentChannel: string;
  /** One Discord parent channel ID per RP thread slot (same length semantically as rpThreadCount). */
  rpThreadParentChannels: string[];
  rpThreadCount: string;
  rpThreadId: string;
  collabAllowed: boolean;
  collabRule: string;
  questID: string;
  status: string;
  posted: boolean;
  postedAt: string;
  botNotes: string;
  artWritingMode: "both" | "either";
};

function getDefaultDateYYYYMM(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const emptyForm: FormState = {
  title: "",
  description: "",
  rules: DEFAULT_RP_RULES,
  date: getDefaultDateYYYYMM(),
  questType: "RP",
  location: "",
  locationOther: "",
  timeLimit: "1 month",
  timeLimitCustom: "",
  timeLimitEndDate: "",
  signupDeadline: "",
  participantCap: "",
  postRequirement: "",
  minRequirements: "",
  tableroll: "",
  requiredRolls: "1",
  tokenFlat: "",
  tokenPerUnit: "",
  tokenUnit: "",
  tokenMax: "",
  tokenCollabBonus: "",
  tokenRewardCustom: "",
  itemRewards: [],
  rpThreadParentChannel: "",
  rpThreadParentChannels: [""],
  rpThreadCount: "1",
  rpThreadId: "",
  collabAllowed: false,
  collabRule: "",
  questID: "",
  status: "active",
  posted: false,
  postedAt: "",
  botNotes: "",
  artWritingMode: "both",
};

type ParsedToken = {
  tokenFlat: string;
  tokenPerUnit: string;
  tokenUnit: string;
  tokenMax: string;
  tokenCollabBonus: string;
  tokenRewardCustom: string;
};

function parseTokenReward(tokenReward: string | number | undefined): ParsedToken {
  const empty: ParsedToken = {
    tokenFlat: "",
    tokenPerUnit: "",
    tokenUnit: "",
    tokenMax: "",
    tokenCollabBonus: "",
    tokenRewardCustom: "",
  };
  const raw = tokenReward == null ? "" : typeof tokenReward === "number" ? String(tokenReward) : String(tokenReward);
  if (!raw.trim()) return empty;
  const flatMatch = raw.match(/flat:(\d+)/i);
  const perUnitMatch = raw.match(/per_unit:(\d+)/i);
  const unitQuotedMatch = raw.match(/\bunit:"((?:[^"\\]|\\.)*)"/i);
  const unitUnquotedMatch = !unitQuotedMatch ? raw.match(/\bunit:(\S+)/i) : null;
  const unitRaw = unitQuotedMatch ? unitQuotedMatch[1].replace(/\\"/g, '"') : (unitUnquotedMatch ? unitUnquotedMatch[1] : "");
  const unit = unitRaw;
  const maxMatch = raw.match(/max:(\d+)/i);
  const collabMatch = raw.match(/collab_bonus:(\d+)/i);
  if (flatMatch || perUnitMatch || collabMatch || /^\d+$/.test(raw.trim())) {
    return {
      tokenFlat: flatMatch ? flatMatch[1] : /^\d+$/.test(raw.trim()) ? raw.trim() : "",
      tokenPerUnit: perUnitMatch ? perUnitMatch[1] : "",
      tokenUnit: unitRaw,
      tokenMax: maxMatch ? maxMatch[1] : "",
      tokenCollabBonus: collabMatch ? collabMatch[1] : "",
      tokenRewardCustom: "",
    };
  }
  return { ...empty, tokenRewardCustom: raw.trim() };
}

function parseInteractiveTablerollTokens(raw: string): string[] {
  return [...new Set(raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))];
}

/** Discord thread snowflakes from manual override field (comma / newline / whitespace separated). */
function parseManualRpThreadIds(raw: string): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  const tokens = s.split(/[\n,\s]+/).map((x) => x.trim()).filter(Boolean);
  const uniq = [...new Set(tokens)];
  return uniq.filter((id) => /^\d{17,25}$/.test(id));
}

/** Table row from GET /api/models/tablerolls when logged in as admin/mod (includes drafts). */
type TablerollCatalogEntry = { name: string; isActive: boolean };

function toggleTablerollPickerToken(tableroll: string, name: string, catalogNames: string[]): string {
  const catalogSet = new Set(catalogNames.map((x) => x.trim()).filter(Boolean));
  const tokens = parseInteractiveTablerollTokens(tableroll);
  const picked = tokens.filter((t) => catalogSet.has(t));
  const custom = tokens.filter((t) => !catalogSet.has(t));
  const set = new Set(picked);
  if (set.has(name)) set.delete(name);
  else set.add(name);
  const merged = [...set, ...custom];
  merged.sort((a, b) => a.localeCompare(b));
  return merged.join("\n");
}

function TablerollNamePicker({
  tableroll,
  catalog,
  onChangeTableroll,
}: {
  tableroll: string;
  catalog: TablerollCatalogEntry[];
  onChangeTableroll: (v: string) => void;
}) {
  const catalogNames = catalog.map((c) => c.name);
  const sorted = [...catalog].sort((a, b) => a.name.localeCompare(b.name));
  if (sorted.length === 0) return null;
  return (
    <div className="sm:col-span-2 space-y-2">
      <p className="text-xs text-[var(--totk-grey-200)]">
        Select configured table roll names (tick all that apply). Published and draft tables are listed when you are signed in with staff access; you can still add custom names below.
      </p>
      <div className="max-h-44 overflow-y-auto rounded border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/40 p-3 grid gap-2 sm:grid-cols-2 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]">
        {sorted.map((entry) => {
          const name = entry.name;
          return (
          <label
            key={name}
            className={`flex cursor-pointer items-start gap-2 text-sm ${entry.isActive ? "text-[var(--totk-ivory)]" : "text-[var(--totk-grey-200)]"}`}
          >
            <input
              type="checkbox"
              className="mt-0.5 shrink-0 rounded border-[var(--totk-dark-ocher)]"
              checked={parseInteractiveTablerollTokens(tableroll).includes(name)}
              onChange={() =>
                onChangeTableroll(toggleTablerollPickerToken(tableroll, name, catalogNames))
              }
            />
            <span className="min-w-0 font-mono text-xs leading-snug break-all">
              <span className={entry.isActive ? "" : "opacity-90"}>{name}</span>
              {!entry.isActive && (
                <span className="ml-1 inline-block rounded border border-amber-600/50 bg-amber-900/25 px-1.5 py-0.5 text-[10px] font-sans font-medium uppercase tracking-wide text-amber-200/95">
                  Draft
                </span>
              )}
            </span>
          </label>
          );
        })}
      </div>
    </div>
  );
}

function questToForm(q: QuestRecord): FormState {
  const itemRewardsRaw = (q.itemRewards as Array<{ name: string; quantity: number }> | undefined) ?? [];
  const itemRewards: ItemRewardRow[] =
    Array.isArray(itemRewardsRaw) && itemRewardsRaw.length > 0
      ? itemRewardsRaw.map((i) => ({ name: i.name || "", quantity: typeof i.quantity === "number" ? i.quantity : 1 }))
      : q.itemReward
        ? [{ name: String(q.itemReward), quantity: q.itemRewardQty != null && !Number.isNaN(Number(q.itemRewardQty)) ? Number(q.itemRewardQty) : 1 }]
        : [];
  const locationStr = String(q.location ?? "").trim();
  const normalized = locationStr.toLowerCase().replace(/\s/g, "");
  const isAll = ["rudania", "inariko", "vhintl"].every((p) => normalized.includes(p)) || normalized === "all";
  const locationPreset = LOCATION_PRESETS.find((p) => p !== "ALL" && locationStr.toLowerCase().includes(p.toLowerCase()));
  const location = isAll ? "ALL" : (locationPreset ?? (locationStr ? "ALL" : ""));
  const locationOther = "";
  const timeStr = String(q.timeLimit ?? "1 month").trim();
  const timePreset = TIME_LIMIT_PRESETS.find((p) => timeStr.toLowerCase() === p.toLowerCase());
  const timeLimit = timePreset ?? (timeStr ? "Custom" : "1 month");
  const timeLimitCustom = timeLimit === "Custom" ? timeStr : "";
  const parsed = parseTokenReward(q.tokenReward);
  const qr = Array.isArray(q.tableRollNames)
    ? q.tableRollNames
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const legacyRoll = q.tableRollName ?? q.tableroll;
  const legacyStr = legacyRoll != null ? String(legacyRoll).trim() : "";
  const qt = String(q.questType ?? "RP");
  const tablerollForm = (() => {
    if (isInteractiveStyleQuestType(qt)) {
      return qr.length > 0 ? qr.join(", ") : legacyStr;
    }
    if (qt === "RP") {
      if (qr.length > 0) return qr.join("\n");
      const all = [...new Set(legacyStr.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean))];
      return all.join("\n");
    }
    return legacyStr.split(/[\n,]+/).map((s) => s.trim()).find(Boolean) ?? "";
  })();

  const rpCnt =
    (q as { rpThreadCount?: number }).rpThreadCount != null &&
    !Number.isNaN(Number((q as { rpThreadCount?: number }).rpThreadCount))
      ? Math.min(
          10,
          Math.max(1, Math.floor(Number((q as { rpThreadCount?: number }).rpThreadCount)))
        )
      : 1;
  const rpParentsForm = buildRpParentsForForm(q, rpCnt);

  return {
    title: String(q.title ?? ""),
    description: String(q.description ?? ""),
    rules: String(q.rules ?? ""),
    date: parseDateToYYYYMM(String(q.date ?? "")) || String(q.date ?? ""),
    questType: String(q.questType ?? "RP"),
    location,
    locationOther,
    timeLimit,
    timeLimitCustom,
    timeLimitEndDate: (() => {
      const raw = (q as { timeLimitEndDate?: string }).timeLimitEndDate;
      if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return "";
      return raw.trim();
    })(),
    signupDeadline: (() => {
      const s = String(q.signupDeadline ?? "").trim();
      if (!s) return "";
      try {
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      } catch { /* ignore */ }
      return s.slice(0, 10);
    })(),
    participantCap:
      q.participantCap != null && Number(q.participantCap) > 0 ? String(q.participantCap) : "",
    postRequirement: q.postRequirement != null ? String(q.postRequirement) : "",
    minRequirements:
      q.minRequirements != null && typeof q.minRequirements !== "object"
        ? String(q.minRequirements)
        : "",
    tableroll: tablerollForm,
    requiredRolls: q.requiredRolls != null ? String(q.requiredRolls) : "1",
    tokenFlat: parsed.tokenFlat,
    tokenPerUnit: parsed.tokenPerUnit,
    tokenUnit: parsed.tokenUnit,
    tokenMax: parsed.tokenMax,
    tokenCollabBonus: parsed.tokenCollabBonus,
    tokenRewardCustom: parsed.tokenRewardCustom,
    itemRewards,
    rpThreadParentChannel: rpParentsForm[0]?.trim() || String(q.rpThreadParentChannel ?? ""),
    rpThreadParentChannels: rpParentsForm,
    rpThreadCount: String(rpCnt),
    rpThreadId: (() => {
      const rawIds = (q as { rpThreadIds?: unknown }).rpThreadIds;
      const arr = Array.isArray(rawIds)
        ? rawIds.map((x) => String(x ?? "").trim()).filter(Boolean)
        : [];
      if (arr.length) return arr.join(", ");
      return String((q as { rpThreadId?: string }).rpThreadId ?? "").trim();
    })(),
    collabAllowed: Boolean(q.collabAllowed),
    collabRule: String(q.collabRule ?? ""),
    questID: String(q.questID ?? ""),
    status: String(q.status ?? "active"),
    posted: Boolean(q.posted),
    postedAt: (() => {
      if (!q.postedAt) return "";
      const d = new Date(q.postedAt);
      return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 16);
    })(),
    botNotes: String(q.botNotes ?? ""),
    artWritingMode: (q as { artWritingMode?: string }).artWritingMode === "either" ? "either" : "both",
  };
}

function buildTokenRewardFromForm(f: FormState): string {
  if (f.tokenRewardCustom.trim()) return f.tokenRewardCustom.trim();
  const parts: string[] = [];
  if (f.tokenFlat.trim()) parts.push(`flat:${f.tokenFlat.trim()}`);
  if (f.tokenPerUnit.trim()) {
    parts.push(`per_unit:${f.tokenPerUnit.trim()}`);
    const u = f.tokenUnit.trim();
    if (u) {
      if (u.includes(" ") || u.includes('"')) {
        parts.push(`unit:"${u.replace(/"/g, '\\"')}"`);
      } else {
        parts.push(`unit:${u}`);
      }
    }
    if (f.tokenMax.trim()) parts.push(`max:${f.tokenMax.trim()}`);
  }
  if (f.tokenCollabBonus.trim()) parts.push(`collab_bonus:${f.tokenCollabBonus.trim()}`);
  return parts.length ? parts.join(" ") : "N/A";
}

function formToBody(f: FormState, isEdit: boolean): Record<string, unknown> {
  const locationValue = f.location === "ALL" ? "Rudania, Inariko, Vhintl" : f.location ? String(f.location).trim() : "";
  const timeLimitValue = f.timeLimit === "Custom" ? f.timeLimitCustom.trim() : f.timeLimit;
  const tokenReward = buildTokenRewardFromForm(f);
  const dateForApi = /^\d{4}-\d{2}$/.test(f.date.trim()) ? yyyyMmToDisplay(f.date.trim()) : f.date.trim();
  const explicitEnd =
    f.timeLimitEndDate.trim() && /^\d{4}-\d{2}-\d{2}$/.test(f.timeLimitEndDate.trim())
      ? f.timeLimitEndDate.trim()
      : null;
  const resolvedEndDate = explicitEnd ?? computeDefaultTimeLimitEndDateYyyyMmDd(f);

  const rpN = Math.min(10, Math.max(1, parseInt(f.rpThreadCount, 10) || 1));
  const rpParentsBody = [...f.rpThreadParentChannels].slice(0, rpN);
  while (rpParentsBody.length < rpN) {
    rpParentsBody.push("");
  }

  const body: Record<string, unknown> = {
    title: f.title.trim(),
    description: f.description.trim(),
    rules: f.rules.trim() || null,
    date: dateForApi,
    questType: f.questType,
    location: locationValue,
    timeLimit: timeLimitValue,
    timeLimitEndDate: resolvedEndDate,
    signupDeadline: f.signupDeadline.trim() || null,
    status: f.status,
    tokenReward,
    rpThreadParentChannel:
      rpParentsBody[0]?.trim() || f.rpThreadParentChannel.trim() || null,
    rpThreadParentChannels: rpParentsBody,
    rpThreadCount: rpN,
    collabAllowed: f.collabAllowed,
    collabRule: f.collabRule.trim() || null,
    posted: f.posted,
    postedAt: (() => {
      if (!f.posted || !f.postedAt) return null;
      const d = new Date(f.postedAt);
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    })(),
    botNotes: f.botNotes.trim() || null,
    itemRewards: f.itemRewards.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), quantity: Math.max(0, r.quantity) || 1 })),
    requiredRolls: parseInt(f.requiredRolls, 10) || 1,
    artWritingMode: f.artWritingMode === "either" ? "either" : "both",
  };

  const manualRpThreadIds = parseManualRpThreadIds(f.rpThreadId);
  if (manualRpThreadIds.length > 0) {
    body.rpThreadIds = manualRpThreadIds;
    body.rpThreadId = manualRpThreadIds[0];
  }

  if (isInteractiveStyleQuestType(f.questType)) {
    const tabs = parseInteractiveTablerollTokens(f.tableroll);
    body.tableRollNames = tabs;
    body.tableRollName = tabs[0] ?? null;
    body.tableroll = tabs.length <= 1 ? tabs[0] ?? null : tabs.join(", ");
  } else if (f.questType === "RP") {
    const tabs = parseInteractiveTablerollTokens(f.tableroll);
    body.tableRollNames = tabs;
    body.tableRollName = tabs[0] ?? null;
    body.tableroll =
      tabs.length === 0 ? null : tabs.length === 1 ? tabs[0] ?? null : tabs.join(", ");
  } else {
    body.tableroll = f.tableroll.trim() || null;
    body.tableRollName =
      typeof body.tableroll === "string" && body.tableroll.trim() ? body.tableroll.trim() : null;
    body.tableRollNames = [];
  }

  if (isEdit && f.questID.trim()) body.questID = f.questID.trim();
  if (f.participantCap.trim() !== "") {
    const n = parseInt(f.participantCap, 10);
    if (!Number.isNaN(n) && n > 0) body.participantCap = n;
  }
  if (f.postRequirement.trim() !== "") {
    const n = parseInt(f.postRequirement, 10);
    if (!Number.isNaN(n)) body.postRequirement = n;
  }
  if (f.minRequirements.trim() !== "") {
    const n = parseInt(f.minRequirements, 10);
    body.minRequirements = Number.isNaN(n) ? f.minRequirements : n;
  }
  return body;
}

// Discord embed preview: matches bot quest post format (Details, Rewards, Participation, Rules, Join, Participants, Recent Activity)
const BORDER_IMAGE = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const EMBED_BG = "#2f3136";
const EMBED_BORDER = "#AA916A";
const EMBED_TEXT = "#dcddde";
const EMBED_LABEL = "#b9bbbe";

const VILLAGE_EMOJIS = {
  rudania: "<:rudania:899492917452890142>",
  inariko: "<:inariko:899493009073274920>",
  vhintl: "<:vhintl:899492879205007450>",
};

function formatLocationPreview(location: string): string {
  if (!location.trim()) return "Not specified";
  const l = location.toLowerCase();
  const parts: string[] = [];
  if (l.includes("rudania")) parts.push(`${VILLAGE_EMOJIS.rudania} Rudania`);
  if (l.includes("inariko")) parts.push(`${VILLAGE_EMOJIS.inariko} Inariko`);
  if (l.includes("vhintl")) parts.push(`${VILLAGE_EMOJIS.vhintl} Vhintl`);
  if (parts.length) return parts.join(", ");
  return location.trim();
}

/** Format token reward for human-readable embed display. Omit collab when collab not allowed and bonus is 0. */
function formatTokenRewardForDisplay(form: FormState): string | null {
  if (form.tokenRewardCustom.trim()) {
    const raw = form.tokenRewardCustom.trim();
    const flat = raw.match(/flat:(\d+)/i)?.[1];
    const perUnit = raw.match(/per_unit:(\d+)/i)?.[1];
    const unitQuotedMatch = raw.match(/\bunit:"((?:[^"\\]|\\.)*)"/i);
    const unitUnquotedMatch = !unitQuotedMatch ? raw.match(/\bunit:(\S+)/i) : null;
    const unit = unitQuotedMatch ? unitQuotedMatch[1].replace(/\\"/g, '"') : (unitUnquotedMatch ? unitUnquotedMatch[1] : null);
    const max = raw.match(/max:(\d+)/i)?.[1];
    const collab = raw.match(/collab_bonus:(\d+)/i)?.[1];
    const customParts: string[] = [];
    if (flat) customParts.push(`${flat} tokens base`);
    if (perUnit) customParts.push(max && unit ? `${perUnit} tokens per ${unit} (cap ${max})` : unit ? `${perUnit} tokens per ${unit}` : `${perUnit} tokens per unit`);
    const showCollab = collab && (form.collabAllowed || (collab !== "0" && collab !== ""));
    if (showCollab) customParts.push(`${collab} tokens collab bonus`);
    if (customParts.length) return customParts.join(" + ");
    return raw;
  }
  const tokenParts: string[] = [];
  if (form.tokenFlat.trim()) tokenParts.push(`${form.tokenFlat.trim()} tokens base`);
  if (form.tokenPerUnit.trim()) {
    const unit = form.tokenUnit.trim() || "unit";
    const cap = form.tokenMax.trim();
    tokenParts.push(cap ? `${form.tokenPerUnit.trim()} tokens per ${unit} (cap ${cap})` : `${form.tokenPerUnit.trim()} tokens per ${unit}`);
  }
  const showCollab = form.collabAllowed || (form.tokenCollabBonus.trim() !== "0" && form.tokenCollabBonus.trim() !== "");
  if (showCollab && form.tokenCollabBonus.trim()) tokenParts.push(`${form.tokenCollabBonus.trim()} tokens collab bonus`);
  if (tokenParts.length) return tokenParts.join(" + ");
  return null;
}

/** Fallback emojis when API/DB doesn't have them */
const KNOWN_ITEM_EMOJIS: Record<string, string> = {
  "spirit orb": "<:spiritorb:1171310851748270121>",
};

/** Renders text with Discord emoji codes as inline images */
function renderWithDiscordEmojis(text: string) {
  const parts: React.ReactNode[] = [];
  const regex = /<(a?):(\w+):(\d+)>/g;
  let lastIndex = 0;
  let m;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    parts.push(
      <img
        key={`${m.index}-${m[3]}`}
        src={`https://cdn.discordapp.com/emojis/${m[3]}.${m[1] ? "gif" : "png"}`}
        alt=""
        className="inline-block w-4 h-4 align-middle"
      />
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 1 ? <>{parts}</> : text;
}

function getItemEmoji(name: string, emojiMap?: Record<string, string>): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const fromMap = emojiMap?.[trimmed]?.trim() ?? emojiMap?.[trimmed.toLowerCase()]?.trim();
  if (fromMap) return fromMap;
  return KNOWN_ITEM_EMOJIS[trimmed.toLowerCase()] ?? "";
}

function buildRewardsPreview(form: FormState, emojiMap?: Record<string, string>): string {
  const parts: string[] = [];
  const tokenDisplay = formatTokenRewardForDisplay(form);
  if (tokenDisplay) {
    parts.push(tokenDisplay.includes("tokens") ? `💰 ${tokenDisplay}` : `💰 ${tokenDisplay} tokens`);
  }
  if (form.collabAllowed && form.collabRule?.trim()) {
    parts.push(`(${form.collabRule.trim()})`);
  }
  const items = form.itemRewards
    .filter((r) => r.name.trim())
    .map((r) => {
      const emoji = getItemEmoji(r.name, emojiMap);
      const prefix = emoji ? `${emoji} ` : "";
      return `${prefix}${r.name} x${r.quantity || 1}`;
    });
  if (items.length) parts.push(items.map((i) => `> ${i}`).join("\n"));
  return parts.length ? parts.join("\n") : "—";
}

function QuestEmbedPreview({ form }: { form: FormState }) {
  const [itemEmojiMap, setItemEmojiMap] = useState<Record<string, string>>({});
  const itemNames = form.itemRewards.filter((r) => r.name.trim()).map((r) => r.name);
  useEffect(() => {
    if (itemNames.length === 0) {
      setItemEmojiMap({});
      return;
    }
    fetch(`/api/models/items/emojis?names=${encodeURIComponent(itemNames.join(","))}`)
      .then((r) => r.json())
      .then((data: Record<string, string>) => setItemEmojiMap(data))
      .catch(() => setItemEmojiMap({}));
  }, [itemNames.join(",")]);

  const cap = form.participantCap.trim() ? parseInt(form.participantCap, 10) : null;
  const participantCount = 0;
  const participantStr =
    cap != null && !Number.isNaN(cap)
      ? `${participantCount}/${cap}${participantCount >= cap ? " - FULL" : ""}`
      : "0";
  const borderColor = EMBED_BORDER;

  const title = form.title.trim() || "Quest title";
  const description = form.description.trim() || "Quest description will appear here.";
  const postReq = form.postRequirement.trim() ? parseInt(form.postRequirement, 10) : 15;
  const postReqVal = Number.isNaN(postReq) ? 15 : postReq;
  const questId = form.questID.trim() || "Q000000";
  const effectiveLocation = form.location === "ALL" ? "Rudania, Inariko, Vhintl" : form.location;
  const effectiveTimeLimit = form.timeLimit === "Custom" ? form.timeLimitCustom : form.timeLimit;
  const locationPreview = formatLocationPreview(effectiveLocation);
  const rewardsPreview = buildRewardsPreview(form, itemEmojiMap);

  return (
    <div
      className="rounded overflow-hidden text-left shrink-0 w-full min-w-0"
      style={{
        backgroundColor: EMBED_BG,
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      <div className="p-3 space-y-3">
        <div className="font-semibold text-base" style={{ color: EMBED_TEXT }}>
          {title}
        </div>
        <div className="text-sm whitespace-pre-wrap break-words border-l-2 border-[var(--totk-mid-ocher)]/60 pl-3 italic" style={{ color: EMBED_TEXT }}>
          {description.length > 400 ? description.slice(0, 397) + "..." : description}
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">📋 Details</span>
          <div style={{ color: EMBED_TEXT }} className="mt-1 space-y-0.5">
            <div><span className="font-semibold">Type:</span> {form.questType || "—"}</div>
            <div><span className="font-semibold">ID:</span> <code className="bg-black/30 px-1 rounded">{questId}</code></div>
            <div><span className="font-semibold">Location:</span> {locationPreview}</div>
            <div>
              <span className="font-semibold">Duration:</span>{" "}
              {form.timeLimitEndDate.trim() && /^\d{4}-\d{2}-\d{2}$/.test(form.timeLimitEndDate.trim())
                ? `${effectiveTimeLimit.trim() || "—"} | Ends ${formatEndDateFromYyyyMmDd(form.timeLimitEndDate.trim())} (US Eastern)`
                : form.date && effectiveTimeLimit && effectiveTimeLimit !== "Custom"
                  ? (() => {
                      const end = getEndDateFromDuration(form.date, effectiveTimeLimit);
                      return end ? `${effectiveTimeLimit} | Ends ${formatEndDateWithTime(end)}` : effectiveTimeLimit;
                    })()
                  : (effectiveTimeLimit.trim() || "—")}
            </div>
            <div><span className="font-semibold">Date:</span> {form.date ? (yyyyMmToDisplay(form.date) || form.date) : "—"}</div>
            {form.signupDeadline.trim() && (() => {
              const d = new Date(form.signupDeadline.trim());
              const label = Number.isNaN(d.getTime()) ? form.signupDeadline.trim() : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
              return <div><span className="font-semibold">Signup deadline:</span> {label}</div>;
            })()}
          </div>
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">🏆 Rewards</span>
          <div style={{ color: EMBED_TEXT }} className="mt-1 whitespace-pre-wrap [&_img]:mx-0.5">
            {rewardsPreview.split("\n").map((line, i) =>
              line.startsWith("> ") ? (
                <div key={i} className="border-l-2 border-[var(--totk-mid-ocher)]/60 pl-3 my-0.5 italic">
                  {renderWithDiscordEmojis(line.slice(2))}
                </div>
              ) : (
                <div key={i}>{renderWithDiscordEmojis(line)}</div>
              )
            )}
          </div>
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">🗓️ Participation</span>
          <div style={{ color: EMBED_TEXT }} className="mt-1 space-y-0.5">
            {cap != null && !Number.isNaN(cap) && (
              <div>👥 Participation cap: {cap}</div>
            )}
            {form.minRequirements.trim() && form.minRequirements.trim() !== "0" ? (
              <div className="mt-0.5">
                <span>📝 Participation Requirement: </span>
                <span className="whitespace-pre-line">{form.minRequirements.trim()}</span>
              </div>
            ) : null}
            {isRpStyleQuestType(form.questType) && (
              <div>📝 Post requirement: {postReqVal}</div>
            )}
            {form.tableroll.trim() && (
              <div>
                🎲 Table roll{parseInteractiveTablerollTokens(form.tableroll).length > 1 ? "s" : ""}:{" "}
                <span className="font-medium">{form.tableroll.trim()}</span>
              </div>
            )}
            {!cap && (!form.minRequirements.trim() || form.minRequirements.trim() === "0") && !isRpStyleQuestType(form.questType) && !form.tableroll.trim() && <div>—</div>}
          </div>
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">📋 Rules</span>
          <div style={{ color: EMBED_TEXT }} className="mt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_p]:my-0.5">
            {form.rules.trim() ? <ReactMarkdown>{form.rules.trim()}</ReactMarkdown> : "—"}
          </div>
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">🎯 Join This Quest</span>
          <div style={{ color: EMBED_TEXT }} className="mt-1 font-mono text-xs">
            /quest join questid:{questId}
          </div>
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">👥 Participants ({participantStr})</span>
          <div style={{ color: EMBED_TEXT }} className="mt-0.5">
            None
          </div>
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">📊 Recent Activity</span>
          <div style={{ color: EMBED_TEXT }} className="mt-0.5">
            —
          </div>
        </div>
      </div>

      <div className="w-full overflow-hidden">
        <img
          src={BORDER_IMAGE}
          alt=""
          className="w-full h-auto object-cover block"
        />
      </div>
      <div className="px-3 py-1.5 text-[10px]" style={{ color: EMBED_LABEL }}>
        Today at {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
      </div>
    </div>
  );
}

export default function AdminQuestsPage() {
  const { user, isAdmin, loading: sessionLoading } = useSession();
  const [quests, setQuests] = useState<QuestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<QuestTab>("create");
  const formSectionRef = useRef<HTMLElement | null>(null);
  const [manageQuestId, setManageQuestId] = useState<string | null>(null);
  const [manageQuest, setManageQuest] = useState<QuestRecord | null>(null);
  const [manageParticipantsSaving, setManageParticipantsSaving] = useState(false);
  const [syncRewardProgressLoading, setSyncRewardProgressLoading] = useState(false);
  const [manageParticipantsError, setManageParticipantsError] = useState<string | null>(null);
  const [manageParticipantsSuccess, setManageParticipantsSuccess] = useState<string | null>(null);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [participantProgressSavingId, setParticipantProgressSavingId] = useState<string | null>(null);
  const [completingQuestId, setCompletingQuestId] = useState<string | null>(null);
  const [completeConfirmQuestId, setCompleteConfirmQuestId] = useState<string | null>(null);
  const [viewQuestId, setViewQuestId] = useState<string | null>(null);
  const [viewQuest, setViewQuest] = useState<QuestRecord | null>(null);
  const [deleteConfirmQuestId, setDeleteConfirmQuestId] = useState<string | null>(null);
  const [deletingQuestId, setDeletingQuestId] = useState<string | null>(null);
  const [deleteFromListId, setDeleteFromListId] = useState<string | null>(null);
  const [previewPosting, setPreviewPosting] = useState(false);
  const [viewPreviewPosting, setViewPreviewPosting] = useState(false);
  const [tablerollCatalog, setTablerollCatalog] = useState<TablerollCatalogEntry[]>([]);
  const [sortDateOrder, setSortDateOrder] = useState<"newest" | "oldest">("newest");
  const [manageModalMounted, setManageModalMounted] = useState(false);
  useEffect(() => {
    setManageModalMounted(true);
  }, []);

  const sortedQuests = useMemo(() => {
    const key = (q: QuestRecord) => getQuestSortKey(q) + (q.createdAt ?? "");
    return [...quests].sort((a, b) => {
      const cmp = key(a).localeCompare(key(b));
      return sortDateOrder === "newest" ? -cmp : cmp;
    });
  }, [quests, sortDateOrder]);

  useEffect(() => {
    fetch("/api/models/tablerolls", { credentials: "include" })
      .then((r) => r.json())
      .then((data: unknown) => {
        if (!Array.isArray(data)) {
          setTablerollCatalog([]);
          return;
        }
        const normalized: TablerollCatalogEntry[] = [];
        for (const row of data) {
          if (
            row &&
            typeof row === "object" &&
            "name" in row &&
            typeof (row as { name: unknown }).name === "string"
          ) {
            const rec = row as { name: string; isActive?: unknown };
            normalized.push({
              name: rec.name.trim(),
              isActive: rec.isActive !== false,
            });
          } else if (typeof row === "string" && row.trim()) {
            normalized.push({ name: row.trim(), isActive: true });
          }
        }
        setTablerollCatalog(normalized.filter((e) => e.name.length > 0));
      })
      .catch(() => setTablerollCatalog([]));
  }, []);

  const handlePostPreview = useCallback(async () => {
    if (!form.title.trim()) {
      setError("Title is required for preview");
      return;
    }
    setPreviewPosting(true);
    setError(null);
    setSuccess(null);
    try {
      const body = formToBody(form, !!editingId);
      const res = await fetch("/api/admin/quests/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? data.error ?? "Failed to post preview");
      }
      setSuccess("Preview posted to Discord channel.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewPosting(false);
    }
  }, [form, editingId]);

  const handleViewPreviewPost = useCallback(async () => {
    if (!viewQuest?.title?.trim()) return;
    setViewPreviewPosting(true);
    setError(null);
    setSuccess(null);
    try {
      const body = viewQuestToPreviewBody(viewQuest);
      const res = await fetch("/api/admin/quests/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        throw new Error((data as { message?: string }).message ?? data.error ?? "Failed to post preview");
      }
      setSuccess("Preview posted to Discord channel.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setViewPreviewPosting(false);
    }
  }, [viewQuest]);

  const fetchQuests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/quests");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? "Failed to load quests");
      }
      const data = (await res.json()) as { quests: QuestRecord[] };
      setQuests(data.quests ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setQuests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin && !sessionLoading) fetchQuests();
  }, [isAdmin, sessionLoading, fetchQuests]);

  const loadQuestForEdit = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/quests/${id}`);
      if (!res.ok) throw new Error("Failed to load quest");
      const q = (await res.json()) as QuestRecord;
      setForm(questToForm(q));
      setEditingId(id);
      setActiveTab("create");
      formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const openManageModal = useCallback(async (id: string) => {
    setManageQuestId(id);
    setManageQuest(null);
    setManageParticipantsError(null);
    setManageParticipantsSuccess(null);
    setSelectedParticipantIds([]);
    setParticipantProgressSavingId(null);
    try {
      const res = await fetch(`/api/admin/quests/${id}`);
      if (!res.ok) throw new Error("Failed to load quest");
      const q = (await res.json()) as QuestRecord;
      setManageQuest(q);
    } catch (e) {
      setManageParticipantsError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const closeManageModal = useCallback(() => {
    setManageQuestId(null);
    setManageQuest(null);
    setManageParticipantsError(null);
    setManageParticipantsSuccess(null);
    setSelectedParticipantIds([]);
    setSyncRewardProgressLoading(false);
    setParticipantProgressSavingId(null);
  }, []);

  const openViewModal = useCallback(async (id: string) => {
    setViewQuestId(id);
    setViewQuest(null);
    try {
      const res = await fetch(`/api/admin/quests/${id}`);
      if (!res.ok) throw new Error("Failed to load quest");
      const q = (await res.json()) as QuestRecord;
      setViewQuest(q);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setViewQuestId(null);
    }
  }, []);

  const closeViewModal = useCallback(() => {
    setViewQuestId(null);
    setViewQuest(null);
    setDeleteConfirmQuestId(null);
  }, []);

  const confirmDeleteQuest = useCallback(
    async (questId: string) => {
      setDeletingQuestId(questId);
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch(`/api/admin/quests/${questId}`, { method: "DELETE" });
        const data = (await res.json()) as { ok?: boolean; deleted?: string; error?: string; message?: string };
        if (!res.ok) {
          throw new Error(data.message ?? data.error ?? "Failed to delete quest");
        }
        setDeleteConfirmQuestId(null);
        setDeleteFromListId(null);
        closeViewModal();
        setSuccess(data.deleted ? `Quest ${data.deleted} deleted.` : "Quest deleted.");
        await fetchQuests();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDeletingQuestId(null);
      }
    },
    [closeViewModal, fetchQuests]
  );

  const confirmDeleteQuestFromList = useCallback(
    async (questId: string) => {
      setDeletingQuestId(questId);
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch(`/api/admin/quests/${questId}`, { method: "DELETE" });
        const data = (await res.json()) as { ok?: boolean; deleted?: string; error?: string; message?: string };
        if (!res.ok) {
          throw new Error(data.message ?? data.error ?? "Failed to delete quest");
        }
        setDeleteFromListId(null);
        setSuccess(data.deleted ? `Quest ${data.deleted} deleted.` : "Quest deleted.");
        await fetchQuests();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setDeletingQuestId(null);
      }
    },
    [fetchQuests]
  );

  const toggleParticipantSelected = useCallback((userId: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
    setSuccess(null);
  }, []);

  const confirmCompleteQuest = useCallback(
    async (questId: string) => {
      setCompletingQuestId(questId);
      setError(null);
      setSuccess(null);
      try {
        const res = await fetch(`/api/admin/quests/${questId}/complete`, { method: "POST" });
        const data = (await res.json()) as { rewarded?: number; error?: string; message?: string };
        if (!res.ok) {
          throw new Error(data.message ?? data.error ?? "Failed to complete quest");
        }
        setCompleteConfirmQuestId(null);
        setSuccess(
          data.rewarded != null && data.rewarded > 0
            ? `Quest marked completed. ${data.rewarded} participant(s) rewarded.`
            : "Quest marked as completed."
        );
        await fetchQuests();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setCompletingQuestId(null);
      }
    },
    [fetchQuests]
  );

  const saveManageParticipants = useCallback(async () => {
    if (!manageQuestId || selectedParticipantIds.length === 0) return;
    setManageParticipantsSaving(true);
    setManageParticipantsError(null);
    setManageParticipantsSuccess(null);
    try {
      const res = await fetch(`/api/admin/quests/${manageQuestId}/participants`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedParticipantIds }),
      });
      const data = (await res.json()) as { updated?: number; rewarded?: string[]; error?: string; message?: string };
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? "Failed to update participants");
      }
      setManageParticipantsSuccess(
        data.updated ? `Marked ${data.updated} participant(s) as completed and rewarded.` : "Saved."
      );
      setSelectedParticipantIds([]);
      const refetchRes = await fetch(`/api/admin/quests/${manageQuestId}`);
      if (refetchRes.ok) {
        const q = (await refetchRes.json()) as QuestRecord;
        setManageQuest(q);
      }
      await fetchQuests();
    } catch (e) {
      setManageParticipantsError(e instanceof Error ? e.message : String(e));
    } finally {
      setManageParticipantsSaving(false);
    }
  }, [manageQuestId, selectedParticipantIds, fetchQuests]);

  const updateParticipantProgress = useCallback(
    async (userId: string, progress: string) => {
      if (!manageQuestId) return;
      setParticipantProgressSavingId(userId);
      setManageParticipantsError(null);
      setManageParticipantsSuccess(null);
      try {
        const res = await fetch(`/api/admin/quests/${manageQuestId}/participants`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, progress }),
        });
        const data = (await res.json()) as { error?: string; message?: string };
        if (!res.ok) {
          throw new Error(data.message ?? data.error ?? "Failed to update status");
        }
        setManageParticipantsSuccess("Participant status saved.");
        const refetchRes = await fetch(`/api/admin/quests/${manageQuestId}`);
        if (refetchRes.ok) {
          const q = (await refetchRes.json()) as QuestRecord;
          setManageQuest(q);
        }
        await fetchQuests();
      } catch (e) {
        setManageParticipantsError(e instanceof Error ? e.message : String(e));
      } finally {
        setParticipantProgressSavingId(null);
      }
    },
    [manageQuestId, fetchQuests]
  );

  const syncRewardProgressFromQuest = useCallback(async () => {
    if (!manageQuestId) return;
    setSyncRewardProgressLoading(true);
    setManageParticipantsError(null);
    setManageParticipantsSuccess(null);
    try {
      const res = await fetch(`/api/admin/quests/${manageQuestId}/sync-reward-progress`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        fixed?: number;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? "Failed to sync reward progress");
      }
      const fixed = data.fixed ?? 0;
      setManageParticipantsSuccess(
        fixed > 0
          ? `Updated ${fixed} participant row(s) to rewarded (tokens were already on the quest; no new payout).`
          : "Nothing to sync: no participants had completed status with tokens already recorded."
      );
      const refetchRes = await fetch(`/api/admin/quests/${manageQuestId}`);
      if (refetchRes.ok) {
        const q = (await refetchRes.json()) as QuestRecord;
        setManageQuest(q);
      }
      await fetchQuests();
    } catch (e) {
      setManageParticipantsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncRewardProgressLoading(false);
    }
  }, [manageQuestId, fetchQuests]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const effectiveLocation = form.location === "ALL" ? "Rudania, Inariko, Vhintl" : form.location;
      const effectiveTimeLimit = form.timeLimit === "Custom" ? form.timeLimitCustom.trim() : form.timeLimit;
      if (!form.title.trim() || !form.description.trim() || !form.date.trim() || !effectiveLocation || !effectiveTimeLimit) {
        setError("Title, description, date, location, and time limit are required.");
        return;
      }
      if (editingId && !form.questID.trim()) {
        setError("Quest ID is required when editing.");
        return;
      }
      if (editingId) {
        const hasExplicitEnd =
          form.timeLimitEndDate.trim() && /^\d{4}-\d{2}-\d{2}$/.test(form.timeLimitEndDate.trim());
        const hasComputedEnd = computeDefaultTimeLimitEndDateYyyyMmDd(form) != null;
        if (!hasExplicitEnd && !hasComputedEnd) {
          setError(
            "End date is required when editing a quest (set the date field, or pick a month-based duration so an end date can be derived)."
          );
          return;
        }
      }
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      try {
        const body = formToBody(form, !!editingId);
        if (editingId) {
          const res = await fetch(`/api/admin/quests/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as { message?: string }).message ?? "Failed to update quest");
          }
          setSuccess("Quest updated.");
          setForm(emptyForm);
          setEditingId(null);
          setActiveTab("list");
          setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
        } else {
          const res = await fetch("/api/admin/quests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = (await res.json()) as { questID?: string; message?: string };
          if (!res.ok) {
            throw new Error(data.message ?? "Failed to create quest");
          }
          setSuccess(data.questID ? `Quest created. ID: ${data.questID}` : "Quest created.");
          setForm(emptyForm);
        }
        await fetchQuests();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSubmitting(false);
      }
    },
    [form, editingId, fetchQuests]
  );

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const syncRpParentsCount = useCallback((nextCountNum: number) => {
    const n = Math.min(10, Math.max(1, nextCountNum));
    setForm((prev) => {
      let channels = [...prev.rpThreadParentChannels];
      if (channels.length === 0) {
        channels = [prev.rpThreadParentChannel || ""];
      }
      if (n > channels.length) {
        const pad =
          (channels[channels.length - 1] ?? "").trim() ||
          (channels[0] ?? "").trim() ||
          prev.rpThreadParentChannel ||
          "";
        while (channels.length < n) channels.push(pad || "");
      } else {
        channels = channels.slice(0, n);
      }
      const prim = (channels[0] || prev.rpThreadParentChannel || "").trim();
      return {
        ...prev,
        rpThreadCount: String(n),
        rpThreadParentChannels: channels,
        rpThreadParentChannel: prim,
      };
    });
  }, []);

  const setRpThreadParentAt = useCallback((index: number, value: string) => {
    setForm((prev) => {
      const n = Math.min(10, Math.max(1, parseInt(prev.rpThreadCount, 10) || 1));
      const next = [...prev.rpThreadParentChannels];
      while (next.length < n) next.push(prev.rpThreadParentChannel || next[0] || "");
      next[index] = value;
      return {
        ...prev,
        rpThreadParentChannels: next.slice(0, n),
        ...(index === 0 ? { rpThreadParentChannel: value } : {}),
      };
    });
  }, []);

  const rpThreadSlotCount = Math.min(10, Math.max(1, parseInt(form.rpThreadCount, 10) || 1));

  const addItemReward = useCallback(() => {
    setForm((prev) => ({ ...prev, itemRewards: [...prev.itemRewards, { name: "", quantity: 1 }] }));
  }, []);
  const removeItemReward = useCallback((index: number) => {
    setForm((prev) => ({
      ...prev,
      itemRewards: prev.itemRewards.filter((_, i) => i !== index),
    }));
  }, []);
  const updateItemReward = useCallback((index: number, field: "name" | "quantity", value: string | number) => {
    setForm((prev) => {
      const next = [...prev.itemRewards];
      if (!next[index]) return prev;
      next[index] = { ...next[index], [field]: value };
      return { ...prev, itemRewards: next };
    });
  }, []);

  if (sessionLoading || (isAdmin && loading && quests.length === 0 && !error)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--totk-light-green)]/10">
        <Loading message="Loading..." variant="inline" size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen p-4 sm:p-6 md:p-8 flex items-center justify-center bg-[var(--botw-warm-black)]">
        <div className="mx-auto max-w-md w-full text-center px-4">
          <p className="text-[var(--botw-pale)] mb-4">Please log in to access this page.</p>
          <a
            href="/api/auth/discord"
            className="inline-block rounded-md bg-[#5865F2] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#4752C4]"
          >
            Login with Discord
          </a>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen p-4 sm:p-6 md:p-8 flex items-center justify-center bg-[var(--botw-warm-black)]">
        <div className="mx-auto max-w-md w-full text-center px-4">
          <div className="mb-6 flex items-center justify-center gap-2 sm:gap-4">
            <img src="/Side=Left.svg" alt="" className="h-5 w-auto sm:h-6" />
            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--totk-light-ocher)] uppercase">
              Access Denied
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-5 w-auto sm:h-6 md:h-8" />
          </div>
          <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-6 sm:p-8 shadow-2xl">
            <p className="text-sm sm:text-base text-[var(--botw-pale)] mb-4 sm:mb-6">
              You must be an admin to access the quests editor.
            </p>
            <a
              href="/"
              className="inline-block rounded-md bg-[var(--totk-mid-ocher)] px-5 py-2.5 text-sm font-bold text-[var(--totk-ivory)] transition-colors hover:bg-[var(--totk-dark-ocher)]"
            >
              Return Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8 bg-[var(--totk-light-green)]/10">
      <div className="mx-auto max-w-[90rem]">
        {/* Header Section — match admin database */}
        <div className="mb-8">
          <div className="flex flex-col items-center justify-center gap-4 mb-6">
            <div className="flex items-center gap-4 sm:gap-6">
              <img src="/Side=Left.svg" alt="" className="h-6 sm:h-8 w-auto opacity-80" />
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-[var(--totk-light-ocher)] tracking-tighter uppercase italic">
                Quests
              </h1>
              <img src="/Side=Right.svg" alt="" className="h-6 sm:h-8 w-auto opacity-80" />
            </div>
            <p className="text-sm sm:text-base text-[var(--totk-grey-200)] text-center">
              Create and edit listed quests (RP, Art, Writing, Interactive)
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border-2 border-red-500/60 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 rounded-lg border-2 border-[var(--totk-light-green)]/60 bg-[var(--totk-light-green)]/10 px-4 py-3 text-sm text-[var(--totk-light-green)]">
            {success}
          </div>
        )}

        <div className="mb-6">
          <Tabs<QuestTab>
            tabs={QUEST_TABS}
            activeTab={activeTab}
            onTabChange={(tab) => setActiveTab(tab)}
          />
        </div>

        {activeTab === "create" && (
          <>
            {/* Create new quest / Edit quest: form + Discord embed preview side by side */}
            <section
              ref={formSectionRef}
              className="mb-8 rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] p-5 sm:p-6 shadow-lg"
            >
              <h2 className="mb-2 text-xl font-semibold text-[var(--totk-ivory)]">
                {editingId ? "Edit existing quest" : "Create new quest"}
              </h2>
              {editingId && (
                <p className="mb-4 text-sm text-[var(--totk-grey-200)]">
                  Editing: <span className="font-medium text-[var(--botw-pale)]">{form.title || "—"}</span> (
                  <span className="font-mono text-[var(--totk-ivory)]">{form.questID || "—"}</span>)
                </p>
              )}
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={editingId ? cancelEdit : () => { setForm(emptyForm); setError(null); setSuccess(null); }}
                  className="text-sm text-[var(--totk-light-green)] hover:underline"
                >
                  {editingId ? "Cancel and start new quest" : "Clear form"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                    Quest details
                  </p>
                  <form onSubmit={handleSubmit} className="admin-quests-form space-y-6 min-w-0">
                    {/* Basics */}
                    <fieldset className="rounded-lg border border-[var(--totk-dark-ocher)]/55 bg-[var(--totk-dark-ocher)]/[0.22] p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)] space-y-3">
                      <legend className="text-sm font-semibold text-[var(--totk-ivory)] px-1">Basics</legend>
                      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Title *</label>
                          <input type="text" value={form.title} onChange={(e) => setField("title", e.target.value)} className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" required />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Description *</label>
                          <textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={4} className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" required />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Month & Year *</label>
                          <input type="month" value={form.date} onChange={(e) => setField("date", e.target.value)} className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" required />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Quest Type *</label>
                          <select
                            value={form.questType}
                            onChange={(e) => {
                              const newType = e.target.value;
                              setField("questType", newType);
                              if ((newType === "RP" || newType === "Interactive / RP") && !form.rules.trim()) setField("rules", DEFAULT_RP_RULES);
                              if (newType !== "RP" && newType !== "Interactive / RP") setField("rules", "");
                            }}
                            className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] pl-3 pr-8 py-2 text-[var(--totk-ivory)]"
                          >
                            {QUEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Location *</label>
                          <select value={form.location} onChange={(e) => setField("location", e.target.value)} className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] pl-3 pr-8 py-2 text-[var(--totk-ivory)]">
                            <option value="">—</option>
                            {LOCATION_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Duration *</label>
                          <select value={form.timeLimit} onChange={(e) => setField("timeLimit", e.target.value)} className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] pl-3 pr-8 py-2 text-[var(--totk-ivory)]">
                            {TIME_LIMIT_PRESETS.map((p) => <option key={p} value={p}>{p}</option>)}
                            <option value="Custom">Custom</option>
                          </select>
                          {form.timeLimit === "Custom" && (
                            <input type="text" value={form.timeLimitCustom} onChange={(e) => setField("timeLimitCustom", e.target.value)} placeholder="e.g. 3 weeks" className="mt-2 w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                          )}
                          <details className="mt-2 rounded-md border border-[var(--totk-mid-ocher)]/45 bg-[var(--botw-warm-black)]/55 px-2.5 py-1.5 text-[11px] leading-snug text-[var(--totk-grey-200)] shadow-sm">
                            <summary className="cursor-pointer select-none font-medium text-[var(--totk-ivory)] hover:text-[var(--totk-mid-ocher)]">
                              Run length, US Eastern &amp; failures
                            </summary>
                            <p className="mt-2 border-t border-[var(--totk-dark-ocher)]/25 pt-2">
                              With <strong className="text-[var(--totk-ivory)]">Month &amp; Year</strong>, this sets how long the quest period runs. End-of-run times use{" "}
                              <strong className="text-[var(--totk-ivory)]">US Eastern</strong>. After the run closes, players who haven&apos;t finished may be marked{" "}
                              <code className="rounded bg-[var(--botw-black)]/80 px-1 font-mono text-[10px] text-[var(--totk-ivory)]">failed</code>.
                            </p>
                          </details>
                          <div className="mt-3">
                            <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">
                              End date {editingId ? "(required)" : "(optional)"}
                            </label>
                            <input
                              type="date"
                              value={form.timeLimitEndDate}
                              onChange={(e) => setField("timeLimitEndDate", e.target.value)}
                              required={!!editingId}
                              className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)] quest-date-input"
                            />
                            <p className="mt-1 text-[11px] leading-snug text-[var(--totk-grey-200)]">
                              {editingId ? "Ends" : "If set: ends"}{" "}
                              <strong className="text-[var(--totk-ivory)]">11:59 PM US Eastern</strong> that day and overrides duration-based auto-completion.
                            </p>
                          </div>
                          {form.timeLimitEndDate.trim() && /^\d{4}-\d{2}-\d{2}$/.test(form.timeLimitEndDate.trim()) && (
                            <p className="mt-1.5 text-[11px] text-[var(--totk-mid-ocher)]">
                              Effective end: {formatEndDateFromYyyyMmDd(form.timeLimitEndDate.trim())} US Eastern
                            </p>
                          )}
                          {form.date && form.timeLimit !== "Custom" && !form.timeLimitEndDate.trim() && (() => {
                            const endDate = getEndDateFromDuration(form.date, form.timeLimit);
                            if (!endDate) return null;
                            return (
                              <p className="mt-1.5 text-[11px] leading-snug text-[var(--totk-grey-200)]">
                                {form.timeLimit} · Est. ends {formatEndDate(endDate)} — use End date above for an exact day.
                              </p>
                            );
                          })()}
                        </div>
                      </div>
                    </fieldset>

                    {/* Details */}
                    <fieldset className="rounded-lg border border-[var(--totk-light-green)]/40 bg-[var(--totk-light-green)]/[0.09] p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)] space-y-3">
                      <legend className="text-sm font-semibold text-[var(--totk-ivory)] px-1">Details</legend>
                      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Signup Deadline</label>
                          <input type="date" value={form.signupDeadline} onChange={(e) => setField("signupDeadline", e.target.value)} className="quest-date-input w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                          <p className="mt-1 text-[11px] leading-snug text-[var(--totk-grey-200)]">
                            Last day for <code className="rounded bg-[var(--botw-black)]/70 px-1 font-mono text-[10px]">/quest join</code> — not duration or run end.
                          </p>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Status</label>
                          <select value={form.status} onChange={(e) => setField("status", e.target.value)} className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] pl-3 pr-8 py-2 text-[var(--totk-ivory)]">
                            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <p className="mt-1 text-[11px] leading-snug text-[var(--totk-grey-200)]">
                            This quest&apos;s lifecycle — not per-character rows (<strong className="text-[var(--totk-ivory)]/90">Manage participants</strong>).
                          </p>
                        </div>
                        <details className="sm:col-span-2 rounded-md border border-[var(--totk-light-green)]/35 bg-[var(--botw-black)]/40 px-2.5 py-1.5 text-[11px] leading-snug text-[var(--totk-grey-200)] shadow-sm">
                          <summary className="cursor-pointer select-none font-medium text-[var(--totk-ivory)] hover:text-[var(--totk-mid-ocher)]">
                            What Draft / Pending / Active / Complete mean
                          </summary>
                          <ul className="mt-2 space-y-1 border-t border-[var(--totk-dark-ocher)]/25 pt-2">
                            <li>
                              <span className="text-[var(--totk-ivory)]">Draft</span> — Not published yet; safe to edit before players see it.
                            </li>
                            <li>
                              <span className="text-[var(--totk-ivory)]">Pending</span> — Waiting to go live or scheduled; not an active run yet.
                            </li>
                            <li>
                              <span className="text-[var(--totk-ivory)]">Active</span> — Open; participants can sign up and progress.
                            </li>
                            <li>
                              <span className="text-[var(--totk-ivory)]">Complete</span> — Run closed on the dashboard; some participant rows may still be finishing rewards.
                            </li>
                          </ul>
                        </details>
                        {editingId && form.questID && (
                          <p className="text-sm text-[var(--totk-grey-200)] sm:col-span-2">Quest ID: <span className="font-mono text-[var(--totk-ivory)]">{form.questID}</span></p>
                        )}
                      </div>
                    </fieldset>

                    {/* Rewards */}
                    <fieldset className="rounded-lg border border-[var(--totk-mid-ocher)]/50 bg-[var(--totk-mid-ocher)]/[0.14] p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.22)] space-y-4">
                      <legend className="text-sm font-semibold text-[var(--totk-ivory)] px-1">Rewards (all optional)</legend>
                      <p className="text-xs text-[var(--totk-grey-200)] mb-2">Fill in only what this quest uses. Most quests just need &quot;Base tokens&quot; (and maybe &quot;Collab bonus&quot; if collabs are allowed).</p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Base tokens</label>
                          <p className="mb-1 text-xs text-[var(--totk-grey-200)]">Fixed amount each participant gets when they complete the quest.</p>
                          <input type="number" min={0} value={form.tokenFlat} onChange={(e) => setField("tokenFlat", e.target.value)} placeholder="e.g. 300" className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Tokens per &quot;unit&quot;</label>
                          <p className="mb-1 text-xs text-[var(--totk-grey-200)]">Only if reward scales (e.g. X tokens per submission). Use with &quot;Unit name&quot; and &quot;Max units&quot; below.</p>
                          <input type="number" min={0} value={form.tokenPerUnit} onChange={(e) => setField("tokenPerUnit", e.target.value)} placeholder="e.g. 222" className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Unit name</label>
                          <p className="mb-1 text-xs text-[var(--totk-grey-200)]">What one &quot;unit&quot; is (e.g. submission, post). Used with &quot;Tokens per unit&quot;.</p>
                          <input type="text" value={form.tokenUnit} onChange={(e) => setField("tokenUnit", e.target.value)} placeholder="e.g. submission" className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Max units (cap)</label>
                          <p className="mb-1 text-xs text-[var(--totk-grey-200)]">Max number of units that count toward tokens (e.g. cap at 3 submissions).</p>
                          <input type="number" min={0} value={form.tokenMax} onChange={(e) => setField("tokenMax", e.target.value)} placeholder="e.g. 3" className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Collab bonus (tokens)</label>
                          <p className="mb-1 text-xs text-[var(--totk-grey-200)]">Extra tokens when the entry is a collab. Only use if &quot;Collab allowed&quot; is on in Rules.</p>
                          <input type="number" min={0} value={form.tokenCollabBonus} onChange={(e) => setField("tokenCollabBonus", e.target.value)} placeholder="e.g. 200" className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Custom token string (advanced)</label>
                          <p className="mb-1 text-xs text-[var(--totk-grey-200)]">Leave empty unless you need a special format. Otherwise use the fields above.</p>
                          <input type="text" value={form.tokenRewardCustom} onChange={(e) => setField("tokenRewardCustom", e.target.value)} placeholder="e.g. flat:300 collab_bonus:200" className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Item rewards</label>
                          <div className="space-y-2">
                            {form.itemRewards.map((row, i) => (
                              <div key={i} className="flex gap-2 items-center">
                                <ItemNameAutocomplete
                                  value={row.name}
                                  onChange={(name) => updateItemReward(i, "name", name)}
                                  placeholder="Type to search items..."
                                  className="flex-1 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]"
                                />
                                <input type="number" min={0} value={row.quantity} onChange={(e) => updateItemReward(i, "quantity", parseInt(e.target.value, 10) || 0)} className="w-20 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                                <button type="button" onClick={() => removeItemReward(i)} className="rounded border border-red-500/50 px-2 py-1 text-sm text-red-400 hover:bg-red-500/20">Remove</button>
                              </div>
                            ))}
                            <button type="button" onClick={addItemReward} className="rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-1.5 text-sm text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/30">Add item</button>
                          </div>
                        </div>
                      </div>
                    </fieldset>

                    {/* Participation */}
                    <fieldset className="rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--totk-light-green)]/[0.06] p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.18)] space-y-4">
                      <legend className="text-sm font-semibold text-[var(--totk-ivory)] px-1">Participation</legend>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Participation cap (optional)</label>
                          <input
                            type="number"
                            inputMode="numeric"
                            step={1}
                            value={form.participantCap}
                            onChange={(e) => setField("participantCap", e.target.value)}
                            placeholder="Leave empty for no limit"
                            className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)] [color-scheme:dark]"
                          />
                          <p className="mt-1 text-xs text-[var(--totk-grey-200)]">Leave blank to allow unlimited participants. Only set a number if you want a hard cap (minimum 1).</p>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Participation Requirement</label>
                          <textarea rows={3} value={form.minRequirements} onChange={(e) => setField("minRequirements", e.target.value)} placeholder="Optional — e.g. 0, 15, or any text" className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)] resize-y min-h-[4rem]" />
                        </div>
                        {form.questType === "Art / Writing" && (
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Art / Writing mode</label>
                            <select value={form.artWritingMode} onChange={(e) => setField("artWritingMode", e.target.value === "either" ? "either" : "both")} className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] pl-3 pr-8 py-2 text-[var(--totk-ivory)]">
                              <option value="both">Require both art and writing</option>
                              <option value="either">Accept either art OR writing</option>
                            </select>
                            <p className="mt-1 text-xs text-[var(--totk-grey-200)]">Choose whether participants must submit both, or just one of art or writing.</p>
                          </div>
                        )}
                        {isRpStyleQuestType(form.questType) && (
                          <>
                            <div>
                              <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Post requirement</label>
                              <input type="number" min={0} value={form.postRequirement} onChange={(e) => setField("postRequirement", e.target.value)} className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                            </div>
                            <div className="sm:col-span-2 space-y-4">
                              <div>
                                <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Number of RP threads</label>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={form.rpThreadCount}
                                  onChange={(e) =>
                                    syncRpParentsCount(
                                      Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1))
                                    )
                                  }
                                  className="w-full max-w-[8rem] rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]"
                                />
                                <p className="mt-1 text-xs text-[var(--totk-grey-200)]">
                                  When posted, this many Discord threads are created (1–10). Names include a number when there is more than one.
                                </p>
                              </div>
                              <div className="space-y-3">
                                <div>
                                  <p className="text-sm font-medium text-[var(--totk-grey-200)]">Parent channel per thread</p>
                                  <p className="mt-1 text-xs text-[var(--totk-grey-200)]">
                                    Pick each thread&apos;s forum or RP channel—for example rudania on thread 1 and inariko on thread 2. Extra threads copy thread 1&apos;s channel until you change them.
                                  </p>
                                </div>
                                {Array.from({ length: rpThreadSlotCount }, (_, i) => (
                                  <div
                                    key={`rp-parent-slot-${i}`}
                                    className="flex flex-col gap-1.5 rounded-md border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-warm-black)]/40 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                                  >
                                    <span className="shrink-0 text-xs font-medium text-[var(--totk-grey-200)] sm:w-24">
                                      Thread {i + 1}
                                    </span>
                                    <select
                                      value={form.rpThreadParentChannels[i] ?? ""}
                                      onChange={(e) => setRpThreadParentAt(i, e.target.value)}
                                      className="w-full flex-1 rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] pl-3 pr-8 py-2 text-[var(--totk-ivory)]"
                                    >
                                      <option value="">—</option>
                                      {RP_THREAD_CHANNELS.map((ch) => (
                                        <option key={ch.id} value={ch.id}>
                                          {ch.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>
                            {editingId && (
                              <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">
                                  RP thread IDs (manual override)
                                </label>
                                <input
                                  type="text"
                                  value={form.rpThreadId}
                                  onChange={(e) => setField("rpThreadId", e.target.value)}
                                  placeholder="One ID, or several separated by commas or spaces (thread 1, thread 2, …)"
                                  className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 font-mono text-sm text-[var(--totk-ivory)]"
                                />
                                <p className="mt-1 text-xs text-[var(--totk-grey-200)]">
                                  Paste Discord thread snowflakes if you created threads yourself (e.g. auto-create failed). Separate multiple IDs with{" "}
                                  <span className="text-[var(--totk-ivory)]/90">commas</span>,{" "}
                                  <span className="text-[var(--totk-ivory)]/90">spaces</span>, or new lines — first ID = Thread 1, second = Thread 2, matching the parent channel list above. Leave empty to keep existing or auto-created threads.
                                </p>
                              </div>
                            )}
                            {form.questType === "RP" && (
                              <>
                                <TablerollNamePicker
                                  tableroll={form.tableroll}
                                  catalog={tablerollCatalog}
                                  onChangeTableroll={(v) => setField("tableroll", v)}
                                />
                                <div className="sm:col-span-2">
                                  <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Optional table rolls</label>
                                  <p className="mb-1 text-xs text-[var(--totk-grey-200)]">
                                    One name per line, or comma-separated. Optional flavor rolls—not required for RP completion unless your rules say otherwise.
                                  </p>
                                  <textarea
                                    rows={4}
                                    value={form.tableroll}
                                    onChange={(e) => setField("tableroll", e.target.value)}
                                    placeholder={"Loot_A\nLoot_B"}
                                    className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm font-mono text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-200)]/60 resize-y min-h-[6rem]"
                                  />
                                </div>
                              </>
                            )}
                          </>
                        )}
                        {isInteractiveStyleQuestType(form.questType) && (
                          <>
                            <TablerollNamePicker
                              tableroll={form.tableroll}
                              catalog={tablerollCatalog}
                              onChangeTableroll={(v) => setField("tableroll", v)}
                            />
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Table rolls</label>
                              <p className="mb-1 text-xs text-[var(--totk-grey-200)]">
                                Use the checklist above and/or enter names: one per line, or comma-separated. Progress updates only when someone runs{" "}
                                <code className="text-[0.8125rem]">/tableroll roll</code> on a table whose name is listed here (Discord matches exactly).
                              </p>
                              <textarea
                                rows={4}
                                value={form.tableroll}
                                onChange={(e) => setField("tableroll", e.target.value)}
                                placeholder={"Loot_A\nLoot_B\n(or: Loot_A, Loot_B)"}
                                className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-sm font-mono text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-200)]/60 resize-y min-h-[6rem]"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Required rolls</label>
                              <input type="number" min={1} value={form.requiredRolls} onChange={(e) => setField("requiredRolls", e.target.value)} className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                              <p className="mt-1 text-xs text-[var(--totk-grey-200)]">
                                Each <code className="text-[0.8125rem]">/tableroll roll</code> on a listed table counts once toward this total.
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                    </fieldset>

                    {/* Rules and collab */}
                    <fieldset className="rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/[0.72] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)] space-y-4">
                      <legend className="text-sm font-semibold text-[var(--totk-ivory)] px-1">Rules and collab</legend>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex items-center gap-2 sm:col-span-2">
                          <input type="checkbox" id="collabAllowed" checked={form.collabAllowed} onChange={(e) => setField("collabAllowed", e.target.checked)} className="rounded border-[var(--totk-dark-ocher)]" />
                          <label htmlFor="collabAllowed" className="text-sm text-[var(--totk-ivory)]">Collab allowed</label>
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Rules</label>
                          <p className="mb-1 text-xs text-[var(--totk-grey-200)]">Markdown supported (e.g. **bold**, - list).</p>
                          <textarea value={form.rules} onChange={(e) => setField("rules", e.target.value)} rows={3} className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Collab rule (display text)</label>
                          <input type="text" value={form.collabRule} onChange={(e) => setField("collabRule", e.target.value)} placeholder="e.g. max 500 tokens with collab" className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                        </div>
                      </div>
                    </fieldset>

                    {/* Meta (edit only) */}
                    {editingId && (
                      <fieldset className="rounded-lg border border-[var(--totk-mid-ocher)]/55 bg-[var(--totk-mid-ocher)]/[0.16] p-4 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)] space-y-3">
                        <legend className="text-sm font-semibold text-[var(--totk-ivory)] px-1">Meta</legend>
                        <details className="rounded-md border border-[var(--totk-mid-ocher)]/50 bg-[var(--botw-black)]/45 px-2.5 py-1.5 text-[11px] leading-snug text-[var(--totk-grey-200)] shadow-sm">
                          <summary className="cursor-pointer select-none font-medium text-[var(--totk-ivory)] hover:text-[var(--totk-mid-ocher)]">
                            Posted vs dashboard status
                          </summary>
                          <p className="mt-2 border-t border-[var(--totk-dark-ocher)]/25 pt-2">
                            <strong className="text-[var(--totk-ivory)]">Posted</strong> means the bot announced this on the Discord quest board. If unchecked,
                            it wasn&apos;t posted there yet — <strong className="text-[var(--totk-ivory)]">Status</strong> above can still be draft, pending, or
                            active.
                          </p>
                        </details>
                        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                          <div className="flex items-center gap-2">
                            <input type="checkbox" id="posted" checked={form.posted} onChange={(e) => setField("posted", e.target.checked)} className="rounded border-[var(--totk-dark-ocher)]" />
                            <label htmlFor="posted" className="text-sm text-[var(--totk-ivory)]">Posted</label>
                          </div>
                          <div>
                            <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Posted at</label>
                            <input type="datetime-local" value={form.postedAt} onChange={(e) => setField("postedAt", e.target.value)} className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="mb-1 block text-sm font-medium text-[var(--totk-grey-200)]">Bot notes</label>
                            <textarea value={form.botNotes} onChange={(e) => setField("botNotes", e.target.value)} rows={2} className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2 text-[var(--totk-ivory)]" />
                          </div>
                        </div>
                      </fieldset>
                    )}

                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={submitting}
                        className="rounded-lg border-2 border-[var(--totk-light-green)] bg-[var(--totk-light-green)]/20 px-4 py-2 font-semibold text-[var(--totk-light-green)] hover:bg-[var(--totk-light-green)]/30 disabled:opacity-50"
                      >
                        {submitting ? "Saving..." : editingId ? "Update Quest" : "Create Quest"}
                      </button>
                      {editingId && (
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-lg border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-4 py-2 font-semibold text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/30"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>
                </div>
                <div className="min-w-0 lg:sticky lg:top-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">
                      Discord embed preview
                    </p>
                    <button
                      type="button"
                      onClick={handlePostPreview}
                      disabled={previewPosting || !form.title.trim()}
                      className="rounded-md border border-[var(--totk-mid-ocher)] bg-[var(--totk-mid-ocher)]/20 px-3 py-1.5 text-xs font-semibold text-[var(--totk-ivory)] hover:bg-[var(--totk-mid-ocher)]/40 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {previewPosting ? "Posting..." : "Post Preview"}
                    </button>
                  </div>
                  <QuestEmbedPreview form={form} />
                  <p className="mt-1 text-[10px] text-[var(--totk-grey-200)]">
                    Post Preview sends the embed to the preview channel only. Quest is not saved or made live.
                  </p>
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === "list" && (
          <section className="rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-gradient-to-br from-[var(--botw-warm-black)] to-[var(--botw-black)] p-5 sm:p-6 shadow-lg">
            <h2 className="mb-2 text-xl font-semibold text-[var(--totk-ivory)]">View / Edit quests</h2>
            <p className="mb-4 text-sm text-[var(--totk-grey-200)]">
              Click a title to view, or <strong>Edit</strong> to load a quest into the Create tab and update it.
            </p>
            {quests.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <label className="text-sm font-medium text-[var(--totk-grey-200)]">Sort by date:</label>
                <select
                  value={sortDateOrder}
                  onChange={(e) => setSortDateOrder(e.target.value as "newest" | "oldest")}
                  className="rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] pl-3 pr-8 py-2 text-sm text-[var(--totk-ivory)]"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
            )}
          {quests.length === 0 ? (
            <div className="rounded-lg border-2 border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 p-8 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[var(--totk-dark-ocher)]/20 mb-3">
                <i className="fa-solid fa-scroll text-2xl text-[var(--totk-grey-200)]" aria-hidden="true" />
              </div>
              <p className="text-[var(--botw-pale)] font-semibold mb-1">No quests yet</p>
              <p className="text-sm text-[var(--totk-grey-200)]">Create one using the form above.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border-2 border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/40 overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/60">
                    <th className="pb-3 pt-3 pl-4 pr-3 text-[var(--totk-grey-200)] font-semibold">Title</th>
                    <th className="pb-3 pt-3 pr-3 text-[var(--totk-grey-200)] font-semibold">Quest ID</th>
                    <th className="pb-3 pt-3 pr-3 text-[var(--totk-grey-200)] font-semibold">Date</th>
                    <th className="pb-3 pt-3 pr-3 text-[var(--totk-grey-200)] font-semibold">Type</th>
                    <th className="pb-3 pt-3 pr-3 text-[var(--totk-grey-200)] font-semibold">Status</th>
                    <th className="pb-3 pt-3 pr-3 text-[var(--totk-grey-200)] font-semibold">Posted</th>
                    <th className="pb-3 pt-3 pr-3 text-[var(--totk-grey-200)] font-semibold">Created by</th>
                    <th className="pb-3 pt-3 pr-4 text-[var(--totk-grey-200)] font-semibold min-w-[280px]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQuests.map((q) => (
                    <tr key={String(q._id)} className="border-b border-[var(--totk-dark-ocher)]/30 hover:bg-[var(--totk-dark-ocher)]/10 transition-colors">
                      <td className="py-3 pl-4 pr-3">
                        <button
                          type="button"
                          onClick={() => openViewModal(String(q._id))}
                          className="text-left font-medium text-[var(--botw-pale)] hover:text-[var(--totk-ivory)] hover:underline"
                        >
                          {q.title ?? "—"}
                        </button>
                      </td>
                      <td className="py-3 pr-3 font-mono text-[var(--totk-ivory)] text-xs">{q.questID ?? "—"}</td>
                      <td className="py-3 pr-3 text-[var(--botw-pale)]">{q.date ?? "—"}</td>
                      <td className="py-3 pr-3 text-[var(--botw-pale)]">{q.questType ?? "—"}</td>
                      <td className="py-3 pr-3 text-[var(--botw-pale)]">{statusDisplay(q.status)}</td>
                      <td className="py-3 pr-3 text-[var(--botw-pale)]">{isQuestPosted(q) ? "Yes" : "No"}</td>
                      <td className="py-3 pr-3 text-[var(--botw-pale)]">{q.createdByUsername ?? "—"}</td>
                      <td className="py-3 pr-4 min-w-[280px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => loadQuestForEdit(String(q._id))}
                            className="rounded-md bg-[var(--totk-mid-ocher)]/80 px-3 py-1.5 text-xs font-semibold text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)] transition-colors shrink-0"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => openManageModal(String(q._id))}
                            className="rounded-md bg-[var(--totk-dark-ocher)]/80 px-3 py-1.5 text-xs font-semibold text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)] transition-colors shrink-0"
                          >
                            Manage
                          </button>
                          {q.status !== "completed" && (
                            <button
                              type="button"
                              onClick={() => setCompleteConfirmQuestId(String(q._id))}
                              disabled={completingQuestId === String(q._id)}
                              className="rounded-md bg-[var(--totk-light-green)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--totk-light-green)] hover:bg-[var(--totk-light-green)]/50 disabled:opacity-50 transition-colors shrink-0"
                            >
                              {completingQuestId === String(q._id) ? "Completing..." : "Mark completed"}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteFromListId(String(q._id))}
                            className="rounded-md border-2 border-red-500 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/25 transition-colors shrink-0"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </section>
        )}

        {/* Manage participants modal (portal + z-[100] so it sits above the fixed top bar) */}
        {manageQuestId &&
          manageModalMounted &&
          createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/60 px-4 pb-4"
              style={{ paddingTop: TOP_BAR_HEIGHT + 10 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="manage-participants-title"
            >
              <div
                className="my-auto w-full max-w-5xl overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-2xl flex flex-col"
                style={{ maxHeight: `min(85vh, calc(100vh - ${TOP_BAR_HEIGHT + 28}px))` }}
              >
              <div className="border-b border-[var(--totk-dark-ocher)]/60 p-3 shrink-0">
                <h2 id="manage-participants-title" className="text-base font-semibold text-[var(--totk-ivory)]">
                  Manage participants{manageQuest ? ` – ${manageQuest.title ?? "Quest"}` : ""}
                </h2>
                {manageQuest && (
                  <p className="mt-1 text-sm text-[var(--totk-grey-200)]">
                    Quest ID: <span className="font-mono text-[var(--totk-ivory)]">{manageQuest.questID ?? manageQuestId}</span>
                    {manageQuest.participantCap != null && (
                      <> · Participation cap: {manageQuest.participantCap}</>
                    )}
                  </p>
                )}
                <details className="mt-2 rounded-md border border-[var(--totk-light-green)]/35 bg-[var(--totk-dark-ocher)]/[0.18] px-3 py-2 text-xs text-[var(--totk-grey-200)] shadow-sm">
                  <summary className="cursor-pointer select-none font-medium text-[var(--totk-ivory)]">
                    Participant status (from bot progress)
                  </summary>
                  <p className="mt-2 border-t border-[var(--totk-dark-ocher)]/30 pt-2 leading-relaxed">
                    Values come from the bot&apos;s <code className="rounded bg-[var(--botw-black)] px-1 font-mono text-[10px] text-[var(--totk-ivory)]">progress</code>{" "}
                    field. Token amounts mirror payouts when recorded.
                  </p>
                  <ul className="mt-2 list-inside list-disc space-y-1 pl-1 leading-relaxed">
                    <li>
                      <span className="text-[var(--totk-ivory)]">active</span> — Still in the quest; requirements not finished (or not synced yet).
                    </li>
                    <li>
                      <span className="text-[var(--totk-ivory)]">completed</span> — Requirements met. If <strong className="text-[var(--totk-ivory)]">Tokens</strong> is
                      empty, the bot may not have written <code className="rounded bg-[var(--botw-black)] px-1 font-mono text-[10px]">tokensEarned</code> yet, or
                      tokens were paid only in Sheikah. Use <strong className="text-[var(--totk-ivory)]">Sync reward status</strong> to align the row without paying
                      again.
                    </li>
                    <li>
                      <span className="text-[var(--totk-ivory)]">rewarded</span> — Stored as rewarded, or progress is completed and tokens are already set (paid /
                      recorded).
                    </li>
                    <li>
                      <span className="text-[var(--totk-ivory)]">failed</span> — Did not complete (e.g. time ran out or dropped).
                    </li>
                    <li>
                      <span className="text-[var(--totk-ivory)]">disqualified</span> — Removed for rules or location issues.
                    </li>
                  </ul>
                </details>
              </div>
              <div className="flex-1 overflow-y-auto p-3 sm:p-4">
                {!manageQuest ? (
                  <div className="flex items-center justify-center py-12">
                    <Loading message="Loading participants..." variant="inline" size="lg" />
                  </div>
                ) : (() => {
                  const participants = manageQuest.participants ?? {};
                  const entries = Object.entries(participants);
                  return entries.length === 0 ? (
                    <p className="text-[var(--totk-grey-200)]">No participants.</p>
                  ) : (
                    <>
                      {manageParticipantsError && (
                        <div className="mb-4 rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                          {manageParticipantsError}
                        </div>
                      )}
                      {manageParticipantsSuccess && (
                        <div className="mb-4 rounded-lg border border-[var(--totk-light-green)]/60 bg-[var(--totk-light-green)]/10 px-3 py-2 text-sm text-[var(--totk-light-green)]">
                          {manageParticipantsSuccess}
                        </div>
                      )}
                      <p className="mb-3 text-xs text-[var(--totk-grey-200)]">
                        Use each row&apos;s <strong className="text-[var(--totk-ivory)]">Status</strong> menu to fix progress (e.g.{" "}
                        <span className="text-[var(--totk-ivory)]">failed</span> → <span className="text-[var(--totk-ivory)]">active</span>) without paying tokens.
                        Check &quot;Mark completed&quot; for participants who finished the quest, then use{" "}
                        <strong className="text-[var(--totk-ivory)]">Mark N completed</strong> to grant tokens and log completion.
                        If the bot already paid tokens but the row is wrong, use{" "}
                        <span className="text-[var(--totk-ivory)]">Sync reward status</span> (updates the quest row only; does not send tokens again).
                      </p>
                      <p className="mb-3 text-[10px] leading-relaxed text-[var(--totk-grey-200)]">
                        Row tint:{" "}
                        <span className="text-cyan-300/90">active</span> ·{" "}
                        <span className="text-amber-300/90">completed</span> ·{" "}
                        <span className="text-red-300/90">failed</span> ·{" "}
                        <span className="text-emerald-300/90">rewarded</span> ·{" "}
                        <span className="text-violet-300/90">disqualified</span>
                      </p>
                      <div className="overflow-x-auto rounded-lg border border-[var(--totk-dark-ocher)]/40">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-black)]/60">
                              <th className="py-2 pl-3 pr-2 text-[var(--totk-grey-200)] font-semibold">Mark completed</th>
                              <th className="py-2 pr-3 text-[var(--totk-grey-200)] font-semibold">User</th>
                              <th className="py-2 pr-3 text-[var(--totk-grey-200)] font-semibold">Character</th>
                              {isRpStyleQuestType(manageQuest.questType ?? "") && (
                                <th className="py-2 pr-3 text-[var(--totk-grey-200)] font-semibold">Posts (min)</th>
                              )}
                              <th className="py-2 pr-3 text-[var(--totk-grey-200)] font-semibold min-w-[10rem]">Status</th>
                              <th className="py-2 pr-3 text-[var(--totk-grey-200)] font-semibold">Tokens</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entries.map(([userId, p]) => {
                              const progressRaw = (p?.progress ?? "active") as string;
                              const progress = PARTICIPANT_PROGRESS_VALUES.includes(
                                progressRaw as (typeof PARTICIPANT_PROGRESS_VALUES)[number]
                              )
                                ? progressRaw
                                : "active";
                              const tokensEarned = p?.tokensEarned;
                              const submissionTok =
                                typeof p?.submissionRewardTokenAmount === "number" &&
                                p.submissionRewardTokenAmount > 0
                                  ? p.submissionRewardTokenAmount
                                  : null;
                              const hasQuestTokens =
                                (typeof tokensEarned === "number" && tokensEarned > 0) ||
                                (p?.questTokensPaidViaSubmission === true && submissionTok != null);
                              const displayTokens =
                                typeof tokensEarned === "number" && tokensEarned > 0
                                  ? tokensEarned
                                  : submissionTok;
                              const canMark =
                                progress !== "rewarded" && !hasQuestTokens;
                              const isSelected = selectedParticipantIds.includes(userId);
                              const statusBusy = participantProgressSavingId !== null;
                              return (
                                <tr
                                  key={userId}
                                  className={participantProgressRowClass(progress)}
                                >
                                  <td className="py-2 pl-3 pr-2">
                                    {canMark ? (
                                      <label className="flex cursor-pointer items-center gap-2">
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => toggleParticipantSelected(userId)}
                                          className="rounded border-[var(--totk-dark-ocher)]"
                                        />
                                        <span className="text-xs text-[var(--totk-grey-200)]">Mark</span>
                                      </label>
                                    ) : (
                                      <span className="text-[var(--totk-grey-200)]">—</span>
                                    )}
                                  </td>
                                  <td className="py-2 pr-3 text-[var(--totk-grey-200)]">
                                    {p?.username?.trim() ? (
                                      <span className="text-[var(--totk-ivory)]">{p.username}</span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td className="py-2 pr-3 font-medium text-[var(--totk-ivory)]">
                                    {p?.characterName ?? "—"}
                                  </td>
                                  {isRpStyleQuestType(manageQuest.questType ?? "") && (() => {
                                    const current = p?.rpPostCount ?? 0;
                                    const required = typeof manageQuest.postRequirement === "number" ? manageQuest.postRequirement : (manageQuest.postRequirement != null ? Number(manageQuest.postRequirement) : 15);
                                    return (
                                      <td className="py-2 pr-3 text-[var(--totk-grey-200)]">
                                        {current}/{required}
                                      </td>
                                    );
                                  })()}
                                  <td className="py-2 pr-3 align-top">
                                    <div className="flex flex-col gap-1">
                                      <select
                                        value={progress}
                                        disabled={statusBusy}
                                        title="Updates bot participant progress only; does not send tokens."
                                        onChange={(e) => {
                                          const next = e.target.value;
                                          if (next === progress) return;
                                          void updateParticipantProgress(userId, next);
                                        }}
                                        className="w-full min-w-[9rem] max-w-[14rem] rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2 py-1.5 text-xs font-medium text-[var(--totk-ivory)] disabled:opacity-50"
                                      >
                                        {PARTICIPANT_PROGRESS_VALUES.map((v) => (
                                          <option key={v} value={v}>
                                            {v}
                                          </option>
                                        ))}
                                      </select>
                                      {participantProgressSavingId === userId && (
                                        <span className="text-[10px] text-[var(--totk-grey-200)]">Saving…</span>
                                      )}
                                      {progress === "completed" && hasQuestTokens && (
                                        <span className="text-[10px] leading-snug text-[var(--totk-grey-200)]">
                                          Tokens on row: pick <span className="text-[var(--totk-ivory)]">rewarded</span> to align with payout, or run Sync.
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-2 pr-3 text-[var(--totk-grey-200)]">
                                    {hasQuestTokens && displayTokens != null ? (
                                      <span>{displayTokens} tokens</span>
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                })()}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--totk-dark-ocher)]/60 p-3">
                <button
                  type="button"
                  onClick={closeManageModal}
                  className="rounded-md border border-[var(--totk-dark-ocher)] px-4 py-2 text-sm font-medium text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/20"
                >
                  Close
                </button>
                {manageQuest && Object.keys(manageQuest.participants ?? {}).length > 0 && (
                  <button
                    type="button"
                    onClick={() => void syncRewardProgressFromQuest()}
                    disabled={syncRewardProgressLoading || !manageQuest}
                    title="Sets progress to rewarded when tokensEarned is already set (e.g. bot payout); does not grant tokens."
                    className="rounded-md border border-[var(--totk-light-green)]/50 px-4 py-2 text-sm font-medium text-[var(--totk-light-green)] hover:bg-[var(--totk-light-green)]/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {syncRewardProgressLoading ? "Syncing..." : "Sync reward status"}
                  </button>
                )}
                {manageQuest && Object.keys(manageQuest.participants ?? {}).length > 0 && (
                  <button
                    type="button"
                    onClick={saveManageParticipants}
                    disabled={manageParticipantsSaving || selectedParticipantIds.length === 0}
                    className="rounded-md bg-[var(--totk-mid-ocher)]/80 px-4 py-2 text-sm font-semibold text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {manageParticipantsSaving ? "Saving..." : `Mark ${selectedParticipantIds.length} completed`}
                  </button>
                )}
              </div>
            </div>
            </div>,
            document.body
          )}

        {/* Mark quest completed confirmation modal */}
        {completeConfirmQuestId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-confirm-title"
          >
            <div className="w-full max-w-md overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-2xl">
              <div className="p-5">
                <h2 id="complete-confirm-title" className="text-lg font-bold text-[var(--totk-ivory)]">
                  Mark quest as completed?
                </h2>
                {(() => {
                  const quest = quests.find((q) => String(q._id) === completeConfirmQuestId);
                  return quest?.title ? (
                    <p className="mt-2 text-sm font-medium text-[var(--botw-pale)]">{quest.title}</p>
                  ) : null;
                })()}
                <p className="mt-3 text-sm leading-relaxed text-[var(--totk-grey-200)]">
                  This will set the quest status to completed and reward all participants who have not been rewarded yet.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--totk-dark-ocher)]/60 p-4">
                <button
                  type="button"
                  onClick={() => setCompleteConfirmQuestId(null)}
                  disabled={completingQuestId === completeConfirmQuestId}
                  className="rounded-md border border-[var(--totk-dark-ocher)] px-4 py-2 text-sm font-medium text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/20 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => completeConfirmQuestId && confirmCompleteQuest(completeConfirmQuestId)}
                  disabled={completingQuestId === completeConfirmQuestId}
                  className="rounded-md bg-[var(--totk-light-green)]/30 px-4 py-2 text-sm font-semibold text-[var(--totk-light-green)] hover:bg-[var(--totk-light-green)]/50 disabled:opacity-50"
                >
                  {completingQuestId === completeConfirmQuestId ? "Completing..." : "Mark completed"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete quest from list confirmation modal */}
        {deleteFromListId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
          >
            <div className="w-full max-w-md overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-2xl">
              <div className="p-5">
                <h2 id="delete-confirm-title" className="text-lg font-bold text-[var(--totk-ivory)]">
                  Delete quest?
                </h2>
                {(() => {
                  const quest = quests.find((q) => String(q._id) === deleteFromListId);
                  return quest?.title ? (
                    <p className="mt-2 text-sm font-medium text-[var(--botw-pale)]">{quest.title}</p>
                  ) : null;
                })()}
                <p className="mt-3 text-sm leading-relaxed text-[var(--totk-grey-200)]">
                  This cannot be undone. The quest will be removed from the database.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--totk-dark-ocher)]/60 p-4">
                <button
                  type="button"
                  onClick={() => setDeleteFromListId(null)}
                  disabled={deletingQuestId === deleteFromListId}
                  className="rounded-md border border-[var(--totk-dark-ocher)] px-4 py-2 text-sm font-medium text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/20 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteFromListId && confirmDeleteQuestFromList(deleteFromListId)}
                  disabled={deletingQuestId === deleteFromListId}
                  className="rounded-md border border-red-500/80 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                >
                  {deletingQuestId === deleteFromListId ? "Deleting..." : "Delete quest"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View quest details modal */}
        {viewQuestId && (
          <div
            className="fixed inset-0 z-50 flex min-h-full items-center justify-center overflow-y-auto bg-black/60 p-4 py-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby="view-quest-title"
            onClick={closeViewModal}
          >
            <div
              className="my-8 max-h-[85vh] w-full max-w-2xl shrink-0 overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-[var(--totk-dark-ocher)]/60 px-5 py-4 shrink-0">
                <h2 id="view-quest-title" className="text-xl font-bold text-[var(--totk-ivory)] leading-tight">
                  {viewQuest ? (viewQuest.title ?? "Quest") : "Quest details"}
                </h2>
                {viewQuest?.questID && (
                  <p className="mt-2 text-xs font-mono text-[var(--totk-grey-200)] tracking-wide">ID: {viewQuest.questID}</p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {!viewQuest ? (
                  <div className="flex items-center justify-center py-12">
                    <Loading message="Loading..." variant="inline" size="lg" />
                  </div>
                ) : (
                  <>
                    <section className="rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-black)]/40 p-4">
                      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">Details</h3>
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
                        <div><dt className="text-[var(--totk-grey-200)]">Date</dt><dd className="mt-0.5 font-medium text-[var(--totk-ivory)]">{viewQuest.date ?? "—"}</dd></div>
                        <div><dt className="text-[var(--totk-grey-200)]">Type</dt><dd className="mt-0.5 font-medium text-[var(--totk-ivory)]">{viewQuest.questType ?? "—"}</dd></div>
                        <div><dt className="text-[var(--totk-grey-200)]">Status</dt><dd className="mt-0.5 font-medium text-[var(--totk-ivory)]">{statusDisplay(viewQuest.status)}</dd></div>
                        <div><dt className="text-[var(--totk-grey-200)]">Location</dt><dd className="mt-0.5 font-medium text-[var(--totk-ivory)]">{(viewQuest as QuestRecord & { location?: string }).location ?? "—"}</dd></div>
                        <div><dt className="text-[var(--totk-grey-200)]">Time limit</dt><dd className="mt-0.5 font-medium text-[var(--totk-ivory)]">{(viewQuest as QuestRecord & { timeLimit?: string; timeLimitEndDate?: string }).timeLimit ?? "—"}{(viewQuest as { timeLimitEndDate?: string }).timeLimitEndDate && /^\d{4}-\d{2}-\d{2}$/.test(String((viewQuest as { timeLimitEndDate?: string }).timeLimitEndDate).trim()) ? ` · Ends ${formatEndDateFromYyyyMmDd(String((viewQuest as { timeLimitEndDate?: string }).timeLimitEndDate).trim())} US Eastern` : ""}</dd></div>
                        <div><dt className="text-[var(--totk-grey-200)]">Signup deadline</dt><dd className="mt-0.5 font-medium text-[var(--totk-ivory)]">{(viewQuest as QuestRecord & { signupDeadline?: string }).signupDeadline ?? "—"}</dd></div>
                        <div><dt className="text-[var(--totk-grey-200)]">Participation cap</dt><dd className="mt-0.5 font-medium text-[var(--totk-ivory)]">{viewQuest.participantCap != null ? viewQuest.participantCap : "—"}</dd></div>
                        <div><dt className="text-[var(--totk-grey-200)]">Participants</dt><dd className="mt-0.5 font-medium text-[var(--totk-ivory)]">{Object.keys(viewQuest.participants ?? {}).length}</dd></div>
                        <div><dt className="text-[var(--totk-grey-200)]">Posted</dt><dd className="mt-0.5 font-medium text-[var(--totk-ivory)]">{isQuestPosted(viewQuest) ? "Yes" : "No"}</dd></div>
                        {Boolean(viewQuest.postedAt ?? (viewQuest as Record<string, unknown>).postedAt) && (
                          <div className="col-span-2"><dt className="text-[var(--totk-grey-200)]">Posted at</dt><dd className="mt-0.5 font-medium text-[var(--totk-ivory)]">{String((viewQuest as Record<string, unknown>).postedAt ?? viewQuest.postedAt ?? "")}</dd></div>
                        )}
                      </dl>
                    </section>
                    {(viewQuest as QuestRecord & { description?: string }).description && (
                      <section className="rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-black)]/40 p-4">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">Description</h3>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--botw-pale)]">{(viewQuest as QuestRecord & { description?: string }).description}</p>
                      </section>
                    )}
                    {(viewQuest as QuestRecord & { rules?: string }).rules && (
                      <section className="rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-black)]/40 p-4">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">Rules</h3>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--botw-pale)]">{(viewQuest as QuestRecord & { rules?: string }).rules}</p>
                      </section>
                    )}
                    <section className="rounded-lg border border-[var(--totk-dark-ocher)]/40 bg-[var(--botw-black)]/40 p-4">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">Rewards</h3>
                      <ul className="space-y-1 text-sm text-[var(--botw-pale)]">
                        <li><span className="text-[var(--totk-grey-200)]">Tokens:</span> {viewQuest.tokenReward != null ? String(viewQuest.tokenReward) : "—"}</li>
                        {(viewQuest.itemRewards && viewQuest.itemRewards.length > 0) ? (
                          viewQuest.itemRewards.map((i, idx) => (
                            <li key={idx}><span className="text-[var(--totk-grey-200)]">Item:</span> {i.name} ×{i.quantity ?? 1}</li>
                          ))
                        ) : viewQuest.itemReward ? (
                          <li><span className="text-[var(--totk-grey-200)]">Item:</span> {viewQuest.itemReward} ×{viewQuest.itemRewardQty ?? 1}</li>
                        ) : null}
                      </ul>
                    </section>
                    {(viewQuest as QuestRecord & { botNotes?: string }).botNotes && (
                      <section className="rounded-lg border border-[var(--totk-dark-ocher)]/30 bg-[var(--botw-black)]/30 p-4">
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--totk-grey-200)]">Bot notes</h3>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--totk-grey-200)]">{(viewQuest as QuestRecord & { botNotes?: string }).botNotes}</p>
                      </section>
                    )}
                  </>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--totk-dark-ocher)]/60 px-5 py-4">
                {viewQuest && viewQuestId && deleteConfirmQuestId === viewQuestId ? (
                  <>
                    <span className="text-sm text-[var(--totk-grey-200)]">Are you sure? This cannot be undone.</span>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmQuestId(null)}
                      className="rounded-md border border-[var(--totk-dark-ocher)] px-4 py-2 text-sm font-medium text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/20"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => confirmDeleteQuest(viewQuestId)}
                      disabled={deletingQuestId === viewQuestId}
                      className="rounded-md border border-red-500/80 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-400 hover:bg-red-500/30 disabled:opacity-50"
                    >
                      {deletingQuestId === viewQuestId ? "Deleting..." : "Delete quest"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={closeViewModal}
                      className="rounded-md border border-[var(--totk-dark-ocher)] px-4 py-2 text-sm font-medium text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]/20"
                    >
                      Close
                    </button>
                    {viewQuest && viewQuestId && (
                      <>
                        <button
                          type="button"
                          onClick={handleViewPreviewPost}
                          disabled={viewPreviewPosting || !viewQuest.title?.trim()}
                          className="rounded-md border border-[var(--totk-mid-ocher)] bg-[var(--totk-mid-ocher)]/20 px-4 py-2 text-sm font-semibold text-[var(--totk-ivory)] hover:bg-[var(--totk-mid-ocher)]/40 disabled:opacity-50"
                        >
                          {viewPreviewPosting ? "Posting..." : "Preview post"}
                        </button>
                        <button
                          type="button"
                          onClick={() => { closeViewModal(); openManageModal(viewQuestId); }}
                          className="rounded-md bg-[var(--totk-dark-ocher)]/80 px-4 py-2 text-sm font-semibold text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]"
                        >
                          Manage
                        </button>
                        <button
                          type="button"
                          onClick={() => { closeViewModal(); loadQuestForEdit(viewQuestId); }}
                          className="rounded-md bg-[var(--totk-mid-ocher)]/80 px-4 py-2 text-sm font-semibold text-[var(--totk-ivory)] hover:bg-[var(--totk-dark-ocher)]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmQuestId(viewQuestId)}
                          className="rounded-md border border-red-500/50 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
