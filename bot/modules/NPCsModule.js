const generalCategories = require('../models/GeneralItemCategories');
const ItemModel = require('../models/ItemModel');
const { connectToTinglebot } = require('../database/db');
const logger = require('../utils/logger');

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
    failText: [
      "Hank's sneezing fit suddenly stops as he spots you reaching for his herbs! 'Achoo! Hey, those are mine!'",
      "The allergic herbalist's eyes water as he catches you red-handed! 'My precious herbs! You scoundrel!'",
      "Hank's runny nose doesn't prevent him from seeing your thieving hands! 'Those are for the sick villagers!'",
      "The herbalist's allergy attack clears just in time to catch you! 'My medicinal supplies are not for stealing!'"
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
    failText: [
      "Sue's sharp Zora eyes catch your movement! 'That's my catch you're trying to steal!'",
      "The focused fisherman's attention snaps to you! 'My fish are not for thieving hands!'",
      "Sue's river-watching skills include spotting thieves! 'Those fish took me hours to catch!'",
      "The determined Zora spots your thieving attempt! 'My fishing spot, my fish, my rules!'"
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
    failText: [
      "Lukan's proud Gerudo instincts kick in! 'My precious fruit trees are not for thieves!'",
      "The orchard keeper's nurturing eyes spot you! 'Those fruits are my children's future!'",
      "Lukan's tree-tending skills include thief detection! 'My orchard, my rules, no stealing!'",
      "The proud Gerudo catches you red-handed! 'My fruit is grown with love, not for stealing!'"
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
    failText: [
      "Myti's Mogma instincts detect movement! 'My lizards are not for thieving hands!'",
      "The curious scout's exploration skills include thief detection! 'Those are my reptilian companions!'",
      "Myti's underground mapping reveals your presence! 'My cave friends are not for stealing!'",
      "The adventurous Mogma spots your attempt! 'My lizards are my scouting partners!'"
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
    failText: [
      "Cree's Rito eyes spot your movement! 'My monster parts are trophies of my hunts!'",
      "The brave hunter's vigilance extends to thieves! 'Those parts represent my victories!'",
      "Cree's sky-scanning skills detect you! 'My hunting trophies are not for stealing!'",
      "The vigilant Rito catches your attempt! 'My monster parts are proof of my bravery!'"
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
    failText: [
      "Cece's gloomy mood turns to anger! 'My carefully identified mushrooms are not for thieves!'",
      "The knowledgeable forager spots your attempt! 'Those mushrooms took me hours to identify!'",
      "Cece's fungal expertise includes thief detection! 'My spore collection is not for stealing!'",
      "The gloomy forager's eyes narrow! 'My mushroom knowledge protects my collection!'"
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Cece.png",
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
    failText: [
      "Zone's Keaton instincts detect theft! 'My weapons are not for thieving hands!'",
      "The crafty weapons dealer spots you! 'My armor took me days to craft!'",
      "Zone's protective nature extends to his merchandise! 'My shop, my rules, no stealing!'",
      "The weapons dealer's craftiness catches you! 'My equipment is for paying customers only!'"
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
    failText: [
      "Peddler's auctioneer voice booms! 'Thief! Thief in the marketplace!'",
      "The shrewd businessman spots your attempt! 'My goods are for paying customers only!'",
      "Peddler's charismatic charm turns to anger! 'My auction items are not for stealing!'",
      "The auctioneer's business sense detects theft! 'My merchandise is worth gold, not thievery!'"
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
    failText: [
      "Walton's ancient wisdom reveals your presence! 'My forest gifts are not for thieves!'",
      "The wise Korok spots your attempt! 'My acorns are the forest's future!'",
      "Walton's playful nature turns serious! 'My nuts are for forest creatures, not thieves!'",
      "The forest guardian's wisdom detects you! 'My acorns grow trees, not feed thieves!'"
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
    failText: [
      "Jengo's Goron strength stops you! 'My ore is the result of hard work!'",
      "The strong miner spots your attempt! 'My minerals took me days to extract!'",
      "Jengo's hardworking nature detects theft! 'My ore is not for thieving hands!'",
      "The Goron miner's strength catches you! 'My mine, my ore, my rules!'"
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
    failText: [
      "Jasz's stealthy nature extends to thieves! 'My hunting trophies are not for thieving hands!'",
      "The mysterious hunter's stealth skills detect you! 'Those are my nocturnal companions!'",
      "Jasz's darkness navigation reveals your presence! 'My cave friends are not for stealing!'",
      "The stealthy Twili catches your attempt! 'My hunting trophies are my scouting partners!'"
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
    failText: [
      "Lecia's Sheikah instincts detect your presence! 'My ancient artifacts are priceless!'",
      "The cautious scholar spots your attempt! 'My research materials are irreplaceable!'",
      "Lecia's intellectual focus reveals you! 'My historical findings are not for thieves!'",
      "The Sheikah's preservation skills catch you! 'My ancient materials are protected by knowledge!'"
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
    failText: [
      "Tye's Kokiri nature detects your presence! 'My organic materials are for research!'",
      "The curious botanist spots your attempt! 'My plant samples are carefully cultivated!'",
      "Tye's nurturing instincts reveal you! 'My botanical experiments are not for thieves!'",
      "The Kokiri's plant knowledge catches you! 'My greenhouse materials are protected by nature!'"
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
      "The protective Cucco is too busy feeding his fellow birds to notice you taking some eggs and feathers.",
      "Lil Tim's clucky nature has him preoccupied with settling a dispute between two roosters, allowing you to grab some goods.",
      "The Cucco is too busy collecting fresh eggs to see you pocketing some of his poultry products."
    ],
    failText: [
      "Lil Tim's Cucco instincts kick in! *BUK-BUK-BUK-BUKAAAAW!* *angry wing flapping*",
      "The protective Cucco spots you! *SCREEEEEECH!* *defensive stance* *BUK-BUK-BUK!*",
      "Lil Tim's clucky nature turns fierce! *ANGRY CLUCKING!* *threatening wing spread* *BUK-BUK-BUKAAAAW!*",
      "The Cucco's bird care skills catch you! *ALARM CLUCKS!* *protective squawking* *BUK-BUK-BUK!*"
    ],
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Tim.png",
    pronouns: { subject: 'He', object: 'him', possessive: 'his' },
    specialty: 'poultry supplies'
  }
};

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ------------------- Helper function for random selection -------------------
const getRandomElement = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) {
    logger.warn('NPC', 'getRandomElement called with invalid array:', arr);
    return null;
  }
  return arr[Math.floor(Math.random() * arr.length)];
};

// ------------------- Function to get available items from an NPC -------------------
const getNPCItems = async (npcName) => {
  logger.debug('NPC', `Fetching items for ${npcName} from database`);
  
  const npc = NPCs[npcName];
  if (!npc) {
    logger.warn('NPC', `NPC not found: ${npcName}`);
    return [];
  }

  const availableItems = [];
  
  // ------------------- Special Peddler Logic -------------------
  // Peddler can have ANY item from the database stolen from him
  if (npcName === 'Peddler') {
    // Return a special marker that indicates "any item from database"
    // This will be handled specially in the steal command
    return ['ANY_ITEM_FROM_DATABASE'];
  }
  
  // Handle NPCs with specific items (like Lil Tim)
  if (npc.items && Array.isArray(npc.items)) {
    availableItems.push(...npc.items);
    return availableItems;
  }
  
                // Handle NPCs with categories
              if (npc.categories && Array.isArray(npc.categories)) {
                for (const category of npc.categories) {
                  // Check if it's a general category first
                  if (generalCategories[category] && Array.isArray(generalCategories[category])) {
                    // Add items from the specified general category
                    availableItems.push(...generalCategories[category]);
                  } else if (category === 'Weapons' || category === 'Armor') {
        // Handle weapon/armor categories by querying the database
        try {
          // Ensure database connection
          await connectToTinglebot();
          
          let query = {};
          if (category === 'Weapons') {
            query = { 
              $and: [
                { $or: [{ category: 'Weapon' }, { categoryGear: 'Weapon' }] },
                { $nor: [{ category: 'Custom Weapon' }] }
              ]
            };
          } else if (category === 'Armor') {
            query = { $or: [{ category: 'Armor' }, { categoryGear: 'Armor' }] };
          }
          
                                const items = await ItemModel.find(query).select('itemName').lean();
                      const itemNames = items.map(item => item.itemName);
                      
                      availableItems.push(...itemNames);
        } catch (error) {
          console.error(`[NPCsModule.js]: Error querying database for ${category} items:`, error);
          console.warn(`[NPCsModule.js]: Failed to get ${category} items from database for NPC ${npcName}`);
        }
      } else {
        console.warn(`[NPCsModule.js]: Category not found or invalid: ${category} for NPC ${npcName}`);
        console.warn(`[NPCsModule.js]: Available general categories:`, Object.keys(generalCategories));
      }
    }
                }
              
              return availableItems;
};

// ------------------- Function to steal an item from an NPC -------------------
const stealFromNPC = async (npcName) => {
  const availableItems = await getNPCItems(npcName);
  if (!Array.isArray(availableItems) || availableItems.length === 0) return null;

  const randomItem = getRandomElement(availableItems);
  if (randomItem === null) {
    console.warn(`[NPCsModule.js]: Failed to get random item for NPC: ${npcName}`);
    return null;
  }

  return randomItem;
};

// ------------------- Function to get random flavor text when stealing from an NPC -------------------
const getStealFlavorText = (npcName) => {
  const npc = NPCs[npcName];
  if (!npc || !npc.flavorText) return null;
  
  // If flavorText is an array, randomly select one
  if (Array.isArray(npc.flavorText) && npc.flavorText.length > 0) {
    return getRandomElement(npc.flavorText);
  }
  
  // Fallback for legacy single string format
  return npc.flavorText;
};

// ------------------- Function to get random fail text when stealing from an NPC fails -------------------
const getStealFailText = (npcName) => {
  const npc = NPCs[npcName];
  if (!npc || !npc.failText) return null;
  
  // If failText is an array, randomly select one
  if (Array.isArray(npc.failText) && npc.failText.length > 0) {
    return getRandomElement(npc.failText);
  }
  
  // Fallback for legacy single string format
  return npc.failText;
};

// ============================================================================
// ------------------- Quest Flavor Text Generation -------------------
// ============================================================================

// ------------------- Function: getNPCQuestFlavor -------------------
// Returns a random quest flavor text for the given NPC and quest type
function getNPCQuestFlavor(npcName, questType, requirements) {
  // Validate parameters
  if (!npcName || !questType || !requirements) {
    console.warn('[NPCsModule.js]: getNPCQuestFlavor called with invalid parameters:', { npcName, questType, requirements });
    return `**${npcName || 'Unknown NPC'} needs help:** Complete this quest for the village`;
  }
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
    const specialText = getRandomElement(specialAcornTexts);
    if (!specialText) {
      console.warn('[NPCsModule.js]: Failed to get special Walton acorn text');
      return "Walton the Korok needs **50x Acorn** for a special forest ritual. Please help him gather these acorns!";
    }
    return specialText;
  }

  // ------------------- Character-guess quest (by clue type) -------------------
  if (questType === 'character-guess') {
    const clueType = requirements?.clueType || 'snippets';
    if (clueType === 'icon-zoom') {
      return `${npcName} found a really zoomed-in picture of someone's portrait but can't tell who it is! Can you figure it out?\n\n*"I only have this tiny piece of the image—who does it belong to?!"*`;
    }
    return `${npcName} has found some mysterious notes about someone, but can't remember who they belong to! Can you help identify this person?\n\n*"I found these notes scattered around, but I can't for the life of me remember who they're about! Help me figure it out!"*`;
  }

  const npcFlavor = NPC_QUEST_FLAVOR[npcName];
  if (!npcFlavor || !npcFlavor[questType]) {
    // Fallback to generic flavor text if NPC or quest type not found
    const fallbackTexts = {
      item: `**${npcName} needs supplies:** Gather **${requirements.amount || 'unknown'}x ${requirements.item || 'unknown item'}** for the village`,
      monster: `**${npcName} seeks a hunter:** Defeat **${requirements.amount || 'unknown'}x ${requirements.monster || 'unknown monster'} (tier: ${requirements.tier || 'unknown'})** threatening the area`,
      escort: `**${npcName} needs protection:** Safely escort them to **${requirements.location || 'unknown location'}**`,
      crafting: `**${npcName} needs a craftsman:** Create and deliver **${requirements.amount || 'unknown'}x ${requirements.item || 'unknown item'}**`,
      art: `**${npcName} requests artwork:** Create a picture showing **${requirements.prompt || 'something for the village'}** (${requirements.requirement || 'any style'})`,
      writing: `**${npcName} needs documentation:** Write a detailed account about **${requirements.prompt || 'village life'}** (${requirements.requirement || '500+ words'})`,
      'character-guess': `**${npcName} needs your help:** Someone's identity is a mystery—use the clues to guess who it is!`
    };
    return fallbackTexts[questType] || `**${npcName} needs help:** Complete this quest for the village`;
  }

  const flavorOptions = npcFlavor[questType];
  const selectedFlavor = getRandomElement(flavorOptions);
  
  // Check if we got a valid flavor text
  if (!selectedFlavor || typeof selectedFlavor !== 'string') {
    console.warn(`[NPCsModule.js]: Failed to get flavor text for NPC: ${npcName}, quest type: ${questType}`);
    // Return a fallback message
    return `**${npcName} needs help:** Complete this quest for the village`;
  }
  
  // Replace placeholders with actual quest requirements
  return selectedFlavor
    .replace('{amount}', requirements.amount || 'unknown')
    .replace('{item}', requirements.item || 'unknown item')
    .replace('{monster}', requirements.monster || 'unknown monster')
    .replace('{tier}', requirements.tier || 'unknown tier')
    .replace('{location}', requirements.location || 'unknown location')
    .replace('{prompt}', requirements.prompt || 'unknown prompt')
    .replace('{requirement}', requirements.requirement || 'unknown requirement');
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
    ],
    art: [
      "Hank wants to create a visual guide for identifying medicinal herbs. He needs a picture showing **{prompt}** ({requirement}) to help villagers learn about healing plants.",
      "The herbalist is compiling a book of remedies and needs artwork depicting **{prompt}** ({requirement}) to illustrate the healing process.",
      "Hank's been teaching villagers about herb identification and needs a visual aid showing **{prompt}** ({requirement}) for his lessons."
    ],
    writing: [
      "Hank is documenting his herbal knowledge and needs **{prompt}** ({requirement}) to preserve this wisdom for future generations.",
      "The herbalist wants to create a guide for treating common ailments and needs **{prompt}** ({requirement}) to help other healers.",
      "Hank's been researching new medicinal applications and needs **{prompt}** ({requirement}) for his studies."
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
    ],
    art: [
      "Sue wants to create a fishing guide for newcomers and needs artwork showing **{prompt}** ({requirement}) to help them learn the trade.",
      "The Zora fisherman is documenting river life and needs a picture depicting **{prompt}** ({requirement}) for her collection.",
      "Sue's been teaching fishing techniques and needs a visual reference showing **{prompt}** ({requirement}) for her students."
    ],
    writing: [
      "Sue is writing a guide to river fishing and needs **{prompt}** ({requirement}) to help other fishermen.",
      "The Zora fisherman wants to document the river's ecosystem and needs **{prompt}** ({requirement}) for her research.",
      "Sue's been studying fish behavior and needs **{prompt}** ({requirement}) to share her knowledge."
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
    ],
    art: [
      "Lukan wants to create a guide for fruit cultivation and needs artwork showing **{prompt}** ({requirement}) to help other farmers.",
      "The Gerudo orchard keeper is documenting her orchard's beauty and needs a picture depicting **{prompt}** ({requirement}) for her records.",
      "Lukan's been teaching farming techniques and needs a visual reference showing **{prompt}** ({requirement}) for her students."
    ],
    writing: [
      "Lukan is writing a comprehensive guide to orchard management and needs **{prompt}** ({requirement}) to help other farmers.",
      "The Gerudo orchard keeper wants to document her farming methods and needs **{prompt}** ({requirement}) for her research.",
      "Lukan's been studying fruit cultivation and needs **{prompt}** ({requirement}) to share her knowledge."
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
    ],
    art: [
      "Myti wants to create a map of underground passages and needs artwork showing **{prompt}** ({requirement}) to help other explorers.",
      "The Mogma scout is documenting cave formations and needs a picture depicting **{prompt}** ({requirement}) for his research.",
      "Myti's been teaching cave exploration and needs a visual reference showing **{prompt}** ({requirement}) for his students."
    ],
    writing: [
      "Myti is writing a guide to underground exploration and needs **{prompt}** ({requirement}) to help other scouts.",
      "The Mogma scout wants to document his cave discoveries and needs **{prompt}** ({requirement}) for his research.",
      "Myti's been studying underground ecosystems and needs **{prompt}** ({requirement}) to share his knowledge."
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
    ],
    art: [
      "Cree wants to create a monster identification guide and needs artwork showing **{prompt}** ({requirement}) to help other hunters.",
      "The Rito Monster Hunter is documenting dangerous creatures and needs a picture depicting **{prompt}** ({requirement}) for his research.",
      "Cree's been teaching hunting techniques and needs a visual reference showing **{prompt}** ({requirement}) for his students."
    ],
    writing: [
      "Cree is writing a guide to monster hunting and needs **{prompt}** ({requirement}) to help other hunters.",
      "The Rito Monster Hunter wants to document his hunting methods and needs **{prompt}** ({requirement}) for his research.",
      "Cree's been studying monster behavior and needs **{prompt}** ({requirement}) to share his knowledge."
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
    ],
    art: [
      "Cece wants to create a mushroom identification guide and needs artwork showing **{prompt}** ({requirement}) to help other foragers.",
      "The Mixed Mushroom Forager is documenting forest life and needs a picture depicting **{prompt}** ({requirement}) for her collection.",
      "Cece's been teaching foraging techniques and needs a visual reference showing **{prompt}** ({requirement}) for her students."
    ],
    writing: [
      "Cece is writing a guide to mushroom foraging and needs **{prompt}** ({requirement}) to help other foragers.",
      "The Mixed Mushroom Forager wants to document her foraging methods and needs **{prompt}** ({requirement}) for her research.",
      "Cece's been studying forest ecosystems and needs **{prompt}** ({requirement}) to share her knowledge."
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
    ],
    art: [
      "Walton wants to create a forest care guide and needs artwork showing **{prompt}** ({requirement}) to help other Koroks.",
      "The Korok is documenting forest life and needs a picture depicting **{prompt}** ({requirement}) for his collection.",
      "Walton's been teaching tree care and needs a visual reference showing **{prompt}** ({requirement}) for his students."
    ],
    writing: [
      "Walton is writing a guide to forest care and needs **{prompt}** ({requirement}) to help other Koroks.",
      "The Korok wants to document his tree care methods and needs **{prompt}** ({requirement}) for his research.",
      "Walton's been studying forest ecosystems and needs **{prompt}** ({requirement}) to share his knowledge."
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
    ],
    art: [
      "Jengo wants to create a mining safety guide and needs artwork showing **{prompt}** ({requirement}) to help other miners.",
      "The Goron Miner is documenting underground formations and needs a picture depicting **{prompt}** ({requirement}) for his research.",
      "Jengo's been teaching mining techniques and needs a visual reference showing **{prompt}** ({requirement}) for his students."
    ],
    writing: [
      "Jengo is writing a guide to safe mining practices and needs **{prompt}** ({requirement}) to help other miners.",
      "The Goron Miner wants to document his mining methods and needs **{prompt}** ({requirement}) for his research.",
      "Jengo's been studying underground geology and needs **{prompt}** ({requirement}) to share his knowledge."
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
    ],
    art: [
      "Jasz wants to create a nocturnal creature guide and needs artwork showing **{prompt}** ({requirement}) to help other night hunters.",
      "The Nocturnal Twili Hunter is documenting night creatures and needs a picture depicting **{prompt}** ({requirement}) for his research.",
      "Jasz's been teaching night hunting techniques and needs a visual reference showing **{prompt}** ({requirement}) for his students."
    ],
    writing: [
      "Jasz is writing a guide to nocturnal hunting and needs **{prompt}** ({requirement}) to help other night hunters.",
      "The Nocturnal Twili Hunter wants to document his hunting methods and needs **{prompt}** ({requirement}) for his research.",
      "Jasz's been studying nocturnal wildlife and needs **{prompt}** ({requirement}) to share his knowledge."
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
    ],
    art: [
      "Lecia wants to create an archaeological guide and needs artwork showing **{prompt}** ({requirement}) to help other scholars.",
      "The Sheikah Scholar is documenting ancient artifacts and needs a picture depicting **{prompt}** ({requirement}) for her research.",
      "Lecia's been teaching ancient history and needs a visual reference showing **{prompt}** ({requirement}) for her students."
    ],
    writing: [
      "Lecia is writing a guide to archaeological research and needs **{prompt}** ({requirement}) to help other scholars.",
      "The Sheikah Scholar wants to document her research methods and needs **{prompt}** ({requirement}) for her studies.",
      "Lecia's been studying ancient civilizations and needs **{prompt}** ({requirement}) to share her knowledge."
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
    ],
    art: [
      "Tye wants to create a botanical guide and needs artwork showing **{prompt}** ({requirement}) to help other botanists.",
      "The Kokiri Botanist is documenting plant life and needs a picture depicting **{prompt}** ({requirement}) for her research.",
      "Tye's been teaching plant cultivation and needs a visual reference showing **{prompt}** ({requirement}) for her students."
    ],
    writing: [
      "Tye is writing a guide to botanical research and needs **{prompt}** ({requirement}) to help other botanists.",
      "The Kokiri Botanist wants to document her research methods and needs **{prompt}** ({requirement}) for her studies.",
      "Tye's been studying plant ecosystems and needs **{prompt}** ({requirement}) to share her knowledge."
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
    ],
    art: [
      "Lil Tim wants to create a bird care guide and needs artwork showing **{prompt}** ({requirement}) to help other bird keepers.",
      "The Cucco is documenting bird life and needs a picture depicting **{prompt}** ({requirement}) for his collection.",
      "Lil Tim's been teaching bird care and needs a visual reference showing **{prompt}** ({requirement}) for his students."
    ],
    writing: [
      "Lil Tim is writing a guide to bird care and needs **{prompt}** ({requirement}) to help other bird keepers.",
      "The Cucco wants to document his bird care methods and needs **{prompt}** ({requirement}) for his research.",
      "Lil Tim's been studying bird behavior and needs **{prompt}** ({requirement}) to share his knowledge."
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
    ],
    art: [
      "Zone wants to create a weapon catalog and needs artwork showing **{prompt}** ({requirement}) to help customers choose weapons.",
      "The Keaton Weapons Dealer is documenting weapon designs and needs a picture depicting **{prompt}** ({requirement}) for his catalog.",
      "Zone's been teaching weapon crafting and needs a visual reference showing **{prompt}** ({requirement}) for his students."
    ],
    writing: [
      "Zone is writing a guide to weapon crafting and needs **{prompt}** ({requirement}) to help other smiths.",
      "The Keaton Weapons Dealer wants to document his crafting methods and needs **{prompt}** ({requirement}) for his research.",
      "Zone's been studying weapon design and needs **{prompt}** ({requirement}) to share his knowledge."
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
    ],
    art: [
      "Peddler wants to create an auction catalog and needs artwork showing **{prompt}** ({requirement}) to attract bidders.",
      "The Hylian Auctioneer is documenting valuable items and needs a picture depicting **{prompt}** ({requirement}) for his catalog.",
      "Peddler's been teaching auction techniques and needs a visual reference showing **{prompt}** ({requirement}) for his students."
    ],
    writing: [
      "Peddler is writing a guide to auctioneering and needs **{prompt}** ({requirement}) to help other auctioneers.",
      "The Hylian Auctioneer wants to document his auction methods and needs **{prompt}** ({requirement}) for his research.",
      "Peddler's been studying market trends and needs **{prompt}** ({requirement}) to share his knowledge."
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
  NPCs,
  getNPCItems,
  stealFromNPC,
  getStealFlavorText,
  getStealFailText,
  getNPCQuestFlavor,
  getRandomElement
};