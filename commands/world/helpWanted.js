// ============================================================================
// ------------------- /helpwanted Command -------------------
// Handles quest completion for Help Wanted system
// ============================================================================

const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { handleInteractionError } = require('../../utils/globalErrorHandler');
const { escapeRegExp } = require('../../utils/inventoryUtils');
const User = require('../../models/UserModel');
const Character = require('../../models/CharacterModel');
const { getTodaysQuests, hasUserCompletedQuestToday, hasUserReachedWeeklyQuestLimit, updateQuestEmbed } = require('../../modules/helpWantedModule');
const HelpWantedQuest = require('../../models/HelpWantedQuestModel');
const { getWeatherWithoutGeneration } = require('../../services/weatherService');
const VillageShopItem = require('../../models/VillageShopsModel');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================
const QUEST_TYPE_EMOJIS = {
  'item': '📦',
  'monster': '⚔️',
  'escort': '🛡️',
  'crafting': '🔨',
  'art': '🎨',
  'writing': '📝'
};

const VILLAGE_SHOP_SPECIAL_WEATHER_MAX_RETRY = 1;



// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

/**
 * Creates an embed for blight rejection with NPC icon and message
 * @param {Object} character - Character object
 * @param {Object} quest - Quest object (required for proper NPC matching)
 * @returns {EmbedBuilder}
 */
function createBlightRejectionEmbed(character, quest) {
  const { EmbedBuilder } = require('discord.js');
  const NPCs = require('../../modules/NPCsModule').NPCs;
  
  // Always use the quest giver NPC - no fallback to random
  const npcName = quest?.npcName || 'Unknown NPC';
  const npcData = NPCs[npcName];
  
  const embed = new EmbedBuilder()
    .setColor('#8B0000') // Dark red for blight
    .setTitle('💀 NPC Declines Help')
    .setDescription(`**${npcName}** looks at **${character.name}** with concern, noticing the telltale signs of blight.`)
    .addFields({
      name: '🗣️ NPC Response',
      value: `"I'm sorry, but I cannot accept help from someone who is blighted. Please seek healing from an Oracle, Sage, or Dragon first. Your health and safety come first."`,
      inline: false
    })
    .addFields({
      name: '💊 Next Steps',
      value: '• Seek healing from an Oracle, Sage, or Dragon\n• Use `/blight heal` to request healing\n• Check the Community Board for available healers',
      inline: false
    })
    .setFooter({ text: 'Blight Status Check', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
    .setTimestamp();
  
  // Add NPC icon as thumbnail if available
  if (npcData && npcData.icon) {
    embed.setThumbnail(npcData.icon);
  }
  
  // Add character icon as author
  if (character.icon) {
    embed.setAuthor({
      name: `${character.name} - Blighted`,
      iconURL: character.icon
    });
  }
  
  return embed;
}

/**
 * Validates if a quest is still valid (not expired after midnight)
 * @param {Object} quest - Quest object
 * @returns {Promise<{canProceed: boolean, message?: string}>}
 */
async function validateQuestExpiration(quest) {
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
  
  if (quest.date !== today) {
    return { 
      canProceed: false, 
      message: `❌ **Quest Expired!**\n\nThis quest was posted on **${quest.date}** and is no longer available for completion. Help Wanted quests expire at midnight (EST) on the day they are posted.\n\n⏰ **Current Date:** ${today}\n💡 **Tip:** Check the Help Wanted board for today's fresh quests!` 
    };
  }
  
  return { canProceed: true };
}

/**
 * Validates user cooldowns for quest completion
 * @param {string} userId - Discord user ID
 * @returns {Promise<{canProceed: boolean, message?: string}>}
 */
async function validateUserCooldowns(userId) {
  const dailyCompleted = await hasUserCompletedQuestToday(userId);
  
  if (dailyCompleted) {
    return { canProceed: false, embed: createDailyCooldownEmbed() };
  }
  
  const weeklyLimitReached = await hasUserReachedWeeklyQuestLimit(userId);
  
  if (weeklyLimitReached) {
    return { canProceed: false, embed: createWeeklyCooldownEmbed() };
  }
  
  return { canProceed: true };
}

/**
 * Validates character eligibility for quest participation
 * @param {Object} character - Character object
 * @param {Object} quest - Quest object (required for blight rejection context)
 * @returns {Promise<{canProceed: boolean, message?: string, embed?: EmbedBuilder}>}
 */
async function validateCharacterEligibility(character, quest) {
  // Check if character is blighted - NO characters (including mod characters) can do HWQs while blighted
  if (character.blighted) {
    return { 
      canProceed: false, 
      embed: createBlightRejectionEmbed(character, quest)
    };
  }
  
  // Check blight effects that prevent monster fighting
  if (character.blightEffects?.noMonsters) {
    return { canProceed: false, message: `❌ ${character.name} cannot fight monsters due to blight.` };
  }

  // Mod characters are immune to other negative effects and can participate
  if (character.isModCharacter) {
    return { canProceed: true };
  }

  // Check if character is KO'd
  if (character.currentHearts === 0) {
    return { canProceed: false, message: `❌ ${character.name} is KO'd and cannot participate.` };
  }
  
  // Check if character is debuffed
  if (character.debuff?.active) {
    const debuffEndDate = new Date(character.debuff.endDate);
    const now = new Date();
    
    // Check if debuff has actually expired
    if (debuffEndDate <= now) {
      // Debuff has expired, clear it
      character.debuff.active = false;
      character.debuff.endDate = null;
      await character.save();
    } else {
      // Debuff is still active
      return { canProceed: false, message: `❌ ${character.name} is debuffed and cannot participate.` };
    }
  }
  
  // Check if character is in jail
  if (character.inJail) {
    return { canProceed: false, message: `⛔ ${character.name} is in jail and cannot participate.` };
  }
  
  return { canProceed: true };
}

/**
 * Validates character location for quest completion
 * @param {Object} character - Character object
 * @param {Object} quest - Quest object
 * @returns {{canProceed: boolean, embed?: EmbedBuilder}}
 */
function validateCharacterLocation(character, quest) {
  const { createWrongVillageEmbed } = require('../../embeds/embeds.js');
  
  if (quest.type === 'escort') {
    const requiredLocation = quest.requirements.location?.toLowerCase();
    const currentLocation = character.currentVillage?.toLowerCase();
    
    if (currentLocation !== requiredLocation) {
      const embed = createWrongVillageEmbed(character, quest.village, true, quest.requirements.location);
      return {
        canProceed: false,
        embed: embed
      };
    }
  } else {
    if (character.currentVillage.toLowerCase() !== quest.village.toLowerCase()) {
      const embed = createWrongVillageEmbed(character, quest.village, false);
      return {
        canProceed: false,
        embed: embed
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
  console.log(`[helpWanted.js]: 🔍 validateQuestRequirements called for quest type: ${quest.type}`);
  
  switch (quest.type) {
    case 'item':
      console.log(`[helpWanted.js]: 📦 Validating item quest requirements`);
      return await validateItemQuestRequirements(character, quest);
    case 'monster':
      console.log(`[helpWanted.js]: ⚔️ Monster quest - redirecting to monsterhunt command`);
      return {
        requirementsMet: false,
        message: `🗡️ **Monster Quest:** This quest requires defeating monsters. Please use the \`/helpwanted monsterhunt\` command instead.`
      };
    case 'escort':
      console.log(`[helpWanted.js]: 🛡️ Validating escort quest requirements`);
      return validateEscortQuestRequirements(character, quest);
    case 'crafting':
      console.log(`[helpWanted.js]: 🔨 Validating crafting quest requirements`);
      return await validateCraftingQuestRequirements(character, quest);
    case 'art':
      console.log(`[helpWanted.js]: 🎨 Art quest - redirecting to submit art command`);
      return {
        requirementsMet: false,
        message: `🎨 **Art Quest:** This quest requires creating artwork. Please use the \`/submit art\` command with this quest ID to submit your artwork. Once approved by a moderator, the quest will be automatically completed.`
      };
    case 'writing':
      console.log(`[helpWanted.js]: 📝 Writing quest - redirecting to submit writing command`);
      return {
        requirementsMet: false,
        message: `📝 **Writing Quest:** This quest requires writing content. Please use the \`/submit writing\` command with this quest ID to submit your writing. Once approved by a moderator, the quest will be automatically completed.`
      };
    default:
      console.log(`[helpWanted.js]: ❌ Unknown quest type: ${quest.type}`);
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
    
    // Use shared inventory collection for mod characters
    let collectionName;
    if (character.isModCharacter) {
      collectionName = 'mod_shared_inventory';
    } else {
      collectionName = character.name.toLowerCase();
    }
    const inventoryCollection = db.collection(collectionName);
    
    const dbItems = await inventoryCollection.find({
      characterId: character._id,
      itemName: { $regex: new RegExp(`^${escapeRegExp(quest.requirements.item)}$`, 'i') }
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
    console.log(`[helpWanted.js]: 🔍 CRAFTING QUEST VALIDATION DEBUG`);
    console.log(`[helpWanted.js]: Character: ${character.name} (ID: ${character._id})`);
    console.log(`[helpWanted.js]: Quest requirements:`, quest.requirements);
    console.log(`[helpWanted.js]: Is mod character: ${character.isModCharacter}`);
    
    const inventoriesConnection = await connectToInventories();
    const db = inventoriesConnection.useDb('inventories');
    
    // Use shared inventory collection for mod characters
    let collectionName;
    if (character.isModCharacter) {
      collectionName = 'mod_shared_inventory';
    } else {
      collectionName = character.name.toLowerCase();
    }
    console.log(`[helpWanted.js]: Using collection: ${collectionName}`);
    
    const inventoryCollection = db.collection(collectionName);
    
    // Build the query step by step for debugging
    const itemNameRegex = new RegExp(`^${escapeRegExp(quest.requirements.item)}$`, 'i');
    const obtainRegex = /crafting/i;
    
    console.log(`[helpWanted.js]: Item name regex: ${itemNameRegex}`);
    console.log(`[helpWanted.js]: Obtain regex: ${obtainRegex}`);
    
    const query = {
      characterId: character._id,
      itemName: itemNameRegex,
      obtain: obtainRegex
    };
    console.log(`[helpWanted.js]: Database query:`, JSON.stringify(query, null, 2));
    
    const dbItems = await inventoryCollection.find(query).toArray();
    console.log(`[helpWanted.js]: Found ${dbItems.length} items matching crafting criteria`);
    
    // Log each item found
    dbItems.forEach((item, index) => {
      console.log(`[helpWanted.js]: Item ${index + 1}:`, {
        itemName: item.itemName,
        quantity: item.quantity,
        obtain: item.obtain,
        characterId: item.characterId
      });
    });
    
    const totalCraftedQuantity = dbItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
    console.log(`[helpWanted.js]: Total crafted quantity: ${totalCraftedQuantity}`);
    console.log(`[helpWanted.js]: Required amount: ${quest.requirements.amount}`);
    
    // Also check for items without the crafting filter to see what's in inventory
    const allMatchingItems = await inventoryCollection.find({
      characterId: character._id,
      itemName: itemNameRegex
    }).toArray();
    
    console.log(`[helpWanted.js]: Found ${allMatchingItems.length} total items with matching name`);
    allMatchingItems.forEach((item, index) => {
      console.log(`[helpWanted.js]: All items ${index + 1}:`, {
        itemName: item.itemName,
        quantity: item.quantity,
        obtain: item.obtain,
        characterId: item.characterId
      });
    });
    
    if (totalCraftedQuantity >= quest.requirements.amount) {
      console.log(`[helpWanted.js]: ✅ Crafting requirements MET`);
      return {
        requirementsMet: true,
        message: `🔨 **Crafting Quest:** ✅ ${character.name} has crafted ${totalCraftedQuantity}x ${quest.requirements.item} (required: ${quest.requirements.amount}x)`
      };
    } else {
      console.log(`[helpWanted.js]: ❌ Crafting requirements NOT MET`);
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
    
    // Use shared inventory collection for mod characters
    let collectionName;
    if (character.isModCharacter) {
      collectionName = 'mod_shared_inventory';
    } else {
      collectionName = character.name.toLowerCase();
    }
    const inventoryCollection = db.collection(collectionName);
    
    let itemsToRemove = [];
    
    if (quest.type === 'crafting') {
      itemsToRemove = await inventoryCollection.find({
        characterId: character._id,
        itemName: { $regex: new RegExp(`^${escapeRegExp(quest.requirements.item)}$`, 'i') },
        obtain: { $regex: /crafting/i }
      }).toArray();
    } else if (quest.type === 'item') {
      itemsToRemove = await inventoryCollection.find({
        characterId: character._id,
        itemName: { $regex: new RegExp(`^${escapeRegExp(quest.requirements.item)}$`, 'i') }
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
    
    // Update VillageShops stock if this was an item quest
    if (quest.type === 'item' && totalRemoved > 0) {
      await updateVillageShopsStock(quest.requirements.item, totalRemoved);
    }
    
    return true;
    
  } catch (error) {
    console.error(`[helpWanted.js]: ❌ Error removing items for quest completion:`, error);
    
    // Use global error handler for proper error tracking and user notification
    await handleInteractionError(error, null, {
      source: 'removeQuestItems',
      commandName: 'helpwanted',
      userTag: 'unknown',
      userId: 'unknown',
      characterName: 'unknown',
      options: { questType: quest?.type, requirements: quest?.requirements },
      responseType: 'console'
    });
    
    return false;
  }
}

/**
 * Updates VillageShops stock when items are used for quests
 * @param {string} itemName - Name of the item
 * @param {number} amountUsed - Amount used in the quest
 * @returns {Promise<void>}
 */
async function updateVillageShopsStock(itemName, amountUsed, retryAttempt = 0) {
  try {
    // Find the item in VillageShops and reduce stock
    let shopItem;
    if (itemName.includes('+')) {
      shopItem = await VillageShopItem.findOne({
        itemName: itemName
      });
    } else {
      shopItem = await VillageShopItem.findOne({
        itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') }
      });
    }
    
    if (shopItem && shopItem.stock > 0) {
      // ------------------- Failsafe: Fix specialWeather before saving -------------------
      const normalizedSpecialWeather = VillageShopItem.normalizeSpecialWeather(shopItem.specialWeather);
      if (shopItem.specialWeather !== normalizedSpecialWeather) {
        console.warn(`[helpWanted.js]: Normalizing specialWeather for ${itemName}:`, shopItem.specialWeather, '→', normalizedSpecialWeather);
        shopItem.specialWeather = normalizedSpecialWeather;
      }
      
      const newStock = Math.max(0, shopItem.stock - amountUsed);
      shopItem.stock = newStock;
      await shopItem.save();
      
      console.log(`[helpWanted.js]: Updated VillageShops stock for ${itemName}: ${shopItem.stock + amountUsed} → ${newStock}`);
    }
  } catch (error) {
    console.error(`[helpWanted.js]: ❌ Error updating VillageShops stock for ${itemName}:`, error);
    
    // ------------------- Additional debugging information -------------------
    if (error.name === 'ValidationError' && error.errors?.specialWeather) {
      console.error(`[helpWanted.js]: SpecialWeather validation error details:`, {
        itemName,
        specialWeatherValue: error.errors.specialWeather.value,
        specialWeatherType: typeof error.errors.specialWeather.value,
        errorMessage: error.errors.specialWeather.message
      });
      
      // ------------------- Auto-fix corrupted data -------------------
      try {
        console.log(`[helpWanted.js]: Attempting to fix corrupted specialWeather data...`);
        const itemFilter = itemName.includes('+')
          ? { itemName }
          : { itemName: { $regex: new RegExp(`^${escapeRegExp(itemName)}$`, 'i') } };
        const cleanupResult = await VillageShopItem.fixSpecialWeatherData({
          filter: itemFilter,
          limit: 5,
          source: 'updateVillageShopsStock'
        });
        console.log(`[helpWanted.js]: Data cleanup completed:`, cleanupResult);
        
        if (cleanupResult.updated > 0 && retryAttempt < VILLAGE_SHOP_SPECIAL_WEATHER_MAX_RETRY) {
          console.log(`[helpWanted.js]: Retrying stock update after data cleanup (attempt ${retryAttempt + 1})...`);
          return await updateVillageShopsStock(itemName, amountUsed, retryAttempt + 1);
        }
        
        if (cleanupResult.updated === 0) {
          console.warn(`[helpWanted.js]: Cleanup found no updates for ${itemName}; skipping retry to avoid loop.`);
        } else if (retryAttempt >= VILLAGE_SHOP_SPECIAL_WEATHER_MAX_RETRY) {
          console.warn(`[helpWanted.js]: Maximum retry attempts reached for ${itemName}; aborting further retries.`);
        }
      } catch (cleanupError) {
        console.error(`[helpWanted.js]: Error during data cleanup:`, cleanupError);
      }
    }
    
    // Use global error handler for proper error tracking and user notification
    await handleInteractionError(error, null, {
      source: 'updateVillageShopsStock',
      commandName: 'helpwanted',
      userTag: 'unknown',
      userId: 'unknown',
      characterName: 'unknown',
      options: { itemName, amountUsed },
      responseType: 'console'
    });
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
          questType: quest.type,
          questId: quest.questId,
          timestamp: new Date()
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

  // Add the original quest description to show what was requested
  try {
    const { getNPCQuestFlavor } = require('../../modules/NPCsModule');
    const questDescription = getNPCQuestFlavor(quest.npcName, quest.type, quest.requirements);
    if (questDescription) {
      successEmbed.addFields({ 
        name: '📜 Quest Request', 
        value: questDescription, 
        inline: false 
      });
    }
  } catch (error) {
    console.error('[helpWanted.js]: Error getting quest description:', error);
  }

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
    case 'art':
      questDetails = `**Created:** ${quest.requirements.prompt}\n**Requirement:** ${quest.requirements.requirement}`;
      break;
    case 'writing':
      questDetails = `**Written:** ${quest.requirements.prompt}\n**Requirement:** ${quest.requirements.requirement}`;
      break;
    default:
      questDetails = 'Quest completed successfully!';
  }

  if (questDetails) {
    successEmbed.addFields({ name: '📋 Quest Details', value: questDetails, inline: false });
  }

  // Add NPC thumbnail
  try {
    const NPCs = require('../../modules/NPCsModule').NPCs;
    const npcData = NPCs[quest.npcName];
    if (npcData && npcData.icon) {
      successEmbed.setThumbnail(npcData.icon);
    }
  } catch (error) {
    console.error('[helpWanted.js]: Error setting NPC thumbnail:', error);
  }

  // Add character image as author icon
  if (character.icon) {
    successEmbed.setAuthor({
      name: character.name,
      iconURL: character.icon
    });
  }

  // Add village image
  try {
    const VILLAGE_IMAGES = {
      Rudania: 'https://storage.googleapis.com/tinglebot/Graphics/border_rudania.png',
      Inariko: 'https://storage.googleapis.com/tinglebot/Graphics/border_inariko.png',
      Vhintl: 'https://storage.googleapis.com/tinglebot/Graphics/border_vhitnl.png'
    };
    
    const villageImage = VILLAGE_IMAGES[quest.village];
    if (villageImage) {
      successEmbed.setImage(villageImage);
    }
  } catch (error) {
    console.error('[helpWanted.js]: Error setting village image:', error);
  }

  return successEmbed;
}

// ------------------- Function: createQuestRequirementsEmbed -------------------
// Creates an embed for quest requirements not met
function createQuestRequirementsEmbed(requirementsCheck) {
  const { EmbedBuilder } = require('discord.js');
  
  // Extract information from the message
  const message = requirementsCheck.message;
  
  // Parse the message to extract details
  let title, description, fields = [];
  
  if (message.includes('🔨 **Crafting Quest:**')) {
    title = '🔨 Crafting Quest Requirements Not Met';
    
    // Extract character name, item, and quantities
    const match = message.match(/❌ (.*?) has crafted (\d+)x (.*?) but needs (\d+)x/);
    if (match) {
      const [, characterName, craftedQty, itemName, requiredQty] = match;
      description = `${characterName} needs to craft more **${itemName}** to complete this quest.`;
      
      fields = [
        { name: '📊 Progress', value: `${craftedQty}/${requiredQty} crafted`, inline: true },
        { name: '🎯 Still Needed', value: `${requiredQty - craftedQty}x ${itemName}`, inline: true },
        { name: '💡 How to Complete', value: 'Use `/crafting` to craft more items', inline: false }
      ];
    } else {
      description = 'You need to craft more items to complete this quest.';
      fields = [
        { name: '💡 How to Complete', value: 'Use `/crafting` to craft the required items', inline: false }
      ];
    }
  } else if (message.includes('📦 **Item Quest:**')) {
    title = '📦 Item Quest Requirements Not Met';
    description = 'You need to collect more items to complete this quest.';
    fields = [
      { name: '💡 How to Complete', value: 'Gather, craft, or trade for the required items', inline: false }
    ];
  } else if (message.includes('🗡️ **Monster Quest:**')) {
    title = '🗡️ Monster Quest Requirements Not Met';
    description = 'This quest requires defeating monsters.';
    fields = [
      { name: '💡 How to Complete', value: 'Use `/helpwanted monsterhunt` instead', inline: false }
    ];
  } else if (message.includes('🚶 **Escort Quest:**')) {
    title = '🚶 Escort Quest Requirements Not Met';
    description = 'You need to travel to the required location to complete this quest.';
    fields = [
      { name: '💡 How to Complete', value: 'Travel to the specified location using `/travel`', inline: false }
    ];
  } else if (message.includes('🎨 **Art Quest:**')) {
    title = '🎨 Art Quest Requirements Not Met';
    description = 'This quest requires creating artwork.';
    fields = [
      { name: '💡 How to Complete', value: 'Use `/submit art` with this quest ID to submit your artwork', inline: false }
    ];
  } else if (message.includes('📝 **Writing Quest:**')) {
    title = '📝 Writing Quest Requirements Not Met';
    description = 'This quest requires writing content.';
    fields = [
      { name: '💡 How to Complete', value: 'Use `/submit writing` with this quest ID to submit your writing', inline: false }
    ];
  } else {
    title = '❌ Quest Requirements Not Met';
    description = requirementsCheck.message;
  }
  
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0xFF6B35) // Orange color for warnings
    .setTimestamp();
  
  if (fields.length > 0) {
    embed.addFields(fields);
  }
  
  return embed;
}

/**
 * Creates an embed for daily quest cooldown
 * @returns {EmbedBuilder}
 */
function createDailyCooldownEmbed() {
  const embed = new EmbedBuilder()
    .setColor('#FF6B35') // Orange color for cooldown
    .setTitle('🕐 Daily Quest Cooldown Active!')
    .setDescription('You\'ve already completed a Help Wanted quest today. Each adventurer can only take on **one quest per day** to maintain balance in the realm.')
    .addFields({
      name: '⏰ Next Quest Available',
      value: 'Tomorrow at midnight (EST)',
      inline: false
    })
    .addFields({
      name: '💡 Tip',
      value: 'Use this time to rest, gather resources, or help other adventurers!',
      inline: false
    })
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setTimestamp();
  
  return embed;
}

/**
 * Creates an embed for weekly quest cooldown
 * @returns {EmbedBuilder}
 */
function createWeeklyCooldownEmbed() {
  const embed = new EmbedBuilder()
    .setColor('#FF6B35') // Orange color for cooldown
    .setTitle('📅 Weekly Quest Limit Reached!')
    .setDescription('You\'ve already completed **3 Help Wanted quests this week**. Each adventurer is limited to **3 quests per week** to maintain balance in the realm.')
    .addFields({
      name: '⏰ Next Quest Available',
      value: 'Monday at midnight (EST)',
      inline: false
    })
    .addFields({
      name: '💡 Tip',
      value: 'Use this time to rest, gather resources, or help other adventurers!',
      inline: false
    })
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setTimestamp();
  
  return embed;
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
async function generateLootedItem(encounteredMonster, weightedItems) {
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
    
    // Fetch the correct emoji from the database for the jelly type
    try {
      const ItemModel = require('../../models/ItemModel');
      const jellyItem = await ItemModel.findOne({ itemName: jellyType }).select('emoji');
      if (jellyItem && jellyItem.emoji) {
        lootedItem.emoji = jellyItem.emoji;
      }
    } catch (error) {
      console.error(`[helpWanted.js]: Error fetching emoji for ${jellyType}:`, error);
      // Keep the original emoji if there's an error
    }
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
  const { generateVictoryMessage, generateDamageMessage, generateHelpWantedDamageMessage, generateFinalOutcomeMessage, generateDefenseBuffMessage, generateAttackBuffMessage } = require('../../modules/flavorTextModule.js');
  const { getActiveBuffEffects, shouldConsumeElixir, consumeElixirBuff } = require('../../modules/elixirModule');
  
  const monster = await fetchMonsterByName(monsterName);
  if (!monster) {
    throw new Error(`Monster "${monsterName}" not found in database`);
  }
  
  const items = await fetchItemsByMonster(monsterName);
  const diceRoll = Math.floor(Math.random() * 100) + 1;
  const { damageValue, adjustedRandomValue, attackSuccess, defenseSuccess, elixirBuffs } = calculateFinalValue(character, diceRoll);
  const outcome = await getEncounterOutcome(character, monster, damageValue, adjustedRandomValue, attackSuccess, defenseSuccess);
  
  // Generate outcome message
  let outcomeMessage;
  if (outcome.hearts) {
    outcomeMessage = outcome.result === "KO" ? generateDamageMessage("KO") : generateHelpWantedDamageMessage(outcome.hearts);
  } else if (outcome.defenseSuccess) {
    outcomeMessage = generateDefenseBuffMessage(outcome.defenseSuccess, adjustedRandomValue, damageValue);
  } else if (outcome.attackSuccess) {
    outcomeMessage = generateAttackBuffMessage(outcome.attackSuccess, adjustedRandomValue, damageValue);
  } else if (outcome.result === "Win!/Loot") {
    outcomeMessage = generateVictoryMessage(adjustedRandomValue, outcome.defenseSuccess, outcome.attackSuccess);
  } else {
    outcomeMessage = generateFinalOutcomeMessage(damageValue, outcome.defenseSuccess, outcome.attackSuccess, adjustedRandomValue, damageValue);
  }
  
  // Add elixir buff information to the outcome message if active
  if (elixirBuffs && (elixirBuffs.speedBoost > 0 || elixirBuffs.stealthBoost > 0 || elixirBuffs.attackBoost > 0 || elixirBuffs.defenseBoost > 0)) {
    let buffInfo = '\n\n🧪 **Active Elixir Effects:**';
    if (elixirBuffs.speedBoost > 0) buffInfo += `\n• Speed Boost: +${elixirBuffs.speedBoost}`;
    if (elixirBuffs.stealthBoost > 0) buffInfo += `\n• Stealth Boost: +${elixirBuffs.stealthBoost}`;
    if (elixirBuffs.attackBoost > 0) buffInfo += `\n• Attack Boost: +${elixirBuffs.attackBoost}`;
    if (elixirBuffs.defenseBoost > 0) buffInfo += `\n• Defense Boost: +${elixirBuffs.defenseBoost}`;
    outcomeMessage += buffInfo;
  }
  
  // Check if elixirs should be consumed based on the encounter
  if (shouldConsumeElixir(character, 'helpWanted', { monster: monster })) {
    const consumedElixirType = character.buff.type;
    
    console.log(`[helpWanted.js]: 🧪 ${consumedElixirType} elixir consumed for ${character.name} during help wanted encounter with ${monster.name}`);
    
    
    // Log what the elixir protected against
    if (consumedElixirType === 'fireproof' && monster.name.includes('Fire')) {
      console.log(`[helpWanted.js]: 🔥 Fireproof Elixir protected ${character.name} from fire damage during encounter with ${monster.name}`);
    } else if (consumedElixirType === 'spicy' && monster.name.includes('Ice')) {
      console.log(`[helpWanted.js]: ❄️ Spicy Elixir protected ${character.name} from ice damage during encounter with ${monster.name}`);
    } else if (consumedElixirType === 'electro' && monster.name.includes('Electric')) {
      console.log(`[helpWanted.js]: ⚡ Electro Elixir protected ${character.name} from electric damage during encounter with ${monster.name}`);
    } else if (consumedElixirType === 'tough') {
      console.log(`[helpWanted.js]: 🛡️ Tough Elixir provided defense boost for ${character.name} during encounter`);
    } else if (consumedElixirType === 'mighty') {
      console.log(`[helpWanted.js]: ⚔️ Mighty Elixir provided attack boost for ${character.name} during encounter`);
    }
    
    consumeElixirBuff(character);
    // Update character in database
    const { updateCharacterById, updateModCharacterById } = require('../../database/db.js');
    const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
    await updateFunction(character._id, { buff: character.buff });
    
    // Add consumption message
    outcomeMessage += '\n\n🧪 **Elixir consumed!** The protective effects have been used up.';
  } else if (character.buff?.active) {
    // Log when elixir is not used due to conditions not met
    console.log(`[helpWanted.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
  }
  
  // Hearts are already applied in getEncounterOutcome; fetch refreshed value
  const refreshedCharacter = await Character.findById(character._id);
  const newHeartsRemaining = Math.max(0, refreshedCharacter?.currentHearts ?? heartsRemaining);
  
  // Process loot if available
  let lootedItem = null;
  if (outcome.canLoot && items.length > 0) {
    const weightedItems = createWeightedItemList(items, adjustedRandomValue);
    if (weightedItems.length > 0) {
      lootedItem = await generateLootedItem(monster, weightedItems);
    }
  }
  
  return {
    monster,
    outcome,
    outcomeMessage,
    newHeartsRemaining,
    lootedItem,
    adjustedRandomValue,
    elixirBuffs
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
  
  // Validate quest expiration
  const expirationCheck = await validateQuestExpiration(quest);
  if (!expirationCheck.canProceed) {
    return await interaction.editReply({ content: expirationCheck.message });
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
    if (cooldownCheck.embed) {
      return await interaction.editReply({ embeds: [cooldownCheck.embed] });
    } else {
      return await interaction.editReply({ content: cooldownCheck.message });
    }
  }
  
  // Validate character eligibility
  const eligibilityCheck = await validateCharacterEligibility(character, quest);
  if (!eligibilityCheck.canProceed) {
    if (eligibilityCheck.embed) {
      return await interaction.editReply({ embeds: [eligibilityCheck.embed] });
    } else {
      return await interaction.editReply({ content: eligibilityCheck.message });
    }
  }
  
  // Validate character location
  const locationCheck = validateCharacterLocation(character, quest);
  if (!locationCheck.canProceed) {
    return await interaction.editReply({ embeds: [locationCheck.embed] });
  }
  
  // ------------------- Blight Rain Infection Check -------------------
  const weather = await getWeatherWithoutGeneration(character.currentVillage);
  let blightRainMessage = null;
  if (weather?.special?.label === 'Blight Rain') {
    // Mod characters are immune to blight infection
    if (character.isModCharacter) {
      blightRainMessage =
        "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
        `◈ Your character **${character.name}** is a ${character.modTitle} of ${character.modType} and is immune to blight infection! ◈`;
    } else if (character.blighted) {
      blightRainMessage =
        "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
        `◈ Your character **${character.name}** braved the blight rain, but they're already blighted... guess it doesn't matter! ◈`;
    } else {
      // Check for resistance buffs
      const { getActiveBuffEffects, shouldConsumeElixir, consumeElixirBuff } = require('../../modules/elixirModule');
      const buffEffects = getActiveBuffEffects(character);
      let infectionChance = 0.75; // Base 75% chance
      
      // Apply resistance buffs
      if (buffEffects && buffEffects.blightResistance > 0) {
        infectionChance -= (buffEffects.blightResistance * 0.3); // Each level reduces by 30%
        console.log(`[helpWanted.js]: 🧪 Blight resistance buff applied - Infection chance reduced from 0.75 to ${infectionChance}`);
      }
      if (buffEffects && buffEffects.fireResistance > 0) {
        infectionChance -= (buffEffects.fireResistance * 0.05); // Each level reduces by 5%
        console.log(`[helpWanted.js]: 🧪 Fire resistance buff applied - Infection chance reduced from ${infectionChance} to ${infectionChance - (buffEffects.fireResistance * 0.05)}`);
      }
      
      // Consume elixirs after applying their effects
      if (shouldConsumeElixir(character, 'helpWanted', { blightRain: true })) {
        consumeElixirBuff(character);
        // Update character in database
        const { updateCharacterById, updateModCharacterById } = require('../../database/db.js');
        const updateFunction = character.isModCharacter ? updateCharacterById : updateModCharacterById;
        await updateFunction(character._id, { buff: character.buff });
      } else if (character.buff?.active) {
        // Log when elixir is not used due to conditions not met
        console.log(`[helpWanted.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
      }
      
      // Ensure chance stays within reasonable bounds
      infectionChance = Math.max(0.1, Math.min(0.95, infectionChance));
      
      if (Math.random() < infectionChance) {
        blightRainMessage = 
          "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
          `◈ Oh no... your character **${character.name}** has come into contact with the blight rain and has been **blighted**! ◈\n\n` +
          "🏥 **Healing Available:** You can be healed by **Oracles, Sages & Dragons**\n" +
          "📋 **Blight Information:** [Learn more about blight stages and healing](https://rootsofthewild.com/world/blight)\n\n" +
          "⚠️ **STAGE 1:** Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms. At this stage you can be helped by having one of the sages, oracles or dragons heal you.\n\n" +
          "🎲 **Daily Rolling:** **Starting tomorrow, you'll be prompted to roll in the Community Board each day to see if your blight gets worse!**\n*You will not be penalized for missing today's blight roll if you were just infected.*";
        // Update character in DB
        character.blighted = true;
        character.blightedAt = new Date();
        character.blightStage = 1;
        await character.save();
        // Assign blighted role
        const guild = interaction.guild;
        if (guild) {
          const member = await guild.members.fetch(interaction.user.id);
          await member.roles.add('798387447967907910');
        }
        
        // Update user's blightedcharacter status
        const user = await User.findOne({ discordId: interaction.user.id });
        if (user) {
          user.blightedcharacter = true;
          await user.save();
        }
      } else {
        blightRainMessage = "<:blight_eye:805576955725611058> **Blight Rain!**\n\n";
        
        if (buffEffects && (buffEffects.blightResistance > 0 || buffEffects.fireResistance > 0)) {
          blightRainMessage += `◈ Your character **${character.name}** braved the blight rain and managed to avoid infection thanks to their elixir buffs! ◈\n`;
          blightRainMessage += "The protective effects of your elixir kept you safe from the blight.";
          
          // Consume chilly or fireproof elixirs after use
          if (shouldConsumeElixir(character, 'helpWanted', { blightRain: true })) {
            consumeElixirBuff(character);
            // Update character in database
            const { updateCharacterById, updateModCharacterById } = require('../../database/db.js');
            const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
            await updateFunction(character._id, { buff: character.buff });
            blightRainMessage += "\n\n🧪 **Elixir consumed!** The protective effects have been used up.";
          } else if (character.buff?.active) {
            // Log when elixir is not used due to conditions not being met
            console.log(`[helpWanted.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
          }
        } else {
          blightRainMessage += `◈ Your character **${character.name}** braved the blight rain but managed to avoid infection this time! ◈\n`;
          blightRainMessage += "You feel lucky... but be careful out there.";
        }
      }
    }
  }
  
    // Check stamina
  const currentStamina = parseInt(character.currentStamina) || 0;
  if (currentStamina < 1) {
    return await interaction.editReply({ content: `❌ ${character.name} needs at least 1 stamina to attempt a monster hunt.` });
  }

  // Check if character has blight stage 3 or higher (monsters don't attack them)
  if (character.blighted && character.blightStage >= 3) {
    return await interaction.editReply({
      content: `❌ **${character.name} cannot participate in monster hunts!**\n\n<:blight_eye:805576955725611058> At **Blight Stage ${character.blightStage}**, monsters no longer attack your character. You cannot participate in monster hunts until you are healed.`,
      ephemeral: true
    });
  }

  // Deduct stamina and start hunt
  const newStamina = Math.max(0, currentStamina - 1);
  character.currentStamina = newStamina;
  character.lastStaminaUsage = new Date();
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
        
        const koEmbed = await createMonsterEncounterEmbed(
          character,
          encounterResult.monster,
          `💀 ${character.name} has been defeated by the ${encounterResult.monster.name}!`,
          encounterResult.newHeartsRemaining,
          null, // lootItem
          false, // isBloodMoon
          encounterResult.adjustedRandomValue,
          null, // currentMonster
          null, // totalMonsters
          null, // entertainerBonusItem
          null, // boostCategoryOverride
          null // elixirBuffInfo - not implemented for helpWanted yet
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
              interaction,
              "Quest Loot"
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
      const battleEmbed = await createMonsterEncounterEmbed(
        character,
        encounterResult.monster,
        encounterResult.outcomeMessage,
        encounterResult.newHeartsRemaining,
        encounterResult.lootedItem,
        false, // isBloodMoon
        encounterResult.adjustedRandomValue,
        i + 1, // currentMonster (1-based index)
        monsterList.length, // totalMonsters
        null, // entertainerBonusItem
        null, // boostCategoryOverride
        null // elixirBuffInfo - not implemented for helpWanted yet
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

  if (blightRainMessage) {
    await interaction.followUp({ content: blightRainMessage });
  }
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
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
  
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
    )
    .addSubcommand(sub =>
      sub.setName('exchange')
        .setDescription('Exchange 50 Help Wanted quest completions for a Spirit Orb or Character Slot Voucher')
        .addStringOption(opt =>
          opt.setName('character')
            .setDescription('Your character\'s name (if you have multiple)')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(opt =>
          opt.setName('reward')
            .setDescription('Choose your reward')
            .setRequired(true)
            .addChoices(
              { name: 'Spirit Orb <:spiritorb:1171310851748270121>', value: 'spirit_orb' },
              { name: 'Character Slot Voucher 🎫', value: 'character_slot' }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName('history')
        .setDescription('View your recent Help Wanted quest completions and character info')
    ),

  execute: async function(interaction) {
    const sub = interaction.options.getSubcommand();
    
    if (sub === 'monsterhunt') {
      const questId = interaction.options.getString('id');
      const characterName = interaction.options.getString('character');
      
      await interaction.deferReply();
      
      try {
        await handleMonsterHunt(interaction, questId, characterName);
      } catch (error) {
        handleInteractionError(error, 'helpWanted.js', {
          commandName: 'helpwanted monsterhunt',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          questId,
          characterName
        });
        
        await interaction.editReply({ 
          content: '❌ **Monster Hunt Failed**\n\nAn unexpected error occurred while processing your monster hunt quest. This has been automatically reported to the development team.\n\n**What happened:** The system encountered an internal error while validating your character\'s eligibility for the quest.\n\n**What you can do:**\n• Try again in a few minutes\n• Make sure your character is not KO\'d, debuffed, or in jail\n• If the problem persists, report it in the bug reports channel\n\n**Quest ID:** `' + questId + '`\n**Character:** `' + characterName + '`' 
        });
      }
      return;
    }
    
    if (sub === 'complete') {
      const questId = interaction.options.getString('questid');
      const characterName = interaction.options.getString('character');
      
      await interaction.deferReply();
      
      try {
        // Fetch quest with debugging
        console.log(`[helpWanted.js]: Searching for quest with ID: "${questId}"`);
        const quest = await HelpWantedQuest.findOne({ questId });
        console.log(`[helpWanted.js]: Quest lookup result:`, quest ? `Found quest ${quest.questId} for ${quest.village}` : 'No quest found');
        
        if (!quest) {
          // Try to find any quests for today to help debug
          const today = new Date().toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
          const todaysQuests = await HelpWantedQuest.find({ date: today }).lean();
          console.log(`[helpWanted.js]: Available quests for today (${today}):`, todaysQuests.map(q => ({ questId: q.questId, village: q.village, type: q.type })));
          
          return await interaction.editReply({ 
            content: `❌ Quest not found.\n\n**Quest ID:** ${questId}\n**Available quests today:** ${todaysQuests.length > 0 ? todaysQuests.map(q => q.questId).join(', ') : 'None'}\n\nPlease check the quest ID and try again.` 
          });
        }

        // Validate quest expiration
        const expirationCheck = await validateQuestExpiration(quest);
        if (!expirationCheck.canProceed) {
          return await interaction.editReply({ content: expirationCheck.message });
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
          if (cooldownCheck.embed) {
            return await interaction.editReply({ embeds: [cooldownCheck.embed] });
          } else {
            return await interaction.editReply({ content: cooldownCheck.message });
          }
        }

        // Check quest status
        if (quest.completed) {
          return await interaction.editReply({ 
            content: `❌ This quest has already been completed by <@${quest.completedBy?.userId || 'unknown'}>.`
          });
        }
        
        // Validate character eligibility
        const eligibilityCheck = await validateCharacterEligibility(character, quest);
        if (!eligibilityCheck.canProceed) {
          if (eligibilityCheck.embed) {
            return await interaction.editReply({ embeds: [eligibilityCheck.embed] });
          } else {
            return await interaction.editReply({ content: eligibilityCheck.message });
          }
        }
        
        // Validate character location
        const locationCheck = validateCharacterLocation(character, quest);
        if (!locationCheck.canProceed) {
          return await interaction.editReply({ embeds: [locationCheck.embed] });
        }

        // Validate quest requirements
        console.log(`[helpWanted.js]: 🔍 VALIDATING QUEST REQUIREMENTS`);
        console.log(`[helpWanted.js]: Quest type: ${quest.type}`);
        console.log(`[helpWanted.js]: Quest requirements:`, quest.requirements);
        console.log(`[helpWanted.js]: Character: ${character.name} (ID: ${character._id})`);
        
        const requirementsCheck = await validateQuestRequirements(character, quest);
        console.log(`[helpWanted.js]: Requirements check result:`, requirementsCheck);
        
        if (!requirementsCheck.requirementsMet) {
          console.log(`[helpWanted.js]: ❌ Quest requirements NOT MET - showing requirements embed`);
          const requirementsEmbed = createQuestRequirementsEmbed(requirementsCheck);
          return await interaction.editReply({ embeds: [requirementsEmbed] });
        }
        
        console.log(`[helpWanted.js]: ✅ Quest requirements MET - proceeding with quest completion`);

        // ------------------- Blight Rain Infection Check -------------------
        const weather = await getWeatherWithoutGeneration(character.currentVillage);
        let blightRainMessage = null;
        if (weather?.special?.label === 'Blight Rain') {
          // Mod characters are immune to blight infection
          if (character.isModCharacter) {
            blightRainMessage =
              "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
              `◈ Your character **${character.name}** is a ${character.modTitle} of ${character.modType} and is immune to blight infection! ◈`;
          } else if (character.blighted) {
            blightRainMessage =
              "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
              `◈ Your character **${character.name}** braved the blight rain, but they're already blighted... guess it doesn't matter! ◈`;
          } else {
            // Check for resistance buffs
            const { getActiveBuffEffects, shouldConsumeElixir, consumeElixirBuff } = require('../../modules/elixirModule');
            const buffEffects = getActiveBuffEffects(character);
            let infectionChance = 0.75; // Base 75% chance
            
            // Apply resistance buffs
            if (buffEffects && buffEffects.blightResistance > 0) {
              infectionChance -= (buffEffects.blightResistance * 0.3); // Each level reduces by 30%
              console.log(`[helpWanted.js]: 🧪 Blight resistance buff applied - Infection chance reduced from 0.75 to ${infectionChance}`);
            }
            if (buffEffects && buffEffects.fireResistance > 0) {
              infectionChance -= (buffEffects.fireResistance * 0.05); // Each level reduces by 5%
              console.log(`[helpWanted.js]: 🧪 Fire resistance buff applied - Infection chance reduced from ${infectionChance} to ${infectionChance - (buffEffects.fireResistance * 0.05)}`);
            }
            
            // Consume elixirs after applying their effects
            if (shouldConsumeElixir(character, 'helpWanted', { blightRain: true })) {
              consumeElixirBuff(character);
              // Update character in database
              const { updateCharacterById, updateModCharacterById } = require('../../database/db.js');
              const updateFunction = character.isModCharacter ? updateCharacterById : updateModCharacterById;
              await updateFunction(character._id, { buff: character.buff });
            } else if (character.buff?.active) {
              // Log when elixir is not used due to conditions not met
              console.log(`[helpWanted.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
            }
            
            // Ensure chance stays within reasonable bounds
            infectionChance = Math.max(0.1, Math.min(0.95, infectionChance));
            
            if (Math.random() < infectionChance) {
              blightRainMessage = 
                "<:blight_eye:805576955725611058> **Blight Rain!**\n\n" +
                `◈ Oh no... your character **${character.name}** has come into contact with the blight rain and has been **blighted**! ◈\n\n` +
                "🏥 **Healing Available:** You can be healed by **Oracles, Sages & Dragons**\n" +
                "📋 **Blight Information:** [Learn more about blight stages and healing](https://rootsofthewild.com/world/blight)\n\n" +
                "⚠️ **STAGE 1:** Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms. At this stage you can be helped by having one of the sages, oracles or dragons heal you.\n\n" +
                "🎲 **Daily Rolling:** **Starting tomorrow, you'll be prompted to roll in the Community Board each day to see if your blight gets worse!**\n*You will not be penalized for missing today's blight roll if you were just infected.*";
              // Update character in DB
              character.blighted = true;
              character.blightedAt = new Date();
              character.blightStage = 1;
              await character.save();
              // Assign blighted role
              const guild = interaction.guild;
              if (guild) {
                const member = await guild.members.fetch(interaction.user.id);
                await member.roles.add('798387447967907910');
              }
              
              // Update user's blightedcharacter status
              const user = await User.findOne({ discordId: interaction.user.id });
              if (user) {
                user.blightedcharacter = true;
                await user.save();
              }
            } else {
              blightRainMessage = "<:blight_eye:805576955725611058> **Blight Rain!**\n\n";
              
              if (buffEffects && (buffEffects.blightResistance > 0 || buffEffects.fireResistance > 0)) {
                blightRainMessage += `◈ Your character **${character.name}** braved the blight rain and managed to avoid infection thanks to their elixir buffs! ◈\n`;
                blightRainMessage += "The protective effects of your elixir kept you safe from the blight.";
                
                // Consume chilly or fireproof elixirs after use
                if (shouldConsumeElixir(character, 'helpWanted', { blightRain: true })) {
                  consumeElixirBuff(character);
                  // Update character in database
                  const { updateCharacterById, updateModCharacterById } = require('../../database/db.js');
                  const updateFunction = character.isModCharacter ? updateModCharacterById : updateCharacterById;
                  await updateFunction(character._id, { buff: character.buff });
                  blightRainMessage += "\n\n🧪 **Elixir consumed!** The protective effects have been used up.";
                } else if (character.buff?.active) {
                  // Log when elixir is not used due to conditions not being met
                  console.log(`[helpWanted.js]: 🧪 Elixir not used for ${character.name} - conditions not met. Active buff: ${character.buff.type}`);
                }
              } else {
                blightRainMessage += `◈ Your character **${character.name}** braved the blight rain but managed to avoid infection this time! ◈\n`;
                blightRainMessage += "You feel lucky... but be careful out there.";
              }
              
            }
          }
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
        const content = blightRainMessage ? blightRainMessage : undefined;
        await interaction.editReply({ content, embeds: [successEmbed] });

      } catch (error) {
        handleInteractionError(error, 'helpWanted.js', {
          commandName: 'helpwanted complete',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          characterName: characterName,
          questId: questId
        });
        
        await interaction.editReply({ 
          content: '❌ **Quest Completion Failed**\n\nAn unexpected error occurred while processing your quest completion. This has been automatically reported to the development team.\n\n**What happened:** The system encountered an internal error while validating your quest requirements or character status.\n\n**What you can do:**\n• Try again in a few minutes\n• Check that your character meets all quest requirements\n• Make sure your character is not KO\'d, debuffed, or in jail\n• If the problem persists, report it in the bug reports channel\n\n**Quest ID:** `' + questId + '`\n**Character:** `' + characterName + '`' 
        });
      }
      return;
    }

    if (sub === 'exchange') {
      const characterName = interaction.options.getString('character');
      const reward = interaction.options.getString('reward');
      
      await interaction.deferReply();
      
      try {
        // Fetch character and user
        const character = await Character.findOne({ userId: interaction.user.id, name: characterName });
        if (!character) {
          return await interaction.editReply({ content: '❌ Character not found.' });
        }

        const user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
          return await interaction.editReply({ content: '❌ No user data found. Please complete some Help Wanted quests first.' });
        }

        const totalCompletions = user.helpWanted?.totalCompletions || 0;

        if (totalCompletions < 50) {
          return await interaction.editReply({
            content: `❌ **${character.name}** has only completed **${totalCompletions} Help Wanted quests**. You need at least **50** to exchange for a reward.`
          });
        }

        // ------------------- Process the Exchange -------------------
        if (reward === 'spirit_orb') {
          // Add Spirit Orb to character's inventory
          const { getCharacterInventoryCollection } = require('../../database/db');
          const inventoryCollection = await getCharacterInventoryCollection(character.name);
          
          const existingOrb = await inventoryCollection.findOne({
            characterId: character._id,
            itemName: { $regex: /^spirit orb$/i }
          });

          if (existingOrb) {
            existingOrb.quantity += 1;
            await inventoryCollection.updateOne(
              { _id: existingOrb._id },
              { $set: { quantity: existingOrb.quantity } }
            );
          } else {
            await inventoryCollection.insertOne({
              characterId: character._id,
              itemName: 'Spirit Orb',
              quantity: 1,
              category: 'Material',
              type: 'Special',
              subtype: '',
              addedAt: new Date()
            });
          }

          // Deduct 50 completions from user
          user.helpWanted.totalCompletions -= 50;
          await user.save();

          // ------------------- Build Spirit Orb Exchange Embed -------------------
          const embed = new EmbedBuilder()
            .setAuthor({ name: `${character.name} - Quest Exchange`, iconURL: character.icon })
            .setColor('#AA926A')
            .setThumbnail('https://storage.googleapis.com/tinglebot/Items/ROTWspiritorb.png')
            .setDescription(`🎯 **[${character.name}](${character.inventory})** exchanges **50 Help Wanted quest completions** for a <:spiritorb:1171310851748270121> Spirit Orb.\n\n*A grateful villager hands you a glowing orb as thanks for your service.*`)
            .addFields([
              {
                name: '🎯 __Quest Exchange Result__',
                value: `> +1 <:spiritorb:1171310851748270121> **Spirit Orb**\n> Added to inventory`,
                inline: false
              },
              {
                name: '📊 __Help Wanted Progress__',
                value: `> ${totalCompletions} → ${user.helpWanted.totalCompletions} (used 50)`,
                inline: true
              }
            ]);

          return await interaction.editReply({ embeds: [embed] });

        } else if (reward === 'character_slot') {
          // Add character slot to user
          user.characterSlot = (user.characterSlot || 2) + 1;
          user.helpWanted.totalCompletions -= 50;
          await user.save();

          // ------------------- Build Character Slot Exchange Embed -------------------
          const embed = new EmbedBuilder()
            .setAuthor({ name: `${character.name} - Quest Exchange`, iconURL: character.icon })
            .setColor('#AA926A')
            .setThumbnail('https://storage.googleapis.com/tinglebot/Items/ROTWspiritorb.png')
            .setDescription(`🎯 **[${character.name}](${character.inventory})** exchanges **50 Help Wanted quest completions** for a 🎫 Character Slot Voucher.\n\n*The village elder grants you permission to create another character in recognition of your service.*`)
            .addFields([
              {
                name: '🎯 __Quest Exchange Result__',
                value: `> +1 🎫 **Character Slot Voucher**\n> Character slots: ${user.characterSlot - 1} → ${user.characterSlot}`,
                inline: false
              },
              {
                name: '📊 __Help Wanted Progress__',
                value: `> ${totalCompletions} → ${user.helpWanted.totalCompletions} (used 50)`,
                inline: true
              }
            ]);

          return await interaction.editReply({ embeds: [embed] });
        }

      } catch (error) {
        handleInteractionError(error, 'helpWanted.js', {
          commandName: 'helpwanted exchange',
          userTag: interaction.user.tag,
          userId: interaction.user.id,
          characterName: characterName,
          reward: reward
        });
        
        await interaction.editReply({ 
          content: '❌ **Quest Exchange Failed**\n\nAn unexpected error occurred while processing your quest exchange. This has been automatically reported to the development team.\n\n**What happened:** The system encountered an internal error while processing your reward exchange.\n\n**What you can do:**\n• Try again in a few minutes\n• Make sure you have at least 50 quest completions\n• If the problem persists, report it in the bug reports channel\n\n**Character:** `' + characterName + '`\n**Reward:** `' + reward + '`' 
        });
      }
      return;
    }

    if (sub === 'history') {
      await interaction.deferReply();
      
      try {
        // Fetch user data
        const user = await User.findOne({ discordId: interaction.user.id });
        if (!user) {
          return await interaction.editReply({ content: '❌ No user data found.' });
        }

        const totalCompletions = user.helpWanted?.totalCompletions || 0;
        const recentCompletions = user.helpWanted?.completions || [];

        // Calculate today's and this week's completions
        const today = new Date().toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
        const todayCompletions = recentCompletions.filter(c => c.date === today).length;
        
        // Calculate this week's completions (Sunday to Saturday)
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
        startOfWeek.setHours(0, 0, 0, 0);
        
        const weekCompletions = recentCompletions.filter(c => {
          const completionDate = new Date(c.date + 'T00:00:00');
          return completionDate >= startOfWeek;
        }).length;

        // Get last quest completion details
        const lastCompletion = recentCompletions.length > 0 ? recentCompletions[recentCompletions.length - 1] : null;
        
        // Calculate village breakdown
        const villageBreakdown = {};
        recentCompletions.forEach(completion => {
          villageBreakdown[completion.village] = (villageBreakdown[completion.village] || 0) + 1;
        });
        
        // Calculate quest type breakdown
        const questTypeBreakdown = {};
        recentCompletions.forEach(completion => {
          questTypeBreakdown[completion.questType] = (questTypeBreakdown[completion.questType] || 0) + 1;
        });

        // ------------------- Build History Embed -------------------
        const embed = new EmbedBuilder()
          .setAuthor({ name: `${interaction.user.username} - Help Wanted History`, iconURL: interaction.user.displayAvatarURL() })
          .setColor('#AA926A')
          .setThumbnail(interaction.user.displayAvatarURL())
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setDescription(`📜 **Help Wanted Quest History** for **${interaction.user.username}**`);

        // Add main statistics in a clean format
        embed.addFields([
          {
            name: '__📊 Quest Statistics__',
            value: `> **Total Completed:** ${totalCompletions}\n> **Today:** ${todayCompletions}\n> **This Week:** ${weekCompletions}`,
            inline: false
          }
        ]);

        // Add last quest completion details (simplified)
        if (lastCompletion) {
          const lastCompletionDate = new Date(lastCompletion.timestamp || lastCompletion.date + 'T00:00:00');
          const formattedDate = lastCompletionDate.toLocaleDateString('en-US', { 
            month: 'short',
            day: 'numeric',
            timeZone: 'America/New_York'
          });
          
          embed.addFields([
            {
              name: '__🕐 Last Quest__',
              value: `> ${lastCompletion.questType.charAt(0).toUpperCase() + lastCompletion.questType.slice(1)} for **${lastCompletion.village}**\n> *${formattedDate}*`,
              inline: false
            }
          ]);
        }

        // Add breakdowns in a cleaner format
        if (Object.keys(villageBreakdown).length > 0) {
          const villageStats = Object.entries(villageBreakdown)
            .map(([village, count]) => `> **${village}:** ${count}`)
            .join('\n');
          
          embed.addFields([
            {
              name: '__🏘️ Villages Helped__',
              value: villageStats,
              inline: false
            }
          ]);
        }

        if (Object.keys(questTypeBreakdown).length > 0) {
          const questTypeStats = Object.entries(questTypeBreakdown)
            .map(([type, count]) => `> **${type.charAt(0).toUpperCase() + type.slice(1)}:** ${count}`)
            .join('\n');
          
          embed.addFields([
            {
              name: '__🎯 Quest Types__',
              value: questTypeStats,
              inline: false
            }
          ]);
        }

        

        return await interaction.editReply({ embeds: [embed] });

      } catch (error) {
        handleInteractionError(error, 'helpWanted.js', {
          commandName: 'helpwanted history',
          userTag: interaction.user.tag,
          userId: interaction.user.id
        });
        
        await interaction.editReply({ 
          content: '❌ **History Retrieval Failed**\n\nAn unexpected error occurred while fetching your quest history. This has been automatically reported to the development team.\n\n**What happened:** The system encountered an internal error while retrieving your quest completion data.\n\n**What you can do:**\n• Try again in a few minutes\n• If the problem persists, report it in the bug reports channel\n\n**User:** `' + interaction.user.tag + '`' 
        });
      }
      return;
    }


  }
}; 