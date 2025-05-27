// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const { handleError } = require('../utils/globalErrorHandler');
const { saveToStorage, retrieveFromStorage } = require('../utils/storage');
const { generateUniqueId } = require('../utils/uniqueIdUtils');
const { calculateFinalValue } = require('./rngModule');
const { processBattle } = require('./encounterModule');
const { EmbedBuilder } = require('discord.js');
const { getVillageEmojiByName } = require('./locationsModule');
const { capitalizeVillageName } = require('../utils/stringUtils');

// ============================================================================
// ---- Constants ----
// ============================================================================
const RAID_DURATION = 15 * 60 * 1000; // 15 minutes in milliseconds
const VILLAGE_DAMAGE_MULTIPLIER = 0.1; // 10% of monster's max health as village damage
const THREAD_AUTO_ARCHIVE_DURATION = 60; // 60 minutes (minimum allowed by Discord)

// ============================================================================
// ---- Utility: canCreateThread ----
// Checks if a thread can be created in the interaction's channel
function canCreateThread(interaction) {
  const channel = interaction.channel;
  // Discord.js v13+: GUILD_TEXT = 0, GUILD_NEWS = 5, or use string types
  return channel && (channel.type === 0 || channel.type === 5 || channel.type === 'GUILD_TEXT' || channel.type === 'GUILD_NEWS');
}

// ============================================================================
// ---- Raid Functions ----
// ============================================================================

// ---- Function: createOrUpdateRaidThread ----
// Creates or updates a Discord thread for raid communication
async function createOrUpdateRaidThread(interaction, raidData, monsterImage) {
  try {
    if (!canCreateThread(interaction)) {
      console.warn(`[raidModule.js]: ⚠️ Cannot create thread: Not a guild text/news channel`);
      return { thread: null };
    }
    const villageName = capitalizeVillageName(raidData.villageId);
    const emoji = raidData.isBloodMoon ? '🔴' : '🛡️';
    const threadName = `${emoji} ${villageName} - ${raidData.monster.name} (Tier ${raidData.monster.tier})`;

    // Create the thread
    const thread = await interaction.fetchReply().then(message =>
      message.startThread({
        name: threadName,
        autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
        reason: `Raid initiated against ${raidData.monster.name}`
      })
    );

    // Create the initial thread message
    const threadMessage = [
      `👋 A raid has been initiated against **${raidData.monster.name} (Tier ${raidData.monster.tier})**!`,
      `\n@${villageName} resident @visiting:${villageName} — come help defend your home!`,
      `\nUse \`/raid ${raidData.battleId} <character>\` to join the fight!`
    ].join('');

    // Send only the text message to the thread (no embed)
    await thread.send(threadMessage);
    return { thread };
  } catch (error) {
    console.error(`[raidModule.js]: ❌ Error creating raid thread: ${error.message}`);
    return { thread: null };
  }
}

// ---- Function: archiveRaidThread ----
// Archives a raid thread when the raid ends
async function archiveRaidThread(thread) {
  try {
    if (thread && !thread.archived) {
      await thread.setArchived(true);
      console.log(`[raidModule.js]: 📦 Archived raid thread ${thread.name}`);
    }
  } catch (error) {
    handleError(error, 'raidModule.js');
    console.error(`[raidModule.js]: ❌ Error archiving raid thread:`, error);
  }
}

// ---- Function: startRaid ----
// Creates a new raid instance with the given monster and village
async function startRaid(monster, villageId, interaction = null) {
  try {
    // Generate unique raid ID with 'R' prefix for Raid
    const raidId = generateUniqueId('R');
    
    // Use monster's actual hearts value
    const monsterHearts = {
      max: monster.hearts,
      current: monster.hearts
    };

    // Create raid object
    const raidData = {
      battleId: raidId,
      monster: {
        name: monster.name,
        nameMapping: monster.nameMapping,
        image: monster.image,
        tier: monster.tier,
        hearts: monsterHearts
      },
      progress: 'A new raid has begun!',
      isBloodMoon: false,
      startTime: Date.now(),
      villageId: villageId,
      status: 'active',
      participants: [],
      analytics: {
        totalDamage: 0,
        participantCount: 0,
        averageDamagePerParticipant: 0,
        monsterTier: monster.tier,
        villageId: villageId,
        success: false,
        startTime: new Date(),
        endTime: null,
        duration: null
      },
      timestamps: {
        started: Date.now(),
        lastUpdated: Date.now()
      }
    };

    // Save raid to storage
    await saveToStorage(raidId, 'battle', raidData);

    console.log(`[raidModule.js]: 🐉 Started new raid ${raidId} - ${monster.name} (T${monster.tier}) in ${villageId}`);
    
    // Create thread if interaction is provided
    let thread = null;
    if (interaction) {
      thread = await createOrUpdateRaidThread(interaction, raidData, monster.image);
    }
    
    return {
      raidId,
      raidData,
      thread
    };
  } catch (error) {
    handleError(error, 'raidModule.js');
    console.error(`[raidModule.js]: ❌ Error starting raid:`, error);
    throw error;
  }
}

// ---- Function: joinRaid ----
// Allows a character to join an active raid after validation checks
async function joinRaid(character, raidId) {
  try {
    // Retrieve raid data
    const raidData = await retrieveFromStorage(raidId, 'battle');
    if (!raidData) {
      console.error(`[raidModule.js]: ❌ Raid ${raidId} not found`);
      throw new Error('Raid not found');
    }

    // Check if raid is active
    if (raidData.status !== 'active') {
      console.error(`[raidModule.js]: ❌ Raid ${raidId} is not active (status: ${raidData.status})`);
      throw new Error('Raid is not active');
    }

    // Check if character is KO'd
    if (character.ko) {
      console.error(`[raidModule.js]: ❌ Character ${character.name} is KO'd and cannot join raid`);
      throw new Error('Character is KO\'d and cannot join raid');
    }

    // Check if character is in the same village
    if (character.currentVillage.toLowerCase() !== raidData.villageId.toLowerCase()) {
      console.error(`[raidModule.js]: ❌ Character ${character.name} is not in the same village as the raid`);
      throw new Error('Character must be in the same village as the raid');
    }

    // Check if user already has a character in the raid
    const existingParticipant = raidData.participants.find(p => p.userId === character.userId);
    if (existingParticipant) {
      console.error(`[raidModule.js]: ❌ User already has character ${existingParticipant.name} in raid ${raidId}`);
      throw new Error('You already have a character in this raid');
    }

    // Create participant data
    const participant = {
      userId: character.userId,
      characterId: character._id,
      name: character.name,
      damage: 0,
      joinedAt: Date.now(),
      characterState: {
        currentHearts: character.currentHearts,
        maxHearts: character.maxHearts,
        currentStamina: character.currentStamina,
        maxStamina: character.maxStamina,
        attack: character.attack,
        defense: character.defense,
        gearArmor: character.gearArmor,
        gearWeapon: character.gearWeapon,
        gearShield: character.gearShield,
        ko: character.ko
      },
      battleStats: {
        damageDealt: 0,
        healingDone: 0,
        buffsApplied: [],
        debuffsReceived: [],
        lastAction: new Date()
      }
    };

    // Add participant to raid
    raidData.participants.push(participant);
    raidData.analytics.participantCount = raidData.participants.length;
    raidData.timestamps.lastUpdated = Date.now();

    // Save updated raid data
    await saveToStorage(raidId, 'battle', raidData);

    console.log(`[raidModule.js]: 👤 ${character.name} joined raid ${raidId}`);
    
    return {
      raidId,
      raidData,
      participant
    };
  } catch (error) {
    handleError(error, 'raidModule.js');
    console.error(`[raidModule.js]: ❌ Error joining raid:`, error);
    throw error;
  }
}

// ---- Function: processRaidTurn ----
// Processes a single turn in a raid for a character
async function processRaidTurn(character, raidId, interaction, raidData = null) {
  try {
    // Use provided raidData or fetch from storage
    if (!raidData) {
      raidData = await retrieveFromStorage(raidId, 'battle');
    }
    if (!raidData) {
      console.error(`[raidModule.js]: ❌ Raid ${raidId} not found`);
      throw new Error('Raid not found');
    }

    // Check if raid is active
    if (raidData.status !== 'active') {
      console.error(`[raidModule.js]: ❌ Raid ${raidId} is not active (status: ${raidData.status})`);
      throw new Error('Raid is not active');
    }

    // Find participant
    const participant = raidData.participants.find(p => p.characterId === character._id);
    if (!participant) {
      console.error(`[raidModule.js]: ❌ Character ${character.name} is not in raid ${raidId}`);
      throw new Error('Character is not in this raid');
    }

    // Check if character is KO'd
    if (character.ko) {
      console.error(`[raidModule.js]: ❌ Character ${character.name} is KO'd and cannot take turns`);
      throw new Error('Character is KO\'d and cannot take turns');
    }

    // Generate random roll and calculate final value
    const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);

    // Process the battle turn
    const battleResult = await processBattle(
      character,
      raidData.monster,
      raidId,
      damageValue,
      interaction
    );

    if (!battleResult) {
      throw new Error('Failed to process battle turn');
    }

    // Update participant's battle stats
    participant.battleStats.damageDealt += battleResult.hearts;
    participant.battleStats.lastAction = new Date();
    participant.damage += battleResult.hearts;

    // Update raid analytics
    raidData.analytics.totalDamage += battleResult.hearts;
    raidData.analytics.averageDamagePerParticipant = 
      raidData.analytics.totalDamage / raidData.analytics.participantCount;

    // Check if monster is defeated
    if (battleResult.monsterHearts.current <= 0) {
      raidData.status = 'completed';
      raidData.analytics.success = true;
      raidData.analytics.endTime = new Date();
      raidData.analytics.duration = raidData.analytics.endTime - raidData.analytics.startTime;
      raidData.progress = `The ${raidData.monster.name} has been defeated!`;
    }

    // Update timestamps
    raidData.timestamps.lastUpdated = Date.now();

    // Save updated raid data
    await saveToStorage(raidId, 'battle', raidData);

    console.log(`[raidModule.js]: ⚔️ ${character.name} completed turn in raid ${raidId}`);
    
    return {
      raidId,
      raidData,
      battleResult,
      participant
    };
  } catch (error) {
    handleError(error, 'raidModule.js');
    console.error(`[raidModule.js]: ❌ Error processing raid turn:`, error);
    throw error;
  }
}

// ---- Function: checkRaidExpiration ----
// Checks if a raid has expired and handles the timeout consequences
async function checkRaidExpiration(raidId) {
  try {
    // Retrieve raid data
    const raidData = await retrieveFromStorage(raidId, 'battle');
    if (!raidData) {
      console.error(`[raidModule.js]: ❌ Raid ${raidId} not found`);
      throw new Error('Raid not found');
    }

    // Skip if raid is already completed or timed out
    if (raidData.status !== 'active') {
      return raidData;
    }

    const currentTime = Date.now();
    const raidStartTime = raidData.timestamps.started;
    const timeElapsed = currentTime - raidStartTime;

    // Check if raid has expired
    if (timeElapsed >= RAID_DURATION) {
      console.log(`[raidModule.js]: ⏰ Raid ${raidId} has expired after ${timeElapsed / 1000}s`);

      // Calculate village damage based on monster's max health
      const monsterMaxHealth = raidData.monster.hearts.max;
      const villageDamage = Math.floor(monsterMaxHealth * VILLAGE_DAMAGE_MULTIPLIER);

      // Update raid status and analytics
      raidData.status = 'timed_out';
      raidData.analytics.success = false;
      raidData.analytics.endTime = new Date();
      raidData.analytics.duration = timeElapsed;
      raidData.analytics.villageDamage = villageDamage;
      raidData.progress = `The raid has timed out! The ${raidData.monster.name} has escaped and caused ${villageDamage} damage to the village!`;

      // Update timestamps
      raidData.timestamps.lastUpdated = currentTime;

      // Save updated raid data
      await saveToStorage(raidId, 'battle', raidData);

      // Archive the thread if it exists
      if (raidData.thread) {
        await archiveRaidThread(raidData.thread);
      }

      console.log(`[raidModule.js]: 💥 Raid ${raidId} timed out - Village took ${villageDamage} damage`);
    }

    return raidData;
  } catch (error) {
    handleError(error, 'raidModule.js');
    console.error(`[raidModule.js]: ❌ Error checking raid expiration:`, error);
    throw error;
  }
}

// ---- Function: createRaidEmbed ----
// Creates an embed for displaying raid information
function createRaidEmbed(raidData, monsterImage) {
  const villageName = capitalizeVillageName(raidData.villageId);
  const villageEmoji = getVillageEmojiByName(raidData.villageId) || '';

  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🛡️ Village Raid!')
    .setDescription(
      `**${raidData.monster.name} has been spotted in ${villageName}!**\n` +
      `*It's a Tier ${raidData.monster.tier} monster! Protect the village!*\n\n` +
      `/raid to join or continue the raid!\n` +
      `/item to heal during the raid!`
    )
    .addFields(
      {
        name: `__${raidData.monster.name}__`,
        value: `💙 **Hearts:** ${raidData.monster.hearts.current}/${raidData.monster.hearts.max}\n⭐ **Tier:** ${raidData.monster.tier}`,
        inline: false
      },
      {
        name: `__Location__`,
        value: `${villageEmoji} ${villageName}`,
        inline: false
      },
      {
        name: `__Raid ID__`,
        value: `\u0060\u0060\u0060${raidData.battleId}\u0060\u0060\u0060`,
        inline: false
      }
    )
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border%20blood%20moon.png')
    .setTimestamp();

  // Restore monster image as thumbnail if available
  if (monsterImage && monsterImage !== 'No Image') {
    embed.setThumbnail(monsterImage);
  }

  return embed;
}

module.exports = {
  startRaid,
  joinRaid,
  processRaidTurn,
  checkRaidExpiration,
  createRaidEmbed,
  createOrUpdateRaidThread,
  archiveRaidThread
}; 