"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loading, Modal } from "@/components/ui";
import { useSession } from "@/hooks/use-session";

const LIBRARY_IMAGE = "/assets/library.png";

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
  const { user, loading: sessionLoading } = useSession();
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
  const [uploading, setUploading] = useState(false);
  const [loadRelicLoading, setLoadRelicLoading] = useState(false);
  const [loadRelicError, setLoadRelicError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [editPlacement, setEditPlacement] = useState(false);
  const [placingRelicId, setPlacingRelicId] = useState<string | null>(null);
  const [savingPlacement, setSavingPlacement] = useState<string | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchArchives = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/relics/archives", { cache: "no-store" });
      if (!res.ok) {
        setError("Failed to load archived relics");
        setRelics([]);
        return;
      }
      const data = await res.json();
      setRelics(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRelics([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchArchives();
  }, [fetchArchives]);

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
    fetchArchives,
  ]);

  const updatePlacement = useCallback(
    async (relicId: string, libraryPositionX: number, libraryPositionY: number, libraryDisplaySize?: number) => {
      setSavingPlacement(relicId);
      try {
        const res = await fetch(`/api/relics/archives/${relicId}/placement`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            libraryPositionX,
            libraryPositionY,
            ...(libraryDisplaySize != null && { libraryDisplaySize }),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setUploadMessage({ type: "err", text: data.error || "Failed to save position" });
          return;
        }
        setUploadMessage({ type: "ok", text: "Position saved." });
        fetchArchives();
      } catch (e) {
        setUploadMessage({ type: "err", text: e instanceof Error ? e.message : "Failed to save" });
      } finally {
        setSavingPlacement(null);
      }
    },
    [fetchArchives]
  );

  const handleMapClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!placingRelicId || !mapContainerRef.current) return;
      const rect = mapContainerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));
      updatePlacement(placingRelicId, clampedX, clampedY);
      setPlacingRelicId(null);
    },
    [placingRelicId, updatePlacement]
  );

  const handleMapDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!mapContainerRef.current || !editPlacement) return;
      const relicId = e.dataTransfer.getData("text/plain");
      if (!relicId) return;
      const rect = mapContainerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const clampedX = Math.max(0, Math.min(100, x));
      const clampedY = Math.max(0, Math.min(100, y));
      const relic = relics.find((r) => r._id === relicId);
      const size = relic?.libraryDisplaySize ?? 8;
      updatePlacement(relicId, clampedX, clampedY, size);
    },
    [editPlacement, relics, updatePlacement]
  );

  const placedRelics = relics.filter(
    (r) =>
      r.imageUrl &&
      r.libraryPositionX != null &&
    r.libraryPositionY != null
  );
  const unplacedRelics = relics.filter(
    (r) => r.imageUrl && (r.libraryPositionX == null || r.libraryPositionY == null)
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loading message="Loading Library Archives..." variant="inline" size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-full p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="mb-6 flex items-center justify-center gap-2 sm:gap-4">
          <img src="/Side=Left.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
          <h1 className="text-center text-xl font-bold text-[var(--totk-light-ocher)] sm:text-2xl md:text-3xl">
            Library Archives
          </h1>
          <img src="/Side=Right.svg" alt="" className="h-4 w-auto sm:h-6" aria-hidden />
        </div>

        <p className="mb-6 text-center text-sm text-[var(--botw-pale)]">
          Appraised relics donated to the Library. Place them on the map below. Discovered during expeditions across Hyrule.
        </p>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-center text-red-400">
            {error}
          </div>
        )}

        {user && !sessionLoading && (
          <div className="mb-6 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setSubmitModalOpen(true);
                setUploadMessage(null);
              }}
              className="rounded bg-[var(--totk-light-ocher)] px-5 py-2.5 font-medium text-[var(--botw-warm-black)] hover:opacity-90"
            >
              <i className="fa-solid fa-upload mr-2" aria-hidden />
              Submit relic to archives
            </button>
          </div>
        )}

        {uploadMessage && (
          <div
            className={`mb-6 rounded-lg p-4 text-center ${
              uploadMessage.type === "ok"
                ? "border border-[var(--totk-light-green)]/50 bg-[var(--totk-light-green)]/10 text-[var(--totk-light-green)]"
                : "border border-red-500/50 bg-red-500/10 text-red-400"
            }`}
          >
            <p>{uploadMessage.text}</p>
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
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-1 min-w-[120px] flex-col gap-1">
                  <span className="text-xs text-[var(--totk-grey-200)]">Relic ID <span className="text-red-400">*</span></span>
                  <input
                    type="text"
                    value={uploadRelicId}
                    onChange={(e) => setUploadRelicId(e.target.value)}
                    placeholder="e.g. R12345"
                    className="rounded border border-[var(--totk-dark-ocher)] bg-[var(--totk-grey-900)] px-3 py-2 text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-500)]"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleLoadRelic}
                  disabled={loadRelicLoading}
                  className="rounded border border-[var(--totk-dark-ocher)] bg-[var(--totk-grey-900)] px-4 py-2 text-sm text-[var(--botw-pale)] hover:bg-[var(--totk-grey-800)] disabled:opacity-50"
                >
                  {loadRelicLoading ? "Loading…" : "Load"}
                </button>
              </div>
              {loadRelicError && (
                <p className="text-sm text-red-400">{loadRelicError}</p>
              )}

              {(uploadTitle || uploadDiscoveredBy || uploadAppraisedBy) && (
                <div className="rounded border border-[var(--totk-dark-ocher)]/50 bg-[var(--totk-grey-900)]/50 p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--totk-grey-400)]">Auto-filled from relic</p>
                  <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                    <div><dt className="text-[var(--totk-grey-400)]">Title</dt><dd className="text-[var(--botw-pale)]">{uploadTitle || "—"}</dd></div>
                    <div><dt className="text-[var(--totk-grey-400)]">Discovered By</dt><dd className="text-[var(--botw-pale)]">{uploadDiscoveredBy || "—"}</dd></div>
                    <div><dt className="text-[var(--totk-grey-400)]">Appraised By</dt><dd className="text-[var(--botw-pale)]">{uploadAppraisedBy || "—"}</dd></div>
                    {(uploadRegion || uploadSquare || uploadQuadrant) && (
                      <div className="sm:col-span-2"><dt className="text-[var(--totk-grey-400)]">Region / Square / Quadrant</dt><dd className="text-[var(--botw-pale)]">{[uploadRegion, uploadSquare, uploadQuadrant].filter(Boolean).join(" • ") || "—"}</dd></div>
                    )}
                  </dl>
                </div>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--totk-grey-200)]">Info (description) <span className="text-red-400">*</span></span>
                <textarea
                  value={uploadInfo}
                  onChange={(e) => setUploadInfo(e.target.value)}
                  placeholder="Appraisal description / lore (e.g. A sliver of agatized coral...)"
                  rows={4}
                  className="rounded border border-[var(--totk-dark-ocher)] bg-[var(--totk-grey-900)] px-3 py-2 text-[var(--botw-pale)] placeholder:text-[var(--totk-grey-500)]"
                />
              </label>
              <div className="flex flex-col gap-2">
                <span className="text-xs text-[var(--totk-grey-200)]">Image <span className="text-red-400">*</span></span>
                <p className="text-xs text-[var(--totk-grey-400)]">
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
                    className="rounded border-2 border-dashed border-[var(--totk-dark-ocher)] bg-[var(--totk-grey-900)] px-4 py-3 text-sm font-medium text-[var(--botw-pale)] hover:border-[var(--totk-light-ocher)] hover:bg-[var(--totk-grey-800)]"
                  >
                    <i className="fa-solid fa-image mr-2" aria-hidden />
                    {uploadFile ? "Change image" : "Choose image"}
                  </button>
                  {uploadFile && (
                    <span className="text-sm text-[var(--totk-grey-300)]">
                      {uploadFile.name}
                    </span>
                  )}
                </div>
                {uploadPreviewUrl && (
                  <div className="mt-1 flex items-start gap-3">
                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded border border-[var(--totk-dark-ocher)] bg-[var(--totk-grey-900)]">
                      <img
                        src={uploadPreviewUrl}
                        alt="Preview"
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUploadFile(null);
                        if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
                        setUploadPreviewUrl(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      className="text-sm text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="rounded bg-[var(--totk-light-ocher)] px-4 py-2 font-medium text-[var(--botw-warm-black)] hover:opacity-90 disabled:opacity-50"
              >
                {uploading ? "Submitting…" : "Submit for approval"}
              </button>
            </div>
            {uploadMessage && (
              <p
                className={`mt-3 text-sm ${uploadMessage.type === "ok" ? "text-[var(--totk-light-green)]" : "text-red-400"}`}
              >
                {uploadMessage.text}
              </p>
            )}
          </Modal>
        )}

        <div className="mb-6 flex flex-wrap items-center justify-center gap-4">
          {user && !sessionLoading && relics.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={editPlacement}
                onChange={(e) => {
                  setEditPlacement(e.target.checked);
                  setPlacingRelicId(null);
                }}
                className="rounded border-[var(--totk-dark-ocher)]"
              />
              <span className="text-sm text-[var(--botw-pale)]">Edit placement on map</span>
            </label>
          )}
        </div>

        <div
          ref={mapContainerRef}
          className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]"
          style={{ aspectRatio: "1" }}
          onClick={placingRelicId ? handleMapClick : undefined}
          role={placingRelicId ? "button" : undefined}
          tabIndex={placingRelicId ? 0 : undefined}
          onDragOver={(e) => {
            e.preventDefault();
            if (editPlacement) e.dataTransfer.dropEffect = "move";
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
            const x = relic.libraryPositionX ?? 0;
            const y = relic.libraryPositionY ?? 0;
            const size = relic.libraryDisplaySize ?? 8;
            const url = normalizeImageUrl(relic.imageUrl);
            const isDraggable = editPlacement && user;
            const isSaving = savingPlacement === relic._id;
            return (
              <div
                key={relic._id}
                className="absolute z-10 cursor-move rounded border-2 border-[var(--totk-light-ocher)]/50 bg-[var(--totk-grey-900)]/80 shadow-lg transition hover:border-[var(--totk-light-ocher)]"
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
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-2xl text-[var(--totk-grey-600)]">
                    🔸
                  </div>
                )}
                {isSaving && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[var(--totk-light-ocher)]">
                    <i className="fa-solid fa-spinner fa-spin" aria-hidden />
                  </div>
                )}
              </div>
            );
          })}
          {placingRelicId && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 text-[var(--totk-light-ocher)]">
              <span className="rounded bg-[var(--botw-warm-black)] px-4 py-2">Click on the map to place this relic</span>
            </div>
          )}
        </div>

        {editPlacement && user && unplacedRelics.length > 0 && (
          <div className="mx-auto mt-6 max-w-4xl rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-4">
            <h3 className="mb-2 font-semibold text-[var(--totk-light-ocher)]">Unplaced relics — click Place then click on the map</h3>
            <div className="flex flex-wrap gap-2">
              {unplacedRelics.map((relic) => (
                <button
                  key={relic._id}
                  type="button"
                  onClick={() => setPlacingRelicId(placingRelicId === relic._id ? null : relic._id)}
                  className={`flex items-center gap-2 rounded border px-3 py-2 text-sm ${
                    placingRelicId === relic._id
                      ? "border-[var(--totk-light-ocher)] bg-[var(--totk-light-ocher)]/20 text-[var(--totk-light-ocher)]"
                      : "border-[var(--totk-dark-ocher)] text-[var(--botw-pale)] hover:bg-[var(--totk-grey-900)]"
                  }`}
                >
                  {relic.imageUrl && (
                    <img
                      src={normalizeImageUrl(relic.imageUrl)}
                      alt=""
                      className="h-8 w-8 rounded object-cover"
                    />
                  )}
                  <span>{relic.rollOutcome || relic.relicId || relic.name}</span>
                  <span className="text-xs opacity-80">{placingRelicId === relic._id ? " (click map)" : "Place"}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {relics.length === 0 && !error && (
          <div className="mt-6 rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] p-12 text-center">
            <p className="text-[var(--botw-pale)]">No relics have been archived yet.</p>
            <p className="mt-2 text-sm text-[var(--totk-grey-200)]">
              Relics are found during exploration and appraised by Artists or Researchers in Inariko. After revealing with{" "}
              <code className="rounded bg-[var(--totk-grey-800)] px-1">/relic reveal</code>, submit your art above to archive.
            </p>
          </div>
        )}

        {relics.length > 0 && (
          <div className="mt-8">
            <h2 className="mb-4 text-lg font-bold text-[var(--totk-light-ocher)]">Archived relics</h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {relics.map((relic) => (
                <article
                  key={relic._id}
                  className="flex overflow-hidden rounded-lg border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-lg"
                >
                  <div className="relative w-36 shrink-0 bg-[var(--totk-grey-900)] sm:w-40">
                    {relic.imageUrl ? (
                      <img
                        src={normalizeImageUrl(relic.imageUrl)}
                        alt={relic.rollOutcome || relic.name}
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-5xl text-[var(--totk-grey-600)]">
                        🔸
                      </div>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col p-4">
                    <h3 className="text-lg font-bold text-[var(--totk-light-ocher)]">
                      {relic.rollOutcome || relic.name}
                    </h3>
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-[var(--totk-grey-400)]">Discovered By:</dt>
                      <dd className="text-[var(--botw-pale)]">{relic.discoveredBy || "—"}</dd>
                      <dt className="text-[var(--totk-grey-400)]">Appraised By:</dt>
                      <dd className="text-[var(--botw-pale)]">{relic.appraisedBy ?? "—"}</dd>
                      <dt className="text-[var(--totk-grey-400)]">Region:</dt>
                      <dd className="text-[var(--botw-pale)]">{relic.region || "—"}</dd>
                      <dt className="text-[var(--totk-grey-400)]">Square:</dt>
                      <dd className="text-[var(--botw-pale)]">{relic.square || "—"}</dd>
                      <dt className="text-[var(--totk-grey-400)]">Quadrant:</dt>
                      <dd className="text-[var(--botw-pale)]">{relic.quadrant || "—"}</dd>
                    </dl>
                    <div className="mt-3 border-t border-[var(--totk-dark-ocher)]/50 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--totk-grey-400)]">Info</p>
                      <p className="mt-1 text-sm text-[var(--botw-pale)]">
                        {relic.appraisalDescription || "—"}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
