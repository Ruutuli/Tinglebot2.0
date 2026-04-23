"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  queuedAt?: string;
  tokenCalculation?: unknown;
  boostEffects?: string[];
  boostTokenIncrease?: number;
  questBonus?: string;
};

const BREAKDOWN_LABELS: [string, string][] = [
  ["baseTotal", "Base total"],
  ["baseTokens", "Base tokens"],
  ["typeMultiplierTotal", "Type multiplier (product)"],
  ["productMultiplier", "Product multiplier"],
  ["addOnTotal", "Add-ons"],
  ["specialWorksTotal", "Special works"],
  ["regularTotal", "Subtotal (pre-split)"],
  ["baseTokensPerPerson", "Base per person"],
  ["questBonus", "Quest bonus (per person)"],
  ["collabBonus", "Collab bonus (per person)"],
  ["tokensPerPerson", "Tokens per person"],
  ["finalTotal", "Final per person"],
  ["totalTokens", "Total (all participants)"],
  ["splitTokens", "Split / per person"],
];

/** Bot stores `generateTokenBreakdown` as a ```-wrapped string; may be one long line in JSON. */
function formatTokenBreakdownText(raw: string): string[] {
  let t = raw.trim();
  if (!t || t === "N/A") return [];

  t = t.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/i, "").trim();

  let footer = "";
  const collabMatch = t.match(/\n\n(Collab Total[^\n]*(?:\n[^\n]+)*)/);
  if (collabMatch) {
    footer = collabMatch[1].trim();
    t = t.slice(0, collabMatch.index).trim();
  }

  let lines: string[];
  if (t.includes("\n")) {
    lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  } else {
    let expanded = t
      .replace(/\s+-{10,}\s*/g, "\n────────\n")
      .replace(/\)\s+x\s+/gi, ")\n× ")
      .replace(/\s+x\s+(?=[A-Za-zÀ-ÿ])/g, "\n× ")
      .replace(/\s+\+\s+Quest Bonus/gi, "\n+ Quest Bonus");
    lines = expanded
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  if (footer) {
    lines.push(...footer.split("\n").map((l) => l.trim()).filter(Boolean));
  }

  return lines;
}

function tokenBreakdownRows(
  tc: unknown,
  questBonusStored?: string
): { label: string; value: string }[] {
  if (tc == null) return [];
  if (typeof tc === "string") {
    return [];
  }
  if (typeof tc !== "object" || Array.isArray(tc)) return [];

  const top = tc as Record<string, unknown>;
  const inner =
    top.breakdown && typeof top.breakdown === "object" && !Array.isArray(top.breakdown)
      ? (top.breakdown as Record<string, unknown>)
      : top;

  const rows: { label: string; value: string }[] = [];
  const used = new Set<string>();

  for (const [key, label] of BREAKDOWN_LABELS) {
    if (!(key in inner) || inner[key] === null || inner[key] === undefined || inner[key] === "") continue;
    const v = inner[key];
    if (typeof v === "object") continue;
    rows.push({ label, value: String(v) });
    used.add(key);
  }

  for (const k of Object.keys(inner)) {
    if (used.has(k) || k === "breakdown") continue;
    const v = inner[k];
    if (v === null || v === undefined) continue;
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") {
      const pretty = k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
      rows.push({ label: pretty.trim(), value: String(v) });
    }
  }

  if (
    questBonusStored &&
    questBonusStored !== "N/A" &&
    !rows.some((r) => r.label.includes("Quest bonus"))
  ) {
    rows.push({ label: "Quest bonus (quest field)", value: questBonusStored });
  }

  return rows;
}

function previewUrl(fileUrl: string | undefined): string {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("https://storage.googleapis.com/tinglebot/")) {
    return imageUrlForGcsUrl(fileUrl);
  }
  return fileUrl;
}

function formatQueuedAt(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(t);
}

export default function AdminArtSubmissionsPage() {
  const { user, isAdmin, isModerator, loading: sessionLoading } = useSession();
  const [items, setItems] = useState<PendingSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");
  /** False when dashboard env is missing BOT_INTERNAL_API_URL / BOT_INTERNAL_API_SECRET (approval must use Discord). */
  const [botInternalApiConfigured, setBotInternalApiConfigured] = useState(true);

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
      const data = await res.json() as
        | PendingSubmission[]
        | { items: PendingSubmission[]; botInternalApiConfigured?: boolean };
      if (Array.isArray(data)) {
        setItems(data);
        setBotInternalApiConfigured(true);
      } else {
        setItems(Array.isArray(data.items) ? data.items : []);
        setBotInternalApiConfigured(data.botInternalApiConfigured !== false);
      }
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

  const pendingCount = items.length;

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

  const subtitle = useMemo(
    () =>
      "Only submissions that are posted in Discord (with a valid message link) appear here. Duplicates and entries already in the approved log are hidden.",
    []
  );

  if (sessionLoading || !user) {
    return (
      <div className="flex min-h-[calc(100dvh-56px)] items-center justify-center">
        <Loading message="Loading..." variant="inline" size="lg" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-[calc(100dvh-56px)] p-4 sm:p-6 md:p-8">
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
    <div className="min-h-[calc(100dvh-56px)] bg-gradient-to-b from-[var(--botw-warm-black)] via-[var(--botw-warm-black)] to-black/20 p-4 sm:p-6 md:p-8">
      <div className="mx-auto max-w-[1100px]">
        <header className="mb-8 text-center">
          <div className="mb-4 flex items-center justify-center gap-3 sm:gap-4">
            <img src="/Side=Left.svg" alt="" className="h-5 w-auto opacity-90 sm:h-7" aria-hidden />
            <h1 className="text-2xl font-bold tracking-tight text-[var(--totk-light-ocher)] sm:text-3xl md:text-4xl">
              Art &amp; writing queue
            </h1>
            <img src="/Side=Right.svg" alt="" className="h-5 w-auto opacity-90 sm:h-7" aria-hidden />
          </div>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-[var(--botw-pale)]">
            Same actions as{" "}
            <code className="rounded bg-[var(--totk-dark-green)]/30 px-1.5 py-0.5 text-[var(--totk-light-ocher)]">
              /mod submission approve
            </code>{" "}
            — tokens, Discord embeds, DMs, and quest hooks run on the bot.
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-xs leading-relaxed text-[var(--totk-grey-200)]">
            {subtitle}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--totk-dark-ocher)] bg-[var(--totk-grey-900)]/80 px-4 py-1.5 text-sm text-[var(--totk-ivory)] shadow-inner">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--totk-light-green)]" aria-hidden />
              {pendingCount} pending
            </span>
            <button
              type="button"
              onClick={() => fetchItems()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--totk-dark-ocher)] bg-[var(--totk-dark-green)]/25 px-4 py-1.5 text-sm font-medium text-[var(--totk-ivory)] transition hover:bg-[var(--totk-dark-green)]/40 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] disabled:opacity-50"
            >
              <span className="inline-block" aria-hidden>
                ↻
              </span>
              Refresh
            </button>
          </div>
        </header>

        {!botInternalApiConfigured && (
          <div
            role="status"
            className="mb-6 rounded-xl border border-amber-500/45 bg-amber-950/35 p-4 text-left text-sm leading-relaxed text-amber-100 shadow-lg backdrop-blur-sm"
          >
            <p className="font-semibold text-amber-50">Dashboard cannot reach the bot to approve or deny</p>
            <p className="mt-2 text-amber-100/90">
              The site is missing <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">BOT_INTERNAL_API_URL</code> and/or{" "}
              <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">BOT_INTERNAL_API_SECRET</code> in this deployment’s environment.
              Set the URL to your bot’s HTTP base (same <code className="font-mono text-xs">PORT</code> as <code className="font-mono text-xs">/health</code>; no path). Use the{" "}
              <strong>same secret</strong> on the bot process. Then redeploy the dashboard.
            </p>
            <p className="mt-3 text-amber-100/90">
              Until then, use{" "}
              <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs">/mod submission approve</code> in Discord with the submission ID.
            </p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-500/40 bg-red-950/40 p-4 text-center text-sm text-red-200 shadow-lg backdrop-blur-sm"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loading message="Loading submissions…" variant="inline" size="lg" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)]/80 p-14 text-center shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
            <p className="text-lg text-[var(--totk-light-ocher)]">Queue is clear</p>
            <p className="mt-2 text-sm text-[var(--botw-pale)]">
              Nothing waiting that matches a live Discord post and isn&apos;t already approved.
            </p>
          </div>
        ) : (
          <ul className="space-y-5">
            {items.map((sub) => {
              const img = previewUrl(sub.fileUrl);
              const isDeny = denyingId === sub.submissionId;
              const isWriting = sub.category === "writing";
              const queuedLabel = formatQueuedAt(sub.queuedAt);
              const breakdownRows = tokenBreakdownRows(sub.tokenCalculation, sub.questBonus);
              const textBreakdownLines =
                typeof sub.tokenCalculation === "string"
                  ? formatTokenBreakdownText(sub.tokenCalculation)
                  : [];
              const hasBoostFx =
                (sub.boostEffects?.length ?? 0) > 0 ||
                (typeof sub.boostTokenIncrease === "number" && sub.boostTokenIncrease > 0);
              const showBreakdown =
                breakdownRows.length > 0 ||
                textBreakdownLines.length > 0 ||
                hasBoostFx ||
                (sub.tokenCalculation != null &&
                  typeof sub.tokenCalculation === "object");
              const jsonFallback =
                breakdownRows.length === 0 &&
                textBreakdownLines.length === 0 &&
                sub.tokenCalculation != null &&
                typeof sub.tokenCalculation === "object";

              return (
                <li key={sub.submissionId}>
                  <article
                    className={`group relative overflow-hidden rounded-2xl border border-[var(--totk-dark-ocher)] bg-[var(--botw-warm-black)] shadow-lg transition hover:border-[var(--totk-dark-ocher)]/80 hover:shadow-xl ${
                      isWriting
                        ? "ring-1 ring-orange-500/20"
                        : "ring-1 ring-[var(--totk-light-green)]/15"
                    }`}
                  >
                    <div
                      className={`absolute left-0 top-0 h-full w-1 ${
                        isWriting ? "bg-gradient-to-b from-orange-400 to-orange-700" : "bg-gradient-to-b from-[var(--totk-light-green)] to-[var(--totk-dark-green)]"
                      }`}
                      aria-hidden
                    />
                    <div className="flex flex-col gap-5 p-5 pl-6 sm:flex-row sm:items-stretch">
                      <div
                        className={`relative h-36 w-full shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-[var(--totk-grey-900)] to-black sm:h-44 sm:w-44 ${
                          img ? "ring-1 ring-white/5" : ""
                        }`}
                      >
                        {img ? (
                          <img
                            src={img}
                            alt=""
                            className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.02]"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--totk-grey-500)]">
                            <span className="text-4xl">{isWriting ? "📝" : "🎨"}</span>
                            <span className="text-xs uppercase tracking-wider">Preview</span>
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex flex-1 flex-col">
                        <div className="flex flex-wrap items-start gap-2 gap-y-2">
                          <h2 className="text-lg font-semibold leading-snug text-[var(--totk-ivory)] sm:text-xl">
                            {sub.title}
                          </h2>
                          <span
                            className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                              isWriting
                                ? "bg-orange-500/20 text-orange-200"
                                : "bg-[var(--totk-light-green)]/20 text-[var(--totk-light-green)]"
                            }`}
                          >
                            {isWriting ? "Writing" : "Art"}
                          </span>
                          <span className="shrink-0 rounded-md bg-[var(--totk-dark-green)]/40 px-2 py-0.5 text-xs font-medium text-[var(--totk-ivory)]">
                            {sub.finalTokenAmount} tokens
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--botw-pale)]">
                          <span>
                            ID{" "}
                            <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[var(--totk-light-ocher)]">
                              {sub.submissionId}
                            </code>
                          </span>
                          {queuedLabel && <span className="text-[var(--totk-grey-200)]">Queued {queuedLabel}</span>}
                        </div>

                        <p className="mt-2 text-sm text-[var(--botw-pale)]">
                          <span className="text-[var(--totk-grey-200)]">Submitter</span>{" "}
                          <span className="text-[var(--totk-ivory)]">{sub.username || "—"}</span>{" "}
                          <span className="font-mono text-xs text-[var(--totk-grey-200)]">({sub.userId})</span>
                        </p>

                        {sub.questEvent && sub.questEvent !== "N/A" && (
                          <p className="mt-1 text-xs text-[var(--totk-light-ocher)]">
                            Quest <span className="font-mono">{sub.questEvent}</span>
                          </p>
                        )}

                        {showBreakdown && (
                          <div className="mt-3 rounded-xl border border-[var(--totk-dark-ocher)] bg-black/30 p-3">
                            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--totk-light-ocher)]">
                              Token breakdown
                            </h3>
                            {textBreakdownLines.length > 0 ? (
                              <ul className="list-none space-y-2 border-l-2 border-[var(--totk-light-green)]/35 pl-3 font-mono text-[11px] leading-relaxed text-[var(--botw-pale)] sm:text-xs">
                                {textBreakdownLines.map((line, i) => {
                                  const isRule = /^[─\-]{6,}$/.test(line);
                                  const isTotal = /^\s*\d+\s*Tokens?\s*$/i.test(line);
                                  const isCollab = /^Collab\b/i.test(line);
                                  const isMult = /^×\s/i.test(line);
                                  const isAdd = /^\+ /.test(line);
                                  return (
                                    <li
                                      key={`${sub.submissionId}-txt-${i}`}
                                      className={`${
                                        isRule
                                          ? "my-1 list-none border-t border-white/15 py-2 text-center text-[10px] tracking-wider text-[var(--totk-grey-500)]"
                                          : "break-words"
                                      } ${isTotal ? "text-sm font-semibold text-[var(--totk-light-green)]" : ""} ${
                                        isCollab ? "text-[var(--totk-light-ocher)]" : ""
                                      } ${isMult && !isTotal ? "text-[var(--totk-ivory)]" : ""} ${
                                        isAdd ? "text-[var(--totk-grey-200)]" : ""
                                      }`}
                                    >
                                      {line}
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : breakdownRows.length > 0 ? (
                              <dl className="divide-y divide-white/5 text-xs">
                                {breakdownRows.map((r, i) => (
                                  <div
                                    key={`${sub.submissionId}-br-${i}`}
                                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 first:pt-0"
                                  >
                                    <dt className="text-[var(--totk-grey-200)]">{r.label}</dt>
                                    <dd className="font-mono text-[var(--totk-ivory)]">{r.value}</dd>
                                  </div>
                                ))}
                              </dl>
                            ) : jsonFallback ? (
                              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-black/40 p-2 font-mono text-[11px] text-[var(--botw-pale)]">
                                {JSON.stringify(sub.tokenCalculation, null, 2)}
                              </pre>
                            ) : (
                              <p className="text-xs text-[var(--totk-grey-200)]">
                                No structured breakdown on file; compare with the Discord embed.
                              </p>
                            )}
                            {hasBoostFx && (
                              <div className="mt-2 border-t border-white/10 pt-2">
                                {typeof sub.boostTokenIncrease === "number" &&
                                  sub.boostTokenIncrease > 0 && (
                                    <p className="text-xs text-[var(--totk-light-green)]">
                                      +{sub.boostTokenIncrease} tokens from character boosts
                                    </p>
                                  )}
                                {sub.boostEffects?.map((line, i) => (
                                  <p
                                    key={`${sub.submissionId}-boost-${i}`}
                                    className="text-[11px] leading-snug text-[var(--botw-pale)]"
                                  >
                                    {line.replace(/\*\*/g, "")}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {sub.messageUrl && (
                          <a
                            href={sub.messageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg border border-[var(--totk-light-green)]/35 bg-[var(--totk-light-green)]/10 px-3 py-1.5 text-sm font-medium text-[var(--totk-light-green)] transition hover:bg-[var(--totk-light-green)]/20 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)]"
                          >
                            Open in Discord
                            <span aria-hidden>↗</span>
                          </a>
                        )}

                        {isDeny && (
                          <div className="mt-4 rounded-xl border border-red-500/25 bg-red-950/20 p-3">
                            <label className="mb-2 block text-xs font-medium text-red-200/90">
                              Reason for denial (DM’d to the user)
                            </label>
                            <textarea
                              value={denyReason}
                              onChange={(e) => setDenyReason(e.target.value)}
                              rows={3}
                              className="w-full resize-y rounded-lg border border-red-500/30 bg-black/40 p-3 text-sm text-[var(--totk-ivory)] placeholder:text-[var(--totk-grey-500)] focus:border-red-400/50 focus:outline-none focus:ring-1 focus:ring-red-400/40"
                              placeholder="Explain what needs to change…"
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col justify-center gap-2 sm:w-[140px]">
                        <button
                          type="button"
                          onClick={() => handleApprove(sub.submissionId)}
                          disabled={actionId === sub.submissionId || !botInternalApiConfigured}
                          className="rounded-xl bg-[var(--totk-light-green)] px-4 py-2.5 text-sm font-semibold text-black shadow-md transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--totk-light-green)] focus:ring-offset-2 focus:ring-offset-[var(--botw-warm-black)] disabled:opacity-50"
                        >
                          {actionId === sub.submissionId ? "Working…" : "Approve"}
                        </button>
                        {!isDeny ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDenyingId(sub.submissionId);
                              setDenyReason("");
                              setError(null);
                            }}
                            disabled={actionId === sub.submissionId || !botInternalApiConfigured}
                            className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-400/50 focus:ring-offset-2 focus:ring-offset-[var(--botw-warm-black)] disabled:opacity-50"
                          >
                            Deny
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDeny(sub.submissionId)}
                              disabled={actionId === sub.submissionId || !botInternalApiConfigured}
                              className="rounded-xl border border-red-400 bg-red-600/80 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50"
                            >
                              {actionId === sub.submissionId ? "Working…" : "Confirm deny"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDenyingId(null);
                                setDenyReason("");
                              }}
                              className="rounded-xl border border-[var(--totk-dark-ocher)] px-4 py-2 text-sm text-[var(--botw-pale)] transition hover:bg-[var(--totk-dark-green)]/25 focus:outline-none focus:ring-2 focus:ring-[var(--totk-dark-ocher)]"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
