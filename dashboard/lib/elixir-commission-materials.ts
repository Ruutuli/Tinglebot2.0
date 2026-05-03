import mongoose from "mongoose";
import { connect, getInventoriesDb } from "@/lib/db";
import { effectFamilyFromElixirItemName } from "@/lib/elixir-catalog";
import {
  fetchMixerItemDocsByInventoryNames,
  loadMixerLabelSetsFromDb,
  mixerCommissionEligibleSync,
  mixerNormKey,
} from "@/lib/mixer-commission-pool";
import { leanOne } from "@/lib/mongoose-lean";
import {
  itemMatchesRecipeLine,
  MIXER_BREW_MAX_INGREDIENT_UNITS,
  MIXER_BREW_RULE_SUMMARY,
  mixerBrewCommitExceedsStackMessage,
  mixerBrewOverBudgetMessage,
  mixerBrewRecipeNotCoveredMessage,
  mixerBrewTooFewUnitsMessage,
  mixerRecipeMinimumTotalUnits,
  normalizedInventoryItemNameForRecipeMatch,
} from "@/lib/elixir-material-line-match";

export type ElixirMaterialSelection = {
  inventoryDocumentId: mongoose.Types.ObjectId;
  maxQuantity: number;
};

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
    const maxQuantity = Math.floor(mq);
    if (maxQuantity > 1_000_000) return null;
    out.push({ inventoryDocumentId: id, maxQuantity });
  }
  return out.length ? out : null;
}

/** Same stack id may appear twice from buggy clients — merge so budget and inventory stay consistent. */
function mergeElixirMaterialSelectionsByStack(
  parsed: Array<{ inventoryDocumentId: string; maxQuantity: number }>
): Array<{ inventoryDocumentId: string; maxQuantity: number }> {
  const map = new Map<string, number>();
  for (const p of parsed) {
    const prev = map.get(p.inventoryDocumentId) ?? 0;
    map.set(p.inventoryDocumentId, prev + p.maxQuantity);
  }
  return Array.from(map.entries()).map(([inventoryDocumentId, maxQuantity]) => ({
    inventoryDocumentId,
    maxQuantity,
  }));
}

/**
 * Ensures commissioner-chosen stacks cover the **base** recipe (qty 1 craft).
 * Boosts may reduce needs at claim time; offering extra headroom is allowed.
 */
export async function validateElixirMaterialSelectionsForCommission(
  userId: string,
  requesterCharacterName: string,
  craftingMaterial: Array<{ itemName: string; quantity: number }>,
  rawSelections: unknown,
  brewCraftItemName: string
): Promise<{ ok: false; error: string } | { ok: true; selections: ElixirMaterialSelection[] }> {
  const parsedRaw = parseElixirMaterialSelectionsBody(rawSelections);
  if (!parsedRaw) {
    return {
      ok: false,
      error: `Mixer elixir posts require elixirMaterialSelections: a non-empty array of { inventoryDocumentId, maxQuantity } for inventory stacks on your OC. (${MIXER_BREW_RULE_SUMMARY})`,
    };
  }

  const parsed = mergeElixirMaterialSelectionsByStack(parsedRaw);

  const mats = Array.isArray(craftingMaterial) ? craftingMaterial : [];
  if (mats.length === 0) {
    return {
      ok: false,
      error:
        "This elixir has no recipe materials in the catalog (data issue). Pick a different item or ask staff to fix the catalog entry.",
    };
  }

  const brewFam = effectFamilyFromElixirItemName(brewCraftItemName);
  if (!brewFam) {
    return {
      ok: false,
      error:
        "This craft item is not recognized as a mixer elixir output. Pick a standard mixer elixir from the list.",
    };
  }

  const recipeMinimum = mixerRecipeMinimumTotalUnits(mats);
  const sumMaxQty = parsed.reduce((a, p) => a + p.maxQuantity, 0);
  if (sumMaxQty > MIXER_BREW_MAX_INGREDIENT_UNITS) {
    return { ok: false, error: mixerBrewOverBudgetMessage(sumMaxQty) };
  }
  if (sumMaxQty < recipeMinimum) {
    return { ok: false, error: mixerBrewTooFewUnitsMessage(sumMaxQty, recipeMinimum) };
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
  if (!charDoc?._id) {
    return { ok: false, error: "Requester OC not found." };
  }

  const charId =
    typeof charDoc._id === "string" ? new mongoose.Types.ObjectId(charDoc._id) : charDoc._id;

  const db = await getInventoriesDb();
  const collection = db.collection(String(charDoc.name).toLowerCase());

  type RowResolved = {
    sel: (typeof parsed)[number];
    docId: mongoose.Types.ObjectId;
    itemLabel: string;
    stackQty: number;
  };
  const prepass: RowResolved[] = [];

  for (const sel of parsed) {
    const docId = new mongoose.Types.ObjectId(sel.inventoryDocumentId);
    const row = await collection.findOne({
      _id: docId,
      characterId: charId,
    });
    if (!row) {
      return {
        ok: false,
        error:
          "One or more chosen stacks are missing from this OC's inventory (wrong character, sold item, or outdated request). Re-open the form, refresh stacks, and save again.",
      };
    }
    const stackQty = Math.floor(Number(row.quantity)) || 0;
    const itemLabel = String(row.itemName ?? "");
    if (sel.maxQuantity > stackQty) {
      return {
        ok: false,
        error: mixerBrewCommitExceedsStackMessage(itemLabel, sel.maxQuantity, stackQty),
      };
    }
    prepass.push({ sel, docId, itemLabel, stackQty });
  }

  const itemDocMap = await fetchMixerItemDocsByInventoryNames(prepass.map((p) => p.itemLabel));
  const sets = await loadMixerLabelSetsFromDb();

  type Resolved = { docId: mongoose.Types.ObjectId; itemName: string; qtyLeft: number };
  const resolved: Resolved[] = [];

  for (const p of prepass) {
    const doc = itemDocMap.get(mixerNormKey(p.itemLabel)) ?? null;
    const okExtra = mixerCommissionEligibleSync({
      inventoryItemName: p.itemLabel,
      craftingMaterial: mats,
      brewEffectFamily: brewFam,
      itemDoc: doc,
      sets,
    });
    if (!okExtra) {
      return {
        ok: false,
        error: `Stack "${p.itemLabel}" is not valid for this mixer commission. Use printed recipe lines, same-effect-family critters, allowed monster parts for this elixir, or Fairy / Mock Fairy — same rules as /crafting brew.`,
      };
    }
    resolved.push({
      docId: p.docId,
      itemName: p.itemLabel,
      qtyLeft: p.sel.maxQuantity,
    });
  }

  for (const mat of mats) {
    const need = Math.max(0, Math.floor(Number(mat.quantity))) * 1;
    if (need <= 0) continue;
    let rem = need;
    for (const entry of resolved) {
      if (rem <= 0) break;
      if (entry.qtyLeft <= 0) continue;
      if (
        !itemMatchesRecipeLine(normalizedInventoryItemNameForRecipeMatch(entry.itemName), mat.itemName)
      )
        continue;
      const take = Math.min(rem, entry.qtyLeft);
      entry.qtyLeft -= take;
      rem -= take;
    }
    if (rem > 0) {
      return {
        ok: false,
        error: mixerBrewRecipeNotCoveredMessage(need, mat.itemName, rem),
      };
    }
  }

  const selections: ElixirMaterialSelection[] = parsed.map((p) => ({
    inventoryDocumentId: new mongoose.Types.ObjectId(p.inventoryDocumentId),
    maxQuantity: p.maxQuantity,
  }));

  return { ok: true, selections };
}
