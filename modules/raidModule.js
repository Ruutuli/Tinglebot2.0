// ------------------- raidModule.js -------------------
// This module centralizes raid-related functionality including embed creation,
// timer management, and thread handling for both random encounters and manual raids.
// -----------------------------------------------------------------------------------------

const { EmbedBuilder } = require('discord.js');
const { handleError } = require('../utils/globalErrorHandler');
const { monsterMapping } = require('../models/MonsterModel');
const { applyVillageDamage } = require('./villageModule');
const { capitalizeVillageName } = require('../utils/stringUtils');
const { generateUniqueId } = require('../utils/uniqueIdUtils');
const mongoose = require('mongoose');

// ------------------- Storage Functions -------------------
const { 
  saveBattleProgressToStorage, 
  retrieveBattleProgressFromStorage, 
  deleteBattleProgressFromStorage 
} = require('../utils/storage.js');

// ------------------- Constants -------------------
const RAID_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

// Rate Limit Schema
const raidRateLimitSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    villageId: {
        type: String,
        required: true,
        index: true
    },
    lastRaidTime: Date,
    raidCount: {
        type: Number,
        default: 0
    },
    cooldownEnds: Date
});

// Create model
const RaidRateLimit = mongoose.model('RaidRateLimit', raidRateLimitSchema);

// Add rate limiting middleware
async function checkRateLimit(userId, villageId) {
    const now = Date.now();
    const rateLimit = await RaidRateLimit.findOne({ userId, villageId });
    
    if (rateLimit && rateLimit.cooldownEnds > now) {
        throw new Error(`Rate limit exceeded. Try again in ${Math.ceil((rateLimit.cooldownEnds - now) / 1000)} seconds`);
    }
    
    if (!rateLimit) {
        await RaidRateLimit.create({
            userId,
            villageId,
            lastRaidTime: now,
            raidCount: 1,
            cooldownEnds: new Date(now + 3600000) // 1 hour cooldown
        });
    } else {
        rateLimit.raidCount++;
        rateLimit.lastRaidTime = now;
        rateLimit.cooldownEnds = new Date(now + 3600000);
        await rateLimit.save();
    }
}

// ============================================================================
// ---- Raid Battle Progress Functions ----
// Handles raid progress tracking and management
// ============================================================================

// ------------------- Store Raid Progress -------------------
async function storeRaidProgress(monster, tier, monsterHearts, progress, villageId) {
  const battleId = generateUniqueId('R');
  
  console.log(`[raidModule.js]: 📊 Detailed monster data received:`, {
    monster: {
      raw: monster,
      name: monster.name,
      tier: monster.tier,
      hearts: monster.hearts,
      nameMapping: monster.nameMapping
    },
    tierParam: tier,
    monsterHearts: monsterHearts
  });

  try {
    const battleData = {
      battleId,
      characters: [], // Empty array - characters will be added when they join
      monster: {
        name: monster.name,
        tier: monster.tier || tier,
        hearts: {
          max: monster.hearts,
          current: monsterHearts.current
        }
      },
      progress: progress ? `\n${progress}` : '',
      isBloodMoon: false,
      startTime: Date.now(),
      villageId: villageId,
      status: 'active',
      participants: [], // Empty array - participants will be added when they join
      timestamps: {
        started: Date.now(),
        lastUpdated: Date.now()
      }
    };

    console.log(`[raidModule.js]: 📊 Battle data being saved:`, {
      battleId,
      monster: battleData.monster,
      monsterHearts: battleData.monster.hearts,
      tier: battleData.monster.tier
    });

    await saveBattleProgressToStorage(battleId, battleData);
    console.log(`[raidModule.js]: ✅ Stored raid progress for Battle ID "${battleId}"`);
    return battleId;
  } catch (err) {
    handleError(err, 'raidModule.js');
    console.error(`[raidModule.js]: ❌ Error storing raid progress for Battle ID "${battleId}":`, err);
    throw err;
  }
}

// ------------------- Get Raid Progress by ID -------------------
async function getRaidProgressById(battleId) {
  try {
    const battleProgress = await retrieveBattleProgressFromStorage(battleId);
    if (!battleProgress) {
      console.error(`[raidModule.js]: ❌ No raid progress found for Battle ID: ${battleId}`);
      return null;
    }
    return battleProgress;
  } catch (error) {
    handleError(error, 'raidModule.js');
    console.error(`[raidModule.js]: ❌ Error retrieving raid progress for Battle ID "${battleId}":`, error);
    return null;
  }
}

// ------------------- Update Raid Progress -------------------
async function updateRaidProgress(battleId, updatedProgress, outcome) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const battleProgress = await getRaidProgressById(battleId);
        if (!battleProgress) {
            console.error(`[raidModule.js]: ❌ No raid progress found for Battle ID: ${battleId}`);
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

        if (!battleProgress.monster.hearts) {
            console.log(`[raidModule.js]: 🔄 Initializing monster hearts for battle ${battleId}`);
            battleProgress.monster.hearts = {
                current: outcome.character?.monster?.hearts || 0,
                max: outcome.character?.monster?.hearts || 0
            };
        }

        if (typeof battleProgress.monster.hearts.current !== 'number' || 
            typeof battleProgress.monster.hearts.max !== 'number' ||
            battleProgress.monster.hearts.current < 0 ||
            battleProgress.monster.hearts.max < battleProgress.monster.hearts.current) {
            console.error(`[raidModule.js]: ❌ Invalid monster hearts state for battle ${battleId}`, {
                current: battleProgress.monster.hearts.current,
                max: battleProgress.monster.hearts.max
            });
            return null;
        }

        const newCurrent = Math.max(0, battleProgress.monster.hearts.current - (outcome.hearts || 0));
        console.log(`[raidModule.js]: 💥 Updating monster hearts`, {
            oldCurrent: battleProgress.monster.hearts.current,
            damage: outcome.hearts,
            newCurrent
        });
        
        battleProgress.monster.hearts.current = newCurrent;
        battleProgress.progress += `\n${updatedProgress}`;
        battleProgress.timestamps.lastUpdated = new Date();

        if (newCurrent <= 0) {
            console.log(`[raidModule.js]: 🎉 Raid completed for battle ${battleId}`);
            battleProgress.status = 'completed';
            await handleRaidCompletion(battleProgress);
        }

        console.log(`[raidModule.js]: 💾 Saving updated battle progress`);
        await saveBattleProgressToStorage(battleId, battleProgress);
        await session.commitTransaction();
        
        return battleProgress;
    } catch (error) {
        await session.abortTransaction();
        handleError(error, 'raidModule.js');
        console.error(`[raidModule.js]: ❌ Error updating raid progress for Battle ID "${battleId}":`, error);
        
        const currentProgress = await getRaidProgressById(battleId);
        if (currentProgress && currentProgress.retryCount < 3) {
            currentProgress.retryCount = (currentProgress.retryCount || 0) + 1;
            console.log(`[raidModule.js]: 🔄 Retrying update (attempt ${currentProgress.retryCount})`);
            return updateRaidProgress(battleId, updatedProgress, outcome);
        }
        
        throw error;
    } finally {
        session.endSession();
    }
}

// ------------------- Delete Raid Progress -------------------
async function deleteRaidProgressById(battleId) {
  try {
    await deleteBattleProgressFromStorage(battleId);
    console.log(`[raidModule.js]: ✅ Deleted raid progress for Battle ID "${battleId}"`);
  } catch (error) {
    handleError(error, 'raidModule.js');
    console.error(`[raidModule.js]: ❌ Error deleting raid progress for Battle ID "${battleId}":`, error);
  }
}

// Add this new function to check raid expiration
async function checkRaidExpiration(battleId) {
  try {
    const battleProgress = await getRaidProgressById(battleId);
    if (!battleProgress) {
      console.error(`[raidModule.js]: ❌ No raid progress found for Battle ID: ${battleId}`);
      return true;
    }

    const now = Date.now();
    const isExpired = now > battleProgress.endTime;

    if (isExpired && battleProgress.status === 'active') {
      console.log(`[raidModule.js]: ⚠️ Raid ${battleId} has expired`);
      battleProgress.status = 'timeout';
      await saveBattleProgressToStorage(battleId, battleProgress);
      await handleRaidTimeout(battleProgress);
    }

    return isExpired;
  } catch (error) {
    handleError(error, 'raidModule.js');
    console.error(`[raidModule.js]: ❌ Error checking raid expiration for Battle ID "${battleId}":`, error);
    return true;
  }
}

// ============================================================================
// ---- Core Raid Functions ----
// Handles raid initialization and management
// ============================================================================

// ------------------- Create Raid Embed -------------------
function createRaidEmbed(monster, battleId, isBloodMoon = false, villageId) {
    console.log(`[raidModule.js]: 🔍 Creating raid embed with data:`, {
        monster: {
            name: monster.name,
            hearts: monster.hearts,
            tier: monster.tier,
            image: monsterMapping[monster.nameMapping]?.image || monster.image
        },
        villageId
    });

    const monsterData = monsterMapping[monster.nameMapping] || {};
    const monsterImage = monsterData.image || monster.image;
    const villageName = capitalizeVillageName(villageId);

    const embed = new EmbedBuilder()
        .setTitle(isBloodMoon ? `🔴 **Blood Moon Raid!**` : `🛡️ **Village Raid!**`)
        .setDescription(
            `**A ${monster.name} has been spotted in ${villageName}!**\n` +
            `It's a Tier ${monster.tier} monster! Protect the village!\n\n` +
            `</raid:1372378305021607979> to join or continue the raid!\n` +
            `</item:1372378304773881879> to heal during the raid!`
        )
        .addFields(
            { 
                name: `__${monster.name}__`, 
                value: `💙 **Hearts:** ${monster.hearts}/${monster.hearts}\n⭐ **Tier:** ${monster.tier}`, 
                inline: false 
            },
            { 
                name: `__Location__`, 
                value: `🏘️ ${villageName}`, 
                inline: true 
            },
            {
                name: `__Raid ID__`,
                value: `\`\`\`${battleId}\`\`\``,
                inline: false
            }
        )
        .setColor(isBloodMoon ? 0xFF0000 : 0x00FF00)
        .setTimestamp();

    if (monsterImage) {
        embed.setThumbnail(monsterImage);
    }

    return embed;
}

// ------------------- Create or Update Raid Thread -------------------
async function createOrUpdateRaidThread(interaction, monster, embed, threadId = null, isBloodMoon = false, villageId) {
    try {
        let thread;
        if (!threadId) {
            const emoji = isBloodMoon ? '🔴' : '🛡️';
            const villageName = capitalizeVillageName(villageId);
            const threadName = `${emoji} ${villageName} - ${monster.name} (Tier ${monster.tier})`;
        
            await interaction.editReply({ embeds: [embed] });
        
            thread = await interaction.fetchReply().then((message) =>
                message.startThread({
                    name: threadName,
                    autoArchiveDuration: 1440,
                    reason: `Raid initiated against ${monster.name}`,
                })
            );
        
            threadId = thread.id;
        
            const safeVillageName = villageName.replace(/\s+/g, '');
            const residentRole = `@${safeVillageName} resident`;
            const visitorRole = `@visiting:${safeVillageName}`;
        
            await thread.send(`👋 A raid has been initiated against **${monster.name} (Tier ${monster.tier})**!\n\n${residentRole} ${visitorRole} — come help defend your home!`);
        } else {
            thread = interaction.guild.channels.cache.get(threadId);
            if (!thread) {
                throw new Error(`Thread not found for ID: ${threadId}`);
            }
            await thread.send({ embeds: [embed] });
        }
        return thread;
    } catch (error) {
        handleError(error, 'raidModule.js');
        console.error(`[raidModule.js]: ❌ Error creating/updating raid thread:`, error);
        throw error;
    }
}

// ------------------- Schedule Raid Timer -------------------
function scheduleRaidTimer(villageName, monster, thread) {
    const capitalizedVillageName = capitalizeVillageName(villageName);
    setTimeout(async () => {
        try {
            await applyVillageDamage(capitalizedVillageName, monster, thread);
        } catch (error) {
            handleError(error, 'raidModule.js');
            console.error(`[raidModule.js]: ❌ Error during applyVillageDamage execution:`, error);
        }
    }, RAID_DURATION);
}

// ------------------- Trigger Raid -------------------
async function triggerRaid(monster, interaction, threadId, isBloodMoon, villageId) {
    // Get full monster data from mapping
    const monsterKey = Object.keys(monsterMapping).find(key => 
        monsterMapping[key].name === monster.name
    );
    
    const fullMonsterData = monsterKey ? monsterMapping[monsterKey] : null;
    
    console.log(`[raidModule.js]: 🚀 Triggering raid with detailed data:`, {
        monster: {
            raw: monster,
            name: monster.name,
            nameMapping: monsterKey,
            fullData: fullMonsterData
        },
        isBloodMoon,
        villageId
    });

    if (!fullMonsterData) {
        console.error(`[raidModule.js]: ❌ Could not find monster data for ${monster.name}`);
        throw new Error(`Invalid monster: ${monster.name}`);
    }

    const monsterHearts = {
        max: fullMonsterData.hearts || 1,
        current: fullMonsterData.hearts || 1,
    };

    console.log(`[raidModule.js]: 💙 Monster hearts object:`, monsterHearts);

    let battleId;

    try {
        battleId = await storeRaidProgress(
            {
                ...monster,
                nameMapping: monsterKey,
                hearts: fullMonsterData.hearts || 1,
                tier: fullMonsterData.tier || 1
            },
            fullMonsterData.tier || 1,
            monsterHearts,
            isBloodMoon ? '🔴 Blood Moon Raid initiated!' : 'Raid initiated! Join to participate.',
            villageId
        );

        const embed = createRaidEmbed({
            ...monster,
            hearts: fullMonsterData.hearts || 1,
            tier: fullMonsterData.tier || 1
        }, battleId, isBloodMoon, villageId);
        
        const thread = await createOrUpdateRaidThread(interaction, {
            ...monster,
            hearts: fullMonsterData.hearts || 1,
            tier: fullMonsterData.tier || 1
        }, embed, threadId, isBloodMoon, villageId);

        scheduleRaidTimer(villageId, {
            ...monster,
            hearts: fullMonsterData.hearts || 1,
            tier: fullMonsterData.tier || 1
        }, thread);

        return battleId;
    } catch (error) {
        handleError(error, 'raidModule.js');
        console.error(`[raidModule.js]: ❌ Error triggering raid:`, error);
        await interaction.followUp(`❌ **Failed to create the raid. Please try again later.**`);
        return null;
    }
}

// ---- Function: handleRaidCompletion ----
// Handles raid completion and reward distribution
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
                console.log(`[raidModule.js]: 🧹 Cleaned up completed raid ${battleProgress.battleId}`);
            } catch (error) {
                console.error(`[raidModule.js]: ❌ Error cleaning up raid ${battleProgress.battleId}:`, error);
            }
        }, 5 * 60 * 1000);

        return battleProgress;
    } catch (error) {
        handleError(error, 'raidModule.js');
        console.error(`[raidModule.js]: ❌ Error handling raid completion for ${battleProgress.battleId}:`, error);
        throw error;
    }
}

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

async function updateParticipantStats(participant, rewards) {
    try {
        const character = await Character.findById(participant.characterId);
        if (character) {
            await character.save();
        }
    } catch (error) {
        console.error(`[raidModule.js]: ❌ Error updating stats for participant ${participant.characterId}:`, error);
    }
}

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
        console.error(`[raidModule.js]: ❌ Error sending raid completion notifications:`, error);
    }
}

// ---- Function: handleRaidTimeout ----
// Handles raid timeout and cleanup
async function handleRaidTimeout(battleProgress) {
    try {
        battleProgress.status = 'timeout';
        await saveBattleProgressToStorage(battleProgress.battleId, battleProgress);
        
        await applyVillageDamage(battleProgress.villageId, battleProgress.damage);
        await sendRaidTimeoutNotifications(battleProgress);
        
        console.log(`[raidModule.js]: ⚠️ Raid ${battleProgress.battleId} timed out`);
    } catch (error) {
        handleError(error, 'raidModule.js');
        console.error(`[raidModule.js]: ❌ Error handling raid timeout:`, error);
    }
}

module.exports = {
    // Raid Battle Progress Functions
    storeRaidProgress,
    getRaidProgressById,
    updateRaidProgress,
    deleteRaidProgressById,
    checkRaidExpiration,

    // Core Raid Functions
    createRaidEmbed,
    createOrUpdateRaidThread,
    scheduleRaidTimer,
    triggerRaid,

    // Constants
    RAID_DURATION,
    RaidRateLimit,
    checkRateLimit
}; 