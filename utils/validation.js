// ------------------- validation.js -------------------
// This module provides various validation functions for the application,
// including database connection functions, character validation, URL and image validation,
// and utility functions for converting measurements.

// ============================================================================
// Standard Libraries & Third-Party Modules
// ------------------- Importing standard and third-party modules -------------------
const mongoose = require('mongoose');

const { handleError } = require('../utils/globalErrorHandler');
// ============================================================================
// Database Models
// ------------------- Importing database models -------------------
const Character = require('../models/CharacterModel');

// ============================================================================
// Modules
// ------------------- Importing custom modules -------------------
const { isVillageExclusiveJob } = require('../modules/jobsModule');
const { isValidVillage } = require('../modules/locationsModule');
const { isValidRace, getRaceValueByName } = require('../modules/raceModule');
const { capitalizeFirstLetter } = require('../modules/formattingModule');
const { capitalizeVillageName } = require('./stringUtils');


// ============================================================================
// Environment Variables
// ------------------- Database URIs from Environment Variables -------------------
const tinglebotUri = process.env.MONGODB_TINGLEBOT_URI;
const inventoriesUri = process.env.MONGODB_INVENTORIES_URI;


// ============================================================================
// Database Connection Functions
// ------------------- Tinglebot Database Connection -------------------
// Ensures that the Mongoose connection is established for the Tinglebot database.
async function ensureTinglebotConnection() {
    if (mongoose.connection.readyState === 0) {
        try {
            await mongoose.connect(tinglebotUri, {}); // Add connection options here if needed
            console.log('[validation.js]: Successfully connected to Tinglebot database.');
        } catch (error) {
    handleError(error, 'validation.js');

            console.error('[validation.js]: Error connecting to Tinglebot database:', error);
        }
    }
}

// ------------------- Inventories Database Connection -------------------
// Ensures that the Mongoose connection is established for the Inventories database.
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
    handleError(error, 'validation.js');

        console.error('[validation.js]: Error initializing Inventories database connection:', error);
        throw error;
    }
}

// ------------------- Ensure Collection Exists -------------------
// Ensures that the specified collection exists in the given database connection.
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
    handleError(error, 'validation.js');

        console.error(`[validation.js]: Error ensuring collection ${collectionName} exists:`, error);
        throw error;
    }
}


// ============================================================================
// Character Validation Functions
// ------------------- Unique Character Name Check -------------------
// Checks if the given character name is unique for the specified user.
async function isUniqueCharacterName(userId, characterName) {
    try {
        const existingCharacter = await Character.findOne({ userId, name: characterName });
        return !existingCharacter;
    } catch (error) {
    handleError(error, 'validation.js');

        console.error('[validation.js]: Error checking unique character name:', error);
        throw error;
    }
}

// ------------------- Village Change Validation -------------------
// Checks if a character can change their village based on their job restrictions.
async function canChangeVillage(character, newVillage) {
    if (!isValidVillage(newVillage)) {
        return { valid: false, message: '❌ Invalid village specified.' };
    }

    const villageJob = isVillageExclusiveJob(character.job);
    const capitalizedVillageJob = capitalizeVillageName(villageJob);
    const capitalizedNewVillage = capitalizeVillageName(newVillage);

    return villageJob && villageJob.toLowerCase() !== newVillage.toLowerCase() ? {
        valid: false,
        message: `⚠️ **${character.name}** cannot change their village to **${capitalizedNewVillage}** because the job **${character.job}** is exclusive to **${capitalizedVillageJob}** village.`
    } : { valid: true, message: '' };
}

// ------------------- Job Change Validation -------------------
// Checks if a character can change their job based on home village restrictions.
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

// ------------------- Character Existence Check -------------------
// Checks if a character exists but doesn't belong to the specified user.
async function characterExistsNotOwned(characterName, userId) {
    try {
        const character = await Character.findOne({ name: characterName });
        if (!character) {
            return { exists: false, message: '❌ Character not found.' };
        }
        if (character.userId === userId) {
            return { exists: true, owned: true, message: '' };
        }
        return { exists: true, owned: false, message: '' };
    } catch (error) {
        handleError(error, 'validation.js');
        console.error('[validation.js]: Error checking character existence:', error);
        throw error;
    }
}


// ============================================================================
// Inventory Validation Functions
// ------------------- Validate Character Inventory -------------------
// Validates that the character's inventory is an array and that each item has a name and quantity.
function validateCharacterInventory(inventory) {
    return Array.isArray(inventory) && inventory.every(item => item.name && item.quantity);
}


// ============================================================================
// URL Validation Functions
// ------------------- Google Sheets URL Validation -------------------
// Checks if a given URL is a valid Google Sheets URL.
function isValidGoogleSheetsUrl(url) {
    const regex = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9-_]+\/(edit|view)(\?[^#]+)?(#.+)?$/;
    return regex.test(url);
}

// ------------------- Extract Spreadsheet ID -------------------
// Extracts the spreadsheet ID from a valid Google Sheets URL.
function extractSpreadsheetId(url) {
    if (typeof url !== 'string') {
        throw new Error('Invalid URL: URL must be a string');
    }
    const regex = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}


// ============================================================================
// Image Validation Functions
// ------------------- Validate Image URL -------------------
// Checks if a URL is a valid image URL (supports jpeg, jpg, gif, and png).
const isValidImageUrl = (url) => {
    return /\.(jpeg|jpg|gif|png)$/.test(url);
};


// ============================================================================
// Utility Functions
// ------------------- Convert Centimeters to Feet & Inches -------------------
// Converts a height in centimeters to a formatted string in feet and inches.
function convertCmToFeetInches(heightInCm) {
    const totalInches = heightInCm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const inches = Math.round(totalInches % 12);
    return `${feet}' ${inches}"`;
  }


// ============================================================================
// Module Exports
// ------------------- Exporting all validation functions -------------------
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
    convertCmToFeetInches,
    characterExistsNotOwned
};
