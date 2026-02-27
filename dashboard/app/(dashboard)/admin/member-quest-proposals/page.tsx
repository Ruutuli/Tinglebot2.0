"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";

function formatDateDisplay(dateStr: string | undefined): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) return dateStr ?? "";
  const d = new Date(dateStr + "T12:00:00");
  return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
              <div className="space-y-6 p-6 text-base leading-relaxed" style={{ color: "#f5f0e6" }}>
                {/* Meta */}
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Meta</h3>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Submitted by</dt><dd className="font-medium mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.submitterUsername || viewingProposal.submitterUserId}</dd></div>
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Status</dt><dd className="mt-0.5"><span className={`rounded px-2 py-0.5 text-xs font-medium ${viewingProposal.status === "approved" ? "bg-green-900/50 text-green-300" : viewingProposal.status === "rejected" ? "bg-red-900/50 text-red-300" : "bg-[var(--totk-dark-ocher)]/50 text-[var(--totk-light-ocher)]"}`}>{viewingProposal.status}</span></dd></div>
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Submitted</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{new Date(viewingProposal.createdAt).toLocaleString()}</dd></div>
                    {viewingProposal.approvedQuestId && <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Approved quest ID</dt><dd className="font-mono mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.approvedQuestId}</dd></div>}
                    {viewingProposal.rejectReason && <div className="sm:col-span-2"><dt className="text-sm" style={{ color: "#b8b0a8" }}>Rejection reason</dt><dd className="mt-0.5 text-red-300 whitespace-pre-wrap">{viewingProposal.rejectReason}</dd></div>}
                  </dl>
                </section>

                {/* Basics */}
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Basics</h3>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Type</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.type || "—"}</dd></div>
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Locations</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.locations || "—"}</dd></div>
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Start date</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.date ? formatDateDisplay(viewingProposal.date) : "—"}</dd></div>
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Duration</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.timeLimit || "—"}</dd></div>
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Sign-up deadline</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.signupDeadline ? formatDateDisplay(viewingProposal.signupDeadline) : (viewingProposal.signupDeadline || "—")}</dd></div>
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Time per round</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.timePerRound || "—"}</dd></div>
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Party size</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.partySize || "—"}</dd></div>
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Special equipment</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.specialEquipment || "—"}</dd></div>
                  </dl>
                </section>

                {/* Quest options */}
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Quest options</h3>
                  <dl className="grid gap-2 sm:grid-cols-2">
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Collaborations allowed</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.collabAllowed ? "Yes" : "No"}</dd></div>
                    {viewingProposal.collabAllowed && <div className="sm:col-span-2"><dt className="text-sm" style={{ color: "#b8b0a8" }}>Collaboration rule</dt><dd className="mt-0.5 whitespace-pre-wrap" style={{ color: "#f5f0e6" }}>{viewingProposal.collabRule || "—"}</dd></div>}
                    {(viewingProposal.type === "Art" || viewingProposal.type === "Writing") && <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Art / Writing mode</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.artWritingMode || "—"}</dd></div>}
                    {viewingProposal.type === "Interactive" && (
                      <>
                        <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Table roll name</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.tableRollName || "—"}</dd></div>
                        <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Required successful rolls</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.requiredRolls ?? "—"}</dd></div>
                      </>
                    )}
                    {viewingProposal.type === "RP" && <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Post requirement</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.postRequirement ?? "—"}</dd></div>}
                    {viewingProposal.minRequirements != null && viewingProposal.minRequirements !== "" && <div className="sm:col-span-2"><dt className="text-sm" style={{ color: "#b8b0a8" }}>Min requirements</dt><dd className="mt-0.5 whitespace-pre-wrap" style={{ color: "#f5f0e6" }}>{String(viewingProposal.minRequirements)}</dd></div>}
                  </dl>
                </section>

                {/* Sign-up & rewards */}
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Sign-up & rewards</h3>
                  <dl className="grid gap-2">
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Sign-up form link</dt><dd className="mt-0.5" style={{ color: "#f5f0e6" }}>{viewingProposal.signUpFormLink ? <a href={viewingProposal.signUpFormLink} target="_blank" rel="noopener noreferrer" className="underline break-all hover:opacity-90" style={{ color: "#e8d5a3" }}>{viewingProposal.signUpFormLink}</a> : "—"}</dd></div>
                    <div><dt className="text-sm" style={{ color: "#b8b0a8" }}>Rewards</dt><dd className="mt-0.5 whitespace-pre-wrap" style={{ color: "#f5f0e6" }}>{viewingProposal.rewards || "—"}</dd></div>
                  </dl>
                </section>

                {/* Description (player-facing) + Rules */}
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Description (player-facing)</h3>
                  <dd className="whitespace-pre-wrap rounded border p-4 mt-1 leading-relaxed" style={{ background: "#2d2624", borderColor: "rgba(191,139,55,0.4)", color: "#faf7dc" }}>{viewingProposal.questDescription || "—"}</dd>
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Rules</h3>
                  <dd className="whitespace-pre-wrap rounded border p-4 mt-1 leading-relaxed" style={{ background: "#2d2624", borderColor: "rgba(191,139,55,0.4)", color: "#faf7dc" }}>{viewingProposal.gameRules || "—"}</dd>
                </section>
                {/* Notes for mods */}
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider" style={{ color: "#e8d5a3" }}>Notes for mods</h3>
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
