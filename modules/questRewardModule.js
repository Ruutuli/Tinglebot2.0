// ============================================================================
// ------------------- questRewardModule.js -------------------
// Handles automatic quest reward distribution and completion processing
// ============================================================================

const Quest = require('../models/QuestModel');
const Character = require('../models/CharacterModel');
const User = require('../models/UserModel');
const { handleError } = require('../utils/globalErrorHandler');
const { EmbedBuilder } = require('discord.js');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================
const BORDER_IMAGE = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';
const QUEST_CHANNEL_ID = '1305486549252706335';
const DEFAULT_POST_REQUIREMENT = 15;
const DEFAULT_ROLL_REQUIREMENT = 1;
const RP_SIGNUP_WINDOW_DAYS = 7;
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
        // For RP quests, use the RP thread if available
        if (quest.questType.toLowerCase() === 'rp' && participant.rpThreadId) {
            return participant.rpThreadId;
        }

        // For other quest types, use the quest channel or general channel
        if (quest.targetChannel) {
            return quest.targetChannel;
        }

        // Fallback to quest channel constant
        return QUEST_CHANNEL_ID;

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

        // Use quest channel or fallback
        const channelId = quest.targetChannel || QUEST_CHANNEL_ID;
        const channel = await client.channels.fetch(channelId);
        
        if (!channel) {
            console.log(`[questRewardModule] ❌ Could not find channel ${channelId} for summary notification`);
            return { success: false, error: 'Channel not found' };
        }

        const participants = Array.from(quest.participants.values());
        const completedParticipants = participants.filter(p => p.progress === 'completed');
        const rewardedParticipants = participants.filter(p => p.progress === 'rewarded');

        let summaryTitle = '🏁 Quest Completed!';
        let summaryDescription = `The quest **${quest.title}** has been completed!`;
        
        if (completionReason === 'time_expired') {
            summaryTitle = '⏰ Quest Time Expired!';
            summaryDescription = `The quest **${quest.title}** has ended due to time expiration.`;
        }

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
        
        addQuestInfoFields(embed, quest, additionalFields);

        await channel.send({ embeds: [embed] });

        console.log(`[questRewardModule] ✅ Sent quest completion summary for ${quest.questID}`);
        return { success: true };

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
    console.error(`[questRewardModule.js] ❌ Error ${context}${questInfo}:`, error);
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
        console.error(`[questRewardModule.js] ❌ Database error finding quest ${questId}:`, error);
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
        console.error(`[questRewardModule.js] ❌ Database error finding user ${userId}:`, error);
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
        console.error(`[questRewardModule.js] ❌ Database error finding character ${characterName}:`, error);
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
        checkRequirements: (participant) => {
            const hasArtSubmission = participant.submissions.some(sub => sub.type === SUBMISSION_TYPES.ART && sub.approved);
            const hasWritingSubmission = participant.submissions.some(sub => sub.type === SUBMISSION_TYPES.WRITING && sub.approved);
            return hasArtSubmission && hasWritingSubmission;
        },
        getProgressField: (participant) => {
            const artSubmissions = participant.submissions.filter(sub => sub.type === SUBMISSION_TYPES.ART && sub.approved).length;
            const writingSubmissions = participant.submissions.filter(sub => sub.type === SUBMISSION_TYPES.WRITING && sub.approved).length;
            return {
                name: 'Submissions',
                value: `🎨 ${artSubmissions} art, ✍️ ${writingSubmissions} writing`,
                inline: true
            };
        },
        getTitle: () => '🎨✍️ Art & Writing Quest Completed!',
        getDescription: (characterName) => `**${characterName}** has successfully submitted both art and writing for the quest!`
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

// ------------------- Requirements Check ------------------
function meetsRequirements(participant, quest) {
    const { questType, postRequirement, requiredRolls } = quest;
    const { rpPostCount, submissions, successfulRolls } = participant;
    
    if (questType === QUEST_TYPES.RP) {
        return rpPostCount >= (postRequirement || DEFAULT_POST_REQUIREMENT);
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
        return successfulRolls >= (requiredRolls || DEFAULT_ROLL_REQUIREMENT);
    }
    
    return false;
}

// ------------------- Token Calculation ------------------
function computeTokens(quest) {
    return quest.getNormalizedTokenReward();
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
        const quest = await findQuestSafely(questId);

        if (quest.status !== 'active') {
            console.log(`[questRewardModule.js] ℹ️ Quest ${questId} is not active, skipping completion processing.`);
            return;
        }

        console.log(`[questRewardModule.js] ⚙️ Processing completion for quest: ${quest.title}`);

        if (!quest.participants || quest.participants.size === 0) {
            console.log(`[questRewardModule.js] ⚠️ No participants found for quest ${questId}`);
            return;
        }

        const participants = Array.from(quest.participants.values());
        const results = await processAllParticipants(quest, participants);

        if (results.rewardedCount > 0 && results.rewardedCount === participants.length) {
            await markQuestAsCompleted(quest);
            console.log(`[questRewardModule.js] ✅ Quest ${questId} marked as completed. All participants rewarded.`);
        }

        await quest.save();
        console.log(`[questRewardModule.js] ✅ Quest completion processing finished. Completed: ${results.completedCount}, Rewarded: ${results.rewardedCount}, Errors: ${results.errorCount}`);

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

    for (const participant of participants) {
        try {
            const result = await processParticipantReward(quest, participant);
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
async function processParticipantReward(quest, participant) {
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

        const rewardResult = await distributeRewards(quest, participant);
        if (rewardResult.success) {
            updateParticipantRewardData(participant, quest, rewardResult, 'immediate');
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
    participant.itemsEarned = quest.itemReward ? [{ name: quest.itemReward, quantity: quest.itemRewardQty || 1 }] : [];
    participant.rewardProcessed = true;
    participant.lastRewardCheck = new Date();
    participant.rewardSource = rewardSource;
}

// ============================================================================
// ------------------- Reward Distribution Functions -------------------
// ============================================================================

// ------------------- Distribute Quest Rewards ------------------
async function distributeRewards(quest, participant) {
    try {
        const results = {
            success: true,
            errors: [],
            tokensAdded: 0,
            itemsAdded: 0
        };

        const tokensToAward = computeTokens(quest);
        
        if (tokensToAward > 0) {
            const tokenResult = await distributeTokens(participant.userId, tokensToAward);
            if (tokenResult.success) {
                results.tokensAdded = tokenResult.tokensAdded;
            } else {
                results.errors.push(tokenResult.error);
            }
        }

        if (quest.itemReward && quest.itemRewardQty > 0) {
            const itemResult = await distributeItems(quest, participant);
            if (itemResult.success) {
                results.itemsAdded = itemResult.itemsAdded;
            } else {
                results.errors.push(itemResult.error);
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
async function distributeTokens(userId, tokensToAward) {
    try {
        const user = await findUserSafely(userId);

        user.tokens = (user.tokens || 0) + tokensToAward;
        await user.save();
        console.log(`[questRewardModule.js] 💰 Added ${tokensToAward} tokens to user ${userId}`);
        
        return { success: true, tokensAdded: tokensToAward };
    } catch (error) {
        return { success: false, error: `Token distribution failed: ${error.message}` };
    }
}

// ------------------- Distribute Items ------------------
async function distributeItems(quest, participant) {
    try {
        const character = await findCharacterSafely(participant.characterName, participant.userId);

        if (!character.inventory) {
            character.inventory = [];
        }
        
        const existingItem = character.inventory.find(item => item.name === quest.itemReward);
        if (existingItem) {
            existingItem.quantity = (existingItem.quantity || 0) + quest.itemRewardQty;
        } else {
            character.inventory.push({
                name: quest.itemReward,
                quantity: quest.itemRewardQty,
                obtainedAt: new Date(),
                source: `Quest: ${quest.title}`
            });
        }
        
        await character.save();
        console.log(`[questRewardModule.js] 📦 Added ${quest.itemRewardQty}x ${quest.itemReward} to character ${participant.characterName}`);
        
        return { success: true, itemsAdded: quest.itemRewardQty };
    } catch (error) {
        return { success: false, error: `Item distribution failed: ${error.message}` };
    }
}

// ============================================================================
// ------------------- Quest Management Functions -------------------
// ============================================================================

// ------------------- Mark Quest as Completed ------------------
async function markQuestAsCompleted(quest) {
    try {
        quest.status = 'completed';
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
        
        const rewardResult = await distributeRewards(quest, participant);
        
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
        
        // Find all completed quests that might need reward processing
        const completedQuests = await Quest.find({
            status: 'completed',
            $or: [
                { 'participants.progress': 'completed' },
                { 'participants.tokensEarned': 0 },
                { 'participants.rewardProcessed': { $ne: true } }
            ]
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
        
        for (const participant of participants) {
            try {
                // Enhanced reward status checking to prevent double-rewarding
                const rewardStatus = getParticipantRewardStatus(participant);
                
                if (rewardStatus === 'already_rewarded') {
                    alreadyRewarded++;
                    console.log(`[questRewardModule.js] ℹ️ Participant ${participant.characterName} already rewarded (${participant.progress})`);
                } else if (rewardStatus === 'needs_rewarding') {
                    const rewardResult = await distributeParticipantMonthlyRewards(quest, participant);
                    
                    if (rewardResult.success) {
                        updateParticipantRewardData(participant, quest, rewardResult, 'monthly');
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
async function distributeParticipantMonthlyRewards(quest, participant) {
    // Use the existing distributeRewards function for consistency
    return await distributeRewards(quest, participant);
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
        
        // Check if quest is active
        if (quest.status !== 'active') {
            console.log(`[questRewardModule.js] ⚠️ Quest ${questID} is not active (status: ${quest.status})`);
            return { success: false, reason: 'Quest not active' };
        }
        
        // Complete the quest for this participant
        const completionResult = await quest.completeFromArtSubmission(userId, submissionData);
        
        if (!completionResult.success) {
            console.log(`[questRewardModule.js] ❌ Failed to complete art quest: ${completionResult.reason || completionResult.error}`);
            return completionResult;
        }
        
        // Check if the entire quest should be completed
        const autoCompletionResult = await quest.checkAutoCompletion();
        
        if (autoCompletionResult.completed && autoCompletionResult.needsRewardProcessing) {
            console.log(`[questRewardModule.js] ✅ Quest ${questID} completed: ${autoCompletionResult.reason}`);
            
            // Process quest completion and distribute rewards
            await processQuestCompletion(questID);
            
            // Mark completion as processed to prevent duplicates
            await quest.markCompletionProcessed();
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
        
        // Check if quest is active
        if (quest.status !== 'active') {
            console.log(`[questRewardModule.js] ⚠️ Quest ${questID} is not active (status: ${quest.status})`);
            return { success: false, reason: 'Quest not active' };
        }
        
        // Complete the quest for this participant
        const completionResult = await quest.completeFromWritingSubmission(userId, submissionData);
        
        if (!completionResult.success) {
            console.log(`[questRewardModule.js] ❌ Failed to complete writing quest: ${completionResult.reason || completionResult.error}`);
            return completionResult;
        }
        
        // Check if the entire quest should be completed
        const autoCompletionResult = await quest.checkAutoCompletion();
        
        if (autoCompletionResult.completed && autoCompletionResult.needsRewardProcessing) {
            console.log(`[questRewardModule.js] ✅ Quest ${questID} completed: ${autoCompletionResult.reason}`);
            
            // Process quest completion and distribute rewards
            await processQuestCompletion(questID);
            
            // Mark completion as processed to prevent duplicates
            await quest.markCompletionProcessed();
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
    
    if (questLocation.includes('rudania')) {
        return 'rudania';
    } else if (questLocation.includes('inariko')) {
        return 'inariko';
    } else if (questLocation.includes('vhintl')) {
        return 'vhintl';
    }
    
    return null;
}

// ------------------- Validate RP Quest Village ------------------
async function validateRPQuestVillage(interaction, quest, character) {
    const requiredVillage = extractVillageFromLocation(quest.location);
    
    if (!requiredVillage) {
        await interaction.reply({
            content: `[quest.js]❌ Could not determine required village from quest location: ${quest.location}`,
            ephemeral: true,
        });
        return false;
    }
    
    const characterVillage = character.currentVillage.toLowerCase();
    
    if (characterVillage !== requiredVillage) {
        await interaction.reply({
            content: `[quest.js]❌ **RP Quest Village Requirement**: Your character **${character.name}** must be in **${requiredVillage.charAt(0).toUpperCase() + requiredVillage.slice(1)}** to join this RP quest. Currently in: **${characterVillage.charAt(0).toUpperCase() + characterVillage.slice(1)}**.\n\n**Rule**: RP quest participants must stay in the quest village for the entire duration. Use \`/travel\` to move to the correct village first.`,
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
    
    const requiredVillage = extractVillageFromLocation(quest.location);
    if (!requiredVillage) {
        return { valid: false, reason: 'Could not determine required village from quest location' };
    }
    
    const currentVillage = character.currentVillage.toLowerCase();
    const requiredVillageLower = requiredVillage.toLowerCase();
    
    if (currentVillage !== requiredVillageLower) {
        return { 
            valid: false, 
            reason: `Character is in ${currentVillage}, must be in ${requiredVillage}`,
            currentVillage: character.currentVillage,
            requiredVillage: requiredVillage
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
