// // ============================================================================
// // ---- Imports ----
// // ============================================================================

// // ---- Discord.js Components ----
// const { SlashCommandBuilder } = require('@discordjs/builders');

// // ---- Database Services ----
// const { fetchCharacterByNameAndUserId } = require('../../../shared/database/db');

// // ---- Custom Modules ----
// const { handleInteractionError } = require('../../../shared/utils/globalErrorHandler');
// const { capitalizeVillageName } = require('../../../shared/utils/stringUtils');
// const { checkInventorySync } = require('../../../shared/utils/characterUtils');
// const { getEncounterById } = require('../../modules/mountModule');
// const { proceedWithRoll, handleViewMount } = require('../../handlers/mountComponentHandler');
// const { handleMountAutocomplete } = require('../../handlers/autocompleteHandler');

// // ============================================================================
// // ---- Command Definition ----
// // ============================================================================

// module.exports = {
//     data: new SlashCommandBuilder()
//         .setName('mount')
//         .setDescription('Manage or view mount details')
//         .addSubcommand(subcommand =>
//             subcommand
//                 .setName('encounter')
//                 .setDescription('Join or interact with an existing mount encounter')
//                 .addStringOption(option =>
//                     option.setName('encounterid')
//                         .setDescription('Enter the Encounter ID')
//                         .setRequired(true)
//                 )
//                 .addStringOption(option =>
//                     option.setName('charactername')
//                         .setDescription('Enter the Character Name')
//                         .setRequired(true)
//                         .setAutocomplete(true)
//                 )
//         )
//         .addSubcommand(subcommand =>
//             subcommand
//                 .setName('view')
//                 .setDescription('View your mount\'s details')
//                 .addStringOption(option =>
//                     option.setName('charactername')
//                         .setDescription('Enter the character\'s name')
//                         .setRequired(true)
//                         .setAutocomplete(true)
//                 )
//         ),

//     // ============================================================================
//     // ---- Command Handlers ----
//     // ============================================================================

//     // ---- Function: execute ----
//     // Main command handler that routes to appropriate subcommand
//     async execute(interaction) {
//         const subcommand = interaction.options.getSubcommand();

//         try {
//             switch (subcommand) {
//                 case 'encounter':
//                     await handleEncounter(interaction);
//                     break;
//                 case 'view':
//                     await handleViewMount(interaction);
//                     break;
//                 default:
//                     await interaction.reply({
//                         content: '❌ **Invalid subcommand. Please use `/mount encounter` or `/mount view`.**',
//                         ephemeral: true,
//                     });
//             }
//         } catch (error) {
//             console.error('[mount.js]: ❌ Error in execute:', error);
//             handleInteractionError(error, 'mount.js');
//             await interaction.reply({
//                 content: '❌ **An error occurred while processing your request. Please try again later.**',
//                 ephemeral: true,
//             });
//         }
//     },

//     // ============================================================================
//     // ---- Autocomplete Handler ----
//     // ============================================================================
//     async autocomplete(interaction) {
//         const { handleAutocomplete } = require('../../handlers/autocompleteHandler');
//         await handleAutocomplete(interaction);
//     }
// }
// // ============================================================================
// // ---- Helper Functions ----
// // ============================================================================

// // ---- Function: handleEncounter ----
// // Processes mount encounter requests and validates character eligibility
// async function handleEncounter(interaction) {
//     const encounterId = interaction.options.getString('encounterid');
//     const characterName = interaction.options.getString('charactername');

//     try {
//         // Validate encounter exists
//         const encounter = getEncounterById(encounterId);
//         if (!encounter) {
//             return await interaction.reply({
//                 content: '❌ **Encounter not found. Please check the Encounter ID and try again.**',
//                 ephemeral: true,
//             });
//         }

//         // Fetch and validate character
//         const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
//         if (!character) {
//             return await interaction.reply({
//                 content: `❌ **Character "${characterName}" not found or doesn't belong to you.**`,
//                 ephemeral: true,
//             });
//         }

//         // Check mount status
//         if (character.mount) {
//             return await interaction.reply({
//                 content: `❌ **Your character "${character.name}" already has a registered mount and cannot participate in another mount encounter.**`,
//                 ephemeral: true,
//             });
//         }

//         // Validate inventory sync
//         try {
//             await checkInventorySync(character);
//         } catch (error) {
//             return await interaction.reply({
//                 content: error.message,
//                 ephemeral: true
//             });
//         }

//         // Validate village location
//         if (character.currentVillage?.toLowerCase() !== encounter.village?.toLowerCase()) {
//             return await interaction.reply({
//                 content: `❌ **${character.name} is currently located in ${capitalizeVillageName(character.currentVillage) || 'an unknown location'}, but this encounter is in ${capitalizeVillageName(encounter.village)}. Characters must be in the correct village to roll!**`,
//                 ephemeral: true,
//             });
//         }

//         // Proceed with mount encounter
//         await proceedWithRoll(interaction, characterName, encounterId);

//     } catch (error) {
//         console.error('[mount.js]: ❌ Error in handleEncounter:', error);
//         handleInteractionError(error, 'mount.js');
//         await interaction.reply({
//             content: '❌ **An error occurred while processing your request. Please try again later.**',
//             ephemeral: true,
//         });
//     }
// }