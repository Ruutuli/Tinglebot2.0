// ============================================================================
// ------------------- Character Stats Utility -------------------
// Functions for calculating and updating character stats from gear
// ============================================================================

const { calculateGearStats } = require('./gearUtils');

/**
 * Calculate character stats from gear
 * @param {Object} character - Character object with gear
 * @returns {{attack: number, defense: number}} - Calculated stats
 */
function calculateCharacterStats(character) {
  const gear = {
    gearWeapon: character.gearWeapon,
    gearShield: character.gearShield,
    gearArmor: character.gearArmor
  };
  
  return calculateGearStats(gear);
}

/**
 * Update character with calculated stats from gear
 * @param {Object} character - Character document (Mongoose model instance)
 * @returns {Promise<Object>} - Updated character
 */
async function updateCharacterStats(character) {
  const stats = calculateCharacterStats(character);
  
  character.attack = stats.attack;
  character.defense = stats.defense;
  
  await character.save();
  
  return character;
}

module.exports = {
  calculateCharacterStats,
  updateCharacterStats
};
