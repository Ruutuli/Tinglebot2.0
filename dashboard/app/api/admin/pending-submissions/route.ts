import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";

export const dynamic = "force-dynamic";

type SubmissionDoc = {
  key: string;
  data: Record<string, unknown>;
};

/** GET /api/admin/pending-submissions — list TempData submissions awaiting mod approval (same queue as /mod approve). */
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
    const docs = (await TempData.findAllByType("submission")) as SubmissionDoc[];

    const list = docs.map((doc) => {
      const d = doc.data || {};
      const submissionId = (d.submissionId as string) || doc.key;
      return {
        submissionId,
        title: (d.title as string) || (d.fileName as string) || "Untitled",
        userId: d.userId as string,
        username: d.username as string | undefined,
        category: (d.category as string) || "art",
        finalTokenAmount: typeof d.finalTokenAmount === "number" ? d.finalTokenAmount : 0,
        messageUrl: d.messageUrl as string | undefined,
        questEvent: (d.questEvent as string) || "N/A",
        collab: d.collab,
        fileUrl: d.fileUrl as string | undefined,
      };
    });

    list.sort((a, b) => a.submissionId.localeCompare(b.submissionId));
    return NextResponse.json(list);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load pending submissions";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
