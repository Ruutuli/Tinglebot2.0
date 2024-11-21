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
const { submissionStore } = require('../utils/storage');
const { uploadSubmissionImage } = require('../utils/uploadUtils');


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
  // Get user and attached file information
  const user = interaction.user;
  const attachedFile = interaction.options.getAttachment('file');
  if (!attachedFile) throw new Error('No file attached in the submission.');

  // Extract file details
  const fileName = path.basename(attachedFile.name);
  const discordImageUrl = attachedFile.url;

  // ------------------- Upload Image to Google Cloud Storage -------------------
  let googleImageUrl;
  try {
      googleImageUrl = await uploadSubmissionImage(discordImageUrl, fileName);
  } catch (error) {
      console.error('Error uploading image to Google Cloud:', error);
      await interaction.reply({
          content: '❌ **Error uploading image. Please try again later.**',
          ephemeral: true,
      });
      return;
  }

  // ------------------- Token Calculation -------------------
  // Example token calculation logic
  const tokenBreakdown = calculateTokens({
      baseSelections: [],
      typeMultiplierSelections: [],
      productMultiplierValue: 1,
      addOnsApplied: [],
      characterCount: 1,
  });

  // ------------------- Store Submission Details -------------------
  submissionStore.set(user.id, {
      fileUrl: googleImageUrl, // Use the Google Cloud Storage URL
      fileName: fileName,
      baseSelections: [],
      typeMultiplierSelections: [],
      productMultiplierValue: 1,
      addOnsApplied: [],
      addOnCount: {},
      characterCount: 1,
      finalTokenAmount: tokenBreakdown.totalTokens, // Total tokens
      tokenBreakdown: tokenBreakdown.breakdown,    // Token breakdown string
      userId: user.id,
      username: user.username,
  });

  // Reset the submission state
  resetSubmissionState();

  // ------------------- Prepare Dropdown Interaction -------------------
  const row = getCancelButtonRow();
  try {
      await interaction.deferReply({ ephemeral: true });
      await interaction.editReply({
          content: `🎨 **Please select a base**. Click "Next Section ➡️" when done.`,
          components: [getBaseSelectMenu(false), row],
      });
  } catch (error) {
      console.error('Error displaying base selection:', error);
      if (!interaction.replied && !interaction.deferred) {
          await interaction.followUp({
              content: '⚠️ **Error starting submission.** Please try again.',
              ephemeral: true,
          });
      }
  }
},

  // ------------------- Interaction Handling -------------------
  // Handles interactions during the submission process
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
        await interaction.followUp({ content: '⚠️ **Error handling your request.** Please try again.', ephemeral: true });
      }
    }
  },
};
