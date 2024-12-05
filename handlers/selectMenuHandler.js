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
  if (!interaction.isStringSelectMenu()) return; // Only process string select menus

  const customId = interaction.customId;

  // ------------------- Base Selection -------------------
  if (customId === 'baseSelect') {
    const selectedBase = interaction.values[0];
    if (selectedBase !== 'complete') {
      baseSelections.push(selectedBase); // Add the selected base
      console.log('Base selection updated:', baseSelections);
      await triggerBaseCountModal(interaction, selectedBase);

      if (!interaction.replied) {
        await interaction.update({
          content: `🎨 **Base Selection Updated:** ${baseSelections.map(capitalizeFirstLetter).join(', ')}`,
          components: [getBaseSelectMenu(true), getCancelButtonRow()],
        });
      }
    } else {
      await interaction.update({
        content: `⭐ **Base Selection Complete:** Proceed to Type Multipliers.`,
        components: [getTypeMultiplierMenu(false), getCancelButtonRow()],
      });
    }
  }

  // ------------------- Type Multiplier Selection -------------------
  if (customId === 'typeMultiplierSelect') {
    const selectedMultiplier = interaction.values[0];
    if (selectedMultiplier !== 'complete') {
      typeMultiplierSelections.push(selectedMultiplier); // Add the selected multiplier
      console.log('Type multiplier selection updated:', typeMultiplierSelections);      
      await triggerMultiplierCountModal(interaction, selectedMultiplier);

      if (!interaction.replied) {
        await interaction.update({
          content: `🏷️ **Type Multiplier Updated:** ${typeMultiplierSelections.map(capitalizeFirstLetter).join(', ')}`,
          components: [getTypeMultiplierMenu(true), getCancelButtonRow()],
        });
      }
    } else {
      await interaction.update({
        content: `☑️ **Type Multiplier Complete:** Proceed to Product Multipliers.`,
        components: [getProductMultiplierMenu(), getCancelButtonRow()],
      });
    }
  }

// ------------------- Product Multiplier Selection -------------------
if (customId === 'productMultiplierSelect') {
  const selectedProductMultiplier = interaction.values[0];
  productMultiplierValue = selectedProductMultiplier;

  await interaction.update({
    content: `🎨 **Add-On Selection:**\nProduct Multiplier selected: ${capitalizeFirstLetter(selectedProductMultiplier)}. You can now choose add-ons or click "Complete ✅" to finish.`,
    components: [getAddOnsMenu(true), getCancelButtonRow()],
  });
}

// ------------------- Add-Ons Selection -------------------
if (customId === 'addOnsSelect') {
  const selectedAddOn = interaction.values[0];

  if (selectedAddOn !== 'complete') {
    addOnsApplied.push(selectedAddOn); // Add the selected add-on
    await triggerAddOnCountModal(interaction, selectedAddOn);

    if (!interaction.replied) {
      await interaction.update({
        content: `🎯 **Add-On Selection Updated:** ${addOnsApplied.map(capitalizeFirstLetter).join(', ')}`,
        components: [getAddOnsMenu(true), getCancelButtonRow()],
      });
    }
  } else {
    console.log('Confirming submission with data:', {
      baseSelections,
      typeMultiplierSelections,
      productMultiplierValue,
      addOnsApplied,
      characterCount,
  });
  
  await confirmSubmission(interaction); // Proceed to confirmation
  }
}

}

// ------------------- Confirm Submission -------------------
// Finalizes the submission process and waits for confirmation or cancellation
// ------------------- Confirm Submission -------------------
async function confirmSubmission(interaction) {
  const userId = interaction.user.id;
  const submissionData = submissionStore.get(userId);

  if (!submissionData) {
      console.error('Submission data not found for user:', userId);
      await interaction.reply({
          content: '❌ **Submission data not found. Please restart the submission process.**',
          ephemeral: true,
      });
      return;
  }

  // Retrieve counts from submission data
  const { characterCount = 1, typeMultiplierCount = 1 } = submissionData;

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

  // Update submission data with calculated tokens
  const updatedSubmissionData = {
      ...submissionData,
      baseSelections,
      typeMultiplierSelections,
      productMultiplierValue,
      addOnsApplied,
      characterCount,
      finalTokenAmount: totalTokens,
  };

  submissionStore.set(userId, updatedSubmissionData);

  // Persist updated submission data
  saveSubmissionToStorage(submissionData.submissionId, updatedSubmissionData);

  // Send the token breakdown and confirmation buttons
  await interaction.update({
      content: `${breakdownMessage}\n\n☑️ **Final Token Calculation:** ${totalTokens} Tokens`,
      components: [
          new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('confirm').setLabel('✅ Confirm').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId('cancel').setLabel('❌ Cancel').setStyle(ButtonStyle.Danger),
          ),
      ],
  });
}


// ------------------- Exported Functions -------------------
module.exports = {
  handleSelectMenuInteraction,
  confirmSubmission,
};
