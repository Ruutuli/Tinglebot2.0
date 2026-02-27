"use client";

import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";

function formatDateDisplay(dateStr: string | undefined): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return dateStr ?? "";
  const d = new Date(dateStr + "T12:00:00");
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Discord-style embed preview (matches quest post)
const BORDER_IMAGE = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const EMBED_BG = "#2f3136";
const EMBED_BORDER = "#AA916A";
const EMBED_TEXT = "#dcddde";
const EMBED_LABEL = "#b9bbbe";
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const VILLAGE_EMOJIS: Record<string, string> = {
  rudania: "<:rudania:899492917452890142>",
  inariko: "<:inariko:899493009073274920>",
  vhintl: "<:vhintl:899492879205007450>",
};

function formatLocationPreview(location: string): string {
  if (!location?.trim()) return "Not specified";
  const l = location.toLowerCase();
  const parts: string[] = [];
  if (l.includes("rudania")) parts.push(`${VILLAGE_EMOJIS.rudania} Rudania`);
  if (l.includes("inariko")) parts.push(`${VILLAGE_EMOJIS.inariko} Inariko`);
  if (l.includes("vhintl")) parts.push(`${VILLAGE_EMOJIS.vhintl} Vhintl`);
  if (parts.length) return parts.join(", ");
  return location.trim();
}

function proposalDateToYYYYMM(dateStr: string): string {
  const s = (dateStr ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  const monthMatch = s.match(new RegExp(`^(${MONTH_NAMES.join("|")})\\s+(\\d{4})$`, "i"));
  if (monthMatch) {
    const idx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === monthMatch[1].toLowerCase());
    if (idx >= 0) return `${monthMatch[2]}-${String(idx + 1).padStart(2, "0")}`;
  }
  return s;
}

function yyyyMmToDisplay(ym: string): string {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [y, m] = ym.split("-");
  const monthIdx = parseInt(m, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return ym;
  return `${MONTH_NAMES[monthIdx]} ${y}`;
}

function getEndDateFromDuration(startYYYYMM: string, duration: string): Date | null {
  if (!startYYYYMM || !/^\d{4}-\d{2}$/.test(startYYYYMM)) return null;
  const [y, m] = startYYYYMM.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  if (Number.isNaN(start.getTime())) return null;
  const d = String(duration).toLowerCase();
  const weekMatch = d.match(/(\d+)\s*week/);
  const monthMatch = d.match(/(\d+)\s*month/);
  const dayMatch = d.match(/(\d+)\s*day/);
  let end: Date;
  if (weekMatch) {
    end = new Date(start);
    end.setDate(end.getDate() + parseInt(weekMatch[1], 10) * 7);
  } else if (monthMatch) {
    end = new Date(start);
    end.setMonth(end.getMonth() + parseInt(monthMatch[1], 10));
  } else if (dayMatch) {
    end = new Date(start);
    end.setDate(end.getDate() + parseInt(dayMatch[1], 10));
  } else {
    end = new Date(start);
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

function formatEndDateWithTime(d: Date): string {
  const day = d.getDate();
  const ord = day === 1 || day === 21 || day === 31 ? "st" : day === 2 || day === 22 ? "nd" : day === 3 || day === 23 ? "rd" : "th";
  const month = d.toLocaleDateString("en-US", { month: "long" });
  return `${month} ${day}${ord} 11:59 pm`;
}

function formatSignupDeadlineDisplay(signupDeadline: string | undefined): string | null {
  if (signupDeadline == null || String(signupDeadline).trim() === "") return null;
  const s = String(signupDeadline).trim();
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch {
    return s;
  }
}

type Proposal = {
  _id: string;
  title: string;
  submitterUserId: string;
  submitterUsername: string;
  status: string;
  locations?: string;
  date?: string;
  timeLimit?: string;
  timePerRound?: string;
  type?: string;
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
  rejectReason?: string | null;
  approvedQuestId?: string | null;
  createdAt: string;
  updatedAt?: string;
};

/** Renders the proposal as it will appear in the Discord quest post (embed-style). */
function MemberQuestEmbedPreview({ proposal }: { proposal: Proposal }) {
  const title = proposal.title?.trim() || "Quest";
  const description = proposal.questDescription?.trim() || "—";
  const questType = proposal.type ?? "—";
  const questID = "Q000000";
  const locationPreview = formatLocationPreview(proposal.locations ?? "");
  const dateStr = (proposal.date ?? "").trim() || "—";
  const timeLimit = (proposal.timeLimit ?? "").trim() || "—";
  const dateYYYYMM = proposalDateToYYYYMM(dateStr);
  const endDate = dateYYYYMM && /^\d{4}-\d{2}$/.test(dateYYYYMM) && timeLimit ? getEndDateFromDuration(dateYYYYMM, timeLimit) : null;
  const durationDisplay = endDate ? `${timeLimit} | Ends ${formatEndDateWithTime(endDate)}` : timeLimit;
  const dateDisplay = /^\d{4}-\d{2}$/.test(dateStr) ? yyyyMmToDisplay(dateStr) : dateStr.slice(0, 7).match(/^\d{4}-\d{2}$/) ? yyyyMmToDisplay(dateStr.slice(0, 7)) : dateStr;
  const signupDisplay = formatSignupDeadlineDisplay(proposal.signupDeadline);
  const postReq = proposal.postRequirement != null && !Number.isNaN(Number(proposal.postRequirement)) ? Number(proposal.postRequirement) : 15;
  const minReq = proposal.minRequirements != null ? String(proposal.minRequirements).trim() : "";
  const rewardsText = proposal.rewards?.trim() ? `💰 ${proposal.rewards.trim()}` : "💰 Member-supplied (see quest)";
  const cap = proposal.partySize?.trim() ? parseInt(proposal.partySize, 10) : null;
  const rules = proposal.gameRules?.trim() || "—";

  return (
    <div
      className="rounded overflow-hidden text-left w-full"
      style={{ backgroundColor: EMBED_BG, borderLeft: `4px solid ${EMBED_BORDER}` }}
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
            <div><span className="font-semibold">Type:</span> {questType}</div>
            <div><span className="font-semibold">ID:</span> <code className="bg-black/30 px-1 rounded">{questID}</code></div>
            <div><span className="font-semibold">Location:</span> {locationPreview}</div>
            <div><span className="font-semibold">Duration:</span> {durationDisplay}</div>
            <div><span className="font-semibold">Date:</span> {dateDisplay}</div>
            {signupDisplay && <div><span className="font-semibold">Signup deadline:</span> {signupDisplay}</div>}
            <div><span className="font-semibold">Run by:</span> {proposal.submitterUsername || proposal.submitterUserId || "—"}</div>
          </div>
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">🏆 Rewards</span>
          <div style={{ color: EMBED_TEXT }} className="mt-1">{rewardsText}</div>
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">🗓️ Participation</span>
          <div style={{ color: EMBED_TEXT }} className="mt-1 space-y-0.5">
            {cap != null && !Number.isNaN(cap) && <div>👥 Participation cap: {cap}</div>}
            {minReq && minReq !== "0" && <div>📝 Participation Requirement: {minReq}</div>}
            {questType === "RP" && <div>📝 Post requirement: {postReq}</div>}
            {proposal.tableRollName?.trim() && <div>🎲 Table roll: <span className="font-medium">{proposal.tableRollName.trim()}</span></div>}
            {!cap && !minReq && questType !== "RP" && !proposal.tableRollName?.trim() && <div>—</div>}
          </div>
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">📋 Rules</span>
          <div style={{ color: EMBED_TEXT }} className="mt-1 [&_ul]:list-disc [&_ul]:pl-4 [&_p]:my-0.5">
            {rules !== "—" ? <ReactMarkdown>{rules}</ReactMarkdown> : "—"}
          </div>
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">🎯 Join This Quest</span>
          <div style={{ color: EMBED_TEXT }} className="mt-1 font-mono text-xs">/quest join questid:{questID}</div>
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">👥 Participants (0)</span>
          <div style={{ color: EMBED_TEXT }} className="mt-0.5">None</div>
        </div>

        <div className="text-sm">
          <span style={{ color: EMBED_LABEL }} className="font-semibold underline">📊 Recent Activity</span>
          <div style={{ color: EMBED_TEXT }} className="mt-0.5">—</div>
        </div>
      </div>

      <div className="w-full overflow-hidden">
        <img src={BORDER_IMAGE} alt="" className="w-full h-auto object-cover block" />
      </div>
      <div className="px-3 py-1.5 text-[10px]" style={{ color: EMBED_LABEL }}>
        Member quest
      </div>
    </div>
  );
}

export default function AdminMemberQuestProposalsPage() {
  const { user, isAdmin, isModerator, loading: sessionLoading } = useSession();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [viewingProposal, setViewingProposal] = useState<Proposal | null>(null);

  const canAccess = isAdmin || isModerator;

  const fetchProposals = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const url =
        statusFilter === "all"
          ? "/api/admin/member-quest-proposals"
          : `/api/admin/member-quest-proposals?status=${encodeURIComponent(statusFilter)}`;
      const res = await fetch(url, { cache: "no-store", credentials: "include" });
      if (!res.ok) {
        setError("Failed to load proposals");
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
  }, [canAccess, statusFilter]);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const handleApprove = useCallback(
    async (proposalId: string) => {
      setActionId(proposalId);
      setError(null);
      try {
        const res = await fetch(`/api/admin/member-quest-proposals/${proposalId}/approve`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to approve");
          return;
        }
        await fetchProposals();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setActionId(null);
      }
    },
    [fetchProposals]
  );

  const handleReject = useCallback(
    async (proposalId: string) => {
      const reason = window.prompt("Rejection reason (optional):");
      setActionId(proposalId);
      setError(null);
      try {
        const res = await fetch(`/api/admin/member-quest-proposals/${proposalId}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason ?? "" }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to reject");
          return;
        }
        await fetchProposals();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setActionId(null);
      }
    },
    [fetchProposals]
  );

  if (sessionLoading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loading message="Loading..." variant="inline" size="lg" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-full p-4 sm:p-6 md:p-8">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="mb-4 text-xl font-bold text-[var(--totk-light-ocher)]">Access Denied</h1>
          <p className="text-[var(--botw-pale)]">
            You must be a moderator or admin to access member quest proposals.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-6 flex items-center justify-center gap-2 sm:gap-4">
          <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
          <h1 className="text-center text-xl font-bold text-[var(--totk-light-ocher)] sm:text-2xl md:text-3xl">
            Member Quest Proposals
          </h1>
          <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
        </div>

        <p className="mb-6 text-center text-sm text-[var(--botw-pale)]">
          Members submit quest ideas from the Member Quests page. Approve to create a quest (draft) that the member will run; reject to decline with an optional reason.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-[var(--botw-pale)]">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-2 py-1 text-[var(--totk-ivory)]"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>
          </label>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-center text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loading message="Loading proposals..." variant="inline" size="lg" />
          </div>
        ) : proposals.length === 0 ? (
          <div className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-12 text-center">
            <p className="text-[var(--botw-pale)]">
              No {statusFilter === "all" ? "" : statusFilter}{" "}proposals.
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {proposals.map((p) => (
              <article
                key={p._id}
                role="button"
                tabIndex={0}
                onClick={() => setViewingProposal(p)}
                onKeyDown={(e) => e.key === "Enter" && setViewingProposal(p)}
                className="rounded-xl border border-[var(--totk-dark-ocher)] overflow-hidden transition-colors hover:border-[var(--totk-mid-ocher)] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50 focus:ring-offset-2 focus:ring-offset-[var(--botw-warm-black)]"
                style={{ background: "#3a3230" }}
              >
                <div className="p-5">
                  {/* Header row: title + status */}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="text-lg font-bold leading-tight" style={{ color: "#e8d5a3" }}>
                      {p.title}
                    </h2>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${
                        p.status === "approved"
                          ? "bg-green-900/40 text-green-200"
                          : p.status === "rejected"
                            ? "bg-red-900/40 text-red-200"
                            : "bg-amber-900/30 text-amber-200"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>

                  {/* Meta: one clean line */}
                  <p className="mt-2 text-sm" style={{ color: "#b8b0a8" }}>
                    {p.submitterUsername || p.submitterUserId}
                    {(() => {
                      const parts = [p.type, p.locations, p.date ? formatDateDisplay(p.date) : null, p.timeLimit].filter(Boolean).filter((s) => s !== "—");
                      return parts.length > 0 ? <> · {parts.join(" · ")}</> : null;
                    })()}
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "#8a8380" }}>
                    Submitted {new Date(p.createdAt).toLocaleString()}
                  </p>

                  {/* Description preview */}
                  {p.questDescription && (
                    <div className="mt-4 rounded-lg border p-3" style={{ background: "#2d2624", borderColor: "rgba(191,139,55,0.25)" }}>
                      <p className="text-sm leading-relaxed line-clamp-2 whitespace-pre-wrap" style={{ color: "#f5f0e6" }}>
                        {p.questDescription}
                      </p>
                    </div>
                  )}

                  {/* Quick info line only if any present */}
                  {(p.timePerRound || p.rewards || p.partySize || p.specialEquipment) && (
                    <p className="mt-3 text-xs" style={{ color: "#b8b0a8" }}>
                      {[p.timePerRound && `Time/round: ${p.timePerRound}`, p.rewards && `Rewards: ${p.rewards}`, p.partySize && `Party: ${p.partySize}`, p.specialEquipment && `Equipment: ${p.specialEquipment}`].filter(Boolean).join(" · ")}
                    </p>
                  )}

                  {/* View full details hint */}
                  <p className="mt-3 text-sm">
                    <span className="underline decoration-dotted" style={{ color: "#e8d5a3" }}>View full details</span>
                    <span className="ml-1.5" style={{ color: "#8a8380" }}>→</span>
                  </p>
                </div>

                {p.status === "pending" && (
                  <div
                    className="flex flex-row gap-3 border-t px-5 py-4"
                    style={{ borderColor: "rgba(191,139,55,0.3)", background: "rgba(0,0,0,0.15)" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => handleApprove(p._id)}
                      disabled={actionId === p._id}
                      className="rounded-lg bg-[var(--totk-light-green)] px-4 py-2.5 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
                    >
                      {actionId === p._id ? "…" : "Approve"}
                    </button>
                    <button
                      onClick={() => handleReject(p._id)}
                      disabled={actionId === p._id}
                      className="rounded-lg border border-red-500/60 bg-red-500/15 px-4 py-2.5 text-sm font-medium text-red-200 hover:bg-red-500/25 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}

        {/* Full-detail modal */}
        {viewingProposal && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 pt-[72px] pb-8 px-4"
            onClick={() => setViewingProposal(null)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="proposal-detail-title"
          >
            <div
              className="relative my-0 w-full max-w-5xl max-h-[calc(100vh-8rem)] overflow-y-auto rounded-xl border border-[var(--totk-dark-ocher)] shadow-2xl"
              style={{ background: "#3a3230" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--totk-dark-ocher)] px-6 py-4" style={{ background: "#3a3230" }}>
                <h2 id="proposal-detail-title" className="text-xl font-bold" style={{ color: "#e8d5a3" }}>
                  {viewingProposal.title}
                </h2>
                <button
                  type="button"
                  onClick={() => setViewingProposal(null)}
                  className="rounded p-2 opacity-80 hover:opacity-100 hover:bg-white/10"
                  style={{ color: "#f5f0e6" }}
                  aria-label="Close"
                >
                  <i className="fas fa-times text-lg" />
                </button>
              </div>
              <div className="p-6 space-y-6 text-base leading-relaxed" style={{ color: "#f5f0e6" }}>
                {/* Compact meta */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" style={{ color: "#b8b0a8" }}>
                  <span>Submitted by <strong style={{ color: "#f5f0e6" }}>{viewingProposal.submitterUsername || viewingProposal.submitterUserId}</strong></span>
                  <span>Submitted {new Date(viewingProposal.createdAt).toLocaleString()}</span>
                  <span><span className={`rounded px-2 py-0.5 text-xs font-medium ${viewingProposal.status === "approved" ? "bg-green-900/50 text-green-300" : viewingProposal.status === "rejected" ? "bg-red-900/50 text-red-300" : "bg-[var(--totk-dark-ocher)]/50 text-[var(--totk-light-ocher)]"}`}>{viewingProposal.status}</span></span>
                  {viewingProposal.approvedQuestId && <span>Quest ID: <code className="font-mono" style={{ color: "#e8d5a3" }}>{viewingProposal.approvedQuestId}</code></span>}
                  {viewingProposal.rejectReason && <span className="w-full mt-2 text-red-300 whitespace-pre-wrap">Rejection reason: {viewingProposal.rejectReason}</span>}
                </div>

                {/* How it will look when posted to Discord */}
                <div>
                  <p className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>As it will post to the quest channel</p>
                  <MemberQuestEmbedPreview proposal={viewingProposal} />
                </div>

                {/* Notes for mods only (not shown to players) */}
                <section className="border-t border-[var(--totk-dark-ocher)]/50 pt-6">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Notes for mods only</h3>
                  <p className="mb-4 text-xs" style={{ color: "#b8b0a8" }}>For moderator review only. Not posted or shown to players.</p>
                  <div className="space-y-4">
                    <div><dt className="mb-1 text-sm" style={{ color: "#b8b0a8" }}>Summary (what will happen)</dt><dd className="whitespace-pre-wrap rounded border p-4 mt-1 leading-relaxed" style={{ background: "#2d2624", borderColor: "rgba(191,139,55,0.4)", color: "#faf7dc" }}>{viewingProposal.questSummary || "—"}</dd></div>
                    <div><dt className="mb-1 text-sm" style={{ color: "#b8b0a8" }}>Gameplay (how it works)</dt><dd className="whitespace-pre-wrap rounded border p-4 mt-1 leading-relaxed" style={{ background: "#2d2624", borderColor: "rgba(191,139,55,0.4)", color: "#faf7dc" }}>{viewingProposal.gameplayDescription || "—"}</dd></div>
                    <div><dt className="mb-1 text-sm" style={{ color: "#b8b0a8" }}>Running the event</dt><dd className="whitespace-pre-wrap rounded border p-4 mt-1 leading-relaxed" style={{ background: "#2d2624", borderColor: "rgba(191,139,55,0.4)", color: "#faf7dc" }}>{viewingProposal.runningEventDescription || "—"}</dd></div>
                  </div>
                </section>
              </div>

              {viewingProposal.status === "pending" && (
                <div className="sticky bottom-0 flex gap-2 border-t border-[var(--totk-dark-ocher)] px-6 py-4" style={{ background: "#3a3230" }} onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { handleApprove(viewingProposal._id); setViewingProposal(null); }}
                    disabled={actionId === viewingProposal._id}
                    className="rounded bg-[var(--totk-light-green)] px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
                  >
                    {actionId === viewingProposal._id ? "…" : "Approve"}
                  </button>
                  <button
                    onClick={() => { handleReject(viewingProposal._id); setViewingProposal(null); }}
                    disabled={actionId === viewingProposal._id}
                    className="rounded border border-red-500/70 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
