// ============================================================================
// ------------------- Reminder Service -------------------
// Handles 24-hour reminders for pending OC applications
// ============================================================================

const Character = require('../models/CharacterModel');
const logger = require('../utils/logger');
const { connectToTinglebot } = require('../database/db');

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const ADMIN_REVIEW_CHANNEL_ID = process.env.ADMIN_REVIEW_CHANNEL_ID || process.env.CHARACTER_CREATION_CHANNEL_ID;
const MOD_ROLE_ID = process.env.MOD_ROLE_ID; // Optional role to mention


/**
 * Check for pending characters that need reminders (>24h without decision)
 * @returns {Promise<Array>} - Array of characters that need reminders
 */
async function checkPendingCharacters() {
  try {
    await connectToTinglebot();

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Find characters that:
    // 1. Are pending (status: 'pending')
    // 2. Were submitted more than 24 hours ago
    // 3. Haven't had a reminder sent in the last 24 hours (or never)
    const pendingCharacters = await Character.find({
      status: 'pending',
      submittedAt: { $lte: twentyFourHoursAgo },
      $or: [
        { reminderLastSentAt: { $exists: false } },
        { reminderLastSentAt: { $lte: twentyFourHoursAgo } }
      ]
    }).lean();

    logger.info('REMINDER', `Found ${pendingCharacters.length} pending characters needing reminders`);

    return pendingCharacters;
  } catch (error) {
    logger.error('REMINDER', 'Error checking pending characters', error);
    throw error;
  }
}

/**
 * Send reminder for a pending character
 * @param {Object} character - Character document
 * @returns {Promise<boolean>} - Success status
 */
async function sendReminder(character) {
  try {
    if (!DISCORD_TOKEN) {
      logger.warn('REMINDER', 'DISCORD_TOKEN not configured, skipping reminder');
      return false;
    }

    const channelId = character.discordThreadId || ADMIN_REVIEW_CHANNEL_ID;
    if (!channelId) {
      logger.warn('REMINDER', `No channel/thread ID for reminder: ${character.name}`);
      return false;
    }

    // Calculate hours pending
    const submittedAt = character.submittedAt ? new Date(character.submittedAt) : new Date();
    const hoursPending = Math.floor((Date.now() - submittedAt.getTime()) / (1000 * 60 * 60));

    // Get vote counts
    const CharacterModeration = require('../models/CharacterModerationModel');
    const applicationVersion = character.applicationVersion || 1;
    
    const approveCount = await CharacterModeration.countDocuments({
      characterId: character._id,
      applicationVersion: applicationVersion,
      vote: 'approve'
    });
    
    const needsChangesCount = await CharacterModeration.countDocuments({
      characterId: character._id,
      applicationVersion: applicationVersion,
      vote: 'needs_changes'
    });

    const ocPageSlug = character.publicSlug || character.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const dashboardUrl = (process.env.DASHBOARD_URL || 'https://tinglebot.xyz').replace(/\/+$/, '');
    const moderationUrl = `${dashboardUrl}/character-moderation`;

    let content = `⏰ **24-Hour Reminder**\n\n`;
    if (MOD_ROLE_ID) {
      content += `<@&${MOD_ROLE_ID}> `;
    }
    content += `**${character.name}** (v${applicationVersion}) has been pending for **${hoursPending} hours**.\n\n`;
    content += `**Vote Status:**\n✅ Approves: ${approveCount}/4\n⚠️ Needs Changes: ${needsChangesCount}\n\n`;
    content += `[Review in Moderation Panel](${moderationUrl})`;

    const embed = {
      title: `⏰ Reminder: ${character.name} (v${applicationVersion})`,
      description: `This application has been pending for ${hoursPending} hours.`,
      color: 0xFFA500, // Orange
      fields: [
        {
          name: '📊 Current Votes',
          value: `✅ Approves: ${approveCount}/4\n⚠️ Needs Changes: ${needsChangesCount}`,
          inline: false
        },
        {
          name: '🔗 Links',
          value: `[Moderation Panel](${moderationUrl})`,
          inline: false
        }
      ],
      footer: {
        text: `Submitted: ${submittedAt.toLocaleDateString()} • ${hoursPending} hours ago`
      },
      timestamp: new Date().toISOString()
    };

    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: content,
        embeds: [embed]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('REMINDER', `Failed to send reminder: ${response.status} - ${errorText}`);
      return false;
    }

    // Update reminder timestamp
    await Character.findByIdAndUpdate(character._id, {
      reminderLastSentAt: new Date()
    });

    logger.success('REMINDER', `Sent reminder for ${character.name} (v${applicationVersion})`);
    return true;
  } catch (error) {
    logger.error('REMINDER', 'Error sending reminder', error);
    return false;
  }
}

/**
 * Process all pending reminders
 * @returns {Promise<object>} - Stats about reminders sent
 */
async function processReminders() {
  try {
    const pendingCharacters = await checkPendingCharacters();
    
    let successCount = 0;
    let failCount = 0;

    for (const character of pendingCharacters) {
      const success = await sendReminder(character);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    logger.info('REMINDER', `Processed reminders: ${successCount} successful, ${failCount} failed`);

    return {
      total: pendingCharacters.length,
      success: successCount,
      failed: failCount
    };
  } catch (error) {
    logger.error('REMINDER', 'Error processing reminders', error);
    throw error;
  }
}


module.exports = {
  checkPendingCharacters,
  sendReminder,
  processReminders
};
