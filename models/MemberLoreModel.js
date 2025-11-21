const mongoose = require('mongoose');

const memberLoreSchema = new mongoose.Schema({
  // Member information
  memberName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  
  // Lore content
  topic: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1500
  },
  
  // User tracking (for moderation purposes)
  userId: {
    type: String,
    required: true,
    index: true
  },
  
  // Submission metadata
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  // Moderation status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'needs_revision'],
    default: 'pending',
    index: true
  },
  
  // Moderation notes
  moderatorNotes: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  // Who reviewed it
  reviewedBy: {
    type: String,
    trim: true
  },
  
  // When it was reviewed
  reviewedAt: {
    type: Date
  },
  
  // Version tracking for revisions
  version: {
    type: Number,
    default: 1
  },
  
  // Original submission ID (for tracking revisions)
  originalSubmissionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MemberLore'
  },
  
  // Tags for categorization
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Whether this lore is featured or highlighted
  isFeatured: {
    type: Boolean,
    default: false
  },
  
  // Usage statistics
  viewCount: {
    type: Number,
    default: 0
  },
  
  // Whether this lore has been used in character backstories
  usedInBackstories: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  collection: 'memberlore'
});

// Indexes for better query performance
memberLoreSchema.index({ status: 1, timestamp: -1 });
memberLoreSchema.index({ topic: 'text', description: 'text' });
memberLoreSchema.index({ tags: 1 });
memberLoreSchema.index({ isFeatured: 1, status: 1 });

// Virtual for formatted timestamp
memberLoreSchema.virtual('formattedTimestamp').get(function() {
  return this.timestamp.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
});

// Virtual for word count
memberLoreSchema.virtual('wordCount').get(function() {
  return this.description.split(/\s+/).filter(word => word.length > 0).length;
});

// Method to approve lore
memberLoreSchema.methods.approve = function(moderatorId, notes = '') {
  this.status = 'approved';
  this.reviewedBy = moderatorId;
  this.reviewedAt = new Date();
  this.moderatorNotes = notes;
  return this.save();
};

// Method to reject lore
memberLoreSchema.methods.reject = function(moderatorId, notes = '') {
  this.status = 'rejected';
  this.reviewedBy = moderatorId;
  this.reviewedAt = new Date();
  this.moderatorNotes = notes;
  return this.save();
};

// Method to request revision
memberLoreSchema.methods.requestRevision = function(moderatorId, notes = '') {
  this.status = 'needs_revision';
  this.reviewedBy = moderatorId;
  this.reviewedAt = new Date();
  this.moderatorNotes = notes;
  return this.save();
};

// Method to increment view count
memberLoreSchema.methods.incrementViewCount = function() {
  this.viewCount += 1;
  return this.save();
};

// Method to increment backstory usage
memberLoreSchema.methods.incrementBackstoryUsage = function() {
  this.usedInBackstories += 1;
  return this.save();
};

// Static method to get approved lore
memberLoreSchema.statics.getApprovedLore = function(limit = 50, skip = 0) {
  return this.find({ status: 'approved' })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip)
    .select('-moderatorNotes -reviewedBy');
};

// Static method to get lore by topic
memberLoreSchema.statics.getLoreByTopic = function(topic, limit = 20) {
  return this.find({ 
    status: 'approved',
    topic: new RegExp(topic, 'i')
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('-moderatorNotes -reviewedBy');
};

// Static method to get pending submissions
memberLoreSchema.statics.getPendingSubmissions = function(limit = 20) {
  return this.find({ status: 'pending' })
    .sort({ timestamp: 1 })
    .limit(limit);
};

// Static method to get featured lore
memberLoreSchema.statics.getFeaturedLore = function(limit = 10) {
  return this.find({ 
    status: 'approved',
    isFeatured: true 
  })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('-moderatorNotes -reviewedBy');
};

// Static method to search lore
memberLoreSchema.statics.searchLore = function(query, limit = 20) {
  return this.find({
    status: 'approved',
    $text: { $search: query }
  })
    .sort({ score: { $meta: 'textScore' } })
    .limit(limit)
    .select('-moderatorNotes -reviewedBy');
};

// Static method to get lore statistics
memberLoreSchema.statics.getLoreStats = function() {
  return this.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ]);
};

// Pre-save middleware to auto-generate tags from topic
memberLoreSchema.pre('save', function(next) {
  if (this.isModified('topic')) {
    // Generate basic tags from topic
    const topicWords = this.topic.toLowerCase()
      .split(/[\s,]+/)
      .filter(word => word.length > 2)
      .slice(0, 5); // Limit to 5 tags
    
    this.tags = [...new Set(topicWords)]; // Remove duplicates
  }
  next();
});

// Pre-save middleware to validate description length
memberLoreSchema.pre('save', function(next) {
  if (this.isModified('description')) {
    const wordCount = this.description.split(/\s+/).filter(word => word.length > 0).length;
    if (wordCount > 300) { // Roughly 3 paragraphs
      return next(new Error('Description is too long. Please keep it to 3 paragraphs or less.'));
    }
  }
  next();
});

// Transform JSON output
memberLoreSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Remove sensitive fields from JSON output
    delete ret.__v;
    if (ret.status !== 'approved') {
      delete ret.moderatorNotes;
      delete ret.reviewedBy;
    }
    return ret;
  }
});

module.exports = mongoose.model('MemberLore', memberLoreSchema);
