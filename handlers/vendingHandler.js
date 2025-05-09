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
  validateVendingSheet,
  parseSheetData
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
    return client.db("vendingInventories");
  } catch (error) {
    handleError(error, 'vendingHandler.js');
    throw error;
  }
}

// ------------------- Get Vending Collection -------------------
async function getVendingCollection(characterName) {
  const db = await connectToVendingDatabase();
  return db.collection(characterName.toLowerCase());
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
    if (!character.vendingSetup?.shopLink || !character.shopLink) {
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
    const stockQty = interaction.options.getInteger('quantity');
    const manualSlot = interaction.options.getString('slot');
    const tokenPrice = interaction.options.getInteger('tokenprice') || 'N/A';
    const artPrice = interaction.options.getString('artprice') || 'N/A';
    const otherPrice = interaction.options.getString('otherprice') || 'N/A';
    const tradesOpen = interaction.options.getBoolean('tradesopen') || false;
    const userId = interaction.user.id;

    // Validate stock quantity
    if (!stockQty || stockQty <= 0) {
      return interaction.editReply("❌ Please provide a valid stock quantity greater than 0.");
    }

    // ------------------- Character Validation -------------------
    const character = await fetchCharacterByName(characterName);
    if (!character || character.userId !== userId) {
      return interaction.editReply("❌ Character not found or doesn't belong to you.");
    }

    // ------------------- Shopkeeper Village Restrictions -------------------
    if (character.job?.toLowerCase() === 'shopkeeper') {
      // Block buying stock from other village town halls
      if (character.currentVillage.toLowerCase() !== character.homeVillage.toLowerCase()) {
        return interaction.editReply('❌ Shopkeepers can only buy stock from their home village town hall.');
      }
    }

    // ------------------- Slot Limits -------------------
    const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
    const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
    const baseSlots = baseSlotLimits[character.job?.toLowerCase()] || 0;
    const extraSlots = pouchCapacities[character.shopPouch?.toLowerCase()] || 0;
    const totalSlots = baseSlots + extraSlots;

    // If manual slot is provided, validate it
    if (manualSlot) {
      const slotNumber = parseInt(manualSlot.replace(/[^0-9]/g, ''));
      if (isNaN(slotNumber) || slotNumber < 1 || slotNumber > totalSlots) {
        return interaction.editReply(`❌ Invalid slot number. You have ${totalSlots} total slots available.`);
      }
    }

    // ------------------- DB Connections -------------------
    const vendCollection = await getVendingCollection(characterName);

    // ------------------- Stock Validation -------------------
    const stockList = await getCurrentVendingStockList();
    if (!stockList?.stockList) {
      return interaction.editReply("❌ Failed to fetch current vending stock list.");
    }

    const normalizedVillage = character.currentVillage.toLowerCase().trim();
    const villageStock = stockList.stockList[normalizedVillage] || [];
    const itemDoc = villageStock.find(item => 
      item.itemName.toLowerCase() === itemName.toLowerCase() && 
      item.vendingType.toLowerCase() === character.job.toLowerCase()
    );

    if (!itemDoc) {
      return interaction.editReply(`❌ Item "${itemName}" not found in ${character.currentVillage}'s stock for ${character.job}s.`);
    }

    // ------------------- Point Cost Calculation -------------------
    const pointCost = itemDoc.points;
    const totalCost = pointCost * stockQty;

    if (character.vendingPoints < totalCost) {
      return interaction.editReply(`❌ Not enough vending points. You need ${totalCost} points (${pointCost} per item × ${stockQty} items).`);
    }

    // ------------------- Slot Assignment -------------------
    let newSlot;
    if (manualSlot) {
      // Check if slot is already taken
      const existingItem = await vendCollection.findOne({ slot: manualSlot });
      if (existingItem) {
        return interaction.editReply(`❌ Slot ${manualSlot} is already occupied by ${existingItem.itemName}.`);
      }
      newSlot = manualSlot;
    } else {
      // Find first available slot
      const usedSlots = await vendCollection.distinct('slot');
      for (let i = 1; i <= totalSlots; i++) {
        const slotName = `Slot ${i}`;
        if (!usedSlots.includes(slotName)) {
          newSlot = slotName;
          break;
        }
      }
      if (!newSlot) {
        return interaction.editReply(`❌ No available slots. You have used all ${totalSlots} slots.`);
      }
    }

    // ------------------- Update Inventory -------------------
    const existingMatch = await vendCollection.findOne({
      itemName,
      costEach: pointCost,
      tokenPrice,
      artPrice,
      otherPrice,
      tradesOpen
    });

    if (existingMatch) {
      // If the existing match has a null stockQty, set it to the new quantity
      if (existingMatch.stockQty === null) {
        await vendCollection.updateOne(
          { _id: existingMatch._id },
          {
            $set: { 
              stockQty: stockQty,
              pointsSpent: totalCost,
              date: new Date(),
              boughtFrom: character.currentVillage,
              slot: newSlot
            }
          }
        );
      } else {
        // Otherwise increment the existing quantity
        await vendCollection.updateOne(
          { _id: existingMatch._id },
          {
            $inc: { stockQty: stockQty, pointsSpent: totalCost },
            $set: { 
              date: new Date(), 
              boughtFrom: character.currentVillage,
              slot: newSlot
            }
          }
        );
      }
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
        boughtFrom: character.currentVillage,
        slot: newSlot,
        date: new Date()
      });
    }

    // ------------------- Update Character Points -------------------
    await Character.updateOne(
      { _id: character._id },
      { $inc: { vendingPoints: -totalCost } }
    );

    // ------------------- Update Google Sheets -------------------
    const shopLink = character.shopLink || character.vendingSetup?.shopLink;
    if (shopLink) {
      try {
        const spreadsheetId = extractSpreadsheetId(shopLink);
        if (spreadsheetId) {
          const auth = await authorizeSheets();
          const rowData = [
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
            'Old Stock'
          ];
          await appendSheetData(auth, spreadsheetId, 'vendingShop!A:L', [rowData]);
        }
      } catch (sheetError) {
        console.error('[handleRestock]: Error updating Google Sheet:', sheetError);
        // Don't fail the whole operation if sheet update fails
      }
    }

    // ------------------- Success Response -------------------
    const successEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Item Added to Shop')
      .setDescription(`Successfully added ${stockQty}x ${itemName} to your shop in ${newSlot}.`)
      .addFields(
        { name: 'Points Spent', value: `${totalCost} points`, inline: true },
        { name: 'Remaining Points', value: `${character.vendingPoints - totalCost} points`, inline: true }
      );

    await interaction.editReply({ embeds: [successEmbed] });

  } catch (error) {
    console.error('[handleRestock]: Error:', error);
    await interaction.editReply('❌ An error occurred while adding items to your shop.');
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
      const pouchRequirements = {
        bronze: 'none',
        silver: 'bronze',
        gold: 'silver'
      };
  
      // Prevent downgrading or selecting same tier
      const currentTier = character.shopPouch || 'none';
      if (pouchCapacities[pouchType] <= pouchCapacities[currentTier]) {
        throw new Error(`You cannot downgrade or select the same pouch type.`);
      }
  
      // Check if user has the required previous pouch
      if (pouchRequirements[pouchType] && character.shopPouch !== pouchRequirements[pouchType]) {
        throw new Error(`You must have a ${pouchRequirements[pouchType]} pouch before upgrading to ${pouchType}.`);
      }
  
      // Check if user can afford it
      const userTokens = await getTokenBalance(userId);
      const cost = pouchCosts[pouchType];
      if (userTokens < cost) {
        throw new Error(`Upgrading to ${pouchType} costs ${cost} tokens, but you only have ${userTokens}.`);
      }
  
      // Perform upgrade and update data
      await updateTokenBalance(userId, -cost);
      
      // Update character's pouch and reset vending sync status
      await Character.updateOne(
        { _id: character._id },
        { 
          $set: { 
            shopPouch: pouchType.toLowerCase(),
            pouchSize: pouchCapacities[pouchType],
            vendingSync: false // Reset sync status since pouch size changed
          }
        }
      );
  
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
    const characterName = interaction.options.getString('charactername');
    const shopLink = interaction.options.getString('shoplink');
    const pouchType = interaction.options.getString('pouchtype');
    const points = interaction.options.getInteger('points') || 0;
    const shopImage = interaction.options.getString('shopimage');
    const userId = interaction.user.id;

    // Validate character exists and belongs to user
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
        return interaction.reply({
            content: `❌ Character "${characterName}" not found or doesn't belong to you.`,
            ephemeral: true
        });
    }

    // Check if character already has vending setup
    if (character.vendingSetup?.shopLink && character.vendingSync) {
        return interaction.reply({
            content: `❌ ${characterName} already has a vending shop set up and synced. Use \`/vending edit\` to modify your shop settings.`,
            ephemeral: true
        });
    }

    // Validate pouch type
    const validPouchTypes = ['none', 'bronze', 'silver', 'gold'];
    if (!validPouchTypes.includes(pouchType?.toLowerCase())) {
        return interaction.reply({
            content: '❌ Invalid pouch type. Please choose from: none, bronze, silver, or gold.',
            ephemeral: true
        });
    }

    // Validate shop link
    if (!shopLink) {
        return interaction.reply({
            content: '❌ Please provide a Google Sheets link for your shop.',
            ephemeral: true
        });
    }

    if (!isValidGoogleSheetsUrl(shopLink)) {
        return interaction.reply({
            content: '❌ Invalid Google Sheets URL. Please provide a valid Google Sheets link.',
            ephemeral: true
        });
    }

    // Validate the vending sheet
    const validation = await validateVendingSheet(shopLink, characterName);
    if (!validation.success) {
        return interaction.reply({
            content: validation.message,
            ephemeral: true
        });
    }

    // Set pouch size based on pouch type
    const pouchSizes = {
        none: 0,
        bronze: 15,
        silver: 30,
        gold: 50
    };

    // Set vendor type based on job
    const vendorType = character.job?.toLowerCase() === 'shopkeeper' ? 'shopkeeper' : 
                      character.job?.toLowerCase() === 'merchant' ? 'merchant' : null;

    if (!vendorType) {
        return interaction.reply({
            content: `❌ ${characterName} must be a Shopkeeper or Merchant to set up a vending shop.`,
            ephemeral: true
        });
    }

    // Update character's vending setup with all required fields
    const updateData = {
        vendingSetup: {
            shopLink,
            pouchType: pouchType.toLowerCase(),
            shopImage: shopImage || null,
            setupDate: new Date()
        },
        vendingPoints: points,
        shopLink, // Also update the legacy field for compatibility
        shopPouch: pouchType.toLowerCase(),
        pouchSize: pouchSizes[pouchType.toLowerCase()],
        vendorType: vendorType,
        vendingSync: false // Reset sync status since we're setting up new shop
    };

    try {
        await updateCharacterById(character._id, updateData);
        console.log(`[handleVendingSetup]: Successfully updated vending setup for ${characterName}`);
    } catch (error) {
        console.error('[handleVendingSetup]: Error updating character:', error);
        return interaction.reply({
            content: '❌ Failed to update character data. Please try again later.',
            ephemeral: true
        });
    }

    // Create success embed using the function from embeds.js
    const successEmbed = createVendingSetupInstructionsEmbed({
        name: characterName,
        shopLink,
        shopPouch: pouchType,
        vendingPoints: points
    });

    // Create sync button
    const syncButton = new ButtonBuilder()
        .setCustomId(`vending_sync_now_${characterName}`)
        .setLabel('Sync Shop Now')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔄');

    const laterButton = new ButtonBuilder()
        .setCustomId('vending_sync_later')
        .setLabel('Sync Later')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⏰');

    const row = new ActionRowBuilder()
        .addComponents(syncButton, laterButton);

    await interaction.reply({
        embeds: [successEmbed],
        components: [row]
    });
}
  
// ------------------- handleVendingSync -------------------
async function handleVendingSync(interaction, characterName) {
  try {
    console.log(`[handleVendingSync]: Starting vending sync for character: ${characterName}`);
    
    // Get character from database
    const character = await Character.findOne({ name: characterName });
    if (!character) {
      throw new Error(`Character ${characterName} not found`);
    }

    // Check both possible locations for the shop link
    const shopLink = character.shopLink || character.vendingSetup?.shopLink;
    if (!shopLink) {
      throw new Error('No shop link found for this character. Please set up your shop first using /vending setup');
    }

    // Get the vending model for this character
    const VendingInventory = await getVendingModel(characterName);
    console.log(`[handleVendingSync]: Got vending model for ${characterName}`);

    // Parse the sheet data
    const parsedRows = await parseSheetData(shopLink);
    console.log(`[handleVendingSync]: Parsed ${parsedRows.length} rows from sheet`);

    // Validate all items before proceeding
    const errors = [];
    let totalSlotsUsed = 0;

    // First pass: validate all items and collect errors
    for (const row of parsedRows) {
      // Fetch the item from the database to get its ID and stackable status
      const item = await ItemModel.findOne({ itemName: row.itemName });
      if (!item) {
        errors.push({
          type: 'missing_item',
          itemName: row.itemName,
          slot: row.slot || 'Unknown Slot'
        });
        continue;
      }

      // Always use stackable and maxStackSize from ItemModel
      const isStackable = item.stackable;
      const maxStackSize = item.maxStackSize || 10;
      let stockQty = Number(row.stockQty) || 0;
      let slotsNeeded = 1;

      if (isStackable) {
        if (stockQty > maxStackSize) {
          errors.push({
            type: 'stack_size',
            itemName: row.itemName,
            quantity: stockQty,
            maxSize: maxStackSize,
            slot: row.slot || 'Unknown Slot'
          });
        }
        slotsNeeded = Math.ceil(stockQty / maxStackSize);
      } else {
        // For non-stackable items, quantity must be 1
        if (stockQty > 1) {
          errors.push({
            type: 'non_stackable',
            itemName: row.itemName,
            quantity: stockQty,
            slot: row.slot || 'Unknown Slot'
          });
        }
        slotsNeeded = stockQty;
      }

      // Check if we have enough slots available
      if (totalSlotsUsed + slotsNeeded > character.pouchSize) {
        errors.push({
          type: 'slot_capacity',
          itemName: row.itemName,
          needed: slotsNeeded,
          remaining: character.pouchSize - totalSlotsUsed,
          slot: row.slot || 'Unknown Slot'
        });
      }

      totalSlotsUsed += slotsNeeded;
    }

    // If there are any errors, return them and don't proceed with sync
    if (errors.length > 0) {
      let errorMessage = `❌ **Sync Failed:** Please fix the following issues in your sheet and try again:\n\n`;
      errorMessage += errors.map(err => {
        switch (err.type) {
          case 'stack_size':
            return `• **${err.slot}:** "${err.itemName}" has ${err.quantity} items, but maximum stack size is ${err.maxSize}. Please reduce the quantity to ${err.maxSize} or less.`;
          case 'non_stackable':
            return `• **${err.slot}:** "${err.itemName}" is a non-stackable item and can only have 1 per slot. Please reduce the quantity to 1.`;
          case 'slot_capacity':
            return `• **${err.slot}:** "${err.itemName}" needs ${err.needed} slots, but you only have ${err.remaining} slots remaining. Please reduce quantities or remove some items.`;
          case 'missing_item':
            return `• **${err.slot}:** Item "${err.itemName}" not found in database. Please check the item name.`;
          default:
            return `• ${err.message || 'Unknown error'}`;
        }
      }).join('\n\n');
      
      errorMessage += '\n\n**Instructions:**\n1. Open your shop sheet\n2. Fix the quantities to match the requirements above\n3. Save your changes\n4. Try syncing again';
      
      return interaction.editReply({
        content: errorMessage,
        embeds: [],
        components: []
      });
    }

    // Clear existing vending inventory
    await VendingInventory.deleteMany({ characterName: character.name });
    console.log(`[handleVendingSync]: Cleared existing vending inventory for ${character.name}`);

    // Create new vending inventory entries
    const vendingEntries = [];

    for (const row of parsedRows) {
      const item = await ItemModel.findOne({ itemName: row.itemName });
      const isStackable = item.stackable;
      const maxStackSize = item.maxStackSize || 10;
      let stockQty = Number(row.stockQty) || 0;
      let slotsNeeded = 1;

      if (isStackable) {
        slotsNeeded = Math.ceil(stockQty / maxStackSize);
      } else {
        slotsNeeded = stockQty;
      }

      vendingEntries.push({
        characterName: character.name,
        itemName: row.itemName,
        itemId: item._id,
        stockQty: stockQty,
        costEach: Number(row.costEach) || 0,
        pointsSpent: Number(row.pointsSpent) || 0,
        boughtFrom: row.boughtFrom || character.currentVillage,
        tokenPrice: row.tokenPrice === 'N/A' ? null : Number(row.tokenPrice) || null,
        artPrice: row.artPrice === 'N/A' ? null : Number(row.artPrice) || null,
        otherPrice: row.otherPrice === 'N/A' ? null : Number(row.otherPrice) || null,
        tradesOpen: row.tradesOpen === 'Yes' || row.tradesOpen === true,
        slot: row.slot || 'Slot 1',
        date: new Date(),
        stackable: isStackable,
        maxStackSize: maxStackSize,
        slotsUsed: slotsNeeded
      });
    }

    // Insert the new entries
    if (vendingEntries.length > 0) {
      await VendingInventory.insertMany(vendingEntries);
      console.log(`[handleVendingSync]: Created ${vendingEntries.length} vending inventory entries`);
    }

    // Update character's vending sync status
    await Character.updateOne(
      { name: characterName },
      { $set: { vendingSync: true } }
    );

    // Create success message
    const successMessage = `✅ Successfully synced ${vendingEntries.length} items to ${characterName}'s vending inventory!\n📦 Total slots used: ${totalSlotsUsed}/${character.pouchSize}`;

    // Try to edit the original interaction reply first
    try {
      await interaction.editReply({
        content: successMessage,
        embeds: [],
        components: []
      });
    } catch (error) {
      // If editing fails, try to send a follow-up message
      await interaction.followUp({
        content: successMessage,
        ephemeral: true
      });
    }

  } catch (error) {
    handleError(error, 'vendingHandler.js');
    console.error(`[handleVendingSync]: Error syncing vending inventory: ${error.message}`);
    await interaction.editReply(`❌ Failed to sync vending inventory: ${error.message}`);
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
        await handleVendingSync(interaction, characterName);
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
    const [_, action, ...nameParts] = interaction.customId.split('_');
    
    if (action === 'sync' && nameParts[0] === 'later') {
      await interaction.update({
        content: '🔄 Syncing cancelled. Please use `/vending setup` again when you are ready to sync and set up your vending character.',
        embeds: [],
        components: []
      });
      return;
    }

    // Extract character name correctly by removing 'now_' prefix if present
    const characterName = nameParts[0] === 'now' ? nameParts.slice(1).join('_') : nameParts.join('_');
    
    await interaction.update({
      content: '🔄 Syncing your shop inventory...',
      embeds: [],
      components: []
    });

    await handleVendingSync(interaction, characterName);
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