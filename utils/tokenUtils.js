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


// ------------------- Token Calculation -------------------
// Calculates tokens based on submission data
function calculateTokens(data) {
  const { baseSelections, typeMultiplierSelections, productMultiplierValue, addOnsApplied, characterCount } = data;

  let totalTokens = 0;
  const breakdown = [];

  // Example token calculations
  baseSelections.forEach((base) => {
      const baseTokens = 10; // Example value
      totalTokens += baseTokens;
      breakdown.push(`Base: ${base} - ${baseTokens} tokens`);
  });

  typeMultiplierSelections.forEach((type) => {
      const multiplierTokens = 5; // Example value
      totalTokens += multiplierTokens;
      breakdown.push(`Type Multiplier: ${type} - ${multiplierTokens} tokens`);
  });

  if (productMultiplierValue > 1) {
      const productTokens = productMultiplierValue * 2; // Example multiplier
      totalTokens += productTokens;
      breakdown.push(`Product Multiplier: x${productMultiplierValue} - ${productTokens} tokens`);
  }

  addOnsApplied.forEach((addon) => {
      const addonTokens = 3; // Example value
      totalTokens += addonTokens;
      breakdown.push(`Add-On: ${addon} - ${addonTokens} tokens`);
  });

  totalTokens += characterCount * 1; // Example: 1 token per character
  breakdown.push(`Character Count: ${characterCount} - ${characterCount * 1} tokens`);

  return {
      totalTokens,
      breakdown: breakdown.join('\n'), // Format breakdown as a single string
  };
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
  resetSubmissionState,    
  calculateFinalTokens,   
  calculateTokens , 
  logCurrentState         
};
