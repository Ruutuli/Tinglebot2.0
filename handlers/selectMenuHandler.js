// ------------------- selectMenuHandler.js -------------------
// This module handles the logic for various selection menus during the submission process.
// It manages user interactions from dropdown menus, updates submission data, triggers modals,
// and confirms the final submission with a token breakdown.

// ============================================================================
// Discord.js Components
// ============================================================================

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ============================================================================
// Modules
// ============================================================================

const { capitalizeFirstLetter } = require('../modules/formattingModule');

// ============================================================================
// Utility Functions
// ============================================================================

// Token calculation and breakdown utilities
const { calculateTokens, generateTokenBreakdown } = require('../utils/tokenUtils');

// Storage utilities
const { 
  getOrCreateSubmission, 
  updateSubmissionData, 
  retrieveSubmissionFromStorage, 
  findLatestSubmissionIdForUser 
} = require('../utils/storage');

// Menu utilities to generate select menus for the submission process
const {
  getAddOnsMenu,
  getBaseSelectMenu,
  getProductMultiplierMenu,
  getSpecialWorksMenu,
  getTypeMultiplierMenu,
} = require('../utils/menuUtils');

// ============================================================================
// Handlers
// ============================================================================

// Modal handler functions for triggering count modals based on selection
const {
  triggerAddOnCountModal,
  triggerBaseCountModal,
  triggerMultiplierCountModal,
  triggerSpecialWorksCountModal,
} = require('../handlers/modalHandler');

// Button helper handler for generating cancel buttons
const { getCancelButtonRow, getConfirmButtonRow } = require('./buttonHelperHandler');

// ============================================================================
// Select Menu Interaction Handler
// ------------------- Handles all dropdown interactions triggered by the user -------------------
async function handleSelectMenuInteraction(interaction) {
  try {
    // Ensure the interaction is from a string select menu
    if (!interaction.isStringSelectMenu()) return;

    // Check if this is a submission-related select menu
    const submissionMenuIds = ['baseSelect', 'typeMultiplierSelect', 'productMultiplierSelect', 'addOnsSelect', 'specialWorksSelect'];
    if (!submissionMenuIds.includes(interaction.customId)) {
      console.log(`[selectMenuHandler.js]: ⏭️ Skipping non-submission select menu: ${interaction.customId}`);
      return;
    }

    const userId = interaction.user.id;
    const customId = interaction.customId;

    // Get or create submission data using the new helper
    const { submissionId, submissionData } = await getOrCreateSubmission(userId);

    // Track updates to apply at the end
    let updates = {};

    // ------------------- Base Selection -------------------
    if (customId === 'baseSelect') {
      const selectedBase = interaction.values[0];

      if (selectedBase !== 'complete') {
        // Add to existing selections instead of replacing
        const currentSelections = submissionData.baseSelections || [];
        if (!currentSelections.includes(selectedBase)) {
          updates.baseSelections = [...currentSelections, selectedBase];
        } else {
          // If already selected, just update the existing selection
          updates.baseSelections = currentSelections;
        }
        // Save the updates before triggering the modal
        await updateSubmissionData(submissionId, updates);

        // First show the modal with the selected base
        await triggerBaseCountModal(interaction, selectedBase);
        
        // Then update the message
        await interaction.editReply({
          content: `⭐ **Selected Base:** ${capitalizeFirstLetter(selectedBase)}. How many would you like?`,
          components: [getBaseSelectMenu(true), getCancelButtonRow()]
        });
        return;
      }

      // If complete, show type multiplier menu
      await interaction.update({
        content: '⭐ **Base Selection Complete:** Proceed to Type Multipliers.',
        components: [getTypeMultiplierMenu(false), getCancelButtonRow()],
      });
    }

    // ------------------- Type Multiplier Selection -------------------
    else if (customId === 'typeMultiplierSelect') {
      const selectedMultiplier = interaction.values[0];

      if (selectedMultiplier !== 'complete') {
        // Add to existing selections instead of replacing
        const currentSelections = submissionData.typeMultiplierSelections || [];
        const currentCounts = submissionData.typeMultiplierCounts || {};
        
        if (!currentSelections.includes(selectedMultiplier)) {
          updates.typeMultiplierSelections = [...currentSelections, selectedMultiplier];
          updates.typeMultiplierCounts = { ...currentCounts, [selectedMultiplier]: 1 };
        } else {
          // If already selected, just update the existing selection
          updates.typeMultiplierSelections = currentSelections;
          updates.typeMultiplierCounts = currentCounts;
        }
        
        // Save the updates before triggering the modal
        await updateSubmissionData(submissionId, updates);

        await triggerMultiplierCountModal(interaction, selectedMultiplier);
        return;
      }

      await interaction.update({
        content: '☑️ **Type Multiplier Complete:** Proceed to Product Multipliers.',
        components: [getProductMultiplierMenu(), getCancelButtonRow()],
      });
    }

    // ------------------- Product Multiplier Selection -------------------
    else if (customId === 'productMultiplierSelect') {
      updates.productMultiplierValue = interaction.values[0];

      await interaction.update({
        content: `🎨 **Product Multiplier Selected:** ${capitalizeFirstLetter(updates.productMultiplierValue)}.`,
        components: [getAddOnsMenu(true), getCancelButtonRow()],
      });
    }

    // ------------------- Add-Ons Selection -------------------
    else if (customId === 'addOnsSelect') {
      const selectedAddOn = interaction.values[0];

      if (selectedAddOn !== 'complete') {
        // Ensure addOnsApplied is initialized and remove duplicate entries
        const currentAddOns = submissionData.addOnsApplied || [];
        const filteredAddOns = currentAddOns.filter(entry => entry.addOn !== selectedAddOn);
        updates.addOnsApplied = [...filteredAddOns, { addOn: selectedAddOn, count: 1 }];
        
        // Save the updates before triggering the modal
        await updateSubmissionData(submissionId, updates);

        await triggerAddOnCountModal(interaction, selectedAddOn);
        return;
      }

      // Once add-ons are complete, prompt user for special works selection
      const specialWorksMenu = getSpecialWorksMenu(true);
      await interaction.update({
        content: '🎨 **Select any special works (Comics or Animation):**',
        components: [specialWorksMenu, getCancelButtonRow()],
      });
    }

    // ------------------- Special Works Selection -------------------
    else if (customId === 'specialWorksSelect') {
      const selectedWork = interaction.values[0];

      if (selectedWork !== 'complete') {
        // Check for comic/animation conflict
        const currentWorks = submissionData.specialWorksApplied || [];
        const hasComic = currentWorks.some(work => work.work.startsWith('comic'));
        const hasAnimation = currentWorks.some(work => work.work.startsWith('frame'));
        const isComic = selectedWork.startsWith('comic');
        const isAnimation = selectedWork.startsWith('frame');
        
        // Validate: Cannot have both comic and animation
        if ((hasComic && isAnimation) || (hasAnimation && isComic)) {
          await interaction.reply({
            content: '❌ **Cannot select both Comics and Animation.**\n\nYou can only choose either Comics OR Animation, not both. Please remove one type before adding the other.',
            ephemeral: true
          });
          return;
        }
        
        // Ensure specialWorksApplied is initialized and remove duplicate entries
        const filteredWorks = currentWorks.filter(entry => entry.work !== selectedWork);
        updates.specialWorksApplied = [...filteredWorks, { work: selectedWork, count: 1 }];
        
        console.log('Special work updated:', updates.specialWorksApplied);

        // Save the updates before triggering the modal
        await updateSubmissionData(submissionId, updates);
        console.log(`[selectMenuHandler.js]: 💾 Saved special work selection for submission: ${submissionId}`);

        await triggerSpecialWorksCountModal(interaction, selectedWork);
        return;
      }

      // Apply updates first to ensure all data is saved
      if (Object.keys(updates).length > 0) {
        await updateSubmissionData(submissionId, updates);
        console.log(`[selectMenuHandler.js]: 💾 Applied updates to submission: ${submissionId}`);
      }

      // Get the updated submission data
      const updatedSubmissionData = await retrieveSubmissionFromStorage(submissionId);
      
      // Calculate tokens with complete data
      const { totalTokens, breakdown } = calculateTokens(updatedSubmissionData);
      
      // Generate the breakdown string
      const breakdownString = generateTokenBreakdown({
        baseSelections: updatedSubmissionData.baseSelections,
        baseCounts: updatedSubmissionData.baseCounts || new Map(),
        typeMultiplierSelections: updatedSubmissionData.typeMultiplierSelections,
        productMultiplierValue: updatedSubmissionData.productMultiplierValue,
        addOnsApplied: updatedSubmissionData.addOnsApplied,
        specialWorksApplied: updatedSubmissionData.specialWorksApplied,
        typeMultiplierCounts: updatedSubmissionData.typeMultiplierCounts,
        finalTokenAmount: totalTokens,
        collab: updatedSubmissionData.collab
      });

      // Update with final calculations
      await updateSubmissionData(submissionId, {
        finalTokenAmount: totalTokens,
        tokenCalculation: breakdownString
      });

      // Show final confirmation with token breakdown
      await interaction.update({
        content: `✅ **Submission Complete!**\n\n${breakdownString}\n\nClick "Confirm Submission" to finalize.`,
        components: [getConfirmButtonRow()],
      });
    }

    // Apply updates only if there are any (for non-special works selections)
    if (Object.keys(updates).length > 0 && customId !== 'specialWorksSelect') {
      await updateSubmissionData(submissionId, updates);
      console.log(`[selectMenuHandler.js]: 💾 Applied updates to submission: ${submissionId}`);
    }

  } catch (error) {
    console.error(`[selectMenuHandler.js]: ❌ Error in handleSelectMenuInteraction: ${error.message}`);
    console.error(error.stack);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **An error occurred while processing your selection. Please try again.**',
          ephemeral: true
        });
      } else if (interaction.replied) {
        await interaction.followUp({
          content: '❌ **An error occurred while processing your selection. Please try again.**',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[selectMenuHandler.js]: ❌ Failed to send select menu error response: ${replyError.message}`);
    }
  }
}

// ============================================================================
// Confirm Submission
// ------------------- Finalizes the submission process and displays the token breakdown -------------------
async function confirmSubmission(interaction) {
  try {
    // Retrieve the submissionId from the latest saved data (from the select menu session)
    let submissionId;
    // Try to get it from the interaction, fallback to userId if not present
    if (interaction.message && interaction.message.embeds && interaction.message.embeds[0]) {
      const idField = interaction.message.embeds[0].fields?.find(f => f.name === 'Submission ID');
      if (idField) submissionId = idField.value;
    }
    // If not found, try to get from storage by userId
    if (!submissionId) {
      const tempData = await retrieveSubmissionFromStorage(interaction.user.id);
      submissionId = tempData?.submissionId;
    }
    if (!submissionId) {
      await interaction.reply({
        content: '❌ **Submission ID not found. Please restart the submission process.**',
        ephemeral: true
      });
      return;
    }
    // Always retrieve the latest data by submissionId
    const submissionData = await retrieveSubmissionFromStorage(submissionId);
    if (!submissionData) {
      await interaction.reply({
        content: '❌ **Submission data not found. Please restart the submission process.**',
        ephemeral: true
      });
      return;
    }
    // Calculate tokens and generate breakdown
    const { totalTokens, breakdown } = calculateTokens({
      baseSelections: submissionData.baseSelections,
      baseCounts: submissionData.baseCounts || new Map(),
      typeMultiplierSelections: submissionData.typeMultiplierSelections,
      productMultiplierValue: submissionData.productMultiplierValue,
      addOnsApplied: submissionData.addOnsApplied,
      specialWorksApplied: submissionData.specialWorksApplied,
      typeMultiplierCounts: submissionData.typeMultiplierCounts,
      collab: submissionData.collab
    });
    // Update submission data with final calculations
    submissionData.finalTokenAmount = totalTokens;
    submissionData.tokenCalculation = breakdown;
    submissionData.updatedAt = new Date();
    // Save final submission data using submissionId as the key
    await updateSubmissionData(submissionId, submissionData);
    // Generate the token breakdown
    const breakdownMessage = generateTokenBreakdown({
      baseSelections: submissionData.baseSelections,
      baseCounts: submissionData.baseCounts || new Map(),
      typeMultiplierSelections: submissionData.typeMultiplierSelections,
      productMultiplierValue: submissionData.productMultiplierValue,
      addOnsApplied: submissionData.addOnsApplied,
      specialWorksApplied: submissionData.specialWorksApplied,
      typeMultiplierCounts: submissionData.typeMultiplierCounts,
      finalTokenAmount: totalTokens,
      collab: submissionData.collab
    });
    // ------------------- Display Confirmation -------------------
    await interaction.update({
      content: `${breakdownMessage}\n\n☑️ **Final Total Token Calculation:** ${totalTokens} Tokens`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('confirm').setLabel('✅ Confirm').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('cancel').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger)
        ),
      ],
    });
  } catch (error) {
    handleError(error, 'selectMenuHandler.js');
    console.error(`[selectMenuHandler.js]: confirmSubmission: ${error.message}`);
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **An error occurred while finalizing your submission.**',
          ephemeral: true
        });
      } else if (interaction.replied) {
        await interaction.followUp({
          content: '❌ **An error occurred while finalizing your submission.**',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[selectMenuHandler.js]: ❌ Failed to send confirm submission error response: ${replyError.message}`);
    }
  }
}

// ============================================================================
// Exported Functions
// ------------------- Exports the select menu interaction and confirmation handlers -------------------
module.exports = {
  handleSelectMenuInteraction,
  confirmSubmission,
};
