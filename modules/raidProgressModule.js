// ------------------- raidProgressModule.js -------------------
// This module handles raid progress updates and management.
// -----------------------------------------------------------------------------------------

// ------------------- Import Necessary Modules and Services -------------------

// Utility imports
const { handleError } = require('../utils/globalErrorHandler.js');

// Database and storage imports
const { saveBattleProgressToStorage } = require('../utils/storage.js');

// Database
const mongoose = require('mongoose');

// ------------------- Update Raid Progress -------------------
async function updateRaidProgress(battleId, updatedProgress, outcome) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const battleProgress = await getRaidProgressById(battleId);
        if (!battleProgress) {
            console.error(`[raidProgressModule.js]: ❌ No raid progress found for Battle ID: ${battleId}`);
            return null;
        }

        const participant = battleProgress.participants.find(p => p.characterId === outcome.character._id);
        if (participant) {
            const damageDealt = outcome.hearts || 0;
            participant.damage += damageDealt;

            const characterIndex = battleProgress.characters.findIndex(c => c._id === outcome.character._id);
            if (characterIndex !== -1) {
                battleProgress.characters[characterIndex] = {
                    ...battleProgress.characters[characterIndex],
                    currentHearts: outcome.character.currentHearts,
                    currentStamina: outcome.character.currentStamina,
                    buffs: outcome.character.buffs || [],
                    status: outcome.character.status || 'active'
                };
            }
        }

        // Initialize or update monster hearts with proper structure
        if (!battleProgress.monster.hearts || !battleProgress.monster.hearts.max) {
            console.log(`[raidProgressModule.js]: 🔄 Initializing monster hearts for battle ${battleId}`);
            const maxHearts = Number(outcome.character?.monster?.hearts) || 1;
            battleProgress.monster.hearts = {
                current: maxHearts,
                max: maxHearts
            };
        }

        // Ensure we have valid numbers for hearts
        const currentHearts = Number(battleProgress.monster.hearts.current) || 0;
        const maxHearts = Number(battleProgress.monster.hearts.max) || 1;

        if (currentHearts < 0 || maxHearts < currentHearts) {
            console.error(`[raidProgressModule.js]: ❌ Invalid monster hearts state for battle ${battleId}`, {
                current: currentHearts,
                max: maxHearts
            });
            return null;
        }

        const newCurrent = Math.max(0, currentHearts - (outcome.hearts || 0));
        console.log(`[raidProgressModule.js]: 💥 Updating monster hearts`, {
            oldCurrent: currentHearts,
            damage: outcome.hearts,
            newCurrent,
            maxHearts
        });
        
        // Update with clean structure, preserving max hearts
        battleProgress.monster.hearts = {
            current: newCurrent,
            max: maxHearts
        };
        
        battleProgress.progress += `\n${updatedProgress}`;
        battleProgress.timestamps.lastUpdated = new Date();

        if (newCurrent <= 0) {
            console.log(`[raidProgressModule.js]: 🎉 Raid completed for battle ${battleId}`);
            battleProgress.status = 'completed';
            await handleRaidCompletion(battleProgress);
        }

        console.log(`[raidProgressModule.js]: 💾 Saving updated battle progress`);
        await saveBattleProgressToStorage(battleId, battleProgress);
        await session.commitTransaction();
        
        return battleProgress;
    } catch (error) {
        await session.abortTransaction();
        handleError(error, 'raidProgressModule.js');
        console.error(`[raidProgressModule.js]: ❌ Error updating raid progress:`, error);
        return null;
    } finally {
        session.endSession();
    }
}

// ------------------- Get Raid Progress by ID -------------------
async function getRaidProgressById(battleId) {
    try {
        const battleProgress = await retrieveBattleProgressFromStorage(battleId);
        if (!battleProgress) {
            console.error(`[raidProgressModule.js]: ❌ No raid progress found for Battle ID: ${battleId}`);
            return null;
        }
        return battleProgress;
    } catch (error) {
        handleError(error, 'raidProgressModule.js');
        console.error(`[raidProgressModule.js]: ❌ Error retrieving raid progress for Battle ID "${battleId}":`, error);
        return null;
    }
}

// ------------------- Handle Raid Completion -------------------
async function handleRaidCompletion(battleProgress) {
    try {
        const rewards = calculateRaidRewards(battleProgress);
        battleProgress.rewards = rewards;

        for (const participant of battleProgress.participants) {
            await updateParticipantStats(participant, rewards);
        }

        await sendRaidCompletionNotifications(battleProgress);
        await saveBattleProgressToStorage(battleProgress.battleId, battleProgress);

        setTimeout(async () => {
            try {
                await deleteRaidProgressById(battleProgress.battleId);
                console.log(`[raidProgressModule.js]: 🧹 Cleaned up completed raid ${battleProgress.battleId}`);
            } catch (error) {
                console.error(`[raidProgressModule.js]: ❌ Error cleaning up raid ${battleProgress.battleId}:`, error);
            }
        }, 5 * 60 * 1000);

        return battleProgress;
    } catch (error) {
        handleError(error, 'raidProgressModule.js');
        console.error(`[raidProgressModule.js]: ❌ Error handling raid completion for ${battleProgress.battleId}:`, error);
        throw error;
    }
}

// ------------------- Calculate Raid Rewards -------------------
async function calculateRaidRewards(battleProgress) {
    const baseRewards = {
        items: []
    };

    const totalDamage = battleProgress.participants.reduce((sum, p) => sum + p.damage, 0);
    
    // Calculate rewards based on damage contribution
    for (const participant of battleProgress.participants) {
        const damageContribution = participant.damage / totalDamage;
        participant.rewards = {
            items: [] // Add item rewards logic here if needed
        };
    }

    return {
        baseRewards,
        participantRewards: battleProgress.participants.map(p => ({
            userId: p.userId,
            characterId: p.characterId,
            rewards: p.rewards
        }))
    };
}

// ------------------- Update Participant Stats -------------------
async function updateParticipantStats(participant, rewards) {
    try {
        const character = await Character.findById(participant.characterId);
        if (character) {
            await character.save();
        }
    } catch (error) {
        console.error(`[raidProgressModule.js]: ❌ Error updating stats for participant ${participant.characterId}:`, error);
    }
}

// ------------------- Send Raid Completion Notifications -------------------
async function sendRaidCompletionNotifications(battleProgress) {
    try {
        for (const participant of battleProgress.participants) {
            const rewards = battleProgress.rewards.participantRewards.find(r => r.characterId === participant.characterId);
            if (rewards) {
                const user = await client.users.fetch(participant.userId);
                if (user) {
                    await user.send({
                        embeds: [{
                            title: '🎉 Raid Completed!',
                            description: `You have successfully completed the raid against ${battleProgress.monster.name}!`,
                            fields: [
                                {
                                    name: 'Damage Dealt',
                                    value: `${participant.damage} hearts`
                                }
                            ],
                            color: 0x00ff00
                        }]
                    });
                }
            }
        }
    } catch (error) {
        console.error(`[raidProgressModule.js]: ❌ Error sending raid completion notifications:`, error);
    }
}

module.exports = {
    updateRaidProgress,
    getRaidProgressById,
    handleRaidCompletion
}; 