// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const mongoose = require('mongoose');

// ============================================================================
// ---- Utility Functions ----
// ============================================================================
const { handleError } = require('../utils/globalErrorHandler');

// ============================================================================
// ---- Imports ----
// ============================================================================
const { 
    VILLAGE_CONFIG,
    DEFAULT_HEALTH,
    DEFAULT_TOKEN_REQUIREMENTS,
    DEFAULT_RAID_PROTECTION,
    DEFAULT_BLOOD_MOON_PROTECTION
} = require('../modules/villageModule');

// ============================================================================
// ---- Schema Definition ----
// ============================================================================
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
        default: DEFAULT_HEALTH[1],
    },
    level: {
        type: Number,
        default: 1,
    },
    materials: {
        type: Map,
        of: Object,
        default: {},
    },
    tokenRequirements: {
        type: Map,
        of: Number,
        default: DEFAULT_TOKEN_REQUIREMENTS,
    },
    currentTokens: {
        type: Number,
        default: 0,
    },
    levelHealth: {
        type: Map,
        of: Number,
        default: DEFAULT_HEALTH,
    },
    raidProtection: {
        type: Map,
        of: Boolean,
        default: DEFAULT_RAID_PROTECTION,
    },
    bloodMoonProtection: {
        type: Map,
        of: Boolean,
        default: DEFAULT_BLOOD_MOON_PROTECTION,
    },
    lostResources: {
        type: Map,
        of: Object,
        default: {},
    },
    repairProgress: {
        type: Map,
        of: Object,
        default: {},
    },
    contributors: {
        type: Map,
        of: Object,
        default: {},
    },
    cooldowns: {
        type: Map,
        of: Date,
        default: {},
    },
    vendingTier: {
        type: Number,
        default: 1,
    },
    vendingDiscount: {
        type: Number,
        default: 0,
    },
    status: {
        type: String,
        enum: ['upgradable', 'damaged', 'max'],
        default: 'upgradable',
    },
    lastDamageTime: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

// ============================================================================
// ---- Model Creation ----
// ============================================================================
const Village = mongoose.model('Village', VillageSchema);

// ============================================================================
// ---- Initialization Functions ----
// ============================================================================

// ---- Function: initializeVillages ----
// Initializes all villages in the database with default values
const initializeVillages = async () => {
    for (const village of VILLAGE_CONFIG) {
        try {
            const existingVillage = await Village.findOne({ name: village.name });
            if (!existingVillage) {
                await Village.create(village);
                console.log(`[VillageModel.js] ✅ Initialized village: ${village.name}`);
            } else {
                console.log(`[VillageModel.js] ℹ️ Village already exists: ${village.name}`);
            }
        } catch (error) {
            handleError(error, 'VillageModel.js');
            console.error(`[VillageModel.js] ❌ Error initializing village: ${village.name}`, error);
        }
    }
};

// ============================================================================
// ---- Exports ----
// ============================================================================
module.exports = { Village, initializeVillages };
