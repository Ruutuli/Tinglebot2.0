/**
 * Which inventory stacks may appear on mixer commissions — mirrors `/crafting brew` extras:
 * recipe lines, plus labeled monster parts (neutral/thread), same-effect-family critters, Fairy/Mock Fairy.
 */
import { connect } from "@/lib/db";
import {
  effectFamilyFromElixirItemName,
  getAllowedPartElementsForFamily,
} from "@/lib/elixir-catalog";
import {
  itemMatchesAnyRecipeLine,
  normalizedInventoryItemNameForRecipeMatch,
} from "@/lib/elixir-material-line-match";

const MIXER_EXCLUDED_LOWER = new Set(["chuchu egg"]);
const UNIVERSAL_FAIRY_LOWER = new Set(["fairy", "mock fairy"]);

function normKey(name: string): string {
  return normalizedInventoryItemNameForRecipeMatch(name).toLowerCase();
}

/** Exported for inventory filtering (map lookups). */
export function mixerNormKey(name: string): string {
  return normKey(name);
}

function escapeRegex(s: string): string {
  return String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolvePartElementFromDoc(doc: {
  element?: unknown;
  itemName?: string;
}): string {
  const dbEl = doc.element != null ? String(doc.element).trim().toLowerCase() : "";
  if (dbEl) return dbEl;
  return "none";
}

export type MixerLabelSets = {
  critterNamesLower: Set<string>;
  partNamesLower: Set<string>;
  familyByCritterLower: Map<string, string>;
};

let labelSetsCache: MixerLabelSets | null = null;

/** Loads mixer critter/part label sets from Items (same rules as bot `refreshIngredientLabelSetsFromDb`). */
export async function loadMixerLabelSetsFromDb(): Promise<MixerLabelSets> {
  if (labelSetsCache) return labelSetsCache;
  await connect();
  const Item = (await import("@/models/ItemModel.js")).default;

  const [critterDocs, partDocs] = await Promise.all([
    Item.find({
      effectFamily: { $exists: true, $nin: [null, ""] },
    })
      .select("itemName effectFamily")
      .lean<Array<{ itemName?: string; effectFamily?: string }>>(),
    Item.find({
      element: { $exists: true, $ne: null },
      $or: [{ effectFamily: { $exists: false } }, { effectFamily: null }, { effectFamily: "" }],
    })
      .select("itemName element effectFamily")
      .lean<Array<{ itemName?: string; element?: unknown; effectFamily?: unknown }>>(),
  ]);

  const critterNamesLower = new Set<string>();
  const partNamesLower = new Set<string>();
  const familyByCritterLower = new Map<string, string>();

  for (const d of critterDocs) {
    const name = d.itemName;
    if (!name) continue;
    const k = normKey(name);
    if (MIXER_EXCLUDED_LOWER.has(k)) continue;
    critterNamesLower.add(k);
    const fam = String(d.effectFamily || "").trim().toLowerCase();
    if (fam) familyByCritterLower.set(k, fam);
  }

  for (const d of partDocs) {
    const name = d.itemName;
    if (!name) continue;
    const k = normKey(name);
    if (MIXER_EXCLUDED_LOWER.has(k)) continue;
    if (d.effectFamily && String(d.effectFamily).trim() !== "") continue;
    partNamesLower.add(k);
  }

  labelSetsCache = { critterNamesLower, partNamesLower, familyByCritterLower };
  return labelSetsCache;
}

/** Call after DB edits to mixer items if you need fresh sets in long-lived processes. */
export function clearMixerLabelSetsCache(): void {
  labelSetsCache = null;
}

export type LeanMixerItem = {
  itemName?: string;
  effectFamily?: string | null;
  element?: string | null;
};

/** Core rules (recipe OR `/crafting brew` extra) — sync when Item doc + label sets are known. */
export function mixerCommissionEligibleSync(args: {
  inventoryItemName: string;
  craftingMaterial: ReadonlyArray<{ itemName: string; quantity: number }>;
  brewEffectFamily: string;
  itemDoc: LeanMixerItem | null | undefined;
  sets: MixerLabelSets;
}): boolean {
  const base = normalizedInventoryItemNameForRecipeMatch(args.inventoryItemName);
  if (itemMatchesAnyRecipeLine(base, args.craftingMaterial)) return true;

  const brewFam = args.brewEffectFamily.trim().toLowerCase();
  const key = normKey(base);
  if (MIXER_EXCLUDED_LOWER.has(key)) return false;
  if (UNIVERSAL_FAIRY_LOWER.has(key)) return true;

  const doc = args.itemDoc;
  if (!doc?.itemName) return false;

  const nameKey = normKey(doc.itemName);
  const { sets } = args;

  if (sets.partNamesLower.has(nameKey)) {
    const allowed = getAllowedPartElementsForFamily(brewFam);
    const actual = resolvePartElementFromDoc(doc);
    return allowed.includes(actual);
  }

  if (sets.critterNamesLower.has(nameKey)) {
    const famFromDb = doc.effectFamily != null ? String(doc.effectFamily).trim().toLowerCase() : "";
    const fam = famFromDb || sets.familyByCritterLower.get(nameKey) || "";
    return fam === brewFam;
  }

  return false;
}

/**
 * True if this inventory stack may be committed for a mixer commission for `brewCraftItemName`
 * (recipe coverage OR valid brew extra).
 */
export async function isInventoryStackEligibleForMixerCommission(args: {
  inventoryItemName: string;
  craftingMaterial: ReadonlyArray<{ itemName: string; quantity: number }>;
  brewCraftItemName: string;
  /** Optional pre-fetched Item row for normalized base name */
  itemDoc?: LeanMixerItem | null;
}): Promise<boolean> {
  const brewFam = effectFamilyFromElixirItemName(args.brewCraftItemName);
  if (!brewFam) return false;

  const base = normalizedInventoryItemNameForRecipeMatch(args.inventoryItemName);
  const mats = args.craftingMaterial;
  if (itemMatchesAnyRecipeLine(base, mats)) return true;

  let doc = args.itemDoc;
  if (!doc) {
    await connect();
    const Item = (await import("@/models/ItemModel.js")).default;
    doc = (await Item.findOne({
      itemName: new RegExp(`^${escapeRegex(base)}$`, "i"),
    })
      .select("itemName effectFamily element")
      .lean()) as LeanMixerItem | null;
  }

  const sets = await loadMixerLabelSetsFromDb();
  return mixerCommissionEligibleSync({
    inventoryItemName: args.inventoryItemName,
    craftingMaterial: mats,
    brewEffectFamily: brewFam,
    itemDoc: doc,
    sets,
  });
}

/** Batch-fetch Item docs for normalized stack names (case-insensitive). */
export async function fetchMixerItemDocsByInventoryNames(
  baseNames: ReadonlyArray<string>
): Promise<Map<string, LeanMixerItem>> {
  const canonicalByLower = new Map<string, string>();
  for (const raw of baseNames) {
    const base = normalizedInventoryItemNameForRecipeMatch(raw);
    const low = normKey(base);
    if (!canonicalByLower.has(low)) canonicalByLower.set(low, base);
  }
  if (!canonicalByLower.size) return new Map();

  await connect();
  const Item = (await import("@/models/ItemModel.js")).default;

  const docs = await Item.find({
    $or: [...canonicalByLower.values()].map((canonical) => ({
      itemName: new RegExp(`^${escapeRegex(canonical)}$`, "i"),
    })),
  })
    .select("itemName effectFamily element")
    .lean<Array<LeanMixerItem>>();

  const map = new Map<string, LeanMixerItem>();
  for (const d of docs) {
    if (!d.itemName) continue;
    map.set(normKey(d.itemName), d);
  }
  return map;
}
