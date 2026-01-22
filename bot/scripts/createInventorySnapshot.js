// ============================================================================
// ------------------- Inventory Snapshot Script -------------------
// Purpose: Creates point-in-time snapshots of inventory for backup/recovery
// Usage: node bot/scripts/createInventorySnapshot.js [characterName] [--auto]
// 
// This script:
// 1. Creates snapshots of current inventory state
// 2. Can be run manually or scheduled (e.g., daily)
// 3. Stores snapshots in a separate collection for point-in-time recovery
// ============================================================================

const path = require('path');
const dotenv = require('dotenv');

const env = process.env.NODE_ENV || 'development';
const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const envSpecificPath = path.resolve(__dirname, '..', '..', `.env.${env}`);
if (require('fs').existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath });
} else {
  dotenv.config({ path: rootEnvPath });
}

const DatabaseConnectionManager = require('../database/connectionManager');
const Character = require('../models/CharacterModel');
const logger = require('../utils/logger');

// ============================================================================
// ------------------- Snapshot Functions -------------------
// ============================================================================

/**
 * Creates a snapshot of a character's current inventory
 * @param {string} characterName - Name of the character
 * @returns {Object} - Snapshot data
 */
async function createInventorySnapshot(characterName) {
  try {
    const escapedName = characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const character = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
    });

    if (!character) {
      throw new Error(`Character "${characterName}" not found`);
    }

    const inventoriesConnection = await DatabaseConnectionManager.connectToInventoriesNative();
    const db = inventoriesConnection.useDb('inventories');
    const collectionName = character.name.toLowerCase();
    const inventoryCollection = db.collection(collectionName);

    // Get all inventory items
    const items = await inventoryCollection.find({
      characterId: character._id
    }).toArray();

    // Aggregate quantities by item name
    const inventory = {};
    for (const item of items) {
      const itemName = item.itemName.toLowerCase().trim();
      if (!inventory[itemName]) {
        inventory[itemName] = {
          itemName: item.itemName, // Keep original casing
          quantity: 0,
          entries: []
        };
      }
      inventory[itemName].quantity += item.quantity || 0;
      inventory[itemName].entries.push({
        _id: item._id.toString(),
        quantity: item.quantity,
        date: item.date,
        synced: item.synced
      });
    }

    // Create snapshot document
    const snapshot = {
      characterName: character.name,
      characterId: character._id.toString(),
      snapshotDate: new Date(),
      inventory: inventory,
      itemCount: Object.keys(inventory).length,
      totalQuantity: Object.values(inventory).reduce((sum, item) => sum + item.quantity, 0),
      metadata: {
        createdBy: 'snapshot_script',
        version: '1.0'
      }
    };

    // Store snapshot in snapshots collection
    const snapshotsCollection = db.collection('inventory_snapshots');
    const result = await snapshotsCollection.insertOne(snapshot);

    logger.info('SNAPSHOT', `Created snapshot for ${character.name} (${result.insertedId})`);

    return {
      success: true,
      snapshotId: result.insertedId.toString(),
      characterName: character.name,
      snapshotDate: snapshot.snapshotDate,
      itemCount: snapshot.itemCount,
      totalQuantity: snapshot.totalQuantity
    };
  } catch (error) {
    logger.error('SNAPSHOT', `Error creating snapshot for ${characterName}: ${error.message}`);
    throw error;
  }
}

/**
 * Creates snapshots for all characters
 * @returns {Object} - Snapshot results
 */
async function createAllSnapshots() {
  try {
    logger.info('SNAPSHOT', 'Fetching all characters...');
    const characters = await Character.find({ status: 'accepted' }).lean();

    logger.info('SNAPSHOT', `Creating snapshots for ${characters.length} character(s)...`);

    const results = {
      total: characters.length,
      created: 0,
      failed: 0,
      details: []
    };

    for (const character of characters) {
      try {
        const snapshot = await createInventorySnapshot(character.name);
        results.created++;
        results.details.push({
          characterName: character.name,
          status: 'success',
          snapshotId: snapshot.snapshotId,
          itemCount: snapshot.itemCount
        });
      } catch (error) {
        results.failed++;
        results.details.push({
          characterName: character.name,
          status: 'error',
          error: error.message
        });
        logger.error('SNAPSHOT', `Failed to create snapshot for ${character.name}: ${error.message}`);
      }
    }

    return results;
  } catch (error) {
    logger.error('SNAPSHOT', `Error in createAllSnapshots: ${error.message}`);
    throw error;
  }
}

/**
 * Retrieves a snapshot by ID or date
 * @param {string} characterName - Name of the character
 * @param {Date|string} snapshotDate - Date of snapshot to retrieve
 * @returns {Object} - Snapshot data
 */
async function getSnapshot(characterName, snapshotDate) {
  try {
    const escapedName = characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const character = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
    });

    if (!character) {
      throw new Error(`Character "${characterName}" not found`);
    }

    const inventoriesConnection = await DatabaseConnectionManager.connectToInventoriesNative();
    const db = inventoriesConnection.useDb('inventories');
    const snapshotsCollection = db.collection('inventory_snapshots');

    const date = snapshotDate instanceof Date ? snapshotDate : new Date(snapshotDate);

    // Find the most recent snapshot before or at the specified date
    const snapshot = await snapshotsCollection.findOne({
      characterName: character.name,
      snapshotDate: { $lte: date }
    }, {
      sort: { snapshotDate: -1 }
    });

    if (!snapshot) {
      throw new Error(`No snapshot found for ${characterName} before ${date.toISOString()}`);
    }

    return snapshot;
  } catch (error) {
    logger.error('SNAPSHOT', `Error getting snapshot: ${error.message}`);
    throw error;
  }
}

/**
 * Lists all snapshots for a character
 * @param {string} characterName - Name of the character
 * @returns {Array} - List of snapshots
 */
async function listSnapshots(characterName) {
  try {
    const escapedName = characterName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const character = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
    });

    if (!character) {
      throw new Error(`Character "${characterName}" not found`);
    }

    const inventoriesConnection = await DatabaseConnectionManager.connectToInventoriesNative();
    const db = inventoriesConnection.useDb('inventories');
    const snapshotsCollection = db.collection('inventory_snapshots');

    const snapshots = await snapshotsCollection.find({
      characterName: character.name
    }).sort({ snapshotDate: -1 }).toArray();

    return snapshots.map(s => ({
      snapshotId: s._id.toString(),
      snapshotDate: s.snapshotDate,
      itemCount: s.itemCount,
      totalQuantity: s.totalQuantity
    }));
  } catch (error) {
    logger.error('SNAPSHOT', `Error listing snapshots: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// ------------------- CLI Interface -------------------
// ============================================================================

async function main() {
  try {
    const args = process.argv.slice(2);
    const characterName = args[0];
    const auto = args.includes('--auto');
    const list = args.includes('--list');
    const get = args.includes('--get');

    if (args.includes('--help') || args.includes('-h')) {
      console.log(`
Usage: node bot/scripts/createInventorySnapshot.js [characterName] [options]

Options:
  --auto              Create snapshots for all characters (ignores characterName)
  --list              List all snapshots for a character
  --get <date>        Get a specific snapshot by date (ISO format)

Examples:
  node bot/scripts/createInventorySnapshot.js "Beck"
  node bot/scripts/createInventorySnapshot.js --auto
  node bot/scripts/createInventorySnapshot.js "Beck" --list
  node bot/scripts/createInventorySnapshot.js "Beck" --get "2024-01-15T00:00:00Z"
      `);
      process.exit(0);
    }

    logger.info('SNAPSHOT', 'Connecting to database...');
    await DatabaseConnectionManager.initialize();
    logger.info('SNAPSHOT', 'Database connected');

    if (list) {
      if (!characterName) {
        console.error('Error: Character name required for --list');
        process.exit(1);
      }

      console.log(`\nSnapshots for ${characterName}:`);
      const snapshots = await listSnapshots(characterName);
      
      if (snapshots.length === 0) {
        console.log('  No snapshots found');
      } else {
        snapshots.forEach(s => {
          console.log(`  ${s.snapshotDate.toISOString()} - ${s.itemCount} items, ${s.totalQuantity} total quantity (ID: ${s.snapshotId})`);
        });
      }
    } else if (get) {
      const dateIndex = args.indexOf('--get');
      const date = dateIndex !== -1 && args[dateIndex + 1] ? args[dateIndex + 1] : null;
      
      if (!characterName || !date) {
        console.error('Error: Character name and date required for --get');
        process.exit(1);
      }

      const snapshot = await getSnapshot(characterName, date);
      console.log(`\nSnapshot for ${characterName} at ${snapshot.snapshotDate.toISOString()}:`);
      console.log(`  Items: ${snapshot.itemCount}`);
      console.log(`  Total Quantity: ${snapshot.totalQuantity}`);
      console.log(`  Snapshot ID: ${snapshot._id}`);
    } else if (auto) {
      console.log('\n' + '='.repeat(80));
      console.log('CREATING SNAPSHOTS FOR ALL CHARACTERS');
      console.log('='.repeat(80));
      console.log(`Started: ${new Date().toISOString()}\n`);

      const results = await createAllSnapshots();

      console.log('\n' + '='.repeat(80));
      console.log('SNAPSHOT RESULTS');
      console.log('='.repeat(80));
      console.log(`Total Characters: ${results.total}`);
      console.log(`✅ Created: ${results.created}`);
      console.log(`❌ Failed: ${results.failed}`);

      if (results.details.length > 0 && results.details.length <= 20) {
        console.log('\nDetails:');
        results.details.forEach(d => {
          if (d.status === 'success') {
            console.log(`  ✅ ${d.characterName}: ${d.itemCount} items`);
          } else {
            console.log(`  ❌ ${d.characterName}: ${d.error}`);
          }
        });
      }
    } else if (characterName) {
      console.log(`\nCreating snapshot for ${characterName}...`);
      const snapshot = await createInventorySnapshot(characterName);
      
      console.log('\n' + '='.repeat(80));
      console.log('SNAPSHOT CREATED');
      console.log('='.repeat(80));
      console.log(`Character: ${snapshot.characterName}`);
      console.log(`Snapshot ID: ${snapshot.snapshotId}`);
      console.log(`Date: ${snapshot.snapshotDate.toISOString()}`);
      console.log(`Items: ${snapshot.itemCount}`);
      console.log(`Total Quantity: ${snapshot.totalQuantity}`);
    } else {
      console.error('Error: Character name required (or use --auto for all characters)');
      console.log('Use --help for usage information');
      process.exit(1);
    }

    console.log('\n' + '='.repeat(80));
    process.exit(0);
  } catch (error) {
    logger.error('SNAPSHOT', `Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  createInventorySnapshot,
  createAllSnapshots,
  getSnapshot,
  listSnapshots
};
