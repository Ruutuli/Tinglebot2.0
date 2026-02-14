// mapModel.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define Discovery Schema for the discoveries array
const DiscoverySchema = new Schema({
  type: { type: String, required: true },
  number: { type: String, required: false },
  discoveredBy: { type: String, default: '' }, // Discord ID of discoverer
  discoveredAt: { type: Date, default: Date.now },
  discoveryKey: { type: String, default: null }, // outcome|square|quadrant|at ISO — matches party progressLog for "Report to town hall"
  pinned: { type: Boolean, default: false },
  pinnedAt: { type: Date, default: null },
  pinId: { type: String, default: null } // Pin _id when discovery was pinned on the map
});

// Define Quadrant Schema with an array of discoveries
const QuadrantSchema = new Schema({
  quadrantId: { type: String, required: true }, // e.g., Q1, Q2, etc.
  status: { type: String, enum: ['inaccessible', 'unexplored', 'explored', 'secured'], default: 'unexplored' },
  blighted: { type: Boolean, default: false }, // Boolean field for blighted status
  discoveries: [DiscoverySchema], // Array of objects using the DiscoverySchema
  exploredBy: { type: String, default: '' }, // Discord ID of explorer
  exploredAt: { type: Date, default: null },
  // Old map location: when a party reaches this quadrant, prompt if someone has Map #N
  oldMapNumber: { type: Number, default: null },
  oldMapLeadsTo: { type: String, default: null }, // 'chest' | 'ruins' | 'relic' | 'shrine'
  // Ruin-rest: when a party found a camp spot in ruins here, future visits auto-recover this much stamina
  ruinRestStamina: { type: Number, default: null }
});

// Define Square Schema, including image URL and map coordinates
const SquareSchema = new Schema({
  squareId: { type: String, required: true, unique: true }, // e.g., A1, B2, etc.
  region: { type: String, required: true },
  status: { type: String, enum: ['inaccessible', 'explorable'], required: true },
  quadrants: [QuadrantSchema],
  image: { type: String, required: true }, // Field to store base map image URL
  pathImageUrl: { type: String, default: null }, // Single source of truth for current path image per square (uploaded from expeditions); used for download, map display, and quadrant resolution

  // Interactive map coordinates
  mapCoordinates: {
    center: {
      lat: { type: Number, default: 0 },
      lng: { type: Number, default: 0 }
    },
    bounds: {
      north: { type: Number, default: 0 },
      south: { type: Number, default: 0 },
      east: { type: Number, default: 0 },
      west: { type: Number, default: 0 }
    }
  },
  
  // Map display properties
  displayProperties: {
    visible: { type: Boolean, default: true },
    opacity: { type: Number, default: 1, min: 0, max: 1 },
    zIndex: { type: Number, default: 0 }
  },
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update timestamp before saving
SquareSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static methods for map functionality
SquareSchema.statics.getVisibleSquares = function() {
  return this.find({ 'displayProperties.visible': true }).sort({ 'displayProperties.zIndex': 1, squareId: 1 });
};

SquareSchema.statics.getByRegion = function(region) {
  return this.find({ region: region, 'displayProperties.visible': true }).sort({ squareId: 1 });
};

SquareSchema.statics.getExploredSquares = function() {
  return this.find({ 
    'quadrants.status': { $in: ['explored', 'secured'] },
    'displayProperties.visible': true 
  }).sort({ squareId: 1 });
};

SquareSchema.statics.getBlightedSquares = function() {
  return this.find({ 
    'quadrants.blighted': true,
    'displayProperties.visible': true 
  }).sort({ squareId: 1 });
};

// Instance methods
SquareSchema.methods.getTotalDiscoveries = function() {
  let total = 0;
  this.quadrants.forEach(quadrant => {
    total += quadrant.discoveries.length;
  });
  return total;
};

SquareSchema.methods.getExplorationProgress = function() {
  const totalQuadrants = this.quadrants.length;
  const exploredQuadrants = this.quadrants.filter(q => 
    q.status === 'explored' || q.status === 'secured'
  ).length;
  
  return {
    explored: exploredQuadrants,
    total: totalQuadrants,
    percentage: totalQuadrants > 0 ? Math.round((exploredQuadrants / totalQuadrants) * 100) : 0
  };
};

// Export as 'exploringMap' collection (reuse if already compiled to avoid OverwriteModelError)
module.exports = mongoose.models.Square || mongoose.model('Square', SquareSchema, 'exploringMap');
