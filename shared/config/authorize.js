const { google } = require('googleapis');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');

async function authorize() {
    let auth;
    if (process.env.RAILWAY_ENVIRONMENT) {
        // Create service account object from environment variables
        const serviceAccount = {
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
        auth = new google.auth.GoogleAuth({
            credentials: serviceAccount,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets', // Access spreadsheets
                'https://www.googleapis.com/auth/drive',       // Full access to Google Drive
                'https://www.googleapis.com/auth/drive.file',  // Manage files
            ],
        });
    } else {
        // Local environment - use key file
        const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'service_account.json');
        auth = new google.auth.GoogleAuth({
            keyFile: SERVICE_ACCOUNT_PATH,
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets', // Access spreadsheets
                'https://www.googleapis.com/auth/drive',       // Full access to Google Drive
                'https://www.googleapis.com/auth/drive.file',  // Manage files
            ],
        });
    }

    return await auth.getClient();
}

module.exports = authorize;
