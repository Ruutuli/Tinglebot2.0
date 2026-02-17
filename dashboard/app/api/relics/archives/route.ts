import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connect } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connect();
    const RelicModule = await import("@/models/RelicModel.js");
    const Relic = RelicModule.default || RelicModule;

    const relics = await Relic.find({ archived: true })
      .sort({ appraisalDate: -1 })
      .lean();

    const placementSummary = (relics as { _id?: unknown; relicId?: string; libraryPositionX?: number | null; libraryPositionY?: number | null }[]).map((r) => ({
      _id: String(r._id),
      relicId: r.relicId,
      libraryPositionX: r.libraryPositionX,
      libraryPositionY: r.libraryPositionY,
    }));
    console.log("[api/relics/archives] GET", { count: relics.length, placementSummary });

    if (relics.length > 0 && placementSummary.some((p) => p.libraryPositionX === undefined && p.libraryPositionY === undefined)) {
      const db = mongoose.connection.db;
      if (db) {
        const raw = await db.collection("relics").find({ archived: true }).project({ _id: 1, relicId: 1, libraryPositionX: 1, libraryPositionY: 1 }).toArray();
        console.log("[api/relics/archives] GET raw collection sample", raw.slice(0, 3));
      }
    }

    return NextResponse.json(relics);
  } catch (err) {
    console.error("[api/relics/archives]", err);
    return NextResponse.json(
      { error: "Failed to fetch archived relics" },
      { status: 500 }
    );
  }
}
