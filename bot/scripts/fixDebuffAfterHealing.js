// ============================================================================
// Fix Debuff After Healing Script
// Finds and fixes characters who are healed (ko: false) but still have
// active debuffs that should have been cleared when they were healed.
// ============================================================================

// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const Character = require('../../shared/models/CharacterModel');
const { connectToTinglebot } = require('../../shared/database/db');

// ============================================================================
// ------------------- Main Fix Function -------------------
// ============================================================================

/**
 * Find and fix characters with active debuffs who are not KO'd
 * @param {boolean} dryRun - If true, only report what would be fixed without making changes
 * @returns {Promise<Object>} Summary of fixes
 */
async function fixDebuffAfterHealing(dryRun = true) {
  try {
    console.log('🔍 Connecting to Tinglebot database...');
    await connectToTinglebot();
    console.log('✅ Connected to database\n');

    // Find characters who are not KO'd but have active debuffs
    const query = {
      ko: false,
      'debuff.active': true
    };

    console.log('🔍 Searching for affected characters...');
    const affectedCharacters = await Character.find(query);

    if (affectedCharacters.length === 0) {
      console.log('✅ No affected characters found! All characters are properly fixed.\n');
      return {
        total: 0,
        fixed: 0,
        skipped: 0,
        characters: []
      };
    }

    console.log(`📊 Found ${affectedCharacters.length} character(s) with active debuffs who are not KO'd:\n`);

    const results = {
      total: affectedCharacters.length,
      fixed: 0,
      skipped: 0,
      characters: []
    };

    for (const character of affectedCharacters) {
      const debuffEndDate = character.debuff?.endDate 
        ? new Date(character.debuff.endDate) 
        : null;
      const debuffEndDateStr = debuffEndDate 
        ? debuffEndDate.toISOString() 
        : 'N/A';

      console.log(`  - ${character.name} (${character.userId})`);
      console.log(`    Debuff end date: ${debuffEndDateStr}`);

      if (dryRun) {
        console.log(`    🔍 Would clear debuff (dry run mode)\n`);
        results.skipped++;
      } else {
        // Clear the debuff
        character.debuff.active = false;
        character.debuff.endDate = null;
        await character.save();

        console.log(`    ✅ Debuff cleared\n`);
        results.fixed++;
      }

      results.characters.push({
        name: character.name,
        userId: character.userId,
        debuffEndDate: debuffEndDateStr,
        fixed: !dryRun
      });
    }

    return results;

  } catch (error) {
    console.error('❌ Error during debuff fix:', error);
    throw error;
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      console.log('🔌 Disconnected from database');
    }
  }
}

// ============================================================================
// ------------------- CLI Execution -------------------
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const applyFlag = args.includes('--apply');
  const dryRun = !applyFlag;

  if (dryRun) {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('         FIX DEBUFF AFTER HEALING - DRY RUN MODE              ');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('⚠️  Running in DRY RUN mode. No changes will be made.');
    console.log('   Use --apply flag to actually fix the characters.\n');
  } else {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('              FIX DEBUFF AFTER HEALING - APPLY MODE            ');
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('⚠️  Running in APPLY mode. Changes will be made to the database.\n');
  }

  fixDebuffAfterHealing(dryRun)
    .then(results => {
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('                         SUMMARY                               ');
      console.log('═══════════════════════════════════════════════════════════════\n');
      console.log(`📊 Total Affected Characters: ${results.total}`);
      if (dryRun) {
        console.log(`🔍 Characters That Would Be Fixed: ${results.total}`);
        console.log('\n💡 To apply fixes, run: node scripts/fixDebuffAfterHealing.js --apply');
      } else {
        console.log(`✅ Characters Fixed: ${results.fixed}`);
        console.log(`⏭️  Characters Skipped: ${results.skipped}`);
      }
      console.log('');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Script failed:', error);
      process.exit(1);
    });
}

// ------------------- Export functions -------------------
module.exports = {
  fixDebuffAfterHealing
};

