"use client";

/* ============================================================================ */
/* ------------------- Imports ------------------- */
/* ============================================================================ */

import { Modal } from "@/components/ui";
import { formatLocationsDisplay } from "@/lib/string-utils";
import { clsx } from "clsx";
import type { ReactNode } from "react";

/* ============================================================================ */
/* ------------------- Types ------------------- */
/* ============================================================================ */

/* [quest-modal.tsx]🧷 Quest participant - */
export type QuestParticipant = {
  name: string;
  rpPostCount?: number;
  rollCount?: number;
  status: "Active" | "Completed";
};

/* [quest-modal.tsx]🧷 Item reward (name + quantity) - */
export type QuestItemReward = { name: string; quantity: number };

/* [quest-modal.tsx]🧷 Detailed quest item - */
export type DetailedQuestItem = {
  category: string;
  description: string;
  itemRewards?: QuestItemReward[];
  locations: string[];
  maxParticipants: number;
  month: string;
  name: string;
  participants: QuestParticipant[];
  participationRequirements: string[];
  postRequirement?: number;
  requiredRolls?: number;
  postedDate?: string;
  signupDeadline?: string;
  rewards: {
    tokens?: number;
    flat?: number;
    perUnit?: number;
    unitLabel?: string;
    maxUnits?: number;
    collabBonus?: number;
    description?: string;
  };
  rules: string[];
  specialNote?: string;
  status: "Active" | "Completed" | "Upcoming";
  timeLimit: string;
  type: string;
  village: string;
};

/* ============================================================================ */
/* ------------------- Constants ------------------- */
/* ============================================================================ */

/* [quest-modal.tsx]✨ Quest type → color (hex) & icon - hex allows alpha suffix */
const QUEST_TYPE_STYLE: Record<string, { color: string; icon: string }> = {
  Art: { color: "#a855f7", icon: "fa-palette" },
  Writing: { color: "#6366f1", icon: "fa-feather" },
  Interactive: { color: "#f97316", icon: "fa-puzzle-piece" },
  RP: { color: "#49d59c", icon: "fa-theater-masks" },
  "Art / Writing": { color: "#2dd4bf", icon: "fa-palette" },
};

export function getQuestTypeStyle(type: string) {
  return QUEST_TYPE_STYLE[type] ?? { color: "#00a3da", icon: "fa-scroll" };
}

/* [quest-modal.tsx]✨ Status colors - */
const statusColors: Record<string, string> = {
  Active: "var(--totk-light-green)",
  Completed: "var(--totk-light-ocher)",
  Upcoming: "var(--botw-blue)",
};

const participantStatusColors = {
  Active: "var(--totk-light-green)",
  Completed: "var(--totk-light-ocher)",
};

/* Section accent colors - distinct per block */
const SECTION_ACCENT = {
  location: { border: "rgba(73, 213, 156, 0.5)", bg: "rgba(73, 213, 156, 0.08)", icon: "var(--totk-light-green)" },
  time: { border: "rgba(229, 220, 183, 0.5)", bg: "rgba(229, 220, 183, 0.08)", icon: "var(--totk-light-ocher)" },
  participants: { border: "rgba(0, 163, 218, 0.5)", bg: "rgba(0, 163, 218, 0.08)", icon: "var(--botw-blue)" },
  rewards: { border: "rgba(255, 215, 0, 0.5)", bg: "rgba(255, 215, 0, 0.08)", icon: "#FFD700" },
  requirements: { border: "rgba(99, 102, 241, 0.5)", bg: "rgba(99, 102, 241, 0.08)", icon: "#6366f1" },
  rules: { border: "rgba(185, 159, 101, 0.5)", bg: "rgba(185, 159, 101, 0.08)", icon: "var(--totk-mid-ocher)" },
  specialNote: { border: "rgba(73, 213, 156, 0.5)", bg: "rgba(73, 213, 156, 0.08)", icon: "var(--totk-light-green)" },
  participantsList: { border: "rgba(0, 163, 218, 0.4)", bg: "rgba(0, 163, 218, 0.06)", icon: "var(--botw-blue)" },
  description: { border: "rgba(201, 182, 135, 0.3)", bg: "rgba(44, 36, 34, 0.4)", icon: "var(--totk-grey-200)" },
};

/* ============================================================================ */
/* ------------------- Main Component ------------------- */
/* ============================================================================ */

const NO_REWARD_STRINGS = ["n/a", "no reward", "no reward specified", "none"];

function formatRewards(r: DetailedQuestItem["rewards"]): { lines: { icon?: string; text: string; muted?: boolean }[] } {
  if (!r) return { lines: [] };
  const flat = r.flat ?? (typeof r.tokens === "number" && r.tokens >= 0 ? r.tokens : null);
  const perUnit = r.perUnit;
  const unitLabel = r.unitLabel?.trim();
  const maxUnits = r.maxUnits;
  const collabBonus = r.collabBonus;
  const desc = (r.description ?? "").trim().toLowerCase();
  const isNoReward = NO_REWARD_STRINGS.some((s) => desc === s || desc.startsWith(s));

  const lines: { icon?: string; text: string; muted?: boolean }[] = [];

  if (flat != null && flat >= 0) {
    lines.push({ icon: "fa-coins", text: `${flat} tokens (flat rate)` });
  }
  if (perUnit != null && perUnit >= 0) {
    let perUnitText: string;
    if (unitLabel && maxUnits != null && maxUnits >= 0) {
      perUnitText = `${perUnit} tokens per ${unitLabel} (max ${maxUnits})`;
    } else if (unitLabel) {
      perUnitText = `${perUnit} tokens per ${unitLabel}`;
    } else if (maxUnits != null && maxUnits >= 0) {
      perUnitText = `${perUnit} tokens per unit (max ${maxUnits})`;
    } else {
      perUnitText = `${perUnit} tokens per unit`;
    }
    lines.push({ icon: "fa-coins", text: perUnitText });
  }
  if (collabBonus != null && collabBonus >= 0 && collabBonus > 0) {
    lines.push({ icon: "fa-coins", text: `${collabBonus} tokens collab bonus` });
  }
  if (lines.length > 0) return { lines };

  if (isNoReward || (desc && NO_REWARD_STRINGS.some((s) => desc.includes(s)))) {
    return { lines: [{ text: "No reward", muted: true }] };
  }
  if (r.description) {
    return { lines: [{ text: r.description }] };
  }
  return { lines: [] };
}

function renderDiscordInline(text: string): ReactNode {
  // Minimal Discord-style inline formatting: __underline__ and **bold**.
  // Safe: no HTML injection; returns plain React nodes.
  const nodes: ReactNode[] = [];
  let i = 0;

  const pushText = (s: string) => {
    if (s) nodes.push(s);
  };

  while (i < text.length) {
    const uStart = text.indexOf("__", i);
    const bStart = text.indexOf("**", i);
    const next = Math.min(uStart === -1 ? Infinity : uStart, bStart === -1 ? Infinity : bStart);
    if (next === Infinity) break;

    pushText(text.slice(i, next));

    if (next === uStart) {
      const end = text.indexOf("__", uStart + 2);
      if (end === -1) {
        pushText(text.slice(uStart));
        i = text.length;
        break;
      }
      const inner = text.slice(uStart + 2, end);
      nodes.push(
        <span key={`u-${uStart}`} className="underline underline-offset-2">
          {inner}
        </span>
      );
      i = end + 2;
      continue;
    }

    // Bold
    const end = text.indexOf("**", bStart + 2);
    if (end === -1) {
      pushText(text.slice(bStart));
      i = text.length;
      break;
    }
    const inner = text.slice(bStart + 2, end);
    nodes.push(
      <span key={`b-${bStart}`} className="font-semibold text-[var(--totk-ivory)]">
        {inner}
      </span>
    );
    i = end + 2;
  }

  pushText(text.slice(i));
  return nodes.length > 0 ? <>{nodes}</> : text;
}

/* [quest-modal.tsx]🧱 Quest details modal - */
export function QuestDetailsModal({
  isOpen,
  onClose,
  quest,
}: {
  isOpen: boolean;
  onClose: () => void;
  quest: DetailedQuestItem;
}) {
  const participantsDisplay =
    quest.maxParticipants === Infinity
      ? `${quest.participants.length}/∞`
      : `${quest.participants.length}/${quest.maxParticipants}`;
  const typeStyle = getQuestTypeStyle(quest.type);
  const rewardsFormatted = formatRewards(quest.rewards);
  const hasRewards = rewardsFormatted.lines.length > 0;
  const requiredRpPosts =
    quest.type === "RP"
      ? (() => {
          if (typeof quest.postRequirement === "number" && quest.postRequirement > 0) return quest.postRequirement;
          const req = (quest.participationRequirements ?? []).find((r) => /\bRP posts required\b/i.test(r));
          const m = req?.match(/(\d+)\s*RP posts required/i);
          return m ? parseInt(m[1], 10) : 15;
        })()
      : null;
  const requiredRolls =
    quest.type === "Interactive"
      ? (() => {
          if (typeof quest.requiredRolls === "number" && quest.requiredRolls > 0) return quest.requiredRolls;
          const ruleLine = (quest.rules ?? []).find((r) => /minimum of\s+\d+\s+roll/i.test(r) || /\d+\s+rolls?\s+should be executed/i.test(r));
          const m = ruleLine?.match(/(\d+)\s+roll/i);
          return m ? parseInt(m[1], 10) : null;
        })()
      : null;
  const isBlupeeQuest = quest.type === "Interactive" && /\bblupee\b/i.test(quest.name || "");

  return (
    <Modal
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="xl"
      title={quest.name}
      description={`${quest.category} — ${quest.status}`}
    >
      <div className="space-y-5 pl-4" style={{ borderLeft: `4px solid ${typeStyle.color}` }}>
        {/* Header with Type and Status — type-colored */}
        <div
          className="flex items-center justify-between gap-3 rounded-lg border-2 p-3"
          style={{
            borderColor: `${typeStyle.color}66`,
            backgroundColor: `${typeStyle.color}1a`,
          }}
        >
          <div className="flex items-center gap-2">
            <i
              aria-hidden
              className={`fa-solid ${typeStyle.icon} text-xl`}
              style={{ color: typeStyle.color }}
            />
            <span className="text-base font-semibold text-[var(--totk-ivory)]">{quest.type}</span>
          </div>
          <div
            className="rounded px-3 py-1 text-xs font-semibold uppercase tracking-wider"
            style={{
              backgroundColor: `${statusColors[quest.status] ?? "var(--botw-blue)"}20`,
              color: statusColors[quest.status] ?? "var(--botw-blue)",
            }}
          >
            {quest.status}
          </div>
        </div>

        {/* Description */}
        <div
          className="rounded-lg border-2 p-4"
          style={{
            borderColor: SECTION_ACCENT.description.border,
            backgroundColor: SECTION_ACCENT.description.bg,
          }}
        >
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: SECTION_ACCENT.description.icon }}>
            Description
          </h3>
          <div className="whitespace-pre-line text-sm leading-relaxed text-[var(--botw-pale)]">
            {quest.description}
          </div>
        </div>

        {/* Location, Month, Time, Participants — distinct accent per cell */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            className="flex items-center gap-2.5 rounded-lg border-2 p-3"
            style={{ borderColor: SECTION_ACCENT.location.border, backgroundColor: SECTION_ACCENT.location.bg }}
          >
            <i aria-hidden className="fa-solid fa-map-marker-alt text-base shrink-0" style={{ color: SECTION_ACCENT.location.icon }} />
            <div className="min-w-0">
              <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">Location</div>
              <div className="truncate text-sm font-semibold text-[var(--totk-ivory)]">{formatLocationsDisplay(quest.locations)}</div>
            </div>
          </div>
          <div
            className="flex items-center gap-2.5 rounded-lg border-2 p-3"
            style={{ borderColor: SECTION_ACCENT.time.border, backgroundColor: SECTION_ACCENT.time.bg }}
          >
            <i aria-hidden className="fa-solid fa-calendar-days text-base shrink-0" style={{ color: SECTION_ACCENT.time.icon }} />
            <div className="min-w-0">
              <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">Month</div>
              <div className="text-sm font-semibold text-[var(--totk-ivory)]">{quest.month || "—"}</div>
            </div>
          </div>
          <div
            className="flex items-center gap-2.5 rounded-lg border-2 p-3"
            style={{ borderColor: SECTION_ACCENT.time.border, backgroundColor: SECTION_ACCENT.time.bg }}
          >
            <i aria-hidden className="fa-solid fa-clock text-base shrink-0" style={{ color: SECTION_ACCENT.time.icon }} />
            <div className="min-w-0">
              <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">Time Limit</div>
              <div className="text-sm font-semibold text-[var(--totk-ivory)]">{quest.timeLimit}</div>
            </div>
          </div>
          <div
            className="flex items-center gap-2.5 rounded-lg border-2 p-3"
            style={{ borderColor: SECTION_ACCENT.participants.border, backgroundColor: SECTION_ACCENT.participants.bg }}
          >
            <i aria-hidden className="fa-solid fa-users text-base shrink-0" style={{ color: SECTION_ACCENT.participants.icon }} />
            <div className="min-w-0">
              <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">Participants</div>
              <div className="text-sm font-semibold" style={{ color: SECTION_ACCENT.participants.icon }}>{participantsDisplay}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {quest.postedDate && (
            <div
              className="flex items-center gap-2.5 rounded-lg border-2 p-3"
              style={{ borderColor: SECTION_ACCENT.time.border, backgroundColor: SECTION_ACCENT.time.bg }}
            >
              <i aria-hidden className="fa-solid fa-calendar-days text-base shrink-0" style={{ color: SECTION_ACCENT.time.icon }} />
              <div className="min-w-0">
                <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">Posted</div>
                <div className="text-sm font-semibold text-[var(--totk-ivory)]">{quest.postedDate}</div>
              </div>
            </div>
          )}
          {quest.signupDeadline && (
            <div
              className="flex items-center gap-2.5 rounded-lg border-2 p-3"
              style={{ borderColor: SECTION_ACCENT.time.border, backgroundColor: SECTION_ACCENT.time.bg }}
            >
              <i aria-hidden className="fa-solid fa-user-clock text-base shrink-0" style={{ color: SECTION_ACCENT.time.icon }} />
              <div className="min-w-0">
                <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-[var(--totk-grey-200)]">Signup deadline</div>
                <div className="text-sm font-semibold text-[var(--totk-ivory)]">{quest.signupDeadline}</div>
              </div>
            </div>
          )}
        </div>

        {/* Rewards & Requirements — side by side when both exist */}
        <div className={clsx("grid gap-4", (quest.participationRequirements?.length ?? 0) > 0 && "sm:grid-cols-2")}>
          <div
            className="rounded-lg border-2 p-4"
            style={{ borderColor: SECTION_ACCENT.rewards.border, backgroundColor: SECTION_ACCENT.rewards.bg }}
          >
            <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: SECTION_ACCENT.rewards.icon }}>
              <i aria-hidden className="fa-solid fa-coins text-sm" />
              Rewards
            </h3>
            <div className="space-y-1.5">
              {hasRewards ? (
                rewardsFormatted.lines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm font-semibold" style={{ color: line.muted ? "var(--totk-grey-200)" : SECTION_ACCENT.rewards.icon }}>
                    {line.icon && <i aria-hidden className={`fa-solid ${line.icon} text-xs`} />}
                    <span className={line.muted ? "italic" : ""}>{line.text}</span>
                  </div>
                ))
              ) : (
                <span className="text-sm italic text-[var(--totk-grey-200)]">No reward</span>
              )}
            </div>
          </div>

          {quest.participationRequirements && quest.participationRequirements.length > 0 && (
            <div
              className="rounded-lg border-2 p-4"
              style={{ borderColor: SECTION_ACCENT.requirements.border, backgroundColor: SECTION_ACCENT.requirements.bg }}
            >
              <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: SECTION_ACCENT.requirements.icon }}>
                <i aria-hidden className="fa-solid fa-clipboard-check text-sm" />
                Requirements
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {quest.participationRequirements.map((req, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center rounded px-2 py-1 text-xs font-medium text-[var(--totk-ivory)]"
                    style={{ backgroundColor: `${SECTION_ACCENT.requirements.icon}30` }}
                  >
                    {req}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Item rewards */}
        {quest.itemRewards && quest.itemRewards.length > 0 && (
          <div
            className="rounded-lg border-2 p-4"
            style={{ borderColor: SECTION_ACCENT.rewards.border, backgroundColor: SECTION_ACCENT.rewards.bg }}
          >
            <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: SECTION_ACCENT.rewards.icon }}>
              <i aria-hidden className="fa-solid fa-gift text-sm" />
              Item rewards
            </h3>
            <ul className="space-y-1.5">
              {quest.itemRewards.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm font-medium text-[var(--totk-ivory)]">
                  <span style={{ color: SECTION_ACCENT.rewards.icon }}>•</span>
                  <span>{item.quantity > 1 ? `${item.name} × ${item.quantity}` : item.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Rules — distinct accent */}
        {quest.rules && quest.rules.length > 0 && (
          <div
            className="rounded-lg border-2 p-4"
            style={{ borderColor: SECTION_ACCENT.rules.border, backgroundColor: SECTION_ACCENT.rules.bg }}
          >
            <h3 className="mb-2.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: SECTION_ACCENT.rules.icon }}>
              <i aria-hidden className="fa-solid fa-gavel text-sm" />
              Rules
            </h3>
            <ul className="space-y-1.5">
              {quest.rules.map((rule, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm leading-relaxed text-[var(--botw-pale)]">
                  <span className="mt-1.5 shrink-0 text-xs" style={{ color: typeStyle.color }}>•</span>
                  <span>{renderDiscordInline(rule)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Special Note */}
        {quest.specialNote && (
          <div
            className="rounded-lg border-2 p-4"
            style={{ borderColor: SECTION_ACCENT.specialNote.border, backgroundColor: SECTION_ACCENT.specialNote.bg }}
          >
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: SECTION_ACCENT.specialNote.icon }}>
              <i aria-hidden className="fa-solid fa-star text-sm" />
              Special Note
            </h3>
            <p className="text-sm leading-relaxed text-[var(--botw-pale)]">{quest.specialNote}</p>
          </div>
        )}

        {/* Participants list */}
        {quest.participants && quest.participants.length > 0 && (
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: SECTION_ACCENT.participantsList.icon }}>
              <i aria-hidden className="fa-solid fa-users text-sm" />
              Participants ({quest.participants.length})
            </h3>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {quest.participants.map((participant, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 rounded-lg border-2 px-3 py-2"
                  style={{ borderColor: SECTION_ACCENT.participantsList.border, backgroundColor: SECTION_ACCENT.participantsList.bg }}
                >
                  <span className="truncate text-sm font-medium text-[var(--totk-ivory)]">{participant.name}</span>
                  <span
                    className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      color: participantStatusColors[participant.status],
                      backgroundColor: `${participantStatusColors[participant.status]}20`,
                    }}
                  >
                    <i
                      aria-hidden
                      className={clsx("fa-solid text-[10px]", participant.status === "Active" ? "fa-circle-dot" : "fa-circle-check")}
                    />
                    <span className="whitespace-nowrap">
                      {participant.status}
                      {quest.type === "RP" && typeof participant.rpPostCount === "number" && (
                        <span>
                          {requiredRpPosts != null ? ` • ${participant.rpPostCount}/${requiredRpPosts}` : ` • ${participant.rpPostCount} posts`}
                        </span>
                      )}
                      {quest.type === "Interactive" && typeof participant.rollCount === "number" && (
                        <span>
                          {isBlupeeQuest
                            ? ` • ${participant.rollCount} caught`
                            : requiredRolls != null
                              ? ` • ${participant.rollCount}/${requiredRolls} rolls`
                              : ` • ${participant.rollCount} rolls`}
                        </span>
                      )}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
