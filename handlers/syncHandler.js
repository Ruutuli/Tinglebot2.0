// ------------------- syncHandler.js -------------------
// This module handles the synchronization of a character's inventory from a Google Sheet 
// to the application's database. It connects to the database, reads data from the sheet, 
// processes the rows in batches, updates inventory records, and provides feedback via Discord.

// ============================================================================
// Standard Libraries (Third-party)
// ============================================================================

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { google } = require('googleapis');

// ============================================================================
// Database Connections
// ============================================================================

const { connectToTinglebot, fetchCharacterByNameAndUserId } = require('../database/db');

// ============================================================================
// Database Models
// ============================================================================

const ItemModel = require('../models/ItemModel');

// ============================================================================
// Utility Functions
// ============================================================================

const { handleError } = require('../utils/globalErrorHandler');
const { editCharacterNotFoundMessage, editSyncErrorMessage, editSyncMessage } = require('../embeds/embeds');
const { removeInitialItemIfSynced, syncToInventoryDatabase } = require('../utils/inventoryUtils');
const { authorizeSheets, getSheetIdByTitle, readSheetData, writeBatchData, validateInventorySheet } = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');

// ============================================================================
// Constants
// ============================================================================

const BATCH_SIZE = 10;
const BATCH_DELAY = 2000;
const SERVICE_ACCOUNT_PATH = './service-account.json';
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000;

// ============================================================================
// Error Tracking
// ============================================================================

const loggedErrors = new Set();
const ERROR_COOLDOWN = 5000; // 5 seconds cooldown between identical errors

function shouldLogError(error) {
    const errorKey = error.message || error.toString();
    if (loggedErrors.has(errorKey)) {
        return false;
    }
    loggedErrors.add(errorKey);
    // Clean up old errors after cooldown
    setTimeout(() => loggedErrors.delete(errorKey), ERROR_COOLDOWN);
    return true;
}

// ============================================================================
// Helper Functions
// ============================================================================

// ------------------- formatDateTime -------------------
// Formats a given date into a readable string with EST timezone.
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
    return new Date(date).toLocaleString('en-US', options).replace(',', ' |') + ' EST';
}

// ------------------- checkGoogleSheetsPermissions -------------------
// Verifies that the service account has proper access to the Google Sheet.
async function checkGoogleSheetsPermissions(auth, spreadsheetId, interaction) {
    try {
        await google.sheets({ version: 'v4', auth }).spreadsheets.get({ spreadsheetId });
        return true;
    } catch (error) {
        if (error.status === 403 || error.message.includes('does not have permission')) {
            const serviceAccountEmail = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH)).client_email;
            console.error(`[syncHandler.js]: ⚠️ Permission error when accessing Google Sheet: ${error.message}`);
            await editSyncErrorMessage(interaction, 
                `⚠️ **Permission Error:**\n` +
                `The service account (${serviceAccountEmail}) does not have access to this spreadsheet.\n\n` +
                `To fix this:\n1. Open the Google Spreadsheet\n2. Click "Share" in the top right\n3. Add ${serviceAccountEmail} as an Editor\n4. Make sure to give it at least "Editor" access`
            );
            return false;
        }
        throw error;
    }
}

// ------------------- processInventoryItem -------------------
// Processes a single inventory item and prepares it for database sync.
async function processInventoryItem(row, originalRowIndex, character, interaction) {
    const [sheetCharacterName, itemName, qty, , , , obtain, , , , , , confirmedSync] = row;

    if (confirmedSync) {
        return null;
    }

    const item = await ItemModel.findOne({ itemName });
    if (!item) {
        console.warn(`[syncHandler.js]: ⚠️ Skipping unknown item: ${itemName} (row ${originalRowIndex})`);
        return { error: `Row ${originalRowIndex}: Item not found - ${itemName}` };
    }

    const cleanedQty = String(qty).replace(/,/g, '');
    const quantity = parseInt(cleanedQty, 10);
    if (isNaN(quantity)) {
        throw new Error(`Invalid quantity for item ${itemName}: ${qty}`);
    }

    // Preserve original obtain method if it contains "crafting" (case-insensitive)
    const originalObtain = obtain ? obtain.toString().trim() : '';
    const obtainMethod = originalObtain.toLowerCase().includes('crafting') ? originalObtain : 'Manual Sync';

    return {
        inventoryItem: {
            characterId: character._id,
            itemId: item._id,
            characterName: character.name,
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
            obtain: obtainMethod,
            synced: uuidv4()
        },
        updatedRowData: [
            sheetCharacterName,
            itemName,
            quantity,
            item.category.join(', ') || 'Uncategorized',
            item.type.join(', ') || 'Unknown',
            item.subtype || '',
            obtainMethod,
            character.job || '',
            character.perk || '',
            character.currentVillage || character.homeVillage || '',
            `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
            formatDateTime(new Date()),
            uuidv4()
        ]
    };
}

// ============================================================================
// Main Function: syncInventory
// ============================================================================

// ------------------- syncInventory -------------------
// Synchronizes the inventory of a character from a Google Sheet to the database.
async function syncInventory(characterName, userId, interaction, retryCount = 0, totalSyncedItemsCount = 0) {
    console.log(`[syncHandler.js]: 🔄 Starting sync for character: ${characterName}, user: ${userId}, retry: ${retryCount}`);

    if (retryCount >= MAX_RETRIES) {
        console.error(`[syncHandler.js]: ❌ Maximum retry attempts reached for ${characterName}`);
        await editSyncErrorMessage(interaction, `❌ **Maximum retry attempts reached.** Please try again later or contact support if the issue persists.`);
        return;
    }

    let errors = [];
    let syncedItemsCount = 0;
    let skippedLinesCount = 0;

    try {
        // Connect to database and fetch character
        await connectToTinglebot();
        const character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) {
            console.log(`[syncHandler.js]: ⚠️ Character not found: ${characterName}`);
            await editCharacterNotFoundMessage(interaction, characterName);
            return;
        }

        // Validate Google Sheets URL
        const inventoryUrl = character.inventory;
        if (!isValidGoogleSheetsUrl(inventoryUrl)) {
            console.log(`[syncHandler.js]: ⚠️ Invalid Google Sheets URL: ${inventoryUrl}`);
            await editSyncErrorMessage(interaction, '❌ **Invalid Google Sheets URL. Please check the URL and try again.**');
            return;
        }

        // Authorize and check permissions
        const auth = await authorizeSheets();
        const spreadsheetId = extractSpreadsheetId(inventoryUrl);
        
        // Validate the inventory sheet before proceeding
        console.log(`[syncHandler.js]: 🔍 Validating inventory sheet for ${characterName}...`);
        const validationResult = await validateInventorySheet(inventoryUrl, characterName);
        
        if (!validationResult.success) {
            console.log(`[syncHandler.js]: ❌ Validation failed: ${validationResult.message}`);
            await editSyncErrorMessage(interaction, validationResult.message);
            return;
        }

        // Get sheet ID and read data
        const sheetId = await getSheetIdByTitle(auth, spreadsheetId, 'loggedInventory');
        if (!sheetId) {
            console.log(`[syncHandler.js]: ⚠️ Sheet 'loggedInventory' not found`);
            await editSyncErrorMessage(interaction, `❌ **Sheet 'loggedInventory' not found in the spreadsheet.**`);
            return;
        }

        const sheetData = await readSheetData(auth, spreadsheetId, 'loggedInventory!A2:M');
        if (!sheetData?.length) {
            console.log(`[syncHandler.js]: ⚠️ No data found in sheet`);
            await editSyncErrorMessage(interaction, `❌ **No data found in the Google Sheet. Please ensure the sheet is correctly set up.**`);
            return;
        }

        // Process data
        const mappedData = sheetData.map((row, index) => ({
            row,
            originalRowIndex: index + 2
        }));

        // Only process rows that exist in the sheet and belong to this character
        const filteredData = mappedData.filter(data => {
            const [sheetCharacterName, itemName, qty] = data.row;
            return sheetCharacterName === character.name && itemName && qty;
        });

        if (!filteredData.length) {
            console.log(`[syncHandler.js]: ⚠️ No matching data for ${character.name}`);
            await editSyncErrorMessage(interaction, `❌ **No matching data found for ${character.name} in the Google Sheet.**\n\nYou must have at least 1 item! If this is a new character, please add their starter gear.`);
            return;
        }

        console.log(`[syncHandler.js]: ✅ All validation checks passed for ${characterName}`);
        console.log(`[syncHandler.js]: 📦 Starting batch processing...`);

        // Process items in batches
        let batchRequests = [];
        let skippedItems = [];
        let processedItems = new Set(); // Track which items have been processed

        for (let i = 0; i < filteredData.length; i += BATCH_SIZE) {
            const batch = filteredData.slice(i, i + BATCH_SIZE);
            console.log(`[syncHandler.js]: 📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(filteredData.length / BATCH_SIZE)}`);

            // Process batch with retry logic
            let batchSuccess = false;
            let batchRetries = 0;
            let currentBatchRequests = []; // Track requests for current batch only

            while (!batchSuccess && batchRetries < MAX_RETRIES) {
                try {
                    for (const { row, originalRowIndex } of batch) {
                        const [sheetCharacterName, itemName] = row;
                        const itemKey = `${sheetCharacterName}:${itemName}`;

                        // Skip if already processed
                        if (processedItems.has(itemKey)) {
                            console.log(`[syncHandler.js]: ⏭️ Skipping already processed item: ${itemName}`);
                            continue;
                        }

                        try {
                            const result = await processInventoryItem(row, originalRowIndex, character, interaction);
                            if (!result) continue;
                            if (result.error) {
                                errors.push(result.error);
                                skippedLinesCount++;
                                continue;
                            }

                            const { inventoryItem, updatedRowData } = result;
                            
                            // Only update existing items in the database
                            const existingItem = await ItemModel.findOne({ itemName: inventoryItem.itemName });
                            if (!existingItem) {
                                skippedItems.push(inventoryItem.itemName);
                                continue;
                            }

                            await syncToInventoryDatabase(character, inventoryItem, interaction);
                            syncedItemsCount++;

                            // Add to current batch requests
                            currentBatchRequests.push({
                                range: `loggedInventory!A${originalRowIndex}:M${originalRowIndex}`,
                                values: [updatedRowData]
                            });

                            // Mark as processed
                            processedItems.add(itemKey);
                        } catch (error) {
                            if (error.message.includes('does not have permission') || error.status === 403) {
                                throw error;
                            }
                            if (!error.message?.includes('Could not write to sheet') && shouldLogError(error)) {
                                handleError(error, 'syncHandler.js');
                                console.error(`[syncHandler.js]: ❌ Error processing row ${originalRowIndex}: ${error.message}`);
                            }
                            errors.push(`Row ${originalRowIndex}: ${error.message}`);
                            skippedLinesCount++;
                        }
                    }

                    // Update the sheet with all changes in this batch
                    if (currentBatchRequests.length > 0) {
                        await writeBatchData(auth, spreadsheetId, currentBatchRequests);
                        batchRequests = batchRequests.concat(currentBatchRequests); // Add to total batch requests
                        currentBatchRequests = []; // Clear the current batch requests
                    }
                    
                    batchSuccess = true;
                } catch (error) {
                    batchRetries++;
                    if (batchRetries < MAX_RETRIES) {
                        console.log(`[syncHandler.js]: ⚠️ Batch failed, retrying in ${RETRY_DELAY}ms (attempt ${batchRetries + 1})`);
                        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
                    } else {
                        throw error;
                    }
                }
            }

            // Add delay between batches
            if (i + BATCH_SIZE < filteredData.length) {
                console.log(`[syncHandler.js]: ⏰ Waiting ${BATCH_DELAY}ms before next batch`);
                await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
            }
        }

        // Update character sync status
        character.inventorySynced = true;
        await character.save();
        await removeInitialItemIfSynced(character._id);

        // Send completion message with skipped items
        totalSyncedItemsCount += syncedItemsCount;
        const now = formatDateTime(new Date());
        let message = `✅ **Sync completed for ${character.name}!**\n\n`;
        message += `📦 **Synced Items:** ${totalSyncedItemsCount}\n`;
        if (skippedItems.length > 0) {
            message += `⚠️ **Skipped Items (not in database):** ${skippedItems.join(', ')}\n`;
        }
        if (errors.length > 0) {
            message += `❌ **Errors:** ${errors.length}\n`;
            errors.forEach(error => message += `- ${error}\n`);
        }
        message += `\n🕒 **Last Updated:** ${now}`;
        
        await interaction.editReply({ content: message });
    } catch (error) {
        handleError(error, 'syncHandler.js');
        console.error(`[syncHandler.js]: ❌ Sync failed: ${error.message}`);
        
        // Check if it's a permission error and show the appropriate message
        if (error.message.includes('does not have permission') || error.status === 403) {
            const serviceAccountEmail = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH)).client_email;
            await editSyncErrorMessage(interaction, 
                `⚠️ **Permission Error:**\n` +
                `The service account (${serviceAccountEmail}) does not have access to this spreadsheet.\n\n` +
                `To fix this:\n1. Open the Google Spreadsheet\n2. Click "Share" in the top right\n3. Add ${serviceAccountEmail} as an Editor\n4. Make sure to give it at least "Editor" access`
            );
        } else {
            await editSyncErrorMessage(interaction, `❌ **An error occurred during sync:** ${error.message}`);
        }
    }
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
    syncInventory
};
