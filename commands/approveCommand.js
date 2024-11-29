// ------------------- Approve/Deny Command -------------------
// This file allows admins to approve or deny submissions via commands

// ------------------- Imports -------------------
// Grouped and organized imports: Standard libraries, third-party libraries, and local modules
const { SlashCommandBuilder } = require('discord.js');
const { retrieveSubmissionFromStorage, deleteSubmissionFromStorage } = require('../utils/storage');
const { appendDataToSheet } = require('../utils/googleSheetsUtils');
const { getUserGoogleSheetId } = require('../database/tokenService');
const { updateTokenBalance, appendEarnedTokens } = require('../database/tokenService');
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
  console.log(`Attempting to retrieve submission with ID: ${submissionId}`);

  const submission = await retrieveSubmissionFromStorage(submissionId);

  if (!submission) {
      console.error(`Submission not found for ID: ${submissionId}`);
      return replyToAdmin(interaction, `⚠️ Submission with ID \`${submissionId}\` not found.`);
  }

  const userId = submission.userId;
  const spreadsheetId = await getUserGoogleSheetId(userId);

  if (!spreadsheetId) {
      return replyToAdmin(interaction, `⚠️ No Google Sheets linked for user \`${userId}\`.`);
  }

  const category = submission.category || 'art'; // Determine if submission is 'art' or 'writing'
  const tokenAmount = submission.finalTokenAmount;
  const fileName = submission.fileName || submission.title || submissionId; // Use title for writing
  const messageUrl = submission.messageUrl;

  try {
      // Update token balance
      await updateTokenBalance(userId, tokenAmount);

      // Append token data to Google Sheets
      await appendEarnedTokens(userId, fileName, category, tokenAmount, submission.link || messageUrl);

      // React with ☑️ and notify the user
      await reactToMessage(interaction, messageUrl, '☑️');
      await notifyUser(interaction, userId, `☑️ Your submission \`${submissionId}\` has been approved! ${tokenAmount} tokens have been added to your balance.`);

      // Reply to the admin
      await replyToAdmin(interaction, `☑️ Submission \`${submissionId}\` has been approved and ${tokenAmount} tokens have been added to the user's balance.`);

      // Delete the submission from storage
      await deleteSubmissionFromStorage(submissionId);
  } catch (error) {
      console.error(`Error updating tokens or Google Sheets: ${error.message}`);
      return replyToAdmin(interaction, '⚠️ Error updating tokens or Google Sheets. Please try again later.');
  }
}


// ------------------- Deny Submission -------------------
// Handles denying a submission and notifying the user
async function denySubmission(interaction, submissionId) {
  const submission = await retrieveSubmissionFromStorage(submissionId);

  if (!submission) {
    return replyToAdmin(interaction, `⚠️ Submission with ID \`${submissionId}\` not found.`);
  }

  const messageUrl = submission.messageUrl;
  if (!messageUrl || typeof messageUrl !== 'string') {
    console.error('Invalid message URL:', messageUrl);
    throw new Error('Message URL is invalid or undefined.');
  }

  // React to the message and notify the user
  await reactToMessage(interaction, messageUrl, '❌');
  await notifyUser(interaction, submission.userId, `❌ Your submission \`${submissionId}\` has been denied!`);

  // Reply to the admin
  await replyToAdmin(interaction, `❌ Submission \`${submissionId}\` has been denied.`);

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
      await denySubmission(interaction, submissionId); // Assuming regular denial for non-blight
    }
  },
};
