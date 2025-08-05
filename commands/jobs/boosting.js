const { v4: uuidv4 } = require("uuid");
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const {
 fetchCharacterByNameAndUserId,
 fetchCharacterByName,
} = require("../../database/db");
const { getBoostEffect } = require("../../modules/boostingModule");
const { getJobPerk } = require("../../modules/jobsModule");
const { useStamina } = require("../../modules/characterStatsModule");
const {
 saveBoostingRequestToStorage,
 retrieveBoostingRequestFromStorage,
 retrieveBoostingRequestFromStorageByCharacter,
} = require("../../utils/storage");
const TempData = require("../../models/TempDataModel");

// ------------------- TempData Storage Functions for Boosting -------------------
async function saveBoostingRequestToTempData(requestId, requestData) {
  try {
    await TempData.findOneAndUpdate(
      { type: 'boosting', key: requestId },
      { 
        data: requestData,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      },
      { upsert: true, new: true }
    );
    console.log(`[boosting.js]: Saved boosting request ${requestId} to TempData`);
  } catch (error) {
    console.error(`[boosting.js]: Error saving boosting request to TempData:`, error);
    throw error;
  }
}

async function retrieveBoostingRequestFromTempData(requestId) {
  try {
    const tempData = await TempData.findByTypeAndKey('boosting', requestId);
    return tempData ? tempData.data : null;
  } catch (error) {
    console.error(`[boosting.js]: Error retrieving boosting request from TempData:`, error);
    return null;
  }
}

async function retrieveBoostingRequestFromTempDataByCharacter(characterName) {
  try {
    const allBoostingData = await TempData.findAllByType('boosting');
    const currentTime = Date.now();

    for (const tempData of allBoostingData) {
      const requestData = tempData.data;
      if (
        requestData.targetCharacter === characterName &&
        requestData.status === "fulfilled"
      ) {
        if (
          requestData.boostExpiresAt &&
          currentTime <= requestData.boostExpiresAt
        ) {
          return requestData;
        } else if (
          requestData.boostExpiresAt &&
          currentTime > requestData.boostExpiresAt
        ) {
          requestData.status = "expired";
          await saveBoostingRequestToTempData(requestData.boostRequestId, requestData);
        }
      }
    }

    return null;
  } catch (error) {
    console.error(`[boosting.js]: Error retrieving active boost for ${characterName}:`, error);
    return null;
  }
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

 async execute(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "request") {
   const characterName = interaction.options.getString("character");
   const boosterName = interaction.options.getString("booster");
   const category = interaction.options.getString("category");
   const userId = interaction.user.id;

   const targetCharacter = await fetchCharacterByNameAndUserId(
    characterName,
    userId
   );
   const boosterCharacter = await fetchCharacterByName(boosterName);

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

   if (
    targetCharacter.currentVillage.toLowerCase() !==
    boosterCharacter.currentVillage.toLowerCase()
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

   const boostRequestId = uuidv4().slice(0, 8).toUpperCase();
   const currentTime = Date.now();
   const expirationTime = currentTime + 24 * 60 * 60 * 1000;

   const requestData = {
    boostRequestId,
    targetCharacter: targetCharacter.name,
    boostingCharacter: boosterCharacter.name,
    category,
    status: "pending",
    requesterUserId: userId,
    village: targetCharacter.currentVillage,
    timestamp: currentTime,
    expiresAt: expirationTime,
    createdAt: new Date().toISOString(),
    durationRemaining: null,
    fulfilledAt: null,
   };

       // Save to both old storage (for backward compatibility) and new TempData
    saveBoostingRequestToStorage(boostRequestId, requestData);
    await saveBoostingRequestToTempData(boostRequestId, requestData);

    const embed = new EmbedBuilder()
    .setTitle("Boost Request Created")
    .addFields(
     { name: "Requested By", value: targetCharacter.name, inline: true },
     { name: "Booster", value: boosterCharacter.name, inline: true },
     { name: "Booster Job", value: boosterJob, inline: true },
     { name: "Category", value: category },
     { name: "Boost Effect", value: `*${boost.name}* — ${boost.description}` },
     { name: "Request ID", value: boostRequestId },
     {
      name: "Expires",
      value: `<t:${Math.floor(expirationTime / 1000)}:R>`,
      inline: true,
     },
     { name: "Village", value: targetCharacter.currentVillage, inline: true }
    )
    .setColor("#6f42c1")
    .setFooter({
     text: "This request will expire in 24 hours if not accepted.",
    });

   await interaction.reply({
    content: `Boost request created. Ask **${boosterCharacter.name}** to run \`/boosting accept\` within 24 hours.`,
    embeds: [embed],
   });
  } else if (subcommand === "accept") {
   const requestId = interaction.options.getString("requestid");
   const boosterName = interaction.options.getString("character");
   const userId = interaction.user.id;

   // Try to retrieve from TempData first, then fallback to old storage
   let requestData = await retrieveBoostingRequestFromTempData(requestId);
   if (!requestData) {
    requestData = retrieveBoostingRequestFromStorage(requestId);
   }
   
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

   const booster = await fetchCharacterByNameAndUserId(boosterName, userId);
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

   // Save to both old storage and new TempData
   saveBoostingRequestToStorage(requestId, requestData);
   await saveBoostingRequestToTempData(requestId, requestData);

   const embed = new EmbedBuilder()
    .setTitle(`Boost Applied: ${boost.name}`)
    .addFields(
     { name: "Boosted By", value: booster.name, inline: true },
     { name: "Booster Job", value: booster.job, inline: true },
     { name: "Target", value: requestData.targetCharacter, inline: true },
     { name: "Category", value: requestData.category },
     { name: "Effect", value: boost.description },
     { name: "Duration", value: "24 hours", inline: true },
     {
      name: "Expires",
      value: `<t:${Math.floor(boostExpiresAt / 1000)}:R>`,
      inline: true,
     },
     { name: "Stamina Cost", value: "1 stamina used", inline: true }
    )
    .setColor("#00cc99")
    .setFooter({
     text: `Boost fulfilled by ${booster.name} and will last 24 hours`,
    });

   await interaction.reply({
    content: `Boost has been applied and will remain active for 24 hours!`,
    embeds: [embed],
   });
  } else if (subcommand === "status") {
   const characterName = interaction.options.getString("charactername");
   const userId = interaction.user.id;

   const character = await fetchCharacterByNameAndUserId(characterName, userId);
   if (!character) {
    await interaction.reply({
     content: "You do not own this character.",
     ephemeral: true,
    });
    return;
   }

   // Try to retrieve from TempData first, then fallback to old storage
   let activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
   if (!activeBoost) {
    activeBoost = retrieveBoostingRequestFromStorageByCharacter(characterName);
   }

   if (!activeBoost || activeBoost.status !== "fulfilled") {
    await interaction.reply({
     content: `${characterName} does not have any active boosts.`,
     ephemeral: true,
    });
    return;
   }

   const currentTime = Date.now();
   if (activeBoost.boostExpiresAt && currentTime > activeBoost.boostExpiresAt) {
    activeBoost.status = "expired";
    // Save to both old storage and new TempData
    saveBoostingRequestToStorage(activeBoost.boostRequestId, activeBoost);
    await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);

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

   const boost = getBoostEffect(
    activeBoost.boostingCharacter,
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

   const embed = new EmbedBuilder()
    .setTitle(`Active Boost Status: ${characterName}`)
    .addFields(
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
    )
    .setColor("#4CAF50")
    .setFooter({ text: "Boost will automatically expire when duration ends" });

   await interaction.reply({
    embeds: [embed],
    ephemeral: true,
   });
  }
 },
};

async function isBoostActive(characterName, category) {
 // Try to retrieve from TempData first, then fallback to old storage
 let activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
 if (!activeBoost) {
  activeBoost = retrieveBoostingRequestFromStorageByCharacter(characterName);
 }

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

 // Try to retrieve from TempData first, then fallback to old storage
 let activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
 if (!activeBoost) {
  activeBoost = retrieveBoostingRequestFromStorageByCharacter(characterName);
 }
 return getBoostEffect(activeBoost.boostingCharacter, category);
}

async function getRemainingBoostTime(characterName, category) {
 if (!(await isBoostActive(characterName, category))) {
  return 0;
 }

 // Try to retrieve from TempData first, then fallback to old storage
 let activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(characterName);
 if (!activeBoost) {
  activeBoost = retrieveBoostingRequestFromStorageByCharacter(characterName);
 }
 const currentTime = Date.now();
 return Math.max(0, activeBoost.boostExpiresAt - currentTime);
}

module.exports.isBoostActive = isBoostActive;
module.exports.getActiveBoostEffect = getActiveBoostEffect;
module.exports.getRemainingBoostTime = getRemainingBoostTime;
