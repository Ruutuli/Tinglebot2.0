// ============================================================================
// fix_completed_quest_participants.js
// Purpose: Fix completed quests where participants are still marked as active
// ============================================================================

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Helper function to check if participant meets requirements
function meetsRequirements(participant, quest) {
  // Check if participant has completed submissions
  const hasSubmissions = participant.submissions && participant.submissions.length > 0;
  const hasApprovedSubmissions = hasSubmissions && participant.submissions.some(s => s.approved === true);
  
  // Check RP post count if it's an RP quest
  if (quest.questType === 'RP') {
    const postRequirement = quest.postRequirement || 15;
    return participant.rpPostCount >= postRequirement;
  }
  
  // For Art/Writing quests, need at least one approved submission
  if (quest.questType === 'Art' || quest.questType === 'Writing' || quest.questType === 'Art / Writing') {
    return hasApprovedSubmissions;
  }
  
  // For Interactive quests, check if they have submissions
  if (quest.questType === 'Interactive') {
    return hasSubmissions;
  }
  
  // Default: if they have any submissions, consider them as having attempted
  return hasSubmissions;
}

async function fixCompletedQuestParticipants() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database\n');
    
    const Quest = require('./shared/models/QuestModel');
    const completedQuests = await Quest.find({ status: 'completed' });
    
    console.log(`Found ${completedQuests.length} completed quest(s) to check...\n`);
    
    let totalFixed = 0;
    let totalParticipantsFixed = 0;
    
    for (const quest of completedQuests) {
      const participants = Array.from(quest.participants.values());
      const activeParticipants = participants.filter(p => p.progress === 'active');
      
      if (activeParticipants.length === 0) {
        continue; // Skip if no active participants
      }
      
      console.log(`\nQuest: ${quest.questID} - "${quest.title}"`);
      console.log(`  Status: ${quest.status}`);
      console.log(`  Completion Reason: ${quest.completionReason || 'N/A'}`);
      console.log(`  Active Participants: ${activeParticipants.length}`);
      
      let questNeedsUpdate = false;
      let participantsFixed = 0;
      
      for (const participant of activeParticipants) {
        const meetsReqs = meetsRequirements(participant, quest);
        const oldStatus = participant.progress;
        
        if (meetsReqs) {
          // If they meet requirements, mark as completed
          participant.progress = 'completed';
          participant.completedAt = participant.completedAt || new Date();
          console.log(`  ✅ ${participant.characterName}: active → completed (met requirements)`);
          participantsFixed++;
          questNeedsUpdate = true;
        } else {
          // If they don't meet requirements, mark as failed
          participant.progress = 'failed';
          console.log(`  ❌ ${participant.characterName}: active → failed (did not meet requirements)`);
          participantsFixed++;
          questNeedsUpdate = true;
        }
      }
      
      if (questNeedsUpdate) {
        try {
          await quest.save();
          console.log(`  ✅ Updated quest ${quest.questID}`);
          totalFixed++;
          totalParticipantsFixed += participantsFixed;
        } catch (error) {
          console.error(`  ❌ Failed to update quest ${quest.questID}:`, error.message);
        }
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('Summary:');
    console.log(`  Quests fixed: ${totalFixed}`);
    console.log(`  Participants fixed: ${totalParticipantsFixed}`);
    console.log(`${'='.repeat(60)}\n`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixCompletedQuestParticipants();

