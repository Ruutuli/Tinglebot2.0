// ------------------- Token Utilities -------------------
// This module provides utility functions for token calculations and
// submission state management for a streamlined workflow.

// ------------------- Imports -------------------
// Modules for token calculations and formatting
const artModule = require('../modules/artModule');
const { capitalizeFirstLetter } = require('../modules/formattingModule');

// Mapping for display names
const getDisplayName = (value) => {
  const displayNames = {
    // Base tokens
    'chibi': 'Chibi',
    'headshot': 'Headshot',
    'waistup': 'Waist Up',
    'fullbody': 'Full Body',
    'other': 'Other',
    
    // Type multipliers
    'simple': 'Simple Creature',
    'complex': 'Complex Creature',
    'humanoid': 'Humanoid',
    'anthro': 'Anthro',
    
    // Product multipliers
    'sketch': 'Sketch',
    'lineArt': 'Line Art',
    'monochrome': 'Monochrome/Spot',
    'flatColor': 'Flat Color',
    'fullColor': 'Full Color',
    'pixel': 'Pixel',
    'painted': 'Painted',
    
    // Add-ons
    'simpleProp': 'Simple Prop',
    'complexProp': 'Complex Prop',
    'simpleBg': 'Simple Background',
    'complexBg': 'Complex Background',
    
    // Special Works
    'comicSimple': 'Simple Panel',
    'comicComplex': 'Complex Panel',
    'frameSimple': 'Simple Frame',
    'frameComplex': 'Complex Frame'
  };
  
  return displayNames[value] || capitalizeFirstLetter(value);
};
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
  baseCounts = new Map(),
  typeMultiplierSelections = [],
  productMultiplierValue,
  addOnsApplied = [],
  typeMultiplierCounts = {}, // Include multiplier counts
  specialWorksApplied = [],
  collab = null, // Add collab as a parameter
}) {
  // Base Token Calculation with individual counts
  const baseTotal = baseSelections.reduce((total, base) => {
    const baseValue = artModule.baseTokens[base] || 0;
    // Handle both Map objects and plain objects for baseCounts
    const baseCount = (baseCounts instanceof Map ? baseCounts.get(base) : baseCounts[base]) || 1; // Default to 1 if no count specified
    return total + baseValue * baseCount;
  }, 0);
  
  console.log(`[tokenUtils.js]: 🧮 Token calculation debug:`, {
    baseSelections,
    baseCounts: baseCounts instanceof Map ? Object.fromEntries(baseCounts) : baseCounts,
    baseTotal,
    typeMultiplierSelections,
    typeMultiplierCounts
  });

  // Type Multiplier Calculation
  const typeMultiplierTotal = typeMultiplierSelections.length > 0 
    ? typeMultiplierSelections.reduce((sum, multiplier) => {
        const multiplierValue = artModule.typeMultipliers[multiplier] || 1;
        const multiplierCount = typeMultiplierCounts[multiplier] || 1;
        return sum + (multiplierValue * multiplierCount); // Multiply value by count, then sum
      }, 0)
    : 1; // Default to 1 if no type multipliers are selected

  // Product Multiplier Calculation
  const productMultiplier = artModule.productMultipliers[productMultiplierValue];
  if (!productMultiplier) {
    console.error(`[tokenUtils.js]: ❌ Invalid product multiplier: ${productMultiplierValue}`);
    throw new Error(`Invalid product multiplier: ${productMultiplierValue}. Please select a valid product multiplier.`);
  }
  console.log(`[tokenUtils.js]: 🎨 Product multiplier: ${productMultiplierValue} = ${productMultiplier}`);

  // Add-Ons Calculation
  const addOnTotal = addOnsApplied
    .filter(({ addOn, count }) => addOn && count > 0)
    .reduce((total, { addOn, count }) => {
      const addOnValue = artModule.addOns[addOn] || 0;
      return total + addOnValue * count;
    }, 0);

  // Special Works Calculation with validation
  const comics = specialWorksApplied.filter(({ work }) => work && work.startsWith('comic'));
  const animations = specialWorksApplied.filter(({ work }) => work && work.startsWith('frame'));
  
  if (comics.length > 0 && animations.length > 0) {
    throw new Error('Cannot have both Comics and Animation special works. Please choose only one type.');
  }
  
  const specialWorksTotal = specialWorksApplied.reduce((total, { work, count }) => {
    const workValue = artModule.specialWorks[work] || 0;
    return total + workValue * (count || 1);
  }, 0);

  // Regular Total Calculation
  const regularTotal = Math.ceil(baseTotal * typeMultiplierTotal * productMultiplier + addOnTotal);
  console.log(`[tokenUtils.js]: 📊 Regular total calculation: ${baseTotal} × ${typeMultiplierTotal} × ${productMultiplier} + ${addOnTotal} = ${regularTotal}`);

  // Final Token Calculation
  const totalTokens = regularTotal + specialWorksTotal;

  console.log(`[tokenUtils.js]: 💰 Final calculation:`, {
    baseTotal,
    typeMultiplierTotal,
    productMultiplier,
    addOnTotal,
    specialWorksTotal,
    regularTotal,
    totalTokens
  });

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
  baseCounts = new Map(),
  typeMultiplierSelections = [],
  productMultiplierValue,
  addOnsApplied = [],
  specialWorksApplied = [],
  typeMultiplierCounts = {}, // Add typeMultiplierCounts here
  finalTokenAmount,
  collab = null, // Add collab parameter
}) {
  const baseSection = baseSelections
    .map(base => {
      const baseValue = artModule.baseTokens[base] || 0;
      // Handle both Map objects and plain objects for baseCounts
      const baseCount = (baseCounts instanceof Map ? baseCounts.get(base) : baseCounts[base]) || 1;
      return `${capitalizeFirstLetter(base)} (${baseValue} × ${baseCount}) = ${baseValue * baseCount}`;
    })
    .join(' x ');

  const typeMultiplierSection = typeMultiplierSelections
    .map(multiplier => {
      const multiplierValue = artModule.typeMultipliers[multiplier] || 1;
      return `${capitalizeFirstLetter(multiplier)} (${multiplierValue}) = ${multiplierValue}`;
    })
    .join(' + ');

  if (!productMultiplierValue) {
    throw new Error('Product multiplier is required. Please select a valid product multiplier.');
  }
  
  const productMultiplierLabel = capitalizeFirstLetter(productMultiplierValue);
  const productMultiplierValueFinal = artModule.productMultipliers[productMultiplierValue];
  if (!productMultiplierValueFinal) {
    throw new Error(`Invalid product multiplier: ${productMultiplierValue}. Please select a valid product multiplier.`);
  }

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

  // Construct the breakdown in table format
  let breakdown = '```\n';

  // Calculate base tokens total
  const baseTotal = baseSelections.reduce((total, base) => {
    const baseValue = artModule.baseTokens[base] || 0;
    const baseCount = (baseCounts instanceof Map ? baseCounts.get(base) : baseCounts[base]) || 1;
    return total + baseValue * baseCount;
  }, 0);

  // Calculate type multiplier total
  const typeMultiplierTotal = typeMultiplierSelections.length > 0 
    ? typeMultiplierSelections.reduce((sum, multiplier) => {
        const multiplierValue = artModule.typeMultipliers[multiplier] || 1;
        const multiplierCount = typeMultiplierCounts[multiplier] || 1;
        return sum + (multiplierValue * multiplierCount);
      }, 0)
    : 1;

  // Calculate add-ons total
  const addOnTotal = addOnsApplied
    .filter(({ addOn, count }) => addOn && count > 0)
    .reduce((total, { addOn, count }) => {
      const addOnValue = artModule.addOns[addOn] || 0;
      return total + addOnValue * count;
    }, 0);

  // Calculate special works total
  const specialWorksTotal = specialWorksApplied
    .filter(({ work, count }) => work && count > 0)
    .reduce((total, { work, count }) => {
      const workValue = artModule.specialWorks[work] || 0;
      return total + workValue * count;
    }, 0);

  // Build the table format with actual names
  // Base tokens with individual breakdown
  const baseLines = baseSelections.map(base => {
    const baseValue = artModule.baseTokens[base] || 0;
    const baseCount = (baseCounts instanceof Map ? baseCounts.get(base) : baseCounts[base]) || 1;
    return `${getDisplayName(base)} (${baseValue}×${baseCount})`;
  });
  breakdown += baseLines.join(' + ') + '\n';
  
  // Type multipliers with individual breakdown
  if (typeMultiplierSelections.length > 0) {
    const typeLines = typeMultiplierSelections.map(multiplier => {
      const multiplierValue = artModule.typeMultipliers[multiplier] || 1;
      const multiplierCount = typeMultiplierCounts[multiplier] || 1;
      return `${getDisplayName(multiplier)} (${multiplierValue}×${multiplierCount})`;
    });
    breakdown += `x ${typeLines.join(' + ')}\n`;
  }
  
  // Product multiplier
  breakdown += `x ${getDisplayName(productMultiplierValue)} ×(${productMultiplierValueFinal})\n`;
  
  // Add-ons with individual breakdown
  if (addOnTotal > 0) {
    const addOnLines = addOnsApplied
      .filter(({ addOn, count }) => addOn && count > 0)
      .map(({ addOn, count }) => {
        const addOnValue = artModule.addOns[addOn] || 0;
        return `${getDisplayName(addOn)} (${addOnValue}×${count})`;
      });
    breakdown += `+ ${addOnLines.join(' + ')}\n`;
  }
  
  // Special works with individual breakdown
  if (specialWorksTotal > 0) {
    const specialLines = specialWorksApplied
      .filter(({ work, count }) => work && count > 0)
      .map(({ work, count }) => {
        const workValue = artModule.specialWorks[work] || 0;
        return `${getDisplayName(work)} (${workValue}×${count})`;
      });
    breakdown += `+ ${specialLines.join(' + ')}\n`;
  }
  
  breakdown += `-----------------------------\n`;
  breakdown += ` ${finalTokenAmount} Tokens`;
  
  if (collab) {
    breakdown += `\n\nCollab Total Each: ${Math.floor(finalTokenAmount / 2)} Tokens`;
  }
  
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
