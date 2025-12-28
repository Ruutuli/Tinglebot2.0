// ============================================================================
// ------------------- Google Sheets Utilities -------------------
// Handles Google Sheets API operations with fallback mechanisms
// ============================================================================

// ============================================================================
// ------------------- Imports -------------------
// External dependencies and internal modules
// ============================================================================

// Standard Libraries
const fs = require('fs');
const path = require('path');

// Third-Party Libraries
const Bottleneck = require('bottleneck');
const { google } = require('googleapis');

// Internal Models
const Character = require('./models/CharacterModel');
const TempData = require('./models/TempDataModel');

// Utilities
const logger = require('./utils/logger');

// ============================================================================
// ------------------- Constants -------------------
// Configuration and static values
// ============================================================================

// API Configuration
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'config/service_account.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

// API Rate Limiting
const limiter = new Bottleneck({
    minTime: 1000,    // Increased to 1 second between requests
    maxConcurrent: 3, // Reduced concurrent requests
    reservoir: 60,    // Maximum requests per minute
    reservoirRefreshAmount: 60,
    reservoirRefreshInterval: 60 * 1000, // Refresh every minute
    trackDoneStatus: true
});

// Add exponential backoff for failed requests
limiter.on('failed', async (error, jobInfo) => {
    const retryCount = jobInfo.retryCount || 0;
    if (retryCount < 3) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        logger.warn(`Rate limit hit, retrying in ${delay}ms (attempt ${retryCount + 1})`, 'googleSheetsUtils.js');
        return delay;
    }
    throw error;
});

// Cache Configuration
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache TTL
const sheetCache = new Map();

// ============================================================================
// ------------------- Authorization -------------------
// Handles Google Sheets API authentication and authorization
// ============================================================================

// Function to get service account credentials
function getServiceAccountCredentials() {
    // Check if we're in a deployed environment (Railway) or if environment variables are set
    const hasEnvVars = process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY && process.env.GOOGLE_PROJECT_ID;
    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_SERVICE_NAME;
    
    if (isRailway || hasEnvVars) {
        // Create service account object from environment variables
        // Handle private key - it might have literal newlines or \n escape sequences
        let privateKey = process.env.GOOGLE_PRIVATE_KEY;
        if (privateKey) {
            // Remove surrounding quotes if present
            privateKey = privateKey.replace(/^["']|["']$/g, '');
            // If it doesn't have actual newlines, convert \n to newlines
            if (!privateKey.includes('\n') && privateKey.includes('\\n')) {
                privateKey = privateKey.replace(/\\n/g, '\n');
            }
        }
        
        return {
            type: "service_account",
            project_id: process.env.GOOGLE_PROJECT_ID,
            private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
            private_key: privateKey,
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
        try {
            if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
                logger.warn('Service account file not found, Google Sheets functionality disabled', 'googleSheetsUtils.js');
                return null;
            }
            const credentials = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH));
            logger.success('Service account loaded successfully', 'googleSheetsUtils.js');
            return credentials;
        } catch (err) {
            logger.error('Error loading service account file', err, 'googleSheetsUtils.js');
            return null;
        }
    }
}

// ------------------- Function: authorizeSheets -------------------
// Authorizes the Google Sheets API using service account credentials
async function authorizeSheets() {
    return new Promise((resolve, reject) => {
        try {
            const credentials = getServiceAccountCredentials();
            if (!credentials) {
                return reject(new Error('Google Sheets functionality disabled - no credentials available'));
            }
            
            const { client_email, private_key } = credentials;
            
            // Validate that we have the required credentials
            if (!client_email || !private_key) {
                return reject(new Error('Google Sheets functionality disabled - incomplete credentials'));
            }
            
            // Create JWT auth with all credentials
            const auth = new google.auth.JWT({
                email: client_email,
                key: private_key,
                scopes: SCOPES
            });
            
            auth.authorize((err, tokens) => {
                if (err) {
                    logger.error('Google Sheets authorization failed', err, 'googleSheetsUtils.js');
                    return reject(new Error(`Error authorizing service account: ${err.message || err}`));
                }
                resolve(auth);
            });
        } catch (error) {
            logger.error('Error parsing service account credentials', error, 'googleSheetsUtils.js');
            reject(new Error(`Error parsing service account credentials: ${error.message || error}`));
        }
    });
}

// ------------------- Function: makeApiRequest -------------------
// Makes an API request with rate limiting and permission checking
async function makeApiRequest(fn, { suppressLog = false, context = {} } = {}) {
    try {
        const auth = await authorizeSheets();
        const credentials = getServiceAccountCredentials();
        const serviceAccountEmail = credentials.client_email;
        
        // Check permissions first
        try {
            const spreadsheetId = fn.toString().match(/spreadsheetId: '([^']+)'/)?.[1];
            if (spreadsheetId) {
                await google.sheets({ version: 'v4', auth }).spreadsheets.get({ spreadsheetId });
            }
        } catch (error) {
            if (error.status === 403 || error.message.includes('does not have permission')) {
                if (!suppressLog) {
                    logger.error(`Permission denied for ${serviceAccountEmail}`, null, 'googleSheetsUtils.js');
                }
                error.context = {
                    ...context,
                    serviceAccountEmail,
                    errorType: 'permission_error'
                };
                throw error;
            }
        }

        return await limiter.schedule(() => fn());
    } catch (error) {
        if (!suppressLog) {
            logger.error('API request failed', error, 'googleSheetsUtils.js');
            error.context = {
                ...context,
                errorType: error.message.includes('Unable to parse range') ? 'range_parse_error' : 'api_error',
                serviceAccountEmail: getServiceAccountCredentials().client_email
            };
        }
        throw error;
    }
}

// ============================================================================
// ------------------- Reading Operations -------------------
// Functions for reading data from Google Sheets
// ============================================================================

// ------------------- Function: fetchSheetData -------------------
// Fetches and sanitizes data from Google Sheets
async function fetchSheetData(auth, spreadsheetId, range, context = {}) {
    return makeApiRequest(async () => {
        const response = await google.sheets({ version: 'v4', auth }).spreadsheets.values.get({
            spreadsheetId,
            range
        });
        
        if (!response.data.values) {
            return [];
        }
        
        // Sanitize values by removing commas from strings
        return response.data.values.map(row =>
            row.map(cell => (typeof cell === 'string' && cell.includes(',')) ? cell.replace(/,/g, '') : cell)
        );
    }, { suppressLog: true, context });
}

// ------------------- Function: readSheetData -------------------
// Reads raw data from Google Sheets without sanitization
async function readSheetData(auth, spreadsheetId, range, context = {}) {
    return makeApiRequest(async () => {
        const response = await google.sheets({ version: 'v4', auth }).spreadsheets.values.get({
            spreadsheetId,
            range
        });
        return response.data.values || [];
    }, { suppressLog: true, context });
}

// ------------------- Function: clearSheetFormatting -------------------
// Clears formatting in a specified range
async function clearSheetFormatting(auth, spreadsheetId, range, context = {}) {
    return makeApiRequest(async () => {
        await google.sheets({ version: 'v4', auth }).spreadsheets.values.clear({
            spreadsheetId,
            range
        });
    }, { context });
}

// ------------------- Function: getCachedSheetData -------------------
// Gets data from cache or fetches from API if cache is invalid
async function getCachedSheetData(spreadsheetId, range, context = {}) {
    const cacheKey = `${spreadsheetId}:${range}`;
    const cached = sheetCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    
    const data = await fetchSheetData(null, spreadsheetId, range, context);
    sheetCache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
}

// ------------------- Function: invalidateCache -------------------
// Invalidates cache for a specific spreadsheet or all cache
function invalidateCache(spreadsheetId = null) {
    if (spreadsheetId) {
        for (const key of sheetCache.keys()) {
            if (key.startsWith(spreadsheetId)) {
                sheetCache.delete(key);
            }
        }
    } else {
        sheetCache.clear();
    }
}

// ------------------- Function: fetchDataFromSheet -------------------
// Fetches data from Google Sheets for external use
const fetchDataFromSheet = async (spreadsheetId, range) => {
    return getCachedSheetData(spreadsheetId, range);
};

// ============================================================================
// ------------------- Writing Operations -------------------
// Functions for writing data to Google Sheets
// ============================================================================

// ------------------- Function: appendSheetData -------------------
// Appends data to a Google Sheet
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
            const sheetName = range.split('!')[0];
            logger.error(`Failed to append data to sheet "${sheetName}"`, err, 'googleSheetsUtils.js');
            throw new Error(`Could not append data to sheet "${sheetName}"`);
        }
    });
}

// ------------------- Function: writeSheetData -------------------
// Writes data to a Google Sheet
async function writeSheetData(auth, spreadsheetId, range, values) {
    const resource = {
        values: values.map(row =>
            row.map(value => {
                // Handle different value types
                if (typeof value === 'number') {
                    return value;
                }
                if (Array.isArray(value)) {
                    return value.join(', ');
                }
                if (value === null || value === undefined) {
                    return '';
                }
                return value.toString();
            })
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
            const sheetName = range.split('!')[0];
            logger.error(`Failed to write to sheet "${sheetName}"`, err, 'googleSheetsUtils.js');
            throw new Error(`Could not write to sheet "${sheetName}"`);
        }
    });
}

// ------------------- Function: writeBatchData -------------------
// Writes a batch of data to a Google Sheet
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

// ------------------- Function: updateDataInSheet -------------------
// Updates data in a Google Sheet for external use
const updateDataInSheet = async (spreadsheetId, range, values) => {
    const auth = await authorizeSheets();
    return writeSheetData(auth, spreadsheetId, range, values);
};

// ------------------- Function: appendDataToSheet -------------------
// Appends data to a Google Sheet for external use
const appendDataToSheet = async (spreadsheetId, range, values) => {
    const auth = await authorizeSheets();
    return appendSheetData(auth, spreadsheetId, range, values);
};

// ============================================================================
// ------------------- Utility Functions -------------------
// Helper functions for common operations
// ============================================================================

// ------------------- Function: getSheetsClient -------------------
// Gets a Google Sheets client instance
function getSheetsClient(auth) {
    return google.sheets({ version: 'v4', auth });
}

// ------------------- Function: getSheetIdByName -------------------
// Gets a sheet ID by its name
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

// ------------------- Function: getSheetIdByTitle -------------------
// Gets a sheet ID by its title
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

// ------------------- Function: convertWixImageLinkForSheets -------------------
// Converts a Wix image link to a format usable in Google Sheets
function convertWixImageLinkForSheets(wixLink) {
    const regex = /wix:image:\/\/v1\/([^/]+)\/[^#]+/;
    const match = wixLink.match(regex);
    return match ? `https://static.wixstatic.com/media/${match[1]}` : wixLink;
}

// ------------------- Function: isValidGoogleSheetsUrl -------------------
// Validates if a URL is a proper Google Sheets URL
function isValidGoogleSheetsUrl(url) {
    const regex = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+\/(edit|view)(\?[^#]+)?(#.+)?$/;
    return regex.test(url);
}

// ------------------- Function: extractSpreadsheetId -------------------
// Extracts the Spreadsheet ID from a Google Sheets URL
function extractSpreadsheetId(url) {
    if (typeof url !== 'string') {
        throw new Error('Invalid URL: URL must be a string');
    }
    
    // Clean the URL - remove any trailing semicolons or invalid characters
    const cleanUrl = url.trim().replace(/;$/, '').replace(/['"]/g, '');
    
    const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = cleanUrl.match(regex);
    
    if (!match) {
        return null;
    }
    
    const spreadsheetId = match[1];
    
    // Validate the spreadsheet ID format
    if (!spreadsheetId || spreadsheetId.length < 20) {
        return null;
    }
    
    return spreadsheetId;
}

// ============================================================================
// ------------------- Validation Functions -------------------
// Functions for validating sheet structure and content
// ============================================================================

// ------------------- Function: validateInventorySheet -------------------
// Validates an inventory sheet
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
        // Check service account access
        try {
            const sheets = google.sheets({ version: 'v4', auth });
            await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: 'loggedInventory!A1:M1'
            });
            await sheets.spreadsheets.values.update({
                spreadsheetId,
                range: 'loggedInventory!A1',
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [['Character Name']]
                }
            });
        } catch (error) {
            if (error.status === 403 || error.message.includes('does not have permission')) {
                return {
                    success: false,
                    message: "**Error:** Permission denied.\n\n**Fix:** Make sure the Google Sheet is shared with editor access to:\n📧 `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`"
                };
            }
            throw error;
        }

        // Validate headers
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
                message: "**Error:** The headers do not match the required format.\n\n**Fix:** Ensure A1:M1 exactly reads:\nCharacter Name, Item Name, Qty of Item, Category, Type, Subtype, Obtain, Job, Perk, Location, Link, Date/Time, Confirmed Sync"
            };
        }

        // Validate content
        const inventoryData = await readSheetData(auth, spreadsheetId, 'loggedInventory!A2:M100');
        
        if (inventoryData && inventoryData.length > 0) {
            const hasAtLeastOneItem = inventoryData.some(row => {
                const sheetCharacterName = (row[0] || '').trim().toLowerCase();
                const itemName = (row[1] || '').trim();
                const quantity = Number(row[2] || 0);
            
                return (
                    sheetCharacterName === characterName.trim().toLowerCase() &&
                    itemName.length > 0 &&
                    quantity > 0
                );
            });
            
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
            message: `Unknown error accessing inventory sheet: ${error.message}`
        };
    }
}

// ------------------- Function: validateVendingSheet -------------------
// Validates a vending sheet
async function validateVendingSheet(sheetUrl, characterName) {
    try {
        const spreadsheetId = extractSpreadsheetId(sheetUrl);
        if (!spreadsheetId) {
            return {
                success: false,
                message: '❌ Invalid Google Sheets URL. Please provide a valid link.'
            };
        }

        const auth = await authorizeSheets();

        // Check sheet access
        try {
            const sheets = google.sheets({ version: 'v4', auth });
            await sheets.spreadsheets.get({ spreadsheetId });
        } catch (error) {
            return {
                success: false,
                message: '❌ Cannot access the vending shop sheet. Please make sure:\n' +
                    '1. The sheet exists\n' +
                    '2. The sheet is shared with the service account\n' +
                    '3. The link is correct'
            };
        }

        // Validate headers
        const headerRow = await readSheetData(auth, spreadsheetId, 'vendingShop!A1:L1');
        
        if (!headerRow || headerRow.length === 0 || !headerRow[0]) {
            return {
                success: false,
                message: '❌ Could not read the header row in vending shop sheet. Please make sure the sheet is not empty.'
            };
        }

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

        const headers = headerRow[0].map(header => header?.toString().trim());
        const missingHeaders = expectedHeaders.filter(header => !headers.includes(header));

        if (missingHeaders.length > 0) {
            return {
                success: false,
                message: `❌ Missing required headers in vending shop sheet: ${missingHeaders.join(', ')}\n\n` +
                    'Please make sure your vending shop sheet has all the required headers in the correct order:\n' +
                    expectedHeaders.join(', ')
            };
        }

        // Validate content
        const vendingData = await readSheetData(auth, spreadsheetId, 'vendingShop!A2:L');
        if (vendingData && vendingData.length > 0) {
            const hasValidItems = vendingData.some(row => {
                const sheetCharacterName = (row[0] || '').trim().toLowerCase();
                const itemName = (row[2] || '').trim();
                const stockQty = Number(row[3] || 0);
                const costEach = Number(row[4] || 0);

                return (
                    sheetCharacterName === characterName.trim().toLowerCase() &&
                    itemName.length > 0 &&
                    stockQty > 0 &&
                    costEach > 0
                );
            });

        }

        return { 
            success: true, 
            message: "✅ Vending shop sheet is set up correctly!" 
        };

    } catch (error) {
        if (error.message.includes('Requested entity was not found')) {
            return {
                success: false,
                message: '❌ The vending shop sheet was not found. Please check your URL and sharing settings.'
            };
        }
        if (error.message.includes('Unable to parse range')) {
            return {
                success: false,
                message: '❌ Cannot find the correct cells A1:L1 in vending shop sheet.\n\n**Fix:** Double-check your tab name is exactly `vendingShop` and that there is data starting at row 1.'
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
            message: `Unknown error accessing vending shop sheet: ${error.message}`
        };
    }
}

// ------------------- Function: validateTokenTrackerSheet -------------------
// Validates a token tracker sheet
async function validateTokenTrackerSheet(spreadsheetUrl) {
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);

    if (!spreadsheetId) {
        return {
            success: false,
            message: "**Error:** Invalid Google Sheets URL.\n\n**Fix:** Please double-check you pasted a full valid URL like:\n> https://docs.google.com/spreadsheets/d/your-spreadsheet-id/edit"
        };
    }

    const auth = await authorizeSheets();
    try {
        // First check if the sheet exists and we have access
        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
        
        // Check if loggedTracker tab exists
        const hasLoggedTrackerTab = spreadsheet.data.sheets.some(sheet => 
            sheet.properties.title.toLowerCase() === 'loggedtracker'
        );

        if (!hasLoggedTrackerTab) {
            return {
                success: false,
                message: "**Error:** Missing required tab.\n\n**Fix:** Please create a tab named exactly `loggedTracker` (case sensitive) in your sheet."
            };
        }

        // Now try to read the headers
        try {
            const headerRow = await readSheetData(auth, spreadsheetId, 'loggedTracker!B7:F7');
            const expectedHeaders = [
                'SUBMISSION',
                'LINK',
                'CATEGORIES',
                'TYPE',
                'TOKEN AMOUNT'
            ];

            if (!headerRow || headerRow.length === 0) {
                return {
                    success: false,
                    message: "**Error:** No headers found in token tracker sheet.\n\n**Fix:** Please add these headers in cells B7:F7:\n" +
                        expectedHeaders.join(' | ') + "\n\nNote: The headers must be in this exact order."
                };
            }

            const headers = headerRow[0].map(h => h?.toString().trim());
            const missingHeaders = expectedHeaders.filter((header, index) => 
                !headers[index] || headers[index].toLowerCase() !== header.toLowerCase()
            );

            if (missingHeaders.length > 0) {
                return {
                    success: false,
                    message: "**Error:** Invalid headers in token tracker sheet.\n\n" +
                        "**Fix:** Please update your headers in B7:F7 to exactly match:\n" +
                        expectedHeaders.join(' | ') + "\n\n" +
                        "Current headers found: " + headers.join(' | ') + "\n\n" +
                        "Note: The headers must be in this exact order and spelling."
                };
            }

            return { success: true, message: "✅ Token tracker sheet is set up correctly!" };

        } catch (error) {
            if (error.message.includes('Unable to parse range')) {
                return {
                    success: false,
                    message: "**Error:** Cannot find the correct cells B7:F7.\n\n**Fix:** Please ensure:\n" +
                        "1. The tab is named exactly `loggedTracker` (case sensitive)\n" +
                        "2. The headers are in row 7 (B7:F7)\n" +
                        "3. There are no extra spaces in the tab name"
                };
            }
            throw error;
        }

    } catch (error) {
        if (error.status === 403 || error.message.includes('does not have permission')) {
            let serviceAccountEmail = 'tinglebot@rotw-tinglebot.iam.gserviceaccount.com'; // Default fallback
            try {
                if (fs.existsSync(SERVICE_ACCOUNT_PATH)) {
                    const credentials = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH));
                    serviceAccountEmail = credentials.client_email;
                }
            } catch (err) {
                // Use default email if file read fails
            }
            return {
                success: false,
                message: "**Error:** Permission denied.\n\n**Fix:** Make sure the Google Sheet is shared with editor access to:\n📧 `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`"
            };
        }
        if (error.message.includes('Requested entity was not found')) {
            return {
                success: false,
                message: "**Error:** The Google Sheet was not found.\n\n**Fix:** Please double-check your URL and that the sheet is shared publicly (or with the bot)."
            };
        }
        return {
            success: false,
            message: `Unknown error accessing token tracker sheet: ${error.message}`
        };
    }
}

// ============================================================================
// ------------------- Sheet Operations -------------------
// Functions for managing sheet data and operations
// ============================================================================

// ------------------- Function: deleteInventorySheetData -------------------
// Deletes inventory data for a character from Google Sheets
async function deleteInventorySheetData(spreadsheetId, characterName, context = {}) {
    const auth = await authorizeSheets();
    const sheetsClient = google.sheets({ version: 'v4', auth });
    try {
        const sheet = await makeApiRequest(() =>
            sheetsClient.spreadsheets.values.get({
                auth,
                spreadsheetId,
                range: 'loggedInventory!A2:M',
            })
        , { context: { ...context, range: 'loggedInventory!A2:M', sheetType: 'inventory' } });
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
        , { context: { ...context, range: 'loggedInventory!A2:M', sheetType: 'inventory' } });
        return `✅ **Specific inventory data for character ${characterName} deleted from Google Sheets.**`;
    } catch (error) {
        throw error;
    }
}

// ------------------- Function: safeAppendDataToSheet -------------------
// Safely appends data to a sheet with validation
async function safeAppendDataToSheet(spreadsheetUrl, character, range, values, client, { skipValidation = false, context = {} } = {}) {

    // Move variable declarations outside try block to avoid scope issues
    let isUserObject = false;
    let isCharacterObject = false;
    
    try {
        if (!spreadsheetUrl || typeof spreadsheetUrl !== 'string') {
            return;
        }

        if (!character || typeof character !== 'object') {
            return;
        }

        // Validate required character properties
        if (isCharacterObject && (!character.name || !character.inventory || !character.userId)) {
            return;
        }

        // Handle both User and Character objects
        isUserObject = character.discordId && !character.name;
        isCharacterObject = character.name;
        
        if (!isUserObject && !isCharacterObject) {
            return;
        }

        // For token tracker operations, we can use a User object
        // For inventory operations, we need a Character object
        const sheetName = range.split('!')[0];
        if (sheetName.toLowerCase() === 'loggedtracker' && isUserObject) {
            // This is a valid case - User object for token tracker
        } else if (sheetName.toLowerCase() === 'loggedinventory' && !isCharacterObject) {
            return;
        } else if (!isCharacterObject) {
            return;
        }

        const spreadsheetId = extractSpreadsheetId(spreadsheetUrl);
        if (!spreadsheetId) {
            throw new Error(`Failed to extract spreadsheet ID from URL: ${spreadsheetUrl}`);
        }
        
        // Validate that the URL is a proper Google Sheets URL
        if (!spreadsheetUrl.includes('docs.google.com/spreadsheets')) {
            throw new Error(`Invalid Google Sheets URL format: ${spreadsheetUrl}`);
        }
        
        // Try to authorize - if this fails, throw early with clear error
        let auth;
        try {
            auth = await authorizeSheets();
        } catch (authError) {
            const authErrorMsg = authError?.message || authError?.toString() || 'Unknown auth error';
            throw new Error(`Google Sheets authentication failed: ${authErrorMsg}`);
        }
        
        if (!auth) {
            throw new Error('Failed to authorize Google Sheets API');
        }
        
        // Validate auth object has required properties
        if (!auth.credentials || !auth.credentials.access_token) {
            throw new Error('Google Sheets API auth object is not properly configured');
        }

        if (!skipValidation) {
            // Validate the range format
            const rangeParts = range.split('!');
            if (rangeParts.length !== 2) {
                throw new Error(`Invalid range format. Expected format: SheetName!A1:Z1`);
            }

            const [sheetName, cellRange] = rangeParts;

            // Validate the cell range format
            if (!cellRange.match(/^[A-Z]+\d*:[A-Z]+\d*$/)) {
                throw new Error(`Invalid cell range format. Expected format: A1:Z1 or A1:Z`);
            }
            
            // Validate sheet name is not empty
            if (!sheetName || sheetName.trim() === '') {
                throw new Error('Sheet name cannot be empty');
            }

            // Validate the appropriate sheet
            let validationResult;
            if (sheetName.toLowerCase() === 'loggedtracker') {
                validationResult = await validateTokenTrackerSheet(spreadsheetUrl);
            } else if (sheetName.toLowerCase() === 'loggedinventory') {
                // For inventory validation, we need a character name
                const characterName = isCharacterObject ? character.name : 'Unknown';
                validationResult = await validateInventorySheet(spreadsheetUrl, characterName);
            } else {
                throw new Error(`Unknown sheet type: ${sheetName}. Expected 'loggedTracker' or 'loggedInventory'`);
            }
            
            if (!validationResult.success) {
                if (isCharacterObject && character.userId && client) {
                    try {
                        const user = await client.users.fetch(character.userId);
                        if (user) {
                            await user.send(
                                `⚠️ Heads up! Your ${sheetName} sync for **${character.name}** failed.\n\n` +
                                `Your linked Google Sheet may be missing, renamed, or set up incorrectly. Please update your sheet link or re-setup your sheet when you have a chance!`
                            );
                        }
                    } catch (dmError) {
                        // Silent fail on DM errors
                    }
                } else if (isUserObject && character.discordId && client) {
                    try {
                        const user = await client.users.fetch(character.discordId);
                        if (user) {
                            await user.send(
                                `⚠️ Heads up! Your ${sheetName} sync failed.\n\n` +
                                `Your linked Google Sheet may be missing, renamed, or set up incorrectly. Please update your sheet link or re-setup your sheet when you have a chance!`
                            );
                        }
                    } catch (dmError) {
                        // Silent fail on DM errors
                    }
                }
                return;
            }
        }

        // If validation passed or skipped, append the data
        if (!Array.isArray(values) || values.length === 0) {
            throw new Error('Invalid values array: must be a non-empty array');
        }
        
        const resource = {
            values: values.map(row => {
                if (!Array.isArray(row)) {
                    throw new Error('Each value in values array must be an array');
                }
                return row.map(value => (value != null ? value.toString() : ''));
            })
        };
        
        try {
            // Validate the API call parameters
            if (!spreadsheetId || !range || !resource || !resource.values) {
                throw new Error(`Invalid API call parameters: spreadsheetId=${spreadsheetId}, range=${range}, hasResource=${!!resource}`);
            }
            
            await google.sheets({ version: 'v4', auth })
                .spreadsheets.values.append({
                    spreadsheetId,
                    range,
                    valueInputOption: 'USER_ENTERED',
                    resource
                });
        } catch (apiError) {
            // Handle 409 Conflict error specifically
            if (apiError.status === 409) {
                try {
                    const operationData = {
                        operationType: 'append',
                        spreadsheetId: extractSpreadsheetId(spreadsheetUrl),
                        range: range,
                        values: values,
                        characterName: isCharacterObject ? character?.name : null,
                        userId: isUserObject ? character?.discordId : character?.userId,
                        sheetType: range.split('!')[0].toLowerCase(),
                        commandName: context?.commandName || client?.commandName,
                        userTag: context?.userTag || client?.user?.tag,
                        clientUserId: context?.userId || client?.user?.id,
                        options: context?.options || client?.options?.data,
                        originalError: apiError.message
                    };
                    
                const operationId = await storePendingSheetOperation(operationData);
                    
                    return { success: false, storedForRetry: true, operationId };
                } catch (storageError) {
                    logger.error('Failed to store conflict operation', storageError, 'googleSheetsUtils.js');
                }
            }
            
            throw apiError;
        }
        

    } catch (error) {
        const errorMessage = error?.message || error?.toString() || 'Unknown error';
        
        // Don't log authentication errors (expected in local dev)
        const isAuthError = errorMessage.includes('credentials') || 
                           errorMessage.includes('No key or keyFile') || 
                           errorMessage.includes('authentication failed') ||
                           errorMessage.includes('functionality disabled');
        
        if (!isAuthError) {
            logger.error('Sheet append failed', error, 'googleSheetsUtils.js');
        }
        
        // Check if this is a service unavailable error or conflict error
        if ((error?.message && (
            error.message.includes('service is currently unavailable') || 
            error.message.includes('quota exceeded') ||
            error.message.includes('rate limit') ||
            error.message.includes('temporarily unavailable') ||
            error.message.includes('aborted'))) ||
            error?.status === 409) {
            
            try {
                // Store the operation for later retry
                const operationData = {
                    operationType: 'append',
                    spreadsheetId: extractSpreadsheetId(spreadsheetUrl),
                    range: range,
                    values: values,
                    characterName: isCharacterObject ? character?.name : null,
                    userId: isUserObject ? character?.discordId : character?.userId,
                    sheetType: range.split('!')[0].toLowerCase(),
                    commandName: context?.commandName || client?.commandName,
                    userTag: context?.userTag || client?.user?.tag,
                    clientUserId: context?.userId || client?.user?.id,
                    options: context?.options || client?.options?.data,
                    originalError: errorMessage
                };
                
                const operationId = await storePendingSheetOperation(operationData);
                
                // Don't throw the error - the operation will be retried later
                return { success: false, storedForRetry: true, operationId };
                
            } catch (storageError) {
                logger.error('Failed to store operation for retry', storageError, 'googleSheetsUtils.js');
                // Fall through to throw the original error
            }
        }
        
        // Add context to the error
        if (error && typeof error === 'object') {
            error.context = {
                characterName: isCharacterObject ? character?.name : null,
                userId: isUserObject ? character?.discordId : character?.userId,
                spreadsheetId: extractSpreadsheetId(spreadsheetUrl),
                range: range,
                sheetType: range.split('!')[0].toLowerCase(),
                commandName: context?.commandName || client?.commandName,
                userTag: context?.userTag || client?.user?.tag,
                clientUserId: context?.userId || client?.user?.id,
                options: context?.options || client?.options?.data
            };
        }
        throw error;
    }
}

// ------------------- Function: parseSheetData -------------------
// Parses data from a vending sheet
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
        logger.error('Error parsing sheet data', error, 'googleSheetsUtils.js');
        throw error;
    }
}

// ============================================================================
// ------------------- Fallback Storage Functions -------------------
// Stores pending sheet operations when Google Sheets is unavailable
// ============================================================================

// ------------------- Function: storePendingSheetOperation -------------------
// Stores a pending sheet operation in TempData for later retry
async function storePendingSheetOperation(operationData) {
  try {
    const operationId = `sheet_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await TempData.create({
      key: operationId,
      type: 'pendingSheetOperation',
      data: {
        ...operationData,
        retryCount: 0,
        lastAttempt: new Date(),
        createdAt: new Date()
      },
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    return operationId;
  } catch (error) {
    logger.error('Error storing pending operation', error, 'googleSheetsUtils.js');
    throw error;
  }
}

// ------------------- Function: retryPendingSheetOperations -------------------
// Attempts to retry all pending sheet operations
async function retryPendingSheetOperations() {
  try {
    const pendingOperations = await TempData.findAllByType('pendingSheetOperation');
    
    if (pendingOperations.length === 0) {
      return { success: true, retried: 0, failed: 0 };
    }
    
    let successCount = 0;
    let failureCount = 0;
    const maxRetries = 3;

    for (const operation of pendingOperations) {
      try {
        // Check if operation has exceeded max retries
        if (operation.data.retryCount >= maxRetries) {
          await TempData.findByIdAndDelete(operation._id);
          failureCount++;
          continue;
        }

        // Add a small delay between retries to avoid conflicts
        if (operation.data.retryCount > 0) {
          const delay = Math.min(1000 * operation.data.retryCount, 5000); // 1s, 2s, 3s, 4s, 5s max
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        // Attempt to execute the original operation
        const auth = await authorizeSheets();
        const sheets = google.sheets({ version: 'v4', auth });
        
        if (operation.data.operationType === 'append') {
          await sheets.spreadsheets.values.append({
            spreadsheetId: operation.data.spreadsheetId,
            range: operation.data.range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: operation.data.values }
          });
        } else if (operation.data.operationType === 'write') {
          await sheets.spreadsheets.values.update({
            spreadsheetId: operation.data.spreadsheetId,
            range: operation.data.range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: operation.data.values }
          });
        }

        // Success - remove the pending operation
        await TempData.findByIdAndDelete(operation._id);
        successCount++;
        
      } catch (error) {
        // Increment retry count
        await TempData.findByIdAndUpdate(operation._id, {
          $inc: { 'data.retryCount': 1 },
          $set: { 'data.lastAttempt': new Date() }
        });
        
        failureCount++;
      }
    }

    return { success: true, retried: successCount, failed: failureCount };
    
  } catch (error) {
    logger.error('Error during retry process', error, 'googleSheetsUtils.js');
    return { success: false, error: error.message };
  }
}

// ------------------- Function: getPendingSheetOperationsCount -------------------
// Returns the count of pending sheet operations
async function getPendingSheetOperationsCount() {
  try {
    const count = await TempData.countDocuments({ type: 'pendingSheetOperation' });
    return count;
  } catch (error) {
    return 0;
  }
}

// ------------------- Function: diagnoseGoogleSheetsSetup -------------------
// Provides diagnostic information about Google Sheets setup and common issues
function diagnoseGoogleSheetsSetup() {
  try {
    const credentials = getServiceAccountCredentials();
    const env = process.env.NODE_ENV || 'development';
    
    if (!credentials) {
      logger.warn('No Google Sheets credentials available', 'googleSheetsUtils.js');
      return { success: false, error: 'No credentials' };
    }
    
    logger.info(`Google Sheets: ${credentials.client_email} (${env})`, 'googleSheetsUtils.js');
    
    return {
      success: true,
      serviceAccountEmail: credentials.client_email,
      projectId: credentials.project_id,
      environment: env,
      hasPrivateKey: !!credentials.private_key,
      hasPrivateKeyId: !!credentials.private_key_id
    };
  } catch (error) {
    logger.error('Diagnostic failed', error, 'googleSheetsUtils.js');
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================================================
// ------------------- Exports -------------------
// Module exports grouped by functionality
// ============================================================================

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
    validateTokenTrackerSheet,
    safeAppendDataToSheet,
    parseSheetData,
    storePendingSheetOperation,
    retryPendingSheetOperations,
    getPendingSheetOperationsCount,
    diagnoseGoogleSheetsSetup
};