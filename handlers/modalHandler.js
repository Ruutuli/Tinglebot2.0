// ------------------- Discord.js Components -------------------
// Components from discord.js used for building modals and input rows.
const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// Custom modules for formatting and extended functionality.
const { capitalizeFirstLetter } = require('../modules/formattingModule');
const { handleError } = require('../utils/globalErrorHandler');


// ------------------- Utility Functions -------------------
// Generic helper utilities for menu creation and storage.
const { getAddOnsMenu, getBaseSelectMenu, getSpecialWorksMenu, getTypeMultiplierMenu } = require('../utils/menuUtils');
const { saveSubmissionToStorage, retrieveSubmissionFromStorage, findLatestSubmissionIdForUser } = require('../utils/storage');
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
    console.log(`[modalHandler.js]: 🔄 Checking for existing submission for user: ${userId}`);
    let submissionId = await findLatestSubmissionIdForUser(userId);
    if (submissionId) {
      console.log(`[modalHandler.js]: 🔄 Found existing submissionId: ${submissionId}`);
    }
    let submissionData = submissionId ? await retrieveSubmissionFromStorage(submissionId) : null;
    let isNewSubmission = false;
    // If no existing data or if this is a new base selection, create new submission
    if (!submissionData || customId === 'baseCountModal') {
      isNewSubmission = true;
      submissionId = submissionData?.submissionId || submissionId || generateSubmissionId();
      if (!submissionData?.submissionId && !submissionId) {
        submissionId = generateSubmissionId();
        console.log(`[modalHandler.js]: 🚀 Generating new submissionId: ${submissionId}`);
      } else {
        console.log(`[modalHandler.js]: 🔄 Reusing submissionId: ${submissionId}`);
      }
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
    }

    // Save the submission data using submissionId as the key
    console.log(`[modalHandler.js]: 💾 Saving submission: ${submissionId} for user: ${userId}`);
    await saveSubmissionToStorage(submissionData.submissionId, submissionData);

    // Handle different modal types
    if (customId.startsWith('baseCountModal_')) {
      const [_, baseSelection] = customId.split('_');
      const baseCount = parseInt(interaction.fields.getTextInputValue('baseCountInput'), 10);
      if (isNaN(baseCount) || baseCount < 1) {
        return interaction.reply({
          content: '❌ **Please enter a valid number greater than 0.**',
          ephemeral: true
        });
      }

      console.log('Processing base count for:', baseSelection);
      
      // Reset all counts when starting a new base selection
      submissionData.characterCount = baseCount;
      submissionData.typeMultiplierCounts = {};
      submissionData.addOnsApplied = [];
      submissionData.specialWorksApplied = [];
      submissionData.finalTokenAmount = 0;
      submissionData.tokenCalculation = null;
      
      // Always replace with the latest base selection
      submissionData.baseSelections = [baseSelection];
      
      // Save and update UI
      await saveSubmissionToStorage(submissionData.submissionId, submissionData);
      console.log('Base selection saved:', submissionData.baseSelections);
      
      await interaction.update({
        content: `☑️ **${baseCount} ${baseSelection}(s)** selected. Select another base or click "Next Section ➡️" when you are done.`,
        components: [getBaseSelectMenu(true), getCancelButtonRow()]
      });
    }
    else if (customId.startsWith('multiplierCountModal_')) {
      const [_, multiplierName] = customId.split('_');
      const multiplierCount = parseInt(interaction.fields.getTextInputValue('multiplierCountInput'), 10);
      if (isNaN(multiplierCount) || multiplierCount < 1) {
        return interaction.reply({
          content: '❌ **Please enter a valid number greater than 0.**',
          ephemeral: true
        });
      }
      submissionData.typeMultiplierCounts[multiplierName] = multiplierCount;
      
      // Save and update UI
      await saveSubmissionToStorage(submissionData.submissionId, submissionData);
      await interaction.update({
        content: `☑️ **${multiplierCount}** selected for the multiplier **${capitalizeFirstLetter(multiplierName)}**. Select another Type Multiplier or click "Next Section ➡️" when you are done.`,
        components: [getTypeMultiplierMenu(true), getCancelButtonRow()]
      });
    }
    else if (customId.startsWith('addOnCountModal_')) {
      const [__, addOnName] = customId.split('_');
      const addOnCount = parseInt(interaction.fields.getTextInputValue('addOnCountInput'), 10);
      if (isNaN(addOnCount) || addOnCount < 1) {
        return interaction.reply({
          content: '❌ **Please enter a valid number greater than 0.**',
          ephemeral: true
        });
      }
      const existingAddOn = submissionData.addOnsApplied.find(a => a.addOn === addOnName);
      if (existingAddOn) {
        existingAddOn.count = addOnCount;
      } else {
        submissionData.addOnsApplied.push({ addOn: addOnName, count: addOnCount });
      }
      
      // Save and update UI
      await saveSubmissionToStorage(submissionData.submissionId, submissionData);
      const addOnsMenu = getAddOnsMenu(true);
      await interaction.update({
        content: `☑️ **${addOnCount} ${addOnName}(s)** added. Select more add-ons or click "Next Section ➡️".`,
        components: [addOnsMenu, getCancelButtonRow()]
      });
    }
    else if (customId.startsWith('specialWorksCountModal_')) {
      const [___, specialWorkName] = customId.split('_');
      const specialWorksCount = parseInt(interaction.fields.getTextInputValue('specialWorksCountInput'), 10);
      if (isNaN(specialWorksCount) || specialWorksCount < 1) {
        return interaction.reply({
          content: '❌ **Please enter a valid number greater than 0.**',
          ephemeral: true
        });
      }
      const existingWork = submissionData.specialWorksApplied.find(w => w.work === specialWorkName);
      if (existingWork) {
        existingWork.count = specialWorksCount;
      } else {
        submissionData.specialWorksApplied.push({ work: specialWorkName, count: specialWorksCount });
      }
      
      // Calculate tokens and generate breakdown
      const { totalTokens, breakdown } = calculateTokens(submissionData);
      submissionData.finalTokenAmount = totalTokens;
      submissionData.tokenCalculation = breakdown;
      
      // Save and update UI
      await saveSubmissionToStorage(submissionData.submissionId, submissionData);
      await interaction.update({
        content: `☑️ **${specialWorksCount} ${specialWorkName.replace(/([A-Z])/g, ' $1')}(s)** added. Select more or click "Complete ✅".\n\n${breakdown}`,
        components: [getSpecialWorksMenu(true), getCancelButtonRow()]
      });
    }
    else {
      console.error(`[modalHandler.js]: ❌ Unknown modal type: ${customId}`);
      await interaction.reply({
        content: '❌ **An error occurred: Unknown modal type.**',
        ephemeral: true
      });
    }

  } catch (error) {
    console.error(`[modalHandler.js]: ❌ Error in handleModalSubmission: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied) {
      await interaction.reply({
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
    .setCustomId(`baseCountModal_${base}`)
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
