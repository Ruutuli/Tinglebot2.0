const { handleInteractionError } = require('@/utils/globalErrorHandler.js');
const { handleTokenError } = require('@/utils/tokenUtils.js');
const logger = require('@/utils/logger.js');

// ------------------- Import necessary modules and services -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const { MessageFlags } = require('discord.js');
const { getOrCreateToken } = require('@/database/db.js');

// ------------------- Command data definition for managing tokens -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('tokens')
    .setDescription('Manage your tokens')
    .addSubcommand(subcommand =>
      subcommand
        .setName('check')
        .setDescription('Check your current token balance')),

  // ------------------- Execute function to handle subcommands -------------------
  async execute(interaction) {
    // Defer reply first so we can safely use editReply in both success and catch paths
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const subcommand = interaction.options.getSubcommand();
    const userId = interaction.user.id;

    try {
      // ------------------- Handle 'check' subcommand -------------------
      if (subcommand === 'check') {
        const tokenRecord = await getOrCreateToken(userId);

        // Prepare embed response
        const embed = new EmbedBuilder()
          .setTitle(`${interaction.user.username}'s Token Balance`)
          .addFields(
            { name: '🪙 **Current Total**', value: `> **${tokenRecord.tokens || 0}**`, inline: false }
          )
          .setColor(0xAA926A)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: 'Tokens' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
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
      try {
        await interaction.editReply({
          content: fullMessage,
          flags: [MessageFlags.Ephemeral],
        });
      } catch (replyError) {
        if (replyError.name === 'InteractionNotReplied' || replyError.code === 'InteractionNotReplied') {
          await interaction.reply({
            content: fullMessage,
            ephemeral: true,
          }).catch(() => {});
        } else {
          throw replyError;
        }
      }
    }
  },
};
