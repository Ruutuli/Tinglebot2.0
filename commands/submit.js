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
            .setDescription('Attach the file of the art')
            .setRequired(true))) // Attachment is required for art submission
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
          option.setName('description')
            .setDescription('Provide a brief description of your submission (optional).'))),

  // ------------------- Main Command Execution -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(); // Determine which subcommand was invoked

    // ------------------- Handle Art Submission -------------------
    if (subcommand === 'art') {
      try {
        await interaction.deferReply({ ephemeral: true });

        const user = interaction.user;
        const attachedFile = interaction.options.getAttachment('file');

        if (!attachedFile) {
          await interaction.editReply({ content: '❌ **No file attached. Please try again.**' });
          return;
        }

        const userData = await User.findOne({ discordId: user.id });
        if (!userData) {
          await interaction.editReply({ content: '❌ **User data not found. Please try again later.**' });
          return;
        }

        const fileName = path.basename(attachedFile.name);
        const discordImageUrl = attachedFile.url;

        const googleImageUrl = await uploadSubmissionImage(discordImageUrl, fileName);

        const tokenBreakdown = calculateTokens({
          baseSelections: [],
          typeMultiplierSelections: [],
          productMultiplierValue: 1,
          addOnsApplied: [],
          characterCount: 1,
        });

        const submissionId = `${user.id}-${Date.now()}`;
        submissionStore.set(submissionId, {
          submissionId,
          fileUrl: googleImageUrl,
          fileName,
          finalTokenAmount: tokenBreakdown.totalTokens,
          tokenBreakdown: tokenBreakdown.breakdown,
          userId: user.id,
          username: user.username,
        });

        const embed = createArtSubmissionEmbed(submissionStore.get(submissionId), userData, tokenBreakdown);

        await interaction.editReply({
          content: '🎨 **Submission Received!**',
          embeds: [embed],
          ephemeral: true,
        });

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
        const link = interaction.options.getString('link');
        const wordCount = interaction.options.getInteger('word_count');
        const description = interaction.options.getString('description') || 'No description provided.';

        const userData = await User.findOne({ discordId: user.id });
        if (!userData) {
          await interaction.editReply({ content: '❌ **User data not found. Please try again later.**' });
          return;
        }

        const finalTokenAmount = calculateWritingTokens(wordCount);

        const submissionId = `${user.id}-${Date.now()}`;
        submissionStore.set(submissionId, {
          submissionId,
          userId: user.id,
          username: user.username,
          wordCount,
          finalTokenAmount,
          link,
          description,
        });

        const embed = createWritingSubmissionEmbed(submissionStore.get(submissionId));

        await interaction.editReply({
          content: '📚 **Your writing submission has been received!**',
          embeds: [embed],
          ephemeral: false,
        });

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
