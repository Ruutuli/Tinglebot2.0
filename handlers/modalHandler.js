// ------------------- Discord.js Components -------------------
// Components from discord.js used for building modals and input rows.
const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');


const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Modules -------------------
// Custom modules for formatting and extended functionality.
const { capitalizeFirstLetter } = require('../modules/formattingModule');


// ------------------- Utility Functions -------------------
// Generic helper utilities for menu creation and storage.
const { getAddOnsMenu, getBaseSelectMenu, getSpecialWorksMenu, getTypeMultiplierMenu } = require('../utils/menuUtils');
const { submissionStore } = require('../utils/storage');
const { getCancelButtonRow } = require('./buttonHelperHandler');


// ------------------- Handlers -------------------
// Custom handler functions for modal-related component interactions.
const { handleMountNameSubmission } = require('./mountComponentHandler');


// ------------------- Modal Submission Handler -------------------
// Handles the interaction responses for modal submissions.
async function handleModalSubmission(interaction) {
  const customId = interaction.customId;

  // ------------------- Handle Mount Name Modal -------------------
  // If the modal is for entering a mount name, delegate to the mount name submission handler.
  if (customId.startsWith('mount-name-modal')) {
    await handleMountNameSubmission(interaction);
    return;
  }

  // ------------------- Handle Base Count Modal -------------------
  // Process the base count modal submission and update submission data.
  if (customId === 'baseCountModal') {
    const baseCount = parseInt(interaction.fields.getTextInputValue('baseCountInput'), 10) || 1;

    const userId = interaction.user.id;
    const submissionData = submissionStore.get(userId) || {};
    submissionData.characterCount = baseCount;
    submissionStore.set(userId, submissionData);

    await interaction.update({
      content: `☑️ **${baseCount} base(s)** selected. Select another base or click "Next Section ➡️" when you are done.`,
      components: [getBaseSelectMenu(true), getCancelButtonRow()]
    });
    return;
  }

  // ------------------- Handle Multiplier Count Modal -------------------
  // Process the multiplier count modal submission, update the multiplier count for the specific type.
  if (customId.startsWith('multiplierCountModal_')) {
    const multiplierName = customId.split('_')[1]; // Extract the multiplier name
    const multiplierCount = parseInt(interaction.fields.getTextInputValue('multiplierCountInput'), 10) || 1;

    console.info(`[modalHandler]: Multiplier Count Modal - User: ${interaction.user.id}, Multiplier: ${multiplierName}, Count: ${multiplierCount}`);

    const userId = interaction.user.id;
    const submissionData = submissionStore.get(userId) || {};

    // Ensure typeMultiplierCounts is initialized
    submissionData.typeMultiplierCounts = submissionData.typeMultiplierCounts || {};
    submissionData.typeMultiplierCounts[multiplierName] = multiplierCount;
    submissionStore.set(userId, submissionData);

    await interaction.update({
      content: `☑️ **${multiplierCount}** selected for the multiplier **${capitalizeFirstLetter(multiplierName)}**. Select another Type Multiplier or click "Next Section ➡️" when you are done.`,
      components: [getTypeMultiplierMenu(true), getCancelButtonRow()]
    });
    return;
  }

  // ------------------- Handle Add-On Count Modal -------------------
  // Process the add-on count modal submission, update or add the selected add-on count.
  if (customId.startsWith('addOnCountModal_')) {
    const selectedAddOn = customId.split('_')[1];
    const addOnQuantity = parseInt(interaction.fields.getTextInputValue('addOnCountInput'), 10) || 1;

    const userId = interaction.user.id;
    const submissionData = submissionStore.get(userId) || {};

    // Ensure addOnsApplied is initialized and filter out any invalid entries.
    submissionData.addOnsApplied = submissionData.addOnsApplied || [];
    submissionData.addOnsApplied = submissionData.addOnsApplied.filter(entry => typeof entry === 'object' && entry.addOn);

    // Update or add the selected add-on.
    const existingAddOnIndex = submissionData.addOnsApplied.findIndex(entry => entry.addOn === selectedAddOn);
    if (existingAddOnIndex !== -1) {
      submissionData.addOnsApplied[existingAddOnIndex].count = addOnQuantity;
    } else {
      submissionData.addOnsApplied.push({ addOn: selectedAddOn, count: addOnQuantity });
    }
    submissionStore.set(userId, submissionData);

    const addOnsMenu = getAddOnsMenu(true);
    await interaction.update({
      content: `☑️ **${addOnQuantity} ${selectedAddOn}(s)** added. Select more add-ons or click "Next Section ➡️".`,
      components: [addOnsMenu, getCancelButtonRow()]
    });

    // Optional transition: If the user selects "complete", transition to the Special Works menu.
    if (interaction.values?.[0] === 'complete') {
      const specialWorksMenu = getSpecialWorksMenu(true);
      await interaction.editReply({
        content: '🎨 **Select any special works (Comics or Animation):**',
        components: [specialWorksMenu, getCancelButtonRow()],
        ephemeral: true
      });
    }
    return;
  }

  // ------------------- Handle Special Works Count Modal -------------------
  // Process the special works count modal submission and update submission data.
  if (customId.startsWith('specialWorksCountModal_')) {
    const specialWork = customId.split('_')[1];
    const specialWorkCount = parseInt(interaction.fields.getTextInputValue('specialWorksCountInput'), 10) || 1;

    const userId = interaction.user.id;
    const submissionData = submissionStore.get(userId) || {};

    // Ensure specialWorksApplied is initialized.
    submissionData.specialWorksApplied = submissionData.specialWorksApplied || [];
    submissionData.specialWorksApplied.push({ work: specialWork, count: specialWorkCount });
    submissionStore.set(userId, submissionData);

    await interaction.update({
      content: `☑️ **${specialWorkCount} ${specialWork.replace(/([A-Z])/g, ' $1')}(s)** added. Select more or click "Complete ✅".`,
      components: [getSpecialWorksMenu(true), getCancelButtonRow()]
    });
  }
}


// ------------------- Trigger Base Count Modal -------------------
// Triggers a modal for selecting the number of bases.
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
// Triggers a modal for selecting the number of multipliers.
async function triggerMultiplierCountModal(interaction, multiplier) {
  const modal = new ModalBuilder()
    .setCustomId(`multiplierCountModal_${multiplier}`)
    .setTitle('How Many of This Multiplier?');

  const textInput = new TextInputBuilder()
    .setCustomId('multiplierCountInput')
    .setLabel(`How many ${capitalizeFirstLetter(multiplier)}s?`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const actionRow = new ActionRowBuilder().addComponents(textInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}


// ------------------- Trigger Add-On Count Modal -------------------
// Triggers a modal for selecting the number of add-ons.
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


// ------------------- Trigger Special Works Count Modal -------------------
// Triggers a modal for selecting the number of special works.
async function triggerSpecialWorksCountModal(interaction, specialWork) {
  const modal = new ModalBuilder()
    .setCustomId(`specialWorksCountModal_${specialWork}`)
    .setTitle(`How Many ${specialWork.replace(/([A-Z])/g, ' $1')}?`);

  const textInput = new TextInputBuilder()
    .setCustomId('specialWorksCountInput')
    .setLabel(`How many ${specialWork.replace(/([A-Z])/g, ' $1')}?`)
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const actionRow = new ActionRowBuilder().addComponents(textInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}


// ------------------- Exported Handlers -------------------
// Export all modal handling and triggering functions for external usage.
module.exports = {
  handleModalSubmission,
  triggerBaseCountModal,
  triggerMultiplierCountModal,
  triggerAddOnCountModal,
  triggerSpecialWorksCountModal
};
