import { NextResponse } from "next/server";
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

    return NextResponse.json(relics);
  } catch (err) {
    console.error("[api/relics/archives]", err);
    return NextResponse.json(
      { error: "Failed to fetch archived relics" },
      { status: 500 }
    );
  }
}
