// ============================================================================
// ------------------- Imports and Dependencies -------------------
// ============================================================================

const { v4: uuidv4 } = require('uuid');
const logger = require('@/utils/logger');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
 fetchCharacterByNameAndUserId,
 fetchCharacterByName,
 fetchModCharacterByNameAndUserId,
 fetchModCharacterByName,
 fetchAllItems,
 getCharacterInventoryCollection,
} = require('@/database/db');
const { getBoostEffect, normalizeJobName } = require('../../modules/boostingModule');
const { getJobPerk } = require('../../modules/jobsModule');
const { deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');
const { removeItemInventoryDatabase } = require('@/utils/inventoryUtils');
const { useStamina } = require('../../modules/characterStatsModule');
const { generateUniqueId } = require('@/utils/uniqueIdUtils');
const TempData = require('@/models/TempDataModel');
const { retrieveBoostingRequestFromStorageByCharacter } = require('@/utils/storage');
const {
  createBoostRequestEmbed,
  updateBoostRequestEmbed,
  createBoostAppliedEmbed,
} = require('../../embeds/embeds.js');
const Weather = require('@/models/WeatherModel');
const {
  simulateWeightedWeather,
  getCurrentSeason,
  scheduleSpecialWeather,
  getNextPeriodBounds,
  findWeatherForPeriod,
} = require('@/services/weatherService');
// ============================================================================
// ------------------- Constants and Configuration -------------------
// ============================================================================

const BOOST_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const REQUEST_EXPIRATION = 48 * 60 * 60 * 1000; // 48 hours in milliseconds
const TESTING_CHANNEL_ID = '1391812848099004578';
const BOOSTING_ACCEPT_COMMAND_MENTION = '</boosting accept:1433351189185171456>';
const BOOSTING_CANCEL_COMMAND_MENTION = '</boosting cancel:1429961744716927038>';

const EXEMPT_CATEGORIES = [
 "Tokens",
 "Exploring", 
 "Traveling",
 "Mounts",
 "Other",
];

const BOOST_CATEGORIES = [
  { name: "Looting", value: "Looting" },
  { name: "Gathering", value: "Gathering" },
  { name: "Crafting", value: "Crafting" },
  { name: "Healer", value: "Healers" },
  { name: "Stealing", value: "Stealing" },
  { name: "Tokens", value: "Tokens" },
  { name: "Traveling", value: "Traveling" }
];

const SONG_OF_STORMS_ENABLED = false; // Set to true to enable Song of Storms
const SONG_OF_STORMS_VILLAGES = ['Rudania', 'Inariko', 'Vhintl'];
// Lightning Storm excluded by design (in weatherData.specials but not choosable for Song of Storms).
const SONG_OF_STORMS_SPECIAL_WEATHER = [
  "Avalanche",
  "Blight Rain",
  "Drought",
  "Fairy Circle",
  "Flood",
  "Flower Bloom",
  "Jubilee",
  "Meteor Shower",
  "Muggy",
  "Rock Slide",
];

const WEATHER_EMBED_COLORS = {
 Rudania: 0xd7342a,
 Inariko: 0x277ecd,
 Vhintl: 0x25c059,
};

function resolveVillageName(input) {
 if (!input || typeof input !== 'string') {
  return null;
 }

 const stripped = input
  .replace(/\(.*?\)/g, '')
  .replace(/current\s*village/gi, '')
  .replace(/home\s*village/gi, '')
  .replace(/hometown/gi, '')
  .replace(/—/g, ' ')
  .replace(/-/g, ' ')
  .trim();

 const lower = stripped.toLowerCase();
 return (
  SONG_OF_STORMS_VILLAGES.find(
   (village) => lower === village.toLowerCase() || lower.includes(village.toLowerCase())
  ) || null
 );
}

const OTHER_BOOST_CHOICES = [
  { name: "Fortune Teller — Weather Prediction", value: "fortune_teller" },
  { name: "Entertainer — Song of Storms", value: "entertainer" },
];

// ------------------- Embed Helpers -------------------
function createOtherBoostErrorEmbed(options = {}) {
 const {
  title = "❌ Unable to Use Boost",
  description = "Something went wrong while trying to use this boost.",
  suggestions = [],
  context = [],
  footer = "Need help? Ping a moderator and share this message.",
 } = options;

 const embed = new EmbedBuilder()
  .setTitle(title)
  .setDescription(description)
  .setColor("#E74C3C")
  .setImage("https://storage.googleapis.com/tinglebot/Graphics/border.png")
  .setFooter({ text: footer });

 if (Array.isArray(context) && context.length > 0) {
  embed.addFields(context);
 }

 if (Array.isArray(suggestions) && suggestions.length > 0) {
  embed.addFields({
   name: "How to Resolve",
   value: suggestions.map((suggestion) => `• ${suggestion}`).join("\n"),
   inline: false,
  });
 }

 return embed;
}

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

/**
 * Fetches a character by name and user ID, trying both regular and mod characters
 */
async function fetchCharacterWithFallback(characterName, userId) {
 let character = await fetchCharacterByNameAndUserId(characterName, userId);
 
 if (!character) {
   character = await fetchModCharacterByNameAndUserId(characterName, userId);
 }
 
 return character;
}

/**
 * Fetches a character by name only, trying both regular and mod characters
 */
async function fetchCharacterByNameWithFallback(characterName) {
 let character = await fetchCharacterByName(characterName);
 
 if (!character) {
   character = await fetchModCharacterByName(characterName);
 }
 
 return character;
}

/**
 * Validates if a character can request a boost for a specific category
 * Note: Target characters should be able to request any boost category since they're being boosted
 * The booster character's job validation happens in validateBoostEffect
 */
function validateBoostRequest(targetCharacter, category) {
 // Target characters can request any boost category since they're the ones being boosted
 // The booster character's job determines what boosts they can provide
 return { valid: true };
}

// ------------------- Boosting Utilities -------------------
// These functions provide helper methods for handling boost requests, including ID generation, category validation, formatting, and fetching active boosts.

/**
 * Generates a clean boost request ID (an 8-character uppercase string).
 */
function generateBoostRequestId() {
  return uuidv4().slice(0, 8).toUpperCase();
}

/**
 * Determines if the provided boost category is exempt from job perk validation.
 */
function isExemptBoostCategory(category) {
  return EXEMPT_CATEGORIES.includes(category);
}

/**
 * Validates if a character's job permits requesting a boost in the given category.
 * Returns true if the category is exempt, or if the character's job includes the category perk; otherwise, false.
 */
function validateBoostEligibility(character, category, getJobPerk) {
  if (isExemptBoostCategory(category)) return true;
  const jobPerk = getJobPerk(character.job);
  if (!jobPerk || !jobPerk.perks.includes(category.toUpperCase())) return false;
  return true;
}

/**
 * Formats a boost category name for display by capitalizing the first letter and lowercasing the remainder.
 */
function formatBoostCategoryName(category) {
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

/**
 * Gets the effective job for a character, using jobVoucherJob if a voucher is active, otherwise the regular job.
 */
function getEffectiveJob(character) {
  return (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job;
}

// ------------------- Formatting Helpers -------------------
function formatDuration(durationMs) {
  if (!durationMs || durationMs <= 0) {
    return '0m';
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) {
    parts.push(`${hours}h`);
  }
  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes}m`);
  }
  if (hours === 0 && minutes === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}

function parseStoredBoostEffect(effectString) {
  if (!effectString || typeof effectString !== 'string') {
    return { name: 'Unknown', description: 'N/A' };
  }

  const [rawName, rawDescription] = effectString.split('—').map(part => part.trim());
  return {
    name: rawName || 'Unknown',
    description: rawDescription || 'N/A'
  };
}

// ------------------- Boost Lookup Helpers -------------------
async function getPendingBoostRequestForCharacter(characterName) {
  try {
    const allBoostingData = await TempData.findAllByType('boosting');
    const pendingRequests = [];

    for (const tempData of allBoostingData) {
      const requestData = tempData?.data;
      if (!requestData || requestData.targetCharacter !== characterName) {
        continue;
      }
      if (requestData.status !== 'pending') {
        continue;
      }

      pendingRequests.push({
        ...requestData,
        tempExpiresAt: tempData.expiresAt ? tempData.expiresAt.getTime() : null,
        tempCreatedAt: tempData.createdAt ? tempData.createdAt.getTime() : null
      });
    }

    if (pendingRequests.length === 0) {
      return null;
    }

    pendingRequests.sort((a, b) => {
      const aTime = typeof a.timestamp === 'number' ? a.timestamp : (a.tempCreatedAt || 0);
      const bTime = typeof b.timestamp === 'number' ? b.timestamp : (b.tempCreatedAt || 0);
      return bTime - aTime;
    });

    return pendingRequests[0];
  } catch (error) {
    logger.error('BOOST', `Error retrieving pending boost for ${characterName}:`, error);
    return null;
  }
}

function stripTempMetaFields(requestData) {
  const cleaned = { ...requestData };
  delete cleaned.tempExpiresAt;
  delete cleaned.tempCreatedAt;
  return cleaned;
}

/**
 * Asynchronously retrieves an active boost for a character based on character name and boost category.
 * Returns the boost request if it exists, is fulfilled, and the category matches; otherwise, null.
 */
async function fetchActiveBoost(characterName, category) {
  const request = retrieveBoostingRequestFromStorageByCharacter(characterName);
  if (!request) return null;
  if (request.status !== 'accepted') return null;
  if (request.category !== category) return null;
  return request;
}

/**
 * Validates boost effect for a job and category
 */
function validateBoostEffect(boosterJob, category) {
 const boost = getBoostEffect(boosterJob, category);
 if (!boost) {
   // Special handling for Healer job - they don't provide boosts, they receive them
   if (boosterJob && boosterJob.toLowerCase() === 'healer') {
     return {
       valid: false,
       error: `❌ **Invalid Booster Job**\n\n**Healer** characters cannot provide boosts. Only **Fortune Teller**, **Teacher**, **Priest**, **Entertainer**, and **Scholar** can provide boosts.\n\n💡 **Tip:** Select a character with one of the boosting jobs to provide the boost.`
     };
   }
   
   // Display user-friendly category name
   const categoryDisplayName = category === 'Healers' ? 'Healer' : category;
   
   return {
     valid: false,
     error: `❌ **No Boost Available**\n\n**${boosterJob}** doesn't have a boost effect for the **${categoryDisplayName}** category.\n\n💡 **Tip:** Only certain jobs can provide boosts for specific categories. Check the boost descriptions to see which jobs can boost each category.`
   };
 }
  // Handle passive boosts that shouldn't be requested manually
  if (boost.passive) {
    return {
      valid: false,
      error: `🎭 **Passive Boost**\n\n**${boosterJob}**'s **${boost.name}** is a passive effect and triggers automatically when the Entertainer participates in the quest.\n\n💡 No manual boost request or usage is required—just include the Entertainer in the RP quest.`
    };
  }
 return { valid: true, boost };
}

/**
 * Validates village parameter for Scholar Gathering boosts
 */
function validateScholarVillageParameter(boosterJob, category, village) {
 // Normalize job name for case-insensitive comparison
 const normalizedJob = boosterJob.toLowerCase();
 
 if (village && (normalizedJob !== 'scholar' || category !== 'Gathering')) {
   return {
     valid: false,
     error: "❌ **Invalid Parameter**\n\nThe village option is only available for Scholar Gathering boosts."
   };
 }

 if (normalizedJob === 'scholar' && category === 'Gathering' && !village) {
   return {
     valid: false,
     error: "❌ **Scholar Gathering Boost Requires Target Village**\n\n**Cross-Region Insight** allows Scholar-boosted characters to gather items from another village's item table without physically being there.\n\n💡 **Please specify a target village** using the `village` option to enable cross-region gathering.\n\n**Example:** `/boosting request character:YourChar booster:ScholarName category:Gathering village:Inariko`"
   };
 }

 return { valid: true };
}

/**
 * Validates if a character already has a pending boost request
 * Note: Characters can request new boosts even if they have an active fulfilled boost
 */
async function validateActiveBoost(targetCharacter) {
 try {
   // Check TempData directly for any pending boost requests
   const allBoostingData = await TempData.findAllByType('boosting');
   const currentTime = Date.now();
   
   for (const tempData of allBoostingData) {
     const requestData = tempData.data;
     
     // Check if this is a boost request for the target character
     if (requestData.targetCharacter === targetCharacter.name) {
        // Skip cancelled and fulfilled requests
        if (requestData.status === "cancelled" || requestData.status === "fulfilled") {
          continue;
        }

        // Block if there is a pending request that hasn't expired
        if (requestData.status === "pending") {
          if (!requestData.expiresAt || currentTime <= requestData.expiresAt) {
            return {
              valid: false,
              error: `❌ **Pending Boost Request Found**\n\n**${targetCharacter.name}** already has a pending boost request from **${requestData.boostingCharacter}**.\n\n💡 **Tip:** You can only have one boost request at a time. Wait for the current request to be fulfilled, cancelled, or expire before requesting a new one.`
            };
          }
        }

        // Block if there is an accepted boost that has not expired
        if (requestData.status === "accepted") {
          // If boostExpiresAt exists and is in the future, block
          if (requestData.boostExpiresAt && currentTime <= requestData.boostExpiresAt) {
            return {
              valid: false,
              error: `❌ **Active Boost Found**\n\n**${targetCharacter.name}** is already boosted by **${requestData.boostingCharacter}** for **${requestData.category}**.\n\n💡 **Tip:** You can request a new boost after the current one is fulfilled, cancelled, or expires.`
            };
          }
          // If accepted but missing expiresAt, conservatively block
          if (!requestData.boostExpiresAt) {
            return {
              valid: false,
              error: `❌ **Active Boost Found**\n\n**${targetCharacter.name}** currently has an accepted boost from **${requestData.boostingCharacter}**.\n\n💡 **Tip:** Finish using the current boost or cancel it before requesting a new one.`
            };
          }
        }
     }
   }
   
   // Allow requesting new boosts - don't block on active fulfilled boosts
   return { valid: true };
 } catch (error) {
   logger.error('BOOST', `Error validating active boost for ${targetCharacter.name}:`, error);
   // On error, allow the request to proceed (better to allow than block incorrectly)
   return { valid: true };
 }
}

/**
 * Validates village compatibility between characters
 */
function validateVillageCompatibility(targetCharacter, boosterCharacter, isTestingChannel) {
 if (
   targetCharacter.currentVillage.toLowerCase() !== boosterCharacter.currentVillage.toLowerCase() &&
   !isTestingChannel
 ) {
   return {
     valid: false,
     error: "❌ **Village Mismatch**\n\nBoth characters must be in the same village.\n\n💡 **Travel Tip:** Use </travel:1379850586987430009> to travel between villages and access characters in different locations!"
   };
 }

 return { valid: true };
}

/**
 * Creates boost request data object
 */
function createBoostRequestData(targetCharacter, boosterCharacter, category, village, userId) {
 const boostRequestId = generateUniqueId('B');
 const currentTime = Date.now();
 const boosterJob = getEffectiveJob(boosterCharacter);
 const boost = getBoostEffect(boosterJob, category);

 return {
   boostRequestId,
   targetCharacter: targetCharacter.name,
   boostingCharacter: boosterCharacter.name,
   category,
   status: "pending",
   requesterUserId: userId,
   village: targetCharacter.currentVillage,
   targetVillage: village,
   timestamp: currentTime,
   createdAt: new Date().toISOString(),
   durationRemaining: null,
   fulfilledAt: null,
   boosterJob: boosterJob,
   boostEffect: `${boost.name} — ${boost.description}`,
   requestedByIcon: targetCharacter.icon,
   boosterIcon: boosterCharacter.icon
 };
}

/**
 * Creates embed data for boost request
 */
function createBoostRequestEmbedData(targetCharacter, boosterCharacter, category, village, boost) {
 const boosterJob = getEffectiveJob(boosterCharacter);
 return {
   requestedBy: targetCharacter.name,
   booster: boosterCharacter.name,
   boosterJob: boosterJob,
   category: category,
   boostEffect: `${boost.name} — ${boost.description}`,
   village: targetCharacter.currentVillage,
   targetVillage: village,
   requestedByIcon: targetCharacter.icon,
   boosterIcon: boosterCharacter.icon
 };
}

/**
 * Creates embed data for boost applied
 */
function createBoostAppliedEmbedData(booster, targetCharacter, requestData, boost) {
 const boosterJob = getEffectiveJob(booster);
 return {
   boostedBy: booster.name,
   boosterJob: boosterJob,
   target: requestData.targetCharacter,
   category: requestData.category,
   effect: boost.description,
   boostName: boost.name,
   village: requestData.village,
   boostedByIcon: booster.icon,
   targetIcon: targetCharacter.icon,
   boosterStamina: booster.currentStamina,
   boosterHearts: booster.currentHearts,
   boosterMaxStamina: booster.maxStamina,
   boosterMaxHearts: booster.maxHearts,
   boostRequestId: requestData.boostRequestId,
   status: requestData.status || 'accepted'
 };
}

// ============================================================================
// ------------------- TempData Storage Functions -------------------
// ============================================================================

async function saveBoostingRequestToTempData(requestId, requestData) {
  try {
    // First try to find existing document
    let tempData = await TempData.findOne({ type: 'boosting', key: requestId });
    
    if (tempData) {
      // Update existing document
      tempData.data = requestData;
    } else {
      // Create new document with explicit expiresAt
      const expiresAt = new Date(Date.now() + REQUEST_EXPIRATION);
      tempData = new TempData({
        type: 'boosting',
        key: requestId,
        data: requestData,
        expiresAt: expiresAt
      });
    }
    
    // Save the document (this will trigger pre-save middleware)
    await tempData.save();
  } catch (error) {
    logger.error('BOOST', 'Error saving boosting request to TempData:', error);
    throw error;
  }
}

async function retrieveBoostingRequestFromTempData(requestId) {
  try {
    const tempData = await TempData.findByTypeAndKey('boosting', requestId);
    if (tempData) {
      return tempData.data;
    } else {
      return null;
    }
  } catch (error) {
    logger.error('BOOST', 'Error retrieving boosting request from TempData:', error);
    return null;
  }
}

async function retrieveBoostingRequestFromTempDataByCharacter(characterName) {
  try {
    const allBoostingData = await TempData.findAllByType('boosting');
    const currentTime = Date.now();

    // Find all active boosts for this character and sort by timestamp (most recent first)
    const activeBoosts = [];
    
    for (const tempData of allBoostingData) {
      const requestData = tempData.data;
      
      if (
        requestData.targetCharacter === characterName &&
        requestData.status === "accepted" &&
        requestData.boostExpiresAt &&
        currentTime <= requestData.boostExpiresAt
      ) {
        activeBoosts.push({
          requestData,
          timestamp: requestData.timestamp || 0
        });
      } else if (
        requestData.targetCharacter === characterName &&
        requestData.status === "accepted" &&
        requestData.boostExpiresAt &&
        currentTime > requestData.boostExpiresAt
      ) {
        // Mark expired boosts as expired
        requestData.status = "expired";
        await saveBoostingRequestToTempData(requestData.boostRequestId, requestData);
        
        // Clear the boostedBy field from the character when boost expires
        const targetCharacter = await fetchCharacterByName(characterName);
        if (targetCharacter && targetCharacter.boostedBy) {
          targetCharacter.boostedBy = null;
          await targetCharacter.save();
        }
      }
    }

    // Sort by timestamp (most recent first) and return the most recent active boost
    if (activeBoosts.length > 0) {
      activeBoosts.sort((a, b) => b.timestamp - a.timestamp);
      const mostRecentBoost = activeBoosts[0].requestData;
      
      // Self-repair: If TempData shows an active boost but character's boostedBy is null,
      // restore it to ensure consistency
      const targetCharacter = await fetchCharacterByName(characterName);
      if (targetCharacter && !targetCharacter.boostedBy && mostRecentBoost.boostingCharacter) {
        logger.info('BOOST', `Restoring boostedBy for ${characterName} (was null but TempData shows active boost from ${mostRecentBoost.boostingCharacter})`);
        targetCharacter.boostedBy = mostRecentBoost.boostingCharacter;
        await targetCharacter.save();
      }
      
      return mostRecentBoost;
    }

    return null;
  } catch (error) {
    logger.error('BOOST', `Error retrieving active boost for ${characterName}:`, error);
    return null;
  }
}

/**
 * Find the active (accepted, not expired) boost where the given character is the booster.
 */
async function retrieveBoostingRequestFromTempDataByBooster(boosterCharacterName) {
  try {
    const allBoostingData = await TempData.findAllByType('boosting');
    const currentTime = Date.now();
    for (const tempData of allBoostingData) {
      const requestData = tempData.data;
      if (
        requestData.boostingCharacter === boosterCharacterName &&
        requestData.status === 'accepted' &&
        requestData.boostExpiresAt &&
        currentTime <= requestData.boostExpiresAt
      ) {
        return requestData;
      }
    }
    return null;
  } catch (error) {
    logger.error('BOOST', `Error retrieving active boost by booster ${boosterCharacterName}:`, error);
    return null;
  }
}

// ============================================================================
// ------------------- Boost Utility Functions -------------------
// ============================================================================

async function isBoostActive(characterName, category) {
 const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);

 if (!activeBoost || activeBoost.status !== "accepted") {
  return false;
 }

 if (activeBoost.category !== category) {
  return false;
 }

 const currentTime = Date.now();
 if (activeBoost.boostExpiresAt && currentTime > activeBoost.boostExpiresAt) {
  return false;
 }

 return true;
}

async function getActiveBoostEffect(characterName, category) {
 if (!(await isBoostActive(characterName, category))) {
  return null;
 }

 const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
 const boosterCharacter = await fetchCharacterByName(activeBoost.boostingCharacter);
 if (!boosterCharacter) {
  logger.error('BOOST', `Could not find booster character "${activeBoost.boostingCharacter}"`);
  return null;
 }
 const boosterJob = getEffectiveJob(boosterCharacter);
 return getBoostEffect(boosterJob, category);
}

async function getRemainingBoostTime(characterName, category) {
 if (!(await isBoostActive(characterName, category))) {
  return 0;
 }

 const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
 const currentTime = Date.now();
 return Math.max(0, activeBoost.boostExpiresAt - currentTime);
}

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================

function configureOtherBoostSubcommand(subcommand) {
  return subcommand
    .setName("other")
    .setDescription("Use your 'Other' category boost (Fortune Teller: Weather Prediction, Entertainer: Song of Storms)")
    .addStringOption((option) =>
      option
        .setName("charactername")
        .setDescription("Your character name (must be boosted with 'Other' category)")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("effect")
        .setDescription("Choose which 'Other' boost effect to use")
        .setRequired(false)
        .addChoices(...OTHER_BOOST_CHOICES)
    )
    .addStringOption((option) =>
      option
        .setName("village")
        .setDescription("Target village (for weather prediction/storm)")
        .setRequired(false)
        .setAutocomplete(true)
    );
}

module.exports = {
 data: new SlashCommandBuilder()
  .setName("boosting")
  .setDescription("Manage character boosts")
  .addSubcommand((subcommand) =>
   subcommand
    .setName("request")
    .setDescription("Request a character to boost you")
    .addStringOption((option) =>
     option
      .setName("character")
      .setDescription("Your character (the one receiving the boost)")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("booster")
      .setDescription("Name of the character who will provide the boost")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("category")
      .setDescription("Category to be boosted")
      .setRequired(true)
      .addChoices(...BOOST_CATEGORIES)
    )
    .addStringOption((option) =>
     option
      .setName("village")
      .setDescription("Target village for Scholar's Cross-Region Insight (only for Scholar Gathering boosts)")
      .setRequired(false)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("accept")
    .setDescription("Accept and fulfill a boost request")
    .addStringOption((option) =>
     option
      .setName("requestid")
      .setDescription("The ID of the boost request")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("character")
      .setDescription("Your boosting character")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("status")
    .setDescription("Check active boost status for your character")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Your character name")
      .setRequired(true)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) => configureOtherBoostSubcommand(subcommand))
  .addSubcommand((subcommand) =>
   subcommand
    .setName("cancel")
    .setDescription("Cancel a pending boost request or active boost")
    .addStringOption((option) =>
     option
      .setName("requestid")
      .setDescription("The ID of the boost request to cancel")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("Character name (use if you don't have the request ID)")
      .setRequired(false)
      .setAutocomplete(true)
    )
  ),

// ============================================================================
// ------------------- Command Execution -------------------
// ============================================================================

 async execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "request") {
   await handleBoostRequest(interaction);
  } else if (subcommand === "accept") {
   await handleBoostAccept(interaction);
  } else if (subcommand === "status") {
   await handleBoostStatus(interaction);
  } else if (subcommand === "other") {
   await handleBoostOther(interaction);
  } else if (subcommand === "cancel") {
   await handleBoostCancel(interaction);
  }
 },
};

// ============================================================================
// ------------------- Subcommand Handlers -------------------
// ============================================================================

async function handleBoostRequest(interaction) {
 // Defer the reply immediately to prevent interaction timeout
 await interaction.deferReply({ ephemeral: false });

 // Helper function to safely respond to interaction
 const safeReply = async (content, options = {}) => {
  try {
   if (!interaction.isRepliable()) {
    logger.warn('BOOST', 'Interaction not repliable');
    return;
   }
   
   if (interaction.replied || interaction.deferred) {
    await interaction.editReply(content);
   } else {
    await interaction.reply(content);
   }
  } catch (error) {
   if (error.code === 10062) {
    // Interaction has expired, try followUp instead
    try {
     await interaction.followUp(content);
    } catch (followUpError) {
     logger.error('BOOST', 'Failed to send followUp message');
    }
   } else {
    throw error;
   }
  }
 };

 const characterName = interaction.options.getString("character");
 const boosterName = interaction.options.getString("booster");
 const category = interaction.options.getString("category");
 const village = interaction.options.getString("village");
 const userId = interaction.user.id;

 // Fetch characters with fallback
 const targetCharacter = await fetchCharacterWithFallback(characterName, userId);
 const boosterCharacter = await fetchCharacterByNameWithFallback(boosterName);

 if (!targetCharacter || !boosterCharacter) {
  logger.error('BOOST',
   `[boosting.js]: Error - One or both characters could not be found. Inputs: character="${characterName}", booster="${boosterName}"`
  );
  await safeReply({
   content: "One or both characters could not be found.",
   ephemeral: true,
  });
  return;
 }

 // Validate active boost
 const activeBoostValidation = await validateActiveBoost(targetCharacter);
 if (!activeBoostValidation.valid) {
  logger.debug('BOOST', '[Validation] Active boost already present; notifying user without logging full message.');
  // Build a helpful embed with options to cancel, use, or wait for expiry
  const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(targetCharacter.name);
  const boosterName = activeBoost?.boostingCharacter || boosterCharacter?.name || "their booster";
  const boostCategory = activeBoost?.category || category;
  const expiresAt = activeBoost?.boostExpiresAt ? Math.floor(activeBoost.boostExpiresAt / 1000) : null;
  const requestId = activeBoost?.boostRequestId;

  // Get boost effect information
  const boosterChar = await fetchCharacterByNameWithFallback(boosterName);
  const boosterJob = boosterChar ? getEffectiveJob(boosterChar) : (activeBoost?.boosterJob || "Unknown");
  const boostEffect = getBoostEffect(boosterJob, boostCategory);
  const storedEffect = parseStoredBoostEffect(activeBoost?.boostEffect);
  const boostName = boostEffect?.name || storedEffect.name;
  const boostDescription = boostEffect?.description || storedEffect.description;

  const descriptionLines = [
    `**${targetCharacter.name}** is already boosted by **${boosterName}** for **${boostCategory}**.`,
    "",
    "💡 **Tip:** You can cancel the current boost, use it now, or wait for it to expire."
  ];

  const fields = [];
  
  // Add boost effect information
  if (boostName && boostName !== 'Unknown') {
    fields.push({ 
      name: "✨ Active Boost", 
      value: `**${boostName}**\n${boostDescription}`, 
      inline: false 
    });
  }
  
  if (requestId) {
    fields.push({ name: "Cancel the Boost", value: `Run ${BOOSTING_CANCEL_COMMAND_MENTION} with **Request ID:** \`${requestId}\``, inline: false });
  } else {
    fields.push({ name: "Cancel the Boost", value: `Run ${BOOSTING_CANCEL_COMMAND_MENTION} using your boost request ID.`, inline: false });
  }
  fields.push({ name: "Use Your Boost", value: "Finish the action it applies to. For 'Other' boosts, use `/boosting other`.", inline: false });
  if (expiresAt) {
    fields.push({ name: "Wait for Expiry", value: `Boost expires <t:${expiresAt}:R>.`, inline: false });
  }

  const embed = new EmbedBuilder()
    .setTitle('❌ Active Boost Found')
    .setDescription(descriptionLines.join("\n"))
    .addFields(fields)
    .setColor('#E74C3C')
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setFooter({ text: 'You can request a new boost after it is fulfilled, cancelled, or expires.' });

  await safeReply({
   embeds: [embed],
   ephemeral: true,
  });
  return;
 }

 // Validate village compatibility
 const isTestingChannel = interaction.channelId === TESTING_CHANNEL_ID;
 const villageValidation = validateVillageCompatibility(targetCharacter, boosterCharacter, isTestingChannel);
 if (!villageValidation.valid) {
  logger.debug('BOOST', '[Validation] Village mismatch detected during boost request.');
  await safeReply({
   content: villageValidation.error,
   ephemeral: true,
  });
  return;
 }

 // Validate boost request - target character can request any boost category
 const boostRequestValidation = validateBoostRequest(targetCharacter, category);
 if (!boostRequestValidation.valid) {
  logger.debug('BOOST', '[Validation] Boost request invalid for target character.');
  await safeReply({
   content: boostRequestValidation.error,
   ephemeral: true,
  });
  return;
 }

   // Validate boost effect
  const boosterJob = getEffectiveJob(boosterCharacter);
  const boostEffectValidation = validateBoostEffect(boosterJob, category);
  if (!boostEffectValidation.valid) {
   logger.debug('BOOST', `[Validation] ${boostEffectValidation.error}`);
   await safeReply({
    content: boostEffectValidation.error,
    ephemeral: true,
   });
   return;
  }

   // Scholar validation
  const scholarValidation = validateScholarVillageParameter(boosterJob, category, village);
  if (!scholarValidation.valid) {
   await safeReply({
    content: scholarValidation.error,
    ephemeral: true,
   });
   return;
  }

 // Create boost request data
 const requestData = createBoostRequestData(targetCharacter, boosterCharacter, category, village, userId);
 await saveBoostingRequestToTempData(requestData.boostRequestId, requestData);

 // Create embed data and embed
  const embedData = createBoostRequestEmbedData(targetCharacter, boosterCharacter, category, village, boostEffectValidation.boost);
  const embed = createBoostRequestEmbed(embedData, requestData.boostRequestId);

 // Get the owner of the booster character and send reply
 const boosterOwnerId = boosterCharacter.userId;
 const boosterOwnerMention = `<@${boosterOwnerId}>`;

// HARDCODE the slash command mention so it's always clickable
const commandMention = BOOSTING_ACCEPT_COMMAND_MENTION;

await safeReply({
 content: `Boost request created. ${boosterOwnerMention} (**${boosterCharacter.name}**) run ${commandMention} within 24 hours.`,
 embeds: [embed]
});

 // Save the message ID to TempData for later updates
 try {
  const reply = await interaction.fetchReply();
  requestData.messageId = reply.id;
  requestData.channelId = reply.channelId;
  await saveBoostingRequestToTempData(requestData.boostRequestId, requestData);
 } catch (e) {
  logger.warn('BOOST', `Could not persist message reference for ${requestData.boostRequestId}: ${e.message}`);
 }
}

async function handleBoostAccept(interaction) {
 const requestId = interaction.options.getString("requestid");
 const boosterName = interaction.options.getString("character");
 const userId = interaction.user.id;

 const requestData = await retrieveBoostingRequestFromTempData(requestId);
 
 if (!requestData) {
  logger.error('BOOST', `Invalid boost request ID "${requestId}"`);
  await interaction.reply({
   content: "Invalid request ID.",
   ephemeral: true,
  });
  return;
 }

 const currentTime = Date.now();
 if (requestData.expiresAt && currentTime > requestData.expiresAt) {
  logger.warn('BOOST', `Request "${requestId}" has expired`);
  await interaction.reply({
   content: "This boost request has expired. Boost requests are only valid for 24 hours.",
   ephemeral: true,
  });
  return;
 }

 if (requestData.status !== "pending") {
  logger.error('BOOST', `Boost request "${requestId}" is not pending (status: ${requestData.status})`);
  await interaction.reply({
   content: "This request has already been fulfilled or expired.",
   ephemeral: true,
  });
  return;
 }

 const booster = await fetchCharacterWithFallback(boosterName, userId);
 
 if (!booster) {
  logger.error('BOOST', `User does not own boosting character "${boosterName}"`);
  await interaction.reply({
   content: `You do not own the boosting character "${boosterName}".`,
   ephemeral: true,
  });
  return;
 }

 if (booster.name !== requestData.boostingCharacter) {
  logger.error('BOOST', `Mismatch in boosting character. Request designated for "${requestData.boostingCharacter}", but provided "${booster.name}"`);
  await interaction.reply({
   content: `This request was made for **${requestData.boostingCharacter}**, not **${booster.name}**.`,
   ephemeral: true,
  });
  return;
 }

 const boosterJob = getEffectiveJob(booster);
 const boostEffectValidation = validateBoostEffect(boosterJob, requestData.category);
 if (!boostEffectValidation.valid) {
  logger.error('BOOST', boostEffectValidation.error);
  await interaction.reply({
   content: boostEffectValidation.error,
   ephemeral: true,
  });
  return;
 }

 // For Gathering boosts: ensure the target can actually gather at least one item
 // so we don't consume the booster's stamina or the target's daily roll for nothing
 if (requestData.category === 'Gathering') {
  const targetCharacter = await fetchCharacterByName(requestData.targetCharacter);
  if (targetCharacter) {
   const gatheringVillage =
    boosterJob === 'Scholar' && requestData.targetVillage
     ? requestData.targetVillage
     : targetCharacter.currentVillage;
   const { getVillageRegionByName } = require('../../modules/locationsModule');
   const villageRegion = gatheringVillage ? getVillageRegionByName(gatheringVillage) : null;
   const regionKey = villageRegion ? villageRegion.toLowerCase() : (gatheringVillage && gatheringVillage.toLowerCase());
   if (regionKey) {
    const items = await fetchAllItems();
    const job = targetCharacter.job;
    const normalizedInputJob = normalizeJobName(job);
    // ItemModel: gathering (Boolean), allJobs ([String]), region keys (e.g. eldin, faron, lanayru)
    const availableItems = items.filter((item) => {
     if (item.gathering !== true) return false;
     const isJobMatch = item.allJobs?.some((j) => normalizeJobName(j) === normalizedInputJob) || false;
     const isRegionMatch = item[regionKey] === true;
     return isJobMatch && isRegionMatch;
    });
    if (!availableItems || availableItems.length === 0) {
     await interaction.reply({
      content:
       `⚠️ **No items available to gather** in the target location (**${gatheringVillage}**) for **${targetCharacter.name}**'s job (**${job || 'unknown'}**) with this boost.\n\n` +
       "Neither the booster's stamina nor the character's daily gather roll will be used. Request or accept a boost when the character is in a village (or, for Scholar, a target village) that has gatherable items for their job.",
      ephemeral: true,
     });
     return;
    }
   }
  }
 }

 // Teacher Crafting: both vouchers are manually activated by the booster (no automatic removal at accept)

 // Deduct 1 stamina from the booster character
 try {
  const staminaResult = await useStamina(booster._id, 1);
  if (staminaResult.exhausted) {
   await interaction.reply({
    content: `❌ **${booster.name}** doesn't have enough stamina to provide this boost. They need at least 1 stamina to boost others.`,
    ephemeral: true,
   });
   return;
  }
 } catch (error) {
  logger.error('BOOST', `Error deducting stamina from ${booster.name}: ${error.message}`);
  await interaction.reply({
   content: `❌ Error processing stamina cost for **${booster.name}**. Please try again.`,
   ephemeral: true,
  });
  return;
 }

// Update request data with acceptance details
 const acceptedTime = Date.now();
 const boostExpiresAt = acceptedTime + BOOST_DURATION;

 requestData.status = "accepted";
 requestData.acceptedAt = acceptedTime;
 requestData.durationRemaining = BOOST_DURATION;
 requestData.boostExpiresAt = boostExpiresAt;
  // Ensure embed update has all required fields
  requestData.boosterJob = boosterJob;
  requestData.requestedByIcon = (await fetchCharacterByName(requestData.targetCharacter))?.icon;
  requestData.boosterIcon = booster.icon;

 // Update the target character's boostedBy field
 const targetCharacter = await fetchCharacterByName(requestData.targetCharacter);
 if (targetCharacter) {
   targetCharacter.boostedBy = booster.name;
   
   // For Scholar Gathering boosts, store the target village in the boost data
   const boosterJob = getEffectiveJob(booster);
   if (boosterJob === 'Scholar' && requestData.category === 'Gathering' && requestData.targetVillage) {
     requestData.targetVillage = requestData.targetVillage;
   }
   
   await targetCharacter.save();
 } else {
   logger.error('BOOST', `Could not find target character "${requestData.targetCharacter}"`);
 }

 // Deactivate job voucher if booster had an active voucher
 if (booster.jobVoucher) {
   const deactivationResult = await deactivateJobVoucher(booster._id, { afterUse: true });
   if (!deactivationResult.success) {
     logger.error('BOOST', `Failed to deactivate job voucher for ${booster.name}`);
   } else {
     logger.info('BOOST', `Job voucher deactivated for ${booster.name} after accepting boost`);
   }
 }

 // Save updated request data
 await saveBoostingRequestToTempData(requestId, requestData);

 // Update the original boost request embed to show accepted status
  try {
    const updated = await updateBoostRequestEmbed(interaction.client, requestData, 'accepted');
    if (!updated) {
      logger.warn('BOOST', `Failed to update request embed to accepted for ${requestId}`);
    }
  } catch (e) {
    logger.error('BOOST', `Error updating request embed to accepted for ${requestId}`, e);
  }

 // Create and send boost applied embed
  const embedData = createBoostAppliedEmbedData(booster, targetCharacter, requestData, boostEffectValidation.boost);
  const embed = createBoostAppliedEmbed(embedData);

 const sent = await interaction.reply({
  content: `Boost accepted and is now active for 24 hours!`,
  embeds: [embed],
 });

 // Persist the applied embed message so we can update its status later
 try {
   const sentMsg = await interaction.fetchReply();
   requestData.appliedMessageId = sentMsg.id;
   requestData.appliedChannelId = sentMsg.channelId;
   await saveBoostingRequestToTempData(requestId, requestData);
 } catch (e) {
   logger.warn('BOOST', `Could not persist applied embed message reference for ${requestId}: ${e.message}`);
 }
}

async function handleBoostStatus(interaction) {
 const characterName = interaction.options.getString("charactername");
 const userId = interaction.user.id;

 const character = await fetchCharacterWithFallback(characterName, userId);
 
if (!character) {
 const embed = createOtherBoostErrorEmbed({
  title: "❌ Character Not Found",
  description: `I can't find **${characterName}** among your characters.`,
  suggestions: [
   "Double-check the spelling and capitalization of the character name.",
   "If this is a mod character, confirm it is assigned to your Discord account.",
   "Switch to a character you own and run `/boosting other` again.",
  ],
 });

 await interaction.reply({
  embeds: [embed],
  ephemeral: true,
 });
 return;
}

 const currentTime = Date.now();
 const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);

 if (activeBoost && activeBoost.status === "accepted") {
  if (activeBoost.boostExpiresAt && currentTime > activeBoost.boostExpiresAt) {
   activeBoost.status = "expired";
   await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);
   await updateBoostRequestEmbed(interaction.client, activeBoost, 'expired');

   if (character.boostedBy) {
    character.boostedBy = null;
    await character.save();
   }

   await interaction.reply({
    content: `${characterName}'s boost has expired.`,
    ephemeral: true,
   });
   return;
  }

  const boosterCharacter = await fetchCharacterByNameWithFallback(activeBoost.boostingCharacter);
  const boosterJob = boosterCharacter ? getEffectiveJob(boosterCharacter) : (activeBoost.boosterJob || "Unknown");
  const boostEffect = getBoostEffect(boosterJob, activeBoost.category);
  const storedEffect = parseStoredBoostEffect(activeBoost.boostEffect);
  const boostName = boostEffect?.name || storedEffect.name;
  const boostDescription = boostEffect?.description || storedEffect.description;
  const timeRemaining = activeBoost.boostExpiresAt ? Math.max(0, activeBoost.boostExpiresAt - currentTime) : 0;
  const categoryDisplayName = activeBoost.category === 'Healers' ? 'Healer' : formatBoostCategoryName(activeBoost.category);

  const fields = [
   { name: "Boost Type", value: boostName, inline: true },
   { name: "Category", value: categoryDisplayName, inline: true },
   { name: "Boosted By", value: activeBoost.boostingCharacter, inline: true },
   { name: "Booster Job", value: boosterJob, inline: true },
   { name: "Effect", value: boostDescription, inline: false },
  ];

  if (timeRemaining > 0) {
   fields.push({ name: "Time Remaining", value: formatDuration(timeRemaining), inline: true });
  }

  if (activeBoost.boostExpiresAt) {
   fields.push({ name: "Expires", value: `<t:${Math.floor(activeBoost.boostExpiresAt / 1000)}:R>`, inline: true });
  }

  if (activeBoost.acceptedAt) {
   fields.push({ name: "Started", value: `<t:${Math.floor(activeBoost.acceptedAt / 1000)}:R>`, inline: true });
  }

  fields.push({ name: "Request ID", value: activeBoost.boostRequestId, inline: false });

  if (activeBoost.boosterJob === 'Scholar' && activeBoost.category === 'Gathering' && activeBoost.targetVillage) {
   fields.push({
    name: "🎯 Cross-Region Gathering",
    value: `**Can gather from:** ${activeBoost.targetVillage}\n**Current location:** ${character.currentVillage}\n*Character stays in current location while gathering from target village*`,
    inline: false
   });
  }

  const embed = new EmbedBuilder()
   .setTitle(`Active Boost Status: ${characterName}`)
   .setDescription(`**${characterName}** is currently boosted by **${activeBoost.boostingCharacter}**.`)
   .addFields(fields)
   .setColor("#4CAF50")
   .setImage("https://storage.googleapis.com/tinglebot/Graphics/border.png")
   .setFooter({ text: "Boost will automatically expire when duration ends" });

  if (character.icon || activeBoost.requestedByIcon) {
   embed.setThumbnail(character.icon || activeBoost.requestedByIcon);
  }

  if (boosterCharacter?.icon || activeBoost.boosterIcon) {
   embed.setAuthor({
    name: activeBoost.boostingCharacter,
    iconURL: boosterCharacter?.icon || activeBoost.boosterIcon
   });
  }

  await interaction.reply({
   embeds: [embed],
   ephemeral: true,
  });
  return;
 }

 const pendingBoost = await getPendingBoostRequestForCharacter(characterName);

 if (pendingBoost) {
  if (pendingBoost.tempExpiresAt && currentTime > pendingBoost.tempExpiresAt) {
   const updatedRequest = stripTempMetaFields({ ...pendingBoost, status: "expired" });
   await saveBoostingRequestToTempData(updatedRequest.boostRequestId, updatedRequest);
   await updateBoostRequestEmbed(interaction.client, updatedRequest, 'expired');

   await interaction.reply({
    content: `${characterName}'s boost request has expired.`,
    ephemeral: true,
   });
   return;
  }

  const pendingEffect = parseStoredBoostEffect(pendingBoost.boostEffect);
  const expiresTimestamp = pendingBoost.tempExpiresAt ? `<t:${Math.floor(pendingBoost.tempExpiresAt / 1000)}:R>` : "No expiry set";
  const expiresIn = pendingBoost.tempExpiresAt ? formatDuration(Math.max(0, pendingBoost.tempExpiresAt - currentTime)) : null;
  const categoryDisplayName = pendingBoost.category === 'Healers' ? 'Healer' : formatBoostCategoryName(pendingBoost.category);

  const fields = [
   { name: "Requested Booster", value: pendingBoost.boostingCharacter, inline: true },
   { name: "Category", value: categoryDisplayName, inline: true },
  ];

  if (pendingEffect.name !== 'Unknown' || pendingEffect.description !== 'N/A') {
   const effectLines = [];
   if (pendingEffect.name !== 'Unknown') {
    effectLines.push(pendingEffect.name);
   }
   if (pendingEffect.description !== 'N/A') {
    effectLines.push(pendingEffect.description);
   }
   fields.push({ name: "Expected Boost", value: effectLines.join('\n'), inline: false });
  }

  fields.push({ name: "Request ID", value: pendingBoost.boostRequestId, inline: false });

  if (pendingBoost.timestamp) {
   fields.push({ name: "Requested", value: `<t:${Math.floor(pendingBoost.timestamp / 1000)}:R>`, inline: true });
  }

  if (pendingBoost.tempExpiresAt) {
   fields.push({ name: "Expires", value: expiresTimestamp, inline: true });
   if (expiresIn) {
    fields.push({ name: "Time Remaining", value: expiresIn, inline: true });
   }
  }

  fields.push({
   name: "Need to Cancel?",
   value: `Use ${BOOSTING_CANCEL_COMMAND_MENTION} with ID \`${pendingBoost.boostRequestId}\`.`,
   inline: false
  });

  const embed = new EmbedBuilder()
   .setTitle(`Pending Boost Request: ${characterName}`)
   .setDescription(`Waiting for **${pendingBoost.boostingCharacter}** to accept the boost.`)
   .addFields(fields)
   .setColor("#F1C40F")
   .setImage("https://storage.googleapis.com/tinglebot/Graphics/border.png")
   .setFooter({ text: "Boost requests expire automatically if not accepted in time." });

  if (character.icon || pendingBoost.requestedByIcon) {
   embed.setThumbnail(character.icon || pendingBoost.requestedByIcon);
  }

  if (pendingBoost.boosterIcon) {
   embed.setAuthor({
    name: pendingBoost.boostingCharacter,
    iconURL: pendingBoost.boosterIcon
   });
  }

  await interaction.reply({
   embeds: [embed],
   ephemeral: true,
  });
  return;
 }

 await interaction.reply({
  content: `${characterName} does not have any active boosts or pending requests.`,
  ephemeral: true,
 });
}

async function handleBoostOther(interaction) {
 const characterName = interaction.options.getString("charactername");
 const rawTargetVillage = interaction.options.getString("village");
 const effectChoice = interaction.options.getString("effect");
 const userId = interaction.user.id;

 const character = await fetchCharacterWithFallback(characterName, userId);
 
 if (!character) {
  await interaction.reply({
   content: "You do not own this character.",
   ephemeral: true,
  });
  return;
 }

 const normalizedJob = typeof character.job === "string" ? normalizeJobName(character.job) : "";
 const isEntertainer = normalizedJob === "Entertainer";
 const isFortuneTeller = normalizedJob === "Fortune Teller";

 const requestedEffectJob = effectChoice === "fortune_teller"
  ? "Fortune Teller"
  : effectChoice === "entertainer"
  ? "Entertainer"
  : null;

 const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
 const currentTime = Date.now();
 const hasAcceptedBoost = activeBoost && activeBoost.status === "accepted";
 const activeOtherBoost = hasAcceptedBoost && activeBoost.category === "Other";

 if (hasAcceptedBoost && activeBoost.boostExpiresAt && currentTime > activeBoost.boostExpiresAt) {
 const embed = createOtherBoostErrorEmbed({
  title: "⌛ Boost Expired",
  description: `**${characterName}** no longer has an active boost to draw from.`,
  suggestions: [
   "Ask the original booster to accept a new request.",
   "Run `/boosting request` to set up a fresh boost before using `/boosting other`.",
  ],
  context: [
   {
    name: "Previous Booster",
    value: activeBoost?.boostingCharacter ? activeBoost.boostingCharacter : "Unknown",
    inline: true,
   },
  ],
  footer: "Boosts last 24 hours once accepted.",
 });

 await interaction.reply({
  embeds: [embed],
  ephemeral: true,
 });
  return;
 }

 if (hasAcceptedBoost && !activeOtherBoost) {
  if (isEntertainer && (!requestedEffectJob || requestedEffectJob === "Entertainer")) {
   if (!SONG_OF_STORMS_ENABLED) {
    const embed = createOtherBoostErrorEmbed({
     title: "🎵 Song of Storms Unavailable",
     description: "Ruu needs to make sure everything works properly, so don't use this until she says so.",
     suggestions: [
      "Please wait until Song of Storms is re-enabled.",
      "Contact Ruu if you have questions.",
     ],
    });
    await interaction.reply({
     embeds: [embed],
     ephemeral: true,
    });
    return;
   }
   await executeSongOfStorms(interaction, {
    entertainer: character,
    viaBoost: false,
    providedVillage: rawTargetVillage
   });
   return;
  }

 const embed = createOtherBoostErrorEmbed({
  title: "🎯 Different Boost Active",
  description: `**${characterName}** is currently boosted for **${activeBoost.category}**, so the Other boost command is locked.`,
  context: [
   {
    name: "Active Boost",
    value: `${activeBoost.boostingCharacter || "Unknown"} → ${activeBoost.category}`,
    inline: false,
   },
  ],
  suggestions: [
   "Use the appropriate command for the active boost category.",
   "Cancel the boost with `/boosting cancel` if you need to switch categories.",
   "Request a new boost specifically for the Other category before retrying.",
  ],
 });

 await interaction.reply({
  embeds: [embed],
  ephemeral: true,
 });
  return;
 }

 let boosterCharacter = null;
 let boostSourceJob = null;

 if (activeOtherBoost) {
  boosterCharacter = await fetchCharacterByNameWithFallback(activeBoost.boostingCharacter);
  const rawBoosterJob = boosterCharacter ? getEffectiveJob(boosterCharacter) : (activeBoost.boosterJob || null);
  boostSourceJob = rawBoosterJob ? normalizeJobName(rawBoosterJob) : null;
 }

 let effectJob = null;
 let viaBoost = false;

 if (activeOtherBoost) {
  viaBoost = true;
  effectJob = boostSourceJob || requestedEffectJob;

  if (requestedEffectJob && effectJob && requestedEffectJob !== effectJob) {
  const embed = createOtherBoostErrorEmbed({
   title: "❌ Effect Mismatch",
   description: `This boost was granted by a **${effectJob}**, so the selected effect does not line up.`,
   suggestions: [
    "Choose the effect that matches the booster’s job from the dropdown.",
    "If you meant to use the other effect, request a fresh boost from the correct job.",
   ],
   context: [
    {
     name: "Boosted By",
     value: activeBoost?.boostingCharacter || "Unknown booster",
     inline: true,
    },
    {
     name: "Selected Effect",
     value: requestedEffectJob ? requestedEffectJob : "None",
     inline: true,
    },
   ],
  });

  await interaction.reply({
   embeds: [embed],
   ephemeral: true,
  });
   return;
  }

  if (!effectJob) {
   effectJob = requestedEffectJob || boostSourceJob;
  }
 }

 if (!viaBoost && requestedEffectJob) {
  effectJob = requestedEffectJob;
 }

 if (!effectJob) {
  if (isFortuneTeller) {
   effectJob = "Fortune Teller";
  } else if (isEntertainer) {
   effectJob = "Entertainer";
  }
 }

 if (!effectJob) {
 const embed = createOtherBoostErrorEmbed({
  title: "🔍 No Other Boost Detected",
  description: `**${characterName}** does not have an active Other-category boost to channel.`,
  suggestions: [
   "Pick the correct effect from the dropdown if you received a boost.",
   "Run `/boosting status` to confirm the boost category and remaining time.",
   "Request a new Other boost before using `/boosting other`.",
  ],
 });

 await interaction.reply({
  embeds: [embed],
  ephemeral: true,
 });
  return;
 }

 if (viaBoost && boostSourceJob && effectJob !== boostSourceJob) {
 const embed = createOtherBoostErrorEmbed({
  title: "🔄 Choose the Matching Effect",
  description: `This boost originated from a **${boostSourceJob}**, so you must pick that effect to use it.`,
  suggestions: [
   "Select the effect that matches the booster’s job.",
   "If you wanted the alternate effect, cancel and request a new boost from that job.",
  ],
  context: [
   {
    name: "Boosted By",
    value: activeBoost?.boostingCharacter || "Unknown booster",
    inline: true,
   },
  ],
 });

 await interaction.reply({
  embeds: [embed],
  ephemeral: true,
 });
  return;
 }

 if (!viaBoost) {
  if (effectJob === "Fortune Teller" && !isFortuneTeller) {
   const embed = new EmbedBuilder()
    .setTitle("🔮 Weather Prediction Locked")
    .setDescription(`Only **Fortune Tellers** can seal tomorrow's forecast without an active boost.`)
    .addFields(
     {
      name: "Current Character",
      value: `${character.name} — ${character.job}`,
      inline: true,
     },
     {
      name: "How to Unlock",
      value: [
       "• Switch to one of your Fortune Teller characters.",
       "• Or ask an Entertainer or Scholar to boost you, then run `/boosting other` again.",
      ].join("\n"),
      inline: false,
     },
     {
      name: "Need a Boost?",
      value: "Use `/boosting request` to invite a Fortune Teller to share their divination.",
      inline: false,
     },
    )
    .setColor("#9B59B6")
    .setImage("https://storage.googleapis.com/tinglebot/Graphics/border.png")
    .setFooter({ text: "Weather Prediction requires a Fortune Teller or an active boost." });

   await interaction.reply({
    embeds: [embed],
    ephemeral: true,
   });
   return;
  }

  if (effectJob === "Entertainer" && !isEntertainer) {
  const embed = createOtherBoostErrorEmbed({
   title: "🎵 Song of Storms Locked",
   description: `Only **Entertainers** can perform the Song of Storms without an active boost.`,
   suggestions: [
    "Swap to one of your Entertainer characters to play the melody.",
    "Ask an Entertainer to boost you, then run `/boosting other` again.",
   ],
   context: [
    {
     name: "Current Character",
     value: `${character.name} — ${character.job}`,
     inline: true,
    },
   ],
  });

  await interaction.reply({
   embeds: [embed],
   ephemeral: true,
  });
   return;
  }
 }

 if (viaBoost && !boosterCharacter) {
  logger.error('BOOST', `Missing booster character data for ${activeBoost?.boostingCharacter} while resolving Other boost.`);
 const embed = createOtherBoostErrorEmbed({
  title: "❌ Booster Data Missing",
  description: `I can't retrieve **${activeBoost?.boostingCharacter || "the boosting character"}** right now.`,
  suggestions: [
   "Cancel the boost with `/boosting cancel`.",
   "Create a fresh request so the booster can accept again.",
   "If the issue persists, contact a moderator.",
  ],
 });

 await interaction.reply({
  embeds: [embed],
  ephemeral: true,
 });
  return;
 }

const staminaPerformer = viaBoost ? boosterCharacter : character;
const performerName = staminaPerformer?.name || (viaBoost ? activeBoost?.boostingCharacter : characterName);
const staminaAbilityLabel = effectJob === "Entertainer" ? "perform the Song of Storms" : "deliver the weather prediction";
const staminaCost = 1;
const staminaBefore =
 typeof staminaPerformer?.currentStamina === "number" ? staminaPerformer.currentStamina : null;
const staminaMax =
 typeof staminaPerformer?.maxStamina === "number" ? staminaPerformer.maxStamina : null;
let staminaAfter = staminaBefore;
let staminaResult = null;
let staminaMessage = '';
let isModStamina = false;
const normalizedVillage = rawTargetVillage ? resolveVillageName(rawTargetVillage) : null;
const shouldDeferFortunePrediction = effectJob === "Fortune Teller";
const staminaUsageMetadata = {
 source: 'boosting_other',
 performer: performerName,
 ability: effectJob,
 boostRequestId: activeBoost?.boostRequestId || null
};

if (rawTargetVillage && !normalizedVillage) {
 const embed = createOtherBoostErrorEmbed({
  title: "📍 Invalid Village",
  description: "That village isn't eligible for this effect.",
  suggestions: [
   `Pick one of the Song of Storms villages: ${SONG_OF_STORMS_VILLAGES.join(", ")}.`,
   "Leave the village field blank to let the system choose automatically.",
  ],
  context: [
   {
    name: "Typed Value",
    value: rawTargetVillage,
    inline: true,
   },
  ],
 });

 await interaction.reply({
  embeds: [embed],
  ephemeral: true,
 });
 return;
}

if (!shouldDeferFortunePrediction && (!staminaPerformer || !staminaPerformer._id)) {
 logger.error('BOOST', `Missing performer data while attempting to deduct stamina for ${performerName} (${effectJob}).`);
 const embed = createOtherBoostErrorEmbed({
  title: "⚠️ Stamina Check Failed",
  description: "I couldn't determine which character should spend stamina for this action.",
  suggestions: [
   "Cancel and recreate the boost to refresh the stored data.",
   "If the booster changed names, set up the boost again with the updated name.",
   "Flag this to staff if the problem repeats.",
  ],
  context: [
   {
    name: "Intended Performer",
    value: performerName || "Unknown",
    inline: true,
   },
   {
    name: "Intended Ability",
    value: effectJob,
    inline: true,
   },
  ],
 });

 await interaction.reply({
  embeds: [embed],
  ephemeral: true,
 });
 return;
}

if (!shouldDeferFortunePrediction) {
 try {
  staminaResult = await useStamina(staminaPerformer._id, staminaCost, staminaUsageMetadata);

  if (staminaResult?.exhausted) {
   const embed = createOtherBoostErrorEmbed({
    title: "💤 Stamina Depleted",
    description: `**${performerName}** is too exhausted to ${staminaAbilityLabel}.`,
    suggestions: [
     "Let the character recover stamina before trying again.",
     "Use items or abilities that restore stamina if available.",
     "Swap to another qualifying character who has stamina remaining.",
    ],
   });

   await interaction.reply({
    embeds: [embed],
    ephemeral: true,
   });
   return;
  }

  staminaMessage = staminaResult?.message || '';
  isModStamina = /Mod character/i.test(staminaMessage);

  if (!isModStamina && staminaBefore !== null) {
   staminaAfter = Math.max(0, staminaBefore - staminaCost);
   staminaPerformer.currentStamina = staminaAfter;
  } else if (isModStamina) {
   staminaAfter = staminaBefore;
  }
 } catch (error) {
  logger.error('BOOST', `Failed to deduct stamina for ${performerName} while using Other boost: ${error.message}`);
  const embed = createOtherBoostErrorEmbed({
   title: "❌ Stamina Deduction Failed",
   description: `I couldn't process the stamina cost for **${performerName}**.`,
   suggestions: [
    "Wait a moment and try the command again.",
    "Cancel and rebuild the boost if the issue continues.",
    "Reach out to staff with this message if it keeps happening.",
   ],
  });

  await interaction.reply({
   embeds: [embed],
   ephemeral: true,
  });
  return;
 }
}

 if (effectJob === "Fortune Teller") {
  const fortuneTeller = viaBoost
   ? boosterCharacter || { name: activeBoost.boostingCharacter, job: boostSourceJob || "Fortune Teller" }
   : character;

  await executeFortuneTellerPrediction(interaction, {
   fortuneTeller,
   targetCharacter: character,
   viaBoost,
   activeBoost: viaBoost ? activeBoost : null,
  providedVillage: normalizedVillage,
  staminaContext: {
   performerName,
   staminaCost,
   staminaBefore,
   staminaAfter,
   staminaMax,
   staminaMessage,
   isModStamina,
   performerId: staminaPerformer?._id ? staminaPerformer._id.toString() : null,
   shouldDeferStamina: shouldDeferFortunePrediction,
   useStaminaMetadata: staminaUsageMetadata,
   staminaPerformerRef: staminaPerformer
  },
  });
  return;
 }

 if (effectJob === "Entertainer") {
  if (!SONG_OF_STORMS_ENABLED) {
   const embed = createOtherBoostErrorEmbed({
    title: "🎵 Song of Storms Unavailable",
    description: "Ruu needs to make sure everything works properly, so don't use this until she says so.",
    suggestions: [
     "Please wait until Song of Storms is re-enabled.",
     "Contact Ruu if you have questions.",
    ],
   });
   await interaction.reply({
    embeds: [embed],
    ephemeral: true,
   });
   return;
  }
  
  const entertainer = viaBoost
   ? boosterCharacter || { name: activeBoost.boostingCharacter, job: boostSourceJob || "Entertainer" }
   : character;

  await executeSongOfStorms(interaction, {
   entertainer,
   recipient: viaBoost ? character : null,
   viaBoost,
   activeBoost: viaBoost ? activeBoost : null,
   providedVillage: normalizedVillage || rawTargetVillage,
  });
  return;
 }

 await interaction.reply({
  content: `${effectJob} doesn't have an "Other" category boost that can be used with this command.`,
  ephemeral: true,
 });
}

async function executeFortuneTellerPrediction(interaction, options = {}) {
 const {
  fortuneTeller,
  targetCharacter,
  viaBoost = false,
  activeBoost = null,
 providedVillage = null,
 staminaContext = {},
 } = options;

const {
 performerName = fortuneTeller?.name || targetCharacter?.name || 'Unknown',
 staminaCost = 1,
 staminaBefore = null,
 staminaAfter = null,
 staminaMax = null,
 staminaMessage = '',
 isModStamina = false,
 performerId = null,
 shouldDeferStamina = false,
 useStaminaMetadata = null,
 staminaPerformerRef = null,
} = staminaContext;

let effectiveStaminaCost = staminaCost;
let effectiveStaminaAfter = staminaAfter;
let effectiveStaminaMessage = staminaMessage;
let effectiveIsModStamina = isModStamina;
let staminaSpent = !shouldDeferStamina && effectiveStaminaCost > 0;

let selectedVillage = null;
const staminaAbilityDescription = "deliver the weather prediction";

try {
 const candidateVillages = [
  providedVillage,
  targetCharacter?.currentVillage,
  targetCharacter?.homeVillage,
  targetCharacter?.hometown,
  targetCharacter?.village,
 ];

 for (const candidate of candidateVillages) {
  if (!candidate) {
   continue;
  }

  const resolvedCandidate = resolveVillageName(candidate);
  if (resolvedCandidate) {
   selectedVillage = resolvedCandidate;
   break;
  }
 }

 if (!selectedVillage) {
  selectedVillage = SONG_OF_STORMS_VILLAGES[Math.floor(Math.random() * SONG_OF_STORMS_VILLAGES.length)];
 }

const now = new Date();
const {
 startUTC: startOfNextPeriodUTC,
 endUTC: endOfNextPeriodUTC,
 startEastern: startOfNextPeriod,
} = getNextPeriodBounds(now);

let weatherDoc = await findWeatherForPeriod(
 selectedVillage,
 startOfNextPeriodUTC,
 endOfNextPeriodUTC
);

let weatherDocId = weatherDoc?._id ? weatherDoc._id.toString() : null;
 const seasonForPeriod = getCurrentSeason(startOfNextPeriod);

 let weatherData = weatherDoc
  ? (typeof weatherDoc.toObject === 'function' ? weatherDoc.toObject() : weatherDoc)
  : null;

 if (!weatherData) {
  const generatedWeather = await simulateWeightedWeather(selectedVillage, seasonForPeriod, {
   useDatabaseHistory: true,
  });

  if (!generatedWeather) {
   throw new Error(`Failed to generate weather for ${selectedVillage}.`);
  }

  // Normalize date to exact start of period to ensure uniqueness
  // This prevents duplicates when dates differ by milliseconds
  const normalizedDate = new Date(startOfNextPeriodUTC);
  normalizedDate.setMilliseconds(0);
  
  const weatherPayload = {
   village: selectedVillage,
   date: normalizedDate,
   season: generatedWeather.season || seasonForPeriod,
   temperature: generatedWeather.temperature,
   wind: generatedWeather.wind,
   precipitation: generatedWeather.precipitation,
  };

  if (generatedWeather.special) {
   weatherPayload.special = generatedWeather.special;
  }

  try {
   const savedWeather = await Weather.create(weatherPayload);
   weatherDoc = savedWeather;
   weatherDocId = savedWeather?._id ? savedWeather._id.toString() : weatherDocId;
   weatherData =
    typeof savedWeather.toObject === 'function' ? savedWeather.toObject() : savedWeather;
  } catch (creationError) {
   if (creationError.code === 11000) {
    const duplicate = await findWeatherForPeriod(
     selectedVillage,
     startOfNextPeriodUTC,
     endOfNextPeriodUTC,
     { legacyFallback: false }
    );

    if (duplicate) {
     weatherDoc = duplicate;
     weatherDocId = duplicate?._id ? duplicate._id.toString() : weatherDocId;
     weatherData =
      typeof duplicate.toObject === 'function' ? duplicate.toObject() : duplicate;
    } else {
     throw creationError;
    }
   } else {
    throw creationError;
   }
  }
 } else if (!weatherData.season) {
  await Weather.updateOne(
   { _id: weatherDoc._id },
   { $set: { season: seasonForPeriod } }
  );
  weatherData.season = seasonForPeriod;
 }

if (!weatherData) {
 throw new Error(`Weather data unavailable for ${selectedVillage}.`);
}

const existingPrediction = weatherData?.prediction || null;
const isAlreadyLocked = Boolean(existingPrediction?.lockedAt);

if (shouldDeferStamina) {
 if (isAlreadyLocked) {
  effectiveStaminaCost = 0;
  effectiveStaminaAfter = staminaBefore;
  staminaSpent = false;
  effectiveIsModStamina = false;
  effectiveStaminaMessage =
   effectiveStaminaMessage || 'Forecast previously sealed; no stamina spent.';
 } else {
  if (!performerId) {
   logger.error(
    'BOOST',
    `Missing performer data while attempting deferred stamina deduction for ${performerName} (Fortune Teller).`
   );
   const embed = createOtherBoostErrorEmbed({
    title: "⚠️ Stamina Check Failed",
    description: "I couldn't determine which character should spend stamina for this action.",
    suggestions: [
     "Cancel and recreate the boost to refresh the stored data.",
     "If the booster changed names, set up the boost again with the updated name.",
     "Flag this to staff if the problem repeats.",
    ],
    context: [
     {
      name: "Intended Performer",
      value: performerName || "Unknown",
      inline: true,
     },
     {
      name: "Intended Ability",
      value: "Fortune Teller",
      inline: true,
     },
    ],
   });

   await interaction.reply({
    embeds: [embed],
    ephemeral: true,
   });
   return;
  }

  const metadata = useStaminaMetadata || {
   source: 'boosting_other',
   performer: performerName,
   ability: 'Fortune Teller',
   boostRequestId: activeBoost?.boostRequestId || null,
  };

  try {
   const deferredResult = await useStamina(performerId, effectiveStaminaCost, metadata);

   if (deferredResult?.exhausted) {
    const embed = createOtherBoostErrorEmbed({
     title: "💤 Stamina Depleted",
     description: `**${performerName}** is too exhausted to ${staminaAbilityDescription}.`,
     suggestions: [
      "Let the character recover stamina before trying again.",
      "Use items or abilities that restore stamina if available.",
      "Swap to another qualifying character who has stamina remaining.",
     ],
    });

    await interaction.reply({
     embeds: [embed],
     ephemeral: true,
    });
    return;
   }

   effectiveStaminaMessage = deferredResult?.message || '';
   effectiveIsModStamina = /Mod character/i.test(effectiveStaminaMessage);

   if (!effectiveIsModStamina && staminaBefore !== null) {
    effectiveStaminaAfter = Math.max(0, staminaBefore - effectiveStaminaCost);
   } else if (effectiveIsModStamina) {
    effectiveStaminaAfter = staminaBefore;
   }

   if (staminaPerformerRef && typeof staminaPerformerRef === 'object') {
    staminaPerformerRef.currentStamina = effectiveStaminaAfter;
   }

   staminaSpent = !effectiveIsModStamina && effectiveStaminaCost > 0;
  } catch (error) {
   logger.error(
    'BOOST',
    `Failed to deduct stamina for ${performerName} while delivering a weather prediction: ${error.message}`
   );
   const embed = createOtherBoostErrorEmbed({
    title: "❌ Stamina Deduction Failed",
    description: `I couldn't process the stamina cost for **${performerName}**.`,
    suggestions: [
     "Wait a moment and try the command again.",
     "Cancel and rebuild the boost if the issue continues.",
     "Reach out to staff with this message if it keeps happening.",
    ],
   });

   await interaction.reply({
    embeds: [embed],
    ephemeral: true,
   });
   return;
  }
 }
}

if (!shouldDeferStamina) {
 staminaSpent = !effectiveIsModStamina && effectiveStaminaCost > 0;
}

const forecastTimestamp = existingPrediction?.periodStart
 ? Math.floor(new Date(existingPrediction.periodStart).getTime() / 1000)
 : Math.floor(startOfNextPeriodUTC.getTime() / 1000);
 const foretellerName = fortuneTeller?.name || 'a Fortune Teller';
 const targetName = targetCharacter?.name || 'a traveler';

 const precipitationEmoji = weatherData?.precipitation?.emoji || '🌧️';
 const precipitationLabel = weatherData?.precipitation?.label || 'Unknown';
 const precipitationProbability = weatherData?.precipitation?.probability || null;

 const temperatureEmoji = weatherData?.temperature?.emoji || '🌡️';
 const temperatureLabel = weatherData?.temperature?.label || 'Unknown';
 const temperatureProbability = weatherData?.temperature?.probability || null;

 const windEmoji = weatherData?.wind?.emoji || '💨';
 const windLabel = weatherData?.wind?.label || 'Unknown';
 const windProbability = weatherData?.wind?.probability || null;

const precipitationDisplay = `${precipitationEmoji} ${precipitationLabel}${
 precipitationProbability ? ` (${precipitationProbability})` : ''
}`;

const temperatureDisplay = `${temperatureEmoji} ${temperatureLabel}${
 temperatureProbability ? ` (${temperatureProbability})` : ''
}`;

const windDisplay = `${windEmoji} ${windLabel}${windProbability ? ` (${windProbability})` : ''}`;

let specialDisplay = null;

if (weatherData?.special?.label) {
 const specialEmoji = weatherData.special.emoji || '✨';
 const specialProbability = weatherData.special.probability || null;
 specialDisplay = `${specialEmoji} ${weatherData.special.label}${
  specialProbability ? ` (${specialProbability})` : ''
 }`;
}

const lockOwnerName = isAlreadyLocked
 ? existingPrediction?.lockedByName || 'another diviner'
 : foretellerName;

let lockTimestamp =
 isAlreadyLocked && existingPrediction?.lockedAt
  ? new Date(existingPrediction.lockedAt)
  : new Date();
if (!(lockTimestamp instanceof Date) || Number.isNaN(lockTimestamp.getTime())) {
 lockTimestamp = new Date();
}
const lockedAtEpoch = lockTimestamp ? Math.floor(lockTimestamp.getTime() / 1000) : null;

const embedColor = WEATHER_EMBED_COLORS[selectedVillage] || 0x9b59b6;
const summaryEmojis = [
 precipitationEmoji,
 temperatureEmoji,
 windEmoji,
 weatherData?.special?.emoji || '',
]
 .filter(Boolean)
 .join(' ');

const descriptionLines = [
 summaryEmojis,
 isAlreadyLocked
  ? `**${foretellerName}** revisits the sealed forecast for **${selectedVillage}**.`
  : `**${foretellerName}** seals tomorrow's forecast for **${selectedVillage}**.`,
 targetCharacter ? `Divination shared with **${targetName}**.` : null,
 lockedAtEpoch
  ? `Locked by **${lockOwnerName}** on <t:${lockedAtEpoch}:f>.`
  : `Locked by **${lockOwnerName}**.`,
].filter(Boolean);

const embedFields = [
 {
  name: '📍 Village',
  value: selectedVillage,
  inline: true,
 },
 {
  name: '📅 Date',
  value: `<t:${forecastTimestamp}:D>`,
  inline: true,
 },
 {
  name: '🕰️ Forecast Window',
  value: `<t:${forecastTimestamp}:F>`,
  inline: false,
 },
 {
  name: 'Temperature',
  value: temperatureDisplay,
  inline: true,
 },
 {
  name: 'Wind',
  value: windDisplay,
  inline: true,
 },
 {
  name: 'Precipitation',
  value: precipitationDisplay,
  inline: true,
 },
];

if (specialDisplay) {
 embedFields.push({
  name: 'Special Weather',
  value: specialDisplay,
  inline: false,
 });
}

if (weatherData?.season) {
 embedFields.push({
  name: 'Season',
  value: weatherData.season.charAt(0).toUpperCase() + weatherData.season.slice(1),
  inline: true,
 });
}

const staminaFieldLabel = viaBoost ? '🪫 Booster Stamina' : '🪫 Stamina';
const staminaFieldLines = [];

if (staminaSpent && effectiveStaminaCost > 0) {
 staminaFieldLines.push(`**${performerName}** spent ${effectiveStaminaCost} stamina.`);
 if (effectiveStaminaAfter !== null && staminaMax !== null) {
  staminaFieldLines.push(`Remaining: ${effectiveStaminaAfter}/${staminaMax}`);
 }
}

if (!staminaSpent && shouldDeferStamina && effectiveStaminaCost === 0 && !effectiveStaminaMessage) {
 staminaFieldLines.push('No stamina spent.');
}

if (effectiveStaminaMessage) {
 staminaFieldLines.push(effectiveStaminaMessage);
}

if (staminaFieldLines.length) {
 embedFields.push({
  name: staminaFieldLabel,
  value: staminaFieldLines.join('\n'),
  inline: false,
 });
}

if (viaBoost) {
 embedFields.push({
  name: '✨ Boost Used',
  value: `Fortune Teller ${foretellerName}'s Weather Prediction`,
  inline: false,
 });
} else {
 embedFields.push({
  name: '✨ Ability',
  value: "Fortune Teller's Weather Prediction",
  inline: false,
 });
}

if (isAlreadyLocked) {
 embedFields.push({
  name: 'Status',
  value: `Forecast already sealed by **${lockOwnerName}**. Sharing stored results.`,
  inline: false,
 });
}

const embed = new EmbedBuilder()
 .setTitle('🔮 Weather Prediction')
 .setColor(embedColor);

if (descriptionLines.length) {
 embed.setDescription(descriptionLines.join('\n'));
}

embed.addFields(embedFields);
embed
 .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
 .setFooter({ text: 'Forecast sealed. Revisit after the next weather shift.' })
 .setTimestamp(lockTimestamp);

if (fortuneTeller) {
 const authorOptions = { name: `${foretellerName} • Fortune Teller` };
 if (fortuneTeller.icon) {
  authorOptions.iconURL = fortuneTeller.icon;
 }
 embed.setAuthor(authorOptions);
}

 if (targetCharacter?.icon) {
  embed.setThumbnail(targetCharacter.icon);
 }

 await interaction.reply({
  embeds: [embed],
  ephemeral: false,
 });

let predictionRecord = existingPrediction || null;

if (!isAlreadyLocked) {
 predictionRecord = {
  lockedAt: lockTimestamp,
  lockedById: fortuneTeller?._id ? fortuneTeller._id.toString() : null,
  lockedByName: foretellerName,
  targetCharacterId: targetCharacter?._id ? targetCharacter._id.toString() : null,
  targetCharacterName: targetName,
  viaBoost,
  boostRequestId: viaBoost ? activeBoost?.boostRequestId || null : null,
  periodStart: startOfNextPeriodUTC,
  periodEnd: endOfNextPeriodUTC,
 };

 const weatherRecordId = weatherDocId || (weatherData?._id ? weatherData._id.toString() : null);

 if (weatherRecordId) {
  try {
   await Weather.updateOne(
    { _id: weatherRecordId },
    { $set: { prediction: predictionRecord } }
   );
   weatherData.prediction = predictionRecord;
  } catch (updateError) {
   logger.warn(
    'BOOST',
    `Unable to persist prediction lock for ${selectedVillage}: ${updateError.message}`
   );
  }
 }
}

 if (viaBoost && activeBoost && activeBoost.boostRequestId) {
  activeBoost.status = 'fulfilled';
  activeBoost.fulfilledAt = Date.now();
  await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);

  if (targetCharacter && targetCharacter.boostedBy) {
   targetCharacter.boostedBy = null;
   await targetCharacter.save();
  }

  if (typeof module.exports.updateBoostAppliedMessage === 'function') {
   try {
    await module.exports.updateBoostAppliedMessage(interaction.client, activeBoost);
   } catch (error) {
    logger.warn(
     'BOOST',
     `Unable to update boost applied message for ${activeBoost.boostRequestId}: ${error.message}`
    );
   }
  }
 }

const logAction = isAlreadyLocked ? '🔁 Weather prediction retrieved' : '🔮 Weather prediction locked';
logger.info(
 'BOOST',
 `${logAction} for ${selectedVillage}: ${precipitationLabel}${
  weatherData?.special?.label ? ` + ${weatherData.special.label}` : ''
 }${viaBoost ? ` (boost by ${foretellerName})` : ''}${
  isAlreadyLocked ? ` (originally sealed by ${lockOwnerName})` : ''
 }`
);
} catch (error) {
 logger.error(
  'BOOST',
  `Failed to deliver weather prediction${selectedVillage ? ` for ${selectedVillage}` : ''}: ${
   error.message
  }`
 );

 const errorMessage =
  '❌ **The divination falters.** Please try again in a moment or contact a moderator.';

 if (interaction.replied) {
  await interaction.followUp({ content: errorMessage, ephemeral: true });
 } else if (interaction.deferred) {
  await interaction.editReply({ content: errorMessage });
 } else {
  await interaction.reply({ content: errorMessage, ephemeral: true });
 }
}
}

async function executeSongOfStorms(interaction, options) {
 if (!SONG_OF_STORMS_ENABLED) {
  const embed = createOtherBoostErrorEmbed({
   title: "🎵 Song of Storms Unavailable",
   description: "Ruu needs to make sure everything works properly, so don't use this until she says so.",
   suggestions: [
    "Please wait until Song of Storms is re-enabled.",
    "Contact Ruu if you have questions.",
   ],
  });
  
  if (interaction.replied) {
   await interaction.followUp({ embeds: [embed], ephemeral: true });
  } else if (interaction.deferred) {
   await interaction.editReply({ embeds: [embed] });
  } else {
   await interaction.reply({ embeds: [embed], ephemeral: true });
  }
  return;
 }

 const {
  entertainer,
  recipient = null,
  viaBoost = false,
  activeBoost = null,
  providedVillage = null
 } = options || {};

const resolvedVillage = providedVillage ? resolveVillageName(providedVillage) : null;
const selectedVillage = resolvedVillage || SONG_OF_STORMS_VILLAGES[Math.floor(Math.random() * SONG_OF_STORMS_VILLAGES.length)];
const selectedWeather = SONG_OF_STORMS_SPECIAL_WEATHER[Math.floor(Math.random() * SONG_OF_STORMS_SPECIAL_WEATHER.length)];
const manualSelection = Boolean(resolvedVillage);

 try {
  const scheduleResult = await scheduleSpecialWeather(selectedVillage, selectedWeather, {
   triggeredBy: entertainer?.name || 'Unknown Entertainer',
   recipient: recipient?.name || null,
   source: viaBoost ? 'Song of Storms (Boosted)' : 'Song of Storms (Self)'
  });

  const activationTimestamp = scheduleResult?.startOfPeriod
   ? Math.floor(scheduleResult.startOfPeriod.getTime() / 1000)
   : Math.floor((Date.now() + 86400000) / 1000);

const performerName = entertainer?.name || 'An Entertainer';
const description = manualSelection
 ? `**${performerName}** performs the Song of Storms, guiding tomorrow's spectacle toward **${selectedVillage}**.`
 : `**${performerName}** performs the Song of Storms, letting the winds decide where tomorrow's spectacle unfolds.`;

const selectionFieldValue = manualSelection
 ? `The melody is directed to **${selectedVillage}**. The exact weather remains hidden until the town halls share tomorrow's forecast.`
 : "The melody chooses randomly among Rudania, Inariko, and Vhintl. The exact village and weather remain hidden until the town halls post tomorrow's forecast.";

  const embed = new EmbedBuilder()
   .setTitle("🎵 Song of Storms")
   .setDescription(description)
   .addFields([
    {
     name: "🎲 Selection",
    value: selectionFieldValue,
     inline: false
    },
    {
     name: "📅 Reveal",
     value: `<t:${activationTimestamp}:D>`,
     inline: true
    }
   ])
   .setColor("#E74C3C")
   .setThumbnail(entertainer?.icon || null)
   .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
   .setFooter({ text: "The storm answers the song—find out where at dawn." });

  if (viaBoost && entertainer?.name) {
   embed.addFields({ name: "✨ Boost Used", value: `Entertainer ${entertainer.name}'s Song of Storms`, inline: false });
  }

 if (manualSelection) {
  embed.addFields({
   name: "📍 Village",
   value: selectedVillage,
   inline: true
  });
 }

  await interaction.reply({
   embeds: [embed],
   ephemeral: false,
  });

  if (viaBoost && activeBoost && recipient) {
   activeBoost.status = "fulfilled";
   activeBoost.fulfilledAt = Date.now();
   await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);

   recipient.boostedBy = null;
   await recipient.save();
  }

  logger.info(
   'BOOST',
  `🎵 Song of Storms triggered by ${entertainer?.name || 'Unknown'}${recipient ? ` for ${recipient.name}` : ''}: ${selectedWeather} in ${selectedVillage}${manualSelection ? ' (manual selection)' : ''}`
  );
 } catch (error) {
  if (error.code === 'SPECIAL_WEATHER_ALREADY_SET') {
   logger.warn(
    'BOOST',
    `Song of Storms duplicate special attempt blocked for ${error.village || selectedVillage}: ${error.existingSpecial || 'Unknown Special'}`
   );
  } else {
   logger.error(
    'BOOST',
    `Song of Storms failed for ${entertainer?.name || 'Unknown Entertainer'}:`,
    error
   );
  }

 let errorMessage;

 if (error.code === 'SPECIAL_WEATHER_ALREADY_SET') {
  const villageName = error.village || selectedVillage;
  const existingSpecial = error.existingSpecial ? ` (**${error.existingSpecial}** already awaits there)` : '';
  errorMessage = `❌ **Song of Storms falters.** ${villageName} already has tomorrow's weather set${existingSpecial}. Please try another village!`;
 } else {
  errorMessage = "❌ **Song of Storms falters.** Please try again later or contact a moderator.";
 }

  if (interaction.replied) {
   await interaction.followUp({ content: errorMessage, ephemeral: true });
  } else if (interaction.deferred) {
   await interaction.editReply({ content: errorMessage });
  } else {
   await interaction.reply({ content: errorMessage, ephemeral: true });
  }
 }
}

async function handleBoostCancel(interaction) {
 const requestId = interaction.options.getString("requestid");
 const characterName = interaction.options.getString("charactername");
 const userId = interaction.user.id;

 let requestData = null;
 let resolvedRequestId = requestId;

 if (requestId) {
  requestData = await retrieveBoostingRequestFromTempData(requestId);
 } else if (characterName) {
  // Cancel by character name: find pending or accepted boost for this character
  const targetCharacter = await fetchCharacterWithFallback(characterName, userId);
  if (!targetCharacter) {
   await interaction.reply({
    content: "❌ **Character not found**\n\nYou can only cancel boosts for your own characters. Check the character name and try again.",
    ephemeral: true,
   });
   return;
  }
  const allBoosting = await TempData.find({
   type: 'boosting',
   'data.targetCharacter': targetCharacter.name,
   'data.status': { $in: ['pending', 'accepted'] }
  });
  if (allBoosting.length === 0) {
   await interaction.reply({
    content: `❌ **No boost to cancel**\n\n**${targetCharacter.name}** does not have a pending or active boost.`,
    ephemeral: true,
   });
   return;
  }
  if (allBoosting.length > 1) {
   await interaction.reply({
    content: `❌ **Multiple boosts found**\n\n**${targetCharacter.name}** has more than one boost. Please use \`/boosting cancel\` with the **Request ID** (use autocomplete on the requestid option to pick one).`,
    ephemeral: true,
   });
   return;
  }
  const tempData = allBoosting[0];
  requestData = tempData.data;
  resolvedRequestId = tempData.key || requestData.boostRequestId;
 } else {
  await interaction.reply({
   content: "❌ **Specify what to cancel**\n\nProvide either a **Request ID** or a **Character name** (use autocomplete to pick a character with an active boost).",
   ephemeral: true,
  });
  return;
 }

 if (!requestData) {
  await interaction.reply({
   content: "❌ **Invalid Request ID**\n\nCould not find a boost request with that ID.",
   ephemeral: true,
  });
  return;
 }

 // Check if the user owns the target character (the requester)
 const targetCharacter = await fetchCharacterWithFallback(requestData.targetCharacter, userId);
 
 if (!targetCharacter) {
  await interaction.reply({
   content: "❌ **Unauthorized**\n\nYou can only cancel boost requests for your own characters.",
   ephemeral: true,
  });
  return;
 }

 // Check if the request can be cancelled (pending or accepted)
 if (requestData.status === "fulfilled" || requestData.status === "expired" || requestData.status === "cancelled") {
  await interaction.reply({
   content: `❌ **Cannot Cancel**\n\nThis boost request has already been ${requestData.status === "fulfilled" ? "fulfilled" : requestData.status === "expired" ? "expired" : "cancelled"}.`,
   ephemeral: true,
  });
  return;
 }

 // Check if the request has expired (for pending requests only)
 if (requestData.status === "pending" && requestData.expiresAt && Date.now() > requestData.expiresAt) {
  await interaction.reply({
   content: "❌ **Request Expired**\n\nThis boost request has already expired and cannot be cancelled.",
   ephemeral: true,
  });
  return;
 }

 // Handle accepted boosts - clear the character's boostedBy field
 const wasAccepted = requestData.status === "accepted";
 if (wasAccepted) {
  const character = await fetchCharacterByName(requestData.targetCharacter);
  if (character && character.boostedBy) {
   character.boostedBy = null;
   await character.save();
   logger.info('BOOST', `Cleared boost for ${character.name} - boost cancelled by user`);
  }
 }

 // Cancel the request
 requestData.status = "cancelled";
 await saveBoostingRequestToTempData(resolvedRequestId, requestData);

 // Update the embed if it exists
 await updateBoostRequestEmbed(interaction.client, requestData, 'cancelled');

 const statusMessage = wasAccepted ? "Active Boost Cancelled" : "Boost Request Cancelled";
 const cancelEmbed = new EmbedBuilder()
  .setColor(0x2ecc71)
  .setTitle('✅ Boost Cancelled')
  .setDescription(`Successfully cancelled the boost from **${requestData.boostingCharacter}** for **${requestData.targetCharacter}**.`)
  .addFields(
   { name: 'Status', value: statusMessage, inline: false },
   { name: 'Request ID', value: requestData.boostRequestId, inline: false }
  )
  .setTimestamp();

 await interaction.reply({
  embeds: [cancelEmbed],
 });
}

// ============================================================================
// ------------------- Unified Boost Clearing Function -------------------
// ============================================================================

/**
 * Unified function to clear boost after use
 * Handles TempData updates, embed updates, and character.boostedBy clearing
 * @param {Object} character - Character document with boostedBy field
 * @param {Object} options - Options object
 * @param {Object} options.client - Discord client for embed updates (optional)
 * @param {boolean} options.shouldClearBoost - Whether to clear the boost (default: true)
 * @param {string} options.context - Context string for logging (optional)
 * @returns {Promise<{success: boolean, cleared: boolean, error?: string}>}
 */
async function clearBoostAfterUse(character, options = {}) {
  const { client = null, shouldClearBoost = true, context = '' } = options;
  
  if (!character) {
    logger.error('BOOST', `clearBoostAfterUse: Character is null or undefined${context ? ` (${context})` : ''}`);
    return { success: false, cleared: false, error: 'Character is null or undefined' };
  }

  if (!shouldClearBoost) {
    if (character.boostedBy) {
      logger.info('BOOST', `Boost preserved for ${character.name}${context ? ` (${context})` : ''}`);
    }
    return { success: true, cleared: false };
  }

  // Look up active boost by character name (TempData is source of truth; boostedBy can be out-of-sync)
  const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(character.name);
  if (!activeBoost && !character.boostedBy) {
    return { success: true, cleared: false };
  }

  // Only clear boosts that are "consumed on use" (Other category)
  // Duration-based boosts (Gathering, Crafting, Looting, etc.) should remain active for 24h
  if (activeBoost && activeBoost.category !== 'Other') {
    logger.debug('BOOST', `Boost preserved for ${character.name} (category: ${activeBoost.category}) - duration-based${context ? ` (${context})` : ''}`);
    return { success: true, cleared: false };
  }

  try {
    logger.info('BOOST', `Clearing boost for ${character.name}${context ? ` (${context})` : ''}`);
    
    if (activeBoost && (activeBoost.status === 'accepted' || activeBoost.status === 'pending')) {
      activeBoost.status = 'fulfilled';
      activeBoost.fulfilledAt = Date.now();
      await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);
      
      // If client provided, update the request embed status to fulfilled
      if (client) {
        try {
          const { updateBoostRequestEmbed } = require('../../embeds/embeds.js');
          await updateBoostRequestEmbed(client, activeBoost, 'fulfilled');
          // Update the 'Boost Applied' embed if we have its reference
          if (typeof module.exports.updateBoostAppliedMessage === 'function') {
            await module.exports.updateBoostAppliedMessage(client, activeBoost);
          }
        } catch (embedErr) {
          logger.error('BOOST', `Failed to update request embed to fulfilled: ${embedErr.message}`);
          // Continue with clearing even if embed update fails
        }
      }
    }
    
    // Clear the boostedBy field from the character
    character.boostedBy = null;
    await character.save();
    
    logger.info('BOOST', `✅ Boost cleared for ${character.name}${context ? ` (${context})` : ''}`);
    return { success: true, cleared: true };
  } catch (error) {
    logger.error('BOOST', `Failed to clear boost for ${character.name}${context ? ` (${context})` : ''}: ${error.message}`);
    
    // Try to clear boostedBy even if TempData update failed
    try {
      if (character.boostedBy) {
        character.boostedBy = null;
        await character.save();
        logger.warn('BOOST', `Cleared boostedBy field despite TempData update failure for ${character.name}`);
      }
    } catch (saveError) {
      logger.error('BOOST', `Failed to clear boostedBy field after error: ${saveError.message}`);
    }
    
    return { success: false, cleared: false, error: error.message };
  }
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports.getEffectiveJob = getEffectiveJob;
module.exports.isBoostActive = isBoostActive;
module.exports.getActiveBoostEffect = getActiveBoostEffect;
module.exports.getRemainingBoostTime = getRemainingBoostTime;
module.exports.retrieveBoostingRequestFromTempDataByCharacter = retrieveBoostingRequestFromTempDataByCharacter;
module.exports.retrieveBoostingRequestFromTempDataByBooster = retrieveBoostingRequestFromTempDataByBooster;
module.exports.saveBoostingRequestToTempData = saveBoostingRequestToTempData;
module.exports.retrieveBoostingRequestFromTempData = retrieveBoostingRequestFromTempData;
module.exports.clearBoostAfterUse = clearBoostAfterUse;

// Helper to update the 'Boost Applied' embed when status changes
module.exports.updateBoostAppliedMessage = async function updateBoostAppliedMessage(client, requestData) {
  try {
    if (!requestData.appliedMessageId || !requestData.appliedChannelId) {
      return false;
    }

    const channel = await client.channels.fetch(requestData.appliedChannelId);
    if (!channel) return false;
    const message = await channel.messages.fetch(requestData.appliedMessageId);
    if (!message) return false;

    // Rebuild applied embed with latest status
    const booster = await fetchCharacterByNameWithFallback(requestData.boostingCharacter);
    const targetCharacter = await fetchCharacterByNameWithFallback(requestData.targetCharacter);
    const boosterJob = booster ? getEffectiveJob(booster) : (requestData.boosterJob || 'Unknown');
    const boostEffectValidation = validateBoostEffect(boosterJob, requestData.category);
    // Use stored boost effect as fallback when config lookup fails (e.g. removed job/category, or "Other" custom)
    const boost = boostEffectValidation.boost || parseStoredBoostEffect(requestData.boostEffect);
    const embedData = createBoostAppliedEmbedData(booster, targetCharacter, requestData, boost);
    // ensure status taken from requestData
    embedData.status = requestData.status || embedData.status;
    const embed = createBoostAppliedEmbed(embedData);

    await message.edit({ embeds: [embed] });
    return true;
  } catch (e) {
    logger.error('BOOST', `Failed to update Boost Applied message for ${requestData.boostRequestId}: ${e.message}`);
    return false;
  }
}
