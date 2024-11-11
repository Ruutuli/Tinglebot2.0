// ------------------- Delete Character Command Module -------------------
// This module handles the deletion of a character, including database record removal and inventory sheet cleanup.

// ------------------- Import Section -------------------
// Grouped based on third-party and local module imports
const { SlashCommandBuilder } = require('@discordjs/builders'); // Discord.js for building slash commands
const { connectToTinglebot, connectToInventories } = require('../database/connection'); // Database connections
const { 
  fetchCharacterByNameAndUserId, 
  deleteCharacterById, 
  deleteCharacterInventoryCollection 
} = require('../database/characterService'); // Character-related database services
const { deleteInventorySheetData } = require('../utils/googleSheetsUtils'); // Google Sheets handling for deleting inventory data
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation'); // Validation utilities for Google Sheets URL

// ------------------- Command Definition -------------------
// Define the slash command for deleting a character
module.exports = {
  data: new SlashCommandBuilder()
    .setName('deletecharacter')
    .setDescription('Delete a character')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character to delete')
        .setRequired(true)
        .setAutocomplete(true)),

  // ------------------- Command Execution Logic -------------------
  // Handles the execution of the character deletion
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const characterName = interaction.options.getString('charactername'); // Get the character name input
      const userId = interaction.user.id; // Get the ID of the user who issued the command

      // Connect to the Tinglebot database
      await connectToTinglebot(); 

      // Fetch the character by name and user ID, ensuring the character belongs to the user
      const character = await fetchCharacterByNameAndUserId(characterName, userId);
      if (!character) {
        await interaction.editReply({ 
          content: `❌ **Character not found**: **${characterName}** does not exist or does not belong to you.`, 
          ephemeral: true 
        });
        return;
      }

      // ------------------- Inventory Deletion Logic -------------------
      // If the character has a valid Google Sheets inventory, delete it
      if (character.inventory && isValidGoogleSheetsUrl(character.inventory)) {
        try {
          const spreadsheetId = extractSpreadsheetId(character.inventory);
          await deleteInventorySheetData(spreadsheetId, characterName); // Delete inventory data from Google Sheets
        } catch (error) {
          console.error(`❌ Failed to delete inventory data for character ${characterName}:`, error);
        }
      }

      // Connect to the inventory database and delete the character's inventory collection
      await connectToInventories(); 
      await deleteCharacterInventoryCollection(character.name); // Delete inventory collection from MongoDB

      // Delete the character from the database
      await deleteCharacterById(character._id); 
      await interaction.editReply({ 
        content: `✅ **Character deleted**: **${characterName}** has been successfully removed.`, 
        ephemeral: true 
      });
    } catch (error) {
      await interaction.editReply({ 
        content: `❌ **An error occurred while deleting the character**: ${error.message}`, 
        ephemeral: true 
      });
    }
  },

  // ------------------- Autocomplete Handler -------------------
  // Provides autocomplete for character names during the delete command
  async autocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true); // Get the focused option for autocomplete
      const userId = interaction.user.id; // Get the ID of the user for filtering character names

      // Autocomplete for character name input
      if (focusedOption.name === 'charactername') {
        const characters = await fetchCharactersByUserId(userId); // Fetch characters belonging to the user
        const choices = characters.map(character => ({
          name: character.name,
          value: character.name
        }));

        // Filter choices based on the user input, limit to 25 results
        const filteredChoices = focusedOption.value === ''
          ? choices.slice(0, 25)
          : choices.filter(choice => choice.name.toLowerCase().includes(focusedOption.value.toLowerCase())).slice(0, 25);

        await interaction.respond(filteredChoices); // Send the filtered results
      }
    } catch (error) {
      await interaction.respond([]); // In case of an error, respond with an empty array
    }
  }
};
