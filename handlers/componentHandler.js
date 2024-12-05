// ------------------- Combined Component and Button Handler -------------------
// Handles button interactions like confirm/cancel, component interactions, and template command

// ------------------- Imports -------------------
// Discord.js Imports
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// Database Service Imports
const { connectToTinglebot } = require('../database/connection');
const { fetchCharacterById, getCharactersInVillage } = require('../database/characterService');
const { getUserById } = require('../database/userService'); 


// Model Imports
const ItemModel = require('../models/ItemModel');

// Embed and Command Imports
const { createCharacterEmbed, createCharacterGearEmbed } = require('../embeds/characterEmbeds');
const { createGettingStartedEmbed, createCommandsEmbed, createButtonsRow } = require('../commands/help');


// Module Imports
const { getGeneralJobsPage } = require('../modules/jobsModule');
const { getVillageColorByName } = require('../modules/locationsModule');

// Handler Imports
const { syncInventory } = require('../handlers/syncHandler');
const { handleTameInteraction, handleMountComponentInteraction } = require('./mountComponentHandler');

// Utility Imports
const { submissionStore, saveSubmissionToStorage, deleteSubmissionFromStorage } = require('../utils/storage');
const { capitalizeFirstLetter, capitalizeWords } = require('../modules/formattingModule'); // Formatting utilities
const { calculateTokens, generateTokenBreakdown } = require('../utils/tokenUtils'); // Corrected imports

const { createArtSubmissionEmbed } = require('../embeds/mechanicEmbeds');

// ------------------- Create Action Row with Cancel Button -------------------
function getCancelButtonRow() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('cancel')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Danger)
    );
}

// ------------------- Create Confirm Button Row -------------------
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
    if (interaction.replied || interaction.deferred) return; // Prevent multiple interactions

    const userId = interaction.user.id;
    const submissionData = submissionStore.get(userId);
    const [action, characterId] = interaction.customId.split('|'); // Extract action and characterId

    if (action === 'sync-yes') {
        try {
            console.log(`Button clicked: ${interaction.customId}`); // Debug log

            // Notify the user that the sync has started
            await interaction.deferReply({ ephemeral: true });
            await interaction.editReply({
                content: '🔄 **Sync has initiated, this may take some time. Please wait...**',
            });

            // Fetch the character data
            const character = await fetchCharacterById(characterId);
            if (!character) {
                console.log(`Character not found: ${characterId}`); // Debug log
                await interaction.editReply({
                    content: '❌ Character not found.',
                });
                return;
            }

            console.log(`Character fetched: ${character.name}`); // Debug log
            console.log(`Starting syncInventory for ${character.name}`); // Debug log

            // Call the syncInventory function
            await syncInventory(character.name, interaction.user.id, interaction);
        } catch (error) {
            console.error('Error during sync-yes interaction:', error);

            // Edit the interaction to show an error
            await interaction.editReply({
                content: `❌ An error occurred while syncing: ${error.message}`,
            });
        }
    } else if (action === 'sync-no') {
        try {
            // Respond to the user that the sync was canceled
            await interaction.reply({
                content: '❌ Sync canceled.',
                ephemeral: true,
            });
        } catch (error) {
            console.error('Error handling sync-no interaction:', error);
        }
  
    
        
    } else if (action === 'confirm') {
        try {
            if (!submissionData) {
                await interaction.reply({
                    content: '❌ Submission data not found. Please try again.',
                    ephemeral: true,
                });
                return;
            }

            // Fetch user data for token tracker
            const user = await getUserById(userId);

            // ------------------- Token Calculation -------------------
            const { totalTokens } = calculateTokens(submissionData);
            const breakdown = generateTokenBreakdown({
                ...submissionData,
                finalTokenAmount: totalTokens,
            });

            // Update interaction with confirmation (No embed sent here)
            await interaction.update({
                content: '✅ **You have confirmed your submission!**\n\n' +
                '- A mod will review and approve it shortly.\n' +
                '- Tokens will be added to your tracker upon approval.\n' +
                '- The bot will DM you when your submission has been approved.',
                components: [],
            });

            // ------------------- Generate and Send Embed -------------------
            const embed = createArtSubmissionEmbed(submissionData, user, breakdown);

            // Ensure embed is only sent once
            if (!submissionData.embedSent) {

                const sentMessage = await interaction.channel.send({ embeds: [embed] });
                submissionData.messageUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${sentMessage.id}`;
                submissionStore.set(user.id, submissionData);
                saveSubmissionToStorage(submissionId, submissionData);

            }

            // Clean up submission data
            submissionStore.delete(userId);
        } catch (error) {
            console.error('Error processing confirmation:', error);
            await interaction.reply({
                content: '❌ **An error occurred while processing your submission. Please try again.**',
                ephemeral: true,
            });
        }
    } else if (interaction.customId === 'cancel') {
        // Fetch submission data
        const submissionData = submissionStore.get(userId);
    
        if (submissionData && submissionData.submissionId) {
            console.log(`Deleting submission from storage: ${submissionData.submissionId}`);
            deleteSubmissionFromStorage(submissionData.submissionId); // Remove from storage
        } else {
            console.warn('No submission data found for cancellation:', { userId });
        }
    
        // Clear in-memory submission data
        submissionStore.delete(userId);
    
        // Notify user
        await interaction.update({
            content: '❌ **Your submission has been canceled.**',
            components: [],
        });
    }
    
}

// ------------------- Handle Component Interactions -------------------
async function handleComponentInteraction(interaction) {
    console.log('Button clicked:', interaction.customId);

    try {
        // ------------------- Extract Action and Components -------------------
  const [action, characterId] = interaction.customId.split('|'); // Fixed line

  if (['sync-yes', 'sync-no'].includes(action)) {
    await handleButtonInteraction(interaction); // Handle sync buttons


        // ------------------- Mount-Specific Actions -------------------
  } else  if (['sneak', 'distract', 'corner', 'rush', 'glide'].includes(action)) {
            await handleMountComponentInteraction(interaction);  // Handle mount-specific actions
        } else if (action === 'tame') {
            await handleTameInteraction(interaction);  // Handle the tame button
        } 
        
        // ------------------- Handle Other Button Interactions -------------------
        else if (interaction.isButton()) {
            let message = '';

            // ------------------- Handle View Button -------------------
            if (action === 'view') {
                await connectToTinglebot();
                const character = await fetchCharacterById(characterId);

                if (!character) {
                    await interaction.reply({ content: '❌ Character not found.', ephemeral: true });
                    return;
                }

                // ------------------- Create Character Embed -------------------
                const embed = createCharacterEmbed(character);
                const itemNames = [
                    character.gearWeapon?.name,
                    character.gearShield?.name,
                    character.gearArmor?.head?.name,
                    character.gearArmor?.chest?.name,
                    character.gearArmor?.legs?.name,
                ].filter(Boolean);

                const itemDetails = await ItemModel.find({ itemName: { $in: itemNames } });

                // ------------------- Get Item Details -------------------
                const getItemDetail = (itemName) => {
                    const item = itemDetails.find(detail => detail.itemName === itemName);
                    return item ? `${item.emoji} ${item.itemName} [+${item.modifierHearts}]` : 'N/A';
                };

                const gearMap = {
                    head: character.gearArmor?.head ? `> ${getItemDetail(character.gearArmor.head.name)}` : '> N/A',
                    chest: character.gearArmor?.chest ? `> ${getItemDetail(character.gearArmor.chest.name)}` : '> N/A',
                    legs: character.gearArmor?.legs ? `> ${getItemDetail(character.gearArmor.legs.name)}` : 'N/A',
                    weapon: character.gearWeapon ? `> ${getItemDetail(character.gearWeapon.name)}` : 'N/A',
                    shield: character.gearShield ? `> ${getItemDetail(character.gearShield.name)}` : 'N/A',
                };

                // ------------------- Send Embed -------------------
                const gearEmbed = createCharacterGearEmbed(character, gearMap, 'all');
                await interaction.reply({ embeds: [embed, gearEmbed], ephemeral: true });

            } else {
                await handleButtonInteraction(interaction);  // Handling other button interactions
            }

        // ------------------- Select Menu Interactions -------------------
        } else if (interaction.isSelectMenu()) {
            await handleSelectMenuInteraction(interaction);

        // ------------------- Modal Submissions -------------------
        } else if (interaction.isModalSubmit()) {
            await handleModalSubmission(interaction);

        // ------------------- Other Actions (Getting Started, Commands List) -------------------
        } else {
            if (action === 'getting_started' || action === 'commands_list') {
                await handleHelpInteraction(interaction, action);
                return;
            }

            // ------------------- Fetch and Handle Character Actions -------------------
            await connectToTinglebot();
            if (characterId) {
                const character = await fetchCharacterById(characterId);

                if (!character) {
                    await interaction.reply({ content: '❌ **Character not found.**', ephemeral: true });
                    return;
                }

                // ------------------- Handle Job Selection -------------------
                if (action === 'job-select') {
                    await interaction.deferUpdate();

                    const previousJob = character.job;
                    const updatedJob = extra;

                    character.job = updatedJob;
                    await character.save();

                    const embed = createCharacterEmbed(character);
                    await interaction.editReply({
                        content: `✅ **${character.name}'s job has been updated from ${previousJob} to ${updatedJob}.**`,
                        embeds: [embed],
                        components: [],
                        ephemeral: true,
                    });

                // ------------------- Handle Job Page Navigation -------------------
                } else if (action === 'job-page') {
                    await interaction.deferUpdate();

                    const pageIndex = parseInt(extra, 10);
                    const jobs = getGeneralJobsPage(pageIndex);

                    const jobButtons = jobs.map(job =>
                        new ButtonBuilder()
                            .setCustomId(`job-select|${character._id}|${job}`)
                            .setLabel(job)
                            .setStyle(ButtonStyle.Primary)
                    );

                    const rows = [];
                    while (jobButtons.length) rows.push(new ActionRowBuilder().addComponents(jobButtons.splice(0, 5)));

                    const embedColor = getVillageColorByName('General') || '#00CED1';

                    const embed = new EmbedBuilder()
                        .setTitle('General Jobs')
                        .setDescription('Select a job from the buttons below:')
                        .setColor(embedColor);

                    const previousPageIndex = pageIndex - 1;
                    const nextPageIndex = pageIndex + 1;

                    const navigationButtons = [
                        new ButtonBuilder()
                            .setCustomId(`job-page|${character._id}|${previousPageIndex}`)
                            .setLabel('Previous')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(previousPageIndex < 1),
                        new ButtonBuilder()
                            .setCustomId(`job-page|${character._id}|${nextPageIndex}`)
                            .setLabel('Next')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(nextPageIndex > 2),
                    ];

                    const navigationRow = new ActionRowBuilder().addComponents(navigationButtons);
                    const components = [...rows, navigationRow];

                    await interaction.editReply({ embeds: [embed], components, ephemeral: true });
                }
            }
        }

    // ------------------- Error Handling -------------------
    } catch (error) {
        console.error('Error handling component interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Error handling interaction.', ephemeral: true });
        }
    }
}

// ------------------- Handle help interactions (buttons) -------------------
async function handleHelpInteraction(interaction, action) {
    try {
        const uniqueId = interaction.id;
        const gettingStartedEmbed = createGettingStartedEmbed();
        const commandsEmbed = createCommandsEmbed();
        const buttonsRow = createButtonsRow(uniqueId);

        if (action === 'getting_started') {
            await interaction.update({ embeds: [gettingStartedEmbed], components: [buttonsRow] });
        } else if (action === 'commands_list') {
            await interaction.update({ embeds: [commandsEmbed], components: [buttonsRow] });
        }
    } catch (error) {
        console.error('Error handling help interaction:', error);
    }
}

// ------------------- Exported Functions -------------------
module.exports = {
    handleComponentInteraction,
    handleButtonInteraction,
    getCancelButtonRow,
    getConfirmButtonRow,
    handleHelpInteraction
};
