// ------------------- submissionHandler.js -------------------
// This module handles finalizing the submission, uploading images, sending confirmation,
// updating token counts, and canceling the submission process.

// ============================================================================
// Discord.js Components
// ============================================================================

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ============================================================================
// Database Services
// ============================================================================

const { appendEarnedTokens } = require('../database/tokenService');

// ============================================================================
// Utility Functions
// ============================================================================

const { resetSubmissionState, calculateTokens } = require('../utils/tokenUtils');
const { saveSubmissionToStorage, submissionStore, retrieveSubmissionFromStorage, deleteSubmissionFromStorage } = require('../utils/storage');

// ============================================================================
// Helper Functions
// ============================================================================

// ------------------- Capitalize First Letter -------------------
// Capitalizes the first letter of a string.
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// ============================================================================
// Submission Completion Handler
// ============================================================================

// ------------------- Handle Submission Completion -------------------
// Finalizes the submission by retrieving submission data, recalculating tokens, 
// sending a confirmation message to the user, saving updated submission data, and resetting in-memory state.
async function handleSubmissionCompletion(interaction) {
  try {
    // Retrieve submission data from the in-memory store
    let submissionData = submissionStore.get(interaction.user.id);

    if (!submissionData) {
      console.error(`[submissionHandler.js]: handleSubmissionCompletion: No submission data found in memory for user: ${interaction.user.id}`);

      const submissionId = interaction.message.embeds[0]?.fields?.find(field => field.name === 'Submission ID')?.value;
      if (submissionId) {
        console.error(`[submissionHandler.js]: handleSubmissionCompletion: Attempting to retrieve submission data from storage using ID: ${submissionId}`);
        submissionData = retrieveSubmissionFromStorage(submissionId);
      }

      if (!submissionData) {
        console.error(`[submissionHandler.js]: handleSubmissionCompletion: No submission data found in memory or storage for user: ${interaction.user.id}`);
        await interaction.reply({
          content: '❌ **Submission data not found. Please restart the submission process.**',
          ephemeral: true,
        });
        return;
      }
    }

    const { fileUrl, fileName, baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount } = submissionData;
    const user = interaction.user;

    if (!fileUrl || !fileName) {
      throw new Error('File URL or File Name missing.');
    }

    // ------------------- Recalculate Tokens -------------------
    // Calculate the total tokens based on the submission selections.
    const { totalTokens } = calculateTokens({
      baseSelections: baseSelections || [],
      typeMultiplierSelections: typeMultiplierSelections || [],
      productMultiplierValue: productMultiplierValue || 1,
      addOnsApplied: addOnsApplied || [],
      characterCount: characterCount || 1,
      collab: submissionData.collab || null, // Include collaboration if applicable
    });

    // Update the final token amount in submission data
    submissionData.finalTokenAmount = totalTokens;

    // ------------------- Send Confirmation Message -------------------
    // Sends an embed message confirming the submission and displaying token details.
    const sentMessage = await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setTitle('Submission Complete!')
          .setDescription(`Your submission has been confirmed. Your art has been uploaded successfully and your token count has been finalized.`)
          .addFields([{ name: 'Final Token Total Amount', value: `${totalTokens} Tokens`, inline: true }])
          .setImage(fileUrl)
          .setColor(0x00ff00)
      ],
      components: [],
    });

    // ------------------- Save Submission Data -------------------
    // Save updated submission data to persistent storage.
    await saveSubmissionToStorage(submissionData.submissionId, {
      submissionId: submissionData.submissionId,
      userId: user.id,
      fileUrl,
      fileName,
      messageUrl: sentMessage.url || null, // Save message URL
      characterCount,
      tokenCalculation: submissionData.tokenCalculation || '',
      finalTokenAmount: totalTokens,
      submittedAt: new Date(),
    });

    // (Removed duplicate call to saveSubmissionToStorage to avoid redundancy)

    // ------------------- Reset Submission State -------------------
    // Clear the in-memory submission data and reset any global state.
    submissionStore.delete(user.id);
    resetSubmissionState();
  } catch (error) {
    handleError(error, 'submissionHandler.js');

    console.error(`[submissionHandler.js]: handleSubmissionCompletion: Error completing submission: ${error.message}`);
    await interaction.followUp({
      content: '⚠️ **Error completing submission. Please try again.**',
      ephemeral: true,
    });
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
    const userId = interaction.user.id;

    // Retrieve submission data from memory
    const submissionData = submissionStore.get(userId);

    if (submissionData && submissionData.submissionId) {
      console.error(`[submissionHandler.js]: handleCancelSubmission: Deleting submission from storage: ${submissionData.submissionId}`);
      // Remove submission from persistent storage
      deleteSubmissionFromStorage(submissionData.submissionId);
    } else {
      console.error(`[submissionHandler.js]: handleCancelSubmission: No submission data found in memory for user: ${userId}`);
    }

    // Reset and clear in-memory data
    resetSubmissionState();
    submissionStore.delete(userId);

    // Notify the user about cancellation
    await interaction.update({
      content: '🚫 **Submission canceled.** Please restart the process if you wish to submit again.',
      components: [], // Remove all action components
    });
  } catch (error) {
    handleError(error, 'submissionHandler.js');

    console.error(`[submissionHandler.js]: handleCancelSubmission: Error canceling submission: ${error.message}`);
    await interaction.followUp({
      content: '⚠️ **Error canceling submission. Please try again.**',
      ephemeral: true,
    });
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
        // Update tokens for the collaborator (extracting their user ID)
        const collaboratorId = submission.collab.replace(/[<@>]/g, '');
        await appendEarnedTokens(collaboratorId, submission.fileName, 'art', splitTokens, submission.fileUrl);
      } else {
        // No collaboration; assign all tokens to the main user.
        await appendEarnedTokens(user.id, submission.fileName, 'art', submission.finalTokenAmount, submission.fileUrl);
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
