// ------------------- inventoryUtils.js -------------------

// ------------------- Import necessary modules and functions -------------------
const { connectToInventories } = require('../database/connection');
const {
    appendSheetData,
    authorizeSheets,
    getSheetIdByTitle,
    readSheetData,
    writeSheetData,
} = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId } = require('../utils/validation');
const {
    fetchCharacterById,
    fetchCharacterByNameAndUserId,
} = require('../database/characterService');
const {
    fetchAndSortItemsByRarity,
    fetchItemById,
    fetchItemByName,
} = require('../database/itemService');
const { toLowerCase } = require('../modules/formattingModule');
const { safeStringify } = require('../utils/objectUtils');
const generalCategories = require('../models/GeneralItemCategories');
const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');
const { promptUserForSpecificItems } = require('../utils/itemUtils');

// ------------------- Utility Functions -------------------

// --------- Format date and time in a specific timezone ---------
function formatDateTime(date) {
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
    };
    return (
        new Intl.DateTimeFormat('en-US', options)
            .format(new Date(date))
            .replace(',', ' |') + ' EST'
    );
}

// --------- Escape special characters in a string for use in a regular expression ---------
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --------- Convert BigInt values to strings during JSON stringification ---------
function replacer(key, value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    return value;
}

// --------- Extract fields from an interaction object ---------
function extractInteractionFields(interaction) {
    if (!interaction) {
        return {};
    }

    return {
        id: interaction.id || null,
        applicationId: interaction.applicationId || null,
        channelId: interaction.channelId || null,
        guildId: interaction.guildId || null,
        user: interaction.user || null,
        commandName: interaction.commandName || null,
        options: interaction.options || null,
    };
}

// ------------------- Inventory Management Functions -------------------

// --------- Sync inventory data to the database and Google Sheets ---------
async function syncToInventoryDatabase(character, item, interaction) {
    try {
        const inventoriesConnection = await connectToInventories();
        const db = inventoriesConnection.useDb('inventories');
        const inventoryCollection = db.collection(character.name.toLowerCase());

        const existingItem = await inventoryCollection.findOne({
            characterId: item.characterId,
            itemName: String(item.itemName).trim().toLowerCase(),
        });

        if (existingItem) {
            await inventoryCollection.updateOne(
                { characterId: item.characterId, itemName: String(item.itemName).trim().toLowerCase() },
                { $inc: { quantity: item.quantity } }
            );
        } else {
            await inventoryCollection.insertOne(item);
        }

        const auth = await authorizeSheets();
        const spreadsheetId = extractSpreadsheetId(character.inventory);
        const range = 'loggedInventory!A2:M';
        const sheetData = await readSheetData(auth, spreadsheetId, range);

        const rowIndex = sheetData.findIndex(
            (row) => row[0] === character.name && row[1] === item.itemName
        );
        if (rowIndex !== -1) {
            sheetData[rowIndex] = [
                character.name,
                item.itemName,
                item.quantity,
                item.category,
                item.type,
                item.subtype,
                item.obtain,
                item.job,
                item.perk,
                item.location,
                item.link,
                formatDateTime(item.date),
                item.synced,
            ];

            const updateRange = `loggedInventory!A${rowIndex + 2}:M${rowIndex + 2}`;
            await writeSheetData(auth, spreadsheetId, updateRange, [sheetData[rowIndex]]);
        }
    } catch (error) {
        console.error('[inventoryUtils.js]: Error syncing to inventory database:', error);
        throw error;
    }
}

// --------- Add an item to the inventory database ---------
async function addItemInventoryDatabase(characterId, itemName, quantity, interaction, obtain = '') {
    try {
        if (!interaction) {
            throw new Error('Interaction object is undefined.');
        }

        const character = await fetchCharacterById(characterId);
        if (!character) {
            throw new Error(`Character with ID ${characterId} not found`);
        }

        const inventoriesConnection = await connectToInventories();
        const db = inventoriesConnection.useDb('inventories');
        const inventoryCollection = db.collection(character.name.toLowerCase());

        // Check for an existing item with the same `itemName` and `obtain` method
        const inventoryItem = await inventoryCollection.findOne({
            characterId,
            itemName: new RegExp(`^${escapeRegExp(String(itemName).trim().toLowerCase())}$`, 'i'),
            obtain,
        });

        if (inventoryItem) {
            // Update quantity if item exists with the same obtain method
            const cleanedQuantity =
                typeof quantity === 'string'
                    ? parseInt(quantity.replace(/,/g, ''), 10)
                    : quantity;
            const newQuantity = inventoryItem.quantity + cleanedQuantity;
            await inventoryCollection.updateOne(
                { characterId, itemName: inventoryItem.itemName, obtain },
                { $set: { quantity: newQuantity } }
            );
        } else {
            // Insert a new item if no match is found
            const item = await fetchItemByName(itemName);
            if (!item) {
                throw new Error(`Item with name ${itemName} not found`);
            }

            const newItem = {
                characterId,
                itemName: item.itemName,
                itemId: item._id,
                quantity,
                category: item.category.join(', '),
                type: item.type.join(', '),
                subtype: item.subtype ? item.subtype.join(', ') : '',
                location: character.currentVillage,
                date: new Date(),
                obtain, // Dynamically set obtain method
            };
            await inventoryCollection.insertOne(newItem);
        }
    } catch (error) {
        console.error('[inventoryUtils.js]: Error adding item to inventory database:', error);
        throw error;
    }
}


// --------- Remove an item from the inventory database ---------
async function removeItemInventoryDatabase(characterId, itemName, quantity, interaction) {
    try {
        const character = await fetchCharacterById(characterId);
        if (!character) {
            throw new Error(`Character with ID ${characterId} not found`);
        }

        const collectionName = character.name.toLowerCase();
        const inventoriesConnection = await connectToInventories();
        const db = inventoriesConnection.useDb('inventories');
        const inventoryCollection = db.collection(collectionName);

        const inventoryItem = await inventoryCollection.findOne({
            characterId: character._id,
            itemName: new RegExp(`^${escapeRegExp(String(itemName).trim().toLowerCase())}$`, 'i'),
        });

        if (!inventoryItem) {
            return false;
        }

        if (inventoryItem.quantity < quantity) {
            return false;
        }

        const newQuantity = inventoryItem.quantity - quantity;
        if (newQuantity === 0) {
            await inventoryCollection.deleteOne({ characterId: character._id, itemName: inventoryItem.itemName });
        } else {
            await inventoryCollection.updateOne(
                { characterId: character._id, itemName: inventoryItem.itemName },
                { $set: { quantity: newQuantity } }
            );
        }

        return true;
    } catch (error) {
        console.error('[inventoryUtils.js]: Error removing item from inventory database:', error);
        throw error;
    }
}

// --------- Add multiple items to the database ---------
const addItemsToDatabase = async (character, items, interaction) => {
    try {
        const inventoriesConnection = await connectToInventories();
        const db = inventoriesConnection.useDb('inventories');
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
            await appendSheetData(spreadsheetId, 'Inventory', sheetRows);
        }
    } catch (error) {
        console.error('[inventoryUtils.js]: Error adding multiple items to database:', error);
        throw error;
    }
};

// --------- Create a new item in the database ---------
const createNewItemDatabase = (character, itemName, quantity, category, type, interaction) => {
    itemName = String(itemName).trim().toLowerCase();
    const link = interaction
        ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
        : '';
    return {
        characterId: character._id,
        characterName: character.name,
        itemName,
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
        synced: '',
    };
};

// --------- Create a removed item entry in the database ---------
// This function generates a removed item entry when an item is removed from the character's inventory.
const createRemovedItemDatabase = (character, item, quantity, interaction, obtainMethod = 'Manual Entry') => {
    const itemName = String(item.itemName).trim().toLowerCase();
    const link = interaction
        ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`
        : '';
    return {
        characterId: character._id,
        characterName: character.name,
        itemId: item._id,
        itemName,
        quantity: -quantity,
        category: Array.isArray(item.category) ? item.category.join(', ') : item.category,
        type: Array.isArray(item.type) ? item.type.join(', ') : item.type,
        subtype: item.subtype,
        job: character.job || '',
        perk: character.perk || '',
        location: character.currentLocation || character.homeVillage || '',
        link,
        date: new Date(),
        obtain: obtainMethod,
        synced: '',
    };
};

// --------- Process materials required for crafting an item ---------
// This function ensures the required materials for crafting are available and processes their removal.
const processMaterials = async (interaction, character, inventory, craftableItem, quantity) => {
    const materialsUsed = [];

    for (const material of craftableItem.craftingMaterial) {
        const materialName = material.itemName;
        let specificItems = [];
        let requiredQuantity = material.quantity * quantity;

        if (generalCategories[materialName]) {
            const result = await promptUserForSpecificItems(interaction, inventory, materialName, requiredQuantity);
            if (result === 'canceled') {
                return 'canceled';
            }
            specificItems = result;
        } else {
            specificItems = inventory.filter((item) => item.itemName === materialName);
        }

        let totalQuantity = specificItems.reduce((sum, item) => sum + item.quantity, 0);

        if (totalQuantity < requiredQuantity) {
            throw new Error(
                `❌ **Unable to find or insufficient quantity for ${materialName} in ${character.name}'s inventory. Required: ${requiredQuantity}, Found: ${totalQuantity}**`
            );
        }

        for (const specificItem of specificItems) {
            if (requiredQuantity <= 0) break;

            let removeQuantity = Math.min(requiredQuantity, specificItem.quantity);
            await removeItemInventoryDatabase(character._id, specificItem.itemName, removeQuantity, interaction);
            materialsUsed.push({ itemName: specificItem.itemName, quantity: removeQuantity, _id: specificItem._id });
            requiredQuantity -= removeQuantity;
        }
    }

    return materialsUsed;
};

// --------- Remove Initial Item if inventorySynced is true ---------
// This function removes the "Initial Item" from a synced inventory.
async function removeInitialItemIfSynced(characterId) {
    try {
        const character = await fetchCharacterById(characterId);
        if (!character) {
            throw new Error(`Character with ID ${characterId} not found`);
        }

        if (character.inventorySynced) {
            const collectionName = character.name.toLowerCase();
            const inventoriesConnection = await connectToInventories();
            const db = inventoriesConnection.useDb('inventories');
            const inventoryCollection = db.collection(collectionName);

            const initialItem = await inventoryCollection.findOne({
                characterId: character._id,
                itemName: 'Initial Item',
            });

            if (initialItem) {
                await inventoryCollection.deleteOne({ _id: initialItem._id });
                console.log('Initial Item removed from inventory.');
            } else {
                console.log('Initial Item not found in inventory.');
            }
        }
    } catch (error) {
        console.error(`[inventoryUtils.js]: Error removing Initial Item: ${error.message}`);
        throw error;
    }
}

// --------- Add item to vending inventory ---------
// This function adds items to a vending inventory collection, updating stock quantities as needed.
const addItemToVendingInventory = async (collectionName, item) => {
    try {
        const inventoriesConnection = await connectToInventories();
        const db = inventoriesConnection.useDb('vending');
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
        console.error('[inventoryUtils.js]: Error adding item to vending inventory:', error);
        throw error;
    }
};

// --------- Remaining functions are listed in a similar detailed way ---------

module.exports = {
    syncToInventoryDatabase,     // Synchronizes inventory data with the database and Google Sheets.
    addItemInventoryDatabase,    // Adds a single item to the inventory database for a character.
    removeItemInventoryDatabase, // Removes a specified quantity of an item from the inventory database.
    processMaterials,            // Processes materials needed for crafting and updates the inventory.
    createNewItemDatabase,       // Creates a new item entry in the database for a character.
    createRemovedItemDatabase,   // Creates a record for a removed item from a character's inventory.
    addItemsToDatabase,          // Adds multiple items to the inventory database for a character.
    removeInitialItemIfSynced,   // Removes the 'Initial Item' if the inventory is synced.
    addItemToVendingInventory,   // Adds an item to the vending inventory or updates its stock.
};
