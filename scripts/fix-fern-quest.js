// ============================================================================
// ------------------- Fix Script for Fern's Quest X340940 -------------------
// This script manually completes Fern's Help Wanted Quest and updates their stats
// ============================================================================

const { connectToTinglebot } = require('../database/db');
const HelpWantedQuest = require('../models/HelpWantedQuestModel');
const User = require('../models/UserModel');
const Character = require('../models/CharacterModel');

// Quest details from the submission
const QUEST_ID = 'X340940';
const SUBMISSION_ID = 'A837978';
const ART_TITLE = 'A Place for Walton to Forage';

async function fixFernQuest() {
  try {
    console.log('🔧 Starting fix for Fern\'s quest...');
    
    // Connect to database
    await connectToTinglebot();
    console.log('✅ Connected to database');

    // Find the quest
    const quest = await HelpWantedQuest.findOne({ questId: QUEST_ID });
    if (!quest) {
      console.error(`❌ Quest ${QUEST_ID} not found`);
      return;
    }
    console.log(`✅ Found quest: ${quest.questId} - ${quest.type} quest for ${quest.village}`);

    // Check if quest is already completed
    if (quest.completed) {
      console.log(`⚠️ Quest ${QUEST_ID} is already completed`);
      console.log(`Completed by: ${quest.completedBy?.userId} at ${quest.completedBy?.timestamp}`);
      return;
    }

    // Use Fern's Discord ID directly
    const fernUserId = '635948726686580747';
    let fernCharacter = null;

    // Try to find Fern's character (optional for art/writing quests)
    const fernCharacters = await Character.find({
      userId: fernUserId
    });

    if (fernCharacters.length > 0) {
      fernCharacter = fernCharacters[0]; // Take the first one found
      console.log(`✅ Found Fern's character: ${fernCharacter.name} (User ID: ${fernUserId})`);
    } else {
      console.log('ℹ️ No character found for Fern');
      console.log('ℹ️ For art/writing quests, we can complete without a character');
    }

    // Find Fern's user record
    const fernUser = await User.findOne({ discordId: fernUserId });
    if (!fernUser) {
      console.error(`❌ Could not find user record for Discord ID: ${fernUserId}`);
      return;
    }
    console.log(`✅ Found Fern's user record: ${fernUser.discordId}`);

    // Create submission data for the quest completion
    const submissionData = {
      userId: fernUserId,
      username: 'Fern',
      category: 'art',
      questEvent: QUEST_ID,
      submissionId: SUBMISSION_ID,
      artTitle: ART_TITLE,
      approvedSubmissionData: true, // Skip approval check
      messageUrl: null // We don't have the message URL
    };

    // Mark quest as completed
    quest.completed = true;
    quest.completedBy = {
      userId: fernUserId,
      characterId: fernCharacter ? fernCharacter._id : null, // Art/writing quests don't require a character
      timestamp: new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})
    };
    await quest.save();
    console.log('✅ Quest marked as completed');

    // Update user tracking
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    
    // Initialize helpWanted tracking if it doesn't exist
    if (!fernUser.helpWanted) {
      fernUser.helpWanted = {
        lastCompletion: null,
        totalCompletions: 0,
        completions: []
      };
    }

    // Update tracking
    fernUser.helpWanted.lastCompletion = today;
    fernUser.helpWanted.totalCompletions = (fernUser.helpWanted.totalCompletions || 0) + 1;
    fernUser.helpWanted.completions.push({
      date: today,
      village: quest.village,
      questType: quest.type,
      questId: quest.questId,
      timestamp: new Date()
    });
    await fernUser.save();
    console.log('✅ Updated Fern\'s completion tracking');

    // Display results
    console.log('\n🎉 Quest Fix Complete!');
    console.log(`Quest ID: ${QUEST_ID}`);
    console.log(`Quest Type: ${quest.type}`);
    console.log(`Village: ${quest.village}`);
    console.log(`Completed By: ${fernCharacter ? fernCharacter.name : 'No character required'} (${fernUserId})`);
    console.log(`Completion Date: ${today}`);
    console.log(`Fern's Total Completions: ${fernUser.helpWanted.totalCompletions}`);

    // Show quest details
    console.log('\n📋 Quest Details:');
    console.log(`Prompt: ${quest.prompt}`);
    console.log(`Requirement: ${quest.requirement}`);
    console.log(`Context: ${quest.context}`);
    console.log(`Amount: ${quest.amount}`);

  } catch (error) {
    console.error('❌ Error fixing Fern\'s quest:', error);
  } finally {
    process.exit(0);
  }
}

// Run the fix
fixFernQuest();
