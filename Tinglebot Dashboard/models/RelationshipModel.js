const mongoose = require('mongoose');

const relationshipSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  characterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Character',
    required: true,
    index: true
  },
  targetCharacterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Character',
    required: true
  },
  characterName: {
    type: String,
    required: true,
    index: true
  },
  targetCharacterName: {
    type: String,
    required: true,
    index: true
  },
  relationshipTypes: {
    type: [String],
    required: true,
    enum: ['LOVERS', 'CRUSH', 'CLOSE_FRIEND', 'FRIEND', 'ACQUAINTANCE', 'DISLIKE', 'HATE', 'NEUTRAL', 'FAMILY', 'RIVAL', 'ADMIRE', 'OTHER'],
    default: ['NEUTRAL']
  },
  notes: {
    type: String,
    maxlength: 1000,
    default: ''
  },

}, {
  timestamps: true,
  collection: 'relationships'
});

// Compound index to prevent duplicate relationships between the same characters for the same user
relationshipSchema.index({ userId: 1, characterId: 1, targetCharacterId: 1 }, { unique: true });

// Index for efficient querying by user and character
relationshipSchema.index({ userId: 1, characterId: 1 });

// Note: Color and display logic is now handled by the frontend's centralized RELATIONSHIP_CONFIG

// Static method to get relationships for a character
relationshipSchema.statics.getCharacterRelationships = function(characterId) {
  return this.find({ characterId })
    .populate('targetCharacterId', 'name race job currentVillage homeVillage icon')
    .sort({ createdAt: -1 });
};

// Static method to get relationships by user
relationshipSchema.statics.getUserRelationships = function(userId) {
  return this.find({ userId })
    .populate('characterId', 'name race job currentVillage homeVillage icon')
    .populate('targetCharacterId', 'name race job currentVillage homeVillage icon')
    .sort({ createdAt: -1 });
};

// Static method to check if relationship exists for a specific user
relationshipSchema.statics.relationshipExists = function(userId, characterId, targetCharacterId) {
  return this.findOne({ userId, characterId, targetCharacterId });
};

// Pre-save middleware to ensure characterId and targetCharacterId are different
relationshipSchema.pre('save', function(next) {
  if (this.characterId.toString() === this.targetCharacterId.toString()) {
    return next(new Error('Character cannot have a relationship with themselves'));
  }
  next();
});

// Pre-save middleware to validate relationship types
relationshipSchema.pre('save', function(next) {
  const validTypes = ['LOVERS', 'CRUSH', 'CLOSE_FRIEND', 'FRIEND', 'ACQUAINTANCE', 'DISLIKE', 'HATE', 'NEUTRAL', 'FAMILY', 'RIVAL', 'ADMIRE', 'OTHER'];
  for (const type of this.relationshipTypes) {
    if (!validTypes.includes(type)) {
      return next(new Error(`Invalid relationship type: ${type}`));
    }
  }
  next();
});

module.exports = mongoose.model('Relationship', relationshipSchema);

