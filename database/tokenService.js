// ------------------- Token Service -------------------
// Handles token management, synchronization with Google Sheets, and token balance updates

// ------------------- Imports -------------------
// Grouped imports logically by related functionality
const Token = require('../models/TokenModel');
const { connectToTinglebot } = require('../database/connection');
const {
  authorizeSheets,
  fetchSheetData,
  appendSheetData,
  extractSpreadsheetId,
  isValidGoogleSheetsUrl
} = require('../utils/googleSheetsUtils');
const User = require('../models/UserModel');

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
  let token = await Token.findOne({ userId });

  if (!token) {
    // Create a new token for the user if none exists
    token = new Token({
      userId,
      tokens: 0,
      tokenTrackerLink,
      hasSynced: false
    });
    await token.save();
  } else if (tokenTrackerLink) {
    // Update token tracker link if provided
    token.tokenTrackerLink = tokenTrackerLink;
    await token.save();
  }

  return token;
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
  const token = await getOrCreateToken(userId);

  if (token.hasSynced) {
    throw new Error('Tokens have already been synced.');
  }

  const tokenTrackerLink = token.tokenTrackerLink;
  if (!isValidGoogleSheetsUrl(tokenTrackerLink)) {
    const errorMessage = 'Invalid Google Sheets URL';
    console.error(errorMessage, { userId, tokenTrackerLink });
    throw new Error(errorMessage);
  }

  const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
  const auth = await authorizeSheets();

  try {
    // Fetch earned and spent token data from Google Sheets
    const earnedData = await fetchSheetData(auth, spreadsheetId, 'Token Tracker!B7:E');
    const spentData = await fetchSheetData(auth, spreadsheetId, 'Token Tracker!F7:G');

    let totalEarned = 0;
    let totalSpent = 0;

    // Sum up earned tokens
    earnedData.forEach(row => {
      const earnedAmount = parseInt(row[3], 10) || 0;
      totalEarned += earnedAmount;
    });

    // Sum up spent tokens
    spentData.forEach(row => {
      const spentAmount = parseInt(row[1], 10) || 0;
      totalSpent += spentAmount;
    });

    // Update token balance and mark as synced
    token.tokens = totalEarned - totalSpent;
    token.hasSynced = true;
    await token.save();

    // Append an "Initial Sync" row to the Google Sheet
    const syncRow = [
      'Initial Sync', '', 'sync', '0', 'Initial Sync', '0'
    ];
    await appendSheetData(auth, spreadsheetId, 'Token Tracker!B7:E', [syncRow]);

    return token;
  } catch (error) {
    console.error('Error fetching data from Google Sheets:', error);
    throw new Error('Error syncing token tracker.');
  }
}

// ------------------- Append Earned Tokens to Google Sheets -------------------
// Appends a new entry with earned token data to the user's Google Sheet in the "Earned" section
async function appendEarnedTokens(userId, fileName, category, amount, fileUrl = '') {
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
    fileName,       // Column B - Submission
    fileUrl,        // Column C - Link
    category,       // Column D - Category (art, writing, etc.)
    'earned',       // Column E - Type (earned)
    `${amount}`     // Column F - Token Amount (earned tokens are positive)
  ];

  try {
    // Append data to Token Tracker!B7:F
    await appendSheetData(auth, spreadsheetId, 'Token Tracker!B7:F', [newRow]);
  } catch (error) {
    console.error('Error appending earned token data to Google Sheets:', error.message);
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

