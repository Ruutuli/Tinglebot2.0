// ------------------- Standard Libraries -------------------


// ------------------- Discord.js Components -------------------
const { SlashCommandBuilder } = require('discord.js');

const { handleError } = require('../../utils/globalErrorHandler');
// ------------------- Database Services -------------------
const { fetchCharacterByName, fetchCharacterByNameAndUserId, getCharacterInventoryCollection, updateCharacterById } = require('../../database/characterService');
const { getOrCreateToken, updateTokenBalance } = require('../../database/tokenService');
const { getCurrentVendingStockList } = require('../../database/vendingService');

// ------------------- Utility Functions -------------------
const { capitalizeWords } = require('../../modules/formattingModule');
const { addItemInventoryDatabase, removeItemInventoryDatabase, addItemToVendingInventory } = require('../../utils/inventoryUtils');
const { generateUniqueId } = require('../../utils/uniqueIdUtils');
const { deleteSubmissionFromStorage, retrieveSubmissionFromStorage, saveSubmissionToStorage } = require('../../utils/storage');

// ------------------- Database Models -------------------
const ItemModel = require('../../models/ItemModel');

// ------------------- Google Sheets API -------------------
const { appendSheetData, authorizeSheets, extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../../utils/googleSheetsUtils');

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
              .setDescription('Item to deliver from the courier’s village vending stock that matches vendor type')
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
      )
      ,      

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
    handleError(error, 'deliver.js');

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

// ------------------- Fetch character profiles -------------------
const courierCharacter = await fetchCharacterByName(courierName);
const recipientCharacter = await fetchCharacterByName(delivery.recipient);
let senderCharacter;
if (delivery.deliveryType === 'vendingstock') {
  // For vending stock deliveries, we assume unlimited stock so set inventorySynced to true
  senderCharacter = {
    name: delivery.sender,
    inventory: '',
    icon: 'https://default.image.url/fallback.png',
    inventorySynced: true,
  };
} else {
  senderCharacter = await fetchCharacterByName(delivery.sender);
}

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

// ------------------- Prepare visual details -------------------
const recipientVillage = capitalizeWords(recipientCharacter?.currentVillage || 'Unknown');
const itemData = await ItemModel.findOne({ itemName: delivery.item });
const itemEmoji = itemData?.emoji && itemData.emoji.trim() !== '' ? itemData.emoji : '🔹';


    // ------------------- Construct the delivery acceptance embed -------------------
let deliveryAcceptedEmbed;

if (delivery.deliveryType === 'vendingstock') {
  // Custom embed for vending stock deliveries
  // Ensure recipientVillage is computed (assumed to be defined earlier or compute it here)
  const recipientVillage = capitalizeWords(recipientCharacter?.currentVillage || 'Unknown');
  
  deliveryAcceptedEmbed = {
    title: `✅ Vending Stock Delivery Accepted!`,
    description: `**${courierName}** has accepted the vending stock delivery task **${deliveryId}**!`,
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
      text: `Vendor: ${delivery.recipient}`,
      icon_url: recipientCharacter?.icon || 'https://default.image.url/fallback.png',
      url: recipientCharacter?.inventory || '',
    },
    fields: [
      {
        name: `📦 Item to Deliver`,
        value: `> ${itemEmoji} **${itemData?.itemName || delivery.item}** x ${delivery.quantity}`,
        inline: false,
      },
      {
        name: `🏪 Stock Source`,
        value: `> **${delivery.sender}**`,
        inline: true,
      },
      {
        name: `📥 Vendor Recipient`,
        value: `> [**${delivery.recipient}**](${recipientCharacter?.inventory || ''})`,
        inline: true,
      },
      {
        name: `💰 Payment`,
        value: `> ${delivery.payment}`,
        inline: false,
      },
      {
        name: `📍 Instructions for Courier`,
        value: `> Courier, please use the **</travel:1317733980304310272>** command to journey to the vendor's village (**${recipientVillage}**).\n\n> Once you arrive, use **</deliver fulfill:1353035054753775646>** to complete the vending stock delivery.`,
        inline: false,
      },
      ...(delivery.flavortext ? [{
        name: `📝 Flavor Text`,
        value: `> ${delivery.flavortext}`,
        inline: false,
      }] : []),
      { name: `__🆔 Delivery ID__`, value: `\`\`\`${deliveryId}\`\`\``, inline: false },
    ],
    image: {
      url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
    },
    timestamp: new Date(),
  };
} else {
  // Embed for normal deliveries remains unchanged
  deliveryAcceptedEmbed = {
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
}
    
        // ------------------- Mark delivery status as accepted and persist -------------------
        delivery.status = 'accepted';
        saveSubmissionToStorage(deliveryId, delivery);

       
    // ------------------- Final bot reply with embed -------------------
    await interaction.reply({
      embeds: [deliveryAcceptedEmbed],
    });

  } catch (error) {
    handleError(error, 'deliver.js');

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
    // Defer reply and set up context
    await interaction.deferReply();
    const auth = await authorizeSheets();
    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
    const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const uniqueSyncId = generateUniqueId('L');

    const courierName = interaction.options.getString('courier');
    const deliveryId = interaction.options.getString('deliveryid');

    // Retrieve and validate the delivery task
    const delivery = retrieveSubmissionFromStorage(deliveryId);
    if (!delivery) return interaction.editReply(`❌ No delivery task found with ID **${deliveryId}**.`);
    if (delivery.courier !== courierName) return interaction.editReply(`❌ This delivery is not assigned to **${courierName}**.`);
    if (delivery.status !== 'accepted') return interaction.editReply(`⚠️ Delivery **${deliveryId}** must be accepted before it can be fulfilled.`);

    // Fetch character profiles; for vendingstock deliveries, use a dummy sender (unlimited stock)
    let senderCharacter = (delivery.deliveryType === 'vendingstock')
      ? { name: delivery.sender, inventory: '', icon: 'https://default.image.url/fallback.png', inventorySynced: true }
      : await fetchCharacterByName(delivery.sender);
    const recipientCharacter = await fetchCharacterByName(delivery.recipient);
    const courierCharacter = await fetchCharacterByName(courierName);

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
    

    // ------------------- Process Delivery Based on Type -------------------
    if (delivery.deliveryType === 'vendingstock') {
      // Vending Stock Processing:
      // 1. Deduct vending points from the vendor
      const pointsDeducted = delivery.quantity * delivery.vendingPointsCost;
      await updateCharacterById(recipientCharacter._id, {
        vendingPoints: (recipientCharacter.vendingPoints || 0) - pointsDeducted,
      });
      console.log(`[deliver.js]: Deducted ${pointsDeducted} vending points from vendor ${recipientCharacter.name}.`);

      // 2. Add the delivered item to the vendor's vending inventory with full details
      await addItemToVendingInventory(recipientCharacter.name.toLowerCase(), {
        characterName: recipientCharacter.name,
        itemName: delivery.item,
        stockQty: delivery.quantity,
        costEach: delivery.vendingPointsCost,
        pointsSpent: delivery.vendingPointsCost * delivery.quantity,
        boughtFrom: delivery.sender,
        tokenPrice: 0,
        artPrice: 0,
        otherPrice: 0,
        tradesOpen: false,
        date: new Date(),
        shopImage: recipientCharacter.shopImage || '',
      });

      // 3. Log the vending stock delivery to the vendor's Google Sheet (range: vendingShop!A:K)
const shopLink = recipientCharacter.shopLink;
if (!isValidGoogleSheetsUrl(shopLink)) {
  await interaction.followUp({
    content: `⚠️ Delivery was successful, but logging to Google Sheets was skipped due to missing or invalid shop link.`,
    ephemeral: true,
  });
} else {
  const sheetId = extractSpreadsheetId(shopLink);
  const range = 'vendingShop!A:K';
  const currentMonthYear = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
  const values = [[
    recipientCharacter.name,                      // Vendor name
    delivery.item,                                // Delivered item
    delivery.quantity,                            // Quantity delivered
    delivery.vendingPointsCost || 0,              // Cost per unit (points)
    (delivery.vendingPointsCost || 0) * delivery.quantity, // Total cost (points spent)
    recipientCharacter.currentVillage,            // Vendor's village
    0,                                            // tokenPrice (default for delivery)
    0,                                            // artPrice (default for delivery)
    0,                                            // otherPrice (default for delivery)
    'No',                                         // tradesOpen (default for delivery)
    currentMonthYear,                             // Month/Year
  ]];
  await appendSheetData(auth, sheetId, range, values);
}

    } else {
      // Normal Delivery Processing:
      // 1. Validate sender's inventory has enough of the item
      const normalizedItemName = delivery.item.trim().toLowerCase();
      const senderInventory = await getCharacterInventoryCollection(senderCharacter.name);
      const itemRecord = await senderInventory.findOne({ 
        itemName: { $regex: new RegExp(`^${normalizedItemName}$`, 'i') }
      });
      if (!itemRecord || itemRecord.quantity < delivery.quantity) {
        return interaction.editReply(`❌ ${senderCharacter.name} does not have enough **${delivery.item}** to fulfill this delivery.`);
      }
      // 2. Transfer the item: remove from sender and add to recipient
      await removeItemInventoryDatabase(senderCharacter._id, delivery.item, delivery.quantity, interaction);
      await addItemInventoryDatabase(recipientCharacter._id, delivery.item, delivery.quantity, interaction);

      // 3. Log the transaction to the standard "loggedInventory" sheet
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
    handleError(err, 'deliver.js');

          console.error(`[deliver.js]: Failed to log sender delivery to Sheets:`, err);
          await interaction.followUp({
            content: `⚠️ Delivery was successful, but sender's logging to Google Sheets failed.`,
            ephemeral: true,
          });
        }
        try {
          await appendSheetData(auth, recipientSheetId, range, recipientLog);
        } catch (err) {
    handleError(err, 'deliver.js');

          console.error(`[deliver.js]: Failed to log recipient delivery to Sheets:`, err);
          await interaction.followUp({
            content: `⚠️ Delivery was successful, but recipient's logging to Google Sheets failed.`,
            ephemeral: true,
          });
        }
      }
    }

    // ------------------- Finalize Delivery -------------------
    delivery.status = 'completed';
    deleteSubmissionFromStorage(deliveryId);

    // Prepare final embed data
    const senderCharacterFull = (delivery.deliveryType === 'vendingstock')
      ? { name: delivery.sender, inventory: '' }
      : await fetchCharacterByName(delivery.sender);
    const recipientCharacterFull = await fetchCharacterByName(delivery.recipient);
    const itemData = await ItemModel.findOne({ itemName: delivery.item });
    const itemEmoji = (itemData?.emoji && itemData.emoji.trim() !== '') ? itemData.emoji : '🔹';
    const senderMention = senderCharacterFull?.userId ? `<@${senderCharacterFull.userId}>` : delivery.sender;

    // Build the delivery complete embed
    let deliveryCompleteEmbed;
    if (delivery.deliveryType === 'vendingstock') {
      const recipientVillage = capitalizeWords(recipientCharacter.currentVillage || 'Unknown');
      const pointsDeducted = delivery.quantity * delivery.vendingPointsCost;
      deliveryCompleteEmbed = {
        title: `✅ Delivery Completed!`,
        description: `Vending stock delivered! **${courierName}** has fulfilled the order of **${delivery.item} x${delivery.quantity}** for **${delivery.recipient}**. **${pointsDeducted} vending points** have been deducted from the vendor.`,
        color: 0x57F287,
        author: { name: `Stock Source: ${delivery.sender}`, icon_url: 'https://default.image.url/fallback.png', url: '' },
        footer: { text: `Vendor: ${delivery.recipient}`, icon_url: recipientCharacterFull?.icon || 'https://default.image.url/fallback.png', url: recipientCharacterFull?.inventory || '' },
        thumbnail: { url: courierCharacter?.icon || 'https://default.image.url/fallback.png' },
        fields: [
          { name: `📦 Delivery Summary`, value: `> ${itemEmoji} **${delivery.item}** x${delivery.quantity}\n> **From:** ${delivery.sender}\n> **To:** [${delivery.recipient}](${recipientCharacterFull?.inventory || ''})`, inline: false },
          { name: `🏅 Vending Points Deducted`, value: `> **${pointsDeducted} points**`, inline: true },
          { name: `🪙 Courier Payout`, value: `> **[${courierName}](${courierCharacter?.inventory || ''})** has received **100 tokens** from the Couriers Guild for completing this delivery.`, inline: false },
          { name: `ℹ️ Update Cost`, value: `> **${delivery.recipient}**, please use **</vending editshop:1306176790095728737>** to update the cost details for this item.`, inline: false },
          { name: `⚠️ Payment Reminder`, value: `> Please use **</gift:1306176789755858976>** to send item payment, or issue payment via any other agreed-upon method.`, inline: false },
          ...(delivery.flavortext ? [{ name: `📝 Flavor Text`, value: `> ${delivery.flavortext}`, inline: false }] : []),
        ],
        image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
        timestamp: new Date(),
      };
    } else {
      deliveryCompleteEmbed = {
        title: `✅ Delivery Completed!`,
        description: `**${courierName}** has successfully delivered **${itemEmoji} ${delivery.item} x${delivery.quantity}** to **${delivery.recipient}** on behalf of **${delivery.sender}**!`,
        color: 0x57F287,
        author: { name: `Sender: ${delivery.sender}`, icon_url: senderCharacterFull?.icon || 'https://default.image.url/fallback.png', url: senderCharacterFull?.inventory || '' },
        footer: { text: `Recipient: ${delivery.recipient}`, icon_url: recipientCharacterFull?.icon || 'https://default.image.url/fallback.png', url: recipientCharacterFull?.inventory || '' },
        thumbnail: { url: courierCharacter?.icon || 'https://default.image.url/fallback.png' },
        fields: [
          { name: `📦 Delivery Summary`, value: `> ${itemEmoji} **${delivery.item}** x${delivery.quantity}\n> **From:** [${delivery.sender}](${senderCharacterFull?.inventory || ''})\n> **To:** [${delivery.recipient}](${recipientCharacterFull?.inventory || ''})`, inline: false },
          { name: `🪙 Courier Payout`, value: `> **[${courierName}](${courierCharacter?.inventory || ''})** has received **100 tokens** from the Couriers Guild for completing this delivery.`, inline: true },
          ...(delivery.flavortext ? [{ name: `📝 Flavor Text`, value: `> ${delivery.flavortext}`, inline: false }] : []),
          { name: `⚠️ Payment Reminder`, value: `> Please use **</gift:1306176789755858976>** to send item payment, or issue payment via any other agreed-upon method.`, inline: false },
        ],
        image: { url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png' },
        timestamp: new Date(),
      };      
    }

    // ------------------- Payout Tokens to Courier (All Deliveries) -------------------
try {
  const courierUserId = courierCharacter?.userId;
  if (courierUserId) {  // Now paying out for all delivery types, including vendingstock
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
    handleError(err, 'deliver.js');

  console.error(`[deliver.js]: Failed to log courier token payout:`, err);
}


    // ------------------- Final Reply -------------------
    await interaction.editReply({
      content: `${senderMention}, your delivery has been completed!`,
      embeds: [deliveryCompleteEmbed],
    });
  } catch (error) {
    handleError(error, 'deliver.js');

    console.error('[deliver.js]: Error processing delivery fulfillment', error);
    try {
      return interaction.editReply('❌ An error occurred while fulfilling the delivery task.');
    } catch (e) {
    handleError(e, 'deliver.js');

      console.error('[deliver.js]: Failed to edit reply after error', e);
    }
  }
}

// ------------------- Delivery Vending Handler -------------------
if (subcommand === 'vendingstock') {
  try {
    // ------------------- Extract and validate inputs -------------------
    const recipientName = interaction.options.getString('recipient'); 
    const courierName = interaction.options.getString('courier');
    const rawItemName = interaction.options.getString('vendoritem');
    const itemName = rawItemName.trim();
    const quantity = interaction.options.getInteger('vendoritem_qty');
    const payment = interaction.options.getString('payment');
    const flavortext = interaction.options.getString('flavortext') || null;

    // ------------------- Fetch courier character to determine stock source -------------------
    const courierChar = await fetchCharacterByName(courierName);
    if (!courierChar) {
      return interaction.reply({
        content: `❌ Courier character **${courierName}** was not found.`,
        ephemeral: true,
      });
    }
    const courierVillage = courierChar.currentVillage?.trim() || 'Unknown Village';
    const stockSource = `${capitalizeWords(courierVillage)} Vending Stock`;

    // ------------------- Validate: courier must be different from recipient -------------------
    if (courierName === recipientName) {
      return interaction.reply({
        content: `❌ Courier must be different from the recipient (vendor).`,
        ephemeral: true,
      });
    }

    // ------------------- Generate Delivery ID -------------------
    const deliveryId = generateUniqueId('D');

    // ------------------- Fetch vendor (recipient) character -------------------
    const recipientChar = await fetchCharacterByName(recipientName);
    if (!recipientChar) {
      return interaction.reply({
        content: `❌ Vendor character **${recipientName}** was not found.`,
        ephemeral: true,
      });
    }


// ------------------- Determine vending points cost for the item -------------------
const vendingStock = await getCurrentVendingStockList();
if (!vendingStock || !vendingStock.stockList) {
  throw new Error('Vending stock list is unavailable. Please try again later.');
}
const currentVillage = recipientChar.currentVillage.toLowerCase().trim();
const villageStock = vendingStock.stockList[currentVillage] || [];
const limitedItems = vendingStock.limitedItems || [];
const limitedItem = limitedItems.find(item => item.itemName.toLowerCase() === itemName.toLowerCase());
// Try to find a village item matching both name and vendingType (vendor's job)
let villageItem = villageStock.find(item =>
  item.itemName.toLowerCase() === itemName.toLowerCase() &&
  item.vendingType.toLowerCase() === recipientChar.job.toLowerCase()
);
// Fallback: If not found, try matching by item name only.
if (!villageItem) {
  villageItem = villageStock.find(item => item.itemName.toLowerCase() === itemName.toLowerCase());
}
const vendingPointsCost = limitedItem ? limitedItem.points : (villageItem ? villageItem.points : null);
if (vendingPointsCost === null) {
  throw new Error(`Unable to determine vending points cost for item '${itemName}'.`);
}
const totalCost = quantity * vendingPointsCost;
if ((recipientChar.vendingPoints || 0) < totalCost) {
  return interaction.reply({
    content: `❌ Insufficient vending points. ${recipientName} only has ${(recipientChar.vendingPoints || 0)} points, but this delivery requires ${totalCost} points.`,
    ephemeral: true,
  });
}


    // Save the vending points cost in the delivery task
    const deliveryTask = {
      sender: stockSource,
      courier: courierName,
      recipient: recipientName,
      item: itemName,
      quantity,
      payment,
      flavortext,
      deliveryType: 'vendingstock',
      vendingPointsCost,  // New property to store cost per unit
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    // ------------------- Persist delivery task to memory/storage -------------------
    deliveryTasks[deliveryId] = deliveryTask;
    saveSubmissionToStorage(deliveryId, deliveryTask);

    // ------------------- Fetch item data for visual enhancement -------------------
    const itemData = await ItemModel.findOne({ itemName });
    const itemEmoji = itemData?.emoji && itemData.emoji.trim() !== '' ? itemData.emoji : '🔹';

    // ------------------- Build the delivery embed -------------------
    const deliveryEmbed = {
      title: `📦 Vending Stock Delivery Requested`,
      description: `**${recipientName}** has requested **${itemData?.itemName || itemName}** from **${stockSource}**, delivered by **${courierName}**.`,
      color: 0xAA926A,
      thumbnail: {
        url: courierChar?.icon || 'https://default.image.url/fallback.png',
      },
      author: {
        name: `Courier: ${courierName}`,
        icon_url: courierChar?.icon || 'https://default.image.url/fallback.png',
        url: courierChar?.inventory || '',
      },
      footer: {
        text: `Recipient: ${recipientName}`,
        icon_url: recipientChar?.icon || 'https://default.image.url/fallback.png',
        url: recipientChar?.inventory || '',
      },
      fields: [
        { name: `__✉️ Courier__`, value: `> [**${courierName}**](${courierChar?.inventory || ''})`, inline: true },
        { name: `__📥 Vendor Recipient__`, value: `> [**${recipientName}**](${recipientChar?.inventory || ''})`, inline: true },
        { name: `__📦 Item to Deliver__`, value: `> ${itemEmoji} **${itemData?.itemName || itemName}** x${quantity}`, inline: false },
        { name: `🏷️ Vending Points Cost`, value: `> ${vendingPointsCost} points per unit`, inline: true },
        { name: `💸 Total Cost`, value: `> ${totalCost} points`, inline: true },
        ...(flavortext ? [{ name: `__📝 Flavor Text__`, value: `> ${flavortext}`, inline: false }] : []),
        { name: `__📋 Courier Instructions__`, value: `> Please use **</deliver accept:1353035054753775646>** to accept this vending stock task.`, inline: false },
        { name: `__💰 Payment__`, value: `> ${payment}`, inline: false },
        { name: `__🆔 Delivery ID__`, value: `\`\`\`${deliveryId}\`\`\``, inline: false },
      ],      
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png',
      },
      timestamp: new Date(),
    };

    // ------------------- Prepare user mentions for clarity -------------------
    const courierUserId = courierChar?.userId || null;
    const recipientUserId = recipientChar?.userId || null;
    let mentionMessage = '';
    if (courierUserId && recipientUserId) {
      mentionMessage = `<@${recipientUserId}> is requesting vending stock delivery from <@${courierUserId}>!`;
    }

    // ------------------- Final reply with embed -------------------
    await interaction.reply({
      content: mentionMessage,
      embeds: [deliveryEmbed],
    });

  } catch (err) {
    handleError(err, 'deliver.js');

    console.error('[deliver.js]: Error handling vendingstock delivery:', err);
    return interaction.reply({
      content: `❌ An error occurred while creating the vending stock delivery task.`,
      ephemeral: true,
    });
  }
}





  },
};
