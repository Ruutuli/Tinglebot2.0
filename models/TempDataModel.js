const mongoose = require('mongoose');

const tempDataSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    index: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'healing',      // Healing requests
      'vending',      // Vending requests
      'boosting',     // Boosting requests
      'battle',       // Battle progress
      'encounter',    // Mount encounters
      'blight',       // Blight healing requests
      'travel',       // Travel cooldowns
      'gather',       // Gathering cooldowns
      'monthly_mount', // Monthly mount encounter tracking
      'delivery',     // Delivery requests
      'trade',        // Trade requests
      'pendingEdit',  // Pending character edit requests
      'submission',   // Art/writing submissions
      'weather'       // Weather data caching
    ],
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  }
});

// Compound index for efficient queries
tempDataSchema.index({ type: 1, key: 1 });

// Pre-save middleware to set expiration based on type
tempDataSchema.pre('save', function(next) {
  const now = new Date();
  
  // Set expiration based on type
  switch (this.type) {
    case 'blight':
      this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
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
    default:
      this.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours
  }
  
  next();
});

// Static method to cleanup old entries
tempDataSchema.statics.cleanup = async function(maxAgeInMs = 86400000) { // Default 24 hours
  const cutoff = new Date(Date.now() - maxAgeInMs);
  return this.deleteMany({ expiresAt: { $lt: new Date() } });
};

// Static method to find by type and key
tempDataSchema.statics.findByTypeAndKey = async function(type, key) {
  return this.findOne({ type, key, expiresAt: { $gt: new Date() } });
};

// Static method to find all by type
tempDataSchema.statics.findAllByType = async function(type) {
  return this.find({ type, expiresAt: { $gt: new Date() } });
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