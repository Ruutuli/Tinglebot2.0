// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const User = require('./shared/models/UserModel');
const { connectToTinglebot } = require('./shared/database/db');
const { validateUserLeveling, calculateTotalXPForLevel, calculateLevelFromXP, generateFixSuggestion } = require('./validateUserLeveling');
const readline = require('readline');

// ------------------- Helper Functions -------------------

/**
 * Create readline interface for user prompts
 */
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

/**
 * Ask user a yes/no question
 */
function askYesNo(rl, question) {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Fix a single user's leveling data
 */
async function fixUserLeveling(user, dryRun = true) {
  const validation = validateUserLeveling(user);
  
  if (validation.valid) {
    return {
      fixed: false,
      message: 'No issues found',
      user: user.discordId
    };
  }
  
  const fixes = generateFixSuggestion(validation);
  
  if (!fixes || fixes.length === 0) {
    return {
      fixed: false,
      message: 'No automated fix available',
      user: user.discordId
    };
  }
  
  const changes = {};
  
  // Apply fixes
  fixes.forEach(fix => {
    switch (fix.field) {
      case 'xp':
        changes['leveling.xp'] = fix.suggestedValue;
        break;
      case 'level':
        changes['leveling.level'] = fix.suggestedValue;
        break;
      case 'lastExchangedLevel':
        changes['leveling.lastExchangedLevel'] = fix.suggestedValue;
        break;
    }
  });
  
  if (dryRun) {
    return {
      fixed: false,
      dryRun: true,
      message: 'Dry run - no changes made',
      user: user.discordId,
      username: user.username,
      changes,
      fixes
    };
  }
  
  // Apply the changes
  await User.findOneAndUpdate(
    { discordId: user.discordId },
    { $set: changes }
  );
  
  return {
    fixed: true,
    message: 'Successfully fixed',
    user: user.discordId,
    username: user.username,
    changes,
    fixes
  };
}

/**
 * Fix all users with leveling issues
 */
async function fixAllUsers(dryRun = true) {
  try {
    await connectToTinglebot();
    
    console.log(`🔧 ${dryRun ? '[DRY RUN]' : '[LIVE]'} Starting leveling fixes...\n`);
    
    const users = await User.find({ 'leveling': { $exists: true } });
    console.log(`📊 Found ${users.length} users with leveling data\n`);
    
    const results = {
      total: users.length,
      checked: 0,
      fixed: 0,
      failed: 0,
      noIssues: 0,
      fixes: []
    };
    
    for (const user of users) {
      results.checked++;
      
      try {
        const result = await fixUserLeveling(user, dryRun);
        
        if (result.fixed || result.dryRun) {
          if (result.changes && Object.keys(result.changes).length > 0) {
            results.fixes.push(result);
            if (result.fixed) {
              results.fixed++;
            }
          } else {
            results.noIssues++;
          }
        } else if (result.message === 'No issues found') {
          results.noIssues++;
        } else {
          results.failed++;
        }
      } catch (error) {
        console.error(`❌ Error fixing user ${user.discordId}:`, error.message);
        results.failed++;
      }
    }
    
    // Print results
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`             ${dryRun ? 'DRY RUN' : 'LIVE FIX'} SUMMARY`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log(`📊 Total Users Checked: ${results.checked}`);
    console.log(`✅ Users Without Issues: ${results.noIssues}`);
    console.log(`🔧 Users ${dryRun ? 'That Would Be' : ''} Fixed: ${results.fixes.length}`);
    console.log(`❌ Users Failed: ${results.failed}\n`);
    
    if (results.fixes.length > 0) {
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`             ${dryRun ? 'PROPOSED' : 'APPLIED'} FIXES`);
      console.log('═══════════════════════════════════════════════════════════════\n');
      
      results.fixes.forEach((fix, index) => {
        console.log(`\n[${index + 1}] User: ${fix.username || 'Unknown'} (${fix.user})`);
        console.log(`    Changes ${dryRun ? 'to be applied' : 'applied'}:`);
        
        Object.entries(fix.changes).forEach(([field, value]) => {
          console.log(`    - ${field}: ${value}`);
        });
        
        if (fix.fixes) {
          console.log(`\n    Reasons:`);
          fix.fixes.forEach((reason, idx) => {
            console.log(`    ${idx + 1}. ${reason.reason}`);
          });
        }
        
        console.log('───────────────────────────────────────────────────────────────');
      });
      
      // Export to JSON
      const fs = require('fs');
      const outputPath = `./scripts/fix-results-${dryRun ? 'dryrun' : 'applied'}.json`;
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\n\n📄 Full fix results exported to: ${outputPath}`);
    }
    
    if (dryRun) {
      console.log('\n\n⚠️  This was a DRY RUN. No changes were made to the database.');
      console.log('To apply these fixes, run: node scripts/fixUserLeveling.js --apply\n');
    } else {
      console.log('\n\n✅ All fixes have been applied!\n');
    }
    
    return results;
    
  } catch (error) {
    console.error('❌ Error during fix process:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

/**
 * Fix a specific user
 */
async function fixSpecificUser(discordId, dryRun = true) {
  try {
    await connectToTinglebot();
    
    const user = await User.findOne({ discordId });
    
    if (!user) {
      console.log(`❌ User with Discord ID ${discordId} not found`);
      return null;
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`${dryRun ? '[DRY RUN]' : '[LIVE]'} Fixing User: ${user.username || 'Unknown'} (${discordId})`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const result = await fixUserLeveling(user, dryRun);
    
    if (result.message === 'No issues found') {
      console.log('✅ No issues found for this user!\n');
      return result;
    }
    
    if (!result.changes || Object.keys(result.changes).length === 0) {
      console.log('⚠️  No automated fix available for this user.\n');
      return result;
    }
    
    console.log(`${dryRun ? 'Proposed' : 'Applied'} Changes:`);
    Object.entries(result.changes).forEach(([field, value]) => {
      console.log(`  - ${field}: ${value}`);
    });
    
    if (result.fixes) {
      console.log(`\nReasons:`);
      result.fixes.forEach((fix, idx) => {
        console.log(`  ${idx + 1}. ${fix.reason}`);
      });
    }
    
    if (dryRun) {
      console.log('\n⚠️  This was a DRY RUN. No changes were made.');
      console.log(`To apply, run: node scripts/fixUserLeveling.js --user ${discordId} --apply\n`);
    } else {
      console.log('\n✅ Fix applied successfully!\n');
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Error during fix process:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

/**
 * Interactive fix mode - ask before fixing each user
 */
async function interactiveFix() {
  try {
    await connectToTinglebot();
    
    const rl = createPrompt();
    
    console.log('🔧 Interactive Fix Mode\n');
    console.log('You will be asked to approve each fix individually.\n');
    
    const users = await User.find({ 'leveling': { $exists: true } });
    console.log(`📊 Found ${users.length} users with leveling data\n`);
    
    const results = {
      total: users.length,
      checked: 0,
      fixed: 0,
      skipped: 0,
      noIssues: 0
    };
    
    for (const user of users) {
      results.checked++;
      
      const validation = validateUserLeveling(user);
      
      if (validation.valid) {
        results.noIssues++;
        continue;
      }
      
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log(`User: ${validation.username || 'Unknown'} (${validation.userId})`);
      console.log(`Level: ${validation.leveling.level}, XP: ${validation.leveling.xp}`);
      
      if (validation.leveling.hasImportedFromMee6) {
        console.log(`Imported from MEE6: Level ${validation.leveling.importedMee6Level}`);
      }
      
      console.log('\nIssues:');
      validation.issues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. [${issue.severity}] ${issue.message}`);
      });
      
      const fixes = generateFixSuggestion(validation);
      if (fixes && fixes.length > 0) {
        console.log('\nProposed Fixes:');
        fixes.forEach((fix, idx) => {
          console.log(`  ${idx + 1}. ${fix.field}: ${fix.currentValue} → ${fix.suggestedValue}`);
          console.log(`     ${fix.reason}`);
        });
        
        const shouldFix = await askYesNo(rl, '\nApply these fixes?');
        
        if (shouldFix) {
          await fixUserLeveling(user, false);
          console.log('✅ Fixed!');
          results.fixed++;
        } else {
          console.log('⏭️  Skipped');
          results.skipped++;
        }
      } else {
        console.log('⚠️  No automated fix available');
        results.skipped++;
      }
    }
    
    rl.close();
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                    INTERACTIVE FIX SUMMARY                    ');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log(`📊 Total Users Checked: ${results.checked}`);
    console.log(`✅ Users Without Issues: ${results.noIssues}`);
    console.log(`🔧 Users Fixed: ${results.fixed}`);
    console.log(`⏭️  Users Skipped: ${results.skipped}\n`);
    
  } catch (error) {
    console.error('❌ Error during interactive fix:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// ------------------- CLI Execution -------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  
  const applyFlag = args.includes('--apply');
  const dryRun = !applyFlag;
  
  if (args.includes('--interactive')) {
    interactiveFix();
  } else if (args.includes('--user')) {
    const userIndex = args.indexOf('--user');
    const discordId = args[userIndex + 1];
    
    if (!discordId) {
      console.error('❌ Please provide a Discord ID: node fixUserLeveling.js --user <discordId> [--apply]');
      process.exit(1);
    }
    
    fixSpecificUser(discordId, dryRun);
  } else {
    fixAllUsers(dryRun);
  }
}

// ------------------- Export functions -------------------
module.exports = {
  fixAllUsers,
  fixSpecificUser,
  fixUserLeveling,
  interactiveFix
};


