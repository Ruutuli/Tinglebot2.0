// ------------------- Modal Handler -------------------
// Handles the interaction responses for modal submissions

// ------------------- Imports -------------------
// Standard and third-party libraries
const {
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
  ModalBuilder
} = require('discord.js');

// Utility functions and components
const {
  getBaseSelectMenu,
  getTypeMultiplierMenu,
  getProductMultiplierMenu,
  getAddOnsMenu,
  getSpecialWorksMenu
} = require('../utils/menuUtils');
const { getCancelButtonRow } = require('./buttonHelperHandler');
const { submissionStore } = require('../utils/storage');
const { handleMountNameSubmission } = require('./mountComponentHandler');

// ------------------- Modal Submission Handler -------------------
// Handles the response after a modal is submitted
async function handleModalSubmission(interaction) {
  console.info(`[modalHandler]: Handling modal submission. CustomId=${interaction.customId}`);
  const customId = interaction.customId;

  // ------------------- Handle Mount Name Modal -------------------
  if (customId.startsWith('mount-name-modal')) {
    console.info('[modalHandler]: Redirecting to handleMountNameSubmission.');
    await handleMountNameSubmission(interaction);
    return;
  }

  // ------------------- Handle Base Count Modal -------------------
  if (customId === 'baseCountModal') {
    const baseCount = parseInt(interaction.fields.getTextInputValue('baseCountInput'), 10) || 1;

    // Update the submission data in the store
    const userId = interaction.user.id;
    const submissionData = submissionStore.get(userId) || {};
    submissionData.characterCount = baseCount;
    submissionStore.set(userId, submissionData);

    await interaction.update({
      content: `☑️  **${baseCount} base(s)** selected. Select another base or click "Next Section ➡️" when you are done.`,
      components: [getBaseSelectMenu(true), getCancelButtonRow()]
    });
    return;
  }

  // ------------------- Handle Multiplier Count Modal -------------------
  if (customId === 'multiplierCountModal') {
    const multiplierCount = parseInt(interaction.fields.getTextInputValue('multiplierCountInput'), 10) || 1;

    const userId = interaction.user.id;
    const submissionData = submissionStore.get(userId) || {};
    submissionData.typeMultiplierCount = multiplierCount;
    submissionStore.set(userId, submissionData);

    await interaction.update({
      content: `☑️  **${multiplierCount} type multiplier(s)** selected. Select another Type Multiplier or click "Next Section ➡️" when you are done.`,
      components: [getTypeMultiplierMenu(true), getCancelButtonRow()]
    });
    return;
  }

  // ------------------- Handle Add-On Count Modal -------------------
  if (customId.startsWith('addOnCountModal_')) {
    const selectedAddOn = customId.split('_')[1];
    const addOnQuantity = parseInt(interaction.fields.getTextInputValue('addOnCountInput'), 10) || 1;

    const userId = interaction.user.id;
    const submissionData = submissionStore.get(userId) || {};

    // Ensure addOnsApplied is initialized
    submissionData.addOnsApplied = submissionData.addOnsApplied || [];
    submissionData.addOnsApplied = submissionData.addOnsApplied.filter(entry => typeof entry === 'object' && entry.addOn);

    // Update or add the selected add-on
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

    // Optional: Transition to Special Works menu if "Next Section ➡️" is selected
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
  if (customId.startsWith('specialWorksCountModal_')) {
    const specialWork = customId.split('_')[1];
    const specialWorkCount = parseInt(interaction.fields.getTextInputValue('specialWorksCountInput'), 10) || 1;

    const userId = interaction.user.id;
    const submissionData = submissionStore.get(userId) || {};

    // Ensure specialWorksApplied is initialized
    submissionData.specialWorksApplied = submissionData.specialWorksApplied || [];
    submissionData.specialWorksApplied.push({ work: specialWork, count: specialWorkCount });
    submissionStore.set(userId, submissionData);

    await interaction.update({
      content: `☑️ **${specialWorkCount} ${specialWork.replace(/([A-Z])/g, ' $1')}(s)** added. Select more or click "Complete ✅".`,
      components: [getSpecialWorksMenu(true), getCancelButtonRow()]
    });
  }
}

// ------------------- Modal Triggers -------------------
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

// Triggers a modal for selecting the number of Special Works
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
// Export all modal handling functions for external usage
module.exports = {
  handleModalSubmission,
  triggerBaseCountModal,
  triggerMultiplierCountModal,
  triggerAddOnCountModal,
  triggerSpecialWorksCountModal
};
