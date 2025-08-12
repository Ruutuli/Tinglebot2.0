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
} = require('../../database/db');

// ------------------- Custom Modules -------------------
// Application-specific modules: character stats, job perks, formatting helpers, location emojis.
const { healKoCharacter, updateCurrentHearts, updateCurrentStamina } = require('../../modules/characterStatsModule');
const { getJobPerk } = require('../../modules/jobsModule');
const { capitalizeWords } = require('../../modules/formattingModule');
const { getVillageEmojiByName } = require('../../modules/locationsModule');
const { createDebuffEmbed } = require('../../embeds/embeds');
const { getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');
const { getPetTypeData, getPetEmoji, getRollsDisplay } = require('../../modules/petModule');
const { applyElixirBuff, getElixirInfo, removeExpiredBuffs, ELIXIR_EFFECTS } = require('../../modules/elixirModule');

// ------------------- Utility Functions -------------------
// General-purpose utilities: error handling, inventory utils.
const { handleError } = require('../../utils/globalErrorHandler');
const { removeItemInventoryDatabase, syncToInventoryDatabase, addItemInventoryDatabase } = require('../../utils/inventoryUtils');
const { checkInventorySync } = require('../../utils/characterUtils');
const { safeAppendDataToSheet } = require('../../utils/googleSheetsUtils');
const { enforceJail } = require('../../utils/jailCheck');

// ------------------- Database Models -------------------
const User = require('../../models/UserModel');
const Pet = require('../../models/PetModel');

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
          content: `❌ **Character ${characterName} not found or does not belong to you.**`,
        });
        return;
      }

      // Check if character is in jail
      const jailCheck = await enforceJail(character, 'use items');
      if (jailCheck) {
        await interaction.editReply({ content: jailCheck, ephemeral: true });
        return;
      }

      const item = await fetchItemByName(itemName);
      if (!item) {
        return void await interaction.editReply({ content: '❌ **Item not found.**' });
      }

      // ------------------- Inventory Initialization -------------------
      // Ensure the character has an inventory collection set up.
      const inventoryCollection = await getCharacterInventoryCollection(character.name);
      if (!inventoryCollection) {
        return void await interaction.editReply({
          content: '❌ **Inventory not set up. Please initialize an inventory before using items.**'
        });
      }

      // ------------------- Ownership Validation -------------------
      // Confirm the character owns enough of the requested item.
      const inventoryItems = await inventoryCollection.find().toArray();
      
      // Clean the itemName to remove quantity suffix if present (e.g., "Job Voucher - Qty: 1" -> "Job Voucher")
      const cleanItemName = itemName.replace(/\s*-\s*Qty:\s*\d+\s*$/i, '').toLowerCase();
      
      const ownedItem = inventoryItems.find(invItem =>
        invItem.itemName?.toLowerCase() === cleanItemName
      );
      
      // Skip inventory check for mod characters using job vouchers
      const isModCharacterUsingJobVoucher = character.isModCharacter && item.itemName.toLowerCase() === 'job voucher';
      
      if (!isModCharacterUsingJobVoucher && (!ownedItem || ownedItem.quantity < quantity)) {
        return void await interaction.editReply({
          embeds: [{
            color: 0xAA926A,
            title: '🎫 Job Voucher Usage',
            description: `*${character.name} looks through their inventory, confused...*\n\n**Item Not Found**\n${character.name} does not have enough "${capitalizeWords(cleanItemName)}" in their inventory.`,
            image: {
              url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
            },
            footer: {
              text: 'Job Voucher System'
            }
          }],
          ephemeral: true
        });
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
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
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
              content: `❌ **"${capitalizeWords(jobName)}" is not a valid job.**\nPlease select a valid job from the suggestions.`,
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
                    url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
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
            await safeAppendDataToSheet(inventoryLink, character, 'loggedInventory!A2:M', values, interaction.client, { 
              skipValidation: true,
              context: {
                commandName: 'item',
                userTag: interaction.user.tag,
                userId: interaction.user.id,
                options: {
                  characterName,
                  itemName,
                  quantity,
                  jobName: interaction.options.getString('jobname')
                }
              }
            });
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
            .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
            .setFooter({ text: '✨ Mod characters can use job vouchers without consuming them! Click the commands above to start working!' });

          return void await interaction.editReply({ embeds: [voucherEmbed] });
        }

        if (character.jobVoucher) {
          return void await interaction.editReply({
            embeds: [{
              color: 0xFF0000,
              title: '❌ Job Voucher Error',
              description: `**${character.name}** already has an active Job Voucher for **${character.jobVoucherJob} (Live)**.\n\nPlease complete the current job before using another voucher.`,
              image: {
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
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
            content: `❌ **"${capitalizeWords(jobName)}" is not a valid job.**\nPlease select a valid job from the suggestions.`
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
                  url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
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
        await removeItemInventoryDatabase(character._id, 'Job Voucher', 1, interaction);

        // Log job voucher usage to Google Sheets
        const inventoryLink = character.inventory || character.inventoryLink;
        if (typeof inventoryLink === 'string') {
          const { category = [], type = [], subtype = [] } = item;
          const formattedDateTime = new Date().toISOString();
          const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
          const values = [[
            character.name,
            'Job Voucher',
            '-1',
            Array.isArray(category) ? category.join(', ') : category,
            Array.isArray(type) ? type.join(', ') : type,
            Array.isArray(subtype) ? subtype.join(', ') : subtype,
            `Used for job voucher: ${jobName}`,
            character.job,
            '',
            character.currentVillage,
            interactionUrl,
            formattedDateTime,
            ''
          ]];
          await safeAppendDataToSheet(inventoryLink, character, 'loggedInventory!A2:M', values, interaction.client, { 
            skipValidation: true,
            context: {
              commandName: 'item',
              userTag: interaction.user.tag,
              userId: interaction.user.id,
              options: {
                characterName,
                itemName,
                quantity,
                jobName: interaction.options.getString('jobname')
              }
            }
          });
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
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
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
        await removeItemInventoryDatabase(character._id, 'Character Slot Voucher', quantity, interaction);

        // Log character slot voucher usage to Google Sheets
        const inventoryLink = character.inventory || character.inventoryLink;
        if (typeof inventoryLink === 'string') {
          const { category = [], type = [], subtype = [] } = item;
          const formattedDateTime = new Date().toISOString();
          const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
          const values = [[
            character.name,
            'Character Slot Voucher',
            `-${quantity}`,
            Array.isArray(category) ? category.join(', ') : category,
            Array.isArray(type) ? type.join(', ') : type,
            Array.isArray(subtype) ? subtype.join(', ') : subtype,
            `Used ${quantity} character slot voucher(s)`,
            character.job,
            '',
            character.currentVillage,
            interactionUrl,
            formattedDateTime,
            ''
          ]];
          await safeAppendDataToSheet(inventoryLink, character, 'loggedInventory!A2:M', values, interaction.client, { 
            skipValidation: true,
            context: {
              commandName: 'item',
              userTag: interaction.user.tag,
              userId: interaction.user.id,
              options: {
                characterName,
                itemName,
                quantity
              }
            }
          });
        }

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
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
          .setFooter({ text: '✨ You can now create more characters! Use /character create to get started!' });

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
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
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
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
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
            content: '❌ **Error: Invalid Chuchu type generated. Please try again.**',
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
        await removeItemInventoryDatabase(character._id, 'Chuchu Egg', 1, interaction);

        // Log chuchu egg usage to Google Sheets
        const inventoryLink = character.inventory || character.inventoryLink;
        if (typeof inventoryLink === 'string') {
          const { category = [], type = [], subtype = [] } = item;
          const formattedDateTime = new Date().toISOString();
          const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
          const values = [[
            character.name,
            'Chuchu Egg',
            '-1',
            Array.isArray(category) ? category.join(', ') : category,
            Array.isArray(type) ? type.join(', ') : type,
            Array.isArray(subtype) ? subtype.join(', ') : subtype,
                         `Hatched into ${randomPetName} the ${chuchuType}`,
            character.job,
            '',
            character.currentVillage,
            interactionUrl,
            formattedDateTime,
            ''
          ]];
          await safeAppendDataToSheet(inventoryLink, character, 'loggedInventory!A2:M', values, interaction.client, { 
            skipValidation: true,
            context: {
              commandName: 'item',
              userTag: interaction.user.tag,
              userId: interaction.user.id,
              options: {
                characterName,
                itemName,
                quantity
              }
            }
          });
        }

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
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
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
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
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
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
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
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
              },
              footer: {
                text: 'Elixir System'
              }
            }],
            ephemeral: true
          });
        }

        // Check if character already has an active buff
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
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
              },
              footer: {
                text: 'Please wait for your current buff to expire before using another elixir'
              }
            }],
            ephemeral: true
          });
        }

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
          handleError(error, 'item.js', {
            commandName: 'item',
            userTag: interaction.user.tag,
            userId: interaction.user.id,
            characterName,
            itemName,
            options: { elixirError: true }
          });
          
          return void await interaction.editReply({
            content: '❌ **Failed to apply elixir effect. Please try again later.**',
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
            effectFields.push({ name: '🧿 Blight Resistance', value: `+${buffEffects.blightResistance}`, inline: true });
          }
          if (buffEffects.electricResistance > 0) {
            effectFields.push({ name: '⚡ Electric Resistance', value: `+${buffEffects.electricResistance}`, inline: true });
          }
          if (buffEffects.staminaBoost > 0) {
            effectFields.push({ name: '🟩 Stamina Boost', value: `+${buffEffects.staminaBoost}`, inline: true });
          }
          if (buffEffects.staminaRecovery > 0) {
            effectFields.push({ name: '💚 Stamina Recovery', value: `+${buffEffects.staminaRecovery}`, inline: true });
          }
          if (buffEffects.fireResistance > 0) {
            effectFields.push({ name: '🔥 Fire Resistance', value: `+${buffEffects.fireResistance}`, inline: true });
          }
          if (buffEffects.speedBoost > 0) {
            effectFields.push({ name: '🏃 Speed Boost', value: `+${buffEffects.speedBoost}`, inline: true });
          }
          if (buffEffects.extraHearts > 0) {
            effectFields.push({ name: '❤️ Extra Hearts', value: `+${buffEffects.extraHearts}`, inline: true });
          }
          if (buffEffects.attackBoost > 0) {
            effectFields.push({ name: '⚔️ Attack Boost', value: `+${buffEffects.attackBoost}`, inline: true });
          }
          if (buffEffects.stealthBoost > 0) {
            effectFields.push({ name: '👻 Stealth Boost', value: `+${buffEffects.stealthBoost}`, inline: true });
          }
          if (buffEffects.fleeBoost > 0) {
            effectFields.push({ name: '🏃‍♂️ Flee Boost', value: `+${buffEffects.fleeBoost}`, inline: true });
          }
          if (buffEffects.coldResistance > 0) {
            effectFields.push({ name: '❄️ Cold Resistance', value: `+${buffEffects.coldResistance}`, inline: true });
          }
          if (buffEffects.iceEffectiveness > 0) {
            effectFields.push({ name: '🧊 Ice Effectiveness', value: `+${buffEffects.iceEffectiveness}`, inline: true });
          }
          if (buffEffects.defenseBoost > 0) {
            effectFields.push({ name: '🛡️ Defense Boost', value: `+${buffEffects.defenseBoost}`, inline: true });
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
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

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
        const debuffEmbed = createDebuffEmbed(character);
        return void await interaction.editReply({ embeds: [debuffEmbed] });
      }

      // Check inventory sync before proceeding
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
                name: '📝 How to Fix',
                value: '1. Use </inventory test:1370788960267272302> to test your inventory\n2. Use </inventory sync:1370788960267272302> to sync your inventory'
              }
            ],
            footer: {
              text: 'Inventory System'
            }
          }],
          ephemeral: true
        });
        return;
      }


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

      // ------------------- KO Revival Logic -------------------
      // Allow fairies to revive KO'd characters.
      if (character.ko && item.itemName.toLowerCase() === 'fairy') {
        await healKoCharacter(character._id);
        character.currentHearts = character.maxHearts;
        await updateCurrentHearts(character._id, character.currentHearts);
        await syncToInventoryDatabase(character, {
          itemName: item.itemName,
          quantity: -quantity,
          obtain: `Used for healing`
        }, interaction);

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
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
          .setFooter({ text: 'Revival successful! 🌿' });

        return void await interaction.editReply({ embeds: [successEmbed] });
      }
      


      // ------------------- Healing and Stamina Processing -------------------
      // Apply heart and stamina modifiers, update DB, remove items, and log usage.
      let healAmount = 0;
      let staminaRecovered = 0;

      if (item.modifierHearts) {
        healAmount = Math.min(item.modifierHearts * quantity, character.maxHearts - character.currentHearts);
        character.currentHearts += healAmount;
        await updateCurrentHearts(character._id, character.currentHearts);
      }

      if (item.staminaRecovered) {
        staminaRecovered = Math.min(item.staminaRecovered * quantity, character.maxStamina - character.currentStamina);
        character.currentStamina += staminaRecovered;
        await updateCurrentStamina(character._id, character.currentStamina);
      }

      await syncToInventoryDatabase(character, {
        itemName: item.itemName,
        quantity: -quantity,
        obtain: `Used for healing`
      }, interaction);

      const successEmbed = new EmbedBuilder()
        .setColor('#59A914')
        .setTitle('✅ Healing Successful!')
        .setDescription(
          `**${character.name}** has been successfully healed using **${item.itemName}**${quantity > 1 ? ` x${quantity}` : ''}!` +
          ` ❤️ +${item.modifierHearts * quantity} / 🟩 +${item.staminaRecovered * quantity}\n`
        )
        .addFields(
          { 
            name: '💚 Hearts', 
            value: `> **${character.currentHearts - healAmount}/${character.maxHearts}** → **${character.currentHearts}/${character.maxHearts}**`, 
            inline: true 
          },
          { 
            name: '🟩 Stamina', 
            value: `> **${character.currentStamina - staminaRecovered}/${character.maxStamina}** → **${character.currentStamina}/${character.maxStamina}**`, 
            inline: true 
          }
        )
        .setThumbnail(item.image || character.icon)
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setFooter({ text: 'Healing successful! 🌿' });

      return void await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      handleError(error, interaction);
    }
  }
};