// ------------------- Approve/Deny Command -------------------

// ------------------- Imports -------------------
// Grouped and organized imports: Standard libraries, third-party libraries, and local modules
const { SlashCommandBuilder } = require('discord.js');
const { retrieveSubmissionFromStorage, deleteSubmissionFromStorage } = require('../utils/storage');
const { appendDataToSheet } = require('../utils/googleSheetsUtils');
const { getUserGoogleSheetId } = require('../database/tokenService');
const { updateTokenBalance, appendEarnedTokens, getOrCreateToken  } = require('../database/tokenService');
const fs = require('fs');

// ------------------- Helper Functions -------------------


// ------------------- React to Message -------------------
async function reactToMessage(interaction, messageUrl, emoji) {
  if (!messageUrl || typeof messageUrl !== 'string') {
    console.error('Invalid message URL:', messageUrl);
    throw new Error('Message URL is invalid or undefined.');
  }
  // Extract the channel ID and message ID from the URL
  const messageParts = messageUrl.split('/');
  const channelId = messageParts[5];
  const messageId = messageParts[6];
  console.log(`Extracted channel ID: ${channelId}, message ID: ${messageId}`);

  try {
    console.log(`Reacting to message in channel: ${channelId}, message ID: ${messageId}`);
    
    // Fetch the channel and then the message
    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    const message = await channel.messages.fetch(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    // Add the specified emoji reaction to the message
    await message.react(emoji);
    console.log(`Reacted to message with ${emoji}`);
  } catch (error) {
    // Log detailed error information
    console.error(`Failed to react to the message: ${error.message}`);
  }
}

// ------------------- Notify User -------------------
async function notifyUser(interaction, userId, messageContent) {
  const user = await interaction.client.users.fetch(userId);
  await user.send(messageContent);
}

// ------------------- Reply to Admin -------------------
async function replyToAdmin(interaction, messageContent) {
  if (!interaction.replied) {
    await interaction.reply({
      content: messageContent,
      ephemeral: true,
    });
  }
}

// ------------------- Approve Submission -------------------
// Handles approving a submission and updating user tokens
async function approveSubmission(interaction, submissionId) {
  console.log(`[approveCommand.js]: Attempting to retrieve submission with ID: ${submissionId}`);

  // Defer interaction to prevent timeout
  await interaction.deferReply({ ephemeral: true });

  try {
    const submission = await retrieveSubmissionFromStorage(submissionId);

    if (!submission) {
      throw new Error(`Submission with ID \`${submissionId}\` not found.`);
    }

    const { userId, collab, category = 'art', finalTokenAmount: tokenAmount, title = fileName, messageUrl } = submission;

    if (!messageUrl) {
      throw new Error('Message URL is invalid or undefined.');
    }

    const user = await getOrCreateToken(userId);
    if (!user) {
      throw new Error(`User with ID \`${userId}\` not found.`);
    }

    await reactToMessage(interaction, messageUrl, '☑️');

    if (collab) {
      const splitTokens = Math.floor(tokenAmount / 2);
      const collaboratorId = collab.replace(/[<@>]/g, '');

      // Update tokens for both users
      await updateTokenBalance(userId, splitTokens);
      await appendEarnedTokens(userId, title, category, tokenAmount, messageUrl);;

      await updateTokenBalance(collaboratorId, splitTokens);
      await appendEarnedTokens(collaboratorId, title, category, splitTokens, messageUrl);

      // Notify both users
      await notifyUser(interaction, userId, `☑️ Your submission \`${submissionId}\` has been approved! You have received ${splitTokens} tokens.`);
      await notifyUser(interaction, collaboratorId, `☑️ A submission you collaborated on (\`${submissionId}\`) has been approved! You have received ${splitTokens} tokens.`);

      console.log(`[approveCommand.js]: Tokens split between user ${userId} and collaborator ${collaboratorId}.`);
    } else {
      // Update tokens for the main user only
      await updateTokenBalance(userId, tokenAmount);
      await appendEarnedTokens(userId, title, category, tokenAmount, messageUrl);

      // Notify the user
      await notifyUser(interaction, userId, `☑️ Your submission \`${submissionId}\` has been approved! ${tokenAmount} tokens have been added to your balance.`);

      console.log(`[approveCommand.js]: Tokens updated for user ${userId}.`);
    }

    await interaction.editReply(`☑️ Submission \`${submissionId}\` has been approved.`);
    await deleteSubmissionFromStorage(submissionId);
    console.log(`[approveCommand.js]: Submission ${submissionId} successfully approved.`);
  } catch (error) {
    console.error(`[approveCommand.js]: Error during approval process: ${error.message}`);
    await replyToAdmin(interaction, '⚠️ An error occurred while processing the submission. Please try again later.');
  }
}



// ------------------- Deny Submission -------------------
async function denySubmission(interaction, submissionId, reason) {
  const submission = await retrieveSubmissionFromStorage(submissionId);

  if (!submission) {
    return replyToAdmin(interaction, `⚠️ Submission with ID \`${submissionId}\` not found.`);
  }

  const messageUrl = submission.messageUrl;
  if (!messageUrl) {
    console.error(`Invalid message URL in submission:`, submission);
    throw new Error('Message URL is invalid or undefined.');
  }

  // React to the message and notify the user
  await reactToMessage(interaction, messageUrl, '❌');
  await notifyUser(
    interaction,
    submission.userId,
    `❌ Your submission \`${submissionId}\` has been denied. Please resubmit the submission for approval.\n**Reason:** ${reason || 'No reason provided.'}`
  );

  // Reply to the admin
  await replyToAdmin(interaction, `❌ Submission \`${submissionId}\` has been denied. Please resubmit the submission for approval. Reason: ${reason || 'No reason provided.'}`);

  // Optionally delete the submission from storage after denial
  await deleteSubmissionFromStorage(submissionId);
}

// ------------------- Command Definition -------------------
module.exports = {
  data: new SlashCommandBuilder()
    .setName('approve')
    .setDescription('Approve or deny a submission.')
    .addStringOption(option =>
      option.setName('submission_id')
        .setDescription('The ID of the submission to approve/deny.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Approve or deny the submission.')
        .setRequired(true)
        .addChoices(
          { name: 'Approve', value: 'approve' },
          { name: 'Deny', value: 'deny' }
        )
    )
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Provide a reason for denying the submission (optional).')
        .setRequired(false)
    ),

  // ------------------- Execute Command -------------------
  async execute(interaction) {
    const submissionId = interaction.options.getString('submission_id');
    const action = interaction.options.getString('action');

    // Call the corresponding function based on the action selected
    if (action === 'approve') {
      // Approve regular submission or blight submission based on context
      await approveSubmission(interaction, submissionId); // Assuming regular approval for non-blight
    } else if (action === 'deny') {
      const reason = interaction.options.getString('reason') || null;
      await denySubmission(interaction, submissionId, reason);
      
    }
  },
};
