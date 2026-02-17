// ------------------- Import necessary modules -------------------
const User = require('@/models/UserModel');
const MessageTracking = require('@/models/MessageTrackingModel');
const { EmbedBuilder } = require('discord.js');
const { handleError } = require('@/utils/globalErrorHandler');
const logger = require('@/utils/logger');

// ------------------- Leveling System Configuration -------------------
const XP_CONFIG = {
  MIN_XP: 15,
  MAX_XP: 25,
  COOLDOWN_MS: 60 * 1000, // 1 minute cooldown
  BONUS_XP_CHANNELS: {
    // Add specific channel IDs that give bonus XP
    // 'channel_id': { multiplier: 1.5, name: 'Channel Name' }
  }
};

// ------------------- Main Leveling Functions -------------------

/**
 * Handle XP gain for a user message
 * Works in all channels including threads, voice channels, and text channels
 * @param {Message} message - Discord.js Message object
 */
async function handleXP(message) {
  try {
    // Skip bot messages and DMs (but includes threads and all other channel types)
    if (message.author.bot || !message.guild) return;
    
    // Skip messages that are too short (spam prevention)
    if (message.content.length < 3) return;
    
    // Skip messages that are just emojis or commands
    if (message.content.startsWith('!') || message.content.startsWith('/')) return;
    
    const discordId = message.author.id;
    const user = await User.getOrCreateUser(discordId);
    
    // Check if user can gain XP (cooldown check)
    if (!user.canGainXP()) {
      return; // User is on cooldown
    }
    
    // Calculate XP amount (15-25 XP)
    const baseXP = Math.floor(Math.random() * (XP_CONFIG.MAX_XP - XP_CONFIG.MIN_XP + 1)) + XP_CONFIG.MIN_XP;
    
    // Check for bonus XP channels
    let finalXP = baseXP;
    let xpSource = 'message';
    
    if (XP_CONFIG.BONUS_XP_CHANNELS[message.channel.id]) {
      const bonusConfig = XP_CONFIG.BONUS_XP_CHANNELS[message.channel.id];
      finalXP = Math.floor(baseXP * bonusConfig.multiplier);
      xpSource = `message_${bonusConfig.name.toLowerCase().replace(/\s+/g, '_')}`;
    }
    
    // Add XP to user and update message tracking in a single save operation
    const result = await user.addXP(finalXP, xpSource, true);

    // Record message for profile activity chart (non-blocking)
    try {
      const dayKey = new Date().toISOString().split('T')[0];
      await MessageTracking.create({
        guildId: message.guild.id,
        userId: message.author.id,
        channelId: message.channel.id,
        messageId: message.id,
        content: (message.content || '').slice(0, 100),
        dayKey,
      });
    } catch (trackErr) {
      if (trackErr.code !== 11000) {
        logger.warn('LEVEL', `MessageTracking insert failed for ${message.id}: ${trackErr.message}`);
      }
    }

    // Log XP gain
    logger.info('LEVEL', `${message.author.tag} gained ${finalXP} XP${result.newLevel ? ` (Level ${result.newLevel})` : ''}`);
    
    // Send level up notification if user leveled up
    if (result.leveledUp) {
      await sendLevelUpNotification(message, result.newLevel, finalXP);
    }
    
  } catch (error) {
    handleError(error, 'levelingModule.js');
    logger.error('LEVEL', `Error handling XP for ${message.author.id}`);
  }
}

/**
 * Send level up notification to the channel and Sheikah Slate
 * @param {Message} message - Original message that triggered level up
 * @param {number} newLevel - The new level reached
 * @param {number} xpGained - XP gained from the message
 */
async function sendLevelUpNotification(message, newLevel, xpGained) {
  try {
    const embed = new EmbedBuilder()
      .setColor(0xFFD700) // Gold color for level ups
      .setTitle('🎉 Level Up!')
      .setDescription(`${message.author} has reached **Level ${newLevel}**!`)
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .addFields(
        {
          name: '⭐ XP Gained',
          value: `\`+${xpGained} XP\``,
          inline: true
        },
        {
          name: '📈 New Level',
          value: `\`Level ${newLevel}\``,
          inline: true
        }
      )
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setFooter({
        text: 'Keep chatting to level up more!',
        iconURL: message.client.user.displayAvatarURL()
      })
      .setTimestamp();
    
    // Send to Sheikah Slate channel (641858948802150400)
    const sheikahSlateChannelId = '641858948802150400';
    try {
      const sheikahSlateChannel = await message.client.channels.fetch(sheikahSlateChannelId);
      if (sheikahSlateChannel) {
        await sheikahSlateChannel.send({ embeds: [embed] });
        logger.info('LEVEL', `Level up announcement sent for ${message.author.tag}`);
      } else {
        logger.warn('LEVEL', `Sheikah Slate channel not found`);
      }
    } catch (channelError) {
      logger.error('LEVEL', 'Error sending to Sheikah Slate channel');
    }
    
  } catch (error) {
    logger.error('LEVEL', 'Error sending level up notification');
  }
}

/**
 * Get user's level information
 * @param {string} discordId - Discord user ID
 * @returns {Object} User level information
 */
async function getUserLevelInfo(discordId) {
  try {
    const user = await User.getOrCreateUser(discordId);
    const progress = user.getProgressToNextLevel();
    
    return {
      level: user.leveling?.level || 1,
      xp: user.leveling?.xp || 0,
      progress,
      totalMessages: user.leveling?.totalMessages || 0,
      rank: await getUserRank(discordId)
    };
  } catch (error) {
    handleError(error, 'levelingModule.js');
    console.error(`[levelingModule]: Error getting user level info for ${discordId}:`, error);
    return null;
  }
}

/**
 * Get user's rank in the server
 * @param {string} discordId - Discord user ID
 * @returns {number} User's rank (1-based)
 */
async function getUserRank(discordId) {
  try {
    const user = await User.findOne({ discordId });
    if (!user || !user.leveling) return null;
    
    const rank = await User.countDocuments({
      $or: [
        { 'leveling.level': { $gt: user.leveling.level } },
        { 'leveling.level': user.leveling.level, 'leveling.xp': { $gt: user.leveling.xp } }
      ]
    }) + 1;
    
    return rank;
  } catch (error) {
    console.error(`[levelingModule]: Error getting user rank for ${discordId}:`, error);
    return null;
  }
}

/**
 * Get top users leaderboard
 * @param {number} limit - Number of users to return
 * @returns {Array} Array of top users
 */
async function getLeaderboard(limit = 10) {
  try {
    return await User.getTopUsers(limit);
  } catch (error) {
    handleError(error, 'levelingModule.js');
    console.error(`[levelingModule]: Error getting leaderboard:`, error);
    return [];
  }
}

/**
 * Create XP progress bar with prettier styling
 * @param {number} current - Current XP progress
 * @param {number} needed - XP needed for next level
 * @param {number} length - Length of progress bar (default 10)
 * @returns {string} Progress bar string
 */
function createProgressBar(current, needed, length = 10) {
  const percentage = current / needed;
  const filled = Math.round(percentage * length);
  const empty = length - filled;
  
  // Use prettier Unicode characters for the progress bar
  let bar = '';
  
  if (filled === 0) {
    // Empty bar
    bar = '⬜'.repeat(length);
  } else if (filled === length) {
    // Full bar
    bar = '🟦'.repeat(length);
  } else {
    // Partial bar with gradient effect
    bar = '🟦'.repeat(filled) + '⬜'.repeat(empty);
  }
  
  return bar;
}

// ------------------- Export functions -------------------
module.exports = {
  handleXP,
  getUserLevelInfo,
  getUserRank,
  getLeaderboard,
  createProgressBar,
  XP_CONFIG
};
