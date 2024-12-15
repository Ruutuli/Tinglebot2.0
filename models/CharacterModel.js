// ------------------- Import necessary modules -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Define the gear schema -------------------
// Schema for gear items with name and stats
const GearSchema = new Schema({
  name: { type: String, required: true },
  stats: { type: Map, of: Number, required: true }
}, { _id: false });

// ------------------- Define the pet schema -------------------
// Schema for pets associated with a character
const PetSchema = new Schema({
  name: { type: String, required: true },         // Pet's name
  species: { type: String, required: true },      // Pet's species (e.g., Chuchu, Remlit, etc.)
  level: { type: Number, default: 1 },            // Pet's level, default to 1
  perks: { type: [String], default: [] },         // Pet's list of perks
  rollsRemaining: { type: Number, default: 1 },   // Weekly rolls remaining for the pet, capped at 3
  size: { type: String, required: true },         // Pet's size (e.g., small, large)
  imageUrl: { type: String, default: '' }         // URL of the pet's image
});


// ------------------- Define the character schema -------------------
const characterSchema = new Schema({
  userId: { type: String, required: true, index: true },   // User ID associated with the character
  name: { type: String, required: true },                 // Character's name
  age: { type: Number, default: null },                   // Character's age
  height: { type: Number, default: null },                // Character's height
  maxHearts: { type: Number, required: true },            // Maximum hearts
  currentHearts: { type: Number, required: true },        // Current hearts
  maxStamina: { type: Number, required: true },           // Maximum stamina
  currentStamina: { type: Number, required: true },       // Current stamina
  pronouns: { type: String, required: true },             // Character's pronouns
  race: { type: String, required: true },                 // Character's race
  homeVillage: { type: String, required: true },          // Character's home village
  currentVillage: { type: String, default: function() { return this.homeVillage; } },  // Character's current village
  job: { type: String, required: true },                  // Character's job
  inventory: { type: String, required: true },            // Inventory link
  appLink: { type: String, required: true },              // Application link
  icon: { type: String, required: true },                 // Character icon
  blighted: { type: Boolean, default: false },            // Blighted status
  blightStage: { type: Number, default: 0 },              // Stage of blight (0-5)
  lastRollDate: { type: Date, default: null },            // Date of last roll for blighted characters
  ko: { type: Boolean, default: false },                  // KO status
  jobVoucher: { type: String, default: '' },              // Job voucher
  mount: { type: Boolean, default: false },               // Mount status
  gearArmor: {                                            // Armor gear (head, chest, legs)
    head: GearSchema,
    chest: GearSchema,
    legs: GearSchema
  },
  gearWeapon: GearSchema,                                 // Weapon gear
  gearShield: GearSchema,                                 // Shield gear
  spiritOrbs: { type: Number, default: 0 },               // Number of spirit orbs
  birthday: { type: String, default: '' },                // Character's birthday
  inventorySynced: { type: Boolean, default: false },     // Inventory sync status
  lastStaminaUsage: { type: Date, default: null },        // Last usage of stamina
  attack: { type: Number, default: 0 },                   // Attack stat
  defense: { type: Number, default: 0 },                  // Defense stat
  vendingPoints: { type: Number, default: 0 },            // Vending points
  vendorType: { type: String, default: '' },              // Vendor type
  shopPouch: { type: String, default: '' },               // Shop pouch
  lastCollectedMonth: { type: Number, default: 0 },       // Last month points were collected
  failedStealAttempts: { type: Number, default: 0 },      // Track the number of failed steal attempts
  inJail: { type: Boolean, default: false },              // Status for whether the character is in jail
  jailReleaseTime: { type: Date, default: null },         // Time when the character will be released from jail
  canBeStolenFrom: { type: Boolean, default: true },      // Whether the character can be stolen from (default true)
  failedFleeAttempts: { type: Number, default: 0 },       // Tracks the number of failed flee attempts

  // New field for pets
  pets: { type: [PetSchema], default: [] },               // Array of pets associated with the character

  // New field for debuff status
  debuff: {                                               // Tracks the debuff status for KO recovery
    active: { type: Boolean, default: false },            // Whether the debuff is currently active
    endDate: { type: Date, default: null }                // The date when the debuff expires
  }
}, { collection: 'characters' });

// ------------------- Define the character model -------------------
const Character = mongoose.model('Character', characterSchema);

module.exports = Character;
