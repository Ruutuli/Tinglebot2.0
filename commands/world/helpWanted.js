// ============================================================================
// ------------------- /helpwanted Command -------------------
// Handles quest completion for Help Wanted system
// ============================================================================

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { handleError } = require('../../utils/globalErrorHandler');
const Character = require('../../models/CharacterModel');
const User = require('../../models/UserModel');
const { getTodaysQuests, hasUserCompletedQuestToday, hasUserReachedWeeklyQuestLimit, updateQuestEmbed } = require('../../modules/helpWantedModule');
const HelpWantedQuest = require('../../models/HelpWantedQuestModel');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================
const QUEST_TYPE_EMOJIS = {
  'item': '📦',
  'monster': '⚔️',
  'escort': '🛡️',
  'crafting': '🔨'
};

const COOLDOWN_MESSAGES = {
  daily: '🕐 **Daily Quest Cooldown Active!**\n\nYou\'ve already completed a Help Wanted quest today. Each adventurer can only take on **one quest per day** to maintain balance in the realm.\n\n⏰ **Next Quest Available:** Tomorrow at midnight (EST)\n💡 **Tip:** Use this time to rest, gather resources, or help other adventurers!',
  weekly: '📅 **Weekly Quest Limit Reached!**\n\nYou\'ve already completed **3 Help Wanted quests this week**. Each adventurer is limited to **3 quests per week** to maintain balance in the realm.\n\n⏰ **Next Quest Available:** Monday at midnight (EST)\n💡 **Tip:** Use this time to rest, gather resources, or help other adventurers!'
};

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

/**
 * Validates user cooldowns for quest completion
 * @param {string} userId - Discord user ID
 * @returns {Promise<{canProceed: boolean, message?: string}>}
 */
async function validateUserCooldowns(userId) {
  const dailyCompleted = await hasUserCompletedQuestToday(userId);
  
  if (dailyCompleted) {
    return { canProceed: false, message: COOLDOWN_MESSAGES.daily };
  }
  
  const weeklyLimitReached = await hasUserReachedWeeklyQuestLimit(userId);
  
  if (weeklyLimitReached) {
    return { canProceed: false, message: COOLDOWN_MESSAGES.weekly };
  }
  
  return { canProceed: true };
}

/**
 * Validates character eligibility for quest participation
 * @param {Object} character - Character object
 * @returns {Promise<{canProceed: boolean, message?: string}>}
 */
function validateCharacterEligibility(character) {
  if (character.currentHearts === 0) {
    return { canProceed: false, message: `❌ ${character.name} is KO'd and cannot participate.` };
  }
  
  if (character.debuff?.active) {
    return { canProceed: false, message: `❌ ${character.name} is debuffed and cannot participate.` };
  }
  
  if (character.blightEffects?.noMonsters) {
    return { canProceed: false, message: `❌ ${character.name} cannot fight monsters due to blight.` };
  }
  
  return { canProceed: true };
}

/**
 * Validates character location for quest completion
 * @param {Object} character - Character object
 * @param {Object} quest - Quest object
 * @returns {Promise<{canProceed: boolean, message?: string}>}
 */
function validateCharacterLocation(character, quest) {
  if (quest.type === 'escort') {
    const requiredLocation = quest.requirements.location?.toLowerCase();
    const currentLocation = character.currentVillage?.toLowerCase();
    
    if (currentLocation !== requiredLocation) {
      return {
        canProceed: false,
        message: `❌ **Wrong Village!**\n\n**${character.name}** is currently in **${character.currentVillage}**, but needs to be in **${quest.requirements.location}** to complete this escort quest.\n\n🏠 **Home Village:** ${character.homeVillage}\n📍 **Current Location:** ${character.currentVillage}\n🎯 **Quest Village:** ${quest.village}\n🎯 **Destination:** ${quest.requirements.location}\n\n**For escort quests, characters must travel to the destination village to complete the quest.**\n\n💡 **Need to travel?** Use \`/travel\` to move between villages.`
      };
    }
  } else {
    if (character.currentVillage.toLowerCase() !== quest.village.toLowerCase()) {
      return {
        canProceed: false,
        message: `❌ **Wrong Village!**\n\n**${character.name}** is currently in **${character.currentVillage}**, but this quest is for **${quest.village}**.\n\n🏠 **Home Village:** ${character.homeVillage}\n📍 **Current Location:** ${character.currentVillage}\n🎯 **Quest Village:** ${quest.village}\n\n**Characters must be in their home village to complete Help Wanted quests.**\n\n💡 **Need to travel?** Use \`/travel\` to move between villages.`
      };
    }
  }
  
  return { canProceed: true };
}

/**
 * Validates quest requirements based on quest type
 * @param {Object} character - Character object
 * @param {Object} quest - Quest object
 * @returns {Promise<{requirementsMet: boolean, message: string}>}
 */
async function validateQuestRequirements(character, quest) {
  switch (quest.type) {
    case 'item':
      return await validateItemQuestRequirements(character, quest);
    case 'monster':
      return {
        requirementsMet: false,
        message: `🗡️ **Monster Quest:** This quest requires defeating monsters. Please use the \`/helpwanted monsterhunt\` command instead.`
      };
    case 'escort':
      return validateEscortQuestRequirements(character, quest);
    case 'crafting':
      return await validateCraftingQuestRequirements(character, quest);
    default:
      return { requirementsMet: false, message: '❌ Unknown quest type.' };
  }
}

/**
 * Validates item quest requirements
 * @param {Object} character - Character object
 * @param {Object} quest - Quest object
 * @returns {Promise<{requirementsMet: boolean, message: string}>}
 */
async function validateItemQuestRequirements(character, quest) {
  const { connectToInventories } = require('../../database/db');
  
  try {
    const inventoriesConnection = await connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    const collectionName = character.name.toLowerCase();
    const inventoryCollection = db.collection(collectionName);
    
    const dbItems = await inventoryCollection.find({
      characterId: character._id,
      itemName: { $regex: new RegExp(quest.requirements.item, 'i') }
    }).toArray();
    
    const totalQuantity = dbItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    
    if (totalQuantity >= quest.requirements.amount) {
      return {
        requirementsMet: true,
        message: `📦 **Item Quest:** ✅ ${character.name} has ${totalQuantity}x ${quest.requirements.item} (required: ${quest.requirements.amount}x)`
      };
    } else {
      return {
        requirementsMet: false,
        message: `📦 **Item Quest:** ❌ ${character.name} has ${totalQuantity}x ${quest.requirements.item} but needs ${quest.requirements.amount}x`
      };
    }
  } catch (error) {
    console.error(`[helpWanted.js]: ❌ Error checking database inventory:`, error);
    return {
      requirementsMet: false,
      message: `📦 **Item Quest:** ❌ Error checking inventory. Please try again later.`
    };
  }
}

/**
 * Validates escort quest requirements
 * @param {Object} character - Character object
 * @param {Object} quest - Quest object
 * @returns {Promise<{requirementsMet: boolean, message: string}>}
 */
function validateEscortQuestRequirements(character, quest) {
  const requiredLocation = quest.requirements.location?.toLowerCase();
  
  if (!requiredLocation) {
    return {
      requirementsMet: false,
      message: `🛡️ **Escort Quest:** ❌ Quest requirements are incomplete - no location specified.`
    };
  }
  
  return {
    requirementsMet: true,
    message: `🛡️ **Escort Quest:** ✅ ${character.name} has successfully escorted the villager to ${quest.requirements.location}`
  };
}

/**
 * Validates crafting quest requirements
 * @param {Object} character - Character object
 * @param {Object} quest - Quest object
 * @returns {Promise<{requirementsMet: boolean, message: string}>}
 */
async function validateCraftingQuestRequirements(character, quest) {
  const { connectToInventories } = require('../../database/db');
  
  try {
    const inventoriesConnection = await connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    const collectionName = character.name.toLowerCase();
    const inventoryCollection = db.collection(collectionName);
    
    const dbItems = await inventoryCollection.find({
      characterId: character._id,
      itemName: { $regex: new RegExp(quest.requirements.item, 'i') },
      obtain: { $regex: /crafting/i }
    }).toArray();
    
    const totalCraftedQuantity = dbItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    
    if (totalCraftedQuantity >= quest.requirements.amount) {
      return {
        requirementsMet: true,
        message: `🔨 **Crafting Quest:** ✅ ${character.name} has crafted ${totalCraftedQuantity}x ${quest.requirements.item} (required: ${quest.requirements.amount}x)`
      };
    } else {
      return {
        requirementsMet: false,
        message: `🔨 **Crafting Quest:** ❌ ${character.name} has crafted ${totalCraftedQuantity}x ${quest.requirements.item} but needs ${quest.requirements.amount}x. Use \`/crafting\` to craft more.`
      };
    }
  } catch (error) {
    console.error(`[helpWanted.js]: ❌ Error checking database inventory:`, error);
    return {
      requirementsMet: false,
      message: `🔨 **Crafting Quest:** ❌ Error checking inventory. Please try again later.`
    };
  }
}

/**
 * Removes items from character inventory for quest completion
 * @param {Object} character - Character object
 * @param {Object} quest - Quest object
 * @param {Object} interaction - Discord interaction
 * @returns {Promise<boolean>}
 */
async function removeQuestItems(character, quest, interaction) {
  if (quest.type !== 'crafting' && quest.type !== 'item') {
    return true;
  }
  
  try {
    const { connectToInventories } = require('../../database/db');
    const { removeItemInventoryDatabase } = require('../../utils/inventoryUtils');
    
    const inventoriesConnection = await connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    const collectionName = character.name.toLowerCase();
    const inventoryCollection = db.collection(collectionName);
    
    let itemsToRemove = [];
    
    if (quest.type === 'crafting') {
      itemsToRemove = await inventoryCollection.find({
        characterId: character._id,
        itemName: { $regex: new RegExp(quest.requirements.item, 'i') },
        obtain: { $regex: /crafting/i }
      }).toArray();
    } else if (quest.type === 'item') {
      itemsToRemove = await inventoryCollection.find({
        characterId: character._id,
        itemName: { $regex: new RegExp(quest.requirements.item, 'i') }
      }).toArray();
    }
    
    let totalRemoved = 0;
    
    for (const item of itemsToRemove) {
      if (totalRemoved >= quest.requirements.amount) break;
      
      const remainingToRemove = quest.requirements.amount - totalRemoved;
      const quantityToRemove = Math.min(item.quantity, remainingToRemove);
      
      const removed = await removeItemInventoryDatabase(
        character._id, 
        item.itemName, 
        quantityToRemove, 
        interaction, 
        quest.type === 'crafting' ? 'Quest (Crafting)' : 'Quest (Item)'
      );
      
      if (removed) {
        totalRemoved += quantityToRemove;
      }
    }
    
    return true;
    
  } catch (error) {
    console.error(`[helpWanted.js]: ❌ Error removing items for quest completion:`, error);
    return false;
  }
}

/**
 * Updates user tracking for quest completion
 * @param {Object} user - User object
 * @param {Object} quest - Quest object
 * @param {string} userId - Discord user ID
 * @returns {Promise<void>}
 */
async function updateUserTracking(user, quest, userId) {
  const now = new Date();
  // Use EST timezone for midnight reset
  const today = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
  
  user.helpWanted.lastCompletion = today;
  user.helpWanted.totalCompletions = (user.helpWanted.totalCompletions || 0) + 1;
  user.helpWanted.completions.push({
    date: today,
    village: quest.village,
    questType: quest.type
  });
  await user.save();
}

/**
 * Creates quest completion success embed
 * @param {Object} character - Character object
 * @param {Object} quest - Quest object
 * @param {string} userId - Discord user ID
 * @returns {EmbedBuilder}
 */
function createQuestCompletionEmbed(character, quest, userId) {
  const successEmbed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle('✅ Quest Completed!')
    .setDescription(`**${character.name}** has successfully completed the Help Wanted quest for **${quest.village}**!`)
    .addFields(
      { name: '🎯 Quest Type', value: quest.type.charAt(0).toUpperCase() + quest.type.slice(1), inline: true },
      { name: '🏘️ Village', value: quest.village, inline: true },
      { name: '👤 Requested By', value: quest.npcName || 'Unknown NPC', inline: true },
      { name: '👤 Completed By', value: `<@${userId}>`, inline: true },
      { name: '🆔 Quest ID', value: quest.questId, inline: true }
    )
    .setFooter({ text: new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}) })
    .setTimestamp();

  // Add quest-specific details
  let questDetails = '';
  switch (quest.type) {
    case 'item':
      questDetails = `**Delivered:** ${quest.requirements.amount}x ${quest.requirements.item}`;
      break;
    case 'monster':
      questDetails = `**Defeated:** ${quest.requirements.amount}x ${quest.requirements.monster} (Tier ${quest.requirements.tier})`;
      break;
    case 'escort':
      questDetails = `**Escorted:** Safely guided villager to ${quest.requirements.location}`;
      break;
    case 'crafting':
      questDetails = `**Crafted:** ${quest.requirements.amount}x ${quest.requirements.item}`;
      break;
    default:
      questDetails = 'Quest completed successfully!';
  }

  if (questDetails) {
    successEmbed.addFields({ name: '📋 Quest Details', value: questDetails, inline: false });
  }

  return successEmbed;
}

// ============================================================================
// ------------------- Monster Hunt Functions -------------------
// ============================================================================

/**
 * Generates looted item from monster encounter
 * @param {Object} encounteredMonster - Monster object
 * @param {Array} weightedItems - Available items
 * @returns {Object} Looted item
 */
function generateLootedItem(encounteredMonster, weightedItems) {
  const randomIndex = Math.floor(Math.random() * weightedItems.length);
  const lootedItem = { ...weightedItems[randomIndex] };
  
  if (encounteredMonster.name.includes("Chuchu")) {
    let jellyType;
    if (encounteredMonster.name.includes('Ice')) {
      jellyType = 'White Chuchu Jelly';
    } else if (encounteredMonster.name.includes('Fire')) {
      jellyType = 'Red Chuchu Jelly';
    } else if (encounteredMonster.name.includes('Electric')) {
      jellyType = 'Yellow Chuchu Jelly';
    } else {
      jellyType = 'Chuchu Jelly';
    }
    const quantity = encounteredMonster.name.includes("Large")
      ? 3
      : encounteredMonster.name.includes("Medium")
      ? 2
      : 1;
    lootedItem.itemName = jellyType;
    lootedItem.quantity = quantity;
    lootedItem.emoji = '<:Chuchu_Jelly:744755431175356416>';
  } else {
    lootedItem.quantity = 1;
  }
  
  return lootedItem;
}

/**
 * Processes monster encounter and returns outcome
 * @param {Object} character - Character object
 * @param {string} monsterName - Monster name
 * @param {number} heartsRemaining - Current hearts
 * @returns {Promise<Object>} Encounter outcome
 */
async function processMonsterEncounter(character, monsterName, heartsRemaining) {
  const { fetchMonsterByName, fetchItemsByMonster } = require('../../database/db.js');
  const { calculateFinalValue, createWeightedItemList } = require('../../modules/rngModule.js');
  const { getEncounterOutcome } = require('../../modules/encounterModule.js');
  const { updateCurrentHearts } = require('../../modules/characterStatsModule.js');
  const { generateVictoryMessage, generateDamageMessage, generateFinalOutcomeMessage, generateDefenseBuffMessage, generateAttackBuffMessage } = require('../../modules/flavorTextModule.js');
  
  const monster = await fetchMonsterByName(monsterName);
  if (!monster) {
    throw new Error(`Monster "${monsterName}" not found in database`);
  }
  
  const items = await fetchItemsByMonster(monsterName);
  const diceRoll = Math.floor(Math.random() * 100) + 1;
  const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess } = calculateFinalValue(character, diceRoll);
  const outcome = await getEncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);
  
  // Generate outcome message
  let outcomeMessage;
  if (outcome.hearts) {
    outcomeMessage = outcome.result === "KO" ? generateDamageMessage("KO") : generateDamageMessage(outcome.hearts);
  } else if (outcome.defenseSuccess) {
    outcomeMessage = generateDefenseBuffMessage(outcome.defenseSuccess, adjustedRandomValue, damageValue);
  } else if (outcome.attackSuccess) {
    outcomeMessage = generateAttackBuffMessage(outcome.attackSuccess, adjustedRandomValue, damageValue);
  } else if (outcome.result === "Win!/Loot") {
    outcomeMessage = generateVictoryMessage(adjustedRandomValue, outcome.defenseSuccess, outcome.attackSuccess);
  } else {
    outcomeMessage = generateFinalOutcomeMessage(damageValue, outcome.defenseSuccess, outcome.attackSuccess, adjustedRandomValue, damageValue);
  }
  
  // Update hearts if damaged
  let newHeartsRemaining = heartsRemaining;
  if (outcome.hearts) {
    newHeartsRemaining = Math.max(heartsRemaining - outcome.hearts, 0);
    await updateCurrentHearts(character._id, newHeartsRemaining);
  }
  
  // Process loot if available
  let lootedItem = null;
  if (outcome.canLoot && items.length > 0) {
    const weightedItems = createWeightedItemList(items, adjustedRandomValue);
    if (weightedItems.length > 0) {
      lootedItem = generateLootedItem(monster, weightedItems);
    }
  }
  
  return {
    monster,
    outcome,
    outcomeMessage,
    newHeartsRemaining,
    lootedItem,
    adjustedRandomValue
  };
}

/**
 * Handles monster hunt quest completion
 * @param {Object} interaction - Discord interaction
 * @param {string} questId - Quest ID
 * @param {string} characterName - Character name
 * @returns {Promise<void>}
 */
async function handleMonsterHunt(interaction, questId, characterName) {
  // Fetch quest
  const quest = await HelpWantedQuest.findOne({ questId });
  if (!quest) {
    return await interaction.editReply({ content: '❌ Quest not found.' });
  }
  if (quest.type !== 'monster') {
    return await interaction.editReply({ content: '❌ This quest is not a monster hunt.' });
  }
  
  // Get monster list
  let monsterList = [];
  if (Array.isArray(quest.requirements.monsters)) {
    monsterList = quest.requirements.monsters;
  } else if (quest.requirements.monster) {
    const amount = quest.requirements.amount || 1;
    monsterList = Array(amount).fill(quest.requirements.monster);
  } else {
    return await interaction.editReply({ content: '❌ No monsters specified for this quest.' });
  }
  
  if (monsterList.length === 0) {
    return await interaction.editReply({ content: '❌ No monsters specified for this quest.' });
  }
  
  // Fetch character
  const character = await Character.findOne({ userId: interaction.user.id, name: characterName });
  if (!character) {
    return await interaction.editReply({ content: '❌ Character not found.' });
  }
  
  // Validate cooldowns
  const cooldownCheck = await validateUserCooldowns(interaction.user.id);
  if (!cooldownCheck.canProceed) {
    return await interaction.editReply({ content: cooldownCheck.message });
  }
  
  // Validate character eligibility
  const eligibilityCheck = validateCharacterEligibility(character);
  if (!eligibilityCheck.canProceed) {
    return await interaction.editReply({ content: eligibilityCheck.message });
  }
  
  // Validate character location
  const locationCheck = validateCharacterLocation(character, quest);
  if (!locationCheck.canProceed) {
    return await interaction.editReply({ content: locationCheck.message });
  }
  
  // Check stamina
  const currentStamina = parseInt(character.currentStamina) || 0;
  if (currentStamina < 1) {
    return await interaction.editReply({ content: `❌ ${character.name} needs at least 1 stamina to attempt a monster hunt.` });
  }
  
  // Deduct stamina and start hunt
  const newStamina = Math.max(0, currentStamina - 1);
  character.currentStamina = newStamina;
  await character.save();
  
  const startEmbed = new EmbedBuilder()
    .setColor(0x0099FF)
    .setTitle(`🗡️ Monster Hunt Begins!`)
    .setDescription(`**${character.name}** has embarked on a dangerous hunt for quest **${questId}**!\n\n🎯 **Target:** ${monsterList.length} ${monsterList[0]}${monsterList.length > 1 ? 's' : ''} threatening the area\n⚡ **Stamina Cost:** 1\n❤️ **Starting Hearts:** ${character.currentHearts}\n\n*The hunt is on! Can they survive the challenge?*`)
    .setFooter({ text: `Quest ID: ${questId}` })
    .setTimestamp();
  
  await interaction.editReply({ embeds: [startEmbed] });
  
  // Process monster encounters
  const { handleKO } = require('../../modules/characterStatsModule.js');
  const { createMonsterEncounterEmbed } = require('../../embeds/embeds.js');
  const { addItemInventoryDatabase } = require('../../utils/inventoryUtils.js');
  const { isValidGoogleSheetsUrl, safeAppendDataToSheet, extractSpreadsheetId, authorizeSheets } = require('../../utils/googleSheetsUtils.js');
  const { v4: uuidv4 } = require('uuid');
  
  let summary = [];
  let defeatedAll = true;
  let heartsRemaining = character.currentHearts;
  let totalLoot = [];
  
  for (let i = 0; i < monsterList.length; i++) {
    const monsterName = monsterList[i];
    
    try {
      const encounterResult = await processMonsterEncounter(character, monsterName, heartsRemaining);
      heartsRemaining = encounterResult.newHeartsRemaining;
      
      // Handle KO
      if (heartsRemaining === 0) {
        await handleKO(character._id);
        
        const koEmbed = createMonsterEncounterEmbed(
          character,
          encounterResult.monster,
          encounterResult.outcomeMessage,
          0,
          null,
          false,
          encounterResult.adjustedRandomValue,
          i + 1, // currentMonster (1-based index)
          monsterList.length // totalMonsters
        );
        
        await interaction.followUp({ embeds: [koEmbed] });
        summary.push({ monster: monsterName, result: 'KO', message: encounterResult.outcomeMessage });
        defeatedAll = false;
        break;
      }
      
      // Handle loot
      if (encounterResult.lootedItem) {
        totalLoot.push({ monster: monsterName, item: encounterResult.lootedItem });
        
        const inventoryLink = character.inventory || character.inventoryLink;
        if (inventoryLink && isValidGoogleSheetsUrl(inventoryLink)) {
          try {
            await addItemInventoryDatabase(
              character._id,
              encounterResult.lootedItem.itemName,
              encounterResult.lootedItem.quantity,
              encounterResult.lootedItem.category.join(", "),
              encounterResult.lootedItem.type.join(", "),
              interaction
            );
            
            // Note: Google Sheets sync is handled by addItemInventoryDatabase
          } catch (error) {
            console.error(`[helpWanted.js]: ❌ Failed to add loot to inventory:`, error);
          }
        }
      }
      
      // Add to summary
      if (encounterResult.outcome.hearts) {
        summary.push({ monster: monsterName, result: 'Damaged', message: encounterResult.outcomeMessage });
      } else if (encounterResult.outcome.defenseSuccess) {
        summary.push({ monster: monsterName, result: 'Defended', message: encounterResult.outcomeMessage });
      } else if (encounterResult.outcome.attackSuccess) {
        summary.push({ monster: monsterName, result: 'Attacked', message: encounterResult.outcomeMessage });
      } else if (encounterResult.outcome.result === 'Win!/Loot') {
        summary.push({ monster: monsterName, result: 'Victory', message: encounterResult.outcomeMessage });
      } else {
        summary.push({ monster: monsterName, result: 'Other', message: encounterResult.outcomeMessage });
      }
      
      // Send battle embed
      const battleEmbed = createMonsterEncounterEmbed(
        character,
        encounterResult.monster,
        encounterResult.outcomeMessage,
        heartsRemaining,
        null,
        false,
        encounterResult.adjustedRandomValue,
        i + 1, // currentMonster (1-based index)
        monsterList.length // totalMonsters
      );
      
      await interaction.followUp({ embeds: [battleEmbed] });
      
      // Add delay between battles
      if (i < monsterList.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error(`[helpWanted.js]: ❌ Error processing monster encounter:`, error);
      await interaction.followUp({ content: `❌ Error processing encounter with ${monsterName}.`, flags: 64 });
      return;
    }
  }
  
  // Handle quest completion
  if (defeatedAll) {
    quest.completed = true;
    quest.completedBy = { userId: interaction.user.id, characterId: character._id, timestamp: new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}) };
    await quest.save();
    
    const user = await User.findOne({ discordId: interaction.user.id });
    if (user) {
      await updateUserTracking(user, quest, interaction.user.id);
    }
    
    await updateQuestEmbed(interaction.client, quest, quest.completedBy);
  }
  
  // Send final summary
  await sendMonsterHuntSummary(interaction, character, questId, monsterList, summary, totalLoot, defeatedAll, heartsRemaining);
}

/**
 * Sends monster hunt summary embed
 * @param {Object} interaction - Discord interaction
 * @param {Object} character - Character object
 * @param {string} questId - Quest ID
 * @param {Array} monsterList - List of monsters
 * @param {Array} summary - Battle summary
 * @param {Array} totalLoot - Total loot gained
 * @param {boolean} defeatedAll - Whether all monsters were defeated
 * @param {number} heartsRemaining - Hearts remaining
 * @returns {Promise<void>}
 */
async function sendMonsterHuntSummary(interaction, character, questId, monsterList, summary, totalLoot, defeatedAll, heartsRemaining) {
  const resultMsg = defeatedAll ? 
    `🎉 **${character.name} has successfully completed the monster hunt!**\n\nAll ${monsterList.length} monsters have been defeated and the quest is complete.` : 
    `💀 **${character.name} was defeated during the monster hunt.**\n\nThey managed to defeat ${summary.filter(s => s.result !== 'KO').length} out of ${monsterList.length} monsters before being KO'd.`;
  
  const details = summary.map((s, index) => `**${index + 1}.** ${s.monster}\n> ${s.message}`).join('\n\n');
  
  // Create loot summary
  let lootSummary = '';
  if (totalLoot.length > 0) {
    const ItemModel = require('../../models/ItemModel');
    const { formatItemDetails } = require('../../embeds/embeds.js');
    
    const formattedLoot = await Promise.all(
      totalLoot.map(async (loot) => {
        const itemDetails = await ItemModel.findOne({ 
          itemName: loot.item.itemName 
        }).select('emoji');
        const emoji = itemDetails?.emoji || '🔹';
        return formatItemDetails(loot.item.itemName, loot.item.quantity, emoji);
      })
    );
    
    lootSummary = formattedLoot.join('\n');
  }
  
  const { getVillageColorByName } = require('../../modules/locationsModule');
  const villageColor = getVillageColorByName(character.currentVillage) || (defeatedAll ? 0x00FF00 : 0xFF0000);
  
  const summaryEmbed = new EmbedBuilder()
    .setColor(villageColor)
    .setTitle(`🗡️ Monster Hunt Results - ${character.name}`)
    .setDescription(resultMsg)
    .setAuthor({
      name: `${character.name} 🔗`,
      iconURL: character.icon || 'https://via.placeholder.com/128',
      url: character.inventory || ''
    })
    .setThumbnail(character.icon || 'https://via.placeholder.com/128')
    .addFields(
      { 
        name: defeatedAll ? '🏆 Battle Summary' : '💀 Hunt Summary', 
        value: details, 
        inline: false 
      },
      { 
        name: '📊 Statistics', 
        value: `❤️ **Hearts Remaining:** ${heartsRemaining}\n⚔️ **Monsters Defeated:** ${defeatedAll ? monsterList.length : summary.filter(s => s.result !== 'KO').length}/${monsterList.length}\n⚡ **Stamina Used:** 1\n🎯 **Quest Progress:** ${defeatedAll ? '🏅 COMPLETED' : '❌ FAILED'}`, 
        inline: true 
      }
    )
    .setFooter({ text: `${character.currentVillage} Monster Hunt | Quest ID: ${questId} | ${new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})}` })
    .setTimestamp()
    .setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png/v1/fill/w_600,h_29,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');
  
  if (lootSummary) {
    summaryEmbed.addFields({ 
      name: `💎 Loot Gained (${totalLoot.length} items)`, 
      value: lootSummary, 
      inline: false 
    });
  }
  
  await interaction.followUp({ embeds: [summaryEmbed] });
}

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('helpwanted')
    .setDescription('Complete your village Help Wanted quest!')
    .addSubcommand(sub =>
      sub.setName('complete')
        .setDescription('Attempt to complete today\'s Help Wanted quest for your character.')
        .addStringOption(opt =>
          opt.setName('questid')
            .setDescription('The quest ID to complete')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('character')
            .setDescription('Your character\'s name (if you have multiple)')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('monsterhunt')
        .setDescription('Attempt a boss rush of monsters for a Help Wanted quest!')
        .addStringOption(opt =>
          opt.setName('id')
            .setDescription('The quest ID')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('character')
            .setDescription('Your character\'s name (if you have multiple)')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    
    if (sub === 'monsterhunt') {
      const questId = interaction.options.getString('id');
      const characterName = interaction.options.getString('character');
      
      await interaction.deferReply();
      
      try {
        await handleMonsterHunt(interaction, questId, characterName);
      } catch (error) {
        handleError(error, 'helpWanted.js', {
          commandName: 'helpwanted monsterhunt',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          questId,
          characterName
        });
        
        await interaction.editReply({ content: '❌ An error occurred during the monster hunt. Please try again later.' });
      }
      return;
    }
    
    if (sub === 'complete') {
      const questId = interaction.options.getString('questid');
      const characterName = interaction.options.getString('character');
      
      await interaction.deferReply();
      
      try {
        // Fetch quest
        const quest = await HelpWantedQuest.findOne({ questId });
        if (!quest) {
          return await interaction.editReply({ content: '❌ Quest not found.' });
        }

        // Fetch character and user
        const character = await Character.findOne({ userId: interaction.user.id, name: characterName });
        if (!character) {
          return await interaction.editReply({ content: '❌ Character not found.' });
        }

        const user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
          return await interaction.editReply({ content: '❌ User not found.' });
        }

        // Validate cooldowns
        const cooldownCheck = await validateUserCooldowns(interaction.user.id);
        if (!cooldownCheck.canProceed) {
          return await interaction.editReply({ content: cooldownCheck.message });
        }

        // Check quest status
        if (quest.completed) {
          return await interaction.editReply({ 
            content: `❌ This quest has already been completed by <@${quest.completedBy?.userId || 'unknown'}>.`
          });
        }
        
        // Validate character eligibility
        const eligibilityCheck = validateCharacterEligibility(character);
        if (!eligibilityCheck.canProceed) {
          return await interaction.editReply({ content: eligibilityCheck.message });
        }
        
        // Validate character location
        const locationCheck = validateCharacterLocation(character, quest);
        if (!locationCheck.canProceed) {
          return await interaction.editReply({ content: locationCheck.message });
        }

        // Validate quest requirements
        const requirementsCheck = await validateQuestRequirements(character, quest);
        if (!requirementsCheck.requirementsMet) {
          return await interaction.editReply({ 
            content: `❌ Quest requirements not met.\n\n${requirementsCheck.message}`
          });
        }

        // Remove items if needed
        const itemsRemoved = await removeQuestItems(character, quest, interaction);
        if (!itemsRemoved) {
          return await interaction.editReply({ 
            content: `❌ Failed to remove items from inventory. Please try again later.`
          });
        }

        // Mark quest completed
        quest.completed = true;
        quest.completedBy = { 
          userId: interaction.user.id, 
          characterId: character._id, 
          timestamp: new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}) 
        };
        await quest.save();

        // Update user tracking
        await updateUserTracking(user, quest, interaction.user.id);

        // Update quest embed
        await updateQuestEmbed(interaction.client, quest, quest.completedBy);

        // Send success response
        const successEmbed = createQuestCompletionEmbed(character, quest, interaction.user.id);
        await interaction.editReply({ embeds: [successEmbed] });

      } catch (error) {
        handleError(error, 'helpWanted.js', {
          commandName: 'helpwanted complete',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          characterName: characterName,
          questId: questId
        });
        
        await interaction.editReply({ content: '❌ An error occurred. Please try again later.' });
      }
      return;
    }
  }
}; 