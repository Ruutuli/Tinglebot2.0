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

/**
 * Check if a character has at least one of the given map number.
 * @param {string} characterName - Character to check
 * @param {number} mapNumber - Map number (1-46)
 * @returns {Promise<boolean>}
 */
async function hasOldMap(characterName, mapNumber) {
  if (!characterName || typeof mapNumber !== 'number') return false;
  const count = await OldMapFound.countDocuments({
    characterName: new RegExp(`^${String(characterName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    mapNumber,
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
    { $match: { characterName: new RegExp(`^${String(characterName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } },
    { $group: { _id: '$mapNumber', quantity: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return docs.map((d) => ({ mapNumber: d._id, quantity: d.quantity }));
}

module.exports = {
  addOldMapToCharacter,
  hasOldMap,
  getCharacterOldMaps,
};
