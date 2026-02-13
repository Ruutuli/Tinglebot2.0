const mongoose = require('mongoose');

const tempDataSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    index: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    // Battle/Raid specific fields
    battleId: String,
    monster: {
      name: String,
      nameMapping: String,
      image: String,
      tier: Number,
      hearts: {
        max: Number,
        current: Number
      }
    },
    progress: String,
    isBloodMoon: Boolean,
    startTime: Number,
    villageId: String,
    status: String,
    participants: [{
      userId: String,
      characterId: String,
      name: String,
      damage: Number,
      joinedAt: Number,
      // Character state at time of joining
      characterState: {
        currentHearts: Number,
        maxHearts: Number,
        currentStamina: Number,
        maxStamina: Number,
        attack: Number,
        defense: Number,
        gearArmor: {
          head: mongoose.Schema.Types.Mixed,
          chest: mongoose.Schema.Types.Mixed,
          legs: mongoose.Schema.Types.Mixed
        },
        gearWeapon: mongoose.Schema.Types.Mixed,
        gearShield: mongoose.Schema.Types.Mixed,
        ko: Boolean
      },
      // Battle performance tracking
      battleStats: {
        damageDealt: Number,
        healingDone: Number,
        buffsApplied: [mongoose.Schema.Types.Mixed],
        debuffsReceived: [mongoose.Schema.Types.Mixed],
        lastAction: Date
      }
    }],
    analytics: {
      totalDamage: Number,
      participantCount: Number,
      averageDamagePerParticipant: Number,
      monsterTier: Number,
      villageId: String,
      success: Boolean,
      startTime: Date,
      endTime: Date,
      duration: Number
    },
    timestamps: {
      started: Number,
      lastUpdated: Number
    },
    // Other existing fields
    submissionId: String,
    fileUrl: String,
    fileName: String,
    title: String,
    userId: String,
    username: String,
    userAvatar: String,
    category: String,
    questEvent: String,
    questBonus: String,
    baseSelections: [String],
    baseCounts: {
      type: Map,
      of: Number
    },
    typeMultiplierSelections: [String],
    productMultiplierValue: String,
    addOnsApplied: [{
      addOn: String,
      count: Number
    }],
    specialWorksApplied: [{
      work: String,
      count: Number
    }],
    typeMultiplierCounts: {
      type: Map,
      of: Number
    },
    finalTokenAmount: Number,
    tokenCalculation: String,
    collab: mongoose.Schema.Types.Mixed,
    blightId: String,
    tokenTracker: String,
    createdAt: Date,
    updatedAt: Date
  },
  type: {
    type: String,
    required: true,
    enum: [
      // Art & Submissions
      'submission',    // Art/writing submissions
      
      // Character & Stats
      'healing',       // Healing requests
      'boosting',      // Boosting requests
      'pendingEdit',   // Pending character edit requests
      'stats',         // Character stats tracking
      
      // Economy & Trading
      'vending',       // Vending requests
      'trade',         // Trade requests
      'delivery',      // Delivery requests
      'quest',         // Quest tracking
      
      // Crafting
      'craftingContinue',        // Crafting continuation state
      'craftingMaterialSelection', // Crafting material selection state
      
      // Combat & Encounters
      'battle',        // Battle progress
      'encounter',     // Mount encounters
      'blight',        // Blight healing requests
      'monthly_mount', // Monthly mount encounter tracking
      
      // World & Environment
      'travel',        // Travel cooldowns
      'travelEncounter', // Travel monster encounter state (failsafe after bot restart)
      'gather',        // Gathering cooldowns
      'weather',       // Weather data caching
      'location',      // Location tracking
      
      // System & Maintenance
      'cache',         // General caching
      'session',       // User sessions
      'temp',         // Temporary data
      'pendingSheetOperation' // Pending Google Sheets operations
    ],
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  }
});

// Compound index for efficient queries
tempDataSchema.index({ type: 1, key: 1 });

// TTL index: automatically delete documents when expiresAt <= now
tempDataSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Pre-save middleware to set expiration based on type
tempDataSchema.pre('save', function(next) {
  // Debug info removed to reduce log bloat
  
  const now = new Date();
  
  // Prevent weather data storage for non-production bots
  if (this.type === 'weather' && this.data?.botId && this.data.botId !== process.env.GUILD_ID) {
    return next(new Error('Weather data storage not allowed for this bot'));
  }
  
  // Set expiration based on type
  switch (this.type) {
    case 'blight':
      this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      break;
    case 'boosting':
      this.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
      break;
    case 'monthly':
      // Set to end of current month
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      lastDay.setHours(23, 59, 59, 999);
      this.expiresAt = lastDay;
      break;
    case 'delivery':
      this.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
      break;
    case 'trade':
      this.expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours
      break;
    case 'pendingEdit':
      this.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      break;
    case 'submission':
      this.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
      break;
    case 'craftingContinue':
      this.expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      break;
    case 'craftingMaterialSelection':
      this.expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      break;
    case 'travelEncounter':
      this.expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes (match encounter timeout)
      break;
    default:
      this.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
  }
  
  // Debug info removed to reduce log bloat
  next();
});

// Static method to cleanup old entries
tempDataSchema.statics.cleanup = async function(maxAgeInMs = 86400000) { // Default 24 hours
  const cutoff = new Date(Date.now() - maxAgeInMs);
  const result = await this.deleteMany({ expiresAt: { $lt: new Date() } });
  if (result.deletedCount > 0) {
    console.log(`[TempDataModel]: 🧹 Cleaned up ${result.deletedCount} expired entries`);
  }
  return result;
};

// Static method to cleanup specific type entries
tempDataSchema.statics.cleanupByType = async function(type) {
  let result;
  
  if (type === 'boosting') {
    // Special cleanup for boosting data - remove expired entries and fulfilled boosts that have expired
    result = await this.deleteMany({
      type: 'boosting',
      $or: [
        { expiresAt: { $lt: new Date() } },
        { 'data.status': 'expired' },
        { 'data.status': 'fulfilled', 'data.boostExpiresAt': { $lt: Date.now() } }
      ]
    });
  } else {
    // Standard cleanup for other types
    result = await this.deleteMany({ type, expiresAt: { $lt: new Date() } });
  }
  
  if (result.deletedCount > 0) {
    console.log(`[TempDataModel]: 🧹 Cleaned up ${result.deletedCount} expired ${type} entries`);
  }
  return result;
};

// Static method to find by type and key
tempDataSchema.statics.findByTypeAndKey = async function(type, key) {
  const now = new Date();
  return this.findOne({ 
    type, 
    key, 
    expiresAt: { $gt: now }
  });
};

// Static method to find all by type
tempDataSchema.statics.findAllByType = async function(type) {
  const now = new Date();
  return this.find({ type, expiresAt: { $gt: now } });
};

// Static method to find all expired entries
tempDataSchema.statics.findExpired = async function() {
  return this.find({ expiresAt: { $lt: new Date() } });
};

// Static method to extend expiration
tempDataSchema.statics.extendExpiration = async function(type, key, additionalTimeMs) {
  return this.findOneAndUpdate(
    { type, key },
    { $set: { expiresAt: new Date(Date.now() + additionalTimeMs) } },
    { new: true }
  );
};

const TempData = mongoose.model('TempData', tempDataSchema);

module.exports = TempData; 