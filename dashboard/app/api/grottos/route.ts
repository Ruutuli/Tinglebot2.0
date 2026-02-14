import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession, isAdminUser } from "@/lib/session";
import { isModeratorUser } from "@/lib/moderator";

export const dynamic = "force-dynamic";

/** GET: List grottos (for mods); optionally filter by trialType=puzzle and offeringSubmitted=true for pending puzzle approvals. */
export async function GET(req: Request) {
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
    const GrottoModule = await import("@/models/GrottoModel.js");
    const Grotto = GrottoModule.default || GrottoModule;

    const { searchParams } = new URL(req.url);
    const pendingPuzzle = searchParams.get("pendingPuzzle");
    const filter: Record<string, unknown> = {};
    if (pendingPuzzle === "true") {
      filter.trialType = "puzzle";
      filter["puzzleState.offeringSubmitted"] = true;
      filter["puzzleState.offeringApproved"] = null;
      filter.completedAt = null;
    }

    const grottos = await Grotto.find(filter).sort({ unsealedAt: -1 }).lean();
    return NextResponse.json(grottos);
  } catch (err) {
    console.error("[api/grottos]", err);
    return NextResponse.json(
      { error: "Failed to fetch grottos" },
      { status: 500 }
    );
  }
}
