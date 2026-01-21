const { handleInteractionError } = require('@/shared/utils/globalErrorHandler.js');
const { handleTokenError } = require('@/shared/utils/tokenUtils.js');
const logger = require('@/shared/utils/logger.js');

// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('@discordjs/builders');
const { ButtonStyle, MessageFlags } = require('discord.js');
const User = require('@/shared/models/UserModel.js');
const { getOrCreateToken, syncTokenTracker } = require('@/shared/database/db.js');
const {
  authorizeSheets,
  getSheetIdByTitle,
  getActualSheetName,
  readSheetData,
} = require('@/shared/utils/googleSheetsUtils.js');
const { extractSpreadsheetId, isValidGoogleSheetsUrl } = require('@/shared/utils/googleSheetsUtils.js');
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
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('sync')
        .setDescription('Sync your token tracker with the current sheet data')),

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
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
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
        logger.info('TOKEN', `Starting setup for user: ${userId} (${interaction.user.username})`);
        logger.debug('TOKEN', `Provided link: ${link}`);

        if (!isValidGoogleSheetsUrl(link)) {
          logger.warn('TOKEN', `Invalid URL provided by user ${userId}: ${link}`);
          const { fullMessage } = handleTokenError(new Error('Invalid URL'), interaction);
          await interaction.editReply({
            content: fullMessage,
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }
        logger.debug('TOKEN', `URL validation passed for user ${userId}`);

        try {
          // Save the token tracker link to the user's database
          logger.debug('TOKEN', `Looking up user in database: ${userId}`);
          const user = await User.findOne({ discordId: userId });
          if (!user) {
            logger.warn('TOKEN', `User not found in database: ${userId}`);
            await interaction.editReply({
              content: '❌ **User data not found. Please try again later.**',
              flags: [MessageFlags.Ephemeral],
            });
            return;
          }
          logger.debug('TOKEN', `User found in database, saving token tracker link`);

          user.tokenTracker = link;
          await user.save();
          logger.success('TOKEN', `Token tracker link saved to database for user ${userId}`);

          // Test the setup
          logger.debug('TOKEN', `Testing Google Sheets access...`);
          const auth = await authorizeSheets();
          const spreadsheetId = extractSpreadsheetId(link);
          logger.debug('TOKEN', `Extracted spreadsheet ID: ${spreadsheetId}`);

          logger.debug('TOKEN', `Checking for 'loggedTracker' tab...`);
          const sheetId = await getSheetIdByTitle(auth, spreadsheetId, 'loggedTracker');
          if (!sheetId) {
            logger.warn('TOKEN', `'loggedTracker' tab not found in spreadsheet`);
            const { fullMessage } = handleTokenError(new Error('404'), interaction);
            await interaction.editReply({
              content: fullMessage,
              flags: [MessageFlags.Ephemeral],
            });
            return;
          }
          logger.success('TOKEN', `'loggedTracker' tab found with ID: ${sheetId}`);

          // Get the actual sheet name (with proper spacing)
          const actualSheetName = await getActualSheetName(auth, spreadsheetId, 'loggedTracker');
          logger.debug('TOKEN', `Actual sheet name: "${actualSheetName}"`);

          const expectedHeaders = ['SUBMISSION', 'LINK', 'CATEGORIES', 'TYPE', 'TOKEN AMOUNT'];
          const headerRange = `${actualSheetName}!B7:F7`;
          logger.debug('TOKEN', `Checking headers in row 7 (range: ${headerRange})`);
          const sheetData = await readSheetData(auth, spreadsheetId, headerRange);
          logger.debug('TOKEN', `Retrieved header data:`, sheetData);
          
          if (!sheetData || !expectedHeaders.every(header => sheetData[0]?.includes(header))) {
            logger.warn('TOKEN', `Header validation failed. Expected:`, expectedHeaders);
            logger.warn('TOKEN', `Found:`, sheetData?.[0]);
            const { fullMessage } = handleTokenError(new Error('headers'), interaction);
            await interaction.editReply({
              content: fullMessage,
              flags: [MessageFlags.Ephemeral],
            });
            return;
          }
          logger.success('TOKEN', `Headers validation passed`);

          // No need to check for 'earned' entries. Allow sync if headers and tab are present.
          logger.info('TOKEN', `All validations passed, creating confirmation buttons`);

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
          logger.debug('TOKEN', `Sending setup embed with confirmation buttons to user ${userId}`);
          const response = await interaction.editReply({ 
            embeds: [setupEmbed], 
            components: [row],
            flags: [MessageFlags.Ephemeral]
          });

          // Create a collector for the buttons
          const filter = i => i.user.id === userId;
          logger.debug('TOKEN', `Creating button collector for user ${userId} (5 minute timeout)`);
          const collector = response.createMessageComponentCollector({ 
            filter, 
            time: 300000 // 5 minutes
          });

          collector.on('collect', async i => {
            try {
              if (i.customId === 'token-sync-yes') {
                logger.info('TOKEN', `User ${userId} (${interaction.user.username}) clicked sync button`);
                
                // Check if the sheet has any data beyond headers before syncing
                logger.debug('TOKEN', `Authorizing Google Sheets access...`);
                const auth = await authorizeSheets();
                const spreadsheetId = extractSpreadsheetId(link);
                logger.debug('TOKEN', `Extracted spreadsheet ID: ${spreadsheetId}`);
                
                // Get the actual sheet name (with proper spacing)
                const actualSheetName = await getActualSheetName(auth, spreadsheetId, 'loggedTracker');
                const dataRange = `${actualSheetName}!B7:F`;
                logger.debug('TOKEN', `Reading sheet data from range: ${dataRange}`);
                const sheetData = await readSheetData(auth, spreadsheetId, dataRange);
                const hasData = sheetData.length > 1; // More than just headers
                logger.debug('TOKEN', `Sheet data retrieved:`, {
                  totalRows: sheetData.length,
                  hasData: hasData,
                  firstRow: sheetData[0],
                  sampleData: sheetData.slice(0, 3)
                });
                
                logger.info('TOKEN', `Calling syncTokenTracker function...`);
                const tokenRecord = await syncTokenTracker(userId);
                logger.success('TOKEN', `Sync completed:`, {
                  finalTokens: tokenRecord.tokens,
                  tokensSynced: tokenRecord.tokensSynced
                });
                
                // If the sheet was empty, show the setup complete message
                if (!hasData) {
                  logger.info('TOKEN', `No earned entries found, showing setup complete message`);
                  const { fullMessage } = handleTokenError(new Error('No \'earned\' entries found'), interaction);
                  await i.update({
                    content: fullMessage,
                    embeds: [],
                    components: []
                  });
                } else {
                  logger.success('TOKEN', `Sync successful, showing success message`);
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
              logger.error('TOKEN', `Error in button collector for user ${userId}:`, error.message);
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
              logger.warn('TOKEN', `Button collector timed out for user ${userId} - no button was clicked`);
              interaction.editReply({
                content: '⏰ Token sync timed out. You can sync later using `/tokens setup` again.',
                embeds: [],
                components: []
              }).catch(error => logger.error('INTERACTION', 'Error updating message'));
            } else {
              logger.debug('TOKEN', `Button collector ended for user ${userId} - collected ${collected.size} interactions`);
            }
          });

        } catch (error) {
          logger.error('TOKEN', `Error during setup for user ${userId}:`, error.message);
          const { fullMessage } = handleTokenError(error, interaction);
          await interaction.editReply({
            content: fullMessage,
            flags: [MessageFlags.Ephemeral],
          });
        }
      }
      // ------------------- Handle 'sync' subcommand -------------------
      else if (subcommand === 'sync') {
        logger.info('TOKEN', `Starting sync process for user: ${userId} (${interaction.user.username})`);
        
        try {
          const tokenRecord = await getOrCreateToken(userId);
          logger.debug('TOKEN', `Retrieved token record for user ${userId}:`, {
            hasTokenTracker: !!tokenRecord.tokenTracker,
            tokenTrackerUrl: tokenRecord.tokenTracker,
            currentTokens: tokenRecord.tokens,
            tokensSynced: tokenRecord.tokensSynced
          });

          if (!tokenRecord.tokenTracker || !isValidGoogleSheetsUrl(tokenRecord.tokenTracker)) {
            logger.warn('TOKEN', `Invalid or missing token tracker URL for user ${userId}`);
            const { fullMessage } = handleTokenError(new Error('Invalid URL'), interaction);
            await interaction.editReply({
              content: fullMessage,
              flags: [MessageFlags.Ephemeral],
            });
            return;
          }

          logger.info('TOKEN', `Valid token tracker URL found, proceeding with sync...`);
          const syncResult = await syncTokenTracker(userId);
          
          logger.success('TOKEN', `Sync completed for user ${userId}:`, {
            finalTokens: syncResult.tokens,
            tokensSynced: syncResult.tokensSynced,
            tokenTrackerUrl: syncResult.tokenTracker
          });

          await interaction.editReply({
            content: '✅ Your token tracker has been synced successfully!',
            flags: [MessageFlags.Ephemeral],
          });
        } catch (error) {
          logger.error('TOKEN', `Error during sync for user ${userId}:`, error.message);
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
        handleInteractionError(error, 'tokens.js');
      }
      const { fullMessage } = handleTokenError(error, interaction);
      await interaction.editReply({
        content: fullMessage,
        flags: [MessageFlags.Ephemeral],
      });
    }
  },
};
