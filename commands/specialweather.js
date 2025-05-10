// ============================================================================
// 🌤️ Special Weather Command
// Allows characters to gather special items during special weather conditions
// ============================================================================

// ------------------- Discord.js Components -------------------
const { SlashCommandBuilder } = require('discord.js');

// ------------------- Database Services -------------------
const { fetchCharacterByNameAndUserId, fetchAllItems } = require('../database/db.js');

// ------------------- Modules -------------------
const { createWeightedItemList } = require('../modules/rngModule.js');
const { handleError } = require('../utils/globalErrorHandler.js');
const { addItemInventoryDatabase } = require('../utils/inventoryUtils.js');
const { authorizeSheets, safeAppendDataToSheet } = require('../utils/googleSheetsUtils.js');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation.js');
const { getCurrentWeather } = require('../modules/weatherModule.js');
const { v4: uuidv4 } = require('uuid');

// ------------------- Command Definition -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('specialweather')
    .setDescription('Gather special items during special weather conditions')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true)),

  // ------------------- Command Execution Logic -------------------
  async execute(interaction) {
    try {
      await interaction.deferReply();

      const characterName = interaction.options.getString('charactername');
      const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
      
      if (!character) {
        await interaction.editReply({
          content: `❌ **Character ${characterName} not found or does not belong to you.**`,
        });
        return;
      }

      // Check if character is KOed
      if (character.isKO) {
        await interaction.editReply({
          content: `❌ **${character.name} is currently KOed and cannot gather.**\n💤 **Let them rest and recover before gathering again.**`,
          ephemeral: true,
        });
        return;
      }

      // Check if character is debuffed
      if (character.debuff?.active) {
        const debuffEndDate = new Date(character.debuff.endDate);
        const unixTimestamp = Math.floor(debuffEndDate.getTime() / 1000);
        await interaction.editReply({
          content: `❌ **${character.name} is currently debuffed and cannot gather.**\n🕒 **Debuff Expires:** <t:${unixTimestamp}:F>`,
          ephemeral: true,
        });
        return;
      }

      // Get current weather for the village
      const currentVillage = character.currentVillage;
      const weather = await getCurrentWeather(currentVillage);
      
      if (!weather || !weather.special) {
        await interaction.editReply({
          content: `❌ **There is no special weather in ${currentVillage} right now.**\n✨ **Special weather is required to use this command.**`,
        });
        return;
      }

      // Get special weather items
      const items = await fetchAllItems();
      const specialWeatherItems = items.filter(item => 
        item.specialWeather && 
        item[currentVillage.toLowerCase()]
      );

      if (specialWeatherItems.length === 0) {
        await interaction.editReply({
          content: `❌ **No special items available in ${currentVillage} during ${weather.special.label}.**`,
        });
        return;
      }

      // Select and gather item
      const weightedItems = createWeightedItemList(specialWeatherItems);
      const randomItem = weightedItems[Math.floor(Math.random() * weightedItems.length)];
      const quantity = 1;

      // Add item to inventory
      await addItemInventoryDatabase(
        character._id,
        randomItem.itemName,
        quantity,
        randomItem.category.join(', '),
        randomItem.type.join(', '),
        interaction
      );

      // Sync with Google Sheets if available
      const inventoryLink = character.inventory || character.inventoryLink;
      if (typeof inventoryLink === 'string' && isValidGoogleSheetsUrl(inventoryLink)) {
        const spreadsheetId = extractSpreadsheetId(inventoryLink);
        const auth = await authorizeSheets();
        const range = 'loggedInventory!A2:M';
        const uniqueSyncId = uuidv4();
        const formattedDateTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
        const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;
        const values = [[
          character.name,
          randomItem.itemName,
          quantity.toString(),
          randomItem.category.join(', '),
          randomItem.type.join(', '),
          randomItem.subtype.join(', '),
          'Special Weather Gathering',
          character.job,
          '',
          character.currentVillage,
          interactionUrl,
          formattedDateTime,
          uniqueSyncId,
        ]];
        await safeAppendDataToSheet(inventoryLink, character, range, values);
      }

      // Create success message
      const successMessage = `✨ **${character.name} found something special during ${weather.special.label}!**\n\n` +
        `**Item Gathered:** ${randomItem.itemName}\n` +
        `**Quantity:** ${quantity}\n` +
        `**Special Weather:** ${weather.special.emoji} ${weather.special.label}\n` +
        `**Location:** ${currentVillage}`;

      await interaction.editReply({
        content: successMessage,
      });

    } catch (error) {
      handleError(error, 'specialweather.js');
      console.error(`[specialweather.js]: Error during special weather gathering:`, error);
      await interaction.editReply({
        content: error.message || `⚠️ **An error occurred during special weather gathering.**`,
      });
    }
  },
}; 