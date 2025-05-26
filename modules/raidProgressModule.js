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
async function updateRaidProgress(battleId, updateData) {
    try {
        console.log(`[raidProgressModule.js]: 🔄 Updating raid progress for ${battleId}:`, updateData);

        const battleProgress = await getRaidProgressById(battleId);
        if (!battleProgress) {
            throw new Error(`No battle progress found for ID: ${battleId}`);
        }

        // Update monster hearts if provided
        if (updateData.monsterHearts) {
            battleProgress.monster.hearts = {
                current: Number(updateData.monsterHearts.current) || 0,
                max: Number(updateData.monsterHearts.max) || battleProgress.monster.hearts.max
            };
        }

        // Update participant stats if provided
        if (updateData.participantId && updateData.participantStats) {
            const participant = battleProgress.participants.find(p => p.characterId === updateData.participantId);
            if (participant) {
                participant.battleStats = {
                    ...participant.battleStats,
                    ...updateData.participantStats,
                    lastAction: new Date()
                };
            }
        }

        // Update analytics
        if (updateData.damage) {
            battleProgress.analytics.totalDamage += updateData.damage;
            battleProgress.analytics.averageDamagePerParticipant = 
                battleProgress.analytics.totalDamage / battleProgress.analytics.participantCount;
        }

        // Update timestamps
        battleProgress.timestamps.lastUpdated = Date.now();

        // Save updated progress
        await saveBattleProgressToStorage(battleId, battleProgress);
        console.log(`[raidProgressModule.js]: ✅ Updated raid progress for ${battleId}`);

        return battleProgress;
    } catch (error) {
        handleError(error, 'raidProgressModule.js');
        console.error(`[raidProgressModule.js]: ❌ Error updating raid progress:`, error);
        throw error;
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
async function handleRaidCompletion(battleId, isVictory) {
    try {
        console.log(`[raidProgressModule.js]: 🎉 Handling raid completion for ${battleId}, victory: ${isVictory}`);

        const battleProgress = await getRaidProgressById(battleId);
        if (!battleProgress) {
            throw new Error(`No battle progress found for ID: ${battleId}`);
        }

        // Update raid status
        battleProgress.status = isVictory ? 'completed' : 'failed';
        
        // Update analytics
        battleProgress.analytics.success = isVictory;
        battleProgress.analytics.endTime = new Date();
        battleProgress.analytics.duration = 
            battleProgress.analytics.endTime - battleProgress.analytics.startTime;

        // Calculate final stats
        const finalStats = {
            totalDamage: battleProgress.analytics.totalDamage,
            participantCount: battleProgress.analytics.participantCount,
            averageDamagePerParticipant: battleProgress.analytics.averageDamagePerParticipant,
            duration: battleProgress.analytics.duration,
            success: isVictory
        };

        console.log(`[raidProgressModule.js]: 📊 Final raid stats:`, finalStats);

        // Save final state
        await saveBattleProgressToStorage(battleId, battleProgress);

        // Process rewards if victorious
        if (isVictory) {
            await processRaidRewards(battleProgress);
        }

        return finalStats;
    } catch (error) {
        handleError(error, 'raidProgressModule.js');
        console.error(`[raidProgressModule.js]: ❌ Error handling raid completion:`, error);
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
        const raidDuration = now - battleProgress.startTime;
        const isExpired = raidDuration > RAID_DURATION;

        if (isExpired && battleProgress.status === 'active') {
            console.log(`[raidProgressModule.js]: ⚠️ Raid ${battleId} has expired`);
            battleProgress.status = 'timeout';
            
            // Update analytics
            battleProgress.analytics.endTime = new Date();
            battleProgress.analytics.duration = raidDuration;
            battleProgress.analytics.success = false;
            
            await saveBattleProgressToStorage(battleId, battleProgress);
            await handleRaidTimeout(battleProgress);
        }

        return isExpired;
    } catch (error) {
        handleError(error, 'raidProgressModule.js');
        console.error(`[raidProgressModule.js]: ❌ Error checking raid expiration:`, error);
        return true;
    }
}

// ------------------- Handle Raid Timeout -------------------
async function handleRaidTimeout(battleProgress) {
    try {
        console.log(`[raidProgressModule.js]: ⏰ Handling raid timeout for ${battleProgress.battleId}`);

        // Apply village damage
        await applyVillageDamage(battleProgress.villageId, battleProgress.monster);

        // Send notifications
        await sendRaidTimeoutNotifications(battleProgress);

        // Update analytics
        battleProgress.analytics.success = false;
        battleProgress.analytics.endTime = new Date();
        battleProgress.analytics.duration = 
            battleProgress.analytics.endTime - battleProgress.analytics.startTime;

        // Save final state
        await saveBattleProgressToStorage(battleProgress.battleId, battleProgress);

        console.log(`[raidProgressModule.js]: ✅ Raid timeout handled for ${battleProgress.battleId}`);
    } catch (error) {
        handleError(error, 'raidProgressModule.js');
        console.error(`[raidProgressModule.js]: ❌ Error handling raid timeout:`, error);
        throw error;
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