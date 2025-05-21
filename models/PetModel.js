// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Define Pet Schema -------------------

const PetSchema = new Schema({
  ownerName: { type: String, required: true },
  name: { type: String, required: true },
  species: { type: String, required: true },
  petType: { type: String, required: true },
  level: { type: Number, default: 0 },
  rollsRemaining: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'stored', 'listed'], default: 'active' },
  owner: { type: Schema.Types.ObjectId, ref: 'Character', required: true },
  imageUrl: { type: String, default: '' },
  rollCombination: { type: [String], default: [] },   
  tableDescription: { type: String, default: '' },
  lastRollDate: { type: Date, default: null }       
}, {
  timestamps: true 
});

// Add compound unique index for name and owner
PetSchema.index({ name: 1, owner: 1 }, { unique: true });

// ------------------- Export the Pet Model -------------------
const Pet = mongoose.model('Pet', PetSchema);
module.exports = Pet;
module.exports.PetSchema = PetSchema;
