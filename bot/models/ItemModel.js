// ============================================================================
// Imports
// ============================================================================
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================================
// Subschemas
// ============================================================================

// Crafting materials used inside Item.craftingMaterial
const CraftingMaterialSchema = new Schema({
  _id: { type: Schema.Types.ObjectId, required: true }, // ID from the original item
  itemName: { type: String, required: true },           // Name of the crafting material
  quantity: { type: Number, required: true }            // Quantity required
});

// ============================================================================
// Item Schema
// ============================================================================
const ItemSchema = new Schema(
  {
    // ------------------- Identity & Display -------------------
    itemName: { type: String, required: true },
    image: { type: String, default: 'No Image' },
    imageType: { type: String, default: 'No Image Type' },
    emoji: { type: String, default: '' },

    // ------------------- Classification -------------------
    itemRarity: { type: Number, default: 1 },
    category: { type: [String], default: ['Misc'] },   // e.g., 'Armor', 'Food'
    categoryGear: { type: String, default: 'None' },   // e.g., 'Armor', 'Weapon'
    type: { type: [String], default: ['Unknown'] },    // e.g., ['Material', 'Food']
    subtype: { type: [String], default: ['None'] },    // e.g., ['Head', 'Bow']
    recipeTag: { type: [String], default: ['#Not Craftable'] },
    element: { type: String, default: 'none' },        // e.g., 'fire', 'ice', 'electric', 'tech', 'none'

    // ------------------- Economics -------------------
    buyPrice: { type: Number, default: 0 },
    sellPrice: { type: Number, default: 0 },

    // ------------------- Effects / Stats -------------------
    // For gear: used as attack (weapon) or defense (armor/shield) when equipped
    modifierHearts: { type: Number, default: 0 },
    staminaRecovered: { type: Number, default: 0 },

    // ------------------- Stack Rules -------------------
    stackable: { type: Boolean, default: false },
    maxStackSize: { type: Number, default: 10 },

    // ------------------- Crafting -------------------
    craftingMaterial: { type: [CraftingMaterialSchema], default: [] },
    staminaToCraft: { type: Schema.Types.Mixed, default: null },
    crafting: { type: Boolean, default: false },
    craftingJobs: { type: [String], default: [] },

    // ------------------- Activities & Obtain -------------------
    gathering: { type: Boolean, default: false },
    looting: { type: Boolean, default: false },
    vending: { type: Boolean, default: false },
    traveling: { type: Boolean, default: false },
    exploring: { type: Boolean, default: false },
    obtain: { type: [String], default: [] },
    gatheringJobs: { type: [String], default: [] },
    lootingJobs: { type: [String], default: [] },

    // ------------------- Weather (special conditions) -------------------
    specialWeather: {
      muggy: { type: Boolean, default: false },
      flowerbloom: { type: Boolean, default: false },
      fairycircle: { type: Boolean, default: false },
      jubilee: { type: Boolean, default: false },
      meteorShower: { type: Boolean, default: false },
      rockslide: { type: Boolean, default: false },
      avalanche: { type: Boolean, default: false }
    },

    // ------------------- Pet Perks -------------------
    petPerk: { type: Boolean, default: false },
    petperkobtain: { type: [String], default: ['None'] },
    petprey: { type: Boolean, default: false },
    petforage: { type: Boolean, default: false },
    lgpetprey: { type: Boolean, default: false },
    petmon: { type: Boolean, default: false },
    petchu: { type: Boolean, default: false },
    petfirechu: { type: Boolean, default: false },
    peticechu: { type: Boolean, default: false },
    petelectricchu: { type: Boolean, default: false },

    // ------------------- Location Metadata -------------------
    locations: { type: [String], default: [] },
    centralHyrule: { type: Boolean, default: false },
    eldin: { type: Boolean, default: false },
    faron: { type: Boolean, default: false },
    gerudo: { type: Boolean, default: false },
    hebra: { type: Boolean, default: false },
    lanayru: { type: Boolean, default: false },
    pathOfScarletLeaves: { type: Boolean, default: false },
    leafDewWay: { type: Boolean, default: false },

    // ------------------- Job Flags -------------------
    adventurer: { type: Boolean, default: false },
    artist: { type: Boolean, default: false },
    beekeeper: { type: Boolean, default: false },
    blacksmith: { type: Boolean, default: false },
    cook: { type: Boolean, default: false },
    craftsman: { type: Boolean, default: false },
    farmer: { type: Boolean, default: false },
    fisherman: { type: Boolean, default: false },
    forager: { type: Boolean, default: false },
    gravekeeper: { type: Boolean, default: false },
    guard: { type: Boolean, default: false },
    maskMaker: { type: Boolean, default: false },
    rancher: { type: Boolean, default: false },
    herbalist: { type: Boolean, default: false },
    hunter: { type: Boolean, default: false },
    hunterLooting: { type: Boolean, default: false },
    mercenary: { type: Boolean, default: false },
    miner: { type: Boolean, default: false },
    researcher: { type: Boolean, default: false },
    scout: { type: Boolean, default: false },
    weaver: { type: Boolean, default: false },
    witch: { type: Boolean, default: false },

    // ------------------- Boost/Item Tags -------------------
    allJobs: { type: [String], default: ['None'] },
    entertainerItems: { type: Boolean, default: false },
    divineItems: { type: Boolean, default: false },

    // ------------------- Monsters -------------------
    // Associated monsters list
    monsterList: { type: [String], default: [] },
    // Monster flags
    blackBokoblin: { type: Boolean, default: false },
    blueBokoblin: { type: Boolean, default: false },
    cursedBokoblin: { type: Boolean, default: false },
    goldenBokoblin: { type: Boolean, default: false },
    silverBokoblin: { type: Boolean, default: false },
    bokoblin: { type: Boolean, default: false },

    electricChuchuLarge: { type: Boolean, default: false },
    fireChuchuLarge: { type: Boolean, default: false },
    iceChuchuLarge: { type: Boolean, default: false },
    chuchuLarge: { type: Boolean, default: false },
    electricChuchuMedium: { type: Boolean, default: false },
    fireChuchuMedium: { type: Boolean, default: false },
    iceChuchuMedium: { type: Boolean, default: false },
    chuchuMedium: { type: Boolean, default: false },
    electricChuchuSmall: { type: Boolean, default: false },
    fireChuchuSmall: { type: Boolean, default: false },
    iceChuchuSmall: { type: Boolean, default: false },
    chuchuSmall: { type: Boolean, default: false },

    blackHinox: { type: Boolean, default: false },
    blueHinox: { type: Boolean, default: false },
    hinox: { type: Boolean, default: false },

    electricKeese: { type: Boolean, default: false },
    fireKeese: { type: Boolean, default: false },
    iceKeese: { type: Boolean, default: false },
    keese: { type: Boolean, default: false },

    blackLizalfos: { type: Boolean, default: false },
    blueLizalfos: { type: Boolean, default: false },
    cursedLizalfos: { type: Boolean, default: false },
    electricLizalfos: { type: Boolean, default: false },
    fireBreathLizalfos: { type: Boolean, default: false },
    goldenLizalfos: { type: Boolean, default: false },
    iceBreathLizalfos: { type: Boolean, default: false },
    silverLizalfos: { type: Boolean, default: false },
    lizalfos: { type: Boolean, default: false },

    blueManedLynel: { type: Boolean, default: false },
    goldenLynel: { type: Boolean, default: false },
    silverLynel: { type: Boolean, default: false },
    whiteManedLynel: { type: Boolean, default: false },
    lynel: { type: Boolean, default: false },

    blackMoblin: { type: Boolean, default: false },
    blueMoblin: { type: Boolean, default: false },
    cursedMoblin: { type: Boolean, default: false },
    goldenMoblin: { type: Boolean, default: false },
    silverMoblin: { type: Boolean, default: false },
    moblin: { type: Boolean, default: false },

    molduga: { type: Boolean, default: false },
    molduking: { type: Boolean, default: false },

    forestOctorok: { type: Boolean, default: false },
    rockOctorok: { type: Boolean, default: false },
    skyOctorok: { type: Boolean, default: false },
    snowOctorok: { type: Boolean, default: false },
    treasureOctorok: { type: Boolean, default: false },
    waterOctorok: { type: Boolean, default: false },

    frostPebblit: { type: Boolean, default: false },
    igneoPebblit: { type: Boolean, default: false },
    stonePebblit: { type: Boolean, default: false },

    stalizalfos: { type: Boolean, default: false },
    stalkoblin: { type: Boolean, default: false },
    stalmoblin: { type: Boolean, default: false },
    stalnox: { type: Boolean, default: false },

    frostTalus: { type: Boolean, default: false },
    igneoTalus: { type: Boolean, default: false },
    luminousTalus: { type: Boolean, default: false },
    rareTalus: { type: Boolean, default: false },
    stoneTalus: { type: Boolean, default: false },

    blizzardWizzrobe: { type: Boolean, default: false },
    electricWizzrobe: { type: Boolean, default: false },
    fireWizzrobe: { type: Boolean, default: false },
    iceWizzrobe: { type: Boolean, default: false },
    meteoWizzrobe: { type: Boolean, default: false },
    thunderWizzrobe: { type: Boolean, default: false },

    likeLike: { type: Boolean, default: false },
    evermean: { type: Boolean, default: false },
    gibdo: { type: Boolean, default: false },
    horriblin: { type: Boolean, default: false },
    gloomHands: { type: Boolean, default: false },
    bossBokoblin: { type: Boolean, default: false },
    mothGibdo: { type: Boolean, default: false },
    littleFrox: { type: Boolean, default: false },
    yigaBlademaster: { type: Boolean, default: false },
    yigaFootsoldier: { type: Boolean, default: false },

    // Normal-tier variants for monsters (compatibility)
    normalBokoblin: { type: Boolean, default: false },
    normalGibdo: { type: Boolean, default: false },
    normalHinox: { type: Boolean, default: false },
    normalHorriblin: { type: Boolean, default: false },
    normalKeese: { type: Boolean, default: false },
    normalLizalfos: { type: Boolean, default: false },
    normalLynel: { type: Boolean, default: false },
    normalMoblin: { type: Boolean, default: false }
  },
  { collection: 'items' }
);

// ============================================================================
// Indexes
// ============================================================================
ItemSchema.index({ itemName: 1 });

// ============================================================================
// Helper Functions for Job Categorization
// ============================================================================

// Import job data from jobData to categorize jobs properly
const { jobPerks } = require('../data/jobData');

/**
 * Get all jobs that have a specific perk type
 * @param {string} perkType - The perk type to filter by (e.g., 'GATHERING', 'LOOTING', 'CRAFTING')
 * @returns {string[]} Array of job names with that perk
 */
ItemSchema.statics.getJobsByPerk = function(perkType) {
  if (!jobPerks || !Array.isArray(jobPerks)) {
    console.warn('[ItemModel.js]: jobPerks not available, returning empty array');
    return [];
  }
  
  return jobPerks
    .filter(job => job.perk && job.perk.toUpperCase().includes(perkType.toUpperCase()))
    .map(job => job.job);
};

/**
 * Get all gathering jobs (jobs with GATHERING perk)
 * @returns {string[]} Array of gathering job names
 */
ItemSchema.statics.getGatheringJobs = function() {
  return this.getJobsByPerk('GATHERING');
};

/**
 * Get all looting jobs (jobs with LOOTING perk)
 * @returns {string[]} Array of looting job names
 */
ItemSchema.statics.getLootingJobs = function() {
  return this.getJobsByPerk('LOOTING');
};

/**
 * Get all crafting jobs (jobs with CRAFTING perk)
 * @returns {string[]} Array of crafting job names
 */
ItemSchema.statics.getCraftingJobs = function() {
  return this.getJobsByPerk('CRAFTING');
};

/**
 * Get all boosting jobs (jobs with BOOST perk)
 * @returns {string[]} Array of boosting job names
 */
ItemSchema.statics.getBoostingJobs = function() {
  return this.getJobsByPerk('BOOST');
};

/**
 * Check if a specific job has a specific perk
 * @param {string} jobName - The job name to check
 * @param {string} perkType - The perk type to check for
 * @returns {boolean} True if the job has that perk
 */
ItemSchema.statics.jobHasPerk = function(jobName, perkType) {
  if (!jobPerks || !Array.isArray(jobPerks)) {
    console.warn('[ItemModel.js]: jobPerks not available, returning false');
    return false;
  }
  
  const job = jobPerks.find(j => j.job.toLowerCase() === jobName.toLowerCase());
  return job ? job.perk.toUpperCase().includes(perkType.toUpperCase()) : false;
};

/**
 * Get the perk type for a specific job
 * @param {string} jobName - The job name to get perk for
 * @returns {string|null} The perk type or null if not found
 */
ItemSchema.statics.getJobPerk = function(jobName) {
  if (!jobPerks || !Array.isArray(jobPerks)) {
    console.warn('[ItemModel.js]: jobPerks not available, returning null');
    return null;
  }
  
  const job = jobPerks.find(j => j.job.toLowerCase() === jobName.toLowerCase());
  return job ? job.perk : null;
};

// ============================================================================
// Exports
// ============================================================================
module.exports = mongoose.model('Item', ItemSchema);
