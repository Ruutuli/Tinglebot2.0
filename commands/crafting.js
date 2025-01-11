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
const { fetchCharacterByNameAndUserId, getCharacterInventoryCollection, updateCharacterById } = require('../database/characterService'); // Character-related services
const { fetchItemByName } = require('../database/itemService'); // Item-related services

// Utility Function Imports
const { addItemInventoryDatabase, processMaterials } = require('../utils/inventoryUtils'); // Inventory utility functions
const { appendSheetData, authorizeSheets } = require('../utils/googleSheetsUtils'); // Google Sheets interaction
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation'); // Validation utilities
const { formatDateTime, capitalizeWords  } = require('../modules/formattingModule'); // Formatting utilities

// Module Imports
const { checkAndUseStamina } = require('../modules/characterStatsModule'); // Character stamina management
const { getJobPerk } = require('../modules/jobsModule'); // Job perks handling
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher } = require('../modules/jobVoucherModule');

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

  // Get user input from the command options
  const characterName = interaction.options.getString('charactername');
  const itemName = interaction.options.getString('itemname');
  const flavorText = interaction.options.getString('flavortext') || '';
  const quantity = interaction.options.getInteger('quantity');
  const userId = interaction.user.id;

  // ------------------- Add Village Channel Validation -------------------
  const villageChannels = {
      Rudania: process.env.RUDANIA_TOWN_HALL,
      Inariko: process.env.INARIKO_TOWN_HALL,
      Vhintl: process.env.VHINTL_TOWN_HALL,
  };

  try {
      // Fetch the character and validate
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
          return interaction.editReply({
              content: `❌ **Character "${characterName}" not found or does not belong to you.**`,
              ephemeral: true,
          });
      }

      // Check if the character is debuffed
      if (character.debuff?.active) {
          const debuffEndDate = new Date(character.debuff.endDate);
          const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
          await interaction.editReply({
              content: `❌ **${character.name} is currently debuffed and cannot craft. Please wait until the debuff expires.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
              ephemeral: true,
          });
          return;
      }

      if (!character.inventorySynced) {
          return interaction.editReply({
              content: `❌ **Your character's inventory is not synced. Please initialize your inventory with </testinventorysetup:1306176790095728732> and sync it with </syncinventory:1306176789894266898>.**`,
              ephemeral: true
          });
      }

      // ------------------- Validate Village Channel -------------------
      const currentVillage = capitalizeWords(character.currentVillage); // Capitalize village name for consistency
      const allowedChannel = villageChannels[currentVillage]; // Get the allowed channel from environment variables

      if (!allowedChannel || interaction.channelId !== allowedChannel) {
          const channelMention = `<#${allowedChannel}>`;
          await interaction.editReply({
              content: `❌ **You can only use this command in the ${currentVillage} Town Hall channel!**\n${character.name} is currently in ${currentVillage}! This command must be used in ${channelMention}.`,
          });
          return;
      }

// Fetch the item and validate
const item = await fetchItemByName(itemName);
if (!item) {
    return interaction.editReply({
        content: `❌ **No item found with the name "${itemName}".**`,
        ephemeral: true
    });
}

// ------------------- Validate Job and Job Voucher -------------------
// Determine job based on jobVoucher or default job
let job = character.jobVoucher && character.jobVoucherJob ? character.jobVoucherJob : character.job;
console.log(`[Crafting Command]: Determined job for ${character.name} is "${job}"`);

// Validate job voucher
if (character.jobVoucher) {
    console.log(`[Crafting Command]: Job voucher detected for ${character.name}. Validating voucher.`);
    const voucherValidation = await validateJobVoucher(character, job);
    if (!voucherValidation.success) {
        if (character.jobVoucherJob === null) {
            console.log(`[Crafting Command]: Job voucher is unrestricted. Proceeding with job: "${job}".`);
        } else {
            await interaction.editReply({
                content: voucherValidation.message,
                ephemeral: true,
            });
            return;
        }
    }

    // Restrict crafting items with stamina cost > 5
    if (item.staminaToCraft > 5) {
        console.log(`[Crafting Command]: Item "${itemName}" requires ${item.staminaToCraft} stamina to craft, exceeding the allowed limit for job vouchers.`);
        await interaction.editReply({
            content: `❌ **Items requiring more than 5 stamina to craft cannot be crafted with an active job voucher.**\n"${itemName}" requires **${item.staminaToCraft} stamina**.`,
            ephemeral: true,
        });
        return;
    }
}

// Validate job perks and crafting tags
const jobPerk = getJobPerk(job);
const requiredJobs = item.craftingTags.join(', ');

if (
    !jobPerk ||
    !jobPerk.perks.includes('CRAFTING') ||
    !item.craftingTags.map(tag => tag.toLowerCase()).includes(job.toLowerCase())
) {
    return interaction.editReply({
        content: `❌ **"${character.name}" cannot craft "${itemName}" because they lack the required job(s): ${requiredJobs}.**`,
        ephemeral: true,
    });
}


// Handle job voucher activation after validation
if (character.jobVoucher) {
    console.log(`[Crafting Command]: Activating job voucher for ${character.name}.`);
    const { success: itemSuccess, item: jobVoucherItem, message: itemError } = await fetchJobVoucherItem();
    if (!itemSuccess) {
        await interaction.editReply({
            content: itemError,
            ephemeral: true,
        });
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

      // Early Stamina Check
      const staminaCost = item.staminaToCraft * quantity;
      if (character.currentStamina < staminaCost) {
          return interaction.editReply({
              content: `❌ **Not enough stamina to craft ${quantity} "${itemName}". Required: ${staminaCost}, Available: ${character.currentStamina}.**`,
              ephemeral: true
          });
      }

      // Deduct stamina before crafting
      let updatedStamina;
      try {
          updatedStamina = await checkAndUseStamina(character, staminaCost);
          console.log(`[crafting.js]: Stamina deducted. Remaining: ${updatedStamina}`);
      } catch (error) {
          console.error(`[crafting.js]: Error deducting stamina for character "${characterName}" while crafting "${itemName}". Details:`, error);
          return interaction.followUp({
              content: `⚠️ **Crafting cannot be completed due to insufficient stamina. Please try again.**`,
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

      // Create crafting embed and respond with success
      const embed = await createCraftingEmbed(item, character, flavorText, materialsUsed, quantity, staminaCost, updatedStamina);
      await interaction.editReply({
          content: `✅ **Successfully crafted ${quantity} "${itemName}".**`,
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
                  character.currentVillage, `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`, formatDateTime(new Date()), uniqueSyncId
              ]
          ];

          await appendSheetData(auth, spreadsheetId, range, values);
          await logMaterialsToGoogleSheets(auth, spreadsheetId, range, character, materialsUsed, item, `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`, formatDateTime(new Date()));
          await addItemInventoryDatabase(character._id, item.itemName, quantity, item.category.join(', '), item.type.join(', '), interaction);
      }


      // Deactivate job voucher after successful crafting
if (character.jobVoucher) {
  const deactivationResult = await deactivateJobVoucher(character._id);
  if (!deactivationResult.success) {
      console.error(`[Crafting Command]: Failed to deactivate job voucher for ${character.name}`);
  } else {
      console.log(`[Crafting Command]: Job voucher deactivated for ${character.name}`);
  }
}
  } catch (error) {
      console.error(`[crafting.js]: Error while crafting "${itemName}" for character "${characterName}". Details:`, error);
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
