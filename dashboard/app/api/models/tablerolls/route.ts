// ============================================================================
// GET /api/models/tablerolls - List tableroll names (from TableRollModel)
// Used by quest admin form to attach a tableroll to a quest.
// ============================================================================

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connect();
    const TableRoll = (await import("@/models/TableRollModel.js")).default;
    const tablerolls = await TableRoll.find({ isActive: true })
      .select("name")
      .sort({ name: 1 })
      .lean();
    const names = tablerolls.map((t: { name: string }) => t.name);
    return NextResponse.json(names);
  } catch (err) {
    console.error("[tablerolls] GET error:", err);
    return NextResponse.json({ error: "Failed to fetch tablerolls" }, { status: 500 });
  }
}
