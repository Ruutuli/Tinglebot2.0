// ============================================================================
// ------------------- fixHelpWantedCompletions.js -------------------
// Script to fix Help Wanted quest completion tracking issues where
// totalCompletions doesn't match the actual completions array length
// Usage: node bot/scripts/fixHelpWantedCompletions.js [--dry-run] [--user=USER_ID]
// ============================================================================

const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');

const { connectToTinglebot } = require('@app/shared/database/db');
const User = require('@app/shared/models/UserModel');

const ARG_DRY_RUN = process.argv.includes('--dry-run');
const ARG_USER = (() => {
  const userArg = process.argv.find(arg => arg.startsWith('--user='));
  if (!userArg) return null;
  return userArg.split('=')[1];
})();
const ARG_FIX_EXCHANGES = process.argv.includes('--fix-exchanges');

// ------------------- Helper Functions -------------------
function analyzeUserHelpWanted(user) {
  const helpWanted = user.helpWanted || {};
  const completions = helpWanted.completions || [];
  const totalCompletions = helpWanted.totalCompletions;
  const currentCompletions = helpWanted.currentCompletions || 0;
  const lastExchangeAmount = helpWanted.lastExchangeAmount;
  const lastExchangeAt = helpWanted.lastExchangeAt;
  
  // Count actual completions in the array
  const actualCompletions = completions.length;
  
  // Calculate how many were exchanged (if currentCompletions < actualCompletions)
  // BUT: Only count as exchanged if actualCompletions >= 50 (minimum for exchange)
  // If actualCompletions < 50, they couldn't have exchanged, so currentCompletions should match actualCompletions
  const exchangedAmount = (actualCompletions >= 50 && actualCompletions > currentCompletions) 
    ? (actualCompletions - currentCompletions) 
    : 0;
  
  // Special case: if currentCompletions equals actualCompletions and is a multiple of 50,
  // and lastExchangeAmount is 0, it might indicate an exchange happened but wasn't recorded properly
  // This can happen if the exchange command ran before the tracking fields were added
  // BUT: Only consider this if actualCompletions >= 50 (minimum for exchange)
  const possibleExchangeNotRecorded = (exchangedAmount === 0 && 
                                       actualCompletions >= 50 &&
                                       currentCompletions === actualCompletions && 
                                       currentCompletions > 0 && 
                                       currentCompletions % 50 === 0 &&
                                       (lastExchangeAmount === undefined || lastExchangeAmount === null || lastExchangeAmount === 0));
  
  const issues = [];
  
  // Check if totalCompletions is missing or incorrect
  if (totalCompletions === undefined || totalCompletions === null) {
    issues.push({
      type: 'totalCompletions_missing'
    });
  } else if (totalCompletions !== actualCompletions) {
    issues.push({
      type: 'totalCompletions_mismatch',
      expected: actualCompletions,
      actual: totalCompletions,
      difference: actualCompletions - totalCompletions
    });
  }
  
  // Check if currentCompletions is missing
  if (currentCompletions === undefined || currentCompletions === null) {
    issues.push({
      type: 'currentCompletions_missing'
    });
  }
  
  // Check if currentCompletions matches expected (but only if no exchange happened)
  // If exchangedAmount > 0, then currentCompletions should be less than actualCompletions
  if (exchangedAmount === 0 && currentCompletions !== actualCompletions) {
    issues.push({
      type: 'currentCompletions_mismatch',
      expected: actualCompletions,
      actual: currentCompletions,
      difference: actualCompletions - currentCompletions
    });
  }
  
  // Check if an exchange happened but wasn't tracked (currentCompletions < actualCompletions)
  // BUT: Only flag as exchange if actualCompletions >= 50 (minimum for exchange)
  if (exchangedAmount > 0 && actualCompletions >= 50 && (lastExchangeAmount === undefined || lastExchangeAmount === null || lastExchangeAmount === 0)) {
    issues.push({
      type: 'exchange_not_tracked',
      exchangedAmount: exchangedAmount,
      currentLastExchangeAmount: lastExchangeAmount
    });
  }
  
  // If actualCompletions < 50 but lastExchangeAmount > 0, this is incorrect - clear it
  if (actualCompletions < 50 && lastExchangeAmount > 0) {
    issues.push({
      type: 'incorrect_exchange_tracking',
      actualCompletions: actualCompletions,
      lastExchangeAmount: lastExchangeAmount
    });
  }
  
  // Check for possible exchange that wasn't recorded (totalCompletions == actualCompletions but should be 0)
  // Only flag this if --fix-exchanges flag is set, as it requires manual confirmation
  if (ARG_FIX_EXCHANGES && possibleExchangeNotRecorded) {
    issues.push({
      type: 'possible_exchange_not_recorded',
      exchangedAmount: totalCompletions, // Assume all completions were exchanged
      currentTotalCompletions: totalCompletions
    });
  }
  
  // Check if lastExchangeAmount is missing (and no exchange happened)
  if (exchangedAmount === 0 && (lastExchangeAmount === undefined || lastExchangeAmount === null)) {
    issues.push({
      type: 'lastExchangeAmount_missing'
    });
  }
  
  // Check if lastExchangeAt is missing
  if (lastExchangeAt === undefined) {
    issues.push({
      type: 'lastExchangeAt_missing'
    });
  }
  
  return {
    totalCompletions,
    currentCompletions,
    actualCompletions,
    exchangedAmount,
    lastExchangeAmount,
    lastExchangeAt,
    completionsCount: completions.length,
    issues,
    needsFix: issues.length > 0
  };
}

// ------------------- Fix User Help Wanted Tracking -------------------
async function fixUserHelpWanted(user, analysis) {
  const helpWanted = user.helpWanted || {};
  let fixed = false;
  const fixes = [];
  
  // Initialize helpWanted object if it doesn't exist
  if (!user.helpWanted) {
    user.helpWanted = {
      lastCompletion: null,
      cooldownUntil: null,
      totalCompletions: 0,
      currentCompletions: 0,
      lastExchangeAmount: 0,
      lastExchangeAt: null,
      completions: []
    };
    fixes.push('Initialized helpWanted object');
    fixed = true;
  }
  
  // Fix 0: Handle migration from old field names
  // Migrate totalLifetimeCompletions to totalCompletions
  if (helpWanted.totalLifetimeCompletions !== undefined && helpWanted.totalCompletions === undefined) {
    helpWanted.totalCompletions = helpWanted.totalLifetimeCompletions;
    delete helpWanted.totalLifetimeCompletions;
    fixes.push(`Migrated totalLifetimeCompletions to totalCompletions: ${helpWanted.totalCompletions}`);
    fixed = true;
  }
  
  // Migrate availableCompletions to currentCompletions if it exists
  if (helpWanted.availableCompletions !== undefined && helpWanted.currentCompletions === undefined) {
    helpWanted.currentCompletions = helpWanted.availableCompletions;
    delete helpWanted.availableCompletions;
    fixes.push(`Migrated availableCompletions to currentCompletions: ${helpWanted.currentCompletions}`);
    fixed = true;
  }
  
  // Special case: If old totalCompletions exists but currentCompletions doesn't, migrate it
  // This handles users who had the old system where totalCompletions was used for both
  // OR users who have totalCompletions but need currentCompletions set
  if (helpWanted.totalCompletions !== undefined && helpWanted.currentCompletions === undefined) {
    // Check if they exchanged (lastExchangeAmount > 0 means they exchanged)
    if (helpWanted.lastExchangeAmount > 0 && helpWanted.lastExchangeAmount > 0) {
      // They exchanged, so currentCompletions should be totalCompletions - lastExchangeAmount
      helpWanted.currentCompletions = Math.max(0, helpWanted.totalCompletions - helpWanted.lastExchangeAmount);
      fixes.push(`Migrated: Set currentCompletions to ${helpWanted.currentCompletions} (totalCompletions: ${helpWanted.totalCompletions} - lastExchangeAmount: ${helpWanted.lastExchangeAmount})`);
    } else {
      // No exchange, so currentCompletions should equal totalCompletions
      helpWanted.currentCompletions = helpWanted.totalCompletions;
      fixes.push(`Migrated: Set currentCompletions to ${helpWanted.currentCompletions} (same as totalCompletions, no exchange)`);
    }
    fixed = true;
  }
  
  // Also handle case where totalCompletions exists and matches actualCompletions but currentCompletions is wrong
  // This happens when totalCompletions was set correctly but currentCompletions wasn't updated after exchange
  if (helpWanted.totalCompletions !== undefined && 
      helpWanted.totalCompletions === analysis.actualCompletions && 
      helpWanted.currentCompletions !== undefined &&
      helpWanted.lastExchangeAmount > 0) {
    // They have totalCompletions matching actual, but they exchanged
    // So currentCompletions should be 0 (or totalCompletions - lastExchangeAmount)
    const expectedCurrent = Math.max(0, helpWanted.totalCompletions - helpWanted.lastExchangeAmount);
    if (helpWanted.currentCompletions !== expectedCurrent) {
      const oldCurrent = helpWanted.currentCompletions;
      helpWanted.currentCompletions = expectedCurrent;
      fixes.push(`Fixed: Updated currentCompletions from ${oldCurrent} to ${expectedCurrent} (accounting for exchange)`);
      fixed = true;
    }
  }
  
  // Fix 0b: Initialize or fix totalCompletions (lifetime total)
  if (analysis.issues.some(i => i.type === 'totalCompletions_missing')) {
    helpWanted.totalCompletions = analysis.actualCompletions;
    fixes.push(`Initialized totalCompletions to ${analysis.actualCompletions}`);
    fixed = true;
  } else if (analysis.issues.some(i => i.type === 'totalCompletions_mismatch')) {
    const mismatch = analysis.issues.find(i => i.type === 'totalCompletions_mismatch');
    const oldTotal = helpWanted.totalCompletions || 0;
    helpWanted.totalCompletions = analysis.actualCompletions;
    fixes.push(`Updated totalCompletions from ${oldTotal} to ${analysis.actualCompletions}`);
    fixed = true;
  }
  
  // Fix 1: Initialize or fix currentCompletions (available for exchange)
  if (analysis.issues.some(i => i.type === 'currentCompletions_missing')) {
    // If there was an exchange, current should be less than total
    if (analysis.exchangedAmount > 0) {
      helpWanted.currentCompletions = analysis.actualCompletions - analysis.exchangedAmount;
      fixes.push(`Initialized currentCompletions to ${helpWanted.currentCompletions} (after exchange)`);
    } else {
      helpWanted.currentCompletions = analysis.actualCompletions;
      fixes.push(`Initialized currentCompletions to ${analysis.actualCompletions}`);
    }
    fixed = true;
  } else if (analysis.issues.some(i => i.type === 'currentCompletions_mismatch')) {
    const mismatch = analysis.issues.find(i => i.type === 'currentCompletions_mismatch');
    const oldCurrent = helpWanted.currentCompletions || 0;
    helpWanted.currentCompletions = analysis.actualCompletions;
    fixes.push(`Updated currentCompletions from ${oldCurrent} to ${analysis.actualCompletions}`);
    fixed = true;
  }
  
  // Fix 2: Track exchange that happened but wasn't recorded (currentCompletions < actualCompletions AND actualCompletions >= 50)
  if (analysis.issues.some(i => i.type === 'exchange_not_tracked')) {
    const exchangeIssue = analysis.issues.find(i => i.type === 'exchange_not_tracked');
    const exchangedAmount = exchangeIssue.exchangedAmount;
    
    // Only process if actualCompletions >= 50 (minimum for exchange)
    if (analysis.actualCompletions >= 50) {
      // Set currentCompletions to the correct value (actual - exchanged)
      const oldCurrent = helpWanted.currentCompletions || 0;
      helpWanted.currentCompletions = analysis.actualCompletions - exchangedAmount;
      
      // Set lastExchangeAmount to the amount that was exchanged
      helpWanted.lastExchangeAmount = exchangedAmount;
      
      // Try to determine when the exchange happened
      const exchangeTimestamp = getExchangeTimestamp(helpWanted);
      helpWanted.lastExchangeAt = exchangeTimestamp;
      
      fixes.push(`Tracked exchange: ${exchangedAmount} completions exchanged, currentCompletions: ${oldCurrent} → ${helpWanted.currentCompletions}${exchangeTimestamp ? ` (estimated date: ${exchangeTimestamp.toISOString().split('T')[0]})` : ' (date unknown)'}`);
      fixed = true;
    }
  }
  
  // Fix 2b: Handle possible exchange that wasn't recorded (currentCompletions == actualCompletions but should be 0)
  // Only if actualCompletions >= 50 (minimum for exchange)
  if (analysis.issues.some(i => i.type === 'possible_exchange_not_recorded') && analysis.actualCompletions >= 50) {
    const exchangeIssue = analysis.issues.find(i => i.type === 'possible_exchange_not_recorded');
    const exchangedAmount = exchangeIssue.exchangedAmount;
    
    // Set currentCompletions to 0 (assuming all were exchanged)
    const oldCurrent = helpWanted.currentCompletions;
    helpWanted.currentCompletions = 0;
    
    // Set lastExchangeAmount to the amount that was exchanged
    helpWanted.lastExchangeAmount = exchangedAmount;
    
    // Try to determine when the exchange happened
    const exchangeTimestamp = getExchangeTimestamp(helpWanted);
    helpWanted.lastExchangeAt = exchangeTimestamp;
    
    fixes.push(`Fixed possible exchange: Set currentCompletions from ${oldCurrent} to 0, tracked ${exchangedAmount} completions exchanged${exchangeTimestamp ? ` (estimated date: ${exchangeTimestamp.toISOString().split('T')[0]})` : ' (date unknown)'}`);
    fixed = true;
  }
  
  // Fix 2c: Clear incorrect exchange tracking for users with < 50 completions
  if (analysis.issues.some(i => i.type === 'incorrect_exchange_tracking')) {
    const issue = analysis.issues.find(i => i.type === 'incorrect_exchange_tracking');
    const oldExchangeAmount = helpWanted.lastExchangeAmount;
    const oldExchangeAt = helpWanted.lastExchangeAt;
    helpWanted.lastExchangeAmount = 0;
    helpWanted.lastExchangeAt = null;
    fixes.push(`Cleared incorrect exchange tracking: lastExchangeAmount ${oldExchangeAmount} → 0, lastExchangeAt cleared (${issue.actualCompletions} < 50, cannot exchange)`);
    fixed = true;
  }
  
  // Fix 2d: If actualCompletions < 50 and currentCompletions doesn't match, fix it (no exchange possible)
  // This handles cases where the script incorrectly thought there was an exchange
  if (analysis.actualCompletions < 50 && (helpWanted.currentCompletions || 0) !== analysis.actualCompletions) {
    const oldCurrent = helpWanted.currentCompletions || 0;
    helpWanted.currentCompletions = analysis.actualCompletions;
    // Clear any incorrect exchange tracking
    if (helpWanted.lastExchangeAmount > 0 && helpWanted.lastExchangeAmount < 50) {
      helpWanted.lastExchangeAmount = 0;
      helpWanted.lastExchangeAt = null;
      fixes.push(`Fixed: Set currentCompletions from ${oldCurrent} to ${analysis.actualCompletions} and cleared incorrect exchange tracking (${analysis.actualCompletions} < 50, cannot exchange)`);
    } else {
      fixes.push(`Fixed: Set currentCompletions from ${oldCurrent} to ${analysis.actualCompletions} (${analysis.actualCompletions} < 50, no exchange possible)`);
    }
    fixed = true;
  }
  
  
  // Fix 3: Initialize lastExchangeAmount if missing (and no exchange happened)
  if (analysis.issues.some(i => i.type === 'lastExchangeAmount_missing')) {
    if (helpWanted.lastExchangeAmount === undefined || helpWanted.lastExchangeAmount === null) {
      helpWanted.lastExchangeAmount = 0;
      fixes.push('Initialized lastExchangeAmount to 0');
      fixed = true;
    }
  }
  
  // Fix 4: Initialize lastExchangeAt if missing
  if (analysis.issues.some(i => i.type === 'lastExchangeAt_missing')) {
    if (helpWanted.lastExchangeAt === undefined) {
      helpWanted.lastExchangeAt = null;
      fixes.push('Initialized lastExchangeAt to null');
      fixed = true;
    }
  }
  
  return { fixed, fixes };
}

// ------------------- Helper: Get Exchange Timestamp -------------------
function getExchangeTimestamp(helpWanted) {
  let exchangeTimestamp = null;
  if (helpWanted.lastCompletion) {
    // Try to parse the lastCompletion date (YYYY-MM-DD format)
    try {
      const lastCompletionDate = new Date(helpWanted.lastCompletion + 'T12:00:00Z');
      if (!isNaN(lastCompletionDate.getTime())) {
        exchangeTimestamp = lastCompletionDate;
      }
    } catch (e) {
      // If parsing fails, try to find the last completion with a timestamp
      const completions = helpWanted.completions || [];
      const lastCompletionWithTimestamp = completions
        .filter(c => c.timestamp)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      if (lastCompletionWithTimestamp) {
        exchangeTimestamp = new Date(lastCompletionWithTimestamp.timestamp);
      }
    }
  } else {
    // Find the last completion with a timestamp
    const completions = helpWanted.completions || [];
    const lastCompletionWithTimestamp = completions
      .filter(c => c.timestamp)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    if (lastCompletionWithTimestamp) {
      exchangeTimestamp = new Date(lastCompletionWithTimestamp.timestamp);
    }
  }
  return exchangeTimestamp;
}

// ------------------- Main Fix Logic -------------------
async function fixHelpWantedCompletions() {
  console.log('='.repeat(80));
  console.log('🔧 Fix Help Wanted Completions');
  console.log(`🔧 Dry run: ${ARG_DRY_RUN ? 'YES' : 'NO'}`);
  console.log(`🔧 Fix exchanges: ${ARG_FIX_EXCHANGES ? 'YES' : 'NO'}`);
  if (ARG_USER) {
    console.log(`👤 User filter: ${ARG_USER}`);
  }
  console.log('='.repeat(80));
  console.log('');
  
  const stats = {
    usersAnalyzed: 0,
    usersWithIssues: 0,
    usersFixed: 0,
    totalCompletionsFixed: 0,
    errors: 0
  };
  
  // Build query
  const query = {};
  if (ARG_USER) {
    query.discordId = ARG_USER;
  }
  
  // Find users with helpWanted data
  const users = await User.find({
    ...query,
    $or: [
      { 'helpWanted.completions': { $exists: true } },
      { 'helpWanted.totalCompletions': { $exists: true } }
    ]
  });
  
  console.log(`📊 Found ${users.length} users with Help Wanted data to analyze\n`);
  
  for (const user of users) {
    stats.usersAnalyzed++;
    
    try {
      const analysis = analyzeUserHelpWanted(user);
      
      // If filtering by specific user, always show them even if no issues
      const shouldShow = ARG_USER || analysis.needsFix;
      
      if (!analysis.needsFix) {
        if (shouldShow) {
          console.log(`\n👤 User: ${user.discordId} (${user.username || 'N/A'})`);
          console.log(`   ✅ No issues found - data is correct:`);
          console.log(`   • totalCompletions (lifetime): ${analysis.totalCompletions !== undefined ? analysis.totalCompletions : 'MISSING'}`);
          console.log(`   • currentCompletions (for exchange): ${analysis.currentCompletions}`);
          console.log(`   • actualCompletions (array length): ${analysis.actualCompletions}`);
          if (analysis.exchangedAmount > 0) {
            console.log(`   • exchangedAmount (detected): ${analysis.exchangedAmount}`);
          }
          console.log(`   • lastExchangeAmount: ${analysis.lastExchangeAmount !== undefined ? analysis.lastExchangeAmount : 'MISSING'}`);
          console.log(`   • lastExchangeAt: ${analysis.lastExchangeAt !== undefined ? (analysis.lastExchangeAt ? new Date(analysis.lastExchangeAt).toISOString().split('T')[0] : 'null') : 'MISSING'}`);
        }
        continue;
      }
      
      stats.usersWithIssues++;
      
      console.log(`\n👤 User: ${user.discordId} (${user.username || 'N/A'})`);
      console.log(`   Current state:`);
      console.log(`   • totalCompletions (lifetime): ${analysis.totalCompletions !== undefined ? analysis.totalCompletions : 'MISSING'}`);
      console.log(`   • currentCompletions (for exchange): ${analysis.currentCompletions}`);
      console.log(`   • actualCompletions (array length): ${analysis.actualCompletions}`);
      if (analysis.exchangedAmount > 0) {
        console.log(`   • exchangedAmount (detected): ${analysis.exchangedAmount}`);
      }
      console.log(`   • lastExchangeAmount: ${analysis.lastExchangeAmount !== undefined ? analysis.lastExchangeAmount : 'MISSING'}`);
      console.log(`   • lastExchangeAt: ${analysis.lastExchangeAt !== undefined ? (analysis.lastExchangeAt ? new Date(analysis.lastExchangeAt).toISOString().split('T')[0] : 'null') : 'MISSING'}`);
      
      if (analysis.issues.length > 0) {
        console.log(`   Issues found:`);
        analysis.issues.forEach(issue => {
          if (issue.type === 'totalCompletions_missing') {
            console.log(`   • totalCompletions (lifetime) is missing`);
          } else if (issue.type === 'totalCompletions_mismatch') {
            console.log(`   • totalCompletions (lifetime) mismatch: expected ${issue.expected}, got ${issue.actual} (diff: ${issue.difference})`);
          } else if (issue.type === 'currentCompletions_missing') {
            console.log(`   • currentCompletions (for exchange) is missing`);
          } else if (issue.type === 'currentCompletions_mismatch') {
            console.log(`   • currentCompletions (for exchange) mismatch: expected ${issue.expected}, got ${issue.actual} (diff: ${issue.difference})`);
          } else if (issue.type === 'exchange_not_tracked') {
            console.log(`   • Exchange not tracked: ${issue.exchangedAmount} completions were exchanged but not recorded`);
          } else if (issue.type === 'lastExchangeAmount_missing') {
            console.log(`   • lastExchangeAmount is missing`);
          } else if (issue.type === 'possible_exchange_not_recorded') {
            console.log(`   • Possible exchange not recorded: ${issue.exchangedAmount} completions may have been exchanged`);
          } else if (issue.type === 'lastExchangeAt_missing') {
            console.log(`   • lastExchangeAt is missing`);
          }
        });
      }
      
      // Show recent completions for debugging
      const recentCompletions = (user.helpWanted?.completions || []).slice(-10).reverse();
      if (recentCompletions.length > 0) {
        console.log(`   Recent completions (last 10):`);
        recentCompletions.forEach((comp, idx) => {
          const questId = comp.questId || '(no questId)';
          const village = comp.village || '(no village)';
          const questType = comp.questType || '(no type)';
          const date = comp.date || '(no date)';
          console.log(`      ${idx + 1}. ${questId} - ${village} ${questType} (${date})`);
        });
      }
      
      if (ARG_DRY_RUN) {
        console.log(`   [DRY RUN] Would fix issues...`);
        continue;
      }
      
      const fixResult = await fixUserHelpWanted(user, analysis);
      
      if (fixResult.fixed) {
        stats.usersFixed++;
        console.log(`   ✅ Applied fixes:`);
        fixResult.fixes.forEach(fix => {
          console.log(`      • ${fix}`);
        });
        
        await user.save();
        console.log(`   💾 Saved user record`);
        
        // Re-analyze to show new state
        const newAnalysis = analyzeUserHelpWanted(user);
        console.log(`   New state:`);
        console.log(`   • totalCompletions (lifetime): ${newAnalysis.totalCompletions !== undefined ? newAnalysis.totalCompletions : 'MISSING'}`);
        console.log(`   • currentCompletions (for exchange): ${newAnalysis.currentCompletions}`);
        console.log(`   • lastExchangeAmount: ${newAnalysis.lastExchangeAmount}`);
        console.log(`   • lastExchangeAt: ${newAnalysis.lastExchangeAt !== undefined ? (newAnalysis.lastExchangeAt ? new Date(newAnalysis.lastExchangeAt).toISOString().split('T')[0] : 'null') : 'MISSING'}`);
      }
      
    } catch (error) {
      stats.errors++;
      console.error(`   ❌ Error processing user ${user.discordId}: ${error.message}`);
      console.error(error.stack);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 Fix Summary');
  console.log('='.repeat(80));
  console.log(`Users analyzed        : ${stats.usersAnalyzed}`);
  console.log(`Users with issues     : ${stats.usersWithIssues}`);
  console.log(`Users fixed           : ${stats.usersFixed}`);
  console.log(`Errors                : ${stats.errors}`);
  console.log('');
}

// ------------------- Entry Point -------------------
async function run() {
  try {
    console.log('🔌 Connecting to Tinglebot database...');
    await connectToTinglebot();
    console.log('✅ Database connection ready\n');
    
    await fixHelpWantedCompletions();
  } catch (error) {
    console.error('❌ Fix failed:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed.');
    process.exit(0);
  }
}

run();

