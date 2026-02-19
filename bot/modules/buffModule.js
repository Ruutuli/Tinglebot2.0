const { getActiveBuffEffects, shouldConsumeElixir, consumeElixirBuff } = require('./elixirModule');
const logger = require('@/utils/logger');

// ------------------- Calculate attack buff -------------------
// This function calculates whether an attack buff should be applied based on the character's attack stat.
// The higher the attack stat, the greater the chance of applying the buff.
function calculateAttackBuff(character, baseAttack) {
  const buffEffects = getActiveBuffEffects(character);
  let finalAttack = baseAttack ?? 0;

  // Apply elixir attack boost
  if (buffEffects && buffEffects.attackBoost > 0) {
    finalAttack += buffEffects.attackBoost;
    
    // Consume mighty elixir after use
    if (shouldConsumeElixir(character, 'combat')) {
      consumeElixirBuff(character);
    } else if (character.buff?.active) {
      // Log when elixir is not used due to conditions not met
      console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
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
  let finalDefense = baseDefense ?? 0;

  // Apply elixir defense boost
  if (buffEffects && buffEffects.defenseBoost > 0) {
    finalDefense += buffEffects.defenseBoost;
    
    // Consume tough elixir after use
    if (shouldConsumeElixir(character, 'combat')) {
      consumeElixirBuff(character);
    } else if (character.buff?.active) {
      // Log when elixir is not used due to conditions not met
      console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
    }
  }

  // Apply existing buff logic if any
  if (character.buff && character.buff.active) {
    // Additional buff logic can be added here
  }

  // 1.5x effective defense for success weighting so defense gear scales meaningfully
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
      console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
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
      console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
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
        console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
      }
      break;
    case 'cold':
      resistance = buffEffects?.coldResistance || 0;
      // Consume spicy elixir after use
      if (resistance > 0 && shouldConsumeElixir(character, 'travel')) {
        consumeElixirBuff(character);
      } else if (character.buff?.active) {
        // Log when elixir is not used due to conditions not met
        console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
      }
      break;
    case 'electric':
      resistance = buffEffects?.electricResistance || 0;
      // Consume electro elixir after use
      if (resistance > 0 && shouldConsumeElixir(character, 'combat')) {
        consumeElixirBuff(character);
      } else if (character.buff?.active) {
        // Log when elixir is not used due to conditions not met
        console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
      }
      break;
    case 'fire':
      resistance = buffEffects?.fireResistance || 0;
      // Consume fireproof elixir after use
      if (resistance > 0 && shouldConsumeElixir(character, 'travel', { blightRain: true })) {
        consumeElixirBuff(character);
      } else if (character.buff?.active) {
        // Log when elixir is not used due to conditions not met
        console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
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
      console.log(`[buffModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
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
// Applies guaranteed equipment benefits for raids (Gear Overview doc).
// Raid: Weapon always Attack × 1.8, Armor/Shield always Defense × 0.7.
const RAID_WEAPON_MULTIPLIER = 1.8;
const RAID_ARMOR_MULTIPLIER = 0.7;

const applyRaidBuffs = (randomValue, attackSuccess, defenseSuccess, attackStat, defenseStat) => {
  let adjustedRandomValue = Number(randomValue) || 0;
  const atk = Math.max(0, Number(attackStat) || 0);
  const def = Math.max(0, Number(defenseStat) || 0);

  if (attackSuccess && atk > 0) {
    adjustedRandomValue += Math.floor(atk * RAID_WEAPON_MULTIPLIER);
  }
  if (defenseSuccess && def > 0) {
    const defenseBonus = Math.floor(def * RAID_ARMOR_MULTIPLIER);
    adjustedRandomValue += defenseBonus;
  }

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

// Regular combat (Gear Overview): Bonus = Attack×10 when weapon triggers, Bonus = Defense×2 when armor triggers.
const REGULAR_WEAPON_BONUS_FACTOR = 10;
const REGULAR_ARMOR_BONUS_FACTOR = 2;

const applyBuffs = (randomValue, attackSuccess, defenseSuccess, attackStat, defenseStat) => {
  let adjustedRandomValue = Number(randomValue) || 0;
  const atk = Math.max(0, Number(attackStat) || 0);
  const def = Math.max(0, Number(defenseStat) || 0);

  lastDebugValues.initialRandomValue = randomValue;

  const weaponBonus = (attackSuccess && atk > 0) ? atk * REGULAR_WEAPON_BONUS_FACTOR : 0;
  const armorBonus = (defenseSuccess && def > 0) ? def * REGULAR_ARMOR_BONUS_FACTOR : 0;
  adjustedRandomValue += weaponBonus + armorBonus;

  adjustedRandomValue = Math.max(1, Math.min(100, adjustedRandomValue));
  lastDebugValues.adjustedRandomValue = adjustedRandomValue;

  const gearTotal = weaponBonus + armorBonus;
  if (gearTotal > 0) {
    const pct = Math.round((gearTotal / adjustedRandomValue) * 100);
    logger.info('EXPLORE', `[buffModule.js] Gear adjustment: base=${randomValue} +weapon=${weaponBonus} +armor=${armorBonus} → final=${adjustedRandomValue} (gear=${pct}% of final)`);
  }

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
