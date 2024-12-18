// ------------------- Select Menu Handler -------------------
// Handles the logic for various selection menus during the submission process

// ------------------- Imports -------------------
// Discord.js Imports
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Utility Imports
const { calculateTokens, generateTokenBreakdown } = require('../utils/tokenUtils');
const { capitalizeFirstLetter } = require('../modules/formattingModule');
const { saveSubmissionToStorage, submissionStore } = require('../utils/storage');
const { getBaseSelectMenu, getTypeMultiplierMenu, getProductMultiplierMenu, getAddOnsMenu } = require('../utils/menuUtils');

// Handler Imports
const { triggerBaseCountModal, triggerMultiplierCountModal, triggerAddOnCountModal } = require('../handlers/modalHandler');
const { getCancelButtonRow } = require('./componentHandler');

// ------------------- Global Variables -------------------
// These store temporary submission data during the process
let baseSelections = [];
let typeMultiplierSelections = [];
let productMultiplierValue = 1;
let addOnsApplied = [];
let addOnCount = {};
let characterCount = 1;

// ------------------- Select Menu Interaction Handler -------------------
// Handles all dropdown interactions triggered by the user
async function handleSelectMenuInteraction(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const userId = interaction.user.id;
  const customId = interaction.customId;

  // Initialize user-specific data
  let submissionData = submissionStore.get(userId) || {
    baseSelections: [],
    typeMultiplierSelections: [],
    productMultiplierValue: 1,
    addOnsApplied: [],
    characterCount: 1,
  };

  // ------------------- Base Selection -------------------
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
  else if (customId === 'productMultiplierSelect') {
    submissionData.productMultiplierValue = interaction.values[0];
    submissionStore.set(userId, submissionData);

    await interaction.update({
      content: `🎨 **Product Multiplier Selected:** ${capitalizeFirstLetter(submissionData.productMultiplierValue)}.`,
      components: [getAddOnsMenu(true), getCancelButtonRow()],
    });
  }

  // ------------------- Add-Ons Selection -------------------
  else if (customId === 'addOnsSelect') {
    const selectedAddOn = interaction.values[0];
    if (selectedAddOn !== 'complete') {
      submissionData.addOnsApplied.push(selectedAddOn);
      submissionStore.set(userId, submissionData);

      await triggerAddOnCountModal(interaction, selectedAddOn);

      // Stop further updates after showing modal
      return;
    }

    await confirmSubmission(interaction, submissionData);
  }
}


// ------------------- Confirm Submission -------------------
// Finalizes the submission process and waits for confirmation or cancellation
// ------------------- Confirm Submission -------------------
async function confirmSubmission(interaction) {
  const userId = interaction.user.id;
  const submissionData = submissionStore.get(userId);

  if (!submissionData) {
    console.error('[confirmSubmission]: Submission data not found for user:', userId);
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
    characterCount = 1,
    typeMultiplierCount = 1, // Ensure correct value is used
  } = submissionData;

  const { totalTokens } = calculateTokens({
    baseSelections,
    typeMultiplierSelections,
    productMultiplierValue,
    addOnsApplied,
    characterCount,
    typeMultiplierCount,
  });

  const breakdownMessage = generateTokenBreakdown({
    baseSelections,
    typeMultiplierSelections,
    productMultiplierValue,
    addOnsApplied,
    characterCount,
    typeMultiplierCount,
    finalTokenAmount: totalTokens,
  });

  submissionData.finalTokenAmount = totalTokens;
  submissionStore.set(userId, submissionData);

  await interaction.update({
    content: `${breakdownMessage}\n\n☑️ **Final Token Calculation:** ${totalTokens} Tokens`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('confirm').setLabel('✅ Confirm').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('cancel').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
      ),
    ],
  });

  console.log(`[confirmSubmission]: Final token calculation for user ${userId} is ${totalTokens}`);
}



// ------------------- Exported Functions -------------------
module.exports = {
  handleSelectMenuInteraction,
  confirmSubmission,
};
