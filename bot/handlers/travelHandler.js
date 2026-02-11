// ============================================================================
// ------------------- Standard Libraries -------------------
// ============================================================================
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

// Village visiting role IDs
const VILLAGE_VISITING_ROLES = {
  'Rudania': '1379850030856405185',
  'Inariko': '1379850102486863924', 
  'Vhintl': '1379850161794056303'
};

// ------------------- Discord.js Components -------------------
const { EmbedBuilder } = require('discord.js');

// ------------------- Database Services -------------------
const { fetchAllItems, fetchItemsByMonster } = require('@/database/db');

// ------------------- Embeds -------------------
const { 
  createKOEmbed,
  createUpdatedTravelEmbed,
  pathEmojis,
  villageEmojis,
  DEFAULT_IMAGE_URL
} = require('../embeds/embeds.js');

// ------------------- Modules -------------------
const {
  recoverHearts,
  updateCurrentHearts,
  useHearts,
  useStamina
} = require('../modules/characterStatsModule');
const { getEncounterOutcome } = require('../modules/encounterModule');
const {
  generateDamageMessage,
  generateVictoryMessage
} = require('../modules/flavorTextModule');
const { getJobPerk, hasPerk } = require('../modules/jobsModule');
const { applyTravelGatherBoost, applyTravelBoost } = require('../modules/boostIntegration');
const { retrieveBoostingRequestFromTempDataByCharacter } = require('../commands/jobs/boosting');
const {
  attemptFlee,
  calculateFinalValue,
  createWeightedItemList
} = require('../modules/rngModule');
const { capitalizeFirstLetter, capitalizeWords } = require('../modules/formattingModule');

// ------------------- Utility Functions -------------------
const { addItemInventoryDatabase, logItemAcquisitionToDatabase, syncToInventoryDatabase, SOURCE_TYPES } = require('@/utils/inventoryUtils');
// Google Sheets functionality removed
const { handleError } = require('@/utils/globalErrorHandler');
const { info, success, warn, error, debug } = require('@/utils/logger');

const Character = require('@/models/CharacterModel');

// ============================================================================
// ------------------- Daily Roll Functions -------------------
// ============================================================================

// ------------------- Daily Roll Functions ------------------
// Check if a daily roll is available for a specific activity
function canUseDailyRoll(character, activity, userId) {
  // If character has an active job voucher, they can always use the command
  if (character.jobVoucher) {
    return true;
  }

  // Special case for test characters
  if (character.name === 'Tingle test' || character.name === 'Tingle' || character.name === 'John') {
    return true;
  }

  const now = new Date();
  // Compute the most recent 13:00 UTC (8am EST) rollover
  const rollover = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 13, 0, 0, 0));
  if (now < rollover) {
    // If before today's 13:00 UTC, use yesterday's 13:00 UTC
    rollover.setUTCDate(rollover.getUTCDate() - 1);
  }

  // Check both gather and loot activities since they share the same daily limit
  const lastGatherRoll = character.dailyRoll?.get('gather');
  const lastLootRoll = character.dailyRoll?.get('loot');
  
  if (!lastGatherRoll && !lastLootRoll) {
    return true;
  }

  const lastGatherDate = lastGatherRoll ? new Date(lastGatherRoll) : null;
  const lastLootDate = lastLootRoll ? new Date(lastLootRoll) : null;
  
  // If either activity was used today, deny the action
  if (lastGatherDate && lastGatherDate >= rollover) {
    return false;
  }
  if (lastLootDate && lastLootDate >= rollover) {
    return false;
  }

  return true;
}

// Update the daily roll timestamp for an activity
async function updateDailyRoll(character, activity) {
  try {
    if (!character.dailyRoll) {
      character.dailyRoll = new Map();
    }
    const now = new Date().toISOString();
    character.dailyRoll.set(activity, now);
    character.markModified('dailyRoll'); // Required for Mongoose to track Map changes
    await character.save();
  } catch (err) {
    error('TRAVEL', 'Failed to update daily roll', err);
    throw err;
  }
}

// ============================================================================
// ------------------- Travel Embeds -------------------
// ============================================================================

// ------------------- Final Travel Summary Embed -------------------
// Creates a formatted embed summarizing the character's journey
function createFinalTravelEmbed(character, destination, paths, totalTravelDuration, travelLog) {
  const destEmoji = villageEmojis[destination.toLowerCase()] || "";

  // Process and format travel log entries
  const processedLog = Object.entries(
    travelLog.reduce((acc, entry) => {
      const dayMatch = entry.match(/Day (\d+):/);
      if (!dayMatch) {
        // If it's a damage message, add it to the last day
        const lastDay = Object.keys(acc).pop();
        if (lastDay) {
          acc[lastDay].push(entry);
        }
        return acc;
      }

      const day = dayMatch[1];
      const content = entry.replace(/^\*\*Day \d+:\*\*\n/, '').trim();
      if (!content) return acc;

      // Split content into lines and format each line
      const lines = content.split('\n').filter(line => line.trim());
      const formattedLines = lines.map(line => {
        // Skip formatting if it's already a loot message
        if (line.startsWith('Looted')) {
          return line;
        }
        // Add quote block to all other lines
        return `> ${line}`;
      });

      if (!acc[day]) acc[day] = [];
      acc[day].push(formattedLines.join('\n'));
      return acc;
    }, {})
  )
    .sort(([dayA], [dayB]) => parseInt(dayA) - parseInt(dayB))
    .map(([day, entries]) => `**Day ${day}:**\n${entries.join('\n')}`)
    .join('\n\n');

  return new EmbedBuilder()
    .setTitle(`✅ ${character.name} has arrived at ${destEmoji} ${capitalizeFirstLetter(destination)}!`)
    .setDescription(
      `**Travel Path:** ${paths.map(path => 
        `${pathEmojis[path]} ${capitalizeWords(path.replace(/([a-z])([A-Z])/g, "$1 $2"))}`
      ).join(", ")}\n` +
      `**Total Travel Duration:** ${totalTravelDuration} days\n` +
      `**❤️ __Hearts:__** ${character.currentHearts}/${character.maxHearts}\n` +
      `**🟩 __Stamina:__** ${character.currentStamina}/${character.maxStamina}`
    )
    .addFields({
      name: "📖 Travel Log",
      value: processedLog || "No significant events occurred during the journey."
    })
    .setColor("#AA926A")
    .setAuthor({ name: "Travel Summary", iconURL: character.icon })
    .setImage(DEFAULT_IMAGE_URL)
    .setTimestamp();
}

// ============================================================================
// ------------------- Private Helpers -------------------
// ============================================================================

// ------------------- Role Assignment Helper -------------------
// Assigns the appropriate village visiting role to the user when they arrive at a destination.
// Only assigns roles for approved characters (status === 'accepted').
async function assignVillageVisitingRole(interaction, destination, character = null) {
  try {
    if (character && character.status !== 'accepted') {
      return; // No role assignment until character is approved
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const destinationRoleId = VILLAGE_VISITING_ROLES[capitalizeFirstLetter(destination)];
    const isHomeVillage = character && character.homeVillage.toLowerCase() === destination.toLowerCase();
    
    if (destinationRoleId) {
      // Check if bot has manage roles permission
      const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
      if (botMember.permissions.has('ManageRoles')) {
        // Remove all village visiting roles first
        const visitingRoleIds = Object.values(VILLAGE_VISITING_ROLES);
        for (const roleId of visitingRoleIds) {
          if (member.roles.cache.has(roleId)) {
            try {
              await member.roles.remove(roleId);
              success('TRAVEL', `Removed visiting role ${roleId} from ${interaction.user.tag}`);
            } catch (error) {
              warn('TRAVEL', `Failed to remove role ${roleId}`, error.message);
            }
          }
        }
    
        // Only add visiting role if not returning to home village
        if (!isHomeVillage) {
          if (!member.roles.cache.has(destinationRoleId)) {
            try {
              await member.roles.add(destinationRoleId);
              success('TRAVEL', `Added ${capitalizeFirstLetter(destination)} visiting role to ${interaction.user.tag}`);
            } catch (error) {
              warn('TRAVEL', `Failed to add ${capitalizeFirstLetter(destination)} visiting role`, error.message);
            }
          } else {
            info('TRAVEL', `${interaction.user.tag} already has ${capitalizeFirstLetter(destination)} visiting role`);
          }
        } else {
          info('TRAVEL', `${interaction.user.tag} returned to home village ${capitalizeFirstLetter(destination)} - no visiting role assigned`);
        }
      } else {
        warn('PERMISSION', 'Bot lacks ManageRoles permission - skipping role management');
      }
    } else {
      warn('TRAVEL', `No role ID found for destination: ${capitalizeFirstLetter(destination)}`);
    }
  } catch (error) {
    warn('TRAVEL', 'Role management failed', error.message);
    // Continue with travel completion even if role management fails
  }
}

// ------------------- Recover Helper -------------------
// Attempts to recover a heart if character not KO'd, has stamina or Delivering perk,
// handles full-hearts case, updates stats, travel log, and edits encounter embed.
async function handleRecover(interaction, character, encounterMessage, travelLog, travelContext = null) {
  travelContext = travelContext || {};
  try {
    travelLog = Array.isArray(travelLog) ? travelLog : [];
    const jobPerk = getJobPerk(character.job);
    character.perk = jobPerk?.perks[0];
  
    // KO check
    if (character.ko) {
      const decision = `❌ ${character.name} is KO'd and cannot recover.`;
      const description = 
        `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n` +
        `**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n` +
        `**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}`;
      const embed = new EmbedBuilder(encounterMessage.embeds[0].toJSON())
        .setDescription(description);
      if (typeof encounterMessage?.edit === 'function') {
        await encounterMessage.edit({ embeds: [embed], components: [] });
      }
      travelLog.push(`recover: failed KO`);
      return decision;
    }
  
    // Already full hearts
    if (character.currentHearts >= character.maxHearts) {
      const decision = `❌ ${character.name} is already at full hearts.`;
      const description = 
        `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n` +
        `**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n` +
        `**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}`;
      const embed = new EmbedBuilder(encounterMessage.embeds[0].toJSON())
        .setDescription(description);
      if (typeof encounterMessage?.edit === 'function') {
        await encounterMessage.edit({ embeds: [embed], components: [] });
      }
      travelLog.push(`recover: full hearts`);
      return decision;
    }
  
    // Stamina check & perform recovery
    let decision, outcomeMessage;
    let restfulBlessingApplied = false;

    if (character.currentStamina >= 1 || hasPerk(character, 'DELIVERING')) {
      if (!hasPerk(character, 'DELIVERING')) {
        await useStamina(character._id, 1);
        // Update character object to reflect the stamina change
        character.currentStamina -= 1;
      }

      const heartsMissing = Math.max(0, character.maxHearts - character.currentHearts);
      let baseRecovery = Math.min(1, heartsMissing);
      if (baseRecovery <= 0) {
        baseRecovery = 0;
      }

      let boostedRecovery = baseRecovery;
      try {
        const boostResult = await applyTravelBoost(character.name, baseRecovery || 1);
        if (typeof boostResult === 'number') {
          boostedRecovery = boostResult;
          if (boostedRecovery > baseRecovery) {
            restfulBlessingApplied = true;
            travelContext.restfulBlessingApplied = true;
          }
        }
      } catch (boostError) {
        handleError(boostError, 'travelHandler.js (handleRecover - boost integration)');
      }

      const heartsToRecover = Math.min(
        Math.max(boostedRecovery, baseRecovery || 1),
        heartsMissing
      );

      const actualHeartsRecovered = heartsToRecover > 0 ? heartsToRecover : 0;

      if (actualHeartsRecovered > 0) {
        await recoverHearts(character._id, actualHeartsRecovered);
        character.currentHearts = Math.min(character.maxHearts, character.currentHearts + actualHeartsRecovered);
        await updateCurrentHearts(character._id, character.currentHearts);
      }

      const heartLabel = actualHeartsRecovered === 1 ? 'heart' : 'hearts';
      decision = `💖 Recovered ${actualHeartsRecovered} ${heartLabel}${hasPerk(character,'DELIVERING') ? '' : ' (-1 🟩 stamina)'}.`;
      outcomeMessage = `${character.name} recovered ${actualHeartsRecovered} ${heartLabel}${hasPerk(character,'DELIVERING') ? '' : ' and lost 1 🟩 stamina'}.`;

      if (restfulBlessingApplied && actualHeartsRecovered > baseRecovery) {
        const bonusHearts = actualHeartsRecovered - baseRecovery;
        outcomeMessage += `\n📿 Restful Blessing added +${bonusHearts} extra hearts.`;
        decision += `\n📿 Restful Blessing added +${bonusHearts} extra hearts.`;
        travelContext.restfulBlessingBonus = (travelContext.restfulBlessingBonus || 0) + bonusHearts;
      }

      if (restfulBlessingApplied) {
        travelContext.restfulBlessingApplied = true;
      }
    } else {
      decision = `❌ Not enough stamina to recover.`;
      outcomeMessage = `${character.name} tried to recover but lacked stamina.`;
    }
  
    // Update embed
    const description = 
      `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n` +
      `**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n` +
      `**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}`;

    const embed = createUpdatedTravelEmbed({
      encounterMessage,
      character,
      description,
      fields: [],
    });

    if (typeof encounterMessage?.edit === 'function') {
      await encounterMessage.edit({ embeds: [embed], components: [] });
    }

    return decision;
  
  } catch (error) {
    handleError(error, 'travelHandler.js (handleRecover)');
    throw error;
  }
}
  
// ------------------- Gather Helper -------------------
// Picks a random resource along path, updates inventory, stamina, logs outcome,
// syncs sheet, and edits encounter embed.
async function handleGather(interaction, character, currentPath, encounterMessage, travelLog, travelContext = null) {
  if (typeof currentPath !== 'string') {
    throw new Error(`Invalid currentPath value: "${currentPath}" — expected a string like "leafDewWay".`);
  }
  
  travelContext = travelContext || {};

  try {
    // ------------------- Travel Day Gathering Check ------------------
    // For travel, we only check if gathering has been used in this specific travel session
    // No daily roll check - travel gathering is per travel day, not per real day
    if (character.jobVoucher || character.isModCharacter) {
      // Job voucher is active or mod character - no need for gathering limit check
    } else {
      // Check if character has already gathered during this travel session
      // We'll use a simple flag in the character object to track this
      if (character.travelGathered) {
        const decision = `❌ **You have already gathered during this travel day.**\n\n*You can only gather once per travel day.*`;
        
        // Update embed
        const description = 
          `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n` +
          `**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n` +
          `**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}`;

        const embed = createUpdatedTravelEmbed({
          encounterMessage,
          character,
          description,
          fields: [{ name: '🔹 __Outcome__', value: 'Already gathered this travel day', inline: false }],
        });
        
        if (typeof encounterMessage?.edit === 'function') {
          await encounterMessage.edit({ embeds: [embed], components: [] });
        }

        return decision;
      }

      // Mark that character has gathered during this travel session
      character.travelGathered = true;
    }

    travelLog = Array.isArray(travelLog) ? travelLog : [];
    const jobPerk = getJobPerk(character.job);
    character.perk = jobPerk?.perks[0];

    const items = await fetchAllItems();
    const dbPathField = currentPath.replace(/-/g, '');
    const available = items.filter(i => i[dbPathField] === true);
    
    let decision, outcomeMessage;

    if (!available.length) {
      decision = `❌ No resources to gather.`;
      outcomeMessage = 'No resources found';
    } else {
      const weighted = createWeightedItemList(available);
      const rollRandomItem = () => {
        const baseItem = weighted[Math.floor(Math.random() * weighted.length)];
        return {
          ...baseItem
        };
      };

      const gatherRolls = [rollRandomItem()];
      let finalRoll = gatherRolls[0];
      let fieldLessonSummary = null;
      let travelGuideSummary = null;
      let activeBoost = null;
      let hasTeacherTravelBoost = false;
      let hasScholarTravelBoost = false;

      try {
        activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(character.name);
        const now = Date.now();
        hasTeacherTravelBoost =
          activeBoost &&
          activeBoost.status === 'accepted' &&
          activeBoost.category === 'Traveling' &&
          (!activeBoost.boostExpiresAt || now <= activeBoost.boostExpiresAt) &&
          typeof activeBoost.boosterJob === 'string' &&
          activeBoost.boosterJob.toLowerCase() === 'teacher';

        hasScholarTravelBoost =
          activeBoost &&
          activeBoost.status === 'accepted' &&
          activeBoost.category === 'Traveling' &&
          (!activeBoost.boostExpiresAt || now <= activeBoost.boostExpiresAt) &&
          typeof activeBoost.boosterJob === 'string' &&
          activeBoost.boosterJob.toLowerCase() === 'scholar';

        if (hasScholarTravelBoost) {
          travelContext.scholarTravelGuideActive = true;
        }

        if (hasTeacherTravelBoost) {
          gatherRolls.push(rollRandomItem());
          const boostedResult = await applyTravelGatherBoost(character.name, gatherRolls);

          if (boostedResult) {
            if (Array.isArray(boostedResult)) {
              finalRoll = boostedResult[boostedResult.length - 1] || gatherRolls[0];
            } else {
              finalRoll = boostedResult;
            }

            const [firstRoll, secondRoll] = gatherRolls;
            const getName = (item) => item?.itemName || item?.name || 'Unknown Item';
            const chosenName = getName(finalRoll);
            fieldLessonSummary = {
              first: getName(firstRoll),
              second: getName(secondRoll),
              chosen: chosenName
            };
          }
        }
      } catch (boostError) {
        handleError(boostError, 'travelHandler.js (handleGather - boost integration)');
      }

      // Format the item data properly
      const formattedItem = {
        ...finalRoll,
        quantity: finalRoll.quantity || 1,
        category: Array.isArray(finalRoll.category) ? finalRoll.category : [finalRoll.category],
        type: Array.isArray(finalRoll.type) ? finalRoll.type : [finalRoll.type],
        subtype: Array.isArray(finalRoll.subtype) ? finalRoll.subtype : finalRoll.subtype ? [finalRoll.subtype] : [],
        perk: "", // Explicitly set perk to empty for gathered items
        obtain: "Travel" // Set the correct source for travel-gathered items
      };

      await syncToInventoryDatabase(character, formattedItem, interaction);
      try {
        const interactionUrl = interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : '';
        await logItemAcquisitionToDatabase(character, formattedItem, {
          quantity: formattedItem.quantity || 1,
          obtain: 'Travel',
          location: character.currentVillage || character.homeVillage || 'Travel',
          link: interactionUrl
        });
      } catch (logError) {
        warn('TRAVEL', `Failed to log travel gather to InventoryLog: ${logError.message}`);
      }
      
      outcomeMessage = `Gathered ${formattedItem.quantity}× ${formattedItem.itemName}.`;

      if (fieldLessonSummary) {
        outcomeMessage += `\n📘 Field Lesson: first roll **${fieldLessonSummary.first}** ➜ second roll **${fieldLessonSummary.second}** ➜ kept **${fieldLessonSummary.chosen}**.`;
      }

      try {
        if (hasScholarTravelBoost) {
          const bonusRoll = rollRandomItem();
          const formattedBonusItem = {
            ...bonusRoll,
            quantity: bonusRoll.quantity || 1,
            category: Array.isArray(bonusRoll.category) ? bonusRoll.category : [bonusRoll.category],
            type: Array.isArray(bonusRoll.type) ? bonusRoll.type : [bonusRoll.type],
            subtype: Array.isArray(bonusRoll.subtype) ? bonusRoll.subtype : bonusRoll.subtype ? [bonusRoll.subtype] : [],
            perk: "",
            obtain: "Travel"
          };

          await syncToInventoryDatabase(character, formattedBonusItem, interaction);
          try {
            const bonusInteractionUrl = interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : '';
            await logItemAcquisitionToDatabase(character, formattedBonusItem, {
              quantity: formattedBonusItem.quantity || 1,
              obtain: 'Travel',
              location: character.currentVillage || character.homeVillage || 'Travel',
              link: bonusInteractionUrl
            });
          } catch (bonusLogError) {
            warn('TRAVEL', `Failed to log scholar bonus to InventoryLog: ${bonusLogError.message}`);
          }
          travelGuideSummary = `\n📚 Travel Guide: gained an extra ${formattedBonusItem.quantity}× ${formattedBonusItem.itemName}.`;
          travelContext.scholarTravelGuideTriggered = true;
        }
      } catch (scholarError) {
        handleError(scholarError, 'travelHandler.js (handleGather - scholar boost)');
      }

      if (travelGuideSummary) {
        outcomeMessage += travelGuideSummary;
      }

      if (!hasPerk(character, 'DELIVERING')) {
        await useStamina(character._id, 1);
        // Update character object to reflect the stamina change
        character.currentStamina = Math.max(0, character.currentStamina - 1);
        outcomeMessage += ' (-1 🟩 stamina)';
      }
      decision = `🌱 ${outcomeMessage}`;
    }

    // Update embed
    const description = 
      `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n` +
      `**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n` +
      `**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}`;

    const embed = createUpdatedTravelEmbed({
      encounterMessage,
      character,
      description,
      fields: [{ name: '🔹 __Outcome__', value: outcomeMessage || 'No resources found', inline: false }],
    });
    
    if (typeof encounterMessage?.edit === 'function') {
      await encounterMessage.edit({ embeds: [embed], components: [] });
    }

    return decision;

  } catch (error) {
    handleError(error, 'travelHandler.js (handleGather)');
    throw error;
  }
}
  
// ------------------- Fight Helper -------------------
// Resolves combat, handles KO relocation, loot (incl. Chuchu logic),
// sheet sync, stamina, updates embed fields & footer, logs outcomes.
async function handleFight(interaction, character, encounterMessage, monster, travelLog, startingVillage) {
  try {
    travelLog = Array.isArray(travelLog) ? travelLog : [];
    const jobPerk = getJobPerk(character.job);
    character.perk = jobPerk?.perks[0];

    if (!monster || typeof monster.tier === 'undefined') {
      throw new Error(`Invalid monster passed to handleFight: ${JSON.stringify(monster)}`);
    }

    info('COMBAT', `Starting combat for ${character.name} vs ${monster.name} (Tier ${monster.tier})`);
    debug('COMBAT', `Initial hearts: ${character.currentHearts}/${character.maxHearts}`);

    const diceRoll = Math.floor(Math.random() * 100) + 1;
    const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character, diceRoll);
    debug('COMBAT', `Combat results - Damage: ${damageValue}, Adjusted: ${adjustedRandomValue}, Attack: ${attackSuccess}, Defense: ${defenseSuccess}`);

    const outcome = await getEncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);
    info('COMBAT', `Combat outcome: ${outcome.result}, Hearts: ${outcome.hearts}`);

    // ------------------- KO Branch -------------------
    if (outcome.result === 'KO') {
      info('COMBAT', `Character KO'd - Previous hearts: ${character.currentHearts}`, { character: character.name });
      const koEmbed = createKOEmbed(character);
      await interaction.followUp({ embeds: [koEmbed] });

      const prevHearts = character.currentHearts;
      const prevStamina = character.currentStamina;

      character.currentHearts = 0;
      character.currentStamina = 0;
      // Calculate debuff end date: midnight EST on the 7th day after KO
      const now = new Date();
      // Get EST date (UTC-5) for date comparison
      const estDate = new Date(now.getTime() - 5 * 60 * 60 * 1000);
      // Set to midnight EST 7 days from now (date only, no time)
      // Convert to UTC to ensure proper storage and retrieval
      const debuffEndDate = new Date(Date.UTC(estDate.getFullYear(), estDate.getMonth(), estDate.getDate() + 7, 5, 0, 0, 0)); // 5 AM UTC = midnight EST
      
      character.debuff = { active: true, endDate: debuffEndDate };
      character.currentVillage = startingVillage || character.homeVillage;
      character.ko = true;

      await updateCurrentHearts(character._id, 0);
      await useStamina(character._id, 0);
      await character.save();

      travelLog.push(`fight: KO (${prevHearts}→0 hearts, ${prevStamina}→0 stam)`);
      return `💀 ${character.name} was KO'd and moved back to ${capitalizeFirstLetter(character.currentVillage)}.`;
    }

    // ------------------- Fallback Heart Damage -------------------
    if (outcome.result !== 'Win!/Loot' && outcome.result !== 'KO') {
      if (typeof outcome.hearts !== 'number' || isNaN(outcome.hearts)) {
        warn('COMBAT', `Invalid hearts value for ${monster.name}, using fallback`);
        outcome.hearts = 1;
        outcome.result = `💥⚔️ The monster attacks! You lose ❤️ 1 heart!`;
      }
      debug('COMBAT', `Applying damage - Hearts: ${character.currentHearts} → ${character.currentHearts - outcome.hearts}`);
    }

    // ------------------- Sync Hearts & Stamina -------------------
    const latestCharacter = await Character.findById(character._id);
    character.currentStamina = latestCharacter.currentStamina;
    character.currentHearts = latestCharacter.currentHearts;

    // ------------------- Loot & Combat Result -------------------
    let decision, outcomeMessage, lootLine = '';
    let item = null;

    if (outcome.result === 'Win!/Loot') {
      const drops = await fetchItemsByMonster(monster.name);
      if (drops.length > 0) {
        const weighted = createWeightedItemList(drops, adjustedRandomValue);
        item = weighted[Math.floor(Math.random() * weighted.length)];

        // Chuchu Special Case
        if (item && /Chuchu/.test(monster.name)) {
          const qty = /Large/.test(monster.name) ? 3 : /Medium/.test(monster.name) ? 2 : 1;
          let jellyType;
          if (monster.name.includes('Ice')) {
            jellyType = 'White Chuchu Jelly';
          } else if (monster.name.includes('Fire')) {
            jellyType = 'Red Chuchu Jelly';
          } else if (monster.name.includes('Electric')) {
            jellyType = 'Yellow Chuchu Jelly';
          } else {
            jellyType = 'Chuchu Jelly';
          }
          item.itemName = jellyType;
          item.quantity = qty;
          
          // Fetch the correct emoji from the database for the jelly type
          try {
            const ItemModel = require('@/models/ItemModel');
            const jellyItem = await ItemModel.findOne({ itemName: jellyType }).select('emoji');
            if (jellyItem && jellyItem.emoji) {
              item.emoji = jellyItem.emoji;
            }
          } catch (error) {
            error('TRAVEL', `Error fetching emoji for ${jellyType}`, error);
            // Keep the original emoji if there's an error
          }
        } else if (item) {
          item.quantity = 1;
        }

        if (item) {
          const lootItem = { ...item, obtain: "Travel", perk: "" }; // Explicitly set perk to empty for monster loot
          await syncToInventoryDatabase(character, lootItem, interaction);
          try {
            const fightInteractionUrl = interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : '';
            await logItemAcquisitionToDatabase(character, lootItem, {
              quantity: lootItem.quantity || 1,
              obtain: 'Travel',
              location: character.currentVillage || character.homeVillage || 'Travel',
              link: fightInteractionUrl
            });
          } catch (lootLogError) {
            warn('TRAVEL', `Failed to log travel loot to InventoryLog: ${lootLogError.message}`);
          }
          lootLine = `\nLooted ${item.itemName} × ${item.quantity}\n`;
          outcomeMessage = `${generateVictoryMessage(item)}${lootLine}`;
          travelLog.push(`fight: win & loot (${item.quantity}× ${item.itemName})`);
        } else {
          outcomeMessage = generateVictoryMessage({ itemName: 'nothing' });
          travelLog.push('fight: win but no loot');
        }
      } else {
        outcomeMessage = generateVictoryMessage({ itemName: 'nothing' });
        travelLog.push('fight: win but no loot');
      }

      // Like Like Special Case - Chance to get extra item from chest
      if (monster.name === 'Like Like') {
        const chestDropChance = Math.random();
        if (chestDropChance < 0.25) { // 25% chance to get extra item
          const allItems = await fetchAllItems();
          if (allItems && allItems.length > 0) {
            // Select completely random item (like travel chest)
            const randomItem = allItems[Math.floor(Math.random() * allItems.length)];
            try {
              const chestItem = {
                itemName: randomItem.itemName,
                emoji: randomItem.emoji || '📦',
                quantity: 1,
                obtain: "Travel",
                perk: ""
              };
              await syncToInventoryDatabase(character, chestItem, interaction);
              try {
                const chestInteractionUrl = interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : '';
                await logItemAcquisitionToDatabase(character, chestItem, {
                  quantity: 1,
                  obtain: 'Travel',
                  location: character.currentVillage || character.homeVillage || 'Travel',
                  link: chestInteractionUrl
                });
              } catch (chestLogError) {
                warn('TRAVEL', `Failed to log Like Like chest to InventoryLog: ${chestLogError.message}`);
              }
              const itemEmoji = randomItem.emoji || '📦';
              outcomeMessage += `\n🎁 **Found a chest!** Received ${itemEmoji} ${randomItem.itemName}!`;
              travelLog.push(`chest: ${randomItem.itemName}`);
            } catch (chestError) {
              handleError(chestError, 'travelHandler.js (Like Like chest)');
            }
          }
        }
      }
    } else if (outcome.result === 'KO') {
      // ... existing KO logic ...
    } else {
      outcomeMessage = generateDamageMessage(outcome.hearts);
      // Remove the direct travel log addition since it will be handled by the caller
      // travelLog.push(outcomeMessage);
    }

    // ------------------- Embed Update -------------------
    const description =
      `> ${outcomeMessage}` +
      `\n**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}` +
      `\n**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}`;

    const embed = createUpdatedTravelEmbed({
      encounterMessage,
      character,
      description,
      fields: [],
      footer: { text: `Tier: ${monster.tier}` },
      titleFallback: `${character.name} vs ${monster?.name || 'Unknown Monster'}`
    });

    if (typeof encounterMessage?.edit === 'function') {
      await encounterMessage.edit({ embeds: [embed], components: [] });
    }

    return outcomeMessage;

  } catch (error) {
    handleError(error, 'travelHandler.js (handleFight)');
    throw error;
  }
}

  // ------------------- Flee Helper -------------------
  // Handles three flee outcomes (success, failed+attack, failed+no-attack),
  // handles KO on flee, stamina, updates embed & logs outcomes.
  async function handleFlee(interaction, character, encounterMessage, monster, travelLog, travelContext = null) {
    try {
      travelContext = travelContext || {};
      travelLog = Array.isArray(travelLog) ? travelLog : [];
  
      const jobPerk = getJobPerk(character.job);
      character.perk = jobPerk?.perks[0];
  
    let fleeOptions = {};
    let boleroApplied = false;
    let boleroTriggered = false;

    try {
      if (!travelContext?.boleroOfFireUsedToday) {
        const activeBoost = await retrieveBoostingRequestFromTempDataByCharacter(character.name);
        const now = Date.now();
        const hasEntertainerTravelBoost =
          activeBoost &&
          activeBoost.status === 'accepted' &&
          activeBoost.category === 'Traveling' &&
          (!activeBoost.boostExpiresAt || now <= activeBoost.boostExpiresAt) &&
          typeof activeBoost.boosterJob === 'string' &&
          activeBoost.boosterJob.toLowerCase() === 'entertainer';

        if (hasEntertainerTravelBoost) {
          fleeOptions.advantageAttempts = 2;
          boleroApplied = true;
          if (travelContext) {
            travelContext.entertainerBoleroActive = true;
          }
        }
      }
    } catch (boostError) {
      handleError(boostError, 'travelHandler.js (handleFlee - boost integration)');
    }

    const result = await attemptFlee(character, monster, fleeOptions);
    let decision, outcomeMessage;

    if (boleroApplied && travelContext) {
      travelContext.boleroOfFireUsedToday = true;
      if (result.attempts && result.attempts > 1) {
        boleroTriggered = true;
        travelContext.entertainerBoleroTriggered = true;
      }
    }
  
      if (result.success) {
        // success
        if (!hasPerk(character, 'DELIVERING')) {
          await useStamina(character._id, 1);
          // Update character object to reflect the stamina change
          character.currentStamina = Math.max(0, character.currentStamina - 1);
        }
        
      decision = `💨 Successfully fled${!hasPerk(character,'DELIVERING')?' (-1 🟩 stamina)':''}.`;
      outcomeMessage = `${character.name} escaped the ${monster.name}!`;

      if (boleroApplied) {
        if (boleroTriggered) {
          const extraMsg = `🎵 Bolero of Fire granted an extra escape attempt!`;
          decision += `\n${extraMsg}`;
          outcomeMessage += `\n${extraMsg}`;
        } else {
          const readyMsg = `🎵 Bolero of Fire kept the path clear for your escape.`;
          decision += `\n${readyMsg}`;
          outcomeMessage += `\n${readyMsg}`;
        }
      }
      } else if (result.attacked) {
        // attacked while fleeing
        const latestCharacter = await Character.findById(character._id);
        character.currentStamina = latestCharacter.currentStamina;
        character.currentHearts = latestCharacter.currentHearts;

        if (!hasPerk(character, 'DELIVERING')) {
          await useStamina(character._id, 1);
          // Update character object to reflect the stamina change
          character.currentStamina = Math.max(0, character.currentStamina - 1);
        }

        outcomeMessage = `${character.name} failed to flee and took ${result.damage} hearts${!hasPerk(character, 'DELIVERING') ? ' (-1 🟩 stamina)' : ''}.`;
        if (character.currentHearts <= 0) {
          decision = `💔 KO'd while fleeing!`;
          // KO on flee: KO state and heart update are already handled by useHearts
          // Only update debuff and village if needed (if not already handled)
          // Calculate debuff end date: midnight EST on the 7th day after KO
          const now = new Date();
          // Get EST date (UTC-5) for date comparison
      const estDate = new Date(now.getTime() - 5 * 60 * 60 * 1000);
          // Set to midnight EST 7 days from now (date only, no time)
          // Convert to UTC to ensure proper storage and retrieval
          const debuffEndDate = new Date(Date.UTC(estDate.getFullYear(), estDate.getMonth(), estDate.getDate() + 7, 5, 0, 0, 0)); // 5 AM UTC = midnight EST
          
          character.debuff = { active: true, endDate: debuffEndDate };
          character.currentVillage = ['rudania','vhintl'].includes(character.currentVillage)?'inariko':character.homeVillage;
          character.ko = true;
          await useStamina(character._id,0);
          await character.save();
        } else {
        decision = `⚠️ Flee failed and took ${result.damage} ❤️ hearts.`;
        }

      if (boleroApplied) {
        const boleroFailMsg = boleroTriggered
          ? `🎵 Bolero of Fire tried twice, but the monster still caught up!`
          : `🎵 Bolero of Fire was ready, but the monster still caught you!`;
        decision += `\n${boleroFailMsg}`;
        outcomeMessage += `\n${boleroFailMsg}`;
      }
      } else {
        // no attack
        if (!hasPerk(character, 'DELIVERING')) {
          await useStamina(character._id, 1);
          // Update character object to reflect the stamina change
          character.currentStamina = Math.max(0, character.currentStamina - 1);
        }
        
      decision = `💨 Flee failed but no attack${!hasPerk(character,'DELIVERING')?' (-1 🟩 stamina)':''}.`;
      outcomeMessage = `${character.name} tried to flee but wasn't attacked.`;

      if (boleroApplied) {
        const extraMsg = boleroTriggered
          ? `🎵 Bolero of Fire's second try kept you untouched.`
          : `🎵 Bolero of Fire steadied your escape, even without a reroll.`;
        decision += `\n${extraMsg}`;
        outcomeMessage += `\n${extraMsg}`;
      }
      }
  
      // Update embed with flee-specific flavor text
      const description = 
        `⚔️ ${outcomeMessage}\n\n` +
        `**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n` +
        `**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}`;

      const embed = createUpdatedTravelEmbed({
        encounterMessage,
        character,
        description,
        fields: [],
      });

      if (typeof encounterMessage?.edit === 'function') {
        await encounterMessage.edit({ embeds: [embed], components: [] });
      }

      return decision;
  
    } catch (error) {
      handleError(error, 'travelHandler.js (handleFlee)');
      throw error;
    }
  }
  
  // ------------------- Do Nothing Helper -------------------
// Presents extended flavor pool (10+ lines), logs event, and edits embed (NO stamina cost).
async function handleDoNothing(interaction, character, encounterMessage, travelLog, preGeneratedFlavor = null) {
  try {
    travelLog = Array.isArray(travelLog) ? travelLog : [];
    const jobPerk = getJobPerk(character.job);
    character.perk = jobPerk?.perks[0];
    let randomFlavor;
    if (preGeneratedFlavor) {
      randomFlavor = preGeneratedFlavor;
    } else {
      randomFlavor = `${character.name} rested quietly.`;
    }
    // No stamina should be used when truly doing nothing
    const decision = `😴 ${randomFlavor}`;
    // Update embed
    const description = 
      `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n` +
      `**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n` +
      `**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}`;
    const embed = createUpdatedTravelEmbed({
      encounterMessage,
      character,
      description,
      fields: [],
    });
    if (typeof encounterMessage?.edit === 'function') {
      await encounterMessage.edit({ embeds: [embed], components: [] });
    }
    return decision;
  } catch (error) {
    handleError(error, 'travelHandler.js (handleDoNothing)');
    throw error;
  }
}

// ------------------- Open Chest Helper -------------------
// Opens a travel chest, deducts 1 stamina, and adds a random item to inventory.
async function handleOpenChest(interaction, character, encounterMessage, travelLog) {
  try {
    travelLog = Array.isArray(travelLog) ? travelLog : [];
    
    // Check stamina
    if (character.currentStamina <= 0) {
      const decision = `❌ **Not enough stamina to open the chest.**\n\n*You need at least 1 🟩 stamina to open a chest.*`;
      
      const description = 
        `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n` +
        `**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n` +
        `**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}`;
      
      const embed = createUpdatedTravelEmbed({
        encounterMessage,
        character,
        description,
        fields: [],
      });
      
      if (typeof encounterMessage?.edit === 'function') {
        await encounterMessage.edit({ embeds: [embed], components: [] });
      }
      
      return decision;
    }
    
    // Deduct stamina
    await useStamina(character._id, 1);
    character.currentStamina = Math.max(0, character.currentStamina - 1);
    
    // Fetch all items and select random one (100% random, like ruugame)
    const allItems = await fetchAllItems();
    
    if (!allItems || allItems.length === 0) {
      const decision = `❌ **No items found in database.**`;
      
      const description = 
        `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n` +
        `**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n` +
        `**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}`;
      
      const embed = createUpdatedTravelEmbed({
        encounterMessage,
        character,
        description,
        fields: [],
      });
      
      if (typeof encounterMessage?.edit === 'function') {
        await encounterMessage.edit({ embeds: [embed], components: [] });
      }
      
      return decision;
    }
    
    // Select completely random item (no weighting, no filtering)
    const randomItem = allItems[Math.floor(Math.random() * allItems.length)];
    
    // Add item to inventory
    try {
      await addItemInventoryDatabase(
        character._id,
        randomItem.itemName,
        1,
        interaction,
        'Travel Chest'
      );
    } catch (inventoryError) {
      handleError(inventoryError, 'travelHandler.js (handleOpenChest - inventory)');
      // Continue even if inventory add fails (same pattern as gather)
    }
    
    // Create decision message
    const itemEmoji = randomItem.emoji || '📦';
    const decision = `🎁 Opened chest and found ${itemEmoji} ${randomItem.itemName}! (-1 🟩 stamina)`;
    
    // Update embed
    const description = 
      `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n` +
      `**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n` +
      `**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}`;
    
    const embed = createUpdatedTravelEmbed({
      encounterMessage,
      character,
      description,
      fields: [{ name: '🔹 __Outcome__', value: `Found ${itemEmoji} ${randomItem.itemName}`, inline: false }],
    });
    
    if (typeof encounterMessage?.edit === 'function') {
      await encounterMessage.edit({ embeds: [embed], components: [] });
    }
    
    return decision;
  } catch (error) {
    handleError(error, 'travelHandler.js (handleOpenChest)');
    throw error;
  }
}


// ============================================================================
// ------------------- Primary Handler -------------------
// ============================================================================

// ------------------- Interaction Routing -------------------
// Routes button interactions to specific helpers based on customId.
async function handleTravelInteraction(
    interaction,
    character,
    pathEmoji,
    currentPath,
    encounterMessage,
    monster,
    travelLog,
    startingVillage,
    preGeneratedFlavor,
    travelContext = null
  ) {
    try {
      // Check if this is a button interaction and handle potential expiration
      if (interaction?.isButton?.()) {
        try {
          await interaction.deferUpdate();
        } catch (err) {
          if (err.code === 10062) {
            warn('INTERACTION', `Interaction expired for user ${interaction.user?.id || 'unknown'}`);
            return '❌ This interaction has expired. Please try again or reissue the command.';
          } else if (err.code === 10008) {
            warn('INTERACTION', `Unknown interaction for user ${interaction.user?.id || 'unknown'}`);
            return '❌ This interaction is no longer valid. Please try again or reissue the command.';
          } else {
            error('INTERACTION', 'Unexpected interaction error', err);
            throw err;
          }
        }
      }
      
      const customId = interaction.customId;
      let result;
  
      switch (customId) {
        case 'recover':
          result = await handleRecover(interaction, character, encounterMessage, travelLog, travelContext);
          break;
        case 'gather':
          result = await handleGather(interaction, character, currentPath, encounterMessage, travelLog, travelContext);
          break;
        case 'open_chest':
          result = await handleOpenChest(interaction, character, encounterMessage, travelLog);
          break;
        case 'fight':
          if (!monster) {
            result = '❌ Could not resolve monster for this encounter.';
            break;
          }
          // Check if character has blight stage 3 or higher (monsters don't attack them)
          if (character.blighted && character.blightStage >= 3) {
            result = `❌ **${character.name} cannot fight monsters during travel!**\n\n<:blight_eye:805576955725611058> At **Blight Stage ${character.blightStage}**, monsters no longer attack your character. You cannot fight monsters until you are healed.`;
            break;
          }
          result = await handleFight(interaction, character, encounterMessage, monster, travelLog, startingVillage);
          break;
        case 'flee':
          result = await handleFlee(interaction, character, encounterMessage, monster, travelLog, travelContext);
          break;
        case 'do_nothing':
          result = await handleDoNothing(interaction, character, encounterMessage, travelLog, preGeneratedFlavor);
          break;
        default:
          if (monster) {
            // Check if character has blight stage 3 or higher (monsters don't attack them)
            if (character.blighted && character.blightStage >= 3) {
              result = `❌ **${character.name} cannot fight monsters during travel!**\n\n<:blight_eye:805576955725611058> At **Blight Stage ${character.blightStage}**, monsters no longer attack your character. You cannot fight monsters until you are healed.`;
            } else {
              result = await handleFight(interaction, character, encounterMessage, monster, travelLog, startingVillage);
            }
          } else {
            result = await handleDoNothing(interaction, character, encounterMessage, travelLog, preGeneratedFlavor);
          }
      }
  
      return result;
    } catch (error) {
      handleError(error, 'travelHandler.js (main)');
      throw error;
    }
  }
  
  // ============================================================================
  // ------------------- Export the Function -------------------
  // ============================================================================
  
  // Exports the primary handler for use in the command module.
  module.exports = { 
    handleTravelInteraction,
    createFinalTravelEmbed,
    assignVillageVisitingRole
  };
