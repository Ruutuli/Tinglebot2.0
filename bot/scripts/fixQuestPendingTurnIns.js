// ============================================================================
// ------------------- fixQuestPendingTurnIns.js -------------------
// Script to fix quest completion counting issues where completed quests
// are not properly counted towards pendingTurnIns
// Usage: node scripts/fixQuestPendingTurnIns.js [--dry-run] [--user=USER_ID]
// ============================================================================

const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');

const { connectToTinglebot } = require('../../database/db');
const User = require('../../models/UserModel');
const Quest = require('../../models/QuestModel');

const ARG_DRY_RUN = process.argv.includes('--dry-run');
const ARG_USER = (() => {
  const userArg = process.argv.find(arg => arg.startsWith('--user='));
  if (!userArg) return null;
  return userArg.split('=')[1];
})();

// ------------------- Helper Functions -------------------
function countUniqueQuestCompletions(completions) {
  if (!Array.isArray(completions) || completions.length === 0) {
    return 0;
  }
  
  // Count unique quest completions by questId
  // If questId is null/undefined, count each as separate (shouldn't happen but handle it)
  const uniqueQuestIds = new Set();
  let nullIdCount = 0;
  
  for (const completion of completions) {
    if (completion.questId && completion.questId.trim() !== '') {
      uniqueQuestIds.add(completion.questId);
    } else {
      // Count completions without questId separately (these might be duplicates)
      nullIdCount++;
    }
  }
  
  return uniqueQuestIds.size + nullIdCount;
}

function analyzeUserQuestTracking(user) {
  const questTracking = user.quests || {};
  const completions = questTracking.completions || [];
  const totalCompleted = questTracking.totalCompleted || 0;
  const pendingTurnIns = questTracking.pendingTurnIns || 0;
  const legacyPending = questTracking.legacy?.pendingTurnIns || 0;
  
  // Count actual unique completions
  const actualCompletions = countUniqueQuestCompletions(completions);
  
  // Calculate expected pending turn-ins
  // This is tricky because we don't track which specific quests have been turned in
  // But we can infer: if totalCompleted > actualCompletions, there's a mismatch
  // If actualCompletions > totalCompleted, totalCompleted is wrong
  
  const issues = [];
  
  // Check if totalCompleted matches actual completions
  if (totalCompleted !== actualCompletions) {
    issues.push({
      type: 'totalCompleted_mismatch',
      expected: actualCompletions,
      actual: totalCompleted,
      difference: actualCompletions - totalCompleted
    });
  }
  
  // Check if pendingTurnIns matches unique quest completions
  // pendingTurnIns should equal the number of unique quest completions (available for turn-in)
  // It can't be less than actualCompletions (unless some were turned in, but we can't track that)
  // The main issue: pendingTurnIns should at least equal actualCompletions
  const totalPending = legacyPending + pendingTurnIns;
  if (pendingTurnIns < 0) {
    issues.push({
      type: 'pendingTurnIns_negative',
      value: pendingTurnIns
    });
  }
  
  // Check if pendingTurnIns is less than actual completions (main issue we're fixing)
  if (pendingTurnIns < actualCompletions) {
    issues.push({
      type: 'pendingTurnIns_too_low',
      expected: actualCompletions,
      actual: pendingTurnIns,
      difference: actualCompletions - pendingTurnIns
    });
  }
  
  // Check for completions without questId (these can't be properly tracked)
  const completionsWithoutId = completions.filter(c => !c.questId || c.questId.trim() === '');
  if (completionsWithoutId.length > 0) {
    issues.push({
      type: 'completions_without_questId',
      count: completionsWithoutId.length
    });
  }
  
  return {
    totalCompleted,
    actualCompletions,
    pendingTurnIns,
    legacyPending,
    totalPending,
    completionsCount: completions.length,
    issues,
    needsFix: issues.length > 0
  };
}

// ------------------- Fix User Quest Tracking -------------------
async function fixUserQuestTracking(user, analysis) {
  const questTracking = user.quests || {};
  let fixed = false;
  const fixes = [];
  
  // Fix 1: Update totalCompleted to match actual completions
  if (analysis.issues.some(i => i.type === 'totalCompleted_mismatch')) {
    const mismatch = analysis.issues.find(i => i.type === 'totalCompleted_mismatch');
    if (mismatch.difference > 0) {
      // We have more actual completions than recorded
      // This means some completions weren't counted in totalCompleted
      // We should update totalCompleted to match
      const oldTotal = questTracking.totalCompleted || 0;
      questTracking.totalCompleted = analysis.actualCompletions;
      fixes.push(`Updated totalCompleted from ${oldTotal} to ${analysis.actualCompletions}`);
      fixed = true;
    } else if (mismatch.difference < 0) {
      // We have fewer actual completions than recorded
      // This could mean completions were deleted or there's data corruption
      // We should update totalCompleted to match actual
      const oldTotal = questTracking.totalCompleted || 0;
      questTracking.totalCompleted = analysis.actualCompletions;
      fixes.push(`Updated totalCompleted from ${oldTotal} to ${analysis.actualCompletions} (had more recorded than actual)`);
      fixed = true;
    }
  }
  
  // Fix 2: Recalculate pendingTurnIns to match unique quest completions
  // The key issue: pendingTurnIns should equal the number of unique quest completions
  // (available for turn-in). Even if totalCompleted is correct, pendingTurnIns might be wrong.
  // 
  // Strategy: pendingTurnIns should equal the number of unique quest completions.
  // We can't know exactly how many have been turned in, but we can ensure pendingTurnIns
  // at least matches the number of unique completions (it can't be less).
  
  // Calculate the expected pendingTurnIns based on unique completions
  const currentPendingTurnIns = questTracking.pendingTurnIns || 0;
  const expectedPendingTurnIns = analysis.actualCompletions;
  
  if (currentPendingTurnIns < expectedPendingTurnIns) {
    // pendingTurnIns is less than the number of unique completions - fix it
    const pendingDiff = expectedPendingTurnIns - currentPendingTurnIns;
    questTracking.pendingTurnIns = expectedPendingTurnIns;
    fixes.push(`Updated pendingTurnIns from ${currentPendingTurnIns} to ${expectedPendingTurnIns} (added ${pendingDiff} missing completions)`);
    fixed = true;
  } else if (currentPendingTurnIns > expectedPendingTurnIns) {
    // pendingTurnIns is greater than unique completions - this could mean some were turned in
    // or there's data inconsistency. Log a warning but don't decrease to avoid undercounting.
    fixes.push(`Warning: pendingTurnIns (${currentPendingTurnIns}) is greater than unique completions (${expectedPendingTurnIns}). This may indicate some quests were turned in. Not adjusting to avoid undercounting.`);
  }
  
  // Fix 3: Ensure pendingTurnIns is not negative
  if (analysis.issues.some(i => i.type === 'pendingTurnIns_negative')) {
    const oldPending = questTracking.pendingTurnIns || 0;
    questTracking.pendingTurnIns = 0;
    fixes.push(`Fixed negative pendingTurnIns from ${oldPending} to 0`);
    fixed = true;
  }
  
  // Fix 4: Fix pendingTurnIns if it's too low (main issue)
  if (analysis.issues.some(i => i.type === 'pendingTurnIns_too_low')) {
    const issue = analysis.issues.find(i => i.type === 'pendingTurnIns_too_low');
    const oldPending = questTracking.pendingTurnIns || 0;
    questTracking.pendingTurnIns = issue.expected;
    fixes.push(`Fixed pendingTurnIns from ${oldPending} to ${issue.expected} (added ${issue.difference} missing completions)`);
    fixed = true;
  }
  
  return { fixed, fixes };
}

// ------------------- Main Fix Logic -------------------
async function fixQuestPendingTurnIns() {
  console.log('='.repeat(80));
  console.log('🔧 Fix Quest Pending Turn-Ins');
  console.log(`🔧 Dry run: ${ARG_DRY_RUN ? 'YES' : 'NO'}`);
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
    pendingTurnInsFixed: 0,
    errors: 0
  };
  
  // Build query
  const query = {};
  if (ARG_USER) {
    query.discordId = ARG_USER;
  }
  
  // Find users with quest tracking data
  const users = await User.find({
    ...query,
    'quests.completions': { $exists: true, $ne: [] }
  });
  
  console.log(`📊 Found ${users.length} users with quest completions to analyze\n`);
  
  for (const user of users) {
    stats.usersAnalyzed++;
    
    try {
      const analysis = analyzeUserQuestTracking(user);
      
      if (!analysis.needsFix) {
        continue;
      }
      
      stats.usersWithIssues++;
      
      console.log(`\n👤 User: ${user.discordId}`);
      console.log(`   Current state:`);
      console.log(`   • totalCompleted: ${analysis.totalCompleted}`);
      console.log(`   • actualCompletions: ${analysis.actualCompletions}`);
      console.log(`   • pendingTurnIns: ${analysis.pendingTurnIns}`);
      console.log(`   • legacyPending: ${analysis.legacyPending}`);
      console.log(`   • totalPending: ${analysis.totalPending}`);
      console.log(`   • completions array length: ${analysis.completionsCount}`);
      
      if (analysis.issues.length > 0) {
        console.log(`   Issues found:`);
        analysis.issues.forEach(issue => {
          if (issue.type === 'totalCompleted_mismatch') {
            console.log(`   • totalCompleted mismatch: expected ${issue.expected}, got ${issue.actual} (diff: ${issue.difference})`);
          } else if (issue.type === 'pendingTurnIns_negative') {
            console.log(`   • pendingTurnIns is negative: ${issue.value}`);
          } else if (issue.type === 'pendingTurnIns_too_low') {
            console.log(`   • pendingTurnIns too low: expected ${issue.expected}, got ${issue.actual} (diff: ${issue.difference})`);
          } else if (issue.type === 'completions_without_questId') {
            console.log(`   • ${issue.count} completions without questId`);
          }
        });
      }
      
      // Show recent completions for debugging
      const recentCompletions = (user.quests?.completions || []).slice(-10).reverse();
      if (recentCompletions.length > 0) {
        console.log(`   Recent completions (last 10):`);
        recentCompletions.forEach((comp, idx) => {
          const questId = comp.questId || '(no questId)';
          const title = comp.questTitle || '(no title)';
          const date = comp.completedAt ? new Date(comp.completedAt).toISOString().split('T')[0] : '(no date)';
          console.log(`      ${idx + 1}. ${questId} - ${title} (${date})`);
        });
      }
      
      if (ARG_DRY_RUN) {
        console.log(`   [DRY RUN] Would fix issues...`);
        continue;
      }
      
      const fixResult = await fixUserQuestTracking(user, analysis);
      
      if (fixResult.fixed) {
        stats.usersFixed++;
        console.log(`   ✅ Applied fixes:`);
        fixResult.fixes.forEach(fix => {
          console.log(`      • ${fix}`);
        });
        
        await user.save();
        console.log(`   💾 Saved user record`);
        
        // Re-analyze to show new state
        const newAnalysis = analyzeUserQuestTracking(user);
        console.log(`   New state:`);
        console.log(`   • totalCompleted: ${newAnalysis.totalCompleted}`);
        console.log(`   • pendingTurnIns: ${newAnalysis.pendingTurnIns}`);
        console.log(`   • totalPending: ${newAnalysis.totalPending}`);
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
    
    await fixQuestPendingTurnIns();
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

