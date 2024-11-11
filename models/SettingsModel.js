// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');

// ------------------- Define the settings schema -------------------
const settingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true }, // Unique Guild ID for settings
  birthdayChannel: { type: String, required: true }, // Channel for birthday notifications
  timezone: { type: String, required: true } // Timezone for the guild
}, { collection: 'settings' }); // Set collection name to 'settings'

// ------------------- Export the Settings model -------------------
const Settings = mongoose.model('Settings', settingsSchema);
module.exports = Settings;

