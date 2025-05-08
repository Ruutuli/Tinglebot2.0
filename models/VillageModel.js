// ------------------- Import Mongoose -------------------
const mongoose = require('mongoose');

const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Define Village Schema -------------------
const VillageSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
  },
  region: {
    type: String,
    required: true,
  },
  color: {
    type: String,
    required: true,
  },
  emoji: {
    type: String,
    required: true,
  },
  health: {
    type: Number,
    default: 100, // Default health value
  },
  level: {
    type: Number,
    default: 1, // Default starting level
  },
  materials: {
    type: Map,
    of: Object, // Key-value pairs of material names with current and required amounts
    default: {}, // Material specifics are set during initialization
  },
  tokenRequirements: {
    type: Map,
    of: Number,
    default: { 2: 10000, 3: 50000 },
  },
  currentTokens: {
    type: Number,
    default: 0, // Tracks tokens currently contributed
  },
  levelHealth: {
    type: Map,
    of: Number,
    default: { 1: 100, 2: 200, 3: 300 }, // Updated health values per level
  },
  // New fields for raid protection and repair
  raidProtection: {
    type: Map,
    of: Boolean,
    default: { 1: false, 2: true, 3: true }, // Level 2+ has raid protection
  },
  bloodMoonProtection: {
    type: Map,
    of: Boolean,
    default: { 1: false, 2: false, 3: true }, // Only level 3 has blood moon protection
  },
  // Track lost resources during damage
  lostResources: {
    type: Map,
    of: Object,
    default: {},
  },
  // Track repair progress
  repairProgress: {
    type: Map,
    of: Object,
    default: {},
  },
  // Track contributors
  contributors: {
    type: Map,
    of: Object,
    default: {},
  },
  // Track cooldowns
  cooldowns: {
    type: Map,
    of: Date,
    default: {},
  },
  // Vending tier and discounts
  vendingTier: {
    type: Number,
    default: 1,
  },
  vendingDiscount: {
    type: Number,
    default: 0, // Percentage discount
  },
  // Status tracking
  status: {
    type: String,
    enum: ['upgradable', 'damaged', 'max'],
    default: 'upgradable',
  },
  // Last damage timestamp
  lastDamageTime: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

// ------------------- Create Village Model -------------------
const Village = mongoose.model('Village', VillageSchema);

// ------------------- Utility Functions -------------------

// Function to initialize villages in the database
const initializeVillages = async () => {
  const villages = [
    {
      name: 'Rudania',
      region: 'Eldin',
      color: '#d7342a',
      emoji: '<:rudania:899492917452890142>',
      materials: {
        Wood: { current: 0, required: { 2: 250, 3: 500 } },
        "Eldin Ore": { current: 0, required: { 2: 200, 3: 250 } },
        "Goron Ore": { current: 0, required: { 2: 100, 3: 200 } },
        "Fancy Fabric": { current: 0, required: { 3: 50 } },
        "Dinraal's Claw": { current: 0, required: { 3: 1 } },
        "Shard of Dinraal's Fang": { current: 0, required: { 3: 1 } },
        "Shard of Dinraal's Horn": { current: 0, required: { 3: 1 } },
        "Goddess Plume": { current: 0, required: { 3: 1 } },
      },
    },
    {
      name: 'Inariko',
      region: 'Lanayru',
      color: '#277ecd',
      emoji: '<:inariko:899493009073274920>',
      materials: {
        Wood: { current: 0, required: { 2: 250, 3: 500 } },
        "Silver Ore": { current: 0, required: { 2: 200, 3: 250 } },
        "Luminous Stone": { current: 0, required: { 3: 100 } },
        "Silver Thread": { current: 0, required: { 2: 50, 3: 50 } },
        "Naydra's Claw": { current: 0, required: { 3: 1 } },
        "Shard of Naydra's Fang": { current: 0, required: { 3: 1 } },
        "Shard of Naydra's Horn": { current: 0, required: { 3: 1 } },
        "Goddess Plume": { current: 0, required: { 3: 1 } },
      },
    },
    {
      name: 'Vhintl',
      region: 'Faron',
      color: '#25c059',
      emoji: '<:vhintl:899492879205007450>',
      materials: {
        Wood: { current: 0, required: { 2: 250, 3: 500 } },
        "Tree Branch": { current: 0, required: { 2: 200, 3: 250 } },
        "Korok Leaf": { current: 0, required: { 2: 50, 3: 100 } },
        "Vintage Linen": { current: 0, required: { 3: 50 } },
        "Farosh's Claw": { current: 0, required: { 3: 1 } },
        "Shard of Farosh's Fang": { current: 0, required: { 3: 1 } },
        "Shard of Farosh's Horn": { current: 0, required: { 3: 1 } },
        "Goddess Plume": { current: 0, required: { 3: 1 } },
      },
    },
  ];

  for (const village of villages) {
    try {
      const existingVillage = await Village.findOne({ name: village.name });
      if (!existingVillage) {
        await Village.create(village);
        console.log(`✅ Initialized village: ${village.name}`);
      } else {
        console.log(`ℹ️ Village already exists: ${village.name}`);
      }
    } catch (error) {
      handleError(error, 'VillageModel.js');
      console.error(`❌ Error initializing village: ${village.name}`, error);
    }
  }
};

// ------------------- Export Village Model and Initializer -------------------
module.exports = { Village, initializeVillages };
