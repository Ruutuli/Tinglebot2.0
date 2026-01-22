// ============================================================================
// ------------------- Audit Service -------------------
// Wrapper around AuditLogModel for OC application workflow logging
// ============================================================================

const AuditLog = require('../models/AuditLogModel');
const User = require('../models/UserModel');
const logger = require('../utils/logger');
const { connectToTinglebot } = require('../database/db');

/**
 * Log an OC workflow action
 * @param {string} entityType - 'character' or 'application'
 * @param {string} entityId - Character/application ID
 * @param {number} version - Application version (optional)
 * @param {string} action - 'vote', 'vote_changed', 'decision', 'feedback_sent', 'resubmitted'
 * @param {string} actorId - Discord ID of the actor
 * @param {object} payload - Action-specific data
 * @returns {Promise<Object>} - Created audit log entry
 */
async function logOCAction(entityType, entityId, version, action, actorId, payload = {}) {
  try {
    await connectToTinglebot();

    // Get or create user for audit log
    let user = await User.findOne({ discordId: actorId });
    if (!user) {
      // Create minimal user record for audit log
      user = new User({
        discordId: actorId,
        username: payload.modUsername || actorId,
        characterSlot: 0
      });
      await user.save();
    }

    // Create audit log entry
    const auditLog = new AuditLog({
      adminUserId: user._id,
      adminUsername: user.username || payload.modUsername || actorId,
      adminDiscordId: actorId,
      action: action,
      modelName: entityType === 'character' ? 'Character' : 'OCApplication',
      recordId: entityId,
      recordName: payload.characterName || payload.name || null,
      applicationVersion: version || null,
      changes: payload,
      timestamp: new Date()
    });

    await auditLog.save();

    logger.info('AUDIT', `Logged OC action: ${action} on ${entityType} ${entityId} by ${user.username || actorId}`);

    return auditLog;
  } catch (error) {
    logger.error('AUDIT', 'Error logging OC action', error);
    // Don't throw - audit logging failure shouldn't break workflow
    return null;
  }
}

/**
 * Get audit logs for an entity
 * @param {string} entityType - 'character' or 'application'
 * @param {string} entityId - Character/application ID
 * @param {number} version - Application version (optional)
 * @returns {Promise<Array>} - Array of audit log entries
 */
async function getOCAuditLog(entityType, entityId, version = null) {
  try {
    await connectToTinglebot();

    const query = {
      modelName: entityType === 'character' ? 'Character' : 'OCApplication',
      recordId: entityId
    };

    if (version !== null) {
      query.applicationVersion = version;
    }

    const logs = await AuditLog.find(query)
      .sort({ timestamp: -1 })
      .lean();

    return logs;
  } catch (error) {
    logger.error('AUDIT', 'Error getting OC audit log', error);
    throw error;
  }
}

/**
 * Log a vote action
 * @param {string} characterId - Character ID
 * @param {number} version - Application version
 * @param {string} modId - Moderator Discord ID
 * @param {string} modUsername - Moderator username
 * @param {string} decision - 'approve', 'deny', 'needs_changes'
 * @param {string} note - Optional note
 * @returns {Promise<Object>} - Audit log entry
 */
async function logVote(characterId, version, modId, modUsername, decision, note = null) {
  return logOCAction(
    'character',
    characterId,
    version,
    'vote',
    modId,
    {
      characterName: null, // Will be filled from character if needed
      modUsername,
      decision,
      note
    }
  );
}

/**
 * Log a vote change
 * @param {string} characterId - Character ID
 * @param {number} version - Application version
 * @param {string} modId - Moderator Discord ID
 * @param {string} modUsername - Moderator username
 * @param {string} oldDecision - Previous vote
 * @param {string} newDecision - New vote
 * @returns {Promise<Object>} - Audit log entry
 */
async function logVoteChange(characterId, version, modId, modUsername, oldDecision, newDecision) {
  return logOCAction(
    'character',
    characterId,
    version,
    'vote_changed',
    modId,
    {
      modUsername,
      oldDecision,
      newDecision
    }
  );
}

/**
 * Log a decision (approval or needs changes)
 * @param {string} characterId - Character ID
 * @param {number} version - Application version
 * @param {string} decision - 'approved' or 'needs_changes'
 * @param {string} actorId - Discord ID of the system/moderator
 * @param {object} details - Decision details
 * @returns {Promise<Object>} - Audit log entry
 */
async function logDecision(characterId, version, decision, actorId, details = {}) {
  return logOCAction(
    'character',
    characterId,
    version,
    'decision',
    actorId,
    {
      decision,
      ...details
    }
  );
}

/**
 * Log feedback sent to user
 * @param {string} characterId - Character ID
 * @param {number} version - Application version
 * @param {string} actorId - Discord ID of the system/moderator
 * @param {string} feedback - Feedback text
 * @returns {Promise<Object>} - Audit log entry
 */
async function logFeedbackSent(characterId, version, actorId, feedback) {
  return logOCAction(
    'character',
    characterId,
    version,
    'feedback_sent',
    actorId,
    {
      feedback
    }
  );
}

/**
 * Log resubmission
 * @param {string} characterId - Character ID
 * @param {number} oldVersion - Previous version
 * @param {number} newVersion - New version
 * @param {string} userId - User Discord ID
 * @returns {Promise<Object>} - Audit log entry
 */
async function logResubmission(characterId, oldVersion, newVersion, userId) {
  return logOCAction(
    'character',
    characterId,
    newVersion,
    'resubmitted',
    userId,
    {
      oldVersion,
      newVersion
    }
  );
}

module.exports = {
  logOCAction,
  getOCAuditLog,
  logVote,
  logVoteChange,
  logDecision,
  logFeedbackSent,
  logResubmission
};
