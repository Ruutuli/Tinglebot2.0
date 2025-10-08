// ============================================================================
// ACTIVE COMMAND
// ============================================================================
// Removes the INACTIVE role from a user so they can re-select their roles

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// Inactive role ID from server-data.json
const INACTIVE_ROLE_ID = '788148064182730782';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('active')
    .setDescription('▶️ Return to active status (removes INACTIVE role)')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to mark as active (leave blank to mark yourself)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

  async execute(interaction) {
    try {
      // Defer reply since this might take a moment
      await interaction.deferReply({ ephemeral: true });

      const targetUser = interaction.options.getUser('user') || interaction.user;
      const targetMember = await interaction.guild.members.fetch(targetUser.id);

      // Check if user has permission (must be admin or marking themselves)
      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);
      const isSelf = targetUser.id === interaction.user.id;

      if (!isAdmin && !isSelf) {
        return await interaction.editReply({
          content: '❌ You do not have permission to mark other users as active. You can only mark yourself as active.',
          ephemeral: true
        });
      }

      // Get the inactive role
      const inactiveRole = await interaction.guild.roles.fetch(INACTIVE_ROLE_ID);
      if (!inactiveRole) {
        return await interaction.editReply({
          content: '❌ Could not find the INACTIVE role. Please contact an administrator.',
          ephemeral: true
        });
      }

      // Check if user has the inactive role
      if (!targetMember.roles.cache.has(INACTIVE_ROLE_ID)) {
        return await interaction.editReply({
          content: `⚠️ ${targetUser.username} is not marked as inactive.`,
          ephemeral: true
        });
      }

      // Remove the inactive role
      try {
        await targetMember.roles.remove(inactiveRole);
      } catch (error) {
        console.error('[active.js]: Error removing inactive role:', error);
        return await interaction.editReply({
          content: '❌ Failed to remove the INACTIVE role. The bot may not have sufficient permissions.',
          ephemeral: true
        });
      }

      // Create success embed
      const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('▶️ User Returned to Active Status')
        .setDescription(`${targetUser} has been marked as active.`)
        .addFields(
          {
            name: '👤 User',
            value: `${targetUser.username} (${targetUser.id})`,
            inline: true
          },
          {
            name: '✅ INACTIVE Role Removed',
            value: 'The user can now access server channels normally.',
            inline: false
          },
          {
            name: '📋 Next Steps',
            value: '1. Head to 🔔》roles\n2. Re-select your roles (pronouns, village, notifications)\n3. Enjoy being back in the server!',
            inline: false
          }
        )
        .setTimestamp()
        .setFooter({ text: `Action performed by ${interaction.user.username}` });

      // Send confirmation to command user
      await interaction.editReply({ embeds: [embed], ephemeral: true });

      // Try to DM the target user (if not the same as command user)
      if (targetUser.id !== interaction.user.id) {
        try {
          const dmEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('▶️ Welcome Back!')
            .setDescription('You have been marked as active on the server! Your INACTIVE role has been removed.')
            .addFields(
              {
                name: '📋 Next Steps',
                value: '1. Head over to 🔔》roles\n2. Re-select your roles (pronouns, village, opt-in notifications)\n3. You now have full access to the server again!',
                inline: false
              },
              {
                name: '🎉 Welcome Back!',
                value: 'We\'re glad to have you back in the community!',
                inline: false
              }
            )
            .setTimestamp();

          await targetUser.send({ embeds: [dmEmbed] });
        } catch (error) {
          console.log(`[active.js]: Could not DM ${targetUser.tag} (DMs may be disabled)`);
        }
      }

      // Log the action
      console.log(`[active.js]: ${targetUser.tag} (${targetUser.id}) marked as active by ${interaction.user.tag} (${interaction.user.id})`);

    } catch (error) {
      console.error('[active.js]: Error in active command:', error);
      
      const errorMessage = {
        content: '❌ An error occurred while marking the user as active. Please try again or contact an administrator.',
        ephemeral: true
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
  }
};

