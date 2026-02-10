// ------------------- GET /api/models/monsters/[monsterName]/drops -------------------
// Returns items that can drop from this monster (Item.monsterList contains monster name)
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ monsterName: string }> }
) {
  try {
    await connect();
    const { monsterName: encoded } = await params;
    const monsterName = decodeURIComponent(encoded);
    if (!monsterName.trim()) {
      return NextResponse.json({ items: [] });
    }

    const { default: Item } = await import("@/models/ItemModel.js");
    const items = await Item.find({
      $or: [
        { monsterList: monsterName },
        { monsterList: { $in: [monsterName] } },
      ],
    })
      .select("itemName image emoji itemRarity")
      .lean();

    return NextResponse.json({
      items: items.map((doc: { itemName: string; image?: string; emoji?: string; itemRarity?: number }) => ({
        itemName: doc.itemName,
        image: doc.image,
        emoji: doc.emoji,
        itemRarity: doc.itemRarity ?? 1,
      })),
    });
  } catch (e) {
    logger.error("api/models/monsters/[monsterName]/drops", e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      { error: "Failed to fetch monster drops" },
      { status: 500 }
    );
  }
}
