// ============================================================================
// ------------------- GET /api/reference/jobs -------------------
// Returns the full jobs list for the Reference → Jobs page (static data).
// ============================================================================

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jobsReference } from "@/data/jobsReference";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    const village = params.get("village");
    const perk = params.get("perk");
    const search = (params.get("search") ?? "").trim().toLowerCase();

    let list = [...jobsReference];

    if (village) {
      const v = village.trim();
      list = list.filter((j) => j.villages.some((vill) => vill.toLowerCase() === v.toLowerCase()));
    }
    if (perk) {
      const p = perk.trim().toUpperCase();
      list = list.filter((j) => {
        const jobPerk = j.perk.toUpperCase();
        if (p === "NONE" || p === "N/A") return jobPerk === "NONE" || jobPerk === "N/A";
        return jobPerk.includes(p);
      });
    }
    if (search) {
      list = list.filter(
        (j) =>
          j.name.toLowerCase().includes(search) ||
          j.description.toLowerCase().includes(search) ||
          j.perk.toLowerCase().includes(search)
      );
    }

    return NextResponse.json(list);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to load jobs" },
      { status: 500 }
    );
  }
}
