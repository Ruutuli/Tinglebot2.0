// ============================================================================
// ------------------- Inventory Links Migration Script -------------------
// One-time script to update all existing character inventory links
// from Google Sheets URLs to the new dashboard format
// ============================================================================

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Character = require('../models/CharacterModel');
const ModCharacter = require('../models/ModCharacterModel');
const { connectToTinglebot } = require('../database/db');
const logger = require('../utils/logger');

async function migrateInventoryLinks() {
  try {
    logger.info('MIGRATION', 'Starting inventory links migration...');
    
    // Connect to database
    await connectToTinglebot();
    logger.info('MIGRATION', 'Connected to database');
    
    // Update all regular characters
    const regularCharacters = await Character.find({});
    let regularUpdated = 0;
    
    for (const character of regularCharacters) {
      const newInventoryLink = `https://tinglebot.xyz/character-inventory.html?character=${encodeURIComponent(character.name)}`;
      
      // Only update if it's not already in the new format
      if (character.inventory !== newInventoryLink) {
        character.inventory = newInventoryLink;
        await character.save();
        regularUpdated++;
      }
    }
    
    logger.info('MIGRATION', `Updated ${regularUpdated} regular characters to new inventory link format`);
    
    // Update all mod characters
    const modCharacters = await ModCharacter.find({});
    let modUpdated = 0;
    
    for (const character of modCharacters) {
      const newInventoryLink = `https://tinglebot.xyz/character-inventory.html?character=${encodeURIComponent(character.name)}`;
      
      // Only update if it's not already in the new format
      if (character.inventory !== newInventoryLink) {
        character.inventory = newInventoryLink;
        await character.save();
        modUpdated++;
      }
    }
    
    logger.info('MIGRATION', `Updated ${modUpdated} mod characters to new inventory link format`);
    
    logger.success('MIGRATION', 'Inventory links migration completed successfully!');
    logger.info('MIGRATION', `Total characters updated: ${regularUpdated + modUpdated}`);
    logger.info('MIGRATION', `Regular characters: ${regularUpdated}, Mod characters: ${modUpdated}`);
    
    process.exit(0);
  } catch (error) {
    logger.error('MIGRATION', 'Error during inventory links migration', error);
    process.exit(1);
  }
}

// Run migration
migrateInventoryLinks();
