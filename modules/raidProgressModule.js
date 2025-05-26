// ------------------- raidProgressModule.js -------------------
// This module handles raid progress updates and management.
// -----------------------------------------------------------------------------------------

// ------------------- Import Necessary Modules and Services -------------------

// Discord.js imports
const { EmbedBuilder } = require('discord.js');

// Utility imports
const { handleError } = require('../utils/globalErrorHandler.js');
const { checkInventorySync } = require('../utils/characterUtils.js');

// Database and storage imports
const { fetchCharacterByNameAndUserId, fetchMonsterByName } = require('../database/db.js');
const { saveBattleProgressToStorage, retrieveBattleProgressFromStorage, deleteBattleProgressFromStorage } = require('../utils/storage.js');

// Module imports
const { processLoot } = require('../modules/lootModule.js');
const { applyVillageDamage } = require('./villageModule.js');

// Model imports
const { monsterMapping } = require('../models/MonsterModel.js');

// Embed and text imports
const { createKOEmbed } = require('../embeds/embeds.js');
const { generateDamageMessage, generateVictoryMessage } = require('../modules/flavorTextModule.js');

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

        // Log initial state
        console.log(`[raidProgressModule.js]: 📊 Initial battle state:`, {
            monsterHearts: battleProgress.monster.hearts,
            damage: outcome.hearts,
            status: battleProgress.status
        });

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

        // Validate and initialize monster hearts if needed
        if (!battleProgress.monster.hearts || typeof battleProgress.monster.hearts !== 'object') {
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

        // Validate hearts state
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

        // Log final state before saving
        console.log(`[raidProgressModule.js]: 📊 Final battle state before save:`, {
            monsterHearts: battleProgress.monster.hearts,
            status: battleProgress.status
        });

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

// ------------------- Check Raid Expiration -------------------
async function checkRaidExpiration(battleId) {
    try {
        const battleProgress = await getRaidProgressById(battleId);
        if (!battleProgress) {
            console.error(`[raidProgressModule.js]: ❌ No raid progress found for Battle ID: ${battleId}`);
            return true;
        }

        const now = Date.now();
        const isExpired = now > battleProgress.endTime;

        if (isExpired && battleProgress.status === 'active') {
            console.log(`[raidProgressModule.js]: ⚠️ Raid ${battleId} has expired`);
            battleProgress.status = 'timeout';
            await saveBattleProgressToStorage(battleId, battleProgress);
            await handleRaidTimeout(battleProgress);
        }

        return isExpired;
    } catch (error) {
        handleError(error, 'raidProgressModule.js');
        console.error(`[raidProgressModule.js]: ❌ Error checking raid expiration for Battle ID "${battleId}":`, error);
        return true;
    }
}

// ------------------- Handle Raid Timeout -------------------
async function handleRaidTimeout(battleProgress) {
    try {
        battleProgress.status = 'timeout';
        await saveBattleProgressToStorage(battleProgress.battleId, battleProgress);
        
        await applyVillageDamage(battleProgress.villageId, battleProgress.damage);
        await sendRaidTimeoutNotifications(battleProgress);
        
        console.log(`[raidProgressModule.js]: ⚠️ Raid ${battleProgress.battleId} timed out`);
    } catch (error) {
        handleError(error, 'raidProgressModule.js');
        console.error(`[raidProgressModule.js]: ❌ Error handling raid timeout:`, error);
    }
}

// ------------------- Send Raid Timeout Notifications -------------------
async function sendRaidTimeoutNotifications(battleProgress) {
    try {
        for (const participant of battleProgress.participants) {
            const user = await client.users.fetch(participant.userId);
            if (user) {
                await user.send({
                    embeds: [{
                        title: '⚠️ Raid Timed Out',
                        description: `The raid against ${battleProgress.monster.name} has timed out!`,
                        fields: [
                            {
                                name: 'Damage Dealt',
                                value: `${participant.damage} hearts`
                            }
                        ],
                        color: 0xFF0000
                    }]
                });
            }
        }
    } catch (error) {
        console.error(`[raidProgressModule.js]: ❌ Error sending raid timeout notifications:`, error);
    }
}

module.exports = {
    updateRaidProgress,
    getRaidProgressById,
    handleRaidCompletion,
    checkRaidExpiration
}; 