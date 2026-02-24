// ============================================================================
// ------------------- Mod Todo Reaction Handler -------------------
// Handles 📌 reactions to create mod tasks from messages
// Handles ⭕ reactions to mark tasks as complete
// ============================================================================

const { EmbedBuilder } = require('discord.js');
const { connectToTinglebot } = require('@/database/db');
const ModTask = require('@/models/ModTaskModel');
const logger = require('@/utils/logger');

// Category ID where reactions should be monitored
const MOD_TODO_CATEGORY_ID = '606126567302627329';

// Additional channel IDs to monitor (outside the category)
const MONITORED_CHANNEL_IDS = [
    '606004405128527873'
];

// Reaction emojis
const PIN_EMOJI = '📌';
const COMPLETE_EMOJI = '⭕';

// Default due time (12 hours from now)
const DEFAULT_DUE_HOURS = 12;

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

/**
 * Check if a channel is in the monitored category or is a monitored channel
 */
async function isInMonitoredCategory(channel) {
    if (!channel) return false;
    
    // Check if channel is in the explicitly monitored list
    if (MONITORED_CHANNEL_IDS.includes(channel.id)) {
        return true;
    }
    
    // Direct channel in category
    if (channel.parentId === MOD_TODO_CATEGORY_ID) {
        return true;
    }
    
    // Thread in a channel that's in the category
    if (channel.isThread() && channel.parent) {
        // Check if parent channel is in monitored list
        if (MONITORED_CHANNEL_IDS.includes(channel.parent.id)) {
            return true;
        }
        // Check if parent is in monitored category
        return channel.parent.parentId === MOD_TODO_CATEGORY_ID;
    }
    
    return false;
}

/**
 * Get user info from Discord member or user
 */
async function getUserInfo(user, guild) {
    try {
        const member = await guild.members.fetch(user.id);
        return {
            discordId: user.id,
            username: member.displayName || user.username,
            avatar: user.displayAvatarURL({ format: 'png', size: 128 })
        };
    } catch {
        return {
            discordId: user.id,
            username: user.username,
            avatar: user.displayAvatarURL({ format: 'png', size: 128 })
        };
    }
}

/**
 * Get forwarded message content if this is a forwarded message
 */
function getForwardedContent(message) {
    // Check for message snapshots (forwarded messages in Discord)
    if (message.messageSnapshots && message.messageSnapshots.size > 0) {
        const snapshot = message.messageSnapshots.first();
        if (snapshot) {
            return {
                content: snapshot.content || '',
                embeds: snapshot.embeds || [],
                attachments: snapshot.attachments || new Map()
            };
        }
    }
    
    // Check for reference snapshots in the message object
    if (message.reference?.messageId && message.type === 0) {
        // This might be a forward - check if content is empty but has embeds
        if (!message.content && message.embeds.length > 0) {
            const forwardEmbed = message.embeds.find(e => e.description || e.title);
            if (forwardEmbed) {
                return {
                    content: forwardEmbed.description || forwardEmbed.title || '',
                    embeds: message.embeds,
                    attachments: message.attachments
                };
            }
        }
    }
    
    return null;
}

/**
 * Try to find a good title from embed fields
 */
function getTitleFromEmbed(embed) {
    // First check for a field named "Title" (common in bot embeds)
    if (embed.fields && embed.fields.length > 0) {
        const titleField = embed.fields.find(f => 
            f.name.toLowerCase().includes('title') || 
            f.name.toLowerCase() === '📝 title'
        );
        if (titleField && titleField.value) {
            // Remove quotes if present
            return titleField.value.replace(/^["']|["']$/g, '').trim();
        }
    }
    
    // Fall back to embed title or description
    return embed.title || embed.description || '';
}

/**
 * Create a title from message content (first 7 words)
 */
function createTaskTitle(message) {
    let content = message.content || '';
    
    // Check for forwarded message content
    const forwarded = getForwardedContent(message);
    if (forwarded) {
        // Try to get title from embed fields first
        if (forwarded.embeds && forwarded.embeds.length > 0) {
            const embedTitle = getTitleFromEmbed(forwarded.embeds[0]);
            if (embedTitle) {
                content = embedTitle;
            }
        }
        // Fall back to forwarded content
        if (!content && forwarded.content) {
            content = forwarded.content;
        }
    }
    
    // If no content, check for embeds
    if (!content && message.embeds.length > 0) {
        content = getTitleFromEmbed(message.embeds[0]);
    }
    
    // If still no content, check for attachments
    if (!content && message.attachments.size > 0) {
        return `Attachment from ${message.author.username}`;
    }
    
    // Default title if empty
    if (!content.trim()) {
        return `Message from ${message.author.username}`;
    }
    
    // Get first 7 words
    const words = content.trim().split(/\s+/).slice(0, 7);
    let title = words.join(' ');
    
    // Add ellipsis if there were more words
    if (content.trim().split(/\s+/).length > 7) {
        title += '...';
    }
    
    // Truncate to 200 chars (safety)
    if (title.length > 200) {
        title = title.substring(0, 197) + '...';
    }
    
    return title;
}

/**
 * Extract all content from an embed (title, description, fields, footer)
 */
function extractEmbedContent(embed) {
    let content = '';
    
    if (embed.title) {
        content += `**${embed.title}**\n`;
    }
    if (embed.description) {
        content += `${embed.description}\n`;
    }
    
    // Extract field content - this is where most bot embeds store their data
    if (embed.fields && embed.fields.length > 0) {
        for (const field of embed.fields) {
            if (field.name && field.value) {
                content += `\n**${field.name}**\n${field.value}\n`;
            }
        }
    }
    
    if (embed.footer?.text) {
        content += `\n_${embed.footer.text}_`;
    }
    
    if (embed.url) {
        content += `\n${embed.url}`;
    }
    
    return content.trim();
}

/**
 * Create a description from message content
 */
function createTaskDescription(message) {
    let description = '';
    let attachments = message.attachments;
    
    // Check for forwarded message content
    const forwarded = getForwardedContent(message);
    if (forwarded) {
        // Add forwarded message indicator
        description = '**📨 Forwarded Message:**\n';
        
        // Add any text content
        if (forwarded.content) {
            description += forwarded.content + '\n';
        }
        
        // Use forwarded attachments if available
        if (forwarded.attachments && forwarded.attachments.size > 0) {
            attachments = forwarded.attachments;
        }
        
        // Add forwarded embeds content (including fields)
        if (forwarded.embeds && forwarded.embeds.length > 0) {
            for (const embed of forwarded.embeds) {
                const embedContent = extractEmbedContent(embed);
                if (embedContent) {
                    description += '\n' + embedContent;
                }
            }
        }
        
        // Add original message content if any
        if (message.content) {
            description += '\n\n**Additional context:**\n' + message.content;
        }
    } else {
        description = message.content || '';
        
        // Include embed content (including fields)
        if (message.embeds.length > 0) {
            for (const embed of message.embeds) {
                const embedContent = extractEmbedContent(embed);
                if (embedContent) {
                    description += description ? '\n\n' + embedContent : embedContent;
                }
            }
        }
    }
    
    // Add attachment info
    if (attachments && attachments.size > 0) {
        const attachmentUrls = [...attachments.values()].map(a => a.url).join('\n');
        description += description ? '\n\n**Attachments:**\n' + attachmentUrls : attachmentUrls;
    }
    
    // Truncate to 2000 chars
    if (description.length > 2000) {
        description = description.substring(0, 1997) + '...';
    }
    
    return description;
}

/**
 * Send a confirmation reply to the channel
 */
async function sendConfirmation(message, content, color = 0x49d59c) {
    try {
        const embed = new EmbedBuilder()
            .setDescription(content)
            .setColor(color)
            .setTimestamp();
        
        const reply = await message.reply({ embeds: [embed] });
        
        // Auto-delete after 10 seconds
        setTimeout(() => {
            reply.delete().catch(() => {});
        }, 10000);
    } catch (err) {
        logger.warn('MOD_TODO', `Failed to send confirmation: ${err.message}`);
    }
}

// ============================================================================
// ------------------- Main Handler Functions -------------------
// ============================================================================

/**
 * Handle 📌 reaction - Create a new task
 */
async function handlePinReaction(reaction, user, client) {
    const message = reaction.message;
    const channel = message.channel;
    const guild = message.guild;
    
    // Check if already exists
    const existingTask = await ModTask.findByMessageId(message.id);
    if (existingTask) {
        // Task already exists - add user as assignee if not already assigned
        const isAssigned = existingTask.assignees.some(a => a.discordId === user.id);
        if (!isAssigned) {
            const userInfo = await getUserInfo(user, guild);
            existingTask.assignees.push(userInfo);
            await existingTask.save();
            
            await sendConfirmation(
                message,
                `📌 **${userInfo.username}** has been assigned to this task.`
            );
            
            logger.info('MOD_TODO', `User ${user.id} assigned to existing task ${existingTask._id}`);
        }
        return;
    }
    
    // Get user info for creator and initial assignee
    const userInfo = await getUserInfo(user, guild);
    
    // Calculate due date (12 hours from now)
    const dueDate = new Date();
    dueDate.setHours(dueDate.getHours() + DEFAULT_DUE_HOURS);
    
    // Get next order in todo column
    const order = await ModTask.getNextOrderInColumn('todo');
    
    // Create the task
    const taskData = {
        title: createTaskTitle(message),
        description: createTaskDescription(message),
        column: 'todo',
        priority: 'medium',
        dueDate: dueDate,
        assignees: [userInfo],
        createdBy: userInfo,
        isRepeating: false,
        repeatConfig: null,
        order: order,
        discordSource: {
            messageId: message.id,
            channelId: channel.id,
            guildId: guild.id,
            messageUrl: message.url
        }
    };
    
    const task = new ModTask(taskData);
    await task.save();
    
    // Add bot reaction to indicate task was created
    try {
        await message.react('✅');
    } catch {
        // Ignore if can't react
    }
    
    // Send confirmation
    const dueDateStr = `<t:${Math.floor(dueDate.getTime() / 1000)}:R>`;
    await sendConfirmation(
        message,
        `📌 **Task created!**\n` +
        `Assigned to: **${userInfo.username}**\n` +
        `Due: ${dueDateStr}\n\n` +
        `React with 📌 to also be assigned.\n` +
        `React with ⭕ when complete.`
    );
    
    logger.info('MOD_TODO', `Task created from message ${message.id} by ${user.id}`);
}

/**
 * Handle ⭕ reaction - Mark task as complete
 */
async function handleCompleteReaction(reaction, user, client) {
    const message = reaction.message;
    
    // Check if task exists for this message
    const task = await ModTask.findByMessageId(message.id);
    if (!task) {
        // No task for this message - ignore silently
        return;
    }
    
    // Check if already done
    if (task.column === 'done') {
        return;
    }
    
    // Get user info
    const userInfo = await getUserInfo(user, message.guild);
    
    // Mark as done
    task.column = 'done';
    await task.save();
    
    // Remove the checkmark reaction if present, add completion indicator
    try {
        const botReactions = message.reactions.cache.filter(r => 
            r.users.cache.has(client.user.id) && r.emoji.name === '✅'
        );
        for (const [, r] of botReactions) {
            await r.users.remove(client.user.id);
        }
        await message.react('✔️');
    } catch {
        // Ignore if can't manage reactions
    }
    
    // Send confirmation
    await sendConfirmation(
        message,
        `⭕ **Task completed!**\n` +
        `Marked as done by: **${userInfo.username}**`,
        0x00ff00
    );
    
    logger.info('MOD_TODO', `Task ${task._id} completed by ${user.id}`);
}

// ============================================================================
// ------------------- Initialize Handler -------------------
// ============================================================================

/**
 * Initialize the mod todo reaction handler
 */
const initializeModTodoReactionHandler = (client) => {
    client.on('messageReactionAdd', async (reaction, user) => {
        try {
            // Ignore bot reactions
            if (user.bot) return;
            
            // Handle partial reactions
            if (reaction.message.partial) await reaction.message.fetch();
            if (reaction.partial) await reaction.fetch();
            
            const message = reaction.message;
            const channel = message.channel;
            
            // Check if in monitored category
            const inCategory = await isInMonitoredCategory(channel);
            if (!inCategory) return;
            
            // Connect to database
            await connectToTinglebot();
            
            // Handle based on emoji
            const emoji = reaction.emoji.name;
            
            if (emoji === PIN_EMOJI) {
                await handlePinReaction(reaction, user, client);
            } else if (emoji === COMPLETE_EMOJI) {
                await handleCompleteReaction(reaction, user, client);
            }
            
        } catch (error) {
            logger.error('MOD_TODO', `Error handling reaction: ${error.message}`);
            console.error('[modTodoReactionHandler.js]:', error);
        }
    });
    
    logger.info('SYSTEM', 'Mod Todo reaction handler initialized');
};

module.exports = {
    initializeModTodoReactionHandler,
    MOD_TODO_CATEGORY_ID
};
