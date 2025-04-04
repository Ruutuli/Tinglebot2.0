// ------------------- Message Utils for User Activity Tracking -------------------
const User = require("../models/UserModel");

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
    console.error(`[messageUtils]: Error tracking message for ${message.author.id}`, err);
  }
}

module.exports = { trackLastMessage };
