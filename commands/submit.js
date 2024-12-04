// ------------------- Submit Command Handler -------------------
// Handles the `/submit` command for submitting art or writing and claiming tokens

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
const { resetSubmissionState, calculateTokens, calculateWritingTokens } = require('../utils/tokenUtils');
const { getBaseSelectMenu } = require('../utils/menuUtils');
const { submissionStore, saveSubmissionToStorage } = require('../utils/storage');
const { uploadSubmissionImage } = require('../utils/uploadUtils');
const { createArtSubmissionEmbed, createWritingSubmissionEmbed } = require('../embeds/mechanicEmbeds');
const User = require('../models/UserModel'); // User model for database queries

// ------------------- Command Registration -------------------
// Defines the `/submit` command, allowing users to submit art or writing and claim tokens
module.exports = {
  data: new SlashCommandBuilder()
    .setName('submit')
    .setDescription('Submit art or writing to claim tokens.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('art')
        .setDescription('Submit art and claim tokens.')
        .addAttachmentOption(option =>
          option.setName('file')
            .setDescription('Attach the file of the art.')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('title')
            .setDescription('Provide a title for your art submission (defaults to file name if not provided).')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('questid')
            .setDescription('Provide a quest ID if this submission is for a quest.')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('writing')
        .setDescription('Submit writing and claim tokens.')
        .addStringOption(option =>
          option.setName('link')
            .setDescription('Provide a link to your submission.')
            .setRequired(true))
        .addIntegerOption(option =>
          option.setName('word_count')
            .setDescription('Enter the total word count of your submission.')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('title')
            .setDescription('Provide a title for your writing submission.')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('description')
            .setDescription('Provide a brief description of your submission.')
            .setRequired(false))
        .addStringOption(option =>
          option.setName('questid')
            .setDescription('Provide a quest ID if this submission is for a quest.')
            .setRequired(false))),

  // ------------------- Main Command Execution -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(); // Determine which subcommand was invoked

    // ------------------- Handle Art Submission -------------------
    if (subcommand === 'art') {
      try {
        await interaction.deferReply({ ephemeral: true });

        const user = interaction.user;
        const attachedFile = interaction.options.getAttachment('file');
        const title = interaction.options.getString('title') || attachedFile.name; // Default to file name if no title is provided
        const questId = interaction.options.getString('questid') || 'N/A';

        // Check if a file is attached
        if (!attachedFile) {
          await interaction.editReply({ content: '❌ **No file attached. Please try again.**' });
          return;
        }

        // Fetch user data from the database
        const userData = await User.findOne({ discordId: user.id });
        if (!userData) {
          await interaction.editReply({ content: '❌ **User data not found. Please try again later.**' });
          return;
        }

        const fileName = path.basename(attachedFile.name);
        const discordImageUrl = attachedFile.url;

        // Upload the image to Google Drive or cloud storage
        const googleImageUrl = await uploadSubmissionImage(discordImageUrl, fileName);

        // Calculate tokens for the art submission
        const tokenBreakdown = calculateTokens({
          baseSelections: [],
          typeMultiplierSelections: [],
          productMultiplierValue: 1,
          addOnsApplied: [],
          characterCount: 1,
        });

// Generate a unique submission ID
const submissionId = `${user.id}-${Date.now()}`;

// Debug log for submission ID
console.log('Generated Submission ID:', submissionId);

// Store in submissionStore
submissionStore.set(submissionId, {
    submissionId, // Include the submission ID
    fileUrl: googleImageUrl, // Ensure fileUrl is included
    fileName,
    title,
    userId: user.id,
    username: user.username,
    userAvatar: user.displayAvatarURL({ dynamic: true }), // Ensure this is correct
    category: 'art',
    questEvent: questId,
    questBonus: 'N/A',
    baseSelections: [],
    typeMultiplierSelections: [],
    productMultiplierValue: 'default',
    addOnsApplied: [],
    characterCount: 1,
    typeMultiplierCount: 1,
    finalTokenAmount: 0,
    tokenCalculation: 'N/A',
});

// Save to persistent storage
saveSubmissionToStorage(submissionId, submissionStore.get(submissionId));

        // Generate the dropdown menu and cancel button for user options
        const dropdownMenu = getBaseSelectMenu(false);
        const cancelButtonRow = getCancelButtonRow();

        await interaction.editReply({
          content: '🎨 **Submission Received!**\nPlease select a base to proceed with your art submission.',
          components: [dropdownMenu, cancelButtonRow],
          ephemeral: true,
        });

        // Save the submission to persistent storage
        saveSubmissionToStorage(submissionId, submissionStore.get(submissionId));
        resetSubmissionState();

      } catch (error) {
        console.error('Error handling art submission:', error);
        await interaction.editReply({ content: '❌ **Error processing your submission. Please try again later.**' });
      }
    }

    // ------------------- Handle Writing Submission -------------------
    if (subcommand === 'writing') {
      try {
        await interaction.deferReply({ ephemeral: false });

        const user = interaction.user;
        const title = interaction.options.getString('title') || 'Untitled';
        const link = interaction.options.getString('link');
        const wordCount = interaction.options.getInteger('word_count');
        const description = interaction.options.getString('description') || 'No description provided.';
        const questId = interaction.options.getString('questid') || 'N/A';

        // Fetch user data from the database
        const userData = await User.findOne({ discordId: user.id });
        if (!userData) {
          await interaction.editReply({ content: '❌ **User data not found. Please try again later.**' });
          return;
        }

        // Calculate tokens for the writing submission
        const finalTokenAmount = calculateWritingTokens(wordCount);

        // Create a unique submission ID
        const submissionId = `${user.id}-${Date.now()}`;
        submissionStore.set(submissionId, {
          submissionId,
          userId: user.id,
          username: user.username,
          userAvatar: user.displayAvatarURL({ dynamic: true }),
          category: 'writing',
          title,
          wordCount,
          finalTokenAmount,
          link,
          description,
          questEvent: questId,
          tokenTracker: userData.tokenTracker || null,
        });

        // Generate an embed for the writing submission
        const embed = createWritingSubmissionEmbed(submissionStore.get(submissionId));

        await interaction.editReply({
          embeds: [embed],
          ephemeral: false,
        });

        // Save the submission to persistent storage
        saveSubmissionToStorage(submissionId, submissionStore.get(submissionId));

      } catch (error) {
        console.error('Error handling writing submission:', error);
        await interaction.editReply({ content: '❌ **Error processing your submission. Please try again later.**' });
      }
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
