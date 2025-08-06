// ============================================================================
// ------------------- Gather Command Module -------------------
// ============================================================================
// This module handles the gathering of items based on the character's job and location.

// ============================================================================
// ------------------- Discord.js Components -------------------
// ============================================================================
const { SlashCommandBuilder } = require('discord.js');

// ============================================================================
// ------------------- Standard Libraries -------------------
// ============================================================================
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// ------------------- Database Services -------------------
// ============================================================================
const { fetchCharacterByNameAndUserId, fetchAllItems, fetchItemsByMonster, fetchAllMonsters } = require('../../database/db.js');

// ============================================================================
// ------------------- Modules -------------------
// ============================================================================
const { createWeightedItemList, calculateFinalValue } = require('../../modules/rngModule.js');
const { generateVictoryMessage, generateDamageMessage, generateFinalOutcomeMessage, generateDefenseBuffMessage, generateAttackBuffMessage } = require('../../modules/flavorTextModule.js');
const { getEncounterOutcome } = require('../../modules/encounterModule.js');
const { getJobPerk, normalizeJobName, isValidJob } = require('../../modules/jobsModule.js');
const { getVillageRegionByName } = require('../../modules/locationsModule.js');
const { useHearts, handleKO, updateCurrentHearts } = require('../../modules/characterStatsModule.js');
const { capitalizeWords } = require('../../modules/formattingModule.js');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule.js');
const { applyBoostEffect, getBoostEffect, getBoostEffectByCharacter } = require('../../modules/boostingModule.js');

// ============================================================================
// ------------------- Utilities -------------------
// ============================================================================
const { handleError } = require('../../utils/globalErrorHandler.js');
const { checkInventorySync } = require('../../utils/characterUtils');
const { enforceJail } = require('../../utils/jailCheck');
const { addItemInventoryDatabase } = require('../../utils/inventoryUtils.js');
const { authorizeSheets, appendSheetData, safeAppendDataToSheet } = require('../../utils/googleSheetsUtils.js');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../../utils/googleSheetsUtils.js');

// ============================================================================
// ------------------- Services -------------------
// ============================================================================
const { getWeatherWithoutGeneration } = require('../../services/weatherService');

// ============================================================================
// ------------------- Embeds -------------------
// ============================================================================
const { createGatherEmbed, createMonsterEncounterEmbed, createKOEmbed } = require('../../embeds/embeds.js');

// ============================================================================
// ------------------- Models -------------------
// ============================================================================
const User = require('../../models/UserModel.js');

// ============================================================================
// ------------------- Scripts -------------------
// ============================================================================
const { isBloodMoonActive } = require('../../scripts/bloodmoon.js');

// ============================================================================
// ------------------- Village Channels -------------------
// ============================================================================
// Define the allowed channels for each village.
const villageChannels = {
  Inariko: process.env.INARIKO_TOWNHALL,
  Rudania: process.env.RUDANIA_TOWNHALL,
  Vhintl: process.env.VHINTL_TOWNHALL,
};

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Daily Roll Functions ------------------
// Check if a daily roll is available for a specific activity
function canUseDailyRoll(character, activity, userId) {
  // If character has an active job voucher, they can always use the command
  if (character.jobVoucher) {
    return true;
  }

  // Special case for specific user ID
  if (userId === '668281042414600212') {
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
    console.error(`[gather.js]: ❌ Failed to update daily roll for ${character.name}:`, error);
    throw error;
  }
}

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================
// Define the slash command for gathering.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('gather')
    .setDescription('Gather items based on your character\'s job and location')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)),

  // ============================================================================
  // ------------------- Command Execution Logic -------------------
  // ============================================================================
  async execute(interaction) {
    // Initialize variables at the top of the function
    let job;
    let region;
    let currentVillage;
    let hasResponded = false;

    // ------------------- Helper Function: Safe Reply ------------------
    // Helper function to safely respond to interaction
    const safeReply = async (content, options = {}) => {
      if (hasResponded || interaction.replied || interaction.deferred) {
        try {
          await interaction.editReply(content);
        } catch (error) {
          if (error.code === 10062) {
            // Interaction has expired, try followUp instead
            try {
              await interaction.followUp(content);
            } catch (followUpError) {
              console.error('[gather.js]: Failed to send followUp message:', followUpError);
            }
          } else {
            throw error;
          }
        }
      } else {
        try {
          await interaction.reply(content);
          hasResponded = true;
        } catch (error) {
          if (error.code === 10062) {
            console.error('[gather.js]: Interaction expired before initial response');
          } else {
            throw error;
          }
        }
      }
    };

    try {
      await interaction.deferReply();

      const characterName = interaction.options.getString('charactername');
      const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
      if (!character) {
        await safeReply({
          content: `❌ **Character ${characterName} not found or does not belong to you.**`,
        });
        return;
      }

      // Check inventory sync before proceeding
      await checkInventorySync(character);

      // Initialize job variable
      job = (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job;

      // Check for KO status
      if (character.currentHearts === 0) {
        const embed = createKOEmbed(character);
        await safeReply({ embeds: [embed] });
        return;
      }

      // Check for blight stage 4 effect (no gathering)
      if (character.blightEffects?.noGathering) {
        await safeReply({
          content: `❌ **${character.name}** cannot gather items due to advanced blight stage.`,
          ephemeral: true
        });
        return;
      }

      // Check if character is in jail
      if (await enforceJail(interaction, character)) {
        return;
      }

      // Check if the character is KOed.
      if (character.isKO) {
        await safeReply({
          content: `❌ **${character.name}** is currently KOed and cannot gather.**\n💤 **Let them rest and recover before gathering again.**`,
          ephemeral: true,
        });
        return;
      }

      // Check if the character is debuffed.
      if (character.debuff?.active) {
        const debuffEndDate = new Date(character.debuff.endDate);
        
        // Use the original endDate timestamp directly for Discord display
        const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
        
        await safeReply({
          content: `❌ **${character.name}** is currently debuffed and cannot gather.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
          ephemeral: true,
        });
        return;
      }

      // ------------------- Step 3: Validate Job ------------------
      if (!job || typeof job !== 'string' || !job.trim() || !isValidJob(job)) {
        await safeReply({
          content: getJobVoucherErrorMessage('MISSING_SKILLS', {
            characterName: character.name,
            jobName: job || "None"
          }).message,
          ephemeral: true,
        });
        return;
      }

      // Check for gathering perk.
      const jobPerk = getJobPerk(job);
      if (!jobPerk || !jobPerk.perks.includes('GATHERING')) {
        await safeReply({
          embeds: [{
            color: 0x008B8B, // Dark cyan color
            description: `${character.name} can't gather as a ${capitalizeWords(job)} because they lack the necessary gathering skills.`,
            image: {
              url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
            },
            footer: {
              text: 'Job Skill Check'
            }
          }],
          ephemeral: true,
        });
        return;
      }

      // ------------------- Step 2: Validate Interaction Channel ------------------
      currentVillage = capitalizeWords(character.currentVillage);
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

      // Check if character is physically in the correct village
      const channelVillage = Object.entries(villageChannels).find(([_, id]) => id === interaction.channelId)?.[0];
      if (channelVillage && character.currentVillage.toLowerCase() !== channelVillage.toLowerCase()) {
        await safeReply({
          embeds: [{
            color: 0x008B8B, // Dark cyan color
            description: `*${character.name} looks around confused...*\n\n**Wrong Village Location**\nYou must be physically present in ${channelVillage} to gather here.\n\n🗺️ **Current Location:** ${capitalizeWords(character.currentVillage)}`,
            image: {
              url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
            },
            footer: {
              text: 'Location Check'
            }
          }],
          ephemeral: true
        });
        return;
      }

      if (!allowedChannel || interaction.channelId !== allowedChannel) {
        const channelMention = `<#${allowedChannel}>`;
        await safeReply({
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
          ephemeral: true,
        });
        return;
      }

      // ------------------- Blight Rain Infection Check ------------------
      const weather = await getWeatherWithoutGeneration(character.currentVillage);
      if (weather?.special?.label === 'Blight Rain') {
        // Mod characters are immune to blight infection
        if (character.isModCharacter) {
          const immuneMsg =
            "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
            `◈ Your character **${character.name}** is a ${character.modTitle} of ${character.modType} and is immune to blight infection! ◈`;
          await safeReply({ content: immuneMsg, ephemeral: false });
        } else if (character.blighted) {
          const alreadyMsg =
            "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
            `◈ Your character **${character.name}** braved the blight rain, but they're already blighted... guess it doesn't matter! ◈`;
          await safeReply({ content: alreadyMsg, ephemeral: false });
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
          await safeReply({ content: blightMsg, ephemeral: false });
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
        } else {
          const safeMsg =
            "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
            `◈ Your character **${character.name}** braved the blight rain but managed to avoid infection this time! ◈\n` +
            "You feel lucky... but be careful out there.";
          await safeReply({ content: safeMsg, ephemeral: false });
        }
      }

      // ------------------- Daily Roll Check ------------------
      // Check for job voucher and daily roll AFTER job validation
      if (character.jobVoucher || character.isModCharacter) {
        // Job voucher is active or mod character - no need for daily roll check
      } else {
        // Check if gather has been used today
        const canGather = canUseDailyRoll(character, 'gather', interaction.user.id);
        
        if (!canGather) {
          const nextRollover = new Date();
          nextRollover.setUTCHours(12, 0, 0, 0); // 8AM EST = 12:00 UTC
          if (nextRollover < new Date()) {
            nextRollover.setUTCDate(nextRollover.getUTCDate() + 1);
          }
          const unixTimestamp = Math.floor(nextRollover.getTime() / 1000);
          
          await safeReply({
            embeds: [{
              color: 0x008B8B, // Dark cyan color
              description: `*${character.name} seems exhausted from their earlier gathering...*\n\n**Daily gathering limit reached.**\nThe next opportunity to gather will be available at <t:${unixTimestamp}:F>.\n\n*Tip: A job voucher would allow you to gather again today.*`,
              image: {
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
              },
              footer: {
                text: 'Daily Activity Limit'
              }
            }],
            ephemeral: true,
          });
          return;
        }

        // Update daily roll AFTER all validations pass
        try {
          await updateDailyRoll(character, 'gather');
        } catch (error) {
          console.error(`[Gather Command]: ❌ Failed to update daily roll:`, error);
          await safeReply({
            content: `❌ **An error occurred while updating your daily roll. Please try again.**`,
            ephemeral: true,
          });
          return;
        }
      }

      // ------------------- Step 5: Validate Region ------------------
      region = getVillageRegionByName(currentVillage);
      if (!region) {
        await safeReply({
          content: `❌ **No valid region found for the village ${currentVillage}.**\n📍 **Please check the character's current location and try again.**`,
        });
        return;
      }

      // ------------------- Helper Functions ------------------
      // Helper function to generate outcome messages
      function generateOutcomeMessage(outcome) {
        if (outcome.result === 'KO') {
          return generateDamageMessage('KO');
        }
        if (outcome.hearts) {
          return generateDamageMessage(outcome.hearts);
        }
        if (outcome.defenseSuccess) {
          return generateDefenseBuffMessage(
            outcome.defenseSuccess,
            outcome.adjustedRandomValue,
            outcome.damageValue
          );
        }
        if (outcome.attackSuccess) {
          return generateAttackBuffMessage(
            outcome.attackSuccess,
            outcome.adjustedRandomValue,
            outcome.damageValue
          );
        }
        if (outcome.result === 'Win!/Loot') {
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

      // Helper function to generate looted items
      function generateLootedItem(encounteredMonster, weightedItems) {
        const randomIndex = Math.floor(Math.random() * weightedItems.length);
        const lootedItem = { ...weightedItems[randomIndex] };
        if (encounteredMonster.name.includes('Chuchu')) {
          const jellyType = determineJellyType(encounteredMonster.name);
          const quantity = determineJellyQuantity(encounteredMonster.name);
          lootedItem.itemName = jellyType;
          lootedItem.quantity = quantity;
        } else {
          lootedItem.quantity = 1;
        }
        return lootedItem;
      }

      // Helper function to determine jelly type
      function determineJellyType(monsterName) {
        if (monsterName.includes('Ice')) return 'White Chuchu Jelly';
        if (monsterName.includes('Fire')) return 'Red Chuchu Jelly';
        if (monsterName.includes('Electric')) return 'Yellow Chuchu Jelly';
        return 'Chuchu Jelly';
      }

      // Helper function to determine jelly quantity
      function determineJellyQuantity(monsterName) {
        if (monsterName.includes('Large')) return 3;
        if (monsterName.includes('Medium')) return 2;
        return 1;
      }

      // ------------------- Encounter Determination ------------------
      const randomChance = Math.random();
      const bloodMoonActive = isBloodMoonActive();

      // If Blood Moon is active and chance triggers a monster encounter (25% chance)
      if (bloodMoonActive && randomChance < 0.25) {
        const allMonsters = await fetchAllMonsters();
        const monstersByRegion = allMonsters.filter(
          monster => monster[region.toLowerCase()] && monster.tier >= 1 && monster.tier <= 4
        );
        if (monstersByRegion.length > 0) {
          const encounteredMonster = monstersByRegion[Math.floor(Math.random() * monstersByRegion.length)];
          const diceRoll = Math.floor(Math.random() * 100) + 1;
          const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character, diceRoll);
          const outcome = await getEncounterOutcome(
            character,
            encounteredMonster,
            damageValue,
            adjustedRandomValue,
            attackSuccess,
            defenseSuccess
          );
          if (outcome.hearts) {
            await useHearts(character._id, outcome.hearts);
            if (outcome.result === 'KO') {
              await handleKO(character._id);
            }
          }
          const heartsRemaining = Math.max(character.currentHearts - outcome.hearts, 0);
          await updateCurrentHearts(character._id, heartsRemaining);
          const outcomeMessage = generateOutcomeMessage(outcome);
          if (outcome.canLoot && !outcome.hearts) {
            const items = await fetchItemsByMonster(encounteredMonster.name);
            const weightedItems = createWeightedItemList(items, adjustedRandomValue);
            if (weightedItems.length > 0) {
              const lootedItem = generateLootedItem(encounteredMonster, weightedItems);
              const inventoryLink = character.inventory || character.inventoryLink;
              if (typeof inventoryLink !== 'string' || !isValidGoogleSheetsUrl(inventoryLink)) {
                const embed = createMonsterEncounterEmbed(
                  character,
                  encounteredMonster,
                  outcomeMessage,
                  heartsRemaining,
                  lootedItem,
                  bloodMoonActive
                );
                await safeReply({
                  content: `❌ **Invalid Google Sheets URL for "${character.name}".**`,
                  embeds: [embed],
                });
                return;
              }
              const spreadsheetId = extractSpreadsheetId(inventoryLink);
              const auth = await authorizeSheets();
              const range = 'loggedInventory!A2:M';
              const uniqueSyncId = uuidv4();
              const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
              const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
              const values = [[
                character.name,
                lootedItem.itemName,
                lootedItem.quantity.toString(),
                lootedItem.category.join(', '),
                lootedItem.type.join(', '),
                lootedItem.subtype.join(', '),
                'Looted',
                character.job,
                '',
                character.currentVillage,
                interactionUrl,
                formattedDateTime,
                uniqueSyncId,
              ]];
              await addItemInventoryDatabase(
                character._id,
                lootedItem.itemName,
                lootedItem.quantity,
                interaction,
                "Looted"
              );
              // Note: Google Sheets sync is handled by addItemInventoryDatabase

              const embed = createMonsterEncounterEmbed(
                character,
                encounteredMonster,
                outcomeMessage,
                heartsRemaining,
                lootedItem,
                bloodMoonActive
              );
              await safeReply({ embeds: [embed] });
              return;
            }
          }
          const embed = createMonsterEncounterEmbed(
            character,
            encounteredMonster,
            outcomeMessage,
            heartsRemaining,
            null,
            bloodMoonActive
          );
          await safeReply({ embeds: [embed] });
          return;
        } else {
          await safeReply({
            content: `⚠️ **No monsters found in the ${region} region during the Blood Moon.**`,
          });
          return;
        }
      } else {

        
        // ------------------- Normal Gathering Logic ------------------
        const items = await fetchAllItems();
        
        // ------------------- Apply Scholar Boost (Cross-Region Gathering) ------------------
        // Check if character is boosted and handle Scholar boost for cross-region gathering
        let gatheringRegion = region;
        let boosterCharacter = null;
        let scholarTargetVillage = null;
        
        if (character.boostedBy) {
          const { fetchCharacterByName } = require('../../database/db');
          boosterCharacter = await fetchCharacterByName(character.boostedBy);
          
                     // Handle Scholar boost (cross-region gathering) before filtering items
           if (boosterCharacter && boosterCharacter.job === 'Scholar') {
             // Get the boost data to find the target village
             const { retrieveBoostingRequestFromTempDataByCharacter } = require('./boosting');
             const boostData = await retrieveBoostingRequestFromTempDataByCharacter(character.name);
             
             console.log(`[gather.js] Scholar boost debug - boostData:`, {
               found: !!boostData,
               targetVillage: boostData?.targetVillage,
               status: boostData?.status,
               category: boostData?.category,
               boostExpiresAt: boostData?.boostExpiresAt,
               currentTime: Date.now()
             });
             
             if (boostData && boostData.targetVillage) {
               scholarTargetVillage = boostData.targetVillage;
               gatheringRegion = scholarTargetVillage;
               console.log(`[gather.js] Scholar boost applied: ${region} → ${gatheringRegion} (cross-region gathering)`);
               console.log(`[gather.js] Cross-Region Insight: ${character.name} will gather from ${scholarTargetVillage} while staying in ${character.currentVillage}`);
             } else {
               console.log(`[gather.js] Scholar boost debug - No targetVillage found in boostData or boostData is null`);
             }
           }
        }
        
        const availableItems = items.filter(item => {
          const jobKey = job.toLowerCase();
          
          // Convert village name to region for proper item filtering
          let regionKey = gatheringRegion.toLowerCase();
          
          // Import the village-to-region mapping function
          const { getVillageRegionByName } = require('../../modules/locationsModule');
          
          // If gatheringRegion is a village name, convert it to its region
          const villageRegion = getVillageRegionByName(gatheringRegion);
          if (villageRegion) {
            regionKey = villageRegion.toLowerCase();
            console.log(`[gather.js] Village ${gatheringRegion} maps to region ${villageRegion} (${regionKey})`);
          }
          
          // Use the normalizeJobName function from jobsModule
          const normalizedInputJob = normalizeJobName(job);
          
          // Use allJobsTags which is already an array of job names
          const isJobMatch = item.allJobsTags?.some(j => 
            normalizeJobName(j) === normalizedInputJob
          ) || false;
          
          const isRegionMatch = item[regionKey];
          
          return isJobMatch && isRegionMatch;
        });
        
        if (availableItems.length === 0) {
          await safeReply({
            content: `⚠️ **No items available to gather in this location with the given job.**`,
          });
          return;
        }

        // ------------------- Apply Other Boosting Effects ------------------
        // Check if character is boosted and apply gathering boosts to the available items
        let boostedAvailableItems = availableItems;
        let bonusItem = null;
        let isEntertainerBoost = false;
        
        if (character.boostedBy && boosterCharacter) {
          const boostEffect = await getBoostEffectByCharacter(character.boostedBy, 'Gathering');
          if (boostEffect) {
            // Special handling for Entertainer boost (bonus item after normal gather)
            if (boosterCharacter.job === 'Entertainer') {
              isEntertainerBoost = true;
            } else if (boosterCharacter.job !== 'Scholar') {
              // Normal boost application for all other jobs (including Priest) - apply to available items
              // Skip Scholar since we already handled the region change above
              const originalItemCount = availableItems.length;
              boostedAvailableItems = await applyBoostEffect(character.boostedBy, 'Gathering', availableItems);
              console.log(`[gather.js] ${character.boostedBy} boost applied: ${originalItemCount} → ${boostedAvailableItems.length} items`);
            }
          }
        }

        // ------------------- Create Weighted Item List ------------------
        // Safety check: ensure boostedAvailableItems is an array
        if (!Array.isArray(boostedAvailableItems)) {
          console.log(`[gather.js] Error: boostedAvailableItems is not an array, got ${typeof boostedAvailableItems}`);
          boostedAvailableItems = availableItems; // Fallback to original items
        }
        
        const weightedItems = createWeightedItemList(boostedAvailableItems, undefined, job);
        
        // Log detailed weight information
        const totalWeight = weightedItems.reduce((sum, item) => sum + (item.weight || 1), 0);
        console.log(`[gather.js] Weighted selection pool: ${weightedItems.length} items, total weight: ${totalWeight}`);
        
        // Log top 5 items by weight for visibility
        const sortedByWeight = [...weightedItems].sort((a, b) => (b.weight || 1) - (a.weight || 1));
        console.log(`[gather.js] Top 5 items by weight:`);
        sortedByWeight.slice(0, 5).forEach((item, index) => {
          const percentage = ((item.weight || 1) / totalWeight * 100).toFixed(1);
          console.log(`  ${index + 1}. ${item.itemName} (Rarity: ${item.itemRarity || 'Unknown'}) - Weight: ${item.weight || 1} (${percentage}%)`);
        });
        
        const randomIndex = Math.floor(Math.random() * weightedItems.length);
        const randomItem = weightedItems[randomIndex];
        const quantity = 1;
        
                 // Log the final selection with its weight percentage
         const selectedWeight = randomItem.weight || 1;
         const selectedPercentage = (selectedWeight / totalWeight * 100).toFixed(1);
         console.log(`[gather.js] Selected: ${randomItem.itemName} (Rarity: ${randomItem.itemRarity || 'Unknown'}) - Weight: ${selectedWeight} (${selectedPercentage}%)`);
         
         // Log cross-region insight if Scholar boost was applied
         if (scholarTargetVillage) {
           console.log(`[gather.js] Cross-Region Insight: ${randomItem.itemName} was gathered from ${scholarTargetVillage} thanks to Scholar's knowledge!`);
         }
        
        // Handle Entertainer bonus item
        if (isEntertainerBoost) {
          console.log(`[gather.js] Entertainer boost detected for ${character.name}`);
          const entertainerItems = await applyBoostEffect(character.boostedBy, 'Gathering', availableItems);
          console.log(`[gather.js] Entertainer boost: Found ${entertainerItems ? entertainerItems.length : 0} entertainer items in region`);
          
          if (entertainerItems && entertainerItems.length > 0) {
            // Select a random entertainer item as bonus
            const bonusIndex = Math.floor(Math.random() * entertainerItems.length);
            bonusItem = entertainerItems[bonusIndex];
            console.log(`[gather.js] Entertainer boost: Bonus item ${bonusItem.itemName}`);
          } else {
            console.log(`[gather.js] Entertainer boost: No entertainer items available in this region`);
          }
        }
        

        
        await addItemInventoryDatabase(
          character._id,
          randomItem.itemName,
          quantity,
          interaction,
          "Gathering"
        );
        
        // Add bonus item if Entertainer boost is active
        if (bonusItem && isEntertainerBoost) {
          await addItemInventoryDatabase(
            character._id,
            bonusItem.itemName,
            1,
            interaction,
            `Gathering (Entertainer Bonus)`
          );
          console.log(`[gather.js] Added bonus item: ${bonusItem.itemName}`);
        }
        
        // Note: Google Sheets sync is handled by addItemInventoryDatabase

        // Check if this is a divine item gathered with Priest boost
        let isDivineItemWithPriestBoost = false;
        if (character.boostedBy && boosterCharacter && boosterCharacter.job === 'Priest') {
          // Check if the gathered item is a divine item - check both the item itself and the database
          const Item = require('../../models/ItemModel');
          const divineItem = await Item.findOne({ itemName: randomItem.itemName, divineItems: true });
          
          // Check if the item itself has divineItems flag or if it's found in the database
          if (randomItem.divineItems === true || divineItem) {
            isDivineItemWithPriestBoost = true;
            console.log(`[gather.js] Divine item gathered with Priest boost: ${randomItem.itemName}`);
          }
        }

        // Create embed with cross-region gathering info if applicable
        console.log(`[gather.js] Creating embed with boost data:`, {
          characterBoostedBy: character.boostedBy,
          boosterCharacter: boosterCharacter?.name,
          boosterCharacterJob: boosterCharacter?.job,
          scholarTargetVillage: scholarTargetVillage,
          isDivineItemWithPriestBoost: isDivineItemWithPriestBoost
        });
        
        const embed = createGatherEmbed(character, randomItem, bonusItem, isDivineItemWithPriestBoost, boosterCharacter, scholarTargetVillage);
        await safeReply({ embeds: [embed] });
        
        // ------------------- Clear Boost After Use ------------------
        if (character.boostedBy) {
          console.log(`[gather.js] Boost cleared for ${character.name}`);
          character.boostedBy = null;
        }
        
        // ------------------- Update Last Gather Timestamp ------------------
        character.lastGatheredAt = new Date().toISOString();
        await character.save();

      }

      // ------------------- Deactivate Job Voucher ------------------
      if (character.jobVoucher) {
        const deactivationResult = await deactivateJobVoucher(character._id);
        if (!deactivationResult.success) {
          // Failed to deactivate job voucher
        }
      }

    } catch (error) {
      // Only log errors that aren't inventory sync related
      if (!error.message.includes('inventory is not synced')) {
        handleError(error, 'gather.js', {
          commandName: '/gather',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          characterName: interaction.options.getString('charactername'),
          options: {
            job: job,
            region: region,
            currentVillage: currentVillage,
            bloodMoonActive: isBloodMoonActive()
          }
        });

        console.error(`[gather.js]: Error during gathering process: ${error.message}`, {
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
        await safeReply({
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
        errorMessage = '❌ **Inventory sync error.** Your items were gathered but may not appear in your inventory sheet immediately.';
      } else if (error.message.includes('ETIMEDOUT') || error.message.includes('Connect Timeout')) {
        errorMessage = '❌ **Connection timeout.** Please try again in a few moments.';
      } else if (error.message.includes('Permission denied')) {
        errorMessage = '❌ **Permission denied.** Please make sure your inventory sheet is shared with the bot.';
      } else if (error.message.includes('Invalid Google Sheets URL')) {
        errorMessage = '❌ **Invalid inventory sheet URL.** Please check your character\'s inventory sheet link.';
      } else {
        errorMessage = `❌ **Error during gathering:** ${error.message}`;
      }

      if (errorMessage) {
        await safeReply({
          content: errorMessage,
          ephemeral: true
        });
      }
    }
  },
};