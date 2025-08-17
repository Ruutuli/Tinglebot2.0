const mongoose = require('mongoose');

const NPCSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  // Steal protection tracking
  stealProtection: {
    // Protection: 2-hour cooldown after failed steal, midnight EST after successful steal
    isProtected: {
      type: Boolean,
      default: false
    },
    protectionEndTime: {
      type: Date,
      default: null
    }
  },
  
  // NPC metadata
  description: {
    type: String,
    default: ''
  },
  
  // Item categories this NPC can have
  itemCategories: [{
    type: String,
    trim: true
  }],
  
  // Difficulty modifier for stealing (harder NPCs have higher values)
  stealDifficulty: {
    type: Number,
    default: 0,
    min: 0,
    max: 50
  },
  
  // Whether this NPC is currently active/available
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Last time this NPC was interacted with
  lastInteraction: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
NPCSchema.index({ 'stealProtection.isProtected': 1 });
NPCSchema.index({ 'stealProtection.protectionEndTime': 1 });

// Static method to get all protected NPCs
NPCSchema.statics.getProtectedNPCs = function() {
  return this.find({
    'stealProtection.isProtected': true
  });
};

// Static method to reset all protections
NPCSchema.statics.resetAllProtections = function() {
  return this.updateMany(
    { 'stealProtection.isProtected': true },
    {
      $set: {
        'stealProtection.isProtected': false,
        'stealProtection.protectionEndTime': null
      }
    }
  );
};

// Static method to set protection
NPCSchema.statics.setProtection = function(npcName, duration) {
  return this.findOneAndUpdate(
    { name: npcName },
    {
      $set: {
        'stealProtection.isProtected': true,
        'stealProtection.protectionEndTime': new Date(Date.now() + duration),
        lastInteraction: new Date()
      }
    },
    { upsert: true, new: true }
  );
};

// Static method to clear protection
NPCSchema.statics.clearProtection = function(npcName) {
  return this.findOneAndUpdate(
    { name: npcName },
    {
      $set: {
        'stealProtection.isProtected': false,
        'stealProtection.protectionEndTime': null
      }
    },
    { new: true }
  );
};

// Static method to get NPC by name with upsert
NPCSchema.statics.getOrCreateNPC = function(npcName) {
  return this.findOneAndUpdate(
    { name: npcName },
    { $setOnInsert: { name: npcName } },
    { upsert: true, new: true }
  );
};

// Instance method to check if protection is expired
NPCSchema.methods.isProtectionExpired = function() {
  if (!this.stealProtection.isProtected) {
    return true;
  }
  
  if (!this.stealProtection.protectionEndTime) {
    return true;
  }
  
  return new Date() >= this.stealProtection.protectionEndTime;
};

// Instance method to get remaining protection time
NPCSchema.methods.getProtectionTimeLeft = function() {
  if (!this.stealProtection.isProtected || !this.stealProtection.protectionEndTime) {
    return 0;
  }
  
  const timeLeft = this.stealProtection.protectionEndTime.getTime() - Date.now();
  return timeLeft > 0 ? timeLeft : 0;
};

// Pre-save middleware to clean up expired protections
NPCSchema.pre('save', function(next) {
  // Clean up expired protection
  if (this.stealProtection.isProtected && this.isProtectionExpired()) {
    this.stealProtection.isProtected = false;
    this.stealProtection.protectionEndTime = null;
  }
  
  next();
});

module.exports = mongoose.model('NPC', NPCSchema);

