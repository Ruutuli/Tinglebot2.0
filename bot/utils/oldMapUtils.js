// ============================================================================
// Old Map Utils - Add and check old maps found (stored outside inventory)
// ============================================================================

const OldMapFound = require('../models/OldMapFoundModel.js');
const { generateUniqueId } = require('./uniqueIdUtils.js');

function asObjectIdString(value) {
  if (!value) return '';
  try {
    return value.toString();
  } catch (_) {
    return '';
  }
}

function normalizeCharacterRef(characterRef) {
  if (!characterRef) return null;
  if (typeof characterRef === 'string') {
    const characterName = characterRef.trim();
    return characterName ? { characterName, characterId: '', ownerUserId: '' } : null;
  }

  const characterName = String(characterRef.characterName || characterRef.name || '').trim();
  const characterId = asObjectIdString(characterRef.characterId || characterRef._id);
  const ownerUserId = String(characterRef.ownerUserId || characterRef.userId || '').trim();
  if (!characterName && !characterId) return null;
  return { characterName, characterId, ownerUserId };
}

/**
 * Add an old map to a character's collection.
 * Assigns a short mapId (e.g. M12345).
 * @param {string} characterName - Character who found the map
 * @param {number} mapNumber - Map number (1-46)
 * @param {string} [locationFound] - Optional location string (e.g. "H8 Q2")
 */
async function addOldMapToCharacter(characterRef, mapNumber, locationFound = '') {
  const normalized = normalizeCharacterRef(characterRef);
  if (!normalized || typeof mapNumber !== 'number' || mapNumber < 1 || mapNumber > 46) {
    return null;
  }

  const basePayload = {
    characterName: normalized.characterName || '',
    characterId: normalized.characterId || null,
    ownerUserId: normalized.ownerUserId || '',
    mapNumber,
    locationFound: String(locationFound || '').trim(),
  };

  const MAX_MAP_ID_RETRIES = 8;
  for (let attempt = 1; attempt <= MAX_MAP_ID_RETRIES; attempt += 1) {
    try {
      const mapId = generateUniqueId('M');
      return await OldMapFound.create({ ...basePayload, mapId });
    } catch (error) {
      const duplicateMapId = error?.code === 11000 && String(error?.message || '').includes('mapId');
      if (duplicateMapId && attempt < MAX_MAP_ID_RETRIES) continue;
      throw error;
    }
  }
  return null;
}

/**
 * Find an OldMapFound by MongoDB _id or short mapId (e.g. M12345).
 * @param {string} idOrMapId - MongoDB _id (24 hex) or mapId (e.g. M12345)
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function findOldMapByIdOrMapId(idOrMapId) {
  if (!idOrMapId || typeof idOrMapId !== 'string') return null;
  const str = idOrMapId.trim();
  if (/^[0-9a-fA-F]{24}$/.test(str)) {
    return await OldMapFound.findById(str);
  }
  return await OldMapFound.findOne({ mapId: str });
}

const charNameRegex = (name) =>
  new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

function resolveOwnerMatch(characterRef) {
  const normalized = normalizeCharacterRef(characterRef);
  if (!normalized) return null;
  if (normalized.characterId && normalized.characterName) {
    return {
      $or: [
        { characterId: normalized.characterId },
        { characterId: null, characterName: charNameRegex(normalized.characterName) },
      ],
    };
  }
  if (normalized.characterId) {
    return { characterId: normalized.characterId };
  }
  return { characterName: charNameRegex(normalized.characterName) };
}

/**
 * Check if a character has at least one of the given map number.
 * @param {string} characterName - Character to check
 * @param {number} mapNumber - Map number (1-46)
 * @returns {Promise<boolean>}
 */
async function hasOldMap(characterRef, mapNumber) {
  if (!characterRef || typeof mapNumber !== 'number') return false;
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return false;
  const count = await OldMapFound.countDocuments({
    ...ownerMatch,
    mapNumber,
  });
  return count > 0;
}

/**
 * Check if a character has at least one appraised map of the given number.
 * Used for quadrant "map location" prompt (only appraised maps count).
 * @param {string} characterName - Character to check
 * @param {number} mapNumber - Map number (1-46)
 * @returns {Promise<boolean>}
 */
async function hasAppraisedOldMap(characterRef, mapNumber) {
  if (!characterRef || typeof mapNumber !== 'number') return false;
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return false;
  const count = await OldMapFound.countDocuments({
    ...ownerMatch,
    mapNumber,
    appraised: true,
  });
  return count > 0;
}

/**
 * Check if a character has at least one appraised, not-yet-redeemed map of the given number.
 * Used to decide whether to grant map-led reward on entering a quadrant.
 * @param {string} characterName - Character to check
 * @param {number} mapNumber - Map number (1-46)
 * @returns {Promise<boolean>}
 */
async function hasAppraisedUnexpiredOldMap(characterRef, mapNumber) {
  if (!characterRef || typeof mapNumber !== 'number') return false;
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return false;
  const count = await OldMapFound.countDocuments({
    ...ownerMatch,
    mapNumber,
    appraised: true,
    redeemedAt: null,
  });
  return count > 0;
}

/**
 * Check if a character has at least one appraised, already-redeemed map of the given number.
 * Used to show "you've already claimed the reward here" only when someone entered this square with the map and redeemed.
 * @param {string} characterName - Character to check
 * @param {number} mapNumber - Map number (1-46)
 * @returns {Promise<boolean>}
 */
async function hasAppraisedRedeemedOldMap(characterRef, mapNumber) {
  if (!characterRef || typeof mapNumber !== 'number') return false;
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return false;
  const count = await OldMapFound.countDocuments({
    ...ownerMatch,
    mapNumber,
    appraised: true,
    redeemedAt: { $ne: null },
  });
  return count > 0;
}

/**
 * Find one appraised, unredeemed OldMapFound for the character and map number;
 * set redeemedAt to now and return the doc. Used after granting map-led reward (one-and-done).
 * @param {string} characterName - Character who owns the map
 * @param {number} mapNumber - Map number (1-46)
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function findAndRedeemOldMap(characterRef, mapNumber) {
  if (!characterRef || typeof mapNumber !== 'number') return null;
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return null;
  const doc = await OldMapFound.findOne({
    ...ownerMatch,
    mapNumber,
    appraised: true,
    redeemedAt: null,
  }).sort({ foundAt: 1 });
  if (!doc) return null;
  doc.redeemedAt = new Date();
  await doc.save();
  return doc;
}

/**
 * Get all map numbers a character has (with counts).
 * @param {string} characterName - Character to check
 * @returns {Promise<Array<{mapNumber: number, quantity: number}>>}
 */
async function getCharacterOldMaps(characterRef) {
  if (!characterRef) return [];
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return [];
  const docs = await OldMapFound.aggregate([
    { $match: ownerMatch },
    { $group: { _id: '$mapNumber', quantity: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return docs.map((d) => ({ mapNumber: d._id, quantity: d.quantity }));
}

/**
 * Get all old maps for a character with full details (for /map list and appraisal-request).
 * @param {string} characterName - Character to check
 * @returns {Promise<Array<{_id: import('mongoose').Types.ObjectId, mapId: string, mapNumber: number, appraised: boolean, redeemedAt: Date|null, foundAt: Date, locationFound: string}>>}
 */
async function getCharacterOldMapsWithDetails(characterRef) {
  if (!characterRef) return [];
  const ownerMatch = resolveOwnerMatch(characterRef);
  if (!ownerMatch) return [];
  const docs = await OldMapFound.find(ownerMatch)
    .sort({ foundAt: 1 })
    .lean();
  return docs.map((d) => ({
    _id: d._id,
    mapId: d.mapId || '',
    characterId: d.characterId || null,
    ownerUserId: d.ownerUserId || '',
    mapNumber: d.mapNumber,
    appraised: !!d.appraised,
    redeemedAt: d.redeemedAt || null,
    foundAt: d.foundAt,
    locationFound: d.locationFound || '',
  }));
}

module.exports = {
  addOldMapToCharacter,
  findOldMapByIdOrMapId,
  hasOldMap,
  hasAppraisedOldMap,
  hasAppraisedUnexpiredOldMap,
  hasAppraisedRedeemedOldMap,
  findAndRedeemOldMap,
  getCharacterOldMaps,
  getCharacterOldMapsWithDetails,
};
