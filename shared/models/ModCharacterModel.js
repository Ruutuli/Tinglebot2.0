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
// ------------------- Define the main mod character schema -------------------
// Everything related to mod character data - unlimited hearts/stamina
// ============================================================================
const modCharacterSchema = new Schema({
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

  // ------------------- Mod Character Special Properties -------------------
  isModCharacter: { type: Boolean, default: true },
  modTitle: { type: String, required: true }, // Oracle, Dragon, Sage, etc.
  modType: { type: String, required: true }, // Power, Courage, Wisdom, Light, Water, Forest, Shadow
  modOwner: { type: String, required: true }, // The mod who owns this character
  unlimitedHearts: { type: Boolean, default: true },
  unlimitedStamina: { type: Boolean, default: true },

  // ------------------- Health and stamina (unlimited for mod characters) -------------------
  maxHearts: { type: Number, default: 999 }, // Unlimited hearts
  currentHearts: { type: Number, default: 999 }, // Always full
  maxStamina: { type: Number, default: 999 }, // Unlimited stamina
  currentStamina: { type: Number, default: 999 }, // Always full
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
  inventorySynced: { type: Boolean, default: true }, // Mod characters are always synced

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

  // ------------------- Special status (mod characters are immune to most negative effects) -------------------
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
  failedStealAttempts: { type: Number, default: 0 },
  failedFleeAttempts: { type: Number, default: 0 },
  inJail: { type: Boolean, default: false },
  jailReleaseTime: { type: Date, default: null },
  canBeStolenFrom: { type: Boolean, default: false }, // Mod characters cannot be stolen from
  dailyRoll: {
    type: Map,
    of: Schema.Types.Mixed,
    default: new Map()
  },

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
  }

}, { collection: 'modcharacters' });

// ============================================================================
// ------------------- Pre-save hook -------------------
// Ensures mod character properties are always set correctly
// ============================================================================
modCharacterSchema.pre('save', function (next) {
  // Ensure mod character flags are set
  this.isModCharacter = true;
  this.unlimitedHearts = true;
  this.unlimitedStamina = true;
  
  // Ensure hearts and stamina are always at max for mod characters
  this.currentHearts = this.maxHearts;
  this.currentStamina = this.maxStamina;
  
  // Ensure mod characters are immune to negative effects
  this.blighted = false;
  this.blightedAt = null;
  this.blightStage = 0;
  this.blightPaused = false;
  this.ko = false;
  this.debuff = {
    active: false,
    endDate: null
  };
  this.inJail = false;
  this.jailReleaseTime = null;
  this.canBeStolenFrom = false; // Mod characters cannot be stolen from
  
  // Reset blight effects
  this.blightEffects = {
    rollMultiplier: 1.0,
    noMonsters: false,
    noGathering: false
  };
  
  // Allow job vouchers for mod characters (don't force to false)
  // Job vouchers are a special feature for mod characters
  
  // Ensure all mod characters use the shared inventory
  const MOD_SHARED_INVENTORY_LINK = 'https://docs.google.com/spreadsheets/d/17XE0IOXSjVx47HVQ4FdcvEXm7yeg51KVkoiamD5dmKs/edit?usp=sharing';
  this.inventory = MOD_SHARED_INVENTORY_LINK;
  
  // Ensure mod characters are always considered synced
  this.inventorySynced = true;
  
  next();
});

// ============================================================================
// ------------------- Define and export model -------------------
// ============================================================================
const ModCharacter = mongoose.model('ModCharacter', modCharacterSchema);

module.exports = ModCharacter; 