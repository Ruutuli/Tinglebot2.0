// PATCH /api/explore/parties/[partyId]/items — update current user's 3 items (must have already joined)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose, { type Model } from "mongoose";

export const dynamic = "force-dynamic";

const explorationItemFilter = {
  $and: [
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
        { itemName: /Fairy/i },
      ],
    },
  ],
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> }
) {
  try {
    const session = await getSession();
    const user = session.user ?? null;
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { partyId } = await params;
    if (!partyId) {
      return NextResponse.json({ error: "Missing party ID" }, { status: 400 });
    }

    const body = await req.json();
    const itemNames = body.itemNames as string[];

    if (!Array.isArray(itemNames) || itemNames.length > 3) {
      return NextResponse.json(
        { error: "Provide itemNames array (0 to 3 items)." },
        { status: 400 }
      );
    }

    const names = itemNames.map((n) => (n || "").trim()).filter(Boolean);

    await connect();

    const Party =
      mongoose.models.Party ??
      ((await import("@/models/PartyModel.js")) as unknown as { default: Model<unknown> }).default;
    const Item =
      mongoose.models.Item ??
      ((await import("@/models/ItemModel.js")) as { default: Model<unknown> }).default;

    const party = await Party.findOne({ partyId }).lean();
    if (!party) {
      return NextResponse.json({ error: "Expedition not found." }, { status: 404 });
    }
    const partyObj = party as Record<string, unknown>;
    if (partyObj.status !== "open") {
      return NextResponse.json({ error: "Expedition has already started." }, { status: 400 });
    }

    const characters = (partyObj.characters as Array<Record<string, unknown>>) ?? [];
    const memberIndex = characters.findIndex((c) => String(c.userId) === user.id);
    if (memberIndex === -1) {
      return NextResponse.json({ error: "You are not in this expedition." }, { status: 400 });
    }

    const member = characters[memberIndex];
    const characterName = String(member.name ?? "").trim();
    if (!characterName) {
      return NextResponse.json({ error: "Character name missing." }, { status: 400 });
    }

    const db = await getInventoriesDb();
    const collectionName = characterName.toLowerCase();
    const collection = db.collection(collectionName);
    const charId = member._id instanceof mongoose.Types.ObjectId ? member._id : new mongoose.Types.ObjectId(String(member._id));
    const inventoryRows = await collection
      .find({ characterId: charId, quantity: { $gt: 0 } })
      .toArray();

    const inventoryQty = new Map<string, number>();
    for (const row of inventoryRows) {
      const name = String(row.itemName ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      inventoryQty.set(key, (inventoryQty.get(key) ?? 0) + Number(row.quantity) || 0);
    }

    for (const itemName of names) {
      const key = itemName.toLowerCase();
      const have = inventoryQty.get(key) ?? 0;
      const need = names.filter((n) => n.toLowerCase() === key).length;
      if (have < need) {
        return NextResponse.json(
          { error: `Not enough "${itemName}" in inventory (have ${have}, need ${need}).` },
          { status: 400 }
        );
      }
    }

    const foundItems: Array<{ itemName: string; modifierHearts: number; staminaRecovered: number; emoji: string }> = [];
    for (const itemName of names) {
      const docs = await Item.find({
        itemName,
        categoryGear: { $nin: ["Weapon", "Armor"] },
        ...explorationItemFilter,
      }).lean();
      if (docs.length === 0) {
        return NextResponse.json(
          { error: `"${itemName}" is not a valid exploration item.` },
          { status: 400 }
        );
      }
      const doc = docs[0] as Record<string, unknown>;
      foundItems.push({
        itemName: doc.itemName as string,
        modifierHearts: (doc.modifierHearts as number) ?? 0,
        staminaRecovered: (doc.staminaRecovered as number) ?? 0,
        emoji: (doc.emoji as string) ?? "🔹",
      });
    }

    await Party.updateOne(
      { partyId, "characters.userId": user.id },
      {
        $set: {
          "characters.$.items": foundItems.map((it) => ({
            itemName: it.itemName,
            modifierHearts: it.modifierHearts,
            staminaRecovered: it.staminaRecovered,
            emoji: it.emoji,
          })),
        },
      }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[explore/parties/[partyId]/items PATCH]", err);
    return NextResponse.json(
      { error: "Failed to update items" },
      { status: 500 }
    );
  }
}
