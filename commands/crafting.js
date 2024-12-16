// ------------------- Crafting Command Module -------------------
// This module handles the crafting process for characters, including item crafting, material usage, and Google Sheets logging.

// ------------------- Import Section -------------------
// Standard Library Imports
const { v4: uuidv4 } = require('uuid'); // UUID for generating unique IDs

// Third-Party Library Imports
const mongoose = require('mongoose'); // MongoDB interaction
const { SlashCommandBuilder } = require('@discordjs/builders'); // Discord.js for building slash commands

// Database Service Imports
const { connectToTinglebot } = require('../database/connection'); // Database connection
const { fetchCharacterByNameAndUserId, getCharacterInventoryCollection } = require('../database/characterService'); // Character-related services
const { fetchItemByName } = require('../database/itemService'); // Item-related services

// Utility Function Imports
const { addItemInventoryDatabase, processMaterials } = require('../utils/inventoryUtils'); // Inventory utility functions
const { appendSheetData, authorizeSheets } = require('../utils/googleSheetsUtils'); // Google Sheets interaction
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation'); // Validation utilities
const { formatDateTime } = require('../modules/formattingModule'); // Formatting utilities

// Module Imports
const { checkAndUseStamina } = require('../modules/characterStatsModule'); // Character stamina management
const { getJobPerk } = require('../modules/jobsModule'); // Job perks handling

// Embed Imports
const { createCraftingEmbed } = require('../embeds/mechanicEmbeds'); // Embeds for crafting messages

// Handler Imports
const { handleCraftingAutocomplete } = require('../handlers/autocompleteHandler'); // Autocomplete handling

// Model Imports
const generalCategories = require('../models/GeneralItemCategories'); // Item category model
const ItemModel = require('../models/ItemModel'); // Item model for database interaction

// ------------------- Crafting Command Definition -------------------
// Defines the crafting slash command and its subcommands/options
module.exports = {
  data: new SlashCommandBuilder()
    .setName('crafting')
    .setDescription('Craft an item for a character')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setAutocomplete(true)
        .setRequired(true))
    .addStringOption(option =>
      option.setName('itemname')
        .setDescription('The name of the item to craft')
        .setAutocomplete(true)
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('quantity')
        .setDescription('The number of items to craft')
        .setRequired(true)
        .setMinValue(1))
    .addStringOption(option =>
      option.setName('flavortext')
        .setDescription('Optional flavor text for the crafted item')
        .setRequired(false)),

// ------------------- Execute Command -------------------

async execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  await connectToTinglebot(); // Connect to the database

  // Define the maximum crafting quantity
  const MAX_CRAFT_QUANTITY = 5;

  // Get user input from the command options
  const characterName = interaction.options.getString('charactername');
  const itemName = interaction.options.getString('itemname');
  const flavorText = interaction.options.getString('flavortext') || '';
  const quantity = interaction.options.getInteger('quantity');
  const userId = interaction.user.id;
  const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

  // Check if quantity exceeds the maximum allowed limit
  if (quantity > MAX_CRAFT_QUANTITY) {
      return interaction.editReply({
          content: `❌ **You cannot craft more than ${MAX_CRAFT_QUANTITY} items at a time. Please reduce the quantity.**`,
          ephemeral: true
      });
  }

  try {
      // Fetch the character and validate
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        return interaction.editReply({
          content: `❌ **Character ${characterName} not found or does not belong to you.**`,
          ephemeral: true,
        });
      }
      
      // Check if the character is debuffed
      if (character.debuff?.active) {
        return interaction.editReply({
          content: `❌ **${character.name} is currently debuffed and cannot craft. Please wait until the debuff expires.**`,
          ephemeral: true,
        });
      }

      if (!character.inventorySynced) {
          return interaction.editReply({
              content: `❌ **Your character's inventory is not synced. Please initialize your inventory with </testinventorysetup:1306176790095728732> and sync it with </syncinventory:1306176789894266898>.**`,
              ephemeral: true
          });
      }

      // Fetch the item and validate
      const item = await fetchItemByName(itemName);
      if (!item) {
          return interaction.editReply({
              content: `❌ **No item found with the name ${itemName}.**`,
              ephemeral: true
          });
      }

      // Check if the character can craft the item
      const jobPerk = getJobPerk(character.job);
      const requiredJobs = item.craftingTags.join(', ');
      if (!jobPerk || !jobPerk.perks.includes('CRAFTING') || !item.craftingTags.map(tag => tag.toLowerCase()).includes(character.job.toLowerCase())) {
          return interaction.editReply({
              content: `❌ **${character.name} cannot craft ${itemName} because they lack the required job(s): ${requiredJobs}.**`,
              ephemeral: true
          });
      }

      // Fetch inventory and process materials
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventory = await inventoryCollection.find().toArray();
      const materialsUsed = await processMaterials(interaction, character, inventory, item, quantity);

      if (materialsUsed === 'canceled') {
          return interaction.editReply({ content: '❌ **Crafting canceled.**', ephemeral: true });
      }

      // Calculate stamina cost and check availability
      const staminaCost = item.staminaToCraft * quantity;
      if (character.currentStamina < staminaCost) {
          return interaction.editReply({
              content: `❌ **Not enough stamina to craft ${quantity} ${itemName}(s). Required: ${staminaCost}, Available: ${character.currentStamina}.**`,
              ephemeral: true
          });
      }

      // Deduct stamina and update only after successful material processing
      await checkAndUseStamina(character, staminaCost);

      // Fetch the updated stamina value
      const updatedStamina = character.currentStamina - staminaCost;

      // Create crafting embed and respond with success
      const embed = await createCraftingEmbed(item, character, flavorText, materialsUsed, quantity, staminaCost, updatedStamina);
      await interaction.editReply({
          content: `✅ **Successfully crafted ${quantity} ${itemName}(s).**`,
          ephemeral: true
      });
      await interaction.followUp({ embeds: [embed], ephemeral: false });

      // Log the crafting result to Google Sheets
      const inventoryLink = character.inventory || character.inventoryLink;
      if (typeof inventoryLink === 'string' && isValidGoogleSheetsUrl(inventoryLink)) {
          const spreadsheetId = extractSpreadsheetId(inventoryLink);
          const auth = await authorizeSheets();
          const range = 'loggedInventory!A2:M';
          const uniqueSyncId = uuidv4();
          const values = [
              [
                  character.name, item.itemName, quantity.toString(), item.category.join(', '),
                  item.type.join(', '), item.subtype.join(', '), 'Crafting', character.job, '',
                  character.currentVillage, interactionUrl, formatDateTime(new Date()), uniqueSyncId
              ]
          ];

          await appendSheetData(auth, spreadsheetId, range, values);
          await logMaterialsToGoogleSheets(auth, spreadsheetId, range, character, materialsUsed, item, interactionUrl, formatDateTime(new Date()));
          await addItemInventoryDatabase(character._id, item.itemName, quantity, item.category.join(', '), item.type.join(', '), interaction);
      }
  } catch (error) {
      // Log error and ensure stamina is not deducted for failed crafting
      await interaction.editReply({
          content: `❌ **An error occurred while crafting ${itemName}: ${error.message}**`,
          ephemeral: true
      });
  }
},


  // ------------------- Autocomplete Handler -------------------
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    await handleCraftingAutocomplete(interaction, focusedOption);
  }
};

// ------------------- Helper Functions -------------------

// Logs materials used for crafting to Google Sheets
async function logMaterialsToGoogleSheets(auth, spreadsheetId, range, character, materialsUsed, craftedItem, interactionUrl, formattedDateTime) {
  try {
    const combinedMaterials = combineMaterials(materialsUsed);
    const usedMaterialsValues = await Promise.all(combinedMaterials.map(async material => {
      try {
        const materialObjectId = new mongoose.Types.ObjectId(material._id);
        let materialItem = await ItemModel.findById(materialObjectId);

        if (!materialItem) {
          materialItem = await ItemModel.findOne({ itemName: material.itemName });
        }

        if (!materialItem) {
          return [
            character.name, material.itemName, `-${material.quantity}`, 'Unknown', 
            'Unknown', 'Unknown', `Used for ${craftedItem.itemName}`, character.job, '', 
            character.currentVillage, interactionUrl, formattedDateTime, uuidv4()
          ];
        }

        return [
          character.name, material.itemName, `-${material.quantity}`, materialItem.category.join(', '), 
          materialItem.type.join(', '), materialItem.subtype.join(', '), `Used for ${craftedItem.itemName}`, 
          character.job, '', character.currentVillage, interactionUrl, formattedDateTime, uuidv4()
        ];
      } catch (error) {
        return [
          character.name, material.itemName, `-${material.quantity}`, 'Unknown', 'Unknown', 
          'Unknown', `Used for ${craftedItem.itemName}`, character.job, '', 
          character.currentVillage, interactionUrl, formattedDateTime, uuidv4()
        ];
      }
    }));

    await appendSheetData(auth, spreadsheetId, range, usedMaterialsValues);
  } catch (error) {
    console.error(`Error logging materials to Google Sheets: ${error.message}`);
  }
}

// Combines materials used for crafting to avoid duplicates
function combineMaterials(materialsUsed) {
  const combinedMaterials = [];
  const materialMap = new Map();

  for (const material of materialsUsed) {
    if (materialMap.has(material.itemName)) {
      materialMap.get(material.itemName).quantity += material.quantity;
    } else {
      materialMap.set(material.itemName, { ...material });
    }
  }

  return Array.from(materialMap.values());
}
