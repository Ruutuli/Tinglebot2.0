// ------------------- Standard Libraries -------------------
// Modules from Node.js ecosystem or third-party packages for core functionality.
const { v4: uuidv4 } = require('uuid');

// ------------------- Discord.js Components -------------------
// Imports from discord.js and builders for creating slash commands and embeds.
const { SlashCommandBuilder } = require('@discordjs/builders');
const { EmbedBuilder } = require('discord.js');

// ------------------- Database Services -------------------
// Functions to fetch and update data from the database (characters, items, inventory).
const {
  fetchCharacterByNameAndUserId,
  fetchModCharacterByNameAndUserId,
  fetchItemByName,
  getCharacterInventoryCollection,
  updateCharacterById,
  updateModCharacterById
} = require('@/database/db');

// ------------------- Custom Modules -------------------
// Application-specific modules: character stats, job perks, formatting helpers, location emojis.
const { healKoCharacter, updateCurrentHearts, updateCurrentStamina } = require('../../modules/characterStatsModule');
const { getJobPerk } = require('../../modules/jobsModule');
const { capitalizeWords } = require('../../modules/formattingModule');
const { getVillageEmojiByName } = require('../../modules/locationsModule');
const { createDebuffEmbed, getExploreCommandId } = require('../../embeds/embeds.js');
const { advanceRaidTurnOnItemUse } = require('../../modules/raidModule');
const { getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');
const { getPetTypeData, getPetEmoji, getRollsDisplay } = require('../../modules/petModule');
const { applyElixirBuff, getElixirInfo, removeExpiredBuffs, ELIXIR_EFFECTS } = require('../../modules/elixirModule');

// ------------------- Utility Functions -------------------
// General-purpose utilities: error handling, inventory utils.
const { handleInteractionError, ERROR_RESPONSE_TYPES } = require('@/utils/globalErrorHandler');
const { removeItemInventoryDatabase, syncToInventoryDatabase, addItemInventoryDatabase, escapeRegExp } = require('@/utils/inventoryUtils');
const { checkInventorySync } = require('@/utils/characterUtils');
const { enforceJail } = require('@/utils/jailCheck');

// ------------------- Database Models -------------------
const User = require('@/models/UserModel');
const Pet = require('@/models/PetModel');
const Party = require('@/models/PartyModel');
const Raid = require('@/models/RaidModel');

// ------------------- Command Definition -------------------
// Defines the /item command schema and its execution logic.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('item')
    .setDescription('Use an item for various purposes')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of your character')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('itemname')
        .setDescription('The item to use')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option.setName('quantity')
        .setDescription('The number of items to use')
        .setRequired(false)
        .setMinValue(1)
    )
    .addStringOption(option =>
      option.setName('jobname')
        .setDescription('The job to perform using the voucher')
        .setRequired(false)
        .setAutocomplete(true)
    ),

  // ------------------- Execute Handler -------------------
  // Orchestrates the command flow: validation, business logic, side-effects, and response.
  async execute(interaction) {
    await interaction.deferReply({ flags: [] });

    const characterName = interaction.options.getString('charactername');
    const itemName = interaction.options.getString('itemname');
    const quantity = interaction.options.getInteger('quantity') || 1;

    try {
      // ------------------- Fetch Records -------------------
      // Retrieve character and item data; bail out if missing.
      let character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
      
      // If not found as regular character, try as mod character
      if (!character) {
        character = await fetchModCharacterByNameAndUserId(characterName, interaction.user.id);
      }
      
      if (!character) {
        await interaction.editReply({
          embeds: [{
            color: 0xFF0000,
            title: '❌ Character Not Found',
            description: `The character **"${characterName}"** was not found or does not belong to you.\n\n**Possible issues:**\n• Character name may be misspelled\n• Character may not exist\n• Character may belong to another user\n• Try using the autocomplete feature for accurate character names`,
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Character Validation Error'
            }
          }],
          ephemeral: true
        });
        return;
      }

      // Check if character is in jail
      if (await enforceJail(interaction, character)) {
        return;
      }

      // ------------------- Channel Restriction Check -------------------
      // Items command can only be used in townhall channels, community board, or their threads
      const COMMUNITY_BOARD_CHANNEL_ID = process.env.COMMUNITY_BOARD_CHANNEL_ID || '651614266046152705';
      const TOWNHALL_CHANNELS = [
        process.env.RUDANIA_TOWNHALL,
        process.env.INARIKO_TOWNHALL,
        process.env.VHINTL_TOWNHALL
      ].filter(Boolean);
      const ALLOWED_CHANNELS = [COMMUNITY_BOARD_CHANNEL_ID, ...TOWNHALL_CHANNELS];
      const TESTING_CHANNEL_ID = '1391812848099004578';
      
      const channelId = interaction.channelId;
      const parentId = interaction.channel?.parentId;
      
      const isAllowedChannel = ALLOWED_CHANNELS.includes(channelId);
      const isThreadInAllowedChannel = parentId && ALLOWED_CHANNELS.includes(parentId);
      const isTestingChannel = channelId === TESTING_CHANNEL_ID || parentId === TESTING_CHANNEL_ID;
      
      if (!isAllowedChannel && !isThreadInAllowedChannel && !isTestingChannel) {
        const channelMentions = ALLOWED_CHANNELS.map(id => `<#${id}>`).join(', ');
        await interaction.editReply({
          embeds: [{
            color: 0xFF0000,
            title: '❌ Wrong Channel',
            description: `The \`/item\` command can only be used in townhall channels or the community board.`,
            fields: [
              {
                name: 'Allowed Channels',
                value: channelMentions
              },
              {
                name: 'Threads',
                value: 'You can also use this command in threads within these channels.'
              }
            ],
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Channel Validation'
            }
          }],
          ephemeral: true
        });
        return;
      }

      // Clean the itemName to remove emoji prefixes and quantity suffixes
      // Handles formats like:
      // - "📦 Fairy - Qty: 1" -> "Fairy"
      // - "Fairy (Qty: 1)" -> "Fairy"
      // - "Job Voucher - Qty: 2" -> "Job Voucher"
      let cleanItemName = itemName
        // Remove emoji prefixes (📦, 🔨, 🔮, etc.) - common emojis used in autocomplete
        .replace(/^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]\s*/u, '')
        // Remove quantity in parentheses format: "(Qty: 1)" or "(Qty:1)"
        .replace(/\s*\(Qty:\s*\d+\s*\)/gi, '')
        // Remove quantity in dash format: " - Qty: 1" or "- Qty:1"
        .replace(/\s*-\s*Qty:\s*\d+\s*$/i, '')
        .trim();
      
      // Normalize common compound item names that may be missing spaces
      const commonItemSpaces = {
        'jobvoucher': 'Job Voucher',
        'characterslotvoucher': 'Character Slot Voucher',
        'chuchuegg': 'Chuchu Egg',
        'chuchujelly': 'Chuchu Jelly'
      };
      
      // Try to match item name with common space patterns
      const lowerItemName = cleanItemName.toLowerCase().replace(/\s+/g, '');
      if (commonItemSpaces[lowerItemName]) {
        cleanItemName = commonItemSpaces[lowerItemName];
      }
      
      const item = await fetchItemByName(cleanItemName, {
        commandName: interaction.commandName,
        userTag: interaction.user?.tag,
        userId: interaction.user?.id,
        operation: 'inventory_item_lookup'
      });
      if (!item) {
        return void await interaction.editReply({
          embeds: [{
            color: 0xFF0000,
            title: '❌ Item Not Found',
            description: `The item **"${cleanItemName}"** does not exist in the database.\n\n**What you entered:** ${itemName}\n**What was searched:** ${cleanItemName}\n\n**Possible issues:**\n• Item name may be misspelled\n• Item may not exist in the game\n• Try using the autocomplete feature for accurate item names`,
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Item Validation Error'
            }
          }],
          ephemeral: true
        });
      }

      // ------------------- Inventory Initialization -------------------
      // Ensure the character has an inventory collection set up.
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      if (!inventoryCollection) {
        return void await interaction.editReply({
          embeds: [{
            color: 0xFF0000,
            title: '❌ Inventory Not Set Up',
            description: `${character.name} does not have an inventory initialized.\n\n**To fix this:**\n• Use the inventory command to set up your character's inventory\n• Contact a moderator if you need assistance`,
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Inventory Setup Required'
            }
          }],
          ephemeral: true
        });
      }

      // ------------------- Ownership Validation -------------------
      // Confirm the character owns enough of the requested item.
      const inventoryItems = await inventoryCollection.find().toArray();
      
      // Use the already cleaned item name for inventory lookup
      const cleanItemNameForInventory = cleanItemName.toLowerCase();
      
      // Sum only positive quantities (ignore invalid/negative entries)
      const totalQuantity = inventoryItems
        .filter(invItem => invItem.itemName?.toLowerCase() === cleanItemNameForInventory)
        .reduce((sum, invItem) => sum + Math.max(0, invItem.quantity || 0), 0);
      
      // Find the first item entry with positive quantity for display/checks (ignore negative rows)
      const ownedItem = inventoryItems.find(invItem =>
        invItem.itemName?.toLowerCase() === cleanItemNameForInventory && (invItem.quantity || 0) > 0
      );
      
      // Skip inventory check for mod characters using job vouchers
      const isModCharacterUsingJobVoucher = character.isModCharacter && item.itemName.toLowerCase() === 'job voucher';
      
      if (!isModCharacterUsingJobVoucher && (!ownedItem || totalQuantity < quantity)) {
        return void await interaction.editReply({
          embeds: [{
            color: 0xFF0000,
            title: '❌ Insufficient Items',
            description: `*${character.name} looks through their inventory, confused...*\n\n**Item Not Found**\n${character.name} does not have enough "${capitalizeWords(cleanItemNameForInventory)}" in their inventory.\n\n**Available:** ${totalQuantity}\n**Requested:** ${quantity}`,
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Inventory'
            }
          }],
          ephemeral: true
        });
      }

      // ------------------- Block /item when character is in an active expedition -------------------
      // Must use /explore item in the expedition thread instead; no /item use allowed while exploring.
      const activeExpedition = await Party.findOne({
        status: 'started',
        'characters._id': character._id,
      }).lean();
      if (activeExpedition) {
        const exploreItemCmd = `</explore item:${getExploreCommandId()}>`;
        const errorEmbed = new EmbedBuilder()
          .setColor(0xff6600)
          .setTitle('🗺️ Cannot use /item while on an expedition')
          .setDescription(
            `**${character.name}** is currently on an active expedition. You cannot use the general \`/item\` command for this character while they are exploring.\n\n` +
            `Use **${exploreItemCmd}** in the expedition thread when it's your turn and the embed offers the **Item** action.`
          )
          .setFooter({ text: 'Take your turn with /explore roll or /explore item in the expedition.' });
        return void await interaction.editReply({ embeds: [errorEmbed] });
      }

      // ------------------- Job Voucher Handling -------------------
      // Specialized logic for 'Job Voucher' item: job assignment, perk display, Google Sheets logging.
      if (item.itemName.toLowerCase() === 'job voucher') {
        // Force quantity to 1 for job vouchers
        if (quantity !== 1) {
          return void await interaction.editReply({
            embeds: [{
              color: 0xAA926A,
              title: '🎫 Job Voucher Usage',
              description: '❌ **Job Vouchers can only be used one at a time.**\nPlease use a quantity of 1.',
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Job Voucher System'
              }
            }]
          });
        }

        // Mod characters can use job vouchers without consuming them
        if (character.isModCharacter) {
          const jobName = interaction.options.getString('jobname');
          if (!jobName) {
            const { embed } = getJobVoucherErrorMessage('NO_JOB_SPECIFIED');
            return void await interaction.editReply({ embeds: [embed], ephemeral: true });
          }

          const jobPerkInfo = getJobPerk(jobName);
          if (!jobPerkInfo) {
            return void await interaction.editReply({
              embeds: [{
                color: 0xFF0000,
                title: '❌ Invalid Job',
                description: `The job **"${capitalizeWords(jobName)}"** is not valid.\n\n**What you entered:** ${jobName}\n\n**To fix this:**\n• Use the autocomplete feature to select a valid job\n• Check the spelling of the job name\n• Ensure the job exists in the game`,
                image: {
                  url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
                },
                footer: {
                  text: 'Job Validation Error'
                }
              }],
              ephemeral: true
            });
          }

          // Check if the job is restricted from job vouchers (even for mod characters)
          const restrictedJobs = ['shopkeeper', 'stablehand', 'merchant'];
          if (restrictedJobs.includes(jobName.toLowerCase())) {
            return void await interaction.editReply({
              embeds: [{
                color: 0xFF0000,
                title: '❌ Job Voucher Restriction',
                description: `The **${capitalizeWords(jobName)}** job cannot be used with Job Vouchers.\n\n**Restricted Jobs:**\n• Shopkeeper\n• Stablehand\n• Merchant\n\n**Why?** These jobs require permanent establishment and cannot be performed temporarily.`,
                image: {
                  url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
                },
                footer: {
                  text: 'Job Voucher System'
                }
              }],
              ephemeral: true
            });
          }

          // --- Location/Village validation for village-locked jobs ---
          if (jobPerkInfo.village) {
            const requiredVillage = jobPerkInfo.village.toLowerCase().trim();
            const characterVillage = character.currentVillage?.toLowerCase().trim();
            if (characterVillage !== requiredVillage) {
              return void await interaction.editReply({
                embeds: [{
                  color: 0xFF0000,
                  title: '❌ Job Voucher Error',
                  description: `${character.name} must be in ${capitalizeWords(jobPerkInfo.village)} to use this job voucher.`,
                  fields: [
                    { name: 'Current Location', value: capitalizeWords(character.currentVillage), inline: true },
                    { name: 'Required Location', value: capitalizeWords(jobPerkInfo.village), inline: true }
                  ],
                  image: {
                    url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
                  },
                  footer: {
                    text: 'Location Requirement'
                  }
                }],
                ephemeral: true
              });
            }
          }

          // Activate job voucher for mod character (without consuming the voucher)
          console.log(`[item.js] Mod character job voucher activation - Before update:`, {
            characterId: character._id,
            jobVoucher: character.jobVoucher,
            jobVoucherJob: character.jobVoucherJob,
            isModCharacter: character.isModCharacter
          });
          
          // Use the appropriate update function based on character type
          const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
          const updatedCharacter = await updateFunction(character._id, { jobVoucher: true, jobVoucherJob: jobName });
          
          console.log(`[item.js] Mod character job voucher activation - After update:`, {
            updatedCharacter: updatedCharacter ? {
              jobVoucher: updatedCharacter.jobVoucher,
              jobVoucherJob: updatedCharacter.jobVoucherJob
            } : null
          });
          
          // Update the character object with the new values
          if (updatedCharacter) {
            character.jobVoucher = updatedCharacter.jobVoucher;
            character.jobVoucherJob = updatedCharacter.jobVoucherJob;
          }
          
          console.log(`[item.js] Mod character job voucher activation - Final character object:`, {
            jobVoucher: character.jobVoucher,
            jobVoucherJob: character.jobVoucherJob
          });

          // Log job voucher usage to Google Sheets (but don't remove from inventory)
          const inventoryLink = character.inventory || character.inventoryLink;
          if (typeof inventoryLink === 'string') {
            const { category = [], type = [], subtype = [] } = item;
            const formattedDateTime = new Date().toISOString();
            const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
            const values = [[
              character.name,
              'Job Voucher',
              '0', // No quantity change for mod characters
              Array.isArray(category) ? category.join(', ') : category,
              Array.isArray(type) ? type.join(', ') : type,
              Array.isArray(subtype) ? subtype.join(', ') : subtype,
              `Used for job voucher: ${jobName} (Mod Character - No Consumption)`,
              character.job,
              '',
              character.currentVillage,
              interactionUrl,
              formattedDateTime,
              ''
            ]];
            // Google Sheets sync removed
          }

          // Build and send voucher embed for mod character
          const currentVillage = capitalizeWords(character.currentVillage || 'Unknown');
          const villageEmoji = getVillageEmojiByName(currentVillage) || '🌍';
          
          // Create clickable command links with proper formatting
          const commandLinks = [];
          if (jobPerkInfo.perks.includes('GATHERING')) {
            commandLinks.push('🔍 **Gathering:** </gather:1372378304773881885>');
          }
          if (jobPerkInfo.perks.includes('CRAFTING')) {
            commandLinks.push('⚒️ **Crafting:** </crafting:1379838613067530387>');
          }
          if (jobPerkInfo.perks.includes('LOOTING')) {
            commandLinks.push('💎 **Looting:** </loot:1372378304773881887>');
          }
          if (jobPerkInfo.perks.includes('HEALING')) {
            commandLinks.push('💚 **Healing:** </heal fulfill:1372378304773881886>');
          }

          // Build enhanced description with better formatting
          let enhancedDescription = `👑 **${character.name}** has activated a **Job Voucher**!\n\n`;
          enhancedDescription += `**📋 Temporary Job:** ${capitalizeWords(jobName)}\n`;
          if (jobPerkInfo.perks?.length) {
            enhancedDescription += `**✨ Available Perks:** ${jobPerkInfo.perks.map(perk => `\`${perk}\``).join(', ')}\n`;
          }
          enhancedDescription += `\n**🎯 Available Commands:**\n${commandLinks.join('\n')}`;

          const voucherEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('👑 Mod Character - Job Voucher Activated!')
            .setDescription(enhancedDescription)
            .addFields(
              { 
                name: `${villageEmoji} Current Village`, 
                value: `**${currentVillage}**`, 
                inline: true 
              },
              { 
                name: '🏷️ Normal Job', 
                value: `**${capitalizeWords(character.job || 'Unemployed')}**`, 
                inline: true 
              },
              { 
                name: '👑 Mod Status', 
                value: `**${character.modTitle} of ${character.modType}**`, 
                inline: true 
              },
              {
                name: '⏰ Duration',
                value: '**Until next job use**',
                inline: true
              },
              { 
                name: '💎 Voucher Status', 
                value: `**Not Consumed** (Mod Character Benefit)`, 
                inline: false 
              }
            )
            .setThumbnail(item.image || 'https://via.placeholder.com/150')
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setFooter({ text: '✨ Mod characters can use job vouchers without consuming them! Click the commands above to start working!' });

          return void await interaction.editReply({ embeds: [voucherEmbed] });
        }

        if (character.jobVoucher) {
          return void await interaction.editReply({
            embeds: [{
              color: 0xFF0000,
              title: '❌ Job Voucher Error',
              description: `**${character.name}** already has an active Job Voucher for **${character.jobVoucherJob}**.\n\nPlease complete the current job before using another voucher.`,
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Job Voucher System'
              }
            }]
          });
        }

        const jobName = interaction.options.getString('jobname');
        if (!jobName) {
          // ============================================================================
          // ------------------- Job Voucher: No Job Specified Error -------------------
          // Show embed with instructions if no job is specified
          // ============================================================================
          const { embed } = getJobVoucherErrorMessage('NO_JOB_SPECIFIED');
          return void await interaction.editReply({ embeds: [embed], ephemeral: true });
        }

        const jobPerkInfo = getJobPerk(jobName);
        if (!jobPerkInfo) {
          return void await interaction.editReply({
            embeds: [{
              color: 0xFF0000,
              title: '❌ Invalid Job',
              description: `The job **"${capitalizeWords(jobName)}"** is not valid.\n\n**What you entered:** ${jobName}\n\n**To fix this:**\n• Use the autocomplete feature to select a valid job\n• Check the spelling of the job name\n• Ensure the job exists in the game`,
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Job Validation Error'
              }
            }],
            ephemeral: true
          });
        }

        // Check if the job is restricted from job vouchers
        const restrictedJobs = ['shopkeeper', 'stablehand', 'merchant'];
        if (restrictedJobs.includes(jobName.toLowerCase())) {
          return void await interaction.editReply({
            embeds: [{
              color: 0xFF0000,
              title: '❌ Job Voucher Restriction',
              description: `The **${capitalizeWords(jobName)}** job cannot be used with Job Vouchers.\n\n**Restricted Jobs:**\n• Shopkeeper\n• Stablehand\n• Merchant\n\n**Why?** These jobs require permanent establishment and cannot be performed temporarily.`,
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Job Voucher System'
              }
            }],
            ephemeral: true
          });
        }

        // --- Location/Village validation for village-locked jobs ---
        if (jobPerkInfo.village) {
          const requiredVillage = jobPerkInfo.village.toLowerCase().trim();
          const characterVillage = character.currentVillage?.toLowerCase().trim();
          if (characterVillage !== requiredVillage) {
            return void await interaction.editReply({
              embeds: [{
                color: 0xFF0000,
                title: '❌ Job Voucher Error',
                description: `${character.name} must be in ${capitalizeWords(jobPerkInfo.village)} to use this job voucher.`,
                fields: [
                  { name: 'Current Location', value: capitalizeWords(character.currentVillage), inline: true },
                  { name: 'Required Location', value: capitalizeWords(jobPerkInfo.village), inline: true }
                ],
                image: {
                  url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
                },
                footer: {
                  text: 'Location Requirement'
                }
              }],
              ephemeral: true
            });
          }
        }

        // --- Only now activate voucher and remove from inventory ---
        // Use the appropriate update function based on character type
        const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
        const updatedCharacter = await updateFunction(character._id, { jobVoucher: true, jobVoucherJob: jobName });
        // Update the character object with the new values
        if (updatedCharacter) {
          character.jobVoucher = updatedCharacter.jobVoucher;
          character.jobVoucherJob = updatedCharacter.jobVoucherJob;
        }
        await removeItemInventoryDatabase(character._id, 'Job Voucher', 1, interaction, `Used for job voucher: ${jobName}`);

        // If this character is the booster of an active Teacher Crafting boost, mark second voucher as used (they used the standard command twice)
        const jobNameNormalized = (jobName || '').trim().toLowerCase();
        if (jobNameNormalized === 'teacher') {
          const { retrieveBoostingRequestFromTempDataByBooster, saveBoostingRequestToTempData } = require('../jobs/boosting');
          const activeBoost = await retrieveBoostingRequestFromTempDataByBooster(character.name);
          if (activeBoost && activeBoost.category === 'Crafting' && !activeBoost.boosterUsedSecondVoucher) {
            activeBoost.boosterUsedSecondVoucher = true;
            await saveBoostingRequestToTempData(activeBoost.boostRequestId, activeBoost);
          }
        }

        // ------------------- Build and Send Voucher Embed -------------------
        const currentVillage = capitalizeWords(character.currentVillage || 'Unknown');
        const villageEmoji = getVillageEmojiByName(currentVillage) || '🌍';
        let description = `**${character.name}** has used a Job Voucher to perform the **${capitalizeWords(jobName)}** job.`;
        if (jobPerkInfo.perks?.length) {
          description = `**${character.name}** has used a Job Voucher to perform the **${capitalizeWords(jobName)}** job with the following perk(s): **${jobPerkInfo.perks.join(', ')}**.`;
        }
        // Create clickable command links with proper formatting
        const commandLinks = [];
        
        // Handle perks that may contain multiple values separated by "/"
        const allPerks = jobPerkInfo.perks.flatMap(perk => perk.split(' / '));
        
        // Special case for "ALL" perk - show all available commands
        if (allPerks.includes('ALL')) {
          commandLinks.push('🔍 **Gathering:** </gather:1372378304773881885>');
          commandLinks.push('⚒️ **Crafting:** </crafting:1379838613067530387>');
          commandLinks.push('💎 **Looting:** </loot:1372378304773881887>');
          commandLinks.push('💚 **Healing:** </heal fulfill:1372378304773881886>');
          commandLinks.push(' **Stealing:** </steal commit:1400281065674903612>');
          commandLinks.push('📦 **Delivering:** </deliver:1372378304773881888>');
          commandLinks.push('🏪 **Vending:** </vending:1372378304773881889>');
          commandLinks.push('🚀 **Boosting:** </boosting:1372378304773881890>');
        } else {
          // Regular perk handling
          if (allPerks.includes('GATHERING')) {
            commandLinks.push('🔍 **Gathering:** </gather:1372378304773881885>');
          }
          if (allPerks.includes('CRAFTING')) {
            commandLinks.push('⚒️ **Crafting:** </crafting:1379838613067530387>');
          }
          if (allPerks.includes('LOOTING')) {
            commandLinks.push('💎 **Looting:** </loot:1372378304773881887>');
          }
          if (allPerks.includes('HEALING')) {
            commandLinks.push('💚 **Healing:** </heal fulfill:1372378304773881886>');
          }
          if (allPerks.includes('STEALING')) {
            commandLinks.push(' **Stealing:** </steal commit:1400281065674903612>');
          }
          if (allPerks.includes('DELIVERING')) {
            commandLinks.push('📦 **Delivering:** </deliver:1372378304773881888>');
          }
          if (allPerks.includes('VENDING')) {
            commandLinks.push('🏪 **Vending:** </vending:1372378304773881889>');
          }
          if (allPerks.includes('BOOST')) {
            commandLinks.push('🚀 **Boosting:** </boosting:1372378304773881890>');
          }
        }

        // Build enhanced description with better formatting
        let enhancedDescription = `🎫 **${character.name}** has activated a **Job Voucher**!\n\n`;
        enhancedDescription += `**📋 Temporary Job:** ${capitalizeWords(jobName)}\n`;
        if (jobPerkInfo.perks?.length) {
          enhancedDescription += `**✨ Available Perks:** ${jobPerkInfo.perks.map(perk => `\`${perk}\``).join(', ')}\n`;
        }
        enhancedDescription += `\n**🎯 Available Commands:**\n${commandLinks.join('\n')}`;

        const voucherEmbed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🎫 Job Voucher Activated!')
          .setDescription(enhancedDescription)
          .addFields(
            { 
              name: `${villageEmoji} Current Village`, 
              value: `**${currentVillage}**`, 
              inline: true 
            },
            { 
              name: '🏷️ Normal Job', 
              value: `**${capitalizeWords(character.job || 'Unemployed')}**`, 
              inline: true 
            }
          )
          .setThumbnail(item.image || 'https://via.placeholder.com/150')
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: '✨ Click the commands above to start working in your new role!' });

        return void await interaction.editReply({ embeds: [voucherEmbed] });
      }

      // ------------------- Character Slot Voucher Handling -------------------
      // Specialized logic for 'Character Slot Voucher' item: adds character slots to user
      if (item.itemName.toLowerCase() === 'character slot voucher') {
        // Find or create user record
        let user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
          user = new User({
            discordId: interaction.user.id,
            characterSlot: quantity, // Just add the vouchers, User model handles default 2
            status: 'active'
          });
        } else {
          user.characterSlot = (user.characterSlot || 0) + quantity;
        }

        await user.save();

        // Remove the vouchers from inventory
        await removeItemInventoryDatabase(character._id, 'Character Slot Voucher', quantity, interaction, `Used ${quantity} character slot voucher(s)`);

                 // ------------------- Build and Send Voucher Embed -------------------
         const voucherEmbed = new EmbedBuilder()
           .setColor('#FFD700')
           .setTitle('🎫 Character Slot Voucher Activated!')
           .setDescription(
             `**${interaction.user.username}** has used **${quantity} Character Slot Voucher${quantity > 1 ? 's' : ''}** to increase their character slot capacity!\n\n` +
             `You now have **${user.characterSlot}** total character slots available.`
           )
          .addFields(
            { name: '👤 Character Slots', value: `**${user.characterSlot}** total slots`, inline: true },
            { name: '🎫 Vouchers Used', value: `**${quantity}** Character Slot Voucher${quantity > 1 ? 's' : ''}`, inline: true }
          )
          .setThumbnail(item.image || 'https://via.placeholder.com/150')
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: '✨ You can now create more characters! Create them at https://tinglebot.xyz/character-create.html' });

        return void await interaction.editReply({ embeds: [voucherEmbed] });
      }

      // ------------------- Chuchu Egg Handling -------------------
      // Specialized logic for 'Chuchu Egg' item: hatches egg and gives character a pet
      if (item.itemName.toLowerCase() === 'chuchu egg') {
        // Force quantity to 1 for chuchu eggs
        if (quantity !== 1) {
          return void await interaction.editReply({
            embeds: [{
              color: 0xFF6B35,
              title: '🥚 Chuchu Egg Usage',
              description: '❌ **Chuchu Eggs can only be used one at a time.**\nPlease use a quantity of 1.',
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Pet System'
              }
            }]
          });
        }

        // Check if character already has an active pet
        const existingActivePet = await Pet.findOne({ owner: character._id, status: 'active' });
        if (existingActivePet) {
          return void await interaction.editReply({
            embeds: [{
              color: 0xFF6B35,
              title: '❌ Active Pet Found',
              description: `${character.name} already has an active pet and cannot hatch another Chuchu Egg at this time.`,
              fields: [
                { 
                  name: '🐾 Current Active Pet', 
                  value: `\`${existingActivePet.name}\` the ${existingActivePet.species}`, 
                  inline: true 
                },
                { 
                  name: '📋 Pet Type', 
                  value: `\`${existingActivePet.petType}\``, 
                  inline: true 
                },
                { 
                  name: '📊 Level', 
                  value: `Level ${existingActivePet.level}`, 
                  inline: true 
                }
              ],
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Please store your pet in the stables (feature coming soon) before hatching a new one'
              }
            }],
            ephemeral: true
          });
        }

        // Generate a normal Chuchu type (not elemental variants)
        const chuchuType = 'Chuchu';
        
        // Generate a random pet name for normal Chuchu
        const chuchuNames = ['Bubble', 'Squish', 'Bounce', 'Jelly', 'Blob', 'Squirt', 'Pop', 'Splash', 'Drip', 'Gel'];
        const randomPetName = chuchuNames[Math.floor(Math.random() * chuchuNames.length)];
        
        // Get pet type data
        const petTypeData = getPetTypeData(chuchuType);
        
        if (!petTypeData) {
          return void await interaction.editReply({
            embeds: [{
              color: 0xFF0000,
              title: '❌ Chuchu Egg Error',
              description: 'An error occurred while processing the Chuchu Egg.\n\n**What went wrong:**\n• Invalid Chuchu type was generated\n• Pet type data could not be found\n\n**To fix this:**\n• Please try using the Chuchu Egg again\n• If the problem persists, contact a moderator',
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Pet System Error'
              }
            }],
            ephemeral: true
          });
        }

        // Create the new pet
        const newPet = await Pet.create({
          ownerName: character.name,
          owner: character._id,
          name: randomPetName,
          species: chuchuType.toLowerCase(),
          petType: chuchuType,
          level: 1,
          rollsRemaining: 1,
          imageUrl: 'https://cdn.wikimg.net/en/zeldawiki/images/thumb/c/c3/TotK_Chuchu_Model.png/1200px-TotK_Chuchu_Model.png',
          rollCombination: petTypeData.rollCombination,
          tableDescription: petTypeData.description,
          discordId: character.userId
        });
        
        // Set as current active pet
        await updateCharacterById(character._id, { currentActivePet: newPet._id });

        // Remove the egg from inventory
        await removeItemInventoryDatabase(character._id, 'Chuchu Egg', 1, interaction, `Hatched into ${randomPetName} the ${chuchuType}`);

        // ------------------- Build and Send Hatching Embed -------------------
        const petEmoji = getPetEmoji(chuchuType.toLowerCase());
        const rollsDisplay = getRollsDisplay(0, 1); // Level 1 pet

        // Determine embed color based on village
        const villageName = character.currentVillage.charAt(0).toUpperCase() + character.currentVillage.slice(1).toLowerCase();
        const villageColors = {
          Rudania: "#d7342a",
          Inariko: "#277ecd",
          Vhintl: "#25c059",
        };
        const embedColor = villageColors[villageName] || "#00FF00";

        const hatchingEmbed = new EmbedBuilder()
          .setColor(embedColor)
          .setTitle('🥚 Chuchu Egg Hatched!')
          .setDescription(
            `**${character.name}** has successfully hatched a **Chuchu Egg**!\n\n` +
            `A new **${chuchuType}** has emerged and bonded with ${character.name}!\n\n` +
            `🎉 **Welcome ${randomPetName}!** Use /pet edit to give your Chuchu a custom name!`
          )
          .addFields(
            { name: '__Pet Name__', value: `> ${randomPetName}`, inline: true },
            { name: '__Owner__', value: `> ${character.name}`, inline: true },
            { name: '__Village__', value: `> ${character.currentVillage}`, inline: true },
            { name: '__Pet Species__', value: `> ${petEmoji} ${chuchuType}`, inline: true },
            { name: '__Pet Type__', value: `> ${chuchuType}`, inline: true },
            { name: '__Status__', value: `> 🟢 Active`, inline: true },
            { name: '__Current Level__', value: `> Level 1`, inline: true },
            { name: '__Rolls Available__', value: `> ${rollsDisplay}`, inline: true },
            { name: '🎲 Available Roll Types', value: petTypeData.rollCombination.join(', '), inline: false },
            { name: '📝 Pet Description', value: petTypeData.description, inline: false }
          )
          .setThumbnail('https://cdn.wikimg.net/en/zeldawiki/images/thumb/c/c3/TotK_Chuchu_Model.png/1200px-TotK_Chuchu_Model.png')
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ 
            text: `Pet System`,
            iconURL: character.icon
          });

        return void await interaction.editReply({ embeds: [hatchingEmbed] });
      }

      // ------------------- Chuchu Jelly Compression Handling -------------------
      // Specialized logic for compressing 100 of any Chuchu Jelly into a Chuchu Egg
      const chuchuJellyTypes = ['chuchu jelly', 'red chuchu jelly', 'white chuchu jelly', 'yellow chuchu jelly'];
      if (chuchuJellyTypes.includes(item.itemName.toLowerCase()) && quantity === 100) {
        // Check if character has exactly 100 of the jelly type
        if (ownedItem.quantity < 100) {
          return void await interaction.editReply({
            embeds: [{
              color: 0xFF6B35,
              title: '🥚 Chuchu Jelly Compression',
              description: `❌ **You need exactly 100 ${item.itemName} to compress into a Chuchu Egg.**\n\nYou currently have ${ownedItem.quantity} ${item.itemName}.`,
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Chuchu Jelly Compression'
              }
            }],
            ephemeral: true
          });
        }

        // Remove the 100 jelly from inventory
        await removeItemInventoryDatabase(character._id, item.itemName, 100, interaction);

        // Add 1 Chuchu Egg to inventory (Google Sheets logging is handled automatically by addItemInventoryDatabase)
        await addItemInventoryDatabase(character._id, 'Chuchu Egg', 1, interaction, `Compressed from 100 ${item.itemName}`);

        // ------------------- Build and Send Compression Embed -------------------
        const compressionEmbed = new EmbedBuilder()
          .setColor('#FF6B35')
          .setTitle('🥚 Chuchu Jelly Compressed!')
          .setDescription(
            `**${character.name}** has successfully compressed **100 ${item.itemName}** into a **Chuchu Egg**!\n\n` +
            `The jelly has been magically condensed into a single egg that can be hatched into a pet.`
          )
          .addFields(
            { name: '__Jelly Used__', value: `> 100 ${item.itemName}`, inline: true },
            { name: '__Egg Created__', value: `> 1 Chuchu Egg`, inline: true },
            { name: '__Process__', value: `> Compression`, inline: true }
          )
          .setThumbnail(item.image || 'https://via.placeholder.com/150')
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ 
            text: `Chuchu Jelly Compression System`,
            iconURL: character.icon
          });

        return void await interaction.editReply({ embeds: [compressionEmbed] });
      }

      // ------------------- Elixir Handling -------------------
      // Specialized logic for Breath of the Wild elixirs: applies buffs and effects
      const elixirInfo = getElixirInfo(item.itemName);
      if (elixirInfo) {
        // Force quantity to 1 for elixirs (they're powerful items)
        if (quantity !== 1) {
          return void await interaction.editReply({
            embeds: [{
              color: 0x8B4513,
              title: '🧪 Elixir Usage',
              description: `❌ **Elixirs can only be used one at a time.**\nPlease use a quantity of 1.`,
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Elixir System'
              }
            }],
            ephemeral: true
          });
        }

        // TEMPORARILY DISABLED: Check if character already has an active buff
        // TODO: Re-implement proper elixir usage logic when ready
        /*
        if (character.buff?.active) {
          // Get elixir info for display
          const currentElixirInfo = getElixirInfo(character.buff.type);
          const elixirName = Object.keys(ELIXIR_EFFECTS).find(key => 
            ELIXIR_EFFECTS[key].type === character.buff.type
          ) || character.buff.type;
          
          return void await interaction.editReply({
            embeds: [{
              color: 0x8B4513,
              title: '❌ Active Buff Found',
              description: `${character.name} already has an active buff and cannot use another elixir at this time.`,
              fields: [
                { 
                  name: '🧪 Elixir Used', 
                  value: `**${elixirName}**`, 
                  inline: true 
                },
                { 
                  name: '✨ Effect', 
                  value: currentElixirInfo ? currentElixirInfo.description : 'Unknown effect', 
                  inline: false 
                }
              ],
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Please wait for your current buff to expire before using another elixir'
              }
            }],
            ephemeral: true
          });
        }
        */

        // Store original values for display (moved to broader scope)
        const originalMaxHearts = character.maxHearts;
        const originalMaxStamina = character.maxStamina;

        // Apply the elixir buff
        try {
          
          // Apply immediate healing effects first
          if (item.modifierHearts) {
            const healAmount = Math.min(item.modifierHearts, character.maxHearts - character.currentHearts);
            character.currentHearts += healAmount;
            await updateCurrentHearts(character._id, character.currentHearts);
          }
          
          if (item.staminaRecovered) {
            const staminaRecovered = Math.min(item.staminaRecovered, character.maxStamina - character.currentStamina);
            character.currentStamina += staminaRecovered;
            await updateCurrentStamina(character._id, character.currentStamina);
          }
          
          // Special handling for Hearty and Enduring Elixirs - they expire immediately since they're just for healing/restoration
          if (item.itemName === 'Hearty Elixir') {
            // Apply temporary extra hearts for immediate use
            const extraHearts = 3;
            character.currentHearts += extraHearts;
            // Don't modify maxHearts - just track the temporary addition
            
            // Don't set a buff, just apply the healing
            character.buff = {
              active: false,
              type: null,
              effects: {}
            };
          } else if (item.itemName === 'Enduring Elixir') {
            // Apply immediate stamina restoration and temporary stamina boost
            const staminaBoost = 1;
            character.maxStamina += staminaBoost;
            character.currentStamina += staminaBoost;
            
            // Don't set a buff, just apply the immediate effects
            character.buff = {
              active: false,
              type: null,
              effects: {}
            };
          } else {
            // Apply normal elixir buff for other elixirs
            applyElixirBuff(character, item.itemName);
          }
          
          // Update character in database
          const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
          await updateFunction(character._id, { buff: character.buff });
          
          // Update hearts if they were modified by Hearty Elixir
          if (item.itemName === 'Hearty Elixir') {
            await updateCurrentHearts(character._id, character.currentHearts);
          }
          
          // Update stamina if it was modified by Enduring Elixir
          if (item.itemName === 'Enduring Elixir') {
            await updateCurrentStamina(character._id, character.currentStamina);
            // Note: maxStamina update would need a separate function, but for now this shows the effect
          }
        } catch (error) {
          handleInteractionError(error, 'item.js', {
            commandName: 'item',
            userTag: interaction.user.tag,
            userId: interaction.user.id,
            characterName,
            itemName,
            options: { elixirError: true }
          });
          
          return void await interaction.editReply({
            embeds: [{
              color: 0xFF0000,
              title: '❌ Elixir Application Failed',
              description: 'Failed to apply the elixir effect to your character.\n\n**What went wrong:**\n• Elixir effect could not be processed\n• Character buff system encountered an error\n\n**To fix this:**\n• Please try using the elixir again\n• If the problem persists, contact a moderator',
              image: {
                url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
              },
              footer: {
                text: 'Elixir System Error'
              }
            }],
            ephemeral: true
          });
        }

        // Remove the elixir from inventory with proper logging
        await removeItemInventoryDatabase(character._id, item.itemName, 1, interaction, `Used ${item.itemName} for buff effects`);

        // ------------------- Build and Send Elixir Embed -------------------
        // Build consistent effect fields for all elixirs
        let effectFields = [];
        const buffEffects = character.buff?.effects;
        
        // Always show buff effects if they exist (for non-immediate elixirs)
        if (buffEffects && Object.keys(buffEffects).length > 0) {
          if (buffEffects.blightResistance > 0) {
            effectFields.push({ name: '🧿 Blight Resistance', value: `x${buffEffects.blightResistance}`, inline: true });
          }
          if (buffEffects.electricResistance > 0) {
            effectFields.push({ name: '⚡ Electric Resistance', value: `x${buffEffects.electricResistance}`, inline: true });
          }
          if (buffEffects.staminaBoost > 0) {
            effectFields.push({ name: '🟩 Stamina Boost', value: `+${buffEffects.staminaBoost}`, inline: true });
          }
          if (buffEffects.staminaRecovery > 0) {
            effectFields.push({ name: '💚 Stamina Recovery', value: `+${buffEffects.staminaRecovery}`, inline: true });
          }
          if (buffEffects.fireResistance > 0) {
            effectFields.push({ name: '🔥 Fire Resistance', value: `x${buffEffects.fireResistance}`, inline: true });
          }
          if (buffEffects.speedBoost > 0) {
            effectFields.push({ name: '🏃 Speed Boost', value: `+${buffEffects.speedBoost}`, inline: true });
          }
          if (buffEffects.extraHearts > 0) {
            effectFields.push({ name: '❤️ Extra Hearts', value: `+${buffEffects.extraHearts}`, inline: true });
          }
          if (buffEffects.attackBoost > 0) {
            effectFields.push({ name: '⚔️ Attack Boost', value: `x${buffEffects.attackBoost}`, inline: true });
          }
          if (buffEffects.stealthBoost > 0) {
            effectFields.push({ name: '👻 Stealth Boost', value: `+${buffEffects.stealthBoost}`, inline: true });
          }
          if (buffEffects.fleeBoost > 0) {
            effectFields.push({ name: '🏃‍♂️ Flee Boost', value: `+${buffEffects.fleeBoost}`, inline: true });
          }
          if (buffEffects.coldResistance > 0) {
            effectFields.push({ name: '❄️ Cold Resistance', value: `x${buffEffects.coldResistance}`, inline: true });
          }
          if (buffEffects.iceEffectiveness > 0) {
            effectFields.push({ name: '🧊 Ice Effectiveness', value: `+${buffEffects.iceEffectiveness}`, inline: true });
          }
          if (buffEffects.defenseBoost > 0) {
            effectFields.push({ name: '🛡️ Defense Boost', value: `x${buffEffects.defenseBoost}`, inline: true });
          }
        }

        // Calculate display values for consistent display
        let displayCurrentHearts = character.currentHearts;
        let displayMaxHearts = originalMaxHearts;
        let displayCurrentStamina = character.currentStamina;
        let displayMaxStamina = character.maxStamina;
        
        if (item.itemName === 'Hearty Elixir') {
          // For Hearty Elixir, show current hearts (including temporary) / original max hearts
          displayCurrentHearts = character.currentHearts;
          displayMaxHearts = originalMaxHearts;
        } else if (item.itemName === 'Enduring Elixir') {
          // For Enduring Elixir, show current stamina (including temporary) / original max stamina
          displayCurrentStamina = character.currentStamina;
          displayMaxStamina = originalMaxStamina;
        }
        
        // Build uniform elixir embed
        const elixirEmbed = new EmbedBuilder()
          .setColor('#8B4513')
          .setTitle('🧪 Elixir Consumed!')
          .setDescription(
            `**${character.name}** has consumed a **${item.itemName}**!\n\n` +
            `${elixirInfo.description}`
          )
          .addFields([
            { name: '❤️ Current Hearts', value: `**${displayCurrentHearts}/${displayMaxHearts}**`, inline: true },
            { name: '🟩 Current Stamina', value: `**${displayCurrentStamina}/${displayMaxStamina}**`, inline: true }
          ])
          .setThumbnail(item.image || character.icon)
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

        // Add buff effects section if there are effects to show
        if (effectFields.length > 0) {
          elixirEmbed.addFields([
            { name: '✨ Active Effects', value: 'The following effects are now active:', inline: false },
            ...effectFields
          ]);
        }

        // Add immediate effects section if there are healing/restoration effects
        if (item.modifierHearts || item.staminaRecovered) {
          let immediateEffects = [];
          if (item.modifierHearts) {
            immediateEffects.push(`❤️ **Hearts restored: +${item.modifierHearts}**`);
          }
          if (item.staminaRecovered) {
            immediateEffects.push(`🟩 **Stamina restored: +${item.staminaRecovered}**`);
          }
          
          elixirEmbed.addFields({
            name: '💚 Immediate Effects',
            value: immediateEffects.join('\n'),
            inline: false
          });
        }

        // Set footer based on elixir type
        const isImmediateElixir = item.itemName === 'Hearty Elixir' || item.itemName === 'Enduring Elixir';
        elixirEmbed.setFooter({ 
          text: isImmediateElixir ? `${item.itemName} consumed immediately` : 'Elixir effects active until used',
          iconURL: character.icon
        });

        return void await interaction.editReply({ embeds: [elixirEmbed] });
      }

      // ------------------- Debuff and Inventory Sync Checks -------------------
      // Prevent item use if character is debuffed or inventory isn't synced.
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
          // Debuff is still active - block item/fairy healing
          // Debuffed characters can ONLY be healed by boosted healers
          const debuffEmbed = createDebuffEmbed(character);
          debuffEmbed.setDescription(`**${character.name}** is currently debuffed and cannot use items or fairies to heal.\n\nDebuffed characters can only be healed by **boosted Healers**. Find a boosted Healer to remove the debuff!`);
          return void await interaction.editReply({ embeds: [debuffEmbed] });
        }
      }

      // Check inventory sync before proceeding (no longer required, but kept for compatibility)
      await checkInventorySync(character);

      // ------------------- KO and Max-Health Handling -------------------
      // Handle KO status (non-fairy items) and prevent overhealing.
      if (character.ko && item.itemName.toLowerCase() !== 'fairy') {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('⚠️ Healing Failed ⚠️')
          .setDescription(`**${item.itemName}** cannot recover from KO. Use a Fairy or request healer services.`)
          .setFooter({ text: 'Healing Error' });
        return void await interaction.editReply({ embeds: [errorEmbed] });
      }

      if (character.currentHearts >= character.maxHearts && !item.staminaRecovered) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#59A914') // friendly green tone for RP
          .setAuthor({
            name: `${character.name} 🔗`,
            iconURL: character.icon,
            url: character.inventory,
          })
          .setTitle('💚 Already at Full Health!')
          .setDescription(
            `**${character.name}** is already feeling their best!\n` +
            `No need to waste a perfectly good **${item.emoji || ''} ${item.itemName}** right now.`
          )
          .addFields(
            { name: '❤️ Hearts', value: `> **${character.currentHearts}/${character.maxHearts}**`, inline: true },
            { name: '🟩 Stamina', value: `> **${character.currentStamina}/${character.maxStamina}**`, inline: true }
          )
          .setThumbnail(item.image || character.icon)
          .setFooter({ text: `Rest easy, ${character.name} is thriving! 🌿` });
      
        return void await interaction.editReply({ embeds: [errorEmbed] });
      }
      
      // ------------------- Restricted Items Check -------------------
      // Block usage of explicitly disallowed healing items.
      const restricted = ['oil jar', 'goron spice'];
      if (restricted.includes(item.itemName.toLowerCase())) {
        const embed = new EmbedBuilder()
          .setTitle('⚠️ Woah there! ⚠️')
          .setDescription(`**${character.name}** tried to use **${item.itemName}** for healing, but it's not a suitable choice!`)
          .setColor('#FF6347')
          .setThumbnail(item.image)
          .setFooter({ text: 'Stick to proper healing items!' });
        return void await interaction.editReply({ embeds: [embed] });
      }

      // ------------------- Validate Item Can Be Used -------------------
      // Check if the item is a Recipe item (for healing) or has other valid uses
      
      if (item.itemName.toLowerCase() !== 'fairy' && (!Array.isArray(item.category) || !item.category.includes('Recipe'))) {
        console.log(`[item.js]: ❌ Item validation failed - Not a fairy and category does not include Recipe`);
        const embed = new EmbedBuilder()
          .setTitle('❓ Hmm...')
          .setDescription(`**${character.name}** tried to use **${item.itemName}** for healing, but it's not a healing item.\n\nThis item might be used for something else, but it won't help with healing!`)
          .setColor('#FF6347')
          .setThumbnail(item.image)
          .setFooter({ text: 'Try using a Recipe item or Fairy for healing!' });
        return void await interaction.editReply({ embeds: [embed] });
      }

      // ------------------- Expedition raid: item = turn -------------------
      // During an expedition raid, only the current raid turn may use /item heal.
      const activeRaid = await Raid.findOne({ status: 'active', 'participants.characterId': character._id }).lean();
      if (activeRaid && activeRaid.expeditionId) {
        const currentParticipant = activeRaid.participants?.[activeRaid.currentTurn ?? 0];
        if (currentParticipant && currentParticipant.characterId && character._id && currentParticipant.characterId.toString() !== character._id.toString()) {
          return void await interaction.editReply({
            embeds: [{
              color: 0xFF6347,
              title: "Not your turn",
              description: "It's not your turn. Only the current turn can use an item (item = turn). Wait for your turn in the raid, then use **/explore item**.",
              footer: { text: 'Item = turn' }
            }],
            ephemeral: true
          });
        }
      }

      // ------------------- KO Revival Logic -------------------
      // Allow fairies to revive KO'd characters, BUT NOT if character is debuffed
      // Debuffed characters can ONLY be healed by boosted healers
      if (character.ko && item.itemName.toLowerCase() === 'fairy') {
        // Double-check debuff status before allowing fairy healing
        // This ensures debuffed characters can only be healed by boosted healers
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
            // Debuff is active - block fairy healing
            const debuffEmbed = createDebuffEmbed(character);
            debuffEmbed.setDescription(`**${character.name}** is currently debuffed and cannot be healed with items or fairies.\n\nDebuffed characters can only be healed by **boosted Healers**. Find a boosted Healer to remove the debuff!`);
            return void await interaction.editReply({ embeds: [debuffEmbed] });
          }
        }
        
        await healKoCharacter(character._id);
        character.currentHearts = character.maxHearts;
        await updateCurrentHearts(character._id, character.currentHearts);

        // Re-validate inventory immediately before remove (in case another request consumed the item)
        const healingItemNameKo = item.itemName.trim();
        const itemQueryKo = healingItemNameKo.includes('+')
          ? { characterId: character._id, itemName: healingItemNameKo }
          : { characterId: character._id, itemName: new RegExp(`^${escapeRegExp(healingItemNameKo)}$`, 'i') };
        const currentItemsKo = await inventoryCollection.find(itemQueryKo).toArray();
        const totalNowKo = currentItemsKo.reduce((sum, inv) => sum + Math.max(0, inv.quantity || 0), 0);
        if (totalNowKo < quantity) {
          return void await interaction.editReply({
            embeds: [{
              color: 0xFF0000,
              title: '❌ Not Enough Items',
              description: `${character.name} does not have enough **${item.itemName}** in inventory. Inventory may have changed since you started.`,
              image: { url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png' },
              footer: { text: 'Try again or check your inventory' }
            }],
            ephemeral: true
          });
        }
        await removeItemInventoryDatabase(character._id, item.itemName, quantity, interaction, 'Used for healing');

        // Using an item in a raid counts as a turn — advance raid turn if this character is current
        try {
          await advanceRaidTurnOnItemUse(character._id);
        } catch (raidErr) {
          // Non-fatal: log and continue; healing succeeded
          console.warn('[item.js] advanceRaidTurnOnItemUse:', raidErr?.message || raidErr);
        }

        const successEmbed = new EmbedBuilder()
          .setColor('#59A914')
          .setTitle('💫 Revival Successful!')
          .setDescription(
            `**${character.name}** has been revived and fully healed using a **${item.itemName}**!`
          )
          .addFields(
            { 
              name: '💚 Hearts', 
              value: `> **0/${character.maxHearts}** → **${character.currentHearts}/${character.maxHearts}**`, 
              inline: true 
            },
            { 
              name: '🟩 Stamina', 
              value: `> **${character.currentStamina}/${character.maxStamina}**`, 
              inline: true 
            }
          )
          .setThumbnail(item.image || character.icon)
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: 'Revival successful! 🌿' });

        return void await interaction.editReply({ embeds: [successEmbed] });
      }
      


      // ------------------- Healing and Stamina Processing -------------------
      // Apply heart and stamina modifiers, update DB, remove items, and log usage.
      let healAmount = 0;
      let staminaRecovered = 0;
      
      // Store original values for display
      const originalHearts = character.currentHearts;
      const originalStamina = character.currentStamina;

      if (item.modifierHearts && item.modifierHearts > 0) {
        healAmount = Math.min(item.modifierHearts * quantity, character.maxHearts - character.currentHearts);
        if (healAmount > 0) {
          const newHearts = character.currentHearts + healAmount;
          await updateCurrentHearts(character._id, newHearts);
          character.currentHearts = newHearts;
        }
      }

      if (item.staminaRecovered !== undefined && item.staminaRecovered !== null && item.staminaRecovered > 0) {
        staminaRecovered = Math.min(item.staminaRecovered * quantity, character.maxStamina - character.currentStamina);
        if (staminaRecovered > 0) {
          const newStamina = character.currentStamina + staminaRecovered;
          // Update database first, then update in-memory character object
          await updateCurrentStamina(character._id, newStamina);
          character.currentStamina = newStamina;
        }
      }

      // Re-validate inventory immediately before remove (in case another request consumed the item)
      const healingItemName = item.itemName.trim();
      const itemQueryHeal = healingItemName.includes('+')
        ? { characterId: character._id, itemName: healingItemName }
        : { characterId: character._id, itemName: new RegExp(`^${escapeRegExp(healingItemName)}$`, 'i') };
      const currentItemsHeal = await inventoryCollection.find(itemQueryHeal).toArray();
      const totalNowHeal = currentItemsHeal.reduce((sum, inv) => sum + Math.max(0, inv.quantity || 0), 0);
      if (totalNowHeal < quantity) {
        return void await interaction.editReply({
          embeds: [{
            color: 0xFF0000,
            title: '❌ Not Enough Items',
            description: `${character.name} does not have enough **${item.itemName}** in inventory. Inventory may have changed since you started.`,
            image: { url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png' },
            footer: { text: 'Try again or check your inventory' }
          }],
          ephemeral: true
        });
      }
      await removeItemInventoryDatabase(character._id, item.itemName, quantity, interaction, 'Used for healing');

      // Using an item in a raid counts as a turn — advance raid turn if this character is current
      try {
        await advanceRaidTurnOnItemUse(character._id);
      } catch (raidErr) {
        // Non-fatal: log and continue; healing succeeded
        console.warn('[item.js] advanceRaidTurnOnItemUse:', raidErr?.message || raidErr);
      }

      // Build description with actual recovered amounts
      const heartsDisplay = healAmount > 0 ? `❤️ +${healAmount}` : '';
      const staminaDisplay = staminaRecovered > 0 ? `🟩 +${staminaRecovered}` : '';
      const recoveryText = [heartsDisplay, staminaDisplay].filter(Boolean).join(' / ') || '';
      
      const successEmbed = new EmbedBuilder()
        .setColor('#59A914')
        .setTitle('✅ Healing Successful!')
        .setDescription(
          `**${character.name}** has been successfully healed using **${item.itemName}**${quantity > 1 ? ` x${quantity}` : ''}!${recoveryText ? ` ${recoveryText}\n` : '\n'}`
        )
        .addFields(
          { 
            name: '💚 Hearts', 
            value: `> **${originalHearts}/${character.maxHearts}** → **${character.currentHearts}/${character.maxHearts}**`, 
            inline: true 
          },
          { 
            name: '🟩 Stamina', 
            value: `> **${originalStamina}/${character.maxStamina}** → **${character.currentStamina}/${character.maxStamina}**`, 
            inline: true 
          }
        )
        .setThumbnail(item.image || character.icon)
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .setFooter({ text: 'Healing successful! 🌿' });

      return void await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      await handleInteractionError(error, interaction, {
        source: 'item.js',
        characterName: interaction.options?.getString('charactername'),
        itemName: interaction.options?.getString('itemname'),
        responseType: ERROR_RESPONSE_TYPES.EDIT
      });
      
      // Also send a user-friendly error message if error handler doesn't
      try {
        await interaction.editReply({
          embeds: [{
            color: 0xFF0000,
            title: '❌ Error Executing Command',
            description: 'An unexpected error occurred while processing your item command.\n\n**Common fixes:**\n• Make sure the item name is spelled correctly\n• Use autocomplete to select the correct item name\n• Check that your character exists and belongs to you',
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'If this persists, contact a moderator'
            }
          }]
        });
      } catch (replyError) {
        // Already replied or interaction expired - ignore
      }
    }
  }
};