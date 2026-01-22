// ============================================================================
// ------------------- Inventory Integrity Verification Script -------------------
// Purpose: Checks all characters' inventories against InventoryLog to detect bugs
// Usage: node bot/scripts/verifyInventoryIntegrity.js [--fix] [--character-name]
// 
// This script:
// 1. Verifies all characters' inventories match their transaction logs
// 2. Reports any discrepancies (like the bird eggs bug)
// 3. Optionally fixes discrepancies automatically
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
const { verifyInventory, restoreInventory } = require('./recoverInventory');

// ============================================================================
// ------------------- Main Verification Functions -------------------
// ============================================================================

/**
 * Verifies all characters' inventories
 * @param {string} specificCharacter - Optional: only verify this character
 * @returns {Object} - Verification results for all characters
 */
async function verifyAllInventories(specificCharacter = null) {
  try {
    logger.info('VERIFY', 'Fetching all characters...');
    
    let characters;
    if (specificCharacter) {
      const escapedName = specificCharacter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      characters = await Character.find({
        name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
      }).lean();
    } else {
      characters = await Character.find({ status: 'accepted' }).lean();
    }

    logger.info('VERIFY', `Verifying ${characters.length} character(s)...`);

    const results = {
      total: characters.length,
      verified: 0,
      withDiscrepancies: 0,
      withoutLogs: 0,
      errors: 0,
      characters: []
    };

    for (const character of characters) {
      try {
        // Check if character has any logs
        const logCount = await InventoryLog.countDocuments({
          characterName: character.name
        });

        if (logCount === 0) {
          results.withoutLogs++;
          results.characters.push({
            name: character.name,
            status: 'no_logs',
            message: 'No inventory logs found'
          });
          continue;
        }

        // Verify inventory
        const verification = await verifyInventory(character.name);
        results.verified++;

        if (verification.hasDiscrepancies) {
          results.withDiscrepancies++;
          results.characters.push({
            name: character.name,
            status: 'discrepancies',
            discrepancyCount: verification.discrepancies.length,
            discrepancies: verification.discrepancies.map(d => ({
              itemName: d.itemName,
              current: d.current,
              expected: d.expected,
              difference: d.difference
            })),
            summary: verification.summary
          });
        } else {
          results.characters.push({
            name: character.name,
            status: 'ok',
            summary: verification.summary
          });
        }
      } catch (error) {
        results.errors++;
        results.characters.push({
          name: character.name,
          status: 'error',
          error: error.message
        });
        logger.error('VERIFY', `Error verifying ${character.name}: ${error.message}`);
      }
    }

    return results;
  } catch (error) {
    logger.error('VERIFY', `Error in verifyAllInventories: ${error.message}`);
    throw error;
  }
}

/**
 * Fixes discrepancies for characters with issues
 * @param {Object} verificationResults - Results from verifyAllInventories
 * @param {boolean} dryRun - If true, don't actually fix
 * @returns {Object} - Fix results
 */
async function fixDiscrepancies(verificationResults, dryRun = false) {
  const fixResults = {
    attempted: 0,
    fixed: 0,
    failed: 0,
    details: []
  };

  const charactersWithIssues = verificationResults.characters.filter(
    c => c.status === 'discrepancies'
  );

  logger.info('FIX', `Found ${charactersWithIssues.length} character(s) with discrepancies`);

  for (const charResult of charactersWithIssues) {
    try {
      fixResults.attempted++;
      logger.info('FIX', `Fixing ${charResult.name}...`);

      const restoreResult = await restoreInventory(charResult.name, null, dryRun);

      if (restoreResult.success) {
        fixResults.fixed++;
        fixResults.details.push({
          characterName: charResult.name,
          status: 'fixed',
          itemsRestored: restoreResult.restoredItems.length,
          changes: restoreResult.changes
        });
      } else {
        fixResults.failed++;
        fixResults.details.push({
          characterName: charResult.name,
          status: 'failed',
          error: 'Restoration returned success=false'
        });
      }
    } catch (error) {
      fixResults.failed++;
      fixResults.details.push({
        characterName: charResult.name,
        status: 'error',
        error: error.message
      });
      logger.error('FIX', `Error fixing ${charResult.name}: ${error.message}`);
    }
  }

  return fixResults;
}

// ============================================================================
// ------------------- CLI Interface -------------------
// ============================================================================

async function main() {
  try {
    const args = process.argv.slice(2);
    const fix = args.includes('--fix');
    const dryRun = args.includes('--dry-run');
    const characterNameIndex = args.indexOf('--character-name');
    const characterName = characterNameIndex !== -1 && args[characterNameIndex + 1]
      ? args[characterNameIndex + 1]
      : null;

    if (args.includes('--help') || args.includes('-h')) {
      console.log(`
Usage: node bot/scripts/verifyInventoryIntegrity.js [options]

Options:
  --fix                  Automatically fix discrepancies found
  --dry-run              Show what would be fixed without modifying database (requires --fix)
  --character-name <name>  Only verify/fix this specific character

Examples:
  node bot/scripts/verifyInventoryIntegrity.js
  node bot/scripts/verifyInventoryIntegrity.js --character-name "Beck"
  node bot/scripts/verifyInventoryIntegrity.js --fix --dry-run
  node bot/scripts/verifyInventoryIntegrity.js --fix
      `);
      process.exit(0);
    }

    logger.info('VERIFY', 'Connecting to database...');
    await DatabaseConnectionManager.initialize();
    logger.info('VERIFY', 'Database connected');

    console.log('\n' + '='.repeat(80));
    console.log('INVENTORY INTEGRITY VERIFICATION');
    console.log('='.repeat(80));
    if (characterName) {
      console.log(`Checking: ${characterName}`);
    } else {
      console.log('Checking: All characters');
    }
    console.log(`Started: ${new Date().toISOString()}\n`);

    // Verify all inventories
    const results = await verifyAllInventories(characterName);

    // Print summary
    console.log('\n' + '='.repeat(80));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`Total Characters: ${results.total}`);
    console.log(`Verified: ${results.verified}`);
    console.log(`✅ No Issues: ${results.verified - results.withDiscrepancies}`);
    console.log(`⚠️  With Discrepancies: ${results.withDiscrepancies}`);
    console.log(`❌ Errors: ${results.errors}`);
    console.log(`📝 No Logs: ${results.withoutLogs}`);

    // Print detailed results
    if (results.withDiscrepancies > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('CHARACTERS WITH DISCREPANCIES');
      console.log('='.repeat(80));
      
      for (const char of results.characters) {
        if (char.status === 'discrepancies') {
          console.log(`\n${char.name}:`);
          console.log(`  Discrepancies: ${char.discrepancyCount}`);
          console.log(`  Current Items: ${char.summary.totalItemsCurrent}`);
          console.log(`  Expected Items: ${char.summary.totalItemsExpected}`);
          console.log(`  Current Quantity: ${char.summary.totalQuantityCurrent}`);
          console.log(`  Expected Quantity: ${char.summary.totalQuantityExpected}`);
          
          if (char.discrepancies.length <= 10) {
            console.log(`  Items with issues:`);
            char.discrepancies.forEach(d => {
              const sign = d.difference > 0 ? '+' : '';
              console.log(`    - ${d.itemName}: ${d.current} (expected ${d.expected}, diff: ${sign}${d.difference})`);
            });
          } else {
            console.log(`  Items with issues: ${char.discrepancies.length} (showing first 10)`);
            char.discrepancies.slice(0, 10).forEach(d => {
              const sign = d.difference > 0 ? '+' : '';
              console.log(`    - ${d.itemName}: ${d.current} (expected ${d.expected}, diff: ${sign}${d.difference})`);
            });
          }
        }
      }
    }

    // Print characters with errors
    if (results.errors > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('CHARACTERS WITH ERRORS');
      console.log('='.repeat(80));
      for (const char of results.characters) {
        if (char.status === 'error') {
          console.log(`  ${char.name}: ${char.error}`);
        }
      }
    }

    // Fix if requested
    if (fix && results.withDiscrepancies > 0) {
      console.log('\n' + '='.repeat(80));
      if (dryRun) {
        console.log('DRY RUN - FIXING DISCREPANCIES (no changes will be made)');
      } else {
        console.log('FIXING DISCREPANCIES');
      }
      console.log('='.repeat(80));

      const fixResults = await fixDiscrepancies(results, dryRun);

      console.log(`\nFix Results:`);
      console.log(`  Attempted: ${fixResults.attempted}`);
      console.log(`  Fixed: ${fixResults.fixed}`);
      console.log(`  Failed: ${fixResults.failed}`);

      if (fixResults.details.length > 0) {
        console.log(`\nDetails:`);
        fixResults.details.forEach(detail => {
          console.log(`  ${detail.characterName}: ${detail.status}`);
          if (detail.itemsRestored) {
            console.log(`    Items restored: ${detail.itemsRestored}`);
          }
          if (detail.error) {
            console.log(`    Error: ${detail.error}`);
          }
        });
      }

      if (dryRun) {
        console.log('\n⚠️  This was a dry run. No changes were made.');
        console.log('Run with --fix (without --dry-run) to apply changes.');
      }
    } else if (results.withDiscrepancies > 0) {
      console.log('\n💡 Tip: Run with --fix to automatically fix discrepancies');
      console.log('   Or use recoverInventory.js for a specific character');
    }

    console.log('\n' + '='.repeat(80));
    console.log(`Completed: ${new Date().toISOString()}`);
    console.log('='.repeat(80) + '\n');

    process.exit(0);
  } catch (error) {
    logger.error('VERIFY', `Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  verifyAllInventories,
  fixDiscrepancies
};
