const mongoose = require('mongoose');
const { Schema } = mongoose;

const questSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  questType: { type: String, required: true }, // Added for specifying type (Art, Interactive, etc.)
  location: { type: String, required: true }, // Added to specify quest location
  timeLimit: { type: String, required: true }, // Added to define quest duration
  minRequirements: { type: Number, default: 0 },
  rewards: { type: Number, required: true },
  rewardsCap: { type: Number, default: null }, // Added for max reward limit, if applicable
  signupDeadline: { type: String, default: null }, // Optional, for RP quests or events with signup deadlines
  participantCap: { type: Number, default: null }, // Optional cap on participants, if needed
  postRequirement: { type: Number, default: null }, // Optional post requirement for RP quests
  specialNote: { type: String, default: null }, // Optional note for additional quest info
  roles: { type: [String], default: [] },
  participants: { type: [String], default: [] },
  status: { type: String, enum: ['open', 'completed'], default: 'open' },
});

module.exports = mongoose.model('Quest', questSchema);
