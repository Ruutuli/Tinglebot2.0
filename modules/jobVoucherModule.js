// ------------------- Job Voucher Module -------------------

// Import necessary modules
const { handleError } = require('../utils/globalErrorHandler');
const { removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');
const { authorizeSheets, appendSheetData, safeAppendDataToSheet } = require('../utils/googleSheetsUtils');
const { getCharacterInventoryCollection, updateCharacterById, fetchItemByName } = require('../database/db'); 
const { v4: uuidv4 } = require('uuid');

// ------------------- Get Job Voucher Error Message -------------------
function getJobVoucherErrorMessage(errorType, data = {}) {
    const messages = {
        ALREADY_HAS_JOB: `✅ Character already has the job "${data.jobName}". No job voucher needed.`,
        NO_VOUCHER: '❌ No active job voucher found.',
        WRONG_JOB: `❌ The job voucher is locked to **${data.voucherJob}**, not **${data.requestedJob}**. Please use the correct job.`,
        ALREADY_ACTIVE: `❌ ${data.characterName} already has an active Job Voucher for ${data.jobName}. Please complete the current job before using another voucher.`,
        MISSING_SKILLS: `❌ ${data.characterName} can't loot as a ${data.jobName} because they lack the necessary looting skills.`,
        ACTIVATION_ERROR: '❌ An error occurred while activating the job voucher.',
        DEACTIVATION_ERROR: '❌ An error occurred while deactivating the job voucher.',
        ITEM_NOT_FOUND: '❌ Job Voucher item not found.'
    };

    return {
        success: false,
        message: messages[errorType] || '❌ An unknown error occurred with the job voucher.',
        skipVoucher: errorType === 'ALREADY_HAS_JOB'
    };
}

// ------------------- Validate Job Voucher -------------------
async function validateJobVoucher(character, jobName) {
    // ------------------- NEW: If character already has the job, voucher is not needed -------------------
    if (character.job?.trim().toLowerCase() === jobName?.trim().toLowerCase()) {
        console.error(`[Job Voucher Validation]: Character already has job "${jobName}". Voucher not required.`);
        return getJobVoucherErrorMessage('ALREADY_HAS_JOB', { jobName });
    }

    if (!character.jobVoucher) {
        return getJobVoucherErrorMessage('NO_VOUCHER');
    }

    // Allow unrestricted job vouchers
    if (!character.jobVoucherJob) {
        console.error(`[Job Voucher Validation]: Voucher is not locked to any specific job. Proceeding with job: ${jobName}`);
        return { success: true };
    }

    if (character.jobVoucherJob !== jobName) {
        return getJobVoucherErrorMessage('WRONG_JOB', { 
            voucherJob: character.jobVoucherJob, 
            requestedJob: jobName 
        });
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

            if (character?.name && character?.inventory && character?.userId) {
                await safeAppendDataToSheet(character.inventory, character, range, values);
            } else {
                console.error('[safeAppendDataToSheet]: Invalid character object detected before syncing.');
            }
        }

        return {
            success: true,
            message: `🎫 **Job Voucher activated for ${character.name} to perform the job ${jobName}.**`
        };
    } catch (error) {
        handleError(error, 'jobVoucherModule.js');
        console.error(`[jobVoucherModule.js]: Error activating job voucher: ${error.message}`);
        return getJobVoucherErrorMessage('ACTIVATION_ERROR');
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
        return getJobVoucherErrorMessage('ITEM_NOT_FOUND');
    }
}

// ------------------- Deactivate Job Voucher -------------------
async function deactivateJobVoucher(characterId) {
    try {
        await updateCharacterById(characterId, { jobVoucher: Boolean(false), jobVoucherJob: null });
        console.error(`[Job Voucher Module]: Job voucher deactivated for character ID: ${characterId}`);
        return {
            success: true,
            message: `🎫 **Job voucher successfully deactivated.**`
        };
    } catch (error) {
        handleError(error, 'jobVoucherModule.js');
        console.error(`[Job Voucher Module]: Error deactivating job voucher: ${error.message}`);
        return getJobVoucherErrorMessage('DEACTIVATION_ERROR');
    }
}

// ------------------- Export Functions -------------------
module.exports = {
    validateJobVoucher,
    activateJobVoucher,
    fetchJobVoucherItem,
    deactivateJobVoucher,
    getJobVoucherErrorMessage
};
