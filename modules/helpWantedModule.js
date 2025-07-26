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
  '0 8 * * *',   // 8:00 AM EST
  '0 11 * * *',  // 11:00 AM EST
  '0 14 * * *',  // 2:00 PM EST
  '0 17 * * *',  // 5:00 PM EST
  '0 20 * * *',  // 8:00 PM EST
  '0 23 * * *',  // 11:00 PM EST
  '0 2 * * *',   // 2:00 AM EST
];

// ------------------- Quest Type Emoji Mapping -------------------
// Emojis for different quest types to display in the title
// ============================================================================
const QUEST_TYPE_EMOJIS = {
  'item': '📦',      // Package/box for item collection quests
  'monster': '⚔️',   // Crossed swords for monster hunting quests
  'escort': '🛡️',   // Shield for escort/protection quests
  'crafting': '🔨'   // Hammer for crafting quests
};

// ------------------- NPC Quest Flavor Text Database -------------------
// Specialized quest flavor text for each NPC, organized by quest type
// ============================================================================
const NPC_QUEST_FLAVOR = {
  'Hank': {
    item: [
      "Hank the Hylian Herbalist is running low on supplies for his allergy remedies. He needs **{amount}x {item}** to keep the village healthy.",
      "The herbalist's storeroom is nearly empty! Hank urgently requests **{amount}x {item}** for his medicinal preparations.",
      "Hank's been sneezing all day - his allergy potions need **{amount}x {item}** to be effective."
    ],
    monster: [
      "Hank spotted some dangerous creatures near his herb garden. He needs a brave soul to defeat **{amount}x {monster} (tier: {tier})** before they trample his precious plants.",
      "The herbalist is worried about **{amount}x {monster} (tier: {tier})** lurking near his collection spots. He can't gather herbs safely until they're dealt with.",
      "Hank's allergies are acting up from the **{amount}x {monster} (tier: {tier})** nearby. He needs them eliminated so he can work in peace."
    ],
    escort: [
      "Hank needs to deliver fresh herbs to **{location}** before they wilt. He's seeking a trustworthy escort for the journey.",
      "The herbalist has a delicate shipment of rare herbs bound for **{location}**. He needs protection from any who might try to steal his valuable cargo.",
      "Hank's heading to **{location}** to trade for new herb varieties, but the road is dangerous. He needs a capable guardian."
    ],
    crafting: [
      "Hank needs **{amount}x {item}** for his latest medicinal experiments. He's looking for a skilled craftsman to create them.",
      "The herbalist's workshop is missing some essential tools. He requests **{amount}x {item}** to continue his healing work.",
      "Hank's been developing a new allergy remedy but needs **{amount}x {item}** to complete the formula."
    ]
  },
  'Sue': {
    item: [
      "Sue the Zora Fisherman's nets are torn and she needs **{amount}x {item}** to repair them before the big catch.",
      "The river's been giving Sue trouble lately. She needs **{amount}x {item}** to improve her fishing equipment.",
      "Sue's fish market is running low on supplies. She urgently needs **{amount}x {item}** to keep business flowing."
    ],
    monster: [
      "Sue spotted **{amount}x {monster} (tier: {tier})** lurking in the shallows, scaring away all the fish. She needs them removed to restore her catch.",
      "The Zora fisherman's favorite fishing spot is overrun by **{amount}x {monster} (tier: {tier})**. She can't work until they're cleared out.",
      "Sue's fish traps keep getting destroyed by **{amount}x {monster} (tier: {tier})**. She needs a hunter to eliminate the threat."
    ],
    escort: [
      "Sue has a shipment of fresh fish bound for **{location}** but the journey is risky. She needs an escort to ensure the delivery arrives on time.",
      "The Zora fisherman is heading to **{location}** to negotiate new trade routes, but the path is dangerous. She seeks protection.",
      "Sue's been invited to **{location}** to share her fishing techniques, but she's worried about traveling alone."
    ],
    crafting: [
      "Sue's fishing gear is wearing out. She needs **{amount}x {item}** to maintain her livelihood on the river.",
      "The Zora fisherman wants to expand her business but needs **{amount}x {item}** to build new fish processing equipment.",
      "Sue's been experimenting with new fishing techniques but requires **{amount}x {item}** to perfect her methods."
    ]
  },
  'Lukan': {
    item: [
      "Lukan the Gerudo Orchard Keeper's trees are suffering from a mysterious blight. He needs **{amount}x {item}** to treat the disease.",
      "The orchard's irrigation system is failing. Lukan urgently needs **{amount}x {item}** to repair the water channels.",
      "Lukan's fruit harvest is ready but he's short on storage containers. He needs **{amount}x {item}** to preserve the bounty."
    ],
    monster: [
      "Lukan's orchard is being raided by **{amount}x {monster} (tier: {tier})** who are eating all the fruit. He needs them driven away.",
      "The Gerudo orchard keeper spotted **{amount}x {monster} (tier: {tier})** nesting in his trees, damaging the branches. They must be removed.",
      "Lukan's fruit trees are under attack by **{amount}x {monster} (tier: {tier})**. He can't harvest safely until they're eliminated."
    ],
    escort: [
      "Lukan has a wagon full of fresh fruit bound for **{location}** but bandits have been targeting merchant caravans. He needs protection.",
      "The orchard keeper is heading to **{location}** to learn new cultivation techniques, but the journey is perilous.",
      "Lukan's been invited to **{location}** to share his fruit-growing secrets, but he's nervous about traveling alone."
    ],
    crafting: [
      "Lukan's orchard tools are worn out from years of use. He needs **{amount}x {item}** to maintain his grove properly.",
      "The Gerudo orchard keeper wants to build a new greenhouse but requires **{amount}x {item}** for the construction.",
      "Lukan's been developing new fruit varieties but needs **{amount}x {item}** to complete his research."
    ]
  },
  'Myti': {
    item: [
      "Myti the Mogma Scout's equipment is damaged from exploring dangerous caves. He needs **{amount}x {item}** to repair his gear.",
      "The scout's map-making supplies are running low. Myti needs **{amount}x {item}** to continue charting the underground.",
      "Myti's been exploring deep caverns and needs **{amount}x {item}** to light his way through the darkness."
    ],
    monster: [
      "Myti discovered **{amount}x {monster} (tier: {tier})** in a cave system he was mapping. They're blocking access to valuable resources.",
      "The Mogma scout's usual routes are infested with **{amount}x {monster} (tier: {tier})**. He needs them cleared to continue his explorations.",
      "Myti found a promising cave but it's guarded by **{amount}x {monster} (tier: {tier})**. He needs help to access the treasures within."
    ],
    escort: [
      "Myti discovered a valuable mineral deposit near **{location}** but the path is treacherous. He needs an escort to safely reach the site.",
      "The Mogma scout is heading to **{location}** to share his underground discoveries, but the surface journey is dangerous.",
      "Myti's been invited to **{location}** to teach cave exploration techniques, but he's not used to traveling above ground."
    ],
    crafting: [
      "Myti's mining tools are breaking down from constant use. He needs **{amount}x {item}** to continue his underground work.",
      "The Mogma scout wants to build a new underground outpost but requires **{amount}x {item}** for the construction.",
      "Myti's been developing new cave exploration equipment but needs **{amount}x {item}** to complete his inventions."
    ]
  },
  'Cree': {
    item: [
      "Cree the Rito Monster Hunter's weapons are dull from constant use. He needs **{amount}x {item}** to maintain his hunting gear.",
      "The monster hunter's tracking supplies are depleted. Cree needs **{amount}x {item}** to continue his dangerous work.",
      "Cree's been hunting in harsh conditions and needs **{amount}x {item}** to repair his damaged equipment."
    ],
    monster: [
      "Cree spotted a pack of **{amount}x {monster} (tier: {tier})** that are too dangerous for him to handle alone. He needs backup to eliminate them.",
      "The Rito monster hunter's territory is being invaded by **{amount}x {monster} (tier: {tier})**. He needs help to drive them back.",
      "Cree discovered **{amount}x {monster} (tier: {tier})** that are threatening local wildlife. He needs assistance to restore the balance."
    ],
    escort: [
      "Cree needs to deliver monster parts to **{location}** for analysis, but the road is dangerous. He seeks a capable escort.",
      "The monster hunter is heading to **{location}** to report on dangerous creatures, but the journey is perilous.",
      "Cree's been summoned to **{location}** to help with a monster problem, but he's worried about traveling alone."
    ],
    crafting: [
      "Cree's hunting weapons need upgrading to handle stronger monsters. He requires **{amount}x {item}** to forge better gear.",
      "The Rito monster hunter wants to build a new hunting lodge but needs **{amount}x {item}** for the construction.",
      "Cree's been developing new monster tracking techniques but requires **{amount}x {item}** to perfect his methods."
    ]
  },
  'Cece': {
    item: [
      "Cece the Mixed Mushroom Forager's collection baskets are falling apart. She needs **{amount}x {item}** to continue her mushroom hunting.",
      "The forager's preservation supplies are running low. Cece needs **{amount}x {item}** to keep her mushrooms fresh.",
      "Cece's been exploring new forest areas and needs **{amount}x {item}** to safely navigate the dangerous terrain."
    ],
    monster: [
      "Cece discovered **{amount}x {monster} (tier: {tier})** in her favorite mushroom patch. They're trampling all the rare fungi she needs.",
      "The mushroom forager's usual gathering spots are infested with **{amount}x {monster} (tier: {tier})**. She can't work safely until they're gone.",
      "Cece found a new mushroom grove but it's guarded by **{amount}x {monster} (tier: {tier})**. She needs help to access the valuable fungi."
    ],
    escort: [
      "Cece has a rare mushroom shipment bound for **{location}** but the journey is risky. She needs protection to ensure the delicate cargo arrives.",
      "The forager is heading to **{location}** to share her mushroom knowledge, but the path is dangerous.",
      "Cece's been invited to **{location}** to teach foraging techniques, but she's nervous about traveling alone."
    ],
    crafting: [
      "Cece's foraging tools are worn out from constant use. She needs **{amount}x {item}** to maintain her collection equipment.",
      "The mushroom forager wants to build a new drying shed but requires **{amount}x {item}** for the construction.",
      "Cece's been developing new mushroom preservation methods but needs **{amount}x {item}** to complete her research."
    ]
  },
  'Walton': {
    item: [
      "Walton the Korok's acorn collection is running low. He needs **{amount}x {item}** to maintain his forest home.",
      "The Korok's tree care supplies are depleted. Walton needs **{amount}x {item}** to keep the forest healthy.",
      "Walton's been busy with forest maintenance and needs **{amount}x {item}** to complete his work."
    ],
    monster: [
      "Walton spotted **{amount}x {monster} (tier: {tier})** damaging the ancient trees. He needs help to protect the forest from these threats.",
      "The Korok's sacred grove is being invaded by **{amount}x {monster} (tier: {tier})**. He can't maintain the forest until they're removed.",
      "Walton discovered **{amount}x {monster} (tier: {tier})** that are threatening the forest's delicate balance. He needs assistance."
    ],
    escort: [
      "Walton needs to deliver sacred seeds to **{location}** but the journey is dangerous. He seeks a trustworthy escort.",
      "The Korok is heading to **{location}** to share forest wisdom, but the path is perilous.",
      "Walton's been summoned to **{location}** to help with a forest problem, but he's worried about leaving his trees."
    ],
    crafting: [
      "Walton's forest care tools are breaking down. He needs **{amount}x {item}** to maintain the ancient trees properly.",
      "The Korok wants to build a new forest sanctuary but requires **{amount}x {item}** for the construction.",
      "Walton's been developing new tree healing techniques but needs **{amount}x {item}** to complete his methods."
    ]
  },
  'Jengo': {
    item: [
      "Jengo the Goron Miner's pickaxes are dull from constant use. He needs **{amount}x {item}** to maintain his mining equipment.",
      "The miner's safety gear is wearing out. Jengo needs **{amount}x {item}** to work safely in the deep mines.",
      "Jengo's been mining in dangerous conditions and needs **{amount}x {item}** to repair his damaged tools."
    ],
    monster: [
      "Jengo discovered **{amount}x {monster} (tier: {tier})** in the mine shafts. They're blocking access to valuable ore deposits.",
      "The Goron miner's usual mining areas are infested with **{amount}x {monster} (tier: {tier})**. He can't work until they're cleared.",
      "Jengo found a rich ore vein but it's guarded by **{amount}x {monster} (tier: {tier})**. He needs help to access the minerals."
    ],
    escort: [
      "Jengo has a valuable ore shipment bound for **{location}** but bandits are targeting mining caravans. He needs protection.",
      "The miner is heading to **{location}** to share mining techniques, but the journey is dangerous.",
      "Jengo's been invited to **{location}** to help with a mining problem, but he's nervous about traveling alone."
    ],
    crafting: [
      "Jengo's mining tools need upgrading to reach deeper deposits. He requires **{amount}x {item}** to forge better equipment.",
      "The Goron miner wants to build a new mining outpost but needs **{amount}x {item}** for the construction.",
      "Jengo's been developing new mining techniques but requires **{amount}x {item}** to perfect his methods."
    ]
  },
  'Jasz': {
    item: [
      "Jasz the Nocturnal Twili Hunter's night vision equipment is failing. He needs **{amount}x {item}** to continue his nocturnal work.",
      "The hunter's stealth gear is damaged. Jasz needs **{amount}x {item}** to maintain his silent hunting abilities.",
      "Jasz's been hunting in the darkness and needs **{amount}x {item}** to repair his specialized equipment."
    ],
    monster: [
      "Jasz spotted **{amount}x {monster} (tier: {tier})** that are too dangerous for night hunting. He needs backup to eliminate them safely.",
      "The Twili hunter's territory is being invaded by **{amount}x {monster} (tier: {tier})**. He needs help to drive them back.",
      "Jasz discovered **{amount}x {monster} (tier: {tier})** that are threatening nocturnal wildlife. He needs assistance to restore balance."
    ],
    escort: [
      "Jasz needs to deliver rare nocturnal specimens to **{location}** for study, but the journey is dangerous. He seeks an escort.",
      "The hunter is heading to **{location}** to report on night creatures, but the path is perilous.",
      "Jasz's been summoned to **{location}** to help with a nocturnal problem, but he's worried about traveling in daylight."
    ],
    crafting: [
      "Jasz's hunting weapons need upgrading for stronger night creatures. He requires **{amount}x {item}** to forge better gear.",
      "The Twili hunter wants to build a new night hunting lodge but needs **{amount}x {item}** for the construction.",
      "Jasz's been developing new nocturnal tracking techniques but requires **{amount}x {item}** to perfect his methods."
    ]
  },
  'Lecia': {
    item: [
      "Lecia the Sheikah Scholar's research materials are running low. She needs **{amount}x {item}** to continue her ancient studies.",
      "The scholar's preservation equipment is failing. Lecia needs **{amount}x {item}** to protect valuable artifacts.",
      "Lecia's been studying ancient ruins and needs **{amount}x {item}** to safely explore dangerous sites."
    ],
    monster: [
      "Lecia discovered **{amount}x {monster} (tier: {tier})** guarding ancient ruins she was studying. She needs help to access the historical site.",
      "The Sheikah scholar's research areas are infested with **{amount}x {monster} (tier: {tier})**. She can't work until they're cleared.",
      "Lecia found a promising archaeological site but it's protected by **{amount}x {monster} (tier: {tier})**. She needs assistance to explore it."
    ],
    escort: [
      "Lecia has fragile ancient artifacts bound for **{location}** for study, but the journey is risky. She needs careful protection.",
      "The scholar is heading to **{location}** to share her archaeological discoveries, but the path is dangerous.",
      "Lecia's been invited to **{location}** to teach ancient history, but she's nervous about traveling with valuable artifacts."
    ],
    crafting: [
      "Lecia's research tools are wearing out from constant use. She needs **{amount}x {item}** to maintain her scholarly equipment.",
      "The Sheikah scholar wants to build a new research library but requires **{amount}x {item}** for the construction.",
      "Lecia's been developing new archaeological techniques but needs **{amount}x {item}** to complete her research."
    ]
  },
  'Tye': {
    item: [
      "Tye the Kokiri Botanist's plant samples are deteriorating. She needs **{amount}x {item}** to preserve her botanical research.",
      "The botanist's greenhouse equipment is failing. Tye needs **{amount}x {item}** to maintain her plant experiments.",
      "Tye's been studying rare plants and needs **{amount}x {item}** to safely collect specimens from dangerous areas."
    ],
    monster: [
      "Tye discovered **{amount}x {monster} (tier: {tier})** destroying rare plants she was studying. She needs help to protect the endangered species.",
      "The Kokiri botanist's research areas are infested with **{amount}x {monster} (tier: {tier})**. She can't work until they're removed.",
      "Tye found a rare plant grove but it's guarded by **{amount}x {monster} (tier: {tier})**. She needs assistance to access the specimens."
    ],
    escort: [
      "Tye has delicate plant specimens bound for **{location}** for study, but the journey is risky. She needs careful protection.",
      "The botanist is heading to **{location}** to share her botanical discoveries, but the path is dangerous.",
      "Tye's been invited to **{location}** to teach plant cultivation, but she's worried about traveling with fragile specimens."
    ],
    crafting: [
      "Tye's botanical tools are wearing out from constant use. She needs **{amount}x {item}** to maintain her research equipment.",
      "The Kokiri botanist wants to build a new greenhouse but requires **{amount}x {item}** for the construction.",
      "Tye's been developing new plant cultivation techniques but needs **{amount}x {item}** to complete her research."
    ]
  },
  'Lil Tim': {
    item: [
      "Lil Tim the Cucco's coop is falling apart. He needs **{amount}x {item}** to rebuild his home for his feathered family.",
      "The Cucco's feeding supplies are running low. Lil Tim needs **{amount}x {item}** to keep his birds healthy.",
      "Lil Tim's been busy with his flock and needs **{amount}x {item}** to maintain their living space."
    ],
    monster: [
      "Lil Tim spotted **{amount}x {monster} (tier: {tier})** threatening his precious Cucco flock. He needs help to protect his birds.",
      "The Cucco's territory is being invaded by **{amount}x {monster} (tier: {tier})**. He can't keep his flock safe until they're driven away.",
      "Lil Tim discovered **{amount}x {monster} (tier: {tier})** that are scaring away his birds. He needs assistance to restore peace."
    ],
    escort: [
      "Lil Tim needs to deliver fresh eggs to **{location}** but the journey is dangerous. He seeks a trustworthy escort.",
      "The Cucco is heading to **{location}** to share his bird-keeping wisdom, but the path is perilous.",
      "Lil Tim's been invited to **{location}** to help with a poultry problem, but he's nervous about traveling alone."
    ],
    crafting: [
      "Lil Tim's coop maintenance tools are breaking down. He needs **{amount}x {item}** to keep his birds' home in good condition.",
      "The Cucco wants to build a new nesting area but requires **{amount}x {item}** for the construction.",
      "Lil Tim's been developing new bird care techniques but needs **{amount}x {item}** to complete his methods."
    ]
  }
};

// ------------------- Function: getRandomElement -------------------
// Returns a random element from an array
// ============================================================================
function getRandomElement(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ------------------- Function: getNPCQuestFlavor -------------------
// Returns a random quest flavor text for the given NPC and quest type
// ============================================================================
function getNPCQuestFlavor(npcName, questType, requirements) {
  const npcFlavor = NPC_QUEST_FLAVOR[npcName];
  if (!npcFlavor || !npcFlavor[questType]) {
    // Fallback to generic flavor text if NPC or quest type not found
    const fallbackTexts = {
      item: `**${npcName} needs supplies:** Gather **${requirements.amount}x ${requirements.item}** for the village`,
      monster: `**${npcName} seeks a hunter:** Defeat **${requirements.amount}x ${requirements.monster} (tier: ${requirements.tier})** threatening the area`,
      escort: `**${npcName} needs protection:** Safely escort them to **${requirements.location}**`,
      crafting: `**${npcName} needs a craftsman:** Create and deliver **${requirements.amount}x ${requirements.item}**`
    };
    return fallbackTexts[questType] || `**${npcName} needs help:** Complete this quest for the village`;
  }

  const flavorOptions = npcFlavor[questType];
  const selectedFlavor = getRandomElement(flavorOptions);
  
  // Replace placeholders with actual quest requirements
  return selectedFlavor
    .replace('{amount}', requirements.amount)
    .replace('{item}', requirements.item)
    .replace('{monster}', requirements.monster)
    .replace('{tier}', requirements.tier)
    .replace('{location}', requirements.location);
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
  }, 'name tier');
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
      requirements = { monster: monster.name, tier: monster.tier, amount: Math.floor(Math.random() * 5) + 3 };
      break;
    }
    case 'escort': {
      // Filter out the current village from possible destinations to avoid same-location escort quests
      const availableDestinations = pools.escortPool.filter(loc => loc !== village);
      if (availableDestinations.length === 0) {
        // Fallback: if no other destinations available, use any location except current village
        const allLocations = getAllVillages();
        const fallbackDestinations = allLocations.filter(loc => loc !== village);
        const location = getRandomElement(fallbackDestinations);
        requirements = { location };
      } else {
        const location = getRandomElement(availableDestinations);
        requirements = { location };
      }
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
  
  // Safety check to ensure questId is never null
  if (!questId) {
    throw new Error(`Failed to generate questId for ${village} quest`);
  }
  
  // Assign a random NPC for this quest
  const npcName = getRandomNPCName();
  
  console.log(`[HelpWanted] Generated quest for ${village} (${type}) with questId: ${questId} - NPC: ${npcName}`);
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

  // Clean up any existing documents with null questId to prevent duplicate key errors
  await HelpWantedQuest.deleteMany({ questId: null });
  console.log('[HelpWanted] Cleaned up documents with null questId');

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
  const quests = await HelpWantedQuest.find({ date });
  
  // Ensure all quests have an npcName field (migration for existing quests)
  for (const quest of quests) {
    if (!quest.npcName) {
      quest.npcName = getRandomNPCName();
      await quest.save();
      console.log(`[HelpWanted] Added npcName to existing quest ${quest.questId}: ${quest.npcName}`);
    }
  }
  
  return quests;
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
    // Use the stored NPC name from the quest data
    const npcName = quest.npcName || getRandomNPCName();
    
    // Get quest type emoji from centralized mapping
    const emoji = QUEST_TYPE_EMOJIS[quest.type] || '❓';
    
    // Use specialized NPC flavor text
    let questLine = getNPCQuestFlavor(npcName, quest.type, quest.requirements);
    questLine = `${emoji} **[${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest]** ${questLine}`;
    
    // Status line
    let status = quest.completed
      ? `❌ COMPLETED by <@${quest.completedBy?.userId || 'unknown'}> at ${quest.completedBy?.timestamp || 'unknown'}`
      : '✅ AVAILABLE';
      
    embed.addFields({
      name: `${quest.village} — ${npcName}`,
      value: `${questLine}\n**Status:** ${status}\n**Type:** ${emoji} ${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest\n**Location:** ${quest.village}`
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
      return '• **Item Quest:** Gather the requested materials and bring them to the quest board. Use </helpwanted complete:1397274578530865313> when ready.';
    case 'monster':
      return '• **Monster Quest:** Hunt down the dangerous creatures threatening the village. Use </helpwanted monsterhunt:1397274578530865313> to complete this quest.';
    case 'escort':
      return '• **Escort Quest:** Safely guide the villager to their destination. Please travel from the quest village to the destination village using `</travel:1379850586987430009>`, then use </helpwanted complete:1397274578530865313>.';
    case 'crafting':
      return '• **Crafting Quest:** Create the requested item with your own hands. Craft the required item yourself, then use </helpwanted complete:1397274578530865313>.';
    default:
      return '• Use </helpwanted complete:1397274578530865313> to turn in your quest.';
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

  for (const quest of quests) {
    // Use the stored NPC name from the quest data
    const npcName = quest.npcName || getRandomNPCName();

    // Main quest line (using specialized NPC flavor text)
    let questLine = getNPCQuestFlavor(npcName, quest.type, quest.requirements);
    let status = quest.completed
      ? `❌ COMPLETED by <@${quest.completedBy?.userId || 'unknown'}> at ${quest.completedBy?.timestamp || 'unknown'}`
      : '✅ AVAILABLE';

    // How to complete (quest-type-specific)
    const turnIn = getQuestTurnInInstructions(quest.type);

    // Rules (short, clear)
    const rules =
      '• Only natives of the village can complete this quest.\n' +
      '• First come, first served—one completion per quest!\n' +
      '• Each user can only complete one Help Wanted quest per day (across all characters).\n' +
      '• Complete quests to help your village prosper!';

    // Embed color and image
    const color = VILLAGE_COLORS[quest.village] || '#25c059';
    const image = VILLAGE_IMAGES[quest.village] || null;

    const divider = '<:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506><:br:788136157363306506>';
    
    // Quest info fields
    const questInfoFields = [
      { name: '__Status__', value: quest.completed ? '❌ **COMPLETED**' : '✅ **AVAILABLE**', inline: true },
      { name: '__Type__', value: `${QUEST_TYPE_EMOJIS[quest.type] || '❓'} ${quest.type.charAt(0).toUpperCase() + quest.type.slice(1)} Quest`, inline: true },
      { name: '__Location__', value: quest.village, inline: true }
    ];
    
    const embed = new EmbedBuilder()
      .setTitle(`${QUEST_TYPE_EMOJIS[quest.type] || '🌿'} Help Wanted — ${quest.village}`)
      .setColor(color)
      .addFields(
        { name: 'Quest', value: `${questLine}\n${divider}` },
        ...questInfoFields,
        { name: 'How to Complete', value: turnIn },
        { name: 'Rules', value: rules },
        { name: 'Quest ID', value: quest.questId ? `\`\`\`${quest.questId}\`\`\`` : 'N/A', inline: true }
      );
    if (image) embed.setImage(image);
    result[quest.village] = embed;
  }
  return result;
}

// ------------------- Function: hasUserCompletedQuestToday -------------------
// Checks if a user has already completed a Help Wanted quest today
// ============================================================================
async function hasUserCompletedQuestToday(userId) {
  const user = await require('../models/UserModel').findOne({ discordId: userId });
  if (!user) return false;
  
  const today = new Date().toISOString().slice(0, 10);
  return user.helpWanted.lastCompletion === today;
}

// ------------------- Function: hasUserReachedWeeklyQuestLimit -------------------
// Checks if a user has already completed 3 or more Help Wanted quests this week
// ============================================================================
async function hasUserReachedWeeklyQuestLimit(userId) {
  const user = await require('../models/UserModel').findOne({ discordId: userId });
  if (!user || !user.helpWanted.completions) return false;
  
  // Get the start of the current week (Sunday)
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
  startOfWeek.setHours(0, 0, 0, 0);
  
  // Count completions from this week
  const weeklyCompletions = user.helpWanted.completions.filter(completion => {
    const completionDate = new Date(completion.date);
    return completionDate >= startOfWeek;
  });
  
  return weeklyCompletions.length >= 3;
}

// ------------------- Function: updateQuestEmbed -------------------
// Updates the quest embed message to show completion status
// ============================================================================
async function updateQuestEmbed(client, quest, completedBy = null) {
  console.log(`[helpWantedModule]: Attempting to update quest embed for ${quest.questId}`);
  console.log(`[helpWantedModule]: Quest messageId: ${quest.messageId}, channelId: ${quest.channelId}, completed: ${quest.completed}`);
  
  if (!quest.messageId) {
    console.log(`[helpWantedModule]: No message ID found for quest ${quest.questId}`);
    return;
  }

  try {
    // Find the channel where the quest was posted
    if (!quest.channelId) {
      console.error(`[helpWantedModule]: No channel ID found for quest ${quest.questId}`);
      return;
    }
    
    const channel = await client.channels.fetch(quest.channelId);
    if (!channel) {
      console.error(`[helpWantedModule]: Could not find channel ${quest.channelId} for quest ${quest.questId}`);
      return;
    }

    // Fetch the original message
    const message = await channel.messages.fetch(quest.messageId);
    if (!message) {
      console.error(`[helpWantedModule]: Could not find message ${quest.messageId}`);
      return;
    }

    // Get the original embed
    const originalEmbed = message.embeds[0];
    if (!originalEmbed) {
      console.error(`[helpWantedModule]: No embed found in message ${quest.messageId}`);
      return;
    }

    // Create updated embed
    const updatedEmbed = new EmbedBuilder()
      .setTitle(originalEmbed.title)
      .setColor(quest.completed ? 0x00FF00 : originalEmbed.color) // Green if completed
      .setImage(originalEmbed.image?.url);

    // Update the quest field to show completion status
    const questField = originalEmbed.fields.find(field => field.name.includes('Quest'));
    if (questField) {
      updatedEmbed.addFields({
        name: questField.name,
        value: questField.value,
        inline: false
      });
    }

    // Update status field if it exists
    const statusField = originalEmbed.fields.find(field => field.name === 'Status' || field.name === '__Status__');
    if (statusField) {
      const newStatusValue = quest.completed ? '❌ **COMPLETED**' : '✅ **AVAILABLE**';
      updatedEmbed.addFields({
        name: '__Status__',
        value: newStatusValue,
        inline: true
      });
    }

    // Copy other fields (excluding Quest and Status which we've already handled)
    originalEmbed.fields.forEach(field => {
      if (!field.name.includes('Quest') && field.name !== 'Status' && field.name !== '__Status__') {
        updatedEmbed.addFields(field);
      }
    });

    // Update the message
    await message.edit({ embeds: [updatedEmbed] });
    console.log(`[helpWantedModule]: ✅ Successfully updated quest embed for ${quest.questId}`);
  } catch (error) {
    console.error(`[helpWantedModule]: ❌ Failed to update quest embed for ${quest.questId}:`, error);
  }
}

// ------------------- Exports -------------------
// ============================================================================
module.exports = {
  generateDailyQuests,
  getItemQuestPool,
  getMonsterQuestPool,
  hasUserCompletedQuestToday,
  hasUserReachedWeeklyQuestLimit,
  getCraftingQuestPool,
  getEscortQuestPool,
  VILLAGES,
  QUEST_TYPES,
  FIXED_CRON_TIMES,
  QUEST_TYPE_EMOJIS,
  getTodaysQuests,
  formatQuestsAsEmbed,
  formatQuestsAsEmbedsByVillage,
  getQuestsForScheduledTime,
  updateQuestEmbed,
  hasUserCompletedQuestToday
}; 