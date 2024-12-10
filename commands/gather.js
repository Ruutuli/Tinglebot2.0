// ------------------- Gather Command Module -------------------
// This module handles the gathering of items based on the character's job and location.

// ------------------- Import Section -------------------
const { SlashCommandBuilder } = require('discord.js'); // For building slash commands
const { fetchCharacterByNameAndUserId, fetchCharactersByUserId } = require('../database/characterService'); // Character-related database services
const { getVillageRegionByName } = require('../modules/locationsModule'); // Location module for handling village regions
const { fetchAllItems } = require('../database/itemService'); // Fetching all items from the database
const { getJobPerk, normalizeJobName, isValidJob } = require('../modules/jobsModule'); // Job utilities for job validation and perks
const { addItemInventoryDatabase } = require('../utils/inventoryUtils'); // Inventory handling
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils'); // Google Sheets utilities for logging data
const { v4: uuidv4 } = require('uuid'); // UUID for generating unique IDs
const { createWeightedItemList, getMonsterEncounterFromList, getMonstersByCriteria } = require('../modules/rngModule'); // Random number generation for weighted item selection
const { capitalizeWords } = require('../modules/formattingModule'); // Utility to capitalize words
const { createGatherEmbed, createMonsterEncounterEmbed } = require('../embeds/mechanicEmbeds'); // Embed utilities for gather-related and encounter messages
const { adjustEncounterForBloodMoon } = require('../scripts/bloodmoon'); // Blood Moon encounter adjustments
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation'); // Validation utilities

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
      await interaction.deferReply(); // Defer the reply to prevent the interaction from timing out

      const characterName = interaction.options.getString('charactername'); // Get character name from the interaction
      const userId = interaction.user.id; // Get the user's ID

      // Fetch the character details
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.editReply({ content: `❌ **Character ${characterName} not found or does not belong to you.**` });
        return;
      }

      // Check if the character's inventory has been synced
        if (!character.inventorySynced) {
          return interaction.editReply({
              content: `❌ **You cannot use this command because your character does not have an inventory set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> command to initialize your inventory.**`,
              ephemeral: true,
          });
        }

      const job = character.job; // Get the character's job

      // Validate the character's job for gathering
      if (!isValidJob(job)) {
        await interaction.editReply({ content: `❌ **Invalid job ${job} for gathering items.**` });
        return;
      }

      const jobPerk = getJobPerk(job);
      if (!jobPerk || !jobPerk.perks.includes('GATHERING')) {
        await interaction.editReply({ content: `❌ **${character.name} cannot gather items as a ${job} without the GATHERING perk.**` });
        return;
      }

      // Get the character's current village and region
      const currentVillage = capitalizeWords(character.currentVillage);
      const region = getVillageRegionByName(currentVillage);
      if (!region) {
        await interaction.editReply({ content: `❌ **No region found for the village ${currentVillage}.**` });
        return;
      }

      // ------------------- Blood Moon Monster Encounter Logic -------------------
      const monstersByCriteria = await getMonstersByCriteria(currentVillage, job); // Fetch monsters for the current village and job
      const encounterResult = adjustEncounterForBloodMoon(await getMonsterEncounterFromList(monstersByCriteria)); // Adjust encounters based on Blood Moon
      const availableMonstersCount = encounterResult.monsters.length;

      if (availableMonstersCount > 0 && encounterResult.encounter !== 'No Encounter') {
        const encounteredMonster = encounterResult.monsters[Math.floor(Math.random() * availableMonstersCount)];
        const embed = createMonsterEncounterEmbed(character, encounteredMonster, `⚠️ **You encountered a monster while gathering!**`);

        // Send the monster encounter message instead of gathering results
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      // ------------------- Standard Gathering Logic -------------------
      // Fetch all items from the database
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

      // Check if there are items available to gather
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
      await addItemInventoryDatabase(character._id, randomItem.itemName, quantity, randomItem.category.join(', '), randomItem.type.join(', '), interaction);

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
    } catch (error) {
      console.error(error.message); // Log any errors
      await interaction.editReply({ content: '⚠️ **An error occurred while trying to gather items.**' });
    }
  },

  // ------------------- Autocomplete Handler -------------------
  async autocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true); // Get the focused option (charactername)
      const userId = interaction.user.id;

      if (focusedOption.name === 'charactername') {
        // Fetch the characters for the user
        const characters = await fetchCharactersByUserId(userId);

        // Filter characters to only include those with the GATHERING perk
        const gatheringCharacters = characters.filter(character => {
          const jobPerk = getJobPerk(character.job);
          return jobPerk && jobPerk.perks.includes('GATHERING');
        });

        // Create a list of choices for the autocomplete
        const choices = gatheringCharacters.map(character => ({
          name: character.name,
          value: character.name
        }));

        // Filter choices based on user input and limit results to 25
        const filteredChoices = choices.filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase()))
                                       .slice(0, 25);

        await interaction.respond(filteredChoices); // Respond with the filtered choices
      }
    } catch (error) {
      console.error(error.message); // Log any errors
      await interaction.respond([]); // Respond with an empty array in case of an error
    }
  }
};
