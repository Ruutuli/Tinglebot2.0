// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Define reusable schemas -------------------

// Schema for gear items with name and stats
const GearSchema = new Schema({
  name: { type: String, required: true },           // Name of the gear
  stats: { type: Map, of: Number, required: true }    // Gear stats as key-value pairs
}, { _id: false }); // Disable _id for nested schema

// ------------------- Define the main character schema -------------------
const characterSchema = new Schema({
  // ------------------- Basic character information -------------------
  userId: { type: String, required: true, index: true }, // User ID associated with the character
  name: { type: String, required: true },                // Character's name
  age: { type: Number, default: null },                  // Character's age
  height: { type: Number, default: null },               // Character's height
  pronouns: { type: String, required: true },            // Character's pronouns
  race: { type: String, required: true },                // Character's race
  homeVillage: { type: String, required: true },         // Character's home village
  currentVillage: {                                      // Current village; defaults to home village
    type: String,
    default: function() { return this.homeVillage; }
  },
  job: { type: String, required: true },                 // Character's job
  jobDateChanged: { type: Date, default: null },         // Date of the last job change
  icon: { type: String, required: true },                // Character icon URL
  birthday: { type: String, default: '' },               // Character's birthday

  // ------------------- Health and stamina -------------------
  maxHearts: { type: Number, required: true },           // Maximum hearts
  currentHearts: { type: Number, required: true },       // Current hearts
  maxStamina: { type: Number, required: true },          // Maximum stamina
  currentStamina: { type: Number, required: true },      // Current stamina
  lastStaminaUsage: { type: Date, default: null },       // Last usage of stamina
  lastSpecialWeatherGather: { type: Date, default: null }, // Last special weather gathering

  // ------------------- Gear and stats -------------------
  gearArmor: {                                           // Armor gear (head, chest, legs)
    head: GearSchema,
    chest: GearSchema,
    legs: GearSchema
  },
  gearWeapon: GearSchema,                                // Weapon gear
  gearShield: GearSchema,                                // Shield gear
  attack: { type: Number, default: 0 },                  // Attack stat
  defense: { type: Number, default: 0 },                 // Defense stat

  // ------------------- Inventory and links -------------------
  inventory: { type: String, required: true },           // Inventory link
  appLink: { type: String, required: true },             // Application link
  inventorySynced: { type: Boolean, default: false },    // Inventory sync status

  // ------------------- Vendor and shop details -------------------
  vendingPoints: { type: Number, default: 0 },           // Vending points
  vendorType: { type: String, default: '' },             // Vendor type
  shopPouch: { type: String, default: '' },              // Shop pouch
  pouchSize: { type: Number, default: 0 },               // Pouch size
  shopLink: { type: String, default: '' },               // Link to vending shop spreadsheet
  lastCollectedMonth: { type: Number, default: 0 },      // Last month points were collected
  vendingSetup: {
    shopLink: { type: String },
    pouchType: { type: String },
    shopImage: { type: String },
    setupDate: { type: Date }
  },
  vendingSync: { type: Boolean, default: false },        // Vending sync status

  // ------------------- Special status -------------------
  blighted: { type: Boolean, default: false },           // Blighted status
  blightStage: { type: Number, default: 0 },             // Stage of blight (0-5)
  blightPaused: { type: Boolean, default: false },
  lastRollDate: { type: Date, default: null },           // Date of last roll for blighted characters
  deathDeadline: { type: Date, default: null },
  blightEffects: {                                       // Stage-specific blight effects
    rollMultiplier: { type: Number, default: 1.0 },     // Multiplier for rolls (Stage 2: 1.5)
    noMonsters: { type: Boolean, default: false },       // No monster encounters (Stage 3+)
    noGathering: { type: Boolean, default: false },      // Cannot gather items (Stage 4)
  },
  ko: { type: Boolean, default: false },                 // KO status
  debuff: {                                            // Debuff status for KO recovery
    active: { type: Boolean, default: false },
    endDate: { type: Date, default: null }
  },
  failedStealAttempts: { type: Number, default: 0 },     // Number of failed steal attempts
  failedFleeAttempts: { type: Number, default: 0 },      // Number of failed flee attempts
  inJail: { type: Boolean, default: false },             // Jail status
  jailReleaseTime: { type: Date, default: null },        // Jail release time
  canBeStolenFrom: { type: Boolean, default: true },     // Whether the character can be stolen from
  dailyRoll: {                                          // Daily roll tracking for various activities
    type: Map,
    of: Date,
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
  mount: { type: Boolean, default: false },              // Mount status

  // ------------------- Pet References -------------------
  currentActivePet: { type: Schema.Types.ObjectId, ref: 'Pet', default: null },

  spiritOrbs: { type: Number, default: 0 }               // Number of spirit orbs
}, { collection: 'characters' });

// Add pre-save hook to ensure jobVoucher is always false by default
characterSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('jobVoucher')) {
    this.jobVoucher = false;
  }
  next();
});

// ------------------- Define the Character model -------------------
const Character = mongoose.model('Character', characterSchema);

// ------------------- Export the Character model -------------------
module.exports = Character;
