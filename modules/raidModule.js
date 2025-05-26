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

// Define RaidProgress Schema
const raidProgressSchema = new mongoose.Schema({
    villageId: {
        type: String,
        required: true,
        index: true
    },
    startTime: {
        type: Date,
        required: true,
        default: Date.now
    },
    endTime: {
        type: Date,
        required: true,
        validate: {
            validator: function(v) {
                return v > this.startTime;
            },
            message: 'End time must be after start time'
        }
    },
    status: {
        type: String,
        enum: ['active', 'completed', 'failed', 'timeout'],
        default: 'active',
        index: true
    },
    damage: {
        type: Number,
        min: 0,
        default: 0
    },
    participants: {
        type: [{
            userId: {
                type: String,
                required: true
            },
            characterName: {
                type: String,
                required: true
            },
            damage: {
                type: Number,
                min: 0,
                default: 0
            },
            joinedAt: {
                type: Date,
                default: Date.now
            }
        }],
        validate: {
            validator: function(v) {
                return v.length <= 10; // Maximum 10 participants
            },
            message: 'Maximum 10 participants allowed'
        }
    },
    monsterHearts: {
        current: {
            type: Number,
            required: true,
            min: 0
        },
        max: {
            type: Number,
            required: true,
            min: 0
        }
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    retryCount: {
        type: Number,
        default: 0,
        max: 3
    }
});

// Add indexes for common queries
raidProgressSchema.index({ status: 1, endTime: 1 });
raidProgressSchema.index({ 'participants.userId': 1 });

// Add methods for state management
raidProgressSchema.methods.isExpired = function() {
    return Date.now() > this.endTime;
};

raidProgressSchema.methods.canJoin = function(userId) {
    return this.status === 'active' && 
           !this.isExpired() && 
           this.participants.length < 10 &&
           !this.participants.some(p => p.userId === userId);
};

// Add static methods for common operations
raidProgressSchema.statics.findActiveRaids = function() {
    return this.find({
        status: 'active',
        endTime: { $gt: new Date() }
    });
};

raidProgressSchema.statics.findExpiredRaids = function() {
    return this.find({
        status: 'active',
        endTime: { $lte: new Date() }
    });
};

// Create RaidProgress model
const RaidProgress = mongoose.model('RaidProgress', raidProgressSchema);

// Add raid analytics tracking
const raidAnalyticsSchema = new mongoose.Schema({
    raidId: {
        type: String,
        required: true,
        index: true
    },
    metrics: {
        totalDamage: Number,
        averageDamagePerParticipant: Number,
        completionTime: Number,
        participantCount: Number,
        monsterTier: Number,
        villageId: String,
        success: Boolean
    },
    timestamps: {
        started: Date,
        completed: Date,
        lastAction: Date
    },
    actions: [{
        type: String,
        timestamp: Date,
        userId: String,
        action: String,
        damage: Number
    }]
});

// Add rate limiting
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

// Create models
const RaidAnalytics = mongoose.model('RaidAnalytics', raidAnalyticsSchema);
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

// Add raid analytics tracking
async function trackRaidAnalytics(battleProgress, action) {
    try {
        const analytics = await RaidAnalytics.findOne({ raidId: battleProgress.battleId }) || 
            new RaidAnalytics({ raidId: battleProgress.battleId });

        analytics.actions.push({
            type: 'action',
            timestamp: new Date(),
            userId: action.userId,
            action: action.type,
            damage: action.damage || 0
        });

        // Update metrics
        analytics.metrics.totalDamage = battleProgress.participants.reduce((sum, p) => sum + p.damage, 0);
        analytics.metrics.averageDamagePerParticipant = analytics.metrics.totalDamage / battleProgress.participants.length;
        analytics.metrics.participantCount = battleProgress.participants.length;
        analytics.metrics.monsterTier = battleProgress.tier;
        analytics.metrics.villageId = battleProgress.villageId;
        analytics.metrics.success = battleProgress.status === 'completed';

        if (battleProgress.status === 'completed') {
            analytics.timestamps.completed = new Date();
            analytics.metrics.completionTime = 
                analytics.timestamps.completed - analytics.timestamps.started;
        }

        await analytics.save();
    } catch (error) {
        console.error(`[raidModule.js]: ❌ Error tracking raid analytics:`, error);
    }
}

// ============================================================================
// Raid Battle Progress Functions
// ============================================================================

// ------------------- Store Raid Progress -------------------
async function storeRaidProgress(character, monster, tier, monsterHearts, progress) {
  const battleId = generateUniqueId('R'); // 'R' prefix for Raid battles
  
  const battleData = {
    battleId,
    characters: [character],
    monster: monster.name,
    tier: tier,
    monsterHearts: {
      max: monster.hearts,
      current: monsterHearts.current,
    },
    progress: progress ? `\n${progress}` : '',
    isBloodMoon: false,
    startTime: Date.now(),
    villageId: character.currentVillage // Add the village ID where the raid is taking place
  };

  try {
    await saveBattleProgressToStorage(battleId, battleData);
  } catch (err) {
    handleError(err, 'raidModule.js');
    console.error(`[raidModule.js]: ❌ Error storing raid progress for Battle ID "${battleId}":`, err);
    throw err;
  }
  return battleId;
}

// ------------------- Get Raid Progress by ID -------------------
async function getRaidProgressById(battleId) {
  try {
    const battleProgress = await retrieveBattleProgressFromStorage(battleId);
    if (!battleProgress) {
      console.error(`[raidModule.js]: ❌ Error - No raid progress found for Battle ID: ${battleId}`);
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
        console.log(`[raidModule.js]: 🔄 Starting raid progress update for battle ${battleId}`, {
            hasOutcome: !!outcome,
            hasCharacter: !!outcome?.character,
            hasUserId: !!outcome?.character?.userId,
            hearts: outcome?.hearts
        });

        const battleProgress = await getRaidProgressById(battleId);
        if (!battleProgress) {
            console.error(`[raidModule.js]: ❌ No battle progress found for ID: ${battleId}`);
            return null;
        }

        console.log(`[raidModule.js]: 📊 Current battle progress:`, {
            hasMonsterHearts: !!battleProgress.monsterHearts,
            currentHearts: battleProgress.monsterHearts?.current,
            maxHearts: battleProgress.monsterHearts?.max,
            status: battleProgress.status
        });

        // Validate outcome and character data
        if (!outcome?.character?.userId) {
            console.error(`[raidModule.js]: ❌ Invalid outcome data - missing userId`, {
                outcome,
                hasCharacter: !!outcome?.character,
                userId: outcome?.character?.userId
            });
            return null;
        }

        // Check rate limit with validated data
        try {
            console.log(`[raidModule.js]: 🔄 Checking rate limit for user ${outcome.character.userId}`);
            await checkRateLimit(outcome.character.userId, battleProgress.villageId);
        } catch (rateLimitError) {
            console.warn(`[raidModule.js]: ⚠️ Rate limit check failed: ${rateLimitError.message}`);
            // Continue with the update even if rate limit check fails
        }

        // Validate monster hearts
        if (!battleProgress.monsterHearts) {
            console.log(`[raidModule.js]: 🔄 Initializing monsterHearts for battle ${battleId}`, {
                monsterHearts: outcome.character?.monster?.hearts
            });
            battleProgress.monsterHearts = {
                current: outcome.character?.monster?.hearts || 0,
                max: outcome.character?.monster?.hearts || 0
            };
        }

        // Ensure valid monster hearts state
        if (typeof battleProgress.monsterHearts.current !== 'number' || 
            typeof battleProgress.monsterHearts.max !== 'number' ||
            battleProgress.monsterHearts.current < 0 ||
            battleProgress.monsterHearts.max < battleProgress.monsterHearts.current) {
            console.error(`[raidModule.js]: ❌ Invalid monsterHearts state for battle ${battleId}`, {
                current: battleProgress.monsterHearts.current,
                max: battleProgress.monsterHearts.max
            });
            return null;
        }

        // Update monster hearts with validation
        const newCurrent = Math.max(0, battleProgress.monsterHearts.current - (outcome.hearts || 0));
        console.log(`[raidModule.js]: 💥 Updating monster hearts`, {
            oldCurrent: battleProgress.monsterHearts.current,
            damage: outcome.hearts,
            newCurrent
        });
        
        battleProgress.monsterHearts.current = newCurrent;
        battleProgress.progress += `\n${updatedProgress}`;
        battleProgress.lastUpdated = new Date();

        // Track analytics
        await trackRaidAnalytics(battleProgress, {
            userId: outcome.character.userId,
            type: 'damage',
            damage: outcome.hearts
        });

        // Check for raid completion
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
        
        // Implement retry logic with proper battleProgress reference
        const currentProgress = await getRaidProgressById(battleId);
        if (currentProgress && currentProgress.retryCount < 3) {
            currentProgress.retryCount++;
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
  } catch (error) {
    handleError(error, 'raidModule.js');
    console.error(`[raidModule.js]: ❌ Error deleting raid progress for Battle ID "${battleId}":`, error);
  }
}

// ============================================================================
// Raid Core Functions
// ============================================================================

// ------------------- Create Raid Embed -------------------
function createRaidEmbed(character, monster, battleId, isBloodMoon = false) {
    const monsterData = monsterMapping[monster.nameMapping] || {};
    const monsterImage = monsterData.image || monster.image;
    const villageName = capitalizeVillageName(character.currentVillage);

    const embed = new EmbedBuilder()
        .setTitle(isBloodMoon ? `🔴 **Blood Moon Raid initiated!**` : `🛡️ **Raid initiated!**`)
        .setDescription(
            `Use \`/raid id:${battleId}\` to join or continue the raid!\n` +
            `Use \`/item\` to heal during the raid!`
        )
        .addFields(
            { name: `__Monster Hearts__`, value: `💙 ${monster.hearts}/${monster.hearts}`, inline: false },
            { name: `__${character.name || 'Unknown Adventurer'} Hearts__`, value: `❤️ ${character.currentHearts}/${character.maxHearts}`, inline: false },
            { name: `__Battle ID__`, value: `\`\`\`${battleId}\`\`\``, inline: false }
        )
        .setAuthor({
            name: character.name || 'Unknown Adventurer',
            iconURL: character.icon || 'https://via.placeholder.com/100',
        })
        .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png')
        .setFooter({ text: `You have ${RAID_DURATION / 60000} minutes to complete this raid!` })
        .setColor(isBloodMoon ? '#FF4500' : '#FF0000');

    if (monsterImage && monsterImage.startsWith('http')) {
        embed.setThumbnail(monsterImage);
    }

    return embed;
}

// ------------------- Create or Update Raid Thread -------------------
async function createOrUpdateRaidThread(interaction, character, monster, embed, threadId = null, isBloodMoon = false) {
    try {
        let thread;
        if (!threadId) {
            const emoji = isBloodMoon ? '🔴' : '🛡️';
            const villageName = capitalizeVillageName(character.currentVillage);
            const threadName = `${emoji} ${villageName} - ${monster.name} (Tier ${monster.tier})`;
        
            await interaction.editReply({ embeds: [embed] });
        
            thread = await interaction.fetchReply().then((message) =>
                message.startThread({
                    name: threadName,
                    autoArchiveDuration: 1440,
                    reason: `Raid initiated for ${character.name} against ${monster.name}`,
                })
            );
        
            threadId = thread.id;
        
            const safeVillageName = villageName.replace(/\s+/g, '');
            const residentRole = `@${safeVillageName} resident`;
            const visitorRole = `@visiting:${safeVillageName}`;
        
            await thread.send(`👋 <@${interaction.user.id}> has initiated a raid against **${monster.name} (Tier ${monster.tier})**!\n\n${residentRole} ${visitorRole} — come help defend your home!`);
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
            console.error(`[raidModule.js]: Timer: Error during applyVillageDamage execution:`, error);
        }
    }, RAID_DURATION);
}

// ------------------- Trigger Raid -------------------
async function triggerRaid(character, monster, interaction, threadId, isBloodMoon) {
    // ------------------- Define Monster Hearts -------------------
    const monsterHearts = {
        max: monster.hearts,
        current: monster.hearts,
    };

    let battleId;

    // ------------------- Store Raid Progress -------------------
    try {
        battleId = await storeRaidProgress(
            character,
            monster,
            monster.tier,
            monsterHearts,
            isBloodMoon ? '🔴 Blood Moon Raid initiated!' : 'Raid initiated! Player turn next.'
        );
    } catch (error) {
        handleError(error, 'raidModule.js');
        console.error(`[raidModule.js]: triggerRaid: Failed to store raid progress: ${error.message}`);
        await interaction.followUp(`❌ **Failed to trigger the raid. Please try again later.**`);
        return;
    }

    // ------------------- Create Embed and Thread -------------------
    try {
        const embed = createRaidEmbed(character, monster, battleId, isBloodMoon);
        const thread = await createOrUpdateRaidThread(interaction, character, monster, embed, threadId, isBloodMoon);

        // ------------------- Schedule Timer for Village Damage -------------------
        const villageName = character.currentVillage || "Unknown Village";
        scheduleRaidTimer(villageName, monster, thread);

        return battleId;
    } catch (error) {
        handleError(error, 'raidModule.js');
        console.error(`[raidModule.js]: triggerRaid: Error creating raid: ${error.message}`);
        await interaction.followUp(`❌ **Failed to create the raid. Please try again later.**`);
        return null;
    }
}

// Add raid completion handler
async function handleRaidCompletion(battleProgress) {
    try {
        // Calculate rewards
        const rewards = calculateRaidRewards(battleProgress);
        
        // Distribute rewards to participants
        for (const participant of battleProgress.participants) {
            await distributeRewards(participant.userId, rewards);
        }
        
        // Update village status
        await updateVillageStatus(battleProgress.villageId, 'success');
        
        // Send notifications
        await sendRaidCompletionNotifications(battleProgress);
        
        console.log(`[raidModule.js]: ✅ Raid ${battleProgress.battleId} completed successfully`);
    } catch (error) {
        handleError(error, 'raidModule.js');
        console.error(`[raidModule.js]: ❌ Error handling raid completion:`, error);
    }
}

// Add timeout handler
async function handleRaidTimeout(battleProgress) {
    try {
        battleProgress.status = 'timeout';
        await saveBattleProgressToStorage(battleProgress.battleId, battleProgress);
        
        // Apply village damage
        await applyVillageDamage(battleProgress.villageId, battleProgress.damage);
        
        // Send notifications
        await sendRaidTimeoutNotifications(battleProgress);
        
        console.log(`[raidModule.js]: ⚠️ Raid ${battleProgress.battleId} timed out`);
    } catch (error) {
        handleError(error, 'raidModule.js');
        console.error(`[raidModule.js]: ❌ Error handling raid timeout:`, error);
    }
}

// ---- Function: checkExpiredRaids ----
// Checks for any raid timers that have expired during downtime
async function checkExpiredRaids(client) {
  try {
    const now = new Date();
    const expiredRaids = await RaidProgress.find({
      status: 'active',
      endTime: { $lte: now }
    });

    for (const raid of expiredRaids) {
      try {
        // Apply village damage
        const village = await Village.findOne({ _id: raid.villageId });
        if (village) {
          village.health = Math.max(0, village.health - raid.damage);
          await village.save();
        }

        // Update raid status
        raid.status = 'completed';
        await raid.save();

        // Send notification
        const channelId = process.env.RAID_NOTIFICATIONS_CHANNEL_ID;
        const channel = client.channels.cache.get(channelId);
        if (channel) {
          const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🏰 Raid Completed')
            .setDescription(`A raid on ${village.name} has completed.\nDamage dealt: ${raid.damage}`)
            .setTimestamp();

          await channel.send({ embeds: [embed] });
        }
      } catch (error) {
        console.error('[raidModule]: Error processing expired raid:', error);
      }
    }
  } catch (error) {
    console.error('[raidModule]: Error checking expired raids:', error);
  }
}

module.exports = {
    // Raid Battle Progress Functions
    storeRaidProgress,
    getRaidProgressById,
    updateRaidProgress,
    deleteRaidProgressById,

    // Core Raid Functions
    createRaidEmbed,
    createOrUpdateRaidThread,
    scheduleRaidTimer,
    triggerRaid,

    // Constants
    RAID_DURATION,
    checkExpiredRaids,
    RaidProgress,
    RaidAnalytics,
    RaidRateLimit,
    checkRateLimit,
    trackRaidAnalytics
}; 