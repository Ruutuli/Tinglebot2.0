// ------------------- submissionHandler.js -------------------
// This module handles finalizing the submission, uploading images, sending confirmation,
// updating token counts, and canceling the submission process.

// ============================================================================
// Discord.js Components
// ============================================================================

const { EmbedBuilder } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
const { createArtSubmissionEmbed } = require('../embeds/embeds.js');
// ============================================================================
// Database Services
// ============================================================================

const { appendEarnedTokens, updateTokenBalance } = require('../database/db');

// ============================================================================
// Utility Functions
// ============================================================================

const { resetSubmissionState, calculateTokens } = require('../utils/tokenUtils');
// Storage utilities
const { 
  saveSubmissionToStorage, 
  updateSubmissionData, 
  retrieveSubmissionFromStorage, 
  deleteSubmissionFromStorage,
  findLatestSubmissionIdForUser 
} = require('../utils/storage');


// ============================================================================
// Submission Completion Handler
// ============================================================================

// ------------------- Handle Submission Completion -------------------
// Finalizes the submission by retrieving submission data, recalculating tokens, 
// sending a confirmation message to the user, saving updated submission data, and resetting in-memory state.
async function handleSubmissionCompletion(interaction) {
  try {
    console.log(`[submissionHandler.js]: 🔄 Starting submission completion for user: ${interaction.user.id}`);
    // Get submission ID from the embed
    const messageEmbed = interaction.message.embeds[0];
    console.log(`[submissionHandler.js]: 📝 Embed fields:`, messageEmbed?.fields?.map(f => `${f.name}: ${f.value}`));
    
    const submissionId = messageEmbed?.fields?.find(field => field.name === 'Submission ID')?.value;
    console.log(`[submissionHandler.js]: 🔑 Found submission ID in embed: ${submissionId}`);
    
    if (!submissionId) {
      console.error(`[submissionHandler.js]: ❌ No submission ID found in embed`);
      await interaction.reply({
        content: '❌ **Submission ID not found. Please restart the submission process.**',
        ephemeral: true,
      });
      return;
    }

    // Retrieve submission data from storage using submissionId
    console.log(`[submissionHandler.js]: 🔍 Attempting to retrieve submission data for ID: ${submissionId}`);
    const submissionData = await retrieveSubmissionFromStorage(submissionId);
    console.log(`[submissionHandler.js]: 📊 Retrieved submission data:`, submissionData ? 'Found' : 'Not found');

    if (!submissionData) {
      console.error(`[submissionHandler.js]: ❌ No submission data found for ID: ${submissionId}`);
      // Try to find the latest submission for this user as a fallback
      const userId = interaction.user.id;
      console.log(`[submissionHandler.js]: 🔄 Attempting fallback lookup for user: ${userId}`);
      
      const latestSubmissionId = await findLatestSubmissionIdForUser(userId);
      console.log(`[submissionHandler.js]: 🔑 Found latest submission ID: ${latestSubmissionId}`);
      
      if (latestSubmissionId) {
        const latestSubmission = await retrieveSubmissionFromStorage(latestSubmissionId);
        console.log(`[submissionHandler.js]: 📊 Retrieved latest submission data:`, latestSubmission ? 'Found' : 'Not found');
        
        if (latestSubmission) {
          console.log(`[submissionHandler.js]: ✅ Found fallback submission ${latestSubmissionId}`);
          return await handleSubmissionCompletion(interaction, latestSubmission);
        }
      }
      
      console.error(`[submissionHandler.js]: ❌ No fallback submission found for user: ${userId}`);
      await interaction.reply({
        content: '❌ **Submission data not found. Please restart the submission process.**',
        ephemeral: true,
      });
      return;
    }

    console.log(`[submissionHandler.js]: 📝 Processing submission data for ID: ${submissionId}`);
    const { fileUrl, fileName, baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount } = submissionData;
    const user = interaction.user;

    if (!fileUrl || !fileName) {
      console.error(`[submissionHandler.js]: ❌ Missing required fields - fileUrl: ${!!fileUrl}, fileName: ${!!fileName}`);
      throw new Error('File URL or File Name missing.');
    }

    // Validate required selections
    if (!productMultiplierValue) {
      throw new Error('Product multiplier is required. Please select a product multiplier before submitting.');
    }
    
    // Calculate final token amount
    console.log(`[submissionHandler.js]: 🧮 Calculating tokens for submission:`, {
      baseSelections,
      baseCounts: Object.fromEntries(submissionData.baseCounts || new Map()),
      typeMultiplierSelections,
      productMultiplierValue,
      addOnsApplied
    });
    
    // Get quest bonus if quest is linked
    let questBonus = 0;
    if (submissionData.questEvent && submissionData.questEvent !== 'N/A') {
      const { getQuestBonus } = require('../utils/tokenUtils');
      questBonus = await getQuestBonus(submissionData.questEvent);
      console.log(`[submissionHandler.js]: 🎯 Quest bonus for ${submissionData.questEvent}: ${questBonus}`);
      
      // Update submission data with the actual quest bonus
      submissionData.questBonus = questBonus;
    }

    const { totalTokens, breakdown } = calculateTokens({
      baseSelections,
      baseCounts: submissionData.baseCounts || new Map(),
      typeMultiplierSelections,
      productMultiplierValue,
      addOnsApplied,
      typeMultiplierCounts: submissionData.typeMultiplierCounts || {},
      specialWorksApplied: submissionData.specialWorksApplied || [],
      collab: submissionData.collab,
      questBonus
    });
    console.log(`[submissionHandler.js]: 💰 Calculated tokens: ${totalTokens}`);
    console.log(`[submissionHandler.js]: 📊 Token breakdown:`, breakdown);

    // Update submission data with final calculations
    submissionData.finalTokenAmount = totalTokens;
    submissionData.tokenCalculation = breakdown;
    submissionData.updatedAt = new Date();

    // Save updated submission data using submissionId
    console.log(`[submissionHandler.js]: 💾 Saving final submission data for ID: ${submissionId}`);
    await saveSubmissionToStorage(submissionId, submissionData);
    console.log(`[submissionHandler.js]: ✅ Final submission data saved`);

    // Create and send the embed
    console.log(`[submissionHandler.js]: 🎨 Creating submission embed`);
    const embed = createArtSubmissionEmbed(submissionData);
    const sentMessage = await interaction.reply({ embeds: [embed] });
    console.log(`[submissionHandler.js]: ✅ Submission embed sent`);

    // Update submission data with message URL
    submissionData.messageUrl = `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${sentMessage.id}`;
    await saveSubmissionToStorage(submissionId, submissionData);

    // Link submission to quest if quest ID is provided
    if (submissionData.questEvent && submissionData.questEvent !== 'N/A') {
      try {
        const Quest = require('../models/QuestModel');
        const quest = await Quest.findOne({ questID: submissionData.questEvent });
        
        if (quest && (quest.questType === 'Art' || quest.questType === 'Writing') && quest.status === 'active') {
          const linkResult = await quest.linkSubmission(interaction.user.id, submissionData);
          
          if (linkResult.success) {
            console.log(`[submissionHandler.js] ✅ Submission linked to quest ${submissionData.questEvent}`);
          } else {
            console.log(`[submissionHandler.js] ℹ️ Could not link submission to quest: ${linkResult.reason || linkResult.error}`);
          }
        }
      } catch (questError) {
        console.error(`[submissionHandler.js] ❌ Error linking submission to quest:`, questError);
        // Don't fail the submission if quest linking fails
      }
    }

    // Send notification to approval channel
    try {
      const approvalChannel = interaction.client.channels.cache.get('1381479893090566144');
      if (approvalChannel?.isTextBased()) {
        // Determine submission type based on available data
        const isWriting = submissionData.category === 'writing' || (!submissionData.fileName && !submissionData.fileUrl);
        const submissionType = isWriting ? 'WRITING' : 'ART';
        const typeEmoji = isWriting ? '📝' : '🎨';
        const typeColor = isWriting ? '#FF6B35' : '#FF0000'; // Orange for writing, red for art
        
        // Calculate token display based on collaboration and quest bonus
        let tokenDisplay = `${totalTokens} tokens`;
        const hasCollaborators = submissionData.collab && ((Array.isArray(submissionData.collab) && submissionData.collab.length > 0) || (typeof submissionData.collab === 'string' && submissionData.collab !== 'N/A'));
        
        // Add quest bonus breakdown if present
        if (submissionData.questBonus && submissionData.questBonus !== 'N/A' && submissionData.questBonus > 0) {
          const baseTokens = totalTokens - submissionData.questBonus;
          tokenDisplay = `${baseTokens} + ${submissionData.questBonus} quest bonus = ${totalTokens} tokens`;
        }
        
        if (hasCollaborators) {
          const collaborators = Array.isArray(submissionData.collab) ? submissionData.collab : [submissionData.collab];
          const totalParticipants = 1 + collaborators.length;
          const splitTokens = Math.floor(totalTokens / totalParticipants);
          tokenDisplay += ` (${splitTokens} each)`;
        }

        // Build notification fields dynamically
        const notificationFields = [
          { name: '👤 Submitted by', value: `<@${interaction.user.id}>`, inline: true },
          { name: '📅 Submitted on', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
          { name: `${typeEmoji} Title`, value: submissionData.title || submissionData.fileName || 'Untitled', inline: true },
          { name: '💰 Token Amount', value: tokenDisplay, inline: true },
          { name: '🆔 Submission ID', value: `\`${submissionId}\``, inline: true },
          { name: '🔗 View Submission', value: `[Click Here](${submissionData.messageUrl})`, inline: true }
        ];

        // Add collaboration field if present
        if (hasCollaborators) {
          const collaborators = Array.isArray(submissionData.collab) ? submissionData.collab : [submissionData.collab];
          const collabDisplay = collaborators.join(', ');
          notificationFields.push({ name: '🤝 Collaboration', value: `Collaborating with ${collabDisplay}`, inline: true });
        }

        // Add quest/event fields if present
        if (submissionData.questEvent && submissionData.questEvent !== 'N/A') {
          notificationFields.push({ 
            name: '🎯 Quest/Event', 
            value: `\`${submissionData.questEvent}\``, 
            inline: true 
          });
        }

        if (submissionData.questBonus && submissionData.questBonus !== 'N/A' && submissionData.questBonus > 0) {
          notificationFields.push({ 
            name: '🎁 Quest Bonus', 
            value: `+${submissionData.questBonus} tokens`, 
            inline: true 
          });
        }

        // Add blight ID if provided
        if (submissionData.blightId && submissionData.blightId !== 'N/A') {
          notificationFields.push({ 
            name: '🩸 Blight Healing ID', 
            value: `\`${submissionData.blightId}\``, 
            inline: true 
          });
        }

        const notificationEmbed = new EmbedBuilder()
          .setColor(typeColor)
          .setTitle(`${typeEmoji} PENDING ${submissionType} SUBMISSION!`)
          .setDescription('⏳ **Please approve within 24 hours!**')
          .addFields(notificationFields)
          .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
          .setFooter({ text: `${submissionType} Submission Approval Required` })
          .setTimestamp();

        const notificationMessage = await approvalChannel.send({ embeds: [notificationEmbed] });
        console.log(`[submissionHandler.js]: ✅ Notification sent to approval channel for ${submissionType} submission`);
        
        // Save the pending notification message ID to the submission data
        submissionData.pendingNotificationMessageId = notificationMessage.id;
        await saveSubmissionToStorage(submissionId, submissionData);
      }
    } catch (notificationError) {
      console.error(`[submissionHandler.js]: ❌ Failed to send notification to approval channel:`, notificationError);
      // Don't throw here, just log the error since the submission was already posted
    }

    // Update token count in database and log to Google Sheets
    console.log(`[submissionHandler.js]: 💰 Updating token count for user: ${user.id}`);
    
    // Determine submission category and title
    const submissionCategory = submissionData.category || 'art';
    const submissionTitle = submissionData.title || fileName;
    const submissionUrl = submissionData.fileUrl || fileUrl;
    
    await appendEarnedTokens(user.id, submissionTitle, submissionCategory, totalTokens, submissionUrl);
    await updateTokenBalance(user.id, totalTokens);
    console.log(`[submissionHandler.js]: ✅ Token count updated`);

    // Clean up storage
    console.log(`[submissionHandler.js]: 🧹 Cleaning up submission data for ID: ${submissionId}`);
    await deleteSubmissionFromStorage(submissionId);
    console.log(`[submissionHandler.js]: ✅ Submission data cleaned up`);

  } catch (error) {
    handleError(error, 'submissionHandler.js');
    console.error(`[submissionHandler.js]: ❌ Error in handleSubmissionCompletion:`, error);
    console.error(`[submissionHandler.js]: 📝 Error details:`, {
      message: error.message,
      stack: error.stack,
      interaction: {
        userId: interaction.user.id,
        messageId: interaction.message?.id,
        customId: interaction.customId
      }
    });
    
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ **An error occurred while processing your submission.**',
        ephemeral: true
      });
    }
  }
}

// ============================================================================
// Submission Cancellation Handler
// ============================================================================

// ------------------- Handle Cancel Submission -------------------
// Cancels the submission process, removes persistent data if applicable, 
// resets the in-memory submission state, and notifies the user.
async function handleCancelSubmission(interaction) {
  try {
    // Get submission ID from the embed
    const submissionId = interaction.message.embeds[0]?.fields?.find(field => field.name === 'Submission ID')?.value;
    
    if (!submissionId) {
      console.error(`[submissionHandler.js]: handleCancelSubmission: No submission ID found in embed`);
      await interaction.reply({
        content: '❌ **Submission ID not found. Please restart the submission process.**',
        ephemeral: true,
      });
      return;
    }

    // Delete submission from storage using submissionId
    await deleteSubmissionFromStorage(submissionId);

    // Notify the user about cancellation
    await interaction.update({
      content: '🚫 **Submission canceled.** Please restart the process if you wish to submit again.',
      components: [], // Remove all action components
    });
  } catch (error) {
    handleError(error, 'submissionHandler.js');
    console.error(`[submissionHandler.js]: handleCancelSubmission: ${error.message}`);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ **An error occurred while canceling your submission.**',
        ephemeral: true
      });
    }
  }
}

// ============================================================================
// Submit Action Handler
// ============================================================================

// ------------------- Handle Submit Action -------------------
// Processes the user's submit action by checking the customId of the interaction.
// For confirmation, it finalizes the submission and updates token data;
// for cancellation, it aborts the process.
async function handleSubmitAction(interaction) {
  const customId = interaction.customId;

  if (customId === 'confirm') {
    await handleSubmissionCompletion(interaction);

    const submissionId = interaction.message.embeds[0]?.fields?.find(field => field.name === 'Submission ID')?.value;

    if (!submissionId) {
      console.error(`[submissionHandler.js]: handleSubmitAction: Submission ID is undefined.`);
      if (!interaction.replied) {
        return interaction.reply({
          content: '⚠️ **Submission ID not found.**',
          ephemeral: true,
        });
      }
      return; // Exit if no submission ID is found
    }

    const submission = await retrieveSubmissionFromStorage(submissionId);

    if (!submission) {
      if (!interaction.replied) {
        return interaction.reply({
          content: `⚠️ **Submission with ID \`${submissionId}\` not found.**`,
          ephemeral: true,
        });
      }
      return; // Exit if no submission is found
    }

    const user = interaction.user;

    try {
      // ------------------- Update Token Data -------------------
      // Determine submission category and title
      const submissionCategory = submission.category || 'art';
      const submissionTitle = submission.title || submission.fileName;
      const submissionUrl = submission.fileUrl;
      
      // If a collaboration exists, split tokens; otherwise, assign all tokens to the main user.
      if (submission.collab && ((Array.isArray(submission.collab) && submission.collab.length > 0) || typeof submission.collab === 'string')) {
        // Handle both array and legacy string format
        const collaborators = Array.isArray(submission.collab) ? submission.collab : [submission.collab];
        const totalParticipants = 1 + collaborators.length; // 1 submitter + collaborators
        const splitTokens = Math.floor(submission.finalTokenAmount / totalParticipants);
        
        // Update tokens for the main user
        await appendEarnedTokens(user.id, submissionTitle, submissionCategory, splitTokens, submissionUrl);
        await updateTokenBalance(user.id, splitTokens);
        
        // Update tokens for each collaborator
        for (const collaboratorMention of collaborators) {
          const collaboratorId = collaboratorMention.replace(/[<@>]/g, '');
          await appendEarnedTokens(collaboratorId, submissionTitle, submissionCategory, splitTokens, submissionUrl);
          await updateTokenBalance(collaboratorId, splitTokens);
        }
      } else {
        // No collaboration; assign all tokens to the main user.
        await appendEarnedTokens(user.id, submissionTitle, submissionCategory, submission.finalTokenAmount, submissionUrl);
        await updateTokenBalance(user.id, submission.finalTokenAmount);
      }
    } catch (error) {
      handleError(error, 'submissionHandler.js');
      console.error(`[submissionHandler.js]: handleSubmitAction: Error appending token data for submission ${submissionId}: ${error.message}`);
    }

    if (!interaction.replied) {
      await interaction.editReply({
        content: '✅ **Submission has been confirmed and approved.** Your tokens have been updated!',
        components: [],
      });
    }
  } else if (customId === 'cancel') {
    await handleCancelSubmission(interaction);
  } else {
    if (!interaction.replied) {
      await interaction.reply({ content: '⚠️ **Unknown action!**', ephemeral: true });
    }
  }
}

// ============================================================================
// Exported Handlers
// ============================================================================

// ------------------- Exported Functions -------------------
// Exports the submission action handlers for use in other parts of the application.
module.exports = { handleSubmitAction, handleSubmissionCompletion, handleCancelSubmission };
