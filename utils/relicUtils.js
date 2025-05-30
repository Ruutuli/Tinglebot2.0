// relicUtils.js
// Utility functions for relic appraisal, submission, archival, and validation.


// ------------------- Local Module Imports -------------------
// Importing local models and services required for relic operations.
const Character = require('../models/CharacterModel');
const Relic = require('../models/RelicModel');
const { addTokensToCharacter } = require('../database/db');
const { EmbedBuilder } = require('discord.js');
const { sendUserDM } = require('./messageUtils');
const { handleError } = require('./globalErrorHandler');

// ------------------- Constants -------------------
// Constants defining game mechanics for relic appraisal and art submission.
const APPRAISAL_STAMINA_COST = 3;
const ART_SUBMISSION_DEADLINE_DAYS = 60;
const APPRAISAL_DEADLINE_DAYS = 7;
const UNIQUE_REWARD_TOKENS = 1000;
const MINIMUM_ART_DIMENSION = 500;
const ART_IMAGE_FORMAT = 'PNG';
const REQUIRED_ASPECT_RATIO = '1:1';

// ------------------- Validation and Eligibility Functions -------------------
// Checks if a character is eligible to appraise a relic based on location and job.
function canCharacterAppraise(character) {
  return (
    character.currentVillage === 'Inariko' &&
    ['Artist', 'Researcher'].includes(character.job)
  );
}

// Checks if the character has enough stamina to perform a relic appraisal.
function hasSufficientStamina(character) {
  return character.currentStamina >= APPRAISAL_STAMINA_COST;
}

// ------------------- Character Expedition Lock Functions -------------------
// Locks the character from further expeditions until the relic appraisal is complete.
async function lockCharacterExpeditions(characterId) {
  const character = await Character.findById(characterId);
  if (!character) throw new Error('Character not found');
  character.expeditionLocked = true;
  await character.save();
}

// ------------------- Stamina and Token Handling Functions -------------------
// Deducts the necessary stamina from the character for appraisal.
async function deductAppraisalStamina(characterId) {
  const character = await Character.findById(characterId);
  if (!character) throw new Error('Character not found');
  if (!hasSufficientStamina(character)) {
    throw new Error(`${character.name} does not have enough stamina to appraise.`);
  }
  character.currentStamina -= APPRAISAL_STAMINA_COST;
  await character.save();
}

// Rewards the character with unique tokens for completing a full appraisal.
async function rewardFullAppraisal(characterId) {
  await addTokensToCharacter(characterId, UNIQUE_REWARD_TOKENS);
}

// ------------------- Timer and Deadline Functions -------------------
// Determines if the relic appraisal deadline (7 days after discovery) has passed.
function isAppraisalExpired(relic) {
  if (!relic.discoveredDate) return false;
  const deadline = new Date(relic.discoveredDate);
  deadline.setDate(deadline.getDate() + APPRAISAL_DEADLINE_DAYS);
  return new Date() > deadline;
}

// Checks whether the relic art submission is late (past the 2-month window) and not submitted.
function isArtLate(relic) {
  if (!relic.appraisalDate) return false;
  const deadline = new Date(relic.appraisalDate);
  deadline.setDate(deadline.getDate() + ART_SUBMISSION_DEADLINE_DAYS);
  return new Date() > deadline && !relic.artSubmitted;
}

// Automatically archives relics that have not had art submitted on time.
async function autoArchiveUnsubmittedArt(relicId) {
  const relic = await Relic.findById(relicId);
  if (!relic || !isArtLate(relic)) return false;
  relic.archived = true;
  await relic.save();
  return true;
}

// ------------------- Duplicate and Lock Logic -------------------
// Checks if the newly found relic is a duplicate based on its name.
function isDuplicateRelic(existingRelics, newRelicName) {
  return existingRelics.some(r =>
    r.name === newRelicName &&
    r.appraised === true &&
    r.artSubmitted === true
  );
}


// ------------------- Art Validation Helpers -------------------
// Validates the relic art submission by ensuring proper image URL, dimensions, aspect ratio, and format.
function validateRelicArt(artUrl, width, height, format) {
  return (
    artUrl &&
    width >= MINIMUM_ART_DIMENSION &&
    height >= MINIMUM_ART_DIMENSION &&
    width === height &&
    format.toUpperCase() === ART_IMAGE_FORMAT
  );
}

// ---- Function: checkExpiredRelics ----
// Checks for any relic appraisals that have expired during downtime
async function checkExpiredRelics(client) {
  try {
    const now = new Date();
    const relics = await Relic.find({
      status: 'pending_appraisal',
      discoveredDate: { $exists: true }
    });

    for (const relic of relics) {
      const appraisalDeadline = new Date(relic.discoveredDate);
      appraisalDeadline.setDate(appraisalDeadline.getDate() + 7); // 7 days from discovery

      if (now > appraisalDeadline) {
        // Update relic status
        relic.status = 'expired';
        await relic.save();

        // Notify discoverer
        if (relic.discovererId) {
          try {
            await sendUserDM(relic.discovererId, `Your relic discovery "${relic.name}" has expired and will be removed from the system.`);
          } catch (error) {
            console.error('[relicUtils]: Error sending DM:', error);
          }
        }

        // Log to mod channel
        const modLogChannel = client.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);
        if (modLogChannel) {
          const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⏰ Relic Appraisal Expired')
            .setDescription(`**Relic**: ${relic.name}\n**Discoverer**: <@${relic.discovererId}>\n**Discovery Date**: <t:${Math.floor(relic.discoveredDate.getTime() / 1000)}:F>`)
            .setTimestamp();

          await modLogChannel.send({ embeds: [embed] });
        }
      }
    }
  } catch (error) {
    handleError(error, 'relicUtils.js');
    console.error('[relicUtils]: Error checking expired relics:', error);
  }
}

// ------------------- Module Exports -------------------
// Export all utility functions and constants for external use.
module.exports = {
  canCharacterAppraise,
  hasSufficientStamina,
  deductAppraisalStamina,
  isAppraisalExpired,
  isArtLate,
  autoArchiveUnsubmittedArt,
  rewardFullAppraisal,
  isDuplicateRelic,
  lockCharacterExpeditions,
  validateRelicArt,
  checkExpiredRelics,

  // Constants for external reference
  APPRAISAL_STAMINA_COST,
  APPRAISAL_DEADLINE_DAYS,
  ART_SUBMISSION_DEADLINE_DAYS,
  UNIQUE_REWARD_TOKENS,
  MINIMUM_ART_DIMENSION,
  ART_IMAGE_FORMAT,
  REQUIRED_ASPECT_RATIO,
};
