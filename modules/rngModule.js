// rngModule.js

const Monster = require('../models/MonsterModel');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { applyBuffs, calculateAttackBuff, calculateDefenseBuff } = require('../modules/buffModule');
const { useStamina, useHearts, handleKO } = require('../modules/characterStatsModule');


// Define the encounter probabilities
const encounterProbabilities = {
  noEncounter: 25,
  tier1: 40,
  tier2: 22,
  tier3: 8,
  tier4: 5
};

// Define the encounter probabilities for Blood Moon
const encounterProbabilitiesBloodMoon = {
  noEncounter: 10,  // Reduce chance of no encounter
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


// Define the initial rarity weights
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

// Adjust rarity weights based on the Final Value (FV)
const adjustRarityWeights = (fv) => {
  const adjustedWeights = {};

  // Ensure FV is a valid number
  const validFv = isNaN(fv) ? 0 : fv;

  // Define multipliers for each FV range
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

  // Apply the appropriate multiplier based on the FV range
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

// Create a weighted item list based on the provided items and their rarities
function createWeightedItemList(items, fv) {
  if (!items || items.length === 0) {
    return [];
  }

  const adjustedWeights = adjustRarityWeights(fv);

  // Filter out items without defined rarity or invalid rarity
  const validItems = items.filter(item => {
    const hasValidRarity = item.itemRarity && adjustedWeights[item.itemRarity] > 0;
    return hasValidRarity;
  });

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

// Function to calculate the Final Value (FV) using damageModule
const calculateFinalValue = (character) => {
  const damageValue = Math.floor(Math.random() * 100) + 1;

  const attackSuccess = calculateAttackBuff(character);
  const defenseSuccess = calculateDefenseBuff(character);

  const adjustedRandomValue = applyBuffs(damageValue, attackSuccess, defenseSuccess, character.attack, character.defense);

  return { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess };
};

// Create a function to determine a random encounter based on probabilities
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


// Function to determine a Blood Moon encounter
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

// Create a function to determine a monster encounter from the already fetched list
async function getMonsterEncounterFromList(monsters) {
  try {
    const encounterType = getRandomEncounter();
    if (encounterType === 'No Encounter') {
      console.log('[ENCOUNTER DEBUG] No encounter triggered.');
      return { encounter: 'No Encounter', monsters: [] };
    }

    let tier = parseInt(encounterType.split(' ')[1], 10);

    let filteredMonsters = monsters.filter(monster => monster.tier === tier);

    // Fallback logic: if no monsters are available for the selected tier, try lower tiers
    while (filteredMonsters.length === 0 && tier > 1) {
      tier--; // Decrease the tier to try lower levels
      console.log(`[ENCOUNTER DEBUG] No monsters found for Tier ${tier + 1}. Trying Tier ${tier}...`);
      filteredMonsters = monsters.filter(monster => monster.tier === tier);
    }

    if (filteredMonsters.length === 0) {
      console.log('[ENCOUNTER DEBUG] No monsters available for any tier.');
      return { encounter: 'No Encounter', monsters: [] };
    }

    const selectedMonster = filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];

    return {
      encounter: `Tier ${tier}`,
      monsters: [selectedMonster],
    };
  } catch (error) {
    console.error('[ENCOUNTER ERROR]', error);
    return { encounter: 'Error', monsters: [] };
  }
}

// Create a function to get monsters by village and job criteria
async function getMonstersByCriteria(village, job) {
  try {
    // Get the corresponding region for the village
    const region = getVillageRegionByName(village);
    if (!region) {
      return [];
    }

    // Normalize job and region for the query
    const normalizedJob = job.toLowerCase().replace(/\s+/g, '');
    const normalizedRegion = region.toLowerCase().replace(/\s+/g, '');

    // Construct the query to match the job and location fields
    const query = {
      [normalizedJob]: true,
      [normalizedRegion]: true
    };

    const monsters = await Monster.find(query);
    return monsters;
  } catch (error) {
    return [];
  }
}

// Define the encounter probabilities for travel
const encounterProbabilitiesTravel = {
  tier1: 40,
  tier2: 35,
  tier3: 15,
  tier4: 10
};

// Create a function to determine a random encounter based on travel probabilities
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

// Create a function to get monsters by path
async function getMonstersByPath(path) {
  try {
    const query = { [path]: true };
    const monsters = await Monster.find(query);
    return monsters;
  } catch (error) {
    return [];
  }
}

// Create a function to get monsters by region
async function getMonstersByRegion(region) {
  try {
    const query = { [region]: true };
    const monsters = await Monster.find(query);
    return monsters;
  } catch (error) {
    return [];
  }
}

// Function to attempt fleeing
function calculateWeightedDamage(tier) {
  // Create an array of weights from tier down to 1
  const weights = Array.from({ length: tier }, (_, i) => tier - i);

  // Create a cumulative weight array for random selection
  const cumulativeWeights = weights.reduce((acc, weight, index) => {
      acc.push(weight + (acc[index - 1] || 0));
      return acc;
  }, []);

  // Generate a random number within the total weight range
  const totalWeight = cumulativeWeights[cumulativeWeights.length - 1];
  const randomWeight = Math.random() * totalWeight;

  // Determine the damage based on the random weight
  for (let i = 0; i < cumulativeWeights.length; i++) {
      if (randomWeight <= cumulativeWeights[i]) {
          return i + 1; // Damage is index + 1 (1-based damage values)
      }
  }

  // Default fallback (shouldn't occur)
  return 1;
}

async function attemptFlee(character, monster) {
  try {
      console.log(`[FLEE ATTEMPT] Starting flee attempt for character: ${character.name}`);
      console.log(`[FLEE ATTEMPT] Initial Stamina: ${character.currentStamina}`);

      // // Deduct 1 stamina
      // await useStamina(character._id, 1);
      // character.currentStamina -= 1; // Update local value for logging
      // console.log(`[FLEE ATTEMPT] Stamina after deduction: ${character.currentStamina}`);

      // Calculate flee success chance
      const baseFleeChance = 0.5; // Base 50% chance
      const bonusFleeChance = character.failedFleeAttempts * 0.05; // 5% bonus per failed attempt
      const fleeChance = Math.min(baseFleeChance + bonusFleeChance, 0.95); // Cap at 95%
      const fleeRoll = Math.random();
      console.log(`[FLEE ATTEMPT] Flee Chance: ${fleeChance * 100}%, Roll: ${fleeRoll}`);

      if (fleeRoll < fleeChance) {
          console.log("[FLEE ATTEMPT] Flee was successful!");
          character.failedFleeAttempts = 0; // Reset failed flee attempts
          await character.save(); // Save the character changes
          return { success: true, message: "You successfully fled!" };
      }

      console.log("[FLEE ATTEMPT] Flee failed! Monster will attempt to attack...");
      character.failedFleeAttempts += 1; // Increment failed flee attempts
      await character.save(); // Save the character changes

      // Calculate monster damage based on weighted probability
      const monsterDamage = calculateWeightedDamage(monster.tier);

      console.log(`[FLEE ATTEMPT] Weighted damage calculated for Tier ${monster.tier}: ${monsterDamage} hearts.`);

      // Apply the damage to the character
      await useHearts(character._id, monsterDamage);
      character.currentHearts -= monsterDamage; // Update local value for logging

      if (character.currentHearts <= 0) {
          console.log(`[FLEE ATTEMPT] Character is KO'd after taking ${monsterDamage} hearts of damage.`);
          await handleKO(character._id); // Handle KO logic
          return {
              success: false,
              attacked: true,
              damage: monsterDamage,
              message: `The monster attacked and knocked you out!`,
          };
      }

      return {
          success: false,
          attacked: true,
          damage: monsterDamage,
          message: `The monster attacked and dealt ${monsterDamage} hearts of damage!`,
      };
  } catch (error) {
      console.error("[FLEE ATTEMPT ERROR] An error occurred during the flee attempt:", error);
      throw error;
  }
}


module.exports = {
  createWeightedItemList,
  getMonsterEncounterFromList,
  getMonstersByCriteria,
  calculateFinalValue,
  getMonsterEncounterFromList,
  getMonstersByPath,
  getRandomTravelEncounter,
  encounterProbabilitiesTravel,
  getMonstersByRegion,
  getRandomBloodMoonEncounter,
  encounterProbabilitiesBloodMoon,
  attemptFlee 
};
