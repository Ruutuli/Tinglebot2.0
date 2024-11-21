// ------------------- Submit Command Handler -------------------
// Handles the `/submit` command for submitting art and claiming tokens

// ------------------- Imports -------------------
// Group similar imports together for clarity
const path = require('path');
const {
  SlashCommandBuilder,
  ActionRowBuilder,
} = require('discord.js');

// Handlers
const { handleSubmitAction } = require('../handlers/submissionHandler');
const { handleSelectMenuInteraction } = require('../handlers/selectMenuHandler');
const { handleModalSubmission } = require('../handlers/modalHandler');
const { getCancelButtonRow } = require('../handlers/componentHandler');


// Utilities
const { resetSubmissionState } = require('../utils/tokenUtils');
const { getBaseSelectMenu } = require('../utils/menuUtils');
const { submissionStore } = require('../utils/storage'); // Ensure submissionStore is properly imported

// ------------------- Command Registration (/submit art) -------------------
// This section defines the `/submit` command, allowing users to submit art and claim tokens.
module.exports = {
  data: new SlashCommandBuilder()
    .setName('submit')
    .setDescription('Submit art and claim tokens.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('art')
        .setDescription('Submit art and claim tokens.')
        .addAttachmentOption(option =>
          option.setName('file')
            .setDescription('Attach the file of the art')
            .setRequired(true))), // Attachment is required for submission

  // ------------------- Main Command Execution -------------------
  async execute(interaction) {
    // Logging command execution
    console.log('Executing /submit art command');

    const user = interaction.user; // Get the user who issued the command
    const attachedFile = interaction.options.getAttachment('file');  // Get the attached file from the command

    // Error handling if no file is attached
    if (!attachedFile) {
      throw new Error('No file attached in the submission.');
    }

    const fileName = path.basename(attachedFile.name); // Extract the file name from the attachment
    const submittedImageUrl = attachedFile.url; // Get the URL of the submitted image

    // Log file details for debugging
    console.log(`Storing file data for user ${user.id}: fileUrl = ${submittedImageUrl}, fileName = ${fileName}`);

    // ------------------- Store Submission Data -------------------
    // Store the submitted file information in the submissionStore
    submissionStore.set(user.id, {
      fileUrl: submittedImageUrl,  // Store the file URL
      fileName: fileName,          // Store the file name
      baseSelections: [],          // Initialize other fields
      typeMultiplierSelections: [],
      productMultiplierValue: 1,
      addOnsApplied: [],
      addOnCount: {},
      characterCount: 1,
      finalTokenAmount: 0
    });

    console.log(`User ${user.username} submitted file: ${fileName}`);

    // Reset the submission state to a fresh state
    resetSubmissionState();

    // ------------------- Prepare for Next Interaction -------------------
    // Create an action row with a cancel button using getCancelButtonRow
    const row = getCancelButtonRow();

    try {
      // Defer reply to show that the bot is working on the next step
      await interaction.deferReply({ ephemeral: true });
      console.log('Interaction deferred successfully for base selection');

      // Reply with the base selection dropdown and cancel button
      await interaction.editReply({
        content: `🎨 **Please select a base**. Click "Next Section ➡️" when done.`,
        components: [getBaseSelectMenu(false), row], // Show base selection menu and cancel button
      });
      console.log('Displayed base selection dropdown');
    } catch (error) {
      // Log the error and notify the user of any issues
      console.error('Error displaying base selection:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.followUp({ content: '⚠️ **Error starting submission.** Please try again.', ephemeral: true });
      }
    }
  },

  // ------------------- Interaction Handling -------------------
  // Handles the interactions with buttons, select menus, and modals during the submission process
  async interactionCreate(interaction) {
    console.log('Interaction triggered');

    try {
      // Handle button interactions (e.g., Cancel, Next)
      if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      }

      // Handle selection menu interactions (e.g., base or type selections)
      if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
      }

      // Handle modal submissions (e.g., final token amount)
      if (interaction.isModalSubmit()) {
        await handleModalSubmission(interaction);
      }

    } catch (error) {
      // Log any errors and notify the user
      console.error('Error handling interaction:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.followUp({ content: '⚠️ **Error handling your request.** Please try again.', ephemeral: true });
      }
    }
  },
};
