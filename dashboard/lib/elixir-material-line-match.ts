import { generalCategories } from "@/lib/general-item-categories";

/** Strip optional stack suffix (e.g. elixir potency label) before comparing to recipe lines. */
export function normalizedInventoryItemNameForRecipeMatch(itemName: string): string {
  return String(itemName ?? "")
    .trim()
    .replace(/\s*\[[^\]]+\]\s*$/i, "")
    .trim();
}

export function itemMatchesRecipeLine(itemName: string, recipeLineName: string): boolean {
  const cat = generalCategories[recipeLineName];
  if (cat) return cat.includes(itemName);
  return itemName.trim().toLowerCase() === recipeLineName.trim().toLowerCase();
}

export function itemMatchesAnyRecipeLine(
  itemName: string,
  craftingMaterial: ReadonlyArray<{ itemName: string; quantity: number }>
): boolean {
  const base = normalizedInventoryItemNameForRecipeMatch(itemName);
  return craftingMaterial.some((m) => itemMatchesRecipeLine(base, m.itemName));
}

const MONSTER_PART_NAME_KEYS = new Set(
  (generalCategories["Any Monster Part"] ?? []).map((n) => n.toLowerCase())
);

/** True when the catalog name is in the `Any Monster Part` list (UI hint only). */
export function isCatalogMonsterPartItemName(itemName: string): boolean {
  const base = normalizedInventoryItemNameForRecipeMatch(itemName).toLowerCase();
  return MONSTER_PART_NAME_KEYS.has(base);
}

/** Short label for mixer list rows (catalog categories, not live DB labels). */
export function mixerStackRoleBadge(itemName: string): "Monster part" | "Critter" | "Fairy / special" {
  const raw = normalizedInventoryItemNameForRecipeMatch(itemName);
  if (/\bmock\s+fairy\b/i.test(raw) || /\bfairy\b/i.test(raw)) return "Fairy / special";
  if (isCatalogMonsterPartItemName(itemName)) return "Monster part";
  return "Critter";
}

export type MixerRecipeLineProgress = {
  itemName: string;
  need: number;
  committed: number;
  satisfied: boolean;
  matchingStackCount: number;
  isBroadPart: boolean;
};

export type MixerEligibleStack = { _id: string; itemName: string; quantity: number };

export function computeMixerRecipeLineProgress(
  craftingMaterial: ReadonlyArray<{ itemName: string; quantity: number }>,
  eligibleStacks: ReadonlyArray<MixerEligibleStack>,
  qtyById: Readonly<Record<string, number>>
): MixerRecipeLineProgress[] {
  return craftingMaterial.map((line) => {
    const need = Math.max(0, Math.floor(Number(line.quantity)) || 0);
    const matching = eligibleStacks.filter((st) =>
      itemMatchesRecipeLine(normalizedInventoryItemNameForRecipeMatch(st.itemName), line.itemName)
    );
    const committed = matching.reduce(
      (s, st) => s + Math.max(0, Math.floor(Number(qtyById[st._id])) || 0),
      0
    );
    return {
      itemName: line.itemName,
      need,
      committed,
      satisfied: need > 0 && committed >= need,
      matchingStackCount: matching.length,
      isBroadPart: isMixerRecipeLineBroadPartChoice(line.itemName),
    };
  });
}

/**
 * `/crafting brew` consumes at most this many inventory units per brew:
 * 1 critter + 1 monster part + up to 3 optional extras (extras can repeat the same item).
 * @see MAX_MIXER_EXTRAS in bot/commands/jobs/brewMixerHandler.js
 */
export const MIXER_BREW_MAX_INGREDIENT_UNITS = 5;

/** Units reserved for the mandatory critter + monster-part roles (extras cap is relative to this). */
export const MIXER_BREW_BASE_ROLE_UNITS = 2;

/** Optional ingredients after critter + part. */
export const MIXER_BREW_MAX_EXTRAS = 3;

/** One-line rule for errors and hints (keep in sync with Discord `/crafting brew`). */
export const MIXER_BREW_RULE_SUMMARY =
  "1 critter + 1 monster part (2 units toward those roles), then up to 3 optional extra units — 5 total max; extras can repeat the same stack.";

export function mixerBrewOverBudgetMessage(committedSum: number): string {
  return `Mixer brew allows at most ${MIXER_BREW_MAX_INGREDIENT_UNITS} ingredient units total (${MIXER_BREW_RULE_SUMMARY}) Your commitments sum to ${committedSum}. Lower quantities in the form or edit the request.`;
}

export function mixerBrewRecipeNotCoveredMessage(
  need: number,
  recipeLineName: string,
  shortfall: number
): string {
  return `Your stack choices don't cover this elixir's catalog recipe: need ${need}× "${recipeLineName}" (still short by ${shortfall}). Assign units from stacks that match each recipe line — usually one critter line and one monster-part line — then add up to ${MIXER_BREW_MAX_EXTRAS} more units as optional extras.`;
}

export function mixerBrewTooFewUnitsMessage(committedSum: number, recipeMinimum: number): string {
  return `Mixer brew needs enough units to cover every catalog recipe line (at least ${recipeMinimum} for this elixir). You only committed ${committedSum} total. Add stacks or raise quantities so each line is satisfied, up to ${MIXER_BREW_MAX_INGREDIENT_UNITS} units including extras.`;
}

export function mixerBrewCommitExceedsStackMessage(itemName: string, committed: number, inStock: number): string {
  return `For "${itemName}" you committed ${committed} unit(s), but that inventory stack only has ${inStock}. Lower the amount to match what's in your OC's inventory.`;
}

/** Sum of catalog line quantities for one craft (each line must be satisfiable from committed stacks). */
export function mixerRecipeMinimumTotalUnits(
  craftingMaterial: ReadonlyArray<{ quantity?: unknown }>
): number {
  let n = 0;
  for (const m of craftingMaterial) {
    const q = Math.floor(Number(m.quantity));
    if (Number.isFinite(q) && q > 0) n += q;
  }
  return n;
}

/**
 * Catalog lines like `Any Monster Part` where many inventory stacks qualify — player must choose.
 * (Extend if elixir recipes add more open-ended part buckets.)
 */
export function isMixerRecipeLineBroadPartChoice(lineName: string): boolean {
  return lineName.trim().toLowerCase() === "any monster part";
}

/** Recipe lines we may auto-fill when exactly one stack matches (critter / specific / small categories). */
export function shouldAutoPickMixerRecipeLine(lineName: string): boolean {
  return !isMixerRecipeLineBroadPartChoice(lineName);
}

/**
 * When a non–part-bucket line has exactly one matching stack, commit up to the line quantity
 * (respecting stack size and brew unit cap). Does not remove user commits; only tops up deficits.
 */
export function computeMixerAutoPickedQuantities(
  craftingMaterial: ReadonlyArray<{ itemName: string; quantity: number }>,
  eligibleStacks: ReadonlyArray<MixerEligibleStack>,
  currentQty: Readonly<Record<string, number>>
): Record<string, number> {
  const next: Record<string, number> = { ...currentQty };

  const totalCommitted = (): number => {
    let s = 0;
    for (const st of eligibleStacks) {
      const v = Math.max(0, Math.floor(Number(next[st._id])) || 0);
      if (v > 0) s += v;
    }
    return s;
  };

  for (const line of craftingMaterial) {
    if (!shouldAutoPickMixerRecipeLine(line.itemName)) continue;
    const need = Math.max(0, Math.floor(Number(line.quantity)) || 0);
    if (need < 1) continue;

    const matching = eligibleStacks.filter((st) =>
      itemMatchesRecipeLine(normalizedInventoryItemNameForRecipeMatch(st.itemName), line.itemName)
    );
    if (matching.length !== 1) continue;

    const st = matching[0]!;
    const committedOnLine = matching.reduce(
      (sum, m) => sum + Math.max(0, Math.floor(Number(next[m._id])) || 0),
      0
    );
    if (committedOnLine >= need) continue;

    const deficit = need - committedOnLine;
    const alreadyOnStack = Math.max(0, Math.floor(Number(next[st._id])) || 0);
    const roomInStack = Math.max(0, st.quantity - alreadyOnStack);
    const total = totalCommitted();
    const roomInBrew = Math.max(0, MIXER_BREW_MAX_INGREDIENT_UNITS - total + alreadyOnStack);
    const take = Math.min(deficit, roomInStack, roomInBrew);
    if (take > 0) {
      next[st._id] = alreadyOnStack + take;
    }
  }

  return next;
}
