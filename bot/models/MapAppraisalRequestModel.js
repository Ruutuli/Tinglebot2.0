// ------------------- Map Appraisal Request Schema -------------------
// Mirrors RelicAppraisalRequest pattern: owner requests appraisal (PC Scholar or NPC);
// PC Scholar uses /map appraisal-accept (3 stamina, Inariko); NPC approved on dashboard (500 tokens).
// After approval, bot task DMs map owner with coordinates and sets coordinatesDmSentAt.
// -------------------

const mongoose = require('mongoose');
const { Schema } = mongoose;

const MapAppraisalRequestSchema = new Schema({
  oldMapFoundId: { type: Schema.Types.ObjectId, ref: 'OldMapFound', required: true },
  mapOwnerCharacterName: { type: String, required: true },
  mapOwnerUserId: { type: String, required: true }, // Discord user ID for DM
  appraiserName: { type: String, required: true },   // PC Scholar name or "NPC"
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
MapAppraisalRequestSchema.index({ appraiserName: 1, status: 1 });

module.exports = mongoose.model('MapAppraisalRequest', MapAppraisalRequestSchema);
