const { getActiveBuffEffects, shouldConsumeElixir, consumeElixirBuff } = require('./elixirModule');

// ------------------- Calculate attack buff -------------------
// This function calculates whether an attack buff should be applied based on the character's attack stat.
// The higher the attack stat, the greater the chance of applying the buff.
function calculateAttackBuff(character, baseAttack) {
  const buffEffects = getActiveBuffEffects(character);
  let finalAttack = baseAttack;

  // Apply elixir attack boost
  if (buffEffects && buffEffects.attackBoost > 0) {
    finalAttack += buffEffects.attackBoost;
    
    // Consume mighty elixir after use
    if (shouldConsumeElixir(character, 'combat')) {
      consumeElixirBuff(character);
    } else if (character.buff?.active) {
      // Log when elixir is not used due to conditions not met
      console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type} with effects:`, character.buff.effects);
    }
  }

  // Apply existing buff logic if any
  if (character.buff && character.buff.active) {
    // Additional buff logic can be added here
  }

  return Math.max(1, finalAttack); // Ensure minimum attack of 1
}

// ------------------- Calculate defense buff -------------------
// This function calculates whether a defense buff should be applied based on the character's defense stat.
// A higher defense stat gives a greater chance of applying the defense buff.
function calculateDefenseBuff(character, baseDefense) {
  const buffEffects = getActiveBuffEffects(character);
  let finalDefense = baseDefense;

  // Apply elixir defense boost
  if (buffEffects && buffEffects.defenseBoost > 0) {
    finalDefense += buffEffects.defenseBoost;
    
    // Consume tough elixir after use
    if (shouldConsumeElixir(character, 'combat')) {
      consumeElixirBuff(character);
    } else if (character.buff?.active) {
      // Log when elixir is not used due to conditions not met
      console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type} with effects:`, character.buff.effects);
    }
  }

  // Apply existing buff logic if any
  if (character.buff && character.buff.active) {
    // Additional buff logic can be added here
  }

  // Apply 1.5x multiplier to final defense
  finalDefense = Math.floor(finalDefense * 1.5);

  return Math.max(0, finalDefense); // Ensure minimum defense of 0
 }

/**
 * Calculate speed buff for a character
 * @param {Object} character - Character object
 * @param {number} baseSpeed - Base speed value
 * @returns {number} - Final speed value with buffs
 */
function calculateSpeedBuff(character, baseSpeed) {
  const buffEffects = getActiveBuffEffects(character);
  let finalSpeed = baseSpeed;

  // Apply elixir speed boost
  if (buffEffects && buffEffects.speedBoost > 0) {
    finalSpeed += buffEffects.speedBoost;
    
    // Consume hasty elixir after use
    if (shouldConsumeElixir(character, 'travel')) {
      consumeElixirBuff(character);
    } else if (character.buff?.active) {
      // Log when elixir is not used due to conditions not met
      console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type} with effects:`, character.buff.effects);
    }
  }

  return Math.max(1, finalSpeed); // Ensure minimum speed of 1
}

/**
 * Calculate stealth buff for a character
 * @param {Object} character - Character object
 * @param {number} baseStealth - Base stealth value
 * @returns {number} - Final stealth value with buffs
 */
function calculateStealthBuff(character, baseStealth) {
  const buffEffects = getActiveBuffEffects(character);
  let finalStealth = baseStealth;

  // Apply elixir stealth boost
  if (buffEffects && buffEffects.stealthBoost > 0) {
    finalStealth += buffEffects.stealthBoost;
    
    // Consume sneaky elixir after use
    if (shouldConsumeElixir(character, 'gather') || shouldConsumeElixir(character, 'loot')) {
      consumeElixirBuff(character);
    } else if (character.buff?.active) {
      // Log when elixir is not used due to conditions not met
      console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type} with effects:`, character.buff.effects);
    }
  }

  return Math.max(1, finalStealth); // Ensure minimum stealth of 1
}

/**
 * Check if character has resistance to a specific damage type
 * @param {Object} character - Character object
 * @param {string} damageType - Type of damage ('heat', 'cold', 'electric', 'fire')
 * @returns {number} - Resistance value (0 if no resistance)
 */
function getDamageResistance(character, damageType) {
  const buffEffects = getActiveBuffEffects(character);
  
  let resistance = 0;
  
  switch (damageType) {
    case 'blight':
      resistance = buffEffects?.blightResistance || 0;
      // Consume chilly elixir after use
      if (resistance > 0 && shouldConsumeElixir(character, 'travel', { blightRain: true })) {
        consumeElixirBuff(character);
      } else if (character.buff?.active) {
        // Log when elixir is not used due to conditions not met
        console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type} with effects:`, character.buff.effects);
      }
      break;
    case 'cold':
      resistance = buffEffects?.coldResistance || 0;
      // Consume spicy elixir after use
      if (resistance > 0 && shouldConsumeElixir(character, 'travel')) {
        consumeElixirBuff(character);
      } else if (character.buff?.active) {
        // Log when elixir is not used due to conditions not met
        console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type} with effects:`, character.buff.effects);
      }
      break;
    case 'electric':
      resistance = buffEffects?.electricResistance || 0;
      // Consume electro elixir after use
      if (resistance > 0 && shouldConsumeElixir(character, 'combat')) {
        consumeElixirBuff(character);
      } else if (character.buff?.active) {
        // Log when elixir is not used due to conditions not met
        console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type} with effects:`, character.buff.effects);
      }
      break;
    case 'fire':
      resistance = buffEffects?.fireResistance || 0;
      // Consume fireproof elixir after use
      if (resistance > 0 && shouldConsumeElixir(character, 'travel', { blightRain: true })) {
        consumeElixirBuff(character);
      } else if (character.buff?.active) {
        // Log when elixir is not used due to conditions not met
        console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type} with effects:`, character.buff.effects);
      }
      break;
    default:
      resistance = 0;
  }
  
  return resistance;
}

/**
 * Calculate stamina-related buffs for a character
 * @param {Object} character - Character object
 * @returns {Object} - Stamina buff information
 */
function calculateStaminaBuffs(character) {
  const buffEffects = getActiveBuffEffects(character);
  
  // Consume enduring and energizing elixirs after use
  if (buffEffects && (buffEffects.staminaBoost > 0 || buffEffects.staminaRecovery > 0)) {
    if (shouldConsumeElixir(character, 'gather') || shouldConsumeElixir(character, 'loot') || shouldConsumeElixir(character, 'travel')) {
      consumeElixirBuff(character);
    } else if (character.buff?.active) {
      // Log when elixir is not used due to conditions not met
      console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type} with effects:`, character.buff.effects);
    }
  }
  
  return {
    staminaBoost: buffEffects?.staminaBoost || 0,
    staminaRecovery: buffEffects?.staminaRecovery || 0,
    extraHearts: buffEffects?.extraHearts || 0
  };
}

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
  calculateSpeedBuff,
  calculateStealthBuff,
  getDamageResistance,
  calculateStaminaBuffs,
  calculateRaidAttackBuff,
  calculateRaidDefenseBuff,
  applyBuffs,
  applyRaidBuffs,
  getLastDebugValues: () => lastDebugValues,
};
