const mongoose = require('mongoose');

const NPCSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  // Global steal protection tracking
  globalStealProtection: {
    isProtected: {
      type: Boolean,
      default: false
    },
    protectionType: {
      type: String,
      enum: ['success', 'failure', null],
      default: null
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
NPCSchema.index({ 'globalStealProtection.isProtected': 1 });
NPCSchema.index({ 'globalStealProtection.protectionEndTime': 1 });

// Static method to get all protected NPCs
NPCSchema.statics.getProtectedNPCs = function() {
  return this.find({
    'globalStealProtection.isProtected': true,
    'globalStealProtection.protectionEndTime': { $gt: new Date() }
  });
};

// Static method to reset all global protections
NPCSchema.statics.resetAllGlobalProtections = function() {
  return this.updateMany(
    { 'globalStealProtection.isProtected': true },
    {
      $set: {
        'globalStealProtection.isProtected': false,
        'globalStealProtection.protectionType': null,
        'globalStealProtection.protectionEndTime': null
      }
    }
  );
};

// Static method to set global protection
NPCSchema.statics.setGlobalProtection = function(npcName, protectionType, endTime) {
  return this.findOneAndUpdate(
    { name: npcName },
    {
      $set: {
        'globalStealProtection.isProtected': true,
        'globalStealProtection.protectionType': protectionType,
        'globalStealProtection.protectionEndTime': endTime,
        lastInteraction: new Date()
      }
    },
    { upsert: true, new: true }
  );
};

// Static method to clear global protection
NPCSchema.statics.clearGlobalProtection = function(npcName) {
  return this.findOneAndUpdate(
    { name: npcName },
    {
      $set: {
        'globalStealProtection.isProtected': false,
        'globalStealProtection.protectionType': null,
        'globalStealProtection.protectionEndTime': null
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
  if (!this.globalStealProtection.isProtected) {
    return true;
  }
  
  if (!this.globalStealProtection.protectionEndTime) {
    return true;
  }
  
  return new Date() >= this.globalStealProtection.protectionEndTime;
};

// Instance method to get remaining protection time
NPCSchema.methods.getProtectionTimeLeft = function() {
  if (!this.globalStealProtection.isProtected || !this.globalStealProtection.protectionEndTime) {
    return 0;
  }
  
  const timeLeft = this.globalStealProtection.protectionEndTime.getTime() - Date.now();
  return timeLeft > 0 ? timeLeft : 0;
};

// Pre-save middleware to clean up expired protections
NPCSchema.pre('save', function(next) {
  if (this.globalStealProtection.isProtected && this.isProtectionExpired()) {
    this.globalStealProtection.isProtected = false;
    this.globalStealProtection.protectionType = null;
    this.globalStealProtection.protectionEndTime = null;
  }
  next();
});

module.exports = mongoose.model('NPC', NPCSchema);
