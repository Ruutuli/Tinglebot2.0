// ============================================================================
// ------------------- Relic Utilities -------------------
// Handles relic outcome rolling, duplicate detection, and "has relic" checks.
// ============================================================================

const { RELIC_OUTCOMES } = require('../data/relicOutcomes.js');
const RelicModel = require('../models/RelicModel.js');

/**
 * Escape a string for use inside a RegExp (discoveredBy / character name).
 * @param {string} s
 * @returns {string}
 */
function escapeRegexForRelicOwner(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Mongo filter fragment: relic belongs to this character.
 * Prefer characterId; legacy relics without characterId match case-insensitive discoveredBy only.
 * @param {{ _id?: unknown, name?: string }} character - Character or ModCharacter doc (minimal { _id, name })
 * @returns {Record<string, unknown>}
 */
/**
 * Mongo filter for "cannot join expeditions / must resolve relic first":
 * unappraised or appraised-but-art-not-submitted, not archived, not deteriorated,
 * and not a duplicate "kept" copy (duplicateOf set).
 * @param {{ _id?: unknown, name?: string }} character
 * @returns {Record<string, unknown>}
 */
function relicExploreJoinBlockFilter(character) {
  return {
    $and: [
      relicOwnerMatchQuery(character),
      { archived: false },
      { deteriorated: false },
      {
        $or: [{ duplicateOf: null }, { duplicateOf: { $exists: false } }],
      },
      {
        $or: [{ appraised: false }, { appraised: true, artSubmitted: false }],
      },
    ],
  };
}

function relicOwnerMatchQuery(character) {
  const id = character && character._id;
  const name = character && character.name != null ? String(character.name).trim() : '';
  const clauses = [];
  if (id != null && id !== '') {
    clauses.push({ characterId: id });
  }
  if (name) {
    clauses.push({
      $and: [
        { $or: [{ characterId: null }, { characterId: { $exists: false } }] },
        { discoveredBy: new RegExp(`^${escapeRegexForRelicOwner(name)}$`, 'i') },
      ],
    });
  }
  if (clauses.length === 0) {
    return { _id: { $exists: false } };
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return { $or: clauses };
}

// Canonical names for relics that have alternate spellings (matches docs/Relics.md: "Lens Of Truth").
// Keep in sync with bot/data/relicOutcomes.js NAME_ALIASES (used by getAppraisalText).
const RELIC_NAME_ALIASES = {
  'Lens of Truth': 'Lens Of Truth',
  'Lense Of Truth': 'Lens Of Truth',
};

/**
 * Normalize a relic name for matching against rollOutcome (uses RELIC_OUTCOMES + aliases).
 * @param {string} name - Display or outcome name
 * @returns {string|null} - Canonical name from RELIC_OUTCOMES, or null if no match
 */
function normalizeRelicName(name) {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (RELIC_NAME_ALIASES[trimmed]) return RELIC_NAME_ALIASES[trimmed];
  const fromOutcomes = RELIC_OUTCOMES.find(
    (e) => e.name && trimmed.toLowerCase() === e.name.toLowerCase()
  );
  return fromOutcomes ? fromOutcomes.name : null;
}

/**
 * Check if a character has a relic they can use (must be a duplicate = "kept").
 * Only duplicates are kept; unique relics must be submitted to the Library.
 * @param {ObjectId|string} characterId - Character _id
 * @param {string} relicName - Relic name (e.g. "Moon Pearl", "Lens of Truth")
 * @param {string} [characterName] - Character name (for discoveredBy match if characterId is ModCharacter)
 * @returns {Promise<boolean>}
 */
async function characterHasRelic(characterId, relicName, characterName = null) {
  const canonical = normalizeRelicName(relicName);
  if (!canonical) return false;
  const orClauses = [{ characterId: characterId }];
  if (characterName && typeof characterName === 'string') {
    orClauses.push({ discoveredBy: new RegExp(`^${characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  }
  const query = {
    rollOutcome: canonical,
    appraised: true,
    duplicateOf: { $exists: true, $ne: null },
    deteriorated: false,
    $or: orClauses,
  };
  const relic = await RelicModel.findOne(query).lean();
  if (!relic) return false;
  if (relic.consumedAt) return false;
  if (relic.relicState && relic.relicState.burnedOut) return false;
  return true;
}

/**
 * Check if any party member has the given relic.
 * @param {Array<{ _id: ObjectId, name?: string }>} partyMembers - Party character slots (e.g. party.characters)
 * @param {string} relicName - Relic name
 * @returns {Promise<boolean>}
 */
async function partyHasRelic(partyMembers, relicName) {
  if (!Array.isArray(partyMembers) || partyMembers.length === 0) return false;
  for (const slot of partyMembers) {
    const id = slot._id || slot.characterId;
    const name = slot.name || null;
    if (await characterHasRelic(id, relicName, name)) return true;
  }
  return false;
}

/**
 * Check if the party has Lens of Truth either as inventory item or as appraised relic.
 * Caller must pass getCharacterInventoryCollectionWithModSupport and party; this only checks relics.
 * For full check (item + relic), use this from explore.js and also run the existing inventory check.
 * @param {Array<{ _id: ObjectId, name?: string }>} partyMembers - Party character slots
 * @param {Function} [getInventoryCollection] - Optional: (slot) => collection; if provided, also checks for "Lens of Truth" item
 * @returns {Promise<boolean>}
 */
async function partyHasLensOfTruthRelic(partyMembers, getInventoryCollection = null) {
  const hasRelic = await partyHasRelic(partyMembers, 'Lens Of Truth');
  if (hasRelic) return true;
  if (typeof getInventoryCollection !== 'function') return false;
  for (const slot of partyMembers || []) {
    try {
      const collection = await getInventoryCollection(slot);
      const entry = await collection.findOne({
        characterId: slot._id,
        itemName: { $regex: /^Lens of Truth$/i },
        quantity: { $gte: 1 },
      });
      if (entry) return true;
    } catch (_) { /* skip */ }
  }
  return false;
}

/** Default number of uses for Blight Candle when relicState not set. */
const BLIGHT_CANDLE_DEFAULT_USES = 3;

/**
 * Consume one use of a Blight Candle relic for this character. If no Blight Candle or already burned out, no-op.
 * @param {ObjectId|string} characterId - Character _id
 * @param {string} [characterName] - Character name (for discoveredBy match)
 * @returns {Promise<boolean>} - true if a use was consumed (or candle burned out), false if no candle
 */
async function consumeBlightCandleUse(characterId, characterName = null) {
  const orClauses = [{ characterId }];
  if (characterName) orClauses.push({ discoveredBy: new RegExp(`^${characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') });
  const relic = await RelicModel.findOne({
    rollOutcome: 'Blight Candle',
    appraised: true,
    archived: false,
    deteriorated: false,
    $or: orClauses,
  });
  if (!relic) return false;
  if (relic.consumedAt || (relic.relicState && relic.relicState.burnedOut)) return false;
  const currentUses = relic.relicState && typeof relic.relicState.usesLeft === 'number'
    ? relic.relicState.usesLeft
    : BLIGHT_CANDLE_DEFAULT_USES;
  const nextUses = currentUses - 1;
  const update = {
    relicState: {
      burnedOut: nextUses <= 0,
      usesLeft: Math.max(0, nextUses),
    },
    ...(nextUses <= 0 ? { consumedAt: new Date() } : {}),
  };
  await RelicModel.findByIdAndUpdate(relic._id, update);
  return true;
}

/**
 * Pick a weighted random relic outcome.
 * For unique relics, checks if one already exists (any relic with that rollOutcome); if so, returns as duplicate.
 * @param {Object} options
 * @param {Function} options.isArchived - async (relicName) => boolean - true if this unique relic is already discovered (any relic has this rollOutcome)
 * @returns {Promise<{ outcome: { name, description, weight, unique }, isDuplicate: boolean, duplicateOf?: ObjectId }>}
 */
async function rollRelicOutcome(options = {}) {
  const { isArchived = async () => false } = options;

  const totalWeight = RELIC_OUTCOMES.reduce((sum, e) => sum + (e.weight || 1), 0);
  let roll = Math.random() * totalWeight;

  for (const entry of RELIC_OUTCOMES) {
    const w = entry.weight || 1;
    roll -= w;
    if (roll <= 0) {
      if (entry.unique) {
        const alreadyArchived = await isArchived(entry.name);
        if (alreadyArchived) {
          return {
            outcome: entry,
            isDuplicate: true,
            duplicateOf: null, // Caller sets from archived relic lookup
          };
        }
      }
      return {
        outcome: entry,
        isDuplicate: false,
      };
    }
  }

  // Fallback to first entry
  const first = RELIC_OUTCOMES[0] || { name: "Unknown Relic", description: "An ancient artifact of unclear origin.", weight: 1, unique: false };
  return {
    outcome: first,
    isDuplicate: false,
  };
}

/**
 * Get all relic outcomes (for display or admin).
 */
function getRelicOutcomes() {
  return [...RELIC_OUTCOMES];
}

module.exports = {
  rollRelicOutcome,
  getRelicOutcomes,
  normalizeRelicName,
  characterHasRelic,
  partyHasRelic,
  partyHasLensOfTruthRelic,
  consumeBlightCandleUse,
  relicOwnerMatchQuery,
  relicExploreJoinBlockFilter,
};
