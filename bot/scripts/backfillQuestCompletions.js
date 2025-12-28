// ============================================================================
// ------------------- backfillQuestCompletions.js -------------------
// Script to backfill quest completion data into UserModel quests tracking
// Usage: node scripts/backfillQuestCompletions.js [--dry-run] [--limit=100]
// ============================================================================

const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');

const { connectToTinglebot } = require('../../database/db');
const Quest = require('../../models/QuestModel');
const User = require('../../models/UserModel');

const ARG_DRY_RUN = process.argv.includes('--dry-run');
const ARG_LIMIT = (() => {
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  if (!limitArg) return null;
  const value = parseInt(limitArg.split('=')[1], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
})();

// ------------------- Helper Functions -------------------
function isParticipantCompleted(participant) {
  if (!participant) return false;

  const progress = (participant.progress || '').toLowerCase();
  if (progress === 'rewarded' || progress === 'completed') {
    return true;
  }

  if (participant.rewardProcessed === true) {
    return true;
  }

  if (typeof participant.tokensEarned === 'number' && participant.tokensEarned > 0) {
    return true;
  }

  return false;
}

function normalizeParticipantItems(participant, quest) {
  if (Array.isArray(participant?.itemsEarned) && participant.itemsEarned.length > 0) {
    return participant.itemsEarned.map(item => ({
      name: item?.name || null,
      quantity: typeof item?.quantity === 'number' ? item.quantity : 1
    }));
  }

  if (quest.itemReward && quest.itemRewardQty) {
    return [{
      name: quest.itemReward,
      quantity: quest.itemRewardQty
    }];
  }

  return [];
}

function normalizeDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function getParticipantsArray(quest) {
  if (!quest || !quest.participants) {
    return [];
  }

  if (quest.participants instanceof Map) {
    return Array.from(quest.participants.entries());
  }

  return Object.entries(quest.participants);
}

// ------------------- Main Backfill Logic -------------------
async function backfillQuestCompletions() {
  console.log('='.repeat(80));
  console.log('📜 Backfilling quest completions into user records');
  console.log(`🔧 Dry run: ${ARG_DRY_RUN ? 'YES' : 'NO'}`);
  if (ARG_LIMIT) {
    console.log(`🔢 Quest limit: ${ARG_LIMIT}`);
  }
  console.log('='.repeat(80));
  console.log('');

  const stats = {
    questsProcessed: 0,
    participantsEvaluated: 0,
    completionsRecorded: 0,
    completionsUpdated: 0,
    usersMissing: 0,
    participantsSkipped: 0
  };

  const questQuery = {};
  const cursor = Quest.find(questQuery).lean(false).cursor();

  for await (const quest of cursor) {
    stats.questsProcessed += 1;
    if (ARG_LIMIT && stats.questsProcessed > ARG_LIMIT) {
      console.log('⏹️ Reached quest processing limit. Stopping.');
      break;
    }

    const participants = getParticipantsArray(quest);
    if (participants.length === 0) {
      continue;
    }

    console.log(`\n🎯 Quest ${quest.questID} (${quest.title})`);
    console.log(`   • Status: ${quest.status}`);
    console.log(`   • Participants: ${participants.length}`);

    for (const [userId, participant] of participants) {
      stats.participantsEvaluated += 1;

      if (!isParticipantCompleted(participant)) {
        stats.participantsSkipped += 1;
        continue;
      }

      try {
        const user = await User.findOne({ discordId: userId });
        if (!user) {
          stats.usersMissing += 1;
          console.warn(`   ⚠️ User ${userId} not found, skipping`);
          continue;
        }

        const tokensEarned = typeof participant.tokensEarned === 'number' ? participant.tokensEarned : 0;
        const itemsEarned = normalizeParticipantItems(participant, quest);
        const completedAt = normalizeDate(participant.completedAt, quest.completedAt || quest.updatedAt || quest.createdAt || new Date());
        const rewardedAt = normalizeDate(participant.rewardedAt, participant.completedAt || quest.completedAt || quest.updatedAt || quest.createdAt || new Date());
        const rewardSource = participant.rewardSource || 'backfill';

        if (ARG_DRY_RUN) {
          console.log(`   📝 [DRY RUN] Would record completion for ${userId}`);
          console.log(`      • Quest: ${quest.questID}`);
          console.log(`      • Type: ${quest.questType}`);
          console.log(`      • Tokens: ${tokensEarned}`);
          console.log(`      • Items: ${itemsEarned.length}`);
          continue;
        }

        const beforeTotals = user.quests?.totalCompleted || 0;
        const result = await user.recordQuestCompletion({
          questId: quest.questID,
          questType: quest.questType,
          questTitle: quest.title,
          completedAt,
          rewardedAt,
          tokensEarned,
          itemsEarned,
          rewardSource
        });

        const afterTotals = result?.totalCompleted || user.quests?.totalCompleted || 0;
        if (afterTotals > beforeTotals) {
          stats.completionsRecorded += 1;
          console.log(`   ✅ Recorded completion for ${userId} (total: ${afterTotals})`);
        } else {
          stats.completionsUpdated += 1;
          console.log(`   🔁 Updated existing completion for ${userId}`);
        }
      } catch (error) {
        stats.participantsSkipped += 1;
        console.error(`   ❌ Failed to record completion for ${userId}: ${error.message}`);
      }
    }
  }

  console.log('\n'.concat('='.repeat(80)));
  console.log('📊 Backfill summary');
  console.log('='.repeat(80));
  console.log(`Quests processed       : ${stats.questsProcessed}`);
  console.log(`Participants evaluated  : ${stats.participantsEvaluated}`);
  console.log(`Completions recorded    : ${stats.completionsRecorded}`);
  console.log(`Completions updated     : ${stats.completionsUpdated}`);
  console.log(`Participants skipped    : ${stats.participantsSkipped}`);
  console.log(`Users missing           : ${stats.usersMissing}`);
  console.log('');
}

// ------------------- Entry Point -------------------
async function run() {
  try {
    console.log('🔌 Connecting to Tinglebot database...');
    await connectToTinglebot();
    console.log('✅ Database connection ready\n');

    await backfillQuestCompletions();
  } catch (error) {
    console.error('❌ Backfill failed:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed.');
    process.exit(0);
  }
}

run();

