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
    unique: true,
    validate: {
      validator: function(v) {
        return v != null && v.trim() !== '';
      },
      message: 'QuestId cannot be null or empty'
    }
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
    enum: ['item', 'monster', 'escort', 'crafting', 'art', 'writing']
  },
  npcName: {
    type: String,
    required: true
    // The NPC who requested this quest
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
  },
  scheduledPostTime: {
    type: String,
    required: true
  },
  messageId: {
    type: String,
    default: null
    // Discord message ID of the quest embed for future edits
  },
  channelId: {
    type: String,
    default: null
    // Discord channel ID where the quest embed was posted
  }
});

// ------------------- Model Export -------------------
// ============================================================================
module.exports = mongoose.model('HelpWantedQuest', HelpWantedQuestSchema, 'helpwantedquests'); 