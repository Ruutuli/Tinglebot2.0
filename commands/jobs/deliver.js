// ------------------- Standard Libraries -------------------
const { SlashCommandBuilder } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler');

// ------------------- Database Services -------------------
const { 
  fetchCharacterByName, 
  fetchCharacterByNameAndUserId, 
  getCharacterInventoryCollection, 
  updateCharacterById, 
  getOrCreateToken, 
  updateTokenBalance, 
  getCurrentVendingStockList 
} = require('../../database/db');

// ------------------- Utility Functions -------------------
const { capitalizeWords } = require('../../modules/formattingModule');
const { addItemInventoryDatabase, removeItemInventoryDatabase, addItemToVendingInventory } = require('../../utils/inventoryUtils');
const { generateUniqueId } = require('../../utils/uniqueIdUtils');
const { deleteSubmissionFromStorage, retrieveSubmissionFromStorage, saveSubmissionToStorage } = require('../../utils/storage');

// ------------------- Database Models -------------------
const ItemModel = require('../../models/ItemModel');

// ------------------- Google Sheets API -------------------
const { 
  appendSheetData, 
  authorizeSheets, 
  extractSpreadsheetId, 
  isValidGoogleSheetsUrl,
  safeAppendDataToSheet 
} = require('../../utils/googleSheetsUtils');

// ------------------- Temporary In-Memory Storage -------------------
const deliveryTasks = {};

// ------------------- Command Definition -------------------
const command = {
  data: new SlashCommandBuilder()
    .setName('deliver')
    .setDescription('Manage delivery tasks')
    .addSubcommand(sub =>
      sub.setName('request')
        .setDescription('Request a delivery')
        .addStringOption(opt =>
          opt.setName('sender')
            .setDescription('Character paying for delivery')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('courier')
            .setDescription('Courier character')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('recipient')
            .setDescription('Recipient character')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('item')
            .setDescription('Item to deliver')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addIntegerOption(opt =>
          opt.setName('quantity')
            .setDescription('Quantity of the item to deliver')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('payment')
            .setDescription('Payment details; Item\'s or other agreed upon payments')
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName('flavortext')
            .setDescription('Optional flavor text or note to include in the delivery')
            .setRequired(false)
        )        
    )
    .addSubcommand(sub =>
        sub.setName('accept')
          .setDescription('Courier accepts a delivery task')
          .addStringOption(opt =>
            opt.setName('courier')
              .setDescription('Courier character accepting the delivery')
              .setRequired(true)
              .setAutocomplete(true) 
          )
          .addStringOption(opt =>
            opt.setName('deliveryid')
              .setDescription('Delivery ID to accept')
              .setRequired(true)
          )
      )         
      .addSubcommand(sub =>
        sub.setName('fulfill')
          .setDescription('Fulfill a delivery task if courier is in the correct village')
          .addStringOption(opt =>
            opt.setName('courier')
              .setDescription('Courier character fulfilling the delivery')
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addStringOption(opt =>
            opt.setName('deliveryid')
              .setDescription('Delivery ID to fulfill')
              .setRequired(true)
          )
      )
      .addSubcommand(sub =>
        sub.setName('vendingstock')
          .setDescription('Courier delivery of vending stock to a vendor')
          .addStringOption(opt =>
            opt.setName('recipient')
              .setDescription('Vendor receiving stock (must have a vending job); includes their current village')
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addStringOption(opt =>
            opt.setName('courier')
              .setDescription('Courier character who will carry the stock; includes their village')
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addStringOption(opt =>
            opt.setName('vendoritem')
              .setDescription("Item to deliver from the courier's village vending stock that matches vendor type")
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addIntegerOption(opt =>
            opt.setName('vendoritem_qty')
              .setDescription('Quantity of item to deliver')
              .setRequired(true)
          )
          .addStringOption(opt =>
            opt.setName('payment')
              .setDescription('Payment details for vending stock delivery (tokens, items, etc.)')
              .setRequired(true)
          )
          .addStringOption(opt =>
            opt.setName('flavortext')
              .setDescription('Optional flavor text or delivery note')
              .setRequired(false)
          )
      ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // ------------------- Delivery Request Handler -------------------
    if (subcommand === 'request') {
      try {
        // ------------------- Extract command options -------------------
        const senderName = interaction.options.getString('sender');
        const courierName = interaction.options.getString('courier');
        const recipientName = interaction.options.getString('recipient');

        // ------------------- Validate: Sender cannot be Recipient -------------------
        if (senderName === recipientName) {
          return interaction.reply({
            content: `❌ You cannot send a delivery to yourself.`,
            ephemeral: true,
          });
        }

        // ------------------- Validate: Courier cannot be Sender or Recipient -------------------
        if (courierName === senderName || courierName === recipientName) {
          return interaction.reply({
            content: `❌ Courier must be different from both the **sender** and **recipient**.`,
            ephemeral: true,
          });
        }

        // ------------------- Extract item and quantity -------------------
        const rawItemName = interaction.options.getString('item');
        const itemName = rawItemName.trim();
        const quantity = interaction.options.getInteger('quantity');

        // ------------------- Validate: Quantity must be at least 1 -------------------
        if (quantity < 1) {
          return interaction.reply({
            content: `❌ Quantity must be at least **1**.`,
            ephemeral: true,
          });
        }

        // ------------------- Extract payment and optional flavor text -------------------
        const payment = interaction.options.getString('payment');
        const flavortext = interaction.options.getString('flavortext') || null;

        // ------------------- Generate unique delivery ID -------------------
        const deliveryId = generateUniqueId('D');

        // ------------------- Validate: Prevent duplicate delivery ID (edge-case safety) -------------------
        if (retrieveSubmissionFromStorage(deliveryId)) {
          return interaction.reply({
            content: `❌ A delivery with ID **${deliveryId}** already exists. Please try again.`,
            ephemeral: true,
          });
        }

        // ------------------- Create delivery task object and persist to memory/storage -------------------
        const deliveryTask = {
          sender: senderName,
          courier: courierName,
          recipient: recipientName,
          item: itemName,
          quantity,
          payment,
          flavortext,
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        deliveryTasks[deliveryId] = deliveryTask;
        saveSubmissionToStorage(deliveryId, deliveryTask);

        // ------------------- Fetch character profiles -------------------
        const senderCharacter = await fetchCharacterByNameAndUserId(senderName, interaction.user.id);
        const courierCharacter = await fetchCharacterByName(courierName);
        const recipientCharacter = await fetchCharacterByName(recipientName);

        // ------------------- Ensure inventories are synced -------------------
        const unsynced = [];
        if (!senderCharacter.inventorySynced)
          unsynced.push(`📤 **Sender**: ${senderCharacter.name} ${senderCharacter.userId ? `(<@${senderCharacter.userId}>)` : ''}`);
        if (!recipientCharacter.inventorySynced)
          unsynced.push(`📥 **Recipient**: ${recipientCharacter.name} ${recipientCharacter.userId ? `(<@${recipientCharacter.userId}>)` : ''}`);
        if (unsynced.length > 0) {
          return interaction.reply({
            content: `❌ The following characters' inventories are not synced:\n\n${unsynced.join('\n')}\n\nPlease use \`/testinventorysetup\` and \`/syncinventory\` to complete setup.`,
            ephemeral: false,
          });
        }

        // ------------------- New Validation: Check Village Alignment -------------------
        const courierCurrentVillage = courierCharacter?.currentVillage?.trim().toLowerCase();
        const recipientCurrentVillage = recipientCharacter?.currentVillage?.trim().toLowerCase();

        if (!courierCurrentVillage || !recipientCurrentVillage || courierCurrentVillage !== recipientCurrentVillage) {
          return interaction.editReply(
            `❌ **Delivery Fulfillment Error:** The courier **${capitalizeWords(courierCharacter?.name || 'Unknown')}** and the vendor **${capitalizeWords(recipientCharacter?.name || 'Unknown')}** are not in the same village.\n\n` +
            `**Courier's Current Village:** ${capitalizeWords(courierCharacter?.currentVillage || 'Unknown')}\n` +
            `**Vendor's Current Village:** ${capitalizeWords(recipientCharacter?.currentVillage || 'Unknown')}\n\n` +
            `**Action Required:** Courier **${capitalizeWords(courierCharacter?.name || 'Unknown')}**, please use the **</travel:1317733980304310272>** command to journey to the vendor's village before fulfilling the delivery.`
          );
        }

        // ------------------- Validate village sync between sender and courier -------------------
        const senderVillage = senderCharacter?.currentVillage?.trim().toLowerCase();
        const courierVillage = courierCharacter?.currentVillage?.trim().toLowerCase();

        if (!senderVillage || !courierVillage || senderVillage !== courierVillage) {
          return interaction.reply({
            content: `❌ **${senderName}** and **${courierName}** must be in the same village to initiate a delivery.\n\n📤 Sender: **${capitalizeWords(senderCharacter?.currentVillage || 'Unknown')}**\n✉️ Courier: **${capitalizeWords(courierCharacter?.currentVillage || 'Unknown')}**`,
            ephemeral: true,
          });
        }

        // ------------------- Fetch item emoji for visual enhancement -------------------
        const itemData = await ItemModel.findOne({ itemName: itemName });
        const itemEmoji = itemData?.emoji && itemData.emoji.trim() !== '' ? itemData.emoji : '🔹';

        // ------------------- Construct the delivery request embed -------------------
        const deliveryEmbed = {
          title: `📦 Delivery Request Initiated!`,
          description: `**${senderName}** wants to hire **${courierName}** to make a delivery to **${recipientName}**!`,
          color: 0xAA926A,
          thumbnail: {
            url: courierCharacter?.icon || 'https://default.image.url/fallback.png',
          },
          author: {
            name: `Sender: ${senderName}`,
            icon_url: senderCharacter?.icon || 'https://default.image.url/fallback.png',
            url: senderCharacter?.inventory || '',
          },
          footer: {
            text: `Recipient: ${recipientName}`,
            icon_url: recipientCharacter?.icon || 'https://default.image.url/fallback.png',
            url: recipientCharacter?.inventory || '',
          },
          fields: [
            { name: `__📤 Sender__`, value: `> [**${senderName}**](${senderCharacter?.inventory || ''})`, inline: true },
            { name: `__✉️ Courier__`, value: `> [**${courierName}**](${courierCharacter?.inventory || ''})`, inline: true },
            { name: `__📥 Recipient__`, value: `> [**${recipientName}**](${recipientCharacter?.inventory || ''})`, inline: true },
            { name: `__📦 Item to Deliver__`, value: `> ${itemEmoji} **${itemData?.itemName || itemName}** x ${quantity}`, inline: false },
            { name: `__📍 Delivering From__`, value: `> **${capitalizeWords(senderCharacter?.currentVillage || 'Unknown')}**`, inline: true },
            { name: `__📍 Delivering To__`, value: `> **${capitalizeWords(recipientCharacter?.currentVillage || 'Unknown')}**`, inline: true },
            { name: `__💰 Payment__`, value: `> ${payment}`, inline: false },
            ...(flavortext ? [{ name: `__📝 Flavor Text__`, value: `> ${flavortext}`, inline: false }] : []),
            { name: `__📋 Courier Instructions__`, value: `> Please use **</deliver accept:1353035054753775646>** to accept this delivery task!`, inline: false },
          ],
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
          },
          timestamp: new Date(),
        };

        // ------------------- Prepare user mentions for clarity -------------------
        const senderUserId = senderCharacter?.userId || null;
        const courierUserId = courierCharacter?.userId || null;
        const recipientUserId = recipientCharacter?.userId || null;

        let mentionMessage = '';
        if (senderUserId && courierUserId && recipientUserId) {
          mentionMessage = `<@${senderUserId}> is requesting <@${courierUserId}> to deliver an item to <@${recipientUserId}>!`;
        }

        // ------------------- Final bot reply -------------------
        await interaction.reply({
          content: mentionMessage,
          embeds: [deliveryEmbed],
        });

      } catch (error) {
        handleError(error, 'deliver.js');
        return interaction.reply({
          content: `❌ An unexpected error occurred while creating the delivery task. Please try again later.`,
          ephemeral: true,
        });
      }
    }

    // ... rest of the subcommand handlers ...
  }
};

module.exports = command;
