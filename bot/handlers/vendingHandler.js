// ============================================================================
// ------------------- Vending Handler Blueprint -------------------
// Handles all /vending subcommands for barter, restock, fulfill, etc.
// ============================================================================

// ------------------- Standard Libraries -------------------
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require("mongodb");
const mongoose = require('mongoose');
const dbConfig = require('@/config/database');
const { generateUniqueId } = require('@/utils/uniqueIdUtils.js');



// ------------------- Discord.js Components -------------------
const {
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle
} = require('discord.js');

// ------------------- Database Models -------------------
const { VendingRequest, initializeVendingInventoryModel } = require('@/models/VendingModel.js');
const Character = require('@/models/CharacterModel.js');
const ItemModel = require('@/models/ItemModel.js');
const User = require('@/models/UserModel.js');

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
  addItemToInventory,
  VILLAGE_BANNERS
} = require('@/database/db.js');

// ------------------- Utility Functions -------------------
// Google Sheets functionality removed

const {
  addItemToVendingInventory,
  escapeRegExp,
  logItemAcquisitionToDatabase,
  logItemRemovalToDatabase
} = require('@/utils/inventoryUtils.js');

const {
  retrieveVendingRequestFromStorage,
  deleteVendingRequestFromStorage,
  saveVendingRequestToStorage,
  retrieveAllVendingRequests
} = require('@/utils/storage.js');
const { handleError } = require('@/utils/globalErrorHandler.js');
const { uploadSubmissionImage } = require('@/utils/uploadUtils.js');

const {
  capitalizeFirstLetter
 } = require("../modules/formattingModule.js");

 const { createVendingSetupInstructionsEmbed } = require("../embeds/embeds.js");

// ------------------- Validation Functions -------------------
const {
  validateVendingItem,
  validateVendingPrices,
  validateVendingLocation
} = require('@/utils/validation.js');

// ------------------- Vending Model Helper -------------------
async function getVendingModel(characterName) {
  return await initializeVendingInventoryModel(characterName);
}

// ------------------- calculateSlotsUsed -------------------
// Calculates the total number of slots actually used in a vendor shop
// Stackable items: ceil(quantity / 10) slots per stack
// Non-stackable items: 1 slot per item
async function calculateSlotsUsed(vendCollection) {
  const allItems = await vendCollection.find({}).toArray();
  let totalSlotsUsed = 0;
  
  for (const item of allItems) {
    // Get item details to determine if stackable
    const itemDetails = item.itemId ? await ItemModel.findById(item.itemId) : null;
    
    if (itemDetails) {
      const isStackable = itemDetails.stackable || false;
      const maxStackSize = itemDetails.maxStackSize || 10;
      
      if (isStackable) {
        // Stackable items: calculate slots needed (max 10 per slot)
        totalSlotsUsed += Math.ceil((item.stockQty || 0) / maxStackSize);
      } else {
        // Non-stackable items: each item takes 1 slot
        totalSlotsUsed += (item.stockQty || 0);
      }
    } else {
      // Custom items or items without details - treat as non-stackable
      totalSlotsUsed += (item.stockQty || 0);
    }
  }
  
  return totalSlotsUsed;
}

// ------------------- Constants -------------------
const DEFAULT_IMAGE_URL = "https://storage.googleapis.com/tinglebot/Graphics/border.png";
const MONTHLY_VENDING_POINTS = 500;
const VIEW_SHOP_IMAGE_URL = DEFAULT_IMAGE_URL;
const FULFILLMENT_REQUEST_TTL_DAYS = 7; // Request expires after 7 days
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY_MS = 100; // Initial delay for exponential backoff

// ------------------- Embed Color Constants -------------------
const EMBED_COLORS = {
  SUCCESS: '#00FF00',
  ERROR: '#FF0000',
  WARNING: '#FFA500',
  INFO: '#3498db',
  BARTER: '#3498db',
  FULFILL: '#00cc99',
  SHOP: '#00FF00',
  STOCK: {
    rudania: '#d93e3e',
    inariko: '#3e7ed9',
    vhintl: '#3ed96a',
    limited: '#00d6d6'
  }
};

// ============================================================================
// ------------------- Embed Helper Functions -------------------
// ============================================================================

// ------------------- createVendingEmbed -------------------
// Main helper for creating standardized vending embeds
function createVendingEmbed(type, options = {}) {
  const {
    title,
    description,
    fields = [],
    color,
    thumbnail,
    image,
    footer,
    character,
    timestamp = true
  } = options;

  // Determine color based on type
  let embedColor = color;
  if (!embedColor) {
    switch (type) {
      case 'success':
        embedColor = EMBED_COLORS.SUCCESS;
        break;
      case 'error':
        embedColor = EMBED_COLORS.ERROR;
        break;
      case 'warning':
        embedColor = EMBED_COLORS.WARNING;
        break;
      case 'info':
        embedColor = EMBED_COLORS.INFO;
        break;
      case 'barter':
        embedColor = EMBED_COLORS.BARTER;
        break;
      case 'fulfill':
        embedColor = EMBED_COLORS.FULFILL;
        break;
      case 'shop':
        embedColor = EMBED_COLORS.SHOP;
        break;
      default:
        embedColor = EMBED_COLORS.INFO;
    }
  }

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setImage(image || DEFAULT_IMAGE_URL);

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (timestamp) embed.setTimestamp();
  if (footer) embed.setFooter({ text: footer });

  // Add character author info if provided
  if (character && character.name) {
    embed.setAuthor({
      name: `${character.name}${character.job ? ` the ${character.job.charAt(0).toUpperCase() + character.job.slice(1).toLowerCase()}` : ''}`,
      iconURL: character.icon || undefined
    });
  }

  // Add fields
  if (fields && fields.length > 0) {
    embed.addFields(fields);
  }

  return embed;
}

// ------------------- createErrorEmbed -------------------
// Shorthand for creating error embeds
function createErrorEmbed(title, description, fields = []) {
  return createVendingEmbed('error', {
    title: title || '❌ Error',
    description,
    fields
  });
}

// ------------------- createValidationErrorEmbed -------------------
// Creates an embed for validation errors with clear explanations and steps to fix
function createValidationErrorEmbed(errors, fulfillmentId) {
  const fields = [];
  
  // Process each error and create helpful messages
  errors.forEach((error, idx) => {
    let errorTitle = `Issue ${idx + 1}`;
    let errorDescription = error;
    let steps = [];
    
    // Handle price change errors specifically
    if (error.includes('Item price has changed')) {
      errorTitle = '💰 Price Changed';
      const priceMatch = error.match(/Original: ([\d,]+), Current: ([\d,]+)/);
      if (priceMatch) {
        const originalPrice = priceMatch[1];
        const currentPrice = priceMatch[2];
        errorDescription = `The item's price has changed since you created this purchase request.\n\n**Original Price:** ${originalPrice}\n**Current Price:** ${currentPrice}`;
        steps = [
          `1. Cancel this purchase request using \`/vending cancel fulfillmentid: ${fulfillmentId}\``,
          '2. Check the current price using `/vending viewshop`',
          '3. Create a new purchase request with the updated price'
        ];
      } else {
        // Fallback if regex doesn't match - still provide helpful message
        errorDescription = error;
        steps = [
          `1. Cancel this purchase request using \`/vending cancel fulfillmentid: ${fulfillmentId}\``,
          '2. Check the current price using `/vending viewshop`',
          '3. Create a new purchase request with the updated price'
        ];
      }
    } else if (error.includes('Request has expired')) {
      errorTitle = '⏰ Request Expired';
      errorDescription = 'This purchase request has expired and can no longer be fulfilled.';
      steps = [
        '1. Create a new purchase request using `/vending purchase`',
        '2. Complete the purchase within the time limit'
      ];
    } else if (error.includes('already been completed')) {
      errorTitle = '✅ Already Completed';
      errorDescription = 'This purchase request has already been completed.';
      steps = [
        '1. Check your inventory to confirm you received the items',
        '2. If you need to purchase more, create a new request using `/vending purchase`'
      ];
    } else if (error.includes('currently being processed')) {
      errorTitle = '⏳ Already Processing';
      errorDescription = 'This purchase request is currently being processed by another action.';
      steps = [
        '1. Wait a moment and try again',
        '2. If the issue persists, cancel and recreate the request'
      ];
    } else if (error.includes('no longer available')) {
      errorTitle = '📦 Item Unavailable';
      errorDescription = error;
      steps = [
        '1. Check the vendor\'s shop using `/vending viewshop`',
        '2. The item may have been removed or sold out',
        '3. Contact the vendor if you believe this is an error'
      ];
    } else if (error.includes('Insufficient stock')) {
      errorTitle = '📉 Insufficient Stock';
      errorDescription = error;
      steps = [
        '1. Check the vendor\'s shop using `/vending viewshop`',
        '2. Reduce the quantity in your purchase request',
        '3. Or wait for the vendor to restock'
      ];
    } else if (error.includes('Insufficient tokens')) {
      errorTitle = '🪙 Insufficient Tokens';
      errorDescription = error;
      steps = [
        '1. Check your token balance',
        '2. Earn more tokens or reduce the quantity',
        '3. Create a new purchase request with sufficient tokens'
      ];
    } else if (error.includes('not found')) {
      errorTitle = '👤 Character Not Found';
      errorDescription = error;
      steps = [
        '1. Verify the character name is correct',
        '2. The character may have been deleted',
        '3. Contact support if you believe this is an error'
      ];
    } else if (error.includes('Location')) {
      errorTitle = '📍 Location Restriction';
      errorDescription = error;
      steps = [
        '1. Travel to the same village as the vendor',
        '2. Use `/travel` to move to the correct location',
        '3. Then try the purchase again'
      ];
    }
    
    fields.push({
      name: errorTitle,
      value: errorDescription + (steps.length > 0 ? '\n\n**How to Fix:**\n' + steps.join('\n') : ''),
      inline: false
    });
  });
  
  return createErrorEmbed(
    '❌ Validation Failed',
    'The purchase request could not be completed due to the following issues:',
    [
      ...fields,
      {
        name: '🆔 Fulfillment ID',
        value: `\`${fulfillmentId}\``,
        inline: true
      },
      {
        name: '💡 Command',
        value: `\`/vending accept fulfillmentid: ${fulfillmentId}\``,
        inline: true
      }
    ]
  );
}

// ------------------- createSuccessEmbed -------------------
// Shorthand for creating success embeds
function createSuccessEmbed(title, description, fields = []) {
  return createVendingEmbed('success', {
    title: title || '✅ Success',
    description,
    fields
  });
}

// ------------------- createInfoEmbed -------------------
// Shorthand for creating info embeds
function createInfoEmbed(title, description, fields = []) {
  return createVendingEmbed('info', {
    title: title || 'ℹ️ Information',
    description,
    fields
  });
}

// ------------------- createWarningEmbed -------------------
// Shorthand for creating warning embeds
function createWarningEmbed(title, description, fields = []) {
  return createVendingEmbed('warning', {
    title: title || '⚠️ Warning',
    description,
    fields
  });
}

// ============================================================================
// ------------------- Transaction & Atomic Operation Helpers -------------------
// These functions provide transaction safety, atomic operations, and retry logic
// ============================================================================

// ------------------- runWithTransaction -------------------
// Wraps operations in a MongoDB transaction with retry logic
// Uses mongoose connection (for Character and other mongoose models)
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
      
      // Check if this is a retryable error
      const isRetryable = 
        error.code === 40 || // ConflictingUpdateOperators
        error.code === 112 || // WriteConflict
        error.code === 251 || // NoSuchTransaction
        error.hasErrorLabel?.('TransientTransactionError') ||
        error.hasErrorLabel?.('UnknownTransactionCommitResult') ||
        (error.message && (
          error.message.includes('would create a conflict') ||
          error.message.includes('WriteConflict') ||
          error.message.includes('TransientTransactionError') ||
          error.message.includes('UnknownTransactionCommitResult')
        ));
      
      // Retry on transient errors
      if (attempt < maxRetries - 1 && isRetryable) {
        // Exponential backoff with jitter to prevent thundering herd
        const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        const jitter = Math.random() * 50; // Add 0-50ms random jitter
        const delay = baseDelay + jitter;
        console.warn(`[vendingHandler.js] [runWithTransaction]: Transaction conflict detected, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`, {
          errorCode: error.code,
          errorMessage: error.message,
          errorLabels: error.errorLabels || []
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If not retryable or max retries reached, throw with detailed error
      const errorDetails = {
        message: error.message,
        code: error.code,
        name: error.name,
        errorLabels: error.errorLabels || [],
        attempt: attempt + 1,
        maxRetries
      };
      console.error(`[vendingHandler.js] [runWithTransaction]: Transaction failed`, errorDetails);
      throw new Error(`Transaction failed after ${attempt + 1} attempts: ${error.message} (Code: ${error.code || 'N/A'})`);
    } finally {
      session.endSession();
    }
  }
  throw lastError;
}

// ------------------- runWithVendingTransaction -------------------
// Wraps operations in a MongoDB transaction using the vending database client
// Use this for operations that need to use vendCollection with transactions
async function runWithVendingTransaction(fn, maxRetries = MAX_RETRY_ATTEMPTS) {
  // Ensure vending client is connected
  if (!vendingClient) {
    await connectToVendingDatabase();
  }
  
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const session = vendingClient.startSession();
    try {
      session.startTransaction();
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      lastError = error;
      
      // Retry on transient errors (WriteConflict, TransientTransactionError, ConflictingUpdateOperators)
      if (attempt < maxRetries - 1 && (
        error.code === 40 || // ConflictingUpdateOperators
        error.code === 112 || // WriteConflict
        error.code === 251 || // NoSuchTransaction
        error.hasErrorLabel('TransientTransactionError') ||
        error.hasErrorLabel('UnknownTransactionCommitResult')
      )) {
        // Exponential backoff with jitter to prevent thundering herd
        const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        const jitter = Math.random() * 50; // Add 0-50ms random jitter
        const delay = baseDelay + jitter;
        console.warn(`[vendingHandler.js]: Vending transaction conflict, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
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

// ------------------- runWithHybridTransaction -------------------
// Wraps operations that need both mongoose models and vending collections
// Uses the vending client session, and gets vendCollection from that client
async function runWithHybridTransaction(fn, maxRetries = MAX_RETRY_ATTEMPTS) {
  // Ensure vending client is connected
  if (!vendingClient) {
    await connectToVendingDatabase();
  }
  
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const session = vendingClient.startSession();
    try {
      session.startTransaction();
      const result = await fn(session);
      await session.commitTransaction();
      return result;
    } catch (error) {
      await session.abortTransaction();
      lastError = error;
      
      // Retry on transient errors (WriteConflict, TransientTransactionError, ConflictingUpdateOperators)
      if (attempt < maxRetries - 1 && (
        error.code === 40 || // ConflictingUpdateOperators
        error.code === 112 || // WriteConflict
        error.code === 251 || // NoSuchTransaction
        error.hasErrorLabel('TransientTransactionError') ||
        error.hasErrorLabel('UnknownTransactionCommitResult')
      )) {
        // Exponential backoff with jitter to prevent thundering herd
        const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        const jitter = Math.random() * 50; // Add 0-50ms random jitter
        const delay = baseDelay + jitter;
        console.warn(`[vendingHandler.js]: Hybrid transaction conflict, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`);
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
// Atomically updates token balance with validation and retry logic
async function atomicUpdateTokenBalance(userId, change, session = null, maxRetries = MAX_RETRY_ATTEMPTS) {
  const options = session ? { session } : {};
  
  let lastError;
  let currentBalance = null;
  
  // Get current balance for error messages (only if not in transaction to avoid conflicts)
  if (!session) {
    try {
      const user = await User.findOne({ discordId: userId });
      currentBalance = user?.tokens || 0;
    } catch (e) {
      // Ignore errors when fetching balance for context
    }
  }
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
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
          if (!currentBalance && !session) {
            const currentUser = await User.findOne({ discordId: userId }, null, options);
            currentBalance = currentUser?.tokens || 0;
          }
          throw new Error(`Insufficient tokens for user ${userId}. Required: ${-change}, Available: ${currentBalance || 'unknown'}`);
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
    } catch (error) {
      lastError = error;
      
      // Check if this is a retryable error (write conflict, transient errors)
      const isRetryable = 
        error.code === 40 || // ConflictingUpdateOperators
        error.code === 112 || // WriteConflict
        error.code === 251 || // NoSuchTransaction
        error.hasErrorLabel?.('TransientTransactionError') ||
        (error.message && (
          error.message.includes('would create a conflict') ||
          error.message.includes('WriteConflict') ||
          error.message.includes('TransientTransactionError')
        ));
      
      // Don't retry on insufficient balance errors
      if (error.message && error.message.includes('Insufficient tokens')) {
        throw error;
      }
      
      // Retry on transient errors if we have retries left
      if (attempt < maxRetries - 1 && isRetryable) {
        // Refresh current balance before retrying (if not in transaction)
        if (!session) {
          try {
            const currentUser = await User.findOne({ discordId: userId });
            currentBalance = currentUser?.tokens || 0;
          } catch (e) {
            // Ignore errors when refreshing balance
          }
        }
        
        // Exponential backoff with jitter to prevent thundering herd
        const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
        const jitter = Math.random() * 50; // Add 0-50ms random jitter
        const delay = baseDelay + jitter;
        console.warn(`[vendingHandler.js] [atomicUpdateTokenBalance]: Token update conflict, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`, {
          userId,
          change,
          currentBalance: currentBalance || 'unknown',
          errorCode: error.code,
          errorMessage: error.message
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If not retryable or max retries reached, throw with detailed error
      const errorDetails = {
        userId,
        change,
        currentBalance: currentBalance || 'unknown',
        message: error.message,
        code: error.code,
        name: error.name,
        attempt: attempt + 1,
        maxRetries,
        inTransaction: !!session
      };
      console.error(`[vendingHandler.js] [atomicUpdateTokenBalance]: Token update failed`, errorDetails);
      throw new Error(`Failed to update token balance for user ${userId}: ${error.message} (Change: ${change}, Current Balance: ${currentBalance || 'unknown'}, Attempt: ${attempt + 1}/${maxRetries}, Code: ${error.code || 'N/A'})`);
    }
  }
  
  throw lastError || new Error(`Failed to update token balance for user ${userId} after ${maxRetries} attempts`);
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
// skipProcessingCheck: set to true when validating after marking as processing to avoid false positives
async function validateFulfillmentRequest(request, buyer, vendor, VendingInventory, skipProcessingCheck = false) {
  console.log('[vendingHandler.js] [validateFulfillmentRequest] Starting validation...', {
    fulfillmentId: request.fulfillmentId,
    status: request.status,
    itemName: request.itemName,
    quantity: request.quantity,
    buyerId: request.buyerId,
    vendorId: request.vendorId,
    expiresAt: request.expiresAt,
    currentTime: new Date()
  });
  
  const errors = [];
  
  // Check if request is expired
  if (request.expiresAt && new Date() > request.expiresAt) {
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ❌ Request expired', {
      fulfillmentId: request.fulfillmentId,
      expiresAt: request.expiresAt,
      currentTime: new Date()
    });
    errors.push('Request has expired');
  }
  
  // Check if request is already processed
  // Skip processing check if we've just marked it as processing ourselves
  if (request.status === 'completed') {
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ❌ Request already completed', {
      fulfillmentId: request.fulfillmentId,
      status: request.status
    });
    errors.push(`❌ This purchase request has already been completed. If you're trying to make another purchase, please create a new request.`);
  } else if (request.status === 'processing' && !skipProcessingCheck) {
    // Only fail on processing status if we're not the ones processing it
    // This prevents false positives when we've just marked it as processing
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ❌ Request already processing (from another action)', {
      fulfillmentId: request.fulfillmentId,
      status: request.status,
      processedAt: request.processedAt
    });
    errors.push(`❌ This purchase request is currently being processed by another action. Please wait a moment and try again, or refresh the request. If this persists, the request may need to be cancelled and recreated.`);
  } else if (request.status === 'processing' && skipProcessingCheck) {
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ✓ Request status is processing (we are processing it)', {
      fulfillmentId: request.fulfillmentId,
      status: request.status
    });
  }
  
  // Check if characters still exist
  if (!buyer) {
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ❌ Buyer not found', {
      fulfillmentId: request.fulfillmentId,
      buyerId: request.buyerId
    });
    errors.push('Buyer character not found');
  } else {
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ✓ Buyer found', {
      fulfillmentId: request.fulfillmentId,
      buyerName: buyer.name,
      buyerId: buyer._id?.toString()
    });
  }
  if (!vendor) {
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ❌ Vendor not found', {
      fulfillmentId: request.fulfillmentId,
      vendorId: request.vendorId
    });
    errors.push('Vendor character not found');
  } else {
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ✓ Vendor found', {
      fulfillmentId: request.fulfillmentId,
      vendorName: vendor.name,
      vendorId: vendor._id?.toString()
    });
  }
  
  // Check if item still exists in vendor inventory
  const stockItem = await VendingInventory.findOne({ itemName: request.itemName });
  if (!stockItem) {
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ❌ Item not in vendor inventory', {
      fulfillmentId: request.fulfillmentId,
      itemName: request.itemName,
      vendorName: vendor?.name
    });
    errors.push(`Item "${request.itemName}" no longer available in vendor inventory`);
  } else if (stockItem.stockQty < request.quantity) {
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ❌ Insufficient stock', {
      fulfillmentId: request.fulfillmentId,
      itemName: request.itemName,
      available: stockItem.stockQty,
      required: request.quantity
    });
    errors.push(`Insufficient stock. Available: ${stockItem.stockQty}, Required: ${request.quantity}`);
  } else {
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ✓ Stock sufficient', {
      fulfillmentId: request.fulfillmentId,
      itemName: request.itemName,
      available: stockItem.stockQty,
      required: request.quantity
    });
  }
  
  // Re-validate location restrictions
  const { validateVendingLocation } = require('@/utils/validation.js');
  const locationValidation = validateVendingLocation(vendor, buyer);
  if (!locationValidation.valid) {
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ❌ Location validation failed', {
      fulfillmentId: request.fulfillmentId,
      error: locationValidation.error,
      vendorLocation: vendor?.currentVillage,
      buyerLocation: buyer?.currentVillage
    });
    errors.push(locationValidation.error);
  } else {
    console.log('[vendingHandler.js] [validateFulfillmentRequest] ✓ Location valid', {
      fulfillmentId: request.fulfillmentId,
      vendorLocation: vendor?.currentVillage,
      buyerLocation: buyer?.currentVillage
    });
  }
  
  // For token payments, check balance
  if (request.paymentMethod === 'tokens') {
    const buyerTokens = await getTokenBalance(request.buyerId);
    let requiredTokens;
    
    if (request.isVendorSelfPurchase && request.originalSellPrice) {
      requiredTokens = request.originalSellPrice * request.quantity;
    } else if (request.originalTokenPrice) {
      requiredTokens = request.originalTokenPrice * request.quantity;
    } else {
      // Fallback: calculate from current stock item
      requiredTokens = stockItem?.tokenPrice * request.quantity || 0;
    }
    
    console.log('[vendingHandler.js] [validateFulfillmentRequest] Token payment check', {
      fulfillmentId: request.fulfillmentId,
      buyerId: request.buyerId,
      buyerTokens,
      requiredTokens,
      isVendorSelfPurchase: request.isVendorSelfPurchase,
      originalSellPrice: request.originalSellPrice,
      originalTokenPrice: request.originalTokenPrice,
      stockItemTokenPrice: stockItem?.tokenPrice
    });
    
    if (buyerTokens < requiredTokens) {
      console.log('[vendingHandler.js] [validateFulfillmentRequest] ❌ Insufficient tokens', {
        fulfillmentId: request.fulfillmentId,
        buyerTokens,
        requiredTokens
      });
      errors.push(`Insufficient tokens. Required: ${requiredTokens}, Available: ${buyerTokens}`);
    } else {
      console.log('[vendingHandler.js] [validateFulfillmentRequest] ✓ Token balance sufficient', {
        fulfillmentId: request.fulfillmentId,
        buyerTokens,
        requiredTokens
      });
    }
  }
  
  // Check for price changes
  if (request.paymentMethod === 'tokens' && stockItem) {
    if (request.isVendorSelfPurchase) {
      const ItemModel = require('@/models/ItemModel.js');
      const itemDetails = await ItemModel.findOne({ itemName: request.itemName });
      const currentSellPrice = itemDetails?.sellPrice || 0;
      if (request.originalSellPrice && currentSellPrice !== request.originalSellPrice) {
        console.log('[vendingHandler.js] [validateFulfillmentRequest] ❌ Price changed (vendor self-purchase)', {
          fulfillmentId: request.fulfillmentId,
          itemName: request.itemName,
          originalPrice: request.originalSellPrice,
          currentPrice: currentSellPrice
        });
        errors.push(`Item price has changed. Original: ${request.originalSellPrice}, Current: ${currentSellPrice}`);
      }
    } else {
      if (request.originalTokenPrice && stockItem.tokenPrice !== request.originalTokenPrice) {
        console.log('[vendingHandler.js] [validateFulfillmentRequest] ❌ Price changed (token purchase)', {
          fulfillmentId: request.fulfillmentId,
          itemName: request.itemName,
          originalPrice: request.originalTokenPrice,
          currentPrice: stockItem.tokenPrice
        });
        errors.push(`Item price has changed. Original: ${request.originalTokenPrice}, Current: ${stockItem.tokenPrice}`);
      }
    }
  }
  
  console.log('[vendingHandler.js] [validateFulfillmentRequest] Validation complete', {
    fulfillmentId: request.fulfillmentId,
    valid: errors.length === 0,
    errorCount: errors.length,
    errors: errors.length > 0 ? errors : 'none'
  });
  
  return {
    valid: errors.length === 0,
    errors,
    stockItem
  };
}

// ------------------- markRequestAsProcessing -------------------
// Atomically marks request as processing to prevent duplicate processing
async function markRequestAsProcessing(fulfillmentId, session = null) {
  console.log('[vendingHandler.js] [markRequestAsProcessing] Attempting to mark request as processing...', {
    fulfillmentId,
    hasSession: !!session,
    currentTime: new Date()
  });
  
  const options = session ? { session } : {};
  
  // First, check what the current state is
  const currentRequest = await VendingRequest.findOne({ fulfillmentId });
  if (currentRequest) {
    console.log('[vendingHandler.js] [markRequestAsProcessing] Current request state', {
      fulfillmentId,
      status: currentRequest.status,
      expiresAt: currentRequest.expiresAt,
      processedAt: currentRequest.processedAt,
      version: currentRequest.version,
      isExpired: currentRequest.expiresAt ? new Date() > currentRequest.expiresAt : false
    });
  } else {
    console.log('[vendingHandler.js] [markRequestAsProcessing] ❌ Request not found', { fulfillmentId });
  }
  
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
    console.log('[vendingHandler.js] [markRequestAsProcessing] ❌ Failed to update request', {
      fulfillmentId,
      currentStatus: currentRequest?.status,
      currentExpiresAt: currentRequest?.expiresAt,
      isExpired: currentRequest?.expiresAt ? new Date() > currentRequest.expiresAt : null
    });
    
    // Check the actual status to provide a more specific error
    const request = await VendingRequest.findOne({ fulfillmentId });
    if (request) {
      console.log('[vendingHandler.js] [markRequestAsProcessing] Request found with status:', {
        fulfillmentId,
        status: request.status,
        expiresAt: request.expiresAt,
        processedAt: request.processedAt,
        version: request.version
      });
      
      if (request.status === 'completed') {
        throw new Error('This purchase request has already been completed. Please create a new request if you want to make another purchase.');
      } else if (request.status === 'processing') {
        throw new Error('This purchase request is currently being processed. Please wait a moment before trying again.');
      } else if (request.expiresAt && new Date() > request.expiresAt) {
        throw new Error('This purchase request has expired. Please create a new request to complete your purchase.');
      }
    } else {
      console.log('[vendingHandler.js] [markRequestAsProcessing] ❌ Request not found in database', { fulfillmentId });
    }
    throw new Error('This purchase request could not be found or is no longer available. It may have been cancelled, expired, or already processed.');
  }
  
  console.log('[vendingHandler.js] [markRequestAsProcessing] ✓ Successfully marked as processing', {
    fulfillmentId,
    newStatus: result.status,
    processedAt: result.processedAt,
    version: result.version
  });
  
  return result;
}

// ============================================================================
// ------------------- Handler Functions (Exported) -------------------
// Each function handles one vending subcommand. They are modular, async,
// and include error handling + DB updates where relevant.
// ============================================================================

// ------------------- Vending Database Connection -------------------
// Use DatabaseConnectionManager for unified connection management
const DatabaseConnectionManager = require('../database/connectionManager');

// ------------------- Connect to vending database -------------------
async function connectToVendingDatabase() {
  // Use the connection manager instead of creating a separate connection
  const vendingConnection = await DatabaseConnectionManager.connectToVending();
  return vendingConnection.db || vendingConnection;
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
    const characterName = interaction.options.getString('charactername');
    
    // First check if character exists
    let character;
    try {
      character = await fetchCharacterByName(characterName);
    } catch (error) {
      if (error.message === "Character not found") {
        const embed = createErrorEmbed(
          '❌ Character Not Found',
          `Could not find a character named "${characterName}".`,
          [
            { name: '🔍 What to Check', value: '• The spelling of your character\'s name\n• That the character exists in the system\n• That you\'re using the correct character name', inline: false },
            { name: '💡 Next Steps', value: '1. Running `/vending setup` to register your character\n2. Contacting a moderator if the issue persists', inline: false }
          ]
        );
        return interaction.reply({ embeds: [embed] });
      }
      throw error; // Re-throw other errors
    }

    // ------------------- Window Restriction Check -------------------
    // Credit collection and restock are only available from 1st to 5th of each month
    const now = new Date();
    // Get EST date (UTC-5) for date comparison
    const estTime = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const estDate = new Date(estTime.getUTCFullYear(), estTime.getUTCMonth(), estTime.getUTCDate());
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
      const embed = createWarningEmbed(
        '⚠️ Already Claimed',
        `${characterName} has already claimed vending points for this month.`,
        [
          { name: '📅 Next Claim Available', value: new Date(currentYear, currentMonth, 1).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }), inline: false }
        ]
      );
      return interaction.reply({ embeds: [embed] });
    }

    // ------------------- Job Validation -------------------
    const job = character.job?.toLowerCase();
    if (job !== 'shopkeeper' && job !== 'merchant') {
      const embed = createErrorEmbed(
        '❌ Invalid Vendor Type',
        `${character.name} must be a **Shopkeeper** or **Merchant** to collect vending points.`,
        [
          { name: '💼 Current Job', value: character.job || 'None', inline: true },
          { name: '💡 To Become a Vendor', value: '1. Use a Job Voucher to change to Shopkeeper or Merchant\n2. Run `/vending setup` to initialize your shop\n3. Run `/vending sync` to sync your inventory', inline: false }
        ]
      );
      return interaction.reply({ embeds: [embed] });
    }

    // ------------------- Setup Validation -------------------
    // Log setup validation details for debugging
    console.log('[vendingHandler.js] [handleCollectPoints] Setup Validation Debug:', {
      characterName: character.name,
      characterId: character._id?.toString(),
      hasVendingSetup: !!character.vendingSetup,
      vendingSetup: character.vendingSetup,
      hasSetupDate: !!character.vendingSetup?.setupDate,
      setupDate: character.vendingSetup?.setupDate,
      validationCheck: {
        setupDateExists: !!character.vendingSetup?.setupDate,
        willPass: !!character.vendingSetup?.setupDate,
        willFail: !character.vendingSetup?.setupDate
      }
    });

    if (!character.vendingSetup?.setupDate) {
        console.log('[vendingHandler.js] [handleCollectPoints] ❌ Setup validation failed for character:', character.name);
        console.log('[vendingHandler.js] [handleCollectPoints] Reason: vendingSetup?.setupDate =', character.vendingSetup?.setupDate);
        const embed = createErrorEmbed(
          '❌ Setup Required',
          'You must complete vending setup before collecting points.',
          [
            { name: '⚙️ Setup Steps', value: 'Please run `/vending setup` to:\n1. Initialize your shop\n2. Set up your vending sheet\n3. Configure your shop settings', inline: false }
          ]
        );
        return interaction.reply({ embeds: [embed] });
    }

    // Note: vendingSync check removed - sync is no longer used

    // ------------------- Award Points -------------------
    const pointsAwarded = MONTHLY_VENDING_POINTS;

    await updateCharacterById(character._id, {
      vendingPoints: (character.vendingPoints || 0) + pointsAwarded,
      lastPointClaim: now,
      lastCollectedMonth: currentMonth
    });

    // ------------------- Embed Response -------------------
    const monthName = estDate.toLocaleDateString('en-US', { month: 'long' });
    const fields = [];
    if (character.vendingSheetUrl) {
      fields.push({
        name: '📎 Shop Sheet',
        value: `[View Sheet](${character.vendingSheetUrl})`,
        inline: false
      });
    }

    // Add rules field explaining collection window
    fields.push({
      name: '📋 Collection Rules',
      value: 'Points can only be collected during the **1st to 5th** of each month.',
      inline: false
    });

    const embed = createSuccessEmbed(
      `🪙 Points Collected for ${monthName}`,
      `${characterName} collected **${pointsAwarded}** vending points for ${monthName}.`,
      fields
    ).setFooter({ text: `Claimed: ${now.toLocaleDateString()}` });

    if (character.icon) {
      embed.setThumbnail(character.icon);
    }

    return interaction.reply({ embeds: [embed] });
  } catch (error) {
    console.error('[handleCollectPoints]: Error', error);
    const embed = createErrorEmbed(
      '❌ System Error',
      'An unexpected error occurred while processing your request.',
      [
        { name: '📋 Error Details', value: `Command: \`/vending collect_points\`\nCharacter: ${interaction.options.getString('charactername')}\nTime: ${new Date().toLocaleString()}`, inline: false },
        { name: '💡 Next Steps', value: 'Please try again in a few minutes. If the problem persists, contact a moderator.', inline: false }
      ]
    );
    return interaction.reply({ embeds: [embed] });
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
    const characterName = interaction.options.getString('charactername');
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
      const embed = createErrorEmbed(
        '❌ Invalid Quantity',
        'Please provide a valid stock quantity greater than 0.'
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ------------------- Character Validation -------------------
    const character = await fetchCharacterByName(characterName);
    if (!character || character.userId !== userId) {
      return interaction.editReply("❌ Character not found or doesn't belong to you.");
    }

    // Get character job type (check vendorType first, then job field)
    const characterJob = (character.vendorType || character.job || '').toLowerCase().trim();

    // ------------------- Shopkeeper Village Restrictions -------------------
    if (characterJob === 'shopkeeper') {
      // Block buying stock from other village town halls
      if (character.currentVillage.toLowerCase() !== character.homeVillage.toLowerCase()) {
        const embed = createErrorEmbed(
          '❌ Location Restriction',
          'Shopkeepers can only buy stock from their home village town hall.',
          [
            { name: '🏘️ Current Location', value: character.currentVillage, inline: true },
            { name: '🏠 Home Village', value: character.homeVillage, inline: true }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }
    }

    // ------------------- Slot Limits -------------------
    const baseSlotLimits = { shopkeeper: 5, merchant: 3 };
    const pouchCapacities = { none: 0, bronze: 15, silver: 30, gold: 50 };
    const baseSlots = baseSlotLimits[characterJob] || 0;
    const extraSlots = pouchCapacities[character.shopPouch?.toLowerCase()] || 0;
    const totalSlots = baseSlots + extraSlots;

    // If manual slot is provided, validate it
    if (manualSlot) {
      const slotNumber = parseInt(manualSlot.replace(/[^0-9]/g, ''));
      if (isNaN(slotNumber) || slotNumber < 1 || slotNumber > totalSlots) {
        const embed = createErrorEmbed(
          '❌ Invalid Slot Number',
          `Invalid slot number. You have ${totalSlots} total slots available.`,
          [
            { name: '📦 Available Slots', value: `1-${totalSlots}`, inline: true },
            { name: '🎯 Requested Slot', value: manualSlot, inline: true }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }
    }

    // ------------------- DB Connections -------------------
    const vendCollection = await getVendingCollection(characterName);

    // ------------------- Stock Validation -------------------
    const stockList = await getCurrentVendingStockList();
    if (!stockList?.stockList) {
      const embed = createErrorEmbed(
        '❌ Stock List Error',
        'Failed to fetch current vending stock list.',
        [
          { name: '💡 Next Steps', value: 'Please try again in a few moments. If the problem persists, contact support.', inline: false }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
    }

    const normalizedVillage = character.currentVillage.toLowerCase().trim();
    const villageStock = stockList.stockList[normalizedVillage] || [];
    const limitedItems = stockList.limitedItems || [];
    
    // First check village stock (Merchant/Shopkeeper items)
    let itemDoc = villageStock.find(item => 
      item.itemName.toLowerCase() === itemName.toLowerCase() && 
      item.vendingType?.toLowerCase() === characterJob
    );
    
    // If not found in village stock, check Limited items (available to both Shopkeepers and Merchants)
    if (!itemDoc) {
      itemDoc = limitedItems.find(item => 
        item.itemName.toLowerCase() === itemName.toLowerCase()
      );
    }

    if (!itemDoc) {
      const embed = createErrorEmbed(
        '❌ Item Not Found',
        `Item "${itemName}" not found in ${character.currentVillage}'s stock for ${characterJob}s or in Limited items.`,
        [
          { name: '🔍 Item Name', value: itemName, inline: true },
          { name: '🏘️ Village', value: character.currentVillage, inline: true },
          { name: '💼 Job Type', value: characterJob || character.job || 'Unknown', inline: true }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ------------------- Point Cost Calculation -------------------
    const pointCost = itemDoc.points;
    const totalCost = pointCost * stockQty;

    if (character.vendingPoints < totalCost) {
      const embed = createErrorEmbed(
        '❌ Insufficient Points',
        'Not enough vending points to complete this purchase.',
        [
          { name: '💰 Required', value: `${totalCost} points`, inline: true },
          { name: '💎 Available', value: `${character.vendingPoints} points`, inline: true },
          { name: '📊 Cost Breakdown', value: `${pointCost} per item × ${stockQty} items`, inline: false }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ------------------- Get Item Details -------------------
    // Get item details to check stackable status (allow custom items)
    const itemDetails = await ItemModel.findOne({ itemName });
    const isCustomItem = !itemDetails;
    
    // ------------------- Calculate Current Slot Usage -------------------
    // Calculate how many slots are actually used (accounting for stack sizes)
    const currentSlotsUsed = await calculateSlotsUsed(vendCollection);
    
    // Calculate slots needed for the new item
    // First check if item already exists in shop (might be stacking)
    const existingItemInShop = await vendCollection.findOne({ itemName });
    
    let slotsNeededForNewItem = 0;
    if (!isCustomItem) {
      const maxStackSize = itemDetails.maxStackSize || 10;
      const isStackable = itemDetails.stackable;
      
      if (existingItemInShop && isStackable) {
        // If stackable and item exists, calculate additional slots needed
        const currentSlotsUsedForItem = Math.ceil(existingItemInShop.stockQty / maxStackSize);
        const newTotal = existingItemInShop.stockQty + stockQty;
        const newSlotsUsedForItem = Math.ceil(newTotal / maxStackSize);
        slotsNeededForNewItem = newSlotsUsedForItem - currentSlotsUsedForItem;
      } else {
        // New item or non-stackable
        if (isStackable) {
          slotsNeededForNewItem = Math.ceil(stockQty / maxStackSize);
        } else {
          slotsNeededForNewItem = stockQty;
        }
      }
    } else {
      // Custom item - treat as non-stackable
      slotsNeededForNewItem = stockQty;
    }
    
    // Check if shop is at capacity
    if (currentSlotsUsed >= totalSlots && slotsNeededForNewItem > 0) {
      const embed = createErrorEmbed(
        '❌ Shop is at Capacity',
        'You have used all available slots in your shop.',
        [
          { name: '📦 Slot Usage', value: `${currentSlotsUsed}/${totalSlots} slots used`, inline: true },
          { name: '💡 Solution', value: 'Please remove items from your shop to free up space before restocking.', inline: false }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
    }
    
    // Check if adding this item would exceed capacity
    if (currentSlotsUsed + slotsNeededForNewItem > totalSlots) {
      const availableSlots = totalSlots - currentSlotsUsed;
      const embed = createErrorEmbed(
        '❌ Not Enough Space',
        'This item requires more slots than you have available.',
        [
          { name: '📦 Slots Required', value: `${slotsNeededForNewItem} slot(s)`, inline: true },
          { name: '📊 Available Slots', value: `${availableSlots} slot(s)`, inline: true },
          { name: '📈 Current Usage', value: `${currentSlotsUsed}/${totalSlots} slots`, inline: false },
          { name: '💡 Solution', value: 'Please remove items from your shop to free up space.', inline: false }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
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
        const embed = createErrorEmbed(
          '❌ Invalid Slot Number',
          `Invalid slot number. You have ${totalSlots} total slots available.`,
          [
            { name: '📦 Available Slots', value: `1-${totalSlots}`, inline: true },
            { name: '🎯 Requested Slot', value: manualSlot, inline: true }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }
      
      // Check if slot is already taken by a different item
      const existingItem = await vendCollection.findOne({ 
        slot: manualSlot,
        itemName: { $ne: itemName } // Only check for different items
      });
      if (existingItem) {
        const embed = createErrorEmbed(
          '❌ Slot Already Occupied',
          `Slot ${manualSlot} is already occupied by another item.`,
          [
            { name: '🎯 Slot', value: manualSlot, inline: true },
            { name: '📦 Occupied By', value: existingItem.itemName, inline: true },
            { name: '💡 Solution', value: 'Please choose a different slot.', inline: false }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }
      newSlot = manualSlot;
    } else {
      // First, check if the same item already exists in any slot that has room for more
      // This allows stacking items when no specific slot is specified
      if (!isCustomItem && itemDetails) {
        const maxStackSize = itemDetails.maxStackSize || 10;
        const isStackable = itemDetails.stackable;
        
        if (isStackable) {
          // Find existing slots with the same item that have room for the new quantity
          const existingSlots = await vendCollection.find({ itemName }).toArray();
          for (const existingSlot of existingSlots) {
            const newTotal = existingSlot.stockQty + stockQty;
            if (newTotal <= maxStackSize) {
              // Found a slot with the same item that has room for all the new items
              newSlot = existingSlot.slot;
              break;
            }
          }
          // If no slot has room for all items, check if any slot has partial room
          // (This allows partial stacking, though multiple slots may be used)
          if (!newSlot) {
            for (const existingSlot of existingSlots) {
              if (existingSlot.stockQty < maxStackSize) {
                // Found a slot with the same item that has some room (partial stack)
                newSlot = existingSlot.slot;
                break;
              }
            }
          }
        }
      }
      
      // If no stacking slot found, find first available empty slot
      if (!newSlot) {
        for (let i = 1; i <= totalSlots; i++) {
          const slotName = `Slot ${i}`;
          // Check if this slot is occupied by any item (not just the one we're adding)
          const slotOccupied = await vendCollection.findOne({ slot: slotName });
          if (!slotOccupied) {
            newSlot = slotName;
            break;
          }
        }
      }
      
      if (!newSlot) {
        // Get list of all occupied slots for the error message
        const occupiedList = Array.from(occupiedSlots).sort((a, b) => {
          const numA = parseInt(a.replace(/[^0-9]/g, '')) || 0;
          const numB = parseInt(b.replace(/[^0-9]/g, '')) || 0;
          return numA - numB;
        });
        const embed = createErrorEmbed(
          '❌ No Available Slots',
          'You have used all available slots in your shop.',
          [
            { name: '📦 Total Slots', value: `${totalSlots} slots`, inline: true },
            { name: '📋 Occupied Slots', value: occupiedList.join(', ') || 'None', inline: false },
            { name: '💡 Solution', value: 'Please remove an item from your shop first, or specify a slot that already contains this item to stack it.', inline: false }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }
    }

    // Final validation: Double check slot is available right before transaction
    const finalSlotCheck = await vendCollection.findOne({
      slot: newSlot,
      itemName: { $ne: itemName }
    });

    if (finalSlotCheck) {
      const embed = createErrorEmbed(
        '❌ Slot Conflict',
        `Slot ${newSlot} is already occupied by another item.`,
        [
          { name: '🎯 Slot', value: newSlot, inline: true },
          { name: '📦 Occupied By', value: finalSlotCheck.itemName, inline: true },
          { name: '💡 Solution', value: 'Please try again with a different slot.', inline: false }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
    }

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
      const embed = createErrorEmbed(
        '❌ Price Validation Failed',
        'Please set at least one pricing option.',
        [
          { name: '⚠️ Validation Errors', value: priceValidation.join('\n'), inline: false },
          { name: '💰 Pricing Options', value: '• **Token Price** (number)\n• **Art Price** (description)\n• **Other Price** (description)\n• **Barter Open** (true/false)', inline: false }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ------------------- Stack Size Validation -------------------
    // Get existing item for transaction update and validation (if it exists)
    const existingItem = await vendCollection.findOne({
      itemName,
      slot: newSlot
    });
    
    // Item details already fetched above for slot calculation
    // Additional validation for stackable items
    if (!isCustomItem) {
      const maxStackSize = itemDetails.maxStackSize || 10;
      const isStackable = itemDetails.stackable;

      if (!isStackable && stockQty > 1) {
        const embed = createErrorEmbed(
          '❌ Item Not Stackable',
          `${itemName} is not stackable. You can only add 1 at a time.`,
          [
            { name: '📦 Item', value: itemName, inline: true },
            { name: '📊 Requested Quantity', value: stockQty.toString(), inline: true }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }

      if (existingItem) {
        const newTotal = existingItem.stockQty + stockQty;
        // Validate stack size - check if adding would exceed maxStackSize
        if (isStackable && newTotal > maxStackSize) {
          const embed = createErrorEmbed(
            '❌ Stack Size Exceeded',
            `Cannot add ${stockQty} more ${itemName} to this slot. This would exceed the maximum stack size.`,
            [
              { name: '📦 Item', value: itemName, inline: true },
              { name: '📊 Current Stack', value: `${existingItem.stockQty}`, inline: true },
              { name: '📈 Maximum Allowed', value: `${maxStackSize} per slot`, inline: true },
              { name: '🔢 Would Result In', value: `${newTotal} items (exceeds ${maxStackSize})`, inline: true },
              { name: '💡 Solution', value: `Please restock ${maxStackSize - existingItem.stockQty} or fewer items, or use a different slot.`, inline: false }
            ]
          );
          return interaction.editReply({ embeds: [embed] });
        }
        // For non-stackable items, if item already exists in slot, cannot add more
        if (!isStackable && existingItem.stockQty > 0) {
          const embed = createErrorEmbed(
            '❌ Cannot Stack Non-Stackable Item',
            `Item "${itemName}" is not stackable and already has stock in this slot.`,
            [
              { name: '📦 Item', value: itemName, inline: true },
              { name: '📊 Current Stock', value: `${existingItem.stockQty}`, inline: true },
              { name: '💡 Solution', value: 'Non-stackable items cannot be stacked. Use a different slot or remove the existing item first.', inline: false }
            ]
          );
          return interaction.editReply({ embeds: [embed] });
        }
      }
      // For stackable items exceeding maxStackSize, they will use multiple slots
      // This is already validated in the slot capacity check above
    }

    // ------------------- Update Inventory and Points (Transaction) -------------------
    // Note: We need to handle two different clients (mongoose for Character, native client for vendCollection)
    // Since they use different clients, we can't use a single transaction, so we do them separately
    // with validation to minimize race conditions
    
    // First, validate Character points using mongoose
    const currentCharacter = await Character.findById(character._id);
    if (!currentCharacter || currentCharacter.vendingPoints < totalCost) {
      throw new Error(`Insufficient vending points. Required: ${totalCost}, Available: ${currentCharacter?.vendingPoints || 0}`);
    }

    // Update vendCollection using vending client transaction
    await runWithVendingTransaction(async (session) => {
      // Get vendCollection from the same client used for the session
      const db = await connectToVendingDatabase();
      const vendCollectionWithSession = db.collection(characterName.toLowerCase());
      
      // Update inventory
      if (existingItem) {
        // Validate stack size before updating (double-check, in case something changed)
        if (!isCustomItem && itemDetails) {
          const isStackable = itemDetails.stackable || false;
          const maxStackSize = itemDetails.maxStackSize || 10;
          const currentStock = existingItem.stockQty || 0;
          const newTotal = currentStock + stockQty;
          
          if (isStackable && newTotal > maxStackSize) {
            throw new Error(`Cannot restock ${stockQty} items. Current stock: ${currentStock}, max stack size: ${maxStackSize}. Adding ${stockQty} would exceed the maximum (${newTotal} > ${maxStackSize}).`);
          }
          
          if (!isStackable && currentStock > 0 && stockQty > 0) {
            throw new Error(`Item "${itemName}" is not stackable and already has stock in this slot. Cannot add more items to the same slot.`);
          }
        }

        // Atomically update existing item with stock validation
        const updateData = {
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
        };

        // Update slotsUsed if item is stackable
        if (!isCustomItem && itemDetails && itemDetails.stackable) {
          const maxStackSize = itemDetails.maxStackSize || 10;
          const currentStock = existingItem.stockQty || 0;
          const updatedStock = currentStock + stockQty;
          updateData.$set.slotsUsed = Math.ceil(updatedStock / maxStackSize);
        }

        const updateResult = await vendCollectionWithSession.findOneAndUpdate(
          { 
            _id: existingItem._id,
            stockQty: { $exists: true } // Ensure item still exists
          },
          updateData,
          { 
            returnDocument: 'after',
            session 
          }
        );

        if (!updateResult.value) {
          throw new Error('Item no longer exists in inventory');
        }

        // Check if stock reached zero and delete if needed
        if (updateResult.value.stockQty <= 0) {
          await vendCollectionWithSession.deleteOne({ _id: existingItem._id }, { session });
        }
      } else {
        // Insert new item with new fields
        await vendCollectionWithSession.insertOne({
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
        }, { session });
      }
    });

    // Atomically update character points using mongoose transaction
    await runWithTransaction(async (session) => {
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

    // Log transaction for vendor purchase
    try {
      const user = await User.findOne({ discordId: character.userId });
      const fulfillmentId = `vendor_purchase_${uuidv4()}`;
      const vendorTransaction = new VendingRequest({
        fulfillmentId: fulfillmentId,
        userCharacterName: characterName,
        vendorCharacterName: characterName,
        itemName: itemName,
        quantity: stockQty,
        paymentMethod: 'vending_points',
        notes: `Vendor restocked ${stockQty}x ${itemName} from vending stock`,
        buyerId: character.userId,
        buyerUsername: user?.username || characterName,
        date: new Date(),
        status: 'completed',
        processedAt: new Date(),
        transactionType: 'vendor_purchase',
        pointsSpent: totalCost
      });
      await vendorTransaction.save();
      console.log(`[vendingHandler.js]: ✅ Logged vendor purchase transaction: ${fulfillmentId}`);
    } catch (txError) {
      console.error('[vendingHandler.js]: ⚠️ Failed to log vendor purchase transaction:', txError);
      // Don't fail the request if transaction logging fails
    }

    // Google Sheets update removed

    // ------------------- Success Response -------------------
    const priceDisplay = [];
    if (tokenPrice !== null && tokenPrice !== undefined) priceDisplay.push(`**Token:** ${tokenPrice}`);
    if (artPrice && artPrice.trim()) priceDisplay.push(`**Art:** ${artPrice}`);
    if (otherPrice && otherPrice.trim()) priceDisplay.push(`**Other:** ${otherPrice}`);
    if (barterOpen) priceDisplay.push('**Barter:** Open');

    const shopType = character.job ? character.job.charAt(0).toUpperCase() + character.job.slice(1).toLowerCase() : 'N/A';
    const remainingPoints = character.vendingPoints - totalCost;

    const fields = [
      { name: '👤 Character', value: character.name, inline: true },
      { name: '🏘️ Location', value: character.currentVillage, inline: true },
      { name: '🛍️ Shop Type', value: shopType, inline: true },
      { name: '📦 Item', value: `${itemDetails?.emoji || '📦'} **${itemName}**`, inline: true },
      { name: '🎯 Slot', value: `**${newSlot}**`, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
      { name: '💰 Pricing', value: priceDisplay.length > 0 ? priceDisplay.join('\n') : '*No prices set*', inline: false },
      { name: '🪙 Points Spent', value: `**${totalCost}** points`, inline: true },
      { name: '💎 Remaining Points', value: `**${remainingPoints}** points`, inline: true }
    ];

    const successEmbed = createSuccessEmbed(
      '✅ Item Added to Shop',
      `Successfully added **${stockQty}x ${itemName}** to your shop in **${newSlot}**.`,
      fields
    )
    .setAuthor({ 
      name: `${character.name} the ${character.job ? character.job.charAt(0).toUpperCase() + character.job.slice(1).toLowerCase() : 'No Job'}`, 
      iconURL: character.icon 
    })
    .setThumbnail(itemDetails?.image || 'https://via.placeholder.com/150')
    .setFooter({ text: `Added to shop on ${new Date().toLocaleDateString()}` });

    await interaction.editReply({ embeds: [successEmbed] });

  } catch (error) {
    console.error('[handleRestock]: Error:', error);
    const errorMessage = error.message || 'Unknown error occurred';
    const embed = createErrorEmbed(
      '❌ Restock Error',
      'An error occurred while adding items to your shop.',
      [
        { name: '⚠️ Error Details', value: errorMessage, inline: false },
        { name: '💡 Next Steps', value: 'Please check your inputs and try again. If the problem persists, contact support.', inline: false }
      ]
    );
    await interaction.editReply({ embeds: [embed] });
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
      const notes = interaction.options.getString("notes");
  
      // ------------------- Validate Inputs -------------------
      if (!targetShopName || !requestedItemName || !quantity || !paymentType) {
        const embed = createWarningEmbed(
          '⚠️ Missing Required Options',
          'Please provide all required options to create a barter request.',
          [
            { name: '📋 Required Options', value: '• `vendorcharacter`\n• `itemname`\n• `quantity`\n• `payment_type`', inline: false }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }

      // Parse offered items from separate fields (support up to 3 items with quantities)
      let offeredItems = [];
      let offeredItemsWithQty = [];
      if (paymentType === 'barter') {
        const barterItem1 = interaction.options.getString("barter_item_1");
        const barterItem1Qty = interaction.options.getInteger("barter_item_1_qty");
        const barterItem2 = interaction.options.getString("barter_item_2");
        const barterItem2Qty = interaction.options.getInteger("barter_item_2_qty");
        const barterItem3 = interaction.options.getString("barter_item_3");
        const barterItem3Qty = interaction.options.getInteger("barter_item_3_qty");

        // First item is required for barter
        if (!barterItem1 || !barterItem1.trim()) {
          const embed = createWarningEmbed(
            '⚠️ Missing Barter Offer',
            'Please provide at least one item to offer when using barter payment type.',
            [
              { name: '💡 Payment Type', value: 'Barter', inline: true },
              { name: '📦 Required', value: 'At least one barter item with quantity', inline: false }
            ]
          );
          return interaction.editReply({ embeds: [embed] });
        }

        // Validate first item has quantity
        if (!barterItem1Qty || barterItem1Qty < 1) {
          const embed = createWarningEmbed(
            '⚠️ Invalid Barter Quantity',
            'Please provide a valid quantity (1 or more) for the first barter item.',
            [
              { name: '💡 Payment Type', value: 'Barter', inline: true },
              { name: '📦 Item', value: barterItem1, inline: true }
            ]
          );
          return interaction.editReply({ embeds: [embed] });
        }

        // Add first item (required)
        offeredItems.push(barterItem1.trim());
        offeredItemsWithQty.push({ itemName: barterItem1.trim(), quantity: barterItem1Qty });

        // Add second item if provided
        if (barterItem2 && barterItem2.trim()) {
          const qty2 = barterItem2Qty || 1;
          if (qty2 < 1) {
            const embed = createWarningEmbed(
              '⚠️ Invalid Barter Quantity',
              'Please provide a valid quantity (1 or more) for the second barter item, or leave it empty.',
              [
                { name: '💡 Payment Type', value: 'Barter', inline: true },
                { name: '📦 Item', value: barterItem2, inline: true }
              ]
            );
            return interaction.editReply({ embeds: [embed] });
          }
          offeredItems.push(barterItem2.trim());
          offeredItemsWithQty.push({ itemName: barterItem2.trim(), quantity: qty2 });
        }

        // Add third item if provided
        if (barterItem3 && barterItem3.trim()) {
          const qty3 = barterItem3Qty || 1;
          if (qty3 < 1) {
            const embed = createWarningEmbed(
              '⚠️ Invalid Barter Quantity',
              'Please provide a valid quantity (1 or more) for the third barter item, or leave it empty.',
              [
                { name: '💡 Payment Type', value: 'Barter', inline: true },
                { name: '📦 Item', value: barterItem3, inline: true }
              ]
            );
            return interaction.editReply({ embeds: [embed] });
          }
          offeredItems.push(barterItem3.trim());
          offeredItemsWithQty.push({ itemName: barterItem3.trim(), quantity: qty3 });
        }

        if (offeredItems.length === 0) {
          const embed = createWarningEmbed(
            '⚠️ Invalid Barter Offer',
            'Please provide at least one valid item to offer.',
            [
              { name: '💡 Payment Type', value: 'Barter', inline: true }
            ]
          );
          return interaction.editReply({ embeds: [embed] });
        }
      }
  
      const buyer = await fetchCharacterByNameAndUserId(interaction.options.getString('charactername'), buyerId);
      if (!buyer) {
        const embed = createWarningEmbed(
          '⚠️ Character Not Found',
          'Your character could not be found. Please create one first.',
          [
            { name: '💡 Next Steps', value: 'Use character creation commands to set up your character before making purchases.', inline: false }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }
  
      // ------------------- Debug Logging -------------------
      console.log(`[handleVendingBarter] Looking for vendor: "${targetShopName}"`);
      const shopOwner = await fetchCharacterByName(targetShopName);
      
      if (!shopOwner) {
        console.log(`[handleVendingBarter] ❌ Character "${targetShopName}" not found in database`);
        const embed = createWarningEmbed(
          '⚠️ Shop Not Found',
          `No vending shop found under the name **${targetShopName}**.`,
          [
            { name: '🔍 Shop Name', value: targetShopName, inline: true },
            { name: '💡 Tip', value: 'Make sure the shop name is spelled correctly and the vendor has set up their shop.', inline: false }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
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
        const embed = createWarningEmbed(
          '⚠️ Shop Not Found',
          `No vending shop found under the name **${targetShopName}**.`,
          [
            { name: '🔍 Shop Name', value: targetShopName, inline: true },
            { name: '💡 Tip', value: 'Make sure the shop name is spelled correctly and the vendor has set up their shop.', inline: false }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }
      
      if (!shopLink && hasVendingInventory) {
        console.log(`[handleVendingBarter] ⚠️ No shopLink but inventory exists (${inventoryCount} items) - proceeding anyway`);
      }

      // ------------------- Merchant vs Shopkeeper Location Validation -------------------
      const locationValidation = validateVendingLocation(shopOwner, buyer);
      
      if (!locationValidation.valid) {
        const fields = [
          { name: '👤 Vendor', value: shopOwner.name, inline: true },
          { name: '🏘️ Vendor Location', value: shopOwner.currentVillage || 'Unknown', inline: true },
          { name: '🏠 Vendor Home', value: shopOwner.homeVillage || 'Unknown', inline: true },
          { name: '👤 Buyer', value: buyer.name, inline: true },
          { name: '🏘️ Buyer Location', value: buyer.currentVillage || 'Unknown', inline: true },
          { name: '💼 Vendor Job', value: shopOwner.job || 'Unknown', inline: true }
        ];

        if (locationValidation.vendorLocation || locationValidation.buyerLocation) {
          fields.push({
            name: '💡 Travel Tip',
            value: locationValidation.vendorJob === 'shopkeeper' 
              ? `Shopkeepers can only sell when they are in their home village (${shopOwner.homeVillage}). Please wait for ${shopOwner.name} to return home.`
              : `Use </travel:1379850586987430009> to travel to ${shopOwner.currentVillage} and barter with ${shopOwner.name}.`,
            inline: false
          });
        }

        const errorEmbed = createErrorEmbed(
          '❌ Location Restriction',
          locationValidation.error,
          fields
        ).setFooter({ text: 'Village restriction active' });

        return interaction.editReply({ embeds: [errorEmbed] });
      }

      // ------------------- Token Tracker Sync Validation -------------------
      const buyerUser = await User.findOne({ discordId: buyerId });
      const vendorUser = await User.findOne({ discordId: shopOwner.userId });

      if (!buyerUser || !vendorUser) {
        const embed = createErrorEmbed(
          '❌ User Data Not Found',
          'Could not find user data for either buyer or vendor.',
          [
            { name: '👤 Buyer', value: buyerName, inline: true },
            { name: '👤 Vendor', value: shopOwner.name, inline: true },
            { name: '💡 Solution', value: 'Please ensure both users have accounts set up in the system.', inline: false }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }

      // Get vendor's Discord username
      const vendorDiscordUser = await interaction.client.users.fetch(shopOwner.userId);
      const vendorUsername = vendorDiscordUser?.username || 'Unknown User';

  
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
            const embed = createWarningEmbed(
              '⚠️ Item Not Available for Token Purchase',
              `The item **${requestedItemName}** is not available for token purchase in ${targetShopName}'s shop.`,
              [
                { name: '📦 Item', value: requestedItemName, inline: true },
                { name: '🏪 Shop', value: targetShopName, inline: true },
                { name: '💰 Payment Method', value: 'Tokens', inline: true }
              ]
            );
            return interaction.editReply({ embeds: [embed] });
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
            const embed = createWarningEmbed(
              '⚠️ Item Not Available for Art Purchase',
              `The item **${requestedItemName}** is not available for art purchase in ${targetShopName}'s shop.`,
              [
                { name: '📦 Item', value: requestedItemName, inline: true },
                { name: '🏪 Shop', value: targetShopName, inline: true },
                { name: '💰 Payment Method', value: 'Art', inline: true }
              ]
            );
            return interaction.editReply({ embeds: [embed] });
          }
          break;
        case 'barter':
          requestedItem = allItems.find(item => 
            item.barterOpen === true
          );
          if (!requestedItem) {
            const embed = createWarningEmbed(
              '⚠️ Item Not Available for Barter',
              `The item **${requestedItemName}** is not available for barter in ${targetShopName}'s shop.`,
              [
                { name: '📦 Item', value: requestedItemName, inline: true },
                { name: '🏪 Shop', value: targetShopName, inline: true },
                { name: '💰 Payment Method', value: 'Barter', inline: true }
              ]
            );
            return interaction.editReply({ embeds: [embed] });
          }
          break;
      }

      if (!requestedItem) {
        const embed = createWarningEmbed(
          '⚠️ Item Not Available',
          `The item **${requestedItemName}** is not available in ${targetShopName}'s shop.`,
          [
            { name: '📦 Item', value: requestedItemName, inline: true },
            { name: '🏪 Shop', value: targetShopName, inline: true }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }

      if (requestedItem.stockQty < quantity) {
        const embed = createWarningEmbed(
          '⚠️ Insufficient Stock',
          `${targetShopName} only has limited stock available.`,
          [
            { name: '📦 Item', value: requestedItemName, inline: true },
            { name: '📊 Available Stock', value: `${requestedItem.stockQty}`, inline: true },
            { name: '📋 Requested Quantity', value: `${quantity}`, inline: true }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }
  
      // ------------------- Vendor Self-Purchase Check -------------------
      // If vendor is buying from own shop, must use ROTW SELL price
      const isVendorSelfPurchase = buyer.userId === shopOwner.userId;
      
      if (isVendorSelfPurchase) {
        // Vendor buying from own shop - must use tokens and ROTW SELL price
        if (paymentType !== 'tokens') {
          const embed = createErrorEmbed(
            '❌ Self-Purchase Restriction',
            'Vendors purchasing from their own shop must use token payment and pay the ROTW SELL price.',
            [
              { name: '💰 Required Payment', value: 'Tokens', inline: true },
              { name: '💵 Price Type', value: 'ROTW SELL price (not shop token price)', inline: false },
              { name: '💡 Solution', value: 'Please select **Tokens** as your payment method.', inline: false }
            ]
          );
          return interaction.editReply({ embeds: [embed] });
        }

        // Get item details to find sell price
        const itemDetails = await ItemModel.findOne({ itemName: requestedItemName });
        if (!itemDetails) {
          const embed = createErrorEmbed(
            '❌ Item Details Not Found',
            `Could not find item details for ${requestedItemName}.`,
            [
              { name: '📦 Item', value: requestedItemName, inline: true },
              { name: '⚠️ Restriction', value: 'Vendors cannot purchase custom items from their own shop.', inline: false }
            ]
          );
          return interaction.editReply({ embeds: [embed] });
        }

        const sellPrice = itemDetails.sellPrice || 0;
        if (sellPrice <= 0) {
          const embed = createErrorEmbed(
            '❌ No Sell Price Set',
            'This item has no sell price set. Vendors cannot purchase items without a sell price from their own shop.',
            [
              { name: '📦 Item', value: requestedItemName, inline: true },
              { name: '💵 Sell Price', value: 'Not set', inline: true }
            ]
          );
          return interaction.editReply({ embeds: [embed] });
        }

        const totalCost = sellPrice * quantity;
        const userTokens = await getTokenBalance(buyerId);
        if (userTokens < totalCost) {
          const embed = createWarningEmbed(
            '⚠️ Insufficient Tokens',
            'You need more tokens to purchase this item from your own shop.',
            [
              { name: '💰 Required', value: `${totalCost} tokens`, inline: true },
              { name: '💎 Your Balance', value: `${userTokens} tokens`, inline: true },
              { name: '📊 Shortage', value: `${totalCost - userTokens} tokens`, inline: true },
              { name: '💵 Price Per Item', value: `${sellPrice} tokens (ROTW SELL price)`, inline: false },
              { name: '📦 Purchase', value: `${quantity}x ${requestedItemName}`, inline: false }
            ]
          );
          return interaction.editReply({ embeds: [embed] });
        }
      } else {
        // Normal buyer - use shop's pricing
        // ------------------- Payment Type Specific Validation -------------------
        switch (paymentType) {
          case 'tokens':
            if (!requestedItem.tokenPrice || requestedItem.tokenPrice === null) {
              const embed = createWarningEmbed(
                '⚠️ Token Purchase Not Available',
                `${requestedItemName} is not available for token purchase.`,
                [
                  { name: '📦 Item', value: requestedItemName, inline: true },
                  { name: '💰 Payment Method', value: 'Tokens', inline: true }
                ]
              );
              return interaction.editReply({ embeds: [embed] });
            }
            const totalCost = requestedItem.tokenPrice * quantity;
            const userTokens = await getTokenBalance(buyerId);
            if (userTokens < totalCost) {
              const embed = createWarningEmbed(
                '⚠️ Insufficient Tokens',
                'You don\'t have enough tokens to complete this purchase.',
                [
                  { name: '💰 Required', value: `${totalCost} tokens`, inline: true },
                  { name: '💎 Your Balance', value: `${userTokens} tokens`, inline: true },
                  { name: '📊 Shortage', value: `${totalCost - userTokens} tokens`, inline: true }
                ]
              );
              return interaction.editReply({ embeds: [embed] });
            }
            break;

          case 'art':
            if (!requestedItem.artPrice || requestedItem.artPrice === 'N/A' || requestedItem.artPrice === '' || requestedItem.artPrice === null) {
              const embed = createWarningEmbed(
                '⚠️ Art Purchase Not Available',
                `${requestedItemName} is not available for art purchase.`,
                [
                  { name: '📦 Item', value: requestedItemName, inline: true },
                  { name: '💰 Payment Method', value: 'Art', inline: true }
                ]
              );
              return interaction.editReply({ embeds: [embed] });
            }
            break;

          case 'barter':
            if (!requestedItem.barterOpen && !requestedItem.tradesOpen) {
              const embed = createWarningEmbed(
                '⚠️ Barter Not Accepted',
                `${targetShopName} is not accepting barters for ${requestedItemName}.`,
                [
                  { name: '📦 Item', value: requestedItemName, inline: true },
                  { name: '🏪 Shop', value: targetShopName, inline: true },
                  { name: '💰 Payment Method', value: 'Barter', inline: true }
                ]
              );
              return interaction.editReply({ embeds: [embed] });
            }
            // Check if buyer has all the offered items with required quantities
            const buyerInventoryCollection = await getInventoryCollection(buyer.name);
            const buyerInventoryItems = await buyerInventoryCollection.find({}).toArray();
            
            // Validate each offered item with its quantity
            for (const offeredItemData of offeredItemsWithQty) {
              const offeredItemName = offeredItemData.itemName;
              const requiredQty = offeredItemData.quantity;
              
              const offeredItem = buyerInventoryItems.find(item => 
                item.itemName && item.itemName.toLowerCase() === offeredItemName.toLowerCase()
              );
              
              // Check if buyer has enough quantity
              const totalQuantity = buyerInventoryItems
                .filter(item => item.itemName && item.itemName.toLowerCase() === offeredItemName.toLowerCase())
                .reduce((sum, item) => sum + (item.quantity || 0), 0);
              
              if (!offeredItem || totalQuantity < requiredQty) {
                const embed = createWarningEmbed(
                  '⚠️ Insufficient Item Quantity',
                  `You don't have enough **${offeredItemName}** in your inventory. You need ${requiredQty}, but you only have ${totalQuantity}.`,
                  [
                    { name: '📦 Required Item', value: offeredItemName, inline: true },
                    { name: '📊 Required Quantity', value: requiredQty.toString(), inline: true },
                    { name: '📊 Available Quantity', value: totalQuantity.toString(), inline: true },
                    { name: '👤 Character', value: buyer.name, inline: true }
                  ]
                );
                return interaction.editReply({ embeds: [embed] });
              }
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
        offeredItem: paymentType === 'barter' ? (offeredItems.length === 1 ? offeredItems[0] : offeredItems.join(', ')) : null,
        offeredItems: paymentType === 'barter' ? offeredItems : [],
        offeredItemsWithQty: paymentType === 'barter' ? offeredItemsWithQty : [],
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
      } else if (paymentType === 'art' && requestedItem.artPrice) {
        priceInfo = requestedItem.artPrice;
      } else if (paymentType === 'barter') {
        if (offeredItemsWithQty.length === 1) {
          priceInfo = `Trading: **${offeredItemsWithQty[0].itemName}** x${offeredItemsWithQty[0].quantity}`;
        } else {
          priceInfo = `Trading: ${offeredItemsWithQty.map(item => `**${item.itemName}** x${item.quantity}`).join(', ')}`;
        }
      }
      
      const fields = [
        { 
          name: '📦 Requested Item', 
          value: `**${requestedItemName}** × ${quantity}`, 
          inline: true 
        },
        { 
          name: '💱 Payment Method', 
          value: paymentDisplay, 
          inline: true 
        },
        { 
          name: '💵 Price', 
          value: priceInfo || 'To be determined', 
          inline: true 
        }
      ];

      if (paymentType === 'barter' && offeredItemsWithQty.length > 0) {
        const offeredItemsDisplay = offeredItemsWithQty.map(item => 
          `• **${item.itemName}** x${item.quantity}`
        ).join('\n');
        fields.push({ 
          name: offeredItemsWithQty.length === 1 ? '🔄 Offered in Trade' : '🔄 Offered in Trade (Multiple Items)', 
          value: offeredItemsDisplay, 
          inline: false 
        });
      }
      
      if (notes) {
        fields.push({ 
          name: '📝 Additional Notes', 
          value: notes, 
          inline: false 
        });
      }
      
      fields.push({ 
        name: '🪪 Fulfillment ID', 
        value: `\`${fulfillmentId}\``, 
        inline: false 
      });

      const embed = createVendingEmbed('barter', {
        title: '🔄 Barter Request Created',
        description: `**${buyer.name}** has requested to purchase from **${shopOwner.name}'s** shop.\n\n**📋 Vendor Instructions:**\nUse \`/vending accept\` with the fulfillment ID below to complete this transaction.`,
        fields,
        footer: `Buyer: ${buyerName} • Request ID: ${fulfillmentId}`
      });
  
      // Tag shop owner if they have a userId
      const replyContent = shopOwner.userId ? `<@${shopOwner.userId}>` : null;
      await interaction.editReply({ content: replyContent, embeds: [embed] });
  
    } catch (error) {
      console.error("[handleVendingBarter]:", error);
      const embed = createErrorEmbed(
        '❌ Barter Request Error',
        'An error occurred while processing the barter request.',
        [
          { name: '💡 Next Steps', value: 'Please try again later. If the problem persists, contact support.', inline: false }
        ]
      );
      await interaction.editReply({ embeds: [embed] });
    }
}
  
// ------------------- handleFulfill -------------------
async function handleFulfill(interaction) {
    let rollbackActions = []; // Track actions for rollback
    
    try {
      await interaction.deferReply();
  
      const fulfillmentId = interaction.options.getString("fulfillmentid");
      if (!fulfillmentId) {
        const embed = createWarningEmbed(
          '⚠️ Missing Fulfillment ID',
          'Please provide a valid `fulfillmentid`.',
          [
            { name: '💡 Usage', value: 'Use the fulfillment ID from the barter request to complete the transaction.', inline: false }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }
  
      // ------------------- Fetch Barter Request -------------------
      let request = await VendingRequest.findOne({ fulfillmentId });
      if (!request) {
        // Try to get from temporary storage as fallback
        const tempRequest = await retrieveVendingRequestFromStorage(fulfillmentId);
        if (!tempRequest) {
          const embed = createWarningEmbed(
            '⚠️ Request Not Found',
            `No pending barter request found with ID **${fulfillmentId}**.`,
            [
              { name: '🪪 Fulfillment ID', value: fulfillmentId, inline: true },
              { name: '💡 Tip', value: 'Make sure the ID is correct and the request hasn\'t expired or been fulfilled.', inline: false }
            ]
          );
          return interaction.editReply({ embeds: [embed] });
        }
        // Convert temp request to match MongoDB format (legacy support)
        request = {
          userCharacterName: tempRequest.userCharacterName,
          vendorCharacterName: tempRequest.vendorCharacterName,
          itemName: tempRequest.itemName,
          quantity: tempRequest.quantity,
          paymentMethod: tempRequest.paymentMethod,
          offeredItem: tempRequest.offeredItem,
          offeredItems: tempRequest.offeredItems || (tempRequest.offeredItem ? [tempRequest.offeredItem] : []),
          offeredItemsWithQty: tempRequest.offeredItemsWithQty || (tempRequest.offeredItem ? [{ itemName: tempRequest.offeredItem, quantity: 1 }] : (tempRequest.offeredItems ? tempRequest.offeredItems.map(itemName => ({ itemName, quantity: 1 })) : [])),
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
        const embed = createWarningEmbed(
          '⚠️ Request Expired',
          'This request has expired.',
          [
            { name: '💡 Solution', value: 'Please create a new request.', inline: false }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }
  
      const {
        userCharacterName,
        vendorCharacterName,
        itemName,
        quantity,
        paymentMethod,
        offeredItem,
        offeredItems: requestOfferedItems,
        offeredItemsWithQty: requestOfferedItemsWithQty,
        notes,
        buyerId,
        buyerUsername
      } = request;
      
      // Support both new array format with quantities and legacy single item format
      let offeredItems = [];
      let offeredItemsWithQty = [];
      
      if (requestOfferedItemsWithQty && requestOfferedItemsWithQty.length > 0) {
        // New format with quantities
        offeredItemsWithQty = requestOfferedItemsWithQty;
        offeredItems = requestOfferedItemsWithQty.map(item => item.itemName);
      } else if (requestOfferedItems && requestOfferedItems.length > 0) {
        // Legacy format without quantities - default to quantity 1
        offeredItems = requestOfferedItems;
        offeredItemsWithQty = requestOfferedItems.map(itemName => ({ itemName, quantity: 1 }));
      } else if (offeredItem) {
        // Single item legacy format
        offeredItems = [offeredItem];
        offeredItemsWithQty = [{ itemName: offeredItem, quantity: 1 }];
      }
  
      // ------------------- Fetch Characters -------------------
      const buyer = await fetchCharacterByName(userCharacterName);
      const vendor = await fetchCharacterByName(vendorCharacterName);

      if (!buyer || !vendor) {
        const embed = createErrorEmbed(
          '❌ Character Not Found',
          'Buyer or vendor character could not be found.',
          [
            { name: '👤 Buyer', value: userCharacterName || 'Unknown', inline: true },
            { name: '👤 Vendor', value: vendorCharacterName || 'Unknown', inline: true }
          ]
        );
        return interaction.editReply({ embeds: [embed] });
      }

      // ------------------- Check if Vendor Self-Purchase -------------------
      const isVendorSelfPurchase = buyer.userId === vendor.userId || request.isVendorSelfPurchase;

      // ------------------- Get Vending Inventory Model -------------------
      const VendingInventory = await getVendingModel(vendor.name);

      // ------------------- Initial Validation (Before Marking as Processing) -------------------
      // Validate conditions first to provide better error messages before atomic lock
      console.log('[vendingHandler.js] [handleFulfillBarter] Starting fulfillment process', {
        fulfillmentId,
        buyerName: buyer.name,
        vendorName: vendor.name,
        itemName: request.itemName,
        quantity: request.quantity,
        paymentMethod: request.paymentMethod,
        currentRequestStatus: request.status
      });
      
      // Do initial validation to catch errors early
      const initialValidation = await validateFulfillmentRequest(request, buyer, vendor, VendingInventory, false);
      if (!initialValidation.valid) {
        console.log('[vendingHandler.js] [handleFulfillBarter] ❌ Initial validation failed', {
          fulfillmentId,
          errors: initialValidation.errors,
          requestStatus: request.status
        });
        
        // Format error message as embed
        const errorEmbed = createValidationErrorEmbed(initialValidation.errors, fulfillmentId);
        return interaction.editReply({ embeds: [errorEmbed] });
      }
      
      // ------------------- Mark Request as Processing (Atomic) -------------------
      // This prevents duplicate processing - only do this after initial validation passes
      let processingRequest;
      try {
        processingRequest = await markRequestAsProcessing(fulfillmentId);
      } catch (error) {
        console.log('[vendingHandler.js] [handleFulfillBarter] ❌ Error marking request as processing', {
          fulfillmentId,
          error: error.message,
          stack: error.stack
        });
        // Use the descriptive error message from markRequestAsProcessing
        if (error.message.includes('purchase request')) {
          return interaction.editReply(`❌ ${error.message}`);
        }
        // Fallback for any other errors
        return interaction.editReply(`⚠️ This request cannot be processed. It may have already been processed, expired, or been cancelled.`);
      }

      // ------------------- Re-validate All Conditions -------------------
      console.log('[vendingHandler.js] [handleFulfillBarter] Re-validating request after marking as processing', {
        fulfillmentId,
        requestStatus: processingRequest.status
      });
      
      // Pass skipProcessingCheck=true since we just marked it as processing ourselves
      const validation = await validateFulfillmentRequest(processingRequest, buyer, vendor, VendingInventory, true);
      if (!validation.valid) {
        console.log('[vendingHandler.js] [handleFulfillBarter] ❌ Validation failed after marking as processing', {
          fulfillmentId,
          errors: validation.errors,
          requestStatus: processingRequest.status
        });
        
        // Reset status to pending if validation fails
        await VendingRequest.updateOne(
          { fulfillmentId },
          { $set: { status: 'pending' } }
        ).catch((resetError) => {
          console.log('[vendingHandler.js] [handleFulfillBarter] ⚠️ Failed to reset status to pending', {
            fulfillmentId,
            error: resetError.message
          });
        });
        
        // Format error message as embed
        const errorEmbed = createValidationErrorEmbed(validation.errors, fulfillmentId);
        return interaction.editReply({ embeds: [errorEmbed] });
      }
      
      console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Validation passed, proceeding with transaction', {
        fulfillmentId
      });

      const stockItem = validation.stockItem;

      // ------------------- Process Fulfillment (Multi-Database Operations) -------------------
      // Note: Cannot use single transaction across multiple MongoDB connections
      // Using atomic operations with manual rollback on errors
      // Using outer rollbackActions so outer error handler can access it
      rollbackActions = [];
      
      // Declare variables outside try block for use in error handler
      let totalCost = null;
      let perItemPrice = null;
      let buyerTokenBalance = null;
      let vendorTokenBalance = null;
      
      try {
        // ------------------- Handle Token Payment -------------------
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

          // Atomically transfer tokens using MongoDB session to prevent conflicts
          console.log('[vendingHandler.js] [handleFulfillBarter] Transferring tokens...', {
            fulfillmentId,
            buyerId,
            vendorId: vendor.userId,
            totalCost
          });
          
          try {
            // Use transaction to ensure both token updates happen atomically
            // If transaction fails, try individual updates with retry logic as fallback
            try {
              await runWithTransaction(async (session) => {
                buyerTokenBalance = await atomicUpdateTokenBalance(buyerId, -totalCost, session);
                rollbackActions.push({ type: 'token', userId: buyerId, amount: totalCost });
                
                // For self-purchases, skip vendor token addition (buyer and vendor are the same)
                if (!isVendorSelfPurchase) {
                  vendorTokenBalance = await atomicUpdateTokenBalance(vendor.userId, totalCost, session);
                  rollbackActions.push({ type: 'token', userId: vendor.userId, amount: -totalCost });
                } else {
                  // For self-purchases, vendor balance is the same as buyer balance
                  vendorTokenBalance = buyerTokenBalance;
                }
              });
              
              console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Tokens transferred (transaction)', {
                fulfillmentId,
                buyerBalance: buyerTokenBalance,
                vendorBalance: vendorTokenBalance,
                isVendorSelfPurchase
              });
            } catch (transactionError) {
              // Fallback: Try individual updates with retry logic if transaction fails
              console.warn('[vendingHandler.js] [handleFulfillBarter] ⚠️ Transaction failed, attempting fallback individual updates', {
                fulfillmentId,
                error: transactionError.message
              });
              
              // Get current balances before attempting fallback
              const buyerUser = await User.findOne({ discordId: buyerId });
              const vendorUser = await User.findOne({ discordId: vendor.userId });
              const buyerBalanceBefore = buyerUser?.tokens || 0;
              const vendorBalanceBefore = vendorUser?.tokens || 0;
              
              // Attempt buyer update with retry
              buyerTokenBalance = await atomicUpdateTokenBalance(buyerId, -totalCost, null, MAX_RETRY_ATTEMPTS);
              rollbackActions.push({ type: 'token', userId: buyerId, amount: totalCost, fallback: true });
              
              // For self-purchases, skip vendor token addition (buyer and vendor are the same)
              if (!isVendorSelfPurchase) {
                try {
                  // Attempt vendor update with retry
                  vendorTokenBalance = await atomicUpdateTokenBalance(vendor.userId, totalCost, null, MAX_RETRY_ATTEMPTS);
                  rollbackActions.push({ type: 'token', userId: vendor.userId, amount: -totalCost, fallback: true });
                  
                  console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Tokens transferred (fallback)', {
                    fulfillmentId,
                    buyerBalance: buyerTokenBalance,
                    vendorBalance: vendorTokenBalance
                  });
                } catch (vendorError) {
                  // Rollback buyer update if vendor update fails
                  console.error('[vendingHandler.js] [handleFulfillBarter] ❌ Vendor token update failed, rolling back buyer update', {
                    fulfillmentId,
                    vendorError: vendorError.message
                  });
                  try {
                    await atomicUpdateTokenBalance(buyerId, totalCost, null, MAX_RETRY_ATTEMPTS);
                    console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Buyer token rollback successful', { fulfillmentId });
                  } catch (rollbackError) {
                    console.error('[vendingHandler.js] [handleFulfillBarter] ❌ Buyer token rollback failed', {
                      fulfillmentId,
                      rollbackError: rollbackError.message,
                      buyerId,
                      amount: totalCost
                    });
                  }
                  throw new Error(`Failed to update vendor tokens: ${vendorError.message}. Buyer tokens were rolled back.`);
                }
              } else {
                // For self-purchases, vendor balance is the same as buyer balance
                vendorTokenBalance = buyerTokenBalance;
                
                console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Tokens deducted (fallback, self-purchase)', {
                  fulfillmentId,
                  buyerBalance: buyerTokenBalance,
                  vendorBalance: vendorTokenBalance,
                  isVendorSelfPurchase: true
                });
              }
            }
          } catch (tokenError) {
            console.error('[vendingHandler.js] [handleFulfillBarter] ❌ Token transfer failed', {
              fulfillmentId,
              buyerId,
              vendorId: vendor.userId,
              totalCost,
              error: tokenError.message,
              stack: tokenError.stack
            });
            throw new Error(`Failed to transfer tokens: ${tokenError.message}`);
          }
        }

        // ------------------- Atomically Update Stock (Vending Connection) -------------------
        console.log('[vendingHandler.js] [handleFulfillBarter] Updating stock...', {
          fulfillmentId,
          itemId: stockItem._id,
          quantity
        });
        
        try {
          // Don't pass session - VendingInventory uses different connection
          const updatedStock = await atomicUpdateStockQuantity(VendingInventory, stockItem._id, -quantity, quantity);
          if (!updatedStock) {
            throw new Error('Failed to update stock - insufficient quantity or item not found');
          }
          rollbackActions.push({ type: 'stock', itemId: stockItem._id, quantity: quantity, VendingInventory });
          stockUpdated = true;
          console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Stock updated', {
            fulfillmentId,
            newStockQty: updatedStock.stockQty
          });
        } catch (stockError) {
          console.error('[vendingHandler.js] [handleFulfillBarter] ❌ Stock update failed', {
            fulfillmentId,
            error: stockError.message
          });
          throw new Error(`Failed to update stock: ${stockError.message}`);
        }

        // ------------------- Add to Buyer's Inventory (Inventories Native Connection) -------------------
        const buyerInventory = await getInventoryCollection(buyer.name);
        let itemDetails;
        if (itemName.includes('+')) {
          itemDetails = await ItemModel.findOne({ itemName: itemName });
        } else {
          itemDetails = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') } });
        }
        
        console.log('[vendingHandler.js] [handleFulfillBarter] Adding item to buyer inventory...', {
          fulfillmentId,
          itemName,
          itemDetailsFound: !!itemDetails
        });
        
        try {
          // Don't pass session - buyerInventory uses different connection
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
          inventoryInserted = true;
          console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Item added to buyer inventory', {
            fulfillmentId
          });
          
          // Log to InventoryLog database collection
          try {
            const interactionUrl = interaction 
              ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
              : '';
            await logItemAcquisitionToDatabase(buyer, itemDetails || { itemName: itemName }, {
              quantity: quantity,
              obtain: 'Bought',
              location: vendor.name || buyer.currentVillage || 'Unknown',
              link: interactionUrl
            });
          } catch (logError) {
            // Don't fail the transaction if logging fails
            console.error('[vendingHandler.js] [handleFulfillBarter] ⚠️ Failed to log to InventoryLog:', logError.message);
          }
        } catch (inventoryError) {
          console.error('[vendingHandler.js] [handleFulfillBarter] ❌ Inventory insert failed', {
            fulfillmentId,
            error: inventoryError.message
          });
          throw new Error(`Failed to add item to inventory: ${inventoryError.message}`);
        }

        // If this was a barter, remove the offered items from buyer's inventory with correct quantities
        if (paymentMethod === 'barter' && offeredItemsWithQty.length > 0) {
          for (const offeredItemData of offeredItemsWithQty) {
            const offeredItemName = offeredItemData.itemName;
            const quantityToRemove = offeredItemData.quantity || 1;
            
            try {
              // Build filter for atomic decrement (same as inventoryUtils: + exact, else case-insensitive)
              const barterItemFilter = offeredItemName.includes('+')
                ? { characterId: buyer._id, itemName: offeredItemName.trim(), quantity: { $gte: 1 } }
                : { characterId: buyer._id, itemName: { $regex: new RegExp(`^${escapeRegExp(offeredItemName.trim())}$`, 'i') }, quantity: { $gte: 1 } };

              // Pre-check total available
              const matchingItems = await buyerInventory.find(
                offeredItemName.includes('+')
                  ? { characterId: buyer._id, itemName: offeredItemName.trim(), quantity: { $gt: 0 } }
                  : { characterId: buyer._id, itemName: { $regex: new RegExp(`^${escapeRegExp(offeredItemName.trim())}$`, 'i') }, quantity: { $gt: 0 } }
              ).toArray();
              const totalAvailable = matchingItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
              if (matchingItems.length === 0 || totalAvailable < quantityToRemove) {
                console.warn('[vendingHandler.js] [handleFulfillBarter] ⚠️ Offered item not found or insufficient in buyer inventory', {
                  fulfillmentId,
                  offeredItem: offeredItemName,
                  required: quantityToRemove,
                  available: totalAvailable
                });
                continue;
              }

              // Atomic one-at-a-time removal to prevent negative quantity under concurrency
              let removedCount = 0;
              for (let i = 0; i < quantityToRemove; i++) {
                const doc = await buyerInventory.findOneAndUpdate(
                  barterItemFilter,
                  { $inc: { quantity: -1 } },
                  { returnDocument: 'after', sort: { _id: 1 } }
                );
                if (!doc) break;
                removedCount++;
                if ((doc.quantity || 0) <= 0) {
                  await buyerInventory.deleteOne({ _id: doc._id });
                }
                rollbackActions.push({
                  type: 'barter',
                  buyerInventory,
                  itemName: offeredItemName,
                  quantity: 1,
                  itemId: doc._id
                });
              }
              if (removedCount < quantityToRemove) {
                console.warn('[vendingHandler.js] [handleFulfillBarter] ⚠️ Atomic barter removal removed only', removedCount, 'of', quantityToRemove, offeredItemName);
              }

              // Log removal to InventoryLog database collection (once per item type)
              try {
                let offeredItemDetails;
                if (offeredItemName.includes('+')) {
                  offeredItemDetails = await ItemModel.findOne({ itemName: offeredItemName });
                } else {
                  offeredItemDetails = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${escapeRegExp(offeredItemName)}$`, 'i') } });
                }
                const interactionUrl = interaction
                  ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
                  : '';
                await logItemRemovalToDatabase(buyer, offeredItemDetails || { itemName: offeredItemName }, {
                  quantity: removedCount,
                  obtain: 'Barter Trade',
                  location: vendor.name || buyer.currentVillage || 'Unknown',
                  link: interactionUrl
                });
              } catch (logError) {
                console.error('[vendingHandler.js] [handleFulfillBarter] ⚠️ Failed to log barter item removal to InventoryLog:', logError.message);
              }

              // Google Sheets logging removed
                if (false) { // Google Sheets functionality removed
                  try {
                    // Fetch item details for proper categorization
                    let offeredItemDetails;
                    if (offeredItemName.includes('+')) {
                      offeredItemDetails = await ItemModel.findOne({ itemName: offeredItemName });
                    } else {
                      offeredItemDetails = await ItemModel.findOne({ itemName: { $regex: new RegExp(`^${escapeRegExp(offeredItemName)}$`, 'i') } });
                    }
                    
                    const category = Array.isArray(offeredItemDetails?.category) ? offeredItemDetails.category.join(", ") : (offeredItemDetails?.category || "");
                    const type = Array.isArray(offeredItemDetails?.type) ? offeredItemDetails.type.join(", ") : (offeredItemDetails?.type || "");
                    const subtype = Array.isArray(offeredItemDetails?.subtype) ? offeredItemDetails.subtype.join(", ") : (offeredItemDetails?.subtype || "");
                    const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
                    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
                    const uniqueSyncId = uuidv4();
                    
                    // Create removal log entry (negative quantity for removal)
                    const removalLogEntry = [
                      buyer.name, // Character Name (A)
                      offeredItemName, // Item Name (B)
                      -removedCount, // Qty of Item (C) - negative for removal
                      category, // Category (D)
                      type, // Type (E)
                      subtype, // Subtype (F)
                      'Barter Trade', // Obtain (G)
                      buyer.job || "", // Job (H)
                      buyer.perk || "", // Perk (I)
                      vendor.name, // Location (Vendor name) (J)
                      interactionUrl, // Link (K)
                      formattedDateTime, // Date/Time (L)
                      uniqueSyncId // Confirmed Sync (M)
                    ];
                    
                    // Google Sheets logging removed
                    console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Barter item removal logged to database', {
                      fulfillmentId,
                      offeredItem: offeredItemName,
                      quantity: removedCount
                    });
                  } catch (sheetError) {
                    console.error('[vendingHandler.js] [handleFulfillBarter] ⚠️ Failed to log barter item removal to Google Sheets', {
                      fulfillmentId,
                      offeredItem: offeredItemName,
                      error: sheetError.message
                    });
                    // Don't fail the transaction if sheet logging fails
                  }
                }
                
                console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Barter item removed from buyer inventory', {
                  fulfillmentId,
                  offeredItem: offeredItemName,
                  removed: removedCount,
                  requested: quantityToRemove
                });
            } catch (barterError) {
              console.error('[vendingHandler.js] [handleFulfillBarter] ⚠️ Failed to remove barter item', {
                fulfillmentId,
                offeredItem: offeredItemName,
                quantity: quantityToRemove,
                error: barterError.message
              });
              // Don't fail the transaction for this - barter item removal is secondary
            }
          }
        }

        // ------------------- Mark Request as Completed (Default Mongoose Connection) -------------------
        await VendingRequest.updateOne(
          { fulfillmentId },
          { 
            $set: { 
              status: 'completed',
              processedAt: new Date()
            }
          }
        );
        
        console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Request marked as completed', {
          fulfillmentId
        });

        // Store values for use outside
        request._transactionData = {
          totalCost,
          perItemPrice,
          buyerTokenBalance,
          vendorTokenBalance
        };
        
      } catch (error) {
        // ------------------- Rollback on Error -------------------
        console.error('[vendingHandler.js] [handleFulfillBarter] ❌ Error during fulfillment, rolling back...', {
          fulfillmentId,
          error: error.message,
          stack: error.stack,
          rollbackActions: rollbackActions.length
        });
        
        // Perform rollback in reverse order
        for (const action of rollbackActions.reverse()) {
          try {
            if (action.type === 'token') {
              // Rollback token transfer
              await atomicUpdateTokenBalance(action.userId, -action.amount);
              console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Rolled back token transfer', {
                fulfillmentId,
                userId: action.userId,
                amount: -action.amount
              });
            } else if (action.type === 'stock') {
              // Rollback stock update
              await atomicUpdateStockQuantity(action.VendingInventory, action.itemId, action.quantity, 0);
              console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Rolled back stock update', {
                fulfillmentId,
                itemId: action.itemId,
                quantity: action.quantity
              });
            } else if (action.type === 'inventory') {
              // Rollback inventory insert - try to remove the item
              await action.buyerInventory.deleteOne({ itemName: action.itemName, characterId: buyer._id });
              console.log('[vendingHandler.js] [handleFulfillBarter] ✓ Rolled back inventory insert', {
                fulfillmentId,
                itemName: action.itemName
              });
            }
          } catch (rollbackError) {
            console.error('[vendingHandler.js] [handleFulfillBarter] ⚠️ Failed to rollback action', {
              fulfillmentId,
              actionType: action.type,
              error: rollbackError.message
            });
          }
        }
        
        // Reset request status to pending on error
        await VendingRequest.updateOne(
          { fulfillmentId },
          { $set: { status: 'pending' } }
        ).catch(() => {});
        
        throw error;
      }

      // Use transaction data if available (already set above)
      if (request._transactionData) {
        totalCost = request._transactionData.totalCost;
        perItemPrice = request._transactionData.perItemPrice;
      }

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
            // Google Sheets token tracker logging removed
            console.log(`[vendingHandler.js]: ✅ Logged token transaction to buyer's tracker for user ${buyerId}`);
          } catch (buyerSheetError) {
            console.error(`[vendingHandler.js]: ❌ Error logging to buyer's token tracker:`, buyerSheetError.message);
            // Don't fail the transaction - this is just logging
          }
        }

        // Google Sheets token transaction logging removed
      }
  
      // Google Sheets vendor shop update removed
      const vendorShopLink = vendor.shopLink || vendor.vendingSetup?.shopLink;
      if (false) { // Google Sheets functionality removed
        try {
          // Google Sheets code removed
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
          } catch (sheetError) {
          console.error('[handleFulfill]: Error updating vendor sheet:', sheetError.message);
          // Don't fail the transaction - this is just logging
        }
      }

      // Google Sheets buyer inventory update removed
      const buyerInventoryLink = buyer.inventory;
      if (false) { // Google Sheets functionality removed
        try {
          // Google Sheets code removed
          const range = null; // Google Sheets removed
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
          
          // Google Sheets buyer inventory update removed
          if (false) { // Google Sheets functionality removed
            // Google Sheets code removed
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
        
        // Log to InventoryLog database collection
        try {
          await logItemAcquisitionToDatabase(buyer, itemDetails || { itemName: itemName }, {
            quantity: quantity,
            obtain: 'Bought',
            location: vendor.name || buyer.currentVillage || 'Unknown',
            link: interactionUrl
          });
        } catch (logError) {
          // Don't fail the transaction if logging fails
          console.error('[handleFulfill]: Error logging to InventoryLog:', logError.message);
        }
      } else {
        console.error('[handleFulfill]: No inventory link for buyer:', buyer.name);
        
        // Still log to InventoryLog even if no Google Sheets link
        try {
          await logItemAcquisitionToDatabase(buyer, itemDetails || { itemName: itemName }, {
            quantity: quantity,
            obtain: 'Bought',
            location: vendor.name || buyer.currentVillage || 'Unknown',
            link: interactionUrl
          });
        } catch (logError) {
          // Don't fail the transaction if logging fails
          console.error('[handleFulfill]: Error logging to InventoryLog:', logError.message);
        }
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
      } else if (paymentMethod === 'art' && stockItem.artPrice) {
        priceInfo = stockItem.artPrice;
      } else if (paymentMethod === 'barter' && offeredItemsWithQty.length > 0) {
        if (offeredItemsWithQty.length === 1) {
          priceInfo = `Trading: **${offeredItemsWithQty[0].itemName}** x${offeredItemsWithQty[0].quantity}`;
        } else {
          priceInfo = `Trading: ${offeredItemsWithQty.map(item => `**${item.itemName}** x${item.quantity}`).join(', ')}`;
        }
      }
      
      const fields = [
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
      ];

      if (paymentMethod === 'barter' && offeredItemsWithQty.length > 0) {
        const offeredItemsDisplay = offeredItemsWithQty.map(item => 
          `• **${item.itemName}** x${item.quantity}`
        ).join('\n');
        fields.push({ 
          name: offeredItemsWithQty.length === 1 ? '🔄 Traded Item' : '🔄 Traded Items', 
          value: offeredItemsDisplay, 
          inline: false 
        });
      }

      if (notes) {
        fields.push({ 
          name: '📝 Additional Notes', 
          value: notes, 
          inline: false 
        });
      }

      const embed = createVendingEmbed('fulfill', {
        title: '✅ Barter Fulfilled',
        description: `**${vendor.name}** has successfully fulfilled a barter request for **${buyer.name}**.\n\nThe transaction has been completed and items have been transferred.`,
        fields,
        footer: 'Transaction completed successfully'
      });
  
      await interaction.editReply({ embeds: [embed] });
  
    } catch (error) {
      console.error("[handleFulfill]:", error);
      
      // Attempt rollback if we have rollback actions
      if (rollbackActions.length > 0) {
        console.error("[handleFulfill]: Attempting rollback...", {
          rollbackActionsCount: rollbackActions.length,
          fulfillmentId: interaction?.options?.getString("fulfillmentid") || 'unknown'
        });
        try {
          // Reverse to undo in opposite order
          for (const action of rollbackActions.reverse()) {
            try {
              if (action.type === 'token') {
                // Use retry logic for token rollback
                await atomicUpdateTokenBalance(action.userId, action.amount, null, MAX_RETRY_ATTEMPTS);
                console.log(`[handleFulfill]: ✓ Rolled back token transfer`, {
                  userId: action.userId,
                  amount: action.amount,
                  fallback: action.fallback || false
                });
              } else if (action.type === 'stock') {
                await action.VendingInventory.updateOne(
                  { _id: action.itemId },
                  { $inc: { stockQty: action.quantity } }
                );
                console.log(`[handleFulfill]: ✓ Rolled back stock update`, {
                  itemId: action.itemId,
                  quantity: action.quantity
                });
              } else if (action.type === 'inventory') {
                await action.buyerInventory.deleteOne({
                  itemName: action.itemName,
                  quantity: action.quantity
                });
                console.log(`[handleFulfill]: ✓ Rolled back inventory insert`, {
                  itemName: action.itemName,
                  quantity: action.quantity
                });
              }
            } catch (rollbackItemError) {
              // Log detailed error but continue with other rollback actions
              const errorDetails = {
                actionType: action.type,
                userId: action.userId,
                itemId: action.itemId,
                itemName: action.itemName,
                amount: action.amount,
                quantity: action.quantity,
                errorMessage: rollbackItemError.message,
                errorCode: rollbackItemError.code,
                errorName: rollbackItemError.name
              };
              console.error(`[handleFulfill]: ❌ Rollback failed for ${action.type}`, errorDetails);
              
              // If token rollback fails, this is critical - log with high priority
              if (action.type === 'token') {
                console.error(`[handleFulfill]: ⚠️ CRITICAL: Token rollback failed - manual intervention may be required`, {
                  userId: action.userId,
                  amount: action.amount,
                  originalError: error.message,
                  rollbackError: rollbackItemError.message
                });
              }
            }
          }
          console.log("[handleFulfill]: Rollback completed", {
            totalActions: rollbackActions.length,
            fulfillmentId: interaction?.options?.getString("fulfillmentid") || 'unknown'
          });
        } catch (rollbackError) {
          console.error("[handleFulfill]: Rollback error:", {
            error: rollbackError.message,
            stack: rollbackError.stack,
            fulfillmentId: interaction?.options?.getString("fulfillmentid") || 'unknown'
          });
        }
      }

      // Reset request status if it was marked as processing
      const fulfillmentId = interaction?.options?.getString("fulfillmentid");
      if (fulfillmentId) {
        await VendingRequest.updateOne(
          { fulfillmentId },
          { $set: { status: 'pending' } }
        ).catch(() => {}); // Ignore errors
      }

      // Provide user-friendly error message
      let errorTitle = '❌ Fulfillment Error';
      let errorDescription = 'An error occurred while fulfilling the barter.';
      let errorFields = [];
      
      if (error.message) {
        if (error.message.includes('Insufficient')) {
          errorTitle = '❌ Insufficient Balance';
          errorDescription = error.message;
          errorFields = [{ name: '💡 Solution', value: 'Please check your balance and try again.', inline: false }];
        } else if (error.message.includes('not available')) {
          errorTitle = '❌ Item Not Available';
          errorDescription = error.message;
          errorFields = [{ name: '💡 Note', value: 'The item may have been removed or is no longer available.', inline: false }];
        } else if (error.message.includes('Validation Failed') || error.message.includes('Validation')) {
          errorTitle = '❌ Validation Error';
          errorDescription = error.message;
        } else if (error.message.includes('purchase request')) {
          errorTitle = '❌ Request Cannot Be Processed';
          errorDescription = error.message;
        } else if (error.message.includes('not available for processing')) {
          errorTitle = '❌ Request Cannot Be Processed';
          errorDescription = 'This request cannot be processed.';
          errorFields = [{ name: '💡 Possible Reasons', value: 'It may have already been processed, expired, or been cancelled.', inline: false }];
        } else {
          errorDescription = error.message;
          errorFields = [{ name: '💡 Next Steps', value: 'Please try again later. If the problem persists, contact support.', inline: false }];
        }
      } else {
        errorFields = [{ name: '💡 Next Steps', value: 'Please try again later. If the problem persists, contact support.', inline: false }];
      }

      const embed = createErrorEmbed(errorTitle, errorDescription, errorFields);
      await interaction.editReply({ embeds: [embed] });
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
      const embed = createErrorEmbed(
        '❌ Character Not Found',
        'Character not found or doesn\'t belong to you.'
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ------------------- Job Validation -------------------
    if (character.job?.toLowerCase() !== 'shopkeeper' && character.job?.toLowerCase() !== 'merchant') {
      const embed = createErrorEmbed(
        '❌ Invalid Job Type',
        'Only Shopkeepers and Merchants can upgrade their shop pouches.',
        [
          { name: '💼 Current Job', value: character.job || 'None', inline: true },
          { name: '✅ Required Jobs', value: 'Shopkeeper or Merchant', inline: true }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ------------------- Shop Setup Validation -------------------
    // Log setup validation details for debugging
    console.log('[vendingHandler.js] [handlePouchUpgrade] Setup Validation Debug:', {
      characterName: character.name,
      characterId: character._id?.toString(),
      hasVendingSetup: !!character.vendingSetup,
      vendingSetup: character.vendingSetup,
      hasSetupDate: !!character.vendingSetup?.setupDate,
      setupDate: character.vendingSetup?.setupDate,
      validationCheck: {
        setupDateExists: !!character.vendingSetup?.setupDate,
        willPass: !!character.vendingSetup?.setupDate,
        willFail: !character.vendingSetup?.setupDate
      }
    });

    if (!character.vendingSetup?.setupDate) {
      console.log('[vendingHandler.js] [handlePouchUpgrade] ❌ Setup validation failed for character:', character.name);
      console.log('[vendingHandler.js] [handlePouchUpgrade] Reason: vendingSetup?.setupDate =', character.vendingSetup?.setupDate);
      const embed = createErrorEmbed(
        '❌ Shop Setup Required',
        `${characterName} doesn't have a shop set up yet.`,
        [
          { name: '⚙️ Setup Steps', value: 'Please set up your shop first using `/vending setup` before upgrading your pouch.', inline: false }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
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
      const embed = createErrorEmbed(
        '❌ Invalid Upgrade Path',
        'Cannot downgrade or select the same pouch tier.',
        [
          { name: '📦 Current Tier', value: `${currentPouch.toUpperCase()} (${pouchTiers[currentPouch].slots} slots)`, inline: true },
          { name: '📦 Selected Tier', value: `${newPouchType.toUpperCase()} (${pouchTiers[newPouchType].slots} slots)`, inline: true }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // Check if skipping tiers
    if (newTier - currentTier > 1) {
      const requiredTier = Object.keys(pouchTiers)[currentTier + 1];
      const embed = createErrorEmbed(
        '❌ Cannot Skip Tiers',
        `You must upgrade to ${requiredTier.toUpperCase()} first before upgrading to ${newPouchType.toUpperCase()}.`,
        [
          { name: '📦 Current Tier', value: `${currentPouch.toUpperCase()}`, inline: true },
          { name: '📦 Required Next', value: `${requiredTier.toUpperCase()}`, inline: true },
          { name: '📦 Target Tier', value: `${newPouchType.toUpperCase()}`, inline: true }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
    }

    // ------------------- Token Balance Check -------------------
    const userTokens = await getTokenBalance(userId);
    const upgradeCost = pouchTiers[newPouchType].cost;

    if (userTokens < upgradeCost) {
      const embed = createErrorEmbed(
        '❌ Insufficient Tokens',
        'Not enough tokens for this upgrade.',
        [
          { name: '💰 Required', value: `${upgradeCost} tokens`, inline: true },
          { name: '💎 Your Balance', value: `${userTokens} tokens`, inline: true },
          { name: '📊 Shortage', value: `${upgradeCost - userTokens} tokens`, inline: true }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
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

    const confirmEmbed = createVendingEmbed('info', {
      title: '🛍️ Confirm Pouch Upgrade',
      description: `Are you sure you want to upgrade ${characterName}'s shop pouch?`,
      color: '#FFD700',
      fields: [
        { name: '📦 Current Pouch', value: `${currentPouch.toUpperCase()} (${pouchTiers[currentPouch].slots} slots)`, inline: true },
        { name: '📦 New Pouch', value: `${newPouchType.toUpperCase()} (${pouchTiers[newPouchType].slots} slots)`, inline: true },
        { name: '💰 Upgrade Cost', value: `${upgradeCost} tokens`, inline: true },
        { name: '💎 Your Balance', value: `${userTokens} tokens`, inline: true },
        { name: '💵 Balance After', value: `${userTokens - upgradeCost} tokens`, inline: true }
      ],
      footer: 'Click Confirm to proceed with the upgrade'
    });

    await interaction.editReply({
      embeds: [confirmEmbed],
      components: [row]
    });

  } catch (error) {
    console.error('[handlePouchUpgrade]: Error:', error);
    const embed = createErrorEmbed(
      '❌ Pouch Upgrade Error',
      'An error occurred while processing the pouch upgrade.',
      [
        { name: '💡 Next Steps', value: 'Please try again. If the problem persists, contact support.', inline: false }
      ]
    );
    await interaction.editReply({ embeds: [embed] });
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
      const embed = createErrorEmbed(
        '❌ Character Not Found',
        'Character not found or doesn\'t belong to you.'
      );
      return interaction.update({
        embeds: [embed],
        components: []
      });
    }

    // ------------------- Shop Setup Validation -------------------
    // Log setup validation details for debugging
    console.log('[vendingHandler.js] [handlePouchUpgradeConfirm] Setup Validation Debug:', {
      characterName: character.name,
      characterId: character._id?.toString(),
      hasVendingSetup: !!character.vendingSetup,
      vendingSetup: character.vendingSetup,
      hasSetupDate: !!character.vendingSetup?.setupDate,
      setupDate: character.vendingSetup?.setupDate,
      validationCheck: {
        setupDateExists: !!character.vendingSetup?.setupDate,
        willPass: !!character.vendingSetup?.setupDate,
        willFail: !character.vendingSetup?.setupDate
      }
    });

    if (!character.vendingSetup?.setupDate) {
      console.log('[vendingHandler.js] [handlePouchUpgradeConfirm] ❌ Setup validation failed for character:', character.name);
      console.log('[vendingHandler.js] [handlePouchUpgradeConfirm] Reason: vendingSetup?.setupDate =', character.vendingSetup?.setupDate);
      const embed = createErrorEmbed(
        '❌ Shop Setup Required',
        `${characterName} doesn't have a shop set up yet.`,
        [
          { name: '⚙️ Setup Steps', value: 'Please set up your shop first using `/vending setup` before upgrading your pouch.', inline: false }
        ]
      );
      return interaction.update({
        embeds: [embed],
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
      const embed = createErrorEmbed(
        '❌ Invalid Upgrade Path',
        'Invalid upgrade path. Please try the upgrade command again.',
        [
          { name: '💡 Tip', value: 'You can only upgrade one tier at a time.', inline: false }
        ]
      );
      return interaction.update({
        embeds: [embed],
        components: []
      });
    }

    // ------------------- Token Balance Check -------------------
    const userTokens = await getTokenBalance(userId);
    const upgradeCost = pouchTiers[newPouchType].cost;

    if (userTokens < upgradeCost) {
      const embed = createErrorEmbed(
        '❌ Insufficient Tokens',
        'Not enough tokens for this upgrade. Your balance has changed since the initial check.',
        [
          { name: '💰 Required', value: `${upgradeCost} tokens`, inline: true },
          { name: '💎 Your Balance', value: `${userTokens} tokens`, inline: true }
        ]
      );
      return interaction.update({
        embeds: [embed],
        components: []
      });
    }

    // ------------------- Process Upgrade -------------------
    // Update token balance
    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
    await updateTokenBalance(userId, -upgradeCost, {
      category: 'vending',
      description: `Pouch upgrade (${characterName} → ${newPouchType.toUpperCase()})`,
      link: interactionUrl
    });

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
    const successEmbed = createSuccessEmbed(
      '✅ Pouch Upgrade Successful!',
      `${characterName}'s shop pouch has been upgraded!`,
      [
        { name: '📦 New Pouch Tier', value: newPouchType.toUpperCase(), inline: true },
        { name: '📊 New Slot Capacity', value: `${pouchTiers[newPouchType].slots} slots`, inline: true },
        { name: '💰 Tokens Spent', value: `${upgradeCost} tokens`, inline: true },
        { name: '💎 Remaining Tokens', value: `${userTokens - upgradeCost} tokens`, inline: true }
      ]
    );
    
    if (character.icon) {
      successEmbed.setThumbnail(character.icon);
    }

    await interaction.update({
      embeds: [successEmbed],
      components: []
    });

  } catch (error) {
    console.error('[handlePouchUpgradeConfirm]: Error:', error);
    const embed = createErrorEmbed(
      '❌ Upgrade Error',
      'An error occurred while processing the upgrade.',
      [
        { name: '💡 Next Steps', value: 'Please try again. If the problem persists, contact support.', inline: false }
      ]
    );
    await interaction.update({
      embeds: [embed],
      components: []
    });
  }
}

// ------------------- handlePouchUpgradeCancel -------------------
async function handlePouchUpgradeCancel(interaction) {
  try {
    const embed = createInfoEmbed(
      'ℹ️ Pouch Upgrade Cancelled',
      'Pouch upgrade has been cancelled.'
    );
    await interaction.update({
      embeds: [embed],
      components: []
    });
  } catch (error) {
    console.error('[handlePouchUpgradeCancel]: Error:', error);
    const errorEmbed = createErrorEmbed(
      '❌ Cancellation Error',
      'An error occurred while cancelling the upgrade.'
    );
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          embeds: [errorEmbed],
          ephemeral: true
        });
      } else {
        await interaction.update({
          embeds: [errorEmbed],
          components: []
        });
      }
    } catch (replyError) {
      console.error('[handlePouchUpgradeCancel]: Failed to send cancel response:', replyError);
    }
  }
}

// ------------------- handleViewShop -------------------
async function handleViewShop(interaction) {
  try {
    const characterName = interaction.options.getString('charactername');
    if (!characterName) {
      const embed = createErrorEmbed(
        '❌ Missing Character Name',
        'Please provide a character name.'
      );
      return await interaction.reply({ embeds: [embed] });
    }

    // Get character from database
    const character = await Character.findOne({ name: characterName });
    if (!character) {
      const embed = createErrorEmbed(
        '❌ Character Not Found',
        `Character ${characterName} not found.`,
        [
          { name: '🔍 Character Name', value: characterName, inline: true }
        ]
      );
      return await interaction.reply({ embeds: [embed] });
    }

    // Get the vending model for this character
    const VendingInventory = await getVendingModel(characterName);

    // Get items from vending inventory
    const items = await VendingInventory.find({});

    // Filter out items with zero stock
    const availableItems = items.filter(item => item.stockQty > 0);

    if (!availableItems || availableItems.length === 0) {
      const embed = createWarningEmbed(
        '⚠️ No Items Available',
        `No items currently available in ${characterName}'s vending inventory.`,
        [
          { name: '🏪 Shop', value: characterName, inline: true }
        ]
      );
      return await interaction.reply({ embeds: [embed] });
    }

    // Create shop embed
    const shopImage = character.shopImage || character.vendingSetup?.shopImage || VIEW_SHOP_IMAGE_URL;
    const shopEmbed = createVendingEmbed('shop', {
      title: `${characterName}'s Shop`,
      description: `Welcome to ${characterName}'s shop!`,
      character: character
    });
    
    // Set shop image (not border) as the main image, border will be added by helper
    // For shop view, we want the shop image, so we'll override the border
    shopEmbed.setImage(shopImage);

    // Add vending points to embed
    shopEmbed.addFields({
      name: '🪙 Vending Points',
      value: `${character.vendingPoints || 0} points`,
      inline: false
    });

    // Add items to embed
    availableItems.forEach(item => {
      // Check barterOpen with fallback to tradesOpen for backward compatibility
      const barterOpen = item.barterOpen !== undefined ? item.barterOpen : (item.tradesOpen || false);
      shopEmbed.addFields({
        name: `${item.itemName} (${item.stockQty} in stock)`,
        value: `Cost: ${item.costEach} points\nToken Price: ${item.tokenPrice || 'N/A'}\nArt Price: ${item.artPrice || 'N/A'}\nOther Price: ${item.otherPrice || 'N/A'}\nBarter Open: ${barterOpen ? 'Yes' : 'No'}`,
        inline: true
      });
    });

    // Send the embed
    await interaction.reply({
      embeds: [shopEmbed]
    });

  } catch (error) {
    console.error(`[handleViewShop]: Error viewing shop:`, error);
    const embed = createErrorEmbed(
      '❌ Shop View Error',
      'An error occurred while viewing the shop.',
      [
        { name: '⚠️ Error Details', value: error.message || 'Unknown error', inline: false }
      ]
    );
    await interaction.reply({ embeds: [embed] });
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
        const embed = createVendingEmbed('shop', {
            title: '🎪 Vending Shop Setup',
            description: 'Set up and manage your vending shops on the dashboard!'
        });
        
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
                const isSetup = !!char.vendingSetup?.setupDate;
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

    // Log sync attempt details for debugging
    console.log('[vendingHandler.js] [handleVendingSync] Sync Attempt Debug:', {
      characterName: character.name,
      characterId: character._id?.toString(),
      hasVendingSetup: !!character.vendingSetup,
      vendingSetup: character.vendingSetup,
      hasSetupDate: !!character.vendingSetup?.setupDate,
      setupDate: character.vendingSetup?.setupDate,
      hasShopLink: !!character.shopLink,
      shopLink: character.shopLink,
      hasVendingSetupShopLink: !!character.vendingSetup?.shopLink,
      vendingSetupShopLink: character.vendingSetup?.shopLink
    });

    // Check both possible locations for the shop link (legacy support)
    // Note: shopLink is deprecated, but sync still needs it to parse sheet data
    const shopLink = character.shopLink || character.vendingSetup?.shopLink;
    if (!shopLink) {
      console.log('[vendingHandler.js] [handleVendingSync] ❌ No shop link found for character:', character.name);
      throw new Error('No shop link found for this character. Please set up your shop first using /vending setup');
    }
    
    // Validate setup exists (new validation)
    if (!character.vendingSetup?.setupDate) {
      console.log('[vendingHandler.js] [handleVendingSync] ❌ Setup validation failed - no setupDate for character:', character.name);
      throw new Error('Shop setup not completed. Please complete setup using /vending setup');
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

    // Track used slots (by slot name for assignment)
    const usedSlots = new Set();
    const slotConflicts = new Map(); // Track slot conflicts
    
    // Cache items to avoid duplicate lookups
    const itemCache = new Map();
    
    // First pass: Calculate total slots needed from all items (accounting for stack sizes)
    for (const row of parsedRows) {
      let item = itemCache.get(row.itemName);
      if (!item) {
        item = await ItemModel.findOne({ itemName: row.itemName });
        if (!item) {
          errors.push(`Item "${row.itemName}" not found in database`);
          continue;
        }
        itemCache.set(row.itemName, item);
      }

      const isStackable = item.stackable;
      const maxStackSize = item.maxStackSize || 10;
      let stockQty = Number(row.stockQty) || 0;

      // Skip items with zero or negative stock
      if (stockQty <= 0) {
        continue;
      }

      // Calculate slots needed based on stackability
      // Stackable items: ceil(quantity / maxStackSize), max 10 per slot
      // Non-stackable items: 1 slot per item
      let slotsNeeded = isStackable 
        ? Math.ceil(stockQty / maxStackSize)
        : stockQty;
      
      totalSlotsUsed += slotsNeeded;
    }
    
    // Check if total slots used exceeds capacity
    if (totalSlotsUsed > totalSlots) {
      errors.push(`Shop capacity exceeded: ${totalSlotsUsed} slots needed, but only ${totalSlots} slots available. Please reduce item quantities.`);
    }

    // Second pass: Process items and assign slots
    for (const row of parsedRows) {
      const item = itemCache.get(row.itemName);
      if (!item) {
        // Already logged error above, skip
        continue;
      }

      const isStackable = item.stackable;
      const maxStackSize = item.maxStackSize || 10;
      let stockQty = Number(row.stockQty) || 0;

      // Skip items with zero or negative stock
      if (stockQty <= 0) {
        continue;
      }

      // Calculate slots needed (same logic as first pass)
      let slotsNeeded = isStackable 
        ? Math.ceil(stockQty / maxStackSize)
        : stockQty;

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
    // Log setup validation details for debugging
    console.log('[vendingHandler.js] [handleEditShop] Setup Validation Debug:', {
      characterName: character.name,
      characterId: character._id?.toString(),
      hasVendingSetup: !!character.vendingSetup,
      vendingSetup: character.vendingSetup,
      hasSetupDate: !!character.vendingSetup?.setupDate,
      setupDate: character.vendingSetup?.setupDate,
      validationCheck: {
        setupDateExists: !!character.vendingSetup?.setupDate,
        willPass: !!character.vendingSetup?.setupDate,
        willFail: !character.vendingSetup?.setupDate
      }
    });

    if (!character.vendingSetup?.setupDate) {
      console.log('[vendingHandler.js] [handleEditShop] ❌ Setup validation failed for character:', character.name);
      console.log('[vendingHandler.js] [handleEditShop] Reason: vendingSetup?.setupDate =', character.vendingSetup?.setupDate);
      return interaction.editReply({
        content: `❌ ${characterName} doesn't have a shop set up yet. Use \`/vending setup\` first.`,
        ephemeral: true
      });
    }

    switch (action) {
      case 'item': {
        const slot = interaction.options.getString('slot');
        const itemName = interaction.options.getString('itemname');
        
        if (!slot && !itemName) {
          return interaction.editReply({
            content: '❌ Slot or item name is required for item editing.',
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
        let existingItem;
        
        if (slot) {
          // Find item by slot
          existingItem = await VendingInventory.findOne({ slot });
          if (!existingItem) {
            return interaction.editReply({
              content: `❌ No item found in slot "${slot}".`,
              ephemeral: true
            });
          }
        } else {
          // Find item by name (backward compatibility)
          existingItem = await VendingInventory.findOne({ itemName });
          if (!existingItem) {
            return interaction.editReply({
              content: `❌ Item "${itemName}" not found in your shop inventory.`,
              ephemeral: true
            });
          }
        }

        const updateFields = {};
        if (tokenPrice !== null) updateFields.tokenPrice = tokenPrice;
        if (artPrice) updateFields.artPrice = artPrice;
        if (otherPrice) updateFields.otherPrice = otherPrice;

        // Update using the item's identifier (itemName from existingItem)
        await VendingInventory.updateOne(
          { itemName: existingItem.itemName },
          { $set: updateFields }
        );

        // Google Sheets shop update removed
        const shopLink = character.shopLink || character.vendingSetup?.shopLink;
        if (false) { // Google Sheets functionality removed
          try {
            // Google Sheets code removed
            const sheetData = null; // Google Sheets removed
            
            // Find the row with the item (by slot if slot provided, otherwise by item name)
            const itemRowIndex = slot 
              ? sheetData.findIndex(row => row[1] === slot) // Column B (index 1) is Slot
              : sheetData.findIndex(row => row[2] === existingItem.itemName); // Column C (index 2) is Item Name
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
          content: `✅ Updated item "${existingItem.itemName}"${slot ? ` in slot "${slot}"` : ''} in your shop.`,
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
          { 
            $set: { 
              shopImage: imageUrl,
              'vendingSetup.shopImage': imageUrl
            } 
          }
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
      if (!shopLink || typeof shopLink !== 'string') {
        await interaction.reply({
          content: '❌ Invalid link. Please provide a valid link.'
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
      const embed = createInfoEmbed(
        '📭 No Vending Stock Available',
        `No vending stock available for **${monthName}**, even after regeneration.`,
        [
          { name: '📅 Month', value: monthName, inline: true }
        ]
      );
      return interaction.editReply({ embeds: [embed] });
    }

    const embed = createVendingEmbed('info', {
      title: `📊 Vending Stock — ${monthName}`,
      description: `Click a button below to view vending stock by village or see limited items.`,
      color: '#88cc88'
    });

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
    const embed = createErrorEmbed(
      '❌ Vending Stock Error',
      'An error occurred while retrieving vending stock.',
      [
        { name: '💡 Next Steps', value: 'Please try again later. If the problem persists, contact support.', inline: false }
      ]
    );
    return interaction.editReply({ embeds: [embed] });
  }
}

// ------------------- handleVendingViewVillage -------------------
async function handleVendingViewVillage(interaction, villageKey) {
  try {
    const result = await getCurrentVendingStockList();
    const stockList = result?.stockList || {};
    const limitedItems = result?.limitedItems || [];

    if (!stockList[villageKey] && villageKey !== 'limited') {
      const embed = createErrorEmbed(
        '❌ No Stock Found',
        `No vending stock found for **${villageKey}**.`,
        [
          { name: '🏘️ Village', value: villageKey, inline: true }
        ]
      );
      return interaction.update({
        embeds: [embed],
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
        color: '#d93e3e',
        banner: VILLAGE_BANNERS.Rudania
      },
      inariko: {
        emoji: '<:inariko:899493009073274920>',
        color: '#3e7ed9',
        banner: VILLAGE_BANNERS.Inariko
      },
      vhintl: {
        emoji: '<:vhintl:899492879205007450>',
        color: '#3ed96a',
        banner: VILLAGE_BANNERS.Vhintl
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

    if (villageKey === 'limited') {
      const embed = createVendingEmbed('info', {
        title: `${settings.emoji} Vending Stock — ${villageKey[0].toUpperCase() + villageKey.slice(1)} — ${monthName}`,
        color: settings.color,
        image: settings.banner
      });
      embed.setDescription(
        limitedItems.map(i =>
          `${i.emoji || '📦'} **${i.itemName}**\n  > **Cost:** ${i.points} pts\n  > **Stock:** x${i.stock ?? '?'}`
        ).join('\n\n') || '*No limited items available*'
      );
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
    }

    const items = stockList[villageKey];
    const embeds = [];
    
    if (!items || items.length === 0) {
      const embed = createVendingEmbed('info', {
        title: `${settings.emoji} Vending Stock — ${villageKey[0].toUpperCase() + villageKey.slice(1)} — ${monthName}`,
        color: settings.color,
        image: settings.banner
      });
      embed.setDescription('*No items found*');
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
    }

    // Group items by vendingType
    const merchantItems = items.filter(i => i.vendingType === 'Merchant');
    const shopkeeperItems = items.filter(i => i.vendingType === 'Shopkeeper');
    
    // Helper function to create an embed for a type of items
    const createTypeEmbed = (itemList, typeName) => {
      if (itemList.length === 0) return null;
      
      const typeEmbed = createVendingEmbed('info', {
        title: `${settings.emoji} ${typeName} Items — ${villageKey[0].toUpperCase() + villageKey.slice(1)} — ${monthName}`,
        color: settings.color,
        image: settings.banner
      });
      
      // Split items into two columns
      const midPoint = Math.ceil(itemList.length / 2);
      const leftColumn = itemList.slice(0, midPoint);
      const rightColumn = itemList.slice(midPoint);
      
      // Format left column
      const leftText = leftColumn.map(i => 
        `${i.emoji || '📦'} **${i.itemName}**\nCost: ${i.points} pts`
      ).join('\n\n') || '\u200b';
      
      // Format right column
      const rightText = rightColumn.map(i => 
        `${i.emoji || '📦'} **${i.itemName}**\nCost: ${i.points} pts`
      ).join('\n\n') || '\u200b';
      
      // Add exactly 2 inline fields - this creates 2 columns
      typeEmbed.addFields(
        { name: '\u200b', value: leftText, inline: true },
        { name: '\u200b', value: rightText, inline: true }
      );
      
      return typeEmbed;
    };
    
    // Create Merchant embed
    if (merchantItems.length > 0) {
      const merchantEmbed = createTypeEmbed(merchantItems, 'Merchant');
      if (merchantEmbed) embeds.push(merchantEmbed);
    }
    
    // Create Shopkeeper embed
    if (shopkeeperItems.length > 0) {
      const shopkeeperEmbed = createTypeEmbed(shopkeeperItems, 'Shopkeeper');
      if (shopkeeperEmbed) embeds.push(shopkeeperEmbed);
    }

    return interaction.update({
      embeds: embeds.length > 0 ? embeds : [createVendingEmbed('info', {
        title: `${settings.emoji} Vending Stock — ${villageKey[0].toUpperCase() + villageKey.slice(1)} — ${monthName}`,
        description: '*No items found*',
        color: settings.color,
        image: settings.banner
      })],
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
    const embed = createErrorEmbed(
      '❌ Failed to Load Vending Data',
      'An error occurred while loading vending data.',
      [
        { name: '💡 Next Steps', value: 'Please try again later.', inline: false }
      ]
    );
    return interaction.update({
      embeds: [embed],
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
    return createVendingEmbed('barter', {
      title: '📦 Barter Request',
      description: `**${request.userCharacterName}** requested \`${request.itemName} x${request.quantity}\``,
      color: '#f5a623',
      fields: [
        { name: '🧾 Vendor', value: request.vendorCharacterName, inline: true },
        { name: '💱 Payment Method', value: request.paymentMethod, inline: true },
        { name: '📝 Notes', value: request.notes || '—', inline: false },
        { name: '🪪 Fulfillment ID', value: request.fulfillmentId, inline: false }
      ],
      footer: `Requested by ${request.buyerUsername}`
    });
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

    // Log transaction for vendor move
    try {
      const user = await User.findOne({ discordId: character.userId });
      const fulfillmentId = `vendor_move_${uuidv4()}`;
      const vendorTransaction = new VendingRequest({
        fulfillmentId: fulfillmentId,
        userCharacterName: characterName,
        vendorCharacterName: characterName,
        itemName: itemName,
        quantity: quantity,
        paymentMethod: 'inventory_transfer',
        notes: `Vendor moved ${quantity}x ${itemName} from personal inventory to vending shop`,
        buyerId: character.userId,
        buyerUsername: user?.username || characterName,
        date: new Date(),
        status: 'completed',
        processedAt: new Date(),
        transactionType: 'vendor_move',
        sourceInventory: 'personal_inventory'
      });
      await vendorTransaction.save();
      console.log(`[vendingHandler.js]: ✅ Logged vendor move transaction: ${fulfillmentId}`);
    } catch (txError) {
      console.error('[vendingHandler.js]: ⚠️ Failed to log vendor move transaction:', txError);
      // Don't fail the request if transaction logging fails
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