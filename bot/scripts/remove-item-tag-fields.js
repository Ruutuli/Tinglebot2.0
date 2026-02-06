// ============================================================================
// ------------------- Remove Item Tag Fields Migration Script -------------------
// Purpose: Removes the six redundant Tag fields from all items in the database
// Usage: node bot/scripts/remove-item-tag-fields.js [--dry-run]
// 
// Fields to remove:
// - obtainTags
// - gatheringTags
// - lootingTags
// - craftingTags
// - locationsTags
// - allJobsTags
//
// IMPORTANT: Run this script AFTER deploying code changes that no longer
// read or write these fields. This ensures the database cleanup happens safely.
// ============================================================================

const { MongoClient } = require('mongodb');
const dbConfig = require('../config/database');

// ============================================================================
// ------------------- Configuration -------------------
// ============================================================================

const FIELDS_TO_REMOVE = [
  'obtainTags',
  'gatheringTags',
  'lootingTags',
  'craftingTags',
  'locationsTags',
  'allJobsTags'
];

// ============================================================================
// ------------------- Main Migration Function -------------------
// ============================================================================

async function removeTagFields(dryRun = false) {
  let client = null;
  
  try {
    // Get MongoDB URI from database config (tinglebot database)
    const uri = dbConfig.tinglebot;
    
    if (!uri) {
      throw new Error('Missing MongoDB URI. Set MONGODB_TINGLEBOT_URI_PROD, MONGODB_TINGLEBOT_URI, or MONGODB_URI environment variable.');
    }

    console.log('Connecting to MongoDB (tinglebot database)...');
    client = new MongoClient(uri, dbConfig.options);
    await client.connect();
    
    // Extract database name from URI or use default
    const dbName = uri.split('/').pop().split('?')[0] || 'tinglebot';
    const db = client.db(dbName);
    const collection = db.collection('items');

    console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Checking items collection...`);

    // Count items that have at least one of the Tag fields
    const itemsWithTags = await collection.countDocuments({
      $or: FIELDS_TO_REMOVE.map(field => ({ [field]: { $exists: true } }))
    });

    console.log(`Found ${itemsWithTags} items with at least one Tag field to remove.`);

    if (dryRun) {
      console.log('\n[DRY RUN] Would remove the following fields:');
      FIELDS_TO_REMOVE.forEach(field => console.log(`  - ${field}`));
      console.log('\n[DRY RUN] No changes were made. Run without --dry-run to execute.');
      return;
    }

    // Perform the update
    console.log('\nRemoving Tag fields from all items...');
    const result = await collection.updateMany(
      {},
      {
        $unset: FIELDS_TO_REMOVE.reduce((acc, field) => {
          acc[field] = "";
          return acc;
        }, {})
      }
    );

    console.log(`\n✅ Migration completed successfully!`);
    console.log(`   Matched: ${result.matchedCount} items`);
    console.log(`   Modified: ${result.modifiedCount} items`);

    // Verify removal
    const remainingItemsWithTags = await collection.countDocuments({
      $or: FIELDS_TO_REMOVE.map(field => ({ [field]: { $exists: true } }))
    });

    if (remainingItemsWithTags === 0) {
      console.log(`\n✅ Verification: All Tag fields have been removed.`);
    } else {
      console.log(`\n⚠️  Warning: ${remainingItemsWithTags} items still have Tag fields.`);
      console.log('   This may indicate some items were not updated.');
    }

  } catch (error) {
    console.error('\n❌ Error during migration:', error);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('\nDatabase connection closed.');
    }
  }
}

// ============================================================================
// ------------------- Script Entry Point -------------------
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('='.repeat(70));
  console.log('Item Tag Fields Removal Migration Script');
  console.log('='.repeat(70));
  
  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
  } else {
    console.log('\n⚠️  LIVE MODE - Changes will be made to the database\n');
    console.log('Press Ctrl+C within 5 seconds to cancel...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  await removeTagFields(dryRun);
  
  console.log('\n' + '='.repeat(70));
  console.log('Migration script completed.');
  console.log('='.repeat(70));
}

// Run the script
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
