// ------------------- Submission Handler -------------------
// Handles finalizing the submission, uploading images, sending confirmation, and canceling the submission

// ------------------- Imports -------------------
// Grouped related imports for clarity
const { uploadSubmissionImage } = require('../utils/uploadUtils');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { resetSubmissionState } = require('../utils/tokenUtils');
const { saveSubmissionToStorage, submissionStore, retrieveSubmissionFromStorage } = require('../utils/storage');
const { appendEarnedTokens } = require('../database/tokenService');

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
      throw new Error('No submission data found for this user.');
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
    let tokenCalculation = baseSelections
      .map(base => `${capitalizeFirstLetter(base)} (15 × ${characterCount})`)
      .join('\n+ ');

    tokenCalculation += `\n× ${typeMultiplierSelections
      .map(multiplier => `${capitalizeFirstLetter(multiplier)} (1.5 × ${characterCount})`)
      .join(' + ')}`;

    tokenCalculation += `\n× Fullcolor (${productMultiplierValue} × 1)`;

    if (addOnsApplied.length > 0) {
      addOnsApplied.forEach(addOn => {
        tokenCalculation += `\n+ ${capitalizeFirstLetter(addOn)} (1.5 × 1)`; 
      });
    }

    tokenCalculation += `\n---------------------\n= ${finalTokenAmount} Tokens`;

    // Use code block format for token calculation
    tokenCalculation = `\`\`\`\n${tokenCalculation}\n\`\`\``;

    const tokenTrackerLink = 'https://your-token-tracker-url.com';

    // ------------------- Embed Message -------------------
    const submissionEmbed = new EmbedBuilder()
      .setColor('#AA926A')
      .setTitle('Submission Complete! 🎉')
      .setImage(publicImageUrl)
      .addFields(
        { name: 'User', value: user.tag },
        { name: 'Submission ID', value: submissionId },
        { name: 'File Name', value: fileName },
        { name: 'Upload Link', value: `[Image](${publicImageUrl})` },
        { name: 'Token Calculation', value: tokenCalculation, inline: false },
        { name: 'Token Tracker', value: `[Tracker](${tokenTrackerLink})`, inline: false }
      )
      .setTimestamp()
      .setFooter({ text: 'A mod will confirm your submission, and once it’s confirmed, it will show on your token tracker.' });

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
    resetSubmissionState();

    await interaction.update({
      content: '🚫 **Submission canceled**. Please restart the process if you wish to submit again.',
      components: [] // Remove all action components
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
