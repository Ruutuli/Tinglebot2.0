import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";

export const dynamic = "force-dynamic";

function normalizeSubmissionId(raw: unknown): string {
  if (raw == null) return "";
  return String(raw)
    .replace(/^[`"'[\s]+|[`"'[\s]+$/g, "")
    .trim();
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

    const existing = await TempData.findOne({
      type: "submission",
      expiresAt: { $gt: now },
      $or: keyOrIdClauses,
    }).exec();

    if (!existing) {
      return NextResponse.json(
        { error: "Submission not found or already processed" },
        { status: 404 }
      );
    }

    const data = existing.data as Record<string, unknown> | undefined;
    const dataSid = data ? normalizeSubmissionId(data.submissionId) : "";
    botSubmissionId = dataSid || String(existing.key);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Database error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const botBase = process.env.BOT_INTERNAL_API_URL?.replace(/\/$/, "");
  const secret = process.env.BOT_INTERNAL_API_SECRET;
  if (!botBase || !secret) {
    return NextResponse.json(
      {
        error: "Could not reach the bot to process this submission. Try again later or use /mod approve in Discord.",
      },
      { status: 503 }
    );
  }

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

    const data = (await res.json()) as { ok?: boolean; error?: string };

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || `Bot returned ${res.status}` },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }

    if (data.ok) {
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json(
      { ok: false, error: data.error || "Approval failed" },
      { status: 400 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request to bot failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
