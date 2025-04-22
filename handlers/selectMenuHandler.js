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

// Storage utilities for saving and retrieving submission data
const { submissionStore } = require('../utils/storage');

// Menu utilities to generate select menus for the submission process
const {
  getAddOnsMenu,
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

    const userId = interaction.user.id;
    const customId = interaction.customId;

    // Initialize or retrieve user-specific submission data
    let submissionData = submissionStore.get(userId) || {
      baseSelections: [],
      typeMultiplierSelections: [],
      productMultiplierValue: 1,
      addOnsApplied: [],
      characterCount: 1,
      typeMultiplierCounts: {}, // For storing counts per multiplier
      collab: null, // For collaborative submissions if applicable
    };

    // ------------------- Base Selection -------------------
    // Handles the base selection from the user and triggers a count modal if needed.
    if (customId === 'baseSelect') {
      const selectedBase = interaction.values[0];

      if (selectedBase !== 'complete') {
        submissionData.baseSelections.push(selectedBase);
        submissionStore.set(userId, submissionData);

        await triggerBaseCountModal(interaction, selectedBase);
        // Stop further updates after showing modal
        return;
      }

      await interaction.update({
        content: '⭐ **Base Selection Complete:** Proceed to Type Multipliers.',
        components: [getTypeMultiplierMenu(false), getCancelButtonRow()],
      });
    }

    // ------------------- Type Multiplier Selection -------------------
    // Handles the type multiplier selection and triggers its corresponding count modal.
    else if (customId === 'typeMultiplierSelect') {
      const selectedMultiplier = interaction.values[0];

      if (selectedMultiplier !== 'complete') {
        submissionData.typeMultiplierSelections.push(selectedMultiplier);
        submissionStore.set(userId, submissionData);

        await triggerMultiplierCountModal(interaction, selectedMultiplier);
        // Stop further updates after showing modal
        return;
      }

      await interaction.update({
        content: '☑️ **Type Multiplier Complete:** Proceed to Product Multipliers.',
        components: [getProductMultiplierMenu(), getCancelButtonRow()],
      });
    }

    // ------------------- Product Multiplier Selection -------------------
    // Handles the product multiplier selection and updates the submission data.
    else if (customId === 'productMultiplierSelect') {
      submissionData.productMultiplierValue = interaction.values[0];
      submissionStore.set(userId, submissionData);

      await interaction.update({
        content: `🎨 **Product Multiplier Selected:** ${capitalizeFirstLetter(submissionData.productMultiplierValue)}.`,
        components: [getAddOnsMenu(true), getCancelButtonRow()],
      });
    }

    // ------------------- Add-Ons Selection -------------------
    // Processes the add-ons selection and triggers the add-on count modal.
    else if (customId === 'addOnsSelect') {
      const selectedAddOn = interaction.values[0];

      if (selectedAddOn !== 'complete') {
        // Ensure addOnsApplied is initialized and remove duplicate entries
        submissionData.addOnsApplied = submissionData.addOnsApplied || [];
        submissionData.addOnsApplied = submissionData.addOnsApplied.filter(
          (entry) => entry !== selectedAddOn
        );
        submissionData.addOnsApplied.push(selectedAddOn);

        submissionStore.set(userId, submissionData);
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
    // Handles special works selection and triggers its count modal; proceeds to confirmation when complete.
    else if (customId === 'specialWorksSelect') {
      const selectedWork = interaction.values[0];

      if (selectedWork !== 'complete') {
        // Ensure specialWorksApplied is initialized
        submissionData.specialWorksApplied = submissionData.specialWorksApplied || [];
        submissionData.specialWorksApplied.push(selectedWork);
        submissionStore.set(userId, submissionData);

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
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '❌ **An error occurred while processing your selection.**',
        ephemeral: true,
      });
    }
  }
}

// ============================================================================
// Confirm Submission
// ------------------- Finalizes the submission process and displays the token breakdown -------------------
async function confirmSubmission(interaction) {
  try {
    const userId = interaction.user.id;
    const submissionData = submissionStore.get(userId);

    if (!submissionData) {
      await interaction.reply({
        content: '❌ **Submission data not found. Please restart the submission process.**',
        ephemeral: true,
      });
      return;
    }

    const {
      baseSelections = [],
      typeMultiplierSelections = [],
      productMultiplierValue = 1,
      addOnsApplied = [],
      specialWorksApplied = [],
      characterCount = 1,
      typeMultiplierCounts = {},
    } = submissionData;

    // ------------------- Token Calculation -------------------
    // Calculate the total tokens based on the submission selections.
    const { totalTokens } = calculateTokens({
      baseSelections,
      typeMultiplierSelections,
      productMultiplierValue,
      addOnsApplied,
      specialWorksApplied,
      characterCount,
      typeMultiplierCounts,
      collab: submissionData.collab || null,
    });

    // ------------------- Token Breakdown Generation -------------------
    // Generate a detailed breakdown of the token calculation.
    const breakdownMessage = generateTokenBreakdown({
      baseSelections,
      typeMultiplierSelections,
      productMultiplierValue,
      addOnsApplied,
      specialWorksApplied,
      characterCount,
      typeMultiplierCounts,
      finalTokenAmount: totalTokens,
      collab: submissionData.collab || null,
    });

    submissionData.finalTokenAmount = totalTokens;
    submissionStore.set(userId, submissionData);

    // ------------------- Display Confirmation -------------------
    // Update the interaction with the final token breakdown and confirm/cancel buttons.
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
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: '❌ **An error occurred while finalizing your submission.**',
        ephemeral: true,
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
