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

// ------------------- Customization Costs -------------------
const customizationCosts = {
  Horse: {
      coatMane: 100,
      coatPattern: 20,
      snoutPattern: 20,
      eyeColor: 20,
      muzzleColor: 10,
      ankleHairColor: 10,
      hoofColor: 10,
      ankleHairStyle: 5,
  },
  Donkey: {
      coatColor: 60,
      coatStyle: 20,
      coatPattern: 20,
  },
  Ostrich: {
      commonColors: 100,
  },
  Bullbo: {
      commonColors: 100,
  },
  Dodongo: {
      commonColors: 100,
  },
  MountainGoat: {
      commonColors: 100,
  },
  WaterBuffalo: {
      commonColors: 100,
  },
  Moose: {
      commonColors: 100,
  },
  Deer: {
      commonColors: 100,
  },
  Wolfos: {
      commonColors: 100,
  },
  Bear: {
      commonColors: 100,
  },
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

      // Ensure the encounter object includes all necessary fields
      encounterProgress[encounterId] = {
          users: encounterData.users || [], // Ensure users array with userId and characterName is included
          mountType: encounterData.mountType || 'Unknown',
          rarity: encounterData.rarity || 'Regular', // Default to 'Regular'
          mountLevel: encounterData.mountLevel || '1', // Default to level 1
          mountStamina: encounterData.mountStamina || '1', // Default to 1 stamina
          environment: encounterData.environment || 'Plains', // Default to 'Plains'
          village: encounterData.village || 'Unknown',
          actions: encounterData.actions || [],
          tameStatus: encounterData.tameStatus || false, // Default to false
          traits: encounterData.traits || {}, // Include traits to store customization
          totalSpent: encounterData.totalSpent || 0, // Ensure totalSpent is included and defaults to 0
      };

      // Write back to the file
      fs.writeFileSync(ENCOUNTER_PATH, JSON.stringify(encounterProgress, null, 2));
  } catch (error) {
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

const boostingItems = {
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
function useBoostingItems(itemName) {
  const item = boostingItems[itemName];

  if (item && item.type === 'stamina') { // edit this later 
    return item.recovery; // Return the stamina recovery value
  }

  return 0; // No stamina recovery if item is invalid
}

// ------------------- Horse Trait Options -------------------
const horseTraits = {
  coatMane: {
    roll: [1, 24],
    traits: {
      1: 'Black Coat + Black Mane',
      2: 'Black Coat + White Mane',
      3: 'Black Coat + Grey Mane',
      4: 'Grey Coat + Black Mane',
      5: 'Grey Coat + White Mane',
      6: 'Grey Coat + Grey Mane',
      7: 'Red Coat + Black Mane',
      8: 'Red Coat + White Mane',
      9: 'Red Coat + Red Mane',
      10: 'Brown Coat + Black Mane',
      11: 'Brown Coat + White Mane',
      12: 'Brown Coat + Brown Mane',
      13: 'Light Brown Coat + Black Mane',
      14: 'Light Brown Coat + White Mane',
      15: 'Light Brown Coat + Brown Mane',
      16: 'Teal Coat + Black Mane',
      17: 'Teal Coat + White Mane',
      18: 'Light Blue Coat + White Mane',
      19: 'Light Blue Coat + Blue Mane',
      20: 'Light Blue Coat + Blonde Mane',
      21: 'Pink Coat + Blonde Mane',
      22: 'Pink Coat + White Mane',
      23: 'Buckskin Coat + Black Mane',
      24: 'Buckskin Coat + White Mane',
    },
  },
  coatPattern: {
    roll: [1, 5],
    traits: {
      1: 'Solid',
      2: 'Half and Half',
      3: 'Some Spots',
      4: 'Spotted Butt',
      5: 'Full Spots (Dapple)',
    },
  },
  snoutPattern: {
    roll: [1, 5],
    traits: {
      1: 'Plain',
      2: 'Star',
      3: 'Stripe',
      4: 'Blaze',
      5: 'Snip',
    },
  },
  eyeColor: {
    roll: [1, 5],
    traits: {
      1: 'Brown',
      2: 'Blue',
      3: 'Green',
      4: 'Grey',
      5: 'Amber',
    },
  },
  muzzleColor: {
    roll: [1, 4],
    traits: {
      1: 'Pink and White',
      2: 'Coat Color, Darker',
      3: 'Black',
      4: 'White',
    },
  },
  hoofColor: {
    roll: [1, 4],
    traits: {
      1: 'Light Brown',
      2: 'Brown',
      3: 'Grey',
      4: 'Black',
    },
  },
  ankleHairColor: {
    roll: [1, 4],
    traits: {
      1: 'White',
      2: 'Black',
      3: 'Coat Color, Darker',
      4: 'Coat Color, Lighter',
    },
  },
  ankleHairStyle: {
    roll: [1, 2],
    traits: {
      1: 'Short',
      2: 'Fluffy',
    },
  },
};

// ------------------- Donkey Trait Options -------------------
const donkeyTraits = {
  coatColor: {
    roll: [1, 7],
    traits: {
      1: 'Light Brown',
      2: 'Brown',
      3: 'Grey',
      4: 'Red',
      5: 'White and Grey',
      6: 'Pink',
      7: 'Teal',
    },
  },
  coatStyle: {
    roll: [1, 2],
    traits: {
      1: 'Regular',
      2: 'Fluffy',
    },
  },
  rareColors: {
    roll: [1, 4], // Only used for rare donkeys
    traits: {
      1: 'Full White, Regular or Fluffy',
      2: 'Black, Regular or Fluffy',
      3: 'Piebald, Regular or Fluffy',
      4: 'Golden, Regular or Fluffy',
    },
  },
  coatPattern: {
    roll: [1, 3],
    traits: {
      1: 'Solid',
      2: 'Spotted',
      3: 'Dun Stripe',
    },
  },
};

// ------------------- Ostrich Trait Options -------------------
const ostrichTraits = {
  commonColors: {
    roll: [1, 6],
    traits: {
      1: 'Red and Yellow',
      2: 'Black and Tan',
      3: 'Brown',
      4: 'Brown and Blue',
      5: 'Black and Pink',
      6: 'Full Black',
    },
  },
  rareColors: {
    roll: [1, 5], // Only used for rare ostriches
    traits: {
      1: 'Yellow',
      2: 'Cassowary',
      3: 'Full White',
      4: 'Brown with Spots',
      5: 'Golden (Metallic)',
    },
  },
};

// ------------------- Bullbo Trait Options -------------------
const bullboTraits = {
  commonColors: {
    roll: [1, 6],
    traits: {
      1: 'Brown',
      2: 'Tan',
      3: 'Grey',
      4: 'Black',
      5: 'Red',
      6: 'Olive',
    },
  },
  rareColors: {
    roll: [1, 5], // Only used for rare bullbos
    traits: {
      1: 'Full White',
      2: 'Red and Black (Ganon)',
      3: 'Light Blue',
      4: 'Piebald',
      5: 'Golden',
    },
  },
};

// ------------------- Dodongo Trait Options -------------------
const dodongoTraits = {
  commonColors: {
    roll: [1, 10],
    traits: {
      1: 'Green',
      2: 'Brown',
      3: 'Yellow',
      4: 'Grey',
      5: 'Blue',
      6: 'Black with Red Tail',
      7: 'Grey and Green',
      8: 'Blue and Yellow',
      9: 'Black with Yellow Mouth',
      10: 'Yellow and Red',
    },
  },
  rareColors: {
    roll: [1, 6], // Only used for rare dodongos
    traits: {
      1: 'Full Red',
      2: 'Full White',
      3: 'Full Black',
      4: 'Full Pink (Kodongo)',
      5: 'Grey and Red (Dongorongo)',
      6: 'Golden',
    },
  },
};

// ------------------- Mountain Goat Trait Options -------------------
const mountainGoatTraits = {
  commonColors: {
    roll: [1, 14],
    traits: {
      1: 'White and Light Brown',
      2: 'Teal',
      3: 'White with Spots',
      4: 'Teal with Spots',
      5: 'Tricolor',
      6: 'Brown',
      7: 'Brown and Black',
      8: 'Grey',
      9: 'Grey with Spots',
      10: 'Brown with Spots',
      11: 'Light Brown',
      12: 'Light Brown with Spots',
      13: 'Black',
      14: 'Black and White',
    },
  },
  rareColors: {
    roll: [1, 6], // Only used for rare mountain goats
    traits: {
      1: 'Ordon Goat (Blue)',
      2: 'Ordon Goat (White)',
      3: 'Ordon Goat (Golden)',
      4: 'Markhor Goat (White)',
      5: 'Markhor Goat (Black)',
      6: 'Full White',
    },
  },
};

// ------------------- Water Buffalo Trait Options -------------------
const waterBuffaloTraits = {
  commonColors: {
    roll: [1, 6],
    traits: {
      1: 'Brown Male',
      2: 'Brown Female',
      3: 'Grey Male',
      4: 'Grey Female',
      5: 'Light Brown Male',
      6: 'Light Brown Female',
    },
  },
  rareColors: {
    roll: [1, 5], // Only used for rare water buffalo
    traits: {
      1: 'Piebald (M or F)',
      2: 'Full White (M or F)',
      3: 'Black (M or F)',
      4: 'Teal (M or F)',
      5: 'Golden (M or F)',
    },
  },
};

// ------------------- Deer Trait Options -------------------
const deerTraits = {
  commonColors: {
    roll: [1, 6],
    traits: {
      1: 'Brown Male',
      2: 'Brown Female',
      3: 'Red Male',
      4: 'Red Female',
      5: 'Brown with Spots Male',
      6: 'Brown with Spots Female',
    },
  },
  rareColors: {
    roll: [1, 5], // Only used for rare deer
    traits: {
      1: 'Full White (M or F)',
      2: 'White with Spots (M or F)',
      3: 'Black (M or F)',
      4: 'Piebald (M or F)',
      5: 'Golden (M or F)',
    },
  },
};

// ------------------- Wolfos Trait Options -------------------
const wolfosTraits = {
  commonColors: {
    roll: [1, 6],
    traits: {
      1: 'Grey',
      2: 'White',
      3: 'Blue',
      4: 'Black',
      5: 'Brown',
      6: 'Red',
    },
  },
  rareColors: {
    roll: [1, 4], // Only used for rare wolfos
    traits: {
      1: 'Golden',
      2: 'Olive',
      3: 'Wosu (White with Darker Stripes)',
      4: 'Frost (White with Icey Aura)',
    },
  },
};

// ------------------- Bear Trait Options -------------------
const bearTraits = {
  commonColors: {
    roll: [1, 6],
    traits: {
      1: 'Full Black',
      2: 'Brown with Honey Colored Snout',
      3: 'Full Brown',
      4: 'Black with Tan Snout',
      5: 'Blonde',
      6: 'Cinnamon',
    },
  },
  rareColors: {
    roll: [1, 5], // Only used for rare bears
    traits: {
      1: 'Light Blue',
      2: 'Full White',
      3: 'Piebald',
      4: 'Grey (Glacier)',
      5: 'Golden',
    },
  },

};
// ------------------- Moose Trait Options -------------------
const mooseTraits = {
  commonColors: {
      roll: [1, 100], // Updated to reflect 100 total options
      traits: {
          1: 'Brown Male',
          2: 'Brown Female',
          3: 'Grey Male',
          4: 'Grey Female',
          5: 'Light Brown Male',
          6: 'Light Brown Female',
      },
  },
  rareColors: {
      roll: [1, 5], // Only used for rare moose
      traits: {
          1: 'Piebald (M or F)',
          2: 'Full White (M or F)',
          3: 'Black (M or F)',
          4: 'Teal (M or F)',
          5: 'Golden (M or F)',
      },
  },
};


// ------------------- Generate Horse Traits -------------------
function generateHorseTraits(isRare = false) {
  const traits = {};

  if (horseTraits.coatMane) {
    const rollCoatMane = rollDie(horseTraits.coatMane.roll[1]);
    console.log(`Horse coat mane roll: ${rollCoatMane}`);
    traits.coatMane = horseTraits.coatMane.traits[rollCoatMane] || 'Undefined Coat Mane';
  }

  if (horseTraits.coatPattern) {
    const rollCoatPattern = rollDie(horseTraits.coatPattern.roll[1]);
    console.log(`Horse coat pattern roll: ${rollCoatPattern}`);
    traits.coatPattern = horseTraits.coatPattern.traits[rollCoatPattern] || 'Undefined Coat Pattern';
  }

  if (horseTraits.snoutPattern) {
    const rollSnoutPattern = rollDie(horseTraits.snoutPattern.roll[1]);
    console.log(`Horse snout pattern roll: ${rollSnoutPattern}`);
    traits.snoutPattern = horseTraits.snoutPattern.traits[rollSnoutPattern] || 'Undefined Snout Pattern';
  }

  if (horseTraits.eyeColor) {
    const rollEyeColor = rollDie(horseTraits.eyeColor.roll[1]);
    console.log(`Horse eye color roll: ${rollEyeColor}`);
    traits.eyeColor = horseTraits.eyeColor.traits[rollEyeColor] || 'Undefined Eye Color';
  }

  if (horseTraits.muzzleColor) {
    const rollMuzzleColor = rollDie(horseTraits.muzzleColor.roll[1]);
    console.log(`Horse muzzle color roll: ${rollMuzzleColor}`);
    traits.muzzleColor = horseTraits.muzzleColor.traits[rollMuzzleColor] || 'Undefined Muzzle Color';
  }

  if (horseTraits.hoofColor) {
    const rollHoofColor = rollDie(horseTraits.hoofColor.roll[1]);
    console.log(`Horse hoof color roll: ${rollHoofColor}`);
    traits.hoofColor = horseTraits.hoofColor.traits[rollHoofColor] || 'Undefined Hoof Color';
  }

  if (horseTraits.ankleHairColor) {
    const rollAnkleHairColor = rollDie(horseTraits.ankleHairColor.roll[1]);
    console.log(`Horse ankle hair color roll: ${rollAnkleHairColor}`);
    traits.ankleHairColor = horseTraits.ankleHairColor.traits[rollAnkleHairColor] || 'Undefined Ankle Hair Color';
  }

  if (horseTraits.ankleHairStyle) {
    const rollAnkleHairStyle = rollDie(horseTraits.ankleHairStyle.roll[1]);
    console.log(`Horse ankle hair style roll: ${rollAnkleHairStyle}`);
    traits.ankleHairStyle = horseTraits.ankleHairStyle.traits[rollAnkleHairStyle] || 'Undefined Ankle Hair Style';
  }

  return traits;
}

// ------------------- Generate Donkey Traits -------------------
function generateDonkeyTraits(isRare = false) {
  const traits = {};

  if (donkeyTraits.coatColor) {
    const rollCoatColor = rollDie(donkeyTraits.coatColor.roll[1]);
    console.log(`Donkey coat color roll: ${rollCoatColor}`);
    traits.coatColor = donkeyTraits.coatColor.traits[rollCoatColor] || 'Undefined Coat Color';
  }

  if (donkeyTraits.coatStyle) {
    const rollCoatStyle = rollDie(donkeyTraits.coatStyle.roll[1]);
    console.log(`Donkey coat style roll: ${rollCoatStyle}`);
    traits.coatStyle = donkeyTraits.coatStyle.traits[rollCoatStyle] || 'Undefined Coat Style';
  }

  if (donkeyTraits.coatPattern) {
    const rollCoatPattern = rollDie(donkeyTraits.coatPattern.roll[1]);
    console.log(`Donkey coat pattern roll: ${rollCoatPattern}`);
    traits.coatPattern = donkeyTraits.coatPattern.traits[rollCoatPattern] || 'Undefined Coat Pattern';
  }

  if (isRare && donkeyTraits.rareColors) {
    const rollRareColor = rollDie(donkeyTraits.rareColors.roll[1]);
    console.log(`Donkey rare color roll: ${rollRareColor}`);
    traits.rareColor = donkeyTraits.rareColors.traits[rollRareColor] || 'Undefined Rare Color';
  }

  return traits;
}

// ------------------- Generate Ostrich Traits -------------------
function generateOstrichTraits(isRare = false) {
  const traits = {};

  if (ostrichTraits.commonColors) {
    const rollCommonColor = rollDie(ostrichTraits.commonColors.roll[1]);
    console.log(`Ostrich common color roll: ${rollCommonColor}`);
    traits.commonColors = ostrichTraits.commonColors.traits[rollCommonColor] || 'Undefined Common Color';
  }

  if (isRare && ostrichTraits.rareColors) {
    const rollRareColor = rollDie(ostrichTraits.rareColors.roll[1]);
    console.log(`Ostrich rare color roll: ${rollRareColor}`);
    traits.rareColor = ostrichTraits.rareColors.traits[rollRareColor] || 'Undefined Rare Color';
  }

  return traits;
}

// ------------------- Generate Bullbo Traits -------------------
function generateBullboTraits(isRare = false) {
  const traits = {};

  if (bullboTraits.commonColors) {
    const rollCommonColor = rollDie(bullboTraits.commonColors.roll[1]);
    console.log(`Bullbo common color roll: ${rollCommonColor}`);
    traits.commonColors = bullboTraits.commonColors.traits[rollCommonColor] || 'Undefined Common Color';
  }

  if (isRare && bullboTraits.rareColors) {
    const rollRareColor = rollDie(bullboTraits.rareColors.roll[1]);
    console.log(`Bullbo rare color roll: ${rollRareColor}`);
    traits.rareColor = bullboTraits.rareColors.traits[rollRareColor] || 'Undefined Rare Color';
  }

  return traits;
}

// ------------------- Generate Dodongo Traits -------------------
function generateDodongoTraits(isRare = false) {
  const traits = {};

  if (dodongoTraits.commonColors) {
    const rollCommonColor = rollDie(dodongoTraits.commonColors.roll[1]);
    console.log(`Dodongo common color roll: ${rollCommonColor}`);
    traits.commonColors = dodongoTraits.commonColors.traits[rollCommonColor] || 'Undefined Common Color';
  }

  if (isRare && dodongoTraits.rareColors) {
    const rollRareColor = rollDie(dodongoTraits.rareColors.roll[1]);
    console.log(`Dodongo rare color roll: ${rollRareColor}`);
    traits.rareColor = dodongoTraits.rareColors.traits[rollRareColor] || 'Undefined Rare Color';
  }

  return traits;
}

// ------------------- Generate Mountain Goat Traits -------------------
function generateMountainGoatTraits(isRare = false) {
  const traits = {};

  if (mountainGoatTraits.commonColors) {
    const rollCommonColor = rollDie(mountainGoatTraits.commonColors.roll[1]);
    console.log(`Mountain Goat common color roll: ${rollCommonColor}`);
    traits.commonColors = mountainGoatTraits.commonColors.traits[rollCommonColor] || 'Undefined Common Color';
  }

  if (isRare && mountainGoatTraits.rareColors) {
    const rollRareColor = rollDie(mountainGoatTraits.rareColors.roll[1]);
    console.log(`Mountain Goat rare color roll: ${rollRareColor}`);
    traits.rareColor = mountainGoatTraits.rareColors.traits[rollRareColor] || 'Undefined Rare Color';
  }

  return traits;
}

// ------------------- Generate Water Buffalo Traits -------------------
function generateWaterBuffaloTraits(isRare = false) {
  const traits = {};

  if (waterBuffaloTraits.commonColors) {
    const rollCommonColor = rollDie(waterBuffaloTraits.commonColors.roll[1]);
    console.log(`Water Buffalo common color roll: ${rollCommonColor}`);
    traits.commonColors = waterBuffaloTraits.commonColors.traits[rollCommonColor] || 'Undefined Common Color';
  }

  if (isRare && waterBuffaloTraits.rareColors) {
    const rollRareColor = rollDie(waterBuffaloTraits.rareColors.roll[1]);
    console.log(`Water Buffalo rare color roll: ${rollRareColor}`);
    traits.rareColor = waterBuffaloTraits.rareColors.traits[rollRareColor] || 'Undefined Rare Color';
  }

  return traits;
}

// ------------------- Generate Deer Traits -------------------
function generateDeerTraits(isRare = false) {
  const traits = {};

  if (deerTraits.commonColors) {
    const rollCommonColor = rollDie(deerTraits.commonColors.roll[1]);
    console.log(`Deer common color roll: ${rollCommonColor}`);
    traits.commonColors = deerTraits.commonColors.traits[rollCommonColor] || 'Undefined Common Color';
  }

  if (isRare && deerTraits.rareColors) {
    const rollRareColor = rollDie(deerTraits.rareColors.roll[1]);
    console.log(`Deer rare color roll: ${rollRareColor}`);
    traits.rareColor = deerTraits.rareColors.traits[rollRareColor] || 'Undefined Rare Color';
  }

  return traits;
}

// ------------------- Generate Wolfos Traits -------------------
function generateWolfosTraits(isRare = false) {
  const traits = {};

  if (wolfosTraits.commonColors) {
    const rollCommonColor = rollDie(wolfosTraits.commonColors.roll[1]);
    console.log(`Wolfos common color roll: ${rollCommonColor}`);
    traits.commonColors = wolfosTraits.commonColors.traits[rollCommonColor] || 'Undefined Common Color';
  }

  if (isRare && wolfosTraits.rareColors) {
    const rollRareColor = rollDie(wolfosTraits.rareColors.roll[1]);
    console.log(`Wolfos rare color roll: ${rollRareColor}`);
    traits.rareColor = wolfosTraits.rareColors.traits[rollRareColor] || 'Undefined Rare Color';
  }

  return traits;
}

// ------------------- Generate Bear Traits -------------------
function generateBearTraits(isRare = false) {
  const traits = {};

  if (bearTraits.commonColors) {
    const rollCommonColor = rollDie(bearTraits.commonColors.roll[1]);
    console.log(`Bear common color roll: ${rollCommonColor}`);
    traits.commonColors = bearTraits.commonColors.traits[rollCommonColor] || 'Undefined Common Color';
  }

  if (isRare && bearTraits.rareColors) {
    const rollRareColor = rollDie(bearTraits.rareColors.roll[1]);
    console.log(`Bear rare color roll: ${rollRareColor}`);
    traits.rareColor = bearTraits.rareColors.traits[rollRareColor] || 'Undefined Rare Color';
  }

  return traits;
}

// ------------------- Generate Moose Traits -------------------
function generateMooseTraits(isRare = false) {
  const traits = {};

  if (mooseTraits.commonColors) {
      const rollCommonColor = rollDie(mooseTraits.commonColors.roll[1]);
      console.log(`Moose common color roll: ${rollCommonColor}`);
      traits.commonColors = mooseTraits.commonColors.traits[rollCommonColor] || 'Undefined Common Color';
  }

  if (isRare && mooseTraits.rareColors) {
      const rollRareColor = rollDie(mooseTraits.rareColors.roll[1]);
      console.log(`Moose rare color roll: ${rollRareColor}`);
      traits.rareColor = mooseTraits.rareColors.traits[rollRareColor] || 'Undefined Rare Color';
  }

  return traits;
}

// ------------------- Roll a Die -------------------
function rollDie(sides) {
  return Math.max(1, Math.min(Math.floor(Math.random() * sides) + 1, sides));
}

// ------------------- Calculate Mount Price -------------------
function calculateMountPrice(mount) {
  const basePrices = {
    Basic: 50,  // Base price for Basic level mounts
    Mid: 100,   // Base price for Mid level mounts
    High: 250,  // Base price for High level mounts
  };

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

  const basePrice = basePrices[mount.level] || 50; // Default to Basic price if level is undefined
  const rarityMultiplier = mount.isRare ? 2 : 1;   // Rare mounts double the price
  const mountRegion = regionalMounts[mount.species];
  const regionalBonus = mountRegion && mountRegion !== 'All Villages' && mount.region === mountRegion ? 50 : 0; // Regional bonus only if matches

  // Log details of the calculation
  console.log('[mountModule.js]: Calculating base price for mount:', mount.name);
  console.log(`[mountModule.js]: Base price based on level (${mount.level}): ${basePrice}`);
  console.log(`[mountModule.js]: Rarity multiplier (isRare: ${mount.isRare}): ${rarityMultiplier}`);
  console.log(`[mountModule.js]: Regional bonus (species: ${mount.species}, region: ${mount.region}): ${regionalBonus}`);

  const finalPrice = (basePrice + regionalBonus) * rarityMultiplier;

  // Log the final calculated price
  console.log(`[mountModule.js]: Final calculated price for mount "${mount.name}": ${finalPrice}`);

  return finalPrice;
}



// ------------------- Exports -------------------
module.exports = {
  customizationCosts,
  distractionItems,
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
  useBoostingItems,
  generateHorseTraits,
  generateDonkeyTraits,
  generateOstrichTraits,
  generateBullboTraits,
  generateDodongoTraits,
  generateMountainGoatTraits,
  generateWaterBuffaloTraits,
  generateDeerTraits,
  generateWolfosTraits,
  generateBearTraits,
  horseTraits,
  donkeyTraits,
  ostrichTraits,
  bullboTraits,
  dodongoTraits,
  mountainGoatTraits,
  waterBuffaloTraits,
  deerTraits,
  wolfosTraits,
  bearTraits,
  mooseTraits,
  generateMooseTraits,
  generateMountainGoatTraits,
  mountainGoatTraits,
  calculateMountPrice
};
