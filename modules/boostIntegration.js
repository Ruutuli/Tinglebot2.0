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
  } catch (err) {
    console.error(`Failed to apply boost to ${characterName} for ${category}:`, err);
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

async function applyCraftingMaterialBoost(characterName, materials, craftQuantity = 1) {
  return await applyBoostToAction(characterName, 'Crafting', materials, craftQuantity);
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
// Apply healing amount boost (Entertainer: +1 heart on KO revival)
async function applyHealingBoost(characterName, baseHealing, wasKO = false) {
  const hasBoost = await checkBoostActive(characterName, 'Healers');
  if (!hasBoost) return baseHealing;
  
  const booster = await getBoosterInfo(characterName);
  if (!booster) return baseHealing;
  
  // Only Entertainer affects healing amount (Song of Healing)
  if (booster.job === 'Entertainer' && wasKO) {
    const boostedHealing = await applyBoostEffect('Entertainer', 'Healers', baseHealing, wasKO);
    return boostedHealing;
  }
  
  return baseHealing;
}

// Apply stamina cost boost (Fortune Teller: 50% less stamina)
async function applyHealingStaminaBoost(characterName, baseStaminaCost) {
  const logger = require('../utils/logger');
  
  const hasBoost = await checkBoostActive(characterName, 'Healers');
  
  if (!hasBoost) {
    // No boost active - return original stamina cost
    return baseStaminaCost;
  }

  const booster = await getBoosterInfo(characterName);
  
  if (!booster) {
    // Boost check returned true but no booster info found - return original cost
    logger.warn('BOOST', `[applyHealingStaminaBoost] ERROR: Boost check returned true for ${characterName} but getBoosterInfo returned null!`);
    return baseStaminaCost;
  }
  
  // Only Fortune Teller affects stamina cost (Predictive Healing)
  if (booster.job === 'Fortune Teller') {
    const boostedStamina = await applyBoostEffect('Fortune Teller', 'Healers', baseStaminaCost);
    logger.info('BOOST', `[applyHealingStaminaBoost] Fortune Teller boost applied to ${characterName}: ${baseStaminaCost} -> ${boostedStamina} stamina`);
    return boostedStamina;
  }
  
  // Boost active but not Fortune Teller - return original cost
  return baseStaminaCost;
}

// Apply post-healing effects (Priest, Scholar, Teacher)
async function applyPostHealingBoosts(healerName, patientName) {
  const hasBoost = await checkBoostActive(healerName, 'Healers');
  if (!hasBoost) return null;
  
  const booster = await getBoosterInfo(healerName);
  if (!booster) return null;
  
  const { fetchCharacterByName } = require('../database/db');
  const patient = await fetchCharacterByName(patientName);
  
  if (!patient) return null;
  
  // Priest: Spiritual Cleanse (remove debuffs)
  if (booster.job === 'Priest') {
    const cleansedPatient = await applyBoostEffect('Priest', 'Healers', patient);
    if (cleansedPatient && cleansedPatient._id) {
      await cleansedPatient.save();
      return { type: 'Priest', patient: cleansedPatient };
    }
  }
  
  return null;
}

// Apply Scholar stamina recovery boost (both healer and recipient get +1 stamina)
async function applyScholarHealingBoost(healerName, recipientName) {
  const hasBoost = await checkBoostActive(healerName, 'Healers');
  if (!hasBoost) return null;
  
  const booster = await getBoosterInfo(healerName);
  if (!booster || booster.job !== 'Scholar') return null;
  
  const { fetchCharacterByName } = require('../database/db');
  const healer = await fetchCharacterByName(healerName);
  const recipient = await fetchCharacterByName(recipientName);
  
  if (!healer || !recipient) return null;
  
  const healingData = { healer, recipient };
  const boostedData = await applyBoostEffect('Scholar', 'Healers', healingData);
  
  if (boostedData && boostedData.healer && boostedData.recipient) {
    await boostedData.healer.save();
    await boostedData.recipient.save();
    return boostedData;
  }
  
  return null;
}

// Apply Teacher temp hearts boost
async function applyTeacherHealingBoost(patientName) {
  const { fetchCharacterByName } = require('../database/db');
  const { retrieveBoostingRequestFromTempDataByCharacter } = require('../commands/jobs/boosting');
  
  // Find who is healing this patient (we need to check the healer's boost, not patient's)
  // This is called from heal.js where we know the healer, so we pass healerName separately
  // Actually, this function will be called with the healer context
  return null; // Will be handled in heal.js directly
}

// Helper function to check if boost is active
async function checkBoostActive(characterName, category) {
  const logger = require('../utils/logger');
  try {
    const { isBoostActive } = require('../commands/jobs/boosting');
    
    const result = await isBoostActive(characterName, category);
    return result;
  } catch (err) {
    logger.error('BOOST', `[checkBoostActive] Error checking boost for ${characterName}: ${err.message}`);
    return false;
  }
}

// Helper function to get booster info
async function getBoosterInfo(characterName) {
  const logger = require('../utils/logger');
  try {
    const { retrieveBoostingRequestFromTempDataByCharacter } = require('../commands/jobs/boosting');
    const { fetchCharacterByName } = require('../database/db');
    
    const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
    if (!activeBoost) {
      return null;
    }
    
    if (activeBoost.status !== 'fulfilled') {
      return null;
    }
    
    const currentTime = Date.now();
    if (activeBoost.boostExpiresAt && currentTime > activeBoost.boostExpiresAt) {
      return null; // Boost expired
    }
    
    const booster = await fetchCharacterByName(activeBoost.boostingCharacter);
    if (!booster) {
      logger.warn('BOOST', `[getBoosterInfo] ERROR: Could not find booster character "${activeBoost.boostingCharacter}" from database`);
      return null;
    }
    
    const boosterJob = booster.job || activeBoost.boosterJob;
    
    return {
      name: booster.name,
      job: boosterJob
    };
  } catch (err) {
    logger.error('BOOST', `[getBoosterInfo] Error getting booster info for ${characterName}: ${err.message}`);
    return null;
  }
}

// For Looting Commands
async function applyLootingBoost(characterName, lootRoll) {
  return await applyBoostToAction(characterName, 'Looting', lootRoll);
}

async function applyLootingDamageBoost(characterName, damageTaken, monsterTier = 1) {
  return await applyBoostToAction(characterName, 'Looting', damageTaken, monsterTier);
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
  } catch (err) {
    console.error(`Failed to check boost status for ${characterName}:`, err);
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
  } catch (err) {
    console.error(`Failed to add boost notification:`, err);
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
  applyPostHealingBoosts,
  applyScholarHealingBoost,
  applyTeacherHealingBoost,
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