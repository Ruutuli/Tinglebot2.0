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
const { saveSubmissionToStorage, retrieveSubmissionFromStorage, findLatestSubmissionIdForUser } = require('../utils/storage');

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
const { getCancelButtonRow } = require('./buttonHelperHandler');

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

    // Get or create submission data
    console.log(`[selectMenuHandler.js]: 🔄 Checking for existing submission for user: ${userId}`);
    let submissionId = await findLatestSubmissionIdForUser(userId);
    if (submissionId) {
      console.log(`[selectMenuHandler.js]: 🔄 Found existing submissionId: ${submissionId}`);
    }
    let submissionData = submissionId ? await retrieveSubmissionFromStorage(submissionId) : null;
    if (!submissionData) {
      submissionId = 'A' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
      console.log(`[selectMenuHandler.js]: 🚀 Generating new submissionId: ${submissionId}`);
      submissionData = {
        submissionId,
        userId,
        baseSelections: [],
        typeMultiplierSelections: [],
        productMultiplierValue: 'default',
        addOnsApplied: [],
        specialWorksApplied: [],
        characterCount: 1,
        typeMultiplierCounts: {},
        finalTokenAmount: 0,
        tokenCalculation: null,
        collab: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      // Save initial submission data with submissionId
      console.log(`[selectMenuHandler.js]: 💾 Saving new submission: ${submissionId} for user: ${userId}`);
      await saveSubmissionToStorage(submissionId, submissionData);
    } else {
      console.log(`[selectMenuHandler.js]: 💾 Reusing submission: ${submissionId} for user: ${userId}`);
    }

    // ------------------- Base Selection -------------------
    if (customId === 'baseSelect') {
      const selectedBase = interaction.values[0];

      if (selectedBase !== 'complete') {
        // Ensure baseSelections is an array
        submissionData.baseSelections = submissionData.baseSelections || [];
        
        // Clear any previous selections and add the new one
        submissionData.baseSelections = [selectedBase];
        
        // Save immediately after adding base selection using submissionId
        await saveSubmissionToStorage(submissionData.submissionId, submissionData);
        console.log('Base selection saved:', submissionData.baseSelections);

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
        // Always replace with the latest type multiplier selection
        submissionData.typeMultiplierSelections = [selectedMultiplier];
        // Reset typeMultiplierCounts to only the current selection
        submissionData.typeMultiplierCounts = { [selectedMultiplier]: 1 };
        
        // Save immediately after adding multiplier selection using submissionId
        await saveSubmissionToStorage(submissionData.submissionId, submissionData);
        console.log('Type multiplier selection saved:', submissionData.typeMultiplierSelections);

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
      submissionData.productMultiplierValue = interaction.values[0];
      // Save immediately after setting product multiplier using submissionId
      await saveSubmissionToStorage(submissionData.submissionId, submissionData);
      console.log('Product multiplier saved:', submissionData.productMultiplierValue);

      await interaction.update({
        content: `🎨 **Product Multiplier Selected:** ${capitalizeFirstLetter(submissionData.productMultiplierValue)}.`,
        components: [getAddOnsMenu(true), getCancelButtonRow()],
      });
    }

    // ------------------- Add-Ons Selection -------------------
    else if (customId === 'addOnsSelect') {
      const selectedAddOn = interaction.values[0];

      if (selectedAddOn !== 'complete') {
        // Ensure addOnsApplied is initialized and remove duplicate entries
        submissionData.addOnsApplied = submissionData.addOnsApplied || [];
        submissionData.addOnsApplied = submissionData.addOnsApplied.filter(
          (entry) => entry.addOn !== selectedAddOn
        );
        submissionData.addOnsApplied.push({ addOn: selectedAddOn, count: 1 });
        
        // Save immediately after adding add-on using submissionId
        await saveSubmissionToStorage(submissionData.submissionId, submissionData);
        console.log('Add-on saved:', submissionData.addOnsApplied);

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
        // Ensure specialWorksApplied is initialized
        submissionData.specialWorksApplied = submissionData.specialWorksApplied || [];
        submissionData.specialWorksApplied.push({ work: selectedWork, count: 1 });
        
        // Save immediately after adding special work using submissionId
        await saveSubmissionToStorage(submissionData.submissionId, submissionData);
        console.log('Special work saved:', submissionData.specialWorksApplied);

        await triggerSpecialWorksCountModal(interaction, selectedWork);
        return;
      }

      // All selections complete; proceed to final confirmation
      await confirmSubmission(interaction, submissionData);
    }
  } catch (error) {
    handleError(error, 'selectMenuHandler.js');

    console.error(`[selectMenuHandler.js]: handleSelectMenuInteraction: ${error.message}`);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: '❌ **An error occurred while processing your selection.**',
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: '❌ **An error occurred while processing your selection.**',
        ephemeral: true
      });
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
      typeMultiplierSelections: submissionData.typeMultiplierSelections,
      productMultiplierValue: submissionData.productMultiplierValue,
      addOnsApplied: submissionData.addOnsApplied,
      specialWorksApplied: submissionData.specialWorksApplied,
      characterCount: submissionData.characterCount,
      typeMultiplierCounts: submissionData.typeMultiplierCounts,
      collab: submissionData.collab
    });
    // Update submission data with final calculations
    submissionData.finalTokenAmount = totalTokens;
    submissionData.tokenCalculation = breakdown;
    submissionData.updatedAt = new Date();
    // Save final submission data using submissionId as the key
    await saveSubmissionToStorage(submissionId, submissionData);
    // Generate the token breakdown
    const breakdownMessage = generateTokenBreakdown({
      baseSelections: submissionData.baseSelections,
      typeMultiplierSelections: submissionData.typeMultiplierSelections,
      productMultiplierValue: submissionData.productMultiplierValue,
      addOnsApplied: submissionData.addOnsApplied,
      specialWorksApplied: submissionData.specialWorksApplied,
      characterCount: submissionData.characterCount,
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
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: '❌ **An error occurred while finalizing your submission.**',
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: '❌ **An error occurred while finalizing your submission.**',
        ephemeral: true
      });
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
