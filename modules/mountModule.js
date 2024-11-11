// ------------------- mountModule.js -------------------
// This module contains mount-related data such as species, levels, emojis, and regional mappings.

const fs = require('fs');
const path = require('path');

// Importing the locations module to use village data
const { getAllVillages } = require('./locationsModule');

// Define the path to encounter.json
const ENCOUNTER_PATH = path.join(__dirname, '..', 'data', 'encounter.json');

const villageEmojis = {
  rudania: '<:rudania:899492917452890142>',
  inariko: '<:inariko:899493009073274920>',
  vhintl: '<:vhintl:899492879205007450>',
};

// ------------------- Ensure the encounter file exists -------------------
function ensureEncounterFileExists() {
  if (!fs.existsSync(ENCOUNTER_PATH)) {
    fs.writeFileSync(ENCOUNTER_PATH, JSON.stringify({}));
  }
}

// ------------------- Generate a unique encounter ID -------------------
function generateEncounterId() {
  return Date.now().toString();
}

// ------------------- Store encounter data in JSON -------------------
function storeEncounter(encounterId, encounterData) {
  ensureEncounterFileExists();

  try {
      const fileData = fs.readFileSync(ENCOUNTER_PATH, 'utf8');
      let encounterProgress = {};

      // Parse existing data if available
      if (fileData.trim()) {
          encounterProgress = JSON.parse(fileData);
      }

      // Ensure the users array includes both userId and characterName
      encounterProgress[encounterId] = {
          users: encounterData.users || [], // Ensure users array with userId and characterName is included
          mountType: encounterData.mountType || 'Unknown',
          rarity: encounterData.rarity || 'Regular', // Default to 'Regular'
          mountLevel: encounterData.mountLevel || '1', // Default to level 1
          mountStamina: encounterData.mountStamina || '1', // Default to 1 stamina
          environment: encounterData.environment || 'Plains', // Default to 'Plains'
          village: encounterData.village || 'Unknown',
          actions: encounterData.actions || [],
          tameStatus: encounterData.tameStatus || false // Default to false
      };

      // Write back to the file
      fs.writeFileSync(ENCOUNTER_PATH, JSON.stringify(encounterProgress, null, 2));
      console.log(`Encounter ${encounterId} updated successfully!`);
  } catch (error) {
      console.error('Error storing encounter:', error.message);
      throw new Error('Failed to store encounter data.');
  }
}


// ------------------- Retrieve encounter data by ID -------------------
function getEncounterById(encounterId) {
  ensureEncounterFileExists();
  const encounterProgress = JSON.parse(fs.readFileSync(ENCOUNTER_PATH, 'utf8'));

  return encounterProgress[encounterId] || null;
}

// ------------------- Available species and their corresponding levels -------------------
const speciesOptions = {
  Basic: ['Horse', 'Donkey', 'Ostrich', 'Mountain Goat', 'Deer'],
  Mid: ['Horse', 'Donkey', 'Bullbo', 'Water Buffalo', 'Wolfos'],
  High: ['Horse', 'Donkey', 'Dodongo', 'Moose', 'Bear'],
};

// ------------------- Mount Emojis -------------------
const mountEmojis = {
  'Horse': '🐴',
  'Donkey': '🍑',
  'Ostrich': '🦃',
  'Mountain Goat': '🐐',
  'Deer': '🦌',
  'Bullbo': '🐗',
  'Water Buffalo': '🐃',
  'Wolfos': '🐺',
  'Dodongo': '🐉',
  'Moose': '🍁',
  'Bear': '🐻',
};

// ------------------- Regional Mount and Village Mappings -------------------
const regionalMounts = {
  'Ostrich': 'Rudania',
  'Bullbo': 'Rudania',
  'Dodongo': 'Rudania',
  'Mountain Goat': 'Inariko',
  'Water Buffalo': 'Inariko',
  'Moose': 'Inariko',
  'Deer': 'Vhintl',
  'Wolfos': 'Vhintl',
  'Bear': 'Vhintl',
  'Horse': 'All Villages',
  'Donkey': 'All Villages',
};


// ------------------- Mount Thumbnails -------------------
const mountThumbnails = {
  'Horse': 'https://storage.googleapis.com/tinglebot/Mounts/Mount-Icon-Horse.png',
  'Donkey': 'https://storage.googleapis.com/tinglebot/Mounts/Mount-Icon-Donkey.png',
  'Ostrich': 'https://storage.googleapis.com/tinglebot/Mounts/Mount-Icon-Ostrich.png',
  'Mountain Goat': 'https://storage.googleapis.com/tinglebot/Mounts/Mount-Icon-MGoat.png',
  'Deer': 'https://storage.googleapis.com/tinglebot/Mounts/Mount-Icon-Deer.png',
  'Bullbo': 'https://storage.googleapis.com/tinglebot/Mounts/Mount-Icon-Bullbo.png',
  'Water Buffalo': 'https://storage.googleapis.com/tinglebot/Mounts/Mount-Icon-WBuffalo.png',
  'Wolfos': 'https://storage.googleapis.com/tinglebot/Mounts/Mount-Icon-Wolfos.png',
  'Dodongo': 'https://storage.googleapis.com/tinglebot/Mounts/Mount-Icon-Dodongo.png',
  'Moose': 'https://storage.googleapis.com/tinglebot/Mounts/Mount-Icon-Moose.png',
  'Bear': 'https://storage.googleapis.com/tinglebot/Mounts/Mount-Icon-Bear.png'
};

// Helper function to get the thumbnail URL for a mount
function getMountThumbnail(mount) {
  return mountThumbnails[mount] || '';
}

// ------------------- Helper function to randomly pick a mount and its level based on the village -------------------
function getRandomMount(village) {
  const levelWeights = [
    { level: 'Basic', weight: 60 },
    { level: 'Mid', weight: 30 },
    { level: 'High', weight: 10 },
  ];

  const totalWeight = levelWeights.reduce((sum, level) => sum + level.weight, 0);
  const random = Math.floor(Math.random() * totalWeight);

  let accumulatedWeight = 0;
  let selectedLevel = 'Basic'; // Default to Basic
  for (const { level, weight } of levelWeights) {
    accumulatedWeight += weight;
    if (random < accumulatedWeight) {
      selectedLevel = level;
      break;
    }
  }

  // Filter available mounts based on the selected level and village
  let availableMounts = speciesOptions[selectedLevel].filter(mount => regionalMounts[mount] === village || regionalMounts[mount] === 'All Villages');

  // Apply level restrictions for mounts
  if (selectedLevel === 'Basic') {
    // Filter out species that are only Mid or High level
    availableMounts = availableMounts.filter(mount => speciesOptions.Basic.includes(mount));
  }

  if (selectedLevel === 'Mid') {
    // Filter out species that are only Basic or High level
    availableMounts = availableMounts.filter(mount => speciesOptions.Mid.includes(mount));
  }

  if (selectedLevel === 'High') {
    // Filter out species that are only Basic or Mid level
    availableMounts = availableMounts.filter(mount => speciesOptions.High.includes(mount));
  }

  // If no valid mounts are available for this level, retry with a new level
  if (availableMounts.length === 0) {
    return getRandomMount(village); // Retry with a new level
  }

  const randomMount = availableMounts[Math.floor(Math.random() * availableMounts.length)];
  const mountEmoji = getMountEmoji(randomMount);

  return {
    mount: randomMount,
    level: selectedLevel,
    village: village,
    emoji: mountEmoji,
  };
}
// ------------------- Helper function to determine mount rarity -------------------
function getMountRarity() {
  const rarityRoll = Math.floor(Math.random() * 50) + 1;
  if (rarityRoll === 50) {
    return {
      isRare: true,
      message: `✨ A 50! It's a rare-traited mount! Upon closer inspection, it's a high-level mount!`,
    };
  }
  return {
    isRare: false,
    message: `A ${rarityRoll}! It's a regular mount!`,
  };
}

// ------------------- Helper function to determine mount stamina -------------------
function getMountStamina(level, isRare) {
  if (isRare) {
    return Math.floor(Math.random() * 2) + 5; // Rare mounts always have stamina between 5 and 6
  }
  if (level === 'Basic') {
    return Math.floor(Math.random() * 2) + 1; // 1-2 for basic mounts
  }
  if (level === 'Mid') {
    return Math.floor(Math.random() * 2) + 3; // 3-4 for mid-level mounts
  }
  if (level === 'High') {
    return Math.floor(Math.random() * 2) + 5; // 5-6 for high-level mounts
  }
  return 1; // Default value, should never reach here
}

// ------------------- Helper function to determine environment -------------------
function getRandomEnvironment(village) {
  const environmentRoll = Math.floor(Math.random() * 5) + 1;
  switch (environmentRoll) {
    case 1:
      return 'Plains';
    case 2:
      return 'Tall grass';
    case 3:
      return 'Mountainous';
    case 4:
      return 'Forest';
    case 5:
      return village === 'Rudania' ? 'Tall grass' : village === 'Inariko' ? 'Mountainous' : 'Forest';
    default:
      return 'Unknown';
  }
}

// ------------------- Helper function to get mount emoji -------------------
function getMountEmoji(mount) {
  return mountEmojis[mount] || '';
}

// ------------------- Helper function to randomly select a village -------------------
function getRandomVillage() {
  const villages = ['Rudania', 'Inariko', 'Vhintl'];
  return villages[Math.floor(Math.random() * villages.length)];
}

// ------------------- Helper function to get the village of a mount -------------------
function getMountVillage(mount) {
  if (mount === 'Horse' || mount === 'Donkey') {
    return getRandomVillage(); // Randomly select a village for horses and donkeys
  }
  return regionalMounts[mount] || 'Unknown';
}

// Helper function to randomly select a village
function getRandomVillage() {
  const villages = ['Rudania', 'Inariko', 'Vhintl'];
  return villages[Math.floor(Math.random() * villages.length)];
}

// Helper function to get a random level
function getRandomLevel() {
  const levels = ['Basic', 'Mid', 'High'];
  return levels[Math.floor(Math.random() * levels.length)];
}


// ------------------- Delete encounter data by ID -------------------
function deleteEncounterById(encounterId) {
  ensureEncounterFileExists();
  const encounterProgress = JSON.parse(fs.readFileSync(ENCOUNTER_PATH, 'utf8'));

  // Delete the encounter by ID
  delete encounterProgress[encounterId];

  // Write the updated data back to the file
  fs.writeFileSync(ENCOUNTER_PATH, JSON.stringify(encounterProgress, null, 2));
  console.log(`Encounter ${encounterId} deleted successfully!`);
}

// ------------------- Define Items and Effects -------------------
// Items with effects for distracting mounts and recovering stamina

const distractionItems = {
  'Tree Branch': { type: 'distraction', bonus: 1, forAllMounts: true },
  'Korok Leaf': { type: 'distraction', bonus: 1, forAllMounts: true },
  'Rock Salt': { type: 'distraction', bonus: 1, forAllMounts: true },
  'Flint': { type: 'distraction', bonus: 1, forAllMounts: true },
  'Wood': { type: 'distraction', bonus: 1, forAllMounts: true },
  'Acorn': { type: 'distraction', bonus: 1, forAllMounts: true },
  'Chickaloo Tree Nut': { type: 'distraction', bonus: 1, forAllMounts: true },
  'Hornet Larvae': { type: 'distraction', bonus: 1, forAllMounts: true },

  'Tabantha Wheat': { type: 'distraction', bonus: 2, mounts: ['Horse', 'Donkey', 'Deer', 'Ostrich', 'Mountain Goat', 'Water Buffalo', 'Bullbo', 'Moose'] },
  'Hyrule Herb': { type: 'distraction', bonus: 2, mounts: ['Horse', 'Donkey', 'Deer', 'Ostrich', 'Mountain Goat', 'Water Buffalo', 'Bullbo', 'Moose'] },
  'Cane Sugar': { type: 'distraction', bonus: 2, mounts: ['Horse', 'Donkey', 'Deer', 'Ostrich', 'Mountain Goat', 'Water Buffalo', 'Bullbo', 'Moose'] },
  'Courser Bee Honey': { type: 'distraction', bonus: 2, mounts: ['Horse', 'Donkey', 'Deer', 'Ostrich', 'Mountain Goat', 'Water Buffalo', 'Bullbo', 'Moose', 'Wolfos', 'Bear', 'Dodongo'] },

  'Apple': { type: 'distraction', bonus: 3, mounts: ['Horse', 'Donkey', 'Deer', 'Ostrich', 'Mountain Goat', 'Water Buffalo', 'Bullbo', 'Moose'] },
  'Endura Carrot': { type: 'distraction', bonus: 3, mounts: ['Horse', 'Donkey', 'Deer', 'Ostrich', 'Mountain Goat', 'Water Buffalo', 'Bullbo', 'Moose'] },
  'Swift Carrot': { type: 'distraction', bonus: 3, mounts: ['Horse', 'Donkey', 'Deer', 'Ostrich', 'Mountain Goat', 'Water Buffalo', 'Bullbo', 'Moose'] },

  'Raw Bird Drumstick': { type: 'distraction', bonus: 2, mounts: ['Wolfos', 'Bear', 'Dodongo'] },
  'Raw Bird Thigh': { type: 'distraction', bonus: 2, mounts: ['Wolfos', 'Bear', 'Dodongo'] },
  'Raw Whole Bird': { type: 'distraction', bonus: 2, mounts: ['Wolfos', 'Bear', 'Dodongo'] },

  'Raw Meat': { type: 'distraction', bonus: 3, mounts: ['Wolfos', 'Bear', 'Dodongo'] },
  'Raw Prime Meat': { type: 'distraction', bonus: 3, mounts: ['Wolfos', 'Bear', 'Dodongo'] },
  'Raw Gourmet Meat': { type: 'distraction', bonus: 3, mounts: ['Wolfos', 'Bear', 'Dodongo'] },
};

const staminaRecoveryItems = {
  'Roasted Endura Carrot': { type: 'stamina', recovery: 1 },
  'Toasty Stamella Shroom': { type: 'stamina', recovery: 1 },
  'Buttered Stambulb': { type: 'stamina', recovery: 1 },
  'Cooked Stambulb': { type: 'stamina', recovery: 1 },
  'Honeyed Fruits': { type: 'stamina', recovery: 1 },
  'Honey Candy': { type: 'stamina', recovery: 2 },
  'Akkala Buns': { type: 'stamina', recovery: 2 },
  'Honeyed Apple': { type: 'stamina', recovery: 3 },
  'Fragrant Seafood Stew': { type: 'stamina', recovery: 3 },
  'Glazed Mushrooms': { type: 'stamina', recovery: 3 },
  'Glazed Meat': { type: 'stamina', recovery: 3 },
  'Glazed Seafood': { type: 'stamina', recovery: 3 },
  'Glazed Veggies': { type: 'stamina', recovery: 4 },
  'Honey Crepe': { type: 'stamina', recovery: 6 },

  // Elixirs
  'Enduring Elixir': { type: 'stamina', recovery: 4 },
  'Energizing Elixir': { type: 'stamina', recovery: 7 },
  'Hasty Elixir': { type: 'buff', bonus: 3, action: 'rush' },
  'Sneaky Elixir': { type: 'buff', bonus: 3, action: 'sneak' },
};

// ------------------- Use Item for Distraction -------------------
function useDistractionItem(itemName, mountType) {
  const item = distractionItems[itemName];

  // If the item is for all mounts, apply the bonus
  if (item && item.forAllMounts) {
    return item.bonus;
  }

  // If the item is for specific mounts, check if it applies to the current mountType
  if (item && item.mounts && item.mounts.includes(mountType)) {
    return item.bonus;
  }

  // If no bonus is applicable, return 0
  return 0;
}

// ------------------- Use Item for Stamina Recovery -------------------
function useStaminaItem(itemName) {
  const item = staminaRecoveryItems[itemName];

  if (item && item.type === 'stamina') {
    return item.recovery; // Return the stamina recovery value
  }

  return 0; // No stamina recovery if item is invalid
}

// ------------------- Exports -------------------
module.exports = {
  speciesOptions,
  mountEmojis,
  regionalMounts,
  getRandomMount,
  getMountRarity,
  getMountStamina,
  getRandomEnvironment,
  getMountEmoji,
  getMountVillage,
  generateEncounterId,
  storeEncounter,
  getEncounterById,
  getMountThumbnail,
  getRandomVillage,  
  getRandomLevel,
  deleteEncounterById,
  useDistractionItem,
  useStaminaItem,
  distractionItems,
};
