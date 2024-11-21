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
const { submissionStore } = require('../utils/storage'); 
const { capitalizeFirstLetter, capitalizeWords } = require('../modules/formattingModule'); // Formatting utilities

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
// Handles button interactions such as Confirm and Cancel
async function handleButtonInteraction(interaction) {
    if (interaction.replied || interaction.deferred) return; // Prevent multiple interactions

    const userId = interaction.user.id;
    const submissionData = submissionStore.get(userId);

    if (interaction.customId === 'confirm') {
        try {
            // Fetch user data for token tracker
            const user = await getUserById(userId);

            // Format the token breakdown as a code block
            const breakdownMessage = `
\`\`\`
${submissionData.baseSelections.map(base => `${capitalizeFirstLetter(base)} (15 × ${submissionData.characterCount})`).join('\n')}
× ${submissionData.typeMultiplierSelections.map(multiplier => `${capitalizeFirstLetter(multiplier)} (1.5 × ${submissionData.characterCount})`).join('\n× ')}
× Fullcolor (${submissionData.productMultiplierValue} × 1)
${submissionData.addOnsApplied.length > 0 ? submissionData.addOnsApplied.map(addOn => `+ ${capitalizeFirstLetter(addOn)} (1.5 × 1)`).join('\n') : ''}
---------------------
= ${submissionData.finalTokenAmount} Tokens
\`\`\`
`.trim();

            // Post the confirmation message
            await interaction.update({
                content: '✅ Your submission has been confirmed!',
                components: [],
            });

            // Post the embed with submission details
            if (submissionData) {
                const embed = new EmbedBuilder()
                    .setColor(0x0099ff)
                    .setTitle('🎨 Art Submission')
                    .addFields(
                        { name: 'Art Title', value: submissionData.fileName, inline: false },
                        { name: 'User', value: `<@${submissionData.userId}>`, inline: false },
                        {
                            name: 'Upload Link',
                            value: submissionData.fileUrl ? `[View Uploaded Image](${submissionData.fileUrl})` : 'N/A',
                            inline: false,
                        },
                        { name: 'Quest/Event', value: submissionData.questEvent || 'N/A', inline: false },
                        { name: 'Quest/Event Bonus', value: submissionData.questBonus || 'N/A', inline: false },
                        {
                            name: 'Token Tracker Link',
                            value: user.tokenTracker ? `[Token Tracker](${user.tokenTracker})` : 'N/A',
                            inline: false,
                        },
                        { name: 'Token Calculation', value: breakdownMessage, inline: false }
                    )
                    .setImage(submissionData.fileUrl)
                    .setTimestamp()
                    .setFooter({ text: 'Art Submission System' });

                await interaction.channel.send({ embeds: [embed] }); // Post the embed in the same channel
            }
        } catch (error) {
            console.error('Error fetching user data or posting embed:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Error processing submission. Please try again later.', ephemeral: true });
            }
        }
    } else if (interaction.customId === 'cancel') {
        // Handle cancellation
        await interaction.update({
            content: '❌ Your submission has been canceled.',
            components: [],
        });

        // Clear submission data if needed
        submissionStore.delete(userId);
    }
}
 
// ------------------- Handle Component Interactions -------------------
async function handleComponentInteraction(interaction) {
    console.log('Button clicked:', interaction.customId);

    try {
        // ------------------- Extract Action and Components -------------------
  const [action, characterId] = interaction.customId.split('|'); // Fixed line

        // ------------------- Mount-Specific Actions -------------------
        if (['sneak', 'distract', 'corner', 'rush', 'glide'].includes(action)) {
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
