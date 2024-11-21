// ------------------- Select Menu Handler -------------------
// Handles the logic for various selection menus during the submission process

// ------------------- Imports -------------------
// Grouped imports logically for clarity
const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const { calculateFinalTokens } = require('../utils/tokenUtils');
const { capitalizeFirstLetter } = require('../modules/formattingModule');
const artModule = require('../modules/artModule');
const {
  triggerBaseCountModal,
  triggerMultiplierCountModal,
  triggerAddOnCountModal
} = require('../handlers/modalHandler');
const { getBaseSelectMenu, getTypeMultiplierMenu, getProductMultiplierMenu, getAddOnsMenu } = require('../utils/menuUtils');
const { submissionStore } = require('../utils/storage'); // Ensure submissionStore is properly imported
const { getCancelButtonRow } = require('./componentHandler');


// ------------------- Global Variables -------------------
// Global variables to store submission-related data
let baseSelections = [];
let typeMultiplierSelections = [];
let productMultiplierValue = 1;
let addOnsApplied = [];
let addOnCount = {};
let characterCount = 1;
let typeMultiplierValue = 1;
let submissionBreakdown = ''; // Added submission breakdown to global variables

// ------------------- Select Menu Interaction Handler -------------------
async function handleSelectMenuInteraction(interaction) {
  console.log(`Dropdown interaction detected: ${interaction.customId}`); // Debugging log

  // Handle test dropdown interaction
  if (interaction.customId === 'test_dropdown') { // Added for handling dropdown
      const selectedOption = interaction.values[0]; // Get the selected value
      console.log(`Selected option: ${selectedOption}`); // Debugging log
      await interaction.reply({ 
          content: `✅ Dropdown interaction works! You selected: ${selectedOption}`, 
          ephemeral: true 
      });
      return; // Exit after handling
  }

  // ------------------- Base Selection -------------------
  if (interaction.customId === 'baseSelect') {
    const selectedBase = interaction.values[0];
    if (selectedBase !== 'complete') {
      // Add selected base and trigger modal for base count
      baseSelections.push(selectedBase);
      submissionBreakdown += `**Base:** ${baseSelections.map(base => capitalizeFirstLetter(base)).join(', ')} × ${characterCount}`;

      await triggerBaseCountModal(interaction, selectedBase);

      if (!interaction.replied) {
        await interaction.update({
          content: `🎨 **Base Selection:**\n${baseSelections.map(base => capitalizeFirstLetter(base)).join(', ')} selected. Select another base or click "Next Section ➡️" to proceed.`,
          components: [getBaseSelectMenu(true), getCancelButtonRow()]
        });
      }
    } else {
      if (!interaction.replied) {
        await interaction.update({
          content: `⭐ **Base Selection Complete:**\nNow choose the Type Multiplier. Click "Next Section ➡️" to proceed.`,
          components: [getTypeMultiplierMenu(false), getCancelButtonRow()]
        });
      }
    }
  }

  // ------------------- Type Multiplier Selection -------------------
  if (interaction.customId === 'typeMultiplierSelect') {
    const selectedMultiplier = interaction.values[0];
    if (selectedMultiplier !== 'complete') {
      // Add selected type multiplier and trigger modal for multiplier count
      typeMultiplierSelections.push(selectedMultiplier);
      const multiplierValue = artModule.typeMultipliers[selectedMultiplier] || 1;
      typeMultiplierValue += multiplierValue;
      submissionBreakdown += `**Type Multiplier:** ${typeMultiplierSelections.map(multiplier => capitalizeFirstLetter(multiplier)).join(', ')} × ${characterCount}`;

      await triggerMultiplierCountModal(interaction, selectedMultiplier);

      if (!interaction.replied) {
        await interaction.update({
          content: `🏷️ **Type Multiplier Selection:**\n${typeMultiplierSelections.map(multiplier => capitalizeFirstLetter(multiplier)).join(', ')} selected. Select another multiplier or click "Next Section ➡️" to proceed.`,
          components: [getTypeMultiplierMenu(true), getCancelButtonRow()]
        });
      }
    } else {
      if (!interaction.replied) {
        await interaction.update({
          content: `☑️ **Type Multiplier Selection Complete:**\nNow choose the Product Multiplier.`,
          components: [getProductMultiplierMenu(), getCancelButtonRow()]
        });
      }
    }
  }

  // ------------------- Product Multiplier Selection -------------------
  if (interaction.customId === 'productMultiplierSelect') {
    const selectedProductMultiplier = interaction.values[0];
    productMultiplierValue = artModule.productMultipliers[selectedProductMultiplier] || 1;
    submissionBreakdown += `**Product Multiplier:** ${capitalizeFirstLetter(selectedProductMultiplier)} × 1`;

    if (!interaction.replied) {
      await interaction.update({
        content: `🎨 **Product Multiplier Selection:**\n${capitalizeFirstLetter(selectedProductMultiplier)} selected. You can only pick one. Now choose add-ons or click "Complete ✅" to finish.`,
        components: [getAddOnsMenu(true), getCancelButtonRow()]
      });
    }
  }

  // ------------------- Add-Ons Selection -------------------
  if (interaction.customId === 'addOnsSelect') {
    const selectedAddOn = interaction.values[0];

    if (selectedAddOn !== 'complete') {
      // Add selected add-ons and trigger modal for add-on count
      addOnsApplied.push(selectedAddOn);
      submissionBreakdown += `**Add-ons:** ${addOnsApplied.map(addOn => capitalizeFirstLetter(addOn)).join(', ')}`;

      await triggerAddOnCountModal(interaction, selectedAddOn);

      if (!interaction.replied) {
        await interaction.update({
          content: `🎯 **Add-On Selected:**\n${addOnsApplied.map(addOn => capitalizeFirstLetter(addOn)).join(', ')} added. Choose more add-ons or click "Next Section ➡️" to proceed.`,
          components: [getAddOnsMenu(true)]
        });
      }
    } else {
      await confirmSubmission(interaction);
    }
  }
}

// ------------------- Confirm Submission -------------------
// Finalizes the submission and calculates the total token amount
async function confirmSubmission(interaction) {
  const finalTokenAmount = calculateFinalTokens({
    base: baseSelections,
    characterCount,
    typeMultiplier: typeMultiplierValue * characterCount,
    productMultiplier: productMultiplierValue,
    addOnsApplied,
    addOnCount
  });

  // Store the selection data in the submissionStore
  submissionStore.set(interaction.user.id, {
    ...submissionStore.get(interaction.user.id),  // Preserve fileUrl and fileName
    baseSelections,
    typeMultiplierSelections,
    productMultiplierValue,
    addOnsApplied,
    addOnCount,
    characterCount,
    finalTokenAmount
  });

  // Format the token breakdown as a code block
  const breakdownMessage = `
\`\`\`
  ${baseSelections.map(base => `${capitalizeFirstLetter(base)} (15 × ${characterCount})`).join('\n')}
× ${typeMultiplierSelections.map(multiplier => `${capitalizeFirstLetter(multiplier)} (1.5 × ${characterCount})`).join('\n× ')}
× Fullcolor (${productMultiplierValue} × 1)
${addOnsApplied.length > 0 ? addOnsApplied.map(addOn => `+ ${capitalizeFirstLetter(addOn)} (1.5 × 1)`).join('\n') : ''}
---------------------
= ${finalTokenAmount} Tokens
\`\`\`
`;

  const finalMessage = `☑️ **Final Token Calculation:** ${finalTokenAmount} Tokens`;

  await interaction.update({
    content: `${breakdownMessage}\n\n${finalMessage}\n\nClick "Confirm ✅" to finalize or "Cancel ❌" to start over.`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm')
          .setLabel('✅ Confirm')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('cancel')
          .setLabel('❌ Cancel')
          .setStyle(ButtonStyle.Danger)
      )
    ]
  });
}

// ------------------- Exported Functions -------------------
// Export functions to handle the select menu interactions and submission confirmation
module.exports = {
  handleSelectMenuInteraction,
  confirmSubmission,
};
