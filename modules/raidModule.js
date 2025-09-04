// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const { handleError } = require('../utils/globalErrorHandler');
const { generateUniqueId } = require('../utils/uniqueIdUtils');
const { calculateFinalValue, calculateRaidFinalValue } = require('./rngModule');
const { EmbedBuilder } = require('discord.js');
const { 
  getTier5EncounterOutcome,
  getTier6EncounterOutcome,
  getTier7EncounterOutcome,
  getTier8EncounterOutcome,
  getTier9EncounterOutcome,
  getTier10EncounterOutcome
} = require('./encounterModule');
const { getVillageEmojiByName } = require('./locationsModule');
const { capitalizeVillageName } = require('../utils/stringUtils');
const { monsterMapping } = require('../models/MonsterModel');
const Raid = require('../models/RaidModel');

// ============================================================================
// ---- Constants ----
// ============================================================================
// ---- Function: calculateRaidDuration ----
// Calculates raid duration based on monster tier
// Tier 5: 10 minutes, Tier 10: 20 minutes, scales linearly
function calculateRaidDuration(tier) {
  if (tier < 5) {
    return 10 * 60 * 1000; // 10 minutes for tiers below 5
  }
  if (tier > 10) {
    return 20 * 60 * 1000; // 20 minutes for tiers above 10
  }
  
  // Linear scaling: tier 5 = 10 minutes, tier 10 = 20 minutes
  const baseMinutes = 10;
  const minutesPerTier = (20 - 10) / (10 - 5); // 2 minutes per tier
  const additionalMinutes = (tier - 5) * minutesPerTier;
  const totalMinutes = baseMinutes + additionalMinutes;
  
  return totalMinutes * 60 * 1000; // Convert to milliseconds
}

const THREAD_AUTO_ARCHIVE_DURATION = 60; // 60 minutes (Discord allows: 1, 3, 7, 14, 30, 60, 1440 minutes)

// Village resident role IDs
const VILLAGE_RESIDENT_ROLES = {
  'Rudania': '907344585238409236',
  'Inariko': '907344454854266890', 
  'Vhintl': '907344092491554906'
};

// Village visiting role IDs
const VILLAGE_VISITING_ROLES = {
  'Rudania': '1379850030856405185',
  'Inariko': '1379850102486863924', 
  'Vhintl': '1379850161794056303'
};

// ============================================================================
// ---- Raid Battle Processing ----
// ============================================================================

// ---- Function: processRaidBattle ----
// Processes a raid battle turn using the encounter module's tier-specific logic
async function processRaidBattle(character, monster, diceRoll, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, characterHeartsBefore = null) {
  try {
    // Battle processing details logged only in debug mode

    let outcome;
    
    // ------------------- Mod Character 1-Hit KO Logic -------------------
    // Dragons and other special mod characters (like Aemu) have the ability to 1-hit KO all monsters
    if (character.modTitle === 'Dragon' || character.name === 'Aemu') {
      console.log(`[raidModule.js]: 👑 Mod character ${character.name} (${character.modTitle || 'Oracle'}) uses 1-hit KO ability on ${monster.name}!`);
      
      // Import flavor text module for mod character victory messages
      const { generateModCharacterVictoryMessage } = require('./flavorTextModule');
      
      // Generate appropriate flavor text based on character type
      const modFlavorText = generateModCharacterVictoryMessage(
        character.name, 
        character.modTitle || 'Oracle', 
        character.modType || 'Power'
      );
      
      // Create a special outcome for mod character 1-hit KO
      outcome = {
        result: modFlavorText, // Use special mod character flavor text
        hearts: monster.maxHearts || monster.hearts || 999, // Deal maximum damage to instantly kill monster
        playerHearts: {
          current: character.currentHearts, // Mod character takes no damage
          max: character.maxHearts
        },
        monsterHearts: {
          current: 0, // Monster is instantly defeated
          max: monster.maxHearts || monster.hearts || 999
        },
        diceRoll: diceRoll,
        damageValue: monster.maxHearts || monster.hearts || 999, // Show max damage dealt
        adjustedRandomValue: adjustedRandomValue,
        isModKO: true // Special flag to indicate this was a mod character 1-hit KO
      };
    } else {
      // Use the encounter module's tier-specific logic for non-dragon characters
      switch (monster.tier) {
      case 5:
        outcome = await getTier5EncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);
        break;
      case 6:
        outcome = await getTier6EncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);
        break;
      case 7:
        outcome = await getTier7EncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);
        break;
      case 8:
        outcome = await getTier8EncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);
        break;
      case 9:
        outcome = await getTier9EncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);
        break;
      case 10:
        outcome = await getTier10EncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);
        break;
      default:
        throw new Error(`Unsupported monster tier for raid: ${monster.tier}`);
      }
    }

    if (!outcome) {
      throw new Error('Failed to calculate raid battle outcome');
    }

    // ------------------- Elixir Consumption Logic -------------------
    // Check if elixirs should be consumed based on the raid encounter
    try {
      const { shouldConsumeElixir, consumeElixirBuff } = require('./elixirModule');
      if (shouldConsumeElixir(character, 'raid', { monster: monster })) {
        consumeElixirBuff(character);
        console.log(`[raidModule.js]: 🧪 Elixir consumed for ${character.name} during raid against ${monster.name}`);
        
        // Update character in database to persist the consumed elixir
        await character.save();
      } else if (character.buff?.active) {
        // Log when elixir is not used due to conditions not met
        console.log(`[raidModule.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
      }
    } catch (elixirError) {
      console.error(`[raidModule.js]: ⚠️ Warning - Elixir consumption failed:`, elixirError);
      // Don't fail the raid if elixir consumption fails
    }

    // Battle result logged only in debug mode

    return {
      hearts: outcome.hearts, // Damage dealt to monster
      outcome: (outcome.result || outcome.outcome || 'Battle completed'), // Handle both regular and mod character outcomes with fallback
      playerHearts: outcome.playerHearts || {
        current: character.currentHearts,
        max: character.maxHearts
      },
      monsterHearts: outcome.monsterHearts || {
        current: monster.currentHearts,
        max: monster.maxHearts
      },
      originalRoll: diceRoll,
      adjustedRandomValue: adjustedRandomValue,
      attackSuccess: attackSuccess,
      defenseSuccess: defenseSuccess,
      damageValue: damageValue,
      attackStat: character.attack || 0,
      defenseStat: character.defense || 0,
      characterHeartsBefore: characterHeartsBefore || character.currentHearts
    };

  } catch (error) {
    handleError(error, 'raidModule.js', {
      functionName: 'processRaidBattle',
      characterName: character?.name,
      monsterName: monster?.name
    });
    console.error(`[raidModule.js]: ❌ Error processing raid battle:`, error);
    return null;
  }
}

// ============================================================================
// ---- Raid Functions ----
// ============================================================================

// ---- Function: startRaid ----
// Creates a new raid instance with the given monster and village
async function startRaid(monster, village, interaction = null) {
  try {
    // Generate unique raid ID with 'R' prefix for Raid
    const raidId = generateUniqueId('R');
    
    // Calculate raid duration based on monster tier
    const raidDuration = calculateRaidDuration(monster.tier);
    
    // Create raid document
    const raid = new Raid({
      raidId: raidId,
      monster: {
        name: monster.name,
        nameMapping: monster.nameMapping,
        image: monster.image,
        tier: monster.tier,
        currentHearts: monster.hearts,
        maxHearts: monster.hearts
      },
      village: village,
      channelId: interaction?.channel?.id || null,
      expiresAt: new Date(Date.now() + raidDuration),
      analytics: {
        monsterTier: monster.tier,
        village: village,
        baseMonsterHearts: monster.hearts
      }
    });

    // Save raid to database
    await raid.save();

    console.log(`[raidModule.js]: 🐉 Started new raid ${raidId} - ${monster.name} (T${monster.tier}) in ${village} - Duration: ${Math.floor(raidDuration / (1000 * 60))} minutes`);
    
    // Set up internal timer for raid timeout
    setTimeout(async () => {
      try {
        // Check if raid is still active
        const currentRaid = await Raid.findOne({ raidId: raidId });
        if (currentRaid && currentRaid.status === 'active') {
          console.log(`[raidModule.js]: ⏰ Raid ${raidId} timed out`);
          
          // Mark raid as failed and KO all participants
          await currentRaid.failRaid();

          // Compose failure embed (used for thread or channel fallback)
          const buildFailureEmbed = () => new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('💥 **Raid Failed!**')
            .setDescription(`The raid against **${currentRaid.monster.name}** has failed!`)
            .addFields(
              {
                name: '__Monster Status__',
                value: `💙 **Hearts:** ${currentRaid.monster.currentHearts}/${currentRaid.monster.maxHearts}`,
                inline: false
              },
              {
                name: '__Participants__',
                value: (currentRaid.participants && currentRaid.participants.length > 0)
                  ? currentRaid.participants.map(p => `• **${p.name}** (${p.damage} hearts) - **KO'd**`).join('\n')
                  : 'No participants',
                inline: false
              },
              {
                name: '__Failure__',
                value: (currentRaid.participants && currentRaid.participants.length > 0)
                  ? `All participants have been knocked out! 💀`
                  : `The monster caused havoc as no one defended the village from it and then ran off!`,
                inline: false
              }
            )
            .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
            .setFooter({ text: `Raid ID: ${raidId}` })
            .setTimestamp();

          // Try to send failure message to thread, else fall back to the original channel
          if (interaction?.client) {
            let sent = false;
            if (currentRaid.threadId) {
              try {
                const thread = await interaction.client.channels.fetch(currentRaid.threadId);
                if (thread) {
                  await thread.send({ embeds: [buildFailureEmbed()] });
                  console.log(`[raidModule.js]: 💬 Failure message sent to raid thread`);
                  sent = true;
                }
              } catch (threadError) {
                console.error(`[raidModule.js]: ❌ Error sending failure message to thread:`, threadError);
              }
            }

            if (!sent && currentRaid.channelId) {
              try {
                const channel = await interaction.client.channels.fetch(currentRaid.channelId);
                if (channel) {
                  await channel.send({ embeds: [buildFailureEmbed()] });
                  console.log(`[raidModule.js]: 💬 Failure message sent to raid channel (fallback)`);
                  sent = true;
                }
              } catch (channelError) {
                console.error(`[raidModule.js]: ❌ Error sending failure message to channel:`, channelError);
              }
            }
          }
          
          console.log(`[raidModule.js]: 💥 Raid ${raidId} failed - All participants KO'd`);
        }
      } catch (timeoutError) {
        console.error(`[raidModule.js]: ❌ Error in raid timeout handler:`, timeoutError);
        handleError(timeoutError, 'raidModule.js', {
          functionName: 'raidTimeout',
          raidId: raidId
        });
      }
    }, raidDuration);
    
    return {
      raidId,
      raidData: raid,
      thread: null // Thread will be created in triggerRaid function
    };
  } catch (error) {
    handleError(error, 'raidModule.js', {
      functionName: 'startRaid',
      monsterName: monster?.name,
      village: village
    });
    console.error(`[raidModule.js]: ❌ Error starting raid:`, error);
    throw error;
  }
}

// ---- Function: joinRaid ----
// Allows a character to join an active raid after validation checks
async function joinRaid(character, raidId) {
  try {
    // Retrieve raid from database
    const raid = await Raid.findOne({ raidId: raidId });
    if (!raid) {
      // Get all active raids for debugging
      const allRaids = await Raid.find({ status: 'active' }).select('raidId village monster.name createdAt').limit(10);
      const activeRaidIds = allRaids.map(r => r.raidId).join(', ');
      
      throw new Error(`Raid not found. Raid ID: "${raidId}". Available active raids: ${activeRaidIds || 'None'}`);
    }

    // Check if raid is active
    if (raid.status !== 'active') {
      throw new Error('Raid is not active');
    }

    // Note: KO'd characters can still join raids (KO status is handled during combat)

    // Check if character is in the same village
    if (character.currentVillage.toLowerCase() !== raid.village.toLowerCase()) {
      throw new Error('Character must be in the same village as the raid');
    }

    // Check if character has blight stage 3 or higher (monsters don't attack them)
    if (character.blighted && character.blightStage >= 3) {
      throw new Error(`Character ${character.name} cannot participate in raids at Blight Stage ${character.blightStage} - monsters no longer attack them`);
    }

    // Create participant data
    const participant = {
      userId: character.userId,
      characterId: character._id,
      name: character.name,
      damage: 0,
      joinedAt: new Date(),
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
      }
    };

    // Add participant to raid using the model method
    await raid.addParticipant(participant);

    // ----- Dynamic HP scaling based on party size (starts at 5+ participants) -----
    try {
      // Ensure we have a persistent base hearts value (for pre-existing raids)
      if (!raid.analytics) raid.analytics = {};
      if (!raid.analytics.baseMonsterHearts || raid.analytics.baseMonsterHearts <= 0) {
        raid.analytics.baseMonsterHearts = raid.monster.maxHearts || 0;
      }
      const baseHearts = raid.analytics.baseMonsterHearts || 0;
      const partySize = (raid.participants || []).length;
      
      // Only scale hearts when 5+ participants join
      let scaleMultiplier = 1;
      if (partySize >= 5) {
        // +10% base hearts per extra participant beyond the 4th (starts scaling at 5th participant)
        const extraParticipants = partySize - 4;
        scaleMultiplier = Math.max(1, 1 + 0.10 * extraParticipants);
      }
      
      const oldMax = raid.monster.maxHearts;
      const oldCurrent = raid.monster.currentHearts;
      const damageDealtSoFar = Math.max(0, oldMax - oldCurrent);
      const newMax = Math.ceil(baseHearts * scaleMultiplier);
      const newCurrent = Math.max(1, newMax - damageDealtSoFar);
      raid.monster.maxHearts = newMax;
      raid.monster.currentHearts = newCurrent;
      await raid.save();
      
      if (partySize >= 5) {
        console.log(`[raidModule.js]: 📈 Raid ${raidId} scaled HP → partySize=${partySize}, base=${baseHearts}, max=${newMax}, current=${newCurrent} (scaling active)`);
      } else {
        console.log(`[raidModule.js]: 📊 Raid ${raidId} party size: ${partySize}/5 (scaling inactive)`);
      }
    } catch (scaleError) {
      console.warn(`[raidModule.js]: ⚠️ Failed to scale raid HP: ${scaleError.message}`);
    }

    console.log(`[raidModule.js]: 👤 ${character.name} joined raid ${raidId}`);
    
    return {
      raidId,
      raidData: raid,
      participant
    };
  } catch (error) {
    handleError(error, 'raidModule.js', {
      functionName: 'joinRaid',
      characterName: character?.name,
      raidId: raidId
    });
    console.error(`[raidModule.js]: ❌ Error joining raid:`, error);
    throw error;
  }
}

// ---- Function: processRaidTurn ----
// Processes a single turn in a raid for a character
async function processRaidTurn(character, raidId, interaction, raidData = null) {
  try {
    // Use provided raidData or fetch from database
    let raid = raidData;
    if (!raid) {
      raid = await Raid.findOne({ raidId: raidId });
    }
    if (!raid) {
      // Get all active raids for debugging
      const allRaids = await Raid.find({ status: 'active' }).select('raidId village monster.name createdAt').limit(10);
      const activeRaidIds = allRaids.map(r => r.raidId).join(', ');
      
      throw new Error(`Raid not found. Raid ID: "${raidId}". Available active raids: ${activeRaidIds || 'None'}`);
    }

    // Check if raid is active
    if (raid.status !== 'active') {
      throw new Error('Raid is not active');
    }

    // Find participant
    const participants = raid.participants || [];
    const participant = participants.find(p => p.characterId.toString() === character._id.toString());
    if (!participant) {
      throw new Error('Character is not in this raid');
    }

    // Note: KO'd characters can still take turns in raids (KO status is handled during combat)

    // Generate random roll and apply raid difficulty penalty before calculating final value
    let diceRoll = Math.floor(Math.random() * 100) + 1;
    // Party-size and tier-based penalty: -1 per extra participant, -0.5 per tier above 5 (capped total 15)
    const partySize = (raid.participants || []).length;
    const partyPenalty = Math.max(0, (partySize - 1) * 1);
    const tierPenalty = Math.max(0, ((raid.monster?.tier || 5) - 5) * 0.5);
    const totalPenalty = Math.min(15, partyPenalty + tierPenalty);
    diceRoll = Math.max(1, diceRoll - totalPenalty);
    const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateRaidFinalValue(character, diceRoll);

    // Capture character hearts before battle
    const characterHeartsBefore = character.currentHearts;
    
    // Process the raid battle turn
    const battleResult = await processRaidBattle(
      character,
      raid.monster,
      diceRoll,
      damageValue,
      adjustedRandomValue,
      attackSuccess,
      defenseSuccess,
      characterHeartsBefore
    );

    if (!battleResult) {
      throw new Error('Failed to process raid battle turn');
    }

    // Update participant's damage using the model method with retry logic
    await raid.updateParticipantDamage(character._id, battleResult.hearts);

    // Update monster hearts with retry logic for version conflicts
    let raidUpdateRetries = 0;
    const maxRaidRetries = 3;
    
    while (raidUpdateRetries < maxRaidRetries) {
      try {
        // Update monster hearts
        raid.monster.currentHearts = battleResult.monsterHearts.current;

        // Check if monster is defeated
        if (raid.monster.currentHearts <= 0) {
          await raid.completeRaid('defeated');
        } else {
          // Update character object with new hearts value from battle result
          character.currentHearts = battleResult.playerHearts.current;
          
          // Ensure character's KO status is saved before advancing turn
          if (battleResult.playerHearts.current <= 0) {
            // Character was KO'd, make sure it's saved
            character.ko = true;
            character.currentHearts = 0;
            await character.save();
            console.log(`[raidModule.js]: 💀 Character ${character.name} KO'd and saved to database`);
          } else {
            // Save the updated hearts value for non-KO'd characters
            await character.save();
            console.log(`[raidModule.js]: 💔 Character ${character.name} hearts updated to ${character.currentHearts}/${character.maxHearts}`);
          }
          
          // Advance to next turn if monster is not defeated
          await raid.advanceTurn();
          // Turn advancement logged only in debug mode
        }

        // Save updated raid data
        await raid.save();
        break; // Success, exit retry loop
        
      } catch (error) {
        if (error.name === 'VersionError' && raidUpdateRetries < maxRaidRetries - 1) {
          raidUpdateRetries++;
          console.warn(`[raidModule.js]: ⚠️ Version conflict in processRaidTurn, retrying (${raidUpdateRetries}/${maxRaidRetries})`);
          
          // Reload the raid document to get the latest version
          const freshRaid = await Raid.findById(raid._id);
          if (!freshRaid) {
            throw new Error('Raid document not found during retry');
          }
          
          // Update the current raid object with fresh data
          raid.set(freshRaid.toObject());
          
          // Continue with the retry
          continue;
        } else {
          // Re-throw if it's not a version error or we've exhausted retries
          throw error;
        }
      }
    }
    
    if (raidUpdateRetries >= maxRaidRetries) {
      throw new Error(`Failed to update raid after ${maxRaidRetries} retries`);
    }

    // Turn completion logged only in debug mode
    
    return {
      raidId,
      raidData: raid,
      battleResult,
      participant
    };
  } catch (error) {
    handleError(error, 'raidModule.js', {
      functionName: 'processRaidTurn',
      characterName: character?.name,
      raidId: raidId
    });
    console.error(`[raidModule.js]: ❌ Error processing raid turn:`, error);
    throw error;
  }
}

// ---- Function: checkRaidExpiration ----
// Checks if a raid has expired and handles the timeout consequences
async function checkRaidExpiration(raidId) {
  try {
    // Retrieve raid from database
    const raid = await Raid.findOne({ raidId: raidId });
    if (!raid) {
      return null;
    }

    // Skip if raid is already completed
    if (raid.status !== 'active') {
      return raid;
    }

    // Check if raid has expired
    if (raid.isExpired()) {
      console.log(`[raidModule.js]: ⏰ Raid ${raidId} has expired`);

      // Mark raid as failed and KO all participants
      await raid.failRaid();

      console.log(`[raidModule.js]: 💥 Raid ${raidId} failed - All participants KO'd`);
    }

    return raid;
  } catch (error) {
    handleError(error, 'raidModule.js', {
      functionName: 'checkRaidExpiration',
      raidId: raidId
    });
    console.error(`[raidModule.js]: ❌ Error checking raid expiration:`, error);
    throw error;
  }
}

// ---- Function: createRaidThread ----
// Creates a Discord thread for raid communication
async function createRaidThread(interaction, raid) {
  try {
    const villageName = capitalizeVillageName(raid.village);
    const emoji = '🛡️';
    const threadName = `${emoji} ${villageName} - ${raid.monster.name} (Tier ${raid.monster.tier})`;

    // Create the thread
    const thread = await interaction.fetchReply().then(message =>
      message.startThread({
        name: threadName,
        autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
        reason: `Raid initiated against ${raid.monster.name}`
      })
    );

    // Create the initial thread message
    const residentRoleId = VILLAGE_RESIDENT_ROLES[raid.village];
    const visitingRoleId = VILLAGE_VISITING_ROLES[raid.village];
    
    let roleMention = `@${villageName} residents`;
    if (residentRoleId && visitingRoleId) {
      roleMention = `<@&${residentRoleId}> <@&${visitingRoleId}>`;
    } else if (residentRoleId) {
      roleMention = `<@&${residentRoleId}>`;
    }
    
    // Calculate total duration for this tier
    const totalDuration = calculateRaidDuration(raid.monster.tier);
    const totalMinutes = Math.floor(totalDuration / (1000 * 60));
    
    const threadMessage = [
      `💀 A raid has been initiated against **${raid.monster.name} (Tier ${raid.monster.tier})**!`,
      `\n${roleMention} — come help defend your home!`,
      `\nUse </raid:1392945628002259014> to join the fight!`,
      `\n\n**Raid ID:** \`\`\`${raid.raidId}\`\`\``,
      `\n\n⏰ **You have ${totalMinutes} minutes to complete this raid!**`
    ].join('');

    // Send the text message to the thread
    await thread.send(threadMessage);

    // Update raid with thread information
    raid.threadId = thread.id;
    raid.messageId = interaction.id;
    await raid.save();

    return thread;
  } catch (error) {
    console.error(`[raidModule.js]: ❌ Error creating raid thread: ${error.message}`);
    return null;
  }
}

// ---- Function: createRaidEmbed ----
// Creates an embed for displaying raid information
function createRaidEmbed(raid, monsterImage) {
  const villageName = capitalizeVillageName(raid.village);
  const villageEmoji = getVillageEmojiByName(raid.village) || '';

  // Calculate remaining time
  const now = new Date();
  const expiresAt = new Date(raid.expiresAt);
  const timeRemaining = expiresAt.getTime() - now.getTime();
  
  // Format remaining time
  let timeString = '';
  if (timeRemaining > 0) {
    const minutes = Math.floor(timeRemaining / (1000 * 60));
    const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
    timeString = `${minutes}m ${seconds}s remaining`;
  } else {
    timeString = '⏰ Time expired!';
  }

  // Calculate total duration for this tier
  const totalDuration = calculateRaidDuration(raid.monster.tier);
  const totalMinutes = Math.floor(totalDuration / (1000 * 60));

  const embed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('🛡️ Village Raid!')
    .setDescription(
      `**${raid.monster.name} has been spotted in ${villageName}!**\n` +
      `*It's a Tier ${raid.monster.tier} monster! Protect the village!*\n\n` +
      `</raid:1392945628002259014> to join or continue the raid!\n` +
      `</item:1379838613067530385> to heal during the raid!\n\n` +
      `⏰ **You have ${totalMinutes} minutes to complete this raid!**`
    )
    .addFields(
      {
        name: `__${raid.monster.name}__`,
        value: `💙 **Hearts:** ${raid.monster.currentHearts}/${raid.monster.maxHearts}\n⭐ **Tier:** ${raid.monster.tier}`,
        inline: false
      },
      {
        name: `__Location__`,
        value: `${villageEmoji} ${villageName}`,
        inline: false
      },
      {
        name: `__⏰ Time Remaining__`,
        value: `**${timeString}**`,
        inline: false
      },
      {
        name: `__Raid ID__`,
        value: `\u0060\u0060\u0060${raid.raidId}\u0060\u0060\u0060`,
        inline: false
      }
    )
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border%20blood%20moon.png')
    .setTimestamp();

  // Add monster image as thumbnail if available
  if (monsterImage && monsterImage !== 'No Image') {
    embed.setThumbnail(monsterImage);
  }

  return embed;
}

// ---- Function: triggerRaid ----
// Triggers a raid in the specified channel
async function triggerRaid(monster, interaction, villageId, isBloodMoon = false, character = null) {
  try {
    console.log(`[raidModule.js]: 🐉 Starting raid trigger for ${monster.name} in ${villageId}`);
    console.log(`[raidModule.js]: 📍 Interaction type: ${interaction?.constructor?.name || 'unknown'}`);
    console.log(`[raidModule.js]: 📍 Channel ID: ${interaction?.channel?.id || 'unknown'}`);
    
    // ------------------- Global Raid Cooldown Check -------------------
    // For Blood Moon raids, skip cooldown entirely (do not check or set)
    if (!isBloodMoon) {
      // Check if we're still in global cooldown period (4 hours between raids)
      const { getGlobalRaidCooldown, setGlobalRaidCooldown } = require('../scripts/randomMonsterEncounters');
      const currentTime = Date.now();
      const lastRaidTime = await getGlobalRaidCooldown();
      const timeSinceLastRaid = currentTime - lastRaidTime;
      const RAID_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
      
      if (timeSinceLastRaid < RAID_COOLDOWN) {
        const remainingTime = RAID_COOLDOWN - timeSinceLastRaid;
        const remainingHours = Math.floor(remainingTime / (1000 * 60 * 60));
        const remainingMinutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60));
        
        console.log(`[raidModule.js]: ⏰ Global raid cooldown active - ${remainingHours}h ${remainingMinutes}m remaining`);
        console.log(`[raidModule.js]: ⏰ Last raid time: ${new Date(lastRaidTime).toISOString()}`);
        console.log(`[raidModule.js]: ⏰ Current time: ${new Date(currentTime).toISOString()}`);
        console.log(`[raidModule.js]: ⏰ Time since last raid: ${Math.floor(timeSinceLastRaid / (1000 * 60))} minutes`);
        
        return {
          success: false,
          error: `Raid cooldown active. Please wait ${remainingHours}h ${remainingMinutes}m before triggering another raid.`
        };
      }
      
      // Update global raid cooldown (applies to all villages)
      await setGlobalRaidCooldown(currentTime);
      console.log(`[raidModule.js]: ⏰ Global raid cooldown started - next raid available in 4 hours`);
    } else {
      console.log('[raidModule.js]: 🌕 Blood Moon raid detected — bypassing global raid cooldown.');
    }
    
    // Start the raid
    const { raidId, raidData } = await startRaid(monster, villageId, interaction);
    
    // Automatically add character to raid if provided (from loot command)
    if (character) {
      try {
        console.log(`[raidModule.js]: 👤 Auto-adding character ${character.name} to raid ${raidId}`);
        await joinRaid(character, raidId);
        console.log(`[raidModule.js]: ✅ Successfully auto-added ${character.name} to raid ${raidId}`);
      } catch (joinError) {
        console.warn(`[raidModule.js]: ⚠️ Failed to auto-add character ${character.name} to raid: ${joinError.message}`);
        // Don't fail the raid creation if auto-join fails
      }
    }
    
    // Create the raid embed
    const monsterDetails = monsterMapping && monsterMapping[monster.nameMapping] 
      ? monsterMapping[monster.nameMapping] 
      : { image: monster.image };
    const monsterImage = monsterDetails.image || monster.image;
    const embed = createRaidEmbed(raidData, monsterImage);

    console.log(`[raidModule.js]: 📤 Sending raid announcement to channel ${interaction.channel.id}`);
    console.log(`[raidModule.js]: 📤 Interaction deferred: ${interaction.deferred}`);
    console.log(`[raidModule.js]: 📤 Interaction replied: ${interaction.replied}`);
    
    // Send the raid announcement - always send to channel directly for consistent thread creation
    console.log(`[raidModule.js]: 📤 Sending raid embed with monster: ${monster.name}, tier: ${monster.tier}`);
    console.log(`[raidModule.js]: 📤 Embed title: ${embed.data?.title || 'No title'}`);
    console.log(`[raidModule.js]: 📤 Embed description: ${embed.data?.description || 'No description'}`);
    
    const raidMessage = await interaction.channel.send({
      content: isBloodMoon ? `🌙 **BLOOD MOON RAID!**` : `⚠️ **RAID TRIGGERED!** ⚠️`,
      embeds: [embed]
    });

    console.log(`[raidModule.js]: 📝 Raid message sent with ID: ${raidMessage.id}`);
    console.log(`[raidModule.js]: 📝 Raid message type: ${raidMessage.constructor.name}`);
    console.log(`[raidModule.js]: 📝 Raid message channel: ${raidMessage.channel?.id}`);
    console.log(`[raidModule.js]: 📝 Raid message guild: ${raidMessage.guild?.id}`);
    console.log(`[raidModule.js]: 📝 Raid message has startThread method: ${typeof raidMessage.startThread === 'function'}`);
    console.log(`[raidModule.js]: 📝 Raid message content: ${raidMessage.content}`);
    console.log(`[raidModule.js]: 📝 Raid message embeds count: ${raidMessage.embeds?.length || 0}`);
    if (raidMessage.embeds && raidMessage.embeds.length > 0) {
      console.log(`[raidModule.js]: 📝 First embed title: ${raidMessage.embeds[0].title}`);
      console.log(`[raidModule.js]: 📝 First embed description: ${raidMessage.embeds[0].description}`);
    }
    console.log(`[raidModule.js]: 🧵 Creating thread on raid message...`);

    // Create the raid thread with error handling
    let thread = null;
    try {
      // Ensure we're creating the thread on the actual raid message
      console.log(`[raidModule.js]: 🧵 Creating thread on message ID: ${raidMessage.id}`);
      
      // Wait a moment to ensure the message is fully processed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Fetch the message again to ensure we have the latest version
      const freshMessage = await interaction.channel.messages.fetch(raidMessage.id);
      console.log(`[raidModule.js]: 🧵 Fetched fresh message with ID: ${freshMessage.id}`);
      
      // Create thread using the fresh message's startThread method
      thread = await freshMessage.startThread({
        name: `🛡️ ${villageId} - ${monster.name} (T${monster.tier})`,
        autoArchiveDuration: THREAD_AUTO_ARCHIVE_DURATION,
        reason: `Raid thread for ${monster.name} in ${villageId}`
      });

      // Verify thread was created properly
      if (!thread || !thread.id) {
        throw new Error('Failed to create raid thread');
      }

      console.log(`[raidModule.js]: 🧵 Thread created with ID: ${thread.id}`);
      console.log(`[raidModule.js]: 📝 Thread name: ${thread.name}`);
      console.log(`[raidModule.js]: 📍 Thread parent message ID: ${thread.parentId}`);
      console.log(`[raidModule.js]: 📍 Raid message ID: ${freshMessage.id}`);
      console.log(`[raidModule.js]: 📍 Thread parent ID type: ${typeof thread.parentId}`);
      console.log(`[raidModule.js]: 📍 Raid message ID type: ${typeof freshMessage.id}`);
      
      // Verify the thread is properly connected to the raid message
      if (thread.parentId !== freshMessage.id) {
        console.warn(`[raidModule.js]: ⚠️ Thread parent ID (${thread.parentId}) doesn't match raid message ID (${freshMessage.id})`);
        console.warn(`[raidModule.js]: ⚠️ This might be a Discord.js caching issue - thread should still work correctly`);
      } else {
        console.log(`[raidModule.js]: ✅ Thread created successfully on raid message`);
      }
      
      // Send initial thread message with raid ID
      const residentRoleId = VILLAGE_RESIDENT_ROLES[villageId];
      const visitingRoleId = VILLAGE_VISITING_ROLES[villageId];
      
      let roleMention = `@${villageId} residents`;
      if (residentRoleId && visitingRoleId) {
        roleMention = `<@&${residentRoleId}> <@&${visitingRoleId}>`;
      } else if (residentRoleId) {
        roleMention = `<@&${residentRoleId}>`;
      }
      
      // Calculate total duration for this tier
      const totalDuration = calculateRaidDuration(monster.tier);
      const totalMinutes = Math.floor(totalDuration / (1000 * 60));
      
      const threadMessage = [
        `💀 A raid has been initiated against **${monster.name} (Tier ${monster.tier})**!`,
        `\n${roleMention} — come help defend your home!`,
        `\nUse </raid:1392945628002259014> to join the fight!`,
        `\n\n**Raid ID:** \`\`\`${raidId}\`\`\``,
        `\n\n⏰ **You have ${totalMinutes} minutes to complete this raid!**`
      ].join('');

      await thread.send(threadMessage);
      console.log(`[raidModule.js]: 💬 Thread message sent`);

      // Update raid data with thread information
      raidData.threadId = thread.id;
      raidData.messageId = raidMessage.id;
      await raidData.save();
      console.log(`[raidModule.js]: 💾 Updated raid data with thread information`);

    } catch (threadError) {
      console.warn(`[raidModule.js]: ⚠️ Could not create thread: ${threadError.message}`);
      console.warn(`[raidModule.js]: ⚠️ This may be because the channel doesn't support threads (DM, etc.)`);
      console.warn(`[raidModule.js]: ⚠️ Raid will continue without a thread - participants can use the raid ID directly`);
      
      // Send the raid information as a follow-up message instead
      const residentRoleId = VILLAGE_RESIDENT_ROLES[villageId];
      const visitingRoleId = VILLAGE_VISITING_ROLES[villageId];
      
      let roleMention = `@${villageId} residents`;
      if (residentRoleId && visitingRoleId) {
        roleMention = `<@&${residentRoleId}> <@&${visitingRoleId}>`;
      } else if (residentRoleId) {
        roleMention = `<@&${residentRoleId}>`;
      }
      
      // Calculate total duration for this tier
      const totalDuration = calculateRaidDuration(monster.tier);
      const totalMinutes = Math.floor(totalDuration / (1000 * 60));
      
      const raidInfoMessage = [
        `💀 A raid has been initiated against **${monster.name} (Tier ${monster.tier})**!`,
        `\n${roleMention} — come help defend your home!`,
        `\nUse </raid:1392945628002259014> to join the fight!`,
        `\n\n**Raid ID:** \`\`\`${raidId}\`\`\``,
        `\n\n⏰ **You have ${totalMinutes} minutes to complete this raid!**`,
        `\n\n*Note: No thread was created in this channel. Use the raid ID to participate!*`
      ].join('');

      // Check if interaction has followUp method before calling it
      if (interaction && typeof interaction.followUp === 'function') {
        await interaction.followUp({ content: raidInfoMessage });
      } else {
        // If no followUp method, send as a regular message to the channel
        await interaction.channel.send({ content: raidInfoMessage });
      }
      
      // Update raid data without thread information
      raidData.messageId = raidMessage.id;
      raidData.channelId = interaction.channel.id;
      await raidData.save();
      console.log(`[raidModule.js]: 💾 Updated raid data without thread information`);
    }

    console.log(`[raidModule.js]: 🐉 Triggered raid ${raidId} - ${monster.name} (T${monster.tier}) in ${villageId}${isBloodMoon ? ' (Blood Moon)' : ''}`);

    return {
      success: true,
      raidId: raidId,
      raidData: raidData,
      thread: thread,
      message: raidMessage
    };

  } catch (error) {
    handleError(error, 'raidModule.js', {
      functionName: 'triggerRaid',
      monsterName: monster?.name,
      villageId: villageId,
      isBloodMoon: isBloodMoon
    });
    
    console.error(`[raidModule.js]: ❌ Error triggering raid:`, error);
    
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  startRaid,
  joinRaid,
  processRaidTurn,
  checkRaidExpiration,
  createRaidEmbed,
  createRaidThread,
  triggerRaid,
  calculateRaidDuration
};
