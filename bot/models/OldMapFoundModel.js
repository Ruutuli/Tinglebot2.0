// ============================================================================
// OldMapFound Model - Stores old maps found during exploration (outside inventory)
// ============================================================================
// Maps are stored here instead of the Item/inventory system to avoid polluting
// the item database and random loot tables. Can be surfaced in inventory view later.
// ============================================================================

const mongoose = require('mongoose');
const { Schema } = mongoose;

const OldMapFoundSchema = new Schema({
  characterName: { type: String, required: true, index: true },
  mapNumber: { type: Number, required: true, min: 1, max: 46 },
  foundAt: { type: Date, default: Date.now },
  locationFound: { type: String, default: '' },
}, { collection: 'oldMapsFound' });

OldMapFoundSchema.index({ characterName: 1, mapNumber: 1 });

module.exports = mongoose.model('OldMapFound', OldMapFoundSchema);
