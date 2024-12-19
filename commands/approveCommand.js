// ------------------- Approve/Deny Command -------------------
// This file allows admins to approve or deny submissions via commands

// ------------------- Imports -------------------
// Grouped and organized imports: Standard libraries, third-party libraries, and local modules
const { SlashCommandBuilder } = require('discord.js');
const { retrieveSubmissionFromStorage, deleteSubmissionFromStorage } = require('../utils/storage');
const { appendDataToSheet } = require('../utils/googleSheetsUtils');
const { getUserGoogleSheetId } = require('../database/tokenService');
const { updateTokenBalance, appendEarnedTokens, getOrCreateToken  } = require('../database/tokenService');
const fs = require('fs');

// ------------------- Helper Functions -------------------
// Condensed logic for common operations

// ------------------- React to Message -------------------
// Reacts to a message with a specific emoji
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
// Sends a notification message to the user
async function notifyUser(interaction, userId, messageContent) {
  const user = await interaction.client.users.fetch(userId);
  await user.send(messageContent);
}

// ------------------- Reply to Admin -------------------
// Sends a reply to the admin who initiated the command
async function replyToAdmin(interaction, messageContent) {
  if (!interaction.replied) {
    await interaction.reply({
      content: messageContent,
      ephemeral: true,
    });
  }
}

// ------------------- Approve Submission -------------------
// Handles approving the submission and updating user tokens
async function approveSubmission(interaction, submissionId) {
  console.log(`[approveCommand.js]: Attempting to retrieve submission with ID: ${submissionId}`);

  try {
    const submission = await retrieveSubmissionFromStorage(submissionId);

    if (!submission) {
      console.error(`[approveCommand.js]: Submission not found for ID: ${submissionId}`);
      return replyToAdmin(interaction, `⚠️ Submission with ID \`${submissionId}\` not found.`);
    }

    console.log(`[approveCommand.js]: Retrieved submission:`, submission);

    const userId = submission.userId;
    console.log(`[approveCommand.js]: Fetching or creating user for discordId: ${userId}`);
    
    const user = await getOrCreateToken(userId);

    if (!user) {
      console.error(`[approveCommand.js]: User not found or failed to create for discordId: ${userId}`);
      return replyToAdmin(interaction, `⚠️ User with ID \`${userId}\` not found.`);
    }

    console.log(`[approveCommand.js]: Retrieved or created user:`, user);

    const spreadsheetId = await getUserGoogleSheetId(userId);

    if (!spreadsheetId) {
      console.error(`[approveCommand.js]: No Google Sheets linked for user ${userId}`);
      return replyToAdmin(interaction, `⚠️ No Google Sheets linked for user \`${userId}\`.`);
    }

    console.log(`[approveCommand.js]: Retrieved spreadsheetId: ${spreadsheetId}`);

    const category = submission.category || 'art';
    const tokenAmount = submission.finalTokenAmount;
    const fileName = submission.fileName || submission.title || submissionId;
    const messageUrl = submission.messageUrl;

    if (!messageUrl) {
      console.error(`[approveCommand.js]: Invalid or undefined message URL in submission:`, submission);
      throw new Error('Message URL is invalid or undefined.');
    }

    await reactToMessage(interaction, messageUrl, '☑️');
    console.log(`[approveCommand.js]: Reacted to message with ☑️`);

    await notifyUser(
      interaction,
      userId,
      `☑️ Your submission \`${submissionId}\` has been approved! ${tokenAmount} tokens have been added to your balance.`
    );
    console.log(`[approveCommand.js]: Notified user ${userId}`);

    await updateTokenBalance(userId, tokenAmount);
    console.log(`[approveCommand.js]: Token balance updated for user ${userId} with ${tokenAmount} tokens`);
    
    const submissionLink = submission.messageUrl || 'N/A';
    await appendEarnedTokens(userId, fileName, category, tokenAmount, submissionLink);
    console.log(`[approveCommand.js]: Appended earned tokens for user ${userId}`);

    await replyToAdmin(
      interaction,
      `☑️ Submission \`${submissionId}\` has been approved, and ${tokenAmount} tokens have been added to the user's balance.`
    );

    await deleteSubmissionFromStorage(submissionId);
    console.log(`[approveCommand.js]: Submission ${submissionId} successfully approved.`);
  } catch (error) {
    console.error(`[approveCommand.js]: Error during approval process: ${error.message}`);
    await replyToAdmin(interaction, '⚠️ An error occurred while processing the submission. Please try again later.');
  }
}


// ------------------- Deny Submission -------------------
// Handles denying a submission and notifying the user
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
// Defines the command for approving or denying submissions or blight tasks
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
