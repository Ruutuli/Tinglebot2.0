// ------------------- Gather Command Module -------------------
// This module handles the gathering of items based on the character's job and location.


// ------------------- Discord.js Components -------------------
// Import Discord.js classes for building slash commands.
const { SlashCommandBuilder } = require('discord.js');


const { handleError } = require('../../utils/globalErrorHandler.js');
// ------------------- Standard Libraries -------------------
// Import third-party libraries.
const { v4: uuidv4 } = require('uuid');


// ------------------- Database Services -------------------
// Import character, item, and monster related database service functions.
const { fetchCharacterByNameAndUserId, fetchAllItems, fetchItemsByMonster, fetchAllMonsters } = require('../../database/db.js');


// ------------------- Modules -------------------
// Import custom modules for RNG, flavor text, damage calculations, job handling, locations, character stats, formatting, and job vouchers.
const { createWeightedItemList, calculateFinalValue } = require('../../modules/rngModule.js');
const { generateVictoryMessage, generateDamageMessage, generateFinalOutcomeMessage, generateDefenseBuffMessage, generateAttackBuffMessage } = require('../../modules/flavorTextModule.js');
const { getEncounterOutcome } = require('../../modules/damageModule.js');
const { getJobPerk, normalizeJobName, isValidJob } = require('../../modules/jobsModule.js');
const { getVillageRegionByName } = require('../../modules/locationsModule.js');
const { useHearts, handleKO, updateCurrentHearts } = require('../../modules/characterStatsModule.js');
const { capitalizeWords } = require('../../modules/formattingModule.js');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher } = require('../../modules/jobVoucherModule.js');


// ------------------- Utilities -------------------
// Import helper utilities for inventory management, Google Sheets integration, URL validation, and Blood Moon detection.
const { addItemInventoryDatabase } = require('../../utils/inventoryUtils.js');
const { authorizeSheets, appendSheetData,safeAppendDataToSheet  } = require('../../utils/googleSheetsUtils.js');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../../utils/validation.js');
const { isBloodMoonActive } = require('../../scripts/bloodmoon.js');


// ------------------- Embeds -------------------
// Import embed utilities for gathering and monster encounter messages.
const { createGatherEmbed, createMonsterEncounterEmbed } = require('../../embeds/embeds.js');


// ------------------- Village Channels -------------------
// Define the allowed channels for each village.
const villageChannels = {
  Inariko: process.env.INARIKO_TOWN_HALL,
  Rudania: process.env.RUDANIA_TOWN_HALL,
  Vhintl: process.env.VHINTL_TOWN_HALL,
};


// ------------------- Command Definition -------------------
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

  // ------------------- Command Execution Logic -------------------
  async execute(interaction) {
    try {
      // ------------------- Acknowledge Interaction -------------------
      await interaction.deferReply();

      // ------------------- Step 1: Validate Character -------------------
      const characterName = interaction.options.getString('charactername');
      const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
      if (!character) {
        await interaction.editReply({
          content: `❌ **Character ${characterName} not found or does not belong to you.**`,
        });
        return;
      }

      // ------------------- Daily Gather Limit -------------------
      const now = new Date();
      const rollover = new Date();
      rollover.setUTCHours(13, 0, 0, 0); // 8AM EST = 1PM UTC

      const lastGathered = character.lastGatheredAt ? new Date(character.lastGatheredAt) : null;
      if (lastGathered && lastGathered > rollover && now > rollover) {
        await interaction.editReply({
          content: `⏳ **${character.name} has already gathered today!**\n🌅 **Daily gather limit resets at midnight EST (4AM UTC).**`,
          ephemeral: true,
        });
        return;
        }

       // Check if the character is KOed.
      if (character.isKO) {
        await interaction.editReply({
          content: `❌ **${character.name} is currently KOed and cannot gather.**\n💤 **Let them rest and recover before gathering again.**`,
          ephemeral: true,
        });
        return;
      }

      // Check if the character is debuffed.
      if (character.debuff?.active) {
        const debuffEndDate = new Date(character.debuff.endDate);
        const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
        await interaction.editReply({
          content: `❌ **${character.name} is currently debuffed and cannot gather.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
          ephemeral: true,
        });
        return;
      }


      // ------------------- Step 2: Validate Interaction Channel -------------------
      const currentVillage = capitalizeWords(character.currentVillage);
      const allowedChannel = villageChannels[currentVillage];
      if (!allowedChannel || interaction.channelId !== allowedChannel) {
        const channelMention = `<#${allowedChannel}>`;
        await interaction.editReply({
          content: `❌ **You can only use this command in the ${currentVillage} Town Hall channel!**\n📍 **Current Location:** ${currentVillage}\n💬 **Command Allowed In:** ${channelMention}`,
        });
        return;
      }

      // ------------------- Step 3: Validate Inventory -------------------
      if (!character.inventorySynced) {
        await interaction.editReply({
          content: `❌ **Inventory not set up.**\n🛠️ **Please use the required commands to initialize your inventory before gathering.**`,
          ephemeral: true,
        });
        return;
      }

      // ------------------- Step 4: Validate Job -------------------
      let job = (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job;
      if (!job || typeof job !== 'string' || !job.trim() || !isValidJob(job)) {
        console.log(`[gather.js]: Job validation failed for ${character.name}. Invalid Job: ${job}`);
        await interaction.editReply({
          content: `❌ **Oh no! ${character.name} can't gather as an invalid or unsupported job (${job || "None"}).**\n✨ **Why not try a Job Voucher to explore exciting new roles?**`,
          ephemeral: true,
        });
        return;
      }

      // ------------------- Validate or Activate Job Voucher -------------------
      if (character.jobVoucher) {
        console.log(`[gather.js]: Job voucher detected for ${character.name}. Validating...`);
        const voucherCheck = await validateJobVoucher(character, job);

        if (voucherCheck.skipVoucher) {
          console.log(`[gather.js]: ${character.name} already has job "${job}". Skipping voucher use.`);
          // No activation needed
        } else if (!voucherCheck.success) {
          console.log(`[gather.js]: Voucher validation failed. Message: ${voucherCheck.message}`);
          await interaction.editReply({
            content: voucherCheck.message,
            ephemeral: true,
          });
          return;
        } else {
          console.log(`[gather.js]: Activating job voucher for ${character.name}.`);
          const { success: itemSuccess, item: jobVoucherItem, message: itemError } = await fetchJobVoucherItem();
          if (!itemSuccess) {
            await interaction.editReply({ content: itemError, ephemeral: true });
            return;
          }
          const activationResult = await activateJobVoucher(character, job, jobVoucherItem, 1, interaction);
          if (!activationResult.success) {
            await interaction.editReply({
              content: activationResult.message,
              ephemeral: true,
            });
            return;
          }
          await interaction.followUp({
            content: activationResult.message,
            ephemeral: true,
          });
        }
      }

      // Check for gathering perk.
      const jobPerk = getJobPerk(job);
      console.log(`[gather.js]: Job Perk for "${job}":`, jobPerk);
      if (!jobPerk || !jobPerk.perks.includes('GATHERING')) {
        console.log(`[gather.js]: ${character.name} lacks gathering skills for job: "${job}"`);
        await interaction.editReply({
          content: `❌ **Hmm, ${character.name} can't gather as a ${job} because they lack the necessary gathering skills.**\n🔄 **Consider switching to a role better suited for gathering, or use a Job Voucher to try something fresh!**`,
          ephemeral: true,
        });
        return;
      }

      // ------------------- Step 5: Validate Region -------------------
      const region = getVillageRegionByName(currentVillage);
      if (!region) {
        await interaction.editReply({
          content: `❌ **No valid region found for the village ${currentVillage}.**\n📍 **Please check the character's current location and try again.**`,
        });
        return;
      }

      // ------------------- Helper Function: Outcome Message Generator -------------------
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

      // ------------------- Helper Function: Looted Item Generator -------------------
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

      // ------------------- Helper Function: Determine Jelly Type -------------------
      function determineJellyType(monsterName) {
        if (monsterName.includes('Ice')) return 'White Chuchu Jelly';
        if (monsterName.includes('Fire')) return 'Red Chuchu Jelly';
        if (monsterName.includes('Electric')) return 'Yellow Chuchu Jelly';
        return 'Chuchu Jelly';
      }

      // ------------------- Helper Function: Determine Jelly Quantity -------------------
      function determineJellyQuantity(monsterName) {
        if (monsterName.includes('Large')) return 3;
        if (monsterName.includes('Medium')) return 2;
        return 1;
      }

      // ------------------- Encounter Determination -------------------
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
          const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);
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
                await interaction.editReply({
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
                lootedItem.category.join(', '),
                lootedItem.type.join(', '),
                interaction
              );
              if (character?.name && character?.inventory && character?.userId) {
    await safeAppendDataToSheet(character.inventory, character, range, values);
} else {
    console.error('[safeAppendDataToSheet]: Invalid character object detected before syncing.');
}

              const embed = createMonsterEncounterEmbed(
                character,
                encounteredMonster,
                outcomeMessage,
                heartsRemaining,
                lootedItem,
                bloodMoonActive
              );
              await interaction.editReply({ embeds: [embed] });
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
          await interaction.editReply({ embeds: [embed] });
          return;
        } else {
          await interaction.editReply({
            content: `⚠️ **No monsters found in the ${region} region during the Blood Moon.**`,
          });
          return;
        }
      } else {

        
        // ------------------- Normal Gathering Logic -------------------
        const items = await fetchAllItems();
        const availableItems = items.filter(item => {
          if (job === 'AB (Meat)') {
            return item.abMeat && item[region.toLowerCase()];
          } else if (job === 'AB (Live)') {
            return item.abLive && item[region.toLowerCase()];
          } else {
            const jobKey = normalizeJobName(job);
            return item[jobKey] && item[region.toLowerCase()];
          }
        });
        if (availableItems.length === 0) {
          await interaction.editReply({
            content: `⚠️ **No items available to gather in this location with the given job.**`,
          });
          return;
        }
        const weightedItems = createWeightedItemList(availableItems);
        const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];
        const quantity = 1;
        await addItemInventoryDatabase(
          character._id,
          randomItem.itemName,
          quantity,
          randomItem.category.join(', '),
          randomItem.type.join(', '),
          interaction
        );
        const inventoryLink = character.inventory || character.inventoryLink;
        if (typeof inventoryLink !== 'string' || !isValidGoogleSheetsUrl(inventoryLink)) {
          await interaction.editReply({
            content: `❌ **Invalid or missing Google Sheets URL for character ${characterName}.**`,
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
          randomItem.itemName,
          quantity.toString(),
          randomItem.category.join(', '),
          randomItem.type.join(', '),
          randomItem.subtype.join(', '),
          'Gathering',
          character.job,
          '',
          character.currentVillage,
          interactionUrl,
          formattedDateTime,
          uniqueSyncId,
        ]];
        if (character?.name && character?.inventory && character?.userId) {
    await safeAppendDataToSheet(character.inventory, character, range, values);
} else {
    console.error('[safeAppendDataToSheet]: Invalid character object detected before syncing.');
}

        const embed = createGatherEmbed(character, randomItem);
        await interaction.editReply({ embeds: [embed] });
        // ------------------- Update Last Gather Timestamp -------------------
character.lastGatheredAt = new Date().toISOString();
await character.save();

      }

      // ------------------- Deactivate Job Voucher -------------------
      if (character.jobVoucher) {
        const deactivationResult = await deactivateJobVoucher(character._id);
        if (!deactivationResult.success) {
          console.error(`[gather.js]: Failed to deactivate job voucher for ${character.name}`);
        } else {
          console.log(`[gather.js]: Job voucher deactivated for ${character.name}`);
        }
      }

    } catch (error) {
    handleError(error, 'gather.js');

      console.error(`[gather.js]: Error during gathering process: ${error.message}`, {
        stack: error.stack,
        interactionData: {
          userId: interaction.user.id,
          characterName: interaction.options.getString('charactername'),
          guildId: interaction.guildId,
          channelId: interaction.channelId,
        },
      });
      await interaction.editReply({
        content: `⚠️ **An error occurred during the gathering process. Debug info: ${error.message}.**`,
      });
    }
  },
};
