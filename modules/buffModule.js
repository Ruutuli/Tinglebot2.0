// ------------------- Buff Calculation Module -------------------

// ------------------- Calculate attack buff -------------------
// This function calculates whether an attack buff should be applied based on the character's attack stat.
// The higher the attack stat, the greater the chance of applying the buff.
const calculateAttackBuff = (character) => {
  const attackStat = character.attack || 0;  // Default to 0 if no attack stat is available
  const attackChance = attackStat * 10;  // Higher attack stat increases the chance of applying the buff
  return Math.random() < attackChance / 100;
};

// ------------------- Calculate defense buff -------------------
// This function calculates whether a defense buff should be applied based on the character's defense stat.
// A higher defense stat gives a greater chance of applying the defense buff.
const calculateDefenseBuff = (character) => {
  const defenseStat = character.defense || 0;  // Default to 0 if no defense stat is available
  const defenseChance = defenseStat * 2;  // Lower defense stat decreases the chance of applying the buff
  return Math.random() < defenseChance / 100;
};

// ------------------- Apply buffs to random value -------------------
// This function adjusts the provided random value by applying any successful attack or defense buffs.
// It ensures the final adjusted value is within the valid range of 1 to 100.
const applyBuffs = (randomValue, attackSuccess, defenseSuccess, attackStat, defenseStat) => {
  let adjustedRandomValue = randomValue || 0;  // Ensure the random value is valid by defaulting to 0 if undefined

  // If attack buff is successful, increase the random value by a factor of the attack stat
  if (attackSuccess) {
    adjustedRandomValue += attackStat * 10;
  }

  // If defense buff is successful, increase the random value by a factor of the defense stat
  if (defenseSuccess) {
    adjustedRandomValue += defenseStat * 2;
  }

  // Ensure the final adjusted value is between 1 and 100, and log a warning if an invalid value is detected
  adjustedRandomValue = Math.max(1, Math.min(adjustedRandomValue, 100));
  if (isNaN(adjustedRandomValue)) {
    console.error(`⚠️ Adjusted Random Value is invalid: ${adjustedRandomValue}`);  // Error logging
    adjustedRandomValue = randomValue;  // Fallback to the original random value in case of an error
  }

  return adjustedRandomValue;
};

// ------------------- Module Exports -------------------
// Export the buff calculation functions to make them available for other parts of the system
module.exports = {
  calculateAttackBuff,
  calculateDefenseBuff,
  applyBuffs,
};
