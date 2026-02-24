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
      maxHearts: { type: Number, default: 0 },
      maxStamina: { type: Number, default: 0 },
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
  maxHearts: { type: Number, default: 0 },
  maxStamina: { type: Number, default: 0 },
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
  /** Quadrants the party has set foot in this run; fog stays clear for these when they move away. */
  visitedQuadrantsThisRun: [{ squareId: { type: String }, quadrantId: { type: String } }],
  /** Quadrants where this expedition found a ruin-rest camp spot (ruins exploration → camp outcome); ruin-rest only applies if this expedition discovered it. */
  ruinRestQuadrants: [{ squareId: { type: String }, quadrantId: { type: String }, stamina: { type: Number, default: 1 } }],
  /** Square IDs for which a path image was uploaded from this expedition; used to hide "draw path" prompt. */
  pathImageUploadedSquares: [{ type: String }],
  /** Expedition outcome: 'success' (ended normally), 'failed' (party KO'd), null (still in progress or cancelled). */
  outcome: { type: String, enum: ['success', 'failed', null], default: null },
  /** Items lost when expedition failed (KO'd). Preserved for dashboard display. */
  lostItems: [
    {
      characterId: { type: mongoose.Schema.Types.ObjectId },
      characterName: { type: String },
      itemName: { type: String },
      quantity: { type: Number, default: 1 },
      emoji: { type: String, default: '' },
    }
  ],
  /** Final location when expedition ended (for failed expeditions, where they were KO'd). */
  finalLocation: { square: { type: String }, quadrant: { type: String } },
  /** Timestamp when expedition ended. */
  endedAt: { type: Date },
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

/**
 * Advance to the next turn in the expedition.
 * Wraps around to the first character after the last one.
 * Unlike raids/waves, expedition characters share a heart pool so there's no KO-skipping logic.
 * @param {boolean} [save=true] - Whether to save the document after advancing. Set to false if caller will save.
 * @returns {Promise<{previousTurn: number, newTurn: number, nextCharacter: object|null}>}
 */
PartySchema.methods.advanceTurn = async function (save = true) {
  if (!this.characters || this.characters.length === 0) {
    return { previousTurn: this.currentTurn, newTurn: 0, nextCharacter: null };
  }
  const previousTurn = this.currentTurn ?? 0;
  this.currentTurn = (previousTurn + 1) % this.characters.length;
  if (save) {
    await this.save();
  }
  return {
    previousTurn,
    newTurn: this.currentTurn,
    nextCharacter: this.characters[this.currentTurn] ?? null,
  };
};

module.exports = mongoose.model('Party', PartySchema);
