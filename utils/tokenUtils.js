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
function calculateTokens({
  baseSelections,
  typeMultiplierSelections,
  productMultiplierValue,
  addOnsApplied,
  characterCount,
  typeMultiplierCount = 1, // Use the correct count value
}) {
  const validCharacterCount = characterCount || 1;

  const baseTotal = baseSelections.reduce((total, base) => {
    const baseValue = artModule.baseTokens[base] || 0;
    return total + baseValue * validCharacterCount;
  }, 0);

  // Adjust typeMultiplierTotal to sum multipliers instead of multiplying them
  const typeMultiplierTotal = typeMultiplierSelections.reduce((sum, multiplier) => {
    const multiplierValue = artModule.typeMultipliers[multiplier] || 1;
    return sum + (multiplierValue * typeMultiplierCount); // Sum multiplier values
  }, 0);

  const validProductMultiplier = artModule.productMultipliers[productMultiplierValue] || 1;

  const addOnTotal = addOnsApplied.reduce((total, addOn) => {
    const addOnValue = artModule.addOns[addOn] || 0;
    return total + addOnValue * validCharacterCount;
  }, 0);

  // Correct total token calculation
  const totalTokens = Math.ceil(baseTotal * typeMultiplierTotal * validProductMultiplier + addOnTotal);

  return {
    totalTokens: isNaN(totalTokens) ? 0 : totalTokens,
  };
}

// ------------------- Generate Token Breakdown -------------------
function generateTokenBreakdown({
  baseSelections,
  typeMultiplierSelections,
  productMultiplierValue,
  addOnsApplied,
  characterCount,
  typeMultiplierCount,
  finalTokenAmount,
}) {
  const baseSection = baseSelections
    .map(base => {
      const baseValue = artModule.baseTokens[base] || 0;
      return `${capitalizeFirstLetter(base)} (${baseValue} × ${characterCount || 1}) = ${baseValue * (characterCount || 1)}`;
    })
    .join(' x ');

  const typeMultiplierSection = typeMultiplierSelections
    .map(multiplier => {
      const multiplierValue = artModule.typeMultipliers[multiplier] || 1;
      return `${capitalizeFirstLetter(multiplier)} (${multiplierValue} × ${typeMultiplierCount}) = ${multiplierValue * typeMultiplierCount}`;
    })
    .join(' + '); // Adjust to use '+' to reflect summed multipliers

  const productMultiplierLabel = capitalizeFirstLetter(productMultiplierValue) || 'Fullcolor';
  const productMultiplierValueFinal = artModule.productMultipliers[productMultiplierValue] || 1;

  const addOnSection = addOnsApplied
    .map(addOn => {
      const addOnValue = artModule.addOns[addOn] || 0;
      return `+ ${capitalizeFirstLetter(addOn)} (${addOnValue} × ${characterCount}) = ${addOnValue * (characterCount || 1)}`;
    })
    .join('\n');

  return `
\`\`\`
${baseSection}
${typeMultiplierSection.length > 0 ? '× (' + typeMultiplierSection + ')' : ''}
× ${productMultiplierLabel} (${productMultiplierValueFinal})
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
