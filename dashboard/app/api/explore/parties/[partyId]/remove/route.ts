// POST /api/explore/parties/[partyId]/remove — any party member can remove another member

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose, { type Model } from "mongoose";

export const dynamic = "force-dynamic";

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
    obtain: "Expedition item refund (removed by party member)",
  });
}

export async function POST(
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

    const body = await req.json().catch(() => ({}));
    const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!targetUserId) {
      return NextResponse.json({ error: "Missing userId to remove" }, { status: 400 });
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
        { error: "You can only remove members while the expedition is open, not after it has started." },
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
    
    const requesterInParty = charArray.some((c) => c.userId === user.id);
    if (!requesterInParty) {
      return NextResponse.json(
        { error: "Only party members can remove other members." },
        { status: 403 }
      );
    }

    const targetIndex = charArray.findIndex((c) => c.userId === targetUserId);
    if (targetIndex < 0) {
      return NextResponse.json(
        { error: "That user is not in this expedition." },
        { status: 400 }
      );
    }

    const target = charArray[targetIndex];
    const currentHearts = Number(target.currentHearts) || 0;
    const currentStamina = Number(target.currentStamina) || 0;
    const totalHearts = Number(partyObj.totalHearts) || 0;
    const totalStamina = Number(partyObj.totalStamina) || 0;
    const currentTurn = Number(partyObj.currentTurn) || 0;
    const newLength = charArray.length - 1;
    let newCurrentTurn = currentTurn;
    if (targetIndex < currentTurn) {
      newCurrentTurn = currentTurn - 1;
    } else if (targetIndex === currentTurn && newLength > 0) {
      newCurrentTurn = Math.min(currentTurn, newLength - 1);
    }
    newCurrentTurn = Math.max(0, Math.min(newCurrentTurn, newLength - 1));

    const isLeader = String(partyObj.leaderId ?? "") === targetUserId;
    const newLeaderId =
      isLeader && newLength > 0
        ? (charArray.find((c) => c.userId !== targetUserId)?.userId as string) ?? ""
        : undefined;

    const isTestingMode = process.env.EXPLORATION_TESTING_MODE === "true";
    if (!isTestingMode) {
      const rawItems = (target.items as Array<Record<string, unknown>> | undefined) ?? [];
      const loadoutItemNamesForLog = rawItems.map((s) => String((s.itemName ?? s.item_name ?? "") ?? "").trim()).filter(Boolean);
      console.log(`[EXPLORE REMOVE] Returning loadout items to inventory: ${loadoutItemNamesForLog.join(", ") || "none"}`);
      const loadoutItemNames = rawItems
        .map((slot) => String((slot.itemName ?? slot.item_name ?? "") ?? "").trim())
        .filter(Boolean);
      const charId =
        target._id instanceof mongoose.Types.ObjectId
          ? target._id
          : new mongoose.Types.ObjectId(String(target._id));

      if (loadoutItemNames.length > 0) {
        let collectionName = String(target.name ?? "").trim().toLowerCase();
        const charFromDb = (await Character.findById(charId).select("name").lean()) as { name: string } | null;
        if (charFromDb?.name) {
          collectionName = charFromDb.name.trim().toLowerCase();
        } else {
          const modChar = (await ModCharacter.findById(charId).select("name").lean()) as { name: string } | null;
          if (modChar?.name) {
            collectionName = modChar.name.trim().toLowerCase();
          }
        }
        if (collectionName) {
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
    } else {
      const rawItems = (target.items as Array<Record<string, unknown>> | undefined) ?? [];
      const loadoutForLog = rawItems.map((s) => String((s.itemName ?? s.item_name ?? "") ?? "").trim()).filter(Boolean);
      if (loadoutForLog.length > 0) {
        console.log(`[EXPLORE REMOVE] SKIPPED return items (testing mode) — would have returned: ${loadoutForLog.join(", ")}`);
      }
    }

    const beforeHearts = Number(partyObj.totalHearts) || 0;
    const beforeStamina = Number(partyObj.totalStamina) || 0;

    const updatePayload: Record<string, unknown> = {
      $pull: { characters: { userId: targetUserId } },
      $set: {
        currentTurn: newCurrentTurn,
      },
      $inc: {
        totalHearts: -currentHearts,
        totalStamina: -currentStamina,
      },
    };
    if (newLeaderId !== undefined) {
      (updatePayload.$set as Record<string, unknown>).leaderId = newLeaderId;
    }

    await Party.updateOne({ partyId }, updatePayload);
    console.log(`[EXPLORE REMOVE] partyId=${partyId} removedBy=${user.id} char=${target.name} hearts=${currentHearts} stamina=${currentStamina} | before: ❤${beforeHearts} 🟩${beforeStamina} | after: ❤${beforeHearts - currentHearts} 🟩${beforeStamina - currentStamina}`);

    return NextResponse.json({ ok: true, removedUserId: targetUserId, removedCharName: target.name });
  } catch (err) {
    console.error("[explore/parties/[partyId]/remove]", err);
    return NextResponse.json(
      { error: "Failed to remove party member" },
      { status: 500 }
    );
  }
}
