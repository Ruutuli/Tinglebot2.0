const { google } = require('googleapis');
const { authorizeSheets } = require('../utils/googleSheetsUtils');
const { connectToTinglebot } = require('../database/connection');
const Item = require('../models/ItemModel');
const TableModel = require('../models/TableModel');
const { EmbedBuilder } = require('discord.js');

// ------------------- Constants -------------------
const SPREADSHEET_ID = process.env.TABLE_SPREADSHEET_ID;

/**
 * Fetches table data from a specified sheet tab.
 */
async function fetchTableData(sheetName) {
    try {
        const auth = await authorizeSheets();
        const sheets = google.sheets({ version: 'v4', auth });
        const range = `'${sheetName}'!A:C`; 
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range,
        });
        return response.data.values.slice(1);
    } catch (error) {
        console.error(`[sheetTableUtils.js]: Error fetching data from Google Sheets (${sheetName}):`, error);
        return [];
    }
}

/**
 * Fetches table data from the database.
 */
async function fetchTableFromDatabase(sheetName) {
    try {
        if (Array.isArray(sheetName)) {
            console.error(`[sheetTableUtils.js]: Invalid table name format: Expected a string but got an array. Fixing it.`);
            sheetName = sheetName[0]; // Extract only the first element
        }

        if (typeof sheetName !== 'string') {
            console.error(`[sheetTableUtils.js]: Table name must be a string. Received:`, sheetName);
            return null;
        }

        sheetName = sheetName.trim(); // Remove extra spaces

        console.log(`[sheetTableUtils.js]: Fetching table with name: ${sheetName}`);

        const table = await TableModel.findOne({ tableName: sheetName });
        if (!table) {
            console.error(`[sheetTableUtils.js]: No table found in database for: ${sheetName}`);
            return null;
        }

        return table.data;
    } catch (error) {
        console.error(`[sheetTableUtils.js]: Error fetching table from database:`, error);
        return null;
    }
}





/**
 * Loads a table from Google Sheets into memory and saves it to the database.
 */
async function loadTable(sheetName) {
    const db = await connectToTinglebot();
    const data = await fetchTableData(sheetName);
    if (!data.length) {
        console.error(`[sheetTableUtils.js]: No data found for sheet: ${sheetName}`);
        return false;
    }
    try {
        await TableModel.findOneAndUpdate(
            { tableName: sheetName },
            { tableName: sheetName, data },
            { upsert: true, new: true }
        );
    } catch (error) {
        console.error(`[sheetTableUtils.js]: Error saving table to database:`, error);
    }
    return true;
}

/**
 * Rolls an item from a loaded table in the database.
 */
async function rollItem(sheetName, allowNA = false) {
    const data = await fetchTableFromDatabase(sheetName);
    if (!data) {
        return null;
    }
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
        console.error(`[sheetTableUtils.js]: No valid weighted items found in ${sheetName}.`);
        return null;
    }
// Calculate the total weight sum
const totalWeight = data.reduce((sum, row) => sum + parseInt(row[0], 10) || 0, 0);

// Roll a number between 1 and totalWeight
const rollResult = Math.floor(Math.random() * totalWeight) + 1;

let cumulativeWeight = 0;
let selected = null;

// Find the rolled item based on weight distribution
for (let [weight, flavorText, itemName] of data) {
    cumulativeWeight += parseInt(weight, 10) || 0;
    if (rollResult <= cumulativeWeight) {
        selected = { flavorText, itemName };
        break;
    }
}

if (!selected) {
    console.error(`[sheetTableUtils.js]: Failed to roll a valid item.`);
    return null;
}

console.log(`Rolled a d${totalWeight} => ${rollResult}`);

    if (selected.itemName.toLowerCase() === 'n/a' && allowNA) {
        return { item: 'N/A', flavorText: selected.flavorText };
    }
    const foundItem = await Item.findOne({ itemName: selected.itemName });
    if (!foundItem) {
        console.error(`[sheetTableUtils.js]: Item not found in database: ${selected.itemName}`);
        return { item: 'N/A', flavorText: selected.flavorText };
    }
    return { item: foundItem.itemName, flavorText: selected.flavorText };
}

/**
 * Creates an embed for the rolled item.
 */
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

module.exports = { loadTable, rollItem, fetchTableFromDatabase, fetchTableData, createRollEmbed };
