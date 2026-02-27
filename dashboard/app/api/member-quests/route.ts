// ============================================================================
// GET /api/member-quests - List current user's proposals
// POST /api/member-quests - Submit a new proposal (auth required)
// ============================================================================

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { logger } from "@/utils/logger";
import { notifyMemberQuestProposal } from "@/lib/memberQuestProposalNotify";

export const dynamic = "force-dynamic";

const MAX_DAYS = 14; // member quests: max 2 weeks

/** Parse timeLimit string to number of days; return null if unparseable. */
function timeLimitToDays(timeLimit: string): number | null {
  const s = String(timeLimit || "").trim().toLowerCase();
  if (!s) return null;
  const weekMatch = s.match(/(\d+)\s*week/);
  const dayMatch = s.match(/(\d+)\s*day/);
  if (weekMatch) return parseInt(weekMatch[1], 10) * 7;
  if (dayMatch) return parseInt(dayMatch[1], 10);
  return null;
}

/** GET - List proposals for the current user */
export async function GET() {
  try {
    const session = await getSession();
    const user = session?.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    await connect();
    const MemberQuestProposal = (await import("@/models/MemberQuestProposalModel.js")).default;
    const proposals = await MemberQuestProposal.find({ submitterUserId: user.id })
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(proposals);
  } catch (e) {
    logger.error("api/member-quests GET", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch proposals" },
      { status: 500 }
    );
  }
}

/** POST - Create a new proposal */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const user = session?.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const date = typeof body.date === "string" ? body.date.trim() : "";
    const timeLimit = typeof body.timeLimit === "string" ? body.timeLimit.trim() : "";

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

    const questSummary = typeof body.questSummary === "string" ? body.questSummary.trim() : "";
    const gameplayDescription = typeof body.gameplayDescription === "string" ? body.gameplayDescription.trim() : "";
    const runningEventDescription = typeof body.runningEventDescription === "string" ? body.runningEventDescription.trim() : "";
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

    await connect();
    const MemberQuestProposal = (await import("@/models/MemberQuestProposalModel.js")).default;

    const postReq = body.postRequirement != null && !Number.isNaN(Number(body.postRequirement))
      ? Math.max(0, Number(body.postRequirement))
      : null;
    const reqRolls = body.requiredRolls != null && !Number.isNaN(Number(body.requiredRolls))
      ? Math.max(1, Number(body.requiredRolls))
      : null;

    const doc = new MemberQuestProposal({
      submitterUserId: user.id,
      submitterUsername: user.username ?? user.global_name ?? "",
      status: "pending",
      title,
      locations: typeof body.locations === "string" ? body.locations.trim() : "",
      date,
      timeLimit,
      timePerRound: typeof body.timePerRound === "string" ? body.timePerRound.trim() : "",
      type: typeof body.type === "string" ? body.type.trim() : "",
      specialEquipment: typeof body.specialEquipment === "string" ? body.specialEquipment.trim() : "",
      rewards: typeof body.rewards === "string" ? body.rewards.trim() : "",
      partySize: typeof body.partySize === "string" ? body.partySize.trim() : String(body.partySize ?? ""),
      signUpFormLink: typeof body.signUpFormLink === "string" ? body.signUpFormLink.trim() : "",
      questDescription: typeof body.questDescription === "string" ? body.questDescription.trim() : "",
      questSummary,
      gameplayDescription,
      gameRules: typeof body.gameRules === "string" ? body.gameRules.trim() : "",
      runningEventDescription,
      signupDeadline: typeof body.signupDeadline === "string" ? body.signupDeadline.trim() : "",
      postRequirement: postReq,
      collabAllowed: Boolean(body.collabAllowed),
      collabRule: typeof body.collabRule === "string" ? body.collabRule.trim() : "",
      artWritingMode: body.artWritingMode === "either" ? "either" : "both",
      tableRollName: typeof body.tableRollName === "string" ? body.tableRollName.trim() : "",
      requiredRolls: reqRolls,
      minRequirements:
        body.minRequirements != null && String(body.minRequirements).trim() !== ""
          ? (() => {
              const s = String(body.minRequirements).trim();
              const n = Number(s);
              return Number.isNaN(n) ? s : n;
            })()
          : null,
    });
    await doc.save();

    notifyMemberQuestProposal({
      proposalId: String(doc._id),
      title: doc.title,
      submitterUsername: doc.submitterUsername ?? "",
      type: doc.type ?? undefined,
      locations: doc.locations ?? undefined,
      date: doc.date ?? undefined,
      timeLimit: doc.timeLimit ?? undefined,
    });

    return NextResponse.json(doc.toObject ? doc.toObject() : doc, { status: 201 });
  } catch (e) {
    logger.error("api/member-quests POST", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to create proposal" },
      { status: 500 }
    );
  }
}
