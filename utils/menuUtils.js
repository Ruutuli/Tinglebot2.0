// ------------------- Menu Utilities -------------------
// Provides utility functions for generating select menus

// ------------------- Imports -------------------
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

const { handleError } = require('../utils/globalErrorHandler');
// ------------------- Base Selection Menu -------------------
function getBaseSelectMenu(showNextSection = false) {
  const baseOptions = [
    { label: 'Chibi (15 Tokens)', value: 'chibi' },
    { label: 'Headshot (10 Tokens)', value: 'headshot' },
    { label: 'Waist Up (15 Tokens)', value: 'waistup' },
    { label: 'Full Body (20 Tokens)', value: 'fullbody' },
    { label: 'Other (5 Tokens)', value: 'other' }
  ];

  if (showNextSection) {
    baseOptions.push({ label: 'Next Section ➡️', value: 'complete' });
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('baseSelect')
      .setPlaceholder('Select a base')
      .addOptions(baseOptions)
  );
}

// ------------------- Type Multiplier Menu -------------------
function getTypeMultiplierMenu(includeNext = false) {
  const typeOptions = [
    { label: 'Simple Creature (0.5x)', value: 'simple' },
    { label: 'Complex Creature (2x)', value: 'complex' },
    { label: 'Humanoid (1x)', value: 'humanoid' },
    { label: 'Anthro (1.5x)', value: 'anthro' },
    { label: 'Other (0.5x)', value: 'other' }
  ];

  if (includeNext) {
    typeOptions.push({ label: 'Next Section ➡️', value: 'complete' });
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('typeMultiplierSelect')
      .setPlaceholder('Select a type multiplier')
      .addOptions(typeOptions)
  );
}

// ------------------- Product Multiplier Menu -------------------
function getProductMultiplierMenu() {
  const productOptions = [
    { label: 'Sketch (0.5x)', value: 'sketch' },
    { label: 'Line Art (1x)', value: 'lineArt' },
    { label: 'Monochrome/Spot (2x)', value: 'monochrome' },
    { label: 'Flat Color (3x)', value: 'flatColor' },
    { label: 'Full Color (4x)', value: 'fullColor' },
    { label: 'Pixel (4x)', value: 'pixel' },
    { label: 'Painted (5x)', value: 'painted' }
  ];

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('productMultiplierSelect')
      .setPlaceholder('Select a product multiplier')
      .addOptions(productOptions)
      .setMaxValues(1)
      .setMinValues(1)
  );
}

// ------------------- Add-Ons Menu -------------------
function getAddOnsMenu(includeComplete = false) {
  const addOnOptions = [
    { label: 'Simple Prop (15 Tokens)', value: 'simpleProp' },
    { label: 'Complex Prop (20 Tokens)', value: 'complexProp' },
    { label: 'Simple Background (20 Tokens)', value: 'simpleBg' },
    { label: 'Complex Background (40 Tokens)', value: 'complexBg' }
  ];

  if (includeComplete) {
    addOnOptions.push({ label: 'Next Section ➡️', value: 'complete' });
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('addOnsSelect')
      .setPlaceholder('Select add-ons')
      .addOptions(addOnOptions)
      .setMaxValues(1)
  );
}


// ------------------- Special Works Menu -------------------
function getSpecialWorksMenu(includeComplete = false) {
  const specialWorkOptions = [
    { label: 'Comic: Simple Panel (10 Tokens)', value: 'comicSimple' },
    { label: 'Comic: Complex Panel (20 Tokens)', value: 'comicComplex' },
    { label: 'Animation: Simple Frame (10 Tokens)', value: 'frameSimple' },
    { label: 'Animation: Complex Frame (20 Tokens)', value: 'frameComplex' },
  ];

  if (includeComplete) {
    specialWorkOptions.push({ label: 'Complete ✅', value: 'complete' });
  }

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('specialWorksSelect')
      .setPlaceholder('Select special works')
      .addOptions(specialWorkOptions)
      .setMaxValues(1)
  );
}

// ------------------- Export Functions -------------------
module.exports = {
  getBaseSelectMenu,
  getTypeMultiplierMenu,
  getProductMultiplierMenu,
  getAddOnsMenu,
  getSpecialWorksMenu
};
