// ============================================================================
// ------------------- Import necessary modules -------------------
// Mongoose for database schema modeling
// ============================================================================
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================================
// ------------------- Define the Minigame session schema -------------------
// Generic structure that can handle different types of minigames
// ============================================================================
const minigameSchema = new Schema({
  // ------------------- Game session information -------------------
  sessionId: { type: String, required: true, unique: true }, // Unique session ID
  gameType: { 
    type: String, 
    required: true, 
    enum: ['theycame', 'future_games'] // Add more game types here
  },
  channelId: { type: String, required: true }, // Discord channel where game is hosted
  guildId: { type: String, required: true }, // Discord guild/server ID
  createdBy: { type: String, required: true }, // Discord ID of session creator
  createdAt: { type: Date, default: Date.now }, // When the session was created
  messageId: { type: String, default: null }, // Discord message ID of the game status embed
  
  // ------------------- Game state -------------------
  status: { 
    type: String, 
    enum: ['waiting', 'active', 'finished'], 
    default: 'waiting' 
  }, // Current game status
  village: { 
    type: String, 
    enum: ['rudania', 'inariko', 'vhintl'], 
    default: 'rudania' 
  }, // Village where the minigame takes place
  
  // ------------------- Players -------------------
  players: [{
    discordId: { type: String, required: true },
    characterName: { type: String, required: true },
    characterId: { type: String, required: true },
    isModCharacter: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now }
  }],
  
  // ------------------- Game-specific data -------------------
  gameData: {
    type: mongoose.Schema.Types.Mixed,
    required: true
    // This will store different data structures based on gameType
  },
  
  // ------------------- Results and rewards -------------------
  results: {
    winner: { type: String, default: null }, // Discord ID of winner (if applicable)
    finalScore: { type: Number, default: null }, // Final score/result
    rewards: [{ type: mongoose.Schema.Types.Mixed }], // Array of rewards given
    completedAt: { type: Date, default: null } // When game was completed
  }
}, {
  timestamps: true
});

// ============================================================================
// ------------------- Create indexes for better query performance -------------------
// ============================================================================
minigameSchema.index({ channelId: 1, status: 1 });
minigameSchema.index({ gameType: 1, status: 1 });
minigameSchema.index({ createdBy: 1 });

// ============================================================================
// ------------------- Static methods for cleanup -------------------
// ============================================================================
minigameSchema.statics.cleanupOldSessions = async function() {
  // Find sessions that are finished
  const sessionsToDelete = await this.find({
    status: 'finished'
  });
  
  if (sessionsToDelete.length === 0) {
    return { deletedCount: 0, finishedCount: 0 };
  }
  
  // Delete the sessions
  const deleteResult = await this.deleteMany({
    _id: { $in: sessionsToDelete.map(s => s._id) }
  });
  
  const finishedCount = sessionsToDelete.length;
  
  return {
    deletedCount: deleteResult.deletedCount,
    finishedCount
  };
};

// ============================================================================
// ------------------- Export the Minigame model -------------------
// ============================================================================
const Minigame = mongoose.model('Minigame', minigameSchema);
module.exports = Minigame;
