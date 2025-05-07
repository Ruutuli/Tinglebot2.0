// ------------------- Token Utilities -------------------
// This module provides utility functions for token calculations and
// submission state management for a streamlined workflow.

// ------------------- Imports -------------------
// Modules for token calculations and formatting
const artModule = require('../modules/artModule');
const { capitalizeFirstLetter } = require('../modules/formattingModule');


// ------------------- Global Variables -------------------
// Variables for managing the state of token calculations
let finalTokenAmount = 0;
let submissionBreakdown = '';
let characterCount = 1;
let addOnsApplied = [];
let currentMultiplier = 1;
let currentProductMultiplier = 1;
let baseSelection = '';
let specialWorksApplied = [];

// ------------------- Reset Submission State -------------------
// Resets the state of the token submission process
function resetSubmissionState() {
  finalTokenAmount = 0;
  submissionBreakdown = '';
  characterCount = 1;
  addOnsApplied = [];
  currentMultiplier = 1;
  currentProductMultiplier = 1;
  baseSelection = '';
  specialWorksApplied = [];
}

// ------------------- Calculate Tokens -------------------
// Calculates the total tokens based on user selections and configurations
function calculateTokens({
  baseSelections = [],
  typeMultiplierSelections = [],
  productMultiplierValue,
  addOnsApplied = [],
  characterCount = 1,
  typeMultiplierCounts = {}, // Include multiplier counts
  specialWorksApplied = [],
  collab = null, // Add collab as a parameter
}) {
  const validCharacterCount = characterCount || 1;

  // Base Token Calculation
  const baseTotal = baseSelections.reduce((total, base) => {
    const baseValue = artModule.baseTokens[base] || 0;
    return total + baseValue * validCharacterCount;
  }, 0);

  // Type Multiplier Calculation
  const typeMultiplierTotal = typeMultiplierSelections.reduce((sum, multiplier) => {
    const multiplierValue = artModule.typeMultipliers[multiplier] || 1;
    const count = typeMultiplierCounts[multiplier] || 1; // Default to 1 if no count is provided
    return sum + multiplierValue * count; // Sum values considering individual counts
  }, 0);

  // Product Multiplier Calculation
  const productMultiplier = artModule.productMultipliers[productMultiplierValue] || 1;

  // Add-Ons Calculation
  const addOnTotal = addOnsApplied
    .filter(({ addOn, count }) => addOn && count > 0)
    .reduce((total, { addOn, count }) => {
      const addOnValue = artModule.addOns[addOn] || 0;
      return total + addOnValue * count;
    }, 0);

  // Special Works Calculation
  const specialWorksTotal = specialWorksApplied.reduce((total, { work, count }) => {
    const workValue = artModule.specialWorks[work] || 0;
    return total + workValue * (count || 1);
  }, 0);

  // Regular Total Calculation
  const regularTotal = Math.ceil(baseTotal * typeMultiplierTotal * productMultiplier + addOnTotal);

  // Final Token Calculation
  const totalTokens = regularTotal + specialWorksTotal;

  return {
    totalTokens,
    splitTokens: collab ? totalTokens / 2 : totalTokens, // Split if collaborator exists
    breakdown: {
      baseTotal,
      typeMultiplierTotal,
      productMultiplier,
      addOnTotal,
      specialWorksTotal,
      regularTotal,
      finalTotal: totalTokens,
    },
  };
}

// ------------------- Generate Token Breakdown -------------------
// Generates a detailed breakdown of the token calculations
function generateTokenBreakdown({
  baseSelections = [],
  typeMultiplierSelections = [],
  productMultiplierValue,
  addOnsApplied = [],
  specialWorksApplied = [],
  characterCount = 1,
  typeMultiplierCounts = {}, // Add typeMultiplierCounts here
  finalTokenAmount,
  collab = null, // Add collab parameter
}) {
  const baseSection = baseSelections
    .map(base => {
      const baseValue = artModule.baseTokens[base] || 0;
      return `${capitalizeFirstLetter(base)} (${baseValue} × ${characterCount}) = ${baseValue * characterCount}`;
    })
    .join(' x ');

  const typeMultiplierSection = typeMultiplierSelections
    .map(multiplier => {
      const multiplierValue = artModule.typeMultipliers[multiplier] || 1;
      const count = typeMultiplierCounts[multiplier] || 1;
      return `${capitalizeFirstLetter(multiplier)} (${multiplierValue} × ${count}) = ${multiplierValue * count}`;
    })
    .join(' + ');

  const productMultiplierLabel = capitalizeFirstLetter(productMultiplierValue) || 'Default';
  const productMultiplierValueFinal = artModule.productMultipliers[productMultiplierValue] || 1;

  const addOnSection = addOnsApplied
    .filter(({ addOn, count }) => addOn && count > 0)
    .map(({ addOn, count }) => {
      const addOnValue = artModule.addOns[addOn] || 0;
      return `+ ${capitalizeFirstLetter(addOn)} (${addOnValue} × ${count}) = ${addOnValue * count}`;
    })
    .join('\n');

  const specialWorksSection = specialWorksApplied
    .filter(({ work, count }) => work && count > 0 && artModule.specialWorks[work])
    .map(({ work, count }) => {
      const workValue = artModule.specialWorks[work];
      return `+ ${capitalizeFirstLetter(work)} (${workValue} × ${count}) = ${workValue * count}`;
    })
    .join('\n');

  // Construct the breakdown
  let breakdown = '```\n';

  if (baseSection) breakdown += ` ${baseSection}\n`;
  if (typeMultiplierSection) breakdown += `× (${typeMultiplierSection})\n`;
  breakdown += `× ${productMultiplierLabel} (${productMultiplierValueFinal})\n`;
  if (addOnSection) breakdown += `${addOnSection}\n`;
  if (specialWorksSection) breakdown += `${specialWorksSection}\n`;
  breakdown += `\n---------------------\n`;
  breakdown += `= ${finalTokenAmount} Tokens\n`;
  if (collab) breakdown += `\nCollab Total Each: ${Math.floor(finalTokenAmount / 2)} Tokens\n`;
  breakdown += '```';

  return breakdown;
}



// ------------------- Calculate Writing Tokens -------------------
// Calculates tokens for writing submissions based on word count
function calculateWritingTokens(wordCount) {
  return Math.round(wordCount / 100 * 10); // 10 tokens per 100 words
}

// ------------------- Handle Token Errors -------------------
// Provides consistent error handling and user guidance for token-related issues
function handleTokenError(error, interaction) {
  // Only log actual system errors, not user-facing errors
  if (!error.message.includes('Invalid URL') && 
      !error.message.includes('permission') && 
      !error.message.includes('404') && 
      !error.message.includes('headers')) {
    console.error('[tokenUtils.js]: System error:', error);
  }

  let errorMessage = '';
  let guideMessage = '';

  if (error.message.includes('Invalid URL')) {
    errorMessage = '❌ Your token tracker link is not set up correctly.';
    guideMessage = '📝 **Quick Guide:**\n1. Use `/tokens tokentrackerlink` to set up your tracker\n2. Make sure to use a valid Google Sheets URL';
  } else if (error.message.includes('permission')) {
    errorMessage = '❌ The bot cannot access your token tracker.';
    guideMessage = '📝 **Quick Guide:**\n1. Share your sheet with: `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`\n2. Make sure to give **edit** permissions';
  } else if (error.message.includes('404')) {
    errorMessage = '❌ Your token tracker sheet or tab is missing.';
    guideMessage = '📝 **Quick Guide:**\n1. Make sure you have a tab named `loggedTracker`\n2. Check that your sheet URL is correct';
  } else if (error.message.includes('headers')) {
    errorMessage = '❌ Your token tracker is missing required headers.';
    guideMessage = '📝 **Quick Guide:**\n1. Add these headers in cells B7:F7:\n`SUBMISSION | LINK | CATEGORIES | TYPE | TOKEN AMOUNT`';
  } else {
    errorMessage = '❌ An error occurred with your token tracker.';
    guideMessage = '📝 **Quick Guide:**\n1. Use `/tokens test` to check your setup\n2. If issues persist, try setting up a new tracker';
  }

  return {
    errorMessage,
    guideMessage,
    fullMessage: `${errorMessage}\n\n${guideMessage}\n\n💡 Need more help? Use \`/tokens test\` to verify your setup.`
  };
}

// ------------------- Exported Functions -------------------
// Exporting the unified `calculateTokens` and other utility functions.
module.exports = {
  resetSubmissionState,
  calculateTokens,
  calculateWritingTokens,
  generateTokenBreakdown,
  handleTokenError,
};
