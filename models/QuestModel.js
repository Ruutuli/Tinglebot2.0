const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================================
// ------------------- Schema Field Definitions -------------------
// ============================================================================

// ------------------- Basic Quest Fields ------------------
const basicQuestFields = {
    title: { type: String, required: true },
    description: { type: String, required: true },
    questType: { type: String, required: true, enum: ['Art', 'Writing', 'Interactive', 'RP'] },
    location: { type: String, required: true },
    timeLimit: { type: String, required: true },
    minRequirements: { type: Number, default: 0 },
    itemReward: { type: String, default: null },
    itemRewardQty: { type: Number, default: null },
    signupDeadline: { type: String, default: null },
    participantCap: { type: Number, default: null },
    postRequirement: { type: Number, default: null },
    specialNote: { type: String, default: null }
};

// ------------------- Token Reward Validation ------------------
const tokenRewardValidation = {
    validator: function(value) {
        if (typeof value === 'number') return value >= 0;
        if (typeof value === 'string') {
            if (['N/A', 'No reward', 'No reward specified', 'None'].includes(value)) return true;
            const parsed = parseFloat(value);
            return !isNaN(parsed) && parsed >= 0;
        }
        return false;
    },
    message: 'Token reward must be a number >= 0 or a valid string value'
};

// ------------------- Integration Fields ------------------
const integrationFields = {
    targetChannel: { type: String, default: null },
    date: { type: String, required: true },
    questID: { type: String, unique: true, required: true },
    posted: { type: Boolean, default: false },
    postedAt: { type: Date, default: null },
    botNotes: { type: String, default: null },
    messageID: { type: String, default: null },
    roleID: { type: String, default: null },
    guildId: { type: String, default: null },
    rpThreadParentChannel: { type: String, default: null }
};

// ------------------- Quest Status Fields ------------------
const statusFields = {
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    completionReason: { type: String, default: null }
};

// ------------------- Submission Schema ------------------
const submissionSchema = {
    type: {
        type: String,
        enum: ['art', 'writing', 'interactive', 'rp_posts'],
        required: true
    },
    url: String,
    postCount: Number,
    submittedAt: { type: Date, default: Date.now },
    approved: { type: Boolean, default: false },
    approvedBy: String,
    approvedAt: Date
};

// ------------------- Participant Schema ------------------
const participantSchema = {
    userId: { type: String, required: true },
    characterName: { type: String, required: true },
    joinedAt: { type: Date, default: Date.now },
    leftAt: { type: Date, default: null },
    progress: {
        type: String,
        enum: ['active', 'completed', 'failed', 'rewarded'],
        default: 'active'
    },
    submissions: [submissionSchema],
    rpPostCount: { type: Number, default: 0 },
    rpThreadId: { type: String, default: null },
    usedVoucher: { type: Boolean, default: false },
    voucherUsedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    rewardedAt: { type: Date, default: null },
    tokensEarned: { type: Number, default: 0 },
    itemsEarned: [{ name: String, quantity: Number }],
    modNotes: { type: String, default: null },
    units: { type: Number, default: 0 },
    group: { type: String, default: null },
    signedUp: { type: Boolean, default: true },
    attended: { type: Boolean, default: false },
    questSubmissionInfo: { type: Schema.Types.Mixed, default: null },
    updatedAt: { type: Date, default: Date.now }
};

// ------------------- Left Participant Schema ------------------
const leftParticipantSchema = {
    characterName: { type: String, required: true },
    userId: { type: String, required: true },
    leftAt: { type: Date, default: Date.now }
};

// ------------------- Additional Fields ------------------
const additionalFields = {
    collabAllowed: { type: Boolean, default: false },
    collabRule: { type: String, default: null },
    rules: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
};

// ============================================================================
// ------------------- Quest Schema Definition -------------------
// ============================================================================

const questSchema = new Schema({
    ...basicQuestFields,
    tokenReward: { 
        type: Schema.Types.Mixed, 
        required: true,
        validate: tokenRewardValidation
    },
    ...integrationFields,
    ...statusFields,
    participants: { 
        type: Map, 
        of: participantSchema,
        default: () => new Map() 
    },
    leftParticipants: [leftParticipantSchema],
    ...additionalFields
});

// ============================================================================
// ------------------- Pre-save Hook -------------------
// ============================================================================

questSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Quest Type Constants ------------------
const QUEST_TYPES = {
    ART: 'Art',
    WRITING: 'Writing',
    INTERACTIVE: 'Interactive',
    RP: 'RP'
};

const SUBMISSION_TYPES = {
    ART: 'art',
    WRITING: 'writing',
    INTERACTIVE: 'interactive',
    RP_POSTS: 'rp_posts'
};

const PROGRESS_STATUS = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REWARDED: 'rewarded'
};

// ------------------- Requirements Check ------------------
function meetsRequirements(participant, quest) {
    const { questType, postRequirement } = quest;
    const { rpPostCount, submissions } = participant;
    
    if (questType === QUEST_TYPES.RP) {
        return rpPostCount >= (postRequirement || 15);
    }
    
    if (questType === QUEST_TYPES.ART || questType === QUEST_TYPES.WRITING) {
        const submissionType = questType.toLowerCase();
        return submissions.some(sub => 
            sub.type === submissionType && sub.approved
        );
    }
    
    return false;
}

// ------------------- Submission Management ------------------
function addSubmission(participant, type, url = null) {
    const submission = {
        type,
        url,
        submittedAt: new Date()
    };
    
    if (type === SUBMISSION_TYPES.RP_POSTS) {
        submission.postCount = participant.rpPostCount;
    }
    
    participant.submissions.push(submission);
    return participant;
}

// ------------------- RP Post Management ------------------
function incrementRPPosts(participant) {
    participant.rpPostCount += 1;
    participant.updatedAt = new Date();
    return participant;
}

// ============================================================================
// ------------------- Instance Methods -------------------
// ============================================================================

// ------------------- Participant Management ------------------
questSchema.methods.addParticipant = function(userId, characterName) {
    const existingParticipant = this.participants.get(userId);
    if (existingParticipant) {
        return existingParticipant;
    }
    
    const participant = {
        userId,
        characterName,
        joinedAt: new Date(),
        progress: PROGRESS_STATUS.ACTIVE,
        submissions: [],
        rpPostCount: 0,
        rpThreadId: null,
        usedVoucher: false,
        voucherUsedAt: null,
        completedAt: null,
        rewardedAt: null,
        tokensEarned: 0,
        itemsEarned: [],
        modNotes: null,
        units: 0,
        group: null,
        signedUp: true,
        attended: false,
        questSubmissionInfo: null,
        updatedAt: new Date()
    };
    
    this.participants.set(userId, participant);
    return participant;
};

questSchema.methods.removeParticipant = function(userId) {
    const participant = this.participants.get(userId);
    if (participant) {
        participant.leftAt = new Date();
        participant.progress = PROGRESS_STATUS.FAILED;
        
        if (!this.leftParticipants) {
            this.leftParticipants = [];
        }
        
        this.leftParticipants.push({
            characterName: participant.characterName,
            userId: userId,
            leftAt: new Date()
        });
    }
    
    this.participants.delete(userId);
};

questSchema.methods.getParticipant = function(userId) {
    return this.participants.get(userId);
};

questSchema.methods.hasCharacterLeft = function(characterName) {
    if (!this.leftParticipants) return false;
    return this.leftParticipants.some(leftParticipant => 
        leftParticipant.characterName.toLowerCase() === characterName.toLowerCase()
    );
};

// ------------------- Helper Method Delegates ------------------
questSchema.methods.meetsRequirements = function(participant, quest) {
    return meetsRequirements(participant, quest);
};

questSchema.methods.addSubmission = function(participant, type, url = null) {
    return addSubmission(participant, type, url);
};

questSchema.methods.incrementRPPosts = function(participant) {
    return incrementRPPosts(participant);
};

// ============================================================================
// ------------------- Quest Completion System -------------------
// ============================================================================

// ------------------- Completion Reasons ------------------
const COMPLETION_REASONS = {
    TIME_EXPIRED: 'time_expired',
    ALL_PARTICIPANTS_COMPLETED: 'all_participants_completed',
    MANUAL: 'manual'
};

// ------------------- Time Parsing Constants ------------------
const TIME_MULTIPLIERS = {
    HOUR: 60 * 60 * 1000,
    DAY: 24 * 60 * 60 * 1000,
    WEEK: 7 * 24 * 60 * 60 * 1000,
    MONTH: 30 * 24 * 60 * 60 * 1000
};

// ------------------- Auto Completion Check ------------------
questSchema.methods.checkAutoCompletion = async function() {
    if (this.status !== PROGRESS_STATUS.ACTIVE) {
        return { completed: false, reason: 'Quest not active' };
    }
    
    const timeExpired = this.checkTimeExpiration();
    if (timeExpired) {
        this.status = PROGRESS_STATUS.COMPLETED;
        this.completedAt = new Date();
        this.completionReason = COMPLETION_REASONS.TIME_EXPIRED;
        await this.save();
        console.log(`[QuestModel.js] ⏰ Quest "${this.title}" completed due to time expiration`);
        return { completed: true, reason: COMPLETION_REASONS.TIME_EXPIRED };
    }
    
    let participantsCompleted = 0;
    
    for (const [userId, participant] of this.participants) {
        if (participant.progress === PROGRESS_STATUS.ACTIVE && meetsRequirements(participant, this)) {
            participant.progress = PROGRESS_STATUS.COMPLETED;
            participant.completedAt = new Date();
            participantsCompleted++;
            console.log(`[QuestModel.js] ✅ Auto-completed quest for ${participant.characterName} in quest ${this.title}`);
        }
    }
    
    const allCompleted = Array.from(this.participants.values()).every(p => p.progress === PROGRESS_STATUS.COMPLETED);
    if (allCompleted && this.status === PROGRESS_STATUS.ACTIVE) {
        this.status = PROGRESS_STATUS.COMPLETED;
        this.completedAt = new Date();
        this.completionReason = COMPLETION_REASONS.ALL_PARTICIPANTS_COMPLETED;
        console.log(`[QuestModel.js] 🎉 Quest "${this.title}" completed - all participants finished`);
        await this.save();
        return { completed: true, reason: COMPLETION_REASONS.ALL_PARTICIPANTS_COMPLETED };
    }
    
    if (participantsCompleted > 0) {
        await this.save();
        return { completed: false, reason: `${participantsCompleted} participants completed` };
    }
    
    return { completed: false, reason: 'No participants completed' };
};

// ------------------- Time Expiration Check ------------------
questSchema.methods.checkTimeExpiration = function() {
    if (!this.postedAt || !this.timeLimit) {
        return false;
    }
    
    const now = new Date();
    const postedAt = new Date(this.postedAt);
    const timeLimit = this.timeLimit.toLowerCase();
    
    let durationMs = 0;
    
    if (timeLimit.includes('day')) {
        const days = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
        durationMs = days * TIME_MULTIPLIERS.DAY;
    } else if (timeLimit.includes('week')) {
        const weeks = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
        durationMs = weeks * TIME_MULTIPLIERS.WEEK;
    } else if (timeLimit.includes('month')) {
        const months = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
        durationMs = months * TIME_MULTIPLIERS.MONTH;
    } else if (timeLimit.includes('hour')) {
        const hours = parseInt(timeLimit.match(/(\d+)/)?.[1] || '1');
        durationMs = hours * TIME_MULTIPLIERS.HOUR;
    }
    
    const expirationTime = new Date(postedAt.getTime() + durationMs);
    return now > expirationTime;
};

// ------------------- Token Reward Normalization ------------------
questSchema.methods.getNormalizedTokenReward = function() {
    const tokenReward = this.tokenReward;
    const noRewardValues = ['N/A', 'No reward', 'No reward specified', 'None'];
    
    if (!tokenReward || noRewardValues.includes(tokenReward)) {
        return 0;
    }
    
    if (typeof tokenReward === 'number') {
        return Math.max(0, tokenReward);
    }
    
    const parsed = parseFloat(tokenReward);
    return !isNaN(parsed) ? Math.max(0, parsed) : 0;
};

// ------------------- Export Quest Model -------------------
module.exports = mongoose.model('Quest', questSchema);
