// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const { handleError } = require('../../utils/globalErrorHandler.js');
const { connectToTinglebot, fetchCharacterByNameAndUserId } = require('../../database/db.js');
const { authorizeSheets, appendSheetData, getSheetIdByTitle, readSheetData, validateInventorySheet } = require('../../utils/googleSheetsUtils.js');
const { extractSpreadsheetId } = require('../../utils/validation.js');
const { createSetupInstructionsEmbed } = require('../../embeds/embeds.js');

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
      console.log('✅ Connected to Tinglebot database.');

      // ------------------- Fetch character by name and user ID -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        throw new Error(`Character with name "${characterName}" not found.`);
      }
      console.log(`✅ Character "${characterName}" found.`);

      // ------------------- Get the inventory URL -------------------
      const inventoryUrl = character.inventory;
      const spreadsheetId = extractSpreadsheetId(inventoryUrl);

      if (!spreadsheetId) {
        console.error('❌ Invalid Google Sheets URL detected.');
        await sendSetupInstructions(interaction, 'invalid_url', character._id, characterName, inventoryUrl);
        return;
      }
      console.log('✅ Spreadsheet ID extracted successfully.');

      // ------------------- Authorize Google Sheets API -------------------
      const auth = await authorizeSheets();
      console.log('✅ Authorized Google Sheets API.');

      // ------------------- Get the sheet ID for "loggedInventory" -------------------
      const sheetId = await getSheetIdByTitle(auth, spreadsheetId, 'loggedInventory');
      if (!sheetId) {
        console.error('❌ "loggedInventory" sheet not found in the spreadsheet.');
        await sendSetupInstructions(interaction, 'missing_sheet', character._id, characterName, inventoryUrl);
        return;
      }
      console.log('✅ "loggedInventory" sheet ID retrieved successfully.');

      // ------------------- Check for missing headers -------------------
      const expectedHeaders = [
        'Character Name', 'Item Name', 'Qty of Item', 'Category', 'Type',
        'Subtype', 'Obtain', 'Job', 'Perk', 'Location', 'Link', 'Date/Time', 'Confirmed Sync'
      ];
      // ✅ Check that the sheet headers exist
      const sheetData = await readSheetData(auth, spreadsheetId, 'loggedInventory!A1:M1');
      if (!sheetData || !expectedHeaders.every(header => sheetData[0]?.includes(header))) {
        console.error('❌ Missing or incorrect headers in "loggedInventory" sheet.');
        await sendSetupInstructions(interaction, 'missing_headers', character._id, characterName, inventoryUrl);
        return;
      }
      console.log('✅ Headers in "loggedInventory" sheet are correct.');

      // ✅ ADD THIS NEXT:
      const validationResult = await validateInventorySheet(inventoryUrl, characterName);
      if (!validationResult.success) {
        console.error('❌ Validation failed after header check.');
        await sendSetupInstructions(interaction, 'invalid_inventory', character._id, characterName, inventoryUrl, validationResult.message);
        return;
      }
      console.log('✅ Inventory sheet contains at least one valid item.');


      // ------------------- Reply to the interaction with a confirmation message -------------------
      await interaction.reply({
        content: `✅ **Success!**\n\n🛠️ **Inventory setup for** **${character.name}** **has been successfully tested.**\n\n📄 **See your inventory [here](<${inventoryUrl}>)**.\n\n🔄 **Once ready, use the** \`/syncinventory\` **command to sync your character's inventory.**`,
        ephemeral: true
      });
      console.log('✅ Interaction reply sent to the user.');

    } catch (error) {
    handleError(error, 'testinventorysetup.js');

      console.error('❌ Error details:', error);

      // ------------------- Handle specific error cases -------------------
      let errorMessage;
      switch (true) {
        case error.message.includes('Character with name'):
          errorMessage = `❌ **Error:** ${error.message}`;
          break;
        case error.message.includes('invalid_url'):
          errorMessage = '❌ **Error:** The provided URL is not valid. Please check and try again.';
          break;
        case error.message.includes('missing_sheet'):
          errorMessage = '❌ **Error:** The Google Sheets document is missing the required "loggedInventory" tab.';
          break;
        case error.message.includes('missing_headers'):
          errorMessage = '❌ **Error:** The "loggedInventory" sheet is missing the required headers.';
          break;
        case error.message.includes('403'):
          errorMessage = '❌ **Error:** Access to the Google Sheets document is forbidden. Please ensure it is shared with the bot\'s service account email.';
          break;
        case error.message.includes('404'):
          errorMessage = '❌ **Error:** The Google Sheets document could not be found. Please check the URL and try again.';
          break;
        default:
          errorMessage = `❌ **Error:** An unexpected error occurred: ${error.message}`;
      }

      await interaction.reply({
        content: errorMessage,
        ephemeral: true
      });
    }
  }
};

// ------------------- Helper function to send setup instructions -------------------
async function sendSetupInstructions(interaction, errorType, characterId, characterName, googleSheetsUrl, customMessage = null) {
  const errorMessages = {
    invalid_url: 'The provided URL is not valid.',
    missing_sheet: 'The Google Sheets document is missing the required "loggedInventory" tab.',
    missing_headers: 'The "loggedInventory" sheet is missing the required headers.',
    invalid_inventory: 'Your inventory is missing required starter items or is improperly formatted.',
  };

  const errorMessage = customMessage || errorMessages[errorType] || 'An unexpected error occurred. Please check your setup.';

  const embed = await createSetupInstructionsEmbed(characterName, googleSheetsUrl, errorMessage);

  await interaction.reply({ embeds: [embed], ephemeral: true });
  console.log(`🔄 Setup instructions sent to the user: ${errorMessage}`);
}
