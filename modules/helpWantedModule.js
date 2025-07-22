// ============================================================================
// ------------------- Help Wanted Quest Generation Module -------------------
// Logic for generating daily Help Wanted quests per village
// ============================================================================

const HelpWantedQuest = require('../models/HelpWantedQuestModel');
const Item = require('../models/ItemModel');
const Monster = require('../models/MonsterModel');
const { getAllVillages, locations } = require('./locationsModule');
const moment = require('moment');
const { EmbedBuilder } = require('discord.js');
const { NPCs } = require('./stealingNPCSModule');
const { generateUniqueId } = require('../utils/uniqueIdUtils');

// ------------------- Constants -------------------
// ============================================================================
const VILLAGES = ['Rudania', 'Inariko', 'Vhintl'];
const QUEST_TYPES = ['item', 'monster', 'escort', 'crafting'];
const FIXED_CRON_TIMES = [
  '0 5 * * *',   // 5:00 AM EST
  '0 11 * * *',  // 11:00 AM EST
  '0 17 * * *',  // 5:00 PM EST
  '0 23 * * *',  // 11:00 PM EST
];

// ------------------- Function: getRandomElement -------------------
// Returns a random element from an array
// ============================================================================
function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ------------------- Function: getItemQuestPool -------------------
// Fetches all valid items for item quests
// ============================================================================
async function getItemQuestPool() {
  // Exclude rare, quest-only, or otherwise inappropriate items
  // Adjust filters as needed for your game
  return await Item.find({
    itemRarity: { $lte: 3 }, // Not too rare
    category: { $nin: ['Quest', 'Event'] },
    stackable: true // Only stackable items for delivery quests
  }, 'itemName');
}

// ------------------- Function: getMonsterQuestPool -------------------
// Fetches all valid monsters for monster quests
// ============================================================================
async function getMonsterQuestPool() {
  // Exclude bosses, event monsters, etc.
  return await Monster.find({
    tier: { $lte: 3 }, // Not a boss
    species: { $ne: 'Boss' }
  }, 'name');
}

// ------------------- Function: getCraftingQuestPool -------------------
// Fetches all craftable items for crafting quests
// ============================================================================
async function getCraftingQuestPool() {
  return await Item.find({
    crafting: true,
    itemRarity: { $lte: 3 },
    category: { $nin: ['Quest', 'Event'] }
  }, 'itemName');
}

// ------------------- Function: getEscortQuestPool -------------------
// Fetches all valid escort locations (villages + major locations)
// ============================================================================
function getEscortQuestPool() {
  // Use all villages and major locations as possible destinations
  const villages = getAllVillages();
  // Add more locations if desired
  return villages;
}

// ------------------- Function: generateQuestForVillage -------------------
// Generates a random quest object for a given village and date, using real data
// ============================================================================
async function generateQuestForVillage(village, date, pools) {
  const type = getRandomElement(QUEST_TYPES);
  let requirements;
  switch (type) {
    case 'item': {
      const item = getRandomElement(pools.itemPool);
      requirements = { item: item.itemName, amount: Math.floor(Math.random() * 4) + 2 };
      break;
    }
    case 'monster': {
      const monster = getRandomElement(pools.monsterPool);
      requirements = { monster: monster.name, amount: Math.floor(Math.random() * 5) + 3 };
      break;
    }
    case 'escort': {
      const location = getRandomElement(pools.escortPool);
      requirements = { location };
      break;
    }
    case 'crafting': {
      const item = getRandomElement(pools.craftingPool);
      requirements = { item: item.itemName, amount: 1 };
      break;
    }
    default:
      requirements = {};
  }
  // Generate a unique questId
  const questId = generateUniqueId('X');
  console.log(`[HelpWanted] Generated quest for ${village} (${type}) with questId: ${questId}`);
  return {
    questId,
    village,
    date,
    type,
    requirements,
    completed: false,
    completedBy: null
  };
}

// ------------------- Function: assignRandomPostTimes -------------------
// Assigns a random cron time to each village for today
// ============================================================================
function assignRandomPostTimes() {
  const times = [...FIXED_CRON_TIMES];
  // Shuffle times for random assignment
  for (let i = times.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [times[i], times[j]] = [times[j], times[i]];
  }
  // Map each village to a time (if more villages than times, reuse times)
  const mapping = {};
  for (let i = 0; i < VILLAGES.length; i++) {
    mapping[VILLAGES[i]] = times[i % times.length];
  }
  return mapping;
}

// ------------------- Function: generateDailyQuests -------------------
// Generates and saves one quest per village for the current day using real data
// Assigns a random scheduledPostTime to each quest
// ============================================================================
async function generateDailyQuests() {
  const date = moment().utc().format('YYYY-MM-DD');

  // Assign random post times for each village
  const postTimeMap = assignRandomPostTimes();

  // Fetch all pools in parallel
  const [itemPool, monsterPool, craftingPool] = await Promise.all([
    getItemQuestPool(),
    getMonsterQuestPool(),
    getCraftingQuestPool()
  ]);
  const escortPool = getEscortQuestPool();

  const pools = { itemPool, monsterPool, craftingPool, escortPool };

  const quests = await Promise.all(VILLAGES.map(async village => {
    const quest = await generateQuestForVillage(village, date, pools);
    quest.scheduledPostTime = postTimeMap[village];
    return quest;
  }));

  // Upsert: Replace today's quest for each village
  const results = [];
  for (const quest of quests) {
    console.log(`[HelpWanted] Upserting quest for ${quest.village} with questId: ${quest.questId} at ${quest.scheduledPostTime}`);
    const updated = await HelpWantedQuest.findOneAndUpdate(
      { village: quest.village, date: quest.date },
      quest,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    results.push(updated);
  }
  return results;
}

// ------------------- Function: getTodaysQuests -------------------
// Fetches all Help Wanted quests for today from the DB
// ============================================================================
async function getTodaysQuests() {
  const date = moment().utc().format('YYYY-MM-DD');
  return await HelpWantedQuest.find({ date });
}

// ------------------- Function: getQuestsForScheduledTime -------------------
// Fetches today's quests scheduled for a specific cron time
// ============================================================================
async function getQuestsForScheduledTime(cronTime) {
  const date = moment().utc().format('YYYY-MM-DD');
  return await HelpWantedQuest.find({ date, scheduledPostTime: cronTime });
}

// ------------------- Function: getRandomNPCName -------------------
// Returns a random NPC name from the stealingNPCSModule
// ============================================================================
function getRandomNPCName() {
  const npcNames = Object.keys(NPCs);
  return npcNames[Math.floor(Math.random() * npcNames.length)];
}

// ------------------- Function: formatQuestsAsEmbed -------------------
// Formats today's quests as a Discord embed, assigning a random NPC to each
// ============================================================================
async function formatQuestsAsEmbed() {
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
    // Assign a random NPC as the quest requester
    const npcName = getRandomNPCName();
    let questLine = '';
    switch (quest.type) {
      case 'item':
        questLine = `📦 **[Item Quest]** ${npcName} requests **${quest.requirements.amount}x ${quest.requirements.item}**`;
        break;
      case 'monster':
        questLine = `🗡️ **[Monster Quest]** ${npcName} requests defeat of **${quest.requirements.amount}x ${quest.requirements.monster}**`;
        break;
      case 'escort':
        questLine = `🛡️ **[Escort Quest]** ${npcName} needs an escort to **${quest.requirements.location}**`;
        break;
      case 'crafting':
        questLine = `🔨 **[Crafting Quest]** ${npcName} requests a crafted **${quest.requirements.amount}x ${quest.requirements.item}**`;
        break;
      default:
        questLine = `❓ Unknown quest type`;
    }
    // Status line
    let status = quest.completed
      ? `❌ COMPLETED by <@${quest.completedBy?.userId || 'unknown'}> at ${quest.completedBy?.timestamp || 'unknown'}`
      : '✅ AVAILABLE';
    embed.addFields({
      name: `${quest.village} — ${npcName}`,
      value: `${questLine}\nStatus: ${status}`
    });
  });

  embed.setFooter({ text: 'Only one quest per user per day. Natives only!' });
  return embed;
}

// ------------------- Village Colors and Images -------------------
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

// ------------------- Function: getQuestTurnInInstructions -------------------
// Returns instructions for how to turn in each quest type
// ============================================================================
function getQuestTurnInInstructions(type) {
  switch (type) {
    case 'item':
      return '• **Item Quest:** Just have the required item(s) in your inventory and use `/helpwanted complete`.';
    case 'monster':
      return '• **Monster Quest:** Defeat the required monsters in battle, then use `/helpwanted complete`.';
    case 'escort':
      return '• **Escort Quest:** Travel to the required location using `/travel`, then use `/helpwanted complete`.';
    case 'crafting':
      return '• **Crafting Quest:** Craft the required item yourself, then use `/helpwanted complete`.';
    default:
      return '• Use `/helpwanted complete` to turn in your quest.';
  }
}

// ------------------- Function: formatQuestsAsEmbedsByVillage -------------------
// Formats today's quests as a map of village name to Discord embed (one per village)
// Ensures each NPC is only assigned to one village per day
// ============================================================================
async function formatQuestsAsEmbedsByVillage() {
  const quests = await getTodaysQuests();
  if (!quests.length) return {};
  const result = {};

  // Get all NPC names and shuffle for unique assignment
  const npcNames = Object.keys(NPCs);
  const shuffledNPCs = npcNames.sort(() => Math.random() - 0.5);
  let npcIndex = 0;

  for (const quest of quests) {
    // Assign a unique NPC per quest (per day)
    let npcName;
    if (npcIndex < shuffledNPCs.length) {
      npcName = shuffledNPCs[npcIndex];
      npcIndex++;
    } else {
      // If more villages than NPCs, fallback to random
      npcName = shuffledNPCs[Math.floor(Math.random() * shuffledNPCs.length)];
    }

    // Main quest line (bold, clear)
    let questLine = '';
    switch (quest.type) {
      case 'item':
        questLine = `**${npcName} requests:** Bring **${quest.requirements.amount}x ${quest.requirements.item}**`;
        break;
      case 'monster':
        questLine = `**${npcName} requests:** Defeat **${quest.requirements.amount}x ${quest.requirements.monster}**`;
        break;
      case 'escort':
        questLine = `**${npcName} needs an escort to:** **${quest.requirements.location}**`;
        break;
      case 'crafting':
        questLine = `**${npcName} requests:** Deliver a crafted **${quest.requirements.amount}x ${quest.requirements.item}**`;
        break;
      default:
        questLine = `❓ Unknown quest type`;
    }
    let status = quest.completed
      ? `❌ COMPLETED by <@${quest.completedBy?.userId || 'unknown'}> at ${quest.completedBy?.timestamp || 'unknown'}`
      : '✅ AVAILABLE';

    // How to complete (quest-type-specific)
    const turnIn = getQuestTurnInInstructions(quest.type);

    // Rules (short, clear)
    const rules =
      '• Only natives of the village can complete this quest.\n' +
      '• First come, first served—one completion per quest!\n' +
      '• Each user can only complete one Help Wanted quest per day (across all characters).';

    // Embed color and image
    const color = VILLAGE_COLORS[quest.village] || '#25c059';
    const image = VILLAGE_IMAGES[quest.village] || null;

    const divider = '<:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506>';
    const embed = new EmbedBuilder()
      .setTitle(`🌿 Help Wanted — ${quest.village}`)
      .setColor(color)
      .addFields(
        { name: 'Quest', value: `${questLine}\n${status}\n${divider}` },
        { name: 'How to Complete', value: turnIn },
        { name: 'Rules', value: rules },
        { name: 'Quest ID', value: quest.questId ? String(quest.questId) : 'N/A', inline: true }
      );
    if (image) embed.setImage(image);
    result[quest.village] = embed;
  }
  return result;
}

// ------------------- Exports -------------------
// ============================================================================
module.exports = {
  generateDailyQuests,
  getItemQuestPool,
  getMonsterQuestPool,
  getCraftingQuestPool,
  getEscortQuestPool,
  VILLAGES,
  QUEST_TYPES,
  getTodaysQuests,
  formatQuestsAsEmbed,
  formatQuestsAsEmbedsByVillage,
  getQuestsForScheduledTime
}; 