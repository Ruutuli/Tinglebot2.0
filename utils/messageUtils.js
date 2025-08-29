// ------------------- Message Utils for User Activity Tracking -------------------
const User = require("../models/UserModel");
const { handleError } = require('../utils/globalErrorHandler');

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

    const result = await User.findOneAndUpdate(
      { discordId },
      { $set: update },
      { new: true, upsert: true }
    );

    console.log(`[messageUtils]: Updated last message for ${discordId}`);
  } catch (err) {
    handleError(err, 'messageUtils.js');
    console.error(`[messageUtils]: Error tracking message for ${message.author.id}`, err);
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
      console.log(`[messageUtils] ℹ️ Cannot send DM to user ${userId}: User has blocked bot or disabled DMs`);
      return false;
    } else if (error.code === 10013) {
      // Unknown user
      console.log(`[messageUtils] ℹ️ Cannot send DM to user ${userId}: User not found`);
      return false;
    } else if (error.code === 50001) {
      // Missing access
      console.log(`[messageUtils] ℹ️ Cannot send DM to user ${userId}: Missing access to user`);
      return false;
    } else {
      // Other errors - log with handleError for monitoring
      handleError(error, 'messageUtils.js', {
        operation: 'sendUserDM',
        userId: userId,
        errorCode: error.code,
        errorMessage: error.message
      });
      console.error(`[messageUtils] ❌ Failed to send DM to user ${userId}:`, error.message);
      return false;
    }
  }
}

module.exports = { 
  trackLastMessage,
  sendUserDM 
};
