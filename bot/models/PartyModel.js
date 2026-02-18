// PartyModel.js

const mongoose = require('mongoose');
const { Schema } = mongoose;

const PartySchema = new Schema({
  leaderId: { type: String, required: true },
  region: { type: String, required: true },
  square: { type: String, required: true },
  quadrant: { type: String, required: true },
  partyId: { type: String, required: true, unique: true },
  characters: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, required: true },
      userId: { type: String, required: true },
      name: { type: String, required: true },
      currentHearts: { type: Number, default: 0 },
      currentStamina: { type: Number, default: 0 },
      icon: { type: String },
      items: [
        {
          itemName: { type: String, required: true },
          modifierHearts: { type: Number, default: 0 },
          staminaRecovered: { type: Number, default: 0 },
          emoji: { type: String }
        }
      ]
    }
  ],
  gatheredItems: [
    {
      characterId: { type: mongoose.Schema.Types.ObjectId, required: true }, // Character ID
      characterName: { type: String, required: true }, // Character Name
      itemName: { type: String, required: true }, // Item Name
      quantity: { type: Number, default: 1 }, // Quantity of Item
      emoji: { type: String, default: '' }, // Emoji for the Item
    }
  ],
  messageId: { type: String },
  discordThreadId: { type: String },
  status: { type: String, default: 'open', enum: ['open', 'started', 'completed', 'cancelled'] },
  createdAt: { type: Date, default: Date.now },
  currentTurn: { type: Number, default: 0 },
  totalHearts: { type: Number, default: 0 },
  totalStamina: { type: Number, default: 0 },
  quadrantState: { type: String, default: 'unexplored', enum: ['unexplored', 'explored', 'secured'] },
  /** Blight exposure: incremented when party reveals or travels through a blighted quadrant; stacks on repeated travel. */
  blightExposure: { type: Number, default: 0 },
  progressLog: [
    {
      at: { type: Date, default: Date.now },
      characterName: { type: String, required: true },
      outcome: { type: String, required: true },
      message: { type: String, required: true },
      loot: {
        itemName: { type: String, default: '' },
        emoji: { type: String, default: '' },
      },
      heartsLost: { type: Number },
      staminaLost: { type: Number },
      heartsRecovered: { type: Number },
      staminaRecovered: { type: Number },
    }
  ],
  /** Discovery keys (outcome|square|quadrant|at) that have been placed as a pin on the map; used to know pin was placed or not. */
  reportedDiscoveryKeys: [{ type: String }],
  /** Quadrants this expedition marked as Explored (so we can reset them to Unexplored on full party KO). */
  exploredQuadrantsThisRun: [{ squareId: { type: String }, quadrantId: { type: String } }],
  /** Quadrants where this expedition found a ruin-rest camp spot (ruins exploration → camp outcome); ruin-rest only applies if this expedition discovered it. */
  ruinRestQuadrants: [{ squareId: { type: String }, quadrantId: { type: String } }],
  /** Square IDs for which a path image was uploaded from this expedition; used to hide "draw path" prompt. */
  pathImageUploadedSquares: [{ type: String }],
});

/** Find party by partyId, excluding cancelled and open parties older than 24h (ghost explores). */
PartySchema.statics.findActiveByPartyId = function (partyId) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return this.findOne({
    partyId,
    status: { $ne: 'cancelled' },
    $or: [
      { status: { $ne: 'open' } },
      { createdAt: { $gte: cutoff } },
    ],
  });
};

module.exports = mongoose.model('Party', PartySchema);
