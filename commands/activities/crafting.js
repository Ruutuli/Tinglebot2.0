// ------------------- Crafting Command Module -------------------
// This module handles the crafting process for characters. It verifies user inputs, validates requirements 
// (such as village channel, debuffs, job and voucher eligibility, stamina, and materials), updates character 
// stats and inventory, logs transactions to Google Sheets, and sends informative responses via embeds.

// ------------------- Standard Libraries -------------------
const mongoose = require('mongoose'); // MongoDB object modeling tool
const { v4: uuidv4 } = require('uuid'); // For generating unique IDs

// ------------------- Discord.js Components -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');

const { handleError } = require('../../utils/globalErrorHandler.js');
// ------------------- Database Connections -------------------
const { connectToTinglebot } = require('../../database/connection.js');

// ------------------- Database Services -------------------
const { fetchCharacterByNameAndUserId, getCharacterInventoryCollection, updateCharacterById } = require('../../database/characterService.js');
const { fetchItemByName } = require('../../database/itemService.js');

// ------------------- Modules -------------------
const { checkAndUseStamina } = require('../../modules/characterStatsModule.js');
const { getJobPerk } = require('../../modules/jobsModule.js');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher } = require('../../modules/jobVoucherModule.js');
const { capitalizeWords,formatDateTime   } = require('../../modules/formattingModule.js');

// ------------------- Utility Functions -------------------
const { addItemInventoryDatabase, processMaterials } = require('../../utils/inventoryUtils.js');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../../utils/validation.js');

// ------------------- Google Sheets API -------------------
const { appendSheetData, authorizeSheets } = require('../../utils/googleSheetsUtils.js');

// ------------------- Embed Imports -------------------
const { createCraftingEmbed } = require('../../embeds/embeds.js');

// ------------------- Handler Imports -------------------
const { handleCraftingAutocomplete } = require('../../handlers/autocompleteHandler.js');

// ------------------- Database Models -------------------
const generalCategories = require('../../models/GeneralItemCategories.js');
const ItemModel = require('../../models/ItemModel.js');

module.exports = {
  // ------------------- Command Data Definition -------------------
  // Defines the slash command, its description, and options for crafting.
  data: new SlashCommandBuilder()
    .setName('crafting')
    .setDescription('Craft an item for a character')
    .addStringOption(option =>
      option
        .setName('charactername')
        .setDescription('The name of the character')
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('itemname')
        .setDescription('The name of the item to craft')
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('quantity')
        .setDescription('The number of items to craft')
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(option =>
      option
        .setName('flavortext')
        .setDescription('Optional flavor text for the crafted item')
        .setRequired(false)
    ),

  // ------------------- Execute Command -------------------
  async execute(interaction) {
    // ------------------- Defer Reply and Connect to Database -------------------
    // Defer the reply to allow time for processing and connect to the database.
    await interaction.deferReply({ ephemeral: true });
    await connectToTinglebot();

    // ------------------- Extract Command Options -------------------
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');
    const itemName = interaction.options.getString('itemname');
    const flavorText = interaction.options.getString('flavortext') || '';
    const quantity = interaction.options.getInteger('quantity');

    // ------------------- Village Channel Validation Setup -------------------
    // Define allowed town hall channels for each village.
    const villageChannels = {
      Rudania: process.env.RUDANIA_TOWN_HALL,
      Inariko: process.env.INARIKO_TOWN_HALL,
      Vhintl: process.env.VHINTL_TOWN_HALL,
    };

    try {
      // ------------------- Fetch and Validate Character -------------------
      // Retrieve the character data and ensure it exists and belongs to the user.
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        return interaction.editReply({
          content: `❌ **Character "${characterName}" not found or does not belong to you.**`,
          ephemeral: true,
        });
      }

      // ------------------- Check for Active Debuff -------------------
      // Prevent crafting if the character is currently debuffed.
      if (character.debuff?.active) {
        const debuffEndDate = new Date(character.debuff.endDate);
        const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
        await interaction.editReply({
          content: `❌ **${character.name} is currently debuffed and cannot craft. Please wait until the debuff expires.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
          ephemeral: true,
        });
        return;
      }

      // ------------------- Verify Inventory Synchronization -------------------
      // Ensure the character's inventory is properly synced.
      if (!character.inventorySynced) {
        return interaction.editReply({
          content: `❌ **Your character's inventory is not synced. Please initialize your inventory with </testinventorysetup:1306176790095728732> and sync it with </syncinventory:1306176789894266898>.**`,
          ephemeral: true,
        });
      }

      // ------------------- Validate Village Channel -------------------
      // Confirm that the command is used in the correct village channel.
      const currentVillage = capitalizeWords(character.currentVillage);
      const allowedChannel = villageChannels[currentVillage];
      if (!allowedChannel || interaction.channelId !== allowedChannel) {
        const channelMention = `<#${allowedChannel}>`;
        await interaction.editReply({
          content: `❌ **You can only use this command in the ${currentVillage} Town Hall channel!**\n${character.name} is currently in ${currentVillage}! This command must be used in ${channelMention}.`,
        });
        return;
      }

      // ------------------- Fetch and Validate Item -------------------
      // Retrieve the item data to be crafted.
      const item = await fetchItemByName(itemName);
      if (!item) {
        return interaction.editReply({
          content: `❌ **No item found with the name "${itemName}".**`,
          ephemeral: true,
        });
      }

      // ------------------- Validate Job Eligibility and Voucher -------------------
      // Determine the character's job based on any active job voucher.
      let job = (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job;
      console.log(`[crafting.js]: Determined job for ${character.name} is "${job}"`);

      // If a job voucher is active, validate its applicability.
      if (character.jobVoucher) {
        console.log(`[crafting.js]: Job voucher detected for ${character.name}. Validating voucher.`);
        const voucherValidation = await validateJobVoucher(character, job);
        if (!voucherValidation.success) {
          if (character.jobVoucherJob === null) {
            console.log(`[crafting.js]: Job voucher is unrestricted. Proceeding with job: "${job}".`);
          } else {
            await interaction.editReply({
              content: voucherValidation.message,
              ephemeral: true,
            });
            return;
          }
        }

        // Restrict crafting of items that require more than 5 stamina when using a job voucher.
        if (item.staminaToCraft > 5) {
          console.log(`[crafting.js]: Item "${itemName}" requires ${item.staminaToCraft} stamina to craft, exceeding the allowed limit for job vouchers.`);
          await interaction.editReply({
            content: `❌ **Items requiring more than 5 stamina to craft cannot be crafted with an active job voucher.**\n"${itemName}" requires **${item.staminaToCraft} stamina**.`,
            ephemeral: true,
          });
          return;
        }
      }

      // ------------------- Validate Job Perks and Crafting Tags -------------------
      // Ensure the character's job permits crafting the desired item.
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

      // ------------------- Handle Job Voucher Activation -------------------
      // If a job voucher is active, activate it for crafting.
      if (character.jobVoucher) {
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

      // ------------------- Early Stamina Check -------------------
      // Calculate required stamina and ensure the character has sufficient stamina.
      const staminaCost = item.staminaToCraft * quantity;
      if (character.currentStamina < staminaCost) {
        return interaction.editReply({
          content: `❌ **Not enough stamina to craft ${quantity} "${itemName}". Required: ${staminaCost}, Available: ${character.currentStamina}.**`,
          ephemeral: true,
        });
      }

      // ------------------- Deduct Stamina -------------------
      // Deduct the stamina cost before crafting begins.
      let updatedStamina;
      try {
        updatedStamina = await checkAndUseStamina(character, staminaCost);
        console.log(`[crafting.js]: Stamina deducted. Remaining: ${updatedStamina}`);
      } catch (error) {
    handleError(error, 'crafting.js');

        console.error(`[crafting.js]: Error deducting stamina for character "${characterName}" while crafting "${itemName}". Details:`, error);
        return interaction.followUp({
          content: `⚠️ **Crafting cannot be completed due to insufficient stamina. Please try again.**`,
          ephemeral: true,
        });
      }

      // ------------------- Process Materials for Crafting -------------------
      // Fetch the character's inventory and process the materials required for crafting.
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventory = await inventoryCollection.find().toArray();
      const materialsUsed = await processMaterials(interaction, character, inventory, item, quantity);
      if (materialsUsed === 'canceled') {
        return interaction.editReply({ content: '❌ **Crafting canceled.**', ephemeral: true });
      }

      // ------------------- Create and Send Crafting Response -------------------
      // Build an embed with crafting details and notify the user of successful crafting.
      const embed = await createCraftingEmbed(
        item,
        character,
        flavorText,
        materialsUsed,
        quantity,
        staminaCost,
        updatedStamina,
        character.jobVoucher ? character.jobVoucherJob : null // Include job voucher job if active
      );
      await interaction.editReply({
        content: `✅ **Successfully crafted ${quantity} "${itemName}".**`,
        ephemeral: true
      });
      await interaction.followUp({ embeds: [embed], ephemeral: false });

      // ------------------- Log Crafting Transaction to Google Sheets -------------------
      // If the character's inventory link is a valid Google Sheets URL, log the crafting details.
      const inventoryLink = character.inventory || character.inventoryLink;
      if (typeof inventoryLink === 'string' && isValidGoogleSheetsUrl(inventoryLink)) {
        const spreadsheetId = extractSpreadsheetId(inventoryLink);
        const auth = await authorizeSheets();
        const range = 'loggedInventory!A2:M';
        const uniqueSyncId = uuidv4();
        const values = [
          [
            character.name,
            item.itemName,
            quantity.toString(),
            item.category.join(', '),
            item.type.join(', '),
            item.subtype.join(', '),
            'Crafting',
            character.job,
            '',
            character.currentVillage,
            `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
            formatDateTime(new Date()),
            uniqueSyncId
          ]
        ];
        await appendSheetData(auth, spreadsheetId, range, values);
        await logMaterialsToGoogleSheets(
          auth,
          spreadsheetId,
          range,
          character,
          materialsUsed,
          item,
          `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
          formatDateTime(new Date())
        );

        // ------------------- Add Crafted Item to Inventory Database -------------------
        // Log the crafted item into the inventory database.
        await addItemInventoryDatabase(
          character._id,
          item.itemName,
          quantity,
          interaction, // Interaction needed for validation and logging
          'Crafting'   // Explicitly specify 'Crafting' as the obtain method
        );
      }

      // ------------------- Deactivate Job Voucher -------------------
      // After successful crafting, deactivate the job voucher if one is active.
      if (character.jobVoucher) {
        const deactivationResult = await deactivateJobVoucher(character._id);
        if (!deactivationResult.success) {
          console.error(`[crafting.js]: Failed to deactivate job voucher for ${character.name}`);
        } else {
          console.log(`[crafting.js]: Job voucher deactivated for ${character.name}`);
        }
      }
    } catch (error) {
    handleError(error, 'crafting.js');

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

// ------------------- Log Materials to Google Sheets -------------------
// Logs the materials used in crafting to a Google Sheets document.
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
            character.name,
            material.itemName,
            `-${material.quantity}`,
            'Unknown',
            'Unknown',
            'Unknown',
            `Used for ${craftedItem.itemName}`,
            character.job,
            '',
            character.currentVillage,
            interactionUrl,
            formattedDateTime,
            uuidv4()
          ];
        }
        return [
          character.name,
          material.itemName,
          `-${material.quantity}`,
          materialItem.category.join(', '),
          materialItem.type.join(', '),
          materialItem.subtype.join(', '),
          `Used for ${craftedItem.itemName}`,
          character.job,
          '',
          character.currentVillage,
          interactionUrl,
          formattedDateTime,
          uuidv4()
        ];
      } catch (error) {
    handleError(error, 'crafting.js');

        return [
          character.name,
          material.itemName,
          `-${material.quantity}`,
          'Unknown',
          'Unknown',
          'Unknown',
          `Used for ${craftedItem.itemName}`,
          character.job,
          '',
          character.currentVillage,
          interactionUrl,
          formattedDateTime,
          uuidv4()
        ];
      }
    }));
    await appendSheetData(auth, spreadsheetId, range, usedMaterialsValues);
  } catch (error) {
    handleError(error, 'crafting.js');

    console.error(`[crafting.js]: Error logging materials to Google Sheets: ${error.message}`);
  }
}

// ------------------- Combine Materials -------------------
// Combines duplicate materials from the crafting process to avoid redundancy in logging.
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
