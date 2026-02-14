// OldMapFound - same collection as bot (oldMapsFound); used by map appraisal approve.
const mongoose = require('mongoose');
const { Schema } = mongoose;

const OldMapFoundSchema = new Schema({
  characterName: { type: String, required: true, index: true },
  mapNumber: { type: Number, required: true, min: 1, max: 46 },
  foundAt: { type: Date, default: Date.now },
  locationFound: { type: String, default: '' },
  appraised: { type: Boolean, default: false },
  appraisedAt: { type: Date, default: null },
  appraisedBy: { type: String, default: null },
}, { collection: 'oldMapsFound' });

module.exports = mongoose.models.OldMapFound || mongoose.model('OldMapFound', OldMapFoundSchema);
