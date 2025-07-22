// ============================================================================
// ------------------- HelpWantedQuestModel.js -------------------
// Mongoose model for daily Help Wanted quests (per village)
// ============================================================================

const mongoose = require('mongoose');

// ------------------- Schema: HelpWantedQuest -------------------
// Represents a single daily quest for a village
// ============================================================================
const HelpWantedQuestSchema = new mongoose.Schema({
  questId: {
    type: String,
    required: true,
    unique: true
  },
  village: {
    type: String,
    required: true,
    enum: ['Rudania', 'Inariko', 'Vhintl']
  },
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['item', 'monster', 'escort', 'crafting']
  },
  requirements: {
    type: Object,
    required: true
    // Example: { item: 'Blight Petal', amount: 3 }
  },
  completed: {
    type: Boolean,
    default: false
  },
  completedBy: {
    type: Object,
    default: null
    // Example: { userId, characterId, timestamp }
  }
});

// ------------------- Model Export -------------------
// ============================================================================
module.exports = mongoose.model('HelpWantedQuest', HelpWantedQuestSchema, 'helpwantedquests'); 