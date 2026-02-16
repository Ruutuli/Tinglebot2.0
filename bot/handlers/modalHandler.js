// ------------------- Discord.js Components -------------------
// Components from discord.js used for building modals and input rows.
const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// Custom modules for formatting and extended functionality.
const { capitalizeFirstLetter } = require('../modules/formattingModule');
const { handleError } = require('@/utils/globalErrorHandler');


// ------------------- Utility Functions -------------------
// Generic helper utilities for menu creation and storage.
const { getAddOnsMenu, getBaseSelectMenu, getSpecialWorksMenu, getTypeMultiplierMenu } = require('@/utils/menuUtils');
const { 
  getOrCreateSubmission, 
  updateSubmissionData, 
  retrieveSubmissionFromStorage, 
  findLatestSubmissionIdForUser 
} = require('@/utils/storage');
const { getCancelButtonRow } = require('./buttonHelperHandler');
const { calculateTokens, generateTokenBreakdown } = require('@/utils/tokenUtils');


// ------------------- Handlers -------------------
// Custom handler functions for modal-related component interactions.
const { handleMountNameSubmission } = require('./mountComponentHandler');

// Secret Santa handler - Disabled outside December
// const { handleSecretSantaModal } = require('./secretSantaHandler');
const logger = require('@/utils/logger');


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
    // Secret Santa - Disabled outside December
    // Check if this is a Secret Santa modal
    if (customId.startsWith('secretsanta_')) {
      // Secret Santa disabled outside December - just return without handling
      logger.info('MODAL', 'Secret Santa modal interaction ignored (disabled outside December)');
      return;
      // return await handleSecretSantaModal(interaction);
    }

    // Get or create submission data using the new helper
    const { submissionId, submissionData } = await getOrCreateSubmission(userId);

    // Track updates to apply at the end
    let updates = {};

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

      // Update base counts for this specific base
      // Handle both Map objects and plain objects for baseCounts
      let currentBaseCounts;
      if (submissionData.baseCounts instanceof Map) {
        currentBaseCounts = submissionData.baseCounts;
      } else {
        // Convert plain object to Map if needed
        currentBaseCounts = new Map();
        if (submissionData.baseCounts) {
          Object.entries(submissionData.baseCounts).forEach(([key, value]) => {
            currentBaseCounts.set(key, value);
          });
        }
      }
      currentBaseCounts.set(baseSelection, baseCount);
      updates.baseCounts = currentBaseCounts;
      
      // Ensure the current base selection is included in the baseSelections array
      const currentSelections = submissionData.baseSelections || [];
      if (!currentSelections.includes(baseSelection)) {
        updates.baseSelections = [...currentSelections, baseSelection];
      }
      
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
      
      // Update the specific multiplier count
      const currentCounts = submissionData.typeMultiplierCounts || {};
      updates.typeMultiplierCounts = { ...currentCounts, [multiplierName]: multiplierCount };
      
      // Also update the typeMultiplierSelections array to include this multiplier
      const currentSelections = submissionData.typeMultiplierSelections || [];
      if (!currentSelections.includes(multiplierName)) {
        updates.typeMultiplierSelections = [...currentSelections, multiplierName];
      }
      
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
      
      // Update the specific add-on count
      const currentAddOns = submissionData.addOnsApplied || [];
      const filteredAddOns = currentAddOns.filter(a => a.addOn !== addOnName);
      updates.addOnsApplied = [...filteredAddOns, { addOn: addOnName, count: addOnCount }];
      
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
      
      // Check for comic/animation conflict
      const currentWorks = submissionData.specialWorksApplied || [];
      const hasComic = currentWorks.some(work => work.work.startsWith('comic'));
      const hasAnimation = currentWorks.some(work => work.work.startsWith('frame'));
      const isComic = specialWorkName.startsWith('comic');
      const isAnimation = specialWorkName.startsWith('frame');
      
      // Validate: Cannot have both comic and animation
      if ((hasComic && isAnimation) || (hasAnimation && isComic)) {
        return interaction.reply({
          content: '❌ **Cannot select both Comics and Animation.**\n\nYou can only choose either Comics OR Animation, not both. Please remove one type before adding the other.',
          ephemeral: true
        });
      }
      
      // Update the specific special work count
      const filteredWorks = currentWorks.filter(w => w.work !== specialWorkName);
      updates.specialWorksApplied = [...filteredWorks, { work: specialWorkName, count: specialWorksCount }];
      
      // Apply updates first
      if (Object.keys(updates).length > 0) {
        await updateSubmissionData(submissionId, updates);
      }

      // Get updated submission data
      const updatedSubmissionData = await retrieveSubmissionFromStorage(submissionId);
      
      // Calculate tokens and generate breakdown
      const { totalTokens, breakdown } = calculateTokens(updatedSubmissionData);
      
      // Generate the breakdown string
      const breakdownString = generateTokenBreakdown({
        baseSelections: updatedSubmissionData.baseSelections,
        baseCounts: updatedSubmissionData.baseCounts || new Map(),
        typeMultiplierSelections: updatedSubmissionData.typeMultiplierSelections,
        productMultiplierValue: updatedSubmissionData.productMultiplierValue,
        addOnsApplied: updatedSubmissionData.addOnsApplied,
        specialWorksApplied: updatedSubmissionData.specialWorksApplied,
        typeMultiplierCounts: updatedSubmissionData.typeMultiplierCounts,
        finalTokenAmount: totalTokens,
        collab: updatedSubmissionData.collab
      });
      
      // Update with final calculations
      await updateSubmissionData(submissionId, {
        finalTokenAmount: totalTokens,
        tokenCalculation: breakdownString
      });
      
      await interaction.update({
        content: `☑️ **${specialWorksCount} ${specialWorkName.replace(/([A-Z])/g, ' $1')}(s)** added. Select more or click "Complete ✅".\n\n${breakdownString}`,
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

    // Apply updates only if there are any
    if (Object.keys(updates).length > 0) {
      await updateSubmissionData(submissionId, updates);
      logger.success('SUBMISSION', `💾 Applied updates to submission: ${submissionId}`);
    }

  } catch (error) {
    console.error(`[modalHandler.js]: ❌ Error in handleModalSubmission: ${error.message}`);
    console.error(error.stack);
    
    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ **An error occurred while processing your submission. Please try again.**',
          ephemeral: true
        });
      } else if (interaction.replied) {
        await interaction.followUp({
          content: '❌ **An error occurred while processing your submission. Please try again.**',
          ephemeral: true
        });
      }
    } catch (replyError) {
      console.error(`[modalHandler.js]: ❌ Failed to send modal error response: ${replyError.message}`);
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

  try {
    await interaction.showModal(modal);
  } catch (err) {
    if (err.code === 10062) {
      console.warn(`[modalHandler.js]: ⚠️ Interaction expired (10062) - user took too long to select. They can try again.`);
    } else {
      throw err;
    }
  }
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

  try {
    await interaction.showModal(modal);
  } catch (err) {
    if (err.code === 10062) {
      console.warn(`[modalHandler.js]: ⚠️ Interaction expired (10062) - user took too long to select. They can try again.`);
    } else {
      throw err;
    }
  }
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

  try {
    await interaction.showModal(modal);
  } catch (err) {
    if (err.code === 10062) {
      console.warn(`[modalHandler.js]: ⚠️ Interaction expired (10062) - user took too long to select. They can try again.`);
    } else {
      throw err;
    }
  }
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

  try {
    await interaction.showModal(modal);
  } catch (err) {
    if (err.code === 10062) {
      console.warn(`[modalHandler.js]: ⚠️ Interaction expired (10062) - user took too long to select. They can try again.`);
    } else {
      throw err;
    }
  }
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
