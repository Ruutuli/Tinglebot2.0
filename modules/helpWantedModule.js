// ============================================================================
// ------------------- Help Wanted Quest Generation Module -------------------
// Logic for generating daily Help Wanted quests per village
// ============================================================================

const mongoose = require('mongoose');
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
const QUEST_TYPES = ['item', 'monster', 'escort', 'crafting', 'art', 'writing'];

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
  'crafting': '🔨',
  'art': '🎨',
  'writing': '📝'
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
  crafting: { minAmount: 1, maxAmount: 3 },
  art: { minAmount: 1, maxAmount: 1 },
  writing: { minAmount: 1, maxAmount: 1 }
};

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

// Utility function to convert cron time to hour
const cronToHour = (cronTime) => {
  const parts = cronTime.split(' ');
  return parseInt(parts[1]);
};

// Utility function to check if two hours are at least minHours apart
const isHoursApart = (hour1, hour2, minHours = 3) => {
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
// Fetches specific items for item quests from a curated list
async function getItemQuestPool() {
  try {
    // Specific list of item names that can be requested for item quests
    const allowedItemNames = [
      'Acorn',
      'Amber',
      'Amber Relic',
      'Amethyst',
      'Ancient Arowana',
      'Ancient Arrow',
      'Ancient Battle Axe',
      'Ancient Bladesaw',
      'Ancient Bow',
      'Ancient Core',
      'Ancient Flower',
      'Ancient Gear',
      'Ancient Screw',
      'Ancient Shaft',
      'Ancient Shield',
      'Ancient Short Sword',
      'Ancient Spear',
      'Ancient Spring',
      'Apple',
      'Armoranth',
      'Armored Carp',
      'Armored Porgy',
      'Arrow',
      'Aurora Stone',
      'Bird Egg',
      'Bird Feather',
      'Bladed Rhino Beetle',
      'Blessed Butterfly',
      'Blight Geodes',
      'Blin Bling',
      'Blue Bird Feather',
      'Blue Nightshade',
      'Boko Bat',
      'Boko Bow',
      'Boko Club',
      'Boko Shield',
      'Boko Spear',
      'Bokoblin Arm',
      'Bokoblin Fang',
      'Bokoblin Guts',
      'Bokoblin Horn',
      'Bright-Eyed Crab',
      'Brightbloom Seed',
      'Brightcap',
      'Cane Sugar',
      'Carmine Pearl',
      'Carrumpkin',
      'Chickaloo Tree Nut',
      'Chill Stone',
      'Chillfin Trout',
      'Chillshroom',
      'Chuchu Egg',
      'Chuchu Jelly',
      'Cold Darner',
      'Cool Safflina',
      'Cotton',
      'Courser Bee Honey',
      'Crystal Skull',
      'Cucco Feathers',
      'Dazzlefruit',
      'Deep Firefly',
      'Deku Hornet',
      'Demon Carver',
      'Demon Fossil',
      'Diamond',
      'Dinraal\'s Claw',
      'Dinraal\'s Scale',
      'Dragon Bone Boko Bow',
      'Dragonbone Boko Bat',
      'Dragonbone Boko Club',
      'Dragonbone Boko Shield',
      'Dragonbone Boko Spear',
      'Dragonbone Moblin Club',
      'Dragonbone Moblin Spear',
      'Duplex Bow',
      'Dusk Relic',
      'Eldin Ore',
      'Eldin Roller',
      'Electric Darner',
      'Electric Keese Wing',
      'Electric Safflina',
      'Emerald',
      'Endura Carrot',
      'Endura Shroom',
      'Energetic Rhino Beetle',
      'Enhanced Lizal Spear',
      'Fabled Butterfly',
      'Fairy',
      'Fairy Dust',
      'Faron Grasshopper',
      'Farosh\'s Claw',
      'Farosh\'s Scale',
      'Fire Fruit',
      'Fire Keese Wing',
      'Fire Rod',
      'Fireproof Lizard',
      'Fleet-Lotus Seeds',
      'Flint',
      'Forked Lizal Spear',
      'Fortified Pumpkin',
      'Freezard Water',
      'Fresh Milk',
      'Gerudo Dragonfly',
      'Giant Ancient Core',
      'Gibdo Bandage',
      'Gibdo Bone',
      'Gibdo Guts',
      'Gibdo Wing',
      'Glowing Cave Fish',
      'Goat Butter',
      'Goddess Plume',
      'Gold Dust',
      'Gold Ore',
      'Golden Apple',
      'Golden Insect',
      'Golden Skull',
      'Goron Ore',
      'Guardian Shield',
      'Guardian Spear',
      'Guardian Sword',
      'Hearty Bass',
      'Hearty Blueshell Snail',
      'Hearty Durian',
      'Hearty Lizard',
      'Hearty Radish',
      'Hearty Salmon',
      'Hearty Truffle',
      'Hightail Lizard',
      'Hinox Guts',
      'Hinox Toenail',
      'Hinox Tooth',
      'Hornet Larvae',
      'Horriblin Claw',
      'Horriblin Guts',
      'Horriblin Horn',
      'Hot-Footed Frog',
      'Hydromelon',
      'Hylian Rice',
      'Hylian Shroom',
      'Hylian Tomato',
      'Hyrule Bass',
      'Hyrule Herb',
      'Ice Fruit',
      'Ice Keese Wing',
      'Ice Rod',
      'Ice Rose',
      'Icy Lizalfos Tail',
      'Insect Parts',
      'Ironshell Crab',
      'Ironshroom',
      'Jade Relic',
      'Job Voucher',
      'Keese Eyeball',
      'Keese Wing',
      'Kelp',
      'Korok Leaf',
      'Lanayru Ant',
      'Lava Drop',
      'Leather',
      'Lightning Rod',
      'Like Like Stone',
      'Lizal Boomerang',
      'Lizal Bow',
      'Lizal Forked Boomerang',
      'Lizal Shield',
      'Lizal Spear',
      'Lizal Tri-Boomerang',
      'Lizalfos Arm',
      'Lizalfos Horn',
      'Lizalfos Tail',
      'Lizalfos Talon',
      'Lizard Tail',
      'Luminous Stone',
      'Lynel Bow',
      'Lynel Crusher',
      'Lynel Guts',
      'Lynel Hoof',
      'Lynel Horn',
      'Lynel Shield',
      'Lynel Spear',
      'Lynel Sword',
      'Mighty Bananas',
      'Mighty Carp',
      'Mighty Lynel Bow',
      'Mighty Lynel Crusher',
      'Mighty Lynel Shield',
      'Mighty Lynel Spear',
      'Mighty Lynel Sword',
      'Mighty Porgy',
      'Mighty Thistle',
      'Moblin Arm',
      'Moblin Club',
      'Moblin Fang',
      'Moblin Guts',
      'Moblin Horn',
      'Moblin Spear',
      'Mock Fairy',
      'Molduga Fin',
      'Molduga Guts',
      'Monster Claw',
      'Monster Extract',
      'Monster Fur',
      'Monster Horn',
      'Muddle Bud',
      'Naydra\'s Claw',
      'Naydra\'s Scale',
      'Octo Balloon',
      'Octorok Eyeball',
      'Octorok Tentacle',
      'Old Shirt',
      'Opal',
      'Ornamental Skull',
      'Palm Fruit',
      'Papyrus',
      'Poe Soul',
      'Pretty Plume',
      'Puffshroom',
      'Rainbow Coral',
      'Raw Bird Drumstick',
      'Raw Bird Thigh',
      'Raw Gourmet Meat',
      'Raw Meat',
      'Raw Prime Meat',
      'Raw Whole Bird',
      'Razorclaw Crab',
      'Razorshroom',
      'Red Chuchu Jelly',
      'Red Lizalfos Tail',
      'Reinforced Lizal Shield',
      'Restless Cricket',
      'Rock Salt',
      'Ruby',
      'Rugged Horn',
      'Rugged Rhino Beetle',
      'Rushroom',
      'Sand Cicada',
      'Sandy Ribbon',
      'Sanke Carp',
      'Sapphire',
      'Savage Lynel Bow',
      'Savage Lynel Crusher',
      'Savage Lynel Shield',
      'Savage Lynel Spear',
      'Savage Lynel Sword',
      'Serpent Fangs',
      'Shard of Dinraal\'s Fang',
      'Shard of Dinraal\'s Horn',
      'Shard of Farosh\'s Fang',
      'Shard of Farosh\'s Horn',
      'Shard of Naydra\'s Fang',
      'Shard of Naydra\'s Horn',
      'Shock Fruit',
      'Silent Princess',
      'Silent Shroom',
      'Silver Dust',
      'Silver Ore',
      'Sizzlefin Trout',
      'Sky Stag Beetle',
      'Skyloft Mantis',
      'Skyshroom',
      'Smotherwing Butterfly',
      'Sneaky River Snail',
      'Spicy Pepper',
      'Spider Silk',
      'Spider\'s Eye',
      'Spiked Boko Bat',
      'Spiked Boko Bow',
      'Spiked Boko Club',
      'Spiked Boko Shield',
      'Spiked Boko Spear',
      'Spiked Moblin Club',
      'Spiked Moblin Spear',
      'Splash Fruit',
      'Spring-Loaded Hammer',
      'Stal Skull',
      'Stambulb',
      'Stamella Shroom',
      'Staminoka Bass',
      'Star Fragment',
      'Starry Firefly',
      'Stealthfin Trout',
      'Steel Lizal Bow',
      'Steel Lizal Shield',
      'Sticky Frog',
      'Sticky Lizard',
      'Strengthened Lizal Bow',
      'Summerwing Butterfly',
      'Sundelion',
      'Sunset Firefly',
      'Sunshroom',
      'Sweet Shroom',
      'Swift Carrot',
      'Swift Violet',
      'Tabantha Wheat',
      'Thornberry',
      'Thunderwing Butterfly',
      'Tireless Frog',
      'Topaz',
      'Tree Branch',
      'Vicious Sickle',
      'Volcanic Ladybug',
      'Voltfin Trout',
      'Voltfruit',
      'Warm Darner',
      'Warm Safflina',
      'Well-Worn Trousers',
      'White Chuchu Jelly',
      'Wild berry',
      'Windcleaver',
      'Winterwing Butterfly',
      'Wood',
      'Woodland Rhino Beetle',
      'Wool',
      'Yellow Chuchu Jelly',
      'Yellow Lizalfos Tail'
    ];

    // Search for items by name
    console.log('[HelpWanted] Searching for items by name');
    
    let items = [];
    try {
      items = await Item.find({
        itemName: { $in: allowedItemNames }
      }, 'itemName');
      console.log(`[HelpWanted] Found ${items.length} items by name out of ${allowedItemNames.length} requested items`);
    } catch (error) {
      console.error('[HelpWanted] Error searching for items by name:', error);
      items = [];
    }
    
    if (items.length === 0) {
      throw new Error('No allowed items found for item quests by name');
    }
    
    console.log(`[HelpWanted] Found ${items.length} items by name`);
    
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
// Fetches specific craftable items for crafting quests with weighted selection
async function getCraftingQuestPool() {
  try {
    // Specific list of items that can be requested for crafting quests
    const allowedCraftingItems = [
      'Akkala Buns', 'Amber Earrings', 'Apple Pie', 'Archaic Warm Greaves', 'Baked Apple',
      'Baked Fortified Pumpkin', 'Baked Palm Fruit', 'Blackened Crab', 'Blueshell Escargot',
      'Boat Oar', 'Bokoblin Mask', 'Bomb Arrow', 'Boomerang', 'Buttered Stambulb',
      'Campfire Egg', 'Cap of the Wild', 'Carrot Cake', 'Carrot Stew', 'Charred Pepper',
      'Cheesy Baked Fish', 'Cheesy Tomato', 'Clam Chowder', 'Climber\'s Bandanna',
      'Climbing Boots', 'Climbing Gear', 'Cobble Crusher', 'Cooked Stambulb',
      'Copious Fish Skewers', 'Copious Fried Wild Greens', 'Copious Meat Skewers',
      'Copious Mushroom Skewers', 'Copious Simmered Fruit', 'Crab Omelet With Rice',
      'Crab Risotto', 'Crab Stir-fry', 'Cream Of Vegetable Soup', 'Creamy Heart Soup',
      'Creamy Meat Soup', 'Curry Rice', 'Deep-Fried Bird Roast', 'Deep-Fried Drumstick',
      'Deep-Fried Thigh', 'Desert Voe Headband', 'Desert Voe Spaulder', 'Desert Voe Trousers',
      'Double Axe', 'Drillshaft', 'Egg Pudding', 'Egg Tart', 'Emblazoned Shield',
      'Falcon Bow', 'Farmer\'s Pitchfork', 'Farming Hoe', 'Feathered Edge', 'Feathered Spear',
      'Fire Arrow', 'Fish And Mushroom Skewer', 'Fish Pie', 'Fish Skewer', 'Fisherman\'s Shield',
      'Fishing Harpoon', 'Forest Dweller\'s Bow', 'Forest Dweller\'s Shield',
      'Forest Dweller\'s Spear', 'Forest Dweller\'s Sword', 'Fragrant Mushroom Sauté',
      'Fried Bananas', 'Fried Egg And Rice', 'Fried Wild Greens', 'Fruit And Mushroom Mix',
      'Fruit Cake', 'Fruit Pie', 'Gerudo Sirwal', 'Gerudo Top', 'Gerudo Veil',
      'Giant Boomerang', 'Glazed Meat', 'Glazed Mushrooms', 'Glazed Seafood',
      'Glazed Veggies', 'Goron Spice', 'Gourmet Meat And Rice Bowl', 'Gourmet Meat And Seafood Fry',
      'Hard-boiled Egg', 'Hateno Cheese', 'Honey Candy', 'Honeyed Apple', 'Honeyed Fruits',
      'Hot Buttered Apple', 'Hunter\'s Shield', 'Hylian Hood', 'Hylian Trousers',
      'Hylian Tunic', 'Ice Arrow', 'Iron Sledgehammer', 'Island Lobster Shirt',
      'Kite Shield', 'Knight\'s Bow', 'Knight\'s Broadsword', 'Knight\'s Halberd',
      'Knight\'s Shield', 'Korok Mask', 'Lizalfos Mask', 'Lynel Mask', 'Mabe Soufflé',
      'Meat & Mushroom Skewer', 'Meat And Rice Bowl', 'Meat And Seafood Fry',
      'Meat Pie', 'Meat Skewer', 'Meat Stew', 'Meat-stuffed Pumpkins', 'Meaty Rice Balls',
      'Melty Cheesy Bread', 'Moblin Mask', 'Mushroom Omelet', 'Mushroom Rice Balls',
      'Mushroom Risotto', 'Mushroom Skewer', 'Noble Pursuit', 'Nut Cake', 'Oil Jar',
      'Omelet', 'Opal Earrings', 'Pepper Seafood', 'Pepper Steak', 'Phrenic Bow',
      'Porgy Meunière', 'Pot Lid', 'Poultry Curry', 'Poultry Pilaf', 'Prime Meat And Rice Bowl',
      'Prime Meat And Seafood Fry', 'Prime Meat Stew', 'Prime Poultry Pilaf',
      'Prime Spiced Meat Skewer', 'Pumpkin Pie', 'Pumpkin Stew', 'Radiant Mask',
      'Radiant Shirt', 'Radiant Tights', 'Roasted Acorn', 'Roasted Armoranth',
      'Roasted Bass', 'Roasted Bird Drumstick', 'Roasted Bird Thigh', 'Roasted Carp',
      'Roasted Endura Carrot', 'Roasted Hearty Bass', 'Roasted Hearty Durian',
      'Roasted Hearty Salmon', 'Roasted Hydromelon', 'Roasted Lotus Seeds',
      'Roasted Mighty Bananas', 'Roasted Mighty Thistle', 'Roasted Porgy',
      'Roasted Radish', 'Roasted Swift Carrot', 'Roasted Tree Nut', 'Roasted Trout',
      'Roasted Voltfruit', 'Roasted Whole Bird', 'Roasted Wildberry', 'Rock-hard Food',
      'Rubber Armor', 'Rubber Helm', 'Rubber Tights', 'Rusty Broadsword',
      'Rusty Claymore', 'Rusty Halberd', 'Rusty Shield', 'Salmon Meunière',
      'Salt-grilled Crab', 'Salt-grilled Fish', 'Salt-grilled Gourmet Meat',
      'Salt-grilled Greens', 'Salt-grilled Meat', 'Salt-grilled Mushrooms',
      'Salt-grilled Prime Meat', 'Sand Boots', 'Sapphire Circlet', 'Sautéed Nuts',
      'Sea-Breeze Boomerang', 'Seafood Fried Rice', 'Seafood Meunière',
      'Seafood Rice Balls', 'Seafood Skewer', 'Seared Gourmet Steak', 'Seared Prime Steak',
      'Seared Steak', 'Serpentine Spear', 'Shield of the Mind\'s Eye', 'Shock Arrow',
      'Silver Bow', 'Silver Shield', 'Silverscale Spear', 'Simmered Fruit',
      'Simmered Tomato', 'Sneaky River Escargot', 'Snowquill Headdress',
      'Snowquill Trousers', 'Snowquill Tunic', 'Soldier\'s Bow', 'Soldier\'s Broadsword',
      'Soldier\'s Claymore', 'Soldier\'s Shield', 'Soldier\'s Spear', 'Soup Ladle',
      'Spiced Meat Skewer', 'Spicy Sautéed Peppers', 'Stealth Chest Guard',
      'Stealth Mask', 'Stealth Tights', 'Steamed Fish', 'Steamed Fruit',
      'Steamed Meat', 'Stone Smasher', 'Swallow Bow', 'Sword', 'Tabantha Bake',
      'Throwing Spear', 'Tingle\'s Hood', 'Tingle\'s Shirt', 'Tingle\'s Tights',
      'Toasted Hearty Truffle', 'Toasty Chillshroom', 'Toasty Endura Shroom',
      'Toasty Hylian Shroom', 'Toasty Ironshroom', 'Toasty Razorshroom',
      'Toasty Rushroom', 'Toasty Silent Shroom', 'Toasty Skyshroom',
      'Toasty Stamella Shroom', 'Toasty Sunshroom', 'Toasty Zapshroom',
      'Tomato Mushroom Stew', 'Tomato Seafood Soup', 'Tomato Stew', 'Topaz Earrings',
      'Torch', 'Traveler\'s Bow', 'Traveler\'s Claymore', 'Traveler\'s Shield',
      'Traveler\'s Spear', 'Traveler\'s Sword', 'Trousers of the Wild',
      'Tunic of the Wild', 'Vegetable Risotto', 'Veggie Cream Soup',
      'Veggie Rice Balls', 'Warm Milk', 'Wheat Bread', 'Woodcutter\'s Axe',
      'Wooden Bow', 'Wooden Mop', 'Wooden Shield', 'Zora Armor', 'Zora Greaves',
      'Zora Helm', 'Zora Spear', 'Zora Sword'
    ];

    // Fetch the allowed items with their crafting data
    const items = await Item.find({
      itemName: { $in: allowedCraftingItems },
      crafting: true
    }, 'itemName staminaToCraft category');

    if (items.length === 0) {
      throw new Error('No allowed crafting items found for crafting quests');
    }

    // Create weighted pool based on stamina and category
    const weightedPool = [];
    
    for (const item of items) {
      let weight = 1;
      
      // Prioritize items with 3 or less stamina to craft
      if (item.staminaToCraft && item.staminaToCraft <= 3) {
        weight = 3;
      }
      
      // Prioritize items with "recipe" category
      if (item.category && item.category.includes('recipe')) {
        weight = weight * 2;
      }
      
      // Add item to pool with its weight (multiple entries for higher weight)
      for (let i = 0; i < weight; i++) {
        weightedPool.push(item);
      }
    }

    return weightedPool;
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

// ------------------- Function: getArtQuestPool -------------------
// Gets art prompts for art quests - practical NPC requests for 24-hour completion
function getArtQuestPool() {
  return [
    // Real estate and housing requests
    { prompt: 'a house for sale in {village} to see what\'s available', requirement: 'Sketch', context: 'housing', needsVillage: true },
    { prompt: 'a room layout in {village} for someone looking for a new place to live', requirement: 'Line art', context: 'housing', needsVillage: true },
    { prompt: 'the {village} marketplace to help people know where to shop', requirement: 'Sketch', context: 'location', needsVillage: true },
    { prompt: 'a map of {village} to help people navigate the area', requirement: 'Line art', context: 'location', needsVillage: true },
    
    // Mount and transportation requests
    { prompt: 'a horse for sale to help someone find a new mount', requirement: 'Sketch', context: 'mount' },
    { prompt: 'a stable in {village} to help people find where to board their horses', requirement: 'Line art', context: 'mount', needsVillage: true },
    { prompt: 'a good riding path near {village} for travelers planning a journey', requirement: 'Sketch', context: 'travel', needsVillage: true },
    
    // Wildlife and hunting requests
    { prompt: 'a fish native to {village} waters to help people know what to catch', requirement: 'Line art', context: 'wildlife', needsVillage: true },
    { prompt: 'the easiest monster to hunt near {village} for new hunters', requirement: 'Sketch', context: 'hunting', needsVillage: true },
    { prompt: 'a good hunting spot near {village} to help people find game', requirement: 'Line art', context: 'hunting', needsVillage: true },
    { prompt: 'a dangerous creature near {village} to help people avoid it', requirement: 'Sketch', context: 'wildlife', needsVillage: true },
    
    // Job and profession requests
    { prompt: 'a good mining spot near {village} to help people find work', requirement: 'Line art', context: 'job', needsVillage: true },
    { prompt: 'a fishing spot in {village} to help people find where to fish', requirement: 'Sketch', context: 'job', needsVillage: true },
    { prompt: 'a good foraging area near {village} to help people collect herbs', requirement: 'Line art', context: 'job', needsVillage: true },
    { prompt: 'a crafting workshop in {village} to help people find tools', requirement: 'Sketch', context: 'job', needsVillage: true },
    
    // Safety and navigation requests
    { prompt: 'a safe camping spot near {village} to help travelers rest', requirement: 'Line art', context: 'safety', needsVillage: true },
    { prompt: 'landmarks around {village} to help people navigate the area', requirement: 'Sketch', context: 'navigation', needsVillage: true },
    { prompt: 'a dangerous area near {village} to help people avoid it', requirement: 'Line art', context: 'safety', needsVillage: true },
    
    // Simple character and item requests
    { prompt: 'your character to help people remember what you look like', requirement: 'Sketch', context: 'character' },
    { prompt: 'a weapon you recommend to help people choose what to buy', requirement: 'Line art', context: 'equipment' },
    { prompt: 'a useful tool to help people with their work', requirement: 'Sketch', context: 'equipment' }
  ];
}

// ------------------- Function: getWritingQuestPool -------------------
// Gets writing prompts for writing quests with 500-word minimum
function getWritingQuestPool() {
  return [
    // Wildlife and nature reports
    { prompt: 'a detailed wildlife report about the animals and creatures native to {village}', context: 'wildlife', needsVillage: true },
    { prompt: 'a comprehensive guide to the fish species found in {village} waters', context: 'fishing', needsVillage: true },
    { prompt: 'a detailed report on the dangerous creatures near {village} and how to avoid them', context: 'safety', needsVillage: true },
    { prompt: 'a comprehensive guide to the plant life and herbs around {village}', context: 'foraging', needsVillage: true },
    
    // Job and profession guides
    { prompt: 'a detailed guide on how hunters find their hunting grounds near {village}', context: 'hunting', needsVillage: true },
    { prompt: 'a comprehensive mining guide for the area around {village}', context: 'mining', needsVillage: true },
    { prompt: 'a detailed guide to the best fishing techniques for {village} waters', context: 'fishing', needsVillage: true },
    { prompt: 'a comprehensive guide to foraging safely around {village}', context: 'foraging', needsVillage: true },
    { prompt: 'a detailed guide to crafting techniques and where to find materials near {village}', context: 'crafting', needsVillage: true },
    
    // Travel and navigation guides
    { prompt: 'a detailed travel guide from {village} to other villages', context: 'travel', needsVillage: true },
    { prompt: 'a comprehensive guide to safe camping spots and travel routes near {village}', context: 'travel', needsVillage: true },
    { prompt: 'a detailed guide to the landmarks and navigation around {village}', context: 'navigation', needsVillage: true },
    
    // Village information and services
    { prompt: 'a detailed guide to the shops and services in {village}', context: 'village', needsVillage: true },
    { prompt: 'a comprehensive guide to the housing options and neighborhoods in {village}', context: 'housing', needsVillage: true },
    { prompt: 'a detailed guide to the local customs and traditions in {village}', context: 'culture', needsVillage: true },
    
    // Equipment and gear guides
    { prompt: 'a detailed guide to choosing the right weapon for hunting near {village}', context: 'equipment', needsVillage: true },
    { prompt: 'a comprehensive guide to the best tools and gear for mining in the {village} area', context: 'equipment', needsVillage: true },
    { prompt: 'a detailed guide to mount care and stable services in {village}', context: 'mounts', needsVillage: true },
    
    // Adventure and experience reports
    { prompt: 'a detailed account of your most successful hunting trip near {village}', context: 'adventure', needsVillage: true },
    { prompt: 'a comprehensive report on a dangerous encounter you survived near {village}', context: 'adventure', needsVillage: true },
    { prompt: 'a detailed guide to exploring safely around {village}', context: 'exploration', needsVillage: true }
  ];
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
    const artPool = getArtQuestPool();
    const writingPool = getWritingQuestPool();
    
    return { itemPool, monsterPool, craftingPool, escortPool, villageShopPool, artPool, writingPool };
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
      
      // Check stamina to craft and adjust amount accordingly
      let amount;
      if (item.staminaToCraft && item.staminaToCraft > 4) {
        // Items with more than 4 stamina to craft only ask for 1
        amount = 1;
      } else {
        // Items with 4 or less stamina use normal amount range
        const { minAmount, maxAmount } = QUEST_PARAMS.crafting;
        amount = Math.floor(Math.random() * (maxAmount - minAmount + 1)) + minAmount;
      }
      
      return { item: item.itemName, amount };
    }
    
    case 'art': {
      const artPrompt = getRandomElement(pools.artPool);
      if (!artPrompt) {
        throw new Error(`No art prompts available for ${village} art quest`);
      }
      
      let finalPrompt = artPrompt.prompt;
      
      // Replace {village} placeholder with actual village name
      if (artPrompt.needsVillage) {
        finalPrompt = finalPrompt.replace('{village}', village);
      }
      
      return {
        prompt: finalPrompt,
        requirement: artPrompt.requirement,
        context: artPrompt.context,
        amount: 1
      };
    }
    
    case 'writing': {
      const writingPrompt = getRandomElement(pools.writingPool);
      if (!writingPrompt) {
        throw new Error(`No writing prompts available for ${village} writing quest`);
      }
      
      let finalPrompt = writingPrompt.prompt;
      
      // Replace {village} placeholder with actual village name
      if (writingPrompt.needsVillage) {
        finalPrompt = finalPrompt.replace('{village}', village);
      }
      
      return { 
        prompt: finalPrompt, 
        requirement: '500+ words',
        context: writingPrompt.context,
        amount: 1 
      };
    }
    
    default:
      throw new Error(`Unknown quest type: ${type}`);
  }
}

// ------------------- Function: generateQuestForVillage -------------------
// Generates a random quest object for a given village and date
async function generateQuestForVillage(village, date, pools, availableNPCs = null, isAfterNoon = false) {
  // Validate pools
  const requiredPools = ['itemPool', 'monsterPool', 'craftingPool', 'escortPool', 'villageShopPool', 'artPool', 'writingPool'];
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
  // Peddler ONLY asks for item quests from village shops with 1 item amount
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
        amount: 1 // Only ask for 1 item from shop
      },
      completed: false,
      completedBy: null
    };
  }
  
  // ------------------- Normal Quest Generation -------------------
  // Exclude art and writing quests if it's after 12pm EST
  let availableTypes = [...QUEST_TYPES];
  if (isAfterNoon) {
    availableTypes = availableTypes.filter(type => type !== 'art' && type !== 'writing');
    console.log(`[helpWantedModule.js]: ⏰ After 12pm EST - Excluding art and writing quests. Available types: ${availableTypes.join(', ')}`);
  }
  
  const type = getRandomElement(availableTypes);
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
    
    // Check if it's after 12pm EST - if so, don't generate art/writing quests
    const estHour = parseInt(now.toLocaleString('en-US', {timeZone: 'America/New_York', hour: 'numeric', hour12: false}));
    const isAfterNoon = estHour >= 12;
    
    console.log(`[helpWantedModule.js]: 🕐 Time check - Current EST hour: ${estHour}, isAfterNoon: ${isAfterNoon}`);
    
    if (isAfterNoon) {
      console.log(`[helpWantedModule.js]: ⏰ After 12pm EST (${estHour}:00) - Art and Writing quests will not be generated to ensure adequate completion time`);
    } else {
      console.log(`[helpWantedModule.js]: ✅ Before 12pm EST (${estHour}:00) - All quest types including art and writing are available`);
    }

    // Clean up existing documents with null questId
    await HelpWantedQuest.deleteMany({ questId: null });
    
    // Clean up any art or writing quests that were generated after 12pm EST
    if (isAfterNoon) {
      const deletedArtWriting = await HelpWantedQuest.deleteMany({ 
        date: date, 
        type: { $in: ['art', 'writing'] } 
      });
      if (deletedArtWriting.deletedCount > 0) {
        console.log(`[helpWantedModule.js]: 🧹 Cleaned up ${deletedArtWriting.deletedCount} art/writing quest(s) that were generated after 12pm EST`);
      }
    }

    const pools = await getAllQuestPools();

    // Create a shared pool of available NPCs to ensure uniqueness across all quests
    const allNPCs = Object.keys(NPCs);
    if (allNPCs.length < VILLAGES.length) {
      throw new Error(`Not enough NPCs available (${allNPCs.length}) for ${VILLAGES.length} villages. Need at least ${VILLAGES.length} unique NPCs.`);
    }
    const availableNPCs = shuffleArray([...allNPCs]); // Shuffle for randomness
    
    // Randomize village order instead of always having Rudania first
    const shuffledVillages = shuffleArray([...VILLAGES]);
    
    // Generate quest posting times with variable buffer (3-6 hours) between each
    const selectedTimes = selectTimesWithVariableBuffer(FIXED_CRON_TIMES, VILLAGES.length);
    const quests = [];
    
    // Generate quests sequentially to ensure unique NPCs
    for (let i = 0; i < shuffledVillages.length; i++) {
      const village = shuffledVillages[i];
      const quest = await generateQuestForVillage(village, date, pools, availableNPCs, isAfterNoon);
      
      // Remove the used NPC from the available pool
      const npcIndex = availableNPCs.indexOf(quest.npcName);
      if (npcIndex !== -1) {
        availableNPCs.splice(npcIndex, 1);
      }
      
      // Assign a posting time with variable buffer from the selected times
      quest.scheduledPostTime = selectedTimes[i];
      const hour = cronToHour(quest.scheduledPostTime);
      console.log(`[HelpWanted] Generated ${quest.type} quest for ${village} with NPC ${quest.npcName} at posting time: ${formatHour(hour)} (${quest.scheduledPostTime})`);
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
// ------------------- Time Selection with Variable Buffer -------------------
// ============================================================================

// ------------------- Function: selectTimesWithVariableBuffer -------------------
// Selects times from FIXED_CRON_TIMES ensuring variable buffer (3-6 hours) between each
function selectTimesWithVariableBuffer(availableTimes, count) {
  // Convert cron times to time slots with hour information
  const timeSlots = availableTimes.map(cronTime => ({
    cron: cronTime,
    hour: cronToHour(cronTime)
  }));

  const selected = [];
  const shuffled = shuffleArray([...timeSlots]); // Start with random order

  for (const timeSlot of shuffled) {
    // Check if this time slot is compatible with all already selected times
    // Use a variable buffer between 3-6 hours for more randomness
    const isCompatible = selected.every(selectedTime => {
      const minBuffer = 3; // Minimum 3 hours between quests
      const maxBuffer = 6; // Maximum 6 hours between quests
      const buffer = Math.floor(Math.random() * (maxBuffer - minBuffer + 1)) + minBuffer;
      return isHoursApart(timeSlot.hour, selectedTime.hour, buffer);
    });

    if (isCompatible) {
      selected.push(timeSlot);
      if (selected.length === count) {
        break;
      }
    }
  }

  // If we couldn't find enough compatible times, fall back to fixed 3-hour buffer
  if (selected.length < count) {
    console.log(`[HelpWanted] Warning: Could only find ${selected.length} times with variable buffer, falling back to 3-hour minimum`);
    selected.length = 0; // Reset and try again with fixed buffer
    
    for (const timeSlot of shuffled) {
      const isCompatible = selected.every(selectedTime => 
        isHoursApart(timeSlot.hour, selectedTime.hour, 3)
      );

      if (isCompatible) {
        selected.push(timeSlot);
        if (selected.length === count) {
          break;
        }
      }
    }
  }

  // Sort selected times by hour for better scheduling
  selected.sort((a, b) => a.hour - b.hour);
  
  // Log the selected times in a readable format
  const timeDisplay = selected.map(t => formatHour(t.hour)).join(', ');
  console.log(`[HelpWanted] Selected times with variable buffer (3-6 hours): ${timeDisplay}`);
  
  return selected.map(timeSlot => timeSlot.cron);
}

// ============================================================================
// ------------------- Legacy Time Selection with Buffer (kept for compatibility) -------------------
// ============================================================================

// ------------------- Function: selectTimesWithBuffer -------------------
// Selects times from FIXED_CRON_TIMES ensuring at least 6-hour buffer between each (legacy function)
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
    crafting: '• **Crafting Quest:** Create the requested item with your own hands. Craft the required item yourself, then use </helpwanted complete:1402779337270497370>.',
    art: '• **Art Quest:** Create the requested artwork and submit it using </submit art:1402779337270497370> with this quest ID. **Must be submitted before midnight (EST) today.** Once approved by a moderator, the quest will be automatically completed.',
    writing: '• **Writing Quest:** Write the requested content and submit it using </submit writing:1402779337270497370> with this quest ID. **Must be submitted before midnight (EST) today.** Once approved by a moderator, the quest will be automatically completed.'
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
                     '• **All quests expire at midnight (EST) today!**\n' +
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
                     '• **All quests expire at midnight (EST) today!**\n' +
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
// ------------------- Auto-Quest Completion -------------------
// ============================================================================

// ------------------- Function: checkAndCompleteQuestFromSubmission -------------------
// Checks if a submission is for a Help Wanted quest and completes it if approved
async function checkAndCompleteQuestFromSubmission(submissionData, client) {
  try {
    // Check if this submission has a quest ID
    if (!submissionData.questEvent || submissionData.questEvent === 'N/A') {
      return; // Not a quest submission
    }

    const questId = submissionData.questEvent;
    console.log(`[helpWantedModule]: Checking quest completion for submission with quest ID: ${questId}`);

    // Find the quest
    const quest = await HelpWantedQuest.findOne({ questId });
    if (!quest) {
      console.log(`[helpWantedModule]: Quest ${questId} not found`);
      return;
    }

    // Check if quest is already completed
    if (quest.completed) {
      console.log(`[helpWantedModule]: Quest ${questId} is already completed`);
      return;
    }

    // Check if quest is expired
    if (isQuestExpired(quest)) {
      console.log(`[helpWantedModule]: Quest ${questId} is expired`);
      return;
    }

    // Check if submission type matches quest type
    const submissionType = submissionData.category; // 'art' or 'writing'
    if (submissionType !== quest.type) {
      console.log(`[helpWantedModule]: Submission type ${submissionType} doesn't match quest type ${quest.type}`);
      return;
    }

    // Check if the submission has been approved (has checkmark reaction)
    // Skip this check if called from mod approval system (indicated by approvedSubmissionData flag)
    if (submissionData.messageUrl && !submissionData.approvedSubmissionData) {
      const isApproved = await checkSubmissionApproval(submissionData.messageUrl, client);
      if (!isApproved) {
        console.log(`[helpWantedModule]: Submission for quest ${questId} is not approved yet`);
        return;
      }
    }

    // Complete the quest
    await completeQuestFromSubmission(quest, submissionData, client);
    
  } catch (error) {
    console.error(`[helpWantedModule]: Error checking quest completion from submission:`, error);
  }
}

// ------------------- Function: checkSubmissionApproval -------------------
// Checks if a submission message has been approved with a checkmark reaction
async function checkSubmissionApproval(messageUrl, client) {
  try {
    // Parse the message URL to get channel and message IDs
    const urlMatch = messageUrl.match(/\/channels\/(\d+)\/(\d+)\/(\d+)/);
    if (!urlMatch) {
      return false;
    }

    const [, guildId, channelId, messageId] = urlMatch;
    
    // Fetch the message
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      return false;
    }

    const message = await channel.messages.fetch(messageId);
    if (!message) {
      return false;
    }

    // Check for checkmark emoji reactions from Tinglebot
    const checkmarkReactions = message.reactions.cache.filter(reaction => {
      const isCheckmark = reaction.emoji.name === '✅' || 
                         reaction.emoji.name === '☑️' || 
                         reaction.emoji.name === '✔️' ||
                         reaction.emoji.id === '854499720797618207'; // Custom checkmark emoji ID if exists
      
      return isCheckmark && reaction.users.cache.has(client.user.id);
    });

    return checkmarkReactions.size > 0;
  } catch (error) {
    console.error(`[helpWantedModule]: Error checking submission approval:`, error);
    return false;
  }
}

// ------------------- Function: completeQuestFromSubmission -------------------
// Completes a quest when a submission is approved
async function completeQuestFromSubmission(quest, submissionData, client) {
  try {
    // Mark quest as completed
    quest.completed = true;
    quest.completedBy = {
      userId: submissionData.userId,
      characterId: null, // We don't have character info in submission data
      timestamp: new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})
    };
    await quest.save();

    // Update user tracking
    const User = require('../models/UserModel');
    const user = await User.findOne({ discordId: submissionData.userId });
    if (user) {
      await updateUserTracking(user, quest, submissionData.userId);
    }

    // Update quest embed
    await updateQuestEmbed(client, quest, quest.completedBy);

    // Send completion message to the original town hall channel
    await sendQuestCompletionMessage(quest, submissionData, client);

    console.log(`[helpWantedModule]: ✅ Quest ${quest.questId} completed via submission approval`);
    
  } catch (error) {
    console.error(`[helpWantedModule]: Error completing quest from submission:`, error);
  }
}

// ------------------- Function: updateUserTracking -------------------
// Updates user tracking for quest completion (copied from helpWanted.js)
async function updateUserTracking(user, quest, userId) {
  const now = new Date();
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

// ------------------- Function: sendQuestCompletionMessage -------------------
// Sends a quest completion message to the original town hall channel
async function sendQuestCompletionMessage(quest, submissionData, client) {
  try {
    // Get the town hall channel for the quest's village
    const townHallChannels = {
      'Rudania': '629028823001858060', // RUDANIA_TOWNHALL
      'Inariko': '629028490179510308', // INARIKO_TOWNHALL
      'Vhintl': '629030018965700668'   // VHINTL_TOWNHALL
    };

    const channelId = townHallChannels[quest.village];
    if (!channelId) {
      console.log(`[helpWantedModule]: No town hall channel found for village ${quest.village}`);
      return;
    }

    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      console.log(`[helpWantedModule]: Could not fetch town hall channel ${channelId}`);
      return;
    }

    // Create completion embed
    const { EmbedBuilder } = require('discord.js');
    const completionEmbed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle('✅ Quest Completed!')
      .setDescription(`**${submissionData.username}** has successfully completed the Help Wanted quest for **${quest.village}**!`)
      .addFields(
        { name: '🎯 Quest Type', value: quest.type.charAt(0).toUpperCase() + quest.type.slice(1), inline: true },
        { name: '🏘️ Village', value: quest.village, inline: true },
        { name: '👤 Requested By', value: quest.npcName || 'Unknown NPC', inline: true },
        { name: '👤 Completed By', value: `<@${submissionData.userId}>`, inline: true },
        { name: '🆔 Quest ID', value: quest.questId, inline: true }
      )
      .setFooter({ text: new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}) })
      .setTimestamp();

    // Add quest-specific details
    let questDetails = '';
    switch (quest.type) {
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
      completionEmbed.addFields({ name: '📋 Quest Details', value: questDetails, inline: false });
    }

    // Add submission link
    if (submissionData.messageUrl) {
      completionEmbed.addFields({ 
        name: '🔗 View Submission', 
        value: `[Click Here](${submissionData.messageUrl})`, 
        inline: false 
      });
    }

    // Add border image
    completionEmbed.setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

    await channel.send({ embeds: [completionEmbed] });
    console.log(`[helpWantedModule]: ✅ Quest completion message sent to ${quest.village} town hall`);
    
  } catch (error) {
    console.error(`[helpWantedModule]: Error sending quest completion message:`, error);
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
  getArtQuestPool,
  getWritingQuestPool,
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
  isQuestExpired,
  checkAndCompleteQuestFromSubmission
}; 