const {
 SlashCommandBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle,
 EmbedBuilder,
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
 const item = await ItemModel.findOne({ itemName }).select("emoji").exec();
 return item && item.emoji ? item.emoji : DEFAULT_EMOJI;
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

 // ------------------- Validate Gift Quantities -------------------
// Ensure all gifted item quantities are positive integers
for (const { quantity } of items) {
  if (quantity <= 0) {
    await interaction.editReply({
      content: `❌ You must gift a **positive quantity** of items. Negative numbers are not allowed.`,
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
    await interaction.editReply(
      `❌ Character \`${fromCharacterName}\` not found or does not belong to you.`
    );
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
  
  for (const { name } of items) {
    if (equippedItems.includes(name)) {
      await interaction.editReply(
        `❌ You cannot gift \`${name}\` because it is currently equipped. Please unequip it first.`
      );
      return;
    }
  }
  

  const allCharacters = await fetchAllCharactersExceptUser(userId);
  const toCharacter = allCharacters.find((c) => c.name === toCharacterName);
  if (!toCharacter) {
   await interaction.editReply(
    `❌ Character \`${toCharacterName}\` not found or belongs to you.`
   );
   return;
  }

  // ------------------- Check Inventory Sync for Both Characters -------------------
  try {
    await checkInventorySync(fromCharacter);
    await checkInventorySync(toCharacter);
  } catch (error) {
    await interaction.editReply({
      content: error.message,
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

   await interaction.editReply(
    `❌ \`${fromCharacter.name}\` is in **${fromVillageCapitalized}**, and \`${toCharacter.name}\` is in **${toVillageCapitalized}**. Both characters must be in the same village for gifting. ` +
     `Please use the </travel:1306176790095728736> command to travel your character to \`${toVillageCapitalized}\`.`
   );
   return;
  }

  const fromInventoryCollection = await getCharacterInventoryCollection(
   fromCharacter.name
  );
  let allItemsAvailable = true;
  const unavailableItems = [];

  for (const { name, quantity } of items) {
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
   await interaction.editReply(
    `❌ \`${fromCharacterName}\` does not have enough of the following items to gift: ${unavailableItems.join(
     ", "
    )}`
   );
   return;
  }

  const fromInventoryLink =
   fromCharacter.inventory || fromCharacter.inventoryLink;
  const toInventoryLink = toCharacter.inventory || toCharacter.inventoryLink;

  if (!fromInventoryLink || !toInventoryLink) {
   await interaction.editReply({
    content: `❌ Missing Google Sheets URL for character inventory.`,
    ephemeral: true,
   });
   return;
  }

  if (
   !isValidGoogleSheetsUrl(fromInventoryLink) ||
   !isValidGoogleSheetsUrl(toInventoryLink)
  ) {
   await interaction.editReply({
    content: `❌ Invalid Google Sheets URL for character inventory.`,
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

  for (const { name, quantity } of items) {
   await removeItemInventoryDatabase(
    fromCharacter._id,
    name,
    quantity,
    interaction
   );
   await addItemInventoryDatabase(toCharacter._id, name, quantity, interaction);

   const itemDetails = await ItemModel.findOne({
    itemName: new RegExp(`^${name}$`, "i"),
   }).exec();
   const category = itemDetails?.category.join(", ") || "";
   const type = itemDetails?.type.join(", ") || "";
   const subtype = itemDetails?.subtype.join(", ") || "";

   const fromValues = [
    [
     fromCharacter.name,
     name,
     (-quantity).toString(),
     category,
     type,
     subtype,
     `Gift to ${toCharacterName}`,
     fromCharacter.job,
     "",
     fromCharacter.currentVillage,
     interactionUrl,
     formattedDateTime,
     uniqueSyncId,
    ],
   ];

   const toValues = [
    [
     toCharacter.name,
     name,
     quantity.toString(),
     category,
     type,
     subtype,
     `Gift from ${fromCharacterName}`,
     toCharacter.job,
     "",
     toCharacter.currentVillage,
     interactionUrl,
     formattedDateTime,
     uniqueSyncId,
    ],
   ];

   if (fromCharacter?.name && fromCharacter?.inventory && fromCharacter?.userId) {
    await safeAppendDataToSheet(fromCharacter.inventory, fromCharacter, range, fromValues);
} else {
    console.error('[safeAppendDataToSheet]: Invalid fromCharacter object detected.');
}

if (toCharacter?.name && toCharacter?.inventory && toCharacter?.userId) {
    await safeAppendDataToSheet(toCharacter.inventory, toCharacter, range, toValues);
} else {
    console.error('[safeAppendDataToSheet]: Invalid toCharacter object detected.');
}

   
   const itemIcon = itemDetails?.emoji || "🎁";
   formattedItems.push({ itemName: name, quantity, itemIcon });
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
  await interaction.editReply({
    content: `✅ Gift sent successfully!`,
  }); 
  
  
 } catch (error) {
  handleError(error, "gift.js");
  console.error("❌ Error during gift execution:", error);
  await interaction.editReply(
   "❌ An error occurred while trying to gift the items."
  );
 }
}

async function handleShopView(interaction) {
 try {
  await interaction.deferReply({ ephemeral: true });
  
  // Add error handling for database connection
  let items;
  try {
    items = await ShopStock.find().sort({ itemName: 1 }).lean();
  } catch (dbError) {
    console.error("[shops]: Database connection error:", dbError);
    return interaction.editReply("❌ Unable to connect to the shop database. Please try again later.");
  }

  if (!items || items.length === 0) {
   return interaction.editReply("❌ The shop is currently empty. Please try again later.");
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
   return interaction.editReply(
    "❌ Your tokens are not synced. Please sync your tokens to use this command."
   );
  }

  const characterName = interaction.options.getString("charactername");
  const itemName = interaction.options.getString("itemname");
  const quantity = interaction.options.getInteger("quantity");
  // ------------------- Validate Buy Quantity -------------------
if (quantity <= 0) {
  await interaction.editReply({
    content: `❌ You must buy a **positive quantity** of items. Negative numbers are not allowed.`,
    ephemeral: true,
  });
  return;
}


  console.log(
   `[shops]: Initiating purchase for character: ${characterName}, item: ${itemName}, quantity: ${quantity}`
  );

  const character = await fetchCharacterByName(characterName);
  if (!character) {
   return interaction.editReply("❌ Character not found.");
  }

  // ------------------- Check Inventory Sync -------------------
  try {
    await checkInventorySync(character);
  } catch (error) {
    await interaction.editReply({
      content: error.message,
      ephemeral: true
    });
    return;
  }
  

  const shopItem = await ShopStock.findOne({ itemName }).lean();
  if (!shopItem) {
   return interaction.editReply("❌ Item not found in the shop.");
  }

  const shopQuantity = parseInt(shopItem.stock, 10);
  if (isNaN(shopQuantity)) {
   return interaction.editReply("❌ Shop item quantity is invalid.");
  }

  if (shopQuantity < quantity) {
   return interaction.editReply("❌ Not enough stock available.");
  }

  const itemDetails = await ItemModel.findOne({ itemName })
   .select("buyPrice image category type subtype")
   .lean();
  if (!itemDetails) {
   return interaction.editReply("❌ Unable to retrieve item details.");
  }

  const totalPrice = itemDetails.buyPrice * quantity;
  const currentTokens = user.tokens;

  if (currentTokens < totalPrice) {
   return interaction.editReply(
    `❌ You do not have enough tokens. Current Balance: 🪙 ${currentTokens}. Required: 🪙 ${totalPrice}.`
   );
  }

  const inventoryCollection = await getCharacterInventoryCollection(
   characterName
  );
  await inventoryCollection.updateOne(
   { itemName },
   { $inc: { quantity: quantity } },
   { upsert: true }
  );

  await ShopStock.updateOne(
   { itemName },
   {
    $set: { stock: parseInt(shopQuantity, 10) - quantity },
   }
  );

  const inventoryLink =
   character.inventory || "https://example.com/inventory/default";
  const tokenTrackerLink =
   user.tokenTracker || "https://example.com/tokens/default";
  const formattedDateTime = new Date().toLocaleString("en-US", {
   timeZone: "America/New_York",
  });
  const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

  if (user.tokenTracker) {
   const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
   const auth = await authorizeSheets();
   const tokenRow = [
    `${characterName} - ${itemName} x${quantity} - Shop Purchase`,
    interactionUrl,
    "purchase",
    "spent",
    `-${totalPrice}`,
   ];
   await safeAppendDataToSheet(character.inventory, character, "loggedTracker!B7:F", [tokenRow]);
  }

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
   await appendSheetData(auth, spreadsheetId, "loggedInventory!A2:M", [
    inventoryRow,
   ]);
  }

  await updateTokenBalance(interaction.user.id, -totalPrice);

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

  interaction.editReply({ embeds: [purchaseEmbed] });
 } catch (error) {
  handleError(error, "shops.js");
  console.error("[shops]: Error buying item:", error);
  interaction.editReply("❌ An error occurred while trying to buy the item.");
 }
}

async function handleShopSell(interaction) {
 try {
  await interaction.deferReply();

  const characterName = interaction.options.getString("charactername");
  const itemName = interaction.options.getString("itemname");
  const quantity = interaction.options.getInteger("quantity");

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
   return interaction.editReply("❌ Character not found.");
  }

  const inventoryCollection = await getCharacterInventoryCollection(
   characterName
  );
  const inventoryItem = await inventoryCollection.findOne({ itemName });

  const equippedItems = [
    character.gearArmor?.head?.name,
    character.gearArmor?.chest?.name,
    character.gearArmor?.legs?.name,
    character.gearWeapon?.name,
    character.gearShield?.name,
  ].filter(Boolean);
  
  if (equippedItems.includes(itemName)) {
    await interaction.editReply({
      content: `❌ You cannot sell \`${itemName}\` because it is currently equipped. Please unequip it first.`,
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

  const isCrafted = inventoryItem.obtain.includes("Crafting");
  console.log(`[shops]: Item crafted: ${isCrafted}`);

  if (!isCrafted) {
   console.warn(
    `[shops]: Item not crafted: ${itemName}. Obtain method: ${inventoryItem.obtain}`
   );
   console.log(`[shops]: Proceeding to sell item at the standard sell price.`);
  }

  const itemDetails = await ItemModel.findOne({ itemName })
   .select("buyPrice sellPrice category type image craftingJobs")
   .lean();
  if (!itemDetails) {
   console.error(`[shops]: Item details not found in database: ${itemName}`);
   return interaction.editReply("❌ Item details not found.");
  }

  console.log(
   `[shops]: Item details found. Buy price: ${itemDetails.buyPrice}, Sell price: ${itemDetails.sellPrice}, Category: ${itemDetails.category}, Crafting jobs: ${itemDetails.craftingJobs}`
  );

  const normalizedCharacterJob = character.job.toLowerCase();
  const normalizedCraftingJobs = itemDetails.craftingJobs.map((job) =>
   job.toLowerCase()
  );

  const characterMeetsRequirements =
   hasPerk(character, "CRAFTING") &&
   normalizedCraftingJobs.includes(normalizedCharacterJob);

  console.log(
   `[shops]: Character job: ${character.job}, Crafting jobs (normalized): ${normalizedCraftingJobs}`
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

  await inventoryCollection.updateOne(
   { itemName },
   { $inc: { quantity: -quantity } }
  );

  console.log(`[shops]: Deducted ${quantity}x ${itemName} from inventory.`);

  await ShopStock.updateOne(
   { itemName },
   { $inc: { stock: quantity } },
   { upsert: true }
  );

  console.log(`[shops]: Added ${quantity}x ${itemName} to shop stock.`);

  const totalPrice = sellPrice * quantity;

  await updateTokenBalance(interaction.user.id, totalPrice);

  console.log(`[shops]: Updated user's token balance by ${totalPrice}.`);

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
   await safeAppendDataToSheet(character.inventory, character, "loggedTracker!B7:F", [tokenRow]);
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

// ------------------- Trade Session Management -------------------
async function createTradeSession(initiator, target, items) {
  const tradeId = generateUniqueId('T');
  const formattedInitiatorItems = await Promise.all(items.map(async item => {
    const emoji = await getItemEmoji(item.name);
    return {
      name: item.name,
      quantity: item.quantity,
      emoji: emoji
    };
  }));
  const tradeData = {
    initiator: {
      userId: initiator.userId,
      characterName: initiator.name,
      items: formattedInitiatorItems
    },
    target: {
      userId: target.userId,
      characterName: target.name,
      items: []
    },
    status: 'pending',
    createdAt: new Date(),
    initiatorConfirmed: false,
    targetConfirmed: false,
    messageId: null,
    channelId: null
  };
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await TempData.create({ key: tradeId, type: 'trade', data: tradeData, expiresAt });
  console.log(`[trade.js]: ✅ Trade session created: ${tradeId}`);
  return tradeId;
}

async function updateTradeSession(tradeId, targetItems) {
  const formattedTargetItems = await Promise.all(targetItems.map(async item => {
    const emoji = await getItemEmoji(item.name);
    return {
      name: item.name,
      quantity: item.quantity,
      emoji: emoji
    };
  }));
  await TempData.findOneAndUpdate(
    { key: tradeId, type: 'trade' },
    { $set: { 'data.target.items': formattedTargetItems } }
  );
  console.log(`[trade.js]: 🔄 Trade session updated: ${tradeId}`);
  const tradeAfter = await TempData.findByTypeAndKey('trade', tradeId);
  return tradeAfter.data;
}

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
    await interaction.deferReply({ ephemeral: false });

    // ------------------- Validate Trade Quantities -------------------
    const itemArray = [
      { name: item1, quantity: quantity1 },
      { name: item2, quantity: quantity2 },
      { name: item3, quantity: quantity3 },
    ].filter((item) => item.name);

    // Ensure all traded item quantities are positive integers
    for (const { quantity } of itemArray) {
      if (quantity <= 0) {
        await interaction.editReply({
          content: `❌ You must trade a **positive quantity** of items. Negative numbers are not allowed.`,
          ephemeral: true,
        });
        return;
      }
    }

    const fromCharacter = await fetchCharacterByNameAndUserId(
      characterName,
      userId
    );
    if (!fromCharacter) {
      await interaction.editReply({
        content: `❌ Character \`${characterName}\` not found or does not belong to you.`,
      });
      return;
    }

    const toCharacter = await fetchCharacterByName(tradingWithName);
    if (!toCharacter || toCharacter.userId === userId) {
      await interaction.editReply({
        content: `❌ Character \`${tradingWithName}\` not found or belongs to you.`,
      });
      return;
    }

    // ------------------- Check Inventory Sync for Both Characters -------------------
    try {
      await checkInventorySync(fromCharacter);
      await checkInventorySync(toCharacter);
    } catch (error) {
      await interaction.editReply({
        content: error.message,
        ephemeral: true
      });
      return;
    }

    if (tradeId) {
      // ------------------- Handle Trade Completion -------------------
      try {
        console.log(`[trade.js]: 🔄 Processing trade ${tradeId}`);
        const trade = await TempData.findByTypeAndKey('trade', tradeId);
        if (!trade) {
          console.error(`[trade.js]: ❌ Trade ${tradeId} not found`);
          await interaction.editReply({
            content: `❌ Invalid or expired trade ID.`,
            ephemeral: true,
          });
          return;
        }

        // Check if trade has expired
        if (new Date() > trade.expiresAt) {
          console.log(`[trade.js]: ⚠️ Trade ${tradeId} expired`);
          await interaction.editReply({
            content: `❌ This trade has expired. Please initiate a new trade.`,
            ephemeral: true,
          });
          await TempData.deleteOne({ _id: trade._id });
          return;
        }

        const tradeData = trade.data;

        // Verify user is part of the trade
        if (tradeData.initiator.userId !== userId && tradeData.target.userId !== userId) {
          console.error(`[trade.js]: ❌ User ${userId} not part of trade ${tradeId}`);
          await interaction.editReply({
            content: `❌ You are not part of this trade.`,
            ephemeral: true,
          });
          return;
        }

        // Check if user has already confirmed
        if ((tradeData.initiator.userId === userId && tradeData.initiatorConfirmed) || 
            (tradeData.target.userId === userId && tradeData.targetConfirmed)) {
          console.error(`[trade.js]: ❌ User ${userId} already confirmed trade ${tradeId}`);
          await interaction.editReply({
            content: `❌ You have already confirmed this trade.`,
            ephemeral: true,
          });
          return;
        }

        // Update trade with target's items
        if (tradeData.target.userId === userId) {
          await updateTradeSession(tradeId, itemArray);
        }
        // After updateTradeSession, fetch the latest trade document
        let latestTrade = await TempData.findByTypeAndKey('trade', tradeId);
        let latestTradeData = latestTrade.data;
        // Set the confirmation flag for this user
        if (latestTradeData.initiator.userId === userId) {
          latestTradeData.initiatorConfirmed = true;
        } else if (latestTradeData.target.userId === userId) {
          latestTradeData.targetConfirmed = true;
        }
        latestTrade.data = latestTradeData;
        latestTrade.markModified('data');
        await latestTrade.save();
        // Always re-fetch the latest trade data after confirmation
        const updatedTrade = await TempData.findByTypeAndKey('trade', tradeId);
        console.log(`[trade.js]: 📦 Updated trade data after confirmation:`, JSON.stringify(updatedTrade.data, null, 2));

        // If both users have confirmed, execute the trade
        if (updatedTrade.data.initiatorConfirmed && updatedTrade.data.targetConfirmed) {
          console.log(`[trade.js]: ✅ Both parties confirmed, executing trade`);
          // Execute trade
          await executeTrade(updatedTrade.data);
          await TempData.deleteOne({ _id: updatedTrade._id });
          
          // Update the original trade message if it exists
          if (updatedTrade.data.messageId && updatedTrade.data.channelId) {
            try {
              const channel = await interaction.client.channels.fetch(updatedTrade.data.channelId);
              const message = await channel.messages.fetch(updatedTrade.data.messageId);
              const tradeEmbed = await createTradeEmbed(
                updatedTrade.data.initiator.characterName,
                updatedTrade.data.target.characterName,
                updatedTrade.data.initiator.items,
                updatedTrade.data.target.items,
                message.url,
                fromCharacter.icon || "",
                toCharacter.icon || ""
              );
              tradeEmbed.setDescription(`✅ Trade between **${updatedTrade.data.initiator.characterName}** and **${updatedTrade.data.target.characterName}** has been completed!`);
              await message.edit({ embeds: [tradeEmbed], components: [] });
              console.log(`[trade.js]: ✅ Final trade message updated successfully`);
            } catch (error) {
              console.error(`[trade.js]: ❌ Error updating final trade message:`, error);
            }
          }
          
          await interaction.editReply({
            content: `✅ Trade completed successfully.`,
            ephemeral: true,
          });
        } else {
          // Update the original trade message if it exists
          if (updatedTrade.data.messageId && updatedTrade.data.channelId) {
            try {
              const channel = await interaction.client.channels.fetch(updatedTrade.data.channelId);
              const message = await channel.messages.fetch(updatedTrade.data.messageId);
              const tradeEmbed = await createTradeEmbed(
                updatedTrade.data.initiator.characterName,
                updatedTrade.data.target.characterName,
                updatedTrade.data.initiator.items,
                updatedTrade.data.target.items,
                message.url,
                fromCharacter.icon || "",
                toCharacter.icon || ""
              );
              tradeEmbed.setDescription(
                `🔃 Trade Status:\n` +
                `${updatedTrade.data.initiatorConfirmed ? '✅' : '⏳'} ${updatedTrade.data.initiator.characterName} confirmed\n` +
                `${updatedTrade.data.targetConfirmed ? '✅' : '⏳'} ${updatedTrade.data.target.characterName} confirmed\n\n` +
                `<@${updatedTrade.data.initiator.userId}>, please react with ✅ to confirm the trade!`
              );
              await message.edit({ embeds: [tradeEmbed] });
              console.log(`[trade.js]: ✅ Trade status message updated successfully`);
            } catch (error) {
              console.error(`[trade.js]: ❌ Error updating trade status message:`, error);
            }
          }
          
          await interaction.editReply({
            content: `**Trade confirmed!** <@${updatedTrade.data.initiator.userId}>, please react to the trade post with ✅ to finalize the trade.`,
            ephemeral: true,
          });
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
        const characterInventoryCollection = await getCharacterInventoryCollection(
          fromCharacter.name
        );
        for (let item of itemArray) {
          const itemInventory = await characterInventoryCollection.findOne({
            itemName: { $regex: new RegExp(`^${item.name}$`, "i") },
          });
          if (!itemInventory || itemInventory.quantity < item.quantity) {
            await interaction.editReply({
              content: `❌ \`${characterName}\` does not have enough \`${
                item.name
              } - QTY:${itemInventory ? itemInventory.quantity : 0}\` to trade.`,
            });
            return;
          }
        }

        // Create trade session
        const tradeId = await createTradeSession(fromCharacter, toCharacter, itemArray);

        // Create initial trade embed
        const formattedItems = await Promise.all(itemArray.map(async item => ({
          name: item.name,
          quantity: item.quantity,
          emoji: await getItemEmoji(item.name)
        })));

        const tradeEmbed = await createTradeEmbed(
          fromCharacter.name,
          toCharacter.name,
          formattedItems,
          [],
          interaction.url,
          fromCharacter.icon || "",
          toCharacter.icon || ""
        );

        // Send the initial trade message and capture the response
        const tradeMessage = await interaction.editReply({
          content: `🔃 <@${toCharacter.userId}>, use the /economy trade command with the following trade ID to complete the trade:\n\n\`\`\`${tradeId}\`\`\``,
          embeds: [tradeEmbed],
        });
        console.log(`[trade.js]: ✅ Trade message sent: ${tradeMessage.id}`);
        // Update the trade session with the message ID and channel ID
        await TempData.findOneAndUpdate(
          { key: tradeId, type: 'trade' },
          { $set: { 'data.messageId': tradeMessage.id, 'data.channelId': interaction.channelId } }
        );
        // Add ✅ reaction and set up collector
        try {
          await tradeMessage.react('✅');
          const filter = (reaction, user) => {
            return reaction.emoji.name === '✅' &&
              [fromCharacter.userId, toCharacter.userId].includes(user.id);
          };
          const collector = tradeMessage.createReactionCollector({ filter, time: 15 * 60 * 1000 });
          const confirmed = new Set();
          collector.on('collect', async (reaction, user) => {
            try {
              // Check if user has already confirmed
              let latestTrade = await TempData.findByTypeAndKey('trade', tradeId);
              if ((latestTrade.data.initiator.userId === user.id && latestTrade.data.initiatorConfirmed) || 
                  (latestTrade.data.target.userId === user.id && latestTrade.data.targetConfirmed)) {
                console.log(`[trade.js]: ⚠️ User ${user.id} already confirmed trade ${tradeId}`);
                return;
              }

              confirmed.add(user.id);
              // Mark confirmation in DB
              if (String(latestTrade.data.initiator.userId) === String(user.id)) {
                latestTrade.data.initiatorConfirmed = true;
              } else if (String(latestTrade.data.target.userId) === String(user.id)) {
                latestTrade.data.targetConfirmed = true;
              }
              latestTrade.markModified('data');
              await latestTrade.save();

              // Always re-fetch the latest trade data after saving
              latestTrade = await TempData.findByTypeAndKey('trade', tradeId);
              console.log(`[trade.js]: ✅ ${user.tag} (${user.id}) reacted to trade ${tradeId}`);
              console.log(`[trade.js]: 🔄 Trade confirmation status: Initiator: ${latestTrade.data.initiatorConfirmed ? '✅' : '❌'}, Target: ${latestTrade.data.targetConfirmed ? '✅' : '❌'}`);

              // Update embed with current confirmation status
              const statusEmbed = await createTradeEmbed(
                latestTrade.data.initiator.characterName,
                latestTrade.data.target.characterName,
                latestTrade.data.initiator.items,
                latestTrade.data.target.items,
                tradeMessage.url,
                fromCharacter.icon || "",
                toCharacter.icon || ""
              );
              statusEmbed.setDescription(
                `🔃 Trade Status:\n` +
                `${latestTrade.data.initiatorConfirmed ? '✅' : '⏳'} ${latestTrade.data.initiator.characterName} confirmed\n` +
                `${latestTrade.data.targetConfirmed ? '✅' : '⏳'} ${latestTrade.data.target.characterName} confirmed\n\n` +
                `<@${latestTrade.data.initiator.userId}>, please react with ✅ to confirm the trade!`
              );
              await tradeMessage.edit({ embeds: [statusEmbed] });

              // If both confirmed, complete trade
              if (latestTrade.data.initiatorConfirmed && latestTrade.data.targetConfirmed) {
                collector.stop('both_confirmed');
                await executeTrade(latestTrade.data);
                await TempData.deleteOne({ _id: latestTrade._id });
                const finalEmbed = await createTradeEmbed(
                  latestTrade.data.initiator.characterName,
                  latestTrade.data.target.characterName,
                  latestTrade.data.initiator.items,
                  latestTrade.data.target.items,
                  tradeMessage.url,
                  fromCharacter.icon || "",
                  toCharacter.icon || ""
                );
                finalEmbed.setDescription(`✅ Trade completed successfully!`);
                await tradeMessage.edit({ content: null, embeds: [finalEmbed], components: [] });
                console.log(`[trade.js]: ✅ Trade completed: ${tradeId}`);
              }
            } catch (error) {
              console.error(`[trade.js]: ❌ Error processing reaction:`, error);
            }
          });

          collector.on('end', (collected, reason) => {
            if (reason !== 'both_confirmed') {
              tradeMessage.reactions.removeAll().catch(() => {});
            }
          });
        } catch (err) {
          console.error(`[trade.js]: ❌ Error setting up reaction collector: ${err.message}`);
        }
      } catch (error) {
        console.error(`[trade.js]: ❌ Error initiating trade:`, error);
        await interaction.editReply({
          content: `❌ An error occurred while initiating the trade.`,
          ephemeral: true,
        });
      }
    }
  } catch (error) {
    handleError(error, "trade.js");
    console.error(`[trade.js]: ❌ Error executing trade command:`, error);
    await interaction.editReply({
      content: "❌ An error occurred while trying to execute the trade.",
    });
  }
}

// ------------------- Execute Trade -------------------
async function executeTrade(tradeData) {
  try {
    const { initiator, target } = tradeData;
    // Fetch full character docs
    const initiatorChar = await fetchCharacterByNameAndUserId(initiator.characterName, initiator.userId);
    const targetChar = await fetchCharacterByNameAndUserId(target.characterName, target.userId);
    if (!initiatorChar || !targetChar) {
      console.error('[trade.js]: ❌ Character not found for trade');
      throw new Error('Character not found for trade execution');
    }

    const uniqueSyncId = uuidv4();

    // Process initiator's items
    for (const item of initiator.items) {
      const itemDetails = await ItemModel.findOne({
        itemName: new RegExp(`^${item.name}$`, "i"),
      }).exec();
      const category = itemDetails?.category.join(", ") || "";
      const type = itemDetails?.type.join(", ") || "";
      const subtype = itemDetails?.subtype.join(", ") || "";

      // Create trade data for logging
      const tradeData = {
        characterId: initiatorChar._id,
        itemName: item.name,
        quantity: -item.quantity,
        category,
        type,
        subtype,
        obtain: `Trade to ${target.characterName}`,
        date: new Date(),
        synced: uniqueSyncId,
        characterName: initiatorChar.name
      };

      // Remove from initiator and log
      await syncToInventoryDatabase(initiatorChar, tradeData);

      // Create trade data for target
      const targetTradeData = {
        characterId: targetChar._id,
        itemName: item.name,
        quantity: item.quantity,
        category,
        type,
        subtype,
        obtain: `Trade from ${initiator.characterName}`,
        date: new Date(),
        synced: uniqueSyncId,
        characterName: targetChar.name
      };

      // Add to target and log
      await syncToInventoryDatabase(targetChar, targetTradeData);
    }

    // Process target's items
    for (const item of target.items) {
      const itemDetails = await ItemModel.findOne({
        itemName: new RegExp(`^${item.name}$`, "i"),
      }).exec();
      const category = itemDetails?.category.join(", ") || "";
      const type = itemDetails?.type.join(", ") || "";
      const subtype = itemDetails?.subtype.join(", ") || "";

      // Create trade data for logging
      const tradeData = {
        characterId: targetChar._id,
        itemName: item.name,
        quantity: -item.quantity,
        category,
        type,
        subtype,
        obtain: `Trade to ${initiator.characterName}`,
        date: new Date(),
        synced: uniqueSyncId,
        characterName: targetChar.name
      };

      // Remove from target and log
      await syncToInventoryDatabase(targetChar, tradeData);

      // Create trade data for initiator
      const initiatorTradeData = {
        characterId: initiatorChar._id,
        itemName: item.name,
        quantity: item.quantity,
        category,
        type,
        subtype,
        obtain: `Trade from ${target.characterName}`,
        date: new Date(),
        synced: uniqueSyncId,
        characterName: initiatorChar.name
      };

      // Add to initiator and log
      await syncToInventoryDatabase(initiatorChar, initiatorTradeData);
    }

    console.log(`[trade.js]: ✅ Trade completed between ${initiator.characterName} and ${target.characterName}`);
    return true;
  } catch (error) {
    console.error(`[trade.js]: ❌ Trade failed: ${error.message}`);
    throw error;
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

 // ------------------- Validate Transfer Quantities -------------------
for (const { quantity } of items) {
  if (quantity <= 0) {
    await interaction.editReply({
      content: `❌ You must transfer a **positive quantity** of items. Negative numbers are not allowed.`,
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
    content: `❌ Either the source or destination character does not exist or does not belong to you.`,
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

for (const { name } of items) {
  if (equippedItems.includes(name)) {
    await interaction.editReply({
      content: `❌ You cannot sell/trade/transfer \`${name}\` because it is currently equipped. Please unequip it first.`,
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
      content: error.message,
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

  for (const { name, quantity } of items) {
   console.log(
    `[transfer.js:logs] Checking availability for item: ${name} (Required: ${quantity})`
   );

   const fromInventoryEntries = await fromInventoryCollection
    .find({ itemName: new RegExp(`^${name}$`, "i") })
    .toArray();
   const totalQuantity = fromInventoryEntries.reduce(
    (sum, entry) => sum + entry.quantity,
    0
   );
   console.log(
    `[transfer.js:logs] Total quantity of '${name}' in inventory: ${totalQuantity} (Required: ${quantity})`
   );

   if (totalQuantity < quantity) {
    console.log(
     `[transfer.js:logs] Insufficient quantity for item '${name}' (Available: ${totalQuantity}, Required: ${quantity}).`
    );
    unavailableItems.push(`${name} - QTY:${totalQuantity}`);
    allItemsAvailable = false;
   } else {
    console.log(
     `[transfer.js:logs] Sufficient quantity available for '${name}' (Total: ${totalQuantity}, Required: ${quantity}).`
    );
   }
  }

  if (!allItemsAvailable) {
   await interaction.editReply({
    content: `❌ \`${fromCharacterName}\` does not have enough of the following items to transfer: ${unavailableItems.join(
     ", "
    )}`,
    ephemeral: true,
   });
   return;
  }

  const fromInventoryLink =
   fromCharacter.inventory || fromCharacter.inventoryLink;
  const toInventoryLink = toCharacter.inventory || toCharacter.inventoryLink;

  if (!fromInventoryLink || !toInventoryLink) {
   await interaction.editReply({
    content: `❌ Missing Google Sheets URL for character inventory.`,
    ephemeral: true,
   });
   return;
  }

  if (
   !isValidGoogleSheetsUrl(fromInventoryLink) ||
   !isValidGoogleSheetsUrl(toInventoryLink)
  ) {
   await interaction.editReply({
    content: `❌ Invalid Google Sheets URL for character inventory.`,
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

  for (const { name, quantity } of items) {
    const itemDetails = await ItemModel.findOne({
      itemName: new RegExp(`^${name}$`, "i"),
    }).exec();
    const category = itemDetails?.category.join(", ") || "";
    const type = itemDetails?.type.join(", ") || "";
    const subtype = itemDetails?.subtype.join(", ") || "";

    // Remove from source (fromCharacter)
    const removeData = {
      characterId: fromCharacter._id,
      itemName: name,
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
      itemName: name,
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
    formattedItems.push({ itemName: name, quantity, itemIcon });
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

  await interaction.channel.send({
    content: `🎁 <@${toCharacter.userId}>, you received a transfer!`,
    allowedMentions: { users: [toCharacter.userId] },
    embeds: [transferEmbed],
  });
  await interaction.editReply({
    content: `✅ Transfer completed successfully!`,
  });
 } catch (error) {
  handleError(error, "transfer.js");
  console.error("❌ Error during transfer execution:", error);
  await interaction.editReply(
   "❌ An error occurred while trying to transfer the items."
  );
 }
}