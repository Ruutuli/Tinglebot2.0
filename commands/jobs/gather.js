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
const { getEncounterOutcome } = require('../../modules/encounterModule.js');
const { getJobPerk, normalizeJobName, isValidJob } = require('../../modules/jobsModule.js');
const { getVillageRegionByName } = require('../../modules/locationsModule.js');
const { useHearts, handleKO, updateCurrentHearts } = require('../../modules/characterStatsModule.js');
const { capitalizeWords } = require('../../modules/formattingModule.js');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule.js');
const { checkInventorySync } = require('../../utils/characterUtils');
const { enforceJail } = require('../../utils/jailCheck');
const { getCurrentWeather } = require('../../modules/weatherModule.js');


// ------------------- Utilities -------------------
// Import helper utilities for inventory management, Google Sheets integration, URL validation, and Blood Moon detection.
const { addItemInventoryDatabase } = require('../../utils/inventoryUtils.js');
const { authorizeSheets, appendSheetData,safeAppendDataToSheet  } = require('../../utils/googleSheetsUtils.js');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../../utils/validation.js');
const { isBloodMoonActive } = require('../../scripts/bloodmoon.js');


// ------------------- Embeds -------------------
// Import embed utilities for gathering and monster encounter messages.
const { createGatherEmbed, createMonsterEncounterEmbed, createKOEmbed } = require('../../embeds/embeds.js');


// ------------------- Village Channels -------------------
// Define the allowed channels for each village.
const villageChannels = {
  Inariko: process.env.INARIKO_TOWN_HALL,
  Rudania: process.env.RUDANIA_TOWN_HALL,
  Vhintl: process.env.VHINTL_TOWN_HALL,
};


// ------------------- Helper Functions -------------------
// Check if a daily roll is available for a specific activity
function canUseDailyRoll(character, activity) {
  // If character has an active job voucher, they can always use the command
  if (character.jobVoucher) {
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
    console.log(`[gather.js]: 📅 No previous rolls for gather/loot. Allowing action.`);
    return true;
  }

  const lastGatherDate = lastGatherRoll ? new Date(lastGatherRoll) : null;
  const lastLootDate = lastLootRoll ? new Date(lastLootRoll) : null;
  
  // If either activity was used today, deny the action
  if (lastGatherDate && lastGatherDate >= rollover) {
    console.log(`[gather.js]: 📅 Already gathered today at ${lastGatherDate.toISOString()}`);
    return false;
  }
  if (lastLootDate && lastLootDate >= rollover) {
    console.log(`[gather.js]: 📅 Already looted today at ${lastLootDate.toISOString()}`);
    return false;
  }

  console.log(`[gather.js]: 📅 now=${now.toISOString()} | lastGather=${lastGatherDate?.toISOString()} | lastLoot=${lastLootDate?.toISOString()} | rollover=${rollover.toISOString()}`);
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
    console.log(`[gather.js]: ✅ Updated daily roll for ${activity} at ${now}`);
  } catch (error) {
    console.error(`[gather.js]: ❌ Failed to update daily roll for ${character.name}:`, error);
    throw error;
  }
}

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
    // Initialize variables at the top of the function
    let job;
    let region;
    let currentVillage;

    try {
      await interaction.deferReply();

      const characterName = interaction.options.getString('charactername');
      const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
      if (!character) {
        await interaction.editReply({
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
        await interaction.editReply({ embeds: [embed] });
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

      // Check if character is in jail
      if (await enforceJail(interaction, character)) {
        return;
      }

      // Check if the character is KOed.
      if (character.isKO) {
        await interaction.editReply({
          content: `❌ **${character.name}** is currently KOed and cannot gather.**\n💤 **Let them rest and recover before gathering again.**`,
          ephemeral: true,
        });
        return;
      }

      // Check if the character is debuffed.
      if (character.debuff?.active) {
        const debuffEndDate = new Date(character.debuff.endDate);
        const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
        await interaction.editReply({
          content: `❌ **${character.name}** is currently debuffed and cannot gather.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
          ephemeral: true,
        });
        return;
      }

      // ------------------- Step 3: Validate Job -------------------
      if (!job || typeof job !== 'string' || !job.trim() || !isValidJob(job)) {
        console.error(`[gather.js]: Job validation failed for ${character.name}. Invalid Job: ${job}`);
        await interaction.editReply({
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
      console.log(`[gather.js]: 🔄 Job Perk for "${job}":`, jobPerk);
      if (!jobPerk || !jobPerk.perks.includes('GATHERING')) {
        console.error(`[gather.js]: ❌ ${character.name} lacks gathering skills for job: "${job}"`);
        await interaction.editReply({
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

      // ------------------- Step 2: Validate Interaction Channel -------------------
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
          ephemeral: true,
        });
        return;
      }

      // ---- Blight Rain Infection Check ----
      const weather = await getCurrentWeather(character.currentVillage);
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
            "▹ [Blight Information](https://www.rootsofthewild.com/blight)  \n" +
            "▹ [Currently Available Blight Healers](https://discord.com/channels/603960955839447050/651614266046152705/845481974671736842)\n\n" +
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

      // Check for job voucher and daily roll AFTER job validation
      if (character.jobVoucher) {
        console.log(`[Gather Command]: 🔄 Active job voucher found for ${character.name}`);
      } else {
        console.log(`[Gather Command]: 🔄 No active job voucher for ${character.name}`);
        
        // Check if gather has been used today
        const canGather = canUseDailyRoll(character, 'gather');
        
        if (!canGather) {
          const nextRollover = new Date();
          nextRollover.setUTCHours(12, 0, 0, 0); // 8AM EST = 12:00 UTC
          if (nextRollover < new Date()) {
            nextRollover.setUTCDate(nextRollover.getUTCDate() + 1);
          }
          const unixTimestamp = Math.floor(nextRollover.getTime() / 1000);
          
          await interaction.editReply({
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
          await interaction.editReply({
            content: `❌ **An error occurred while updating your daily roll. Please try again.**`,
            ephemeral: true,
          });
          return;
        }
      }

      // ------------------- Step 5: Validate Region -------------------
      region = getVillageRegionByName(currentVillage);
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
                try {
                  await safeAppendDataToSheet(character.inventory, character, range, values, undefined, { 
                    skipValidation: true,
                    context: {
                      commandName: 'gather',
                      userTag: interaction.user.tag,
                      userId: interaction.user.id,
                      characterName: character.name,
                      spreadsheetId: extractSpreadsheetId(character.inventory),
                      range: range,
                      sheetType: 'inventory',
                      options: {
                        region: region,
                        itemName: lootedItem.itemName,
                        quantity: lootedItem.quantity,
                        monsterName: encounteredMonster?.name
                      }
                    }
                  });
                } catch (sheetError) {
                  handleError(sheetError, 'gather.js', {
                    commandName: '/gather',
                    userTag: interaction.user.tag,
                    userId: interaction.user.id,
                    characterName: character.name,
                    sheetType: 'inventory',
                    spreadsheetId: extractSpreadsheetId(character.inventory),
                    range: range,
                    options: {
                      region: region,
                      itemName: lootedItem.itemName,
                      quantity: lootedItem.quantity,
                      monsterName: encounteredMonster?.name
                    }
                  });
                  console.error(`[gather.js]: ❌ Failed to sync inventory sheet: ${sheetError.message}`);
                  // Continue execution since the item was already added to the database
                }
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
          if (job.toLowerCase() === 'ab (meat)') {
            return item.abMeat && item[region.toLowerCase()];
          } else if (job.toLowerCase() === 'ab (live)') {
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
          try {
            await safeAppendDataToSheet(character.inventory, character, range, values, undefined, { 
              skipValidation: true,
              context: {
                commandName: 'gather',
                userTag: interaction.user.tag,
                userId: interaction.user.id,
                characterName: character.name,
                spreadsheetId: extractSpreadsheetId(character.inventory),
                range: range,
                sheetType: 'inventory',
                options: {
                  region: region,
                  itemName: randomItem.itemName,
                  quantity: quantity
                }
              }
            });
          } catch (sheetError) {
            handleError(sheetError, 'gather.js', {
              commandName: '/gather',
              userTag: interaction.user.tag,
              userId: interaction.user.id,
              characterName: character.name,
              sheetType: 'inventory',
              spreadsheetId: extractSpreadsheetId(character.inventory),
              range: range,
              options: {
                region: region,
                itemName: randomItem.itemName,
                quantity: quantity
              }
            });
            console.error(`[gather.js]: ❌ Failed to sync inventory sheet: ${sheetError.message}`);
            // Continue execution since the item was already added to the database
          }
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
      const voucherCheck = { skipVoucher: false }; // Define voucherCheck before use
      if (character.jobVoucher && !voucherCheck?.skipVoucher) {
        const deactivationResult = await deactivateJobVoucher(character._id);
        if (!deactivationResult.success) {
          console.error(`[gather.js]: ❌ Failed to deactivate job voucher for ${character.name}`);
        } else {
          console.log(`[gather.js]: ✅ Job voucher deactivated for ${character.name}`);
        }
      }

    } catch (error) {
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

      // Provide a more user-friendly error message
      let errorMessage = '⚠️ **An error occurred during the gathering process.**';
      if (error.message.includes('MongoDB')) {
        errorMessage = '⚠️ **Database connection error.** Please try again in a few moments.';
      } else if (error.message.includes('Google Sheets')) {
        errorMessage = '⚠️ **Inventory sync error.** Your items were gathered but may not appear in your inventory sheet immediately.';
      } else if (error.message.includes('ETIMEDOUT') || error.message.includes('Connect Timeout')) {
        errorMessage = '⚠️ **Connection timeout.** Please try again in a few moments.';
      }

      await interaction.editReply({
        content: errorMessage,
        ephemeral: true
      });
    }
  },
};