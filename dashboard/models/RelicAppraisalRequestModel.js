// ------------------- Third-Party Imports -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Relic Appraisal Request Schema -------------------
const RelicAppraisalRequestSchema = new Schema({
  relicId: { type: String, required: true },
  relicMongoId: { type: Schema.Types.ObjectId, ref: 'Relic', default: null },
  characterName: { type: String, required: true },
  finderOwnerUserId: { type: String, required: true },
  appraiserName: { type: String, required: true },
  npcAppraisal: { type: Boolean, default: false },
  payment: { type: String, default: '' },
  appraisalDescription: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  modApprovedBy: { type: String, default: null },
  modApprovedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'relicappraisalrequests' });

RelicAppraisalRequestSchema.index({ status: 1 });
RelicAppraisalRequestSchema.index({ relicId: 1 });
RelicAppraisalRequestSchema.index({ finderOwnerUserId: 1 });

module.exports = mongoose.models.RelicAppraisalRequest || mongoose.model('RelicAppraisalRequest', RelicAppraisalRequestSchema);
