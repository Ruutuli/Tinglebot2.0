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
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');
const { capitalizeWords, formatDateTime } = require('../../modules/formattingModule');

// ------------------- Utility Functions -------------------
const { addItemInventoryDatabase, processMaterials } = require('../../utils/inventoryUtils');
const { checkInventorySync } = require('../../utils/characterUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../../utils/validation');
const { safeAppendDataToSheet } = require('../../utils/googleSheetsUtils');
const { handleError } = require('../../utils/globalErrorHandler');
const { enforceJail } = require('../../utils/jailCheck');


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

      // Check if character is in jail
      if (await enforceJail(interaction, character)) {
        return;
      }

      // ------------------- Validate Character Status -------------------
      if (character.debuff?.active) {
        const unixTimestamp = Math.floor(new Date(character.debuff.endDate).getTime() / 1000);
        return interaction.editReply({ content: `❌ **${character.name} is currently debuffed and cannot craft.**\n🕒 Debuff Ends: <t:${unixTimestamp}:F>`, ephemeral: true });
      }

      try {
        await checkInventorySync(character);
      } catch (error) {
        return interaction.editReply({
          content: error.message,
          ephemeral: true
        });
      }

      // ------------------- Validate Village Channel -------------------
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
        return interaction.editReply({ content: `❌ **Command must be used in ${currentVillage} Town Hall (<#${allowedChannel}>).**`, ephemeral: true });
      }

      // ------------------- Fetch and Validate Item -------------------
      const item = await fetchItemByName(itemName);
      if (!item) {
        return interaction.editReply({ content: `❌ **No item found named "${itemName}".**`, ephemeral: true });
      }

      // ------------------- Validate Character Job and Voucher -------------------
      let job = (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job;
      console.log(`[crafting.js]: 🔄 Job determined for ${character.name}: "${job}"`);

      // ------------------- Validate Job Perks -------------------
      const jobPerk = getJobPerk(job);
      const craftingTagsLower = item.craftingTags.map(tag => tag.toLowerCase());
      if (!jobPerk || !jobPerk.perks.includes('CRAFTING') || !craftingTagsLower.includes(job.toLowerCase())) {
        console.error(`[crafting.js]: ❌ Invalid job "${job}" for ${character.name} - missing crafting skills`);
        return interaction.editReply({ 
          content: getJobVoucherErrorMessage('MISSING_SKILLS', {
            characterName: character.name,
            jobName: job,
            activity: 'crafting'
          }).message,
          ephemeral: false 
        });
      }

      // ------------------- Validate Stamina -------------------
      const staminaCost = item.staminaToCraft * quantity;
      if (character.currentStamina < staminaCost) {
        console.error(`[crafting.js]: ❌ Insufficient stamina for ${character.name} - needed ${staminaCost}, has ${character.currentStamina}`);
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

      // ------------------- Activate Job Voucher (only after all checks pass) -------------------
      let voucherCheck;
      if (character.jobVoucher) {
        console.log(`[crafting.js]: 🎫 Validating job voucher for ${character.name}`);
        voucherCheck = await validateJobVoucher(character, job);
        if (voucherCheck.skipVoucher) {
          console.log(`[crafting.js]: ✅ ${character.name} already has job "${job}" - skipping voucher`);
          // No activation needed
        } else if (!voucherCheck.success) {
          if (character.jobVoucherJob === null) {
            console.log(`[crafting.js]: 🔄 Unrestricted job voucher - proceeding with "${job}"`);
          } else {
            console.error(`[crafting.js]: ❌ Voucher validation failed: ${voucherCheck.message}`);
            return interaction.editReply({ content: voucherCheck.message, ephemeral: true });
          }
        } else {
          // Restrict crafting of items that require more than 5 stamina when using a job voucher
          if (item.staminaToCraft > 5) {
            console.error(`[crafting.js]: ❌ Item "${itemName}" requires ${item.staminaToCraft} stamina - exceeds job voucher limit`);
            await interaction.editReply({
              content: getJobVoucherErrorMessage('MISSING_SKILLS', {
                characterName: character.name,
                jobName: job
              }).message,
              ephemeral: true,
            });
            return;
          }

          const lockedVillage = isVillageExclusiveJob(job);
          if (lockedVillage && character.currentVillage.toLowerCase() !== lockedVillage.toLowerCase()) {
            console.error(`[crafting.js]: ❌ ${character.name} must be in ${lockedVillage} to use ${job} voucher`);
            return interaction.editReply({ 
              content: getJobVoucherErrorMessage('MISSING_SKILLS', {
                characterName: character.name,
                jobName: job
              }).message,
              ephemeral: true 
            });
          }

          console.log(`[crafting.js]: 🎫 Activating job voucher for ${character.name}`);
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
        }
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
        console.log(`[crafting.js]: ✅ Stamina deducted for ${character.name} - remaining: ${updatedStamina}`);
      } catch (error) {
        console.error(`[crafting.js]: ❌ Failed to deduct stamina for ${character.name}: ${error.message}`);
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
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        const formattedDateTime = formatDateTime(new Date());

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
            interactionUrl,
            formattedDateTime,
            uniqueSyncId
          ]
        ];

        if (character?.name && character?.inventory && character?.userId) {
          await safeAppendDataToSheet(character.inventory, character, range, values, undefined, { 
            skipValidation: true,
            context: {
              commandName: 'crafting',
              userTag: interaction.user.tag,
              userId: interaction.user.id,
              characterName: character.name,
              spreadsheetId: extractSpreadsheetId(character.inventory),
              range: range,
              sheetType: 'inventory',
              options: {
                itemName: item.itemName,
                quantity: quantity,
                flavorText: interaction.options.getString('flavortext')
              }
            }
          });
        } else {
          console.error('[safeAppendDataToSheet]: Invalid character object detected before syncing.');
        }
      }

      await addItemInventoryDatabase(character._id, item.itemName, quantity, interaction, 'Crafting');

      // ------------------- Deactivate Job Voucher -------------------
      if (character.jobVoucher && !voucherCheck?.skipVoucher) {
        const deactivationResult = await deactivateJobVoucher(character._id);
        if (!deactivationResult.success) {
          console.error(`[crafting.js]: ❌ Failed to deactivate job voucher for ${character.name}`);
        } else {
          console.log(`[crafting.js]: ✅ Job voucher deactivated for ${character.name}`);
        }
      }
    } catch (error) {
      handleError(error, 'crafting.js');
      console.error(`[crafting.js]: Critical error in crafting execution.`, error);
    }
  }
};
