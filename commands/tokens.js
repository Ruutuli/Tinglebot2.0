// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder } = require('@discordjs/builders');
const { getOrCreateToken, syncTokenTracker } = require('../database/tokenService');
const { createTokenTrackerSetupEmbed } = require('../embeds/instructionsEmbeds');
const { isValidGoogleSheetsUrl } = require('../utils/validation');

// ------------------- Command data definition for managing tokens -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('tokens')
    .setDescription('Manage your tokens')
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('Check your current token balance'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('sync')
        .setDescription('Sync your token tracker from Google Sheets'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('tokentrackerlink')
        .setDescription('Set your token tracker Google Sheets link')
        .addStringOption(option =>
          option.setName('link')
            .setDescription('Google Sheets link for your token tracker')
            .setRequired(true))),
  
  // ------------------- Execute function to handle subcommands -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // ------------------- Handle 'check' subcommand -------------------
    if (subcommand === 'check') {
      try {
        const tokenRecord = await getOrCreateToken(userId);
        await interaction.reply(`🔍 You currently have **${tokenRecord.tokens}** tokens.`);
      } catch (error) {
        console.error('Error checking tokens:', error);
        await interaction.reply({
          content: '❌ An error occurred while checking your token balance. Please try again later.',
          ephemeral: true
        });
      }

    // ------------------- Handle 'sync' subcommand -------------------
    } else if (subcommand === 'sync') {
      try {
        const tokenRecord = await syncTokenTracker(userId);
        await interaction.reply(`✅ Your token tracker has been synced. Your new balance is **${tokenRecord.tokens}** tokens.`);
      } catch (error) {
        console.error('Error syncing tokens:', error);
        let errorMessage = '❌ An error occurred while syncing your token tracker:';
        if (error.message.includes('The caller does not have permission')) {
          errorMessage += ` The caller does not have permission. Please share the Google Sheet with this email with edit permissions:\n📧 tinglebot@rotw-tinglebot.iam.gserviceaccount.com`;
        } else {
          errorMessage += ` ${error.message}`;
        }
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }

    // ------------------- Handle 'tokentrackerlink' subcommand -------------------
    } else if (subcommand === 'tokentrackerlink') {
      const link = interaction.options.getString('link');

      if (!isValidGoogleSheetsUrl(link)) {
        await interaction.reply({
          content: '❌ The provided link is not a valid Google Sheets URL. Please provide a valid link.',
          ephemeral: true
        });
        return;
      }

      try {
        const tokenRecord = await getOrCreateToken(userId, link);
        const setupEmbed = createTokenTrackerSetupEmbed(interaction.user.username, link);
        await interaction.reply({ embeds: [setupEmbed], ephemeral: true });
      } catch (error) {
        console.error('Error setting token tracker link:', error);
        await interaction.reply({
          content: '❌ An error occurred while setting your token tracker link. Please try again later.',
          ephemeral: true
        });
      }
    }
  }
};
