// ============================================================================
// ------------------- rpQuestTrackingModule.js -------------------
// Handles automatic tracking of RP posts in quest threads
// ============================================================================

const Quest = require('../models/QuestModel');
const { handleError } = require('../utils/globalErrorHandler');

// ------------------- Validation Constants -------------------
const VALIDATION_RULES = {
    MIN_CONTENT_LENGTH: 10,
    MIN_RP_LENGTH: 20,
    MIN_LETTER_PERCENTAGE: 0.3,
    MIN_UNIQUE_WORDS: 3,
    KEYBOARD_MASH_LENGTH: 10
};

const REACTION_PATTERNS = [
    /^lol+$/i, /^haha+$/i, /^yes+$/i, /^no+$/i, /^ok+$/i,
    /^nice+$/i, /^cool+$/i, /^wow+$/i, /^omg+$/i, /^lmao+$/i,
    /^rofl+$/i, /^xd+$/i, /^uwu+$/i, /^owo+$/i
];

const VALIDATION_REGEX = {
    EMOJI: /^[\p{Emoji}\s]+$/u,
    CUSTOM_EMOJI: /^<a?:\w+:\d+>\s*$/,
    SYMBOLS: /^[\d\s\W]+$/,
    REPEATED_CHARS: /^(.)\1{10,}$/,
    PUNCTUATION: /^[\s\p{P}]+$/u,
    URL: /^https?:\/\/\S+$/i,
    MENTION: /^<@!?\d+>\s*$/,
    CHANNEL_MENTION: /^<#\d+>\s*$/,
    KEYBOARD_MASH: /^[qwertyuiopasdfghjklzxcvbnm]{10,}$/i
};

// ------------------- Handle RP Post Tracking -------------------
async function handleRPPostTracking(message) {
    try {
        // Check if this thread is an RP quest thread
        if (!isRPQuestThread(message.channel)) {
            return;
        }

        console.log(`[rpQuestTracking] 📝 Tracking post in ${message.channel.name}`);

        // Find and validate quest
        const quest = await findQuestByThreadId(message.channel.id);
        if (!quest || !isValidRPQuest(quest)) {
            console.log(`[rpQuestTracking] ❌ No valid RP quest found for thread ${message.channel.id}`);
            return;
        }

        // Find and validate participant
        const participant = quest.getParticipant(message.author.id);
        if (!participant) {
            console.log(`[rpQuestTracking] ❌ User not participant in quest ${quest.questID}`);
            return;
        }

        // Validate RP post
        const validationResult = validateRPPostWithReason(message);
        if (!validationResult.valid) {
            console.log(`[rpQuestTracking] ❌ Invalid post from ${message.author.id} - ${validationResult.reason}`);
            return;
        }

        // Check village location for RP quest participants
        const villageCheck = await quest.checkParticipantVillage(participant.userId);
        if (!villageCheck.valid) {
            console.log(`[rpQuestTracking] ❌ Participant ${participant.characterName} disqualified: ${villageCheck.reason}`);
            quest.disqualifyParticipant(participant.userId, villageCheck.reason);
            await quest.save();
            return;
        }

        // Process valid RP post
        await processValidRPPost(quest, participant, message.channel.id);

    } catch (error) {
        console.error(`[rpQuestTracking] ❌ Error tracking RP post:`, error);
        handleError(error, 'rpQuestTrackingModule.js');
    }
}

// ------------------- Helper Functions -------------------
function isRPQuestThread(channel) {
    const threadName = channel.name.toLowerCase();
    return threadName.includes('📜') && threadName.includes('rp thread');
}

function isValidRPQuest(quest) {
    return quest && quest.questType === 'RP' && quest.status === 'active';
}

async function processValidRPPost(quest, participant, channelId) {
    // Increment the RP post count
    quest.incrementRPPosts(participant);
    
    // Update the RP thread ID if not set
    if (!participant.rpThreadId) {
        participant.rpThreadId = channelId;
    }

    // Save the quest
    await quest.save();

    // Check for quest completion
    const completionResult = await quest.checkAutoCompletion();
    
    if (completionResult.completed) {
        console.log(`[rpQuestTracking] ✅ Quest ${quest.questID} completed: ${completionResult.reason}`);
        
        // Distribute rewards if quest was completed
        if (completionResult.reason === 'all_participants_completed' || completionResult.reason.includes('participants completed')) {
            const questRewardModule = require('./questRewardModule');
            await questRewardModule.processQuestCompletion(quest.questID);
        }
    } else if (completionResult.reason.includes('participants completed')) {
        console.log(`[rpQuestTracking] 📊 ${completionResult.reason} in quest ${quest.questID}`);
    }

    console.log(`[rpQuestTracking] 📊 Updated RP post count for ${participant.characterName}: ${participant.rpPostCount}/${quest.postRequirement || 15}`);
}

// ------------------- Find Quest by Thread ID -------------------
async function findQuestByThreadId(threadId) {
    try {
        // Primary search: Look for quests where rpThreadParentChannel matches
        const quest = await Quest.findOne({ 
            status: 'active',
            questType: 'RP',
            rpThreadParentChannel: threadId
        });

        if (quest) {
            console.log(`[rpQuestTracking] ✅ Found quest ${quest.questID} by parent channel`);
            return quest;
        }

        // Fallback: Search by participant thread ID
        const fallbackQuest = await findQuestByParticipantThreadId(threadId);
        if (fallbackQuest) {
            console.log(`[rpQuestTracking] ✅ Found quest ${fallbackQuest.questID} by participant thread`);
            return fallbackQuest;
        }

        console.log(`[rpQuestTracking] ❌ No quest found for thread ${threadId}`);
        return null;
    } catch (error) {
        console.error(`[rpQuestTracking] ❌ Error finding quest by thread ID:`, error);
        return null;
    }
}

// ------------------- Find Quest by Participant Thread ID -------------------
async function findQuestByParticipantThreadId(threadId) {
    try {
        const quests = await Quest.find({ 
            status: 'active',
            questType: 'RP'
        });

        for (const quest of quests) {
            if (!quest.participants) continue;
            
            for (const participant of quest.participants.values()) {
                if (participant.rpThreadId === threadId) {
                    return quest;
                }
            }
        }

        return null;
    } catch (error) {
        console.error(`[rpQuestTracking] ❌ Error finding quest by participant thread ID:`, error);
        return null;
    }
}

// ------------------- Validate RP Post with Reason -------------------
function validateRPPostWithReason(message) {
    const content = message.content.trim();
    
    console.log(`[rpQuestTracking] Validating post from ${message.author.id}: "${content}"`);
    
    // Basic content validation
    const basicValidation = validateBasicContent(content);
    if (!basicValidation.valid) return basicValidation;

    // Regex pattern validation
    const regexValidation = validateRegexPatterns(content);
    if (!regexValidation.valid) return regexValidation;

    // Message attachment validation
    const attachmentValidation = validateAttachments(message, content);
    if (!attachmentValidation.valid) return attachmentValidation;

    // Advanced content validation
    const advancedValidation = validateAdvancedContent(content);
    if (!advancedValidation.valid) return advancedValidation;

    console.log(`[rpQuestTracking] ✅ Valid RP post`);
    return { valid: true, reason: null };
}

// ------------------- Basic Content Validation -------------------
function validateBasicContent(content) {
    if (!content || content.length < VALIDATION_RULES.MIN_CONTENT_LENGTH) {
        return { valid: false, reason: `Content too short (${content.length} chars, minimum ${VALIDATION_RULES.MIN_CONTENT_LENGTH})` };
    }

    if (content.length < VALIDATION_RULES.MIN_RP_LENGTH) {
        return { valid: false, reason: `Content too short for RP (${content.length} chars, minimum ${VALIDATION_RULES.MIN_RP_LENGTH})` };
    }

    if (content.includes('))')) {
        return { valid: false, reason: `Content contains "))" (likely a reaction post)` };
    }

    return { valid: true, reason: null };
}

// ------------------- Regex Pattern Validation -------------------
function validateRegexPatterns(content) {
    const validations = [
        { regex: VALIDATION_REGEX.EMOJI, reason: 'Content is only emojis' },
        { regex: VALIDATION_REGEX.CUSTOM_EMOJI, reason: 'Content is only custom emojis' },
        { regex: VALIDATION_REGEX.SYMBOLS, reason: 'Content is only numbers/symbols' },
        { regex: VALIDATION_REGEX.REPEATED_CHARS, reason: 'Content is just repeated characters (spam-like)' },
        { regex: VALIDATION_REGEX.PUNCTUATION, reason: 'Content is only punctuation and spaces' },
        { regex: VALIDATION_REGEX.URL, reason: 'Content is only a URL/link' },
        { regex: VALIDATION_REGEX.MENTION, reason: 'Content is only mentions/pings' },
        { regex: VALIDATION_REGEX.CHANNEL_MENTION, reason: 'Content is only channel mentions' },
        { regex: VALIDATION_REGEX.KEYBOARD_MASH, reason: 'Content appears to be keyboard mashing' }
    ];

    for (const { regex, reason } of validations) {
        if (regex.test(content)) {
            console.log(`[rpQuestTracking] ❌ Rejected - ${reason}`);
            return { valid: false, reason };
        }
    }

    // Check reaction patterns
    for (const pattern of REACTION_PATTERNS) {
        if (pattern.test(content)) {
            console.log(`[rpQuestTracking] ❌ Rejected - Content is just a reaction-style response`);
            return { valid: false, reason: 'Content is just a reaction-style response' };
        }
    }

    return { valid: true, reason: null };
}

// ------------------- Attachment Validation -------------------
function validateAttachments(message, content) {
    if (message.embeds && message.embeds.length > 0) {
        const hasOnlyEmbeds = !content || content.trim().length === 0;
        if (hasOnlyEmbeds) {
            console.log(`[rpQuestTracking] ❌ Rejected - Content is only GIFs/stickers/embeds`);
            return { valid: false, reason: 'Content is only GIFs/stickers/embeds' };
        }
    }

    if (message.stickers && message.stickers.size > 0 && (!content || content.trim().length === 0)) {
        console.log(`[rpQuestTracking] ❌ Rejected - Content is only stickers`);
        return { valid: false, reason: 'Content is only stickers' };
    }

    if (message.attachments && message.attachments.size > 0) {
        const hasOnlyAttachments = !content || content.trim().length < VALIDATION_RULES.MIN_CONTENT_LENGTH;
        if (hasOnlyAttachments) {
            console.log(`[rpQuestTracking] ❌ Rejected - Content is only attachments without meaningful text`);
            return { valid: false, reason: 'Content is only attachments without meaningful text' };
        }
    }

    return { valid: true, reason: null };
}

// ------------------- Advanced Content Validation -------------------
function validateAdvancedContent(content) {
    // Check for repeated single words
    const words = content.split(/\s+/);
    if (words.length > 1) {
        const uniqueWords = new Set(words.map(w => w.toLowerCase()));
        if (uniqueWords.size === 1 && words.length >= VALIDATION_RULES.MIN_UNIQUE_WORDS) {
            console.log(`[rpQuestTracking] ❌ Rejected - Content is just repeated single words`);
            return { valid: false, reason: 'Content is just repeated single words' };
        }
    }

    // Check letter percentage
    const letterCount = (content.match(/[a-zA-Z]/g) || []).length;
    const totalChars = content.replace(/\s/g, '').length;
    if (totalChars > 0 && (letterCount / totalChars) < VALIDATION_RULES.MIN_LETTER_PERCENTAGE) {
        const percentage = Math.round((letterCount / totalChars) * 100);
        console.log(`[rpQuestTracking] ❌ Rejected - Content has too few letters (${percentage}% letters, minimum ${VALIDATION_RULES.MIN_LETTER_PERCENTAGE * 100}%)`);
        return { valid: false, reason: `Content has too few letters (${percentage}% letters, minimum ${VALIDATION_RULES.MIN_LETTER_PERCENTAGE * 100}%)` };
    }

    return { valid: true, reason: null };
}

// ------------------- Validate RP Post (Legacy) -------------------
function isValidRPPost(message) {
    return validateRPPostWithReason(message).valid;
}

// ------------------- Manual RP Post Count Update -------------------
async function updateRPPostCount(questID, userId, newCount) {
    try {
        const quest = await Quest.findOne({ questID });
        if (!quest) {
            throw new Error(`Quest ${questID} not found`);
        }

        const participant = quest.getParticipant(userId);
        if (!participant) {
            throw new Error(`User ${userId} is not a participant in quest ${questID}`);
        }

        const oldCount = participant.rpPostCount;
        participant.rpPostCount = Math.max(0, newCount);
        participant.updatedAt = new Date();

        // Check if participant now meets requirements
        const meetsRequirements = quest.meetsRequirements(participant, quest);
        if (meetsRequirements && participant.progress === 'active') {
            participant.progress = 'completed';
            participant.completedAt = new Date();
        }

        await quest.save();

        console.log(`[rpQuestTracking] 📊 Manually updated RP post count for user ${userId} in quest ${questID}: ${oldCount} → ${newCount}`);

        return {
            success: true,
            oldCount,
            newCount,
            meetsRequirements
        };

    } catch (error) {
        console.error(`[rpQuestTracking] ❌ Error updating RP post count:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ------------------- Get RP Quest Status -------------------
async function getRPQuestStatus(questID) {
    try {
        const quest = await Quest.findOne({ questID });
        if (!quest) {
            throw new Error(`Quest ${questID} not found`);
        }

        if (quest.questType !== 'RP') {
            throw new Error(`Quest ${questID} is not an RP quest`);
        }

        const participants = Array.from(quest.participants.values());
        const status = {
            questID,
            title: quest.title,
            status: quest.status,
            postRequirement: quest.postRequirement || 15,
            participants: participants.map(p => ({
                userId: p.userId,
                characterName: p.characterName,
                rpPostCount: p.rpPostCount || 0,
                progress: p.progress,
                meetsRequirements: quest.meetsRequirements(p, quest),
                rpThreadId: p.rpThreadId
            }))
        };

        console.log(`[rpQuestTracking] 📊 Retrieved status for quest ${questID}`);
        return status;

    } catch (error) {
        console.error(`[rpQuestTracking] ❌ Error getting RP quest status:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================
module.exports = {
    handleRPPostTracking,
    updateRPPostCount,
    getRPQuestStatus,
    validateRPPostWithReason,
    isValidRPPost
};
