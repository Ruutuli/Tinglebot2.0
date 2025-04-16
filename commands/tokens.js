const { handleError } = require('../utils/globalErrorHandler');

// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders'); // For building slash commands and embeds
const User = require('../models/UserModel'); // User model for database operations
const { getOrCreateToken, syncTokenTracker } = require('../database/tokenService'); // Token services
const {
  authorizeSheets,
  getSheetIdByTitle,
  readSheetData,
} = require('../utils/googleSheetsUtils'); // Google Sheets utilities
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/validation'); // Validation utilities
const { createTokenTrackerSetupEmbed } = require('../embeds/instructionsEmbeds'); // Embed creation utilities

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
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('test')
        .setDescription('Test if the token tracker is set up correctly')),

  // ------------------- Execute function to handle subcommands -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    // ------------------- Handle 'check' subcommand -------------------
    if (subcommand === 'check') {
      try {
        const tokenRecord = await getOrCreateToken(userId);
        
        if (!tokenRecord.tokenTracker || !isValidGoogleSheetsUrl(tokenRecord.tokenTracker)) {
          console.error('[tokens.js]: Invalid Google Sheets URL', { userId, tokenTrackerLink: tokenRecord.tokenTracker });
          await interaction.reply({
            content: '❌ Your token tracker link is not set up or is invalid. Please use `/tokens tokentrackerlink` to set it up.',
            ephemeral: true,
          });
          return;
        }
        
        const auth = await authorizeSheets();
        const spreadsheetId = extractSpreadsheetId(tokenRecord.tokenTracker);

        console.log('[tokens.js]: Extracted Spreadsheet ID:', spreadsheetId); // Debug log

        // Fetch overall total from F4
        const overallTotalData = await readSheetData(auth, spreadsheetId, 'loggedTracker!F4');
        const overallTotal = overallTotalData?.[0]?.[0] || 'N/A'; // Adjusted to access the first cell of F4

        // Fetch spent tokens from F5
        const spentData = await readSheetData(auth, spreadsheetId, 'loggedTracker!F5');
        const spent = spentData?.[0]?.[0] || 'N/A';

        // Prepare embed response
        const embed = new EmbedBuilder()
          .setTitle(`${interaction.user.username}'s Token Balance`) // Include the user's name in the title
          .addFields(
            { name: '👛 **Overall Total**', value: `> **${overallTotal !== 'N/A' ? overallTotal : 'Data not found'}**`, inline: false },
            { name: '🪙 **Current Total**', value: `> **${tokenRecord.tokens}**`, inline: false },
            { name: '🧾 **Spent**', value: `> **${spent !== 'N/A' ? spent : 'Data not found'}**`, inline: false },
            {
              name: '🔗 **Token Tracker Link**',
              value: `> [📄 View your token tracker](${tokenRecord.tokenTracker})`,
              inline: false,
            }
          )
          .setColor(0xAA926A)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true })) // Add user's profile picture as thumbnail
          .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Add specified image
          .setFooter({ text: 'Token Tracker' })
          .setTimestamp();


        await interaction.reply({ embeds: [embed] });

      } catch (error) {
    handleError(error, 'tokens.js');

        console.error('[tokens.js]: Error checking tokens:', error);

        let errorMessage = '❌ An error occurred while checking your tokens.';
        if (error.message.includes('Invalid URL')) {
          errorMessage = '❌ The provided Google Sheets URL is invalid. Please check the link and try again.';
        } else if (error.message.includes('permission')) {
          errorMessage = '❌ The bot does not have permission to access your Google Sheet. Please share the sheet with `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`.';
        } else if (error.message.includes('404')) {
          errorMessage = '❌ The Google Sheet or tab could not be found. Please ensure the link and tab name are correct.';
        }

        await interaction.reply({
          content: errorMessage,
          ephemeral: true,
        });
      }

// ------------------- Handle 'sync' subcommand -------------------
} else if (subcommand === 'sync') {
  try {
    const user = await getOrCreateToken(userId);

    // Prevent re-syncing if tokensSynced is true
    if (user.tokensSynced) {
      await interaction.reply({
        content: '❌ Your tokens are already synced. You cannot sync again!',
        ephemeral: true,
      });
      return;
    }

    const tokenRecord = await syncTokenTracker(userId);

    // Prepare embed response
    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username}'s Token Balance`) // Include the user's name in the title
      .setDescription('✅ Your token tracker has been synced!') // Add the description
      .addFields(
        { name: '🪙 **Current Total**', value: `> **${tokenRecord.tokens || 'Data not found'}**`, inline: false },
        {
          name: '🔗 **Token Tracker Link**',
          value: `> [📄 View your token tracker](${tokenRecord.tokenTracker || 'No link provided'})`,
          inline: false,
        }
      )
      .setColor(0xAA926A)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true })) // Add user's profile picture as thumbnail
      .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png') // Add specified image
      .setFooter({ text: 'Token Tracker' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  } catch (error) {
    handleError(error, 'tokens.js');

    console.error('[tokens.js]: Error syncing tokens:', error);

    let errorMessage = '❌ An error occurred while syncing your token tracker:';
    if (error.message.includes('The caller does not have permission')) {
      errorMessage += ` The caller does not have permission. Please share the Google Sheet with this email with edit permissions:
📧 tinglebot@rotw-tinglebot.iam.gserviceaccount.com`;
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
          ephemeral: true,
        });
        return;
      }

      try {
        const tokenRecord = await getOrCreateToken(userId, link);
        const setupEmbed = createTokenTrackerSetupEmbed(interaction.user.username, link);
        await interaction.reply({ embeds: [setupEmbed], ephemeral: true });
      } catch (error) {
    handleError(error, 'tokens.js');

        console.error('[tokens.js]: Error setting token tracker link:', error);
        await interaction.reply({
          content: '❌ An error occurred while setting your token tracker link. Please try again later.',
          ephemeral: true,
        });
      }

    // ------------------- Handle 'test' subcommand -------------------
    } else if (subcommand === 'test') {
      try {
        const user = await User.findOne({ discordId: userId });
        if (!user) {
          await interaction.reply({
            content: '❌ No user data found. Please ensure your account is registered.',
            ephemeral: true,
          });
          return;
        }

        if (!user.tokenTracker || !isValidGoogleSheetsUrl(user.tokenTracker)) {
          await interaction.reply({
            content: '❌ Your token tracker is not set up correctly. Please link your Google Sheets URL using `/tokens tokentrackerlink`.',
            ephemeral: true,
          });
          return;
        }

        const auth = await authorizeSheets();
        const spreadsheetId = extractSpreadsheetId(user.tokenTracker);

        const sheetId = await getSheetIdByTitle(auth, spreadsheetId, 'loggedTracker');
        if (!sheetId) {
          await interaction.reply({
            content: '❌ The `loggedTracker` tab is missing from your token tracker. Please ensure the tab is named correctly.',
            ephemeral: true,
          });
          return;
        }

        const expectedHeaders = ['SUBMISSION', 'LINK', 'CATEGORIES', 'TYPE', 'TOKEN AMOUNT'];
        const sheetData = await readSheetData(auth, spreadsheetId, 'loggedTracker!B7:F7');
        if (!sheetData || !expectedHeaders.every(header => sheetData[0]?.includes(header))) {
          await interaction.reply({
            content: `❌ The \`loggedTracker\` tab is missing required headers. Please ensure the headers are:
            \`\`\`SUBMISSION, LINK, CATEGORIES, TYPE, TOKEN AMOUNT\`\`\``,
            ephemeral: true,
          });
          return;
        }

        await interaction.reply({
          content: '✅ Your token tracker is set up correctly!',
          ephemeral: true,
        });

      } catch (error) {
    handleError(error, 'tokens.js');

        console.error('[tokens.js]: Error in /tokens test command:', error);

        let errorMessage = '❌ An error occurred while testing your token tracker.';
        if (error.message.includes('Invalid URL')) {
          errorMessage = '❌ The provided Google Sheets URL is invalid. Please check the link and try again.';
        } else if (error.message.includes('permission')) {
          errorMessage = '❌ The bot does not have permission to access your Google Sheet. Please share the sheet with `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`.';
        } else if (error.message.includes('404')) {
          errorMessage = '❌ The Google Sheet or tab could not be found. Please ensure the link and tab name are correct.';
        }

        await interaction.reply({
          content: errorMessage,
          ephemeral: true,
        });
      }
    }
  },
};
