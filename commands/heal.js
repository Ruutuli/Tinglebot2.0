// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder } = require('discord.js');
const {
  fetchCharacterByName,
  fetchCharactersByUserId,
  getCharacterInventoryCollection,
} = require('../database/characterService');
const { fetchItemByName } = require('../database/itemService');
const { removeItemInventoryDatabase, addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { authorizeSheets, appendSheetData, isValidGoogleSheetsUrl, extractSpreadsheetId } = require('../utils/googleSheetsUtils');
const { v4: uuidv4 } = require('uuid');
const { createHealEmbed, updateHealEmbed } = require('../embeds/mechanicEmbeds');
const { handleTradeAutocomplete } = require('../handlers/autocompleteHandler');
const Character = require('../models/CharacterModel');

// ------------------- Main Heal Command Module -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('heal')
    .setDescription('Heal a character by offering items in return')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character to be healed')
        .setRequired(true)
        .setAutocomplete(true))
    .addIntegerOption(option =>
      option.setName('hearts')
        .setDescription('Number of hearts to heal')
        .setRequired(true)
        .setMinValue(1))
    .addStringOption(option =>
      option.setName('item1')
        .setDescription('First item to offer as payment')
        .setRequired(false)
        .setAutocomplete(true))
    .addIntegerOption(option =>
      option.setName('qty1')
        .setDescription('Quantity of the first item')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('item2')
        .setDescription('Second item to offer as payment')
        .setRequired(false)
        .setAutocomplete(true))
    .addIntegerOption(option =>
      option.setName('qty2')
        .setDescription('Quantity of the second item')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('item3')
        .setDescription('Third item to offer as payment')
        .setRequired(false)
        .setAutocomplete(true))
    .addIntegerOption(option =>
      option.setName('qty3')
        .setDescription('Quantity of the third item')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('healer')
        .setDescription('The character performing the healing')
        .setRequired(false)
        .setAutocomplete(true)),

  // ------------------- Main execute function for healing -------------------
  async execute(interaction) {
    const characterName = interaction.options.getString('charactername');
    const heartsToHeal = interaction.options.getInteger('hearts');
    const item1 = interaction.options.getString('item1');
    const qty1 = interaction.options.getInteger('qty1') || 1;
    const item2 = interaction.options.getString('item2');
    const qty2 = interaction.options.getInteger('qty2') || 0;
    const item3 = interaction.options.getString('item3');
    const qty3 = interaction.options.getInteger('qty3') || 0;
    const healerName = interaction.options.getString('healer');
    const userId = interaction.user.id;

    try {
      await interaction.deferReply();

      // ------------------- Fetch the character to be healed -------------------
      const characterToHeal = await fetchCharacterByName(characterName);
      if (!characterToHeal) {
        await interaction.editReply({ content: `❌ Character to be healed not found.` });
        return;
      }

      // ------------------- Fetch the healer character, if specified -------------------
      let healerCharacter;
      if (healerName) {
        healerCharacter = await fetchCharacterByName(healerName);
        if (!healerCharacter) {
          await interaction.editReply({ content: `❌ Healer character not found.` });
          return;
        }

        // Check if the character to be healed has their inventory synced
if (!characterToHeal.inventorySynced) {
  return interaction.editReply({
      content: `❌ **You cannot heal \`${characterToHeal.name}\` because their inventory is not set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> commands to initialize the inventory.**`,
      ephemeral: true,
  });
}

// If a healer is specified, check if their inventory is synced
if (healerCharacter && !healerCharacter.inventorySynced) {
  return interaction.editReply({
      content: `❌ **You cannot perform healing with \`${healerCharacter.name}\` because their inventory is not set up yet.**`,
      ephemeral: true,
  });
}


        if (characterToHeal.currentVillage.trim().toLowerCase() !== healerCharacter.currentVillage.trim().toLowerCase()) {
          await interaction.editReply({ content: `❌ Both characters must be in the same village to perform the healing. ${characterToHeal.name} is currently in ${characterToHeal.currentVillage}, and ${healerCharacter.name} is in ${healerCharacter.currentVillage}.` });
          return;
        }

        if (healerCharacter.currentStamina < heartsToHeal) {
          await interaction.editReply({ content: `❌ ${healerCharacter.name} does not have enough stamina to perform the heal.` });
          return;
        }
      }

      // ------------------- Validate and process items -------------------
      const items = [
        item1 ? { name: item1, quantity: qty1 } : null,
        item2 ? { name: item2, quantity: qty2 } : null,
        item3 ? { name: item3, quantity: qty3 } : null
      ].filter(item => item);

      for (let item of items) {
        const itemData = await fetchItemByName(item.name);
        if (!itemData) {
          await interaction.editReply({ content: `❌ Item ${item.name} not found.` });
          return;
        }
      }

      const fromInventoryCollection = await getCharacterInventoryCollection(characterToHeal.name);
      for (let item of items) {
        await removeItemInventoryDatabase(characterToHeal._id, item.name, item.quantity, fromInventoryCollection, interaction);
      }

      // ------------------- Create and send initial heal embed -------------------
      const embed = createHealEmbed(characterToHeal, healerCharacter, heartsToHeal, items);
      let contentMessage = healerCharacter ? `🔔 <@${healerCharacter.userId}>, your character ${healerCharacter.name} is being requested for healing!` : '';
      const replyMessage = await interaction.followUp({ content: contentMessage, embeds: [embed], fetchReply: true });

      // ------------------- Reaction collector to handle healer acceptance -------------------
      const filter = (reaction, user) => reaction.emoji.name === '❤️' && user.id !== interaction.client.user.id;
      const collector = replyMessage.createReactionCollector({ filter, time: 900000 }); // 15 minutes

      collector.on('collect', async (reaction, user) => {
        try {
          // ------------------- Validate healer's identity -------------------
          if (user.id === interaction.user.id) {
            await reaction.message.reply({ content: `❌ @${user.username}, you cannot accept your own healing request.`, ephemeral: true });
            return;
          }

          let healerCharacters = await fetchCharactersByUserId(user.id);
          healerCharacter = healerCharacters.find(character => character.job.toLowerCase() === 'healer' && character.currentVillage.trim().toLowerCase() === characterToHeal.currentVillage.trim().toLowerCase());

          if (!healerCharacter) {
            await reaction.message.reply({ content: `❌ @${user.username} does not have any healer characters in the same village as ${characterToHeal.name}.`, ephemeral: true });
            return;
          }

          if (healerName && healerCharacter.name !== healerName) {
            await reaction.message.reply({ content: `❌ @${user.username}, only the specified healer, ${healerName}, can accept this healing request.`, ephemeral: true });
            return;
          }

          if (healerCharacter.userId !== user.id) {
            await reaction.message.reply({ content: `❌ @${user.username}, you are not the owner of ${healerCharacter.name}. Do not react to this message.`, ephemeral: true });
            return;
          }

          // ------------------- Perform the healing and update stamina -------------------
          healerCharacter = await Character.findById(healerCharacter._id);
          if (!healerCharacter) {
            await reaction.message.reply({ content: `❌ Healer character not found after re-fetching.`, ephemeral: true });
            return;
          }

          if (healerCharacter.currentStamina < heartsToHeal) {
            await reaction.message.reply({ content: `❌ ${healerCharacter.name} does not have enough stamina to perform the heal.`, ephemeral: true });
            return;
          }

          healerCharacter.currentStamina -= heartsToHeal;
          await healerCharacter.save();

          const toInventoryCollection = await getCharacterInventoryCollection(healerCharacter.name);

          for (let item of items) {
            await addItemInventoryDatabase(healerCharacter._id, item.name, item.quantity, toInventoryCollection, interaction);
          }

          // ------------------- Google Sheets logging for both characters -------------------
          const fromInventoryLink = characterToHeal.inventory || characterToHeal.inventoryLink;
          const toInventoryLink = healerCharacter ? (healerCharacter.inventory || healerCharacter.inventoryLink) : null;

          if (fromInventoryLink && !isValidGoogleSheetsUrl(fromInventoryLink)) {
            await interaction.editReply({ content: `❌ Invalid Google Sheets URL for character inventory.` });
            return;
          }

          if (toInventoryLink && !isValidGoogleSheetsUrl(toInventoryLink)) {
            await interaction.editReply({ content: `❌ Invalid Google Sheets URL for healer inventory.` });
            return;
          }

          const auth = await authorizeSheets();
          const range = 'loggedInventory!A2:M';
          const uniqueSyncId = uuidv4();
          const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
          const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

          const appendData = async (character, itemName, quantity, action, spreadsheetId) => {
            const itemDetails = await fetchItemByName(itemName);
            const category = itemDetails?.category.join(', ') || '';
            const type = itemDetails?.type.join(', ') || '';
            const subtype = itemDetails?.subtype.join(', ') || '';

            const values = [
              [
                character.name,
                itemName,
                quantity.toString(),
                category,
                type,
                subtype,
                action,
                character.job,
                '',
                character.currentVillage,
                interactionUrl,
                formattedDateTime,
                uniqueSyncId,
              ],
            ];
            await appendSheetData(auth, spreadsheetId, range, values);
          };

          if (fromInventoryLink) {
            const fromSpreadsheetId = extractSpreadsheetId(fromInventoryLink);
            for (let item of items) {
              await appendData(characterToHeal, item.name, -item.quantity, `Healing payment`, fromSpreadsheetId);
            }
          }

          if (toInventoryLink) {
            const toSpreadsheetId = extractSpreadsheetId(toInventoryLink);
            for (let item of items) {
              await appendData(healerCharacter, item.name, item.quantity, `Healing payment`, toSpreadsheetId);
            }
          }

          // ------------------- Update and send the final heal embed -------------------
          const updatedEmbed = updateHealEmbed(embed, healerCharacter, characterToHeal, heartsToHeal);
          await replyMessage.edit({ content: contentMessage, embeds: [updatedEmbed] });

          await reaction.message.reply({ content: `✅ ${healerCharacter.name} has successfully healed ${characterToHeal.name}!`, ephemeral: true });

          collector.stop();
        } catch (error) {
          console.error(`❌ Error during reaction handling: ${error.message}`);
          try {
            await reaction.message.reply({ content: `❌ An error occurred during the healing process.`, ephemeral: true });
          } catch (err) {
            console.error('❌ Error sending follow-up message:', err);
          }
        }
      });

      collector.on('end', async collected => {
        if (collected.size === 0) {
          try {
            await interaction.followUp({ content: `❌ Healing request timed out. No healer accepted the request.` });
          } catch (error) {
            console.error('❌ Error sending follow-up message:', error);
          }
        }
      });

      try {
        await replyMessage.react('❤️');
      } catch (error) {
        console.error('❌ Error reacting to message:', error);
        await interaction.followUp({ content: `❌ An error occurred while reacting to the message.` });
      }
    } catch (error) {
      console.error(`❌ Error during healing interaction: ${error.message}`);
      try {
        await interaction.editReply({ content: `❌ An error occurred during the healing process.` });
      } catch (err) {
        console.error('❌ Error sending follow-up message:', err);
      }
    }
  },

  // ------------------- Autocomplete handler for item selection -------------------
  async autocomplete(interaction) {
    await handleTradeAutocomplete(interaction);
  },
};

