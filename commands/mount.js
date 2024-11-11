// ------------------- Import standard libraries and external modules -------------------
const { SlashCommandBuilder } = require('@discordjs/builders'); // Slash command builder for Discord commands
const { EmbedBuilder } = require('discord.js'); // Discord.js Embed builder for rich content in responses

// ------------------- Import custom modules and handlers -------------------
const { getEncounterById } = require('../modules/mountModule'); // Module to retrieve encounter details by ID
const { proceedWithRoll } = require('../handlers/mountComponentHandler'); // Handler to proceed with rolling logic

// ------------------- Define and export the mount command -------------------
module.exports = {
    data: new SlashCommandBuilder()
        .setName('mount')
        .setDescription('Join or interact with an existing mount encounter')
        .addStringOption(option => 
            option.setName('encounterid')
                .setDescription('Enter the Encounter ID')
                .setRequired(true) // Required field for Encounter ID
        )
        .addStringOption(option => 
            option.setName('charactername')
                .setDescription('Enter the Character Name')
                .setRequired(true) // Required field for Character Name
                .setAutocomplete(true) // Enables autocomplete for character name
        ),

    // ------------------- Main execute function triggered by the mount command -------------------
    async execute(interaction) {
        // Extract options from the command
        const encounterId = interaction.options.getString('encounterid');
        const characterName = interaction.options.getString('charactername');

        // Retrieve encounter by ID
        const encounter = getEncounterById(encounterId);
        
        // Handle case when the encounter is not found
        if (!encounter) {
            await interaction.reply({
                content: '❌ **Encounter not found. Please check the Encounter ID and try again.**',
                ephemeral: true
            });
            return; // Exit if encounter is not found
        }

        // Proceed with rolling logic for the character in the encounter
        await proceedWithRoll(interaction, characterName, encounterId);
    },

    // ------------------- Autocomplete handler for character name input -------------------
    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);

        // Handle autocomplete when the user is focused on the 'charactername' option
        if (focusedOption.name === 'charactername') {
            await handleMountAutocomplete(interaction); // Function to handle character name suggestions
        }
    }
};

