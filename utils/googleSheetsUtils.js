// ------------------- Google Sheets Utilities -------------------
// This module handles Google Sheets API integration for reading, writing, and managing data.

// ============================================================================
// Standard Libraries
// ------------------- Importing Node.js core modules -------------------
const fs = require('fs');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');

// ============================================================================
// Third-Party Libraries
// ------------------- Importing third-party modules -------------------
const Bottleneck = require('bottleneck');
const { google } = require('googleapis');

// ============================================================================
// Constants
// ------------------- Define configuration constants -------------------
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../config/service_account.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// ------------------- Throttle Settings -------------------
// Throttles requests to the Google API to prevent rate limiting.
const limiter = new Bottleneck({
    minTime: 200,    // Minimum time (ms) between API requests
    maxConcurrent: 5 // Maximum concurrent API requests
});

// ============================================================================
// Authorization Functions
// ------------------- Authorize Google Sheets API -------------------
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
                    return reject(`Error authorizing service account: ${err}`);
                } else {
                    resolve(auth);
                }
            });
        });
    });
}

// ============================================================================
// API Request Helpers
// ------------------- Throttle API requests -------------------
async function makeApiRequest(fn) {
    return limiter.schedule(() => retryWithBackoff(fn));
}

// ------------------- Retry with Exponential Backoff -------------------
// Retries API requests with exponential backoff on failure.
async function retryWithBackoff(fn) {
    const retries = 3;
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
    handleError(error, 'googleSheetsUtils.js');

            if (i === retries - 1) throw error;
            await delay(500 * Math.pow(2, i)); // Exponential backoff delay
        }
    }
}

// ============================================================================
// Reading Functions
// ------------------- Fetch Data from Google Sheets with Sanitization -------------------
async function fetchSheetData(auth, spreadsheetId, range) {
    return makeApiRequest(async () => {
        const response = await google.sheets({ version: 'v4', auth }).spreadsheets.values.get({
            spreadsheetId,
            range
        });
        // Sanitize data: remove commas from numeric strings.
        const sanitizedValues = response.data.values.map(row =>
            row.map(cell => (typeof cell === 'string' && cell.includes(',')) ? cell.replace(/,/g, '') : cell)
        );
        return sanitizedValues;
    });
}

// ------------------- Read Data from Google Sheets -------------------
// Reads data from a specified range without sanitization.
async function readSheetData(auth, spreadsheetId, range) {
    return makeApiRequest(async () => {
        const response = await google.sheets({ version: 'v4', auth }).spreadsheets.values.get({
            spreadsheetId,
            range
        });
        return response.data.values;
    });
}

// ------------------- Clear Formatting in Google Sheets -------------------
// Clears formatting in a specified range in Google Sheets.
async function clearSheetFormatting(auth, spreadsheetId, range) {
    return makeApiRequest(async () => {
        await google.sheets({ version: 'v4', auth }).spreadsheets.values.clear({ spreadsheetId, range });
    });
}

// ------------------- Fetch Data for External Use -------------------
// Fetch data from Google Sheets for external modules.
const fetchDataFromSheet = async (spreadsheetId, range) => {
    const auth = await authorizeSheets();
    return fetchSheetData(auth, spreadsheetId, range);
};

// ============================================================================
// Writing Functions
// ------------------- Append Data to Google Sheets -------------------
async function appendSheetData(auth, spreadsheetId, range, values) {
    if (!Array.isArray(values)) {
        throw new TypeError('Expected values to be an array');
    }
    const resource = {
        values: values.map(row =>
            Array.isArray(row)
                ? row.map(value => (value != null ? value.toString() : ''))
                : []
        )
    };
    return makeApiRequest(async () => {
        try {
            await google.sheets({ version: 'v4', auth })
                .spreadsheets.values.append({
                    spreadsheetId,
                    range,
                    valueInputOption: 'USER_ENTERED',
                    resource
                });
        } catch (err) {
            logErrorDetails(err);
            throw new Error(
                `Could not append data to sheet "${range.split('!')[0]}". ` +
                `Please verify the spreadsheet ID, the sheet tab name, ` +
                `and that your service-account email has Editor access.`
            );
        }
    });
}

// ------------------- Write Data to Google Sheets -------------------
async function writeSheetData(auth, spreadsheetId, range, values) {
    const resource = {
        values: values.map(row =>
            row.map(value =>
                (typeof value === 'number')
                    ? value
                    : (value != null ? value.toString() : '')
            )
        )
    };
    return makeApiRequest(async () => {
        try {
            await google.sheets({ version: 'v4', auth })
                .spreadsheets.values.update({
                    spreadsheetId,
                    range,
                    valueInputOption: 'USER_ENTERED',
                    resource
                });
        } catch (err) {
            logErrorDetails(err);
            throw new Error(
                `Could not write to sheet "${range.split('!')[0]}". ` +
                `Make sure the spreadsheet ID and range are correct ` +
                `and that the service-account has Editor access.`
            );
        }
    });
}

// ------------------- Batch Write Data to Google Sheets -------------------
// Writes a batch of updates to multiple ranges in Google Sheets.
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

// ------------------- Update and Append Data for External Use -------------------
const updateDataInSheet = async (spreadsheetId, range, values) => {
    const auth = await authorizeSheets();
    return writeSheetData(auth, spreadsheetId, range, values);
};

const appendDataToSheet = async (spreadsheetId, range, values) => {
    const auth = await authorizeSheets();
    return appendSheetData(auth, spreadsheetId, range, values);
};

// ============================================================================
// Utility Functions
// ------------------- Get Google Sheets Client -------------------
function getSheetsClient(auth) {
    return google.sheets({ version: 'v4', auth });
}

// ------------------- Get Sheet ID by Name -------------------
// Retrieves the sheet ID using the sheet's name.
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

// ------------------- Get Sheet ID by Title -------------------
// Retrieves the sheet ID using the sheet's title.
async function getSheetIdByTitle(auth, spreadsheetId, sheetTitle) {
    const response = await google.sheets({ version: 'v4', auth }).spreadsheets.get({
        spreadsheetId,
        includeGridData: false,
    });
    const sheet = response.data.sheets.find(s => s.properties.title === sheetTitle);
    return sheet ? sheet.properties.sheetId : null;
}

// ------------------- Convert Wix Image Link -------------------
// Converts Wix image links to a format usable in Google Sheets.
function convertWixImageLinkForSheets(wixLink) {
    const regex = /wix:image:\/\/v1\/([^/]+)\/[^#]+/;
    const match = wixLink.match(regex);
    return match ? `https://static.wixstatic.com/media/${match[1]}` : wixLink;
}

// ------------------- Delete Inventory Sheet Data -------------------
// Deletes inventory data for a character from Google Sheets by clearing specific cells.
async function deleteInventorySheetData(spreadsheetId, characterName) {
    const auth = await authorizeSheets();
    const sheetsClient = google.sheets({ version: 'v4', auth });
    try {
        const sheet = await makeApiRequest(() =>
            sheetsClient.spreadsheets.values.get({
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
            sheetsClient.spreadsheets.values.batchUpdate({
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
    handleError(error, 'googleSheetsUtils.js');

        logErrorDetails(error);
        throw error;
    }
}

// ------------------- URL Validation and Parsing -------------------
// Validates if a URL is a proper Google Sheets URL.
function isValidGoogleSheetsUrl(url) {
    const regex = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+\/(edit|view)(\?[^#]+)?(#.+)?$/;
    return regex.test(url);
}

// ------------------- Extract Spreadsheet ID -------------------
// Extracts the Spreadsheet ID from a Google Sheets URL.
function extractSpreadsheetId(url) {
    if (typeof url !== 'string') {
        throw new Error('Invalid URL: URL must be a string');
    }
    const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// ============================================================================
// Error Logging
// ------------------- Log Error Details -------------------
// Logs error details to the console with a consistent format.
function logErrorDetails(error) {
    console.error(`[googleSheetsUtils.js]: logs`, error);
}

// ============================================================================
// Exported Functions
// ------------------- Export functions grouped by functionality -------------------
module.exports = {
    // Authorization
    authorizeSheets,
    
    // Reading functions
    fetchSheetData,
    readSheetData,
    fetchDataFromSheet,
    clearSheetFormatting,
    
    // Writing functions
    appendSheetData,
    writeSheetData,
    writeBatchData,
    updateDataInSheet,
    appendDataToSheet,
    
    // Utility functions
    getSheetsClient,
    getSheetIdByName,
    getSheetIdByTitle,
    isValidGoogleSheetsUrl,
    extractSpreadsheetId,
    convertWixImageLinkForSheets,
    deleteInventorySheetData,
    
    // Error logging
    logErrorDetails
};
