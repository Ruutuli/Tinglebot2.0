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

// ------------------- Storage Functions -------------------
const { 
  saveBattleProgressToStorage, 
  retrieveBattleProgressFromStorage, 
  deleteBattleProgressFromStorage 
} = require('../utils/storage.js');

// ------------------- Constants -------------------
const RAID_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds

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
    startTime: Date.now()
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
  const battleProgress = await getRaidProgressById(battleId);
  if (!battleProgress) return;

  battleProgress.monsterHearts.current = Math.max(battleProgress.monsterHearts.current - (outcome.hearts || 0), 0);
  battleProgress.progress += `\n${updatedProgress}`;
  
  try {
    await saveBattleProgressToStorage(battleId, battleProgress);
  } catch (err) {
    handleError(err, 'raidModule.js');
    console.error(`[raidModule.js]: ❌ Error updating raid progress for Battle ID "${battleId}":`, err);
    throw err;
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

// ---- Function: checkExpiredRaids ----
// Checks for any raid timers that have expired during downtime
async function checkExpiredRaids(client) {
  try {
    const now = Date.now();
    const raids = await RaidProgress.find({
      status: 'active',
      endTime: { $lte: now }
    });

    for (const raid of raids) {
      await applyVillageDamage(raid.villageName, raid.monster, raid.threadId);
      raid.status = 'completed';
      await raid.save();
    }

    console.log(`[raidModule.js]: ✅ Checked ${raids.length} expired raids`);
  } catch (error) {
    handleError(error, 'raidModule.js');
    console.error('[raidModule.js]: ❌ Error checking expired raids:', error.message);
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
    checkExpiredRaids
}; 