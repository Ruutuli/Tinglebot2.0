// ============================================================================
// ------------------- Imports and Dependencies -------------------
// ============================================================================

const { v4: uuidv4 } = require('uuid');
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
} = require('../../embeds/embeds');

// ============================================================================
// ------------------- Constants and Configuration -------------------
// ============================================================================

const BOOST_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const REQUEST_EXPIRATION = 48 * 60 * 60 * 1000; // 48 hours in milliseconds
const TESTING_CHANNEL_ID = '1391812848099004578';

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
 { name: "Healers", value: "Healers" },
 { name: "Stealing", value: "Stealing" },
 { name: "Vending", value: "Vending" },
 { name: "Tokens", value: "Tokens" },
 { name: "Exploring", value: "Exploring" },
 { name: "Traveling", value: "Traveling" },
 { name: "Mounts", value: "Mounts" },
 { name: "Other", value: "Other" }
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

/**
 * Asynchronously retrieves an active boost for a character based on character name and boost category.
 * Returns the boost request if it exists, is fulfilled, and the category matches; otherwise, null.
 */
async function fetchActiveBoost(characterName, category) {
  const request = retrieveBoostingRequestFromStorageByCharacter(characterName);
  if (!request) return null;
  if (request.status !== 'fulfilled') return null;
  if (request.category !== category) return null;
  return request;
}

/**
 * Validates boost effect for a job and category
 */
function validateBoostEffect(boosterJob, category) {
 console.log(`[validateBoostEffect]: boosterJob="${boosterJob}", category="${category}"`);
 const boost = getBoostEffect(boosterJob, category);
 console.log(`[validateBoostEffect]: boost result:`, boost);
 if (!boost) {
   console.log(`[validateBoostEffect]: No boost found - validation failed`);
   return {
     valid: false,
     error: `No boost found for job "${boosterJob}" in category "${category}".`
   };
 }
 console.log(`[validateBoostEffect]: Boost found - validation passed`);
 return { valid: true, boost };
}

/**
 * Validates village parameter for Scholar Gathering boosts
 */
function validateScholarVillageParameter(boosterJob, category, village) {
 console.log(`[validateScholarVillageParameter]: boosterJob="${boosterJob}", category="${category}", village="${village}"`);
 
 // Normalize job name for case-insensitive comparison
 const normalizedJob = boosterJob.toLowerCase();
 
 if (village && (normalizedJob !== 'scholar' || category !== 'Gathering')) {
   console.log(`[validateScholarVillageParameter]: Village provided but not Scholar Gathering boost`);
   return {
     valid: false,
     error: "❌ **Invalid Parameter**\n\nThe village option is only available for Scholar Gathering boosts."
   };
 }

 if (normalizedJob === 'scholar' && category === 'Gathering' && !village) {
   console.log(`[validateScholarVillageParameter]: Scholar Gathering boost without village - should fail`);
   return {
     valid: false,
     error: "❌ **Scholar Gathering Boost Requires Target Village**\n\n**Cross-Region Insight** allows Scholar-boosted characters to gather items from another village's item table without physically being there.\n\n💡 **Please specify a target village** using the `village` option to enable cross-region gathering.\n\n**Example:** `/boosting request character:YourChar booster:ScholarName category:Gathering village:Inariko`"
   };
 }

 console.log(`[validateScholarVillageParameter]: Validation passed`);
 return { valid: true };
}

/**
 * Validates if a character already has an active boost
 */
async function validateActiveBoost(targetCharacter) {
 // Check if the character has a boostedBy value (meaning they have an active boost)
 if (targetCharacter.boostedBy) {
   // Get the active boost details to show remaining time
   const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(targetCharacter.name);
   
   if (activeBoost && activeBoost.status === "fulfilled") {
     const currentTime = Date.now();
     if (activeBoost.boostExpiresAt && currentTime <= activeBoost.boostExpiresAt) {
       const timeRemaining = activeBoost.boostExpiresAt - currentTime;
       const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
       const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
       
       return {
         valid: false,
         error: `❌ **Active Boost Found**\n\n**${targetCharacter.name}** already has an active boost from **${targetCharacter.boostedBy}**.\n\n⏰ **Time remaining:** ${hoursRemaining}h ${minutesRemaining}m\n\n💡 **Tip:** You can only have one active boost at a time. Wait for the current boost to expire before requesting a new one.`
       };
     }
   }
 }
 
 // Allow requesting new boosts if boostedBy is null (no active boost)
 return { valid: true };
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
   boostRequestId: requestData.boostRequestId
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
    console.error(`[boosting.js]: Error saving boosting request to TempData:`, error);
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
    console.error(`[boosting.js]: Error retrieving boosting request from TempData:`, error);
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
        requestData.status === "fulfilled" &&
        requestData.boostExpiresAt &&
        currentTime <= requestData.boostExpiresAt
      ) {
        activeBoosts.push({
          requestData,
          timestamp: requestData.timestamp || 0
        });
      } else if (
        requestData.targetCharacter === characterName &&
        requestData.status === "fulfilled" &&
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
      
      return mostRecentBoost;
    }

    return null;
  } catch (error) {
    console.error(`[boosting.js]: Error retrieving active boost for ${characterName}:`, error);
    return null;
  }
}

// ============================================================================
// ------------------- Boost Utility Functions -------------------
// ============================================================================

async function isBoostActive(characterName, category) {
 const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);

 if (!activeBoost || activeBoost.status !== "fulfilled") {
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
  console.error(`[boosting.js]: Error - Could not find booster character "${activeBoost.boostingCharacter}"`);
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
  console.error(
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
  console.error(`[boosting.js]: Error - ${activeBoostValidation.error}`);
  await interaction.reply({
   content: activeBoostValidation.error,
   ephemeral: true,
  });
  return;
 }

 // Validate village compatibility
 const isTestingChannel = interaction.channelId === TESTING_CHANNEL_ID;
 const villageValidation = validateVillageCompatibility(targetCharacter, boosterCharacter, isTestingChannel);
 if (!villageValidation.valid) {
  console.error(`[boosting.js]: Error - ${villageValidation.error}`);
  await interaction.reply({
   content: villageValidation.error,
   ephemeral: true,
  });
  return;
 }

 // Validate boost request - target character can request any boost category
 const boostRequestValidation = validateBoostRequest(targetCharacter, category);
 if (!boostRequestValidation.valid) {
  console.error(`[boosting.js]: Error - ${boostRequestValidation.error}`);
  await interaction.reply({
   content: boostRequestValidation.error,
   ephemeral: true,
  });
  return;
 }

   // Validate boost effect
  console.log(`[boosting.js]: Boost effect validation - boosterJob: "${boosterCharacter.job}", category: "${category}"`);
  const boostEffectValidation = validateBoostEffect(boosterCharacter.job, category);
  console.log(`[boosting.js]: Boost effect validation result:`, boostEffectValidation);
  if (!boostEffectValidation.valid) {
   console.error(`[boosting.js]: Error - ${boostEffectValidation.error}`);
   await interaction.reply({
    content: boostEffectValidation.error,
    ephemeral: true,
   });
   return;
  }

   // Validate Scholar village parameter
  console.log(`[boosting.js]: Scholar validation - boosterJob: "${boosterCharacter.job}", category: "${category}", village: "${village}"`);
  const scholarValidation = validateScholarVillageParameter(boosterCharacter.job, category, village);
  console.log(`[boosting.js]: Scholar validation result:`, scholarValidation);
  if (!scholarValidation.valid) {
   console.log(`[boosting.js]: Scholar validation failed:`, scholarValidation.error);
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
 
 const reply = await interaction.reply({
  content: `Boost request created. ${boosterOwnerMention} (**${boosterCharacter.name}**) run </boosting accept:1394790096338817195> within 24 hours.`,
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
  console.error(`[boosting.js]: Error - Invalid boost request ID "${requestId}".`);
  await interaction.reply({
   content: "Invalid request ID.",
   ephemeral: true,
  });
  return;
 }

 const currentTime = Date.now();
 if (requestData.expiresAt && currentTime > requestData.expiresAt) {
  console.error(`[boosting.js]: Request "${requestId}" has expired.`);
  await interaction.reply({
   content: "This boost request has expired. Boost requests are only valid for 24 hours.",
   ephemeral: true,
  });
  return;
 }

 if (requestData.status !== "pending") {
  console.error(`[boosting.js]: Error - Boost request "${requestId}" is not pending (status: ${requestData.status}).`);
  await interaction.reply({
   content: "This request has already been fulfilled or expired.",
   ephemeral: true,
  });
  return;
 }

 const booster = await fetchCharacterWithFallback(boosterName, userId);
 
 if (!booster) {
  console.error(`[boosting.js]: Error - User does not own boosting character "${boosterName}".`);
  await interaction.reply({
   content: `You do not own the boosting character "${boosterName}".`,
   ephemeral: true,
  });
  return;
 }

 if (booster.name !== requestData.boostingCharacter) {
  console.error(`[boosting.js]: Error - Mismatch in boosting character. Request designated for "${requestData.boostingCharacter}", but provided "${booster.name}".`);
  await interaction.reply({
   content: `This request was made for **${requestData.boostingCharacter}**, not **${booster.name}**.`,
   ephemeral: true,
  });
  return;
 }

 const boostEffectValidation = validateBoostEffect(booster.job, requestData.category);
 if (!boostEffectValidation.valid) {
  console.error(`[boosting.js]: Error - ${boostEffectValidation.error}`);
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
  console.error(`[boosting.js]: Error deducting stamina from ${booster.name}:`, error);
  await interaction.reply({
   content: `❌ Error processing stamina cost for **${booster.name}**. Please try again.`,
   ephemeral: true,
  });
  return;
 }

 // Update request data with fulfillment details
 const fulfilledTime = Date.now();
 const boostExpiresAt = fulfilledTime + BOOST_DURATION;

 requestData.status = "fulfilled";
 requestData.fulfilledAt = fulfilledTime;
 requestData.durationRemaining = BOOST_DURATION;
 requestData.boostExpiresAt = boostExpiresAt;

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
   console.error(`[boosting.js]: Error - Could not find target character "${requestData.targetCharacter}"`);
 }

 // Save updated request data
 await saveBoostingRequestToTempData(requestId, requestData);

 // Update the original boost request embed to show fulfilled status
  await updateBoostRequestEmbed(interaction.client, requestData, 'fulfilled');

 // Create and send boost applied embed
  const embedData = createBoostAppliedEmbedData(booster, targetCharacter, requestData, boostEffectValidation.boost);
  const embed = createBoostAppliedEmbed(embedData);

 await interaction.reply({
  content: `Boost has been applied and will remain active for 24 hours!`,
  embeds: [embed],
 });
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

 const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
 const currentTime = Date.now();
 
 if (!activeBoost || activeBoost.status !== "fulfilled") {
  // If there's a pending boost that has expired, update its embed
  if (activeBoost && activeBoost.status === "pending" && activeBoost.boostExpiresAt && currentTime > activeBoost.boostExpiresAt) {
    activeBoost.status = "expired";
    await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);
    
    // Update the embed to show expired status
    await updateBoostRequestEmbed(interaction.client, activeBoost, 'expired');
  }
  
  await interaction.reply({
   content: `${characterName} does not have any active boosts.`,
   ephemeral: true,
  });
  return;
 }

 if (activeBoost.boostExpiresAt && currentTime > activeBoost.boostExpiresAt) {
  activeBoost.status = "expired";
  await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);

  // Update the original boost request embed to show expired status
  await updateBoostRequestEmbed(interaction.client, activeBoost, 'expired');

  // Clear the boostedBy field from the character
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

 const timeRemaining = activeBoost.boostExpiresAt - currentTime;
 const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
 const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

 const boosterCharacter = await fetchCharacterByName(activeBoost.boostingCharacter);
 if (!boosterCharacter) {
  console.error(`[boosting.js]: Error - Could not find booster character "${activeBoost.boostingCharacter}"`);
  await interaction.reply({
   content: `Error retrieving boost effect for ${characterName}.`,
   ephemeral: true,
  });
  return;
 }

 const boostEffectValidation = validateBoostEffect(boosterCharacter.job, activeBoost.category);
 if (!boostEffectValidation.valid) {
  console.error(`[boosting.js]: Error - ${boostEffectValidation.error}`);
  await interaction.reply({
   content: `Error retrieving boost effect for ${characterName}.`,
   ephemeral: true,
  });
  return;
 }

 // Create fields array for the embed
 const fields = [
  { name: "Boost Type", value: boostEffectValidation.boost.name, inline: true },
  { name: "Category", value: activeBoost.category, inline: true },
  { name: "Boosted By", value: activeBoost.boostingCharacter, inline: true },
  { name: "Effect", value: boostEffectValidation.boost.description, inline: false },
  {
   name: "Time Remaining",
   value: `${hoursRemaining}h ${minutesRemaining}m`,
   inline: true,
  },
  {
   name: "Expires",
   value: `<t:${Math.floor(activeBoost.boostExpiresAt / 1000)}:R>`,
   inline: true,
  }
 ];

 // Add cross-region gathering information for Scholar Gathering boosts
 if (activeBoost.boosterJob === 'Scholar' && activeBoost.category === 'Gathering' && activeBoost.targetVillage) {
   fields.push({
     name: "🎯 Cross-Region Gathering",
     value: `**Can gather from:** ${activeBoost.targetVillage}\n**Current location:** ${character.currentVillage}\n*Character stays in current location while gathering from target village*`,
     inline: false
   });
 }

 const embed = new EmbedBuilder()
  .setTitle(`Active Boost Status: ${characterName}`)
  .addFields(fields)
  .setColor("#4CAF50")
  .setFooter({ text: "Boost will automatically expire when duration ends" });

 await interaction.reply({
  embeds: [embed],
  ephemeral: true,
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
