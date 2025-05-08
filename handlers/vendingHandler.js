// ============================================================================
// ------------------- Vending Handler Blueprint -------------------
// Handles all /vending subcommands for barter, restock, fulfill, etc.
// ============================================================================

// ------------------- Standard Libraries -------------------
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require("mongodb");
const mongoose = require('mongoose');
const VENDING_DB_URI = process.env.MONGODB_INVENTORIES_URI;

// ------------------- Discord.js Components -------------------
const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle
} = require('discord.js');

// ------------------- Database Models -------------------
const { VendingRequest, initializeVendingInventoryModel } = require('../models/VendingModel');
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
  fetchItemByName
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

 const { createVendingSetupInstructionsEmbed } = require("../embeds/embeds");

// ------------------- Vending Model Helper -------------------
async function getVendingModel(characterName) {
  return await initializeVendingInventoryModel(characterName);
}

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
    return client.db("vending");
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
        content: `❌ **Invalid Vendor Type:** ${character.name} must be a **Shopkeeper** or **Merchant** to collect vending points.\n\nCurrent job: **${character.job || 'None'}**\n\nTo become a vendor:\n1. Use a Job Voucher to change to Shopkeeper or Merchant\n2. Run \`/vending setup\` to initialize your shop\n3. Run \`/vending sync\` to sync your inventory`,
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
    const manualSlot = interaction.options.getString('slot'); // <-- added
    const stockQty = interaction.options.getInteger('stockqty');
    const tokenPrice = interaction.options.getInteger('tokenprice') || 'N/A';
    const artPrice = interaction.options.getInteger('artprice') || 'N/A';
    const otherPrice = interaction.options.getInteger('otherprice') || 'N/A';
    const tradesOpen = interaction.options.getBoolean('tradesopen') || false;
    const userId = interaction.user.id;

    // ------------------- Character Validation -------------------
    const character = await fetchCharacterByName(characterName);
    if (!character || character.userId !== userId) {
      return interaction.editReply("❌ Character not found or doesn't belong to you.");
    }

    // ------------------- Slot Limits -------------------
    const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
    const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
    const baseSlots = baseSlotLimits[character.job?.toLowerCase()] || 0;
    const extraSlots = pouchCapacities[character.shopPouch?.toLowerCase()] || 0;
    const totalSlots = baseSlots + extraSlots;

    // ------------------- DB Connections -------------------
    const vendingClient = new MongoClient(process.env.MONGODB_INVENTORIES_URI);
    await vendingClient.connect();
    const vendDb = vendingClient.db("vending");
    const vendCollection = vendDb.collection(characterName.toLowerCase());
    const items = await vendCollection.find({}).toArray();

    // ------------------- Fetch Stock Data -------------------
    const currentMonth = new Date().getMonth() + 1;
    const currentVillage = character.currentVillage;
    const stockDbClient = new MongoClient(process.env.MONGODB_INVENTORIES_URI);
    await stockDbClient.connect();
    const stockDb = stockDbClient.db("tinglebot");
    const stockDoc = await stockDb.collection("vending_stock").findOne({ month: currentMonth });
    await stockDbClient.close();

    if (!stockDoc) {
      return interaction.editReply(`❌ No vending stock found for month ${currentMonth}.`);
    }

    const villageStock = stockDoc.stockList?.[currentVillage] || [];
    const itemDoc = villageStock.find(i => i.itemName === itemName);

    if (!itemDoc || typeof itemDoc.points !== "number" || itemDoc.points <= 0) {
      return interaction.editReply(`❌ Invalid Item: '${itemName}'\n\nThis item is not available in ${currentVillage}'s vending stock or has an invalid point cost.\n\nPlease check the current month's vending stock list using \`/vending stock\` to see available items.`);
    }

    // ------------------- Slot Usage Calculation -------------------
    const stackable = !itemDoc.crafting;
    const slotsUsed = items.reduce((acc, item) => {
      return acc + (item.stackable ? Math.ceil(item.stockQty / 10) : item.stockQty);
    }, 0);
    const slotsRequired = stackable ? Math.ceil(stockQty / 10) : stockQty;

    if (slotsUsed + slotsRequired > totalSlots) {
      return interaction.editReply(
        `⚠️ Not enough space.\n` +
        `**${characterName}** has **${totalSlots} slots** (${slotsUsed} used).\n` +
        `Adding \`${itemName}\` would need \`${slotsRequired}\`.\n\n` +
        `${stackable ? 'Stackable item (1 slot per 10 units)' : 'Crafting item (1 slot per unit)'}`
      );
    }

    // ------------------- Vending Point Validation -------------------
    const vendingPoints = character.vendingPoints || 0;
    const pointCost = itemDoc.points;
    const totalCost = stockQty * pointCost;
    if (vendingPoints < totalCost) {
      return interaction.editReply(`⚠️ Not enough vending points. You need ${totalCost}, but only have ${vendingPoints}.`);
    }

    // ------------------- Authorize Sheets & Get Slot -------------------
    const spreadsheetId = extractSpreadsheetId(character.shopLink);
    const auth = await authorizeSheets();
    const sheetData = await readSheetData(auth, spreadsheetId, 'vendingShop!A2:L') || [];
    
    if (!Array.isArray(sheetData)) {
      return interaction.editReply("❌ Unable to read data from the vendingShop sheet. Make sure the sheet exists and has proper permissions.");
    }
    
    const existingSlots = sheetData.map(row => row[1]?.trim()).filter(s => /^Slot \d+$/.test(s));    

    const usedSlotNums = new Set();
    for (const slot of existingSlots) {
      const match = /^Slot (\d+)$/.exec(slot);
      if (match) usedSlotNums.add(Number(match[1]));
    }

    let newSlot = manualSlot || null;

    if (!newSlot && stackable) {
      const matchingStacks = await vendCollection.find({ itemName, stackable: true }).toArray();
      const slotTotals = {};
      for (const entry of matchingStacks) {
        if (!/^Slot \d+$/.test(entry.slot)) continue;
        slotTotals[entry.slot] = (slotTotals[entry.slot] || 0) + entry.stockQty;
      }
      for (const [slot, totalQty] of Object.entries(slotTotals)) {
        if (totalQty + stockQty <= 10) {
          newSlot = slot;
          break;
        }
      }
    }
    
    if (!newSlot) {
      let nextSlot = 1;
      while (usedSlotNums.has(nextSlot)) nextSlot++;
      newSlot = `Slot ${nextSlot}`;
    }    

      // ------------------- Insert or Merge Inventory -------------------
      // Prevent overfilling stackable items in a slot
      if (stackable) {
        const existingStack = await vendCollection.findOne({ itemName, slot: newSlot, stackable: true });
        if (existingStack) {
          const totalAfterAdd = existingStack.stockQty + stockQty;
          if (totalAfterAdd > 10) {
            return interaction.editReply(`⚠️ Cannot restock \`${itemName}\` into ${newSlot}. That slot already holds ${existingStack.stockQty}, and adding ${stockQty} would exceed the max of 10.`);
          }
        }
      }

      const existingMatch = await vendCollection.findOne({
        itemName,
        costEach: pointCost,
        tokenPrice,
        artPrice,
        otherPrice,
        tradesOpen,
        stackable
      });

    if (existingMatch) {
      await vendCollection.updateOne(
        { _id: existingMatch._id },
        {
          $inc: { stockQty: stockQty, pointsSpent: totalCost },
          $set: { date: new Date(), boughtFrom: character.currentVillage }
        }
      );
    } else {
      await vendCollection.insertOne({
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
        slot: newSlot,
        date: new Date()
      });
    }

    // ------------------- Update Google Sheet -------------------
    const monthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
    let rowMatched = false;

// ------------------- Insert or Merge Inventory -------------------
// Enforce stackable slot integrity: only one item per slot, max 10 qty
if (stackable && /^Slot \d+$/.test(newSlot)) {
  const slotContents = await vendCollection.find({ slot: newSlot, stackable: true }).toArray();
  
  if (slotContents.length > 0) {
    const existingItemName = slotContents[0].itemName;
    const currentQty = slotContents.reduce((sum, entry) => sum + entry.stockQty, 0);

    // Check: same item?
    if (existingItemName !== itemName) {
      return interaction.editReply(`⚠️ Cannot add \`${itemName}\` to ${newSlot}. That slot already contains \`${existingItemName}\`.`);
    }

    // Check: max 10 units?
    if (currentQty + stockQty > 10) {
      return interaction.editReply(`⚠️ Cannot add \`${stockQty}\` more to ${newSlot}. That slot already holds ${currentQty} \`${existingItemName}\`, and would exceed the 10 unit limit.`);
    }
  }
}

    if (!rowMatched) {
      const newRow = [[
        characterName,
        newSlot,
        itemName,
        stockQty,
        pointCost,
        totalCost,
        character.currentVillage,
        tokenPrice,
        artPrice,
        otherPrice,
        tradesOpen ? 'Yes' : 'No',
        monthLabel
      ]];
      await safeAppendDataToSheet(character.shopLink, character, 'vendingShop!A:L', newRow, interaction.client);
    }

    // ------------------- Update Points & Send Embed -------------------
    await Character.updateOne({ name: characterName }, {
      $set: { vendingPoints: vendingPoints - totalCost }
    });

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
    await vendingClient.close();
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
  
      // Use VendingModel to check shop inventory
      const VendingInventory = getVendingModel(targetShopName);
      const requestedItem = await VendingInventory.findOne({ 
        itemName: requestedItemName
      });
      
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
  
      // Add offered item to shop's vending inventory
      await VendingInventory.create({
        characterName: shopOwner.name,
        itemName: offeredItemName,
        stockQty: 1,
        tokenPrice: 0,
        artPrice: 0,
        otherPrice: 0,
        tradesOpen: true,
        date: new Date()
      });
  
      // ------------------- Save Fulfillment -------------------
      const fulfillmentId = uuidv4();
      const barterData = {
        fulfillmentId,
        userCharacterName: buyer.name,
        vendorCharacterName: shopOwner.name,
        itemName: requestedItem.itemName,
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
      const VendingInventory = getVendingModel(vendor.name);
      const stockItem = await VendingInventory.findOne({
        itemName: itemName
      });
  
      if (!stockItem || stockItem.stockQty < quantity) {
        return interaction.editReply(`⚠️ ${vendor.name} does not have enough stock of **${itemName}** to fulfill this request.`);
      }
  
      // ------------------- Transfer Item -------------------
      // Update vending inventory
      await VendingInventory.updateOne(
        { _id: stockItem._id },
        { $inc: { stockQty: -quantity } }
      );

      // Add to buyer's inventory
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
    console.log(`[handleViewShop]: Starting view shop for character: ${characterName}`);
    
    // Get character from database
    const character = await Character.findOne({ name: characterName });
    if (!character) {
      throw new Error(`Character ${characterName} not found`);
    }

    // Validate shop image URL
    if (!character.shopImage || !isValidGoogleSheetsUrl(character.shopImage)) {
      throw new Error(`Invalid or missing shop image URL for ${characterName}`);
    }

    // Get the vending model for this character
    const VendingInventory = await getVendingModel(characterName);
    console.log(`[handleViewShop]: Got vending model for ${characterName}`);

    // Get items from vending inventory
    const items = await VendingInventory.find({ characterName: character.name });
    console.log(`[handleViewShop]: Found ${items.length} items in vending inventory`);

    if (!items || items.length === 0) {
      return await interaction.reply({
        content: `⚠️ No items found in ${characterName}'s vending inventory.`,
        ephemeral: true
      });
    }

    // Create shop embed
    const shopEmbed = new EmbedBuilder()
      .setTitle(`${characterName}'s Shop`)
      .setDescription(`Welcome to ${characterName}'s shop!`)
      .setColor('#00FF00')
      .setImage(character.shopImage || VIEW_SHOP_IMAGE_URL)
      .setTimestamp();

    // Add items to embed
    items.forEach(item => {
      shopEmbed.addFields({
        name: `${item.itemName} (${item.stockQty} in stock)`,
        value: `Cost: ${item.costEach} points\nToken Price: ${item.tokenPrice}\nArt Price: ${item.artPrice}\nOther Price: ${item.otherPrice}\nTrades Open: ${item.tradesOpen ? 'Yes' : 'No'}`,
        inline: true
      });
    });

    // Send the embed
    await interaction.reply({
      embeds: [shopEmbed],
      ephemeral: true
    });

  } catch (error) {
    console.error(`[handleViewShop]: Error viewing shop:`, error);
    await interaction.reply({
      content: `❌ Error viewing shop: ${error.message}`,
      ephemeral: true
    });
  }
}
  
// ------------------- handleVendingSetup -------------------
async function handleVendingSetup(interaction) {
    try {
    await interaction.deferReply({ ephemeral: true });
    
      const characterName = interaction.options.getString('charactername');
      const shopLink = interaction.options.getString('shoplink');
      const pouch = interaction.options.getString('pouch');
      const points = interaction.options.getInteger('points') || 0;
      const userId = interaction.user.id;
  
    // Create a guide embed
    const guideEmbed = new EmbedBuilder()
      .setTitle('🎪 Setting Up Your Shop')
      .setDescription('Let\'s get your shop up and running! Follow these steps:')
      .addFields(
        { name: '1️⃣ Create Your Shop Sheet', value: 'Create a Google Sheet with these columns:\n`CHARACTER NAME | SLOT | ITEM NAME | STOCK QTY | COST EACH | POINTS SPENT | BOUGHT FROM | TOKEN PRICE | ART PRICE | OTHER PRICE | TRADES OPEN? | DATE`' },
        { name: '2️⃣ Share Your Sheet', value: 'Make sure your sheet is shared with "Anyone with the link can view" permissions.' },
        { name: '3️⃣ Choose Your Pouch', value: 'Select a pouch size:\n• Bronze: +15 slots\n• Silver: +30 slots\n• Gold: +50 slots' },
        { name: '4️⃣ Get Started', value: 'After setup, you can:\n• Add items with `/vending add`\n• Edit your shop with `/vending edit`\n• View your shop with `/vending view`' }
      )
      .setColor('#AA926A')
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');

    // Send the guide first
    await interaction.editReply({ embeds: [guideEmbed] });

    // Validate and process setup
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
      throw new Error(`Character '${characterName}' not found or doesn't belong to you.`);
    }

    // Validate job
      const job = character.job?.toLowerCase();
      if (job !== 'shopkeeper' && job !== 'merchant') {
      throw new Error(`${character.name} must be a Shopkeeper or Merchant to set up a shop.`);
    }

    // Validate shop link
    if (!isValidGoogleSheetsUrl(shopLink)) {
      throw new Error('Invalid Google Sheets link. Please provide a valid link.');
    }

    // Update character
    await updateCharacterById(character._id, {
      shopLink,
      vendingType: character.job,
      shopPouch: pouch,
      pouchSize: pouch === 'none' ? (character.job.toLowerCase() === 'merchant' ? 3 : 5) : 
                pouch === 'bronze' ? 15 : 
                pouch === 'silver' ? 30 : 50,
      vendingPoints: points,
      vendingSetup: true
    });

    // Create sync prompt buttons
    const syncRow = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`vending_sync_${characterName}`)
          .setLabel('Yes, sync now!')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔄'),
        new ButtonBuilder()
          .setCustomId('vending_sync_later')
          .setLabel('No, I\'ll do it later')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⏰')
      );

    // Send success message with sync prompt
    const successEmbed = new EmbedBuilder()
      .setTitle('✅ Shop Setup Complete!')
      .setDescription(`Your shop has been set up successfully!\n\nWould you like to sync your inventory now?`)
      .addFields(
        { name: '📊 Shop Link', value: shopLink },
        { name: '🎒 Pouch Size', value: `${pouch.charAt(0).toUpperCase() + pouch.slice(1)}` },
        { name: '🪙 Vending Points', value: `${points}` },
        { name: '💡 Tip', value: 'Syncing will import all items from your Google Sheet into your shop.' }
      )
      .setColor('#25C059');

    await interaction.followUp({
      embeds: [successEmbed],
      components: [syncRow],
        ephemeral: true
      });

    } catch (error) {
      handleError(error, 'vendingHandler.js');
    console.error('[handleVendingSetup]:', error);
    await interaction.editReply({
      content: `❌ Error setting up shop: ${error.message}`,
        ephemeral: true
      });
    }
  }
  
// ------------------- handleVendingSync -------------------
// Syncs inventory from Google Sheets to the vending database for a character.
async function handleVendingSync(interaction) {
  try {
    console.log(`[handleVendingSync]: Starting vending sync for character: ${characterName}`);
    
    // Get character from database
    const character = await Character.findOne({ name: characterName });
    if (!character) {
      throw new Error(`Character ${characterName} not found`);
    }

    // Validate shop image URL
    if (!character.shopImage || !isValidGoogleSheetsUrl(character.shopImage)) {
      throw new Error(`Invalid or missing shop image URL for ${characterName}`);
    }

    // Get the vending model for this character
    const VendingInventory = await getVendingModel(characterName);
    console.log(`[handleVendingSync]: Got vending model for ${characterName}`);

    // Parse the sheet data
    const parsedRows = await parseSheetData(character.shopImage);
    console.log(`[handleVendingSync]: Parsed ${parsedRows.length} rows from sheet`);

    // Clear existing vending inventory
    await VendingInventory.deleteMany({ characterName: character.name });
    console.log(`[handleVendingSync]: Cleared existing vending inventory for ${character.name}`);

    // Create new vending inventory entries
    const vendingEntries = parsedRows.map(row => ({
      characterName: character.name,
      itemName: row.itemName,
      itemId: row.itemId,
      stockQty: parseInt(row.stockQty) || 0,
      costEach: parseInt(row.costEach) || 0,
      pointsSpent: parseInt(row.pointsSpent) || 0,
      boughtFrom: row.boughtFrom || '',
      tokenPrice: parseInt(row.tokenPrice) || 0,
      artPrice: row.artPrice || 'N/A',
      otherPrice: row.otherPrice || 'N/A',
      tradesOpen: row.tradesOpen === 'true',
      slot: row.slot || '',
      date: new Date()
    }));

    // Insert the new entries
    await VendingInventory.insertMany(vendingEntries);
    console.log(`[handleVendingSync]: Created ${vendingEntries.length} vending inventory entries`);

    // Update character's vending sync status
    await Character.updateOne(
      { name: characterName },
      { $set: { vendingSync: true } }
    );

    // Try to edit the original interaction reply first
    try {
      await interaction.editReply({
        content: `✅ Successfully synced ${vendingEntries.length} items to ${characterName}'s vending inventory!`,
        embeds: [],
        components: []
      });
    } catch (error) {
      // If editing fails, try to send a follow-up message
      await interaction.followUp({
        content: `✅ Successfully synced ${vendingEntries.length} items to ${characterName}'s vending inventory!`,
        ephemeral: true
      });
    }

  } catch (error) {
    console.error(`[handleVendingSync]: Error syncing vending inventory:`, error);
    
    // Try to edit the original interaction reply first
    try {
      await interaction.editReply({
        content: `❌ Error syncing vending inventory: ${error.message}`,
        embeds: [],
        components: []
      });
    } catch (editError) {
      // If editing fails, try to send a follow-up message
      await interaction.followUp({
        content: `❌ Error syncing vending inventory: ${error.message}`,
        ephemeral: true
      });
    }
  }
}
  
// ------------------- handleEditShop -------------------
async function handleEditShop(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const characterName = interaction.options.getString('charactername');
    const action = interaction.options.getString('action');
    const userId = interaction.user.id;

    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      throw new Error(`Character '${characterName}' not found or doesn't belong to you.`);
    }

    switch (action) {
      case 'item': {
        const itemName = interaction.options.getString('itemname');
        if (!itemName) {
          throw new Error('Item name is required for item editing.');
        }

        const tokenPrice = interaction.options.getInteger('tokenprice');
        const artPrice = interaction.options.getString('artprice');
        const otherPrice = interaction.options.getString('otherprice');

        // Update item in vending inventory
        const VendingInventory = await getVendingModel(characterName);
        const updateFields = {};
        if (tokenPrice !== null) updateFields.tokenPrice = tokenPrice;
        if (artPrice) updateFields.artPrice = artPrice;
        if (otherPrice) updateFields.otherPrice = otherPrice;

        await VendingInventory.updateOne(
          { itemName },
          { $set: updateFields }
        );

        await interaction.editReply({
          content: `✅ Updated item "${itemName}" in your shop.`,
          ephemeral: true
        });
        break;
      }

      case 'banner': {
        const shopImageFile = interaction.options.getAttachment('shopimagefile');
        if (!shopImageFile) {
          throw new Error('Shop image file is required for banner update.');
        }

        const sanitizedName = characterName.replace(/\s+/g, '');
        const imageName = `${sanitizedName}_shop_image_${Date.now()}`;
        const imageUrl = await uploadSubmissionImage(shopImageFile.url, imageName);

        await Character.updateOne(
          { name: characterName },
          { $set: { shopImage: imageUrl } }
        );

        await interaction.editReply({
          content: `✅ Updated shop banner for ${characterName}.`,
          ephemeral: true
        });
        break;
      }

      case 'sync': {
        await handleVendingSync(interaction);
        break;
      }

      default:
        throw new Error('Invalid action selected.');
    }

  } catch (error) {
    handleError(error, 'vendingHandler.js');
    console.error('[handleEditShop]:', error);
    await interaction.editReply({
      content: `❌ Error editing shop: ${error.message}`,
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

// ------------------- handleSyncButton -------------------
async function handleSyncButton(interaction) {
  try {
    const [_, characterName] = interaction.customId.split('_');
    
    if (characterName === 'later') {
      await interaction.update({
        content: 'No problem! You can run `/vending setup` again when you\'re ready to sync your shop.',
        embeds: [],
        components: []
      });
      return;
    }

    await interaction.update({
      content: '🔄 Syncing your shop inventory...',
      embeds: [],
      components: []
    });

    await handleVendingSync(interaction);
  } catch (error) {
    handleError(error, 'vendingHandler.js');
    console.error('[handleSyncButton]:', error);
    await interaction.update({
      content: `❌ Error syncing shop: ${error.message}`,
      embeds: [],
      components: []
    });
  }
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
    handleVendingViewVillage,
    handleSyncButton
};
  