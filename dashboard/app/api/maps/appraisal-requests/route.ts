import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSession();
    const user = session.user;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [isAdmin, isMod] = await Promise.all([
      isAdminUser(user.id),
      isModeratorUser(user.id),
    ]);
    if (!isAdmin && !isMod) {
      return NextResponse.json({ error: "Moderator or admin access required" }, { status: 403 });
    }

    await connect();
    const MapAppraisalRequestModule = await import("@/models/MapAppraisalRequestModel.js");
    const MapAppraisalRequest = MapAppraisalRequestModule.default || MapAppraisalRequestModule;

    const requests = await MapAppraisalRequest.find({ status: "pending" })
      .sort({ createdAt: 1 })
      .lean();

    return NextResponse.json(requests);
  } catch (err) {
    console.error("[api/maps/appraisal-requests]", err);
    return NextResponse.json(
      { error: "Failed to fetch map appraisal requests" },
      { status: 500 }
    );
  }
}
