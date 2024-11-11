// mapModel.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Define Discovery Schema for the discoveries array
const DiscoverySchema = new Schema({
  type: { type: String, required: true },
  number: { type: String, required: false }
});

// Define Quadrant Schema with an array of discoveries
const QuadrantSchema = new Schema({
  quadrantId: { type: String, required: true }, // e.g., Q1, Q2, etc.
  status: { type: String, enum: ['inaccessible', 'unexplored', 'explored', 'secured'], default: 'unexplored' },
  blighted: { type: Boolean, default: false }, // Boolean field for blighted status
  discoveries: [DiscoverySchema] // Array of objects using the DiscoverySchema
});

// Define Square Schema, including image URL
const SquareSchema = new Schema({
  squareId: { type: String, required: true, unique: true }, // e.g., A1, B2, etc.
  region: { type: String, required: true },
  status: { type: String, enum: ['inaccessible', 'explorable'], required: true },
  quadrants: [QuadrantSchema],
  image: { type: String, required: true } // Field to store image URL
});

// Export as 'exploringMap' collection
module.exports = mongoose.model('Square', SquareSchema, 'exploringMap');
