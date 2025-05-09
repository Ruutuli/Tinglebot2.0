// ------------------- syncHandler.js -------------------
// This module handles the synchronization of a character's inventory from a Google Sheet 
// to the application's database. It connects to the database, reads data from the sheet, 
// processes the rows in batches, updates inventory records, and provides feedback via Discord.

// ============================================================================
// Standard Libraries (Third-party)
// ============================================================================

const { v4: uuidv4 } = require('uuid');

const { handleError } = require('../utils/globalErrorHandler');

const {connectToTinglebot, fetchCharacterByNameAndUserId } = require('../database/db');

// ============================================================================
// Modules
// ============================================================================

const { editCharacterNotFoundMessage, editSyncErrorMessage, editSyncMessage } = require('../embeds/embeds');

const { removeInitialItemIfSynced, syncToInventoryDatabase } = require('../utils/inventoryUtils');


// ============================================================================
// Utility Functions
// ============================================================================

const { authorizeSheets, getSheetIdByTitle, readSheetData, writeBatchData } = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');

// ============================================================================
// Database Models
// ============================================================================

const ItemModel = require('../models/ItemModel');

// ============================================================================
// Constants for Batch Processing
// ============================================================================

const BATCH_SIZE = 25;
const BATCH_DELAY = 15000; // 15 seconds

// ============================================================================
// Helper Functions
// ============================================================================

// ------------------- formatDateTime -------------------
// Formats a given date into a readable string with EST timezone.
function formatDateTime(date) {
    const options = {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true,
        timeZone: 'America/New_York'
    };
    return new Date(date).toLocaleString('en-US', options).replace(',', ' |') + ' EST';
}

// ============================================================================
// Main Function: syncInventory
// ============================================================================

// ------------------- syncInventory -------------------
// Synchronizes the inventory of a character from a Google Sheet to the database.
// It fetches the character, validates the sheet URL, reads data, processes rows in batches,
// updates the database, and sends appropriate feedback messages.
async function syncInventory(characterName, userId, interaction, retryCount = 0, totalSyncedItemsCount = 0) {
    console.log(`syncInventory called for character: ${characterName}, user: ${userId}, retryCount: ${retryCount}`);

    let errors = [];
    let syncedItemsCount = 0;
    let skippedLinesCount = 0;

    try {
        // ------------------- Connect to Database -------------------
        await connectToTinglebot();

        // ------------------- Fetch Character Data -------------------
        console.log(`Fetching character: ${characterName} for user: ${userId}`);
        let character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) {
            console.log(`Character not found: ${characterName}`);
            await editCharacterNotFoundMessage(interaction, characterName);
            return;
        }
        console.log(`Character fetched successfully: ${character.name}`);

        // ------------------- Validate Google Sheets URL -------------------
        const inventoryUrl = character.inventory;
        console.log(`Validating Google Sheets URL: ${inventoryUrl}`);
        if (!isValidGoogleSheetsUrl(inventoryUrl)) {
            console.log('Invalid Google Sheets URL.');
            await editSyncErrorMessage(interaction, '❌ **Invalid Google Sheets URL. Please check the URL and try again.**');
            return;
        }

        // ------------------- Authorize Google Sheets API & Extract Spreadsheet ID -------------------
        console.log('Authorizing Google Sheets API...');
        const auth = await authorizeSheets();
        const spreadsheetId = extractSpreadsheetId(inventoryUrl);
        console.log(`Spreadsheet ID extracted: ${spreadsheetId}`);

        // ------------------- Retrieve Sheet ID -------------------
        console.log('Fetching sheet ID for "loggedInventory"...');
        let sheetId;
        try {
            sheetId = await getSheetIdByTitle(auth, spreadsheetId, 'loggedInventory');
            if (sheetId === undefined || sheetId === null) {
                console.log("Sheet 'loggedInventory' not found.");
                await editSyncErrorMessage(interaction, `❌ **Sheet 'loggedInventory' not found in the spreadsheet.**`);
                return;
            }
        } catch (err) {
            if (err.code === 403 || err.message.includes("permission")) {
                console.error(`[syncHandler.js]: Permission error when accessing Google Sheet: ${err.message}`);
                await editSyncErrorMessage(interaction, `❌ **Permission Error:**\nMake sure your sheet is shared with this email:\n📧 \`tinglebot@rotw-tinglebot.iam.gserviceaccount.com\``);
            } else {
                throw err; // Let other errors fall through to main catch
            }
            return;
        }
        
        console.log(`Sheet ID fetched successfully: ${sheetId}`);

        // ------------------- Read Data from Google Sheets -------------------
        console.log('Reading data from Google Sheets...');
        const range = 'loggedInventory!A2:M';
        const sheetData = await readSheetData(auth, spreadsheetId, range);
        if (!sheetData || sheetData.length === 0) {
            console.log('No data found in the Google Sheet.');
            await editSyncErrorMessage(interaction, `❌ **No data found in the Google Sheet. Please ensure the sheet is correctly set up.**`);
            return;
        }

        // ------------------- Map and Filter Sheet Data -------------------
        // Map each row to include its original row index (accounting for headers) and filter rows by character name.
        const mappedData = sheetData.map((row, index) => ({
            row,
            originalRowIndex: index + 2 // Adding 2 because header row (A1:M1) is skipped
        }));

        const filteredData = mappedData.filter(data => data.row[0] === character.name && data.row[1]);
        console.log(`[syncHandler.js]: 📊 Found ${filteredData.length} items to sync`);

        if (filteredData.length === 0) {
            console.log('[syncHandler.js]: ⚠️ No matching data found for character in the Google Sheet');
            await editSyncErrorMessage(interaction, `❌ **No matching data found for ${character.name} in the Google Sheet.**`);
            return;
        }

        // ------------------- Process Rows in Batches -------------------
        console.log(`[syncHandler.js]: 🔄 Starting sync for ${character.name}`);
        let batchRequests = [];

        console.log('[syncHandler.js]: 📦 Processing items in batches...');
        for (let i = 0; i < filteredData.length; i += BATCH_SIZE) {
            const batch = filteredData.slice(i, i + BATCH_SIZE);
            console.log(`[syncHandler.js]: 📥 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}`);

            for (let j = 0; j < batch.length; j++) {
                const { row, originalRowIndex } = batch[j];
                const [sheetCharacterName, itemName, qty, , , , , , , , , , confirmedSync] = row;

                // Skip rows that have been confirmed
                if (confirmedSync) continue;

                try {
                    const item = await ItemModel.findOne({ itemName });
                    if (!item) {
                        console.warn(`[syncHandler.js]: ⚠️ Skipping unknown item: ${itemName} (row ${originalRowIndex})`);
                        errors.push(`Row ${originalRowIndex}: Item not found - ${itemName}`);
                        skippedLinesCount++;
                        continue;
                    }

                    const cleanedQty = String(qty).replace(/,/g, ''); // Remove commas
                    const quantity = parseInt(cleanedQty, 10);
                    if (isNaN(quantity)) throw new Error(`Invalid quantity for item ${itemName}: ${qty}`);

                    const inventoryItem = {
                        characterId: character._id,
                        itemId: item._id,
                        characterName,
                        itemName,
                        quantity,
                        category: item.category.join(', ') || 'Uncategorized',
                        type: item.type.join(', ') || 'Unknown',
                        subtype: item.subtype || '',
                        job: character.job || '',
                        perk: character.perk || '',
                        location: character.currentVillage || character.homeVillage || '',
                        link: `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
                        date: new Date(),
                        obtain: 'Manual Sync',
                        synced: uuidv4()
                    };

                    console.log(`Saving item to database: ${itemName}, Quantity: ${quantity}`);
                    await syncToInventoryDatabase(character, inventoryItem, interaction);
                    syncedItemsCount++;

                    // Prepare updated row data for batch update
                    const updatedRowData = [
                        sheetCharacterName,
                        itemName,
                        quantity,
                        inventoryItem.category,
                        inventoryItem.type,
                        inventoryItem.subtype,
                        inventoryItem.obtain,
                        inventoryItem.job,
                        inventoryItem.perk,
                        inventoryItem.location,
                        inventoryItem.link,
                        formatDateTime(inventoryItem.date),
                        inventoryItem.synced
                    ];

                    // Determine the update range based on the original row index
                    const updateRange = `loggedInventory!A${originalRowIndex}:M${originalRowIndex}`;
                    batchRequests.push({ range: updateRange, values: [updatedRowData], sheetId });
                } catch (error) {
                    handleError(error, 'syncHandler.js');
                    console.error(`[syncHandler.js]: syncInventory: Error processing row ${originalRowIndex}: ${error.message}`);
                    errors.push(`Row ${originalRowIndex}: ${error.message}`);
                    skippedLinesCount++;
                }
            }

            // ------------------- Write Batch Data -------------------
            if (batchRequests.length > 0) {
                console.log('Writing batch data to Google Sheets...');
                await writeBatchData(auth, spreadsheetId, batchRequests);
                batchRequests = [];
            }

            console.log('Pausing for batch delay...');
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }

        console.log(`Total synced items: ${syncedItemsCount}, Skipped lines: ${skippedLinesCount}`);
        totalSyncedItemsCount += syncedItemsCount;
        const now = formatDateTime(new Date());

        console.log(`Sync completed for character: ${character.name} at ${now}`);

        // ------------------- Update Character Sync Status -------------------
        try {
            console.log('Updating inventorySynced status...');
            character.inventorySynced = true;
            await character.save();
            
            // Remove the initial item if necessary
            await removeInitialItemIfSynced(character._id);
            console.log('Initial Item removal process completed.');
            console.log('inventorySynced status updated successfully.');
        } catch (updateError) {
            handleError(updateError, 'syncHandler.js');
            console.error(`[syncHandler.js]: syncInventory: Failed to update inventorySynced status: ${updateError.message}`);
        }

        // ------------------- Send Sync Completion Message -------------------
        await editSyncMessage(
            interaction,
            character.name,
            totalSyncedItemsCount,
            errors.map(error => ({
                reason: error.split(': ')[1], // Extract reason from error message
                itemName: error.includes('Item with name') ? error.split('Item with name ')[1].split(' not found')[0] : 'Unknown'
            })),
            now, // Current timestamp
            character.inventory // Character's inventory link
        );
    } catch (error) {
        handleError(error, 'syncHandler.js');
        console.error(`[syncHandler.js]: ❌ Sync failed:`, error.message);
        await editSyncErrorMessage(interaction, `❌ **An error occurred during sync:** ${error.message}`);
    }
}

module.exports = {
    syncInventory,
};
