import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isMixerOutputElixirName } from "@/lib/elixir-catalog";

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
      .select("itemName craftingJobs staminaToCraft emoji elixirLevel")
      .sort({ itemName: 1 })
      .limit(limit)
      .lean();

    const out = items.map((it) => {
      const itemName = String((it as { itemName?: string }).itemName ?? "");
      const elixirLevel = (it as { elixirLevel?: number | null }).elixirLevel;
      return {
        itemName,
        craftingJobs: (it as { craftingJobs?: string[] }).craftingJobs,
        staminaToCraft: (it as { staminaToCraft?: unknown }).staminaToCraft,
        emoji: (it as { emoji?: string }).emoji,
        isElixir: isMixerOutputElixirName(itemName),
        elixirLevel:
          typeof elixirLevel === "number" && Number.isFinite(elixirLevel)
            ? Math.min(3, Math.max(1, Math.floor(elixirLevel)))
            : null,
      };
    });

    return NextResponse.json({ items: out });
  } catch (err) {
    console.error("[api/crafting-requests/items]", err);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}
