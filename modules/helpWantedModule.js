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
// Returns a random NPC name from the stealingNPCSModule
function getRandomNPCName() {
  const npcNames = Object.keys(NPCs);
  if (npcNames.length === 0) {
    throw new Error('No NPCs available');
  }
  return getRandomElement(npcNames);
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

// ------------------- Function: getNPCQuestFlavor -------------------
// Returns a random quest flavor text for the given NPC and quest type
function getNPCQuestFlavor(npcName, questType, requirements) {
  // ------------------- Special Walton Acorn Quest -------------------
  if (npcName === 'Walton' && questType === 'item' && requirements.item === 'Acorn' && requirements.amount === 50) {
    const specialAcornTexts = [
      "Walton the Korok is preparing for a grand forest festival! He needs **50x Acorn** to create beautiful decorations for the celebration.",
      "Walton discovered an ancient Korok tradition that requires **50x Acorn** for a sacred forest ritual. He needs help gathering these special acorns.",
      "Walton's forest friends are planning a massive acorn feast! He needs **50x Acorn** to make sure everyone has enough to eat.",
      "Walton found an old Korok recipe that calls for **50x Acorn** to make a legendary forest elixir. He's excited to try it!",
      "Walton's tree friends are feeling lonely and want **50x Acorn** to plant new saplings. He needs help to grow the forest family.",
      "Walton wishes to harass the peddler. Please give him **50x Acorn** to help him!"
    ];
    return getRandomElement(specialAcornTexts);
  }

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

// ============================================================================
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
      "Sue's favorite fishing spot is overrun by **{amount}x {monster} (tier: {tier})**. She can't work until they're cleared out.",
      "Sue's fish traps keep getting destroyed by **{amount}x {monster} (tier: {tier})**. She needs a hunter to eliminate the threat."
    ],
    escort: [
      "Sue has a shipment of fresh fish bound for **{location}** but the journey is risky. She needs an escort to ensure the delivery arrives on time.",
      "Sue is heading to **{location}** to negotiate new trade routes, but the path is dangerous. She seeks protection.",
      "Sue's been invited to **{location}** to share her fishing techniques, but she's worried about traveling alone."
    ],
    crafting: [
      "Sue's fishing gear is wearing out. She needs **{amount}x {item}** to maintain her livelihood on the river.",
      "Sue wants to expand her business but needs **{amount}x {item}** to build new fish processing equipment.",
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
      "Lukan is heading to **{location}** to learn new cultivation techniques, but the journey is perilous.",
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
      "Myti is heading to **{location}** to share his underground discoveries, but the surface journey is dangerous.",
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
      "Cree's tracking supplies are depleted. He needs **{amount}x {item}** to continue his dangerous work.",
      "Cree's been hunting in harsh conditions and needs **{amount}x {item}** to repair his damaged equipment."
    ],
    monster: [
      "Cree spotted a pack of **{amount}x {monster} (tier: {tier})** that are too dangerous for him to handle alone. He needs backup to eliminate them.",
      "Cree's territory is being invaded by **{amount}x {monster} (tier: {tier})**. He needs help to drive them back.",
      "Cree discovered **{amount}x {monster} (tier: {tier})** that are threatening local wildlife. He needs assistance to restore the balance."
    ],
    escort: [
      "Cree needs to deliver monster parts to **{location}** for analysis, but the road is dangerous. He seeks a capable escort.",
      "Cree is heading to **{location}** to report on dangerous creatures, but the journey is perilous.",
      "Cree's been summoned to **{location}** to help with a monster problem, but he's worried about traveling alone."
    ],
    crafting: [
      "Cree's hunting weapons need upgrading to handle stronger monsters. He requires **{amount}x {item}** to forge better gear.",
      "Cree wants to build a new hunting lodge but needs **{amount}x {item}** for the construction.",
      "Cree's been developing new monster tracking techniques but requires **{amount}x {item}** to perfect his methods."
    ]
  },
  'Cece': {
    item: [
      "Cece the Mixed Mushroom Forager's collection baskets are falling apart. She needs **{amount}x {item}** to continue her mushroom hunting.",
      "Cece's preservation supplies are running low. She needs **{amount}x {item}** to keep her mushrooms fresh.",
      "Cece's been exploring new forest areas and needs **{amount}x {item}** to safely navigate the dangerous terrain."
    ],
    monster: [
      "Cece discovered **{amount}x {monster} (tier: {tier})** in her favorite mushroom patch. They're trampling all the rare fungi she needs.",
      "Cece's usual gathering spots are infested with **{amount}x {monster} (tier: {tier})**. She can't work safely until they're gone.",
      "Cece found a new mushroom grove but it's guarded by **{amount}x {monster} (tier: {tier})**. She needs help to access the valuable fungi."
    ],
    escort: [
      "Cece has a rare mushroom shipment bound for **{location}** but the journey is risky. She needs protection to ensure the delicate cargo arrives.",
      "Cece is heading to **{location}** to share her mushroom knowledge, but the path is dangerous.",
      "Cece's been invited to **{location}** to teach foraging techniques, but she's nervous about traveling alone."
    ],
    crafting: [
      "Cece's foraging tools are worn out from constant use. She needs **{amount}x {item}** to maintain her collection equipment.",
      "Cece wants to build a new drying shed but requires **{amount}x {item}** for the construction.",
      "Cece's been developing new mushroom preservation methods but needs **{amount}x {item}** to complete her research."
    ]
  },
  'Walton': {
    item: [
      "Walton the Korok's acorn collection is running low. He needs **{amount}x {item}** to maintain his forest home.",
      "Walton's tree care supplies are depleted. He needs **{amount}x {item}** to keep the forest healthy.",
      "Walton's been busy with forest maintenance and needs **{amount}x {item}** to complete his work."
    ],
    monster: [
      "Walton spotted **{amount}x {monster} (tier: {tier})** damaging the ancient trees. He needs help to protect the forest from these threats.",
      "Walton's sacred grove is being invaded by **{amount}x {monster} (tier: {tier})**. He can't maintain the forest until they're removed.",
      "Walton discovered **{amount}x {monster} (tier: {tier})** that are threatening the forest's delicate balance. He needs assistance."
    ],
    escort: [
      "Walton needs to deliver sacred seeds to **{location}** but the journey is dangerous. He seeks a trustworthy escort.",
      "Walton is heading to **{location}** to share forest wisdom, but the path is perilous.",
      "Walton's been summoned to **{location}** to help with a forest problem, but he's worried about leaving his trees."
    ],
    crafting: [
      "Walton's forest care tools are breaking down. He needs **{amount}x {item}** to maintain the ancient trees properly.",
      "Walton wants to build a new forest sanctuary but requires **{amount}x {item}** for the construction.",
      "Walton's been developing new tree healing techniques but needs **{amount}x {item}** to complete his methods."
    ]
  },
  'Jengo': {
    item: [
      "Jengo the Goron Miner's pickaxes are dull from constant use. He needs **{amount}x {item}** to maintain his mining equipment.",
      "Jengo's safety gear is wearing out. He needs **{amount}x {item}** to work safely in the deep mines.",
      "Jengo's been mining in dangerous conditions and needs **{amount}x {item}** to repair his damaged tools."
    ],
    monster: [
      "Jengo discovered **{amount}x {monster} (tier: {tier})** in the mine shafts. They're blocking access to valuable ore deposits.",
      "Jengo's usual mining areas are infested with **{amount}x {monster} (tier: {tier})**. He can't work until they're cleared.",
      "Jengo found a rich ore vein but it's guarded by **{amount}x {monster} (tier: {tier})**. He needs help to access the minerals."
    ],
    escort: [
      "Jengo has a valuable ore shipment bound for **{location}** but bandits are targeting mining caravans. He needs protection.",
      "Jengo is heading to **{location}** to share mining techniques, but the journey is dangerous.",
      "Jengo's been invited to **{location}** to help with a mining problem, but he's nervous about traveling alone."
    ],
    crafting: [
      "Jengo's mining tools need upgrading to reach deeper deposits. He requires **{amount}x {item}** to forge better equipment.",
      "Jengo wants to build a new mining outpost but needs **{amount}x {item}** for the construction.",
      "Jengo's been developing new mining techniques but requires **{amount}x {item}** to perfect his methods."
    ]
  },
  'Jasz': {
    item: [
      "Jasz the Nocturnal Twili Hunter's night vision equipment is failing. He needs **{amount}x {item}** to continue his nocturnal work.",
      "Jasz's stealth gear is damaged. He needs **{amount}x {item}** to maintain his silent hunting abilities.",
      "Jasz's been hunting in the darkness and needs **{amount}x {item}** to repair his specialized equipment."
    ],
    monster: [
      "Jasz spotted **{amount}x {monster} (tier: {tier})** that are too dangerous for night hunting. He needs backup to eliminate them safely.",
      "Jasz's territory is being invaded by **{amount}x {monster} (tier: {tier})**. He needs help to drive them back.",
      "Jasz discovered **{amount}x {monster} (tier: {tier})** that are threatening nocturnal wildlife. He needs assistance to restore balance."
    ],
    escort: [
      "Jasz needs to deliver rare nocturnal specimens to **{location}** for study, but the journey is dangerous. He seeks an escort.",
      "Jasz is heading to **{location}** to report on night creatures, but the path is perilous.",
      "Jasz's been summoned to **{location}** to help with a nocturnal problem, but he's worried about traveling in daylight."
    ],
    crafting: [
      "Jasz's hunting weapons need upgrading for stronger night creatures. He requires **{amount}x {item}** to forge better gear.",
      "Jasz wants to build a new night hunting lodge but needs **{amount}x {item}** for the construction.",
      "Jasz's been developing new nocturnal tracking techniques but requires **{amount}x {item}** to perfect his methods."
    ]
  },
  'Lecia': {
    item: [
      "Lecia the Sheikah Scholar's research materials are running low. She needs **{amount}x {item}** to continue her ancient studies.",
      "Lecia's preservation equipment is failing. She needs **{amount}x {item}** to protect valuable artifacts.",
      "Lecia's been studying ancient ruins and needs **{amount}x {item}** to safely explore dangerous sites."
    ],
    monster: [
      "Lecia discovered **{amount}x {monster} (tier: {tier})** guarding ancient ruins she was studying. She needs help to access the historical site.",
      "Lecia's research areas are infested with **{amount}x {monster} (tier: {tier})**. She can't work until they're cleared.",
      "Lecia found a promising archaeological site but it's protected by **{amount}x {monster} (tier: {tier})**. She needs assistance to explore it."
    ],
    escort: [
      "Lecia has fragile ancient artifacts bound for **{location}** for study, but the journey is risky. She needs careful protection.",
      "Lecia is heading to **{location}** to share her archaeological discoveries, but the path is dangerous.",
      "Lecia's been invited to **{location}** to teach ancient history, but she's nervous about traveling with valuable artifacts."
    ],
    crafting: [
      "Lecia's research tools are wearing out from constant use. She needs **{amount}x {item}** to maintain her scholarly equipment.",
      "Lecia wants to build a new research library but requires **{amount}x {item}** for the construction.",
      "Lecia's been developing new archaeological techniques but needs **{amount}x {item}** to complete her research."
    ]
  },
  'Tye': {
    item: [
      "Tye the Kokiri Botanist's plant samples are deteriorating. She needs **{amount}x {item}** to preserve her botanical research.",
      "Tye's greenhouse equipment is failing. She needs **{amount}x {item}** to maintain her plant experiments.",
      "Tye's been studying rare plants and needs **{amount}x {item}** to safely collect specimens from dangerous areas."
    ],
    monster: [
      "Tye discovered **{amount}x {monster} (tier: {tier})** destroying rare plants she was studying. She needs help to protect the endangered species.",
      "Tye's research areas are infested with **{amount}x {monster} (tier: {tier})**. She can't work until they're removed.",
      "Tye found a rare plant grove but it's guarded by **{amount}x {monster} (tier: {tier})**. She needs assistance to access the specimens."
    ],
    escort: [
      "Tye has delicate plant specimens bound for **{location}** for study, but the journey is risky. She needs careful protection.",
      "Tye is heading to **{location}** to share her botanical discoveries, but the path is dangerous.",
      "Tye's been invited to **{location}** to teach plant cultivation, but she's worried about traveling with fragile specimens."
    ],
    crafting: [
      "Tye's botanical tools are wearing out from constant use. She needs **{amount}x {item}** to maintain her research equipment.",
      "Tye wants to build a new greenhouse but requires **{amount}x {item}** for the construction.",
      "Tye's been developing new plant cultivation techniques but needs **{amount}x {item}** to complete her research."
    ]
  },
  'Lil Tim': {
    item: [
      "Lil Tim the Cucco's coop is falling apart. He needs **{amount}x {item}** to rebuild his home for his feathered family.",
      "Lil Tim's feeding supplies are running low. He needs **{amount}x {item}** to keep his birds healthy.",
      "Lil Tim's been busy with his flock and needs **{amount}x {item}** to maintain their living space."
    ],
    monster: [
      "Lil Tim spotted **{amount}x {monster} (tier: {tier})** threatening his precious Cucco flock. He needs help to protect his birds.",
      "Lil Tim's territory is being invaded by **{amount}x {monster} (tier: {tier})**. He can't keep his flock safe until they're driven away.",
      "Lil Tim discovered **{amount}x {monster} (tier: {tier})** that are scaring away his birds. He needs assistance to restore peace."
    ],
    escort: [
      "Lil Tim needs to deliver fresh eggs to **{location}** but the journey is dangerous. He seeks a trustworthy escort.",
      "Lil Tim is heading to **{location}** to share his bird-keeping wisdom, but the path is perilous.",
      "Lil Tim's been invited to **{location}** to help with a poultry problem, but he's nervous about traveling alone."
    ],
    crafting: [
      "Lil Tim's coop maintenance tools are breaking down. He needs **{amount}x {item}** to keep his birds' home in good condition.",
      "Lil Tim wants to build a new nesting area but requires **{amount}x {item}** for the construction.",
      "Lil Tim's been developing new bird care techniques but needs **{amount}x {item}** to complete his methods."
    ]
  }
};

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

// ------------------- Function: getAllQuestPools -------------------
// Fetches all quest pools in parallel
async function getAllQuestPools() {
  try {
    const [itemPool, monsterPool, craftingPool] = await Promise.all([
      getItemQuestPool(),
      getMonsterQuestPool(),
      getCraftingQuestPool()
    ]);
    
    const escortPool = getEscortQuestPool();
    
    return { itemPool, monsterPool, craftingPool, escortPool };
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
async function generateQuestForVillage(village, date, pools) {
  // Validate pools
  const requiredPools = ['itemPool', 'monsterPool', 'craftingPool', 'escortPool'];
  for (const poolName of requiredPools) {
    if (!pools[poolName] || pools[poolName].length === 0) {
      throw new Error(`No ${poolName} available for ${village} quest generation`);
    }
  }

  const questId = generateUniqueId('X');
  
  if (!questId) {
    throw new Error(`Failed to generate questId for ${village} quest`);
  }
  
  const npcName = getRandomNPCName();
  
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

    // Generate quest posting times with 6-hour buffer between each
    const selectedTimes = selectTimesWithBuffer(FIXED_CRON_TIMES, VILLAGES.length);
    const quests = await Promise.all(VILLAGES.map(async (village, index) => {
      const quest = await generateQuestForVillage(village, date, pools);
      // Assign a posting time with 6-hour buffer from the selected times
      quest.scheduledPostTime = selectedTimes[index];
      const hour = cronToHour(quest.scheduledPostTime);
      console.log(`[HelpWanted] Generated quest for ${village} with posting time: ${formatHour(hour)} (${quest.scheduledPostTime})`);
      return quest;
    }));

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
      console.log(`  ${quest.village}: ${formatHour(hour)} (${quest.scheduledPostTime})`);
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
    item: '• **Item Quest:** Gather the requested materials and bring them to the quest board. Use </helpwanted complete:1397274578530865313> when ready.',
    monster: '• **Monster Quest:** Hunt down the dangerous creatures threatening the village. Use </helpwanted monsterhunt:1397274578530865313> to complete this quest. **Costs 1 stamina per attempt.**',
    escort: '• **Escort Quest:** Safely guide the villager to their destination. Please travel from the quest village to the destination village using </travel:1379850586987430009>, then use </helpwanted complete:1397274578530865313>.',
    crafting: '• **Crafting Quest:** Create the requested item with your own hands. Craft the required item yourself, then use </helpwanted complete:1397274578530865313>.'
  };
  
  return instructions[type] || '• Use </helpwanted complete:1397274578530865313> to turn in your quest.';
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
          const { NPCs } = require('./stealingNPCSModule');
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
          const { NPCs } = require('./stealingNPCSModule');
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
        const { NPCs } = require('./stealingNPCSModule');
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