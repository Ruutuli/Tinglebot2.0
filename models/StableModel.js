const mongoose = require('mongoose');

// ------------------- Define Stable Schema -------------------
const StableSchema = new mongoose.Schema({
  mountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mount', // Reference to the original mount in the MountModel
    required: true,
  },
  price: {
    type: Number, // Price of the mount
    required: true,
  },
  isSold: {
    type: Boolean,
    default: false, // Tracks whether the mount has been purchased
  },
  listedAt: {
    type: Date,
    default: Date.now, // Timestamp when the mount was listed for sale
  },
  soldAt: {
    type: Date, // Timestamp when the mount was sold
  },
  sellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the user who listed the mount
  },
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Reference to the user who purchased the mount
  },
  originalOwner: {
    type: String, // Track the original character that owned the mount
    required: true,
  },
  // ------------------- Detailed Mount Info -------------------
  species: {
    type: String,
    required: true,
    enum: ['Horse', 'Donkey', 'Ostrich', 'M.Goat', 'Deer', 'Bullbo', 'W.Buffalo', 'Wolfos', 'Dodongo', 'Moose', 'Bear', 'Unique'],
  },
  level: {
    type: String,
    required: true,
    enum: ['Basic', 'Mid', 'High', 'Legendary'],
  },
  name: {
    type: String,
    required: true,
  },
  stamina: {
    type: Number,
    required: true,
    min: 1,
    max: 6,
  },
  traits: {
    type: [String],
    default: [],
  },
  region: {
    type: String,
    required: false,
    enum: ['Rudania', 'Inariko', 'Vhintl', 'Global'],
  },
}, { timestamps: true });

// ------------------- Export Stable Model -------------------
module.exports = mongoose.model('Stable', StableSchema);
