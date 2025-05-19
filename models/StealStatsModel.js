const mongoose = require('mongoose');

const stealStatsSchema = new mongoose.Schema({
    characterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Character',
        required: true,
        unique: true
    },
    totalAttempts: {
        type: Number,
        default: 0
    },
    successfulSteals: {
        type: Number,
        default: 0
    },
    failedSteals: {
        type: Number,
        default: 0
    },
    itemsByRarity: {
        common: {
            type: Number,
            default: 0
        },
        uncommon: {
            type: Number,
            default: 0
        },
        rare: {
            type: Number,
            default: 0
        }
    },
    victims: [{
        characterId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Character'
        },
        characterName: String,
        count: {
            type: Number,
            default: 1
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('StealStats', stealStatsSchema); 