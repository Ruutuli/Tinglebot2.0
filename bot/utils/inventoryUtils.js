// ============================================================================
// ---- Imports ----
// External dependencies and internal modules
// ============================================================================

const { handleError } = require("./globalErrorHandler");
const logger = require("./logger");
// Google Sheets functionality removed
const generalCategories = require("../models/GeneralItemCategories");
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const ItemModel = require('../models/ItemModel');
const InventoryLog = require('../models/InventoryLogModel');
const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, EmbedBuilder, MessageFlags, ButtonBuilder, ButtonStyle } = require('discord.js');
const TempData = require('../models/TempDataModel');

// ============================================================================
// ---- Constants ----
// ============================================================================

const SOURCE_TYPES = {
  TRAVEL: 'Travel',
  GATHERING: 'Gathering',
  CRAFTING: 'Crafting',
  TRADING: 'Trading',
  QUEST: 'Quest Reward',
  SHOP: 'Shop Purchase',
  MANUAL: 'Manual Entry'
};

// ============================================================================
// ---- Database Functions ----
// Core database connection and utility functions
// ============================================================================

let dbFunctions = {
  connectToInventories: null,
  fetchItemByName: null,
  fetchCharacterById: null,
  getInventoryCollection: null,
};

let promptUserForSpecificItems = null;

// ---- Function: initializeInventoryUtils ----
// Initializes database functions for inventory operations
function initializeInventoryUtils(dbModuleFunctions) {
  dbFunctions = {
    ...dbFunctions,
    ...dbModuleFunctions,
  };
}

// ---- Function: initializeItemUtils ----
// Initializes item utility functions with custom implementations
function initializeItemUtils(itemUtilsFunctions) {
  if (itemUtilsFunctions && itemUtilsFunctions.promptUserForSpecificItems) {
    promptUserForSpecificItems = itemUtilsFunctions.promptUserForSpecificItems;
  } else {
    promptUserForSpecificItems = async (interaction, inventory, materialName, requiredQuantity) => {
      return inventory.filter((item) => {
        if (generalCategories[materialName]) {
          return generalCategories[materialName].includes(item.itemName);
        }
        return item.itemName === materialName;
      });
    };
  }
}

// ============================================================================
// ---- Utility Functions ----
// Helper functions for data formatting and validation
// ============================================================================

// ---- Function: formatDateTime ----
// Formats date to EST timezone with consistent format
function formatDateTime(date) {
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/New_York",
  };
  return new Intl.DateTimeFormat("en-US", options)
    .format(new Date(date))
    .replace(",", " |") + " EST";
}

// ---- Function: escapeRegExp ----
// Escapes special characters in strings for regex use
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// ---- Error Handling ----
// Error tracking and logging utilities
// ============================================================================

const loggedErrors = new Set();
const ERROR_COOLDOWN = 5000; // 5 seconds cooldown between identical errors

// ---- Function: shouldLogError ----
// Prevents duplicate error logging within cooldown period
function shouldLogError(error) {
  const errorKey = error.message || error.toString();
  if (loggedErrors.has(errorKey)) {
    return false;
  }
  loggedErrors.add(errorKey);
  setTimeout(() => loggedErrors.delete(errorKey), ERROR_COOLDOWN);
  return true;
}

// ============================================================================
// ---- Core Inventory Operations ----
// Main functions for inventory management
// ============================================================================

// ---- Function: syncToInventoryDatabase ----
// Syncs item changes to database. Never inserts or leaves negative quantity; uses case-insensitive itemName.
async function syncToInventoryDatabase(character, item, interaction) {
  try {
    if (!dbFunctions.connectToInventories) {
      throw new Error("Database functions not initialized in inventoryUtils");
    }
    
    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    const collectionName = character.name.toLowerCase();
    logger.info('INVENTORY', `📁 Using collection: ${collectionName}`);
    
    const inventoryCollection = db.collection(collectionName);

    const itemNameForQuery = (item.itemName || '').trim();
    const itemNameRegex = new RegExp(`^${escapeRegExp(itemNameForQuery)}$`, 'i');
    const quantity = typeof item.quantity === 'number' ? item.quantity : 0;

    // ---- Removal (quantity <= 0): deduct from existing docs only, never insert ----
    if (quantity <= 0) {
      const toRemove = Math.abs(quantity);
      if (toRemove <= 0) return;

      const allEntries = await inventoryCollection
        .find({ characterId: character._id, itemName: itemNameRegex })
        .toArray();
      const positiveEntries = allEntries.filter((e) => (e.quantity || 0) > 0);
      const totalAvailable = positiveEntries.reduce((sum, e) => sum + (e.quantity || 0), 0);

      const actualRemove = Math.min(toRemove, totalAvailable);
      if (totalAvailable < toRemove) {
        logger.warn('INVENTORY', `Sync removal: only ${totalAvailable} ${itemNameForQuery} available, requested ${toRemove}; deducting ${actualRemove}`);
      }

      // Atomic one-at-a-time removal to prevent negative quantity under concurrency
      const syncRemovalFilter = { characterId: character._id, itemName: itemNameRegex, quantity: { $gte: 1 } };
      for (let i = 0; i < actualRemove; i++) {
        const doc = await inventoryCollection.findOneAndUpdate(
          syncRemovalFilter,
          { $inc: { quantity: -1 } },
          { returnDocument: 'after', sort: { _id: 1 } }
        );
        if (!doc) break;
        if ((doc.quantity || 0) <= 0) {
          await inventoryCollection.deleteOne({ _id: doc._id });
          logger.info('INVENTORY', `Sync removal: deleted entry ${doc.itemName} (quantity reached 0)`);
        }
      }
      return;
    }

    // ---- Addition (quantity > 0): find one existing (case-insensitive), $inc or insert ----
    const existingItem = await inventoryCollection.findOne({
      characterId: character._id,
      itemName: itemNameRegex
    });

    // If existing document has invalid (zero/negative) quantity, delete it and treat as new insert so transfer is never lost
    if (existingItem && (existingItem.quantity || 0) <= 0) {
      await inventoryCollection.deleteOne({ _id: existingItem._id });
      logger.info('INVENTORY', `Sync: removed invalid entry ${existingItem.itemName} (qty <= 0), inserting fresh`);
    }

    if (existingItem && (existingItem.quantity || 0) > 0) {
      await inventoryCollection.updateOne(
        { _id: existingItem._id },
        { $inc: { quantity: quantity } }
      );
      const updated = await inventoryCollection.findOne({ _id: existingItem._id });
      if (updated && (updated.quantity || 0) <= 0) {
        await inventoryCollection.deleteOne({ _id: existingItem._id });
        logger.info('INVENTORY', `Sync: deleted ${existingItem.itemName} after inc (qty <= 0)`);
      } else {
        logger.success('INVENTORY', `Updated item ${itemNameForQuery} in database (incremented quantity)`);
      }
    } else {
      // No existing item, or we just deleted an invalid one — insert with the new quantity
      const itemDetails = await dbFunctions.fetchItemByName(item.itemName);
      const itemId = itemDetails?._id || item.itemId || null;
      const category = Array.isArray(itemDetails?.category) ? itemDetails.category.join(", ") : (item.category || "");
      const type = Array.isArray(itemDetails?.type) ? itemDetails.type.join(", ") : (item.type || "");
      const subtype = Array.isArray(itemDetails?.subtype) ? itemDetails.subtype : (Array.isArray(item.subtype) ? item.subtype : (item.subtype ? [item.subtype] : []));
      const job = character.job || "";
      const perk = item.perk !== undefined ? item.perk : (character.perk || "");
      const location = character.currentLocation || character.homeVillage || character.currentVillage || "";
      const link = interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : (item.link || "");
      const date = item.date || new Date();
      const obtain = item.obtain !== undefined ? item.obtain : "Manual Sync";
      const synced = item.synced || "";

      await inventoryCollection.insertOne({
        characterId: character._id,
        itemId,
        itemName: item.itemName || itemNameForQuery,
        quantity,
        category,
        type,
        subtype,
        job,
        perk,
        location,
        link,
        date,
        obtain,
        synced
      });
      logger.success('INVENTORY', `Added new item ${itemNameForQuery} to database`);
    }
  } catch (error) {
    if (shouldLogError(error)) {
      handleError(error, "inventoryUtils.js");
      logger.error('INVENTORY', `Sync failed for ${character?.name || 'Unknown'} | ${item?.itemName || 'Unknown'}`);
    }
    throw error;
  }
}

// ---- Function: addItemInventoryDatabase ----
// Adds a single item to inventory database. Never leaves negative quantity; after $inc deletes if qty <= 0.
async function addItemInventoryDatabase(characterId, itemName, quantity, interaction, obtain = "") {
  try {
    const allowedNullInteractionObtain = ['Trade', 'Character Birthday'];
    if (!interaction && !allowedNullInteractionObtain.includes(obtain)) {
      throw new Error("Interaction object is undefined.");
    }
    if (typeof quantity !== 'number' || isNaN(quantity) || quantity <= 0) {
      throw new Error(`Invalid quantity for addItemInventoryDatabase: ${quantity}`);
    }

    if (!dbFunctions.fetchCharacterById || !dbFunctions.connectToInventories || !dbFunctions.fetchItemByName) {
      throw new Error("Required database functions not initialized");
    }

    // Try to fetch as regular character first, then mod character
    let character = await dbFunctions.fetchCharacterById(characterId);
    if (!character && dbFunctions.fetchModCharacterById) {
      character = await dbFunctions.fetchModCharacterById(characterId);
    }
    if (!character) {
      throw new Error(`Character with ID ${characterId} not found`);
    }
    logger.info('INVENTORY', `📦 Processing inventory for ${character.name}`);

    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    
    // Use same per-character collection for both regular and mod characters
    // (must match getCharacterInventoryCollectionWithModSupport and removeItemInventoryDatabase)
    const collectionName = character.name.toLowerCase();
    logger.info('INVENTORY', `📁 Using collection: ${collectionName}`);
    
    const inventoryCollection = db.collection(collectionName);

    const item = await dbFunctions.fetchItemByName(itemName);
    if (!item) {
      throw new Error(`Item with name "${itemName}" not found`);
    }
    // Sanity check: ensure fetchItemByName returned the correct variant (e.g. Ancient Battleaxe+ not Ancient Battleaxe)
    const requestedTrimmed = String(itemName).trim();
    const returnedTrimmed = String(item.itemName || '').trim();
    if (requestedTrimmed.toLowerCase() !== returnedTrimmed.toLowerCase()) {
      logger.error('INVENTORY', `Item name mismatch: requested "${requestedTrimmed}" but got "${returnedTrimmed}" - possible downgrade`);
      throw new Error(`Item lookup returned wrong variant: expected "${requestedTrimmed}" but got "${returnedTrimmed}". Please try again.`);
    }
    if (requestedTrimmed.includes('+')) {
      logger.info('INVENTORY', `Adding enhanced item: ${returnedTrimmed} (qty: ${quantity}) for ${character.name}`);
    }

    // Query for existing item matching both itemName AND obtain field
    // This allows items with different obtain methods to be tracked separately
    const itemNameRegex = new RegExp(`^${escapeRegExp(itemName.trim())}$`, "i");
    const obtainValue = obtain || ""; // Normalize empty string for comparison
    
    const inventoryItem = await inventoryCollection.findOne({
      characterId,
      itemName: itemNameRegex,
      obtain: obtainValue
    });

    if (inventoryItem) {
      // Item exists with same name AND same obtain method - increment quantity
      logger.info('INVENTORY', `📊 Found ${inventoryItem.quantity} ${itemName} (obtain: "${obtainValue}") in ${character.name}'s inventory`);
      logger.info('INVENTORY', `➕ Adding ${quantity} ${itemName}`);
      await inventoryCollection.updateOne(
        { characterId, itemName: inventoryItem.itemName, obtain: obtainValue },
        { $inc: { quantity: quantity } }
      );
      const updated = await inventoryCollection.findOne({
        characterId,
        itemName: inventoryItem.itemName,
        obtain: obtainValue
      });
      if (updated && (updated.quantity || 0) <= 0) {
        await inventoryCollection.deleteOne({ _id: inventoryItem._id });
        logger.info('INVENTORY', `Deleted ${itemName} after add (qty <= 0)`);
      } else {
        logger.success('INVENTORY', `Updated ${itemName} quantity (incremented by ${quantity})`);
      }
    } else {
      // Item doesn't exist with this obtain method - create new entry
      // This allows items with different obtain methods (crafting, trading, etc.) to be tracked separately
      logger.info('INVENTORY', `➕ Adding new item ${itemName} (${quantity}) with obtain method "${obtainValue}" to ${character.name}'s inventory`);
      const newItem = {
        characterId,
        itemName: item.itemName,
        itemId: item._id,
        quantity,
        category: Array.isArray(item.category) ? item.category.join(", ") : "Misc",
        type: Array.isArray(item.type) ? item.type.join(", ") : "Unknown",
        subtype: Array.isArray(item.subtype) ? item.subtype.join(", ") : "",
        location: character.currentVillage || "Unknown",
        date: new Date(),
        obtain: obtainValue,
      };
      await inventoryCollection.insertOne(newItem);
      logger.success('INVENTORY', `Created new inventory entry for ${itemName} with obtain method "${obtainValue}"`);
    }
    
    // Log to InventoryLog database collection
    try {
      const interactionUrl = interaction 
        ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
        : '';
      
      await logItemAcquisitionToDatabase(character, item, {
        quantity: quantity,
        obtain: obtain || 'Manual',
        location: character.currentVillage || character.homeVillage || 'Unknown',
        link: interactionUrl
      });
    } catch (logError) {
      // Don't fail the main operation if logging fails
      logger.warn('INVENTORY', `Failed to log to InventoryLog: ${logError.message}`);
    }

    // Ensure Initial Item placeholder is removed when adding real items
    try {
      await removeInitialItemIfSynced(characterId);
    } catch (cleanupError) {
      logger.warn('INVENTORY', `Failed to remove Initial Item: ${cleanupError.message}`);
    }
    
    return true;
  } catch (error) {
    handleError(error, "inventoryUtils.js");
    logger.error('INVENTORY', `Error adding item to inventory: ${error.message}`);
    throw error;
  }
}

// ---- Function: removeItemInventoryDatabase ----
// Removes a single item from inventory database
async function removeItemInventoryDatabase(characterId, itemName, quantity, interaction, obtain = "Trade") {
  try {
    // Validate quantity parameter to prevent NaN corruption
    if (typeof quantity !== 'number' || isNaN(quantity) || quantity <= 0) {
      const errorMsg = `Invalid quantity parameter for removeItemInventoryDatabase: ${quantity} (type: ${typeof quantity})`;
      logger.error('INVENTORY', errorMsg);
      throw new Error(`${errorMsg}. This is a bug that would corrupt inventory.`);
    }

    if (!dbFunctions.fetchCharacterById || !dbFunctions.connectToInventories) {
      throw new Error("Required database functions not initialized");
    }

    // Try to fetch as regular character first, then mod character
    let character = await dbFunctions.fetchCharacterById(characterId);
    if (!character && dbFunctions.fetchModCharacterById) {
      character = await dbFunctions.fetchModCharacterById(characterId);
    }
    if (!character) {
      throw new Error(`Character with ID ${characterId} not found`);
    }

    logger.info('INVENTORY', `📦 Processing inventory for ${character.name}`);
    const collectionName = character.name.toLowerCase();
    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    logger.info('INVENTORY', `📁 Using collection: ${collectionName}`);
    
    const inventoryCollection = db.collection(collectionName);

    // Handle items with + in their names by using exact match instead of regex
    // Use find().toArray() to get all matching entries and aggregate quantities
    let allEntries;
    if (itemName.includes('+')) {
      allEntries = await inventoryCollection
        .find({ 
          characterId: character._id,
          itemName: itemName.trim()
        })
        .toArray();
    } else {
      allEntries = await inventoryCollection
        .find({ 
          characterId: character._id,
          itemName: { $regex: new RegExp(`^${escapeRegExp(itemName.trim())}$`, 'i') }
        })
        .toArray();
    }

    // Delete any entries with quantity <= 0 (invalid/corrupt) and exclude from removal logic
    const negativeOrZero = (allEntries || []).filter((e) => (e.quantity || 0) <= 0);
    for (const entry of negativeOrZero) {
      await inventoryCollection.deleteOne({ _id: entry._id });
      logger.info('INVENTORY', `Deleted invalid entry ${entry.itemName} (quantity ${entry.quantity})`);
    }
    const inventoryEntries = (allEntries || []).filter((e) => (e.quantity || 0) > 0);

    if (!inventoryEntries || inventoryEntries.length === 0) {
      logger.error('INVENTORY', `Item "${itemName}" not found in ${character.name}'s inventory`);
      return false;
    }

    // Sum quantities from positive entries only
    const totalQuantity = inventoryEntries.reduce(
      (sum, entry) => sum + (entry.quantity || 0),
      0
    );

    if (totalQuantity < quantity) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Insufficient Items')
        .setDescription(`Not enough ${itemName} in inventory`)
        .addFields(
          { name: 'Required', value: quantity.toString(), inline: true },
          { name: 'Available', value: totalQuantity.toString(), inline: true }
        )
        .setFooter({ text: 'Check your inventory and try again' })
        .setTimestamp();

      throw new Error(`Not enough ${itemName} in inventory`);
    }

    logger.info('INVENTORY', `📊 Found ${totalQuantity} ${itemName} across ${inventoryEntries.length} entry/entries in ${character.name}'s inventory`);
    logger.info('INVENTORY', `➖ Removing ${quantity} ${itemName}`);
    
    const canonicalItemName = inventoryEntries[0].itemName; // Use canonical name from first entry

    // Build filter for atomic decrement (same as initial query, plus quantity >= 1)
    const atomicFilter = itemName.includes('+')
      ? { characterId: character._id, itemName: itemName.trim(), quantity: { $gte: 1 } }
      : { characterId: character._id, itemName: { $regex: new RegExp(`^${escapeRegExp(itemName.trim())}$`, 'i') }, quantity: { $gte: 1 } };

    // Atomic one-at-a-time removal: each decrement is "take 1 only if quantity >= 1" in a single DB operation
    let removedCount = 0;
    for (let i = 0; i < quantity; i++) {
      const doc = await inventoryCollection.findOneAndUpdate(
        atomicFilter,
        { $inc: { quantity: -1 } },
        { returnDocument: 'after', sort: { _id: 1 } }
      );
      if (!doc) {
        logger.error('INVENTORY', `Atomic removal: no document with qty>=1 for ${itemName} (removed ${removedCount}/${quantity})`);
        throw new Error(`Not enough ${itemName} in inventory`);
      }
      removedCount++;
      if ((doc.quantity || 0) <= 0) {
        await inventoryCollection.deleteOne({ _id: doc._id });
        logger.info('INVENTORY', `🗑️ Deleted entry for ${doc.itemName} (quantity reached 0)`);
      }
    }
    logger.success('INVENTORY', `Removed ${removedCount} ${itemName} from ${character.name}'s inventory`);

    // Post-removal cleanup: delete any remaining invalid/zero/negative entries for this item
    const cleanupFilter = itemName.includes('+')
      ? { characterId: character._id, itemName: itemName.trim(), quantity: { $lte: 0 } }
      : { characterId: character._id, itemName: { $regex: new RegExp(`^${escapeRegExp(itemName.trim())}$`, 'i') }, quantity: { $lte: 0 } };
    const invalidEntries = await inventoryCollection.find(cleanupFilter).toArray();
    for (const entry of invalidEntries) {
      await inventoryCollection.deleteOne({ _id: entry._id });
      logger.warn('INVENTORY', `Cleaned up invalid entry ${entry.itemName} (quantity ${entry.quantity})`);
    }
    if (invalidEntries.length > 0) {
      logger.warn('INVENTORY', `Cleaned up ${invalidEntries.length} invalid/zero entries for ${itemName}`);
    }

    // Log removal to InventoryLog database collection
    try {
      // Fetch item details for proper categorization
      // Use canonical item name from first entry (all entries have same itemName)
      const item = await dbFunctions.fetchItemByName(canonicalItemName);
      const interactionUrl = interaction 
        ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
        : '';
      
      // Use first entry for logging (or create a minimal item object if item not found)
      const itemForLogging = item || { itemName: canonicalItemName, quantity: quantity };
      
      await logItemRemovalToDatabase(character, itemForLogging, {
        quantity: quantity,
        obtain: obtain || 'Manual Removal',
        location: character.currentVillage || character.homeVillage || 'Unknown',
        link: interactionUrl
      });
    } catch (logError) {
      // Don't fail the main operation if logging fails
      logger.warn('INVENTORY', `Failed to log to InventoryLog: ${logError.message}`);
    }

    return true;
  } catch (error) {
    handleError(error, "inventoryUtils.js");
    logger.error('INVENTORY', 'Error removing item from inventory database:', error);
    throw error;
  }
}

// ============================================================================
// ---- Item Creation Helpers ----
// Functions for creating new item database entries
// ============================================================================

// ---- Function: createNewItemDatabase ----
// Creates a new item database entry object
const createNewItemDatabase = (character, itemName, quantity, category, type, interaction) => {
  itemName = String(itemName).trim().toLowerCase();
  const link = interaction
    ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
    : "";
  return {
    characterId: character._id,
    characterName: character.name,
    itemName,
    quantity,
    category: Array.isArray(category) ? category.join(", ") : category,
    type: Array.isArray(type) ? type.join(", ") : type,
    subtype: "",
    job: character.job || "",
    perk: character.perk || "",
    location: character.currentLocation || character.homeVillage || "",
    link,
    date: new Date(),
    obtain: "Crafting",
    synced: "",
  };
};

// ---- Function: createRemovedItemDatabase ----
// Creates a removed item database entry object
const createRemovedItemDatabase = (character, item, quantity, interaction, obtainMethod = "Manual Entry") => {
  const itemName = String(item.itemName).trim().toLowerCase();
  const link = interaction
    ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
    : "";
  return {
    characterId: character._id,
    characterName: character.name,
    itemId: item._id,
    itemName,
    quantity: -quantity,
    category: Array.isArray(item.category) ? item.category.join(", ") : item.category,
    type: Array.isArray(item.type) ? item.type.join(", ") : item.type,
    subtype: item.subtype,
    job: character.job || "",
    perk: character.perk || "",
    location: character.currentLocation || character.homeVillage || "",
    link,
    date: new Date(),
    obtain: obtainMethod,
    synced: "",
  };
};

// ============================================================================
// ---- Batch Operations ----
// Functions for handling multiple items at once
// ============================================================================

// ---- Function: addItemsToDatabase ----
// Adds multiple items to inventory database. Never inserts or leaves quantity <= 0; after $inc deletes if qty <= 0.
const addItemsToDatabase = async (character, items, interaction) => {
  try {
    if (!dbFunctions.connectToInventories) {
      throw new Error("Required database functions not initialized");
    }

    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    const collectionName = character.name.toLowerCase();
    logger.info('INVENTORY', `📁 Using collection: ${collectionName}`);
    
    const inventoryCollection = db.collection(collectionName);

    for (const item of items) {
      const qty = typeof item.quantity === 'number' && !isNaN(item.quantity) ? item.quantity : 0;
      if (qty <= 0) continue;

      const itemName = String(item.itemName).trim().toLowerCase();
      const existingItem = await inventoryCollection.findOne({
        characterId: character._id,
        itemName,
      });
      if (existingItem) {
        await inventoryCollection.updateOne(
          { characterId: character._id, itemName },
          { $inc: { quantity: qty } }
        );
        const updated = await inventoryCollection.findOne({
          characterId: character._id,
          itemName,
        });
        if (updated && (updated.quantity || 0) <= 0) {
          await inventoryCollection.deleteOne({ _id: existingItem._id });
          logger.info('INVENTORY', `addItemsToDatabase: deleted ${itemName} after inc (qty <= 0)`);
        }
      } else {
        await inventoryCollection.insertOne({
          ...item,
          characterId: character._id,
          characterName: character.name,
          date: new Date(),
          quantity: qty,
        });
      }
    }
  } catch (error) {
    handleError(error, "inventoryUtils.js");
    logger.error('INVENTORY', 'Error adding multiple items to database:', error);
    throw error;
  }
};

// ============================================================================
// ---- Crafting Operations ----
// Functions for handling item crafting and material processing
// ============================================================================

// ---- Function: createMaterialSelectionMenu ----
// Creates a Discord select menu for sequential material selection
// Shows ALL available items (including different types from general categories)
// Users select one item at a time (1/3, 2/3, 3/3, etc.)
const createMaterialSelectionMenu = (materialName, availableItems, requiredQuantity, customId, currentSelection = 0) => {
  // Show all available items (up to Discord's limit of 25)
  // Each inventory entry is a separate option
  const options = availableItems.slice(0, 25).map((item, index) => {
    const label = `${item.itemName} (Qty: ${item.quantity})`;
    const value = `${item._id.toString()}|${item.itemName}|${item.quantity}`;
    
    // For sequential selection, show which selection this is
    const isGeneralCategory = generalCategories[materialName];
    const description = isGeneralCategory 
      ? `Select from ${materialName} category`
      : `Select this stack of ${item.itemName}`;
    
    return new StringSelectMenuOptionBuilder()
      .setLabel(label.length > 100 ? label.substring(0, 97) + '...' : label)
      .setValue(value)
      .setDescription(description.length > 100 ? description.substring(0, 97) + '...' : description);
  });

  const progressText = `${currentSelection + 1}/${requiredQuantity}`;
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(`Select item for ${materialName} ${progressText}`)
    .setMinValues(1)
    .setMaxValues(1) // Sequential selection: only one item at a time
    .addOptions(options);

  return new ActionRowBuilder().addComponents(selectMenu);
};

// ---- Function: processMaterials ----
// Processes materials needed for crafting an item
const processMaterials = async (interaction, character, inventory, craftableItem, quantity) => {
  if (!promptUserForSpecificItems) {
    initializeItemUtils({});
  }

  const materialsUsed = [];
  for (const material of craftableItem.craftingMaterial) {
    const materialName = material.itemName;
    let specificItems = [];
    let requiredQuantity = material.quantity * quantity;

    // Get available items for this material
    if (generalCategories[materialName]) {
      // For general categories (e.g., "Any Raw Meat"), collect ALL items from that category
      // This allows users to select multiple different item types (e.g., 1 Raw Bird + 1 Raw Prime + 1 Raw Gourmet)
      const result = await promptUserForSpecificItems(
        interaction,
        inventory,
        materialName,
        requiredQuantity
      );
      if (result === "canceled") {
        return "canceled";
      }
      // result contains ALL items from the category that the user owns
      // Each inventory entry is a separate selectable option
      specificItems = result;
    } else {
      // Filter for specific items - check both exact match and case-insensitive
      specificItems = inventory.filter((item) => 
        item.itemName.toLowerCase() === materialName.toLowerCase()
      );
    }

    // Filter out items with 0 or invalid quantities before calculating total
    const validItems = specificItems.filter(item => {
      const qty = typeof item.quantity === 'number' 
        ? (isNaN(item.quantity) ? 0 : item.quantity)
        : (item.quantity !== null && item.quantity !== undefined 
          ? (isNaN(parseInt(item.quantity, 10)) ? 0 : parseInt(item.quantity, 10))
          : 0);
      return qty > 0;
    });

    let totalQuantity = validItems.reduce(
      (sum, item) => {
        const qty = typeof item.quantity === 'number' 
          ? (isNaN(item.quantity) ? 0 : item.quantity)
          : (item.quantity !== null && item.quantity !== undefined 
            ? (isNaN(parseInt(item.quantity, 10)) ? 0 : parseInt(item.quantity, 10))
            : 0);
        return sum + qty;
      },
      0
    );
    if (totalQuantity < requiredQuantity) {
      if (interaction && interaction.followUp) {
        const errorEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Insufficient Materials')
          .setDescription(`You don't have enough ${materialName} to craft this item!`)
          .addFields(
            { name: 'Required Quantity', value: requiredQuantity.toString(), inline: true },
            { name: 'Available Quantity', value: totalQuantity.toString(), inline: true }
          )
          .setFooter({ text: 'Try gathering more materials or check your inventory' })
          .setTimestamp();

        await interaction.followUp({
          embeds: [errorEmbed],
          flags: [4096]
        });
      }
      return "canceled";
    }

    // Use validItems (filtered) for selection logic
    // Check if there are any valid items available
    if (validItems.length === 0) {
      if (interaction && interaction.followUp) {
        const errorEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ No Valid Materials')
          .setDescription(`You don't have any valid ${materialName} items in your inventory!`)
          .addFields(
            { name: 'Required Quantity', value: requiredQuantity.toString(), inline: true },
            { name: 'Available Quantity', value: '0', inline: true }
          )
          .setFooter({ text: 'Try gathering more materials or check your inventory' })
          .setTimestamp();

        await interaction.followUp({
          embeds: [errorEmbed],
          flags: [4096]
        });
      }
      return "canceled";
    }

    // Only prompt for selection when: general category, insufficient total, or single stack with not enough
    // Same item in multiple stacks (different obtain methods) should not prompt—we deduct by name across stacks
    const needsSelection = !!generalCategories[materialName] ||
                          totalQuantity < requiredQuantity ||
                          (validItems.length === 1 && validItems[0].quantity < requiredQuantity);

    if (needsSelection && interaction) {
      // Create select menu for user to choose items
      const selectionId = uuidv4();
      const customId = `crafting-material|${selectionId}|${materialName}`;
      
      // For the first material selection, the selectionId will be used as craftingContinueSelectionId
      // For subsequent materials, we'll get it from the craftingState passed in
      const craftingContinueSelectionId = selectionId; // Will be updated when craftingContinue state is created
      
      // Save crafting state to storage
      // For sequential selection: track how many items have been selected so far
      const craftingStateData = {
        type: 'craftingMaterialSelection',
        key: selectionId,
        data: {
          selectionId,
          craftingContinueSelectionId, // Store the original craftingContinue selectionId
          userId: interaction.user.id,
          characterId: character._id,
          characterName: character.name,
          interactionId: interaction.id,
          channelId: interaction.channelId,
          guildId: interaction.guildId,
          materialName,
          requiredQuantity,
          selectedCount: 0, // Track how many items selected so far (for sequential selection)
          selectedItemsSoFar: [], // Track which items have been selected
          availableItems: validItems.map(item => ({
            _id: item._id.toString(),
            itemName: item.itemName,
            quantity: typeof item.quantity === 'number' 
              ? (isNaN(item.quantity) ? 0 : item.quantity)
              : (item.quantity !== null && item.quantity !== undefined 
                ? (isNaN(parseInt(item.quantity, 10)) ? 0 : parseInt(item.quantity, 10))
                : 0)
          })),
          craftableItem: {
            itemName: craftableItem.itemName,
            craftingMaterial: craftableItem.craftingMaterial,
            quantity: quantity
          },
          quantity: quantity, // Store at top level for easier access
          materialsUsedSoFar: materialsUsed,
          currentMaterialIndex: craftableItem.craftingMaterial.findIndex(m => m.itemName === materialName),
          allMaterials: craftableItem.craftingMaterial,
          inventory: inventory.map(item => ({
            _id: item._id.toString(),
            itemName: item.itemName,
            quantity: typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity, 10) || 0
          }))
        },
        expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 minutes
      };

      await TempData.findOneAndUpdate(
        { type: 'craftingMaterialSelection', key: selectionId },
        craftingStateData,
        { upsert: true, new: true }
      );

      // Create and send select menu for sequential selection (1/3, 2/3, etc.)
      // Use validItems instead of specificItems to exclude 0-quantity items
      const currentSelection = 0; // Starting with first selection
      const selectMenu = createMaterialSelectionMenu(materialName, validItems, requiredQuantity, customId, currentSelection);
      
      // Enhanced description for sequential selection
      const isGeneralCategory = generalCategories[materialName];
      const progressText = `**${currentSelection + 1}/${requiredQuantity}**`;
      const categoryDescription = isGeneralCategory
        ? `Please select an item for **${materialName}** ${progressText}\n\n**Required:** ${requiredQuantity} total\n\n💡 **Select one item at a time.** You'll be prompted for each item needed.`
        : `Please select an item for **${materialName}** ${progressText}\n\n**Required:** ${requiredQuantity} total\n\n💡 **Select one item at a time.** You'll be prompted for each item needed.`;
      
      const embed = new EmbedBuilder()
        .setColor(0x00CED1)
        .setTitle(`📦 Select Materials ${progressText}`)
        .setDescription(categoryDescription)
        .setFooter({ text: `Select one item (${currentSelection + 1} of ${requiredQuantity})` })
        .setTimestamp();

      const cancelButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`crafting-cancel|${selectionId}`)
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.followUp({
        embeds: [embed],
        components: [selectMenu, cancelButton],
        flags: [MessageFlags.Ephemeral]
      });

      // Return pending state - handler will continue processing
      return { status: 'pending', selectionId };
    }

    // Auto-select if only one stack with enough quantity
    // Use validItems to ensure we only process items with valid quantities
    for (const specificItem of validItems) {
      if (requiredQuantity <= 0) break;
      
      // Ensure quantity is valid
      const itemQty = typeof specificItem.quantity === 'number' 
        ? (isNaN(specificItem.quantity) ? 0 : specificItem.quantity)
        : (specificItem.quantity !== null && specificItem.quantity !== undefined 
          ? (isNaN(parseInt(specificItem.quantity, 10)) ? 0 : parseInt(specificItem.quantity, 10))
          : 0);
      
      if (itemQty <= 0) continue; // Skip invalid items
      
      let removeQuantity = Math.min(requiredQuantity, itemQty);
      await removeItemInventoryDatabase(
        character._id,
        specificItem.itemName,
        removeQuantity,
        interaction
      );
      materialsUsed.push({
        itemName: specificItem.itemName,
        quantity: removeQuantity,
        _id: specificItem._id,
      });
      requiredQuantity -= removeQuantity;
    }
  }

  // Google Sheets logging removed - materials are logged to database

  return materialsUsed;
};

// ---- Function: continueProcessMaterials ----
// Continues processing materials after user selection
// Handles general categories correctly - processes different item types from the same category
// Example: For "Any Raw Meat" x3, user can select 1 Raw Bird + 1 Raw Prime + 1 Raw Gourmet
const continueProcessMaterials = async (interaction, character, selectedItems, craftingState) => {
  const { materialName, requiredQuantity, craftableItem, quantity: quantityParam, materialsUsedSoFar, currentMaterialIndex, allMaterials, inventory, selectionId, craftingContinueSelectionId } = craftingState.data;
  
  // Use craftingContinueSelectionId if available, otherwise fall back to selectionId
  const stateCheckId = craftingContinueSelectionId || selectionId;
  console.log(`[inventoryUtils.js] [CRFT] continueProcessMaterials called - Material: ${materialName}, SelectionId: ${selectionId}, CraftingContinueSelectionId: ${craftingContinueSelectionId}, StateCheckId: ${stateCheckId}, Character: ${character.name}`);
  
  // VALIDATE CRAFTING STATE BEFORE REMOVING ANY MATERIALS
  // This prevents materials from being consumed if the crafting state has expired
  if (stateCheckId) {
    const TempData = require('../models/TempDataModel');
    console.log(`[inventoryUtils.js] [CRFT] Checking craftingContinue state for stateCheckId: ${stateCheckId}`);
    const craftingContinueState = await TempData.findByTypeAndKey('craftingContinue', stateCheckId);
    if (!craftingContinueState || !craftingContinueState.data) {
      console.log(`[inventoryUtils.js] [CRFT] ❌ Crafting state NOT FOUND or EXPIRED - stateCheckId: ${stateCheckId}, State exists: ${!!craftingContinueState}, Has data: ${!!(craftingContinueState?.data)}`);
      // State expired - return error code so caller can handle refund if needed
      return { status: 'expired', selectionId: stateCheckId };
    }
    console.log(`[inventoryUtils.js] [CRFT] ✅ Crafting state VALID - stateCheckId: ${stateCheckId}, ExpiresAt: ${craftingContinueState.expiresAt}`);
  } else {
    console.log(`[inventoryUtils.js] [CRFT] ⚠️ No stateCheckId available (selectionId: ${selectionId}, craftingContinueSelectionId: ${craftingContinueSelectionId})`);
  }
  
  // Get quantity from top level or from craftableItem as fallback (for backwards compatibility)
  const quantity = quantityParam !== undefined ? quantityParam : (craftableItem?.quantity || 1);
  
  const materialsUsed = [...materialsUsedSoFar];
  let remainingQuantity = requiredQuantity;

  // Process selected items - handles sequential selection (one item at a time)
  // For sequential selection, we use exactly 1 from each selected item
  // This correctly processes selections like: 1 Raw Bird + 1 Raw Prime + 1 Raw Gourmet = 3 Any Raw Meat
  for (const selectedValue of selectedItems) {
    const [itemId, itemName, itemQuantity] = selectedValue.split('|');
    
    // Validate parsed values
    if (!itemId || !itemName || !itemQuantity) {
      console.error(`[inventoryUtils.js]: Invalid selected value format: ${selectedValue}`);
      continue;
    }
    
    const parsedQuantity = parseInt(itemQuantity, 10);
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      console.error(`[inventoryUtils.js]: Invalid quantity in selected value: ${selectedValue}, parsed: ${parsedQuantity}`);
      continue;
    }
    
    // For sequential selection, use exactly 1 from each selected item
    // The itemQuantity in the value is the available quantity, but we only use 1 per selection
    const quantityToUse = Math.min(remainingQuantity, 1);
    
    if (quantityToUse > 0) {
      await removeItemInventoryDatabase(
        character._id,
        itemName,
        quantityToUse,
        interaction
      );
      materialsUsed.push({
        itemName: itemName,
        quantity: quantityToUse,
        _id: new mongoose.Types.ObjectId(itemId),
      });
      remainingQuantity -= quantityToUse;
    }
    
    // Stop processing once we have enough
    if (remainingQuantity <= 0) break;
  }

  // Process all remaining materials
  let currentProcessIndex = currentMaterialIndex + 1;
  while (currentProcessIndex < allMaterials.length) {
    const nextMaterial = allMaterials[currentProcessIndex];
    
    // Validate material exists and has valid quantity
    if (!nextMaterial || !nextMaterial.itemName) {
      console.error(`[inventoryUtils.js]: Invalid material at index ${currentProcessIndex}: material is missing or invalid`);
      return "canceled";
    }
    
    // Validate and parse material quantity - prevent NaN
    let materialQty;
    if (typeof nextMaterial.quantity === 'number') {
      if (isNaN(nextMaterial.quantity) || nextMaterial.quantity <= 0) {
        console.error(`[inventoryUtils.js]: Invalid material quantity (NaN or <= 0) for ${nextMaterial.itemName}: ${nextMaterial.quantity} (type: number)`);
        return "canceled";
      }
      materialQty = nextMaterial.quantity;
    } else if (nextMaterial.quantity !== null && nextMaterial.quantity !== undefined) {
      const parsed = parseInt(nextMaterial.quantity, 10);
      if (isNaN(parsed) || parsed <= 0) {
        console.error(`[inventoryUtils.js]: Invalid material quantity for ${nextMaterial.itemName}: ${nextMaterial.quantity} (parsed: ${parsed})`);
        return "canceled";
      }
      materialQty = parsed;
    } else {
      console.error(`[inventoryUtils.js]: Material quantity is null/undefined for ${nextMaterial.itemName}`);
      return "canceled";
    }
    
    // Validate quantity parameter is a valid number before calculating
    if (typeof quantity !== 'number' || isNaN(quantity) || quantity <= 0) {
      console.error(`[inventoryUtils.js]: Invalid craft quantity parameter: ${quantity} (type: ${typeof quantity})`);
      return "canceled";
    }
    
    let nextRequiredQuantity = materialQty * quantity;
    
    // Validate nextRequiredQuantity is a valid number (should never be NaN after validations above)
    if (isNaN(nextRequiredQuantity) || nextRequiredQuantity <= 0) {
      console.error(`[inventoryUtils.js]: Invalid calculated required quantity for ${nextMaterial.itemName}: ${nextRequiredQuantity} (materialQty: ${materialQty}, quantity: ${quantity})`);
      return "canceled";
    }
    
    // Get available items for next material
    let specificItems = [];
    if (generalCategories[nextMaterial.itemName]) {
      const result = await promptUserForSpecificItems(
        interaction,
        inventory.map(item => {
          let quantity;
          if (typeof item.quantity === 'number') {
            quantity = isNaN(item.quantity) ? 0 : item.quantity;
          } else if (item.quantity !== null && item.quantity !== undefined) {
            const parsed = parseInt(item.quantity, 10);
            quantity = isNaN(parsed) ? 0 : parsed;
          } else {
            quantity = 0;
          }
          return {
            _id: new mongoose.Types.ObjectId(item._id),
            itemName: item.itemName,
            quantity: quantity
          };
        }),
        nextMaterial.itemName,
        nextRequiredQuantity
      );
      if (result === "canceled") {
        return "canceled";
      }
      specificItems = result;
    } else {
      specificItems = inventory
        .filter((item) => item.itemName.toLowerCase() === nextMaterial.itemName.toLowerCase())
        .map(item => {
          let quantity;
          if (typeof item.quantity === 'number') {
            quantity = isNaN(item.quantity) ? 0 : item.quantity;
          } else if (item.quantity !== null && item.quantity !== undefined) {
            const parsed = parseInt(item.quantity, 10);
            quantity = isNaN(parsed) ? 0 : parsed;
          } else {
            quantity = 0;
          }
          return {
            _id: new mongoose.Types.ObjectId(item._id),
            itemName: item.itemName,
            quantity: quantity
          };
        });
    }

    let totalQuantity = specificItems.reduce((sum, item) => sum + item.quantity, 0);
    if (totalQuantity < nextRequiredQuantity) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Insufficient Materials')
        .setDescription(`You don't have enough ${nextMaterial.itemName} to craft this item!`)
        .addFields(
          { name: 'Required Quantity', value: nextRequiredQuantity.toString(), inline: true },
          { name: 'Available Quantity', value: totalQuantity.toString(), inline: true }
        )
        .setFooter({ text: 'Try gathering more materials or check your inventory' })
        .setTimestamp();

      await interaction.followUp({
        embeds: [errorEmbed],
        flags: [MessageFlags.Ephemeral]
      });
      return "canceled";
    }

    // Check if next material needs selection
    const needsSelection = specificItems.length > 1 || 
                          (specificItems.length === 1 && specificItems[0].quantity < nextRequiredQuantity) ||
                          generalCategories[nextMaterial.itemName];

    if (needsSelection) {
      const selectionId = uuidv4();
      const customId = `crafting-material|${selectionId}|${nextMaterial.itemName}`;
      
      // Get the original craftingContinueSelectionId from the current craftingState
      // This links all material selections back to the same craftingContinue state
      const craftingContinueSelectionId = craftingState.data.craftingContinueSelectionId || craftingState.data.selectionId;
      console.log(`[inventoryUtils.js] [CRFT] Creating new craftingMaterialSelection - new selectionId: ${selectionId}, craftingContinueSelectionId: ${craftingContinueSelectionId}`);
      
      const nextCraftingState = {
        type: 'craftingMaterialSelection',
        key: selectionId,
        data: {
          selectionId,
          craftingContinueSelectionId, // Store the original craftingContinue selectionId
          userId: interaction.user.id,
          characterId: character._id,
          characterName: character.name,
          interactionId: interaction.id,
          channelId: interaction.channelId,
          guildId: interaction.guildId,
          materialName: nextMaterial.itemName,
          requiredQuantity: nextRequiredQuantity,
          availableItems: specificItems.map(item => ({
            _id: item._id.toString(),
            itemName: item.itemName,
            quantity: item.quantity
          })),
          craftableItem: {
            itemName: craftableItem.itemName,
            craftingMaterial: craftableItem.craftingMaterial,
            quantity: quantity
          },
          quantity: quantity, // Store at top level for easier access
          materialsUsedSoFar: materialsUsed,
          currentMaterialIndex: currentProcessIndex,
          allMaterials: allMaterials,
          inventory: inventory.map(item => ({
            _id: item._id.toString(),
            itemName: item.itemName,
            quantity: typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity, 10) || 0
          }))
        },
        expiresAt: new Date(Date.now() + 15 * 60 * 1000)
      };

      await TempData.findOneAndUpdate(
        { type: 'craftingMaterialSelection', key: selectionId },
        nextCraftingState,
        { upsert: true, new: true }
      );

      const selectMenu = createMaterialSelectionMenu(nextMaterial.itemName, specificItems, nextRequiredQuantity, customId);
      const embed = new EmbedBuilder()
        .setColor(0x00CED1)
        .setTitle('📦 Select Materials')
        .setDescription(`Please select which items to use for **${nextMaterial.itemName}**\n\n**Required:** ${nextRequiredQuantity}`)
        .setFooter({ text: 'Select the items you want to use for crafting' })
        .setTimestamp();

      const cancelButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`crafting-cancel|${selectionId}`)
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger)
      );

      await interaction.followUp({
        embeds: [embed],
        components: [selectMenu, cancelButton],
        flags: [MessageFlags.Ephemeral]
      });

      return { status: 'pending', selectionId };
    } else {
      // Auto-select next material
      // First, filter out items with 0 or invalid quantities
      const validItems = specificItems.filter(item => {
        let itemQuantity;
        if (typeof item.quantity === 'number') {
            itemQuantity = isNaN(item.quantity) ? 0 : item.quantity;
        } else if (item.quantity !== null && item.quantity !== undefined) {
            const parsed = parseInt(item.quantity, 10);
            itemQuantity = isNaN(parsed) ? 0 : parsed;
        } else {
            itemQuantity = 0;
        }
        return itemQuantity > 0;
      });

      // Check if we have enough items after filtering
      const validTotalQuantity = validItems.reduce((sum, item) => {
        let itemQuantity;
        if (typeof item.quantity === 'number') {
            itemQuantity = isNaN(item.quantity) ? 0 : item.quantity;
        } else if (item.quantity !== null && item.quantity !== undefined) {
            const parsed = parseInt(item.quantity, 10);
            itemQuantity = isNaN(parsed) ? 0 : parsed;
        } else {
            itemQuantity = 0;
        }
        return sum + itemQuantity;
      }, 0);

      if (validTotalQuantity < nextRequiredQuantity) {
        const errorEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Insufficient Materials')
          .setDescription(`You don't have enough ${nextMaterial.itemName} to craft this item!`)
          .addFields(
            { name: 'Required Quantity', value: nextRequiredQuantity.toString(), inline: true },
            { name: 'Available Quantity', value: validTotalQuantity.toString(), inline: true }
          )
          .setFooter({ text: 'Try gathering more materials or check your inventory' })
          .setTimestamp();

        await interaction.followUp({
          embeds: [errorEmbed],
          flags: [MessageFlags.Ephemeral]
        });
        return "canceled";
      }

      // Process valid items
      for (const specificItem of validItems) {
        if (nextRequiredQuantity <= 0) break;
        
        // Quantity is already validated above, but ensure it's a number
        let itemQuantity;
        if (typeof specificItem.quantity === 'number') {
            itemQuantity = isNaN(specificItem.quantity) ? 0 : specificItem.quantity;
        } else if (specificItem.quantity !== null && specificItem.quantity !== undefined) {
            const parsed = parseInt(specificItem.quantity, 10);
            itemQuantity = isNaN(parsed) ? 0 : parsed;
        } else {
            itemQuantity = 0;
        }
        
        if (itemQuantity <= 0) continue; // Should not happen after filtering, but safety check
        
        let removeQuantity = Math.min(nextRequiredQuantity, itemQuantity);
        
        // Validate removeQuantity before calling removeItemInventoryDatabase
        if (isNaN(removeQuantity) || removeQuantity <= 0) {
          console.error(`[inventoryUtils.js]: Invalid removeQuantity calculated: ${removeQuantity} (nextRequiredQuantity: ${nextRequiredQuantity}, itemQuantity: ${itemQuantity})`);
          continue;
        }
        
        await removeItemInventoryDatabase(
          character._id,
          specificItem.itemName,
          removeQuantity,
          interaction
        );
        materialsUsed.push({
          itemName: specificItem.itemName,
          quantity: removeQuantity,
          _id: specificItem._id,
        });
        nextRequiredQuantity -= removeQuantity;
      }
      
      // Move to next material after processing this one
      currentProcessIndex++;
    }
    // Note: If material requires selection, we return early above (line 1199)
    // so we only reach here for auto-processed materials
  }

  // Google Sheets logging removed - materials are logged to database

  return materialsUsed;
};

// ============================================================================
// ---- Special Operations ----
// Functions for specific inventory operations
// ============================================================================

// ---- Function: removeInitialItemIfSynced ----
// Removes initial item from inventory if character is synced
async function removeInitialItemIfSynced(characterId) {
  try {
    if (!dbFunctions.fetchCharacterById || !dbFunctions.connectToInventories) {
      throw new Error("Required database functions not initialized");
    }

    // Try to fetch as regular character first, then mod character
    let character = await dbFunctions.fetchCharacterById(characterId);
    if (!character && dbFunctions.fetchModCharacterById) {
      character = await dbFunctions.fetchModCharacterById(characterId);
    }
    if (!character) {
      throw new Error(`Character with ID ${characterId} not found`);
    }

    if (character.inventorySynced) {
      const collectionName = character.name.toLowerCase();
      const inventoriesConnection = await dbFunctions.connectToInventories();
      const db = inventoriesConnection.useDb('inventories');
      console.log(`[inventoryUtils.js]: 📁 Using collection: ${collectionName}`);
      
      const inventoryCollection = db.collection(collectionName);
      // Match both characterId and null (mod chars may have been created with characterId: null)
      const initialItem = await inventoryCollection.findOne({
        itemName: "Initial Item",
        $or: [
          { characterId: character._id },
          { characterId: null },
        ],
      });
      if (initialItem) {
        await inventoryCollection.deleteOne({ _id: initialItem._id });
        console.log("[inventoryUtils.js]: ✅ Initial Item removed from inventory.");
      } else {
        console.log("[inventoryUtils.js]: ℹ️ Initial Item not found in inventory.");
      }
    }
  } catch (error) {
    handleError(error, "inventoryUtils.js");
    console.error(`[inventoryUtils.js]: ❌ Error removing Initial Item: ${error.message}`);
    throw error;
  }
}


// ---- Function: refundJobVoucher ----
// Handles refunding a job voucher to a character's inventory
async function refundJobVoucher(character, interaction) {
    try {
        if (!character || !interaction) {
            throw new Error("Character and interaction objects are required");
        }

        logger.info('INVENTORY', `🎫 Processing job voucher refund for ${character.name}`);

        await addItemInventoryDatabase(character._id, "Job Voucher", 1, interaction, "Voucher Refund");
        logger.success('INVENTORY', `Successfully refunded job voucher to ${character.name}'s inventory`);

        return true;
    } catch (error) {
        handleError(error, "inventoryUtils.js");
        logger.error('INVENTORY', `Error refunding job voucher: ${error.message}`);
        throw error;
    }
}

// ============================================================================
// ---- Function: logItemAcquisitionToDatabase ----
// Logs item acquisition events to InventoryLog collection
// ============================================================================
async function logItemAcquisitionToDatabase(character, itemData, acquisitionData) {
  try {
    // Extract acquisition details
    const {
      itemName,
      quantity,
      itemId = null,
      category = '',
      type = '',
      subtype = '',
      obtain = 'Unknown',
      job = '',
      perk = '',
      location = '',
      link = '',
      dateTime = new Date()
    } = {
      itemName: itemData.itemName || itemData.name,
      quantity: itemData.quantity || acquisitionData.quantity || 1,
      itemId: itemData.itemId || itemData._id || null,
      category: Array.isArray(itemData.category) ? itemData.category.join(', ') : (itemData.category || ''),
      type: Array.isArray(itemData.type) ? itemData.type.join(', ') : (itemData.type || ''),
      subtype: Array.isArray(itemData.subtype) ? itemData.subtype.join(', ') : (itemData.subtype || ''),
      ...acquisitionData
    };

    // Create log entry
    const logEntry = {
      characterName: character.name,
      characterId: character._id,
      itemName: itemName,
      itemId: itemId,
      quantity: quantity,
      category: category || '',
      type: type || '',
      subtype: subtype || '',
      obtain: obtain || 'Unknown',
      job: job || character.job || '',
      perk: perk || character.perk || '',
      location: location || character.currentVillage || character.homeVillage || '',
      link: link || '',
      dateTime: dateTime instanceof Date ? dateTime : new Date(dateTime),
      confirmedSync: uuidv4()
    };

    // Save to InventoryLog collection
    await InventoryLog.create(logEntry);
    
    logger.info('INVENTORY', `📝 Logged item acquisition: ${quantity}x ${itemName} for ${character.name} (${obtain})`);
    
    return logEntry;
  } catch (error) {
    // Don't fail the main operation if logging fails
    logger.warn('INVENTORY', `Failed to log item acquisition to database: ${error.message}`);
    return null;
  }
}

// ============================================================================
// ---- Function: logItemRemovalToDatabase ----
// Logs item removal events to InventoryLog collection
// ============================================================================
async function logItemRemovalToDatabase(character, itemData, removalData) {
  try {
    // Extract removal details
    const {
      itemName,
      quantity,
      itemId = null,
      category = '',
      type = '',
      subtype = '',
      obtain = 'Manual Removal',
      job = '',
      perk = '',
      location = '',
      link = '',
      dateTime = new Date()
    } = {
      itemName: itemData.itemName || itemData.name,
      quantity: itemData.quantity || removalData.quantity || 1,
      itemId: itemData.itemId || itemData._id || null,
      category: Array.isArray(itemData.category) ? itemData.category.join(', ') : (itemData.category || ''),
      type: Array.isArray(itemData.type) ? itemData.type.join(', ') : (itemData.type || ''),
      subtype: Array.isArray(itemData.subtype) ? itemData.subtype.join(', ') : (itemData.subtype || ''),
      ...removalData
    };

    // Ensure quantity is negative for removals
    const negativeQuantity = quantity < 0 ? quantity : -Math.abs(quantity);

    // Create log entry
    const logEntry = {
      characterName: character.name,
      characterId: character._id,
      itemName: itemName,
      itemId: itemId,
      quantity: negativeQuantity,
      category: category || '',
      type: type || '',
      subtype: subtype || '',
      obtain: obtain || 'Manual Removal',
      job: job || character.job || '',
      perk: perk || character.perk || '',
      location: location || character.currentVillage || character.homeVillage || '',
      link: link || '',
      dateTime: dateTime instanceof Date ? dateTime : new Date(dateTime),
      confirmedSync: uuidv4()
    };

    // Save to InventoryLog collection
    await InventoryLog.create(logEntry);
    
    logger.info('INVENTORY', `📝 Logged item removal: ${negativeQuantity}x ${itemName} for ${character.name} (${obtain})`);
    
    return logEntry;
  } catch (error) {
    // Don't fail the main operation if logging fails
    logger.warn('INVENTORY', `Failed to log item removal to database: ${error.message}`);
    return null;
  }
}

// ============================================================================
// ---- Exports ----
// Module exports
// ============================================================================

module.exports = {
  initializeInventoryUtils,
  initializeItemUtils,
  syncToInventoryDatabase,
  addItemInventoryDatabase,
  removeItemInventoryDatabase,
  processMaterials,
  continueProcessMaterials,
  createMaterialSelectionMenu,
  createNewItemDatabase,
  createRemovedItemDatabase,
  addItemsToDatabase,
  removeInitialItemIfSynced,
  refundJobVoucher,
  SOURCE_TYPES,
  escapeRegExp,
  logItemAcquisitionToDatabase,
  logItemRemovalToDatabase
};