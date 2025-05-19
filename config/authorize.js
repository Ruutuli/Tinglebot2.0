const { google } = require('googleapis');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');

const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'service_account.json');

async function authorize() {
    const auth = new google.auth.GoogleAuth({
        keyFile: SERVICE_ACCOUNT_PATH,
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets', // Access spreadsheets
            'https://www.googleapis.com/auth/drive',       // Full access to Google Drive
            'https://www.googleapis.com/auth/drive.file',  // Manage files
        ],
    });

    return await auth.getClient();
}

module.exports = {
    authorize,
};
