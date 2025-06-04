require('dotenv').config();
const fs = require('fs');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');
const dotenv = require('dotenv');

// Load Google service account credentials
let serviceAccount;
if (process.env.RAILWAY_ENVIRONMENT) {
    // Create service account object from environment variables
    serviceAccount = {
        type: "service_account",
        project_id: process.env.GOOGLE_PROJECT_ID,
        private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        client_id: process.env.GOOGLE_CLIENT_ID,
        auth_uri: "https://accounts.google.com/o/oauth2/auth",
        token_uri: "https://oauth2.googleapis.com/token",
        auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
        client_x509_cert_url: process.env.GOOGLE_CLIENT_X509_CERT_URL,
        universe_domain: "googleapis.com"
    };
} else {
    // Local environment - read from file
    const serviceAccountPath = path.join(__dirname, 'service_account.json');
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
}

// Load other sensitive information
const credentialsPath = path.join(__dirname, 'credentials.json');
const googleCredentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));

const tokenPath = path.join(__dirname, 'token.json');
const googleTokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

// Game constants
const RAID_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

// Load environment variables based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: `.env.${env}` });

const config = {
  discordToken: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildIds: env === 'development' 
    ? [process.env.TEST_GUILD_ID]
    : [process.env.PROD_GUILD_ID],
  itemsSpreadsheetId: process.env.ITEMS_SPREADSHEET_ID,
  mongodbTinglebotUri: process.env.MONGODB_TINGLEBOT_URI,
  mongodbInventoriesUri: process.env.MONGODB_INVENTORIES_URI,
  serviceAccount,
  googleCredentials,
  googleTokens,
  RAID_DURATION,
};

module.exports = config;

