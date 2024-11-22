// ------------------- Submit Command Handler -------------------
// Handles the `/submit` command for submitting art and claiming tokens

// ------------------- Imports -------------------
// Standard Library Imports
const path = require('path');

// Discord.js Imports
const { SlashCommandBuilder, ActionRowBuilder } = require('discord.js');

// Handler Imports
const { handleSelectMenuInteraction, finalizeSubmission } = require('../handlers/selectMenuHandler');
const { handleModalSubmission } = require('../handlers/modalHandler');
const { getCancelButtonRow } = require('../handlers/componentHandler');

// Utility Imports
const { resetSubmissionState, calculateTokens } = require('../utils/tokenUtils');
const { getBaseSelectMenu } = require('../utils/menuUtils');
const { submissionStore, saveSubmissionToStorage } = require('../utils/storage');
const { uploadSubmissionImage } = require('../utils/uploadUtils');
const User = require('../models/UserModel'); // User model for database queries


// ------------------- Command Registration -------------------
// Defines the `/submit` command, allowing users to submit art and claim tokens.
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
    // ------------------- Defer Reply -------------------
    try {
      await interaction.deferReply({ ephemeral: true });
    } catch (error) {
      console.error('Error deferring reply:', error);
      return;
    }

    // ------------------- Extract User and File Information -------------------
    const user = interaction.user; // User who triggered the command
    const attachedFile = interaction.options.getAttachment('file');
    if (!attachedFile) {
      await interaction.editReply({
        content: '❌ **No file attached. Please try again.**',
      });
      return;
    }

    // ------------------- Fetch User Data -------------------
    let userData;
    try {
      userData = await User.findOne({ discordId: user.id });
      if (!userData) {
        console.error(`User data not found for Discord ID: ${user.id}`);
        await interaction.editReply({
          content: '❌ **User data not found. Please try again later.**',
          ephemeral: true,
        });
        return;
      }
    } catch (error) {
      console.error(`Error fetching user data for Discord ID: ${user.id}`, error);
      await interaction.editReply({
        content: '❌ **An error occurred while fetching user data. Please try again later.**',
        ephemeral: true,
      });
      return;
    }

    // Extract file details
    const fileName = path.basename(attachedFile.name);
    const discordImageUrl = attachedFile.url;

    // ------------------- Upload Image to Google Cloud Storage -------------------
    let googleImageUrl;
    try {
      googleImageUrl = await uploadSubmissionImage(discordImageUrl, fileName);
    } catch (error) {
      console.error('Error uploading image to Google Cloud:', error);
      await interaction.editReply({
        content: '❌ **Error uploading image. Please try again later.**',
        ephemeral: true,
      });
      return;
    }

    // ------------------- Token Calculation -------------------
    const tokenBreakdown = calculateTokens({
      baseSelections: [],
      typeMultiplierSelections: [],
      productMultiplierValue: 1,
      addOnsApplied: [],
      characterCount: 1,
    });

    // ------------------- Store Submission Details -------------------
    const submissionId = `${user.id}-${Date.now()}`; // Generate a unique submission ID

    submissionStore.set(submissionId, {
      submissionId, // Unique ID
      fileUrl: googleImageUrl, // Uploaded file URL from Google Cloud
      fileName, // File name from the user's attachment
      baseSelections: [],
      typeMultiplierSelections: [],
      productMultiplierValue: 1,
      addOnsApplied: [],
      addOnCount: {},
      characterCount: 1,
      finalTokenAmount: tokenBreakdown.totalTokens, // Total tokens
      tokenBreakdown: tokenBreakdown.breakdown,    // Token breakdown string
      userId: user.id, // User's Discord ID
      username: user.username, // User's username
    });

    // Save to persistent storage
    saveSubmissionToStorage(submissionId, submissionStore.get(submissionId));
    resetSubmissionState(); // Reset the submission state

    // ------------------- Create and Send Dropdowns -------------------
    try {
      const dropdownMenu = getBaseSelectMenu(false); // Generate the dropdown menu for base selections
      const cancelButtonRow = getCancelButtonRow(); // Generate a cancel button for user options

      await interaction.editReply({
        content: `🎨 **Submission Received!**\nPlease select a base to proceed with your art submission.`,
        components: [dropdownMenu, cancelButtonRow],
        ephemeral: true,
      });
    } catch (error) {
      console.error('Error displaying dropdown menus:', error);
      await interaction.editReply({
        content: '⚠️ **Error displaying dropdown menus. Please try again later.**',
        ephemeral: true,
      });
    }
  },

  // ------------------- Interaction Handling -------------------
  // Handles interactions during the submission process (dropdowns, buttons, modals).
  async interactionCreate(interaction) {
    try {
      if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmission(interaction);
      }
    } catch (error) {
      console.error('Error handling interaction:', error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.followUp({
          content: '⚠️ **Error handling your request. Please try again.**',
          ephemeral: true,
        });
      }
    }
  },
};
