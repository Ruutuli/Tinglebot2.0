// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const { fetchCharacterByNameAndUserId } = require('../database/characterService');
const { connectToTinglebot } = require('../database/connection');
const { authorizeSheets, appendSheetData } = require('../utils/googleSheetsUtils');
const { extractSpreadsheetId } = require('../utils/validation');
const Character = require('../models/CharacterModel');
const { createSetupInstructionsEmbed } = require('../embeds/instructionsEmbeds');

module.exports = {
  // ------------------- Command data definition -------------------
  data: new SlashCommandBuilder()
    .setName('testinventorysetup')
    .setDescription('Test if the inventory setup is correct')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('Character name')
        .setRequired(true)
        .setAutocomplete(true)),

  // ------------------- Execute command to test inventory setup -------------------
  async execute(interaction) {
    const characterName = interaction.options.getString('charactername');
    const userId = interaction.user.id;

    try {
      // ------------------- Ensure Mongoose connection before proceeding -------------------
      await connectToTinglebot();

      // ------------------- Fetch character by name and user ID -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        throw new Error(`Character with name **${characterName}** not found.`);
      }

      // ------------------- Get the inventory URL -------------------
      const inventoryUrl = character.inventory;
      const spreadsheetId = extractSpreadsheetId(inventoryUrl);

      if (!spreadsheetId) {
        await sendSetupInstructions(interaction, true, character._id, character.name, inventoryUrl);
        return;
      }

      // ------------------- Authorize Google Sheets API -------------------
      const auth = await authorizeSheets();

      // ------------------- Format the current date and time -------------------
      const dateTimeNow = new Date().toLocaleString('en-US', {
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
      });

      const testMessage = `✅ ${character.name} setup has been successfully tested on ${dateTimeNow}.`;

      // ------------------- Append test message to Google Sheets -------------------
      await appendSheetData(auth, spreadsheetId, 'loggedInventory', [[testMessage]]);

      // ------------------- Reply to the interaction with a confirmation message -------------------
      await interaction.reply({
        content: `✅ **Success!**\n\n🛠️ **Inventory setup for** **${character.name}** **has been successfully tested.**\n\n📄 **See your inventory [here](<${inventoryUrl}>)**.\n\n🔄 **Once ready, use the** \`/syncinventory\` **command to sync your character's inventory.**`,
        ephemeral: true
      });

    } catch (error) {
      let errorMessage = 'An unexpected error occurred while executing this command. Please try again later.';

      // ------------------- Handle specific error cases -------------------
      switch (true) {
        case error.name === 'ValidationError':
          errorMessage = handleValidationError(error);
          break;
        case error.message.includes('Invalid URL'):
          errorMessage = 'The provided URL is not a valid Google Sheets URL. Please check and try again.';
          break;
        case error.message.includes('Invalid Google Sheets URL') || error.message.includes('Requested entity was not found'):
          await sendSetupInstructions(interaction, error.message.includes('Invalid Google Sheets URL'), character._id, characterName, inventoryUrl);
          return;
        case error.message.includes('404'):
          errorMessage = 'The Google Sheets document could not be found. Please check the URL and try again.';
          break;
        case error.message.includes('403'):
          errorMessage = 'Access to the Google Sheets document is forbidden. Please ensure it is shared with the bot\'s service account email.';
          break;
        case error.message.includes('Inventory URL array is empty or not valid'):
          errorMessage = 'The inventory URL array is empty or not valid. Please ensure you have a valid Google Sheets URL in your inventory.';
          break;
        case error.message.includes('Cast to Number failed'):
          errorMessage = '⚠️ **Error:** The value entered is not a valid number. Please enter a numeric value for the number of hearts or stamina.';
          break;
        case error.message.includes('Google Sheets') || error.message.includes('Inventory'):
          errorMessage = handleGoogleSheetsError(error);
          await sendSetupInstructions(interaction, false, character._id, characterName, inventoryUrl);
          return;
        default:
          errorMessage = `An unexpected error occurred: ${error.message}`;
      }

      await respondToInteraction(interaction, errorMessage);
      logErrorDetails(error);
    }
  }
};

// ------------------- Additional helper functions -------------------

// Function to send setup instructions embed
async function sendSetupInstructions(interaction, isInvalidUrl, characterId, characterName, googleSheetsUrl) {
  const embed = createSetupInstructionsEmbed(characterName, googleSheetsUrl, isInvalidUrl ? 'The provided URL is not valid.' : 'The Google Sheets document could not be found.');
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Function to handle validation errors
function handleValidationError(error) {
  return 'Validation error occurred.';
}

// Function to handle Google Sheets related errors
function handleGoogleSheetsError(error) {
  return 'Google Sheets error occurred.';
}

// Function to respond to interaction with a message
async function respondToInteraction(interaction, message) {
  await interaction.reply({
    content: message,
    ephemeral: true
  });
}

// Function to log error details
function logErrorDetails(error) {
  console.error('❌ Error details:', error);
}

