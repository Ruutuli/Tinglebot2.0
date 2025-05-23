// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Define Pet Schema -------------------

const PetSchema = new Schema({
  // Basic pet information
  name: { type: String, required: true },
  species: { type: String, required: true },
  petType: { type: String, required: true },
  level: { type: Number, default: 0 },
  
  // Owner information
  ownerName: { type: String, required: true },
  owner: { type: Schema.Types.ObjectId, ref: 'Character', required: true },
  discordId: { type: String, required: true },
  
  // Status and storage
  status: { 
    type: String, 
    enum: ['active', 'stored', 'retired', 'for_sale'], 
    default: 'active' 
  },
  storageLocation: { type: String, default: null },
  storedAt: { type: Date, default: null },
  removedFromStorageAt: { type: Date, default: null },
  
  // Pet-specific attributes
  rollsRemaining: { type: Number, default: 0 },
  rollCombination: { type: [String], default: [] },
  tableDescription: { type: String, default: '' },
  lastRollDate: { type: Date, default: null },
  imageUrl: { type: String, default: '' }
}, {
  timestamps: true 
});

// Add compound unique index for name and owner
PetSchema.index({ name: 1, owner: 1 }, { unique: true });
PetSchema.index({ discordId: 1 });

// ------------------- Export the Pet Model -------------------
const Pet = mongoose.model('Pet', PetSchema);
module.exports = Pet;
module.exports.PetSchema = PetSchema;
