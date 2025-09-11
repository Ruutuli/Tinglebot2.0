const mongoose = require('mongoose');
const { Schema } = mongoose;

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
    const { questType, postRequirement, requiredRolls } = quest;
    const { rpPostCount, submissions, successfulRolls } = participant;
    
    if (questType === QUEST_TYPES.RP) {
        return rpPostCount >= (postRequirement || 15);
    }
    
    if (questType === QUEST_TYPES.ART || questType === QUEST_TYPES.WRITING) {
        const submissionType = questType.toLowerCase();
        return submissions.some(sub => 
            sub.type === submissionType && sub.approved
        );
    }
    
    if (questType === 'Art / Writing') {
        return submissions.some(sub => 
            (sub.type === 'art' || sub.type === 'writing') && sub.approved
        );
    }
    
    if (questType === QUEST_TYPES.INTERACTIVE) {
        return successfulRolls >= (requiredRolls || 1);
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

// ------------------- RP Quest Village Tracking ------------------
questSchema.methods.setRequiredVillage = function(village) {
    this.requiredVillage = village;
    return this;
};

questSchema.methods.checkParticipantVillage = async function(userId) {
    const participant = this.getParticipant(userId);
    if (!participant) return { valid: false, reason: 'Participant not found' };
    
    if (this.questType !== 'RP' || !this.requiredVillage) {
        return { valid: true, reason: 'Not an RP quest or no village requirement' };
    }
    
    const Character = require('./CharacterModel');
    const character = await Character.findOne({
        name: participant.characterName,
        userId: participant.userId
    });
    
    if (!character) {
        return { valid: false, reason: 'Character not found' };
    }
    
    const currentVillage = character.currentVillage.toLowerCase();
    const requiredVillage = this.requiredVillage.toLowerCase();
    
    if (currentVillage !== requiredVillage) {
        return { valid: false, reason: `Character is in ${currentVillage}, must be in ${requiredVillage}` };
    }
    
    // Update last village check time
    participant.lastVillageCheck = new Date();
    participant.updatedAt = new Date();
    
    return { valid: true, reason: 'Village location valid' };
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
    
    for (const participant of participants) {
        if (participant.progress === 'active') {
            const villageCheck = await this.checkParticipantVillage(participant.userId);
            checked++;
            
            if (!villageCheck.valid) {
                this.disqualifyParticipant(participant.userId, villageCheck.reason);
                disqualified++;
                console.log(`[QuestModel] Disqualified ${participant.characterName}: ${villageCheck.reason}`);
            }
        }
    }
    
    return { checked, disqualified };
};

// ------------------- Art Quest Completion from Submission ------------------
questSchema.methods.completeFromArtSubmission = async function(userId, submissionData) {
    try {
        const participant = this.getParticipant(userId);
        if (!participant) {
            throw new Error(`User ${userId} is not a participant in quest ${this.questID}`);
        }
        
        if (this.questType !== 'Art') {
            throw new Error(`Quest ${this.questID} is not an Art quest`);
        }
        
        if (participant.progress !== 'active') {
            console.log(`[QuestModel] Participant ${participant.characterName} is not active (status: ${participant.progress})`);
            return { success: false, reason: 'Participant not active' };
        }
        
        // Add the approved submission to participant's submissions
        const submission = {
            type: 'art',
            url: submissionData.messageUrl || submissionData.fileUrl,
            submittedAt: new Date(),
            approved: true,
            approvedBy: submissionData.approvedBy || 'System',
            approvedAt: new Date()
        };
        
        participant.submissions.push(submission);
        participant.progress = 'completed';
        participant.completedAt = new Date();
        participant.updatedAt = new Date();
        
        // Clear quest submission info if it exists
        participant.questSubmissionInfo = null;
        
        await this.save();
        
        console.log(`[QuestModel] ✅ Art quest completed for ${participant.characterName} in quest ${this.questID}`);
        
        return { success: true, participant };
        
    } catch (error) {
        console.error(`[QuestModel] ❌ Error completing art quest from submission:`, error);
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
        
        if (this.questType !== 'Writing') {
            throw new Error(`Quest ${this.questID} is not a Writing quest`);
        }
        
        if (participant.progress !== 'active') {
            console.log(`[QuestModel] Participant ${participant.characterName} is not active (status: ${participant.progress})`);
            return { success: false, reason: 'Participant not active' };
        }
        
        // Add the approved submission to participant's submissions
        const submission = {
            type: 'writing',
            url: submissionData.messageUrl || submissionData.link,
            submittedAt: new Date(),
            approved: true,
            approvedBy: submissionData.approvedBy || 'System',
            approvedAt: new Date()
        };
        
        participant.submissions.push(submission);
        participant.progress = 'completed';
        participant.completedAt = new Date();
        participant.updatedAt = new Date();
        
        // Clear quest submission info if it exists
        participant.questSubmissionInfo = null;
        
        await this.save();
        
        console.log(`[QuestModel] ✅ Writing quest completed for ${participant.characterName} in quest ${this.questID}`);
        
        return { success: true, participant };
        
    } catch (error) {
        console.error(`[QuestModel] ❌ Error completing writing quest from submission:`, error);
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
        
        console.log(`[QuestModel] ✅ Submission linked for ${participant.characterName} in quest ${this.questID}`);
        
        return { success: true, participant };
        
    } catch (error) {
        console.error(`[QuestModel] ❌ Error linking submission to quest:`, error);
        return { success: false, error: error.message };
    }
};

// ------------------- Interactive Quest Table Roll Methods ------------------
questSchema.methods.setTableRollConfig = function(tableRollName, config = {}) {
    if (this.questType !== 'Interactive') {
        throw new Error(`Quest ${this.questID} is not an Interactive quest`);
    }
    
    this.tableRollName = tableRollName;
    this.tableRollConfig = config;
    this.requiredRolls = config.requiredRolls || 1;
    this.rollSuccessCriteria = config.successCriteria || null;
    
    return this;
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
        
        console.log(`[QuestModel] ✅ Table roll processed for ${participant.characterName} in quest ${this.questID} - Success: ${isSuccess}`);
        
        return { 
            success: true, 
            rollEntry, 
            isSuccess,
            totalSuccessfulRolls: participant.successfulRolls,
            requiredRolls: this.requiredRolls,
            questCompleted: participant.successfulRolls >= this.requiredRolls
        };
        
    } catch (error) {
        console.error(`[QuestModel] ❌ Error processing table roll:`, error);
        return { success: false, error: error.message };
    }
};

questSchema.methods.evaluateRollSuccess = function(rollResult) {
    if (!this.rollSuccessCriteria) {
        // Default: any roll is successful
        return true;
    }
    
    // Parse success criteria (e.g., "item:sword", "rarity:rare", "weight:>5")
    const criteria = this.rollSuccessCriteria.toLowerCase();
    
    if (criteria.startsWith('item:')) {
        const requiredItem = criteria.split(':')[1];
        return rollResult.item && rollResult.item.toLowerCase().includes(requiredItem);
    }
    
    if (criteria.startsWith('rarity:')) {
        const requiredRarity = criteria.split(':')[1];
        return rollResult.rarity && rollResult.rarity.toLowerCase() === requiredRarity;
    }
    
    if (criteria.startsWith('weight:')) {
        const weightCondition = criteria.split(':')[1];
        if (weightCondition.startsWith('>')) {
            const minWeight = parseFloat(weightCondition.substring(1));
            return rollResult.weight && rollResult.weight > minWeight;
        }
        if (weightCondition.startsWith('<')) {
            const maxWeight = parseFloat(weightCondition.substring(1));
            return rollResult.weight && rollResult.weight < maxWeight;
        }
        const exactWeight = parseFloat(weightCondition);
        return rollResult.weight && rollResult.weight === exactWeight;
    }
    
    // Default: any roll is successful
    return true;
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
    
    // For RP quests, check village locations and disqualify if needed
    if (this.questType === QUEST_TYPES.RP) {
        const villageCheckResult = await this.checkAllParticipantsVillages();
        if (villageCheckResult.disqualified > 0) {
            console.log(`[QuestModel.js] ⚠️ Disqualified ${villageCheckResult.disqualified} participants for leaving quest village`);
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
