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

// ------------------- Utility Functions -------------------
// General-purpose utilities: Google Sheets integration, URL validation, error handling, inventory utils.
const { authorizeSheets, appendSheetData,  safeAppendDataToSheet, } = require('../../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../../utils/validation');
const { handleError } = require('../../utils/globalErrorHandler');
const { removeItemInventoryDatabase } = require('../../utils/inventoryUtils');


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
    await interaction.deferReply({ ephemeral: false });

    const characterName = interaction.options.getString('charactername');
    const itemName = interaction.options.getString('itemname');
    const quantity = interaction.options.getInteger('quantity') || 1;

    try {
      // ------------------- Fetch Records -------------------
      // Retrieve character and item data; bail out if missing.
      const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
      if (!character) {
        return void await interaction.editReply({ content: '❌ **Character not found.**' });
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
          content: `❌ **${character.name}** does not have enough "${capitalizeWords(itemName)}" in their inventory.`
        });
      }


      // ------------------- Job Voucher Handling -------------------
      // Specialized logic for 'Job Voucher' item: job assignment, perk display, Google Sheets logging.
      if (item.itemName.toLowerCase() === 'job voucher') {
        if (character.jobVoucher) {
          return void await interaction.editReply({
            content: `❌ **${character.name}** already has an active Job Voucher for **${character.jobVoucherJob}**.\nPlease complete the current job before using another voucher.`
          });
        }

        const jobName = interaction.options.getString('jobname');
        if (!jobName) {
          return void await interaction.editReply({
            content: '❗ **You must specify a job to use with the Job Voucher.**'
          });
        }

        const jobPerkInfo = getJobPerk(jobName);
        if (!jobPerkInfo) {
          return void await interaction.editReply({
            content: `❌ **"${capitalizeWords(jobName)}" is not a valid job.**\nPlease select a valid job from the suggestions.`
          });
        }

        // Activate voucher and remove one from inventory.
        await updateCharacterById(character._id, { jobVoucher: true, jobVoucherJob: jobName });
        await removeItemInventoryDatabase(character._id, 'Job Voucher', 1, interaction);

        // ------------------- Build and Send Voucher Embed -------------------
        const currentVillage = capitalizeWords(character.currentVillage || 'Unknown');
        const villageEmoji = getVillageEmojiByName(currentVillage) || '🌍';
        let description = `**${character.name}** has used a Job Voucher to perform the **${jobName}** job.`;
        if (jobPerkInfo.perks?.length) {
          description = `**${character.name}** has used a Job Voucher to perform the **${jobName}** job with the following perk(s): **${jobPerkInfo.perks.join(', ')}**.`;
        }
        const commands = [
          jobPerkInfo.perks.includes('GATHERING') && '> </gather:1306176789755858974>',
          jobPerkInfo.perks.includes('CRAFTING') && '> </crafting:1306176789634355242>',
          jobPerkInfo.perks.includes('LOOTING') && '> </loot:1316682863143424121>',
          jobPerkInfo.perks.includes('HEALING') && '> </heal fufill:1306176789755858977>'
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
            { name: '🏷️ Normal Job', value: `**${character.job || 'Unemployed'}**`, inline: true }
          )
          .setThumbnail(item.image || 'https://via.placeholder.com/150')
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
          .setFooter({ text: '✨ Good luck in your new role! Make the most of this opportunity!' });

        return void await interaction.editReply({ embeds: [voucherEmbed] });
      }


      // ------------------- Debuff and Inventory Sync Checks -------------------
      // Prevent item use if character is debuffed or inventory isn't synced.
      if (character.debuff?.active) {
        const expireUnix = Math.floor(new Date(character.debuff.endDate).getTime() / 1000);
        return void await interaction.editReply({
          content: `❌ **${character.name} is currently debuffed and cannot use items to heal.**\n🕒 **Debuff Expires:** <t:${expireUnix}:F>`
        });
      }
      if (!character.inventorySynced) {
        return void await interaction.editReply({
          content: '❌ **Inventory not synced. Please initialize and sync before using items.**'
        });
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
          .setDescription(`**${character.name}** tried to use **${item.itemName}**. Not a suitable choice!`)
          .setColor('#FF6347')
          .setThumbnail(item.image)
          .setFooter({ text: 'Stick to proper healing items!' });
        return void await interaction.editReply({ embeds: [embed] });
      }


      // ------------------- KO Revival Logic -------------------
      // Allow fairies to revive KO'd characters.
      if (character.ko && item.itemName.toLowerCase() === 'fairy') {
        await healKoCharacter(character._id);
        character.currentHearts = character.maxHearts;
        await updateCurrentHearts(character._id, character.currentHearts);
        await removeItemInventoryDatabase(character._id, item.itemName, quantity, inventoryCollection); // ✅ Remove Fairy from inventory
        return void await interaction.editReply({
          content: `💫 **${character.name}** has been revived and fully healed using a **${item.itemName}**!`
        });
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

      await removeItemInventoryDatabase(character._id, item.itemName, quantity, inventoryCollection);

      // ------------------- Log Healing to Google Sheets -------------------
      if (isValidGoogleSheetsUrl(character.inventory || character.inventoryLink)) {
        const spreadsheetId = extractSpreadsheetId(character.inventory || character.inventoryLink);
        const auth = await authorizeSheets();
        const range = 'loggedInventory!A2:M';
        const uniqueSyncId = uuidv4();
        const timestamp = new Date().toISOString();
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

        const values = [[
          character.name,
          item.itemName,
          `-${quantity}`,
          item.category.join(', '),
          item.type.join(', '),
          item.subtype.join(', '),
          'Used for healing',
          character.job,
          '',
          character.currentVillage,
          interactionUrl,
          timestamp,
          uniqueSyncId
        ]];

        await safeAppendDataToSheet(spreadsheetId, auth.name, range, values);
      }


      // ------------------- Build and Send Confirmation Embed -------------------
      // Craft final embed showing pre- and post-values for hearts and stamina.
      let desc = `**${character.name}** used **${item.itemName}** ${item.emoji || ''}`;
      if (healAmount) desc += ` to heal **${healAmount}** hearts!`;
      if (staminaRecovered) desc += ` and recovered **${staminaRecovered}** stamina!`;

      const confirmationEmbed = new EmbedBuilder()
        .setColor('#59A914')
        .setTitle('✬ Healing ✬')
        .setAuthor({
          name: `${character.name} 🔗`,
          iconURL: character.icon,
          url: character.inventory
        })
        .setDescription(desc)
        .addFields(
          {
            name: '__❤️ Hearts__',
            value: `**${character.currentHearts - healAmount}/${character.maxHearts} → ${character.currentHearts}/${character.maxHearts}**`,
            inline: true
          },
          {
            name: '__🟩 Stamina__',
            value: `**${character.currentStamina - staminaRecovered}/${character.maxStamina} → ${character.currentStamina}/${character.maxStamina}**`,
            inline: true
          }
        )
        .setFooter({ text: 'Healing and Stamina Recovery Successful' })
        .setThumbnail(item.image);

      await interaction.editReply({ embeds: [confirmationEmbed] });
    } catch (error) {
      // ------------------- Error Handling -------------------
      // Log and report unexpected errors to user.
      handleError(error, 'item.js', {
        commandName: 'item',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        options: { characterName, itemName, quantity }
      });
      console.error('[item.js:logs] Error during healing process:', error);
      await interaction.editReply({
        content: '❌ **An error occurred during the healing process.**'
      });
    }
  }
};
