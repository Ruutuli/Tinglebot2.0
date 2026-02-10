// ------------------- Job Voucher Module -------------------

// Import necessary modules
const { handleError } = require('../utils/globalErrorHandler');
const logger = require('../utils/logger');
const { removeItemInventoryDatabase } = require('../utils/inventoryUtils');
// Google Sheets functionality removed
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
        NO_VOUCHER: {
            title: '❌ No Job Voucher Found',
            description: 'No active job voucher found.',
            fields: [
                { name: 'What Happened', value: '> You do not have an active job voucher.' },
                { name: 'How to Fix', value: '> Use a Job Voucher item from your inventory first.' }
            ],
            color: '#FF0000'
        },
        WRONG_JOB: {
            title: '❌ Wrong Job Voucher',
            description: `The job voucher is locked to **${capitalizeWords(data.voucherJob || '')}**, not **${capitalizeWords(data.requestedJob || '')}**.`,
            fields: [
                { name: 'Voucher Job', value: `> ${capitalizeWords(data.voucherJob || '')}` },
                { name: 'Requested Job', value: `> ${capitalizeWords(data.requestedJob || '')}` },
                { name: 'How to Fix', value: '> Use the correct job voucher or get a new one.' }
            ],
            color: '#FF0000'
        },
        ALREADY_ACTIVE: {
            title: '❌ Job Voucher Already Active',
            description: `${data.characterName || 'Character'} already has an active Job Voucher for ${capitalizeWords(data.jobName || '')}.`,
            fields: [
                { name: 'Current Job', value: `> ${capitalizeWords(data.jobName || '')}` },
                { name: 'How to Fix', value: '> Complete the current job before using another voucher.' }
            ],
            color: '#FF0000'
        },
        MISSING_SKILLS: {
            title: '❌ Missing Required Skills',
            description: data.activity === 'village-specific job' 
                ? `${data.characterName || 'Character'} must be in **${capitalizeWords(data.requiredVillage || '')}** to use the ${capitalizeWords(data.jobName || '')} job voucher.`
                : `${data.characterName || 'Character'} cannot use the ${data.activity || 'looting'} perk as a ${capitalizeWords(data.jobName || '')}.`,
            fields: data.activity === 'village-specific job' 
                ? [
                    { name: 'Required Village', value: `> ${capitalizeWords(data.requiredVillage || '')}` },
                    { name: 'Current Village', value: `> ${capitalizeWords(data.currentVillage || '')}` },
                    { name: 'How to Fix', value: '> Travel to the correct village to use this job voucher.' }
                ]
                : [
                    { name: 'Job', value: `> ${capitalizeWords(data.jobName || '')}` },
                    { name: 'Required Perk', value: `> ${data.activity || 'looting'}` },
                    { name: 'How to Fix', value: '> Choose a different job or get the required skills.' }
                ],
            color: '#FF0000'
        },
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
        TEACHER_CRAFTING_NEEDS_VOUCHER: {
            title: '❌ Job Voucher Required for Teacher Stamina Assistance',
            description: `Teacher stamina assistance requires **${data.characterName || 'the crafting character'}** to have at least one Job Voucher in inventory when using the stamina benefit.`,
            fields: [
                { name: 'Note', value: '> This boost uses 2 job vouchers: one from the booster when they accept, and one from the crafting character when they use the stamina assistance.' },
                { name: 'How to Fix', value: '> Add a Job Voucher to the crafting character\'s inventory, then try crafting again.' }
            ],
            color: '#FF0000'
        },
        BOOSTER_NEEDS_ONE_VOUCHER_AT_ACCEPT: {
            title: '❌ Teacher Crafting Boost Requires 1 Job Voucher to Accept',
            description: `**${data.boosterName || 'The booster'}** must have at least 1 Job Voucher in inventory to accept a Teacher Crafting boost. (A second voucher is used from the booster when the boosted character crafts.)`,
            fields: [
                { name: 'Note', value: '> This boost uses 2 job vouchers from the booster: one when they accept, and one when the crafting character uses the stamina assistance.' },
                { name: 'How to Fix', value: '> Add a Job Voucher to the boosting character\'s inventory, then try accepting again.' }
            ],
            color: '#FF0000'
        },
        BOOSTER_NEEDS_VOUCHER_AT_CRAFT: {
            title: '❌ Booster Must Have Job Voucher When You Use Stamina Assistance',
            description: `The booster (**${data.boosterName || 'Teacher'}**) must have at least 1 Job Voucher in inventory when you use Teacher stamina assistance. The second voucher is removed from the booster when the boosted character crafts.`,
            fields: [
                { name: 'Note', value: '> Ask the booster to add a Job Voucher to their inventory, then try crafting again.' },
                { name: 'How to Fix', value: '> The boosting character needs to have a Job Voucher available when you craft (it is used at craft time).' }
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
                { name: 'Example', value: '```/item charactername:YourCharacter itemname:Job Voucher jobname:Blacksmith```\nReplace `YourCharacter` with your character name and `Blacksmith` with the job you want to use.' },
                { name: 'Available Jobs', value: '**General Jobs:**\nAdventurer, Artist, Bandit, Cook, Courier, Craftsman, Farmer, Forager, Guard, Graveskeeper, Healer, Herbalist, Hunter, Mercenary, Priest, Scout, Villager, Witch, Entertainer\n\n**Inariko Jobs:**\nFisherman, Researcher, Scholar, Teacher\n\n**Rudania Jobs:**\nRancher, Blacksmith, Miner\n\n**Vhintl Jobs:**\nBeekeeper, Fortune Teller, Mask Maker, Weaver\n\n**❌ Restricted Jobs (Cannot use Job Vouchers):**\nMerchant, Shopkeeper, Stablehand' }
            ],
            color: '#F1C40F'
        },
        // ============================================================================
        // ------------------- Restricted Job Error (Job Voucher) -------------------
        // Embed for when users try to use restricted jobs with job vouchers
        // ============================================================================
        RESTRICTED_JOB: {
            title: '❌ Job Voucher Restriction',
            description: `The **${capitalizeWords(data.jobName || '')}** job cannot be used with Job Vouchers.`,
            fields: [
                { name: 'Restricted Jobs', value: '• Shopkeeper\n• Stablehand\n• Merchant' },
                { name: 'Why?', value: 'These jobs require permanent establishment and cannot be performed temporarily.' },
                { name: 'Alternative', value: 'Choose a different job from the available list above.' }
            ],
            color: '#FF0000'
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
    // Mod characters can use any job without a voucher
    if (character.isModCharacter) {
        console.log(`[jobVoucherModule.js]: 👑 Mod character ${character.name} can use any job without a voucher.`);
        return { success: true };
    }

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

        // First ensure any existing voucher is deactivated (afterUse so we always clear)
        await deactivateJobVoucher(character._id, { afterUse: true });

        // Then activate the new voucher
        // Use appropriate update function based on character type
        if (character.isModCharacter) {
            const { updateModCharacterById } = require('../database/db.js');
            await updateModCharacterById(character._id, { 
                jobVoucher: true, 
                jobVoucherJob: jobName 
            });
        } else {
            await updateCharacterById(character._id, { 
                jobVoucher: true, 
                jobVoucherJob: jobName 
            });
        }

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
async function deactivateJobVoucher(characterId, options = {}) {
    try {
        const { afterUse = false } = options;

        // Fetch character to get name - check both regular and mod characters
        let character = await Character.findById(characterId);
        if (!character) {
            // Try mod character if regular character not found
            const ModCharacter = require('../models/ModCharacterModel.js');
            character = await ModCharacter.findById(characterId);
            if (!character) {
                throw new Error(`Character not found with ID: ${characterId}`);
            }
        }

        // When not "after use" (e.g. manual cancel), block if voucher was already used
        if (!afterUse && character.lastGatheredAt) {
            console.log(`[Job Voucher Module]: ❌ Cannot cancel used job voucher for ${character.name}`);
            return {
                success: false,
                message: `❌ **Cannot cancel a job voucher that has already been used.**\nThe voucher has been consumed.`
            };
        }

        // Always set jobVoucher to false and clear the job
        // Use appropriate update function based on character type
        if (character.isModCharacter) {
            const { updateModCharacterById } = require('../database/db.js');
            await updateModCharacterById(characterId, { 
                jobVoucher: false, 
                jobVoucherJob: null 
            });
        } else {
            await updateCharacterById(characterId, { 
                jobVoucher: false, 
                jobVoucherJob: null 
            });
        }
        logger.success('ECONOMY', `Job voucher deactivated for ${character.name}`);
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
