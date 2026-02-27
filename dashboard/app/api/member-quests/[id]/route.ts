// PATCH /api/member-quests/[id] - Update proposal and resubmit (owner only, when status is needs_revision)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { notifyMemberQuestProposalResubmitted } from "@/lib/memberQuestProposalNotify";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";

export const dynamic = "force-dynamic";

const MAX_DAYS = 14;

function timeLimitToDays(timeLimit: string): number | null {
  const s = String(timeLimit || "").trim().toLowerCase();
  if (!s) return null;
  const weekMatch = s.match(/(\d+)\s*week/);
  const dayMatch = s.match(/(\d+)\s*day/);
  if (weekMatch) return parseInt(weekMatch[1], 10) * 7;
  if (dayMatch) return parseInt(dayMatch[1], 10);
  return null;
}

/** GET - Fetch a single proposal by id (owner only). Used when loading for edit so form has persisted data. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session?.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Proposal ID required" }, { status: 400 });
    }

    await connect();
    const MemberQuestProposal = (await import("@/models/MemberQuestProposalModel.js")).default;
    const proposal = await MemberQuestProposal.findById(id).lean();
    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }
    if (proposal.submitterUserId !== user.id) {
      return NextResponse.json({ error: "You can only view your own proposal" }, { status: 403 });
    }

    const raw = proposal as Record<string, unknown>;
    const toDateOnly = (v: unknown): string => {
      if (v == null || v === "") return "";
      const s = String(v).trim();
      if (!s) return "";
      const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
      if (m) return m[1];
      const d = new Date(s);
      if (Number.isNaN(d.getTime())) return s;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const out = { ...raw, date: toDateOnly(raw.date) || raw.date, signupDeadline: toDateOnly(raw.signupDeadline) };

    return NextResponse.json(out);
  } catch (e) {
    logger.error("api/member-quests/[id] GET", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch proposal" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    const user = session?.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Proposal ID required" }, { status: 400 });
    }

    await connect();
    const MemberQuestProposal = (await import("@/models/MemberQuestProposalModel.js")).default;
    const proposal = await MemberQuestProposal.findById(id);
    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }
    if (proposal.submitterUserId !== user.id) {
      return NextResponse.json({ error: "You can only edit your own proposal" }, { status: 403 });
    }
    if (proposal.status !== "needs_revision") {
      return NextResponse.json(
        { error: "Only proposals that need revision can be edited and resubmitted" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const timeLimit = typeof body.timeLimit === "string" ? body.timeLimit.trim() : "";
    const questSummary = typeof body.questSummary === "string" ? body.questSummary.trim() : "";
    const gameplayDescription = typeof body.gameplayDescription === "string" ? body.gameplayDescription.trim() : "";
    const runningEventDescription = typeof body.runningEventDescription === "string" ? body.runningEventDescription.trim() : "";

    if (!title) {
      return NextResponse.json(
        { error: "Validation failed", message: "Title is required" },
        { status: 400 }
      );
    }
    if (!date) {
      return NextResponse.json(
        { error: "Validation failed", message: "Start date is required" },
        { status: 400 }
      );
    }
    if (!timeLimit) {
      return NextResponse.json(
        { error: "Validation failed", message: "Time limit is required" },
        { status: 400 }
      );
    }
    if (!questSummary) {
      return NextResponse.json(
        { error: "Validation failed", message: "Summary (what will happen) is required" },
        { status: 400 }
      );
    }
    if (!gameplayDescription) {
      return NextResponse.json(
        { error: "Validation failed", message: "Gameplay (how it works) is required" },
        { status: 400 }
      );
    }
    if (!runningEventDescription) {
      return NextResponse.json(
        { error: "Validation failed", message: "Running the event (how you'll run it) is required" },
        { status: 400 }
      );
    }

    const days = timeLimitToDays(timeLimit);
    if (days === null || days < 1 || days > MAX_DAYS) {
      return NextResponse.json(
        { error: "Validation failed", message: `Duration must be 1–${MAX_DAYS} days (max 2 weeks)` },
        { status: 400 }
      );
    }

    const postReq = body.postRequirement != null && !Number.isNaN(Number(body.postRequirement))
      ? Math.max(0, Number(body.postRequirement))
      : null;
    const reqRolls = body.requiredRolls != null && !Number.isNaN(Number(body.requiredRolls))
      ? Math.max(1, Number(body.requiredRolls))
      : null;

    proposal.title = title;
    proposal.locations = typeof body.locations === "string" ? body.locations.trim() : "";
    proposal.date = date;
    proposal.timeLimit = timeLimit;
    proposal.timePerRound = typeof body.timePerRound === "string" ? body.timePerRound.trim() : "";
    proposal.type = typeof body.type === "string" ? body.type.trim() : "";
    proposal.specialEquipment = typeof body.specialEquipment === "string" ? body.specialEquipment.trim() : "";
    proposal.rewards = typeof body.rewards === "string" ? body.rewards.trim() : "";
    proposal.partySize = typeof body.partySize === "string" ? body.partySize.trim() : String(body.partySize ?? "");
    proposal.signUpFormLink = typeof body.signUpFormLink === "string" ? body.signUpFormLink.trim() : "";
    proposal.questDescription = typeof body.questDescription === "string" ? body.questDescription.trim() : "";
    proposal.questSummary = questSummary;
    proposal.gameplayDescription = gameplayDescription;
    proposal.gameRules = typeof body.gameRules === "string" ? body.gameRules.trim() : "";
    proposal.runningEventDescription = runningEventDescription;
    proposal.signupDeadline = typeof body.signupDeadline === "string" ? body.signupDeadline.trim() : "";
    proposal.postRequirement = postReq;
    proposal.collabAllowed = Boolean(body.collabAllowed);
    proposal.collabRule = typeof body.collabRule === "string" ? body.collabRule.trim() : "";
    proposal.artWritingMode = body.artWritingMode === "either" ? "either" : "both";
    proposal.tableRollName = typeof body.tableRollName === "string" ? body.tableRollName.trim() : "";
    proposal.requiredRolls = reqRolls;
    proposal.minRequirements =
      body.minRequirements != null && String(body.minRequirements).trim() !== ""
        ? (() => {
            const s = String(body.minRequirements).trim();
            const n = Number(s);
            return Number.isNaN(n) ? s : n;
          })()
        : null;
    proposal.status = "pending";
    proposal.revisionReason = null;
    proposal.reviewedByUserId = null;
    proposal.reviewedAt = null;
    proposal.submitterUsername = user.username ?? user.global_name ?? proposal.submitterUsername ?? "";
    await proposal.save();

    notifyMemberQuestProposalResubmitted({
      title: proposal.title,
      submitterUsername: proposal.submitterUsername ?? user.username ?? user.global_name ?? "",
      type: proposal.type ?? undefined,
      locations: proposal.locations ?? undefined,
      date: proposal.date ?? undefined,
      timeLimit: proposal.timeLimit ?? undefined,
    });

    return NextResponse.json(proposal.toObject ? proposal.toObject() : proposal);
  } catch (e) {
    logger.error("api/member-quests/[id] PATCH", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to update proposal" },
      { status: 500 }
    );
  }
}
