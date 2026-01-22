// ============================================================================
// ------------------- Notification Model -------------------
// Stores notifications for users (e.g., character denial notifications)
// ============================================================================

const mongoose = require('mongoose');
const { Schema } = mongoose;

const notificationSchema = new Schema({
  userId: { 
    type: String, 
    required: true, 
    index: true 
  },
  type: { 
    type: String, 
    required: true,
    enum: ['character_denied', 'character_accepted', 'oc_approved', 'oc_needs_changes', 'oc_resubmitted', 'system'],
    default: 'system'
  },
  title: { 
    type: String, 
    required: true 
  },
  message: { 
    type: String, 
    required: true 
  },
  characterId: { 
    type: String, 
    default: null 
  },
  characterName: { 
    type: String, 
    default: null 
  },
  read: { 
    type: Boolean, 
    default: false 
  },
  readAt: {
    type: Date,
    default: null
  },
  // DM and fallback tracking
  dmDelivered: {
    type: Boolean,
    default: false
  },
  fallbackPosted: {
    type: Boolean,
    default: false
  },
  // Links array for notification actions
  links: [{
    text: { type: String, required: true },
    url: { type: String, required: true }
  }],
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  collection: 'notifications',
  timestamps: true
});

// Index for efficient queries
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
