// rngModule.js

const Monster = require('../models/MonsterModel');
const { getVillageRegionByName } = require('../modules/locationsModule');
const { applyBuffs, calculateAttackBuff, calculateDefenseBuff } = require('../modules/buffModule');

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
      return { encounter: 'No Encounter', monsters: [] };
    }

    const tier = parseInt(encounterType.split(' ')[1], 10);
    const filteredMonsters = monsters.filter(monster => monster.tier <= tier);

    return {
      encounter: encounterType,
      monsters: filteredMonsters.length > 0 ? filteredMonsters : monsters
    };
  } catch (error) {
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
  encounterProbabilitiesBloodMoon   
};
