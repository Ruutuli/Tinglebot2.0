// ------------------- Submit Command Handler -------------------
// Handles the `/submit` command for submitting art or writing and claiming tokens

// ------------------- Imports -------------------
// Standard Library Imports
const path = require('path');

const { handleError } = require('../utils/globalErrorHandler');
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
const User = require('../models/UserModel'); 
const { generateUniqueId } = require('../utils/uniqueIdUtils');

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
          option.setName('collab')
            .setDescription('Tag a collaborator to split tokens. Format: @username')
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
          option.setName('collab')
            .setDescription('Tag a collaborator to split tokens. Format: @username')
            .setRequired(false))         
        .addStringOption(option =>
          option.setName('questid')
            .setDescription('Provide a quest ID if this submission is for a quest.')
            .setRequired(false))),

// ------------------- Autocomplete Handling -------------------
async onAutocomplete(interaction) {
  const focusedOption = interaction.options.getFocused(true);

  if (focusedOption.name === 'collab') {
    const searchQuery = focusedOption.value.toLowerCase(); // User input
    const members = await interaction.guild.members.fetch(); // Fetch all server members
    const matchingMembers = members.filter(member =>
      member.user.username.toLowerCase().includes(searchQuery) || // Match username
      member.displayName.toLowerCase().includes(searchQuery)     // Match nickname
    );

    // Limit results to 25 (Discord API maximum for autocomplete)
    const results = matchingMembers.map(member => ({
      name: member.displayName || member.user.username,
      value: `<@${member.user.id}>`, // Tag format
    })).slice(0, 25);

    await interaction.respond(results); // Send autocomplete suggestions
  }
},


  // ------------------- Main Command Execution -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(); // Determine which subcommand was invoked

    // ------------------- Fetch User Data and Validate Token Sync -------------------
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

        // Calculate tokens for the art submission
        const tokenBreakdown = calculateTokens({
          baseSelections: [],
          typeMultiplierSelections: [],
          productMultiplierValue: 1,
          addOnsApplied: [],
          specialWorksApplied: [],
          characterCount: 1,
          collab: collab || null, // Pass the collab parameter
        });
        
        const submissionId = generateUniqueId('A');
        console.log('Generated Submission ID:', submissionId);
        
        const submissionData = {
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
          baseSelections: [],
          typeMultiplierSelections: [],
          productMultiplierValue: 'default',
          addOnsApplied: [],
          specialWorksApplied: [],
          characterCount: 1,
          typeMultiplierCount: 1,
          finalTokenAmount: 0,
          tokenCalculation: 'N/A',
          collab: collab || null, // Store collaborator
      };      
        
        console.log('Storing submission data:', submissionData);
        submissionStore.set(user.id, submissionData);
        saveSubmissionToStorage(submissionId, submissionData);
        
        

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
        const title = interaction.options.getString('title')?.trim() || attachedFile.name; // Use user-input title or default to file name
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
        const collab = interaction.options.getString('collab');
    
        // Fetch user data from the database
        const userData = await User.findOne({ discordId: user.id });
        if (!userData) {
          await interaction.editReply({ content: '❌ **User data not found. Please try again later.**' });
          return;
        }
    
        // Calculate tokens for the writing submission
        const finalTokenAmount = calculateWritingTokens(wordCount);
    
        // Create a unique submission ID
        const submissionId = generateUniqueId('W');
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
    
        const embed = createWritingSubmissionEmbed(submissionStore.get(submissionId));
    
        // Post the embed publicly in the channel
        const sentMessage = await interaction.channel.send({ embeds: [embed] });
        submissionStore.get(submissionId).messageUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${sentMessage.id}`;
    
        // Save to persistent storage
        saveSubmissionToStorage(submissionId, submissionStore.get(submissionId));
    
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
