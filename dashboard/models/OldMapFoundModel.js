// OldMapFound - same collection as bot (oldMapsFound); used by map appraisal approve.
const mongoose = require('mongoose');
const { Schema } = mongoose;

const OldMapFoundSchema = new Schema({
  mapId: { type: String, default: '' },
  characterId: { type: Schema.Types.ObjectId, ref: 'Character', default: null, index: true },
  ownerUserId: { type: String, default: '', index: true },
  characterName: { type: String, required: true, index: true },
  mapNumber: { type: Number, required: true, min: 1, max: 46 },
  foundAt: { type: Date, default: Date.now },
  locationFound: { type: String, default: '' },
  appraised: { type: Boolean, default: false },
  appraisedAt: { type: Date, default: null },
  appraisedBy: { type: String, default: null },
  leadsTo: { type: String, default: null },
  leadsToCoordinates: { type: String, default: null },
  redeemedAt: { type: Date, default: null },
  redeemedForPartyId: { type: String, default: null },
  redeemedDestinationSquare: { type: String, default: null },
  redeemedDestinationQuadrant: { type: String, default: null },
  exploreMapPinnedAt: { type: Date, default: null },
  exploreMapPinnedPartyId: { type: String, default: null },
}, { collection: 'oldMapsFound' });

module.exports = mongoose.models.OldMapFound || mongoose.model('OldMapFound', OldMapFoundSchema);
