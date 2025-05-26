// ------------------- raidProgressModule.js -------------------
// This module handles raid progress updates and management.
// -----------------------------------------------------------------------------------------

// ------------------- Import Necessary Modules and Services -------------------

// Discord.js imports
const { EmbedBuilder } = require('discord.js');

// Utility imports
const { handleError } = require('../utils/globalErrorHandler.js');
const { checkInventorySync } = require('../utils/characterUtils.js');
const { saveBattleProgressToStorage, retrieveBattleProgressFromStorage, deleteBattleProgressFromStorage } = require('../utils/storage.js');
const { RAID_DURATION } = require('../config/config');

// Database and storage imports
const { fetchCharacterByNameAndUserId, fetchMonsterByName } = require('../database/db.js');

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
        // Validate update data
        if (!updateData || typeof updateData === 'string') {
            console.error(`[raidProgressModule.js]: ❌ Invalid update data received:`, updateData);
            return null;
        }

        console.log(`[raidProgressModule.js]: 🔄 Starting raid progress update for battle ${battleId}`, {
            updateType: updateData.type,
            hasHearts: !!updateData.hearts,
            hasDamage: !!updateData.damage,
            rawUpdate: JSON.stringify(updateData, null, 2)
        });

        // Get current battle progress
        const battleProgress = await retrieveBattleProgressFromStorage(battleId);
        if (!battleProgress) {
            console.error(`[raidProgressModule.js]: ❌ No battle progress found for ${battleId}`);
            return null;
        }

        console.log(`[raidProgressModule.js]: 📊 Current battle state:`, {
            battleId,
            monster: {
                name: battleProgress.monster?.name,
                hearts: JSON.stringify(battleProgress.monster?.hearts),
                tier: battleProgress.monster?.tier
            },
            status: battleProgress.status
        });

        // Update monster hearts if provided
        if (updateData.hearts !== undefined || updateData.monster?.hearts) {
            console.log(`[raidProgressModule.js]: ❤️ Processing heart update:`, {
                updateDataHearts: updateData.hearts,
                updateDataMonsterHearts: JSON.stringify(updateData.monster?.hearts),
                currentBattleHearts: JSON.stringify(battleProgress.monster?.hearts)
            });

            // Get current heart values
            const currentHearts = Math.max(0, Number(battleProgress.monster?.hearts?.current || 0));
            const maxHearts = Math.max(1, Number(battleProgress.monster?.hearts?.max || 1));

            // Calculate damage
            let damage = 0;
            if (typeof updateData.hearts === 'number') {
                damage = Math.max(0, updateData.hearts);
            } else if (updateData.monster?.hearts) {
                // Handle malformed heart data
                if (updateData.monster.hearts.max && typeof updateData.monster.hearts.max === 'object') {
                    // If max is an object, use its current value as damage
                    damage = Math.max(0, Number(updateData.monster.hearts.max.current || 0));
                } else {
                    // Otherwise use the direct hearts value
                    damage = Math.max(0, Number(updateData.monster.hearts.current || 0));
                }
            }

            const newCurrentHearts = Math.max(0, currentHearts - damage);

            console.log(`[raidProgressModule.js]: ❤️ Heart calculation details:`, {
                currentHearts,
                maxHearts,
                damage,
                newCurrentHearts,
                updateDataHearts: updateData.hearts,
                updateDataMonsterHearts: JSON.stringify(updateData.monster?.hearts)
            });

            // Only update if we have valid values
            if (maxHearts > 0) {
                const oldHearts = JSON.stringify(battleProgress.monster.hearts);
                battleProgress.monster.hearts = {
                    current: newCurrentHearts,
                    max: maxHearts
                };

                console.log(`[raidProgressModule.js]: ✅ Updated monster hearts:`, {
                    monster: battleProgress.monster.name,
                    oldHearts,
                    newHearts: JSON.stringify(battleProgress.monster.hearts),
                    updateSource: updateData.hearts !== undefined ? 'direct' : 'monster'
                });
            } else {
                console.error(`[raidProgressModule.js]: ❌ Invalid max hearts value: ${maxHearts}`, {
                    updateData: JSON.stringify(updateData),
                    battleProgress: JSON.stringify(battleProgress.monster)
                });
                return null;
            }
        }

        // Update participant stats if provided
        if (updateData.participantStats) {
            console.log(`[raidProgressModule.js]: 👥 Updating participant stats:`, {
                participantId: updateData.participantStats.userId,
                damage: updateData.participantStats.damage,
                currentHearts: JSON.stringify(battleProgress.monster.hearts)
            });

            const participantIndex = battleProgress.participants.findIndex(
                p => p.userId === updateData.participantStats.userId
            );

            if (participantIndex === -1) {
                battleProgress.participants.push({
                    ...updateData.participantStats,
                    lastAction: Date.now()
                });
            } else {
                battleProgress.participants[participantIndex] = {
                    ...battleProgress.participants[participantIndex],
                    ...updateData.participantStats,
                    lastAction: Date.now()
                };
            }
        }

        // Update analytics
        if (updateData.damage) {
            console.log(`[raidProgressModule.js]: 📊 Updating analytics:`, {
                currentTotalDamage: battleProgress.analytics?.totalDamage,
                newDamage: updateData.damage,
                currentHearts: JSON.stringify(battleProgress.monster.hearts)
            });

            battleProgress.analytics = {
                ...battleProgress.analytics,
                totalDamage: (battleProgress.analytics?.totalDamage || 0) + updateData.damage,
                participantCount: battleProgress.participants.length,
                averageDamagePerParticipant: battleProgress.participants.length > 0 
                    ? ((battleProgress.analytics?.totalDamage || 0) + updateData.damage) / battleProgress.participants.length 
                    : 0
            };
        }

        // Update last modified timestamp
        battleProgress.timestamps.lastUpdated = Date.now();

        // Verify heart values before saving
        if (!battleProgress.monster?.hearts?.max || battleProgress.monster.hearts.max < 1) {
            console.error(`[raidProgressModule.js]: ❌ Invalid heart values before save:`, {
                hearts: JSON.stringify(battleProgress.monster.hearts),
                updateData: JSON.stringify(updateData)
            });
            return null;
        }

        console.log(`[raidProgressModule.js]: 🔄 Saving updated battle progress:`, {
            battleId,
            monster: {
                name: battleProgress.monster.name,
                hearts: JSON.stringify(battleProgress.monster.hearts)
            },
            participantCount: battleProgress.participants.length,
            totalDamage: battleProgress.analytics?.totalDamage
        });

        // Save updated progress
        const updatedProgress = await saveBattleProgressToStorage(battleId, battleProgress);
        
        if (!updatedProgress) {
            console.error(`[raidProgressModule.js]: ❌ Failed to save updated battle progress for ${battleId}`);
            return null;
        }

        // Verify heart values after saving
        if (!updatedProgress.monster?.hearts?.max || updatedProgress.monster.hearts.max < 1) {
            console.error(`[raidProgressModule.js]: ❌ Heart values corrupted during save:`, {
                originalHearts: JSON.stringify(battleProgress.monster.hearts),
                savedHearts: JSON.stringify(updatedProgress.monster.hearts),
                updateData: JSON.stringify(updateData)
            });
            return null;
        }

        console.log(`[raidProgressModule.js]: ✅ Successfully updated battle progress:`, {
            battleId,
            monster: {
                name: updatedProgress.monster.name,
                hearts: JSON.stringify(updatedProgress.monster.hearts)
            },
            updateData: JSON.stringify(updateData)
        });

        return updatedProgress;
    } catch (error) {
        console.error(`[raidProgressModule.js]: ❌ Error updating raid progress:`, {
            error: error.message,
            updateData: JSON.stringify(updateData)
        });
        return null;
    }
}

// ------------------- Repair Invalid Battle Progress -------------------
async function repairBattleProgress(battleProgress, battleId) {
    try {
        console.log(`[raidProgressModule.js]: 🔧 Attempting to repair battle progress for ${battleId}`);
        
        // Handle nested raw objects
        if (battleProgress.raw?.raw) {
            console.log(`[raidProgressModule.js]: 🔧 Found nested raw objects, flattening structure`);
            battleProgress = {
                ...battleProgress.raw.raw,
                monster: battleProgress.monster || battleProgress.raw.raw.monster,
                villageId: battleProgress.villageId || battleProgress.raw.raw.villageId
            };
        }

        // Set default village if missing
        if (!battleProgress.villageId) {
            battleProgress.villageId = 'rudania'; // Default to Rudania
            console.log(`[raidProgressModule.js]: 🔧 Repaired missing villageId for ${battleId}`);
        }

        // Ensure participants array exists
        if (!battleProgress.participants) {
            battleProgress.participants = [];
            console.log(`[raidProgressModule.js]: 🔧 Added missing participants array for ${battleId}`);
        }

        // Ensure analytics object exists
        if (!battleProgress.analytics) {
            battleProgress.analytics = {
                totalDamage: 0,
                participantCount: 0,
                averageDamagePerParticipant: 0,
                startTime: Date.now(),
                endTime: null,
                duration: null,
                success: null
            };
            console.log(`[raidProgressModule.js]: 🔧 Added missing analytics object for ${battleId}`);
        }

        // Ensure timestamps object exists
        if (!battleProgress.timestamps) {
            battleProgress.timestamps = {
                started: Date.now(),
                lastUpdated: Date.now()
            };
            console.log(`[raidProgressModule.js]: 🔧 Added missing timestamps object for ${battleId}`);
        }

        // Save repaired progress
        await saveBattleProgressToStorage(battleId, battleProgress);
        console.log(`[raidProgressModule.js]: ✅ Successfully repaired battle progress for ${battleId}`);
        
        return battleProgress;
    } catch (error) {
        handleError(error, 'raidProgressModule.js');
        console.error(`[raidProgressModule.js]: ❌ Error repairing battle progress for ${battleId}:`, error);
        return null;
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

        // Validate and repair required fields
        if (!battleProgress.villageId) {
            console.log(`[raidProgressModule.js]: ⚠️ Attempting to repair invalid battle progress for ${battleId}`);
            const repairedProgress = await repairBattleProgress(battleProgress, battleId);
            if (!repairedProgress) {
                console.error(`[raidProgressModule.js]: ❌ Failed to repair battle progress for ${battleId}`);
                return null;
            }
            return repairedProgress;
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
    checkRaidExpiration,
    repairBattleProgress
}; 