// ============================================================================
// ------------------- Pet Module -------------------
// Handles pet-related data, roll permissions, flavor texts, and emoji mapping.
// ============================================================================

// ------------------- Error Handling -------------------
let handleError;
try {
  const errorHandler = require('../utils/globalErrorHandler');
  handleError = errorHandler.handleError;
} catch (e) {
  console.error("[petModule.js]: ❌ Failed to load global error handler:", e.message);
  handleError = (error, source, context) => {
    console.error(`[${source}]: ❌ Error: ${error.message}`);
    console.error(`[${source}]: Stack trace: ${error.stack}`);
  };
}

// ------------------- Required Imports -------------------
const { uploadPetImage } = require('../utils/uploadUtils');
const Pet = require('../models/PetModel');

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
    chainchomp: ['petprey', 'lgpetprey', 'petmon'],
    choirfrog: ['petprey', 'petforage'],
    cucco: ['petprey', 'petforage', 'petmon'],
    flightlessbird: ['petforage', 'petmon'],
    foragingbird: ['petforage'],
    keese: ['petprey', 'petforage'],
    lagamorph: ['petforage'],
    largecanine: ['lgpetprey', 'petmon'],
    largefeline: ['lgpetprey', 'petmon'],
    largereptile: ['lgpetprey', 'petforage'],
    marsupial: ['petprey', 'petforage'],
    mesopredator: ['petprey', 'petmon'],
    moink: ['petforage', 'petmon'],
    mustelid: ['petprey', 'petforage', 'petmon'],
    polsvoice: ['petprey', 'petforage'],
    porcine: ['petforage', 'petmon'],
    predatorybird: ['petprey', 'petmon'],
    pygmyoctorok: ['petprey', 'petmon'],
    remlit: ['petprey', 'petforage', 'petmon'],
    sandseal: ['petforage', 'petmon'],
    scavengingbird: ['petprey', 'petforage'],
    shellreptile: ['petforage'],
    smallcanine: ['petprey', 'petforage', 'petmon'],
    smallfeline: ['petprey', 'petforage', 'petmon'],
    smallreptile: ['petprey', 'petforage'],
    walltula: ['petprey', 'petmon'],
    smallspecial: ['petprey', 'petforage', 'petmon'],
    largespecial: ['lgpetprey', 'petforage', 'petmon'],
    chuchu: ['petprey', 'petforage', 'petchu', 'petfirechu', 'peticechu', 'petelectricchu']
  };
  
// ------------------- Helper Functions for Pet Module -------------------
const getPerkField = (perk) => perkFieldMap[perk] || null;

const getPetEmoji = (species) => petEmojiMap[species.toLowerCase()] || '🐾';

const getRollsDisplay = (rollsRemaining, level) => {
  const usedRolls = level - rollsRemaining;
  return "🔔".repeat(rollsRemaining) + "🔕".repeat(usedRolls);
};

// ---- Function: findPetByIdentifier ----
// Finds a pet by either ID or name, returns null if not found
const findPetByIdentifier = async (petIdentifier, characterId) => {
  // Check if identifier looks like an ObjectId
  if (petIdentifier.match(/^[0-9a-fA-F]{24}$/)) {
    return await Pet.findOne({ _id: petIdentifier, owner: characterId });
  }
  // Otherwise search by name
  return await Pet.findOne({ name: petIdentifier, owner: characterId });
};

// ---- Function: handlePetImageUpload ----
// Handles pet image upload with fallback and error handling
const handlePetImageUpload = async (imageAttachment, petName) => {
  if (!imageAttachment) return "";
  
  try {
    const petImageUrl = await uploadPetImage(imageAttachment.url, petName);
    console.log(`[petModule.js]: ✅ Image uploaded successfully. Public URL: ${petImageUrl}`);
    return petImageUrl;
  } catch (error) {
    console.error(`[petModule.js]: ❌ Error uploading image for pet "${petName}": ${error.message}`);
    console.error(`[petModule.js]: Stack trace: ${error.stack}`);
    
    // Try to use error handler if available
    if (handleError) {
      try {
        handleError(error, "petModule.js", { petName });
      } catch (e) {
        console.error(`[petModule.js]: ❌ Failed to use error handler: ${e.message}`);
      }
    }
    
    throw new Error(`Failed to upload pet image: ${error.message}`);
  }
};

// ---- Function: validatePetSpeciesCompatibility ----
// Validates species and pet type compatibility, returns formatted error if invalid
const validatePetSpeciesCompatibility = (species, petType) => {
  // Normalize species for lookup
  const normalizedSpeciesKey = species.toLowerCase().replace(/\s+/g, '').replace(/'/g, '');
  const allowedRolls = speciesRollPermissions[normalizedSpeciesKey];

  // Check if species exists
  if (!allowedRolls) {
    return {
      isValid: false,
      error: `❌ **Unknown or unsupported species \`${species}\`. Please select a valid species.**`
    };
  }

  // Validate petTypeData existence
  const selectedPetTypeData = getPetTypeData(petType);
  if (!selectedPetTypeData) {
    return {
      isValid: false,
      error: `❌ **Unknown or unsupported pet type \`${petType}\`.**`
    };
  }

  // Validate Species Compatibility with Pet Type
  if (!canSpeciesPerformPetType(normalizedSpeciesKey, petType)) {
    const allowedRollsFormatted = allowedRolls.map((roll) => `\`${roll}\``).join(", ");
    const validPetTypes = Object.keys(petTypeData).filter((type) =>
      canSpeciesPerformPetType(normalizedSpeciesKey, type)
    );
    const validPetTypesFormatted = validPetTypes.length > 0 ? validPetTypes.map((type) => `\`${type}\``).join(", ") : "None";

    return {
      isValid: false,
      error: `❌ **The selected species \`${species}\` cannot be assigned to the pet type \`${petType}\`.**\n\n` +
        `__Allowed Rolls__: ${allowedRollsFormatted}\n` +
        `__Compatible Pet Types__: ${validPetTypesFormatted}\n\n` +
        `👉 **Please choose a compatible pet type based on your species' available rolls.**`
    };
  }

  return { isValid: true };
};

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
  getRollsDisplay,
  findPetByIdentifier,
  handlePetImageUpload,
  validatePetSpeciesCompatibility,
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
