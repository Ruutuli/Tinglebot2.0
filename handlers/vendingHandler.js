// ============================================================================
// ------------------- Vending Handler Blueprint -------------------
// Handles all /vending subcommands for barter, restock, fulfill, etc.
// ============================================================================

// ------------------- Standard Libraries -------------------
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require("mongodb");

// ------------------- Discord.js Components -------------------
const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle
} = require('discord.js');

// ------------------- Database Models -------------------
const { VendingRequest } = require('../models/VendingModel');
const Character = require("../models/CharacterModel");
const ItemModel = require('../models/ItemModel.js');

// ------------------- Database Connections -------------------
const {
  connectToInventories,
  connectToInventoriesNative,
  getInventoryCollection,
  connectToItems,
  fetchCharacterByName,
  getInventoryByCharacter,
  getCurrentVendingStockList, 
  generateVendingStockList,
  updateCharacterById,
  fetchCharacterByNameAndUserId,
  getTokenBalance,
  updateTokenBalance, 
} = require('../database/db');
// ------------------- Utility Functions -------------------
const {
  appendSheetData,
  authorizeSheets,
  extractSpreadsheetId,
  getSheetIdByTitle,
  isValidGoogleSheetsUrl,
  readSheetData,
  writeSheetData,
  safeAppendDataToSheet,
  fetchSheetData,
} = require("../utils/googleSheetsUtils.js");

const {
  addItemToVendingInventory,
} = require("../utils/inventoryUtils.js");

const {
  retrieveVendingRequestFromStorage,
  deleteVendingRequestFromStorage,
  saveVendingRequestToStorage,
  retrieveAllVendingRequests
} = require('../utils/storage.js');
const { handleError } = require('../utils/globalErrorHandler.js');

const {
  capitalizeFirstLetter
 } = require("../modules/formattingModule");

 const { createVendingSetupEmbed } = require("../embeds/embeds");


// ------------------- Constants -------------------
const DEFAULT_IMAGE_URL = "https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png";
const MONTHLY_VENDING_POINTS = 500;
const VIEW_SHOP_IMAGE_URL = DEFAULT_IMAGE_URL;

// ============================================================================
// ------------------- Handler Functions (Exported) -------------------
// Each function handles one vending subcommand. They are modular, async,
// and include error handling + DB updates where relevant.
// ============================================================================

// ------------------- Connect to vending database -------------------
async function connectToVendingDatabase() {
  const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {});
  try {
    await client.connect();
    return client.db("tinglebot"); // ✅ explicitly select the tinglebot DB
  } catch (error) {
    handleError(error, 'vendingHandler.js');
    throw error;
  }
}


// ------------------- executeVending -------------------
async function executeVending(interaction) {
  return await handleCollectPoints(interaction);
}

// ------------------- handleCollectPoints -------------------
// Handles monthly vending point collection for eligible characters.
async function handleCollectPoints(interaction) {
  try {
    const characterName = interaction.options.getString('charactername');
    const character = await fetchCharacterByName(characterName);

    if (!character) {
      return interaction.reply({
        content: `❌ Character "${characterName}" not found.`,
        ephemeral: true
      });
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // ------------------- Claim Check -------------------
    const alreadyClaimed = character.lastCollectedMonth === currentMonth;

    if (alreadyClaimed) {
      return interaction.reply({
        content: `⚠️ ${characterName} has already claimed vending points this month.`,
        ephemeral: true
      });
    }

    // ------------------- Job Validation -------------------
    const job = character.job?.toLowerCase();
    if (job !== 'shopkeeper' && job !== 'merchant') {
      return interaction.reply({
        content: `❌ Only characters with the job **Shopkeeper** or **Merchant** can claim vending points.`,
        ephemeral: true
      });
    }

      // ------------------- Setup Validation -------------------
      if (!character.vendingSetup || !character.shopLink) {
        return interaction.reply({
          content: `❌ You must complete vending setup before collecting points. Please run \`/vending setup\` first.`,
          ephemeral: true
        });
      }

      if (!character.vendingSync) {
        return interaction.reply({
          content: `❌ You must sync your vending sheet before collecting points. Please run \`/vending sync\` first.`,
          ephemeral: true
        });
      }

    // ------------------- Award Points -------------------
    const pointsAwarded = MONTHLY_VENDING_POINTS;

    await updateCharacterById(character._id, {
      vendingPoints: (character.vendingPoints || 0) + pointsAwarded,
      lastPointClaim: now,
      lastCollectedMonth: currentMonth
    });

    // ------------------- Embed Response -------------------
    const embed = new EmbedBuilder()
      .setTitle(`🪙 Vending Points Awarded`)
      .setDescription(`${characterName} received **${pointsAwarded}** vending points.`)
      .setFooter({ text: `Claimed: ${now.toLocaleDateString()}` });

    if (character.vendingSheetUrl) {
      embed.addFields({
        name: '📎 Shop Sheet',
        value: `[View Sheet](${character.vendingSheetUrl})`
      });
    }

    return interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.error('[handleCollectPoints]: Error', error);
    return interaction.reply({
      content: `❌ An unexpected error occurred. Please try again later.`,
      ephemeral: true
    });
  }
}

// ------------------- handleRestock -------------------
// Allows Shopkeepers/Merchants to restock items from monthly vending stock.

async function handleRestock(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // ------------------- Input Parsing -------------------
    const characterName = interaction.options.getString('charactername');
    const itemName = interaction.options.getString('itemname');
    const stockQty = interaction.options.getInteger('stockqty');
    const tokenPrice = interaction.options.getInteger('tokenprice') || 'N/A';
    const artPrice = interaction.options.getInteger('artprice') || 'N/A';
    const otherPrice = interaction.options.getInteger('otherprice') || 'N/A';
    const tradesOpen = interaction.options.getBoolean('tradesopen') || false;
    const userId = interaction.user.id;

    // ------------------- Slot Limits -------------------
    const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
    const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };

    const character = await fetchCharacterByName(characterName);
    if (!character || character.userId !== userId) {
      return interaction.editReply("❌ Character not found or doesn't belong to you.");
    }

    const baseSlots = baseSlotLimits[character.job?.toLowerCase()] || 0;
    const extraSlots = pouchCapacities[character.shopPouch?.toLowerCase()] || 0;
    const totalSlots = baseSlots + extraSlots;

    // ------------------- Existing Inventory Check -------------------
    const vendingClient = new MongoClient(process.env.MONGODB_INVENTORIES_URI);
    await vendingClient.connect();
    const vendingDb = vendingClient.db("vending");
    const inventoryCollection = vendingDb.collection(characterName.toLowerCase());
    const items = await inventoryCollection.find({}).toArray();
    
    // ------------------- Fetch Vending Stock for Current Month -------------------
    const currentMonth = new Date().getMonth() + 1;
    const currentVillage = character.currentVillage;

    console.log(`[handleRestock]: Fetching vending stock for month ${currentMonth}`);

    const client = new MongoClient(process.env.MONGODB_INVENTORIES_URI, {});
    await client.connect();
    const correctDb = client.db("tinglebot");
    const stockCollection = correctDb.collection("vending_stock");

    const stockDoc = await stockCollection.findOne({ month: currentMonth });
    await client.close();

    if (!stockDoc) {
      console.warn(`[handleRestock]: No stock document found for month ${currentMonth}`);
      return interaction.editReply(`❌ No vending stock found for month ${currentMonth}.`);
    }

    const villageStock = stockDoc.stockList?.[currentVillage] || [];
    const itemDoc = villageStock.find(i => i.itemName === itemName);

    if (!itemDoc || typeof itemDoc.points !== "number" || itemDoc.points <= 0) {
      return interaction.editReply(`❌ Item '${itemName}' is missing a valid vending point value in the vending stock.`);
    }

    // ------------------- Slot Usage Calculation -------------------
    const stackable = !itemDoc.crafting;
    const slotsUsed = existingItems.reduce((acc, item) => {
      return acc + (item.stackable ? Math.ceil(item.stockQty / 10) : item.stockQty);
    }, 0);
    const slotsRequired = stackable ? Math.ceil(stockQty / 10) : stockQty;

    if (slotsUsed + slotsRequired > totalSlots) {
      const reason = stackable
        ? `Stackable item (1 slot per 10 units)`
        : `Crafting item (1 slot per unit)`;
      return interaction.editReply(
        `⚠️ Not enough space.\n` +
        `**${characterName}** has **${totalSlots} slots** (${slotsUsed} used).\n` +
        `Adding \`${itemName}\` would need \`${slotsRequired}\`.\n\n${reason}`
      );
    }

    // ------------------- Vending Point Validation -------------------
    const vendingPoints = character.vendingPoints || 0;
    const pointCost = itemDoc.points;
    const totalCost = stockQty * pointCost;

    if (vendingPoints < totalCost) {
      return interaction.editReply(`⚠️ Not enough vending points. You need ${totalCost}, but only have ${vendingPoints}.`);
    }

    // ------------------- Insert Item into Local Inventory -------------------
    await inventory.insertOne({
      itemName,
      stockQty,
      costEach: pointCost,
      pointsSpent: totalCost,
      tokenPrice,
      artPrice,
      otherPrice,
      tradesOpen,
      stackable,
      boughtFrom: character.currentVillage,
      date: new Date()
    });

    // ------------------- Insert Item into Vending Inventory -------------------
    const vendingClient = new MongoClient(process.env.MONGODB_INVENTORIES_URI);
    await vendingClient.connect();
    const vendingDb = vendingClient.db("vending");
    const vendingCollection = vendingDb.collection(characterName.toLowerCase());

    await vendingCollection.insertOne({
      itemName,
      stockQty,
      costEach: pointCost,
      pointsSpent: totalCost,
      tokenPrice,
      artPrice,
      otherPrice,
      tradesOpen,
      stackable,
      boughtFrom: character.currentVillage,
      date: new Date()
    });

    await vendingClient.close();

    // ------------------- Update Character Points -------------------
    await Character.updateOne(
      { name: characterName },
      { $set: { vendingPoints: vendingPoints - totalCost } }
    );

    // ------------------- Append Row to Sheet -------------------
    try {
      const spreadsheetId = extractSpreadsheetId(character.shopLink);
      const auth = await authorizeSheets();
      const monthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

      const row = [[
        characterName, itemName, stockQty, pointCost, totalCost,
        character.currentVillage, tokenPrice, artPrice, otherPrice,
        tradesOpen ? 'Yes' : 'No', monthLabel
      ]];

      await safeAppendDataToSheet(character.shopLink, character, 'vendingShop!A:K', row, interaction.client);
    } catch (err) {
      console.error('[handleRestock]: Sheet logging failed', err);
    }

    // ------------------- Final Confirmation Embed -------------------
    const embed = new EmbedBuilder()
      .setTitle(`✅ Restock Successful`)
      .setDescription(`${characterName} has restocked \`${itemName} x${stockQty}\`.`)
      .addFields(
        { name: 'Points Used', value: `${totalCost}`, inline: true },
        { name: 'Slots Used', value: `${slotsRequired}`, inline: true },
        { name: 'Remaining Points', value: `${vendingPoints - totalCost}`, inline: true }
      )
      .setColor('#25C059')
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[handleRestock]: Error', error);
    await interaction.editReply({ content: `❌ ${error.message}`, ephemeral: true });
  }
}

// ------------------- handleBarter -------------------
async function handleBarter(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
  
      const buyerId = interaction.user.id;
      const buyerName = interaction.user.username;
      const targetShopName = interaction.options.getString("shop");
      const offeredItemName = interaction.options.getString("offer");
      const requestedItemName = interaction.options.getString("request");
  
      // ------------------- Validate Inputs -------------------
      if (!targetShopName || !offeredItemName || !requestedItemName) {
        return interaction.editReply("⚠️ Please provide all required options: `shop`, `offer`, and `request`.");
      }
  
      const buyer = await fetchCharacterByDiscordId(buyerId);
      if (!buyer) {
        return interaction.editReply("⚠️ Your character could not be found. Please create one first.");
      }
  
      const shopOwner = await fetchCharacterByName(targetShopName);
      if (!shopOwner || !shopOwner.vending?.stock) {
        return interaction.editReply(`⚠️ No vending shop found under the name **${targetShopName}**.`);
      }
  
      const shopStock = shopOwner.vending.stock;
      const requestedItem = shopStock.find(item => item.name.toLowerCase() === requestedItemName.toLowerCase());
      if (!requestedItem) {
        return interaction.editReply(`⚠️ The item **${requestedItemName}** is not available in ${targetShopName}'s shop.`);
      }
  
      // ------------------- Check Buyer's Inventory -------------------
      const inventories = await connectToInventories(buyer);
      const buyerInventory = inventories.inventory;
      const offeredItem = buyerInventory.find(item => item.name.toLowerCase() === offeredItemName.toLowerCase());
  
      if (!offeredItem || offeredItem.quantity < 1) {
        return interaction.editReply(`⚠️ You do not have **${offeredItemName}** in your inventory.`);
      }
  
      // ------------------- Execute Trade -------------------
      await removeItemFromInventory(buyerInventory, offeredItemName, 1);
      await addItemToInventory(buyerInventory, requestedItemName, 1);
  
      const shopInventories = await connectToInventories(shopOwner);
      await addItemToInventory(shopInventories.inventory, offeredItemName, 1);
  
      // ------------------- Save Fulfillment -------------------
      const fulfillmentId = uuidv4();
      const barterData = {
        fulfillmentId,
        userCharacterName: buyer.name,
        vendorCharacterName: shopOwner.name,
        itemName: requestedItem.name,
        quantity: 1,
        paymentMethod: 'trade',
        notes: `Bartered ${offeredItemName} for ${requestedItemName}`,
        buyerId,
        buyerUsername: buyerName,
        date: new Date()
      };
  
      const fulfillment = new VendingRequest(barterData);
      await fulfillment.save();
  
      // ------------------- Confirmation Embed -------------------
      const embed = new EmbedBuilder()
        .setTitle(`🛒 Barter Successful`)
        .setDescription(`**${buyer.name}** has bartered with **${shopOwner.name}**.`)
        .addFields(
          { name: '🧾 Offered', value: `\`${offeredItemName}\``, inline: true },
          { name: '📦 Received', value: `\`${requestedItemName}\``, inline: true },
          { name: '🪪 Fulfillment ID', value: fulfillmentId, inline: false }
        )
        .setFooter({ text: `Buyer: ${buyerName}` })
        .setColor('#3498db')
        .setTimestamp();
  
      await interaction.editReply({ embeds: [embed] });
  
    } catch (error) {
      console.error("[handleBarter]:", error);
      await interaction.editReply({ content: `❌ ${error.message}`, ephemeral: true });
    }
  }
  
// ------------------- handleFulfill -------------------
async function handleFulfill(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
  
      const fulfillmentId = interaction.options.getString("fulfillmentid");
      if (!fulfillmentId) {
        return interaction.editReply("⚠️ Please provide a valid `fulfillmentid`.");
      }
  
      // ------------------- Fetch Barter Request -------------------
      const request = await VendingRequest.findOne({ fulfillmentId });
      if (!request) {
        return interaction.editReply(`⚠️ No pending barter request found with ID **${fulfillmentId}**.`);
      }
  
      const {
        userCharacterName,
        vendorCharacterName,
        itemName,
        quantity
      } = request;
  
      // ------------------- Fetch Characters -------------------
      const buyer = await fetchCharacterByName(userCharacterName);
      const vendor = await fetchCharacterByName(vendorCharacterName);
  
      if (!buyer || !vendor) {
        return interaction.editReply("❌ Buyer or vendor character could not be found.");
      }
  
      // ------------------- Validate Vendor Inventory -------------------
      const vendorInventory = await connectToInventories(vendor);
      const stockItem = vendorInventory.inventory.find(
        item => item.itemName.toLowerCase() === itemName.toLowerCase()
      );
  
      if (!stockItem || stockItem.quantity < quantity) {
        return interaction.editReply(`⚠️ ${vendor.name} does not have enough stock of **${itemName}** to fulfill this request.`);
      }
  
      // ------------------- Transfer Item -------------------
      await removeItemFromInventory(vendorInventory.inventory, itemName, quantity);
      const buyerInventory = await connectToInventories(buyer);
      await addItemToInventory(buyerInventory.inventory, itemName, quantity);
  
      // ------------------- Delete Fulfillment Request -------------------
      await VendingRequest.deleteOne({ fulfillmentId });
  
      // ------------------- Confirmation Embed -------------------
      const embed = new EmbedBuilder()
        .setTitle(`✅ Barter Fulfilled`)
        .setDescription(`**${vendor.name}** has fulfilled a barter request for **${buyer.name}**.`)
        .addFields(
          { name: '📦 Item', value: `\`${itemName} x${quantity}\``, inline: true },
          { name: '👤 Buyer', value: buyer.name, inline: true },
          { name: '🧾 Vendor', value: vendor.name, inline: true },
          { name: '🔐 Fulfillment ID', value: fulfillmentId, inline: false }
        )
        .setColor(0x00cc99)
        .setTimestamp();
  
      await interaction.editReply({ embeds: [embed] });
  
    } catch (error) {
      console.error("[handleFulfill]:", error);
      await interaction.editReply({
        content: "❌ An error occurred while fulfilling the barter. Please try again later.",
        ephemeral: true
      });
    }
  }
  
// ------------------- handlePouchUpgrade -------------------
async function handlePouchUpgrade(interaction) {
    try {
      const characterName = interaction.options.getString('charactername');
      const pouchType = interaction.options.getString('pouchtype');
      const userId = interaction.user.id;
  
      // Fetch character
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        throw new Error(`Character '${characterName}' not found or does not belong to you.`);
      }
  
      // Define pouch tiers and pricing
      const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
      const pouchCosts = { bronze: 1000, silver: 5000, gold: 10000 };
  
      // Prevent downgrading or selecting same tier
      const currentTier = character.shopPouch || 'none';
      if (pouchCapacities[pouchType] <= pouchCapacities[currentTier]) {
        throw new Error(`You cannot downgrade or select the same pouch type.`);
      }
  
      // Check if user can afford it
      const userTokens = await getTokenBalance(userId);
      const cost = pouchCosts[pouchType];
      if (userTokens < cost) {
        throw new Error(`Upgrading to ${pouchType} costs ${cost} tokens, but you only have ${userTokens}.`);
      }
  
      // Perform upgrade and update data
      await updateTokenBalance(userId, -cost);
      character.shopPouch = pouchType;
      await character.save();
  
      // Respond with confirmation embed
      const embed = new EmbedBuilder()
        .setTitle('✅ **Pouch Upgrade Successful!**')
        .setDescription(`**${character.name}** has upgraded their pouch to **${capitalizeFirstLetter(pouchType)}**.`)
        .addFields(
          { name: '🛍️ **New Capacity**', value: `${pouchCapacities[pouchType]} slots`, inline: true },
          { name: '💰 **Tokens Spent**', value: `${cost}`, inline: true },
          { name: '💰 **Remaining Tokens**', value: `${userTokens - cost}`, inline: true }
        )
        .setColor('#AA926A')
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');
  
      await interaction.reply({ embeds: [embed], ephemeral: false });
    } catch (error) {
      handleError(error, 'vendingHandler.js');
      console.error('[handlePouchUpgrade]: Error:', error);
      await interaction.reply({
        content: `❌ **Error:** ${error.message}`,
        ephemeral: true,
      });
    }
  }
  
// ------------------- handleViewShop -------------------
async function handleViewShop(interaction) {
    try {
      const characterName = interaction.options.getString("charactername");
  
      // Fetch the character from the database
      const character = await Character.findOne({ name: characterName });
      if (!character) {
        throw new Error(`Character '${characterName}' not found.`);
      }
  // ------------------- Simple URL Validator -------------------
function isValidUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

      // Validate the shop image URL
      const shopImage = isValidUrl(character.shopImage)
        ? character.shopImage
        : VIEW_SHOP_IMAGE_URL;
  
      // Connect to the vending inventory database
      const client = await connectToVendingDatabase();
      const db = client; 
      const inventoryCollection = db.collection(characterName.toLowerCase());
  
      // Fetch all items in the character's vending inventory
    const items = await inventoryCollection.find({}).toArray();
    if (!items || items.length === 0) {
      return interaction.reply({
        content: `📭 ${characterName}'s shop is currently empty. Try restocking using \`/vending restock\`.`,
        ephemeral: true
      });
    }

      const itemDescriptionsArray = await Promise.all(
        items.map(async (item) => {
          const itemDetails = await ItemModel.findOne({ itemName: item.itemName });
          const emoji = itemDetails?.emoji || "🔹";
          return `**${emoji} ${item.itemName}** - \`qty: ${item.stockQty}\`\n> **Token Price:** ${item.tokenPrice || "N/A"}\n> **Art Price:** ${item.artPrice || "N/A"}\n> **Other Price:** ${item.otherPrice || "N/A"}\n> **Trades Open:** ${item.tradesOpen ? "Yes" : "No"}`;
        })
      );
  
      // Pagination setup
      const itemsPerPage = 4;
      const totalPages = Math.ceil(itemDescriptionsArray.length / itemsPerPage);
  
      const generateEmbed = (page) => {
        const start = (page - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const pageItems = itemDescriptionsArray.slice(start, end).join("\n\n");
  
        return new EmbedBuilder()
          .setTitle(`🛍️ ${characterName}'s Shop (Page ${page}/${totalPages})`)
          .setDescription(`${pageItems}\n\n💡 Use </vending barter:1306176790095728737> to buy from this character!`)
          .setColor("#AA926A")
          .setThumbnail(character.icon || DEFAULT_IMAGE_URL)
          .setImage(shopImage)
          .setFooter({
            text: `${characterName}: ${character.job} is currently in ${capitalizeFirstLetter(character.currentVillage)}!`,
            iconURL: interaction.user.displayAvatarURL(),
          });
      };
  
      const createButtons = (currentPage) =>
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("prev_page")
            .setLabel("Previous")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 1),
          new ButtonBuilder()
            .setCustomId("next_page")
            .setLabel("Next")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === totalPages)
        );
  
      // Initial message
      let currentPage = 1;
      const embed = generateEmbed(currentPage);
      const message = await interaction.reply({
        embeds: [embed],
        components: [createButtons(currentPage)],
        fetchReply: true,
      });
  
      const collector = message.createMessageComponentCollector({
        filter: (btnInteraction) => btnInteraction.user.id === interaction.user.id,
        time: 60000,
      });
  
      collector.on("collect", async (btnInteraction) => {
        try {
          if (btnInteraction.customId === "prev_page") {
            currentPage = Math.max(1, currentPage - 1);
          } else if (btnInteraction.customId === "next_page") {
            currentPage = Math.min(totalPages, currentPage + 1);
          }
  
          await btnInteraction.update({
            embeds: [generateEmbed(currentPage)],
            components: [createButtons(currentPage)],
          });
        } catch (error) {
          handleError(error, "vendingHandler.js");
          if (error.code === 10008) {
            collector.stop();
          }
        }
      });
  
      collector.on("end", async () => {
        try {
          await message.edit({ components: [] });
        } catch (error) {
          handleError(error, "vendingHandler.js");
        }
      });
    } catch (error) {
      handleError(error, "vendingHandler.js");
      console.error(`[handleViewShop]: Error viewing shop:`, error);
      try {
        await interaction.reply({
          content: `❌ An error occurred while viewing the shop: ${error.message}`,
          ephemeral: true,
        });
      } catch (replyError) {
        handleError(replyError, "vendingHandler.js");
      }
    }
  }
  
// ------------------- handleVendingSetup -------------------
async function handleVendingSetup(interaction) {
    try {
      const characterName = interaction.options.getString('charactername');
      const shopLink = interaction.options.getString('shoplink');
      const pouch = interaction.options.getString('pouch');
      const points = interaction.options.getInteger('points');
      const userId = interaction.user.id;
  
      // ------------------- Step 1: Validate Shop Link -------------------
      if (!isValidGoogleSheetsUrl(shopLink)) {
        await interaction.reply({
          content: '❌ Invalid Google Sheets link. Please provide a valid link.',
          ephemeral: true
        });
        return;
      }
  
      // ------------------- Step 2: Fetch Character -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.reply({
          content: `❌ Character '${characterName}' not found.`,
          ephemeral: true
        });
        return;
      }
  
      if (character.vendingSetup) {
        await interaction.reply({
          content: `❌ **${characterName}** has already been set up for vending.`,
          ephemeral: true
        });
        return;
      }
  
      // ------------------- Step 3: Spreadsheet Authorization & Validation -------------------
      const spreadsheetId = extractSpreadsheetId(shopLink);
      if (!spreadsheetId) {
        await interaction.reply({
          content: '❌ Unable to extract Spreadsheet ID from the provided link.',
          ephemeral: true
        });
        return;
      }
      
      const auth = await authorizeSheets(); // ✅ Define auth before use
      
      const sheetId = await getSheetIdByTitle(auth, spreadsheetId, 'vendingShop');
      if (!sheetId) {
        await sendSetupInstructions(interaction, 'missing_sheet', character._id, characterName, shopLink);
        return;
      }
  
      // ------------------- Step 4: Header Check -------------------
      const expectedHeaders = [
        'CHARACTER NAME', 'ITEM NAME', 'STOCK QTY', 'COST EACH', 'POINTS SPENT',
        'BOUGHT FROM', 'TOKEN PRICE', 'ART PRICE', 'OTHER PRICE', 'TRADES OPEN?', 'DATE'
      ];
      const sheetData = await readSheetData(auth, spreadsheetId, 'vendingShop!A1:L1');
      if (!sheetData || !expectedHeaders.every(header => sheetData[0]?.includes(header))) {
        await sendSetupInstructions(interaction, 'missing_headers', character._id, characterName, shopLink);
        return;
      }
  
      // ------------------- Step 5: Apply Pouch Size Logic -------------------
      const pouchSizes = {
        bronze: 15,
        silver: 30,
        gold: 50,
        none: character.job.toLowerCase() === 'merchant' ? 3 : 5
      };
      const pouchSize = pouchSizes[pouch] || 3;
  
      // ------------------- Step 6: Update Character -------------------
      await updateCharacterById(character._id, {
        shopLink,
        vendingType: character.job,
        shopPouch: pouch,
        pouchSize,
        vendingPoints: points,
        vendingSetup: true
      });
  
      // ------------------- Step 7: Respond with Confirmation -------------------
      const setupEmbed = createVendingSetupEmbed(characterName, shopLink, pouch, points, pouchSize);
      await interaction.reply({
        embeds: [setupEmbed],
        ephemeral: true
      });
    } catch (error) {
      handleError(error, 'vendingHandler.js');
      console.error(`[handleVendingSetup]: Error during vending setup:`, error);
      await interaction.reply({
        content: '❌ An error occurred during setup. Please try again later.',
        ephemeral: true
      });
    }
  }
  
// ------------------- handleVendingSync -------------------
// Syncs inventory from Google Sheets to the vending database for a character.
async function handleVendingSync(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // ------------------- Step 1: Validate Character -------------------
    const characterName = interaction.options.getString('charactername');
    const userId = interaction.user.id;
    const character = await fetchCharacterByNameAndUserId(characterName, userId);

    if (!character) {
      throw new Error(`Character '${characterName}' not found or doesn't belong to you.`);
    }

    if (!character.shopLink) {
      throw new Error(`No shop link found for **${characterName}**. Use \`/vending setup\` first.`);
    }

    if (character.vendingSync) {
      throw new Error(`Sync has already been completed for **${characterName}**.`);
    }

    // ------------------- Step 2: Fetch Sheet Data -------------------
    const spreadsheetId = extractSpreadsheetId(character.shopLink);
    const auth = await authorizeSheets();
    const sheetData = await fetchSheetData(auth, spreadsheetId, 'vendingShop!A2:K');

    if (!sheetData?.length) {
      throw new Error('No data found in the vendingShop sheet.');
    }

    // ------------------- Step 3: Parse and Validate Rows -------------------
    const parsedRows = [];

    for (const row of sheetData) {
      const [
        sheetCharacterName,
        itemName,
        stockQtyRaw,
        costEachRaw,
        pointsSpentRaw,
        boughtFrom,
        tokenPriceRaw,
        artPrice,
        otherPrice,
        tradesOpen,
        date
      ] = row;

      if (
        sheetCharacterName !== character.name ||
        !itemName ||
        date?.toLowerCase() !== 'old stock'
      ) continue;

      const item = await fetchItemByName(itemName);
      if (!item) {
        console.warn(`[handleVendingSync]: Skipping unknown item "${itemName}".`);
        continue;
      }

      parsedRows.push({
        characterName: character.name,
        itemName,
        itemId: item._id,
        stockQty: parseInt(stockQtyRaw || 0),
        costEach: parseInt(costEachRaw || 0),
        pointsSpent: parseInt(pointsSpentRaw || 0),
        boughtFrom,
        tokenPrice: parseInt(tokenPriceRaw || 0),
        artPrice: artPrice || '',
        otherPrice: otherPrice || '',
        tradesOpen: tradesOpen?.toLowerCase() === 'yes',
        date: new Date()
      });
    }

    if (!parsedRows.length) {
      await updateCharacterById(character._id, {
        vendingSync: true
      });
    
      return await interaction.editReply({
        content: `⚠️ No valid "Old Stock" entries found. Proceeding to sync with an empty inventory. This cannot be undone.`,
        ephemeral: true
      });
    }
    

    // ------------------- Step 4: Insert Into Database -------------------
    const db = await connectToInventories();
    const collection = db.collection(character.name.toLowerCase());

    await collection.insertMany(parsedRows);

    // ------------------- Step 5: Finalize Sync -------------------
    await updateCharacterById(character._id, { vendingSync: true });

    const embed = new EmbedBuilder()
      .setTitle(`✅ Sync Complete`)
      .setDescription(`Successfully synced **${parsedRows.length}** items to **${character.name}**'s vending inventory.`)
      .setColor('#25C059');

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('[handleVendingSync]:', error);
    await interaction.editReply({
      content: `❌ Sync failed: ${error.message}`,
      ephemeral: true
    });
  }
}
  
// ------------------- handleEditShop -------------------
async function handleEditShop(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });
  
      // ------------------- Extract Inputs -------------------
      const characterName = interaction.options.getString('charactername');
      const itemName = interaction.options.getString('itemname');
      const shopImageFile = interaction.options.getAttachment('shopimagefile');
      const tokenPrice = interaction.options.getInteger('tokenprice');
      const artPrice = interaction.options.getString('artprice');
      const otherPrice = interaction.options.getString('otherprice');
      const tradesOpen = interaction.options.getBoolean('tradesopen');
      const userId = interaction.user.id;
  
      // ------------------- Fetch Character -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) throw new Error(`Character '${characterName}' not found or does not belong to you.`);
  
      // ------------------- Handle Shop Image Upload -------------------
      if (itemName.toLowerCase() === 'shop image') {
        if (!shopImageFile) throw new Error('No shop image file uploaded.');
  
        const sanitizedName = characterName.replace(/\s+/g, '');
        const imageName = `${sanitizedName}_shop_image_${Date.now()}`;
        const imageUrl = await uploadSubmissionImage(shopImageFile.url, imageName);
  
        await Character.updateOne({ name: characterName }, { $set: { shopImage: imageUrl } });
  
        await interaction.editReply({
          content: `✅ Shop image updated for **${characterName}**!`
        });
        return;
      }
  
      // ------------------- Connect to Inventory DB -------------------
      const client = await connectToVendingDatabase();
      const db = client; 
      const inventory = db.collection(characterName.toLowerCase());
  
      const item = await inventory.findOne({ itemName });
      if (!item) throw new Error(`Item '${itemName}' not found in ${characterName}'s shop.`);
  
      // ------------------- Apply Updates -------------------
      const updateFields = {};
      if (tokenPrice !== null) updateFields.tokenPrice = tokenPrice;
      if (artPrice) updateFields.artPrice = artPrice;
      if (otherPrice) updateFields.otherPrice = otherPrice;
      if (tradesOpen !== null) updateFields.tradesOpen = tradesOpen;
  
      if (Object.keys(updateFields).length === 0) throw new Error('No valid fields provided for update.');
  
      await inventory.updateOne({ itemName }, { $set: updateFields });
  
      // ------------------- Update Google Sheet -------------------
      const spreadsheetId = extractSpreadsheetId(character.shopLink);
      if (!spreadsheetId) throw new Error(`Invalid or missing shop link for '${characterName}'.`);
  
      const auth = await authorizeSheets();
      const sheetData = await readSheetData(auth, spreadsheetId, 'vendingShop!A:K');
      const rowIndex = sheetData.findIndex(row => row[1] === itemName);
      if (rowIndex === -1) throw new Error(`Item '${itemName}' not found in the shop spreadsheet.`);
  
      const updatedRow = [
        characterName,
        itemName,
        sheetData[rowIndex][2], // Stock Qty
        sheetData[rowIndex][3], // Cost Each
        sheetData[rowIndex][4], // Points Spent
        sheetData[rowIndex][5], // Bought From
        tokenPrice !== null ? tokenPrice : sheetData[rowIndex][6],
        artPrice || sheetData[rowIndex][7],
        otherPrice || sheetData[rowIndex][8],
        tradesOpen !== null ? (tradesOpen ? 'Yes' : 'No') : sheetData[rowIndex][9],
        sheetData[rowIndex][10] // Date
      ];
  
      const range = `vendingShop!A${rowIndex + 1}:K${rowIndex + 1}`;
      await writeSheetData(auth, spreadsheetId, range, [updatedRow]);
  
      // ------------------- Success Embed -------------------
      const embed = new EmbedBuilder()
        .setTitle('✅ **Item Updated Successfully!**')
        .setDescription(`**${itemName}** in **${characterName}'s** shop has been updated.`)
        .addFields(
          { name: '💰 Token Price', value: `${tokenPrice ?? item.tokenPrice ?? 'N/A'}`, inline: true },
          { name: '🎨 Art Price', value: `${artPrice ?? item.artPrice ?? 'N/A'}`, inline: true },
          { name: '📜 Other Price', value: `${otherPrice ?? item.otherPrice ?? 'N/A'}`, inline: true },
          { name: '🔄 Trades Open', value: `${tradesOpen !== null ? (tradesOpen ? 'Yes' : 'No') : item.tradesOpen ? 'Yes' : 'No'}`, inline: true }
        )
        .setColor('#AA926A')
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');
  
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      handleError(error, 'vendingHandler.js');
      console.error('[handleEditShop]:', error);
      await interaction.editReply({
        content: `❌ Error editing shop item: ${error.message}`,
        ephemeral: true
      });
    }
  }
  
// ------------------- handleShopLink -------------------
async function handleShopLink(interaction) {
    try {
      const characterName = interaction.options.getString('charactername');
      const shopLink = interaction.options.getString('link');
  
      // ------------------- Step 1: Validate Link -------------------
      if (!isValidGoogleSheetsUrl(shopLink)) {
        await interaction.reply({
          content: '❌ Invalid Google Sheets link. Please provide a valid link.',
          ephemeral: true,
        });
        return;
      }
  
      // ------------------- Step 2: Fetch Character -------------------
      const userId = interaction.user.id;
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.reply({
          content: `❌ Character '${characterName}' not found.`,
          ephemeral: true,
        });
        return;
      }
  
      // ------------------- Step 3: Update Character Sheet Link -------------------
      await Character.updateOne(
        { _id: character._id },
        { $set: { shopLink } }
      );
  
      // ------------------- Step 4: Respond to User -------------------
      await interaction.reply({
        content: `✅ Shop link for **${characterName}** updated successfully!`,
        ephemeral: false,
      });
    } catch (error) {
      handleError(error, 'vendingHandler.js');
      console.error('[handleShopLink]: Error updating shop link:', error);
      await interaction.reply({
        content: '❌ An error occurred while updating the shop link. Please try again later.',
        ephemeral: true,
      });
    }
  }
  
// ------------------- generateVillageButtonRow -------------------
const villageEmojis = {
  rudania: { id: '899492917452890142', name: 'rudania' },
  inariko: { id: '899493009073274920', name: 'inariko' },
  vhintl: { id: '899492879205007450', name: 'vhintl' },
};

function generateVillageButtonRow(currentVillageKey = '') {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('vending_view|rudania')
      .setLabel('Rudania')
      .setEmoji(villageEmojis.rudania)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(currentVillageKey === 'rudania'),

    new ButtonBuilder()
      .setCustomId('vending_view|inariko')
      .setLabel('Inariko')
      .setEmoji(villageEmojis.inariko)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(currentVillageKey === 'inariko'),

    new ButtonBuilder()
      .setCustomId('vending_view|vhintl')
      .setLabel('Vhintl')
      .setEmoji(villageEmojis.vhintl)
      .setStyle(ButtonStyle.Success)
      .setDisabled(currentVillageKey === 'vhintl')
  );
}


// ------------------- viewVendingStock -------------------
async function viewVendingStock(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long' });

    // First attempt
    let result = await getCurrentVendingStockList();

    // Auto-generate if missing
    if (!result || !result.stockList || Object.keys(result.stockList).length === 0) {
      console.warn(`[viewVendingStock]⚠️ No vending stock for ${monthName} — generating now...`);
      await generateVendingStockList();
      result = await getCurrentVendingStockList();
    }

    if (!result || !result.stockList || Object.keys(result.stockList).length === 0) {
      return interaction.editReply({
        content: `📭 No vending stock available for **${monthName}**, even after regeneration.`,
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setTitle(`📊 Vending Stock — ${monthName}`)
      .setDescription(`Click a button below to view vending stock by village or see limited items.`)
      .setColor('#88cc88');

    // Styled buttons with emojis
    const villageRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('vending_view|rudania')
        .setLabel('Rudania')
        .setEmoji({ id: '899492917452890142', name: 'rudania' })
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId('vending_view|inariko')
        .setLabel('Inariko')
        .setEmoji({ id: '899493009073274920', name: 'inariko' })
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('vending_view|vhintl')
        .setLabel('Vhintl')
        .setEmoji({ id: '899492879205007450', name: 'vhintl' })
        .setStyle(ButtonStyle.Success)
    );

    const limitedRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('vending_view_limited')
        .setLabel('Limited Items')
        .setEmoji('🎁')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.editReply({
      embeds: [embed],
      components: [villageRow, limitedRow]
    });

  } catch (err) {
    console.error('[viewVendingStock]: Error loading vending_stock:', err);
    return interaction.editReply({
      content: `❌ An error occurred while retrieving vending stock.`,
      ephemeral: true
    });
  }
}

// ------------------- handleVendingViewVillage -------------------
async function handleVendingViewVillage(interaction, villageKey) {
  try {
    const result = await getCurrentVendingStockList();
    const stockList = result?.stockList || {};
    const limitedItems = result?.limitedItems || [];

    if (!stockList[villageKey] && villageKey !== 'limited') {
      return interaction.update({
        content: `❌ No vending stock found for **${villageKey}**.`,
        embeds: [],
        components: interaction.message.components
      });
    }

    // ----- Determine per-village settings -----
    const villageSettings = {
      rudania: {
        emoji: '<:rudania:899492917452890142>',
        color: '#d93e3e',
        image: 'https://static.wixstatic.com/media/7573f4_a0d0d9c6b91644f3b67de8612a312e42~mv2.png/v1/fill/w_830,h_175,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/bottom%20border%20red.png'
      },
      inariko: {
        emoji: '<:inariko:899493009073274920>',
        color: '#3e7ed9',
        image: 'https://static.wixstatic.com/media/7573f4_c88757c19bf244aa9418254c43046978~mv2.png/v1/fill/w_830,h_175,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/bottom%20border%20blue.png'
      },
      vhintl: {
        emoji: '<:vhintl:899492879205007450>',
        color: '#3ed96a',
        image: 'https://static.wixstatic.com/media/7573f4_968160b5206e4d9aa1b254464d97f9a9~mv2.png/v1/fill/w_830,h_175,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/bottom%20border%20GREEN.png'
      },
      limited: {
        emoji: '🎁',
        color: '#00d6d6',
        image: 'https://storage.googleapis.com/tinglebot/Graphics/%5BRotW%5D%20border_cyan_bottom.png'
      }
    };

    const settings = villageSettings[villageKey] || {
      emoji: '🏘️',
      color: '#f4c542',
      image: null
    };

    const embed = new EmbedBuilder()
      .setTitle(`${settings.emoji} Vending Stock — ${villageKey[0].toUpperCase() + villageKey.slice(1)}`)
      .setColor(settings.color);

    if (villageKey === 'limited') {
      embed.setDescription(
        limitedItems.map(i =>
          `${i.emoji || '📦'} **${i.itemName}**\n  > **Cost:** ${i.points} pts\n  > **Stock:** x${i.stock ?? '?'}`
        ).join('\n\n') || '*No limited items available*'
      );
    } else {
      const items = stockList[villageKey];
      embed.setDescription(
        items.map(i =>
          `${i.emoji || '📦'} **${i.itemName}**\n  > **Cost:** ${i.points} pts\n  > **Type:** ${i.vendingType}`
        ).join('\n\n') || '*No items found*'
      );
    }

    if (settings.image) {
      embed.setImage(settings.image);
    }

    return interaction.update({
      embeds: [embed],
      components: [
        generateVillageButtonRow(villageKey),
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('vending_view_limited')
            .setLabel('Limited Items')
            .setEmoji('🎁')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(villageKey === 'limited')
        )
      ]
    });

  } catch (err) {
    console.error(`[handleVendingViewVillage]: ${err.message}`);
    return interaction.update({
      content: `❌ Failed to load vending data.`,
      embeds: [],
      components: interaction.message.components
    });
  }
}

// ============================================================================
// ------------------- Helper Functions (Private) -------------------
// These support the above handlers internally. Not exported.
// ============================================================================


// ------------------- createFulfillmentRequest -------------------
function createFulfillmentRequest(data) {
    return new VendingRequest({
      fulfillmentId: uuidv4(),
      userCharacterName: data.userCharacterName,
      vendorCharacterName: data.vendorCharacterName,
      itemName: data.itemName,
      quantity: data.quantity,
      paymentMethod: data.paymentMethod,
      notes: data.notes || '',
      buyerId: data.buyerId,
      buyerUsername: data.buyerUsername,
      date: new Date()
    });
  }
  
// ------------------- validateItemName -------------------
function validateItemName(itemName) {
    const trimmed = itemName.trim();
    const isValid = /^[\w\s\-']{2,50}$/i.test(trimmed); // letters, numbers, spaces, -, '
    return isValid ? trimmed : null;
  }
  
// ------------------- isCraftable -------------------
function isCraftable(item) {
    return Boolean(item?.crafting);
  }
  
// ------------------- parsePriceInputs -------------------
function parsePriceInputs(inputs) {
    return {
      tokenPrice: typeof inputs.tokenPrice === 'number' ? inputs.tokenPrice : 'N/A',
      artPrice: inputs.artPrice?.trim() || 'N/A',
      otherPrice: inputs.otherPrice?.trim() || 'N/A',
      tradesOpen: inputs.tradesOpen === true
    };
  }

// ------------------- generateFulfillEmbed -------------------
function generateFulfillEmbed(request) {
    return new EmbedBuilder()
      .setTitle(`📦 Barter Request`)
      .setDescription(`**${request.userCharacterName}** requested \`${request.itemName} x${request.quantity}\``)
      .addFields(
        { name: 'Vendor', value: request.vendorCharacterName, inline: true },
        { name: 'Payment Method', value: request.paymentMethod, inline: true },
        { name: 'Notes', value: request.notes || '—', inline: false },
        { name: 'Fulfillment ID', value: request.fulfillmentId, inline: false }
      )
      .setColor('#f5a623')
      .setFooter({ text: `Requested by ${request.buyerUsername}` })
      .setTimestamp();
  }

  // ============================================================================
// ------------------- Module Exports -------------------
// Export all public vending subcommand handlers.
// ============================================================================
module.exports = {
    executeVending,
    handleRestock,
    handleBarter,
    handleFulfill,
    handlePouchUpgrade,
    handleViewShop,
    handleVendingSetup,
    handleVendingSync,
    handleEditShop,
    handleShopLink,
    viewVendingStock,
    handleVendingViewVillage
  };
  