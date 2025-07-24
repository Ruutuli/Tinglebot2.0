// ------------------- Import Section -------------------

// Standard Libraries
// (No standard libraries imported here)

// Third-Party Libraries
const { SlashCommandBuilder } = require("discord.js"); // Used to create slash commands for Discord bots
const { v4: uuidv4 } = require("uuid"); // Generates unique identifiers
const dotenv = require('dotenv');
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });

// Database Services
const {
 fetchCharacterByNameAndUserId,
 fetchItemsByMonster,
} = require("../../database/db.js");
const { handleError } = require("../../utils/globalErrorHandler.js");

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
 createKOEmbed,
} = require("../../embeds/embeds.js");

// Models
const Character = require("../../models/CharacterModel.js");

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
  handleError(error, "loot.js");
  await interaction.editReply({
    content: `❌ **An error occurred during the loot command execution${context ? `: ${context}` : ''}.**`,
  });
}

// Unified character update
async function updateCharacterLootTimestamp(character) {
  character.lastLootedAt = new Date().toISOString();
  await character.save();
}

// Unified embed creation
async function sendNoEncounterEmbed(interaction, character, bloodMoonActive) {
  const embed = createNoEncounterEmbed(character, bloodMoonActive);
  await interaction.editReply({ embeds: [embed] });
}

// Unified character validation
async function validateCharacterForLoot(interaction, characterName, userId) {
  const character = await fetchCharacterByNameAndUserId(characterName, userId);
  if (!character) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Character Not Found',
        description: `Character \`${characterName}\` not found or does not belong to you.`,
        image: {
          url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        footer: {
          text: 'Character Validation'
        }
      }],
      ephemeral: true
    });
    return null;
  }
  return character;
}

// Unified job validation
async function validateJobForLoot(interaction, character, job) {
  if (!job || typeof job !== "string" || !job.trim() || !isValidJob(job)) {
    console.error(`[loot.js]: ❌ Invalid job "${job}" for ${character.name}`);
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
          url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
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
    console.log(`[loot.js]: 📅 No previous rolls for gather/loot. Allowing action.`);
    return true;
  }

  const lastGatherDate = lastGatherRoll ? new Date(lastGatherRoll) : null;
  const lastLootDate = lastLootRoll ? new Date(lastLootRoll) : null;
  
  // If either activity was used today, deny the action
  if (lastGatherDate && lastGatherDate >= rollover) {
    console.log(`[loot.js]: 📅 Already gathered today at ${lastGatherDate.toISOString()}`);
    return false;
  }
  if (lastLootDate && lastLootDate >= rollover) {
    console.log(`[loot.js]: 📅 Already looted today at ${lastLootDate.toISOString()}`);
    return false;
  }

  console.log(`[loot.js]: 📅 now=${now.toISOString()} | lastGather=${lastGatherDate?.toISOString()} | lastLoot=${lastLootDate?.toISOString()} | rollover=${rollover.toISOString()}`);
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
    console.log(`[loot.js]: ✅ Updated daily roll for ${activity} at ${now}`);
  } catch (error) {
    console.error(`[loot.js]: ❌ Failed to update daily roll for ${character.name}:`, error);
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
   await interaction.deferReply();

   // ------------------- Step 1: Validate Character -------------------
   const characterName = interaction.options.getString("charactername");
   const userId = interaction.user.id;

   const character = await validateCharacterForLoot(interaction, characterName, userId);
   if (!character) {
    return;
   }

   // ------------------- Step 2: Check Hearts and Job Validity -------------------
   if (character.currentHearts === 0) {
    const embed = createKOEmbed(character);
    await interaction.editReply({ embeds: [embed] });
    return;
   }

   // Determine job based on jobVoucher or default job
   let job = character.jobVoucher && character.jobVoucherJob ? character.jobVoucherJob : character.job;
   console.log(`[loot.js]: 🔄 Job determined for ${character.name}: "${job}"`);

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

   if (!allowedChannel || interaction.channelId !== allowedChannel) {
    const channelMention = `<#${allowedChannel}>`;
    await interaction.editReply({
      embeds: [{
        color: 0x008B8B, // Dark cyan color
        description: `*${character.name} looks around, confused by their surroundings...*\n\n**Channel Restriction**\nYou can only use this command in the ${currentVillage} Town Hall channel!\n\n📍 **Current Location:** ${capitalizeWords(character.currentVillage)}\n💬 **Command Allowed In:** ${channelMention}`,
        image: {
          url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        footer: {
          text: 'Channel Restriction'
        }
      }],
      ephemeral: true
    });
    return;
   }

   // Check for job voucher
   if (character.jobVoucher) {
     console.log(`[Loot Command]: 🔄 Active job voucher found for ${character.name}`);
   } else {
     console.log(`[Loot Command]: 🔄 No active job voucher for ${character.name}`);
   }

   // Validate job voucher (without consuming it)
   let voucherCheck;
   if (character.jobVoucher) {
     console.log(`[loot.js]: 🎫 Validating job voucher for ${character.name}`);
     voucherCheck = await validateJobVoucher(character, job, 'LOOTING');
     if (!voucherCheck.success) {
       await interaction.editReply({
         content: voucherCheck.message,
         ephemeral: true
       });
       return;
     }
     console.log(`[loot.js]: ✅ Job voucher validation successful for ${character.name}`);
   }

   // ---- Blight Rain Infection Check ----
   const weather = await getWeatherWithoutGeneration(character.currentVillage);
   if (weather?.special?.label === 'Blight Rain') {
     if (character.blighted) {
       const alreadyMsg =
         "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
         `◈ Your character **${character.name}** braved the blight rain, but they're already blighted... guess it doesn't matter! ◈`;
       await interaction.editReply({ content: alreadyMsg, ephemeral: false });
     } else if (Math.random() < 0.75) {
       const blightMsg =
         "<:blight_eye:805576955725611058> **Blight Infection!**\n\n" +
         `◈ Oh no... your character **${character.name}** has come into contact with the blight rain and has been **blighted**! ◈\n\n` +
         "You can be healed by **Oracles, Sages & Dragons**  \n" +
         "▹ [Blight Information](https://www.rootsofrootsofthewild.com/blight)  \n" +
         "▹ [Currently Available Blight Healers](https://discord.com/channels/${process.env.GUILD_ID}/651614266046152705/845481974671736842)\n\n" +
         "**STAGE 1:**  \n" +
         "Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms. At this stage you can be helped by having one of the sages, oracles or dragons heal you.\n\n" +
         "> **Starting tomorrow, you'll be prompted to roll in the Community Board each day to see if your blight gets worse!**\n" +
         "> *You will not be penalized for missing today's blight roll if you were just infected.*";
       await interaction.editReply({ content: blightMsg, ephemeral: false });
       // Update character in DB
       character.blighted = true;
       character.blightedAt = new Date();
       character.blightStage = 1;
       
       await character.save();
       // Assign blighted role
       const guild = interaction.guild;
       if (guild) {
         const member = await guild.members.fetch(interaction.user.id);
         await member.roles.add('1314750575933653022');
       }
     } else {
       const safeMsg =
         "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
         `◈ Your character **${character.name}** braved the blight rain but managed to avoid infection this time! ◈\n` +
         "You feel lucky... but be careful out there.";
       await interaction.editReply({ content: safeMsg, ephemeral: false });
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
             url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
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
   if (!character.jobVoucher) {
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
             url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
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
       // ------------------- Deactivate Job Voucher Before Raid -------------------
       if (character.jobVoucher && !voucherCheck?.skipVoucher) {
         const deactivationResult = await deactivateJobVoucher(character._id);
         if (!deactivationResult.success) {
           console.error(`[Loot Command]: ❌ Failed to deactivate job voucher for ${character.name}`);
         } else {
           console.log(`[Loot Command]: ✅ Job voucher deactivated for ${character.name} before Blood Moon raid`);
         }
       }
       
       await triggerRaid(
        encounteredMonster,
        interaction,
        capitalizeVillageName(character.currentVillage),
        true,
        character
       ); // Pass `true` for Blood Moon and character for auto-join
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
       true // Blood Moon status
      );
      return; // Stop if reroll is needed and executed
     }
    } catch (error) {
     handleError(error, "loot.js");
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
    character.jobVoucher && !voucherCheck?.skipVoucher // Deactivate job voucher if needed
   );

   // Remove duplicate daily roll update since we now do it at the start
   console.log(`[loot.js]: ✅ Loot command completed successfully for ${character.name}`);

  } catch (error) {
    // Only log errors that aren't inventory sync related
    if (!error.message.includes('inventory is not synced')) {
      handleError(error, "loot.js");
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
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
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
 bloodMoonActive
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
    // ------------------- Deactivate Job Voucher Before Raid -------------------
    if (character.jobVoucher) {
      const deactivationResult = await deactivateJobVoucher(character._id);
      if (!deactivationResult.success) {
        console.error(`[Loot Command]: ❌ Failed to deactivate job voucher for ${character.name}`);
      } else {
        console.log(`[Loot Command]: ✅ Job voucher deactivated for ${character.name} before Blood Moon raid (reroll)`);
      }
    }
    
    await triggerRaid(
     encounteredMonster,
     interaction,
     capitalizeVillageName(character.currentVillage),
     bloodMoonActive,
     character
    ); // Let triggerRaid handle thread creation and auto-join
    return;
   } else {
    await processLootingLogic(
     interaction,
     character,
     encounteredMonster,
     bloodMoonActive,
     true // Deactivate job voucher for reroll encounters
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
  // Check for blight stage 3 effect (no monsters)
  if (character.blightEffects?.noMonsters) {
    const embed = createNoEncounterEmbed(character, bloodMoonActive);
    await interaction.editReply({ embeds: [embed] });
    return null;
  }

  const monstersByCriteria = await getMonstersByCriteria(currentVillage, job);
  if (monstersByCriteria.length === 0) {
    const embed = createNoEncounterEmbed(character, bloodMoonActive); // Send "No Encounter" embed
    await interaction.editReply({ embeds: [embed] });
    return null;
  }

  const encounterResult = await getMonsterEncounterFromList(monstersByCriteria);
  if (encounterResult.encounter === "No Encounter") {
    const embed = createNoEncounterEmbed(character, bloodMoonActive); // Send "No Encounter" embed
    await interaction.editReply({ embeds: [embed] });
    return null;
  }

  const encounteredMonster =
    encounterResult.monsters[
      Math.floor(Math.random() * encounterResult.monsters.length)
    ];

  // Return the final encountered monster
  return encounteredMonster;
}


// ------------------- Looting Logic -------------------
async function processLootingLogic(
 interaction,
 character,
 encounteredMonster,
 bloodMoonActive,
 shouldDeactivateVoucher = false
) {
 try {
  const items = await fetchItemsByMonster(encounteredMonster.name);

  // Step 1: Calculate Encounter Outcome
  console.log(`[loot.js]: 🎲 Starting damage calculation for ${character.name} vs ${encounteredMonster.name}`);
  console.log(`[loot.js]: 📊 Character stats - Attack: ${character.attack}, Defense: ${character.defense}`);
  
  // Generate a random dice roll between 1 and 100
  const diceRoll = Math.floor(Math.random() * 100) + 1;
  console.log(`[loot.js]: 🎲 Generated dice roll: ${diceRoll}/100`);
  
  const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } =
   calculateFinalValue(character, diceRoll);

  console.log(`[loot.js]: 📈 Damage calculation results:`);
  console.log(`[loot.js]: - Base damage value: ${damageValue}`);
  console.log(`[loot.js]: - Adjusted random value: ${adjustedRandomValue}`);
  console.log(`[loot.js]: - Attack success: ${attackSuccess}`);
  console.log(`[loot.js]: - Defense success: ${defenseSuccess}`);

  const weightedItems = createWeightedItemList(items, adjustedRandomValue);
  console.log(`[loot.js]: 🎯 Created weighted item list with ${weightedItems.length} items based on adjusted value: ${adjustedRandomValue}`);

  const outcome = await getEncounterOutcome(
   character,
   encounteredMonster,
   damageValue,
   adjustedRandomValue,
   attackSuccess,
   defenseSuccess
  );

  console.log(`[loot.js]: 🎯 Encounter outcome:`);
  console.log(`[loot.js]: - Result: ${outcome.result}`);
  console.log(`[loot.js]: - Hearts lost: ${outcome.hearts || 0}`);
  console.log(`[loot.js]: - Can loot: ${outcome.canLoot}`);

  // Step 2: Handle KO Logic
  const updatedCharacter = await Character.findById(character._id);
  if (!updatedCharacter) {
   throw new Error(`Unable to find updated character with ID ${character._id}`);
  }

  if (updatedCharacter.currentHearts === 0 && !updatedCharacter.ko) {
   console.log(`[loot.js]: 💀 Character ${character.name} has been KO'd`);
   await handleKO(updatedCharacter._id);
  }

  // Step 3: Generate Outcome Message
  const outcomeMessage = generateOutcomeMessage(outcome);
  console.log(`[loot.js]: 📝 Generated outcome message: ${outcomeMessage}`);

  // Step 4: Loot Item Logic
  let lootedItem = null;
  if (outcome.canLoot && weightedItems.length > 0) {
   console.log(`[loot.js]: 🎁 Attempting to loot items from ${encounteredMonster.name}`);
   lootedItem = generateLootedItem(encounteredMonster, weightedItems);
   console.log(`[loot.js]: 🎁 Selected item: ${lootedItem?.itemName} (Quantity: ${lootedItem?.quantity})`);

   const inventoryLink = character.inventory || character.inventoryLink;
   if (!isValidGoogleSheetsUrl(inventoryLink)) {
    console.log(`[loot.js]: ❌ Invalid inventory link for ${character.name}`);
    const embed = createMonsterEncounterEmbed(
     character,
     encounteredMonster,
     outcomeMessage,
     updatedCharacter.currentHearts,
     lootedItem,
     bloodMoonActive,
     outcome.adjustedRandomValue
    );
    await interaction.editReply({
     content: `❌ **Invalid Google Sheets URL for "${character.name}".**`,
     embeds: [embed],
    });
    return;
   }

   await handleInventoryUpdate(interaction, character, lootedItem, encounteredMonster, bloodMoonActive);
  }

  // Update character timestamp
  await updateCharacterLootTimestamp(character);
  console.log(`[loot.js]: ✅ Updated loot timestamp for ${character.name}`);

  const embed = createMonsterEncounterEmbed(
   character,
   encounteredMonster,
   outcomeMessage,
   updatedCharacter.currentHearts,
   outcome.canLoot && weightedItems.length > 0 ? lootedItem : null,
   bloodMoonActive,
   outcome.adjustedRandomValue
  );
  await interaction.editReply({ embeds: [embed] });
  console.log(`[loot.js]: ✅ Loot process completed for ${character.name}`);

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
  const spreadsheetId = extractSpreadsheetId(character.inventory);
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
    lootedItem.category.join(", "),
    lootedItem.type.join(", "),
    interaction
  );

  try {
    if (character?.name && character?.inventory && character?.userId) {
      const sheetResult = await safeAppendDataToSheet(character.inventory, character, range, values, undefined, {
        skipValidation: true,
        context: {
          commandName: 'loot',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          characterName: character.name,
          spreadsheetId: extractSpreadsheetId(character.inventory),
          range: range,
          sheetType: 'inventory',
          options: {
            monsterName: encounteredMonster.name,
            itemName: lootedItem.itemName,
            quantity: lootedItem.quantity,
            bloodMoonActive: bloodMoonActive
          }
        }
      });
      
      // Check if the operation was stored for retry
      if (sheetResult && sheetResult.storedForRetry) {
        console.log(`[loot.js]: 📦 Sheet operation stored for retry: ${sheetResult.operationId}`);
        // Don't show error to user - the operation will be retried automatically
      }
    } else {
      console.error('[safeAppendDataToSheet]: Invalid character object detected before syncing.');
    }
  } catch (sheetError) {
    console.error(`[LOOT] Google Sheets append error: ${sheetError.message}`);
    await interaction.editReply({
      content:
        `❌ **Failed to write to your Google Sheet.**\n` +
        `> Make sure your **Inventory** link is a valid Google Sheets URL ` +
        `and that you've shared the sheet with the service account ` +
        `(the "client_email" in service_account.json).`,
      ephemeral: true,
    });
    throw sheetError;
  }
}

// ------------------- Helper Function: Generate Outcome Message -------------------
function generateOutcomeMessage(outcome) {
 if (outcome.hearts) {
  return outcome.result === "KO"
   ? generateDamageMessage("KO")
   : generateDamageMessage(outcome.hearts);
 } else if (outcome.defenseSuccess) {
  return generateDefenseBuffMessage(
   outcome.defenseSuccess,
   outcome.adjustedRandomValue,
   outcome.damageValue
  );
 } else if (outcome.attackSuccess) {
  return generateAttackBuffMessage(
   outcome.attackSuccess,
   outcome.adjustedRandomValue,
   outcome.damageValue
  );
 } else if (outcome.result === "Win!/Loot") {
  return generateVictoryMessage(
   outcome.adjustedRandomValue,
   outcome.defenseSuccess,
   outcome.attackSuccess
  );
 }
 return generateFinalOutcomeMessage(
  outcome.damageValue,
  outcome.defenseSuccess,
  outcome.attackSuccess,
  outcome.adjustedRandomValue,
  outcome.damageValue
 );
}

// ------------------- Helper Function: Generate Looted Item -------------------
function generateLootedItem(encounteredMonster, weightedItems) {
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
  lootedItem.emoji = '<:Chuchu_Jelly:744755431175356416>'; // Set the correct emoji for Chuchu Jelly
 } else {
  lootedItem.quantity = 1; // Default quantity for non-Chuchu items
 }

 return lootedItem;
}
