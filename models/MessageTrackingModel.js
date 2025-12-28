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
  const query = { guildId };
  if (dayKey) {
    query.dayKey = dayKey;
  } else {
    // Default to today
    const today = new Date().toISOString().split('T')[0];
    query.dayKey = today;
  }
  
  return this.countDocuments(query);
};

// Static method to get message count for a specific day
MessageTrackingSchema.statics.getTodayMessageCount = function(guildId) {
  const today = new Date().toISOString().split('T')[0];
  return this.getDailyMessageCount(guildId, today);
};

// Static method to get message count for last 7 days
MessageTrackingSchema.statics.getWeeklyMessageCount = function(guildId) {
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);
  
  const dayKeys = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(sevenDaysAgo);
    date.setDate(sevenDaysAgo.getDate() + i);
    dayKeys.push(date.toISOString().split('T')[0]);
  }
  
  return this.countDocuments({
    guildId,
    dayKey: { $in: dayKeys }
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
