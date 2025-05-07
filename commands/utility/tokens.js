const { handleError } = require('../../utils/globalErrorHandler.js');
const { handleTokenError } = require('../../utils/tokenUtils.js');

// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders'); // For building slash commands and embeds
const User = require('../../models/UserModel.js'); // User model for database operations
const { getOrCreateToken, syncTokenTracker } = require('../../database/db.js'); // Token services
const {
  authorizeSheets,
  getSheetIdByTitle,
  readSheetData,
} = require('../../utils/googleSheetsUtils.js'); // Google Sheets utilities
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../../utils/validation.js'); // Validation utilities
const { createTokenTrackerSetupEmbed } = require('../../embeds/embeds.js'); // Embed creation utilities

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

    try {
      // ------------------- Handle 'check' subcommand -------------------
      if (subcommand === 'check') {
        const tokenRecord = await getOrCreateToken(userId);
        
        if (!tokenRecord.tokenTracker || !isValidGoogleSheetsUrl(tokenRecord.tokenTracker)) {
          const { fullMessage } = handleTokenError(new Error('Invalid URL'), interaction);
          await interaction.reply({
            content: fullMessage,
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

      // ------------------- Handle 'sync' subcommand -------------------
      } else if (subcommand === 'sync') {
        const user = await getOrCreateToken(userId);

        if (user.tokensSynced) {
          await interaction.reply({
            content: '❌ Your tokens are already synced. You cannot sync again!',
            ephemeral: true,
          });
          return;
        }

        try {
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
          const { fullMessage } = handleTokenError(error, interaction);
          await interaction.reply({
            content: fullMessage,
            ephemeral: true,
          });
        }

      // ------------------- Handle 'tokentrackerlink' subcommand -------------------
      } else if (subcommand === 'tokentrackerlink') {
        const link = interaction.options.getString('link');

        if (!isValidGoogleSheetsUrl(link)) {
          const { fullMessage } = handleTokenError(new Error('Invalid URL'), interaction);
          await interaction.reply({
            content: fullMessage,
            ephemeral: true,
          });
          return;
        }

        try {
          // Save the token tracker link to the user's database
          const user = await User.findOne({ discordId: userId });
          if (!user) {
            await interaction.reply({
              content: '❌ **User data not found. Please try again later.**',
              ephemeral: true,
            });
            return;
          }

          user.tokenTracker = link;
          await user.save();

          const setupEmbed = createTokenTrackerSetupEmbed(interaction.user.username, link);
          await interaction.reply({ embeds: [setupEmbed], ephemeral: true });
        } catch (error) {
          const { fullMessage } = handleTokenError(error, interaction);
          await interaction.reply({
            content: fullMessage,
            ephemeral: true,
          });
        }

      // ------------------- Handle 'test' subcommand -------------------
      } else if (subcommand === 'test') {
        const user = await User.findOne({ discordId: userId });
        if (!user) {
          await interaction.reply({
            content: '❌ No user data found. Please ensure your account is registered.',
            ephemeral: true,
          });
          return;
        }

        if (!user.tokenTracker || !isValidGoogleSheetsUrl(user.tokenTracker)) {
          const { fullMessage } = handleTokenError(new Error('Invalid URL'), interaction);
          await interaction.reply({
            content: fullMessage,
            ephemeral: true,
          });
          return;
        }

        try {
          const auth = await authorizeSheets();
          const spreadsheetId = extractSpreadsheetId(user.tokenTracker);

          const sheetId = await getSheetIdByTitle(auth, spreadsheetId, 'loggedTracker');
          if (!sheetId) {
            const { fullMessage } = handleTokenError(new Error('404'), interaction);
            await interaction.reply({
              content: fullMessage,
              ephemeral: true,
            });
            return;
          }

          const expectedHeaders = ['SUBMISSION', 'LINK', 'CATEGORIES', 'TYPE', 'TOKEN AMOUNT'];
          const sheetData = await readSheetData(auth, spreadsheetId, 'loggedTracker!B7:F7');
          if (!sheetData || !expectedHeaders.every(header => sheetData[0]?.includes(header))) {
            const { fullMessage } = handleTokenError(new Error('headers'), interaction);
            await interaction.reply({
              content: fullMessage,
              ephemeral: true,
            });
            return;
          }

          await interaction.reply({
            content: '✅ Your token tracker is set up correctly!',
            ephemeral: true,
          });
        } catch (error) {
          const { fullMessage } = handleTokenError(error, interaction);
          await interaction.reply({
            content: fullMessage,
            ephemeral: true,
          });
        }
      }
    } catch (error) {
      // Only log actual system errors
      if (!error.message.includes('Invalid URL') && 
          !error.message.includes('permission') && 
          !error.message.includes('404') && 
          !error.message.includes('headers')) {
        handleError(error, 'tokens.js');
      }
      const { fullMessage } = handleTokenError(error, interaction);
      await interaction.reply({
        content: fullMessage,
        ephemeral: true,
      });
    }
  },
};
