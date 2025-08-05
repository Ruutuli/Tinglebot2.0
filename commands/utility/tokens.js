const { handleError } = require('../../utils/globalErrorHandler.js');
const { handleTokenError } = require('../../utils/tokenUtils.js');

// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('@discordjs/builders');
const { ButtonStyle, MessageFlags } = require('discord.js');
const User = require('../../models/UserModel.js');
const { getOrCreateToken, syncTokenTracker } = require('../../database/db.js');
const {
  authorizeSheets,
  getSheetIdByTitle,
  readSheetData,
} = require('../../utils/googleSheetsUtils.js');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../../utils/googleSheetsUtils.js');
const { createTokenTrackerSetupEmbed } = require('../../embeds/embeds.js');

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
        .setName('setup')
        .setDescription('Set up your token tracker')
        .addStringOption(option =>
          option.setName('link')
            .setDescription('Google Sheets link for your token tracker')
            .setRequired(true))),

  // ------------------- Execute function to handle subcommands -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    try {
      // Defer reply immediately to prevent timeout
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      // ------------------- Handle 'check' subcommand -------------------
      if (subcommand === 'check') {
        const tokenRecord = await getOrCreateToken(userId);
        
        if (!tokenRecord.tokenTracker || !isValidGoogleSheetsUrl(tokenRecord.tokenTracker)) {
          const { fullMessage } = handleTokenError(new Error('Invalid URL'), interaction);
          await interaction.editReply({
            content: fullMessage,
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }
        
        try {
          const auth = await authorizeSheets();
          const spreadsheetId = extractSpreadsheetId(tokenRecord.tokenTracker);

          // Fetch overall total from F4
          const overallTotalData = await readSheetData(auth, spreadsheetId, 'loggedTracker!F4');
          const overallTotal = overallTotalData?.[0]?.[0] || 'N/A';

          // Fetch spent tokens from F5
          const spentData = await readSheetData(auth, spreadsheetId, 'loggedTracker!F5');
          const spent = spentData?.[0]?.[0] || 'N/A';

          // Prepare embed response
          const embed = new EmbedBuilder()
            .setTitle(`${interaction.user.username}'s Token Balance`)
            .addFields(
              { name: '🪙 **Current Total**', value: `> **${tokenRecord.tokens}**`, inline: false },
              { name: '🧾 **Spent**', value: `> **${spent !== 'N/A' ? spent : 'Data not found'}**`, inline: false },
              { name: '👛 **Overall Total**', value: `> **${overallTotal !== 'N/A' ? overallTotal : 'Data not found'}**`, inline: false },
              {
                name: '🔗 **Token Tracker Link**',
                value: `> [📄 View your token tracker](${tokenRecord.tokenTracker})`,
                inline: false,
              }
            )
            .setColor(0xAA926A)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
            .setFooter({ text: 'Token Tracker' })
            .setTimestamp();

          await interaction.editReply({ embeds: [embed] });
        } catch (error) {
          const { fullMessage } = handleTokenError(error, interaction);
          await interaction.editReply({
            content: fullMessage,
            flags: [MessageFlags.Ephemeral],
          });
        }
      }
      // ------------------- Handle 'setup' subcommand -------------------
      else if (subcommand === 'setup') {
        const link = interaction.options.getString('link');

        if (!isValidGoogleSheetsUrl(link)) {
          const { fullMessage } = handleTokenError(new Error('Invalid URL'), interaction);
          await interaction.editReply({
            content: fullMessage,
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }

        try {
          // Save the token tracker link to the user's database
          const user = await User.findOne({ discordId: userId });
          if (!user) {
            await interaction.editReply({
              content: '❌ **User data not found. Please try again later.**',
              flags: [MessageFlags.Ephemeral],
            });
            return;
          }

          user.tokenTracker = link;
          await user.save();

          // Test the setup
          const auth = await authorizeSheets();
          const spreadsheetId = extractSpreadsheetId(link);

          const sheetId = await getSheetIdByTitle(auth, spreadsheetId, 'loggedTracker');
          if (!sheetId) {
            const { fullMessage } = handleTokenError(new Error('404'), interaction);
            await interaction.editReply({
              content: fullMessage,
              flags: [MessageFlags.Ephemeral],
            });
            return;
          }

          const expectedHeaders = ['SUBMISSION', 'LINK', 'CATEGORIES', 'TYPE', 'TOKEN AMOUNT'];
          const sheetData = await readSheetData(auth, spreadsheetId, 'loggedTracker!B7:F7');
          if (!sheetData || !expectedHeaders.every(header => sheetData[0]?.includes(header))) {
            const { fullMessage } = handleTokenError(new Error('headers'), interaction);
            await interaction.editReply({
              content: fullMessage,
              flags: [MessageFlags.Ephemeral],
            });
            return;
          }

          // No need to check for 'earned' entries. Allow sync if headers and tab are present.

          // Create confirmation buttons
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('token-sync-yes')
              .setLabel('✅ Yes, Sync Now')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('token-sync-no')
              .setLabel('❌ No, Later')
              .setStyle(ButtonStyle.Danger)
          );

          const setupEmbed = createTokenTrackerSetupEmbed(interaction.user.username, link);
          const response = await interaction.editReply({ 
            embeds: [setupEmbed], 
            components: [row],
            flags: [MessageFlags.Ephemeral]
          });

          // Create a collector for the buttons
          const filter = i => i.user.id === userId;
          const collector = response.createMessageComponentCollector({ 
            filter, 
            time: 300000 // 5 minutes
          });

          collector.on('collect', async i => {
            try {
              if (i.customId === 'token-sync-yes') {
                // Check if the sheet has any data beyond headers before syncing
                const auth = await authorizeSheets();
                const spreadsheetId = extractSpreadsheetId(link);
                const sheetData = await readSheetData(auth, spreadsheetId, 'loggedTracker!B7:F');
                const hasData = sheetData.length > 1; // More than just headers
                
                const tokenRecord = await syncTokenTracker(userId);
                
                // If the sheet was empty, show the setup complete message
                if (!hasData) {
                  const { fullMessage } = handleTokenError(new Error('No \'earned\' entries found'), interaction);
                  await i.update({
                    content: fullMessage,
                    embeds: [],
                    components: []
                  });
                } else {
                  await i.update({
                    content: '✅ Your token tracker has been synced successfully!',
                    embeds: [],
                    components: []
                  });
                }
              } else if (i.customId === 'token-sync-no') {
                await i.update({
                  content: '⏰ Token sync skipped. You can sync later using `/tokens setup` again.',
                  embeds: [],
                  components: []
                });
              }
            } catch (error) {
              const { fullMessage } = handleTokenError(error, interaction);
              await i.update({
                content: fullMessage,
                embeds: [],
                components: []
              });
            }
            collector.stop();
          });

          collector.on('end', collected => {
            if (collected.size === 0) {
              interaction.editReply({
                content: '⏰ Token sync timed out. You can sync later using `/tokens setup` again.',
                embeds: [],
                components: []
              }).catch(console.error);
            }
          });

        } catch (error) {
          const { fullMessage } = handleTokenError(error, interaction);
          await interaction.editReply({
            content: fullMessage,
            flags: [MessageFlags.Ephemeral],
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
      await interaction.editReply({
        content: fullMessage,
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};
