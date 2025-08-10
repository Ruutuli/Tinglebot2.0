const generalCategories = require('../models/GeneralItemCategories'); // Categories from GeneralItemCategories.js

// ------------------- Define NPCs and their available categories and custom flavor texts -------------------
const NPCs = {
    'Hank': {
      categories: ['Any Plant'],
      flavorText: "Hank, the Hylian Herbalist, mutters something about allergies as you pocket some herbs.",
      icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Hank.jpg"
    },
    'Sue': {
      categories: ['Any Seafood'],
      flavorText: "Sue, the Zora Fisherman, doesn't seem to notice as you slip a fish into your bag, her eyes focused on the river.",
      icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Sue.png"
    },
    'Lukan': {
      categories: ['Any Fruit'],
      flavorText: "Lukan, the Gerudo Orchard Keeper, is preoccupied with the trees, allowing you to sneak away with some fruit.",
      icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Lukan.png"
    },
    'Myti': {
      categories: ['Any Lizard'],
      flavorText: "Myti, the Mogma Scout, is too focused on the landscape to notice you picking up one of their lizards.",
      icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Myti.png"
    },
    'Cree': {
      categories: ['Any Monster Part'],
      flavorText: "Cree, the Rito Monster Hunter, is distracted, leaving you a chance to grab some monster parts.",
      icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Cree.png"
    },
    'Cece': {
      categories: ['Any Mushroom'],
      flavorText: "Cece, the Mixed Mushroom Forager, hums to herself, unaware as you collect some mushrooms.",
      icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Cece.png"
    },
    'Walton': {
      categories: ['Any Nut'],
      flavorText: "Walton, the Korok, is too busy gathering acorns to notice you taking one.",
      icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Walton.png"
    },
    'Jengo': {
      categories: ['Any Ore'],
      flavorText: "Jengo, the Goron Miner, is too busy digging to see you snagging some ore.",
      icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Jengo.png"
    },
    'Jasz': {
      categories: ['Any Raw Meat'],
      flavorText: "Jasz, the Nocturnal Twili Hunter, is too busy preparing his tools to notice you taking some of his spoils.",
      icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Jasz.png"
    },
    'Lecia': {
      categories: ['Any Ancient Material'],
      flavorText: "Lecia, the Sheikah Scholar, is preoccupied with research, allowing you to pocket some ancient materials.",
      icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Lecia.png"
    },
    'Tye': {
      categories: ['Any Organic Material'],
      flavorText: "Tye, the Kokiri Botanist, is deep in research, giving you a perfect opportunity to snatch some materials.",
      icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Tye.jpg"
    },
    'Lil Tim': {
      items: ['Bird Egg', 'Cucco Feather'], // Specific items
      flavorText: "Lil Tim the Cucco clucks loudly, but you manage to grab some eggs and feathers before being chased away!",
      icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Tim.png"
    }
  };
  
// TODO: Add a Keaton NPC 
// ------------------- Function to get available items from an NPC -------------------
const getNPCItems = (npcName) => {
  const npc = NPCs[npcName];
  if (!npc) return [];

  const availableItems = [];
  
  // Handle NPCs with specific items (like Lil Tim)
  if (npc.items) {
    availableItems.push(...npc.items);
    return availableItems;
  }
  
  // Handle NPCs with categories
  if (npc.categories) {
    npc.categories.forEach(category => {
      if (category === 'Any Plant') {
        // Add all plant items
        Object.values(generalCategories.plants).forEach(plantArray => {
          plantArray.forEach(plant => {
            availableItems.push(plant);
          });
        });
      } else if (generalCategories[category]) {
        // Add items from the specified category
        availableItems.push(...generalCategories[category]);
      }
    });
  }

  return availableItems;
};

// ------------------- Function to steal an item from an NPC -------------------
const stealFromNPC = (npcName) => {
  const availableItems = getNPCItems(npcName);
  if (availableItems.length === 0) return null;

  const randomItem = availableItems[Math.floor(Math.random() * availableItems.length)];
  return randomItem;
};

// ------------------- Helper function for random selection -------------------
const getRandomElement = (arr) => {
  return arr[Math.floor(Math.random() * arr.length)];
};

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
      "Lukan the Gerudo Orchard Keeper's trees are suffering from a mysterious blight. She needs **{amount}x {item}** to treat the disease.",
      "The orchard's irrigation system is failing. Lukan urgently needs **{amount}x {item}** to repair the water channels.",
      "Lukan's fruit harvest is ready but she's short on storage containers. She needs **{amount}x {item}** to preserve the bounty."
    ],
    monster: [
      "Lukan's orchard is being raided by **{amount}x {monster} (tier: {tier})** who are eating all the fruit. She needs them driven away.",
      "The Gerudo orchard keeper spotted **{amount}x {monster} (tier: {tier})** nesting in his trees, damaging the branches. They must be removed.",
      "Lukan's fruit trees are under attack by **{amount}x {monster} (tier: {tier})**. She can't harvest safely until they're eliminated."
    ],
    escort: [
      "Lukan has a wagon full of fresh fruit bound for **{location}** but bandits have been targeting merchant caravans. She needs protection.",
      "Lukan is heading to **{location}** to learn new cultivation techniques, but the journey is perilous.",
      "Lukan's been invited to **{location}** to share her fruit-growing secrets, but she's nervous about traveling alone."
    ],
    crafting: [
      "Lukan's orchard tools are worn out from years of use. She needs **{amount}x {item}** to maintain her grove properly.",
      "The Gerudo orchard keeper wants to build a new greenhouse but requires **{amount}x {item}** for the construction.",
      "Lukan's been developing new fruit varieties but needs **{amount}x {item}** to complete her research."
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

// ------------------- Function to get NPC quest flavor text -------------------
const getNPCQuestFlavor = (npcName, questType, requirements) => {
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
};

// ------------------- Export functions -------------------
module.exports = {
  getNPCItems,
  stealFromNPC,
  NPCs,
  NPC_QUEST_FLAVOR,
  getNPCQuestFlavor,
  getRandomElement,
};
