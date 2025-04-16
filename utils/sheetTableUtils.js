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
const { connectToTinglebot } = require('../database/connection');

// ============================================================================
// Database Models
// ------------------- Importing database models -------------------
const Item = require('../models/ItemModel');
const TableModel = require('../models/TableModel');

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
async function fetchTableFromDatabase(sheetName) {
    try {
        // If sheetName is provided as an array, extract the first element.
        if (Array.isArray(sheetName)) {
            console.error(`[sheetTableUtils.js]: logs Invalid table name format: Expected a string but got an array. Fixing it.`);
            sheetName = sheetName[0];
        }

        if (typeof sheetName !== 'string') {
            console.error(`[sheetTableUtils.js]: logs Table name must be a string. Received:`, sheetName);
            return null;
        }

        sheetName = sheetName.trim(); // Remove extra spaces.
        console.log(`[sheetTableUtils.js]: logs Fetching table with name: ${sheetName}`);

        const table = await TableModel.findOne({ tableName: sheetName });
        if (!table) {
            console.error(`[sheetTableUtils.js]: logs No table found in database for: ${sheetName}`);
            return null;
        }
        return table.data;
    } catch (error) {
    handleError(error, 'sheetTableUtils.js');

        console.error(`[sheetTableUtils.js]: logs Error fetching table from database:`, error);
        return null;
    }
}

// ------------------- Load Table -------------------
// Loads table data from Google Sheets into memory and saves it to the database.
async function loadTable(sheetName) {
    const db = await connectToTinglebot();
    const data = await fetchTableData(sheetName);
    if (!data.length) {
        console.error(`[sheetTableUtils.js]: logs No data found for sheet: ${sheetName}`);
        return false;
    }
    try {
        await TableModel.findOneAndUpdate(
            { tableName: sheetName },
            { tableName: sheetName, data },
            { upsert: true, new: true }
        );
    } catch (error) {
    handleError(error, 'sheetTableUtils.js');

        console.error(`[sheetTableUtils.js]: logs Error saving table to database:`, error);
    }
    return true;
}


// ============================================================================
// Item Rolling Functions
// ------------------- Roll Item -------------------
// Rolls an item from a loaded table in the database based on weighted probabilities.
async function rollItem(sheetName, allowNA = false) {
    const data = await fetchTableFromDatabase(sheetName);
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
        console.error(`[sheetTableUtils.js]: logs No valid weighted items found in ${sheetName}.`);
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


// ============================================================================
// Discord Embed Functions
// ------------------- Create Roll Embed -------------------
// Creates a Discord embed containing the roll result.
function createRollEmbed(result, sheetName) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`🎲 Roll Result from ${sheetName}`)
        .addFields(
            { name: 'Item', value: result.item || 'Unknown', inline: true },
            { name: 'Flavor Text', value: result.flavorText || 'No description', inline: false }
        )
        .setTimestamp();
    return embed;
}


// ============================================================================
// Module Exports
// ------------------- Exporting functions -------------------
module.exports = { loadTable, rollItem, fetchTableFromDatabase, fetchTableData, createRollEmbed };
