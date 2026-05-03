import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { userOwnsCharacterName } from "@/lib/crafting-request-helpers";
import { leanOne } from "@/lib/mongoose-lean";
import { generalCategories } from "@/lib/general-item-categories";

export type RecipeMaterialLine = {
  itemName: string;
  quantity: number;
  ownedQty: number;
  sufficient: boolean;
};

type CraftingMaterial = { itemName: string; quantity: number };
type InventoryItem = { itemName: string; quantity: number };

function checkMaterialAvailability(
  material: CraftingMaterial,
  inventory: InventoryItem[],
  categories: Record<string, string[]>
): { owned: number; hasEnough: boolean } {
  const requiredQty = material.quantity;
  let ownedQty = 0;

  if (categories[material.itemName]) {
    const categoryItems = categories[material.itemName];
    ownedQty = inventory
      .filter((invItem) => categoryItems.includes(invItem.itemName))
      .reduce((sum, inv) => sum + inv.quantity, 0);
  } else {
    ownedQty = inventory
      .filter((invItem) => invItem.itemName.toLowerCase() === material.itemName.toLowerCase())
      .reduce((sum, inv) => sum + inv.quantity, 0);
  }

  return {
    owned: ownedQty,
    hasEnough: ownedQty >= requiredQty,
  };
}

/**
 * Compares recipe lines to the requester OC's inventory (stack totals; same rules as material-check API).
 */
export async function evaluateRecipeMaterialsOnInventory(
  userId: string,
  requesterCharacterName: string,
  rawMaterials: unknown
): Promise<
  | { ok: false; error: string }
  | { ok: true; hasRecipe: false; allMaterialsMet: true; lines: RecipeMaterialLine[] }
  | { ok: true; hasRecipe: true; allMaterialsMet: boolean; lines: RecipeMaterialLine[] }
> {
  const mats = Array.isArray(rawMaterials) ? rawMaterials : [];
  const normalized: CraftingMaterial[] = [];
  for (const m of mats) {
    if (!m || typeof m !== "object") continue;
    const need = Number((m as { quantity?: unknown }).quantity);
    const name = String((m as { itemName?: unknown }).itemName ?? "").trim();
    if (!Number.isFinite(need) || need <= 0 || !name) continue;
    normalized.push({ itemName: name, quantity: need });
  }

  if (normalized.length === 0) {
    return { ok: true, hasRecipe: false, allMaterialsMet: true, lines: [] };
  }

  const owns = await userOwnsCharacterName(userId, requesterCharacterName);
  if (!owns) {
    return { ok: false, error: "Requester OC must be one of your characters" };
  }

  await connect();
  const Character = (await import("@/models/CharacterModel.js")).default;
  const ModCharacterModule = await import("@/models/ModCharacterModel.js");
  const ModCharacter = ModCharacterModule.default || ModCharacterModule;

  const esc = requesterCharacterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameRe = new RegExp(`^${esc}$`, "i");

  type LeanChar = { _id: mongoose.Types.ObjectId | string; name: string };
  let charDoc = leanOne<LeanChar>(
    await Character.findOne({ userId, name: nameRe }).select("_id name").lean()
  );
  if (!charDoc) {
    charDoc = leanOne<LeanChar>(
      await ModCharacter.findOne({ userId, name: nameRe }).select("_id name").lean()
    );
  }

  if (!charDoc) {
    return { ok: false, error: "Character not found" };
  }

  const db = await getInventoriesDb();
  const collection = db.collection(charDoc.name.toLowerCase());
  const charId =
    typeof charDoc._id === "string" ? new mongoose.Types.ObjectId(charDoc._id) : charDoc._id;
  const rows = await collection.find({ characterId: charId }).toArray();

  const inventory: InventoryItem[] = [];
  for (const row of rows) {
    const q = Number(row.quantity);
    if (!Number.isFinite(q) || q <= 0) continue;
    inventory.push({ itemName: String(row.itemName ?? ""), quantity: q });
  }

  const lines: RecipeMaterialLine[] = [];
  for (const material of normalized) {
    const { owned, hasEnough } = checkMaterialAvailability(material, inventory, generalCategories);
    lines.push({
      itemName: material.itemName,
      quantity: material.quantity,
      ownedQty: owned,
      sufficient: hasEnough,
    });
  }

  if (lines.length === 0) {
    return { ok: true, hasRecipe: false, allMaterialsMet: true, lines: [] };
  }

  const allMaterialsMet = lines.every((l) => l.sufficient);
  return { ok: true, hasRecipe: true, allMaterialsMet, lines };
}

export function formatMissingMaterialsMessage(lines: RecipeMaterialLine[]): string {
  const short = lines
    .filter((l) => !l.sufficient)
    .map((l) => `${l.itemName}: need ${l.quantity}, have ${l.ownedQty}`)
    .join("; ");
  return short;
}
