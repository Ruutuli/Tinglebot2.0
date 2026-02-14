// ============================================================================
// INACTIVE COMMAND
// ============================================================================
// Sets a user as inactive by removing all their roles and giving them the INACTIVE role

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');

// Inactive role ID from server-data.json
const INACTIVE_ROLE_ID = '788148064182730782';

// Channel to notify when members become active/inactive (via /inactive and /active commands)
const ACTIVE_INACTIVE_LOG_CHANNEL_ID = '658148069212422194';

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
    ),

  async execute(interaction) {
    try {
      // Defer reply since this might take a moment
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const targetUser = interaction.options.getUser('user') || interaction.user;
      const targetMember = await interaction.guild.members.fetch(targetUser.id);

      // Check if user has permission (must be admin or marking themselves)
      const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);
      const isSelf = targetUser.id === interaction.user.id;

      if (!isAdmin && !isSelf) {
        return await interaction.editReply({
          content: '❌ You do not have permission to mark other users as inactive. You can only mark yourself as inactive.'
        });
      }

      // Get the inactive role
      const inactiveRole = await interaction.guild.roles.fetch(INACTIVE_ROLE_ID);
      if (!inactiveRole) {
        return await interaction.editReply({
          content: '❌ Could not find the INACTIVE role. Please contact an administrator.'
        });
      }

      // Check if user is already inactive
      if (targetMember.roles.cache.has(INACTIVE_ROLE_ID)) {
        return await interaction.editReply({
          content: `⚠️ ${targetUser.username} is already marked as inactive.`
        });
      }

      // Check bot permissions BEFORE attempting role changes
      const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
      
      // Check if bot has ManageRoles permission
      if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return await interaction.editReply({
          content: '❌ **Bot Missing Permissions**: I need the `Manage Roles` permission to mark users as inactive.\n\n*Please contact a server administrator to grant me this permission.*'
        });
      }

      // Get all roles to remove (excluding @everyone and bot-managed roles)
      const rolesToRemove = targetMember.roles.cache.filter(role => {
        return role.id !== interaction.guild.id && // Not @everyone
               !role.managed && // Not a bot-managed role
               role.id !== INACTIVE_ROLE_ID; // Not the inactive role itself
      });

      // Check if bot's highest role is high enough
      const botHighestRole = botMember.roles.highest;
      const targetHighestRole = targetMember.roles.highest;
      
      if (botHighestRole.position <= targetHighestRole.position) {
        return await interaction.editReply({
          content: `❌ **Role Hierarchy Issue**: My highest role (${botHighestRole.name}) is not high enough to modify ${targetUser.username}'s roles.\n\n*Please ask a server administrator to move my role higher in the role list.*`
        });
      }

      // Check if there are any roles that the bot can't remove due to hierarchy
      const unremovableRoles = rolesToRemove.filter(role => role.position >= botHighestRole.position);
      if (unremovableRoles.size > 0) {
        const roleNames = unremovableRoles.map(r => r.name).join(', ');
        return await interaction.editReply({
          content: `❌ **Role Hierarchy Issue**: I cannot remove the following role(s) because they are higher than or equal to my highest role:\n\n**Roles:** ${roleNames}\n\n*Please ask a server administrator to move my role higher in the role list.*`
        });
      }

      // Check if inactive role can be added (hierarchy check)
      if (inactiveRole.position >= botHighestRole.position) {
        return await interaction.editReply({
          content: `❌ **Role Hierarchy Issue**: The INACTIVE role is higher than or equal to my highest role. I cannot assign it.\n\n*Please ask a server administrator to move my role above the INACTIVE role.*`
        });
      }

      // Store removed roles for the confirmation message
      const removedRoleNames = rolesToRemove.map(role => role.name);

      // Remove all roles
      try {
        await targetMember.roles.remove(rolesToRemove);
      } catch (error) {
        console.error('[inactive.js]: Error removing roles:', error);
        
        // Provide more detailed error message
        let errorMsg = '❌ **Failed to Remove Roles**\n\n';
        if (error.code === 50013) {
          errorMsg += 'The bot lacks the necessary permissions. This could be due to:\n';
          errorMsg += '• Missing `Manage Roles` permission\n';
          errorMsg += '• Role hierarchy issues (some roles may be higher than my highest role)\n';
          errorMsg += '• Server-specific permission restrictions\n\n';
          errorMsg += '*Please contact a server administrator to resolve this issue.*';
        } else if (error.code === 10011) {
          errorMsg += 'One or more roles no longer exist on this server.\n\n';
          errorMsg += '*The target user may have already had their roles modified.*';
        } else {
          errorMsg += `An unexpected error occurred: \`${error.message}\`\n\n`;
          errorMsg += `Error Code: ${error.code || 'Unknown'}\n\n`;
          errorMsg += '*Please try again or contact a server administrator.*';
        }
        
        return await interaction.editReply({ content: errorMsg });
      }

      // Add the inactive role
      try {
        await targetMember.roles.add(inactiveRole);
      } catch (error) {
        console.error('[inactive.js]: Error adding inactive role:', error);
        
        // Provide more detailed error message
        let errorMsg = '❌ **Failed to Add INACTIVE Role**\n\n';
        if (error.code === 50013) {
          errorMsg += 'The bot lacks the necessary permissions. This could be due to:\n';
          errorMsg += '• Missing `Manage Roles` permission\n';
          errorMsg += '• The INACTIVE role is higher than my highest role\n';
          errorMsg += '• Server-specific permission restrictions\n\n';
          errorMsg += '*Please contact a server administrator to resolve this issue.*';
        } else if (error.code === 10011) {
          errorMsg += 'The INACTIVE role no longer exists on this server.\n\n';
          errorMsg += '*Please contact a server administrator to recreate the INACTIVE role.*';
        } else {
          errorMsg += `An unexpected error occurred: \`${error.message}\`\n\n`;
          errorMsg += `Error Code: ${error.code || 'Unknown'}\n\n`;
          errorMsg += '*Please try again or contact a server administrator.*';
        }
        
        return await interaction.editReply({ content: errorMsg });
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
      await interaction.editReply({ embeds: [embed] });

      // Notify activity log channel
      try {
        const logChannel = await interaction.client.channels.fetch(ACTIVE_INACTIVE_LOG_CHANNEL_ID);
        if (logChannel) {
          const displayName = targetMember.displayName ?? targetUser.username;
          await logChannel.send(`⚪ **${displayName}** is now **inactive**`);
        }
      } catch (err) {
        console.error('[inactive.js]: Could not post to activity log channel:', err);
      }

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
        content: '❌ **Unexpected Error**\n\nAn error occurred while marking the user as inactive.\n\n*Please try again or contact an administrator if the issue persists.*'
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorMessage);
      } else {
        await interaction.reply({ ...errorMessage, flags: MessageFlags.Ephemeral });
      }
    }
  }
};

