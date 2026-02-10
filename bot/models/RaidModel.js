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
    roundsParticipated: {
      type: Number,
      default: 0,
      min: 0
    },
    skipCount: {
      type: Number,
      default: 0,
      min: 0
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    isModCharacter: {
      type: Boolean,
      default: false
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
  
  // Turn order tracking
  currentTurn: {
    type: Number,
    default: 0,
    min: 0
  },

  // Participants who left or were removed but are still eligible for loot (1+ damage or 3+ rounds)
  lootEligibleRemoved: [{
    characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character' },
    userId: { type: String },
    name: { type: String },
    damage: { type: Number, default: 0 }
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
    villageDamage: Number,
    baseMonsterHearts: {
      type: Number,
      default: 0,
      min: 0
    }
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
// Add a participant to the raid with retry logic for version conflicts
raidSchema.methods.addParticipant = async function(participant, maxRetries = 3) {
  // Ensure participants array exists
  if (!this.participants) {
    this.participants = [];
  }
  
  // Check if user already has a character in the raid
  const existingParticipant = this.participants.find(p => p.userId === participant.userId);
  if (existingParticipant) {
    throw new Error('User already has a character in this raid');
  }
  
  let retries = 0;
  while (retries < maxRetries) {
    try {
      this.participants.push(participant);
      this.analytics.participantCount = this.participants.length;
      return await this.save();
    } catch (error) {
      if (error.name === 'VersionError' && retries < maxRetries - 1) {
        retries++;
        console.warn(`[RaidModel.js]: ⚠️ Version conflict in addParticipant, retrying (${retries}/${maxRetries})`);
        
        // Reload the document to get the latest version
        const freshRaid = await this.constructor.findById(this._id);
        if (!freshRaid) {
          throw new Error('Raid document not found during retry');
        }
        
        // Update the current document with fresh data
        this.set(freshRaid.toObject());
        
        // Check again if user already has a character in the raid (after reload)
        const freshExistingParticipant = this.participants.find(p => p.userId === participant.userId);
        if (freshExistingParticipant) {
          throw new Error('User already has a character in this raid');
        }
        
        // Continue with the retry
        continue;
      } else {
        // Re-throw if it's not a version error or we've exhausted retries
        throw error;
      }
    }
  }
  
  throw new Error(`Failed to add participant after ${maxRetries} retries`);
};

// ---- Method: updateParticipantDamage ----
// Update a participant's damage with retry logic for version conflicts
raidSchema.methods.updateParticipantDamage = async function(characterId, damage, maxRetries = 3) {
  // Ensure participants array exists
  if (!this.participants) {
    this.participants = [];
  }
  
  const participant = this.participants.find(p => p.characterId.toString() === characterId.toString());
  if (!participant) {
    throw new Error('Participant not found in raid');
  }
  
  let retries = 0;
  while (retries < maxRetries) {
    try {
      // Update the damage values and round count
      participant.damage += damage;
      participant.roundsParticipated = (participant.roundsParticipated || 0) + 1;
      this.analytics.totalDamage += damage;
      this.analytics.averageDamagePerParticipant = this.analytics.totalDamage / this.analytics.participantCount;
      
      // Save with optimistic concurrency control
      return await this.save();
    } catch (error) {
      if (error.name === 'VersionError' && retries < maxRetries - 1) {
        retries++;
        console.warn(`[RaidModel.js]: ⚠️ Version conflict in updateParticipantDamage, retrying (${retries}/${maxRetries})`);
        
        // Reload the document to get the latest version
        const freshRaid = await this.constructor.findById(this._id);
        if (!freshRaid) {
          throw new Error('Raid document not found during retry');
        }
        
        // Update the current document with fresh data
        this.set(freshRaid.toObject());
        
        // Find the participant again in the fresh data
        const freshParticipant = this.participants.find(p => p.characterId.toString() === characterId.toString());
        if (!freshParticipant) {
          throw new Error('Participant not found in raid after reload');
        }
        
        // Continue with the retry
        continue;
      } else {
        // Re-throw if it's not a version error or we've exhausted retries
        throw error;
      }
    }
  }
  
  throw new Error(`Failed to update participant damage after ${maxRetries} retries`);
};

// ---- Method: addLootEligibleRemoved ----
// Add a participant (who left or was removed) to lootEligibleRemoved so they still receive loot on victory
raidSchema.methods.addLootEligibleRemoved = function(participant) {
  if (!this.lootEligibleRemoved) {
    this.lootEligibleRemoved = [];
  }
  this.lootEligibleRemoved.push({
    characterId: participant.characterId,
    userId: participant.userId,
    name: participant.name,
    damage: participant.damage || 0
  });
};

// ---- Method: removeParticipant ----
// Remove a participant by characterId; adjust currentTurn; optionally add to lootEligibleRemoved
// Returns { removedIndex, newCurrentTurn } for caller to use (e.g. cancel skip job)
raidSchema.methods.removeParticipant = async function(characterId, addToLootEligibleIfEligible = false, maxRetries = 3) {
  if (!this.participants) {
    this.participants = [];
  }
  const idx = this.participants.findIndex(p => p.characterId.toString() === characterId.toString());
  if (idx === -1) {
    throw new Error('Participant not found in raid');
  }
  const participant = this.participants[idx];
  const wasEligible = (participant.damage >= 1) || ((participant.roundsParticipated || 0) >= 3);
  if (addToLootEligibleIfEligible && wasEligible) {
    this.addLootEligibleRemoved(participant);
  }
  this.participants.splice(idx, 1);
  this.analytics.participantCount = this.participants.length;
  // Adjust currentTurn: if we removed someone at or before currentTurn, decrement or clamp
  if (this.participants.length === 0) {
    this.currentTurn = 0;
  } else {
    if (idx < this.currentTurn) {
      this.currentTurn = Math.max(0, this.currentTurn - 1);
    } else if (idx === this.currentTurn) {
      // Removed current turn; currentTurn now points to next person (or 0 if we were last)
      this.currentTurn = this.currentTurn % this.participants.length;
    }
  }
  return await this.save();
};

// ---- Method: incrementParticipantSkipCount ----
// Increment skipCount for participant at given index; if >= 2, remove (no loot for skip-removed, even if eligible)
// Returns { removed: boolean, participant, newCurrentTurnIndex }
raidSchema.methods.incrementParticipantSkipCountAndMaybeRemove = async function(participantIndex, maxRetries = 3) {
  if (!this.participants || participantIndex < 0 || participantIndex >= this.participants.length) {
    throw new Error('Invalid participant index');
  }
  const participant = this.participants[participantIndex];
  participant.skipCount = (participant.skipCount || 0) + 1;
  const removed = participant.skipCount >= 2;
  if (removed) {
    // Skip-removed players receive NO loot, even if they met 1+ damage or 3+ rounds
    this.participants.splice(participantIndex, 1);
    this.analytics.participantCount = this.participants.length;
    let newCurrentTurn = this.currentTurn;
    if (this.participants.length === 0) {
      newCurrentTurn = 0;
    } else {
      if (participantIndex < this.currentTurn) {
        newCurrentTurn = this.currentTurn - 1;
      } else if (participantIndex === this.currentTurn) {
        newCurrentTurn = this.currentTurn % this.participants.length;
      } else {
        newCurrentTurn = this.currentTurn;
      }
    }
    this.currentTurn = newCurrentTurn;
    await this.save();
    return { removed: true, participant, newCurrentTurnIndex: newCurrentTurn };
  }
  await this.save();
  return { removed: false, participant, newCurrentTurnIndex: this.currentTurn };
};

// ---- Method: advanceTurn ----
// Advance to the next turn. KO'd participants stay in turn order (they get a turn to use a fairy or leave).
// Only mod characters are skipped (they don't participate in turn order).
raidSchema.methods.advanceTurn = async function(maxRetries = 3) {
  if (!this.participants) this.participants = [];
  if (this.participants.length === 0) return this.save();

  const ModCharacter = require('./ModCharacterModel');
  const isModParticipant = async (p) => {
    if (!p || p.isModCharacter) return true;
    try {
      const modChar = await ModCharacter.findById(p.characterId);
      return !!modChar;
    } catch (err) {
      return false;
    }
  };

  let retries = 0;
  while (retries < maxRetries) {
    try {
      let nextTurn = this.currentTurn;
      let attempts = 0;
      const maxAttempts = this.participants.length;
      do {
        nextTurn = (nextTurn + 1) % this.participants.length;
        attempts++;
        const nextParticipant = this.participants[nextTurn];
        if (nextParticipant && !(await isModParticipant(nextParticipant))) break;
      } while (attempts < maxAttempts);
      if (attempts >= maxAttempts) {
        nextTurn = (this.currentTurn + 1) % this.participants.length;
      }
      this.currentTurn = nextTurn;
      return await this.save();
    } catch (error) {
      if (error.name === 'VersionError' && retries < maxRetries - 1) {
        retries++;
        console.warn(`[RaidModel.js]: ⚠️ Version conflict in advanceTurn, retrying (${retries}/${maxRetries})`);
        
        // Reload the document to get the latest version
        const freshRaid = await this.constructor.findById(this._id);
        if (!freshRaid) {
          throw new Error('Raid document not found during retry');
        }
        
        // Update the current document with fresh data
        this.set(freshRaid.toObject());
        
        // Continue with the retry
        continue;
      } else {
        // Re-throw if it's not a version error or we've exhausted retries
        throw error;
      }
    }
  }
  
  throw new Error(`Failed to advance turn after ${maxRetries} retries`);
};

// ---- Method: getEffectiveCurrentTurnParticipant ----
// Get the effective current turn participant (skipping KO'd and mod-character participants; mod characters don't participate in turn order)
raidSchema.methods.getEffectiveCurrentTurnParticipant = async function() {
  if (!this.participants) this.participants = [];
  if (this.participants.length === 0) return null;

  const Character = require('./CharacterModel');
  const ModCharacter = require('./ModCharacterModel');
  const isEligible = async (p) => {
    if (p.isModCharacter) return false;
    try {
      const modChar = await ModCharacter.findById(p.characterId);
      if (modChar) return false; // mod characters don't participate in turn order (even without flag on participant)
      const character = await Character.findById(p.characterId);
      return character && !character.ko;
    } catch (err) {
      return true;
    }
  };

  let idx = this.currentTurn;
  let attempts = 0;
  const maxAttempts = this.participants.length;
  do {
    const p = this.participants[idx];
    if (p && await isEligible(p)) return p;
    idx = (idx + 1) % this.participants.length;
    attempts++;
  } while (attempts < maxAttempts);
  return null;
};

// ---- Method: getCurrentTurnParticipant ----
// Get the participant whose turn it currently is
raidSchema.methods.getCurrentTurnParticipant = function() {
  // Ensure participants array exists
  if (!this.participants) {
    this.participants = [];
  }
  
  if (this.participants.length === 0) {
    return null;
  }
  
  return this.participants[this.currentTurn];
};

// ---- Method: getNextTurnParticipant ----
// Get the next participant in turn order (skipping KO'd participants)
raidSchema.methods.getNextTurnParticipant = async function() {
  // Ensure participants array exists
  if (!this.participants) {
    this.participants = [];
  }
  
  if (this.participants.length === 0) {
    return null;
  }
  
  // Get current character states from database to check KO status
  const Character = require('./CharacterModel');
  
  // Find the next non-KO'd participant
  let nextTurn = this.currentTurn;
  let attempts = 0;
  const maxAttempts = this.participants.length; // Prevent infinite loop
  
  do {
    nextTurn = (nextTurn + 1) % this.participants.length;
    attempts++;
    
    // Check if the next participant is KO'd
    const nextParticipant = this.participants[nextTurn];
    if (nextParticipant) {
      try {
        const character = await Character.findById(nextParticipant.characterId);
        if (character && !character.ko) {
          // Found a non-KO'd participant
          return nextParticipant;
        }
      } catch (error) {
        console.error(`[RaidModel.js]: ❌ Error checking KO status for ${nextParticipant.name}:`, error);
        // If we can't check the character, assume they're not KO'd to avoid getting stuck
        return nextParticipant;
      }
    }
  } while (attempts < maxAttempts);
  
  // If all participants are KO'd, return the next participant in order
  const nextTurnIndex = (this.currentTurn + 1) % this.participants.length;
  return this.participants[nextTurnIndex];
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
// Mark the raid as timed out (DEPRECATED - village damage feature removed)
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

// ---- Method: failRaid ----
// Mark the raid as failed and KO all participants (idempotent: safe to call if already failed)
raidSchema.methods.failRaid = async function(client = null) {
  if (this.status !== 'active') {
    return this.save();
  }

  this.status = 'timed_out';
  this.result = 'timeout';
  this.isActive = false;
  this.analytics.success = false;
  this.analytics.endTime = new Date();
  this.analytics.duration = this.analytics.endTime - this.analytics.startTime;

  // Ensure participants array exists
  if (!this.participants) {
    this.participants = [];
  }
  
  // KO all participants
  const Character = require('./CharacterModel');
  for (const participant of this.participants) {
    try {
      const character = await Character.findById(participant.characterId);
      if (character) {
        character.ko = true;
        character.currentHearts = 0;
        await character.save();
        console.log(`[RaidModel.js]: 💀 KO'd participant ${character.name} in failed raid ${this.raidId}`);
      }
    } catch (error) {
      console.error(`[RaidModel.js]: ❌ Error KO'ing participant ${participant.name}:`, error);
    }
  }
  
  // Apply village damage (only for Tier 5-10 raids)
  if (this.monster && this.monster.tier >= 5 && this.monster.tier <= 10 && this.village) {
    try {
      const { applyVillageDamage } = require('../modules/villageModule');
      
      // Try to get the thread if available
      let thread = null;
      if (client && this.threadId) {
        try {
          const threadChannel = await client.channels.fetch(this.threadId);
          if (threadChannel) {
            thread = threadChannel;
          }
        } catch (threadError) {
          console.warn(`[RaidModel.js]: ⚠️ Could not fetch thread ${this.threadId} for village damage notification:`, threadError.message);
        }
      }
      
      await applyVillageDamage(this.village, this.monster, thread);
      console.log(`[RaidModel.js]: 💥 Applied village damage to ${this.village} from failed raid ${this.raidId}`);
    } catch (damageError) {
      console.error(`[RaidModel.js]: ❌ Error applying village damage for failed raid ${this.raidId}:`, damageError);
      // Don't fail the raid cleanup if village damage fails
    }
  }
  
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
// Clean up expired raids by marking them as failed and KO'ing participants
raidSchema.statics.cleanupExpiredRaids = async function(client = null) {
  const expiredRaids = await this.findExpiredRaids();
  
  for (const raid of expiredRaids) {
    await raid.failRaid(client);
  }
  
  return expiredRaids.length;
};

// ============================================================================
// ---- Export ----
// ============================================================================
module.exports = mongoose.model('Raid', raidSchema); 