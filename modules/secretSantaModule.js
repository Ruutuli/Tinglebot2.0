// ============================================================================
// ------------------- Secret Santa Module -------------------
// Core logic for Roots-themed Secret Santa art gift exchange
// ============================================================================

const { connectToTinglebot } = require('../database/db');
const {
  SecretSantaParticipant,
  SecretSantaMatch,
  TempSignupData,
  SecretSantaSettings
} = require('../models/SecretSantaModel');
const logger = require('../utils/logger');

// ============================================================================
// ------------------- Storage Utilities -------------------
// ============================================================================

// ------------------- Function: loadSecretSantaData -------------------
async function loadSecretSantaData() {
  await connectToTinglebot();
  
  const participants = await SecretSantaParticipant.find().lean();
  const matches = await SecretSantaMatch.find().lean();
  const settings = await SecretSantaSettings.getSettings();
  
  return {
    participants,
    matches,
    settings
  };
}

// ------------------- Function: saveParticipant -------------------
async function saveParticipant(participantData) {
  await connectToTinglebot();
  
  const participant = await SecretSantaParticipant.findOneAndUpdate(
    { userId: participantData.userId },
    participantData,
    { new: true, upsert: true }
  );
  
  return participant;
}

// ------------------- Function: getParticipant -------------------
async function getParticipant(userId) {
  await connectToTinglebot();
  return await SecretSantaParticipant.findOne({ userId }).lean();
}

// ------------------- Function: removeParticipant -------------------
async function removeParticipant(userId) {
  await connectToTinglebot();
  
  // Remove participant and their matches
  await SecretSantaParticipant.deleteOne({ userId });
  await SecretSantaMatch.deleteMany({ 
    $or: [{ santaId: userId }, { gifteeId: userId }] 
  });
  
  return true;
}

// ------------------- Function: savePendingMatches -------------------
async function savePendingMatches(matches) {
  await connectToTinglebot();
  
  // Delete existing pending matches
  await SecretSantaMatch.deleteMany({ isPending: true });
  
  // Save new pending matches
  const matchDocs = matches.map(match => ({
    santaId: match.santaId,
    gifteeId: match.gifteeId,
    matchedAt: new Date(match.matchedAt || Date.now()),
    isPending: true
  }));
  
  await SecretSantaMatch.insertMany(matchDocs);
  return true;
}

// ------------------- Function: approveMatches -------------------
async function approveMatches() {
  await connectToTinglebot();
  
  // Convert pending matches to approved
  await SecretSantaMatch.updateMany(
    { isPending: true },
    { $set: { isPending: false } }
  );
  
  // Update participant records
  const matches = await SecretSantaMatch.find({ isPending: false }).lean();
  for (const match of matches) {
    await SecretSantaParticipant.updateOne(
      { userId: match.santaId },
      { 
        $set: { 
          matchedWith: match.gifteeId,
          receivedAssignment: false 
        } 
      }
    );
  }
  
  // Update settings
  const settings = await SecretSantaSettings.getSettings();
  settings.matched = true;
  settings.matchedAt = new Date();
  settings.matchesApproved = true;
  await settings.save();
  
  return true;
}

// ------------------- Function: getPendingMatches -------------------
async function getPendingMatches() {
  await connectToTinglebot();
  return await SecretSantaMatch.find({ isPending: true }).lean();
}

// ------------------- Function: updateSettings -------------------
async function updateSettings(updateData) {
  await connectToTinglebot();
  const settings = await SecretSantaSettings.getSettings();
  
  Object.assign(settings, updateData);
  await settings.save();
  
  return settings;
}

// ------------------- Function: setTempSignupData -------------------
async function setTempSignupData(userId, data) {
  await connectToTinglebot();
  
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
  
  await TempSignupData.findOneAndUpdate(
    { userId },
    { ...data, expiresAt },
    { upsert: true }
  );
  
  return true;
}

// ------------------- Function: getTempSignupData -------------------
async function getTempSignupData(userId) {
  await connectToTinglebot();
  const tempData = await TempSignupData.findOne({ userId }).lean();
  return tempData;
}

// ------------------- Function: markAssignmentReceived -------------------
async function markAssignmentReceived(userId) {
  await connectToTinglebot();
  await SecretSantaParticipant.updateOne(
    { userId },
    { $set: { receivedAssignment: true } }
  );
}

// ============================================================================
// ------------------- Matching Logic -------------------
// ============================================================================

// ------------------- Function: matchParticipants -------------------
async function matchParticipants(client, sendDMs = true) {
  const data = await loadSecretSantaData();
  
  // Filter out substitutes who are only substitutes (not participating)
  const participants = data.participants.filter(p =>
    p &&
    p.userId &&
    p.isSubstitute !== 'only_sub' &&
    Array.isArray(p.characterLinks) &&
    p.characterLinks.length > 0
  );
  
  const substitutes = data.participants.filter(p => 
    p && (p.isSubstitute === 'yes' || p.isSubstitute === 'only_sub')
  );
  
  if (participants.length < 2) {
    logger.warn('SECRET_SANTA', `Not enough participants to match (need at least 2, found ${participants.length})`);
    return { success: false, message: `Not enough participants to match (need at least 2, found ${participants.length})` };
  }
  
  // Create a copy of participants for matching
  const availableGiftees = [...participants];
  const matches = [];
  const matchedGifteeIds = new Set();
  
  // Shuffle participants for random matching
  const shuffledSantas = [...participants].sort(() => Math.random() - 0.5);
  
  for (const santa of shuffledSantas) {
    // Find a compatible giftee
    let giftee = undefined;
    
    // Filter out:
    // 1. Themselves
    // 2. Already matched giftees
    // 3. Members they want to avoid
    // 4. People who want to avoid them (check if santa is in their avoid list)
    const compatibleGiftees = availableGiftees.filter(g => {
      // Can't be matched with themselves
      if (g.userId === santa.userId) return false;
      
      // Already matched
      if (matchedGifteeIds.has(g.userId)) return false;
      
      // Check if santa wants to avoid this giftee
      if (santa.membersToAvoid && santa.membersToAvoid.some(name =>
        g.discordName.toLowerCase().includes(name.toLowerCase()) ||
        g.username.toLowerCase().includes(name.toLowerCase())
      )) {
        return false;
      }
      
      // Check if giftee wants to avoid this santa
      if (g.membersToAvoid && g.membersToAvoid.some(name =>
        santa.discordName.toLowerCase().includes(name.toLowerCase()) ||
        santa.username.toLowerCase().includes(name.toLowerCase())
      )) {
        return false;
      }
      
      return true;
    });
    
    if (compatibleGiftees.length === 0) {
      logger.warn('SECRET_SANTA', `No compatible giftee found for ${santa.username}`);
      // Try fallback - ignore avoid lists
      const fallbackGiftees = availableGiftees.filter(g => {
        if (g.userId === santa.userId) return false;
        if (matchedGifteeIds.has(g.userId)) return false;
        return true;
      });
      
      if (fallbackGiftees.length > 0) {
        giftee = fallbackGiftees[Math.floor(Math.random() * fallbackGiftees.length)];
        logger.warn('SECRET_SANTA', `Using fallback match for ${santa.username} (avoided members check skipped)`);
      }
    } else {
      // Pick a random compatible giftee
      giftee = compatibleGiftees[Math.floor(Math.random() * compatibleGiftees.length)];
    }
    
    if (giftee) {
      matches.push({
        santaId: santa.userId,
        gifteeId: giftee.userId,
        matchedAt: new Date().toISOString(),
      });
      matchedGifteeIds.add(giftee.userId);
    } else {
      logger.error('SECRET_SANTA', `Could not find a match for ${santa.username}`);
    }
  }
  
  // Handle any unmatched participants
  const matchedSantaIds = new Set(matches.map(m => m.santaId));
  const unmatched = participants.filter(p => !matchedSantaIds.has(p.userId));
  
  if (unmatched.length > 0) {
    logger.warn('SECRET_SANTA', `${unmatched.length} participant(s) could not be matched:`, unmatched.map(u => u.username || u.userId));
  }
  
  // Validate no duplicate santas or giftees
  const santaIds = new Set(matches.map(m => m.santaId));
  const gifteeIds = new Set(matches.map(m => m.gifteeId));
  
  if (santaIds.size !== matches.length) {
    logger.error('SECRET_SANTA', 'Duplicate santas found in matches!');
    return { success: false, message: 'Duplicate santas found in matches!' };
  }
  
  if (gifteeIds.size !== matches.length) {
    logger.error('SECRET_SANTA', 'Duplicate giftees found in matches!');
    return { success: false, message: 'Duplicate giftees found in matches!' };
  }
  
  // Save matches as pending (waiting for approval)
  await savePendingMatches(matches);
  
  if (sendDMs) {
    // Send DMs to all matched participants
    await sendAssignmentDMs(client);
  }
  
  logger.success('SECRET_SANTA', `Matched ${matches.length} participants${sendDMs ? ' and sent DMs' : ' (pending approval)'}`);
  return { success: true, matches, unmatched };
}

// ============================================================================
// ------------------- DM Assignment System -------------------
// ============================================================================

const BORDER_IMAGE = 'https://storage.googleapis.com/tinglebot/Graphics/border.png';

// ------------------- Function: sendAssignmentDMs -------------------
async function sendAssignmentDMs(client) {
  const data = await loadSecretSantaData();
  const matches = await SecretSantaMatch.find({ isPending: false }).lean();
  
  if (matches.length === 0) {
    logger.warn('SECRET_SANTA', 'No approved matches found to send DMs');
    return;
  }
  
  for (const match of matches) {
    const santa = await SecretSantaParticipant.findOne({ userId: match.santaId }).lean();
    const giftee = await SecretSantaParticipant.findOne({ userId: match.gifteeId }).lean();
    
    if (!santa || !giftee) {
      logger.error('SECRET_SANTA', `Missing participant data for match: santa=${match.santaId}, giftee=${match.gifteeId}`);
      continue;
    }
    
    try {
      const user = await client.users.fetch(santa.userId);
      
      const { EmbedBuilder } = require('discord.js');
      const embed = new EmbedBuilder()
        .setTitle('🎁 Roots Secret Santa Assignment!')
        .setDescription(`**You have been assigned a giftee for the Roots Secret Santa!**\n\nUse the information below to create art for your giftee.\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
        .setImage(BORDER_IMAGE)
        .setColor(0x00AE86)
        .addFields(
          { name: '👤 Your Giftee', value: `**${giftee.discordName}**`, inline: false },
          { name: '🔗 Character Links', value: giftee.characterLinks && giftee.characterLinks.length > 0 ? giftee.characterLinks.map((link) => `• ${link}`).join('\n') : '*None*', inline: false }
        )
        .setTimestamp();
      
      if (giftee.preferredCharacterRequests) {
        embed.addFields({
          name: '✨ Preferred Character Requests',
          value: giftee.preferredCharacterRequests,
          inline: false,
        });
      }
      
      if (giftee.otherCharacterRequests) {
        embed.addFields({
          name: '💭 Other Character Requests',
          value: giftee.otherCharacterRequests,
          inline: false,
        });
      }
      
      if (giftee.contentToAvoid) {
        embed.addFields({
          name: '⚠️ Content to Avoid',
          value: giftee.contentToAvoid,
          inline: false,
        });
      }
      
      if (giftee.membersToAvoid && giftee.membersToAvoid.length > 0) {
        embed.addFields({
          name: '🚫 Members to Avoid',
          value: giftee.membersToAvoid.map((name) => `• ${name}`).join('\n'),
          inline: false,
        });
      }
      
      const submissionDeadline = new Date(data.settings.submissionDeadline);
      embed.addFields({
        name: '📅 Important Dates',
        value: `**Submission Deadline:**\n<t:${Math.floor(submissionDeadline.getTime() / 1000)}:R> • <t:${Math.floor(submissionDeadline.getTime() / 1000)}:F>\n*11:59 PM EST*\n\n` +
          `Send your gift art **DIRECTLY** to your giftee between **December 24th** and **January 14th at 11:59 PM EST**!\n` +
          `If you can't make the deadline, inform us by the **first week of January**.`,
        inline: false,
      });
      
      embed.addFields({
        name: '🎨 Gift Requirements',
        value: `**Art Gifts:**\n• At least one requested character\n• Lined with flat colors\n• Full body or bust, background optional\n• Intentional stylization is acceptable`,
        inline: false,
      });
      
      embed.addFields({
        name: '🔒 Keep It Secret!',
        value: `**Don't tell anyone who you are drawing for - it's a secret!** 🤫`,
        inline: false,
      });
      
      await user.send({ embeds: [embed] });
      await markAssignmentReceived(santa.userId);
      logger.success('SECRET_SANTA', `Sent assignment DM to ${santa.username || santa.userId}`);
    } catch (error) {
      // Handle specific Discord errors
      if (error.code === 50007) {
        logger.error('SECRET_SANTA', `Cannot send DM to ${santa.username || santa.userId}: User has DMs disabled`);
        
        // Send notification to logging channel
        await sendDMFailureNotification(client, santa, giftee, 'DMs disabled');
      } else {
        logger.error('SECRET_SANTA', `Error sending DM to ${santa.username || santa.userId}:`, error.message || error);
        
        // Send notification to logging channel
        await sendDMFailureNotification(client, santa, giftee, error.message || 'Unknown error');
      }
    }
  }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// ============================================================================

// ------------------- Function: sendDMFailureNotification -------------------
async function sendDMFailureNotification(client, santa, giftee, reason) {
  try {
    const LOG_CHANNEL_ID = process.env.MOD_LOG_CHANNEL_ID || process.env.MOD_LOG_CHANNEL || process.env.CONSOLE_LOG_CHANNEL;
    if (!LOG_CHANNEL_ID) {
      logger.warn('SECRET_SANTA', 'No logging channel configured for DM failures');
      return;
    }
    
    const channel = await client.channels.fetch(LOG_CHANNEL_ID);
    if (!channel) {
      logger.warn('SECRET_SANTA', `Logging channel ${LOG_CHANNEL_ID} not found`);
      return;
    }
    
    const { EmbedBuilder } = require('discord.js');
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Secret Santa DM Failure')
      .setDescription(`**Could not send assignment DM to Secret Santa**`)
      .setImage(BORDER_IMAGE)
      .setColor(0xFF0000)
      .addFields(
        { name: '🎅 Secret Santa', value: `${santa.discordName} (${santa.username})`, inline: false },
        { name: '🎁 Giftee', value: `${giftee.discordName} (${giftee.username})`, inline: false },
        { name: '❌ Reason', value: reason, inline: false },
        { name: '💡 Action Required', value: 'Please manually DM this user their assignment.', inline: false }
      )
      .setTimestamp();
    
    await channel.send({ embeds: [embed] });
  } catch (error) {
    logger.error('SECRET_SANTA', `Error sending DM failure notification: ${error.message}`);
  }
}

// ------------------- Function: isBlacklisted -------------------
async function isBlacklisted(userId, username, discordName) {
  const data = await loadSecretSantaData();
  const blacklist = data.settings.blacklistedUsers || [];
  
  // Default blacklist from last year
  const defaultBlacklist = ['bogoro', 'ellowwell'];
  
  // Check against all blacklists
  const allBlacklisted = [...defaultBlacklist, ...blacklist];
  
  // Check userId, username, and discordName
  const userIdentifier = userId?.toLowerCase();
  const usernameLower = username?.toLowerCase();
  const discordNameLower = discordName?.toLowerCase();
  
  return allBlacklisted.some(blacklisted => {
    const blacklistedLower = blacklisted.toLowerCase();
    return userIdentifier === blacklistedLower || 
           usernameLower === blacklistedLower || 
           discordNameLower === blacklistedLower ||
           usernameLower?.includes(blacklistedLower) ||
           discordNameLower?.includes(blacklistedLower);
  });
}

// ============================================================================
// ------------------- Scheduler Functions -------------------
// ============================================================================

// ------------------- Function: checkDeadlineAndMatch -------------------
async function checkDeadlineAndMatch(client) {
  const data = await loadSecretSantaData();
  const now = new Date();
  
  // Check if signup deadline has passed - only close signups, don't auto-match
  if (now >= data.settings.signupDeadline && data.settings.signupsOpen && !data.settings.matched) {
    logger.info('SECRET_SANTA', 'Signup deadline passed, closing signups (manual matching required)');
    
    await updateSettings({ signupsOpen: false });
  }
}

// ------------------- Function: sendReminders -------------------
async function sendReminders(client) {
  const data = await loadSecretSantaData();
  const now = new Date();
  const submissionDeadline = new Date(data.settings.submissionDeadline);
  const daysUntilDeadline = Math.ceil((submissionDeadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  // Send reminders at 30, 14, 7, 3, 1, and 0 days before deadline
  const reminderDays = [30, 14, 7, 3, 1, 0];
  
  if (reminderDays.includes(daysUntilDeadline) && data.settings.matchesApproved) {
    logger.info('SECRET_SANTA', `Sending reminder: ${daysUntilDeadline} days until submission deadline`);
    
    // Send reminder DMs to all participants who have assignments
    const participants = await SecretSantaParticipant.find({ 
      matchedWith: { $ne: null } 
    }).lean();
    
    for (const participant of participants) {
      try {
        const user = await client.users.fetch(participant.userId);
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
          .setTitle('⏰ Roots Secret Santa Reminder')
          .setDescription(`**${daysUntilDeadline} day${daysUntilDeadline !== 1 ? 's' : ''} until the submission deadline!**`)
          .setImage(BORDER_IMAGE)
          .setColor(0x00AE86)
          .addFields({
            name: '📅 Deadline',
            value: `<t:${Math.floor(submissionDeadline.getTime() / 1000)}:F>`,
            inline: false
          })
          .addFields({
            name: '💡 Remember',
            value: `• Send your gift art directly to your giftee\n• If you can't make the deadline, inform us by the first week of January\n• Keep it secret!`,
            inline: false
          })
          .setTimestamp();
        
        await user.send({ embeds: [embed] });
      } catch (error) {
        if (error.code !== 50007) {
          logger.error('SECRET_SANTA', `Error sending reminder to ${participant.userId}:`, error.message);
        }
      }
    }
  }
}

// ------------------- Function: setupSecretSantaScheduler -------------------
function setupSecretSantaScheduler(client) {
  // Check for deadline matching every hour
  setInterval(async () => {
    try {
      await checkDeadlineAndMatch(client);
    } catch (error) {
      logger.error('SECRET_SANTA', 'Error in deadline check:', error);
    }
  }, 60 * 60 * 1000); // 1 hour
  
  // Send reminders once per day
  setInterval(async () => {
    try {
      await sendReminders(client);
    } catch (error) {
      logger.error('SECRET_SANTA', 'Error sending reminders:', error);
    }
  }, 24 * 60 * 60 * 1000); // 24 hours
  
  // Also check immediately on startup (after a delay to ensure MongoDB is ready)
  setTimeout(async () => {
    try {
      await checkDeadlineAndMatch(client);
      await sendReminders(client);
    } catch (error) {
      logger.error('SECRET_SANTA', 'Error in startup Secret Santa check:', error);
    }
  }, 10000); // 10 seconds after startup
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
  loadSecretSantaData,
  saveParticipant,
  getParticipant,
  removeParticipant,
  savePendingMatches,
  approveMatches,
  getPendingMatches,
  updateSettings,
  setTempSignupData,
  getTempSignupData,
  markAssignmentReceived,
  matchParticipants,
  sendAssignmentDMs,
  checkDeadlineAndMatch,
  sendReminders,
  setupSecretSantaScheduler,
  isBlacklisted
};

