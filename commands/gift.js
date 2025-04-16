// ------------------- Import necessary modules -------------------
const { SlashCommandBuilder } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
const {
  fetchCharacterByNameAndUserId,
  fetchAllCharactersExceptUser,
  getCharacterInventoryCollection,
} = require('../database/characterService');
const {
  addItemInventoryDatabase,
  removeItemInventoryDatabase,
} = require('../utils/inventoryUtils');
const {
  authorizeSheets,
  appendSheetData,
  isValidGoogleSheetsUrl,
  extractSpreadsheetId,
} = require('../utils/googleSheetsUtils');
const { v4: uuidv4 } = require('uuid');
const ItemModel = require('../models/ItemModel');
const { createGiftEmbed } = require('../embeds/mechanicEmbeds');
const { handleGiftAutocomplete } = require('../handlers/autocompleteHandler');

// ------------------- Main Gift Command Module -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('gift')
    .setDescription('Gift items from your character to another character')
    .addStringOption(option =>
      option
        .setName('fromcharacter')
        .setDescription('The character gifting the items')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('tocharacter')
        .setDescription('The character receiving the gifts')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option
        .setName('itema')
        .setDescription('First item to be gifted')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option
        .setName('quantitya')
        .setDescription('Quantity of the first item')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('itemb')
        .setDescription('Second item to be gifted')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option
        .setName('quantityb')
        .setDescription('Quantity of the second item')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('itemc')
        .setDescription('Third item to be gifted')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option
        .setName('quantityc')
        .setDescription('Quantity of the third item')
        .setRequired(false)
    ),

// ------------------- Main execute function for gifting -------------------
async execute(interaction) {
  await interaction.deferReply();

  // ------------------- Retrieve command options -------------------
  const fromCharacterName = interaction.options.getString('fromcharacter');
  const toCharacterName = interaction.options.getString('tocharacter');
  const items = [
    {
      name: interaction.options.getString('itema'),
      quantity: interaction.options.getInteger('quantitya'),
    },
    {
      name: interaction.options.getString('itemb'),
      quantity: interaction.options.getInteger('quantityb'),
    },
    {
      name: interaction.options.getString('itemc'),
      quantity: interaction.options.getInteger('quantityc'),
    },
  ].filter(item => item.name && item.quantity); // Remove undefined items

  const userId = interaction.user.id;

  try {
    // ------------------- Fetch characters -------------------
    const fromCharacter = await fetchCharacterByNameAndUserId(fromCharacterName, userId);
    if (!fromCharacter) {
      await interaction.editReply(`❌ Character \`${fromCharacterName}\` not found or does not belong to you.`);
      return;
    }

    const allCharacters = await fetchAllCharactersExceptUser(userId);
    const toCharacter = allCharacters.find(c => c.name === toCharacterName);
    if (!toCharacter) {
      await interaction.editReply(`❌ Character \`${toCharacterName}\` not found or belongs to you.`);
      return;
    }

    // Check if the fromCharacter's inventory has been synced
if (!fromCharacter.inventorySynced) {
  return interaction.editReply({
      content: `❌ **You cannot gift items from \`${fromCharacterName}\` because their inventory is not set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> commands to initialize the inventory.**`,
      ephemeral: true,
  });
}

// Check if the toCharacter's inventory has been synced
if (!toCharacter.inventorySynced) {
  return interaction.editReply({
      content: `❌ **You cannot gift items to \`${toCharacterName}\` because their inventory is not set up yet.**`,
      ephemeral: true,
  });
}

    const toCharacterOwnerId = toCharacter.userId;

    // ------------------- Check if both characters are in the same village -------------------
// Function to capitalize the first letter of each word
function capitalizeWords(str) {
  return str.replace(/\b\w/g, char => char.toUpperCase());
}

if (fromCharacter.currentVillage.trim().toLowerCase() !== toCharacter.currentVillage.trim().toLowerCase()) {
  const fromVillageCapitalized = capitalizeWords(fromCharacter.currentVillage.trim());
  const toVillageCapitalized = capitalizeWords(toCharacter.currentVillage.trim());

  await interaction.editReply(
    `❌ \`${fromCharacter.name}\` is in **${fromVillageCapitalized}**, and \`${toCharacter.name}\` is in **${toVillageCapitalized}**. Both characters must be in the same village for gifting. ` +
    `Please use the </travel:1306176790095728736> command to travel your character to \`${toVillageCapitalized}\`.`
  );
  return;
}


    // ------------------- Check item availability in fromCharacter's inventory -------------------
    const fromInventoryCollection = await getCharacterInventoryCollection(fromCharacter.name);
    let allItemsAvailable = true;
    const unavailableItems = [];

    for (const { name, quantity } of items) {
      const fromInventory = await fromInventoryCollection.findOne({
        itemName: { $regex: new RegExp(`^${name}$`, 'i') },
      });

      if (!fromInventory || fromInventory.quantity < quantity) {
        allItemsAvailable = false;
        unavailableItems.push(`${name} - QTY:${fromInventory ? fromInventory.quantity : 0}`);
      }
    }

    if (!allItemsAvailable) {
      await interaction.editReply(
        `❌ \`${fromCharacterName}\` does not have enough of the following items to gift: ${unavailableItems.join(', ')}`
      );
      return;
    }

    // ------------------- Validate Google Sheets URLs -------------------
    const fromInventoryLink = fromCharacter.inventory || fromCharacter.inventoryLink;
    const toInventoryLink = toCharacter.inventory || toCharacter.inventoryLink;

    if (!fromInventoryLink || !toInventoryLink) {
      await interaction.editReply({ content: `❌ Missing Google Sheets URL for character inventory.`, ephemeral: true });
      return;
    }

    if (!isValidGoogleSheetsUrl(fromInventoryLink) || !isValidGoogleSheetsUrl(toInventoryLink)) {
      await interaction.editReply({ content: `❌ Invalid Google Sheets URL for character inventory.`, ephemeral: true });
      return;
    }

    // ------------------- Prepare and sync data with Google Sheets -------------------
    const fromSpreadsheetId = extractSpreadsheetId(fromInventoryLink);
    const toSpreadsheetId = extractSpreadsheetId(toInventoryLink);
    const auth = await authorizeSheets();
    const range = 'loggedInventory!A2:M';
    const uniqueSyncId = uuidv4();
    const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

    const formattedItems = [];

    for (const { name, quantity } of items) {
      await removeItemInventoryDatabase(fromCharacter._id, name, quantity, interaction);  // Pass interaction
      await addItemInventoryDatabase(toCharacter._id, name, quantity, interaction);  // Pass interaction

      // ------------------- Fetch item details for logging -------------------
      const itemDetails = await ItemModel.findOne({ itemName: new RegExp(`^${name}$`, 'i') }).exec();
      const category = itemDetails?.category.join(', ') || '';
      const type = itemDetails?.type.join(', ') || '';
      const subtype = itemDetails?.subtype.join(', ') || '';

      // ------------------- Log item transfer in both characters' inventories -------------------
      const fromValues = [[
        fromCharacter.name, name, (-quantity).toString(), category, type, subtype,
        `Gift to ${toCharacterName}`, fromCharacter.job, '', fromCharacter.currentVillage,
        interactionUrl, formattedDateTime, uniqueSyncId
      ]];

      const toValues = [[
        toCharacter.name, name, quantity.toString(), category, type, subtype,
        `Gift from ${fromCharacterName}`, toCharacter.job, '', toCharacter.currentVillage,
        interactionUrl, formattedDateTime, uniqueSyncId
      ]];

      await appendSheetData(auth, fromSpreadsheetId, range, fromValues);
      await appendSheetData(auth, toSpreadsheetId, range, toValues);

      const itemIcon = itemDetails?.emoji || '🎁';
      formattedItems.push({ itemName: name, quantity, itemIcon });
    }

    // ------------------- Create and send gift embed -------------------
    const fromCharacterIcon = fromCharacter.icon || '🧙';
    const toCharacterIcon = toCharacter.icon || '🧙';
    const giftEmbed = createGiftEmbed(fromCharacter, toCharacter, formattedItems, fromInventoryLink, toInventoryLink, fromCharacterIcon, toCharacterIcon);

    await interaction.editReply({
      content: `<@${toCharacterOwnerId}>`,
      embeds: [giftEmbed]
    });

  } catch (error) {
    handleError(error, 'gift.js');

    console.error('❌ Error during gift execution:', error);
    await interaction.editReply('❌ An error occurred while trying to gift the items.');
  }
},

  // ------------------- Autocomplete handler for item selection -------------------
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    await handleGiftAutocomplete(interaction, focusedOption);
  },
};
