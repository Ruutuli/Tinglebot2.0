
// ------------------- Calculate attack buff -------------------
// This function calculates whether an attack buff should be applied based on the character's attack stat.
// The higher the attack stat, the greater the chance of applying the buff.
const calculateAttackBuff = (character) => {
  const attackStat = character.attack || 0;  // Default to 0 if no attack stat is available
  const attackChance = attackStat * 10;  // Higher attack stat increases the chance of applying the buff
  const success = Math.random() < attackChance / 100;
  return success;
};

// ------------------- Calculate defense buff -------------------
// This function calculates whether a defense buff should be applied based on the character's defense stat.
// A higher defense stat gives a greater chance of applying the defense buff.
const calculateDefenseBuff = (character) => {
  const defenseStat = character.defense || 0;  // Default to 0 if no defense stat is available
  const defenseChance = defenseStat * 2;  // Lower defense stat decreases the chance of applying the buff
  const success = Math.random() < defenseChance / 100;
  return success;
};

// ============================================================================
// ---- Raid-Specific Buff Functions ----
// ============================================================================

// ---- Function: calculateRaidAttackBuff ----
// Always applies attack buff in raids based on weapon equipment
// Guarantees that weapons always help during raids
const calculateRaidAttackBuff = (character) => {
  const attackStat = character.attack || 0;
  
  // In raids, weapons always provide their benefit
  // Return true if character has any attack stat from equipment
  return attackStat > 0;
};

// ---- Function: calculateRaidDefenseBuff ----
// Always applies defense buff in raids based on armor/shield equipment
// Guarantees that armor and shields always help during raids
const calculateRaidDefenseBuff = (character) => {
  const defenseStat = character.defense || 0;
  
  // In raids, armor and shields always provide their benefit
  // Return true if character has any defense stat from equipment
  return defenseStat > 0;
};

// ---- Function: applyRaidBuffs ----
// Applies guaranteed equipment benefits for raids
// Unlike regular combat, equipment always helps in raids
const applyRaidBuffs = (randomValue, attackSuccess, defenseSuccess, attackStat, defenseStat) => {
  let adjustedRandomValue = randomValue || 0;

  // In raids, if equipment exists, it always provides its benefit
  if (attackSuccess && attackStat > 0) {
    // Slightly stronger than previous nerf to ease difficulty
    adjustedRandomValue += attackStat * 1.8;
  }

  if (defenseSuccess && defenseStat > 0) {
    // Slightly stronger than previous nerf to ease difficulty
    adjustedRandomValue += defenseStat * 0.7;
    console.log(`[buffModule.js]: 🛡️ Raid armor bonus applied: +${defenseStat * 0.7} (${defenseStat} defense)`);
  }

  // Ensure the final adjusted value is between 1 and 100
  adjustedRandomValue = Math.max(1, Math.min(adjustedRandomValue, 100));
  
  return adjustedRandomValue;
};

// ------------------- Apply buffs to random value -------------------
// This function adjusts the provided random value by applying any successful attack or defense buffs.
// It ensures the final adjusted value is within the valid range of 1 to 100.
let lastDebugValues = {
  initialRandomValue: null,
  adjustedRandomValue: null,
};

const applyBuffs = (randomValue, attackSuccess, defenseSuccess, attackStat, defenseStat) => {
  let adjustedRandomValue = randomValue || 0;  // Ensure the random value is valid by defaulting to 0 if undefined

  lastDebugValues.initialRandomValue = randomValue;

  // If attack buff is successful, increase the random value by a factor of the attack stat
  if (attackSuccess) {
      adjustedRandomValue += attackStat * 10;
  }

  // If defense buff is successful, increase the random value by a factor of the defense stat
  if (defenseSuccess) {
      adjustedRandomValue += defenseStat * 2;
  }

  // Ensure the final adjusted value is between 1 and 100
  adjustedRandomValue = Math.max(1, Math.min(adjustedRandomValue, 100));
  lastDebugValues.adjustedRandomValue = adjustedRandomValue;

  return adjustedRandomValue;
};

// ------------------- Module Exports -------------------
// Export the buff calculation functions to make them available for other parts of the system
module.exports = {
  calculateAttackBuff,
  calculateDefenseBuff,
  calculateRaidAttackBuff,
  calculateRaidDefenseBuff,
  applyBuffs,
  applyRaidBuffs,
  getLastDebugValues: () => lastDebugValues,
};
