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
  failedStealAttempts: { type: Number, default: 0 },
  failedFleeAttempts: { type: Number, default: 0 },
  inJail: { type: Boolean, default: false },
  jailReleaseTime: { type: Date, default: null },
  canBeStolenFrom: { type: Boolean, default: true },
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
// ------------------- Define and export model -------------------
// ============================================================================
const Character = mongoose.model('Character', characterSchema);

module.exports = Character;
