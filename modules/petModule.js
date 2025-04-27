// ------------------- Pet Perk Field Mapping -------------------
// Maps pet perk keys to specific fields in the item database.
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
// General categories for typical pet species.
const normalPets = {
  // Canines
  smallCanine: '🐶',       // Small dog breeds, foxes
  largeCanine: '🐕',       // Large dog breeds, wolves

  // Felines
  smallFeline: '🐱',       // House cats
  largeFeline: '🦁',       // Lions, tigers, big cats

  // Rodents & Small Mammals
  lagamorph : '🐰',          // Rabbits, hares
  rodent: '🐹',             // Hamsters, gerbils, voles
  mustelid: '🦦',          // Ferrets, weasels, mink

  // Ungulates (Livestock)
  ovine: '🐑',             // Sheep
  bovine: '🐄',            // Cows
  caprine: '🐐',           // Goats
  porcine: '🐷',           // Pigs

  // Marsupials & Misc
  marsupial: '🦘',         // Sugar gliders, opossums
  mesopredator: '🦝',      // Raccoons, opossums, badgers, etc.

  // Birds
  foragingBird: '🐦',       // Songbirds, waterfowl
  scavengingBird: '🦅',     // Ravens, vultures
  predatoryBird: '🦉',      // Owls, hawks
  flightlessBird: '🐥',     // Chicks, ducklings

  // Reptiles & Amphibians
  smallReptile: '🐍',       // Snakes
  climbingReptile: '🦎',    // Lizards, geckos
  shellReptile: '🐢',       // Turtles, tortoises
  amphibian: '🐸',          // Frogs, toads, axolotls
};

// ----- Special Pets -----
// More unique or magical pet types.
const specialPets = {
  chainChomp: '🔗',       // Represents Chain Chomp
  chuchu: '🔵',           // Represents Chuchu
  'Choir Frog': '🐸',     // Represents Choir Frog
  cucco: '🐔',            // Represents Cucco
  keese: '🦇',            // Represents Keese
  moink: '🐷',            // Represents Moink
  "pol's voice": '🐰',    // Represents Pol’s Voice
  'pygmy octorok': '🐙',  // Represents Pygmy Octorok
  remlit: '✨',           // Special magical pet
  'sand seal': '🏜️',      // Represents Sand Seal
  walltula: '🕷️'         // Represents Walltula
};

// ------------------- Combined Emoji Mapping -------------------
// Merges normal and special pets into a single mapping.
const petEmojiMap = {
  ...normalPets,
  ...specialPets
};

// ------------------- Pet Table Roll Descriptions -------------------
// Descriptions for each pet table roll perk.
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
// Contains arrays of flavor text templates for each pet table roll perk.
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
    "{petName} foraged around and discovered **{itemName}**!",
    "On a quiet walk, **{petName}** stumbled upon **{itemName}**!",
    "Your curious **{petSpecies} {petName}** found **{itemName}** while foraging."
  ],
  petmon: [
    "**{petName}** tracked down a monster and brought back **{itemName}**!",
    "After a daring adventure, **{petName}** returned with **{itemName}** from the hunt!",
    "Your fierce **{petSpecies} {petName}** defeated a monster and found **{itemName}**!"
  ],
  // New flavor texts for Chuchu elemental rolls.
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
// Defines pet types with their corresponding roll combinations and descriptions.
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

// ------------------- Helper Functions for Pet Module -------------------

// Retrieve the correct field for the pet's perk.
const getPerkField = (perk) => perkFieldMap[perk] || null;

// Retrieve the emoji associated with a pet species.
// (If a matching emoji is not found, a default paw emoji is returned.)
const getPetEmoji = (species) => petEmojiMap[species.toLowerCase()] || '🐾';

// Get the description for a pet table roll based on the perk.
const getPetTableRollDescription = (perk) => petTableRollDescriptions[perk] || 'Unknown perk';

// Generate flavor text based on the roll type, pet name, species, and item found.
const getFlavorText = (tableType, petName, petSpecies, itemName) => {
  const texts = flavorText[tableType] || ["{petName} returned with {itemName}!"];
  const chosenText = texts[Math.floor(Math.random() * texts.length)];
  return chosenText
    .replace("{petName}", petName)
    .replace("{petSpecies}", petSpecies)
    .replace("{itemName}", itemName);
};

// Retrieve the roll combination for a given pet type.
const getPetTypeRollCombination = (petType) => {
  const typeData = petTypeData[petType];
  return typeData ? typeData.rollCombination : null;
};

// Retrieve the description for a given pet type.
const getPetTypeDescription = (petType) => {
  const typeData = petTypeData[petType];
  return typeData ? typeData.description : 'Unknown pet type';
};

// Retrieve the complete pet type data (roll combination and description) for a given pet type.
const getPetTypeData = (petType) => petTypeData[petType] || null;

// ------------------- Species Roll Permissions -------------------
// Defines which roll types each species is allowed to perform based on updated chart.

const speciesRollPermissions = {
  smallCanine: ['petprey', 'petforage', 'petmon'],
  largeCanine: ['lgpetprey', 'petmon'],
  smallFeline: ['petprey', 'petforage', 'petmon'],
  largeFeline: ['lgpetprey', 'petmon'],
  lagamorph: ['petforage'],
  rodent: ['petforage'],
  mustelid: ['petprey', 'petforage', 'petmon'],
  ovine: ['petforage'],
  bovine: ['petforage'],
  caprine: ['petforage', 'petmon'],
  porcine: ['petforage', 'petmon'],
  marsupial: ['petprey', 'petforage'],
  mesopredator: ['petprey', 'petmon'],
  foragingBird: ['petforage'],
  scavengingBird: ['petprey', 'petforage'],
  predatoryBird: ['petprey', 'petmon'],
  flightlessBird: ['petforage', 'petmon'],
  smallReptile: ['petprey', 'petforage'],
  largeReptile: ['lgpetprey', 'petforage'],
  shellReptile: ['petforage'],
  amphibian: ['petprey', 'petforage'],
  chainChomp: ['petprey', 'lgpetprey', 'petmon'],
  chuchu: ['petprey', 'petforage', 'petchu', 'petfirechu', 'peticechu', 'petelectricchu'],
  choirFrog: ['petprey', 'petforage'],
  cucco: ['petprey', 'petforage', 'petmon'],
  keese: ['petprey', 'petforage'],
  moink: ['petforage', 'petmon'],
  polsVoice: ['petprey', 'petforage'],
  pygmyOctorok: ['petprey', 'petmon'],
  remlit: ['petprey', 'petforage', 'petmon'],
  sandSeal: ['petforage', 'petmon'],
  walltula: ['petprey', 'petmon'],
  smallSpecial: ['petprey', 'petforage', 'petmon'],
  largeSpecial: ['lgpetprey', 'petforage', 'petmon'],
};

// ------------------- Helper: Validate Species Can Perform PetType Rolls -------------------
const canSpeciesPerformPetType = (speciesKey, petType) => {
  const allowedRolls = speciesRollPermissions[speciesKey];
  const requiredRolls = getPetTypeRollCombination(petType) || [];

  if (!allowedRolls) return false; // No permission record = block

  // Ensure species has all required rolls
  return requiredRolls.every(roll => allowedRolls.includes(roll));
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
};
