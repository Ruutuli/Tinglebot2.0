// ------------------- Import necessary modules -------------------
const User = require('../models/UserModel');
const { handleError } = require('../utils/globalErrorHandler');

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
    
    // Add XP to user
    const result = await user.addXP(finalXP, xpSource);
    
    // Update message tracking
    await user.updateMessageTime();
    
    // Log XP gain
    console.log(`[levelingModule]: ${message.author.tag} gained ${finalXP} XP (Level ${result.newLevel})`);
    
    // Send level up notification if user leveled up
    if (result.leveledUp) {
      await sendLevelUpNotification(message, result.newLevel, finalXP);
    }
    
  } catch (error) {
    handleError(error, 'levelingModule.js');
    console.error(`[levelingModule]: Error handling XP for ${message.author.id}:`, error);
  }
}

/**
 * Send level up notification to the channel
 * @param {Message} message - Original message that triggered level up
 * @param {number} newLevel - The new level reached
 * @param {number} xpGained - XP gained from the message
 */
async function sendLevelUpNotification(message, newLevel, xpGained) {
  try {
    const embed = {
      color: 0x00ff00,
      title: '🎉 Level Up!',
      description: `${message.author} has reached **Level ${newLevel}**!`,
      fields: [
        {
          name: 'XP Gained',
          value: `+${xpGained} XP`,
          inline: true
        },
        {
          name: 'New Level',
          value: `${newLevel}`,
          inline: true
        }
      ],
      thumbnail: {
        url: message.author.displayAvatarURL({ dynamic: true })
      },
      footer: {
        text: 'Keep chatting to level up more!',
        icon_url: message.client.user.displayAvatarURL()
      },
      timestamp: new Date().toISOString()
    };
    
    await message.channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`[levelingModule]: Error sending level up notification:`, error);
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
 * Create XP progress bar
 * @param {number} current - Current XP progress
 * @param {number} needed - XP needed for next level
 * @param {number} length - Length of progress bar (default 20)
 * @returns {string} Progress bar string
 */
function createProgressBar(current, needed, length = 20) {
  const percentage = current / needed;
  const filled = Math.round(percentage * length);
  const empty = length - filled;
  
  return '█'.repeat(filled) + '░'.repeat(empty);
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
