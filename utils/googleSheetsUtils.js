// ------------------- Google Sheets Utilities -------------------
// This module handles Google Sheets API integration for reading, writing, and managing data.

// ------------------- Imports -------------------
// Grouping imports for readability
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const Bottleneck = require('bottleneck');
const { GoogleAuth } = require('google-auth-library');

// ------------------- Constants -------------------
// Service account path and Google Sheets API scopes
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../config/service_account.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// Throttling requests to Google API using Bottleneck
const limiter = new Bottleneck({
    minTime: 200,  // Minimum time between API requests (milliseconds)
    maxConcurrent: 5  // Maximum number of concurrent API requests
});

// Initialize Google Sheets API
const auth = new GoogleAuth({ scopes: SCOPES });
const sheets = google.sheets({ version: 'v4', auth });

// ------------------- Authorize Google Sheets -------------------
// Authorizes Google Sheets API using the service account
async function authorizeSheets() {
    return new Promise((resolve, reject) => {
        fs.readFile(SERVICE_ACCOUNT_PATH, (err, content) => {
            if (err) {
                logErrorDetails(`Error loading service account file: ${err}`);
                return reject(`Error loading service account file: ${err}`);
            }

            const credentials = JSON.parse(content);
            const { client_email, private_key } = credentials;
            const auth = new google.auth.JWT(client_email, null, private_key, SCOPES);

            auth.authorize((err, tokens) => {
                if (err) {
                    logErrorDetails(`Error authorizing service account: ${err}`);
                    reject(`Error authorizing service account: ${err}`);
                } else {
                    resolve(auth);
                }
            });
        });
    });
}

// ------------------- API Request Throttling -------------------
// Makes API requests with throttling
async function makeApiRequest(fn) {
    return limiter.schedule(() => retryWithBackoff(fn));
}

// ------------------- Retry with Exponential Backoff -------------------
// Handles retries for API requests with exponential backoff in case of failure
async function retryWithBackoff(fn) {
    const retries = 3;
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            await delay(500 * Math.pow(2, i));  // Exponential backoff
        }
    }
}

// ------------------- Fetch Data from Google Sheets -------------------
// Retrieves data from a specified range in Google Sheets
async function fetchSheetData(auth, spreadsheetId, range) {
    return makeApiRequest(async () => {
        const response = await google.sheets({ version: 'v4', auth }).spreadsheets.values.get({
            spreadsheetId,
            range
        });
        return response.data.values;
    });
}

// ------------------- Append Data to Google Sheets -------------------
// Appends data to a specified range in Google Sheets
async function appendSheetData(auth, spreadsheetId, range, values) {
    if (!Array.isArray(values)) {
        throw new TypeError('Expected values to be an array');
    }

    const resource = {
        values: values.map(row => Array.isArray(row) ? row.map(value => (value != null ? value.toString() : '')) : [])
    };

    return makeApiRequest(async () => {
        await google.sheets({ version: 'v4', auth }).spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource
        });
    });
}

// ------------------- Write Data to Google Sheets -------------------
// Writes data to a specific range in Google Sheets
async function writeSheetData(auth, spreadsheetId, range, values) {
    const resource = {
        values: values.map(row => row.map(value => (typeof value === 'number') ? value : (value != null ? value.toString() : '')))
    };

    return makeApiRequest(async () => {
        await google.sheets({ version: 'v4', auth }).spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource
        });
    });
}

// ------------------- Batch Write Data to Google Sheets -------------------
// Writes a batch of data to Google Sheets, used for multiple rows or ranges
async function writeBatchData(auth, spreadsheetId, batchRequests) {
    const requests = batchRequests.map(batch => ({
        updateCells: {
            range: {
                sheetId: batch.sheetId,
                startRowIndex: parseInt(batch.range.split('!A')[1].split(':')[0], 10) - 1,
                endRowIndex: parseInt(batch.range.split('!A')[1].split(':')[0], 10),
                startColumnIndex: 0,
                endColumnIndex: 13
            },
            rows: batch.values.map(row => ({
                values: row.map(cell => ({
                    userEnteredValue: typeof cell === 'number' ? { numberValue: cell } : { stringValue: cell.toString() }
                }))
            })),
            fields: 'userEnteredValue'
        }
    }));

    return makeApiRequest(async () => {
        await google.sheets({ version: 'v4', auth }).spreadsheets.batchUpdate({
            spreadsheetId,
            resource: { requests }
        });
    });
}

// ------------------- Additional Google Sheets Functions -------------------

// Fetch data from Google Sheets for character embed module
const fetchDataFromSheet = async (spreadsheetId, range) => {
    const auth = await authorizeSheets();
    return fetchSheetData(auth, spreadsheetId, range);
};

// Update data in Google Sheets for character embed module
const updateDataInSheet = async (spreadsheetId, range, values) => {
    const auth = await authorizeSheets();
    return writeSheetData(auth, spreadsheetId, range, values);
};

// Append data to Google Sheets for character embed module
const appendDataToSheet = async (spreadsheetId, range, values) => {
    const auth = await authorizeSheets();
    return appendSheetData(auth, spreadsheetId, range, values);
};

// Read data from Google Sheets
async function readSheetData(auth, spreadsheetId, range) {
    return makeApiRequest(async () => {
        const response = await google.sheets({ version: 'v4', auth }).spreadsheets.values.get({ spreadsheetId, range });
        return response.data.values;
    });
}

// Clear formatting in Google Sheets with retry logic
async function clearSheetFormatting(auth, spreadsheetId, range) {
    return makeApiRequest(async () => {
        await google.sheets({ version: 'v4', auth }).spreadsheets.values.clear({ spreadsheetId, range });
    });
}

// Get the sheet ID by sheet name
async function getSheetIdByName(auth, spreadsheetId, sheetName) {
    return makeApiRequest(async () => {
        const response = await google.sheets({ version: 'v4', auth }).spreadsheets.get({ spreadsheetId });
        const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
        if (!sheet) {
            logErrorDetails(`Sheet with name "${sheetName}" not found`);
            throw new Error(`Sheet with name "${sheetName}" not found`);
        }
        return sheet.properties.sheetId;
    });
}

// Get the sheet ID by title
async function getSheetIdByTitle(auth, spreadsheetId, sheetTitle) {
    const response = await google.sheets({ version: 'v4', auth }).spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
    });
    const sheet = response.data.sheets.find(s => s.properties.title === sheetTitle);
    return sheet ? sheet.properties.sheetId : null;
}

// Get Google Sheets client
function getSheetsClient(auth) {
    return google.sheets({ version: 'v4', auth });
}

// Convert Wix image links to a usable format for Google Sheets
function convertWixImageLinkForSheets(wixLink) {
    const regex = /wix:image:\/\/v1\/([^/]+)\/[^#]+/;
    const match = wixLink.match(regex);
    return match ? `https://static.wixstatic.com/media/${match[1]}` : wixLink;
}

// Delete inventory data for a character from Google Sheets
async function deleteInventorySheetData(spreadsheetId, characterName) {
    const auth = await authorizeSheets();
    const sheets = google.sheets({ version: 'v4', auth });

    try {
        const sheet = await makeApiRequest(() =>
            sheets.spreadsheets.values.get({
                auth,
                spreadsheetId,
                range: 'loggedInventory!A2:M',
            })
        );

        const rows = sheet.data.values;
        if (!rows || rows.length === 0) {
            throw new Error('No data found.');
        }

        const updateRequests = rows.map((row, index) => {
            if (row[0] === characterName) {
                const updateData = ['', '', '', '', '', '', '', '', '', 'Item Deleted from Inventory'];
                return {
                    range: `loggedInventory!D${index + 2}:M${index + 2}`,
                    values: [updateData]
                };
            }
            return null;
        }).filter(request => request !== null);

        if (updateRequests.length === 0) {
            return `❌ **Character ${characterName} not found in the sheet.**`;
        }

        await makeApiRequest(() =>
            sheets.spreadsheets.values.batchUpdate({
                auth,
                spreadsheetId,
                resource: {
                    data: updateRequests,
                    valueInputOption: 'RAW'
                }
            })
        );

        return `✅ **Specific inventory data for character ${characterName} deleted from Google Sheets.**`;
    } catch (error) {
        logErrorDetails(error);
        throw error;
    }
}

// Validate Google Sheets URL
function isValidGoogleSheetsUrl(url) {
    const regex = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+\/(edit|view)(\?[^#]+)?(#.+)?$/;
    return regex.test(url);
}

// Extract Spreadsheet ID from URL
function extractSpreadsheetId(url) {
    if (typeof url !== 'string') {
        throw new Error('Invalid URL: URL must be a string');
    }
    const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// ------------------- Error Logging -------------------
// Logs error details to the console
function logErrorDetails(error) {
    console.error('❌ Error details:', error);
}

// ------------------- Export Functions -------------------
// Exporting all functions for external use
module.exports = {
    authorizeSheets,
    fetchSheetData,
    appendSheetData,
    writeSheetData,
    writeBatchData,
    getSheetsClient,
    readSheetData,
    clearSheetFormatting,
    getSheetIdByName,
    convertWixImageLinkForSheets,
    deleteInventorySheetData,
    isValidGoogleSheetsUrl,
    extractSpreadsheetId,
    getSheetIdByTitle,
    logErrorDetails,
    fetchDataFromSheet,
    updateDataInSheet,
    appendDataToSheet,
};
