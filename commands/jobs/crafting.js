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
const { MessageFlags, EmbedBuilder } = require('discord.js');

// ------------------- Database Connections -------------------
const { connectToTinglebot, fetchCharacterByNameAndUserId, getCharacterInventoryCollection, fetchItemByName } = require('../../database/db');

// ------------------- Database Services -------------------
const ItemModel = require('../../models/ItemModel');

// ------------------- Custom Modules -------------------
const { checkAndUseStamina } = require('../../modules/characterStatsModule');
const { getJobPerk, isVillageExclusiveJob } = require('../../modules/jobsModule');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');
const { capitalizeWords, formatDateTime } = require('../../modules/formattingModule');
const { applyCraftingBoost, applyCraftingStaminaBoost, applyCraftingMaterialBoost, applyCraftingQuantityBoost } = require('../../modules/boostIntegration');
const { info, success, error } = require('../../utils/logger');

// ------------------- Utility Functions -------------------
const { addItemInventoryDatabase, processMaterials } = require('../../utils/inventoryUtils');
const { checkInventorySync } = require('../../utils/characterUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../../utils/googleSheetsUtils');
const { safeAppendDataToSheet } = require('../../utils/googleSheetsUtils');
const { handleInteractionError } = require('../../utils/globalErrorHandler');
const { enforceJail } = require('../../utils/jailCheck');


// ------------------- Embed Imports -------------------
const { createCraftingEmbed } = require('../../embeds/embeds.js');

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
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    await connectToTinglebot();

    // ------------------- Extract Command Options -------------------
    const userId = interaction.user.id;
    const characterName = interaction.options.getString('charactername');
    const itemNameRaw = interaction.options.getString('itemname');
    const quantity = interaction.options.getInteger('quantity');
    const flavorText = interaction.options.getString('flavortext') || '';

    // ------------------- Clean Item Name from Copy-Paste -------------------
    // Remove quantity information from item names if users copy-paste autocomplete text
    const itemName = itemNameRaw.replace(/\s*\(Qty:\s*\d+\)/i, '').trim();

    const villageChannels = {
      Rudania: process.env.RUDANIA_TOWNHALL,
      Inariko: process.env.INARIKO_TOWNHALL,
      Vhintl: process.env.VHINTL_TOWNHALL,
    };

    try {
      // ------------------- Fetch and Validate Character -------------------
      let character = await fetchCharacterByNameAndUserId(characterName, userId);
      
      // If not found as regular character, try as mod character
      if (!character) {
        const { fetchModCharacterByNameAndUserId } = require('../../database/db');
        character = await fetchModCharacterByNameAndUserId(characterName, userId);
      }
      
      if (!character) {
        return interaction.editReply({ content: `❌ **Character "${characterName}" not found or does not belong to you.**`, flags: [MessageFlags.Ephemeral] });
      }

      // Check if character is in jail
      if (await enforceJail(interaction, character)) {
        return;
      }

      // ------------------- Validate Character Status -------------------
      if (character.debuff?.active) {
        const debuffEndDate = new Date(character.debuff.endDate);
        const now = new Date();
        
        // Check if debuff has actually expired
        if (debuffEndDate <= now) {
          // Debuff has expired, clear it
          character.debuff.active = false;
          character.debuff.endDate = null;
          await character.save();
        } else {
          // Debuff is still active
          const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
          
          return interaction.editReply({ content: `❌ **${character.name} is currently debuffed and cannot craft.**\n🕒 Debuff Ends: <t:${unixTimestamp}:F>`, flags: [MessageFlags.Ephemeral] });
        }
      }

      // ------------------- Check Inventory Sync -------------------
      try {
        await checkInventorySync(character);
      } catch (error) {
        await interaction.editReply({
          embeds: [{
            color: 0xFF0000,
            title: '❌ Inventory Sync Required',
            description: error.message,
            fields: [
              {
                name: 'How to Fix',
                value: '1. Use </inventory test:1370788960267272302> to test your inventory\n2. Use </inventory sync:1370788960267272302> to sync your inventory'
              }
            ]
          }],
          flags: [MessageFlags.Ephemeral]
        });
        return;
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
      // Allow testing in specific channel
      const testingChannelId = '1391812848099004578';
      const isTestingChannel = interaction.channelId === testingChannelId;

      if (!allowedChannel || (interaction.channelId !== allowedChannel && !isTestingChannel)) {
        const channelMention = `<#${allowedChannel}>`;
        return interaction.editReply({
          embeds: [{
            color: 0x008B8B, // Dark cyan color
            description: `*${character.name} looks around, confused by their surroundings...*\n\n**Channel Restriction**\nYou can only use this command in the ${currentVillage} Town Hall channel!\n\n📍 **Current Location:** ${capitalizeWords(character.currentVillage)}\n💬 **Command Allowed In:** ${channelMention}`,
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Channel Restriction'
            }
          }],
          flags: [MessageFlags.Ephemeral]
        });
      }

      // ------------------- Fetch and Validate Item -------------------
      const item = await fetchItemByName(itemName, {
        commandName: interaction.commandName,
        userTag: interaction.user?.tag,
        userId: interaction.user?.id,
        operation: 'crafting_validate_item'
      });
      if (!item) {
        return interaction.editReply({ content: `❌ **No item found named "${itemName}".**`, flags: [MessageFlags.Ephemeral] });
      }

      // ------------------- Validate Character Job and Voucher -------------------
      let job = (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job;
      info('CRFT', `Job determined for ${character.name}: "${job}"`);

      // ------------------- Validate Job Perks -------------------
      const jobPerk = getJobPerk(job);
      
      // Check if character's job matches item's crafting requirements using boolean fields
      const jobLower = job.toLowerCase();
      
      // Special handling for mod characters with ALL perks (Oracle, Sage, Dragon)
      const hasAllPerks = jobPerk && jobPerk.perks.includes('ALL');
      
      const jobFieldMap = {
        'cook': 'cook',
        'blacksmith': 'blacksmith',
        'craftsman': 'craftsman',
        'mask maker': 'maskMaker',
        'researcher': 'researcher',
        'weaver': 'weaver',
        'artist': 'artist',
        'witch': 'witch'
      };
      const jobField = jobFieldMap[jobLower];
      const canCraftItem = hasAllPerks || (jobField && item[jobField] === true);
      
      if (!jobPerk || (!jobPerk.perks.includes('CRAFTING') && !hasAllPerks) || !canCraftItem) {
        error('CRFT', `Invalid job "${job}" for ${character.name} - missing crafting skills`);
        const errorResponse = getJobVoucherErrorMessage('MISSING_SKILLS', {
          characterName: character.name,
          jobName: job,
          activity: 'crafting'
        });
        return interaction.editReply({ 
          embeds: [errorResponse.embed],
          ephemeral: false 
        });
      }

      // ------------------- Validate Job Voucher Eligibility FIRST -------------------
      let voucherCheck;
      let jobVoucherItem;
      if (character.jobVoucher) {
        info('CRFT', `Validating job voucher for ${character.name}`);
        voucherCheck = await validateJobVoucher(character, job);
        if (voucherCheck.skipVoucher) {
          success('CRFT', `${character.name} already has job "${job}" - skipping voucher`);
        } else if (!voucherCheck.success) {
          if (character.jobVoucherJob === null) {
            info('CRFT', `Unrestricted job voucher - proceeding with "${job}"`);
          } else {
            error('CRFT', `Voucher validation failed`);
            return interaction.editReply({ embeds: [voucherCheck.embed], flags: [MessageFlags.Ephemeral] });
          }
        } else {
          // Restrict crafting of items that require more than 5 stamina when using a job voucher
          if (item.staminaToCraft > 5) {
            error('CRFT', `Item "${itemName}" requires ${item.staminaToCraft} stamina - exceeds job voucher limit`);
            const staminaError = getJobVoucherErrorMessage('STAMINA_LIMIT', {
              characterName: character.name,
              itemName: itemName
            });
            await interaction.editReply({
              embeds: [staminaError.embed],
              flags: [MessageFlags.Ephemeral],
            });
            return;
          }

          const lockedVillage = isVillageExclusiveJob(job);
          if (lockedVillage && character.currentVillage.toLowerCase() !== lockedVillage.toLowerCase()) {
            error('CRFT', `${character.name} must be in ${lockedVillage} to use ${job} voucher`);
            const villageError = getJobVoucherErrorMessage('MISSING_SKILLS', {
              characterName: character.name,
              jobName: job,
              activity: 'crafting'
            });
            return interaction.editReply({ 
              embeds: [villageError.embed],
              flags: [MessageFlags.Ephemeral] 
            });
          }

          // Fetch the job voucher item for later activation
          const fetchResult = await fetchJobVoucherItem();
          if (!fetchResult.success) {
            await interaction.editReply({ embeds: [fetchResult.embed], flags: [MessageFlags.Ephemeral] });
            return;
          }
          jobVoucherItem = fetchResult.item;
        }
      }

      // ------------------- Validate Stamina -------------------
      // Always fetch the latest character data before stamina check to avoid stale values
      const freshCharacter = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!freshCharacter) {
        return interaction.editReply({ content: `❌ **Character \"${characterName}\" not found or does not belong to you.**`, flags: [MessageFlags.Ephemeral] });
      }
      let staminaCost = item.staminaToCraft * quantity;
      
      // ------------------- Check for Teacher Stamina Boost -------------------
      let teacherStaminaContribution = 0;
      let crafterStaminaCost = staminaCost;
      if (freshCharacter.boostedBy) {
        const { fetchCharacterByName } = require('../../database/db');
        const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
        if (boosterCharacter && boosterCharacter.job === 'Teacher') {
          // Teacher can contribute up to 3 stamina (or half the cost if less than 6)
          // Both characters split the stamina cost
          const halfCost = Math.ceil(staminaCost / 2);
          teacherStaminaContribution = Math.min(halfCost, 3);
          crafterStaminaCost = staminaCost - teacherStaminaContribution;
          
          // Validate Teacher has enough stamina
          if (boosterCharacter.currentStamina < teacherStaminaContribution) {
            error('CRFT', `Teacher ${boosterCharacter.name} has insufficient stamina - needed ${teacherStaminaContribution}, has ${boosterCharacter.currentStamina}`);
            return interaction.editReply({ content: `❌ **${boosterCharacter.name} (Teacher) doesn't have enough stamina to help. Needed: ${teacherStaminaContribution}, Available: ${boosterCharacter.currentStamina}.**`, flags: [MessageFlags.Ephemeral] });
          }
          
          info('CRFT', `Teacher boost active: ${teacherStaminaContribution} from ${boosterCharacter.name}, ${crafterStaminaCost} from ${freshCharacter.name}`);
        }
      }
      
      // Apply other Crafting boosts to stamina cost (Priest reduction, etc.)
      if (!teacherStaminaContribution) {
        // Only apply stamina boost if not using Teacher boost (Teacher handles stamina differently)
        staminaCost = await applyCraftingStaminaBoost(freshCharacter.name, staminaCost);
        crafterStaminaCost = staminaCost;
      }
      
      if (freshCharacter.currentStamina < crafterStaminaCost) {
        error('CRFT', `Insufficient stamina for ${freshCharacter.name} - needed ${crafterStaminaCost}, has ${freshCharacter.currentStamina}`);
        const staminaErrorEmbed = new EmbedBuilder()
          .setTitle('❌ Not Enough Stamina')
          .setDescription(`**${freshCharacter.name}** doesn't have enough stamina to craft this item.`)
          .addFields([
            { name: '💪 Needed', value: `${crafterStaminaCost}`, inline: true },
            { name: '⚡ Available', value: `${freshCharacter.currentStamina}`, inline: true }
          ])
          .setColor('#FF0000')
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setTimestamp();
        return interaction.editReply({ embeds: [staminaErrorEmbed], flags: [MessageFlags.Ephemeral] });
      }

      // ------------------- Validate Required Materials -------------------
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      const inventory = await inventoryCollection.find().toArray();

      // ------------------- Apply Scholar Material Reduction Boost -------------------
      // Apply Scholar boost to reduce material costs by 20%
      // Ensure item.craftingMaterial is an array before applying boost
      const originalCraftingMaterials = Array.isArray(item.craftingMaterial) ? item.craftingMaterial : [];
      let adjustedCraftingMaterials = await applyCraftingMaterialBoost(freshCharacter.name, originalCraftingMaterials);
      
      // Ensure adjustedCraftingMaterials is always an array (fallback to original if boost returns invalid result)
      if (!Array.isArray(adjustedCraftingMaterials)) {
        adjustedCraftingMaterials = originalCraftingMaterials;
      }

      const missingMaterials = [];
      for (const material of adjustedCraftingMaterials) {
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
            footer: { text: 'Gather, buy, or trade for more materials!' }

          }],
          flags: [MessageFlags.Ephemeral]
        });
      }

      // ------------------- Process Materials -------------------
      // Create a modified item object with adjusted materials for Scholar boost
      const itemWithAdjustedMaterials = {
        ...item,
        craftingMaterial: adjustedCraftingMaterials
      };
      const materialsUsed = await processMaterials(interaction, character, inventory, itemWithAdjustedMaterials, quantity);
      if (materialsUsed === 'canceled') {
        return interaction.editReply({ content: '❌ **Crafting canceled.**', flags: [MessageFlags.Ephemeral] });
      }

      // ------------------- Deduct Stamina -------------------
      let updatedStamina;
      let teacherUpdatedStamina = null;
      try {
        // Deduct stamina from crafter
        updatedStamina = await checkAndUseStamina(freshCharacter, crafterStaminaCost);
        success('CRFT', `Stamina deducted for ${freshCharacter.name} - remaining: ${updatedStamina}`);
        
        // Deduct stamina from Teacher if applicable
        if (teacherStaminaContribution > 0 && freshCharacter.boostedBy) {
          const { fetchCharacterByName } = require('../../database/db');
          const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
          if (boosterCharacter && boosterCharacter.job === 'Teacher') {
            teacherUpdatedStamina = await checkAndUseStamina(boosterCharacter, teacherStaminaContribution);
            success('CRFT', `Teacher stamina deducted for ${boosterCharacter.name} - remaining: ${teacherUpdatedStamina}`);
          }
        }
      } catch (error) {
        error('CRFT', `Failed to deduct stamina: ${error.message}`);
        handleInteractionError(error, 'crafting.js');
        // Refund materials if stamina deduction fails
        for (const mat of materialsUsed) {
          await addItemInventoryDatabase(character._id, mat.itemName, mat.quantity, interaction, 'Crafting Refund');
        }
        return interaction.followUp({ content: `⚠️ **Crafting failed due to insufficient stamina. Materials have been refunded.**`, flags: [MessageFlags.Ephemeral] });
      }

      // ------------------- Calculate Final Crafted Quantity (Before Embed) -------------------
      // Calculate the final quantity to be crafted (includes all boosts) for embed display
      let craftedQuantity = quantity;
      
      // Apply Crafting boosts to crafted item quantity (Entertainer adds +1, other boosts may affect quantity)
      craftedQuantity = await applyCraftingQuantityBoost(freshCharacter.name, craftedQuantity);
      
      // Log Entertainer boost if active (for debugging - boost is already applied by applyCraftingQuantityBoost)
      if (freshCharacter.boostedBy) {
        const { fetchCharacterByName } = require('../../database/db');
        const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
        if (boosterCharacter && boosterCharacter.job === 'Entertainer') {
          info('CRFT', `Entertainer boost active: Added 1 free ${itemName} for ${freshCharacter.name} (total: ${craftedQuantity})`);
        }
      }

      // ------------------- Send Crafting Embed -------------------
      let embed;
      try {
        // Ensure job string is always valid for flavor text
        const jobForFlavorText = (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job || '';
        // Use craftedQuantity (includes boosts) for display instead of original quantity
        embed = await createCraftingEmbed(
          item, character, flavorText, materialsUsed, craftedQuantity, staminaCost, updatedStamina,
          jobForFlavorText
        );
      } catch (embedError) {
        // ------------------- Failsafe: Refund on Embed Error -------------------
        // Refund stamina
        await checkAndUseStamina(freshCharacter, -crafterStaminaCost); // Negative to add back
        if (teacherStaminaContribution > 0 && freshCharacter.boostedBy) {
          const { fetchCharacterByName } = require('../../database/db');
          const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
          if (boosterCharacter && boosterCharacter.job === 'Teacher') {
            await checkAndUseStamina(boosterCharacter, -teacherStaminaContribution);
          }
        }
        // Refund materials
        for (const mat of materialsUsed) {
          await addItemInventoryDatabase(character._id, mat.itemName, mat.quantity, interaction, 'Crafting Refund');
        }
        handleInteractionError(embedError, 'crafting.js');
        return interaction.editReply({ content: '❌ **An error occurred while generating the crafting result. Your materials and stamina have been refunded. Please contact a moderator.**', flags: [MessageFlags.Ephemeral] });
      }

      // ------------------- Add Crafted Item to Inventory -------------------
      
      // Check for Fortune Teller boost to tag items
      let fortuneTellerBoostTag = null;
      if (freshCharacter.boostedBy) {
        const { fetchCharacterByName } = require('../../database/db');
        const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
        if (boosterCharacter && boosterCharacter.job === 'Fortune Teller') {
          fortuneTellerBoostTag = 'Fortune Teller';
          info('CRFT', `Fortune Teller boost active: Tagging ${craftedQuantity} ${itemName} with fortuneTellerBoost tag`);
        }
      }
      
      const craftedAt = new Date();
      await addItemInventoryDatabase(character._id, item.itemName, craftedQuantity, interaction, 'Crafting', craftedAt, fortuneTellerBoostTag);
      
      // Note: Google Sheets sync is handled by addItemInventoryDatabase

      // ------------------- Clear Boost After Use -------------------
      if (freshCharacter.boostedBy) {
        info('CRFT', `Clearing boost for ${freshCharacter.name} after use`);
        freshCharacter.boostedBy = null;
        await freshCharacter.save();
      }

      await interaction.editReply({ content: `✅ **Successfully crafted ${quantity} "${itemName}".**`, flags: [MessageFlags.Ephemeral] });
      await interaction.followUp({ embeds: [embed], ephemeral: false });

      // ------------------- Activate and Deactivate Job Voucher AFTER Crafting Success -------------------
      if (character.jobVoucher && !voucherCheck?.skipVoucher && jobVoucherItem) {
        const activationResult = await activateJobVoucher(character, job, jobVoucherItem, 1, interaction);
        if (!activationResult.success) {
          error('CRFT', `Failed to activate job voucher for ${character.name}`);
        } else {
          const deactivationResult = await deactivateJobVoucher(character._id);
          if (!deactivationResult.success) {
            error('CRFT', `Failed to deactivate job voucher for ${character.name}`);
          } else {
            success('CRFT', `Job voucher activated and deactivated for ${character.name}`);
          }
        }
      }
    } catch (error) {
      // ============================================================================
      // ------------------- Failsafe: Critical Error Handling -------------------
      // If an error occurs after materials/stamina are deducted, attempt to refund
      // ============================================================================
      await handleInteractionError(error, interaction, {
        source: 'crafting.js',
        characterName: characterName,
        itemName: itemName,
        quantity: quantity
      });
      
      try {
        if (typeof materialsUsed !== 'undefined' && Array.isArray(materialsUsed)) {
          for (const mat of materialsUsed) {
            await addItemInventoryDatabase(character._id, mat.itemName, mat.quantity, interaction, 'Crafting Refund');
          }
        }
        // Refund stamina - check if we have the updated values
        if (typeof updatedStamina !== 'undefined' && typeof crafterStaminaCost !== 'undefined') {
          await checkAndUseStamina(freshCharacter, -crafterStaminaCost); // Refund crafter stamina
          // Refund Teacher stamina if applicable
          if (typeof teacherStaminaContribution !== 'undefined' && teacherStaminaContribution > 0 && freshCharacter?.boostedBy) {
            const { fetchCharacterByName } = require('../../database/db');
            const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
            if (boosterCharacter && boosterCharacter.job === 'Teacher') {
              await checkAndUseStamina(boosterCharacter, -teacherStaminaContribution);
            }
          }
        } else if (typeof updatedStamina !== 'undefined' && typeof staminaCost !== 'undefined') {
          // Fallback: if crafterStaminaCost isn't available, use staminaCost (for cases where error occurred before Teacher boost calculation)
          await checkAndUseStamina(freshCharacter, -staminaCost);
        }
      } catch (refundError) {
        console.error('[crafting.js]: Refund error:', refundError);
      }
    }
  }
};
