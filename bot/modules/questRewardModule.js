// ============================================================================
// ------------------- questRewardModule.js -------------------
// Handles automatic quest reward distribution and completion processing
// ============================================================================

const Quest = require('../models/QuestModel');
const { meetsRequirements, DEFAULT_POST_REQUIREMENT, DEFAULT_ROLL_REQUIREMENT } = Quest;
const Character = require('../models/CharacterModel');
const User = require('../models/UserModel');
const ApprovedSubmission = require('../models/ApprovedSubmissionModel');
const { handleError } = require('../utils/globalErrorHandler');
const logger = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================
const BORDER_IMAGE = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
const QUEST_CHANNEL_ID = process.env.QUESTS_BOARD || '706880599863853097';
const RP_SIGNUP_WINDOW_DAYS = 7;
const ENTERTAINER_BONUS_AMOUNT = 100;
const QUEST_COLORS = {
    SUCCESS: 0x00FF00,
    EXPIRED: 0xFFA500,
    ERROR: 0xff0000,
    INFO: 0x0099ff
};

// Quest Type Constants
const QUEST_TYPES = {
    ART: 'Art',
    WRITING: 'Writing',
    INTERACTIVE: 'Interactive',
    RP: 'RP',
    ART_WRITING: 'Art / Writing'
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
    REWARDED: 'rewarded',
    DISQUALIFIED: 'disqualified'
};

// ============================================================================
// ------------------- Notification Functions -------------------
// ============================================================================

// ------------------- Send Individual Reward Notification -------------------
async function sendIndividualRewardNotification(quest, participant, rewardResult) {
    try {
        console.log(`[questRewardModule] 🎉 Sending reward notification for ${participant.characterName} in quest ${quest.questID}`);
        
        // Get the Discord client
        const { client } = require('../index.js');
        if (!client) {
            console.log(`[questRewardModule] ❌ Discord client not available for notification`);
            return { success: false, error: 'Discord client not available' };
        }

        // Always send to Sheikah Slate channel only
        const SHEIKAH_SLATE_CHANNEL_ID = '641858948802150400';
        const channel = await client.channels.fetch(SHEIKAH_SLATE_CHANNEL_ID);
        if (!channel) {
            console.log(`[questRewardModule] ❌ Could not find Sheikah Slate channel ${SHEIKAH_SLATE_CHANNEL_ID} for notification`);
            return { success: false, error: 'Sheikah Slate channel not found' };
        }

        // Create reward notification embed
        const rewardEmbed = createBaseEmbed(
            '🎉 Quest Reward Received!',
            `**${participant.characterName}** has received their rewards for completing **${quest.title}**!`,
            QUEST_COLORS.SUCCESS
        );

        const rewardFields = [];
        const tokenBreakdown = rewardResult.tokenBreakdown || {};
        
        if (rewardResult.tokensAdded > 0) {
            rewardFields.push({
                name: '💰 Tokens',
                value: `${rewardResult.tokensAdded} tokens${tokenBreakdown.entertainerBonus ? ' (Entertainer bonus applied)' : ''}`,
                inline: true
            });
        }
        
        if (tokenBreakdown.entertainerBonus) {
            rewardFields.push({
                name: '🎭 Entertainer Bonus',
                value: `+${tokenBreakdown.entertainerBonus} tokens`,
                inline: true
            });
        }
        
        // Display item rewards (prefer itemRewards array, fallback to single item format)
        if (quest.itemRewards && quest.itemRewards.length > 0) {
            const itemRewardsText = quest.itemRewards.map(item => 
                `${item.quantity}x ${item.name}`
            ).join(', ');
            rewardFields.push({
                name: quest.itemRewards.length > 1 ? '📦 Item Rewards' : '📦 Item Reward',
                value: itemRewardsText,
                inline: true
            });
        } else if (quest.itemReward && quest.itemRewardQty > 0) {
            rewardFields.push({
                name: '📦 Item Reward',
                value: `${quest.itemRewardQty}x ${quest.itemReward}`,
                inline: true
            });
        }

        if (rewardFields.length > 0) {
            rewardEmbed.addFields(rewardFields);
        }

        addQuestInfoFields(rewardEmbed, quest, []);

        await channel.send({ 
            content: `<@${participant.userId}>`,
            embeds: [rewardEmbed] 
        });

        console.log(`[questRewardModule] ✅ Sent reward notification for ${participant.characterName} in quest ${quest.questID}`);
        return { success: true };

    } catch (error) {
        console.error(`[questRewardModule] ❌ Error sending reward notification:`, error);
        return { success: false, error: error.message };
    }
}

// ------------------- Send Quest Completion Notification -------------------
async function sendQuestCompletionNotification(quest, participant, channelId = null) {
    try {
        console.log(`[questRewardModule] 🎉 Sending completion notification for ${participant.characterName} in quest ${quest.questID}`);
        
        // Get the Discord client
        const { client } = require('../index.js');
        if (!client) {
            console.log(`[questRewardModule] ❌ Discord client not available for notification`);
            return { success: false, error: 'Discord client not available' };
        }

        // Determine the channel to send the notification to
        let targetChannelId = channelId;
        if (!targetChannelId) {
            targetChannelId = await getQuestNotificationChannel(quest, participant);
        }

        if (!targetChannelId) {
            console.log(`[questRewardModule] ❌ No suitable channel found for quest notification`);
            return { success: false, error: 'No suitable channel found' };
        }

        const channel = await client.channels.fetch(targetChannelId);
        if (!channel) {
            console.log(`[questRewardModule] ❌ Could not find channel ${targetChannelId} for notification`);
            return { success: false, error: 'Channel not found' };
        }

        // Create appropriate notification based on quest type
        const notificationEmbed = await createCompletionNotificationEmbed(quest, participant);
        
        if (!notificationEmbed) {
            console.log(`[questRewardModule] ❌ Failed to create notification embed`);
            return { success: false, error: 'Failed to create notification embed' };
        }

        await channel.send({ 
            content: `<@${participant.userId}>`,
            embeds: [notificationEmbed] 
        });

        console.log(`[questRewardModule] ✅ Sent completion notification for ${participant.characterName} in quest ${quest.questID}`);
        return { success: true };

    } catch (error) {
        console.error(`[questRewardModule] ❌ Error sending quest completion notification:`, error);
        return { success: false, error: error.message };
    }
}

// ------------------- Get Quest Notification Channel -------------------
async function getQuestNotificationChannel(quest, participant) {
    try {
        const SHEIKAH_SLATE_CHANNEL_ID = '641858948802150400';

        // For RP quests, use the RP thread if available
        if (quest.questType.toLowerCase() === 'rp' && participant.rpThreadId) {
            return participant.rpThreadId;
        }

        // Art, Writing, and Art/Writing quest completion notifications always go to Sheikah Slate
        const questType = (quest.questType || '').toLowerCase();
        if (questType === 'art' || questType === 'writing' || questType === 'art / writing' || questType === 'art/writing') {
            return SHEIKAH_SLATE_CHANNEL_ID;
        }

        // For other quest types, use the quest channel if specified
        if (quest.targetChannel) {
            return quest.targetChannel;
        }

        // Fallback to Sheikah Slate channel for quest completion notifications
        // (Quest Board channel is used for quest announcements, not completions)
        return SHEIKAH_SLATE_CHANNEL_ID;

    } catch (error) {
        console.error(`[questRewardModule] ❌ Error getting notification channel:`, error);
        return null;
    }
}

// ------------------- Create Completion Notification Embed -------------------
async function createCompletionNotificationEmbed(quest, participant) {
    try {
        const handler = QUEST_TYPE_HANDLERS[quest.questType];
        
        let title, description, progressField;
        
        if (handler) {
            title = handler.getTitle();
            description = handler.getDescription(participant.characterName);
            progressField = handler.getProgressField(participant, quest);
        } else {
            // Default fallback
            title = '🎉 Quest Completed!';
            description = `**${participant.characterName}** has successfully completed the quest!`;
            progressField = {
                name: 'Status',
                value: '✅ Completed',
                inline: true
            };
        }

        const embed = createBaseEmbed(title, description);
        
        // Add progress field if available
        const additionalFields = [];
        if (progressField) {
            additionalFields.push(progressField);
        }
        additionalFields.push({ name: 'Status', value: '✅ Completed', inline: true });
        
        addQuestInfoFields(embed, quest, additionalFields);

        // Add quest-specific information
        if (quest.tableRollName && quest.questType === 'Interactive') {
            embed.addFields({
                name: 'Table Roll',
                value: quest.tableRollName,
                inline: true
            });
        }

        if (quest.requiredVillage && quest.questType === 'RP') {
            embed.addFields({
                name: 'Quest Village',
                value: quest.requiredVillage.charAt(0).toUpperCase() + quest.requiredVillage.slice(1),
                inline: true
            });
        }

        return embed;

    } catch (error) {
        console.error(`[questRewardModule] ❌ Error creating completion notification embed:`, error);
        return null;
    }
}

// ------------------- Send Quest Completion Summary -------------------
async function sendQuestCompletionSummary(quest, completionReason) {
    try {
        console.log(`[questRewardModule] 📊 Sending quest completion summary for ${quest.questID}`);

        const { client } = require('../index.js');
        if (!client) {
            console.log(`[questRewardModule] ❌ Discord client not available for summary notification`);
            return { success: false, error: 'Discord client not available' };
        }

        const participants = Array.from(quest.participants.values());
        const completedParticipants = participants.filter(p => p.progress === 'completed' || p.progress === 'rewarded');
        const rewardedParticipants = participants.filter(p => p.progress === 'rewarded');

        let summaryTitle = '🏁 Quest Completed!';
        let summaryDescription = `The quest **${quest.title}** has been completed!`;
        
        if (completionReason === 'time_expired') {
            summaryTitle = '⏰ Quest Time Expired!';
            summaryDescription = `The quest **${quest.title}** has ended due to time expiration.`;
        }

        // Build list of completed participants
        const completedList = completedParticipants
            .map(p => `• ${p.characterName}${p.progress === 'rewarded' ? ' ✅' : ''}`)
            .join('\n') || 'None';

        const embed = createBaseEmbed(
            summaryTitle, 
            summaryDescription, 
            completionReason === 'time_expired' ? QUEST_COLORS.EXPIRED : QUEST_COLORS.SUCCESS
        );
        
        const additionalFields = [
            { name: 'Total Participants', value: participants.length.toString(), inline: true },
            { name: 'Completed', value: completedParticipants.length.toString(), inline: true },
            { name: 'Rewarded', value: rewardedParticipants.length.toString(), inline: true },
            { name: 'Completion Reason', value: completionReason.replace('_', ' ').toUpperCase(), inline: true }
        ];
        
        // Add completed participants list if not too long
        if (completedParticipants.length > 0 && completedParticipants.length <= 20) {
            additionalFields.push({
                name: 'Completed Participants',
                value: completedList.length > 1024 ? completedList.substring(0, 1020) + '...' : completedList,
                inline: false
            });
        }
        
        addQuestInfoFields(embed, quest, additionalFields);

        // Always send to Sheikah Slate channel only
        const SHEIKAH_SLATE_CHANNEL_ID = '641858948802150400';
        
        try {
            const sheikahSlateChannel = await client.channels.fetch(SHEIKAH_SLATE_CHANNEL_ID);
            if (sheikahSlateChannel) {
                await sheikahSlateChannel.send({ embeds: [embed] });
                console.log(`[questRewardModule] ✅ Sent quest completion summary to Sheikah Slate channel`);
                return { success: true };
            } else {
                console.log(`[questRewardModule] ⚠️ Could not fetch Sheikah Slate channel`);
                return { success: false, error: 'Sheikah Slate channel not found' };
            }
        } catch (error) {
            console.error(`[questRewardModule] ❌ Error sending to Sheikah Slate channel:`, error);
            return { success: false, error: error.message };
        }

    } catch (error) {
        console.error(`[questRewardModule] ❌ Error sending quest completion summary:`, error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Standardized Error Handling ------------------
function handleQuestError(error, context, questId = null) {
    const questInfo = questId ? ` for quest ${questId}` : '';
    logger.error('QUEST', `Error ${context}${questInfo}: ${error.message}`, error);
    return {
        success: false,
        error: error.message || 'Unknown error occurred'
    };
}

// ------------------- Standardized Success Response ------------------
function createSuccessResponse(data = {}) {
    return {
        success: true,
        ...data
    };
}

// ------------------- Database Helper Functions ------------------
async function findQuestSafely(questId) {
    try {
        const quest = await Quest.findOne({ questID: questId });
        if (!quest) {
            throw new Error(`Quest not found: ${questId}`);
        }
        return quest;
    } catch (error) {
        logger.error('QUEST', `Database error finding quest ${questId}: ${error.message}`, error);
        throw error;
    }
}

async function findUserSafely(userId) {
    try {
        const user = await User.findOne({ discordId: userId });
        if (!user) {
            throw new Error(`User not found: ${userId}`);
        }
        return user;
    } catch (error) {
        logger.error('QUEST', `Database error finding user ${userId}: ${error.message}`, error);
        throw error;
    }
}

async function findCharacterSafely(characterName, userId) {
    try {
        const character = await Character.findOne({ 
            name: characterName, 
            userId: userId 
        });
        if (!character) {
            throw new Error(`Character not found: ${characterName}`);
        }
        return character;
    } catch (error) {
        logger.error('QUEST', `Database error finding character ${characterName}: ${error.message}`, error);
        throw error;
    }
}

// ------------------- Embed Creation Helpers ------------------
function createBaseEmbed(title, description, color = QUEST_COLORS.SUCCESS) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setImage(BORDER_IMAGE)
        .setTimestamp();
}

function addQuestInfoFields(embed, quest, additionalFields = []) {
    const fields = [
        { name: 'Quest ID', value: `\`${quest.questID}\``, inline: true },
        { name: 'Quest Type', value: quest.questType, inline: true },
        ...additionalFields
    ];
    
    embed.addFields(fields);
    return embed;
}

// ------------------- Quest Type Specific Logic ------------------
const QUEST_TYPE_HANDLERS = {
    [QUEST_TYPES.RP]: {
        checkRequirements: (participant, quest) => 
            participant.rpPostCount >= (quest.postRequirement || DEFAULT_POST_REQUIREMENT),
        getProgressField: (participant, quest) => ({
            name: 'Posts Completed',
            value: `${participant.rpPostCount}/${quest.postRequirement || DEFAULT_POST_REQUIREMENT}`,
            inline: true
        }),
        getTitle: () => '🎭 RP Quest Completed!',
        getDescription: (characterName) => `**${characterName}** has successfully completed the RP quest!`
    },
    [QUEST_TYPES.ART]: {
        checkRequirements: (participant) => 
            participant.submissions.some(sub => sub.type === SUBMISSION_TYPES.ART && sub.approved),
        getProgressField: () => ({
            name: 'Art Submission',
            value: '✅ Approved',
            inline: true
        }),
        getTitle: () => '🎨 Art Quest Completed!',
        getDescription: (characterName) => `**${characterName}** has successfully submitted their art for the quest!`
    },
    [QUEST_TYPES.WRITING]: {
        checkRequirements: (participant) => 
            participant.submissions.some(sub => sub.type === SUBMISSION_TYPES.WRITING && sub.approved),
        getProgressField: () => ({
            name: 'Writing Submission',
            value: '✅ Approved',
            inline: true
        }),
        getTitle: () => '✍️ Writing Quest Completed!',
        getDescription: (characterName) => `**${characterName}** has successfully submitted their writing for the quest!`
    },
    [QUEST_TYPES.ART_WRITING]: {
        checkRequirements: (participant, quest) => {
            const artWritingMode = (quest?.artWritingMode || 'both').toLowerCase();
            const hasArt = participant.submissions.some(sub => sub.type === SUBMISSION_TYPES.ART && sub.approved);
            const hasWriting = participant.submissions.some(sub => sub.type === SUBMISSION_TYPES.WRITING && sub.approved);
            if (artWritingMode === 'either') return hasArt || hasWriting;
            return hasArt && hasWriting;
        },
        getProgressField: (participant, quest) => {
            const artCount = participant.submissions.filter(sub => sub.type === SUBMISSION_TYPES.ART && sub.approved).length;
            const writingCount = participant.submissions.filter(sub => sub.type === SUBMISSION_TYPES.WRITING && sub.approved).length;
            const mode = (quest?.artWritingMode || 'both').toLowerCase();
            const value = mode === 'either'
                ? `🎨 ${artCount} art, ✍️ ${writingCount} writing (either counts)`
                : `🎨 ${artCount} art, ✍️ ${writingCount} writing`;
            return { name: 'Submissions', value, inline: true };
        },
        getTitle: () => '🎨✍️ Art & Writing Quest Completed!',
        getDescription: (characterName) => `**${characterName}** has successfully submitted for the quest!`
    },
    [QUEST_TYPES.INTERACTIVE]: {
        checkRequirements: () => true, // Interactive quests have different completion logic
        getProgressField: (participant, quest) => ({
            name: 'Successful Rolls',
            value: `${participant.successfulRolls}/${quest.requiredRolls || DEFAULT_ROLL_REQUIREMENT}`,
            inline: true
        }),
        getTitle: () => '🎮 Interactive Quest Completed!',
        getDescription: (characterName) => `**${characterName}** has successfully completed the interactive quest!`
    }
};

// ------------------- Sync Approved Submissions to Participant ------------------
// Safeguard function to ensure approved submissions are synced to participant records
async function syncApprovedSubmissionsToParticipant(quest, participant) {
    try {
        // Only check for Art and Writing quests
        if (quest.questType !== QUEST_TYPES.ART && 
            quest.questType !== QUEST_TYPES.WRITING && 
            quest.questType !== QUEST_TYPES.ART_WRITING) {
            return { synced: false, reason: 'Not an Art/Writing quest' };
        }
        
        // Find approved submissions for this user and quest
        const approvedSubmissions = await ApprovedSubmission.find({
            questEvent: quest.questID,
            userId: participant.userId,
            approvedAt: { $exists: true, $ne: null }
        });
        
        if (approvedSubmissions.length === 0) {
            return { synced: false, reason: 'No approved submissions found' };
        }
        
        let syncedCount = 0;
        const questType = quest.questType.toLowerCase();
        
        for (const submission of approvedSubmissions) {
            const submissionType = submission.category.toLowerCase();
            
            // Check if submission type matches quest requirements
            let shouldSync = false;
            if (questType === 'art' && submissionType === 'art') {
                shouldSync = true;
            } else if (questType === 'writing' && submissionType === 'writing') {
                shouldSync = true;
            } else if (questType === 'art / writing' || questType === 'art/writing') {
                shouldSync = true; // Sync both art and writing for combined quests
            }
            
            if (!shouldSync) continue;
            
            // Check if submission already exists in participant record
            const submissionExists = participant.submissions?.some(sub => 
                (sub.url === submission.messageUrl || sub.url === submission.fileUrl) ||
                (sub.type === submission.category && sub.approved && sub.approvedAt && 
                 Math.abs(new Date(sub.approvedAt).getTime() - new Date(submission.approvedAt).getTime()) < 60000)
            );
            
            if (!submissionExists) {
                // Add submission to participant record
                if (!participant.submissions) {
                    participant.submissions = [];
                }
                
                participant.submissions.push({
                    type: submission.category,
                    url: submission.messageUrl || submission.fileUrl,
                    submittedAt: submission.submittedAt || submission.approvedAt,
                    approved: true,
                    approvedBy: submission.approvedBy,
                    approvedAt: submission.approvedAt
                });
                
                syncedCount++;
                console.log(`[questRewardModule.js] 🔄 Synced approved ${submission.category} submission to participant ${participant.characterName} for quest ${quest.questID}`);
            }
        }
        
        // If we synced submissions and participant is still active, check if they should be marked as completed
        if (syncedCount > 0 && participant.progress === 'active') {
            const meetsReq = meetsRequirements(participant, quest);
            if (meetsReq) {
                participant.progress = 'completed';
                participant.completedAt = participant.submissions
                    .filter(sub => sub.approved && sub.approvedAt)
                    .map(sub => new Date(sub.approvedAt))
                    .sort((a, b) => b - a)[0] || new Date();
                participant.updatedAt = new Date();
                
                // SAFEGUARD: Record quest completion immediately to ensure quest count is updated
                try {
                    await recordQuestCompletionSafeguard(participant, quest);
                } catch (error) {
                    console.error(`[questRewardModule] ❌ Error recording quest completion safeguard after syncing submissions:`, error);
                }
                
                console.log(`[questRewardModule] ✅ Marked participant ${participant.characterName} as completed after syncing approved submissions for quest ${quest.questID}`);
            }
        }
        
        return { synced: syncedCount > 0, syncedCount };
        
    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error syncing approved submissions for participant ${participant.characterName}:`, error);
        return { synced: false, error: error.message };
    }
}

// ------------------- Token Reward Parsing ------------------
// Format: flat:N, per_unit:N, unit:submission|unit:"phrase", max:N, collab_bonus:N
function parseTokenReward(tokenReward) {
    const result = { flat: 0, perUnit: 0, unit: null, max: null, collabBonus: 0 };
    if (tokenReward == null) return result;
    const raw = typeof tokenReward === 'number' ? String(tokenReward) : String(tokenReward);
    const flatMatch = raw.match(/flat:(\d+)/i);
    if (flatMatch) result.flat = Math.max(0, parseInt(flatMatch[1], 10));
    const perUnitMatch = raw.match(/per_unit:(\d+)/i);
    if (perUnitMatch) result.perUnit = Math.max(0, parseInt(perUnitMatch[1], 10));
    const unitQuotedMatch = raw.match(/\bunit:"((?:[^"\\]|\\.)*)"/i);
    const unitUnquotedMatch = !unitQuotedMatch ? raw.match(/\bunit:(\S+)/i) : null;
    result.unit = unitQuotedMatch ? unitQuotedMatch[1].replace(/\\"/g, '"') : (unitUnquotedMatch ? unitUnquotedMatch[1] : null);
    const maxMatch = raw.match(/max:(\d+)/i);
    if (maxMatch) result.max = Math.max(0, parseInt(maxMatch[1], 10));
    const collabMatch = raw.match(/collab_bonus:(\d+)/i);
    if (collabMatch) result.collabBonus = Math.max(0, parseInt(collabMatch[1], 10));
    return result;
}

// Count participant "units" for per_unit token calculation. unit:submission = count approved submissions (by quest type); cap by max.
function computeParticipantUnits(quest, participant) {
    const parsed = parseTokenReward(quest.tokenReward);
    if (!parsed.perUnit || !parsed.unit) return 0;
    const unitKind = (parsed.unit || '').toLowerCase().trim();
    let count = 0;
    const subs = participant.submissions || [];
    if (unitKind === 'submission') {
        const questType = (quest.questType || '').toLowerCase();
        if (questType === 'art') {
            count = subs.filter(sub => sub.type === SUBMISSION_TYPES.ART && sub.approved).length;
        } else if (questType === 'writing') {
            count = subs.filter(sub => sub.type === SUBMISSION_TYPES.WRITING && sub.approved).length;
        } else if (questType === 'art / writing' || questType === 'art/writing') {
            count = subs.filter(sub => (sub.type === SUBMISSION_TYPES.ART || sub.type === SUBMISSION_TYPES.WRITING) && sub.approved).length;
        } else {
            count = subs.filter(sub => sub.approved).length;
        }
    } else {
        count = subs.filter(sub => sub.approved).length;
    }
    const cap = parsed.max != null && parsed.max > 0 ? parsed.max : Infinity;
    return Math.min(count, cap);
}

// Token amount for one participant (flat + per_unit * min(units, max)). Uses parser; fallback to getNormalizedTokenReward for flat-only.
function computeTokensForParticipant(quest, participant) {
    try {
        const parsed = parseTokenReward(quest.tokenReward);
        let base = parsed.flat || 0;
        if (parsed.perUnit > 0) {
            const units = computeParticipantUnits(quest, participant);
            const cap = parsed.max != null && parsed.max > 0 ? parsed.max : Infinity;
            base += parsed.perUnit * Math.min(units, cap);
            if (participant && typeof participant === 'object') participant.units = units;
        }
        if (base > 0) return base;
        return quest.getNormalizedTokenReward ? quest.getNormalizedTokenReward() : 0;
    } catch (err) {
        logger.error('QUEST', `computeTokensForParticipant error: ${err.message}`, err);
        return quest.getNormalizedTokenReward ? quest.getNormalizedTokenReward() : 0;
    }
}

// ------------------- Token Calculation (legacy: quest-only, no participant) ------------------
function computeTokens(quest) {
    return quest.getNormalizedTokenReward();
}

// ------------------- Entertainer Bonus Helpers ------------------
function normalizeJobName(job) {
    return typeof job === 'string' ? job.trim().toLowerCase() : '';
}

/**
 * Gets the effective job for a character, using jobVoucherJob if a voucher is active, otherwise the regular job.
 */
function getEffectiveJob(character) {
    return (character.jobVoucher && character.jobVoucherJob) ? character.jobVoucherJob : character.job;
}

async function buildQuestRewardContext(quest, participants = []) {
    const context = {};
    context.entertainerBonus = await detectEntertainerBonus(participants);

    if (context.entertainerBonus.enabled) {
        const entertainerNames = context.entertainerBonus.entertainers
            .map(performer => performer.characterName)
            .join(', ');
        const questIdentifier = quest?.questID || quest?.title || 'unknown quest';
        console.log(`[questRewardModule.js] 🎭 Entertainer bonus active for ${questIdentifier}: +${context.entertainerBonus.amountPerParticipant} tokens per participant (Entertainer(s): ${entertainerNames})`);
    }

    return context;
}

async function detectEntertainerBonus(participants = []) {
    if (!participants.length) {
        return {
            enabled: false,
            amountPerParticipant: 0,
            entertainers: [],
            inspectedParticipants: 0
        };
    }

    const eligibleParticipants = participants.filter(participant => {
        if (!participant) return false;
        const progress = participant.progress || 'active';
        return progress !== 'failed' && progress !== 'disqualified';
    });

    if (!eligibleParticipants.length) {
        return {
            enabled: false,
            amountPerParticipant: 0,
            entertainers: [],
            inspectedParticipants: participants.length
        };
    }

    const lookupPromises = eligibleParticipants.map(participant =>
        Character.findOne({ userId: participant.userId, name: participant.characterName }).lean()
    );

    const lookupResults = await Promise.allSettled(lookupPromises);

    const entertainers = [];

    lookupResults.forEach((result, index) => {
        const participant = eligibleParticipants[index];

        if (result.status === 'fulfilled') {
            const character = result.value;

            if (!character) {
                console.log(`[questRewardModule.js] ⚠️ Character record not found for ${participant.characterName} (${participant.userId}) while checking Entertainer bonus`);
                return;
            }

            const effectiveJob = getEffectiveJob(character);
            const jobName = normalizeJobName(effectiveJob);
            if (jobName === 'entertainer') {
                entertainers.push({
                    userId: participant.userId,
                    characterName: participant.characterName
                });
                console.log(`[questRewardModule.js] 🎭 Detected Entertainer: ${participant.characterName} (job: ${character.job}, effectiveJob: ${effectiveJob}, jobVoucher: ${character.jobVoucher || false})`);
            }
        } else {
            console.error(`[questRewardModule.js] ❌ Error fetching character for Entertainer bonus check (${participant?.characterName || 'Unknown'}):`, result.reason);
        }
    });

    if (!entertainers.length) {
        return {
            enabled: false,
            amountPerParticipant: 0,
            entertainers,
            inspectedParticipants: eligibleParticipants.length
        };
    }

    return {
        enabled: true,
        amountPerParticipant: ENTERTAINER_BONUS_AMOUNT,
        entertainers,
        inspectedParticipants: eligibleParticipants.length
    };
}

// ------------------- Group Members Retrieval ------------------
async function getGroupMembers(questId, groupId) {
    try {
        const quest = await findQuestSafely(questId);
        if (!quest.participants) return [];
        
        return Array.from(quest.participants.values()).filter(p => p.group === groupId);
    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error getting group members for quest ${questId}, group ${groupId}:`, error);
        return [];
    }
}

// ============================================================================
// ------------------- Quest Processing Functions -------------------
// ============================================================================

// ------------------- Quest Completion Processing ------------------
async function processQuestCompletion(questId) {
    try {
        logger.info('QUEST', `processQuestCompletion: starting questId=${questId}`);
        const quest = await findQuestSafely(questId);

        // Accept both 'active' and 'completed' status for reward processing
        // (quests may be marked as completed before rewards are distributed)
        if (quest.status !== 'active' && quest.status !== 'completed') {
            logger.info('QUEST', `processQuestCompletion: quest ${questId} status=${quest.status}, skipping`);
            return;
        }

        if (!quest.participants || quest.participants.size === 0) {
            console.log(`[questRewardModule.js] ⚠️ No participants found for quest ${questId}`);
            return;
        }

        const participants = Array.from(quest.participants.values());
        
        // SAFEGUARD: Sync approved submissions for all participants before processing
        // This ensures participants with approved submissions are properly tracked
        if (quest.questType === QUEST_TYPES.ART || 
            quest.questType === QUEST_TYPES.WRITING || 
            quest.questType === QUEST_TYPES.ART_WRITING) {
            for (const participant of participants) {
                try {
                    await syncApprovedSubmissionsToParticipant(quest, participant);
                } catch (error) {
                    console.error(`[questRewardModule.js] ⚠️ Error syncing submissions for ${participant.characterName}:`, error);
                }
            }
            await quest.save(); // Save after syncing all participants
        }
        
        const results = await processAllParticipants(quest, participants);

        if (results.rewardedCount > 0 && results.rewardedCount === participants.length) {
            await markQuestAsCompleted(quest);
            console.log(`[questRewardModule.js] ✅ Quest ${questId} marked as completed. All participants rewarded.`);
        }

        await quest.save();
        logger.info('QUEST', `processQuestCompletion: finished questId=${questId} completed=${results.completedCount} rewarded=${results.rewardedCount} errors=${results.errorCount}`);

        // Send completion summary after rewards are processed
        // Use the quest's completion reason or default to time_expired
        const completionReason = quest.completionReason || 'time_expired';
        await sendQuestCompletionSummary(quest, completionReason);

    } catch (error) {
        handleError(error, 'questRewardModule.js');
        console.error(`[questRewardModule.js] ❌ Error processing quest completion for ${questId}:`, error);
    }
}

// ------------------- Process All Participants ------------------
async function processAllParticipants(quest, participants) {
    let completedCount = 0;
    let rewardedCount = 0;
    let errorCount = 0;

    const rewardContext = await buildQuestRewardContext(quest, participants);

    for (const participant of participants) {
        try {
            const result = await processParticipantReward(quest, participant, rewardContext);
            if (result === 'rewarded') {
                rewardedCount++;
            } else if (result === 'completed') {
                completedCount++;
            } else {
                errorCount++;
            }
        } catch (error) {
            console.error(`[questRewardModule.js] ❌ Error processing participant ${participant.characterName}:`, error);
            errorCount++;
        }
    }

    return { completedCount, rewardedCount, errorCount };
}

// ------------------- Process Individual Participant Reward ------------------
async function processParticipantReward(quest, participant, rewardContext = {}) {
    try {
        // Use unified reward status checking
        const rewardStatus = getParticipantRewardStatus(participant);
        
        if (rewardStatus === 'already_rewarded') {
            console.log(`[questRewardModule.js] ℹ️ Participant ${participant.characterName} already rewarded`);
            return 'already_rewarded';
        }

        if (!meetsRequirements(participant, quest)) {
            console.log(`[questRewardModule.js] ⚠️ Participant ${participant.characterName} does not meet requirements for quest ${quest.questID}`);
            return 'requirements_not_met';
        }

        if (participant.progress !== 'completed') {
            participant.progress = 'completed';
            participant.completedAt = new Date();
        }

        const rewardResult = await distributeRewards(quest, participant, rewardContext);
        if (rewardResult.success) {
            updateParticipantRewardData(participant, quest, rewardResult, 'immediate');
            await recordUserQuestCompletion(participant, quest, rewardResult, 'immediate');
            
            // Send individual notification to the participant
            await sendIndividualRewardNotification(quest, participant, rewardResult);
            
            console.log(`[questRewardModule.js] ✅ Successfully rewarded participant ${participant.characterName} for quest ${quest.questID}`);
            return 'rewarded';
        } else {
            console.error(`[questRewardModule.js] ❌ Failed to distribute rewards for ${participant.characterName}:`, rewardResult.error);
            return 'reward_failed';
        }

    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error processing reward for participant ${participant.characterName}:`, error);
        return 'error';
    }
}

// ------------------- Update Participant Reward Data ------------------
function updateParticipantRewardData(participant, quest, rewardResult, rewardSource = 'immediate') {
    participant.progress = 'rewarded';
    participant.rewardedAt = new Date();
    participant.tokensEarned = rewardResult.tokensAdded;
    
    // Use itemsDistributed from rewardResult if available, otherwise use quest.itemRewards or fallback to single item
    if (rewardResult.itemsDistributed && rewardResult.itemsDistributed.length > 0) {
        participant.itemsEarned = rewardResult.itemsDistributed;
    } else if (quest.itemRewards && quest.itemRewards.length > 0) {
        participant.itemsEarned = quest.itemRewards;
    } else if (quest.itemReward) {
        participant.itemsEarned = [{ name: quest.itemReward, quantity: quest.itemRewardQty || 1 }];
    } else {
        participant.itemsEarned = [];
    }
    
    participant.rewardProcessed = true;
    participant.lastRewardCheck = new Date();
    participant.rewardSource = rewardSource;
}

// ============================================================================
// ------------------- Reward Distribution Functions -------------------
// ============================================================================

// ------------------- Distribute Quest Rewards ------------------
async function distributeRewards(quest, participant, rewardContext = {}) {
    try {
        const results = {
            success: true,
            errors: [],
            tokensAdded: 0,
            itemsAdded: 0,
            itemsDistributed: [],
            tokenBreakdown: {
                base: 0
            }
        };

        const baseTokensToAward = computeTokensForParticipant(quest, participant);
        results.tokenBreakdown.base = baseTokensToAward;

        const entertainerBonusActive = rewardContext?.entertainerBonus?.enabled === true;
        const entertainerBonusAmount = entertainerBonusActive ? rewardContext.entertainerBonus.amountPerParticipant : 0;

        if (entertainerBonusActive) {
            results.tokenBreakdown.entertainerBonus = entertainerBonusAmount;
        }

        const totalTokensToAward = baseTokensToAward + entertainerBonusAmount;
        results.tokenBreakdown.total = totalTokensToAward;
        
        if (totalTokensToAward > 0) {
            const tokenResult = await distributeTokens(participant.userId, totalTokensToAward, {
                category: 'quest_reward',
                description: quest.title ? `Quest: ${quest.title}` : `Quest ${quest.questID || 'reward'}`
            });
            if (tokenResult.success) {
                results.tokensAdded = tokenResult.tokensAdded;
                if (entertainerBonusActive && entertainerBonusAmount > 0) {
                    console.log(`[questRewardModule.js] 🎭 Added Entertainer bonus of +${entertainerBonusAmount} tokens for ${participant.characterName} (${participant.userId})`);
                }
            } else {
                results.errors.push(tokenResult.error);
            }
        }

        // Check for items to distribute (prefer itemRewards array, fallback to single item format)
        const hasItems = (quest.itemRewards && quest.itemRewards.length > 0) || 
                         (quest.itemReward && quest.itemRewardQty > 0);
        
        if (hasItems) {
            const itemResult = await distributeItems(quest, participant);
            if (itemResult.success) {
                results.itemsAdded = itemResult.itemsAdded;
                results.itemsDistributed = itemResult.itemsDistributed || [];
            } else {
                results.errors.push(itemResult.error);
            }
            if (itemResult.errors && itemResult.errors.length > 0) {
                results.errors.push(...itemResult.errors);
            }
        }

        if (results.errors.length > 0) {
            results.success = false;
            results.error = results.errors.join('; ');
        }

        return results;

    } catch (error) {
        return {
            success: false,
            error: error.message,
            errors: [error.message]
        };
    }
}

// ------------------- Distribute Tokens ------------------
async function distributeTokens(userId, tokensToAward, transactionMeta = {}) {
    try {
        const user = await findUserSafely(userId);
        const balanceBefore = user.tokens || 0;
        const balanceAfter = balanceBefore + tokensToAward;

        user.tokens = balanceAfter;
        await user.save();

        // Log to TokenTransactionModel for tracking/analytics
        try {
            const TokenTransaction = require('../models/TokenTransactionModel');
            await TokenTransaction.createTransaction({
                userId: String(userId),
                amount: tokensToAward,
                type: 'earned',
                category: transactionMeta.category || 'quest_reward',
                description: transactionMeta.description || 'Quest reward',
                link: transactionMeta.link || '',
                balanceBefore,
                balanceAfter
            });
        } catch (logErr) {
            console.error('[questRewardModule.js] Failed to log token transaction:', logErr.message);
        }

        console.log(`[questRewardModule.js] 💰 Added ${tokensToAward} tokens to user ${userId}`);
        
        return { success: true, tokensAdded: tokensToAward };
    } catch (error) {
        return { success: false, error: `Token distribution failed: ${error.message}` };
    }
}

// ------------------- Record Quest Completion Safeguard ------------------
// Records quest completion immediately when participant is marked as completed
// This ensures quest count is updated even if reward processing doesn't happen immediately
async function recordQuestCompletionSafeguard(participant, quest) {
    try {
        // Only record if participant is marked as completed
        if (participant.progress !== 'completed' && participant.progress !== 'rewarded') {
            return;
        }
        
        const user = await findUserSafely(participant.userId);
        if (!user || typeof user.recordQuestCompletion !== 'function') {
            return;
        }
        
        // Validate quest data - require non-empty questID for proper tracking
        if (!quest || typeof quest.questID !== 'string' || quest.questID.trim() === '') {
            logger.warn('QUEST', 'recordQuestCompletionSafeguard: quest or questID missing, skipping');
            return;
        }

        // Always call recordQuestCompletion - it handles duplicates by updating existing entries
        // This ensures the safeguard logic in recordQuestCompletion runs and fixes any discrepancies
        // Record with temporary reward data (will be updated when rewards are distributed)
        await user.recordQuestCompletion({
            questId: quest.questID,
            questType: quest.questType || 'Other',
            questTitle: quest.title || `Quest ${quest.questID}`,
            completedAt: participant.completedAt || new Date(),
            rewardedAt: null, // Will be set when rewards are distributed
            tokensEarned: 0, // Will be updated when rewards are distributed
            itemsEarned: [],
            rewardSource: 'pending' // Will be updated to 'immediate' or 'monthly' when rewards are distributed
        });

        logger.info('QUEST', `recordQuestCompletionSafeguard: recorded for userId=${participant.userId} questId=${quest.questID} rewardSource=pending`);
    } catch (error) {
        logger.error('QUEST', `Error in quest completion safeguard for user ${participant.userId}: ${error.message}`, error);
    }
}

async function recordUserQuestCompletion(participant, quest, rewardResult, rewardSource = 'immediate') {
    try {
        const user = await findUserSafely(participant.userId);
        if (!user || typeof user.recordQuestCompletion !== 'function') {
            logger.warn('QUEST', `User ${participant.userId} missing recordQuestCompletion method`);
            return;
        }

        // ------------------- Validate quest data -------------------
        if (!quest || typeof quest.questID !== 'string' || quest.questID.trim() === '') {
            logger.error('QUEST', 'Cannot record quest completion: quest or questID is missing');
            return;
        }

        if (!quest.questType) {
            logger.warn('QUEST', `Quest ${quest.questID} missing questType`);
        }

        if (!quest.title) {
            logger.warn('QUEST', `Quest ${quest.questID} missing title`);
        }

        await user.recordQuestCompletion({
            questId: quest.questID,
            questType: quest.questType || 'Other',
            questTitle: quest.title || `Quest ${quest.questID}`,
            completedAt: participant.completedAt || new Date(),
            rewardedAt: participant.rewardedAt || new Date(),
            tokensEarned: rewardResult.tokensAdded || 0,
            itemsEarned: participant.itemsEarned || [],
            rewardSource
        });

        logger.info('QUEST', `recordUserQuestCompletion: userId=${participant.userId} questId=${quest.questID} rewardSource=${rewardSource}`);
    } catch (error) {
        logger.error('QUEST', `Failed to record quest completion for user ${participant.userId}: ${error.message}`, error);
    }
}

// ------------------- Distribute Items ------------------
async function distributeItems(quest, participant) {
    try {
        const character = await findCharacterSafely(participant.characterName, participant.userId);
        
        // Import inventory utilities and database functions
        const { connectToInventories } = require('../database/db');
        const Item = require('../models/ItemModel');
        // Google Sheets functionality removed
        const { logItemAcquisitionToDatabase } = require('../utils/inventoryUtils');
        const { v4: uuidv4 } = require('uuid');
        
        // Determine which items to distribute
        let itemsToDistribute = [];
        
        if (quest.itemRewards && quest.itemRewards.length > 0) {
            // Use itemRewards array (multiple items support)
            itemsToDistribute = quest.itemRewards;
        } else if (quest.itemReward && quest.itemRewardQty > 0) {
            // Fallback to single item format (backward compatibility)
            itemsToDistribute = [{ name: quest.itemReward, quantity: quest.itemRewardQty || 1 }];
        } else {
            // No items to distribute
            return { success: true, itemsAdded: 0, itemsDistributed: [] };
        }
        
        // Connect to inventories database
        const inventoriesConnection = await connectToInventories();
        const db = inventoriesConnection.useDb('inventories');
        
        // Get collection name (per-character inventory)
        const collectionName = character.name.toLowerCase();
        const inventoryCollection = db.collection(collectionName);
        
        const distributedItems = [];
        let totalItemsAdded = 0;
        const errors = [];
        
        // Helper function to format date/time
        const formatDateTime = (date) => {
            return date.toLocaleString('en-US', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
        };
        
        // Process each item
        for (const itemReward of itemsToDistribute) {
            try {
                // Find the item in the Item model
                const item = await Item.findOne({ 
                    itemName: new RegExp(`^${escapeRegExp(itemReward.name)}$`, 'i')
                });
                
                if (!item) {
                    console.log(`[questRewardModule.js] ⚠️ Item "${itemReward.name}" not found in Item database`);
                    errors.push(`Item "${itemReward.name}" not found`);
                    continue;
                }
                
                // Check if item already exists in inventory
                const existingItem = await inventoryCollection.findOne({
                    characterId: character._id,
                    itemName: new RegExp(`^${escapeRegExp(item.itemName)}$`, 'i')
                });
                
                if (existingItem) {
                    // Update existing item quantity
                    await inventoryCollection.updateOne(
                        { _id: existingItem._id },
                        { $inc: { quantity: itemReward.quantity } }
                    );
                } else {
                    // Create new inventory entry
                    const newItem = {
                        characterId: character._id,
                        characterName: character.name,
                        itemName: item.itemName,
                        itemId: item._id,
                        quantity: itemReward.quantity,
                        category: Array.isArray(item.category) ? item.category.join(', ') : (item.category || 'Misc'),
                        type: Array.isArray(item.type) ? item.type.join(', ') : (item.type || 'Unknown'),
                        subtype: Array.isArray(item.subtype) ? item.subtype.join(', ') : (item.subtype || ''),
                        location: character.currentVillage || character.homeVillage || 'Unknown',
                        date: new Date(),
                        obtain: `Quest: ${quest.title}`
                    };
                    
                    await inventoryCollection.insertOne(newItem);
                }
                
                distributedItems.push({
                    name: item.itemName,
                    quantity: itemReward.quantity
                });
                totalItemsAdded += itemReward.quantity;
                
                // Google Sheets sync removed - inventory is handled by database operations
                
                // Log to InventoryLog database collection
                try {
                    await logItemAcquisitionToDatabase(character, item, {
                        quantity: itemReward.quantity,
                        obtain: `Quest: ${quest.title}`,
                        location: character.currentVillage || character.homeVillage || 'Unknown',
                        link: '' // No interaction link for quest rewards
                    });
                } catch (logError) {
                    // Don't fail the reward if logging fails
                    console.error(`[questRewardModule.js] ⚠️ Failed to log to InventoryLog: ${logError.message}`);
                }
                
                console.log(`[questRewardModule.js] 📦 Added ${itemReward.quantity}x ${item.itemName} to character ${participant.characterName}`);
                
            } catch (itemError) {
                console.error(`[questRewardModule.js] ❌ Error distributing item "${itemReward.name}":`, itemError);
                errors.push(`Failed to distribute ${itemReward.name}: ${itemError.message}`);
            }
        }
        
        if (errors.length > 0 && distributedItems.length === 0) {
            // All items failed
            return { success: false, error: errors.join('; '), itemsDistributed: [] };
        }
        
        const itemNames = distributedItems.map(i => `${i.quantity}x ${i.name}`).join(', ');
        console.log(`[questRewardModule.js] 📦 Distributed ${distributedItems.length} item(s) (${itemNames}) to character ${participant.characterName}`);
        
        return { 
            success: true, 
            itemsAdded: totalItemsAdded,
            itemsDistributed: distributedItems,
            errors: errors.length > 0 ? errors : undefined
        };
    } catch (error) {
        return { success: false, error: `Item distribution failed: ${error.message}` };
    }
}

// ------------------- Helper: Escape Regex ------------------
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// ------------------- Quest Management Functions -------------------
// ============================================================================

// ------------------- Mark Quest as Completed ------------------
async function markQuestAsCompleted(quest) {
    try {
        quest.status = 'completed';
        
        // Mark all remaining active participants appropriately
        let failedCount = 0;
        let completedCount = 0;
        
        for (const [userId, participant] of quest.participants) {
            if (participant.progress === PROGRESS_STATUS.ACTIVE) {
                // Check if they meet requirements
                if (meetsRequirements(participant, quest)) {
                    participant.progress = PROGRESS_STATUS.COMPLETED;
                    participant.completedAt = participant.completedAt || new Date();
                    completedCount++;
                } else {
                    participant.progress = PROGRESS_STATUS.FAILED;
                    failedCount++;
                }
            }
        }
        
        if (failedCount > 0 || completedCount > 0) {
            console.log(`[questRewardModule.js] 📊 Updated participant statuses: ${completedCount} completed, ${failedCount} failed`);
        }
        
        await quest.save();
        
        console.log(`[questRewardModule.js] ✅ Quest ${quest.questID} marked as completed`);
        
        if (quest.roleID) {
            console.log(`[questRewardModule.js] ℹ️ Quest role ${quest.roleID} should be deleted (requires guild context)`);
        }
        
    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error marking quest as completed:`, error);
        throw error;
    }
}

// ------------------- Manual Quest Completion ------------------
async function manuallyCompleteQuest(questId, adminUserId) {
    try {
        const quest = await findQuestSafely(questId);

        if (quest.status === 'completed') {
            throw new Error(`Quest ${questId} is already completed`);
        }

        console.log(`[questRewardModule.js] ⚙️ Admin ${adminUserId} manually completing quest ${questId}`);
        
        await processQuestCompletion(questId);
        
        return { success: true, message: `Quest ${questId} manually completed` };
        
    } catch (error) {
        handleError(error, 'questRewardModule.js');
        return { success: false, error: error.message };
    }
}

// ------------------- Check Quest Status ------------------
async function getQuestStatus(questId) {
    try {
        const quest = await findQuestSafely(questId);

        const participants = Array.from(quest.participants.values());
        
        return {
            questId: questId,
            title: quest.title,
            status: quest.status,
            posted: quest.posted,
            postedAt: quest.postedAt,
            participants: participants.length,
            participantDetails: participants.map(p => ({
                characterName: p.characterName,
                progress: p.progress,
                joinedAt: p.joinedAt,
                completedAt: p.completedAt,
                rewardedAt: p.rewardedAt,
                tokensEarned: p.tokensEarned,
                itemsEarned: p.itemsEarned
            }))
        };
        
    } catch (error) {
        handleError(error, 'questRewardModule.js');
        return { error: error.message };
    }
}

// ============================================================================
// ------------------- Special Quest Processing Functions -------------------
// ============================================================================

// ------------------- Process RP Quest Completion ------------------
async function processRPQuestCompletion(quest, participant) {
    try {
        console.log(`[questRewardModule.js] ⚙️ Processing RP quest completion for ${participant.characterName} in quest ${quest.questID}`);
        
        const meetsReq = meetsRequirements(participant, quest);
        if (!meetsReq) {
            console.log(`[questRewardModule.js] ⚠️ Participant ${participant.characterName} does not meet RP requirements (${participant.rpPostCount}/${quest.postRequirement || DEFAULT_POST_REQUIREMENT} posts)`);
            return {
                success: false,
                error: `Participant needs ${(quest.postRequirement || DEFAULT_POST_REQUIREMENT) - participant.rpPostCount} more posts to complete the quest`
            };
        }
        
        participant.progress = 'completed';
        participant.completedAt = new Date();
        
        const participants = Array.from(quest.participants?.values?.() || []);
        const rewardContext = await buildQuestRewardContext(quest, participants);
        
        const rewardResult = await distributeRewards(quest, participant, rewardContext);
        
        if (rewardResult.success) {
            console.log(`[questRewardModule.js] ✅ RP quest completed and rewards distributed for ${participant.characterName}`);
            return {
                success: true,
                tokensAdded: rewardResult.tokensAdded,
                itemsAdded: rewardResult.itemsAdded
            };
        } else {
            console.error(`[questRewardModule.js] ❌ Failed to distribute rewards for RP quest:`, rewardResult.error);
            return rewardResult;
        }
        
    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error processing RP quest completion:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ============================================================================
// ------------------- Monthly Reward Distribution Functions -------------------
// ============================================================================

// ------------------- Process Monthly Quest Rewards ------------------
async function processMonthlyQuestRewards() {
    try {
        console.log('[questRewardModule.js] 🏆 Starting monthly quest reward distribution...');
        
        // Find all completed quests
        // NOTE: Can't use dotted notation to query Map fields like 'participants.progress'
        // Instead, we fetch all completed quests and filter participants in memory
        const completedQuests = await Quest.find({
            status: 'completed'
        });
        
        if (completedQuests.length === 0) {
            console.log('[questRewardModule.js] ℹ️ No completed quests found for reward distribution');
            return { processed: 0, rewarded: 0, alreadyRewarded: 0, errors: 0 };
        }
        
        console.log(`[questRewardModule.js] 📋 Found ${completedQuests.length} completed quests to process`);
        
        let totalProcessed = 0;
        let totalRewarded = 0;
        let totalAlreadyRewarded = 0;
        let totalErrors = 0;
        
        for (const quest of completedQuests) {
            try {
                const result = await processQuestMonthlyRewards(quest);
                totalProcessed += result.processed;
                totalRewarded += result.rewarded;
                totalAlreadyRewarded += result.alreadyRewarded || 0;
                totalErrors += result.errors;
            } catch (error) {
                console.error(`[questRewardModule.js] ❌ Error processing quest ${quest.questID}:`, error);
                totalErrors++;
            }
        }
        
        console.log(`[questRewardModule.js] ✅ Monthly reward distribution completed - Processed: ${totalProcessed}, Rewarded: ${totalRewarded}, Already Rewarded: ${totalAlreadyRewarded}, Errors: ${totalErrors}`);
        
        return {
            processed: totalProcessed,
            rewarded: totalRewarded,
            alreadyRewarded: totalAlreadyRewarded,
            errors: totalErrors
        };
        
    } catch (error) {
        handleError(error, 'questRewardModule.js');
        console.error('[questRewardModule.js] ❌ Error in monthly reward distribution:', error);
        throw error;
    }
}

// ------------------- Process Individual Quest Monthly Rewards ------------------
async function processQuestMonthlyRewards(quest) {
    try {
        const participants = Array.from(quest.participants.values());
        let processed = 0;
        let rewarded = 0;
        let errors = 0;
        let alreadyRewarded = 0;
        
        const rewardContext = await buildQuestRewardContext(quest, participants);
        
        for (const participant of participants) {
            try {
                // SAFEGUARD: Sync approved submissions from ApprovedSubmission collection
                // This ensures participants with approved submissions are properly tracked
                // even if the submission approval process didn't complete properly
                if (quest.questType === QUEST_TYPES.ART || 
                    quest.questType === QUEST_TYPES.WRITING || 
                    quest.questType === QUEST_TYPES.ART_WRITING) {
                    await syncApprovedSubmissionsToParticipant(quest, participant);
                }
                
                // Check if active participants meet requirements before checking reward status
                // This ensures participants who submitted objectives are marked as completed
                // even if they weren't explicitly marked before quest expiration
                if (participant.progress === 'active') {
                    const meetsReq = meetsRequirements(participant, quest);
                    if (meetsReq) {
                        // Mark participant as completed
                        participant.progress = 'completed';
                        participant.completedAt = participant.completedAt || new Date();
                        participant.completionProcessed = false;
                        participant.lastCompletionCheck = new Date();
                        participant.updatedAt = new Date();
                        
                        // Record quest completion for the user with temporary reward data (tokens: 0)
                        // This ensures user.quests.totalCompleted is updated immediately
                        // The record will be updated with actual reward data when rewards are distributed
                        const tempRewardResult = {
                            success: true,
                            tokensAdded: 0,
                            itemsAdded: 0,
                            tokenBreakdown: { base: 0 }
                        };
                        await recordUserQuestCompletion(participant, quest, tempRewardResult, 'monthly');
                        
                        console.log(`[questRewardModule.js] ✅ Marked active participant ${participant.characterName} as completed for quest ${quest.questID} (requirements met)`);
                    }
                }
                
                // Enhanced reward status checking to prevent double-rewarding
                const rewardStatus = getParticipantRewardStatus(participant);
                
                if (rewardStatus === 'already_rewarded') {
                    alreadyRewarded++;
                    console.log(`[questRewardModule.js] ℹ️ Participant ${participant.characterName} already rewarded (${participant.progress})`);
                } else if (rewardStatus === 'needs_rewarding') {
                    const rewardResult = await distributeParticipantMonthlyRewards(quest, participant, rewardContext);
                    
                    if (rewardResult.success) {
                        updateParticipantRewardData(participant, quest, rewardResult, 'monthly');
                        // Record quest completion again with actual reward data
                        // recordQuestCompletion handles duplicate quest IDs by updating existing entry
                        await recordUserQuestCompletion(participant, quest, rewardResult, 'monthly');
                        rewarded++;
                        console.log(`[questRewardModule.js] ✅ Rewarded ${participant.characterName} for quest ${quest.questID}`);
                    } else {
                        console.error(`[questRewardModule.js] ❌ Failed to reward ${participant.characterName}: ${rewardResult.error}`);
                        errors++;
                    }
                } else {
                    console.log(`[questRewardModule.js] ℹ️ Participant ${participant.characterName} doesn't need rewarding (${rewardStatus})`);
                }
                
                processed++;
            } catch (error) {
                console.error(`[questRewardModule.js] ❌ Error processing participant ${participant.characterName}:`, error);
                errors++;
            }
        }
        
        // Save the quest with updated participant data
        await quest.save();
        
        console.log(`[questRewardModule.js] 📊 Quest ${quest.questID} monthly processing: ${processed} processed, ${rewarded} rewarded, ${alreadyRewarded} already rewarded, ${errors} errors`);
        
        return { processed, rewarded, alreadyRewarded, errors };
        
    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error processing quest monthly rewards for ${quest.questID}:`, error);
        throw error;
    }
}

// ------------------- Get Participant Reward Status ------------------
function getParticipantRewardStatus(participant) {
    // Check if already fully rewarded
    if (participant.progress === 'rewarded' || participant.rewardProcessed === true) {
        return 'already_rewarded';
    }
    
    // Check if has tokens earned (indicates previous reward)
    if (participant.tokensEarned > 0) {
        return 'already_rewarded';
    }
    
    // Check if completed but not rewarded
    if (participant.progress === 'completed') {
        return 'needs_rewarding';
    }
    
    // Check if has items earned (indicates previous reward)
    if (participant.itemsEarned && participant.itemsEarned.length > 0) {
        return 'already_rewarded';
    }
    
    // Not completed yet
    return 'not_completed';
}

// ------------------- Validate Quest Reward Status ------------------
async function validateQuestRewardStatus(questId) {
    try {
        const quest = await findQuestSafely(questId);

        const participants = Array.from(quest.participants.values());
        const validation = {
            questId: quest.questID,
            questTitle: quest.title,
            questStatus: quest.status,
            totalParticipants: participants.length,
            participants: []
        };

        for (const participant of participants) {
            const rewardStatus = getParticipantRewardStatus(participant);
            validation.participants.push({
                characterName: participant.characterName,
                progress: participant.progress,
                tokensEarned: participant.tokensEarned,
                itemsEarned: participant.itemsEarned,
                rewardProcessed: participant.rewardProcessed,
                rewardSource: participant.rewardSource,
                rewardedAt: participant.rewardedAt,
                lastRewardCheck: participant.lastRewardCheck,
                status: rewardStatus
            });
        }

        return validation;
    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error validating quest reward status:`, error);
        return { error: error.message };
    }
}

// ------------------- Distribute Participant Monthly Rewards ------------------
async function distributeParticipantMonthlyRewards(quest, participant, rewardContext = {}) {
    // Use the existing distributeRewards function for consistency
    return await distributeRewards(quest, participant, rewardContext);
}

// ------------------- Get Quest Reward Summary ------------------
async function getQuestRewardSummary() {
    try {
        const completedQuests = await Quest.find({
            status: 'completed'
        });
        
        let totalParticipants = 0;
        let completedParticipants = 0;
        let rewardedParticipants = 0;
        let disqualifiedParticipants = 0;
        
        for (const quest of completedQuests) {
            const participants = Array.from(quest.participants.values());
            totalParticipants += participants.length;
            
            for (const participant of participants) {
                if (participant.progress === 'completed') completedParticipants++;
                if (participant.progress === 'rewarded') rewardedParticipants++;
                if (participant.progress === 'disqualified') disqualifiedParticipants++;
            }
        }
        
        return {
            totalQuests: completedQuests.length,
            totalParticipants,
            completedParticipants,
            rewardedParticipants,
            disqualifiedParticipants,
            pendingRewards: completedParticipants - rewardedParticipants
        };
        
    } catch (error) {
        console.error('[questRewardModule.js] ❌ Error getting reward summary:', error);
        return null;
    }
}

// ============================================================================
// ------------------- Art Quest Completion from Submission -------------------
// ============================================================================

// ------------------- Process Art Quest Completion from Submission ------------------
async function processArtQuestCompletionFromSubmission(submissionData, userId) {
    try {
        console.log(`[questRewardModule.js] 🎨 Processing art quest completion for user ${userId}`);
        
        const questID = submissionData.questEvent;
        if (!questID || questID === 'N/A') {
            console.log(`[questRewardModule.js] ℹ️ No quest ID in submission data`);
            return { success: false, reason: 'No quest ID' };
        }
        
        // Find the quest
        const quest = await findQuestSafely(questID);
        
        // Get participant before checking quest status
        const participant = quest.getParticipant(userId);
        
        // SAFEGUARD: Sync approved submissions even if quest is not active
        // This handles cases where quest expired but submission was approved
        if (participant && (quest.questType === 'Art' || quest.questType === 'Art / Writing')) {
            await syncApprovedSubmissionsToParticipant(quest, participant);
            await quest.save(); // Save after syncing
        }
        
        // Check if quest is active
        if (quest.status !== 'active') {
            console.log(`[questRewardModule.js] ⚠️ Quest ${questID} is not active (status: ${quest.status})`);
            // Even if quest is not active, if we synced submissions and participant is now completed, return success
            if (participant && participant.progress === 'completed') {
                console.log(`[questRewardModule.js] ✅ Participant ${participant.characterName} was marked as completed via submission sync`);
                return { success: true, questCompleted: false, synced: true };
            }
            return { success: false, reason: 'Quest not active' };
        }
        
        // Validate quest type before attempting completion
        if (quest.questType !== 'Art' && quest.questType !== 'Art / Writing') {
            console.log(`[questRewardModule.js] ⚠️ Quest ${questID} is not an Art quest (type: ${quest.questType})`);
            return { success: false, reason: `Quest is not an Art quest (type: ${quest.questType})` };
        }
        
        // Complete the quest for this participant
        const completionResult = await quest.completeFromArtSubmission(userId, submissionData);
        
        if (!completionResult.success) {
            console.log(`[questRewardModule.js] ❌ Failed to complete art quest: ${completionResult.reason || completionResult.error}`);
            return completionResult;
        }
        
        // Check if the entire quest should be completed
        // Note: checkAutoCompletion now requires time expiration before completing
        // This prevents premature completion when submissions are approved before quest period ends
        const autoCompletionResult = await quest.checkAutoCompletion();
        
        if (autoCompletionResult.completed && autoCompletionResult.needsRewardProcessing) {
            console.log(`[questRewardModule.js] ✅ Quest ${questID} completed: ${autoCompletionResult.reason}`);
            
            // Process quest completion and distribute rewards
            await processQuestCompletion(questID);
            
            // Mark completion as processed to prevent duplicates
            await quest.markCompletionProcessed();
        } else if (autoCompletionResult.reason && autoCompletionResult.reason.includes('quest period has not ended')) {
            console.log(`[questRewardModule.js] ⏳ Quest ${questID} participant completed, but quest period has not ended yet. Completion will be processed when period expires.`);
        }
        
        return { success: true, questCompleted: autoCompletionResult.completed };
        
    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error processing art quest completion:`, error);
        return { success: false, error: error.message };
    }
}

// ------------------- Process Writing Quest Completion from Submission ------------------
async function processWritingQuestCompletionFromSubmission(submissionData, userId) {
    try {
        console.log(`[questRewardModule.js] 📝 Processing writing quest completion for user ${userId}`);
        
        const questID = submissionData.questEvent;
        if (!questID || questID === 'N/A') {
            console.log(`[questRewardModule.js] ℹ️ No quest ID in submission data`);
            return { success: false, reason: 'No quest ID' };
        }
        
        // Find the quest
        const quest = await findQuestSafely(questID);
        
        // Get participant before checking quest status
        const participant = quest.getParticipant(userId);
        
        // SAFEGUARD: Sync approved submissions even if quest is not active
        // This handles cases where quest expired but submission was approved
        if (participant && (quest.questType === 'Writing' || quest.questType === 'Art / Writing')) {
            await syncApprovedSubmissionsToParticipant(quest, participant);
            await quest.save(); // Save after syncing
        }
        
        // Check if quest is active
        if (quest.status !== 'active') {
            console.log(`[questRewardModule.js] ⚠️ Quest ${questID} is not active (status: ${quest.status})`);
            // Even if quest is not active, if we synced submissions and participant is now completed, return success
            if (participant && participant.progress === 'completed') {
                console.log(`[questRewardModule.js] ✅ Participant ${participant.characterName} was marked as completed via submission sync`);
                return { success: true, questCompleted: false, synced: true };
            }
            return { success: false, reason: 'Quest not active' };
        }
        
        // Validate quest type before attempting completion
        if (quest.questType !== 'Writing' && quest.questType !== 'Art / Writing') {
            console.log(`[questRewardModule.js] ⚠️ Quest ${questID} is not a Writing quest (type: ${quest.questType})`);
            return { success: false, reason: `Quest is not a Writing quest (type: ${quest.questType})` };
        }
        
        // Complete the quest for this participant
        const completionResult = await quest.completeFromWritingSubmission(userId, submissionData);
        
        if (!completionResult.success) {
            console.log(`[questRewardModule.js] ❌ Failed to complete writing quest: ${completionResult.reason || completionResult.error}`);
            return completionResult;
        }
        
        // Check if the entire quest should be completed
        // Note: checkAutoCompletion now requires time expiration before completing
        // This prevents premature completion when submissions are approved before quest period ends
        const autoCompletionResult = await quest.checkAutoCompletion();
        
        if (autoCompletionResult.completed && autoCompletionResult.needsRewardProcessing) {
            console.log(`[questRewardModule.js] ✅ Quest ${questID} completed: ${autoCompletionResult.reason}`);
            
            // Process quest completion and distribute rewards
            await processQuestCompletion(questID);
            
            // Mark completion as processed to prevent duplicates
            await quest.markCompletionProcessed();
        } else if (autoCompletionResult.reason && autoCompletionResult.reason.includes('quest period has not ended')) {
            console.log(`[questRewardModule.js] ⏳ Quest ${questID} participant completed, but quest period has not ended yet. Completion will be processed when period expires.`);
        }
        
        return { success: true, questCompleted: autoCompletionResult.completed };
        
    } catch (error) {
        console.error(`[questRewardModule.js] ❌ Error processing writing quest completion:`, error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// ------------------- Village Validation Functions -------------------
// ============================================================================

// ------------------- Extract Village from Quest Location ------------------
function extractVillageFromLocation(location) {
    const questLocation = location.toLowerCase();
    const villages = [];
    
    if (questLocation.includes('rudania')) {
        villages.push('rudania');
    }
    if (questLocation.includes('inariko')) {
        villages.push('inariko');
    }
    if (questLocation.includes('vhintl')) {
        villages.push('vhintl');
    }
    
    // Return array of villages, or null if none found
    return villages.length > 0 ? villages : null;
}

// ------------------- Validate RP Quest Village ------------------
async function validateRPQuestVillage(interaction, quest, character) {
    const requiredVillages = extractVillageFromLocation(quest.location);
    
    if (!requiredVillages) {
        await interaction.reply({
            content: `[quest.js]❌ Could not determine required village from quest location: ${quest.location}`,
            ephemeral: true,
        });
        return false;
    }
    
    const characterVillage = character.currentVillage.toLowerCase();
    
    // Check if character is in ANY of the allowed villages
    if (!requiredVillages.includes(characterVillage)) {
        // Format the list of allowed villages for the error message
        const villageList = requiredVillages.map(v => v.charAt(0).toUpperCase() + v.slice(1)).join(', ');
        
        await interaction.reply({
            content: `[quest.js]❌ **RP Quest Village Requirement**: Your character **${character.name}** must be in one of these villages to join this RP quest: **${villageList}**. Currently in: **${characterVillage.charAt(0).toUpperCase() + characterVillage.slice(1)}**.\n\n**Rule**: RP quest participants must stay in the quest village for the entire duration. Use \`/travel\` to move to the correct village first.`,
            ephemeral: true,
        });
        return false;
    }
    
    return true;
}

// ------------------- Check Character Village for Quest ------------------
async function checkCharacterVillageForQuest(character, quest) {
    if (quest.questType !== QUEST_TYPES.RP) {
        return { valid: true, reason: 'Not an RP quest' };
    }
    
    const requiredVillages = extractVillageFromLocation(quest.location);
    if (!requiredVillages) {
        return { valid: false, reason: 'Could not determine required village from quest location' };
    }
    
    const currentVillage = character.currentVillage.toLowerCase();
    
    // Check if character is in ANY of the allowed villages
    if (!requiredVillages.includes(currentVillage)) {
        const villageList = requiredVillages.map(v => v.charAt(0).toUpperCase() + v.slice(1)).join(', ');
        return { 
            valid: false, 
            reason: `Character is in ${currentVillage}, must be in one of: ${villageList}`,
            currentVillage: character.currentVillage,
            requiredVillages: requiredVillages
        };
    }
    
    return { valid: true, reason: 'Village location valid' };
}

// ============================================================================
// ------------------- Quest Validation Functions -------------------
// ============================================================================

// ------------------- Validate Quest Participation ------------------
async function validateQuestParticipation(quest, userID, characterName) {
    if (quest.participants.has(userID)) {
        const existingParticipant = quest.participants.get(userID);
        return {
            valid: false,
            message: `You are already participating in the quest \`${quest.title}\` with character **${existingParticipant.characterName}**.`
        };
    }

    // Check if this character is already in this quest (by any user)
    const participants = Array.from(quest.participants.values());
    const characterAlreadyInQuest = participants.some(participant => 
        participant.characterName.toLowerCase() === characterName.toLowerCase()
    );

    if (characterAlreadyInQuest) {
        return {
            valid: false,
            message: `Character **${characterName}** is already participating in the quest \`${quest.title}\`!`
        };
    }

    // Check if this character has previously left this quest
    if (quest.hasCharacterLeft && quest.hasCharacterLeft(characterName)) {
        return {
            valid: false,
            message: `Character **${characterName}** has already left the quest \`${quest.title}\` and cannot rejoin!`
        };
    }

    return { valid: true };
}

// ------------------- Validate Quest Type Rules ------------------
async function validateQuestTypeRules(quest) {
    const now = new Date();
    
    switch (quest.questType.toLowerCase()) {
        case QUEST_TYPES.RP.toLowerCase():
            if (quest.posted) {
                const questPostDate = new Date(quest.date);
                const rpSignupDeadline = new Date(
                    questPostDate.getTime() + RP_SIGNUP_WINDOW_DAYS * 24 * 60 * 60 * 1000
                );

                if (now > rpSignupDeadline) {
                    return {
                        valid: false,
                        message: `The signup window for RP quest \`${quest.title}\` has closed. **RULE**: RP quests have a 1-week signup window after posting.`
                    };
                }
            }
            break;

        case QUEST_TYPES.ART.toLowerCase():
        case QUEST_TYPES.WRITING.toLowerCase():
        case QUEST_TYPES.INTERACTIVE.toLowerCase():
            break;
    }

    return { valid: true };
}

// ============================================================================
// ------------------- Quest Embed Functions -------------------
// ============================================================================

// ------------------- Format Quest Rules ------------------
function formatQuestRules(quest) {
    let rulesText = '';
    
    if (quest.rules) {
        rulesText += `**Rules:**\n${quest.rules}\n\n`;
    }
    
    if (quest.collabAllowed) {
        rulesText += `**Collaboration:** ${quest.collabRule || 'Allowed'}\n\n`;
    }
    
    if (quest.specialNote) {
        rulesText += `**Special Note:** ${quest.specialNote}\n\n`;
    }
    
    if (quest.participantCap) {
        rulesText += `**Participant Limit:** ${quest.participantCap} members\n\n`;
    }
    
    if (quest.signupDeadline) {
        rulesText += `**Signup Deadline:** ${quest.signupDeadline}\n\n`;
    }
    
    return rulesText;
}

// ------------------- Format Location Text ------------------
function formatLocationText(location) {
    if (!location) return 'Not specified';
    
    // Handle special location formatting
    if (location.toLowerCase().includes('rudania')) {
        return '🏔️ Rudania';
    } else if (location.toLowerCase().includes('inariko')) {
        return '🌸 Inariko';
    } else if (location.toLowerCase().includes('vhintl')) {
        return '🌊 Vhintl';
    }
    
    return location;
}

// ------------------- Format Signup Deadline ------------------
function formatSignupDeadline(signupDeadline) {
    if (!signupDeadline || signupDeadline === 'N/A') return null;
    
    try {
        const deadline = new Date(signupDeadline);
        return deadline.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return signupDeadline;
    }
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
    // Constants
    BORDER_IMAGE,
    QUEST_CHANNEL_ID,
    QUEST_COLORS,
    QUEST_TYPES,
    SUBMISSION_TYPES,
    PROGRESS_STATUS,
    DEFAULT_POST_REQUIREMENT,
    DEFAULT_ROLL_REQUIREMENT,
    RP_SIGNUP_WINDOW_DAYS,
    
    // Core Functions
    processQuestCompletion,
    processParticipantReward,
    distributeRewards,
    markQuestAsCompleted,
    manuallyCompleteQuest,
    getQuestStatus,
    processRPQuestCompletion,
    processMonthlyQuestRewards,
    processQuestMonthlyRewards,
    distributeParticipantMonthlyRewards,
    getQuestRewardSummary,
    processArtQuestCompletionFromSubmission,
    processWritingQuestCompletionFromSubmission,
    validateQuestRewardStatus,
    getParticipantRewardStatus,
    sendQuestCompletionNotification,
    sendQuestCompletionSummary,
    createCompletionNotificationEmbed,
    getQuestNotificationChannel,
    recordQuestCompletionSafeguard,
    
    // Village Validation Functions
    extractVillageFromLocation,
    validateRPQuestVillage,
    checkCharacterVillageForQuest,
    
    // Quest Validation Functions
    validateQuestParticipation,
    validateQuestTypeRules,
    
    // Quest Embed Functions
    formatQuestRules,
    formatLocationText,
    formatSignupDeadline,
    
    // Helper Functions
    createBaseEmbed,
    addQuestInfoFields,
    meetsRequirements
};
