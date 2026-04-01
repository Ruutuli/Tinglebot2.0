"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";
import { imageUrlForGcsUrl } from "@/lib/image-url";

type PendingSubmission = {
  submissionId: string;
  title: string;
  userId: string;
  username?: string;
  category: string;
  finalTokenAmount: number;
  messageUrl?: string;
  questEvent: string;
  collab?: unknown;
  fileUrl?: string;
};

function previewUrl(fileUrl: string | undefined): string {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("https://storage.googleapis.com/tinglebot/")) {
    return imageUrlForGcsUrl(fileUrl);
  }
  return fileUrl;
}

export default function AdminArtSubmissionsPage() {
  const { user, isAdmin, isModerator, loading: sessionLoading } = useSession();
  const [items, setItems] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");

  const canAccess = isAdmin || isModerator;

  const fetchItems = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/pending-submissions", { cache: "no-store" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(typeof data.error === "string" ? data.error : "Failed to load pending submissions");
        setItems([]);
        return;
      }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [canAccess]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleApprove = useCallback(
    async (submissionId: string) => {
      setActionId(submissionId);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/pending-submissions/${encodeURIComponent(submissionId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "approve" }),
          }
        );
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(typeof data.error === "string" ? data.error : "Failed to approve");
          return;
        }
        setDenyingId(null);
        await fetchItems();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setActionId(null);
      }
    },
    [fetchItems]
  );

  const handleDeny = useCallback(
    async (submissionId: string) => {
      const reason = denyReason.trim();
      if (!reason) {
        setError("Please enter a reason for denial.");
        return;
      }
      setActionId(submissionId);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/pending-submissions/${encodeURIComponent(submissionId)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "deny", reason }),
          }
        );
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(typeof data.error === "string" ? data.error : "Failed to deny");
          return;
        }
        setDenyingId(null);
        setDenyReason("");
        await fetchItems();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setActionId(null);
      }
    },
    [denyReason, fetchItems]
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
            You must be a moderator or admin to manage art and writing submissions.
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
            Art &amp; writing submissions
          </h1>
          <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
        </div>

        <p className="mb-2 text-center text-sm text-[var(--botw-pale)]">
          Pending queue matches <code className="text-[var(--totk-light-ocher)]">/mod approve</code> — approve
          or deny to award tokens, update Discord, and run quest logic.
        </p>
        <p className="mb-6 text-center text-xs text-[var(--totk-grey-200)]">
          Requires the bot service URL and shared secret (<code>BOT_INTERNAL_API_URL</code>,{" "}
          <code>BOT_INTERNAL_API_SECRET</code>) so the dashboard can call the live bot.
        </p>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-center text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loading message="Loading submissions..." variant="inline" size="lg" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-12 text-center">
            <p className="text-[var(--botw-pale)]">No pending submissions.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((sub) => {
              const img = previewUrl(sub.fileUrl);
              const isDeny = denyingId === sub.submissionId;
              return (
                <div
                  key={sub.submissionId}
                  className="flex flex-col gap-4 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4 sm:flex-row"
                >
                  <div className="h-32 w-full max-w-[200px] shrink-0 overflow-hidden rounded bg-[var(--totk-grey-900)] sm:h-40 sm:w-40">
                    {img ? (
                      <img src={img} alt="" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-3xl text-[var(--totk-grey-600)]">
                        {sub.category === "writing" ? "📝" : "🎨"}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-bold text-[var(--totk-light-ocher)]">{sub.title}</h2>
                    <p className="text-sm text-[var(--botw-pale)]">
                      ID <code className="text-[var(--totk-light-ocher)]">{sub.submissionId}</code>
                      {" · "}
                      {sub.category === "writing" ? "Writing" : "Art"}
                      {" · "}
                      {sub.finalTokenAmount} tokens
                    </p>
                    <p className="mt-1 text-xs text-[var(--totk-grey-200)]">
                      Submitter: {sub.username || "—"} ({sub.userId})
                    </p>
                    {sub.questEvent && sub.questEvent !== "N/A" && (
                      <p className="mt-1 text-xs text-[var(--totk-light-ocher)]">
                        Quest: {sub.questEvent}
                      </p>
                    )}
                    {sub.messageUrl && (
                      <a
                        href={sub.messageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-block text-sm text-[var(--totk-light-green)] underline hover:opacity-90"
                      >
                        Open in Discord
                      </a>
                    )}
                    {isDeny && (
                      <div className="mt-3">
                        <label className="mb-1 block text-xs text-[var(--botw-pale)]">
                          Reason for denial (sent to the user)
                        </label>
                        <textarea
                          value={denyReason}
                          onChange={(e) => setDenyReason(e.target.value)}
                          rows={3}
                          className="w-full rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-2 text-sm text-[var(--botw-pale)]"
                          placeholder="Required"
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:flex-col">
                    <button
                      type="button"
                      onClick={() => handleApprove(sub.submissionId)}
                      disabled={actionId === sub.submissionId}
                      className="rounded bg-[var(--totk-light-green)] px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
                    >
                      {actionId === sub.submissionId ? "…" : "Approve"}
                    </button>
                    {!isDeny ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDenyingId(sub.submissionId);
                          setDenyReason("");
                          setError(null);
                        }}
                        disabled={actionId === sub.submissionId}
                        className="rounded border border-red-500/70 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                      >
                        Deny
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleDeny(sub.submissionId)}
                          disabled={actionId === sub.submissionId}
                          className="rounded border border-red-500/70 bg-red-500/40 px-4 py-2 text-sm font-medium text-red-100 hover:bg-red-500/50 disabled:opacity-50"
                        >
                          {actionId === sub.submissionId ? "…" : "Confirm deny"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDenyingId(null);
                            setDenyReason("");
                          }}
                          className="rounded border border-[var(--totk-dark-ocher)] px-4 py-2 text-sm text-[var(--botw-pale)] hover:bg-[var(--totk-dark-green)]/20"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
