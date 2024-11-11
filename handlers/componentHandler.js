// ------------------- Combined Component and Button Handler -------------------
// Handles button interactions like confirm/cancel, component interactions, and template command

// ------------------- Imports -------------------
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { fetchCharacterById, getCharactersInVillage } = require('../database/characterService');
const { connectToTinglebot } = require('../database/connection');
const { createCharacterEmbed, createCharacterGearEmbed } = require('../embeds/characterEmbeds');
const ItemModel = require('../models/ItemModel');
const { syncInventory } = require('../handlers/syncHandler');
const { createGettingStartedEmbed, createCommandsEmbed, createButtonsRow } = require('../commands/help');
const { getGeneralJobsPage } = require('../modules/jobsModule');
const { getVillageColorByName } = require('../modules/locationsModule');
const { handleTameInteraction, handleMountComponentInteraction } = require('./mountComponentHandler');  // Import the necessary handlers


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
    // Safeguard to ensure interaction isn't processed multiple times
    if (interaction.replied || interaction.deferred) {
        return; // Exit if already handled
    }

    // Handle confirmation or cancellation buttons
    if (interaction.customId === 'confirm') {
        await interaction.update({
            content: '✅ Your submission has been confirmed!',
            components: []
        });
    } else if (interaction.customId === 'cancel') {
        await interaction.update({
            content: '❌ Your submission has been canceled.',
            components: []
        });
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
