// ------------------- Google Sheets Utilities -------------------
// This module handles Google Sheets API integration for reading, writing, and managing data.

// ============================================================================
// Standard Libraries
// ------------------- Importing Node.js core modules -------------------
const fs = require('fs');
const path = require('path');
const Character = require('../models/CharacterModel');

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
                return reject(`Error loading service account file: ${err}`);
            }
            const credentials = JSON.parse(content);
            const { client_email, private_key } = credentials;
            const auth = new google.auth.JWT(client_email, null, private_key, SCOPES);
            auth.authorize((err, tokens) => {
                if (err) {
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
    try {
        // First check if we have permission to access the spreadsheet
        const auth = await authorizeSheets();
        const serviceAccountEmail = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH)).client_email;
        
        // Try to make a simple read request first to check permissions
        try {
            await google.sheets({ version: 'v4', auth }).spreadsheets.get({
                spreadsheetId: fn.toString().match(/spreadsheetId: '([^']+)'/)?.[1]
            });
        } catch (error) {
            if (error.status === 403 || error.message.includes('does not have permission')) {
                const errorMessage = `⚠️ Permission Error: The service account (${serviceAccountEmail}) does not have access to this spreadsheet.\n\nTo fix this:\n1. Open the Google Spreadsheet\n2. Click "Share" in the top right\n3. Add ${serviceAccountEmail} as an Editor\n4. Make sure to give it at least "Editor" access`;
                console.error(`[googleSheetsUtils.js]: ❌ Sync Inventory Error: ${errorMessage}`);
                throw new Error(errorMessage);
            }
        }

        // If we have permission, proceed with the actual request
        return await limiter.schedule(() => fn());
    } catch (error) {
        throw error;
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
      if (!response.data.values) {
        return [];
      }
      const sanitizedValues = response.data.values.map(row =>
        row.map(cell => (typeof cell === 'string' && cell.includes(',')) ? cell.replace(/,/g, '') : cell)
      );
      return sanitizedValues;
    }, { suppressLog: true });
  }

// ------------------- Read Data from Google Sheets -------------------
// Reads data from a specified range without sanitization.
async function readSheetData(auth, spreadsheetId, range) {
    return makeApiRequest(async () => {
      const response = await google.sheets({ version: 'v4', auth }).spreadsheets.values.get({
        spreadsheetId,
        range
      });
      return response.data.values || []; // Return empty array if values is undefined
    }, { suppressLog: true });
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
            throw new Error(`Could not write to sheet "${range.split('!')[0]}". Make sure the spreadsheet ID and range are correct and that the service-account has Editor access.`);
        }
    });
}

// ------------------- Batch Write Data to Google Sheets -------------------
// Writes a batch of data to the Google Sheet.
async function writeBatchData(auth, spreadsheetId, batchRequests) {
    try {
        const sheets = google.sheets({ version: 'v4', auth });
        
        // Check permissions first
        try {
            await sheets.spreadsheets.get({ spreadsheetId });
        } catch (error) {
            if (error.status === 403 || error.message.includes('does not have permission')) {
                throw new Error('Permission Error: The service account does not have access to this spreadsheet.');
            }
            throw error;
        }

        // Process each request in the batch
        for (const request of batchRequests) {
            try {
                await sheets.spreadsheets.values.update({
                    spreadsheetId,
                    range: request.range,
                    valueInputOption: 'USER_ENTERED',
                    requestBody: {
                        values: request.values
                    }
                });
            } catch (error) {
                if (error.status === 403 || error.message.includes('does not have permission')) {
                    throw new Error('Permission Error: The service account does not have access to this spreadsheet.');
                }
                throw error;
            }
        }
    } catch (error) {
        if (error.message.includes('Permission Error')) {
            throw error;
        }
        throw new Error(`Could not write to sheet. Error: ${error.message}`);
    }
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
            throw new Error(`Sheet with name "${sheetName}" not found`);
        }
        return sheet.properties.sheetId;
    });
}

// ------------------- Get Sheet ID by Title -------------------
// Retrieves the sheet ID using the sheet's title.
async function getSheetIdByTitle(auth, spreadsheetId, sheetTitle) {
    try {
        const response = await google.sheets({ version: 'v4', auth }).spreadsheets.get({
            spreadsheetId,
            includeGridData: false,
        });
        const sheet = response.data.sheets.find(s => s.properties.title === sheetTitle);
        return sheet ? sheet.properties.sheetId : null;
    } catch (error) {
        if (error.message.includes('does not have permission')) {
            throw new Error(
                'Permission denied. Please share your Google Sheet with Editor access to:\n' +
                '📧 tinglebot@rotw-tinglebot.iam.gserviceaccount.com'
            );
        }
        throw error;
    }
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
      // Check service account access first with a more thorough check
      try {
        const sheets = google.sheets({ version: 'v4', auth });
        // Try to read a specific range to verify write access
        await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'loggedInventory!A1:M1'
        });
        // Try to write to verify editor access
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: 'loggedInventory!A1',
          valueInputOption: 'USER_ENTERED',
          resource: {
            values: [['Character Name']]
          }
        });
        console.log(`[googleSheetsUtils.js]: ✅ Service account has full access to spreadsheet`);
      } catch (error) {
        if (error.status === 403 || error.message.includes('does not have permission')) {
          const serviceAccountEmail = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH)).client_email;
          console.log(`[googleSheetsUtils.js]: ❌ Service account (${serviceAccountEmail}) does not have access`);
          return {
            success: false,
            message: "**Error:** Permission denied.\n\n**Fix:** Make sure the Google Sheet is shared with editor access to:\n📧 `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`"
          };
        }
        throw error;
      }

      console.log(`[googleSheetsUtils.js]: 🔍 Checking headers...`);
      const headerRow = await readSheetData(auth, spreadsheetId, 'loggedInventory!A1:M1');
      const expectedHeaders = [
        'Character Name', 'Item Name', 'Qty of Item', 'Category', 'Type', 'Subtype',
        'Obtain', 'Job', 'Perk', 'Location', 'Link', 'Date/Time', 'Confirmed Sync'
      ];
  
      if (!headerRow || headerRow.length === 0) {
        console.log(`[googleSheetsUtils.js]: ❌ No headers found in sheet`);
        return {
          success: false,
          message: "**Error:** The `loggedInventory` tab exists but has no header data.\n\n**Fix:** Please copy the correct header row into A1:M1."
        };
      }
  
      const headers = headerRow[0];
      const allHeadersMatch = expectedHeaders.every((header, index) => headers[index] === header);
  
      if (!allHeadersMatch) {
        console.log(`[googleSheetsUtils.js]: ❌ Headers do not match expected format`);
        return {
          success: false,
          message: "**Error:** The headers do not match the required format.\n\n**Fix:** Ensure A1:M1 exactly reads:\n```Character Name, Item Name, Qty of Item, Category, Type, Subtype, Obtain, Job, Perk, Location, Link, Date/Time, Confirmed Sync```"
        };
      }

      console.log(`[googleSheetsUtils.js]: ✅ Headers validated successfully`);
  
      // ✅ Headers confirmed, now validate inventory content
      console.log(`[googleSheetsUtils.js]: 🔍 Checking inventory items for ${characterName}...`);
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
      
      if (!hasAtLeastOneItem && spreadsheetUrl.includes("loggedInventory")) {
        console.log(`[googleSheetsUtils.js]: ❌ No valid inventory items found for ${characterName}`);
        return {
          success: false,
          message: `No inventory items found for character **${characterName}**.||Please make sure your inventory sheet contains at least one item entry for your character.`
        };
      }

      console.log(`[googleSheetsUtils.js]: ✅ Found valid inventory items for ${characterName}`);
      console.log(`[googleSheetsUtils.js]: ✅ All validation checks passed - proceeding with sync`);
  
      return { success: true, message: "✅ Inventory sheet is set up correctly!" };
  
    } catch (error) {
      if (error.message.includes('Requested entity was not found')) {
        console.log(`[googleSheetsUtils.js]: ❌ Google Sheet not found`);
        return {
          success: false,
          message: "**Error:** The Google Sheet was not found.\n\n**Fix:** Please double-check your URL and that the sheet is shared publicly (or with the bot)."
        };
      }
      if (error.message.includes('Unable to parse range')) {
        console.log(`[googleSheetsUtils.js]: ❌ Cannot find correct cells A1:M1`);
        return {
          success: false,
          message: "**Error:** Cannot find the correct cells A1:M1.\n\n**Fix:** Double-check your tab name is exactly `loggedInventory` and that there is data starting at row 1."
        };
      }
      if (error.code === 403) {
        console.log(`[googleSheetsUtils.js]: ❌ Permission denied`);
        return {
          success: false,
          message: "**Error:** Permission denied.\n\n**Fix:** Make sure the Google Sheet is shared with editor access to:\n📧 `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`"
        };
      }
      console.log(`[googleSheetsUtils.js]: ❌ Unknown error: ${error.message}`);
      return {
        success: false,
        message: `Unknown error accessing sheet: ${error.message}`
      };
    }
  }
  
// ------------------- validateVendingSheet------------------- 
async function validateVendingSheet(sheetUrl, characterName) {
    try {
        // Extract spreadsheet ID
        const spreadsheetId = extractSpreadsheetId(sheetUrl);
        if (!spreadsheetId) {
            return {
                success: false,
                message: '❌ Invalid Google Sheets URL. Please provide a valid link.'
            };
        }

        // Authorize and get sheet data
        const auth = await authorizeSheets();

        // Check if sheet exists and is accessible
        try {
            const sheets = google.sheets({ version: 'v4', auth });
            await sheets.spreadsheets.get({ spreadsheetId });
        } catch (error) {
            return {
                success: false,
                message: '❌ Cannot access the Google Sheet. Please make sure:\n' +
                    '1. The sheet exists\n' +
                    '2. The sheet is shared with the service account\n' +
                    '3. The link is correct'
            };
        }

        // Get header row using readSheetData
        const headerRow = await readSheetData(auth, spreadsheetId, 'vendingShop!A1:L1');
        
        if (!headerRow || headerRow.length === 0 || !headerRow[0]) {
            return {
                success: false,
                message: '❌ Could not read the header row. Please make sure the sheet is not empty.'
            };
        }

        // Expected headers - updated to match actual sheet
        const expectedHeaders = [
            'CHARACTER NAME',
            'SLOT',
            'ITEM NAME',
            'STOCK QTY',
            'COST EACH',
            'POINTS SPENT',
            'BOUGHT FROM',
            'TOKEN PRICE',
            'ART PRICE',
            'OTHER PRICE',
            'TRADES OPEN?',
            'DATE'
        ];

        // Check headers
        const headers = headerRow[0].map(header => header?.toString().trim());
        const missingHeaders = expectedHeaders.filter(header => !headers.includes(header));

        if (missingHeaders.length > 0) {
            return {
                success: false,
                message: `❌ Missing required headers: ${missingHeaders.join(', ')}\n\n` +
                    'Please make sure your sheet has all the required headers in the correct order:\n' +
                    expectedHeaders.join(', ')
            };
        }

        return { success: true };
    } catch (error) {
        return {
            success: false,
            message: '❌ An error occurred while validating your sheet. Please try again later.'
        };
    }
}

// ------------------- Safe Append Data To Sheet -------------------
async function safeAppendDataToSheet(spreadsheetUrl, character, range, values, client) {
  try {
    if (!spreadsheetUrl || typeof spreadsheetUrl !== 'string') {
      return;
    }

    if (!character || typeof character !== 'object' || !character.name) {
      return;
    }

    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
    const auth = await authorizeSheets();

    // 🛡️ Validate the inventory sheet first
    const validationResult = await validateInventorySheet(spreadsheetUrl, character.name);
    if (!validationResult.success) {
      if (character.userId && client) {
        try {
          const user = await client.users.fetch(character.userId);
          if (user) {
            await user.send(
              `⚠️ Heads up! Your inventory sync for **${character.name}** failed.\n\n` +
              `Your linked Google Sheet may be missing, renamed, or set up incorrectly. Please update your inventory link or re-setup your sheet when you have a chance!`
            );
          }
        } catch (dmError) {
          // Silently fail if we can't send DM
        }
      }
      return;
    }

    // ✅ If validation passed, proceed to append
    await appendSheetData(auth, spreadsheetId, range, values);

  } catch (error) {
    throw error;
  }
}

// ------------------- parseSheetData -------------------
async function parseSheetData(sheetUrl) {
  try {
    const spreadsheetId = extractSpreadsheetId(sheetUrl);
    const auth = await authorizeSheets();
    const sheetData = await readSheetData(auth, spreadsheetId, 'vendingShop!A2:L') || [];
    
    if (!Array.isArray(sheetData)) {
      throw new Error('Unable to read data from the vendingShop sheet');
    }

    const parsedRows = [];
    for (const row of sheetData) {
      // Skip rows that don't have an item name or have zero stock
      if (!row[2] || !row[3] || row[3] <= 0) continue;

      // Validate that column L contains "Old Stock"
      if (!row[11] || row[11].trim() !== 'Old Stock') {
        continue;
      }

      parsedRows.push({
        characterName: row[0]?.trim(),
        slot: row[1]?.trim(),
        itemName: row[2]?.trim(),
        stockQty: parseInt(row[3]) || 0,
        costEach: parseInt(row[4]) || 0,
        pointsSpent: parseInt(row[5]) || 0,
        boughtFrom: row[6]?.trim(),
        tokenPrice: row[7]?.trim() || 'N/A',
        artPrice: row[8]?.trim() || 'N/A',
        otherPrice: row[9]?.trim() || 'N/A',
        tradesOpen: row[10]?.trim() === 'Yes',
        date: row[11]?.trim()
      });
    }

    return parsedRows;
  } catch (error) {
    throw error;
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
    validateVendingSheet,
    safeAppendDataToSheet,
    parseSheetData
};
