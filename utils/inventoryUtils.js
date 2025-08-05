// ============================================================================
// ---- Imports ----
// External dependencies and internal modules
// ============================================================================

const { handleError } = require("../utils/globalErrorHandler");
const { promptUserForSpecificItems } = require('../utils/itemUtils');
const {
  appendSheetData,
  authorizeSheets,
  getSheetIdByTitle,
  readSheetData,
  writeSheetData,
  safeAppendDataToSheet,
  extractSpreadsheetId,
  isValidGoogleSheetsUrl
} = require("../utils/googleSheetsUtils");
const generalCategories = require("../models/GeneralItemCategories");
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const ItemModel = require('../models/ItemModel');
const { EmbedBuilder } = require('discord.js');

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
    
    // Use per-character inventory collection for mod characters (not shared)
    let collectionName;
    collectionName = character.name.toLowerCase();
    
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
      quantity: parseInt(item.quantity) || 0,
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
    } else {
      // Insert new item
      await inventoryCollection.insertOne(dbDoc);
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
async function addItemInventoryDatabase(characterId, itemName, quantity, interaction, obtain = "", craftedAt = null) {
  try {
    if (!interaction && obtain !== 'Trade') {
      throw new Error("Interaction object is undefined.");
    }

    if (!dbFunctions.fetchCharacterById || !dbFunctions.connectToInventories || !dbFunctions.fetchItemByName) {
      throw new Error("Required database functions not initialized");
    }

    const character = await dbFunctions.fetchCharacterById(characterId);
    if (!character) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Character Not Found')
        .setDescription(`Character with ID ${characterId} not found`)
        .addFields(
          { name: 'Character ID', value: characterId.toString(), inline: true }
        )
        .setFooter({ text: 'Please check the character ID and try again' })
        .setTimestamp();

      throw new Error(`Character with ID ${characterId} not found`);
    }
    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    
    // Use per-character inventory collection for mod characters (not shared)
    let collectionName;
    collectionName = character.name.toLowerCase();
    
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
      await inventoryCollection.updateOne(
        { characterId, itemName: inventoryItem.itemName },
        { $inc: { quantity: quantity } }
      );
    } else {
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
      if ((obtain === 'Crafting' || obtain === 'Custom Weapon') && craftedAt) {
        newItem.craftedAt = craftedAt;
      }
      await inventoryCollection.insertOne(newItem);
    }

    // Google Sheets Sync for item addition
    if (character.inventory && typeof character.inventory === 'string' && isValidGoogleSheetsUrl(character.inventory)) {
      try {
        // Fetch item details for proper categorization
        const itemDetails = await dbFunctions.fetchItemByName(itemName);
        const category = Array.isArray(itemDetails?.category) ? itemDetails.category.join(", ") : (itemDetails?.category || "");
        const type = Array.isArray(itemDetails?.type) ? itemDetails.type.join(", ") : (itemDetails?.type || "");
        const subtype = Array.isArray(itemDetails?.subtype) ? itemDetails.subtype.join(", ") : (itemDetails?.subtype || "");
        
        // Create addition log entry with correct format
        const additionLogEntry = [
          character.name, // Character Name (A)
          itemName, // Item Name (B)
          quantity, // Qty of Item (C) - positive for addition
          category, // Category (D)
          type, // Type (E)
          subtype, // Subtype (F)
          obtain, // Obtain (G)
          character.job || "", // Job (H)
          character.perk || "", // Perk (I)
          character.currentLocation || character.homeVillage || "", // Location (J)
          interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : "", // Link (K)
          formatDateTime(new Date()), // Date/Time (L)
          uuidv4() // Confirmed Sync (M)
        ];

        // Log to Google Sheets
        await safeAppendDataToSheet(
          character.inventory,
          character,
          'loggedInventory!A:M',
          [additionLogEntry],
          interaction?.client,
          { skipValidation: false }
        );
        
      } catch (sheetError) {
        console.error(`[inventoryUtils.js]: ⚠️ Failed to log item addition to Google Sheets: ${sheetError.message}`);
        // Don't fail the addition if sheet logging fails
      }
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
async function removeItemInventoryDatabase(characterId, itemName, quantity, interaction, obtain = "Trade", skipSheetsLogging = false) {
  try {
    if (!dbFunctions.fetchCharacterById || !dbFunctions.connectToInventories) {
      throw new Error("Required database functions not initialized");
    }

    const character = await dbFunctions.fetchCharacterById(characterId);
    if (!character) {
      throw new Error(`Character with ID ${characterId} not found`);
    }

    // Use per-character inventory collection for mod characters (not shared)
    let collectionName;
    collectionName = character.name.toLowerCase();
    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    
    const inventoryCollection = db.collection(collectionName);

    // First try exact match
    let inventoryItem = await inventoryCollection.findOne({
      characterId: character._id,
      itemName: { $regex: new RegExp(`^${escapeRegExp(itemName.trim())}$`, 'i') }
    });

    // If no exact match, try case-insensitive match
    if (!inventoryItem) {
      inventoryItem = await inventoryCollection.findOne({
        characterId: character._id,
        itemName: { $regex: new RegExp(`^${escapeRegExp(itemName.trim())}$`, 'i') }
      });
    }

    if (!inventoryItem) {
      return false;
    }

    if (inventoryItem.quantity < quantity) {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTitle('❌ Insufficient Items')
        .setDescription(`Not enough ${itemName} in inventory`)
        .addFields(
          { name: 'Required', value: quantity.toString(), inline: true },
          { name: 'Available', value: inventoryItem.quantity.toString(), inline: true }
        )
        .setFooter({ text: 'Check your inventory and try again' })
        .setTimestamp();

      throw new Error(`Not enough ${itemName} in inventory`);
    }

    const newQuantity = inventoryItem.quantity - quantity;

    if (newQuantity === 0) {
      const deleteResult = await inventoryCollection.deleteOne({
        characterId: character._id,
        itemName: inventoryItem.itemName
      });
      
      if (deleteResult.deletedCount === 0) {
        console.error(`[inventoryUtils.js]: ❌ Failed to delete item ${itemName} from inventory`);
        return false;
      }
    } else {
      const updateResult = await inventoryCollection.updateOne(
        { characterId: character._id, itemName: inventoryItem.itemName },
        { $inc: { quantity: -quantity } }
      );
      
      if (updateResult.modifiedCount === 0) {
        console.error(`[inventoryUtils.js]: ❌ Failed to update quantity for item ${itemName}`);
        return false;
      }
    }

    // Google Sheets Sync for item removal - only if not skipping
    if (!skipSheetsLogging && character.inventory && typeof character.inventory === 'string' && isValidGoogleSheetsUrl(character.inventory)) {
      try {
        // Fetch item details for proper categorization
        const itemDetails = await dbFunctions.fetchItemByName(itemName);
        const category = Array.isArray(itemDetails?.category) ? itemDetails.category.join(", ") : (itemDetails?.category || "");
        const type = Array.isArray(itemDetails?.type) ? itemDetails.type.join(", ") : (itemDetails?.type || "");
        const subtype = Array.isArray(itemDetails?.subtype) ? itemDetails.subtype.join(", ") : (itemDetails?.subtype || "");
        
        // Create removal log entry with correct format
        const removalLogEntry = [
          character.name, // Character Name (A)
          itemName, // Item Name (B)
          -quantity, // Qty of Item (C) - negative for removal
          category, // Category (D)
          type, // Type (E)
          subtype, // Subtype (F)
          obtain, // Obtain (G)
          character.job || "", // Job (H)
          character.perk || "", // Perk (I)
          character.currentLocation || character.homeVillage || "", // Location (J)
          interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : "", // Link (K)
          formatDateTime(new Date()), // Date/Time (L)
          uuidv4() // Confirmed Sync (M)
        ];

        // Log to Google Sheets
        await safeAppendDataToSheet(
          character.inventory,
          character,
          'loggedInventory!A:M',
          [removalLogEntry],
          interaction?.client,
          { skipValidation: false }
        );
        
      } catch (sheetError) {
        console.error(`[inventoryUtils.js]: ⚠️ Failed to log item removal to Google Sheets: ${sheetError.message}`);
        // Don't fail the removal if sheet logging fails
      }
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
    
    // Use per-character inventory collection for mod characters (not shared)
    let collectionName;
    collectionName = character.name.toLowerCase();
    
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

    if (generalCategories[materialName]) {
      const result = await promptUserForSpecificItems(
        interaction,
        inventory,
        materialName,
        requiredQuantity
      );
      if (result === "canceled") {
        return "canceled";
      }
      specificItems = result;
    } else {
      specificItems = inventory.filter((item) => item.itemName === materialName);
    }

    let totalQuantity = specificItems.reduce(
      (sum, item) => sum + item.quantity,
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

    for (const specificItem of specificItems) {
      if (requiredQuantity <= 0) break;
      let removeQuantity = Math.min(requiredQuantity, specificItem.quantity);
      await removeItemInventoryDatabase(
        character._id,
        specificItem.itemName,
        removeQuantity,
        interaction,
        "Trade",
        true // Skip Google Sheets logging to prevent double logging
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

    const character = await dbFunctions.fetchCharacterById(characterId);
    if (!character) {
      throw new Error(`Character with ID ${characterId} not found`);
    }

    if (character.inventorySynced) {
      const inventoriesConnection = await dbFunctions.connectToInventories();
      const db = inventoriesConnection.useDb('inventories');
      
      // Use per-character inventory collection for mod characters (not shared)
      let collectionName;
      collectionName = character.name.toLowerCase();
      
      const inventoryCollection = db.collection(collectionName);
      const initialItem = await inventoryCollection.findOne({
        characterId: character._id,
        itemName: "Initial Item",
      });
      if (initialItem) {
        await inventoryCollection.deleteOne({ _id: initialItem._id });
      } else {
      }
    }
  } catch (error) {
    handleError(error, "inventoryUtils.js");
    console.error(`[inventoryUtils.js]: ❌ Error removing Initial Item: ${error.message}`);
    throw error;
  }
}

// ---- Function: addItemToVendingInventory ----
// Adds item to vending machine inventory
const addItemToVendingInventory = async (collectionName, item) => {
  try {
    if (!dbFunctions.connectToInventories) {
      throw new Error("Required database functions not initialized");
    }

    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb('vendingInventories');
    
    const inventoryCollection = db.collection(collectionName);
    const existingItem = await inventoryCollection.findOne({
      characterName: item.characterName,
      itemName: item.itemName,
    });
    if (existingItem) {
      await inventoryCollection.updateOne(
        { characterName: item.characterName, itemName: item.itemName },
        { $inc: { stockQty: item.stockQty } }
      );
    } else {
      await inventoryCollection.insertOne(item);
    }
  } catch (error) {
    handleError(error, "inventoryUtils.js");
    throw error;
  }
};

// ---- Function: refundJobVoucher ----
// Handles refunding a job voucher to a character's inventory and logs it to Google Sheets
async function refundJobVoucher(character, interaction) {
    try {
        if (!character || !interaction) {
            throw new Error("Character and interaction objects are required");
        }

        // Add the job voucher to inventory
        await addItemInventoryDatabase(character._id, "Job Voucher", 1, interaction, "Voucher Refund");

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
        
        // Use per-character inventory collection for mod characters (not shared)
        let collectionName;
        collectionName = character.name.toLowerCase();
        
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
                await inventoryCollection.insertOne(item);
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
  createNewItemDatabase,
  createRemovedItemDatabase,
  addItemsToDatabase,
  removeInitialItemIfSynced,
  addItemToVendingInventory,
  logMaterialsToGoogleSheets,
  refundJobVoucher,
  SOURCE_TYPES,
  syncSheetDataToDatabase
};