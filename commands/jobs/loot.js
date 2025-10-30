// ------------------- Import Section -------------------

// Standard Libraries
// (No standard libraries imported here)

// Third-Party Libraries
const { SlashCommandBuilder, EmbedBuilder } = require("discord.js"); // Used to create slash commands for Discord bots
const { v4: uuidv4 } = require("uuid"); // Generates unique identifiers
const dotenv = require('dotenv');
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });

// Database Services
const {
 fetchCharacterByNameAndUserId,
 fetchItemsByMonster,
} = require("../../database/db.js");
const { handleInteractionError } = require("../../utils/globalErrorHandler.js");

// Utilities
const {
 authorizeSheets,
 appendSheetData,
 safeAppendDataToSheet,
} = require("../../utils/googleSheetsUtils.js");
const {
 extractSpreadsheetId,
 isValidGoogleSheetsUrl,
} = require("../../utils/validation.js");
const { addItemInventoryDatabase } = require("../../utils/inventoryUtils.js");
const logger = require("../../utils/logger.js");
const { isBloodMoonActive } = require("../../scripts/bloodmoon.js");
const { checkInventorySync } = require('../../utils/characterUtils');
const { enforceJail } = require('../../utils/jailCheck');
const { getWeatherWithoutGeneration } = require('../../services/weatherService');

// Modules - Job, Location, Damage, and Formatting Logic
const { getJobPerk, isValidJob } = require("../../modules/jobsModule.js");
const { getVillageRegionByName } = require("../../modules/locationsModule.js");
const { getEncounterOutcome } = require("../../modules/encounterModule.js");
const { capitalizeWords } = require("../../modules/formattingModule.js");
const {
 activateJobVoucher,
 validateJobVoucher,
 fetchJobVoucherItem,
 deactivateJobVoucher,
 getJobVoucherErrorMessage
} = require("../../modules/jobVoucherModule.js"); // Importing jobVoucherModule

// ------------------- Boosting Module -------------------
// Import boosting functionality for applying job-based boosts
const { applyLootingBoost, applyLootingDamageBoost, applyLootingQuantityBoost, getCharacterBoostStatus } = require("../../modules/boostIntegration");

// Modules - RNG Logic
const {
 createWeightedItemList,
 getMonsterEncounterFromList,
 getMonstersByCriteria,
 calculateFinalValue,
 getRandomBloodMoonEncounter,
} = require("../../modules/rngModule.js");

// Event Handlers
const { triggerRaid } = require('../../modules/raidModule.js');
const { capitalizeVillageName } = require('../../utils/stringUtils');

// Flavor Text and Messages
const {
 generateFinalOutcomeMessage,
 generateVictoryMessage,
 generateDamageMessage,
 generateDefenseBuffMessage,
 generateAttackBuffMessage,
} = require("../../modules/flavorTextModule.js");

// Embeds
const {
 createMonsterEncounterEmbed,
 createNoEncounterEmbed,
 createBlightStage3NoEncounterEmbed,
 createKOEmbed,
  updateBoostRequestEmbed,
} = require("../../embeds/embeds.js");

// Models
const Character = require("../../models/CharacterModel.js");
const User = require("../../models/UserModel.js");

// Character Stats
const { handleKO } = require("../../modules/characterStatsModule.js");

// Boost TempData helpers
const {
  retrieveBoostingRequestFromTempDataByCharacter,
  saveBoostingRequestToTempData
} = require('../../commands/jobs/boosting.js');

const villageChannels = {
 Rudania: process.env.RUDANIA_TOWNHALL,
 Inariko: process.env.INARIKO_TOWNHALL,
 Vhintl: process.env.VHINTL_TOWNHALL,
};

// Modules - Weather Logic
const { getCurrentWeather } = require('../../services/weatherService');

// ------------------- Helper Functions -------------------

// Unified error handling
async function handleLootError(interaction, error, context = '') {
  handleInteractionError(error, "loot.js", {
    operation: 'handleLootError',
    commandName: interaction.commandName || 'loot',
    userTag: interaction.user.tag,
    userId: interaction.user.id,
    context
  });
  await interaction.editReply({
    content: `❌ **An error occurred during the loot command execution${context ? `: ${context}` : ''}.**`,
  });
}

// Unified character update
async function updateCharacterLootTimestamp(character, shouldClearBoost = true, client = null) {
  character.lastLootedAt = new Date().toISOString();
  
  // ------------------- Clear Boost After Use -------------------
  if (character.boostedBy && shouldClearBoost) {
    logger.info('BOOST', `Clearing boost for ${character.name}`);
    try {
      // Mark active boost as fulfilled in TempData and update embed
      const { retrieveBoostingRequestFromTempDataByCharacter, saveBoostingRequestToTempData, updateBoostAppliedMessage } = require('./boosting.js');
      const { updateBoostRequestEmbed } = require('../../embeds/embeds.js');
      const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(character.name);
      if (activeBoost && (activeBoost.status === 'accepted' || activeBoost.status === 'pending')) {
        activeBoost.status = 'fulfilled';
        activeBoost.fulfilledAt = Date.now();
        await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);
        // If client provided, update the request embed status to fulfilled
        if (client) {
          try {
            await updateBoostRequestEmbed(client, activeBoost, 'fulfilled');
            // Update the 'Boost Applied' embed if we have its reference
            await updateBoostAppliedMessage(client, activeBoost);
          } catch (embedErr) {
            logger.error('BOOST', `Failed to update request embed to fulfilled: ${embedErr.message}`);
          }
        }
      }
    } catch (e) {
      logger.error('BOOST', `Failed to mark boost fulfilled while clearing for ${character.name}: ${e.message}`);
    }
    character.boostedBy = null;
  } else if (character.boostedBy && !shouldClearBoost) {
    logger.info('BOOST', `Boost preserved for ${character.name}`);
  }
  
  await character.save();
}

// Unified embed creation
async function sendNoEncounterEmbed(interaction, character, bloodMoonActive) {
  const embed = createNoEncounterEmbed(character, bloodMoonActive);
  await interaction.editReply({ embeds: [embed] });
}

// Unified character validation
async function validateCharacterForLoot(interaction, characterName, userId) {
  let character = await fetchCharacterByNameAndUserId(characterName, userId);
  
  // If not found as regular character, try as mod character
  if (!character) {
    const { fetchModCharacterByNameAndUserId } = require('../../database/db');
    character = await fetchModCharacterByNameAndUserId(characterName, userId);
    
    if (character && character.isModCharacter) {
      logger.info('CHARACTER', `Mod character ${character.name} detected`);
    } else if (!character) {
      await interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Character Not Found',
          description: `Character \`${characterName}\` not found or does not belong to you.`,
          image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
          },
          footer: {
            text: 'Character Validation'
          }
        }],
        ephemeral: true
      });
      return null;
    }
  }

  return character;
}

// Unified job validation
async function validateJobForLoot(interaction, character, job) {
  if (!job || typeof job !== "string" || !job.trim() || !isValidJob(job)) {
    logger.warn('LOOT', `Invalid job "${job}" for ${character.name}`);
    await interaction.editReply({
      content: getJobVoucherErrorMessage('MISSING_SKILLS', {
        characterName: character.name,
        jobName: job || "None"
      }).message,
      ephemeral: true,
    });
    return false;
  }

  const jobPerkInfo = getJobPerk(job);
  if (!jobPerkInfo || !jobPerkInfo.perks.includes("LOOTING")) {
    logger.warn('LOOT', `${character.name} lacks required skills for job: "${job}"`);
    await interaction.editReply({
      embeds: [{
        color: 0x008B8B,
        description: `*${character.name} looks at their hands, unsure of how to proceed...*\n\n**Job Skill Mismatch**\n${character.name} cannot use the looting perk as a ${capitalizeWords(job)} because they lack the necessary looting skills.`,
        image: {
          url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
        },
        footer: {
          text: 'Job Skill Check'
        }
      }],
      ephemeral: true
    });
    return false;
  }
  return true;
}

// Check if a daily roll is available for a specific activity
function canUseDailyRoll(character, activity) {
  // If character has an active job voucher, they can always use the command
  if (character.jobVoucher) {
    return true;
  }

  // Special case for test characters
  if (character.name === 'Tingle test' || character.name === 'Tingle' || character.name === 'John') {
    return true;
  }

  const now = new Date();
  // Compute the most recent 12:00 UTC (8am EST) rollover
  const rollover = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0));
  if (now < rollover) {
    // If before today's 12:00 UTC, use yesterday's 12:00 UTC
    rollover.setUTCDate(rollover.getUTCDate() - 1);
  }

  // Check both gather and loot activities since they share the same daily limit
  const lastGatherRoll = character.dailyRoll?.get('gather');
  const lastLootRoll = character.dailyRoll?.get('loot');
  
  if (!lastGatherRoll && !lastLootRoll) {
    return true;
  }

  const lastGatherDate = lastGatherRoll ? new Date(lastGatherRoll) : null;
  const lastLootDate = lastLootRoll ? new Date(lastLootRoll) : null;
  
  // If either activity was used today, deny the action
  if (lastGatherDate && lastGatherDate >= rollover) {
    return false;
  }
  if (lastLootDate && lastLootDate >= rollover) {
    return false;
  }

  return true;
}

// Update the daily roll timestamp for an activity
async function updateDailyRoll(character, activity) {
  try {
    if (!character.dailyRoll) {
      character.dailyRoll = new Map();
    }
    const now = new Date().toISOString();
    character.dailyRoll.set(activity, now);
    await character.save();
  } catch (error) {
    logger.error('LOOT', `Failed to update daily roll for ${character.name}`);
    throw error;
  }
}

// ------------------- Command Definition -------------------

// Define the `loot` slash command, allowing users to loot items based on their character's job and location
module.exports = {
 data: new SlashCommandBuilder()
  .setName("loot") // Command name
  .setDescription("Loot items based on your character's job and location") // Description of the command
  .addStringOption((option) =>
   option
    .setName("charactername")
    .setDescription("The name of the character")
    .setRequired(true)
    .setAutocomplete(true)
  ),

 // ------------------- Main Execution Logic -------------------
 async execute(interaction) {
  try {
   logger.info('LOOT', `Starting for ${interaction.user.tag}`);
   
   await interaction.deferReply();

   // ------------------- Step 1: Validate Character -------------------
   const characterName = interaction.options.getString("charactername");
   const userId = interaction.user.id;

   let character = await validateCharacterForLoot(interaction, characterName, userId);
   
   // If character validation failed, return early
   if (!character) {
     return;
   }

   // ------------------- Step 2: Check Hearts and Job Validity -------------------
   if (character.currentHearts === 0) {
    const embed = createKOEmbed(
      character,
      '> **KO\'d characters cannot loot! Please heal your character.**\n' +
      '> Use </item:1379838613067530385> or </heal:1390420428840894557>.'
    );
    await interaction.editReply({ embeds: [embed] });
    return;
   }

       // Determine job based on jobVoucher or default job
    let job = character.jobVoucher && character.jobVoucherJob ? character.jobVoucherJob : character.job;
    logger.info('LOOT', `${character.name} using job: ${job}${character.jobVoucher ? ' (voucher)' : ''}`);

    // Validate job BEFORE any other checks
    if (!await validateJobForLoot(interaction, character, job)) {
     return;
    }

    // Check if character is in jail
    if (await enforceJail(interaction, character)) {
      return;
    }

    // ------------------- Step 3: Validate Interaction Channel -------------------
    let currentVillage = capitalizeWords(character.currentVillage);
    let allowedChannel = villageChannels[currentVillage];

    // If using a job voucher for a village-exclusive job, override to required village
    if (character.jobVoucher && character.jobVoucherJob) {
      const voucherPerk = getJobPerk(character.jobVoucherJob);
      if (voucherPerk && voucherPerk.village) {
        const requiredVillage = capitalizeWords(voucherPerk.village);
        currentVillage = requiredVillage;
        allowedChannel = villageChannels[requiredVillage];
      }
    }

    // Allow testing in specific channel
    const testingChannelId = '1391812848099004578';
    const isTestingChannel = interaction.channelId === testingChannelId;

    if (!allowedChannel || (interaction.channelId !== allowedChannel && !isTestingChannel)) {
     const channelMention = `<#${allowedChannel}>`;
     await interaction.editReply({
       embeds: [{
         color: 0x008B8B, // Dark cyan color
         description: `*${character.name} looks around, confused by their surroundings...*\n\n**Channel Restriction**\nYou can only use this command in the ${currentVillage} Town Hall channel!\n\n📍 **Current Location:** ${capitalizeWords(character.currentVillage)}\n💬 **Command Allowed In:** ${channelMention}`,
         image: {
           url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
         },
         footer: {
           text: 'Channel Restriction'
         }
       }],
       ephemeral: true
     });
     return;
    }

       // Validate job voucher (without consuming it)
    let voucherCheck;
    if (character.jobVoucher) {
      voucherCheck = await validateJobVoucher(character, job, 'LOOTING');
      if (!voucherCheck.success) {
        await interaction.editReply({
          content: voucherCheck.message,
          ephemeral: true
        });
        return;
      }
    }

   // ---- Blight Rain Infection Check ----
   const weather = await getWeatherWithoutGeneration(character.currentVillage);
   let blightRainMessage = null;
   if (weather?.special?.label === 'Blight Rain') {
     // Mod characters are immune to blight infection
     if (character.isModCharacter) {
       blightRainMessage =
         "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
         `◈ Your character **${character.name}** is a ${character.modTitle} of ${character.modType} and is immune to blight infection! ◈`;
       logger.info('BLIGHT', `Mod character ${character.name} immune to blight`);
     } else if (character.blighted) {
       blightRainMessage =
         "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
         `◈ Your character **${character.name}** braved the blight rain, but they're already blighted... guess it doesn't matter! ◈`;
       logger.info('BLIGHT', `${character.name} already blighted`);
     } else {
       // Check for resistance buffs
       const { getActiveBuffEffects, shouldConsumeElixir, consumeElixirBuff } = require('../../modules/elixirModule');
       const buffEffects = getActiveBuffEffects(character);
       let infectionChance = 0.75; // Base 75% chance
       
                 // Apply resistance buffs
          if (buffEffects && buffEffects.blightResistance > 0) {
            infectionChance -= (buffEffects.blightResistance * 0.3); // Each level reduces by 30%
            logger.info('BLIGHT', `🧪 Blight resistance buff applied - infection chance now ${infectionChance}`);
          }
       if (buffEffects && buffEffects.fireResistance > 0) {
         infectionChance -= (buffEffects.fireResistance * 0.05); // Each level reduces by 5%
         logger.info('BLIGHT', `🧪 Fire resistance buff applied - infection chance reduced`);
       }
       
       // Consume elixirs after applying their effects
       if (shouldConsumeElixir(character, 'loot', { blightRain: true })) {
         consumeElixirBuff(character);
         // Update character in database
         const { updateCharacterById, updateModCharacterById } = require('../../database/db.js');
         const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
         await updateFunction(character._id, { buff: character.buff });
       } else if (character.buff?.active) {
         // Log when elixir is not used due to conditions not met
         logger.info('ELIXIR', `Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
       }
       
       // Ensure chance stays within reasonable bounds
       infectionChance = Math.max(0.1, Math.min(0.95, infectionChance));
       
       if (Math.random() < infectionChance) {
         blightRainMessage = 
           "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
           `◈ Oh no... your character **${character.name}** has come into contact with the blight rain and has been **blighted**! ◈\n\n` +
           "🏥 **Healing Available:** You can be healed by **Oracles, Sages & Dragons**\n" +
           "📋 **Blight Information:** [Learn more about blight stages and healing](https://rootsofthewild.com/world/blight)\n\n" +
           "⚠️ **STAGE 1:** Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms. At this stage you can be helped by having one of the sages, oracles or dragons heal you.\n\n" +
           "🎲 **Daily Rolling:** **Starting tomorrow, you'll be prompted to roll in the Community Board each day to see if your blight gets worse!**\n*You will not be penalized for missing today's blight roll if you were just infected.*";
         // Update character in DB
         character.blighted = true;
         character.blightedAt = new Date();
         character.blightStage = 1;
         
         await character.save();
         // Assign blighted role
         const guild = interaction.guild;
         if (guild) {
           const member = await guild.members.fetch(interaction.user.id);
           await member.roles.add('798387447967907910');
         }
         
         // Update user's blightedcharacter status
         const user = await User.findOne({ discordId: interaction.user.id });
         if (user) {
           user.blightedcharacter = true;
           await user.save();
         }
         return; // Return early only on blight infection
       } else {
         let safeMsg = "<:blight_eye:805576955725611058> **Blight Rain!**\n\n";
         
         if (buffEffects && (buffEffects.blightResistance > 0 || buffEffects.fireResistance > 0)) {
           safeMsg += `◈ Your character **${character.name}** braved the blight rain and managed to avoid infection thanks to their elixir buffs! ◈\n`;
           safeMsg += "The protective effects of your elixir kept you safe from the blight.";
           
           // Consume chilly or fireproof elixirs after use
           if (shouldConsumeElixir(character, 'loot', { blightRain: true })) {
             consumeElixirBuff(character);
             // Update character in database
             const { updateCharacterById, updateModCharacterById } = require('../../database/db.js');
             const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
             await updateFunction(character._id, { buff: character.buff });
             safeMsg += "\n\n🧪 **Elixir consumed!** The protective effects have been used up.";
           } else if (character.buff?.active) {
             // Log when elixir is not used due to conditions not being met
            logger.info('ELIXIR', `Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
           }
         } else {
           safeMsg += `◈ Your character **${character.name}** braved the blight rain but managed to avoid infection this time! ◈\n`;
           safeMsg += "You feel lucky... but be careful out there.";
         }
         
         blightRainMessage = safeMsg;
        logger.info('BLIGHT', `🧿 Character ${character.name} avoided blight infection`);
       }
     }
   }

   // Check inventory sync before proceeding
   try {
     await checkInventorySync(character);
   } catch (error) {
     if (error.message.includes('inventory is not synced')) {
       await interaction.editReply({
         embeds: [{
           color: 0xFF0000, // Red color
           title: '❌ Inventory Not Synced',
           description: error.message,
           fields: [
             {
               name: 'How to Fix',
               value: '1. Use `/inventory test` to test your inventory\n2. Use `/inventory sync` to sync your inventory'
             }
           ],
           image: {
             url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
           },
           footer: {
             text: 'Inventory Sync Required'
           }
         }],
         ephemeral: true
       });
       return;
     }
     await interaction.editReply({
       content: error.message,
       ephemeral: true
     });
     return;
   }

   if (character.debuff?.active) {
    const debuffEndDate = new Date(character.debuff.endDate);
    const now = new Date();
    
    // Check if debuff has actually expired
    if (debuffEndDate <= now) {
      // Debuff has expired, clear it
      character.debuff.active = false;
      character.debuff.endDate = null;
      await character.save();
    } else {
      // Debuff is still active
      const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
      
      await interaction.editReply({
       content: `❌ **${character.name} is currently debuffed and cannot loot. Please wait until the debuff expires.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
       ephemeral: true,
      });
      return;
    }
   }

   // Check for blight stage 4 effect (no gathering)
   if (character.blightEffects?.noGathering) {
    await interaction.editReply({
     content: `❌ **${character.name}** cannot gather items due to advanced blight stage.`,
     ephemeral: true
    });
    return;
   }

   // Check daily roll limit AFTER job validation
   // Mod characters can bypass daily roll limits
   if (!character.jobVoucher && !character.isModCharacter) {
     // Check if loot has been used today
     const canLoot = canUseDailyRoll(character, 'loot');
     
     if (!canLoot) {
       const nextRollover = new Date();
       nextRollover.setUTCHours(12, 0, 0, 0); // 8AM EST = 12:00 UTC
       if (nextRollover < new Date()) {
         nextRollover.setUTCDate(nextRollover.getUTCDate() + 1);
       }
       const unixTimestamp = Math.floor(nextRollover.getTime() / 1000);
       
       await interaction.editReply({
         embeds: [{
           color: 0x008B8B,
           description: `*${character.name} seems exhausted from their earlier looting...*\n\n**Daily looting limit reached.**\nThe next opportunity to loot will be available at <t:${unixTimestamp}:F>.\n\n*Tip: A job voucher would allow you to loot again today.*`,
           image: {
             url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
           },
           footer: {
             text: 'Daily Activity Limit'
           }
         }],
         ephemeral: true
       });
       return;
     }

     // Update daily roll AFTER all validations pass
     try {
       await updateDailyRoll(character, 'loot');
     } catch (error) {
       handleInteractionError(error, "loot.js", {
         operation: 'updateDailyRoll',
         commandName: interaction.commandName || 'loot',
         userTag: interaction.user.tag,
         userId: interaction.user.id,
         characterName: character.name
       });
      logger.error('LOOT', `❌ Failed to update daily roll: ${error.message}`);
       await interaction.editReply({
         content: `❌ **An error occurred while updating your daily roll. Please try again.**`,
         ephemeral: true
       });
       return;
     }
   }

   // ------------------- Step 4: Determine Region and Encounter -------------------
   const region = getVillageRegionByName(currentVillage); // Get the region based on village
   if (!region) {
    // Reply if no region is found for the village
    logger.warn('LOOT', `No region found for village: ${currentVillage}`);
    await interaction.editReply({
     content: `❌ **No region found for village "${currentVillage}".**`,
    });
    return;
   }

   // ------------------- Step 4: Blood Moon Encounter Handling -------------------
   const bloodMoonActive = isBloodMoonActive(); // Determine Blood Moon status
   let encounteredMonster;
   
   // Generate the initial dice roll for the encounter (used for both normal and Blood Moon encounters)
   const originalRoll = Math.floor(Math.random() * 100) + 1;

   if (bloodMoonActive) {
    try {
     // Handle Blood Moon-specific encounter logic
     const encounterType = getRandomBloodMoonEncounter();

     // Normalize the encounter type
     const normalizedEncounterType = encounterType.trim().toLowerCase();

     // Handle "no encounter" cases
     if (
      normalizedEncounterType === "noencounter" ||
      normalizedEncounterType === "no encounter"
     ) {
      const embed = createNoEncounterEmbed(character, true); // Pass `true` for Blood Moon
      await interaction.followUp({ embeds: [embed] });
      return;
     }

     // Process other encounter types (tiers)
     const tier = parseInt(normalizedEncounterType.replace("tier", ""), 10);
     if (isNaN(tier)) {
      await interaction.followUp(
       `🌕 **Blood Moon is active, but no valid monsters could be determined.**`
      );
      return;
     }

     // Fetch and filter monsters matching the criteria
     const monstersByCriteria = await getMonstersByCriteria(
      currentVillage,
      job
     );
     const filteredMonsters = monstersByCriteria.filter(
      (monster) => monster.tier === tier
     );

     // Proceed if a monster is found; else attempt reroll logic
     if (filteredMonsters.length > 0) {
      encounteredMonster =
       filteredMonsters[Math.floor(Math.random() * filteredMonsters.length)];

      if (encounteredMonster.tier > 4) {
       // ------------------- Trigger Blood Moon Raid (voucher consumption only on success) -------------------
       const raidResult = await triggerRaid(
        encounteredMonster,
        interaction,
        capitalizeVillageName(character.currentVillage),
        true,
        character
       ); // Pass `true` for Blood Moon and character for auto-join
       
       if (!raidResult || !raidResult.success) {
        // Check if it's a cooldown error
        if (raidResult?.error && raidResult.error.includes('Raid cooldown active')) {
          await interaction.followUp({
            content: `⏰ **${raidResult.error}**\n\n🌕 **Blood Moon is active, but a raid was recently triggered. The monster has retreated for now.**`,
            ephemeral: true
          });
        } else {
          await interaction.followUp({
            content: `❌ **Failed to trigger Blood Moon raid:** ${raidResult?.error || 'Unknown error'}`,
            ephemeral: true
          });
        }
        return;
       }

       // Mark boost as fulfilled and clear boostedBy after successful raid trigger
       try {
         const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(character.name);
         if (activeBoost && activeBoost.status === 'accepted') {
           activeBoost.status = 'fulfilled';
           activeBoost.fulfilledAt = Date.now();
           await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);
           await updateBoostRequestEmbed(interaction.client, activeBoost, 'fulfilled');
         }
       } catch (e) {
         logger.error('BOOST', `Failed to mark boost fulfilled (Blood Moon): ${e.message}`);
       }
       if (character.boostedBy) {
         logger.info('BOOST', `Clearing boost for ${character.name} after Blood Moon raid trigger`);
         character.boostedBy = null;
         await character.save();
       }

       // Deactivate Job Voucher AFTER successful raid trigger
       if (character.jobVoucher && !voucherCheck?.skipVoucher) {
         const deactivationResult = await deactivateJobVoucher(character._id);
         if (!deactivationResult.success) {
           logger.error('LOOT', `❌ Failed to deactivate job voucher for ${character.name}`);
         } else {
           logger.success('LOOT', `✅ Job voucher deactivated for ${character.name} after Blood Moon raid trigger`);
         }
       }

       return;
      }
     } else {
      await handleBloodMoonRerolls(
       interaction,
       monstersByCriteria,
       tier,
       character,
       job,
       currentVillage,
       true, // Blood Moon status
       originalRoll, // Pass originalRoll for blight boost display
       blightRainMessage // Pass blight rain message
      );
      return; // Stop if reroll is needed and executed
     }
    } catch (error) {
     handleInteractionError(error, "loot.js", {
       operation: 'bloodMoonEncounter',
       commandName: interaction.commandName || 'loot',
       userTag: interaction.user.tag,
       userId: interaction.user.id,
       characterName: character.name,
       currentVillage
     });
     await interaction.followUp(
      `🌕 **Blood Moon is active, but an error occurred while determining an encounter.**`
     );
     return;
    }
   } else {
    // ------------------- Normal Encounter Logic -------------------
    encounteredMonster = await handleNormalEncounter(
     interaction,
     currentVillage,
     job,
     character,
     bloodMoonActive
    );

    if (!encounteredMonster) {
     // Send a "No Encounter" embed to the user
     const embed = createNoEncounterEmbed(character, bloodMoonActive); // Blood Moon is inactive here
     await interaction.editReply({ embeds: [embed] });
     return; // Stop execution after "No Encounter"
    }
   }
   
   await processLootingLogic(
    interaction,
    character,
    encounteredMonster,
    bloodMoonActive,
    character.jobVoucher && !voucherCheck?.skipVoucher, // Deactivate job voucher if needed
    originalRoll, // Pass originalRoll for blight boost display
    blightRainMessage // Pass blight rain message
   );

   

  } catch (error) {
    // Only log errors that aren't inventory sync related
    if (!error.message.includes('inventory is not synced')) {
      handleInteractionError(error, "loot.js", {
        operation: 'execute',
        commandName: interaction.commandName || 'loot',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        characterName: interaction.options.getString('charactername'),
        guildId: interaction.guildId,
        channelId: interaction.channelId
      });
      logger.error('LOOT', `Error during loot process: ${error.message}`);
    }

    // Provide more specific error messages based on the error type
    let errorMessage;
    if (error.message.includes('inventory is not synced')) {
      await interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Inventory Not Synced',
          description: error.message,
          fields: [
            {
              name: 'How to Fix',
              value: '1. Use `/inventory test` to test your inventory\n2. Use `/inventory sync` to sync your inventory'
            }
          ],
          image: {
            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
          },
          footer: {
            text: 'Inventory Sync Required'
          }
        }],
        ephemeral: true
      });
      return;
    } else if (error.message.includes('MongoDB')) {
      errorMessage = '❌ **Database connection error.** Please try again in a few moments.';
    } else if (error.message.includes('Google Sheets')) {
      errorMessage = '❌ **Inventory sync error.** Your items were looted but may not appear in your inventory sheet immediately.';
    } else if (error.message.includes('ETIMEDOUT') || error.message.includes('Connect Timeout')) {
      errorMessage = '❌ **Connection timeout.** Please try again in a few moments.';
    } else if (error.message.includes('Permission denied')) {
      errorMessage = '❌ **Permission denied.** Please make sure your inventory sheet is shared with the bot.';
    } else if (error.message.includes('Invalid Google Sheets URL')) {
      errorMessage = '❌ **Invalid inventory sheet URL.** Please check your character\'s inventory sheet link.';
    } else {
      errorMessage = `❌ **Error during looting:** ${error.message}`;
    }

    if (errorMessage) {
      await interaction.editReply({
        content: errorMessage,
        ephemeral: true
      });
    }
  }
 },
};

// ------------------- Blood Moon Rerolls Logic -------------------
async function handleBloodMoonRerolls(
 interaction,
 monstersByCriteria,
 tier,
 character,
 job,
 currentVillage,
 bloodMoonActive,
 originalRoll = null,
 blightRainMessage = null
) {
 let rerollCount = 0;
 const maxRerolls = 5; // Limit the number of rerolls to prevent infinite loops

 while (rerollCount < maxRerolls) {
  const rerollTier = Math.floor(Math.random() * 10) + 1; // Randomly choose a tier (1-10)
  const rerolledMonsters = monstersByCriteria.filter(
   (monster) => monster.tier === rerollTier
  );

   if (rerolledMonsters.length > 0) {
   const encounteredMonster =
    rerolledMonsters[Math.floor(Math.random() * rerolledMonsters.length)];

   if (encounteredMonster.tier > 4) {
    // ------------------- Trigger Blood Moon Raid on reroll (voucher consumption only on success) -------------------
    const raidResult = await triggerRaid(
     encounteredMonster,
     interaction,
     capitalizeVillageName(character.currentVillage),
     bloodMoonActive,
     character
    ); // Let triggerRaid handle thread creation and auto-join

    if (!raidResult || !raidResult.success) {
      // If raid failed, do not consume voucher; inform user
      if (raidResult?.error) {
        await interaction.followUp({
          content: `❌ **Failed to trigger Blood Moon raid (reroll):** ${raidResult.error}`,
          ephemeral: true
        });
      }
      return;
    }

    // Mark boost as fulfilled and clear boostedBy after successful raid trigger (reroll)
    try {
      const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(character.name);
      if (activeBoost && activeBoost.status === 'accepted') {
        activeBoost.status = 'fulfilled';
        activeBoost.fulfilledAt = Date.now();
        await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);
        await updateBoostRequestEmbed(interaction.client, activeBoost, 'fulfilled');
      }
    } catch (e) {
      logger.error('BOOST', `Failed to mark boost fulfilled (Blood Moon reroll): ${e.message}`);
    }
    if (character.boostedBy) {
      logger.info('BOOST', `Clearing boost for ${character.name} after Blood Moon raid trigger (reroll)`);
      character.boostedBy = null;
      await character.save();
    }

    // Deactivate Job Voucher AFTER successful raid trigger
    if (character.jobVoucher) {
      const deactivationResult = await deactivateJobVoucher(character._id);
      if (!deactivationResult.success) {
        logger.error('LOOT', `❌ Failed to deactivate job voucher for ${character.name}`);
      } else {
        logger.success('LOOT', `✅ Job voucher deactivated for ${character.name} after Blood Moon raid trigger (reroll)`);
      }
    }

    return;
   } else {
    await processLootingLogic(
     interaction,
     character,
     encounteredMonster,
     bloodMoonActive,
     true, // Deactivate job voucher for reroll encounters
     originalRoll, // Pass originalRoll for blight boost display
     blightRainMessage // Pass blight rain message
    );
    return; // End reroll processing after looting
   }
  }

  rerollCount++;
 }

 // If rerolls are exhausted and no monster is found
 await interaction.followUp(
  `🌕 **Blood Moon is active: No suitable monster could be found after multiple attempts.**`
 );
 return null;
}

// ------------------- Normal Encounter Logic -------------------
async function handleNormalEncounter(interaction, currentVillage, job, character, bloodMoonActive) {
  logger.info('LOOT', `handleNormalEncounter called for ${character.name} in ${currentVillage} with job ${job}`);
  
  // Check for blight stage 3 effect (no monsters)
  if (character.blightEffects?.noMonsters) {
    logger.info('BLIGHT', `🧿 Character ${character.name} has blight stage 3 - no monsters allowed`);
    const embed = createBlightStage3NoEncounterEmbed(character, bloodMoonActive);
    await interaction.editReply({ embeds: [embed] });
    logger.info('BLIGHT', `✅ Blight stage 3 no encounter embed sent`);
    return null;
  }

  const monstersByCriteria = await getMonstersByCriteria(currentVillage, job);
  logger.info('LOOT', `Found ${monstersByCriteria.length} monsters for ${currentVillage} with job ${job}`);
  
  if (monstersByCriteria.length === 0) {
    logger.info('LOOT', `🌅 No monsters found for criteria - sending no encounter embed`);
    const embed = createNoEncounterEmbed(character, bloodMoonActive); // Send "No Encounter" embed
    await interaction.editReply({ embeds: [embed] });
    logger.info('LOOT', `✅ No monsters criteria no encounter embed sent`);
    return null;
  }

  const encounterResult = await getMonsterEncounterFromList(monstersByCriteria);
  logger.info('LOOT', `Encounter result: ${encounterResult.encounter}`);
  
  if (encounterResult.encounter === "No Encounter") {
    logger.info('LOOT', '🌅 Encounter roll resulted in no encounter - sending no encounter embed');
    const embed = createNoEncounterEmbed(character, bloodMoonActive); // Send "No Encounter" embed
    await interaction.editReply({ embeds: [embed] });
    logger.info('LOOT', '✅ Encounter roll no encounter embed sent');
    return null;
  }

  const encounteredMonster =
    encounterResult.monsters[
      Math.floor(Math.random() * encounterResult.monsters.length)
    ];
  
  logger.info('LOOT', `Selected monster from encounter: ${encounteredMonster.name}`);

  // Return the final encountered monster
  return encounteredMonster;
}


// ------------------- Looting Logic -------------------
async function processLootingLogic(
 interaction,
 character,
 encounteredMonster,
 bloodMoonActive,
 shouldDeactivateVoucher = false,
 originalRoll = null,
 blightRainMessage = null
) {
  try {
  const items = await fetchItemsByMonster(encounteredMonster.name);

  // Step 1: Calculate Encounter Outcome
  const diceRoll = Math.floor(Math.random() * 100) + 1;
  // Store the original roll for blight boost display
  originalRoll = diceRoll;
  let { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } =
   calculateFinalValue(character, diceRoll);
  
  // Store the blight-adjusted roll (before other boosts)
  const blightAdjustedRoll = adjustedRandomValue;



  // Log blight boost if applied
  if (originalRoll && blightAdjustedRoll > originalRoll) {
    const improvement = blightAdjustedRoll - originalRoll;
    const multiplier = (blightAdjustedRoll / originalRoll).toFixed(1);
    logger.info('BLIGHT', `💀 Blight boost for ${character.name}: ${originalRoll} → ${blightAdjustedRoll} (${multiplier}x, +${improvement})`);
  }

  // ------------------- Apply Boosting Effects -------------------
  // Check if character is boosted and apply looting boosts
  const rollBeforeBoost = adjustedRandomValue;
  adjustedRandomValue = await applyLootingBoost(character.name, adjustedRandomValue);
  
  // Log boost if applied
  if (adjustedRandomValue > rollBeforeBoost) {
    const improvement = adjustedRandomValue - rollBeforeBoost;
    logger.info('LOOT', `📚 Boost applied to ${character.name} - Roll enhanced from ${rollBeforeBoost} to ${adjustedRandomValue} (+${improvement} points)`);
  }

  let weightedItems = createWeightedItemList(items, adjustedRandomValue);
  
  // Build roll display showing progression: original → blight → boost
  let rollDisplay = `${originalRoll}`;
  if (blightAdjustedRoll > originalRoll) {
    rollDisplay += ` → ${blightAdjustedRoll}`;
  }
  if (adjustedRandomValue > blightAdjustedRoll) {
    rollDisplay += ` → ${adjustedRandomValue}`;
  } else if (adjustedRandomValue > originalRoll && blightAdjustedRoll === originalRoll) {
    rollDisplay += ` → ${adjustedRandomValue}`;
  }
  
  logger.info('LOOT', `${character.name} vs ${encounteredMonster.name} | Roll: ${rollDisplay}/100 | Damage: ${damageValue} | Can loot: ${weightedItems.length > 0 ? 'Yes' : 'No'}`);

  const outcome = await getEncounterOutcome(
   character,
   encounteredMonster,
   damageValue,
   adjustedRandomValue,
   attackSuccess,
   defenseSuccess
  );

  // Track whether a Fortune Teller reroll occurred and whether it improved the outcome
  let fortuneRerollTriggered = false;
  let fortuneRerollImproved = false;

  // ------------------- Fortune Teller: Fated Reroll (if damage taken) -------------------
  try {
    const boostStatusForReroll = await getCharacterBoostStatus(character.name);
    const hasFortuneTellerLootBoost = boostStatusForReroll && boostStatusForReroll.boosterJob === 'Fortune Teller' && boostStatusForReroll.category === 'Looting';
    if (hasFortuneTellerLootBoost && outcome.hearts && outcome.hearts > 0) {
      logger.info('BOOST', `🔮 Fortune Teller Fated Reroll triggered for ${character.name} (damage=${outcome.hearts})`);
      fortuneRerollTriggered = true;

      // Snapshot hearts before reroll (get fresh from DB to capture prior deductions)
      let heartsBeforeReroll = null;
      try {
        const CharacterModel = character.isModCharacter ? require('../../models/ModCharacterModel.js') : require('../../models/CharacterModel.js');
        const freshCharBefore = await CharacterModel.findById(character._id).select('currentHearts');
        heartsBeforeReroll = freshCharBefore?.currentHearts ?? null;
      } catch {}

      // Perform a single reroll end-to-end
      const diceRollReroll = Math.floor(Math.random() * 100) + 1;
      let { damageValue: damageValueReroll, adjustedRandomValue: adjustedRandomValueReroll, attackSuccess: attackSuccessReroll, defenseSuccess: defenseSuccessReroll } =
        calculateFinalValue(character, diceRollReroll);

      // Apply standard looting roll boosts to the reroll as well
      const rollBeforeBoostReroll = adjustedRandomValueReroll;
      adjustedRandomValueReroll = await applyLootingBoost(character.name, adjustedRandomValueReroll);
      if (adjustedRandomValueReroll > rollBeforeBoostReroll) {
        const improvement = adjustedRandomValueReroll - rollBeforeBoostReroll;
        logger.info('LOOT', `📚 Boost applied on reroll for ${character.name} - Roll enhanced from ${rollBeforeBoostReroll} to ${adjustedRandomValueReroll} (+${improvement} points)`);
      }

      const rerollOutcome = await getEncounterOutcome(
        character,
        encounteredMonster,
        damageValueReroll,
        adjustedRandomValueReroll,
        attackSuccessReroll,
        defenseSuccessReroll
      );

      // Determine how many hearts were deducted by the reroll's getEncounterOutcome side-effect
      let rerollAppliedHearts = 0;
      try {
        if (heartsBeforeReroll !== null) {
          const CharacterModel = character.isModCharacter ? require('../../models/ModCharacterModel.js') : require('../../models/CharacterModel.js');
          const freshCharAfter = await CharacterModel.findById(character._id).select('currentHearts');
          if (freshCharAfter && typeof freshCharAfter.currentHearts === 'number') {
            rerollAppliedHearts = Math.max(0, heartsBeforeReroll - freshCharAfter.currentHearts);
          }
        }
      } catch {}

      // Log reroll result in LOOT format
      logger.info('LOOT', `${character.name} vs ${encounteredMonster.name} | Reroll: ${diceRollReroll}/100 | Damage: ${rerollOutcome.hearts || 0} | Can loot: ${weightedItems.length > 0 ? 'Yes' : 'No'}`);

      // Choose the better outcome: prioritize fewer hearts (damage), then higher adjusted roll
      const isRerollBetter = (rerollOutcome.hearts || 0) < (outcome.hearts || 0) || (
        (rerollOutcome.hearts || 0) === (outcome.hearts || 0) && (adjustedRandomValueReroll || 0) > (outcome.adjustedRandomValue || 0)
      );

      if (isRerollBetter) {
        logger.info('BOOST', `🔮 Fated Reroll improved outcome for ${character.name}: damage ${outcome.hearts || 0} → ${rerollOutcome.hearts || 0}, roll ${outcome.adjustedRandomValue} → ${adjustedRandomValueReroll}`);
        fortuneRerollImproved = true;

        // Hearts reconciliation: initial outcome already applied hearts. Restore, then apply final reroll hearts.
        try {
          const originalHearts = outcome.hearts || 0;
          const finalHearts = rerollOutcome.hearts || 0;
          const { recoverHearts, useHearts } = require('../../modules/characterStatsModule');
          // Always undo reroll-applied hearts first (if any)
          if (rerollAppliedHearts > 0) {
            await recoverHearts(character._id, rerollAppliedHearts);
            logger.info('BOOST', `🔄 Recovered ${rerollAppliedHearts} hearts applied by reroll for ${character.name}`);
          }
          if (originalHearts !== finalHearts) {
            const { recoverHearts, useHearts } = require('../../modules/characterStatsModule');
            if (originalHearts > 0) {
              await recoverHearts(character._id, originalHearts);
              logger.info('BOOST', `🔄 Recovered ${originalHearts} hearts to reconcile reroll for ${character.name}`);
            }
            if (finalHearts > 0) {
              await useHearts(character._id, finalHearts);
              logger.info('BOOST', `💔 Applied final reroll damage: ${finalHearts} hearts for ${character.name}`);
            }
          }
        } catch (heartErr) {
          logger.error('BOOST', `Failed to reconcile hearts after reroll for ${character.name}: ${heartErr.message}`);
        }

        // Replace base values with reroll results so downstream logic (elixirs, entertainer, loot weighting) uses them
        damageValue = damageValueReroll;
        adjustedRandomValue = adjustedRandomValueReroll;
        attackSuccess = attackSuccessReroll;
        defenseSuccess = defenseSuccessReroll;
        // Update the computed outcome
        for (const key of Object.keys(outcome)) {
          delete outcome[key];
        }
        Object.assign(outcome, rerollOutcome);

        // Recompute weighted items with the new adjusted roll
        const newWeightedItems = createWeightedItemList(items, adjustedRandomValue);
        // Replace reference used later
        weightedItems = newWeightedItems; // ensure later references use updated weights

        // Update roll display chain for logs
        rollDisplay += ` → ${adjustedRandomValue}`;
      } else {
        logger.info('BOOST', `🔮 Fated Reroll did not improve outcome for ${character.name}; keeping original.`);
        // Undo any hearts applied by the reroll so we keep the original damage only
        try {
          if (rerollAppliedHearts > 0) {
            const { recoverHearts } = require('../../modules/characterStatsModule');
            await recoverHearts(character._id, rerollAppliedHearts);
            logger.info('BOOST', `🔄 Recovered ${rerollAppliedHearts} hearts from non-improving reroll for ${character.name}`);
          }
        } catch (heartErr) {
          logger.error('BOOST', `Failed to undo reroll hearts for ${character.name}: ${heartErr.message}`);
        }
      }
    }
  } catch (e) {
    logger.error('BOOST', `Failed during Fortune Teller Fated Reroll for ${character.name}: ${e.message}`);
  }

  // Track elixir buff information for the embed
  let elixirBuffInfo = null;
  let boostUnused = false;

  // ------------------- Elixir Consumption Logic -------------------
  // Check if elixirs should be consumed based on the monster encounter
  try {
    const { shouldConsumeElixir, consumeElixirBuff, getActiveBuffEffects } = require('../../modules/elixirModule');
    
    // Check for active elixir buffs before consumption
    const activeBuff = getActiveBuffEffects(character);
    if (activeBuff) {
      logger.info('ELIXIR', `${character.name} has active elixir buff: ${character.buff.type}`);
      
      // Log specific elixir effects that might help
      if (activeBuff.fireResistance > 0 && encounteredMonster.name.includes('Fire')) {
        logger.info('ELIXIR', `🔥 Fireproof Elixir active: ${character.name} vs ${encounteredMonster.name} (+${activeBuff.fireResistance} fire res)`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Fireproof Elixir',
          elixirType: 'fireproof',
          encounterType: 'fire',
          damageReduced: 0
        };
      }
      if (activeBuff.coldResistance > 0 && encounteredMonster.name.includes('Ice')) {
        logger.info('ELIXIR', `❄️ Spicy Elixir active: ${character.name} vs ${encounteredMonster.name} (+${activeBuff.coldResistance} cold res)`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Spicy Elixir',
          elixirType: 'spicy',
          encounterType: 'ice',
          damageReduced: 0
        };
      }
      if (activeBuff.electricResistance > 0 && encounteredMonster.name.includes('Electric')) {
        logger.info('ELIXIR', `⚡ Electro Elixir active: ${character.name} vs ${encounteredMonster.name} (+${activeBuff.electricResistance} elec res)`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Electro Elixir',
          elixirType: 'electro',
          encounterType: 'electric',
          damageReduced: 0
        };
      }
      if (activeBuff.blightResistance > 0) {
        logger.info('ELIXIR', `🧿 Chilly Elixir active: ${character.name} (+${activeBuff.blightResistance} blight res)`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Chilly Elixir',
          elixirType: 'chilly',
          encounterType: 'blight',
          damageReduced: 0
        };
      }
      if (activeBuff.stealthBoost > 0) {
        logger.info('ELIXIR', `👻 Sneaky Elixir active: ${character.name} (+${activeBuff.stealthBoost} stealth)`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Sneaky Elixir',
          elixirType: 'sneaky',
          encounterType: 'general',
          damageReduced: 0
        };
      }
      if (activeBuff.defenseBoost > 0) {
        logger.info('ELIXIR', `🛡️ Tough Elixir active: ${character.name} (+${activeBuff.defenseBoost} defense)`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Tough Elixir',
          elixirType: 'tough',
          encounterType: 'general',
          damageReduced: 0
        };
      }
      if (activeBuff.attackBoost > 0) {
        logger.info('ELIXIR', `⚔️ Mighty Elixir active: ${character.name} (+${activeBuff.attackBoost} attack)`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Mighty Elixir',
          elixirType: 'mighty',
          encounterType: 'general',
          damageReduced: 0
        };
      }
    }
    
    if (shouldConsumeElixir(character, 'loot', { monster: encounteredMonster })) {
      const consumedElixirType = character.buff.type;
      
      logger.info('ELIXIR', `Elixir consumed for ${character.name} during encounter with ${encounteredMonster.name}`);
      
      // Log what the elixir protected against
      if (consumedElixirType === 'fireproof' && encounteredMonster.name.includes('Fire')) {
        logger.info('ELIXIR', `🔥 Fireproof Elixir protected ${character.name} from fire damage vs ${encounteredMonster.name}`);
      } else if (consumedElixirType === 'spicy' && encounteredMonster.name.includes('Ice')) {
        logger.info('ELIXIR', `❄️ Spicy Elixir protected ${character.name} from ice damage vs ${encounteredMonster.name}`);
      } else if (consumedElixirType === 'electro' && encounteredMonster.name.includes('Electric')) {
        logger.info('ELIXIR', `⚡ Electro Elixir protected ${character.name} from electric damage vs ${encounteredMonster.name}`);
      } else if (consumedElixirType === 'chilly') {
        logger.info('ELIXIR', `🧿 Chilly Elixir protected ${character.name} from blight rain effects`);
      } else if (consumedElixirType === 'sneaky') {
        logger.info('ELIXIR', `👻 Sneaky Elixir helped ${character.name} with stealth during looting`);
      } else if (consumedElixirType === 'tough') {
        logger.info('ELIXIR', `🛡️ Tough Elixir provided defense boost for ${character.name} during encounter`);
      } else if (consumedElixirType === 'mighty') {
        logger.info('ELIXIR', `⚔️ Mighty Elixir provided attack boost for ${character.name} during encounter`);
      }
      
      consumeElixirBuff(character);
      
      // Update character in database to persist the consumed elixir
      await Character.findByIdAndUpdate(character._id, { buff: character.buff });
    } else if (character.buff?.active) {
      // Log when elixir is not used due to conditions not met
      logger.info('ELIXIR', `Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
    }
  } catch (elixirError) {
    logger.warn('ELIXIR', `Warning - Elixir consumption failed: ${elixirError.message}`);
    // Don't fail the loot if elixir consumption fails
  }

  // ------------------- Apply Elixir Roll Boost -------------------
  // Apply elixir effects to the roll value BEFORE damage calculation
  if (elixirBuffInfo && elixirBuffInfo.helped && outcome.adjustedRandomValue) {
    const originalRoll = outcome.adjustedRandomValue;
    
    if (elixirBuffInfo.encounterType === 'fire' && elixirBuffInfo.elixirType === 'fireproof') {
      // Fireproof elixir provides 1.5x roll multiplier (higher roll = less damage)
      outcome.adjustedRandomValue = Math.min(100, Math.ceil(originalRoll * 1.5));
      logger.info('ELIXIR', `🔥 Fireproof Elixir boosted roll from ${originalRoll} to ${outcome.adjustedRandomValue}`);
      
      // Store original damage for comparison
      const originalDamage = outcome.hearts;
      
      // Recalculate outcome using the boosted roll value
      const boostedOutcome = await getEncounterOutcome(
        character,
        encounteredMonster,
        damageValue,
        outcome.adjustedRandomValue,
        attackSuccess,
        defenseSuccess
      );
      
      if (boostedOutcome.hearts < originalDamage) {
        const damageReduced = originalDamage - boostedOutcome.hearts;
        elixirBuffInfo.damageReduced = damageReduced;
        outcome.hearts = boostedOutcome.hearts;
        logger.info('ELIXIR', `🔥 Fireproof Elixir reduced damage from ${originalDamage} to ${outcome.hearts} (-${damageReduced})`);
      }
    } else if (elixirBuffInfo.encounterType === 'electric' && elixirBuffInfo.elixirType === 'electro') {
      // Electro elixir provides 1.5x roll multiplier (higher roll = less damage)
      outcome.adjustedRandomValue = Math.min(100, Math.ceil(originalRoll * 1.5));
      logger.info('ELIXIR', `⚡ Electro Elixir boosted roll from ${originalRoll} to ${outcome.adjustedRandomValue}`);
      
      // Store original damage for comparison
      const originalDamage = outcome.hearts;
      
      // Recalculate outcome using the boosted roll value
      const boostedOutcome = await getEncounterOutcome(
        character,
        encounteredMonster,
        damageValue,
        outcome.adjustedRandomValue,
        attackSuccess,
        defenseSuccess
      );
      
      if (boostedOutcome.hearts < originalDamage) {
        const damageReduced = originalDamage - boostedOutcome.hearts;
        elixirBuffInfo.damageReduced = damageReduced;
        outcome.hearts = boostedOutcome.hearts;
        logger.info('ELIXIR', `⚡ Electro Elixir reduced damage from ${originalDamage} to ${outcome.hearts} (-${damageReduced})`);
      }
    } else if (elixirBuffInfo.encounterType === 'ice' && elixirBuffInfo.elixirType === 'spicy') {
      // Spicy elixir provides 1.5x roll multiplier (higher roll = less damage)
      outcome.adjustedRandomValue = Math.min(100, Math.ceil(originalRoll * 1.5));
      logger.info('ELIXIR', `❄️ Spicy Elixir boosted roll from ${originalRoll} to ${outcome.adjustedRandomValue}`);
      
      // Store original damage for comparison
      const originalDamage = outcome.hearts;
      
      // Recalculate outcome using the boosted roll value
      const boostedOutcome = await getEncounterOutcome(
        character,
        encounteredMonster,
        damageValue,
        outcome.adjustedRandomValue,
        attackSuccess,
        defenseSuccess
      );
      
      if (boostedOutcome.hearts < originalDamage) {
        const damageReduced = originalDamage - boostedOutcome.hearts;
        elixirBuffInfo.damageReduced = damageReduced;
        outcome.hearts = boostedOutcome.hearts;
        logger.info('ELIXIR', `❄️ Spicy Elixir reduced damage from ${originalDamage} to ${outcome.hearts} (-${damageReduced})`);
      }
    }
  }

  // ------------------- Apply Other Damage Reduction Boosts -------------------
  // Check if character is boosted and apply damage reduction (Entertainer boost)
  let entertainerDamageReduction = 0;
  let entertainerBoostUnused = false;
  let damageWasTaken = outcome.hearts > 0; // Track if any damage was taken before boost
  
  // Check if Entertainer boost is active
  if (character.boostedBy) {
    const { fetchCharacterByName, updateCharacterById } = require('../../database/db');
    const { recoverHearts } = require('../../modules/characterStatsModule');
    const boosterChar = await fetchCharacterByName(character.boostedBy);
    
    if (boosterChar && boosterChar.job?.toLowerCase() === 'entertainer') {
      if (outcome.hearts && outcome.hearts > 0) {
        // Apply damage reduction with monster tier scaling
        const originalHeartDamage = outcome.hearts;
        const monsterTier = encounteredMonster.tier || 1;
        const reducedDamage = await applyLootingDamageBoost(character.name, outcome.hearts, monsterTier);
        entertainerDamageReduction = originalHeartDamage - reducedDamage;
        
        if (entertainerDamageReduction > 0) {
          logger.info('BOOST', `🎭 Entertainer boost (Tier ${monsterTier}) reduces damage from ${originalHeartDamage} to ${reducedDamage} (-${entertainerDamageReduction})`);
          
          // Hearts were already removed by getEncounterOutcome - restore them and reapply correct amount
          // Step 1: Restore the hearts that were taken
          await recoverHearts(character._id, originalHeartDamage);
          logger.info('BOOST', `🔄 Restored ${originalHeartDamage} hearts to reapply with boost`);
          
          // Step 2: Apply the boosted (reduced) damage
          if (reducedDamage > 0) {
            const { useHearts } = require('../../modules/characterStatsModule');
            await useHearts(character._id, reducedDamage);
            logger.info('BOOST', `💔 Applied boosted damage: ${reducedDamage} hearts`);
          }
          
          // Update outcome to reflect the reduced damage
          outcome.hearts = reducedDamage;
          // Ensure the textual result reflects the post-boost damage.
          // If damage was fully negated, mark as a win with loot so the embed won't show damage text.
          if (reducedDamage === 0) {
            outcome.result = 'Win!/Loot';
          } else if (outcome.result && typeof outcome.result === 'string' && outcome.result.includes('HEART(S)')) {
            // If a damage string exists in result, update the heart count to the reduced value
            outcome.result = outcome.result.replace(/(\d+)\s*HEART\(S\)/i, `${reducedDamage} HEART(S)`);
          }
        }
      } else if (!outcome.hearts || outcome.hearts === 0) {
        // Boost was active but not needed (no damage taken)
        entertainerBoostUnused = true;
        damageWasTaken = false; // Ensure boost is not cleared
        logger.info('BOOST', `🎭 Entertainer boost was active but not needed (no damage taken)`);
      }
    }
  }

  // Step 2: Handle KO Logic
  let updatedCharacter;
  if (character.isModCharacter) {
    const ModCharacter = require('../../models/ModCharacterModel.js');
    updatedCharacter = await ModCharacter.findById(character._id);
  } else {
    updatedCharacter = await Character.findById(character._id);
  }
  
  if (!updatedCharacter) {
   throw new Error(`Unable to find updated character with ID ${character._id} (isModCharacter: ${character.isModCharacter})`);
  }

  if (updatedCharacter.currentHearts === 0 && !updatedCharacter.ko) {
  logger.info('LOOT', `💀 Character ${character.name} has been KO'd`);
   await handleKO(updatedCharacter._id);
  }

  // Step 3: Generate Outcome Message
  const outcomeMessage = generateOutcomeMessage(outcome, character);

  // Determine if an active Fortune Teller looting boost was unused (no damage taken)
  try {
    const boostStatus = await getCharacterBoostStatus(character.name);
    if (boostStatus && boostStatus.boosterJob === 'Fortune Teller' && boostStatus.category === 'Looting') {
      // Only mark as unused if no damage occurred AND no FT reroll was actually triggered
      if ((!outcome.hearts || outcome.hearts === 0) && (typeof fortuneRerollTriggered === 'boolean' ? !fortuneRerollTriggered : true)) {
        boostUnused = true;
      }
    }
  } catch (e) {
    logger.error('BOOST', `Failed to determine boost unused state: ${e.message}`);
  }

  // Step 4: Loot Item Logic
  let lootedItem = null;
  if (outcome.canLoot && weightedItems.length > 0) {
   lootedItem = await generateLootedItem(encounteredMonster, weightedItems, character);
   logger.success('LOOT', `${character.name} looted: ${lootedItem?.itemName} (x${lootedItem?.quantity})`);

   const inventoryLink = character.inventory || character.inventoryLink;
   if (!isValidGoogleSheetsUrl(inventoryLink)) {
   logger.warn('LOOT', `Invalid inventory link for ${character.name}`);
    const embed = await createMonsterEncounterEmbed(
     character,
     encounteredMonster,
     outcomeMessage,
     updatedCharacter.currentHearts,
     lootedItem,
     bloodMoonActive,
     blightAdjustedRoll, // Pass blightAdjustedRoll for blight boost detection
     null, // currentMonster
     null, // totalMonsters
     null, // entertainerBonusItem
     null, // boostCategoryOverride
     elixirBuffInfo, // Pass elixirBuffInfo to the embed
     originalRoll, // Pass originalRoll to the embed
     blightRainMessage, // Pass blight rain message to the embed
     entertainerBoostUnused, // Pass flag indicating boost was active but unused
    entertainerDamageReduction, // Pass amount of damage reduced by Entertainer boost
    blightAdjustedRoll, // Keep param order in sync
    boostUnused // Fortune Teller unused flag
    );
    
    // Update timestamp and clear boost only if damage was taken
    await updateCharacterLootTimestamp(character, damageWasTaken, interaction.client);
    
    await interaction.editReply({
     content: `❌ **Invalid Google Sheets URL for "${character.name}".**`,
     embeds: [embed],
    });
    return;
   }

   await handleInventoryUpdate(interaction, character, lootedItem, encounteredMonster, bloodMoonActive);
  }

  // Create embed BEFORE clearing boost so boost info can be retrieved
  const embed = await createMonsterEncounterEmbed(
   character,
   encounteredMonster,
   outcomeMessage,
   updatedCharacter.currentHearts,
   outcome.canLoot && weightedItems.length > 0 ? lootedItem : null,
   bloodMoonActive,
   adjustedRandomValue, // Pass the final roll value (after boost) as actualRoll
   null, // currentMonster
   null, // totalMonsters
   null, // entertainerBonusItem
   null, // boostCategoryOverride
   elixirBuffInfo, // Pass elixirBuffInfo to the embed
   originalRoll, // Pass originalRoll to the embed
   blightRainMessage, // Pass blight rain message to the embed
   entertainerBoostUnused, // Pass flag indicating boost was active but unused
   entertainerDamageReduction, // Pass amount of damage reduced by Entertainer boost
   blightAdjustedRoll, // Pass blightAdjustedRoll for blight boost detection
   boostUnused // Fortune Teller unused flag
   );
  
  // Update request embed to Fulfilled BEFORE clearing the boost
  try {
    const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(character.name);
    if (activeBoost && activeBoost.requestData) {
      activeBoost.requestData.status = 'fulfilled';
      await saveBoostingRequestToTempData(activeBoost.requestData.boostRequestId, activeBoost.requestData);
      await updateBoostRequestEmbed(interaction.client, activeBoost.requestData, 'fulfilled');
    }
  } catch (e) {
    logger.error('BOOST', `Failed to mark boost as fulfilled before clearing: ${e.message}`);
  }

  // Update character timestamp and clear boost AFTER marking fulfilled
  // Clear boost after monster encounter (boost was used for loot selection)
  // Note: This function is only called when a monster is encountered
  await updateCharacterLootTimestamp(character, true, interaction.client);
  
  await interaction.editReply({ embeds: [embed] });

  // ------------------- Deactivate Job Voucher if needed -------------------
  if (shouldDeactivateVoucher && character.jobVoucher) {
    const deactivationResult = await deactivateJobVoucher(character._id);
    if (!deactivationResult.success) {
      logger.error('LOOT', `❌ Failed to deactivate job voucher for ${character.name}`);
    } else {
      logger.success('LOOT', `✅ Job voucher deactivated for ${character.name} in processLootingLogic`);
    }
  }
  } catch (error) {
    logger.error('LOOT', `Error in processLootingLogic: ${error.message}`);
    await handleLootError(interaction, error, "processing loot");
  }
}

// New helper function for inventory updates
async function handleInventoryUpdate(interaction, character, lootedItem, encounteredMonster, bloodMoonActive) {
  // Use the same fallback pattern as other commands
  const inventoryLink = character.inventory || character.inventoryLink;

  const spreadsheetId = extractSpreadsheetId(inventoryLink);
  const auth = await authorizeSheets();
  const range = "loggedInventory!A2:M";
  const uniqueSyncId = uuidv4();
  const formattedDateTime = new Date().toLocaleString("en-US", {
    timeZone: "America/New_York",
  });
  const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

  const values = [
    [
      character.name,
      lootedItem.itemName,
      lootedItem.quantity.toString(),
      lootedItem.category.join(", "),
      lootedItem.type.join(", "),
      lootedItem.subtype.join(", "),
      "Looted",
      character.job,
      "",
      character.currentVillage,
      interactionUrl,
      formattedDateTime,
      uniqueSyncId,
    ],
  ];



  await addItemInventoryDatabase(
    character._id,
    lootedItem.itemName,
    lootedItem.quantity,
    interaction,
    "Looted"
  );

  // Note: Google Sheets sync is handled by addItemInventoryDatabase
}

// ------------------- Helper Function: Generate Outcome Message -------------------
function generateOutcomeMessage(outcome, character = null) {
  // Handle damage outcomes (including KO)
  if (outcome.hearts && outcome.hearts > 0) {
    return outcome.result === "KO"
      ? generateDamageMessage("KO")
      : generateDamageMessage(outcome.hearts);
  }
  
  // Handle defense success (blocked attack)
  if (outcome.defenseSuccess) {
    return generateDefenseBuffMessage(
      outcome.defenseSuccess,
      outcome.adjustedRandomValue,
      outcome.damageValue
    );
  }
  
  // Handle attack success (critical hit)
  if (outcome.attackSuccess) {
    return generateAttackBuffMessage(
      outcome.attackSuccess,
      outcome.adjustedRandomValue,
      outcome.damageValue
    );
  }
  
  // Handle victory outcomes
  if (outcome.result === "Win!/Loot" || outcome.result === "Win!/Loot (1HKO)") {
    // Check if this is a mod character victory
    if (character && character.isModCharacter && outcome.result === "Win!/Loot (1HKO)") {
      const { generateModCharacterVictoryMessage } = require("../../modules/flavorTextModule.js");
      return generateModCharacterVictoryMessage(character.name, character.modTitle, character.modType);
    }
    return generateVictoryMessage(
      outcome.adjustedRandomValue,
      outcome.defenseSuccess,
      outcome.attackSuccess
    );
  }
  
  // Handle other specific result types
  if (outcome.result && typeof outcome.result === 'string') {
    // If the result contains damage information, try to extract it
    if (outcome.result.includes('HEART(S)')) {
      const heartMatch = outcome.result.match(/(\d+)\s*HEART\(S\)/);
      if (heartMatch) {
        const heartCount = parseInt(heartMatch[1]);
        return generateDamageMessage(heartCount);
      }
    }
    
    // If the result is a mod character victory message, return it directly
    if (outcome.result.includes('divine power') || outcome.result.includes('legendary prowess') || 
        outcome.result.includes('ancient') || outcome.result.includes('divine authority')) {
      return outcome.result;
    }
  }
  
  // Fallback: generate a generic outcome message
  return generateFinalOutcomeMessage(
    outcome.damageValue || 0,
    outcome.defenseSuccess || false,
    outcome.attackSuccess || false,
    outcome.adjustedRandomValue || 0,
    outcome.damageValue || 0
  );
}

// ------------------- Helper Function: Generate Looted Item -------------------
async function generateLootedItem(encounteredMonster, weightedItems, character) {
 let lootedItem;
 let isPriestDivineBlessingActive = false;
 
 // Check if character has Priest boost for guaranteed highest tier loot
 if (character && character.boostedBy) {
   const boostStatus = await getCharacterBoostStatus(character.name);
   
   if (boostStatus && boostStatus.boosterJob === 'Priest' && boostStatus.category === 'Looting') {
     isPriestDivineBlessingActive = true;
     // Find the highest rarity item in the weighted items list
     const maxRarity = Math.max(...weightedItems.map(item => item.itemRarity || 0));
     const highestRarityItems = weightedItems.filter(item => (item.itemRarity || 0) === maxRarity);
     
     if (highestRarityItems.length > 0) {
       // Randomly select from the highest rarity items
       const randomIndex = Math.floor(Math.random() * highestRarityItems.length);
       lootedItem = highestRarityItems[randomIndex];
       logger.info('LOOT', `🙏 Priest Divine Blessing: Selected highest rarity item (${maxRarity}) for ${character.name}`);
     } else {
       // Fallback to normal selection if no rarity found
       const randomIndex = Math.floor(Math.random() * weightedItems.length);
       lootedItem = weightedItems[randomIndex];
     }
   } else {
     // Normal random selection for other boosts or no boost
     const randomIndex = Math.floor(Math.random() * weightedItems.length);
     lootedItem = weightedItems[randomIndex];
   }
 } else {
   // Normal random selection if no boost
   const randomIndex = Math.floor(Math.random() * weightedItems.length);
   lootedItem = weightedItems[randomIndex];
 }

 if (!isPriestDivineBlessingActive && encounteredMonster.name.includes("Chuchu")) {
  let jellyType;
  if (encounteredMonster.name.includes('Ice')) {
    jellyType = 'White Chuchu Jelly';
  } else if (encounteredMonster.name.includes('Fire')) {
    jellyType = 'Red Chuchu Jelly';
  } else if (encounteredMonster.name.includes('Electric')) {
    jellyType = 'Yellow Chuchu Jelly';
  } else {
    jellyType = 'Chuchu Jelly';
  }
  const quantity = encounteredMonster.name.includes("Large")
   ? 3
   : encounteredMonster.name.includes("Medium")
   ? 2
   : 1;
  lootedItem.itemName = jellyType;
  lootedItem.quantity = quantity;
  
  // Fetch the correct emoji from the database for the jelly type
  try {
    const ItemModel = require('../../models/ItemModel');
    const jellyItem = await ItemModel.findOne({ itemName: jellyType }).select('emoji');
    if (jellyItem && jellyItem.emoji) {
      lootedItem.emoji = jellyItem.emoji;
    }
  } catch (error) {
    logger.warn('LOOT', `Error fetching emoji for ${jellyType}: ${error.message}`);
    // Keep the original emoji if there's an error
  }
 } else {
  lootedItem.quantity = 1; // Default quantity for non-Chuchu items
 }

 // ------------------- Apply Boosting Effects -------------------
 // Check if character is boosted and apply loot quantity boosts
 if (character) {
   const boostedLoot = await applyLootingQuantityBoost(character.name, lootedItem);
   if (boostedLoot && boostedLoot.quantity !== lootedItem.quantity) {
     return boostedLoot;
   }
 }

 return lootedItem;
}


