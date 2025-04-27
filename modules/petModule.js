// ============================================================================
// ------------------- Pet Module -------------------
// Handles pet-related data, roll permissions, flavor texts, and emoji mapping.
// ============================================================================

// ------------------- Pet Perk Field Mapping -------------------
const perkFieldMap = {
  petprey: 'petprey',
  petforage: 'petforage',
  lgpetprey: 'lgpetprey',
  petmon: 'petmon',
  petchu: 'petchu',
  petfirechu: 'petfirechu',
  peticechu: 'peticechu',
  petelectricchu: 'petelectricchu'
};

// ------------------- Pet Emoji Mapping -------------------

// ----- Normal Pets -----
const normalPets = {
  amphibian: '🐸',
  bovine: '🐄',
  caprine: '🐐',
  climbingReptile: '🦎',
  flightlessBird: '🐥',
  foragingBird: '🐦',
  largeCanine: '🐕',
  largeFeline: '🦁',
  lagamorph: '🐰',
  marsupial: '🦘',
  mesopredator: '🦝',
  mustelid: '🦦',
  ovine: '🐑',
  porcine: '🐷',
  predatoryBird: '🦉',
  rodent: '🐹',
  scavengingBird: '🦅',
  shellReptile: '🐢',
  smallCanine: '🐶',
  smallFeline: '🐱',
  smallReptile: '🐍'
};

// ----- Special Pets -----
const specialPets = {
  'Choir Frog': '🐸',
  chainChomp: '🔗',
  chuchu: '🔵',
  cucco: '🐔',
  keese: '🦇',
  moink: '🐷',
  "pol's voice": '🐰',
  pygmyOctorok: '🐙',
  remlit: '✨',
  'sand seal': '🏜️',
  walltula: '🕷️'
};

// ------------------- Combined Emoji Mapping -------------------
const petEmojiMap = {
  ...normalPets,
  ...specialPets
};

// ------------------- Pet Table Roll Descriptions -------------------
const petTableRollDescriptions = {
  petprey: 'Pet hunts small game',
  lgpetprey: 'Pet hunts larger game (large pets only)',
  petforage: 'Pet forages for plants & misc',
  petmon: 'Pet hunts small monsters & forages for parts',
  petchu: 'Basic elemental roll for Chuchu',
  petfirechu: 'Fire elemental roll for Chuchu',
  peticechu: 'Ice elemental roll for Chuchu',
  petelectricchu: 'Electric elemental roll for Chuchu'
};

// ------------------- Randomized Flavor Texts -------------------
const flavorText = {
  petprey: [
    "**{petName}** went on a little hunt and brought you back **{itemName}**!",
    "Your loyal **{petSpecies} {petName}** found **{itemName}** while hunting small game!",
    "**{petName}** pounced through the fields and returned with **{itemName}**!"
  ],
  lgpetprey: [
    "**{petName}** chased down a big catch and found **{itemName}**!",
    "After a mighty hunt, **{petName}** has returned with **{itemName}**!",
    "Your brave **{petSpecies} {petName}** conquered the hunt and brought back **{itemName}**!"
  ],
  petforage: [
    "**{petName}** foraged around and discovered **{itemName}**!",
    "On a quiet walk, **{petName}** stumbled upon **{itemName}**!",
    "Your curious **{petSpecies} {petName}** found **{itemName}** while foraging."
  ],
  petmon: [
    "**{petName}** tracked down a monster and brought back **{itemName}**!",
    "After a daring adventure, **{petName}** returned with **{itemName}** from the hunt!",
    "Your fierce **{petSpecies} {petName}** defeated a monster and found **{itemName}**!"
  ],
  petchu: [
    "**{petName}** tapped into its elemental nature and discovered **{itemName}**!",
    "The mystical **{petSpecies} {petName}** revealed **{itemName}** through its elemental powers!"
  ],
  petfirechu: [
    "**{petName}** ignited a spark and uncovered **{itemName}**!",
    "Flames danced as **{petName}** returned with **{itemName}**!"
  ],
  peticechu: [
    "**{petName}** chilled the air and found **{itemName}**!",
    "With a frosty demeanor, **{petSpecies} {petName}** delivered **{itemName}**!"
  ],
  petelectricchu: [
    "**{petName}** charged up and brought back **{itemName}**!",
    "Electricity surged as **{petName}** discovered **{itemName}**!"
  ]
};

// ------------------- Pet Types Data -------------------
const petTypeData = {
  Chuchu: {
    rollCombination: ['petprey', 'petforage', 'petchu', 'petfirechu', 'peticechu', 'petelectricchu'],
    description: 'Special elemental creatures that can access specific elemental resources (Chuchu-only).'
  },
  Conqueror: {
    rollCombination: ['lgpetprey', 'petforage'],
    description: 'Large foragers with the power to dominate their environment and gather a wide array of resources.'
  },
  Explorer: {
    rollCombination: ['petprey', 'petforage', 'petmon'],
    description: 'Versatile animals capable of gathering, hunting, and exploring.'
  },
  Forager: {
    rollCombination: ['petforage'],
    description: 'Animals that primarily gather plant-based resources.'
  },
  Guardian: {
    rollCombination: ['lgpetprey', 'petmon'],
    description: 'Large animals with protective and hunting abilities.'
  },
  Hunter: {
    rollCombination: ['lgpetprey'],
    description: 'Large predators skilled at preying on substantial targets.'
  },
  Nomad: {
    rollCombination: ['petprey', 'lgpetprey', 'petforage', 'petmon'],
    description: 'Adaptive animals that roam, forage, and hunt, adjusting to different terrains and diets.'
  },
  Omnivore: {
    rollCombination: ['petmon'],
    description: 'Adaptable animals with diverse diets and unique traits.'
  },
  Protector: {
    rollCombination: ['petprey'],
    description: 'Small predators adept at hunting and scavenging.'
  },
  Prowler: {
    rollCombination: ['petprey', 'lgpetprey'],
    description: 'Animals that can both hunt and guard with advanced skills.'
  },
  Ranger: {
    rollCombination: ['petprey', 'petforage'],
    description: 'Agile creatures adept at foraging and hunting in various environments.'
  },
  Roamer: {
    rollCombination: ['petforage', 'lgpetprey', 'petmon'],
    description: 'Large omnivores that forage and hunt, capable of gathering unique resources.'
  },
  Scavenger: {
    rollCombination: ['petforage', 'petmon'],
    description: 'Animals that forage and gather unique resources.'
  },
  Sentinel: {
    rollCombination: ['petprey', 'lgpetprey', 'petmon'],
    description: 'Powerful protectors and hunters, capable of defending against significant threats.'
  },
  Tracker: {
    rollCombination: ['petprey', 'petmon'],
    description: 'Predators with heightened tracking and hunting capabilities.'
  }
};

// ------------------- Species Roll Permissions -------------------
const speciesRollPermissions = {
  amphibian: ['petprey', 'petforage'],
  bovine: ['petforage'],
  caprine: ['petforage', 'petmon'],
  chainChomp: ['petprey', 'lgpetprey', 'petmon'],
  choirFrog: ['petprey', 'petforage'],
  cucco: ['petprey', 'petforage', 'petmon'],
  flightlessBird: ['petforage', 'petmon'],
  foragingBird: ['petforage'],
  keese: ['petprey', 'petforage'],
  lagamorph: ['petforage'],
  largeCanine: ['lgpetprey', 'petmon'],
  largeFeline: ['lgpetprey', 'petmon'],
  largeReptile: ['lgpetprey', 'petforage'],
  marsupial: ['petprey', 'petforage'],
  mesopredator: ['petprey', 'petmon'],
  moink: ['petforage', 'petmon'],
  mustelid: ['petprey', 'petforage', 'petmon'],
  polsVoice: ['petprey', 'petforage'],
  porcine: ['petforage', 'petmon'],
  predatoryBird: ['petprey', 'petmon'],
  pygmyOctorok: ['petprey', 'petmon'],
  remlit: ['petprey', 'petforage', 'petmon'],
  sandSeal: ['petforage', 'petmon'],
  scavengingBird: ['petprey', 'petforage'],
  shellReptile: ['petforage'],
  smallCanine: ['petprey', 'petforage', 'petmon'],
  smallFeline: ['petprey', 'petforage', 'petmon'],
  smallReptile: ['petprey', 'petforage'],
  walltula: ['petprey', 'petmon'],
  smallSpecial: ['petprey', 'petforage', 'petmon'],
  largeSpecial: ['lgpetprey', 'petforage', 'petmon'],
  chuchu: ['petprey', 'petforage', 'petchu', 'petfirechu', 'peticechu', 'petelectricchu']
};

// ------------------- Helper Functions for Pet Module -------------------
const getPerkField = (perk) => perkFieldMap[perk] || null;

const getPetEmoji = (species) => petEmojiMap[species.toLowerCase()] || '🐾';

const getPetTableRollDescription = (perk) => petTableRollDescriptions[perk] || 'Unknown perk';

const getFlavorText = (tableType, petName, petSpecies, itemName) => {
  const texts = flavorText[tableType] || [`${petName} returned with ${itemName}!`];
  const chosenText = texts[Math.floor(Math.random() * texts.length)];
  return chosenText
    .replace(/{petName}/g, petName)
    .replace(/{petSpecies}/g, petSpecies)
    .replace(/{itemName}/g, itemName);
};

const getPetTypeRollCombination = (petType) => {
  const typeData = petTypeData[petType];
  return typeData ? typeData.rollCombination : [];
};

const getPetTypeDescription = (petType) => {
  const typeData = petTypeData[petType];
  return typeData ? typeData.description : 'Unknown pet type';
};

const getPetTypeData = (petType) => petTypeData[petType] || null;

const canSpeciesPerformPetType = (speciesKey, petType) => {
  const allowedRolls = speciesRollPermissions[speciesKey];
  const requiredRolls = getPetTypeRollCombination(petType);
  if (!allowedRolls.length) return false;
  return requiredRolls.every((roll) => allowedRolls.includes(roll));
};

// ------------------- Module Exports -------------------
module.exports = {
  getPerkField,
  getPetEmoji,
  getPetTableRollDescription,
  getFlavorText,
  getPetTypeRollCombination,
  getPetTypeDescription,
  getPetTypeData,
  petEmojiMap,
  normalPets,
  specialPets,
  canSpeciesPerformPetType,
  speciesRollPermissions,
  petTypeData
};
