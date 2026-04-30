const mongoose = require('mongoose');

const ocReservationSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    characterName: { type: String, required: true },
    village: { type: String, required: true },
    guildId: { type: String, required: true },
    sourceChannelId: { type: String, default: null },
    sourceMessageId: { type: String, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OcReservation', ocReservationSchema);
