// ------------------- Modal Handler -------------------
// Handles the interaction responses for modal submissions

// ------------------- Imports -------------------
// Group imports for better readability
const { 
  ActionRowBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ModalBuilder 
} = require('discord.js');  // Import ModalBuilder and related classes

// Import necessary utility functions and components
const { 
  getBaseSelectMenu, 
  getTypeMultiplierMenu, 
  getProductMultiplierMenu, 
  getAddOnsMenu 
} = require('../utils/menuUtils');

const { getCancelButtonRow } = require('./componentHandler');
const { submissionStore } = require('../utils/storage');


// ------------------- Modal Submission Handler -------------------
// Handles the response after a modal is submitted
async function handleModalSubmission(interaction) {
  console.info(`[modalHandler]: Handling modal submission. CustomId=${interaction.customId}`);
  const customId = interaction.customId;

// Handle the base count modal submission
if (customId === 'baseCountModal') {
  const baseCount = parseInt(interaction.fields.getTextInputValue('baseCountInput'), 10) || 1;


    // Update the submission data in the store
    const userId = interaction.user.id;
    const submissionData = submissionStore.get(userId) || {};
    submissionData.characterCount = baseCount; // Update character count for base
    submissionStore.set(userId, submissionData);

    await interaction.update({
        content: `☑️  **${baseCount} base(s)** selected. Select another base or click "Next Section ➡️" when you are done.`,
        components: [getBaseSelectMenu(true), getCancelButtonRow()],
    });
}

 // Handle the multiplier count modal submission
 if (customId === 'multiplierCountModal') {
  const multiplierCount = parseInt(interaction.fields.getTextInputValue('multiplierCountInput'), 10) || 1;

  const userId = interaction.user.id;
  const submissionData = submissionStore.get(userId) || {};
  submissionData.typeMultiplierCount = multiplierCount; // Store multiplier count
  submissionStore.set(userId, submissionData); // Save back to submissionStore

  await interaction.update({
    content: `☑️  **${multiplierCount} type multiplier(s)** selected. Select another Type Multiplier or click "Next Section ➡️" when you are done.`,
    components: [getTypeMultiplierMenu(true), getCancelButtonRow()],
  });

  console.log(`[modalHandler]: Updated typeMultiplierCount for user ${userId} to ${multiplierCount}`);
}


  // Handle the add-on count modal submission
  if (customId.startsWith('addOnCountModal_')) {
    const selectedAddOn = customId.split('_')[1];
    const addOnQuantity = parseInt(interaction.fields.getTextInputValue('addOnCountInput'), 10) || 1;

    if (!global.addOnCount) {
      global.addOnCount = {};
    }

    global.addOnCount[selectedAddOn] = addOnQuantity; // Store add-on count globally

    await interaction.update({
      content: `☑️  **${addOnQuantity} ${selectedAddOn}(s)** added. Select more add-ons or click "Next Section ➡️" when done.`,
      components: [getAddOnsMenu(true), getCancelButtonRow()]
    });
  }
}

// ------------------- Trigger Base Count Modal -------------------
// Triggers a modal for selecting the number of bases
async function triggerBaseCountModal(interaction, base) {
  const modal = new ModalBuilder()
    .setCustomId('baseCountModal')
    .setTitle('How Many of This Base?');

  const textInput = new TextInputBuilder()
    .setCustomId('baseCountInput')
    .setLabel(`How many ${base}s?`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const actionRow = new ActionRowBuilder().addComponents(textInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}

// ------------------- Trigger Multiplier Count Modal -------------------
// Triggers a modal for selecting the number of type multipliers
async function triggerMultiplierCountModal(interaction, multiplier) {
  const modal = new ModalBuilder()
    .setCustomId('multiplierCountModal')
    .setTitle('How Many of This Multiplier?');

  const textInput = new TextInputBuilder()
    .setCustomId('multiplierCountInput')
    .setLabel(`How many ${multiplier}s?`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const actionRow = new ActionRowBuilder().addComponents(textInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}

// ------------------- Trigger Add-On Count Modal -------------------
// Triggers a modal for selecting the number of add-ons
async function triggerAddOnCountModal(interaction, addOn) {
  const modal = new ModalBuilder()
    .setCustomId(`addOnCountModal_${addOn}`)
    .setTitle(`How many ${addOn}(s)?`);

  const textInput = new TextInputBuilder()
    .setCustomId('addOnCountInput')
    .setLabel(`How many ${addOn}s?`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const actionRow = new ActionRowBuilder().addComponents(textInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}



// ------------------- Exported Handlers -------------------
// Export all modal handling functions for external usage
module.exports = {
  handleModalSubmission,
  triggerBaseCountModal,
  triggerMultiplierCountModal,
  triggerAddOnCountModal
};
