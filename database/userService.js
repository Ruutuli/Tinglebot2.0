// ------------------- Import necessary modules and services -------------------
const User = require('../models/UserModel');
const { connectToTinglebot } = require('../database/connection');
const {
    authorizeSheets,
    appendSheetData,
    isValidGoogleSheetsUrl,
    extractSpreadsheetId
} = require('../utils/googleSheetsUtils');

// ------------------- Get or create a user by their Discord ID -------------------
async function getOrCreateUser(discordId, googleSheetsUrl, timezone) {
    await connectToTinglebot();
    let user = await User.findOne({ discordId });

    if (!user) {
        // Create a new user if none exists
        user = new User({
            discordId,
            googleSheetsUrl: googleSheetsUrl || '',
            timezone: timezone || 'UTC',
            tokens: 0,
            tokenTracker: '',
            blightedcharacter: false
        });
        await user.save();
    } else {
        // Update existing user with provided Google Sheets URL and timezone
        user.googleSheetsUrl = googleSheetsUrl || user.googleSheetsUrl || '';
        user.timezone = timezone || user.timezone || 'UTC';
        await user.save();
    }

    return user;
}

// ------------------- Get a user by their Discord ID -------------------
const getUserById = async (discordId) => {
    console.log(`Fetching user by Discord ID: ${discordId}`);
    await connectToTinglebot();
    const user = await User.findOne({ discordId });
    console.log(`User found: ${user ? user.discordId : 'Not found'}`);
    return user;
};

// ------------------- Update user's token balance and log the activity in Google Sheets -------------------
async function updateUserTokens(discordId, amount, activity, link = '') {
    await connectToTinglebot();
    const user = await User.findOne({ discordId });
  
    if (!user) {
      throw new Error('User not found');
    }
  
    // Update token balance
    user.tokens += amount;
    await user.save();
  
    // Log the token update in the Google Sheets if the user has a token tracker
    if (user.tokenTracker) {
      const auth = await authorizeSheets();
      const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
      const range = "loggedTracker!B:F";
      const dateTime = new Date().toISOString();
      const values = [
        ['Update', activity, link, amount.toString(), dateTime]
      ];
      await appendSheetData(auth, spreadsheetId, range, values);
    }
  
    return user;
  }
  

// ------------------- Update user's token tracker link -------------------
async function updateUserTokenTracker(discordId, tokenTracker) {
    await connectToTinglebot();
    const user = await User.findOneAndUpdate({ discordId }, { tokenTracker }, { new: true });

    if (!user) {
        throw new Error('User not found');
    }

    return user;
}

// ------------------- Export the service functions -------------------
module.exports = {
    getOrCreateUser,
    getUserById,
    updateUserTokens,
    updateUserTokenTracker
};

