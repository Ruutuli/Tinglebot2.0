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

/** Paving bundles: 5 Eldin Ore = 1 bundle = 1 slot, 5 Wood = 1 bundle = 1 slot */
const PAVING_BUNDLES: Record<string, { material: string; requiredPerSlot: number }> = {
  "Eldin Ore Bundle": { material: "Eldin Ore", requiredPerSlot: 5 },
  "Wood Bundle": { material: "Wood", requiredPerSlot: 5 },
};

function normalizeVillage(v: string): string {
  return (v || "").trim().toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Remove quantity of a material from character inventory. Skipped when EXPLORATION_TESTING_MODE=true. */
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

    const debuff = character.debuff as { active?: boolean; endDate?: string | Date } | undefined;
    if (debuff?.active && debuff?.endDate) {
      const endDate = new Date(debuff.endDate);
      if (endDate > new Date()) {
        const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        return NextResponse.json(
          {
            error: `This character is recovering from a full party KO and cannot join expeditions for ${daysLeft} more day(s). During this time they cannot use healing or stamina items, healer services, or explore.`,
          },
          { status: 400 }
        );
      }
    }

    const characterName = String(character.name ?? "").trim();

    // Block if character has unappraised relic
    const Relic =
      mongoose.models.Relic ??
      ((await import("@/models/RelicModel.js")) as unknown as { default: Model<unknown> }).default;
    const unappraised = await Relic.findOne({
      discoveredBy: characterName,
      appraised: false,
      deteriorated: false,
    });
    if (unappraised) {
      return NextResponse.json(
        {
          error: `${characterName} has an unappraised relic and must get it appraised before joining expeditions.`,
        },
        { status: 400 }
      );
    }

    // Block if character is already in another active expedition (open or started)
    // Check both ObjectId and string representations to handle type mismatches
    const charObjectId = new mongoose.Types.ObjectId(characterId);
    const charIdStr = String(characterId);
    const existingParty = await Party.findOne({
      partyId: { $ne: partyId },
      status: { $in: ["open", "started"] },
      $or: [
        { "characters._id": charObjectId },
        { "characters._id": charIdStr },
      ],
    }).lean();
    if (existingParty) {
      const existingPartyObj = existingParty as Record<string, unknown>;
      console.log(`[EXPLORE JOIN] Blocked: ${characterName} already in expedition ${existingPartyObj.partyId}`);
      return NextResponse.json(
        {
          error: `${characterName} is already in another active expedition (${existingPartyObj.partyId}). Leave that expedition first.`,
        },
        { status: 400 }
      );
    }

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
    // Inventory check: normal items 1:1; bundles require material per slot (5 Eldin Ore, 10 Wood)
    for (const itemName of names) {
      const key = itemName.toLowerCase();
      const bundleSpec = PAVING_BUNDLES[itemName];
      if (bundleSpec) {
        const materialKey = bundleSpec.material.toLowerCase();
        const have = inventoryQty.get(materialKey) ?? 0;
        const bundlesWanted = names.filter((n) => (n || "").trim() === itemName).length;
        const need = bundleSpec.requiredPerSlot * bundlesWanted;
        if (have < need) {
          return NextResponse.json(
            { error: `Not enough "${bundleSpec.material}" for ${bundlesWanted}× ${itemName} (need ${need}, have ${have}).` },
            { status: 400 }
          );
        }
      } else {
        const have = inventoryQty.get(key) ?? 0;
        const need = names.filter((n) => (n || "").trim().toLowerCase() === key).length;
        if (have < need) {
          return NextResponse.json(
            { error: `Not enough "${itemName}" in inventory (have ${have}, need ${need}).` },
            { status: 400 }
          );
        }
      }
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
    const foundItems: Array<{ itemName: string; modifierHearts?: number; staminaRecovered?: number; emoji?: string }> = [];
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

    // Deduct brought items from inventory (skip in EXPLORATION_TESTING_MODE — loadout is reference-only)
    const isTestingMode = process.env.EXPLORATION_TESTING_MODE === "true";
    if (!isTestingMode) {
      console.log(`[EXPLORE JOIN] Deducting loadout items from ${charId} (items: ${names.join(", ")})`);
      const eldinBundles = names.filter((n) => (n || "").trim() === "Eldin Ore Bundle").length;
      const woodBundles = names.filter((n) => (n || "").trim() === "Wood Bundle").length;
      if (eldinBundles > 0) {
        await deductMaterialFromInventory(collection, charId, "Eldin Ore", eldinBundles * PAVING_BUNDLES["Eldin Ore Bundle"].requiredPerSlot);
      }
      if (woodBundles > 0) {
        await deductMaterialFromInventory(collection, charId, "Wood", woodBundles * PAVING_BUNDLES["Wood Bundle"].requiredPerSlot);
      }
      const distinctNonBundle = [...new Set(names.filter((n) => !PAVING_BUNDLES[n || ""]))];
      for (const itemName of distinctNonBundle) {
        const count = names.filter((n) => (n || "").trim() === itemName).length;
        await deductMaterialFromInventory(collection, charId, itemName, count);
      }
    } else if (names.length > 0) {
      console.log(`[EXPLORE JOIN] SKIPPED deduct (testing mode) — would have deducted: ${names.join(", ")}`);
    }

    const maxHearts = Number.isFinite(Number(character.maxHearts)) ? Number(character.maxHearts) : 0;
    const maxStamina = Number.isFinite(Number(character.maxStamina)) ? Number(character.maxStamina) : 0;
    const rawHearts = Number(character.currentHearts);
    const rawStamina = Number(character.currentStamina);
    let currentHearts = Number.isFinite(rawHearts) ? rawHearts : maxHearts;
    let currentStamina = Number.isFinite(rawStamina) ? rawStamina : maxStamina;
    if (process.env.EXPLORATION_TESTING_MODE === "true") {
      currentHearts = maxHearts;
      currentStamina = maxStamina;
    }
    const iconVal = character.icon;
    const icon = typeof iconVal === "string" && iconVal.trim() ? iconVal.trim() : "https://via.placeholder.com/100";

    const characterData = {
      _id: new mongoose.Types.ObjectId(characterId),
      userId: character.userId,
      name: character.name,
      currentHearts,
      currentStamina,
      maxHearts,
      maxStamina,
      icon,
      items: foundItems.map((it) => ({
        itemName: it.itemName,
        modifierHearts: it.modifierHearts ?? 0,
        staminaRecovered: it.staminaRecovered ?? 0,
        emoji: it.emoji ?? "🔹",
      })),
    };

    // Log before state for debugging stat accumulation
    const partyBefore = await Party.findOne({ partyId }).lean() as Record<string, unknown> | null;
    const beforeHearts = Number(partyBefore?.totalHearts) || 0;
    const beforeStamina = Number(partyBefore?.totalStamina) || 0;

    await Party.updateOne(
      { partyId },
      {
        $push: { characters: characterData },
        $inc: { totalHearts: currentHearts, totalStamina: currentStamina, maxHearts, maxStamina },
      }
    );

    // Log after state for debugging stat accumulation
    console.log(`[EXPLORE JOIN] partyId=${partyId} char=${characterName} hearts=${currentHearts} stamina=${currentStamina} | before: ❤${beforeHearts} 🟩${beforeStamina} | after: ❤${beforeHearts + currentHearts} 🟩${beforeStamina + currentStamina}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[explore/parties/[partyId]/join]", err);
    return NextResponse.json(
      { error: "Failed to join expedition" },
      { status: 500 }
    );
  }
}
