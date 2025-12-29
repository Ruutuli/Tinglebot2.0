// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const mongoose = require('mongoose');

// ============================================================================
// ---- Constants ----
// ============================================================================
const DEFAULT_HEALTH = {
    1: 100,
    2: 200,
    3: 300
};

const DEFAULT_TOKEN_REQUIREMENTS = {
    2: 10000,
    3: 50000
};

const DEFAULT_RAID_PROTECTION = {
    1: false,
    2: true,
    3: true
};

const DEFAULT_BLOOD_MOON_PROTECTION = {
    1: false,
    2: false,
    3: true
};

const VILLAGE_CONFIG = {
    Rudania: {
        name: 'Rudania',
        region: 'Eldin',
        color: '#d7342a',
        emoji: '<:rudania:899492917452890142>',
        materials: {
            Wood: { required: { 2: 250, 3: 500 } },
            "Eldin Ore": { required: { 2: 200, 3: 250 } },
            "Goron Ore": { required: { 2: 100, 3: 200 } },
            "Fancy Fabric": { required: { 3: 50 } },
            "Dinraal's Claw": { required: { 3: 1 } },
            "Shard of Dinraal's Fang": { required: { 3: 1 } },
            "Shard of Dinraal's Horn": { required: { 3: 1 } },
            "Goddess Plume": { required: { 3: 1 } },
        },
    },
    Inariko: {
        name: 'Inariko',
        region: 'Lanayru',
        color: '#277ecd',
        emoji: '<:inariko:899493009073274920>',
        materials: {
            Wood: { required: { 2: 250, 3: 500 } },
            "Silver Ore": { required: { 2: 200, 3: 250 } },
            "Luminous Stone": { required: { 3: 100 } },
            "Silver Thread": { required: { 2: 50, 3: 50 } },
            "Naydra's Claw": { required: { 3: 1 } },
            "Shard of Naydra's Fang": { required: { 3: 1 } },
            "Shard of Naydra's Horn": { required: { 3: 1 } },
            "Goddess Plume": { required: { 3: 1 } },
        },
    },
    Vhintl: {
        name: 'Vhintl',
        region: 'Faron',
        color: '#25c059',
        emoji: '<:vhintl:899492879205007450>',
        materials: {
            Wood: { required: { 2: 250, 3: 500 } },
            "Tree Branch": { required: { 2: 200, 3: 250 } },
            "Korok Leaf": { required: { 2: 50, 3: 100 } },
            "Vintage Linen": { required: { 3: 50 } },
            "Farosh's Claw": { required: { 3: 1 } },
            "Shard of Farosh's Fang": { required: { 3: 1 } },
            "Shard of Farosh's Horn": { required: { 3: 1 } },
            "Goddess Plume": { required: { 3: 1 } },
        },
    },
};

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
// ---- Exports ----
// ============================================================================
module.exports = { 
    Village,
    VILLAGE_CONFIG,
    DEFAULT_HEALTH,
    DEFAULT_TOKEN_REQUIREMENTS,
    DEFAULT_RAID_PROTECTION,
    DEFAULT_BLOOD_MOON_PROTECTION
};
