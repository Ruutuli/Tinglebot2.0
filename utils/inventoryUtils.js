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
} = require("../utils/googleSheetsUtils");
const generalCategories = require("../models/GeneralItemCategories");

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

// ---- Function: extractSpreadsheetId ----
// Extracts spreadsheet ID from Google Sheets URL
function extractSpreadsheetId(url) {
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

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
    const db = inventoriesConnection.useDb("inventories");
    const inventoryCollection = db.collection(character.name.toLowerCase());

    // Fetch item details for required fields
    const itemDetails = await dbFunctions.fetchItemByName(item.itemName);
    const itemId = itemDetails?._id || item.itemId || null;
    const category = Array.isArray(itemDetails?.category) ? itemDetails.category.join(", ") : (item.category || "");
    const type = Array.isArray(itemDetails?.type) ? itemDetails.type.join(", ") : (item.type || "");
    const subtype = Array.isArray(itemDetails?.subtype) ? itemDetails.subtype : (Array.isArray(item.subtype) ? item.subtype : (item.subtype ? [item.subtype] : []));
    const job = character.job || "";
    const perk = character.perk || "";
    const location = character.currentLocation || character.homeVillage || character.currentVillage || "";
    const link = interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : (item.link || "");
    const date = item.date || new Date();
    const obtain = item.obtain || "Manual Sync";
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

    const existingItem = await inventoryCollection.findOne({
      characterId: dbDoc.characterId,
      itemName: dbDoc.itemName,
    });

    if (item.quantity < 0) {
      // Remove item logic
      if (!existingItem || existingItem.quantity < Math.abs(item.quantity)) {
        console.error(`[inventoryUtils.js]: ❌ Not enough ${dbDoc.itemName} for ${character.name}`);
        throw new Error(`Not enough '${dbDoc.itemName}' to remove from inventory.`);
      }
      const newQty = existingItem.quantity + item.quantity; // item.quantity is negative
      if (newQty <= 0) {
        await inventoryCollection.deleteOne({
          characterId: dbDoc.characterId,
          itemName: dbDoc.itemName,
        });
      } else {
        await inventoryCollection.updateOne(
          { characterId: dbDoc.characterId, itemName: dbDoc.itemName },
          { $set: { ...dbDoc, quantity: newQty } }
        );
      }
    } else if (item.quantity > 0) {
      // Add item logic
      if (existingItem) {
        const newQty = existingItem.quantity + item.quantity;
        await inventoryCollection.updateOne(
          { characterId: dbDoc.characterId, itemName: dbDoc.itemName },
          { $set: { ...dbDoc, quantity: newQty } }
        );
      } else {
        await inventoryCollection.insertOne({ ...dbDoc });
      }
    } else {
      console.warn(`[inventoryUtils.js]: ⚠️ Zero quantity transaction for ${character.name} | ${dbDoc.itemName}`);
    }

    // Google Sheets Sync
    try {
      const values = [[
        characterName,
        dbDoc.itemName,
        dbDoc.quantity,
        dbDoc.category,
        dbDoc.type,
        Array.isArray(dbDoc.subtype) ? dbDoc.subtype.join(", ") : dbDoc.subtype,
        dbDoc.obtain,
        dbDoc.job,
        dbDoc.perk,
        dbDoc.location,
        dbDoc.link,
        formatDateTime(dbDoc.date),
        dbDoc.synced,
      ]];
      
      await safeAppendDataToSheet(character.inventory, character, "loggedInventory!A2:M", values);
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

    const character = await dbFunctions.fetchCharacterById(characterId);
    if (!character) {
      throw new Error(`Character with ID ${characterId} not found`);
    }
    console.log(`[inventoryUtils.js]: 📦 Processing inventory for ${character.name}`);

    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb("inventories");
    const collectionName = character.name.toLowerCase().replace(/\s+/g, "_");
    const inventoryCollection = db.collection(collectionName);

    const item = await dbFunctions.fetchItemByName(itemName);
    if (!item) {
      throw new Error(`Item with name "${itemName}" not found`);
    }

    const inventoryItem = await inventoryCollection.findOne({
      characterId,
      itemName: new RegExp(`^${escapeRegExp(itemName.trim().toLowerCase())}$`, "i"),
      obtain,
    });

    if (inventoryItem) {
      const newQuantity = inventoryItem.quantity + quantity;
      console.log(`[inventoryUtils.js]: 🔄 Updated ${itemName} quantity to ${newQuantity}`);
      await inventoryCollection.updateOne(
        { characterId, itemName: inventoryItem.itemName, obtain },
        { $set: { quantity: newQuantity } }
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
      console.log(`[inventoryUtils.js]: ➕ Added new item ${itemName} to inventory`);
      await inventoryCollection.insertOne(newItem);
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
    if (!dbFunctions.fetchCharacterById || !dbFunctions.connectToInventories) {
      throw new Error("Required database functions not initialized");
    }

    const character = await dbFunctions.fetchCharacterById(characterId);
    if (!character) {
      throw new Error(`Character with ID ${characterId} not found`);
    }
    const collectionName = character.name.toLowerCase();
    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb("inventories");
    const inventoryCollection = db.collection(collectionName);

    const inventoryItem = await inventoryCollection.findOne({
      characterId: character._id,
      itemName: new RegExp(`^${escapeRegExp(String(itemName).trim().toLowerCase())}$`, "i"),
    });
    if (!inventoryItem) {
      return false;
    }
    if (inventoryItem.quantity < quantity) {
      return false;
    }
    const newQuantity = inventoryItem.quantity - quantity;
    if (newQuantity === 0) {
      await inventoryCollection.deleteOne({
        characterId: character._id,
        itemName: inventoryItem.itemName,
      });
    } else {
      await inventoryCollection.updateOne(
        { characterId: character._id, itemName: inventoryItem.itemName },
        { $set: { quantity: newQuantity } }
      );
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
    const db = inventoriesConnection.useDb("inventories");
    const collectionName = character.name.toLowerCase();
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
        await interaction.followUp({
          content: `❌ **You don't have enough ${materialName} to craft this item!**\nRequired: ${requiredQuantity}, Found: ${totalQuantity}`,
          ephemeral: true,
        });
      }
      return "canceled"; // Cancel crafting gracefully
    }

    for (const specificItem of specificItems) {
      if (requiredQuantity <= 0) break;
      let removeQuantity = Math.min(requiredQuantity, specificItem.quantity);
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
      const collectionName = character.name.toLowerCase();
      const inventoriesConnection = await dbFunctions.connectToInventories();
      const db = inventoriesConnection.useDb("inventories");
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

// ---- Function: addItemToVendingInventory ----
// Adds item to vending machine inventory
const addItemToVendingInventory = async (collectionName, item) => {
  try {
    if (!dbFunctions.connectToInventories) {
      throw new Error("Required database functions not initialized");
    }

    const inventoriesConnection = await dbFunctions.connectToInventories();
    const db = inventoriesConnection.useDb("vending");
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
  extractSpreadsheetId,
};
