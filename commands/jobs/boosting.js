// ============================================================================
// ------------------- Imports and Dependencies -------------------
// ============================================================================

const { v4: uuidv4 } = require("uuid");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
 fetchCharacterByNameAndUserId,
 fetchCharacterByName,
} = require("../../database/db");
const { getBoostEffect } = require("../../modules/boostingModule");
const { getJobPerk } = require("../../modules/jobsModule");
const { useStamina } = require("../../modules/characterStatsModule");
const TempData = require("../../models/TempDataModel");

// ============================================================================
// ------------------- TempData Storage Functions -------------------
// ============================================================================

async function saveBoostingRequestToTempData(requestId, requestData) {
  try {
    console.log(`[boosting.js]: Attempting to save boost request ${requestId} with data:`, {
      targetCharacter: requestData.targetCharacter,
      boostingCharacter: requestData.boostingCharacter,
      status: requestData.status,
      category: requestData.category,
      targetVillage: requestData.targetVillage
    });
    
    // First try to find existing document
    let tempData = await TempData.findOne({ type: 'boosting', key: requestId });
    
    if (tempData) {
      // Update existing document
      tempData.data = requestData;
    } else {
      // Create new document with explicit expiresAt
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
      tempData = new TempData({
        type: 'boosting',
        key: requestId,
        data: requestData,
        expiresAt: expiresAt
      });
    }
    
    // Save the document (this will trigger pre-save middleware)
    const result = await tempData.save();
    
    console.log(`[boosting.js]: Successfully saved boosting request ${requestId} to TempData (48-hour expiration)`, {
      savedId: result._id,
      key: result.key,
      type: result.type,
      expiresAt: result.expiresAt,
      hasData: !!result.data,
      savedTargetVillage: result.data?.targetVillage
    });
  } catch (error) {
    console.error(`[boosting.js]: Error saving boosting request to TempData:`, error);
    throw error;
  }
}

async function retrieveBoostingRequestFromTempData(requestId) {
  try {
    const tempData = await TempData.findByTypeAndKey('boosting', requestId);
    if (tempData) {
      console.log(`[boosting.js] retrieveBoostingRequestFromTempData debug for ${requestId}:`, {
        found: true,
        targetVillage: tempData.data?.targetVillage,
        status: tempData.data?.status,
        category: tempData.data?.category
      });
      return tempData.data;
    } else {
      console.log(`[boosting.js] retrieveBoostingRequestFromTempData debug for ${requestId}:`, {
        found: false
      });
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

    // Debug info removed to reduce log bloat

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
        console.log(`[boosting.js] Found expired boost for ${characterName}, marking as expired`);
        requestData.status = "expired";
        await saveBoostingRequestToTempData(requestData.boostRequestId, requestData);
        
        // Clear the boostedBy field from the character when boost expires
        const targetCharacter = await fetchCharacterByName(characterName);
        if (targetCharacter && targetCharacter.boostedBy) {
          targetCharacter.boostedBy = null;
          await targetCharacter.save();
          console.log(`[boosting.js]: Cleared ${targetCharacter.name}.boostedBy due to expiration in retrieveBoostingRequestFromTempDataByCharacter`);
        }
      }
    }

    // Sort by timestamp (most recent first) and return the most recent active boost
    if (activeBoosts.length > 0) {
      activeBoosts.sort((a, b) => b.timestamp - a.timestamp);
      const mostRecentBoost = activeBoosts[0].requestData;
      
      console.log(`[boosting.js] Found ${activeBoosts.length} active boosts for ${characterName}, returning most recent`);
      
      return mostRecentBoost;
    }

    // Debug info removed to reduce log bloat
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
      .addChoices(
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
      )
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

 // Debug info removed to reduce log bloat

 let targetCharacter = await fetchCharacterByNameAndUserId(
  characterName,
  userId
 );
 
 // If not found as regular character, try as mod character
 if (!targetCharacter) {
   const { fetchModCharacterByNameAndUserId } = require('../../database/db');
   targetCharacter = await fetchModCharacterByNameAndUserId(characterName, userId);
 }
 
 let boosterCharacter = await fetchCharacterByName(boosterName);
 
 // If not found as regular character, try as mod character
 if (!boosterCharacter) {
   const { fetchModCharacterByNameAndUserId } = require('../../database/db');
   boosterCharacter = await fetchModCharacterByNameAndUserId(boosterName, userId);
 }

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

 // Check if we're in the testing channel to skip village restrictions
 const testingChannelId = '1391812848099004578';
 const isTestingChannel = interaction.channelId === testingChannelId;

 if (
  targetCharacter.currentVillage.toLowerCase() !==
  boosterCharacter.currentVillage.toLowerCase() &&
  !isTestingChannel
 ) {
  console.error(
   `[boosting.js]: Error - Characters are in different villages. Target: ${targetCharacter.currentVillage}, Booster: ${boosterCharacter.currentVillage}`
  );
  await interaction.reply({
   content: "❌ **Village Mismatch**\n\nBoth characters must be in the same village.\n\n💡 **Travel Tip:** Use </travel:1379850586987430009> to travel between villages and access characters in different locations!",
   ephemeral: true,
  });
  return;
 }

 const exemptCategories = [
  "Tokens",
  "Exploring",
  "Traveling",
  "Mounts",
  "Other",
 ];

 if (!exemptCategories.includes(category)) {
  const jobPerk = getJobPerk(targetCharacter.job);
  if (!jobPerk || !jobPerk.perks.includes(category.toUpperCase())) {
   console.error(
    `[boosting.js]: Error - Job "${targetCharacter.job}" does not support boost category "${category}" for character "${targetCharacter.name}".`
   );
   await interaction.reply({
    content: `**${targetCharacter.name}** cannot request a boost for **${category}** because their job (**${targetCharacter.job}**) does not support it.`,
    ephemeral: true,
   });
   return;
  }
 }

 const boosterJob = boosterCharacter.job;
 const boost = getBoostEffect(boosterJob, category);

 if (!boost) {
  console.error(
   `[boosting.js]: Error - No boost effect found for job "${boosterJob}" and category "${category}".`
  );
  await interaction.reply({
   content: `No boost found for job "${boosterJob}" in category "${category}".`,
   ephemeral: true,
  });
  return;
 }

 // Validate village parameter for Scholar Gathering boosts
 if (village && (boosterJob !== 'Scholar' || category !== 'Gathering')) {
  await interaction.reply({
   content: "❌ **Invalid Parameter**\n\nThe village option is only available for Scholar Gathering boosts.",
   ephemeral: true,
  });
  return;
 }

 if (boosterJob === 'Scholar' && category === 'Gathering' && !village) {
  await interaction.reply({
   content: "❌ **Scholar Gathering Boost Requires Target Village**\n\n**Cross-Region Insight** allows Scholar-boosted characters to gather items from another village's item table without physically being there.\n\n💡 **Please specify a target village** using the `village` option to enable cross-region gathering.\n\n**Example:** `/boosting request character:YourChar booster:ScholarName category:Gathering village:Inariko`",
   ephemeral: true,
  });
  return;
 }

 const { generateUniqueId } = require('../../utils/uniqueIdUtils');
 const boostRequestId = generateUniqueId('B');
 const currentTime = Date.now();

 const requestData = {
  boostRequestId,
  targetCharacter: targetCharacter.name,
  boostingCharacter: boosterCharacter.name,
  category,
  status: "pending",
  requesterUserId: userId,
  village: targetCharacter.currentVillage,
  targetVillage: village, // Store the target village for Scholar boosts
  timestamp: currentTime,
  createdAt: new Date().toISOString(),
  durationRemaining: null,
  fulfilledAt: null,
  boosterJob: boosterJob,
  boostEffect: `${boost.name} — ${boost.description}`,
  requestedByIcon: targetCharacter.icon,
  boosterIcon: boosterCharacter.icon
 };

 // Debug info removed to reduce log bloat

 // Save to TempData only
 await saveBoostingRequestToTempData(boostRequestId, requestData);

 // Import the new embed function
 const { createBoostRequestEmbed } = require('../../embeds/embeds');

   // Create the embed using the new function
  const requestDataForEmbed = {
    requestedBy: targetCharacter.name,
    booster: boosterCharacter.name,
    boosterJob: boosterJob,
    category: category,
    boostEffect: `${boost.name} — ${boost.description}`,
    village: targetCharacter.currentVillage,
    targetVillage: village, // Include target village for Scholar boosts
    requestedByIcon: targetCharacter.icon,
    boosterIcon: boosterCharacter.icon
  };

  const embed = createBoostRequestEmbed(requestDataForEmbed, boostRequestId);

   // Get the owner of the booster character
  const boosterOwnerId = boosterCharacter.userId;
  const boosterOwnerMention = `<@${boosterOwnerId}>`;
  
  const reply = await interaction.reply({
   content: `Boost request created. ${boosterOwnerMention} (**${boosterCharacter.name}**) run </boosting accept:1394790096338817195> within 24 hours.`,
   embeds: [embed]
  }).then(response => response.fetch());

  // Save the message ID to TempData for later updates
  requestData.messageId = reply.id;
  requestData.channelId = reply.channelId;
  await saveBoostingRequestToTempData(boostRequestId, requestData);
}

async function handleBoostAccept(interaction) {
 const requestId = interaction.options.getString("requestid");
 const boosterName = interaction.options.getString("character");
 const userId = interaction.user.id;

 // Debug info removed to reduce log bloat

 const requestData = await retrieveBoostingRequestFromTempData(requestId);
 
 // Debug info removed to reduce log bloat
 
 if (!requestData) {
  console.error(
   `[boosting.js]: Error - Invalid boost request ID "${requestId}".`
  );
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
   content:
    "This boost request has expired. Boost requests are only valid for 24 hours.",
   ephemeral: true,
  });
  return;
 }

 if (requestData.status !== "pending") {
  console.error(
   `[boosting.js]: Error - Boost request "${requestId}" is not pending (status: ${requestData.status}).`
  );
  await interaction.reply({
   content: "This request has already been fulfilled or expired.",
   ephemeral: true,
  });
  return;
 }

 let booster = await fetchCharacterByNameAndUserId(boosterName, userId);
 
 // If not found as regular character, try as mod character
 if (!booster) {
   const { fetchModCharacterByNameAndUserId } = require('../../database/db');
   booster = await fetchModCharacterByNameAndUserId(boosterName, userId);
 }
 
 if (!booster) {
  console.error(
   `[boosting.js]: Error - User does not own boosting character "${boosterName}".`
  );
  await interaction.reply({
   content: `You do not own the boosting character "${boosterName}".`,
   ephemeral: true,
  });
  return;
 }

 if (booster.name !== requestData.boostingCharacter) {
  console.error(
   `[boosting.js]: Error - Mismatch in boosting character. Request designated for "${requestData.boostingCharacter}", but provided "${booster.name}".`
  );
  await interaction.reply({
   content: `This request was made for **${requestData.boostingCharacter}**, not **${booster.name}**.`,
   ephemeral: true,
  });
  return;
 }

 const boost = getBoostEffect(booster.job, requestData.category);
 if (!boost) {
  console.error(
   `[boosting.js]: Error - No boost effect found for job "${booster.job}" and category "${requestData.category}".`
  );
  await interaction.reply({
   content: `No boost found for job "${booster.job}" in category "${requestData.category}".`,
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

 const fulfilledTime = Date.now();
 const boostDuration = 24 * 60 * 60 * 1000;
 const boostExpiresAt = fulfilledTime + boostDuration;

 requestData.status = "fulfilled";
 requestData.fulfilledAt = fulfilledTime;
 requestData.durationRemaining = boostDuration;
 requestData.boostExpiresAt = boostExpiresAt;

   // Update the target character's boostedBy field
  const targetCharacter = await fetchCharacterByName(requestData.targetCharacter);
  if (targetCharacter) {
    targetCharacter.boostedBy = booster.name;
    
    // For Scholar Gathering boosts, store the target village in the boost data
    if (booster.job === 'Scholar' && requestData.category === 'Gathering' && requestData.targetVillage) {
      // Store the target village in the boost data for cross-region gathering
      requestData.targetVillage = requestData.targetVillage;
      console.log(`[boosting.js]: Scholar boost applied - ${targetCharacter.name} can now gather from ${requestData.targetVillage} while staying in ${targetCharacter.currentVillage}`);
    }
    
    await targetCharacter.save();
    console.log(`[boosting.js]: Set ${targetCharacter.name}.boostedBy = ${booster.name}`);
  } else {
    console.error(`[boosting.js]: Error - Could not find target character "${requestData.targetCharacter}"`);
  }

   // Save to TempData only
  await saveBoostingRequestToTempData(requestId, requestData);

  // Update the original boost request embed to show fulfilled status
  const { updateBoostRequestEmbed } = require('../../embeds/embeds');
  await updateBoostRequestEmbed(interaction.client, requestData, 'fulfilled');

  // Import the new embed function
  const { createBoostAppliedEmbed } = require('../../embeds/embeds');

  // Create the embed using the new function
  const boostDataForEmbed = {
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
    boosterMaxHearts: booster.maxHearts
  };

  const embed = createBoostAppliedEmbed(boostDataForEmbed);

 await interaction.reply({
  content: `Boost has been applied and will remain active for 24 hours!`,
  embeds: [embed],
 });
}

async function handleBoostStatus(interaction) {
 const characterName = interaction.options.getString("charactername");
 const userId = interaction.user.id;

 let character = await fetchCharacterByNameAndUserId(characterName, userId);
 
 // If not found as regular character, try as mod character
 if (!character) {
   const { fetchModCharacterByNameAndUserId } = require('../../database/db');
   character = await fetchModCharacterByNameAndUserId(characterName, userId);
 }
 
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
    const { updateBoostRequestEmbed } = require('../../embeds/embeds');
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
  // Save to TempData only
  await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);

  // Update the original boost request embed to show expired status
  const { updateBoostRequestEmbed } = require('../../embeds/embeds');
  await updateBoostRequestEmbed(interaction.client, activeBoost, 'expired');

     // Clear the boostedBy field from the character
   if (character.boostedBy) {
     character.boostedBy = null;
     
     // Scholar Gathering boosts no longer change character location, so no restoration needed
     
     await character.save();
     console.log(`[boosting.js]: Cleared ${character.name}.boostedBy due to expiration`);
   }

  await interaction.reply({
   content: `${characterName}'s boost has expired.`,
   ephemeral: true,
  });
  return;
 }

 const timeRemaining = activeBoost.boostExpiresAt - currentTime;
 const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
 const minutesRemaining = Math.floor(
  (timeRemaining % (1000 * 60 * 60)) / (1000 * 60)
 );

 const boosterCharacter = await fetchCharacterByName(activeBoost.boostingCharacter);
 if (!boosterCharacter) {
  console.error(`[boosting.js]: Error - Could not find booster character "${activeBoost.boostingCharacter}"`);
  await interaction.reply({
   content: `Error retrieving boost effect for ${characterName}.`,
   ephemeral: true,
  });
  return;
 }

 const boost = getBoostEffect(
  boosterCharacter.job,
  activeBoost.category
 );

 if (!boost) {
  console.error(
   `[boosting.js]: Error - No boost effect found for booster "${activeBoost.boostingCharacter}" and category "${activeBoost.category}".`
  );
  await interaction.reply({
   content: `Error retrieving boost effect for ${characterName}.`,
   ephemeral: true,
  });
  return;
 }

   // Create fields array for the embed
  const fields = [
   { name: "Boost Type", value: boost.name, inline: true },
   { name: "Category", value: activeBoost.category, inline: true },
   { name: "Boosted By", value: activeBoost.boostingCharacter, inline: true },
   { name: "Effect", value: boost.description, inline: false },
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
