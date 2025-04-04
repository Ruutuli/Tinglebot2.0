const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Relic Schema -------------------
const RelicSchema = new Schema({
  // ------------------- Identification -------------------
  name: { type: String, required: true }, // Internal relic name
  emoji: { type: String, default: '🔸' }, // Optional emoji
  unique: { type: Boolean, default: false }, // True if this is a one-of-a-kind relic
  duplicateOf: { type: Schema.Types.ObjectId, ref: 'Relic', default: null }, // Reference if duplicate

  // ------------------- Discovery Info -------------------
  discoveredBy: { type: String, default: '' }, // Character who found it
  discoveredDate: { type: Date, default: null }, // Date discovered
  locationFound: { type: String, default: '' }, // Optional quadrant/ruin/etc

  // ------------------- Appraisal Info -------------------
  appraised: { type: Boolean, default: false }, // Whether it's been appraised
  appraisedBy: { type: String, default: null }, // Name of the appraising character or NPC
  appraisalDate: { type: Date, default: null }, // When it was appraised
  appraisalDescription: { type: String, default: '' }, // Description revealed on appraisal

  // ------------------- Visuals & Art -------------------
  artSubmitted: { type: Boolean, default: false }, // Has the art been provided
  imageUrl: { type: String, default: '' }, // 1:1 PNG URL for the art

  // ------------------- Status Flags -------------------
  archived: { type: Boolean, default: false }, // Whether it's in the Library Archives
  deteriorated: { type: Boolean, default: false }, // True if not appraised in time

  // ------------------- Lore Fields -------------------
  description: { type: String, default: '' }, // General description of the relic
  functionality: { type: String, default: '' }, // What it does / how it works
  origins: { type: String, default: '' }, // Where it comes from / background
  uses: { type: String, default: '' }, // How it might be used

}, { collection: 'relics' });

module.exports = mongoose.model('Relic', RelicSchema);
