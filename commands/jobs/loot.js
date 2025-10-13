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
const { applyLootingBoost, applyLootingDamageBoost, applyLootingQuantityBoost } = require("../../modules/boostIntegration");

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
} = require("../../embeds/embeds.js");

// Models
const Character = require("../../models/CharacterModel.js");
const User = require("../../models/UserModel.js");

// Character Stats
const { handleKO } = require("../../modules/characterStatsModule.js");

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
async function updateCharacterLootTimestamp(character, shouldClearBoost = true) {
  character.lastLootedAt = new Date().toISOString();
  
  // ------------------- Clear Boost After Use -------------------
  if (character.boostedBy && shouldClearBoost) {
    logger.info('BOOST', `Clearing boost for ${character.name}`);
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
    console.error(`[Loot Command]: ${character.name} lacks required skills for job: "${job}"`);
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
            console.log(`[loot.js]: 🧪 Blight resistance buff applied - Infection chance reduced from 0.75 to ${infectionChance}`);
          }
       if (buffEffects && buffEffects.fireResistance > 0) {
         infectionChance -= (buffEffects.fireResistance * 0.05); // Each level reduces by 5%
         console.log(`[loot.js]: 🧪 Fire resistance buff applied - Infection chance reduced from ${infectionChance} to ${infectionChance - (buffEffects.fireResistance * 0.05)}`);
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
         console.log(`[loot.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
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
             console.log(`[loot.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
           }
         } else {
           safeMsg += `◈ Your character **${character.name}** braved the blight rain but managed to avoid infection this time! ◈\n`;
           safeMsg += "You feel lucky... but be careful out there.";
         }
         
         blightRainMessage = safeMsg;
         console.log(`[loot.js]: 🧿 Character ${character.name} avoided blight infection`);
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
    
    // Use the original endDate timestamp directly for Discord display
    const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
    
    await interaction.editReply({
     content: `❌ **${character.name} is currently debuffed and cannot loot. Please wait until the debuff expires.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
     ephemeral: true,
    });
    return;
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
       console.error(`[Loot Command]: ❌ Failed to update daily roll:`, error);
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
    console.log(`[LOOT] No region found for village: ${currentVillage}`);
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

       // Deactivate Job Voucher AFTER successful raid trigger
       if (character.jobVoucher && !voucherCheck?.skipVoucher) {
         const deactivationResult = await deactivateJobVoucher(character._id);
         if (!deactivationResult.success) {
           console.error(`[Loot Command]: ❌ Failed to deactivate job voucher for ${character.name}`);
         } else {
           console.log(`[Loot Command]: ✅ Job voucher deactivated for ${character.name} after Blood Moon raid trigger`);
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
       originalRoll // Pass originalRoll for blight boost display
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
      console.error(`[loot.js]: Error during loot process: ${error.message}`, {
        stack: error.stack,
        interactionData: {
          userId: interaction.user.id,
          characterName: interaction.options.getString('charactername'),
          guildId: interaction.guildId,
          channelId: interaction.channelId,
        },
      });
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
 originalRoll = null
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

    // Deactivate Job Voucher AFTER successful raid trigger
    if (character.jobVoucher) {
      const deactivationResult = await deactivateJobVoucher(character._id);
      if (!deactivationResult.success) {
        console.error(`[Loot Command]: ❌ Failed to deactivate job voucher for ${character.name}`);
      } else {
        console.log(`[Loot Command]: ✅ Job voucher deactivated for ${character.name} after Blood Moon raid trigger (reroll)`);
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
    console.log(`[loot.js]: 🧿 Character ${character.name} has blight stage 3 - no monsters allowed`);
    const embed = createBlightStage3NoEncounterEmbed(character, bloodMoonActive);
    await interaction.editReply({ embeds: [embed] });
    console.log(`[loot.js]: ✅ Blight stage 3 no encounter embed sent`);
    return null;
  }

  const monstersByCriteria = await getMonstersByCriteria(currentVillage, job);
  logger.info('LOOT', `Found ${monstersByCriteria.length} monsters for ${currentVillage} with job ${job}`);
  
  if (monstersByCriteria.length === 0) {
    console.log(`[loot.js]: 🌅 No monsters found for criteria - sending no encounter embed`);
    const embed = createNoEncounterEmbed(character, bloodMoonActive); // Send "No Encounter" embed
    await interaction.editReply({ embeds: [embed] });
    console.log(`[loot.js]: ✅ No monsters criteria no encounter embed sent`);
    return null;
  }

  const encounterResult = await getMonsterEncounterFromList(monstersByCriteria);
  logger.info('LOOT', `Encounter result: ${encounterResult.encounter}`);
  
  if (encounterResult.encounter === "No Encounter") {
    console.log(`[loot.js]: 🌅 Encounter roll resulted in no encounter - sending no encounter embed`);
    const embed = createNoEncounterEmbed(character, bloodMoonActive); // Send "No Encounter" embed
    await interaction.editReply({ embeds: [embed] });
    console.log(`[loot.js]: ✅ Encounter roll no encounter embed sent`);
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
    console.log(`[loot.js]: 💀 Blight boost applied to ${character.name} - Roll enhanced from ${originalRoll} to ${blightAdjustedRoll} (${multiplier}x multiplier, +${improvement} points)`);
  }

  // ------------------- Apply Boosting Effects -------------------
  // Check if character is boosted and apply looting boosts
  adjustedRandomValue = await applyLootingBoost(character.name, adjustedRandomValue);

  const weightedItems = createWeightedItemList(items, adjustedRandomValue);
  const rollDisplay = originalRoll && blightAdjustedRoll > originalRoll ? `${originalRoll} → ${blightAdjustedRoll}` : `${originalRoll}`;
  logger.info('LOOT', `${character.name} vs ${encounteredMonster.name} | Roll: ${rollDisplay}/100 | Damage: ${damageValue} | Can loot: ${weightedItems.length > 0 ? 'Yes' : 'No'}`);

  const outcome = await getEncounterOutcome(
   character,
   encounteredMonster,
   damageValue,
   adjustedRandomValue,
   attackSuccess,
   defenseSuccess
  );

  // Track elixir buff information for the embed
  let elixirBuffInfo = null;

  // ------------------- Elixir Consumption Logic -------------------
  // Check if elixirs should be consumed based on the monster encounter
  try {
    const { shouldConsumeElixir, consumeElixirBuff, getActiveBuffEffects } = require('../../modules/elixirModule');
    
    // Check for active elixir buffs before consumption
    const activeBuff = getActiveBuffEffects(character);
    if (activeBuff) {
      console.log(`[loot.js]: 🧪 ${character.name} has active elixir buff: ${character.buff.type}`);
      
      // Log specific elixir effects that might help
      if (activeBuff.fireResistance > 0 && encounteredMonster.name.includes('Fire')) {
        console.log(`[loot.js]: 🔥 Fireproof Elixir active! ${character.name} has +${activeBuff.fireResistance} fire resistance against ${encounteredMonster.name}`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Fireproof Elixir',
          elixirType: 'fireproof',
          encounterType: 'fire',
          damageReduced: 0
        };
      }
      if (activeBuff.coldResistance > 0 && encounteredMonster.name.includes('Ice')) {
        console.log(`[loot.js]: ❄️ Spicy Elixir active! ${character.name} has +${activeBuff.coldResistance} cold resistance against ${encounteredMonster.name}`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Spicy Elixir',
          elixirType: 'spicy',
          encounterType: 'ice',
          damageReduced: 0
        };
      }
      if (activeBuff.electricResistance > 0 && encounteredMonster.name.includes('Electric')) {
        console.log(`[loot.js]: ⚡ Electro Elixir active! ${character.name} has +${activeBuff.electricResistance} electric resistance against ${encounteredMonster.name}`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Electro Elixir',
          elixirType: 'electro',
          encounterType: 'electric',
          damageReduced: 0
        };
      }
      if (activeBuff.blightResistance > 0) {
        console.log(`[loot.js]: 🧿 Chilly Elixir active! ${character.name} has +${activeBuff.blightResistance} blight resistance`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Chilly Elixir',
          elixirType: 'chilly',
          encounterType: 'blight',
          damageReduced: 0
        };
      }
      if (activeBuff.stealthBoost > 0) {
        console.log(`[loot.js]: 👻 Sneaky Elixir active! ${character.name} has +${activeBuff.stealthBoost} stealth boost for looting`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Sneaky Elixir',
          elixirType: 'sneaky',
          encounterType: 'general',
          damageReduced: 0
        };
      }
      if (activeBuff.defenseBoost > 0) {
        console.log(`[loot.js]: 🛡️ Tough Elixir active! ${character.name} has +${activeBuff.defenseBoost} defense boost`);
        elixirBuffInfo = {
          helped: true,
          elixirName: 'Tough Elixir',
          elixirType: 'tough',
          encounterType: 'general',
          damageReduced: 0
        };
      }
      if (activeBuff.attackBoost > 0) {
        console.log(`[loot.js]: ⚔️ Mighty Elixir active! ${character.name} has +${activeBuff.attackBoost} attack boost`);
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
      
      console.log(`[loot.js]: 🧪 Elixir consumed for ${character.name} during loot encounter with ${encounteredMonster.name}`);
      
      // Log what the elixir protected against
      if (consumedElixirType === 'fireproof' && encounteredMonster.name.includes('Fire')) {
        console.log(`[loot.js]: 🔥 Fireproof Elixir protected ${character.name} from fire damage during encounter with ${encounteredMonster.name}`);
      } else if (consumedElixirType === 'spicy' && encounteredMonster.name.includes('Ice')) {
        console.log(`[loot.js]: ❄️ Spicy Elixir protected ${character.name} from ice damage during encounter with ${encounteredMonster.name}`);
      } else if (consumedElixirType === 'electro' && encounteredMonster.name.includes('Electric')) {
        console.log(`[loot.js]: ⚡ Electro Elixir protected ${character.name} from electric damage during encounter with ${encounteredMonster.name}`);
      } else if (consumedElixirType === 'chilly') {
        console.log(`[loot.js]: 🧿 Chilly Elixir protected ${character.name} from blight rain effects`);
      } else if (consumedElixirType === 'sneaky') {
        console.log(`[loot.js]: 👻 Sneaky Elixir helped ${character.name} with stealth during looting`);
      } else if (consumedElixirType === 'tough') {
        console.log(`[loot.js]: 🛡️ Tough Elixir provided defense boost for ${character.name} during encounter`);
      } else if (consumedElixirType === 'mighty') {
        console.log(`[loot.js]: ⚔️ Mighty Elixir provided attack boost for ${character.name} during encounter`);
      }
      
      consumeElixirBuff(character);
      
      // Update character in database to persist the consumed elixir
      await Character.findByIdAndUpdate(character._id, { buff: character.buff });
    } else if (character.buff?.active) {
      // Log when elixir is not used due to conditions not met
      console.log(`[loot.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
    }
  } catch (elixirError) {
    console.error(`[loot.js]: ⚠️ Warning - Elixir consumption failed:`, elixirError);
    // Don't fail the loot if elixir consumption fails
  }

  // ------------------- Apply Elixir Roll Boost -------------------
  // Apply elixir effects to the roll value BEFORE damage calculation
  if (elixirBuffInfo && elixirBuffInfo.helped && outcome.adjustedRandomValue) {
    const originalRoll = outcome.adjustedRandomValue;
    
    if (elixirBuffInfo.encounterType === 'fire' && elixirBuffInfo.elixirType === 'fireproof') {
      // Fireproof elixir provides 1.5x roll multiplier (higher roll = less damage)
      outcome.adjustedRandomValue = Math.min(100, Math.ceil(originalRoll * 1.5));
      console.log(`[loot.js]: 🔥 Fireproof Elixir boosted roll from ${originalRoll} to ${outcome.adjustedRandomValue}`);
      
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
        console.log(`[loot.js]: 🔥 Fireproof Elixir reduced damage from ${originalDamage} to ${outcome.hearts} (${damageReduced} less damage)`);
      }
    } else if (elixirBuffInfo.encounterType === 'electric' && elixirBuffInfo.elixirType === 'electro') {
      // Electro elixir provides 1.5x roll multiplier (higher roll = less damage)
      outcome.adjustedRandomValue = Math.min(100, Math.ceil(originalRoll * 1.5));
      console.log(`[loot.js]: ⚡ Electro Elixir boosted roll from ${originalRoll} to ${outcome.adjustedRandomValue}`);
      
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
        console.log(`[loot.js]: ⚡ Electro Elixir reduced damage from ${originalDamage} to ${outcome.hearts} (${damageReduced} less damage)`);
      }
    } else if (elixirBuffInfo.encounterType === 'ice' && elixirBuffInfo.elixirType === 'spicy') {
      // Spicy elixir provides 1.5x roll multiplier (higher roll = less damage)
      outcome.adjustedRandomValue = Math.min(100, Math.ceil(originalRoll * 1.5));
      console.log(`[loot.js]: ❄️ Spicy Elixir boosted roll from ${originalRoll} to ${outcome.adjustedRandomValue}`);
      
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
        console.log(`[loot.js]: ❄️ Spicy Elixir reduced damage from ${originalDamage} to ${outcome.hearts} (${damageReduced} less damage)`);
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
          console.log(`[loot.js]: 🎭 Entertainer boost - Requiem of Spirit (Tier ${monsterTier}) reduces damage from ${originalHeartDamage} to ${reducedDamage} (-${entertainerDamageReduction} hearts)`);
          
          // Hearts were already removed by getEncounterOutcome - restore them and reapply correct amount
          // Step 1: Restore the hearts that were taken
          await recoverHearts(character._id, originalHeartDamage);
          console.log(`[loot.js]: 🔄 Restored ${originalHeartDamage} hearts to reapply with boost`);
          
          // Step 2: Apply the boosted (reduced) damage
          if (reducedDamage > 0) {
            const { useHearts } = require('../../modules/characterStatsModule');
            await useHearts(character._id, reducedDamage);
            console.log(`[loot.js]: 💔 Applied boosted damage: ${reducedDamage} hearts`);
          }
          
          // Update outcome to reflect the reduced damage
          outcome.hearts = reducedDamage;
        }
      } else if (!outcome.hearts || outcome.hearts === 0) {
        // Boost was active but not needed (no damage taken)
        entertainerBoostUnused = true;
        damageWasTaken = false; // Ensure boost is not cleared
        console.log(`[loot.js]: 🎭 Entertainer boost was active but not needed (no damage taken)`);
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
   console.log(`[loot.js]: 💀 Character ${character.name} has been KO'd`);
   await handleKO(updatedCharacter._id);
  }

  // Step 3: Generate Outcome Message
  const outcomeMessage = generateOutcomeMessage(outcome, character);

  // Step 4: Loot Item Logic
  let lootedItem = null;
  if (outcome.canLoot && weightedItems.length > 0) {
   lootedItem = await generateLootedItem(encounteredMonster, weightedItems, character);
   console.log(`[loot.js]: 🎁 ${character.name} looted: ${lootedItem?.itemName} (x${lootedItem?.quantity})`);

   const inventoryLink = character.inventory || character.inventoryLink;
   if (!isValidGoogleSheetsUrl(inventoryLink)) {
    console.log(`[loot.js]: ❌ Invalid inventory link for ${character.name}`);
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
     entertainerDamageReduction // Pass amount of damage reduced by Entertainer boost
    );
    
    // Update timestamp and clear boost only if damage was taken
    await updateCharacterLootTimestamp(character, damageWasTaken);
    
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
   blightAdjustedRoll, // Pass blightAdjustedRoll for blight boost detection
   null, // currentMonster
   null, // totalMonsters
   null, // entertainerBonusItem
   null, // boostCategoryOverride
   elixirBuffInfo, // Pass elixirBuffInfo to the embed
   originalRoll, // Pass originalRoll to the embed
   blightRainMessage, // Pass blight rain message to the embed
   entertainerBoostUnused, // Pass flag indicating boost was active but unused
   entertainerDamageReduction // Pass amount of damage reduced by Entertainer boost
   );
  
  // Update character timestamp and clear boost AFTER embed is created
  // Only clear boost if damage was actually taken (boost was used)
  await updateCharacterLootTimestamp(character, damageWasTaken);
  
  await interaction.editReply({ embeds: [embed] });

  // ------------------- Deactivate Job Voucher if needed -------------------
  if (shouldDeactivateVoucher && character.jobVoucher) {
    const deactivationResult = await deactivateJobVoucher(character._id);
    if (!deactivationResult.success) {
      console.error(`[Loot Command]: ❌ Failed to deactivate job voucher for ${character.name}`);
    } else {
      console.log(`[Loot Command]: ✅ Job voucher deactivated for ${character.name} in processLootingLogic`);
    }
  }
  } catch (error) {
    console.error(`[loot.js]: ❌ Error in processLootingLogic:`, error);
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
 const randomIndex = Math.floor(Math.random() * weightedItems.length);
 const lootedItem = weightedItems[randomIndex];

 if (encounteredMonster.name.includes("Chuchu")) {
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
    console.error(`[loot.js]: Error fetching emoji for ${jellyType}:`, error);
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


