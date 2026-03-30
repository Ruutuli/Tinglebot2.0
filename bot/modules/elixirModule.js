// ------------------- elixirModule.js -------------------
// This module manages the Breath of the Wild elixir system, including buff effects,
// and integration with existing game systems. Elixirs now work like job vouchers -
// they last until their effects are used in relevant activities.

// ============================================================================
// ------------------- Elixir tier (one catalog name, level on inventory) ---
// ============================================================================

/** 1 = Basic (low), 2 = Mid, 3 = High — stored on inventory rows + optional catalog default. */
const ELIXIR_LEVEL_FACTORS = { 1: 1, 2: 1.15, 3: 1.3 };

const ELIXIR_LEVEL_NAMES = { 1: 'Basic', 2: 'Mid', 3: 'High' };

/**
 * Explicit Basic → Mid → High values for Energizing (mixer tier 1–3).
 * Hearty & Enduring use **× max pool** multipliers (separate arrays — calibrated to different baselines).
 */
/** ~**3 max hearts** → +1 / +2 / +3 temporary hearts at Basic / Mid / High (`ceil(max×M)−max`, min +1). */
const HEARTY_MAX_POOL_MULTIPLIERS = Object.freeze([1.2, 1.4, 1.7]);
/** ~**5 stamina chunks** (~1 wheel) → +2 / +3 / +4 chunks to max & current at Basic / Mid / High. */
const ENDURING_MAX_POOL_MULTIPLIERS = Object.freeze([1.25, 1.45, 1.7]);

const RESOURCE_ELIXIR_LEVEL_STATS = Object.freeze({
  'Energizing Elixir': { staminaRecovery: [5, 7, 9] },
});

/**
 * @param {number} baseMax - max hearts or max stamina chunks before drink
 * @param {readonly number[]} multipliers - length 3 for Basic / Mid / High
 */
function computeGainFromMaxPoolMultiplier(baseMax, level, multipliers) {
  const lv = normalizeElixirLevel(level);
  const mult = multipliers[lv - 1];
  if (typeof mult !== 'number' || !Number.isFinite(mult)) return 0;
  const base = Math.max(1, Math.floor(Number(baseMax) || 0));
  if (base <= 0) return 0;
  const newVal = Math.ceil(base * mult);
  let gain = newVal - base;
  if (gain < 1) gain = 1;
  return gain;
}

/** Not valid mixer ingredients (pet / compression / special use only). Keep in sync with `items` + ingredient-label seed. */
const ELIXIR_MIXER_EXCLUDED_ITEM_NAMES = Object.freeze(['Chuchu Egg']);

/**
 * 1 = Basic, 2 = Mid, 3 = High.
 * Legacy inventory rows with no label (`null` / `undefined` / missing), invalid numbers, or anything other than 2 or 3 → **Basic (1)**.
 */
function normalizeElixirLevel(raw) {
  if (raw == null || raw === '') return 1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  if (n === 2 || n === 3) return n;
  return 1;
}

/**
 * Inclusive [min, max] extra copies of the **same** item per Sticky tier (Basic / Mid / High).
 * Always rolls within this range when Sticky applies (no miss chance).
 */
const STICKY_BONUS_EXTRA_RANGE_BY_LEVEL = Object.freeze([
  [1, 2],
  [3, 4],
  [4, 5],
]);

/**
 * Sticky Elixir: how many **extra** copies of the same item to grant (tiered random range).
 * Does not mutate character.
 * @param {object} character
 * @returns {number}
 */
function rollStickyBonusExtraQuantity(character) {
  if (!character?.buff?.active) return 0;
  const buffType = character.buff.type === 'fireproof' ? 'chilly' : character.buff.type;
  if (buffType !== 'sticky') return 0;
  // Extra copies are tier-based (Basic/Mid/High), not gated on effects.plusBoost — legacy rows may omit plusBoost.
  const lv = normalizeElixirLevel(character.buff.elixirLevel);
  const range = STICKY_BONUS_EXTRA_RANGE_BY_LEVEL[lv - 1] ?? STICKY_BONUS_EXTRA_RANGE_BY_LEVEL[0];
  const [min, max] = range;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Fairy Tonic: heal budget is a fraction of **max hearts** by tier (still capped by missing hearts in `item.js`).
 * Basic = ½ max, Mid = ¾ max, High = full max.
 * @param {number} maxHearts
 * @param {number} level 1–3
 */
function getFairyTonicHealBudget(maxHearts, level) {
  const maxH = Math.max(0, Math.floor(Number(maxHearts) || 0));
  if (maxH <= 0) return 0;
  const lv = normalizeElixirLevel(level);
  if (lv === 3) return maxH;
  if (lv === 2) return Math.max(1, Math.floor((maxH * 3) / 4));
  return Math.max(1, Math.floor(maxH / 2));
}

// ============================================================================
// ------------------- Elixir Definitions -------------------
// ============================================================================

const ELIXIR_EFFECTS = {
  'Chilly Elixir': {
    type: 'chilly',
    description: 'Heat & fire — resist **×1.5** at Basic; Mid/High scale higher.',
    effects: {
      fireResistance: 1.5
    }
  },
  'Bright Elixir': {
    type: 'bright',
    description: 'Blight — resist **×1.5** at Basic; Mid/High scale higher.',
    effects: {
      blightResistance: 1.5
    }
  },
  'Sticky Elixir': {
    type: 'sticky',
    description: 'Water **×1.5**; extra **same-item** copies **+1–2 / 3–4 / 4–5** (Basic/Mid/High) when you earn items (gather, loot, travel, exploration, steal, etc.).',
    effects: {
      waterResistance: 1.5,
      plusBoost: 1
    }
  },
  'Spicy Elixir': {
    type: 'spicy',
    description: 'Cold & ice — resist **×1.5** at Basic; Mid/High scale higher.',
    effects: {
      coldResistance: 1.5
    }
  },
  'Electro Elixir': {
    type: 'electro',
    description: 'Electric — resist **×1.5** at Basic; Mid/High scale higher.',
    effects: {
      electricResistance: 1.5
    }
  },
  'Enduring Elixir': {
    type: 'enduring',
    description: 'Temp stamina from **max ×1.25 / 1.45 / 1.7** (Basic/Mid/High).',
    effects: {
      staminaBoost: 2
    }
  },
  'Energizing Elixir': {
    type: 'energizing',
    description: 'Restore **+5 / +7 / +9** stamina (Basic/Mid/High).',
    effects: {
      staminaRecovery: 5
    }
  },
  'Hasty Elixir': {
    type: 'hasty',
    description:
      'Travel duration **halved** (min **1** day per leg). **1 / 2 / 3** travel charges (Basic / Mid / High). **Explore:** **×1.5** weight for **Quadrant explored** (roller has Hasty).',
    effects: {
      speedBoost: 1
    }
  },
  'Hearty Elixir': {
    type: 'hearty',
    description: 'Temp hearts from **max ×1.2 / 1.4 / 1.7** (Basic/Mid/High).',
    effects: {
      extraHearts: 1
    }
  },
  'Mighty Elixir': {
    type: 'mighty',
    description: 'Attack **×1.5** at Basic; Mid/High scale higher.',
    effects: {
      attackBoost: 1.5
    }
  },
  'Tough Elixir': {
    type: 'tough',
    description: 'Defense **×1.5** at Basic; Mid/High scale higher.',
    effects: {
      defenseBoost: 1.5
    }
  },
  'Sneaky Elixir': {
    type: 'sneaky',
    description: 'Stealth & flee **+1** each at Basic; Mid/High higher.',
    effects: {
      stealthBoost: 1,
      fleeBoost: 1
    }
  },
  'Fairy Tonic': {
    type: 'fairy',
    description: 'Heal up to **½ / ¾ / full** max hearts (Basic/Mid/High); never over max.',
    effects: {
      healHearts: 0
    }
  }
};

/** Normalize user/display strings to a key in ELIXIR_EFFECTS (or original cleaned string if not an elixir). */
const resolveElixirItemName = (rawName) => {
  if (rawName == null || typeof rawName !== 'string') return '';
  let s = rawName.trim();
  s = s
    .replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, '')
    .replace(/\s*\(Qty:\s*\d+\s*\)/gi, '')
    .replace(/\s*-\s*Qty:\s*\d+\s*$/i, '')
    .trim();
  if (ELIXIR_EFFECTS[s]) return s;
  const key = Object.keys(ELIXIR_EFFECTS).find((k) => k.toLowerCase() === s.toLowerCase());
  return key || s;
};

function isElixirItemName(name) {
  const key = resolveElixirItemName(name);
  return !!(key && ELIXIR_EFFECTS[key]);
}

/**
 * Persisted buff numbers: integer hearts/stamina keys stay whole; other numeric stats → nearest **0.25**.
 * Matches Discord display (`formatElixirStatDisplay`) and gameplay math.
 */
function roundElixirEffectNumberForStorage(key, value) {
  const x = Number(value);
  if (!Number.isFinite(x)) return value;
  if (key === 'healHearts' || key === 'extraHearts') {
    return Math.max(0, Math.round(x));
  }
  if (key === 'staminaBoost' || key === 'staminaRecovery') {
    return Math.max(1, Math.round(x));
  }
  return Math.round(x * 4) / 4;
}

/** Apply `roundElixirEffectNumberForStorage` to every finite number on a scaled effects object. */
function normalizeScaledElixirEffects(effects) {
  if (!effects || typeof effects !== 'object') return effects;
  const out = { ...effects };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = roundElixirEffectNumberForStorage(k, v);
    }
  }
  return out;
}

/**
 * Scale catalog effect numbers by elixir tier.
 * @param {string} elixirName - Canonical elixir item name (e.g. `'Hearty Elixir'`).
 * @param {Record<string, number>} baseEffects - From ELIXIR_EFFECTS[name].effects
 * @param {number} level - 1–3
 * @param {{ maxHeartsForFairyTonic?: number, maxHeartsForHearty?: number, maxStaminaForEnduring?: number }} [options] - Fairy: max hearts. Hearty / Enduring: max pool **before** drink (hearts / stamina chunks). Energizing: `RESOURCE_ELIXIR_LEVEL_STATS`.
 */
function scaleElixirEffects(elixirName, baseEffects, level, options = {}) {
  const key = resolveElixirItemName(elixirName) || String(elixirName || '').trim();
  const lv = normalizeElixirLevel(level);
  const idx = lv - 1;
  const base = baseEffects || {};
  const resourceSpec = RESOURCE_ELIXIR_LEVEL_STATS[key];

  let result;

  if (key === 'Fairy Tonic') {
    const maxH = options.maxHeartsForFairyTonic;
    if (typeof maxH === 'number' && Number.isFinite(maxH) && maxH > 0) {
      result = {
        ...base,
        healHearts: getFairyTonicHealBudget(maxH, lv),
      };
    } else {
      result = { ...base, healHearts: 0 };
    }
  } else if (key === 'Hearty Elixir') {
    const maxH = options.maxHeartsForHearty;
    if (typeof maxH === 'number' && Number.isFinite(maxH) && maxH > 0) {
      const extraHearts = computeGainFromMaxPoolMultiplier(maxH, lv, HEARTY_MAX_POOL_MULTIPLIERS);
      result = { ...base, extraHearts };
    } else {
      result = { ...base, extraHearts: 0 };
    }
  } else if (key === 'Enduring Elixir') {
    const maxS = options.maxStaminaForEnduring;
    if (typeof maxS === 'number' && Number.isFinite(maxS) && maxS > 0) {
      const staminaBoost = computeGainFromMaxPoolMultiplier(maxS, lv, ENDURING_MAX_POOL_MULTIPLIERS);
      result = { ...base, staminaBoost };
    } else {
      result = { ...base, staminaBoost: 0 };
    }
  } else if (resourceSpec) {
    result = { ...base };
    for (const [stat, tiers] of Object.entries(resourceSpec)) {
      if (Array.isArray(tiers) && typeof tiers[idx] === 'number' && Number.isFinite(tiers[idx])) {
        result[stat] = tiers[idx];
      }
    }
  } else if (lv === 1) {
    result = { ...base };
  } else {
    const factor = ELIXIR_LEVEL_FACTORS[lv] || 1;
    result = {};
    for (const [k, val] of Object.entries(base)) {
      if (typeof val === 'number' && Number.isFinite(val)) {
        if (k === 'extraHearts' || k === 'staminaBoost' || k === 'staminaRecovery') {
          result[k] = Math.max(1, Math.round(val * factor));
        } else {
          result[k] = Math.round(val * factor * 100) / 100;
        }
      }
    }
  }

  return normalizeScaledElixirEffects(result);
}

/**
 * Format elixir buff numbers for display — same **quarter** grid as stored effects (`scaleElixirEffects` → `normalizeScaledElixirEffects`).
 */
function formatElixirStatDisplay(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return String(n);
  const r = Math.round(x * 4) / 4;
  if (Number.isInteger(r)) return String(r);
  const t = parseFloat(r.toFixed(2));
  return Number.isInteger(t) ? String(t) : String(t);
}

/** Discord blockquote line: `> **Label** : value` */
function elixirQuotedEffectLine(label, value) {
  return `> **${label}** : ${value}`;
}

/**
 * Multi-line effect copy for `/item` and brew preview — uses **this bottle’s** level, not all tiers.
 * Each line is a blockquote with bold label (Discord embed field value).
 * @param {{ maxHeartsForFairyTonic?: number, maxHeartsForHearty?: number, maxStaminaForEnduring?: number }} [options]
 */
function getElixirItemUseBlurb(elixirName, elixirLevel, options = {}) {
  const key = resolveElixirItemName(elixirName);
  if (!key || !ELIXIR_EFFECTS[key]) return '';
  const lv = normalizeElixirLevel(elixirLevel);
  const base = ELIXIR_EFFECTS[key].effects;
  const scaled = scaleElixirEffects(key, base, lv, options);
  const x = (n) => `×${formatElixirStatDisplay(n)}`;

  switch (key) {
    case 'Sticky Elixir': {
      const w = scaled.waterResistance;
      const range = STICKY_BONUS_EXTRA_RANGE_BY_LEVEL[lv - 1] ?? STICKY_BONUS_EXTRA_RANGE_BY_LEVEL[0];
      return [
        elixirQuotedEffectLine('Water Resistance', x(w)),
        elixirQuotedEffectLine('Extra Items', `+${range[0]}–${range[1]} (same item when you earn loot)`),
      ].join('\n');
    }
    case 'Chilly Elixir':
      return elixirQuotedEffectLine('Heat & Fire Resistance', x(scaled.fireResistance));
    case 'Bright Elixir':
      return elixirQuotedEffectLine('Blight Resistance', x(scaled.blightResistance));
    case 'Spicy Elixir':
      return elixirQuotedEffectLine('Cold & Ice Resistance', x(scaled.coldResistance));
    case 'Electro Elixir':
      return elixirQuotedEffectLine('Electric Resistance', x(scaled.electricResistance));
    case 'Mighty Elixir':
      return elixirQuotedEffectLine('Attack', x(scaled.attackBoost));
    case 'Tough Elixir':
      return elixirQuotedEffectLine('Defense', x(scaled.defenseBoost));
    case 'Sneaky Elixir':
      return [
        elixirQuotedEffectLine('Stealth', `+${formatElixirStatDisplay(scaled.stealthBoost)}`),
        elixirQuotedEffectLine('Flee', `+${formatElixirStatDisplay(scaled.fleeBoost)}`),
      ].join('\n');
    case 'Hasty Elixir':
      return [
        elixirQuotedEffectLine('Travel time', 'Halved (min 1 day per leg)'),
        elixirQuotedEffectLine(
          'Travel charges',
          `${lv} trip(s) on this bottle (Basic 1 / Mid 2 / High 3)`
        ),
        elixirQuotedEffectLine('Explore roll', '×1.5 weight for Quadrant explored (you roll)'),
      ].join('\n');
    case 'Energizing Elixir': {
      const arr = RESOURCE_ELIXIR_LEVEL_STATS['Energizing Elixir']?.staminaRecovery;
      const n = arr?.[lv - 1];
      return typeof n === 'number'
        ? elixirQuotedEffectLine('Stamina Recovery', `+${n} chunks (capped at max)`)
        : elixirQuotedEffectLine('Stamina Recovery', 'restores stamina');
    }
    case 'Hearty Elixir': {
      const ex = scaled.extraHearts;
      return elixirQuotedEffectLine('Temporary Hearts', `+${formatElixirStatDisplay(ex)}`);
    }
    case 'Enduring Elixir': {
      const st = scaled.staminaBoost;
      return elixirQuotedEffectLine('Temporary Stamina', `+${formatElixirStatDisplay(st)} chunks`);
    }
    case 'Fairy Tonic': {
      const h = scaled.healHearts;
      return elixirQuotedEffectLine('Heal', `up to ${formatElixirStatDisplay(h)} missing hearts (capped at max)`);
    }
    default: {
      const d = (ELIXIR_EFFECTS[key].description || '').trim();
      if (!d) return '';
      return d
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `> ${l}`)
        .join('\n');
    }
  }
}

/**
 * Brew embed: same tier-specific line as `/item`, plus optional Fairy mix-in note.
 * @param {{ maxHeartsForHearty?: number, maxStaminaForEnduring?: number, maxHeartsForFairyTonic?: number }} [previewOptions]
 * @returns {{ buffText: string | null, immediateText: string | null }}
 */
function getBrewPreviewForElixir(elixirName, level, fairyHealHearts = 0, previewOptions = {}) {
  const key = resolveElixirItemName(elixirName);
  const elixir = ELIXIR_EFFECTS[key];
  if (!elixir) return { buffText: null, immediateText: null };

  const lv = normalizeElixirLevel(level);
  const primary = getElixirItemUseBlurb(elixirName, lv, previewOptions);
  const parts = [];
  if (primary) parts.push(primary);
  else parts.push(elixir.description.trim());

  if (fairyHealHearts > 0) {
    parts.push(elixirQuotedEffectLine('Fairy Mix-In', `+${fairyHealHearts} hearts (brew)`));
  }

  return {
    buffText: null,
    immediateText: parts.join('\n').slice(0, 1024),
  };
}

/** `/item` autocomplete `value`: unique per stack (Discord returns this string unchanged). */
function formatElixirItemOptionValue(lowercaseItemName, elixirLevel, modifierHearts) {
  const name = String(lowercaseItemName || '')
    .trim()
    .toLowerCase();
  const lv = normalizeElixirLevel(elixirLevel);
  const lab = ELIXIR_LEVEL_NAMES[lv];
  const mh = Math.max(0, Math.floor(Number(modifierHearts) || 0));
  return `${name} [${lab}|m${mh}]`;
}

/**
 * Parses autocomplete suffix from `formatElixirItemOptionValue`, or legacy `[Basic]` only.
 * @returns {{ baseName: string, elixirLevel: number, modifierHearts: number | null } | null}
 *   `modifierHearts` is a number when `|mN` was present; `null` means any mix-in at that tier.
 */
function parseElixirTierFromItemOption(raw) {
  const s = String(raw || '').trim();
  const withM = s.match(/^(.+?)\s+\[(Basic|Mid|High)\|m(\d+)\]\s*$/i);
  if (withM) {
    const tag = withM[2].toLowerCase();
    const elixirLevel = tag === 'basic' ? 1 : tag === 'mid' ? 2 : 3;
    return {
      baseName: withM[1].trim(),
      elixirLevel,
      modifierHearts: Math.max(0, parseInt(withM[3], 10) || 0),
    };
  }
  const short = s.match(/^(.+?)\s+\[(Basic|Mid|High)\]\s*$/i);
  if (short) {
    const tag = short[2].toLowerCase();
    const elixirLevel = tag === 'basic' ? 1 : tag === 'mid' ? 2 : 3;
    return {
      baseName: short[1].trim(),
      elixirLevel,
      modifierHearts: null,
    };
  }
  return null;
}

// ============================================================================
// ------------------- Core Functions -------------------
// ============================================================================

// ------------------- Apply Elixir Buff -------------------
// Applies an elixir buff to a character
const applyElixirBuff = (character, elixirName, elixirLevel = 1) => {
  const key = resolveElixirItemName(elixirName);
  const elixir = ELIXIR_EFFECTS[key];
  if (!elixir) {
    throw new Error(`Unknown elixir: ${elixirName}`);
  }

  const level = normalizeElixirLevel(elixirLevel);
  const effects = scaleElixirEffects(key, elixir.effects, level, {
    maxHeartsForFairyTonic: character?.maxHearts,
    maxHeartsForHearty: character?.maxHearts,
    maxStaminaForEnduring: character?.maxStamina,
  });

  character.buff = {
    active: true,
    type: elixir.type,
    effects,
    elixirLevel: level
  };

  // Hasty Elixir: Basic = 1 trip, Mid = 2, High = 3 before the buff clears
  if (elixir.type === 'hasty') {
    if (!character.buff.effects) character.buff.effects = {};
    character.buff.effects.hastyTravelCharges = level;
  }

  applyImmediateEffects(character, key, effects);

  return character;
};

// ------------------- Apply Immediate Effects -------------------
// Applies immediate effects when elixir is consumed
// Note: Most immediate effects are now handled by the database item consumption system
const applyImmediateEffects = (character, elixirKey, scaledEffects) => {
  switch (elixirKey) {
    case 'Energizing Elixir':
      if (scaledEffects?.staminaRecovery) {
        const staminaToRestore = scaledEffects.staminaRecovery;
        const previousStamina = character.currentStamina || 0;
        character.currentStamina = Math.min(
          character.maxStamina || 3,
          previousStamina + staminaToRestore
        );
        console.log(`[elixirModule.js]: ⚡ Energizing Elixir restored ${staminaToRestore} stamina for ${character.name} (${previousStamina} → ${character.currentStamina})`);
      }
      break;

    case 'Enduring Elixir':
      if (scaledEffects?.staminaBoost) {
        const staminaBoost = scaledEffects.staminaBoost;
        character.currentStamina = (character.currentStamina || 0) + staminaBoost;
        console.log(`[elixirModule.js]: 🏃 Enduring Elixir added +${staminaBoost} temporary stamina (current only) for ${character.name}`);
      }
      break;

    case 'Hearty Elixir':
      if (scaledEffects?.extraHearts) {
        const extraHearts = scaledEffects.extraHearts;
        character.currentHearts = (character.currentHearts || 3) + extraHearts;
        console.log(`[elixirModule.js]: ❤️ Hearty Elixir added +${extraHearts} temporary hearts (current only) for ${character.name}`);
      }
      break;

    default:
      break;
  }
};

/** Fire / heat thread only — Chilly elixir must not consume for water or blight. */
const monsterNameImpliesChillyConsume = (monster) => {
  if (!monster) return false;
  if (monster.element === 'fire') return true;
  const name = monster.name || '';
  return /fire|igneo|meteo/i.test(name);
};

// ------------------- Check if Elixir Should Be Consumed -------------------
// Checks if an elixir effect should be consumed based on the activity
const shouldConsumeElixir = (character, activity, context = {}) => {
  if (!character.buff?.active) return false;
  
  // Legacy DB buffs may still have type 'fireproof' (merged into chilly)
  const buffType =
    character.buff.type === 'fireproof' ? 'chilly' : character.buff.type;

  switch (buffType) {
    case 'chilly':
      return (
        (activity === 'combat' && monsterNameImpliesChillyConsume(context.monster)) ||
        (activity === 'helpWanted' && monsterNameImpliesChillyConsume(context.monster)) ||
        (activity === 'raid' && monsterNameImpliesChillyConsume(context.monster)) ||
        (activity === 'loot' && monsterNameImpliesChillyConsume(context.monster))
      );

    case 'bright':
      if (context.blightRain) {
        return (
          activity === 'loot' ||
          activity === 'gather' ||
          activity === 'travel' ||
          activity === 'helpWanted' ||
          activity === 'raid'
        );
      }
      if (context.blightExposure) {
        return activity === 'explore';
      }
      if (context.gloomHandsBlight) {
        return activity === 'raid';
      }
      return false;

    case 'sticky':
      return (
        activity === 'travel' ||
        (activity === 'combat' && context.monster?.name?.includes('Water')) ||
        (activity === 'helpWanted' && context.monster?.name?.includes('Water')) ||
        (activity === 'raid' && context.monster?.name?.includes('Water')) ||
        (activity === 'loot' && context.monster?.name?.includes('Water'))
      );

    case 'electro':
      // Consume when encountering electric enemies
      return activity === 'combat' && context.monster?.name?.includes('Electric') ||
             activity === 'helpWanted' && context.monster?.name?.includes('Electric') ||
             activity === 'raid' && context.monster?.name?.includes('Electric') ||
             activity === 'loot' && context.monster?.name?.includes('Electric');
      
    case 'enduring':
      // One-shot from /item clears buff; if a legacy active buff exists, do not auto-consume on travel (temp is spent from current naturally)
      return false;
      
    case 'energizing':
      // Consume when performing physical actions
      return activity === 'gather' || activity === 'loot' || activity === 'crafting';
      
    case 'hasty':
      // Consume when moving or traveling
      return activity === 'travel';
      
    case 'hearty':
      // Consume when taking damage or in combat
      return activity === 'combat' || activity === 'helpWanted' || activity === 'raid';
      
    case 'mighty':
      // Consume when attacking
      return activity === 'combat' || activity === 'helpWanted' || activity === 'raid' || activity === 'loot';
      
    case 'sneaky':
      // Consume when gathering, looting, or traveling (stealth helps avoid encounters)
      return activity === 'gather' || activity === 'loot' || activity === 'travel';
      
    case 'spicy':
      // Consume when encountering ice monsters
      return (activity === 'combat' && context.monster?.name?.includes('Ice')) ||
             (activity === 'helpWanted' && context.monster?.name?.includes('Ice')) ||
             (activity === 'raid' && context.monster?.name?.includes('Ice')) ||
             (activity === 'loot' && context.monster?.name?.includes('Ice'));
      
    case 'tough':
      // Consume when taking damage
      return activity === 'combat' || activity === 'helpWanted' || activity === 'raid' || activity === 'loot';
      
    default:
      return false;
  }
};

/**
 * After a travel leg where duration was reduced by Hasty: decrement travel charges.
 * Basic=1 charge (buff clears after first trip); Mid=2; High=3. Other buffs: full consume.
 * @returns {{ consumed: boolean, fullyRemoved: boolean }}
 */
const consumeElixirTravelChargeOrBuff = (character) => {
  if (!character.buff?.active) return { consumed: false, fullyRemoved: false };

  const buffType =
    character.buff.type === 'fireproof' ? 'chilly' : character.buff.type;

  if (buffType !== 'hasty') {
    consumeElixirBuff(character);
    return { consumed: true, fullyRemoved: true };
  }

  let charges = character.buff.effects?.hastyTravelCharges;
  if (charges == null || !Number.isFinite(Number(charges)) || Number(charges) < 1) {
    charges = 1; // legacy Hasty rows without the field
  } else {
    charges = Math.floor(Number(charges));
  }

  const next = charges - 1;
  if (next > 0) {
    character.buff.effects = character.buff.effects || {};
    character.buff.effects.hastyTravelCharges = next;
    const logName = character.name ?? 'unknown';
    console.log(
      `[elixirModule.js]: 🏃 Hasty Elixir — ${next} travel charge(s) remaining for ${logName}`
    );
    return { consumed: true, fullyRemoved: false };
  }

  consumeElixirBuff(character);
  return { consumed: true, fullyRemoved: true };
};

// ------------------- Consume Elixir Buff -------------------
// Consumes an elixir buff when its effects are used
const consumeElixirBuff = (character) => {
  if (!character.buff?.active) return false;

  const consumedType = character.buff.type;
  const consumedLevel = character.buff.elixirLevel;
  const logName = character.name ?? 'unknown';
  const logId = character._id != null ? String(character._id) : 'no-id';
  
  // Remove temporary hearts from Hearty Elixir (bonus was on current only, not max)
  if (character.buff.type === 'hearty' && character.buff.effects.extraHearts > 0) {
    const lost = character.buff.effects.extraHearts;
    character.currentHearts = Math.max(0, character.currentHearts - lost);
    character.currentHearts = Math.min(character.currentHearts, character.maxHearts);
  }
  
  // Enduring Elixir: bonus was on current only — drop any stamina still above real max (spent temp is already gone)
  if (character.buff.type === 'enduring' && character.buff.effects.staminaBoost > 0) {
    character.currentStamina = Math.min(character.currentStamina, character.maxStamina);
  }
  
  // Reset buff
  character.buff = {
    active: false,
    type: null,
    elixirLevel: null,
    effects: {
      blightResistance: 0,
      electricResistance: 0,
      staminaBoost: 0,
      staminaRecovery: 0,
      fireResistance: 0,
      speedBoost: 0,
      extraHearts: 0,
      attackBoost: 0,
      stealthBoost: 0,
      fleeBoost: 0,
      coldResistance: 0,
      iceEffectiveness: 0,
      defenseBoost: 0,
      waterResistance: 0,
      plusBoost: 0,
      hastyTravelCharges: 0
    }
  };

  console.log(
    `[elixirModule.js]: 🧪 Elixir buff removed — ${logName} (${logId}) type=${consumedType ?? 'n/a'} level=${consumedLevel ?? 'n/a'}`
  );
  
  return true; // Buff was consumed
};

// ------------------- Remove Expired Buffs -------------------
// Legacy function - now just checks if buff is active
// Elixirs no longer expire by time
const removeExpiredBuffs = (character) => {
  // Elixirs no longer expire by time - they must be consumed
  return false;
};

// ------------------- Get Active Buff Effects -------------------
// Returns the current active buff effects for a character
const getActiveBuffEffects = (character) => {
  if (!character.buff?.active) {
    return null;
  }
  return character.buff.effects;
};

// ------------------- Check Buff Status -------------------
// Checks if a character has a specific type of buff active
const hasBuffType = (character, buffType) => {
  return character.buff?.active && character.buff.type === buffType;
};

// ------------------- Get Buff Duration -------------------
// Returns remaining buff duration - now always returns "Until Used"
const getBuffDuration = (character) => {
  if (!character.buff?.active) {
    return 0;
  }
  return 'Until Used'; // Elixirs now last until consumed
};

// ------------------- Calculate Buffed Stats -------------------
// Calculates character stats with active buffs applied
const calculateBuffedStats = (character) => {
  const stats = {
    attack: character.attack || 0,
    defense: character.defense || 0,
    currentHearts: character.currentHearts || 0,
    maxHearts: character.maxHearts || 0,
    currentStamina: character.currentStamina || 0,
    maxStamina: character.maxStamina || 0
  };

  if (character.buff?.active) {
    const effects = character.buff.effects;
    
    // Apply attack boost
    if (effects.attackBoost > 0) {
      stats.attack += effects.attackBoost;
    }
    
    // Apply defense boost
    if (effects.defenseBoost > 0) {
      stats.defense += effects.defenseBoost;
    }
    
    // Hearty / Enduring: bonus is stored on character.current* only (never add buff.effects here — would double-count)
  }

  return stats;
};

// ------------------- Get Elixir Info -------------------
// Returns information about a specific elixir
const getElixirInfo = (elixirName) => {
  return ELIXIR_EFFECTS[resolveElixirItemName(elixirName)] || null;
};

// ------------------- Get All Elixir Types -------------------
// Returns all available elixir types
const getAllElixirTypes = () => {
  return Object.keys(ELIXIR_EFFECTS);
};

// ------------------- Get Monster Element -------------------
// Determines a monster's element from its element field or name
const getMonsterElement = (monster) => {
  if (!monster) return 'none';
  
  // First check the element field on the monster
  if (monster.element && monster.element !== 'none') {
    return monster.element;
  }
  
  // Fallback to name-based detection for backwards compatibility
  const name = monster.name || '';
  
  // Fire elements
  if (/fire|igneo|meteo/i.test(name)) return 'fire';
  
  // Ice elements
  if (/ice|frost|blizzard|snow/i.test(name)) return 'ice';
  
  // Electric elements
  if (/electric|thunder/i.test(name)) return 'electric';
  
  // Water elements
  if (/water/i.test(name)) return 'water';
  
  // Earth elements
  if (/stone|rock|moldug/i.test(name)) return 'earth';
  
  // Undead elements
  if (/cursed|stal(?!k)|gloom|gibdo/i.test(name)) return 'undead';
  
  // Wind elements
  if (/sky|forest/i.test(name)) return 'wind';
  
  return 'none';
};

// ------------------- Exploration hazard protection -------------------
// Maps quadrant hazard names (thunder, hot, cold) to the elixir type that counters them.
const EXPLORATION_HAZARD_TO_ELIXIR = {
  thunder: 'electro',
  hot: 'chilly',
  cold: 'spicy',
};

/** Elixirs that can be used during an expedition to protect the party from quadrant hazards for the rest of the explore. */
const HAZARD_RESISTANCE_ELIXIRS = ['Electro Elixir', 'Chilly Elixir', 'Spicy Elixir'];

/** Get the internal elixir type (e.g. 'electro') from an elixir item name. */
const getElixirTypeByName = (elixirName) => {
  const entry = ELIXIR_EFFECTS[resolveElixirItemName(elixirName)];
  return entry ? entry.type : null;
};

/** True if the given elixir type counters this exploration hazard (thunder / hot / cold). */
const elixirCountersExplorationHazard = (elixirType, hazard) => {
  if (!elixirType || !hazard) return false;
  const h = String(hazard).trim().toLowerCase();
  return EXPLORATION_HAZARD_TO_ELIXIR[h] === elixirType;
};

/** True if this elixir can be used during explore to grant hazard protection for the whole expedition. */
const isHazardResistanceElixir = (elixirName) => {
  const canonical = resolveElixirItemName(String(elixirName || '').trim());
  return HAZARD_RESISTANCE_ELIXIRS.includes(canonical);
};

// ------------------- Get Resistance For Element -------------------
// Maps element types to the resistance buff needed to counter them (fire uses the same stat as ambient heat)
const getResistanceForElement = (element) => {
  switch (element) {
    case 'fire': return 'fireResistance';
    case 'ice': return 'coldResistance';
    case 'electric': return 'electricResistance';
    case 'water': return 'waterResistance'; // Sticky Elixir
    case 'earth': return null; // No elixir currently counters earth
    case 'undead': return 'blightResistance'; // Bright Elixir
    case 'wind': return null; // No elixir currently counters wind
    default: return null;
  }
};

// ------------------- Check Elixir Counters Element -------------------
// Checks if character's active elixir provides resistance against a monster's element
const elixirCountersMonster = (character, monster) => {
  const buffEffects = getActiveBuffEffects(character);
  if (!buffEffects) return false;
  
  const monsterElement = getMonsterElement(monster);
  const resistanceKey = getResistanceForElement(monsterElement);
  
  if (!resistanceKey) return false;
  
  return buffEffects[resistanceKey] > 0;
};

// ============================================================================
// ------------------- Elemental Combat System -------------------
// ============================================================================

// Elemental advantage matrix: element -> list of elements it's strong against
const ELEMENTAL_ADVANTAGES = {
  fire: ['ice', 'wind'],           // Fire melts ice, burns through wind
  ice: ['water', 'electric'],      // Ice freezes water, insulates electricity
  electric: ['water', 'wind'],     // Electric shocks water, disrupts wind
  water: ['fire', 'earth'],        // Water extinguishes fire, erodes earth
  wind: ['earth', 'undead'],       // Wind scatters earth, blows away undead
  earth: ['electric', 'fire'],     // Earth grounds electric, smothers fire
  undead: ['ice', 'water'],        // Undead resist cold, function in water
  light: ['undead'],               // Light banishes undead
  tech: ['earth', 'wind'],         // Tech overcomes nature
};

// Elemental weakness matrix: element -> list of elements it's weak to
const ELEMENTAL_WEAKNESSES = {
  fire: ['water', 'earth'],
  ice: ['fire'],
  electric: ['earth'],
  water: ['electric', 'ice'],
  wind: ['fire', 'electric'],
  earth: ['water', 'wind'],
  undead: ['light', 'fire', 'wind'],
  light: [],  // Light has no elemental weaknesses
  tech: ['electric', 'water'],
};

// Roll bonus percentages
const ELEMENTAL_ADVANTAGE_BONUS = 0.15;   // +15% roll bonus when weapon is strong vs monster
const ELEMENTAL_WEAKNESS_PENALTY = 0.10;  // -10% roll penalty when weapon is weak vs monster

// ------------------- Get Weapon Element -------------------
// Extracts element from a weapon item (checks element field or falls back to name)
const getWeaponElement = (weapon) => {
  if (!weapon) return 'none';
  
  // Check the element field first
  if (weapon.element && weapon.element !== 'none') {
    return weapon.element;
  }
  
  // Fallback to name-based detection
  const name = weapon.name || weapon.itemName || '';
  
  if (/fire|flame|igneo|meteo|volcanic|blazing|inferno|ember/i.test(name)) return 'fire';
  if (/ice|frost|frozen|blizzard|glacial|frigid|snow|cold/i.test(name)) return 'ice';
  if (/electric|thunder|lightning|shock|volt|storm/i.test(name)) return 'electric';
  if (/water|aqua|ocean|sea|tidal/i.test(name)) return 'water';
  if (/wind|gust|cyclone|tornado|aerial/i.test(name)) return 'wind';
  if (/stone|rock|earth|boulder|quake/i.test(name)) return 'earth';
  if (/cursed|dark|shadow|gloom|demon/i.test(name)) return 'undead';
  if (/light|radiant|luminous|divine|holy|sacred/i.test(name)) return 'light';
  if (/ancient|sheikah|guardian/i.test(name)) return 'tech';
  
  return 'none';
};

// ------------------- Check Elemental Advantage -------------------
// Returns the advantage relationship between weapon and monster elements
const getElementalAdvantage = (weaponElement, monsterElement) => {
  if (weaponElement === 'none' || monsterElement === 'none') {
    return { hasAdvantage: false, hasDisadvantage: false, bonus: 0 };
  }
  
  const advantages = ELEMENTAL_ADVANTAGES[weaponElement] || [];
  const weaknesses = ELEMENTAL_WEAKNESSES[weaponElement] || [];
  
  if (advantages.includes(monsterElement)) {
    return { 
      hasAdvantage: true, 
      hasDisadvantage: false, 
      bonus: ELEMENTAL_ADVANTAGE_BONUS 
    };
  }
  
  if (weaknesses.includes(monsterElement)) {
    return { 
      hasAdvantage: false, 
      hasDisadvantage: true, 
      bonus: -ELEMENTAL_WEAKNESS_PENALTY 
    };
  }
  
  return { hasAdvantage: false, hasDisadvantage: false, bonus: 0 };
};

// ------------------- Calculate Elemental Combat Bonus -------------------
// Main function to calculate combat bonus based on weapon vs monster elements
const calculateElementalCombatBonus = (character, monster) => {
  const weapon = character?.gearWeapon;
  const weaponElement = getWeaponElement(weapon);
  const monsterElement = getMonsterElement(monster);
  
  const result = getElementalAdvantage(weaponElement, monsterElement);
  
  return {
    weaponElement,
    monsterElement,
    ...result,
    weaponName: weapon?.name || weapon?.itemName || 'Unarmed'
  };
};

// ============================================================================
// ------------------- Export Functions -------------------
// ============================================================================

module.exports = {
  ELIXIR_EFFECTS,
  ELIXIR_LEVEL_FACTORS,
  ELIXIR_LEVEL_NAMES,
  RESOURCE_ELIXIR_LEVEL_STATS,
  ELIXIR_MIXER_EXCLUDED_ITEM_NAMES,
  normalizeElixirLevel,
  scaleElixirEffects,
  getBrewPreviewForElixir,
  getElixirItemUseBlurb,
  formatElixirItemOptionValue,
  parseElixirTierFromItemOption,
  isElixirItemName,
  applyElixirBuff,
  applyImmediateEffects,
  shouldConsumeElixir,
  consumeElixirBuff,
  consumeElixirTravelChargeOrBuff,
  removeExpiredBuffs,
  getActiveBuffEffects,
  hasBuffType,
  getBuffDuration,
  calculateBuffedStats,
  getElixirInfo,
  getAllElixirTypes,
  getElixirTypeByName,
  elixirCountersExplorationHazard,
  isHazardResistanceElixir,
  HAZARD_RESISTANCE_ELIXIRS,
  getMonsterElement,
  getResistanceForElement,
  elixirCountersMonster,
  getWeaponElement,
  getElementalAdvantage,
  calculateElementalCombatBonus,
  ELEMENTAL_ADVANTAGE_BONUS,
  ELEMENTAL_WEAKNESS_PENALTY,
  formatElixirStatDisplay,
  elixirQuotedEffectLine,
  rollStickyBonusExtraQuantity,
  STICKY_BONUS_EXTRA_RANGE_BY_LEVEL,
};

