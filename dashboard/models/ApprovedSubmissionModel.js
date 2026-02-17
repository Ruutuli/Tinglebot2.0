// ============================================================================
// ------------------- Approved Submission Model -------------------
// Database model for storing approved art and writing submissions
// ============================================================================

const mongoose = require('mongoose');

const approvedSubmissionSchema = new mongoose.Schema({
  // ------------------- Basic Submission Info -------------------
  submissionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: false // Optional for writing submissions
  },
  category: {
    type: String,
    enum: ['art', 'writing'],
    required: true
  },
  
  // ------------------- User Information -------------------
  userId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true
  },
  userAvatar: {
    type: String,
    default: null
  },
  
  // ------------------- File Information -------------------
  fileUrl: {
    type: String,
    required: false // Optional for writing submissions
  },
  messageUrl: {
    type: String,
    required: true
  },
  
  // ------------------- Token Information -------------------
  finalTokenAmount: {
    type: Number,
    required: true
  },
  tokenCalculation: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  
  // ------------------- Art-Specific Fields -------------------
  baseSelections: [{
    type: String
  }],
  baseCounts: {
    type: Map,
    of: Number,
    default: new Map()
  },
  typeMultiplierSelections: [{
    type: String
  }],
  typeMultiplierCounts: {
    type: Map,
    of: Number,
    default: new Map()
  },
  productMultiplierValue: {
    type: String,
    default: null
  },
  addOnsApplied: [{
    addOn: String,
    count: Number
  }],
  specialWorksApplied: [{
    work: String,
    count: Number
  }],
  
  // ------------------- Writing-Specific Fields -------------------
  wordCount: {
    type: Number,
    default: null
  },
  link: {
    type: String,
    default: null
  },
  description: {
    type: String,
    default: null
  },
  
  // ------------------- Collaboration -------------------
  collab: {
    type: [String], // Array of Discord user mentions
    default: []
  },
  
  // ------------------- Blight Healing Information -------------------
  blightId: {
    type: String,
    default: null
  },
  
  // ------------------- Token Tracker Information -------------------
  tokenTracker: {
    type: String,
    default: null
  },
  
  // ------------------- Quest/Event Information -------------------
  questEvent: {
    type: String,
    default: 'N/A'
  },
  questBonus: {
    type: String,
    default: 'N/A'
  },
  
  // ------------------- Approval Information -------------------
  approvedBy: {
    type: String,
    required: true
  },
  approvedAt: {
    type: Date,
    default: Date.now
  },
  approvalMessageId: {
    type: String,
    default: null
  },
  pendingNotificationMessageId: {
    type: String,
    default: null
  },
  
  // ------------------- Timestamps -------------------
  submittedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // ------------------- Tagged Characters -------------------
  taggedCharacters: {
    type: [String], // Array of character names
    default: []
  },

  // ------------------- Group Art Meme -------------------
  isGroupMeme: {
    type: Boolean,
    default: false
  },
  memeMode: {
    type: String,
    default: null
  },
  memeTemplate: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// ------------------- Indexes -------------------
approvedSubmissionSchema.index({ userId: 1, submittedAt: -1 });
approvedSubmissionSchema.index({ category: 1, submittedAt: -1 });
approvedSubmissionSchema.index({ approvedAt: -1 });

// ------------------- Virtual Fields -------------------
approvedSubmissionSchema.virtual('isCollaboration').get(function() {
  return this.collab && this.collab.length > 0;
});

approvedSubmissionSchema.virtual('splitTokens').get(function() {
  if (!this.isCollaboration) return this.finalTokenAmount;
  const totalParticipants = 1 + this.collab.length; // 1 submitter + collaborators
  return Math.floor(this.finalTokenAmount / totalParticipants);
});

// ------------------- Methods -------------------
approvedSubmissionSchema.methods.getDisplayTitle = function() {
  return this.title || this.fileName || 'Untitled Submission';
};

approvedSubmissionSchema.methods.getCollaboratorIds = function() {
  if (!this.collab || this.collab.length === 0) return [];
  return this.collab.map(mention => mention.replace(/[<@>]/g, ''));
};

approvedSubmissionSchema.methods.getCollaboratorId = function() {
  // Legacy method for backwards compatibility
  const ids = this.getCollaboratorIds();
  return ids.length > 0 ? ids[0] : null;
};

// ------------------- Statics -------------------
approvedSubmissionSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).sort({ submittedAt: -1 });
};

approvedSubmissionSchema.statics.findByCategory = function(category) {
  return this.find({ category }).sort({ submittedAt: -1 });
};

approvedSubmissionSchema.statics.findRecent = function(limit = 10) {
  return this.find().sort({ approvedAt: -1 }).limit(limit);
};

// ------------------- Export -------------------
module.exports = mongoose.models.ApprovedSubmission || mongoose.model('ApprovedSubmission', approvedSubmissionSchema); 