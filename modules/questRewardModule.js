// ============================================================================
// ------------------- questRewardModule.js -------------------
// Handles automatic quest reward distribution and completion processing
// ============================================================================

const Quest = require('../models/QuestModel');
const Character = require('../models/CharacterModel');
const User = require('../models/UserModel');
const { handleError } = require('../utils/globalErrorHandler');

// ------------------- Quest Completion Processing -------------------
async function processQuestCompletion(questId) {
    try {
        const quest = await Quest.findOne({ questID: questId });
        if (!quest) {
            throw new Error(`Quest not found: ${questId}`);
        }

        if (quest.status !== 'active') {
            console.log(`[QUEST_REWARDS]: Quest ${questId} is not active, skipping completion processing.`);
            return;
        }

        console.log(`[QUEST_REWARDS]: Processing completion for quest: ${quest.title}`);

        // Get all participants from quest
        if (!quest.participantDetails || quest.participantDetails.length === 0) {
            console.log(`[QUEST_REWARDS]: No participants found for quest ${questId}`);
            return;
        }
        const participants = quest.participantDetails;

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
                console.error(`[QUEST_REWARDS]: Error processing participant ${participant.characterName}:`, error);
                errorCount++;
            }
        }

        // Check if all participants have been processed
        if (rewardedCount > 0 && rewardedCount === participants.length) {
            await markQuestAsCompleted(quest);
            console.log(`[QUEST_REWARDS]: Quest ${questId} marked as completed. All participants rewarded.`);
        }

        // Save quest with updated participant data
        await quest.save();

        console.log(`[QUEST_REWARDS]: Quest completion processing finished. Completed: ${completedCount}, Rewarded: ${rewardedCount}, Errors: ${errorCount}`);

    } catch (error) {
        handleError(error, 'questRewardModule.js');
        console.error(`[QUEST_REWARDS]: Error processing quest completion for ${questId}:`, error);
    }
}

// ------------------- Process Individual Participant Reward -------------------
async function processParticipantReward(quest, participant) {
    try {
        // Skip if already rewarded
        if (participant.progress === 'rewarded') {
            return 'already_rewarded';
        }

        // Check if participant meets requirements
        if (!participant.meetsRequirements(quest)) {
            console.log(`[QUEST_REWARDS]: Participant ${participant.characterName} does not meet requirements for quest ${quest.questID}`);
            return 'requirements_not_met';
        }

        // Mark as completed if not already
        if (participant.progress !== 'completed') {
            participant.progress = 'completed';
            participant.completedAt = new Date();
        }

        // Distribute rewards
        const rewardResult = await distributeRewards(quest, participant);
        if (rewardResult.success) {
            participant.progress = 'rewarded';
            participant.rewardedAt = new Date();
            participant.tokensEarned = quest.tokenReward;
            participant.itemsEarned = quest.itemReward ? [{ name: quest.itemReward, quantity: quest.itemRewardQty || 1 }] : [];

            console.log(`[QUEST_REWARDS]: Successfully rewarded participant ${participant.characterName} for quest ${quest.questID}`);
            return 'rewarded';
        } else {
            console.error(`[QUEST_REWARDS]: Failed to distribute rewards for ${participant.characterName}:`, rewardResult.error);
            return 'reward_failed';
        }

    } catch (error) {
        console.error(`[QUEST_REWARDS]: Error processing reward for participant ${participant.characterName}:`, error);
        return 'error';
    }
}

// ------------------- Distribute Quest Rewards -------------------
async function distributeRewards(quest, participant) {
    try {
        const results = {
            success: true,
            errors: [],
            tokensAdded: 0,
            itemsAdded: 0
        };

        // Add tokens to user
        if (quest.tokenReward > 0) {
            try {
                const user = await User.findOne({ discordId: participant.userId });
                if (user) {
                    user.tokens = (user.tokens || 0) + quest.tokenReward;
                    await user.save();
                    results.tokensAdded = quest.tokenReward;
                    console.log(`[QUEST_REWARDS]: Added ${quest.tokenReward} tokens to user ${participant.userId}`);
                } else {
                    results.errors.push(`User not found: ${participant.userId}`);
                }
            } catch (error) {
                results.errors.push(`Token distribution failed: ${error.message}`);
            }
        }

        // Add items to character inventory
        if (quest.itemReward && quest.itemRewardQty > 0) {
            try {
                const character = await Character.findOne({ 
                    name: participant.characterName, 
                    userId: participant.userId 
                });
                
                if (character) {
                    // Add item to character inventory
                    // Note: This assumes you have an inventory system in place
                    // You may need to adjust this based on your actual inventory implementation
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
                    results.itemsAdded = quest.itemRewardQty;
                    console.log(`[QUEST_REWARDS]: Added ${quest.itemRewardQty}x ${quest.itemReward} to character ${participant.characterName}`);
                } else {
                    results.errors.push(`Character not found: ${participant.characterName}`);
                }
            } catch (error) {
                results.errors.push(`Item distribution failed: ${error.message}`);
            }
        }

        // Check if any critical errors occurred
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

// ------------------- Mark Quest as Completed -------------------
async function markQuestAsCompleted(quest) {
    try {
        quest.status = 'completed';
        await quest.save();
        
        console.log(`[QUEST_REWARDS]: Quest ${quest.questID} marked as completed`);
        
        // Clean up quest role if it exists
        if (quest.roleID) {
            try {
                // Note: This would need to be called from a context where you have access to the guild
                // You might want to pass the guild as a parameter or handle this differently
                console.log(`[QUEST_REWARDS]: Quest role ${quest.roleID} should be deleted (requires guild context)`);
            } catch (error) {
                console.warn(`[QUEST_REWARDS]: Failed to clean up quest role:`, error);
            }
        }
        
    } catch (error) {
        console.error(`[QUEST_REWARDS]: Error marking quest as completed:`, error);
        throw error;
    }
}

// ------------------- Manual Quest Completion -------------------
async function manuallyCompleteQuest(questId, adminUserId) {
    try {
        const quest = await Quest.findOne({ questID: questId });
        if (!quest) {
            throw new Error(`Quest not found: ${questId}`);
        }

        if (quest.status === 'completed') {
            throw new Error(`Quest ${questId} is already completed`);
        }

        console.log(`[QUEST_REWARDS]: Admin ${adminUserId} manually completing quest ${questId}`);
        
        // Process completion
        await processQuestCompletion(questId);
        
        return { success: true, message: `Quest ${questId} manually completed` };
        
    } catch (error) {
        handleError(error, 'questRewardModule.js');
        return { success: false, error: error.message };
    }
}

// ------------------- Check Quest Status -------------------
async function getQuestStatus(questId) {
    try {
        const quest = await Quest.findOne({ questID: questId });
        if (!quest) {
            return { error: 'Quest not found' };
        }

        const participants = quest.participantDetails || [];
        
        const status = {
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

        return status;
        
    } catch (error) {
        handleError(error, 'questRewardModule.js');
        return { error: error.message };
    }
}

// ------------------- Export Functions -------------------
module.exports = {
    processQuestCompletion,
    processParticipantReward,
    distributeRewards,
    markQuestAsCompleted,
    manuallyCompleteQuest,
    getQuestStatus
};
