// ============================================================================
// ------------------- Imports -------------------
// ============================================================================

// ------------------- Standard Libraries -------------------
// Built-in Node.js modules
const { EmbedBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

// ------------------- Environment Variables -------------------
// Load environment variables from root .env file
const dotenv = require('dotenv');
const path = require('path');
const env = process.env.NODE_ENV || 'development';
const rootEnvPath = path.resolve(__dirname, '..', '..', '.env');
const envSpecificPath = path.resolve(__dirname, '..', '..', `.env.${env}`);
// Try environment-specific file first, then fall back to root .env
if (require('fs').existsSync(envSpecificPath)) {
  dotenv.config({ path: envSpecificPath });
} else {
  dotenv.config({ path: rootEnvPath });
}

// ------------------- Database Services -------------------
// Services for token and inventory management, and character fetching
const {
  fetchCharacterById,
  fetchModCharacterById,
  fetchItemByName,
  getCharacterInventoryCollection,
  getUserTokenData,
  updateTokenBalance,
  transferCharacterInventoryToVillageShops,
  dbFunctions
} = require('@/database/db');

// ------------------- Database Models -------------------
// Character model representing a user's character document
const Character = require('@/models/CharacterModel');
const ModCharacter = require('@/models/ModCharacterModel');
const User = require('@/models/UserModel');

// ------------------- Utilities -------------------
const logger = require('@/utils/logger');
const TempData = require('@/models/TempDataModel');
const Pet = require('@/models/PetModel');
const Mount = require('@/models/MountModel');

// ------------------- Custom Modules -------------------
// Module for retrieving moderator character data
const { getModCharacterByName } = require('../modules/modCharacters');
// Module for generating flavorful text and lore
const { generateBlightSubmissionExpiryFlavorText } = require('../modules/flavorTextModule');

// ------------------- Utility Functions -------------------
// Global error handler, inventory utils, Google Sheets utils, storage, and unique ID utils
const { handleError } = require('@/utils/globalErrorHandler');
const { removeItemInventoryDatabase } = require('@/utils/inventoryUtils');
// Google Sheets functionality removed
const {
  deleteSubmissionFromStorage,
  saveSubmissionToStorage,
  retrieveSubmissionFromStorage,
  saveBlightRequestToStorage,
  retrieveBlightRequestFromStorage,
  deleteBlightRequestFromStorage
} = require('@/utils/storage.js');
const { generateUniqueId } = require('@/utils/uniqueIdUtils');
const { syncInventory } = require('./syncHandler');
const { checkInventorySync } = require('@/utils/characterUtils');
const { sendUserDM } = require('@/utils/messageUtils');

// ============================================================================
// ------------------- Timezone Helper Functions -------------------
// Functions for consistent timezone handling (using UTC)
// ============================================================================

// ------------------- Function: getHourInUTC -------------------
// Gets the hour in UTC from a date
function getHourInUTC(date = new Date()) {
  return date.getUTCHours();
}

// ------------------- Function: get8PMUTC -------------------
// Returns 8:00 PM UTC (20:00 UTC) for the given date
function get8PMUTC(date = new Date()) {
  // Get the date components in UTC
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  // Create date at 8 PM UTC (20:00 UTC)
  const utcDate = new Date(Date.UTC(year, month, day, 20, 0, 0));
  
  return utcDate;
}

// ------------------- Function: get1AMUTC -------------------
// Returns 1:00 AM UTC (01:00 UTC) for the given date
// This corresponds to 8:00 PM EST (20:00 EST) the previous day
function get1AMUTC(date = new Date()) {
  // Get the date components in UTC
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  
  // Create date at 1 AM UTC (01:00 UTC) - this is 8:00 PM EST the previous day
  const utcDate = new Date(Date.UTC(year, month, day, 1, 0, 0));
  
  return utcDate;
}

// ============================================================================
// ------------------- Database Connection -------------------
// Use DatabaseConnectionManager for unified connection management
// ============================================================================
const DatabaseConnectionManager = require('../database/connectionManager');

// ------------------- Function: connectToInventories -------------------
// Connects to the inventories MongoDB database using connection manager.
async function connectToInventories() {
  try {
    return await DatabaseConnectionManager.connectToInventories();
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'connectToInventories'
    });
    logger.error('BLIGHT', 'Error connecting to inventories database');
    throw error;
  }
}

// ============================================================================
// ------------------- Shared Blight Finalization Helper -------------------
// Centralized function to finalize blight application with defensive error handling
// Each step is in its own try/catch so failures don't prevent other steps from running
// ============================================================================

// ------------------- Function: finalizeBlightApplication -------------------
// Finalizes blight application: saves character, adds role, updates user flag, sends DM.
// Designed to be resilient - if a command errors after calling this, the critical steps are done.
// @param {Object} character - Character or ModCharacter document (must have userId, name, icon)
// @param {string} userId - Discord user ID
// @param {Object} options - Optional configuration
//   - {Client} client - Discord client (required for DM)
//   - {Guild} guild - Discord guild (required for role assignment)
//   - {string} source - Source of blight (e.g. "Gloom Hands", "Blight Rain") for DM text
//   - {boolean} alreadySaved - If true, skip character save (assumes caller already saved)
// @returns {Promise<Object>} - Result object with success flags for each step
async function finalizeBlightApplication(character, userId, options = {}) {
  const { client, guild, source = 'unknown source', alreadySaved = false } = options;
  const result = {
    characterSaved: false,
    roleAdded: false,
    userFlagSet: false,
    dmSent: false
  };

  const characterName = character.name || 'Unknown Character';
  const BLIGHT_ROLE_ID = '798387447967907910';

  // Step 1: Ensure character blight fields and save (if not already saved)
  if (!alreadySaved) {
    try {
      character.blighted = true;
      if (!character.blightedAt) {
        character.blightedAt = new Date();
      }
      if (!character.blightStage || character.blightStage === 0) {
        character.blightStage = 1;
      }
      character.blightPaused = false;
      await character.save();
      result.characterSaved = true;
      logger.info('BLIGHT', `Saved blight status for ${characterName} (userId: ${userId})`);
    } catch (error) {
      handleError(error, 'blightHandler.js', {
        operation: 'finalizeBlightApplication',
        step: 'characterSave',
        characterName,
        userId
      });
      logger.error('BLIGHT', `Failed to save blight for ${characterName}: ${error.message}`);
      // Continue to other steps even if save failed
    }
  } else {
    result.characterSaved = true; // Already saved by caller
  }

  // Step 2: Add Discord blight role
  if (guild) {
    try {
      const member = await guild.members.fetch(userId);
      if (member) {
        await member.roles.add(BLIGHT_ROLE_ID);
        result.roleAdded = true;
        logger.info('BLIGHT', `Added blight role to user ${userId} for character ${characterName}`);
      }
    } catch (error) {
      // Handle specific Discord API errors gracefully
      if (error.code === 10007) {
        logger.info('BLIGHT', `User ${userId} not found in guild - cannot add role`);
      } else if (error.code === 50013) {
        logger.warn('BLIGHT', `Missing permissions to add role to user ${userId}`);
      } else {
        handleError(error, 'blightHandler.js', {
          operation: 'finalizeBlightApplication',
          step: 'roleAdd',
          characterName,
          userId
        });
        logger.error('BLIGHT', `Failed to add blight role to user ${userId}: ${error.message}`);
      }
      // Continue to other steps even if role add failed
    }
  } else {
    logger.warn('BLIGHT', `No guild provided - cannot add blight role for ${characterName}`);
  }

  // Step 3: Set user.blightedcharacter flag and save
  try {
    const user = await User.findOne({ discordId: userId });
    if (user) {
      user.blightedcharacter = true;
      await user.save();
      result.userFlagSet = true;
      logger.info('BLIGHT', `Set blightedcharacter flag for user ${userId}`);
    } else {
      logger.warn('BLIGHT', `User ${userId} not found in database - cannot set blightedcharacter flag`);
    }
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'finalizeBlightApplication',
      step: 'userFlagSet',
      characterName,
      userId
    });
    logger.error('BLIGHT', `Failed to set blightedcharacter flag for user ${userId}: ${error.message}`);
    // Continue to DM step even if user flag failed
  }

  // Step 4: Send DM to user
  if (client) {
    try {
      // Create DM message based on source
      let dmMessage = `<:blight_eye:805576955725611058> **Blight Infection Alert**\n\n`;
      dmMessage += `◈ Your character **${characterName}** has been **blighted** by ${source}! ◈\n\n`;
      dmMessage += `🏥 **Healing Available:** You can be healed by **Oracles, Sages & Dragons**\n`;
      dmMessage += `📋 **Blight Information:** [Learn more about blight stages and healing](https://rootsofthewild.com/world/blight)\n\n`;
      dmMessage += `⚠️ **STAGE 1:** Infected areas appear like blight-colored bruises on the body. Side effects include fatigue, nausea, and feverish symptoms. At this stage you can be helped by having one of the sages, oracles or dragons heal you.\n\n`;
      dmMessage += `🎲 **Daily Rolling:** **Starting tomorrow, you'll be prompted to roll in the Community Board each day to see if your blight gets worse!**\n`;
      dmMessage += `*You will not be penalized for missing today's blight roll if you were just infected.*`;

      const dmSent = await sendUserDM(userId, dmMessage, client);
      if (dmSent) {
        result.dmSent = true;
        logger.info('BLIGHT', `Sent blight DM to user ${userId} for character ${characterName}`);
      } else {
        logger.info('BLIGHT', `Could not send DM to user ${userId} (likely DMs disabled or user not found)`);
      }
    } catch (error) {
      // sendUserDM already handles errors gracefully, but log if unexpected
      handleError(error, 'blightHandler.js', {
        operation: 'finalizeBlightApplication',
        step: 'sendDM',
        characterName,
        userId
      });
      logger.error('BLIGHT', `Unexpected error sending DM to user ${userId}: ${error.message}`);
    }
  } else {
    logger.warn('BLIGHT', `No client provided - cannot send DM for ${characterName}`);
  }

  return result;
}

// ============================================================================
// ------------------- Blight Submission Persistence -------------------
// Functions to load and save blight submission data
// ============================================================================

// ------------------- Function: loadBlightSubmissions -------------------
// Loads all saved blight submissions from TempData.
async function loadBlightSubmissions() {
  try {
    const submissions = await TempData.find({ type: 'blight' });
    return submissions.reduce((acc, submission) => {
      acc[submission.key] = submission.data;
      return acc;
    }, {});
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'loadBlightSubmissions',
      options: {
        type: 'blight'
      }
    });
    logger.error('BLIGHT', 'Error loading submissions');
    return {};
  }
}

// ------------------- Function: saveBlightSubmissions -------------------
// Overwrites existing blight submissions with the provided data.
async function saveBlightSubmissions(data) {
  try {
    // Delete all existing blight submissions
    await TempData.deleteMany({ type: 'blight' });
    
    // Save new submissions
    const submissions = Object.entries(data).map(([key, value]) => ({
      type: 'blight',
      key,
      data: value,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    }));
    
    if (submissions.length > 0) {
      await TempData.insertMany(submissions);
    }
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'saveBlightSubmissions',
      options: {
        submissionCount: Object.keys(data).length,
        type: 'blight'
      }
    });
    logger.error('BLIGHT', 'Error saving submissions');
  }
}

// ============================================================================
// ------------------- Blight Healing Logic -------------------
// Handles healing request flows, healer validation, embed creation, etc.
// ============================================================================

// ------------------- Function: getRandomHealingRequirement -------------------
// Weighted selection of healing requirement for a character.
// Items are most likely, writing is medium, art is least likely.
function getRandomHealingRequirement(healer, characterName) {
  const requirements = healer.getHealingRequirements(characterName);
  
  // Define weights for each requirement type
  const weights = {
    'item': 5,    // Highest weight - most likely
    'writing': 3, // Medium weight
    'art': 1      // Lowest weight - least likely
  };
  
  // Create weighted array
  const weightedRequirements = [];
  requirements.forEach(req => {
    const weight = weights[req.type] || 1; // Default weight of 1 if type not found
    for (let i = 0; i < weight; i++) {
      weightedRequirements.push(req);
    }
  });
  
  // Select random requirement from weighted array
  const randomIndex = Math.floor(Math.random() * weightedRequirements.length);
  return weightedRequirements[randomIndex];
}

// ------------------- Function: healBlight -------------------
// Submits a new healing request, checking eligibility and permissions.
async function healBlight(interaction, characterName, healerName) {
  try {
    // Validate character ownership
    const character = await validateCharacterOwnership(interaction, characterName);
    if (!character) {
      await interaction.editReply({
        content: `❌ You can only perform this action for your **own** characters!`,
        flags: [4096]
      });
      return;
    }

    if (!character.blighted) {
      const notBlightedEmbed = new EmbedBuilder()
        .setColor('#00FF00') // Green color for positive message
        .setTitle('⚠️ Not Blighted')
        .setDescription(`**${character.name}** is not blighted and does not require healing.`)
        .setThumbnail(character.icon)
        .setAuthor({ name: `${character.name}'s Status`, iconURL: interaction.user.displayAvatarURL() })
        .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
        .setFooter({ text: 'Blight Status Check', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
        .setTimestamp();

              await interaction.editReply({ 
          content: `<@${interaction.user.id}>`,
          embeds: [notBlightedEmbed],
          flags: [4096]
        });
      return;
    }

    if (character.blightPaused) {
      await interaction.editReply({
        content: `⏸️ Blight progression is currently **paused** for **${character.name}**.`,
        flags: [4096]
      });
      return;
    }

    let oldRequestCancelled = false;
    let oldHealerName = null;
    let oldStage = null;

    // Check for existing pending submission
    const existingSubmissions = await TempData.find({
      type: 'blight',
      'data.characterName': character.name,
      'data.status': 'pending',
      expiresAt: { $gt: new Date() }
    });

    if (existingSubmissions.length > 0) {
      const existingSubmission = existingSubmissions[0];
      // Check if the pending healer is still eligible for the current stage
      const pendingHealer = getModCharacterByName(existingSubmission.data.healerName);
      const currentStage = character.blightStage || 1;
      const pendingPermission = validateHealerPermission(pendingHealer, currentStage);
      
      if (!pendingPermission.canHeal) {
        // Generate lore text for the cancelled request
        const loreText = generateBlightSubmissionExpiryFlavorText(
          character.name,
          pendingHealer.name,
          currentStage,
          existingSubmission.data.taskType
        );
        
        // Log the lore text for administrators
        logger.info('BLIGHT', `Submission cancelled for ${character.name} (healer ineligible)`);
        
        // Expire/cancel the old request
        await deleteBlightRequestFromStorage(existingSubmission.key);
        oldRequestCancelled = true;
        oldHealerName = pendingHealer.name;
        oldStage = currentStage;
      } else {
        const timeLeft = Math.ceil((existingSubmission.expiresAt - new Date()) / (1000 * 60 * 60 * 24));
        
        // Create embed for pending request
        const pendingEmbed = new EmbedBuilder()
          .setColor('#FFA500') // Orange color for warning
          .setTitle('⚠️ Pending Healing Request')
          .setDescription(`**${character.name}** already has a pending healing request.`)
          .addFields(
            { name: '⏰ Expiration', value: `This request expires in **${timeLeft} days**` },
            { name: '🆔 Submission ID', value: `\`${existingSubmission.key}\`` },
            { name: '👨‍⚕️ Healer', value: `**${existingSubmission.data.healerName}**` }
          );

        // Split task description into chunks if needed
        const taskChunks = splitIntoChunks(existingSubmission.data.taskDescription, 1000);
        taskChunks.forEach((chunk, index) => {
          pendingEmbed.addFields({
            name: index === 0 ? '📝 Task Description' : '📝 Task Description (continued)',
            value: chunk
          });
        });

        pendingEmbed
          .setThumbnail(character.icon)
          .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
          .setFooter({ text: 'Blight Healing Request', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png'})
          .setTimestamp();

        // Create instructions embed for art submissions (always show for existing requests too)
        let instructionsEmbed = null;
        if (existingSubmission.data.taskType === 'art') {
          instructionsEmbed = createBlightSubmissionInstructionsEmbed(existingSubmission.key, existingSubmission.data.taskType);
        }

        // Reply in-channel with pending embed (non-ephemeral)
        await interaction.editReply({
          embeds: [pendingEmbed],
          flags: []
        });

        // Send instructions embed separately as ephemeral
        if (instructionsEmbed) {
          await interaction.followUp({
            embeds: [instructionsEmbed],
            flags: [4096]
          });
        }

        // DM the user as well
        try {
          const dmEmbeds = [pendingEmbed];
          if (instructionsEmbed) {
            dmEmbeds.push(instructionsEmbed);
          }
          
          await interaction.user.send({
            content: `Hi <@${interaction.user.id}>, you already have a pending blight healing request for **${character.name}**.`,
            embeds: dmEmbeds
          });
        } catch (dmError) {
          // Don't log DM errors to console channel - they're expected when users have DMs disabled
          if (dmError.code === 50007) {
            logger.warn('BLIGHT', `User ${interaction.user.id} has DMs disabled - skipping pending healing DM notification`);
          } else {
            handleError(dmError, 'blightHandler.js', {
              operation: 'sendPendingHealingDM',
              commandName: interaction.commandName || 'heal',
              userTag: interaction.user.tag,
              userId: interaction.user.id,
              characterName: character.name
            });
            logger.error('BLIGHT', `Failed to send DM to user ${interaction.user.id}`);
          }
        }
        return;
      }
    }

    const healer = getModCharacterByName(healerName);
    if (!healer) {
      await interaction.editReply({ 
        content: `❌ Healer "${healerName}" not found.`, 
        flags: [4096]
      });
      return;
    }

    if (character.currentVillage.toLowerCase() !== healer.village.toLowerCase()) {
      await interaction.editReply({
        content: `⚠️ **${healer.name}** cannot heal **${character.name}** because they are from different villages.`,
        flags: [4096],
      });
      return;
    }

    const blightStage = character.blightStage || 1;
    const permissionCheck = validateHealerPermission(healer, blightStage);

    if (!permissionCheck.canHeal) {
      const allowedHealers = permissionCheck.allowedCategories
        .map(category => category.toLowerCase())
        .join(' or ');
      
      await interaction.editReply({
        content: `⚠️ **${healer.name}** cannot heal **${character.name}** at Blight Stage ${blightStage}. Only ${allowedHealers} can heal this stage.`,
        flags: [4096],
      });
      return;
    }

    // Create new healing request
    const healingRequirement = getRandomHealingRequirement(healer, character.name);
    const newSubmissionId = generateUniqueId('B');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days expiration

    const submissionData = {
      submissionId: newSubmissionId,
      userId: interaction.user.id,
      characterName: character.name,
      healerName,
      taskType: healingRequirement.type,
      taskDescription: healingRequirement.description,
      healingStage: blightStage,
      status: 'pending',
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    await saveBlightRequestToStorage(newSubmissionId, submissionData);

    // Save healing request to blight history
    await saveBlightEventToHistory(character, 'Healing Request', {
      notes: `Requested healing from ${healerName} - Task: ${healingRequirement.type} - ${healingRequirement.description}`,
      submissionId: newSubmissionId
    }, {
      commandName: interaction.commandName || 'heal',
      userTag: interaction.user.tag,
      userId: interaction.user.id
    });

    // Notify mods in the mod queue channel
    const modQueueChannelId = process.env.MOD_QUEUE_CHANNEL_ID;
    if (modQueueChannelId) {
      const modQueueChannel = interaction.client.channels.cache.get(modQueueChannelId);
      if (modQueueChannel) {
        const modEmbed = new EmbedBuilder()
          .setColor('#AA926A')
          .setTitle('🆕 New Blight Healing Request')
          .setDescription(`A new blight healing request has been submitted.`)
          .addFields(
            { name: 'Character', value: character.name },
            { name: 'User', value: `<@${interaction.user.id}>` },
            { name: 'Healer', value: healerName },
            { name: 'Stage', value: `Stage ${blightStage}` },
            { name: 'Task Type', value: healingRequirement.type },
            { name: 'Task Description', value: healingRequirement.description },
            { name: 'Submission ID', value: `\`${newSubmissionId}\`` },
            { name: 'Expires', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>` }
          )
          .setTimestamp();

        await modQueueChannel.send({ embeds: [modEmbed] });
      }
    }

    const embed = createBlightHealingEmbed(character, healer, healingRequirement, newSubmissionId, expiresAt);
    
    // Create instructions embed for art submissions
    let instructionsEmbed = null;
    if (healingRequirement.type === 'art') {
      instructionsEmbed = createBlightSubmissionInstructionsEmbed(newSubmissionId, healingRequirement.type);
    }

    // Reply in-channel using editReply since we deferred (non-ephemeral)
    let replyContent = `<@${interaction.user.id}>`;
    if (oldRequestCancelled) {
      replyContent = `⚠️ **${character.name}** had a pending healing request from **${oldHealerName}**, but they can no longer heal at Stage ${oldStage}.\n\nThe old request has been cancelled. Here is your new healing prompt:\n\n` + replyContent;
    }
    
    await interaction.editReply({
      content: replyContent,
      embeds: [embed],
      flags: [],
    });

    // Send instructions embed separately as ephemeral
    if (instructionsEmbed) {
      await interaction.followUp({
        embeds: [instructionsEmbed],
        flags: [4096]
      });
    }

    // Attempt DM
    try {
      const dmEmbeds = [embed];
      if (instructionsEmbed) {
        dmEmbeds.push(instructionsEmbed);
      }
      
      await interaction.user.send({
        content: `Hi <@${interaction.user.id}>, here are the details of your healing request:`,
        embeds: dmEmbeds,
      });
    } catch (dmError) {
      // Don't log DM errors to console channel - they're expected when users have DMs disabled
      if (dmError.code === 50007) {
        logger.warn('BLIGHT', `User ${interaction.user.id} has DMs disabled - skipping DM notification`);
      } else {
        handleError(dmError, 'blightHandler.js', {
          operation: 'sendDM',
          commandName: interaction.commandName || 'heal',
          userTag: interaction.user.tag,
          userId: interaction.user.id
        });
        logger.error('BLIGHT', `Failed to send DM to user ${interaction.user.id}`);
      }
    }
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'healBlight',
      commandName: interaction.commandName || 'heal',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName,
      healerName
    });
    logger.error('BLIGHT', 'Error healing blight');
    
    // Create detailed error message
    let errorMessage = '❌ **Blight Healing Error**\n\n';
    
    // Add specific error details based on error type
    if (error.name === 'ValidationError') {
      errorMessage += '**Error Type**: Data Validation Error\n';
      errorMessage += '**What Happened**: The system couldn\'t validate your healing request.\n';
      errorMessage += '**How to Fix**: Please check your character name and healer selection.\n';
    } else if (error.name === 'CastError') {
      errorMessage += '**Error Type**: Data Type Error\n';
      errorMessage += '**What Happened**: The system encountered an issue with data formatting.\n';
      errorMessage += '**How to Fix**: Please ensure your character name is correct.\n';
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage += '**Error Type**: Database Timeout\n';
      errorMessage += '**What Happened**: The system took too long to process your request.\n';
      errorMessage += '**How to Fix**: Please try again in a few moments.\n';
    } else if (error.message && error.message.includes('connection')) {
      errorMessage += '**Error Type**: Database Connection Error\n';
      errorMessage += '**What Happened**: The system couldn\'t connect to the database.\n';
      errorMessage += '**How to Fix**: Please try again later.\n';
    } else {
      errorMessage += '**Error Type**: Unexpected Error\n';
      errorMessage += '**What Happened**: Something went wrong while processing your healing request.\n';
      errorMessage += '**How to Fix**: Please try again. If the issue persists, contact a moderator.\n';
    }
    
    // Add request details for debugging
    errorMessage += '\n**Request Details**:\n';
    errorMessage += `- Character: ${characterName || 'Not provided'}\n`;
    errorMessage += `- Healer: ${healerName || 'Not provided'}\n`;
    errorMessage += `- User: ${interaction.user.tag} (${interaction.user.id})\n`;
    
    // Add troubleshooting steps
    errorMessage += '\n**Troubleshooting Steps**:\n';
    errorMessage += '1. Verify your character name is correct\n';
    errorMessage += '2. Ensure the healer is available\n';
    errorMessage += '3. Check if your character is actually blighted\n';
    errorMessage += '4. Try the command again in a few moments\n';
    
    // Add support information
    errorMessage += '\n**Need Help?**\n';
    errorMessage += '- Use </blight status:1306176789634355241> to check your character\'s blight status\n';
    errorMessage += '- Contact a moderator if the issue persists\n';
    errorMessage += '- Check the bot status in the server\n';
    
    // Add technical details for mods
    errorMessage += '\n**Technical Details** (for moderators):\n';
    errorMessage += `- Error: ${error.message || 'Unknown error'}\n`;
    errorMessage += `- Command: ${interaction.commandName || 'heal'}\n`;
    errorMessage += `- Timestamp: ${new Date().toISOString()}`;
    
    try {
      await interaction.editReply({ content: errorMessage, flags: [4096] });
    } catch (replyError) {
      logger.error('INTERACTION', 'Failed to send detailed error reply');
      // Fallback to simple error message
      try {
        await interaction.followUp({ 
          content: '❌ An error occurred while processing your healing request. Please contact a moderator.', 
          flags: [4096] 
        });
      } catch (followUpError) {
        console.error('[blightHandler]: Failed to send follow-up error message:', followUpError);
      }
    }
  }
}

// ============================================================================
// ------------------- Helper Functions -------------------
// Utility methods used throughout blight logic
// ============================================================================

// ------------------- Function: validateCharacterOwnership -------------------
// Ensures a character belongs to the user making the interaction.
// Supports both Character and ModCharacter collections.
async function validateCharacterOwnership(interaction, characterName) {
  try {
    const userId = interaction.user.id;
    
    // Extract just the character name if it includes additional information (e.g., "Rhifu | Vhintl | Graveskeeper")
    const cleanCharacterName = characterName.split('|')[0].trim();
    
    // Try to find in Character collection first
    let character = await Character.findOne({ 
      name: { $regex: new RegExp(`^${cleanCharacterName}$`, 'i') }, 
      userId 
    });
    
    // If not found, try ModCharacter collection
    if (!character) {
      character = await ModCharacter.findOne({ 
        name: { $regex: new RegExp(`^${cleanCharacterName}$`, 'i') }, 
        userId 
      });
    }
    
    if (!character) {
      // Check if the character exists at all (for better error message) - check both collections
      const existsRegular = await Character.findOne({ 
        name: { $regex: new RegExp(`^${cleanCharacterName}$`, 'i') } 
      });
      const existsMod = await ModCharacter.findOne({ 
        name: { $regex: new RegExp(`^${cleanCharacterName}$`, 'i') } 
      });
      const exists = existsRegular || existsMod;
      
      if (!exists) {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Character Not Found')
          .setDescription(`The character "${cleanCharacterName}" does not exist in the database.`)
          .addFields(
            { name: '🔍 Possible Reasons', value: '• Character name is misspelled\n• Character was deleted\n• Character was never created' },
            { name: '💡 Suggestion', value: 'Please check the spelling and try again.' }
          )
          .setImage('https://storage.googleapis.com/tinglebot/border.png')
          .setFooter({ text: 'Character Validation' })
          .setTimestamp();

        await interaction.editReply({
          embeds: [errorEmbed],
          flags: [4096]
        });
      } else {
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Ownership Error')
          .setDescription(`You can only perform this action for your **own** characters!`)
          .addFields(
            { name: '🔒 Character Ownership', value: `The character "${cleanCharacterName}" belongs to another user.` },
            { name: '💡 Suggestion', value: 'Please use this command with one of your own characters.' }
          )
          .setImage('https://storage.googleapis.com/tinglebot/border.png')
          .setFooter({ text: 'Character Validation' })
          .setTimestamp();

        await interaction.editReply({
          embeds: [errorEmbed],
          flags: [4096]
        });
      }
      return null;
    }
    return character;
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'validateCharacterOwnership',
      commandName: interaction.commandName || 'unknown',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName
    });
    logger.error('BLIGHT', 'Error validating character ownership');
    
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('❌ **System Error**')
      .setDescription('An error occurred while validating character ownership.')
      .addFields(
        { name: '🔧 **Error Type**', value: 'Character Validation System Error' },
        { name: '📝 **What Happened**', value: 'The system encountered an unexpected error while processing your request.' },
        { name: '💡 **How to Fix**', value: 'Please try again later or contact a moderator if the issue persists.' },
        { name: '🆘 **Need Help?**', value: 'Contact a moderator with the technical details below.' },
        { name: '🔍 **Technical Details** (for moderators)', value: `Error: ${error.message || 'Unknown error'}\nUser: ${interaction.user.tag} (${interaction.user.id})\nCharacter: ${characterName}\nTimestamp: ${new Date().toISOString()}` }
      )
      .setImage('https://storage.googleapis.com/tinglebot/border.png')
      .setFooter({ text: 'Character Validation' })
      .setTimestamp();

    await interaction.editReply({
      embeds: [errorEmbed],
      flags: [4096]
    });
    return null;
  }
}

// ------------------- Function: validateHealerPermission -------------------
// Checks if a healer is allowed to heal based on blight stage.
function validateHealerPermission(healer, blightStage) {
  // Define healing permissions by stage
  const stagePermissions = {
    1: ['Sage', 'Oracle', 'Dragon'],
    2: ['Sage', 'Oracle', 'Dragon'],
    3: ['Oracle', 'Dragon'],
    4: ['Dragon'],
    5: ['Dragon'] // Stage 5: Only Dragons can heal
  };

  // Get allowed healer categories for the current stage
  const allowedCategories = stagePermissions[blightStage] || [];
  
  // Check if healer's category is allowed for this stage
  return {
    canHeal: allowedCategories.includes(healer.category),
    allowedCategories,
    stage: blightStage
  };
}

// ------------------- Function: completeBlightHealing -------------------
// Applies healing effects and resets blight status.
async function completeBlightHealing(character, interaction = null, client = null) {
  // Save healing completion to blight history
  await saveBlightEventToHistory(character, 'Healing Completed', {
    notes: `Character healed from blight - Stage ${character.blightStage} to 0`,
    previousStage: character.blightStage,
    newStage: 0
  }, {
    commandName: 'heal',
    userTag: character.userId ? `User: ${character.userId}` : 'System',
    userId: character.userId || 'system'
  });

  character.blighted = false;
  character.blightedAt = null;
  character.blightStage = 0;
  character.blightEffects = {
    rollMultiplier: 1.0,
    noMonsters: false,
    noGathering: false
  };
  
  await character.save();

  // Check if user has any other blighted characters and manage blighted role
  try {
    const otherBlightedCharacters = await Character.find({
      userId: character.userId,
      blighted: true,
      _id: { $ne: character._id } // Exclude the current character
    });

    // If no other blighted characters, remove the blighted role
    if (otherBlightedCharacters.length === 0) {
      let guild = null;
      
      // Try to get guild from interaction first
      if (interaction && interaction.guild) {
        guild = interaction.guild;
      } else if (interaction && interaction.client) {
        // Try to get guild from interaction's client
        const guildId = process.env.GUILD_ID;
        if (guildId) {
          guild = interaction.client.guilds.cache.get(guildId);
        }
      } else if (client) {
        // Try to get guild from passed client parameter
        const guildId = process.env.GUILD_ID;
        if (guildId) {
          guild = client.guilds.cache.get(guildId);
        }
      }
      
      if (guild) {
        try {
          const member = await guild.members.fetch(character.userId);
          await member.roles.remove('798387447967907910');
          logger.success('BLIGHT', `Removed blighted role from user ${character.userId}`);
          console.log(`[blightHandler.js]: ✅ Removed blighted role from user ${character.userId}`);
        } catch (roleError) {
          logger.warn('BLIGHT', `Could not remove blighted role from user ${character.userId}: ${roleError.message}`);
          console.warn(`[blightHandler.js]: ⚠️ Could not remove blighted role from user ${character.userId}:`, roleError);
        }
      } else {
        console.log(`[blightHandler.js]: ⚠️ User ${character.userId} has no other blighted characters - blighted role should be removed but no guild context available`);
      }
    } else {
      console.log(`[blightHandler.js]: ✅ User ${character.userId} still has ${otherBlightedCharacters.length} other blighted character(s) - keeping blighted role`);
    }
  } catch (roleError) {
    console.warn(`[blightHandler.js]: ⚠️ Could not check for other blighted characters for user ${character.userId}:`, roleError);
  }
}

// ------------------- Function: createBlightHealingFields -------------------
// Creates fields for healing embed (requirement, ID, expiration).
function createBlightHealingFields(healingRequirement, submissionId, expiresAt) {
  // Validate required parameters
  if (!healingRequirement || typeof healingRequirement !== 'object') {
    throw new Error('Invalid healing requirement provided');
  }
  if (!healingRequirement.type || typeof healingRequirement.type !== 'string') {
    throw new Error('Invalid healing requirement type');
  }
  if (!healingRequirement.description || typeof healingRequirement.description !== 'string') {
    throw new Error('Invalid healing requirement description');
  }
  if (!submissionId || typeof submissionId !== 'string') {
    throw new Error('Invalid submission ID');
  }
  
  // Convert expiresAt to Date if it's a string
  const expirationDate = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  if (!(expirationDate instanceof Date) || isNaN(expirationDate.getTime())) {
    throw new Error('Invalid expiration date');
  }

  const fields = [];

  // Add requirement type and description
  fields.push({
    name: '<:bb0:854499720797618207> __Healing Requirement__',
    value: `> **Type**: ${
      healingRequirement.type === 'art'
        ? '🎨 Art'
        : healingRequirement.type === 'writing'
        ? '✍️ Writing'
        : '🍎 Item'
    }`
  });

  // Split description into chunks if needed
  const descriptionChunks = splitIntoChunks(healingRequirement.description, 1000);
  descriptionChunks.forEach((chunk, index) => {
    fields.push({
      name: index === 0 ? '📝 __Task Description__' : '📝 __Task Description (continued)__',
      value: chunk
    });
  });

  // Add submission ID
  fields.push({
    name: '<:bb0:854499720797618207> __Submission ID__',
    value: `\`${submissionId}\``
  });

  // Add alternative option
  fields.push({
    name: '<:bb0:854499720797618207> __Alternative Option__',
    value: `> If you cannot fulfill this request, you can forfeit all of your total tokens to be healed. Use </blight submit:1306176789634355241> to forfeit your tokens.`
  });

  // Add expiration
  fields.push({
    name: '<:bb0:854499720797618207> __Expiration__',
    value: `> This request will expire in 30 days (<t:${Math.floor(expirationDate.getTime() / 1000)}:R>).\n> ⚠️ You must complete the healing before expiration or your character will remain blighted.`
  });

  return fields;
}

// Helper function to split text into chunks
function splitIntoChunks(text, maxLength) {
  const chunks = [];
  let currentChunk = '';
  
  // Split by newlines first to preserve formatting
  const lines = text.split('\n');
  
  for (const line of lines) {
    // If adding this line would exceed the limit, start a new chunk
    if (currentChunk.length + line.length + 1 > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      
      // If a single line is too long, split it into words
      if (line.length > maxLength) {
        const words = line.split(' ');
        let tempLine = '';
        
        for (const word of words) {
          if (tempLine.length + word.length + 1 > maxLength) {
            chunks.push(tempLine);
            tempLine = word;
          } else {
            tempLine += (tempLine ? ' ' : '') + word;
          }
        }
        
        if (tempLine) {
          currentChunk = tempLine;
        }
      } else {
        currentChunk = line;
      }
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks;
}

// ------------------- Function: createBlightHealingEmbed -------------------
// Returns a formatted embed for a new healing request.
function createBlightHealingEmbed(character, healer, healingRequirement, submissionId, expiresAt) {
  return new EmbedBuilder()
    .setColor('#AA926A')
    .setTitle(`${healer.name} from the village of ${healer.village} has heard your request to heal ${character.name}.`)
    .setDescription(healer.roleplayResponseBefore(character.name))
    .setAuthor({ name: character.name, iconURL: character.icon })
    .setThumbnail(healer.iconUrl)
    .addFields(createBlightHealingFields(healingRequirement, submissionId, expiresAt))
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setFooter({ text: 'Use the Submission ID when you submit the task with /blight submit' })
    .setTimestamp();
}

// ------------------- Function: createBlightSubmissionErrorEmbed -------------------
// Creates appropriate error embeds based on validation error type.
function createBlightSubmissionErrorEmbed(errorMessage) {
  let title, description, fields, footerText;
  
  if (errorMessage.includes('Invalid Discord message link format')) {
    title = '❌ Invalid Link Format';
    description = 'The link you provided is not a valid Discord message link.';
    fields = [
      { name: '📝 What Happened?', value: 'The link format is incorrect. Please provide a valid Discord message link.' },
      { name: '💡 How to Fix', value: '1. Right-click on your submission message\n2. Select "Copy Message Link"\n3. Use that link with the healing command' },
      { name: '📌 Important', value: 'The link must be from a Discord message, not a general channel link.' }
    ];
    footerText = 'Link Format Error';
  } else if (errorMessage.includes('submissions channel')) {
    title = '❌ Wrong Channel';
    description = 'Your submission must be posted in the submissions channel first.';
    fields = [
      { name: '📝 What Happened?', value: 'The submission link is from a different channel than allowed.' },
      { name: '💡 How to Fix', value: '1. Post your art/writing in the submissions channel\n2. Include your blight healing request ID when submitting\n3. Wait for a moderator to approve with a checkmark emoji\n4. Copy the link from your approved submission\n5. Use that link with the healing command' },
      { name: '📌 Important', value: 'This is required to ensure all submissions are properly documented and reviewed.' }
    ];
    footerText = 'Channel Error';
  } else if (errorMessage.includes('not been approved yet')) {
    title = '❌ Submission Not Approved';
    description = 'This submission has not been approved by a moderator yet.';
    fields = [
      { name: '📝 What Happened?', value: 'Your submission is waiting for moderator approval with a checkmark emoji.' },
      { name: '💡 How to Fix', value: '1. Wait for a moderator to approve your submission\n2. Look for a checkmark emoji reaction on your submission\n3. Once approved, copy the link and use it for healing' },
      { name: '📌 Important', value: 'Only approved submissions can be used for blight healing.' }
    ];
    footerText = 'Approval Error';
  } else if (errorMessage.includes('different blight healing request')) {
    title = '❌ Wrong Blight ID';
    description = 'This submission is for a different blight healing request.';
    fields = [
      { name: '📝 What Happened?', value: 'The submission contains a different blight healing ID than the one you\'re trying to use.' },
      { name: '💡 How to Fix', value: '1. Use the submission that matches your current blight healing request\n2. Make sure the blight ID in the submission matches your request\n3. If you need a new submission, create one with the correct blight ID' },
      { name: '📌 Important', value: 'Each submission is tied to a specific blight healing request.' }
    ];
    footerText = 'Blight ID Mismatch Error';
  } else if (errorMessage.includes('does not contain a blight healing ID')) {
    title = '❌ Missing Blight ID';
    description = 'This submission was not created with a blight healing ID.';
    fields = [
      { name: '📝 What Happened?', value: 'The submission does not contain a blight healing ID, which is required for healing.' },
      { name: '💡 How to Fix', value: '1. Create a new submission using `/submit art` or `/submit writing`\n2. Include your blight healing request ID when submitting\n3. Wait for moderator approval\n4. Use the approved submission link for healing' },
      { name: '📌 Important', value: 'Only submissions created with a blight ID can be used for healing.' }
    ];
    footerText = 'Missing Blight ID Error';
  } else if (errorMessage.includes('Could not access') || errorMessage.includes('Could not find')) {
    title = '❌ Link Access Error';
    description = 'Could not access or find the submission message.';
    fields = [
      { name: '📝 What Happened?', value: 'The bot could not access the submission message. This could be due to permissions or an incorrect link.' },
      { name: '💡 How to Fix', value: '1. Make sure the link is correct and recent\n2. Ensure the submission is in a public channel\n3. Try copying the link again\n4. Contact support if the issue persists' },
      { name: '📌 Important', value: 'The submission must be accessible to the bot for verification.' }
    ];
    footerText = 'Access Error';
  } else {
    // Generic error fallback
    title = '❌ Submission Error';
    description = 'There was an issue with your submission link.';
    fields = [
      { name: '📝 What Happened?', value: errorMessage },
      { name: '💡 How to Fix', value: '1. Check that your submission link is correct\n2. Ensure the submission is approved\n3. Verify the blight ID matches your request\n4. Try again or contact support' },
      { name: '📌 Important', value: 'All submissions must be properly formatted and approved.' }
    ];
    footerText = 'General Error';
  }

  return new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle(title)
    .setDescription(description)
    .addFields(fields)
    .setImage('https://storage.googleapis.com/tinglebot/border.png')
    .setFooter({ text: footerText, iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
    .setTimestamp();
}

// ------------------- Function: createBlightSubmissionInstructionsEmbed -------------------
// Returns a formatted embed with instructions on how to submit art for blight healing.
function createBlightSubmissionInstructionsEmbed(submissionId, taskType) {
  const embed = new EmbedBuilder()
    .setColor('#4A90E2')
    .setTitle('📋 How to Submit Your Blight Healing Art')
    .setDescription('Follow these steps to submit your art for blight healing approval:')
    .addFields(
      { 
        name: '🎨 Step 1: Create Your Art', 
        value: 'Complete the art requirement as specified in your healing request above.', 
        inline: false 
      },
      { 
        name: '📤 Step 2: Submit to Submissions Channel', 
        value: 'Use `/submit art` in the <#940446392789389362> channel with your art file.', 
        inline: false 
      },
      { 
        name: '🆔 Step 3: Include Blight ID', 
        value: `When submitting, include your **Blight ID**: \`${submissionId}\`\n\n**Command Format:**\n\`/submit art file:your-art.png blightid:${submissionId}\``, 
        inline: false 
      },
      { 
        name: '⏳ Step 4: Wait for Approval', 
        value: 'A moderator will review your submission and approve it with a checkmark emoji.', 
        inline: false 
      },
      { 
        name: '✅ Step 5: Complete Healing', 
        value: `Once approved, use the submission link with:\n\`/blight submit submission_id:${submissionId} link:your-submission-link\``, 
        inline: false 
      }
    )
    .addFields(
      { 
        name: '⚠️ Important Notes', 
        value: '• Your submission must be approved before you can use it for healing\n• The submission must contain your Blight ID\n• You have 30 days to complete this task\n• You can forfeit all tokens as an alternative option', 
        inline: false 
      }
    )
    .setImage('https://storage.googleapis.com/tinglebot/border%20instructions.png')
    .setFooter({ text: 'Blight Healing Submission Guide' })
    .setTimestamp();

  return embed;
}

// ------------------- Function: createBlightHealingCompleteEmbed -------------------
// Returns a formatted embed for a completed healing task.
function createBlightHealingCompleteEmbed(character, healer, additionalFields = []) {
  const embed = new EmbedBuilder()
    .setColor('#AA926A')
    .setTitle(`${character.name} has been healed of their blight by ${healer.name}!`)
    .setDescription(healer.roleplayResponseAfter(character.name))
    .setThumbnail(healer.iconUrl)
    .setAuthor({ name: character.name, iconURL: character.icon })
    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
    .setFooter({ text: 'Healing status successfully updated.' })
    .setTimestamp();

  if (additionalFields.length > 0) {
    embed.addFields(additionalFields);
  }

  return embed;
}

// ============================================================================
// ------------------- Healing Submission Processing -------------------
// Handles submission of healing tasks including item/art/writing/token options.
// ============================================================================

// ------------------- Function: submitHealingTask -------------------
// Processes a healing task submission based on submission ID and type.
async function submitHealingTask(interaction, submissionId, item = null, link = null, tokens = false) {
  try {
    // ------------------- Validate Submission ID -------------------
    if (!submissionId || typeof submissionId !== 'string') {
      const invalidIdEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Invalid Submission ID')
        .setDescription('The submission ID you provided is not valid.')
        .addFields(
          { 
            name: '📝 What This Means', 
            value: 'The submission ID must be a valid text string (not empty or null).' 
          },
          { 
            name: '💡 Correct Format', 
            value: '• Blight submission IDs start with **B** (e.g., B694183)\n• They are provided when a healer assigns you a task\n• Make sure you\'re copying the entire ID correctly' 
          },
          { 
            name: '🔍 How to Get a Valid ID', 
            value: '1. Use `/blight heal` to request healing for your character\n2. A healer will assign you a task and provide a submission ID\n3. Copy the exact ID provided (including the B prefix)\n4. Use that ID with `/blight submit`' 
          }
        )
        .setImage('https://storage.googleapis.com/tinglebot/border.png')
        .setFooter({ text: 'Blight Healing Submission Error', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
        .setTimestamp();
      
      await interaction.editReply({ 
        embeds: [invalidIdEmbed],
        flags: [4096] 
      });
      return;
    }

    // ------------------- Fetch & Validate Submission -------------------
    const submission = await retrieveBlightRequestFromStorage(submissionId);
    if (!submission) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Submission ID Not Found')
        .setDescription(`The submission ID **"${submissionId}"** could not be found in our system.`)
        .addFields(
          { 
            name: '📝 What This Means', 
            value: 'This submission ID either doesn\'t exist, has expired, or was never created.' 
          },
          { 
            name: '🔍 How to Get a Valid Submission ID', 
            value: '1. Use `/blight heal` to request healing for your blighted character\n2. A healer will assign you a task and provide a submission ID\n3. Complete the assigned task (art, writing, or item offering)\n4. Use `/blight submit` with the correct submission ID' 
          },
          { 
            name: '💡 Common Issues', 
            value: '• **Typo in ID**: Double-check the submission ID for any typos\n• **Wrong Format**: Blight submission IDs start with **B** (e.g., B694183)\n• **Expired Request**: Submission IDs expire after a certain time\n• **Wrong Character**: Make sure you\'re using the ID for the correct character\n• **Already Used**: The ID may have already been submitted' 
          },
          { 
            name: '🆘 Need Help?', 
            value: 'If you believe this is an error, contact a moderator with your character name and the submission ID you received.' 
          }
        )
        .setImage('https://storage.googleapis.com/tinglebot/border.png')
        .setFooter({ text: 'Blight Healing Submission Error', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
        .setTimestamp();
      
      await interaction.editReply({ 
        embeds: [errorEmbed],
        flags: [4096] 
      });
      return;
    }

    if (submission.status !== 'pending') {
      const processedEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⚠️ Submission Already Processed')
        .setDescription(`This submission has already been processed with status: **${submission.status}**`)
        .addFields(
          { 
            name: '📝 What This Means', 
            value: 'This submission ID has already been used and cannot be submitted again.' 
          },
          { 
            name: '💡 Possible Reasons', 
            value: '• You may have already submitted this task\n• Another user may have used this ID\n• The submission may have been processed by a moderator\n• The task may have expired and been auto-processed' 
          },
          { 
            name: '🔍 How to Check', 
            value: '1. Check your character\'s blight status with `/blight status`\n2. Review your blight history with `/blight history`\n3. If your character is still blighted, request a new healing task' 
          },
          { 
            name: '🆘 Need Help?', 
            value: 'If you believe this is an error, contact a moderator with your character name and submission ID.' 
          }
        )
        .setImage('https://storage.googleapis.com/tinglebot/border.png')
        .setFooter({ text: 'Blight Healing Submission Status', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
        .setTimestamp();
      
      await interaction.editReply({ 
        embeds: [processedEmbed],
        flags: [4096] 
      });
      return;
    }

    if (new Date(submission.expiresAt) < new Date()) {
      // Generate flavorful lore text for the expiry
      const character = await Character.findOne({ name: submission.characterName });
      const blightStage = character ? character.blightStage : 2;
      
      const loreText = generateBlightSubmissionExpiryFlavorText(
        submission.characterName,
        submission.healerName,
        blightStage,
        submission.taskType
      );
      
      const expiredEmbed = new EmbedBuilder()
        .setColor('#FF6B6B')
        .setTitle('⏰ Blight Healing Request Expired')
        .setDescription(loreText)
        .addFields(
          { name: '🆔 Submission ID', value: `\`${submissionId}\``, inline: true },
          { name: '👨‍⚕️ Healer', value: submission.healerName, inline: true },
          { name: '📝 Task Type', value: submission.taskType, inline: true },
          { name: '⏰ Expired At', value: `<t:${Math.floor(new Date().getTime() / 1000)}:F>`, inline: false },
          { name: '💡 Next Steps', value: 'You can request a new healing task using `/blight heal` if your character is still blighted.' }
        )
        .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
        .setFooter({ text: 'Blight Healing Expiration Notice' })
        .setTimestamp();
      
      await interaction.editReply({
        embeds: [expiredEmbed],
        flags: [4096]
      });
      return;
    }

    // ------------------- Fetch Character & Healer -------------------
    const character = await Character.findOne({ name: submission.characterName });
    if (!character) {
      const characterNotFoundEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Character Not Found')
        .setDescription(`The character **"${submission.characterName}"** could not be found in our system.`)
        .addFields(
          { 
            name: '📝 What This Means', 
            value: 'The character referenced in this submission no longer exists or has been deleted.' 
          },
          { 
            name: '💡 Possible Reasons', 
            value: '• The character may have been deleted\n• The character name may have been changed\n• There may be a typo in the submission data\n• The character may have been transferred to another user' 
          },
          { 
            name: '🔍 How to Check', 
            value: '1. Verify the character name is correct\n2. Check if you still own this character\n3. Look for any recent character name changes\n4. Contact a moderator if you believe this is an error' 
          },
          { 
            name: '🆘 Need Help?', 
            value: 'If you believe this character should exist, contact a moderator with the character name and submission ID.' 
          }
        )
        .setImage('https://storage.googleapis.com/tinglebot/border.png')
        .setFooter({ text: 'Character Validation Error', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
        .setTimestamp();
      
      await interaction.editReply({ 
        embeds: [characterNotFoundEmbed],
        flags: [4096] 
      });
      return;
    }

    // ---- NEW: Only allow the owner to submit healing for their character ----
    if (interaction.user.id !== character.userId) {
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Ownership Error')
        .setDescription('You can only submit healing for your **own** characters!')
        .addFields(
          { name: '🔒 Character Ownership', value: `The character "${submission.characterName}" belongs to another user.` },
          { name: '💡 Suggestion', value: 'Please use this command with one of your own characters.' }
        )
        .setImage('https://storage.googleapis.com/tinglebot/border.png')
        .setFooter({ text: 'Character Validation' })
        .setTimestamp();

      await interaction.editReply({ 
        embeds: [errorEmbed],
        flags: [4096] 
      });
      return;
    }

    if (typeof character.blightStage !== 'number' || character.blightStage < 0) {
      character.blightStage = 1;
      await character.save();
    }

    const healer = getModCharacterByName(submission.healerName);
    if (!healer) {
      const healerNotFoundEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Healer Not Found')
        .setDescription(`The healer **"${submission.healerName}"** could not be found in our system.`)
        .addFields(
          { 
            name: '📝 What This Means', 
            value: 'The healer assigned to this submission is no longer available or has been removed.' 
          },
          { 
            name: '💡 Possible Reasons', 
            value: '• The healer may have been removed from the system\n• The healer name may have been changed\n• There may be a typo in the submission data\n• The healer may no longer be active' 
          },
          { 
            name: '🔍 How to Fix', 
            value: '1. Contact a moderator about this issue\n2. Request a new healing task with a different healer\n3. Provide the submission ID and healer name to support' 
          },
          { 
            name: '🆘 Need Help?', 
            value: 'This appears to be a system issue. Please contact a moderator with your submission ID and character name.' 
          }
        )
        .setImage('https://storage.googleapis.com/tinglebot/border.png')
        .setFooter({ text: 'Healer Validation Error', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
        .setTimestamp();
      
      await interaction.editReply({ 
        embeds: [healerNotFoundEmbed],
        flags: [4096] 
      });
      return;
    }

    // ---- NEW: Check healer eligibility for current stage ----
    const permissionCheck = validateHealerPermission(healer, character.blightStage);
    if (!permissionCheck.canHeal) {
      const allowedHealers = permissionCheck.allowedCategories.map(c => c.toLowerCase()).join(' or ');
      const ineligibleHealerEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('❌ Healer Not Eligible for This Stage')
        .setDescription(`**${healer.name}** cannot heal **${character.name}** at Blight Stage ${character.blightStage}.`)
        .addFields(
          {
            name: 'Allowed healers',
            value: `Only ${allowedHealers} can heal this stage.`,
            inline: false
          },
          {
            name: 'What to do',
            value: 'Please request a new healing task from an eligible healer.',
            inline: false
          }
        )
        .setFooter({ text: 'Healer Validation', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
        .setTimestamp();
      await interaction.editReply({
        embeds: [ineligibleHealerEmbed],
        flags: [4096]
      });
      return;
    }
    // ---- END NEW ----

    // Check inventory sync before proceeding (no longer required, but kept for compatibility)
    await checkInventorySync(character);

    // ========================================================================
    // ------------------- Submission Type: Token Forfeit -------------------
    // ========================================================================
    if (tokens) {
      const userId = interaction.user.id;
      const userData = await getUserTokenData(userId);
      const currentTokenBalance = userData.tokens || 0;
      const tokenTrackerLink = userData.tokenTracker || '';
      const interactionUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`;

      if (currentTokenBalance <= 0) {
        await interaction.editReply({
          content: '❌ You do not have enough tokens to forfeit. You must have more than 0 tokens to use this option.',
          flags: [4096]
        });
        return;
      }

      // Log token forfeiture
      if (tokenTrackerLink && tokenTrackerLink.trim()) {
        try {
          const spreadsheetId = extractSpreadsheetId(tokenTrackerLink);
          const auth = await authorizeSheets();
          const formattedDateTime = new Date().toISOString();
          const tokenRow = [[
            'Blight Healing',
            interactionUrl,
            'blight healing',
            'spent',
            `-${currentTokenBalance}`
          ]];
          await safeAppendDataToSheet(tokenTrackerLink, { discordId: userId }, 'loggedTracker!B7:F', tokenRow, undefined, { skipValidation: true });
        } catch (sheetError) {
          handleError(sheetError, 'blightHandler.js', {
            operation: 'logTokenForfeiture',
            commandName: interaction.commandName || 'submit',
            userTag: interaction.user.tag,
            userId: interaction.user.id,
            submissionId
          });
          console.error('[blightHandler]: Error logging token forfeiture', sheetError);
        }
      } else {
        console.log(`[blightHandler]: Skipping token tracker logging for user ${userId} - no token tracker link configured`);
      }

      // Validate token balance before updating
      if (isNaN(currentTokenBalance) || currentTokenBalance <= 0) {
        console.error(`[blightHandler]: Invalid token balance: ${currentTokenBalance}`);
        await interaction.editReply({
          content: '❌ Invalid token balance. Please try again later.',
          flags: [4096]
        });
        return;
      }

      await updateTokenBalance(userId, -currentTokenBalance, {
        category: 'blight',
        description: `Blight healing token forfeit (${character.name})`,
        link: interactionUrl
      });

      submission.status = 'completed';
      submission.submittedAt = new Date().toISOString();
      submission.forfeitTokens = true;

      await deleteBlightRequestFromStorage(submissionId);
      await completeBlightHealing(character, interaction, interaction.client);

      const embed = createBlightHealingCompleteEmbed(character, healer, [
        {
          name: 'Token Forfeiture',
          value: `You have forfeited **${currentTokenBalance} tokens** in exchange for healing **${character.name}**.`
        }
      ]);

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ========================================================================
    // ------------------- Submission Type: Item -------------------
    // ========================================================================
    if (submission.taskType === 'item') {
      // ---- NEW: Robust item parsing and error messaging ----
      if (!item || typeof item !== 'string' || !item.trim()) {
        await interaction.editReply({
          content: `❌ You must provide an item in the format: Item Name xQuantity (e.g., Bright-Eyed Crab x4).`,
          flags: [4096]
        });
        return;
      }
      const itemMatch = item.match(/^(.*) x(\d+)$/i);
      if (!itemMatch) {
        await interaction.editReply({
          content: `❌ Invalid item format. Please use: Item Name xQuantity (e.g., Bright-Eyed Crab x4).`,
          flags: [4096]
        });
        return;
      }
      const itemName = itemMatch[1].trim();
      const itemQuantityInt = parseInt(itemMatch[2], 10);
      if (!itemName || isNaN(itemQuantityInt) || itemQuantityInt <= 0) {
        await interaction.editReply({
          content: `❌ Invalid item or quantity. Please use: Item Name xQuantity (e.g., Bright-Eyed Crab x4).`,
          flags: [4096]
        });
        return;
      }
      // ---- END NEW ----

      const healingItems = healer.getHealingRequirements(submission.characterName)
        .find((req) => req.type === 'item').items;

      // ---- NEW: Case-insensitive item matching ----
      const requiredItem = healingItems.find((i) =>
        i.name.toLowerCase() === itemName.toLowerCase()
      );
      // ---- END NEW ----

      if (!requiredItem) {
        // Build list of accepted items for the error message
        const acceptedItemsList = healingItems.map(item => 
          `• **${item.name}** x${item.quantity}`
        ).join('\n');

        const invalidRequirementEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Wrong Item Submitted')
          .setDescription(`You tried to submit **${itemName} x${itemQuantityInt}**, but that's not what **${healer.name}** needs!`)
          .addFields(
            { 
              name: '🤔 What Went Wrong?', 
              value: `The item you submitted doesn't match what **${healer.name}** is asking for. The list shows everything that mod OCs might want, but you need to figure out which specific item to offer based on the hint in your healing prompt!` 
            },

            { 
              name: '📋 How to Fix', 
              value: `1. Look at your healing request message (the one with the task description)\n2. Read the hint carefully - it describes what the healer wants\n3. Match the hint to one of the items in the list \n4. Type the item name **exactly** as shown (e.g., "Amber", not "orangey gem")\n5. Use the format: **Item Name xQuantity** (e.g., "Amber x5")` 
            },
            { 
              name: '🆘 Still Confused?', 
              value: `• Check your inventory with \`/inventory\` to see the exact item names you have\n• Look back at your original healing request message - it shows which items are needed\n• Make sure you're using the exact item name (not a description like "orangey gem")` 
            }
          )
          .setThumbnail(healer.iconUrl)
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: 'Healing Submission Error', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
          .setTimestamp();

        await interaction.editReply({
          embeds: [invalidRequirementEmbed],
          flags: [4096]
        });
        return;
      }

      if (itemQuantityInt !== requiredItem.quantity) {
        const quantityMismatchEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Incorrect Quantity')
          .setDescription(`**${healer.name}** requires an exact amount of **${requiredItem.name}**.`)
          .addFields(
            { name: 'Required', value: `${requiredItem.name} x${requiredItem.quantity}`, inline: true },
            { name: 'You Provided', value: `${requiredItem.name} x${itemQuantityInt}`, inline: true }
          )
          .setThumbnail(healer.iconUrl)
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: 'Healing Submission Error', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
          .setTimestamp();

        await interaction.editReply({
          embeds: [quantityMismatchEmbed],
          flags: [4096]
        });
        return;
      }

      // ------------------- Inventory Validation -------------------
      const hasItem = async (characterId, name, needed) => {
        try {
          // Try to fetch regular character first, then mod character if not found
          let char = await fetchCharacterById(characterId);
          if (!char) {
            // Try to fetch as mod character
            char = await fetchModCharacterById(characterId);
          }
          
          if (!char) {
            throw new Error(`Character with ID ${characterId} not found in either regular or mod character collections`);
          }
          
          const collection = await getCharacterInventoryCollection(char.name);
          const inventoryItems = await collection.find({}).toArray();
          const totalQuantity = inventoryItems
            .filter((it) => it.itemName.toLowerCase() === name.toLowerCase())
            .reduce((sum, it) => sum + it.quantity, 0);
          return { available: totalQuantity >= needed, quantity: totalQuantity };
        } catch (invError) {
          handleError(invError, 'blightHandler.js', {
            operation: 'fetchInventory',
            commandName: interaction.commandName || 'submit',
            userTag: interaction.user.tag,
            userId: interaction.user.id,
            characterName: character.name,
            itemName: name,
            neededQuantity: needed
          });
          console.error('[blightHandler]: Error fetching inventory', invError);
          throw invError;
        }
      };

      const validationResult = await hasItem(character._id, requiredItem.name, requiredItem.quantity);
      if (!validationResult.available) {
        const insufficientItemEmbed = new EmbedBuilder()
          .setColor(0xFF0000)
          .setTitle('❌ Not Enough Items')
          .setDescription(`**${character.name}** doesn't have enough of **${requiredItem.name}** for this submission.`)
          .addFields(
            { name: 'You Have', value: `${requiredItem.name} x${validationResult.quantity}`, inline: true },
            { name: 'Needed', value: `${requiredItem.name} x${requiredItem.quantity}`, inline: true }
          )
          .setThumbnail(healer.iconUrl)
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: 'Healing Submission Error', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
          .setTimestamp();

        await interaction.editReply({
          embeds: [insufficientItemEmbed],
          flags: [4096]
        });
        return;
      }

      const removed = await removeItemInventoryDatabase(character._id, itemName, itemQuantityInt, interaction);
      if (!removed) {
        throw new Error(`Failed to remove ${itemName} x${itemQuantityInt} from inventory.`);
      }

      // Item removal is now automatically logged to Google Sheets by removeItemInventoryDatabase function

      await deleteBlightRequestFromStorage(submissionId);
      await completeBlightHealing(character, interaction, interaction.client);

      const embed = createBlightHealingCompleteEmbed(character, healer, [
        {
          name: 'Submitted Item',
          value: `${requiredItem.emoji || ''} **Item**: ${itemName} x${itemQuantityInt}`
        },
        {
          name: 'Inventory Link',
          value: `[View Inventory](${character.inventory})`
        }
      ]);

      await interaction.editReply({ embeds: [embed], flags: [] });
      return;
    }

    // ========================================================================
    // ------------------- Submission Type: Art or Writing -------------------
    // ========================================================================
    if (['art', 'writing'].includes(submission.taskType)) {
      if (!link) {
        const linkRequiredEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Submission Link Required')
          .setDescription('You must provide a link to your completed art or writing submission.')
          .addFields(
            { 
              name: '📝 What This Means', 
              value: `For **${submission.taskType}** tasks, you need to provide a link to your completed work.` 
            },
            { 
              name: '🔗 How to Get a Valid Link', 
              value: '1. Post your art/writing in the submissions channel\n2. Include your blight healing request ID when submitting\n3. Wait for a moderator to approve with a checkmark emoji\n4. Right-click on your approved submission and select "Copy Message Link"\n5. Use that link with the `/blight submit` command' 
            },
            { 
              name: '💡 Important Notes', 
              value: '• The submission must be **approved** by a moderator (look for checkmark emoji)\n• The link must be from a **Discord message**, not a general channel link\n• Make sure the submission includes your blight healing request ID' 
            },
            { 
              name: '🆘 Need Help?', 
              value: 'If you haven\'t created your submission yet, use `/submit art` or `/submit writing` first.' 
            }
          )
          .setImage('https://storage.googleapis.com/tinglebot/border.png')
          .setFooter({ text: 'Blight Healing Submission Error', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
          .setTimestamp();
        
        await interaction.editReply({ 
          embeds: [linkRequiredEmbed],
          flags: [4096] 
        });
        return;
      }

      // Validate Discord message link and check for approval
      const linkValidation = await validateDiscordMessageLink(link, interaction.client, submission.submissionId);
      if (!linkValidation.valid) {
        const errorEmbed = createBlightSubmissionErrorEmbed(linkValidation.error);
        await interaction.editReply({ 
          embeds: [errorEmbed],
          flags: [4096] 
        });
        return;
      }

      submission.status = 'completed';
      submission.submittedAt = new Date().toISOString();
      await deleteBlightRequestFromStorage(submissionId);
      await completeBlightHealing(character, interaction, interaction.client);

      const embed = createBlightHealingCompleteEmbed(character, healer, [
        {
          name: 'Submitted Link',
          value: `[View Approved Submission](${link})`
        },
        {
          name: 'Approval Status',
          value: '✅ **Approved by Moderator** - This submission has been verified and approved for blight healing.'
        },
        {
          name: 'Blight ID Verification',
          value: linkValidation.blightIdVerified ? 
            `✅ **Verified** - This submission is confirmed for blight healing request \`${linkValidation.foundBlightId}\`` :
            '⚠️ **No Blight ID** - This submission was not created with a specific blight healing request ID.'
        }
      ]);

      await interaction.editReply({ embeds: [embed], flags: [] });
      return;
    }

  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'submitHealingTask',
      commandName: interaction.commandName || 'submit',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      submissionId,
      item: item ? 'provided' : 'not provided',
      link: link ? 'provided' : 'not provided',
      tokens
    });
    console.error('[blightHandler]: Error submitting healing task:', error);
    
    // Create detailed error message with specific guidance
    let errorMessage = '❌ **Blight Submission Error**\n\n';
    
    // Add specific error details based on error type
    if (error.name === 'ValidationError') {
      errorMessage += '**Error Type**: Data Validation Error\n';
      errorMessage += '**What Happened**: The system couldn\'t validate your submission data.\n';
      errorMessage += '**How to Fix**: Please check your submission ID and try again.\n';
    } else if (error.name === 'CastError') {
      errorMessage += '**Error Type**: Data Type Error\n';
      errorMessage += '**What Happened**: The system encountered an issue with data formatting.\n';
      errorMessage += '**How to Fix**: Please ensure your submission ID is correct.\n';
    } else if (error.code === 11000) {
      errorMessage += '**Error Type**: Duplicate Submission\n';
      errorMessage += '**What Happened**: This submission has already been processed.\n';
      errorMessage += '**How to Fix**: Check if you\'ve already submitted this task.\n';
    } else if (error.message && error.message.includes('timeout')) {
      errorMessage += '**Error Type**: Database Timeout\n';
      errorMessage += '**What Happened**: The system took too long to process your request.\n';
      errorMessage += '**How to Fix**: Please try again in a few moments.\n';
    } else if (error.message && error.message.includes('connection')) {
      errorMessage += '**Error Type**: Database Connection Error\n';
      errorMessage += '**What Happened**: The system couldn\'t connect to the database.\n';
      errorMessage += '**How to Fix**: Please try again later.\n';
    } else {
      errorMessage += '**Error Type**: Unexpected Error\n';
      errorMessage += '**What Happened**: Something went wrong while processing your submission.\n';
      errorMessage += '**How to Fix**: Please try again. If the issue persists, contact a moderator.\n';
    }
    
    // Add submission details for debugging
    errorMessage += '\n**Submission Details**:\n';
    errorMessage += `- Submission ID: \`${submissionId}\`\n`;
    errorMessage += `- Item: ${item ? `\`${item}\`` : 'Not provided'}\n`;
    errorMessage += `- Link: ${link ? 'Provided' : 'Not provided'}\n`;
    errorMessage += `- Tokens: ${tokens ? 'Yes' : 'No'}\n`;
    
    // Add troubleshooting steps
    errorMessage += '\n**Troubleshooting Steps**:\n';
    errorMessage += '1. Verify your submission ID is correct\n';
    errorMessage += '2. Check if the submission hasn\'t expired\n';
    errorMessage += '3. Ensure you\'re using the correct command format\n';
    errorMessage += '4. Try the command again in a few moments\n';
    
    // Add support information
    errorMessage += '\n**Need Help?**\n';
    errorMessage += '- Use </blight heal:1306176789634355241> to request a new healing task\n';
    errorMessage += '- Contact a moderator if the issue persists\n';
    errorMessage += '- Check the bot status in the server\n';
    
    // Add technical details for mods
    errorMessage += '\n**Technical Details** (for moderators):\n';
    errorMessage += `- Error: ${error.message || 'Unknown error'}\n`;
    errorMessage += `- User: ${interaction.user.tag} (${interaction.user.id})\n`;
    errorMessage += `- Command: ${interaction.commandName || 'submit'}\n`;
    errorMessage += `- Timestamp: ${new Date().toISOString()}`;
    
    try {
      await interaction.editReply({ content: errorMessage, flags: [4096] });
    } catch (replyError) {
      logger.error('INTERACTION', 'Failed to send detailed error reply');
      // Fallback to simple error message
      try {
        await interaction.followUp({ 
          content: '❌ An error occurred while processing your request. Please contact a moderator.', 
          flags: [4096] 
        });
      } catch (followUpError) {
        console.error('[blightHandler]: Failed to send follow-up error message:', followUpError);
      }
    }
  }
}

// ------------------- Function: validateDiscordMessageLink -------------------
// Validates if a link is a valid Discord message link, belongs to the correct channel,
// has been approved by Tinglebot (checkmark emoji reaction), and contains the claimed blight ID
// 
// This function performs four levels of validation:
// 1. Format validation: Ensures the link follows Discord message link format
// 2. Channel validation: Verifies the message is from the submissions channel
// 3. Approval validation: Checks if Tinglebot has reacted with a checkmark emoji
// 4. Blight ID validation: Verifies the submission contains the claimed blight ID
//
// Parameters:
// - link: The Discord message link to validate
// - client: Discord.js client instance (optional, for approval checking)
// - claimedBlightId: The blight ID the user is claiming (optional)
//
// Returns:
// - Object with validation results including approval status and blight ID verification
async function validateDiscordMessageLink(link, client, claimedBlightId = null) {
  try {
    // Discord message link format: https://discord.com/channels/guildId/channelId/messageId
    const discordLinkRegex = /^https:\/\/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)$/;
    const match = link.match(discordLinkRegex);
    
    if (!match) {
      return {
        valid: false,
        error: 'Invalid Discord message link format. Please provide a valid Discord message link.'
      };
    }

    const [, guildId, channelId, messageId] = match;
    
    // Check if the link is from the submissions channel or the additional allowed channel
    const submissionsChannelId = process.env.SUBMISSIONS;
    const additionalChannelId = '940446392789389362';
    const allowedChannels = [submissionsChannelId, additionalChannelId].filter(Boolean);
    
    if (allowedChannels.length > 0 && !allowedChannels.includes(channelId)) {
      return {
        valid: false,
        error: 'The submission link must be from the submissions channel.'
      };
    }

    // Check if the message has been approved by Tinglebot (checkmark emoji reaction)
    if (client) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
          return {
            valid: false,
            error: 'Could not access the submission channel. Please ensure the link is correct.'
          };
        }

        const message = await channel.messages.fetch(messageId);
        if (!message) {
          return {
            valid: false,
            error: 'Could not find the submission message. Please ensure the link is correct.'
          };
        }

        // Check for checkmark emoji reactions from Tinglebot
        const checkmarkReactions = message.reactions.cache.filter(reaction => {
          // Check for various checkmark emojis
          const isCheckmark = reaction.emoji.name === '✅' || 
                             reaction.emoji.name === '☑️' || 
                             reaction.emoji.name === '✔️' ||
                             reaction.emoji.id === '854499720797618207'; // Custom checkmark emoji ID if exists
          
          // Check if Tinglebot has reacted with the checkmark
          return isCheckmark && reaction.users.cache.has(client.user.id);
        });

        if (checkmarkReactions.size === 0) {
          return {
            valid: false,
            error: 'This submission has not been approved yet. Please wait for a moderator to approve your submission with a checkmark emoji before using it for blight healing.'
          };
        }

        // Check if the submission contains the claimed blight ID
        let blightIdVerified = false;
        let foundBlightId = null;
        
        if (claimedBlightId) {
          // Check the embed fields for blight ID
          if (message.embeds && message.embeds.length > 0) {
            const embed = message.embeds[0];
            if (embed.fields) {
              const blightIdField = embed.fields.find(field => 
                field.name && field.name.includes('🩸 Blight Healing ID') && 
                field.value && field.value.includes(claimedBlightId)
              );
              
              if (blightIdField) {
                blightIdVerified = true;
                foundBlightId = claimedBlightId;
              } else {
                // Check if there's any blight ID field that doesn't match
                const anyBlightIdField = embed.fields.find(field => 
                  field.name && field.name.includes('🩸 Blight Healing ID')
                );
                
                if (anyBlightIdField) {
                  return {
                    valid: false,
                    error: `This submission is for a different blight healing request (${anyBlightIdField.value}). Please use the correct submission for your blight healing request.`
                  };
                } else {
                  return {
                    valid: false,
                    error: `This submission does not contain a blight healing ID. Please use a submission that was created with a blight ID for your healing request.`
                  };
                }
              }
            }
          }
        }

        return {
          valid: true,
          guildId,
          channelId,
          messageId,
          approved: true,
          blightIdVerified,
          foundBlightId
        };
      } catch (fetchError) {
        console.error('[blightHandler.js]: Error fetching message for approval check:', fetchError);
        return {
          valid: false,
          error: 'Could not verify submission approval. Please ensure the link is correct and try again.'
        };
      }
    }

    // Fallback if no client provided (for testing or other contexts)
    return {
      valid: true,
      guildId,
      channelId,
      messageId,
      approved: false, // We can't verify without client
      blightIdVerified: false,
      foundBlightId: null
    };
  } catch (error) {
    return {
      valid: false,
      error: 'Error validating Discord message link.'
    };
  }
}

// ============================================================================
// ------------------- Blight Progression -------------------
// Handles rolling for progression, reminders, auto-progress, etc.
// ============================================================================

// ------------------- Function: rollForBlightProgression -------------------
// Rolls to advance or maintain a character's blight stage once per daily window.
async function rollForBlightProgression(interaction, characterName) {
  try {
    // ------------------- Input Validation -------------------
    if (!characterName || typeof characterName !== 'string') {
      await interaction.editReply({ content: '❌ Invalid character name provided.', flags: [4096] });
      return;
    }

    // Try to find character in both Character and ModCharacter collections
    let character = await Character.findOne({ name: characterName });
    let isModCharacter = false;
    
    if (!character) {
      character = await ModCharacter.findOne({ name: characterName });
      isModCharacter = true;
    }
    
    if (!character) {
      await interaction.editReply({ content: `❌ Character "${characterName}" not found.`, flags: [4096] });
      return;
    }
    
    // Verify ownership for mod characters (they might have different ownership model)
    if (isModCharacter && character.userId !== interaction.user.id) {
      await interaction.editReply({ content: `❌ You can only roll for your **own** characters!`, flags: [4096] });
      return;
    }

    if (!character.blighted) {
      const notBlightedEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('⚠️ Not Blighted')
        .setDescription(`**${characterName}** is not blighted and does not require healing.`)
        .setThumbnail(character.icon)
        .setAuthor({ name: `${characterName}'s Status`, iconURL: interaction.user.displayAvatarURL() })
        .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
        .setFooter({ text: 'Blight Status Check', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
        .setTimestamp();

      await interaction.editReply({ 
        content: `<@${interaction.user.id}>`,
        embeds: [notBlightedEmbed],
        flags: [4096] 
      });
      return;
    }

    // Prevent stage 5 characters from rolling
    if (character.blightStage === 5) {
      await interaction.editReply({
        content: `⚠️ **${characterName}** is at Stage 5 Blight and cannot roll anymore.\n\n` +
          `You have until <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:F> to be healed by a Dragon or your character will die.`,
        flags: [4096],
      });
      return;
    }

    // Skip roll and stage progression when blight is paused
    if (character.blightPaused) {
      const pausedEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle('⏸️ Blight Progression Paused')
        .setDescription(
          `**${characterName}**'s blight progression is currently **paused**.\n\n` +
          `No roll is required. Blight stage will not advance until a moderator unpauses.`
        )
        .setThumbnail(character.icon)
        .setAuthor({ name: `${characterName}'s Blight Status`, iconURL: interaction.user.displayAvatarURL() })
        .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
        .setFooter({ text: 'Blight Roll Call', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
        .setTimestamp();

      await interaction.editReply({
        content: `<@${interaction.user.id}>`,
        embeds: [pausedEmbed],
        flags: [4096],
      });
      return;
    }

    // ------------------- Enhanced Blight Call Timing Logic -------------------
    const now = new Date();
    
    // Get current hour in UTC
    const utcHour = getHourInUTC(now);
    
    // Calculate 1:00 AM UTC today (which is 8:00 PM EST the previous day)
    const today1AMUTC = get1AMUTC(now);
    
    // Calculate current and next call windows
    const currentCallStart = new Date(today1AMUTC);
    const nextCallStart = new Date(currentCallStart);
    if (utcHour >= 1) {
      nextCallStart.setDate(currentCallStart.getDate() + 1);
    }

    const lastRollDate = character.lastRollDate || new Date(0);
    
    // Determine which 1:00 AM UTC boundary to check against (8:00 PM EST)
    // If we're before 1 AM today, check against yesterday's 1 AM
    // If we're after 1 AM today, check against today's 1 AM
    let rollBoundary;
    if (utcHour < 1) {
      // Before 1 AM today - check against yesterday's 1 AM
      // Subtract one day from now and get 1 AM UTC for that date
      const yesterday = new Date(now);
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      rollBoundary = get1AMUTC(yesterday);
    } else {
      // After 1 AM today - check against today's 1 AM
      rollBoundary = today1AMUTC;
    }
    
    // Check if character has already rolled since the roll boundary
    // A character can only roll once per "day" (1 AM UTC to 1 AM UTC window, which is 8 PM EST to 8 PM EST)
    if (character.lastRollDate && character.lastRollDate > rollBoundary) {
      // Debug logging
      console.log(`[blightHandler]: ${characterName} already rolled - Last roll: ${character.lastRollDate.toISOString()}, Roll boundary: ${rollBoundary.toISOString()}, Current time: ${now.toISOString()}`);
      
      const timeUntilNextRoll = nextCallStart - now;
      const hoursUntilNextRoll = Math.floor(timeUntilNextRoll / (1000 * 60 * 60));
      const minutesUntilNextRoll = Math.floor((timeUntilNextRoll % (1000 * 60 * 60)) / (1000 * 60));

      const alreadyRolledEmbed = new EmbedBuilder()
        .setColor('#AD1457')
        .setTitle('⏰ Already Rolled for Blight')
        .setDescription(
          `**${characterName}** has already rolled today.\n\n` +
          `🎯 **Rolls reset at 8:00 PM EST (1:00 AM UTC) every day!**\n\n` +
          `You can roll again in **${hoursUntilNextRoll} hours and ${minutesUntilNextRoll} minutes**.\n\n` +
          `*Remember to roll daily to prevent automatic blight progression!*`
        )
        .setThumbnail(character.icon)
        .setAuthor({ name: `${characterName}'s Blight Status`, iconURL: interaction.user.displayAvatarURL() })
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .setFooter({ text: 'Blight Roll Call', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
        .setTimestamp();

      await interaction.editReply({ 
        content: `<@${interaction.user.id}>`,
        embeds: [alreadyRolledEmbed],
        flags: [4096] 
      });
      return;
    }

    // ------------------- Roll & Stage Determination -------------------
    character.lastRollDate = new Date(); // Use UTC time consistently
    
    // Debug logging
    logger.info('BLIGHT', `${characterName} rolling for blight - Current time: ${now.toISOString()}, Roll boundary: ${rollBoundary.toISOString()}, Next blight call: ${nextCallStart.toISOString()}`);
    
    const roll = Math.floor(Math.random() * 1000) + 1;
    let stage;
    let embedTitle;
    let embedDescription;
    const blightEmoji = '<:blight_eye:805576955725611058>';
    const previousStage = character.blightStage || 1;

    // Determine progression based on roll thresholds
    // Only one stage can progress at a time
    if (roll <= 25 && previousStage === 1) {
      // Stage 1 -> 2
      stage = 2;
      embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 2 ${blightEmoji}`;
      embedDescription = `⚠️ Infected areas spread inside and out, and the blight begins traveling toward vital organs. Fatigue fades but nausea typically persists.\n\nInfected now experience an **increase in physical strength**.\n\n🎯 **Stage 2 Effect**: Your rolls are now multiplied by 1.5x.\n\nYou can still be healed by **sages, oracles, or dragons**.`;
    } else if (roll <= 40 && previousStage === 2) {
      // Stage 2 -> 3
      stage = 3;
      embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 3 ${blightEmoji}`;
      embedDescription = `⚠️ Visible infected areas and feverish symptoms fade. You experience **frequent nosebleeds** and **malice-like sputum**, which can now **infect others**.\n\nHallucinations, **further strength increases**, and **aggressive mood swings** occur.\n\n👻 **Stage 3 Effect**: Monsters no longer attack you.\n\nAt this stage, healing is only possible by **oracles or dragons**.`;
    } else if (roll <= 67 && previousStage === 3) {
      // Stage 3 -> 4
      stage = 4;
      embedTitle = `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 4 ${blightEmoji}`;
      embedDescription = `⚠️ All outward signs of infection vanish—**except your eyes**, which now resemble those of Malice.\n\nVital organs begin to **fail**, and the infected is driven by an **uncontrollable desire to destroy**.\n\nAny contact with bodily fluids poses a **severe infection risk to others**.\n\n💀 **Stage 4 Effect**: No monsters. No gathering.\n\nYou can only be healed by **dragons** at this stage.`;
    } else if (roll <= 100 && previousStage === 4) {
      // Stage 4 -> 5
      stage = 5;
      character.deathDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      embedTitle = `☠ Your Blight Sickness IS ON THE EDGE of STAGE 5 ☠`;
      embedDescription = `⚠️ You are dangerously close to death.\n\nYou have **7 days** to complete your **healing prompt** or find **miraculous intervention**. Stage 5 is irreversible.\n\n💀 **Stage 5 Effect**: No monsters. No gathering. No healing except by Dragons.\n\nThis is your **final warning**.`;
    } else {
      // No progression - stay at current stage
      stage = previousStage;
      embedTitle = `🎉 Safe Roll! No Blight Progression Today! 🎉`;
      embedDescription = `You rolled a ${roll}, which is safe. **${characterName}** remains at Stage ${previousStage}. Keep rolling daily to avoid blight progression!`;
    }

    // ------------------- Update Character -------------------
    character.blightStage = stage;
    character.blightEffects = {
      rollMultiplier: stage === 2 ? 1.5 : 1.0,
      noMonsters: stage >= 3,
      noGathering: stage >= 4
    };
    await character.save();

    // ------------------- Log Blight Roll History -------------------
    const BlightRollHistory = require('@/models/BlightRollHistoryModel');
    try {
      // Ensure we're connected to the main database
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(process.env.MONGODB_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true
        });
      }
      
      logger.info('BLIGHT', `Creating blight roll history for ${character.name} - Roll: ${roll}, Previous Stage: ${previousStage}, New Stage: ${stage}`);
      const historyEntry = await BlightRollHistory.create({
        characterId: character._id,
        characterName: character.name,
        userId: character.userId,
        rollValue: roll,
        previousStage,
        newStage: stage,
        timestamp: new Date(),
        notes: ''
      });
      logger.success('BLIGHT', `Successfully created blight roll history entry: ${historyEntry._id}`);
    } catch (error) {
      handleError(error, 'blightHandler.js', {
        operation: 'createBlightRollHistory',
        commandName: interaction.commandName || 'roll',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        characterName
      });
      console.error('[blightHandler]: Failed to create blight roll history:', error);
    }

    // ------------------- Embed Construction -------------------
    const embed = new EmbedBuilder()
      .setColor('#AD1457')
      .setTitle(embedTitle)
      .setDescription(embedDescription)
      .setFooter({ text: `🎲 Roll: ${roll}` })
      .setThumbnail(character.icon)
      .setAuthor({ name: `${characterName}'s Blight Progression`, iconURL: interaction.user.displayAvatarURL() })
      .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
      .setTimestamp();

    await interaction.editReply({ content: `<@${interaction.user.id}> rolled for ${characterName}`, embeds: [embed] });
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'rollForBlightProgression',
      commandName: interaction.commandName || 'roll',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName
    });
    console.error('[blightHandler]: Error rolling for blight progression:', error);
    await interaction.editReply({ content: '❌ An error occurred while processing your request.', flags: [4096] });
  }
}

// ------------------- Function: postBlightRollCall -------------------
// Sends daily roll reminder at 8:00 PM UTC to the configured channel.
async function postBlightRollCall(client) {
  try {
    const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID;
    // Use BLIGHT_REMINDER_ROLE_ID if set, otherwise fall back to the blighted character role ID
    // This ensures users with blighted characters always get pinged
    const BLIGHTED_ROLE_ID = '798387447967907910';
    const roleId = process.env.BLIGHT_REMINDER_ROLE_ID || BLIGHTED_ROLE_ID;

    if (!client || !client.channels) {
      console.error('[blightHandler]: Invalid Discord client.');
      logger.error('BLIGHT', 'Invalid Discord client in postBlightRollCall');
      return;
    }

    if (!channelId) {
      console.error('[blightHandler]: BLIGHT_NOTIFICATIONS_CHANNEL_ID not set in environment variables.');
      logger.error('BLIGHT', 'BLIGHT_NOTIFICATIONS_CHANNEL_ID not configured');
      return;
    }
    
    // Log which role ID is being used
    if (process.env.BLIGHT_REMINDER_ROLE_ID) {
      logger.info('BLIGHT', `Using BLIGHT_REMINDER_ROLE_ID: ${process.env.BLIGHT_REMINDER_ROLE_ID}`);
    } else {
      logger.info('BLIGHT', `BLIGHT_REMINDER_ROLE_ID not set, falling back to blighted character role: ${BLIGHTED_ROLE_ID}`);
    }

    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      console.error('[blightHandler]: Channel not found for posting blight roll call.');
      logger.error('BLIGHT', `Channel not found: ${channelId}`);
      return;
    }

    // Check if bot has permission to send messages
    if (!channel.permissionsFor(client.user)?.has(['SendMessages', 'ViewChannel'])) {
      console.error('[blightHandler]: Bot lacks permissions to send messages in blight notifications channel.');
      logger.error('BLIGHT', `Bot lacks permissions in channel: ${channelId}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#AD1457')
      .setTitle('📢 Daily Blight Roll Call! Please roll to see if your Blight gets any worse!')
      .setDescription(
        `**__INSTRUCTIONS__** ▻\n` +
        `Use this command:  \n` +
        `\`/blight roll character_name\`  \n` + `➸ And you're done until the next time!\n\n` +
        `**~~────────────────────~~**  \n` +
        `▹ [Blight Information](https://rootsofthewild.com/world/blight 'Blight Information')  \n` +
        `**~~────────────────────~~**  \n` +
        `:clock8: Blight calls happen every day around 8:00 PM UTC!  \n` +
        `:alarm_clock: You must complete your roll before the next call for it to be counted!  \n` +
        `:warning: Remember, if you miss a roll you __automatically progress to the next stage__.  \n` +
        `▹To request blight healing, please use </blight heal:1306176789634355241>`
      )
      .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
      .setFooter({ text: 'Blight calls happen daily at 8:00 PM UTC!' })
      .setTimestamp();

    // Send role ping if roleId is configured
    if (roleId) {
      try {
        const pingMessage = await channel.send({ content: `<@&${roleId}>` });
        logger.info('BLIGHT', `Role ping sent successfully: ${pingMessage.id}`);
      } catch (pingError) {
        console.error('[blightHandler]: Failed to send role ping:', pingError);
        logger.error('BLIGHT', `Failed to send role ping: ${pingError.message}`);
        // Continue to send embed even if ping fails
      }
    } else {
      logger.warn('BLIGHT', 'BLIGHT_REMINDER_ROLE_ID not configured, skipping role ping');
    }

    // Send embed message
    try {
      const embedMessage = await channel.send({ embeds: [embed] });
      logger.success('BLIGHT', `Blight roll call posted successfully - Message ID: ${embedMessage.id}`);
      console.log(`[blightHandler]: ✅ Blight roll call posted to channel ${channelId} - Message ID: ${embedMessage.id}`);
    } catch (embedError) {
      console.error('[blightHandler]: Failed to send blight roll call embed:', embedError);
      logger.error('BLIGHT', `Failed to send blight roll call embed: ${embedError.message}`);
      throw embedError;
    }
  } catch (error) {
    console.error('[blightHandler]: Error in postBlightRollCall:', error);
    logger.error('BLIGHT', `Error in postBlightRollCall: ${error.message}`);
    throw error;
  }
}

// ============================================================================
// ------------------- Function: checkAndPostMissedBlightPing -------------------
// Checks if the blight ping was sent since the last 8pm UTC boundary.
// If not, and we're past that boundary, posts the ping.
// This is a fallback mechanism to ensure the ping is sent even if the bot was offline.
// ============================================================================

async function checkAndPostMissedBlightPing(client) {
  try {
    logger.info('BLIGHT', 'checkAndPostMissedBlightPing called at ' + new Date().toISOString());
    
    // Skip this check at exactly 1:00 AM UTC
    // Note: 1:00 AM UTC = 8:00 PM EST (the previous day)
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();
    
    logger.info('BLIGHT', `Current UTC time: ${utcHour}:${utcMinute.toString().padStart(2, '0')} UTC`);
    
    // Skip if we're at exactly 1:00 AM UTC (when the main job runs)
    if (utcHour === 1 && utcMinute === 0) {
      logger.info('BLIGHT', 'Skipping missed blight ping check at 1:00 AM UTC');
      return;
    }
    
    const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID;
    
    if (!client || !client.channels) {
      console.error('[blightHandler]: Invalid Discord client in checkAndPostMissedBlightPing');
      logger.error('BLIGHT', 'Invalid Discord client in checkAndPostMissedBlightPing');
      return;
    }
    
    if (!channelId) {
      console.error('[blightHandler]: BLIGHT_NOTIFICATIONS_CHANNEL_ID not set in environment variables.');
      logger.error('BLIGHT', 'BLIGHT_NOTIFICATIONS_CHANNEL_ID not configured');
      return;
    }
    
    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      console.error('[blightHandler]: Channel not found for checking blight ping.');
      logger.error('BLIGHT', `Channel not found: ${channelId}`);
      return;
    }
    
    // Check if bot has permission to read message history
    if (!channel.permissionsFor(client.user)?.has(['ReadMessageHistory', 'ViewChannel'])) {
      console.error('[blightHandler]: Bot lacks permissions to read message history in blight notifications channel.');
      logger.error('BLIGHT', `Bot lacks permissions to read messages in channel: ${channelId}`);
      return;
    }
    
    // Calculate today's 1:00 AM UTC boundary (which is 8:00 PM EST the previous day)
    // The backup check runs at 1:57 AM UTC, so we should check if a message was posted
    // after today's 1:00 AM UTC (which is when the main job should have run at 8:00 PM EST)
    const today1AMUTC = get1AMUTC(now);
    
    // The boundary we're checking against is today's 1:00 AM UTC
    // (the main job should have run at this time, 57 minutes ago)
    const last1AMBoundary = today1AMUTC;
    
    // Only proceed if we're past today's 1:00 AM UTC boundary
    // (i.e., it's at least 1:00 AM UTC today, so the main job should have already run)
    if (now < last1AMBoundary) {
      logger.info('BLIGHT', 'Not yet past today\'s 1:00 AM UTC boundary (8:00 PM EST) - skipping check');
      return;
    }
    
    // Additional safety check: if we're before 1:57 AM UTC
    if (utcHour < 1 || (utcHour === 1 && utcMinute < 57)) {
      logger.info('BLIGHT', 'Before 1:57 AM UTC - main job may still be running, skipping backup check');
      return;
    }
    
    logger.info('BLIGHT', `Backup check running at ${utcHour}:${utcMinute.toString().padStart(2, '0')} UTC - checking if main job posted at 1:00 AM UTC (8:00 PM EST)`);
    
      // Fetch recent messages from the channel (last 50 messages should be enough)
      // We'll look for messages from the bot that contain the blight ping
      try {
        const messages = await channel.messages.fetch({ limit: 50 });
        
        // Filter messages from the bot that match the blight ping pattern
        // Look for messages with role ping or embed with the blight roll call title
        const botMessages = messages.filter(msg => msg.author.id === client.user.id);
        const blightPingMessages = botMessages.filter(msg => {
          // Check if message contains role ping
          if (msg.content && msg.content.includes('<@&')) {
            return true;
          }
          
          // Check if message has embed with blight roll call title
          if (msg.embeds && msg.embeds.length > 0) {
            const embed = msg.embeds[0];
            if (embed.title && embed.title.includes('Daily Blight Roll Call')) {
              return true;
            }
          }
          
          return false;
        });
        
        // Check if any blight ping message was sent after the last 1:00 AM UTC boundary (8:00 PM EST)
        const pingSentAfterBoundary = blightPingMessages.some(msg => 
          msg.createdTimestamp >= last1AMBoundary.getTime()
        );
        
        if (pingSentAfterBoundary) {
          logger.info('BLIGHT', 'Blight ping already sent since last 1:00 AM UTC boundary (8:00 PM EST) - skipping');
          return;
        }
        
        // Blight ping was not sent since the last 1:00 AM UTC boundary (8:00 PM EST) - send it now
        logger.info('BLIGHT', 'Posting missed blight ping (fallback) - no ping found since last 1:00 AM UTC boundary');
        await postBlightRollCall(client);
      
    } catch (fetchError) {
      console.error('[blightHandler]: Error fetching messages in checkAndPostMissedBlightPing:', fetchError);
      logger.error('BLIGHT', `Error fetching messages: ${fetchError.message}`);
      // Don't throw - just log the error
    }
    
  } catch (error) {
    console.error('[blightHandler]: Error in checkAndPostMissedBlightPing:', error);
    logger.error('BLIGHT', `Error in checkAndPostMissedBlightPing: ${error.message}`);
    // Don't throw - this is a fallback check, shouldn't crash the bot
  }
}

// ------------------- Function: viewBlightStatus -------------------
// Displays current blight status, submission progress, and deadlines for a character.
async function viewBlightStatus(interaction, characterName) {
  try {
    const character = await Character.findOne({ name: characterName });
    if (!character) {
      await interaction.editReply({ content: `❌ Character "${characterName}" not found.`, flags: [4096] });
      return;
    }

    // Check if character is currently blighted
    if (!character.blighted) {
      const notBlightedEmbed = new EmbedBuilder()
        .setColor('#00FF00') // Green color for positive message
        .setTitle('✅ Not Blighted')
        .setDescription(`**${characterName}** is not currently blighted.`)
        .setThumbnail(character.icon)
        .setAuthor({ name: `${characterName}'s Status`, iconURL: interaction.user.displayAvatarURL() })
        .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
        .setFooter({ text: 'Blight Status Check', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/border_blight.png' })
        .setTimestamp();

      await interaction.editReply({ 
        content: `<@${interaction.user.id}>`,
        embeds: [notBlightedEmbed],
        flags: [4096] 
      });
      return;
    }

    // Get current blight submission if any
    const blightSubmissions = await loadBlightSubmissions();
    const currentSubmission = Object.values(blightSubmissions).find(
      sub => sub.characterName === characterName && sub.status === 'pending'
    );

    // Get last blight roll history entry
    const BlightRollHistory = require('@/models/BlightRollHistoryModel');
    const lastRoll = await BlightRollHistory.findOne({ characterId: character._id })
      .sort({ timestamp: -1 })
      .limit(1);

    // Create status embed
    const embed = new EmbedBuilder()
      .setColor('#AD1457')
      .setTitle(`📊 Blight Status: ${characterName}`)
      .setDescription(`Current blight status and submission progress for **${characterName}**`)
      .setThumbnail(character.icon)
      .setAuthor({ name: characterName, iconURL: character.icon })
      .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
      .setFooter({ text: 'Blight Status Report' })
      .setTimestamp();

    // Add current stage info
    const stageEmoji = character.blightStage === 5 ? '☠️' : 
                     character.blightStage === 4 ? '💀' :
                     character.blightStage === 3 ? '👻' :
                     character.blightStage === 2 ? '🎯' : '⚠️';
    
    embed.addFields({
      name: `${stageEmoji} Current Stage`,
      value: `**Stage ${character.blightStage}** - ${getBlightStageDescription(character.blightStage)}`,
      inline: true
    });

    // Add village info
    embed.addFields({
      name: '🏘️ Village',
      value: character.currentVillage || 'Unknown',
      inline: true
    });

    // Add blight pause status
    if (character.blightPaused) {
      embed.addFields({
        name: '⏸️ Status',
        value: '**Blight Progression Paused**',
        inline: true
      });
    }

    // Add last roll info
    if (lastRoll) {
      const lastRollDate = new Date(lastRoll.timestamp);
      const timeSinceLastRoll = Math.floor((Date.now() - lastRollDate.getTime()) / (1000 * 60 * 60 * 24)); // days
      
      embed.addFields({
        name: '🎲 Last Roll',
        value: `**${lastRollDate.toLocaleDateString()}** at **${lastRollDate.toLocaleTimeString()}**\n` +
               `Roll: **${lastRoll.rollValue}** (${lastRoll.previousStage} → ${lastRoll.newStage})\n` +
               `${timeSinceLastRoll === 0 ? 'Today' : timeSinceLastRoll === 1 ? 'Yesterday' : `${timeSinceLastRoll} days ago`}`,
        inline: false
      });
    }

    // Add submission status
    if (currentSubmission) {
      const expiresAt = new Date(currentSubmission.expiresAt);
      const timeLeft = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60)); // hours
      
      // Determine status color and urgency
      let statusEmoji = '🔄';
      let urgencyText = '';
      
      if (timeLeft <= 0) {
        statusEmoji = '⏰';
        urgencyText = '\n⚠️ **EXPIRED** - This request has expired and needs to be renewed.';
      } else if (timeLeft <= 24) {
        statusEmoji = '⚠️';
        urgencyText = '\n🚨 **URGENT** - This request expires soon!';
      } else if (timeLeft <= 72) {
        statusEmoji = '⏳';
        urgencyText = '\n⏰ **Expiring Soon** - Complete your task quickly.';
      }
      
      embed.addFields({
        name: `${statusEmoji} Healing Request`,
        value: `**Status:** Pending approval from **${currentSubmission.healerName}**\n` +
               `**Task:** ${currentSubmission.taskType}\n` +
               `**Expires:** <t:${Math.floor(expiresAt.getTime() / 1000)}:R>\n` +
               `**Submission ID:** \`${currentSubmission.submissionId}\`` +
               urgencyText,
        inline: false
      });

      // Add task details
      if (currentSubmission.taskDetails) {
        embed.addFields({
          name: '📋 Task Requirements',
          value: currentSubmission.taskDetails,
          inline: false
        });
      }
    } else {
      embed.addFields({
        name: '🔄 Healing Request',
        value: '**No active healing request**\nUse `/blight heal` to request healing',
        inline: false
      });
    }

    // Add death deadline for stage 5
    if (character.blightStage === 5 && character.deathDeadline) {
      const deathDeadline = new Date(character.deathDeadline);
      const timeUntilDeath = Math.floor((deathDeadline.getTime() - Date.now()) / (1000 * 60 * 60)); // hours
      
      embed.addFields({
        name: '⚰️ Death Deadline',
        value: `**${deathDeadline.toLocaleDateString()}** at **${deathDeadline.toLocaleTimeString()}**\n` +
               `**Time remaining:** <t:${Math.floor(deathDeadline.getTime() / 1000)}:R>`,
        inline: false
      });
    }

    // Add next roll reminder
    let nextRollTime = new Date();
    // Calculate next 1:00 AM UTC (8:00 PM EST)
    const next1AMUTC = get1AMUTC(new Date());
    if (next1AMUTC <= new Date()) {
      // If it's already past 1 AM today, get tomorrow's 1 AM
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      nextRollTime = get1AMUTC(tomorrow);
    } else {
      nextRollTime = next1AMUTC;
    }
    
    embed.addFields({
      name: '⏰ Next Roll Call',
      value: `<t:${Math.floor(nextRollTime.getTime() / 1000)}:R> at 8:00 PM UTC`,
      inline: false
    });

    await interaction.editReply({ 
      content: `<@${interaction.user.id}>`,
      embeds: [embed],
      flags: [4096] 
    });
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'viewBlightStatus',
      commandName: interaction.commandName || 'status',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName
    });
    console.error('[blightHandler]: Error viewing blight status:', error);
    await interaction.editReply({ 
      content: '❌ An error occurred while fetching the blight status.',
      flags: [4096] 
    });
  }
}

// ------------------- Function: saveBlightEventToHistory -------------------
// Saves blight-related events to the BlightRollHistoryModel for tracking
async function saveBlightEventToHistory(character, eventType, details = {}, userInfo = {}) {
  try {
    const BlightRollHistory = require('@/models/BlightRollHistoryModel');
    
    // Ensure we're connected to the main database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true
      });
    }
    
    // For non-roll events, provide a default rollValue to satisfy schema requirements
    const defaultRollValue = details.rollValue !== undefined ? details.rollValue : -1;
    
    const historyEntry = await BlightRollHistory.create({
      characterId: character._id,
      characterName: character.name,
      userId: character.userId,
      rollValue: defaultRollValue,
      previousStage: details.previousStage || character.blightStage,
      newStage: details.newStage || character.blightStage,
      timestamp: new Date(),
      notes: `${eventType}: ${details.notes || ''}`
    });
    
    console.log(`[blightHandler]: Saved blight event to history: ${eventType} for ${character.name}`);
    return historyEntry;
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'saveBlightEventToHistory',
      characterName: character.name,
      eventType,
      details,
      commandName: userInfo.commandName || 'Unknown',
      userTag: userInfo.userTag || 'Unknown',
      userId: userInfo.userId || 'Unknown'
    });
    console.error('[blightHandler]: Failed to save blight event to history:', error);
  }
}

// ------------------- Function: getBlightStageDescription -------------------
// Returns a description for each blight stage.
function getBlightStageDescription(stage) {
  switch (stage) {
    case 1: return 'Minor symptoms - slight discomfort';
    case 2: return 'Moderate symptoms - noticeable effects';
    case 3: return 'Severe symptoms - significant impairment';
    case 4: return 'Critical symptoms - life-threatening';
    case 5: return 'Terminal stage - death imminent';
    default: return 'Unknown stage';
  }
}

// ------------------- Function: viewBlightHistory -------------------
// Displays the most recent blight progression history for a character.
async function viewBlightHistory(interaction, characterName, limit = 10) {
  try {
    const character = await Character.findOne({ name: characterName });
    if (!character) {
      await interaction.editReply({ content: `❌ Character "${characterName}" not found.`, flags: [4096] });
      return;
    }

    // Check if character has ever been blighted
    if (!character.blighted && !character.blightHistory) {
      const neverBlightedEmbed = new EmbedBuilder()
        .setColor('#00FF00') // Green color for positive message
        .setTitle('📜 Never Blighted')
        .setDescription(`**${characterName}** has never been blighted.`)
        .setThumbnail(character.icon)
        .setAuthor({ name: `${characterName}'s History`, iconURL: interaction.user.displayAvatarURL() })
        .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
        .setFooter({ text: 'Blight History Check', iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png' })
        .setTimestamp();

      await interaction.editReply({ 
        content: `<@${interaction.user.id}>`,
        embeds: [neverBlightedEmbed],
        flags: [4096] 
      });
      return;
    }

    const history = await getCharacterBlightHistory(character._id, limit);
    
    if (history.length === 0) {
      await interaction.editReply({
        content: `📜 **${characterName}** has no recorded blight history.`,
        flags: [4096]
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setColor('#AA926A')
      .setTitle(`📜 Blight History for ${characterName}`)
      .setDescription(`Showing the last ${history.length} blight progression events.`)
      .setThumbnail(character.icon)
      .setAuthor({ name: characterName, iconURL: character.icon })
      .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
      .setFooter({ text: 'Blight History' })
      .setTimestamp();

    // Group history entries by date
    const groupedHistory = history.reduce((acc, entry) => {
      const date = new Date(entry.timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(entry);
      return acc;
    }, {});

    // Add fields for each date group
    for (const [date, entries] of Object.entries(groupedHistory)) {
      const fieldValue = entries.map(entry => {
        const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit'
        });
        
        let description = '';
        if (entry.previousStage === entry.newStage) {
          description = `Rolled ${entry.rollValue} - No progression (Remained at Stage ${entry.newStage})`;
        } else {
          description = `Rolled ${entry.rollValue} - Advanced from Stage ${entry.previousStage} to Stage ${entry.newStage}`;
        }
        
        return `**${time}** - ${description}`;
      }).join('\n');
      
      embed.addFields({ name: date, value: fieldValue });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'viewBlightHistory',
      commandName: interaction.commandName || 'history',
      userTag: interaction.user.tag,
      userId: interaction.user.id,
      characterName
    });
    console.error('[blightHandler]: Error viewing blight history:', error);
    await interaction.editReply({ 
      content: '❌ An error occurred while fetching the blight history.',
      flags: [4096] 
    });
  }
}

// ------------------- Function: sendBlightReminders -------------------
// Sends comprehensive reminders for death deadlines and expiring healing tasks.
async function sendBlightReminders(client) {
  try {
    logger.info('BLIGHT', 'Starting comprehensive blight reminder check...');
    
    const now = new Date();
    let deathWarnings = 0;
    let healingWarnings = 0;
    let submissionWarnings = 0;
    
    // ------------------- Check Stage 5 Death Deadlines -------------------
    const stage5Characters = await Character.find({ 
      blighted: true, 
      blightStage: 5,
      deathDeadline: { $exists: true, $ne: null }
    });
    
    logger.info('BLIGHT', `Found ${stage5Characters.length} Stage 5 characters with death deadlines`);
    
    for (const character of stage5Characters) {
      try {
        const timeUntilDeath = character.deathDeadline.getTime() - now.getTime();
        const daysUntilDeath = Math.floor(timeUntilDeath / (1000 * 60 * 60 * 24));
        const hoursUntilDeath = Math.floor(timeUntilDeath / (1000 * 60 * 60));
        
        // Check if we should send a reminder
        let shouldSendReminder = false;
        let reminderType = '';
        let reminderEmbed = null;
        
        if (timeUntilDeath <= 0) {
          // Death has already occurred - this should be handled by checkMissedRolls
          continue;
        } else if (hoursUntilDeath <= 6) {
          // Final 6-hour warning
          shouldSendReminder = true;
          reminderType = 'final_6_hour';
        } else if (hoursUntilDeath <= 24) {
          // 24-hour warning
          shouldSendReminder = true;
          reminderType = '24_hour';
        } else if (daysUntilDeath <= 3) {
          // 3-day warning
          shouldSendReminder = true;
          reminderType = '3_day';
        } else if (daysUntilDeath <= 5) {
          // 5-day warning
          shouldSendReminder = true;
          reminderType = '5_day';
        }
        
        if (shouldSendReminder) {
          // Check if we've already sent this type of reminder recently
          const reminderKey = `death_reminder_${character._id}_${reminderType}`;
          const lastReminder = await TempData.findOne({ 
            type: 'death_reminder',
            key: reminderKey
          });
          
          if (!lastReminder) {
            const { EmbedBuilder } = require('discord.js');
            
            let title, color, urgencyText;
            if (reminderType === 'final_6_hour') {
              title = '🚨 FINAL WARNING: 6 Hours Until Death 🚨';
              color = '#FF0000';
              urgencyText = '**CRITICAL URGENCY** - This is your final chance to save your character!';
            } else if (reminderType === '24_hour') {
              title = '⚠️ URGENT: 24 Hours Until Death ⚠️';
              color = '#FF6B6B';
              urgencyText = '**URGENT** - You must act immediately to save your character!';
            } else if (reminderType === '3_day') {
              title = '⚠️ WARNING: 3 Days Until Death ⚠️';
              color = '#FFA500';
              urgencyText = '**WARNING** - Your character is in critical danger!';
            } else {
              title = '⚠️ NOTICE: 5 Days Until Death ⚠️';
              color = '#FFD700';
              urgencyText = '**NOTICE** - Your character is approaching the death deadline.';
            }
            
            reminderEmbed = new EmbedBuilder()
              .setColor(color)
              .setTitle(title)
              .setDescription(
                `**${character.name}** is at Stage 5 Blight and approaching death.\n\n` +
                `${urgencyText}\n\n` +
                `🕒 **Time Remaining**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:R>\n` +
                `📅 **Death Date**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:F>\n\n` +
                `💀 **Stage 5 Effects**:\n` +
                `• No monster encounters\n` +
                `• No gathering activities\n` +
                `• Only Dragons can heal you\n\n` +
                `💡 **Action Required**:\n` +
                `• Request healing from a Dragon using \`/blight heal\`\n` +
                `• Complete the healing task before the deadline\n` +
                `• Check your status with \`/blight status ${character.name}\``
              )
              .setThumbnail(character.icon || 'https://example.com/default-icon.png')
              .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
              .setFooter({ text: 'Blight Death Reminder' })
              .setTimestamp();
            
            // Send the reminder
            try {
              const { sendUserDM } = require('@/utils/messageUtils');
              const dmSent = await sendUserDM(character.userId, `🚨 **DEATH REMINDER** for ${character.name}`, client);
              
              if (dmSent) {
                // Record the reminder only if DM was sent successfully
                await TempData.create({
                  type: 'death_reminder',
                  key: reminderKey,
                  data: {
                    characterName: character.name,
                    userId: character.userId,
                    reminderType,
                    sentAt: new Date().toISOString()
                  },
                  createdAt: new Date(),
                  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
                });
                
                deathWarnings++;
                console.log(`[blightHandler]: Sent ${reminderType} death reminder to ${character.userId} for ${character.name}`);
              } else {
                console.log(`[blightHandler]: Could not send death reminder to ${character.userId} for ${character.name} - user may have blocked DMs`);
              }
            } catch (dmError) {
              console.error(`[blightHandler]: Failed to send death reminder to ${character.userId}:`, dmError);
            }
          }
        }
      } catch (characterError) {
        console.error(`[blightHandler]: Error processing death reminder for ${character.name}:`, characterError);
      }
    }
    
    // ------------------- Check Expiring Healing Submissions -------------------
    const warningThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    const expiringSubmissions = await TempData.find({ 
      type: 'blight',
      expiresAt: { $lt: warningThreshold, $gt: new Date() }
    });
    
    logger.info('BLIGHT', `Found ${expiringSubmissions.length} submissions expiring within 24 hours`);
    
    for (const submission of expiringSubmissions) {
      try {
        const submissionData = submission.data;
        
        // Only warn for pending submissions
        if (submissionData.status === 'pending') {
          const expiresAt = new Date(submission.expiresAt);
          const hoursUntilExpiry = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
          
          // Send warnings at different intervals
          let shouldSendWarning = false;
          let warningType = '';
          
          if (hoursUntilExpiry <= 6) {
            shouldSendWarning = true;
            warningType = 'final_6_hour';
          } else if (hoursUntilExpiry <= 12) {
            shouldSendWarning = true;
            warningType = '12_hour';
          } else if (hoursUntilExpiry <= 24) {
            shouldSendWarning = true;
            warningType = '24_hour';
          }
          
          if (shouldSendWarning) {
            // Check if we've already warned this user recently
            const warningKey = `healing_warning_${submissionData.submissionId}_${warningType}`;
            const lastWarning = await TempData.findOne({ 
              type: 'healing_warning',
              key: warningKey
            });
            
            if (!lastWarning) {
              const { sendUserDM } = require('@/utils/messageUtils');
              const { EmbedBuilder } = require('discord.js');
              
              let title, color, urgencyText;
              if (warningType === 'final_6_hour') {
                title = '🚨 FINAL WARNING: Healing Task Expiring Soon 🚨';
                color = '#FF0000';
                urgencyText = '**CRITICAL URGENCY** - This is your final chance to complete the task!';
              } else if (warningType === '12_hour') {
                title = '⚠️ URGENT: Healing Task Expiring Soon ⚠️';
                color = '#FF6B6B';
                urgencyText = '**URGENT** - Complete your task immediately!';
              } else {
                title = '⚠️ WARNING: Healing Task Expiring Soon ⚠️';
                color = '#FFA500';
                urgencyText = '**WARNING** - Your healing task is expiring soon.';
              }
              
              const warningEmbed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(
                  `Your blight healing request for **${submissionData.characterName}** will expire soon.\n\n` +
                  `${urgencyText}\n\n` +
                  `🆔 **Submission ID**: \`${submissionData.submissionId}\`\n` +
                  `👨‍⚕️ **Healer**: ${submissionData.healerName}\n` +
                  `📝 **Task Type**: ${submissionData.taskType}\n` +
                  `⏰ **Expires In**: **${hoursUntilExpiry} hours**\n` +
                  `📅 **Expires At**: <t:${Math.floor(expiresAt.getTime() / 1000)}:F>\n\n` +
                  `💡 **Action Required**:\n` +
                  `• Complete your healing task before expiration\n` +
                  `• Submit using \`/blight submit\` with your submission ID\n` +
                  `• Or request a new task if needed`
                )
                .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
                .setFooter({ text: 'Blight Healing Expiration Warning' })
                .setTimestamp();
              
              const dmSent = await sendUserDM(submissionData.userId, `🚨 **HEALING TASK EXPIRATION WARNING** for ${submissionData.characterName}`, client);
              
              if (dmSent) {
                // Record the warning only if DM was sent successfully
                await TempData.create({
                  type: 'healing_warning',
                  key: warningKey,
                  data: {
                    submissionId: submissionData.submissionId,
                    userId: submissionData.userId,
                    characterName: submissionData.characterName,
                    warningType,
                    warnedAt: new Date().toISOString()
                  },
                  createdAt: new Date(),
                  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
                });
                
                submissionWarnings++;
                console.log(`[blightHandler]: Sent ${warningType} healing warning to ${submissionData.userId} for ${submissionData.characterName}`);
              } else {
                console.log(`[blightHandler]: Could not send healing warning to ${submissionData.userId} for ${submissionData.characterName} - user may have blocked DMs`);
              }
            }
          }
        }
      } catch (submissionError) {
        console.error(`[blightHandler]: Error processing expiring submission ${submission._id}:`, submissionError);
      }
    }
    
    logger.info('BLIGHT', `Reminder check complete - Death: ${deathWarnings}, Healing: ${submissionWarnings}`);
    return { 
      deathWarnings, 
      healingWarnings: submissionWarnings 
    };
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'sendBlightReminders',
      commandName: 'system',
      userTag: 'System',
      userId: 'system'
    });
    console.error('[blightHandler]: Error sending blight reminders:', error);
    throw error;
  }
}

// ------------------- Function: checkExpiringBlightRequests -------------------
// Checks for blight requests that are about to expire and sends warning notifications.
async function checkExpiringBlightRequests(client) {
  try {
    console.log('[blightHandler]: Checking for expiring blight requests...');
    
    // Find submissions that expire within the next 24 hours
    const warningThreshold = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
    const expiringSubmissions = await TempData.find({ 
      type: 'blight',
      expiresAt: { $lt: warningThreshold, $gt: new Date() }
    });
    
    logger.info('BLIGHT', `Found ${expiringSubmissions.length} submissions expiring within 24 hours`);
    
    let warnedUsers = 0;
    
    for (const submission of expiringSubmissions) {
      try {
        const submissionData = submission.data;
        
        // Only warn for pending submissions
        if (submissionData.status === 'pending') {
          const expiresAt = new Date(submission.expiresAt);
          const hoursUntilExpiry = Math.floor((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60));
          
          // Only warn if expiring within 24 hours and haven't been warned recently
          if (hoursUntilExpiry <= 24 && hoursUntilExpiry > 0) {
            console.log(`[blightHandler]: Sending warning for ${submissionData.characterName} - expires in ${hoursUntilExpiry} hours`);
            
            // Check if we've already warned this user recently (within last 12 hours)
            const lastWarningKey = `blight_warning_${submissionData.submissionId}`;
            const lastWarning = await TempData.findOne({ 
              type: 'blight_warning',
              key: lastWarningKey
            });
            
            if (!lastWarning || (Date.now() - new Date(lastWarning.createdAt).getTime()) > 12 * 60 * 60 * 1000) {
              // Send warning DM
              if (submissionData.userId) {
                try {
                  const { sendUserDM } = require('@/utils/messageUtils');
                  const { EmbedBuilder } = require('discord.js');
                  
                  const warningEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Blight Healing Request Expiring Soon')
                    .setDescription(`Your blight healing request for **${submissionData.characterName}** will expire soon.`)
                    .addFields(
                      { name: '🆔 Submission ID', value: `\`${submissionData.submissionId}\``, inline: true },
                      { name: '👨‍⚕️ Healer', value: submissionData.healerName, inline: true },
                      { name: '📝 Task Type', value: submissionData.taskType, inline: true },
                      { name: '⏰ Expires In', value: `**${hoursUntilExpiry} hours**`, inline: false },
                      { name: '📅 Expires At', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`, inline: false },
                      { name: '💡 Action Required', value: 'Complete your healing task before expiration or request a new task if needed.' }
                    )
                    .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
                    .setFooter({ text: 'Blight Healing Expiration Warning' })
                    .setTimestamp();
                  
                  const dmSent = await sendUserDM(submissionData.userId, `Your blight healing request is expiring soon!`, client);
                  
                  if (dmSent) {
                    // Record that we've warned this user only if DM was sent successfully
                    await TempData.create({
                      type: 'blight_warning',
                      key: lastWarningKey,
                      data: {
                        submissionId: submissionData.submissionId,
                        userId: submissionData.userId,
                        warnedAt: new Date().toISOString()
                      },
                      createdAt: new Date(),
                      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
                    });
                    
                    warnedUsers++;
                    console.log(`[blightHandler]: Sent warning DM to user ${submissionData.userId} for ${submissionData.characterName}`);
                  } else {
                    console.log(`[blightHandler]: Could not send warning DM to user ${submissionData.userId} for ${submissionData.characterName} - user may have blocked DMs`);
                  }
                } catch (dmError) {
                  console.error(`[blightHandler]: Failed to send warning DM to user ${submissionData.userId}:`, dmError);
                }
              }
            }
          }
        }
      } catch (submissionError) {
        console.error(`[blightHandler]: Error processing expiring submission ${submission._id}:`, submissionError);
      }
    }
    
    logger.success('BLIGHT', `Expiration warning check complete - Warned: ${warnedUsers}`);
    return { warnedUsers };
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'checkExpiringBlightRequests',
      commandName: 'system',
      userTag: 'System',
      userId: 'system'
    });
    console.error('[blightHandler]: Error checking expiring blight requests:', error);
    throw error;
  }
}

// ------------------- Function: cleanupExpiredBlightRequests -------------------
// Deletes all expired TempData entries related to blight and notifies users.
async function cleanupExpiredBlightRequests(client) {
  try {
    console.log('[blightHandler]: 🧹 Starting cleanup of expired blight requests');
    
    // Find all expired blight submissions
    const expiredSubmissions = await TempData.find({ 
      type: 'blight',
      expiresAt: { $lt: new Date() }
    });
    
    logger.info('BLIGHT', `Found ${expiredSubmissions.length} expired blight submissions`);
    
    let notifiedUsers = 0;
    let expiredCount = 0;
    
    for (const submission of expiredSubmissions) {
      try {
        const submissionData = submission.data;
        
        // Only process pending submissions that haven't been marked as expired
        if (submissionData.status === 'pending') {
          console.log(`[blightHandler]: ⏰ Processing expired submission for ${submissionData.characterName}`);
          
          // Mark as expired in the database
          submissionData.status = 'expired';
          submissionData.expiredAt = new Date().toISOString();
          
          // Save the updated submission data
          await TempData.updateOne(
            { _id: submission._id },
            { 
              $set: { 
                data: submissionData,
                expiresAt: new Date() // Ensure it's marked as expired
              }
            }
          );
          
          // Save expiration event to blight history
          try {
            const character = await Character.findOne({ name: submissionData.characterName });
            if (character) {
              // Generate lore text for logging
              const loreText = generateBlightSubmissionExpiryFlavorText(
                submissionData.characterName,
                submissionData.healerName,
                character.blightStage,
                submissionData.taskType
              );
              
              await saveBlightEventToHistory(character, 'Submission Expired', {
                notes: `Healing submission expired - Task: ${submissionData.taskType} from ${submissionData.healerName}`,
                submissionId: submissionData.submissionId,
                loreText: loreText
              }, {
                commandName: 'system',
                userTag: character.userId ? `User: ${character.userId}` : 'System',
                userId: character.userId || 'system'
              });
              
              // Log the lore text for administrators
              console.log(`[blightHandler]: 📜 Blight submission expired for ${submissionData.characterName}:`);
              console.log(`[blightHandler]: ${loreText}`);
            }
          } catch (historyError) {
            console.error('[blightHandler]: ❌ Error saving expiration to history:', historyError);
          }
          
          // Notify the user via DM
          if (submissionData.userId) {
            try {
              const { sendUserDM } = require('@/utils/messageUtils');
              const { EmbedBuilder } = require('discord.js');
              
              // Get character's current blight stage for flavor text
              const character = await Character.findOne({ name: submissionData.characterName });
              const blightStage = character ? character.blightStage : 2;
              
              // Generate flavorful lore text for the expiry
              const loreText = generateBlightSubmissionExpiryFlavorText(
                submissionData.characterName,
                submissionData.healerName,
                blightStage,
                submissionData.taskType
              );
              
              const expirationEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('⏰ Blight Healing Request Expired')
                .setDescription(loreText)
                .addFields(
                  { name: '🆔 Submission ID', value: `\`${submissionData.submissionId}\``, inline: true },
                  { name: '👨‍⚕️ Healer', value: submissionData.healerName, inline: true },
                  { name: '📝 Task Type', value: submissionData.taskType, inline: true },
                  { name: '⏰ Expired At', value: `<t:${Math.floor(new Date().getTime() / 1000)}:F>`, inline: false },
                  { name: '💡 Next Steps', value: 'You can request a new healing task using `/blight heal` if your character is still blighted.' }
                )
                .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
                .setFooter({ text: 'Blight Healing Expiration Notice' })
                .setTimestamp();
              
              const dmSent = await sendUserDM(submissionData.userId, `Your blight healing request has expired.`, client);
              
              if (dmSent) {
                notifiedUsers++;
                console.log(`[blightHandler]: ✅ Sent expiration DM to user ${submissionData.userId} for ${submissionData.characterName}`);
              } else {
                console.log(`[blightHandler]: ℹ️ Could not send expiration DM to user ${submissionData.userId} for ${submissionData.characterName} - user may have blocked DMs`);
              }
            } catch (dmError) {
              console.error(`[blightHandler]: ❌ Failed to send expiration DM to user ${submissionData.userId}:`, dmError);
            }
          }
          
          expiredCount++;
        }
      } catch (submissionError) {
        console.error(`[blightHandler]: ❌ Error processing expired submission ${submission._id}:`, submissionError);
      }
    }
    
    // Delete all expired submissions from TempData
    const deleteResult = await TempData.deleteMany({ 
      type: 'blight',
      expiresAt: { $lt: new Date() }
    });
    
    console.log(`[blightHandler]: ✅ Cleanup complete - Expired: ${expiredCount}, Notified: ${notifiedUsers}, Deleted: ${deleteResult.deletedCount}`);
    return {
      expiredCount,
      notifiedUsers,
      deletedCount: deleteResult.deletedCount
    };
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'cleanupExpiredBlightRequests',
      commandName: 'system',
      userTag: 'System',
      userId: 'system'
    });
    console.error('[blightHandler]: ❌ Error cleaning up expired blight requests:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Function: checkMissedRolls -------------------
// Checks if characters missed a roll and auto-advances their blight.
// ============================================================================

async function checkMissedRolls(client) {
  try {
    logger.info('BLIGHT', 'Starting checkMissedRolls...');
    
    // ------------------- Validate Discord Client -------------------
    if (!client || !client.channels || !client.token) {
      console.error('[blightHandler]: ❌ Invalid Discord client provided to checkMissedRolls');
      return;
    }

    const channelId = process.env.BLIGHT_NOTIFICATIONS_CHANNEL_ID;
    if (!channelId) {
      console.error('[blightHandler]: ❌ BLIGHT_NOTIFICATIONS_CHANNEL_ID not set in environment variables');
      return;
    }

    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      console.error('[blightHandler]: ❌ Channel not found for missed roll notifications:', channelId);
      return;
    }

    // ------------------- Fetch All Blighted Characters (both Character and ModCharacter) -------------------
    const blightedRegularCharacters = await Character.find({ blighted: true });
    const blightedModCharacters = await ModCharacter.find({ blighted: true });
    
    // Merge into one list with model type flag
    const blightedCharacters = [
      ...blightedRegularCharacters.map(char => ({ ...char.toObject(), _isModCharacter: false })),
      ...blightedModCharacters.map(char => ({ ...char.toObject(), _isModCharacter: true }))
    ];
    
    logger.info('BLIGHT', `Found ${blightedRegularCharacters.length} regular and ${blightedModCharacters.length} mod blighted characters to check (total: ${blightedCharacters.length})`);

    const blightEmoji = '<:blight_eye:805576955725611058>';
    const stageDescriptions = {
      2: {
        title: `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 2 ${blightEmoji}`,
        desc: `⚠️ Infected areas spread inside and out, and the blight begins traveling toward vital organs. Fatigue fades but nausea typically persists.\n\nInfected now experience an **increase in physical strength**.\n\n🎯 **Stage 2 Effect**: Your rolls are now multiplied by 1.5x.\n\nYou can still be healed by **sages, oracles, or dragons**.`
      },
      3: {
        title: `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 3 ${blightEmoji}`,
        desc: `⚠️ Visible infected areas and feverish symptoms fade. You experience **frequent nosebleeds** and **malice-like sputum**, which can now **infect others**.\n\nHallucinations, **further strength increases**, and **aggressive mood swings** occur.\n\n👻 **Stage 3 Effect**: Monsters no longer attack you.\n\nAt this stage, healing is only possible by **oracles or dragons**.`
      },
      4: {
        title: `${blightEmoji} Your Blight Sickness ADVANCES to STAGE 4 ${blightEmoji}`,
        desc: `⚠️ All outward signs of infection vanish—**except your eyes**, which now resemble those of Malice.\n\nVital organs begin to **fail**, and the infected is driven by an **uncontrollable desire to destroy**.\n\nAny contact with bodily fluids poses a **severe infection risk to others**.\n\n💀 **Stage 4 Effect**: No monsters. No gathering.\n\nYou can only be healed by **dragons** at this stage.`
      },
      5: {
        title: `☠ Your Blight Sickness IS ON THE EDGE of STAGE 5 ☠`,
        desc: `⚠️ You are dangerously close to death.\n\nYou have **7 days** to complete your **healing prompt** or find **miraculous intervention**. Stage 5 is irreversible.\n\n💀 **Stage 5 Effect**: No monsters. No gathering. No healing except by Dragons.\n\nThis is your **final warning**.`
      }
    };

    // Check for expired submissions
    const blightSubmissions = await loadBlightSubmissions();
    const now = new Date();
    logger.info('BLIGHT', `Checking ${Object.keys(blightSubmissions).length} blight submissions for expiration`);
    
    for (const [id, submission] of Object.entries(blightSubmissions)) {
      if (submission.status === 'pending' && submission.timestamp && new Date(submission.timestamp) < now) {
        console.log(`[blightHandler]: Found expired submission for ${submission.characterName}`);
        submission.status = 'expired';
        await saveBlightSubmissions(blightSubmissions);
        
        if (submission.userId) {
          try {
            // Get character's current blight stage for flavor text
            const character = await Character.findOne({ name: submission.characterName });
            const blightStage = character ? character.blightStage : 2;
            
            // Generate flavorful lore text for the expiry
            const loreText = generateBlightSubmissionExpiryFlavorText(
              submission.characterName,
              submission.healerName,
              blightStage,
              submission.taskType
            );
            
            const expirationEmbed = new EmbedBuilder()
              .setColor('#FF6B6B')
              .setTitle('⏰ Blight Healing Request Expired')
              .setDescription(loreText)
              .addFields(
                { name: '🆔 Submission ID', value: `\`${submission.submissionId}\``, inline: true },
                { name: '👨‍⚕️ Healer', value: submission.healerName, inline: true },
                { name: '📝 Task Type', value: submission.taskType, inline: true },
                { name: '⏰ Expired At', value: `<t:${Math.floor(new Date().getTime() / 1000)}:F>`, inline: false },
                { name: '💡 Next Steps', value: 'You can request a new healing task using `/blight heal` if your character is still blighted.' }
              )
              .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
              .setFooter({ text: 'Blight Healing Expiration Notice' })
              .setTimestamp();
            
            const dmSent = await sendUserDM(submission.userId, `Your blight healing request has expired.`, client);
            
            if (dmSent) {
              // Log the lore text for administrators
              console.log(`[blightHandler]: 📜 Blight submission expired for ${submission.characterName}:`);
              console.log(`[blightHandler]: ${loreText}`);
              
              console.log(`[blightHandler]: Sent expiration DM to user ${submission.userId}`);
            } else {
              console.log(`[blightHandler]: ℹ️ Could not send expiration DM to user ${submission.userId} for ${submission.characterName} - user may have blocked DMs`);
            }
          } catch (error) {
            console.error('[blightHandler]: ❌ Error sending DM:', error);
          }
        }
      }
    }

    for (const character of blightedCharacters) {
      const lastRollDate = character.lastRollDate || new Date(0);
      const timeSinceLastRoll = Date.now() - lastRollDate.getTime();
      
      // ---- Calculate blight call boundaries for robust checking ----
      // This uses the same logic as rollForBlightProgression to ensure consistency
      const now = new Date();
      
      // Get current hour and minute in UTC (check runs at 00:59, 1 min before 01:00 call)
      const utcHour = getHourInUTC(now);
      const utcMinute = now.getUTCMinutes();
      
      // Calculate today's 1 AM UTC (which is 8:00 PM EST the previous day)
      const today1AMUTC = get1AMUTC(now);
      
      // Determine the current roll boundary (same logic as rollForBlightProgression)
      // If we're before 1 AM today, check against yesterday's 1 AM
      // If we're after 1 AM today, check against today's 1 AM
      let currentRollBoundary;
      if (utcHour < 1) {
        // Before 1 AM today - check against yesterday's 1 AM
        const yesterday = new Date(now);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        currentRollBoundary = get1AMUTC(yesterday);
      } else {
        // After 1 AM today - check against today's 1 AM
        currentRollBoundary = today1AMUTC;
      }
      
      // Calculate the previous blight call period (for missed roll detection)
      // This is the period that just ended (the one we're checking if they missed)
      // If we're at or after 1 AM today, the previous period was yesterday's 1 AM to today's 1 AM
      // If we're before 1 AM today, the previous period was the day before yesterday's 1 AM to yesterday's 1 AM
      let previousBlightCall;
      if (utcHour >= 1) {
        // At or after 1 AM today - previous period ended at today's 1 AM, started at yesterday's 1 AM
        const yesterday = new Date(now);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        previousBlightCall = get1AMUTC(yesterday); // Yesterday's 1 AM (start of the period we're checking)
      } else {
        // Before 1 AM today - previous period ended at yesterday's 1 AM, started at day before yesterday's 1 AM
        const dayBeforeYesterday = new Date(now);
        dayBeforeYesterday.setUTCDate(dayBeforeYesterday.getUTCDate() - 2);
        previousBlightCall = get1AMUTC(dayBeforeYesterday); // Day before yesterday's 1 AM
      }
      
      // Enhanced logging for debugging
      logger.info('BLIGHT', `Checking ${character.name} - UTC Time: ${now.toISOString()}, Last roll: ${lastRollDate.toISOString()}, Current boundary: ${currentRollBoundary.toISOString()}, Previous call: ${previousBlightCall.toISOString()}, Time since roll: ${Math.floor(timeSinceLastRoll / (1000 * 60 * 60))} hours`);
      
      // ---- SKIP missed roll progression if newly blighted after previous blight call ----
      if (character.blightedAt) {
        const isBlightedAfterPreviousCall = character.blightedAt >= previousBlightCall;
        
        if (isBlightedAfterPreviousCall) {
          console.log(`[blightHandler]: Skipping missed roll for ${character.name} (blightedAt=${character.blightedAt.toISOString()}, previousBlightCall=${previousBlightCall.toISOString()}) - infected after previous blight call.`);
          continue;
        }
      }
      
      // ---- CRITICAL: Check if character rolled in the period we're checking ----
      // The period we're checking is from previousBlightCall to currentRollBoundary
      // If they rolled after previousBlightCall, they rolled in the period and didn't miss it
      // This is the primary check that prevents false progression
      if (character.lastRollDate && character.lastRollDate > previousBlightCall) {
        console.log(`[blightHandler]: ✅ Skipping missed roll for ${character.name} - rolled in period. Last roll: ${character.lastRollDate.toISOString()}, Previous boundary: ${previousBlightCall.toISOString()}`);
        continue;
      }
      
      // Additional safety check: if we're before 8 PM today and they rolled after current boundary,
      // they've already rolled for today's period (which hasn't ended yet)
      if (utcHour < 20 && character.lastRollDate && character.lastRollDate > currentRollBoundary) {
        console.log(`[blightHandler]: Skipping missed roll for ${character.name} (lastRollDate=${character.lastRollDate.toISOString()}, currentRollBoundary=${currentRollBoundary.toISOString()}) - already rolled in current period (before 8 PM check).`);
        continue;
      }

      // ---- SKIP missed roll progression if blight is paused ----
      if (character.blightPaused) {
        console.log(`[blightHandler]: Skipping missed roll for ${character.name} - blight progression is paused.`);
        continue;
      }

      // ========================================================================
      // ------------------- STAGE 5: Death Watch -------------------
      // ========================================================================
      if (character.blightStage === 5 && character.deathDeadline) {
        const timeUntilDeath = character.deathDeadline - now;
        const oneDayMs = 24 * 60 * 60 * 1000;
        console.log(`[blightHandler]: ${character.name} is at Stage 5 - Time until death: ${Math.floor(timeUntilDeath / (1000 * 60 * 60))} hours`);

        // ------------------- DM Final Warning -------------------
        if (timeUntilDeath <= oneDayMs && timeUntilDeath > 0) {
          try {
            const user = await client.users.fetch(character.userId);
            if (user) {
              const warningEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚠️ FINAL WARNING: 24 Hours Until Blight Death ⚠️')
                .setDescription(
                  `**${character.name}** has only **24 hours** remaining before succumbing to Stage 5 Blight.\n\n` +
                  `🕒 **Time Remaining**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:R>\n\n` +
                  `⚠️ You must be healed by a **Dragon** before the deadline to avoid death.`
                )
                .setThumbnail(character.icon || 'https://example.com/default-icon.png')
                .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
                .setTimestamp();

              await user.send({ embeds: [warningEmbed] });
              console.log(`[blightHandler]: Sent 24-hour warning DM to ${character.userId} (${character.name})`);
            }
          } catch (error) {
            // Don't log DM errors to console channel - they're expected when users have DMs disabled
            if (error.code === 50007) {
              console.log(`[blightHandler]: User ${character.userId} (${character.name}) has DMs disabled - skipping death warning DM`);
            } else {
              // Try to fetch the Discord user's tag for better error reporting
              let userTag = 'System';
              try {
                const user = await client.users.fetch(character.userId);
                if (user) {
                  userTag = user.tag;
                }
              } catch (fetchError) {
                console.log(`[blightHandler]: Could not fetch user tag for ${character.userId}, using 'System' as fallback`);
              }
              
              handleError(error, 'blightHandler.js', {
                operation: 'sendDeathWarningDM',
                commandName: 'system',
                userTag: userTag,
                userId: character.userId,
                characterName: character.name,
                characterUserId: character.userId
              });
              console.error(`[blightHandler]: Failed to send DM to ${character.userId} (${character.name})`, error);
            }
          }
        }

        // ------------------- Handle Death If Deadline Passed -------------------
        if (now > character.deathDeadline) {
          // Remove active companions first
          if (character.currentActivePet) {
            const pet = await Pet.findById(character.currentActivePet);
            if (pet) {
              pet.status = 'retired';
              await pet.save();
            }
          }
          if (character.currentActiveMount) {
            const mount = await Mount.findById(character.currentActiveMount);
            if (mount) {
              mount.status = 'retired';
              await mount.save();
            }
          }

          // Delete active blight submissions
          try {
            const blightSubmissions = await loadBlightSubmissions();
            const pendingSubmissions = Object.keys(blightSubmissions).filter(id =>
              blightSubmissions[id].characterName === character.name &&
              blightSubmissions[id].status === 'pending'
            );

            for (const submissionId of pendingSubmissions) {
              delete blightSubmissions[submissionId];
              deleteSubmissionFromStorage(submissionId);
            }

            await saveBlightSubmissions(blightSubmissions);
          } catch (error) {
            handleError(error, 'blightHandler.js', {
              operation: 'cleanupBlightSubmissions',
              commandName: 'system',
              userTag: character.userId ? `User: ${character.userId}` : 'System',
              userId: character.userId || 'system',
              characterName: character.name
            });
            console.error('[blightHandler]: Error cleaning up blight submissions:', error);
          }

          // Transfer inventory to village shops before wipe so items are not lost
          try {
            await transferCharacterInventoryToVillageShops(character.name);
          } catch (transferErr) {
            console.error('[blightHandler]: Failed to transfer inventory to village shops for', character.name, transferErr.message);
          }

          // Wipe character's inventory from DB (not sheet)
          try {
            const inventoriesConnection = await connectToInventories();
            const db = inventoriesConnection.useDb("inventories");
            
            // Per-character collection (same for regular and mod characters)
            const collectionName = character.name.toLowerCase();
            
            // Drop the entire collection instead of just deleting documents
            await db.collection(collectionName).drop().catch(error => {
              if (error.code !== 26) { // Ignore "namespace not found" error
                throw error;
              }
            });
            
            console.log(`[blightHandler]: Dropped inventory collection for ${character.name}`);
          } catch (error) {
            handleError(error, 'blightHandler.js', {
              operation: 'wipeInventory',
              commandName: 'system',
              userTag: character.userId ? `User: ${character.userId}` : 'System',
              userId: character.userId || 'system',
              characterName: character.name
            });
            console.error('[blightHandler]: Error wiping inventory:', error);
          }

          // Store character info for the death announcement before deletion
          const characterInfo = {
            name: character.name,
            userId: character.userId,
            icon: character.icon
          };

          // Delete the character from the database (use correct model)
          if (character._isModCharacter) {
            await ModCharacter.deleteOne({ _id: character._id });
          } else {
            await Character.deleteOne({ _id: character._id });
          }

          // ------------------- Death Announcement Embed -------------------
          const embed = new EmbedBuilder()
            .setColor('#D32F2F')
            .setTitle(`<:blight_eye:805576955725611058> **Blight Death Alert** <:blight_eye:805576955725611058>`)
            .setDescription(
              `**${characterInfo.name}** has succumbed to Stage 5 Blight.\n\n` +
              `*Their body has been claimed by the blight, their spirit lost to the void. Their name shall be remembered, but their presence in this world is no more.*`
            )
            .setThumbnail(characterInfo.icon || 'https://example.com/default-icon.png')
            .setFooter({ text: 'Blight Death Announcement', iconURL: 'https://example.com/blight-icon.png' })
            .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
            .setTimestamp();

          if (characterInfo.userId) {
            await channel.send({ content: `<@${characterInfo.userId}>`, embeds: [embed] });
          } else {
            await channel.send({ embeds: [embed] });
            console.error(`[blightHandler]: Missing userId for ${characterInfo.name}`);
          }

          // ------------------- Mod Log Death Report -------------------
          try {
            const modLogChannel = client.channels.cache.get(process.env.MOD_LOG_CHANNEL_ID);
            if (modLogChannel) {
              const modLogEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('☠️ Character Death from Blight')
                .setDescription(`**Character**: ${characterInfo.name}\n**Owner**: <@${characterInfo.userId}>\n**Death Time**: <t:${Math.floor(Date.now() / 1000)}:F>`)
                .setThumbnail(characterInfo.icon || 'https://example.com/default-icon.png')
                .setFooter({ text: 'Blight Death Log', iconURL: 'https://example.com/blight-icon.png' })
                .setTimestamp();

              await modLogChannel.send({ embeds: [modLogEmbed] });
              console.log(`[blightHandler]: Sent death notification for ${characterInfo.name}`);
            } else {
              console.error('[blightHandler]: Mod log channel not found');
            }
          } catch (error) {
            handleError(error, 'blightHandler.js', {
              operation: 'sendModLogDeathReport',
              commandName: 'system',
              userTag: character.userId ? `User: ${character.userId}` : 'System',
              userId: character.userId || 'system',
              characterName: character.name
            });
            console.error('[blightHandler]: Error sending mod log death report:', error);
          }

          continue;
        }

        // ------------------- Non-death Stage 5 Alert -------------------
        const stage5Embed = new EmbedBuilder()
          .setColor('#AD1457')
          .setTitle(`⚠️ ${character.name} is at Blight Stage 5`)
          .setDescription(
            `❗ **Missed Roll**: Your blight is at the final stage and you are on the edge of death.\n\n` +
            `🕒 **Deadline**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:F>\n\n` +
            `⚠️ **You must be healed before the deadline to avoid certain death.**`
          )
          .setThumbnail(character.icon || 'https://example.com/default-icon.png')
          .setFooter({ text: 'Blight Stage 5 Alert' })
          .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
          .setTimestamp();

        await channel.send({ content: `<@${character.userId}>`, embeds: [stage5Embed] });
        continue;
      }

      // ========================================================================
      // ------------------- Missed Roll → Auto Progression -------------------
      // ========================================================================
      // Check if someone missed their roll; if so, auto-advance their blight stage.
      // A character has missed a roll if:
      // 1. We're at or past 12:59 AM UTC (check runs 1 min before 1 AM call = 8 PM EST)
      // 2. Their last roll was BEFORE the previous blight call boundary (they didn't roll in the period)
      // 3. They're not at stage 5 yet
      //
      // We've already skipped above: rolled in period, paused, or stage 5.
      const isPastBlightCallTime = (utcHour === 0 && utcMinute >= 59) || utcHour >= 1;
      const lastRollBeforePreviousCall = !character.lastRollDate || character.lastRollDate <= previousBlightCall;
      const shouldProgress = isPastBlightCallTime && lastRollBeforePreviousCall && character.blightStage < 5;
      
      if (shouldProgress) {
        console.log(`[blightHandler]: ⚠️ ${character.name} missed roll - Last roll: ${lastRollDate.toISOString()}, Previous boundary: ${previousBlightCall.toISOString()}, Current time: ${now.toISOString()}, Progressing from Stage ${character.blightStage}`);
        
        // Fetch the actual document from the correct model to update and save
        let characterDoc;
        if (character._isModCharacter) {
          characterDoc = await ModCharacter.findById(character._id);
        } else {
          characterDoc = await Character.findById(character._id);
        }
        
        if (!characterDoc) {
          console.error(`[blightHandler]: ❌ Character ${character.name} (${character._id}) not found in database - cannot progress blight`);
          continue;
        }
        
        characterDoc.blightStage += 1;

        if (characterDoc.blightStage === 5) {
          const oneDayMs = 24 * 60 * 60 * 1000;
          characterDoc.deathDeadline = new Date(Date.now() + 7 * oneDayMs);
          console.log(`[blightHandler]: ${characterDoc.name} reached Stage 5 - Death deadline set to ${characterDoc.deathDeadline.toISOString()}`);
        }

        // Update blight effects based on new stage
        characterDoc.blightEffects = {
          rollMultiplier: characterDoc.blightStage === 2 ? 1.5 : 1.0,
          noMonsters: characterDoc.blightStage >= 3,
          noGathering: characterDoc.blightStage >= 4
        };

        await characterDoc.save();
        console.log(`[blightHandler]: Saved progression for ${characterDoc.name} to Stage ${characterDoc.blightStage}`);
        
        // Update local character object for embed display
        character.blightStage = characterDoc.blightStage;
        character.deathDeadline = characterDoc.deathDeadline;

        const stageInfo = stageDescriptions[character.blightStage] || { 
          title: 'Unknown Stage', 
          desc: 'An unknown error occurred. Please contact support.' 
        };
        const embed = new EmbedBuilder()
          .setColor('#AD1457')
          .setTitle(stageInfo.title)
          .setDescription(
            `${stageInfo.desc}\n\n` +
            (character.blightStage === 5
              ? `❗ **Missed Roll**: Your blight is at the final stage and you are on the edge of death.\n\n` +
                `🕒 **Deadline**: <t:${Math.floor(character.deathDeadline.getTime() / 1000)}:F>\n\n` +
                `⚠️ You must be healed by a **Dragon** before the deadline to avoid death.`
              : `❗ **Missed Roll**: Your blight has progressed. Further missed rolls will increase its severity.`)
          )
          .setFooter({ text: 'Missed roll - Blight progressed!' })
          .setAuthor({
            name: 'Blight Progression Alert',
            iconURL: 'https://storage.googleapis.com/tinglebot/Graphics/blight_white.png'
          })
          .setThumbnail(character.icon)
          .setImage('https://storage.googleapis.com/tinglebot/border%20blight.png')
          .setTimestamp();

        await channel.send({ content: `<@${character.userId}>`, embeds: [embed] });
        console.log(`[blightHandler]: ${character.name} progressed to Stage ${character.blightStage}`);
      }
    }
    
    logger.info('BLIGHT', 'Completed checkMissedRolls successfully');
  } catch (error) {
    handleError(error, 'blightHandler.js', {
      operation: 'checkMissedRolls',
      commandName: 'system',
      userTag: 'System',
      userId: 'system'
    });
    console.error('[blightHandler]: ❌ Error checking missed rolls:', error);
  }
}

// ------------------- Function: getCharacterBlightHistory -------------------
// Retrieves the blight progression history for a character
async function getCharacterBlightHistory(characterId, limit = 10) {
  try {
    const BlightRollHistory = require('@/models/BlightRollHistoryModel');
    const history = await BlightRollHistory.find({ characterId })
      .sort({ timestamp: -1 })
      .limit(limit);
    return history;
  } catch (error) {
    // Try to fetch character info for better error reporting
    let userTag = 'System';
    let userId = 'system';
    try {
      const character = await Character.findById(characterId);
      if (character && character.userId) {
        userId = character.userId;
        userTag = `User: ${character.userId}`;
      }
    } catch (fetchError) {
      console.log(`[blightHandler]: Could not fetch character info for ${characterId}, using 'System' as fallback`);
    }
    
    handleError(error, 'blightHandler.js', {
      operation: 'getCharacterBlightHistory',
      commandName: 'system',
      userTag: userTag,
      userId: userId,
      characterId
    });
    console.error('[blightHandler]: Error fetching blight history:', error);
    throw error;
  }
}

// ============================================================================
// ------------------- Module Exports -------------------
// Exported functions for use in other parts of the app
// ============================================================================

module.exports = {
  loadBlightSubmissions,
  saveBlightSubmissions,
  finalizeBlightApplication,
  healBlight,
  submitHealingTask,
  rollForBlightProgression,
  postBlightRollCall,
  viewBlightHistory,
  viewBlightStatus,
  saveBlightEventToHistory,
  cleanupExpiredBlightRequests,
  checkExpiringBlightRequests,
  sendBlightReminders,
  validateCharacterOwnership,
  checkMissedRolls,
  getCharacterBlightHistory,
  completeBlightHealing,
  checkAndPostMissedBlightPing
};
