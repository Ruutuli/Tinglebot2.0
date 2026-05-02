import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(40, Math.max(1, parseInt(url.searchParams.get("limit") ?? "25", 10) || 25));

    await connect();
    const Item = (await import("@/models/ItemModel.js")).default;

    const filter: Record<string, unknown> = { crafting: true };
    if (q.length > 0) {
      filter.itemName = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    }
    // Empty q: first N craftable items alphabetically (for picker bootstrap)

    const items = await Item.find(filter)
      .select("itemName craftingJobs staminaToCraft emoji")
      .sort({ itemName: 1 })
      .limit(limit)
      .lean();

    return NextResponse.json({ items });
  } catch (err) {
    console.error("[api/crafting-requests/items]", err);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}
