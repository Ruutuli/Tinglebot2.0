const mongoose = require('mongoose');
// ------------------- Define Stable Schema -------------------
const StableSchema = new mongoose.Schema({
  characterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Character',
    required: true
  },
  discordId: {
    type: String,
    required: true
  },
  // Storage slots for active mounts/pets
  storedMounts: [{
    mountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mount'
    },
    storedAt: {
      type: Date,
      default: Date.now
    }
  }],
  storedPets: [{
    petId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pet'
    },
    storedAt: {
      type: Date,
      default: Date.now
    }
  }],
  maxSlots: {
    type: Number,
    default: 3
  },
  // Sales listings
  listedMounts: [{
    mountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Mount',
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    isSold: {
      type: Boolean,
      default: false
    },
    listedAt: {
      type: Date,
      default: Date.now
    },
    soldAt: {
      type: Date
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    originalOwner: {
      type: String,
      required: true
    }
  }],
  listedPets: [{
    petId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Pet',
      required: true
    },
    price: {
      type: Number,
      required: true
    },
    isSold: {
      type: Boolean,
      default: false
    },
    listedAt: {
      type: Date,
      default: Date.now
    },
    soldAt: {
      type: Date
    },
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    originalOwner: {
      type: String,
      required: true
    }
  }]
}, { timestamps: true });

// Add indexes for faster queries
StableSchema.index({ characterId: 1 });
StableSchema.index({ discordId: 1 });
StableSchema.index({ 'listedMounts.isSold': 1 });
StableSchema.index({ 'listedPets.isSold': 1 });

// ------------------- Export Stable Model -------------------
module.exports = mongoose.model('Stable', StableSchema);
