// ============================================================================
// fix_expired_quests.js
// Purpose: Fix expired quests in database by marking them as inactive
// ============================================================================

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.resolve(__dirname, '.env') });

// Helper function to check if a quest has expired
function checkQuestExpiration(quest) {
  if (!quest.timeLimit) {
    return false;
  }
  
  const startDate = quest.postedAt || quest.createdAt;
  if (!startDate) {
    return false;
  }
  
  const now = new Date();
  const startDateTime = new Date(startDate);
  const timeLimit = quest.timeLimit.toLowerCase();
  
  const TIME_MULTIPLIERS = {
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    MONTH: 30 * 24 * 60 * 60 * 1000
  };
  
  let durationMs = 0;
  
  if (timeLimit.includes('month')) {
    const months = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
    durationMs = months * TIME_MULTIPLIERS.MONTH;
  } else if (timeLimit.includes('week')) {
    const weeks = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
    durationMs = weeks * TIME_MULTIPLIERS.WEEK;
  } else if (timeLimit.includes('day')) {
    const days = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
    durationMs = days * TIME_MULTIPLIERS.DAY;
  } else if (timeLimit.includes('hour')) {
    const hours = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
    durationMs = hours * TIME_MULTIPLIERS.HOUR;
  }
  
  const expirationTime = new Date(startDateTime.getTime() + durationMs);
  return now > expirationTime;
}

async function fixExpiredQuests() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to database');
    
    const Quest = require('./shared/models/QuestModel');
    const activeQuests = await Quest.find({ status: 'active' });
    
    // Also check for October quests regardless of status
    const allQuests = await Quest.find({});
    const octoberQuests = allQuests.filter(q => {
      const dateStr = q.date || '';
      const isOctoberDate = dateStr.includes('2024-10') || dateStr.includes('10/2024') || 
                           (dateStr.includes('10/') && dateStr.includes('2024')) ||
                           dateStr.toLowerCase().includes('october 2024');
      const startDate = q.postedAt || q.createdAt;
      const startDateTime = startDate ? new Date(startDate) : null;
      const postedInOctober = startDateTime && startDateTime.getFullYear() === 2024 && startDateTime.getMonth() === 9;
      return isOctoberDate || postedInOctober;
    });
    
    console.log(`\nFound ${activeQuests.length} active quests to check...`);
    if (octoberQuests.length > 0) {
      console.log(`Found ${octoberQuests.length} quest(s) from October 2024 (regardless of status):`);
      octoberQuests.forEach(q => {
        console.log(`  - ${q.questID}: ${q.title} | Status: ${q.status} | Date: ${q.date}`);
      });
      console.log('');
    }
    
    const expiredQuests = [];
    const now = new Date();
    
    // Check all active quests plus any October quests that are still active
    const questsToCheck = [...activeQuests];
    octoberQuests.forEach(q => {
      if (q.status === 'active' && !questsToCheck.find(aq => aq.questID === q.questID)) {
        questsToCheck.push(q);
      }
    });
    
    for (const quest of questsToCheck) {
      const isExpired = quest.checkTimeExpiration ? quest.checkTimeExpiration() : checkQuestExpiration(quest);
      
      // Also check if quest date is from October 2024 (should have ended end of November)
      const dateStr = quest.date || '';
      const isOctoberQuest = dateStr.includes('2024-10') || dateStr.includes('10/2024') || 
                            (dateStr.includes('10/') && dateStr.includes('2024')) ||
                            dateStr.toLowerCase().includes('october 2024');
      
      // Check if posted in October 2024
      const startDate = quest.postedAt || quest.createdAt;
      const startDateTime = startDate ? new Date(startDate) : null;
      const postedInOctober = startDateTime && startDateTime.getFullYear() === 2024 && startDateTime.getMonth() === 9; // Month is 0-indexed
      
      if (isExpired || isOctoberQuest || postedInOctober) {
        expiredQuests.push(quest);
        const startDateTime = new Date(startDate);
        const timeLimit = (quest.timeLimit || '').toLowerCase();
        
        let durationMs = 0;
        const TIME_MULTIPLIERS = {
          HOUR: 60 * 60 * 1000,
          DAY: 24 * 60 * 60 * 1000,
          WEEK: 7 * 24 * 60 * 60 * 1000,
          MONTH: 30 * 24 * 60 * 60 * 1000
        };
        
        if (timeLimit.includes('month')) {
          const months = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
          durationMs = months * TIME_MULTIPLIERS.MONTH;
        } else if (timeLimit.includes('week')) {
          const weeks = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
          durationMs = weeks * TIME_MULTIPLIERS.WEEK;
        } else if (timeLimit.includes('day')) {
          const days = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
          durationMs = days * TIME_MULTIPLIERS.DAY;
        } else if (timeLimit.includes('hour')) {
          const hours = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
          durationMs = hours * TIME_MULTIPLIERS.HOUR;
        }
        
        const expirationTime = new Date(startDateTime.getTime() + durationMs);
        const daysPast = Math.floor((now - expirationTime) / (24 * 60 * 60 * 1000));
        
        const reason = isOctoberQuest || postedInOctober ? 'October quest' : 'Time expired';
        console.log(`❌ EXPIRED (${reason}): ${quest.questID}: ${quest.title}`);
        console.log(`   Date: ${quest.date} | Posted: ${startDateTime.toLocaleString()}`);
        console.log(`   TimeLimit: ${quest.timeLimit} | Expired: ${expirationTime.toLocaleString()}`);
        if (isExpired) {
          console.log(`   Days past expiration: ${daysPast}`);
        }
        console.log('');
      }
    }
    
    if (expiredQuests.length === 0) {
      console.log('✅ No expired quests found. All active quests are still valid.');
      await mongoose.disconnect();
      process.exit(0);
    }
    
    console.log(`\nFound ${expiredQuests.length} expired quest(s) that should be marked as inactive.`);
    console.log('Updating quest status...\n');
    
    let updatedCount = 0;
    for (const quest of expiredQuests) {
      try {
        quest.status = 'inactive';
        await quest.save();
        updatedCount++;
        console.log(`✅ Updated ${quest.questID}: ${quest.title} to inactive`);
      } catch (error) {
        console.error(`❌ Failed to update ${quest.questID}:`, error.message);
      }
    }
    
    console.log(`\n✅ Successfully updated ${updatedCount}/${expiredQuests.length} quest(s)`);
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

fixExpiredQuests();

