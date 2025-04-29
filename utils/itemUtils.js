// ------------------- itemUtils.js -------------------
// This module provides utility functions for item management in the inventory system,
// including creating new and removed item entries, adding/removing items from the database,
// prompting users for specific items based on general categories, and retrieving sheet IDs.

// ============================================================================
// Discord.js Components
// ------------------- Importing Discord.js components -------------------
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ============================================================================

// ------------------- Importing database service functions -------------------
const { connectToInventories } = require('../database/db');


// ============================================================================
// Utility Functions
// ------------------- Importing utility functions -------------------
const { appendSheetData } = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId } = require('../utils/validation');

// ============================================================================
// Database Models
// ------------------- Importing database models -------------------
const generalCategories = require('../models/GeneralItemCategories');



// ============================================================================
// Inventory Management Functions
// ------------------- Create New Item Database Entry -------------------
// Creates a new inventory item entry object for a character.
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

// ------------------- Create Removed Item Database Entry -------------------
// Creates a record for an item removed from a character's inventory.
const createRemovedItemDatabase = (character, item, quantity, interaction, obtainMethod = 'Manual Entry') => {
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
// Prompts the user to select specific items from a general category when needed for crafting.
const promptUserForSpecificItems = async (interaction, inventory, generalCategoryItemName, requiredQuantity) => {
    if (!generalCategories[generalCategoryItemName]) {
        throw new Error(`❌ **General category ${generalCategoryItemName} is not defined.**`);
    }

    let specificItems = inventory.filter(item => generalCategories[generalCategoryItemName].includes(item.itemName));
    specificItems = sortItemsByRarity(specificItems);

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
    handleError(error, 'itemUtils.js');

            if (error.message === 'canceled') {
                throw new Error('Crafting canceled by user.');
            }
            throw new Error(`❌ **An error occurred while selecting items for ${generalCategoryItemName}. Please ensure you select the items in time.**`);
        }
    }

    return selectedItems;
};


module.exports = {
    createNewItemDatabase,       // Creates a new inventory item entry.
    createRemovedItemDatabase,   // Creates a record for a removed inventory item.
    removeItemDatabase,          // Removes a specified quantity of an item from the database.
    addItemsToDatabase,          // Adds multiple items to the inventory database.
    promptUserForSpecificItems,  // Prompts the user to select specific items from a general category.
};
