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
  fetchItemByName,
  getCharacterInventoryCollection,
  updateCharacterById
} = require('../../database/db');

// ------------------- Custom Modules -------------------
// Application-specific modules: character stats, job perks, formatting helpers, location emojis.
const { healKoCharacter, updateCurrentHearts, updateCurrentStamina } = require('../../modules/characterStatsModule');
const { getJobPerk } = require('../../modules/jobsModule');
const { capitalizeWords } = require('../../modules/formattingModule');
const { getVillageEmojiByName } = require('../../modules/locationsModule');
const { createDebuffEmbed } = require('../../embeds/embeds');
const { getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');

// ------------------- Utility Functions -------------------
// General-purpose utilities: error handling, inventory utils.
const { handleError } = require('../../utils/globalErrorHandler');
const { removeItemInventoryDatabase, syncToInventoryDatabase } = require('../../utils/inventoryUtils');
const { checkInventorySync } = require('../../utils/characterUtils');
const { safeAppendDataToSheet } = require('../../utils/googleSheetsUtils');
const { enforceJail } = require('../../utils/jailCheck');


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
      const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
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
      const ownedItem = inventoryItems.find(invItem =>
        invItem.itemName?.toLowerCase() === itemName.toLowerCase()
      );
      if (!ownedItem || ownedItem.quantity < quantity) {
        return void await interaction.editReply({
          embeds: [{
            color: 0xAA926A,
            title: '🎫 Job Voucher Usage',
            description: `*${character.name} looks through their inventory, confused...*\n\n**Item Not Found**\n${character.name} does not have enough "${capitalizeWords(itemName)}" in their inventory.`,
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
        await updateCharacterById(character._id, { jobVoucher: true, jobVoucherJob: jobName });
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
        const commands = [
          jobPerkInfo.perks.includes('GATHERING') && '> </gather:1372378304773881885>',
          jobPerkInfo.perks.includes('CRAFTING') && '> </crafting:1372378304773881883>',
          jobPerkInfo.perks.includes('LOOTING') && '> </loot:1372378304773881887>',
          jobPerkInfo.perks.includes('HEALING') && '> </heal fufill:1372378304773881886>'
        ].filter(Boolean);
        if (commands.length) {
          description += `\n\nUse the following commands to make the most of this role:\n${commands.join('\n')}`;
        }

        const voucherEmbed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🎫 Job Voucher Activated!')
          .setDescription(description)
          .addFields(
            { name: `${villageEmoji} Current Village`, value: `**${currentVillage}**`, inline: true },
            { name: '🏷️ Normal Job', value: `**${capitalizeWords(character.job || 'Unemployed')}**`, inline: true }
          )
          .setThumbnail(item.image || 'https://via.placeholder.com/150')
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
          .setFooter({ text: '✨ Good luck in your new role! Make the most of this opportunity!' });

        return void await interaction.editReply({ embeds: [voucherEmbed] });
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