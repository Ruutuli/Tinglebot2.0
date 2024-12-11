// inventoryUtils.js

// Import necessary modules and functions
const { connectToInventories } = require('../database/connection');
const {
    writeSheetData, getSheetIdByTitle, authorizeSheets,
    readSheetData, appendSheetData
} = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId } = require('../utils/validation');
const {
    fetchCharacterById, fetchCharacterByNameAndUserId
} = require('../database/characterService');
const {
    fetchItemByName, fetchItemById, fetchAndSortItemsByRarity
} = require('../database/itemService');
const { toLowerCase } = require('../modules/formattingModule');
const { safeStringify } = require('../utils/objectUtils');
const generalCategories = require('../models/GeneralItemCategories');
const {
    StringSelectMenuBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle
} = require('discord.js');
const { promptUserForSpecificItems } = require('../utils/itemUtils'); // Reference to itemUtils.js

// Utility functions

// Format date and time in a specific timezone
function formatDateTime(date) {
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York'
    };
    return new Intl.DateTimeFormat('en-US', options).format(new Date(date)).replace(',', ' |') + ' EST';
}

// Escape special characters in a string for use in a regular expression
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Convert BigInt values to strings during JSON stringification
function replacer(key, value) {
    if (typeof value === 'bigint') {
        return value.toString();
    }
    return value;
}

// Extract fields from an interaction object
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

// Sync inventory data to the database and Google Sheets
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

        const rowIndex = sheetData.findIndex(row => row[0] === character.name && row[1] === item.itemName);
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
                item.synced
            ];

            const updateRange = `loggedInventory!A${rowIndex + 2}:M${rowIndex + 2}`;
            await writeSheetData(auth, spreadsheetId, updateRange, [sheetData[rowIndex]]);
        } else {
            // Handle adding new row logic if necessary
        }
    } catch (error) {
        throw error;
    }
}

// Add an item to the inventory database
const addItemInventoryDatabase = async (characterId, itemName, quantity, interaction) => {
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

        const inventoryItem = await inventoryCollection.findOne({
            characterId,
            itemName: new RegExp(`^${escapeRegExp(String(itemName).trim().toLowerCase())}$`, 'i')
        });

        if (inventoryItem) {
            const cleanedQuantity = typeof quantity === 'string' ? parseInt(quantity.replace(/,/g, ''), 10) : quantity;
            const newQuantity = inventoryItem.quantity + cleanedQuantity;            
            await inventoryCollection.updateOne(
                { characterId, itemName: inventoryItem.itemName },
                { $set: { quantity: newQuantity } }
            );
        } else {
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
                link: extractInteractionFields(interaction),
                date: new Date(),
                obtain: ['Crafting']
            };
            await inventoryCollection.insertOne(newItem);
        }
    } catch (error) {
        throw error;
    }
};

// Remove an item from the inventory database
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
            itemName: new RegExp(`^${escapeRegExp(String(itemName).trim().toLowerCase())}$`, 'i')
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
        throw error;
    }
}

// Add multiple items to the database
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
                    date: new Date()
                });
            }
        }

        const spreadsheetId = getSheetIdByName(character.inventory);

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
        throw error;
    }
};

// Create a new item in the database
const createNewItemDatabase = (character, itemName, quantity, category, type, interaction) => {
    itemName = String(itemName).trim().toLowerCase();
    const link = interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : '';
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
        synced: ''
    };
};

// Create a removed item entry in the database
const createRemovedItemDatabase = (character, item, quantity, interaction, obtainMethod = 'Manual Entry') => {
    const itemName = String(item.itemName).trim().toLowerCase();
    const link = interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : '';
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
        synced: ''
    };
};

// Process materials required for crafting an item
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
            specificItems = inventory.filter(item => item.itemName === materialName);
        }

        let totalQuantity = specificItems.reduce((sum, item) => sum + item.quantity, 0);

        if (totalQuantity < requiredQuantity) {
            throw new Error(`❌ **Unable to find or insufficient quantity for ${materialName} in ${character.name}'s inventory. Required: ${requiredQuantity}, Found: ${totalQuantity}**`);
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

// Remove Initial Item if inventorySynced is true
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
                itemName: "Initial Item",
            });

            if (initialItem) {
                await inventoryCollection.deleteOne({ _id: initialItem._id });
                console.log("Initial Item removed from inventory.");
            } else {
                console.log("Initial Item not found in inventory.");
            }
        }
    } catch (error) {
        console.error(`Error removing Initial Item: ${error.message}`);
        throw error;
    }
}


module.exports = {
    syncToInventoryDatabase,
    addItemInventoryDatabase,
    removeItemInventoryDatabase,
    processMaterials,
    createNewItemDatabase,
    createRemovedItemDatabase,
    addItemsToDatabase,
    removeInitialItemIfSynced
};
