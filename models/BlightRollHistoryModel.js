const mongoose = require('mongoose');

const blightRollHistorySchema = new mongoose.Schema({
  characterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Character',
    required: true
  },
  characterName: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  rollValue: {
    type: Number,
    required: true
  },
  previousStage: {
    type: Number,
    required: true
  },
  newStage: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  }
});

// Index for faster queries
blightRollHistorySchema.index({ characterId: 1, timestamp: -1 });
blightRollHistorySchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('BlightRollHistory', blightRollHistorySchema); 