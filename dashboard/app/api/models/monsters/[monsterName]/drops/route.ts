// ------------------- GET /api/models/monsters/[monsterName]/drops -------------------
// Returns items that can drop from this monster (Item.monsterList or monster boolean flags)
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { logger } from "@/utils/logger";

export const revalidate = 3600;

/** Same as item-field-sync: camelCase → Title Case so we match monsterList strings. */
function normalizeMonsterNameMapping(nameMapping: string): string {
  return nameMapping
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

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

    const { default: Monster } = await import("@/models/MonsterModel.js");
    const raw = await Monster.findOne({ name: monsterName })
      .select("nameMapping")
      .lean();
    const monsterDoc = Array.isArray(raw) ? null : raw;
    const nameMapping = (monsterDoc as { nameMapping?: string } | null)?.nameMapping;

    const orConditions: Array<Record<string, unknown>> = [
      { monsterList: monsterName },
      { monsterList: { $in: [monsterName] } },
    ];
    if (nameMapping && typeof nameMapping === "string") {
      const normalizedName = normalizeMonsterNameMapping(nameMapping);
      orConditions.push({ monsterList: normalizedName });
      orConditions.push({ monsterList: { $in: [normalizedName] } });
      orConditions.push({ [nameMapping]: true });
    }

    const { default: Item } = await import("@/models/ItemModel.js");
    type ItemDoc = { itemName: string; image?: string; emoji?: string; itemRarity?: number };
    const items = (await Item.find({ $or: orConditions })
      .select("itemName image emoji itemRarity")
      .lean()) as unknown as ItemDoc[];

    return NextResponse.json({
      items: items.map((doc) => ({
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
