// ============================================================================
// ------------------- Secret Santa Database Models -------------------
// Models for Roots-themed Secret Santa art gift exchange
// ============================================================================

const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================================
// ------------------- Participant Model -------------------
// ============================================================================

const secretSantaParticipantSchema = new Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  discordName: { type: String, required: true },
  isSubstitute: { 
    type: String, 
    enum: ['yes', 'no', 'only_sub'], 
    default: 'no',
    required: true 
  },
  characterLinks: { type: [String], default: [] },
  preferredCharacterRequests: { type: String, default: '' },
  otherCharacterRequests: { type: String, default: '' },
  contentToAvoid: { type: String, default: '' },
  membersToAvoid: { type: [String], default: [] },
  otherNotes: { type: String, default: '' },
  signedUpAt: { type: Date, default: Date.now },
  matchedWith: { type: String, default: null }, // userId of their giftee
  receivedAssignment: { type: Boolean, default: false },
}, {
  timestamps: true
});

// Index for faster lookups (userId already has index from unique: true)
secretSantaParticipantSchema.index({ isSubstitute: 1 });

// ============================================================================
// ------------------- Match Model -------------------
// ============================================================================

const secretSantaMatchSchema = new Schema({
  santaId: { type: String, required: true },
  gifteeId: { type: String, required: true },
  matchedAt: { type: Date, default: Date.now },
  isPending: { type: Boolean, default: true }, // true for pending matches, false for approved matches
}, {
  timestamps: true
});

// Indexes for faster lookups
secretSantaMatchSchema.index({ santaId: 1 });
secretSantaMatchSchema.index({ gifteeId: 1 });
secretSantaMatchSchema.index({ isPending: 1 });

// ============================================================================
// ------------------- Temp Signup Model (TTL auto-cleanup) -------------------
// ============================================================================

const tempSignupDataSchema = new Schema({
  userId: { type: String, required: true },
  isSubstitute: { type: String, enum: ['yes', 'no', 'only_sub'], required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true } // For TTL index
}, {
  timestamps: true
});

// Create TTL index - documents will be automatically deleted after 30 minutes
tempSignupDataSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// ============================================================================
// ------------------- Settings Model (single document) -------------------
// ============================================================================

const secretSantaSettingsSchema = new Schema({
  signupDeadline: { type: Date, required: true },
  submissionDeadline: { type: Date, required: true },
  signupsOpen: { type: Boolean, default: true },
  matched: { type: Boolean, default: false },
  matchedAt: { type: Date, default: null },
  matchesApproved: { type: Boolean, default: false },
  blacklistedUsers: { type: [String], default: [] }, // Array of user IDs or usernames
}, {
  timestamps: true
});

// Ensure only one settings document exists
secretSantaSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    // Default settings: signups close Nov 30, submissions due Jan 14
    const now = new Date();
    const currentYear = now.getFullYear();
    const signupDeadline = new Date(currentYear, 10, 30, 23, 59, 59); // Nov 30, 11:59 PM
    const submissionDeadline = new Date(currentYear + 1, 0, 14, 23, 59, 59); // Jan 14, 11:59 PM
    
    settings = new this({
      signupDeadline,
      submissionDeadline,
      signupsOpen: true,
      matched: false,
      matchesApproved: false
    });
    await settings.save();
  }
  return settings;
};

// ============================================================================
// ------------------- Export Models -------------------
// ============================================================================

const SecretSantaParticipant = mongoose.models.SecretSantaParticipant || 
  mongoose.model('SecretSantaParticipant', secretSantaParticipantSchema);

const SecretSantaMatch = mongoose.models.SecretSantaMatch || 
  mongoose.model('SecretSantaMatch', secretSantaMatchSchema);

const TempSignupData = mongoose.models.TempSignupData || 
  mongoose.model('TempSignupData', tempSignupDataSchema);

const SecretSantaSettings = mongoose.models.SecretSantaSettings || 
  mongoose.model('SecretSantaSettings', secretSantaSettingsSchema);

module.exports = {
  SecretSantaParticipant,
  SecretSantaMatch,
  TempSignupData,
  SecretSantaSettings
};

