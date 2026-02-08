// ============================================================================
// GET /api/models/items/emojis - Fetch emoji map for item names
// Query: ?names=Spirit%20Orb,Goron%20Ore
// Returns: { "Spirit Orb": "<:emoji:123>", "Goron Ore": "" }
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { connect } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const namesParam = req.nextUrl.searchParams.get("names");
    if (!namesParam?.trim()) {
      return NextResponse.json({});
    }
    const names = namesParam
      .split(",")
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) return NextResponse.json({});

    await connect();
    const Item = (await import("@/models/ItemModel.js")).default;
    const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const items = await Item.find({
      $or: escaped.map((e) => ({ itemName: new RegExp(`^${e}$`, "i") })),
    })
      .select("itemName emoji")
      .lean();

    const map: Record<string, string> = {};
    for (const reqName of names) {
      const item = items.find(
        (i) => (i as { itemName?: string }).itemName?.toLowerCase() === reqName.toLowerCase()
      );
      const emoji = item ? (item as { emoji?: string }).emoji : null;
      map[reqName] = emoji && String(emoji).trim() ? String(emoji).trim() : "";
    }
    return NextResponse.json(map);
  } catch {
    return NextResponse.json({});
  }
}
