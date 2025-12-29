// ============================================================================
// ------------------- General Item Model -------------------
// Schema for storing general category items (like "Any Seafood", "Any Fish", etc.)
// ============================================================================

const mongoose = require('mongoose');

const GeneralItemSchema = new mongoose.Schema({
  itemName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  validItems: [{
    type: String,
    required: true,
    trim: true
  }],
  description: {
    type: String,
    default: "A general category item that can be substituted with any of its valid items."
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt timestamp before saving
GeneralItemSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Create the model
const GeneralItemModel = mongoose.model('GeneralItem', GeneralItemSchema);

module.exports = GeneralItemModel; 