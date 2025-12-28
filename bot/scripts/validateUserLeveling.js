// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const User = require('../../models/UserModel');
const { connectToTinglebot } = require('../../database/db');

// ------------------- Helper Functions -------------------

/**
 * Calculate the cumulative XP required to reach a specific level
 * MEE6 uses cumulative XP (sum of all level requirements)
 */
function calculateTotalXPForLevel(targetLevel) {
  if (targetLevel <= 1) return 0;
  
  let totalXP = 0;
  for (let level = 2; level <= targetLevel; level++) {
    totalXP += 5 * Math.pow(level, 2) + 50 * level + 100;
  }
  
  return totalXP;
}

/**
 * Calculate what level a user should be based on their cumulative XP
 */
function calculateLevelFromXP(xp) {
  if (xp <= 0) return 1;
  
  let level = 1;
  let totalXpRequired = 0;
  
  while (true) {
    const nextLevel = level + 1;
    const xpForNextLevel = 5 * Math.pow(nextLevel, 2) + 50 * nextLevel + 100;
    totalXpRequired += xpForNextLevel;
    
    if (xp < totalXpRequired) {
      break;
    }
    
    level++;
  }
  
  return level;
}

/**
 * Validate a single user's leveling data
 */
function validateUserLeveling(user) {
  const issues = [];
  const userId = user.discordId;
  
  if (!user.leveling) {
    return {
      userId,
      valid: true,
      issues: [],
      note: 'No leveling data present'
    };
  }
  
  const { level, xp, hasImportedFromMee6, importedMee6Level, lastExchangedLevel } = user.leveling;
  
  // Check 1: Does the XP match the level?
  const expectedXP = calculateTotalXPForLevel(level);
  const xpDifference = Math.abs(xp - expectedXP);
  const tolerance = 1000; // Allow 1000 XP tolerance for users who gained XP after leveling
  
  if (xpDifference > tolerance) {
    issues.push({
      type: 'LEVEL_XP_MISMATCH',
      current: { level, xp },
      expected: { level, xp: expectedXP },
      severity: 'HIGH',
      message: `User is level ${level} but has ${xp} XP. Should have approximately ${expectedXP} XP for level ${level}`
    });
  }
  
  // Check 2: If imported from MEE6, does the XP match the imported level?
  if (hasImportedFromMee6 && importedMee6Level) {
    const expectedXPForImportedLevel = calculateTotalXPForLevel(importedMee6Level);
    
    // Allow for some XP gained after import (but level should be >= imported level)
    if (level < importedMee6Level) {
      issues.push({
        type: 'IMPORT_LEVEL_REGRESSION',
        current: { level, xp },
        imported: { level: importedMee6Level, expectedXP: expectedXPForImportedLevel },
        severity: 'CRITICAL',
        message: `User imported level ${importedMee6Level} but current level ${level} is lower!`
      });
    }
    
    // Check if XP is suspiciously low for imported level
    if (xp < expectedXPForImportedLevel * 0.9) { // Allow 10% variance
      issues.push({
        type: 'IMPORT_XP_TOO_LOW',
        current: { level, xp },
        imported: { level: importedMee6Level, expectedXP: expectedXPForImportedLevel },
        severity: 'HIGH',
        message: `User imported level ${importedMee6Level} (should have ~${expectedXPForImportedLevel} XP) but has ${xp} XP`
      });
    }
  }
  
  // Check 3: Validate last exchanged level
  if (lastExchangedLevel && lastExchangedLevel > level) {
    issues.push({
      type: 'EXCHANGE_LEVEL_INVALID',
      current: { level, lastExchangedLevel },
      severity: 'MEDIUM',
      message: `Last exchanged level (${lastExchangedLevel}) is greater than current level (${level})`
    });
  }
  
  // Check 4: Validate XP is non-negative
  if (xp < 0) {
    issues.push({
      type: 'NEGATIVE_XP',
      current: { xp },
      severity: 'CRITICAL',
      message: `User has negative XP: ${xp}`
    });
  }
  
  // Check 5: Validate level is at least 1
  if (level < 1) {
    issues.push({
      type: 'INVALID_LEVEL',
      current: { level },
      severity: 'CRITICAL',
      message: `User has invalid level: ${level}`
    });
  }
  
  return {
    userId,
    username: user.username || 'Unknown',
    valid: issues.length === 0,
    issues,
    leveling: {
      level,
      xp,
      hasImportedFromMee6,
      importedMee6Level,
      lastExchangedLevel,
      totalMessages: user.leveling.totalMessages
    }
  };
}

/**
 * Generate a fix suggestion for a user's leveling data
 */
function generateFixSuggestion(validationResult) {
  if (validationResult.valid) {
    return null;
  }
  
  const fixes = [];
  
  validationResult.issues.forEach(issue => {
    switch (issue.type) {
      case 'LEVEL_XP_MISMATCH':
        // Fix XP based on current level, not the other way around
        fixes.push({
          field: 'xp',
          currentValue: issue.current.xp,
          suggestedValue: issue.expected.xp,
          reason: `Recalculate XP for level ${issue.current.level}`
        });
        break;
        
      case 'IMPORT_LEVEL_REGRESSION':
      case 'IMPORT_XP_TOO_LOW':
        // For MEE6 imports, restore to the imported level
        const correctXP = calculateTotalXPForLevel(validationResult.leveling.importedMee6Level);
        fixes.push({
          field: 'level',
          currentValue: issue.current.level,
          suggestedValue: validationResult.leveling.importedMee6Level,
          reason: `Restore to imported MEE6 level ${validationResult.leveling.importedMee6Level}`
        });
        fixes.push({
          field: 'xp',
          currentValue: issue.current.xp,
          suggestedValue: correctXP,
          reason: `Set correct XP for level ${validationResult.leveling.importedMee6Level}`
        });
        break;
        
      case 'EXCHANGE_LEVEL_INVALID':
        fixes.push({
          field: 'lastExchangedLevel',
          currentValue: issue.current.lastExchangedLevel,
          suggestedValue: 0,
          reason: 'Reset last exchanged level to 0'
        });
        break;
        
      case 'NEGATIVE_XP':
        fixes.push({
          field: 'xp',
          currentValue: issue.current.xp,
          suggestedValue: 0,
          reason: 'Reset negative XP to 0'
        });
        fixes.push({
          field: 'level',
          currentValue: validationResult.leveling.level,
          suggestedValue: 1,
          reason: 'Reset level to 1'
        });
        break;
        
      case 'INVALID_LEVEL':
        fixes.push({
          field: 'level',
          currentValue: issue.current.level,
          suggestedValue: 1,
          reason: 'Reset invalid level to 1'
        });
        break;
    }
  });
  
  return fixes;
}

// ------------------- Main Validation Functions -------------------

/**
 * Validate all users in the database
 */
async function validateAllUsers() {
  try {
    await connectToTinglebot();
    
    console.log('🔍 Starting user leveling validation...\n');
    
    const users = await User.find({ 'leveling': { $exists: true } });
    console.log(`📊 Found ${users.length} users with leveling data\n`);
    
    const results = {
      total: users.length,
      valid: 0,
      invalid: 0,
      critical: 0,
      high: 0,
      medium: 0,
      validUsers: [],
      invalidUsers: []
    };
    
    for (const user of users) {
      const validation = validateUserLeveling(user);
      
      if (validation.valid) {
        results.valid++;
        results.validUsers.push(validation);
      } else {
        results.invalid++;
        
        // Count severity levels
        validation.issues.forEach(issue => {
          if (issue.severity === 'CRITICAL') results.critical++;
          if (issue.severity === 'HIGH') results.high++;
          if (issue.severity === 'MEDIUM') results.medium++;
        });
        
        // Generate fix suggestions
        validation.fixes = generateFixSuggestion(validation);
        
        results.invalidUsers.push(validation);
      }
    }
    
    // Print all users
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    ALL USERS REPORT                           ');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    // Sort all users by level (descending)
    const allUsers = [...results.validUsers, ...results.invalidUsers].sort((a, b) => {
      return (b.leveling?.level || 0) - (a.leveling?.level || 0);
    });
    
    console.log('┌────┬──────────────────────┬─────────┬──────────────┬──────────┐');
    console.log('│ #  │ Username             │ Level   │ XP           │ Status   │');
    console.log('├────┼──────────────────────┼─────────┼──────────────┼──────────┤');
    
    allUsers.forEach((user, index) => {
      const username = (user.username || 'Unknown').substring(0, 20).padEnd(20);
      const level = String(user.leveling?.level || 0).padStart(7);
      const xp = String((user.leveling?.xp || 0).toLocaleString()).padStart(12);
      const status = user.valid ? '   ✅    ' : '   ❌    ';
      const num = String(index + 1).padStart(3);
      
      console.log(`│ ${num} │ ${username} │ ${level} │ ${xp} │ ${status} │`);
    });
    
    console.log('└────┴──────────────────────┴─────────┴──────────────┴──────────┘\n');
    
    // Print summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('                    VALIDATION SUMMARY                         ');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log(`✅ Valid Users: ${results.valid}`);
    console.log(`❌ Invalid Users: ${results.invalid}\n`);
    
    if (results.invalid > 0) {
      console.log(`🚨 Issues by Severity:`);
      console.log(`   CRITICAL: ${results.critical}`);
      console.log(`   HIGH: ${results.high}`);
      console.log(`   MEDIUM: ${results.medium}\n`);
      
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('                    INVALID USERS DETAIL                       ');
      console.log('═══════════════════════════════════════════════════════════════\n');
      
      results.invalidUsers.forEach((validation, index) => {
        console.log(`\n[${index + 1}] User: ${validation.username} (${validation.userId})`);
        console.log(`    Current Data: Level ${validation.leveling.level}, XP ${validation.leveling.xp}`);
        if (validation.leveling.hasImportedFromMee6) {
          console.log(`    Imported from MEE6: Level ${validation.leveling.importedMee6Level}`);
        }
        console.log(`\n    Issues Found:`);
        
        validation.issues.forEach((issue, issueIndex) => {
          console.log(`    ${issueIndex + 1}. [${issue.severity}] ${issue.type}`);
          console.log(`       ${issue.message}`);
        });
        
        if (validation.fixes && validation.fixes.length > 0) {
          console.log(`\n    💡 Suggested Fixes:`);
          validation.fixes.forEach((fix, fixIndex) => {
            console.log(`    ${fixIndex + 1}. Update ${fix.field}: ${fix.currentValue} → ${fix.suggestedValue}`);
            console.log(`       Reason: ${fix.reason}`);
          });
        }
        
        console.log('\n───────────────────────────────────────────────────────────────');
      });
      
      // Export to JSON for automated fixing
      const fs = require('fs');
      const outputPath = './scripts/validation-results.json';
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(`\n\n📄 Full validation results exported to: ${outputPath}`);
    }
    
    console.log('\n✅ Validation complete!\n');
    
    return results;
    
  } catch (error) {
    console.error('❌ Error during validation:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

/**
 * Validate a specific user
 */
async function validateSpecificUser(discordId) {
  try {
    await connectToTinglebot();
    
    const user = await User.findOne({ discordId });
    
    if (!user) {
      console.log(`❌ User with Discord ID ${discordId} not found`);
      return null;
    }
    
    const validation = validateUserLeveling(user);
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`User: ${validation.username} (${validation.userId})`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log(`Level: ${validation.leveling.level}`);
    console.log(`XP: ${validation.leveling.xp}`);
    console.log(`Total Messages: ${validation.leveling.totalMessages}`);
    
    if (validation.leveling.hasImportedFromMee6) {
      console.log(`\n📥 MEE6 Import:`);
      console.log(`   Imported Level: ${validation.leveling.importedMee6Level}`);
      console.log(`   Expected XP: ${calculateTotalXPForLevel(validation.leveling.importedMee6Level)}`);
    }
    
    if (validation.valid) {
      console.log(`\n✅ Status: VALID`);
    } else {
      console.log(`\n❌ Status: INVALID`);
      console.log(`\nIssues Found:`);
      
      validation.issues.forEach((issue, index) => {
        console.log(`\n${index + 1}. [${issue.severity}] ${issue.type}`);
        console.log(`   ${issue.message}`);
      });
      
      const fixes = generateFixSuggestion(validation);
      if (fixes && fixes.length > 0) {
        console.log(`\n💡 Suggested Fixes:`);
        fixes.forEach((fix, index) => {
          console.log(`${index + 1}. Update ${fix.field}: ${fix.currentValue} → ${fix.suggestedValue}`);
          console.log(`   Reason: ${fix.reason}`);
        });
      }
    }
    
    console.log('\n');
    return validation;
    
  } catch (error) {
    console.error('❌ Error during validation:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

// ------------------- CLI Execution -------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length > 0 && args[0] === '--user') {
    const discordId = args[1];
    if (!discordId) {
      console.error('❌ Please provide a Discord ID: node validateUserLeveling.js --user <discordId>');
      process.exit(1);
    }
    validateSpecificUser(discordId);
  } else {
    validateAllUsers();
  }
}

// ------------------- Export functions -------------------
module.exports = {
  validateAllUsers,
  validateSpecificUser,
  validateUserLeveling,
  calculateTotalXPForLevel,
  calculateLevelFromXP,
  generateFixSuggestion
};

