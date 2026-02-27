// POST /api/admin/member-quest-proposals/[id]/request-revision - Request revision (mod/admin only)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { notifyMemberQuestRevisionRequested } from "@/lib/memberQuestProposalNotify";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { logger } from "@/utils/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
      return NextResponse.json(
        { error: "Moderator or admin access required" },
        { status: 403 }
      );
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Proposal ID required" }, { status: 400 });
    }

    let body: { reason?: string } = {};
    try {
      body = await req.json();
    } catch {
      // optional body
    }
    const revisionReason = typeof body.reason === "string" ? body.reason.trim() || null : null;

    await connect();
    const MemberQuestProposal = (await import("@/models/MemberQuestProposalModel.js")).default;

    const proposal = await MemberQuestProposal.findById(id);
    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }
    if (proposal.status !== "pending") {
      return NextResponse.json(
        { error: "Proposal has already been processed" },
        { status: 400 }
      );
    }

    proposal.status = "needs_revision";
    proposal.revisionReason = revisionReason;
    proposal.reviewedByUserId = user.id;
    proposal.reviewedAt = new Date();
    await proposal.save();

    notifyMemberQuestRevisionRequested({
      submitterUserId: proposal.submitterUserId,
      proposalTitle: proposal.title || "Your proposal",
      revisionReason: proposal.revisionReason,
    }).catch((err) => {
      logger.warn("api/admin/member-quest-proposals/[id]/request-revision", "Revision notify failed: " + (err instanceof Error ? err.message : String(err)));
    });

    return NextResponse.json({
      success: true,
      message: "Revision requested. The member can edit and resubmit.",
    });
  } catch (e) {
    logger.error(
      "api/admin/member-quest-proposals/[id]/request-revision",
      e instanceof Error ? e.message : String(e)
    );
    return NextResponse.json(
      { error: "Failed to request revision" },
      { status: 500 }
    );
  }
}
