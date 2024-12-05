// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const { fetchCharacterByNameAndUserId, fetchCharactersByUserId } = require('../database/characterService');
const { connectToTinglebot } = require('../database/connection');
const { isValidGoogleSheetsUrl, extractSpreadsheetId } = require('../utils/validation');
const { createSyncEmbed, createSetupInstructionsEmbed } = require('../embeds/instructionsEmbeds');
const { syncInventory } = require('../handlers/syncHandler');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ------------------- Define the /syncinventory command -------------------
const data = new SlashCommandBuilder()
    .setName('syncinventory')
    .setDescription('Sync your character\'s inventory from Google Sheets to the database')
    .addStringOption(option =>
        option.setName('charactername')
            .setDescription('Character name')
            .setRequired(true)
            .setAutocomplete(true));

module.exports = {
    data,

    // ------------------- Execute function for the /syncinventory command -------------------
    async execute(interaction) {
        if (interaction.isCommand()) {
            const characterName = interaction.options.getString('charactername');
            const userId = interaction.user.id;

            try {
                // ------------------- Ensure MongoDB connection -------------------
                await connectToTinglebot();

                // ------------------- Fetch character by name and user ID -------------------
                const character = await fetchCharacterByNameAndUserId(characterName, userId);
                if (!character) {
                    throw new Error(`Character with name ${characterName} not found.`);
                }

                // ------------------- Ensure inventory is properly retrieved -------------------
                const inventoryUrl = character.inventory;

                // ------------------- Validate Google Sheets URL -------------------
                if (!isValidGoogleSheetsUrl(inventoryUrl)) {
                    const setupEmbed = createSetupInstructionsEmbed(
                        character.name, 
                        inventoryUrl, 
                        'Invalid Google Sheets URL. Please check the URL and try again.'
                    );
                    await interaction.reply({ embeds: [setupEmbed], ephemeral: true });
                    return;
                }

                const spreadsheetId = extractSpreadsheetId(inventoryUrl);

                // ------------------- Check if inventory is already synced -------------------
                if (character.inventorySynced) {
                    await interaction.reply({
                        content: `🔄 **Inventory for ${character.name} has already been synced and cannot be synced again.**`,
                        ephemeral: true
                    });
                    return;
                }

                // ------------------- Create sync embed -------------------
                const syncEmbed = createSyncEmbed(character.name, inventoryUrl);

                // ------------------- Add Yes and No buttons for user confirmation -------------------
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`sync-yes|${character._id}`)
                        .setLabel('Yes')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`sync-no|${character._id}`)
                        .setLabel('No')
                        .setStyle(ButtonStyle.Danger)
                );

                console.log(`Buttons created with IDs: sync-yes|${character._id}, sync-no|${character._id}`);

                // ------------------- Reply with sync embed and buttons -------------------
                await interaction.reply({ embeds: [syncEmbed], components: [row], ephemeral: true });
                console.log('Reached here')
            } catch (error) {
                // ------------------- Handle any errors -------------------
                await interaction.reply({ content: `❌ An error occurred while syncing inventory. Please try again later.`, ephemeral: true });
                console.log(error)
            }
        }
    },

    // ------------------- Autocomplete function for character names -------------------
    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'charactername') {
            const userId = interaction.user.id;

            try {
                // ------------------- Ensure MongoDB connection -------------------
                await connectToTinglebot();
                const characters = await fetchCharactersByUserId(userId);

                // ------------------- Filter characters that haven't synced their inventory -------------------
                const choices = characters
                    .filter(character => !character.inventorySynced)
                    .map(character => ({
                        name: character.name,
                        value: character.name
                    }));

                // ------------------- Filter choices based on user input and limit to 25 results -------------------
                const filteredChoices = choices.filter(choice =>
                    choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())
                ).slice(0, 25);

                // ------------------- Respond with filtered choices -------------------
                await interaction.respond(filteredChoices);

            } catch (error) {
                // ------------------- Respond with empty array on error -------------------
                await interaction.respond([]);
            }
        }
    }
};

