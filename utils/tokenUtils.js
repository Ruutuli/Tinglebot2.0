// ------------------- Token Utilities -------------------
// This module provides utility functions for token calculations and
// submission state management for a streamlined workflow.

// ------------------- Imports -------------------
// Import necessary modules for token calculations and formatting
const artModule = require('../modules/artModule');
const { capitalizeFirstLetter } = require('../modules/formattingModule');

// ------------------- Global Variables -------------------
let finalTokenAmount = 0;
let submissionBreakdown = '';
let characterCount = 1;
let addOnsApplied = [];
let currentMultiplier = 1;
let currentProductMultiplier = 1;
let baseSelection = '';

// ------------------- Reset Submission State -------------------
function resetSubmissionState() {
  finalTokenAmount = 0;
  submissionBreakdown = '';
  characterCount = 1;
  addOnsApplied = [];
  currentMultiplier = 1;
  currentProductMultiplier = 1;
  baseSelection = '';
}

// ------------------- Calculate Tokens -------------------
function calculateTokens({ baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount }) {
  const validCharacterCount = characterCount || 1;

  // Structure to track counts for each selection
  const baseCounts = baseSelections.reduce((acc, base) => {
      acc[base] = (acc[base] || 0) + 1;
      return acc;
  }, {});

  const typeMultiplierCounts = typeMultiplierSelections.reduce((acc, multiplier) => {
      acc[multiplier] = (acc[multiplier] || 0) + 1;
      return acc;
  }, {});

  const validProductMultiplier = artModule.productMultipliers[productMultiplierValue] || 1;

  // Calculate base total, accounting for counts and character multiplier
  const baseTotal = Object.entries(baseCounts).reduce((total, [base, count]) => {
      const baseValue = artModule.baseTokens[base] || 0;
      return total + (baseValue * count * validCharacterCount);
  }, 0);

  // Calculate type multiplier total
  const typeMultiplierTotal = Object.entries(typeMultiplierCounts).reduce((total, [multiplier, count]) => {
      const multiplierValue = artModule.typeMultipliers[multiplier] || 1;
      return total + (multiplierValue * count * validCharacterCount);
  }, 0);

  // Calculate add-on total
  const addOnTotal = addOnsApplied.reduce((total, addOn) => {
      const addOnValue = artModule.addOns[addOn] || 0;
      return total + (addOnValue * validCharacterCount);
  }, 0);

  // Apply multipliers (base * typeMultiplier * productMultiplier)
  const totalTokens = Math.ceil((baseTotal * (typeMultiplierTotal || 1)) * validProductMultiplier + addOnTotal);

  return {
      totalTokens: isNaN(totalTokens) ? 0 : totalTokens,
  };
}



// ------------------- Generate Token Breakdown -------------------
function generateTokenBreakdown({ baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount, finalTokenAmount }) {
  const baseCounts = baseSelections.reduce((acc, base) => {
      acc[base] = (acc[base] || 0) + 1;
      return acc;
  }, {});

  const typeMultiplierCounts = typeMultiplierSelections.reduce((acc, multiplier) => {
      acc[multiplier] = (acc[multiplier] || 0) + 1;
      return acc;
  }, {});

  const baseSection = Object.entries(baseCounts)
      .map(([base, count]) => `${capitalizeFirstLetter(base)} (${artModule.baseTokens[base] || 0} × ${count})`)
      .join(' x ');

  const typeMultiplierSection = Object.entries(typeMultiplierCounts)
      .map(([multiplier, count]) => `${capitalizeFirstLetter(multiplier)} (${artModule.typeMultipliers[multiplier] || 1} × ${count})`)
      .join(' x ');

  const addOnSection = addOnsApplied
      .map(addOn => `+ ${capitalizeFirstLetter(addOn)} (${artModule.addOns[addOn] || 0} × ${characterCount})`)
      .join('\n');

  const productMultiplierLabel = capitalizeFirstLetter(productMultiplierValue) || 'Fullcolor';

  return `
\`\`\`
${baseSection}
${typeMultiplierSection.length > 0 ? '× ' + typeMultiplierSection : ''}
× ${productMultiplierLabel} (${artModule.productMultipliers[productMultiplierValue] || 1} × 1)
${addOnSection.length > 0 ? addOnSection : ''}
---------------------
= ${finalTokenAmount} Tokens
\`\`\`
  `.trim();
}


// ------------------- Calculate Writing Tokens -------------------
function calculateWritingTokens(wordCount) {
  return Math.round(wordCount / 100 * 10); // 10 tokens per 100 words
}

// ------------------- Exported Functions -------------------
// Exporting the unified `calculateTokens` and other utility functions.
module.exports = {
  resetSubmissionState,
  calculateTokens, 
  calculateWritingTokens,
  generateTokenBreakdown, 
};