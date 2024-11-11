// ------------------- Import necessary modules -------------------
const { connectToTinglebot } = require('../database/connection');
const {
    readSheetData, writeSheetData, authorizeSheets,
    writeBatchData, getSheetIdByTitle
} = require('../utils/googleSheetsUtils');
const { fetchCharacterByNameAndUserId, getCharacterInventoryCollection } = require('../database/characterService');
const { syncToInventoryDatabase } = require('../utils/inventoryUtils');
const {
    editSyncMessage, editCharacterNotFoundMessage, editSyncErrorMessage
} = require('../embeds/instructionsEmbeds');
const { isValidGoogleSheetsUrl, extractSpreadsheetId } = require('../utils/validation');
const ItemModel = require('../models/ItemModel');
const { v4: uuidv4 } = require('uuid');
const Character = require('../models/CharacterModel');

// ------------------- Constants for batch processing -------------------
const BATCH_SIZE = 25;
const BATCH_DELAY = 15000; // 15 seconds
const RETRY_DELAY = 180000; // 3 minutes in milliseconds
const MAX_RETRIES = 3;

// ------------------- Helper function to format date and time -------------------
function formatDateTime(date) {
    const options = {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: true,
        timeZone: 'America/New_York'
    };
    return new Date(date).toLocaleString('en-US', options).replace(',', ' |') + ' EST';
}

// ------------------- Main function to sync inventory -------------------
async function syncInventory(characterName, userId, interaction, retryCount = 0, totalSyncedItemsCount = 0) {
    let errors = [];
    let syncedItemsCount = 0;
    let skippedLinesCount = 0;

    try {
        // Connect to the database
        await connectToTinglebot();

        // Fetch character data
        let character = await fetchCharacterByNameAndUserId(characterName, userId);
        if (!character) {
            await editCharacterNotFoundMessage(interaction, characterName);
            return;
        }

        // Validate Google Sheets URL
        const inventoryUrl = character.inventory;
        if (!isValidGoogleSheetsUrl(inventoryUrl)) {
            await editSyncErrorMessage(interaction, '❌ **Invalid Google Sheets URL. Please check the URL and try again.**');
            return;
        }

        // Authorize Google Sheets
        const auth = await authorizeSheets();
        const spreadsheetId = extractSpreadsheetId(inventoryUrl);

        // Get the sheet ID for the 'loggedInventory' sheet
        const sheetId = await getSheetIdByTitle(auth, spreadsheetId, 'loggedInventory');
        if (!sheetId && sheetId !== 0) {
            await editSyncErrorMessage(interaction, `❌ **Sheet 'loggedInventory' not found in the spreadsheet.**`);
            return;
        }

        // Read data from Google Sheets
        const range = 'loggedInventory!A2:M';
        const sheetData = await readSheetData(auth, spreadsheetId, range);
        if (!sheetData || sheetData.length === 0) {
            await editSyncErrorMessage(interaction, `❌ **No data found in the Google Sheet. Please ensure the sheet is correctly set up.**`);
            return;
        }

        // Get the inventory collection for the character
        const inventoryCollection = await getCharacterInventoryCollection(character.name);
        let batchRequests = [];

        // Process rows in batches
        for (let i = 0; i < sheetData.length; i += BATCH_SIZE) {
            const batch = sheetData.slice(i, i + BATCH_SIZE);

            for (let j = 0; j < batch.length; j++) {
                const row = batch[j];
                const [sheetCharacterName, itemName, qty, , , , , , , , , , confirmedSync] = row;

                // Skip rows that don't match the character name or have been confirmed
                if (sheetCharacterName !== character.name || !itemName || confirmedSync) continue;

                try {
                    // Find the item in the database
                    const item = await ItemModel.findOne({ itemName });
                    if (!item) throw new Error(`Item with name ${itemName} not found.`);

                    // Parse the quantity
                    const quantity = parseInt(qty, 10);
                    if (isNaN(quantity)) throw new Error(`Invalid quantity for item ${itemName}: ${qty}`);

                    // Create inventory item object
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

                    // Save the item to the inventory database
                    await syncToInventoryDatabase(character, inventoryItem, interaction);
                    syncedItemsCount++;

                    // Prepare the data to update in Google Sheets
                    const rowIndex = i + j;
                    sheetData[rowIndex] = [
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

                    // Add the update range to batch requests
                    const updateRange = `loggedInventory!A${rowIndex + 2}:M${rowIndex + 2}`;
                    batchRequests.push({ range: updateRange, values: [sheetData[rowIndex]], sheetId });
                } catch (error) {
                    // Record errors and increment skipped lines count
                    errors.push(`Row ${i + j + 2}: ${error.message}`);
                    skippedLinesCount++;
                }
            }

            // Process the batch
            if (batchRequests.length > 0) {
                await writeBatchData(auth, spreadsheetId, batchRequests);
                batchRequests = [];
            }

            // Pause for 3 seconds between batches
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }

        // Handle retries if lines were skipped
        if (skippedLinesCount > 0 && retryCount < MAX_RETRIES) {
            const errorMessage = `⚠️ **Some lines were skipped. Sync will retry after 3 minutes.**\n\n**Errors:**\n${errors.join('\n')}`;
            await editSyncErrorMessage(interaction, errorMessage);
            await retrySync(interaction, characterName, userId, retryCount, syncedItemsCount, totalSyncedItemsCount, errors);
            return;
        }

        totalSyncedItemsCount += syncedItemsCount;
        const now = formatDateTime(new Date());

        // Prepare the confirmation message
        const confirmationMessage = `✅ Inventory for ${character.name} synced on ${now}!\n**Synced items:** ${totalSyncedItemsCount}\n**Skipped lines:** ${skippedLinesCount}`;
        await writeSheetData(auth, spreadsheetId, `loggedInventory!A${sheetData.length + 2}:M${sheetData.length + 2}`, [[confirmationMessage]]);

        // Clean up initial item and update character status
        await inventoryCollection.deleteOne({ characterId: character._id, itemName: 'Initial Item' });
        character.inventorySynced = true;
        await Character.findByIdAndUpdate(character._id, { inventorySynced: true });

        // Edit the sync message with confirmation
        await editSyncMessage(interaction, character.name, totalSyncedItemsCount, skippedLinesCount, now);
    } catch (error) {
        await editSyncErrorMessage(interaction, `❌ **Sync canceled! An error occurred: ${error.message}**`);
    }
}

// ------------------- Helper function to handle retries -------------------
async function retrySync(interaction, characterName, userId, retryCount, syncedItemsCount, totalSyncedItemsCount, errors) {
    let remainingTime = RETRY_DELAY / 1000;
    const countdownMessage = await interaction.followUp({ content: `⏳ Sync will retry in ${Math.ceil(remainingTime)} seconds.`, ephemeral: true });

    const interval = setInterval(async () => {
        remainingTime--;
        if (remainingTime > 0) {
            try {
                await interaction.webhook.editMessage(countdownMessage.id, { content: `⏳ Sync will retry in ${remainingTime} seconds.`, ephemeral: true });
            } catch (error) {
                clearInterval(interval);
            }
        } else {
            clearInterval(interval);
        }
    }, 1000);

    setTimeout(async () => {
        clearInterval(interval);
        await syncInventory(characterName, userId, interaction, retryCount + 1, totalSyncedItemsCount + syncedItemsCount);
    }, RETRY_DELAY);
}

module.exports = {
    syncInventory,
};
