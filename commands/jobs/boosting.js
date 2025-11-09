// ============================================================================
// ------------------- Imports and Dependencies -------------------
// ============================================================================

const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const {
 fetchCharacterByNameAndUserId,
 fetchCharacterByName,
 fetchModCharacterByNameAndUserId,
 fetchModCharacterByName,
} = require('../../database/db');
const { getBoostEffect } = require('../../modules/boostingModule');
const { getJobPerk } = require('../../modules/jobsModule');
const { useStamina } = require('../../modules/characterStatsModule');
const { generateUniqueId } = require('../../utils/uniqueIdUtils');
const TempData = require('../../models/TempDataModel');
const { retrieveBoostingRequestFromStorageByCharacter } = require('../../utils/storage');
const {
  createBoostRequestEmbed,
  updateBoostRequestEmbed,
  createBoostAppliedEmbed,
} = require('../../embeds/embeds.js');

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
  { name: "Vending", value: "Vending" },
  { name: "Tokens", value: "Tokens" },
  { name: "Exploring", value: "Exploring" },
  { name: "Traveling", value: "Traveling" },
  { name: "Mounts", value: "Mounts" },
  { name: "Other", value: "Other" }
];

const SONG_OF_STORMS_VILLAGES = ['Rudania', 'Inariko', 'Vhintl'];
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
 const boost = getBoostEffect(boosterCharacter.job, category);

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
   boosterJob: boosterCharacter.job,
   boostEffect: `${boost.name} — ${boost.description}`,
   requestedByIcon: targetCharacter.icon,
   boosterIcon: boosterCharacter.icon
 };
}

/**
 * Creates embed data for boost request
 */
function createBoostRequestEmbedData(targetCharacter, boosterCharacter, category, village, boost) {
 return {
   requestedBy: targetCharacter.name,
   booster: boosterCharacter.name,
   boosterJob: boosterCharacter.job,
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
 return {
   boostedBy: booster.name,
   boosterJob: booster.job,
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
 return getBoostEffect(boosterCharacter.job, category);
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
  .addSubcommand((subcommand) =>
   subcommand
    .setName("use")
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
      .setName("village")
      .setDescription("Target village (for weather prediction/storm)")
      .setRequired(false)
      .setAutocomplete(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("cancel")
    .setDescription("Cancel a pending boost request or active boost")
    .addStringOption((option) =>
     option
      .setName("requestid")
      .setDescription("The ID of the boost request to cancel")
      .setRequired(true)
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
  } else if (subcommand === "use") {
   await handleBoostUse(interaction);
  } else if (subcommand === "cancel") {
   await handleBoostCancel(interaction);
  }
 },
};

// ============================================================================
// ------------------- Subcommand Handlers -------------------
// ============================================================================

async function handleBoostRequest(interaction) {
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
  await interaction.reply({
   content: "One or both characters could not be found.",
   ephemeral: true,
  });
  return;
 }

 // Validate active boost
 const activeBoostValidation = await validateActiveBoost(targetCharacter);
 if (!activeBoostValidation.valid) {
  logger.error('BOOST', activeBoostValidation.error);
  // Build a helpful embed with options to cancel, use, or wait for expiry
  const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(targetCharacter.name);
  const boosterName = activeBoost?.boostingCharacter || boosterCharacter?.name || "their booster";
  const boostCategory = activeBoost?.category || category;
  const expiresAt = activeBoost?.boostExpiresAt ? Math.floor(activeBoost.boostExpiresAt / 1000) : null;
  const requestId = activeBoost?.boostRequestId;

  const descriptionLines = [
    `**${targetCharacter.name}** is already boosted by **${boosterName}** for **${boostCategory}**.`,
    "",
    "💡 **Tip:** You can cancel the current boost, use it now, or wait for it to expire."
  ];

  const fields = [];
  if (requestId) {
    fields.push({ name: "Cancel the Boost", value: `Run ${BOOSTING_CANCEL_COMMAND_MENTION} with **Request ID:** \`${requestId}\``, inline: false });
  } else {
    fields.push({ name: "Cancel the Boost", value: `Run ${BOOSTING_CANCEL_COMMAND_MENTION} using your boost request ID.`, inline: false });
  }
  fields.push({ name: "Use Your Boost", value: "Finish the action it applies to. For 'Other' boosts, use </boosting use:1429961744716927038>.", inline: false });
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

  await interaction.reply({
   embeds: [embed],
   ephemeral: true,
  });
  return;
 }

 // Validate village compatibility
 const isTestingChannel = interaction.channelId === TESTING_CHANNEL_ID;
 const villageValidation = validateVillageCompatibility(targetCharacter, boosterCharacter, isTestingChannel);
 if (!villageValidation.valid) {
  logger.error('BOOST', villageValidation.error);
  await interaction.reply({
   content: villageValidation.error,
   ephemeral: true,
  });
  return;
 }

 // Validate boost request - target character can request any boost category
 const boostRequestValidation = validateBoostRequest(targetCharacter, category);
 if (!boostRequestValidation.valid) {
  logger.error('BOOST', boostRequestValidation.error);
  await interaction.reply({
   content: boostRequestValidation.error,
   ephemeral: true,
  });
  return;
 }

   // Validate boost effect
  const boostEffectValidation = validateBoostEffect(boosterCharacter.job, category);
  if (!boostEffectValidation.valid) {
   logger.error('BOOST', `Error - ${boostEffectValidation.error}`);
   await interaction.reply({
    content: boostEffectValidation.error,
    ephemeral: true,
   });
   return;
  }

   // Scholar validation
  const scholarValidation = validateScholarVillageParameter(boosterCharacter.job, category, village);
  if (!scholarValidation.valid) {
   await interaction.reply({
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

const reply = await interaction.reply({
 content: `Boost request created. ${boosterOwnerMention} (**${boosterCharacter.name}**) run ${commandMention} within 24 hours.`,
 embeds: [embed]
}).then(response => response.fetch());

 // Save the message ID to TempData for later updates
 requestData.messageId = reply.id;
 requestData.channelId = reply.channelId;
 await saveBoostingRequestToTempData(requestData.boostRequestId, requestData);
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

 const boostEffectValidation = validateBoostEffect(booster.job, requestData.category);
 if (!boostEffectValidation.valid) {
  logger.error('BOOST', boostEffectValidation.error);
  await interaction.reply({
   content: boostEffectValidation.error,
   ephemeral: true,
  });
  return;
 }

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
  requestData.boosterJob = booster.job;
  requestData.requestedByIcon = (await fetchCharacterByName(requestData.targetCharacter))?.icon;
  requestData.boosterIcon = booster.icon;

 // Update the target character's boostedBy field
 const targetCharacter = await fetchCharacterByName(requestData.targetCharacter);
 if (targetCharacter) {
   targetCharacter.boostedBy = booster.name;
   
   // For Scholar Gathering boosts, store the target village in the boost data
   if (booster.job === 'Scholar' && requestData.category === 'Gathering' && requestData.targetVillage) {
     requestData.targetVillage = requestData.targetVillage;
   }
   
   await targetCharacter.save();
 } else {
   logger.error('BOOST', `Could not find target character "${requestData.targetCharacter}"`);
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
  await interaction.reply({
   content: "You do not own this character.",
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
  const boosterJob = boosterCharacter?.job || activeBoost.boosterJob || "Unknown";
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

async function handleBoostUse(interaction) {
 const characterName = interaction.options.getString("charactername");
 const targetVillage = interaction.options.getString("village");
 const userId = interaction.user.id;

 const character = await fetchCharacterWithFallback(characterName, userId);
 
 if (!character) {
  await interaction.reply({
   content: "You do not own this character.",
   ephemeral: true,
  });
  return;
 }

 const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
 const hasAcceptedBoost = activeBoost && activeBoost.status === "accepted";
 const isEntertainer = character.job === 'Entertainer';

 if (!hasAcceptedBoost) {
  if (isEntertainer) {
   await executeSongOfStorms(interaction, {
    entertainer: character,
    viaBoost: false,
    providedVillage: targetVillage
   });
   return;
  }

  await interaction.reply({
   content: `${characterName} does not have an active boost in the "Other" category.`,
   ephemeral: true,
  });
  return;
 }

 const currentTime = Date.now();

 if (activeBoost.category !== "Other") {
  if (isEntertainer) {
   await executeSongOfStorms(interaction, {
    entertainer: character,
    viaBoost: false,
    providedVillage: targetVillage
   });
   return;
  }

  await interaction.reply({
   content: `${characterName}'s active boost is for "${activeBoost.category}", not "Other". This command only works with "Other" category boosts.`,
   ephemeral: true,
  });
  return;
 }

 if (activeBoost.boostExpiresAt && currentTime > activeBoost.boostExpiresAt) {
  await interaction.reply({
   content: `${characterName}'s boost has expired.`,
   ephemeral: true,
  });
  return;
 }

 const boosterCharacter = await fetchCharacterByName(activeBoost.boostingCharacter);
 if (!boosterCharacter) {
  await interaction.reply({
   content: `Error retrieving boost effect for ${characterName}.`,
   ephemeral: true,
  });
  return;
 }

 // ============================================================================
 // ------------------- Fortune Teller: Weather Prediction -------------------
 // ============================================================================
 if (boosterCharacter.job === 'Fortune Teller') {
  const predictedVillages = ['Rudania', 'Inariko', 'Vhintl'];
  const selectedVillage = targetVillage || predictedVillages[Math.floor(Math.random() * predictedVillages.length)];
  const weatherTypes = ["sunny", "rainy", "stormy", "cloudy", "clear"];
  const predictedWeather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
  
  const embed = new EmbedBuilder()
   .setTitle("🔮 Weather Prediction")
   .setDescription(`**${character.name}** channels the power of **${boosterCharacter.name}** to glimpse into the future...`)
   .addFields([
    { name: "📍 Village", value: selectedVillage, inline: true },
    { name: "🌤️ Tomorrow's Weather", value: predictedWeather.charAt(0).toUpperCase() + predictedWeather.slice(1), inline: true },
    { name: "📅 Date", value: `<t:${Math.floor((Date.now() + 86400000) / 1000)}:D>`, inline: true },
    { name: "✨ Boost Used", value: "Fortune Teller's Premonition", inline: false }
   ])
   .setColor("#9B59B6")
   .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
   .setFooter({ text: "Weather prediction locked in for tomorrow!" });

  activeBoost.status = "fulfilled";
  activeBoost.fulfilledAt = Date.now();
  await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);

  character.boostedBy = null;
  await character.save();
  
  await interaction.reply({
   embeds: [embed],
   ephemeral: false,
  });
  
  logger.info('BOOST', `🔮 Fortune Teller "Other" boost used - Weather prediction for ${selectedVillage}: ${predictedWeather}`);
  return;
 }

 // ============================================================================
 // ------------------- Entertainer: Song of Storms -------------------
 // ============================================================================
 if (boosterCharacter.job === 'Entertainer') {
  await executeSongOfStorms(interaction, {
   entertainer: boosterCharacter,
   recipient: character,
   viaBoost: true,
   activeBoost,
   providedVillage: targetVillage
  });
  return;
 }

 // If we get here, the boost isn't Fortune Teller or Entertainer
 await interaction.reply({
  content: `${boosterCharacter.job} doesn't have an "Other" category boost that can be used with this command.`,
  ephemeral: true,
 });
}

async function executeSongOfStorms(interaction, options) {
 const {
  entertainer,
  recipient = null,
  viaBoost = false,
  activeBoost = null,
  providedVillage = null
 } = options || {};

 const { scheduleSpecialWeather } = require('../../services/weatherService');

 const selectedVillage = SONG_OF_STORMS_VILLAGES[Math.floor(Math.random() * SONG_OF_STORMS_VILLAGES.length)];
 const selectedWeather = SONG_OF_STORMS_SPECIAL_WEATHER[Math.floor(Math.random() * SONG_OF_STORMS_SPECIAL_WEATHER.length)];
 const overrideProvided = Boolean(providedVillage);

 try {
  const scheduleResult = await scheduleSpecialWeather(selectedVillage, selectedWeather, {
   triggeredBy: entertainer?.name || 'Unknown Entertainer',
   recipient: recipient?.name || null,
   source: viaBoost ? 'Song of Storms (Boosted)' : 'Song of Storms (Self)'
  });

  const activationTimestamp = scheduleResult?.startOfPeriod
   ? Math.floor(scheduleResult.startOfPeriod.getTime() / 1000)
   : Math.floor((Date.now() + 86400000) / 1000);

  const description = viaBoost
   ? `**${recipient?.name || 'A companion'}** plays the melody taught by **${entertainer?.name || 'an Entertainer'}**, and the skies tremble in response.`
   : `**${entertainer?.name || 'An Entertainer'}** performs the Song of Storms, letting the winds decide where tomorrow's spectacle unfolds.`;

  const embed = new EmbedBuilder()
   .setTitle("🎵 Song of Storms")
   .setDescription(description)
   .addFields([
    {
     name: "🎲 Selection",
     value: "The melody chooses randomly among Rudania, Inariko, and Vhintl. The exact village and weather remain hidden until the town halls post tomorrow's forecast.",
     inline: false
    },
    {
     name: "📅 Reveal",
     value: `<t:${activationTimestamp}:D>`,
     inline: true
    }
   ])
   .setColor("#E74C3C")
   .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
   .setFooter({ text: "The storm answers the song—find out where at dawn." });

  if (viaBoost && entertainer?.name) {
   embed.addFields({ name: "✨ Boost Used", value: `Entertainer ${entertainer.name}'s Song of Storms`, inline: false });
  }

  if (viaBoost && recipient?.name) {
   embed.addFields({ name: "🤝 Beneficiary", value: recipient.name, inline: false });
  }

  if (overrideProvided) {
   embed.addFields({
    name: "⚠️ Note",
    value: "Manual village selections are ignored—Song of Storms always lets the winds decide.",
    inline: false
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
   `🎵 Song of Storms triggered by ${entertainer?.name || 'Unknown'}${recipient ? ` for ${recipient.name}` : ''}: ${selectedWeather} in ${selectedVillage}`
  );
 } catch (error) {
  logger.error(
   'BOOST',
   `Song of Storms failed for ${entertainer?.name || 'Unknown Entertainer'}:`,
   error
  );

  const errorMessage = "❌ **Song of Storms falters.** Please try again later or contact a moderator.";

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
 const userId = interaction.user.id;

 const requestData = await retrieveBoostingRequestFromTempData(requestId);
 
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
 await saveBoostingRequestToTempData(requestId, requestData);

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
// ------------------- Module Exports -------------------
// ============================================================================

module.exports.isBoostActive = isBoostActive;
module.exports.getActiveBoostEffect = getActiveBoostEffect;
module.exports.getRemainingBoostTime = getRemainingBoostTime;
module.exports.retrieveBoostingRequestFromTempDataByCharacter = retrieveBoostingRequestFromTempDataByCharacter;
module.exports.saveBoostingRequestToTempData = saveBoostingRequestToTempData;
module.exports.retrieveBoostingRequestFromTempData = retrieveBoostingRequestFromTempData;

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
    const boostEffectValidation = validateBoostEffect(booster.job, requestData.category);
    const embedData = createBoostAppliedEmbedData(booster, targetCharacter, requestData, boostEffectValidation.boost);
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
