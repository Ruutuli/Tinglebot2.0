// POST /api/explore/parties/[partyId]/join — add character with 3 items to party

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { connect, getInventoriesDb } from "@/lib/db";
import { getSession } from "@/lib/session";
import mongoose, { type Model } from "mongoose";

export const dynamic = "force-dynamic";

const REGION_TO_VILLAGE: Record<string, string> = {
  eldin: "rudania",
  lanayru: "inariko",
  faron: "vhintl",
};

function normalizeVillage(v: string): string {
  return (v || "").trim().toLowerCase();
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

    const body = await req.json();
    const characterId = body.characterId as string;
    const itemNames = body.itemNames as string[];

    if (!characterId || !Array.isArray(itemNames)) {
      return NextResponse.json(
        { error: "Provide characterId and itemNames array." },
        { status: 400 }
      );
    }
    if (itemNames.length > 3) {
      return NextResponse.json(
        { error: "At most 3 items allowed." },
        { status: 400 }
      );
    }

    const names = itemNames.map((n) => (n || "").trim()).filter(Boolean);

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
    if (partyObj.status !== "open") {
      return NextResponse.json({ error: "This expedition has already started." }, { status: 400 });
    }

    const charArray = (partyObj.characters as unknown[]) ?? [];
    if (charArray.length >= 4) {
      return NextResponse.json(
        { error: "Expedition already has 4 members." },
        { status: 400 }
      );
    }
    const hasUser = charArray.some((c: unknown) => (c as Record<string, unknown>).userId === user.id);
    if (hasUser) {
      return NextResponse.json({ error: "You already have a character in this expedition." }, { status: 400 });
    }

    let character = (await Character.findById(characterId).lean()) as Record<string, unknown> | null;
    if (!character) {
      character = (await ModCharacter.findById(characterId).lean()) as Record<string, unknown> | null;
    }
    if (!character || character.userId !== user.id) {
      return NextResponse.json({ error: "Character not found or not yours." }, { status: 404 });
    }

    const requiredVillage = REGION_TO_VILLAGE[(partyObj.region as string) ?? ""];
    if (!requiredVillage) {
      return NextResponse.json({ error: "Invalid party region." }, { status: 400 });
    }
    const charVillage = normalizeVillage((character.currentVillage as string) ?? "");
    if (charVillage !== requiredVillage) {
      return NextResponse.json(
        { error: `Character must be in ${requiredVillage.charAt(0).toUpperCase() + requiredVillage.slice(1)} to join this expedition.` },
        { status: 400 }
      );
    }

    const characterName = String(character.name ?? "").trim();
    const db = await getInventoriesDb();
    const collectionName = characterName.toLowerCase();
    const collection = db.collection(collectionName);
    const charId = character._id instanceof mongoose.Types.ObjectId ? character._id : new mongoose.Types.ObjectId(String(character._id));
    const inventoryRows = await collection.find({ characterId: charId, quantity: { $gt: 0 } }).toArray();
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
      const need = names.filter((n) => (n || "").trim().toLowerCase() === key).length;
      if (have < need) {
        return NextResponse.json(
          { error: `Not enough "${itemName}" in inventory (have ${have}, need ${need}).` },
          { status: 400 }
        );
      }
    }

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
    const foundItems: Array<{ itemName: string; modifierHearts?: number; staminaRecovered?: number; emoji?: string }> = [];
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

    const rawHearts = Number(character.currentHearts);
    const rawStamina = Number(character.currentStamina);
    const currentHearts = Number.isFinite(rawHearts) ? rawHearts : (Number.isFinite(Number(character.maxHearts)) ? Number(character.maxHearts) : 0);
    const currentStamina = Number.isFinite(rawStamina) ? rawStamina : (Number.isFinite(Number(character.maxStamina)) ? Number(character.maxStamina) : 0);
    const iconVal = character.icon;
    const icon = typeof iconVal === "string" && iconVal.trim() ? iconVal.trim() : "https://via.placeholder.com/100";

    const characterData = {
      _id: new mongoose.Types.ObjectId(characterId),
      userId: character.userId,
      name: character.name,
      currentHearts,
      currentStamina,
      icon,
      items: foundItems.map((it) => ({
        itemName: it.itemName,
        modifierHearts: it.modifierHearts ?? 0,
        staminaRecovered: it.staminaRecovered ?? 0,
        emoji: it.emoji ?? "🔹",
      })),
    };

    await Party.updateOne(
      { partyId },
      {
        $push: { characters: characterData },
        $inc: { totalHearts: currentHearts, totalStamina: currentStamina },
      }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[explore/parties/[partyId]/join]", err);
    return NextResponse.json(
      { error: "Failed to join expedition" },
      { status: 500 }
    );
  }
}
