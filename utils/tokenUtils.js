// ------------------- Token Utilities -------------------
// This module provides utility functions for token calculations and
// submission state management for a streamlined workflow.

// ------------------- Imports -------------------
// Modules for token calculations and formatting
const artModule = require('../modules/artModule');
const { capitalizeFirstLetter } = require('../modules/formattingModule');
const { EmbedBuilder } = require('discord.js');


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
        !error.message.includes('headers') &&
        !error.message.includes('No \'earned\' entries found') &&
        !error.message.includes('Invalid sheet format')) {
        console.error('[tokenUtils.js]: ❌ System error:', error);
    }

    let errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTimestamp();

    if (error.message.includes('Invalid URL')) {
        errorEmbed
            .setTitle('❌ Invalid Token Tracker Link')
            .setDescription('Your token tracker link is not set up correctly.')
            .addFields(
                { name: '📝 Quick Guide', value: '1. Use `/tokens setup` to set up your tracker\n2. Make sure to use a valid Google Sheets URL' }
            )
            .setFooter({ text: 'Need more help? Use /tokens setup to verify your setup' });
    } else if (error.message.includes('permission')) {
        errorEmbed
            .setTitle('❌ Access Denied')
            .setDescription('The bot cannot access your token tracker.')
            .addFields(
                { name: '📝 Quick Guide', value: '1. Share your sheet with: `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`\n2. Make sure to give **edit** permissions' }
            )
            .setFooter({ text: 'Need more help? Use /tokens setup to verify your setup' });
    } else if (error.message.includes('404')) {
        errorEmbed
            .setTitle('❌ Missing Sheet or Tab')
            .setDescription('Your token tracker sheet or tab is missing.')
            .addFields(
                { name: '📝 Quick Guide', value: '1. Make sure you have a tab named `loggedTracker`\n2. Check that your sheet URL is correct' }
            )
            .setFooter({ text: 'Need more help? Use /tokens setup to verify your setup' });
    } else if (error.message.includes('headers')) {
        errorEmbed
            .setTitle('❌ Missing Required Headers')
            .setDescription('Your token tracker is missing required headers.')
            .addFields(
                { name: '📝 Quick Guide', value: '1. Add these headers in cells B7:F7:\n`SUBMISSION | LINK | CATEGORIES | TYPE | TOKEN AMOUNT`' }
            )
            .setFooter({ text: 'Need more help? Use /tokens setup to verify your setup' });
    } else if (error.message.includes('No \'earned\' entries found')) {
        errorEmbed
            .setTitle('❌ No Earned Entries')
            .setDescription('No earned entries found in your token tracker.')
            .addFields(
                { name: '📝 Quick Guide', value: '1. Add at least one entry with type "earned" in column E:\n```\nSUBMISSION | LINK | CATEGORIES | TYPE   | TOKEN AMOUNT\nArtwork   | URL  | Art        | earned | 100\n```\n\n2. Make sure your sheet has these headers in row 7 (B7:F7):\n```\nSUBMISSION | LINK | CATEGORIES | TYPE | TOKEN AMOUNT\n```\n\n3. Share your sheet with: `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`\n4. Make sure you have a tab named exactly `loggedTracker`\n5. Use `/tokens setup` to verify your setup' }
            )
            .setFooter({ text: 'Need more help? Use /tokens setup to verify your setup' });
    } else if (error.message.includes('Unknown interaction')) {
        errorEmbed
            .setTitle('❌ Interaction Expired')
            .setDescription('The interaction has expired.')
            .addFields(
                { name: '📝 Quick Guide', value: '1. Please try the command again\n2. Make sure to respond within 3 seconds' }
            )
            .setFooter({ text: 'Need more help? Use /tokens setup to verify your setup' });
    } else {
        errorEmbed
            .setTitle('❌ Token Tracker Error')
            .setDescription('An error occurred with your token tracker!')
            .addFields(
                { 
                    name: '📝 Required Headers', 
                    value: 'Make sure your sheet has these headers in row 7 (B7:F7):\n```\nSUBMISSION | LINK | CATEGORIES | TYPE | TOKEN AMOUNT\n```',
                    inline: false 
                },
                { 
                    name: '📋 Example Entry', 
                    value: 'Add at least one entry with type "earned" in column E:\n```\nSUBMISSION | LINK | CATEGORIES | TYPE   | TOKEN AMOUNT\nArtwork   | URL  | Art        | earned | 100\n```',
                    inline: false 
                },
                { 
                    name: '🔑 Access Setup', 
                    value: '1. Share your sheet with: `tinglebot@rotw-tinglebot.iam.gserviceaccount.com`\n2. Make sure you have a tab named exactly `loggedTracker`\n3. Use `/tokens setup` to verify your setup',
                    inline: false 
                }
            )
            .setFooter({ 
                text: 'Need more help? Use /tokens setup to verify your setup'
            })
            .setTimestamp();
    }

    return {
        errorEmbed,
        fullMessage: `${errorEmbed.data.title}\n\n${errorEmbed.data.description}\n\n${errorEmbed.data.fields[0].value}\n\n💡 Need more help? Use \`/tokens setup\` to verify your setup.`
    };
}

// ------------------- Log Token Balance Change -------------------
function logTokenBalanceChange(user, amount, action) {
    const oldBalance = user.tokens;
    const newBalance = oldBalance + amount;
    console.log(`[tokenUtils.js]: 💰 Initial token balance: ${oldBalance}`);
    console.log(`[tokenUtils.js]: 💸 ${action} ${Math.abs(amount)} tokens from user's balance`);
    console.log(`[tokenUtils.js]: 💰 New token balance: ${newBalance}`);
}

// ------------------- Exported Functions -------------------
// Exporting the unified `calculateTokens` and other utility functions.
module.exports = {
  resetSubmissionState,
  calculateTokens,
  calculateWritingTokens,
  generateTokenBreakdown,
  handleTokenError,
  logTokenBalanceChange,
};
