// ============================================================================
// ------------------- CRAFTING COMMAND MODULE -------------------
// Handles crafting validation, material consumption, stamina deduction, 
// inventory updates, and crafting result messaging.
// ============================================================================

// ------------------- Standard Libraries -------------------
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// ------------------- Discord.js Components -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');

// ------------------- Database Connections -------------------
const { connectToTinglebot, fetchCharacterByNameAndUserId, getCharacterInventoryCollection, fetchItemByName } = require('../../database/db');

// ------------------- Database Services -------------------
const ItemModel = require('../../models/ItemModel');

// ------------------- Custom Modules -------------------
const { checkAndUseStamina } = require('../../modules/characterStatsModule');
const { getJobPerk, isVillageExclusiveJob } = require('../../modules/jobsModule');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher } = require('../../modules/jobVoucherModule');
const { capitalizeWords, formatDateTime } = require('../../modules/formattingModule');

// ------------------- Utility Functions -------------------
const { addItemInventoryDatabase, processMaterials } = require('../../utils/inventoryUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl, safeAppendDataToSheet } = require('../../utils/validation');
const { handleError } = require('../../utils/globalErrorHandler');

// ------------------- Embed Imports -------------------
const { createCraftingEmbed } = require('../../embeds/embeds');

// ------------------- External API Integrations -------------------
const { appendSheetData, authorizeSheets } = require('../../utils/googleSheetsUtils');

// ------------------- Models and Constants -------------------
const generalCategories = require('../../models/GeneralItemCategories');

// ============================================================================
// ------------------- CRAFTING COMMAND HANDLER -------------------
// Main handler for the /crafting command.
// ============================================================================
module.exports = {
  data: new SlashCommandBuilder()
    .setName('crafting')
    .setDescription('Craft an item for a character')
    .addStringOption(option =>
      option.setName('charactername').setDescription('The name of the character').setAutocomplete(true).setRequired(true)
    )
    .addStringOption(option =>
      option.setName('itemname').setDescription('The name of the item to craft').setAutocomplete(true).setRequired(true)
    )
    .addIntegerOption(option =>
      option.setName('quantity').setDescription('The number of items to craft').setRequired(true).setMinValue(1)
    )
    .addStringOption(option =>
      option.setName('flavortext').setDescription('Optional flavor text for the crafted item').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    await connectToTinglebot();

    // ------------------- Extract Command Options -------------------
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');
    const itemName = interaction.options.getString('itemname');
    const quantity = interaction.options.getInteger('quantity');
    const flavorText = interaction.options.getString('flavortext') || '';

    const villageChannels = {
      Rudania: process.env.RUDANIA_TOWN_HALL,
      Inariko: process.env.INARIKO_TOWN_HALL,
      Vhintl: process.env.VHINTL_TOWN_HALL,
    };

    try {
      // ------------------- Fetch and Validate Character -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        return interaction.editReply({ content: `❌ **Character "${characterName}" not found or does not belong to you.**`, ephemeral: true });
      }

      // ------------------- Validate Character Status -------------------
      if (character.debuff?.active) {
        const unixTimestamp = Math.floor(new Date(character.debuff.endDate).getTime() / 1000);
        return interaction.editReply({ content: `❌ **${character.name} is currently debuffed and cannot craft.**\n🕒 Debuff Ends: <t:${unixTimestamp}:F>`, ephemeral: true });
      }

      if (!character.inventorySynced) {
        return interaction.editReply({ content: `❌ **Inventory not synced. Please use </syncinventory:1306176789894266898>.**`, ephemeral: true });
      }

      // ------------------- Validate Village Channel -------------------
      const currentVillage = capitalizeWords(character.currentVillage);
      const allowedChannel = villageChannels[currentVillage];
      if (!allowedChannel || interaction.channelId !== allowedChannel) {
        return interaction.editReply({ content: `❌ **Command must be used in ${currentVillage} Town Hall (<#${allowedChannel}>).**`, ephemeral: true });
      }

      // ------------------- Fetch and Validate Item -------------------
      const item = await fetchItemByName(itemName);
      if (!item) {
        return interaction.editReply({ content: `❌ **No item found named "${itemName}".**`, ephemeral: true });
      }

      // ------------------- Validate Character Job and Voucher -------------------
      let job = (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job;
      console.log(`[crafting.js]: Determined job for ${character.name} is "${job}"`);

      if (character.jobVoucher) {
        const voucherValidation = await validateJobVoucher(character, job);
        if (!voucherValidation.success && character.jobVoucherJob !== null) {
          return interaction.editReply({ content: voucherValidation.message, ephemeral: true });
        }

        const lockedVillage = isVillageExclusiveJob(job);
        if (lockedVillage && character.currentVillage.toLowerCase() !== lockedVillage.toLowerCase()) {
          return interaction.editReply({ content: `❌ **"${character.name}" cannot use "${job}" while in ${currentVillage}.**`, ephemeral: true });
        }

        if (item.staminaToCraft > 5) {
          return interaction.editReply({ content: `❌ **"${itemName}" requires too much stamina to craft with a job voucher.**`, ephemeral: true });
        }
      }

      // ------------------- Validate Job Perks -------------------
      const jobPerk = getJobPerk(job);
      const craftingTagsLower = item.craftingTags.map(tag => tag.toLowerCase());
      if (!jobPerk || !jobPerk.perks.includes('CRAFTING') || !craftingTagsLower.includes(job.toLowerCase())) {
        return interaction.editReply({ content: `❌ **"${character.name}" cannot craft "${itemName}". Required jobs: ${item.craftingTags.join(', ')}.**`, ephemeral: true });
      }

      // ------------------- Validate Stamina -------------------
      const staminaCost = item.staminaToCraft * quantity;
      if (character.currentStamina < staminaCost) {
        return interaction.editReply({ content: `❌ **Not enough stamina. Needed: ${staminaCost}, Available: ${character.currentStamina}.**`, ephemeral: true });
      }

      // ------------------- Validate Required Materials -------------------
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventory = await inventoryCollection.find().toArray();

      const missingMaterials = [];
      for (const material of item.craftingMaterial) {
        const requiredQty = material.quantity * quantity;
        let ownedQty = 0;

        if (generalCategories[material.itemName]) {
          ownedQty = inventory.filter(invItem => generalCategories[material.itemName].includes(invItem.itemName)).reduce((sum, inv) => sum + inv.quantity, 0);
        } else {
          ownedQty = inventory.filter(invItem => invItem.itemName === material.itemName).reduce((sum, inv) => sum + inv.quantity, 0);
        }

        if (ownedQty < requiredQty) {
          missingMaterials.push(`• ${material.itemName} (Required: ${requiredQty}, Found: ${ownedQty})`);
        }
      }

      if (missingMaterials.length > 0) {
        return interaction.editReply({
          embeds: [{
            title: `❌ Missing Required Materials`,
            description: `You are missing the following materials to craft **${quantity}x ${itemName}**:\n\n${missingMaterials.join('\n')}`,
            color: 0xff0000,
            footer: { text: 'Sync your inventory or gather more materials.' }
          }],
          ephemeral: true
        });
      }

      // ------------------- Process Materials -------------------
      const materialsUsed = await processMaterials(interaction, character, inventory, item, quantity);
      if (materialsUsed === 'canceled') {
        return interaction.editReply({ content: '❌ **Crafting canceled.**', ephemeral: true });
      }

      // ------------------- Deduct Stamina -------------------
      let updatedStamina;
      try {
        updatedStamina = await checkAndUseStamina(character, staminaCost);
        console.log(`[crafting.js]: Stamina deducted. Remaining: ${updatedStamina}`);
      } catch (error) {
        handleError(error, 'crafting.js');
        return interaction.followUp({ content: `⚠️ **Crafting failed due to insufficient stamina.**`, ephemeral: true });
      }

      // ------------------- Send Crafting Embed -------------------
      const embed = await createCraftingEmbed(
        item, character, flavorText, materialsUsed, quantity, staminaCost, updatedStamina,
        character.jobVoucher ? character.jobVoucherJob : null
      );

      await interaction.editReply({ content: `✅ **Successfully crafted ${quantity} "${itemName}".**`, ephemeral: true });
      await interaction.followUp({ embeds: [embed], ephemeral: false });

      // ------------------- Update Inventory and Sheets -------------------
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

        await safeAppendDataToSheet(character.inventory, character, range, values);
      }

      await addItemInventoryDatabase(character._id, item.itemName, quantity, interaction, 'Crafting');

      // ------------------- Deactivate Job Voucher -------------------
      if (character.jobVoucher) {
        const deactivationResult = await deactivateJobVoucher(character._id);
        if (!deactivationResult.success) {
          console.error(`[crafting.js]: Failed to deactivate job voucher for ${character.name}`);
        }
      }
    } catch (error) {
      handleError(error, 'crafting.js');
      console.error(`[crafting.js]: Critical error in crafting execution.`, error);
    }
  }
};

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
    await safeAppendDataToSheet(character.inventory, character, range, usedMaterialsValues);
  } catch (error) {
    handleError(error, 'crafting.js');

    console.error(`[crafting.js]: Error logging materials to Google Sheets: ${error.message}`);
  }
}

// ------------------- Combine Materials -------------------
// Combines duplicate materials from the crafting process to avoid redundancy in logging.
function combineMaterials(materialsUsed) {
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
