// ------------------- Import necessary modules -------------------
const { authorizeSheets, fetchSheetData } = require('../utils/googleSheetsUtils');
const { updateTokenBalance } = require('../utils/tokenUtils');
const { extractSpreadsheetId } = require('../utils/validation');

// ------------------- Sync Token Tracker -------------------
// Syncs the user's token balance from the linked Google Sheet.
async function syncTokenTracker(interaction, userId) {
  const tokenRecord = await getOrCreateToken(userId); // Retrieve token record for user.

  if (!tokenRecord.tokenTrackerLink) {
    throw new Error('Token tracker link not set.'); // Error if no link is found.
  }

  const spreadsheetId = extractSpreadsheetId(tokenRecord.tokenTrackerLink); // Extract ID from the provided link.
  const auth = await authorizeSheets(); // Authorize Google Sheets access.
  const dataRange = 'Token Tracker!B7:G'; // Specify the data range.
  const sheetData = await fetchSheetData(auth, spreadsheetId, dataRange); // Fetch data from Google Sheets.

  let totalEarned = 0;
  let totalSpent = 0;

  // Process each row to calculate earned and spent tokens.
  sheetData.forEach(row => {
    const [earned, , , , tokenAmount] = row;
    if (earned.toLowerCase() === 'yes') {
      totalEarned += parseInt(tokenAmount, 10); // Add earned tokens.
    } else if (earned.toLowerCase() === 'no') {
      totalSpent += parseInt(tokenAmount, 10); // Add spent tokens.
    }
  });

  const newBalance = totalEarned - totalSpent; // Calculate new balance.
  await updateTokenBalance(userId, newBalance); // Update the user's token balance.

  await interaction.reply(`✅ Your token tracker has been synced. Your new balance is **${newBalance}** tokens.`); // Inform the user of the new balance.
}

module.exports = {
  syncTokenTracker,
};

