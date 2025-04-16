// ------------------- Create Character Command Module -------------------
// This module handles the creation of a character with options for different job categories (village-specific and general jobs).

// ------------------- Import Section -------------------
// Grouped based on standard, third-party, and local module imports
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js'); // Discord.js for building embeds and slash commands
const { createCharacterAutocomplete, createCharacterInteraction } = require('../handlers/characterInteractionHandler'); // Handlers for character interactions
const { createJobOptions, generalJobs, villageJobs, getJobPerk } = require('../modules/jobsModule'); // Job options and village-specific job lists
const { roles } = require('../modules/rolesModule'); // Roles module for assigning roles
const { capitalizeFirstLetter, capitalizeWords } = require('../modules/formattingModule');

const { handleError } = require('../utils/globalErrorHandler');
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
      const userId = interaction.user.id; // Discord user ID
      const User = require('../models/UserModel'); // Import User model
      const Character = require('../models/CharacterModel'); // Import Character model (adjust path as needed)

      let user = await User.findOne({ discordId: userId });

      // ------------------- Create new user with 2 character slots if they don't exist -------------------
      if (!user) {
          user = new User({
              discordId: userId,
              characterSlot: 2 // Default slot count for new users
          });
      
          await user.save();
          console.log(`[CreateCharacter]: Created new user profile for ${interaction.user.tag} with 2 character slots.`);
      }
      
      // ------------------- Check if user has available slots -------------------
      if (user.characterSlot <= 0) {
          await interaction.reply({
              content: "❌ You do not have enough character slots available to create a new character.",
              ephemeral: true
          });
          return;
      }
      
      // Check if a character with the provided name already exists
      const characterName = interaction.options.getString('name');
      const existingCharacter = await Character.findOne({ name: characterName });

      if (existingCharacter) {
          await interaction.reply({
              content: `❌ A character with the name "${characterName}" already exists. Please choose a different name.`,
              ephemeral: true
          });
          return; // Stop further execution
      }

      // Proceed with character creation logic
      const race = interaction.options.getString('race');
      const village = interaction.options.getString('village');
      const job = interaction.options.getString('job');

      // Normalize values for matching role formats
      const formattedRace = `Race: ${race}`;
      const formattedVillage = `${capitalizeFirstLetter(village)} Resident`;
      const formattedJob = `Job: ${capitalizeWords(job)}`;

      // Fetch job perks
      const { perks: jobPerks } = getJobPerk(job) || { perks: [] };

      // Assign roles to the user
      const member = interaction.member;
      const roleNames = [formattedRace, formattedVillage, formattedJob];

      for (const roleName of roleNames) {
          const role = interaction.guild.roles.cache.find(r => r.name === roleName);
          if (role) {
              await member.roles.add(role);
              console.log(`[Roles]: Assigned role "${roleName}" to user "${member.user.tag}".`);
          } else {
              console.warn(`[Roles]: Role "${roleName}" not found in the guild.`);
          }
      }

      // Add job perk roles
      for (const perk of jobPerks) {
          const perkRoleName = `Job Perk: ${perk}`;
          const perkRole = interaction.guild.roles.cache.find(r => r.name === perkRoleName);
          if (perkRole) {
              await member.roles.add(perkRole);
              console.log(`[Roles]: Assigned perk role "${perkRole.name}" to user "${member.user.tag}".`);
          } else {
              console.warn(`[Roles]: Perk role "${perkRoleName}" not found in the guild.`);
          }
      }

      // Decrement character slots
      user.characterSlot -= 1;
      await user.save();

      // Handle character interaction
      await createCharacterInteraction(interaction);

      // Send a confirmation reply
      await interaction.followUp({
          content: "🎉 Your character has been successfully created! Your remaining character slots: " + user.characterSlot,
          ephemeral: true
      });
  } catch (error) {
    handleError(error, 'createcharacter.js');

      console.error('[CreateCharacter]: Error during character creation:', error.message);

      // Reply with an error if not already replied
      if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
              content: "❌ An error occurred during character creation. Please try again later.",
              ephemeral: true
          });
      }
  }
},

  // ------------------- Autocomplete Interaction Handler -------------------
  // Provides autocomplete for character options (e.g., race or job)
  async autocomplete(interaction) {
    try {
      await createCharacterAutocomplete(interaction);
    } catch (error) {
    handleError(error, 'createcharacter.js');

      await interaction.respond([]); // Sends an empty response in case of an error
    }
  }
};
