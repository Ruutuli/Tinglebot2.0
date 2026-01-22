// ============================================================================
// ------------------- Migration Script: OC Application System -------------------
// Migrates existing characters to the new application workflow system
// ============================================================================

require('dotenv').config();
const mongoose = require('mongoose');
const Character = require('../models/CharacterModel');
const CharacterModeration = require('../models/CharacterModerationModel');
const logger = require('../utils/logger');
const { connectToTinglebot } = require('../database/db');

/**
 * Migrate existing characters to application system
 */
async function migrateToApplicationSystem() {
  try {
    logger.info('MIGRATION', 'Starting migration to OC application system...');
    
    await connectToTinglebot();
    
    // Get all characters
    const characters = await Character.find({}).lean();
    logger.info('MIGRATION', `Found ${characters.length} characters to migrate`);
    
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const char of characters) {
      try {
        const updates = {};
        let needsUpdate = false;
        
        // Set applicationVersion if not set
        if (!char.applicationVersion) {
          updates.applicationVersion = 1;
          needsUpdate = true;
        }
        
        // Set submittedAt based on status
        if (char.status === 'pending' && !char.submittedAt) {
          updates.submittedAt = char.createdAt || new Date();
          needsUpdate = true;
        }
        
        // Set approvedAt for accepted characters
        if (char.status === 'accepted' && !char.approvedAt) {
          updates.approvedAt = char.updatedAt || char.createdAt || new Date();
          needsUpdate = true;
        }
        
        // Set decidedAt for decided characters
        if ((char.status === 'accepted' || char.status === 'denied') && !char.decidedAt) {
          updates.decidedAt = char.updatedAt || char.createdAt || new Date();
          needsUpdate = true;
        }
        
        // Generate publicSlug if not set
        if (!char.publicSlug && char.name) {
          updates.publicSlug = char.name.toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
          needsUpdate = true;
        }
        
        // Update character if needed
        if (needsUpdate) {
          await Character.findByIdAndUpdate(char._id, { $set: updates });
          migrated++;
          logger.info('MIGRATION', `Migrated character: ${char.name} (status: ${char.status || 'null'})`);
        } else {
          skipped++;
        }
        
        // Migrate existing CharacterModeration votes to include applicationVersion
        const votes = await CharacterModeration.find({ characterId: char._id });
        for (const vote of votes) {
          if (!vote.applicationVersion) {
            await CharacterModeration.findByIdAndUpdate(vote._id, {
              $set: { applicationVersion: 1 }
            });
          }
        }
        
      } catch (error) {
        errors++;
        logger.error('MIGRATION', `Error migrating character ${char.name || char._id}:`, error);
      }
    }
    
    logger.success('MIGRATION', `Migration completed! Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}`);
    
    // Summary
    const summary = {
      total: characters.length,
      migrated,
      skipped,
      errors
    };
    
    console.log('\n=== Migration Summary ===');
    console.log(`Total characters: ${summary.total}`);
    console.log(`Migrated: ${summary.migrated}`);
    console.log(`Skipped (already up to date): ${summary.skipped}`);
    console.log(`Errors: ${summary.errors}`);
    console.log('========================\n');
    
    return summary;
  } catch (error) {
    logger.error('MIGRATION', 'Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateToApplicationSystem()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateToApplicationSystem };
