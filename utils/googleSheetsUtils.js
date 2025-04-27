// ------------------- Google Sheets Utilities -------------------
// This module handles Google Sheets API integration for reading, writing, and managing data.

// ============================================================================
// Standard Libraries
// ------------------- Importing Node.js core modules -------------------
const fs = require('fs');
const { handleError } = require('../utils/globalErrorHandler');
const path = require('path');
const Character = require('../models/CharacterModel');
const { client } = require('../index.js');
const { fetchCharacterByName } = require('../database/db')

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
async function retryWithBackoff(fn, options = {}) {
    const { suppressLog = false } = options;
    const retries = 3;
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i === retries - 1) {
          if (!suppressLog) {
            handleError(error, 'googleSheetsUtils.js'); // ❌ Only log if NOT suppressed
          }
          throw error;
        }
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
      const sanitizedValues = response.data.values.map(row =>
        row.map(cell => (typeof cell === 'string' && cell.includes(',')) ? cell.replace(/,/g, '') : cell)
      );
      return sanitizedValues;
    }, { suppressLog: true }); // 👈 Add this
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
    }, { suppressLog: true }); // 👈 Add this
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


// ------------------- validateInventorySheet------------------- 
async function validateInventorySheet(spreadsheetUrl, characterName) {
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
  
    if (!spreadsheetId) {
      return {
        success: false,
        message: "**Error:** Invalid Google Sheets URL.\n\n**Fix:** Please double-check you pasted a full valid URL like:\n> https://docs.google.com/spreadsheets/d/your-spreadsheet-id/edit"
      };
    }
  
    const auth = await authorizeSheets();
    try {
      const headerRow = await readSheetData(auth, spreadsheetId, 'loggedInventory!A1:M1');
      const expectedHeaders = [
        'Character Name', 'Item Name', 'Qty of Item', 'Category', 'Type', 'Subtype',
        'Obtain', 'Job', 'Perk', 'Location', 'Link', 'Date/Time', 'Confirmed Sync'
      ];
  
      if (!headerRow || headerRow.length === 0) {
        return {
          success: false,
          message: "**Error:** The `loggedInventory` tab exists but has no header data.\n\n**Fix:** Please copy the correct header row into A1:M1."
        };
      }
  
      const headers = headerRow[0];
      const allHeadersMatch = expectedHeaders.every((header, index) => headers[index] === header);
  
      if (!allHeadersMatch) {
        return {
          success: false,
          message: "**Error:** The headers do not match the required format.\n\n**Fix:** Ensure A1:M1 exactly reads:\n```Character Name, Item Name, Qty of Item, Category, Type, Subtype, Obtain, Job, Perk, Location, Link, Date/Time, Confirmed Sync```"
        };
      }
  
      // ✅ Headers confirmed, now validate inventory content
      const inventoryData = await readSheetData(auth, spreadsheetId, 'loggedInventory!A2:M100');
      const hasAtLeastOneItem = inventoryData && inventoryData.some(row => {
        const sheetCharacterName = (row[0] || '').trim().toLowerCase();
        const itemName = (row[1] || '').trim();
        const quantity = Number(row[2] || 0);
      
        return (
          sheetCharacterName === characterName.trim().toLowerCase() &&
          itemName.length > 0 &&
          quantity > 0
        );
      });
      
      if (!hasAtLeastOneItem) {
        return {
          success: false,
          message: `No inventory items found for character **${characterName}**.||Please make sure your inventory sheet contains at least one item entry for your character.`
        };
      }
      
  
      return { success: true, message: "✅ Inventory sheet is set up correctly!" };
  
    } catch (error) {
      if (error.message.includes('Requested entity was not found')) {
        return {
          success: false,
          message: "**Error:** The Google Sheet was not found.\n\n**Fix:** Please double-check your URL and that the sheet is shared publicly (or with the bot)."
        };
      }
      if (error.message.includes('Unable to parse range')) {
        return {
          success: false,
          message: "**Error:** Cannot find the correct cells A1:M1.\n\n**Fix:** Double-check your tab name is exactly `loggedInventory` and that there is data starting at row 1."
        };
      }
      if (error.code === 403) {
        return {
          success: false,
          message: "**Error:** Permission denied.\n\n**Fix:** Make sure the Google Sheet is shared with editor access to:\n📧 `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`"
        };
      }
      return {
        success: false,
        message: `Unknown error accessing sheet: ${error.message}`
      };
    }
  }
  
// ============================================================================
// Error Logging
// ------------------- Log Error Details -------------------
// Logs error details to the console with a consistent format.
function logErrorDetails(error) {
    console.error(`[googleSheetsUtils.js]: logs`, error);
}

// ------------------- Safely Append Data to Sheet -------------------
async function safeAppendDataToSheet(spreadsheetUrl, characterInfo, range, values) {
    try {
      if (!spreadsheetUrl || typeof spreadsheetUrl !== 'string') {
        console.warn(`[googleSheetsUtils.js]: No spreadsheet URL provided for ${characterInfo}. Skipping sync.`);
        return;
      }
  
      // Determine if characterInfo is a string (name) or object (full character)
      let character = characterInfo;
      if (typeof characterInfo === 'string') {
        character = await fetchCharacterByName(characterInfo);
        if (!character) {
          console.error(`[googleSheetsUtils.js]: Character lookup failed for name: ${characterInfo}`);
          return;
        }
      }
  
      const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
      const auth = await authorizeSheets();
  
      // 🛡️ Validate the inventory sheet first
      const validationResult = await validateInventorySheet(spreadsheetUrl, character.name);
      if (!validationResult.success) {
        console.error(`[googleSheetsUtils.js]: Validation failed for ${character.name}: ${validationResult.message}`);
  
       // ✉️ DM the user about the broken link
if (character.userId) {
    try {
      const { client } = require('../index.js'); // <-- RELOAD IT FRESH
  
      const user = await client.users.fetch(character.userId);
      if (user) {
        await user.send(
          `⚠️ Heads up! Your inventory sync for **${character.name}** failed.\n\n` +
          `Your linked Google Sheet may be missing, renamed, or set up incorrectly. Please update your inventory link or re-setup your sheet when you have a chance!`
        );
        console.log(`[googleSheetsUtils.js]: Sent DM to user ${character.userId} about broken inventory.`);
      }
    } catch (dmError) {
      console.error(`[googleSheetsUtils.js]: Failed to send DM to ${character.userId}: ${dmError.message}`);
    }
  }   else {
          console.warn(`[googleSheetsUtils.js]: No userId found for character ${character.name}. Could not send DM.`);
        }
  
        return; // Stop trying to sync
      }
  
      // ✅ If validation passed, proceed to append
      await appendSheetData(auth, spreadsheetId, range, values);
  
    } catch (error) {
      console.error(`[googleSheetsUtils.js]: Failed to safely append data for ${characterInfo}: ${error.message}`);
    }
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
    validateInventorySheet,
    safeAppendDataToSheet,
    
    // Error logging
    logErrorDetails
};
