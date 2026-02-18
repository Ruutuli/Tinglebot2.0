// PATCH /api/explore/parties/[partyId]/items — update current user's 3 items (must have already joined)

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose, { type Model } from "mongoose";

export const dynamic = "force-dynamic";

/** Paving bundles: 5 Eldin Ore = 1 bundle = 1 slot, 5 Wood = 1 bundle = 1 slot */
const PAVING_BUNDLES: Record<string, { material: string; requiredPerSlot: number }> = {
  "Eldin Ore Bundle": { material: "Eldin Ore", requiredPerSlot: 5 },
  "Wood Bundle": { material: "Wood", requiredPerSlot: 5 },
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function deductMaterialFromInventory(
  collection: mongoose.mongo.Collection,
  charId: mongoose.Types.ObjectId,
  materialName: string,
  quantity: number
): Promise<void> {
  if (quantity <= 0) return;
  const regex = new RegExp(`^${escapeRegExp(materialName)}$`, "i");
  const entries = await collection
    .find({ characterId: charId, itemName: { $regex: regex }, quantity: { $gt: 0 } })
    .toArray();
  let remaining = quantity;
  for (const entry of entries) {
    if (remaining <= 0) break;
    const qty = Number(entry.quantity) || 0;
    const take = Math.min(remaining, qty);
    const newQty = qty - take;
    if (newQty === 0) {
      await collection.deleteOne({ _id: entry._id });
    } else {
      await collection.updateOne({ _id: entry._id }, { $inc: { quantity: -take } });
    }
    remaining -= take;
  }
}

async function addMaterialToInventory(
  collection: mongoose.mongo.Collection,
  charId: mongoose.Types.ObjectId,
  materialName: string,
  quantity: number,
  Item: mongoose.Model<unknown>
): Promise<void> {
  if (quantity <= 0) return;
  const regex = new RegExp(`^${escapeRegExp(materialName)}$`, "i");
  const existing = await collection.findOne({ characterId: charId, itemName: { $regex: regex } });
  if (existing) {
    await collection.updateOne({ _id: existing._id }, { $inc: { quantity } });
    return;
  }
  const itemDoc = (await Item.findOne({ itemName: { $regex: regex } }).lean()) as Record<string, unknown> | null;
  const canonicalName = (itemDoc?.itemName as string | undefined) ?? materialName;
  const itemId = itemDoc?._id ?? null;
  const cat = itemDoc?.category;
  const category = Array.isArray(cat) ? (cat as string[]).join(", ") : String(cat ?? "");
  const typ = itemDoc?.type;
  const type = Array.isArray(typ) ? (typ as string[]).join(", ") : String(typ ?? "");
  const sub = itemDoc?.subtype;
  const subtype = Array.isArray(sub) ? (sub as string[]).join(", ") : String(sub ?? "");
  await collection.insertOne({
    characterId: charId,
    itemName: canonicalName,
    itemId,
    quantity,
    category,
    type,
    subtype,
    job: "",
    perk: "",
    location: "",
    date: new Date(),
    obtain: "Expedition item refund",
  });
}

const explorationItemFilter = {
  $or: [
    {
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
            { itemName: /Fairy/i },
          ],
        },
      ],
    },
    { itemName: /Goddess Plume/i },
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
    if (partyObj.status === "cancelled") {
      return NextResponse.json({ error: "Expedition was cancelled." }, { status: 404 });
    }
    if (partyObj.status === "open") {
      const createdAt = partyObj.createdAt instanceof Date ? partyObj.createdAt.getTime() : typeof partyObj.createdAt === "string" ? new Date(partyObj.createdAt).getTime() : NaN;
      if (!Number.isNaN(createdAt) && createdAt < Date.now() - 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "Expedition expired." }, { status: 404 });
      }
    }
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

    // Would-have after refund: we refund first, then deduct. Validate (current + refund) >= deduct.
    const wouldHave = new Map(inventoryQty);
    const oldItems = (member.items as Array<{ itemName: string }>) ?? [];
    const oldNames = oldItems.map((it) => (it.itemName || "").trim()).filter(Boolean);
    const oldEldinBundles = oldNames.filter((n) => n === "Eldin Ore Bundle").length;
    const oldWoodBundles = oldNames.filter((n) => n === "Wood Bundle").length;
    if (oldEldinBundles > 0) {
      const k = "eldin ore";
      wouldHave.set(k, (wouldHave.get(k) ?? 0) + oldEldinBundles * PAVING_BUNDLES["Eldin Ore Bundle"].requiredPerSlot);
    }
    if (oldWoodBundles > 0) {
      const k = "wood";
      wouldHave.set(k, (wouldHave.get(k) ?? 0) + oldWoodBundles * PAVING_BUNDLES["Wood Bundle"].requiredPerSlot);
    }
    const distinctOldNonBundle = [...new Set(oldNames.filter((n) => !PAVING_BUNDLES[n]))];
    for (const itemName of distinctOldNonBundle) {
      const key = itemName.toLowerCase();
      const count = oldNames.filter((n) => n === itemName).length;
      wouldHave.set(key, (wouldHave.get(key) ?? 0) + count);
    }

    for (const itemName of names) {
      const key = itemName.toLowerCase();
      const bundleSpec = PAVING_BUNDLES[itemName];
      if (bundleSpec) {
        const materialKey = bundleSpec.material.toLowerCase();
        const have = wouldHave.get(materialKey) ?? 0;
        const bundlesWanted = names.filter((n) => (n || "").trim() === itemName).length;
        const need = bundleSpec.requiredPerSlot * bundlesWanted;
        if (have < need) {
          return NextResponse.json(
            { error: `Not enough "${bundleSpec.material}" for ${bundlesWanted}× ${itemName} (need ${need}, have ${have} after refund).` },
            { status: 400 }
          );
        }
      } else {
        const have = wouldHave.get(key) ?? 0;
        const need = names.filter((n) => n.toLowerCase() === key).length;
        if (have < need) {
          return NextResponse.json(
            { error: `Not enough "${itemName}" in inventory (have ${have}, need ${need} after refund).` },
            { status: 400 }
          );
        }
      }
    }

    const foundItems: Array<{ itemName: string; modifierHearts: number; staminaRecovered: number; emoji: string }> = [];
    for (const itemName of names) {
      const bundleSpec = PAVING_BUNDLES[itemName];
      if (bundleSpec) {
        foundItems.push({
          itemName,
          modifierHearts: 0,
          staminaRecovered: 0,
          emoji: "📦",
        });
        continue;
      }
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

    // Refund old + deduct new items (skip in EXPLORATION_TESTING_MODE — loadout is reference-only)
    const isTestingMode = process.env.EXPLORATION_TESTING_MODE === "true";
    if (!isTestingMode) {
      if (oldEldinBundles > 0) {
        await addMaterialToInventory(
          collection,
          charId,
          "Eldin Ore",
          oldEldinBundles * PAVING_BUNDLES["Eldin Ore Bundle"].requiredPerSlot,
          Item
        );
      }
      if (oldWoodBundles > 0) {
        await addMaterialToInventory(
          collection,
          charId,
          "Wood",
          oldWoodBundles * PAVING_BUNDLES["Wood Bundle"].requiredPerSlot,
          Item
        );
      }
      const distinctOldNonBundle = [...new Set(oldNames.filter((n) => !PAVING_BUNDLES[n]))];
      for (const itemName of distinctOldNonBundle) {
        const count = oldNames.filter((n) => n === itemName).length;
        await addMaterialToInventory(collection, charId, itemName, count, Item);
      }
      const eldinBundles = names.filter((n) => (n || "").trim() === "Eldin Ore Bundle").length;
      const woodBundles = names.filter((n) => (n || "").trim() === "Wood Bundle").length;
      if (eldinBundles > 0) {
        await deductMaterialFromInventory(collection, charId, "Eldin Ore", eldinBundles * PAVING_BUNDLES["Eldin Ore Bundle"].requiredPerSlot);
      }
      if (woodBundles > 0) {
        await deductMaterialFromInventory(collection, charId, "Wood", woodBundles * PAVING_BUNDLES["Wood Bundle"].requiredPerSlot);
      }
      const distinctNewNonBundle = [...new Set(names.filter((n) => !PAVING_BUNDLES[n || ""]))];
      for (const itemName of distinctNewNonBundle) {
        const count = names.filter((n) => (n || "").trim() === itemName).length;
        await deductMaterialFromInventory(collection, charId, itemName, count);
      }
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
