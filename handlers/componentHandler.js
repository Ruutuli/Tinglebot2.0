// ------------------- Combined Component and Button Handler -------------------
// This file handles both button interactions and other component interactions,
// including template commands and modals. It organizes imports, defines helper 
// functions for button rows, and contains interaction handlers for job selection, 
// character viewing, syncing, and more.

const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Discord.js Components -------------------
// Components from discord.js for building action rows, buttons, and embeds.
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// ------------------- Database Connections -------------------
// Functions to establish connections with the database.
const { connectToTinglebot, fetchCharacterById, getUserById } = require('../database/db');

// ------------------- Database Models -------------------
// Schemas/models for database collections.
const ItemModel = require('../models/ItemModel');

// ------------------- Embed and Command Imports -------------------
// Embeds and commands for character details and help messages.
// Character Embeds
const { createCharacterEmbed, createCharacterGearEmbed } = require('../embeds/embeds');

// ------------------- Modules -------------------
// Custom modules for additional functionalities.
const { getGeneralJobsPage, getJobPerk } = require('../modules/jobsModule');
const { getVillageColorByName } = require('../modules/locationsModule');
const { roles } = require('../modules/rolesModule');

// ------------------- Handler Imports -------------------
// Handlers for specific component interactions and modals.
const { 
    handleMountComponentInteraction, 
    handleRegisterMountModal,
    handleTameInteraction, 
    handleTraitPaymentInteraction,
    handleTraitSelection,
    handleUseItemInteraction 
} = require('./mountComponentHandler');
const { handleModalSubmission } = require('./modalHandler');
const { syncInventory } = require('../handlers/syncHandler'); //---- Import for syncInventory handler

// ------------------- Utility Imports -------------------
// Utility functions for storage, token calculations, art submission embeds, and validation.
const { deleteSubmissionFromStorage, saveSubmissionToStorage, submissionStore } = require('../utils/storage');
const { calculateTokens, generateTokenBreakdown } = require('../utils/tokenUtils');
const { createArtSubmissionEmbed } = require('../embeds/mechanicEmbeds');
const { canChangeJob } = require('../utils/validation');


// =============================================================================
// ------------------- Utility Button Row Functions -------------------
// These functions create pre-defined button rows for interactions.

//---- Returns an action row containing a Cancel button.
function getCancelButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('cancel')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Danger)
    );
}

//---- Returns an action row containing a Confirm button.
function getConfirmButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('confirm')
            .setLabel('✅ Confirm')
            .setStyle(ButtonStyle.Success)
    );
}


// =============================================================================
// ------------------- Button Interaction Handlers -------------------
// These functions handle various button interactions such as syncing, confirmation,
// cancellation, viewing a character, and job selection actions.

//---- Primary handler for button interactions. Determines the action from customId and delegates accordingly.
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
                console.warn(`[componentHandler]: Unhandled button action: ${action}`);
                break;
        }
    } catch (error) {
    handleError(error, 'componentHandler.js');

        console.error(`[componentHandler]: Error handling button interaction (${action}): ${error.message}`);
        if (!interaction.replied) {
            await interaction.reply({
                content: '❌ **An error occurred while processing your action.**',
                ephemeral: true,
            });
        }
    }
}

//---- Handles the 'sync-yes' button interaction to initiate an inventory sync.
async function handleSyncYes(interaction, characterId) {
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({
        content: '🔄 **Sync has initiated. This may take some time. Please wait...**',
    });

    const character = await fetchCharacterById(characterId);
    if (!character) {
        await interaction.editReply({ content: '❌ **Character not found.**' });
        return;
    }

    await syncInventory(character.name, interaction.user.id, interaction);
}

//---- Handles the 'sync-no' button interaction to cancel a sync operation.
async function handleSyncNo(interaction) {
    await interaction.reply({ content: '❌ **Sync canceled.**', ephemeral: true });
}

//---- Handles the confirmation of a submission.
async function handleConfirmation(interaction, userId, submissionData) {
    if (!submissionData) {
        await interaction.reply({
            content: '❌ **Submission data not found. Please try again.**',
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

//---- Handles the cancellation of a submission.
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

//---- Handles the viewing of a character's details and gear.
async function handleViewCharacter(interaction, characterId) {
    await connectToTinglebot();
    const character = await fetchCharacterById(characterId);

    if (!character) {
        await interaction.reply({ content: '❌ **Character not found.**', ephemeral: true });
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


// =============================================================================
// ------------------- Job Interaction Handlers -------------------
// These functions handle job selection and pagination for updating a character's job.

//---- Handles job selection for a character, including validation, role updates, and notifications.
async function handleJobSelect(interaction, characterId, updatedJob) {
    try {
        await connectToTinglebot();
        const character = await fetchCharacterById(characterId);

        if (!character) {
            console.error(`[componentHandler]: Character not found for ID: ${characterId}`);
            await interaction.reply({ content: '❌ **Character not found.**', ephemeral: true });
            return;
        }

        // Run job validation
        const validationResult = await canChangeJob(character, updatedJob);
        if (!validationResult.valid) {
            console.warn(`[componentHandler]: Job validation failed: ${validationResult.message}`);
            await interaction.reply({ content: validationResult.message, ephemeral: true });
            return;
        }

        const previousJob = character.job;
        const member = interaction.member;

        // Update job roles: Remove the old job role if it exists.
        const roleToRemove = roles.Jobs.find(r => r.name === `Job: ${previousJob}`);
        if (roleToRemove) {
            const role = interaction.guild.roles.cache.find(r => r.name === roleToRemove.name);
            if (role) {
                await member.roles.remove(role);
            } else {
                console.error(`[componentHandler]: Role "${roleToRemove.name}" not found in the guild.`);
            }
        }

        // Add the new job role if available.
        const roleToAdd = roles.Jobs.find(r => r.name === `Job: ${updatedJob}`);
        if (roleToAdd) {
            const role = interaction.guild.roles.cache.find(r => r.name === roleToAdd.name);
            if (role) {
                await member.roles.add(role);
            } else {
                console.error(`[componentHandler]: Role "${roleToAdd.name}" not found in the guild.`);
            }
        }

        // Handle job perk updates.
        const jobPerkData = getJobPerk(updatedJob) || { perks: [] };
        const newPerks = jobPerkData.perks;
        const previousPerkData = getJobPerk(previousJob) || { perks: [] };
        const previousPerks = previousPerkData.perks;

        // Remove the old perk roles.
        for (const perk of previousPerks) {
            const perkRole = roles.JobPerks.find(r => r.name === `Job Perk: ${perk}`);
            if (perkRole) {
                const guildRole = interaction.guild.roles.cache.find(r => r.name === perkRole.name);
                if (guildRole) {
                    await member.roles.remove(guildRole);
                } else {
                    console.error(`[componentHandler]: Perk role "${perkRole.name}" not found in the guild.`);
                }
            } else {
                console.error(`[componentHandler]: No perk role found for "${perk}".`);
            }
        }

        // Add the new perk roles.
        for (const perk of newPerks) {
            const perkRole = roles.JobPerks.find(r => r.name === `Job Perk: ${perk}`);
            if (perkRole) {
                const guildRole = interaction.guild.roles.cache.find(r => r.name === perkRole.name);
                if (guildRole) {
                    await member.roles.add(guildRole);
                } else {
                    console.error(`[componentHandler]: Perk role "${perkRole.name}" not found in the guild.`);
                }
            } else {
                console.error(`[componentHandler]: No perk role found for "${perk}".`);
            }
        }

        // Update character's job and associated perk.
        character.job = updatedJob;
        character.jobPerk = newPerks.join(' / ');
        await character.save();

        // Create an embed for the updated character.
        const embed = createCharacterEmbed(character);
        await interaction.update({
            content: `✅ **${character.name}'s job has been updated from ${previousJob} to ${updatedJob}.**`,
            embeds: [embed],
            components: [],
            ephemeral: true,
        });

        // Post a notification message to the designated channel.
        const EDIT_NOTIFICATION_CHANNEL_ID = '1319524801408274434'; // Replace with your actual channel ID.
        try {
            const notificationChannel = await interaction.client.channels.fetch(EDIT_NOTIFICATION_CHANNEL_ID);
            if (notificationChannel && notificationChannel.isTextBased()) {
                const notificationMessage = `📢 **USER EDITED THEIR CHARACTER**\n\n` +
                    `🌱 **User:** \`${interaction.user.tag}\`\n` +
                    `👤 **Character Name:** \`${character.name}\`\n` +
                    `🛠️ **Edited Category:** \`Job\`\n` +
                    `🔄 **Previous Value:** \`Job: ${previousJob || 'N/A'}\`\n` +
                    `✅ **Updated Value:** \`Job: ${updatedJob}\``;
                await notificationChannel.send(notificationMessage);
            } else {
                console.error(`[componentHandler]: Notification channel is unavailable or not text-based.`);
            }
        } catch (err) {
    handleError(err, 'componentHandler.js');

            console.error(`[componentHandler]: Error sending update notification: ${err.message}`);
        }

    } catch (error) {
    handleError(error, 'componentHandler.js');

        console.error(`[componentHandler]: Error occurred while handling job selection: ${error.message}`);
        console.error(error.stack);
        await interaction.reply({
            content: '⚠️ **An error occurred while updating the job. Please try again.**',
            ephemeral: true,
        });
    }
}

//---- Handles pagination of job selection, creating buttons for job pages.
async function handleJobPage(interaction, characterId, pageIndexString) {
    try {
        const pageIndex = parseInt(pageIndexString, 10);
        const jobs = getGeneralJobsPage(pageIndex);

        // Create job selection buttons.
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

        // Create navigation buttons.
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
    handleError(error, 'componentHandler.js');

        console.error(`[componentHandler]: Error occurred while handling job page navigation: ${error.message}`);
        console.error(error.stack);
        await interaction.reply({
            content: '⚠️ **An error occurred while navigating the job pages. Please try again.**',
            ephemeral: true,
        });
    }
}


// =============================================================================
// ------------------- Component Interaction Handler -------------------
// Delegates interactions to the appropriate handlers based on the customId.
async function handleComponentInteraction(interaction) {
    const [action] = interaction.customId.split('|');

    if (
        ['sync-yes', 'sync-no', 'confirm', 'cancel', 'view', 'job-select', 'job-page'].includes(action)
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
        // Redirect modal submissions to the modal handler.
        await handleModalSubmission(interaction); 
    } else {
        console.warn(`[componentHandler]: Unhandled component interaction: ${interaction.customId}`);
    }
}

// =============================================================================
// ------------------- Exports -------------------
// Exporting the necessary functions for external use.
module.exports = {
    handleComponentInteraction,
    handleButtonInteraction,
    getCancelButtonRow,
    getConfirmButtonRow,
};
