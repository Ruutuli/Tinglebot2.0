// ============================================================================
// ------------------- Vending Handler Blueprint -------------------
// Handles all /vending subcommands for barter, restock, fulfill, etc.
// ============================================================================

// ------------------- Standard Libraries -------------------
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require("mongodb");
const mongoose = require('mongoose');
const VENDING_DB_URI = process.env.MONGODB_INVENTORIES_URI;
const { generateUniqueId } = require('../utils/uniqueIdUtils');

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
const User = require('../models/UserModel.js');

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
  fetchItemByName,
  addItemToInventory
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
  addItemToVendingInventory
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
    
    // First check if character exists
    let character;
    try {
      character = await fetchCharacterByName(characterName);
    } catch (error) {
      if (error.message === "Character not found") {
        return interaction.reply({
          content: `❌ **Character Not Found**\n\nCould not find a character named "${characterName}". Please check:\n• The spelling of your character's name\n• That the character exists in the system\n• That you're using the correct character name\n\nIf you're sure the name is correct, try:\n1. Running \`/vending setup\` to register your character\n2. Contacting a moderator if the issue persists`
        });
      }
      throw error; // Re-throw other errors
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // ------------------- Claim Check -------------------
    const alreadyClaimed = character.lastCollectedMonth === currentMonth;

    if (alreadyClaimed) {
      return interaction.reply({
        content: `⚠️ **Already Claimed**\n\n${characterName} has already claimed vending points for this month.\n\nNext claim available: **${new Date(now.getFullYear(), now.getMonth() + 1, 1).toLocaleDateString()}**`
      });
    }

    // ------------------- Job Validation -------------------
    const job = character.job?.toLowerCase();
    if (job !== 'shopkeeper' && job !== 'merchant') {
      return interaction.reply({
        content: `❌ **Invalid Vendor Type**\n\n${character.name} must be a **Shopkeeper** or **Merchant** to collect vending points.\n\nCurrent job: **${character.job || 'None'}**\n\nTo become a vendor:\n1. Use a Job Voucher to change to Shopkeeper or Merchant\n2. Run \`/vending setup\` to initialize your shop\n3. Run \`/vending sync\` to sync your inventory`
      });
    }

    // ------------------- Setup Validation -------------------
    if (!character.vendingSetup?.shopLink || !character.shopLink) {
        return interaction.reply({
            content: `❌ **Setup Required**\n\nYou must complete vending setup before collecting points.\n\nPlease run \`/vending setup\` to:\n1. Initialize your shop\n2. Set up your vending sheet\n3. Configure your shop settings`
        });
    }

    if (!character.vendingSync) {
      return interaction.reply({
        content: `❌ **Sync Required**\n\nYou must sync your vending sheet before collecting points.\n\nPlease run \`/vending sync\` to:\n1. Connect your shop sheet\n2. Update your inventory\n3. Enable point collection`
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

    return interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('[handleCollectPoints]: Error', error);
    return interaction.reply({
      content: `❌ **System Error**\n\nAn unexpected error occurred while processing your request.\n\nPlease try again in a few minutes. If the problem persists, contact a moderator with the following details:\n• Command: \`/vending collect_points\`\n• Character: ${interaction.options.getString('charactername')}\n• Time: ${new Date().toLocaleString()}`
    });
  }
}

// ------------------- handleRestock -------------------
// Allows Shopkeepers/Merchants to restock items from monthly vending stock.
async function handleRestock(interaction) {
  try {
    await interaction.deferReply();

    // ------------------- Input Parsing -------------------
    const characterName = interaction.options.getString('charactername');
    const itemName = interaction.options.getString('itemname');
    const stockQty = interaction.options.getInteger('quantity');
    const manualSlot = interaction.options.getString('slot');
    const tokenPrice = interaction.options.getInteger('tokenprice') || 'N/A';
    const artPrice = interaction.options.getString('artprice') || 'N/A';
    const otherPrice = interaction.options.getString('otherprice') || 'N/A';
    const barterOpen = interaction.options.getBoolean('barteropen') || false;
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
      // Check if slot is already taken by a different item
      const existingItem = await vendCollection.findOne({ 
        slot: manualSlot,
        itemName: { $ne: itemName } // Only check for different items
      });
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

    // ------------------- Stack Size Validation -------------------
    const existingItem = await vendCollection.findOne({
      itemName,
      slot: newSlot
    });

    // Get item details to check stackable status
    const itemDetails = await ItemModel.findOne({ itemName });
    if (!itemDetails) {
      return interaction.editReply(`❌ Could not find item details for ${itemName}.`);
    }

    const maxStackSize = itemDetails.maxStackSize || 10;
    const isStackable = itemDetails.stackable;

    if (!isStackable && stockQty > 1) {
      return interaction.editReply(`❌ ${itemName} is not stackable. You can only add 1 at a time.`);
    }

    if (existingItem) {
      const newTotal = existingItem.stockQty + stockQty;
      if (newTotal > maxStackSize) {
        return interaction.editReply(
          `❌ Cannot add ${stockQty} more ${itemName}. This would exceed the maximum stack size of ${maxStackSize}. ` +
          `Current stack: ${existingItem.stockQty}, Maximum allowed: ${maxStackSize}`
        );
      }
    } else if (stockQty > maxStackSize) {
      return interaction.editReply(
        `❌ Cannot add ${stockQty} ${itemName}. Maximum stack size is ${maxStackSize}.`
      );
    }

    // ------------------- Update Inventory -------------------
    if (existingItem) {
      // Update existing item
      await vendCollection.updateOne(
        { _id: existingItem._id },
        {
          $inc: { stockQty: stockQty, pointsSpent: totalCost },
          $set: { 
            date: new Date(), 
            boughtFrom: character.currentVillage
          }
        }
      );

      // Check if stock reached zero and delete if needed
      const updatedItem = await vendCollection.findOne({ _id: existingItem._id });
      if (updatedItem.stockQty <= 0) {
        await vendCollection.deleteOne({ _id: existingItem._id });
      }
    } else {
      // Insert new item
      await vendCollection.insertOne({
        itemName,
        stockQty,
        costEach: pointCost,
        pointsSpent: totalCost,
        tokenPrice,
        artPrice,
        otherPrice,
        barterOpen,
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
          const currentDate = new Date().toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
          });
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
            barterOpen ? 'Yes' : 'No',
            currentDate
          ];
          // Always append a new row for every transaction
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

// ------------------- handleVendingBarter -------------------
async function handleVendingBarter(interaction) {
    try {
      await interaction.deferReply();
  
      const buyerId = interaction.user.id;
      const buyerName = interaction.user.username;
      const targetShopName = interaction.options.getString("vendorcharacter");
      const requestedItemName = interaction.options.getString("itemname");
      const quantity = interaction.options.getInteger("quantity");
      const paymentType = interaction.options.getString("payment_type");
      const offeredItemName = interaction.options.getString("offer");
      const notes = interaction.options.getString("notes");
  
      // ------------------- Validate Inputs -------------------
      if (!targetShopName || !requestedItemName || !quantity || !paymentType) {
        return interaction.editReply("⚠️ Please provide all required options: `vendorcharacter`, `itemname`, `quantity`, and `payment_type`.");
      }

      // Validate offer for barter payment type
      if (paymentType === 'barter' && !offeredItemName) {
        return interaction.editReply("⚠️ Please provide an item to offer when using barter payment type.");
      }
  
      const buyer = await fetchCharacterByNameAndUserId(interaction.options.getString('charactername'), buyerId);
      if (!buyer) {
        return interaction.editReply("⚠️ Your character could not be found. Please create one first.");
      }
  
      const shopOwner = await fetchCharacterByName(targetShopName);
      if (!shopOwner || !shopOwner.vendingSetup?.shopLink) {
        return interaction.editReply(`⚠️ No vending shop found under the name **${targetShopName}**.`);
      }

      // ------------------- Token Tracker Sync Validation -------------------
      const buyerUser = await User.findOne({ discordId: buyerId });
      const vendorUser = await User.findOne({ discordId: shopOwner.userId });

      if (!buyerUser || !vendorUser) {
        return interaction.editReply("❌ Could not find user data for either buyer or vendor.");
      }

      // Get vendor's Discord username
      const vendorDiscordUser = await interaction.client.users.fetch(shopOwner.userId);
      const vendorUsername = vendorDiscordUser?.username || 'Unknown User';

      if (!buyerUser.tokensSynced || !vendorUser.tokensSynced) {
        const unsyncedUsers = [];
        if (!buyerUser.tokensSynced) unsyncedUsers.push(buyerName);
        if (!vendorUser.tokensSynced) unsyncedUsers.push(vendorUsername);
        
        return interaction.editReply(
          `❌ Cannot proceed with barter. Token trackers need to be synced for:\n` +
          unsyncedUsers.map(name => `• ${name}`).join('\n') + '\n\n' +
          `Please use \`/token sync\` to sync your token tracker first.`
        );
      }
  
      // Use VendingModel to check shop inventory
      const VendingInventory = await getVendingModel(targetShopName);
      
      // Find all items with the requested name
      const allItems = await VendingInventory.find({ itemName: requestedItemName });

      // Find the first item that has a valid price for the selected payment type
      let requestedItem;
      switch (paymentType) {
        case 'tokens':
          requestedItem = allItems.find(item => 
            item.tokenPrice && 
            item.tokenPrice !== 'N/A' && 
            item.tokenPrice !== '' && 
            item.tokenPrice !== null
          );
          if (!requestedItem) {
            return interaction.editReply(`⚠️ The item **${requestedItemName}** is not available for token purchase in ${targetShopName}'s shop.`);
          }
          break;
        case 'art':
          requestedItem = allItems.find(item => 
            item.artPrice && 
            item.artPrice !== 'N/A' && 
            item.artPrice !== '' && 
            item.artPrice !== null
          );
          if (!requestedItem) {
            return interaction.editReply(`⚠️ The item **${requestedItemName}** is not available for art purchase in ${targetShopName}'s shop.`);
          }
          break;
        case 'barter':
          requestedItem = allItems.find(item => 
            item.barterOpen === true
          );
          if (!requestedItem) {
            return interaction.editReply(`⚠️ The item **${requestedItemName}** is not available for barter in ${targetShopName}'s shop.`);
          }
          break;
      }

      if (!requestedItem) {
        return interaction.editReply(`⚠️ The item **${requestedItemName}** is not available in ${targetShopName}'s shop.`);
      }

      if (requestedItem.stockQty < quantity) {
        return interaction.editReply(`⚠️ ${targetShopName} only has ${requestedItem.stockQty} ${requestedItemName} in stock.`);
      }
  
      // ------------------- Payment Type Specific Validation -------------------
      switch (paymentType) {
        case 'tokens':
          if (!requestedItem.tokenPrice) {
            return interaction.editReply(`⚠️ ${requestedItemName} is not available for token purchase.`);
          }
          const totalCost = requestedItem.tokenPrice * quantity;
          const userTokens = await getTokenBalance(buyerId);
          if (userTokens < totalCost) {
            return interaction.editReply(`⚠️ You don't have enough tokens. Required: ${totalCost}, Your balance: ${userTokens}`);
          }
          break;

        case 'art':
          if (!requestedItem.artPrice || requestedItem.artPrice === 'N/A' || requestedItem.artPrice === '') {
            return interaction.editReply(`⚠️ ${requestedItemName} is not available for art purchase.`);
          }
          break;

        case 'barter':
          if (!requestedItem.barterOpen) {
            return interaction.editReply(`⚠️ ${targetShopName} is not accepting barters for ${requestedItemName}.`);
          }
          // Check if buyer has the offered item
          const buyerInventory = await connectToInventories(buyer);
          const offeredItem = buyerInventory.inventory.find(item => 
            item.name.toLowerCase() === offeredItemName.toLowerCase()
          );
          if (!offeredItem || offeredItem.quantity < 1) {
            return interaction.reply(`⚠️ You don't have **${offeredItemName}** in your inventory.`);
          }
          break;
      }
  
      // ------------------- Create Barter Request -------------------
      const fulfillmentId = generateUniqueId('V');
      const barterData = {
        fulfillmentId,
        userCharacterName: buyer.name,
        vendorCharacterName: shopOwner.name,
        itemName: requestedItem.itemName,
        quantity: quantity,
        paymentMethod: paymentType,
        offeredItem: paymentType === 'barter' ? offeredItemName : null,
        notes: notes || '',
        buyerId,
        buyerUsername: buyerName,
        date: new Date()
      };
  
      // Save to both MongoDB model and temporary storage
      const fulfillment = new VendingRequest(barterData);
      await fulfillment.save();
      
      // Also save to temporary storage for backward compatibility
      await saveVendingRequestToStorage(fulfillmentId, barterData);
  
      // ------------------- Confirmation Embed -------------------
      const embed = new EmbedBuilder()
        .setTitle(`🔄 Barter Request Created`)
        .setDescription(`**${buyer.name}** has requested to barter with **${shopOwner.name}**.`)
        .addFields(
          { name: '📦 Requested Item', value: `\`${requestedItemName} x${quantity}\``, inline: true },
          { name: '💱 Payment Method', value: paymentType.charAt(0).toUpperCase() + paymentType.slice(1), inline: true }
        );

      if (paymentType === 'barter') {
        embed.addFields({ name: '🔄 Offered Item', value: `\`${offeredItemName}\``, inline: true });
      }
      if (notes) {
        embed.addFields({ name: '📝 Notes', value: notes, inline: false });
      }
      
      embed.addFields({ name: '🪪 Fulfillment ID', value: fulfillmentId, inline: false })
        .setFooter({ text: `Buyer: ${buyerName}` })
        .setColor('#3498db')
        .setTimestamp();
  
      await interaction.editReply({ embeds: [embed] });
  
    } catch (error) {
      console.error("[handleVendingBarter]:", error);
      await interaction.editReply({
        content: "❌ An error occurred while processing the barter request. Please try again later."
      });
    }
}
  
// ------------------- handleFulfill -------------------
async function handleFulfill(interaction) {
    try {
      await interaction.deferReply();
  
      const fulfillmentId = interaction.options.getString("fulfillmentid");
      if (!fulfillmentId) {
        return interaction.editReply("⚠️ Please provide a valid `fulfillmentid`.");
      }
  
      // ------------------- Fetch Barter Request -------------------
      const request = await VendingRequest.findOne({ fulfillmentId });
      if (!request) {
        // Try to get from temporary storage as fallback
        const tempRequest = await retrieveVendingRequestFromStorage(fulfillmentId);
        if (!tempRequest) {
          return interaction.editReply(`⚠️ No pending barter request found with ID **${fulfillmentId}**.`);
        }
        // Convert temp request to match MongoDB format
        request = {
          userCharacterName: tempRequest.userCharacterName,
          vendorCharacterName: tempRequest.vendorCharacterName,
          itemName: tempRequest.itemName,
          quantity: tempRequest.quantity,
          paymentMethod: tempRequest.paymentMethod,
          offeredItem: tempRequest.offeredItem,
          notes: tempRequest.notes,
          buyerId: tempRequest.buyerId,
          buyerUsername: tempRequest.buyerUsername
        };
      }
  
      const {
        userCharacterName,
        vendorCharacterName,
        itemName,
        quantity,
        paymentMethod,
        offeredItem,
        notes,
        buyerId,
        buyerUsername
      } = request;
  
      // ------------------- Fetch Characters -------------------
      const buyer = await fetchCharacterByName(userCharacterName);
      const vendor = await fetchCharacterByName(vendorCharacterName);
  
      if (!buyer || !vendor) {
        return interaction.editReply("❌ Buyer or vendor character could not be found.");
      }
  
      // ------------------- Validate Vendor Inventory -------------------
      const VendingInventory = await getVendingModel(vendor.name);
      const stockItem = await VendingInventory.findOne({
        itemName: itemName
      });
  
      if (!stockItem || stockItem.stockQty < quantity) {
        return interaction.editReply(`⚠️ ${vendor.name} does not have enough stock of **${itemName}** to fulfill this request.`);
      }

      // ------------------- Update Google Sheets -------------------
      // Update vendor's vendingShop sheet
      const vendorShopLink = vendor.shopLink || vendor.vendingSetup?.shopLink;
      if (vendorShopLink) {
        try {
          const spreadsheetId = extractSpreadsheetId(vendorShopLink);
          const auth = await authorizeSheets();
          
          // Read current sheet data
          const sheetData = await readSheetData(auth, spreadsheetId, 'vendingShop!A2:L');
          
          // Find the row with the item
          const itemRowIndex = sheetData.findIndex(row => row[2] === itemName);
          if (itemRowIndex !== -1) {
            const row = itemRowIndex + 2; // +2 because sheet data starts at A2
            const existingRow = sheetData[itemRowIndex];
            
            // Calculate new stock quantity
            const newStockQty = Number(existingRow[3]) - quantity;
            
            // Update the row in the sheet
            const updateData = [
              existingRow[0], // Character Name
              existingRow[1], // Slot
              existingRow[2], // Item Name
              newStockQty, // Updated Stock Qty
              existingRow[4], // Cost Each
              existingRow[5], // Points Spent
              existingRow[6], // Bought From
              existingRow[7], // Token Price
              existingRow[8], // Art Price
              existingRow[9], // Other Price
              existingRow[10], // Trades Open
              new Date().toLocaleDateString('en-US') // Current Date in column L
            ];
            
            await writeSheetData(auth, spreadsheetId, `vendingShop!A${row}:L${row}`, [updateData]);

            // Add transaction log to vendor's vendingShop sheet with negative quantity
            const transactionRow = [
              [
                vendor.name, // Vendor
                userCharacterName, // Buyer
                itemName, // Item
                -quantity, // Negative Quantity for sales
                paymentMethod, // Payment Method
                offeredItem || 'N/A', // Offered Item
                notes || 'N/A', // Notes
                new Date().toLocaleDateString('en-US') // Date in column L
              ]
            ];
            await appendSheetData(auth, spreadsheetId, 'vendingShop!A:L', transactionRow);
          }
        } catch (sheetError) {
          console.error('[handleFulfill]: Error updating vendor sheet:', sheetError.message);
        }
      }

      // Update buyer's inventory sheet
      const buyerInventoryLink = buyer.inventory;
      if (buyerInventoryLink) {
        try {
          const spreadsheetId = extractSpreadsheetId(buyerInventoryLink);
          const auth = await authorizeSheets();
          const range = 'loggedInventory!A2:M';
          const uniqueSyncId = uuidv4();
          const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
          const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
          
          // Get item details for proper categorization
          const itemDetails = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${itemName}$`, 'i') } });
          
          // Add purchase to buyer's inventory sheet
          const purchaseRow = [
            [
              buyer.name, // Character Name
              itemName, // Item Name
              quantity.toString(), // Quantity
              itemDetails?.category?.join(', ') || 'Unknown', // Category
              itemDetails?.type?.join(', ') || 'Unknown', // Type
              itemDetails?.subtype?.join(', ') || '', // Subtype
              'Bought', // Obtain
              buyer.job || '', // Job
              '', // Perk
              vendor.name, // Location (Vendor)
              interactionUrl, // Link
              formattedDateTime, // Date/Time
              uniqueSyncId // Confirmed Sync
            ]
          ];
          
          if (buyer?.name && buyer?.inventory && buyer?.userId) {
            await safeAppendDataToSheet(buyer.inventory, buyer, range, purchaseRow, undefined, { skipValidation: true });
          } else {
            console.error('[handleFulfill]: Invalid buyer object:', {
              buyer: buyer.name,
              hasInventory: Boolean(buyer.inventory)
            });
          }
        } catch (sheetError) {
          console.error('[handleFulfill]: Error updating buyer sheet:', sheetError.message);
        }
      } else {
        console.error('[handleFulfill]: No inventory link for buyer:', buyer.name);
      }
  
      // ------------------- Transfer Item -------------------
      // Update vending inventory
      await VendingInventory.updateOne(
        { _id: stockItem._id },
        { $inc: { stockQty: -quantity } }
      );

      // Add check for zero stock and delete if needed
      const updatedItem = await VendingInventory.findOne({ _id: stockItem._id });
      if (updatedItem.stockQty <= 0) {
        await VendingInventory.deleteOne({ _id: stockItem._id });
      }

      // Add to buyer's inventory
      const buyerInventory = await getInventoryCollection(buyer.name);
      // Fetch item details for full inventory record
      const itemDetails = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${itemName}$`, 'i') } });
      if (itemDetails) {
        await buyerInventory.insertOne({
          characterId: buyer._id,
          itemName: itemDetails.itemName,
          itemId: itemDetails._id,
          quantity: quantity,
          category: Array.isArray(itemDetails.category) ? itemDetails.category.join(', ') : itemDetails.category,
          type: Array.isArray(itemDetails.type) ? itemDetails.type.join(', ') : itemDetails.type,
          subtype: Array.isArray(itemDetails.subtype) ? itemDetails.subtype.join(', ') : itemDetails.subtype,
          location: buyer.currentVillage || 'Unknown',
          date: new Date(),
          obtain: 'Bought',
        });
      } else {
        // fallback: insert minimal record if item details not found
        await buyerInventory.insertOne({
          characterId: buyer._id,
          itemName: itemName,
          quantity: quantity,
          date: new Date(),
          obtain: 'Bought',
        });
      }

      // If this was a barter, remove the offered item from buyer's inventory
      if (paymentMethod === 'barter' && offeredItem) {
        await buyerInventory.updateOne(
          { 'inventory.name': offeredItem },
          { $inc: { 'inventory.$.quantity': -1 } }
        );
      }
  
      // ------------------- Delete Fulfillment Request -------------------
      // Delete from both MongoDB and temporary storage
      await VendingRequest.deleteOne({ fulfillmentId });
      await deleteVendingRequestFromStorage(fulfillmentId);
      
      // ------------------- Confirmation Embed -------------------
      const embed = new EmbedBuilder()
        .setTitle(`✅ Barter Fulfilled`)
        .setDescription(`**${vendor.name}** has fulfilled a barter request for **${buyer.name}**.`)
        .addFields(
          { name: '📦 Item', value: `\`${itemName} x${quantity}\``, inline: true },
          { name: '👤 Buyer', value: buyer.name, inline: true },
          { name: '🧾 Vendor', value: vendor.name, inline: true },
          { name: '💱 Payment', value: paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1), inline: true }
        );

      if (paymentMethod === 'barter' && offeredItem) {
        embed.addFields({ name: '🔄 Offered', value: offeredItem, inline: true });
      }

      if (notes) {
        embed.addFields({ name: '📝 Notes', value: notes, inline: false });
      }

      embed.addFields({ name: '🔐 Fulfillment ID', value: fulfillmentId, inline: false })
        .setColor(0x00cc99)
        .setTimestamp();
  
      await interaction.editReply({ embeds: [embed] });
  
    } catch (error) {
      console.error("[handleFulfill]:", error);
      await interaction.editReply({
        content: "❌ An error occurred while fulfilling the barter. Please try again later."
      });
    }
}
  
// ------------------- handlePouchUpgrade -------------------
async function handlePouchUpgrade(interaction) {
  try {
    await interaction.deferReply();

    const characterName = interaction.options.getString('charactername');
    const newPouchType = interaction.options.getString('pouchtype');
    const userId = interaction.user.id;

    // ------------------- Character Validation -------------------
    const character = await fetchCharacterByName(characterName);
    if (!character || character.userId !== userId) {
      return interaction.editReply("❌ Character not found or doesn't belong to you.");
    }

    // ------------------- Job Validation -------------------
    if (character.job?.toLowerCase() !== 'shopkeeper' && character.job?.toLowerCase() !== 'merchant') {
      return interaction.editReply("❌ Only Shopkeepers and Merchants can upgrade their shop pouches.");
    }

    // ------------------- Pouch Upgrade Validation -------------------
    const pouchTiers = {
      none: { slots: 0, cost: 0 },
      bronze: { slots: 15, cost: 1000 },
      silver: { slots: 30, cost: 5000 },
      gold: { slots: 50, cost: 10000 }
    };

    const currentPouch = character.shopPouch?.toLowerCase() || 'none';
    const currentTier = Object.keys(pouchTiers).indexOf(currentPouch);
    const newTier = Object.keys(pouchTiers).indexOf(newPouchType);

    // Check if trying to downgrade or select same tier
    if (newTier <= currentTier) {
      return interaction.editReply(
        `❌ Cannot downgrade or select the same pouch tier.\n` +
        `Current tier: ${currentPouch.toUpperCase()}\n` +
        `Selected tier: ${newPouchType.toUpperCase()}`
      );
    }

    // Check if skipping tiers
    if (newTier - currentTier > 1) {
      const requiredTier = Object.keys(pouchTiers)[currentTier + 1];
      return interaction.editReply(
        `❌ You must upgrade to ${requiredTier.toUpperCase()} first before upgrading to ${newPouchType.toUpperCase()}.`
      );
    }

    // ------------------- Token Balance Check -------------------
    const userTokens = await getTokenBalance(userId);
    const upgradeCost = pouchTiers[newPouchType].cost;

    if (userTokens < upgradeCost) {
      return interaction.editReply(
        `❌ Not enough tokens for this upgrade.\n` +
        `Required: ${upgradeCost} tokens\n` +
        `Your balance: ${userTokens} tokens`
      );
    }

    // ------------------- Confirm Upgrade -------------------
    const confirmButton = new ButtonBuilder()
      .setCustomId(`confirm_pouch_upgrade_${characterName}_${newPouchType}`)
      .setLabel('Confirm Upgrade')
      .setStyle(ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
      .setCustomId('cancel_pouch_upgrade')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder()
      .addComponents(confirmButton, cancelButton);

    const confirmEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🛍️ Confirm Pouch Upgrade')
      .setDescription(`Are you sure you want to upgrade ${characterName}'s shop pouch?`)
      .addFields(
        { name: 'Current Pouch', value: `${currentPouch.toUpperCase()} (${pouchTiers[currentPouch].slots} slots)`, inline: true },
        { name: 'New Pouch', value: `${newPouchType.toUpperCase()} (${pouchTiers[newPouchType].slots} slots)`, inline: true },
        { name: 'Upgrade Cost', value: `${upgradeCost} tokens`, inline: true },
        { name: 'Your Balance', value: `${userTokens} tokens`, inline: true },
        { name: 'Balance After', value: `${userTokens - upgradeCost} tokens`, inline: true }
      )
      .setFooter({ text: 'Click Confirm to proceed with the upgrade' });

    await interaction.editReply({
      embeds: [confirmEmbed],
      components: [row]
    });

  } catch (error) {
    console.error('[handlePouchUpgrade]: Error:', error);
    await interaction.editReply('❌ An error occurred while processing the pouch upgrade.');
  }
}

// ------------------- handlePouchUpgradeConfirm -------------------
async function handlePouchUpgradeConfirm(interaction) {
  try {
    const [_, __, ___, characterName, newPouchType] = interaction.customId.split('_');
    const userId = interaction.user.id;

    // ------------------- Character Validation -------------------
    const character = await fetchCharacterByName(characterName);
    if (!character || character.userId !== userId) {
      return interaction.update({
        content: "❌ Character not found or doesn't belong to you.",
        embeds: [],
        components: []
      });
    }

    // ------------------- Pouch Upgrade Validation -------------------
    const pouchTiers = {
      none: { slots: 0, cost: 0 },
      bronze: { slots: 15, cost: 1000 },
      silver: { slots: 30, cost: 5000 },
      gold: { slots: 50, cost: 10000 }
    };

    const currentPouch = character.shopPouch?.toLowerCase() || 'none';
    const currentTier = Object.keys(pouchTiers).indexOf(currentPouch);
    const newTier = Object.keys(pouchTiers).indexOf(newPouchType);

    // Double check upgrade validity
    if (newTier <= currentTier || newTier - currentTier > 1) {
      return interaction.update({
        content: "❌ Invalid upgrade path. Please try the upgrade command again.",
        embeds: [],
        components: []
      });
    }

    // ------------------- Token Balance Check -------------------
    const userTokens = await getTokenBalance(userId);
    const upgradeCost = pouchTiers[newPouchType].cost;

    if (userTokens < upgradeCost) {
      return interaction.update({
        content: "❌ Not enough tokens for this upgrade. Your balance has changed since the initial check.",
        embeds: [],
        components: []
      });
    }

    // ------------------- Process Upgrade -------------------
    // Update token balance
    await updateTokenBalance(userId, -upgradeCost);

    // Update character's pouch
    await Character.updateOne(
      { _id: character._id },
      { 
        $set: { 
          shopPouch: newPouchType,
          pouchSize: pouchTiers[newPouchType].slots
        }
      }
    );

    // ------------------- Success Response -------------------
    const successEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Pouch Upgrade Successful!')
      .setDescription(`${characterName}'s shop pouch has been upgraded!`)
      .addFields(
        { name: 'New Pouch Tier', value: newPouchType.toUpperCase(), inline: true },
        { name: 'New Slot Capacity', value: `${pouchTiers[newPouchType].slots} slots`, inline: true },
        { name: 'Tokens Spent', value: `${upgradeCost} tokens`, inline: true },
        { name: 'Remaining Tokens', value: `${userTokens - upgradeCost} tokens`, inline: true }
      );

    await interaction.update({
      embeds: [successEmbed],
      components: []
    });

  } catch (error) {
    console.error('[handlePouchUpgradeConfirm]: Error:', error);
    await interaction.update({
      content: '❌ An error occurred while processing the upgrade. Please try again.',
      embeds: [],
      components: []
    });
  }
}

// ------------------- handleViewShop -------------------
async function handleViewShop(interaction) {
  try {
    const characterName = interaction.options.getString('charactername');
    if (!characterName) {
      return await interaction.reply({
        content: '❌ Please provide a character name.'
      });
    }

    // Get character from database
    const character = await Character.findOne({ name: characterName });
    if (!character) {
      return await interaction.reply({
        content: `❌ Character ${characterName} not found.`
      });
    }

    // Get the vending model for this character
    const VendingInventory = await getVendingModel(characterName);

    // Get items from vending inventory
    const items = await VendingInventory.find({});

    // Filter out items with zero stock
    const availableItems = items.filter(item => item.stockQty > 0);

    if (!availableItems || availableItems.length === 0) {
      return await interaction.reply({
        content: `⚠️ No items currently available in ${characterName}'s vending inventory.`
      });
    }

    // Create shop embed
    const shopEmbed = new EmbedBuilder()
      .setTitle(`${characterName}'s Shop`)
      .setDescription(`Welcome to ${characterName}'s shop!`)
      .setColor('#00FF00')
      .setImage(character.shopImage || VIEW_SHOP_IMAGE_URL)
      .setTimestamp();

    // Add vending points to embed
    shopEmbed.addFields({
      name: '🪙 Vending Points',
      value: `${character.vendingPoints || 0} points`,
      inline: false
    });

    // Add items to embed
    availableItems.forEach(item => {
      shopEmbed.addFields({
        name: `${item.itemName} (${item.stockQty} in stock)`,
        value: `Cost: ${item.costEach} points\nToken Price: ${item.tokenPrice || 'N/A'}\nArt Price: ${item.artPrice || 'N/A'}\nOther Price: ${item.otherPrice || 'N/A'}\nBarter Open: ${item.barterOpen ? 'Yes' : 'No'}`,
        inline: true
      });
    });

    // Send the embed
    await interaction.reply({
      embeds: [shopEmbed]
    });

  } catch (error) {
    console.error(`[handleViewShop]: Error viewing shop:`, error);
    await interaction.reply({
      content: `❌ Error viewing shop: ${error.message}`
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
            content: `❌ Character "${characterName}" not found or doesn't belong to you.`
        });
    }

    // Check if character already has vending setup
    if (character.vendingSetup?.shopLink && character.vendingSync) {
        return interaction.reply({
            content: `❌ ${characterName} already has a vending shop set up and synced. Use \`/vending edit\` to modify your shop settings.`
        });
    }

    // Validate pouch type
    const validPouchTypes = ['none', 'bronze', 'silver', 'gold'];
    if (!validPouchTypes.includes(pouchType?.toLowerCase())) {
        return interaction.reply({
            content: '❌ Invalid pouch type. Please choose from: none, bronze, silver, or gold.'
        });
    }

    // Validate shop link
    if (!shopLink) {
        return interaction.reply({
            content: '❌ Please provide a Google Sheets link for your shop.'
        });
    }

    if (!isValidGoogleSheetsUrl(shopLink)) {
        return interaction.reply({
            content: '❌ Invalid Google Sheets URL. Please provide a valid Google Sheets link.'
        });
    }

    // Validate the vending sheet
    const validation = await validateVendingSheet(shopLink, characterName);
    if (!validation.success) {
        return interaction.reply({
            content: validation.message
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
            content: `❌ ${characterName} must be a Shopkeeper or Merchant to set up a vending shop.`
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
    } catch (error) {
        console.error('[handleVendingSetup]: Error updating character:', error);
        return interaction.reply({
            content: '❌ Failed to update character data. Please try again later.'
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

    // Parse the sheet data
    const parsedRows = await parseSheetData(shopLink);

    // Initialize vendingEntries array
    const vendingEntries = [];

    // Validate all items before proceeding
    const errors = [];
    let totalSlotsUsed = 0;

    // Calculate total available slots
    const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
    const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
    const baseSlots = baseSlotLimits[character.job?.toLowerCase()] || 0;
    const extraSlots = pouchCapacities[character.shopPouch?.toLowerCase()] || 0;
    const totalSlots = baseSlots + extraSlots;

    // Track used slots
    const usedSlots = new Set();

    for (const row of parsedRows) {
      const item = await ItemModel.findOne({ itemName: row.itemName });
      if (!item) {
        errors.push(`Item "${row.itemName}" not found in database`);
        continue;
      }

      const isStackable = item.stackable;
      const maxStackSize = item.maxStackSize || 10;
      let stockQty = Number(row.stockQty) || 0;
      let slotsNeeded = 1;

      // Skip items with zero or negative stock
      if (stockQty <= 0) {
        continue;
      }

      if (isStackable) {
        slotsNeeded = Math.ceil(stockQty / maxStackSize);
      } else {
        slotsNeeded = stockQty;
      }

      // Auto-assign slot if none specified
      let slot = row.slot;
      if (!slot) {
        // Find first available slot
        for (let i = 1; i <= totalSlots; i++) {
          const slotName = `Slot ${i}`;
          if (!usedSlots.has(slotName)) {
            slot = slotName;
            usedSlots.add(slotName);
            break;
          }
        }
        if (!slot) {
          errors.push(`No available slots for ${row.itemName}. You have used all ${totalSlots} slots.`);
          continue;
        }
      } else {
        // Validate manually specified slot
        const slotNumber = parseInt(slot.replace(/[^0-9]/g, ''));
        if (isNaN(slotNumber) || slotNumber < 1 || slotNumber > totalSlots) {
          errors.push(`Invalid slot number "${slot}" for ${row.itemName}. You have ${totalSlots} total slots available.`);
          continue;
        }
        usedSlots.add(slot);
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
        artPrice: row.artPrice === 'N/A' ? null : row.artPrice,
        otherPrice: row.otherPrice === 'N/A' ? null : row.otherPrice,
        barterOpen: row.barterOpen === 'Yes' || row.barterOpen === true,
        slot: slot,
        date: new Date(),
        stackable: isStackable,
        maxStackSize: maxStackSize,
        slotsUsed: slotsNeeded
      });
    }

    // If there are validation errors, throw them
    if (errors.length > 0) {
      throw new Error(`Validation errors:\n${errors.join('\n')}`);
    }

    // Clear existing inventory before inserting new entries
    await VendingInventory.deleteMany({});

    // Insert the new entries
    if (vendingEntries.length > 0) {
      await VendingInventory.insertMany(vendingEntries);
    }

    // Update character's vending sync status
    await Character.updateOne(
      { name: characterName },
      { $set: { vendingSync: true } }
    );

    // Send success message
    await interaction.editReply({
      content: `✅ Successfully synced ${characterName}'s vending shop with ${vendingEntries.length} items.`,
      embeds: [],
      components: []
    });

  } catch (error) {
    console.error("[handleVendingSync]:", error);
    await interaction.editReply({
      content: `❌ An error occurred while syncing your vending shop: ${error.message}`,
      embeds: [],
      components: []
    });
  }
}
  
// ------------------- handleEditShop -------------------
async function handleEditShop(interaction) {
  try {
    await interaction.deferReply();

    const characterName = interaction.options.getString('charactername');
    const action = interaction.options.getString('action');
    const userId = interaction.user.id;

    // Validate character exists and belongs to user
    const character = await fetchCharacterByNameAndUserId(characterName, userId);
    if (!character) {
      return interaction.editReply({
        content: `❌ Character '${characterName}' not found or doesn't belong to you.`,
        ephemeral: true
      });
    }

    // Validate character has a shop setup
    if (!character.vendingSetup?.shopLink && !character.shopLink) {
      return interaction.editReply({
        content: `❌ ${characterName} doesn't have a shop set up yet. Use \`/vending setup\` first.`,
        ephemeral: true
      });
    }

    switch (action) {
      case 'item': {
        const itemName = interaction.options.getString('itemname');
        if (!itemName) {
          return interaction.editReply({
            content: '❌ Item name is required for item editing.',
            ephemeral: true
          });
        }

        const tokenPrice = interaction.options.getInteger('tokenprice');
        const artPrice = interaction.options.getString('artprice');
        const otherPrice = interaction.options.getString('otherprice');

        // Validate at least one price is being updated
        if (tokenPrice === null && !artPrice && !otherPrice) {
          return interaction.editReply({
            content: '❌ Please provide at least one price to update (token price, art price, or other price).',
            ephemeral: true
          });
        }

        // Update item in vending inventory
        const VendingInventory = await getVendingModel(characterName);
        const existingItem = await VendingInventory.findOne({ itemName });
        
        if (!existingItem) {
          return interaction.editReply({
            content: `❌ Item "${itemName}" not found in your shop inventory.`,
            ephemeral: true
          });
        }

        const updateFields = {};
        if (tokenPrice !== null) updateFields.tokenPrice = tokenPrice;
        if (artPrice) updateFields.artPrice = artPrice;
        if (otherPrice) updateFields.otherPrice = otherPrice;

        await VendingInventory.updateOne(
          { itemName },
          { $set: updateFields }
        );

        // Update Google Sheet
        const shopLink = character.shopLink || character.vendingSetup?.shopLink;
        if (shopLink) {
          try {
            const spreadsheetId = extractSpreadsheetId(shopLink);
            const auth = await authorizeSheets();
            
            // Read current sheet data
            const sheetData = await readSheetData(auth, spreadsheetId, 'vendingShop!A2:L');
            
            // Find the row with the item
            const itemRowIndex = sheetData.findIndex(row => row[2] === itemName);
            if (itemRowIndex !== -1) {
              const row = itemRowIndex + 2; // +2 because sheet data starts at A2
              const updateData = [];
              
              // Keep existing values except for the ones we're updating
              const existingRow = sheetData[itemRowIndex];
              updateData.push(
                existingRow[0], // Character Name
                existingRow[1], // Slot
                existingRow[2], // Item Name
                existingRow[3], // Stock Qty
                existingRow[4], // Cost Each
                existingRow[5], // Points Spent
                existingRow[6], // Bought From
                tokenPrice !== null ? tokenPrice : existingRow[7], // Token Price
                artPrice || existingRow[8], // Art Price
                otherPrice || existingRow[9], // Other Price
                existingRow[10], // Trades Open
                existingRow[11] // Date
              );
              
              // Update the row in the sheet
              await writeSheetData(auth, spreadsheetId, `vendingShop!A${row}:L${row}`, [updateData]);
            }
          } catch (sheetError) {
            console.error('[handleEditShop]: Error updating Google Sheet:', sheetError);
            // Don't fail the whole operation if sheet update fails
          }
        }

        await interaction.editReply({
          content: `✅ Updated item "${itemName}" in your shop.`,
          ephemeral: true
        });
        break;
      }

      case 'banner': {
        const shopImageFile = interaction.options.getAttachment('shopimagefile');
        if (!shopImageFile) {
          return interaction.editReply({
            content: '❌ Shop image file is required for banner update.',
            ephemeral: true
          });
        }

        // Validate file type
        const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!validImageTypes.includes(shopImageFile.contentType)) {
          return interaction.editReply({
            content: '❌ Invalid file type. Please upload a valid image file (JPEG, PNG, GIF, or WebP).',
            ephemeral: true
          });
        }

        // Validate file size (max 8MB)
        const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB in bytes
        if (shopImageFile.size > MAX_FILE_SIZE) {
          return interaction.editReply({
            content: '❌ File size too large. Maximum size is 8MB.',
            ephemeral: true
          });
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
        return interaction.editReply({
          content: '❌ Invalid action selected.',
          ephemeral: true
        });
    }

  } catch (error) {
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
          content: '❌ Invalid Google Sheets link. Please provide a valid link.'
        });
        return;
      }
  
      // ------------------- Step 2: Fetch Character -------------------
      const userId = interaction.user.id;
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.reply({
          content: `❌ Character '${characterName}' not found.`
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
        content: `✅ Shop link for **${characterName}** updated successfully!`
      });
    } catch (error) {
      handleError(error, 'vendingHandler.js');
      console.error('[handleShopLink]: Error updating shop link:', error);
      await interaction.reply({
        content: '❌ An error occurred while updating the shop link. Please try again later.'
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
  await interaction.deferReply();

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
        content: `📭 No vending stock available for **${monthName}**, even after regeneration.`
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
        .setEmoji(villageEmojis.rudania)
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId('vending_view|inariko')
        .setLabel('Inariko')
        .setEmoji(villageEmojis.inariko)
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('vending_view|vhintl')
        .setLabel('Vhintl')
        .setEmoji(villageEmojis.vhintl)
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
      content: `❌ An error occurred while retrieving vending stock.`
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
      barterOpen: inputs.barterOpen === true
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
    handleCollectPoints,
    handleRestock,
    handleVendingBarter,
    handleFulfill,
    handleEditShop,
    handleVendingSync,
    handlePouchUpgrade,
    handleVendingSetup,
    handleViewShop,
    handleShopLink,
    viewVendingStock,
    handleVendingViewVillage,
    handleSyncButton
};