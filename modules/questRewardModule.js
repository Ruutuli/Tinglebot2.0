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
        if (participant.progress === 'rewarded') {
            return 'already_rewarded';
        }

        if (!meetsRequirements(participant, quest)) {
            console.log(`[questRewardModule.js] :warning: Participant ${participant.characterName} does not meet requirements for quest ${quest.questID}`);
            return 'requirements_not_met';
        }

        if (participant.progress !== 'completed') {
            participant.progress = 'completed';
            participant.completedAt = new Date();
        }

        const rewardResult = await distributeRewards(quest, participant);
        if (rewardResult.success) {
            updateParticipantRewardData(participant, quest, rewardResult);
            console.log(`[questRewardModule.js] :white_check_mark: Successfully rewarded participant ${participant.characterName} for quest ${quest.questID}`);
            return 'rewarded';
        } else {
            console.error(`[questRewardModule.js] :x: Failed to distribute rewards for ${participant.characterName}:`, rewardResult.error);
            return 'reward_failed';
        }

    } catch (error) {
        console.error(`[questRewardModule.js] :x: Error processing reward for participant ${participant.characterName}:`, error);
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
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
    processQuestCompletion,
    processParticipantReward,
    distributeRewards,
    markQuestAsCompleted,
    manuallyCompleteQuest,
    getQuestStatus,
    processRPQuestCompletion
};
