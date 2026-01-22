// ============================================================================
// ------------------- Character Status Migration Script -------------------
// One-time script to set all existing characters to 'accepted' status
// Run this once after adding the status field to the models
// ============================================================================

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Character = require('../models/CharacterModel');
const ModCharacter = require('../models/ModCharacterModel');
const { connectToTinglebot } = require('../database/db');
const logger = require('../utils/logger');

async function migrateCharacterStatus() {
  try {
    logger.info('MIGRATION', 'Starting character status migration...');
    
    // Connect to database
    await connectToTinglebot();
    logger.info('MIGRATION', 'Connected to database');
    
    // Update all regular characters that don't have a status
    const regularResult = await Character.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'accepted' } }
    );
    logger.info('MIGRATION', `Updated ${regularResult.modifiedCount} regular characters to 'accepted' status`);
    
    // Update all mod characters that don't have a status
    const modResult = await ModCharacter.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'accepted' } }
    );
    logger.info('MIGRATION', `Updated ${modResult.modifiedCount} mod characters to 'accepted' status`);
    
    // Also update any characters with null/undefined status
    const regularNullResult = await Character.updateMany(
      { status: null },
      { $set: { status: 'accepted' } }
    );
    logger.info('MIGRATION', `Updated ${regularNullResult.modifiedCount} regular characters with null status to 'accepted'`);
    
    const modNullResult = await ModCharacter.updateMany(
      { status: null },
      { $set: { status: 'accepted' } }
    );
    logger.info('MIGRATION', `Updated ${modNullResult.modifiedCount} mod characters with null status to 'accepted'`);
    
    logger.success('MIGRATION', 'Character status migration completed successfully!');
    logger.info('MIGRATION', `Total characters updated: ${regularResult.modifiedCount + modResult.modifiedCount + regularNullResult.modifiedCount + modNullResult.modifiedCount}`);
    
    process.exit(0);
  } catch (error) {
    logger.error('MIGRATION', 'Error during character status migration', error);
    process.exit(1);
  }
}

// Run migration
migrateCharacterStatus();
