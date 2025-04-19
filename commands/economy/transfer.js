// ------------------- Standard Libraries -------------------
// Used for generating unique identifiers.
const { v4: uuidv4 } = require('uuid');


const { handleError } = require('../../utils/globalErrorHandler.js');
// ------------------- Discord.js Components -------------------
// Used to build and structure slash commands.
const { SlashCommandBuilder } = require('discord.js');


// ------------------- Database Services -------------------
// Service functions for character-related operations.
const { fetchCharacterByNameAndUserId, getCharacterInventoryCollection } = require('../../database/characterService.js');


// ------------------- Utility Functions -------------------
// Inventory utility functions for modifying character inventories.
const { addItemInventoryDatabase, removeItemInventoryDatabase } = require('../../utils/inventoryUtils.js');


// ------------------- Database Models -------------------
// Model representing item data.
const ItemModel = require('../../models/ItemModel.js');


// ------------------- Modules -------------------
// Custom modules for creating embed messages and handling autocomplete.
const { createTransferEmbed } = require('../../embeds/embeds.js');

// ------------------- Google Sheets API -------------------
// Utility functions for working with Google Sheets.
const { authorizeSheets, appendSheetData, isValidGoogleSheetsUrl, extractSpreadsheetId } = require('../../utils/googleSheetsUtils.js');


// ------------------- Slash Command Definition for Item Transfer -------------------
// This command transfers items between characters.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('transfer')
    .setDescription('Transfer items between characters')
    .addStringOption(option =>
      option.setName('fromcharacter')
        .setDescription('The character transferring the items')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('tocharacter')
        .setDescription('The character receiving the items')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(option =>
      option.setName('itema')
        .setDescription('First item to be transferred')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option.setName('quantitya')
        .setDescription('Quantity of the first item')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('itemb')
        .setDescription('Second item to be transferred')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option.setName('quantityb')
        .setDescription('Quantity of the second item')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('itemc')
        .setDescription('Third item to be transferred')
        .setRequired(false)
        .setAutocomplete(true)
    )
    .addIntegerOption(option =>
      option.setName('quantityc')
        .setDescription('Quantity of the third item')
        .setRequired(false)
    ),

  // ------------------- Main Execution Function for Transfer Command -------------------
  async execute(interaction) {
    await interaction.deferReply();

    // Retrieve transfer details from user input.
    const fromCharacterName = interaction.options.getString('fromcharacter');
    const toCharacterName = interaction.options.getString('tocharacter');
    const items = [
      { name: interaction.options.getString('itema'), quantity: interaction.options.getInteger('quantitya') },
      { name: interaction.options.getString('itemb'), quantity: interaction.options.getInteger('quantityb') },
      { name: interaction.options.getString('itemc'), quantity: interaction.options.getInteger('quantityc') }
    ].filter(item => item.name && item.quantity); // Filter out invalid items.

    const userId = interaction.user.id;

    try {
      // ------------------- Fetch Characters -------------------
      // Retrieve the source and destination characters using the provided names and user ID.
      const fromCharacter = await fetchCharacterByNameAndUserId(fromCharacterName, userId);
      const toCharacter = await fetchCharacterByNameAndUserId(toCharacterName, userId);

      if (!fromCharacter || !toCharacter) {
        await interaction.editReply({ content: `❌ Either the source or destination character does not exist or does not belong to you.`, ephemeral: true });
        return;
      }

      // ------------------- Inventory Sync Check -------------------
      // Ensure both characters have their inventories properly synced.
      if (!fromCharacter.inventorySynced) {
        return interaction.editReply({
          content: `❌ **You cannot transfer items from \`${fromCharacterName}\` because their inventory is not set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> commands to initialize the inventory.**`,
          ephemeral: true,
        });
      }

      if (!toCharacter.inventorySynced) {
        return interaction.editReply({
          content: `❌ **You cannot transfer items to \`${toCharacterName}\` because their inventory is not set up yet.**`,
          ephemeral: true,
        });
      }

      // ------------------- Check Item Availability -------------------
      // Verify that the source character has enough of each item to be transferred.
      let allItemsAvailable = true;
      const unavailableItems = [];
      const fromInventoryCollection = await getCharacterInventoryCollection(fromCharacter.name);

      console.log(`[transfer.js:logs] Starting item availability check for character: ${fromCharacterName}`);

      for (const { name, quantity } of items) {
        console.log(`[transfer.js:logs] Checking availability for item: ${name} (Required: ${quantity})`);

        // Retrieve all matching inventory entries (case-insensitive).
        const fromInventoryEntries = await fromInventoryCollection.find({ itemName: new RegExp(`^${name}$`, 'i') }).toArray();

        // Calculate the total available quantity.
        const totalQuantity = fromInventoryEntries.reduce((sum, entry) => sum + entry.quantity, 0);
        console.log(`[transfer.js:logs] Total quantity of '${name}' in inventory: ${totalQuantity} (Required: ${quantity})`);

        if (totalQuantity < quantity) {
          console.log(`[transfer.js:logs] Insufficient quantity for item '${name}' (Available: ${totalQuantity}, Required: ${quantity}).`);
          unavailableItems.push(`${name} - QTY:${totalQuantity}`);
          allItemsAvailable = false;
        } else {
          console.log(`[transfer.js:logs] Sufficient quantity available for '${name}' (Total: ${totalQuantity}, Required: ${quantity}).`);
        }
      }

      if (!allItemsAvailable) {
        console.log(`[transfer.js:logs] Items unavailable for transfer: ${unavailableItems.join(', ')}`);
        await interaction.editReply(`❌ \`${fromCharacterName}\` does not have enough of the following items to transfer: ${unavailableItems.join(', ')}`);
        return;
      }

      // ------------------- Validate Google Sheets URLs -------------------
      // Ensure that both characters have valid Google Sheets URLs for their inventories.
      const fromInventoryLink = fromCharacter.inventory || fromCharacter.inventoryLink;
      const toInventoryLink = toCharacter.inventory || toCharacter.inventoryLink;

      if (!fromInventoryLink || !toInventoryLink || !isValidGoogleSheetsUrl(fromInventoryLink) || !isValidGoogleSheetsUrl(toInventoryLink)) {
        await interaction.editReply({ content: `❌ Invalid or missing Google Sheets URL for character inventory.`, ephemeral: true });
        return;
      }

      // Extract spreadsheet IDs and authorize Google Sheets API.
      const fromSpreadsheetId = extractSpreadsheetId(fromInventoryLink);
      const toSpreadsheetId = extractSpreadsheetId(toInventoryLink);
      const auth = await authorizeSheets();
      const range = 'loggedInventory!A2:M';
      const uniqueSyncId = uuidv4();
      const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

      const formattedItems = [];

      // ------------------- Perform Transfer and Update Google Sheets -------------------
      // Process each item: remove from source, add to destination, and log the transfer in Google Sheets.
      for (const { name, quantity } of items) {
        await removeItemInventoryDatabase(fromCharacter._id, name, quantity);
        await addItemInventoryDatabase(toCharacter._id, name, quantity, interaction);

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
        formattedItems.push({ itemName: String(name), quantity, itemIcon });
      }

      // ------------------- Create and Send Transfer Embed -------------------
      // Generate a visual embed summarizing the transfer and send it to the user.
      const fromCharacterIcon = fromCharacter.icon || '🧙';
      const toCharacterIcon = toCharacter.icon || '🧙';

      const transferEmbed = createTransferEmbed(fromCharacter, toCharacter, formattedItems, interactionUrl, fromCharacterIcon, toCharacterIcon);

      await interaction.editReply({
        embeds: [transferEmbed]
      });

    } catch (error) {
    handleError(error, 'transfer.js');

      console.error(`[transfer.js:error] Error during item transfer:`, error);
      await interaction.editReply({ content: `❌ An error occurred during the transfer. Please try again later.`, ephemeral: true });
    }
  },

  // ------------------- Autocomplete Handler for Transfer Command -------------------
  async autocomplete(interaction) {
    const focusedOption = interaction.options.getFocused(true);
    await handleTransferAutocomplete(interaction, focusedOption);
  },
};
