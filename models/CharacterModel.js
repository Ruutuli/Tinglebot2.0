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
  blightPauseInfo: {
    pausedAt: { type: Date, default: null },
    pausedBy: { type: String, default: null },
    pausedByUsername: { type: String, default: null },
    reason: { type: String, default: null }
  },
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
  jailStartTime: { type: Date, default: null },
  jailDurationMs: { type: Number, default: null },
  jailBoostSource: { type: String, default: null },
  canBeStolenFrom: { type: Boolean, default: true },
  
  // ------------------- Steal Protection -------------------
  // Tracks protection from steal attempts
  stealProtection: {
    // Protection: 2-hour cooldown after failed steal, midnight EST after successful steal
    isProtected: { type: Boolean, default: false },
    protectionEndTime: { type: Date, default: null }
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

// Check if protection is expired
characterSchema.methods.isProtectionExpired = function() {
  if (!this.stealProtection.isProtected) {
    return true;
  }
  
  if (!this.stealProtection.protectionEndTime) {
    return true;
  }
  
  return new Date() >= this.stealProtection.protectionEndTime;
};

// Get remaining protection time
characterSchema.methods.getProtectionTimeLeft = function() {
  if (!this.stealProtection.isProtected || !this.stealProtection.protectionEndTime) {
    return 0;
  }
  
  const timeLeft = this.stealProtection.protectionEndTime.getTime() - Date.now();
  return timeLeft > 0 ? timeLeft : 0;
};

// Set protection
characterSchema.methods.setProtection = function(duration = 2 * 60 * 60 * 1000) { // Default 2 hours
  this.stealProtection.isProtected = true;
  this.stealProtection.protectionEndTime = new Date(Date.now() + duration);
};

// Clear protection
characterSchema.methods.clearProtection = function() {
  this.stealProtection.isProtected = false;
  this.stealProtection.protectionEndTime = null;
};

// Pre-save middleware to clean up expired protections
characterSchema.pre('save', function(next) {
  // Clean up expired protection
  if (this.stealProtection.isProtected && this.isProtectionExpired()) {
    this.clearProtection();
  }
  
  next();
});

// ============================================================================
// ------------------- Define and export model -------------------
// ============================================================================
const Character = mongoose.model('Character', characterSchema);

module.exports = Character;
