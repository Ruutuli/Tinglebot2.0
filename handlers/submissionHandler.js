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
    // Retrieve submission data from the in-memory store
    let submissionData = submissionStore.get(interaction.user.id);

    if (!submissionData) {
      const submissionId = interaction.message.embeds[0]?.fields?.find(field => field.name === 'Submission ID')?.value;
  
      console.log('Submission ID retrieved from message embed:', submissionId);
  
      submissionData = retrieveSubmissionFromStorage(submissionId);
  
      if (!submissionData) {
          console.error('No submission data found in memory or storage:', { submissionId });
          throw new Error('No submission data found for this user.');
      }
  }
  

    const { fileUrl, fileName, baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount } = submissionData;
    const user = interaction.user;

    if (!fileUrl || !fileName) {
      throw new Error('File URL or File Name missing.');
    }

    // Recalculate tokens
    const { totalTokens } = calculateTokens({
      baseSelections: baseSelections || [],
      typeMultiplierSelections: typeMultiplierSelections || [],
      productMultiplierValue: productMultiplierValue || 1,
      addOnsApplied: addOnsApplied || [],
      characterCount: characterCount || 1,
    });

    // Update the final token amount
    submissionData.finalTokenAmount = totalTokens;

    // Send confirmation message
    const sentMessage = await interaction.followUp({
      embeds: [{
        title: 'Submission Complete!',
        description: `Your submission has been confirmed. Your art has been uploaded successfully and your token count has been finalized.`,
        fields: [
          { name: 'Final Token Amount', value: `${totalTokens} Tokens`, inline: true },
        ],
        image: { url: fileUrl },
        color: 0x00ff00,
      }],
      components: [],
    });

    // Save updated submission data to persistent storage
    await saveSubmissionToStorage(submissionData.submissionId, {
      submissionId: submissionData.submissionId,
      userId: interaction.user.id,
      fileUrl: fileUrl,
      fileName: fileName,
      messageUrl: sentMessage.url || null, // Save message URL here
      characterCount, // Ensure this is saved
      tokenCalculation: submissionData.tokenCalculation || '',
      finalTokenAmount: totalTokens,
      submittedAt: new Date(),
    });

    // Reset in-memory store
    submissionStore.delete(interaction.user.id);
    resetSubmissionState();
  } catch (error) {
    console.error('Error completing submission:', error);
    await interaction.followUp({
      content: '⚠️ **Error completing submission. Please try again.**',
      ephemeral: true,
    });
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
      console.error('submissionhandler.js Submission ID is undefined', submissionData);
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
