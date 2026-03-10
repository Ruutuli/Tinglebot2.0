"use client";

import { useState } from "react";

export type QuestParticipantData = {
  userId: string;
  characterName: string;
  progress?: string;
  joinedAt?: string | Date | null;
  leftAt?: string | Date | null;
  completedAt?: string | Date | null;
  rewardedAt?: string | Date | null;
  rpPostCount?: number;
  successfulRolls?: number;
  tokensEarned?: number;
  modNotes?: string | null;
  requiredVillage?: string | null;
  disqualifiedAt?: string | Date | null;
  disqualificationReason?: string | null;
  submissions?: Array<{ type: string; url?: string; approved?: boolean }>;
  [key: string]: unknown;
};

type QuestParticipantsFieldProps = {
  label: string;
  value: Record<string, QuestParticipantData>;
  onChange: (value: Record<string, QuestParticipantData>) => void;
  helpText?: string;
  isChanged?: boolean;
  error?: string;
};

function toDateStr(v: string | Date | null | undefined): string {
  if (v == null) return "";
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString().split("T")[0]! : "";
  }
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString().split("T")[0]!;
  return "";
}

function fromDateStr(s: string): string | null {
  if (!s || !s.trim()) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

// Completed and rewarded are the same: we only expose "Completed" in the UI; legacy DB may still have "rewarded"
const PROGRESS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "disqualified", label: "Disqualified" },
];

const PROGRESS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  active: { bg: "bg-blue-500/20", text: "text-blue-300", border: "border-blue-500/50" },
  completed: { bg: "bg-emerald-500/20", text: "text-emerald-300", border: "border-emerald-500/50" },
  rewarded: { bg: "bg-emerald-500/20", text: "text-emerald-300", border: "border-emerald-500/50" }, // legacy; same as completed
  failed: { bg: "bg-amber-500/20", text: "text-amber-300", border: "border-amber-500/50" },
  disqualified: { bg: "bg-red-500/20", text: "text-red-300", border: "border-red-500/50" },
};

const inputClass =
  "w-full px-2.5 py-1.5 bg-[var(--botw-black)] border border-[var(--totk-dark-ocher)]/60 rounded text-sm text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-200)]/60 focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-ocher)] focus:border-[var(--totk-light-ocher)]/50";
const labelClass = "text-xs font-medium text-[var(--totk-grey-200)] uppercase tracking-wider block mb-1";

export function QuestParticipantsField({
  label,
  value,
  onChange,
  helpText,
  isChanged,
  error,
}: QuestParticipantsFieldProps) {
  const [newUserId, setNewUserId] = useState("");
  const [newCharacterName, setNewCharacterName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const participants = value || {};
  const entries = Object.entries(participants);
  const count = entries.length;

  const addParticipant = () => {
    const uid = newUserId.trim();
    const name = newCharacterName.trim() || "—";
    if (!uid) return;
    if (participants[uid]) {
      setNewUserId("");
      setNewCharacterName("");
      return;
    }
    onChange({
      ...participants,
      [uid]: {
        userId: uid,
        characterName: name,
        progress: "active",
        joinedAt: new Date().toISOString(),
        rpPostCount: 0,
        successfulRolls: 0,
        tokensEarned: 0,
        submissions: [],
      },
    });
    setNewUserId("");
    setNewCharacterName("");
    setExpandedId(uid);
  };

  const removeParticipant = (userId: string) => {
    const updated = { ...participants };
    delete updated[userId];
    onChange(updated);
    if (expandedId === userId) setExpandedId(null);
  };

  const updateParticipant = (userId: string, updates: Partial<QuestParticipantData>) => {
    const current = participants[userId];
    if (!current) return;
    onChange({
      ...participants,
      [userId]: { ...current, ...updates },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <label className="text-sm font-medium text-[var(--totk-light-ocher)]">{label}</label>
        {count > 0 && (
          <span className="text-xs text-[var(--totk-grey-200)]">
            {count} participant{count !== 1 ? "s" : ""}
          </span>
        )}
        {helpText && (
          <span className="text-xs text-[var(--totk-grey-200)] font-normal">
            <i className="fa-solid fa-circle-info mr-1" aria-hidden="true" />
            {helpText}
          </span>
        )}
        {isChanged && (
          <span className="text-xs text-[var(--totk-light-green)]">
            <i className="fa-solid fa-circle-check mr-1" aria-hidden="true" />
            Changed
          </span>
        )}
      </div>

      {/* Add participant — compact row */}
      <div className="flex flex-wrap gap-2 items-center p-3 rounded-lg bg-[var(--botw-warm-black)]/60 border border-[var(--totk-dark-ocher)]/40">
        <input
          type="text"
          value={newUserId}
          onChange={(e) => setNewUserId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addParticipant())}
          placeholder="Discord user ID"
          className="w-44 px-2.5 py-1.5 bg-[var(--botw-black)] border border-[var(--totk-dark-ocher)]/60 rounded text-sm text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-200)]/60 focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-ocher)]"
        />
        <span className="text-[var(--totk-dark-ocher)]/80">·</span>
        <input
          type="text"
          value={newCharacterName}
          onChange={(e) => setNewCharacterName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addParticipant())}
          placeholder="Character name"
          className="w-36 px-2.5 py-1.5 bg-[var(--botw-black)] border border-[var(--totk-dark-ocher)]/60 rounded text-sm text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-200)]/60 focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-ocher)]"
        />
        <button
          type="button"
          onClick={addParticipant}
          className="px-3 py-1.5 bg-[var(--totk-dark-ocher)] hover:bg-[var(--totk-light-ocher)] text-[var(--botw-pale)] rounded text-sm font-medium transition-colors"
        >
          Add participant
        </button>
      </div>

      {/* Participants list — collapsible cards */}
      {count > 0 ? (
        <div className="space-y-2">
          {entries.map(([userId, p]) => {
            const progress = p.progress ?? "active";
            const style = PROGRESS_STYLES[progress] ?? PROGRESS_STYLES.active;
            const progressLabel = progress === "rewarded" ? "Completed" : (PROGRESS_OPTIONS.find((o) => o.value === progress)?.label ?? progress);
            const isExpanded = expandedId === userId;
            const hasSubmissions = Array.isArray(p.submissions) && p.submissions.length > 0;

            return (
              <div
                key={userId}
                className="rounded-lg border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)] overflow-hidden"
              >
                {/* Card header — always visible */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : userId)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--botw-black)]/40 transition-colors"
                >
                  <i
                    className={`fa-solid fa-chevron-${isExpanded ? "down" : "right"} text-[var(--totk-grey-200)] text-xs w-4 shrink-0`}
                    aria-hidden
                  />
                  <span className="font-medium text-[var(--botw-pale)] truncate min-w-0">
                    {p.characterName || "—"}
                  </span>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium border ${style.bg} ${style.text} ${style.border}`}
                  >
                    {progressLabel}
                  </span>
                  <span className="font-mono text-xs text-[var(--totk-grey-200)] truncate shrink-0 max-w-[8rem]" title={userId}>
                    {userId}
                  </span>
                  {hasSubmissions && (
                    <span className="shrink-0 text-xs text-[var(--totk-grey-200)]">
                      <i className="fa-solid fa-paperclip mr-0.5" aria-hidden /> {p.submissions!.length}
                    </span>
                  )}
                  <span className="ml-auto shrink-0 flex items-center gap-2">
                    {p.tokensEarned != null && p.tokensEarned > 0 && (
                      <span className="text-xs text-[var(--totk-light-ocher)]">{p.tokensEarned} tokens</span>
                    )}
                    <span
                      className="p-1.5 rounded text-red-400/80 hover:text-red-300 hover:bg-red-400/10 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeParticipant(userId);
                      }}
                      aria-label={`Remove ${p.characterName || userId}`}
                    >
                      <i className="fa-solid fa-trash-can text-xs" aria-hidden />
                    </span>
                  </span>
                </button>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 border-t border-[var(--totk-dark-ocher)]/40 space-y-4">
                    {/* Identity */}
                    <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Character name</label>
                        <input
                          type="text"
                          value={p.characterName ?? ""}
                          onChange={(e) => updateParticipant(userId, { characterName: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Progress</label>
                        <select
                          value={progress === "rewarded" ? "completed" : progress}
                          onChange={(e) => updateParticipant(userId, { progress: e.target.value })}
                          className={inputClass}
                        >
                          {PROGRESS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Required village</label>
                        <input
                          type="text"
                          value={p.requiredVillage ?? ""}
                          onChange={(e) => updateParticipant(userId, { requiredVillage: e.target.value || null })}
                          className={inputClass}
                          placeholder="Optional"
                        />
                      </div>
                    </section>

                    {/* Dates */}
                    <section>
                      <h4 className={labelClass + " mb-2"}>Dates</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs text-[var(--totk-grey-200)] block mb-1">Joined</label>
                          <input
                            type="date"
                            value={toDateStr(p.joinedAt)}
                            onChange={(e) => updateParticipant(userId, { joinedAt: fromDateStr(e.target.value) })}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--totk-grey-200)] block mb-1">Completed</label>
                          <input
                            type="date"
                            value={toDateStr(p.completedAt)}
                            onChange={(e) => updateParticipant(userId, { completedAt: fromDateStr(e.target.value) })}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--totk-grey-200)] block mb-1">Disqualified</label>
                          <input
                            type="date"
                            value={toDateStr(p.disqualifiedAt)}
                            onChange={(e) => updateParticipant(userId, { disqualifiedAt: fromDateStr(e.target.value) })}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </section>

                    {/* Stats */}
                    <section>
                      <h4 className={labelClass + " mb-2"}>Stats</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs text-[var(--totk-grey-200)] block mb-1">RP posts</label>
                          <input
                            type="number"
                            min={0}
                            value={p.rpPostCount ?? 0}
                            onChange={(e) => updateParticipant(userId, { rpPostCount: parseInt(e.target.value, 10) || 0 })}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--totk-grey-200)] block mb-1">Successful rolls</label>
                          <input
                            type="number"
                            min={0}
                            value={p.successfulRolls ?? 0}
                            onChange={(e) => updateParticipant(userId, { successfulRolls: parseInt(e.target.value, 10) || 0 })}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-[var(--totk-grey-200)] block mb-1">Tokens earned</label>
                          <input
                            type="number"
                            min={0}
                            value={p.tokensEarned ?? 0}
                            onChange={(e) => updateParticipant(userId, { tokensEarned: parseInt(e.target.value, 10) || 0 })}
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </section>

                    {/* Disqualification */}
                    <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Disqualification reason</label>
                        <input
                          type="text"
                          value={p.disqualificationReason ?? ""}
                          onChange={(e) => updateParticipant(userId, { disqualificationReason: e.target.value || null })}
                          className={inputClass}
                          placeholder="Optional"
                        />
                      </div>
                    </section>

                    {/* Mod notes */}
                    <section>
                      <label className={labelClass}>Mod notes</label>
                      <textarea
                        value={p.modNotes ?? ""}
                        onChange={(e) => updateParticipant(userId, { modNotes: e.target.value || null })}
                        rows={2}
                        className={inputClass + " resize-y min-h-[4rem]"}
                        placeholder="Optional"
                      />
                    </section>

                    {/* Submissions (read-only) */}
                    {hasSubmissions && (
                      <section className="pt-2 border-t border-[var(--totk-dark-ocher)]/40">
                        <h4 className={labelClass + " mb-2"}>Submissions ({p.submissions!.length})</h4>
                        <ul className="space-y-1 text-sm text-[var(--botw-pale)]">
                          {p.submissions!.map((s, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <span className={`shrink-0 w-2 h-2 rounded-full ${s.approved ? "bg-emerald-500" : "bg-amber-500/70"}`} aria-hidden />
                              <span className="truncate">{s.type}{s.url ? ` — ${s.url}` : ""}</span>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="py-6 rounded-lg bg-[var(--botw-warm-black)]/40 border border-dashed border-[var(--totk-dark-ocher)]/40 text-center text-sm text-[var(--totk-grey-200)]">
          No participants yet. Add one above.
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 flex items-center gap-1">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
