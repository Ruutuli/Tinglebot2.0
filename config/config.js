require('dotenv').config();
const fs = require('fs');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');

// Load Google service account credentials
const serviceAccountPath = path.join(__dirname, 'service_account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

// Load other sensitive information
const credentialsPath = path.join(__dirname, 'credentials.json');
const googleCredentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

const tokenPath = path.join(__dirname, 'token.json');
const googleTokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

module.exports = {
  discordToken: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildIds: process.env.GUILD_IDS.split(','),
  itemsSpreadsheetId: process.env.ITEMS_SPREADSHEET_ID,
  mongodbTinglebotUri: process.env.MONGODB_TINGLEBOT_URI,
  mongodbInventoriesUri: process.env.MONGODB_INVENTORIES_URI,
  serviceAccount,
  googleCredentials,
  googleTokens,
};

