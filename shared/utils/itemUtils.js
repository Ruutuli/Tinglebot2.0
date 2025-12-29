// ------------------- itemUtils.js -------------------
// This module provides utility functions for item management in the inventory system,
// including creating new and removed item entries, adding/removing items from the database,
// prompting users for specific items based on general categories, and retrieving sheet IDs.

// ============================================================================
// ------------------- Importing utility functions -------------------
const { handleError } = require('./globalErrorHandler');

// ============================================================================

// ------------------- Importing database service functions -------------------
let connectToInventories = null;

// ============================================================================
// Utility Functions
// ------------------- Importing utility functions -------------------
const { appendSheetData } = require('./googleSheetsUtils');
const { extractSpreadsheetId } = require('./googleSheetsUtils');

// ============================================================================
// Database Models
// ------------------- Importing database models -------------------
const generalCategories = require('../models/GeneralItemCategories');

// Initialize database connection function
function initializeDbConnection(dbConnectFn) {
    connectToInventories = dbConnectFn;
}

// ============================================================================
// Inventory Management Functions
// ------------------- Create New Item Database Entry -------------------
// Creates a new inventory item entry object for a character.
const createNewItemDatabase = (character, itemName, quantity, category, type, interaction = null) => {
    const link = interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : '';
    return {
        characterId: character._id,
        characterName: character.name,
        itemName: itemName.trim().toLowerCase(),
        quantity,
        category: Array.isArray(category) ? category.join(', ') : category,
        type: Array.isArray(type) ? type.join(', ') : type,
        subtype: '',
        job: character.job || '',
        perk: character.perk || '',
        location: character.currentLocation || character.homeVillage || '',
        link,
        date: new Date(),
        obtain: 'Crafting',
        synced: ''
    };
};

// ------------------- Create Removed Item Database Entry -------------------
// Creates a record for an item removed from a character's inventory.
const createRemovedItemDatabase = (character, item, quantity, interaction = null, obtainMethod = 'Manual Entry') => {
    const link = interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : '';
    return {
        characterId: character._id,
        characterName: character.name,
        itemId: item._id,
        itemName: item.itemName.trim().toLowerCase(),
        quantity: -quantity,
        category: Array.isArray(item.category) ? item.category.join(', ') : item.category,
        // Fixed bug: using item.type instead of undefined variable "type"
        type: Array.isArray(item.type) ? item.type.join(', ') : item.type,
        subtype: item.subtype,
        job: character.job || '',
        perk: character.perk || '',
        location: character.currentLocation || character.homeVillage || '',
        link,
        date: new Date(),
        obtain: obtainMethod,
        synced: ''
    };
};

// ------------------- Add Multiple Items to Database -------------------
// Adds multiple items to the inventory database for a character.
// Also appends the new items to the Google Sheets "Inventory" sheet.
const addItemsToDatabase = async (character, items, interaction = null) => {
    try {
        const inventoriesConnection = await connectToInventories();
        const db = inventoriesConnection.useDb('inventories');
        const collectionName = character.name.toLowerCase();
        const inventoryCollection = db.collection(collectionName);

        for (const item of items) {
            const existingItem = await inventoryCollection.findOne({
                characterId: character._id,
                itemName: item.itemName.trim().toLowerCase(),
            });

            if (existingItem) {
                await inventoryCollection.updateOne(
                    { characterId: character._id, itemName: item.itemName.trim().toLowerCase() },
                    { $inc: { quantity: item.quantity } }
                );
            } else {
                await inventoryCollection.insertOne({
                    ...item,
                    characterId: character._id,
                    characterName: character.name,
                    date: new Date()
                });
            }
        }

        // Use extractSpreadsheetId instead of getSheetIdByName for obtaining the spreadsheet ID from URL.
        const spreadsheetId = extractSpreadsheetId(character.inventory);

        if (interaction) {
            const sheetRows = items.map(item => [
                character.name,
                item.itemName,
                item.quantity,
                new Date().toISOString(),
                `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
            ]);
            await appendSheetData(spreadsheetId, 'Inventory', sheetRows);
        }
    } catch (error) {
    handleError(error, 'itemUtils.js');

        throw new Error(`❌ Error in addItemsToDatabase: ${error.message}`);
    }
};

// ------------------- Remove Item from Database -------------------
// Removes a specified quantity of an item from the inventory database for a character.
// Also appends the removal to the Google Sheets "Inventory" sheet.
const removeItemDatabase = async (character, item, quantity, interaction = null) => {
    try {
        const inventoriesConnection = await connectToInventories();
        const db = inventoriesConnection.useDb('inventories');
        const collectionName = character.name.toLowerCase();
        const inventoryCollection = db.collection(collectionName);

        const existingItem = await inventoryCollection.findOne({
            characterId: character._id,
            itemName: item.itemName.trim().toLowerCase(),
        });

        if (existingItem) {
            if (existingItem.quantity >= quantity) {
                await inventoryCollection.updateOne(
                    { characterId: character._id, itemName: item.itemName.trim().toLowerCase() },
                    { $inc: { quantity: -quantity } }
                );
            } else {
                throw new Error(`❌ Not enough quantity of ${item.itemName} to remove`);
            }
        } else {
            throw new Error(`❌ Item ${item.itemName} not found in inventory`);
        }

        // Use extractSpreadsheetId to get the spreadsheet ID.
        const spreadsheetId = extractSpreadsheetId(character.inventory);

        if (interaction) {
            await appendSheetData(spreadsheetId, 'Inventory', [[
                character.name,
                item.itemName,
                -quantity,
                new Date().toISOString(),
                `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
            ]]);
        }
    } catch (error) {
    handleError(error, 'itemUtils.js');

        throw new Error(`❌ Error in removeItemDatabase: ${error.message}`);
    }
};


// ------------------- Sort Inventory Items By Rarity -------------------
function sortItemsByRarity(inventoryItems) {
    return inventoryItems
      .sort((a, b) => {
        const rarityA = a.itemRarity || 1;
        const rarityB = b.itemRarity || 1;
        return rarityA - rarityB;
      });
  }
  

// ------------------- Prompt User for Specific Items -------------------
// Returns available items from a general category for web dashboard use.
const promptUserForSpecificItems = async (inventory, generalCategoryItemName, requiredQuantity) => {
    if (!generalCategories[generalCategoryItemName]) {
        throw new Error(`❌ **General category ${generalCategoryItemName} is not defined.**`);
    }

    let specificItems = inventory.filter(item => generalCategories[generalCategoryItemName].includes(item.itemName));
    specificItems = sortItemsByRarity(specificItems);

    if (specificItems.length === 0) {
        throw new Error(`❌ **No available items found for ${generalCategoryItemName}.**`);
    }

    // For web dashboard, return the available items instead of handling Discord interactions
    return specificItems.map(item => ({
        itemName: item.itemName,
        quantity: item.quantity,
        _id: item._id,
        itemRarity: item.itemRarity || 1
    }));
};

// ------------------- Process Sheet Data for Database -------------------
// Converts sheet data into the correct format for database insertion
const processSheetDataForDatabase = (sheetData) => {
    return sheetData.map(row => {
        const [characterName, itemName, quantity, category, type, subtype, obtain, job, perk, location, link, date, syncId] = row;
        return {
            itemName: itemName.trim().toLowerCase(),
            quantity: parseInt(quantity) || 0,
            category: category || '',
            type: type || '',
            subtype: subtype || '',
            obtain: obtain || 'Manual Sync',
            job: job || '',
            perk: perk || '',
            location: location || '',
            link: link || '',
            date: date || new Date().toISOString(),
            syncId: syncId || ''
        };
    });
};

module.exports = {
    createNewItemDatabase,       // Creates a new inventory item entry.
    createRemovedItemDatabase,   // Creates a record for a removed inventory item.
    removeItemDatabase,          // Removes a specified quantity of an item from the database.
    addItemsToDatabase,          // Adds multiple items to the inventory database.
    promptUserForSpecificItems,  // Prompts the user to select specific items from a general category.
    processSheetDataForDatabase  // Processes sheet data for database insertion.
};
