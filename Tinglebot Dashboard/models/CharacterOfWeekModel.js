const mongoose = require('mongoose');

const characterOfWeekSchema = new mongoose.Schema({
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
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  featuredReason: {
    type: String,
    default: 'Random selection'
  },
  views: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for faster queries
characterOfWeekSchema.index({ isActive: 1, startDate: -1 });
characterOfWeekSchema.index({ characterId: 1 });

module.exports = mongoose.model('CharacterOfWeek', characterOfWeekSchema); 