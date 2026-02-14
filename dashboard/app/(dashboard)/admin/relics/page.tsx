"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";

type AppraisalRequest = {
  _id: string;
  relicId: string;
  characterName: string;
  finderOwnerUserId: string;
  appraiserName: string;
  npcAppraisal: boolean;
  payment?: string;
  status: string;
  createdAt: string;
};

export default function AdminRelicsPage() {
  const { user, isAdmin, isModerator, loading: sessionLoading } = useSession();
  const [requests, setRequests] = useState<AppraisalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [description, setDescription] = useState<Record<string, string>>({});

  const canAccess = isAdmin || isModerator;

  const fetchRequests = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/relics/appraisal-requests", { cache: "no-store" });
      if (!res.ok) {
        setError("Failed to load appraisal requests");
        setRequests([]);
        return;
      }
      const data = await res.json();
      setRequests(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [canAccess]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApprove = useCallback(
    async (requestId: string) => {
      const desc = description[requestId]?.trim();
      if (!desc) {
        setError("Please enter an appraisal description before approving.");
        return;
      }
      setApprovingId(requestId);
      setError(null);
      try {
        const res = await fetch(`/api/relics/appraisal-requests/${requestId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: desc }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to approve");
          return;
        }
        setDescription((prev) => {
          const next = { ...prev };
          delete next[requestId];
          return next;
        });
        await fetchRequests();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setApprovingId(null);
      }
    },
    [description, fetchRequests]
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
            You must be a moderator or admin to access relic appraisal requests.
          </p>
        </div>
      </div>
    );
  }

  const npcRequests = requests.filter((r) => r.npcAppraisal);
  const pcRequests = requests.filter((r) => !r.npcAppraisal);

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[1000px]">
        <div className="mb-6 flex items-center justify-center gap-2 sm:gap-4">
          <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
          <h1 className="text-center text-xl sm:text-2xl md:text-3xl font-bold text-[var(--totk-light-ocher)]">
            Relic Appraisal Requests
          </h1>
          <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
        </div>

        <p className="mb-6 text-center text-sm text-[var(--botw-pale)]">
          Approve NPC relic appraisals here. PC appraisals are completed via /relic appraisal-accept in Discord.
        </p>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-center text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loading message="Loading requests..." variant="inline" size="lg" />
          </div>
        ) : npcRequests.length === 0 && pcRequests.length === 0 ? (
          <div className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-12 text-center">
            <p className="text-[var(--botw-pale)]">No pending appraisal requests.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {npcRequests.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-semibold text-[var(--totk-light-ocher)]">
                  NPC Appraisals (Mod approval required)
                </h2>
                <div className="space-y-4">
                  {npcRequests.map((req) => (
                    <div
                      key={req._id}
                      className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4"
                    >
                      <div className="mb-3 flex flex-wrap gap-2 text-sm">
                        <span className="font-medium text-[var(--totk-ivory)]">
                          Relic: {req.relicId}
                        </span>
                        <span>•</span>
                        <span>Owner: {req.characterName}</span>
                        <span>•</span>
                        <span>Appraiser: NPC (500 tokens)</span>
                      </div>
                      <textarea
                        placeholder="Enter appraisal description (required for NPC appraisals)"
                        value={description[req._id] ?? ""}
                        onChange={(e) =>
                          setDescription((prev) => ({ ...prev, [req._id]: e.target.value }))
                        }
                        className="mb-3 w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--totk-grey-900)] px-3 py-2 text-sm text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-400)]"
                        rows={3}
                      />
                      <button
                        onClick={() => handleApprove(req._id)}
                        disabled={approvingId === req._id || !description[req._id]?.trim()}
                        className="rounded bg-[var(--totk-light-green)] px-4 py-2 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-50"
                      >
                        {approvingId === req._id ? "Approving…" : "Approve (deduct 500 tokens)"}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {pcRequests.length > 0 && (
              <section>
                <h2 className="mb-4 text-lg font-semibold text-[var(--totk-light-ocher)]">
                  PC Appraisals (awaiting Artist/Researcher in Discord)
                </h2>
                <div className="space-y-2 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4">
                  {pcRequests.map((req) => (
                    <div
                      key={req._id}
                      className="flex flex-wrap items-center gap-2 text-sm text-[var(--botw-pale)]"
                    >
                      <span className="font-medium text-[var(--totk-ivory)]">
                        {req.relicId}
                      </span>
                      <span>•</span>
                      <span>{req.characterName}</span>
                      <span>→</span>
                      <span>{req.appraiserName}</span>
                    </div>
                  ))}
                  <p className="mt-2 text-xs text-[var(--totk-grey-400)]">
                    These will be completed when the assigned Artist/Researcher uses /relic appraisal-accept in Discord.
                  </p>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
