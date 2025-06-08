// ------------------- Job Voucher Module -------------------

// Import necessary modules
const { handleError } = require('../utils/globalErrorHandler');
const { removeItemInventoryDatabase } = require('../utils/inventoryUtils');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/googleSheetsUtils');
const { authorizeSheets, appendSheetData, safeAppendDataToSheet } = require('../utils/googleSheetsUtils');
const { getCharacterInventoryCollection, updateCharacterById, fetchItemByName } = require('../database/db'); 
const { v4: uuidv4 } = require('uuid');
const { getJobPerk } = require('./jobsModule');
const Character = require('../models/CharacterModel');
const { capitalizeWords } = require('./formattingModule');

// ------------------- Get Job Voucher Error Message -------------------
function getJobVoucherErrorMessage(errorType, data = {}) {
    const messages = {
        ALREADY_HAS_JOB: `✅ Character already has the job "${capitalizeWords(data.jobName || '')}". No job voucher needed.`,
        NO_VOUCHER: '❌ No active job voucher found.',
        WRONG_JOB: `❌ The job voucher is locked to **${capitalizeWords(data.voucherJob || '')}**, not **${capitalizeWords(data.requestedJob || '')}**. Please use the correct job.`,
        ALREADY_ACTIVE: `❌ ${data.characterName || 'Character'} already has an active Job Voucher for ${capitalizeWords(data.jobName || '')}. Please complete the current job before using another voucher.`,
        MISSING_SKILLS: data.activity === 'village-specific job' 
            ? `❌ ${data.characterName || 'Character'} must be in **${capitalizeWords(data.requiredVillage || '')}** to use the ${capitalizeWords(data.jobName || '')} job voucher. Currently in: **${capitalizeWords(data.currentVillage || '')}**`
            : `❌ ${data.characterName || 'Character'} cannot use the ${data.activity || 'looting'} perk as a ${capitalizeWords(data.jobName || '')}.`,
        ACTIVATION_ERROR: '❌ An error occurred while activating the job voucher.',
        DEACTIVATION_ERROR: '❌ An error occurred while deactivating the job voucher.',
        ITEM_NOT_FOUND: '❌ Job Voucher item not found.',
        STAMINA_LIMIT: `❌ ${data.characterName || 'Character'} cannot craft "${data.itemName}" with a job voucher because it requires more than 5 stamina. Try crafting something easier or use your main job.`,
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
        console.error(`[jobVoucherModule.js]: ❌ No active job voucher found for ${character.name}`);
        return getJobVoucherErrorMessage('NO_VOUCHER');
    }

    // Allow unrestricted job vouchers
    if (!character.jobVoucherJob) {
        console.log(`[jobVoucherModule.js]: 🔄 Unrestricted voucher - proceeding with job: ${jobName}`);
        return { success: true };
    }

    // Check if the job voucher matches the requested job
    if (character.jobVoucherJob.toLowerCase() !== jobName.toLowerCase()) {
        return getJobVoucherErrorMessage('WRONG_JOB', { 
            voucherJob: character.jobVoucherJob, 
            requestedJob: jobName 
        });
    }

    // Check if the job is village-specific and if the character is in the correct village
    const jobPerk = getJobPerk(jobName);
    if (jobPerk && jobPerk.village) {
        const characterVillage = character.currentVillage?.toLowerCase().trim();
        const requiredVillage = jobPerk.village.toLowerCase().trim();
        
        if (characterVillage !== requiredVillage) {
            console.error(`[jobVoucherModule.js]: ❌ ${character.name} must be in ${jobPerk.village} to use ${jobName} voucher`);
            return getJobVoucherErrorMessage('MISSING_SKILLS', {
                characterName: character.name,
                jobName: jobName,
                activity: 'village-specific job',
                requiredVillage: jobPerk.village,
                currentVillage: character.currentVillage
            });
        }
    }

    // If a specific perk is required, validate it
    if (requiredPerk) {
        const jobPerk = getJobPerk(jobName);
        if (!jobPerk || !jobPerk.perks.includes(requiredPerk.toUpperCase())) {
            const activity = requiredPerk.toLowerCase();
            console.error(`[jobVoucherModule.js]: ❌ ${character.name} lacks ${activity} perk for job: "${jobName}"`);
            return getJobVoucherErrorMessage('MISSING_SKILLS', {
                characterName: character.name,
                jobName: jobName,
                activity: activity
            });
        }
    }

    console.log(`[jobVoucherModule.js]: ✅ Job voucher validated for ${character.name} as ${jobName}`);
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
            success: true
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
        // Fetch character to get name
        const character = await Character.findById(characterId);
        if (!character) {
            throw new Error(`Character not found with ID: ${characterId}`);
        }

        // Check if the voucher has been used (indicated by lastGatheredAt being set)
        if (character.lastGatheredAt) {
            console.log(`[Job Voucher Module]: ❌ Cannot cancel used job voucher for ${character.name}`);
            return {
                success: false,
                message: `❌ **Cannot cancel a job voucher that has already been used.**\nThe voucher has been consumed.`
            };
        }

        // Always set jobVoucher to false and clear the job
        await updateCharacterById(characterId, { 
            jobVoucher: false, 
            jobVoucherJob: null 
        });
        console.log(`[Job Voucher Module]: 🎫 Job voucher deactivated for ${character.name}`);
        return {
            success: true,
            message: `🎫 **Job voucher successfully deactivated.**`
        };
    } catch (error) {
        handleError(error, 'jobVoucherModule.js');
        console.error(`[Job Voucher Module]: ❌ Error deactivating job voucher: ${error.message}`);
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
