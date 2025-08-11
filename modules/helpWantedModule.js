// ============================================================================
// ------------------- Help Wanted Quest Generation Module -------------------
// Logic for generating daily Help Wanted quests per village
// ============================================================================

const HelpWantedQuest = require('../models/HelpWantedQuestModel');
const Item = require('../models/ItemModel');
const Monster = require('../models/MonsterModel');
const VillageShopItem = require('../models/VillageShopsModel');
const { getAllVillages, locations } = require('./locationsModule');
const moment = require('moment');
const { EmbedBuilder } = require('discord.js');
const { NPCs, getNPCQuestFlavor } = require('./NPCsModule');
const { generateUniqueId } = require('../utils/uniqueIdUtils');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================
const VILLAGES = ['Rudania', 'Inariko', 'Vhintl'];
const QUEST_TYPES = ['item', 'monster', 'escort', 'crafting'];

// Generate full 24-hour schedule with hourly intervals (24 time slots per day)
const FIXED_CRON_TIMES = [
  '0 0 * * *',   // 12:00 AM EST (Midnight)
  '0 1 * * *',   // 1:00 AM EST  
  '0 2 * * *',   // 2:00 AM EST  
  '0 3 * * *',   // 3:00 AM EST  
  '0 4 * * *',   // 4:00 AM EST  
  '0 5 * * *',   // 5:00 AM EST  
  '0 6 * * *',   // 6:00 AM EST  
  '0 7 * * *',   // 7:00 AM EST  
  '0 8 * * *',   // 8:00 AM EST  
  '0 9 * * *',   // 9:00 AM EST  
  '0 10 * * *',  // 10:00 AM EST  
  '0 11 * * *',  // 11:00 AM EST  
  '0 12 * * *',  // 12:00 PM EST (Noon)
  '0 13 * * *',  // 1:00 PM EST  
  '0 14 * * *',  // 2:00 PM EST  
  '0 15 * * *',  // 3:00 PM EST  
  '0 16 * * *',  // 4:00 PM EST  
  '0 17 * * *',  // 5:00 PM EST  
  '0 18 * * *',  // 6:00 PM EST  
  '0 19 * * *',  // 7:00 PM EST  
  '0 20 * * *',  // 8:00 PM EST  
  '0 21 * * *',  // 9:00 PM EST  
  '0 22 * * *',  // 10:00 PM EST  
  '0 23 * * *'   // 11:00 PM EST  
];

const QUEST_TYPE_EMOJIS = {
  'item': '📦',
  'monster': '⚔️',
  'escort': '🛡️',
  'crafting': '🔨'
};

const VILLAGE_COLORS = {
  Rudania: '#d7342a',
  Inariko: '#277ecd',
  Vhintl: '#25c059'
};

const VILLAGE_IMAGES = {
  Rudania: 'https://storage.googleapis.com/tinglebot/Graphics/border_rudania.png',
  Inariko: 'https://storage.googleapis.com/tinglebot/Graphics/border_inariko.png',
  Vhintl: 'https://storage.googleapis.com/tinglebot/Graphics/border_vhitnl.png'
};

// Quest generation parameters
const QUEST_PARAMS = {
  item: { minAmount: 1, maxAmount: 5 },
  monster: { minAmount: 3, maxAmount: 7 },
  crafting: { minAmount: 1, maxAmount: 3 }
};

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

// Utility function to convert cron time to hour
const cronToHour = (cronTime) => {
  const parts = cronTime.split(' ');
  return parseInt(parts[1]);
};

// Utility function to check if two hours are at least 6 hours apart
const isHoursApart = (hour1, hour2, minHours = 6) => {
  const hourDiff = Math.abs(hour1 - hour2);
  const minHourDiff = Math.min(hourDiff, 24 - hourDiff);
  return minHourDiff >= minHours;
};

// Utility function to format hour for display
const formatHour = (hour) => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
};

// ------------------- Function: getRandomElement -------------------
// Returns a random element from an array
function getRandomElement(arr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('Invalid array provided to getRandomElement');
  }
  return arr[Math.floor(Math.random() * arr.length)];
}

// ------------------- Function: getRandomNPCName -------------------
// Returns a random NPC name from the NPCsModule
function getRandomNPCName() {
  const npcNames = Object.keys(NPCs);
  if (npcNames.length === 0) {
    throw new Error('No NPCs available');
  }
  return getRandomElement(npcNames);
}

// ------------------- Function: getRandomNPCNameFromPool -------------------
// Returns a random NPC name from a provided pool of available NPCs
function getRandomNPCNameFromPool(availableNPCs) {
  if (availableNPCs.length === 0) {
    throw new Error('No NPCs available in pool');
  }
  return getRandomElement(availableNPCs);
}

// ------------------- Function: shuffleArray -------------------
// Shuffles an array in place using Fisher-Yates algorithm
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}





// ============================================================================
// ------------------- Quest Pool Management -------------------
// ============================================================================

// ------------------- Function: getItemQuestPool -------------------
// Fetches all valid items for item quests
async function getItemQuestPool() {
  try {
    let items = await Item.find({
      crafted: { $ne: true }
    }, 'itemName');
    
    if (items.length === 0) {
      items = await Item.find({}, 'itemName');
    }
    
    if (items.length === 0) {
      throw new Error('No items found for item quests');
    }
    
    return items;
  } catch (error) {
    console.error('[HelpWanted] Error fetching item quest pool:', error);
    throw error;
  }
}

// ------------------- Function: getMonsterQuestPool -------------------
// Fetches all valid monsters for monster quests
async function getMonsterQuestPool() {
  try {
    const monsters = await Monster.find({
      tier: { $lte: 3 },
      species: { $ne: 'Boss' }
    }, 'name tier');
    
    if (monsters.length === 0) {
      throw new Error('No monsters found for monster quests');
    }
    
    return monsters;
  } catch (error) {
    console.error('[HelpWanted] Error fetching monster quest pool:', error);
    throw error;
  }
}

// ------------------- Function: getCraftingQuestPool -------------------
// Fetches all craftable items for crafting quests
async function getCraftingQuestPool() {
  try {
    let items = await Item.find({
      crafting: true,
      itemRarity: { $lte: 4 },
      category: { $nin: ['Quest', 'Event'] }
    }, 'itemName');
    
    if (items.length === 0) {
      items = await Item.find({
        itemRarity: { $lte: 4 },
        category: { $nin: ['Quest', 'Event'] }
      }, 'itemName');
    }
    
    if (items.length === 0) {
      throw new Error('No items found for crafting quests');
    }
    
    return items;
  } catch (error) {
    console.error('[HelpWanted] Error fetching crafting quest pool:', error);
    throw error;
  }
}

// ------------------- Function: getEscortQuestPool -------------------
// Gets all valid escort locations
function getEscortQuestPool() {
  return getAllVillages();
}

// ------------------- Function: getVillageShopQuestPool -------------------
// Fetches all items from village shops for Peddler's special quests
async function getVillageShopQuestPool() {
  try {
    const shopItems = await VillageShopItem.find({
      stock: { $gt: 0 } // Only items with stock > 0
    }, 'itemName stock');
    
    if (shopItems.length === 0) {
      throw new Error('No village shop items found for Peddler quests');
    }
    
    return shopItems;
  } catch (error) {
    console.error('[HelpWanted] Error fetching village shop quest pool:', error);
    throw error;
  }
}

// ------------------- Function: getAllQuestPools -------------------
// Fetches all quest pools in parallel
async function getAllQuestPools() {
  try {
    const [itemPool, monsterPool, craftingPool, villageShopPool] = await Promise.all([
      getItemQuestPool(),
      getMonsterQuestPool(),
      getCraftingQuestPool(),
      getVillageShopQuestPool()
    ]);
    
    const escortPool = getEscortQuestPool();
    
    return { itemPool, monsterPool, craftingPool, escortPool, villageShopPool };
  } catch (error) {
    console.error('[HelpWanted] Error fetching quest pools:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Quest Generation -------------------
// ============================================================================

// ------------------- Function: generateQuestRequirements -------------------
// Generates quest requirements based on quest type
function generateQuestRequirements(type, pools, village) {
  switch (type) {
    case 'item': {
      const item = getRandomElement(pools.itemPool);
      if (!item?.itemName) {
        throw new Error(`Invalid item selected for ${village} item quest`);
      }
      const { minAmount, maxAmount } = QUEST_PARAMS.item;
      return {
        item: item.itemName,
        amount: Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount
      };
    }
    
    case 'monster': {
      const monster = getRandomElement(pools.monsterPool);
      if (!monster?.name) {
        throw new Error(`Invalid monster selected for ${village} monster quest`);
      }
      const { minAmount, maxAmount } = QUEST_PARAMS.monster;
      return {
        monster: monster.name,
        tier: monster.tier,
        amount: Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount
      };
    }
    
    case 'escort': {
      const availableDestinations = pools.escortPool.filter(loc => loc !== village);
      if (availableDestinations.length === 0) {
        const allLocations = getAllVillages();
        const fallbackDestinations = allLocations.filter(loc => loc !== village);
        if (fallbackDestinations.length === 0) {
          throw new Error(`No escort destinations available for ${village}`);
        }
        return { location: getRandomElement(fallbackDestinations) };
      }
      return { location: getRandomElement(availableDestinations) };
    }
    
    case 'crafting': {
      const item = getRandomElement(pools.craftingPool);
      if (!item?.itemName) {
        throw new Error(`Invalid crafting item selected for ${village} crafting quest`);
      }
      const { minAmount, maxAmount } = QUEST_PARAMS.crafting;
      return { item: item.itemName, amount: Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount };
    }
    
    default:
      throw new Error(`Unknown quest type: ${type}`);
  }
}

// ------------------- Function: generateQuestForVillage -------------------
// Generates a random quest object for a given village and date
async function generateQuestForVillage(village, date, pools, availableNPCs = null) {
  // Validate pools
  const requiredPools = ['itemPool', 'monsterPool', 'craftingPool', 'escortPool', 'villageShopPool'];
  for (const poolName of requiredPools) {
    if (!pools[poolName] || pools[poolName].length === 0) {
      throw new Error(`No ${poolName} available for ${village} quest generation`);
    }
  }

  const questId = generateUniqueId('X');
  
  if (!questId) {
    throw new Error(`Failed to generate questId for ${village} quest`);
  }
  
  // Use provided NPC pool or fall back to all NPCs
  const npcPool = availableNPCs || Object.keys(NPCs);
  const npcName = getRandomNPCNameFromPool(npcPool);
  
  // ------------------- Special Walton Quest Logic -------------------
  // Walton has a 30% chance to request 50x acorns specifically
  if (npcName === 'Walton' && Math.random() < 0.30) {
    return {
      questId,
      village,
      date,
      type: 'item',
      npcName: 'Walton',
      requirements: {
        item: 'Acorn',
        amount: 50
      },
      completed: false,
      completedBy: null
    };
  }
  
  // ------------------- Special Peddler Quest Logic -------------------
  // Peddler ONLY asks for item quests from village shops with full stock amounts
  if (npcName === 'Peddler') {
    const shopItem = getRandomElement(pools.villageShopPool);
    if (!shopItem?.itemName || !shopItem?.stock) {
      throw new Error(`Invalid village shop item selected for Peddler quest in ${village}`);
    }
    
    return {
      questId,
      village,
      date,
      type: 'item',
      npcName: 'Peddler',
      requirements: {
        item: shopItem.itemName,
        amount: shopItem.stock // Full stock amount for auction
      },
      completed: false,
      completedBy: null
    };
  }
  
  // ------------------- Normal Quest Generation -------------------
  const type = getRandomElement(QUEST_TYPES);
  const requirements = generateQuestRequirements(type, pools, village);
  
  return {
    questId,
    village,
    date,
    type,
    npcName,
    requirements,
    completed: false,
    completedBy: null
  };
}



// Generates and saves daily quests for all villages
async function generateDailyQuests() {
  try {
    const now = new Date();
    // Fix: Use toLocaleDateString to get the correct EST date
    const date = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});

    // Clean up existing documents with null questId
    await HelpWantedQuest.deleteMany({ questId: null });

    const pools = await getAllQuestPools();

    // Create a shared pool of available NPCs to ensure uniqueness across all quests
    const allNPCs = Object.keys(NPCs);
    if (allNPCs.length < VILLAGES.length) {
      throw new Error(`Not enough NPCs available (${allNPCs.length}) for ${VILLAGES.length} villages. Need at least ${VILLAGES.length} unique NPCs.`);
    }
    const availableNPCs = shuffleArray([...allNPCs]); // Shuffle for randomness
    
    // Generate quest posting times with 6-hour buffer between each
    const selectedTimes = selectTimesWithBuffer(FIXED_CRON_TIMES, VILLAGES.length);
    const quests = [];
    
    // Generate quests sequentially to ensure unique NPCs
    for (let i = 0; i < VILLAGES.length; i++) {
      const village = VILLAGES[i];
      const quest = await generateQuestForVillage(village, date, pools, availableNPCs);
      
      // Remove the used NPC from the available pool
      const npcIndex = availableNPCs.indexOf(quest.npcName);
      if (npcIndex !== -1) {
        availableNPCs.splice(npcIndex, 1);
      }
      
      // Assign a posting time with 6-hour buffer from the selected times
      quest.scheduledPostTime = selectedTimes[i];
      const hour = cronToHour(quest.scheduledPostTime);
      console.log(`[HelpWanted] Generated quest for ${village} with NPC ${quest.npcName} at posting time: ${formatHour(hour)} (${quest.scheduledPostTime})`);
      quests.push(quest);
    }

    // Upsert quests
    const results = [];
    for (const quest of quests) {
      const updated = await HelpWantedQuest.findOneAndUpdate(
        { village: quest.village, date: quest.date },
        quest,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      results.push(updated);
    }
    
    // Log the final schedule for the day
    console.log(`[HelpWanted] Daily quest schedule for ${date}:`);
    results.forEach(quest => {
      const hour = cronToHour(quest.scheduledPostTime);
      console.log(`  ${quest.village}: ${quest.npcName} at ${formatHour(hour)} (${quest.scheduledPostTime})`);
    });
    
    return results;
  } catch (error) {
    console.error('[HelpWanted] Error generating daily quests:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Time Selection with Buffer -------------------
// ============================================================================

// ------------------- Function: selectTimesWithBuffer -------------------
// Selects times from FIXED_CRON_TIMES ensuring at least 4-hour buffer between each
function selectTimesWithBuffer(availableTimes, count) {
  // Convert cron times to time slots with hour information
  const timeSlots = availableTimes.map(cronTime => ({
    cron: cronTime,
    hour: cronToHour(cronTime)
  }));

  const selected = [];
  const shuffled = shuffleArray([...timeSlots]); // Start with random order

  for (const timeSlot of shuffled) {
    // Check if this time slot is compatible with all already selected times
    const isCompatible = selected.every(selectedTime => 
      isHoursApart(timeSlot.hour, selectedTime.hour, 6) // Changed from 4 to 6
    );

    if (isCompatible) {
      selected.push(timeSlot);
      if (selected.length === count) {
        break;
      }
    }
  }

  // If we couldn't find enough compatible times, log a warning
  if (selected.length < count) {
    console.log(`[HelpWanted] Warning: Could only find ${selected.length} times with 6-hour buffer out of ${availableTimes.length} available times`);
  }

  // Sort selected times by hour for better scheduling
  selected.sort((a, b) => a.hour - b.hour);
  
  // Log the selected times in a readable format
  const timeDisplay = selected.map(t => formatHour(t.hour)).join(', ');
  console.log(`[HelpWanted] Selected times with 6-hour buffer: ${timeDisplay}`);
  
  return selected.map(timeSlot => timeSlot.cron);
}

// ============================================================================
// ------------------- Quest Retrieval -------------------
// ============================================================================

// ------------------- Function: isQuestExpired -------------------
// Checks if a quest is expired (not from today)
function isQuestExpired(quest) {
  const now = new Date();
  const today = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
  return quest.date !== today;
}

// ------------------- Function: getTodaysQuests -------------------
// Fetches all Help Wanted quests for today
async function getTodaysQuests() {
  try {
    const now = new Date();
    // Fix: Use toLocaleDateString to get the correct EST date
    const date = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    const quests = await HelpWantedQuest.find({ date });
    
    // Ensure all quests have an npcName field
    for (const quest of quests) {
      if (!quest.npcName) {
        quest.npcName = getRandomNPCName();
        await quest.save();
      }
    }
    
    return quests;
  } catch (error) {
    console.error('[HelpWanted] Error fetching today\'s quests:', error);
    throw error;
  }
}

// ------------------- Function: getQuestsForScheduledTime -------------------
// Fetches quests scheduled for a specific cron time
async function getQuestsForScheduledTime(cronTime) {
  try {
    const now = new Date();
    // Fix: Use toLocaleDateString to get the correct EST date
    const date = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    return await HelpWantedQuest.find({ date, scheduledPostTime: cronTime });
  } catch (error) {
    console.error('[HelpWanted] Error fetching quests for scheduled time:', error);
    throw error;
  }
}

// ------------------- Function: getCurrentQuestSchedule -------------------
// Gets the current quest schedule for debugging
async function getCurrentQuestSchedule() {
  try {
    const quests = await getTodaysQuests();
    const schedule = {};
    
    quests.forEach(quest => {
      const timeParts = quest.scheduledPostTime.split(' ');
      const hour = parseInt(timeParts[1]);
      const minute = parseInt(timeParts[0]);
      const timeString = `${hour}:${minute.toString().padStart(2, '0')}`;
      schedule[quest.village] = {
        time: timeString,
        cronTime: quest.scheduledPostTime,
        posted: !!quest.messageId,
        questId: quest.questId
      };
    });
    
    return schedule;
  } catch (error) {
    console.error('[HelpWanted] Error getting current quest schedule:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Embed Formatting -------------------
// ============================================================================

// ------------------- Function: getQuestTurnInInstructions -------------------
// Gets quest turn-in instructions based on quest type
function getQuestTurnInInstructions(type) {
  const instructions = {
    item: '• **Item Quest:** Gather the requested materials and bring them to the quest board. Use </helpwanted complete:1402779337270497370> when ready.',
    monster: '• **Monster Quest:** Hunt down the dangerous creatures threatening the village. Use </helpwanted monsterhunt:1402779337270497370> to complete this quest. **Costs 1 stamina per attempt.**',
    escort: '• **Escort Quest:** Safely guide the villager to their destination. Please travel from the quest village to the destination village using </travel:1379850586987430009>, then use </helpwanted complete:1402779337270497370>.',
    crafting: '• **Crafting Quest:** Create the requested item with your own hands. Craft the required item yourself, then use </helpwanted complete:1402779337270497370>.'
  };
  
  return instructions[type] || '• Use </helpwanted complete:1402779337270497370> to turn in your quest.';
}

// ------------------- Function: formatQuestsAsEmbed -------------------
// Formats quests as a single embed
async function formatQuestsAsEmbed() {
  try {
    const quests = await getTodaysQuests();
    if (!quests.length) {
      return new EmbedBuilder()
        .setTitle('🌿 Help Wanted Board')
        .setDescription('No quests available today!');
    }

    const embed = new EmbedBuilder()
      .setTitle('🌿 Help Wanted Board')
      .setDescription('Daily quests for each village. First come, first served!')
      .setColor('#25c059');

    quests.forEach((quest) => {
      const npcName = quest.npcName || getRandomNPCName();
      const emoji = QUEST_TYPE_EMOJIS[quest.type] || '❓';
      
      const questLine = getNPCQuestFlavor(npcName, quest.type, quest.requirements);
      const formattedQuestLine = `${emoji} **[${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest]** ${questLine}`;
      
      // Check if quest is expired
      const isExpired = isQuestExpired(quest);
      const status = quest.completed
        ? `🏅 COMPLETED by <@${quest.completedBy?.userId || 'unknown'}> at ${quest.completedBy?.timestamp || 'unknown'}`
        : isExpired
        ? '⏰ EXPIRED'
        : '✅ AVAILABLE';
        
      embed.addFields({
        name: `${quest.village} — ${npcName}`,
        value: `${formattedQuestLine}\n**Status:** ${status}\n**Type:** ${emoji} ${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest\n**Location:** ${quest.village}`
      });
    });

    embed.setFooter({ text: 'Only one quest per user per day. Natives only!' });
    return embed;
  } catch (error) {
    console.error('[HelpWanted] Error formatting quests as embed:', error);
    throw error;
  }
}



// ------------------- Function: formatQuestsAsEmbedsByVillage -------------------
// Formats quests as separate embeds by village
async function formatQuestsAsEmbedsByVillage() {
  try {
    const quests = await getTodaysQuests();
    if (!quests.length) return {};
    
    const result = {};

    for (const quest of quests) {
      const npcName = quest.npcName || getRandomNPCName();
      const questLine = getNPCQuestFlavor(npcName, quest.type, quest.requirements);
      
      // Check if quest is expired
      const isExpired = isQuestExpired(quest);
      const status = quest.completed
        ? `🏅 COMPLETED by <@${quest.completedBy?.userId || 'unknown'}> at ${quest.completedBy?.timestamp || 'unknown'}`
        : isExpired
        ? '⏰ EXPIRED'
        : '✅ AVAILABLE';

      const color = quest.completed ? 0x00FF00 : isExpired ? 0x808080 : (VILLAGE_COLORS[quest.village] || '#25c059');
      const image = VILLAGE_IMAGES[quest.village] || null;
      const divider = '<:br:788136157363306506>'.repeat(11);
      
      const questInfoFields = [
        { name: '__Status__', value: quest.completed ? '🏅 **COMPLETED**' : isExpired ? '⏰ **EXPIRED**' : '✅ **AVAILABLE**', inline: true },
        { name: '__Type__', value: `${QUEST_TYPE_EMOJIS[quest.type] || '❓'} ${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest`, inline: true },
        { name: '__Location__', value: quest.village, inline: true }
      ];
      
      const embed = new EmbedBuilder()
        .setTitle(`${QUEST_TYPE_EMOJIS[quest.type] || '🌿'} Help Wanted — ${quest.village}`)
        .setColor(color)
        .addFields(
          { name: 'Quest', value: `${questLine}\n${divider}` },
          ...questInfoFields
        );
      
      // Add character completion info if quest is completed
      if (quest.completed && quest.completedBy?.characterId) {
        try {
          const Character = require('../models/CharacterModel');
          const character = await Character.findById(quest.completedBy.characterId);
          if (character) {
            embed.setThumbnail(character.icon || 'https://via.placeholder.com/128');
            embed.addFields({
              name: '🏆 Completed By',
              value: `**${character.name}** (${character.race}) - <@${quest.completedBy.userId}>`,
              inline: false
            });
          }
        } catch (error) {
          console.error('[HelpWanted] Error fetching character for completed quest:', error);
        }
      } else {
        // Add NPC icon as thumbnail for available quests
        try {
          const npcData = NPCs[npcName];
          if (npcData && npcData.icon) {
            embed.setThumbnail(npcData.icon);
          }
        } catch (error) {
          console.error('[HelpWanted] Error setting NPC thumbnail:', error);
        }
        
        // Only add rules and how to complete for available quests
        const turnIn = getQuestTurnInInstructions(quest.type);
        const rules = '• Only natives of the village can complete this quest.\n' +
                     '• First come, first served—one completion per quest!\n' +
                     '• Each user can only complete one Help Wanted quest per day (across all characters).\n' +
                     '• Complete quests to help your village prosper!';
        
        embed.addFields(
          { name: 'How to Complete', value: turnIn },
          { name: 'Rules', value: rules }
        );
      }
      
      embed.addFields({ name: 'Quest ID', value: quest.questId ? `\`\`\`${quest.questId}\`\`\`` : 'N/A', inline: true });
      
      if (image) embed.setImage(image);
      result[quest.village] = embed;
    }
    
    return result;
  } catch (error) {
    console.error('[HelpWanted] Error formatting quests by village:', error);
    throw error;
  }
}

// ------------------- Function: formatSpecificQuestsAsEmbedsByVillage -------------------
// Formats specific quests as separate embeds by village
async function formatSpecificQuestsAsEmbedsByVillage(quests) {
  try {
    if (!quests || !quests.length) return {};
    
    const result = {};

    for (const quest of quests) {
      const npcName = quest.npcName || getRandomNPCName();
      const questLine = getNPCQuestFlavor(npcName, quest.type, quest.requirements);
      
      // Check if quest is expired
      const isExpired = isQuestExpired(quest);
      const status = quest.completed
        ? `🏅 COMPLETED by <@${quest.completedBy?.userId || 'unknown'}> at ${quest.completedBy?.timestamp || 'unknown'}`
        : isExpired
        ? '⏰ EXPIRED'
        : '✅ AVAILABLE';

      const color = quest.completed ? 0x00FF00 : isExpired ? 0x808080 : (VILLAGE_COLORS[quest.village] || '#25c059');
      const image = VILLAGE_IMAGES[quest.village] || null;
      const divider = '<:br:788136157363306506>'.repeat(11);
      
      const questInfoFields = [
        { name: '__Status__', value: quest.completed ? '🏅 **COMPLETED**' : isExpired ? '⏰ **EXPIRED**' : '✅ **AVAILABLE**', inline: true },
        { name: '__Type__', value: `${QUEST_TYPE_EMOJIS[quest.type] || '❓'} ${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest`, inline: true },
        { name: '__Location__', value: quest.village, inline: true }
      ];
      
      const embed = new EmbedBuilder()
        .setTitle(`${QUEST_TYPE_EMOJIS[quest.type] || '🌿'} Help Wanted — ${quest.village}`)
        .setColor(color)
        .addFields(
          { name: 'Quest', value: `${questLine}\n${divider}` },
          ...questInfoFields
        );
      
      // Add character completion info if quest is completed
      if (quest.completed && quest.completedBy?.characterId) {
        try {
          const Character = require('../models/CharacterModel');
          const character = await Character.findById(quest.completedBy.characterId);
          if (character) {
            embed.setThumbnail(character.icon || 'https://via.placeholder.com/128');
            embed.addFields({
              name: '🏆 Completed By',
              value: `**${character.name}** (${character.race}) - <@${quest.completedBy.userId}>`,
              inline: false
            });
          }
        } catch (error) {
          console.error('[HelpWanted] Error fetching character for completed quest:', error);
        }
      } else {
        // Add NPC icon as thumbnail for available quests
        try {
          const npcData = NPCs[npcName];
          if (npcData && npcData.icon) {
            embed.setThumbnail(npcData.icon);
          }
        } catch (error) {
          console.error('[HelpWanted] Error setting NPC thumbnail:', error);
        }
        
        // Only add rules and how to complete for available quests
        const turnIn = getQuestTurnInInstructions(quest.type);
        const rules = '• Only natives of the village can complete this quest.\n' +
                     '• First come, first served—one completion per quest!\n' +
                     '• Each user can only complete one Help Wanted quest per day (across all characters).\n' +
                     '• Complete quests to help your village prosper!';
        
        embed.addFields(
          { name: 'How to Complete', value: turnIn },
          { name: 'Rules', value: rules }
        );
      }
      
      embed.addFields({ name: 'Quest ID', value: quest.questId ? `\`\`\`${quest.questId}\`\`\`` : 'N/A', inline: true });
      
      if (image) embed.setImage(image);
      result[quest.village] = embed;
    }
    
    return result;
  } catch (error) {
    console.error('[HelpWanted] Error formatting specific quests by village:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- User Validation -------------------
// ============================================================================

// ------------------- Function: hasUserCompletedQuestToday -------------------
// Checks if a user has completed a quest today
async function hasUserCompletedQuestToday(userId) {
  try {
    const user = await require('../models/UserModel').findOne({ discordId: userId });
    if (!user) {
      return false;
    }
    
    // Use EST timezone for midnight reset
    const now = new Date();
    const today = now.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
    const lastCompletion = user.helpWanted?.lastCompletion || 'null';
    
    return lastCompletion === today;
  } catch (error) {
    console.error('[HelpWanted] Error checking user quest completion:', error);
    return false;
  }
}

// ------------------- Function: hasUserReachedWeeklyQuestLimit -------------------
// Checks if a user has reached the weekly quest limit
async function hasUserReachedWeeklyQuestLimit(userId) {
  try {
    const user = await require('../models/UserModel').findOne({ discordId: userId });
    if (!user || !user.helpWanted.completions) return false;
    
    // Use EST timezone for weekly reset
    const now = new Date();
    const estNow = new Date(now.toLocaleString('en-US', {timeZone: 'America/New_York'}));
    const startOfWeek = new Date(estNow);
    startOfWeek.setDate(estNow.getDate() - estNow.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const weeklyCompletions = user.helpWanted.completions.filter(completion => {
      const completionDate = new Date(completion.date + 'T00:00:00-05:00'); // EST timezone
      return completionDate >= startOfWeek;
    });
    
    return weeklyCompletions.length >= 3;
  } catch (error) {
    console.error('[HelpWanted] Error checking weekly quest limit:', error);
    return false;
  }
}

// ============================================================================
// ------------------- Quest Embed Updates -------------------
// ============================================================================

// ------------------- Function: updateQuestEmbed -------------------
// Updates the quest embed message to show completion status
async function updateQuestEmbed(client, quest, completedBy = null) {
  try {
    
    if (!quest.messageId) {
      return;
    }

    if (!quest.channelId) {
      console.error(`[helpWantedModule]: No channel ID found for quest ${quest.questId}`);
      return;
    }
    

    
    const channel = await client.channels.fetch(quest.channelId);
    if (!channel) {
      console.error(`[helpWantedModule]: Could not find channel ${quest.channelId} for quest ${quest.questId}`);
      return;
    }

    const message = await channel.messages.fetch(quest.messageId);
    if (!message) {
      console.error(`[helpWantedModule]: Could not find message ${quest.messageId}`);
      return;
    }

    const originalEmbed = message.embeds[0];
    if (!originalEmbed) {
      console.error(`[helpWantedModule]: No embed found in message ${quest.messageId}`);
      return;
    }

    // Create a new embed with the updated format
    const npcName = quest.npcName || getRandomNPCName();
    const questLine = getNPCQuestFlavor(npcName, quest.type, quest.requirements);
    
    // Check if quest is expired
    const isExpired = isQuestExpired(quest);
    const color = quest.completed ? 0x00FF00 : isExpired ? 0x808080 : (VILLAGE_COLORS[quest.village] || '#25c059');
    const image = VILLAGE_IMAGES[quest.village] || null;
    const divider = '<:br:788136157363306506>'.repeat(11);
    
    const questInfoFields = [
      { name: '__Status__', value: quest.completed ? '🏅 **COMPLETED**' : isExpired ? '⏰ **EXPIRED**' : '✅ **AVAILABLE**', inline: true },
      { name: '__Type__', value: `${QUEST_TYPE_EMOJIS[quest.type] || '❓'} ${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest`, inline: true },
      { name: '__Location__', value: quest.village, inline: true }
    ];
    
    const updatedEmbed = new EmbedBuilder()
      .setTitle(`${QUEST_TYPE_EMOJIS[quest.type] || '🌿'} Help Wanted — ${quest.village}`)
      .setColor(color)
      .addFields(
        { name: 'Quest', value: `${questLine}\n${divider}` },
        ...questInfoFields
      );
    
    // Add character completion info if quest is completed
    if (quest.completed && quest.completedBy?.characterId) {
      try {
        const Character = require('../models/CharacterModel');
        const character = await Character.findById(quest.completedBy.characterId);
        if (character) {
          updatedEmbed.setThumbnail(character.icon || 'https://via.placeholder.com/128');
          updatedEmbed.addFields({
            name: '🏆 Completed By',
            value: `**${character.name}** (${character.race}) - <@${quest.completedBy.userId}>`,
            inline: false
          });
        }
      } catch (error) {
        console.error('[HelpWanted] Error fetching character for completed quest:', error);
      }
    } else if (!isExpired) {
      // Add NPC icon as thumbnail for available quests
      try {
        const npcData = NPCs[npcName];
        if (npcData && npcData.icon) {
          updatedEmbed.setThumbnail(npcData.icon);
        }
      } catch (error) {
        console.error('[HelpWanted] Error setting NPC thumbnail:', error);
      }
      
      // Only add rules and how to complete for available quests
      const turnIn = getQuestTurnInInstructions(quest.type);
      const rules = '• Only natives of the village can complete this quest.\n' +
                   '• First come, first served—one completion per quest!\n' +
                   '• Each user can only complete one Help Wanted quest per day (across all characters).\n' +
                   '• Complete quests to help your village prosper!';
      
      updatedEmbed.addFields(
        { name: 'How to Complete', value: turnIn },
        { name: 'Rules', value: rules }
      );
    } else {
      // Add expired quest message
      updatedEmbed.addFields({
        name: '⏰ Quest Expired',
        value: 'This quest was posted on a previous day and is no longer available for completion. Help Wanted quests expire at midnight (EST) on the day they are posted.',
        inline: false
      });
    }
    
    updatedEmbed.addFields({ name: 'Quest ID', value: quest.questId ? `\`\`\`${quest.questId}\`\`\`` : 'N/A', inline: true });
    
    if (image) updatedEmbed.setImage(image);

    await message.edit({ embeds: [updatedEmbed] });
  } catch (error) {
    console.error(`[helpWantedModule]: ❌ Failed to update quest embed for ${quest.questId}:`, error);
  }
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================
module.exports = {
  generateDailyQuests,
  getItemQuestPool,
  getMonsterQuestPool,
  hasUserCompletedQuestToday,
  hasUserReachedWeeklyQuestLimit,
  getCraftingQuestPool,
  getEscortQuestPool,
  getVillageShopQuestPool,
  getAllQuestPools,
  VILLAGES,
  QUEST_TYPES,
  FIXED_CRON_TIMES,
  QUEST_TYPE_EMOJIS,
  getTodaysQuests,
  formatQuestsAsEmbed,
  formatQuestsAsEmbedsByVillage,
  formatSpecificQuestsAsEmbedsByVillage,
  getQuestsForScheduledTime,
  getCurrentQuestSchedule,
  updateQuestEmbed,
  isQuestExpired
}; 