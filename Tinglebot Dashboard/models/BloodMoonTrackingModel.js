// ============================================================================
// 🌕 Blood Moon Tracking Model
// Stores Blood Moon announcement tracking data persistently
// ============================================================================

const mongoose = require('mongoose');

const bloodMoonTrackingSchema = new mongoose.Schema({
  channelId: {
    type: String,
    required: true,
    index: true
  },
  announcementType: {
    type: String,
    enum: ['start', 'end'],
    required: true
  },
  announcementDate: {
    type: String,
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 7 * 24 * 60 * 60 // Auto-delete after 7 days
  }
}, {
  timestamps: true
});

// Compound index to ensure unique announcements per channel per day per type
bloodMoonTrackingSchema.index(
  { channelId: 1, announcementType: 1, announcementDate: 1 },
  { unique: true }
);

// Static method to check if announcement was already sent
bloodMoonTrackingSchema.statics.hasAnnouncementBeenSent = async function(channelId, announcementType, date) {
  try {
    const existing = await this.findOne({
      channelId,
      announcementType,
      announcementDate: date
    });
    return !!existing;
  } catch (error) {
    console.error('[BloodMoonTrackingModel]: Error checking announcement status:', error);
    return false;
  }
};

// Static method to mark announcement as sent
bloodMoonTrackingSchema.statics.markAnnouncementAsSent = async function(channelId, announcementType, date) {
  try {
    const tracking = new this({
      channelId,
      announcementType,
      announcementDate: date
    });
    await tracking.save();
    console.log(`[BloodMoonTrackingModel]: 📝 Marked ${announcementType} announcement as sent for channel ${channelId} on ${date}`);
    return true;
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error - announcement already marked
      console.log(`[BloodMoonTrackingModel]: ⏭️ ${announcementType} announcement already marked for channel ${channelId} on ${date}`);
      return true;
    }
    console.error('[BloodMoonTrackingModel]: Error marking announcement as sent:', error);
    return false;
  }
};

// Static method to get tracking status for debugging
bloodMoonTrackingSchema.statics.getTrackingStatus = async function() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const startAnnouncements = await this.find({
      announcementType: 'start',
      announcementDate: today
    });
    const endAnnouncements = await this.find({
      announcementType: 'end',
      announcementDate: today
    });
    return {
      startAnnouncements: startAnnouncements.map(a => a.channelId),
      endAnnouncements: endAnnouncements.map(a => a.channelId),
      totalStart: startAnnouncements.length,
      totalEnd: endAnnouncements.length
    };
  } catch (error) {
    console.error('[BloodMoonTrackingModel]: Error getting tracking status:', error);
    return { startAnnouncements: [], endAnnouncements: [], totalStart: 0, totalEnd: 0 };
  }
};

// Static method to clean up old tracking data
bloodMoonTrackingSchema.statics.cleanupOldData = async function() {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep last 7 days
    const result = await this.deleteMany({
      createdAt: { $lt: cutoffDate }
    });
    if (result.deletedCount > 0) {
      console.log(`[BloodMoonTrackingModel]: 🧹 Cleaned up ${result.deletedCount} old tracking records`);
    }
    return result.deletedCount;
  } catch (error) {
    console.error('[BloodMoonTrackingModel]: Error cleaning up old data:', error);
    return 0;
  }
};

module.exports = mongoose.model('BloodMoonTracking', bloodMoonTrackingSchema); 