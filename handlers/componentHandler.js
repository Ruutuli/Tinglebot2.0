// ------------------- Combined Component and Button Handler -------------------
// Handles button interactions, component interactions, and template commands

// ------------------- Imports -------------------

// Standard Libraries
const { v4: uuidv4 } = require('uuid');

// Discord.js Components
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// Database Connections
const { connectToTinglebot } = require('../database/connection');

// Database Services
const { fetchCharacterById, getCharactersInVillage } = require('../database/characterService');
const { getUserById } = require('../database/userService');

// Database Models
const ItemModel = require('../models/ItemModel');

// Embed and Command Imports
const {
    createCharacterEmbed,
    createCharacterGearEmbed,
} = require('../embeds/characterEmbeds');
const {
    createGettingStartedEmbed,
    createCommandsEmbed,
    createButtonsRow,
} = require('../commands/help');

// Modules
const { getJobPerk, getGeneralJobsPage } = require('../modules/jobsModule');
const { getVillageColorByName } = require('../modules/locationsModule');
const { capitalizeFirstLetter, capitalizeWords } = require('../modules/formattingModule');
const { roles } = require('../modules/rolesModule');

// Handler Imports
const { syncInventory } = require('../handlers/syncHandler');
const { 
    handleTameInteraction, 
    handleMountComponentInteraction, 
    handleUseItemInteraction,
    handleTraitPaymentInteraction,
    handleTraitSelection,
    handleMountNameSubmission,
    handleRegisterMountModal
} = require('./mountComponentHandler');
const { handleModalSubmission } = require('./modalHandler');

// Utility Imports
const {
    submissionStore,
    saveSubmissionToStorage,
    deleteSubmissionFromStorage,
} = require('../utils/storage');
const { calculateTokens, generateTokenBreakdown } = require('../utils/tokenUtils');
const { createArtSubmissionEmbed } = require('../embeds/mechanicEmbeds');
const { canChangeJob, canChangeVillage, isUniqueCharacterName, convertCmToFeetInches } = require('../utils/validation'); // Validation utilities



// Google Sheets API Imports
const { 
    appendSheetData, 
    authorizeSheets, 
    extractSpreadsheetId, 
    fetchSheetData, 
    getSheetIdByTitle, 
    isValidGoogleSheetsUrl, 
    readSheetData 
} = require("../utils/googleSheetsUtils");

// ------------------- Utility Button Rows -------------------
function getCancelButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('cancel')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Danger)
    );
}

function getConfirmButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('confirm')
            .setLabel('✅ Confirm')
            .setStyle(ButtonStyle.Success)
    );
}

// ------------------- Button Interaction Handler -------------------
async function handleButtonInteraction(interaction) {
    if (interaction.replied || interaction.deferred) return;

    const userId = interaction.user.id;
    const [action, characterId, extra] = interaction.customId.split('|');
    const submissionData = submissionStore.get(userId);

    try {
        switch (action) {
            case 'sync-yes':
                await handleSyncYes(interaction, characterId);
                break;
            case 'sync-no':
                await handleSyncNo(interaction);
                break;
            case 'confirm':
                await handleConfirmation(interaction, userId, submissionData);
                break;
            case 'cancel':
                await handleCancel(interaction, userId, submissionData);
                break;
            case 'view':
                await handleViewCharacter(interaction, characterId);
                break;
            case 'job-select':
                await handleJobSelect(interaction, characterId, extra);
                break;
            case 'job-page':
                await handleJobPage(interaction, characterId, extra);
                break;
            default:
                console.warn(`Unhandled button action: ${action}`);
                break;
        }
    } catch (error) {
        console.error(`Error handling button interaction (${action}):`, error);
        if (!interaction.replied) {
            await interaction.reply({
                content: '❌ An error occurred while processing your action.',
                ephemeral: true,
            });
        }
    }
}

async function handleSyncYes(interaction, characterId) {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({
        content: '🔄 **Sync has initiated. This may take some time. Please wait...**',
    });

    const character = await fetchCharacterById(characterId);
    if (!character) {
        await interaction.editReply({ content: '❌ Character not found.' });
        return;
    }

    await syncInventory(character.name, interaction.user.id, interaction);
}

async function handleSyncNo(interaction) {
    await interaction.reply({ content: '❌ Sync canceled.', ephemeral: true });
}

async function handleConfirmation(interaction, userId, submissionData) {
    if (!submissionData) {
        await interaction.reply({
            content: '❌ Submission data not found. Please try again.',
            ephemeral: true,
        });
        return;
    }

    const user = await getUserById(userId);
    const { totalTokens } = calculateTokens(submissionData);
    const breakdown = generateTokenBreakdown({
        ...submissionData,
        finalTokenAmount: totalTokens,
    });

    await interaction.update({
        content: '✅ **You have confirmed your submission!** Mods will review it shortly.',
        components: [],
    });

    const embed = createArtSubmissionEmbed(submissionData, user, breakdown);
    if (!submissionData.embedSent) {
        const sentMessage = await interaction.channel.send({ embeds: [embed] });
        submissionData.messageUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${sentMessage.id}`;
        submissionStore.set(userId, submissionData);
        saveSubmissionToStorage(submissionData.submissionId, submissionData);
    }

    submissionStore.delete(userId);
}

async function handleCancel(interaction, userId, submissionData) {
    if (submissionData?.submissionId) {
        deleteSubmissionFromStorage(submissionData.submissionId);
    }

    submissionStore.delete(userId);

    await interaction.update({
        content: '❌ **Your submission has been canceled.**',
        components: [],
    });
}

async function handleViewCharacter(interaction, characterId) {
    await connectToTinglebot();
    const character = await fetchCharacterById(characterId);

    if (!character) {
        await interaction.reply({ content: '❌ Character not found.', ephemeral: true });
        return;
    }

    const embed = createCharacterEmbed(character);
    const itemNames = [
        character.gearWeapon?.name,
        character.gearShield?.name,
        character.gearArmor?.head?.name,
        character.gearArmor?.chest?.name,
        character.gearArmor?.legs?.name,
    ].filter(Boolean);

    const itemDetails = await ItemModel.find({ itemName: { $in: itemNames } });
    const getItemDetail = (itemName) => {
        const item = itemDetails.find((detail) => detail.itemName === itemName);
        return item ? `${item.emoji} ${item.itemName} [+${item.modifierHearts}]` : 'N/A';
    };

    const gearMap = {
        head: character.gearArmor?.head ? `> ${getItemDetail(character.gearArmor.head.name)}` : '> N/A',
        chest: character.gearArmor?.chest ? `> ${getItemDetail(character.gearArmor.chest.name)}` : '> N/A',
        legs: character.gearArmor?.legs ? `> ${getItemDetail(character.gearArmor.legs.name)}` : '> N/A',
        weapon: character.gearWeapon ? `> ${getItemDetail(character.gearWeapon.name)}` : '> N/A',
        shield: character.gearShield ? `> ${getItemDetail(character.gearShield.name)}` : '> N/A',
    };

    const gearEmbed = createCharacterGearEmbed(character, gearMap, 'all');
    await interaction.reply({ embeds: [embed, gearEmbed], ephemeral: true });
} 

// handleJobSelect
async function handleJobSelect(interaction, characterId, updatedJob) {
    try {
        await connectToTinglebot();
        const character = await fetchCharacterById(characterId);

        if (!character) {
            console.error(`[ERROR] Character not found for ID: ${characterId}`);
            await interaction.reply({ content: '❌ Character not found.', ephemeral: true });
            return;
        }

        // Run job validation
        const validationResult = await canChangeJob(character, updatedJob);

        if (!validationResult.valid) {
            console.warn(`[WARNING] Job validation failed: ${validationResult.message}`);
            await interaction.reply({ content: validationResult.message, ephemeral: true });
            return;
        }

        const previousJob = character.job;

        // Define roles to modify
        const member = interaction.member;
        const roleToRemove = roles.Jobs.find(r => r.name === `Job: ${previousJob}`);
        const roleToAdd = roles.Jobs.find(r => r.name === `Job: ${updatedJob}`);

        // Remove the old job role
        if (roleToRemove) {
            const role = interaction.guild.roles.cache.find(r => r.name === roleToRemove.name);
            if (role) {
                await member.roles.remove(role);
                console.log(`[Roles]: Removed role "${role.name}" from user "${member.user.tag}".`);
            } else {
                console.warn(`[Roles]: Role "${roleToRemove.name}" not found in the guild.`);
            }
        } else {
            console.log(`[Roles]: No role to remove for "Job: ${previousJob}".`);
        }

        // Add the new job role
        if (roleToAdd) {
            const role = interaction.guild.roles.cache.find(r => r.name === roleToAdd.name);
            if (role) {
                await member.roles.add(role);
                console.log(`[Roles]: Assigned role "${role.name}" to user "${member.user.tag}".`);
            } else {
                console.warn(`[Roles]: Role "${roleToAdd.name}" not found in the guild.`);
            }
        } else {
            console.log(`[Roles]: No role to add for "Job: ${updatedJob}".`);
        }

        // Handle job perks
        const previousPerk = roles.JobPerks.find(perk => perk.name === `Job Perk: ${character.jobPerk}`);
        // Handle job perks
const jobPerkData = getJobPerk(updatedJob) || { perks: [] }; // Get new job's perks
const newPerks = jobPerkData.perks;

// Fetch the previous job's perk data
const previousPerkData = getJobPerk(previousJob) || { perks: [] };
const previousPerks = previousPerkData.perks;

// Remove the old perk roles
for (const perk of previousPerks) {
    const perkRole = roles.JobPerks.find(r => r.name === `Job Perk: ${perk}`);
    if (perkRole) {
        const guildRole = interaction.guild.roles.cache.find(r => r.name === perkRole.name);
        if (guildRole) {
            await member.roles.remove(guildRole);
            console.log(`[Roles]: Removed perk role "${guildRole.name}" from user "${member.user.tag}".`);
        } else {
            console.warn(`[Roles]: Perk role "${perkRole.name}" not found in the guild.`);
        }
    } else {
        console.warn(`[Roles]: No perk role found for "${perk}".`);
    }
}

// Add the new perk roles
for (const perk of newPerks) {
    const perkRole = roles.JobPerks.find(r => r.name === `Job Perk: ${perk}`);
    if (perkRole) {
        const guildRole = interaction.guild.roles.cache.find(r => r.name === perkRole.name);
        if (guildRole) {
            await member.roles.add(guildRole);
            console.log(`[Roles]: Assigned perk role "${guildRole.name}" to user "${member.user.tag}".`);
        } else {
            console.warn(`[Roles]: Perk role "${perkRole.name}" not found in the guild.`);
        }
    } else {
        console.warn(`[Roles]: No perk role found for "${perk}".`);
    }
}


        // Update character's job and perk
        character.job = updatedJob;
        character.jobPerk = newPerks.join(' / ');
        await character.save();

        console.log(`[INFO] Job successfully updated for ${character.name} from ${previousJob} to ${updatedJob}`);

        // Create an embed for the updated character
        const embed = createCharacterEmbed(character);

        // Main update message
        await interaction.update({
            content: `✅ **${character.name}'s job has been updated from ${previousJob} to ${updatedJob}.**`,
            embeds: [embed],
            components: [],
            ephemeral: true,
        });

        // Post notification to the designated channel
        const EDIT_NOTIFICATION_CHANNEL_ID = '1319524801408274434'; // Replace with your actual channel ID
        try {
            const notificationChannel = await interaction.client.channels.fetch(EDIT_NOTIFICATION_CHANNEL_ID);
            if (notificationChannel && notificationChannel.isTextBased()) {
                const notificationMessage = `📢 **USER EDITED THEIR CHARACTER**\n
🌱 **User:** \`${interaction.user.tag}\`
👤 **Character Name:** \`${character.name}\`
🛠️ **Edited Category:** \`Job\`
🔄 **Previous Value:** \`Job: ${previousJob || 'N/A'}\`
✅ **Updated Value:** \`Job: ${updatedJob}\``;

                await notificationChannel.send(notificationMessage);
            } else {
                console.error(`[componentHandler]: Notification channel is not text-based or unavailable.`);
            }
        } catch (err) {
            console.error(`[componentHandler]: Error sending update notification: ${err.message}`);
        }

    } catch (error) {
        console.error(`[ERROR] An error occurred while handling job selection: ${error.message}`);
        console.error(error.stack);
        await interaction.reply({
            content: '⚠️ An error occurred while updating the job. Please try again.',
            ephemeral: true,
        });
    }
}



// handleJobPage
async function handleJobPage(interaction, characterId, pageIndexString) {
    try {
        const pageIndex = parseInt(pageIndexString, 10);
        const jobs = getGeneralJobsPage(pageIndex);

       const jobButtons = jobs.map((job) =>
            new ButtonBuilder()
                .setCustomId(`job-select|${characterId}|${job}`)
                .setLabel(job)
                .setStyle(ButtonStyle.Primary)
        );

        const rows = [];
        while (jobButtons.length) {
            rows.push(new ActionRowBuilder().addComponents(jobButtons.splice(0, 5)));
        }

        const previousPageIndex = pageIndex - 1;
        const nextPageIndex = pageIndex + 1;

        const navigationButtons = [
            new ButtonBuilder()
                .setCustomId(`job-page|${characterId}|${previousPageIndex}`)
                .setLabel('Previous')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(previousPageIndex < 1),
            new ButtonBuilder()
                .setCustomId(`job-page|${characterId}|${nextPageIndex}`)
                .setLabel('Next')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(nextPageIndex > 2),
        ];

        const navigationRow = new ActionRowBuilder().addComponents(navigationButtons);

        const embed = new EmbedBuilder()
            .setTitle('General Jobs')
            .setDescription('Select a job from the buttons below:')
            .setColor(getVillageColorByName('General') || '#00CED1');

        await interaction.update({ embeds: [embed], components: [...rows, navigationRow], ephemeral: true });
    } catch (error) {
        console.error(`[ERROR] An error occurred while handling job page navigation: ${error.message}`);
        console.error(error.stack);
        await interaction.reply({
            content: '⚠️ An error occurred while navigating the job pages. Please try again.',
            ephemeral: true,
        });
    }
}

// ------------------- Component Interaction Handler -------------------
async function handleComponentInteraction(interaction) {
    const [action] = interaction.customId.split('|');

    if (
        [   'sync-yes',
            'sync-no',
            'confirm',
            'cancel',
            'view',
            'job-select',
            'job-page',
        ].includes(action)
    ) {
        await handleButtonInteraction(interaction);
    } else if (['sneak', 'distract', 'corner', 'rush', 'glide'].includes(action)) {
        await handleMountComponentInteraction(interaction);
    } else if (action === 'tame') {
        await handleTameInteraction(interaction);
    } else if (action === 'use-item') {
        await handleUseItemInteraction(interaction);
    } else if (action === 'pay-traits') {
        await handleTraitPaymentInteraction(interaction);
    } else if (action === 'trait-select') {
        await handleTraitSelection(interaction);
    } else if (action === 'register-mount') {
        await handleRegisterMountModal(interaction);
    } else if (interaction.isModalSubmit()) {
        console.info(`[componentHandler]: Redirecting modal interaction to modalHandler.`);
        await handleModalSubmission(interaction); 
    } else {
        console.warn(`Unhandled component interaction: ${interaction.customId}`);
    }
}

// ------------------- Help Interaction Handler -------------------
async function handleHelpInteraction(interaction, action) {
    try {
        const embed =
            action === 'getting_started'
                ? createGettingStartedEmbed()
                : createCommandsEmbed();
        const buttonsRow = createButtonsRow(interaction.id);

        await interaction.update({ embeds: [embed], components: [buttonsRow] });
    } catch (error) {
        console.error('Error handling help interaction:', error);
    }
}


// ------------------- Exports -------------------
module.exports = {
    handleComponentInteraction,
    handleButtonInteraction,
    getCancelButtonRow,
    getConfirmButtonRow,
    handleHelpInteraction,
};
