// ------------------- Third-Party Imports -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Relic Schema Definition -------------------
// This schema defines the structure for relic documents stored in MongoDB.
const RelicSchema = new Schema({
  // ------------------- Identification Fields -------------------
  relicId: { type: String, default: '' },               // Short display ID in R12345 format.
  name: { type: String, required: true },            // Internal relic name.
  emoji: { type: String, default: '🔸' },              // Optional emoji for visual representation.
  unique: { type: Boolean, default: false },           // Indicates if the relic is one-of-a-kind.
  duplicateOf: { type: Schema.Types.ObjectId, ref: 'Relic', default: null }, // Reference relic if duplicate.
  rollOutcome: { type: String, default: '' },

  // ------------------- Discovery Information -------------------
  discoveredBy: { type: String, default: '' },         // Character who discovered the relic.
  characterId: { type: Schema.Types.ObjectId, ref: 'Character', default: null }, // Optional link to Character who found it.
  discoveredDate: { type: Date, default: null },         // Date when the relic was discovered.
  locationFound: { type: String, default: '' },        // Location details (e.g., quadrant, ruin).
  region: { type: String, default: '' },               // Region for library card (e.g. Eldin).
  square: { type: String, default: '' },               // Map square for library card (e.g. D2).
  quadrant: { type: String, default: '' },             // Quadrant for library card (e.g. Q3).

  // ------------------- Appraisal Information -------------------
  appraised: { type: Boolean, default: false },        // Indicates if the relic has been appraised.
  appraisedBy: { type: String, default: null },        // Appraising character or NPC.
  appraisalDate: { type: Date, default: null },        // Date when appraisal occurred.
  appraisalDeadline: { type: Date, default: null },    // 7 days from discoveredDate.
  artDeadline: { type: Date, default: null },          // 2 months from appraisalDate (set when appraised).
  appraisalDescription: { type: String, default: '' }, // Description revealed during appraisal.
  npcAppraisal: { type: Boolean, default: false },     // True if 500 tokens paid for NPC appraisal.
  appraisalRequestId: { type: String, default: '' },   // Links to RelicAppraisalRequest.

  // ------------------- Art and Visual Information -------------------
  artSubmitted: { type: Boolean, default: false },     // Indicates if the art has been submitted.
  imageUrl: { type: String, default: '' },             // URL of the submitted 1:1 PNG image.

  // ------------------- Library display (dashboard archives page) -------------------
  libraryPositionX: { type: Number, default: null },
  libraryPositionY: { type: Number, default: null },
  libraryDisplaySize: { type: Number, default: 8 },

  // ------------------- Status Flags -------------------
  archived: { type: Boolean, default: false },         // Flag indicating if the relic is archived in the Library.
  deteriorated: { type: Boolean, default: false },     // Indicates if the relic has deteriorated due to late appraisal.
  firstCompletionRewardGiven: { type: Boolean, default: false }, // 1,000 tokens for first full completion.
  duplicateRewardGiven: { type: Boolean, default: false },       // Reward for turning in duplicate.

  // ------------------- Lore and Description Fields -------------------
  description: { type: String, default: '' },          // Additional lore or description of the relic.
  functionality: { type: String, default: '' },        // Details about the relic's abilities or functions.
  origins: { type: String, default: '' },              // Background or origin information.
  uses: { type: String, default: '' },                 // Potential uses or applications.
}, { collection: 'relics' });

module.exports = mongoose.model('Relic', RelicSchema);