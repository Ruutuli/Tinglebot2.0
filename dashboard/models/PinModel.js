/**
 * Pin Model - Database schema for user-created map pins
 * Handles user-created location markers with authentication and permissions
 */

const mongoose = require('mongoose');

const pinSchema = new mongoose.Schema({
  // Pin identification
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },
  
  // Location data
  coordinates: {
    lat: {
      type: Number,
      required: true,
      min: 0,
      max: 20000
    },
    lng: {
      type: Number,
      required: true,
      min: 0,
      max: 24000
    }
  },
  
  // Grid location for display
  gridLocation: {
    type: String,
    required: true,
    match: /^[A-J]([1-9]|1[0-2])$/
  },
  
  // Pin appearance
  icon: {
    type: String,
    default: 'fas fa-map-marker-alt',
    maxlength: 50
  },
  
  color: {
    type: String,
    default: '#00A3DA',
    match: /^#[0-9A-Fa-f]{6}$/
  },
  
  category: {
    type: String,
    enum: ['homes', 'farms', 'shops', 'points-of-interest'],
    default: 'homes'
  },
  
  // User ownership and permissions
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  discordId: {
    type: String,
    required: true,
    index: true
  },
  
  // Visibility settings
  isPublic: {
    type: Boolean,
    default: true
  },

  // Optional character tag (user's character this pin is associated with)
  character: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Character',
    default: null
  },
  
  // Image attachment
  imageUrl: {
    type: String,
    default: null
  },

  // When pin was created from "Report to town hall" (explore), links back to the discovery
  sourceDiscoveryKey: {
    type: String,
    default: null
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
pinSchema.index({ createdBy: 1, createdAt: -1 });
pinSchema.index({ gridLocation: 1 });
pinSchema.index({ category: 1 });
pinSchema.index({ isPublic: 1 });

// Virtual for user info
pinSchema.virtual('creator', {
  ref: 'User',
  localField: 'createdBy',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to update grid location
pinSchema.pre('save', function(next) {
  // Always calculate grid location if coordinates exist
  if (this.coordinates && this.coordinates.lat !== undefined && this.coordinates.lng !== undefined) {
    this.gridLocation = this.calculateGridLocation();
  }
  next();
});

// Method to calculate grid location from coordinates
pinSchema.methods.calculateGridLocation = function() {
  const { lat, lng } = this.coordinates;
  
  // Convert custom coordinates to grid coordinates (A1-J12 system)
  // Canvas: 24000x20000, Grid: 10x12 squares (2400x1666 each)
  const colIndex = Math.floor(lng / 2400); // 0-9 for A-J
  const rowIndex = Math.floor(lat / 1666); // 0-11 for 1-12
  
  // Clamp to valid ranges
  const clampedColIndex = Math.max(0, Math.min(9, colIndex));
  const clampedRowIndex = Math.max(0, Math.min(11, rowIndex));
  
  // Convert to grid notation
  const col = String.fromCharCode(65 + clampedColIndex); // A-J
  const row = clampedRowIndex + 1; // 1-12
  
  return col + row;
};

// Method to check if user can edit/delete this pin
pinSchema.methods.canUserModify = function(userDiscordId) {
  return this.discordId === userDiscordId;
};

// Static method to get pins for a user (returns plain objects via .lean())
// Does not populate 'creator' to avoid requiring User model in API route (Next.js can load models in different order).
pinSchema.statics.getUserPins = function(discordId, includePublic = true) {
  const query = includePublic 
    ? { $or: [{ discordId }, { isPublic: true }] }
    : { discordId };
    
  return this.find(query)
    .populate('character', 'name')
    .sort({ createdAt: -1 })
    .lean();
};

// Static method to get pins by grid location
pinSchema.statics.getPinsByLocation = function(gridLocation) {
  return this.find({ gridLocation, isPublic: true })
    .populate('creator', 'discordId')
    .sort({ createdAt: -1 });
};

// Static method to get pins by category
pinSchema.statics.getPinsByCategory = function(category, includePublic = true) {
  const query = includePublic 
    ? { category, $or: [{ isPublic: true }] }
    : { category };
    
  return this.find(query)
    .populate('creator', 'discordId')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.models.Pin || mongoose.model('Pin', pinSchema);
