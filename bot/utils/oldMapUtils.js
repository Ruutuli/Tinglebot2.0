// ============================================================================
// Old Map Utils - Add and check old maps found (stored outside inventory)
// ============================================================================

const OldMapFound = require('../models/OldMapFoundModel.js');

/**
 * Add an old map to a character's collection.
 * @param {string} characterName - Character who found the map
 * @param {number} mapNumber - Map number (1-46)
 * @param {string} [locationFound] - Optional location string (e.g. "H8 Q2")
 */
async function addOldMapToCharacter(characterName, mapNumber, locationFound = '') {
  if (!characterName || typeof mapNumber !== 'number' || mapNumber < 1 || mapNumber > 46) {
    return null;
  }
  const doc = await OldMapFound.create({
    characterName: String(characterName).trim(),
    mapNumber,
    locationFound: String(locationFound || '').trim(),
  });
  return doc;
}

const charNameRegex = (name) =>
  new RegExp(`^${String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

/**
 * Check if a character has at least one of the given map number.
 * @param {string} characterName - Character to check
 * @param {number} mapNumber - Map number (1-46)
 * @returns {Promise<boolean>}
 */
async function hasOldMap(characterName, mapNumber) {
  if (!characterName || typeof mapNumber !== 'number') return false;
  const count = await OldMapFound.countDocuments({
    characterName: charNameRegex(characterName),
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
async function hasAppraisedOldMap(characterName, mapNumber) {
  if (!characterName || typeof mapNumber !== 'number') return false;
  const count = await OldMapFound.countDocuments({
    characterName: charNameRegex(characterName),
    mapNumber,
    appraised: true,
  });
  return count > 0;
}

/**
 * Get all map numbers a character has (with counts).
 * @param {string} characterName - Character to check
 * @returns {Promise<Array<{mapNumber: number, quantity: number}>>}
 */
async function getCharacterOldMaps(characterName) {
  if (!characterName) return [];
  const docs = await OldMapFound.aggregate([
    { $match: { characterName: charNameRegex(characterName) } },
    { $group: { _id: '$mapNumber', quantity: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return docs.map((d) => ({ mapNumber: d._id, quantity: d.quantity }));
}

/**
 * Get all old maps for a character with full details (for /map list and appraisal-request).
 * @param {string} characterName - Character to check
 * @returns {Promise<Array<{_id: import('mongoose').Types.ObjectId, mapNumber: number, appraised: boolean, foundAt: Date, locationFound: string}>>}
 */
async function getCharacterOldMapsWithDetails(characterName) {
  if (!characterName) return [];
  const docs = await OldMapFound.find({ characterName: charNameRegex(characterName) })
    .sort({ foundAt: 1 })
    .lean();
  return docs.map((d) => ({
    _id: d._id,
    mapNumber: d.mapNumber,
    appraised: !!d.appraised,
    foundAt: d.foundAt,
    locationFound: d.locationFound || '',
  }));
}

module.exports = {
  addOldMapToCharacter,
  hasOldMap,
  hasAppraisedOldMap,
  getCharacterOldMaps,
  getCharacterOldMapsWithDetails,
};
