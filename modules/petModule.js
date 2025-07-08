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
    "**{petName}** went hunting and brought back **{itemName}**!",
    "**{petName}** returned from a hunt with **{itemName}**!",
    "**{petName}** found **{itemName}** while out hunting!"
  ],
  lgpetprey: [
    "**{petName}** went on a big hunt and found **{itemName}**!",
    "After an intense hunt, **{petName}** returned with **{itemName}**!",
    "**{petName}** found **{itemName}** during a major hunt!"
  ],
  petforage: [
    "**{petName}** foraged around and found **{itemName}**!",
    "While exploring, **{petName}** discovered **{itemName}**!",
    "**{petName}** gathered some resources and found **{itemName}**!"
  ],
  petmon: [
    "**{petName}** tracked a monster and found **{itemName}**!",
    "After a dangerous encounter, **{petName}** discovered **{itemName}**!",
    "**{petName}** found **{itemName}** while tracking monsters!"
  ],
  petchu: [
    "**{petName}** used its special abilities and found **{itemName}**!",
    "**{petName}** discovered **{itemName}** using its unique powers!"
  ],
  petfirechu: [
    "**{petName}** used its fire abilities and found **{itemName}**!",
    "**{petName}** discovered **{itemName}** with its fiery powers!"
  ],
  peticechu: [
    "**{petName}** used its ice abilities and found **{itemName}**!",
    "**{petName}** discovered **{itemName}** with its frosty powers!"
  ],
  petelectricchu: [
    "**{petName}** used its lightning abilities and found **{itemName}**!",
    "**{petName}** discovered **{itemName}** with its electric powers!"
  ]
};

// ------------------- Pet Types Data -------------------
const petTypeData = {
  Chuchu: {
    rollCombination: ['petprey', 'petforage', 'petchu'],
    description: 'Special creatures that can access unique resources and use their special abilities.'
  },
  FireChuchu: {
    rollCombination: ['petprey', 'petforage', 'petchu', 'petfirechu'],
    description: 'Fire elemental chuchu that can access fire-based resources and abilities.'
  },
  IceChuchu: {
    rollCombination: ['petprey', 'petforage', 'petchu', 'peticechu'],
    description: 'Ice elemental chuchu that can access ice-based resources and abilities.'
  },
  ElectricChuchu: {
    rollCombination: ['petprey', 'petforage', 'petchu', 'petelectricchu'],
    description: 'Electric elemental chuchu that can access electric-based resources and abilities.'
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
    chuchu: ['petprey', 'petforage', 'petchu'],
    firechuchu: ['petprey', 'petforage', 'petchu', 'petfirechu'],
    icechuchu: ['petprey', 'petforage', 'petchu', 'peticechu'],
    electricchuchu: ['petprey', 'petforage', 'petchu', 'petelectricchu']
  };
  
// ------------------- Helper Functions for Pet Module -------------------
const getPerkField = (perk) => perkFieldMap[perk] || null;

const getPetEmoji = (species) => petEmojiMap[species.toLowerCase()] || '🐾';

const getRollsDisplay = (rollsRemaining, level) => {
  const safeRollsRemaining = Math.max(0, rollsRemaining);
  const usedRolls = Math.max(0, level - safeRollsRemaining);
  return "🔔".repeat(safeRollsRemaining) + "🔕".repeat(usedRolls);
};

// ------------------- Function: findPetByIdentifier -------------------
// Finds a pet by its identifier (ID or name) and owner
async function findPetByIdentifier(identifier, ownerId, status = null) {
  try {
    let query = { owner: ownerId };
    
    if (identifier.match(/^[0-9a-fA-F]{24}$/)) {
      query._id = identifier;
    } else {
      query.name = identifier;
    }

    // If status is provided, add it to the query
    if (status) {
      query.status = status;
    }

    const pet = await Pet.findOne(query);
    return pet;
  } catch (error) {
    console.error(`[petModule.js]: ❌ Error finding pet:`, error);
    throw error;
  }
}

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
      error: `❌ **Unknown or unsupported species \`${species}\`. Please select a valid species.**`,
      species: species
    };
  }

  // Validate petTypeData existence
  const selectedPetTypeData = getPetTypeData(petType);
  if (!selectedPetTypeData) {
    return {
      isValid: false,
      error: `❌ **Unknown or unsupported pet type \`${petType}\`.**`,
      petType: petType
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
      error: `❌ **The selected species \`${species}\` cannot be assigned to the pet type \`${petType}\`.**`,
      allowedRolls: allowedRollsFormatted,
      compatiblePetTypes: validPetTypesFormatted,
      species: species,
      petType: petType
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

// ------------------- Pet Price Calculation -------------------
function calculatePetPrice(pet) {
  const basePrices = {
    1: 100,  // Base price for level 1 pets
    2: 200,  // Base price for level 2 pets
    3: 500   // Base price for level 3 pets
  };

  const petTypeMultipliers = {
    'Chuchu': 1.5,      // Special elemental pets are more valuable
    'Conqueror': 1.3,   // Large foragers are valuable
    'Explorer': 1.2,    // Versatile pets are valuable
    'Forager': 1.0,     // Basic foragers
    'Guardian': 1.3,    // Large protectors are valuable
    'Hunter': 1.2,      // Large predators are valuable
    'Nomad': 1.4,       // Most versatile pets are very valuable
    'Omnivore': 1.1,    // Adaptable pets
    'Protector': 1.0,   // Basic protectors
    'Prowler': 1.2,     // Advanced hunters
    'Ranger': 1.1,      // Versatile hunters
    'Roamer': 1.3,      // Large versatile pets
    'Scavenger': 1.1,   // Resourceful pets
    'Sentinel': 1.4,    // Most powerful protectors
    'Tracker': 1.2      // Skilled hunters
  };

  const basePrice = basePrices[pet.level] || 100; // Default to level 1 price if level is undefined
  const typeMultiplier = petTypeMultipliers[pet.petType] || 1.0;
  const rollsBonus = pet.rollsRemaining * 50; // Each remaining roll adds 50 to the price

  // Log details of the calculation
  console.log('[petModule.js]: Calculating base price for pet:', pet.name);
  console.log(`[petModule.js]: Base price based on level (${pet.level}): ${basePrice}`);
  console.log(`[petModule.js]: Type multiplier (${pet.petType}): ${typeMultiplier}`);
  console.log(`[petModule.js]: Rolls bonus (${pet.rollsRemaining} rolls): ${rollsBonus}`);

  const finalPrice = Math.floor((basePrice + rollsBonus) * typeMultiplier);

  // Log the final calculated price
  console.log(`[petModule.js]: Final calculated price for pet "${pet.name}": ${finalPrice}`);

  return finalPrice;
}

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
  petTypeData,
  calculatePetPrice
};
