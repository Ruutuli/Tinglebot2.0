// ------------------- Token Service -------------------
// Handles token management, synchronization with Google Sheets, and token balance updates

// ------------------- Imports -------------------
// Grouped imports logically by related functionality
const { connectToTinglebot } = require('../database/connection');
const User = require('../models/UserModel')
const { readSheetData, appendSheetData, authorizeSheets, extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/googleSheetsUtils');
const { google } = require('googleapis');

// ------------------- Get Token Balance -------------------
// Fetches the token balance for a user
async function getTokenBalance(userId) {
  try {
      const user = await User.findOne({ discordId: userId }); // Ensure `discordId` is used
      return user?.tokens || 0; // Return tokens or 0 if user not found
  } catch (error) {
      console.error('[tokenService:getTokenBalance]: Error fetching token balance:', error);
      throw error;
  }
}


// ------------------- Get or Create Token -------------------
// Fetches a token for the user or creates a new one if none exists
async function getOrCreateToken(userId, tokenTrackerLink = '') {
  await connectToTinglebot();
  let user = await User.findOne({ discordId: userId });

  if (!user) {
    user = new User({
        discordId: userId,
        tokens: 0, // Ensure tokens are initialized to 0
        tokenTracker: tokenTrackerLink || '',
        tokensSynced: false,
    });
    console.log(`[getOrCreateToken]: New user created with 0 tokens for Discord ID: ${userId}`);
    await user.save();
} else if (tokenTrackerLink && !user.tokenTracker) {
    console.log(`[getOrCreateToken]: Updating tokenTrackerLink for existing user ${userId}`);
    user.tokenTracker = tokenTrackerLink;
    await user.save();
}


  return user;
}

// ------------------- Update Token Balance -------------------
// Updates the token balance for a user by a specific amount
async function updateTokenBalance(userId, change) {
  try {
      console.log(`[updateTokenBalance]: Updating token balance for user ID: ${userId} with change: ${change}`);
      if (isNaN(change)) {
          throw new Error(`[updateTokenBalance]: Invalid token change value provided: ${change}`);
      }

      const user = await User.findOneAndUpdate(
          { discordId: userId },
          {},
          { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      const currentBalance = user.tokens || 0;
      const newBalance = currentBalance + change;

      if (newBalance < 0) {
          throw new Error(`[updateTokenBalance]: Insufficient tokens. Current balance: ${currentBalance}, Change: ${change}`);
      }

      user.tokens = newBalance;
      await user.save();

      console.log(`[updateTokenBalance]: Token balance updated successfully for user ID ${userId}. New balance: ${newBalance}`);
      return newBalance;
  } catch (error) {
      console.error(`[updateTokenBalance]: Error updating token balance for user ID ${userId}:`, error);
      throw error;
  }
}

// ------------------- Sync Token Tracker -------------------
// Syncs the user's token tracker with Google Sheets data and updates token balance
async function syncTokenTracker(userId) {
  await connectToTinglebot();
  const user = await getOrCreateToken(userId); // Retrieve user with tokenTracker

  console.log('[syncTokenTracker]: Retrieved user with tokenTracker:', user.tokenTracker); // Log the tokenTracker

  if (!user.tokenTracker || !isValidGoogleSheetsUrl(user.tokenTracker)) {
    const errorMessage = 'Invalid Google Sheets URL';
    console.error(errorMessage, { userId, tokenTracker: user.tokenTracker });
    throw new Error(errorMessage);
  }

  const spreadsheetId = extractSpreadsheetId(user.tokenTracker);
  console.log('[syncTokenTracker]: Extracted Spreadsheet ID:', spreadsheetId); // Log extracted ID
  const auth = await authorizeSheets();

  try {
    console.log('Reading data from Google Sheets...');
    const range = "loggedTracker!B7:F"; // Corrected tab name
    const tokenData = await readSheetData(auth, spreadsheetId, range);

    if (!tokenData || tokenData.length === 0) {
      throw new Error('No data found in the specified range.');
    }
    console.log('[syncTokenTracker]: Fetched token data:', tokenData); // Log fetched data

    let totalEarned = 0;
    let totalSpent = 0;

    // Process each row of data
    tokenData.forEach((row, index) => {
      const type = row[3]?.toLowerCase(); // Column E: 'earned' or 'spent'
      const amount = parseInt(row[4], 10); // Column F: Token amount

      if (!type || isNaN(amount)) {
        console.warn(`[syncTokenTracker]: Skipping row ${index + 7} due to invalid data.`);
        return; // Skip rows with invalid data
      }

      if (type === 'earned') {
        totalEarned += amount;
      } else if (type === 'spent') {
        totalSpent += Math.abs(amount); // Use absolute value for proper calculation
      }
    });

    console.log('[syncTokenTracker]: Total earned:', totalEarned);
    console.log('[syncTokenTracker]: Total spent:', totalSpent);

    // Update user token balance and mark as synced
    user.tokens = totalEarned - totalSpent;
    user.tokensSynced = true;
    await user.save();

    console.log('[syncTokenTracker]: Token balance updated successfully.');

    // Optionally append an "Initial Sync" row to the Google Sheet
    const syncRow = ['Initial Sync', 'You can delete this!', '', 'sync', '0'];
    await appendSheetData(auth, spreadsheetId, "loggedTracker!B:F", [syncRow]);

    return user;
  } catch (error) {
    console.error('Error syncing token tracker:', error);
    throw new Error('Error syncing token tracker.');
  }
}

// ------------------- Append Earned Tokens to Google Sheets -------------------
// Appends a new entry with earned token data to the user's Google Sheet in the "Earned" section
async function appendEarnedTokens(userId, fileName, category, amount, fileUrl = '') {
  const user = await getOrCreateToken(userId);
  const tokenTrackerLink = user.tokenTracker;

  if (!isValidGoogleSheetsUrl(tokenTrackerLink)) {
    throw new Error(`[tokenService.js]: Invalid Google Sheets URL for user ${userId}`);
  }

  const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
  const auth = await authorizeSheets();

  // Define the range to check for the next available row
  const checkRange = 'loggedTracker!B7:F';
  let nextRow = 7; // Default to the first row after the headers

  try {
    // Fetch existing data to determine the next available row
    const response = await google.sheets({ version: 'v4', auth }).spreadsheets.values.get({
      spreadsheetId,
      range: checkRange,
    });

    const rows = response.data.values || [];
    nextRow += rows.length; // Adjust nextRow based on existing data

    const appendRange = `loggedTracker!B${nextRow}:F`;

    // Prepare the data row
    const newRow = [
      fileName,  // Column B - Submission
      fileUrl,   // Column C - Link
      category,  // Column D - Category
      'earned',  // Column E - Type
      `${amount}` // Column F - Token Amount
    ];

    // Append data to the determined row
    await google.sheets({ version: 'v4', auth }).spreadsheets.values.update({
      spreadsheetId,
      range: appendRange,
      valueInputOption: 'USER_ENTERED',
      resource: { values: [newRow] },
    });

    console.log(`[tokenService.js]: Appended earned tokens for user ${userId} at row ${nextRow}`);
  } catch (error) {
    console.error(`[tokenService.js]: Error appending earned token data: ${error.message}`);
    throw new Error('Error appending earned token data to the Google Sheet.');
  }
}

// ------------------- Append Spent Tokens to Google Sheets -------------------
// Appends a new entry with spent token data to the user's Google Sheet in the "Spent" section
async function appendSpentTokens(userId, purchaseName, amount, link = '') {
  try {
      console.log(`[appendSpentTokens]: Appending spent tokens for user ID: ${userId}, Purchase: ${purchaseName}, Amount: ${amount}`);
      const user = await getOrCreateToken(userId);
      const tokenTrackerLink = user.tokenTracker;

      if (!isValidGoogleSheetsUrl(tokenTrackerLink)) {
          throw new Error(`[appendSpentTokens]: Invalid Google Sheets URL for user ID: ${userId}`);
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
      console.log(`[appendSpentTokens]: Successfully appended spent tokens for user ID: ${userId}`);
  } catch (error) {
      console.error('[appendSpentTokens]: Error appending spent token data:', error);
      throw error;
  }
}


// ------------------- Get User's Google Sheets ID -------------------
// Retrieves the user's Google Sheets ID based on their Discord ID
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
    console.error(`[tokenService.js]: Error retrieving Token Tracker ID for user ${userId}:`, error.message);
    return null;
  }
}

// ------------------- Extract Spreadsheet ID from URL -------------------
// Helper function to extract Spreadsheet ID from Google Sheets URL
function extractSpreadsheetIdFromUrl(url) {
  const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// ------------------- Exported Functions -------------------
module.exports = {
  getOrCreateToken,
  updateTokenBalance,
  syncTokenTracker,
  appendEarnedTokens,   // For earned tokens
  appendSpentTokens,    // For spent tokens
  getUserGoogleSheetId,
  getTokenBalance 
};
