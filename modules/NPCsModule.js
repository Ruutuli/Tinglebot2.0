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
    flavorText: "Hank, the Hylian Herbalist, mutters something about allergies as you pocket some herbs.",
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
    flavorText: "Sue, the Zora Fisherman, doesn't seem to notice as you slip a fish into your bag, her eyes focused on the river.",
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
    flavorText: "Lukan, the Gerudo Orchard Keeper, is preoccupied with the trees, allowing you to sneak away with some fruit.",
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
    flavorText: "Myti, the Mogma Scout, is too focused on the landscape to notice you picking up one of their lizards.",
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
    flavorText: "Cree, the Rito Monster Hunter, is distracted, leaving you a chance to grab some monster parts.",
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
    flavorText: "Cece the Mixed Heritage Mushroom Forager gloomily watches you gather mushrooms, muttering about proper identification techniques.",
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
    flavorText: "Zone the Keaton Weapons Dealer growls as you make off with some of his precious armor and weapons!",
    icon: "https://storage.googleapis.com/tinglebot/NPCs/NPC%20Zone.png",
    pronouns: { subject: 'He', object: 'him', possessive: 'his' },
    specialty: 'smithing materials'
  },
  'Peddler': {
    race: 'Hylian',
    profession: 'Auctioneer',
    personality: 'Charismatic and shrewd',
    categories: ['Any Plant', 'Any Mushroom', 'Armor', 'Weapons'],
    flavorText: "Peddler the Hylian Auctioneer shouts after you as you grab items from his collection, his auctioneer's voice echoing through the marketplace!",
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
    flavorText: "Walton, the Korok, is too busy gathering acorns to notice you taking one.",
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
    flavorText: "Jengo, the Goron Miner, is too busy digging to see you snagging some ore.",
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
    flavorText: "Jasz, the Nocturnal Twili Hunter, is too busy preparing his tools to notice you taking some of his spoils.",
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
    flavorText: "Lecia, the Sheikah Scholar, is preoccupied with research, allowing you to pocket some ancient materials.",
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
    flavorText: "Tye, the Kokiri Botanist, is deep in research, giving you a perfect opportunity to snatch some materials.",
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
    flavorText: "Lil Tim the Cucco clucks loudly, but you manage to grab some eggs and feathers before being chased away!",
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

// ============================================================================
// ------------------- Quest Flavor Text Generation -------------------
// ============================================================================

// ------------------- Generate quest flavor text using templates -------------------
const generateQuestFlavorText = (npcName, questType, requirements) => {
  const npc = NPCs[npcName];
  if (!npc) {
    return `**${npcName}** needs help with a ${questType} quest.`;
  }

  // Special case for Walton's acorn quest
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

  // Get template for quest type
  const templates = QUEST_TEMPLATES[questType];
  if (!templates) {
    return `**${npcName}** needs help with a ${questType} quest.`;
  }

  // Select random template and fill in placeholders
  const template = getRandomElement(templates);
  return template
    .replace(/{npcName}/g, npcName)
    .replace(/{race}/g, npc.race)
    .replace(/{profession}/g, npc.profession)
    .replace(/{pronoun}/g, npc.pronouns.subject)
    .replace(/{pronoun2}/g, npc.pronouns.possessive)
    .replace(/{specialty}/g, npc.specialty)
    .replace(/{amount}/g, requirements.amount || '?')
    .replace(/{item}/g, requirements.item || '?')
    .replace(/{monster}/g, requirements.monster || '?')
    .replace(/{tier}/g, requirements.tier || '?')
    .replace(/{location}/g, requirements.location || '?');
};

// ------------------- Legacy function for backward compatibility -------------------
const getNPCQuestFlavor = (npcName, questType, requirements) => {
  return generateQuestFlavorText(npcName, questType, requirements);
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
  
  // Quest flavor text functions
  generateQuestFlavorText,
  getNPCQuestFlavor, // Legacy function for backward compatibility
  
  // Constants
  QUEST_TEMPLATES
};