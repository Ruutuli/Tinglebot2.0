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
  status: { type: String, default: 'open', enum: ['open', 'started'] },
  currentTurn: { type: Number, default: 0 },
  totalHearts: { type: Number, default: 0 },
  totalStamina: { type: Number, default: 0 },
  quadrantState: { type: String, default: 'unexplored', enum: ['unexplored', 'explored', 'secured'] }
});

module.exports = mongoose.model('Party', PartySchema);
