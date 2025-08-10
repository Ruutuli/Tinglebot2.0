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
  
// add a Keaton 
// ------------------- Function to get available items from an NPC -------------------
const getNPCItems = (npcName) => {
  const npc = NPCs[npcName]; // Get the NPC details
  if (!npc) {
    throw new Error(`NPC ${npcName} does not exist or has no assigned categories.`);
  }

  // Special case for NPCs like Lil Tim that drop specific items
  if (npc.items) {
    return npc.items;
  }

  const npcCategories = npc.categories;
  let availableItems = [];
  npcCategories.forEach(category => {
    const itemsInCategory = generalCategories[category];
    if (itemsInCategory) {
      availableItems = [...availableItems, ...itemsInCategory]; // Add all items from the category
    }
  });

  return availableItems;
};

// ------------------- Function to steal an item from an NPC -------------------
const stealFromNPC = (npcName) => {
  const items = getNPCItems(npcName);
  if (items.length === 0) {
    throw new Error(`No items available to steal from ${npcName}`);
  }

  // Randomly select an item to steal
  const randomIndex = Math.floor(Math.random() * items.length);
  const selectedItem = items[randomIndex];
  
  // Get the flavor text for the NPC
  const flavorText = NPCs[npcName]?.flavorText || "You stole something!";
  
  return { item: selectedItem, flavorText: flavorText };
};

// ------------------- Export functions -------------------
module.exports = {
  getNPCItems,
  stealFromNPC,
  NPCs,
};
