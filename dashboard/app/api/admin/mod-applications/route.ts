// GET /api/admin/mod-applications - List mod applications (mod/admin only)
// Query: status=pending|accepted|rejected (optional; default all)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";
import { logger } from "@/utils/logger";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "accepted", "rejected"] as const;

export async function GET(req: NextRequest) {
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

    const statusParam = req.nextUrl.searchParams.get("status") as (typeof STATUSES)[number] | null;
    const query = statusParam && STATUSES.includes(statusParam) ? { status: statusParam } : {};

    await connect();
    const ModApplication = (await import("@/models/ModApplicationModel.js")).default;
    const list = await ModApplication.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(list);
  } catch (e) {
    logger.error("api/admin/mod-applications GET", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch mod applications" },
      { status: 500 }
    );
  }
}
