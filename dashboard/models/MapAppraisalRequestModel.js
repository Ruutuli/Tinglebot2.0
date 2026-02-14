// ------------------- Map Appraisal Request Schema -------------------
const mongoose = require('mongoose');
const { Schema } = mongoose;

const MapAppraisalRequestSchema = new Schema({
  oldMapFoundId: { type: Schema.Types.ObjectId, ref: 'OldMapFound', required: true },
  mapOwnerCharacterName: { type: String, required: true },
  mapOwnerUserId: { type: String, required: true },
  appraiserName: { type: String, required: true },
  npcAppraisal: { type: Boolean, default: false },
  payment: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  modApprovedBy: { type: String, default: null },
  modApprovedAt: { type: Date, default: null },
  coordinatesDmSentAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
}, { collection: 'mapappraisalrequests' });

MapAppraisalRequestSchema.index({ status: 1 });
MapAppraisalRequestSchema.index({ oldMapFoundId: 1 });
MapAppraisalRequestSchema.index({ mapOwnerUserId: 1 });

module.exports = mongoose.models.MapAppraisalRequest || mongoose.model('MapAppraisalRequest', MapAppraisalRequestSchema);
