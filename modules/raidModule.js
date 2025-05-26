// ------------------- raidModule.js -------------------
// This module centralizes raid-related functionality including embed creation,
// timer management, and thread handling for both random encounters and manual raids.
// -----------------------------------------------------------------------------------------

// ------------------- Import Necessary Modules and Services -------------------

// Discord.js imports
const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');

// Utility imports
const { handleError } = require('../utils/globalErrorHandler.js');
const { checkInventorySync } = require('../utils/characterUtils.js');
const { capitalizeVillageName } = require('../utils/stringUtils.js');
const { generateUniqueId } = require('../utils/uniqueIdUtils.js');

// Database and storage imports
const { fetchCharacterByNameAndUserId, fetchMonsterByName } = require('../database/db.js');
const { saveBattleProgressToStorage, retrieveBattleProgressFromStorage, deleteBattleProgressFromStorage } = require('../utils/storage.js');

// Module imports
const { processLoot } = require('../modules/lootModule.js');
const { applyVillageDamage } = require('./villageModule.js');
const { updateRaidProgress, getRaidProgressById, handleRaidCompletion } = require('./raidProgressModule.js');

// Model imports
const { monsterMapping } = require('../models/MonsterModel.js');

// Embed and text imports
const { createKOEmbed } = require('../embeds/embeds.js');
const { generateDamageMessage, generateVictoryMessage } = require('../modules/flavorTextModule.js');

// Database
const mongoose = require('mongoose');

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
  
  // Ensure we have valid heart values
  const maxHearts = Number(monster.hearts) || Number(monsterHearts?.max) || 1;
  const currentHearts = Number(monsterHearts?.current) || maxHearts;
  
  console.log(`[raidModule.js]: 📊 Detailed monster data received:`, {
    monster: {
      raw: monster,
      name: monster.name,
      tier: monster.tier,
      hearts: monster.hearts,
      nameMapping: monster.nameMapping
    },
    tierParam: tier,
    monsterHearts: monsterHearts,
    calculatedHearts: {
      max: maxHearts,
      current: currentHearts
    }
  });

  try {
    const battleData = {
      battleId,
      characters: [], // Empty array - characters will be added when they join
      monster: {
        name: monster.name,
        hearts: monsterHearts,
        tier: tier,
        raw: monster
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

// ------------------- Check Raid Expiration -------------------
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
function createRaidEmbed(raidData) {
    console.log(`[raidModule.js]: 🔍 Creating raid embed with data:`, {
        monster: raidData.monster,
        villageId: raidData.villageId
    });

    const monsterData = monsterMapping[raidData.monster.nameMapping] || {};
    const monsterImage = raidData.monster.image || monsterData.image;
    const villageName = capitalizeVillageName(raidData.villageId);

    const embed = new EmbedBuilder()
        .setTitle(raidData.isBloodMoon ? `🔴 **Blood Moon Raid!**` : `🛡️ **Village Raid!**`)
        .setDescription(
            `**A ${raidData.monster.name} has been spotted in ${villageName}!**\n` +
            `It's a Tier ${raidData.monster.tier} monster! Protect the village!\n\n` +
            `</raid:1372378305021607979> to join or continue the raid!\n` +
            `</item:1372378304773881879> to heal during the raid!`
        )
        .addFields(
            { 
                name: `__${raidData.monster.name}__`, 
                value: `💙 **Hearts:** ${raidData.monster.hearts.current}/${raidData.monster.hearts.max}\n⭐ **Tier:** ${raidData.monster.tier}`, 
                inline: false 
            },
            { 
                name: `__Location__`, 
                value: `🏘️ ${villageName}`, 
                inline: true 
            },
            {
                name: `__Raid ID__`,
                value: `\`\`\`${raidData.battleId}\`\`\``,
                inline: false
            }
        )
        .setColor(raidData.isBloodMoon ? 0xFF0000 : 0x00FF00)
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
async function triggerRaid(interaction, monster, villageId) {
    try {
        // Log initial state
        console.log(`[raidModule.js]: 🎯 Triggering raid with initial state:`, {
            monster: {
                name: monster.name,
                nameMapping: monster.nameMapping,
                hearts: monster.hearts,
                tier: monster.tier,
                image: monster.image
            },
            villageId
        });

        // Fetch complete monster data from database
        const dbMonster = await fetchMonsterByName(monster.name);
        console.log(`[raidModule.js]: 📥 Fetched monster data from database:`, {
            name: dbMonster.name,
            nameMapping: dbMonster.nameMapping,
            hearts: dbMonster.hearts,
            tier: dbMonster.tier,
            image: dbMonster.image
        });

        // Initialize monster hearts structure
        const monsterHearts = {
            max: Number(dbMonster.hearts?.max) || Number(dbMonster.hearts) || Number(monster.hearts?.max) || Number(monster.hearts) || 1,
            current: Number(dbMonster.hearts?.max) || Number(dbMonster.hearts) || Number(monster.hearts?.max) || Number(monster.hearts) || 1
        };

        // Validate hearts values
        if (monsterHearts.max < 1) {
            console.error(`[raidModule.js]: ❌ Invalid max hearts value:`, monsterHearts);
            throw new Error('Invalid max hearts value');
        }

        // Create raid data with new structure
        const raidData = {
            battleId: generateUniqueId('R'),
            monster: {
                name: dbMonster.name,
                nameMapping: dbMonster.nameMapping,
                image: dbMonster.image,
                tier: Number(dbMonster.tier) || Number(monster.tier) || 1,
                hearts: monsterHearts
            },
            villageId,
            status: 'active',
            startTime: Date.now(),
            participants: [],
            progress: '',
            isBloodMoon: false,
            analytics: {
                totalDamage: 0,
                participantCount: 0,
                averageDamagePerParticipant: 0,
                monsterTier: Number(dbMonster.tier) || Number(monster.tier) || 1,
                villageId: villageId,
                success: null,
                startTime: new Date(),
                endTime: null,
                duration: null
            },
            timestamps: {
                started: Date.now(),
                lastUpdated: Date.now()
            }
        };

        console.log(`[raidModule.js]: 📝 Created raid data:`, {
            battleId: raidData.battleId,
            monster: raidData.monster,
            villageId: raidData.villageId,
            status: raidData.status
        });

        // Save initial raid state
        await saveBattleProgressToStorage(raidData.battleId, raidData);

        // Create and send raid embed
        const raidEmbed = createRaidEmbed(raidData);
        const message = await interaction.channel.send({ embeds: [raidEmbed] });

        // Add join button
        const joinButton = new ButtonBuilder()
            .setCustomId(`join_raid_${raidData.battleId}`)
            .setLabel('Join Raid')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(joinButton);
        await message.edit({ embeds: [raidEmbed], components: [row] });

        console.log(`[raidModule.js]: ✅ Raid triggered successfully:`, {
            battleId: raidData.battleId,
            messageId: message.id,
            monster: raidData.monster
        });

        return raidData;
    } catch (error) {
        handleError(error, 'raidModule.js');
        console.error(`[raidModule.js]: ❌ Error triggering raid:`, error);
        throw error;
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