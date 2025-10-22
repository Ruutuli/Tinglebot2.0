// ------------------- Submit Command Handler -------------------
// Handles the `/submit` command for submitting art or writing and claiming tokens

// ------------------- Imports -------------------
// Standard Library Imports
const path = require('path');

const { handleInteractionError } = require('../../utils/globalErrorHandler.js');
// Discord.js Imports
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

// Handler Imports
const { handleSelectMenuInteraction } = require('../../handlers/selectMenuHandler.js');
const { handleModalSubmission } = require('../../handlers/modalHandler.js');
const { getCancelButtonRow, handleButtonInteraction } = require('../../handlers/componentHandler.js');

// Utility Imports
const { resetSubmissionState, calculateWritingTokens, calculateWritingTokensWithCollab } = require('../../utils/tokenUtils.js');
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
            .setName('charactername')
            .setDescription('Character submitting (for Teacher boost: Critique & Composition)')
            .setRequired(false)
            .setAutocomplete(true)
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
        .addStringOption(option =>
          option
            .setName('blightid')
            .setDescription('Blight healing request ID (optional)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('tagged_characters')
            .setDescription('Characters to tag in this submission (comma-separated character names)')
            .setRequired(false)
            .setAutocomplete(true)
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
            .setName('charactername')
            .setDescription('Character submitting (for Scholar boost: Research Stipend)')
            .setRequired(false)
            .setAutocomplete(true)
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
            .setDescription('Collaborators (mention multiple users separated by spaces)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('blightid')
            .setDescription('Blight healing request ID (optional)')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('tagged_characters')
            .setDescription('Characters to tag in this submission (comma-separated character names)')
            .setRequired(false)
            .setAutocomplete(true)
        )
    ),

  // ------------------- Command Execution -------------------
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Check if user has synced tokens and token tracker set up
    const user = interaction.user;
    const userData = await User.findOne({ discordId: user.id });

    if (!userData) {
      await interaction.reply({
        content: '❌ **User data not found. Please try again later.**',
        ephemeral: true,
      });
      return;
    }

    if (!userData.tokenTracker || userData.tokenTracker.trim() === '') {
      await interaction.reply({
        content: '❌ **You cannot use this command until your token tracker is set up. Please set up your token tracker first.**',
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
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const user = interaction.user;
        const attachedFile = interaction.options.getAttachment('file');
        const title = interaction.options.getString('title')?.trim() || attachedFile.name; // Use user-input title or default to file name
        const characterName = interaction.options.getString('charactername');
        const questId = interaction.options.getString('questid') || 'N/A';
        const collabInput = interaction.options.getString('collab');
        const blightId = interaction.options.getString('blightid') || null;
        const taggedCharactersInput = interaction.options.getString('tagged_characters');

        // Parse and validate collaborators
        let collab = [];
        if (collabInput) {
          // Extract all user mentions from the input
          const mentionRegex = /<@(\d+)>/g;
          const mentions = collabInput.match(mentionRegex);
          
          if (!mentions || mentions.length === 0) {
            await interaction.editReply({ 
              content: '❌ **Invalid collaboration format.** Please mention users with @username format (e.g., @User1 @User2).' 
            });
            return;
          }

          collab = mentions;

          // Prevent self-collaboration
          const collaboratorIds = mentions.map(m => m.match(/<@(\d+)>/)?.[1]);
          if (collaboratorIds.includes(user.id)) {
            await interaction.editReply({ 
              content: '❌ **You cannot collaborate with yourself.** Please remove your own mention from the collaborators.' 
            });
            return;
          }

          // Check for duplicate collaborators
          const uniqueIds = new Set(collaboratorIds);
          if (uniqueIds.size !== collaboratorIds.length) {
            await interaction.editReply({ 
              content: '❌ **Duplicate collaborators detected.** Please mention each collaborator only once.' 
            });
            return;
          }
        }

        // Parse and validate tagged characters
        let taggedCharacters = [];
        if (taggedCharactersInput) {
          // Split by comma and trim whitespace
          const characterNames = taggedCharactersInput.split(',').map(name => name.trim()).filter(name => name.length > 0);
          
          if (characterNames.length === 0) {
            await interaction.editReply({ 
              content: '❌ **Invalid tagged characters format.** Please provide character names separated by commas.' 
            });
            return;
          }

          // Validate that all characters exist in the database
          const { fetchAllCharacters } = require('../../database/db');
          const allCharacters = await fetchAllCharacters();
          const characterNamesSet = new Set(allCharacters.map(char => char.name.toLowerCase()));
          
          const invalidCharacters = characterNames.filter(name => !characterNamesSet.has(name.toLowerCase()));
          if (invalidCharacters.length > 0) {
            await interaction.editReply({ 
              content: `❌ **Invalid character names:** ${invalidCharacters.join(', ')}. Please check that all character names are correct.` 
            });
            return;
          }

          taggedCharacters = characterNames;
        }

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
        
        const initialData = {
          submissionId,
          fileUrl: googleImageUrl,
          fileName,
          title,
          userId: user.id,
          username: user.username,
          userAvatar: user.displayAvatarURL({ dynamic: true }),
          category: 'art',
          characterName: characterName || null,
          questEvent: questId,
          questBonus: 'N/A',
          collab: collab.length > 0 ? collab : [],
          blightId: blightId,
          taggedCharacters: taggedCharacters.length > 0 ? taggedCharacters : [],
          tokenTracker: userData.tokenTracker || null,
        };

        // Save to database using the helper
        await saveSubmissionToStorage(submissionId, initialData);

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
        handleInteractionError(error, 'submit.js');
        console.error('Error handling art submission:', error);
        await interaction.editReply({ content: '❌ **Error processing your submission. Please try again later.**' });
      }
    }

    // ------------------- Handle Writing Submission -------------------
    if (subcommand === 'writing') {
      try {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); // Ensure the entire flow starts as ephemeral
    
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
        const characterName = interaction.options.getString('charactername');
        const questId = interaction.options.getString('questid') || 'N/A';
        const collabInput = interaction.options.getString('collab');
        const blightId = interaction.options.getString('blightid') || null;
        const taggedCharactersInput = interaction.options.getString('tagged_characters');

        // Parse and validate collaborators
        let collab = [];
        if (collabInput) {
          // Extract all user mentions from the input
          const mentionRegex = /<@(\d+)>/g;
          const mentions = collabInput.match(mentionRegex);
          
          if (!mentions || mentions.length === 0) {
            await interaction.editReply({ 
              content: '❌ **Invalid collaboration format.** Please mention users with @username format (e.g., @User1 @User2).' 
            });
            return;
          }

          collab = mentions;

          // Prevent self-collaboration
          const collaboratorIds = mentions.map(m => m.match(/<@(\d+)>/)?.[1]);
          if (collaboratorIds.includes(user.id)) {
            await interaction.editReply({ 
              content: '❌ **You cannot collaborate with yourself.** Please remove your own mention from the collaborators.' 
            });
            return;
          }

          // Check for duplicate collaborators
          const uniqueIds = new Set(collaboratorIds);
          if (uniqueIds.size !== collaboratorIds.length) {
            await interaction.editReply({ 
              content: '❌ **Duplicate collaborators detected.** Please mention each collaborator only once.' 
            });
            return;
          }
        }

        // Parse and validate tagged characters
        let taggedCharacters = [];
        if (taggedCharactersInput) {
          // Split by comma and trim whitespace
          const characterNames = taggedCharactersInput.split(',').map(name => name.trim()).filter(name => name.length > 0);
          
          if (characterNames.length === 0) {
            await interaction.editReply({ 
              content: '❌ **Invalid tagged characters format.** Please provide character names separated by commas.' 
            });
            return;
          }

          // Validate that all characters exist in the database
          const { fetchAllCharacters } = require('../../database/db');
          const allCharacters = await fetchAllCharacters();
          const characterNamesSet = new Set(allCharacters.map(char => char.name.toLowerCase()));
          
          const invalidCharacters = characterNames.filter(name => !characterNamesSet.has(name.toLowerCase()));
          if (invalidCharacters.length > 0) {
            await interaction.editReply({ 
              content: `❌ **Invalid character names:** ${invalidCharacters.join(', ')}. Please check that all character names are correct.` 
            });
            return;
          }

          taggedCharacters = characterNames;
        }
    
        // Fetch user data from the database
        const userData = await User.findOne({ discordId: user.id });
        if (!userData) {
          await interaction.editReply({ content: '❌ **User data not found. Please try again later.**' });
          return;
        }
    
        // Get quest bonus if quest is linked
        let questBonus = 0;
        if (questId && questId !== 'N/A') {
          const { getQuestBonus } = require('../../utils/tokenUtils');
          questBonus = await getQuestBonus(questId);
          console.log(`[submit.js]: 🎯 Quest bonus for ${questId}: ${questBonus}`);
        }

        // Calculate tokens for the writing submission with collaboration splitting
        const tokenCalculation = calculateWritingTokensWithCollab(wordCount, collab, questBonus);
        let finalTokenAmount = tokenCalculation.totalTokens;
        
        // ============================================================================
        // ------------------- Apply Scholar Boost (Research Stipend +50%) -------------------
        // ============================================================================
        if (characterName) {
          const { fetchCharacterByNameAndUserId } = require('../../database/db');
          const character = await fetchCharacterByNameAndUserId(characterName, interaction.user.id);
          
          if (character && character.boostedBy) {
            const { fetchCharacterByName } = require('../../database/db');
            const boosterChar = await fetchCharacterByName(character.boostedBy);
            
            if (boosterChar && boosterChar.job === 'Scholar') {
              const originalTokens = finalTokenAmount;
              finalTokenAmount = Math.floor(finalTokenAmount * 1.5);
              console.log(`[submit.js]: 📚 Scholar boost - Research Stipend (+50% tokens: ${originalTokens} → ${finalTokenAmount})`);
            }
          }
        }
    
        // Create a unique submission ID and save to database
        const submissionId = generateUniqueId('W');
        const submissionData = {
          submissionId,
          userId: user.id,
          username: user.username,
          userAvatar: user.displayAvatarURL({ dynamic: true }),
          category: 'writing',
          characterName: characterName || null,
          title,
          wordCount,
          finalTokenAmount,
          tokenCalculation: tokenCalculation.breakdown,
          link,
          description,
          questEvent: questId,
          questBonus: questBonus,
          collab: collab.length > 0 ? collab : [],
          blightId: blightId,
          taggedCharacters: taggedCharacters.length > 0 ? taggedCharacters : [],
          tokenTracker: userData.tokenTracker || null,
        };
    
        // Save to database
        await saveSubmissionToStorage(submissionId, submissionData);
        console.log(`[submit.js]: 💾 Saved writing submission: ${submissionId}`);
    
        const embed = createWritingSubmissionEmbed(submissionData);
    
        // Post the embed publicly in the submissions channel
        const submissionsChannel = interaction.client.channels.cache.get('940446392789389362');
        const sentMessage = await submissionsChannel.send({ embeds: [embed] });
        
        // Update with message URL
        await updateSubmissionData(submissionId, { 
          messageUrl: `https://discord.com/channels/${interaction.guildId}/${submissionsChannel.id}/${sentMessage.id}` 
        });

        // Send notification to approval channel
        try {
          const approvalChannel = interaction.client.channels.cache.get('1381479893090566144');
          if (approvalChannel?.isTextBased()) {
            // Calculate token display based on collaboration and quest bonus
            let tokenDisplay = `${finalTokenAmount} tokens`;
            
            // Add quest bonus breakdown if present
            if (questBonus && questBonus > 0) {
              const baseTokens = finalTokenAmount - questBonus;
              tokenDisplay = `${baseTokens} + ${questBonus} quest bonus = ${finalTokenAmount} tokens`;
            }
            
            if (collab && collab.length > 0) {
              const totalParticipants = 1 + collab.length; // 1 submitter + collaborators
              const splitTokens = Math.floor(finalTokenAmount / totalParticipants);
              tokenDisplay += ` (${splitTokens} each)`;
            }

            // Build notification fields dynamically
            const notificationFields = [
              { name: '👤 Submitted by', value: `<@${interaction.user.id}>`, inline: true },
              { name: '📅 Submitted on', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
              { name: '📝 Title', value: title || 'Untitled', inline: true },
              { name: '💰 Token Amount', value: tokenDisplay, inline: true },
              { name: '🆔 Submission ID', value: `\`${submissionId}\``, inline: true },
              { name: '🔗 View Submission', value: `[Click Here](https://discord.com/channels/${interaction.guildId}/${submissionsChannel.id}/${sentMessage.id})`, inline: true }
            ];

            // Add collaboration field if present
            if (collab && collab.length > 0) {
              const collabDisplay = collab.join(', ');
              notificationFields.push({ name: '🤝 Collaboration', value: `Collaborating with ${collabDisplay}`, inline: true });
            }

            // Add quest/event fields if present
            if (questId && questId !== 'N/A') {
              notificationFields.push({ 
                name: '🎯 Quest/Event', 
                value: `\`${questId}\``, 
                inline: true 
              });
            }

            if (questBonus && questBonus > 0) {
              notificationFields.push({ 
                name: '🎁 Quest Bonus', 
                value: `+${questBonus} tokens`, 
                inline: true 
              });
            }

            // Add blight ID if provided
            if (blightId && blightId !== 'N/A') {
              notificationFields.push({ 
                name: '🩸 Blight Healing ID', 
                value: `\`${blightId}\``, 
                inline: true 
              });
            }

            // Add tagged characters if present
            if (taggedCharacters && taggedCharacters.length > 0) {
              const taggedDisplay = taggedCharacters.join(', ');
              notificationFields.push({ 
                name: '🏷️ Tagged Characters', 
                value: taggedDisplay, 
                inline: true 
              });
            }

            const notificationEmbed = new EmbedBuilder()
              .setColor('#FF6B35') // Orange for writing
              .setTitle('📝 PENDING WRITING SUBMISSION!')
              .setDescription('⏳ **Please approve within 24 hours!**')
              .addFields(notificationFields)
              .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
              .setFooter({ text: 'WRITING Submission Approval Required' })
              .setTimestamp();

            const notificationMessage = await approvalChannel.send({ embeds: [notificationEmbed] });
            console.log(`[submit.js]: ✅ Notification sent to approval channel for WRITING submission`);
            
            // Save the pending notification message ID to the submission data
            await updateSubmissionData(submissionId, {
              pendingNotificationMessageId: notificationMessage.id
            });
          }
        } catch (notificationError) {
          console.error(`[submit.js]: ❌ Failed to send notification to approval channel:`, notificationError);
          // Don't throw here, just log the error since the submission was already posted
        }
    
        // Send an ephemeral confirmation message
        await interaction.editReply({
          content: '📚 **Your writing submission has been successfully posted.**',
          ephemeral: true, // Ensure this is ephemeral
        });
      } catch (error) {
        handleInteractionError(error, 'submit.js');
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
      handleInteractionError(error, 'submit.js');
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
      handleInteractionError(error, 'submit.js');
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
