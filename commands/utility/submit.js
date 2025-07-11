// ------------------- Submit Command Handler -------------------
// Handles the `/submit` command for submitting art or writing and claiming tokens

// ------------------- Imports -------------------
// Standard Library Imports
const path = require('path');

const { handleError } = require('../../utils/globalErrorHandler.js');
// Discord.js Imports
const { SlashCommandBuilder } = require('discord.js');

// Handler Imports
const { handleSelectMenuInteraction } = require('../../handlers/selectMenuHandler.js');
const { handleModalSubmission } = require('../../handlers/modalHandler.js');
const { getCancelButtonRow, handleButtonInteraction } = require('../../handlers/componentHandler.js');

// Utility Imports
const { resetSubmissionState, calculateWritingTokens } = require('../../utils/tokenUtils.js');
const { getBaseSelectMenu } = require('../../utils/menuUtils.js');
const { 
  saveSubmissionToStorage, 
  retrieveSubmissionFromStorage, 
  getOrCreateSubmission,
  updateSubmissionData 
} = require('../../utils/storage.js');
const { uploadSubmissionImage } = require('../../utils/uploadUtils.js');
const { createWritingSubmissionEmbed } = require('../../embeds/embeds.js');
const User = require('../../models/UserModel.js'); 
const { generateUniqueId } = require('../../utils/uniqueIdUtils.js');

// ============================================================================
// ------------------- Command Definition -------------------
// ============================================================================

module.exports = {
  data: new SlashCommandBuilder()
    .setName('submit')
    .setDescription('Submit art or writing for tokens')
    .addSubcommand(subcommand =>
      subcommand
        .setName('art')
        .setDescription('Submit art for tokens')
        .addAttachmentOption(option =>
          option
            .setName('file')
            .setDescription('The art file to submit')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Title for your submission')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('questid')
            .setDescription('Quest ID if this is for a quest')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('collab')
            .setDescription('Collaborator username if this is a collaboration')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('writing')
        .setDescription('Submit writing for tokens')
        .addStringOption(option =>
          option
            .setName('title')
            .setDescription('Title for your writing submission')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('link')
            .setDescription('Link to your writing (Google Docs, etc.)')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('word_count')
            .setDescription('Word count of your writing')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('description')
            .setDescription('Brief description of your writing')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('questid')
            .setDescription('Quest ID if this is for a quest')
            .setRequired(false)
        )
    ),

  // ------------------- Command Execution -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Check if user has synced tokens
    const user = interaction.user;
    const userData = await User.findOne({ discordId: user.id });

    if (!userData) {
      await interaction.reply({
        content: '❌ **User data not found. Please try again later.**',
        ephemeral: true,
      });
      return;
    }

    if (!userData.tokensSynced) {
      await interaction.reply({
        content: '❌ **You cannot use this command until your tokens are synced. Please sync your token tracker first.**',
        ephemeral: true,
      });
      return;
    }

    // ------------------- Handle Art Submission -------------------
    if (subcommand === 'art') {
      try {
        await interaction.deferReply({ ephemeral: true });

        const user = interaction.user;
        const attachedFile = interaction.options.getAttachment('file');
        const title = interaction.options.getString('title')?.trim() || attachedFile.name; // Use user-input title or default to file name
        const questId = interaction.options.getString('questid') || 'N/A';
        const collab = interaction.options.getString('collab');

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

        // Create submission data using the new helper
        const submissionId = generateUniqueId('A');
        console.log('Generated Submission ID:', submissionId);
        
        const initialData = {
          submissionId,
          fileUrl: googleImageUrl,
          fileName,
          title,
          userId: user.id,
          username: user.username,
          userAvatar: user.displayAvatarURL({ dynamic: true }),
          category: 'art',
          questEvent: questId,
          questBonus: 'N/A',
          collab: collab || null,
        };

        // Save to database using the helper
        await saveSubmissionToStorage(submissionId, initialData);
        console.log(`[submit.js]: 💾 Saved initial art submission: ${submissionId}`);

        // Generate the dropdown menu and cancel button for user options
        const dropdownMenu = getBaseSelectMenu(false);
        const cancelButtonRow = getCancelButtonRow();

        await interaction.editReply({
          content: '🎨 **Submission Received!**\nPlease select a base to proceed with your art submission.',
          components: [dropdownMenu, cancelButtonRow],
          ephemeral: true,
        });

        // Reset submission state
        resetSubmissionState();

      } catch (error) {
        handleError(error, 'submit.js');
        console.error('Error handling art submission:', error);
        await interaction.editReply({ content: '❌ **Error processing your submission. Please try again later.**' });
      }
    }

    // ------------------- Handle Writing Submission -------------------
    if (subcommand === 'writing') {
      try {
        await interaction.deferReply({ ephemeral: true }); // Ensure the entire flow starts as ephemeral
    
        const user = interaction.user;
        const title = interaction.options.getString('title')?.trim();
        const link = interaction.options.getString('link');
        const wordCount = interaction.options.getInteger('word_count');
        if (wordCount < 0) {
          await interaction.editReply({
            content: '❌ **Word count cannot be negative. Please provide a valid word count.**',
            ephemeral: true,
          });
          return;
        }
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
    
        // Create a unique submission ID and save to database
        const submissionId = generateUniqueId('W');
        const submissionData = {
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
        };
    
        // Save to database
        await saveSubmissionToStorage(submissionId, submissionData);
        console.log(`[submit.js]: 💾 Saved writing submission: ${submissionId}`);
    
        const embed = createWritingSubmissionEmbed(submissionData);
    
        // Post the embed publicly in the channel
        const sentMessage = await interaction.channel.send({ embeds: [embed] });
        
        // Update with message URL
        await updateSubmissionData(submissionId, { 
          messageUrl: `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${sentMessage.id}` 
        });
    
        // Send an ephemeral confirmation message
        await interaction.editReply({
          content: '📚 **Your writing submission has been successfully posted.**',
          ephemeral: true, // Ensure this is ephemeral
        });
      } catch (error) {
        handleError(error, 'submit.js');
        console.error('Error handling writing submission:', error);
        await interaction.editReply({
          content: '❌ **Error processing your submission. Please try again later.**',
          ephemeral: true, // Ensure error messages are ephemeral
        });
      }
    }
    
  },

  // ------------------- Autocomplete Handler -------------------
  // Handles autocomplete for the submit command options
  async onAutocomplete(interaction) {
    try {
      const { handleAutocomplete } = require('../../handlers/autocompleteHandler.js');
      await handleAutocomplete(interaction);
    } catch (error) {
      handleError(error, 'submit.js');
      console.error('Error handling autocomplete:', error);
      await interaction.respond([]);
    }
  },

  // ------------------- Interaction Handling -------------------
  // Handles interactions during the submission process (dropdowns, buttons, modals).
  async interactionCreate(interaction) {
    try {
      if (interaction.isAutocomplete()) {
        await this.onAutocomplete(interaction); // Handle autocomplete
      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isStringSelectMenu()) {
        await handleSelectMenuInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await handleModalSubmission(interaction);
      }
    } catch (error) {
      handleError(error, 'submit.js');
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
