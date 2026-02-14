// POST /api/explore/parties/[partyId]/leave — remove your character from the party (unjoin), return loadout items to inventory

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose, { type Model } from "mongoose";

export const dynamic = "force-dynamic";

/** Paving bundles: 5 Eldin Ore = 1 bundle, 5 Wood = 1 bundle — return materials when refunding. */
const PAVING_BUNDLES: Record<string, { material: string; quantityPerSlot: number }> = {
  "Eldin Ore Bundle": { material: "Eldin Ore", quantityPerSlot: 5 },
  "Wood Bundle": { material: "Wood", quantityPerSlot: 5 },
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function addMaterialToInventory(
  collection: mongoose.mongo.Collection,
  charId: mongoose.Types.ObjectId,
  materialName: string,
  quantity: number,
  Item: Model<unknown>
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

export async function POST(
  _req: NextRequest,
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

    await connect();

    const Party =
      mongoose.models.Party ??
      ((await import("@/models/PartyModel.js")) as unknown as { default: Model<unknown> }).default;
    const Character =
      mongoose.models.Character ??
      ((await import("@/models/CharacterModel.js")) as unknown as { default: Model<unknown> }).default;
    const ModCharacter =
      mongoose.models.ModCharacter ??
      ((await import("@/models/ModCharacterModel.js")) as unknown as { default: Model<unknown> }).default;
    const Item =
      mongoose.models.Item ??
      ((await import("@/models/ItemModel.js")) as unknown as { default: Model<unknown> }).default;

    const party = await Party.findOne({ partyId }).lean();
    if (!party) {
      return NextResponse.json({ error: "Expedition not found." }, { status: 404 });
    }

    const partyObj = party as Record<string, unknown>;
    if (partyObj.status === "cancelled") {
      return NextResponse.json({ error: "Expedition was cancelled." }, { status: 404 });
    }
    if (partyObj.status === "started" || partyObj.status === "completed") {
      return NextResponse.json(
        { error: "You can only leave while the expedition is open, not after it has started." },
        { status: 400 }
      );
    }
    if (partyObj.status === "open") {
      const createdAt = partyObj.createdAt instanceof Date ? partyObj.createdAt.getTime() : typeof partyObj.createdAt === "string" ? new Date(partyObj.createdAt).getTime() : NaN;
      if (!Number.isNaN(createdAt) && createdAt < Date.now() - 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: "Expedition expired." }, { status: 404 });
      }
    }
    const charArray = (partyObj.characters as Array<Record<string, unknown>>) ?? [];
    const myIndex = charArray.findIndex((c) => c.userId === user.id);
    if (myIndex < 0) {
      return NextResponse.json(
        { error: "You are not in this expedition." },
        { status: 400 }
      );
    }

    const me = charArray[myIndex];
    const currentHearts = Number(me.currentHearts) || 0;
    const currentStamina = Number(me.currentStamina) || 0;
    const totalHearts = Number(partyObj.totalHearts) || 0;
    const totalStamina = Number(partyObj.totalStamina) || 0;
    const currentTurn = Number(partyObj.currentTurn) || 0;
    const newLength = charArray.length - 1;
    let newCurrentTurn = currentTurn;
    if (myIndex < currentTurn) {
      newCurrentTurn = currentTurn - 1;
    } else if (myIndex === currentTurn && newLength > 0) {
      newCurrentTurn = Math.min(currentTurn, newLength - 1);
    }
    newCurrentTurn = Math.max(0, Math.min(newCurrentTurn, newLength - 1));

    const isLeader = String(partyObj.leaderId ?? "") === user.id;
    const newLeaderId =
      isLeader && newLength > 0
        ? (charArray.find((c) => c.userId !== user.id)?.userId as string) ?? ""
        : undefined;

    // Return the character's expedition loadout items to their inventory (same collection as join uses)
    const rawItems = (me.items as Array<Record<string, unknown>> | undefined) ?? [];
    const loadoutItemNames = rawItems
      .map((slot) => String((slot.itemName ?? slot.item_name ?? "") ?? "").trim())
      .filter(Boolean);
    const charId =
      me._id instanceof mongoose.Types.ObjectId
        ? me._id
        : new mongoose.Types.ObjectId(String(me._id));

    if (loadoutItemNames.length > 0) {
      // Resolve canonical character name from DB so we use the exact same inventory collection as join
      let collectionName = String(me.name ?? "").trim().toLowerCase();
      const charFromDb = (await Character.findById(charId).select("name").lean()) as { name: string } | null;
      if (charFromDb?.name) {
        collectionName = charFromDb.name.trim().toLowerCase();
      } else {
        const modChar = (await ModCharacter.findById(charId).select("name").lean()) as { name: string } | null;
        if (modChar?.name) {
          collectionName = modChar.name.trim().toLowerCase();
        }
      }
      if (!collectionName) {
        console.error("[explore/parties/[partyId]/leave] Could not resolve inventory collection name for character", charId);
      } else {
        const db = await getInventoriesDb();
        const collection = db.collection(collectionName);
        for (const itemName of loadoutItemNames) {
          const bundle = PAVING_BUNDLES[itemName];
          if (bundle) {
            await addMaterialToInventory(
              collection,
              charId,
              bundle.material,
              bundle.quantityPerSlot,
              Item
            );
          } else {
            await addMaterialToInventory(collection, charId, itemName, 1, Item);
          }
        }
      }
    }

    const updatePayload: Record<string, unknown> = {
      $pull: { characters: { userId: user.id } },
      $set: {
        totalHearts: Math.max(0, totalHearts - currentHearts),
        totalStamina: Math.max(0, totalStamina - currentStamina),
        currentTurn: newCurrentTurn,
      },
    };
    if (newLeaderId !== undefined) {
      (updatePayload.$set as Record<string, unknown>).leaderId = newLeaderId;
    }

    await Party.updateOne({ partyId }, updatePayload);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[explore/parties/[partyId]/leave]", err);
    return NextResponse.json(
      { error: "Failed to leave expedition" },
      { status: 500 }
    );
  }
}
