// GET /api/admin/mod-applications/[id] - Get one mod application
// PATCH /api/admin/mod-applications/[id] - Update status (accepted/rejected) and set reviewedBy/reviewedAt

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { logger } from "@/utils/logger";

export const dynamic = "force-dynamic";

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
      return NextResponse.json({ error: "Application ID required" }, { status: 400 });
    }

    await connect();
    const ModApplication = (await import("@/models/ModApplicationModel.js")).default;
    const doc = await ModApplication.findById(id).lean();
    if (!doc) {
      return NextResponse.json({ error: "Mod application not found" }, { status: 404 });
    }

    return NextResponse.json(doc);
  } catch (e) {
    logger.error("api/admin/mod-applications/[id] GET", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch mod application" },
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
      return NextResponse.json({ error: "Application ID required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const status = body.status === "accepted" || body.status === "rejected" ? body.status : null;
    if (!status) {
      return NextResponse.json({ error: "Body must include status: 'accepted' or 'rejected'" }, { status: 400 });
    }

    await connect();
    const ModApplication = (await import("@/models/ModApplicationModel.js")).default;
    const doc = await ModApplication.findByIdAndUpdate(
      id,
      {
        status,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      },
      { new: true }
    ).lean();

    if (!doc) {
      return NextResponse.json({ error: "Mod application not found" }, { status: 404 });
    }

    return NextResponse.json(doc);
  } catch (e) {
    logger.error("api/admin/mod-applications/[id] PATCH", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to update mod application" },
      { status: 500 }
    );
  }
}
