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
      name: { type: String, required: true },
      items: [{ 
        itemName: { type: String, required: true },
        modifierHearts: { type: Number, default: 0 },
        staminaRecovered: { type: Number, default: 0 }
      }]
    }
  ],
  messageId: { type: String }, 
  status: { type: String, default: 'open', enum: ['open', 'started'] }
});

module.exports = mongoose.model('Party', PartySchema);
