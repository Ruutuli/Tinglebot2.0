// ------------------- Discord.js Components -------------------
// Components from discord.js used for building modals and input rows.
const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// Custom modules for formatting and extended functionality.
const { capitalizeFirstLetter } = require('../modules/formattingModule');


// ------------------- Utility Functions -------------------
// Generic helper utilities for menu creation and storage.
const { getAddOnsMenu, getBaseSelectMenu, getSpecialWorksMenu, getTypeMultiplierMenu } = require('../utils/menuUtils');
const { saveSubmissionToStorage, retrieveSubmissionFromStorage } = require('../utils/storage');
const { getCancelButtonRow } = require('./buttonHelperHandler');
const { calculateTokens, generateTokenBreakdown } = require('../utils/tokenUtils');


// ------------------- Handlers -------------------
// Custom handler functions for modal-related component interactions.
const { handleMountNameSubmission } = require('./mountComponentHandler');


// ------------------- Modal Submission Handler -------------------
// Handles the interaction responses for modal submissions.
async function handleModalSubmission(interaction) {
  try {
    // Verify this is a modal submission
    if (!interaction.isModalSubmit()) {
      console.error('[modalHandler.js]: ❌ Interaction is not a modal submission');
      return;
    }

    const customId = interaction.customId;
    const userId = interaction.user.id;

    // Get existing submission data or create new
    let submissionData = await retrieveSubmissionFromStorage(userId) || {
      userId,
      baseSelections: [],
      typeMultiplierSelections: [],
      typeMultiplierCounts: {},
      addOnsApplied: [],
      specialWorksApplied: [],
      characterCount: 1,
      productMultiplierValue: 'default'
    };

    // ------------------- Handle Mount Name Modal -------------------
    if (customId.startsWith('mount-name-modal')) {
      await handleMountNameSubmission(interaction);
      return;
    }

    // ------------------- Handle Base Count Modal -------------------
    if (customId === 'baseCountModal') {
      const baseCount = parseInt(interaction.components[0].components[0].value, 10) || 1;
      submissionData.characterCount = baseCount;
      
      // Calculate tokens after updating character count
      const { totalTokens, breakdown } = calculateTokens({
        baseSelections: submissionData.baseSelections,
        typeMultiplierSelections: submissionData.typeMultiplierSelections,
        productMultiplierValue: submissionData.productMultiplierValue,
        addOnsApplied: submissionData.addOnsApplied,
        characterCount: baseCount,
        typeMultiplierCounts: submissionData.typeMultiplierCounts,
        specialWorksApplied: submissionData.specialWorksApplied,
        collab: submissionData.collab
      });

      submissionData.finalTokenAmount = totalTokens;
      submissionData.tokenCalculation = generateTokenBreakdown({
        ...submissionData,
        finalTokenAmount: totalTokens
      });
      
      await saveSubmissionToStorage(userId, submissionData);
      
      await interaction.update({
        content: `☑️ **${baseCount} base(s)** selected. Select another base or click "Next Section ➡️" when you are done.\n\n${submissionData.tokenCalculation}`,
        components: [getBaseSelectMenu(true), getCancelButtonRow()]
      });
      return;
    }

    // ------------------- Handle Multiplier Count Modal -------------------
    if (customId.startsWith('multiplierCountModal_')) {
      const multiplierName = customId.split('_')[1];
      const multiplierCount = parseInt(interaction.components[0].components[0].value, 10) || 1;

      console.info(`[modalHandler]: Multiplier Count Modal - User: ${userId}, Multiplier: ${multiplierName}, Count: ${multiplierCount}`);

      submissionData.typeMultiplierCounts[multiplierName] = multiplierCount;
      
      // Calculate tokens after updating multiplier count
      const { totalTokens, breakdown } = calculateTokens({
        baseSelections: submissionData.baseSelections,
        typeMultiplierSelections: submissionData.typeMultiplierSelections,
        productMultiplierValue: submissionData.productMultiplierValue,
        addOnsApplied: submissionData.addOnsApplied,
        characterCount: submissionData.characterCount,
        typeMultiplierCounts: submissionData.typeMultiplierCounts,
        specialWorksApplied: submissionData.specialWorksApplied,
        collab: submissionData.collab
      });

      submissionData.finalTokenAmount = totalTokens;
      submissionData.tokenCalculation = generateTokenBreakdown({
        ...submissionData,
        finalTokenAmount: totalTokens
      });

      await saveSubmissionToStorage(userId, submissionData);

      await interaction.update({
        content: `☑️ **${multiplierCount}** selected for the multiplier **${capitalizeFirstLetter(multiplierName)}**. Select another Type Multiplier or click "Next Section ➡️" when you are done.\n\n${submissionData.tokenCalculation}`,
        components: [getTypeMultiplierMenu(true), getCancelButtonRow()]
      });
      return;
    }

    // ------------------- Handle Add-On Count Modal -------------------
    if (customId.startsWith('addOnCountModal_')) {
      const selectedAddOn = customId.split('_')[1];
      const addOnQuantity = parseInt(interaction.components[0].components[0].value, 10) || 1;

      // Ensure addOnsApplied is initialized and filter out any invalid entries
      submissionData.addOnsApplied = submissionData.addOnsApplied.filter(entry => typeof entry === 'object' && entry.addOn);

      // Update or add the selected add-on
      const existingAddOnIndex = submissionData.addOnsApplied.findIndex(entry => entry.addOn === selectedAddOn);
      if (existingAddOnIndex !== -1) {
        submissionData.addOnsApplied[existingAddOnIndex].count = addOnQuantity;
      } else {
        submissionData.addOnsApplied.push({ addOn: selectedAddOn, count: addOnQuantity });
      }
      
      // Calculate tokens after updating add-ons
      const { totalTokens, breakdown } = calculateTokens({
        baseSelections: submissionData.baseSelections,
        typeMultiplierSelections: submissionData.typeMultiplierSelections,
        productMultiplierValue: submissionData.productMultiplierValue,
        addOnsApplied: submissionData.addOnsApplied,
        characterCount: submissionData.characterCount,
        typeMultiplierCounts: submissionData.typeMultiplierCounts,
        specialWorksApplied: submissionData.specialWorksApplied,
        collab: submissionData.collab
      });

      submissionData.finalTokenAmount = totalTokens;
      submissionData.tokenCalculation = generateTokenBreakdown({
        ...submissionData,
        finalTokenAmount: totalTokens
      });
      
      await saveSubmissionToStorage(userId, submissionData);

      const addOnsMenu = getAddOnsMenu(true);
      await interaction.update({
        content: `☑️ **${addOnQuantity} ${selectedAddOn}(s)** added. Select more add-ons or click "Next Section ➡️".\n\n${submissionData.tokenCalculation}`,
        components: [addOnsMenu, getCancelButtonRow()]
      });

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
      const specialWorkCount = parseInt(interaction.components[0].components[0].value, 10) || 1;

      submissionData.specialWorksApplied.push({ work: specialWork, count: specialWorkCount });
      
      // Calculate tokens after updating special works
      const { totalTokens, breakdown } = calculateTokens({
        baseSelections: submissionData.baseSelections,
        typeMultiplierSelections: submissionData.typeMultiplierSelections,
        productMultiplierValue: submissionData.productMultiplierValue,
        addOnsApplied: submissionData.addOnsApplied,
        characterCount: submissionData.characterCount,
        typeMultiplierCounts: submissionData.typeMultiplierCounts,
        specialWorksApplied: submissionData.specialWorksApplied,
        collab: submissionData.collab
      });

      submissionData.finalTokenAmount = totalTokens;
      submissionData.tokenCalculation = generateTokenBreakdown({
        ...submissionData,
        finalTokenAmount: totalTokens
      });
      
      await saveSubmissionToStorage(userId, submissionData);

      await interaction.update({
        content: `☑️ **${specialWorkCount} ${specialWork.replace(/([A-Z])/g, ' $1')}(s)** added. Select more or click "Complete ✅".\n\n${submissionData.tokenCalculation}`,
        components: [getSpecialWorksMenu(true), getCancelButtonRow()]
      });
    }
  } catch (error) {
    console.error('[modalHandler.js]: ❌ Error handling modal submission:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ **An error occurred while processing your submission. Please try again.**',
        ephemeral: true
      });
    } else {
      await interaction.editReply({
        content: '❌ **An error occurred while processing your submission. Please try again.**',
        ephemeral: true
      });
    }
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
