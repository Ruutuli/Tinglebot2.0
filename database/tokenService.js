// ------------------- Token Service -------------------
// Handles token management, synchronization with Google Sheets, and token balance updates

// ------------------- Imports -------------------
// Grouped imports logically by related functionality
const Token = require('../models/TokenModel');
const { connectToTinglebot } = require('../database/connection');
const User = require('../models/UserModel');
const { readSheetData, appendSheetData, authorizeSheets, extractSpreadsheetId, isValidGoogleSheetsUrl } = require('../utils/googleSheetsUtils');

// ------------------- Get Token Balance -------------------
// Fetches the token balance for a user
async function getTokenBalance(userId) {
  await connectToTinglebot();
  const token = await Token.findOne({ userId });
  
  if (!token) {
    throw new Error('User not found');
  }

  return token.tokens; // Return the token balance
}

// ------------------- Get or Create Token -------------------
// Fetches a token for the user or creates a new one if none exists
async function getOrCreateToken(userId, tokenTrackerLink = '') {
  await connectToTinglebot();
  let user = await User.findOne({ discordId: userId });

  if (!user) {
    console.log('[tokenService.js]: Creating new user with tokenTracker:', tokenTrackerLink);
    user = new User({
      discordId: userId,
      tokens: 0,
      tokenTracker: tokenTrackerLink || '', // Ensure tokenTracker is set to an empty string if not provided
      tokensSynced: false,
    });
    await user.save();
  } else if (tokenTrackerLink) {
    console.log('[tokenService.js]: Updating tokenTrackerLink for user:', { userId, tokenTrackerLink });
    user.tokenTracker = tokenTrackerLink; // Update tokenTracker if a new link is provided
    await user.save();
  }

  return user;
}


// ------------------- Update Token Balance -------------------
// Updates the token balance for a user by a specific amount
async function updateTokenBalance(userId, amount) {
  await connectToTinglebot();
  const token = await Token.findOne({ userId });
  if (!token) {
    throw new Error('User not found');
  }

  // Adjust token balance
  token.tokens += amount;
  await token.save();

  return token;
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
  const token = await getOrCreateToken(userId);
  const tokenTrackerLink = token.tokenTrackerLink;

  if (!isValidGoogleSheetsUrl(tokenTrackerLink)) {
      throw new Error('Invalid Google Sheets URL');
  }

  const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
  const auth = await authorizeSheets();

  const newRow = [
      fileName,       // Column B - Submission
      fileUrl,        // Column C - Link
      category,       // Column D - Category (art, writing, etc.)
      'earned',       // Column E - Type (earned)
      `${amount}`     // Column F - Token Amount (earned tokens are positive)
  ];

  try {
      await appendSheetData(auth, spreadsheetId, 'Token Tracker!B7:F', [newRow]);
  } catch (error) {
      throw new Error('Error appending earned token data to the Google Sheet.');
  }
}


// ------------------- Append Spent Tokens to Google Sheets -------------------
// Appends a new entry with spent token data to the user's Google Sheet in the "Spent" section
async function appendSpentTokens(userId, purchaseName, amount, link = '') {
  const token = await getOrCreateToken(userId);
  const tokenTrackerLink = token.tokenTrackerLink;

  if (!isValidGoogleSheetsUrl(tokenTrackerLink)) {
    const errorMessage = 'Invalid Google Sheets URL';
    console.error(errorMessage, { userId, tokenTrackerLink });
    throw new Error(errorMessage);
  }

  const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
  const auth = await authorizeSheets();

  const newRow = [
    purchaseName,    // Column B - Purchase Name
    link,            // Column C - Link (if applicable)
    '',              // Column D - Categories (empty for spent tokens)
    'spent',         // Column E - Type (spent)
    `-${amount}`     // Column F - Token Amount (spent tokens are negative)
  ];

  try {
    // Append data to Token Tracker!B7:F
    await appendSheetData(auth, spreadsheetId, 'Token Tracker!B7:F', [newRow]);
  } catch (error) {
    console.error('Error appending spent token data to Google Sheets:', error.message);
    throw new Error('Error appending spent token data to the Google Sheet.');
  }
}

// ------------------- Get User's Google Sheets ID -------------------
// Retrieves the user's Google Sheets ID based on their Discord ID
async function getUserGoogleSheetId(userId) {
  try {
    const user = await User.findOne({ discordId: userId });

    if (user && user.tokenTracker) {
      const spreadsheetId = extractSpreadsheetIdFromUrl(user.tokenTracker);
      return spreadsheetId;
    } else {
      console.error(`No Token Tracker linked for user ${userId}`);
      return null;
    }
  } catch (error) {
    console.error(`Error retrieving Token Tracker ID for user ${userId}:`, error.message);
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

