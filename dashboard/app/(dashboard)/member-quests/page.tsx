"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";

const QUEST_TYPES = ["RP", "Interactive", "Art", "Writing"] as const;
const VILLAGES = ["Rudania", "Inariko", "Vhintl"] as const;

function locationsToSet(locations: string): Set<string> {
  if (!locations.trim()) return new Set();
  if (locations.trim().toUpperCase() === "ALL")
    return new Set(VILLAGES);
  return new Set(
    locations.split(",").map((s) => s.trim()).filter(Boolean)
  );
}

function setToLocations(v: Set<string>): string {
  if (v.size === 0) return "";
  if (v.size === VILLAGES.length) return "ALL";
  return Array.from(v).sort().join(", ");
}

type Proposal = {
  _id: string;
  title: string;
  status: string;
  rejectReason?: string | null;
  revisionReason?: string | null;
  approvedQuestId?: string | null;
  createdAt: string;
  type?: string;
  locations?: string;
  date?: string;
  timeLimit?: string;
  timePerRound?: string;
  specialEquipment?: string;
  rewards?: string;
  partySize?: string;
  signUpFormLink?: string;
  signupDeadline?: string;
  questDescription?: string;
  questSummary?: string;
  gameplayDescription?: string;
  gameRules?: string;
  runningEventDescription?: string;
  postRequirement?: number | null;
  collabAllowed?: boolean;
  collabRule?: string;
  artWritingMode?: string;
  tableRollName?: string;
  requiredRolls?: number | null;
  minRequirements?: string | number | null;
};

const MEMBER_TIME_LIMIT_PRESETS = ["1 week", "2 weeks", "7 days", "14 days"] as const;
const MAX_DURATION_DAYS = 14;

/** Format YYYY-MM-DD to "Mar 15, 2026"; pass-through for other strings */
function formatDateDisplay(dateStr: string | undefined): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return dateStr ?? "";
  const d = new Date(dateStr + "T12:00:00");
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getDefaultStartDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Normalize to YYYY-MM-DD for <input type="date">. Handles ISO strings and existing YYYY-MM-DD. */
function toDateOnly(value: unknown): string {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const formDefaults = {
  title: "",
  locations: "",
  date: getDefaultStartDate(),
  timeLimit: "1 week",
  timeLimitCustom: "",
  timePerRound: "",
  type: "",
  specialEquipment: "",
  rewards: "",
  partySize: "",
  signUpFormLink: "",
  signupDeadline: "",
  postRequirement: "",
  collabAllowed: false,
  collabRule: "",
  artWritingMode: "both" as "both" | "either",
  tableRollName: "",
  requiredRolls: "",
  minRequirements: "",
  questDescription: "",
  questSummary: "",
  gameplayDescription: "",
  gameRules: "",
  runningEventDescription: "",
};

function proposalToForm(p: Proposal): typeof formDefaults {
  const presets = ["1 week", "2 weeks", "7 days", "14 days"];
  const t = (p.timeLimit ?? "").trim();
  const timeLimit = presets.includes(t) ? t : t ? "Custom" : "1 week";
  const timeLimitCustom = timeLimit === "Custom" ? t : "";
  return {
    ...formDefaults,
    title: p.title ?? "",
    locations: p.locations ?? "",
    date: toDateOnly(p.date) || getDefaultStartDate(),
    timeLimit,
    timeLimitCustom,
    timePerRound: p.timePerRound ?? "",
    type: p.type ?? "",
    specialEquipment: p.specialEquipment ?? "",
    rewards: p.rewards ?? "",
    partySize: p.partySize ?? "",
    signUpFormLink: p.signUpFormLink ?? "",
    signupDeadline: toDateOnly(p.signupDeadline),
    postRequirement: p.postRequirement != null ? String(p.postRequirement) : "",
    collabAllowed: Boolean(p.collabAllowed),
    collabRule: p.collabRule ?? "",
    artWritingMode: (p.artWritingMode === "either" ? "either" : "both") as "both" | "either",
    tableRollName: p.tableRollName ?? "",
    requiredRolls: p.requiredRolls != null ? String(p.requiredRolls) : "",
    minRequirements: p.minRequirements != null ? String(p.minRequirements) : "",
    questDescription: p.questDescription ?? "",
    questSummary: p.questSummary ?? "",
    gameplayDescription: p.gameplayDescription ?? "",
    gameRules: p.gameRules ?? "",
    runningEventDescription: p.runningEventDescription ?? "",
  };
}

export default function MemberQuestsPage() {
  const { user, loading: sessionLoading } = useSession();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(formDefaults);
  const [submitting, setSubmitting] = useState(false);
  const [editingProposalId, setEditingProposalId] = useState<string | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/member-quests", { cache: "no-store", credentials: "include" });
      if (!res.ok) {
        setError("Failed to load your proposals");
        setProposals([]);
        return;
      }
      const data = await res.json();
      setProposals(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) fetchProposals();
    else setLoading(false);
  }, [user?.id, fetchProposals]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user?.id) {
      setError("You must be logged in to submit.");
      return;
    }
    if (!form.title.trim()) {
      setError("Quest title is required.");
      return;
    }
    if (!form.date.trim()) {
      setError("Start date is required.");
      return;
    }
    const effectiveTimeLimit = form.timeLimit === "Custom" ? form.timeLimitCustom.trim() : form.timeLimit;
    if (!effectiveTimeLimit) {
      setError("Duration is required.");
      return;
    }
    const daysMatch = effectiveTimeLimit.match(/(\d+)\s*(day|week)/i);
    const days = daysMatch
      ? (daysMatch[2].toLowerCase() === "week" ? parseInt(daysMatch[1], 10) * 7 : parseInt(daysMatch[1], 10))
      : 0;
    if (days < 1 || days > MAX_DURATION_DAYS) {
      setError(`Duration must be 1–${MAX_DURATION_DAYS} days (max 2 weeks).`);
      return;
    }
    if (!form.questSummary.trim()) {
      setError("Summary (what will happen) is required.");
      return;
    }
    if (!form.gameplayDescription.trim()) {
      setError("Gameplay (how it works) is required.");
      return;
    }
    if (!form.runningEventDescription.trim()) {
      setError("Running the event (how you'll run it) is required.");
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        timeLimit: form.timeLimit === "Custom" ? form.timeLimitCustom.trim() : form.timeLimit,
      };
      const url = editingProposalId ? `/api/member-quests/${editingProposalId}` : "/api/member-quests";
      const method = editingProposalId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || "Failed to submit");
      }
      setForm(formDefaults);
      setEditingProposalId(null);
      await fetchProposals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-lg px-3 py-2.5 transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)] focus:border-transparent";
  const inputStyle = {
    background: "rgba(26, 22, 21, 0.9)",
    border: "1px solid var(--totk-dark-ocher)",
    color: "#f5f0e6",
  } as const;
  const labelClass = "block text-sm font-semibold mb-1.5";
  const labelStyle = { color: "#f5f0e6" } as const;
  const helpStyle = { color: "#b8b0a8", fontSize: "0.75rem" } as const;
  const sectionIntroStyle = { color: "#b8b0a8", fontSize: "0.75rem" } as const;

  if (sessionLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loading message="Loading..." variant="inline" size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="mb-4 text-xl font-bold text-[var(--totk-light-ocher)]">Member Quests</h1>
          <p className="text-[var(--botw-pale)]">Please log in to submit or view your quest proposals.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[900px] space-y-8">
        {/* Header */}
        <div className="flex items-center justify-center gap-2 sm:gap-4">
          <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
          <h1 className="text-center text-xl font-bold text-[var(--totk-light-ocher)] sm:text-2xl md:text-3xl">
            Member Quests
          </h1>
          <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
        </div>

        {/* Info blurb */}
        <div
          className="rounded-xl p-5 backdrop-blur-sm"
          style={{
            background: "rgba(32, 36, 44, 0.72)",
            border: "1px solid var(--totk-dark-ocher)",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
          }}
        >
          <p className="text-sm leading-relaxed text-[var(--botw-pale)]">
            You can propose your own quest to run for the community. Mods will review your idea and, if approved,
            the quest will be created and you will run it. <strong className="text-[var(--totk-ivory)]">Any rewards must come from your own inventory</strong>;
            the mod team does not supply tokens or items. Member quests count toward spirit orbs and character slots
            when completed successfully. Maximum duration is <strong className="text-[var(--totk-ivory)]">2 weeks</strong>.
          </p>
        </div>

        {error && (
          <div
            className="flex items-center gap-2 rounded-xl p-4"
            style={{
              background: "rgba(231, 76, 60, 0.12)",
              border: "1px solid rgba(231, 76, 60, 0.4)",
              color: "#f87171",
            }}
          >
            <i className="fas fa-exclamation-circle shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <div
          className="rounded-xl p-6 backdrop-blur-sm"
          style={{
            background: "rgba(32, 36, 44, 0.72)",
            border: "1px solid var(--totk-dark-ocher)",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
          }}
        >
          {editingProposalId && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3">
              <p className="text-sm text-amber-200">
                <strong>Editing your proposal.</strong> Make your changes below and click Resubmit to send it back for review.
              </p>
              <button
                type="button"
                onClick={() => { setEditingProposalId(null); setForm(formDefaults); }}
                className="shrink-0 rounded border border-amber-500/60 bg-amber-500/20 px-3 py-1.5 text-sm font-medium text-amber-200 hover:bg-amber-500/30"
              >
                Cancel edit
              </button>
            </div>
          )}
          <h2 className="mb-6 text-lg font-semibold text-[var(--totk-light-ocher)]">
            {editingProposalId ? "Edit and resubmit your proposal" : "Submit a quest proposal"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basics — shown to players when quest is posted */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Basics</h3>
                <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs font-medium text-emerald-200">Shown to players</span>
              </div>
              <p style={sectionIntroStyle}>Title, description, and core details. These appear on the quest post when it goes live.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass} style={labelStyle}>Title *</label>
                  <input
                    type="text"
                    className={inputClass}
                    style={inputStyle}
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Treasure Hunt in Rudania"
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} style={labelStyle}>Description *</label>
                  <p className="mb-1.5" style={helpStyle}>Main quest text shown to players when the quest is posted. Write a clear hook and what the quest is about.</p>
                  <textarea
                    className={`${inputClass} min-h-[120px] resize-y`}
                    style={{ ...inputStyle, minHeight: "120px" }}
                    value={form.questDescription}
                    onChange={(e) => setForm((f) => ({ ...f, questDescription: e.target.value }))}
                    placeholder="Encourage people to join – describe the quest, what players will do, and why it’s fun."
                    required
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Quest type *</label>
                  <select
                    className={inputClass}
                    style={inputStyle}
                    value={form.type}
                    onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  >
                    <option value="">—</option>
                    {QUEST_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} style={labelStyle}>Location *</label>
                  <div className="flex flex-wrap gap-3">
                    {VILLAGES.map((village) => {
                      const checked = locationsToSet(form.locations).has(village);
                      return (
                        <label
                          key={village}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 transition-colors ${
                            checked
                              ? "bg-[var(--totk-light-ocher)]/20 text-[var(--totk-light-ocher)] border border-[var(--totk-light-ocher)]/50"
                            : "border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/60 hover:border-[var(--totk-grey-500)]"
                        }`}
                        style={checked ? undefined : { color: "#b8b0a8" }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              const set = locationsToSet(form.locations);
                              if (set.has(village)) set.delete(village);
                              else set.add(village);
                              setForm((f) => ({ ...f, locations: setToLocations(set) }));
                            }}
                            className="sr-only"
                          />
                          <span className="text-sm font-medium">{village}</span>
                        </label>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          locations: locationsToSet(f.locations).size === VILLAGES.length ? "" : "ALL",
                        }))
                      }
                      className="rounded-lg px-3 py-2 text-xs font-medium hover:bg-[var(--totk-dark-ocher)]/30 hover:opacity-90"
                    style={{ color: "#b8b0a8" }}
                    >
                      {locationsToSet(form.locations).size === VILLAGES.length ? "Clear all" : "Select all"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Schedule & participation — shown to players */}
            <div className="space-y-4 border-t border-[var(--totk-dark-ocher)]/50 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Schedule & participation</h3>
                <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs font-medium text-emerald-200">Shown to players</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} style={labelStyle}>Start date *</label>
                  <input
                    type="date"
                    className={inputClass}
                    style={inputStyle}
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Duration * (max 2 weeks)</label>
                  <select
                    className={inputClass}
                    style={inputStyle}
                    value={form.timeLimit}
                    onChange={(e) => setForm((f) => ({ ...f, timeLimit: e.target.value }))}
                  >
                    {MEMBER_TIME_LIMIT_PRESETS.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                    <option value="Custom">Custom (1–14 days)</option>
                  </select>
                  {form.timeLimit === "Custom" && (
                    <input
                      type="text"
                      className={`${inputClass} mt-2`}
                      style={inputStyle}
                      value={form.timeLimitCustom}
                      onChange={(e) => setForm((f) => ({ ...f, timeLimitCustom: e.target.value }))}
                      placeholder="e.g. 10 days"
                    />
                  )}
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Sign-up deadline</label>
                  <input
                    type="date"
                    className={inputClass}
                    style={inputStyle}
                    value={form.signupDeadline}
                    onChange={(e) => setForm((f) => ({ ...f, signupDeadline: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Time per round (optional)</label>
                  <input
                    type="text"
                    className={inputClass}
                    style={inputStyle}
                    value={form.timePerRound}
                    onChange={(e) => setForm((f) => ({ ...f, timePerRound: e.target.value }))}
                    placeholder="e.g. 15 minutes"
                  />
                </div>
                <div>
                  <label className={labelClass} style={labelStyle}>Participation cap (optional)</label>
                  <p className="mb-1" style={helpStyle}>Max number of participants. Leave blank for no limit.</p>
                  <input
                    type="text"
                    className={inputClass}
                    style={inputStyle}
                    value={form.partySize}
                    onChange={(e) => setForm((f) => ({ ...f, partySize: e.target.value }))}
                    placeholder="e.g. 6"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} style={labelStyle}>Participation requirement (optional)</label>
                  <p className="mb-1" style={helpStyle}>Number or text (e.g. minimum posts or special conditions).</p>
                  <input
                    type="text"
                    className={inputClass}
                    style={inputStyle}
                    value={form.minRequirements ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, minRequirements: e.target.value }))}
                    placeholder="e.g. 0, 15, or a short description"
                  />
                </div>
                {form.type === "RP" && (
                  <div>
                    <label className={labelClass} style={labelStyle}>Post requirement</label>
                    <p className="mb-1" style={helpStyle}>Number of posts required to complete.</p>
                    <input
                      type="number"
                      min={0}
                      className={inputClass}
                      style={inputStyle}
                      value={form.postRequirement}
                      onChange={(e) => setForm((f) => ({ ...f, postRequirement: e.target.value }))}
                      placeholder="e.g. 15"
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <label className={labelClass} style={labelStyle}>Special equipment (optional)</label>
                  <input
                    type="text"
                    className={inputClass}
                    style={inputStyle}
                    value={form.specialEquipment}
                    onChange={(e) => setForm((f) => ({ ...f, specialEquipment: e.target.value }))}
                    placeholder="e.g. Dice Roller"
                  />
                </div>
              </div>
            </div>

            {/* Rewards & sign-up — shown to players */}
            <div className="space-y-4 border-t border-[var(--totk-dark-ocher)]/50 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Rewards & sign-up</h3>
                <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs font-medium text-emerald-200">Shown to players</span>
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Rewards (from your own inventory)</label>
                <p className="mb-1" style={helpStyle}>What you are offering. Mods do not supply tokens or items for member quests.</p>
                <input
                  type="text"
                  className={inputClass}
                  style={inputStyle}
                  value={form.rewards}
                  onChange={(e) => setForm((f) => ({ ...f, rewards: e.target.value }))}
                  placeholder="e.g. 2 pennies, 1 rare item"
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Sign-up form link (optional)</label>
                <p className="mb-1" style={helpStyle}>Leave blank to use normal quest sign-up (Discord/dashboard). Or add a link (e.g. Google Form) for external sign-up.</p>
                <input
                  type="url"
                  className={inputClass}
                  style={inputStyle}
                  value={form.signUpFormLink}
                  onChange={(e) => setForm((f) => ({ ...f, signUpFormLink: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
            </div>

            {/* Rules and collab — shown to players */}
            <div className="space-y-4 border-t border-[var(--totk-dark-ocher)]/50 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Rules and collab</h3>
                <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs font-medium text-emerald-200">Shown to players</span>
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Rules</label>
                <p className="mb-1" style={helpStyle}>Rules and expectations shown to players. For RP: post rules. For others: dos and don’ts. Markdown supported (**bold**, - list).</p>
                <textarea
                  className={`${inputClass} min-h-[100px] resize-y`}
                  style={{ ...inputStyle, minHeight: "100px" }}
                  value={form.gameRules}
                  onChange={(e) => setForm((f) => ({ ...f, gameRules: e.target.value }))}
                  placeholder="e.g. - Post at least once per round - No godmoding - Collabs count as one entry"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.collabAllowed}
                  onChange={(e) => setForm((f) => ({ ...f, collabAllowed: e.target.checked }))}
                  className="h-4 w-4 rounded border-[var(--totk-dark-ocher)] text-[var(--totk-light-ocher)] focus:ring-[var(--totk-light-ocher)]"
                />
                <span className="text-sm font-medium text-[var(--totk-ivory)]">Collab allowed</span>
              </label>
              {form.collabAllowed && (
                <div>
                  <label className={labelClass} style={labelStyle}>Collab rule (display text)</label>
                  <p className="mb-1" style={helpStyle}>Shown to players (e.g. max tokens with collab).</p>
                  <input
                    type="text"
                    className={inputClass}
                    style={inputStyle}
                    value={form.collabRule}
                    onChange={(e) => setForm((f) => ({ ...f, collabRule: e.target.value }))}
                    placeholder="e.g. Max 2 people per submission"
                  />
                </div>
              )}
              {(form.type === "Art" || form.type === "Writing" || form.type === "Art / Writing") && (
                <div>
                  <label className={labelClass} style={labelStyle}>Art / Writing mode</label>
                  <select
                    className={inputClass}
                    style={inputStyle}
                    value={form.artWritingMode}
                    onChange={(e) => setForm((f) => ({ ...f, artWritingMode: e.target.value as "both" | "either" }))}
                  >
                    <option value="both">Require both art and writing</option>
                    <option value="either">Accept art OR writing</option>
                  </select>
                </div>
              )}
              {form.type === "Interactive" && (
                <div className="space-y-2">
                  <p style={helpStyle}>
                    <strong style={{ color: "#c9c2b8" }}>Interactive quests:</strong> You must submit the tableroll table to the mod team (full table definition) so they can add it for the quest.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className={labelClass} style={labelStyle}>Table roll name</label>
                      <input
                        type="text"
                        className={inputClass}
                        style={inputStyle}
                        value={form.tableRollName}
                        onChange={(e) => setForm((f) => ({ ...f, tableRollName: e.target.value }))}
                        placeholder="e.g. Fishing table"
                      />
                    </div>
                    <div>
                      <label className={labelClass} style={labelStyle}>Required successful rolls</label>
                      <input
                        type="number"
                        min={1}
                        className={inputClass}
                        style={inputStyle}
                        value={form.requiredRolls}
                        onChange={(e) => setForm((f) => ({ ...f, requiredRolls: e.target.value }))}
                        placeholder="1"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Notes for mods — mods only */}
            <div className="space-y-4 border-t border-[var(--totk-dark-ocher)]/50 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Notes for mods</h3>
                <span className="rounded bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-200">Mods only – not shown to players</span>
              </div>
              <p style={sectionIntroStyle}>
                For moderator review only. These fields help mods understand and approve your quest. They are never posted or shown to players.
              </p>
              <div>
                <label className={labelClass} style={labelStyle}>Summary (what will happen) <span className="text-amber-400">*</span></label>
                <p className="mb-1" style={helpStyle}>Brief overview of the quest flow for mod review.</p>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-y`}
                  style={{ ...inputStyle, minHeight: "80px" }}
                  value={form.questSummary}
                  onChange={(e) => setForm((f) => ({ ...f, questSummary: e.target.value }))}
                  placeholder="e.g. Week 1: sign-ups and intro post. Week 2: main activity and wrap-up."
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Gameplay (how it works) <span className="text-amber-400">*</span></label>
                <p className="mb-1" style={helpStyle}>How the quest works mechanically – for mods.</p>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-y`}
                  style={{ ...inputStyle, minHeight: "80px" }}
                  value={form.gameplayDescription}
                  onChange={(e) => setForm((f) => ({ ...f, gameplayDescription: e.target.value }))}
                  placeholder="e.g. Players roll once per day; first to 3 successes wins."
                />
              </div>
              <div>
                <label className={labelClass} style={labelStyle}>Running the event (how you’ll run it) <span className="text-amber-400">*</span></label>
                <p className="mb-1" style={helpStyle}>What mods need to know (e.g. when you’ll post, what you need from them).</p>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-y`}
                  style={{ ...inputStyle, minHeight: "80px" }}
                  value={form.runningEventDescription}
                  onChange={(e) => setForm((f) => ({ ...f, runningEventDescription: e.target.value }))}
                  placeholder="e.g. I’ll post the intro Monday; I need the tableroll added before start."
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-[var(--totk-dark-ocher)]/50 pt-6">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-[var(--totk-light-green)] px-5 py-2.5 font-semibold text-black shadow-md transition hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? (editingProposalId ? "Resubmitting…" : "Submitting…") : editingProposalId ? "Resubmit proposal" : "Submit proposal"}
              </button>
              <button
                type="button"
                onClick={() => { setForm(formDefaults); setEditingProposalId(null); }}
                className="rounded-lg border border-[var(--totk-dark-ocher)] px-5 py-2.5 font-medium text-[var(--botw-pale)] transition hover:bg-[var(--totk-dark-ocher)]/30"
              >
                {editingProposalId ? "Cancel edit" : "Reset form"}
              </button>
            </div>
          </form>
        </div>

        {/* My submissions */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-[var(--totk-light-ocher)]">My submissions</h2>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loading message="Loading..." variant="inline" size="lg" />
            </div>
          ) : proposals.length === 0 ? (
            <div
              className="rounded-xl p-10 text-center text-[var(--totk-grey-400)]"
              style={{
                background: "rgba(32, 36, 44, 0.5)",
                border: "1px dashed var(--totk-dark-ocher)",
              }}
            >
              You have not submitted any quest proposals yet.
            </div>
          ) : (
            <div className="space-y-4">
              {proposals.map((p) => (
                <div
                  key={p._id}
                  className="rounded-xl p-5 transition"
                  style={{
                    background: "rgba(32, 36, 44, 0.72)",
                    border: "1px solid var(--totk-dark-ocher)",
                    boxShadow: "0 2px 12px rgba(0, 0, 0, 0.15)",
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="font-semibold text-[var(--totk-ivory)]">{p.title}</h3>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                        p.status === "approved"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : p.status === "rejected"
                            ? "bg-red-500/20 text-red-300"
                            : p.status === "needs_revision"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-[var(--totk-light-ocher)]/15 text-[var(--totk-light-ocher)]"
                      }`}
                    >
                      {p.status === "needs_revision" ? "Needs revision" : p.status}
                    </span>
                  </div>
                  {(p.locations || p.type || p.date || p.timeLimit) && (
                    <p className="mt-2 text-sm text-[var(--totk-grey-300)]">
                      {[p.locations, p.type, p.date ? formatDateDisplay(p.date) : null, p.timeLimit].filter(Boolean).join(" · ")}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-[var(--totk-grey-500)]">
                    Submitted {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                  {p.status === "needs_revision" && (
                    <>
                      {p.revisionReason && (
                        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-200 whitespace-pre-wrap">
                          <strong>Mod feedback:</strong> {p.revisionReason}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          setError(null);
                          setLoadingEditId(p._id);
                          try {
                            const res = await fetch(`/api/member-quests/${p._id}`, { credentials: "include" });
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({}));
                              setError(data.error || data.message || "Failed to load proposal");
                              return;
                            }
                            const proposal = await res.json();
                            setForm(proposalToForm(proposal));
                            setEditingProposalId(p._id);
                          } catch {
                            setError("Failed to load proposal for editing");
                          } finally {
                            setLoadingEditId(null);
                          }
                        }}
                        disabled={loadingEditId === p._id}
                        className="mt-3 rounded-lg bg-amber-500/20 border border-amber-500/50 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/30 disabled:opacity-60"
                      >
                        {loadingEditId === p._id ? "Loading…" : "Edit and resubmit"}
                      </button>
                    </>
                  )}
                  {p.status === "rejected" && p.rejectReason && (
                    <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
                      {p.rejectReason}
                    </p>
                  )}
                  {p.status === "approved" && p.approvedQuestId && (
                    <p className="mt-3 text-sm text-emerald-400">
                      Quest created: <span className="font-medium">{p.approvedQuestId}</span>. It has been posted to the quest channel.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
