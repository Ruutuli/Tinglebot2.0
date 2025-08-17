// ============================================================================
// ------------------- Import necessary modules -------------------
// Mongoose for database schema modeling
// ============================================================================
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================================
// ------------------- Define reusable schemas -------------------
// Reusable sub-schema for gear items with name and stats
// ============================================================================
const GearSchema = new Schema({
  name: { type: String, required: true },
  stats: { type: Map, of: Number, required: true }
}, { _id: false });

// ============================================================================
// ------------------- Define the main character schema -------------------
// Everything related to character data
// ============================================================================
const characterSchema = new Schema({
  // ------------------- Basic character information -------------------
  userId: { type: String, required: true, index: true },
  name: { type: String, required: true },
  age: { type: Number, default: null },
  height: { type: Number, default: null },
  pronouns: { type: String, required: true },
  race: { type: String, required: true },
  homeVillage: { type: String, required: true },
  currentVillage: {
    type: String,
    default: function () { return this.homeVillage; }
  },
  job: { type: String, required: true },
  jobDateChanged: { type: Date, default: null },
  icon: { type: String, required: true },
  birthday: { type: String, default: '' },

  // ------------------- Health and stamina -------------------
  maxHearts: { type: Number, required: true },
  currentHearts: { type: Number, required: true },
  maxStamina: { type: Number, required: true },
  currentStamina: { type: Number, required: true },
  lastStaminaUsage: { type: Date, default: null },
  lastSpecialWeatherGather: { type: Date, default: null },

  // ------------------- Gear and stats -------------------
  gearArmor: {
    head: GearSchema,
    chest: GearSchema,
    legs: GearSchema
  },
  gearWeapon: GearSchema,
  gearShield: GearSchema,
  attack: { type: Number, default: 0 },
  defense: { type: Number, default: 0 },

  // ------------------- Inventory and links -------------------
  inventory: { type: String, required: true },
  appLink: { type: String, required: true },
  inventorySynced: { type: Boolean, default: false },

  // ------------------- Vendor and shop details -------------------
  vendingPoints: { type: Number, default: 0 },
  vendorType: { type: String, default: '' },
  shopPouch: { type: String, default: '' },
  pouchSize: { type: Number, default: 0 },
  shopLink: { type: String, default: '' },
  lastCollectedMonth: { type: Number, default: 0 },
  vendingSetup: {
    shopLink: { type: String },
    pouchType: { type: String },
    shopImage: { type: String },
    setupDate: { type: Date }
  },
  vendingSync: { type: Boolean, default: false },

  // ------------------- Special status -------------------
  blighted: { type: Boolean, default: false },
  blightedAt: { type: Date, default: null },
  blightStage: { type: Number, default: 0 },
  blightPaused: { type: Boolean, default: false },
  lastRollDate: { type: Date, default: null },
  deathDeadline: { type: Date, default: null },
  blightEffects: {
    rollMultiplier: { type: Number, default: 1.0 },
    noMonsters: { type: Boolean, default: false },
    noGathering: { type: Boolean, default: false }
  },
  specialWeatherUsage: {
    type: Map,
    of: Date,
    default: new Map()
  },
  ko: { type: Boolean, default: false },
  debuff: {
    active: { type: Boolean, default: false },
    endDate: { type: Date, default: null }
  },
  buff: {
    active: { type: Boolean, default: false },
    type: { type: String, default: null }, // 'chilly', 'electro', 'enduring', 'energizing', 'fireproof', 'hasty', 'hearty', 'mighty', 'sneaky', 'spicy', 'tough'
    effects: {
      blightResistance: { type: Number, default: 0 }, // Chilly Elixir
      electricResistance: { type: Number, default: 0 }, // Electro Elixir
      staminaBoost: { type: Number, default: 0 }, // Enduring Elixir
      staminaRecovery: { type: Number, default: 0 }, // Energizing Elixir
      fireResistance: { type: Number, default: 0 }, // Fireproof Elixir
      speedBoost: { type: Number, default: 0 }, // Hasty Elixir
      extraHearts: { type: Number, default: 0 }, // Hearty Elixir
      attackBoost: { type: Number, default: 0 }, // Mighty Elixir
      stealthBoost: { type: Number, default: 0 }, // Sneaky Elixir
      coldResistance: { type: Number, default: 0 }, // Spicy Elixir
      defenseBoost: { type: Number, default: 0 } // Tough Elixir
    }
  },
  failedStealAttempts: { type: Number, default: 0 },
  failedFleeAttempts: { type: Number, default: 0 },
  inJail: { type: Boolean, default: false },
  jailReleaseTime: { type: Date, default: null },
  canBeStolenFrom: { type: Boolean, default: true },
  
  // ------------------- Unified Steal Protection -------------------
  // Tracks both local and global protection from steal attempts
  stealProtection: {
    // Local protection: 2-hour cooldown after successful steal from this specific character
    localProtection: {
      isProtected: { type: Boolean, default: false },
      protectionEndTime: { type: Date, default: null }
    },
    // Global protection: 24-hour cooldown after successful steal from ANY target, or 2-hour cooldown after failed steal
    globalProtection: {
      isProtected: { type: Boolean, default: false },
      protectionType: { 
        type: String, 
        enum: ['success', 'failure', null], 
        default: null 
      },
      protectionEndTime: { type: Date, default: null }
    }
  },
  
  dailyRoll: {
    type: Map,
    of: Schema.Types.Mixed,
    default: new Map()
  },
  travelLog: [
    {
      from: { type: String },
      to: { type: String },
      date: { type: Date },
      success: { type: Boolean }
    }
  ],

  // ------------------- Additional features -------------------
  jobVoucher: {
    type: Boolean,
    default: false,
    required: true
  },
  jobVoucherJob: {
    type: String,
    default: null
  },
  spiritOrbs: { type: Number, default: 0 },

  // ------------------- Companions -------------------
  currentActivePet: { 
    type: Schema.Types.ObjectId, 
    ref: 'Pet', 
    default: null 
  },
  currentActiveMount: { 
    type: Schema.Types.ObjectId, 
    ref: 'Mount', 
    default: null 
  },

  // ------------------- Help Wanted Quest Tracking -------------------
  // Tracks Help Wanted quest completions, cooldowns, and history for this character
  helpWanted: {
    lastCompletion: { type: String, default: null }, // YYYY-MM-DD
    cooldownUntil: { type: Date, default: null },
    completions: [
      {
        date: { type: String }, // YYYY-MM-DD
        village: { type: String },
        questType: { type: String }
      }
    ]
  },

  // ------------------- Boosting System -------------------
  // Tracks which character is currently boosting this character
  boostedBy: { type: String, default: null }

}, { collection: 'characters' });

// ============================================================================
// ------------------- Pre-save hook -------------------
// Ensures jobVoucher is always false on save
// ============================================================================
characterSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('jobVoucher')) {
    this.jobVoucher = false;
  }
  
  next();
});

// ============================================================================
// ------------------- Protection Helper Methods -------------------
// ============================================================================

// Check if local protection is expired
characterSchema.methods.isLocalProtectionExpired = function() {
  if (!this.stealProtection.localProtection.isProtected) {
    return true;
  }
  
  if (!this.stealProtection.localProtection.protectionEndTime) {
    return true;
  }
  
  return new Date() >= this.stealProtection.localProtection.protectionEndTime;
};

// Check if global protection is expired
characterSchema.methods.isGlobalProtectionExpired = function() {
  if (!this.stealProtection.globalProtection.isProtected) {
    return true;
  }
  
  if (!this.stealProtection.globalProtection.protectionEndTime) {
    return true;
  }
  
  return new Date() >= this.stealProtection.globalProtection.protectionEndTime;
};

// Get remaining local protection time
characterSchema.methods.getLocalProtectionTimeLeft = function() {
  if (!this.stealProtection.localProtection.isProtected || !this.stealProtection.localProtection.protectionEndTime) {
    return 0;
  }
  
  const timeLeft = this.stealProtection.localProtection.protectionEndTime.getTime() - Date.now();
  return timeLeft > 0 ? timeLeft : 0;
};

// Get remaining global protection time
characterSchema.methods.getGlobalProtectionTimeLeft = function() {
  if (!this.stealProtection.globalProtection.isProtected || !this.stealProtection.globalProtection.protectionEndTime) {
    return 0;
  }
  
  const timeLeft = this.stealProtection.globalProtection.protectionEndTime.getTime() - Date.now();
  return timeLeft > 0 ? timeLeft : 0;
};

// Set local protection
characterSchema.methods.setLocalProtection = function(duration = 2 * 60 * 60 * 1000) { // Default 2 hours
  this.stealProtection.localProtection.isProtected = true;
  this.stealProtection.localProtection.protectionEndTime = new Date(Date.now() + duration);
};

// Set global protection
characterSchema.methods.setGlobalProtection = function(protectionType, endTime) {
  this.stealProtection.globalProtection.isProtected = true;
  this.stealProtection.globalProtection.protectionType = protectionType;
  this.stealProtection.globalProtection.protectionEndTime = endTime;
};

// Clear local protection
characterSchema.methods.clearLocalProtection = function() {
  this.stealProtection.localProtection.isProtected = false;
  this.stealProtection.localProtection.protectionEndTime = null;
};

// Clear global protection
characterSchema.methods.clearGlobalProtection = function() {
  this.stealProtection.globalProtection.isProtected = false;
  this.stealProtection.globalProtection.protectionType = null;
  this.stealProtection.globalProtection.protectionEndTime = null;
};

// Pre-save middleware to clean up expired protections
characterSchema.pre('save', function(next) {
  // Clean up expired local protection
  if (this.stealProtection.localProtection.isProtected && this.isLocalProtectionExpired()) {
    this.clearLocalProtection();
  }
  
  // Clean up expired global protection
  if (this.stealProtection.globalProtection.isProtected && this.isGlobalProtectionExpired()) {
    this.clearGlobalProtection();
  }
  
  next();
});

// ============================================================================
// ------------------- Define and export model -------------------
// ============================================================================
const Character = mongoose.model('Character', characterSchema);

module.exports = Character;
