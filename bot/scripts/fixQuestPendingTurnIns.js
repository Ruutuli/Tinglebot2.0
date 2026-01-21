// ============================================================================
// ------------------- fixQuestPendingTurnIns.js -------------------
// Script to fix quest completion counting issues where completed quests
// are not properly counted towards pendingTurnIns
// Usage: node scripts/fixQuestPendingTurnIns.js [--dry-run] [--user=USER_ID]
// ============================================================================

const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');

const { connectToTinglebot } = require('./shared/database/db');
const User = require('./shared/models/UserModel');
const Quest = require('./shared/models/QuestModel');
const { countUniqueQuestCompletions } = require('./shared/utils/questTrackingUtils');

const ARG_DRY_RUN = process.argv.includes('--dry-run');
const ARG_USER = (() => {
  const userArg = process.argv.find(arg => arg.startsWith('--user='));
  if (!userArg) return null;
  return userArg.split('=')[1];
})();

// ------------------- Helper Functions -------------------
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
  
  // Only fix when pendingTurnIns is 0 and we have completions (uninitialized). When
  // 0 < pendingTurnIns < actualCompletions, the user may have turned in; we do not set
  // pendingTurnIns = actualCompletions to avoid over-crediting.
  const totalPending = legacyPending + pendingTurnIns;
  if (pendingTurnIns < 0) {
    issues.push({
      type: 'pendingTurnIns_negative',
      value: pendingTurnIns
    });
  }

  if (pendingTurnIns === 0 && actualCompletions > 0) {
    issues.push({
      type: 'pendingTurnIns_too_low',
      expected: actualCompletions,
      actual: pendingTurnIns,
      difference: actualCompletions
    });
  } else if (pendingTurnIns > 0 && pendingTurnIns < actualCompletions) {
    issues.push({
      type: 'pendingTurnIns_maybe_turned_in',
      expected: actualCompletions,
      actual: pendingTurnIns,
      message: 'May be correct if user has turned in; not adjusting to avoid over-credit'
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
  
  // Fix 2: Only set pendingTurnIns = actualCompletions when pendingTurnIns === 0 and
  // actualCompletions > 0 (uninitialized). When 0 < pendingTurnIns < actualCompletions, do
  // not change to avoid over-crediting users who have already turned in.
  const currentPendingTurnIns = questTracking.pendingTurnIns || 0;
  const expectedPendingTurnIns = analysis.actualCompletions;

  if (currentPendingTurnIns === 0 && analysis.actualCompletions > 0) {
    questTracking.pendingTurnIns = analysis.actualCompletions;
    fixes.push(`Updated pendingTurnIns from 0 to ${analysis.actualCompletions} (initialized from completions)`);
    fixed = true;
  } else if (currentPendingTurnIns > expectedPendingTurnIns) {
    fixes.push(`Warning: pendingTurnIns (${currentPendingTurnIns}) > unique completions (${expectedPendingTurnIns}). Not adjusting to avoid undercounting.`);
  } else if (currentPendingTurnIns > 0 && currentPendingTurnIns < expectedPendingTurnIns) {
    fixes.push(`Warning: pendingTurnIns (${currentPendingTurnIns}) < unique completions (${expectedPendingTurnIns}). May be correct if user turned in; not adjusting.`);
  }

  // Fix 3: Ensure pendingTurnIns is not negative
  if (analysis.issues.some(i => i.type === 'pendingTurnIns_negative')) {
    const oldPending = questTracking.pendingTurnIns || 0;
    questTracking.pendingTurnIns = 0;
    fixes.push(`Fixed negative pendingTurnIns from ${oldPending} to 0`);
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
            console.log(`   • pendingTurnIns uninitialized (0) with ${issue.expected} completions: will set to ${issue.expected}`);
          } else if (issue.type === 'pendingTurnIns_maybe_turned_in') {
            console.log(`   • pendingTurnIns (${issue.actual}) < completions (${issue.expected}); ${issue.message}`);
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

