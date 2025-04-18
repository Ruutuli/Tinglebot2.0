// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { handleError } = require('../utils/globalErrorHandler');
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
  vendingSetup: { type: Boolean, default: false },       // Vending setup status
  vendingSync: { type: Boolean, default: false },        // Vending sync status
  shopImage: { type: String, default: '' },              // Shop image link

  // ------------------- Special status -------------------
  blighted: { type: Boolean, default: false },           // Blighted status
  blightStage: { type: Number, default: 0 },             // Stage of blight (0-5)
  lastRollDate: { type: Date, default: null },           // Date of last roll for blighted characters
  deathDeadline: { type: Date, default: null },
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
  lastGatherDate: { type: Date, default: null },         // Date of last gather action
  lastLootDate: { type: Date, default: null },           // Date of last loot action

  // ------------------- Additional features -------------------
  jobVoucher: { type: Boolean, default: true },          // Job voucher status
  jobVoucherJob: { type: String, default: null },        // Job selected for the voucher
  mount: { type: Boolean, default: false },              // Mount status

  // ------------------- Pet References -------------------
  currentActivePet: { type: Schema.Types.ObjectId, ref: 'Pet', default: null },

  spiritOrbs: { type: Number, default: 0 }               // Number of spirit orbs
}, { collection: 'characters' });

// ------------------- Define the Character model -------------------
const Character = mongoose.model('Character', characterSchema);

// ------------------- Export the Character model -------------------
module.exports = Character;
