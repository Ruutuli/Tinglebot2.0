const { handleError } = require('../utils/globalErrorHandler');

// ------------------- Import standard libraries and external modules -------------------
const { SlashCommandBuilder } = require('@discordjs/builders'); // Slash command builder for Discord commands
const { EmbedBuilder } = require('discord.js'); // Discord.js Embed builder for rich content in responses

// ------------------- Import custom modules and handlers -------------------
const { getEncounterById } = require('../modules/mountModule'); // Module to retrieve encounter details by ID
const { proceedWithRoll,handleViewMount  } = require('../handlers/mountComponentHandler'); // Handler to proceed with rolling logic
const { fetchCharacterByNameAndUserId } = require('../database/characterService'); // Import fetchCharacterByNameAndUserId



// ------------------- Define and export the mount command -------------------
module.exports = {
    data: new SlashCommandBuilder()
        .setName('mount')
        .setDescription('Manage or view mount details')
        .addSubcommand(subcommand =>
            subcommand
                .setName('encounter')
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
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View your mount\'s details')
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Enter the character\'s name')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        ),

    // ------------------- Main execute function triggered by the mount command -------------------
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'encounter') {
            await handleEncounter(interaction);
        } else if (subcommand === 'view') {
            await handleViewMount(interaction); // Call handleViewMount from mountComponentHandler
        } else {
            await interaction.reply({
                content: '❌ **Invalid subcommand. Please use `/mount encounter` or `/mount view`.**',
                ephemeral: true,
            });
        }
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

// ------------------- Handle Encounter Subcommand -------------------
async function handleEncounter(interaction) {
    const encounterId = interaction.options.getString('encounterid');
    const characterName = interaction.options.getString('charactername');

    // Retrieve encounter by ID
    const encounter = getEncounterById(encounterId);

    // Handle case when the encounter is not found
    if (!encounter) {
        await interaction.reply({
            content: '❌ **Encounter not found. Please check the Encounter ID and try again.**',
            ephemeral: true,
        });
        return; // Exit if encounter is not found
    }

    // Fetch character information
    try {
        const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
        if (!character) {
            return interaction.reply({
                content: `❌ **Character "${characterName}" not found or doesn't belong to you.**`,
                ephemeral: true,
            });
        }

        // Check if the character already has a registered mount
        if (character.mount) {
            return interaction.reply({
                content: `❌ **Your character "${character.name}" already has a registered mount and cannot participate in another mount encounter.**`,
                ephemeral: true,
            });
        }

        // Check if the character's inventory has been synced
        if (!character.inventorySynced) {
            return interaction.reply({
                content: `❌ **You cannot use the mount command because "${character.name}"'s inventory is not set up yet. Please use the </testinventorysetup:1306176790095728732> and then </syncinventory:1306176789894266898> commands to initialize the inventory.**`,
                ephemeral: true,
            });
        }

        // Proceed with rolling logic for the character in the encounter
        await proceedWithRoll(interaction, characterName, encounterId);
    } catch (error) {
    handleError(error, 'mount.js');

        console.error('[mount.js]: ❌ Error fetching character or proceeding with roll:', error);
        await interaction.reply({
            content: '❌ **An error occurred while processing your request. Please try again later.**',
            ephemeral: true,
        });
    }
}