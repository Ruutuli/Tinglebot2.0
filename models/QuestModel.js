const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Quest Schema Definition -------------------
const questSchema = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    questType: { type: String, required: true }, // Type of quest (e.g., Art, Interactive)
    location: { type: String, required: true }, // Quest location
    timeLimit: { type: String, required: true }, // Duration of the quest
    minRequirements: { type: Number, default: 0 }, // Minimum requirements for quest participation
    tokenReward: { type: Number, required: true }, // Tokens rewarded for quest completion
    itemReward: { type: String, default: null }, // Name of the item rewarded
    itemRewardQty: { type: Number, default: null }, // Quantity of item rewarded
    signupDeadline: { type: String, default: null }, // Deadline for quest sign-ups
    participantCap: { type: Number, default: null }, // Maximum number of participants allowed
    postRequirement: { type: Number, default: null }, // Requirements for post-quest actions
    specialNote: { type: String, default: null }, // Additional information about the quest
    participants: { type: Map, of: String, default: () => new Map() }, // Default to an empty Map
    status: { type: String, enum: ['active', 'completed'], default: 'active' }, // Quest status
    date: { type: String, required: true }, // Date associated with the quest
    questID: { type: String, unique: true, required: true }, // Unique identifier for the quest
    posted: { type: Boolean, default: false }, // Whether the quest has been posted
    messageID: { type: String, default: null }, // Embed message ID for future edits
    roleID: { type: String, default: null } // Role ID associated with the quest
});

// ------------------- Export Quest Model -------------------
module.exports = mongoose.model('Quest', questSchema);
