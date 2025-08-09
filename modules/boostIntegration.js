// ============================================================================
// ------------------- Boost Integration Helper Functions -------------------
// ============================================================================
// New file boostIntegration.js will be for applying effects to commands

const { applyBoostEffect } = require('./boostingModule');

// ------------------- applyBoostToAction -------------------
/**
 * Universal function to apply boost effects to any game action
 * @param {string} characterName - Name of the character performing action
 * @param {string} category - Boost category (Crafting, Gathering, etc.)
 * @param {*} data - The data to apply boost to
 * @param {*} additionalData - Optional additional data for specific boosts
 * @returns {*} Modified data with boost applied (if active)
 */
async function applyBoostToAction(characterName, category, data, additionalData = null) {
  try {
    // Check if character has an active boost for this category
    const { isBoostActive, getActiveBoostEffect } = require('../commands/jobs/boosting');
    const hasBoost = await isBoostActive(characterName, category);
    if (!hasBoost) {
      return data; // No boost active, return original data
    }

    // Get the boost effect
    const boostEffect = await getActiveBoostEffect(characterName, category);
    if (!boostEffect) {
      return data; // No valid boost effect found
    }

    // Get the booster character to determine job type
    const { retrieveBoostingRequestFromTempDataByCharacter } = require('../commands/jobs/boosting');
    const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
    
    if (!activeBoost) {
      return data;
    }

    // Apply the boost effect using the booster's job
    const boostedData = await applyBoostEffect(activeBoost.boostingCharacter, category, data, additionalData);
    
    return boostedData;
  } catch (error) {
    console.error(`[boostIntegration.js]: Error applying boost to ${characterName} for ${category}:`, error);
    return data; // Return original data on error to prevent breaking the action
  }
}

// ------------------- Specific Integration Functions -------------------

// For Crafting Commands
async function applyCraftingBoost(characterName, basePrice) {
  return await applyBoostToAction(characterName, 'Crafting', basePrice);
}

async function applyCraftingStaminaBoost(characterName, staminaCost) {
  return await applyBoostToAction(characterName, 'Crafting', staminaCost);
}

async function applyCraftingMaterialBoost(characterName, materials) {
  return await applyBoostToAction(characterName, 'Crafting', materials);
}

async function applyCraftingQuantityBoost(characterName, craftedItem) {
  return await applyBoostToAction(characterName, 'Crafting', craftedItem);
}

// For Gathering Commands  
async function applyGatheringBoost(characterName, gatherTable, targetVillage = null) {
  return await applyBoostToAction(characterName, 'Gathering', gatherTable, targetVillage);
}

// For Exploration Commands
async function applyExplorationBoost(characterName, explorationResult) {
  return await applyBoostToAction(characterName, 'Exploring', explorationResult);
}

async function applyExplorationBlightBoost(characterName, quadrantData) {
  return await applyBoostToAction(characterName, 'Exploring', quadrantData);
}

// For Healing Commands
async function applyHealingBoost(characterName, healingData) {
  return await applyBoostToAction(characterName, 'Healers', healingData);
}

async function applyHealingStaminaBoost(characterName, staminaCost) {
  return await applyBoostToAction(characterName, 'Healers', staminaCost);
}

// For Looting Commands
async function applyLootingBoost(characterName, lootRoll) {
  return await applyBoostToAction(characterName, 'Looting', lootRoll);
}

async function applyLootingDamageBoost(characterName, damageTaken) {
  return await applyBoostToAction(characterName, 'Looting', damageTaken);
}

async function applyLootingQuantityBoost(characterName, lootedItem) {
  return await applyBoostToAction(characterName, 'Looting', lootedItem);
}

// For Mount Commands
async function applyMountBoost(characterName, mountChance) {
  return await applyBoostToAction(characterName, 'Mounts', mountChance);
}

async function applyMountWeatherBoost(characterName, weatherConditions) {
  return await applyBoostToAction(characterName, 'Mounts', weatherConditions);
}

async function applyMountRerollBoost(characterName, mountAttempt) {
  return await applyBoostToAction(characterName, 'Mounts', mountAttempt);
}

// For Stealing Commands
async function applyStealingBoost(characterName, stealChance) {
  return await applyBoostToAction(characterName, 'Stealing', stealChance);
}

async function applyStealingJailBoost(characterName, jailTime) {
  return await applyBoostToAction(characterName, 'Stealing', jailTime);
}

async function applyStealingLootBoost(characterName, stealResult) {
  return await applyBoostToAction(characterName, 'Stealing', stealResult);
}

// For Token Commands
async function applyTokenBoost(characterName, baseTokens, isBuying = false) {
  return await applyBoostToAction(characterName, 'Tokens', baseTokens, isBuying);
}

// For Travel Commands
async function applyTravelBoost(characterName, travelData) {
  return await applyBoostToAction(characterName, 'Traveling', travelData);
}

async function applyTravelWeatherBoost(characterName, weatherBlock) {
  return await applyBoostToAction(characterName, 'Traveling', weatherBlock);
}

async function applyTravelGatherBoost(characterName, roadGathers) {
  return await applyBoostToAction(characterName, 'Traveling', roadGathers);
}

async function applyTravelEscapeBoost(characterName, escapeRolls) {
  return await applyBoostToAction(characterName, 'Traveling', escapeRolls);
}

// For Vending Commands
async function applyVendingBoost(characterName, vendingData) {
  return await applyBoostToAction(characterName, 'Vending', vendingData);
}

// For Other/Special Commands
async function applyOtherBoost(characterName, specialData) {
  return await applyBoostToAction(characterName, 'Other', specialData);
}

// ------------------- Boost Status Checker -------------------
/**
 * Check if a character has any active boost and return details
 * @param {string} characterName - Name of character to check
 * @returns {Object|null} Boost details if active, null if none
 */
async function getCharacterBoostStatus(characterName) {
  try {
    const { retrieveBoostingRequestFromTempDataByCharacter } = require('../commands/jobs/boosting');
    const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
    
    if (!activeBoost || activeBoost.status !== 'fulfilled') {
      return null;
    }

    const currentTime = Date.now();
    if (activeBoost.boostExpiresAt && currentTime > activeBoost.boostExpiresAt) {
      return null; // Boost expired
    }

    // Derive boost name if available in stored effect string: "<name> — <description>"
    let boostName = null;
    if (typeof activeBoost.boostEffect === 'string') {
      const parts = activeBoost.boostEffect.split(' — ');
      if (parts.length > 0) {
        boostName = parts[0].trim();
      }
    }

    return {
      boosterName: activeBoost.boostingCharacter,
      boosterJob: activeBoost.boosterJob,
      category: activeBoost.category,
      boostName,
      expiresAt: activeBoost.boostExpiresAt,
      timeRemaining: activeBoost.boostExpiresAt - currentTime,
      targetVillage: activeBoost.targetVillage // For Scholar boosts
    };
  } catch (error) {
    console.error(`[boostIntegration.js]: Error checking boost status for ${characterName}:`, error);
    return null;
  }
}

// ------------------- Boost Notification Helper -------------------
/**
 * Add boost notification to command responses
 * @param {Object} embed - Discord embed to modify
 * @param {string} characterName - Character name to check
 * @param {string} category - Action category
 */
async function addBoostNotificationToEmbed(embed, characterName, category) {
  try {
    const boostStatus = await getCharacterBoostStatus(characterName);
    
    if (boostStatus && boostStatus.category === category) {
      const hoursRemaining = Math.floor(boostStatus.timeRemaining / (1000 * 60 * 60));
      const minutesRemaining = Math.floor((boostStatus.timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
      
      embed.addFields({
        name: '✨ Active Boost',
        value: `Boosted by **${boostStatus.boosterName}** (${boostStatus.boosterJob})\nTime remaining: ${hoursRemaining}h ${minutesRemaining}m`,
        inline: false
      });
    }
  } catch (error) {
    console.error(`[boostIntegration.js]: Error adding boost notification:`, error);
    // Don't throw - just skip the notification
  }
}

module.exports = {
  applyBoostToAction,
  applyCraftingBoost,
  applyCraftingStaminaBoost,
  applyCraftingMaterialBoost,
  applyCraftingQuantityBoost,
  applyGatheringBoost,
  applyExplorationBoost,
  applyExplorationBlightBoost,
  applyHealingBoost,
  applyHealingStaminaBoost,
  applyLootingBoost,
  applyLootingDamageBoost,
  applyLootingQuantityBoost,
  applyMountBoost,
  applyMountWeatherBoost,
  applyMountRerollBoost,
  applyStealingBoost,
  applyStealingJailBoost,
  applyStealingLootBoost,
  applyTokenBoost,
  applyTravelBoost,
  applyTravelWeatherBoost,
  applyTravelGatherBoost,
  applyTravelEscapeBoost,
  applyVendingBoost,
  applyOtherBoost,
  getCharacterBoostStatus,
  addBoostNotificationToEmbed
}; 