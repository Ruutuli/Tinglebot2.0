import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { generalCategories } from "@/lib/general-item-categories";

export type ElixirMaterialSelection = {
  inventoryDocumentId: mongoose.Types.ObjectId;
  maxQuantity: number;
};

function itemMatchesLine(itemName: string, lineName: string): boolean {
  const cat = generalCategories[lineName];
  if (cat) return cat.includes(itemName);
  return itemName.trim().toLowerCase() === lineName.trim().toLowerCase();
}

export function parseElixirMaterialSelectionsBody(raw: unknown): Array<{
  inventoryDocumentId: string;
  maxQuantity: number;
}> | null {
  if (!Array.isArray(raw)) return null;
  const out: Array<{ inventoryDocumentId: string; maxQuantity: number }> = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") return null;
    const id = String((entry as { inventoryDocumentId?: unknown }).inventoryDocumentId ?? "").trim();
    const mq = Number((entry as { maxQuantity?: unknown }).maxQuantity);
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    if (!Number.isFinite(mq) || mq < 1) return null;
    out.push({ inventoryDocumentId: id, maxQuantity: Math.floor(mq) });
  }
  return out.length ? out : null;
}

/**
 * Ensures commissioner-chosen stacks cover the **base** recipe (qty 1 craft).
 * Boosts may reduce needs at claim time; offering extra headroom is allowed.
 */
export async function validateElixirMaterialSelectionsForCommission(
  userId: string,
  requesterCharacterName: string,
  craftingMaterial: Array<{ itemName: string; quantity: number }>,
  rawSelections: unknown
): Promise<{ ok: false; error: string } | { ok: true; selections: ElixirMaterialSelection[] }> {
  const parsed = parseElixirMaterialSelectionsBody(rawSelections);
  if (!parsed) {
    return {
      ok: false,
      error:
        "Mixer elixir posts require elixirMaterialSelections: an array of { inventoryDocumentId, maxQuantity } for stacks on your OC.",
    };
  }

  const mats = Array.isArray(craftingMaterial) ? craftingMaterial : [];
  if (mats.length === 0) {
    return { ok: false, error: "This elixir has no recipe materials in the catalog." };
  }

  await connect();
  const Character = (await import("@/models/CharacterModel.js")).default;
  const ModCharacterModule = await import("@/models/ModCharacterModel.js");
  const ModCharacter = ModCharacterModule.default || ModCharacterModule;

  const esc = requesterCharacterName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameRe = new RegExp(`^${esc}$`, "i");

  let charDoc = await Character.findOne({ userId, name: nameRe }).select("_id name").lean();
  if (!charDoc) {
    charDoc = await ModCharacter.findOne({ userId, name: nameRe }).select("_id name").lean();
  }
  if (!charDoc?._id) {
    return { ok: false, error: "Requester OC not found." };
  }

  const charId =
    typeof charDoc._id === "string" ? new mongoose.Types.ObjectId(charDoc._id) : charDoc._id;

  const db = await getInventoriesDb();
  const collection = db.collection(String(charDoc.name).toLowerCase());

  type Resolved = { docId: mongoose.Types.ObjectId; itemName: string; qtyLeft: number };
  const resolved: Resolved[] = [];

  for (const sel of parsed) {
    const docId = new mongoose.Types.ObjectId(sel.inventoryDocumentId);
    const row = await collection.findOne({
      _id: docId,
      characterId: charId,
    });
    if (!row) {
      return { ok: false, error: "One or more selected inventory rows are invalid for this OC." };
    }
    const stackQty = Math.floor(Number(row.quantity)) || 0;
    const usable = Math.min(sel.maxQuantity, stackQty);
    if (usable < 1) {
      return {
        ok: false,
        error: `Stack "${String(row.itemName)}" has no quantity available (check maxQuantity).`,
      };
    }
    resolved.push({
      docId,
      itemName: String(row.itemName ?? ""),
      qtyLeft: usable,
    });
  }

  for (const mat of mats) {
    const need = Math.max(0, Math.floor(Number(mat.quantity))) * 1;
    if (need <= 0) continue;
    let rem = need;
    for (const entry of resolved) {
      if (rem <= 0) break;
      if (entry.qtyLeft <= 0) continue;
      if (!itemMatchesLine(entry.itemName, mat.itemName)) continue;
      const take = Math.min(rem, entry.qtyLeft);
      entry.qtyLeft -= take;
      rem -= take;
    }
    if (rem > 0) {
      return {
        ok: false,
        error: `Your chosen stacks do not cover the recipe: need ${need}× ${mat.itemName} (base recipe).`,
      };
    }
  }

  const selections: ElixirMaterialSelection[] = parsed.map((p) => ({
    inventoryDocumentId: new mongoose.Types.ObjectId(p.inventoryDocumentId),
    maxQuantity: p.maxQuantity,
  }));

  return { ok: true, selections };
}
