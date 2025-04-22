// ------------------- Job Voucher Module -------------------

// Import necessary modules
const { handleError } = require('../utils/globalErrorHandler');
const { removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');
const { getCharacterInventoryCollection, updateCharacterById, fetchItemByName } = require('../database/db'); 
const { v4: uuidv4 } = require('uuid');

// ------------------- Validate Job Voucher -------------------
async function validateJobVoucher(character, jobName) {
    if (!character.jobVoucher) {
        return {
            success: false,
            message: '❌ No active job voucher found.',
        };
    }

    // Allow unrestricted job vouchers
    if (!character.jobVoucherJob) {
        console.log(`[Job Voucher Validation]: Voucher is not locked to any specific job. Proceeding with job: ${jobName}`);
        return { success: true };
    }

    if (character.jobVoucherJob !== jobName) {
        return {
            success: false,
            message: `❌ The job voucher is locked to **${character.jobVoucherJob}**, not **${jobName}**. Please use the correct job.`,
        };
    }

    return { success: true };
}


// ------------------- Activate Job Voucher -------------------
async function activateJobVoucher(character, jobName, item, quantity = 1, interaction) {
    try {
        // Update character to activate the voucher
        await updateCharacterById(character._id, { jobVoucher: Boolean(true), jobVoucherJob: jobName });

        // Deduct the voucher from inventory
        const inventoryCollection = await getCharacterInventoryCollection(character.name);
        await removeItemInventoryDatabase(character._id, item.itemName, quantity, inventoryCollection);

        // Log usage to Google Sheets if applicable
        if (isValidGoogleSheetsUrl(character.inventory || character.inventoryLink)) {
            const spreadsheetId = extractSpreadsheetId(character.inventory || character.inventoryLink);
            const auth = await authorizeSheets();
            const range = 'loggedInventory!A2:M';
            const uniqueSyncId = uuidv4();
            const formattedDateTime = new Date().toISOString();
            const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

            const values = [
                [
                    character.name,
                    item.itemName,
                    `-${quantity}`,
                    item.category.join(', '),
                    item.type.join(', '),
                    item.subtype.join(', '),
                    `Activated job voucher for ${jobName}`,
                    character.job,
                    '',
                    character.currentVillage,
                    interactionUrl,
                    formattedDateTime,
                    uniqueSyncId
                ]
            ];

            await appendSheetData(auth, spreadsheetId, range, values);
        }

        return {
            success: true,
            message: `🎫 **Job Voucher activated for ${character.name} to perform the job ${jobName}.**`
        };
    } catch (error) {
    handleError(error, 'jobVoucherModule.js');

        console.error(`[jobVoucherModule.js]: Error activating job voucher: ${error.message}`);
        return {
            success: false,
            message: `❌ An error occurred while activating the job voucher.`
        };
    }
}

// ------------------- Fetch Job Voucher Item -------------------
async function fetchJobVoucherItem() {
    try {
        const item = await fetchItemByName('Job Voucher');
        if (!item) {
            throw new Error('Job Voucher item not found in the database.');
        }
        return { success: true, item };
    } catch (error) {
    handleError(error, 'jobVoucherModule.js');

        console.error(`[jobVoucherModule.js]: Error fetching job voucher item: ${error.message}`);
        return {
            success: false,
            message: `❌ Job Voucher item not found.`
        };
    }
}

// ------------------- Deactivate Job Voucher -------------------
async function deactivateJobVoucher(characterId) {
    try {
        await updateCharacterById(characterId, { jobVoucher: Boolean(false), jobVoucherJob: null });
        console.log(`[Job Voucher Module]: Job voucher deactivated for character ID: ${characterId}`);
        return {
            success: true,
            message: `🎫 **Job voucher successfully deactivated.**`
        };
    } catch (error) {
    handleError(error, 'jobVoucherModule.js');

        console.error(`[Job Voucher Module]: Error deactivating job voucher: ${error.message}`);
        return {
            success: false,
            message: `❌ **An error occurred while deactivating the job voucher.**`
        };
    }
}

// ------------------- Export Functions -------------------
module.exports = {
    validateJobVoucher,
    activateJobVoucher,
    fetchJobVoucherItem,
    deactivateJobVoucher
};
