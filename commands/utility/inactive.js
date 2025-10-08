// ============================================================================
// INACTIVE COMMAND
// ============================================================================
// Sets a user as inactive by removing all their roles and giving them the INACTIVE role

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// Inactive role ID from server-data.json
const INACTIVE_ROLE_ID = '788148064182730782';

// Roles that should NOT be removed (bot roles, @everyone, etc.)
const PROTECTED_ROLES = [
  '@everyone'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('inactive')
    .setDescription('⏸️ Mark a user as inactive (removes all roles and adds INACTIVE role)')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to mark as inactive (leave blank to mark yourself)')
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
          content: '❌ You do not have permission to mark other users as inactive. You can only mark yourself as inactive.',
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

      // Check if user is already inactive
      if (targetMember.roles.cache.has(INACTIVE_ROLE_ID)) {
        return await interaction.editReply({
          content: `⚠️ ${targetUser.username} is already marked as inactive.`,
          ephemeral: true
        });
      }

      // Get all roles to remove (excluding @everyone and bot-managed roles)
      const rolesToRemove = targetMember.roles.cache.filter(role => {
        return role.id !== interaction.guild.id && // Not @everyone
               !role.managed && // Not a bot-managed role
               role.id !== INACTIVE_ROLE_ID; // Not the inactive role itself
      });

      // Store removed roles for the confirmation message
      const removedRoleNames = rolesToRemove.map(role => role.name);

      // Remove all roles
      try {
        await targetMember.roles.remove(rolesToRemove);
      } catch (error) {
        console.error('[inactive.js]: Error removing roles:', error);
        return await interaction.editReply({
          content: '❌ Failed to remove roles. The bot may not have sufficient permissions.',
          ephemeral: true
        });
      }

      // Add the inactive role
      try {
        await targetMember.roles.add(inactiveRole);
      } catch (error) {
        console.error('[inactive.js]: Error adding inactive role:', error);
        return await interaction.editReply({
          content: '❌ Failed to add the INACTIVE role. The bot may not have sufficient permissions.',
          ephemeral: true
        });
      }

      // Create success embed
      const embed = new EmbedBuilder()
        .setColor('#FF8C00')
        .setTitle('⏸️ User Marked as Inactive')
        .setDescription(`${targetUser} has been marked as inactive.`)
        .addFields(
          {
            name: '👤 User',
            value: `${targetUser.username} (${targetUser.id})`,
            inline: true
          },
          {
            name: '📋 Roles Removed',
            value: removedRoleNames.length > 0 
              ? removedRoleNames.slice(0, 10).join(', ') + (removedRoleNames.length > 10 ? `\n...and ${removedRoleNames.length - 10} more` : '')
              : 'No roles to remove',
            inline: false
          },
          {
            name: '🔄 To Return to Active',
            value: '1. Read the rules in 🔔》rules\n2. Use `/active` command\n3. Re-select your roles in 🔔》roles',
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
            .setColor('#FF8C00')
            .setTitle('⏸️ You\'ve Been Marked as Inactive')
            .setDescription('You have been marked as inactive on the server. Your roles have been removed and you now have limited access to channels.')
            .addFields(
              {
                name: '🔄 How to Return to Active Status',
                value: '1. Read through 🔔》rules to check for any rule changes\n2. Use the `/active` command to mark yourself as active\n3. Head to 🔔》roles and re-select your roles to regain full access',
                inline: false
              },
              {
                name: '💡 Need Help?',
                value: 'Contact a moderator if you need assistance with your inactive status.',
                inline: false
              }
            )
            .setTimestamp();

          await targetUser.send({ embeds: [dmEmbed] });
        } catch (error) {
          console.log(`[inactive.js]: Could not DM ${targetUser.tag} (DMs may be disabled)`);
        }
      }

      // Log the action (you can add logging to a channel if needed)
      console.log(`[inactive.js]: ${targetUser.tag} (${targetUser.id}) marked as inactive by ${interaction.user.tag} (${interaction.user.id})`);

    } catch (error) {
      console.error('[inactive.js]: Error in inactive command:', error);
      
      const errorMessage = {
        content: '❌ An error occurred while marking the user as inactive. Please try again or contact an administrator.',
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

