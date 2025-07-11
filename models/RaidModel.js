// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const mongoose = require('mongoose');

// ============================================================================
// ---- Raid Schema ----
// ============================================================================
const raidSchema = new mongoose.Schema({
  // Basic raid information
  raidId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Monster information
  monster: {
    name: {
      type: String,
      required: true
    },
    nameMapping: String,
    image: String,
    tier: {
      type: Number,
      required: true,
      min: 1
    },
    currentHearts: {
      type: Number,
      required: true,
      min: 0
    },
    maxHearts: {
      type: Number,
      required: true,
      min: 1
    }
  },
  
  // Location information
  village: {
    type: String,
    required: true,
    enum: ['Rudania', 'Inariko', 'Vhintl']
  },
  channelId: String,
  
  // Timing information
  createdAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  
  // Status information
  isActive: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'timed_out'],
    default: 'active'
  },
  result: {
    type: String,
    enum: ['defeated', 'timeout', null],
    default: null
  },
  
  // Participant information
  participants: [{
    userId: {
      type: String,
      required: true
    },
    characterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Character',
      required: true
    },
    name: {
      type: String,
      required: true
    },
    damage: {
      type: Number,
      default: 0,
      min: 0
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    characterState: {
      currentHearts: Number,
      maxHearts: Number,
      currentStamina: Number,
      maxStamina: Number,
      attack: Number,
      defense: Number,
      gearArmor: String,
      gearWeapon: String,
      gearShield: String,
      ko: Boolean
    }
  }],
  
  // Analytics information
  analytics: {
    totalDamage: {
      type: Number,
      default: 0,
      min: 0
    },
    participantCount: {
      type: Number,
      default: 0,
      min: 0
    },
    averageDamagePerParticipant: {
      type: Number,
      default: 0
    },
    monsterTier: {
      type: Number,
      required: true
    },
    village: {
      type: String,
      required: true
    },
    success: {
      type: Boolean,
      default: false
    },
    startTime: {
      type: Date,
      default: Date.now
    },
    endTime: Date,
    duration: Number,
    villageDamage: Number
  },
  
  // Thread information
  threadId: String,
  messageId: String
}, {
  timestamps: true
});

// ============================================================================
// ---- Indexes ----
// ============================================================================
raidSchema.index({ status: 1 });
raidSchema.index({ village: 1 });
raidSchema.index({ createdAt: 1 });
raidSchema.index({ expiresAt: 1 });
raidSchema.index({ 'participants.userId': 1 });
raidSchema.index({ 'participants.characterId': 1 });

// ============================================================================
// ---- Instance Methods ----
// ============================================================================

// ---- Method: isExpired ----
// Check if the raid has expired
raidSchema.methods.isExpired = function() {
  return Date.now() > this.expiresAt.getTime();
};

// ---- Method: addParticipant ----
// Add a participant to the raid
raidSchema.methods.addParticipant = function(participant) {
  // Check if user already has a character in the raid
  const existingParticipant = this.participants.find(p => p.userId === participant.userId);
  if (existingParticipant) {
    throw new Error('User already has a character in this raid');
  }
  
  this.participants.push(participant);
  this.analytics.participantCount = this.participants.length;
  return this.save();
};

// ---- Method: updateParticipantDamage ----
// Update a participant's damage
raidSchema.methods.updateParticipantDamage = function(characterId, damage) {
  const participant = this.participants.find(p => p.characterId.toString() === characterId.toString());
  if (!participant) {
    throw new Error('Participant not found in raid');
  }
  
  participant.damage += damage;
  this.analytics.totalDamage += damage;
  this.analytics.averageDamagePerParticipant = this.analytics.totalDamage / this.analytics.participantCount;
  
  return this.save();
};

// ---- Method: completeRaid ----
// Mark the raid as completed
raidSchema.methods.completeRaid = function(result, endTime = new Date()) {
  this.status = 'completed';
  this.result = result;
  this.isActive = false;
  this.analytics.success = result === 'defeated';
  this.analytics.endTime = endTime;
  this.analytics.duration = endTime - this.analytics.startTime;
  
  return this.save();
};

// ---- Method: timeoutRaid ----
// Mark the raid as timed out
raidSchema.methods.timeoutRaid = function(villageDamage = 0) {
  this.status = 'timed_out';
  this.result = 'timeout';
  this.isActive = false;
  this.analytics.success = false;
  this.analytics.endTime = new Date();
  this.analytics.duration = this.analytics.endTime - this.analytics.startTime;
  this.analytics.villageDamage = villageDamage;
  
  return this.save();
};

// ============================================================================
// ---- Static Methods ----
// ============================================================================

// ---- Method: findActiveRaids ----
// Find all active raids
raidSchema.statics.findActiveRaids = function() {
  return this.find({ 
    status: 'active',
    isActive: true,
    expiresAt: { $gt: new Date() }
  });
};

// ---- Method: findExpiredRaids ----
// Find all expired raids that haven't been processed
raidSchema.statics.findExpiredRaids = function() {
  return this.find({
    status: 'active',
    isActive: true,
    expiresAt: { $lte: new Date() }
  });
};

// ---- Method: cleanupExpiredRaids ----
// Clean up expired raids by marking them as timed out
raidSchema.statics.cleanupExpiredRaids = async function() {
  const expiredRaids = await this.findExpiredRaids();
  
  for (const raid of expiredRaids) {
    await raid.timeoutRaid();
  }
  
  return expiredRaids.length;
};

// ============================================================================
// ---- Export ----
// ============================================================================
module.exports = mongoose.model('Raid', raidSchema); 