// ============================================================================
// Elixir brew (mixer) — resolve labels + output elixir from critter + part
// ============================================================================

const fs = require('fs');
const path = require('path');
const { ELIXIR_MIXER_EXCLUDED_ITEM_NAMES, normalizeElixirLevel } = require('./elixirModule');

const LABELS_PATH = path.join(__dirname, '..', '..', 'docs', 'elixir-ingredient-labels.json');

/** effectFamily string → catalog elixir item name (Witch-era names in `items` + `ELIXIR_EFFECTS`). */
const EFFECT_FAMILY_TO_ELIXIR = Object.freeze({
  bright: 'Bright Elixir',
  chilly: 'Chilly Elixir',
  electro: 'Electro Elixir',
  enduring: 'Enduring Elixir',
  energizing: 'Energizing Elixir',
  fairy: 'Fairy Tonic',
  hasty: 'Hasty Elixir',
  hearty: 'Hearty Elixir',
  mighty: 'Mighty Elixir',
  sneaky: 'Sneaky Elixir',
  spicy: 'Spicy Elixir',
  sticky: 'Sticky Elixir',
  tough: 'Tough Elixir',
});

let _cachedLabels = null;

function loadLabelsDoc() {
  if (_cachedLabels) return _cachedLabels;
  const raw = fs.readFileSync(LABELS_PATH, 'utf8');
  _cachedLabels = JSON.parse(raw);
  return _cachedLabels;
}

/** @returns {{ critterNames: Set<string>, partNames: Set<string>, familyByCritterName: Map<string,string> }} */
function getIngredientLabelSets() {
  const doc = loadLabelsDoc();
  const labels = doc.labels || {};
  const critterNames = new Set();
  const partNames = new Set();
  const familyByCritterName = new Map();

  for (const [itemName, lab] of Object.entries(labels)) {
    if (!lab || typeof lab !== 'object') continue;
    if (lab.effectFamily) {
      critterNames.add(itemName);
      familyByCritterName.set(itemName.toLowerCase(), lab.effectFamily);
    }
    if (lab.element !== undefined && !lab.effectFamily) {
      partNames.add(itemName);
    }
  }

  return { critterNames, partNames, familyByCritterName };
}

function normalizeNameKey(name) {
  return String(name || '').trim().toLowerCase();
}

function isExcludedMixerItem(itemName) {
  return ELIXIR_MIXER_EXCLUDED_ITEM_NAMES.some((x) => x.toLowerCase() === normalizeNameKey(itemName));
}

/** Resolve output elixir name from critter label family. */
function elixirNameForCritterFamily(effectFamily) {
  if (!effectFamily || typeof effectFamily !== 'string') return null;
  return EFFECT_FAMILY_TO_ELIXIR[effectFamily] || null;
}

/**
 * Validate critter + part Item docs for a brew.
 * Flexible: trusts label JSON + DB `effectFamily` / `element` when present.
 */
function validateBrewPair({ critterItem, partItem, critterName, partName }) {
  const { critterNames, partNames, familyByCritterName } = getIngredientLabelSets();
  const cKey = normalizeNameKey(critterName);
  const pKey = normalizeNameKey(partName);

  if (cKey === pKey) {
    return { ok: false, message: 'Pick two different items — one critter and one monster part.' };
  }
  if (isExcludedMixerItem(critterName) || isExcludedMixerItem(partName)) {
    return { ok: false, message: 'That item cannot be used in the mixer.' };
  }

  const critterListed = [...critterNames].some((n) => n.toLowerCase() === cKey);
  const partListed = [...partNames].some((n) => n.toLowerCase() === pKey);
  if (!critterListed) {
    return { ok: false, message: `**${critterName}** is not a labeled mixer critter (see \`elixir-ingredient-labels.json\`).` };
  }
  if (!partListed) {
    return { ok: false, message: `**${partName}** is not a labeled mixer part.` };
  }

  const familyFromLabel = familyByCritterName.get(cKey);
  const familyFromDb = critterItem.effectFamily && String(critterItem.effectFamily).trim();
  const effectFamily = familyFromDb || familyFromLabel;
  if (!effectFamily) {
    return { ok: false, message: `**${critterName}** has no \`effectFamily\` — run the ingredient-label seed or check the DB.` };
  }

  const elixirName = elixirNameForCritterFamily(effectFamily);
  if (!elixirName) {
    return { ok: false, message: `No output elixir mapped for family \`${effectFamily}\`.` };
  }

  const allowedPartElements = getAllowedPartElementsForFamily(effectFamily);
  const actualPartElement = resolvePartElementForMixer(partItem, partName);
  if (!allowedPartElements.includes(actualPartElement)) {
    const need = describeAllowedPartElementsForBrew(allowedPartElements);
    return {
      ok: false,
      message: `**${partName}** does not match this brew’s monster-part slot. ${elixirName} needs ${need}.`,
    };
  }

  return { ok: true, effectFamily, elixirName };
}

function getPartElementFromLabels(partName) {
  const doc = loadLabelsDoc();
  const lab = doc.labels?.[partName];
  if (!lab || lab.element === undefined) return null;
  return String(lab.element).trim().toLowerCase();
}

/** Prefer DB `element` on the item doc, then labels JSON. */
function resolvePartElementForMixer(partItem, partName) {
  const dbEl = partItem?.element != null ? String(partItem.element).trim().toLowerCase() : '';
  if (dbEl) return dbEl;
  const labEl = getPartElementFromLabels(partName);
  if (labEl != null) return labEl;
  return 'none';
}

function getRequiredPartElementForFamily(effectFamily) {
  const f = String(effectFamily || '').trim().toLowerCase();
  const map = {
    chilly: 'fire',
    spicy: 'ice',
    electro: 'electric',
    bright: 'undead',
  };
  return map[f] ?? 'none';
}

/**
 * Part elements allowed for the monster-part slot (and optional extras).
 * If the family has a thread element (fire / ice / electric / undead), players may use **neutral** parts or that element.
 * Families that are neutral-only stay `['none']`.
 */
function getAllowedPartElementsForFamily(effectFamily) {
  const req = getRequiredPartElementForFamily(effectFamily);
  if (req === 'none') return ['none'];
  return ['none', req];
}

function describeAllowedPartElementsForBrew(allowed) {
  if (!allowed.length) return 'a valid monster part for this elixir';
  if (allowed.length === 1 && allowed[0] === 'none') {
    return 'a **neutral** monster part (`element`: **none**)';
  }
  if (allowed.length === 1) {
    return `a **${allowed[0]}**-element monster part`;
  }
  const bits = allowed.map((e) => (e === 'none' ? '**neutral** (`none`)' : `**${e}**-element`));
  return bits.join(' or ');
}

/** **Fairy** / **Mock Fairy** may be used as optional extras on any elixir brew for a small heal on use. */
const MIXER_UNIVERSAL_FAIRY_KEYS = Object.freeze(new Set(['fairy', 'mock fairy']));

function isMixerUniversalFairyCritterName(name) {
  return MIXER_UNIVERSAL_FAIRY_KEYS.has(normalizeNameKey(name));
}

/**
 * Sum `modifierHearts` applied to the crafted elixir inventory row (consumed in `item.js` before buffs).
 * **Fairy** +2, **Mock Fairy** +1 per extra used.
 */
function mixerFairyHealHeartsFromExtras(extraItems) {
  let h = 0;
  for (const it of extraItems || []) {
    const k = normalizeNameKey(it?.itemName);
    if (k === 'fairy') h += 2;
    else if (k === 'mock fairy') h += 1;
  }
  return h;
}

/**
 * Optional brew extras: labeled **monster parts** (neutral / thread element) **or** labeled **critters**
 * in the same `effectFamily` as this brew, **or** **Fairy** / **Mock Fairy** (any brew). Same item name
 * as the main critter is allowed when you have a second copy in inventory (validator no longer blocks by name; finalize enforces quantities).
 */
function validateBrewExtraPart({ partItem, partName, effectFamily }) {
  const { partNames, critterNames, familyByCritterName } = getIngredientLabelSets();
  const pKey = normalizeNameKey(partName);
  const partListed = [...partNames].some((n) => n.toLowerCase() === pKey);
  const critterListed = [...critterNames].some((n) => n.toLowerCase() === pKey);

  if (isExcludedMixerItem(partName)) {
    return { ok: false, message: `**${partName}** can’t be used in the mixer.` };
  }

  if (partListed) {
    const allowed = getAllowedPartElementsForFamily(effectFamily);
    const actual = resolvePartElementForMixer(partItem, partName);
    if (!allowed.includes(actual)) {
      return { ok: false, message: `**${partName}** must be neutral or an element that matches this brew.` };
    }
    return { ok: true };
  }

  if (critterListed) {
    if (isMixerUniversalFairyCritterName(partName)) {
      return { ok: true };
    }
    const famFromDb = partItem?.effectFamily && String(partItem.effectFamily).trim().toLowerCase();
    const fam = famFromDb || familyByCritterName.get(pKey);
    const brewFam = String(effectFamily || '').trim().toLowerCase();
    if (fam !== brewFam) {
      return {
        ok: false,
        message: `**${partName}** must be a **${brewFam}**-family critter (same family as this elixir), **Fairy** / **Mock Fairy**, or an allowed monster part.`,
      };
    }
    return { ok: true };
  }

  return { ok: false, message: `**${partName}** is not a labeled mixer part or critter.` };
}

/** Catalog `itemRarity` is treated as **1–10**; invalid/low values → 1, values above 10 → 10. */
function normalizeMixerIngredientRarity(itemRarity) {
  const r = Number(itemRarity);
  if (!Number.isFinite(r) || r < 1) return 1;
  return Math.min(10, Math.floor(r));
}

/**
 * Mixer potency blend (weights sum to **1**):
 * - **Peak** (max rarity): best single ingredient — keeps a rarity **10** from being “erased” by one low piece.
 * - **Bulk** (mean): overall quality of everything in the pot.
 * - **Weak link** (min rarity): small drag from the worst ingredient (dilution), without dominating the peak.
 *
 * `blend = W_MAX*max + W_AVG*avg + W_MIN*min`, then add **synergy** for on-theme **extras** only
 * (see `countMixerExtraSynergy`). Rounded sum, clamped 1–10 → **1–3** Basic, **4–6** Mid, **7–10** High.
 */
const MIXER_POTENCY_WEIGHT_MAX = 0.5;
const MIXER_POTENCY_WEIGHT_AVG = 0.35;
const MIXER_POTENCY_WEIGHT_MIN = 0.15;

/** Per optional extra that matches the brew (same effect-family critter, or thread-element part on threaded elixirs). */
const MIXER_SYNERGY_BONUS_PER_EXTRA = 0.45;
/** Cap so at most ~1.5 raw score from synergy (e.g. three on-theme extras). */
const MIXER_SYNERGY_BONUS_MAX = 1.35;

/**
 * Counts **extras only** that are “on theme” for potency synergy:
 * - **Critter** listed in labels with the same `effectFamily` as this brew (e.g. Bladed Rhino Beetle extra on Mighty).
 * - **Monster part** whose resolved element equals the brew’s **thread** element (electric / fire / ice / undead), not neutral-only families.
 */
function countMixerExtraSynergy(extraItems, effectFamily) {
  const items = Array.isArray(extraItems) ? extraItems : [];
  if (!items.length) return 0;
  const { partNames, critterNames, familyByCritterName } = getIngredientLabelSets();
  const brewFam = String(effectFamily || '').trim().toLowerCase();
  const req = getRequiredPartElementForFamily(effectFamily);
  let n = 0;
  for (const item of items) {
    const name = item?.itemName;
    if (!name) continue;
    const key = normalizeNameKey(name);
    const critListed = [...critterNames].some((c) => c.toLowerCase() === key);
    if (critListed) {
      const famFromDb = item?.effectFamily && String(item.effectFamily).trim().toLowerCase();
      const fam = famFromDb || familyByCritterName.get(key);
      if (fam === brewFam) {
        n++;
      }
      continue;
    }
    const partListed = [...partNames].some((p) => p.toLowerCase() === key);
    if (partListed && req !== 'none') {
      const actual = String(resolvePartElementForMixer(item, name) || 'none').toLowerCase();
      if (actual === req) n++;
    }
  }
  return n;
}

/**
 * @param {unknown[]} rarityValues
 * @param {{ synergyExtraCount?: number }} [options] — from `countMixerExtraSynergy(extraItems, effectFamily)`
 */
function mixerBrewOutcomeFromIngredientRarities(rarityValues, options = {}) {
  const list = Array.isArray(rarityValues) ? rarityValues : [];
  const normalized = list.map(normalizeMixerIngredientRarity);
  const synergyExtras = Math.max(0, Math.floor(Number(options.synergyExtraCount) || 0));
  const synergyRaw = Math.min(MIXER_SYNERGY_BONUS_MAX, synergyExtras * MIXER_SYNERGY_BONUS_PER_EXTRA);
  if (!normalized.length) {
    return {
      elixirLevel: normalizeElixirLevel(1),
      combinedRounded: 1,
      ingredientCount: 0,
      sum: 0,
      maxR: 1,
      avgR: 1,
      minR: 1,
      synergyExtraCount: synergyExtras,
      synergyRaw,
      blendRaw: 0,
    };
  }
  const sum = normalized.reduce((a, b) => a + b, 0);
  const n = normalized.length;
  const avgR = sum / n;
  const maxR = Math.max(...normalized);
  const minR = Math.min(...normalized);
  const blendRaw =
    MIXER_POTENCY_WEIGHT_MAX * maxR +
    MIXER_POTENCY_WEIGHT_AVG * avgR +
    MIXER_POTENCY_WEIGHT_MIN * minR;
  const combinedRaw = blendRaw + synergyRaw;
  const combinedRounded = Math.min(10, Math.max(1, Math.round(combinedRaw)));
  let level = 1;
  if (combinedRounded >= 7) level = 3;
  else if (combinedRounded >= 4) level = 2;
  return {
    elixirLevel: normalizeElixirLevel(level),
    combinedRounded,
    ingredientCount: n,
    sum,
    maxR,
    avgR,
    minR,
    synergyExtraCount: synergyExtras,
    synergyRaw,
    blendRaw,
  };
}

function elixirLevelFromMixerIngredientRarities(rarityValues, options) {
  return mixerBrewOutcomeFromIngredientRarities(rarityValues, options).elixirLevel;
}

function elixirLevelFromMixerMainPartRarity(itemRarity) {
  return elixirLevelFromMixerIngredientRarities([itemRarity]);
}

/** Reverse map: catalog elixir name → effect family key (e.g. `Chilly Elixir` → `chilly`). */
function elixirNameToEffectFamily(elixirName) {
  const key = normalizeNameKey(elixirName);
  if (!key) return null;
  for (const [fam, name] of Object.entries(EFFECT_FAMILY_TO_ELIXIR)) {
    if (normalizeNameKey(name) === key) return fam;
  }
  return null;
}

module.exports = {
  EFFECT_FAMILY_TO_ELIXIR,
  getIngredientLabelSets,
  elixirNameForCritterFamily,
  elixirNameToEffectFamily,
  getRequiredPartElementForFamily,
  getAllowedPartElementsForFamily,
  resolvePartElementForMixer,
  getPartElementFromLabels,
  validateBrewPair,
  validateBrewExtraPart,
  isMixerUniversalFairyCritterName,
  mixerFairyHealHeartsFromExtras,
  elixirLevelFromMixerIngredientRarities,
  mixerBrewOutcomeFromIngredientRarities,
  countMixerExtraSynergy,
  MIXER_POTENCY_WEIGHT_MAX,
  MIXER_POTENCY_WEIGHT_AVG,
  MIXER_POTENCY_WEIGHT_MIN,
  MIXER_SYNERGY_BONUS_PER_EXTRA,
  MIXER_SYNERGY_BONUS_MAX,
  elixirLevelFromMixerMainPartRarity,
  normalizeMixerIngredientRarity,
  isExcludedMixerItem,
  normalizeNameKey,
};
