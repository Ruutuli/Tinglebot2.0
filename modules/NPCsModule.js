const generalCategories = require('../models/GeneralItemCategories');

// ============================================================================
// ------------------- NPC Data Structure -------------------
// ============================================================================

// ------------------- Quest Type Templates -------------------
const QUEST_TEMPLATES = {
  item: [
    "{npcName} the {race} {profession} is running low on supplies. {pronoun} needs **{amount}x {item}** to continue {pronoun2} work.",
    "{npcName}'s {specialty} supplies are depleted. {pronoun} urgently needs **{amount}x {item}** to maintain {pronoun2} livelihood.",
    "{npcName} has been working overtime and needs **{amount}x {item}** to keep up with demand."
  ],
  monster: [
    "{npcName} spotted **{amount}x {monster} (tier: {tier})** threatening {pronoun2} territory. {pronoun} needs them eliminated to continue working safely.",
    "{npcName}'s area is being invaded by **{amount}x {monster} (tier: {tier})**. {pronoun} can't work until they're driven away.",
    "{npcName} discovered **{amount}x {monster} (tier: {tier})** that are blocking access to valuable resources. {pronoun} needs help to restore access."
  ],
  escort: [
    "{npcName} has a valuable shipment bound for **{location}** but the journey is dangerous. {pronoun} needs protection to ensure safe delivery.",
    "{npcName} is heading to **{location}** to share {pronoun2} expertise, but the path is perilous. {pronoun} seeks an escort.",
    "{npcName} has been invited to **{location}** but is nervous about traveling alone. {pronoun} needs a trustworthy companion."
  ],
  crafting: [
    "{npcName}'s tools are wearing out from constant use. {pronoun} needs **{amount}x {item}** to maintain {pronoun2} equipment properly.",
    "{npcName} wants to expand {pronoun2} business but requires **{amount}x {item}** for the construction.",
    "{npcName} has been developing new techniques but needs **{amount}x {item}** to complete {pronoun2} research."
  ]
};

// ------------------- NPC Definitions -------------------
const NPCs = {
  'Hank': {
    race: 'Hylian',
    profession: 'Herbalist',
    personality: 'Allergic but dedicated',
    specialties: ['Medicinal herbs', 'Allergy remedies', 'Village health'],
    categories: ['Any Plant'],
    flavorText: [
      "Hank, the Hylian Herbalist, mutters something about allergies as you pocket some herbs.",
      "Hank is too busy sneezing to notice you taking some of his medicinal supplies.",
      "The allergic herbalist is preoccupied with his runny nose, giving you the perfect opportunity to grab herbs.",
      "Hank's allergy attack provides the perfect distraction for you to snatch some healing plants."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Hank.jpg",
    pronouns: { subject: 'He', object: 'his', possessive: 'his' },
    specialty: 'medicinal supplies'
  },
  'Sue': {
    race: 'Zora',
    profession: 'Fisherman',
    personality: 'Focused and determined',
    specialties: ['Freshwater fishing', 'Fish markets', 'River trade'],
    categories: ['Any Seafood'],
    flavorText: [
      "Sue, the Zora Fisherman, doesn't seem to notice as you slip a fish into your bag, her eyes focused on the river.",
      "The focused Zora is too busy watching the water's surface to see you taking some of her catch.",
      "Sue's intense concentration on the river gives you the perfect chance to grab some fresh seafood.",
      "The determined fisherman is lost in thought about the perfect fishing spot, allowing you to pocket some fish."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Sue.png",
    pronouns: { subject: 'She', object: 'her', possessive: 'her' },
    specialty: 'fishing equipment'
  },
  'Lukan': {
    race: 'Gerudo',
    profession: 'Orchard Keeper',
    personality: 'Proud and nurturing',
    specialties: ['Fruit cultivation', 'Orchard management', 'Agricultural trade'],
    categories: ['Any Fruit'],
    flavorText: [
      "Lukan, the Gerudo Orchard Keeper, is preoccupied with the trees, allowing you to sneak away with some fruit.",
      "The proud orchard keeper is too busy tending to her precious trees to notice you taking some fruit.",
      "Lukan's nurturing nature keeps her focused on the orchard, giving you time to grab some fresh produce.",
      "The Gerudo is deep in conversation with her trees, providing the perfect cover for your fruit-gathering."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Lukan.png",
    pronouns: { subject: 'She', object: 'her', possessive: 'her' },
    specialty: 'orchard supplies'
  },
  'Myti': {
    race: 'Mogma',
    profession: 'Scout',
    personality: 'Curious and adventurous',
    specialties: ['Cave exploration', 'Underground mapping', 'Mineral discovery'],
    categories: ['Any Lizard'],
    flavorText: [
      "Myti, the Mogma Scout, is too focused on the landscape to notice you picking up one of their lizards.",
      "The curious Mogma is busy examining some interesting rock formations, allowing you to grab a lizard.",
      "Myti's adventurous spirit has them exploring a nearby cave entrance, giving you time to pocket some lizards.",
      "The scout is too busy mapping the underground terrain to see you taking some of their reptilian friends."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Myti.png",
    pronouns: { subject: 'He', object: 'him', possessive: 'his' },
    specialty: 'exploration equipment'
  },
  'Cree': {
    race: 'Rito',
    profession: 'Monster Hunter',
    personality: 'Brave and vigilant',
    specialties: ['Monster tracking', 'Wildlife protection', 'Territory defense'],
    categories: ['Any Monster Part'],
    flavorText: [
      "Cree, the Rito Monster Hunter, is distracted, leaving you a chance to grab some monster parts.",
      "The brave hunter is too busy scanning the horizon for threats to notice you taking some monster parts.",
      "Cree's vigilance is focused on the skies, allowing you to quietly collect some monster remains.",
      "The Rito is preoccupied with checking his hunting traps, giving you the perfect opportunity to grab parts."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Cree.png",
    pronouns: { subject: 'He', object: 'him', possessive: 'his' },
    specialty: 'hunting gear'
  },
  'Cece': {
    race: 'Mixed Heritage',
    profession: 'Mushroom Forager',
    personality: 'Gloomy and knowledgeable',
    specialties: ['Mushroom identification', 'Forest foraging', 'Fungal preservation'],
    categories: ['Any Mushroom'],
    flavorText: [
      "Cece the Mixed Heritage Mushroom Forager gloomily watches you gather mushrooms, muttering about proper identification techniques.",
      "The gloomy forager is too busy cataloging mushroom species to stop you from taking some samples.",
      "Cece's knowledge of fungi keeps them preoccupied with documentation, allowing you to grab some mushrooms.",
      "The forager is muttering about spore patterns and doesn't notice you pocketing some of their finds."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Cece.jpg",
    pronouns: { subject: 'She', object: 'her', possessive: 'her' },
    specialty: 'foraging supplies'
  },
  'Zone': {
    race: 'Keaton',
    profession: 'Weapons Dealer',
    personality: 'Crafty and protective',
    specialties: ['Weapon crafting', 'Armor smithing', 'Military equipment'],
    categories: ['Armor', 'Weapons'],
    flavorText: [
      "Zone the Keaton Weapons Dealer growls as you make off with some of his precious armor and weapons!",
      "The crafty Keaton is too busy sharpening a blade to notice you taking some of his merchandise.",
      "Zone's protective nature has him focused on securing his shop, giving you time to grab some gear.",
      "The weapons dealer is preoccupied with inventory counts, allowing you to slip away with some equipment."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Zone.png",
    pronouns: { subject: 'He', object: 'him', possessive: 'his' },
    specialty: 'smithing materials'
  },
  'Peddler': {
    race: 'Hylian',
    profession: 'Auctioneer',
    personality: 'Charismatic and shrewd',
    categories: ['Any Plant', 'Any Mushroom', 'Armor', 'Weapons'],
    flavorText: [
      "Peddler the Hylian Auctioneer shouts after you as you grab items from his collection, his auctioneer's voice echoing through the marketplace!",
      "The charismatic peddler is too busy haggling with another customer to notice you taking some goods.",
      "Peddler's shrewd business sense has him focused on a potential sale, allowing you to grab some items.",
      "The auctioneer is preoccupied with setting up his next auction, giving you the perfect opportunity to pocket some wares."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Peddler.png",
    pronouns: { subject: 'He', object: 'him', possessive: 'his' },
    specialty: 'auction inventory'
  },
  'Walton': {
    race: 'Korok',
    profession: 'Forest Guardian',
    personality: 'Wise and playful',
    specialties: ['Forest care', 'Tree healing', 'Ancient wisdom'],
    categories: ['Any Nut'],
    flavorText: [
      "Walton, the Korok, is too busy gathering acorns to notice you taking one.",
      "The wise forest guardian is preoccupied with healing a sick tree, allowing you to grab some nuts.",
      "Walton's playful nature has him chasing butterflies, giving you time to pocket some acorns.",
      "The Korok is too busy sharing ancient wisdom with the forest creatures to see you taking some nuts."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Walton.png",
    pronouns: { subject: 'He', object: 'him', possessive: 'his' },
    specialty: 'forest supplies'
  },
  'Jengo': {
    race: 'Goron',
    profession: 'Miner',
    personality: 'Strong and hardworking',
    specialties: ['Deep mining', 'Ore extraction', 'Mine safety'],
    categories: ['Any Ore'],
    flavorText: [
      "Jengo, the Goron Miner, is too busy digging to see you snagging some ore.",
      "The strong miner is preoccupied with reinforcing mine supports, allowing you to grab some ore.",
      "Jengo's hardworking nature has him focused on a particularly stubborn rock, giving you time to pocket some minerals.",
      "The Goron is too busy checking the mine's structural integrity to notice you taking some ore samples."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Jengo.png",
    pronouns: { subject: 'He', object: 'him', possessive: 'his' },
    specialty: 'mining equipment'
  },
  'Jasz': {
    race: 'Twili',
    profession: 'Nocturnal Hunter',
    personality: 'Mysterious and stealthy',
    specialties: ['Night hunting', 'Stealth operations', 'Darkness navigation'],
    categories: ['Any Raw Meat'],
    flavorText: [
      "Jasz, the Nocturnal Twili Hunter, is too busy preparing his tools to notice you taking some of his spoils.",
      "The mysterious hunter is preoccupied with checking his night vision equipment, allowing you to grab some meat.",
      "Jasz's stealthy nature has him focused on maintaining his camouflage, giving you time to pocket some raw meat.",
      "The Twili is too busy adjusting to the daylight to see you taking some of his hunting trophies."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Jasz.png",
    pronouns: { subject: 'He', object: 'him', possessive: 'his' },
    specialty: 'night hunting gear'
  },
  'Lecia': {
    race: 'Sheikah',
    profession: 'Scholar',
    personality: 'Intellectual and cautious',
    specialties: ['Ancient research', 'Artifact preservation', 'Historical studies'],
    categories: ['Any Ancient Material'],
    flavorText: [
      "Lecia, the Sheikah Scholar, is preoccupied with research, allowing you to pocket some ancient materials.",
      "The intellectual scholar is too busy translating ancient texts to notice you taking some artifacts.",
      "Lecia's cautious nature has her focused on preserving delicate materials, giving you time to grab some ancient items.",
      "The Sheikah is preoccupied with cataloging historical findings, allowing you to pocket some ancient materials."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Lecia.png",
    pronouns: { subject: 'She', object: 'her', possessive: 'her' },
    specialty: 'research materials'
  },
  'Tye': {
    race: 'Kokiri',
    profession: 'Botanist',
    personality: 'Curious and nurturing',
    specialties: ['Plant research', 'Greenhouse management', 'Botanical experiments'],
    categories: ['Any Organic Material'],
    flavorText: [
      "Tye, the Kokiri Botanist, is deep in research, giving you a perfect opportunity to snatch some materials.",
      "The curious botanist is too busy examining plant growth patterns to notice you taking some organic materials.",
      "Tye's nurturing nature has her focused on tending to sick plants, allowing you to grab some materials.",
      "The Kokiri is preoccupied with greenhouse maintenance, giving you the perfect chance to pocket some organic items."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Tye.jpg",
    pronouns: { subject: 'She', object: 'her', possessive: 'her' },
    specialty: 'botanical supplies'
  },
  'Lil Tim': {
    race: 'Cucco',
    profession: 'Poultry Keeper',
    personality: 'Protective and clucky',
    specialties: ['Bird care', 'Egg production', 'Feather collection'],
    items: ['Bird Egg', 'Cucco Feather'],
    flavorText: [
      "Lil Tim the Cucco clucks loudly, but you manage to grab some eggs and feathers before being chased away!",
      "The protective poultry keeper is too busy feeding his birds to notice you taking some eggs and feathers.",
      "Lil Tim's clucky nature has him preoccupied with settling a dispute between two roosters, allowing you to grab some goods.",
      "The Cucco is too busy collecting fresh eggs to see you pocketing some of his poultry products."
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Tim.png",
    pronouns: { subject: 'He', object: 'him', possessive: 'his' },
    specialty: 'poultry supplies'
  }
};

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

// ------------------- Helper function for random selection -------------------
const getRandomElement = (arr) => {
  return arr[Math.floor(Math.random() * arr.length)];
};

// ------------------- Function to get available items from an NPC -------------------
const getNPCItems = (npcName) => {
  const npc = NPCs[npcName];
  if (!npc) return [];

  const availableItems = [];
  
  // ------------------- Special Peddler Logic -------------------
  // Peddler can have ANY item from the database stolen from him
  if (npcName === 'Peddler') {
    // Return a special marker that indicates "any item from database"
    // This will be handled specially in the steal command
    return ['ANY_ITEM_FROM_DATABASE'];
  }
  
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

  return getRandomElement(availableItems);
};

// ------------------- Function to get random flavor text when stealing from an NPC -------------------
const getStealFlavorText = (npcName) => {
  const npc = NPCs[npcName];
  if (!npc || !npc.flavorText) return null;
  
  // If flavorText is an array, randomly select one
  if (Array.isArray(npc.flavorText)) {
    return getRandomElement(npc.flavorText);
  }
  
  // Fallback for legacy single string format
  return npc.flavorText;
};

// ============================================================================
// ------------------- Quest Flavor Text Generation -------------------
// ============================================================================

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
  },
  'Zone': {
    item: [
      "Zone the Keaton Weapons Dealer's inventory is running low. He needs **{amount}x {item}** to restock his shop for eager customers.",
      "Zone's weapon crafting supplies are depleted. He urgently needs **{amount}x {item}** to maintain his business.",
      "Zone's been busy with custom orders and needs **{amount}x {item}** to fulfill all his clients' requests."
    ],
    monster: [
      "Zone spotted **{amount}x {monster} (tier: {tier})** threatening his supply routes. He needs them eliminated to keep his shop stocked.",
      "Zone's territory is being invaded by **{amount}x {monster} (tier: {tier})**. He can't gather materials safely until they're driven away.",
      "Zone discovered **{amount}x {monster} (tier: {tier})** that are blocking access to valuable ore deposits. He needs help to restore his supply chain."
    ],
    escort: [
      "Zone has a valuable weapons shipment bound for **{location}** but bandits are targeting merchant caravans. He needs protection.",
      "Zone is heading to **{location}** to negotiate new trade deals, but the journey is dangerous. He seeks an escort.",
      "Zone's been invited to **{location}** to showcase his weapons, but he's nervous about traveling with valuable merchandise."
    ],
    crafting: [
      "Zone's smithing tools are wearing out from constant use. He needs **{amount}x {item}** to maintain his workshop properly.",
      "Zone wants to expand his shop but requires **{amount}x {item}** for the construction.",
      "Zone's been developing new weapon designs but needs **{amount}x {item}** to complete his prototypes."
    ]
  },
  'Peddler': {
    item: [
      "Peddler the Hylian Auctioneer's auction inventory is running low. He needs **{amount}x {item}** to attract high bidders to his next sale.",
      "Peddler's collection of rare items is depleted. He urgently needs **{amount}x {item}** to maintain his reputation as a premier auctioneer.",
      "Peddler's been receiving special requests from wealthy clients and needs **{amount}x {item}** to fulfill their demands."
    ],
    monster: [
      "Peddler spotted **{amount}x {monster} (tier: {tier})** threatening his trade routes. He needs them eliminated to keep his business flowing.",
      "Peddler's territory is being invaded by **{amount}x {monster} (tier: {tier})**. He can't gather items safely until they're driven away.",
      "Peddler discovered **{amount}x {monster} (tier: {tier})** that are blocking access to valuable goods. He needs help to restore his supply chain."
    ],
    escort: [
      "Peddler has a priceless collection bound for **{location}** for auction, but the journey is risky. He needs careful protection.",
      "Peddler is heading to **{location}** to host a special auction, but the path is dangerous. He seeks an escort.",
      "Peddler's been invited to **{location}** to showcase his finest items, but he's nervous about traveling with such valuable cargo."
    ],
    crafting: [
      "Peddler's auction equipment is wearing out from constant use. He needs **{amount}x {item}** to maintain his professional setup.",
      "Peddler wants to build a new auction house but requires **{amount}x {item}** for the construction.",
      "Peddler's been developing new auction techniques but needs **{amount}x {item}** to complete his innovations."
    ]
  }
};

// ------------------- Generate quest flavor text using templates -------------------
const generateQuestFlavorText = (npcName, questType, requirements) => {
  // Use the new personalized flavor text system
  return getNPCQuestFlavor(npcName, questType, requirements);
};

// ------------------- Legacy function for backward compatibility -------------------
const getNPCQuestFlavorLegacy = (npcName, questType, requirements) => {
  return getNPCQuestFlavor(npcName, questType, requirements);
};

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
  // Core NPC data
  NPCs,
  
  // Utility functions
  getRandomElement,
  getNPCItems,
  stealFromNPC,
  getStealFlavorText,
  
  // Quest flavor text functions
  getNPCQuestFlavor,
  generateQuestFlavorText,
  getNPCQuestFlavorLegacy, // Legacy function for backward compatibility
  
  // Constants
  QUEST_TEMPLATES,
  NPC_QUEST_FLAVOR
};