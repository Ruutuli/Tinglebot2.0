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
 * @returns {Promise<boolean>} - True if message was sent successfully, false otherwise
 */
async function sendUserDM(userId, message) {
  try {
    const user = await client.users.fetch(userId);
    if (user) {
      await user.send(message);
      return true;
    }
    return false;
  } catch (error) {
    handleError(error, 'messageUtils.js');
    console.error(`[messageUtils]❌ Failed to send DM to user ${userId}:`, error.message);
    return false;
  }
}

module.exports = { 
  trackLastMessage,
  sendUserDM 
};
