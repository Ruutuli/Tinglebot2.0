const mongoose = require('mongoose');

const NPCSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  // Unified steal protection tracking
  stealProtection: {
    // Local protection: 2-hour cooldown after successful steal from this specific NPC
    localProtection: {
      isProtected: {
        type: Boolean,
        default: false
      },
      protectionEndTime: {
        type: Date,
        default: null
      }
    },
    // Global protection: 24-hour cooldown after successful steal from ANY target, or 2-hour cooldown after failed steal
    globalProtection: {
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
NPCSchema.index({ 'stealProtection.localProtection.isProtected': 1 });
NPCSchema.index({ 'stealProtection.localProtection.protectionEndTime': 1 });
NPCSchema.index({ 'stealProtection.globalProtection.isProtected': 1 });
NPCSchema.index({ 'stealProtection.globalProtection.protectionEndTime': 1 });

// Static method to get all protected NPCs
NPCSchema.statics.getProtectedNPCs = function() {
  return this.find({
    $or: [
      { 'stealProtection.localProtection.isProtected': true },
      { 'stealProtection.globalProtection.isProtected': true }
    ]
  });
};

// Static method to reset all protections
NPCSchema.statics.resetAllProtections = function() {
  return this.updateMany(
    {
      $or: [
        { 'stealProtection.localProtection.isProtected': true },
        { 'stealProtection.globalProtection.isProtected': true }
      ]
    },
    {
      $set: {
        'stealProtection.localProtection.isProtected': false,
        'stealProtection.localProtection.protectionEndTime': null,
        'stealProtection.globalProtection.isProtected': false,
        'stealProtection.globalProtection.protectionType': null,
        'stealProtection.globalProtection.protectionEndTime': null
      }
    }
  );
};

// Static method to set local protection
NPCSchema.statics.setLocalProtection = function(npcName, duration = 2 * 60 * 60 * 1000) { // Default 2 hours
  return this.findOneAndUpdate(
    { name: npcName },
    {
      $set: {
        'stealProtection.localProtection.isProtected': true,
        'stealProtection.localProtection.protectionEndTime': new Date(Date.now() + duration),
        lastInteraction: new Date()
      }
    },
    { upsert: true, new: true }
  );
};

// Static method to set global protection
NPCSchema.statics.setGlobalProtection = function(npcName, protectionType, endTime) {
  return this.findOneAndUpdate(
    { name: npcName },
    {
      $set: {
        'stealProtection.globalProtection.isProtected': true,
        'stealProtection.globalProtection.protectionType': protectionType,
        'stealProtection.globalProtection.protectionEndTime': endTime,
        lastInteraction: new Date()
      }
    },
    { upsert: true, new: true }
  );
};

// Static method to clear local protection
NPCSchema.statics.clearLocalProtection = function(npcName) {
  return this.findOneAndUpdate(
    { name: npcName },
    {
      $set: {
        'stealProtection.localProtection.isProtected': false,
        'stealProtection.localProtection.protectionEndTime': null
      }
    },
    { new: true }
  );
};

// Static method to clear global protection
NPCSchema.statics.clearGlobalProtection = function(npcName) {
  return this.findOneAndUpdate(
    { name: npcName },
    {
      $set: {
        'stealProtection.globalProtection.isProtected': false,
        'stealProtection.globalProtection.protectionType': null,
        'stealProtection.globalProtection.protectionEndTime': null
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

// Instance method to check if local protection is expired
NPCSchema.methods.isLocalProtectionExpired = function() {
  if (!this.stealProtection.localProtection.isProtected) {
    return true;
  }
  
  if (!this.stealProtection.localProtection.protectionEndTime) {
    return true;
  }
  
  return new Date() >= this.stealProtection.localProtection.protectionEndTime;
};

// Instance method to check if global protection is expired
NPCSchema.methods.isGlobalProtectionExpired = function() {
  if (!this.stealProtection.globalProtection.isProtected) {
    return true;
  }
  
  if (!this.stealProtection.globalProtection.protectionEndTime) {
    return true;
  }
  
  return new Date() >= this.stealProtection.globalProtection.protectionEndTime;
};

// Instance method to get remaining local protection time
NPCSchema.methods.getLocalProtectionTimeLeft = function() {
  if (!this.stealProtection.localProtection.isProtected || !this.stealProtection.localProtection.protectionEndTime) {
    return 0;
  }
  
  const timeLeft = this.stealProtection.localProtection.protectionEndTime.getTime() - Date.now();
  return timeLeft > 0 ? timeLeft : 0;
};

// Instance method to get remaining global protection time
NPCSchema.methods.getGlobalProtectionTimeLeft = function() {
  if (!this.stealProtection.globalProtection.isProtected || !this.stealProtection.globalProtection.protectionEndTime) {
    return 0;
  }
  
  const timeLeft = this.stealProtection.globalProtection.protectionEndTime.getTime() - Date.now();
  return timeLeft > 0 ? timeLeft : 0;
};

// Pre-save middleware to clean up expired protections
NPCSchema.pre('save', function(next) {
  // Clean up expired local protection
  if (this.stealProtection.localProtection.isProtected && this.isLocalProtectionExpired()) {
    this.stealProtection.localProtection.isProtected = false;
    this.stealProtection.localProtection.protectionEndTime = null;
  }
  
  // Clean up expired global protection
  if (this.stealProtection.globalProtection.isProtected && this.isGlobalProtectionExpired()) {
    this.stealProtection.globalProtection.isProtected = false;
    this.stealProtection.globalProtection.protectionType = null;
    this.stealProtection.globalProtection.protectionEndTime = null;
  }
  
  next();
});

module.exports = mongoose.model('NPC', NPCSchema);

