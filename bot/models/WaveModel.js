// ============================================================================
// ---- Standard Libraries ----
// ============================================================================
const mongoose = require('mongoose');

// ============================================================================
// ---- Wave Schema ----
// ============================================================================
const waveSchema = new mongoose.Schema({
  // Basic wave information
  waveId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // Location information
  village: {
    type: String,
    required: true,
    enum: ['Rudania', 'Inariko', 'Vhintl']
  },
  channelId: String,
  
  // Monster queue
  monsters: [{
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
    hearts: {
      type: Number,
      required: true,
      min: 1
    },
    maxHearts: {
      type: Number,
      required: true,
      min: 1
    }
  }],
  currentMonsterIndex: {
    type: Number,
    default: 0,
    min: 0
  },
  defeatedMonsters: [{
    monsterIndex: {
      type: Number,
      min: 0
    },
    defeatedBy: {
      userId: String,
      characterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Character'
      },
      name: String
    }
  }],
  
  // Current monster (stored for convenience)
  currentMonster: {
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
    joinedAtStart: {
      type: Boolean,
      default: true
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
  
  // Turn order tracking
  currentTurn: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Status information
  status: {
    type: String,
    enum: ['active', 'completed', 'failed'],
    default: 'active'
  },
  result: {
    type: String,
    enum: ['victory', 'defeated', null],
    default: null
  },
  
  // Timing information
  createdAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  startTime: {
    type: Date,
    default: Date.now,
    required: true
  },
  endTime: Date,
  
  // Analytics information
  analytics: {
    totalMonsters: {
      type: Number,
      required: true,
      min: 1
    },
    difficultyGroup: {
      type: String,
      required: true
    },
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
    duration: Number,
    success: {
      type: Boolean,
      default: false
    }
  },
  
  // Monster camp source (when wave is created from exploration monster camp)
  source: {
    type: String,
    enum: ['mod', 'monster_camp'],
    default: 'mod'
  },
  monsterCampId: {
    type: String,
    default: null
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
waveSchema.index({ status: 1 });
waveSchema.index({ village: 1 });
waveSchema.index({ createdAt: 1 });
waveSchema.index({ 'participants.userId': 1 });
waveSchema.index({ 'participants.characterId': 1 });

// ============================================================================
// ---- Instance Methods ----
// ============================================================================

// ---- Method: addParticipant ----
// Add a participant to the wave with retry logic for version conflicts
waveSchema.methods.addParticipant = async function(participant, maxRetries = 3) {
  // Ensure participants array exists
  if (!this.participants) {
    this.participants = [];
  }
  
  // Check if user already has a character in the wave
  const existingParticipant = this.participants.find(p => p.userId === participant.userId);
  if (existingParticipant) {
    throw new Error('User already has a character in this wave');
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
        console.warn(`[WaveModel.js]: ⚠️ Version conflict in addParticipant, retrying (${retries}/${maxRetries})`);
        
        // Reload the document to get the latest version
        const freshWave = await this.constructor.findById(this._id);
        if (!freshWave) {
          throw new Error('Wave document not found during retry');
        }
        
        // Update the current document with fresh data
        this.set(freshWave.toObject());
        
        // Check again if user already has a character in the wave (after reload)
        const freshExistingParticipant = this.participants.find(p => p.userId === participant.userId);
        if (freshExistingParticipant) {
          throw new Error('User already has a character in this wave');
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
waveSchema.methods.updateParticipantDamage = async function(characterId, damage, maxRetries = 3) {
  // Ensure participants array exists
  if (!this.participants) {
    this.participants = [];
  }
  
  const participant = this.participants.find(p => p.characterId.toString() === characterId.toString());
  if (!participant) {
    throw new Error('Participant not found in wave');
  }
  
  let retries = 0;
  while (retries < maxRetries) {
    try {
      // Update the damage values
      participant.damage += damage;
      this.analytics.totalDamage += damage;
      this.analytics.participantCount = this.participants.length;
      
      // Save with optimistic concurrency control
      return await this.save();
    } catch (error) {
      if (error.name === 'VersionError' && retries < maxRetries - 1) {
        retries++;
        console.warn(`[WaveModel.js]: ⚠️ Version conflict in updateParticipantDamage, retrying (${retries}/${maxRetries})`);
        
        // Reload the document to get the latest version
        const freshWave = await this.constructor.findById(this._id);
        if (!freshWave) {
          throw new Error('Wave document not found during retry');
        }
        
        // Update the current document with fresh data
        this.set(freshWave.toObject());
        
        // Find the participant again in the fresh data
        const freshParticipant = this.participants.find(p => p.characterId.toString() === characterId.toString());
        if (!freshParticipant) {
          throw new Error('Participant not found in wave after reload');
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

// ---- Method: advanceTurn ----
// Advance to the next turn, skipping KO'd participants with retry logic for version conflicts
waveSchema.methods.advanceTurn = async function(maxRetries = 3) {
  // Ensure participants array exists
  if (!this.participants) {
    this.participants = [];
  }
  
  if (this.participants.length === 0) {
    return this.save();
  }
  
  let retries = 0;
  while (retries < maxRetries) {
    try {
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
              break;
            }
          } catch (error) {
            console.error(`[WaveModel.js]: ❌ Error checking KO status for ${nextParticipant.name}:`, error);
            // If we can't check the character, assume they're not KO'd to avoid getting stuck
            break;
          }
        }
      } while (attempts < maxAttempts);
      
      // If all participants are KO'd, just advance normally
      if (attempts >= maxAttempts) {
        nextTurn = (this.currentTurn + 1) % this.participants.length;
      }
      
      this.currentTurn = nextTurn;
      const nextParticipant = this.participants[this.currentTurn];
      
      return await this.save();
      
    } catch (error) {
      if (error.name === 'VersionError' && retries < maxRetries - 1) {
        retries++;
        console.warn(`[WaveModel.js]: ⚠️ Version conflict in advanceTurn, retrying (${retries}/${maxRetries})`);
        
        // Reload the document to get the latest version
        const freshWave = await this.constructor.findById(this._id);
        if (!freshWave) {
          throw new Error('Wave document not found during retry');
        }
        
        // Update the current document with fresh data
        this.set(freshWave.toObject());
        
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
// Get the effective current turn participant (skipping KO'd participants)
waveSchema.methods.getEffectiveCurrentTurnParticipant = async function() {
  // Ensure participants array exists
  if (!this.participants) {
    this.participants = [];
  }
  
  if (this.participants.length === 0) {
    return null;
  }
  
  // Get current character states from database to check KO status
  const Character = require('./CharacterModel');
  
  // Check if current turn participant is KO'd
  const currentParticipant = this.participants[this.currentTurn];
  if (currentParticipant) {
    try {
      const character = await Character.findById(currentParticipant.characterId);
      if (character && !character.ko) {
        // Current participant is not KO'd, return them
        return currentParticipant;
      }
    } catch (error) {
      console.error(`[WaveModel.js]: ❌ Error checking KO status for ${currentParticipant.name}:`, error);
      // If we can't check the character, assume they're not KO'd
      return currentParticipant;
    }
  }
  
  // Current participant is KO'd, find the next non-KO'd participant
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
        console.error(`[WaveModel.js]: ❌ Error checking KO status for ${nextParticipant.name}:`, error);
        // If we can't check the character, assume they're not KO'd to avoid getting stuck
        return nextParticipant;
      }
    }
  } while (attempts < maxAttempts);
  
  // If all participants are KO'd, return the current participant
  return currentParticipant;
};

// ---- Method: getCurrentTurnParticipant ----
// Get the participant whose turn it currently is
waveSchema.methods.getCurrentTurnParticipant = function() {
  // Ensure participants array exists
  if (!this.participants) {
    this.participants = [];
  }
  
  if (this.participants.length === 0) {
    return null;
  }
  
  return this.participants[this.currentTurn];
};

// ---- Method: advanceToNextMonster ----
// Advance to the next monster in the wave
waveSchema.methods.advanceToNextMonster = async function(defeatedByParticipant, maxRetries = 3) {
  let retries = 0;
  while (retries < maxRetries) {
    try {
      // Mark current monster as defeated
      if (!this.defeatedMonsters) {
        this.defeatedMonsters = [];
      }
      this.defeatedMonsters.push({
        monsterIndex: this.currentMonsterIndex,
        defeatedBy: defeatedByParticipant ? {
          userId: defeatedByParticipant.userId,
          characterId: defeatedByParticipant.characterId,
          name: defeatedByParticipant.name
        } : null
      });
      
      // Increment to next monster
      this.currentMonsterIndex += 1;
      
      // Check if all monsters are defeated
      if (this.currentMonsterIndex >= this.monsters.length) {
        // All monsters defeated - will be handled by completeWave
        return await this.save();
      }
      
      // Validate next monster exists
      if (!this.monsters || this.currentMonsterIndex >= this.monsters.length) {
        throw new Error(`Cannot advance to next monster: invalid monster index ${this.currentMonsterIndex} (monsters array length: ${this.monsters?.length || 0})`);
      }
      
      // Update current monster from monsters array
      const nextMonster = this.monsters[this.currentMonsterIndex];
      if (!nextMonster || !nextMonster.name || typeof nextMonster.tier !== 'number' || typeof nextMonster.hearts !== 'number') {
        throw new Error(`Next monster at index ${this.currentMonsterIndex} is invalid or missing required properties`);
      }
      
      this.currentMonster = {
        name: nextMonster.name,
        nameMapping: nextMonster.nameMapping,
        image: nextMonster.image,
        tier: nextMonster.tier,
        currentHearts: nextMonster.hearts,
        maxHearts: nextMonster.maxHearts || nextMonster.hearts
      };
      
      // Reset turn order to start
      this.currentTurn = 0;
      
      return await this.save();
      
    } catch (error) {
      if (error.name === 'VersionError' && retries < maxRetries - 1) {
        retries++;
        console.warn(`[WaveModel.js]: ⚠️ Version conflict in advanceToNextMonster, retrying (${retries}/${maxRetries})`);
        
        // Reload the document to get the latest version
        const freshWave = await this.constructor.findById(this._id);
        if (!freshWave) {
          throw new Error('Wave document not found during retry');
        }
        
        // Update the current document with fresh data
        this.set(freshWave.toObject());
        
        // Continue with the retry
        continue;
      } else {
        // Re-throw if it's not a version error or we've exhausted retries
        throw error;
      }
    }
  }
  
  throw new Error(`Failed to advance to next monster after ${maxRetries} retries`);
};

// ---- Method: completeWave ----
// Mark the wave as completed
waveSchema.methods.completeWave = function(endTime = new Date()) {
  this.status = 'completed';
  this.result = 'victory';
  this.isActive = false;
  this.endTime = endTime;
  this.analytics.success = true;
  this.analytics.duration = endTime - this.startTime;
  
  return this.save();
};

// ---- Method: failWave ----
// Mark the wave as failed and KO all participants
waveSchema.methods.failWave = async function() {
  this.status = 'failed';
  this.result = 'defeated';
  this.isActive = false;
  this.endTime = new Date();
  this.analytics.success = false;
  this.analytics.duration = this.endTime - this.startTime;
  
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
        console.log(`[WaveModel.js]: 💀 KO'd participant ${character.name} in failed wave ${this.waveId}`);
      }
    } catch (error) {
      console.error(`[WaveModel.js]: ❌ Error KO'ing participant ${participant.name}:`, error);
    }
  }
  
  return this.save();
};

// ============================================================================
// ---- Static Methods ----
// ============================================================================

// ---- Method: findActiveWaves ----
// Find all active waves
waveSchema.statics.findActiveWaves = function() {
  return this.find({ 
    status: 'active'
  });
};

// ============================================================================
// ---- Export ----
// ============================================================================
module.exports = mongoose.model('Wave', waveSchema);

