// ============================================================================
// ------------------- Inventory Recovery Script -------------------
// Purpose: Reconstructs inventory from InventoryLog transaction history
// Usage: node bot/scripts/recoverInventory.js [characterName] [--dry-run] [--before-date]
// 
// This script can:
// 1. Reconstruct a character's inventory from InventoryLog (like Google Sheets did)
// 2. Verify current inventory against expected values from logs
// 3. Restore inventory to a specific point in time
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
const InventoryLog = require('../models/InventoryLogModel');
const logger = require('../utils/logger');

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// ------------------- Main Recovery Functions -------------------
// ============================================================================

/**
 * Reconstructs inventory from InventoryLog for a character
 * @param {string} characterName - Name of the character
 * @param {Date} beforeDate - Optional: reconstruct inventory up to this date
 * @returns {Object} - Reconstructed inventory with item quantities
 */
async function reconstructInventoryFromLogs(characterName, beforeDate = null) {
  try {
    // Find character
    const escapedName = escapeRegExp(characterName);
    const character = await Character.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
    });

    if (!character) {
      throw new Error(`Character "${characterName}" not found`);
    }

    logger.info('RECOVERY', `Reconstructing inventory for ${character.name}...`);

    // Build query for logs
    const logQuery = {
      characterName: character.name,
      ...(beforeDate ? { dateTime: { $lte: beforeDate } } : {})
    };

    // Get all logs for this character, sorted by date
    const logs = await InventoryLog.find(logQuery)
      .sort({ dateTime: 1 }) // Oldest first
      .lean();

    logger.info('RECOVERY', `Found ${logs.length} inventory transactions`);

    // Reconstruct inventory by summing quantities
    const reconstructedInventory = {};
    
    for (const log of logs) {
      const itemName = log.itemName.toLowerCase().trim();
      
      if (!reconstructedInventory[itemName]) {
        reconstructedInventory[itemName] = {
          itemName: log.itemName, // Keep original casing
          quantity: 0,
          firstSeen: log.dateTime,
          lastSeen: log.dateTime
        };
      }
      
      // Add or subtract quantity (removals are negative)
      reconstructedInventory[itemName].quantity += log.quantity;
      reconstructedInventory[itemName].lastSeen = log.dateTime;
      
      // Track if quantity ever went negative (data integrity issue)
      if (reconstructedInventory[itemName].quantity < 0) {
        reconstructedInventory[itemName].wentNegative = true;
        reconstructedInventory[itemName].negativeAt = log.dateTime;
      }
    }

    // Filter out items with zero or negative quantities
    const finalInventory = {};
    for (const [key, value] of Object.entries(reconstructedInventory)) {
      if (value.quantity > 0) {
        finalInventory[key] = value;
      }
    }

    logger.info('RECOVERY', `Reconstructed ${Object.keys(finalInventory).length} items`);
    
    return {
      characterName: character.name,
      characterId: character._id,
      reconstructedAt: beforeDate || new Date(),
      inventory: finalInventory,
      totalItems: Object.keys(finalInventory).length,
      totalQuantity: Object.values(finalInventory).reduce((sum, item) => sum + item.quantity, 0)
    };
  } catch (error) {
    logger.error('RECOVERY', `Error reconstructing inventory: ${error.message}`);
    throw error;
  }
}

/**
 * Gets current inventory from database
 * @param {string} characterName - Name of the character
 * @returns {Object} - Current inventory from database
 */
async function getCurrentInventory(characterName) {
  try {
    const escapedName = escapeRegExp(characterName);
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

    const items = await inventoryCollection.find({
      characterId: character._id
    }).toArray();

    const currentInventory = {};
    for (const item of items) {
      const itemName = item.itemName.toLowerCase().trim();
      if (!currentInventory[itemName]) {
        currentInventory[itemName] = {
          itemName: item.itemName,
          quantity: 0,
          entries: []
        };
      }
      currentInventory[itemName].quantity += item.quantity || 0;
      currentInventory[itemName].entries.push({
        _id: item._id,
        quantity: item.quantity
      });
    }

    return {
      characterName: character.name,
      characterId: character._id,
      inventory: currentInventory,
      totalItems: Object.keys(currentInventory).length,
      totalQuantity: Object.values(currentInventory).reduce((sum, item) => sum + item.quantity, 0)
    };
  } catch (error) {
    logger.error('RECOVERY', `Error getting current inventory: ${error.message}`);
    throw error;
  }
}

/**
 * Compares current inventory with reconstructed inventory
 * @param {string} characterName - Name of the character
 * @param {Date} beforeDate - Optional: compare against inventory at this date
 * @returns {Object} - Comparison results with discrepancies
 */
async function verifyInventory(characterName, beforeDate = null) {
  try {
    logger.info('RECOVERY', `Verifying inventory for ${characterName}...`);

    const current = await getCurrentInventory(characterName);
    const reconstructed = await reconstructInventoryFromLogs(characterName, beforeDate);

    const discrepancies = [];
    const allItemNames = new Set([
      ...Object.keys(current.inventory),
      ...Object.keys(reconstructed.inventory)
    ]);

    for (const itemName of allItemNames) {
      const currentQty = current.inventory[itemName]?.quantity || 0;
      const expectedQty = reconstructed.inventory[itemName]?.quantity || 0;

      if (currentQty !== expectedQty) {
        discrepancies.push({
          itemName: reconstructed.inventory[itemName]?.itemName || current.inventory[itemName]?.itemName || itemName,
          current: currentQty,
          expected: expectedQty,
          difference: currentQty - expectedQty
        });
      }
    }

    return {
      characterName,
      verifiedAt: new Date(),
      current: current,
      expected: reconstructed,
      discrepancies: discrepancies,
      hasDiscrepancies: discrepancies.length > 0,
      summary: {
        totalItemsCurrent: current.totalItems,
        totalItemsExpected: reconstructed.totalItems,
        totalQuantityCurrent: current.totalQuantity,
        totalQuantityExpected: reconstructed.totalQuantity,
        discrepancyCount: discrepancies.length
      }
    };
  } catch (error) {
    logger.error('RECOVERY', `Error verifying inventory: ${error.message}`);
    throw error;
  }
}

/**
 * Restores inventory to match reconstructed values
 * @param {string} characterName - Name of the character
 * @param {Date} beforeDate - Optional: restore to inventory at this date
 * @param {boolean} dryRun - If true, don't actually modify database
 * @returns {Object} - Restoration results
 */
async function restoreInventory(characterName, beforeDate = null, dryRun = false) {
  try {
    logger.info('RECOVERY', `Restoring inventory for ${characterName}${dryRun ? ' (DRY RUN)' : ''}...`);

    const verification = await verifyInventory(characterName, beforeDate);
    
    if (!verification.hasDiscrepancies) {
      logger.info('RECOVERY', 'No discrepancies found. Inventory is correct.');
      return {
        success: true,
        message: 'No restoration needed - inventory matches logs',
        verification
      };
    }

    const character = await Character.findOne({
      name: { $regex: new RegExp(`^${escapeRegExp(characterName)}$`, 'i') }
    });

    if (!character) {
      throw new Error(`Character "${characterName}" not found`);
    }

    const inventoriesConnection = await DatabaseConnectionManager.connectToInventoriesNative();
    const db = inventoriesConnection.useDb('inventories');
    const collectionName = character.name.toLowerCase();
    const inventoryCollection = db.collection(collectionName);

    const changes = [];
    const restored = [];

    // Process each discrepancy
    for (const discrepancy of verification.discrepancies) {
      const itemName = discrepancy.itemName.toLowerCase().trim();
      const expectedQty = discrepancy.expected;
      const currentQty = discrepancy.current;
      const difference = discrepancy.difference;

      if (dryRun) {
        changes.push({
          itemName: discrepancy.itemName,
          action: difference > 0 ? 'DECREASE' : 'INCREASE',
          current: currentQty,
          target: expectedQty,
          change: Math.abs(difference)
        });
        continue;
      }

      // Find existing inventory entries for this item
      const existingEntries = await inventoryCollection.find({
        characterId: character._id,
        itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') }
      }).toArray();

      const totalCurrent = existingEntries.reduce((sum, e) => sum + (e.quantity || 0), 0);

      if (expectedQty === 0) {
        // Remove all entries for this item
        if (existingEntries.length > 0) {
          await inventoryCollection.deleteMany({
            characterId: character._id,
            itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') }
          });
          changes.push({
            itemName: discrepancy.itemName,
            action: 'DELETE',
            removed: totalCurrent
          });
        }
      } else if (totalCurrent === 0) {
        // Item doesn't exist, create it
        await inventoryCollection.insertOne({
          characterId: character._id,
          characterName: character.name,
          itemName: discrepancy.itemName,
          quantity: expectedQty,
          date: new Date(),
          synced: ''
        });
        changes.push({
          itemName: discrepancy.itemName,
          action: 'CREATE',
          added: expectedQty
        });
      } else {
        // Update existing entries
        // Strategy: Update first entry with the full expected quantity, delete others
        if (existingEntries.length > 0) {
          const firstEntry = existingEntries[0];
          await inventoryCollection.updateOne(
            { _id: firstEntry._id },
            { $set: { quantity: expectedQty } }
          );
          
          // Delete other entries if any
          if (existingEntries.length > 1) {
            const otherIds = existingEntries.slice(1).map(e => e._id);
            await inventoryCollection.deleteMany({
              _id: { $in: otherIds }
            });
          }
          
          changes.push({
            itemName: discrepancy.itemName,
            action: 'UPDATE',
            old: totalCurrent,
            new: expectedQty,
            change: expectedQty - totalCurrent
          });
        }
      }

      restored.push(discrepancy.itemName);
    }

    logger.info('RECOVERY', `Restored ${restored.length} items`);

    return {
      success: true,
      dryRun,
      characterName,
      restoredAt: new Date(),
      changes: changes,
      restoredItems: restored,
      verification: verification
    };
  } catch (error) {
    logger.error('RECOVERY', `Error restoring inventory: ${error.message}`);
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
    const dryRun = args.includes('--dry-run');
    const beforeDateIndex = args.indexOf('--before-date');
    const beforeDate = beforeDateIndex !== -1 && args[beforeDateIndex + 1] 
      ? new Date(args[beforeDateIndex + 1])
      : null;

    if (!characterName) {
      console.log(`
Usage: node bot/scripts/recoverInventory.js <characterName> [options]

Options:
  --dry-run              Show what would be changed without modifying database
  --before-date <date>   Reconstruct/restore inventory up to this date (ISO format)

Examples:
  node bot/scripts/recoverInventory.js "Beck" --dry-run
  node bot/scripts/recoverInventory.js "Beck" --before-date "2024-01-15T00:00:00Z"
  node bot/scripts/recoverInventory.js "Beck"
      `);
      process.exit(1);
    }

    logger.info('RECOVERY', 'Connecting to database...');
    await DatabaseConnectionManager.initialize();
    logger.info('RECOVERY', 'Database connected');

    // First, verify inventory
    logger.info('RECOVERY', 'Verifying inventory...');
    const verification = await verifyInventory(characterName, beforeDate);

    console.log('\n' + '='.repeat(80));
    console.log('INVENTORY VERIFICATION REPORT');
    console.log('='.repeat(80));
    console.log(`Character: ${verification.characterName}`);
    console.log(`Verified At: ${verification.verifiedAt.toISOString()}`);
    if (beforeDate) {
      console.log(`Reconstructed To: ${beforeDate.toISOString()}`);
    }
    console.log(`\nCurrent Inventory:`);
    console.log(`  Total Items: ${verification.summary.totalItemsCurrent}`);
    console.log(`  Total Quantity: ${verification.summary.totalQuantityCurrent}`);
    console.log(`\nExpected Inventory (from logs):`);
    console.log(`  Total Items: ${verification.summary.totalItemsExpected}`);
    console.log(`  Total Quantity: ${verification.summary.totalQuantityExpected}`);
    console.log(`\nDiscrepancies: ${verification.summary.discrepancyCount}`);

    if (verification.hasDiscrepancies) {
      console.log('\n📋 DISCREPANCIES FOUND:');
      console.log('-'.repeat(80));
      verification.discrepancies.forEach(d => {
        const sign = d.difference > 0 ? '+' : '';
        console.log(`  ${d.itemName}:`);
        console.log(`    Current: ${d.current}`);
        console.log(`    Expected: ${d.expected}`);
        console.log(`    Difference: ${sign}${d.difference}`);
      });
    } else {
      console.log('\n✅ No discrepancies found! Inventory matches logs.');
    }

    // If there are discrepancies, offer to restore
    if (verification.hasDiscrepancies && !dryRun) {
      console.log('\n' + '='.repeat(80));
      console.log('RESTORING INVENTORY...');
      console.log('='.repeat(80));
      
      const restoreResult = await restoreInventory(characterName, beforeDate, false);
      
      console.log(`\n✅ Restoration complete!`);
      console.log(`Restored ${restoreResult.restoredItems.length} items:`);
      restoreResult.changes.forEach(change => {
        console.log(`  - ${change.itemName}: ${JSON.stringify(change)}`);
      });
    } else if (verification.hasDiscrepancies && dryRun) {
      console.log('\n' + '='.repeat(80));
      console.log('DRY RUN - What would be changed:');
      console.log('='.repeat(80));
      
      const restoreResult = await restoreInventory(characterName, beforeDate, true);
      
      restoreResult.changes.forEach(change => {
        console.log(`  ${change.itemName}: ${JSON.stringify(change)}`);
      });
      console.log('\n⚠️  This was a dry run. No changes were made.');
      console.log('Run without --dry-run to apply changes.');
    }

    console.log('\n' + '='.repeat(80));
    process.exit(0);
  } catch (error) {
    logger.error('RECOVERY', `Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  reconstructInventoryFromLogs,
  getCurrentInventory,
  verifyInventory,
  restoreInventory
};
