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
  }
}, { timestamps: true });

// ------------------- Define Listed Mount Schema -------------------
const ListedMountSchema = new mongoose.Schema({
  // Mount data
  species: { type: String, required: true },
  level: { type: String, required: true },
  name: { type: String, required: true },
  fee: { type: Number, required: true, default: 0 },
  stamina: { type: Number, required: true },
  traits: { type: [String], default: [] },
  region: { type: String },
  currentStamina: { type: Number },
  lastMountTravel: { type: Date },
  // Listing data
  price: { type: Number, required: true },
  isSold: { type: Boolean, default: false },
  listedAt: { type: Date, default: Date.now },
  soldAt: { type: Date },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', required: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character' },
  originalOwner: { type: String, required: true }
}, { timestamps: true });

// ------------------- Define Listed Pet Schema -------------------
const ListedPetSchema = new mongoose.Schema({
  // Pet data
  name: { type: String, required: true },
  species: { type: String, required: true },
  petType: { type: String, required: true },
  level: { type: Number, default: 0 },
  rollsRemaining: { type: Number, default: 0 },
  imageUrl: { type: String, default: '' },
  rollCombination: { type: [String], default: [] },
  tableDescription: { type: String, default: '' },
  lastRollDate: { type: Date },
  // Listing data
  price: { type: Number, required: true },
  isSold: { type: Boolean, default: false },
  listedAt: { type: Date, default: Date.now },
  soldAt: { type: Date },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character', required: true },
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character' },
  originalOwner: { type: String, required: true }
}, { timestamps: true });

// Add indexes for faster queries
StableSchema.index({ characterId: 1 });
StableSchema.index({ discordId: 1 });
ListedMountSchema.index({ isSold: 1 });
ListedPetSchema.index({ isSold: 1 });

// ------------------- Export Models -------------------
module.exports = {
  Stable: mongoose.model('Stable', StableSchema),
  ListedMount: mongoose.model('ListedMount', ListedMountSchema),
  ListedPet: mongoose.model('ListedPet', ListedPetSchema)
};
