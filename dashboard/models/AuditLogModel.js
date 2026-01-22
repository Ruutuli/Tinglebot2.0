// ============================================================================
// ------------------- Import necessary modules -------------------
// Mongoose for database schema modeling
// ============================================================================
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================================
// ------------------- Define the audit log schema -------------------
// Tracks all admin actions on database records
// ============================================================================
const auditLogSchema = new Schema({
  // ------------------- Admin Information -------------------
  adminUserId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  adminUsername: { 
    type: String, 
    required: true,
    index: true
  },
  adminDiscordId: {
    type: String,
    required: true,
    index: true
  },
  
  // ------------------- Action Information -------------------
  action: { 
    type: String, 
    enum: ['CREATE', 'UPDATE', 'DELETE', 'vote', 'vote_changed', 'decision', 'feedback_sent'],
    required: true,
    index: true
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    required: true,
    index: true
  },
  
  // ------------------- Record Information -------------------
  modelName: { 
    type: String, 
    required: true,
    index: true
  },
  recordId: { 
    type: Schema.Types.ObjectId, 
    required: true,
    index: true
  },
  recordName: { 
    type: String,
    default: null
  },
  
  // ------------------- Change Tracking -------------------
  changes: {
    // For CREATE: contains the new record data
    // For UPDATE: contains { before: {...}, after: {...} }
    // For DELETE: contains the deleted record data
    type: Schema.Types.Mixed,
    default: null
  },
  
  // ------------------- Request Information -------------------
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
  }
}, {
  timestamps: false // We use our own timestamp field
});

// ============================================================================
// ------------------- Indexes for Performance -------------------
// ============================================================================
auditLogSchema.index({ modelName: 1, timestamp: -1 });
auditLogSchema.index({ adminUserId: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ recordId: 1, modelName: 1 });
auditLogSchema.index({ recordId: 1, applicationVersion: 1 }); // For versioned OC workflow tracking

// ============================================================================
// ------------------- Static Methods -------------------
// ============================================================================

// ------------------- Get audit logs with filters -------------------
auditLogSchema.statics.getAuditLogs = async function(filters = {}) {
  const {
    adminUserId,
    adminUsername,
    modelName,
    action,
    recordId,
    startDate,
    endDate,
    limit = 100,
    skip = 0
  } = filters;
  
  const query = {};
  
  if (adminUserId) query.adminUserId = adminUserId;
  if (adminUsername) query.adminUsername = { $regex: adminUsername, $options: 'i' };
  if (modelName) query.modelName = modelName;
  if (action) query.action = action;
  if (recordId) query.recordId = recordId;
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }
  
  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .skip(parseInt(skip))
    .lean();
};

// ============================================================================
// ------------------- Create and Export Model -------------------
// ============================================================================
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;

