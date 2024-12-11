// ------------------- Gather Command Module -------------------
// This module handles the gathering of items based on the character's job and location.

// ------------------- Import Section -------------------
const { SlashCommandBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');

// Database Services
const { fetchCharacterByNameAndUserId, fetchCharactersByUserId } = require('../database/characterService');
const { fetchAllItems, fetchItemsByMonster } = require('../database/itemService');
const { fetchAllMonsters } = require('../database/monsterService');

// Modules
const { getVillageRegionByName } = require('../modules/locationsModule');
const { getJobPerk, normalizeJobName, isValidJob } = require('../modules/jobsModule');
const { createWeightedItemList, calculateFinalValue } = require('../modules/rngModule');
const { useHearts, handleKO, updateCurrentHearts  } = require('../modules/characterStatsModule');
const { generateVictoryMessage, generateDamageMessage, generateFinalOutcomeMessage } = require('../modules/flavorTextModule');
const { getEncounterOutcome } = require('../modules/damageModule');


// Utilities
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');
const { isBloodMoonActive } = require('../scripts/bloodmoon');

// Embeds
const { createGatherEmbed, createMonsterEncounterEmbed } = require('../embeds/mechanicEmbeds');

// Commands
const { processLootingLogic } = require('../commands/loot');

// ------------------- Command Definition -------------------
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
      await interaction.deferReply();

      const characterName = interaction.options.getString('charactername');
      const userId = interaction.user.id;

      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
          await interaction.editReply({ content: `❌ **Character ${characterName} not found or does not belong to you.**` });
          return;
      }
      

      if (!character.inventorySynced) {
        return interaction.editReply({
          content: `❌ **Inventory not set up. Use the necessary commands to initialize it.**`,
          ephemeral: true,
        });
      }

      const job = character.job;

      if (!isValidJob(job)) {
        await interaction.editReply({ content: `❌ **Invalid job ${job} for gathering items.**` });
        return;
      }

      const jobPerk = getJobPerk(job);
      if (!jobPerk || !jobPerk.perks.includes('GATHERING')) {
        await interaction.editReply({ content: `❌ **${character.name} cannot gather items as a ${job} without the GATHERING perk.**` });
        return;
      }

      const currentVillage = character.currentVillage;
      const region = getVillageRegionByName(currentVillage);
      if (!region) {
        await interaction.editReply({ content: `❌ **No region found for the village ${currentVillage}.**` });
        return;
      }
// ------------------- Helper Function: Generate Outcome Message -------------------
function generateOutcomeMessage(outcome) {
  if (outcome.hearts) {
      return outcome.result === 'KO'
          ? generateDamageMessage('KO')
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
  } else if (outcome.result === 'Win!/Loot') {
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

  if (encounteredMonster.name.includes('Chuchu')) {
    const jellyType = encounteredMonster.name.includes('Ice')
      ? 'White Chuchu Jelly'
      : encounteredMonster.name.includes('Fire')
      ? 'Red Chuchu Jelly'
      : encounteredMonster.name.includes('Electric')
      ? 'Yellow Chuchu Jelly'
      : 'Chuchu Jelly';
    const quantity = encounteredMonster.name.includes('Large')
      ? 3
      : encounteredMonster.name.includes('Medium')
      ? 2
      : 1;
    lootedItem.itemName = jellyType;
    lootedItem.quantity = quantity;
  } else {
    lootedItem.quantity = 1; // Default quantity for non-Chuchu items
  }

  return lootedItem;
}


        // ------------------- Encounter Determination -------------------


// Determine Blood Moon and encounter probabilities
const randomChance = Math.random();
const bloodMoonActive = isBloodMoonActive();


// Check for Blood Moon or Monster Encounter (25% chance for monsters during Blood Moon)
if (bloodMoonActive && randomChance < .25) {


    // Fetch all monsters and filter by region and tier
    const allMonsters = await fetchAllMonsters();
    const monstersByRegion = allMonsters.filter(
        monster => monster[region.toLowerCase()] && monster.tier >= 1 && monster.tier <= 4
    );

    if (monstersByRegion.length > 0) {
        const encounteredMonster = monstersByRegion[Math.floor(Math.random() * monstersByRegion.length)];


        // Calculate encounter values
        const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);

        // Determine encounter outcome
        const outcome = await getEncounterOutcome(
            character,
            encounteredMonster,
            damageValue,
            adjustedRandomValue,
            attackSuccess,
            defenseSuccess
        );

        // Deduct hearts if damage occurred
        if (outcome.hearts) {
            await useHearts(character._id, outcome.hearts);
            if (outcome.result === 'KO') {
                await handleKO(character._id); // Handle KO
            }
        }

        // Update character's hearts
        const heartsRemaining = Math.max(character.currentHearts - outcome.hearts, 0);
        await updateCurrentHearts(character._id, heartsRemaining);

        // Generate outcome message
        const outcomeMessage = generateOutcomeMessage(outcome);

        // Handle Loot if Victory
        if (outcome.canLoot && !outcome.hearts) {
            const items = await fetchItemsByMonster(encounteredMonster.name);
            const weightedItems = createWeightedItemList(items, adjustedRandomValue);

            if (weightedItems.length > 0) {
                const lootedItem = generateLootedItem(encounteredMonster, weightedItems);

                // Validate inventory link
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

                // Log loot to database and Google Sheets
                const spreadsheetId = extractSpreadsheetId(inventoryLink);
                const auth = await authorizeSheets();
                const range = 'loggedInventory!A2:M';
                const uniqueSyncId = uuidv4();
                const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

                const values = [
                    [
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
                    ],
                ];

                await addItemInventoryDatabase(
                    character._id,
                    lootedItem.itemName,
                    lootedItem.quantity,
                    lootedItem.category.join(', '),
                    lootedItem.type.join(', '),
                    interaction
                );
                await appendSheetData(auth, spreadsheetId, range, values);

                // Reply with loot details
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

        // If no loot or other outcome
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
            content: `⚠️ **No monsters found in the ${region} region during the Blood Moon.**`
        });
        return;
    }
} else {


    // Normal gathering logic (75% during Blood Moon or non-Blood Moon scenario)
    const items = await fetchAllItems();

    // Filter items based on the character's job and region
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
        await interaction.editReply({ content: '⚠️ **No items available to gather in this location with the given job.**' });
        return;
    }

    // Create a weighted list of items based on rarity
    const weightedItems = createWeightedItemList(availableItems);

    // Select a random item from the weighted list
    const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];

    // Add the gathered item to the character's inventory database
    const quantity = 1; // Assuming only 1 item is gathered per action
    await addItemInventoryDatabase(
        character._id,
        randomItem.itemName,
        quantity,
        randomItem.category.join(', '),
        randomItem.type.join(', '),
        interaction
    );

    // Validate the character's inventory link and log the gathered item in Google Sheets
    const inventoryLink = character.inventory || character.inventoryLink;
    if (typeof inventoryLink !== 'string' || !isValidGoogleSheetsUrl(inventoryLink)) {
        return interaction.editReply({ content: `❌ **Invalid or missing Google Sheets URL for character ${characterName}.**` });
    }

    const spreadsheetId = extractSpreadsheetId(inventoryLink);
    const auth = await authorizeSheets();
    const range = 'loggedInventory!A2:M'; // Set the range for appending data to the Google Sheet
    const uniqueSyncId = uuidv4(); // Generate a unique sync ID for logging purposes
    const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`; // URL for referencing the interaction

    // Prepare the data to be appended to Google Sheets
    const values = [[
        character.name,                 // Character Name
        randomItem.itemName,            // Item Name
        quantity.toString(),            // Quantity of Item
        randomItem.category.join(', '), // Category
        randomItem.type.join(', '),     // Type
        randomItem.subtype.join(', '),  // Subtype
        'Gathering',                    // How the item was obtained
        character.job,                  // Job
        '',                             // Perk (optional)
        character.currentVillage,       // Location
        interactionUrl,                 // Link to the interaction
        formattedDateTime,              // Date/Time of gathering
        uniqueSyncId                    // Unique Sync ID
    ]];

    await appendSheetData(auth, spreadsheetId, range, values);

    // Create the embed message to display the gathered item and character details
    const embed = createGatherEmbed(character, randomItem);

    await interaction.editReply({ embeds: [embed] }); // Send the embed as a reply
  }
} catch (error) {
      await interaction.editReply({ content: '⚠️ **An error occurred while trying to gather items.**' });
    }
  },

  // ------------------- Autocomplete Handler -------------------
  async autocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true);
      const userId = interaction.user.id;

      if (focusedOption.name === 'charactername') {
        const characters = await fetchCharactersByUserId(userId);

        const gatheringCharacters = characters.filter(character => {
          const jobPerk = getJobPerk(character.job);
          return jobPerk && jobPerk.perks.includes('GATHERING');
        });

        const choices = gatheringCharacters.map(character => ({
          name: character.name,
          value: character.name
        }));

        const filteredChoices = choices.filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
                                       .slice(0, 25);


        await interaction.respond(filteredChoices);
      }
    } catch (error) {
      console.error(`[Autocomplete] Error: ${error.message}`);
      await interaction.respond([]);
    }
  }
};
