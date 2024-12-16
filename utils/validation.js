// ------------------- Import Statements -------------------
// Group imports by type: standard libraries, third-party modules, local modules
const mongoose = require('mongoose');
const Character = require('../models/CharacterModel');
const { isVillageExclusiveJob } = require('../modules/jobsModule');
const { isValidVillage } = require('../modules/locationsModule');
const { isValidRace, getRaceValueByName } = require('../modules/raceModule');
const { capitalizeFirstLetter } = require('../modules/formattingModule');

// ------------------- Database URIs from Environment Variables -------------------
const tinglebotUri = process.env.MONGODB_TINGLEBOT_URI;
const inventoriesUri = process.env.MONGODB_INVENTORIES_URI;

// ------------------- Database Connection Functions -------------------
// Ensure the Mongoose connection is established for the Tinglebot database
async function ensureTinglebotConnection() {
    if (mongoose.connection.readyState === 0) {
        try {
            await mongoose.connect(tinglebotUri, {}); // Add connection options here if needed
            console.log('[validation.js]: Successfully connected to Tinglebot database.');
        } catch (error) {
            console.error('[validation.js]: Error connecting to Tinglebot database:', error);
        }
    }
}

// Ensure the Mongoose connection is established for the Inventories database
async function ensureInventoriesConnection() {
    try {
        const inventoriesConnection = mongoose.createConnection(inventoriesUri, {}); // Add connection options here if needed

        inventoriesConnection.on('error', (error) => {
            console.error('[validation.js]: Error connecting to Inventories database:', error);
        });

        inventoriesConnection.once('open', () => {
            console.log('[validation.js]: Successfully connected to Inventories database.');
        });

        return inventoriesConnection;
    } catch (error) {
        console.error('[validation.js]: Error initializing Inventories database connection:', error);
        throw error;
    }
}

// Ensure the collection exists in the database
async function ensureCollectionExists(dbConnection, collectionName) {
    try {
        const db = dbConnection.db;
        const collections = await db.listCollections().toArray();
        const collectionExists = collections.some(col => col.name === collectionName);

        if (!collectionExists) {
            await db.createCollection(collectionName);
            console.log(`[validation.js]: Created missing collection: ${collectionName}`);
        }
    } catch (error) {
        console.error(`[validation.js]: Error ensuring collection ${collectionName} exists:`, error);
        throw error;
    }
}

// ------------------- Character Validation Functions -------------------
// Check if the character name is unique for a user
async function isUniqueCharacterName(userId, characterName) {
    try {
        const existingCharacter = await Character.findOne({ userId, name: characterName });
        return !existingCharacter;
    } catch (error) {
        console.error('[validation.js]: Error checking unique character name:', error);
        throw error;
    }
}

// Check if a character can change their village
async function canChangeVillage(character, newVillage) {
    if (!isValidVillage(newVillage)) {
        return { valid: false, message: '❌ Invalid village specified.' };
    }

    const villageJob = isVillageExclusiveJob(character.job);
    const capitalizedVillageJob = capitalizeFirstLetter(villageJob);
    const capitalizedNewVillage = capitalizeFirstLetter(newVillage);

    return villageJob && villageJob.toLowerCase() !== newVillage.toLowerCase() ? {
        valid: false,
        message: `⚠️ **${character.name}** cannot change their village to **${capitalizedNewVillage}** because the job **${character.job}** is exclusive to **${capitalizedVillageJob}** village.`
    } : { valid: true, message: '' };
}

// Check if a character can change their job
async function canChangeJob(character, newJob) {
    if (!character || !newJob) {
        console.error('[validation.js]: Character or job information is missing.');
        return { valid: false, message: '❌ Character or job information is missing.' };
    }

    if (!character.homeVillage) {
        console.error('[validation.js]: Character home village is missing.');
        return { valid: false, message: '❌ Character home village is missing.' };
    }

    const jobVillage = isVillageExclusiveJob(newJob);

    if (!jobVillage) {
        return { valid: true, message: '' };
    }

    if (jobVillage.toLowerCase() !== character.homeVillage.toLowerCase()) {
        console.warn(`[validation.js]: Validation failed: Job exclusive to ${jobVillage}, character in ${character.homeVillage}`);
        return {
            valid: false,
            message: `❌ **${character.name}** cannot have the job **${newJob}**. **${newJob}** is exclusive to **${capitalizeFirstLetter(jobVillage)}**, but **${character.name}**'s home village is **${capitalizeFirstLetter(character.homeVillage)}**.`
        };
    }

    console.log('[validation.js]: Job validation passed.');
    return { valid: true, message: '' };
}

// ------------------- Inventory Validation Functions -------------------
// Validate the character's inventory
function validateCharacterInventory(inventory) {
    return Array.isArray(inventory) && inventory.every(item => item.name && item.quantity);
}

// ------------------- URL Validation Functions -------------------
// Validate if a given URL is a valid Google Sheets URL
function isValidGoogleSheetsUrl(url) {
    const regex = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+\/(edit|view)(\?[^#]+)?(#.+)?$/;
    return regex.test(url);
}

// Extract the spreadsheet ID from a Google Sheets URL
function extractSpreadsheetId(url) {
    if (typeof url !== 'string') {
        throw new Error('Invalid URL: URL must be a string');
    }
    const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// ------------------- Image Validation Functions -------------------
// Function to check if a URL is a valid image URL
const isValidImageUrl = (url) => {
    return /\.(jpeg|jpg|gif|png)$/.test(url);
};

// ------------------- Utility Functions -------------------
// Convert height in cm to feet and inches
function convertCmToFeetInches(cm) {
    const totalInches = cm / 2.54;
    let feet = Math.floor(totalInches / 12);
    let inches = Math.round(totalInches % 12);

    if (inches === 12) {
        inches = 0;
        feet += 1;
    }

    return `${feet}'${inches < 10 ? '0' : ''}${inches}"`;
}

// ------------------- Module Exports -------------------
// Export all functions to be used in other modules
module.exports = {
    ensureTinglebotConnection,
    ensureInventoriesConnection,
    ensureCollectionExists,
    isUniqueCharacterName,
    canChangeJob,
    canChangeVillage,
    validateCharacterInventory,
    isValidGoogleSheetsUrl,
    extractSpreadsheetId,
    isValidRace,
    getRaceValueByName,
    isValidImageUrl,
    convertCmToFeetInches
};
