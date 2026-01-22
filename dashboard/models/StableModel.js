// ============================================================================
// ------------------- Stable Model -------------------
// Stores stable information for characters (pets and mounts)
// ============================================================================

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Stable Schema -------------------
const StableSchema = new Schema({
  characterId: {
    type: Schema.Types.ObjectId,
    ref: 'Character',
    required: true
  },
  discordId: {
    type: String,
    required: true
  },
  maxSlots: {
    type: Number,
    default: 3,
    min: 1
  },
  storedMounts: [{
    mountId: {
      type: Schema.Types.ObjectId,
      ref: 'Mount',
      required: true
    },
    storedAt: {
      type: Date,
      default: Date.now
    }
  }],
  storedPets: [{
    petId: {
      type: Schema.Types.ObjectId,
      ref: 'Pet',
      required: true
    },
    storedAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true
});

// Indexes
StableSchema.index({ characterId: 1 }, { unique: true });
StableSchema.index({ discordId: 1 });

// ------------------- ForSaleMount Schema -------------------
const ForSaleMountSchema = new Schema({
  characterId: {
    type: Schema.Types.ObjectId,
    ref: 'Character',
    required: true
  },
  discordId: {
    type: String,
    required: true
  },
  mountId: {
    type: Schema.Types.ObjectId,
    ref: 'Mount',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  species: {
    type: String,
    required: true
  },
  level: {
    type: String,
    required: true
  },
  fee: {
    type: Number,
    default: 0
  },
  stamina: {
    type: Number,
    required: true
  },
  currentStamina: {
    type: Number,
    required: true
  },
  traits: {
    type: [String],
    default: []
  },
  region: {
    type: String
  },
  lastMountTravel: {
    type: Date
  },
  price: {
    type: Number,
    required: true
  },
  listedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// ------------------- ForSalePet Schema -------------------
const ForSalePetSchema = new Schema({
  characterId: {
    type: Schema.Types.ObjectId,
    ref: 'Character',
    required: true
  },
  discordId: {
    type: String,
    required: true
  },
  petId: {
    type: Schema.Types.ObjectId,
    ref: 'Pet',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  species: {
    type: String,
    required: true
  },
  petType: {
    type: String,
    required: true
  },
  level: {
    type: Number,
    default: 0
  },
  rollsRemaining: {
    type: Number,
    default: 0
  },
  rollCombination: {
    type: [String],
    default: []
  },
  tableDescription: {
    type: String,
    default: ''
  },
  lastRollDate: {
    type: Date
  },
  price: {
    type: Number,
    required: true
  },
  listedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// ------------------- Export Models -------------------
const Stable = mongoose.model('Stable', StableSchema);
const ForSaleMount = mongoose.model('ForSaleMount', ForSaleMountSchema);
const ForSalePet = mongoose.model('ForSalePet', ForSalePetSchema);

module.exports = {
  Stable,
  ForSaleMount,
  ForSalePet
};

