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
  // Extract the channel ID and message ID from the URL
  const messageParts = messageUrl.split('/');
  const channelId = messageParts[5];
  const messageId = messageParts[6];

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
  const submission = await retrieveSubmissionFromStorage(submissionId);

  if (!submission) {
    return replyToAdmin(interaction, `⚠️ Submission with ID \`${submissionId}\` not found.`);
  }

  const userId = submission.userId;
  const spreadsheetId = await getUserGoogleSheetId(userId);

  if (!spreadsheetId) {
    return replyToAdmin(interaction, `⚠️ No Google Sheets linked for user \`${userId}\`.`);
  }

  const fileName = submission.fileName || submissionId;
  const messageUrl = submission.messageUrl;
  const tokenAmount = submission.finalTokenAmount;

  try {
    // 1. Update tokens in the database
    await updateTokenBalance(userId, tokenAmount);
    console.log(`Updated token balance for user ${userId} by ${tokenAmount} tokens.`);

    // 2. Append token data to Google Sheets
    await appendEarnedTokens(userId, fileName, 'art', tokenAmount, messageUrl);

    // 3. React with ☑️ to the submission message and notify the user
    await reactToMessage(interaction, messageUrl, '☑️');
    await notifyUser(interaction, userId, `☑️ Your submission \`${submissionId}\` has been approved! ${tokenAmount} tokens have been added to your balance.`);

    // 4. Reply to the admin
    await replyToAdmin(interaction, `☑️ Submission \`${submissionId}\` has been approved and ${tokenAmount} tokens have been added to the user's balance.`);

    // Optionally delete the submission from storage after approval
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
