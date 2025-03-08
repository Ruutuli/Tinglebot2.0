// itemUtils.js

// Import necessary modules and functions
const { connectToInventories } = require('../database/connection');
const {
    writeSheetData,
    getSheetIdByTitle,
    authorizeSheets,
    readSheetData,
    appendSheetData,
    getSheetsClient 
} = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId } = require('../utils/validation');
const { fetchCharacterById, fetchCharacterByNameAndUserId } = require('../database/characterService');
const { fetchItemByName, fetchItemById, fetchAndSortItemsByRarity } = require('../database/itemService');
const { toLowerCase } = require('../modules/formattingModule');
const { safeStringify } = require('../utils/objectUtils');
const { StringSelectMenuBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const generalCategories = require('../models/GeneralItemCategories');
const ItemModel = require('../models/ItemModel');


// Function to create a new inventory item entry
const createNewItemDatabase = (character, itemName, quantity, category, type, interaction) => {
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

// Function to create a removed item entry for inventory update
const createRemovedItemDatabase = (character, item, quantity, interaction, obtainMethod = 'Manual Entry') => {
    const link = interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : '';
    return {
        characterId: character._id,
        characterName: character.name,
        itemId: item._id,
        itemName: item.itemName.trim().toLowerCase(),
        quantity: -quantity,
        category: Array.isArray(item.category) ? item.category.join(', ') : item.category,
        type: Array.isArray(item.type) ? type.join(', ') : type,
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

// Function to add multiple items to the inventory
const addItemsToDatabase = async (character, items, interaction) => {
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
        throw new Error(`❌ Error in addItemsToDatabase: ${error.message}`);
    }
};

// Function to remove the item from the correct collection
const removeItemDatabase = async (character, item, quantity, interaction) => {
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

        const spreadsheetId = getSheetIdByName(character.inventory);

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
        throw new Error(`❌ Error in removeItemDatabase: ${error.message}`);
    }
};

// Prompt user for specific items from a general category
const promptUserForSpecificItems = async (interaction, inventory, generalCategoryItemName, requiredQuantity) => {
    if (!generalCategories[generalCategoryItemName]) {
        throw new Error(`❌ **General category ${generalCategoryItemName} is not defined.**`);
    }

    let specificItems = inventory.filter(item => generalCategories[generalCategoryItemName].includes(item.itemName));
    specificItems = await fetchAndSortItemsByRarity(specificItems);

    let availableItems = specificItems.map((item, index) => ({
        label: `${item.itemName} - Qty: ${item.quantity}`,
        value: `${item.itemName}###${item._id}`, // Use item._id as a unique identifier
    }));

    if (availableItems.length > 25) {
        availableItems = availableItems.slice(0, 25);
    }

    if (availableItems.length === 0) {
        throw new Error(`❌ **No available items found for ${generalCategoryItemName}.**`);
    }

    const selectedItems = [];
    let totalSelectedQuantity = 0;
    let totalTimeTaken = 0;
    const maxTotalTime = 15 * 60 * 1000; // 15 minutes

    while (totalSelectedQuantity < requiredQuantity) {
        if (totalTimeTaken >= maxTotalTime) {
            throw new Error(`❌ **Timeout: You did not select the required items for ${generalCategoryItemName} within the allowed time.**`);
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`select_item_${totalSelectedQuantity}`)
            .setPlaceholder(`Select an item for ${generalCategoryItemName} (${totalSelectedQuantity + 1}/${requiredQuantity})`)
            .addOptions(availableItems);

        const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_crafting')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger);

        const row1 = new ActionRowBuilder().addComponents(selectMenu);
        const row2 = new ActionRowBuilder().addComponents(cancelButton);

        await interaction.editReply({
            content: `**Select an item for ${generalCategoryItemName} (${totalSelectedQuantity + 1}/${requiredQuantity}):**`,
            components: [row1, row2],
            ephemeral: true,
        });

        const startTime = Date.now();

        try {
            const filter = (selectInteraction) => selectInteraction.user.id === interaction.user.id;
            const collected = await interaction.channel.awaitMessageComponent({ filter, time: 300000 });

            if (collected.customId === 'cancel_crafting') {
                await interaction.editReply({ content: '❌ **Crafting canceled.**', components: [], ephemeral: true });
                return 'canceled';
            }

            const selectedValue = collected.values[0];
            const delimiterIndex = selectedValue.lastIndexOf('###');
            const selectedItemName = selectedValue.substring(0, delimiterIndex);
            const selectedItemId = selectedValue.substring(delimiterIndex + 3);

            const selectedItem = specificItems.find(item => item._id.toString() === selectedItemId);

            if (!selectedItem || selectedItem.itemName !== selectedItemName) {
                throw new Error('Selected item is not available.');
            }

            selectedItems.push({
                itemName: selectedItemName,
                quantity: 1,
                _id: selectedItem._id,
            });
            totalSelectedQuantity += 1;

            selectedItem.quantity -= 1;
            if (selectedItem.quantity === 0) {
                specificItems = specificItems.filter(item => item._id.toString() !== selectedItemId);
                availableItems = availableItems.filter(option => option.value !== selectedValue);
            } else {
                const itemIndex = availableItems.findIndex(option => option.value === selectedValue);
                availableItems[itemIndex].label = `${selectedItemName} - Qty: ${selectedItem.quantity}`;
            }

            await collected.update({ content: `You selected: ${selectedItemName}`, components: [], ephemeral: true });

            const endTime = Date.now();
            totalTimeTaken += (endTime - startTime);

        } catch (error) {
            if (error.message === 'canceled') {
                throw new Error('Crafting canceled by user.');
            }
            throw new Error(`❌ **An error occurred while selecting items for ${generalCategoryItemName}. Please ensure you select the items in time.**`);
        }
    }

    return selectedItems;
};


async function getSheetIdByName(sheetName) {
    try {
        const auth = await authorizeSheets();
        const sheets = getSheetsClient(auth);
        const spreadsheetId = 'your-spreadsheet-id'; // Replace with your spreadsheet ID

        const response = await sheets.spreadsheets.get({
            spreadsheetId,
        });

        const sheet = response.data.sheets.find(sheet => sheet.properties.title === sheetName);
        if (!sheet) {
            console.error(`[itemUtils.js]: Sheet "${sheetName}" not found in spreadsheet "${spreadsheetId}".`);
            throw new Error(`Sheet "${sheetName}" not found.`);
        }

        return sheet.properties.sheetId;
    } catch (error) {
        console.error(`[itemUtils.js]: Error in getSheetIdByName for "${sheetName}":`, error.message);
        throw error;
    }
}


// Exporting the functions
module.exports = {
    createNewItemDatabase,
    createRemovedItemDatabase,
    removeItemDatabase,
    addItemsToDatabase,
    promptUserForSpecificItems,
};
