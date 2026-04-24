import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { getBotInternalApiConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

type SubmissionDoc = {
  key: string;
  data: Record<string, unknown>;
  createdAt?: Date;
};

/** Strip whitespace / markdown so TempData and ApprovedSubmission IDs match reliably. */
function normalizeSubmissionId(raw: unknown): string {
  if (raw == null) return "";
  return String(raw)
    .replace(/^[`"'[\s]+|[`"'[\s]+$/g, "")
    .trim();
}

const DISCORD_CHANNEL_MESSAGE_URL =
  /^https:\/\/(discord\.com|discordapp\.com)\/channels\/\d+\/\d+\/\d+/i;

function hasValidDiscordMessageUrl(data: Record<string, unknown>): boolean {
  const url = data.messageUrl;
  if (typeof url !== "string" || !url.trim()) return false;
  return DISCORD_CHANNEL_MESSAGE_URL.test(url.trim());
}

/** GET /api/admin/pending-submissions — posted submissions awaiting mod (same as /mod approve). */
export async function GET() {
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

  try {
    await connect();
    const TempData = (await import("@/models/TempDataModel.js")).default;
    const ApprovedSubmission = (await import("@/models/ApprovedSubmissionModel.js")).default;

    const now = new Date();

    const [docs, approvedRowsRaw] = await Promise.all([
      TempData.find({
        type: "submission",
        expiresAt: { $gt: now },
        "data.messageUrl": {
          $regex: /^https:\/\/(discord\.com|discordapp\.com)\/channels\//i,
        },
      })
        .sort({ createdAt: -1 })
        .lean(),
      ApprovedSubmission.find({}, { submissionId: 1 }).lean(),
    ]);

    const docsList = docs as unknown as SubmissionDoc[];
    const approvedRows = approvedRowsRaw as unknown as { submissionId?: string }[];

    const approvedIds = new Set(
      approvedRows
        .map((r) => normalizeSubmissionId(r.submissionId))
        .filter(Boolean)
    );

    const seenIds = new Set<string>();
    const list: {
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
      tokenCalculation: unknown;
      boostEffects?: string[];
      boostTokenIncrease?: number;
      questBonus?: string;
    }[] = [];

    for (const doc of docsList) {
      const d = doc.data || {};
      if (!hasValidDiscordMessageUrl(d)) continue;

      const submissionId = normalizeSubmissionId(d.submissionId) || normalizeSubmissionId(doc.key);
      if (!submissionId || approvedIds.has(submissionId)) continue;
      if (seenIds.has(submissionId)) continue;
      seenIds.add(submissionId);

      const created = doc.createdAt ? new Date(doc.createdAt) : null;
      const boostFx = d.boostEffects;
      const boostEffects = Array.isArray(boostFx)
        ? boostFx.filter((x): x is string => typeof x === "string")
        : undefined;
      list.push({
        submissionId,
        title: (d.title as string) || (d.fileName as string) || "Untitled",
        userId: String(d.userId ?? ""),
        username: d.username as string | undefined,
        category: (d.category as string) || "art",
        finalTokenAmount: typeof d.finalTokenAmount === "number" ? d.finalTokenAmount : 0,
        messageUrl: typeof d.messageUrl === "string" ? d.messageUrl.trim() : undefined,
        questEvent: (d.questEvent as string) || "N/A",
        collab: d.collab,
        fileUrl: d.fileUrl as string | undefined,
        queuedAt: created && !Number.isNaN(created.getTime()) ? created.toISOString() : undefined,
        tokenCalculation: d.tokenCalculation ?? null,
        boostEffects,
        boostTokenIncrease:
          typeof d.boostTokenIncrease === "number" ? d.boostTokenIncrease : undefined,
        questBonus: typeof d.questBonus === "string" ? d.questBonus : undefined,
      });
    }

    list.sort((a, b) => {
      const ta = a.queuedAt ? Date.parse(a.queuedAt) : 0;
      const tb = b.queuedAt ? Date.parse(b.queuedAt) : 0;
      return tb - ta;
    });
    const { isConfigured: botInternalApiConfigured } = getBotInternalApiConfig();
    return NextResponse.json(
      { items: list, botInternalApiConfigured },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load pending submissions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
