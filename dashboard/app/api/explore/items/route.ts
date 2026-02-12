// GET /api/explore/items — items valid for expedition: healing items and/or bundles for paving
// Bundles: 5 Eldin Ore = 1 bundle = 1 item slot; 10 Wood = 1 bundle = 1 item slot

import { NextResponse } from "next/server";
import { connect } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose, { type Model } from "mongoose";

export const dynamic = "force-dynamic";

type ExploreItem = {
  _id: string;
  itemName: string;
  emoji?: string;
  modifierHearts?: number;
  staminaRecovered?: number;
  image?: string;
};

/** Base materials for paving bundles; bundles use the base item's icon. */
const BUNDLE_BASES = [
  { bundleName: "Eldin Ore Bundle", baseItemName: "Eldin Ore", _id: "bundle-eldin" },
  { bundleName: "Wood Bundle", baseItemName: "Wood", _id: "bundle-wood" },
] as const;

export async function GET() {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connect();

    let Item: Model<unknown>;
    if (mongoose.models.Item) {
      Item = mongoose.models.Item;
    } else {
      const { default: ItemModel } = await import("@/models/ItemModel.js");
      Item = ItemModel as unknown as Model<unknown>;
    }

    // Healing items only (crafted/cooked, fairy); raw Eldin Ore / Wood are not slot options — use bundles instead
    const items = await Item.find({
      categoryGear: { $nin: ["Weapon", "Armor"] },
      $and: [
        {
          $or: [
            { modifierHearts: { $gt: 0 } },
            { staminaRecovered: { $gt: 0 } },
          ],
        },
        {
          $or: [
            { crafting: true },
            { itemName: new RegExp("Fairy", "i") },
          ],
        },
      ],
    })
      .select("_id itemName emoji modifierHearts staminaRecovered image")
      .sort({ itemName: 1 })
      .lean()
      .exec();

    // Bundles use the base item's icon (Eldin Ore, Wood)
    const baseItems = await Item.find({
      itemName: { $in: ["Eldin Ore", "Wood"] },
    })
      .select("itemName emoji image")
      .lean()
      .exec();
    const baseByName = new Map<string, { emoji?: string; image?: string }>();
    for (const doc of baseItems) {
      const d = doc as Record<string, unknown>;
      const name = d.itemName as string;
      if (name) baseByName.set(name, { emoji: d.emoji as string | undefined, image: d.image as string | undefined });
    }
    const pavingBundles: ExploreItem[] = BUNDLE_BASES.map(({ bundleName, baseItemName, _id }) => {
      const base = baseByName.get(baseItemName) ?? {};
      return {
        _id,
        itemName: bundleName,
        emoji: base.emoji ?? "📦",
        modifierHearts: 0,
        staminaRecovered: 0,
        image: base.image,
      };
    });

    const list = [
      ...(items as unknown as ExploreItem[]).map((doc) => ({
        _id: String(doc._id),
        itemName: doc.itemName,
        emoji: doc.emoji ?? "",
        modifierHearts: doc.modifierHearts ?? 0,
        staminaRecovered: doc.staminaRecovered ?? 0,
        image: doc.image ?? undefined,
      })),
      ...pavingBundles,
    ].sort((a, b) => a.itemName.localeCompare(b.itemName));

    return NextResponse.json(list);
  } catch (err) {
    console.error("[explore/items]", err);
    return NextResponse.json(
      { error: "Failed to load exploration items" },
      { status: 500 }
    );
  }
}
