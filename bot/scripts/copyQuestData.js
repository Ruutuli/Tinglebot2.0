const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');

// Import database connection
const { connectToTinglebot } = require('../../shared/database/db');
const User = require('../../shared/models/UserModel');

// Source user (where quest data is copied FROM)
const SOURCE_DISCORD_ID = '253315643351236608';
// Target user (where quest data is copied TO)
const TARGET_DISCORD_ID = '211219306137124865';

async function copyQuestData() {
  console.log('='.repeat(80));
  console.log('📋 Copy Quest Data');
  console.log('='.repeat(80));
  console.log(`Source user: ${SOURCE_DISCORD_ID}`);
  console.log(`Target user: ${TARGET_DISCORD_ID}`);
  console.log('');

  try {
    // Find source user
    const sourceUser = await User.findOne({ discordId: SOURCE_DISCORD_ID });
    if (!sourceUser) {
      console.error(`❌ Source user ${SOURCE_DISCORD_ID} not found!`);
      return;
    }
    console.log(`✅ Found source user: ${sourceUser.username || sourceUser.discordId}`);

    // Find target user
    const targetUser = await User.findOne({ discordId: TARGET_DISCORD_ID });
    if (!targetUser) {
      console.error(`❌ Target user ${TARGET_DISCORD_ID} not found!`);
      return;
    }
    console.log(`✅ Found target user: ${targetUser.username || targetUser.discordId}`);

    // Get source quest data
    const sourceQuests = sourceUser.quests || {};
    
    console.log('\n📊 Source quest data:');
    console.log(`   • totalCompleted: ${sourceQuests.totalCompleted || 0}`);
    console.log(`   • pendingTurnIns: ${sourceQuests.pendingTurnIns || 0}`);
    console.log(`   • completions: ${sourceQuests.completions?.length || 0}`);
    console.log(`   • legacy.pendingTurnIns: ${sourceQuests.legacy?.pendingTurnIns || 0}`);
    console.log(`   • legacy.totalTransferred: ${sourceQuests.legacy?.totalTransferred || 0}`);
    console.log(`   • legacy.transferUsed: ${sourceQuests.legacy?.transferUsed || false}`);

    // Ensure target user has quest tracking
    if (!targetUser.quests) {
      targetUser.quests = {};
    }

    // Copy quest data structure
    targetUser.quests.completions = sourceQuests.completions ? JSON.parse(JSON.stringify(sourceQuests.completions)) : [];
    targetUser.quests.totalCompleted = sourceQuests.totalCompleted || 0;
    
    // Admin copy: take max of source pendingTurnIns and actualCompletions to avoid under-counting
    // when migrating. If the source had already turned in, the target may receive extra; acceptable
    // trade-off for admin copy.
    const actualCompletions = targetUser.quests.completions?.length || 0;
    targetUser.quests.pendingTurnIns = Math.max(sourceQuests.pendingTurnIns || 0, actualCompletions);
    
    targetUser.quests.lastCompletionAt = sourceQuests.lastCompletionAt || null;
    targetUser.quests.typeTotals = sourceQuests.typeTotals ? { ...sourceQuests.typeTotals } : {
      art: 0,
      artWriting: 0,
      interactive: 0,
      other: 0,
      rp: 0,
      writing: 0
    };

    // Copy legacy data
    if (sourceQuests.legacy) {
      targetUser.quests.legacy = {
        pendingTurnIns: sourceQuests.legacy.pendingTurnIns || 0,
        totalTransferred: sourceQuests.legacy.totalTransferred || 0,
        transferUsed: sourceQuests.legacy.transferUsed || false,
        transferredAt: sourceQuests.legacy.transferredAt || null
      };
    } else {
      targetUser.quests.legacy = {
        pendingTurnIns: 0,
        totalTransferred: 0,
        transferUsed: false,
        transferredAt: null
      };
    }

    console.log('\n📊 Target quest data (after copy):');
    console.log(`   • totalCompleted: ${targetUser.quests.totalCompleted || 0}`);
    console.log(`   • pendingTurnIns: ${targetUser.quests.pendingTurnIns || 0}`);
    console.log(`   • completions: ${targetUser.quests.completions?.length || 0}`);
    console.log(`   • legacy.pendingTurnIns: ${targetUser.quests.legacy?.pendingTurnIns || 0}`);
    console.log(`   • legacy.totalTransferred: ${targetUser.quests.legacy?.totalTransferred || 0}`);
    console.log(`   • legacy.transferUsed: ${targetUser.quests.legacy?.transferUsed || false}`);

    // Calculate total pending
    const totalPending = (targetUser.quests.pendingTurnIns || 0) + (targetUser.quests.legacy?.pendingTurnIns || 0);
    console.log(`\n🎯 Total pending turn-ins: ${totalPending}`);

    // Save target user
    await targetUser.save();
    console.log('\n✅ Quest data copied successfully!');
    console.log(`   Target user now has ${totalPending} total pending turn-ins.`);

  } catch (error) {
    console.error('❌ Error copying quest data:', error);
    console.error(error.stack);
    throw error;
  }
}

// ------------------- Entry Point -------------------
async function run() {
  try {
    console.log('🔌 Connecting to Tinglebot database...');
    await connectToTinglebot();
    console.log('✅ Database connection ready\n');
    
    await copyQuestData();
  } catch (error) {
    console.error('❌ Script failed:', error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed.');
    process.exit(0);
  }
}

run();
