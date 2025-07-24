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
const { EmbedBuilder } = require('discord.js');

// ------------------- Get Job Voucher Error Message -------------------
function getJobVoucherErrorMessage(errorType, data = {}) {
    const messages = {
        ALREADY_HAS_JOB: {
            title: '❌ Job Voucher Already Active',
            description: 'You already have an active job voucher.',
            fields: [
                { name: 'Current Job', value: `> ${data.currentJob || 'Unknown'}` },
                { name: 'How to Fix', value: '> Use `/job voucher deactivate` to cancel your current job voucher first.' }
            ],
            color: '#FF0000'
        },
        NO_VOUCHER: '❌ No active job voucher found.',
        WRONG_JOB: `❌ The job voucher is locked to **${capitalizeWords(data.voucherJob || '')}**, not **${capitalizeWords(data.requestedJob || '')}**. Please use the correct job.`,
        ALREADY_ACTIVE: `❌ ${data.characterName || 'Character'} already has an active Job Voucher for ${capitalizeWords(data.jobName || '')}. Please complete the current job before using another voucher.`,
        MISSING_SKILLS: data.activity === 'village-specific job' 
            ? `❌ ${data.characterName || 'Character'} must be in **${capitalizeWords(data.requiredVillage || '')}** to use the ${capitalizeWords(data.jobName || '')} job voucher. Currently in: **${capitalizeWords(data.currentVillage || '')}**`
            : `❌ ${data.characterName || 'Character'} cannot use the ${data.activity || 'looting'} perk as a ${capitalizeWords(data.jobName || '')}.`,
        ACTIVATION_ERROR: {
            title: '❌ Job Voucher Activation Failed',
            description: 'An error occurred while activating the job voucher.',
            fields: [
                { name: 'What Happened', value: '> The system encountered an error while processing your request.' },
                { name: 'How to Fix', value: '> Please try again in a few moments. If the problem persists, contact a moderator.' }
            ],
            color: '#FF0000'
        },
        DEACTIVATION_ERROR: {
            title: '❌ Job Voucher Deactivation Failed',
            description: 'An error occurred while deactivating the job voucher.',
            fields: [
                { name: 'What Happened', value: '> The system encountered an error while processing your request.' },
                { name: 'How to Fix', value: '> Please try again in a few moments. If the problem persists, contact a moderator.' }
            ],
            color: '#FF0000'
        },
        ITEM_NOT_FOUND: {
            title: '❌ Job Voucher Not Found',
            description: 'The job voucher item could not be found in your inventory.',
            fields: [
                { name: 'What Happened', value: '> The system could not locate a job voucher in your inventory.' },
                { name: 'How to Fix', value: '> Make sure you have a job voucher in your inventory before using this command.' }
            ],
            color: '#FF0000'
        },
        STAMINA_LIMIT: {
            title: '❌ Stamina Limit Exceeded',
            description: `${data.characterName || 'Character'} cannot craft "${data.itemName}" with a job voucher.`,
            fields: [
                { name: 'What Happened', value: '> The item requires more than 5 stamina to craft.' },
                { name: 'How to Fix', value: '> Try crafting something easier or use your main job instead.' }
            ],
            color: '#FF0000'
        },
        // ============================================================================
        // ------------------- No Job Specified Error (Job Voucher) -------------------
        // Embed for missing job when using a job voucher
        // ============================================================================
        NO_JOB_SPECIFIED: {
            title: '❗ Job Not Specified',
            description: 'You must specify a job to use with your Job Voucher. This tells the system what temporary job you want to perform.',
            fields: [
                { name: 'How to Use', value: 'Format your command like this:' },
                { name: 'Example', value: '```/job voucher activate job:<job name>```\nReplace `<job name>` with the job you want to use.\n\nFor example:\n```/job voucher activate job:Blacksmith```' },
                { name: 'Tip', value: 'You can view a list of available jobs with `/job list`.' }
            ],
            color: '#F1C40F'
        }
    };

    const errorInfo = messages[errorType] || {
        title: '❌ Unknown Error',
        description: 'An unknown error occurred with the job voucher.',
        fields: [
            { name: 'What Happened', value: '> The system encountered an unexpected error.' },
            { name: 'How to Fix', value: '> Please try again or contact a moderator if the problem persists.' }
        ],
        color: '#FF0000'
    };

    // If the error type is NO_JOB_SPECIFIED, return the embed in the same format
    if (errorType === 'NO_JOB_SPECIFIED') {
        return {
            success: false,
            embed: new EmbedBuilder()
                .setTitle(messages.NO_JOB_SPECIFIED.title)
                .setDescription(messages.NO_JOB_SPECIFIED.description)
                .addFields(messages.NO_JOB_SPECIFIED.fields)
                .setColor(messages.NO_JOB_SPECIFIED.color)
                .setTimestamp(),
            skipVoucher: false
        };
    }

    return {
        success: false,
        embed: new EmbedBuilder()
            .setTitle(errorInfo.title)
            .setDescription(errorInfo.description)
            .addFields(errorInfo.fields)
            .setColor(errorInfo.color)
            .setTimestamp(),
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
