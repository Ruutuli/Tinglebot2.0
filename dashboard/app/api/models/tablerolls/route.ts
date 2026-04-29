// ============================================================================
// GET /api/models/tablerolls — Table roll names from TableRollModel
// Authenticated admins/moderators receive every table (including drafts /
// unpublished isActive:false). Anonymous or non-privileged callers only see
// published (isActive:true) tables.
// Used by the quest admin form to attach tablerolls to quests.
// ============================================================================

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";

export const dynamic = "force-dynamic";

async function canSeeDraftTablerolls(userId: string): Promise<boolean> {
  const [admin, mod] = await Promise.all([isAdminUser(userId), isModeratorUser(userId)]);
  return admin || mod;
}

export async function GET() {
  try {
    await connect();

    let listAllDraftsAndPublished = false;
    try {
      const session = await getSession();
      const uid = session.user?.id;
      if (uid) listAllDraftsAndPublished = await canSeeDraftTablerolls(uid);
    } catch {
      listAllDraftsAndPublished = false;
    }

    const TableRoll = (await import("@/models/TableRollModel.js")).default;
    const filter = listAllDraftsAndPublished ? {} : { isActive: true };

    const tablerolls = await TableRoll.find(filter)
      .select({ name: 1, isActive: 1 })
      .sort({ name: 1 })
      .lean();

    const payload: Array<{ name: string; isActive: boolean }> = (
      tablerolls as Array<{ name: string; isActive?: boolean }>
    ).map((t) => ({
      name: t.name,
      isActive: t.isActive !== false,
    }));

    return NextResponse.json(payload);
  } catch (err) {
    console.error("[tablerolls] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch tablerolls" }, { status: 500 });
  }
}
