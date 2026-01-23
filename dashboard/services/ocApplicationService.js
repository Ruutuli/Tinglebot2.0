// ============================================================================
// ------------------- OC Application Service -------------------
// Core workflow logic for character application approval system
// ============================================================================

const Character = require('../models/CharacterModel');
const CharacterModeration = require('../models/CharacterModerationModel');
const logger = require('../utils/logger');
const { connectToTinglebot } = require('../database/db');

// Constants
const APPROVAL_THRESHOLD = 4; // Number of approve votes required
const NEEDS_CHANGES_THRESHOLD = 1; // Fast fail: 1 needs_changes vote triggers denial

/**
 * Submit character for review (move from DRAFT to PENDING)
 * @param {string} characterId - Character ID
 * @returns {Promise<Object>} - Updated character
 */
async function submitCharacter(characterId) {
  try {
    await connectToTinglebot();
    
    const character = await Character.findById(characterId);
    if (!character) {
      throw new Error(`Character not found: ${characterId}`);
    }
    
    // Check if already submitted
    if (character.status === 'pending') {
      throw new Error('Character is already pending review');
    }
    
    // Can only submit from DRAFT state (status: null)
    if (character.status !== null && character.status !== undefined) {
      throw new Error(`Cannot submit character with status: ${character.status}`);
    }
    
    // Set to PENDING
    character.status = 'pending';
    character.submittedAt = new Date();
    character.applicationVersion = character.applicationVersion || 1;
    
    await character.save();
    
    logger.info('OC_APPLICATION', `Character ${character.name} submitted for review (v${character.applicationVersion})`);
    
    return character;
  } catch (error) {
    logger.error('OC_APPLICATION', 'Error submitting character', error);
    throw error;
  }
}

/**
 * Record a mod vote on a character application
 * @param {string} characterId - Character ID
 * @param {string} modId - Moderator Discord ID
 * @param {string} modUsername - Moderator username
 * @param {string} decision - 'approve', 'deny', or 'needs_changes'
 * @param {string} note - Optional feedback note
 * @returns {Promise<Object>} - Vote record and updated counts
 */
async function recordVote(characterId, modId, modUsername, decision, note = null) {
  try {
    await connectToTinglebot();
    
    const character = await Character.findById(characterId);
    if (!character) {
      throw new Error(`Character not found: ${characterId}`);
    }
    
    // Can only vote on pending characters
    if (character.status !== 'pending') {
      throw new Error(`Cannot vote on character with status: ${character.status}`);
    }
    
    const applicationVersion = character.applicationVersion || 1;
    
    // Check if mod has already voted on this version
    const existingVote = await CharacterModeration.findOne({
      characterId: characterId,
      modId: modId,
      applicationVersion: applicationVersion
    });
    
    if (existingVote) {
      // Update existing vote
      const oldDecision = existingVote.vote;
      existingVote.vote = decision;
      existingVote.reason = (decision === 'needs_changes') ? note : null;
      existingVote.note = note;
      existingVote.updatedAt = new Date();
      await existingVote.save();
      
      logger.info('OC_APPLICATION', `Mod ${modUsername} changed vote from ${oldDecision} to ${decision} for ${character.name}`);
    } else {
      // Create new vote
      const vote = new CharacterModeration({
        characterId: characterId,
        characterName: character.name,
        userId: character.userId,
        modId: modId,
        modUsername: modUsername,
        vote: decision,
        reason: (decision === 'needs_changes') ? note : null,
        note: note,
        applicationVersion: applicationVersion
      });
      await vote.save();
      
      logger.info('OC_APPLICATION', `Mod ${modUsername} voted ${decision} for ${character.name}`);
    }
    
    // Get current vote counts
    const approveCount = await CharacterModeration.countDocuments({
      characterId: characterId,
      applicationVersion: applicationVersion,
      vote: 'approve'
    });
    
    const needsChangesCount = await CharacterModeration.countDocuments({
      characterId: characterId,
      applicationVersion: applicationVersion,
      vote: 'needs_changes'
    });
    
    return {
      vote: existingVote || await CharacterModeration.findOne({
        characterId: characterId,
        modId: modId,
        applicationVersion: applicationVersion
      }),
      counts: {
        approves: approveCount,
        needsChanges: needsChangesCount
      }
    };
  } catch (error) {
    logger.error('OC_APPLICATION', 'Error recording vote', error);
    throw error;
  }
}

/**
 * Check if a decision has been reached (4 approves or 1 needs_changes)
 * @param {string} characterId - Character ID
 * @returns {Promise<Object|null>} - Decision object if reached, null otherwise
 */
async function checkDecision(characterId) {
  try {
    await connectToTinglebot();
    
    const character = await Character.findById(characterId);
    if (!character) {
      throw new Error(`Character not found: ${characterId}`);
    }
    
    if (character.status !== 'pending') {
      return null; // Already decided
    }
    
    const applicationVersion = character.applicationVersion || 1;
    
    const approveCount = await CharacterModeration.countDocuments({
      characterId: characterId,
      applicationVersion: applicationVersion,
      vote: 'approve'
    });
    
    const needsChangesCount = await CharacterModeration.countDocuments({
      characterId: characterId,
      applicationVersion: applicationVersion,
      vote: 'needs_changes'
    });
    
    // Fast fail: 1 needs_changes triggers immediate denial
    if (needsChangesCount >= NEEDS_CHANGES_THRESHOLD) {
      return {
        decision: 'needs_changes',
        reason: 'Fast fail: One or more moderators requested changes'
      };
    }
    
    // Approval: 4 approves required
    if (approveCount >= APPROVAL_THRESHOLD) {
      return {
        decision: 'approved',
        reason: `Received ${approveCount} approval(s)`
      };
    }
    
    return null; // No decision yet
  } catch (error) {
    logger.error('OC_APPLICATION', 'Error checking decision', error);
    throw error;
  }
}

/**
 * Process approval decision
 * @param {string} characterId - Character ID
 * @returns {Promise<Object>} - Updated character
 */
async function processApproval(characterId) {
  try {
    await connectToTinglebot();
    
    const character = await Character.findById(characterId);
    if (!character) {
      throw new Error(`Character not found: ${characterId}`);
    }
    
    character.status = 'accepted';
    character.decidedAt = new Date();
    character.approvedAt = new Date();
    
    await character.save();
    
    logger.success('OC_APPLICATION', `Character ${character.name} approved (v${character.applicationVersion})`);
    
    return character;
  } catch (error) {
    logger.error('OC_APPLICATION', 'Error processing approval', error);
    throw error;
  }
}

/**
 * Process needs changes decision
 * @param {string} characterId - Character ID
 * @param {string} feedback - Feedback text
 * @returns {Promise<Object>} - Updated character with feedback
 */
async function processNeedsChanges(characterId, feedback) {
  try {
    await connectToTinglebot();
    
    const character = await Character.findById(characterId);
    if (!character) {
      throw new Error(`Character not found: ${characterId}`);
    }
    
    // Get all needs_changes votes for feedback
    const applicationVersion = character.applicationVersion || 1;
    const needsChangesVotes = await CharacterModeration.find({
      characterId: characterId,
      applicationVersion: applicationVersion,
      vote: 'needs_changes'
    }).lean();
    
    // Aggregate feedback from all mods who voted needs_changes
    const feedbackArray = needsChangesVotes.map(vote => ({
      modId: vote.modId,
      modUsername: vote.modUsername,
      text: vote.note || vote.reason || 'Changes requested',
      createdAt: vote.createdAt || new Date()
    }));
    
    character.status = 'denied';
    character.decidedAt = new Date();
    character.applicationFeedback = feedbackArray;
    character.denialReason = feedback || needsChangesVotes.map(v => v.note || v.reason).join('\n\n');
    
    await character.save();
    
    logger.info('OC_APPLICATION', `Character ${character.name} marked as needs changes (v${character.applicationVersion})`);
    
    return character;
  } catch (error) {
    logger.error('OC_APPLICATION', 'Error processing needs changes', error);
    throw error;
  }
}

/**
 * Resubmit character after needs changes (increment version, reset votes)
 * @param {string} characterId - Character ID
 * @returns {Promise<Object>} - Updated character
 */
async function resubmitCharacter(characterId) {
  try {
    await connectToTinglebot();
    
    const character = await Character.findById(characterId);
    if (!character) {
      throw new Error(`Character not found: ${characterId}`);
    }
    
    // Can only resubmit if status is 'denied' (needs changes)
    if (character.status !== 'denied') {
      throw new Error(`Cannot resubmit character with status: ${character.status}`);
    }
    
    // Increment version
    character.applicationVersion = (character.applicationVersion || 1) + 1;
    
    // Delete all old votes for this character (they're tied to old version)
    await CharacterModeration.deleteMany({ characterId: characterId });
    
    // Reset to PENDING
    character.status = 'pending';
    character.submittedAt = new Date();
    character.decidedAt = null;
    character.applicationFeedback = [];
    character.denialReason = null;
    
    await character.save();
    
    logger.info('OC_APPLICATION', `Character ${character.name} resubmitted (v${character.applicationVersion})`);
    
    return character;
  } catch (error) {
    logger.error('OC_APPLICATION', 'Error resubmitting character', error);
    throw error;
  }
}

module.exports = {
  submitCharacter,
  recordVote,
  checkDecision,
  processApproval,
  processNeedsChanges,
  resubmitCharacter,
  APPROVAL_THRESHOLD,
  NEEDS_CHANGES_THRESHOLD
};
