// ------------------- Submission Handler -------------------
// Handles finalizing the submission, uploading images, sending confirmation, and canceling the submission

// ------------------- Imports -------------------
// Grouped related imports for clarity
const { uploadSubmissionImage } = require('../utils/uploadUtils');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { resetSubmissionState } = require('../utils/tokenUtils');
const { saveSubmissionToStorage, submissionStore, retrieveSubmissionFromStorage } = require('../utils/storage');
const { appendEarnedTokens } = require('../database/tokenService');
const { processSubmissionTokenCalculation } = require('../utils/tokenUtils');

// ------------------- Helper Function -------------------
// Capitalizes the first letter of a string
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// ------------------- Handle Submission Completion -------------------
async function handleSubmissionCompletion(interaction) {
  try {
    const submissionData = submissionStore.get(interaction.user.id);

    if (!submissionData) {
      // New: Attempt to retrieve from persistent storage
      const submissionId = interaction.message.embeds[0]?.fields?.find(field => field.name === 'Submission ID')?.value;
      submissionData = retrieveSubmissionFromStorage(submissionId);
    
      if (!submissionData) {
        throw new Error('No submission data found for this user.');
      }
    }

    const { fileUrl, fileName, baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount, finalTokenAmount } = submissionData;
    const submissionId = Date.now().toString();
    const user = interaction.user;

    if (!fileUrl || !fileName) {
      throw new Error('File URL or File Name missing.');
    }

    // Upload the image and retrieve the public URL
    const publicImageUrl = await uploadSubmissionImage(fileUrl, fileName);

// ------------------- Token Calculation -------------------


const tokenCalculation = processSubmissionTokenCalculation({
  baseSelections,
  typeMultiplierSelections,
  productMultiplierValue,
  addOnsApplied,
  characterCount,
  finalTokenAmount,
});

    // Use code block format for token calculation
    tokenCalculation = `\`\`\`\n${tokenCalculation}\n\`\`\``;

    const tokenTrackerLink = 'https://your-token-tracker-url.com';

    // ------------------- Store Correct Message URL -------------------
    const sentMessage = await interaction.followUp({
      embeds: [submissionEmbed],
      components: []
    });

    await saveSubmissionToStorage(submissionId, {
      submissionId,
      userId: interaction.user.id,
      fileUrl: publicImageUrl,
      fileName,
      messageUrl: sentMessage.url,
      tokenCalculation,
      finalTokenAmount,
      submittedAt: new Date(),
    });

    resetSubmissionState();
    submissionStore.delete(interaction.user.id);

  } catch (error) {
    console.error('Error completing submission:', error);
    if (!interaction.replied) {
      await interaction.followUp({
        content: '⚠️ **Error completing submission.** Please try again.',
        ephemeral: true,
      });
    }
  }
}

// ------------------- Handle Cancel Submission -------------------
// Cancels the submission process and resets the state
async function handleCancelSubmission(interaction) {
  try {
    const userId = interaction.user.id;

    // Reset and clear submission data
    resetSubmissionState();
    submissionStore.delete(userId);

    // New: Delete from persistent storage
    const submissionId = `${userId}-${Date.now()}`;
    deleteSubmissionFromStorage(submissionId);

    await interaction.update({
      content: '🚫 **Submission canceled**. Please restart the process if you wish to submit again.',
      components: [], // Remove all action components
    });
  } catch (error) {
    await interaction.followUp({
      content: '⚠️ **Error canceling submission.** Please try again.',
      ephemeral: true,
    });
  }
}

// ------------------- Handle Submit Action -------------------
// Handles the action triggered by confirmation or cancellation
async function handleSubmitAction(interaction) {
  const customId = interaction.customId;

  if (customId === 'confirm') {
    await handleSubmissionCompletion(interaction);

    const submissionId = interaction.message.embeds[0]?.fields?.find(field => field.name === 'Submission ID')?.value;

    if (!submissionId) {
      if (!interaction.replied) {
        return interaction.reply({
          content: `⚠️ Submission ID not found.`,
          ephemeral: true,
        });
      }
      return; // Exit if no submission ID is found
    }

    const submission = await retrieveSubmissionFromStorage(submissionId);

    if (!submission) {
      if (!interaction.replied) {
        return interaction.reply({
          content: `⚠️ Submission with ID \`${submissionId}\` not found.`,
          ephemeral: true,
        });
      }
      return; // Exit if no submission is found
    }

    const userId = submission.userId;
    const fileName = submission.fileName;
    const tokenAmount = submission.finalTokenAmount;
    const fileUrl = submission.fileUrl;

    try {
      await appendEarnedTokens(userId, fileName, 'art', tokenAmount, fileUrl);
      console.log(`Token data for submission ${submissionId} has been appended to Google Sheets.`);
    } catch (error) {
      console.error(`Error appending token data for submission ${submissionId}: ${error.message}`);
    }

    if (!interaction.replied) {
      await interaction.editReply({
        content: `✅ Submission has been confirmed and approved. Your tokens have been updated!`,
        components: []
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

// ------------------- Exported Handlers -------------------
// Exported functions for handling submission actions
module.exports = { handleSubmitAction, handleSubmissionCompletion, handleCancelSubmission };
