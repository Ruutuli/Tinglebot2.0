// ------------------- rngModule.js -------------------
// This module handles random number generation and encounter logic for the game.
// It defines functions to adjust item rarity weights, create weighted item lists,
// calculate final values based on damage and buffs, determine random encounters (including Blood Moon encounters),
// and retrieve monsters based on various criteria such as village, region, or path.
// It also provides functions to attempt fleeing from an encounter.

// ============================================================================
// Database Models
// ------------------- Importing database models -------------------
const Monster = require('../models/MonsterModel');

const { handleError } = require('../utils/globalErrorHandler');
// ============================================================================
// Modules
// ------------------- Importing custom modules -------------------
const { getVillageRegionByName } = require('../modules/locationsModule');
const { applyBuffs, calculateAttackBuff, calculateDefenseBuff } = require('../modules/buffModule');
const { useHearts, handleKO } = require('../modules/characterStatsModule');

// ============================================================================
// Encounter Probabilities
// ------------------- Define encounter probabilities for standard encounters -------------------
const encounterProbabilities = {
  noEncounter: 20,
  tier1: 42,
  tier2: 23,
  tier3: 9,
  tier4: 6
};

// ------------------- Define encounter probabilities for Blood Moon -------------------
const encounterProbabilitiesBloodMoon = {
  noEncounter: 10,  // Reduced chance of no encounter
  tier1: 10,
  tier2: 10,
  tier3: 10,
  tier4: 10,
  tier5: 10,
  tier6: 10,
  tier7: 10,
  tier8: 10,
  tier9: 10,
  tier10: 10
};

// ============================================================================
// Rarity Weights and Weighted List Creation
// ------------------- Define initial rarity weights -------------------
const rarityWeights = {
  '1': 20,
  '2': 18,
  '3': 15,
  '4': 13,
  '5': 11,
  '6': 9,
  '7': 7,
  '8': 5,
  '9': 2,
  '10': 1
};

// ------------------- Adjust Rarity Weights -------------------
// Adjusts rarity weights based on the provided Final Value (FV) using predefined multipliers.
const adjustRarityWeights = (fv) => {
  const adjustedWeights = {};
  const validFv = isNaN(fv) ? 0 : fv;
  const multipliers = {
    '91-200': 5.0,
    '81-100': 4.0,
    '71-100': 3.0,
    '61-100': 4.0,
    '51-100': 2.0,
    '41-100': 1.8,
    '31-100': 1.6,
    '21-100': 1.4,
    '11-100': 1.2,
    '1-100': 1
  };

  Object.keys(rarityWeights).forEach(rarity => {
    const weight = rarityWeights[rarity];
    let multiplier = 1.0; // Default multiplier

    if (validFv >= 91 && rarity === '10') {
      multiplier = multipliers['91-200'];
    } else if (validFv >= 81 && validFv <= 100 && rarity === '9') {
      multiplier = multipliers['81-100'];
    } else if (validFv >= 71 && validFv <= 100 && rarity === '8') {
      multiplier = multipliers['71-100'];
    } else if (validFv >= 61 && validFv <= 100 && rarity === '7') {
      multiplier = multipliers['61-100'];
    } else if (validFv >= 51 && validFv <= 100 && rarity === '6') {
      multiplier = multipliers['51-100'];
    } else if (validFv >= 41 && validFv <= 100 && rarity === '5') {
      multiplier = multipliers['41-100'];
    } else if (validFv >= 31 && validFv <= 100 && rarity === '4') {
      multiplier = multipliers['31-100'];
    } else if (validFv >= 21 && validFv <= 100 && rarity === '3') {
      multiplier = multipliers['21-100'];
    } else if (validFv >= 11 && validFv <= 100 && rarity === '2') {
      multiplier = multipliers['11-100'];
    } else if (validFv >= 1 && validFv <= 100 && rarity === '1') {
      multiplier = multipliers['1-100'];
    }
    adjustedWeights[rarity] = weight * multiplier;
  });

  return adjustedWeights;
};

// ------------------- Create Weighted Item List -------------------
// Creates a weighted list of items based on their rarity and a provided Final Value (FV).
function createWeightedItemList(items, fv, job) {
  // Safety check: ensure items is an array
  if (!items || !Array.isArray(items) || items.length === 0) {
    console.log(`[rngModule.js] createWeightedItemList: Invalid items parameter - expected array, got ${typeof items}`);
    return [];
  }

  const adjustedWeights = adjustRarityWeights(fv);
  const validItems = items.filter(item => item.itemRarity && adjustedWeights[item.itemRarity] > 0);
  if (validItems.length === 0) {
    return [];
  }

  const weightedList = [];
  const honeyBoostLog = [];
  validItems.forEach(item => {
    let weight = adjustedWeights[item.itemRarity];
    // Boost honey items for Beekeeper job
    let honeyBoosted = false;
    if (
      job &&
      job.replace(/\s+/g, '').toLowerCase() === 'beekeeper' &&
      typeof item.itemName === 'string' &&
      item.itemName.toLowerCase().includes('honey')
    ) {
      honeyBoosted = true;
      weight *= 5;
      honeyBoostLog.push({ item: item.itemName, originalWeight: adjustedWeights[item.itemRarity], boostedWeight: weight });
    }
    for (let i = 0; i < weight; i++) {
      weightedList.push(item);
    }
  });

  // Logging for honey boost (reduced verbosity)
  if (job && job.replace(/\s+/g, '').toLowerCase() === 'beekeeper' && honeyBoostLog.length > 0) {
    console.log(`[rngModule.js]: 🍯 Beekeeper honey boost applied - ${honeyBoostLog.length} items boosted`);
  }

  return weightedList;
}

// ============================================================================
// Final Value Calculation
// ------------------- Calculate Final Value -------------------
// Calculates the Final Value (FV) for a character by generating a damage value,
// applying attack and defense buffs, and returning the adjusted random value along with buff details.
function calculateFinalValue(character, diceRoll) {
  // Apply blight roll multiplier if present
  const blightMultiplier = character.blightEffects?.rollMultiplier || 1.0;
  const adjustedDiceRoll = Math.floor(diceRoll * blightMultiplier);
  
  // Get elixir buff effects
  const { getActiveBuffEffects, shouldConsumeElixir, consumeElixirBuff } = require('./elixirModule');
  const buffEffects = getActiveBuffEffects(character);
  
  // Apply elixir buffs to the dice roll
  let finalDiceRoll = adjustedDiceRoll;
  
  // Speed boost affects gathering and movement
  if (buffEffects && buffEffects.speedBoost > 0) {
    finalDiceRoll += buffEffects.speedBoost;
    console.log(`[rngModule.js]: 🧪 Speed buff applied - +${buffEffects.speedBoost} to roll`);
    
    // Consume hasty elixir after use
    if (shouldConsumeElixir(character, 'gather') || shouldConsumeElixir(character, 'loot')) {
      consumeElixirBuff(character);
    } else if (character.buff?.active) {
      // Log when elixir is not used due to conditions not met
      console.log(`[rngModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
    }
  }
  
  // Stealth boost affects gathering success
  if (buffEffects && buffEffects.stealthBoost > 0) {
    finalDiceRoll += buffEffects.stealthBoost;
    console.log(`[rngModule.js]: 🧪 Stealth buff applied - +${buffEffects.stealthBoost} to roll`);
    
    // Consume sneaky elixir after use
    if (shouldConsumeElixir(character, 'gather') || shouldConsumeElixir(character, 'loot')) {
      consumeElixirBuff(character);
    } else if (character.buff?.active) {
      // Log when elixir is not used due to conditions not met
      console.log(`[rngModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
    }
  }
  
  const attackSuccess = calculateAttackBuff(character);
  const defenseSuccess = calculateDefenseBuff(character);
  const adjustedRandomValue = applyBuffs(
    finalDiceRoll,
    attackSuccess,
    defenseSuccess,
    character.attack,
    character.defense
  );
  
  // Log blight multiplier effect if present
  if (blightMultiplier !== 1.0) {
    console.log(`[rngModule.js]: 🎲 Blight multiplier applied - Original: ${diceRoll}, Multiplier: ${blightMultiplier}x, Adjusted: ${adjustedDiceRoll}`);
  }
  
  // Log elixir buff effects if present
  if (buffEffects && (buffEffects.speedBoost > 0 || buffEffects.stealthBoost > 0)) {
    console.log(`[rngModule.js]: 🧪 Elixir buffs applied - Final roll: ${finalDiceRoll} (Original: ${adjustedDiceRoll})`);
  }
  
  return {
    damageValue: finalDiceRoll,
    adjustedRandomValue,
    attackSuccess,
    defenseSuccess,
    elixirBuffs: buffEffects
  };
}

// ============================================================================
// ---- Raid-Specific Final Value Calculation ----
// ============================================================================

// ---- Function: calculateRaidFinalValue ----
// Calculates the Final Value for raids with guaranteed equipment benefits
// Unlike regular combat, equipment always helps in raids
function calculateRaidFinalValue(character, diceRoll) {
  const { calculateRaidAttackBuff, calculateRaidDefenseBuff, applyRaidBuffs } = require('./buffModule');
  
  // Apply blight roll multiplier if present
  const blightMultiplier = character.blightEffects?.rollMultiplier || 1.0;
  const adjustedDiceRoll = Math.floor(diceRoll * blightMultiplier);
  
  const attackSuccess = calculateRaidAttackBuff(character);
  const defenseSuccess = calculateRaidDefenseBuff(character);
  const adjustedRandomValue = applyRaidBuffs(
    adjustedDiceRoll,
    attackSuccess,
    defenseSuccess,
    character.attack,
    character.defense
  );
  
  // Log blight multiplier effect if present
  if (blightMultiplier !== 1.0) {
    console.log(`[rngModule.js]: 🎲 Raid blight multiplier applied - Original: ${diceRoll}, Multiplier: ${blightMultiplier}x, Adjusted: ${adjustedDiceRoll}`);
  }
  
  // Raid calculation details logged only in debug mode
  
  return {
    damageValue: adjustedDiceRoll,
    adjustedRandomValue,
    attackSuccess,
    defenseSuccess
  };
}

// ============================================================================
// Random Encounter Determination
// ------------------- Get Random Encounter -------------------
// Determines a random encounter based on defined encounter probabilities.
function getRandomEncounter() {
  const randomValue = Math.random() * 100;
  let encounter;
  if (randomValue < encounterProbabilities.noEncounter) {
    encounter = 'No Encounter';
  } else if (randomValue < encounterProbabilities.noEncounter + encounterProbabilities.tier1) {
    encounter = 'Tier 1';
  } else if (randomValue < encounterProbabilities.noEncounter + encounterProbabilities.tier1 + encounterProbabilities.tier2) {
    encounter = 'Tier 2';
  } else if (randomValue < encounterProbabilities.noEncounter + encounterProbabilities.tier1 + encounterProbabilities.tier2 + encounterProbabilities.tier3) {
    encounter = 'Tier 3';
  } else {
    encounter = 'Tier 4';
  }
  return encounter;
}

// ------------------- Get Random Blood Moon Encounter -------------------
// Determines a random encounter during a Blood Moon event using equal probability for tiers.
function getRandomBloodMoonEncounter() {
  const randomValue = Math.random() * 100;
  let cumulative = 0;
  for (const [tier, probability] of Object.entries(encounterProbabilitiesBloodMoon)) {
    cumulative += probability;
    if (randomValue < cumulative) {
      return tier;
    }
  }
  return 'No Encounter';
}

// ============================================================================
// Monster Encounter Functions
// ------------------- Get Monster Encounter from List -------------------
// Determines a monster encounter from a provided list of monsters based on the random encounter type.
// If no monsters are found at the selected tier, it falls back to lower tiers.
async function getMonsterEncounterFromList(monsters) {
  try {
    const encounterType = getRandomEncounter();
    if (encounterType === 'No Encounter') {
      return { encounter: 'No Encounter', monsters: [] };
    }

    let tier = parseInt(encounterType.split(' ')[1], 10);
    let filteredMonsters = monsters.filter(monster => monster.tier === tier);

    // Fallback: if no monsters available for the selected tier, try lower tiers.
    while (filteredMonsters.length === 0 && tier > 1) {
      tier--;
      filteredMonsters = monsters.filter(monster => monster.tier === tier);
    }

    if (filteredMonsters.length === 0) {
      return { encounter: 'No Encounter', monsters: [] };
    }

    const selectedMonster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];
    return { encounter: `Tier ${tier}`, monsters: [selectedMonster] };
  } catch (error) {
    handleError(error, 'rngModule.js');
    console.error('[rngModule.js]: ❌ Encounter error:', error.message);
    return { encounter: 'Error', monsters: [] };
  }
}

// ------------------- Get Monsters by Criteria -------------------
// Retrieves monsters based on village and job criteria.
async function getMonstersByCriteria(village, job) {
  try {
    const region = getVillageRegionByName(village);
    if (!region) return [];
    const normalizedJob = job.toLowerCase().replace(/\s+/g, '');
    const normalizedRegion = region.toLowerCase().replace(/\s+/g, '');
    const query = { [normalizedJob]: true, [normalizedRegion]: true };
    const monsters = await Monster.find(query);
    return monsters;
  } catch (error) {
    handleError(error, 'rngModule.js');

    return [];
  }
}

// ------------------- Get Random Travel Encounter -------------------
// Determines a random encounter based on travel probabilities.
const encounterProbabilitiesTravel = {
  tier1: 40,
  tier2: 35,
  tier3: 15,
  tier4: 10
};

function getRandomTravelEncounter() {
  const randomValue = Math.random() * 100;
  if (randomValue < encounterProbabilitiesTravel.tier1) {
    return 'Tier 1';
  } else if (randomValue < encounterProbabilitiesTravel.tier1 + encounterProbabilitiesTravel.tier2) {
    return 'Tier 2';
  } else if (randomValue < encounterProbabilitiesTravel.tier1 + encounterProbabilitiesTravel.tier2 + encounterProbabilitiesTravel.tier3) {
    return 'Tier 3';
  } else {
    return 'Tier 4';
  }
}

// ------------------- Get Monsters by Path -------------------
// Retrieves monsters based on a given path criterion.
async function getMonstersByPath(path) {
  try {
    const query = { [path]: true };
    const monsters = await Monster.find(query);
    return monsters;
  } catch (error) {
    handleError(error, 'rngModule.js');

    return [];
  }
}

// ------------------- Get Monsters by Region -------------------
// Retrieves monsters based on a given region.
async function getMonstersByRegion(region) {
  try {
    const query = { [region]: true };
    const monsters = await Monster.find(query);
    return monsters;
  } catch (error) {
    handleError(error, 'rngModule.js');

    return [];
  }
}

// ============================================================================
// Flee and Damage Calculation Functions
// ------------------- Calculate Weighted Damage -------------------
// Calculates damage based on a weighted probability using the monster's tier.
function calculateWeightedDamage(tier) {
  const weights = Array.from({ length: tier }, (_, i) => tier - i);
  const cumulativeWeights = weights.reduce((acc, weight, index) => {
      acc.push(weight + (acc[index - 1] || 0));
      return acc;
  }, []);
  const totalWeight = cumulativeWeights[cumulativeWeights.length - 1];
  const randomWeight = Math.random() * totalWeight;
  for (let i = 0; i < cumulativeWeights.length; i++) {
      if (randomWeight <= cumulativeWeights[i]) {
          return i + 1;
      }
  }
  return 1; // Fallback damage
}

// ------------------- Attempt Flee -------------------
// Attempts to flee from an encounter. Calculates flee chance, applies damage if fleeing fails,
// and updates character state accordingly.
async function attemptFlee(character, monster) {
  try {
    const baseFleeChance = 0.5;
    const bonusFleeChance = character.failedFleeAttempts * 0.05;
    const fleeChance = Math.min(baseFleeChance + bonusFleeChance, 0.95);
    const fleeRoll = Math.random();

    if (fleeRoll < fleeChance) {
      console.log(`[rngModule.js]: 🏃 ${character.name} fled from ${monster.name}`);
      character.failedFleeAttempts = 0;
      await character.save();
      return { success: true, message: "You successfully fled!" };
    }

    character.failedFleeAttempts += 1;
    await character.save();

    const monsterDamage = calculateWeightedDamage(monster.tier);
    await useHearts(character._id, monsterDamage, {
      commandName: 'flee_attempt',
      characterName: character.name,
      userId: character.userId,
      operation: 'flee_damage'
    });
    character.currentHearts -= monsterDamage;
    
    if (character.currentHearts <= 0) {
      console.log(`[rngModule.js]: 💀 ${character.name} KO'd by ${monster.name} during flee`);
      await handleKO(character._id, {
        commandName: 'flee_attempt',
        characterName: character.name,
        userId: character.userId,
        operation: 'flee_ko'
      });
      return {
        success: false,
        attacked: true,
        damage: monsterDamage,
        message: "The monster attacked and knocked you out!"
      };
    }

    return {
      success: false,
      attacked: true,
      damage: monsterDamage,
      message: `The monster attacked and dealt ${monsterDamage} hearts of damage!`
    };
  } catch (error) {
    handleError(error, 'rngModule.js');
    console.error(`[rngModule.js]: ❌ Flee attempt failed:`, error.message);
    throw error;
  }
}


// ============================================================================
// Module Exports
// ------------------- Exporting all functions -------------------
module.exports = {
  createWeightedItemList,
  getMonsterEncounterFromList,
  getMonstersByCriteria,
  calculateFinalValue,
  calculateRaidFinalValue,
  getMonstersByPath,
  getRandomTravelEncounter,
  encounterProbabilitiesTravel,
  getMonstersByRegion,
  getRandomBloodMoonEncounter,
  encounterProbabilitiesBloodMoon,
  attemptFlee
};
