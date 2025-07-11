// ------------------- submissionHandler.js -------------------
// This module handles finalizing the submission, uploading images, sending confirmation,
// updating token counts, and canceling the submission process.

// ============================================================================
// Discord.js Components
// ============================================================================

const { EmbedBuilder } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ============================================================================
// Database Services
// ============================================================================

const { appendEarnedTokens, updateTokenBalance } = require('../database/db');

// ============================================================================
// Utility Functions
// ============================================================================

const { resetSubmissionState, calculateTokens } = require('../utils/tokenUtils');
// Storage utilities
const { 
  saveSubmissionToStorage, 
  updateSubmissionData, 
  retrieveSubmissionFromStorage, 
  deleteSubmissionFromStorage,
  findLatestSubmissionIdForUser 
} = require('../utils/storage');


// ============================================================================
// Submission Completion Handler
// ============================================================================

// ------------------- Handle Submission Completion -------------------
// Finalizes the submission by retrieving submission data, recalculating tokens, 
// sending a confirmation message to the user, saving updated submission data, and resetting in-memory state.
async function handleSubmissionCompletion(interaction) {
  try {
    console.log(`[submissionHandler.js]: 🔄 Starting submission completion for user: ${interaction.user.id}`);
    // Get submission ID from the embed
    const messageEmbed = interaction.message.embeds[0];
    console.log(`[submissionHandler.js]: 📝 Embed fields:`, messageEmbed?.fields?.map(f => `${f.name}: ${f.value}`));
    
    const submissionId = messageEmbed?.fields?.find(field => field.name === 'Submission ID')?.value;
    console.log(`[submissionHandler.js]: 🔑 Found submission ID in embed: ${submissionId}`);
    
    if (!submissionId) {
      console.error(`[submissionHandler.js]: ❌ No submission ID found in embed`);
      await interaction.reply({
        content: '❌ **Submission ID not found. Please restart the submission process.**',
        ephemeral: true,
      });
      return;
    }

    // Retrieve submission data from storage using submissionId
    console.log(`[submissionHandler.js]: 🔍 Attempting to retrieve submission data for ID: ${submissionId}`);
    const submissionData = await retrieveSubmissionFromStorage(submissionId);
    console.log(`[submissionHandler.js]: 📊 Retrieved submission data:`, submissionData ? 'Found' : 'Not found');

    if (!submissionData) {
      console.error(`[submissionHandler.js]: ❌ No submission data found for ID: ${submissionId}`);
      // Try to find the latest submission for this user as a fallback
      const userId = interaction.user.id;
      console.log(`[submissionHandler.js]: 🔄 Attempting fallback lookup for user: ${userId}`);
      
      const latestSubmissionId = await findLatestSubmissionIdForUser(userId);
      console.log(`[submissionHandler.js]: 🔑 Found latest submission ID: ${latestSubmissionId}`);
      
      if (latestSubmissionId) {
        const latestSubmission = await retrieveSubmissionFromStorage(latestSubmissionId);
        console.log(`[submissionHandler.js]: 📊 Retrieved latest submission data:`, latestSubmission ? 'Found' : 'Not found');
        
        if (latestSubmission) {
          console.log(`[submissionHandler.js]: ✅ Found fallback submission ${latestSubmissionId}`);
          return await handleSubmissionCompletion(interaction, latestSubmission);
        }
      }
      
      console.error(`[submissionHandler.js]: ❌ No fallback submission found for user: ${userId}`);
      await interaction.reply({
        content: '❌ **Submission data not found. Please restart the submission process.**',
        ephemeral: true,
      });
      return;
    }

    console.log(`[submissionHandler.js]: 📝 Processing submission data for ID: ${submissionId}`);
    const { fileUrl, fileName, baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount } = submissionData;
    const user = interaction.user;

    if (!fileUrl || !fileName) {
      console.error(`[submissionHandler.js]: ❌ Missing required fields - fileUrl: ${!!fileUrl}, fileName: ${!!fileName}`);
      throw new Error('File URL or File Name missing.');
    }

    // Validate required selections
    if (!productMultiplierValue) {
      throw new Error('Product multiplier is required. Please select a product multiplier before submitting.');
    }
    
    // Calculate final token amount
    console.log(`[submissionHandler.js]: 🧮 Calculating tokens for submission:`, {
      baseSelections,
      baseCounts: Object.fromEntries(submissionData.baseCounts || new Map()),
      typeMultiplierSelections,
      productMultiplierValue,
      addOnsApplied
    });
    
    const { totalTokens, breakdown } = calculateTokens({
      baseSelections,
      baseCounts: submissionData.baseCounts || new Map(),
      typeMultiplierSelections,
      productMultiplierValue,
      addOnsApplied,
      typeMultiplierCounts: submissionData.typeMultiplierCounts || {},
      specialWorksApplied: submissionData.specialWorksApplied || [],
      collab: submissionData.collab
    });
    console.log(`[submissionHandler.js]: 💰 Calculated tokens: ${totalTokens}`);
    console.log(`[submissionHandler.js]: 📊 Token breakdown:`, breakdown);

    // Update submission data with final calculations
    submissionData.finalTokenAmount = totalTokens;
    submissionData.tokenCalculation = breakdown;
    submissionData.updatedAt = new Date();

    // Save updated submission data using submissionId
    console.log(`[submissionHandler.js]: 💾 Saving final submission data for ID: ${submissionId}`);
    await saveSubmissionToStorage(submissionId, submissionData);
    console.log(`[submissionHandler.js]: ✅ Final submission data saved`);

    // Create and send the embed
    console.log(`[submissionHandler.js]: 🎨 Creating submission embed`);
    const embed = createArtSubmissionEmbed(submissionData);
    await interaction.reply({ embeds: [embed] });
    console.log(`[submissionHandler.js]: ✅ Submission embed sent`);

    // Update token count in database and log to Google Sheets
    console.log(`[submissionHandler.js]: 💰 Updating token count for user: ${user.id}`);
    await appendEarnedTokens(user.id, fileName, 'art', totalTokens, fileUrl);
    await updateTokenBalance(user.id, totalTokens);
    console.log(`[submissionHandler.js]: ✅ Token count updated`);

    // Clean up storage
    console.log(`[submissionHandler.js]: 🧹 Cleaning up submission data for ID: ${submissionId}`);
    await deleteSubmissionFromStorage(submissionId);
    console.log(`[submissionHandler.js]: ✅ Submission data cleaned up`);

  } catch (error) {
    handleError(error, 'submissionHandler.js');
    console.error(`[submissionHandler.js]: ❌ Error in handleSubmissionCompletion:`, error);
    console.error(`[submissionHandler.js]: 📝 Error details:`, {
      message: error.message,
      stack: error.stack,
      interaction: {
        userId: interaction.user.id,
        messageId: interaction.message?.id,
        customId: interaction.customId
      }
    });
    
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ **An error occurred while processing your submission.**',
        ephemeral: true
      });
    }
  }
}

// ============================================================================
// Submission Cancellation Handler
// ============================================================================

// ------------------- Handle Cancel Submission -------------------
// Cancels the submission process, removes persistent data if applicable, 
// resets the in-memory submission state, and notifies the user.
async function handleCancelSubmission(interaction) {
  try {
    // Get submission ID from the embed
    const submissionId = interaction.message.embeds[0]?.fields?.find(field => field.name === 'Submission ID')?.value;
    
    if (!submissionId) {
      console.error(`[submissionHandler.js]: handleCancelSubmission: No submission ID found in embed`);
      await interaction.reply({
        content: '❌ **Submission ID not found. Please restart the submission process.**',
        ephemeral: true,
      });
      return;
    }

    // Delete submission from storage using submissionId
    await deleteSubmissionFromStorage(submissionId);

    // Notify the user about cancellation
    await interaction.update({
      content: '🚫 **Submission canceled.** Please restart the process if you wish to submit again.',
      components: [], // Remove all action components
    });
  } catch (error) {
    handleError(error, 'submissionHandler.js');
    console.error(`[submissionHandler.js]: handleCancelSubmission: ${error.message}`);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ **An error occurred while canceling your submission.**',
        ephemeral: true
      });
    }
  }
}

// ============================================================================
// Submit Action Handler
// ============================================================================

// ------------------- Handle Submit Action -------------------
// Processes the user's submit action by checking the customId of the interaction.
// For confirmation, it finalizes the submission and updates token data;
// for cancellation, it aborts the process.
async function handleSubmitAction(interaction) {
  const customId = interaction.customId;

  if (customId === 'confirm') {
    await handleSubmissionCompletion(interaction);

    const submissionId = interaction.message.embeds[0]?.fields?.find(field => field.name === 'Submission ID')?.value;

    if (!submissionId) {
      console.error(`[submissionHandler.js]: handleSubmitAction: Submission ID is undefined.`);
      if (!interaction.replied) {
        return interaction.reply({
          content: '⚠️ **Submission ID not found.**',
          ephemeral: true,
        });
      }
      return; // Exit if no submission ID is found
    }

    const submission = await retrieveSubmissionFromStorage(submissionId);

    if (!submission) {
      if (!interaction.replied) {
        return interaction.reply({
          content: `⚠️ **Submission with ID \`${submissionId}\` not found.**`,
          ephemeral: true,
        });
      }
      return; // Exit if no submission is found
    }

    const user = interaction.user;

    try {
      // ------------------- Update Token Data -------------------
      // If a collaboration exists, split tokens; otherwise, assign all tokens to the main user.
      if (submission.collab) {
        const splitTokens = submission.finalTokenAmount / 2;
        // Update tokens for the main user
        await appendEarnedTokens(user.id, submission.fileName, 'art', splitTokens, submission.fileUrl);
        await updateTokenBalance(user.id, splitTokens);
        // Update tokens for the collaborator (extracting their user ID)
        const collaboratorId = submission.collab.replace(/[<@>]/g, '');
        await appendEarnedTokens(collaboratorId, submission.fileName, 'art', splitTokens, submission.fileUrl);
        await updateTokenBalance(collaboratorId, splitTokens);
      } else {
        // No collaboration; assign all tokens to the main user.
        await appendEarnedTokens(user.id, submission.fileName, 'art', submission.finalTokenAmount, submission.fileUrl);
        await updateTokenBalance(user.id, submission.finalTokenAmount);
      }
    } catch (error) {
    handleError(error, 'submissionHandler.js');

      console.error(`[submissionHandler.js]: handleSubmitAction: Error appending token data for submission ${submissionId}: ${error.message}`);
    }

    if (!interaction.replied) {
      await interaction.editReply({
        content: '✅ **Submission has been confirmed and approved.** Your tokens have been updated!',
        components: [],
      });
    }
  } else if (customId === 'cancel') {
    await handleCancelSubmission(interaction);
  } else {
    if (!interaction.replied) {
      await interaction.reply({ content: '⚠️ **Unknown action!**', ephemeral: true });
    }
  }
}

// ============================================================================
// Exported Handlers
// ============================================================================

// ------------------- Exported Functions -------------------
// Exports the submission action handlers for use in other parts of the application.
module.exports = { handleSubmitAction, handleSubmissionCompletion, handleCancelSubmission };
