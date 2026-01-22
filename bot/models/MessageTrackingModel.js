const mongoose = require('mongoose');

const MessageTrackingSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  channelId: {
    type: String,
    required: true,
    index: true
  },
  messageId: {
    type: String,
    required: true,
    unique: true
  },
  content: {
    type: String,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  dayKey: {
    type: String,
    required: true,
    index: true
  } // Format: YYYY-MM-DD for daily aggregation
});

// Compound indexes for efficient queries
MessageTrackingSchema.index({ guildId: 1, dayKey: 1 });
MessageTrackingSchema.index({ guildId: 1, userId: 1, dayKey: 1 });
MessageTrackingSchema.index({ guildId: 1, channelId: 1, dayKey: 1 });

// Static method to get daily message count for a guild
MessageTrackingSchema.statics.getDailyMessageCount = function(guildId, dayKey = null) {
  // Thoroughly check if database connection is ready and functional
  const connection = mongoose.connection;
  if (connection.readyState !== 1 || !connection.db) {
    return Promise.resolve(0);
  }
  
  const query = { guildId };
  if (dayKey) {
    query.dayKey = dayKey;
  } else {
    // Default to today
    const today = new Date().toISOString().split('T')[0];
    query.dayKey = today;
  }
  
  // Use countDocuments with error handling and timeout
  // Wrap in a promise that rejects quickly if connection issues occur
  return new Promise((resolve) => {
    // Double-check connection before executing
    if (connection.readyState !== 1 || !connection.db) {
      return resolve(0);
    }
    
    // Execute query with timeout protection
    const queryPromise = this.countDocuments(query);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 2000)
    );
    
    Promise.race([queryPromise, timeoutPromise])
      .then(result => resolve(result))
      .catch(() => resolve(0));
  });
};

// Static method to get message count for a specific day
MessageTrackingSchema.statics.getTodayMessageCount = function(guildId) {
  const today = new Date().toISOString().split('T')[0];
  return this.getDailyMessageCount(guildId, today);
};

// Static method to get message count for last 7 days
MessageTrackingSchema.statics.getWeeklyMessageCount = function(guildId) {
  // Thoroughly check if database connection is ready and functional
  const connection = mongoose.connection;
  if (connection.readyState !== 1 || !connection.db) {
    return Promise.resolve(0);
  }
  
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  
  const dayKeys = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(sevenDaysAgo);
    date.setDate(sevenDaysAgo.getDate() + i);
    dayKeys.push(date.toISOString().split('T')[0]);
  }
  
  // Use countDocuments with error handling and timeout
  return new Promise((resolve) => {
    // Double-check connection before executing
    if (connection.readyState !== 1 || !connection.db) {
      return resolve(0);
    }
    
    // Execute query with timeout protection
    const queryPromise = this.countDocuments({
      guildId,
      dayKey: { $in: dayKeys }
    });
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), 2000)
    );
    
    Promise.race([queryPromise, timeoutPromise])
      .then(result => resolve(result))
      .catch(() => resolve(0));
  });
};

// Static method to clean up old messages (optional - for database maintenance)
MessageTrackingSchema.statics.cleanupOldMessages = function(daysToKeep = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  const cutoffDayKey = cutoffDate.toISOString().split('T')[0];
  
  return this.deleteMany({
    dayKey: { $lt: cutoffDayKey }
  });
};

module.exports = mongoose.model('MessageTracking', MessageTrackingSchema);
