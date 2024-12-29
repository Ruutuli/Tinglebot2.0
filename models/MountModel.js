const mongoose = require('mongoose');

// ------------------- Define the Mount Schema -------------------
const MountSchema = new mongoose.Schema({
  discordId: { // Replacing memberId with discordId
    type: String, // Discord ID should be stored as a string
    required: true
  },
  characterId: { // Character's ID, stored as a string
    type: mongoose.Schema.Types.ObjectId, // Use ObjectId for referencing character
    ref: 'Character',
    required: true
  },
  species: {
    type: String,
    required: true,
    enum: ['Horse', 'Donkey', 'Ostrich', 'M.Goat', 'Deer', 'Bullbo', 'W.Buffalo', 'Wolfos', 'Dodongo', 'Moose', 'Bear', 'Unique'], // Example species list
  },
  level: {
    type: String,
    required: true,
    enum: ['Basic', 'Mid', 'High', 'Legendary'], // The defined levels
  },
  name: {
    type: String,
    required: true
  },
  fee: {
    type: Number,
    required: true,
    default: 0
  },
  stamina: {
    type: Number,
    required: true,
    min: 1,
    max: 6  // As defined by the mount's possible stamina levels
  },
  owner: {
    type: String,
    required: true
  },
  traits: {
    type: [String], // Mount traits like "Rare Color", "Solid Coat" can be stored here
    default: []
  },
  region: {
    type: String,
    required: false,
    enum: ['Rudania', 'Inariko', 'Vhintl', 'Global'] // Example regions
  },
  isStored: { // Tracks if the mount is in storage
    type: Boolean,
    default: false
  },
  storageLocation: { // Specifies where the mount is stored
    type: String,
    default: null
  },
  storedAt: { // Timestamp for when the mount was stored
    type: Date,
    default: null
  },
  removedFromStorageAt: { // Timestamp for when the mount was removed from storage
    type: Date,
    default: null
  }
}, { timestamps: true }); // Include timestamps for creation and updates

// ------------------- Export the Mount Model -------------------
module.exports = mongoose.model('Mount', MountSchema);
