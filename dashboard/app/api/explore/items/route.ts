// GET /api/explore/items — items valid for expedition: crafted/cooked food, fairy, Eldin Ore, Wood (no raw food or gear)

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

    const items = await Item.find({
      $and: [
        { categoryGear: { $nin: ["Weapon", "Armor"] } },
        {
          $or: [
            { modifierHearts: { $gt: 0 } },
            { staminaRecovered: { $gt: 0 } },
            { itemName: "Eldin Ore" },
            { itemName: "Wood" },
          ],
        },
        {
          $or: [
            { itemName: "Eldin Ore" },
            { itemName: "Wood" },
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

    const list = (items as unknown as ExploreItem[]).map((doc) => ({
      _id: String(doc._id),
      itemName: doc.itemName,
      emoji: doc.emoji ?? "",
      modifierHearts: doc.modifierHearts ?? 0,
      staminaRecovered: doc.staminaRecovered ?? 0,
      image: doc.image ?? undefined,
    }));

    return NextResponse.json(list);
  } catch (err) {
    console.error("[explore/items]", err);
    return NextResponse.json(
      { error: "Failed to load exploration items" },
      { status: 500 }
    );
  }
}
