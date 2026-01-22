const { handleInteractionError } = require('@/shared/utils/globalErrorHandler.js');
const { handleTokenError } = require('@/shared/utils/tokenUtils.js');
const logger = require('@/shared/utils/logger.js');

// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('@discordjs/builders');
const { ButtonStyle, MessageFlags } = require('discord.js');
const User = require('@/shared/models/UserModel.js');
const { getOrCreateToken, syncTokenTracker } = require('@/shared/database/db.js');
// Google Sheets functionality removed
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
        
        if (!tokenRecord.tokenTracker) {
          const { fullMessage } = handleTokenError(new Error('No token tracker configured'), interaction);
          await interaction.editReply({
            content: fullMessage,
            flags: [MessageFlags.Ephemeral],
          });
          return;
        }
        
        // Prepare embed response
        const embed = new EmbedBuilder()
          .setTitle(`${interaction.user.username}'s Token Balance`)
          .addFields(
            { name: '🪙 **Current Total**', value: `> **${tokenRecord.tokens}**`, inline: false },
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
      }
      // ------------------- Handle 'setup' subcommand -------------------
      else if (subcommand === 'setup') {
        const link = interaction.options.getString('link');
        logger.info('TOKEN', `Starting setup for user: ${userId} (${interaction.user.username})`);
        logger.debug('TOKEN', `Provided link: ${link}`);

        // URL validation removed - Google Sheets no longer used
        logger.debug('TOKEN', `Setting up token tracker for user ${userId}`);

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

          // Google Sheets validation removed
          logger.info('TOKEN', `Token tracker setup complete`);

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
                
                // Google Sheets sync removed - use database sync instead
                logger.info('TOKEN', `Calling syncTokenTracker function...`);
                const tokenRecord = await syncTokenTracker(userId);
                logger.success('TOKEN', `Sync completed:`, {
                  finalTokens: tokenRecord.tokens,
                  tokensSynced: tokenRecord.tokensSynced
                });
                
                logger.success('TOKEN', `Sync successful, showing success message`);
                await i.update({
                  content: '✅ Your token tracker has been synced successfully!',
                  embeds: [],
                  components: []
                });
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

          if (!tokenRecord.tokenTracker) {
            logger.warn('TOKEN', `Missing token tracker URL for user ${userId}`);
            const { fullMessage } = handleTokenError(new Error('No token tracker configured'), interaction);
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
