// ============================================================================
// ------------------- Import necessary modules -------------------
// Mongoose for database schema modeling
// ============================================================================
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================================
// ------------------- Define the character moderation schema -------------------
// Tracks moderator votes on character submissions
// ============================================================================
const characterModerationSchema = new Schema({
  // Character reference
  characterId: { 
    type: Schema.Types.ObjectId, 
    required: true, 
    ref: 'Character',
    index: true 
  },
  characterName: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  isModCharacter: { type: Boolean, default: false },
  
  // Moderator information
  modId: { type: String, required: true, index: true },
  modUsername: { type: String, required: true },
  
  // Vote information
  vote: { 
    type: String, 
    enum: ['approve', 'deny'], 
    required: true 
  },
  reason: { type: String, default: null }, // Required for deny votes
  
  // Timestamp
  createdAt: { type: Date, default: Date.now, index: true }
}, { collection: 'charactermoderations' });

// Compound index to prevent duplicate votes from same mod on same character
characterModerationSchema.index({ characterId: 1, modId: 1 }, { unique: true });

// ============================================================================
// ------------------- Define and export model -------------------
// ============================================================================
const CharacterModeration = mongoose.model('CharacterModeration', characterModerationSchema);

module.exports = CharacterModeration;
