// ------------------- Job Voucher Module -------------------

// Import necessary modules
const { handleError } = require('../utils/globalErrorHandler');
const { removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation');
const { authorizeSheets, appendSheetData, safeAppendDataToSheet } = require('../utils/googleSheetsUtils');
const { getCharacterInventoryCollection, updateCharacterById, fetchItemByName } = require('../database/db'); 
const { v4: uuidv4 } = require('uuid');
const { getJobPerk } = require('./jobsModule');

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
async function validateJobVoucher(character, jobName, requiredPerk = null) {
    // First check if character actually has a job voucher
    if (!character.jobVoucher) {
        console.error(`[Job Voucher Validation]: Character ${character.name} has no active job voucher.`);
        return getJobVoucherErrorMessage('NO_VOUCHER');
    }

    // Allow unrestricted job vouchers
    if (!character.jobVoucherJob) {
        console.log(`[Job Voucher Validation]: Voucher is not locked to any specific job. Proceeding with job: ${jobName}`);
        return { success: true };
    }

    // Check if the job voucher matches the requested job
    if (character.jobVoucherJob.toLowerCase() !== jobName.toLowerCase()) {
        return getJobVoucherErrorMessage('WRONG_JOB', { 
            voucherJob: character.jobVoucherJob, 
            requestedJob: jobName 
        });
    }

    // If a specific perk is required, validate it
    if (requiredPerk) {
        const jobPerk = getJobPerk(jobName);
        if (!jobPerk || !jobPerk.perks.includes(requiredPerk.toUpperCase())) {
            console.error(`[Job Voucher Validation]: ${character.name} lacks ${requiredPerk} skills for job: "${jobName}"`);
            return getJobVoucherErrorMessage('MISSING_SKILLS', {
                characterName: character.name,
                jobName: jobName
            });
        }
    }

    console.log(`[Job Voucher Validation]: ✅ Validation successful for ${character.name} with job ${jobName}`);
    return { success: true };
}

// ------------------- Activate Job Voucher -------------------
async function activateJobVoucher(character, jobName, item, quantity = 1, interaction) {
    try {
        // Log job voucher activation
        console.log(`[jobVoucherModule.js]: 🎫 Job Voucher Activation:`);
        console.log(`[jobVoucherModule.js]: 👤 Character: ${character.name}`);
        console.log(`[jobVoucherModule.js]: 💼 Job: ${jobName}`);
        console.log(`[jobVoucherModule.js]: 🏠 Village: ${character.currentVillage}`);
        console.log(`[jobVoucherModule.js]: 🔄 Current Job: ${character.job || 'None'}`);

        // First ensure any existing voucher is deactivated
        await deactivateJobVoucher(character._id);

        // Then activate the new voucher
        await updateCharacterById(character._id, { 
            jobVoucher: true, 
            jobVoucherJob: jobName 
        });

        console.log(`[jobVoucherModule.js]: ✅ Job Voucher activated successfully for ${character.name} as ${jobName}`);

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
        // Always set jobVoucher to false and clear the job
        await updateCharacterById(characterId, { 
            jobVoucher: false, 
            jobVoucherJob: null 
        });
        console.log(`[Job Voucher Module]: Job voucher deactivated for character ID: ${characterId}`);
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
