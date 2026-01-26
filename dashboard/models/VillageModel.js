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

const VILLAGE_CONFIG = {
    Rudania: {
        name: 'Rudania',
        region: 'Eldin',
        color: '#d7342a',
        emoji: '<:rudania:899492917452890142>',
        materials: {
            // Balance: Level 2 Total: 800 | Level 3 Total: 1520 + 5 rare | Additional for Level 3: 720 + 5 rare
            // Core Materials
            Wood: { required: { 2: 250, 3: 500 } }, //rarity: 2
            "Goron Ore": { required: { 2: 100, 3: 200 } }, //rarity: 4
            "Gold Ore": { required: { 2: 50, 3: 50 } }, //rarity: 3
            // Support Materials
            "Spicy Pepper": { required: { 2: 75, 3: 155 } }, //rarity: 2
            "Sunshroom": { required: { 2: 80, 3: 165 } }, //rarity: 2
            "Fireproof Lizard": { required: { 2: 50, 3: 105 } }, //rarity: 2
            "Volcanic Ladybug": { required: { 2: 60, 3: 125 } }, //rarity: 2
            "Eldin Roller": { required: { 2: 40, 3: 85 } }, //rarity: 2
            "Gold Dust": { required: { 2: 30, 3: 65 } }, //rarity: 2
            "Flint": { required: { 2: 35, 3: 35 } }, //rarity: 2
            "Rock Salt": { required: { 2: 30, 3: 30 } }, //rarity: 2
            // Rare Materials (Level 3 only)
            "Dinraal's Claw": { required: { 3: 1 } }, //rarity: 10
            "Dinraal's Scale": { required: { 3: 1 } }, //rarity: 10
            "Shard of Dinraal's Fang": { required: { 3: 1 } }, //rarity: 10
            "Shard of Dinraal's Horn": { required: { 3: 1 } }, //rarity: 10
            "Goddess Plume": { required: { 3: 1 } }, //rarity: 8
        },
    },
    Inariko: {
        name: 'Inariko',
        region: 'Lanayru',
        color: '#277ecd',
        emoji: '<:inariko:899493009073274920>',
        materials: {
            // Balance: Level 2 Total: 795 | Level 3 Total: 1505 + 5 rare | Additional for Level 3: 710 + 5 rare
            // Core Materials
            Wood: { required: { 2: 250, 3: 500 } }, //rarity: 2
            "Silver Ore": { required: { 2: 200, 3: 250 } }, //rarity: 3
            "Luminous Stone": { required: { 2: 50, 3: 100 } }, //rarity: 3
            // Support Materials
            "Silent Princess": { required: { 2: 45, 3: 90 } }, //rarity: 2
            "Blue Nightshade": { required: { 2: 60, 3: 125 } }, //rarity: 2
            "Sneaky River Snail": { required: { 2: 50, 3: 105 } }, //rarity: 2
            "Hyrule Bass": { required: { 2: 40, 3: 85 } }, //rarity: 3
            "Lanayru Ant": { required: { 2: 45, 3: 95 } }, //rarity: 2
            "Fleet-Lotus Seeds": { required: { 2: 55, 3: 120 } }, //rarity: 2
            // Support Materials (Level 3 only)
            "Staminoka Bass": { required: { 3: 30 } }, //rarity: 3
            // Rare Materials (Level 3 only)
            "Naydra's Claw": { required: { 3: 1 } }, //rarity: 10
            "Naydra's Scale": { required: { 3: 1 } }, //rarity: 10
            "Shard of Naydra's Fang": { required: { 3: 1 } }, //rarity: 10
            "Shard of Naydra's Horn": { required: { 3: 1 } }, //rarity: 10
            "Goddess Plume": { required: { 3: 1 } }, //rarity: 8
        },
    },
    Vhintl: {
        name: 'Vhintl',
        region: 'Faron',
        color: '#25c059',
        emoji: '<:vhintl:899492879205007450>',
        materials: {
            // Balance: Level 2 Total: 810 | Level 3 Total: 1525 + 5 rare | Additional for Level 3: 715 + 5 rare
            // Core Materials
            Wood: { required: { 2: 250, 3: 500 } }, //rarity: 2
            "Tree Branch": { required: { 2: 150, 3: 200 } }, //rarity: 3
            "Korok Leaf": { required: { 2: 50, 3: 100 } }, //rarity: 3
            // Support Materials
            "Mighty Bananas": { required: { 2: 55, 3: 110 } }, //rarity: 2
            "Palm Fruit": { required: { 2: 50, 3: 100 } }, //rarity: 2
            "Hydromelon": { required: { 2: 45, 3: 90 } }, //rarity: 2
            "Voltfruit": { required: { 2: 40, 3: 80 } }, //rarity: 2
            "Faron Grasshopper": { required: { 2: 35, 3: 70 } }, //rarity: 2
            "Deku Hornet": { required: { 2: 30, 3: 60 } }, //rarity: 2
            "Spider Silk": { required: { 2: 25, 3: 50 } }, //rarity: 2
            "Kelp": { required: { 2: 35, 3: 70 } }, //rarity: 2
            "Thornberry": { required: { 2: 45, 3: 90 } }, //rarity: 2
            // Rare Materials (Level 3 only)
            "Farosh's Claw": { required: { 3: 1 } }, //rarity: 10
            "Farosh's Scale": { required: { 3: 1 } }, //rarity: 10
            "Shard of Farosh's Fang": { required: { 3: 1 } }, //rarity: 10
            "Shard of Farosh's Horn": { required: { 3: 1 } }, //rarity: 10
            "Goddess Plume": { required: { 3: 1 } }, //rarity: 8
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
    raidQuotaPeriodStart: {
        type: Date,
        default: null,
    },
    raidQuotaCount: {
        type: Number,
        default: 0,
    },
    raidQuotaPeriodType: {
        type: String,
        enum: ['week', 'month'],
        default: null,
    },
    lastQuotaRaidTime: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

// ============================================================================
// ---- Model Creation ----
// ============================================================================
const Village = mongoose.models.Village || mongoose.model('Village', VillageSchema);

// ============================================================================
// ---- Exports ----
// ============================================================================
module.exports = { 
    Village,
    VILLAGE_CONFIG,
    DEFAULT_HEALTH,
    DEFAULT_TOKEN_REQUIREMENTS
};
