// ============================================================================
// ------------------- Import necessary modules -------------------
// Mongoose for database schema modeling
// ============================================================================
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================================
// ------------------- Define the RuuGame session schema -------------------
// Tracks game sessions, players, and game state
// ============================================================================
const ruuGameSchema = new Schema({
  // ------------------- Game session information -------------------
  sessionId: { type: String, required: true, unique: true }, // Unique session ID
  channelId: { type: String, required: true }, // Discord channel where game is hosted
  guildId: { type: String, required: true }, // Discord guild/server ID
  createdBy: { type: String, required: true }, // Discord ID of session creator
  createdAt: { type: Date, default: Date.now }, // When the session was created
  expiresAt: { type: Date, required: true }, // When the session expires (24 hours)
  
  // ------------------- Game state -------------------
  status: { 
    type: String, 
    enum: ['waiting', 'active', 'finished'], 
    default: 'waiting' 
  }, // Current game status
  winner: { type: String, default: null }, // Discord ID of winner
  winningScore: { type: Number, default: null }, // Final winning score
  
  // ------------------- Players -------------------
  players: [{
    discordId: { type: String, required: true },
    username: { type: String, required: true },
    lastRoll: { type: Number, default: null },
    lastRollTime: { type: Date, default: null }
  }],
  
  // ------------------- Game settings -------------------
  targetScore: { type: Number, default: 20 }, // Score needed to win
  diceSides: { type: Number, default: 20 }, // Number of sides on dice
  
  // ------------------- Prize information -------------------
  prizeType: { 
    type: String, 
    enum: ['fairy', 'job_voucher', 'enduring_elixir'], 
    required: true 
  }, // Type of prize for winner
  prizeClaimed: { type: Boolean, default: false }, // Whether prize has been claimed
  prizeClaimedBy: { type: String, default: null }, // Character who claimed the prize
  prizeClaimedAt: { type: Date, default: null } // When prize was claimed
});

// ------------------- Create indexes for better query performance -------------------
ruuGameSchema.index({ channelId: 1 });
ruuGameSchema.index({ status: 1 });
ruuGameSchema.index({ expiresAt: 1 });

// ------------------- Static methods for cleanup -------------------
ruuGameSchema.statics.cleanupOldSessions = async function() {
  const now = new Date();
  
  // Find sessions that are either finished or expired
  const sessionsToDelete = await this.find({
    $or: [
      { status: 'finished' },
      { expiresAt: { $lt: now } }
    ]
  });
  
  if (sessionsToDelete.length === 0) {
    return { deletedCount: 0, finishedCount: 0, expiredCount: 0 };
  }
  
  // Delete the sessions
  const deleteResult = await this.deleteMany({
    _id: { $in: sessionsToDelete.map(s => s._id) }
  });
  
  const finishedCount = sessionsToDelete.filter(s => s.status === 'finished').length;
  const expiredCount = sessionsToDelete.filter(s => s.status !== 'finished').length;
  
  return {
    deletedCount: deleteResult.deletedCount,
    finishedCount,
    expiredCount
  };
};

// ------------------- Export the RuuGame model -------------------
const RuuGame = mongoose.model('RuuGame', ruuGameSchema);
module.exports = RuuGame;