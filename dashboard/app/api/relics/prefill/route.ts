import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/relics/prefill?relicId=R473582 — get relic fields for form prefill (title, discoveredBy, appraisedBy, region, square, quadrant). Auth required. Only returns data for appraised, non-archived relics. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const relicId = searchParams.get("relicId")?.trim().toUpperCase();
  if (!relicId) {
    return NextResponse.json({ error: "relicId query parameter required" }, { status: 400 });
  }

  try {
    await connect();
    const RelicModule = await import("@/models/RelicModel.js");
    const Relic = RelicModule.default || RelicModule;

    const relic = await Relic.findOne({ relicId }).lean();
    if (!relic) {
      return NextResponse.json({ error: "Relic not found" }, { status: 404 });
    }
    if (!relic.appraised) {
      return NextResponse.json({ error: "Relic has not been appraised yet" }, { status: 400 });
    }
    if (relic.archived) {
      return NextResponse.json({ error: "Relic is already archived" }, { status: 400 });
    }

    return NextResponse.json({
      title: relic.rollOutcome || relic.name || "",
      discoveredBy: relic.discoveredBy || "",
      appraisedBy: relic.appraisedBy || "",
      region: relic.region || "",
      square: relic.square || "",
      quadrant: relic.quadrant || "",
    });
  } catch (err) {
    console.error("[api/relics/prefill]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load relic" },
      { status: 500 }
    );
  }
}
