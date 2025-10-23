// ============================================================================
// ROLE COUNT VOICE CHANNELS MODULE
// ============================================================================

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const logger = require('../utils/logger');

// ============================================================================
// ------------------- Configuration -------------------
// ============================================================================

// Role IDs and their corresponding voice channel configurations
const ROLE_COUNT_CONFIG = {
  // Village roles
  '630837341124034580': { // Rudania
    emoji: '🔥',
    name: 'Rudania',
    channelName: '🔥Rudania: {count}',
    position: 0
  },
  '631507660524486657': { // Inariko
    emoji: '💧',
    name: 'Inariko', 
    channelName: '💧Inariko: {count}',
    position: 1
  },
  '631507736508629002': { // Vhintl
    emoji: '🌱',
    name: 'Vhintl',
    channelName: '🌱Vhintl: {count}',
    position: 2
  },
  '788137818135330837': { // Traveler
    emoji: '🗺️',
    name: 'Traveler',
    channelName: '🗺️Traveler: {count}',
    position: 3
  }
};

// ============================================================================
// ------------------- Core Functions -------------------
// ============================================================================

/**
 * Get the count of members with a specific role
 * @param {Guild} guild - The Discord guild
 * @param {string} roleId - The role ID to count
 * @returns {Promise<number>} - The number of members with the role
 */
async function getRoleMemberCount(guild, roleId) {
  try {
    const role = guild.roles.cache.get(roleId);
    if (!role) {
      logger.warn('SYSTEM', `Role ${roleId} not found in guild`);
      return 0;
    }
    
    // Get all members with this role
    const members = await guild.members.fetch();
    const count = members.filter(member => member.roles.cache.has(roleId)).size;
    
    return count;
  } catch (error) {
    logger.error('SYSTEM', `Error getting member count for role ${roleId}`);
    return 0;
  }
}

/**
 * Find existing role count voice channel
 * @param {Guild} guild - The Discord guild
 * @param {string} roleId - The role ID to find channel for
 * @returns {Promise<VoiceChannel|null>} - The voice channel or null if not found
 */
async function findRoleCountChannel(guild, roleId) {
  try {
    const config = ROLE_COUNT_CONFIG[roleId];
    if (!config) return null;
    
    // Look for existing channel with the role name pattern
    const channels = guild.channels.cache.filter(channel => 
      channel.type === ChannelType.GuildVoice && 
      channel.name.includes(config.name)
    );
    
    return channels.first() || null;
  } catch (error) {
    logger.error('SYSTEM', `Error finding role count channel for ${roleId}`);
    return null;
  }
}

/**
 * Create a new role count voice channel
 * @param {Guild} guild - The Discord guild
 * @param {string} roleId - The role ID to create channel for
 * @param {number} count - The current member count
 * @returns {Promise<VoiceChannel>} - The created voice channel
 */
async function createRoleCountChannel(guild, roleId, count) {
  try {
    const config = ROLE_COUNT_CONFIG[roleId];
    if (!config) {
      throw new Error(`No configuration found for role ${roleId}`);
    }
    
    const channelName = config.channelName.replace('{count}', count);
    
    // Create the voice channel
    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      position: config.position,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.Connect] // Prevent people from joining
        }
      ]
    });
    
    logger.success('SYSTEM', `Created role count channel: ${channelName}`);
    return channel;
  } catch (error) {
    logger.error('SYSTEM', `Error creating role count channel for ${roleId}`);
    throw error;
  }
}

/**
 * Update an existing role count voice channel
 * @param {VoiceChannel} channel - The voice channel to update
 * @param {number} count - The new member count
 * @returns {Promise<boolean>} - Success status
 */
async function updateRoleCountChannel(channel, count) {
  try {
    const config = Object.values(ROLE_COUNT_CONFIG).find(c => 
      channel.name.includes(c.name)
    );
    
    if (!config) {
      logger.warn('SYSTEM', `No config found for channel ${channel.name}`);
      return false;
    }
    
    const newName = config.channelName.replace('{count}', count);
    
    if (channel.name !== newName) {
      await channel.setName(newName);
      logger.success('SYSTEM', `Updated channel name: ${newName}`);
    }
    
    return true;
  } catch (error) {
    logger.error('SYSTEM', 'Error updating role count channel');
    return false;
  }
}

/**
 * Update all role count voice channels
 * @param {Guild} guild - The Discord guild
 * @returns {Promise<Object>} - Results of the update operation
 */
async function updateAllRoleCountChannels(guild) {
  const results = {
    updated: 0,
    created: 0,
    errors: 0,
    details: []
  };
  
  try {
    logger.info('SYSTEM', `Updating role count channels for guild ${guild.name}`);
    
    for (const [roleId, config] of Object.entries(ROLE_COUNT_CONFIG)) {
      try {
        // Get current member count for this role
        const count = await getRoleMemberCount(guild, roleId);
        
        // Find existing channel
        const existingChannel = await findRoleCountChannel(guild, roleId);
        
        if (existingChannel) {
          // Update existing channel
          const success = await updateRoleCountChannel(existingChannel, count);
          if (success) {
            results.updated++;
            results.details.push(`✅ Updated ${config.name}: ${count} members`);
          } else {
            results.errors++;
            results.details.push(`❌ Failed to update ${config.name}`);
          }
        } else {
          // Create new channel
          await createRoleCountChannel(guild, roleId, count);
          results.created++;
          results.details.push(`✅ Created ${config.name}: ${count} members`);
        }
      } catch (error) {
        logger.error('SYSTEM', `Error processing role ${roleId}`);
        results.errors++;
        results.details.push(`❌ Error with ${config.name}: ${error.message}`);
      }
    }
    
    logger.success('SYSTEM', `Role count update complete: ${results.updated} updated, ${results.created} created, ${results.errors} errors`);
    
  } catch (error) {
    logger.error('SYSTEM', 'Error updating role count channels');
    results.errors++;
  }
  
  return results;
}

/**
 * Initialize role count channels system
 * @param {Client} client - The Discord client
 */
function initializeRoleCountChannels(client) {
  logger.info('SYSTEM', 'Initializing role count channels system');
  
  // Update channels when bot starts
  client.once('ready', async () => {
    try {
      const guild = client.guilds.cache.first();
      if (guild) {
        await updateAllRoleCountChannels(guild);
      }
    } catch (error) {
      logger.error('SYSTEM', 'Error during initial role count update');
    }
  });
  
  // Update channels when members join/leave or roles change
  client.on('guildMemberAdd', async (member) => {
    try {
      await updateAllRoleCountChannels(member.guild);
    } catch (error) {
      logger.error('SYSTEM', 'Error updating role counts on member add');
    }
  });
  
  client.on('guildMemberRemove', async (member) => {
    try {
      await updateAllRoleCountChannels(member.guild);
    } catch (error) {
      logger.error('SYSTEM', 'Error updating role counts on member remove');
    }
  });
  
  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
      // Check if roles changed
      const oldRoles = oldMember.roles.cache.map(role => role.id);
      const newRoles = newMember.roles.cache.map(role => role.id);
      
      const rolesChanged = oldRoles.length !== newRoles.length || 
        !oldRoles.every(roleId => newRoles.includes(roleId));
      
      if (rolesChanged) {
        await updateAllRoleCountChannels(newMember.guild);
      }
    } catch (error) {
      logger.error('SYSTEM', 'Error updating role counts on member update');
    }
  });
}

// ============================================================================
// ------------------- Exports -------------------
// ============================================================================

module.exports = {
  initializeRoleCountChannels,
  updateAllRoleCountChannels,
  getRoleMemberCount,
  createRoleCountChannel,
  updateRoleCountChannel,
  ROLE_COUNT_CONFIG
};
