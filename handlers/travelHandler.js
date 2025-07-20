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
const { fetchAllItems, fetchItemsByMonster } = require('../database/db');

// ------------------- Embeds -------------------
const { 
  createKOEmbed,
  createUpdatedTravelEmbed,
  pathEmojis,
  villageEmojis,
  DEFAULT_IMAGE_URL
} = require('../embeds/embeds');

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
const {
  attemptFlee,
  calculateFinalValue,
  createWeightedItemList
} = require('../modules/rngModule');
const { capitalizeFirstLetter, capitalizeWords } = require('../modules/formattingModule');

// ------------------- Utility Functions -------------------
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { syncToInventoryDatabase, SOURCE_TYPES } = require('../utils/inventoryUtils');
const {
  appendSheetData,
  authorizeSheets,
  safeAppendDataToSheet
} = require('../utils/googleSheetsUtils');
const {
  extractSpreadsheetId,
  isValidGoogleSheetsUrl
} = require('../utils/validation');
const { handleError } = require('../utils/globalErrorHandler');

const Character = require('../models/CharacterModel');

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
// Assigns the appropriate village visiting role to the user when they arrive at a destination
async function assignVillageVisitingRole(interaction, destination, character = null) {
  try {
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
              console.log(`[travelHandler.js]: ✅ Removed visiting role ${roleId} from ${interaction.user.tag}`);
            } catch (error) {
              console.warn(`[travelHandler.js]: ⚠️ Failed to remove role ${roleId}: ${error.message}`);
            }
          }
        }
    
        // Only add visiting role if not returning to home village
        if (!isHomeVillage) {
          if (!member.roles.cache.has(destinationRoleId)) {
            try {
              await member.roles.add(destinationRoleId);
              console.log(`[travelHandler.js]: ✅ Added ${capitalizeFirstLetter(destination)} visiting role to ${interaction.user.tag}`);
            } catch (error) {
              console.warn(`[travelHandler.js]: ⚠️ Failed to add ${capitalizeFirstLetter(destination)} visiting role: ${error.message}`);
            }
          } else {
            console.log(`[travelHandler.js]: ℹ️ ${interaction.user.tag} already has ${capitalizeFirstLetter(destination)} visiting role`);
          }
        } else {
          console.log(`[travelHandler.js]: ℹ️ ${interaction.user.tag} returned to home village ${capitalizeFirstLetter(destination)} - no visiting role assigned`);
        }
      } else {
        console.warn('[travelHandler.js]: ⚠️ Bot lacks ManageRoles permission - skipping role management');
      }
    } else {
      console.warn(`[travelHandler.js]: ⚠️ No role ID found for destination: ${capitalizeFirstLetter(destination)}`);
    }
  } catch (error) {
    console.warn(`[travelHandler.js]: ⚠️ Role management failed: ${error.message}`);
    // Continue with travel completion even if role management fails
  }
}

// ------------------- Recover Helper -------------------
// Attempts to recover a heart if character not KO'd, has stamina or Delivering perk,
// handles full-hearts case, updates stats, travel log, and edits encounter embed.
async function handleRecover(interaction, character, encounterMessage, travelLog) {
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
    if (character.currentStamina >= 1 || hasPerk(character, 'DELIVERING')) {
      if (!hasPerk(character, 'DELIVERING')) {
        await useStamina(character._id, 1);
        character.currentStamina -= 1;
      }
      await recoverHearts(character._id, 1);
      character.currentHearts = Math.min(character.maxHearts, character.currentHearts + 1);
      await updateCurrentHearts(character._id, character.currentHearts);
  
      decision = `💖 Recovered 1 heart${hasPerk(character,'DELIVERING') ? '' : ' (-1 🟩 stamina)'}.`;
      outcomeMessage = `${character.name} recovered a heart${hasPerk(character,'DELIVERING') ? '' : ' and lost 1 🟩 stamina'}.`;
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
async function handleGather(interaction, character, currentPath, encounterMessage, travelLog) {
  if (typeof currentPath !== 'string') {
    throw new Error(`Invalid currentPath value: "${currentPath}" — expected a string like "leafDewWay".`);
  }
  
  try {
    travelLog = Array.isArray(travelLog) ? travelLog : [];
    const jobPerk = getJobPerk(character.job);
    character.perk = jobPerk?.perks[0];

    const items = await fetchAllItems();
    const dbPathField = currentPath.replace(/-/g, '');
    const available = items.filter(i => i[dbPathField] === true);
    
    let decision, outcomeMessage;

    if (!available.length) {
      decision = `❌ No resources to gather.`;
    } else {
      const weighted = createWeightedItemList(available);
      const chosen = weighted[Math.floor(Math.random() * weighted.length)];
      
      // Format the item data properly
      const formattedItem = {
        ...chosen,
        quantity: chosen.quantity || 1,
        category: Array.isArray(chosen.category) ? chosen.category : [chosen.category],
        type: Array.isArray(chosen.type) ? chosen.type : [chosen.type],
        subtype: Array.isArray(chosen.subtype) ? chosen.subtype : chosen.subtype ? [chosen.subtype] : [],
        perk: "" // Explicitly set perk to empty for gathered items
      };

      await syncToInventoryDatabase(character, formattedItem, interaction);
      
      outcomeMessage = `Gathered ${formattedItem.quantity}× ${formattedItem.itemName}.`;

      if (!hasPerk(character, 'DELIVERING')) {
        await useStamina(character._id, 1);
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

    console.log(`[travelHandler.js]: 🎯 Starting combat for ${character.name} vs ${monster.name} (Tier ${monster.tier})`);
    console.log(`[travelHandler.js]: ❤️ Initial hearts: ${character.currentHearts}/${character.maxHearts}`);

    const diceRoll = Math.floor(Math.random() * 100) + 1;
    const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character, diceRoll);
    console.log(`[travelHandler.js]: ⚔️ Combat results - Damage: ${damageValue}, Adjusted: ${adjustedRandomValue}, Attack: ${attackSuccess}, Defense: ${defenseSuccess}`);

    const outcome = await getEncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);
    console.log(`[travelHandler.js]: 🎲 Combat outcome: ${outcome.result}, Hearts: ${outcome.hearts}`);

    // ------------------- KO Branch -------------------
    if (outcome.result === 'KO') {
      console.log(`[travelHandler.js]: 💀 Character KO'd - Previous hearts: ${character.currentHearts}`);
      const koEmbed = createKOEmbed(character);
      await interaction.followUp({ embeds: [koEmbed] });

      const prevHearts = character.currentHearts;
      const prevStamina = character.currentStamina;

      character.currentHearts = 0;
      character.currentStamina = 0;
      character.debuff = { active: true, endDate: new Date(Date.now() + 6 * 86400000) };
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
        console.warn(`[travelHandler.js]: ⚠️ Invalid hearts value for ${monster.name}, using fallback`);
        outcome.hearts = 1;
        outcome.result = `💥⚔️ The monster attacks! You lose ❤️ 1 heart!`;
      }
      console.log(`[travelHandler.js]: 💔 Applying damage - Hearts: ${character.currentHearts} → ${character.currentHearts - outcome.hearts}`);
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
        } else if (item) {
          item.quantity = 1;
        }

        if (item) {
          await syncToInventoryDatabase(character, {
            ...item,
            obtain: "Travel",
            perk: "" // Explicitly set perk to empty for monster loot
          }, interaction);
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
  async function handleFlee(interaction, character, encounterMessage, monster, travelLog) {
    try {
      travelLog = Array.isArray(travelLog) ? travelLog : [];
  
      const jobPerk = getJobPerk(character.job);
      character.perk = jobPerk?.perks[0];
  
      const result = await attemptFlee(character, monster);
      let decision, outcomeMessage;
  
      if (result.success) {
        // success
        if (!hasPerk(character, 'DELIVERING')) {
          await useStamina(character._id, 1);
          character.currentStamina = Math.max(0, character.currentStamina - 1);
        }
        
        decision = `💨 Successfully fled${!hasPerk(character,'DELIVERING')?' (-1 🟩 stamina)':''}.`;
        outcomeMessage = `${character.name} escaped the ${monster.name}!`;
      } else if (result.attacked) {
        // attacked while fleeing
        const latestCharacter = await Character.findById(character._id);
        character.currentStamina = latestCharacter.currentStamina;
        character.currentHearts = latestCharacter.currentHearts;

        if (!hasPerk(character, 'DELIVERING')) {
          await useStamina(character._id, 1);
          character.currentStamina = Math.max(0, character.currentStamina - 1);
        }

        outcomeMessage = `${character.name} failed to flee and took ${result.damage} hearts${!hasPerk(character, 'DELIVERING') ? ' (-1 🟩 stamina)' : ''}.`;
        if (character.currentHearts <= 0) {
          decision = `💔 KO'd while fleeing!`;
          // KO on flee: KO state and heart update are already handled by useHearts
          // Only update debuff and village if needed (if not already handled)
          character.debuff = { active: true, endDate: new Date(Date.now()+6*86400000) };
          character.currentVillage = ['rudania','vhintl'].includes(character.currentVillage)?'inariko':character.homeVillage;
          character.ko = true;
          await useStamina(character._id,0);
          await character.save();
        } else {
          decision = `⚠️ Flee failed and took ${result.damage} ❤️ hearts.`;
        }
      } else {
        // no attack
        if (!hasPerk(character, 'DELIVERING')) {
          await useStamina(character._id, 1);
          character.currentStamina = Math.max(0, character.currentStamina - 1);
        }
        
        decision = `💨 Flee failed but no attack${!hasPerk(character,'DELIVERING')?' (-1 🟩 stamina)':''}.`;
        outcomeMessage = `${character.name} tried to flee but wasn't attacked.`;
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
    handleError(error, 'travelHandler.js (handleGather)');
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
    preGeneratedFlavor
  ) {
    try {
      if (interaction?.isButton?.()) {
        try {
          await interaction.deferUpdate();
        } catch (err) {
          if (err.code === 10062) {
            return '❌ This interaction has expired. Please try again or reissue the command.';
          } else {
            throw err;
          }
        }
      }
      
      const customId = interaction.customId;
      let result;
  
      switch (customId) {
        case 'recover':
          result = await handleRecover(interaction, character, encounterMessage, travelLog);
          break;
        case 'gather':
          result = await handleGather(interaction, character, currentPath, encounterMessage, travelLog);
          break;
        case 'fight':
          if (!monster) {
            result = '❌ Could not resolve monster for this encounter.';
            break;
          }
          result = await handleFight(interaction, character, encounterMessage, monster, travelLog, startingVillage);
          break;
        case 'flee':
          result = await handleFlee(interaction, character, encounterMessage, monster, travelLog);
          break;
        default:
          if (monster) {
            result = await handleFight(interaction, character, encounterMessage, monster, travelLog, startingVillage);
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
