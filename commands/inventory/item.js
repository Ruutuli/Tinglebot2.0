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