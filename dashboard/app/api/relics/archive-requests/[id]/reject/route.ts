import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";

export const dynamic = "force-dynamic";

/** POST /api/relics/archive-requests/[id]/reject — mod rejects the archive request. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Request ID required" }, { status: 400 });
  }

  try {
    await connect();

    const RelicArchiveRequestModule = await import("@/models/RelicArchiveRequestModel.js");
    const RelicArchiveRequest = RelicArchiveRequestModule.default || RelicArchiveRequestModule;

    const archiveRequest = await RelicArchiveRequest.findById(id);
    if (!archiveRequest) {
      return NextResponse.json({ error: "Archive request not found" }, { status: 404 });
    }
    if (archiveRequest.status !== "pending") {
      return NextResponse.json({ error: "Request has already been processed" }, { status: 400 });
    }

    await RelicArchiveRequest.findByIdAndUpdate(id, {
      status: "rejected",
      modApprovedBy: user.id,
      modApprovedAt: new Date(),
      updatedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: "Archive request rejected.",
    });
  } catch (err) {
    console.error("[api/relics/archive-requests/reject]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reject" },
      { status: 500 }
    );
  }
}
