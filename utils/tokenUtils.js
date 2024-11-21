// ------------------- Token Utilities -------------------
// Provides utility functions for token calculation and state management

// ------------------- Imports -------------------
// Import the art module, which contains token values for base, multipliers, and add-ons
const artModule = require('../modules/artModule');

// ------------------- Global Variables -------------------
// Variables to track the state of the token calculation and submission process
let finalTokenAmount = 0;
let submissionBreakdown = '';
let characterCount = 1;
let addOnsApplied = [];
let currentMultiplier = 1;
let currentProductMultiplier = 1;
let baseSelection = '';

// ------------------- Reset Submission State -------------------
// Resets all submission-related variables to their default values
function resetSubmissionState() {
  finalTokenAmount = 0;
  submissionBreakdown = '';
  characterCount = 1;
  addOnsApplied = [];
  currentMultiplier = 1;
  currentProductMultiplier = 1;
  baseSelection = '';
}

// ------------------- Calculate Final Tokens -------------------
// Calculates the final token amount based on the selected base, character count, type multiplier, product multiplier, and add-ons
function calculateFinalTokens({ base, characterCount, typeMultiplier, productMultiplier, addOnsApplied }) {
  // Calculate the base token amount for all selected bases, multiplied by the character count
  const baseTotal = base.reduce((total, base) => {
    const baseAmount = artModule.baseTokens[base] || 0;
    return total + baseAmount;
  }, 0) * characterCount;

  // Calculate the total type multiplier
  const totalTypeMultiplier = Array.isArray(typeMultiplier)
    ? typeMultiplier.reduce((total, multiplier) => total + multiplier, 0)
    : typeMultiplier;

  // Calculate the total token amount for all selected add-ons
  const addOnTotal = addOnsApplied.reduce(
    (total, addOn) => total + ((artModule.addOns[addOn] || 0) * characterCount),
    0
  );

  // Calculate the final token amount using the base total, type multiplier, product multiplier, and add-ons
  return Math.ceil(baseTotal * totalTypeMultiplier * productMultiplier + addOnTotal);
}

// ------------------- Calculate Tokens -------------------
// Calculates tokens based on submission data and generates a breakdown
function calculateTokens(data) {
  const { baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount } = data;

  let totalTokens = 0;
  const breakdown = [];

  // Calculate tokens for base selections
  baseSelections.forEach((base) => {
    const baseTokens = artModule.baseTokens[base] || 0;
    totalTokens += baseTokens * characterCount;
    breakdown.push(`Base: ${base} - ${baseTokens * characterCount} tokens`);
  });

  // Calculate tokens for type multipliers
  typeMultiplierSelections.forEach((type) => {
    const multiplierTokens = artModule.typeMultipliers[type] || 0;
    totalTokens += multiplierTokens * characterCount;
    breakdown.push(`Type Multiplier: ${type} - ${multiplierTokens * characterCount} tokens`);
  });

  // Calculate tokens for product multiplier
  const productTokens = productMultiplierValue * characterCount;
  totalTokens += productTokens;
  breakdown.push(`Product Multiplier: x${productMultiplierValue} - ${productTokens} tokens`);

  // Calculate tokens for add-ons
  addOnsApplied.forEach((addon) => {
    const addonTokens = artModule.addOns[addon] || 0;
    totalTokens += addonTokens * characterCount;
    breakdown.push(`Add-On: ${addon} - ${addonTokens * characterCount} tokens`);
  });

  // Final breakdown and total tokens
  return {
    totalTokens,
    breakdown: breakdown.join('\n'), // Format breakdown as a single string
  };
}

// ------------------- Process Submission Token Calculation -------------------
// Processes token calculation logic based on submission data
function processSubmissionTokenCalculation(submissionData) {
  const { baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount } = submissionData;

  const finalTokenAmount = calculateFinalTokens({
    base: baseSelections,
    characterCount,
    typeMultiplier: typeMultiplierSelections,
    productMultiplier: productMultiplierValue,
    addOnsApplied,
  });

  const tokenCalculation = generateTokenBreakdown({
    ...submissionData,
    finalTokenAmount,
  });

  return {
    tokenCalculation,
    finalTokenAmount,
  };
}

// ------------------- Generate Token Breakdown -------------------
// Generates a formatted token breakdown based on submission data
function generateTokenBreakdown({ baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount, finalTokenAmount }) {
  const breakdown = `
${baseSelections.map(base => `${capitalizeFirstLetter(base)} (15 × ${characterCount})`).join('\n')}
× ${typeMultiplierSelections.map(multiplier => `${capitalizeFirstLetter(multiplier)} (1.5 × ${characterCount})`).join('\n× ')}
× Fullcolor (${productMultiplierValue} × 1)
${addOnsApplied.length > 0 ? addOnsApplied.map(addOn => `+ ${capitalizeFirstLetter(addOn)} (1.5 × 1)`).join('\n') : ''}
---------------------
= ${finalTokenAmount} Tokens
`.trim();

  return `\`\`\`\n${breakdown}\n\`\`\``;
}

// ------------------- Log Current State -------------------
// Logs the current state of token calculations for debugging purposes
function logCurrentState() {
  console.log('--- Current Token Calculation State ---');
  console.log(`Base: ${baseSelection}`);
  console.log(`Character Count: ${characterCount}`);
  console.log(`Type Multiplier: ${currentMultiplier}`);
  console.log(`Product Multiplier: ${currentProductMultiplier}`);
  console.log(`Add-Ons Applied: ${addOnsApplied.join(', ')}`);
  console.log('---------------------------------------');
}

// ------------------- Exported Functions -------------------
// Exporting all functions for use in other modules
module.exports = {
  resetSubmissionState,
  calculateFinalTokens,
  calculateTokens,
  processSubmissionTokenCalculation,
  generateTokenBreakdown,
  logCurrentState,
};
