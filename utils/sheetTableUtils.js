// ------------------- sheetTableUtils.js -------------------
// This module handles operations related to table data stored in Google Sheets and the database.
// It includes functions for fetching, loading, and rolling items from a table,
// as well as creating Discord embeds for roll results.

// ============================================================================
// Discord.js Components
// ------------------- Importing Discord.js components -------------------
const { EmbedBuilder } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ============================================================================
// Database Connections
// ------------------- Importing database connection functions -------------------
const { connectToTinglebot } = require('../database/db');

// ============================================================================
// Database Models
// ------------------- Importing database models -------------------
const Item = require('../models/ItemModel');
const TableRoll = require('../models/TableRollModel');

// ============================================================================
// Utility Functions
// ------------------- Importing Google Sheets utilities and validation functions -------------------
const { authorizeSheets } = require('../utils/googleSheetsUtils');

// ============================================================================
// Google Sheets API
// ------------------- Importing Google Sheets API client -------------------
const { google } = require('googleapis');


// ============================================================================
// Constants
// ------------------- Define configuration constants -------------------
const SPREADSHEET_ID = process.env.TABLE_SPREADSHEET_ID;


// ============================================================================
// Google Sheets Data Fetching Functions
// ------------------- Fetch Table Data -------------------
// Fetches table data from a specified sheet tab in the Google Sheets document.
async function fetchTableData(sheetName) {
    try {
        const auth = await authorizeSheets();
        const sheets = google.sheets({ version: 'v4', auth });
        // Define the range to fetch columns A to C from the specified sheet.
        const range = `'${sheetName}'!A:C`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range,
        });
        // Skip the header row and return the rest.
        return response.data.values.slice(1);
    } catch (error) {
    handleError(error, 'sheetTableUtils.js');

        console.error(`[sheetTableUtils.js]: logs Error fetching data from Google Sheets (${sheetName}):`, error);
        return [];
    }
}

// ------------------- Fetch Table Data from Database -------------------
// Retrieves table data stored in the database by table name.
async function fetchTableFromDatabase(tableName) {
    try {
        // If tableName is provided as an array, extract the first element.
        if (Array.isArray(tableName)) {
            console.error(`[sheetTableUtils.js]: ❌ Invalid table name format: Expected a string but got an array. Fixing it.`);
            tableName = tableName[0];
        }

        if (typeof tableName !== 'string') {
            console.error(`[sheetTableUtils.js]: ❌ Table name must be a string. Received:`, tableName);
            return null;
        }

        tableName = tableName.trim(); // Remove extra spaces.
        console.log(`[sheetTableUtils.js]: 📊 Fetching table with name: ${tableName}`);

        // Find table in new TableRoll system
        const table = await TableRoll.findOne({ name: tableName, isActive: true });
        if (!table) {
            console.error(`[sheetTableUtils.js]: ❌ No table found in database for: ${tableName}`);
            return null;
        }
        
        // Convert to old format for backward compatibility
        return table.entries.map(entry => [
            entry.weight.toString(),
            entry.flavor || '',
            entry.item || ''
        ]);
    } catch (error) {
    handleError(error, 'sheetTableUtils.js');
        console.error(`[sheetTableUtils.js]: ❌ Error fetching table from database:`, error);
        return null;
    }
}

// ------------------- Load Table to New System -------------------
// Loads table data from Google Sheets into the new TableRoll system
async function loadTableToNewSystem(sheetName, tableName, description = '', category = 'general') {
    try {
        const data = await fetchTableData(sheetName);
        if (!data.length) {
            console.error(`[sheetTableUtils.js]: No data found for sheet: ${sheetName}`);
            return false;
        }

        // Convert to new format
        const entries = data.map(([weight, flavorText, itemName]) => ({
            weight: parseFloat(weight) || 1,
            flavor: flavorText || '',
            item: itemName || '',
            thumbnailImage: '',
            category: 'general',
            rarity: 'common'
        }));

        // Create new table
        const table = new TableRoll({
            name: tableName,
            description: description,
            category: category,
            entries: entries,
            createdBy: 'system', // Mark as system migration
            tags: ['sheets', 'migrated'],
            isPublic: true
        });

        await table.save();
        console.log(`[sheetTableUtils.js]: Successfully loaded table: ${sheetName} -> ${tableName}`);
        return true;
    } catch (error) {
        handleError(error, 'sheetTableUtils.js', {
            functionName: 'loadTableToNewSystem',
            sheetName: sheetName,
            tableName: tableName
        });
        return false;
    }
}


// ============================================================================
// Item Rolling Functions
// ------------------- Roll Item -------------------
// Rolls an item from a loaded table in the database based on weighted probabilities.
async function rollItem(tableName, allowNA = false) {
    const data = await fetchTableFromDatabase(tableName);
    if (!data) {
        return null;
    }

    // Build an array of weighted items.
    const weightedItems = [];
    data.forEach(([weight, flavorText, itemName]) => {
        const numWeight = parseInt(weight, 10) || 0;
        if (numWeight > 0) {
            for (let i = 0; i < numWeight; i++) {
                weightedItems.push({ flavorText, itemName });
            }
        }
    });
    if (!weightedItems.length) {
        console.error(`[sheetTableUtils.js]: logs No valid weighted items found in ${tableName}.`);
        return null;
    }

    // Calculate the total weight sum.
    const totalWeight = data.reduce((sum, row) => sum + (parseInt(row[0], 10) || 0), 0);
    // Roll a number between 1 and totalWeight.
    const rollResult = Math.floor(Math.random() * totalWeight) + 1;

    let cumulativeWeight = 0;
    let selected = null;
    // Determine which item is rolled based on cumulative weight.
    for (let [weight, flavorText, itemName] of data) {
        cumulativeWeight += parseInt(weight, 10) || 0;
        if (rollResult <= cumulativeWeight) {
            selected = { flavorText, itemName };
            break;
        }
    }

    if (!selected) {
        console.error(`[sheetTableUtils.js]: logs Failed to roll a valid item.`);
        return null;
    }

    console.log(`Rolled a d${totalWeight} => ${rollResult}`);

    // If the rolled item is 'n/a' and allowNA is true, return as is.
    if (selected.itemName.toLowerCase() === 'n/a' && allowNA) {
        return { item: 'N/A', flavorText: selected.flavorText };
    }
    // Otherwise, try to find the item in the database.
    const foundItem = await Item.findOne({ itemName: selected.itemName });
    if (!foundItem) {
        console.error(`[sheetTableUtils.js]: logs Item not found in database: ${selected.itemName}`);
        return { item: 'N/A', flavorText: selected.flavorText };
    }
    return { item: foundItem.itemName, flavorText: selected.flavorText };
}

// ------------------- Roll Item from New System -------------------
// Rolls an item from the new TableRoll system
async function rollItemFromNewSystem(tableName, allowNA = false) {
    try {
        const result = await TableRoll.rollOnTable(tableName);
        const rolledItemName = result.result.item;
        const rolledFlavor = result.result.flavor;
        const rolledRarity = result.result.rarity;

        // If the rolled item is 'n/a' and allowNA is true, return as is.
        if (rolledItemName.toLowerCase() === 'n/a' && allowNA) {
            return { 
                item: 'N/A', 
                flavorText: rolledFlavor,
                rarity: rolledRarity,
                rollNumber: result.rollNumber
            };
        }

        // Try to find the item in the database.
        const foundItem = await Item.findOne({ itemName: rolledItemName });
        if (!foundItem) {
            console.error(`[sheetTableUtils.js]: Item not found in database: ${rolledItemName}`);
            return { 
                item: 'N/A', 
                flavorText: rolledFlavor,
                rarity: rolledRarity,
                rollNumber: result.rollNumber
            };
        }

        return { 
            item: foundItem.itemName, 
            flavorText: rolledFlavor,
            rarity: rolledRarity,
            rollNumber: result.rollNumber
        };
    } catch (error) {
        handleError(error, 'sheetTableUtils.js', {
            functionName: 'rollItemFromNewSystem',
            tableName: tableName
        });
        return null;
    }
}

// ============================================================================
// Discord Embed Functions
// ------------------- Create Roll Embed -------------------
// Creates a Discord embed containing the roll result.
function createRollEmbed(result, tableName) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`🎲 Roll Result from ${tableName}`)
        .addFields(
            { name: 'Item', value: result.item || 'Unknown', inline: true },
            { name: 'Flavor Text', value: result.flavorText || 'No description', inline: false }
        )
        .setTimestamp();

    // Add rarity if available
    if (result.rarity && result.rarity !== 'common') {
        embed.addFields({
            name: '⭐ Rarity',
            value: result.rarity.charAt(0).toUpperCase() + result.rarity.slice(1),
            inline: true
        });
    }

    // Add roll number if available
    if (result.rollNumber) {
        embed.addFields({
            name: '🎲 Roll #',
            value: result.rollNumber.toString(),
            inline: true
        });
    }

    return embed;
}

// ============================================================================
// Migration Functions
// ============================================================================

// ------------------- Function: migrateAllTablesToNewSystem -------------------
// Migrates all tables from Google Sheets to the new TableRoll system
async function migrateAllTablesToNewSystem() {
    try {
        // This function would need to be called with specific sheet names
        // since we can't automatically determine all sheet names
        console.log(`[sheetTableUtils.js]: Migration function called - requires specific sheet names`);
        return [];
    } catch (error) {
        handleError(error, 'sheetTableUtils.js', {
            functionName: 'migrateAllTablesToNewSystem'
        });
        throw error;
    }
}

// ------------------- Function: getTableList -------------------
// Gets a list of all available tables in the new system
async function getTableList() {
    try {
        const tables = await TableRoll.find({ isActive: true });
        return {
            tables: tables.map(t => ({ name: t.name, system: 'new', category: t.category }))
        };
    } catch (error) {
        handleError(error, 'sheetTableUtils.js', {
            functionName: 'getTableList'
        });
        throw error;
    }
}

// ============================================================================
// Module Exports
// ------------------- Exporting functions -------------------
module.exports = { 
    fetchTableData,
    fetchTableFromDatabase, 
    loadTableToNewSystem,
    rollItem, 
    rollItemFromNewSystem,
    createRollEmbed,
    migrateAllTablesToNewSystem,
    getTableList
};
