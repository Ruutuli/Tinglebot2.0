// ------------------- Message Utils for User Activity Tracking -------------------
const User = require("../models/UserModel");
const { handleError } = require('../utils/globalErrorHandler');
const logger = require('./logger');

/**
 * Logs the user's latest message to the database.
 * @param {Message} message - Discord.js Message object
 */
async function trackLastMessage(message) {
  if (message.author.bot || !message.guild) return;

  try {
    const discordId = message.author.id;

    const update = {
      lastMessageContent: message.content.slice(0, 1000),
      lastMessageTimestamp: new Date(),
    };

    await User.findOneAndUpdate(
      { discordId },
      { $set: update },
      { new: true, upsert: true }
    );
  } catch (err) {
    handleError(err, 'messageUtils.js');
    logger.error('SYSTEM', `Error tracking message for ${message.author.id}`);
  }
}

/**
 * Sends a DM to a user with error handling
 * @param {string} userId - Discord user ID
 * @param {string} message - Message to send
 * @param {Client} client - Discord client instance
 * @returns {Promise<boolean>} - True if message was sent successfully, false otherwise
 */
async function sendUserDM(userId, message, client) {
  try {
    const user = await client.users.fetch(userId);
    if (user) {
      await user.send(message);
      return true;
    }
    return false;
  } catch (error) {
    // Handle specific Discord API errors
    if (error.code === 50007) {
      // Cannot send messages to this user (blocked, DMs disabled, etc.)
      logger.info('SYSTEM', `Cannot DM user ${userId}: blocked/disabled`);
      return false;
    } else if (error.code === 10013) {
      // Unknown user
      logger.info('SYSTEM', `Cannot DM user ${userId}: not found`);
      return false;
    } else if (error.code === 50001) {
      // Missing access
      logger.info('SYSTEM', `Cannot DM user ${userId}: missing access`);
      return false;
    } else {
      // Other errors - log with handleError for monitoring
      handleError(error, 'messageUtils.js', {
        operation: 'sendUserDM',
        userId: userId,
        errorCode: error.code,
        errorMessage: error.message
      });
      logger.error('SYSTEM', `Failed to send DM to user ${userId}`);
      return false;
    }
  }
}

module.exports = { 
  trackLastMessage,
  sendUserDM 
};
