// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');

// ------------------- Define the token schema -------------------
const tokenSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // ID of the user
  tokens: { type: Number, default: 0 }, // Number of tokens the user has
  tokenTrackerLink: { type: String, default: '' }, // Link to token tracking sheet or resource
  hasSynced: { type: Boolean, default: false } // Indicates if the tokens are synced
});

// ------------------- Export the Token model -------------------
const Token = mongoose.model('Token', tokenSchema);
module.exports = Token;

