const mongoose = require('mongoose');
const { Schema } = mongoose;

// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

// Import consolidated constants and functions - moved to avoid circular dependency
// These will be defined locally to break the circular dependency

// Import Character model for village checking
const Character = require('./CharacterModel');

// ============================================================================
// ------------------- Schema Field Definitions -------------------
// ============================================================================

// ------------------- Basic Quest Fields ------------------
const basicQuestFields = {
    title: { type: String, required: true },
    description: { type: String, required: true },
    questType: { type: String, required: true, enum: ['Art', 'Writing', 'Interactive', 'RP', 'Art / Writing'] },
    location: { type: String, required: true },
    timeLimit: { type: String, required: true },
    minRequirements: { type: Schema.Types.Mixed, default: 0 }, // Can be number or table roll config
    tableroll: { type: String, default: null }, // Table roll name for RP quests
    itemReward: { type: String, default: null },
    itemRewardQty: { type: Number, default: null },
    itemRewards: [{ name: String, quantity: Number }], // Multiple items support
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
            
            // Check for complex formats
            if (value.includes('per_unit:') || value.includes('flat:') || value.includes('collab_bonus:')) {
                return true; // Accept complex reward formats
            }
            
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
    status: { type: String, enum: ['draft', 'unposted', 'active', 'completed'], default: 'active' },
    completionReason: { type: String, default: null },
    completedAt: { type: Date, default: null },
    completionProcessed: { type: Boolean, default: false }, // Prevents duplicate reward processing
    lastCompletionCheck: { type: Date, default: null } // Tracks when completion was last checked
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
        enum: ['active', 'completed', 'failed', 'rewarded', 'disqualified'],
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
    // RP Quest specific fields
    requiredVillage: { type: String, default: null }, // Village participant must stay in for RP quests
    lastVillageCheck: { type: Date, default: Date.now }, // Last time village location was verified
    disqualifiedAt: { type: Date, default: null }, // When participant was disqualified
    disqualificationReason: { type: String, default: null }, // Reason for disqualification
    // Interactive Quest specific fields
    tableRollResults: [{ 
        rollNumber: Number, 
        result: Schema.Types.Mixed, 
        rolledAt: { type: Date, default: Date.now },
        success: { type: Boolean, default: false }
    }], // Track table roll results for interactive quests
    successfulRolls: { type: Number, default: 0 }, // Count of successful rolls
    updatedAt: { type: Date, default: Date.now },
    // Completion tracking
    completionProcessed: { type: Boolean, default: false }, // Prevents duplicate reward processing
    lastCompletionCheck: { type: Date, default: null } // Tracks when completion was last checked
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
    updatedAt: { type: Date, default: Date.now },
    // Interactive Quest Table Roll Fields
    tableRollName: { type: String, default: null }, // Name of the table roll to use
    tableRollConfig: { type: Schema.Types.Mixed, default: null }, // Configuration for table roll requirements
    requiredRolls: { type: Number, default: 1 }, // Number of successful rolls required
    rollSuccessCriteria: { type: String, default: null } // What constitutes a successful roll
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
    
    // Fix participants field if it contains primitive values
    if (this.participants && typeof this.participants === 'object') {
        const fixedParticipants = new Map();
        
        for (const [key, value] of this.participants.entries()) {
            if (typeof value === 'string') {
                // Skip primitive string values - they're invalid
                console.warn(`[QuestModel.js] ⚠️ Skipping invalid participant data: ${key} = ${value}`);
                continue;
            } else if (typeof value === 'object' && value !== null) {
                // Valid participant object
                fixedParticipants.set(key, value);
            }
        }
        
        this.participants = fixedParticipants;
    }
    
    next();
});

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

// Quest Types - moved from questRewardModule to avoid circular dependency
const QUEST_TYPES = {
    ART: 'Art',
    WRITING: 'Writing',
    INTERACTIVE: 'Interactive',
    RP: 'RP',
    ART_WRITING: 'Art / Writing'
};

// Submission Types - moved from questRewardModule to avoid circular dependency
const SUBMISSION_TYPES = {
    ART: 'art',
    WRITING: 'writing',
    INTERACTIVE: 'interactive',
    RP_POSTS: 'rp_posts'
};

// Progress Status - moved from questRewardModule to avoid circular dependency
const PROGRESS_STATUS = {
    ACTIVE: 'active',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REWARDED: 'rewarded',
    DISQUALIFIED: 'disqualified'
};

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

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Requirements Check ------------------
// Logic intentionally mirrored in questRewardModule; keep in sync when changing completion rules.
function meetsRequirements(participant, quest) {
    const { questType, postRequirement, requiredRolls } = quest;
    const { rpPostCount, submissions, successfulRolls } = participant;
    
    if (questType === QUEST_TYPES.RP) {
        return rpPostCount >= (postRequirement || 15); // DEFAULT_POST_REQUIREMENT
    }
    
    if (questType === QUEST_TYPES.ART || questType === QUEST_TYPES.WRITING) {
        const submissionType = questType.toLowerCase();
        return submissions.some(sub => 
            sub.type === submissionType && sub.approved
        );
    }
    
    if (questType === QUEST_TYPES.ART_WRITING) {
        // For Art/Writing combined quests, require BOTH art AND writing submissions
        const hasArtSubmission = submissions.some(sub => sub.type === 'art' && sub.approved);
        const hasWritingSubmission = submissions.some(sub => sub.type === 'writing' && sub.approved);
        return hasArtSubmission && hasWritingSubmission;
    }
    
    if (questType === QUEST_TYPES.INTERACTIVE) {
        return successfulRolls >= (requiredRolls || 1); // DEFAULT_ROLL_REQUIREMENT
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

// ------------------- Quest Submission Creation ------------------
function createQuestSubmission(type, submissionData) {
    const submission = {
        type,
        submittedAt: new Date(),
        approved: true,
        approvedBy: submissionData.approvedBy || 'System',
        approvedAt: new Date()
    };
    
    if (type === 'art') {
        submission.url = submissionData.messageUrl || submissionData.fileUrl;
    } else if (type === 'writing') {
        submission.url = submissionData.messageUrl || submissionData.link;
    }
    
    return submission;
}

// ------------------- Quest Completion Notification ------------------
async function sendCompletionNotification(quest, participant) {
    try {
        // Use dynamic import to avoid circular dependency
        const questRewardModule = await import('../modules/questRewardModule.js');
        await questRewardModule.sendQuestCompletionNotification(quest, participant);
    } catch (error) {
        console.error(`[QuestModel] ❌ Error sending quest completion notification:`, error);
    }
}

// ------------------- Quest Summary Notification ------------------
async function sendQuestSummary(quest, reason) {
    try {
        // Use dynamic import to avoid circular dependency
        const questRewardModule = await import('../modules/questRewardModule.js');
        await questRewardModule.sendQuestCompletionSummary(quest, reason);
    } catch (error) {
        console.error(`[QuestModel] ❌ Error sending quest completion summary:`, error);
    }
}

// ------------------- Quest Completion Handler ------------------
function markParticipantCompleted(participant) {
    participant.progress = 'completed';
    participant.completedAt = new Date();
    participant.updatedAt = new Date();
    participant.completionProcessed = false; // Mark for reward processing
    participant.lastCompletionCheck = new Date();
    participant.questSubmissionInfo = null; // Clear quest submission info
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

// ------------------- RP Quest Village Tracking ------------------
questSchema.methods.setRequiredVillage = function(village) {
    this.requiredVillage = village;
    return this;
};


questSchema.methods.disqualifyParticipant = function(userId, reason) {
    const participant = this.getParticipant(userId);
    if (!participant) return false;
    
    participant.progress = 'disqualified';
    participant.disqualifiedAt = new Date();
    participant.disqualificationReason = reason;
    participant.updatedAt = new Date();
    
    return true;
};

questSchema.methods.checkAllParticipantsVillages = async function() {
    if (this.questType !== 'RP' || !this.requiredVillage) {
        return { checked: 0, disqualified: 0 };
    }
    
    const participants = Array.from(this.participants.values());
    let checked = 0;
    let disqualified = 0;
    const now = new Date();
    
    for (const participant of participants) {
        if (participant.progress === 'active') {
            const villageCheck = await this.checkParticipantVillage(participant.userId);
            checked++;
            
            if (!villageCheck.valid) {
                this.disqualifyParticipant(participant.userId, villageCheck.reason);
                disqualified++;
                console.log(`[QuestModel.js] 🚫 Disqualified ${participant.characterName}: ${villageCheck.reason}`);
                
                // Log detailed disqualification info
                console.log(`[QuestModel.js] 🚫 ${participant.characterName} disqualified from quest "${this.title}" at ${now.toISOString()}`);
            } else {
                // Update last successful village check
                participant.lastVillageCheck = now;
                participant.updatedAt = now;
            }
        }
    }
    
    return { checked, disqualified };
};

// ------------------- Check Village Violations for Completed Participants ------------------
questSchema.methods.checkCompletedParticipantsVillages = async function() {
    if (this.questType !== 'RP' || !this.requiredVillage) {
        return { checked: 0, disqualified: 0 };
    }
    
    const participants = Array.from(this.participants.values());
    let checked = 0;
    let disqualified = 0;
    const now = new Date();
    
    for (const participant of participants) {
        // Check both active and completed participants
        if (participant.progress === 'active' || participant.progress === 'completed') {
            const villageCheck = await this.checkParticipantVillage(participant.userId);
            checked++;
            
            if (!villageCheck.valid) {
                // Disqualify even if they were completed
                this.disqualifyParticipant(participant.userId, `Village violation after completion: ${villageCheck.reason}`);
                disqualified++;
                console.log(`[QuestModel.js] 🚫 Disqualified completed participant ${participant.characterName}: ${villageCheck.reason}`);
            }
        }
    }
    
    return { checked, disqualified };
};

// ------------------- Get Village Tracking Statistics ------------------
questSchema.methods.getVillageTrackingStats = function() {
    if (this.questType !== 'RP' || !this.requiredVillage) {
        return { totalParticipants: 0, activeParticipants: 0, completedParticipants: 0, disqualifiedParticipants: 0 };
    }
    
    const participants = Array.from(this.participants.values());
    const stats = {
        totalParticipants: participants.length,
        activeParticipants: participants.filter(p => p.progress === 'active').length,
        completedParticipants: participants.filter(p => p.progress === 'completed').length,
        disqualifiedParticipants: participants.filter(p => p.progress === 'disqualified').length,
        requiredVillage: this.requiredVillage
    };
    
    return stats;
};

// ------------------- Enhanced Village Check with Better Logging ------------------
questSchema.methods.checkParticipantVillage = async function(userId) {
    const participant = this.getParticipant(userId);
    if (!participant) return { valid: false, reason: 'Participant not found' };
    
    if (this.questType !== 'RP') {
        return { valid: true, reason: 'Not an RP quest' };
    }
    
    // Check if participant has a required village set
    if (!participant.requiredVillage) {
        return { valid: true, reason: 'No village requirement for this participant' };
    }
    
    const character = await Character.findOne({
        name: participant.characterName,
        userId: participant.userId
    });
    
    if (!character) {
        return { valid: false, reason: 'Character not found' };
    }
    
    const currentVillage = character.currentVillage.toLowerCase();
    const requiredVillage = participant.requiredVillage.toLowerCase();
    
    if (currentVillage !== requiredVillage) {
        return { 
            valid: false, 
            reason: `Character is in ${currentVillage}, must be in ${requiredVillage}`,
            currentVillage: character.currentVillage,
            requiredVillage: participant.requiredVillage
        };
    }
    
    // Update last village check time
    participant.lastVillageCheck = new Date();
    participant.updatedAt = new Date();
    
    return { valid: true, reason: 'Village location valid' };
};

// ------------------- Art Quest Completion from Submission ------------------
questSchema.methods.completeFromArtSubmission = async function(userId, submissionData) {
    try {
        const participant = this.getParticipant(userId);
        if (!participant) {
            throw new Error(`User ${userId} is not a participant in quest ${this.questID}`);
        }
        
        if (this.questType !== 'Art' && this.questType !== 'Art / Writing') {
            throw new Error(`Quest ${this.questID} is not an Art quest`);
        }
        
        if (participant.progress !== 'active') {
            console.log(`[QuestModel] Participant ${participant.characterName} is not active (status: ${participant.progress})`);
            return { success: false, reason: 'Participant not active' };
        }
        
        // Add the approved submission to participant's submissions
        const submission = createQuestSubmission('art', submissionData);
        participant.submissions.push(submission);
        markParticipantCompleted(participant);
        
        // SAFEGUARD: Record quest completion immediately to ensure quest count is updated
        try {
            const questRewardModule = require('../modules/questRewardModule');
            await questRewardModule.recordQuestCompletionSafeguard(participant, this);
        } catch (error) {
            console.error(`[QuestModel.js] ❌ Error recording quest completion safeguard:`, error);
        }
        
        await this.save();
        
        // Send completion notification
        await sendCompletionNotification(this, participant);
        
        console.log(`[QuestModel.js] ✅ Art quest completed for ${participant.characterName} in quest ${this.questID}`);
        
        return { success: true, participant };
        
    } catch (error) {
        console.error(`[QuestModel.js] ❌ Error completing art quest from submission:`, error);
        return { success: false, error: error.message };
    }
};

// ------------------- Writing Quest Completion from Submission ------------------
questSchema.methods.completeFromWritingSubmission = async function(userId, submissionData) {
    try {
        const participant = this.getParticipant(userId);
        if (!participant) {
            throw new Error(`User ${userId} is not a participant in quest ${this.questID}`);
        }
        
        if (this.questType !== 'Writing' && this.questType !== 'Art / Writing') {
            throw new Error(`Quest ${this.questID} is not a Writing quest`);
        }
        
        if (participant.progress !== 'active') {
            console.log(`[QuestModel] Participant ${participant.characterName} is not active (status: ${participant.progress})`);
            return { success: false, reason: 'Participant not active' };
        }
        
        // Add the approved submission to participant's submissions
        const submission = createQuestSubmission('writing', submissionData);
        participant.submissions.push(submission);
        markParticipantCompleted(participant);
        
        // SAFEGUARD: Record quest completion immediately to ensure quest count is updated
        try {
            const questRewardModule = require('../modules/questRewardModule');
            await questRewardModule.recordQuestCompletionSafeguard(participant, this);
        } catch (error) {
            console.error(`[QuestModel.js] ❌ Error recording quest completion safeguard:`, error);
        }
        
        await this.save();
        
        // Send completion notification
        await sendCompletionNotification(this, participant);
        
        console.log(`[QuestModel.js] ✅ Writing quest completed for ${participant.characterName} in quest ${this.questID}`);
        
        return { success: true, participant };
        
    } catch (error) {
        console.error(`[QuestModel.js] ❌ Error completing writing quest from submission:`, error);
        return { success: false, error: error.message };
    }
};

// ------------------- Parse Multiple Items ------------------
questSchema.methods.parseMultipleItems = function(itemRewardString) {
    if (!itemRewardString || itemRewardString === 'N/A' || itemRewardString === '') {
        return [];
    }
    
    const items = [];
    const itemStrings = itemRewardString.split(';');
    
    for (const itemString of itemStrings) {
        const trimmed = itemString.trim();
        if (trimmed.includes(':')) {
            const [name, qty] = trimmed.split(':').map(s => s.trim());
            items.push({
                name: name,
                quantity: parseInt(qty, 10) || 1
            });
        } else {
            items.push({
                name: trimmed,
                quantity: 1
            });
        }
    }
    
    return items;
};

// ------------------- Quest Submission Linking ------------------
questSchema.methods.linkSubmission = async function(userId, submissionData) {
    try {
        const participant = this.getParticipant(userId);
        if (!participant) {
            throw new Error(`User ${userId} is not a participant in quest ${this.questID}`);
        }
        
        if (this.questType !== 'Art' && this.questType !== 'Writing') {
            throw new Error(`Quest ${this.questID} is not an Art or Writing quest`);
        }
        
        if (participant.progress !== 'active') {
            console.log(`[QuestModel] Participant ${participant.characterName} is not active (status: ${participant.progress})`);
            return { success: false, reason: 'Participant not active' };
        }
        
        // Store quest submission info for later processing
        participant.questSubmissionInfo = {
            submissionId: submissionData.submissionId,
            questEvent: submissionData.questEvent,
            messageUrl: submissionData.messageUrl,
            fileUrl: submissionData.fileUrl,
            link: submissionData.link,
            title: submissionData.title,
            category: submissionData.category,
            linkedAt: new Date()
        };
        
        participant.updatedAt = new Date();
        await this.save();
        
        console.log(`[QuestModel.js] ✅ Submission linked for ${participant.characterName} in quest ${this.questID}`);
        
        return { success: true, participant };
        
    } catch (error) {
        console.error(`[QuestModel.js] ❌ Error linking submission to quest:`, error);
        return { success: false, error: error.message };
    }
};

// ------------------- Interactive Quest Completion from Table Roll ------------------
questSchema.methods.completeFromTableRoll = async function(userId, rollResult) {
    try {
        const participant = this.getParticipant(userId);
        if (!participant) {
            throw new Error(`User ${userId} is not a participant in quest ${this.questID}`);
        }
        
        if (this.questType !== 'Interactive') {
            throw new Error(`Quest ${this.questID} is not an Interactive quest`);
        }
        
        if (participant.progress !== 'active') {
            console.log(`[QuestModel] Participant ${participant.characterName} is not active (status: ${participant.progress})`);
            return { success: false, reason: 'Participant not active' };
        }
        
        // Process the table roll
        const rollResult_data = await this.processTableRoll(userId, rollResult);
        
        if (!rollResult_data.success) {
            return rollResult_data;
        }
        
        // Check if quest is now completed
        if (rollResult_data.questCompleted) {
            markParticipantCompleted(participant);
            
            // SAFEGUARD: Record quest completion immediately to ensure quest count is updated
            try {
                const questRewardModule = require('../modules/questRewardModule');
                await questRewardModule.recordQuestCompletionSafeguard(participant, this);
            } catch (error) {
                console.error(`[QuestModel.js] ❌ Error recording quest completion safeguard:`, error);
            }
            
            await this.save();
            
            // Send completion notification
            await sendCompletionNotification(this, participant);
            
            console.log(`[QuestModel.js] ✅ Interactive quest completed for ${participant.characterName} in quest ${this.questID}`);
        }
        
        return rollResult_data;
        
    } catch (error) {
        console.error(`[QuestModel.js] ❌ Error completing interactive quest from table roll:`, error);
        return { success: false, error: error.message };
    }
};

// ------------------- Interactive Quest Table Roll Methods ------------------
questSchema.methods.setTableRollConfig = function(tableRollName, config = {}) {
    if (this.questType !== 'Interactive') {
        throw new Error(`Quest ${this.questID} is not an Interactive quest`);
    }
    
    // Validate success criteria if provided
    if (config.successCriteria) {
        const validation = this.validateSuccessCriteria(config.successCriteria);
        if (!validation.valid) {
            throw new Error(`Invalid success criteria: ${validation.error}`);
        }
    }
    
    this.tableRollName = tableRollName;
    this.tableRollConfig = config;
    this.requiredRolls = config.requiredRolls || 1;
    this.rollSuccessCriteria = config.successCriteria || null;
    
    return this;
};

// ------------------- Validate Success Criteria Format ------------------
questSchema.methods.validateSuccessCriteria = function(criteria) {
    try {
        if (!criteria || typeof criteria !== 'string') {
            return { valid: false, error: 'Criteria must be a non-empty string' };
        }
        
        const criteriaTrimmed = criteria.trim();
        if (criteriaTrimmed.length === 0) {
            return { valid: false, error: 'Criteria cannot be empty' };
        }
        
        // Check for valid criteria types
        const validTypes = ['item:', 'flavor:', 'weight:', 'thumbnail:', 'exact:', 'regex:'];
        const hasValidType = validTypes.some(type => criteriaTrimmed.toLowerCase().includes(type));
        
        if (!hasValidType && !criteriaTrimmed.includes(' AND ') && !criteriaTrimmed.includes(' OR ')) {
            return { valid: false, error: `Criteria must start with one of: ${validTypes.join(', ')} or contain AND/OR logic` };
        }
        
        // Validate weight criteria format
        if (criteriaTrimmed.toLowerCase().includes('weight:')) {
            const weightValidation = this.validateWeightCriteria(criteriaTrimmed);
            if (!weightValidation.valid) {
                return weightValidation;
            }
        }
        
        // Validate regex criteria format
        if (criteriaTrimmed.toLowerCase().includes('regex:')) {
            const regexValidation = this.validateRegexCriteria(criteriaTrimmed);
            if (!regexValidation.valid) {
                return regexValidation;
            }
        }
        
        return { valid: true, error: null };
        
    } catch (error) {
        return { valid: false, error: `Validation error: ${error.message}` };
    }
};

// ------------------- Validate Weight Criteria Format ------------------
questSchema.methods.validateWeightCriteria = function(criteria) {
    const weightMatches = criteria.match(/weight:\s*([^ANDOR]+)/gi);
    if (!weightMatches) {
        return { valid: true, error: null }; // No weight criteria found
    }
    
    for (const match of weightMatches) {
        const weightPart = match.split(':')[1].trim();
        
        // Check for valid weight operators
        const validOperators = ['>=', '<=', '>', '<', '-'];
        const hasValidOperator = validOperators.some(op => weightPart.includes(op));
        
        if (!hasValidOperator && isNaN(parseFloat(weightPart))) {
            return { valid: false, error: `Invalid weight criteria: "${weightPart}". Must use operators (>=, <=, >, <, -) or exact number` };
        }
        
        // Validate range format
        if (weightPart.includes('-')) {
            const [min, max] = weightPart.split('-').map(x => x.trim());
            if (isNaN(parseFloat(min)) || isNaN(parseFloat(max))) {
                return { valid: false, error: `Invalid range format: "${weightPart}". Both values must be numbers` };
            }
            if (parseFloat(min) >= parseFloat(max)) {
                return { valid: false, error: `Invalid range: minimum (${min}) must be less than maximum (${max})` };
            }
        }
    }
    
    return { valid: true, error: null };
};

// ------------------- Validate Regex Criteria Format ------------------
questSchema.methods.validateRegexCriteria = function(criteria) {
    const regexMatches = criteria.match(/regex:\s*([^ANDOR]+)/gi);
    if (!regexMatches) {
        return { valid: true, error: null }; // No regex criteria found
    }
    
    for (const match of regexMatches) {
        const regexPart = match.split(':')[1].trim();
        try {
            new RegExp(regexPart, 'i');
        } catch (error) {
            return { valid: false, error: `Invalid regex pattern: "${regexPart}". ${error.message}` };
        }
    }
    
    return { valid: true, error: null };
};

// ------------------- Get Supported Criteria Types ------------------
questSchema.methods.getSupportedCriteriaTypes = function() {
    return {
        simple: [
            'item:text - Item name contains text',
            'flavor:text - Flavor text contains text', 
            'weight:>5 - Weight greater than 5',
            'weight:>=5 - Weight greater than or equal to 5',
            'weight:<10 - Weight less than 10',
            'weight:<=10 - Weight less than or equal to 10',
            'weight:5-10 - Weight between 5 and 10',
            'weight:5 - Exact weight of 5',
            'thumbnail:text - Thumbnail URL contains text',
            'exact:text - Item name exactly matches text',
            'regex:pattern - Matches regex pattern'
        ],
        complex: [
            'item:sword AND weight:>5 - Item contains "sword" AND weight > 5',
            'flavor:magic OR item:staff - Flavor contains "magic" OR item contains "staff"',
            'item:sword AND weight:>5 AND flavor:enchanted - Multiple AND conditions',
            'item:sword OR item:staff OR item:bow - Multiple OR conditions'
        ],
        examples: [
            'item:sword - Find any sword',
            'weight:>10 - Find heavy items',
            'flavor:enchanted AND weight:>5 - Find heavy enchanted items',
            'item:sword OR item:staff - Find weapons',
            'regex:^[A-Z].* - Find items starting with capital letter'
        ]
    };
};

questSchema.methods.processTableRoll = async function(userId, rollResult) {
    try {
        const participant = this.getParticipant(userId);
        if (!participant) {
            throw new Error(`User ${userId} is not a participant in quest ${this.questID}`);
        }
        
        if (this.questType !== 'Interactive') {
            throw new Error(`Quest ${this.questID} is not an Interactive quest`);
        }
        
        if (participant.progress !== 'active') {
            console.log(`[QuestModel] Participant ${participant.characterName} is not active (status: ${participant.progress})`);
            return { success: false, reason: 'Participant not active' };
        }
        
        if (!this.tableRollName) {
            throw new Error(`Quest ${this.questID} has no table roll configured`);
        }
        
        // Determine if this roll is successful based on criteria
        const isSuccess = this.evaluateRollSuccess(rollResult);
        
        // Add roll result to participant's history
        const rollEntry = {
            rollNumber: participant.tableRollResults.length + 1,
            result: rollResult,
            rolledAt: new Date(),
            success: isSuccess
        };
        
        participant.tableRollResults.push(rollEntry);
        
        if (isSuccess) {
            participant.successfulRolls += 1;
        }
        
        participant.updatedAt = new Date();
        await this.save();
        
        console.log(`[QuestModel.js] ✅ Table roll processed for ${participant.characterName} in quest ${this.questID} - Success: ${isSuccess}`);
        
        return { 
            success: true, 
            rollEntry, 
            isSuccess,
            totalSuccessfulRolls: participant.successfulRolls,
            requiredRolls: this.requiredRolls,
            questCompleted: participant.successfulRolls >= this.requiredRolls
        };
        
    } catch (error) {
        console.error(`[QuestModel.js] ❌ Error processing table roll:`, error);
        return { success: false, error: error.message };
    }
};

questSchema.methods.evaluateRollSuccess = function(rollResult) {
    if (!this.rollSuccessCriteria) {
        // Default: any roll is successful
        return true;
    }
    
    try {
        // Parse and evaluate success criteria
        const evaluationResult = this.parseAndEvaluateCriteria(this.rollSuccessCriteria, rollResult);
        
        console.log(`[QuestModel.js] 🎯 Roll success evaluation for quest ${this.questID}:`, {
            criteria: this.rollSuccessCriteria,
            rollResult: rollResult,
            success: evaluationResult.success,
            reason: evaluationResult.reason
        });
        
        return evaluationResult.success;
        
    } catch (error) {
        console.error(`[QuestModel.js] ❌ Error evaluating roll success:`, error);
        // Default to true to avoid blocking quest progress
        return true;
    }
};

// ------------------- Parse and Evaluate Success Criteria ------------------
questSchema.methods.parseAndEvaluateCriteria = function(criteriaString, rollResult) {
    try {
        // Handle complex criteria with AND/OR logic
        if (criteriaString.includes(' AND ') || criteriaString.includes(' OR ')) {
            return this.evaluateComplexCriteria(criteriaString, rollResult);
        }
        
        // Handle simple single criteria
        return this.evaluateSimpleCriteria(criteriaString, rollResult);
        
    } catch (error) {
        console.error(`[QuestModel.js] ❌ Error parsing criteria "${criteriaString}":`, error);
        return { success: false, reason: `Invalid criteria format: ${error.message}` };
    }
};

// ------------------- Evaluate Simple Single Criteria ------------------
questSchema.methods.evaluateSimpleCriteria = function(criteria, rollResult) {
    const criteriaLower = criteria.toLowerCase().trim();
    
    // Item criteria
    if (criteriaLower.startsWith('item:')) {
        const requiredItem = criteria.split(':')[1].trim();
        const hasItem = rollResult.item && rollResult.item.toLowerCase().includes(requiredItem.toLowerCase());
        return { 
            success: hasItem, 
            reason: hasItem ? `Item "${rollResult.item}" contains "${requiredItem}"` : `Item "${rollResult.item}" does not contain "${requiredItem}"`
        };
    }
    
    // Flavor criteria
    if (criteriaLower.startsWith('flavor:')) {
        const requiredFlavor = criteria.split(':')[1].trim();
        const hasFlavor = rollResult.flavor && rollResult.flavor.toLowerCase().includes(requiredFlavor.toLowerCase());
        return { 
            success: hasFlavor, 
            reason: hasFlavor ? `Flavor contains "${requiredFlavor}"` : `Flavor does not contain "${requiredFlavor}"`
        };
    }
    
    // Weight criteria with operators
    if (criteriaLower.startsWith('weight:')) {
        const weightCondition = criteria.split(':')[1].trim();
        return this.evaluateWeightCriteria(weightCondition, rollResult);
    }
    
    // Thumbnail criteria
    if (criteriaLower.startsWith('thumbnail:')) {
        const requiredThumbnail = criteria.split(':')[1].trim();
        const hasThumbnail = rollResult.thumbnailImage && rollResult.thumbnailImage.toLowerCase().includes(requiredThumbnail.toLowerCase());
        return { 
            success: hasThumbnail, 
            reason: hasThumbnail ? `Thumbnail contains "${requiredThumbnail}"` : `Thumbnail does not contain "${requiredThumbnail}"`
        };
    }
    
    // Exact match criteria
    if (criteriaLower.startsWith('exact:')) {
        const requiredExact = criteria.split(':')[1].trim();
        const isExact = rollResult.item && rollResult.item.toLowerCase() === requiredExact.toLowerCase();
        return { 
            success: isExact, 
            reason: isExact ? `Item exactly matches "${requiredExact}"` : `Item "${rollResult.item}" does not exactly match "${requiredExact}"`
        };
    }
    
    // Regex criteria
    if (criteriaLower.startsWith('regex:')) {
        const regexPattern = criteria.split(':')[1].trim();
        try {
            const regex = new RegExp(regexPattern, 'i');
            const matches = regex.test(rollResult.item || '') || regex.test(rollResult.flavor || '');
            return { 
                success: matches, 
                reason: matches ? `Matches regex pattern "${regexPattern}"` : `Does not match regex pattern "${regexPattern}"`
            };
        } catch (error) {
            return { success: false, reason: `Invalid regex pattern: ${error.message}` };
        }
    }
    
    // Unknown criteria type
    return { 
        success: false, 
        reason: `Unknown criteria type: ${criteria.split(':')[0]}` 
    };
};

// ------------------- Evaluate Weight Criteria ------------------
questSchema.methods.evaluateWeightCriteria = function(weightCondition, rollResult) {
    if (!rollResult.weight) {
        return { success: false, reason: 'No weight value in roll result' };
    }
    
    const rollWeight = parseFloat(rollResult.weight);
    const condition = weightCondition.trim();
    
    // Greater than
    if (condition.startsWith('>=')) {
        const minWeight = parseFloat(condition.substring(2));
        const success = rollWeight >= minWeight;
        return { 
            success, 
            reason: success ? `Weight ${rollWeight} >= ${minWeight}` : `Weight ${rollWeight} < ${minWeight}`
        };
    }
    
    if (condition.startsWith('>')) {
        const minWeight = parseFloat(condition.substring(1));
        const success = rollWeight > minWeight;
        return { 
            success, 
            reason: success ? `Weight ${rollWeight} > ${minWeight}` : `Weight ${rollWeight} <= ${minWeight}`
        };
    }
    
    // Less than
    if (condition.startsWith('<=')) {
        const maxWeight = parseFloat(condition.substring(2));
        const success = rollWeight <= maxWeight;
        return { 
            success, 
            reason: success ? `Weight ${rollWeight} <= ${maxWeight}` : `Weight ${rollWeight} > ${maxWeight}`
        };
    }
    
    if (condition.startsWith('<')) {
        const maxWeight = parseFloat(condition.substring(1));
        const success = rollWeight < maxWeight;
        return { 
            success, 
            reason: success ? `Weight ${rollWeight} < ${maxWeight}` : `Weight ${rollWeight} >= ${maxWeight}`
        };
    }
    
    // Range (e.g., "5-10")
    if (condition.includes('-')) {
        const [min, max] = condition.split('-').map(x => parseFloat(x.trim()));
        const success = rollWeight >= min && rollWeight <= max;
        return { 
            success, 
            reason: success ? `Weight ${rollWeight} is in range ${min}-${max}` : `Weight ${rollWeight} is not in range ${min}-${max}`
        };
    }
    
    // Exact match
    const exactWeight = parseFloat(condition);
    const success = Math.abs(rollWeight - exactWeight) < 0.001; // Account for floating point precision
    return { 
        success, 
        reason: success ? `Weight ${rollWeight} exactly matches ${exactWeight}` : `Weight ${rollWeight} does not match ${exactWeight}`
    };
};

// ------------------- Evaluate Complex Criteria (AND/OR Logic) ------------------
questSchema.methods.evaluateComplexCriteria = function(criteriaString, rollResult) {
    try {
        // Parse AND/OR logic
        const andParts = criteriaString.split(' AND ');
        if (andParts.length > 1) {
            // Handle AND logic
            const results = andParts.map(part => this.evaluateSimpleCriteria(part.trim(), rollResult));
            const allSuccess = results.every(result => result.success);
            return {
                success: allSuccess,
                reason: allSuccess ? 
                    `All AND conditions met: ${results.map(r => r.reason).join('; ')}` :
                    `AND conditions failed: ${results.filter(r => !r.success).map(r => r.reason).join('; ')}`
            };
        }
        
        const orParts = criteriaString.split(' OR ');
        if (orParts.length > 1) {
            // Handle OR logic
            const results = orParts.map(part => this.evaluateSimpleCriteria(part.trim(), rollResult));
            const anySuccess = results.some(result => result.success);
            return {
                success: anySuccess,
                reason: anySuccess ? 
                    `At least one OR condition met: ${results.filter(r => r.success).map(r => r.reason).join('; ')}` :
                    `All OR conditions failed: ${results.map(r => r.reason).join('; ')}`
            };
        }
        
        // Fallback to simple criteria
        return this.evaluateSimpleCriteria(criteriaString, rollResult);
        
    } catch (error) {
        console.error(`[QuestModel.js] ❌ Error evaluating complex criteria:`, error);
        return { success: false, reason: `Complex criteria evaluation failed: ${error.message}` };
    }
};

// ============================================================================
// ------------------- Quest Completion System -------------------
// ============================================================================

// ------------------- Auto Completion Check ------------------
questSchema.methods.checkAutoCompletion = async function(forceCheck = false) {
    // Prevent duplicate processing unless forced
    if (!forceCheck && this.completionProcessed) {
        return { completed: false, reason: 'Already processed' };
    }
    
    if (this.status !== PROGRESS_STATUS.ACTIVE) {
        return { completed: false, reason: 'Quest not active' };
    }
    
    // Update last completion check time
    this.lastCompletionCheck = new Date();
    
    const timeExpired = this.checkTimeExpiration();
    if (timeExpired) {
        this.status = PROGRESS_STATUS.COMPLETED;
        this.completedAt = new Date();
        this.completionReason = COMPLETION_REASONS.TIME_EXPIRED;
        this.completionProcessed = false; // Mark for reward processing
        
        // Mark all remaining active participants as failed since quest expired
        let failedCount = 0;
        for (const [userId, participant] of this.participants) {
            if (participant.progress === PROGRESS_STATUS.ACTIVE) {
                // If they don't meet requirements, mark as failed
                if (!meetsRequirements(participant, this)) {
                    participant.progress = PROGRESS_STATUS.FAILED;
                    failedCount++;
                    console.log(`[QuestModel.js] ❌ Marked participant ${participant.characterName} as failed (quest expired without meeting requirements)`);
                }
            }
        }
        
        if (failedCount > 0) {
            console.log(`[QuestModel.js] ⚠️ Marked ${failedCount} participants as failed due to quest expiration`);
        }
        
        await this.save();
        
        // Don't send summary here - it will be sent after rewards are processed
        // to avoid duplicate messages
        
        console.log(`[QuestModel.js] ⏰ Quest "${this.title}" completed due to time expiration`);
        return { completed: true, reason: COMPLETION_REASONS.TIME_EXPIRED, needsRewardProcessing: true };
    }
    
    let participantsCompleted = 0;
    let newCompletions = 0;
    
    for (const [userId, participant] of this.participants) {
        if (participant.progress === PROGRESS_STATUS.ACTIVE && meetsRequirements(participant, this)) {
            markParticipantCompleted(participant);
            participantsCompleted++;
            newCompletions++;
            console.log(`[QuestModel.js] ✅ Auto-completed quest for ${participant.characterName} in quest ${this.title}`);
            
            // SAFEGUARD: Record quest completion immediately to ensure quest count is updated
            // even if reward processing doesn't happen immediately
            try {
                const questRewardModule = require('../modules/questRewardModule');
                await questRewardModule.recordQuestCompletionSafeguard(participant, this);
            } catch (error) {
                console.error(`[QuestModel.js] ❌ Error recording quest completion safeguard:`, error);
            }
            
            // Send completion notification for non-RP quests (RP quests handle their own notifications)
            if (this.questType !== QUEST_TYPES.RP) {
                await sendCompletionNotification(this, participant);
            }
        }
    }
    
    // For RP quests, check village locations and disqualify if needed
    if (this.questType === QUEST_TYPES.RP) {
        const villageCheckResult = await this.checkAllParticipantsVillages();
        if (villageCheckResult.disqualified > 0) {
            console.log(`[QuestModel.js] ⚠️ Disqualified ${villageCheckResult.disqualified} participants for leaving quest village`);
        }
        
        // Also check completed participants for village violations
        const completedVillageCheck = await this.checkCompletedParticipantsVillages();
        if (completedVillageCheck.disqualified > 0) {
            console.log(`[QuestModel.js] ⚠️ Disqualified ${completedVillageCheck.disqualified} completed participants for village violations`);
        }
    }
    
    const allCompleted = Array.from(this.participants.values()).every(p => p.progress === PROGRESS_STATUS.COMPLETED);
    // Only complete quest when all participants finished AND time has expired
    // This prevents premature completion when submissions are approved before the quest period ends
    if (allCompleted && this.status === PROGRESS_STATUS.ACTIVE) {
        // Check if time has expired - quest should only complete when period ends
        const timeExpired = this.checkTimeExpiration();
        if (!timeExpired) {
            console.log(`[QuestModel.js] ⏳ All participants completed quest "${this.title}", but waiting for quest period to end before completing`);
            await this.save();
            return { completed: false, reason: 'All participants completed, but quest period has not ended yet' };
        }
        
        // Time has expired and all participants completed - proceed with completion
        this.status = PROGRESS_STATUS.COMPLETED;
        this.completedAt = new Date();
        this.completionReason = COMPLETION_REASONS.ALL_PARTICIPANTS_COMPLETED;
        this.completionProcessed = false; // Mark for reward processing
        console.log(`[QuestModel.js] 🎉 Quest "${this.title}" completed - all participants finished and quest period has ended`);
        await this.save();
        
        // Don't send summary here - it will be sent after rewards are processed
        // to avoid duplicate messages
        
        return { completed: true, reason: COMPLETION_REASONS.ALL_PARTICIPANTS_COMPLETED, needsRewardProcessing: true };
    }
    
    if (participantsCompleted > 0) {
        await this.save();
        return { completed: false, reason: `${participantsCompleted} participants completed`, newCompletions };
    }
    
    return { completed: false, reason: 'No participants completed' };
};

// ------------------- Mark Completion as Processed ------------------
questSchema.methods.markCompletionProcessed = async function() {
    this.completionProcessed = true;
    await this.save();
    console.log(`[QuestModel.js] ✅ Marked quest ${this.questID} completion as processed`);
};

// ------------------- Time Expiration Check ------------------
questSchema.methods.checkTimeExpiration = function() {
    if (!this.timeLimit) {
        return false;
    }
    
    // Use postedAt if available, otherwise fall back to createdAt
    // This handles quests that were created but never officially "posted"
    const startDate = this.postedAt || this.createdAt;
    if (!startDate) {
        return false;
    }
    
    // Convert current time to EST-equivalent (UTC-5) for consistent timezone handling
    const now = new Date();
    const nowEST = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const startDateTime = new Date(startDate);
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
    
    const expirationTime = new Date(startDateTime.getTime() + durationMs);
    return nowEST > expirationTime;
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
    
    // Handle special formats like "flat:300", "per_unit:50", etc.
    if (typeof tokenReward === 'string') {
        // Check for "flat:X" format
        const flatMatch = tokenReward.match(/^flat:(\d+)$/i);
        if (flatMatch) {
            return Math.max(0, parseInt(flatMatch[1], 10));
        }
        
        // Check for "per_unit:X" format
        const perUnitMatch = tokenReward.match(/^per_unit:(\d+)$/i);
        if (perUnitMatch) {
            // For per_unit, we'd need participant info, so return 0 here
            // The actual calculation should be done elsewhere with participant data
            return 0;
        }
        
        // Try to parse as a regular number
        const parsed = parseFloat(tokenReward);
        if (!isNaN(parsed)) {
            return Math.max(0, parsed);
        }
    }
    
    return 0;
};

// ------------------- Export Quest Model -------------------
module.exports = mongoose.models.Quest || mongoose.model('Quest', questSchema);
