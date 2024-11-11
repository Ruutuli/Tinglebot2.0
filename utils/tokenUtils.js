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
  console.log("Submission state has been reset.");
}

// ------------------- Token Calculation -------------------
// Calculates the final token amount based on the selected base, character count, type multiplier, product multiplier, and add-ons
function calculateFinalTokens({ base, characterCount, typeMultiplier, productMultiplier, addOnsApplied }) {
  console.log('🧮 Calculating tokens...');
  
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
  const finalTokenAmount = Math.ceil(baseTotal * totalTypeMultiplier * productMultiplier + addOnTotal);

  console.log(`Final Token Amount: ${finalTokenAmount}`);

  return finalTokenAmount;
}

// ------------------- Log Current Token Calculation State -------------------
// Logs the current state of the token calculation for debugging purposes
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
  resetSubmissionState,    // Resets the submission state
  calculateFinalTokens,    // Calculates the final token amount
  logCurrentState          // Logs the current state of the token calculation
};
