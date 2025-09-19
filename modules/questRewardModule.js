// ============================================================================
// ------------------- questRewardModule.js -------------------
// Handles automatic quest reward distribution and completion processing
// ============================================================================

const Quest = require('../models/QuestModel');
const Character = require('../models/CharacterModel');
const User = require('../models/UserModel');
const { handleError } = require('../utils/globalErrorHandler');

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Requirements Check ------------------
function meetsRequirements(participant, quest) {
    if (quest.questType === 'RP') {
        return participant.rpPostCount >= (quest.postRequirement || 15);
    } else if (quest.questType === 'Art' || quest.questType === 'Writing') {
        return participant.submissions.some(sub => 
            sub.type === quest.questType.toLowerCase() && sub.approved
        );
    } else if (quest.questType === 'Art / Writing') {
        return participant.submissions.some(sub => 
            (sub.type === 'art' || sub.type === 'writing') && sub.approved
        );
    }
    return false;
}

// ------------------- Token Calculation ------------------
function computeTokens(quest) {
    return quest.getNormalizedTokenReward();
}

// ------------------- Group Members Retrieval ------------------
async function getGroupMembers(questId, groupId) {
    try {
        const quest = await Quest.findOne({ questID: questId });
        if (!quest || !quest.participants) return [];
        
        return Array.from(quest.participants.values()).filter(p => p.group === groupId);
    } catch (error) {
        console.error(`[questRewardModule.js] :x: Error getting group members for quest ${questId}, group ${groupId}:`, error);
        return [];
    }
}

// ============================================================================
// ------------------- Quest Processing Functions -------------------
// ============================================================================

// ------------------- Quest Completion Processing ------------------
async function processQuestCompletion(questId) {
    try {
        const quest = await Quest.findOne({ questID: questId });
        if (!quest) {
            throw new Error(`Quest not found: ${questId}`);
        }

        if (quest.status !== 'active') {
            console.log(`[questRewardModule.js] :information_source: Quest ${questId} is not active, skipping completion processing.`);
            return;
        }

        console.log(`[questRewardModule.js] :gear: Processing completion for quest: ${quest.title}`);

        if (!quest.participants || quest.participants.size === 0) {
            console.log(`[questRewardModule.js] :warning: No participants found for quest ${questId}`);
            return;
        }

        const participants = Array.from(quest.participants.values());
        const results = await processAllParticipants(quest, participants);

        if (results.rewardedCount > 0 && results.rewardedCount === participants.length) {
            await markQuestAsCompleted(quest);
            console.log(`[questRewardModule.js] :white_check_mark: Quest ${questId} marked as completed. All participants rewarded.`);
        }

        await quest.save();
        console.log(`[questRewardModule.js] :white_check_mark: Quest completion processing finished. Completed: ${results.completedCount}, Rewarded: ${results.rewardedCount}, Errors: ${results.errorCount}`);

    } catch (error) {
        handleError(error, 'questRewardModule.js');
        console.error(`[questRewardModule.js] :x: Error processing quest completion for ${questId}:`, error);
    }
}

// ------------------- Process All Participants ------------------
async function processAllParticipants(quest, participants) {
    let completedCount = 0;
    let rewardedCount = 0;
    let errorCount = 0;

    for (const participant of participants) {
        try {
            const result = await processParticipantReward(quest, participant);
            if (result === 'rewarded') {
                rewardedCount++;
            } else if (result === 'completed') {
                completedCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error(`[questRewardModule.js] :x: Error processing participant ${participant.characterName}:`, error);
            errorCount++;
        }
    }

    return { completedCount, rewardedCount, errorCount };
}

// ------------------- Process Individual Participant Reward ------------------
async function processParticipantReward(quest, participant) {
    try {
        // Use unified reward status checking
        const rewardStatus = getParticipantRewardStatus(participant);
        
        if (rewardStatus === 'already_rewarded') {
            console.log(`[questRewardModule.js] ℹ️ Participant ${participant.characterName} already rewarded`);
            return 'already_rewarded';
        }

        if (!meetsRequirements(participant, quest)) {
            console.log(`[questRewardModule.js] ⚠️ Participant ${participant.characterName} does not meet requirements for quest ${quest.questID}`);
            return 'requirements_not_met';
        }

        if (participant.progress !== 'completed') {
            participant.progress = 'completed';
            participant.completedAt = new Date();
        }

        const rewardResult = await distributeRewards(quest, participant);
        if (rewardResult.success) {
            // Use enhanced reward data update with comprehensive tracking
            updateParticipantRewardDataEnhanced(participant, quest, rewardResult);
            console.log(`[questRewardModule.js] ✅ Successfully rewarded participant ${participant.characterName} for quest ${quest.questID}`);
            return 'rewarded';
        } else {
            console.error(`[questRewardModule.js] ❌ Failed to distribute rewards for ${participant.characterName}:`, rewardResult.error);
            return 'reward_failed';
        }

    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error processing reward for participant ${participant.characterName}:`, error);
        return 'error';
    }
}

// ------------------- Update Participant Reward Data ------------------
function updateParticipantRewardData(participant, quest, rewardResult) {
    participant.progress = 'rewarded';
    participant.rewardedAt = new Date();
    participant.tokensEarned = rewardResult.tokensAdded;
    participant.itemsEarned = quest.itemReward ? [{ name: quest.itemReward, quantity: quest.itemRewardQty || 1 }] : [];
}

// ------------------- Update Participant Reward Data Enhanced ------------------
function updateParticipantRewardDataEnhanced(participant, quest, rewardResult) {
    participant.progress = 'rewarded';
    participant.rewardedAt = new Date();
    participant.tokensEarned = rewardResult.tokensAdded;
    participant.itemsEarned = quest.itemReward ? [{ name: quest.itemReward, quantity: quest.itemRewardQty || 1 }] : [];
    participant.rewardProcessed = true; // Additional safety flag
    participant.lastRewardCheck = new Date();
    participant.rewardSource = 'immediate'; // Track how they were rewarded
}

// ============================================================================
// ------------------- Reward Distribution Functions -------------------
// ============================================================================

// ------------------- Distribute Quest Rewards ------------------
async function distributeRewards(quest, participant) {
    try {
        const results = {
            success: true,
            errors: [],
            tokensAdded: 0,
            itemsAdded: 0
        };

        const tokensToAward = computeTokens(quest);
        
        if (tokensToAward > 0) {
            const tokenResult = await distributeTokens(participant.userId, tokensToAward);
            if (tokenResult.success) {
                results.tokensAdded = tokenResult.tokensAdded;
            } else {
                results.errors.push(tokenResult.error);
            }
        }

        if (quest.itemReward && quest.itemRewardQty > 0) {
            const itemResult = await distributeItems(quest, participant);
            if (itemResult.success) {
                results.itemsAdded = itemResult.itemsAdded;
            } else {
                results.errors.push(itemResult.error);
            }
        }

        if (results.errors.length > 0) {
            results.success = false;
            results.error = results.errors.join('; ');
        }

        return results;

    } catch (error) {
        return {
            success: false,
            error: error.message,
            errors: [error.message]
        };
    }
}

// ------------------- Distribute Tokens ------------------
async function distributeTokens(userId, tokensToAward) {
    try {
        const user = await User.findOne({ discordId: userId });
        if (!user) {
            return { success: false, error: `User not found: ${userId}` };
        }

        user.tokens = (user.tokens || 0) + tokensToAward;
        await user.save();
        console.log(`[questRewardModule.js] :money_with_wings: Added ${tokensToAward} tokens to user ${userId}`);
        
        return { success: true, tokensAdded: tokensToAward };
    } catch (error) {
        return { success: false, error: `Token distribution failed: ${error.message}` };
    }
}

// ------------------- Distribute Items ------------------
async function distributeItems(quest, participant) {
    try {
        const character = await Character.findOne({ 
            name: participant.characterName, 
            userId: participant.userId 
        });
        
        if (!character) {
            return { success: false, error: `Character not found: ${participant.characterName}` };
        }

        if (!character.inventory) {
            character.inventory = [];
        }
        
        const existingItem = character.inventory.find(item => item.name === quest.itemReward);
        if (existingItem) {
            existingItem.quantity = (existingItem.quantity || 0) + quest.itemRewardQty;
        } else {
            character.inventory.push({
                name: quest.itemReward,
                quantity: quest.itemRewardQty,
                obtainedAt: new Date(),
                source: `Quest: ${quest.title}`
            });
        }
        
        await character.save();
        console.log(`[questRewardModule.js] :package: Added ${quest.itemRewardQty}x ${quest.itemReward} to character ${participant.characterName}`);
        
        return { success: true, itemsAdded: quest.itemRewardQty };
    } catch (error) {
        return { success: false, error: `Item distribution failed: ${error.message}` };
    }
}

// ============================================================================
// ------------------- Quest Management Functions -------------------
// ============================================================================

// ------------------- Mark Quest as Completed ------------------
async function markQuestAsCompleted(quest) {
    try {
        quest.status = 'completed';
        await quest.save();
        
        console.log(`[questRewardModule.js] :white_check_mark: Quest ${quest.questID} marked as completed`);
        
        if (quest.roleID) {
            console.log(`[questRewardModule.js] :information_source: Quest role ${quest.roleID} should be deleted (requires guild context)`);
        }
        
    } catch (error) {
        console.error(`[questRewardModule.js] :x: Error marking quest as completed:`, error);
        throw error;
    }
}

// ------------------- Manual Quest Completion ------------------
async function manuallyCompleteQuest(questId, adminUserId) {
    try {
        const quest = await Quest.findOne({ questID: questId });
        if (!quest) {
            throw new Error(`Quest not found: ${questId}`);
        }

        if (quest.status === 'completed') {
            throw new Error(`Quest ${questId} is already completed`);
        }

        console.log(`[questRewardModule.js] :gear: Admin ${adminUserId} manually completing quest ${questId}`);
        
        await processQuestCompletion(questId);
        
        return { success: true, message: `Quest ${questId} manually completed` };
        
    } catch (error) {
        handleError(error, 'questRewardModule.js');
        return { success: false, error: error.message };
    }
}

// ------------------- Check Quest Status ------------------
async function getQuestStatus(questId) {
    try {
        const quest = await Quest.findOne({ questID: questId });
        if (!quest) {
            return { error: 'Quest not found' };
        }

        const participants = Array.from(quest.participants.values());
        
        return {
            questId: questId,
            title: quest.title,
            status: quest.status,
            posted: quest.posted,
            postedAt: quest.postedAt,
            participants: participants.length,
            participantDetails: participants.map(p => ({
                characterName: p.characterName,
                progress: p.progress,
                joinedAt: p.joinedAt,
                completedAt: p.completedAt,
                rewardedAt: p.rewardedAt,
                tokensEarned: p.tokensEarned,
                itemsEarned: p.itemsEarned
            }))
        };
        
    } catch (error) {
        handleError(error, 'questRewardModule.js');
        return { error: error.message };
    }
}

// ============================================================================
// ------------------- Special Quest Processing Functions -------------------
// ============================================================================

// ------------------- Process RP Quest Completion ------------------
async function processRPQuestCompletion(quest, participant) {
    try {
        console.log(`[questRewardModule.js] :gear: Processing RP quest completion for ${participant.characterName} in quest ${quest.questID}`);
        
        const meetsReq = meetsRequirements(participant, quest);
        if (!meetsReq) {
            console.log(`[questRewardModule.js] :warning: Participant ${participant.characterName} does not meet RP requirements (${participant.rpPostCount}/${quest.postRequirement || 15} posts)`);
            return {
                success: false,
                error: `Participant needs ${(quest.postRequirement || 15) - participant.rpPostCount} more posts to complete the quest`
            };
        }
        
        participant.progress = 'completed';
        participant.completedAt = new Date();
        
        const rewardResult = await distributeRewards(quest, participant);
        
        if (rewardResult.success) {
            console.log(`[questRewardModule.js] :white_check_mark: RP quest completed and rewards distributed for ${participant.characterName}`);
            return {
                success: true,
                tokensAdded: rewardResult.tokensAdded,
                itemsAdded: rewardResult.itemsAdded
            };
        } else {
            console.error(`[questRewardModule.js] :x: Failed to distribute rewards for RP quest:`, rewardResult.error);
            return rewardResult;
        }
        
    } catch (error) {
        console.error(`[questRewardModule.js] :x: Error processing RP quest completion:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================================================
// ------------------- Monthly Reward Distribution Functions -------------------
// ============================================================================

// ------------------- Process Monthly Quest Rewards ------------------
async function processMonthlyQuestRewards() {
    try {
        console.log('[questRewardModule.js] 🏆 Starting monthly quest reward distribution...');
        
        // Find all completed quests that might need reward processing
        const completedQuests = await Quest.find({
            status: 'completed',
            $or: [
                { 'participants.progress': 'completed' },
                { 'participants.tokensEarned': 0 },
                { 'participants.rewardProcessed': { $ne: true } }
            ]
        });
        
        if (completedQuests.length === 0) {
            console.log('[questRewardModule.js] ℹ️ No completed quests found for reward distribution');
            return { processed: 0, rewarded: 0, alreadyRewarded: 0, errors: 0 };
        }
        
        console.log(`[questRewardModule.js] 📋 Found ${completedQuests.length} completed quests to process`);
        
        let totalProcessed = 0;
        let totalRewarded = 0;
        let totalAlreadyRewarded = 0;
        let totalErrors = 0;
        
        for (const quest of completedQuests) {
            try {
                const result = await processQuestMonthlyRewards(quest);
                totalProcessed += result.processed;
                totalRewarded += result.rewarded;
                totalAlreadyRewarded += result.alreadyRewarded || 0;
                totalErrors += result.errors;
            } catch (error) {
                console.error(`[questRewardModule.js] ❌ Error processing quest ${quest.questID}:`, error);
                totalErrors++;
            }
        }
        
        console.log(`[questRewardModule.js] ✅ Monthly reward distribution completed - Processed: ${totalProcessed}, Rewarded: ${totalRewarded}, Already Rewarded: ${totalAlreadyRewarded}, Errors: ${totalErrors}`);
        
        return {
            processed: totalProcessed,
            rewarded: totalRewarded,
            alreadyRewarded: totalAlreadyRewarded,
            errors: totalErrors
        };
        
    } catch (error) {
        handleError(error, 'questRewardModule.js');
        console.error('[questRewardModule.js] ❌ Error in monthly reward distribution:', error);
        throw error;
    }
}

// ------------------- Process Individual Quest Monthly Rewards ------------------
async function processQuestMonthlyRewards(quest) {
    try {
        const participants = Array.from(quest.participants.values());
        let processed = 0;
        let rewarded = 0;
        let errors = 0;
        let alreadyRewarded = 0;
        
        for (const participant of participants) {
            try {
                // Enhanced reward status checking to prevent double-rewarding
                const rewardStatus = getParticipantRewardStatus(participant);
                
                if (rewardStatus === 'already_rewarded') {
                    alreadyRewarded++;
                    console.log(`[questRewardModule.js] ℹ️ Participant ${participant.characterName} already rewarded (${participant.progress})`);
                } else if (rewardStatus === 'needs_rewarding') {
                    const rewardResult = await distributeParticipantMonthlyRewards(quest, participant);
                    
                    if (rewardResult.success) {
                        // Mark as rewarded with comprehensive tracking
                        participant.progress = 'rewarded';
                        participant.rewardedAt = new Date();
                        participant.tokensEarned = rewardResult.tokensAdded;
                        participant.itemsEarned = rewardResult.itemsAdded || [];
                        participant.rewardProcessed = true; // Additional safety flag
                        participant.lastRewardCheck = new Date();
                        participant.rewardSource = 'monthly'; // Track how they were rewarded
                        rewarded++;
                        console.log(`[questRewardModule.js] ✅ Rewarded ${participant.characterName} for quest ${quest.questID}`);
                    } else {
                        console.error(`[questRewardModule.js] ❌ Failed to reward ${participant.characterName}: ${rewardResult.error}`);
                        errors++;
                    }
                } else {
                    console.log(`[questRewardModule.js] ℹ️ Participant ${participant.characterName} doesn't need rewarding (${rewardStatus})`);
                }
                
                processed++;
            } catch (error) {
                console.error(`[questRewardModule.js] ❌ Error processing participant ${participant.characterName}:`, error);
                errors++;
            }
        }
        
        // Save the quest with updated participant data
        await quest.save();
        
        console.log(`[questRewardModule.js] 📊 Quest ${quest.questID} monthly processing: ${processed} processed, ${rewarded} rewarded, ${alreadyRewarded} already rewarded, ${errors} errors`);
        
        return { processed, rewarded, alreadyRewarded, errors };
        
    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error processing quest monthly rewards for ${quest.questID}:`, error);
        throw error;
    }
}

// ------------------- Get Participant Reward Status ------------------
function getParticipantRewardStatus(participant) {
    // Check if already fully rewarded
    if (participant.progress === 'rewarded' || participant.rewardProcessed === true) {
        return 'already_rewarded';
    }
    
    // Check if has tokens earned (indicates previous reward)
    if (participant.tokensEarned > 0) {
        return 'already_rewarded';
    }
    
    // Check if completed but not rewarded
    if (participant.progress === 'completed') {
        return 'needs_rewarding';
    }
    
    // Check if has items earned (indicates previous reward)
    if (participant.itemsEarned && participant.itemsEarned.length > 0) {
        return 'already_rewarded';
    }
    
    // Not completed yet
    return 'not_completed';
}

// ------------------- Validate Quest Reward Status ------------------
async function validateQuestRewardStatus(questId) {
    try {
        const quest = await Quest.findOne({ questID: questId });
        if (!quest) {
            return { error: 'Quest not found' };
        }

        const participants = Array.from(quest.participants.values());
        const validation = {
            questId: quest.questID,
            questTitle: quest.title,
            questStatus: quest.status,
            totalParticipants: participants.length,
            participants: []
        };

        for (const participant of participants) {
            const rewardStatus = getParticipantRewardStatus(participant);
            validation.participants.push({
                characterName: participant.characterName,
                progress: participant.progress,
                tokensEarned: participant.tokensEarned,
                itemsEarned: participant.itemsEarned,
                rewardProcessed: participant.rewardProcessed,
                rewardSource: participant.rewardSource,
                rewardedAt: participant.rewardedAt,
                lastRewardCheck: participant.lastRewardCheck,
                status: rewardStatus
            });
        }

        return validation;
    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error validating quest reward status:`, error);
        return { error: error.message };
    }
}

// ------------------- Distribute Participant Monthly Rewards ------------------
async function distributeParticipantMonthlyRewards(quest, participant) {
    try {
        const results = {
            success: true,
            errors: [],
            tokensAdded: 0,
            itemsAdded: []
        };

        // Calculate token reward
        const tokensToAward = quest.getNormalizedTokenReward();
        
        if (tokensToAward > 0) {
            const tokenResult = await distributeTokens(participant.userId, tokensToAward);
            if (tokenResult.success) {
                results.tokensAdded = tokenResult.tokensAdded;
            } else {
                results.errors.push(tokenResult.error);
            }
        }

        // Distribute item rewards
        if (quest.itemReward && quest.itemRewardQty > 0) {
            const itemResult = await distributeItems(quest, participant);
            if (itemResult.success) {
                results.itemsAdded = itemResult.itemsAdded;
            } else {
                results.errors.push(itemResult.error);
            }
        }

        if (results.errors.length > 0) {
            results.success = false;
            results.error = results.errors.join('; ');
        }

        return results;

    } catch (error) {
        return {
            success: false,
            error: error.message,
            errors: [error.message]
        };
    }
}

// ------------------- Get Quest Reward Summary ------------------
async function getQuestRewardSummary() {
    try {
        const completedQuests = await Quest.find({
            status: 'completed'
        });
        
        let totalParticipants = 0;
        let completedParticipants = 0;
        let rewardedParticipants = 0;
        let disqualifiedParticipants = 0;
        
        for (const quest of completedQuests) {
            const participants = Array.from(quest.participants.values());
            totalParticipants += participants.length;
            
            for (const participant of participants) {
                if (participant.progress === 'completed') completedParticipants++;
                if (participant.progress === 'rewarded') rewardedParticipants++;
                if (participant.progress === 'disqualified') disqualifiedParticipants++;
            }
        }
        
        return {
            totalQuests: completedQuests.length,
            totalParticipants,
            completedParticipants,
            rewardedParticipants,
            disqualifiedParticipants,
            pendingRewards: completedParticipants - rewardedParticipants
        };
        
    } catch (error) {
        console.error('[questRewardModule.js] ❌ Error getting reward summary:', error);
        return null;
    }
}

// ============================================================================
// ------------------- Art Quest Completion from Submission -------------------
// ============================================================================

// ------------------- Process Art Quest Completion from Submission ------------------
async function processArtQuestCompletionFromSubmission(submissionData, userId) {
    try {
        console.log(`[questRewardModule.js] 🎨 Processing art quest completion for user ${userId}`);
        
        const questID = submissionData.questEvent;
        if (!questID || questID === 'N/A') {
            console.log(`[questRewardModule.js] ℹ️ No quest ID in submission data`);
            return { success: false, reason: 'No quest ID' };
        }
        
        // Find the quest
        const quest = await Quest.findOne({ questID });
        if (!quest) {
            console.log(`[questRewardModule.js] ⚠️ Quest ${questID} not found`);
            return { success: false, reason: 'Quest not found' };
        }
        
        // Check if quest is active
        if (quest.status !== 'active') {
            console.log(`[questRewardModule.js] ⚠️ Quest ${questID} is not active (status: ${quest.status})`);
            return { success: false, reason: 'Quest not active' };
        }
        
        // Complete the quest for this participant
        const completionResult = await quest.completeFromArtSubmission(userId, submissionData);
        
        if (!completionResult.success) {
            console.log(`[questRewardModule.js] ❌ Failed to complete art quest: ${completionResult.reason || completionResult.error}`);
            return completionResult;
        }
        
        // Check if the entire quest should be completed
        const autoCompletionResult = await quest.checkAutoCompletion();
        
        if (autoCompletionResult.completed && autoCompletionResult.needsRewardProcessing) {
            console.log(`[questRewardModule.js] ✅ Quest ${questID} completed: ${autoCompletionResult.reason}`);
            
            // Process quest completion and distribute rewards
            await processQuestCompletion(questID);
            
            // Mark completion as processed to prevent duplicates
            await quest.markCompletionProcessed();
        }
        
        return { success: true, questCompleted: autoCompletionResult.completed };
        
    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error processing art quest completion:`, error);
        return { success: false, error: error.message };
    }
}

// ------------------- Process Writing Quest Completion from Submission ------------------
async function processWritingQuestCompletionFromSubmission(submissionData, userId) {
    try {
        console.log(`[questRewardModule.js] 📝 Processing writing quest completion for user ${userId}`);
        
        const questID = submissionData.questEvent;
        if (!questID || questID === 'N/A') {
            console.log(`[questRewardModule.js] ℹ️ No quest ID in submission data`);
            return { success: false, reason: 'No quest ID' };
        }
        
        // Find the quest
        const quest = await Quest.findOne({ questID });
        if (!quest) {
            console.log(`[questRewardModule.js] ⚠️ Quest ${questID} not found`);
            return { success: false, reason: 'Quest not found' };
        }
        
        // Check if quest is active
        if (quest.status !== 'active') {
            console.log(`[questRewardModule.js] ⚠️ Quest ${questID} is not active (status: ${quest.status})`);
            return { success: false, reason: 'Quest not active' };
        }
        
        // Complete the quest for this participant
        const completionResult = await quest.completeFromWritingSubmission(userId, submissionData);
        
        if (!completionResult.success) {
            console.log(`[questRewardModule.js] ❌ Failed to complete writing quest: ${completionResult.reason || completionResult.error}`);
            return completionResult;
        }
        
        // Check if the entire quest should be completed
        const autoCompletionResult = await quest.checkAutoCompletion();
        
        if (autoCompletionResult.completed && autoCompletionResult.needsRewardProcessing) {
            console.log(`[questRewardModule.js] ✅ Quest ${questID} completed: ${autoCompletionResult.reason}`);
            
            // Process quest completion and distribute rewards
            await processQuestCompletion(questID);
            
            // Mark completion as processed to prevent duplicates
            await quest.markCompletionProcessed();
        }
        
        return { success: true, questCompleted: autoCompletionResult.completed };
        
    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error processing writing quest completion:`, error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
    processQuestCompletion,
    processParticipantReward,
    distributeRewards,
    markQuestAsCompleted,
    manuallyCompleteQuest,
    getQuestStatus,
    processRPQuestCompletion,
    processMonthlyQuestRewards,
    processQuestMonthlyRewards,
    distributeParticipantMonthlyRewards,
    getQuestRewardSummary,
    processArtQuestCompletionFromSubmission,
    processWritingQuestCompletionFromSubmission,
    validateQuestRewardStatus,
    getParticipantRewardStatus
};
