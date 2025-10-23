// ============================================================================
// ROLE COUNT VOICE CHANNELS COMMAND
// ============================================================================

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { 
  updateAllRoleCountChannels, 
  getRoleMemberCount,
  ROLE_COUNT_CONFIG 
} = require('../../modules/roleCountChannelsModule');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rolecount')
    .setDescription('Manage role count voice channels')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription('Update all role count voice channels')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Show current role counts and channel status')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create role count voice channels for all configured roles')
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: [4096] }); // Ephemeral

    const subcommand = interaction.options.getSubcommand();

    try {
      switch (subcommand) {
        case 'update':
          await handleUpdate(interaction);
          break;
        case 'status':
          await handleStatus(interaction);
          break;
        case 'create':
          await handleCreate(interaction);
          break;
        default:
          await interaction.editReply({
            content: '❌ Unknown subcommand',
            flags: [4096]
          });
      }
    } catch (error) {
      console.error('[rolecount.js]: Error executing command:', error);
      await interaction.editReply({
        content: `❌ Error executing command: ${error.message}`,
        flags: [4096]
      });
    }
  }
};

// ============================================================================
// ------------------- Subcommand Handlers -------------------
// ============================================================================

/**
 * Handle the update subcommand
 */
async function handleUpdate(interaction) {
  try {
    const guild = interaction.guild;
    const results = await updateAllRoleCountChannels(guild);
    
    const embed = new EmbedBuilder()
      .setTitle('🔄 Role Count Channels Updated')
      .setColor(0x00ff88)
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .addFields(
        {
          name: '📊 Summary',
          value: `✅ Updated: ${results.updated}\n🆕 Created: ${results.created}\n❌ Errors: ${results.errors}`,
          inline: true
        },
        {
          name: '📝 Details',
          value: results.details.length > 0 ? results.details.join('\n') : 'No changes made',
          inline: false
        }
      )
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[rolecount.js]: Error in handleUpdate:', error);
    await interaction.editReply({
      content: `❌ Error updating role count channels: ${error.message}`,
      flags: [4096]
    });
  }
}

/**
 * Handle the status subcommand
 */
async function handleStatus(interaction) {
  try {
    const guild = interaction.guild;
    const statusFields = [];
    
    for (const [roleId, config] of Object.entries(ROLE_COUNT_CONFIG)) {
      try {
        const count = await getRoleMemberCount(guild, roleId);
        const role = guild.roles.cache.get(roleId);
        const roleName = role ? role.name : 'Unknown Role';
        
        // Check if channel exists
        const existingChannels = guild.channels.cache.filter(channel => 
          channel.type === 2 && // Voice channel
          channel.name.includes(config.name)
        );
        
        const channelStatus = existingChannels.size > 0 ? 
          `✅ ${existingChannels.first().name}` : 
          '❌ No channel found';
        
        statusFields.push({
          name: `${config.emoji} ${roleName}`,
          value: `**Count:** ${count}\n**Channel:** ${channelStatus}`,
          inline: true
        });
      } catch (error) {
        statusFields.push({
          name: `${config.emoji} ${config.name}`,
          value: `❌ Error: ${error.message}`,
          inline: true
        });
      }
    }
    
    const embed = new EmbedBuilder()
      .setTitle('📊 Role Count Channels Status')
      .setColor(0x0099ff)
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .addFields(statusFields)
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[rolecount.js]: Error in handleStatus:', error);
    await interaction.editReply({
      content: `❌ Error getting status: ${error.message}`,
      flags: [4096]
    });
  }
}

/**
 * Handle the create subcommand
 */
async function handleCreate(interaction) {
  try {
    const guild = interaction.guild;
    const results = await updateAllRoleCountChannels(guild);
    
    const embed = new EmbedBuilder()
      .setTitle('🆕 Role Count Channels Created/Updated')
      .setColor(0x00ff88)
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setDescription('Role count voice channels have been created or updated for all configured roles.')
      .addFields(
        {
          name: '📊 Results',
          value: `✅ Updated: ${results.updated}\n🆕 Created: ${results.created}\n❌ Errors: ${results.errors}`,
          inline: true
        },
        {
          name: '📝 Details',
          value: results.details.length > 0 ? results.details.join('\n') : 'No changes made',
          inline: false
        }
      )
      .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('[rolecount.js]: Error in handleCreate:', error);
    await interaction.editReply({
      content: `❌ Error creating role count channels: ${error.message}`,
      flags: [4096]
    });
  }
}
