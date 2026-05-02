// ============================================================================
// ------------------- rpQuestTrackingModule.js -------------------
// Handles automatic tracking of RP posts in quest threads
// ============================================================================

const { EmbedBuilder } = require('discord.js');
const Quest = require('@/models/QuestModel');
const { handleError } = require('@/utils/globalErrorHandler');
const { QUEST_TYPES, BORDER_IMAGE, extractVillageFromLocation } = require('./questRewardModule');
const Character = require('@/models/CharacterModel');
const questModule = require('../commands/world/quest');
const questRewardModule = require('./questRewardModule');
const logger = require('@/utils/logger');

// Helper function to get Discord client
function getDiscordClient() {
    try {
        const { client } = require('../index.js');
        return client;
    } catch (error) {
        logger.error('QUEST', 'Error getting Discord client');
        return null;
    }
}

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

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

/** True only for obvious one-line "ack" / closer posts — not posts that merely contain "))" somewhere in real RP. */
function isBareReactionOnlyPost(content) {
    const t = content.trim();
    if (!t.length) return false;
    if (/^\)+$/.test(t)) return true;
    if (t.length <= 14 && /^(lol|lmao|haha|ha|heh|mhm|mm|ok|okay|k|yes|no|yep|nope|same|this|oof|rip)[\s.,!?'"]*\)+$/i.test(t)) {
        return true;
    }
    return false;
}

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

const QUEST_SEARCH_TYPES = [QUEST_TYPES.RP, QUEST_TYPES.INTERACTIVE_RP];

const QUEST_SEARCH_CRITERIA = {
    STATUS: 'active',
};

// ============================================================================
// ------------------- Main Tracking Functions -------------------
// ============================================================================

// ------------------- Handle RP Post Tracking -------------------
async function handleRPPostTracking(message) {
    try {
        // Prefer thread-id-based lookup first so renames don't break tracking
        const categoryId = message.channel.parent?.parentId ?? null;
        let quest = await findQuestByThreadId(message.channel.id, { categoryId });
        if (!quest || !isValidRPQuest(quest)) {
            // Fallback: only consider channel as RP quest thread if name matches (avoids logging on every message)
            if (!isRPQuestThread(message.channel)) return;
            logger.info('QUEST', `Tracking post in ${message.channel.name}`);
            logger.info('QUEST', 'No valid RP quest found for thread');
            return;
        }
        logger.info('QUEST', `Tracking post in ${message.channel.name}`);

        const participant = quest.getParticipant(message.author.id);
        if (!participant) {
            logger.info('QUEST', `User not participant in ${quest.questID}`);
            return;
        }

        const validationResult = validateRPPostWithReason(message);
        if (!validationResult.valid) {
            logger.info('QUEST', `Invalid post: ${validationResult.reason}`);
            return;
        }

        const villageCheck = await quest.checkParticipantVillage(participant.userId);
        if (!villageCheck.valid) {
            logger.warn('QUEST', `${participant.characterName} disqualified: ${villageCheck.reason}`);
            quest.disqualifyParticipant(participant.userId, villageCheck.reason);
            await quest.save();
            return;
        }

        await processValidRPPost(quest, participant, message.channel.id, message);

    } catch (error) {
        logger.error('QUEST', 'Error tracking RP post');
        handleError(error, 'rpQuestTrackingModule.js');
    }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Thread and Quest Validation -------------------
function isRPQuestThread(channel) {
    const threadName = channel.name.toLowerCase();
    return threadName.includes('📜') && threadName.includes('rp thread');
}

function isValidRPQuest(quest) {
    return (
        quest &&
        QUEST_SEARCH_TYPES.includes(quest.questType) &&
        quest.status === 'active'
    );
}

// ------------------- Process Valid RP Post -------------------
async function processValidRPPost(quest, participant, channelId, message = null) {
    quest.incrementRPPosts(participant);
    
    if (!participant.rpThreadId) {
        participant.rpThreadId = channelId;
    }

    const meetsRequirements = quest.meetsRequirements(participant, quest);
    const wasNotCompleted = participant.progress !== 'completed';
    const postRequirement = Quest.resolvePostRequirement(quest);
    
    if (meetsRequirements && wasNotCompleted) {
        participant.progress = 'completed';
        participant.completedAt = new Date();
        participant.completionProcessed = false;
        participant.lastCompletionCheck = new Date();
        
        // SAFEGUARD: Record quest completion immediately to ensure quest count is updated
        // even if reward processing doesn't happen immediately
        try {
            await questRewardModule.recordQuestCompletionSafeguard(participant, quest);
        } catch (error) {
            logger.error('QUEST', `Error recording quest completion safeguard: ${error.message}`);
        }
        
        await sendRequirementMetNotification(quest, participant, channelId);
        logger.success('QUEST', `Quest ${quest.questID}: ${participant.characterName} completed requirements`);
    }

    await quest.save();

    if (message?.react) {
        try {
            await message.react('✅');
        } catch (reactErr) {
            logger.warn('QUEST', `Could not add counted reaction: ${reactErr.message}`);
        }
    }

    try {
        const client = getDiscordClient();
        if (client) {
            await questModule.updateQuestEmbed(null, quest, client, 'rpQuestTracking');
        } else {
            logger.warn('QUEST', 'Discord client not available for embed update');
        }
    } catch (error) {
        logger.error('QUEST', 'Error updating quest embed');
    }

    const completionResult = await quest.checkAutoCompletion();
    
    // Time expiry and "all participants done" paths both set needsRewardProcessing. Always run payouts;
    // previously only `all_participants_completed` did, leaving time-expired quests stuck as status
    // `completed` with participants in `completed` but no tokens (sweep only handles `active` quests).
    if (completionResult.completed && completionResult.needsRewardProcessing) {
        logger.success('QUEST', `${quest.questID} completed: ${completionResult.reason}`);
        await questRewardModule.processQuestCompletion(quest.questID);
        const fresh = await Quest.findOne({ questID: quest.questID });
        if (fresh && typeof fresh.markCompletionProcessed === 'function') {
            await fresh.markCompletionProcessed();
        }
    } else if (completionResult.reason && String(completionResult.reason).includes('participants completed')) {
        logger.info('QUEST', `${completionResult.reason} in quest ${quest.questID}`);
    }

    logger.info('QUEST', `Updated RP post count for ${participant.characterName}: ${participant.rpPostCount}/${postRequirement}`);
}

// ============================================================================
// ------------------- Notification Functions -------------------
// ============================================================================

// ------------------- Send Requirement Met Notification -------------------
async function sendRequirementMetNotification(quest, participant, channelId) {
    try {
        const client = getDiscordClient();
        if (!client) {
            console.log(`[rpQuestTrackingModule.js] ❌ Discord client not available for notification`);
            return;
        }

        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            console.log(`[rpQuestTrackingModule.js] ❌ Could not find channel ${channelId} for notification`);
            return;
        }

        const postRequirement = Quest.resolvePostRequirement(quest);
        const postsValue =
            postRequirement === 0
                ? `${participant.rpPostCount} (no minimum)`
                : `${participant.rpPostCount}/${postRequirement}`;
        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🎉 Quest Requirements Met!')
            .setDescription(`**${participant.characterName}** has successfully met the quest requirements!`)
            .addFields(
                { name: 'Posts Completed', value: postsValue, inline: true },
                { name: 'Status', value: '✅ Completed', inline: true },
                { name: 'Quest ID', value: `\`${quest.questID}\``, inline: true }
            )
            .setImage(BORDER_IMAGE)
            .setTimestamp();

        await channel.send({ 
            content: `<@${participant.userId}>`,
            embeds: [embed] 
        });
        console.log(`[rpQuestTrackingModule.js] ✅ Sent requirement met notification for ${participant.characterName} in quest ${quest.questID}`);

    } catch (error) {
        console.error(`[rpQuestTrackingModule.js] ❌ Error sending requirement met notification:`, error);
    }
}

// ============================================================================
// ------------------- Quest Finding Functions -------------------
// ============================================================================

const QUEST_CATEGORY_ID = '717090310911426590';

// ------------------- Find Quest by Thread ID -------------------
async function findQuestByThreadId(threadId, options = {}) {
    try {
        const quest = await Quest.findOne({
            status: 'active',
            questType: { $in: QUEST_SEARCH_TYPES },
            $or: [
                { rpThreadId: threadId },
                { rpThreadIds: threadId },
                { rpThreadParentChannel: threadId }
            ]
        });

        if (quest) {
            logger.info('QUEST', `Found quest ${quest.questID} by RP thread`);
            return quest;
        }

        const fallbackQuest = await findQuestByParticipantThreadId(threadId);
        if (fallbackQuest) {
            logger.info('QUEST', `Found quest ${fallbackQuest.questID} by participant thread`);
            return fallbackQuest;
        }

        if (options.categoryId === QUEST_CATEGORY_ID) {
            logger.info('QUEST', `No quest found for thread ${threadId}`);
        }
        return null;
    } catch (error) {
        logger.error('QUEST', 'Error finding quest by thread ID');
        return null;
    }
}

// ------------------- Find Quest by Participant Thread ID -------------------
async function findQuestByParticipantThreadId(threadId) {
    try {
        const quests = await Quest.find({
            status: 'active',
            questType: { $in: QUEST_SEARCH_TYPES },
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
        console.error(`[rpQuestTrackingModule.js] ❌ Error finding quest by participant thread ID:`, error);
        return null;
    }
}

// ============================================================================
// ------------------- Validation Functions -------------------
// ============================================================================

// ------------------- Validate RP Post with Reason -------------------
function validateRPPostWithReason(message) {
    const content = message.content.trim();
    
    const validations = [
        () => validateBasicContent(content),
        () => validateRegexPatterns(content),
        () => validateAttachments(message, content),
        () => validateAdvancedContent(content)
    ];

    for (const validation of validations) {
        const result = validation();
        if (!result.valid) return result;
    }

    logger.info('QUEST', 'Valid RP post');
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

    if (isBareReactionOnlyPost(content)) {
        return { valid: false, reason: 'Content looks like a short reaction/ack line only' };
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
            return { valid: false, reason };
        }
    }

    for (const pattern of REACTION_PATTERNS) {
        if (pattern.test(content)) {
            return { valid: false, reason: 'Content is just a reaction-style response' };
        }
    }

    return { valid: true, reason: null };
}

// ------------------- Attachment Validation -------------------
function validateAttachments(message, content) {
    const hasOnlyEmbeds = message.embeds?.length > 0 && (!content || content.trim().length === 0);
    if (hasOnlyEmbeds) {
        return { valid: false, reason: 'Content is only GIFs/stickers/embeds' };
    }

    const hasOnlyStickers = message.stickers?.size > 0 && (!content || content.trim().length === 0);
    if (hasOnlyStickers) {
        return { valid: false, reason: 'Content is only stickers' };
    }

    const hasOnlyAttachments = message.attachments?.size > 0 && (!content || content.trim().length < VALIDATION_RULES.MIN_CONTENT_LENGTH);
    if (hasOnlyAttachments) {
        return { valid: false, reason: 'Content is only attachments without meaningful text' };
    }

    return { valid: true, reason: null };
}

// ------------------- Advanced Content Validation -------------------
function validateAdvancedContent(content) {
    const words = content.split(/\s+/);
    if (words.length > 1) {
        const uniqueWords = new Set(words.map(w => w.toLowerCase()));
        if (uniqueWords.size === 1 && words.length >= VALIDATION_RULES.MIN_UNIQUE_WORDS) {
            return { valid: false, reason: 'Content is just repeated single words' };
        }
    }

    const letterCount = (content.match(/\p{L}/gu) || []).length;
    const totalChars = content.replace(/\s/g, '').length;
    if (totalChars > 0 && (letterCount / totalChars) < VALIDATION_RULES.MIN_LETTER_PERCENTAGE) {
        const percentage = Math.round((letterCount / totalChars) * 100);
        return { valid: false, reason: `Content has too few letters (${percentage}% letters, minimum ${VALIDATION_RULES.MIN_LETTER_PERCENTAGE * 100}%)` };
    }

    return { valid: true, reason: null };
}

// ============================================================================
// ------------------- Utility Functions -------------------
// ============================================================================

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

        const meetsRequirements = quest.meetsRequirements(participant, quest);
        if (meetsRequirements && participant.progress === 'active') {
            participant.progress = 'completed';
            participant.completedAt = new Date();
            try {
                await questRewardModule.recordQuestCompletionSafeguard(participant, quest);
            } catch (err) {
                logger.error('QUEST', `Error recording quest completion safeguard after RP post count update: ${err.message}`);
            }
        }

        await quest.save();
        logger.info('QUEST', `Manually updated RP post count for user ${userId} in quest ${questID}: ${oldCount} → ${newCount}`);

        try {
            const client = getDiscordClient();
            if (client) {
                await questModule.updateQuestEmbed(null, quest, client, 'modRppostsAdjust');
            }
        } catch (embedErr) {
            logger.warn('QUEST', `Could not refresh quest embed after manual RP count: ${embedErr.message}`);
        }

        return { success: true, oldCount, newCount, meetsRequirements };

    } catch (error) {
        logger.error('QUEST', 'Error updating RP post count');
        return { success: false, error: error.message };
    }
}

/**
 * Mod fix: set the participant's locked research village (requiredVillage) for RP / Interactive RP quests.
 * Join snapshots currentVillage; this corrects mistaken locks (e.g. signed up during blight shelter elsewhere).
 * Optionally restores disqualified participants to active when clearing a village violation.
 */
async function setParticipantResearchVillage(questID, userId, villageKey, options = {}) {
    const { restoreFromDisqualification = true } = options;
    try {
        const quest = await Quest.findOne({ questID });
        if (!quest) {
            throw new Error(`Quest ${questID} not found`);
        }

        if (quest.questType !== QUEST_TYPES.RP && quest.questType !== QUEST_TYPES.INTERACTIVE_RP) {
            throw new Error('This command only applies to RP and Interactive / RP quests');
        }

        const participant = quest.getParticipant(userId);
        if (!participant) {
            throw new Error(`User is not a participant in quest ${questID}`);
        }

        if (participant.progress !== 'active' && participant.progress !== 'disqualified') {
            throw new Error(
                'Participant progress must be active or disqualified. Use the admin dashboard for completed, rewarded, or failed rows.'
            );
        }

        const allowed = extractVillageFromLocation(quest.location);
        if (!allowed || allowed.length === 0) {
            throw new Error('Could not determine allowed villages from this quest’s location field');
        }

        const normalized = String(villageKey || '').trim().toLowerCase();
        if (!normalized || !allowed.includes(normalized)) {
            const list = allowed.map((v) => v.charAt(0).toUpperCase() + v.slice(1)).join(', ');
            throw new Error(`Village must be one of this quest’s research locations: ${list}`);
        }

        const character = await Character.findOne({
            name: participant.characterName,
            userId: participant.userId
        });
        if (!character) {
            throw new Error(`Character **${participant.characterName}** not found for this user`);
        }

        const charVillage = String(character.currentVillage || '').trim().toLowerCase();
        if (charVillage !== normalized) {
            const pretty = normalized.charAt(0).toUpperCase() + normalized.slice(1);
            throw new Error(
                `**${character.name}** must be in **${pretty}** on their sheet (current: **${character.currentVillage || 'unknown'}**). Use \`/travel\` first, then run this again.`
            );
        }

        const previousRequired = participant.requiredVillage || null;
        participant.requiredVillage = normalized;
        participant.updatedAt = new Date();

        let restored = false;
        if (participant.progress === 'disqualified' && restoreFromDisqualification) {
            participant.progress = 'active';
            participant.disqualifiedAt = null;
            participant.disqualificationReason = null;
            restored = true;
        }

        await quest.save();
        logger.info(
            'QUEST',
            `Research village set for ${participant.characterName} in ${questID}: ${previousRequired} → ${normalized}` +
                (restored ? ' (restored from disqualified)' : '')
        );

        try {
            const client = getDiscordClient();
            if (client) {
                await questModule.updateQuestEmbed(null, quest, client, 'modAction');
            }
        } catch (embedErr) {
            logger.warn('QUEST', `Could not refresh quest embed after research village fix: ${embedErr.message}`);
        }

        return {
            success: true,
            characterName: participant.characterName,
            previousRequired,
            newRequired: normalized,
            restored
        };
    } catch (error) {
        logger.error('QUEST', `setParticipantResearchVillage: ${error.message}`);
        return { success: false, error: error.message };
    }
}

// ------------------- Get RP Quest Status -------------------
async function getRPQuestStatus(questID) {
    try {
        const quest = await Quest.findOne({ questID });
        if (!quest) {
            throw new Error(`Quest ${questID} not found`);
        }

        const isTrackedType =
            quest.questType === QUEST_TYPES.RP || quest.questType === QUEST_TYPES.INTERACTIVE_RP;
        if (!isTrackedType) {
            throw new Error(`Quest ${questID} is not an RP or Interactive / RP quest`);
        }

        const participants = Array.from(quest.participants.values());
        const status = {
            questID,
            title: quest.title,
            status: quest.status,
            postRequirement: Quest.resolvePostRequirement(quest),
            participants: participants.map(p => ({
                userId: p.userId,
                characterName: p.characterName,
                rpPostCount: p.rpPostCount || 0,
                progress: p.progress,
                meetsRequirements: quest.meetsRequirements(p, quest),
                rpThreadId: p.rpThreadId
            }))
        };

        logger.info('QUEST', `Retrieved status for quest ${questID}`);
        return status;

    } catch (error) {
        logger.error('QUEST', 'Error getting RP quest status');
        return { success: false, error: error.message };
    }
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================
module.exports = {
    handleRPPostTracking,
    updateRPPostCount,
    setParticipantResearchVillage,
    getRPQuestStatus,
    validateRPPostWithReason,
    isValidRPPost
};
