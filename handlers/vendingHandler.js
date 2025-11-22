// ============================================================================
// ------------------- Vending Handler Blueprint -------------------
// Handles all /vending subcommands for barter, restock, fulfill, etc.
// ============================================================================

// ------------------- Standard Libraries -------------------
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require("mongodb");
const mongoose = require('mongoose');
const dbConfig = require('../config/database');
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
  addItemToVendingInventory,
  escapeRegExp
} = require("../utils/inventoryUtils.js");

const {
  retrieveVendingRequestFromStorage,
  deleteVendingRequestFromStorage,
  saveVendingRequestToStorage,
  retrieveAllVendingRequests
} = require('../utils/storage.js');
const { handleError } = require('../utils/globalErrorHandler.js');
const { uploadSubmissionImage } = require('../utils/uploadUtils.js');

const {
  capitalizeFirstLetter
 } = require("../modules/formattingModule");
const { getVillageColorByName } = require("../modules/locationsModule");

 const { createVendingSetupInstructionsEmbed } = require("../embeds/embeds.js");

// ------------------- Validation Functions -------------------
const {
  validateVendingItem,
  validateVendingPrices,
  validateVendingLocation
} = require('../utils/validation.js');

// ------------------- Function: validateArtLink -------------------
// Validates if a link is a valid Discord message link format
// For vending, we just need to ensure it's a proper Discord message link
function validateArtLink(link) {
  if (!link || typeof link !== 'string') {
    return {
      valid: false,
      error: 'Art link is required and must be a string.'
    };
  }

  const trimmedLink = link.trim();
  if (!trimmedLink) {
    return {
      valid: false,
      error: 'Art link cannot be empty.'
    };
  }

  // Discord message link format: https://discord.com/channels/guildId/channelId/messageId
  const discordLinkRegex = /^https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/;
  const match = trimmedLink.match(discordLinkRegex);
  
  if (!match) {
    return {
      valid: false,
      error: 'Invalid Discord message link format. Please provide a valid Discord message link. You can get a message link by right-clicking on a message and selecting "Copy Message Link".'
    };
  }

  return {
    valid: true,
    link: trimmedLink,
    guildId: match[1],
    channelId: match[2],
    messageId: match[3]
  };
}

// ------------------- Vending Model Helper -------------------
async function getVendingModel(characterName) {
  return await initializeVendingInventoryModel(characterName);
}

// ------------------- Constants -------------------
const DEFAULT_IMAGE_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const MONTHLY_VENDING_POINTS = 500;
const VIEW_SHOP_IMAGE_URL = DEFAULT_IMAGE_URL;
const FULFILLMENT_REQUEST_TTL_DAYS = 7; // Request expires after 7 days
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 100; // Initial delay for exponential backoff

// ============================================================================
// ------------------- Transaction & Atomic Operation Helpers -------------------
// These functions provide transaction safety, atomic operations, and retry logic
// ============================================================================

// ------------------- runWithTransaction -------------------
// Wraps operations in a MongoDB transaction with retry logic
async function runWithTransaction(fn, maxRetries = MAX_RETRY_ATTEMPTS) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      lastError = error;
      
      // Retry on transient errors (WriteConflict, TransientTransactionError)
      if (attempt < maxRetries - 1 && (
        error.hasErrorLabel('TransientTransactionError') ||
        error.hasErrorLabel('UnknownTransactionCommitResult') ||
        error.code === 112 // WriteConflict
      )) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[vendingHandler.js]: Transaction conflict, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    } finally {
      session.endSession();
    }
  }
  throw lastError;
}

// ------------------- retryOperation -------------------
// Retries an operation with exponential backoff
async function retryOperation(fn, maxRetries = MAX_RETRY_ATTEMPTS, operationName = 'operation') {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Retry on transient errors
      if (attempt < maxRetries - 1 && (
        error.code === 11000 || // Duplicate key
        error.name === 'MongoNetworkError' ||
        error.name === 'MongoTimeoutError' ||
        (error.message && error.message.includes('connection'))
      )) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[vendingHandler.js]: ${operationName} failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ------------------- atomicUpdateTokenBalance -------------------
// Atomically updates token balance with validation
async function atomicUpdateTokenBalance(userId, change, session = null) {
  const User = require('../models/UserModel');
  const options = session ? { session } : {};
  
  // For negative changes, ensure sufficient balance
  if (change < 0) {
    const result = await User.findOneAndUpdate(
      { 
        discordId: userId,
        $expr: { $gte: [{ $ifNull: ['$tokens', 0] }, -change] } // Ensure balance won't go negative
      },
      { 
        $inc: { tokens: change }
      },
      { 
        new: true,
        ...options
      }
    );
    
    if (!result) {
      // Try to get current balance for error message
      const currentUser = await User.findOne({ discordId: userId }, null, options);
      const currentBalance = currentUser?.tokens || 0;
      throw new Error(`Insufficient tokens for user ${userId}. Required: ${-change}, Available: ${currentBalance}`);
    }
    
    return result.tokens || 0;
  } else {
    // For positive changes, allow upsert
    const result = await User.findOneAndUpdate(
      { discordId: userId },
      { 
        $inc: { tokens: change },
        $setOnInsert: { tokenTracker: '', tokensSynced: false }
      },
      { 
        new: true, 
        upsert: true, 
        setDefaultsOnInsert: true,
        ...options
      }
    );
    
    return result.tokens || 0;
  }
}

// ------------------- atomicUpdateStockQuantity -------------------
// Atomically updates stock quantity with validation
async function atomicUpdateStockQuantity(VendingInventory, itemId, quantityChange, requiredQuantity, session = null) {
  const options = session ? { session } : {};
  
  const result = await VendingInventory.findOneAndUpdate(
    { 
      _id: itemId,
      stockQty: { $gte: requiredQuantity } // Ensure sufficient stock
    },
    { 
      $inc: { stockQty: quantityChange }
    },
    { 
      new: true,
      ...options
    }
  );
  
  if (!result) {
    throw new Error(`Insufficient stock. Required: ${requiredQuantity}, but stock check failed.`);
  }
  
  // Delete if stock reaches zero or below
  if (result.stockQty <= 0) {
    await VendingInventory.deleteOne({ _id: itemId }, options);
  }
  
  return result;
}

// ------------------- validateFulfillmentRequest -------------------
// Re-validates all conditions before fulfillment
// NOTE: This should be called BEFORE marking request as processing
async function validateFulfillmentRequest(request, buyer, vendor, VendingInventory) {
  const errors = [];
  
  // Check if request is expired (more robust check)
  if (request.expiresAt) {
    const now = new Date();
    const expiresAt = new Date(request.expiresAt);
    if (now > expiresAt) {
      errors.push(`Request has expired (expired on ${expiresAt.toLocaleString()})`);
    }
  }
  
  // Check if request is already processed
  // Note: This should only fail if request is already completed
  // If status is 'processing', it should be handled by the caller before validation
  if (request.status === 'completed') {
    errors.push('Request has already been completed');
  }
  
  // Warn (but don't fail) if status is processing - this indicates a potential race condition
  if (request.status === 'processing') {
    console.warn(`[validateFulfillmentRequest]: Warning - validating request ${request.fulfillmentId} with status 'processing'`);
    // Don't add error - let caller handle this case
  }
  
  // Check if characters still exist
  if (!buyer) {
    errors.push(`Buyer character "${request.userCharacterName}" not found`);
  }
  if (!vendor) {
    errors.push(`Vendor character "${request.vendorCharacterName}" not found`);
  }
  
  // Validate request structure
  if (!request.itemName) {
    errors.push('Request missing item name');
  }
  if (!request.quantity || request.quantity <= 0) {
    errors.push(`Invalid quantity: ${request.quantity || 'not specified'}`);
  }
  if (!request.paymentMethod) {
    errors.push('Request missing payment method');
  }
  
  // Check if item still exists in vendor inventory
  let stockItem = null;
  if (!request.itemName) {
    // Already added error above, skip inventory check
  } else {
    stockItem = await VendingInventory.findOne({ itemName: request.itemName });
    if (!stockItem) {
      errors.push(`Item "${request.itemName}" no longer available in vendor inventory`);
    } else {
      // Validate stock quantity
      if (stockItem.stockQty < request.quantity) {
        errors.push(`Insufficient stock. Available: ${stockItem.stockQty}, Required: ${request.quantity}`);
      }
      // Validate stock is not zero or negative
      if (stockItem.stockQty <= 0) {
        errors.push(`Item "${request.itemName}" is out of stock`);
      }
    }
  }
  
  // Re-validate location restrictions
  const { validateVendingLocation } = require('../utils/validation');
  const locationValidation = validateVendingLocation(vendor, buyer);
  if (!locationValidation.valid) {
    errors.push(locationValidation.error);
  }
  
  // For token payments, check balance (only if we have a valid stockItem or pricing info)
  if (request.paymentMethod === 'tokens') {
    if (!buyer) {
      // Already added error above, skip balance check
    } else {
      const buyerTokens = await getTokenBalance(request.buyerId);
      let requiredTokens = 0;
      
      if (request.isVendorSelfPurchase && request.originalSellPrice) {
        requiredTokens = request.originalSellPrice * request.quantity;
      } else if (request.originalTokenPrice) {
        requiredTokens = request.originalTokenPrice * request.quantity;
      } else if (stockItem && stockItem.tokenPrice) {
        // Fallback: calculate from current stock item
        requiredTokens = stockItem.tokenPrice * request.quantity;
      } else {
        errors.push('Unable to determine token price for this item');
      }
      
      if (requiredTokens > 0 && buyerTokens < requiredTokens) {
        errors.push(`Insufficient tokens. Required: ${requiredTokens}, Available: ${buyerTokens}`);
      }
    }
  }
  
  // Check for price changes (only if we have a valid stockItem)
  if (request.paymentMethod === 'tokens' && stockItem && errors.length === 0) {
    if (request.isVendorSelfPurchase) {
      const ItemModel = require('../models/ItemModel');
      const itemDetails = await ItemModel.findOne({ itemName: request.itemName });
      const currentSellPrice = itemDetails?.sellPrice || 0;
      if (request.originalSellPrice && currentSellPrice !== request.originalSellPrice) {
        errors.push(`Item price has changed. Original: ${request.originalSellPrice}, Current: ${currentSellPrice}`);
      }
    } else {
      if (request.originalTokenPrice && stockItem.tokenPrice !== request.originalTokenPrice) {
        errors.push(`Item price has changed. Original: ${request.originalTokenPrice}, Current: ${stockItem.tokenPrice}`);
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    stockItem
  };
}

// ------------------- markRequestAsProcessing -------------------
// Atomically marks request as processing to prevent duplicate processing
async function markRequestAsProcessing(fulfillmentId, session = null) {
  const options = session ? { session } : {};
  
  const result = await VendingRequest.findOneAndUpdate(
    { 
      fulfillmentId,
      status: 'pending', // Only update if still pending
      $or: [
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: new Date() } }
      ]
    },
    { 
      $set: { 
        status: 'processing',
        processedAt: new Date()
      },
      $inc: { version: 1 }
    },
    { 
      new: true,
      ...options
    }
  );
  
  if (!result) {
    throw new Error('Request is not available for processing (already processed, expired, or not found)');
  }
  
  return result;
}

// ============================================================================
// ------------------- Handler Functions (Exported) -------------------
// Each function handles one vending subcommand. They are modular, async,
// and include error handling + DB updates where relevant.
// ============================================================================

// ------------------- Connect to vending database -------------------
async function connectToVendingDatabase() {
  const client = new MongoClient(dbConfig.vending, {});
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
// Only available from the 1st to the 5th of each month.
async function handleCollectPoints(interaction) {
  try {
    let characterName = interaction.options.getString('charactername');
    
    // Extract character name if formatted string was passed (e.g., "John | inariko | shopkeeper" -> "John")
    if (characterName && characterName.includes('|')) {
      characterName = characterName.split('|')[0].trim();
    }
    
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

    // ------------------- Window Restriction Check -------------------
    // Credit collection and restock are only available from 1st to 5th of each month
    const now = new Date();
    const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const estDate = new Date(estTime.getFullYear(), estTime.getMonth(), estTime.getDate());
    const currentDay = estDate.getDate();
    const currentMonth = estDate.getMonth() + 1;
    const currentYear = estDate.getFullYear();

    // TEMPORARILY DISABLED FOR TESTING - Check if outside collection window (1st-5th)
    // if (currentDay < 1 || currentDay > 5) {
    //   const nextWindowStart = new Date(currentYear, currentMonth, 1);
    //   if (currentMonth === 12) {
    //     nextWindowStart.setFullYear(currentYear + 1);
    //     nextWindowStart.setMonth(0);
    //   } else {
    //     nextWindowStart.setMonth(currentMonth);
    //   }
    //   const nextWindowEnd = new Date(nextWindowStart);
    //   nextWindowEnd.setDate(5);

    //   return interaction.reply({
    //     content: `❌ **Outside Collection Window**\n\nVending credit collection is only available from the **1st to the 5th** of each month.\n\n**Current date:** ${estDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\n**Next collection window:** ${nextWindowStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${nextWindowEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    //   });
    // }

    // ------------------- Claim Check -------------------
    const alreadyClaimed = character.lastCollectedMonth === currentMonth;

    if (alreadyClaimed) {
      return interaction.reply({
        content: `⚠️ **Already Claimed**\n\n${characterName} has already claimed vending points for this month.\n\nNext claim available: **${new Date(currentYear, currentMonth, 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}**`
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
    // Check if character has completed vending setup via dashboard
    if (!character.vendingSetup?.setupDate) {
        return interaction.reply({
            content: `❌ **Setup Required**\n\nYou must complete vending setup before collecting points.\n\nPlease run \`/vending setup\` to access the dashboard and set up your shop.`
        });
    }

    // ------------------- Award Points -------------------
    const pointsAwarded = MONTHLY_VENDING_POINTS;
    const currentPoints = character.vendingPoints || 0;
    const totalPoints = currentPoints + pointsAwarded;

    await updateCharacterById(character._id, {
      vendingPoints: totalPoints,
      lastPointClaim: now,
      lastCollectedMonth: currentMonth
    });

    // ------------------- Get Village Color -------------------
    const villageColor = character.homeVillage 
      ? getVillageColorByName(capitalizeFirstLetter(character.homeVillage))
      : '#7289DA';

    // ------------------- Embed Response -------------------
    const embed = new EmbedBuilder()
      .setTitle(`🪙 Vending Points Awarded`)
      .setDescription(`**${characterName}** has received their monthly vending points!`)
      .setColor(villageColor)
      .setAuthor({
        name: `${characterName} 🔗`,
        iconURL: character.icon || undefined,
        url: character.inventory || undefined
      })
      .setThumbnail(character.icon || null)
      .addFields(
        {
          name: '💰 Points Awarded',
          value: `**+${pointsAwarded.toLocaleString()}** vending points`,
          inline: true
        },
        {
          name: '💎 Total Points',
          value: `**${totalPoints.toLocaleString()}** vending points`,
          inline: true
        },
        {
          name: '📅 Collection Period',
          value: `Claimed for **${new Date(currentYear, currentMonth - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}**`,
          inline: false
        }
      )
      .setImage(DEFAULT_IMAGE_URL)
      .setFooter({ 
        text: `Vending Shop • Claimed on ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
        iconURL: character.icon || undefined
      })
      .setTimestamp();

    if (character.vendingSheetUrl) {
      embed.addFields({
        name: '📎 Shop Sheet',
        value: `[View Shop Sheet](${character.vendingSheetUrl})`,
        inline: false
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
// Only available from the 1st to the 5th of each month.
async function handleRestock(interaction) {
  try {
    await interaction.deferReply();

    // ------------------- Window Restriction Check -------------------
    // TEMPORARILY DISABLED FOR TESTING - Credit collection and restock are only available from 1st to 5th of each month
    // const now = new Date();
    // const estTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    // const estDate = new Date(estTime.getFullYear(), estTime.getMonth(), estTime.getDate());
    // const currentDay = estDate.getDate();
    // const currentMonth = estDate.getMonth() + 1;
    // const currentYear = estDate.getFullYear();

    // Check if outside restock window (1st-5th)
    // if (currentDay < 1 || currentDay > 5) {
    //   const nextWindowStart = new Date(currentYear, currentMonth, 1);
    //   if (currentMonth === 12) {
    //     nextWindowStart.setFullYear(currentYear + 1);
    //     nextWindowStart.setMonth(0);
    //   } else {
    //     nextWindowStart.setMonth(currentMonth);
    //   }
    //   const nextWindowEnd = new Date(nextWindowStart);
    //   nextWindowEnd.setDate(5);

    //   return interaction.editReply({
    //     content: `❌ **Outside Restock Window**\n\nVending restock is only available from the **1st to the 5th** of each month.\n\n**Current date:** ${estDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\n**Next restock window:** ${nextWindowStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${nextWindowEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`
    //   });
    // }

    // ------------------- Input Parsing -------------------
    let characterName = interaction.options.getString('charactername');
    
    // Extract character name if formatted string was passed (e.g., "John | inariko | shopkeeper" -> "John")
    if (characterName && characterName.includes('|')) {
      characterName = characterName.split('|')[0].trim();
    }
    
    const itemName = interaction.options.getString('itemname');
    const stockQty = interaction.options.getInteger('quantity');
    const manualSlot = interaction.options.getString('slot');
    const tokenPrice = interaction.options.getInteger('tokenprice');
    const artPrice = interaction.options.getString('artprice');
    const otherPrice = interaction.options.getString('otherprice');
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
    // Get all items to check which slots are actually occupied
    const allItems = await vendCollection.find({}).toArray();
    const occupiedSlots = new Set();
    
    // Track all occupied slots (including items that might be in the same slot as the item we're adding)
    allItems.forEach(item => {
      if (item.slot) {
        occupiedSlots.add(item.slot);
      }
    });
    
    let newSlot;
    if (manualSlot) {
      // Validate manual slot number
      const slotNumber = parseInt(manualSlot.replace(/[^0-9]/g, ''));
      if (isNaN(slotNumber) || slotNumber < 1 || slotNumber > totalSlots) {
        return interaction.editReply(`❌ Invalid slot number. You have ${totalSlots} total slots available (1-${totalSlots}).`);
      }
      
      // Check if slot is already taken by a different item
      const existingItem = await vendCollection.findOne({ 
        slot: manualSlot,
        itemName: { $ne: itemName } // Only check for different items
      });
      if (existingItem) {
        return interaction.editReply(`❌ Slot ${manualSlot} is already occupied by ${existingItem.itemName}. Please choose a different slot.`);
      }
      newSlot = manualSlot;
    } else {
      // Find first available slot by checking all slots sequentially
      for (let i = 1; i <= totalSlots; i++) {
        const slotName = `Slot ${i}`;
        // Check if this slot is occupied by any item (not just the one we're adding)
        const slotOccupied = await vendCollection.findOne({ slot: slotName });
        if (!slotOccupied) {
          newSlot = slotName;
          break;
        }
      }
      if (!newSlot) {
        // Get list of all occupied slots for the error message
        const occupiedList = Array.from(occupiedSlots).sort((a, b) => {
          const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
          const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
          return numA - numB;
        });
        return interaction.editReply(
          `❌ **No available slots.**\n\n` +
          `You have used all ${totalSlots} slots.\n` +
          `Occupied slots: ${occupiedList.join(', ')}\n\n` +
          `Please remove an item from your shop first, or specify a slot that already contains this item to stack it.`
        );
      }
    }

    // Final validation: Double check slot is available right before transaction
    const finalSlotCheck = await vendCollection.findOne({
      slot: newSlot,
      itemName: { $ne: itemName }
    });

    if (finalSlotCheck) {
      return interaction.editReply(`❌ Slot conflict detected: Slot ${newSlot} is already occupied by ${finalSlotCheck.itemName}. Please try again with a different slot.`);
    }

    // ------------------- Stack Size Validation -------------------
    const existingItem = await vendCollection.findOne({
      itemName,
      slot: newSlot
    });

    // ------------------- Price Validation -------------------
    // At least one price must be set before items can be sold
    const priceItem = {
      tokenPrice: tokenPrice !== null && tokenPrice !== undefined ? tokenPrice : null,
      artPrice: artPrice && artPrice.trim() !== '' ? artPrice : null,
      otherPrice: otherPrice && otherPrice.trim() !== '' ? otherPrice : null,
      barterOpen: barterOpen
    };

    const priceValidation = validateVendingPrices(priceItem);
    if (priceValidation.length > 0) {
      return interaction.editReply({
        content: `❌ **Price Validation Failed**\n\n${priceValidation.join('\n')}\n\nPlease set at least one of the following:\n• **Token Price** (number)\n• **Art Price** (description)\n• **Other Price** (description)\n• **Barter Open** (true/false)`
      });
    }

    // Get item details to check stackable status (allow custom items)
    const itemDetails = await ItemModel.findOne({ itemName });
    const isCustomItem = !itemDetails;
    
    if (!isCustomItem) {
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
    }

    // ------------------- Update Inventory and Points (Transaction) -------------------
    // Wrap critical operations in transaction for atomicity
    // Note: vendCollection operations can't use mongoose session as they're from a different client
    await runWithTransaction(async (session) => {
      // Re-validate points before deduction (race condition protection)
      const currentCharacter = await Character.findById(character._id, null, { session });
      if (!currentCharacter || currentCharacter.vendingPoints < totalCost) {
        throw new Error(`Insufficient vending points. Required: ${totalCost}, Available: ${currentCharacter?.vendingPoints || 0}`);
      }

      // Atomically update character points (using mongoose session)
      const pointUpdateResult = await Character.findOneAndUpdate(
        { 
          _id: character._id,
          vendingPoints: { $gte: totalCost } // Ensure sufficient points
        },
        { $inc: { vendingPoints: -totalCost } },
        { 
          new: true,
          session 
        }
      );

      if (!pointUpdateResult) {
        throw new Error(`Insufficient vending points. Points may have changed during transaction.`);
      }
    });

    // Update inventory (separate from transaction as it's in a different database)
    if (existingItem) {
      // Atomically update existing item with stock validation
      const updateResult = await vendCollection.findOneAndUpdate(
        { 
          _id: existingItem._id,
          stockQty: { $exists: true } // Ensure item still exists
        },
        {
          $inc: { stockQty: stockQty, pointsSpent: totalCost },
          $set: { 
            date: new Date(), 
            boughtFrom: character.currentVillage,
            // Update prices if provided
            tokenPrice: tokenPrice !== null && tokenPrice !== undefined ? tokenPrice : existingItem.tokenPrice,
            artPrice: artPrice && artPrice.trim() !== '' ? artPrice : existingItem.artPrice,
            otherPrice: otherPrice && otherPrice.trim() !== '' ? otherPrice : existingItem.otherPrice,
            barterOpen: barterOpen !== undefined ? barterOpen : existingItem.barterOpen,
            tradesOpen: barterOpen !== undefined ? barterOpen : existingItem.tradesOpen // Legacy compatibility
          }
        },
        { 
          returnDocument: 'after'
        }
      );

      if (!updateResult.value) {
        // Rollback points if item update failed
        await Character.findByIdAndUpdate(character._id, { $inc: { vendingPoints: totalCost } });
        throw new Error('Item no longer exists in inventory');
      }

      // Check if stock reached zero and delete if needed
      if (updateResult.value.stockQty <= 0) {
        await vendCollection.deleteOne({ _id: existingItem._id });
      }
    } else {
      // Insert new item with new fields
      try {
        await vendCollection.insertOne({
          characterName: characterName,
          itemName,
          itemId: itemDetails ? itemDetails._id : null,
          stockQty,
          costEach: pointCost,
          pointsSpent: totalCost,
          tokenPrice: tokenPrice !== null && tokenPrice !== undefined ? tokenPrice : null,
          artPrice: artPrice && artPrice.trim() !== '' ? artPrice : null,
          otherPrice: otherPrice && otherPrice.trim() !== '' ? otherPrice : null,
          barterOpen: barterOpen,
          tradesOpen: barterOpen, // Legacy compatibility
          boughtFrom: character.currentVillage,
          slot: newSlot,
          date: new Date(),
          // New fields for tracking
          isPersonalItem: false, // Items from vending stock are not personal
          source: 'vending_stock', // Source is vending stock
          isCustomItem: isCustomItem, // True if item doesn't exist in ItemModel
          customItemData: isCustomItem ? { name: itemName } : null
        });
      } catch (error) {
        // Rollback points if inventory insert failed
        await Character.findByIdAndUpdate(character._id, { $inc: { vendingPoints: totalCost } });
        throw error;
      }
    }

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
      .setAuthor({ 
        name: `${character.name} the ${character.job ? character.job.charAt(0).toUpperCase() + character.job.slice(1).toLowerCase() : 'No Job'}`, 
        iconURL: character.icon 
      })
      .setThumbnail(itemDetails.image || 'https://via.placeholder.com/150')
      .addFields(
        { name: '👤 Character', value: character.name, inline: true },
        { name: '🏘️ Location', value: character.currentVillage, inline: true },
        { name: '🛍️ Shop Type', value: character.job ? character.job.charAt(0).toUpperCase() + character.job.slice(1).toLowerCase() : 'N/A', inline: true },
        { name: '📦 Item', value: `${itemDetails.emoji || '📦'} ${itemName}`, inline: true },
        { name: '🎯 Slot', value: newSlot, inline: true },
        { name: '💰 Prices', value: `Token: ${tokenPrice}\nArt: ${artPrice}\nOther: ${otherPrice}`, inline: true },
        { name: '🪙 Points Spent', value: `${totalCost} points`, inline: true },
        { name: '💎 Remaining Points', value: `${character.vendingPoints - totalCost} points`, inline: true }
      )
      .setFooter({ text: `Added to shop on ${new Date().toLocaleDateString()}` });

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
      const artLink = interaction.options.getString("artlink");
      const offeredItemName = interaction.options.getString("offer");
      const notes = interaction.options.getString("notes");
  
      // ------------------- Validate Inputs -------------------
      if (!targetShopName || !requestedItemName || !quantity || !paymentType) {
        return interaction.editReply("⚠️ Please provide all required options: `vendorcharacter`, `itemname`, `quantity`, and `payment_type`.");
      }

      // Validate art link for art payment type
      if (paymentType === 'art') {
        if (!artLink) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Art Link Required')
            .setDescription('You must provide a link to your art submission when using art as payment.')
            .addFields(
              {
                name: '📝 What This Means',
                value: 'For **art** payments, you need to provide a link to your completed artwork.'
              },
              {
                name: '🔗 How to Get a Valid Link',
                value: '1. Post your art in the submissions channel\n2. Right-click on your art message and select "Copy Message Link"\n3. Use that link in the `artlink` option'
              },
              {
                name: '💡 Important Notes',
                value: '• The link must be from a **Discord message**\n• Make sure the art is posted in the submissions channel'
              }
            )
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setFooter({ text: 'Vending Barter Error' })
            .setTimestamp();
          
          return interaction.editReply({ embeds: [errorEmbed] });
        }

        const linkValidation = validateArtLink(artLink);
        if (!linkValidation.valid) {
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Art Link')
            .setDescription(linkValidation.error)
            .addFields(
              {
                name: '🔗 How to Get a Valid Link',
                value: '1. Post your art in the submissions channel\n2. Right-click on your art message\n3. Select "Copy Message Link"\n4. Use that link in the `artlink` option'
              }
            )
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setFooter({ text: 'Vending Barter Error' })
            .setTimestamp();
          
          return interaction.editReply({ embeds: [errorEmbed] });
        }
      }

      // Validate offer for barter payment type
      if (paymentType === 'barter' && !offeredItemName) {
        return interaction.editReply("⚠️ Please provide an item to offer when using barter payment type.");
      }
  
      let buyerCharacterName = interaction.options.getString('charactername');
      // Extract character name if formatted string was passed (e.g., "John | inariko | shopkeeper" -> "John")
      if (buyerCharacterName && buyerCharacterName.includes('|')) {
        buyerCharacterName = buyerCharacterName.split('|')[0].trim();
      }
      
      const buyer = await fetchCharacterByNameAndUserId(buyerCharacterName, buyerId);
      if (!buyer) {
        return interaction.editReply("⚠️ Your character could not be found. Please create one first.");
      }
  
      // ------------------- Debug Logging -------------------
      console.log(`[handleVendingBarter] Looking for vendor: "${targetShopName}"`);
      const shopOwner = await fetchCharacterByName(targetShopName);
      
      if (!shopOwner) {
        console.log(`[handleVendingBarter] ❌ Character "${targetShopName}" not found in database`);
        return interaction.editReply(`⚠️ No vending shop found under the name **${targetShopName}**.`);
      }
      
      console.log(`[handleVendingBarter] ✅ Character found: "${shopOwner.name}" (ID: ${shopOwner._id})`);
      console.log(`[handleVendingBarter] shopLink: ${shopOwner.shopLink || 'NOT SET'}`);
      console.log(`[handleVendingBarter] vendingSetup exists: ${!!shopOwner.vendingSetup}`);
      console.log(`[handleVendingBarter] vendingSetup.shopLink: ${shopOwner.vendingSetup?.shopLink || 'NOT SET'}`);
      
      // Check both shopLink locations (consistent with rest of codebase)
      const shopLink = shopOwner.shopLink || shopOwner.vendingSetup?.shopLink;
      
      // Check if vending inventory exists even if shopLink is not set
      let hasVendingInventory = false;
      let inventoryCount = 0;
      try {
        const VendingInventory = await getVendingModel(targetShopName);
        inventoryCount = await VendingInventory.countDocuments({});
        hasVendingInventory = inventoryCount > 0;
        console.log(`[handleVendingBarter] Vending inventory items found: ${inventoryCount}`);
      } catch (inventoryError) {
        console.error(`[handleVendingBarter] Error checking inventory: ${inventoryError.message}`);
        console.error(`[handleVendingBarter] Stack: ${inventoryError.stack}`);
      }
      
      // Allow vending if inventory exists, even without shopLink
      if (!shopLink && !hasVendingInventory) {
        console.log(`[handleVendingBarter] ❌ No shopLink and no inventory found for "${targetShopName}"`);
        return interaction.editReply(`⚠️ No vending shop found under the name **${targetShopName}**.`);
      }
      
      if (!shopLink && hasVendingInventory) {
        console.log(`[handleVendingBarter] ⚠️ No shopLink but inventory exists (${inventoryCount} items) - proceeding anyway`);
      }

      // ------------------- Merchant vs Shopkeeper Location Validation -------------------
      const locationValidation = validateVendingLocation(shopOwner, buyer);
      
      if (!locationValidation.valid) {
        const errorEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Location Restriction')
          .setDescription(locationValidation.error)
          .addFields(
            { name: '👤 Vendor', value: shopOwner.name, inline: true },
            { name: '🏘️ Vendor Location', value: shopOwner.currentVillage || 'Unknown', inline: true },
            { name: '🏠 Vendor Home', value: shopOwner.homeVillage || 'Unknown', inline: true },
            { name: '👤 Buyer', value: buyer.name, inline: true },
            { name: '🏘️ Buyer Location', value: buyer.currentVillage || 'Unknown', inline: true },
            { name: '💼 Vendor Job', value: shopOwner.job || 'Unknown', inline: true }
          );

        if (locationValidation.vendorLocation || locationValidation.buyerLocation) {
          errorEmbed.addFields({
            name: '💡 Travel Tip',
            value: locationValidation.vendorJob === 'shopkeeper' 
              ? `Shopkeepers can only sell when they are in their home village (${shopOwner.homeVillage}). Please wait for ${shopOwner.name} to return home.`
              : `Use </travel:1379850586987430009> to travel to ${shopOwner.currentVillage} and barter with ${shopOwner.name}.`,
            inline: false
          });
        }

        errorEmbed
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: 'Village restriction active' })
          .setTimestamp();

        return interaction.editReply({ embeds: [errorEmbed] });
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
            return interaction.editReply({
              embeds: [{
                color: 0xFFA500, // Orange color
                title: '⚠️ Item Not Available',
                description: `The item **${requestedItemName}** is not available for token purchase in ${targetShopName}'s shop.`,
                image: {
                  url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
                },
                footer: {
                  text: 'Vending Shop Validation'
                }
              }]
            });
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
            return interaction.editReply({
              embeds: [{
                color: 0xFFA500, // Orange color
                title: '⚠️ Item Not Available',
                description: `The item **${requestedItemName}** is not available for art purchase in ${targetShopName}'s shop.`,
                image: {
                  url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
                },
                footer: {
                  text: 'Vending Shop Validation'
                }
              }]
            });
          }
          break;
        case 'barter':
          requestedItem = allItems.find(item => 
            item.barterOpen === true
          );
          if (!requestedItem) {
            return interaction.editReply({
              embeds: [{
                color: 0xFFA500, // Orange color
                title: '⚠️ Item Not Available for Barter',
                description: `The item **${requestedItemName}** is not available for barter in ${targetShopName}'s shop.`,
                image: {
                  url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
                },
                footer: {
                  text: 'Vending Shop Validation'
                }
              }]
            });
          }
          break;
      }

      if (!requestedItem) {
        return interaction.editReply({
          embeds: [{
            color: 0xFFA500, // Orange color
            title: '⚠️ Item Not Available',
            description: `The item **${requestedItemName}** is not available in ${targetShopName}'s shop.`,
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Vending Shop Validation'
            }
          }]
        });
      }

      if (requestedItem.stockQty < quantity) {
        return interaction.editReply({
          embeds: [{
            color: 0xFFA500, // Orange color
            title: '⚠️ Insufficient Stock',
            description: `${targetShopName} only has **${requestedItem.stockQty}** ${requestedItemName} in stock.`,
            image: {
              url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
            },
            footer: {
              text: 'Vending Shop Validation'
            }
          }]
        });
      }
  
      // ------------------- Vendor Self-Purchase Check -------------------
      // If vendor is buying from own shop, must use ROTW SELL price
      const isVendorSelfPurchase = buyer.userId === shopOwner.userId;
      
      if (isVendorSelfPurchase) {
        // Vendor buying from own shop - must use tokens and ROTW SELL price
        if (paymentType !== 'tokens') {
          return interaction.editReply(
            `❌ **Self-Purchase Restriction**\n\n` +
            `Vendors purchasing from their own shop must use **token payment** and pay the **ROTW SELL price** (not the shop's token price).\n\n` +
            `Please select **Tokens** as your payment method.`
          );
        }

        // Get item details to find sell price
        const itemDetails = await ItemModel.findOne({ itemName: requestedItemName });
        if (!itemDetails) {
          return interaction.editReply(`❌ Could not find item details for ${requestedItemName}. Vendors cannot purchase custom items from their own shop.`);
        }

        const sellPrice = itemDetails.sellPrice || 0;
        if (sellPrice <= 0) {
          return interaction.editReply(`❌ This item has no sell price set. Vendors cannot purchase items without a sell price from their own shop.`);
        }

        const totalCost = sellPrice * quantity;
        const userTokens = await getTokenBalance(buyerId);
        if (userTokens < totalCost) {
          return interaction.editReply(
            `⚠️ **Insufficient Tokens**\n\n` +
            `You need **${totalCost} tokens** to purchase ${quantity}x ${requestedItemName} from your own shop (ROTW SELL price: ${sellPrice} per item).\n\n` +
            `Your balance: **${userTokens} tokens**\n` +
            `Shortage: **${totalCost - userTokens} tokens**`
          );
        }
      } else {
        // Normal buyer - use shop's pricing
        // ------------------- Payment Type Specific Validation -------------------
        switch (paymentType) {
          case 'tokens':
            if (!requestedItem.tokenPrice || requestedItem.tokenPrice === null) {
              return interaction.editReply(`⚠️ ${requestedItemName} is not available for token purchase.`);
            }
            const totalCost = requestedItem.tokenPrice * quantity;
            const userTokens = await getTokenBalance(buyerId);
            if (userTokens < totalCost) {
              return interaction.editReply(`⚠️ You don't have enough tokens. Required: ${totalCost}, Your balance: ${userTokens}`);
            }
            break;

          case 'art':
            if (!requestedItem.artPrice || requestedItem.artPrice === 'N/A' || requestedItem.artPrice === '' || requestedItem.artPrice === null) {
              return interaction.editReply(`⚠️ ${requestedItemName} is not available for art purchase.`);
            }
            break;

          case 'barter':
            if (!requestedItem.barterOpen && !requestedItem.tradesOpen) {
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
      }
  
      // ------------------- Create Barter Request -------------------
      const fulfillmentId = generateUniqueId('V');
      
      // Store original prices for validation
      let originalTokenPrice = null;
      let originalSellPrice = null;
      if (paymentType === 'tokens') {
        if (isVendorSelfPurchase) {
          const itemDetails = await ItemModel.findOne({ itemName: requestedItemName });
          originalSellPrice = itemDetails?.sellPrice || null;
        } else {
          originalTokenPrice = requestedItem.tokenPrice || null;
        }
      }
      
      const barterData = {
        fulfillmentId,
        userCharacterName: buyer.name,
        vendorCharacterName: shopOwner.name,
        itemName: requestedItem.itemName,
        quantity: quantity,
        paymentMethod: paymentType,
        offeredItem: paymentType === 'barter' ? offeredItemName : null,
        artLink: paymentType === 'art' && artLink ? artLink.trim() : null,
        notes: notes || '',
        buyerId,
        buyerUsername: buyerName,
        date: new Date(),
        // Transaction safety fields
        status: 'pending',
        expiresAt: new Date(Date.now() + FULFILLMENT_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000),
        version: 0,
        // Store if this is a vendor self-purchase
        isVendorSelfPurchase: isVendorSelfPurchase,
        // Store original prices for validation
        originalTokenPrice: originalTokenPrice,
        originalSellPrice: originalSellPrice,
        // Legacy field for backward compatibility
        sellPrice: isVendorSelfPurchase ? originalSellPrice : null
      };
  
      // Save to both MongoDB model and temporary storage
      const fulfillment = new VendingRequest(barterData);
      await fulfillment.save();
      
      // Also save to temporary storage for backward compatibility
      await saveVendingRequestToStorage(fulfillmentId, barterData);
  
      // ------------------- Confirmation Embed -------------------
      // Format payment method with emoji
      const paymentDisplay = paymentType === 'tokens' ? '💰 Tokens' : paymentType === 'art' ? '🎨 Art' : '🔄 Barter';
      
      // Calculate and format price information
      let priceInfo = '';
      let showPriceField = true;
      if (paymentType === 'tokens') {
        let perItemPrice, totalPrice;
        if (isVendorSelfPurchase) {
          // For vendor self-purchase, we already have itemDetails from earlier validation
          const itemDetails = await ItemModel.findOne({ itemName: requestedItemName });
          perItemPrice = itemDetails?.sellPrice || 0;
          totalPrice = perItemPrice * quantity;
        } else {
          perItemPrice = requestedItem.tokenPrice;
          totalPrice = perItemPrice * quantity;
        }
        priceInfo = `**${totalPrice} tokens** (${perItemPrice} per item)`;
      } else if (paymentType === 'art') {
        // For art payments, we'll show price in a separate field below, not in the Price field
        if (requestedItem.artPrice && !artLink) {
          priceInfo = requestedItem.artPrice;
        } else {
          priceInfo = 'Art submission required';
          showPriceField = false; // Don't show price field if we have an art link (will show in separate field)
        }
      } else if (paymentType === 'barter') {
        priceInfo = `Trading: **${offeredItemName}**`;
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`🔄 Barter Request Created`)
        .setDescription(
          `**${buyer.name}** has requested to purchase from **${shopOwner.name}'s** shop.\n\n` +
          `**📋 Vendor Instructions:**\n` +
          `Use \`/vending accept\` with the fulfillment ID below to complete this transaction.`
        )
        .addFields(
          { 
            name: '📦 Requested Item', 
            value: `**${requestedItemName}** × ${quantity}`, 
            inline: true 
          },
          { 
            name: '💱 Payment Method', 
            value: paymentDisplay, 
            inline: true 
          }
        );

      // Add price field only if it should be shown (not for art with link)
      if (showPriceField && priceInfo) {
        embed.addFields({ 
          name: '💵 Price', 
          value: priceInfo, 
          inline: true 
        });
      }

      // Add art link field if artLink is provided (only once, not duplicated)
      if (paymentType === 'art' && artLink) {
        embed.addFields({ 
          name: '🎨 Art Submission', 
          value: `[View Art Submission](${artLink})`, 
          inline: false 
        });
      }

      // Add barter trade information
      if (paymentType === 'barter' && offeredItemName) {
        embed.addFields({ 
          name: '🔄 Offered in Trade', 
          value: `**${offeredItemName}**`, 
          inline: false 
        });
      }
      
      // Add notes if provided
      if (notes) {
        embed.addFields({ 
          name: '📝 Additional Notes', 
          value: notes, 
          inline: false 
        });
      }
      
      // Add fulfillment ID at the end
      embed.addFields({ 
          name: '🪪 Fulfillment ID', 
          value: `</vending accept:1433351189185171462> fulfillmentid: \`${fulfillmentId}\``, 
          inline: false 
        })
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .setFooter({ text: `Buyer: ${buyerName} • Request ID: ${fulfillmentId}` })
        .setColor('#3498db')
        .setTimestamp();
  
      // Notify the shop owner outside the embed
      const shopOwnerMention = `<@${shopOwner.userId}>`;
      const ownerNotification = `${shopOwnerMention} (**${shopOwner.name}**) - **${buyer.name}** is requesting a barter!`;
  
      await interaction.editReply({ 
        content: ownerNotification,
        embeds: [embed] 
      });
  
    } catch (error) {
      console.error("[handleVendingBarter]:", error);
      await interaction.editReply({
        content: "❌ An error occurred while processing the barter request. Please try again later."
      });
    }
}
  
// ------------------- handleFulfill -------------------
async function handleFulfill(interaction) {
    let rollbackActions = []; // Track actions for rollback
    
    try {
      await interaction.deferReply();
  
      const fulfillmentId = interaction.options.getString("fulfillmentid");
      if (!fulfillmentId) {
        return interaction.editReply("⚠️ Please provide a valid `fulfillmentid`.");
      }
  
      // ------------------- Fetch Barter Request -------------------
      let request = await VendingRequest.findOne({ fulfillmentId });
      if (!request) {
        // Try to get from temporary storage as fallback
        const tempRequest = await retrieveVendingRequestFromStorage(fulfillmentId);
        if (!tempRequest) {
          return interaction.editReply(`⚠️ No pending barter request found with ID **${fulfillmentId}**.`);
        }
        // Convert temp request to match MongoDB format (legacy support)
        request = {
          userCharacterName: tempRequest.userCharacterName,
          vendorCharacterName: tempRequest.vendorCharacterName,
          itemName: tempRequest.itemName,
          quantity: tempRequest.quantity,
          paymentMethod: tempRequest.paymentMethod,
          offeredItem: tempRequest.offeredItem,
          artLink: tempRequest.artLink,
          notes: tempRequest.notes,
          buyerId: tempRequest.buyerId,
          buyerUsername: tempRequest.buyerUsername,
          status: 'pending', // Legacy requests default to pending
          expiresAt: new Date(Date.now() + FULFILLMENT_REQUEST_TTL_DAYS * 24 * 60 * 60 * 1000)
        };
      }

      // Check if request is expired
      if (request.expiresAt && new Date() > request.expiresAt) {
        // Mark as expired
        await VendingRequest.updateOne(
          { fulfillmentId },
          { $set: { status: 'expired' } }
        ).catch(() => {}); // Ignore errors on legacy requests
        return interaction.editReply(`⚠️ This request has expired. Please create a new request.`);
      }
  
      const {
        userCharacterName,
        vendorCharacterName,
        itemName,
        quantity,
        paymentMethod,
        offeredItem,
        artLink,
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

      // ------------------- Check if Vendor Self-Purchase -------------------
      const isVendorSelfPurchase = buyer.userId === vendor.userId || request.isVendorSelfPurchase;

      // ------------------- Get Vending Inventory Model -------------------
      const VendingInventory = await getVendingModel(vendor.name);

      // ------------------- Validate Request Status First -------------------
      // Check if request is already processing or completed before doing expensive validation
      if (request.status === 'completed') {
        return interaction.editReply(`❌ **This request has already been completed.**`);
      }
      if (request.status === 'processing') {
        // Check if it's been stuck in processing state for too long (potential stuck state)
        const processingTime = request.processedAt ? Date.now() - new Date(request.processedAt).getTime() : Infinity;
        const STUCK_PROCESSING_THRESHOLD = 5 * 60 * 1000; // 5 minutes
        
        if (processingTime < STUCK_PROCESSING_THRESHOLD) {
          return interaction.editReply(`⚠️ **This request is currently being processed.**\n\nPlease wait a moment and try again, or contact support if this persists.`);
        } else {
          // Reset stuck processing state
          console.warn(`[handleFulfill]: Detected stuck processing state for ${fulfillmentId}, resetting to pending`);
          await VendingRequest.updateOne(
            { fulfillmentId },
            { $set: { status: 'pending' }, $unset: { processedAt: '' } }
          ).catch(() => {});
          // Continue processing below
        }
      }
      if (request.status !== 'pending' && request.status !== 'processing') {
        return interaction.editReply(`❌ **This request has status "${request.status}" and cannot be processed.**`);
      }

      // ------------------- Validate All Conditions (Before Marking as Processing) -------------------
      // Validate while status is still 'pending' to avoid false validation failures
      const validation = await validateFulfillmentRequest(request, buyer, vendor, VendingInventory);
      if (!validation.valid) {
        // Don't mark as processing if validation fails
        return interaction.editReply(`❌ **Validation Failed**\n\n${validation.errors.join('\n')}`);
      }

      // ------------------- Mark Request as Processing (Atomic) -------------------
      // Now that validation passed, atomically mark as processing to prevent duplicate processing
      let processingRequest;
      try {
        processingRequest = await markRequestAsProcessing(fulfillmentId);
      } catch (error) {
        if (error.message.includes('not available for processing')) {
          // Request was processed by another instance between validation and marking
          return interaction.editReply(`⚠️ **Request was already processed.**\n\nThis request was processed by another instance while validation was running.`);
        }
        // Log unexpected errors for debugging
        console.error(`[handleFulfill]: Unexpected error marking request as processing:`, error);
        throw error;
      }

      const stockItem = validation.stockItem;

      // ------------------- Process Transaction -------------------
      // Wrap all critical database operations in a transaction
      await runWithTransaction(async (session) => {
        // ------------------- Handle Token Payment -------------------
        let totalCost = null;
        let perItemPrice = null;
        let buyerTokenBalance = null;
        let vendorTokenBalance = null;

        if (paymentMethod === 'tokens') {
          if (isVendorSelfPurchase) {
            // Vendor buying from own shop - use ROTW SELL price
            const itemDetails = await ItemModel.findOne({ itemName: itemName });
            if (!itemDetails) {
              throw new Error(`Could not find item details for ${itemName}. Vendors cannot purchase custom items from their own shop.`);
            }

            const sellPrice = itemDetails.sellPrice || request.originalSellPrice || request.sellPrice || 0;
            if (sellPrice <= 0) {
              throw new Error(`This item has no sell price set. Vendors cannot purchase items without a sell price from their own shop.`);
            }

            perItemPrice = sellPrice;
            totalCost = sellPrice * quantity;
          } else {
            // Normal buyer - use shop's token price
            if (!stockItem.tokenPrice || stockItem.tokenPrice === null) {
              throw new Error(`This item is not available for token purchase.`);
            }
            perItemPrice = stockItem.tokenPrice;
            totalCost = stockItem.tokenPrice * quantity;
          }

          // Atomically transfer tokens
          buyerTokenBalance = await atomicUpdateTokenBalance(buyerId, -totalCost, session);
          rollbackActions.push({ type: 'token', userId: buyerId, amount: totalCost });
          
          vendorTokenBalance = await atomicUpdateTokenBalance(vendor.userId, totalCost, session);
          rollbackActions.push({ type: 'token', userId: vendor.userId, amount: -totalCost });
        }

        // ------------------- Atomically Update Stock -------------------
        // Note: VendingInventory uses a different connection, so we can't use the transaction session
        // The operation is still atomic via findOneAndUpdate
        await atomicUpdateStockQuantity(VendingInventory, stockItem._id, -quantity, quantity, null);
        rollbackActions.push({ type: 'stock', itemId: stockItem._id, quantity: quantity, VendingInventory });

        // ------------------- Add to Buyer's Inventory -------------------
        const buyerInventory = await getInventoryCollection(buyer.name);
        let itemDetails;
        if (itemName.includes('+')) {
          itemDetails = await ItemModel.findOne({ itemName: itemName });
        } else {
          itemDetails = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') } });
        }
        
        // Note: buyerInventory uses a different connection (inventories), so we can't use the transaction session
        // The operations are still atomic via insertOne/updateOne
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
          rollbackActions.push({ type: 'inventory', buyerInventory, itemName: itemDetails.itemName, quantity });
        } else {
          // fallback: insert minimal record if item details not found
          await buyerInventory.insertOne({
            characterId: buyer._id,
            itemName: itemName,
            quantity: quantity,
            date: new Date(),
            obtain: 'Bought',
          });
          rollbackActions.push({ type: 'inventory', buyerInventory, itemName: itemName, quantity });
        }

        // If this was a barter, remove the offered item from buyer's inventory
        if (paymentMethod === 'barter' && offeredItem) {
          const offeredItemDoc = await buyerInventory.findOne({ 'inventory.name': offeredItem });
          if (offeredItemDoc) {
            await buyerInventory.updateOne(
              { 'inventory.name': offeredItem },
              { $inc: { 'inventory.$.quantity': -1 } }
            );
            rollbackActions.push({ type: 'barter', buyerInventory, itemName: offeredItem });
          }
        }

        // ------------------- Mark Request as Completed -------------------
        await VendingRequest.updateOne(
          { fulfillmentId },
          { 
            $set: { 
              status: 'completed',
              processedAt: new Date()
            }
          },
          { session }
        );

        // Store values for use outside transaction
        request._transactionData = {
          totalCost,
          perItemPrice,
          buyerTokenBalance,
          vendorTokenBalance
        };
      });

      // Extract transaction data
      const { totalCost, perItemPrice } = request._transactionData || {};

      // ------------------- Update Google Sheets (Non-critical, don't fail transaction) -------------------
      // These operations happen after the transaction commits
      // If they fail, the transaction is already complete, so we just log the error
      
      if (paymentMethod === 'tokens' && totalCost !== null) {
        // Log token transaction in buyer's token tracker
        const buyerUser = await User.findOne({ discordId: buyerId });
        if (buyerUser && buyerUser.tokenTracker) {
          try {
            const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
            const purchaseDescription = isVendorSelfPurchase 
              ? `Self-purchase from own shop (ROTW SELL price) - ${itemName} x${quantity}`
              : `Purchase from ${vendor.name} - ${itemName} x${quantity}`;
            const buyerTokenRow = [
              purchaseDescription,
              interactionUrl,
              "vending",
              "spent",
              `-${totalCost}`
            ];
            await retryOperation(
              () => safeAppendDataToSheet(buyerUser.tokenTracker, buyerUser, "loggedTracker!B7:F", [buyerTokenRow], undefined, { skipValidation: true }),
              2,
              'buyer token tracker update'
            );
            console.log(`[vendingHandler.js]: ✅ Logged token transaction to buyer's tracker for user ${buyerId}`);
          } catch (buyerSheetError) {
            console.error(`[vendingHandler.js]: ❌ Error logging to buyer's token tracker:`, buyerSheetError.message);
            // Don't fail the transaction - this is just logging
          }
        }

        // Log token transaction in vendor's token tracker
        const vendorUser = await User.findOne({ discordId: vendor.userId });
        if (vendorUser && vendorUser.tokenTracker) {
          try {
            const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
            const saleDescription = isVendorSelfPurchase 
              ? `Self-purchase from own shop (ROTW SELL price) - ${itemName} x${quantity}`
              : `Sale to ${userCharacterName} - ${itemName} x${quantity}`;
            const vendorTokenRow = [
              saleDescription,
              interactionUrl,
              "vending",
              "earned",
              `+${totalCost}`
            ];
            await retryOperation(
              () => safeAppendDataToSheet(vendorUser.tokenTracker, vendorUser, "loggedTracker!B7:F", [vendorTokenRow], undefined, { skipValidation: true }),
              2,
              'vendor token tracker update'
            );
            console.log(`[vendingHandler.js]: ✅ Logged token transaction to vendor's tracker for user ${vendor.userId}`);
          } catch (vendorSheetError) {
            console.error(`[vendingHandler.js]: ❌ Error logging to vendor's token tracker:`, vendorSheetError.message);
            // Don't fail the transaction - this is just logging
          }
        }
      }
  
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
            
            await retryOperation(
              () => writeSheetData(auth, spreadsheetId, `vendingShop!A${row}:L${row}`, [updateData]),
              2,
              'vendor sheet stock update'
            );

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
            await retryOperation(
              () => appendSheetData(auth, spreadsheetId, 'vendingShop!A:L', transactionRow),
              2,
              'vendor transaction log'
            );
          }
        } catch (sheetError) {
          console.error('[handleFulfill]: Error updating vendor sheet:', sheetError.message);
          // Don't fail the transaction - this is just logging
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
          let itemDetails;
          if (itemName.includes('+')) {
            itemDetails = await ItemModel.findOne({ itemName: itemName });
          } else {
            itemDetails = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') } });
          }
          
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
            await retryOperation(
              () => safeAppendDataToSheet(buyer.inventory, buyer, range, purchaseRow, undefined, { skipValidation: true }),
              2,
              'buyer inventory sheet update'
            );
          } else {
            console.error('[handleFulfill]: Invalid buyer object:', {
              buyer: buyer.name,
              hasInventory: Boolean(buyer.inventory)
            });
          }
        } catch (sheetError) {
          console.error('[handleFulfill]: Error updating buyer sheet:', sheetError.message);
          // Don't fail the transaction - this is just logging
        }
      } else {
        console.error('[handleFulfill]: No inventory link for buyer:', buyer.name);
      }

      // ------------------- Delete from Temporary Storage (Cleanup) -------------------
      // Delete from temporary storage for backward compatibility
      await deleteVendingRequestFromStorage(fulfillmentId).catch(() => {
        // Ignore errors - temporary storage is just for backward compatibility
      });
      
      // ------------------- Confirmation Embed -------------------
      // Format payment method with emoji
      const paymentDisplay = paymentMethod === 'tokens' ? '💰 Tokens' : 
                            paymentMethod === 'art' ? '🎨 Art' : '🔄 Barter';
      
      // Format price information
      let priceInfo = '';
      if (paymentMethod === 'tokens' && totalCost !== null && perItemPrice !== null) {
        priceInfo = `**${totalCost} tokens** (${perItemPrice} per item)`;
      } else if (paymentMethod === 'art' && artLink) {
        priceInfo = `[View Art Submission](${artLink})`;
      } else if (paymentMethod === 'art' && stockItem.artPrice) {
        priceInfo = stockItem.artPrice;
      } else if (paymentMethod === 'barter' && offeredItem) {
        priceInfo = `Trading: **${offeredItem}**`;
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`✅ Barter Fulfilled`)
        .setDescription(
          `**${vendor.name}** has successfully fulfilled a barter request for **${buyer.name}**.\n\n` +
          `The transaction has been completed and items have been transferred.`
        )
        .addFields(
          { 
            name: '📦 Item', 
            value: `**${itemName}** × ${quantity}`, 
            inline: true 
          },
          { 
            name: '👤 Buyer', 
            value: buyer.name, 
            inline: true 
          },
          { 
            name: '🧾 Vendor', 
            value: vendor.name, 
            inline: true 
          },
          { 
            name: '💱 Payment Method', 
            value: paymentDisplay, 
            inline: true 
          },
          { 
            name: '💵 Price', 
            value: priceInfo || 'N/A', 
            inline: true 
          }
        );

      if (paymentMethod === 'art' && artLink) {
        embed.addFields({ 
          name: '🎨 Art Submission', 
          value: `[View Art Submission](${artLink})`, 
          inline: false 
        });
      }

      if (paymentMethod === 'barter' && offeredItem) {
        embed.addFields({ 
          name: '🔄 Traded Item', 
          value: `**${offeredItem}**`, 
          inline: false 
        });
      }

      if (notes) {
        embed.addFields({ 
          name: '📝 Additional Notes', 
          value: notes, 
          inline: false 
        });
      }

      embed.setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .setColor(0x00cc99)
        .setFooter({ text: `Transaction completed successfully` })
        .setTimestamp();
  
      await interaction.editReply({ 
        content: `<@${buyerId}> your barter has been complete!`,
        embeds: [embed] 
      });
  
    } catch (error) {
      console.error("[handleFulfill]:", error);
      
      // Attempt rollback if we have rollback actions
      if (rollbackActions.length > 0) {
        console.error("[handleFulfill]: Attempting rollback...");
        try {
          for (const action of rollbackActions.reverse()) {
            if (action.type === 'token') {
              await atomicUpdateTokenBalance(action.userId, action.amount).catch(e => 
                console.error(`[handleFulfill]: Rollback failed for token ${action.userId}:`, e.message)
              );
            } else if (action.type === 'stock') {
              await action.VendingInventory.updateOne(
                { _id: action.itemId },
                { $inc: { stockQty: action.quantity } }
              ).catch(e => 
                console.error(`[handleFulfill]: Rollback failed for stock ${action.itemId}:`, e.message)
              );
            } else if (action.type === 'inventory') {
              await action.buyerInventory.deleteOne({
                itemName: action.itemName,
                quantity: action.quantity
              }).catch(e => 
                console.error(`[handleFulfill]: Rollback failed for inventory:`, e.message)
              );
            }
          }
        } catch (rollbackError) {
          console.error("[handleFulfill]: Rollback error:", rollbackError);
        }
      }

      // Reset request status if it was marked as processing
      // Only reset if it's actually in processing state (not completed/failed)
      const fulfillmentId = interaction?.options?.getString("fulfillmentid");
      if (fulfillmentId) {
        try {
          const currentRequest = await VendingRequest.findOne({ fulfillmentId });
          if (currentRequest && currentRequest.status === 'processing') {
            // Only reset if it's stuck in processing (not completed)
            await VendingRequest.updateOne(
              { fulfillmentId, status: 'processing' },
              { $set: { status: 'pending' }, $unset: { processedAt: '' } }
            );
            console.log(`[handleFulfill]: Reset request ${fulfillmentId} from processing to pending after error`);
          }
        } catch (resetError) {
          console.error(`[handleFulfill]: Failed to reset request status:`, resetError);
          // Ignore - non-critical
        }
      }

      // Provide user-friendly error message
      let errorMessage = "❌ An error occurred while fulfilling the barter. Please try again later.";
      if (error.message) {
        if (error.message.includes('Insufficient')) {
          errorMessage = `❌ **${error.message}**\n\nPlease check your balance and try again.`;
        } else if (error.message.includes('not available')) {
          errorMessage = `❌ **${error.message}**\n\nThe item may have been removed or is no longer available.`;
        } else if (error.message.includes('Validation Failed') || error.message.includes('Validation')) {
          errorMessage = `❌ **${error.message}**`;
        } else if (error.message.includes('not available for processing') || error.message.includes('already processed')) {
          errorMessage = `❌ **This request cannot be processed.**\n\nIt may have already been processed, expired, or been cancelled.`;
        } else if (error.message.includes('expired')) {
          errorMessage = `❌ **${error.message}**\n\nPlease create a new request.`;
        } else if (error.message.includes('already been completed')) {
          errorMessage = `❌ **This request has already been completed.**`;
        } else {
          // For debugging - log full error message
          console.error(`[handleFulfill]: Unhandled error message:`, error.message);
        }
      }

      await interaction.editReply({
        content: errorMessage
      });
    }
}
  
// ------------------- handlePouchUpgrade -------------------
async function handlePouchUpgrade(interaction) {
  try {
    await interaction.deferReply();

    let characterName = interaction.options.getString('charactername');
    // Extract character name if formatted string was passed (e.g., "John | inariko | shopkeeper" -> "John")
    if (characterName && characterName.includes('|')) {
      characterName = characterName.split('|')[0].trim();
    }
    
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
      .setCustomId(`confirm_pouch_upgrade_${userId}_${characterName}_${newPouchType}`)
      .setLabel('Confirm')
      .setStyle(ButtonStyle.Success);

    const cancelButton = new ButtonBuilder()
      .setCustomId(`cancel_pouch_upgrade_${userId}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder()
      .addComponents(confirmButton, cancelButton);

    const confirmEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('🛍️ Confirm Pouch Upgrade')
      .setDescription(`Are you sure you want to upgrade **${characterName}'s** shop pouch?`)
      .addFields(
        { name: '__Current Pouch__', value: `> **${currentPouch.toUpperCase()}** (${pouchTiers[currentPouch].slots} slots)`, inline: true },
        { name: '__New Pouch__', value: `> **${newPouchType.toUpperCase()}** (${pouchTiers[newPouchType].slots} slots)`, inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: '__Upgrade Cost__', value: `> 💰 **${upgradeCost.toLocaleString()} tokens**`, inline: true },
        { name: '__Your Balance__', value: `> 💰 **${userTokens.toLocaleString()} tokens**`, inline: true },
        { name: '__Balance After__', value: `> 💰 **${(userTokens - upgradeCost).toLocaleString()} tokens**`, inline: true }
      )
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
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
    // Parse customId: confirm_pouch_upgrade_{userId}_{characterName}_{newPouchType}
    // Handle character names that might contain underscores
    const parts = interaction.customId.split('_');
    if (parts.length < 6) {
      return interaction.update({
        content: '❌ Invalid upgrade request. Please try the upgrade command again.',
        embeds: [],
        components: []
      });
    }
    
    // Extract userId from customId (4th part, index 3)
    const originalUserId = parts[3];
    const currentUserId = interaction.user.id;
    
    // Verify that only the original user can click the button
    if (originalUserId !== currentUserId) {
      return interaction.reply({
        content: '❌ Only the user who initiated this upgrade can confirm it.',
        ephemeral: true
      });
    }
    
    // Get the last part as newPouchType and everything between userId and newPouchType as characterName
    const newPouchType = parts[parts.length - 1];
    const characterName = parts.slice(4, -1).join('_'); // Join all parts between userId and the last one
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
          pouchSize: pouchTiers[newPouchType].slots,
          'vendingSetup.pouchType': newPouchType
        }
      }
    );

    // ------------------- Success Response -------------------
    const successEmbed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('✅ Pouch Upgrade Successful!')
      .setDescription(`**${characterName}'s** shop pouch has been successfully upgraded!`)
      .addFields(
        { name: '__New Pouch Tier__', value: `> **${newPouchType.toUpperCase()}**`, inline: true },
        { name: '__New Slot Capacity__', value: `> **${pouchTiers[newPouchType].slots} slots**`, inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: '__Tokens Spent__', value: `> 💰 **${upgradeCost.toLocaleString()} tokens**`, inline: true },
        { name: '__Remaining Tokens__', value: `> 💰 **${(userTokens - upgradeCost).toLocaleString()} tokens**`, inline: true }
      )
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setFooter({ text: `Upgrade completed successfully!` });

    await interaction.update({
      embeds: [successEmbed],
      components: []
    });

  } catch (error) {
    console.error('[handlePouchUpgradeConfirm]: Error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.update({
        content: '❌ An error occurred while processing the upgrade. Please try again.',
        embeds: [],
        components: []
      });
    } else {
      await interaction.followUp({
        content: '❌ An error occurred while processing the upgrade. Please try again.',
        ephemeral: true
      });
    }
  }
}

// ------------------- handlePouchUpgradeCancel -------------------
async function handlePouchUpgradeCancel(interaction) {
  try {
    // Parse customId: cancel_pouch_upgrade_{userId}
    const parts = interaction.customId.split('_');
    if (parts.length < 4) {
      return interaction.reply({
        content: '❌ Invalid cancel request.',
        ephemeral: true
      });
    }
    
    // Extract userId from customId (4th part, index 3)
    const originalUserId = parts[3];
    const currentUserId = interaction.user.id;
    
    // Verify that only the original user can click the button
    if (originalUserId !== currentUserId) {
      return interaction.reply({
        content: '❌ Only the user who initiated this upgrade can cancel it.',
        ephemeral: true
      });
    }
    
    const cancelEmbed = new EmbedBuilder()
      .setColor('#FF6B6B')
      .setTitle('❌ Pouch Upgrade Cancelled')
      .setDescription('The pouch upgrade has been cancelled.')
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

    await interaction.update({
      embeds: [cancelEmbed],
      components: []
    });
  } catch (error) {
    console.error('[handlePouchUpgradeCancel]: Error:', error);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.update({
          content: '❌ An error occurred while cancelling the upgrade.',
          embeds: [],
          components: []
        });
      }
    } catch (replyError) {
      console.error('[handlePouchUpgradeCancel]: Failed to send error response:', replyError);
    }
  }
}

// ------------------- handleViewShop -------------------
async function handleViewShop(interaction) {
  try {
    let characterName = interaction.options.getString('charactername');
    
    // Extract character name if formatted string was passed (e.g., "John | inariko | shopkeeper" -> "John")
    if (characterName && characterName.includes('|')) {
      characterName = characterName.split('|')[0].trim();
    }
    
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

    // Filter out items with zero stock and sort by slot
    const availableItems = items
      .filter(item => item.stockQty > 0)
      .sort((a, b) => {
        // Extract slot numbers for sorting
        const aNum = parseInt(a.slot?.match(/\d+/)?.[0] || '0', 10);
        const bNum = parseInt(b.slot?.match(/\d+/)?.[0] || '0', 10);
        return aNum - bNum;
      });

    if (!availableItems || availableItems.length === 0) {
      return await interaction.reply({
        content: `⚠️ No items currently available in ${characterName}'s vending inventory.`
      });
    }

    // Get item emojis for all items
    const itemEmojis = new Map();
    for (const item of availableItems) {
      if (!itemEmojis.has(item.itemName)) {
        const itemDetails = await ItemModel.findOne({ itemName: item.itemName }).select('emoji');
        itemEmojis.set(item.itemName, itemDetails?.emoji || '🔹');
      }
    }

    // Get village color
    const villageColor = character.homeVillage 
      ? getVillageColorByName(capitalizeFirstLetter(character.homeVillage))
      : '#7289DA';

    // Create shop embed
    const shopEmbed = new EmbedBuilder()
      .setTitle(`🛒 ${characterName}'s Shop`)
      .setDescription(`Browse available items below!`)
      .setColor(villageColor)
      .setAuthor({
        name: `${characterName} 🔗`,
        iconURL: character.icon || undefined,
        url: character.inventory || undefined
      })
      .setThumbnail(character.icon || null)
      .setImage(character.vendingSetup?.shopImage || character.shopImage || VIEW_SHOP_IMAGE_URL)
      .setTimestamp();

    // Add vending points to embed
    shopEmbed.addFields({
      name: '🪙 Vending Points',
      value: `**${(character.vendingPoints || 0).toLocaleString()}** points`,
      inline: true
    });

    // Add item count
    shopEmbed.addFields({
      name: '📦 Items Available',
      value: `**${availableItems.length}** item${availableItems.length !== 1 ? 's' : ''}`,
      inline: true
    });

    // Format items in a cleaner way
    const itemDescriptions = [];
    for (const item of availableItems) {
      const emoji = itemEmojis.get(item.itemName);
      const slotInfo = item.slot ? `**${item.slot}** • ` : '';
      
      // Build price string - only show set prices
      const prices = [];
      if (item.tokenPrice !== null && item.tokenPrice !== undefined) {
        prices.push(`💰 **${item.tokenPrice}** tokens`);
      }
      if (item.artPrice && item.artPrice.trim() !== '') {
        prices.push(`🎨 ${item.artPrice}`);
      }
      if (item.otherPrice && item.otherPrice.trim() !== '') {
        prices.push(`📝 ${item.otherPrice}`);
      }
      const priceText = prices.length > 0 ? prices.join(' • ') : '💰 No prices set';
      
      // Build item description
      let itemText = `${emoji} **${item.itemName}**\n`;
      itemText += `${slotInfo}Stock: **${item.stockQty}**`;
      if (item.costEach > 0) {
        itemText += ` • Cost: **${item.costEach}** pts`;
      }
      itemText += `\n${priceText}`;
      if (item.barterOpen) {
        itemText += `\n🔄 **Barter Open**`;
      }
      
      itemDescriptions.push(itemText);
    }

    // Split items into chunks to avoid embed field limits
    // Discord embed field value limit is 1024 characters
    const maxFieldLength = 1000;
    let currentField = '';
    const fields = [];

    for (const itemDesc of itemDescriptions) {
      if (currentField.length + itemDesc.length + 2 > maxFieldLength && currentField.length > 0) {
        fields.push(currentField.trim());
        currentField = itemDesc;
      } else {
        currentField += (currentField ? '\n\n' : '') + itemDesc;
      }
    }
    if (currentField.length > 0) {
      fields.push(currentField.trim());
    }

    // Add item fields
    fields.forEach((fieldContent, index) => {
      shopEmbed.addFields({
        name: index === 0 ? '🛍️ Shop Inventory' : '🛍️ Shop Inventory (continued)',
        value: fieldContent,
        inline: false
      });
    });

    // Add footer
    shopEmbed.setFooter({ 
      text: `Vending Shop • ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
      iconURL: character.icon || undefined
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
    try {
        const userId = interaction.user.id;
        
        // Fetch all user's characters
        const characters = await Character.find({ userId }).lean();
        
        // Filter for vendor characters (Shopkeeper or Merchant)
        const vendorCharacters = characters.filter(char => {
            const job = char.job?.toLowerCase();
            const vendorType = char.vendorType?.toLowerCase();
            return (job === 'shopkeeper' || job === 'merchant') || 
                   (vendorType === 'shopkeeper' || vendorType === 'merchant');
        });
        
        // Create embed
        const embed = new EmbedBuilder()
            .setTitle('🎪 Vending Shop Setup')
            .setDescription('Set up and manage your vending shops on the dashboard!')
            .setColor('#00FF00')
            .setImage(DEFAULT_IMAGE_URL)
            .setTimestamp();
        
        if (vendorCharacters.length === 0) {
            embed.addFields({
                name: '⚠️ No Vendor Characters',
                value: 'You don\'t have any characters set up as Shopkeepers or Merchants. Characters need to be Shopkeepers or Merchants to manage vending shops.',
                inline: false
            });
        } else {
            // Group characters by setup status
            const setupCharacters = [];
            const notSetupCharacters = [];
            
            vendorCharacters.forEach(char => {
                const isSetup = char.vendingSetup?.shopLink || char.shopLink;
                const vendorType = char.vendorType || char.job || 'Unknown';
                const pouchType = char.vendingSetup?.pouchType || char.shopPouch || 'None';
                const vendingPoints = char.vendingPoints || 0;
                
                const charInfo = {
                    name: char.name,
                    vendorType: capitalizeFirstLetter(vendorType),
                    pouchType: capitalizeFirstLetter(pouchType),
                    vendingPoints,
                    isSetup
                };
                
                if (isSetup) {
                    setupCharacters.push(charInfo);
                } else {
                    notSetupCharacters.push(charInfo);
                }
            });
            
            // Add setup characters
            if (setupCharacters.length > 0) {
                let setupValue = '';
                setupCharacters.forEach(char => {
                    setupValue += `**${char.name}** (${char.vendorType})\n`;
                    setupValue += `• Pouch: ${char.pouchType}\n`;
                    setupValue += `• Points: ${char.vendingPoints}\n`;
                    setupValue += `• Status: ✅ Set Up\n\n`;
                });
                embed.addFields({
                    name: `✅ Set Up Shops (${setupCharacters.length})`,
                    value: setupValue || 'None',
                    inline: false
                });
            }
            
            // Add not setup characters
            if (notSetupCharacters.length > 0) {
                let notSetupValue = '';
                notSetupCharacters.forEach(char => {
                    notSetupValue += `**${char.name}** (${char.vendorType})\n`;
                    notSetupValue += `• Status: ⚠️ Not Set Up\n\n`;
                });
                embed.addFields({
                    name: `⚠️ Needs Setup (${notSetupCharacters.length})`,
                    value: notSetupValue || 'None',
                    inline: false
                });
            }
        }
        
        // Add dashboard link
        embed.addFields({
            name: '🔗 Dashboard Link',
            value: `[Click here to set up vending!](https://tinglebot.xyz/#vending-section)`,
            inline: false
        });
        
        // Create button to open dashboard
        const dashboardButton = new ButtonBuilder()
            .setLabel('Open Vending Dashboard')
            .setStyle(ButtonStyle.Link)
            .setURL('https://tinglebot.xyz/#vending-section')
            .setEmoji('🖥️');
        
        const buttonRow = new ActionRowBuilder()
            .addComponents(dashboardButton);
        
        return interaction.reply({
            embeds: [embed],
            components: [buttonRow]
        });
    } catch (error) {
        console.error('[handleVendingSetup]: Error:', error);
        return interaction.reply({
            content: '❌ An error occurred while fetching your vendor characters. Please try again later.',
            ephemeral: true
        });
    }
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
    const slotConflicts = new Map(); // Track slot conflicts

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
        
        // Check for slot conflicts
        if (usedSlots.has(slot)) {
          const conflictingItem = slotConflicts.get(slot);
          errors.push(`Slot conflict: Slot ${slot} is already used by ${conflictingItem}. Cannot add ${row.itemName} to the same slot.`);
          continue;
        }
        
        usedSlots.add(slot);
        slotConflicts.set(slot, row.itemName);
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

    let characterName = interaction.options.getString('charactername');
    // Extract character name if formatted string was passed (e.g., "John | inariko | shopkeeper" -> "John")
    if (characterName && characterName.includes('|')) {
      characterName = characterName.split('|')[0].trim();
    }
    
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

    // Validate character has a shop setup (check for dashboard setup method)
    if (!character.vendingSetup?.setupDate) {
      return interaction.editReply({
        content: `❌ ${characterName} doesn't have a shop set up yet. Use \`/vending setup\` first.`,
        ephemeral: true
      });
    }

    switch (action) {
      case 'item': {
        const slot = interaction.options.getString('slot');
        if (!slot) {
          return interaction.editReply({
            content: '❌ Slot is required for item editing.',
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

        // Update item in vending inventory by slot
        const VendingInventory = await getVendingModel(characterName);
        const existingItem = await VendingInventory.findOne({ slot });
        
        if (!existingItem) {
          return interaction.editReply({
            content: `❌ No item found in slot "${slot}".`,
            ephemeral: true
          });
        }

        const itemName = existingItem.itemName;

        // Track what fields are being updated
        const updateFields = {};
        const updatedFieldsList = [];
        
        if (tokenPrice !== null) {
          updateFields.tokenPrice = tokenPrice;
          updatedFieldsList.push(`💰 Token Price: ${tokenPrice}`);
        }
        if (artPrice) {
          updateFields.artPrice = artPrice;
          updatedFieldsList.push(`🎨 Art Price: ${artPrice}`);
        }
        if (otherPrice) {
          updateFields.otherPrice = otherPrice;
          updatedFieldsList.push(`📝 Other Price: ${otherPrice}`);
        }

        await VendingInventory.updateOne(
          { slot },
          { $set: updateFields }
        );

        // Get updated item and item emoji
        const updatedItem = await VendingInventory.findOne({ slot });
        const itemDetails = await ItemModel.findOne({ itemName }).select('emoji');
        const itemEmoji = itemDetails?.emoji || '🔹';

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

        // Get village color for embed
        const villageColor = character.homeVillage 
          ? getVillageColorByName(capitalizeFirstLetter(character.homeVillage))
          : '#7289DA';

        // Create embed showing what was updated - prominently show the slot being edited
        const embed = new EmbedBuilder()
          .setTitle(`📝 Slot Updated`)
          .setDescription(`**${characterName}** has updated **${updatedItem.slot || 'Unknown Slot'}**!`)
          .setColor(villageColor)
          .setAuthor({
            name: `${characterName} 🔗`,
            iconURL: character.icon || undefined,
            url: character.inventory || undefined
          })
          .setThumbnail(character.icon || null)
          .addFields(
            {
              name: `📍 Slot`,
              value: `**${updatedItem.slot || 'Not set'}**`,
              inline: false
            },
            {
              name: `${itemEmoji} Item`,
              value: `**${itemName}**`,
              inline: true
            },
            {
              name: '📦 Stock',
              value: `**${updatedItem.stockQty || 0}** in stock`,
              inline: true
            },
            {
              name: '📋 Updated Fields',
              value: updatedFieldsList.length > 0 ? updatedFieldsList.join('\n') : 'No fields updated',
              inline: false
            },
            {
              name: '💰 Current Prices',
              value: `**Token:** ${updatedItem.tokenPrice || 'Not set'}\n**Art:** ${updatedItem.artPrice || 'Not set'}\n**Other:** ${updatedItem.otherPrice || 'Not set'}`,
              inline: true
            },
            {
              name: '🔄 Barter Status',
              value: `${updatedItem.barterOpen ? '✅ Open' : '❌ Closed'}`,
              inline: true
            }
          )
          .setImage(DEFAULT_IMAGE_URL)
          .setFooter({ 
            text: `Vending Shop • ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`,
            iconURL: character.icon || undefined
          })
          .setTimestamp();

        await interaction.editReply({
          embeds: [embed],
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
      let characterName = interaction.options.getString('charactername');
      // Extract character name if formatted string was passed (e.g., "John | inariko | shopkeeper" -> "John")
      if (characterName && characterName.includes('|')) {
        characterName = characterName.split('|')[0].trim();
      }
      
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

    // Get current month name
    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long' });

    // ----- Determine per-village settings -----
    const villageSettings = {
      rudania: {
        emoji: '<:rudania:899492917452890142>',
        color: '#d93e3e'
      },
      inariko: {
        emoji: '<:inariko:899493009073274920>',
        color: '#3e7ed9'
      },
      vhintl: {
        emoji: '<:vhintl:899492879205007450>',
        color: '#3ed96a'
      },
      limited: {
        emoji: '🎁',
        color: '#00d6d6'
      }
    };

    const settings = villageSettings[villageKey] || {
      emoji: '🏘️',
      color: '#f4c542'
    };

    const embed = new EmbedBuilder()
      .setTitle(`${settings.emoji} Vending Stock — ${villageKey[0].toUpperCase() + villageKey.slice(1)} — ${monthName}`)
      .setColor(settings.color)
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

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

// ------------------- cleanupExpiredVendingRequests -------------------
// Cleans up expired vending requests (should be called periodically)
async function cleanupExpiredVendingRequests() {
  try {
    const expiredCount = await VendingRequest.updateMany(
      {
        status: { $in: ['pending', 'processing'] },
        expiresAt: { $lt: new Date() }
      },
      {
        $set: { status: 'expired' }
      }
    );
    
    if (expiredCount.modifiedCount > 0) {
      console.log(`[vendingHandler.js]: Cleaned up ${expiredCount.modifiedCount} expired vending requests`);
    }
    
    return expiredCount.modifiedCount;
  } catch (error) {
    console.error('[vendingHandler.js]: Error cleaning up expired requests:', error);
    return 0;
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
    const [_, action, ...parts] = interaction.customId.split('_');
    
    // Extract user ID from the custom ID
    const userId = parts[parts.length - 1];
    
    // Check if the user is authorized to use these buttons
    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: '❌ Only the shop owner can use these buttons.',
        ephemeral: true
      });
      return;
    }
    
    if (action === 'sync' && parts[0] === 'later') {
      await interaction.update({
        content: '🔄 Syncing cancelled. Please use `/vending setup` again when you are ready to sync and set up your vending character.',
        embeds: [],
        components: []
      });
      return;
    }

    // Extract character name correctly by removing user ID
    const characterName = parts.slice(0, -1).join('_');
    
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

// ------------------- handleAddPersonalItem -------------------
// Helper function to add items from personal inventory to shop.
// Personal items are marked as isPersonalItem: true and cannot be removed without purchase.
async function handleAddPersonalItem(characterName, itemName, quantity, slot, tokenPrice, artPrice, otherPrice, barterOpen) {
  try {
    const character = await fetchCharacterByName(characterName);
    if (!character) {
      throw new Error(`Character ${characterName} not found`);
    }

    // Validate vendor job
    const job = character.job?.toLowerCase();
    if (job !== 'shopkeeper' && job !== 'merchant') {
      throw new Error(`${characterName} must be a Shopkeeper or Merchant to add items to shop.`);
    }

    // Get vending collection
    const vendCollection = await getVendingCollection(characterName);

    // Check if item exists in personal inventory (this would be called from inventory context)
    // For now, we'll just mark it as a personal item when adding

    // Price validation
    const priceItem = {
      tokenPrice: tokenPrice !== null && tokenPrice !== undefined ? tokenPrice : null,
      artPrice: artPrice && artPrice.trim() !== '' ? artPrice : null,
      otherPrice: otherPrice && otherPrice.trim() !== '' ? otherPrice : null,
      barterOpen: barterOpen
    };

    const priceValidation = validateVendingPrices(priceItem);
    if (priceValidation.length > 0) {
      throw new Error(`Price validation failed: ${priceValidation.join(', ')}`);
    }

    // Try to get item details (may not exist for custom items)
    const itemDetails = await ItemModel.findOne({ itemName });
    const isCustomItem = !itemDetails;

    // Check slot limits
    const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
    const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
    const baseSlots = baseSlotLimits[job] || 0;
    const extraSlots = pouchCapacities[character.shopPouch?.toLowerCase()] || 0;
    const totalSlots = baseSlots + extraSlots;

    // Validate slot
    const slotNumber = parseInt(slot.replace(/[^0-9]/g, ''));
    if (isNaN(slotNumber) || slotNumber < 1 || slotNumber > totalSlots) {
      throw new Error(`Invalid slot number. You have ${totalSlots} total slots available.`);
    }

    // Check if slot is available
    const existingItem = await vendCollection.findOne({ 
      slot: slot,
      itemName: { $ne: itemName }
    });
    if (existingItem) {
      throw new Error(`Slot ${slot} is already occupied by ${existingItem.itemName}.`);
    }

    // Check if item already exists in this slot
    const existingSameItem = await vendCollection.findOne({
      itemName,
      slot: slot
    });

    if (existingSameItem) {
      // Update existing item
      await vendCollection.updateOne(
        { _id: existingSameItem._id },
        {
          $inc: { stockQty: quantity },
          $set: {
            tokenPrice: tokenPrice !== null && tokenPrice !== undefined ? tokenPrice : existingSameItem.tokenPrice,
            artPrice: artPrice && artPrice.trim() !== '' ? artPrice : existingSameItem.artPrice,
            otherPrice: otherPrice && otherPrice.trim() !== '' ? otherPrice : existingSameItem.otherPrice,
            barterOpen: barterOpen !== undefined ? barterOpen : existingSameItem.barterOpen,
            tradesOpen: barterOpen !== undefined ? barterOpen : existingSameItem.tradesOpen
          }
        }
      );
    } else {
      // Insert new personal item
      await vendCollection.insertOne({
        characterName: characterName,
        itemName,
        itemId: itemDetails ? itemDetails._id : null,
        stockQty: quantity,
        costEach: 0, // Personal items don't cost vending points
        pointsSpent: 0, // Personal items don't cost vending points
        tokenPrice: tokenPrice !== null && tokenPrice !== undefined ? tokenPrice : null,
        artPrice: artPrice && artPrice.trim() !== '' ? artPrice : null,
        otherPrice: otherPrice && otherPrice.trim() !== '' ? otherPrice : null,
        barterOpen: barterOpen,
        tradesOpen: barterOpen, // Legacy compatibility
        boughtFrom: character.currentVillage,
        slot: slot,
        date: new Date(),
        // Mark as personal item
        isPersonalItem: true,
        source: 'personal_inventory',
        isCustomItem: isCustomItem,
        customItemData: isCustomItem ? { name: itemName } : null
      });
    }

    return { success: true, message: `Successfully added ${quantity}x ${itemName} to shop as personal item.` };
  } catch (error) {
    console.error('[handleAddPersonalItem]: Error:', error);
    throw error;
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
    handlePouchUpgradeConfirm,
    handlePouchUpgradeCancel,
    handleVendingSetup,
    handleViewShop,
    handleShopLink,
    viewVendingStock,
    handleVendingViewVillage,
    handleSyncButton,
    handleAddPersonalItem,
    cleanupExpiredVendingRequests
};