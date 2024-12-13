// ------------------- Buff Calculation Module -------------------

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
  applyBuffs,
  getLastDebugValues: () => lastDebugValues,
};
