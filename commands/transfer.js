// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder } = require('discord.js');
const {
  fetchCharacterByNameAndUserId,
  getCharacterInventoryCollection,
} = require('../database/characterService');
const {
  addItemInventoryDatabase,
  removeItemInventoryDatabase,
} = require('../utils/inventoryUtils');
const { authorizeSheets, appendSheetData, isValidGoogleSheetsUrl, extractSpreadsheetId } = require('../utils/googleSheetsUtils');
const { v4: uuidv4 } = require('uuid');
const ItemModel = require('../models/ItemModel');
const { createTransferEmbed } = require('../embeds/mechanicEmbeds');
const { handleTransferAutocomplete } = require('../handlers/autocompleteHandler');

module.exports = {
  // ------------------- Slash command definition for transferring items -------------------
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer items between characters')
    .addStringOption(option =>
      option.setName('fromcharacter')
        .setDescription('The character transferring the items')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('tocharacter')
        .setDescription('The character receiving the items')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('itema')
        .setDescription('First item to be transferred')
        .setRequired(true)
        .setAutocomplete(true))
    .addIntegerOption(option =>
      option.setName('quantitya')
        .setDescription('Quantity of the first item')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('itemb')
        .setDescription('Second item to be transferred')
        .setRequired(false)
        .setAutocomplete(true))
    .addIntegerOption(option =>
      option.setName('quantityb')
        .setDescription('Quantity of the second item')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('itemc')
        .setDescription('Third item to be transferred')
        .setRequired(false)
        .setAutocomplete(true))
    .addIntegerOption(option =>
      option.setName('quantityc')
        .setDescription('Quantity of the third item')
        .setRequired(false)),

  // ------------------- Main function for handling the item transfer -------------------
  async execute(interaction) {
    await interaction.deferReply();

    const fromCharacterName = interaction.options.getString('fromcharacter');
    const toCharacterName = interaction.options.getString('tocharacter');
    const items = [
      {
        name: interaction.options.getString('itema'),
        quantity: interaction.options.getInteger('quantitya')
      },
      {
        name: interaction.options.getString('itemb'),
        quantity: interaction.options.getInteger('quantityb')
      },
      {
        name: interaction.options.getString('itemc'),
        quantity: interaction.options.getInteger('quantityc')
      }
    ].filter(item => item.name && item.quantity); // Filter valid items

    const userId = interaction.user.id;

    try {
      // ------------------- Fetch both characters by name and user ID -------------------
      const fromCharacter = await fetchCharacterByNameAndUserId(fromCharacterName, userId);
      const toCharacter = await fetchCharacterByNameAndUserId(toCharacterName, userId);

      if (!fromCharacter || !toCharacter) {
        await interaction.editReply({ content: `❌ Either the source or destination character does not exist or does not belong to you.`, ephemeral: true });
        return;
      }

      let allItemsAvailable = true;
      const unavailableItems = [];

      const fromInventoryCollection = await getCharacterInventoryCollection(fromCharacter.name);

      // ------------------- Check if all items are available in sufficient quantity -------------------
      for (const { name, quantity } of items) {
        const fromInventory = await fromInventoryCollection.findOne({ itemName: new RegExp(`^${name}$`, 'i') });

        if (!fromInventory || fromInventory.quantity < quantity) {
          allItemsAvailable = false;
          unavailableItems.push(`${name} - QTY:${fromInventory ? fromInventory.quantity : 0}`);
        }
      }

      if (!allItemsAvailable) {
        await interaction.editReply(`❌ \`${fromCharacterName}\` does not have enough of the following items to transfer: ${unavailableItems.join(', ')}`);
        return;
      }

      // ------------------- Validate Google Sheets URLs -------------------
      const fromInventoryLink = fromCharacter.inventory || fromCharacter.inventoryLink;
      const toInventoryLink = toCharacter.inventory || toCharacter.inventoryLink;

      if (!fromInventoryLink || !toInventoryLink || !isValidGoogleSheetsUrl(fromInventoryLink) || !isValidGoogleSheetsUrl(toInventoryLink)) {
        await interaction.editReply({ content: `❌ Invalid or missing Google Sheets URL for character inventory.`, ephemeral: true });
        return;
      }

      const fromSpreadsheetId = extractSpreadsheetId(fromInventoryLink);
      const toSpreadsheetId = extractSpreadsheetId(toInventoryLink);
      const auth = await authorizeSheets();
      const range = 'loggedInventory!A2:M';
      const uniqueSyncId = uuidv4();
      const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

      const formattedItems = [];

      // ------------------- Perform the transfer and update Google Sheets -------------------
      for (const { name, quantity } of items) {
        await removeItemInventoryDatabase(fromCharacter._id, name, quantity);
        await addItemInventoryDatabase(toCharacter._id, name, quantity, '', '', interaction, 'manual-transfer');

        const itemDetails = await ItemModel.findOne({ itemName: new RegExp(`^${name}$`, 'i') }).exec();
        const category = itemDetails?.category.join(', ') || '';
        const type = itemDetails?.type.join(', ') || '';
        const subtype = itemDetails?.subtype.join(', ') || '';

        const fromValues = [[
          fromCharacter.name, name, (-quantity).toString(), category, type, subtype, `Transfer to ${toCharacterName}`,
          fromCharacter.job, '', fromCharacter.currentVillage, interactionUrl, formattedDateTime, uniqueSyncId
        ]];

        const toValues = [[
          toCharacter.name, name, quantity.toString(), category, type, subtype, `Transfer from ${fromCharacterName}`,
          toCharacter.job, '', toCharacter.currentVillage, interactionUrl, formattedDateTime, uniqueSyncId
        ]];

        await appendSheetData(auth, fromSpreadsheetId, range, fromValues);
        await appendSheetData(auth, toSpreadsheetId, range, toValues);

        const itemIcon = itemDetails?.emoji || '📦';
        formattedItems.push({ itemName: String(name), quantity, itemIcon }); // Ensure itemName is a string
      }

      // ------------------- Create and send transfer embed -------------------
      const fromCharacterIcon = fromCharacter.icon || '🧙';
      const toCharacterIcon = toCharacter.icon || '🧙';

      const transferEmbed = createTransferEmbed(fromCharacter, toCharacter, formattedItems, interactionUrl, fromCharacterIcon, toCharacterIcon);

      await interaction.editReply({
        embeds: [transferEmbed]
      });

    } catch (error) {
      console.error('❌ Error during item transfer:', error);
      await interaction.editReply({ content: `❌ An error occurred during the transfer. Please try again later.`, ephemeral: true });
    }
  },

  // ------------------- Handle autocomplete for transfer command -------------------
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    await handleTransferAutocomplete(interaction, focusedOption);
  },
};


