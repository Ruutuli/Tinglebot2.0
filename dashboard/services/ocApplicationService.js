// ============================================================================
// ------------------- OC Application Service -------------------
// Core workflow logic for character application approval system
// ============================================================================

const Character = require('../models/CharacterModel');
const CharacterModeration = require('../models/CharacterModerationModel');
const logger = require('../utils/logger');
const { connectToTinglebot } = require('../database/db');
const { STATUS, canSubmit, isPending, isNeedsChanges } = require('../utils/statusConstants');

// Constants
const APPROVAL_THRESHOLD = 1; // Number of approve votes required (TEMPORARILY SET TO 1 FOR TESTING)

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
    
    // Check if already submitted (but allow resubmission from needs_changes)
    if (isPending(character.status)) {
      throw new Error('Character is already pending review');
    }
    
    // Can submit from DRAFT (null) or resubmit from NEEDS_CHANGES
    // Note: votes/comments should be cleared before calling this function for resubmissions
    if (!canSubmit(character.status)) {
      throw new Error(`Cannot submit character with status: ${character.status || 'DRAFT'}`);
    }
    
    // Set to PENDING
    character.status = STATUS.PENDING;
    character.submittedAt = new Date();
    // Preserve existing applicationVersion if set (for resubmissions), otherwise default to 1
    if (!character.applicationVersion) {
      character.applicationVersion = 1;
    }
    
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
    
    // Can only vote on pending or needs_changes characters (allow continued voting on needs_changes)
    if (!isPending(character.status) && !isNeedsChanges(character.status)) {
      throw new Error(`Cannot vote on character with status: ${character.status || 'DRAFT'}`);
    }
    
    // Validate decision value
    if (decision !== 'approve' && decision !== STATUS.NEEDS_CHANGES) {
      throw new Error(`Invalid decision: ${decision}. Must be 'approve' or '${STATUS.NEEDS_CHANGES}'`);
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
      existingVote.reason = (decision === STATUS.NEEDS_CHANGES) ? note : null;
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
        reason: (decision === STATUS.NEEDS_CHANGES) ? note : null,
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
    
    if (!isPending(character.status)) {
      return null; // Already decided
    }
    
    const applicationVersion = character.applicationVersion || 1;
    
    const approveCount = await CharacterModeration.countDocuments({
      characterId: characterId,
      applicationVersion: applicationVersion,
      vote: 'approve'
    });
    
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
    
    character.status = STATUS.ACCEPTED;
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


module.exports = {
  submitCharacter,
  recordVote,
  checkDecision,
  processApproval,
  APPROVAL_THRESHOLD
};
