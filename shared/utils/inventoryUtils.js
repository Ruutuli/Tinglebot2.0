// ============================================================================
// ---- Imports ----
// External dependencies and internal modules
// ============================================================================

const { handleError } = require("./globalErrorHandler");
const {
  appendSheetData,
  authorizeSheets,
  getSheetIdByTitle,
  readSheetData,
  writeSheetData,
  safeAppendDataToSheet,
  extractSpreadsheetId,
  isValidGoogleSheetsUrl
} = require("./googleSheetsUtils");
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
// Syncs item changes to both database and Google Sheets
async function syncToInventoryDatabase(character, item, interaction) {
  try {
    if (!dbFunctions.connectToInventories) {
      throw new Error("Database functions not initialized in inventoryUtils");
    }
    
    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    const collectionName = character.name.toLowerCase();
    console.log(`[inventoryUtils.js]: 📁 Using collection: ${collectionName}`);
    
    const inventoryCollection = db.collection(collectionName);

    // Fetch item details for required fields
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
    const characterName = character.name;

    const dbDoc = {
      characterId: character._id,
      itemId,
      itemName: item.itemName,
      quantity: item.quantity,
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
    };

    // First, update the database
    const existingItem = await inventoryCollection.findOne({
      characterId: character._id,
      itemName: dbDoc.itemName
    });

    if (existingItem) {
      // Update existing item by incrementing quantity
      await inventoryCollection.updateOne(
        { characterId: character._id, itemName: dbDoc.itemName },
        { $inc: { quantity: dbDoc.quantity } }
      );
      console.log(`[inventoryUtils.js]: ✅ Updated item ${dbDoc.itemName} in database (incremented quantity)`);
    } else {
      // Insert new item
      await inventoryCollection.insertOne(dbDoc);
      console.log(`[inventoryUtils.js]: ✅ Added new item ${dbDoc.itemName} to database`);
    }

    // Google Sheets Sync
    try {
      // Get existing row data if it exists
      const auth = await authorizeSheets();
      const spreadsheetId = extractSpreadsheetId(character.inventory);
      const sheetData = await readSheetData(auth, spreadsheetId, 'loggedInventory!A2:M');
      
      // Find all matching rows (to handle duplicates)
      const matchingRows = sheetData.filter(row => {
        const sheetChar = (row[0] || '').trim().toLowerCase();
        const sheetItem = (row[1] || '').trim().toLowerCase();
        const sheetSync = (row[12] || '').trim(); // Check Confirmed Sync field
        const dbChar = characterName.trim().toLowerCase();
        const dbItem = dbDoc.itemName.trim().toLowerCase();
        
        // Skip rows that are already synced
        if (sheetSync) {
          return false;
        }
        
        return sheetChar === dbChar && sheetItem === dbItem;
      });

      if (matchingRows.length > 0) {
        // Fetch item details to fill empty fields
        const itemDetails = await dbFunctions.fetchItemByName(dbDoc.itemName);
        if (itemDetails) {
          dbDoc.category = Array.isArray(itemDetails.category) ? itemDetails.category.join(", ") : (itemDetails.category || "");
          dbDoc.type = Array.isArray(itemDetails.type) ? itemDetails.type.join(", ") : (itemDetails.type || "");
          dbDoc.subtype = Array.isArray(itemDetails.subtype) ? itemDetails.subtype.join(", ") : (itemDetails.subtype || "");
        }

        // Helper function to check if a value is empty or undefined
        const isEmptyOrUndefined = (val) => val === undefined || val === null || val === '';

        // Update each matching row
        for (const existingRow of matchingRows) {
          const rowIndex = sheetData.indexOf(existingRow);

          const values = [[
            characterName,
            dbDoc.itemName,
            dbDoc.quantity,
            isEmptyOrUndefined(existingRow[3]) ? dbDoc.category : existingRow[3], // Category
            isEmptyOrUndefined(existingRow[4]) ? dbDoc.type : existingRow[4], // Type
            isEmptyOrUndefined(existingRow[5]) ? (Array.isArray(dbDoc.subtype) ? dbDoc.subtype.join(", ") : (dbDoc.subtype || '')) : existingRow[5], // Subtype
            existingRow[6] || dbDoc.obtain || '', // Obtain (preserve existing)
            isEmptyOrUndefined(existingRow[7]) ? dbDoc.job : existingRow[7], // Job
            isEmptyOrUndefined(existingRow[8]) ? dbDoc.perk : existingRow[8], // Perk
            isEmptyOrUndefined(existingRow[9]) ? dbDoc.location : existingRow[9], // Location
            isEmptyOrUndefined(existingRow[10]) ? dbDoc.link : existingRow[10], // Link
            formatDateTime(dbDoc.date), // Date/Time
            uuidv4() // Confirmed Sync
          ]];

          // Update existing row with all fields
          await writeSheetData(
            auth,
            spreadsheetId,
            `loggedInventory!A${rowIndex + 2}:M${rowIndex + 2}`,
            values
          );
          console.log(`[inventoryUtils.js]: ✅ Updated row for ${dbDoc.itemName} (${existingRow[6] || dbDoc.obtain}) in sheet with all fields`);
        }
      } else {
        // No matching rows found, append a new row
        const newRow = [
          characterName,
          dbDoc.itemName,
          dbDoc.quantity,
          dbDoc.category,
          dbDoc.type,
          Array.isArray(dbDoc.subtype) ? dbDoc.subtype.join(", ") : (dbDoc.subtype || ''),
          dbDoc.obtain,
          dbDoc.job,
          dbDoc.perk,
          dbDoc.location,
          dbDoc.link,
          formatDateTime(dbDoc.date),
          uuidv4() // Generate new sync ID
        ];

        // Append the new row to the sheet
        await appendSheetData(auth, spreadsheetId, 'loggedInventory!A:M', [newRow]);
        console.log(`[inventoryUtils.js]: ✅ Added new row for ${dbDoc.itemName} to sheet`);
      }
    } catch (sheetError) {
      console.error(`[inventoryUtils.js]: ❌ Sheet sync error for ${character.name}: ${sheetError.message}`);
    }
  } catch (error) {
    if (!error.message?.includes('Could not write to sheet') && shouldLogError(error)) {
      handleError(error, "inventoryUtils.js");
      console.error(`[inventoryUtils.js]: ❌ Sync failed for ${character?.name || 'Unknown'} | ${item?.itemName || 'Unknown'}`);
    }
    throw error;
  }
}

// ---- Function: addItemInventoryDatabase ----
// Adds a single item to inventory database
async function addItemInventoryDatabase(characterId, itemName, quantity, interaction, obtain = "") {
  try {
    if (!interaction && obtain !== 'Trade') {
      throw new Error("Interaction object is undefined.");
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
    console.log(`[inventoryUtils.js]: 📦 Processing inventory for ${character.name}`);

    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    const collectionName = character.name.toLowerCase();
    console.log(`[inventoryUtils.js]: 📁 Using collection: ${collectionName}`);
    
    const inventoryCollection = db.collection(collectionName);

    const item = await dbFunctions.fetchItemByName(itemName);
    if (!item) {
      throw new Error(`Item with name "${itemName}" not found`);
    }

    const inventoryItem = await inventoryCollection.findOne({
      characterId,
      itemName: new RegExp(`^${escapeRegExp(itemName.trim())}$`, "i"),
    });

    if (inventoryItem) {
      console.log(`[inventoryUtils.js]: 📊 Found ${inventoryItem.quantity} ${itemName} in ${character.name}'s inventory`);
      console.log(`[inventoryUtils.js]: ➕ Adding ${quantity} ${itemName}`);
      await inventoryCollection.updateOne(
        { characterId, itemName: inventoryItem.itemName },
        { $inc: { quantity: quantity } }
      );
      console.log(`[inventoryUtils.js]: ✅ Updated ${itemName} quantity (incremented by ${quantity})`);
    } else {
      console.log(`[inventoryUtils.js]: ➕ Adding new item ${itemName} (${quantity}) to ${character.name}'s inventory`);
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
        obtain,
      };
      await inventoryCollection.insertOne(newItem);
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
      console.error(`[inventoryUtils.js]: ⚠️ Failed to log to InventoryLog:`, logError.message);
    }
    
    return true;
  } catch (error) {
    handleError(error, "inventoryUtils.js");
    console.error(`[inventoryUtils.js]: ❌ Error adding item to inventory:`, error.message);
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
      console.error(`[inventoryUtils.js]: ❌ ${errorMsg}`);
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

    console.log(`[inventoryUtils.js]: 📦 Processing inventory for ${character.name}`);
    const collectionName = character.name.toLowerCase();
    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    console.log(`[inventoryUtils.js]: 📁 Using collection: ${collectionName}`);
    
    const inventoryCollection = db.collection(collectionName);

    // Handle items with + in their names by using exact match instead of regex
    // Use find().toArray() to get all matching entries and aggregate quantities
    // This matches the availability check logic in handleGift
    let inventoryEntries;
    if (itemName.includes('+')) {
      inventoryEntries = await inventoryCollection
        .find({ 
          characterId: character._id,
          itemName: itemName.trim()
        })
        .toArray();
    } else {
      inventoryEntries = await inventoryCollection
        .find({ 
          characterId: character._id,
          itemName: { $regex: new RegExp(`^${escapeRegExp(itemName.trim())}$`, 'i') }
        })
        .toArray();
    }

    if (!inventoryEntries || inventoryEntries.length === 0) {
      console.log(`[inventoryUtils.js]: ❌ Item "${itemName}" not found in ${character.name}'s inventory`);
      return false;
    }

    // Sum quantities from all matching entries (handles multiple inventory entries for same item)
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

    console.log(`[inventoryUtils.js]: 📊 Found ${totalQuantity} ${itemName} across ${inventoryEntries.length} entry/entries in ${character.name}'s inventory`);
    console.log(`[inventoryUtils.js]: ➖ Removing ${quantity} ${itemName}`);
    
    // Remove quantity from entries, starting with the first entry
    let remainingToRemove = quantity;
    const canonicalItemName = inventoryEntries[0].itemName; // Use canonical name from first entry
    
    for (const entry of inventoryEntries) {
      if (remainingToRemove <= 0) break;
      
      const quantityFromThisEntry = Math.min(remainingToRemove, entry.quantity);
      const newQuantity = entry.quantity - quantityFromThisEntry;
      
      if (newQuantity === 0) {
        // Delete entry if quantity reaches 0
        const deleteResult = await inventoryCollection.deleteOne({
          _id: entry._id
        });
        
        if (deleteResult.deletedCount === 0) {
          console.error(`[inventoryUtils.js]: ❌ Failed to delete item ${itemName} from inventory`);
          return false;
        }
        console.log(`[inventoryUtils.js]: 🗑️ Deleted entry for ${entry.itemName} (quantity was ${entry.quantity})`);
      } else {
        // Update entry with remaining quantity
        const updateResult = await inventoryCollection.updateOne(
          { _id: entry._id },
          { $inc: { quantity: -quantityFromThisEntry } }
        );
        
        if (updateResult.modifiedCount === 0) {
          console.error(`[inventoryUtils.js]: ❌ Failed to update quantity for item ${itemName}`);
          return false;
        }
        console.log(`[inventoryUtils.js]: 🔄 Updated ${entry.itemName} quantity: ${entry.quantity} → ${newQuantity}`);
      }
      
      remainingToRemove -= quantityFromThisEntry;
    }
    
    if (remainingToRemove > 0) {
      console.error(`[inventoryUtils.js]: ❌ Failed to remove all requested quantity. Remaining: ${remainingToRemove}`);
      return false;
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
      console.error(`[inventoryUtils.js]: ⚠️ Failed to log to InventoryLog:`, logError.message);
    }

    return true;
  } catch (error) {
    handleError(error, "inventoryUtils.js");
    console.error("[inventoryUtils.js]: ❌ Error removing item from inventory database:", error);
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
// Adds multiple items to inventory database
const addItemsToDatabase = async (character, items, interaction) => {
  try {
    if (!dbFunctions.connectToInventories) {
      throw new Error("Required database functions not initialized");
    }

    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    const collectionName = character.name.toLowerCase();
    console.log(`[inventoryUtils.js]: 📁 Using collection: ${collectionName}`);
    
    const inventoryCollection = db.collection(collectionName);

    for (const item of items) {
      const itemName = String(item.itemName).trim().toLowerCase();
      const existingItem = await inventoryCollection.findOne({
        characterId: character._id,
        itemName,
      });
      if (existingItem) {
        await inventoryCollection.updateOne(
          { characterId: character._id, itemName },
          { $inc: { quantity: item.quantity } }
        );
      } else {
        await inventoryCollection.insertOne({
          ...item,
          characterId: character._id,
          characterName: character.name,
          date: new Date(),
        });
      }
    }

    const spreadsheetId = getSheetIdByTitle(character.inventory);
    if (interaction) {
      const sheetRows = items.map((item) => [
        character.name,
        item.itemName,
        item.quantity,
        new Date().toISOString(),
        `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
      ]);
      await appendSheetData(spreadsheetId, "Inventory", sheetRows);
    }
  } catch (error) {
    handleError(error, "inventoryUtils.js");
    console.error("[inventoryUtils.js]: ❌ Error adding multiple items to database:", error);
    throw error;
  }
};

// ============================================================================
// ---- Crafting Operations ----
// Functions for handling item crafting and material processing
// ============================================================================

// ---- Function: combineMaterials ----
// Combines duplicate materials from the crafting process to avoid redundancy in logging.
function combineMaterials(materialsUsed) {
  const materialMap = new Map();

  for (const material of materialsUsed) {
    if (materialMap.has(material.itemName)) {
      materialMap.get(material.itemName).quantity += material.quantity;
    } else {
      materialMap.set(material.itemName, { ...material });
    }
  }

  return Array.from(materialMap.values());
}

// ---- Function: logMaterialsToGoogleSheets ----
// Logs materials used in crafting to Google Sheets
async function logMaterialsToGoogleSheets(auth, spreadsheetId, range, character, materialsUsed, craftedItem, interactionUrl, formattedDateTime) {
  try {
    const combinedMaterials = combineMaterials(materialsUsed);
    const usedMaterialsValues = await Promise.all(combinedMaterials.map(async material => {
      try {
        const materialObjectId = new mongoose.Types.ObjectId(material._id);
        let materialItem = await ItemModel.findById(materialObjectId);
        if (!materialItem) {
          materialItem = await ItemModel.findOne({ itemName: material.itemName });
        }
        if (!materialItem) {
          return [
            character.name,
            material.itemName,
            `-${material.quantity}`,
            'Unknown',
            'Unknown',
            'Unknown',
            `Used for ${craftedItem.itemName}`,
            character.job,
            '',
            character.currentVillage,
            interactionUrl,
            formattedDateTime,
            uuidv4()
          ];
        }
        return [
          character.name,
          material.itemName,
          `-${material.quantity}`,
          materialItem.category.join(', '),
          materialItem.type.join(', '),
          materialItem.subtype.join(', '),
          `Used for ${craftedItem.itemName}`,
          character.job,
          '',
          character.currentVillage,
          interactionUrl,
          formattedDateTime,
          uuidv4()
        ];
      } catch (error) {
        handleError(error, 'inventoryUtils.js');
        return [
          character.name,
          material.itemName,
          `-${material.quantity}`,
          'Unknown',
          'Unknown',
          'Unknown',
          `Used for ${craftedItem.itemName}`,
          character.job,
          '',
          character.currentVillage,
          interactionUrl,
          formattedDateTime,
          uuidv4()
        ];
      }
    }));
    await safeAppendDataToSheet(character.inventory, character, range, usedMaterialsValues);
  } catch (error) {
    handleError(error, 'inventoryUtils.js');
    console.error(`[inventoryUtils.js]: Error logging materials to Google Sheets: ${error.message}`);
  }
}

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

    // If user has multiple stacks or it's a general category, prompt for selection
    // Only auto-select if there's exactly one stack with enough quantity
    const needsSelection = validItems.length > 1 || 
                          (validItems.length === 1 && validItems[0].quantity < requiredQuantity) ||
                          generalCategories[materialName];

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

  // Log materials to Google Sheets if character has an inventory sheet
  if (character?.inventory && typeof character.inventory === 'string' && isValidGoogleSheetsUrl(character.inventory)) {
    try {
      const auth = await authorizeSheets();
      const spreadsheetId = extractSpreadsheetId(character.inventory);
      const range = 'loggedInventory!A2:M';
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
      const formattedDateTime = formatDateTime(new Date());

      await logMaterialsToGoogleSheets(
        auth,
        spreadsheetId,
        range,
        character,
        materialsUsed,
        craftableItem,
        interactionUrl,
        formattedDateTime
      );
    } catch (error) {
      handleError(error, 'inventoryUtils.js');
      console.error(`[inventoryUtils.js]: Error logging materials to sheet: ${error.message}`);
    }
  }

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
    const TempData = require('../../shared/models/TempDataModel');
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

  // All materials processed - log to Google Sheets if needed
  if (character?.inventory && typeof character.inventory === 'string' && isValidGoogleSheetsUrl(character.inventory)) {
    try {
      const auth = await authorizeSheets();
      const spreadsheetId = extractSpreadsheetId(character.inventory);
      const range = 'loggedInventory!A2:M';
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
      const formattedDateTime = formatDateTime(new Date());

      await logMaterialsToGoogleSheets(
        auth,
        spreadsheetId,
        range,
        character,
        materialsUsed,
        craftableItem,
        interactionUrl,
        formattedDateTime
      );
    } catch (error) {
      handleError(error, 'inventoryUtils.js');
      console.error(`[inventoryUtils.js]: Error logging materials to sheet: ${error.message}`);
    }
  }

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
      const initialItem = await inventoryCollection.findOne({
        characterId: character._id,
        itemName: "Initial Item",
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
// Handles refunding a job voucher to a character's inventory and logs it to Google Sheets
async function refundJobVoucher(character, interaction) {
    try {
        if (!character || !interaction) {
            throw new Error("Character and interaction objects are required");
        }

        console.log(`[inventoryUtils.js]: 🎫 Processing job voucher refund for ${character.name}`);

        // Add the job voucher to inventory
        await addItemInventoryDatabase(character._id, "Job Voucher", 1, interaction, "Voucher Refund");
        console.log(`[inventoryUtils.js]: ✅ Successfully refunded job voucher to ${character.name}'s inventory`);

        // Log the refund to Google Sheets if character has an inventory sheet
        if (character.inventory) {
            const values = [[
                character.name,
                "Job Voucher",
                1,
                "Voucher",
                "Job",
                "Refund",
                "Voucher Refund",
                character.job || "",
                character.perk || "",
                character.currentLocation || character.homeVillage || "",
                `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
                new Date().toISOString(),
                uuidv4()
            ]];

            await safeAppendDataToSheet(
                character.inventory,
                character,
                'loggedInventory!A2:M',
                values,
                interaction.client
            );
            console.log(`[inventoryUtils.js]: ✅ Successfully logged job voucher refund to Google Sheets for ${character.name}`);
        }

        return true;
    } catch (error) {
        handleError(error, "inventoryUtils.js");
        console.error(`[inventoryUtils.js]: ❌ Error refunding job voucher:`, error.message);
        throw error;
    }
}

// ---- Function: syncSheetDataToDatabase ----
// Syncs data from a sheet directly to the database
const syncSheetDataToDatabase = async (character, sheetData) => {
    try {
        if (!dbFunctions.connectToInventories) {
            throw new Error("Required database functions not initialized");
        }

        const inventoriesConnection = await dbFunctions.connectToInventories();
        const db = inventoriesConnection.useDb('inventories');
        const collectionName = character.name.toLowerCase();
        console.log(`[inventoryUtils.js]: 📁 Using collection: ${collectionName}`);
        
        const inventoryCollection = db.collection(collectionName);

        // Process the sheet data
        const processedItems = sheetData.map(row => {
            const [_, itemName, quantity, category, type, subtype, obtain, job, perk, location, link, date, syncId] = row;
            return {
                characterId: character._id,
                characterName: character.name,
                itemName: itemName.trim().toLowerCase(),
                quantity: parseInt(quantity) || 0,
                category: category || '',
                type: type || '',
                subtype: subtype || '',
                job: job || '',
                perk: perk || '',
                location: location || '',
                link: link || '',
                date: date || new Date().toISOString(),
                obtain: obtain || 'Manual Sync',
                syncId: syncId || ''
            };
        });

        // Add each item to the database
        for (const item of processedItems) {
            const existingItem = await inventoryCollection.findOne({
                characterId: character._id,
                itemName: item.itemName,
                syncId: item.syncId // Check for existing sync ID to prevent duplicates
            });

            if (!existingItem) {
                console.log(`[inventoryUtils.js]: ➕ Adding new item ${item.itemName} (${item.quantity}) to ${character.name}'s inventory`);
                await inventoryCollection.insertOne(item);
            } else {
                console.log(`[inventoryUtils.js]: ⚠️ Item ${item.itemName} with sync ID ${item.syncId} already exists in database`);
            }
        }

        return true;
    } catch (error) {
        handleError(error, "inventoryUtils.js");
        console.error(`[inventoryUtils.js]: ❌ Error syncing sheet data to database:`, error.message);
        throw error;
    }
};

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
    
    console.log(`[inventoryUtils.js] 📝 Logged item acquisition: ${quantity}x ${itemName} for ${character.name} (${obtain})`);
    
    return logEntry;
  } catch (error) {
    // Don't fail the main operation if logging fails
    console.error(`[inventoryUtils.js] ⚠️ Failed to log item acquisition to database:`, error.message);
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
    
    console.log(`[inventoryUtils.js] 📝 Logged item removal: ${negativeQuantity}x ${itemName} for ${character.name} (${obtain})`);
    
    return logEntry;
  } catch (error) {
    // Don't fail the main operation if logging fails
    console.error(`[inventoryUtils.js] ⚠️ Failed to log item removal to database:`, error.message);
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
  logMaterialsToGoogleSheets,
  refundJobVoucher,
  SOURCE_TYPES,
  syncSheetDataToDatabase,
  escapeRegExp,
  logItemAcquisitionToDatabase,
  logItemRemovalToDatabase
};