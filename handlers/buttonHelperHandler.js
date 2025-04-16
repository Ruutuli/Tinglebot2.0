// ------------------- Button Helper Handler -------------------
// Provides utility functions for common button components

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Cancel Button Row -------------------
function getCancelButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('cancel')
      .setLabel('❌ Cancel')
      .setStyle(ButtonStyle.Danger)
  );
}

// ------------------- Confirm Button Row -------------------
function getConfirmButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm')
      .setLabel('✅ Confirm')
      .setStyle(ButtonStyle.Success)
  );
}

module.exports = {
  getCancelButtonRow,
  getConfirmButtonRow,
};
