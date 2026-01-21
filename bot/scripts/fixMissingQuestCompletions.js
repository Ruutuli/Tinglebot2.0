// ============================================================================
// ------------------- fixMissingQuestCompletions.js -------------------
// Script to fix missing quest completions by finding completed quests where
// users participated but their completion wasn't recorded in user.quests
// Usage: node scripts/fixMissingQuestCompletions.js [--dry-run] [--user=USER_ID] [--quest-names="QUEST1,QUEST2"]
// ============================================================================

const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');

const { connectToTinglebot } = require('@app/shared/database/db');
const User = require('@app/shared/models/UserModel');
const Quest = require('@app/shared/models/QuestModel');
const { countUniqueQuestCompletions } = require('@app/shared/utils/questTrackingUtils');

const ARG_DRY_RUN = process.argv.includes('--dry-run');
const ARG_USER = (() => {
  const userArg = process.argv.find(arg => arg.startsWith('--user='));
  if (!userArg) return null;
  return userArg.split('=')[1];
})();
const ARG_QUEST_NAMES = (() => {
  const questArg = process.argv.find(arg => arg.startsWith('--quest-names='));
  if (!questArg) return null;
  return questArg.split('=')[1].split(',').map(name => name.trim());
})();

// ------------------- Helper Functions -------------------
function isParticipantCompleted(participant) {
  if (!participant) return false;
  
  const progress = (participant.progress || '').toLowerCase();
  return progress === 'completed' || progress === 'rewarded';
}

async function findMissingCompletionsForUser(user, completedQuests) {
  const questTracking = user.quests || {};
  const userCompletions = questTracking.completions || [];
  const userCompletionIds = new Set(
    userCompletions
      .filter(c => c.questId)
      .map(c => c.questId)
  );
  
  const missingCompletions = [];
  
  // Filter quests if --quest-names provided
  let questsToCheck = completedQuests;
  if (ARG_QUEST_NAMES && ARG_QUEST_NAMES.length > 0) {
    questsToCheck = completedQuests.filter(quest => {
      const questTitle = (quest.title || '').toLowerCase();
      return ARG_QUEST_NAMES.some(name => questTitle.includes(name.toLowerCase()));
    });
  }
  
  for (const quest of questsToCheck) {
    // Check if user was a participant
    const participant = quest.getParticipant(user.discordId);
    if (!participant) {
      continue;
    }
    
    // Check if participant completed the quest
    if (!isParticipantCompleted(participant)) {
      continue;
    }
    
    // Check if completion is already recorded
    if (userCompletionIds.has(quest.questID)) {
      continue;
    }
    
    // This is a missing completion
    missingCompletions.push({
      quest,
      participant
    });
  }
  
  return missingCompletions;
}

async function fixUserMissingCompletions(user, missingCompletions) {
  const fixes = [];
  let completionsRecorded = 0;
  
  for (const { quest, participant } of missingCompletions) {
    try {
      const completedAt = participant.completedAt || quest.completedAt || quest.updatedAt || new Date();
      const rewardedAt = participant.rewardedAt || participant.completedAt || quest.completedAt || new Date();
      const tokensEarned = typeof participant.tokensEarned === 'number' ? participant.tokensEarned : 0;
      const itemsEarned = Array.isArray(participant.itemsEarned) ? participant.itemsEarned : [];
      const rewardSource = participant.rewardSource || 'monthly';
      
      await user.recordQuestCompletion({
        questId: quest.questID,
        questType: quest.questType,
        questTitle: quest.title,
        completedAt,
        rewardedAt,
        tokensEarned,
        itemsEarned,
        rewardSource
      });
      
      completionsRecorded++;
      fixes.push(`Recorded completion for quest ${quest.questID} (${quest.title})`);
    } catch (error) {
      fixes.push(`❌ Error recording completion for quest ${quest.questID}: ${error.message}`);
    }
  }
  
  return { fixes, completionsRecorded };
}

function fixUserPendingTurnIns(user) {
  // Ensure quest tracking exists
  if (!user.quests) {
    user.quests = {
      totalCompleted: 0,
      pendingTurnIns: 0,
      completions: [],
      typeTotals: {
        art: 0,
        writing: 0,
        interactive: 0,
        rp: 0,
        artWriting: 0,
        other: 0
      },
      legacy: {
        totalTransferred: 0,
        pendingTurnIns: 0,
        transferredAt: null,
        transferUsed: false
      }
    };
  }
  
  const questTracking = user.quests;
  const completions = questTracking.completions || [];
  const actualCompletions = countUniqueQuestCompletions(completions);
  const currentPendingTurnIns = questTracking.pendingTurnIns || 0;

  // Only set when pendingTurnIns is 0 and we have completions (uninitialized). When
  // 0 < pendingTurnIns < actualCompletions, the user may have turned in; do not set
  // to avoid over-crediting.
  if (currentPendingTurnIns === 0 && actualCompletions > 0) {
    questTracking.pendingTurnIns = actualCompletions;
    return {
      fixed: true,
      fix: `Updated pendingTurnIns from 0 to ${actualCompletions} (initialized from completions)`
    };
  }

  return { fixed: false, fix: null };
}

function analyzeUserQuestTracking(user) {
  const questTracking = user.quests || {};
  const completions = questTracking.completions || [];
  const totalCompleted = questTracking.totalCompleted || 0;
  const pendingTurnIns = questTracking.pendingTurnIns || 0;
  const legacyPending = questTracking.legacy?.pendingTurnIns || 0;
  
  const actualCompletions = countUniqueQuestCompletions(completions);
  
  return {
    totalCompleted,
    actualCompletions,
    pendingTurnIns,
    legacyPending,
    totalPending: legacyPending + pendingTurnIns,
    completionsCount: completions.length
  };
}

// ------------------- Main Fix Logic -------------------
async function fixMissingQuestCompletions() {
  console.log('='.repeat(80));
  console.log('🔧 Fix Missing Quest Completions');
  console.log(`🔧 Dry run: ${ARG_DRY_RUN ? 'YES' : 'NO'}`);
  if (ARG_USER) {
    console.log(`👤 User filter: ${ARG_USER}`);
  }
  if (ARG_QUEST_NAMES) {
    console.log(`🔍 Quest name filter: ${ARG_QUEST_NAMES.join(', ')}`);
  }
  console.log('='.repeat(80));
  console.log('');
  
  const stats = {
    usersAnalyzed: 0,
    usersWithMissingCompletions: 0,
    usersFixed: 0,
    completionsRecorded: 0,
    pendingTurnInsFixed: 0,
    errors: 0
  };
  
  // Find all completed quests
  console.log('📋 Finding all completed quests...');
  const completedQuests = await Quest.find({ status: 'completed' });
  console.log(`✅ Found ${completedQuests.length} completed quests`);
  
  // Also check active quests where user might have completed participants
  // This helps find missing completions where quest status is still 'active'
  console.log('📋 Finding active quests with user participation...');
  const allQuests = await Quest.find({
    $or: [
      { status: 'completed' },
      { status: 'active' }
    ]
  });
  console.log(`✅ Found ${allQuests.length} total quests (completed + active)\n`);
  
  // Build user query
  const userQuery = {};
  if (ARG_USER) {
    userQuery.discordId = ARG_USER;
  }
  
  // Find users to process
  const users = await User.find(userQuery);
  console.log(`📊 Found ${users.length} users to analyze\n`);
  
  for (const user of users) {
    stats.usersAnalyzed++;
    
    try {
      // Analyze current state
      const beforeAnalysis = analyzeUserQuestTracking(user);
      
      // Debug: Show user's recorded quest IDs
      const questTracking = user.quests || {};
      const userCompletions = questTracking.completions || [];
      const recordedQuestIds = userCompletions.map(c => c.questId).filter(id => id);
      console.log(`   📝 Recorded quest IDs: ${recordedQuestIds.length > 0 ? recordedQuestIds.join(', ') : 'none'}`);
      
      // Find missing completions - check all quests (completed + active) to catch edge cases
      const missingCompletions = await findMissingCompletionsForUser(user, allQuests);
      
      if (missingCompletions.length === 0) {
        // No missing completions, but check pending turn-ins
        const pendingFix = fixUserPendingTurnIns(user);
        if (pendingFix.fixed) {
          console.log(`\n👤 User: ${user.discordId}`);
          console.log(`   ⚠️ Found pendingTurnIns mismatch`);
          console.log(`   Current state:`);
          console.log(`   • totalCompleted: ${beforeAnalysis.totalCompleted}`);
          console.log(`   • actualCompletions: ${beforeAnalysis.actualCompletions}`);
          console.log(`   • pendingTurnIns: ${beforeAnalysis.pendingTurnIns}`);
          
          if (!ARG_DRY_RUN) {
            user.markModified('quests');
            await user.save();
            console.log(`   ✅ Fixed: ${pendingFix.fix}`);
            
            // Verify the fix was saved
            await user.save(); // Ensure save completes
            const afterFix = analyzeUserQuestTracking(user);
            console.log(`   ✅ Verified - New pendingTurnIns: ${afterFix.pendingTurnIns}`);
            
            stats.pendingTurnInsFixed++;
          } else {
            console.log(`   [DRY RUN] Would fix: ${pendingFix.fix}`);
          }
        }
        continue;
      }
      
      stats.usersWithMissingCompletions++;
      
      console.log(`\n👤 User: ${user.discordId}`);
      console.log(`   Current state:`);
      console.log(`   • totalCompleted: ${beforeAnalysis.totalCompleted}`);
      console.log(`   • actualCompletions: ${beforeAnalysis.actualCompletions}`);
      console.log(`   • pendingTurnIns: ${beforeAnalysis.pendingTurnIns}`);
      console.log(`   • totalPending: ${beforeAnalysis.totalPending}`);
      console.log(`   Found ${missingCompletions.length} missing completions:`);
      missingCompletions.forEach(({ quest }) => {
        console.log(`      • ${quest.questID} - ${quest.title}`);
      });
      
      if (ARG_DRY_RUN) {
        console.log(`   [DRY RUN] Would record ${missingCompletions.length} missing completions...`);
        continue;
      }
      
      // Record missing completions
      const fixResult = await fixUserMissingCompletions(user, missingCompletions);
      stats.completionsRecorded += fixResult.completionsRecorded;
      
      console.log(`   ✅ Recorded ${fixResult.completionsRecorded} missing completions`);
      if (fixResult.fixes.length > 0) {
        fixResult.fixes.slice(0, 5).forEach(fix => {
          console.log(`      • ${fix}`);
        });
        if (fixResult.fixes.length > 5) {
          console.log(`      ... and ${fixResult.fixes.length - 5} more`);
        }
      }
      
      // Fix pending turn-ins
      const pendingFix = fixUserPendingTurnIns(user);
      if (pendingFix.fixed) {
        console.log(`   ✅ Fixed pendingTurnIns: ${pendingFix.fix}`);
        stats.pendingTurnInsFixed++;
      }
      
      // Save user
      await user.save();
      console.log(`   💾 Saved user record`);
      
      // Re-analyze to show new state
      const afterAnalysis = analyzeUserQuestTracking(user);
      console.log(`   New state:`);
      console.log(`   • totalCompleted: ${afterAnalysis.totalCompleted}`);
      console.log(`   • actualCompletions: ${afterAnalysis.actualCompletions}`);
      console.log(`   • pendingTurnIns: ${afterAnalysis.pendingTurnIns}`);
      console.log(`   • totalPending: ${afterAnalysis.totalPending}`);
      
      stats.usersFixed++;
      
    } catch (error) {
      stats.errors++;
      console.error(`   ❌ Error processing user ${user.discordId}: ${error.message}`);
      console.error(error.stack);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 Fix Summary');
  console.log('='.repeat(80));
  console.log(`Users analyzed              : ${stats.usersAnalyzed}`);
  console.log(`Users with missing completions: ${stats.usersWithMissingCompletions}`);
  console.log(`Users fixed                 : ${stats.usersFixed}`);
  console.log(`Completions recorded        : ${stats.completionsRecorded}`);
  console.log(`Pending turn-ins fixed      : ${stats.pendingTurnInsFixed}`);
  console.log(`Errors                      : ${stats.errors}`);
  console.log('');
}

// ------------------- Entry Point -------------------
async function run() {
  try {
    console.log('🔌 Connecting to Tinglebot database...');
    await connectToTinglebot();
    console.log('✅ Database connection ready\n');
    
    await fixMissingQuestCompletions();
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
