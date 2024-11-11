// ------------------- Create Character Command Module -------------------
// This module handles the creation of a character with options for different job categories (village-specific and general jobs).

// ------------------- Import Section -------------------
// Grouped based on standard, third-party, and local module imports
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js'); // Discord.js for building embeds and slash commands
const { createCharacterAutocomplete, createCharacterInteraction } = require('../handlers/characterInteractionHandler'); // Handlers for character interactions
const { createJobOptions, generalJobs, villageJobs } = require('../modules/jobsModule'); // Job options and village-specific job lists

// ------------------- Command Definition -------------------
// Define the slash command for creating a character with subcommands for each village and general job options
module.exports = {
  data: new SlashCommandBuilder()
    .setName('createcharacter')
    .setDescription('Create a new character')
    
    // ------------------- Rudania Subcommand -------------------
    .addSubcommand(subcommand =>
      subcommand.setName('rudania')
        .setDescription('Create a character with a Rudania exclusive job.')
        .addStringOption(option => 
          option.setName('name').setDescription('The name of the character').setRequired(true))
        .addIntegerOption(option => 
          option.setName('age').setDescription('Age of the character').setRequired(true))
        .addIntegerOption(option => 
          option.setName('height').setDescription('Height of the character in cm').setRequired(true))
        .addIntegerOption(option => 
          option.setName('hearts').setDescription('Number of hearts').setRequired(true))
        .addIntegerOption(option => 
          option.setName('stamina').setDescription('Number of stamina').setRequired(true))
        .addStringOption(option => 
          option.setName('pronouns').setDescription('Pronouns of the character').setRequired(true))
        .addStringOption(option => 
          option.setName('race').setDescription('Race of the character').setRequired(true).setAutocomplete(true))
        .addStringOption(option => 
          option.setName('job').setDescription('The job of the character').setRequired(true)
            .addChoices(...createJobOptions(villageJobs.rudania)))
        .addStringOption(option => 
          option.setName('inventory').setDescription('Google Sheets link for the inventory').setRequired(true))
        .addStringOption(option => 
          option.setName('applink').setDescription('Application link for the character').setRequired(true))
        .addAttachmentOption(option => 
          option.setName('icon').setDescription('Upload an icon image of the character').setRequired(true)))

    // ------------------- Inariko Subcommand -------------------
    .addSubcommand(subcommand =>
      subcommand.setName('inariko')
        .setDescription('Create a character with an Inariko exclusive job.')
        .addStringOption(option => 
          option.setName('name').setDescription('The name of the character').setRequired(true))
        .addIntegerOption(option => 
          option.setName('age').setDescription('Age of the character').setRequired(true))
        .addIntegerOption(option => 
          option.setName('height').setDescription('Height of the character in cm').setRequired(true))
        .addIntegerOption(option => 
          option.setName('hearts').setDescription('Number of hearts').setRequired(true))
        .addIntegerOption(option => 
          option.setName('stamina').setDescription('Number of stamina').setRequired(true))
        .addStringOption(option => 
          option.setName('pronouns').setDescription('Pronouns of the character').setRequired(true))
        .addStringOption(option => 
          option.setName('race').setDescription('Race of the character').setRequired(true).setAutocomplete(true))
        .addStringOption(option => 
          option.setName('job').setDescription('The job of the character').setRequired(true)
            .addChoices(...createJobOptions(villageJobs.inariko)))
        .addStringOption(option => 
          option.setName('inventory').setDescription('Google Sheets link for the inventory').setRequired(true))
        .addStringOption(option => 
          option.setName('applink').setDescription('Application link for the character').setRequired(true))
        .addAttachmentOption(option => 
          option.setName('icon').setDescription('Upload an icon image of the character').setRequired(true)))

    // ------------------- Vhintl Subcommand -------------------
    .addSubcommand(subcommand =>
      subcommand.setName('vhintl')
        .setDescription('Create a character with a Vhintl exclusive job.')
        .addStringOption(option => 
          option.setName('name').setDescription('The name of the character').setRequired(true))
        .addIntegerOption(option => 
          option.setName('age').setDescription('Age of the character').setRequired(true))
        .addIntegerOption(option => 
          option.setName('height').setDescription('Height of the character in cm').setRequired(true))
        .addIntegerOption(option => 
          option.setName('hearts').setDescription('Number of hearts').setRequired(true))
        .addIntegerOption(option => 
          option.setName('stamina').setDescription('Number of stamina').setRequired(true))
        .addStringOption(option => 
          option.setName('pronouns').setDescription('Pronouns of the character').setRequired(true))
        .addStringOption(option => 
          option.setName('race').setDescription('Race of the character').setRequired(true).setAutocomplete(true))
        .addStringOption(option => 
          option.setName('job').setDescription('The job of the character').setRequired(true)
            .addChoices(...createJobOptions(villageJobs.vhintl)))
        .addStringOption(option => 
          option.setName('inventory').setDescription('Google Sheets link for the inventory').setRequired(true))
        .addStringOption(option => 
          option.setName('applink').setDescription('Application link for the character').setRequired(true))
        .addAttachmentOption(option => 
          option.setName('icon').setDescription('Upload an icon image of the character').setRequired(true)))

    // ------------------- General Subcommand -------------------
    .addSubcommand(subcommand =>
      subcommand.setName('general')
        .setDescription('Create a character with a general job.')
        .addStringOption(option => 
          option.setName('name').setDescription('The name of the character').setRequired(true))
        .addIntegerOption(option => 
          option.setName('age').setDescription('Age of the character').setRequired(true))
        .addIntegerOption(option => 
          option.setName('height').setDescription('Height of the character in cm').setRequired(true))
        .addIntegerOption(option => 
          option.setName('hearts').setDescription('Number of hearts').setRequired(true))
        .addIntegerOption(option => 
          option.setName('stamina').setDescription('Number of stamina').setRequired(true))
        .addStringOption(option => 
          option.setName('pronouns').setDescription('Pronouns of the character').setRequired(true))
        .addStringOption(option => 
          option.setName('race').setDescription('Race of the character').setRequired(true).setAutocomplete(true))
        .addStringOption(option => 
          option.setName('village').setDescription('The home village of the character').setRequired(true)
            .addChoices(
              { name: 'Inariko', value: 'inariko' },
              { name: 'Rudania', value: 'rudania' },
              { name: 'Vhintl', value: 'vhintl' }
            ))
        .addStringOption(option => 
          option.setName('job').setDescription('The job of the character').setRequired(true)
            .addChoices(...createJobOptions(generalJobs)))
        .addStringOption(option => 
          option.setName('inventory').setDescription('Google Sheets link for the inventory').setRequired(true))
        .addStringOption(option => 
          option.setName('applink').setDescription('Application link for the character').setRequired(true))
        .addAttachmentOption(option => 
          option.setName('icon').setDescription('Upload an icon image of the character').setRequired(true))),

  // ------------------- Command Execution Logic -------------------
  // Handles the execution of the character creation interaction
  async execute(interaction) {
    try {
      await createCharacterInteraction(interaction);
    } catch (error) {
      // Error handling (empty, can be expanded as needed)
    }
  },

  // ------------------- Autocomplete Interaction Handler -------------------
  // Provides autocomplete for character options (e.g., race or job)
  async autocomplete(interaction) {
    try {
      await createCharacterAutocomplete(interaction);
    } catch (error) {
      await interaction.respond([]); // Sends an empty response in case of an error
    }
  }
};
