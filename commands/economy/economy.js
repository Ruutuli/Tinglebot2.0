const {
 SlashCommandBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle,
 EmbedBuilder,
 MessageFlags,
} = require("discord.js");
const { handleError } = require("../../utils/globalErrorHandler.js");
const { handleTokenError } = require('../../utils/tokenUtils.js');
const { v4: uuidv4 } = require("uuid");
const {
 fetchCharacterByNameAndUserId,
 fetchCharacterByName,
 fetchAllCharactersExceptUser,
 getCharacterInventoryCollection,
 getOrCreateToken,
 updateTokenBalance,
 fetchItemByName
} = require("../../database/db.js");
const {
 addItemInventoryDatabase,
 removeItemInventoryDatabase,
 syncToInventoryDatabase,
} = require("../../utils/inventoryUtils.js");
const {
 authorizeSheets,
 appendSheetData,
 isValidGoogleSheetsUrl,
 extractSpreadsheetId,
 safeAppendDataToSheet,
} = require("../../utils/googleSheetsUtils.js");
const { checkInventorySync } = require("../../utils/characterUtils.js");
const ItemModel = require("../../models/ItemModel.js");
const ShopStock = require("../../models/VillageShopsModel");
const User = require("../../models/UserModel");
const {
 createGiftEmbed,
 createTradeEmbed,
 createTransferEmbed,
} = require("../../embeds/embeds.js");
const { hasPerk } = require("../../modules/jobsModule");
const TempData = require('../../models/TempDataModel');
const { generateUniqueId } = require('../../utils/uniqueIdUtils');
const DEFAULT_EMOJI = "🔹";

async function getItemEmoji(itemName) {
  try {
    const item = await ItemModel.findOne({ 
      itemName: { $regex: new RegExp(`^${itemName}$`, "i") }
    }).select("emoji").exec()
    const emoji = item && item.emoji ? item.emoji : DEFAULT_EMOJI;
    return emoji;
  } catch (error) {
    return DEFAULT_EMOJI;
  }
}

function removeCircularReferences(obj, seen = new WeakSet()) {
 if (obj && typeof obj === "object") {
  if (seen.has(obj)) return;
  seen.add(obj);
  for (const key in obj) {
   if (Object.prototype.hasOwnProperty.call(obj, key)) {
    obj[key] = removeCircularReferences(obj[key], seen);
   }
  }
 }
 return obj;
}

function capitalizeWords(str) {
 return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

function isSpiritOrb(itemName) {
  return itemName.toLowerCase() === 'spirit orb';
}

module.exports = {
 data: new SlashCommandBuilder()
  .setName("economy")
  .setDescription("Economy commands for gifts, shops, trades, and transfers")
  .addSubcommand((subcommand) =>
   subcommand
    .setName("gift")
    .setDescription("Gift items from your character to another character")
    .addStringOption((option) =>
     option
      .setName("fromcharacter")
      .setDescription("The character gifting the items")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("tocharacter")
      .setDescription("The character receiving the gifts")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("itema")
      .setDescription("First item to be gifted")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantitya")
      .setDescription("Quantity of the first item")
      .setRequired(true)
    )
    .addStringOption((option) =>
     option
      .setName("itemb")
      .setDescription("Second item to be gifted")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantityb")
      .setDescription("Quantity of the second item")
      .setRequired(false)
    )
    .addStringOption((option) =>
     option
      .setName("itemc")
      .setDescription("Third item to be gifted")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantityc")
      .setDescription("Quantity of the third item")
      .setRequired(false)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("shop-view")
    .setDescription("View items available in the shop")
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("shop-buy")
    .setDescription("Buy an item from the shop")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("The name of your character")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("itemname")
      .setDescription("The name of the item to buy")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantity")
      .setDescription("The quantity to buy")
      .setRequired(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("shop-sell")
    .setDescription("Sell an item to the shop")
    .addStringOption((option) =>
     option
      .setName("charactername")
      .setDescription("The name of your character")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("itemname")
      .setDescription("The name of the item to sell")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantity")
      .setDescription("The quantity to sell")
      .setRequired(true)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("trade")
    .setDescription("Trade items between two characters")
    .addStringOption((option) =>
     option
      .setName("fromcharacter")
      .setDescription("Your character name")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("tocharacter")
      .setDescription("Character name you are trading with")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("item1")
      .setDescription("First item to trade")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantity1")
      .setDescription("Quantity of the first item")
      .setRequired(true)
    )
    .addStringOption((option) =>
     option
      .setName("item2")
      .setDescription("Second item to trade")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantity2")
      .setDescription("Quantity of the second item")
      .setRequired(false)
    )
    .addStringOption((option) =>
     option
      .setName("item3")
      .setDescription("Third item to trade")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantity3")
      .setDescription("Quantity of the third item")
      .setRequired(false)
    )
    .addStringOption((option) =>
     option
      .setName("tradeid")
      .setDescription("Trade ID for completing a trade")
      .setRequired(false)
    )
  )
  .addSubcommand((subcommand) =>
   subcommand
    .setName("transfer")
    .setDescription("Transfer items between your characters")
    .addStringOption((option) =>
     option
      .setName("fromcharacter")
      .setDescription("The character transferring the items")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("tocharacter")
      .setDescription("The character receiving the items")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) =>
     option
      .setName("itema")
      .setDescription("First item to be transferred")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantitya")
      .setDescription("Quantity of the first item")
      .setRequired(true)
    )
    .addStringOption((option) =>
     option
      .setName("itemb")
      .setDescription("Second item to be transferred")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantityb")
      .setDescription("Quantity of the second item")
      .setRequired(false)
    )
    .addStringOption((option) =>
     option
      .setName("itemc")
      .setDescription("Third item to be transferred")
      .setRequired(false)
      .setAutocomplete(true)
    )
    .addIntegerOption((option) =>
     option
      .setName("quantityc")
      .setDescription("Quantity of the third item")
      .setRequired(false)
    )
  ),

 async execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
   case "gift":
    await handleGift(interaction);
    break;
   case "shop-view":
    await handleShopView(interaction);
    break;
   case "shop-buy":
    await handleShopBuy(interaction);
    break;
   case "shop-sell":
    await handleShopSell(interaction);
    break;
   case "trade":
    await handleTrade(interaction);
    break;
   case "transfer":
    await handleTransfer(interaction);
    break;
   default:
    await interaction.reply("Unknown subcommand");
  }
 },
};

async function handleGift(interaction) {
 await interaction.deferReply();
 const fromCharacterName = interaction.options.getString("fromcharacter");
 const toCharacterName = interaction.options.getString("tocharacter");
 const items = [
  {
   name: interaction.options.getString("itema"),
   quantity: interaction.options.getInteger("quantitya"),
  },
  {
   name: interaction.options.getString("itemb"),
   quantity: interaction.options.getInteger("quantityb"),
  },
  {
   name: interaction.options.getString("itemc"),
   quantity: interaction.options.getInteger("quantityc"),
  },
 ].filter((item) => item.name && item.quantity);

 // ------------------- Clean Item Names from Copy-Paste -------------------
// Remove quantity information from item names if users copy-paste autocomplete text
const cleanedItems = items.map(item => ({
  name: item.name.replace(/\s*\(Qty:\s*\d+\)/i, '').trim(),
  quantity: item.quantity
}));

// ------------------- Validate Gift Quantities -------------------
for (const { quantity } of cleanedItems) {
  if (quantity <= 0) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Invalid Quantity',
        description: 'You must gift a **positive quantity** of items. Negative numbers are not allowed.',
        image: {
          url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        footer: {
          text: 'Quantity Validation'
        }
      }],
      ephemeral: true,
    });
    return;
  }
}

// ------------------- NEW: Prevent gifting Spirit Orbs -------------------
for (const { name } of cleanedItems) {
  if (isSpiritOrb(name)) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Spirit Orb Protection',
        description: 'Spirit Orbs cannot be gifted. They are sacred items that can only be used by their original owner.',
        image: {
          url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        footer: {
          text: 'Item Protection'
        }
      }],
      ephemeral: true,
    });
    return;
  }
}

 const userId = interaction.user.id;

 try {
  const fromCharacter = await fetchCharacterByNameAndUserId(
    fromCharacterName,
    userId
  );
  if (!fromCharacter) {
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Character Not Found')
        .setDescription(`The character "${fromCharacterName}" does not exist in the database.`)
        .addFields(
          { name: '🔍 Possible Reasons', value: '• Character name is misspelled\n• Character was deleted\n• Character was never created' },
          { name: '💡 Suggestion', value: 'Please check the spelling and try again.' }
        )
        .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
        .setFooter({ text: 'Character Validation' })
        .setTimestamp()],
      ephemeral: true
    });
    return;
  }
  
  // ------------------- NEW: Prevent gifting equipped items -------------------
  const equippedItems = [
    fromCharacter.gearArmor?.head?.name,
    fromCharacter.gearArmor?.chest?.name,
    fromCharacter.gearArmor?.legs?.name,
    fromCharacter.gearWeapon?.name,
    fromCharacter.gearShield?.name,
  ].filter(Boolean); // remove undefineds
  
  for (const { name } of cleanedItems) {
    if (equippedItems.includes(name)) {
      await interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Item Equipped',
          description: `You cannot gift \`${name}\` because it is currently equipped. Please unequip it first using the </gear:1372262090450141196> command.`,
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Equipment Check'
          }
        }],
        ephemeral: true
      });
      return;
    }
  }

  const allCharacters = await fetchAllCharactersExceptUser(userId);
  if (allCharacters.length === 0) {
    console.log('[handleGift]: No characters found in fetchAllCharactersExceptUser. Possible DB connection issue.');
  }
  // Extract actual name from input (before '|'), trim, and compare case-insensitively
  const toCharacterActualName = toCharacterName.split('|')[0].trim().toLowerCase();
  const toCharacter = allCharacters.find((c) => c.name.trim().toLowerCase() === toCharacterActualName);
  if (!toCharacter) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Recipient Not Found',
      description: `Character \`${toCharacterName}\` not found or belongs to you.`,
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      footer: {
        text: 'Character Validation'
      }
    }],
    ephemeral: true
   });
   return;
  }

  // ------------------- Check Inventory Sync for Both Characters -------------------
  try {
    await checkInventorySync(fromCharacter);
    await checkInventorySync(toCharacter);
  } catch (error) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Inventory Not Synced',
        description: error.message,
        fields: [
          {
            name: 'How to Fix',
            value: '1. Use `/inventory test` to test your inventory\n2. Use `/inventory sync` to sync your inventory'
          }
        ],
        image: {
          url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        footer: {
          text: 'Inventory Sync Required'
        }
      }],
      ephemeral: true
    });
    return;
  }

  const toCharacterOwnerId = toCharacter.userId;

  if (
   fromCharacter.currentVillage.trim().toLowerCase() !==
   toCharacter.currentVillage.trim().toLowerCase()
  ) {
   const fromVillageCapitalized = capitalizeWords(
    fromCharacter.currentVillage.trim()
   );
   const toVillageCapitalized = capitalizeWords(
    toCharacter.currentVillage.trim()
   );

   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Different Villages',
      description: `\`${fromCharacter.name}\` is in **${fromVillageCapitalized}**, and \`${toCharacter.name}\` is in **${toVillageCapitalized}**. Both characters must be in the same village for gifting.`,
      fields: [
        {
          name: 'How to Fix',
          value: `Please use the </travel:1306176790095728736> command to travel your character to \`${toVillageCapitalized}\`.`
        }
      ],
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      footer: {
        text: 'Village Check'
      }
    }],
    ephemeral: true
   });
   return;
  }

  const fromInventoryCollection = await getCharacterInventoryCollection(
   fromCharacter.name
  );
  let allItemsAvailable = true;
  const unavailableItems = [];

  // Aggregate quantities for duplicate items (case-insensitive)
  const aggregatedItems = [];
  const itemMap = new Map();
  for (const { name, quantity } of cleanedItems) {
    const key = name.trim().toLowerCase();
    if (!itemMap.has(key)) {
      itemMap.set(key, { name, quantity });
    } else {
      itemMap.get(key).quantity += quantity;
    }
  }
  for (const entry of itemMap.values()) {
    aggregatedItems.push(entry);
  }

  for (const { name, quantity } of aggregatedItems) {
   const fromInventory = await fromInventoryCollection.findOne({
    itemName: { $regex: new RegExp(`^${name}$`, "i") },
   });

   if (!fromInventory || fromInventory.quantity < quantity) {
    allItemsAvailable = false;
    unavailableItems.push(
     `${name} - QTY:${fromInventory ? fromInventory.quantity : 0}`
    );
   }
  }

  if (!allItemsAvailable) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Insufficient Items',
      description: `\`${fromCharacterName}\` does not have enough of the following items to gift:`,
      fields: [
        ...unavailableItems.map(item => ({
          name: item,
          value: 'Insufficient quantity',
          inline: true
        })),
        {
          name: '💡 Tip',
          value: 'If you copied the item name from autocomplete, make sure to only use the item name (without the quantity in parentheses).',
          inline: false
        }
      ],
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      footer: {
        text: 'Inventory Check'
      }
    }],
    ephemeral: true
   });
   return;
  }

  const fromInventoryLink =
   fromCharacter.inventory || fromCharacter.inventoryLink;
  const toInventoryLink = toCharacter.inventory || toCharacter.inventoryLink;

  if (!fromInventoryLink || !toInventoryLink) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Missing Inventory Link',
      description: 'Missing Google Sheets URL for character inventory.',
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      footer: {
        text: 'Inventory Link Required'
      }
    }],
    ephemeral: true
   });
   return;
  }

  if (
   !isValidGoogleSheetsUrl(fromInventoryLink) ||
   !isValidGoogleSheetsUrl(toInventoryLink)
  ) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Invalid Inventory Link',
      description: 'Invalid Google Sheets URL for character inventory.',
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      footer: {
        text: 'Valid URL Required'
      }
    }],
    ephemeral: true
   });
   return;
  }

  const fromSpreadsheetId = extractSpreadsheetId(fromInventoryLink);
  const toSpreadsheetId = extractSpreadsheetId(toInventoryLink);
  const auth = await authorizeSheets();
  const range = "loggedInventory!A2:M";
  const uniqueSyncId = uuidv4();
  const formattedDateTime = new Date().toLocaleString("en-US", {
   timeZone: "America/New_York",
  });
  const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

  const formattedItems = [];

  for (const { name, quantity } of aggregatedItems) {
   // Remove from source inventory first
   const removeResult = await removeItemInventoryDatabase(
    fromCharacter._id,
    name,
    quantity,
    interaction,
    'Gift to ' + toCharacter.name
   );

   if (!removeResult) {
     await interaction.editReply({
       content: `❌ Failed to remove ${name} from your inventory. Please try again.`,
       ephemeral: true
     });
     return;
   }

   // Add to target inventory
   const addResult = await addItemInventoryDatabase(
    toCharacter._id, 
    name, 
    quantity, 
    interaction, 
    'Gift from ' + fromCharacter.name
   );

   if (!addResult) {
     // If adding to target fails, try to restore the item to source
     await addItemInventoryDatabase(
      fromCharacter._id,
      name,
      quantity,
      interaction,
      'Restored after failed gift'
     );
     await interaction.editReply({
       content: `❌ Failed to add ${name} to recipient's inventory. The item has been restored to your inventory.`,
       ephemeral: true
     });
     return;
   }

   // Item removals and additions are now automatically logged to Google Sheets by removeItemInventoryDatabase and addItemInventoryDatabase functions

   // Get item details for emoji
   try {
     const itemDetails = await fetchItemByName(name);
     const itemIcon = itemDetails?.emoji || "🎁";
     formattedItems.push({ itemName: name, quantity, itemIcon });
   } catch (error) {
     console.error(`[economy.js]: Failed to fetch item details for ${name}:`, error.message);
     formattedItems.push({ itemName: name, quantity, itemIcon: "🎁" });
   }
  }

  const fromCharacterIcon = fromCharacter.icon || "🧙";
  const toCharacterIcon = toCharacter.icon || "🧙";
  const giftEmbed = createGiftEmbed(
   fromCharacter,
   toCharacter,
   formattedItems,
   fromInventoryLink,
   toInventoryLink,
   fromCharacterIcon,
   toCharacterIcon
  );

  await interaction.channel.send({
    content: `🎁 <@${toCharacterOwnerId}>, you received a gift!`,
    allowedMentions: { users: [toCharacterOwnerId] },
    embeds: [giftEmbed],
  });
  await interaction.deleteReply();
  
  
 } catch (error) {
  handleError(error, "gift.js");
  console.error("❌ Error during gift execution:", error);
  await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Gift Error',
      description: 'An error occurred while trying to gift the items.',
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      footer: {
        text: 'Error Handling'
      }
    }],
    ephemeral: true
  });
 }
}

async function handleShopView(interaction) {
 try {
  await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
  
  // Add error handling for database connection
  let items;
  try {
    items = await ShopStock.find().sort({ itemName: 1 }).lean();
  } catch (dbError) {
    console.error("[shops]: Database connection error:", dbError);
    return interaction.editReply({ 
      content: "❌ Unable to connect to the shop database. Please try again later.",
      flags: [MessageFlags.Ephemeral]
    });
  }

  if (!items || items.length === 0) {
   return interaction.editReply({ 
     content: "❌ The shop is currently empty. Please try again later.",
     flags: [MessageFlags.Ephemeral]
   });
  }

  const ITEMS_PER_PAGE = 10;
  const pages = Math.ceil(items.length / ITEMS_PER_PAGE);
  let currentPage = 0;

  const generateEmbed = async (page) => {
   const start = page * ITEMS_PER_PAGE;
   const end = start + ITEMS_PER_PAGE;
   const itemsList = await Promise.all(
    items.slice(start, end).map(async (item) => {
     let itemDetails;
     try {
       itemDetails = await fetchItemByName(item.itemName);
     } catch (error) {
       console.error(`[shops]: Error fetching item details for ${item.itemName}:`, error);
       // Use fallback values if item details can't be fetched
       itemDetails = {
         buyPrice: "N/A",
         sellPrice: "N/A",
         emoji: "🛒"
       };
     }
     const buyPrice = itemDetails?.buyPrice || "N/A";
     const sellPrice = itemDetails?.sellPrice || "N/A";
     const emoji = itemDetails?.emoji || "🛒";
     return `__ ${emoji} **${item.itemName}**__ - Stock: ${item.stock}\n> 🪙 Buy Price: ${buyPrice} \n> 🪙 Sell Price: ${sellPrice}`;
    })
   );

   return new EmbedBuilder()
    .setTitle("🛒 Shop Inventory")
    .setDescription(itemsList.join("\n\n"))
    .setColor("#A48D68")
    .setImage(
     "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png"
    )
    .setFooter({ text: `Page ${page + 1} of ${pages}` });
  };

  // Pre-generate all embeds to avoid async operations during button clicks
  let embeds;
  try {
    embeds = await Promise.all(
      Array.from({ length: pages }, (_, i) => generateEmbed(i))
    );
  } catch (error) {
    console.error("[shops]: Error generating embeds:", error);
    return interaction.editReply("❌ An error occurred while loading the shop inventory. Please try again later.");
  }

  const generateButtons = (page) => {
   return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
     .setCustomId(`shop-prev-${page}`)
     .setLabel("⬅️Previous")
     .setStyle(ButtonStyle.Primary)
     .setDisabled(page === 0),
    new ButtonBuilder()
     .setCustomId(`shop-next-${page}`)
     .setLabel("Next➡️")
     .setStyle(ButtonStyle.Primary)
     .setDisabled(page === pages - 1)
   );
  };

  const message = await interaction.editReply({
   embeds: [embeds[currentPage]],
   components: [generateButtons(currentPage)],
  });

  const collector = message.createMessageComponentCollector({ 
    time: 300000, // 5 minutes
    filter: i => i.user.id === interaction.user.id 
  });

  collector.on("collect", async (i) => {
   try {
     // Immediately defer the update to prevent timeout
     await i.deferUpdate();

     if (i.customId.startsWith('shop-prev-')) {
       currentPage = Math.max(0, currentPage - 1);
     } else if (i.customId.startsWith('shop-next-')) {
       currentPage = Math.min(pages - 1, currentPage + 1);
     }

     // Use the pre-generated embed
     await i.editReply({
      embeds: [embeds[currentPage]],
      components: [generateButtons(currentPage)],
     }).catch(error => {
       if (error.code === 10062) {
         console.warn("[shops]: Interaction expired or already responded to");
         collector.stop();
       } else {
         throw error;
       }
     });
   } catch (error) {
     console.error("[shops]: Error handling button interaction:", error);
     try {
       await i.followUp({
         content: "❌ An error occurred while processing your request.",
         ephemeral: true
       }).catch(() => {}); // Ignore if this fails too
     } catch (replyError) {
       console.error("[shops]: Error sending error message:", replyError);
     }
   }
  });

  collector.on("end", async () => {
   try {
     const lastMessage = await interaction.fetchReply().catch(() => null);
     if (lastMessage) {
       await lastMessage.edit({ components: [] }).catch(() => {});
     }
   } catch (error) {
     console.error("[shops]: Error clearing buttons:", error);
   }
  });
 } catch (error) {
  console.error("[shops]: Error viewing shop items:", error);
  try {
    await interaction.editReply(
     "❌ An error occurred while viewing the shop inventory."
    ).catch(() => {}); // Ignore if this fails too
  } catch (replyError) {
    console.error("[shops]: Error sending error message:", replyError);
  }
 }
}

async function handleShopBuy(interaction) {
  try {
    await interaction.deferReply();

    const user = await getOrCreateToken(interaction.user.id);
    if (!user.tokensSynced) {
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Tokens Not Synced',
          description: 'Your tokens are not synced. Please sync your tokens to use this command.',
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Token Sync Required'
          }
        }],
        flags: [MessageFlags.Ephemeral]
      });
    }

    const characterName = interaction.options.getString("charactername");
    const itemName = interaction.options.getString("itemname");
    const quantity = interaction.options.getInteger("quantity");

    // ------------------- Validate Buy Quantity -------------------
    if (quantity <= 0) {
      await interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Invalid Quantity',
          description: 'You must buy a **positive quantity** of items. Negative numbers are not allowed.',
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Quantity Validation'
          }
        }],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }

    console.log(
      `[shops]: 🔄 Initiating purchase for character: ${characterName}, item: ${itemName}, quantity: ${quantity}`
    );

    // ------------------- Character Ownership Validation -------------------
    const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
    if (!character) {
      console.error(`[shops]: ❌ Character ${characterName} not found or does not belong to user ${interaction.user.id}`);
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Character Not Found',
          description: 'Character not found or does not belong to you.',
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Character Validation'
          }
        }],
        ephemeral: true
      });
    }

    // ------------------- Check Inventory Sync -------------------
    try {
      await checkInventorySync(character);
    } catch (error) {
      await interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Inventory Not Synced',
          description: error.message,
          fields: [
            {
              name: 'How to Fix',
              value: '1. Use `/inventory test` to test your inventory\n2. Use `/inventory sync` to sync your inventory'
            }
          ],
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Inventory Sync Required'
          }
        }],
        ephemeral: true
      });
      return;
    }

    // ------------------- Validate Shop Item -------------------
    const shopItem = await ShopStock.findOne({ 
      itemName: { $regex: new RegExp(`^${itemName}$`, 'i') }
    }).lean();
    
    if (!shopItem) {
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Item Not Available',
          description: `Item "${itemName}" is not available in the shop.`,
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Shop Validation'
          }
        }],
        ephemeral: true
      });
    }

    const shopQuantity = parseInt(shopItem.stock, 10);
    if (isNaN(shopQuantity)) {
      console.error(`[shops]: ❌ Invalid stock quantity for item ${itemName}: ${shopItem.stock}`);
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Invalid Stock',
          description: 'Shop item quantity is invalid. Please try again later.',
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Shop Validation'
          }
        }],
        ephemeral: true
      });
    }

    if (shopQuantity < quantity) {
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Insufficient Stock',
          description: `Not enough stock available. Only ${shopQuantity} ${itemName} remaining in the shop.`,
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Shop Validation'
          }
        }],
        ephemeral: true
      });
    }

    // ------------------- Validate Item Details -------------------
    const itemDetails = await ItemModel.findOne({ 
      itemName: { $regex: new RegExp(`^${itemName}$`, 'i') }
    })
     .select("buyPrice sellPrice category type image craftingJobs itemRarity")
     .lean();
    if (!itemDetails) {
     console.error(`[shops]: Item details not found in database: ${itemName}`);
     
     // Try a partial search to see if there are similar items
     const similarItems = await ItemModel.find({ 
       itemName: { $regex: new RegExp(itemName, 'i') }
     }).select("itemName buyPrice sellPrice").limit(5).lean();
     
     if (similarItems.length > 0) {
       console.log(`[shops]: 🔍 Similar items found:`, similarItems.map(item => ({
         itemName: item.itemName,
         buyPrice: item.buyPrice,
         sellPrice: item.sellPrice
       })));
     }
     
     return interaction.editReply("❌ Item details not found.");
    }

    console.log(
     `[shops]: Item details found. Buy price: ${itemDetails.buyPrice}, Sell price: ${itemDetails.sellPrice}, Category: ${itemDetails.category}, Crafting jobs: ${itemDetails.craftingJobs}`
    );

    if (!itemDetails.buyPrice || itemDetails.buyPrice <= 0) {
      console.error(`[shops]: ❌ Invalid buy price for item ${itemName}: ${itemDetails.buyPrice}`);
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Item Not For Sale',
          description: 'This item cannot be purchased from the shop.',
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Item Validation'
          }
        }],
        ephemeral: true
      });
    }

    const totalPrice = itemDetails.buyPrice * quantity;
    const currentTokens = user.tokens;

    if (currentTokens < totalPrice) {
      return interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Insufficient Tokens',
          description: `You do not have enough tokens to make this purchase.`,
          fields: [
            {
              name: 'Current Balance',
              value: `🪙 ${currentTokens}`,
              inline: true
            },
            {
              name: 'Required Amount',
              value: `🪙 ${totalPrice}`,
              inline: true
            },
            {
              name: 'Missing Amount',
              value: `🪙 ${totalPrice - currentTokens}`,
              inline: true
            }
          ],
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Token Balance Check'
          }
        }],
        ephemeral: true
      });
    }

    // ------------------- Process Purchase -------------------
    console.log(`[shops]: 💰 Token balance for ${interaction.user.tag}:`);
    console.log(`[shops]: 📊 Previous balance: 🪙 ${currentTokens}`);
    console.log(`[shops]: ➖ Spent: 🪙 ${totalPrice}`);
    console.log(`[shops]: 📊 New balance: 🪙 ${currentTokens - totalPrice}`);

    // Update inventory
    await addItemInventoryDatabase(
      character._id,
      itemName,
      quantity,
      interaction,
      'Purchase from shop'
    );
    console.log(`[economy.js]: 📦 Updated inventory for characterId: ${character._id}, item: ${itemName}, quantity: +${quantity}`);

    // Update shop stock
    await ShopStock.updateOne(
      { itemName: { $regex: new RegExp(`^${itemName}$`, 'i') } },
      { $set: { stock: shopQuantity - quantity } }
    );

    // Delete item if stock reaches 0
    if (shopQuantity - quantity <= 0) {
      await ShopStock.deleteOne({ 
        itemName: { $regex: new RegExp(`^${itemName}$`, 'i') } 
      });
    }

    // ------------------- Log Transaction -------------------
    const inventoryLink = character.inventory || "https://example.com/inventory/default";
    const tokenTrackerLink = user.tokenTracker || "https://example.com/tokens/default";
    const formattedDateTime = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
    });
    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

    // Log to token tracker
    if (user.tokenTracker) {
      const tokenRow = [
        `${characterName} - ${itemName} x${quantity} - Shop Purchase`,
        interactionUrl,
        "purchase",
        "spent",
        `-${totalPrice}`,
      ];
      await safeAppendDataToSheet(user.tokenTracker, character, "loggedTracker!B7:F", [tokenRow], undefined, { skipValidation: true });
    }

    // Log to inventory
    if (character.inventory) {
      const spreadsheetId = extractSpreadsheetId(character.inventory);
      const auth = await authorizeSheets();
      const inventoryRow = [
        character.name,
        itemName,
        quantity.toString(),
        itemDetails.category.join(", "),
        itemDetails.type.join(", "),
        itemDetails.subtype?.join(", ") || "",
        "Purchase from shop",
        character.job,
        "",
        character.currentVillage,
        interactionUrl,
        formattedDateTime,
        uuidv4(),
      ];
      await appendSheetData(auth, spreadsheetId, "loggedInventory!A2:M", [inventoryRow]);
    }

    // Update token balance
    await updateTokenBalance(interaction.user.id, -totalPrice);

    // ------------------- Send Success Message -------------------
    const purchaseEmbed = new EmbedBuilder()
      .setTitle("✅ Purchase Successful!")
      .setDescription(
        `**${characterName}** successfully bought **${itemName} x ${quantity}** for 🪙 ${totalPrice} tokens`
      )
      .setThumbnail(itemDetails.image || "https://via.placeholder.com/150")
      .setAuthor({ name: characterName, iconURL: character.icon || "" })
      .setColor("#A48D68")
      .setImage(
        "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png"
      )
      .addFields(
        {
          name: "📦 Inventory Link",
          value: `[View Inventory](${inventoryLink})`,
          inline: true,
        },
        {
          name: "🪙 Token Tracker",
          value: `[View Tracker](${tokenTrackerLink})`,
          inline: true,
        }
      )
      .setFooter({ text: `The village bazaars thank you for your purchase!` });

    await interaction.editReply({ embeds: [purchaseEmbed] });
  } catch (error) {
    handleError(error, "shops.js");
    console.error("[shops]: Error buying item:", error);
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Purchase Error',
        description: 'An error occurred while trying to buy the item. Please try again later.',
        image: {
          url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        footer: {
          text: 'Error Handling'
        }
      }],
      ephemeral: true
    });
  }
}

async function handleShopSell(interaction) {
 try {
  await interaction.deferReply();

  const characterName = interaction.options.getString("charactername");
  const itemNameRaw = interaction.options.getString("itemname");
  const quantity = interaction.options.getInteger("quantity");

  // ------------------- Clean Item Name from Copy-Paste -------------------
  // Remove quantity information from item names if users copy-paste autocomplete text
  const itemName = itemNameRaw.replace(/\s*\(Qty:\s*\d+\)/i, '').trim();

  const user = await User.findOne({ discordId: interaction.user.id });
  if (!user || !user.tokensSynced) {
    const { fullMessage } = handleTokenError(new Error('Invalid URL'), interaction);
    return interaction.editReply({
      content: fullMessage,
      ephemeral: true,
    });
  }

  // ------------------- Validate Sell Quantity -------------------
if (quantity <= 0) {
  await interaction.editReply({
    content: `❌ You must sell a **positive quantity** of items. Negative numbers are not allowed.`,
    ephemeral: true,
  });
  return;
}


  console.log(
   `[shops]: Initiating sale process for character: ${characterName}, item: ${itemName}, quantity: ${quantity}`
  );

  const character = await fetchCharacterByName(characterName);
  if (!character) {
   console.error(`[shops]: Character not found: ${characterName}`);
   return interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Character Not Found',
      description: 'Character not found.',
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      footer: {
        text: 'Character Validation'
      }
    }],
    ephemeral: true
   });
  }

  // Add ownership check
  if (character.userId !== interaction.user.id) {
    console.error(`[shops]: User ${interaction.user.id} attempted to sell items for character ${characterName} which belongs to ${character.userId}`);
    return interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Not Your Character',
        description: 'You can only sell items for characters that belong to you.',
        image: {
          url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        footer: {
          text: 'Character Ownership'
        }
      }],
      ephemeral: true
    });
  }

  // ------------------- Check Inventory Sync -------------------
  try {
    await checkInventorySync(character);
  } catch (error) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Inventory Not Synced',
        description: error.message,
        fields: [
          {
            name: 'How to Fix',
            value: '1. Use `/inventory test` to test your inventory\n2. Use `/inventory sync` to sync your inventory'
          }
        ],
        image: {
          url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        footer: {
          text: 'Inventory Sync Required'
        }
      }],
      ephemeral: true
    });
    return;
  }

  const inventoryCollection = await getCharacterInventoryCollection(
   characterName
  );
  const inventoryItem = await inventoryCollection.findOne({ itemName });

  // Get equipped items to check if we're trying to sell more than available non-equipped items
  const equippedItems = [
    character.gearArmor?.head?.name,
    character.gearArmor?.chest?.name,
    character.gearArmor?.legs?.name,
    character.gearWeapon?.name,
    character.gearShield?.name,
  ].filter(Boolean);
  
  // Check if the item is equipped
  const isEquipped = equippedItems.includes(itemName);
  
  if (isEquipped) {
    await interaction.editReply({
      content: `❌ You cannot sell \`${itemName}\` because it is currently equipped. Please unequip the item first if you want to sell it.`,
      ephemeral: true,
    });
    return;
  }

  if (!inventoryItem || parseInt(inventoryItem.quantity, 10) < quantity) {
   console.error(
    `[shops]: Insufficient inventory for item: ${itemName}. Available: ${
     inventoryItem?.quantity || 0
    }`
   );
   return interaction.editReply(
    "❌ Not enough of the item in your inventory to sell."
   );
  }

  console.log(
   `[shops]: Inventory item found. Quantity available: ${inventoryItem.quantity}`
  );

  const obtainMethod = inventoryItem.obtain.toLowerCase();
  const isCrafted = obtainMethod.includes("crafting") || obtainMethod.includes("crafted");
  console.log(`[shops]: Item crafted: ${isCrafted}, Obtain method: ${inventoryItem.obtain}`);

  if (!isCrafted) {
   console.warn(
    `[shops]: Item not crafted: ${itemName}. Obtain method: ${inventoryItem.obtain}`
   );
   console.log(`[shops]: Proceeding to sell item at the standard sell price.`);
  }

  const itemDetails = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${itemName}$`, 'i') } })
   .select("buyPrice sellPrice category type image craftingJobs itemRarity")
   .lean();
  
  // Add comprehensive logging for debugging
  console.log(`[shops]: 🔍 Searching for item: "${itemName}"`);
  console.log(`[shops]: 🔍 Query used: { itemName: { $regex: new RegExp("^${itemName}$", "i") } }`);
  
  if (!itemDetails) {
   console.error(`[shops]: Item details not found in database: ${itemName}`);
   
   // Try a partial search to see if there are similar items
   const similarItems = await ItemModel.find({ 
     itemName: { $regex: new RegExp(itemName, 'i') }
   }).select("itemName buyPrice sellPrice").limit(5).lean();
   
   if (similarItems.length > 0) {
     console.log(`[shops]: 🔍 Similar items found:`, similarItems.map(item => ({
       itemName: item.itemName,
       buyPrice: item.buyPrice,
       sellPrice: item.sellPrice
     })));
   }
   
   return interaction.editReply("❌ Item details not found.");
  }

  console.log(`[shops]: ✅ Item found in database: "${itemDetails.itemName}"`);
  console.log(`[shops]: 📊 Item details found. Buy price: ${itemDetails.buyPrice}, Sell price: ${itemDetails.sellPrice}, Category: ${itemDetails.category}, Crafting jobs: ${itemDetails.craftingJobs}`);
  console.log(`[shops]: 📊 Full item details:`, JSON.stringify(itemDetails, null, 2));

  // Determine the effective job for crafting (consider job vouchers)
  const effectiveJob = (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job;
  const normalizedCharacterJob = effectiveJob.toLowerCase();
  const normalizedCraftingJobs = itemDetails.craftingJobs.map((job) =>
   job.toLowerCase()
  );

  // Check if character has crafting perk with their effective job
  const characterMeetsRequirements =
   hasPerk({ ...character, job: effectiveJob }, "CRAFTING") &&
   normalizedCraftingJobs.includes(normalizedCharacterJob);

  console.log(
   `[shops]: Character job: ${character.job}, Effective job: ${effectiveJob}, Crafting jobs (normalized): ${normalizedCraftingJobs}`
  );
  console.log(
   `[shops]: Meets crafting requirements: ${characterMeetsRequirements}`
  );

  const sellPrice =
   isCrafted && characterMeetsRequirements
    ? itemDetails.buyPrice
    : itemDetails.sellPrice || 0;

  if (sellPrice <= 0) {
   console.warn(
    `[shops]: Invalid sell price for item: ${itemName}. Character job: ${character.job}, Item category: ${itemDetails.category}`
   );
   return interaction.editReply("❌ This item cannot be sold to the shop.");
  }

  console.log(`[shops]: Valid sell price determined: ${sellPrice}`);

  // Log the inventory update
  console.log(`[shops]: 🔄 Updating inventory - removing ${quantity}x ${itemName} from ${characterName}'s inventory`);
  await inventoryCollection.updateOne(
   { itemName },
   { $inc: { quantity: -quantity } }
  );

  console.log(`[shops]: Deducted ${quantity}x ${itemName} from inventory.`);

  // Log the shop stock update
  console.log(`[shops]: 🔄 Updating shop stock - adding ${quantity}x ${itemName} to shop stock`);
  
  // Update shop stock with correct item data
  await ShopStock.updateOne(
   { itemName: { $regex: new RegExp(`^${itemName}$`, 'i') } },
   { 
     $inc: { stock: quantity },
     $set: {
       itemName: itemName, // Ensure correct case
       buyPrice: itemDetails.buyPrice,
       sellPrice: itemDetails.sellPrice,
       category: itemDetails.category,
       type: itemDetails.type,
       image: itemDetails.image || 'No Image',
       itemRarity: itemDetails.itemRarity || 1
     }
   },
   { upsert: true }
  );

  console.log(`[shops]: Added ${quantity}x ${itemName} to shop stock.`);

  const totalPrice = sellPrice * quantity;

  await updateTokenBalance(interaction.user.id, totalPrice);

  console.log(`[shops]: 💰 Token balance for ${interaction.user.tag}:`);
  console.log(`[shops]: 📊 Previous balance: 🪙 ${user.tokens}`);
  console.log(`[shops]: ➕ Earned: 🪙 ${totalPrice}`);
  console.log(`[shops]: 📊 New balance: 🪙 ${user.tokens + totalPrice}`);

  if (user.tokenTracker) {
   const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
   const auth = await authorizeSheets();
   const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
   const tokenRow = [
    `${characterName} - Sold ${itemName} x${quantity}`,
    interactionUrl,
    "sale",
    "earned",
    `+${totalPrice}`,
   ];
   await safeAppendDataToSheet(user.tokenTracker, user, "loggedTracker!B7:F", [tokenRow], undefined, { skipValidation: true });
   console.log(`[shops]: Logged sale in token tracker.`);
  }

  if (character.inventory) {
   const spreadsheetId = extractSpreadsheetId(character.inventory);
   const auth = await authorizeSheets();
   const formattedDateTime = new Date().toISOString();
   const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
   const inventoryRow = [
    character.name,
    itemName,
    `-${quantity}`,
    itemDetails.category,
    itemDetails.type,
    "",
    "Sold to shop",
    character.job,
    "",
    character.currentVillage,
    interactionUrl,
    formattedDateTime,
    uuidv4(),
   ];
   
   await appendSheetData(auth, spreadsheetId, "loggedInventory!A2:M", [
    inventoryRow,
   ]);
   console.log(`[shops]: Logged sale in inventory tracker.`);
  }

  // Final verification and summary
  console.log(`[shops]: ✅ Sale process completed successfully!`);
  console.log(`[shops]: 📋 Sale Summary:`);
  console.log(`[shops]: 📋 - Character: ${characterName}`);
  console.log(`[shops]: 📋 - Item: ${itemName}`);
  console.log(`[shops]: 📋 - Quantity sold: ${quantity}`);
  console.log(`[shops]: 📋 - Price per item: ${sellPrice}`);
  console.log(`[shops]: 📋 - Total earned: ${totalPrice} tokens`);
  console.log(`[shops]: 📋 - Item data source: ItemModel (buyPrice: ${itemDetails.buyPrice}, sellPrice: ${itemDetails.sellPrice})`);
  console.log(`[shops]: 📋 - Crafter's Bonus Applied: ${crafterBonusApplied}`);
  console.log(`[shops]: 📋 - Item was crafted: ${isCrafted}`);
  console.log(`[shops]: 📋 - Character meets requirements: ${characterMeetsRequirements}`);
  console.log(`[shops]: 📋 - Character job: ${character.job}`);
  console.log(`[shops]: 📋 - Effective job: ${effectiveJob}`);
  console.log(`[shops]: 📋 - Item crafting jobs: ${itemDetails.craftingJobs}`);

  // Determine if crafter's bonus was applied
  const crafterBonusApplied = isCrafted && characterMeetsRequirements;
  const priceType = crafterBonusApplied ? "Crafter's Bonus (Buy Price)" : "Standard Sell Price";
  
  const saleEmbed = new EmbedBuilder()
   .setTitle("✅ Sale Successful!")
   .setDescription(
    `**${characterName}** successfully sold **${itemName} x ${quantity}** for 🪙 ${totalPrice} tokens`
   )
   .setThumbnail(itemDetails.image || "https://via.placeholder.com/150")
   .setAuthor({ name: characterName, iconURL: character.icon || "" })
   .setColor("#A48D68")
   .setImage(
    "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png"
   )
   .addFields(
    {
     name: "💰 Price Details",
     value: `**${priceType}**: 🪙 ${sellPrice} per item`,
     inline: true,
    },
    {
     name: "📦 Inventory Link",
     value: `[View Inventory](${
      character.inventory || "https://example.com/inventory"
     })`,
     inline: true,
    },
    {
     name: "🪙 Token Tracker",
     value: `[View Tracker](${
      user?.tokenTracker || "https://example.com/tokens"
     })`,
     inline: true,
    }
   );

  interaction.editReply({ embeds: [saleEmbed] });
 } catch (error) {
  handleError(error, "shops.js");
  console.error("[shops]: Error selling item:", error);
  const { fullMessage } = handleTokenError(error, interaction);
  await interaction.editReply({
    content: fullMessage,
    ephemeral: true,
  });
 }
}


async function handleTransfer(interaction) {
 await interaction.deferReply();

 const fromCharacterName = interaction.options.getString("fromcharacter");
 const toCharacterName = interaction.options.getString("tocharacter");
 const items = [
  {
   name: interaction.options.getString("itema"),
   quantity: interaction.options.getInteger("quantitya"),
  },
  {
   name: interaction.options.getString("itemb"),
   quantity: interaction.options.getInteger("quantityb"),
  },
  {
   name: interaction.options.getString("itemc"),
   quantity: interaction.options.getInteger("quantityc"),
  },
 ].filter((item) => item.name && item.quantity);

 // ------------------- Clean Item Names from Copy-Paste -------------------
// Remove quantity information from item names if users copy-paste autocomplete text
const cleanedItems = items.map(item => ({
  name: item.name.replace(/\s*\(Qty:\s*\d+\)/i, '').trim(),
  quantity: item.quantity
}));

 // ------------------- Validate Transfer Quantities -------------------
for (const { quantity } of cleanedItems) {
  if (quantity <= 0) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Invalid Quantity',
        description: 'You must transfer a **positive quantity** of items. Negative numbers are not allowed.',
        image: {
          url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        footer: {
          text: 'Quantity Validation'
        }
      }],
      ephemeral: true,
    });
    return;
  }
}


 const userId = interaction.user.id;

 try {
  const fromCharacter = await fetchCharacterByNameAndUserId(
   fromCharacterName,
   userId
  );
  const toCharacter = await fetchCharacterByNameAndUserId(
   toCharacterName,
   userId
  );

  if (!fromCharacter || !toCharacter) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Character Not Found',
      description: 'Either the source or destination character does not exist or does not belong to you.',
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      footer: {
        text: 'Character Validation'
      }
    }],
    ephemeral: true,
   });
   return;
  }

  // ------------------- NEW: Prevent using equipped items -------------------
const equippedItems = [
  fromCharacter.gearArmor?.head?.name,
  fromCharacter.gearArmor?.chest?.name,
  fromCharacter.gearArmor?.legs?.name,
  fromCharacter.gearWeapon?.name,
  fromCharacter.gearShield?.name,
].filter(Boolean);

for (const { name } of cleanedItems) {
  if (equippedItems.includes(name)) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Item Equipped',
        description: `You cannot transfer \`${name}\` because it is currently equipped. Please unequip it first using the </gear:1372262090450141196> command.`,
        image: {
          url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        footer: {
          text: 'Equipment Check'
        }
      }],
      ephemeral: true,
    });
    return;
  }
}


  // ------------------- Check Inventory Sync for Both Characters -------------------
  try {
    await checkInventorySync(fromCharacter);
    await checkInventorySync(toCharacter);
  } catch (error) {
    await interaction.editReply({
      embeds: [{
        color: 0xFF0000, // Red color
        title: '❌ Inventory Not Synced',
        description: error.message,
        fields: [
          {
            name: 'How to Fix',
            value: '1. Use `/inventory test` to test your inventory\n2. Use `/inventory sync` to sync your inventory'
          }
        ],
        image: {
          url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
        },
        footer: {
          text: 'Inventory Sync Required'
        }
      }],
      ephemeral: true
    });
    return;
  }

  let allItemsAvailable = true;
  const unavailableItems = [];
  const fromInventoryCollection = await getCharacterInventoryCollection(
   fromCharacter.name
  );

  console.log(
   `[transfer.js:logs] Starting item availability check for character: ${fromCharacterName}`
  );

  // Aggregate quantities for duplicate items (case-insensitive)
  const aggregatedItems = [];
  const itemMap = new Map();
  for (const { name, quantity } of cleanedItems) {
    const key = name.trim().toLowerCase();
    if (!itemMap.has(key)) {
      itemMap.set(key, { name, quantity });
    } else {
      itemMap.get(key).quantity += quantity;
    }
  }
  for (const entry of itemMap.values()) {
    aggregatedItems.push(entry);
  }

  for (const { name, quantity } of aggregatedItems) {
   console.log(
    `[transfer.js:logs] Checking availability for item: ${name} (Required: ${quantity})`
   );

   // Extract the base item name by removing any quantity in parentheses
   const baseItemName = name.replace(/\s*\(Qty:\s*\d+\)\s*$/, '').trim();

   // Find the canonical item name from the database first
   const itemDetails = await ItemModel.findOne({
     itemName: { $regex: new RegExp(`^${baseItemName}$`, "i") }
   }).exec();

   if (!itemDetails) {
     console.log(`[transfer.js:logs] Item not found in database: ${baseItemName}`);
     unavailableItems.push(`${baseItemName} - Not Found`);
     allItemsAvailable = false;
     continue;
   }

   // Use the canonical item name from the database
   const canonicalName = itemDetails.itemName;

   const fromInventoryEntries = await fromInventoryCollection
    .find({ itemName: { $regex: new RegExp(`^${canonicalName}$`, "i") } })
    .toArray();
   const totalQuantity = fromInventoryEntries.reduce(
    (sum, entry) => sum + entry.quantity,
    0
   );
   console.log(
    `[transfer.js:logs] Total quantity of '${canonicalName}' in inventory: ${totalQuantity} (Required: ${quantity})`
   );

   if (totalQuantity < quantity) {
     console.log(
      `[transfer.js:logs] Insufficient quantity for item '${canonicalName}' (Available: ${totalQuantity}, Required: ${quantity}).`
     );
     unavailableItems.push(`${canonicalName} - QTY:${totalQuantity}`);
     allItemsAvailable = false;
   } else {
     console.log(
      `[transfer.js:logs] Sufficient quantity available for '${canonicalName}' (Total: ${totalQuantity}, Required: ${quantity}).`
     );
   }
  }

  if (!allItemsAvailable) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Insufficient Items',
      description: `\`${fromCharacterName}\` does not have enough of the following items to transfer:`,
      fields: unavailableItems.map(item => ({
        name: item,
        value: 'Insufficient quantity',
        inline: true
      })),
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      footer: {
        text: 'Inventory Check'
      }
    }],
    ephemeral: true,
   });
   return;
  }

  const fromInventoryLink =
   fromCharacter.inventory || fromCharacter.inventoryLink;
  const toInventoryLink = toCharacter.inventory || toCharacter.inventoryLink;

  if (!fromInventoryLink || !toInventoryLink) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Missing Inventory Link',
      description: 'Missing Google Sheets URL for character inventory.',
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      footer: {
        text: 'Inventory Link Required'
      }
    }],
    ephemeral: true,
   });
   return;
  }

  if (!isValidGoogleSheetsUrl(fromInventoryLink) || !isValidGoogleSheetsUrl(toInventoryLink)) {
   await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Invalid Inventory Link',
      description: 'Invalid Google Sheets URL for character inventory.',
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      footer: {
        text: 'Valid URL Required'
      }
    }],
    ephemeral: true,
   });
   return;
  }

  const fromSpreadsheetId = extractSpreadsheetId(fromInventoryLink);
  const toSpreadsheetId = extractSpreadsheetId(toInventoryLink);
  const auth = await authorizeSheets();
  const range = "loggedInventory!A2:M";
  const uniqueSyncId = uuidv4();
  const formattedDateTime = new Date().toLocaleString("en-US", {
   timeZone: "America/New_York",
  });
  const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

  const formattedItems = [];

  for (const { name, quantity } of aggregatedItems) {
    // Find the canonical item name from the database
    const itemDetails = await ItemModel.findOne({
      itemName: new RegExp(`^${name}$`, "i"),
    }).exec();

    if (!itemDetails) {
      console.error(`[transfer.js:logs] Item not found in database: ${name}`);
      continue;
    }

    // Use the canonical item name from the database
    const canonicalName = itemDetails.itemName;
    const category = itemDetails?.category.join(", ") || "";
    const type = itemDetails?.type.join(", ") || "";
    const subtype = itemDetails?.subtype.join(", ") || "";

    // Remove from source (fromCharacter)
    const removeData = {
      characterId: fromCharacter._id,
      itemName: canonicalName,
      quantity: -quantity,
      category,
      type,
      subtype,
      obtain: `Transfer to ${toCharacterName}`,
      date: new Date(),
      synced: uniqueSyncId
    };
    await syncToInventoryDatabase(fromCharacter, removeData);

    // Add to target (toCharacter)
    const addData = {
      characterId: toCharacter._id,
      itemName: canonicalName,
      quantity: quantity,
      category,
      type,
      subtype,
      obtain: `Transfer from ${fromCharacterName}`,
      date: new Date(),
      synced: uniqueSyncId
    };
    await syncToInventoryDatabase(toCharacter, addData);

    const itemIcon = itemDetails?.emoji || "🎁";
    formattedItems.push({ itemName: canonicalName, quantity, itemIcon });
  }

  const fromCharacterIcon = fromCharacter.icon || "🧙";
  const toCharacterIcon = toCharacter.icon || "🧙";
  const transferEmbed = createTransferEmbed(
    fromCharacter,
    toCharacter,
    formattedItems,
    fromInventoryLink,
    toInventoryLink,
    fromCharacterIcon,
    toCharacterIcon
  );

  await interaction.editReply({
    allowedMentions: { users: [toCharacter.userId] },
    embeds: [transferEmbed],
  });
 } catch (error) {
  handleError(error, "transfer.js");
  console.error("❌ Error during transfer execution:", error);
  await interaction.editReply({
    embeds: [{
      color: 0xFF0000, // Red color
      title: '❌ Transfer Error',
      description: 'An error occurred while trying to transfer the items.',
      image: {
        url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
      },
      footer: {
        text: 'Error Handling'
      }
    }],
    ephemeral: true
  });
 }
}

// ============================================================================
// ------------------- Trade Interaction Handler -------------------
// Handles parsing of interaction options, item validation, and character verification.
// ============================================================================

// ------------------- Trade Session Management -------------------
// Handles creation, updates, and execution of trade sessions
async function createTradeSession(initiator, target, items) {
  console.log(`[trade.js]: 🔄 Creating trade session with items:`, items);
  const tradeId = generateUniqueId('T');
  const formattedInitiatorItems = await Promise.all(items.map(async item => {

    const emoji = await getItemEmoji(item.name);
    const formattedItem = {
      name: item.name,
      quantity: item.quantity,
      emoji: emoji,
    };
    return formattedItem;
  }));

  const tradeData = {
    initiator: {
      userId: initiator.userId,
      characterName: initiator.name,
      items: formattedInitiatorItems,
    },
    target: {
      userId: target.userId,
      characterName: target.name,
      items: [],
    },
    status: 'pending',
    createdAt: new Date(),
    initiatorConfirmed: false,
    targetConfirmed: false,
    messageId: null,
    channelId: null,
    confirmMessageId: null,
    confirmChannelId: null,
  };

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 34 hours
  await TempData.create({ key: tradeId, type: 'trade', data: tradeData, expiresAt });
  return tradeId;
}

// ------------------- Trade Session Update -------------------
async function updateTradeSession(tradeId, targetItems) {
  const formattedTargetItems = await Promise.all(targetItems.map(async item => {
    const emoji = await getItemEmoji(item.name);
    return {
      name: item.name,
      quantity: item.quantity,
      emoji: emoji,
    };
  }));

  await TempData.findOneAndUpdate(
    { key: tradeId, type: 'trade' },
    { $set: { 'data.target.items': formattedTargetItems } },
  );
  return (await TempData.findByTypeAndKey('trade', tradeId)).data;
}

// ------------------- Trade Confirmation -------------------
async function confirmTrade(tradeId, userId) {
  const trade = await TempData.findByTypeAndKey('trade', tradeId);
  if (!trade) {
    throw new Error('Trade not found');
  }

  const tradeData = trade.data;
  if (tradeData.initiator.userId === userId) {
    tradeData.initiatorConfirmed = true;
  } else if (tradeData.target.userId === userId) {
    tradeData.targetConfirmed = true;
  }

  trade.data = tradeData;
  trade.markModified('data');
  await trade.save();
  return tradeData;
}

// ------------------- Trade Execution -------------------
async function executeTrade(tradeData) {
  const { initiator, target } = tradeData;
  const initiatorChar = await fetchCharacterByNameAndUserId(initiator.characterName, initiator.userId);
  const targetChar = await fetchCharacterByNameAndUserId(target.characterName, target.userId);

  if (!initiatorChar || !targetChar) {
    throw new Error('Character not found for trade execution');
  }

  const uniqueSyncId = uuidv4();

  // Process items for both parties
  await Promise.all([
    processTradeItems(initiatorChar, targetChar, initiator.items, uniqueSyncId),
    processTradeItems(targetChar, initiatorChar, target.items, uniqueSyncId)
  ]);

  return true;
}

// ------------------- Trade Item Processing -------------------
async function processTradeItems(fromChar, toChar, items, uniqueSyncId) {
  for (const item of items) {
    const itemDetails = await ItemModel.findOne({
      itemName: new RegExp(`^${item.name}$`, "i"),
    }).exec();

    const category = itemDetails?.category.join(", ") || "";
    const type = itemDetails?.type.join(", ") || "";
    const subtype = itemDetails?.subtype.join(", ") || "";

    // Remove from sender
    const removeData = {
      characterId: fromChar._id,
      itemName: item.name,
      quantity: -item.quantity,
      category,
      type,
      subtype,
      obtain: `Trade to ${toChar.name}`,
      date: new Date(),
      synced: uniqueSyncId,
      characterName: fromChar.name
    };
    await syncToInventoryDatabase(fromChar, removeData);

    // Add to receiver
    const addData = {
      characterId: toChar._id,
      itemName: item.name,
      quantity: item.quantity,
      category,
      type,
      subtype,
      obtain: `Trade from ${fromChar.name}`,
      date: new Date(),
      synced: uniqueSyncId,
      characterName: toChar.name
    };
    await syncToInventoryDatabase(toChar, addData);
  }
}

// ------------------- Trade Message Management -------------------
async function updateTradeMessage(message, tradeData, fromCharacter, toCharacter) {
  const tradeEmbed = await createTradeEmbed(
    fromCharacter,
    toCharacter,
    tradeData.initiator.items,
    tradeData.target.items,
    message.url
  );
  tradeEmbed.setColor("#FFD700");

  if (tradeData.initiatorConfirmed && tradeData.targetConfirmed) {
    tradeEmbed.setDescription(`✅ Trade completed successfully!`);
    await message.edit({ content: null, embeds: [tradeEmbed], components: [] });
  } else {
    const statusDescription = 
      `🔃 Trade Status:\n` +
      `${tradeData.initiatorConfirmed ? '✅' : '⏳'} ${tradeData.initiator.characterName} confirmed\n` +
      `${tradeData.targetConfirmed ? '✅' : '⏳'} ${tradeData.target.characterName} confirmed\n\n` +
      `<@${tradeData.initiator.userId}>, please react with ✅ to confirm the trade!`;

    tradeEmbed.setDescription(statusDescription);
    await message.edit({ embeds: [tradeEmbed] });
  }
}

// ------------------- Trade Validation -------------------
async function validateTradeItems(character, items) {
  const characterInventoryCollection = await getCharacterInventoryCollection(character.name);
  const unavailableItems = [];
  for (const item of items) {
    const itemInventory = await characterInventoryCollection.findOne({
      itemName: { $regex: new RegExp(`^${item.name}$`, "i") },
    });
    if (!itemInventory || itemInventory.quantity < item.quantity) {
      unavailableItems.push({
        name: item.name,
        requested: item.quantity,
        available: itemInventory ? itemInventory.quantity : 0
      });
    }
  }
  if (unavailableItems.length > 0) {
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Insufficient Items")
      .setDescription(`\`${character.name}\` doesn't have enough of the following items to trade:`)
      .setColor("#FF0000")
      .addFields(
        unavailableItems.map(item => ({
          name: item.name,
          value: `Requested: ${item.requested}\nAvailable: ${item.available}`,
          inline: true
        }))
      )
      .setFooter({ text: "Please check your inventory and try again." });
    
    throw { embed: errorEmbed };
  }
}

// ------------------- Function: handleTrade -------------------
// Main handler for initiating or completing a trade session.
async function handleTrade(interaction) {
  const characterName = interaction.options.getString("fromcharacter");
  const item1 = interaction.options.getString("item1");
  const quantity1 = interaction.options.getInteger("quantity1");
  const item2 = interaction.options.getString("item2");
  const quantity2 = interaction.options.getInteger("quantity2") || 0;
  const item3 = interaction.options.getString("item3");
  const quantity3 = interaction.options.getInteger("quantity3") || 0;
  const tradingWithName = interaction.options.getString("tocharacter");
  const tradeId = interaction.options.getString("tradeid");
  const userId = interaction.user.id;

  try {
    await interaction.deferReply();

    // ------------------- Validate Item Existence -------------------
    const itemNamesToCheck = [item1, item2, item3].filter(Boolean);
    const missingItems = [];
    for (const name of itemNamesToCheck) {
      const exists = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${name}$`, "i") } }).lean();
      if (!exists) missingItems.push(name);
    }
    if (missingItems.length > 0) {
      await interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Invalid Items',
          description: 'The following item(s) do not exist:',
          fields: missingItems.map(name => ({
            name: name,
            value: 'Item not found in database',
            inline: true
          })),
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Item Validation'
          }
        }],
        ephemeral: true,
      });
      return;
    }

    // ------------------- Clean Item Names from Copy-Paste -------------------
    // Remove quantity information from item names if users copy-paste autocomplete text
    const cleanedItemArrayRaw = [
      { name: item1, quantity: quantity1 },
      { name: item2, quantity: quantity2 },
      { name: item3, quantity: quantity3 },
    ].filter((item) => item.name).map(item => ({
      name: item.name.replace(/\s*\(Qty:\s*\d+\)/i, '').trim(),
      quantity: item.quantity
    }));

    // ------------------- Validate Trade Quantities -------------------
    for (const { quantity } of cleanedItemArrayRaw) {
      if (quantity <= 0) {
        await interaction.editReply({
          embeds: [{
            color: 0xFF0000, // Red color
            title: '❌ Invalid Quantity',
            description: 'You must trade a **positive quantity** of items. Negative numbers are not allowed.',
            image: {
              url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
            },
            footer: {
              text: 'Quantity Validation'
            }
          }],
          ephemeral: true,
        });
        return;
      }
    }

    // ---- Aggregate duplicate items (case-insensitive) ----
    const itemMap = new Map();
    for (const { name, quantity } of cleanedItemArrayRaw) {
      const key = name.trim().toLowerCase();
      if (!itemMap.has(key)) {
        itemMap.set(key, { name, quantity });
      } else {
        itemMap.get(key).quantity += quantity;
      }
    }
    const itemArray = Array.from(itemMap.values());

    // ------------------- NEW: Prevent trading Spirit Orbs -------------------
    for (const { name } of itemArray) {
      if (isSpiritOrb(name)) {
        await interaction.editReply({
          embeds: [{
            color: 0xFF0000, // Red color
            title: '❌ Spirit Orb Protection',
            description: 'Spirit Orbs cannot be traded. They are sacred items that can only be used by their original owner.',
            image: {
              url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
            },
            footer: {
              text: 'Item Protection'
            }
          }],
          ephemeral: true,
        });
        return;
      }
    }

    // ------------------- Validate Characters -------------------
    const fromCharacter = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!fromCharacter) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Character Not Found')
          .setDescription(`The character "${characterName}" does not exist in the database.`)
          .addFields(
            { name: '🔍 Possible Reasons', value: '• Character name is misspelled\n• Character was deleted\n• Character was never created' },
            { name: '💡 Suggestion', value: 'Please check the spelling and try again.' }
          )
          .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
          .setFooter({ text: 'Character Validation' })
          .setTimestamp()],
        ephemeral: true,
      });
      return;
    }

    const toCharacter = await fetchCharacterByName(tradingWithName);
    if (!toCharacter || toCharacter.userId === userId) {
      await interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Recipient Not Found')
          .setDescription(`The character "${tradingWithName}" does not exist or belongs to you.`)
          .addFields(
            { name: '🔍 Possible Reasons', value: '• Character name is misspelled\n• Character was deleted\n• Character belongs to you' },
            { name: '💡 Suggestion', value: 'Please check the spelling and try again.' }
          )
          .setImage('https://storage.googleapis.com/tinglebot/border%20error.png')
          .setFooter({ text: 'Character Validation' })
          .setTimestamp()],
        ephemeral: true,
      });
      return;
    }

    // ------------------- NEW: Check if characters are in the same village -------------------
    if (fromCharacter.currentVillage.trim().toLowerCase() !== toCharacter.currentVillage.trim().toLowerCase()) {
      const fromVillageCapitalized = capitalizeWords(fromCharacter.currentVillage.trim());
      const toVillageCapitalized = capitalizeWords(toCharacter.currentVillage.trim());
      
      await interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Different Villages',
          description: `\`${fromCharacter.name}\` is in **${fromVillageCapitalized}**, and \`${toCharacter.name}\` is in **${toVillageCapitalized}**. Both characters must be in the same village for trading.`,
          fields: [
            {
              name: 'How to Fix',
              value: `Please use the </travel:1306176790095728736> command to travel your character to \`${toVillageCapitalized}\`.`
            }
          ],
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Village Check'
          }
        }],
        ephemeral: true
      });
      return;
    }

    // ------------------- Check Inventory Sync -------------------
    try {
      await checkInventorySync(fromCharacter);
      await checkInventorySync(toCharacter);
    } catch (error) {
      await interaction.editReply({
        embeds: [{
          color: 0xFF0000, // Red color
          title: '❌ Inventory Not Synced',
          description: error.message,
          fields: [
            {
              name: 'How to Fix',
              value: '1. Use `/inventory test` to test your inventory\n2. Use `/inventory sync` to sync your inventory'
            }
          ],
          image: {
            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
          },
          footer: {
            text: 'Inventory Sync Required'
          }
        }],
        ephemeral: true
      });
      return;
    }

    if (tradeId) {
      // ------------------- Handle Trade Completion -------------------
      try {
        const trade = await TempData.findByTypeAndKey('trade', tradeId);
        if (!trade) {
          console.error(`[trade.js]: ❌ Trade ${tradeId} not found`);
          await interaction.editReply({
            embeds: [{
              color: 0xFF0000, // Red color
              title: '❌ Invalid Trade',
              description: 'Invalid or expired trade ID.',
              image: {
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
              },
              footer: {
                text: 'Trade Validation'
              }
            }],
            ephemeral: true,
          });
          return;
        }

        // Check if trade has expired
        if (new Date() > trade.expiresAt) {
          await interaction.editReply({
            embeds: [{
              color: 0xFF0000, // Red color
              title: '❌ Trade Expired',
              description: 'This trade has expired. Please initiate a new trade.',
              image: {
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
              },
              footer: {
                text: 'Trade Timeout'
              }
            }],
            ephemeral: true,
          });
          await TempData.deleteOne({ _id: trade._id });
          return;
        }

        const tradeData = trade.data;
        console.log(`[trade.js]: 🔄 Processing trade ${tradeId} for user ${userId}`);

        // Verify user is part of the trade
        if (tradeData.initiator.userId !== userId && tradeData.target.userId !== userId) {
          console.error(`[trade.js]: ❌ User ${userId} not part of trade ${tradeId}`);
          await interaction.editReply({
            embeds: [{
              color: 0xFF0000, // Red color
              title: '❌ Not Part of Trade',
              description: 'You are not part of this trade.',
              image: {
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
              },
              footer: {
                text: 'Trade Validation'
              }
            }],
            ephemeral: true,
          });
          return;
        }

        // NEW: Verify character name matches the user's character in the trade
        if (
          (tradeData.initiator.userId === userId && tradeData.initiator.characterName !== characterName) ||
          (tradeData.target.userId === userId && tradeData.target.characterName !== characterName)
        ) {
          console.error(`[trade.js]: ❌ Character name mismatch for user ${userId} in trade ${tradeId}`);
          await interaction.editReply({
            embeds: [{
              color: 0xFF0000, // Red color
              title: '❌ Character Mismatch',
              description: 'The character you provided does not match your character in this trade.',
              image: {
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
              },
              footer: {
                text: 'Character Validation'
              }
            }],
            ephemeral: true,
          });
          return;
        }

        // Check if user has already confirmed
        if ((tradeData.initiator.userId === userId && tradeData.initiatorConfirmed) || 
            (tradeData.target.userId === userId && tradeData.targetConfirmed)) {
          console.error(`[trade.js]: ❌ User ${userId} already confirmed trade ${tradeId}`);
          await interaction.editReply({
            embeds: [{
              color: 0xFF0000, // Red color
              title: '❌ Already Confirmed',
              description: 'You have already confirmed this trade.',
              image: {
                url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
              },
              footer: {
                text: 'Trade Status'
              }
            }],
            ephemeral: true,
          });
          return;
        }

        // Update trade with target's items if target is confirming
        if (tradeData.target.userId === userId) {
          await updateTradeSession(tradeId, itemArray);
        }

        // Confirm trade for this user
        const updatedTradeData = await confirmTrade(tradeId, userId);
        console.log(`[trade.js]: ✅ Trade confirmed by user ${userId}`);

        // If both users have confirmed, execute the trade
        if (updatedTradeData.initiatorConfirmed && updatedTradeData.targetConfirmed) {
          console.log(`[trade.js]: 🔄 Executing trade ${tradeId}`);
          
          // Execute trade
          await executeTrade(updatedTradeData);
          
          // Clean up confirmation message if it exists
          if (updatedTradeData.confirmMessageId && updatedTradeData.confirmChannelId) {
            try {
              const channel = await interaction.client.channels.fetch(updatedTradeData.confirmChannelId);
              const confirmMsg = await channel.messages.fetch(updatedTradeData.confirmMessageId);
              await confirmMsg.delete();
            } catch (error) {
              console.error(`[trade.js]: ❌ Error deleting trade confirm message:`, error);
            }
          }

          await TempData.deleteOne({ _id: trade._id });
          
          // Update original trade message
          if (updatedTradeData.messageId && updatedTradeData.channelId) {
            try {
              const channel = await interaction.client.channels.fetch(updatedTradeData.channelId);
              const message = await channel.messages.fetch(updatedTradeData.messageId);
              await updateTradeMessage(message, updatedTradeData, fromCharacter, toCharacter);
            } catch (error) {
              console.error(`[trade.js]: ❌ Error updating final trade message:`, error);
            }
          }
          
          await interaction.editReply({
            content: `✅ Trade completed successfully.`,
            ephemeral: true,
          });
        } else {
          // Only send confirmation message if one doesn't already exist
          if (!updatedTradeData.confirmMessageId) {
            const tradeConfirmMessage = await interaction.channel.send({
              content: `**Trade confirmed!** <@${updatedTradeData.initiator.userId}>, please react to the trade post with ✅ to finalize the trade.\n\nTrade ID: \`${tradeId}\`\nYou can also use the </economy trade:1372378304623149152> command with this ID to complete the trade.`
            });
            
            // Update trade data with confirmation message
            await TempData.findOneAndUpdate(
              { key: tradeId, type: 'trade' },
              { 
                $set: { 
                  'data.confirmMessageId': tradeConfirmMessage.id,
                  'data.confirmChannelId': interaction.channelId 
                } 
              }
            );
          }

          // Update trade status message
          if (updatedTradeData.messageId && updatedTradeData.channelId) {
            try {
              const channel = await interaction.client.channels.fetch(updatedTradeData.channelId);
              const message = await channel.messages.fetch(updatedTradeData.messageId);
              await updateTradeMessage(message, updatedTradeData, fromCharacter, toCharacter);
            } catch (error) {
              console.error(`[trade.js]: ❌ Error updating trade status message:`, error);
            }
          }
          
          await interaction.deleteReply();
        }
      } catch (error) {
        console.error(`[trade.js]: ❌ Error handling trade completion:`, error);
        await interaction.editReply({
          content: `❌ An error occurred while processing the trade.`,
          ephemeral: true,
        });
      }
    } else {
      // ------------------- Handle Trade Initiation -------------------
      try {
        // Validate items and quantities
        await validateTradeItems(fromCharacter, itemArray);

        // Create trade session
        const tradeId = await createTradeSession(fromCharacter, toCharacter, itemArray);

        // Get formatted items with emojis
        const formattedItems = await Promise.all(itemArray.map(async item => {
          const emoji = await getItemEmoji(item.name);
          return {
            name: item.name,
            quantity: item.quantity,
            emoji: emoji,
          };
        }));

        // Create and send initial trade message
        const tradeEmbed = await createTradeEmbed(
          fromCharacter,
          toCharacter,
          formattedItems,
          [],
          interaction.url
        );
        tradeEmbed.setColor("#FFD700");

        const tradeMessage = await interaction.editReply({
          content: `🔃 <@${toCharacter.userId}>, use the </economy trade:1372378304623149152> command with this trade ID to complete your part of the trade:\n\n\`\`\`${tradeId}\`\`\``,
          embeds: [tradeEmbed],
        });

        // Update trade session with message info
        await TempData.findOneAndUpdate(
          { key: tradeId, type: 'trade' },
          { $set: { 'data.messageId': tradeMessage.id, 'data.channelId': interaction.channelId } }
        );

        // Set up reaction collector
        try {
          await tradeMessage.react('✅');
          
          // Get initial trade data
          const initialTrade = await TempData.findByTypeAndKey('trade', tradeId);
          if (!initialTrade) {
            console.error(`[trade.js]: ❌ Trade ${tradeId} not found during reaction setup`);
            return;
          }
          
          const filter = (reaction, user) => {
            return reaction.emoji.name === '✅' &&
              [fromCharacter.userId, toCharacter.userId].includes(user.id);
          };

          const collector = tradeMessage.createReactionCollector({ filter, time: 24 * 60 * 60 * 1000 }); // 34 hours
          collector.on('collect', async (reaction, user) => {
            try {
              const latestTrade = await TempData.findByTypeAndKey('trade', tradeId);
              if (!latestTrade) {
                console.error(`[trade.js]: ❌ Trade ${tradeId} not found during reaction`);
                return;
              }

              const tradeData = latestTrade.data;
              
              // Check if user has already confirmed
              if ((fromCharacter.userId === user.id && tradeData.initiatorConfirmed) || 
                  (toCharacter.userId === user.id && tradeData.targetConfirmed)) {
                console.log(`[trade.js]: ❌ User ${user.id} already confirmed trade ${tradeId}`);
                return;
              }

              const updatedTradeData = await confirmTrade(tradeId, user.id);
              console.log(`[trade.js]: ✅ ${user.tag} confirmed trade ${tradeId}`);

              // Update trade message
              await updateTradeMessage(tradeMessage, updatedTradeData, fromCharacter, toCharacter);

              // If both confirmed, complete trade
              if (updatedTradeData.initiatorConfirmed && updatedTradeData.targetConfirmed) {
                collector.stop('both_confirmed');
                await executeTrade(updatedTradeData);
                await TempData.deleteOne({ _id: latestTrade._id });
                
                const finalEmbed = await createTradeEmbed(
                  fromCharacter,
                  toCharacter,
                  updatedTradeData.initiator.items,
                  updatedTradeData.target.items,
                  tradeMessage.url
                );
                finalEmbed.setColor("#FFD700");
                finalEmbed.setDescription(`✅ Trade completed successfully!`);
                await tradeMessage.edit({ content: null, embeds: [finalEmbed], components: [] });

                // Clean up confirmation message if it exists
                if (updatedTradeData.confirmMessageId && updatedTradeData.confirmChannelId) {
                  try {
                    const channel = await interaction.client.channels.fetch(updatedTradeData.confirmChannelId);
                    const confirmMsg = await channel.messages.fetch(updatedTradeData.confirmMessageId);
                    await confirmMsg.delete();
                  } catch (error) {
                    console.error(`[trade.js]: ❌ Error deleting trade confirm message:`, error);
                  }
                }
              }
            } catch (error) {
              console.error(`[trade.js]: ❌ Error processing reaction:`, error);
            }
          });
        } catch (err) {
          console.error(`[trade.js]: ❌ Error setting up reaction collector: ${err.message}`);
        }
      } catch (error) {
        // Only log a simple message for insufficient items
        if (error.embed) {
          console.log(`[trade.js]: Trade validation failed for ${characterName}`);
        } else {
          console.error(`[trade.js]: ❌ Error initiating trade:`, error);
        }
        
        // If error has an embed, use it, otherwise create a generic error embed
        if (error.embed) {
          await interaction.editReply({ embeds: [error.embed] });
        } else {
          const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Trade Error")
            .setDescription(error.message || "An error occurred while initiating the trade.")
            .setColor("#FF0000");
          await interaction.editReply({ embeds: [errorEmbed] });
        }
        return;
      }
    }
  } catch (error) {
    handleError(error, "trade.js");
    // Only log a simple message for insufficient items
    if (error.embed) {
      console.log(`[trade.js]: Trade validation failed for ${characterName}`);
    } else {
      console.error(`[trade.js]: ❌ Error executing trade command:`, error);
    }
    
    // Create a generic error embed
    const errorEmbed = new EmbedBuilder()
      .setTitle("❌ Trade Error")
      .setDescription(error.message || "An error occurred while trying to execute the trade.")
      .setColor("#FF0000");
    await interaction.editReply({ embeds: [errorEmbed] });
  }
}