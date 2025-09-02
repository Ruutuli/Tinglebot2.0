const mongoose = require('mongoose');
const { Schema } = mongoose;

// ------------------- Quest Schema Definition -------------------
const questSchema = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    questType: { type: String, required: true, enum: ['Art', 'Writing', 'Interactive', 'RP'] },
    location: { type: String, required: true },
    timeLimit: { type: String, required: true },
    minRequirements: { type: Number, default: 0 },
    tokenReward: { type: Number, required: true },
    itemReward: { type: String, default: null },
    itemRewardQty: { type: Number, default: null },
    signupDeadline: { type: String, default: null },
    participantCap: { type: Number, default: null },
    postRequirement: { type: Number, default: null },
    specialNote: { type: String, default: null },
    
    // ------------------- Google Sheets Integration Fields -------------------
    targetChannel: { type: String, default: null }, // Channel ID for posting
    date: { type: String, required: true }, // Display date (e.g., "Sept 15–30")
    questID: { type: String, unique: true, required: true }, // Unique ID (Q12345)
    posted: { type: Boolean, default: false }, // Whether quest has been posted
    postedAt: { type: Date, default: null }, // Timestamp when posted
    botNotes: { type: String, default: null }, // Bot error notes or reasons
    
    // ------------------- Discord Integration Fields -------------------
    messageID: { type: String, default: null }, // Embed message ID for edits
    roleID: { type: String, default: null }, // Quest role ID
    
    // ------------------- RP Quest Specific Fields -------------------
    rpThreadParentChannel: { type: String, default: null }, // Channel for RP thread creation
    
    // ------------------- Quest Status -------------------
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    
    // ------------------- Participant Management -------------------
    participants: { type: Map, of: String, default: () => new Map() }, // userId -> characterName
    
    // ------------------- Timestamps -------------------
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// ------------------- Pre-save Hook -------------------
questSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// ------------------- Quest Participant Schema -------------------
// Embedded subdocument for tracking individual participant progress
const questParticipantSchema = new Schema({
    userId: { type: String, required: true },
    characterName: { type: String, required: true },
    
    // ------------------- Participation Details -------------------
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
    
    // ------------------- Progress Tracking -------------------
    progress: {
        type: String,
        enum: ['active', 'completed', 'failed', 'rewarded'],
        default: 'active'
    },
    
    // ------------------- Submission Tracking -------------------
    submissions: [{
        type: {
            type: String,
            enum: ['art', 'writing', 'interactive', 'rp_posts'],
            required: true
        },
        url: String, // For art/writing submissions
        postCount: Number, // For RP quests
        submittedAt: {
            type: Date,
            default: Date.now
        },
        approved: {
            type: Boolean,
            default: false
        },
        approvedBy: String,
        approvedAt: Date
    }],
    
    // ------------------- RP Quest Specific -------------------
    rpPostCount: {
        type: Number,
        default: 0
    },
    rpThreadId: {
        type: String,
        default: null
    },
    
    // ------------------- Voucher Usage -------------------
    usedVoucher: {
        type: Boolean,
        default: false
    },
    voucherUsedAt: {
        type: Date,
        default: null
    },
    
    // ------------------- Completion and Rewards -------------------
    completedAt: {
        type: Date,
        default: null
    },
    rewardedAt: {
        type: Date,
        default: null
    },
    tokensEarned: {
        type: Number,
        default: 0
    },
    itemsEarned: [{
        name: String,
        quantity: Number
    }],
    
    // ------------------- Mod Notes -------------------
    modNotes: {
        type: String,
        default: null
    },
    
    // ------------------- Timestamps -------------------
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// ------------------- Instance Methods for Quest Participants -------------------
questParticipantSchema.methods.meetsRequirements = function(quest) {
    if (quest.questType === 'RP') {
        return this.rpPostCount >= (quest.postRequirement || 15);
    } else if (quest.questType === 'Art' || quest.questType === 'Writing') {
        return this.submissions.some(sub => 
            sub.type === quest.questType.toLowerCase() && sub.approved
        );
    }
    return false;
};

questParticipantSchema.methods.addSubmission = function(type, url = null) {
    const submission = {
        type,
        url,
        submittedAt: new Date()
    };
    
    if (type === 'rp_posts') {
        submission.postCount = this.rpPostCount;
    }
    
    this.submissions.push(submission);
    return this;
};

questParticipantSchema.methods.incrementRPPosts = function() {
    this.rpPostCount += 1;
    this.updatedAt = new Date();
    return this;
};

// ------------------- Pre-save Hook for Participants -------------------
questParticipantSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// ------------------- Add Participants Array to Quest Schema -------------------
questSchema.add({
    participantDetails: [questParticipantSchema]
});

// ------------------- Instance Methods for Quest -------------------
questSchema.methods.addParticipant = function(userId, characterName) {
    const existingParticipant = this.participantDetails.find(p => p.userId === userId);
    if (existingParticipant) {
        return existingParticipant;
    }
    
    const participant = {
        userId,
        characterName,
        joinedAt: new Date(),
        progress: 'active'
    };
    
    this.participantDetails.push(participant);
    this.participants.set(userId, characterName);
    return participant;
};

questSchema.methods.removeParticipant = function(userId) {
    this.participants.delete(userId);
    this.participantDetails = this.participantDetails.filter(p => p.userId !== userId);
};

questSchema.methods.getParticipant = function(userId) {
    return this.participantDetails.find(p => p.userId === userId);
};

questSchema.methods.checkAutoCompletion = async function() {
    // Check if any participants meet requirements for auto-completion
    for (const participant of this.participantDetails) {
        if (participant.progress === 'active' && participant.meetsRequirements(this)) {
            participant.progress = 'completed';
            participant.completedAt = new Date();
            console.log(`[QUEST]: Auto-completed quest for ${participant.characterName} in quest ${this.title}`);
        }
    }
    
    // Check if all participants have completed
    const allCompleted = this.participantDetails.every(p => p.progress === 'completed');
    if (allCompleted && this.status === 'active') {
        this.status = 'completed';
        console.log(`[QUEST]: Auto-marked quest ${this.title} as completed`);
    }
    
    await this.save();
};

// ------------------- Export Quest Model -------------------
module.exports = mongoose.model('Quest', questSchema);
