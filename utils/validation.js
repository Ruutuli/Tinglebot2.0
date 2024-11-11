const mongoose = require('mongoose');
const Character = require('../models/CharacterModel');
const { getVillageExclusiveJobs, isVillageExclusiveJob } = require('../modules/jobsModule');
const { getVillageRegionByName, isValidVillage } = require('../modules/locationsModule');
const { isValidRace, getRaceValueByName } = require('../modules/raceModule'); // Added getRaceValueByName
const { capitalizeFirstLetter } = require('../modules/formattingModule'); // Import capitalizeFirstLetter

// Database URIs from environment variables
const tinglebotUri = process.env.MONGODB_TINGLEBOT_URI;
const inventoriesUri = process.env.MONGODB_INVENTORIES_URI;

// Ensure the Mongoose connection is established for Tinglebot database
async function ensureTinglebotConnection() {
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(tinglebotUri, {
            // Connection options can be added here
        });
    }
}

// Ensure the Mongoose connection is established for Inventories database
async function ensureInventoriesConnection() {
    const inventoriesConnection = mongoose.createConnection(inventoriesUri, {
        // Connection options can be added here
    });

    inventoriesConnection.on('error', (error) => {
        // Handle error connecting to inventories database
    });

    inventoriesConnection.once('open', () => {
        // Connected to inventories database
    });

    return inventoriesConnection;
}

// Ensure the collection exists in the database
async function ensureCollectionExists(dbConnection, collectionName) {
    const db = dbConnection.db;
    const collections = await db.listCollections().toArray();
    const collectionExists = collections.some(col => col.name === collectionName);

    if (!collectionExists) {
        await db.createCollection(collectionName);
    }
}

// Check if the character name is unique for a user
async function isUniqueCharacterName(userId, characterName) {
    const existingCharacter = await Character.findOne({ userId, name: characterName });
    return !existingCharacter;
}

// Check if a character can change their village
async function canChangeVillage(character, newVillage) {
    if (!isValidVillage(newVillage)) {
        return { valid: false, message: '❌ Invalid village specified.' };
    }

    const villageJob = isVillageExclusiveJob(character.job);
    const capitalizedVillageJob = capitalizeFirstLetter(villageJob);
    const capitalizedNewVillage = capitalizeFirstLetter(newVillage);

    const validationResult = villageJob && villageJob.toLowerCase() !== newVillage.toLowerCase() ? {
        valid: false,
        message: `⚠️ **${character.name}** cannot change their village to **${capitalizedNewVillage}** because the job **${character.job}** is exclusive to **${capitalizedVillageJob}** village.`
    } : { valid: true, message: '' };

    return validationResult;
}

// Check if a character can change their job
async function canChangeJob(character, newJob) {
    // Ensure character and newJob are defined
    if (!character || !newJob) {
        return {
            valid: false,
            message: 'Character or job information is missing.'
        };
    }

    // Ensure character.homeVillage is defined
    if (!character.homeVillage) {
        return {
            valid: false,
            message: 'Character home village is missing.'
        };
    }

    // Get the village associated with the new job
    const jobVillage = isVillageExclusiveJob(newJob);

    // Check if the job is village-exclusive and if the character's home village matches
    if (jobVillage && jobVillage.toLowerCase() !== character.homeVillage.toLowerCase()) {
        return {
            valid: false,
            message: `⚠️ **${character.name}** cannot have **${newJob}** because they live in **${capitalizeFirstLetter(character.homeVillage)}**.`
        };
    }

    return { valid: true, message: '' };
}

// Validate the character's inventory
function validateCharacterInventory(inventory) {
    return Array.isArray(inventory) && inventory.every(item => item.name && item.quantity);
}

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
    if (match && match[1]) {
        return match[1];
    }
    return null;
}

// Function to check if a URL is a valid image URL
const isValidImageUrl = (url) => {
    return /\.(jpeg|jpg|gif|png)$/.test(url);
};

// Convert height in cm to feet and inches
function convertCmToFeetInches(cm) {
    const totalInches = cm / 2.54;
    let feet = Math.floor(totalInches / 12); // Change from const to let
    let inches = Math.round(totalInches % 12);

    // Adjust if inches reach 12
    if (inches === 12) {
        inches = 0;
        feet += 1;
    }

    return `${feet}'${inches < 10 ? '0' : ''}${inches}"`;
}


// Exported validation functions
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


