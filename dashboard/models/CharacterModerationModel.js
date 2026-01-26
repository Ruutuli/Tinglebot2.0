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
    enum: ['approve', 'needs_changes'], 
    required: true 
  },
  reason: { type: String, default: null }, // Required for needs_changes votes
  note: { type: String, default: null }, // Optional feedback/note from mod
  
  // Application versioning
  applicationVersion: { type: Number, default: 1, index: true },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'charactermoderations' });

// Compound index to prevent duplicate votes from same mod on same character/version
// Allows one vote per mod per character per version
characterModerationSchema.index({ characterId: 1, modId: 1, applicationVersion: 1 }, { unique: true });

// Pre-save hook to update updatedAt when vote changes
characterModerationSchema.pre('save', function(next) {
  if (this.isModified('vote') || this.isModified('reason') || this.isModified('note')) {
    this.updatedAt = new Date();
  }
  next();
});

// ============================================================================
// ------------------- Define and export model -------------------
// ============================================================================
const CharacterModeration =
  mongoose.models.CharacterModeration ||
  mongoose.model('CharacterModeration', characterModerationSchema);

module.exports = CharacterModeration;
