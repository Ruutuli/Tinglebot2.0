"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loading, Modal } from "@/components/ui";
import { useSession } from "@/hooks/use-session";

const LIBRARY_IMAGE = "/assets/library.png";
/** Fixed size for all relic pins on the library map (percent of map width). */
const MAP_PIN_SIZE = 3;

type ArchivedRelic = {
  _id: string;
  relicId?: string;
  name: string;
  rollOutcome?: string;
  appraisalDescription?: string;
  imageUrl?: string;
  discoveredBy?: string;
  appraisedBy?: string;
  locationFound?: string;
  region?: string;
  square?: string;
  quadrant?: string;
  appraisalDate?: string;
  libraryPositionX?: number | null;
  libraryPositionY?: number | null;
  libraryDisplaySize?: number | null;
};

function normalizeImageUrl(imageUrl: string | undefined): string {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("https://storage.googleapis.com/tinglebot/")) {
    return `/api/images/${imageUrl.replace("https://storage.googleapis.com/tinglebot/", "")}`;
  }
  return imageUrl;
}

export default function LibraryArchivesPage() {
  const { user, isAdmin, isModerator, loading: sessionLoading } = useSession();
  const isMod = isAdmin || isModerator;
  const [relics, setRelics] = useState<ArchivedRelic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadRelicId, setUploadRelicId] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDiscoveredBy, setUploadDiscoveredBy] = useState("");
  const [uploadAppraisedBy, setUploadAppraisedBy] = useState("");
  const [uploadRegion, setUploadRegion] = useState("");
  const [uploadSquare, setUploadSquare] = useState("");
  const [uploadQuadrant, setUploadQuadrant] = useState("");
  const [uploadInfo, setUploadInfo] = useState("");
  const [uploadLibraryPositionX, setUploadLibraryPositionX] = useState<number | null>(null);
  const [uploadLibraryPositionY, setUploadLibraryPositionY] = useState<number | null>(null);
  const [uploadLibraryDisplaySize, setUploadLibraryDisplaySize] = useState(MAP_PIN_SIZE);
  const [uploading, setUploading] = useState(false);
  const [loadRelicLoading, setLoadRelicLoading] = useState(false);
  const [loadRelicError, setLoadRelicError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [placingRelicId, setPlacingRelicId] = useState<string | null>(null);
  /** Mod-only: size when placing a relic (percent). Used in Mod: All relics when placing. */
  const [placementSize, setPlacementSize] = useState(MAP_PIN_SIZE);
  /** When placing, keyboard nudge position (percent). Used when not hovering over map. */
  const [nudgePosition, setNudgePosition] = useState<{ x: number; y: number } | null>(null);
  const [mapHoverPercent, setMapHoverPercent] = useState<{ x: number; y: number } | null>(null);
  const [savingPlacement, setSavingPlacement] = useState<string | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const modSectionRef = useRef<HTMLElement>(null);
  const submitMapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchArchives = useCallback(async (): Promise<ArchivedRelic[] | undefined> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/relics/archives", { cache: "no-store" });
      if (!res.ok) {
        setError("Failed to load archived relics");
        setRelics([]);
        return undefined;
      }
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setRelics(list);
      return list;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRelics([]);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchives();
  }, [fetchArchives]);

  useEffect(() => {
    if (!placingRelicId || !relics.length) {
      setNudgePosition(null);
      return;
    }
    const relic = relics.find((r) => r._id === placingRelicId);
    if (!relic) {
      setNudgePosition({ x: 50, y: 50 });
      return;
    }
    const x = relic.libraryPositionX != null ? Number(relic.libraryPositionX) : NaN;
    const y = relic.libraryPositionY != null ? Number(relic.libraryPositionY) : NaN;
    if (!Number.isNaN(x) && !Number.isNaN(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100) {
      setNudgePosition({ x, y });
    } else {
      setNudgePosition({ x: 50, y: 50 });
    }
  }, [placingRelicId, relics]);

  useEffect(() => {
    if (placingRelicId && modSectionRef.current) {
      modSectionRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [placingRelicId]);

  const handleLoadRelic = useCallback(async () => {
    const id = uploadRelicId.trim().toUpperCase();
    if (!id) {
      setLoadRelicError("Enter a Relic ID first.");
      return;
    }
    setLoadRelicLoading(true);
    setLoadRelicError(null);
    try {
      const res = await fetch(`/api/relics/prefill?relicId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadRelicError(data.error || "Failed to load relic");
        return;
      }
      setUploadTitle(data.title ?? "");
      setUploadDiscoveredBy(data.discoveredBy ?? "");
      setUploadAppraisedBy(data.appraisedBy ?? "");
      setUploadRegion(data.region ?? "");
      setUploadSquare(data.square ?? "");
      setUploadQuadrant(data.quadrant ?? "");
    } catch (e) {
      setLoadRelicError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoadRelicLoading(false);
    }
  }, [uploadRelicId]);

  const handleUpload = useCallback(async () => {
    if (!uploadRelicId.trim() || !uploadFile) {
      setUploadMessage({ type: "err", text: "Enter a Relic ID, click Load, then choose an image file." });
      return;
    }
    if (!uploadTitle.trim() || !uploadDiscoveredBy.trim() || !uploadAppraisedBy.trim()) {
      setUploadMessage({ type: "err", text: "Enter a Relic ID and click Load to fill relic details." });
      return;
    }
    if (!uploadInfo.trim()) {
      setUploadMessage({ type: "err", text: "Info (description) is required." });
      return;
    }
    if (uploadLibraryPositionX == null || uploadLibraryPositionY == null) {
      setUploadMessage({ type: "err", text: "Click the library map to choose where your relic will appear." });
      return;
    }
    setUploading(true);
    setUploadMessage(null);
    try {
      const form = new FormData();
      form.set("relicId", uploadRelicId.trim());
      form.set("file", uploadFile);
      form.set("title", uploadTitle.trim());
      form.set("discoveredBy", uploadDiscoveredBy.trim());
      form.set("appraisedBy", uploadAppraisedBy.trim());
      form.set("region", uploadRegion.trim());
      form.set("square", uploadSquare.trim());
      form.set("quadrant", uploadQuadrant.trim());
      form.set("info", uploadInfo.trim());
      form.set("libraryPositionX", String(uploadLibraryPositionX));
      form.set("libraryPositionY", String(uploadLibraryPositionY));
      form.set("libraryDisplaySize", String(uploadLibraryDisplaySize));
      const res = await fetch("/api/relics/archive-requests", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadMessage({ type: "err", text: data.error || "Submit failed" });
        return;
      }
      setUploadMessage({ type: "ok", text: data.message || "Submitted for mod approval." });
      setUploadRelicId("");
      setUploadFile(null);
      setUploadTitle("");
      setUploadDiscoveredBy("");
      setUploadAppraisedBy("");
      setUploadRegion("");
      setUploadSquare("");
      setUploadQuadrant("");
      setUploadInfo("");
      setUploadLibraryPositionX(null);
      setUploadLibraryPositionY(null);
      setUploadLibraryDisplaySize(MAP_PIN_SIZE);
      setSubmitModalOpen(false);
      fetchArchives();
    } catch (e) {
      setUploadMessage({ type: "err", text: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setUploading(false);
    }
  }, [
    uploadRelicId,
    uploadFile,
    uploadTitle,
    uploadDiscoveredBy,
    uploadAppraisedBy,
    uploadInfo,
    uploadRegion,
    uploadSquare,
    uploadQuadrant,
    uploadLibraryPositionX,
    uploadLibraryPositionY,
    uploadLibraryDisplaySize,
    fetchArchives,
  ]);

  const getSubmitMapPercent = useCallback((clientX: number, clientY: number) => {
    if (!submitMapRef.current) return null;
    const rect = submitMapRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  }, []);

  const handleSubmitMapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const percent = getSubmitMapPercent(e.clientX, e.clientY);
    if (percent) {
      setUploadLibraryPositionX(percent.x);
      setUploadLibraryPositionY(percent.y);
    }
  }, [getSubmitMapPercent]);

  const handleSubmitMapTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.preventDefault();
    const touch = e.changedTouches?.[0];
    if (!touch) return;
    const percent = getSubmitMapPercent(touch.clientX, touch.clientY);
    if (percent) {
      setUploadLibraryPositionX(percent.x);
      setUploadLibraryPositionY(percent.y);
    }
  }, [getSubmitMapPercent]);

  const normalizeRelicId = useCallback((id: unknown): string => {
    if (id == null) return "";
    if (typeof id === "string") return id;
    if (typeof id === "object" && id !== null && "toString" in id) return String(id);
    const o = id as { $oid?: string };
    return typeof o.$oid === "string" ? o.$oid : String(id);
  }, []);

  const updatePlacement = useCallback(
    async (relicId: string, libraryPositionX: number, libraryPositionY: number, libraryDisplaySize?: number) => {
      const idStr = normalizeRelicId(relicId) || String(relicId);
      const payload = {
        libraryPositionX,
        libraryPositionY,
        ...(libraryDisplaySize != null && { libraryDisplaySize }),
      };
      const url = `/api/relics/archives/${encodeURIComponent(idStr)}/placement`;
      console.log("[placement] Saving", { relicId: idStr, payload, url });
      setSavingPlacement(idStr);
      try {
        const res = await fetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        console.log("[placement] Response", { status: res.status, ok: res.ok, data });
        if (!res.ok) {
          setUploadMessage({ type: "err", text: data.error || "Failed to save position" });
          return;
        }
        setUploadMessage({ type: "ok", text: "Position saved." });
        const placement = data.placement && typeof data.placement === "object" ? data.placement as { libraryPositionX?: number; libraryPositionY?: number; libraryDisplaySize?: number } : null;
        if (placement) {
          console.log("[placement] Updating local state with", { relicId: idStr, placement });
          setRelics((prev) =>
            prev.map((r) =>
              normalizeRelicId(r._id) === idStr
                ? { ...r, libraryPositionX: placement.libraryPositionX, libraryPositionY: placement.libraryPositionY, libraryDisplaySize: placement.libraryDisplaySize ?? r.libraryDisplaySize }
                : r
            )
          );
        } else {
          console.warn("[placement] No placement in response, local state not updated", data);
        }
        // Do not refetch after placement: it can overwrite with stale data and make the pin disappear
      } catch (e) {
        console.error("[placement] Request failed", e);
        setUploadMessage({ type: "err", text: e instanceof Error ? e.message : "Failed to save" });
      } finally {
        setSavingPlacement(null);
      }
    },
    [normalizeRelicId]
  );

  const getMapPercent = useCallback((clientX: number, clientY: number) => {
    if (!mapContainerRef.current) return null;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    };
  }, []);

  const handleMapClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!placingRelicId || !mapContainerRef.current) return;
      const percent = getMapPercent(e.clientX, e.clientY);
      if (!percent) return;
      updatePlacement(placingRelicId, percent.x, percent.y, placementSize);
      setPlacingRelicId(null);
      setMapHoverPercent(null);
    },
    [placingRelicId, placementSize, updatePlacement, getMapPercent]
  );

  const handleMapTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!placingRelicId || !mapContainerRef.current) return;
      e.preventDefault();
      const touch = e.changedTouches?.[0];
      if (!touch) return;
      const percent = getMapPercent(touch.clientX, touch.clientY);
      if (!percent) return;
      updatePlacement(placingRelicId, percent.x, percent.y, placementSize);
      setPlacingRelicId(null);
      setMapHoverPercent(null);
    },
    [placingRelicId, placementSize, updatePlacement, getMapPercent]
  );

  const handleMapMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!placingRelicId) {
        setMapHoverPercent(null);
        return;
      }
      const percent = getMapPercent(e.clientX, e.clientY);
      setMapHoverPercent(percent);
    },
    [placingRelicId, getMapPercent]
  );

  const handleMapMouseLeave = useCallback(() => {
    setMapHoverPercent(null);
  }, []);

  const handleMapDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!mapContainerRef.current || !isMod) return;
      const relicId = e.dataTransfer.getData("text/plain");
      if (!relicId) return;
      const percent = getMapPercent(e.clientX, e.clientY);
      if (!percent) return;
      const relic = relics.find((r) => r._id === relicId);
      const size = relic && (relic.libraryPositionX != null && relic.libraryPositionY != null) ? (relic.libraryDisplaySize ?? MAP_PIN_SIZE) : placementSize;
      updatePlacement(relicId, percent.x, percent.y, typeof size === "number" ? size : placementSize);
      if (placingRelicId === relicId) {
        setPlacingRelicId(null);
        setMapHoverPercent(null);
      }
    },
    [isMod, relics, updatePlacement, getMapPercent, placementSize, placingRelicId]
  );

  const NUDGE_STEP = 0.25;
  const handlePlaceAtPreview = useCallback(() => {
    if (!placingRelicId) return;
    const preview = mapHoverPercent ?? nudgePosition;
    if (!preview) return;
    updatePlacement(placingRelicId, preview.x, preview.y, placementSize);
    setPlacingRelicId(null);
    setMapHoverPercent(null);
    setNudgePosition(null);
  }, [placingRelicId, mapHoverPercent, nudgePosition, placementSize, updatePlacement]);

  useEffect(() => {
    if (!placingRelicId || !isMod) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPlacingRelicId(null);
        setMapHoverPercent(null);
        setNudgePosition(null);
        e.preventDefault();
        return;
      }
      if (e.key === "Enter") {
        const preview = mapHoverPercent ?? nudgePosition;
        if (preview) {
          updatePlacement(placingRelicId, preview.x, preview.y, placementSize);
          setPlacingRelicId(null);
          setMapHoverPercent(null);
          setNudgePosition(null);
          e.preventDefault();
        }
        return;
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault();
        setNudgePosition((prev) => {
          const p = prev ?? { x: 50, y: 50 };
          const next = { ...p };
          if (e.key === "ArrowLeft") next.x = Math.max(0, p.x - NUDGE_STEP);
          if (e.key === "ArrowRight") next.x = Math.min(100, p.x + NUDGE_STEP);
          if (e.key === "ArrowUp") next.y = Math.max(0, p.y - NUDGE_STEP);
          if (e.key === "ArrowDown") next.y = Math.min(100, p.y + NUDGE_STEP);
          return next;
        });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [placingRelicId, isMod, mapHoverPercent, nudgePosition, placementSize, updatePlacement]);

  const hasValidPosition = (r: ArchivedRelic) => {
    const x = r.libraryPositionX != null ? Number(r.libraryPositionX) : NaN;
    const y = r.libraryPositionY != null ? Number(r.libraryPositionY) : NaN;
    return !Number.isNaN(x) && !Number.isNaN(y) && x >= 0 && x <= 100 && y >= 0 && y <= 100;
  };
  const placedRelics = relics.filter((r) => r.imageUrl && hasValidPosition(r));

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loading message="Loading Library Archives..." variant="inline" size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-x-hidden px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-10">
      <div className="mx-auto max-w-[1400px]">
        {/* Hero header */}
        <header className="mb-8 sm:mb-10">
          <div className="flex items-center justify-center gap-3 sm:gap-4">
            <img src="/Side=Left.svg" alt="" className="h-5 w-auto sm:h-6" aria-hidden />
            <h1 className="text-center text-2xl font-bold tracking-tight text-[var(--totk-light-ocher)] drop-shadow-sm sm:text-3xl md:text-4xl">
              Library Archives
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-5 w-auto sm:h-6" aria-hidden />
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-6 flex items-center gap-3 rounded-xl border border-red-500/50 bg-red-500/15 px-4 py-3 sm:px-5 sm:py-4"
          >
            <i className="fa-solid fa-circle-exclamation text-red-400 shrink-0" aria-hidden />
            <p className="text-sm font-medium text-red-300 sm:text-base">{error}</p>
          </div>
        )}

        {uploadMessage && (
          <div
            role="alert"
            className={`mb-6 flex items-center gap-3 rounded-xl px-4 py-3 sm:px-5 sm:py-4 ${
              uploadMessage.type === "ok"
                ? "border border-[var(--totk-light-green)]/50 bg-[var(--totk-light-green)]/15 text-[var(--totk-light-green)]"
                : "border border-red-500/50 bg-red-500/15 text-red-300"
            }`}
          >
            <i
              className={`shrink-0 ${uploadMessage.type === "ok" ? "fa-solid fa-circle-check text-[var(--totk-light-green)]" : "fa-solid fa-circle-exclamation text-red-400"}`}
              aria-hidden
            />
            <p className="text-sm font-medium sm:text-base">{uploadMessage.text}</p>
          </div>
        )}

        {user && !sessionLoading && (
          <Modal
            open={submitModalOpen}
            onOpenChange={(open) => {
              setSubmitModalOpen(open);
              if (!open) {
                setUploadMessage(null);
                setLoadRelicError(null);
                setUploadLibraryPositionX(null);
                setUploadLibraryPositionY(null);
                setUploadLibraryDisplaySize(MAP_PIN_SIZE);
                if (uploadPreviewUrl) {
                  URL.revokeObjectURL(uploadPreviewUrl);
                  setUploadPreviewUrl(null);
                }
              }
            }}
            title="Submit relic to archives"
            description="Enter Relic ID and click Load to auto-fill details. You only need to add the image and info (description). Submissions go to mods for approval. Images: 1:1, at least 500×500px, PNG, transparent background."
            size="xl"
          >
            <div className="space-y-6">
              <p className="flex items-center gap-2 rounded-lg border border-[var(--totk-dark-ocher)]/60 bg-[var(--totk-light-ocher)]/10 px-3 py-2.5 text-xs font-medium text-[var(--totk-grey-200)] sm:hidden">
                <i className="fa-solid fa-mobile-screen shrink-0 text-[var(--totk-light-ocher)]" aria-hidden />
                Adding images to the library on mobile is not recommended. Use a desktop or tablet for the best experience.
              </p>
              {/* Step 1: Relic ID + Load */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--totk-light-ocher)]/90">
                  Step 1 — Load relic
                </h3>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex min-w-0 flex-1 flex-col gap-1.5 sm:min-w-[140px]">
                    <span className="text-xs font-medium text-[var(--botw-pale)]/90">Relic ID <span className="text-red-400">*</span></span>
                    <input
                      type="text"
                      value={uploadRelicId}
                      onChange={(e) => setUploadRelicId(e.target.value)}
                      placeholder="e.g. R473582"
                      className="rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2.5 text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-200)]/60 focus:border-[var(--totk-light-ocher)]/60 focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-ocher)]/40"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleLoadRelic}
                    disabled={loadRelicLoading}
                    className="min-h-[44px] shrink-0 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-4 py-2.5 text-sm font-medium text-[var(--botw-pale)] transition-colors hover:border-[var(--totk-light-ocher)]/60 hover:bg-[var(--totk-brown)] disabled:cursor-not-allowed disabled:opacity-50 touch-manipulation"
                  >
                    {loadRelicLoading ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin mr-2" aria-hidden />
                        Loading…
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-arrow-down-to-bracket mr-2" aria-hidden />
                        Load
                      </>
                    )}
                  </button>
                </div>
                {loadRelicError && (
                  <p className="flex items-center gap-2 text-sm text-red-400">
                    <i className="fa-solid fa-triangle-exclamation shrink-0" aria-hidden />
                    {loadRelicError}
                  </p>
                )}

                {(uploadTitle || uploadDiscoveredBy || uploadAppraisedBy) && (
                  <div className="rounded-xl border border-[var(--totk-dark-ocher)]/50 bg-[var(--botw-warm-black)]/80 p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--totk-grey-200)]">Auto-filled from relic</p>
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                      <div><dt className="text-[var(--totk-grey-200)]">Title</dt><dd className="font-medium text-[var(--botw-pale)]">{uploadTitle || "—"}</dd></div>
                      <div><dt className="text-[var(--totk-grey-200)]">Discovered By</dt><dd className="font-medium text-[var(--botw-pale)]">{uploadDiscoveredBy || "—"}</dd></div>
                      <div><dt className="text-[var(--totk-grey-200)]">Appraised By</dt><dd className="font-medium text-[var(--botw-pale)]">{uploadAppraisedBy || "—"}</dd></div>
                      {(uploadRegion || uploadSquare || uploadQuadrant) && (
                        <div className="sm:col-span-2"><dt className="text-[var(--totk-grey-200)]">Region / Square / Quadrant</dt><dd className="font-medium text-[var(--botw-pale)]">{[uploadRegion, uploadSquare, uploadQuadrant].filter(Boolean).join(" • ") || "—"}</dd></div>
                      )}
                    </dl>
                  </div>
                )}
              </section>

              {/* Step 2: Info + Image */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--totk-light-ocher)]/90">
                  Step 2 — Description & image
                </h3>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium text-[var(--botw-pale)]/90">Info (description) <span className="text-red-400">*</span></span>
                  <textarea
                    value={uploadInfo}
                    onChange={(e) => setUploadInfo(e.target.value)}
                    placeholder="Appraisal description / lore (e.g. A sliver of agatized coral...)"
                    rows={4}
                    className="w-full rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] px-3 py-2.5 text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-200)]/60 focus:border-[var(--totk-light-ocher)]/60 focus:outline-none focus:ring-1 focus:ring-[var(--totk-light-ocher)]/40"
                  />
                </label>

                <div className="space-y-2">
                  <span className="block text-xs font-medium text-[var(--botw-pale)]/90">Image <span className="text-red-400">*</span></span>
                  <p className="text-xs text-[var(--totk-grey-200)]">
                    1:1 ratio, at least 500×500px, PNG, transparent background.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png"
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setUploadFile(file);
                      if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
                      setUploadPreviewUrl(file ? URL.createObjectURL(file) : null);
                    }}
                  />
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex min-h-[44px] items-center gap-2 rounded-xl border-2 border-dashed border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 px-4 py-3 text-sm font-medium text-[var(--botw-pale)] transition-colors hover:border-[var(--totk-light-ocher)]/60 hover:bg-[var(--totk-brown)]/50 touch-manipulation"
                    >
                      <i className="fa-solid fa-image text-[var(--totk-light-ocher)]" aria-hidden />
                      {uploadFile ? "Change image" : "Choose image"}
                    </button>
                    {uploadFile && (
                      <span className="truncate max-w-[200px] text-sm text-[var(--totk-grey-200)]">
                        {uploadFile.name}
                      </span>
                    )}
                  </div>
                  {uploadPreviewUrl && (
                    <div className="mt-2 flex flex-wrap items-start gap-3">
                      <div className="h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] ring-1 ring-black/20">
                        <img src={uploadPreviewUrl} alt="Preview" className="h-full w-full object-contain" />
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setUploadFile(null);
                          if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
                          setUploadPreviewUrl(null);
                          if (fileInputRef.current) fileInputRef.current.value = "";
                        }}
                        className="text-sm font-medium text-red-400 transition-colors hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* Step 3: Map position */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--totk-light-ocher)]/90">
                  Step 3 — Map position
                </h3>
                <p className="text-xs text-[var(--totk-grey-200)]">
                  Tap or click on the library map below to choose where your relic will appear. Mods will approve or deny your submission including this placement.
                </p>
                <div
                  ref={submitMapRef}
                  role="button"
                  tabIndex={0}
                  onClick={handleSubmitMapClick}
                  onTouchEnd={handleSubmitMapTouchEnd}
                  className="relative mx-auto w-full max-w-[280px] cursor-crosshair touch-manipulation overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-inner transition hover:border-[var(--totk-light-ocher)]/70 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)]/50"
                  style={{ aspectRatio: "1" }}
                >
                  <img
                    src={LIBRARY_IMAGE}
                    alt="Library map — click to place"
                    className="pointer-events-none absolute inset-0 h-full w-full object-contain object-center"
                  />
                  {uploadLibraryPositionX != null && uploadLibraryPositionY != null && (
                    <div
                      className="absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--totk-light-ocher)] bg-[var(--totk-light-ocher)]/50 shadow-lg"
                      style={{ left: `${uploadLibraryPositionX}%`, top: `${uploadLibraryPositionY}%` }}
                    />
                  )}
                </div>
                {uploadLibraryPositionX != null && uploadLibraryPositionY != null && (
                  <p className="text-xs text-[var(--totk-grey-200)]">
                    Position: {Math.round(uploadLibraryPositionX)}%, {Math.round(uploadLibraryPositionY)}%
                  </p>
                )}
              </section>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="min-h-[44px] touch-manipulation rounded-xl bg-[var(--totk-light-ocher)] px-5 py-2.5 font-semibold text-[var(--botw-warm-black)] shadow-md transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <i className="fa-solid fa-spinner fa-spin mr-2" aria-hidden />
                    Submitting…
                  </>
                ) : (
                  <>
                    <i className="fa-solid fa-paper-plane mr-2" aria-hidden />
                    Submit for approval
                  </>
                )}
              </button>
              {uploadMessage && (
                <p className={`text-sm font-medium ${uploadMessage.type === "ok" ? "text-[var(--totk-light-green)]" : "text-red-400"}`}>
                  {uploadMessage.text}
                </p>
              )}
            </div>
          </Modal>
        )}

        {/* Map section */}
        <section className="mb-8" aria-label="Library floor plan">
          <div
            ref={mapContainerRef}
            className="relative mx-auto w-full max-w-6xl touch-manipulation overflow-hidden rounded-xl border-2 border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-xl shadow-black/30"
            style={{ aspectRatio: "1" }}
            onClick={placingRelicId ? handleMapClick : undefined}
            onTouchEnd={placingRelicId ? handleMapTouchEnd : undefined}
            role={placingRelicId ? "button" : undefined}
            tabIndex={placingRelicId ? 0 : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            if (isMod) e.dataTransfer.dropEffect = "move";
          }}
          onDrop={handleMapDrop}
          onKeyDown={
            placingRelicId
              ? (e) => {
                  if (e.key === "Escape") setPlacingRelicId(null);
                }
              : undefined
          }
        >
          <img
            src={LIBRARY_IMAGE}
            alt="Library Archives floor plan"
            className="absolute inset-0 h-full w-full object-contain object-center"
          />
          {placedRelics.map((relic) => {
            const x = Number(relic.libraryPositionX);
            const y = Number(relic.libraryPositionY);
            const size = Math.max(2, Math.min(25, Number(relic.libraryDisplaySize) || MAP_PIN_SIZE));
            const url = normalizeImageUrl(relic.imageUrl);
            const isDraggable = isMod;
            const isSaving = savingPlacement === relic._id;
            return (
              <div
                key={relic._id}
                className="absolute z-10 cursor-move transition-all"
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  width: `${size}%`,
                  transform: "translate(-50%, -50%)",
                  aspectRatio: "1",
                  cursor: isDraggable ? "grab" : "default",
                }}
                draggable={!!isDraggable}
                onDragStart={(e) => {
                  if (!isDraggable) return;
                  e.dataTransfer.setData("text/plain", relic._id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => e.preventDefault()}
                title={relic.rollOutcome || relic.name}
              >
                {url ? (
                  <img
                    src={url}
                    alt={relic.rollOutcome || relic.name}
                    className="h-full w-full object-contain opacity-75"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--totk-grey-600)] opacity-75">
                    🔸
                  </div>
                )}
                {isSaving && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-[var(--totk-light-ocher)]">
                    <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                  </div>
                )}
              </div>
            );
          })}
          {placingRelicId && isMod && (
            <div className="absolute bottom-2 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-[var(--botw-warm-black)]/95 px-3 py-2 text-center text-xs font-medium text-[var(--totk-light-ocher)] shadow-lg max-w-[calc(100%-1rem)]">
              Tap or click map to place · Arrow keys to nudge · Enter to save · Esc to cancel
            </div>
          )}
          {placingRelicId && (() => {
            const placementPreview = mapHoverPercent ?? nudgePosition;
            const relic = relics.find((r) => r._id === placingRelicId);
            const url = relic?.imageUrl ? normalizeImageUrl(relic.imageUrl) : "";
            return (
              <>
                {placementPreview && (
                  <div
                    className="pointer-events-none absolute z-20 rounded-lg border-2 border-[var(--totk-light-ocher)] bg-[var(--totk-brown)]/95 shadow-xl"
                    style={{
                      left: `${placementPreview.x}%`,
                      top: `${placementPreview.y}%`,
                      width: `${placementSize}%`,
                      transform: "translate(-50%, -50%)",
                      aspectRatio: "1",
                    }}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt=""
                        className="h-full w-full object-contain opacity-90"
                        draggable={false}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--totk-grey-500)]">
                        🔸
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}
          </div>
          {user && !sessionLoading && (
            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setSubmitModalOpen(true);
                  setUploadMessage(null);
                }}
                className="group flex min-h-[44px] items-center justify-center gap-2.5 rounded-xl bg-[var(--totk-light-ocher)] px-6 py-3 font-semibold text-[var(--botw-warm-black)] shadow-lg shadow-black/20 transition-all hover:opacity-95 hover:shadow-xl hover:shadow-black/25 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-ocher)] focus:ring-offset-2 focus:ring-offset-[var(--totk-brown)] touch-manipulation"
              >
                <i className="fa-solid fa-cloud-arrow-up text-lg group-hover:scale-110 transition-transform" aria-hidden />
                Submit relic to archives
              </button>
            </div>
          )}
        </section>

        {isMod && !sessionLoading && relics.length > 0 && (
          <section ref={modSectionRef} className="mx-auto mt-8 max-w-4xl overflow-hidden rounded-2xl border-2 border-[var(--totk-light-ocher)]/50 bg-[var(--botw-warm-black)] shadow-xl shadow-black/30" aria-label="Moderator panel">
            <div className="border-b-2 border-[var(--totk-light-ocher)]/40 bg-[var(--totk-light-ocher)]/10 px-4 py-4 sm:px-5">
              <h3 className="flex items-center gap-2 text-base font-bold text-[var(--totk-light-ocher)] sm:text-lg">
                <i className="fa-solid fa-shield-halved" aria-hidden />
                Mod: All relics
              </h3>
              <p className="mt-1 text-sm text-[var(--botw-pale)]/90">
                Only visible to moderators. Click or drag relics on the map above to place or move them.
              </p>
            </div>
            {placingRelicId && (
              <div className="space-y-3 border-b border-[var(--totk-dark-ocher)]/40 px-3 py-4 sm:px-4">
                <p className="text-sm font-medium text-[var(--totk-light-ocher)]">
                  Click the map above to place, or use arrow keys to nudge and press Enter to save.
                </p>
                <p className="text-xs text-[var(--botw-pale)]/90">
                  Arrow keys = nudge position · Enter = save · Esc = cancel · Or drag a relic onto the map.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-[var(--totk-grey-400)]">Size on map:</span>
                  {[3, 4, 5, 6, 8, 10].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPlacementSize(s)}
                      className={`min-h-[36px] touch-manipulation rounded border px-2.5 py-1.5 text-sm font-medium transition-colors ${
                        placementSize === s
                          ? "border-[var(--totk-light-ocher)] bg-[var(--totk-light-ocher)]/20 text-[var(--totk-light-ocher)]"
                          : "border-[var(--totk-dark-ocher)] text-[var(--botw-pale)] hover:bg-[var(--totk-grey-900)]"
                      }`}
                    >
                      {s}%
                    </button>
                  ))}
                  <span className="mx-1 text-xs text-[var(--totk-grey-500)]">·</span>
                    <button
                      type="button"
                      onClick={handlePlaceAtPreview}
                      className="min-h-[36px] touch-manipulation rounded border border-[var(--totk-light-ocher)] bg-[var(--totk-light-ocher)]/20 px-3 py-1.5 text-sm font-medium text-[var(--totk-light-ocher)] hover:bg-[var(--totk-light-ocher)]/30"
                    >
                    Place here
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2 p-3 sm:p-4">
              {relics.map((relic) => {
                const placed = hasValidPosition(relic);
                return (
                  <button
                    key={relic._id}
                    type="button"
                    draggable={isMod}
                    onDragStart={(e) => {
                      if (!isMod) return;
                      e.dataTransfer.setData("text/plain", relic._id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onClick={() => isMod && setPlacingRelicId(placingRelicId === relic._id ? null : relic._id)}
                    className={`flex min-h-[44px] items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm transition-colors touch-manipulation ${
                      isMod ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                    } ${
                      placingRelicId === relic._id
                        ? "border-[var(--totk-light-ocher)] bg-[var(--totk-light-ocher)]/25 text-[var(--totk-light-ocher)]"
                        : "border-[var(--totk-dark-ocher)] bg-[var(--totk-grey-900)] text-[var(--botw-pale)] hover:border-[var(--totk-dark-ocher)]/80 hover:bg-[var(--totk-grey-800)]"
                    }`}
                  >
                    {relic.imageUrl ? (
                      <img
                        src={normalizeImageUrl(relic.imageUrl)}
                        alt=""
                        className="h-8 w-8 rounded object-cover ring-1 ring-[var(--totk-dark-ocher)]"
                        draggable={false}
                      />
                    ) : (
                      <span className="flex h-8 w-8 items-center justify-center rounded bg-[var(--totk-grey-800)] text-lg text-[var(--totk-grey-400)]">🔸</span>
                    )}
                    <span className="min-w-0 truncate max-w-[140px] font-medium">{relic.rollOutcome || relic.relicId || relic.name}</span>
                    {placed ? (
                      <span className="shrink-0 rounded bg-[var(--totk-light-green)]/30 px-2 py-0.5 text-xs font-medium text-[var(--totk-light-green)]">Placed</span>
                    ) : (
                      <span className="shrink-0 rounded bg-[var(--totk-grey-700)] px-2 py-0.5 text-xs font-medium text-[var(--totk-grey-300)]">Unplaced</span>
                    )}
                    {placingRelicId === relic._id && (
                      <span className="text-xs opacity-90">(click map)</span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {relics.length === 0 && !error && (
          <section
            className="mx-auto mt-8 max-w-xl rounded-2xl border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)]/90 p-10 sm:p-12 text-center shadow-lg"
            aria-label="No relics yet"
          >
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--totk-light-ocher)]/15 text-3xl text-[var(--totk-light-ocher)]">
              <i className="fa-solid fa-book-open" aria-hidden />
            </div>
            <h2 className="text-lg font-semibold text-[var(--botw-pale)] sm:text-xl">No relics have been archived yet</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--totk-grey-200)]">
              Relics are found during exploration and appraised by Artists or Researchers in Inariko. Once appraised, the owner of the character who found the relic should provide their artistic rendition based on the appraisal description; submit your art above to archive it in the Library.
            </p>
            {user && !sessionLoading && (
              <button
                type="button"
                onClick={() => setSubmitModalOpen(true)}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--totk-light-ocher)]/20 px-4 py-2.5 text-sm font-medium text-[var(--totk-light-ocher)] transition-colors hover:bg-[var(--totk-light-ocher)]/30"
              >
                <i className="fa-solid fa-cloud-arrow-up" aria-hidden />
                Submit your first relic
              </button>
            )}
          </section>
        )}

        {relics.length > 0 && (
          <section className="mt-10" aria-label="Archived relics list">
            <h2 className="mb-5 flex items-center gap-2 text-xl font-bold text-[var(--totk-light-ocher)]">
              <i className="fa-solid fa-scroll" aria-hidden />
              Archived relics
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2">
              {relics.map((relic) => (
                <article
                  key={relic._id}
                  className="flex flex-col overflow-hidden rounded-xl border border-[var(--totk-dark-ocher)]/60 bg-[var(--botw-warm-black)] shadow-lg transition-shadow hover:shadow-xl hover:shadow-black/20 sm:flex-row"
                >
                  <div className="relative h-32 w-full shrink-0 bg-[var(--totk-brown)] sm:h-auto sm:w-40">
                    {relic.imageUrl ? (
                      <img
                        src={normalizeImageUrl(relic.imageUrl)}
                        alt={relic.rollOutcome || relic.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-4xl text-[var(--totk-grey-300)]">
                        <i className="fa-solid fa-gem" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
                    <h3 className="text-base font-bold text-[var(--totk-light-ocher)] sm:text-lg">
                      {relic.rollOutcome || relic.name}
                    </h3>
                    <dl className="mt-2 grid grid-cols-1 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-3">
                      <dt className="text-[var(--totk-grey-200)]">Discovered By</dt>
                      <dd className="font-medium text-[var(--botw-pale)]">{relic.discoveredBy || "—"}</dd>
                      <dt className="text-[var(--totk-grey-200)]">Appraised By</dt>
                      <dd className="font-medium text-[var(--botw-pale)]">{relic.appraisedBy ?? "—"}</dd>
                      <dt className="text-[var(--totk-grey-200)]">Region</dt>
                      <dd className="font-medium text-[var(--botw-pale)]">{relic.region || "—"}</dd>
                      <dt className="text-[var(--totk-grey-200)]">Square</dt>
                      <dd className="font-medium text-[var(--botw-pale)]">{relic.square || "—"}</dd>
                      <dt className="text-[var(--totk-grey-200)]">Quadrant</dt>
                      <dd className="font-medium text-[var(--botw-pale)]">{relic.quadrant || "—"}</dd>
                    </dl>
                    <div className="mt-3 border-t border-[var(--totk-dark-ocher)]/40 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--totk-grey-200)]">Info</p>
                      <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-[var(--botw-pale)]/95">
                        {relic.appraisalDescription || "—"}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
