import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { getBotInternalApiConfig } from "@/lib/config";
import { logger } from "@/utils/logger";

const LOG = "api/admin/pending-submissions/[submissionId]";
const SAMPLE = 12;

export const dynamic = "force-dynamic";

function normalizeSubmissionId(raw: unknown): string {
  if (raw == null) return "";
  return String(raw)
    .replace(/^[`"'[\s]+|[`"'[\s]+$/g, "")
    .trim();
}

/** Same as GET /api/admin/pending-submissions: id shown in the admin list for a TempData row. */
function listDisplaySubmissionId(doc: { key: string; data?: unknown }): string {
  const d = (doc.data || {}) as Record<string, unknown>;
  return (
    normalizeSubmissionId(d.submissionId) || normalizeSubmissionId(doc.key) || String(doc.key ?? "")
  );
}

/** POST /api/admin/pending-submissions/[submissionId] — approve or deny via bot (Discord reactions, DMs, tokens, quests). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> }
) {
  const session = await getSession();
  const user = session?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const [isAdmin, isMod] = await Promise.all([
    isAdminUser(user.id),
    isModeratorUser(user.id),
  ]);
  if (!isAdmin && !isMod) {
    return NextResponse.json({ error: "Moderator or admin access required" }, { status: 403 });
  }

  const { submissionId: rawId } = await params;
  const rawDecoded = decodeURIComponent(rawId || "").trim();
  const submissionId = normalizeSubmissionId(rawDecoded) || rawDecoded;
  if (!submissionId) {
    return NextResponse.json({ error: "Submission ID required" }, { status: 400 });
  }

  let body: { action?: string; reason?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = body.action === "approve" || body.action === "deny" ? body.action : null;
  if (!action) {
    return NextResponse.json({ error: 'Body must include action: "approve" or "deny"' }, { status: 400 });
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  if (action === "deny" && !reason) {
    return NextResponse.json({ error: "Reason is required when denying" }, { status: 400 });
  }

  let botSubmissionId = submissionId;

  logger.info(
    LOG,
    `POST start action=${action} normalizedId=${submissionId} rawParam=${rawDecoded} rawDiffersFromNorm=${rawDecoded !== submissionId} modUserId=${user.id}`
  );

  try {
    await connect();
    const TempData = (await import("@/models/TempDataModel.js")).default;
    const ApprovedSubmission = (await import("@/models/ApprovedSubmissionModel.js")).default;

    const now = new Date();

    const alreadyApproved = await ApprovedSubmission.findOne({
      $or: [
        { submissionId },
        ...(rawDecoded !== submissionId ? [{ submissionId: rawDecoded }] : []),
      ],
    }).lean();

    if (alreadyApproved) {
      logger.warn(
        LOG,
        `POST 409 already in ApprovedSubmission normalizedId=${submissionId} (stale list)`
      );
      return NextResponse.json(
        { error: "This submission is already approved (stale queue entry was ignored)." },
        { status: 409 }
      );
    }

    const keyOrIdClauses: Record<string, string>[] = [
      { key: submissionId },
      { "data.submissionId": submissionId },
    ];
    if (rawDecoded !== submissionId) {
      keyOrIdClauses.push({ key: rawDecoded }, { "data.submissionId": rawDecoded });
    }

    type SubmissionRow = { data?: unknown; key: string; expiresAt?: Date; createdAt?: Date };

    let existing: SubmissionRow | null = (await TempData.findOne({
      type: "submission",
      expiresAt: { $gt: now },
      $or: keyOrIdClauses,
    })
      .sort({ createdAt: -1 })
      .exec()) as SubmissionRow | null;

    let resolution: "strictOr" | "listIdScan" = "strictOr";
    const allPendingScanned: SubmissionRow[] = [];

    if (!existing) {
      logger.info(LOG, "strict $or lookup miss; running listId scan (same id formula as GET list)");
      // Strict key / data.submissionId equality can miss rows where the list ID is built from
      // `normalize(d.submissionId) || normalize(key)` (see GET) but stored key ≠ normalized id.
      const allPending = (await TempData.find({
        type: "submission",
        expiresAt: { $gt: now },
      })
        .sort({ createdAt: -1 })
        .lean()) as SubmissionRow[];

      allPendingScanned.push(...allPending);
      logger.info(LOG, `listId scan candidate rows (non-expired type=submission): ${allPending.length}`);

      for (const row of allPending) {
        const k = listDisplaySubmissionId(row);
        if (
          k === submissionId ||
          (k && k.toLowerCase() === submissionId.toLowerCase()) ||
          (rawDecoded &&
            (k === normalizeSubmissionId(rawDecoded) ||
              k.toLowerCase() === String(rawDecoded).toLowerCase()))
        ) {
          existing = row;
          resolution = "listIdScan";
          break;
        }
      }
    } else {
      logger.info(
        LOG,
        `TempData found via strict $or: keyInDoc=${String(existing.key)} data.submissionId(raw)=${JSON.stringify(
          (existing.data as Record<string, unknown> | undefined)?.submissionId
        )}`
      );
    }

    if (existing) {
      logger.info(LOG, `TempData resolution=${resolution} action=${action}`);
    }

    if (!existing) {
      const nowMs = now.getTime();
      const sample = allPendingScanned.slice(0, SAMPLE).map((row) => {
        const d = (row.data || {}) as Record<string, unknown>;
        const exp = row.expiresAt ? new Date(row.expiresAt).getTime() : null;
        return {
          key: String(row.key),
          listId: listDisplaySubmissionId(row),
          dataSidNorm: normalizeSubmissionId(d.submissionId),
          expiresInMs: exp != null && !Number.isNaN(exp) ? exp - nowMs : null,
        };
      });
      const submissionTypeCount = await TempData.countDocuments({ type: "submission" });
      const nonExpiredSubmissionCount = await TempData.countDocuments({
        type: "submission",
        expiresAt: { $gt: now },
      });

      logger.warn(
        LOG,
        `POST 404 no TempData for approve/deny; requestId=${submissionId} scannedPendingRows=${allPendingScanned.length} allSubmissionTypeDocs=${submissionTypeCount} submissionNonExpired=${nonExpiredSubmissionCount} sampleListIds=${JSON.stringify(
          sample
        )} keyOrIdClauses=${JSON.stringify(keyOrIdClauses)}`
      );

      return NextResponse.json(
        { error: "Submission not found or already processed" },
        { status: 404 }
      );
    }

    const data = existing.data as Record<string, unknown> | undefined;
    const dataSid = data ? normalizeSubmissionId(data.submissionId) : "";
    botSubmissionId = dataSid || String(existing.key);

    logger.info(
      LOG,
      `botSubmissionId to forward=${botSubmissionId} (normalized data.sid vs key; resolution=${resolution})`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error";
    logger.error(LOG, `DB error: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const { baseUrl: botBase, secret, isConfigured } = getBotInternalApiConfig();
  if (!isConfigured || !botBase || !secret) {
    logger.warn(
      LOG,
      `POST 503 BOT_INTERNAL not configured: hasBase=${Boolean(botBase)} hasSecret=${Boolean(secret)}`
    );
    return NextResponse.json(
      {
        error:
          "Dashboard approval is not wired to the bot: this deployment is missing BOT_INTERNAL_API_URL and/or BOT_INTERNAL_API_SECRET. Add both to the dashboard environment (URL = bot HTTP base, same port as /health; secret must match the bot). Until then, use /mod submission approve in Discord.",
        code: "BOT_INTERNAL_API_NOT_CONFIGURED" as const,
      },
      { status: 503 }
    );
  }

  logger.info(
    LOG,
    `forwarding to bot: baseUrlHost=${((): string => {
      try {
        return new URL(botBase).host;
      } catch {
        return "(invalid base URL)";
      }
    })()} botSubmissionId=${botSubmissionId} action=${action}`
  );

  const moderatorTag = `${user.global_name || user.username} (dashboard)`;

  try {
    const res = await fetch(`${botBase}/internal/pending-submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bot-internal-secret": secret,
      },
      body: JSON.stringify({
        submissionId: botSubmissionId,
        action,
        reason,
        moderatorTag,
        moderatorId: user.id,
        approvalInteractionId: null,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      message?: string;
      status?: string;
      code?: number;
    };

    const upstreamText =
      typeof data.error === "string"
        ? data.error
        : typeof data.message === "string"
          ? data.message
          : JSON.stringify(data).slice(0, 500);

    if (!res.ok) {
      const errText = upstreamText.slice(0, 500);
      logger.warn(
        LOG,
        `bot /internal/pending-submissions not ok: status=${res.status} err=${errText} botSubmissionId=${botSubmissionId} action=${action} botHost=${
          (() => {
            try {
              return new URL(botBase).host;
            } catch {
              return "";
            }
          })()
        }`
      );

      // Railway often returns 404 with JSON { message: "Application not found" } when the public
      // hostname is stale or the service was removed. That is a wiring issue, not "submission not
      // found" (TempData was already found above).
      const railwayAppNotFound =
        res.status === 404 &&
        typeof data.message === "string" &&
        /application not found/i.test(data.message);

      if (railwayAppNotFound) {
        let botHost: string | null = null;
        try {
          botHost = new URL(botBase).host;
        } catch {
          botHost = null;
        }
        return NextResponse.json(
          {
            error:
              "The dashboard could not reach the bot HTTP server. The URL in BOT_INTERNAL_API_URL (for example the Railway public URL) is wrong, removed, or points to the wrong service. Open the bot service in your host, copy the current public URL, set BOT_INTERNAL_API_URL to that base with no path, redeploy the dashboard, and try again. You can use /mod in Discord in the meantime.",
            code: "BOT_UPSTREAM_UNREACHABLE" as const,
            details: { upstreamStatus: res.status, upstreamMessage: data.message, botHost },
          },
          { status: 502 }
        );
      }

      if (res.status === 404) {
        let botHost: string | null = null;
        try {
          botHost = new URL(botBase).host;
        } catch {
          botHost = null;
        }
        return NextResponse.json(
          {
            error:
              "The bot HTTP server path was not found (HTTP 404). That usually means BOT_INTERNAL_API_URL is the wrong host: it must be the Discord bot service’s public base URL where GET /health returns JSON (same as your Railway/Render bot deployment), not the main website or dashboard. Fix the env, restart, and try again; use /mod submission approve in Discord in the meantime.",
            code: "BOT_INTERNAL_404" as const,
            details: { botHost, hint: "Verify https://<BOT_INTERNAL_API_URL>/health on the same machine as the running bot" },
          },
          { status: 502 }
        );
      }

      return NextResponse.json(
        { error: upstreamText || `Bot returned ${res.status}` },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }

    if (data.ok) {
      logger.success(LOG, `ok botSubmissionId=${botSubmissionId} action=${action}`);
      return NextResponse.json({ ok: true });
    }

    logger.warn(
      LOG,
      `bot returned 200 but ok!=true: err=${(data.error && String(data.error)) || "unknown"} botSubmissionId=${botSubmissionId}`
    );
    return NextResponse.json(
      { ok: false, error: data.error || "Approval failed" },
      { status: 400 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request to bot failed";
    logger.error(LOG, `fetch to bot failed: ${msg} botSubmissionId=${botSubmissionId} action=${action}`);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
