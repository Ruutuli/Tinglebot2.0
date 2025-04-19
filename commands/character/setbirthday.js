// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler');
const { fetchCharacterByNameAndUserId, fetchCharactersByUserId } = require('../../database/characterService');
const { connectToTinglebot } = require('../../database/connection');

module.exports = {
  // ------------------- Command data definition -------------------
  data: new SlashCommandBuilder()
    .setName('setbirthday')
    .setDescription('Set the birthday of a character')
    .addStringOption(option =>
      option.setName('charactername')
        .setDescription('The name of the character')
        .setRequired(true)
        .setAutocomplete(true))
    .addStringOption(option =>
      option.setName('birthday')
        .setDescription('The birthday in MM-DD format')
        .setRequired(true)),

  // ------------------- Execute command to set the birthday of a character -------------------
  async execute(interaction) {
    try {
      const characterName = interaction.options.getString('charactername');
      const birthday = interaction.options.getString('birthday');
      const userId = interaction.user.id;

      // ------------------- Validate the date format (MM-DD) -------------------
      if (!/^\d{2}-\d{2}$/.test(birthday)) {
        return interaction.reply({ content: '❌ Invalid date format. Please provide the birthday in **MM-DD** format.', ephemeral: true });
      }

      // ------------------- Connect to the Tinglebot database -------------------
      await connectToTinglebot();

      // ------------------- Fetch the character by name and user ID -------------------
      const character = await fetchCharacterByNameAndUserId(characterName, userId);

      // ------------------- Handle character not found -------------------
      if (!character) {
        await interaction.reply({ content: `❌ Character **${characterName}** not found or does not belong to you.`, ephemeral: true });
        return;
      }

      // ------------------- Set the character's birthday and save changes -------------------
      character.birthday = birthday;
      await character.save();

      // ------------------- Send confirmation message -------------------
      await interaction.reply({ content: `🎂 **${character.name}'s** birthday has been set to **${birthday}**.`, ephemeral: true });

    } catch (error) {
    handleError(error, 'setbirthday.js');

      // ------------------- Handle errors during execution -------------------
      await interaction.reply({ content: '❌ An error occurred while setting the birthday. Please try again later.', ephemeral: true });
    }
  },

  // ------------------- Autocomplete function to provide character options based on user input -------------------
  async autocomplete(interaction) {
    try {
      const focusedOption = interaction.options.getFocused(true);
      const userId = interaction.user.id;

      // ------------------- Fetch and filter character names based on user input -------------------
      if (focusedOption.name === 'charactername') {
        await connectToTinglebot();
        const characters = await fetchCharactersByUserId(userId);
        const choices = characters.map(character => character.name);

        const filteredChoices = choices
          .filter(choice => choice.toLowerCase().includes(focusedOption.value.toLowerCase()))
          .slice(0, 25)
          .map(choice => ({ name: choice, value: choice }));

        // ------------------- Respond with the filtered choices -------------------
        await interaction.respond(filteredChoices);
      }
    } catch (error) {
    handleError(error, 'setbirthday.js');

      // ------------------- Handle errors during autocomplete -------------------
      await interaction.respond([]);
    }
  }
};

