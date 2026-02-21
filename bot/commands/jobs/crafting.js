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
const { connectToTinglebot, fetchCharacterByNameAndUserId, getCharacterInventoryCollection, fetchItemByName } = require('@/database/db');

// ------------------- Database Services -------------------
const ItemModel = require('@/models/ItemModel');
const { Village } = require('@/models/VillageModel');

// ------------------- Custom Modules -------------------
const { checkAndUseStamina } = require('../../modules/characterStatsModule');
const { getJobPerk, isVillageExclusiveJob } = require('../../modules/jobsModule');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');
const { capitalizeWords, formatDateTime } = require('../../modules/formattingModule');
const { applyCraftingBoost, applyCraftingStaminaBoost, applyCraftingMaterialBoost, applyCraftingQuantityBoost } = require('../../modules/boostIntegration');
const { clearBoostAfterUse, getEffectiveJob, retrieveBoostingRequestFromTempDataByCharacter } = require('./boosting');
const { info, success, error } = require('@/utils/logger');

// ------------------- Utility Functions -------------------
const { addItemInventoryDatabase, processMaterials } = require('@/utils/inventoryUtils');
const { checkInventorySync } = require('@/utils/characterUtils');
// Google Sheets functionality removed
const { handleInteractionError } = require('@/utils/globalErrorHandler');
const { enforceJail } = require('@/utils/jailCheck');


// ------------------- Embed Imports -------------------
const { createCraftingEmbed } = require('../../embeds/embeds.js');

// ------------------- External API Integrations -------------------
// Google Sheets functionality removed

// ------------------- Models and Constants -------------------
const generalCategories = require('@/models/GeneralItemCategories');

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
    // Remove quantity information and stamina info from item names if users copy-paste autocomplete text
    const itemName = itemNameRaw.replace(/\s*\(Qty:\s*\d+\)/i, '').replace(/\s*-\s*🟩\s*\d+\s*\|\s*Has:\s*\d+/i, '').trim();

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
        const { fetchModCharacterByNameAndUserId } = require('@/database/db');
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
      // (no longer required, but kept for compatibility)
      await checkInventorySync(character);

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
      // Allow testing in specific channel and any threads in that channel
      const testingChannelId = '1391812848099004578';
      const isTestingChannel = interaction.channelId === testingChannelId || interaction.channel?.parentId === testingChannelId;

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

      // ------------------- Fetch Village Level -------------------
      // Fetch village level for crafting bonuses (Level 2: 5-10% reduction, Level 3: 10-15% reduction)
      const villageName = capitalizeWords(character.currentVillage);
      const village = await Village.findOne({ name: villageName });
      const villageLevel = village?.level || 1;
      
      if (villageLevel === 1) {
        info('CRFT', `🏘️ Crafting in ${villageName} (Level ${villageLevel}) - No village-level crafting bonuses (Level 1 villages provide standard crafting)`);
      } else if (villageLevel === 2) {
        info('CRFT', `🏘️ Crafting in ${villageName} (Level ${villageLevel}) - Village bonuses active: 5-10% stamina & material cost reduction`);
      } else if (villageLevel === 3) {
        info('CRFT', `🏘️ Crafting in ${villageName} (Level ${villageLevel}) - Village bonuses active: 10-15% stamina & material cost reduction`);
      } else {
        info('CRFT', `🏘️ Crafting in ${villageName} (Level ${villageLevel}) - Unknown level, defaulting to Level 1 (no bonuses)`);
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
      info('CRFT', `Job determined for ${character.name}: "${job}" (type: ${typeof job}, voucher: ${character.jobVoucher ? 'yes' : 'no'})`);

      // ------------------- Validate Job Perks -------------------
      // Normalize job name for consistent comparison
      const jobNormalized = job ? job.trim() : '';
      const jobLower = jobNormalized.toLowerCase();
      info('CRFT', `Normalized job for ${character.name}: "${jobNormalized}" (lowercase: "${jobLower}")`);
      
      const jobPerk = getJobPerk(jobNormalized);
      info('CRFT', `Job perk lookup for "${jobNormalized}": ${jobPerk ? JSON.stringify(jobPerk) : 'null'}`);
      
      // Check 1: Verify job perk exists
      if (!jobPerk) {
        error('CRFT', `Job "${jobNormalized}" not found in job perks for ${character.name}`);
        const errorResponse = getJobVoucherErrorMessage('MISSING_SKILLS', {
          characterName: character.name,
          jobName: jobNormalized,
          activity: 'crafting'
        });
        return interaction.editReply({ 
          embeds: [errorResponse.embed],
          ephemeral: false 
        });
      }
      
      // Special handling for mod characters with ALL perks (Oracle, Sage, Dragon)
      const hasAllPerks = jobPerk.perks.includes('ALL');
      info('CRFT', `Has ALL perks: ${hasAllPerks}, perks array: ${JSON.stringify(jobPerk.perks)}`);
      
      // Check 2: Verify job has CRAFTING perk (unless it has ALL perks)
      if (!hasAllPerks && !jobPerk.perks.includes('CRAFTING')) {
        error('CRFT', `Job "${jobNormalized}" lacks CRAFTING perk for ${character.name}. Perks: ${JSON.stringify(jobPerk.perks)}`);
        const errorResponse = getJobVoucherErrorMessage('MISSING_SKILLS', {
          characterName: character.name,
          jobName: jobNormalized,
          activity: 'crafting'
        });
        return interaction.editReply({ 
          embeds: [errorResponse.embed],
          ephemeral: false 
        });
      }
      
      // Check 3: Verify item is craftable by this job
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
      info('CRFT', `Job field mapping for "${jobLower}": "${jobField}", item[${jobField}]: ${item[jobField]}`);
      
      const canCraftItem = hasAllPerks || (jobField && item[jobField] === true);
      info('CRFT', `Can craft item "${itemName}": ${canCraftItem} (hasAllPerks: ${hasAllPerks}, jobField: ${jobField}, item[jobField]: ${item[jobField]})`);
      
      if (!canCraftItem) {
        error('CRFT', `Item "${itemName}" is not craftable by job "${jobNormalized}" for ${character.name}. Item researcher field: ${item.researcher}, jobField: ${jobField}`);
        const errorResponse = getJobVoucherErrorMessage('MISSING_SKILLS', {
          characterName: character.name,
          jobName: jobNormalized,
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
      const originalStaminaCost = staminaCost; // Track original cost for display
      
      // ------------------- Apply Priest Stamina Reduction FIRST -------------------
      // Apply Priest boost to reduce stamina cost by 20% (applies before Teacher calculation)
      staminaCost = await applyCraftingStaminaBoost(freshCharacter.name, staminaCost);
      
      // ------------------- Check for Teacher Stamina Boost -------------------
      let teacherStaminaContribution = 0;
      let crafterStaminaCost = staminaCost;
      // Resolve booster: use boostedBy first, fall back to TempData if null (sync repair)
      let boosterName = freshCharacter.boostedBy;
      if (!boosterName) {
        const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(freshCharacter.name);
        const currentTime = Date.now();
        const notExpired = !activeBoost?.boostExpiresAt || currentTime <= activeBoost.boostExpiresAt;
        if (activeBoost && activeBoost.status === 'accepted' && activeBoost.category === 'Crafting' && activeBoost.boostingCharacter && notExpired) {
          boosterName = activeBoost.boostingCharacter;
          freshCharacter.boostedBy = boosterName;
          await freshCharacter.save();
          info('CRFT', `Restored boostedBy for ${freshCharacter.name} from TempData (boosted by ${boosterName})`);
        }
      }
      if (boosterName) {
        const { fetchCharacterByName } = require('@/database/db');
        const boosterCharacter = await fetchCharacterByName(boosterName);
        if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Teacher') {
          // Teacher can contribute up to 3 stamina (or half the reduced cost if less than 6)
          // Both characters split the stamina cost (after Priest reduction if active)
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
      
      // ------------------- Apply Village-Level Stamina Reduction -------------------
      // Apply village-level stamina reduction after Priest and Teacher boosts
      // Level 2: 5-10% reduction, Level 3: 10-15% reduction
      let villageStaminaReduction = 0;
      let villageStaminaSavings = 0;
      if (villageLevel === 2) {
        villageStaminaReduction = Math.random() * 0.05 + 0.05; // Random 5-10%
      } else if (villageLevel === 3) {
        villageStaminaReduction = Math.random() * 0.05 + 0.10; // Random 10-15%
      }
      
      if (villageStaminaReduction > 0) {
        const staminaBeforeVillageReduction = crafterStaminaCost;
        crafterStaminaCost = Math.max(1, Math.floor(crafterStaminaCost * (1 - villageStaminaReduction)));
        villageStaminaSavings = staminaBeforeVillageReduction - crafterStaminaCost;
        info('CRFT', `🏘️ Village Level ${villageLevel} Stamina Bonus: ${(villageStaminaReduction * 100).toFixed(1)}% reduction applied | ${staminaBeforeVillageReduction} stamina → ${crafterStaminaCost} stamina (Saved: ${villageStaminaSavings} stamina)`);
      } else {
        info('CRFT', `🏘️ Village Level ${villageLevel}: No stamina reduction bonus (Level 1 or below)`);
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
      // Apply Scholar boost to reduce material costs by 30% (only if total needed > 1)
      // Ensure item.craftingMaterial is an array before applying boost
      const originalCraftingMaterials = Array.isArray(item.craftingMaterial) ? item.craftingMaterial : [];
      let adjustedCraftingMaterials = await applyCraftingMaterialBoost(freshCharacter.name, originalCraftingMaterials, quantity);
      
      // Ensure adjustedCraftingMaterials is always an array (fallback to original if boost returns invalid result)
      if (!Array.isArray(adjustedCraftingMaterials)) {
        adjustedCraftingMaterials = originalCraftingMaterials;
      }
      
      // Calculate material savings from Scholar boost
      const materialSavings = [];
      if (adjustedCraftingMaterials.length > 0) {
        for (let i = 0; i < originalCraftingMaterials.length && i < adjustedCraftingMaterials.length; i++) {
          const original = originalCraftingMaterials[i];
          const adjusted = adjustedCraftingMaterials[i];
          const originalTotal = (original.quantity || 0) * quantity;
          const adjustedTotal = (adjusted.quantity || 0) * quantity;
          const savings = originalTotal - adjustedTotal;
          if (savings > 0) {
            materialSavings.push({
              itemName: original.itemName,
              saved: savings,
              originalTotal: originalTotal,
              adjustedTotal: adjustedTotal
            });
            info('CRFT', `Scholar material savings: ${original.itemName} - saved ${savings} (${originalTotal} → ${adjustedTotal})`);
          }
        }
      }

      // ------------------- Apply Village-Level Material Reduction -------------------
      // Apply village-level material reduction after Scholar boost
      // Level 2: 5-10% reduction, Level 3: 10-15% reduction
      let villageMaterialReduction = 0;
      let totalVillageMaterialSavings = 0; // Declared outside if block for summary log access
      if (villageLevel >= 2 && adjustedCraftingMaterials.length > 0) {
        villageMaterialReduction = villageLevel === 2 
          ? Math.random() * 0.05 + 0.05  // Random 5-10%
          : Math.random() * 0.05 + 0.10; // Random 10-15%
        
        const materialsBeforeVillageReduction = adjustedCraftingMaterials.map(m => ({ ...m }));
        adjustedCraftingMaterials = adjustedCraftingMaterials.map(material => ({
          ...material,
          quantity: Math.max(1, Math.ceil(material.quantity * (1 - villageMaterialReduction)))
        }));
        
        // Calculate and log village material savings
        for (let i = 0; i < materialsBeforeVillageReduction.length; i++) {
          const before = materialsBeforeVillageReduction[i];
          const after = adjustedCraftingMaterials[i];
          const beforeTotal = (before.quantity || 0) * quantity;
          const afterTotal = (after.quantity || 0) * quantity;
          const villageSavings = beforeTotal - afterTotal;
          
          if (villageSavings > 0) {
            totalVillageMaterialSavings += villageSavings;
            // Update materialSavings array to include village savings
            const existingSaving = materialSavings.find(m => m.itemName === before.itemName);
            if (existingSaving) {
              // Add village savings to existing Scholar savings
              existingSaving.saved += villageSavings;
              existingSaving.adjustedTotal = afterTotal;
            } else {
              // Add new entry for village-only savings
              materialSavings.push({
                itemName: before.itemName,
                saved: villageSavings,
                originalTotal: beforeTotal,
                adjustedTotal: afterTotal
              });
            }
            info('CRFT', `🏘️ Village Level ${villageLevel} Material Bonus: ${(villageMaterialReduction * 100).toFixed(1)}% reduction on ${before.itemName} | ${beforeTotal} → ${afterTotal} (Saved: ${villageSavings})`);
          }
        }
        
        if (totalVillageMaterialSavings > 0) {
          info('CRFT', `🏘️ Village Level ${villageLevel} Material Bonus Summary: ${(villageMaterialReduction * 100).toFixed(1)}% reduction applied | Total materials saved: ${totalVillageMaterialSavings}`);
        }
      } else if (villageLevel === 1) {
        info('CRFT', `🏘️ Village Level ${villageLevel}: No material reduction bonus (Level 1 villages provide standard material costs)`);
      }

      // ------------------- Village Level Crafting Bonus Summary -------------------
      if (villageLevel >= 2) {
        const bonusSummary = [];
        if (villageStaminaSavings > 0) {
          bonusSummary.push(`Stamina: ${villageStaminaSavings} saved`);
        }
        if (totalVillageMaterialSavings > 0) {
          bonusSummary.push(`Materials: ${totalVillageMaterialSavings} saved`);
        }
        if (bonusSummary.length > 0) {
          info('CRFT', `🏘️ Village Level ${villageLevel} Crafting Bonuses Applied: ${bonusSummary.join(' | ')}`);
        }
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
      // If materials processing is pending user selection, save state and stop here
      if (materialsUsed && typeof materialsUsed === 'object' && materialsUsed.status === 'pending') {
        // Save crafting state to continue after material selection
        const TempData = require('@/models/TempDataModel');
        const selectionId = materialsUsed.selectionId;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        console.log(`[crafting.js] [CRFT] Creating craftingContinue state - selectionId: ${selectionId}, ExpiresAt: ${expiresAt}, Character: ${character.name}, Item: ${itemName}`);
        const craftingState = {
          type: 'craftingContinue',
          key: selectionId,
          data: {
            userId: interaction.user.id,
            characterId: character._id,
            characterName: character.name,
            itemName: itemName,
            item: {
              itemName: item.itemName,
              emoji: item.emoji,
              category: item.category,
              staminaToCraft: item.staminaToCraft
            },
            quantity: quantity,
            flavorText: flavorText,
            staminaCost: staminaCost,
            originalStaminaCost: originalStaminaCost,
            crafterStaminaCost: crafterStaminaCost,
            teacherStaminaContribution: teacherStaminaContribution,
            materialSavings: materialSavings,
            adjustedCraftingMaterials: adjustedCraftingMaterials,
            interactionId: interaction.id,
            channelId: interaction.channelId,
            guildId: interaction.guildId,
            jobVoucher: character.jobVoucher,
            jobVoucherJob: character.jobVoucherJob,
            job: character.job
          },
          expiresAt: expiresAt
        };
        const savedState = await TempData.findOneAndUpdate(
          { type: 'craftingContinue', key: selectionId },
          craftingState,
          { upsert: true, new: true }
        );
        console.log(`[crafting.js] [CRFT] ✅ craftingContinue state saved - selectionId: ${selectionId}, Saved expiresAt: ${savedState?.expiresAt}, Has data: ${!!(savedState?.data)}`);
        
        // Update the craftingMaterialSelection state to include the craftingContinueSelectionId
        await TempData.findOneAndUpdate(
          { type: 'craftingMaterialSelection', key: selectionId },
          { $set: { 'data.craftingContinueSelectionId': selectionId } },
          { upsert: false }
        );
        console.log(`[crafting.js] [CRFT] Updated craftingMaterialSelection state with craftingContinueSelectionId: ${selectionId}`);
        
        return; // Handler will continue processing after user selection
      }

      // ------------------- Teacher Stamina: Booster must have manually used 2nd voucher (only if Teacher via voucher) -------------------
      if (teacherStaminaContribution > 0 && freshCharacter.boostedBy) {
        const { fetchCharacterByName } = require('@/database/db');
        const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
        const isBoosterNativeTeacher = boosterCharacter && boosterCharacter.job === 'Teacher' && !boosterCharacter.jobVoucher;
        if (!isBoosterNativeTeacher) {
          const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(freshCharacter.name);
          if (!activeBoost || !activeBoost.boosterUsedSecondVoucher) {
            const voucherError = getJobVoucherErrorMessage('BOOSTER_MUST_USE_SECOND_VOUCHER_FIRST', { boosterName: freshCharacter.boostedBy || 'Teacher', targetName: freshCharacter.name });
            const voucherEmbed = voucherError.embed.setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
            for (const mat of materialsUsed) {
              await addItemInventoryDatabase(character._id, mat.itemName, mat.quantity, interaction, 'Crafting Refund - Booster Must Use Second Voucher');
            }
            return interaction.editReply({ embeds: [voucherEmbed], content: '⚠️ **Materials have been refunded.**', flags: [MessageFlags.Ephemeral] });
          }
        }
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
          const { fetchCharacterByName } = require('@/database/db');
          const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
          if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Teacher') {
            teacherUpdatedStamina = await checkAndUseStamina(boosterCharacter, teacherStaminaContribution);
            success('CRFT', `Teacher stamina deducted for ${boosterCharacter.name} - remaining: ${teacherUpdatedStamina}`);
          }
        }
      } catch (staminaError) {
        error('CRFT', `Failed to deduct stamina: ${staminaError.message}`);
        handleInteractionError(staminaError, 'crafting.js');
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
        const { fetchCharacterByName } = require('@/database/db');
        const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
        if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Entertainer') {
          info('CRFT', `Entertainer boost active: Added 1 free ${itemName} for ${freshCharacter.name} (total: ${craftedQuantity})`);
        }
      }

      // ------------------- Send Crafting Embed -------------------
      let embed;
      try {
        // Ensure job string is always valid for flavor text
        const jobForFlavorText = (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job || '';
        // Use craftedQuantity (includes boosts) for display instead of original quantity
        // Check if Priest boost reduced stamina cost (compare original to after-Priest cost)
        const priestBoostActive = staminaCost < originalStaminaCost;
        const staminaSavings = priestBoostActive ? originalStaminaCost - staminaCost : 0;
        
        // Use the actual cost paid by crafter (after Teacher contribution if applicable)
        const displayStaminaCost = crafterStaminaCost;
        
        // Get Teacher boost info for display
        let teacherBoostInfo = null;
        if (teacherStaminaContribution > 0 && freshCharacter.boostedBy) {
          const { fetchCharacterByName } = require('@/database/db');
          const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
          if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Teacher') {
            teacherBoostInfo = {
              teacherName: boosterCharacter.name,
              teacherStaminaUsed: teacherStaminaContribution,
              crafterStaminaUsed: crafterStaminaCost,
              totalStaminaCost: staminaCost,
              teacherRemainingStamina: Math.max(0, teacherUpdatedStamina ?? boosterCharacter.currentStamina ?? 0)
            };
          }
        }
        
        embed = await createCraftingEmbed(
          item, character, flavorText, materialsUsed, craftedQuantity, displayStaminaCost, updatedStamina,
          jobForFlavorText, originalStaminaCost, staminaSavings, materialSavings, teacherBoostInfo
        );
      } catch (embedError) {
        // ------------------- Failsafe: Refund on Embed Error -------------------
        // Refund stamina
        await checkAndUseStamina(freshCharacter, -crafterStaminaCost); // Negative to add back
        if (teacherStaminaContribution > 0 && freshCharacter.boostedBy) {
          const { fetchCharacterByName } = require('@/database/db');
          const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
          if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Teacher') {
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

      // Check for Fortune Teller Crafting boost (Foresight in Sales) to tag items for 20% sale bonus
      let fortuneTellerBoostTag = null;
      if (freshCharacter.boostedBy) {
        const { fetchCharacterByName } = require('@/database/db');
        const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
        if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Fortune Teller') {
          // Verify the boost category is 'Crafting' (Foresight in Sales)
          const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(freshCharacter.name);
          if (activeBoost && activeBoost.status === 'accepted' && activeBoost.category === 'Crafting') {
            fortuneTellerBoostTag = 'Fortune Teller';
            info('CRFT', `Fortune Teller Crafting boost (Foresight in Sales) active: Tagging ${craftedQuantity} ${itemName} with fortuneTellerBoost tag for 20% sale bonus`);
          } else {
            info('CRFT', `Fortune Teller boost active but category is not Crafting (is: ${activeBoost?.category || 'none'}), skipping Foresight in Sales tag`);
          }
        }
      }
      
      const craftedAt = new Date();
      await addItemInventoryDatabase(character._id, item.itemName, craftedQuantity, interaction, 'Crafting', { craftedAt, fortuneTellerBoost: fortuneTellerBoostTag === 'Fortune Teller' });
      
      // Note: Google Sheets sync is handled by addItemInventoryDatabase

      // ------------------- Clear Boost After Use -------------------
      await clearBoostAfterUse(freshCharacter, {
        client: interaction.client,
        context: 'crafting'
      });

      // ------------------- Deactivate Booster's Second Job Voucher (Teacher Crafting) -------------------
      if (teacherStaminaContribution > 0 && freshCharacter.boostedBy) {
        const { fetchCharacterByName } = require('@/database/db');
        const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
        if (boosterCharacter && boosterCharacter.jobVoucher) {
          const deactivationResult = await deactivateJobVoucher(boosterCharacter._id, { afterUse: true });
          if (!deactivationResult.success) {
            error('CRFT', `Failed to deactivate booster job voucher for ${boosterCharacter.name} after craft`);
          } else {
            info('CRFT', `Booster job voucher deactivated for ${boosterCharacter.name} after Teacher Crafting use`);
          }
        }
      }

      await interaction.editReply({ content: `✅ **Successfully crafted ${quantity} "${itemName}".**`, flags: [MessageFlags.Ephemeral] });
      await interaction.followUp({ embeds: [embed], ephemeral: false });

      // ------------------- Activate and Deactivate Job Voucher AFTER Crafting Success -------------------
      if (character.jobVoucher && !voucherCheck?.skipVoucher && jobVoucherItem) {
        const activationResult = await activateJobVoucher(character, job, jobVoucherItem, 1, interaction);
        if (!activationResult.success) {
          error('CRFT', `Failed to activate job voucher for ${character.name}`);
        } else {
          const deactivationResult = await deactivateJobVoucher(character._id, { afterUse: true });
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
            const { fetchCharacterByName } = require('@/database/db');
            const boosterCharacter = await fetchCharacterByName(freshCharacter.boostedBy);
            if (boosterCharacter && getEffectiveJob(boosterCharacter) === 'Teacher') {
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
