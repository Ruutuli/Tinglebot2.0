// ============================================================================
// ------------------- Standard Libraries -------------------
// ============================================================================
const { v4: uuidv4 } = require('uuid');

// ------------------- Discord.js Components -------------------
const { EmbedBuilder } = require('discord.js');

// ------------------- Database Services -------------------
const { fetchAllItems, fetchItemsByMonster } = require('../database/db');

// ------------------- Embeds -------------------
const { createKOEmbed,createUpdatedTravelEmbed } = require('../embeds/embeds');

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

// ------------------- Utility Functions -------------------
const { addItemInventoryDatabase } = require('../utils/inventoryUtils');
const { syncItem, SOURCE_TYPES } = require('../utils/itemSyncUtils');
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
// ------------------- Private Helpers -------------------
// ============================================================================

// ------------------- Recover Helper -------------------
// Attempts to recover a heart if character not KO'd, has stamina or Delivering perk,
// handles full-hearts case, updates stats, travel log, and edits encounter embed.
async function handleRecover(interaction, character, encounterMessage, travelLog) {
  try {
    travelLog = Array.isArray(travelLog) ? travelLog : [];
    const jobPerk = getJobPerk(character.job);
    character.perk = jobPerk?.perks[0];
    console.log(`[travelHandler.js]: 💖 ${character.name} attempting recovery`);
  
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
      fields: [], // or just omit `fields` entirely if you're not adding anything else
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
    console.error(`[travelHandler.js]: ❌ Invalid currentPath type: ${typeof currentPath}`);
    throw new Error(`Invalid currentPath value: "${currentPath}" — expected a string like "leafDewWay".`);
  }
  
  try {
    travelLog = Array.isArray(travelLog) ? travelLog : [];
    const jobPerk = getJobPerk(character.job);
    character.perk = jobPerk?.perks[0];
    console.log(`[travelHandler.js]: 📦 ${character.name} gathering on ${currentPath}`);

    const items = await fetchAllItems();
    const dbPathField = currentPath.replace(/-/g, '');
    const available = items.filter(i => i[dbPathField] === true);
    
    if (!available.length) {
      console.warn(`[travelHandler.js]: ⚠️ No items available for path "${currentPath}"`);
    }
    
    let decision, outcomeMessage;

    if (!available.length) {
      decision = `❌ No resources to gather.`;
    } else {
      const weighted = createWeightedItemList(available);
      const chosen = weighted[Math.floor(Math.random() * weighted.length)];
      console.log(`[travelHandler.js]: 🎲 Selected: ${chosen.itemName}`);
      
      // Format the item data properly
      const formattedItem = {
        ...chosen,
        quantity: chosen.quantity || 1,
        category: Array.isArray(chosen.category) ? chosen.category : [chosen.category],
        type: Array.isArray(chosen.type) ? chosen.type : [chosen.type],
        subtype: Array.isArray(chosen.subtype) ? chosen.subtype : chosen.subtype ? [chosen.subtype] : []
      };

      await syncItem(character, formattedItem, interaction, SOURCE_TYPES.GATHERING);
      
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
    console.log(`[travelHandler.js]: ⚔️ ${character.name} vs ${monster.name}`);

    if (!monster || typeof monster.tier === 'undefined') {
      throw new Error(`Invalid monster passed to handleFight: ${JSON.stringify(monster)}`);
    }

    const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character);
    const outcome = await getEncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);

    // ------------------- KO Branch -------------------
    if (outcome.result === 'KO') {
      const koEmbed = createKOEmbed(character);
      await interaction.followUp({ embeds: [koEmbed] });

      const prevHearts = character.currentHearts;
      const prevStamina = character.currentStamina;

      character.currentHearts = 0;
      character.currentStamina = 0;
      character.debuff = { active: true, endDate: new Date(Date.now() + 7 * 86400000) };
      character.currentVillage = startingVillage;
      character.ko = true;

      await updateCurrentHearts(character._id, 0);
      await useStamina(character._id, 0);
      await character.save();

      travelLog.push(`fight: KO (${prevHearts}→0 hearts, ${prevStamina}→0 stam)`);
      return `💀 ${character.name} was KO'd and moved to recovery village.`;
    }

    // ------------------- Fallback Heart Damage -------------------
    if (outcome.result !== 'Win!/Loot' && outcome.result !== 'KO') {
      if (typeof outcome.hearts !== 'number' || isNaN(outcome.hearts)) {
        console.warn(`[travelHandler.js]: ⚠️ Invalid hearts value for ${monster.name}, using fallback`);
        outcome.hearts = 1;
        outcome.result = `💥⚔️ The monster attacks! You lose ❤️ 1 heart!`;
      }
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
          await syncItem(character, item, interaction, SOURCE_TYPES.TRAVEL_LOOT);
          lootLine = `\n Looted ${item.itemName} × ${item.quantity}\n`;
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
      travelLog.push(`fight: loss (lost ${outcome.hearts} heart${outcome.hearts === 1 ? '' : 's'}, no loot)`);
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
        
        if (typeof result.damage !== 'number' || isNaN(result.damage)) {
          throw new Error(`Flee damage is invalid or missing: ${result.damage}`);
        }        
        

// attacked while fleeing
await useHearts(character._id, result.damage);
const latestCharacter = await Character.findById(character._id);
character.currentStamina = latestCharacter.currentStamina;
character.currentHearts = latestCharacter.currentHearts;
console.log(`[travelHandler.js]: Tracked ${result.damage} heart(s) damage (deducted by characterStatsModule).`);

if (!hasPerk(character, 'DELIVERING')) {
  await useStamina(character._id, 1);
  character.currentStamina = Math.max(0, character.currentStamina - 1);
}

outcomeMessage = `${character.name} failed to flee and took ${result.damage} hearts${!hasPerk(character, 'DELIVERING') ? ' (-1 🟩 stamina)' : ''}.`;
decision = result.damage >= character.maxHearts
  ? `💔 KO'd while fleeing!`
  : `⚠️ Flee failed and took ${result.damage} ❤️ hearts.`;

  
        // KO on flee
        if (character.currentHearts <= 0) {
          character.currentStamina = 0;
          character.debuff = { active: true, endDate: new Date(Date.now()+7*86400000) };
          character.currentVillage = ['rudania','vhintl'].includes(character.currentVillage)?'inariko':character.homeVillage;
          character.ko = true;
          await updateCurrentHearts(character._id,0);
          await useStamina(character._id,0);
          await character.save();
        } else {
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
  
// Update embed
const description = 
  `🌸 It's a nice and safe day of traveling. What do you want to do next?\n> ${decision}\n\n` +
  `**❤️ Hearts:** ${character.currentHearts}/${character.maxHearts}\n` +
  `**🟩 Stamina:** ${character.currentStamina}/${character.maxStamina}`;

  const embed = createUpdatedTravelEmbed({
    encounterMessage,
    character,
    description,
    fields: [], // or just omit `fields` entirely if you're not adding anything else
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
      console.log(`[travelHandler.js]: 🔄 Using pre-generated flavor for Do Nothing: ${randomFlavor}`);
    } else {
      randomFlavor = `${character.name} rested quietly.`;
      console.error(`[travelHandler.js]: ❌ No preGeneratedFlavor provided to handleDoNothing. Using fallback.`);
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
      fields: [], // No outcome field
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
  module.exports = { handleTravelInteraction };
