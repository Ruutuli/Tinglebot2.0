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
  // ------------------- Validation -------------------
  const validCharacterCount = characterCount || 1; // Default to 1 if not provided
  const validBase = Array.isArray(baseSelections) ? baseSelections : [];
  const validTypeMultiplier = Array.isArray(typeMultiplierSelections)
    ? typeMultiplierSelections.reduce((total, multiplier) => total + (artModule.typeMultipliers[multiplier] || 1), 0) // Sum of type multipliers
    : 1;
  const validProductMultiplier = artModule.productMultipliers[productMultiplierValue] || 1; // Ensure it's fetched from artModule

 // ------------------- Token Calculation -------------------
  // Base total
  const baseTotal = validBase.reduce((total, base) => {
    const baseAmount = artModule.baseTokens[base] || 0; // Fetch value from artModule
    return total + baseAmount;
  }, 0) * validCharacterCount;

  // Add-on total
  const addOnTotal = addOnsApplied.reduce(
    (total, addOn) => total + ((artModule.addOns[addOn] || 0) * validCharacterCount), // Fetch add-on values
    0
  );

  // PEMDAS: Multiply base total by (1 + type multiplier), then by product multiplier
  const totalTokens = Math.ceil(baseTotal * (validTypeMultiplier || 1) * validProductMultiplier + addOnTotal);

  return {
    totalTokens: isNaN(totalTokens) ? 0 : totalTokens, // Fallback to 0 if invalid
  };
}

// ------------------- Generate Token Breakdown -------------------
function generateTokenBreakdown({ baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount, finalTokenAmount }) {
  const formatSection = (selections, multiplier) =>
    selections
      .map(selection => `${capitalizeFirstLetter(selection)} (${multiplier[selection] || 1} × ${characterCount})`)
      .join(' x ');

  const baseSection = formatSection(baseSelections, artModule.baseTokens);
  const typeMultiplierSection = formatSection(typeMultiplierSelections, artModule.typeMultipliers);
  const addOnSection = addOnsApplied
    .map(addOn => `+ ${capitalizeFirstLetter(addOn)} (${artModule.addOns[addOn] || 0} × ${characterCount})`)
    .join('\n');

  // Fetch a label for the product multiplier
  const productMultiplierLabel = capitalizeFirstLetter(productMultiplierValue) || 'Fullcolor';

  const breakdown = `
${baseSection}
${typeMultiplierSection.length > 0 ? '× ' + typeMultiplierSection : ''}
× ${productMultiplierLabel} (${artModule.productMultipliers[productMultiplierValue] || 1} × 1)
${addOnSection.length > 0 ? addOnSection : ''}
---------------------
= ${finalTokenAmount} Tokens
`.trim();

  return `\`\`\`\n${breakdown}\n\`\`\``;
}


// ------------------- Exported Functions -------------------
// Exporting the unified `calculateTokens` and other utility functions.
module.exports = {
  resetSubmissionState,
  calculateTokens, 
  generateTokenBreakdown, 
};