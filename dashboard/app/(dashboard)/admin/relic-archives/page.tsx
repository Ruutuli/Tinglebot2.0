"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { Loading } from "@/components/ui";
import { imageUrlForGcsUrl } from "@/lib/image-url";

type ArchiveRequest = {
  _id: string;
  relicId: string;
  submitterUserId: string;
  title: string;
  discoveredBy: string;
  appraisedBy: string;
  region: string;
  square: string;
  quadrant: string;
  info: string;
  imageUrl: string;
  libraryPositionX?: number | null;
  libraryPositionY?: number | null;
  libraryDisplaySize?: number | null;
  status: string;
  createdAt: string;
};

const LIBRARY_IMAGE = "/assets/library.png";

function normalizeImageUrl(imageUrl: string | undefined): string {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("https://storage.googleapis.com/tinglebot/")) {
    return imageUrlForGcsUrl(imageUrl);
  }
  return imageUrl;
}

export default function AdminRelicArchivesPage() {
  const { user, isAdmin, isModerator, loading: sessionLoading } = useSession();
  const [requests, setRequests] = useState<ArchiveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const canAccess = isAdmin || isModerator;

  const fetchRequests = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/relics/archive-requests", { next: { revalidate: 60 } });
      if (!res.ok) {
        setError("Failed to load archive requests");
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
      setActionId(requestId);
      setError(null);
      try {
        const res = await fetch(`/api/relics/archive-requests/${requestId}/approve`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to approve");
          return;
        }
        await fetchRequests();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setActionId(null);
      }
    },
    [fetchRequests]
  );

  const handleReject = useCallback(
    async (requestId: string) => {
      setActionId(requestId);
      setError(null);
      try {
        const res = await fetch(`/api/relics/archive-requests/${requestId}/reject`, {
          method: "POST",
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Failed to reject");
          return;
        }
        await fetchRequests();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setActionId(null);
      }
    },
    [fetchRequests]
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
            You must be a moderator or admin to access relic archive requests.
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
            Relic archive requests
          </h1>
          <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
        </div>

        <p className="mb-6 text-center text-sm text-[var(--botw-pale)]">
          Users submit relics from the Library Archives page with image and map position. Approve to add the relic to the archives at the chosen location, or reject the request.
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
        ) : requests.length === 0 ? (
          <div className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-12 text-center">
            <p className="text-[var(--botw-pale)]">No pending relic archive requests.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <div
                key={req._id}
                className="flex flex-col gap-4 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4 sm:flex-row"
              >
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded bg-[var(--totk-grey-900)] sm:h-32 sm:w-32">
                  {req.imageUrl ? (
                    <img
                      src={normalizeImageUrl(req.imageUrl)}
                      alt={req.title}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl text-[var(--totk-grey-600)]">
                      🔸
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="font-bold text-[var(--totk-light-ocher)]">{req.title}</h2>
                  <p className="text-sm text-[var(--botw-pale)]">
                    Relic ID: {req.relicId} • Discovered by: {req.discoveredBy} • Appraised by: {req.appraisedBy}
                  </p>
                  {(req.region || req.square || req.quadrant) && (
                    <p className="mt-1 text-xs text-[var(--totk-grey-200)]">
                      {[req.region, req.square, req.quadrant].filter(Boolean).join(" • ")}
                    </p>
                  )}
                  {req.libraryPositionX != null && req.libraryPositionY != null && (
                    <p className="mt-1 text-xs text-[var(--totk-light-ocher)]">
                      Map position: {Math.round(req.libraryPositionX)}%, {Math.round(req.libraryPositionY)}%
                      {(req.libraryDisplaySize ?? 8) !== 8 && ` • Size: ${req.libraryDisplaySize}%`}
                    </p>
                  )}
                  <p className="mt-2 line-clamp-3 text-sm text-[var(--botw-pale)]">{req.info}</p>
                </div>
                {req.libraryPositionX != null && req.libraryPositionY != null && (
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] sm:h-24 sm:w-24">
                    <img
                      src={LIBRARY_IMAGE}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover object-center opacity-60"
                    />
                    <div
                      className="absolute h-2 w-2 rounded-full border-2 border-[var(--totk-light-ocher)] bg-[var(--totk-light-ocher)]/60"
                      style={{
                        left: `${req.libraryPositionX}%`,
                        top: `${req.libraryPositionY}%`,
                        transform: "translate(-50%, -50%)",
                      }}
                      title={`${Math.round(req.libraryPositionX)}%, ${Math.round(req.libraryPositionY)}%`}
                    />
                  </div>
                )}
                <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
                  <button
                    onClick={() => handleApprove(req._id)}
                    disabled={actionId === req._id}
                    className="rounded bg-[var(--totk-light-green)] px-4 py-2 text-sm font-medium text-black hover:opacity-90 disabled:opacity-50"
                  >
                    {actionId === req._id ? "…" : "Approve"}
                  </button>
                  <button
                    onClick={() => handleReject(req._id)}
                    disabled={actionId === req._id}
                    className="rounded border border-red-500/70 bg-red-500/20 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/30 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
