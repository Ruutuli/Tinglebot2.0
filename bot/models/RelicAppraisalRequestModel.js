// ------------------- Third-Party Imports -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Relic Appraisal Request Schema -------------------
const RelicAppraisalRequestSchema = new Schema({
  appraisalRequestId: { type: String, default: '' },  // Short display ID (e.g. A473582)
  relicId: { type: String, required: true },           // Relic ID (e.g. R473582) or MongoDB _id
  relicMongoId: { type: Schema.Types.ObjectId, ref: 'Relic', default: null }, // Resolved MongoDB _id
  characterName: { type: String, required: true },     // Character who found the relic
  finderOwnerUserId: { type: String, required: true }, // Discord user ID of finder's owner
  appraiserName: { type: String, required: true },     // PC Artist/Researcher or "NPC"
  npcAppraisal: { type: Boolean, default: false },     // True if 500 tokens for NPC appraisal
  payment: { type: String, default: '' },              // Payment offered (from inventory, etc.)
  appraisalDescription: { type: String, default: '' }, // Description set by appraiser (for PC)
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  modApprovedBy: { type: String, default: null },      // Discord user ID of approving mod
  modApprovedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'relicappraisalrequests' });

RelicAppraisalRequestSchema.index({ status: 1 });
RelicAppraisalRequestSchema.index({ relicId: 1 });
RelicAppraisalRequestSchema.index({ finderOwnerUserId: 1 });
RelicAppraisalRequestSchema.index({ appraisalRequestId: 1 });

module.exports = mongoose.model('RelicAppraisalRequest', RelicAppraisalRequestSchema);
