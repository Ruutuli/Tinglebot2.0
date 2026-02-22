// ------------------- validation.js -------------------
// This module provides various validation functions for the application,
// including database connection functions, character validation, URL and image validation,
// and utility functions for converting measurements.

// ============================================================================
// Standard Libraries & Third-Party Modules
// ------------------- Importing standard and third-party modules -------------------
const mongoose = require('mongoose');
const { EmbedBuilder } = require('discord.js');

const { handleError } = require('./globalErrorHandler');
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
const { checkVillageStatus } = require('../modules/villageModule');


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
        const existingCharacter = await Character.findOne({ 
            userId, 
            name: { $regex: new RegExp(`^${characterName}$`, 'i') }
        });
        return !existingCharacter;
    } catch (error) {
        handleError(error, 'validation.js');
        console.error('[validation.js]: Error checking unique character name:', error);
        throw error;
    }
}

// ------------------- Unique Mod Character Name Check -------------------
// Checks if the given mod character name is unique for the specified user.
async function isUniqueModCharacterName(userId, characterName) {
    try {
        const ModCharacter = require('../models/ModCharacterModel');
        const existingModCharacter = await ModCharacter.findOne({ 
            userId, 
            name: { $regex: new RegExp(`^${characterName}$`, 'i') }
        });
        return !existingModCharacter;
    } catch (error) {
        handleError(error, 'validation.js');
        console.error('[validation.js]: Error checking unique mod character name:', error);
        throw error;
    }
}

// ------------------- Village Change Validation -------------------
// Checks if a character can change their village based on their job restrictions.
async function canChangeVillage(character, newVillage) {
    if (!isValidVillage(newVillage)) {
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Invalid Village')
            .setDescription('The specified village is not valid.')
            .addFields(
                { name: 'Village', value: newVillage, inline: true }
            )
            .setFooter({ text: 'Please select a valid village from the list' })
            .setTimestamp();

        return { valid: false, message: errorEmbed };
    }

    // Check if current village is damaged (mod characters are exempt)
    // Check if character is a mod character - try both isModCharacter property and constructor name
    const isModCharacter = character.isModCharacter || (character.constructor && character.constructor.modelName === 'ModCharacter');
    if (!isModCharacter && character.currentVillage) {
        const villageStatus = await checkVillageStatus(character.currentVillage);
        if (villageStatus === 'damaged') {
            const capitalizedCurrentVillage = capitalizeFirstLetter(character.currentVillage);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Village Repair Required')
                .setDescription(`**${character.name}** cannot move villages because **${capitalizedCurrentVillage}** is damaged and needs repair.`)
                .addFields(
                    { name: 'What to do', value: 'Please help repair the village first by contributing tokens using the </village donate> command.', inline: false }
                )
                .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
                .setFooter({ text: 'Repair the village to unlock travel and village changes' })
                .setTimestamp();

            return {
                valid: false,
                message: errorEmbed
            };
        }
    }

    const villageJob = isVillageExclusiveJob(character.job);
    const capitalizedVillageJob = capitalizeVillageName(villageJob);
    const capitalizedNewVillage = capitalizeVillageName(newVillage);

    if (villageJob && villageJob.toLowerCase() !== newVillage.toLowerCase()) {
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('⚠️ Village Change Restricted')
            .setDescription(`**${character.name}** cannot change their village to **${capitalizedNewVillage}** because their job is exclusive to another village.`)
            .addFields(
                { name: 'Job', value: character.job, inline: true },
                { name: 'Required Village', value: capitalizedVillageJob, inline: true },
                { name: 'Attempted Village', value: capitalizedNewVillage, inline: true }
            )
            .setFooter({ text: 'Some jobs are exclusive to specific villages' })
            .setTimestamp();

        return { valid: false, message: errorEmbed };
    }
    return { valid: true, message: '' };
}

// ------------------- Job Change Validation -------------------
// Checks if a character can change their job based on home village restrictions.
async function canChangeJob(character, newJob) {
    if (!character || !newJob) {
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Missing Information')
            .setDescription('Character or job information is missing.')
            .addFields(
                { name: 'Character', value: character ? character.name : 'Not provided', inline: true },
                { name: 'Job', value: newJob || 'Not provided', inline: true }
            )
            .setFooter({ text: 'Please provide all required information' })
            .setTimestamp();

        return { valid: false, message: errorEmbed };
    }

    if (!character.homeVillage) {
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Missing Home Village')
            .setDescription('Character home village is missing.')
            .addFields(
                { name: 'Character', value: character.name, inline: true }
            )
            .setFooter({ text: 'Please set a home village for your character' })
            .setTimestamp();

        return { valid: false, message: errorEmbed };
    }

    // Check if character is in their home village
    if (!character.currentVillage || character.currentVillage.toLowerCase() !== character.homeVillage.toLowerCase()) {
        const capitalizedHomeVillage = capitalizeFirstLetter(character.homeVillage);
        const capitalizedCurrentVillage = character.currentVillage ? capitalizeFirstLetter(character.currentVillage) : 'Unknown';
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Wrong Location')
            .setDescription(`**${character.name}** must be in their home village to change jobs.`)
            .addFields(
                { name: 'Home Village', value: capitalizedHomeVillage, inline: true },
                { name: 'Current Location', value: capitalizedCurrentVillage, inline: true }
            )
            .setFooter({ text: 'Travel to your home village first' })
            .setTimestamp();

        return {
            valid: false,
            message: errorEmbed
        };
    }

    // Check if village is damaged (mod characters are exempt)
    // DISABLED DURING TESTING - Will be re-enabled after testing phase
    // Check if character is a mod character - try both isModCharacter property and constructor name
    const isModCharacter = character.isModCharacter || (character.constructor && character.constructor.modelName === 'ModCharacter');
    if (false && !isModCharacter && character.currentVillage) { // Disabled: if (false && ...)
        const villageStatus = await checkVillageStatus(character.currentVillage);
        if (villageStatus === 'damaged') {
            const capitalizedCurrentVillage = capitalizeFirstLetter(character.currentVillage);
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Village Repair Required')
                .setDescription(`**${character.name}** cannot change jobs because **${capitalizedCurrentVillage}** is damaged and needs repair.`)
                .addFields(
                    { name: 'What to do', value: 'Please help repair the village first by contributing tokens.', inline: false }
                )
                .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
                .setTimestamp();
            
            return {
                valid: false,
                message: errorEmbed
            };
        }
    }

    const jobVillage = isVillageExclusiveJob(newJob);

    if (!jobVillage) {
        return { valid: true, message: '' };
    }

    if (jobVillage.toLowerCase() !== character.homeVillage.toLowerCase()) {
        console.warn(`[validation.js]: Validation failed: Job exclusive to ${jobVillage}, character in ${character.homeVillage}`);
        const errorEmbed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Job Village Mismatch')
            .setDescription(`**${character.name}** cannot have the job **${newJob}** because it is exclusive to a different village.`)
            .addFields(
                { name: 'Job', value: newJob, inline: true },
                { name: 'Required Village', value: capitalizeFirstLetter(jobVillage), inline: true },
                { name: "Character's Home Village", value: capitalizeFirstLetter(character.homeVillage), inline: true }
            )
            .setFooter({ text: 'This job is exclusive to a specific village' })
            .setTimestamp();

        return {
            valid: false,
            message: errorEmbed
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
            const errorEmbed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('❌ Character Not Found')
                .setDescription(`The character "${characterName}" was not found.`)
                .addFields(
                    { name: 'Character Name', value: characterName, inline: true }
                )
                .setFooter({ text: 'Please check the character name and try again' })
                .setTimestamp();

            return { exists: false, message: errorEmbed };
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
// Image Validation Functions
// ------------------- Validate Image URL -------------------
// Checks if a URL is a valid image URL (supports jpeg, jpg, gif, png, and webp).
const isValidImageUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    if (url === 'No Image' || url === 'No Image Type') return false;
    if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
    return /\.(jpeg|jpg|gif|png|webp)$/i.test(url);
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
// Vending Validation Functions
// ------------------- Validate Vending Item -------------------
// Validates that a vending item has required fields and pricing information.
function validateVendingItem(item, vendorType) {
    const errors = [];
    
    if (!item || !item.itemName) {
        errors.push('Item name is required');
    }
    
    if (!item.slot) {
        errors.push('Slot is required');
    }
    
    if (!item.stockQty || item.stockQty <= 0) {
        errors.push('Stock quantity must be greater than 0');
    }
    
    // Price validation
    const pricingErrors = validateVendingPrices(item);
    if (pricingErrors.length > 0) {
        errors.push(...pricingErrors);
    }
    
    return {
        valid: errors.length === 0,
        errors: errors
    };
}

// ------------------- Validate Vending Prices -------------------
// Validates that at least one price is set for a vending item.
function validateVendingPrices(item) {
    const errors = [];
    
    if (!item) {
        errors.push('Item is required');
        return errors;
    }
    
    const hasTokenPrice = item.tokenPrice !== null && item.tokenPrice !== undefined && item.tokenPrice !== 0 && item.tokenPrice !== 'N/A';
    const hasArtPrice = item.artPrice !== null && item.artPrice !== undefined && item.artPrice !== '' && item.artPrice !== 'N/A';
    const hasOtherPrice = item.otherPrice !== null && item.otherPrice !== undefined && item.otherPrice !== '' && item.otherPrice !== 'N/A';
    const hasBarterOpen = item.barterOpen === true || item.tradesOpen === true;
    
    if (!hasTokenPrice && !hasArtPrice && !hasOtherPrice && !hasBarterOpen) {
        errors.push('At least one price type must be set (token price, art price, other price, or barter must be open)');
    }
    
    return errors;
}

// ------------------- Validate Vending Location -------------------
// Validates that vendor and buyer location rules are followed based on job type.
function validateVendingLocation(vendor, buyer) {
    if (!vendor || !buyer) {
        return {
            valid: false,
            error: 'Vendor and buyer information required'
        };
    }
    
    // Check both job and vendorType (vendorType takes precedence if set, but fall back to job)
    const vendorJob = (vendor.vendorType?.toLowerCase() || vendor.job?.toLowerCase());
    const vendorCurrentVillage = vendor.currentVillage?.toLowerCase();
    const vendorHomeVillage = vendor.homeVillage?.toLowerCase();
    const buyerCurrentVillage = buyer.currentVillage?.toLowerCase();
    
    // Shopkeeper restrictions
    if (vendorJob === 'shopkeeper') {
        const vendorInHomeVillage = vendorCurrentVillage === vendorHomeVillage;
        const buyerInVendorHome = buyerCurrentVillage === vendorHomeVillage;
        
        // Shopkeepers can only sell when:
        // 1. Vendor is in home village (selling to anyone)
        // 2. Buyer is in vendor's home village (visiting vendor's shop)
        if (!vendorInHomeVillage && !buyerInVendorHome) {
            return {
                valid: false,
                error: 'Shopkeepers can only sell when they are in their home village or when buyers visit their home village',
                vendorLocation: vendor.currentVillage,
                buyerLocation: buyer.currentVillage,
                vendorHome: vendor.homeVillage
            };
        }
        
        // If vendor is outside home village, block sale (they can't sell while traveling)
        if (!vendorInHomeVillage) {
            return {
                valid: false,
                error: 'Shopkeepers cannot sell while traveling outside their home village',
                vendorLocation: vendor.currentVillage,
                vendorHome: vendor.homeVillage
            };
        }
    }
    // Merchant restrictions
    else if (vendorJob === 'merchant') {
        // Merchants can sell anywhere, but buyer must be in same village as vendor
        if (vendorCurrentVillage !== buyerCurrentVillage) {
            return {
                valid: false,
                error: 'You must be in the same village as the merchant to make a purchase',
                vendorLocation: vendor.currentVillage,
                buyerLocation: buyer.currentVillage
            };
        }
    }
    
    // If we get here, location is valid
    return {
        valid: true,
        error: null
    };
}

// ============================================================================
// Module Exports
// ------------------- Exporting all validation functions -------------------
module.exports = {
    ensureTinglebotConnection,
    ensureInventoriesConnection,
    ensureCollectionExists,
    isUniqueCharacterName,
    isUniqueModCharacterName,
    canChangeJob,
    canChangeVillage,
    validateCharacterInventory,
    isValidRace,
    getRaceValueByName,
    isValidImageUrl,
    convertCmToFeetInches,
    characterExistsNotOwned,
    validateVendingItem,
    validateVendingPrices,
    validateVendingLocation
};
