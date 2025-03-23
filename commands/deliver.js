// ------------------- Standard Libraries -------------------


// ------------------- Discord.js Components -------------------
const { SlashCommandBuilder } = require('discord.js');

// ------------------- Database Services -------------------
const { fetchCharacterByName, fetchCharacterByNameAndUserId, getCharacterInventoryCollection } = require('../database/characterService');
const { getOrCreateToken, updateTokenBalance } = require('../database/tokenService');

// ------------------- Utility Functions -------------------
const { capitalizeWords } = require('../modules/formattingModule');
const { addItemInventoryDatabase, removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const { generateUniqueId } = require('../utils/uniqueIdUtils');
const { deleteSubmissionFromStorage, retrieveSubmissionFromStorage, saveSubmissionToStorage } = require('../utils/storage');

// ------------------- Database Models -------------------
const ItemModel = require('../models/ItemModel');

// ------------------- Google Sheets API -------------------
const { appendSheetData, authorizeSheets, extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/googleSheetsUtils');

// ------------------- Temporary In-Memory Storage -------------------
const deliveryTasks = {};


// ------------------- Deliver Command Definition -------------------
module.exports = {
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
            opt.setName('stocksource')
              .setDescription('The vending stock source character')
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addStringOption(opt =>
            opt.setName('courier')
              .setDescription('Courier character who will carry the stock')
              .setRequired(true)
              .setAutocomplete(true)
          )
          .addStringOption(opt =>
            opt.setName('vendor')
              .setDescription('The vendor receiving this stock delivery')
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
              .setDescription('Quantity of item to deliver')
              .setRequired(true)
          )
          .addStringOption(opt =>
            opt.setName('flavortext')
              .setDescription('Optional flavor text or delivery note')
              .setRequired(false)
          )
      ),

  // ------------------- Main Execute Handler -------------------
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
        { name: `__🆔 Delivery ID__`, value: `\`\`\`${deliveryId}\`\`\``, inline: false },
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
    console.error('[deliver.js]: Error processing delivery request', error);
    return interaction.reply({
      content: `❌ An unexpected error occurred while creating the delivery task. Please try again later.`,
      ephemeral: true,
    });
  }
}

 // ------------------- Delivery Acceptance Handler -------------------
if (subcommand === 'accept') {
  try {
    // ------------------- Extract command options -------------------
    const courierName = interaction.options.getString('courier');
    const deliveryId = interaction.options.getString('deliveryid');

    // ------------------- Retrieve delivery task from storage -------------------
    const delivery = retrieveSubmissionFromStorage(deliveryId);
    console.log(`[deliver.js] Loaded delivery from storage:`, delivery);

    // ------------------- Validate: Delivery exists -------------------
    if (!delivery) {
      return interaction.reply({
        content: `❌ No delivery task found with ID **${deliveryId}**.`,
        ephemeral: true,
      });
    }

    // ------------------- Validate: Courier matches assigned courier -------------------
    if (delivery.courier !== courierName) {
      return interaction.reply({
        content: `❌ That delivery is not assigned to **${courierName}**.`,
        ephemeral: true,
      });
    }

    // ------------------- Validate: Delivery is still pending -------------------
    if (delivery.status !== 'pending') {
      return interaction.reply({
        content: `⚠️ Delivery **${deliveryId}** has already been accepted or completed.`,
        ephemeral: true,
      });
    }

    // ------------------- Fetch courier and recipient character profiles -------------------
    const courierCharacter = await fetchCharacterByName(courierName);
    const recipientCharacter = await fetchCharacterByName(delivery.recipient);
    const senderCharacter = await fetchCharacterByName(delivery.sender); // Used for linking inventory

// ------------------- Prepare visual details -------------------
const recipientVillage = capitalizeWords(recipientCharacter?.currentVillage || 'Unknown');
const itemData = await ItemModel.findOne({ itemName: delivery.item });
const itemEmoji = itemData?.emoji && itemData.emoji.trim() !== '' ? itemData.emoji : '🔹';


    // ------------------- Construct the delivery acceptance embed -------------------
    const deliveryAcceptedEmbed = {
      title: `✅ Delivery Accepted!`,
      description: `**${courierName}** has accepted delivery task **${deliveryId}**!`,
      color: 0x57F287,
      thumbnail: {
        url: courierCharacter?.icon || 'https://default.image.url/fallback.png',
      },
      author: {
        name: `Courier: ${courierName}`,
        icon_url: courierCharacter?.icon || 'https://default.image.url/fallback.png',
        url: courierCharacter?.inventory || '',
      },
      footer: {
        text: `Recipient: ${delivery.recipient}`,
        icon_url: recipientCharacter?.icon || 'https://default.image.url/fallback.png',
        url: recipientCharacter?.inventory || '',
      },
      fields: [
        {
          name: `📦 Delivery Contents`,
          value: `> ${itemEmoji} **${itemData?.itemName || delivery.item}** x ${delivery.quantity}`,
          inline: false,
        },
        {
          name: `📤 Sender`,
          value: `> [**${delivery.sender}**](${senderCharacter?.inventory || ''})`,
          inline: true,
        },
        {
          name: `📥 Recipient`,
          value: `> [**${delivery.recipient}**](${recipientCharacter?.inventory || ''})`,
          inline: true,
        },
        {
          name: `📍 Instructions for Courier`,
          value: `> Courier, please use the **</travel:1317733980304310272>** command to journey to **${delivery.recipient}**'s village (**${recipientVillage}**).\n\n> Once you arrive, use **</deliver fulfill:1353035054753775646>** to complete the delivery.`,
        },
        {
          name: `💰 Instructions for Sender`,
          value: `> Please use **</gift:1306176789755858976>** to send item payment, or issue payment via any other agreed-upon method (e.g., art, rp, etc).`,
        },       
        ...(delivery.flavortext ? [{
          name: `📝 Flavor Text`,
          value: `> ${delivery.flavortext}`,
          inline: false,
        }] : []),
        { name: `__🆔 Delivery ID__`, value: `\`\`\`${deliveryId}\`\`\``, inline: false }
      ],
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
      },
      timestamp: new Date(),
    };
    
        // ------------------- Mark delivery status as accepted and persist -------------------
        delivery.status = 'accepted';
        saveSubmissionToStorage(deliveryId, delivery);

       
    // ------------------- Final bot reply with embed -------------------
    await interaction.reply({
      embeds: [deliveryAcceptedEmbed],
    });

  } catch (error) {
    console.error('[deliver.js]: Error processing delivery accept', error);
    return interaction.reply({
      content: `❌ An error occurred while accepting the delivery task.`,
      ephemeral: true,
    });
  }
}

// ------------------- Delivery Fulfillment Handler -------------------
if (subcommand === 'fulfill') {
  try {
    // ------------------- Defer initial reply to prevent timeout -------------------
    await interaction.deferReply();

    // ------------------- Setup context variables -------------------
    const auth = await authorizeSheets();
    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const uniqueSyncId = generateUniqueId('L');

    const courierName = interaction.options.getString('courier');
    const deliveryId = interaction.options.getString('deliveryid');

    // ------------------- Retrieve delivery task -------------------
    const delivery = retrieveSubmissionFromStorage(deliveryId);

    // ------------------- Validate delivery task -------------------
    if (!delivery) {
      return interaction.editReply(`❌ No delivery task found with ID **${deliveryId}**.`);
    }

    if (delivery.courier !== courierName) {
      return interaction.editReply(`❌ This delivery is not assigned to **${courierName}**.`);
    }

    if (delivery.status !== 'accepted') {
      return interaction.editReply(`⚠️ Delivery **${deliveryId}** must be accepted before it can be fulfilled.`);
    }

    // ------------------- Fetch character profiles -------------------
    const senderCharacter = await fetchCharacterByName(delivery.sender);
    const recipientCharacter = await fetchCharacterByName(delivery.recipient);

    // ------------------- Inventory sync validation -------------------
    const unsyncedCharacters = [];
    if (!senderCharacter.inventorySynced) unsyncedCharacters.push(`📤 **Sender**: ${senderCharacter.name}`);
    if (!recipientCharacter.inventorySynced) unsyncedCharacters.push(`📥 **Recipient**: ${recipientCharacter.name}`);

    if (unsyncedCharacters.length > 0) {
      return interaction.editReply(
        `❌ The following character(s) do not have their inventories synced:\n\n${unsyncedCharacters.join('\n')}\n\nPlease use \`/testinventorysetup\` and \`/syncinventory\` to complete setup.`
      );
    }

    // ------------------- Validate sender has the item -------------------
    const normalizedItemName = delivery.item.trim().toLowerCase();
    const senderInventory = await getCharacterInventoryCollection(senderCharacter.name);
    const itemRecord = await senderInventory.findOne({ itemName: { $regex: new RegExp(`^${normalizedItemName}$`, 'i') } });

    if (!itemRecord || itemRecord.quantity < delivery.quantity) {
      return interaction.editReply(`❌ ${senderCharacter.name} does not have enough **${delivery.item}** to fulfill this delivery.`);
    }

    // ------------------- Transfer item between inventories -------------------
    await removeItemInventoryDatabase(senderCharacter._id, delivery.item, delivery.quantity, interaction);
    await addItemInventoryDatabase(recipientCharacter._id, delivery.item, delivery.quantity, interaction);

    // ------------------- Google Sheets Logging -------------------
    const senderInventoryLink = senderCharacter.inventory || senderCharacter.inventoryLink;
    const recipientInventoryLink = recipientCharacter.inventory || recipientCharacter.inventoryLink;

    if (!isValidGoogleSheetsUrl(senderInventoryLink) || !isValidGoogleSheetsUrl(recipientInventoryLink)) {
      await interaction.followUp({
        content: `⚠️ Delivery was successful, but inventory logging to Google Sheets was skipped due to missing or invalid links.`,
        ephemeral: true,
      });
    } else {
      const senderSheetId = extractSpreadsheetId(senderInventoryLink);
      const recipientSheetId = extractSpreadsheetId(recipientInventoryLink);
      const range = 'loggedInventory!A2:M';

      const category = itemRecord?.category || '';
      const type = itemRecord?.type || '';
      const subtype = itemRecord?.subtype || '';

      const senderLog = [[
        senderCharacter.name,
        delivery.item,
        `-${delivery.quantity}`,
        Array.isArray(category) ? category.join(', ') : category,
        Array.isArray(type) ? type.join(', ') : type,
        Array.isArray(subtype) ? subtype.join(', ') : subtype,
        `Delivery to ${delivery.recipient}`,
        senderCharacter.job,
        '',
        senderCharacter.currentVillage,
        interactionUrl,
        timestamp,
        uniqueSyncId,
      ]];

      const recipientLog = [[
        recipientCharacter.name,
        delivery.item,
        `${delivery.quantity}`,
        Array.isArray(category) ? category.join(', ') : category,
        Array.isArray(type) ? type.join(', ') : type,
        Array.isArray(subtype) ? subtype.join(', ') : subtype,
        `Delivery from ${delivery.sender}`,
        recipientCharacter.job,
        '',
        recipientCharacter.currentVillage,
        interactionUrl,
        timestamp,
        uniqueSyncId,
      ]];

      try {
        await appendSheetData(auth, senderSheetId, range, senderLog);
      } catch (err) {
        console.error(`[deliver.js]: ❌ Failed to log sender delivery to Sheets:`, err);
        await interaction.followUp({
          content: `⚠️ Delivery was successful, but **sender's inventory logging to Google Sheets** failed.`,
          ephemeral: true,
        });
      }

      try {
        await appendSheetData(auth, recipientSheetId, range, recipientLog);
      } catch (err) {
        console.error(`[deliver.js]: ❌ Failed to log recipient delivery to Sheets:`, err);
        await interaction.followUp({
          content: `⚠️ Delivery was successful, but **recipient's inventory logging to Google Sheets** failed.`,
          ephemeral: true,
        });
      }
    }

    // ------------------- Mark delivery complete and remove from storage -------------------
    delivery.status = 'completed';
    deleteSubmissionFromStorage(deliveryId);

    // ------------------- Prepare final embed data -------------------
    const senderCharacterFull = await fetchCharacterByName(delivery.sender);
    const courierCharacter = await fetchCharacterByName(courierName);
    const recipientCharacterFull = await fetchCharacterByName(delivery.recipient);
    const itemData = await ItemModel.findOne({ itemName: delivery.item });
    const itemEmoji = itemData?.emoji && itemData.emoji.trim() !== '' ? itemData.emoji : '🔹';
    const senderMention = senderCharacterFull?.userId ? `<@${senderCharacterFull.userId}>` : delivery.sender;

    const deliveryCompleteEmbed = {
      title: `✅ Delivery Completed!`,
      description: `**${courierName}** has successfully delivered **${itemEmoji} ${delivery.item} x${delivery.quantity}** to **${delivery.recipient}** on behalf of **${delivery.sender}**!`,
      color: 0x57F287,
      author: {
        name: `Sender: ${delivery.sender}`,
        icon_url: senderCharacterFull?.icon || 'https://default.image.url/fallback.png',
        url: senderCharacterFull?.inventory || '',
      },
      footer: {
        text: `Recipient: ${delivery.recipient}`,
        icon_url: recipientCharacterFull?.icon || 'https://default.image.url/fallback.png',
        url: recipientCharacterFull?.inventory || '',
      },
      thumbnail: {
        url: courierCharacter?.icon || 'https://default.image.url/fallback.png',
      },
      fields: [
        {
          name: `📦 Delivery Summary`,
          value: `> ${itemEmoji} **${delivery.item}** x${delivery.quantity}\n> **From:** [${delivery.sender}](${senderCharacterFull?.inventory || ''})\n> **To:** [${delivery.recipient}](${recipientCharacterFull?.inventory || ''})`,
        },
        {
          name: `🪙 Courier Payout`,
          value: `> **[${courierName}](${courierCharacter?.inventory || ''})** has received **100 tokens** from the Couriers Guild for completing this delivery.`,
        },
        ...(delivery.flavortext ? [{
          name: `📝 Flavor Text`,
          value: `> ${delivery.flavortext}`,
        }] : []),
        {
          name: `⚠️ Payment Reminder`,
          value: `> Please use **</gift:1306176789755858976>** to send item payment, or issue payment via any other agreed-upon method (e.g., art, rp, etc).`,
        }        
      ],
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
      },
      timestamp: new Date(),
    };

    // ------------------- Payout tokens to courier -------------------
    try {
      const courierUserId = courierCharacter?.userId;
      if (courierUserId) {
        await updateTokenBalance(courierUserId, 100);

        const tokenData = await getOrCreateToken(courierUserId);
        const tokenTrackerLink = tokenData.tokenTracker;

        if (tokenTrackerLink && isValidGoogleSheetsUrl(tokenTrackerLink)) {
          const tokenSpreadsheetId = extractSpreadsheetId(tokenTrackerLink);
          const tokenRange = 'loggedTracker!B7:F';
          const tokenRow = [
            `${courierCharacter.name} - Courier Payout - Delivery ${deliveryId}`,
            interactionUrl,
            'Other',
            'earned',
            '+100',
          ];
          await appendSheetData(auth, tokenSpreadsheetId, tokenRange, [tokenRow]);
        }
      }
    } catch (err) {
      console.error(`[deliver.js]: Failed to log courier token payout:`, err);
    }   

    // ------------------- Final reply with embed -------------------
    await interaction.editReply({
      content: `${senderMention}, your delivery has been completed!`,
      embeds: [deliveryCompleteEmbed],
    });

  } catch (error) {
    console.error('[deliver.js]: Error processing delivery fulfillment', error);
    try {
      return interaction.editReply('❌ An error occurred while fulfilling the delivery task.');
    } catch (e) {
      console.error('[deliver.js]: Failed to edit reply after error', e);
    }
  }
}


// ------------------- Delivery Vending Handler ------------------
 

if (subcommand === 'vendingstock') {
  try {
    const stockSource = interaction.options.getString('stocksource');
    const courierName = interaction.options.getString('courier');
    const vendorName = interaction.options.getString('vendor');
    const rawItemName = interaction.options.getString('item');
    const itemName = rawItemName.trim();
    const quantity = interaction.options.getInteger('quantity');
    const flavortext = interaction.options.getString('flavortext') || null;

    // Validate roles — courier should not match source/vendor
    if (courierName === stockSource || courierName === vendorName) {
      return interaction.reply({
        content: `❌ Courier must be different from both the stock source and the vendor.`,
        ephemeral: true,
      });
    }

    // Generate Delivery ID
    const deliveryId = generateUniqueId('D');

    // Save delivery task with context
    const deliveryTask = {
      sender: stockSource,
      courier: courierName,
      recipient: vendorName,
      item: itemName,
      quantity,
      payment: 'Stock Transfer',
      flavortext,
      deliveryType: 'vendingstock',
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    deliveryTasks[deliveryId] = deliveryTask;
    saveSubmissionToStorage(deliveryId, deliveryTask);

    // Fetch character info for embed links
    const stockChar = await fetchCharacterByName(stockSource);
    const courierChar = await fetchCharacterByName(courierName);
    const vendorChar = await fetchCharacterByName(vendorName);
    const itemData = await ItemModel.findOne({ itemName });
    const itemEmoji = itemData?.emoji && itemData.emoji.trim() !== '' ? itemData.emoji : '🔹';

    // Build embed
    const deliveryEmbed = {
      title: `📦 Vending Stock Delivery Requested`,
      description: `**${vendorName}** has requested **${itemData?.itemName || itemName}** from **${stockSource}**'s stock, delivered by **${courierName}**.`,
      color: 0xAA926A,
      fields: [
        { name: `__📤 Stock Source__`, value: `> [**${stockSource}**](${stockChar?.inventory || ''})`, inline: true },
        { name: `__✉️ Courier__`, value: `> [**${courierName}**](${courierChar?.inventory || ''})`, inline: true },
        { name: `__📥 Vendor Recipient__`, value: `> [**${vendorName}**](${vendorChar?.inventory || ''})`, inline: true },
        { name: `__📦 Item to Deliver__`, value: `> ${itemEmoji} **${itemData?.itemName || itemName}** x${quantity}`, inline: false },
        ...(flavortext ? [{ name: `__📝 Flavor Text__`, value: `> ${flavortext}`, inline: false }] : []),
        { name: `__📋 Courier Instructions__`, value: `> Please use **</deliver accept:1353035054753775646>** to accept this vending stock task.` },
        { name: `__🆔 Delivery ID__`, value: `\`\`\`${deliveryId}\`\`\``, inline: false },
      ],
      image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
      timestamp: new Date(),
    };

    await interaction.reply({ embeds: [deliveryEmbed] });

  } catch (err) {
    console.error('[deliver.js]: Error handling vendingstock delivery:', err);
    return interaction.reply({
      content: `❌ An error occurred while creating the vending stock delivery task.`,
      ephemeral: true,
    });
  }
}

  },
};
