// ------------------- Discord.js Components -------------------
// Components from discord.js used for building modals and input rows.
const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// Custom modules for formatting and extended functionality.
const { capitalizeFirstLetter } = require('../modules/formattingModule');
const { handleError } = require('../utils/globalErrorHandler');


// ------------------- Utility Functions -------------------
// Generic helper utilities for menu creation and storage.
const { getAddOnsMenu, getBaseSelectMenu, getSpecialWorksMenu, getTypeMultiplierMenu } = require('../utils/menuUtils');
const { saveSubmissionToStorage, retrieveSubmissionFromStorage } = require('../utils/storage');
const { getCancelButtonRow } = require('./buttonHelperHandler');
const { calculateTokens, generateTokenBreakdown } = require('../utils/tokenUtils');


// ------------------- Handlers -------------------
// Custom handler functions for modal-related component interactions.
const { handleMountNameSubmission } = require('./mountComponentHandler');


// ------------------- Helper Functions -------------------
function generateSubmissionId() {
  return 'A' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
}


// ------------------- Modal Submission Handler -------------------
// Handles the interaction responses for modal submissions.
async function handleModalSubmission(interaction) {
  if (interaction.replied || interaction.deferred) return;

  const userId = interaction.user.id;
  const customId = interaction.customId;

  try {
    // Get existing submission data or create new
    let submissionData = await retrieveSubmissionFromStorage(userId);
    
    // If no existing data, create new submission
    if (!submissionData) {
      submissionData = {
        userId,
        submissionId: generateSubmissionId(),
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
    }

    // Handle different modal types
    switch (customId) {
      case 'baseCountModal':
        const baseCount = parseInt(interaction.components[0].components[0].value);
        if (isNaN(baseCount) || baseCount < 1) {
          return interaction.reply({
            content: '❌ **Please enter a valid number greater than 0.**',
            flags: 64
          });
        }
        submissionData.characterCount = baseCount;
        break;

      case 'multiplierCountModal':
        const [_, multiplierName] = customId.split('_');
        const multiplierCount = parseInt(interaction.components[0].components[0].value);
        if (isNaN(multiplierCount) || multiplierCount < 1) {
          return interaction.reply({
            content: '❌ **Please enter a valid number greater than 0.**',
            flags: 64
          });
        }
        submissionData.typeMultiplierCounts[multiplierName] = multiplierCount;
        break;

      case 'addOnCountModal':
        const [__, addOnName] = customId.split('_');
        const addOnCount = parseInt(interaction.components[0].components[0].value);
        if (isNaN(addOnCount) || addOnCount < 1) {
          return interaction.reply({
            content: '❌ **Please enter a valid number greater than 0.**',
            flags: 64
          });
        }
        const existingAddOn = submissionData.addOnsApplied.find(a => a.addOn === addOnName);
        if (existingAddOn) {
          existingAddOn.count = addOnCount;
        } else {
          submissionData.addOnsApplied.push({ addOn: addOnName, count: addOnCount });
        }
        break;

      case 'specialWorksCountModal':
        const [___, specialWorkName] = customId.split('_');
        const specialWorksCount = parseInt(interaction.components[0].components[0].value);
        if (isNaN(specialWorksCount) || specialWorksCount < 1) {
          return interaction.reply({
            content: '❌ **Please enter a valid number greater than 0.**',
            flags: 64
          });
        }
        const existingWork = submissionData.specialWorksApplied.find(w => w.work === specialWorkName);
        if (existingWork) {
          existingWork.count = specialWorksCount;
        } else {
          submissionData.specialWorksApplied.push({ work: specialWorkName, count: specialWorksCount });
        }
        break;
    }

    // Calculate tokens and generate breakdown
    const { totalTokens, breakdown } = calculateTokens(submissionData);
    submissionData.finalTokenAmount = totalTokens;
    submissionData.tokenCalculation = breakdown;
    submissionData.updatedAt = new Date();

    // Save updated submission data
    await saveSubmissionToStorage(submissionData.submissionId, submissionData);

    // Only show token calculation in the final confirmation
    if (customId === 'specialWorksCountModal') {
      await interaction.reply({
        content: `✅ **Count updated!**\n\n${breakdown}`,
        flags: 64
      });
    } else {
      await interaction.reply({
        content: '✅ **Count updated!**',
        flags: 64
      });
    }

  } catch (error) {
    console.error(`[modalHandler.js]: ❌ Error in handleModalSubmission: ${error.message}`);
    
    if (!interaction.replied) {
      await interaction.reply({
        content: '❌ **An error occurred while processing your submission.**',
        flags: 64
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
