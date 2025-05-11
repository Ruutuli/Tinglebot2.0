// ------------------- itemSyncUtils.js -------------------
// This module provides standardized functions for syncing items between the database and Google Sheets
// following the established sync process rules.

const { v4: uuidv4 } = require('uuid');
const { safeAppendDataToSheet } = require('./googleSheetsUtils');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils.js');
const { isValidGoogleSheetsUrl } = require('./validation');

// Source types for item sync
const SOURCE_TYPES = {
    LOOTED: 'Looted',
    GATHERING: 'Gathering',
    TRAVEL_LOOT: 'Travel Loot',
    CRAFTED: 'Crafted',
    PURCHASED: 'Purchased',
    QUEST_REWARD: 'Quest Reward'
};

/**
 * Validates the sync data before proceeding
 * @param {Object} character - The character object
 * @param {Object} item - The item object
 * @param {string} inventoryLink - The inventory link
 * @returns {boolean} - Whether the data is valid
 */
const validateSyncData = (character, item, inventoryLink) => {
    if (!character || !item || !inventoryLink) {
        console.error('[itemSyncUtils.js]: ❌ Missing required data for sync');
        console.error('[itemSyncUtils.js]: Character:', character?.name);
        console.error('[itemSyncUtils.js]: Item:', item?.itemName);
        console.error('[itemSyncUtils.js]: Inventory Link:', inventoryLink);
        return false;
    }

    if (!character.inventory && !character.inventoryLink) {
        console.error('[itemSyncUtils.js]: ❌ Character has no inventory link');
        return false;
    }

    if (!isValidGoogleSheetsUrl(inventoryLink)) {
        console.error('[itemSyncUtils.js]: ❌ Invalid Google Sheets URL');
        return false;
    }

    // Validate item fields
    if (!item.itemName) {
        console.error('[itemSyncUtils.js]: ❌ Item missing itemName');
        return false;
    }

    if (typeof item.quantity === 'undefined' || item.quantity === null) {
        console.error('[itemSyncUtils.js]: ❌ Item missing quantity');
        return false;
    }

    if (!Array.isArray(item.category)) {
        console.error('[itemSyncUtils.js]: ❌ Item category must be an array');
        return false;
    }

    if (!Array.isArray(item.type)) {
        console.error('[itemSyncUtils.js]: ❌ Item type must be an array');
        return false;
    }

    return true;
};

/**
 * Prepares the values array for Google Sheets sync
 * @param {Object} character - The character object
 * @param {Object} item - The item object
 * @param {Object} interaction - The Discord interaction object
 * @param {string} source - The source of the item (from SOURCE_TYPES)
 * @returns {Array} - The formatted values array
 */
const prepareSyncValues = (character, item, interaction, source = SOURCE_TYPES.LOOTED) => {
    const uniqueSyncId = uuidv4();
    const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

    // Ensure quantity is a number and convert to string
    const quantity = (item.quantity || 1).toString();

    // Ensure arrays are properly joined
    const category = Array.isArray(item.category) ? item.category.join(', ') : 'N/A';
    const type = Array.isArray(item.type) ? item.type.join(', ') : 'N/A';
    const subtype = Array.isArray(item.subtype) ? item.subtype.join(', ') : 'N/A';

    return [[
        character.name,           // Character Name
        item.itemName,           // Item Name
        quantity,                // Quantity
        category,                // Category
        type,                    // Type
        subtype,                 // Subtype
        source,                  // Source
        character.job || '',     // Job
        '',                      // Perk (empty if none)
        character.currentVillage,// Location
        interactionUrl,          // Link to interaction
        formattedDateTime,       // Date/Time
        uniqueSyncId            // Unique Sync ID
    ]];
};

/**
 * Syncs an item to both database and Google Sheets
 * @param {Object} character - The character object
 * @param {Object} item - The item object
 * @param {Object} interaction - The Discord interaction object
 * @param {string} source - The source of the item (from SOURCE_TYPES)
 * @returns {Promise<void>}
 */
const syncItem = async (character, item, interaction, source = SOURCE_TYPES.LOOTED) => {
    console.log(`[itemSyncUtils.js]: 🔄 Starting item sync for ${item.itemName}`);

    try {
        const inventoryLink = character.inventory || character.inventoryLink;
        
        // Validate data
        if (!validateSyncData(character, item, inventoryLink)) {
            throw new Error('Invalid sync data');
        }

        // Add to database first
        await addItemInventoryDatabase(
            character._id,
            item.itemName,
            item.quantity || 1,
            Array.isArray(item.category) ? item.category.join(', ') : 'N/A',
            Array.isArray(item.type) ? item.type.join(', ') : 'N/A',
            interaction
        );

        // Prepare values for Google Sheets
        const values = prepareSyncValues(character, item, interaction, source);
        console.log(`[itemSyncUtils.js]: 📝 Values to append:`, values);

        // Sync to Google Sheets
        await safeAppendDataToSheet(
            inventoryLink,
            character,
            'loggedInventory!A2:M',
            values,
            interaction.client
        );

        console.log(`[itemSyncUtils.js]: ✅ Successfully synced item to Google Sheets`);
    } catch (error) {
        console.error(`[itemSyncUtils.js]: ❌ Failed to sync item to Google Sheets:`, error);
        console.error(`[itemSyncUtils.js]: ❌ Character: ${character.name}`);
        console.error(`[itemSyncUtils.js]: ❌ Item: ${item.itemName}`);
        console.error(`[itemSyncUtils.js]: ❌ Inventory link: ${character.inventory || character.inventoryLink}`);
        throw error;
    }
};

module.exports = {
    SOURCE_TYPES,
    syncItem,
    validateSyncData,
    prepareSyncValues
}; 