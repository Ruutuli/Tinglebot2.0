// ------------------- rngModule.js -------------------
// This module handles random number generation and encounter logic for the game.
// It defines functions to adjust item rarity weights, create weighted item lists,
// calculate final values based on damage and buffs, determine random encounters (including Blood Moon encounters),
// and retrieve monsters based on various criteria such as village, region, or path.
// It also provides functions to attempt fleeing from an encounter.

// ============================================================================
// Database Models
// ------------------- Importing database models -------------------
const Monster = require('@/models/MonsterModel');

const { handleError } = require('@/utils/globalErrorHandler');
const logger = require('@/utils/logger');
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

// ------------------- Exploration monster tier weights (flatter spread so harder tiers show up more evenly) -------------------
const explorationTierWeights = {
  1: 32,
  2: 22,
  3: 14,
  4: 10,
  5: 7,
  6: 5,
  7: 4,
  8: 3,
  9: 2.5,
  10: 2
};

// ============================================================================
// Rarity Weights and Weighted List Creation
// ------------------- Define initial rarity weights (flatter spread for exploration so rarer items show up more evenly) -------------------
const rarityWeights = {
  '1': 14,
  '2': 13,
  '3': 12,
  '4': 11,
  '5': 10,
  '6': 9,
  '7': 8,
  '8': 7,
  '9': 6,
  '10': 5
};

// ------------------- Adjust Rarity Weights -------------------
// Adjusts rarity weights based on the provided Final Value (FV) using predefined multipliers.
// Also applies village level bonuses for gathering and looting (Level 2: +10-15% for rarity 3-5, Level 3: +20-30% for rarity 3-7).
const adjustRarityWeights = (fv, villageLevel = 1) => {
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
    
    // Apply village level rarity weight multipliers
    if (villageLevel >= 2) {
      const rarityNum = parseInt(rarity);
      
      // Level 2: +10-15% for rarity 3-5
      if (villageLevel === 2 && rarityNum >= 3 && rarityNum <= 5) {
        const villageMultiplier = 1.0 + (Math.random() * 0.05 + 0.10); // Random between 1.10 and 1.15
        multiplier *= villageMultiplier;
        logger.info('GATHER', `🏘️ Village Level 2 rarity bonus: Rarity ${rarity} weight multiplier ${villageMultiplier.toFixed(3)}x (${((villageMultiplier - 1) * 100).toFixed(1)}% increase)`);
      }
      
      // Level 3: +20-30% for rarity 3-7
      if (villageLevel === 3 && rarityNum >= 3 && rarityNum <= 7) {
        const villageMultiplier = 1.0 + (Math.random() * 0.10 + 0.20); // Random between 1.20 and 1.30
        multiplier *= villageMultiplier;
        logger.info('GATHER', `🏘️ Village Level 3 rarity bonus: Rarity ${rarity} weight multiplier ${villageMultiplier.toFixed(3)}x (${((villageMultiplier - 1) * 100).toFixed(1)}% increase)`);
      }
    }
    
    adjustedWeights[rarity] = weight * multiplier;
  });

  return adjustedWeights;
};

// ------------------- Create Weighted Item List -------------------
// Creates a weighted list of items based on their rarity and a provided Final Value (FV).
// Also accepts villageLevel for gathering bonuses.
function createWeightedItemList(items, fv, job, villageLevel = 1) {
  // Safety check: ensure items is a non-empty array
  if (!Array.isArray(items)) {
    console.log(`[rngModule.js] createWeightedItemList: Invalid items parameter - expected array, got ${typeof items}`);
    return [];
  }
  if (!items || items.length === 0) {
    console.log(`[rngModule.js] createWeightedItemList: Invalid items parameter - expected non-empty array, got empty array`);
    return [];
  }

  const adjustedWeights = adjustRarityWeights(fv, villageLevel);
  // Normalize itemRarity to string to match adjustedWeights keys (which are strings like '1', '2', etc.)
  const validItems = items.filter(item => {
    if (!item.itemRarity) return false;
    const normalizedRarity = String(item.itemRarity);
    return adjustedWeights[normalizedRarity] > 0;
  });
  if (validItems.length === 0) {
    return [];
  }

  const weightedList = [];
  const honeyBoostLog = [];
  validItems.forEach(item => {
    // Normalize itemRarity to string to match adjustedWeights keys
    const normalizedRarity = String(item.itemRarity);
    let weight = adjustedWeights[normalizedRarity];
    // Boost Courser Bee Honey for Beekeeper job (only honey item Beekeepers gather)
    if (
      job &&
      job.replace(/\s+/g, '').toLowerCase() === 'beekeeper' &&
      item.itemName === 'Courser Bee Honey'
    ) {
      weight *= 5;
      weight *= 5;
      honeyBoostLog.push({ item: item.itemName, originalWeight: adjustedWeights[normalizedRarity], boostedWeight: weight });
    }
    for (let i = 0; i < weight; i++) {
      weightedList.push(item);
    }
  });

  // Logging for honey boost (reduced verbosity)
  if (job && job.replace(/\s+/g, '').toLowerCase() === 'beekeeper' && honeyBoostLog.length > 0) {
    logger.info('GATHER', `Beekeeper honey boost applied - ${honeyBoostLog.length} items boosted`);
  }

  return weightedList;
}

// ============================================================================
// Final Value Calculation (Gear Overview: Regular vs Raid combat)
// ============================================================================
// Regular: Weapon = Attack×10% chance → +Attack×10; Armor = Defense×2% chance → +Defense×2.
// Raid: calculateRaidFinalValue — weapon always +Attack×2.5, armor always +Defense×1.1.

const REGULAR_WEAPON_CHANCE_PER_ATTACK = 0.10; // Attack × 10% chance (doc)
const REGULAR_ARMOR_CHANCE_PER_DEFENSE = 0.02; // Defense × 2% chance (doc)

function calculateFinalValue(character, diceRoll) {
  if (!character || typeof character !== 'object') {
    logger.warn('RNG', '[rngModule.js] calculateFinalValue: invalid character, using safe defaults');
  }
  const safeDiceRoll = Math.max(1, Math.min(100, Math.floor(Number(diceRoll) || 1)));
  const blightMultiplier = (character?.blighted && character.blightStage === 2) ? 1.5 : 1.0;
  const adjustedDiceRoll = Math.floor(safeDiceRoll * blightMultiplier);

  const { getActiveBuffEffects, shouldConsumeElixir, consumeElixirBuff } = require('./elixirModule');
  const buffEffects = getActiveBuffEffects(character) || {};
  let finalDiceRoll = adjustedDiceRoll;

  if (buffEffects.speedBoost > 0) {
    finalDiceRoll += buffEffects.speedBoost;
    if (shouldConsumeElixir(character, 'gather') || shouldConsumeElixir(character, 'loot')) {
      consumeElixirBuff(character);
    }
  }
  if (buffEffects.stealthBoost > 0) {
    finalDiceRoll += buffEffects.stealthBoost;
    if (shouldConsumeElixir(character, 'gather') || shouldConsumeElixir(character, 'loot')) {
      consumeElixirBuff(character);
    }
  }

  // Regular combat: chance-based gear (Gear Overview doc)
  const rawAttack = Math.max(0, Number(character?.attack) || 0);
  const rawDefense = Math.max(0, Number(character?.defense) || 0);
  const attackStat = calculateAttackBuff(character, rawAttack);
  const defenseStat = calculateDefenseBuff(character, rawDefense);

  const weaponChance = Math.max(0, Math.min(1, rawAttack * REGULAR_WEAPON_CHANCE_PER_ATTACK));
  const armorChance = Math.max(0, Math.min(1, rawDefense * REGULAR_ARMOR_CHANCE_PER_DEFENSE));
  const weaponApplies = attackStat > 0 && Math.random() < weaponChance;
  const armorApplies = defenseStat > 0 && Math.random() < armorChance;
  const effectiveAttack = weaponApplies ? attackStat : 0;
  const effectiveDefense = armorApplies ? defenseStat : 0;

  const weaponName = character?.gearWeapon?.name ? String(character.gearWeapon.name).trim() : 'none';
  const armorParts = [];
  if (character?.gearArmor?.head?.name) armorParts.push(String(character.gearArmor.head.name).trim());
  if (character?.gearArmor?.chest?.name) armorParts.push(String(character.gearArmor.chest.name).trim());
  if (character?.gearArmor?.legs?.name) armorParts.push(String(character.gearArmor.legs.name).trim());
  const armorDesc = armorParts.length > 0 ? armorParts.join(', ') : 'none';
  logger.info('EXPLORE', `gear atk=${rawAttack}(${weaponApplies ? '✓' : '✗'})→${effectiveAttack} def=${rawDefense}(${armorApplies ? '✓' : '✗'})→${effectiveDefense}`);

  const adjustedRandomValue = applyBuffs(
    finalDiceRoll,
    effectiveAttack,
    effectiveDefense,
    attackStat,
    defenseStat
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
    attackSuccess: effectiveAttack,
    defenseSuccess: effectiveDefense,
    elixirBuffs: buffEffects
  };
}

// ============================================================================
// ---- Raid-Specific Final Value Calculation ----
// ============================================================================

// ---- Function: calculateRaidFinalValue ----
// Raid combat (Gear Overview): gear always applies. Weapon +Attack×2.5, Armor +Defense×1.1.
function calculateRaidFinalValue(character, diceRoll) {
  const { calculateRaidAttackBuff, calculateRaidDefenseBuff, applyRaidBuffs } = require('./buffModule');

  if (!character || typeof character !== 'object') {
    logger.warn('RNG', '[rngModule.js] calculateRaidFinalValue: invalid character');
  }
  const safeDiceRoll = Math.max(1, Math.min(100, Math.floor(Number(diceRoll) || 1)));
  const blightMultiplier = (character?.blighted && character.blightStage === 2) ? 1.5 : 1.0;
  const adjustedDiceRoll = Math.floor(safeDiceRoll * blightMultiplier);

  const attackSuccess = calculateRaidAttackBuff(character);
  const defenseSuccess = calculateRaidDefenseBuff(character);
  const attackStat = Math.max(0, Number(character?.attack) || 0);
  const defenseStat = Math.max(0, Number(character?.defense) || 0);

  const adjustedRandomValue = applyRaidBuffs(
    adjustedDiceRoll,
    attackSuccess,
    defenseSuccess,
    attackStat,
    defenseStat
  );

  if (blightMultiplier !== 1.0) {
    logger.info('RNG', `[rngModule.js] Raid blight multiplier: ${diceRoll} → ${adjustedDiceRoll}`);
  }

  return {
    damageValue: adjustedDiceRoll,
    adjustedRandomValue,
    attackSuccess: attackSuccess ? attackStat : 0,
    defenseSuccess: defenseSuccess ? defenseStat : 0
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
// ------------------- Get Exploration Monster from List (tier-weighted; tier 5+ rarer) -------------------
// Picks one monster from the list using explorationTierWeights so tier 5+ appear less often.
function getExplorationMonsterFromList(monsters) {
  if (!monsters || monsters.length === 0) return null;
  const byTier = {};
  for (const m of monsters) {
    const t = m.tier >= 1 && m.tier <= 10 ? m.tier : 1;
    if (!byTier[t]) byTier[t] = [];
    byTier[t].push(m);
  }
  let totalWeight = 0;
  const tierWeights = [];
  for (let tier = 1; tier <= 10; tier++) {
    const list = byTier[tier];
    if (!list || list.length === 0) continue;
    const w = (explorationTierWeights[tier] ?? 0) * list.length;
    if (w > 0) {
      totalWeight += w;
      tierWeights.push({ tier, weight: totalWeight, list });
    }
  }
  if (totalWeight <= 0) return monsters[Math.floor(Math.random() * monsters.length)];
  const r = Math.random() * totalWeight;
  const chosen = tierWeights.find(({ weight }) => r < weight) || tierWeights[tierWeights.length - 1];
  const list = chosen.list;
  return list[Math.floor(Math.random() * list.length)];
}

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
// Normalizes region key to match MonsterModel field names (camelCase).
async function getMonstersByRegion(region) {
  try {
    const regionMapping = {
      'eldin': 'eldin',
      'lanayru': 'lanayru',
      'faron': 'faron',
      'centralhyrule': 'centralHyrule',
      'gerudo': 'gerudo',
      'hebra': 'hebra',
      'pathofscarletleaves': 'pathOfScarletLeaves',
      'leafdewway': 'leafDewWay'
    };
    const normalizedRegion = regionMapping[region?.toLowerCase()] || region;
    const query = { [normalizedRegion]: true };
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
async function attemptFlee(character, monster, options = {}) {
  try {
    const advantageAttempts = Math.max(1, options.advantageAttempts || 1);
    const originalFailedAttempts = character.failedFleeAttempts || 0;
    const baseFleeChance = 0.5;
    const bonusFleeChance = originalFailedAttempts * 0.05;
    
    // Apply Sneaky Elixir flee boost
    const { getActiveBuffEffects, shouldConsumeElixir, consumeElixirBuff } = require('./elixirModule');
    const buffEffects = getActiveBuffEffects(character);
    let elixirFleeBonus = 0;
    let sneakyElixirUsed = false;
    if (buffEffects && buffEffects.fleeBoost > 0) {
      elixirFleeBonus = buffEffects.fleeBoost * 0.15; // +15% per level
      sneakyElixirUsed = true;
      console.log(`[rngModule.js]: 👻 Sneaky Elixir flee boost: +${(elixirFleeBonus * 100).toFixed(0)}%`);
    }
    
    const fleeChance = Math.min(baseFleeChance + bonusFleeChance + elixirFleeBonus, 0.95);

    const rollSucceeds = () => Math.random() < fleeChance;

    let attemptsMade = 0;
    let success = false;

    while (attemptsMade < advantageAttempts) {
      attemptsMade += 1;
      if (rollSucceeds()) {
        success = true;
        break;
      }
    }

    if (success) {
      console.log(`[rngModule.js]: 🏃 ${character.name} fled from ${monster.name} (attempts: ${attemptsMade})${sneakyElixirUsed ? ' [Sneaky Elixir helped!]' : ''}`);
      
      // Consume Sneaky Elixir after successful flee if it was used
      if (sneakyElixirUsed && shouldConsumeElixir(character, 'travel')) {
        consumeElixirBuff(character);
        console.log(`[rngModule.js]: 🧪 Sneaky Elixir consumed after successful flee`);
      }
      
      character.failedFleeAttempts = 0;
      await character.save();
      return {
        success: true,
        message: sneakyElixirUsed ? "Your stealth helped you escape! You successfully fled!" : "You successfully fled!",
        attempts: attemptsMade,
        advantageApplied: advantageAttempts > 1,
        sneakyElixirUsed: sneakyElixirUsed
      };
    }

    character.failedFleeAttempts = originalFailedAttempts + 1;
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
      console.log(`[rngModule.js]: 💀 ${character.name} KO'd by ${monster.name} during flee (attempts: ${attemptsMade})`);
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
        message: "The monster attacked and knocked you out!",
        attempts: attemptsMade,
        advantageApplied: advantageAttempts > 1
      };
    }

    return {
      success: false,
      attacked: true,
      damage: monsterDamage,
      message: `The monster attacked and dealt ${monsterDamage} hearts of damage!`,
      attempts: attemptsMade,
      advantageApplied: advantageAttempts > 1
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
  getExplorationMonsterFromList,
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
