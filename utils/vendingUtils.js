// ------------------- Import necessary modules -------------------
// Grouped local and third-party imports for better organization
const { authorizeSheets, fetchSheetData, appendSheetData, logErrorDetails,  safeAppendDataToSheet, } = require('./googleSheetsUtils');
const { handleError } = require('../utils/globalErrorHandler');
const VendingInventory = require('../models/VendingModel');
const ItemModel = require('../models/ItemModel');
const CharacterModel = require('../models/CharacterModel');

// ------------------- Define constants -------------------
// Range of cells in the Google Sheet for vending shop data
const VENDING_SHOP_RANGE = 'vendingShop!A2:H';

// ------------------- Function to sync vending inventory from Google Sheets to the database -------------------
async function syncVendingInventory(spreadsheetId) {
    try {
        const auth = await authorizeSheets();

        // Fetch data from Google Sheets
        const rows = await fetchSheetData(auth, spreadsheetId, VENDING_SHOP_RANGE);

        if (!rows || rows.length === 0) {
            throw new Error('No vending inventory data found. Please check if the sheet contains headers and data.');
        }

        // Clear existing data in the Vending Inventory collection
        await VendingInventory.deleteMany({});

        // Parse the rows to vending inventory objects
        const vendingInventory = await Promise.all(rows.map(async (row) => {
            const itemId = await getItemId(row[1]); // Fetch itemId based on item name
            const characterId = await getCharacterId(row[0]); // Fetch characterId based on vendor name

            if (!itemId || !characterId) throw new Error(`Item or Character not found: ${row[1]} | ${row[0]}`);

            return {
                itemId,
                characterId,
                itemName: row[1],
                stockQty: parseInt(row[2], 10),
                tokenPrice: parseFloat(row[3]),
                artPrice: row[4],
                otherPrice: row[5],
                tradesOpen: row[6] === 'Yes',
                otherNotes: row[7] || '',
            };
        }));

        // Insert new data into the Vending Inventory collection
        await VendingInventory.insertMany(vendingInventory);

        console.log('✅ Vending inventory synced successfully.');

        // Write confirmation to the vendingShop sheet
        const confirmationMessage = [['VENDING INVENTORY SYNCED']];
        await safeAppendDataToSheet(spreadsheetId, auth.name, 'vendingShop!I1:I1', confirmationMessage);

        console.log('✅ Sync confirmation written to Google Sheets.');
    } catch (error) {
    handleError(error, 'vendingUtils.js');

        logErrorDetails(error);
        throw new Error('❌ Error syncing vending inventory.');
    }
}

// ------------------- Function to fetch item ID based on item name -------------------
async function getItemId(itemName) {
    try {
        const item = await ItemModel.findOne({ name: itemName.trim() });
        if (!item) {
            console.warn(`⚠️ Item not found: ${itemName}`);
            return null;
        }
        return item._id;
    } catch (error) {
    handleError(error, 'vendingUtils.js');

        console.error(`❌ Error fetching item ID for ${itemName}:`, error);
        return null;
    }
}

// ------------------- Function to fetch character ID based on vendor name -------------------
async function getCharacterId(vendorName) {
    try {
        const character = await CharacterModel.findOne({ name: vendorName.trim() });
        if (!character) {
            console.warn(`⚠️ Character not found: ${vendorName}`);
            return null;
        }
        return character._id;
    } catch (error) {
    handleError(error, 'vendingUtils.js');

        console.error(`❌ Error fetching character ID for ${vendorName}:`, error);
        return null;
    }
}

// ------------------- Export functions -------------------
module.exports = {
    syncVendingInventory,
};
