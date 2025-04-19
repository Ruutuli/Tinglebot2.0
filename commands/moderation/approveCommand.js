// ------------------- Imports -------------------

// Discord.js Components (Third-Party Libraries)
const { SlashCommandBuilder } = require('discord.js');

const { handleError } = require('../../utils/globalErrorHandler');
// Database Services (Local modules for database interactions)
const { appendEarnedTokens, getOrCreateToken, updateTokenBalance } = require('../../database/tokenService');

// Utility Functions (Local modules for additional helper functionality)
const { deleteSubmissionFromStorage, retrieveSubmissionFromStorage } = require('../../utils/storage');


// ------------------- Helper Functions -------------------
// These functions assist with message reactions, user notifications, and admin replies.

async function reactToMessage(interaction, messageUrl, emoji) {
  // ------------------- React to Message -------------------
  // Validates the message URL, extracts channel and message IDs,
  // fetches the corresponding message, and reacts with the specified emoji.
  if (!messageUrl || typeof messageUrl !== 'string') {
    console.error(`[approveCommand.js]: Invalid message URL: ${messageUrl}`);
    throw new Error('Message URL is invalid or undefined.');
  }

  // Extract channel ID and message ID from the URL
  const messageParts = messageUrl.split('/');
  const channelId = messageParts[5];
  const messageId = messageParts[6];

  try {
    console.log(`[approveCommand.js]: Reacting to message in channel: ${channelId}, message ID: ${messageId}`);
    // Fetch the channel using the extracted channel ID
    const channel = await interaction.client.channels.fetch(channelId);
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Fetch the message using the extracted message ID
    const message = await channel.messages.fetch(messageId);
    if (!message) {
      throw new Error('Message not found');
    }

    // Add the specified emoji reaction to the message
    await message.react(emoji);
    console.log(`[approveCommand.js]: Reacted to message with ${emoji}`);
  } catch (error) {
    handleError(error, 'approveCommand.js');

    console.error(`[approveCommand.js]: Failed to react to the message: ${error.message}`);
    throw error;
  }
}

async function notifyUser(interaction, userId, messageContent) {
  // ------------------- Notify User -------------------
  // Fetches the user by ID and sends a direct message with the provided content.
  try {
    const user = await interaction.client.users.fetch(userId);
    await user.send(messageContent);
    console.log(`[approveCommand.js]: Notified user ${userId}`);
  } catch (error) {
    handleError(error, 'approveCommand.js');

    console.error(`[approveCommand.js]: Failed to notify user ${userId}: ${error.message}`);
  }
}

async function replyToAdmin(interaction, messageContent) {
  // ------------------- Reply to Admin -------------------
  // Sends a reply to the admin in an ephemeral manner if a reply hasn't been sent yet.
  try {
    if (!interaction.replied) {
      await interaction.reply({
        content: messageContent,
        ephemeral: true,
      });
      console.log(`[approveCommand.js]: Replied to admin with message: ${messageContent}`);
    }
  } catch (error) {
    handleError(error, 'approveCommand.js');

    console.error(`[approveCommand.js]: Failed to reply to admin: ${error.message}`);
  }
}


// ------------------- Submission Approval Functions -------------------
// These functions handle the approval and denial of submissions,
// including updating token balances, notifying users, and cleaning up storage.

async function approveSubmission(interaction, submissionId) {
  // ------------------- Approve Submission -------------------
  // Retrieves the submission from storage, updates tokens for the user (and collaborator if applicable),
  // reacts to the submission message, notifies involved parties, and removes the submission from storage.
  console.log(`[approveCommand.js]: Attempting to retrieve submission with ID: ${submissionId}`);

  // Defer reply to prevent interaction timeout
  await interaction.deferReply({ ephemeral: true });

  try {
    const submission = await retrieveSubmissionFromStorage(submissionId);
    if (!submission) {
      throw new Error(`Submission with ID \`${submissionId}\` not found.`);
    }

    // Destructure submission details with default values where applicable
    const { userId, collab, category = 'art', finalTokenAmount: tokenAmount, title = fileName, messageUrl } = submission;
    if (!messageUrl) {
      throw new Error('Message URL is invalid or undefined.');
    }

    // Retrieve user token data; if the user doesn't exist, an error is thrown
    const user = await getOrCreateToken(userId);
    if (!user) {
      throw new Error(`User with ID \`${userId}\` not found.`);
    }

    // React to the submission message with a checkmark emoji
    await reactToMessage(interaction, messageUrl, '☑️');

    if (collab) {
      // ------------------- Handle Collaborations -------------------
      // For submissions with a collaborator, split the tokens and update both users' balances.
      const splitTokens = Math.floor(tokenAmount / 2);
      const collaboratorId = collab.replace(/[<@>]/g, '');

      // Update tokens for the main user and append earned tokens log
      await updateTokenBalance(userId, splitTokens);
      await appendEarnedTokens(userId, title, category, tokenAmount, messageUrl);

      // Update tokens for the collaborator and append earned tokens log
      await updateTokenBalance(collaboratorId, splitTokens);
      await appendEarnedTokens(collaboratorId, title, category, splitTokens, messageUrl);

      // Notify both users with enhanced messages using markdown formatting and emojis
      await notifyUser(
        interaction,
        userId,
        `**✅ Your submission \`${submissionId}\` has been approved!**\nYou have received **${splitTokens}** tokens.`
      );
      await notifyUser(
        interaction,
        collaboratorId,
        `**✅ A submission you collaborated on (\`${submissionId}\`) has been approved!**\nYou have received **${splitTokens}** tokens.`
      );

      console.log(`[approveCommand.js]: Tokens split between user ${userId} and collaborator ${collaboratorId}.`);
    } else {
      // ------------------- Handle Single Submission -------------------
      // For submissions without collaboration, update the token balance for the main user.
      await updateTokenBalance(userId, tokenAmount);
      await appendEarnedTokens(userId, title, category, tokenAmount, messageUrl);

      // Notify the user with an enhanced message
      await notifyUser(
        interaction,
        userId,
        `**✅ Your submission \`${submissionId}\` has been approved!**\n**${tokenAmount}** tokens have been added to your balance.`
      );

      console.log(`[approveCommand.js]: Tokens updated for user ${userId}.`);
    }

    // Finalize the approval process: update the interaction reply and remove the submission from storage
    await interaction.editReply(`**✅ Submission \`${submissionId}\` has been approved.**`);
    await deleteSubmissionFromStorage(submissionId);
    console.log(`[approveCommand.js]: Submission ${submissionId} successfully approved.`);
  } catch (error) {
    handleError(error, 'approveCommand.js');

    console.error(`[approveCommand.js]: Error during approval process: ${error.message}`);
    await replyToAdmin(interaction, `**⚠️ An error occurred while processing the submission. Please try again later.**`);
  }
}

async function denySubmission(interaction, submissionId, reason) {
  // ------------------- Deny Submission -------------------
  // Retrieves the submission from storage, reacts to the submission message with a denial emoji,
  // notifies the user of the denial with a reason, and removes the submission from storage.
  try {
    const submission = await retrieveSubmissionFromStorage(submissionId);
    if (!submission) {
      await replyToAdmin(interaction, `**⚠️ Submission with ID \`${submissionId}\` not found.**`);
      return;
    }

    const messageUrl = submission.messageUrl;
    if (!messageUrl) {
      console.error(`[approveCommand.js]: Invalid message URL in submission: ${JSON.stringify(submission)}`);
      throw new Error('Message URL is invalid or undefined.');
    }

    // React to the submission message with a cross emoji
    await reactToMessage(interaction, messageUrl, '❌');

    // Notify the submitting user of the denial with enhanced markdown formatting and emoji
    await notifyUser(
      interaction,
      submission.userId,
      `**❌ Your submission \`${submissionId}\` has been denied.**\nPlease resubmit your submission for approval.\n**Reason:** ${reason || 'No reason provided.'}`
    );

    // Inform the admin of the denial
    await replyToAdmin(
      interaction,
      `**❌ Submission \`${submissionId}\` has been denied.**\nPlease resubmit your submission for approval.\n**Reason:** ${reason || 'No reason provided.'}`
    );

    // Remove the submission from storage
    await deleteSubmissionFromStorage(submissionId);
  } catch (error) {
    handleError(error, 'approveCommand.js');

    console.error(`[approveCommand.js]: Error during denial process: ${error.message}`);
    await replyToAdmin(interaction, `**⚠️ An error occurred while processing the denial. Please try again later.**`);
  }
}


// ------------------- Command Definition and Execution -------------------
// This section defines the slash command, its options, and the execution logic based on user input.

module.exports = {
  data: new SlashCommandBuilder()
    .setName('approve')
    .setDescription('Approve or deny a submission.')
    .addStringOption(option =>
      option
        .setName('submission_id')
        .setDescription('The ID of the submission to approve/deny.')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('action')
        .setDescription('Approve or deny the submission.')
        .setRequired(true)
        .addChoices(
          { name: 'Approve', value: 'approve' },
          { name: 'Deny', value: 'deny' }
        )
    )
    .addStringOption(option =>
      option
        .setName('reason')
        .setDescription('Provide a reason for denying the submission (optional).')
        .setRequired(false)
    ),

  async execute(interaction) {
    // ------------------- Execute Command -------------------
    // Retrieves the command options and calls the appropriate function based on the specified action.
    const submissionId = interaction.options.getString('submission_id');
    const action = interaction.options.getString('action');

    if (action === 'approve') {
      await approveSubmission(interaction, submissionId);
    } else if (action === 'deny') {
      const reason = interaction.options.getString('reason') || null;
      await denySubmission(interaction, submissionId, reason);
    }
  },
};
