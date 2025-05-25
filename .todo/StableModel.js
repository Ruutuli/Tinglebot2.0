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
    },
    storageLocation: {
      type: String,
      default: null
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
    },
    storageLocation: {
      type: String,
      default: null
    }
  }],
  maxSlots: {
    type: Number,
    default: 3
  }
}, { timestamps: true });

// ------------------- Define For Sale Mount Schema -------------------
const ForSaleMountSchema = new mongoose.Schema({
  // Mount data
  species: { type: String, required: true },
  level: { type: String, required: true },
  name: { type: String, required: true },
  fee: { type: Number, required: true, default: 0 },
  stamina: { type: Number, required: true },
  currentStamina: { type: Number },
  traits: { type: [String], default: [] },
  region: { type: String },
  lastMountTravel: { type: Date },
  imageUrl: { type: String, default: '' },
  
  // Owner information
  ownerName: { type: String, required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', required: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character' },
  discordId: { type: String, required: true },
  
  // Sale data
  price: { type: Number, required: true },
  isSold: { type: Boolean, default: false },
  listedAt: { type: Date, default: Date.now },
  soldAt: { type: Date }
}, { timestamps: true });

// ------------------- Define For Sale Pet Schema -------------------
const ForSalePetSchema = new mongoose.Schema({
  // Pet data
  name: { type: String, required: true },
  species: { type: String, required: true },
  petType: { type: String, required: true },
  level: { type: Number, default: 0 },
  rollsRemaining: { type: Number, default: 0 },
  rollCombination: { type: [String], default: [] },
  tableDescription: { type: String, default: '' },
  lastRollDate: { type: Date },
  imageUrl: { type: String, default: '' },
  
  // Owner information
  ownerName: { type: String, required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', required: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character' },
  discordId: { type: String, required: true },
  
  // Sale data
  price: { type: Number, required: true },
  isSold: { type: Boolean, default: false },
  listedAt: { type: Date, default: Date.now },
  soldAt: { type: Date }
}, { timestamps: true });

// Add indexes for faster queries
StableSchema.index({ characterId: 1 });
StableSchema.index({ discordId: 1 });
ForSaleMountSchema.index({ isSold: 1 });
ForSaleMountSchema.index({ discordId: 1 });
ForSalePetSchema.index({ isSold: 1 });
ForSalePetSchema.index({ discordId: 1 });

// ------------------- Export Models -------------------
module.exports = {
  Stable: mongoose.model('Stable', StableSchema),
  ForSaleMount: mongoose.model('ForSaleMount', ForSaleMountSchema),
  ForSalePet: mongoose.model('ForSalePet', ForSalePetSchema)
};
