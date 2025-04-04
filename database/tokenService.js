// =================== STANDARD LIBRARIES ===================
// ------------------- Google APIs Library -------------------
// Import the googleapis library for interacting with Google Sheets API.
const { google } = require('googleapis');


// =================== DATABASE CONNECTIONS ===================
// ------------------- Connect to Tinglebot Database -------------------
// Import the function to establish a connection to the Tinglebot database.
const { connectToTinglebot } = require('../database/connection');


// =================== UTILITY FUNCTIONS ===================
// ------------------- Google Sheets Utilities -------------------
// Import utility functions for Google Sheets operations.
const { readSheetData, appendSheetData, authorizeSheets, extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/googleSheetsUtils');


// =================== DATABASE MODELS ===================
// ------------------- Import User Model -------------------
// Import the User model for database operations related to user token management.
const User = require('../models/UserModel');



// =================== TOKEN SERVICE FUNCTIONS ===================
// ------------------- Get Token Balance -------------------
// Fetches the token balance for a user based on their Discord ID.
async function getTokenBalance(userId) {
  try {
      const user = await User.findOne({ discordId: userId });
      return user?.tokens || 0;
  } catch (error) {
      console.error('[tokenService.js]: ❌ Error fetching token balance:', error);
      throw error;
  }
}

// ------------------- Get or Create Token -------------------
// Retrieves a token for the user or creates a new record if one does not exist.
// Non-essential console logs have been removed for cleaner operation.
async function getOrCreateToken(userId, tokenTrackerLink = '') {
  await connectToTinglebot();
  let user = await User.findOne({ discordId: userId });

  if (!user) {
    user = new User({
        discordId: userId,
        tokens: 0,
        tokenTracker: tokenTrackerLink || '',
        tokensSynced: false,
    });
    await user.save();
  } else if (tokenTrackerLink && !user.tokenTracker) {
    user.tokenTracker = tokenTrackerLink;
    await user.save();
  }
  return user;
}

// ------------------- Update Token Balance -------------------
// Updates the token balance for a user by a specified amount.
// Throws an error if the resulting token balance would be negative.
async function updateTokenBalance(userId, change) {
  try {
      if (isNaN(change)) {
          throw new Error(`[tokenService.js]: Invalid token change value provided: ${change}`);
      }
      const user = await User.findOneAndUpdate(
          { discordId: userId },
          {},
          { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      const currentBalance = user.tokens || 0;
      const newBalance = currentBalance + change;
      if (newBalance < 0) {
          throw new Error(`[tokenService.js]: Insufficient tokens. Current balance: ${currentBalance}, Change: ${change}`);
      }
      user.tokens = newBalance;
      await user.save();
      return newBalance;
  } catch (error) {
      console.error(`[tokenService.js]: ❌ Error updating token balance for user ID ${userId}:`, error);
      throw error;
  }
}

// ------------------- Sync Token Tracker -------------------
// Synchronizes the user's token tracker with data from Google Sheets and updates the token balance.
// Validates the Google Sheets URL and processes the token data.
async function syncTokenTracker(userId) {
  await connectToTinglebot();
  const user = await getOrCreateToken(userId);
  if (!user.tokenTracker || !isValidGoogleSheetsUrl(user.tokenTracker)) {
    const errorMessage = 'Invalid Google Sheets URL';
    console.error(`[tokenService.js]: ${errorMessage}`, { userId, tokenTracker: user.tokenTracker });
    throw new Error(errorMessage);
  }
  const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
  const auth = await authorizeSheets();

  try {
    const range = "loggedTracker!B7:F";
    const tokenData = await readSheetData(auth, spreadsheetId, range);
    if (!tokenData || tokenData.length === 0) {
      throw new Error('No data found in the specified range.');
    }

    let totalEarned = 0;
    let totalSpent = 0;
    tokenData.forEach((row, index) => {
      const type = row[3]?.toLowerCase();
      const amount = parseInt(row[4], 10);
      if (!type || isNaN(amount)) {
        console.warn(`[tokenService.js]: Skipping row ${index + 7} due to invalid data.`);
        return;
      }
      if (type === 'earned') {
        totalEarned += amount;
      } else if (type === 'spent') {
        totalSpent += Math.abs(amount);
      }
    });

    user.tokens = totalEarned - totalSpent;
    user.tokensSynced = true;
    await user.save();

    // Optionally, append an "Initial Sync" row to the Google Sheet
    const syncRow = ['Initial Sync', 'You can delete this!', '', 'sync', '0'];
    await appendSheetData(auth, spreadsheetId, "loggedTracker!B:F", [syncRow]);
    return user;
  } catch (error) {
    console.error('[tokenService.js]: ❌ Error syncing token tracker:', error);
    throw new Error('Error syncing token tracker.');
  }
}

// ------------------- Append Earned Tokens -------------------
// Appends a new entry with earned token data to the user's Google Sheet.
// Enhances the Google Sheet with a formatted row for earned tokens.
async function appendEarnedTokens(userId, fileName, category, amount, fileUrl = '') {
  const user = await getOrCreateToken(userId);
  const tokenTrackerLink = user.tokenTracker;
  if (!isValidGoogleSheetsUrl(tokenTrackerLink)) {
    throw new Error(`[tokenService.js]: Invalid Google Sheets URL for user ${userId}`);
  }
  const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
  const auth = await authorizeSheets();
  const checkRange = 'loggedTracker!B7:F';
  let nextRow = 7;
  try {
    const response = await google.sheets({ version: 'v4', auth }).spreadsheets.values.get({
      spreadsheetId,
      range: checkRange,
    });
    const rows = response.data.values || [];
    nextRow += rows.length;
    const appendRange = `loggedTracker!B${nextRow}:F`;
    const newRow = [
      fileName,
      fileUrl,
      category,
      'earned',
      `${amount}`
    ];
    await google.sheets({ version: 'v4', auth }).spreadsheets.values.update({
      spreadsheetId,
      range: appendRange,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newRow] },
    });
  } catch (error) {
    console.error(`[tokenService.js]: ❌ Error appending earned token data: ${error.message}`);
    throw new Error('Error appending earned token data to the Google Sheet.');
  }
}

// ------------------- Append Spent Tokens -------------------
// Appends a new entry with spent token data to the user's Google Sheet.
async function appendSpentTokens(userId, purchaseName, amount, link = '') {
  try {
      const user = await getOrCreateToken(userId);
      const tokenTrackerLink = user.tokenTracker;
      if (!isValidGoogleSheetsUrl(tokenTrackerLink)) {
          throw new Error(`[tokenService.js]: Invalid Google Sheets URL for user ID: ${userId}`);
      }
      const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
      const auth = await authorizeSheets();
      const newRow = [
          purchaseName,
          link,
          '',
          'spent',
          `-${amount}`
      ];
      await appendSheetData(auth, spreadsheetId, 'loggedTracker!B7:F', [newRow]);
  } catch (error) {
      console.error('[tokenService.js]: ❌ Error appending spent token data:', error);
      throw error;
  }
}

// ------------------- Get User's Google Sheets ID -------------------
// Retrieves the Google Sheets ID for the user based on their token tracker URL.
async function getUserGoogleSheetId(userId) {
  try {
    const user = await User.findOne({ discordId: userId });
    if (user && user.tokenTracker) {
      if (!isValidGoogleSheetsUrl(user.tokenTracker)) {
        throw new Error(`[tokenService.js]: Invalid Google Sheets URL for user ${userId}`);
      }
      return extractSpreadsheetIdFromUrl(user.tokenTracker);
    } else {
      console.error(`[tokenService.js]: No Token Tracker linked for user ${userId}`);
      return null;
    }
  } catch (error) {
    console.error(`[tokenService.js]: ❌ Error retrieving Token Tracker ID for user ${userId}:`, error.message);
    return null;
  }
}

// ------------------- Extract Spreadsheet ID from URL -------------------
// Helper function to extract the Spreadsheet ID from a Google Sheets URL.
function extractSpreadsheetIdFromUrl(url) {
  const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}


// =================== EXPORT FUNCTIONS ===================
// ------------------- Export Token Service Functions -------------------
// Exports all functions to be used by other modules.
module.exports = {
  getOrCreateToken,
  updateTokenBalance,
  syncTokenTracker,
  appendEarnedTokens,
  appendSpentTokens,
  getUserGoogleSheetId,
  getTokenBalance 
};
