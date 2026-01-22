// ============================================================================
// ------------------- questRewardModule.js (Dashboard Version) -------------------
// Minimal version for dashboard - only includes functions needed by QuestModel
// ============================================================================

const logger = require('../utils/logger');

// ============================================================================
// ------------------- Notification Functions -------------------
// ============================================================================

// ------------------- Send Individual Reward Notification -------------------
async function sendQuestCompletionNotification(quest, participant, channelId = null) {
    try {
        console.log(`[questRewardModule] 🎉 Quest completion notification for ${participant.characterName} in quest ${quest.questID}`);
        // Dashboard version - no Discord client available
        // This is a no-op in dashboard context
        return { success: true };
    } catch (error) {
        console.error(`[questRewardModule] ❌ Error sending quest completion notification:`, error);
        return { success: false, error: error.message };
    }
}

// ------------------- Send Quest Completion Summary -------------------
async function sendQuestCompletionSummary(quest, completionReason) {
    try {
        console.log(`[questRewardModule] 📊 Quest completion summary for ${quest.questID}`);
        // Dashboard version - no Discord client available
        // This is a no-op in dashboard context
        return { success: true };
    } catch (error) {
        console.error(`[questRewardModule] ❌ Error sending quest completion summary:`, error);
        return { success: false, error: error.message };
    }
}

// ------------------- Record Quest Completion Safeguard -------------------
async function recordQuestCompletionSafeguard(participant, quest) {
    try {
        // Only record if participant is marked as completed
        if (participant.progress !== 'completed' && participant.progress !== 'rewarded') {
            return;
        }
        
        const User = require('../models/UserModel');
        const user = await User.findOne({ discordId: participant.userId });
        if (!user || typeof user.recordQuestCompletion !== 'function') {
            return;
        }
        
        // Validate quest data
        if (!quest || !quest.questID) {
            return;
        }
        
        // Always call recordQuestCompletion - it handles duplicates by updating existing entries
        await user.recordQuestCompletion({
            questId: quest.questID,
            questType: quest.questType || 'Other',
            questTitle: quest.title || `Quest ${quest.questID}`,
            completedAt: participant.completedAt || new Date(),
            rewardedAt: null, // Will be set when rewards are distributed
            tokensEarned: 0, // Will be updated when rewards are distributed
            itemsEarned: [],
            rewardSource: 'pending' // Will be updated to 'immediate' or 'monthly' when rewards are distributed
        });

        logger.info('QUEST', `recordQuestCompletionSafeguard: recorded for userId=${participant.userId} questId=${quest.questID} rewardSource=pending`);
    } catch (error) {
        logger.error('QUEST', `Error in quest completion safeguard for user ${participant.userId}: ${error.message}`, error);
    }
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
    sendQuestCompletionNotification,
    sendQuestCompletionSummary,
    recordQuestCompletionSafeguard
};
