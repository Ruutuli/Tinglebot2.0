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
const { useHearts, useStamina, handleKO } = require('../modules/characterStatsModule');

// ============================================================================
// Encounter Probabilities
// ------------------- Define encounter probabilities for standard encounters -------------------
const encounterProbabilities = {
  noEncounter: 25,
  tier1: 40,
  tier2: 22,
  tier3: 8,
  tier4: 5
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
function createWeightedItemList(items, fv) {
  if (!items || items.length === 0) {
    return [];
  }

  const adjustedWeights = adjustRarityWeights(fv);
  const validItems = items.filter(item => item.itemRarity && adjustedWeights[item.itemRarity] > 0);
  if (validItems.length === 0) {
    return [];
  }

  const weightedList = [];
  validItems.forEach(item => {
    const weight = adjustedWeights[item.itemRarity];
    for (let i = 0; i < weight; i++) {
      weightedList.push(item);
    }
  });

  return weightedList;
}

// ============================================================================
// Final Value Calculation
// ------------------- Calculate Final Value -------------------
// Calculates the Final Value (FV) for a character by generating a damage value,
// applying attack and defense buffs, and returning the adjusted random value along with buff details.
const calculateFinalValue = (character) => {
  const damageValue = Math.floor(Math.random() * 100) + 1;
  const attackSuccess = calculateAttackBuff(character);
  const defenseSuccess = calculateDefenseBuff(character);
  const adjustedRandomValue = applyBuffs(damageValue, attackSuccess, defenseSuccess, character.attack, character.defense);
  return { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess };
};

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
      console.log('[rngModule.js]: logs No encounter triggered.');
      return { encounter: 'No Encounter', monsters: [] };
    }

    let tier = parseInt(encounterType.split(' ')[1], 10);
    let filteredMonsters = monsters.filter(monster => monster.tier === tier);

    // Fallback: if no monsters available for the selected tier, try lower tiers.
    while (filteredMonsters.length === 0 && tier > 1) {
      tier--;
      console.log(`[rngModule.js]: logs No monsters found for Tier ${tier + 1}. Trying Tier ${tier}...`);
      filteredMonsters = monsters.filter(monster => monster.tier === tier);
    }

    if (filteredMonsters.length === 0) {
      console.log('[rngModule.js]: logs No monsters available for any tier.');
      return { encounter: 'No Encounter', monsters: [] };
    }

    const selectedMonster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];
    return { encounter: `Tier ${tier}`, monsters: [selectedMonster] };
  } catch (error) {
    handleError(error, 'rngModule.js');

    console.error('[rngModule.js]: logs ENCOUNTER ERROR', error);
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
    console.log(`[rngModule.js]: logs [FLEE ATTEMPT] Starting flee attempt for character: ${character.name}`);
    console.log(`[rngModule.js]: logs [FLEE ATTEMPT] Initial Stamina: ${character.currentStamina}`);
    
    const baseFleeChance = 0.5; // Base 50% chance
    const bonusFleeChance = character.failedFleeAttempts * 0.05; // 5% bonus per failed attempt
    const fleeChance = Math.min(baseFleeChance + bonusFleeChance, 0.95);
    const fleeRoll = Math.random();
    console.log(`[rngModule.js]: logs [FLEE ATTEMPT] Flee Chance: ${fleeChance * 100}%, Roll: ${fleeRoll}`);

    if (fleeRoll < fleeChance) {
      console.log("[rngModule.js]: logs [FLEE ATTEMPT] Flee was successful!");
      character.failedFleeAttempts = 0;
      await character.save();
      return { success: true, message: "You successfully fled!" };
    }

    console.log("[rngModule.js]: logs [FLEE ATTEMPT] Flee failed! Monster will attempt to attack...");
    character.failedFleeAttempts += 1;
    await character.save();

    const monsterDamage = calculateWeightedDamage(monster.tier);
    console.log(`[rngModule.js]: logs [FLEE ATTEMPT] Weighted damage calculated for Tier ${monster.tier}: ${monsterDamage} hearts.`);
    
    await useHearts(character._id, monsterDamage);
    character.currentHearts -= monsterDamage;
    
    if (character.currentHearts <= 0) {
      console.log(`[rngModule.js]: logs [FLEE ATTEMPT] Character is KO'd after taking ${monsterDamage} hearts of damage.`);
      await handleKO(character._id);
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

    console.error("[rngModule.js]: logs [FLEE ATTEMPT ERROR] An error occurred during the flee attempt:", error);
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
  getMonstersByPath,
  getRandomTravelEncounter,
  encounterProbabilitiesTravel,
  getMonstersByRegion,
  getRandomBloodMoonEncounter,
  encounterProbabilitiesBloodMoon,
  attemptFlee
};
