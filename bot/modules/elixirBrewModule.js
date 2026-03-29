// ============================================================================
// Elixir brew (mixer) — resolve labels + output elixir from critter + part
// ============================================================================

const fs = require('fs');
const path = require('path');
const { ELIXIR_MIXER_EXCLUDED_ITEM_NAMES } = require('./elixirModule');

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

  /** Mixer README: chilly→fire, spicy→ice, electro→electric, bright→undead; else neutral `none`. */
  const requiredPartElement = getRequiredPartElementForFamily(effectFamily);
  const actualPartElement = resolvePartElementForMixer(partItem, partName);
  if (actualPartElement !== requiredPartElement) {
    const need =
      requiredPartElement === 'none'
        ? 'a **neutral** monster part (`element`: none — e.g. Chuchu Jelly, horns)'
        : `a **${requiredPartElement}**-aligned part (see mixer element table)`;
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
  resolvePartElementForMixer,
  getPartElementFromLabels,
  validateBrewPair,
  isExcludedMixerItem,
  normalizeNameKey,
};
