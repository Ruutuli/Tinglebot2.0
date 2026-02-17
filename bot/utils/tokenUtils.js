// ------------------- Token Utilities -------------------
// This module provides utility functions for token calculations and
// submission state management for a streamlined workflow.

// ------------------- Imports -------------------
// Modules for token calculations and formatting
const artModule = require('../modules/artModule');
const { capitalizeFirstLetter } = require('../modules/formattingModule');
const Quest = require('../models/QuestModel');

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
// Only base tokens are split; quest bonus and collab bonus are given to each person
function calculateTokens({
  baseSelections = [],
  baseCounts = new Map(),
  typeMultiplierSelections = [],
  productMultiplierValue,
  addOnsApplied = [],
  typeMultiplierCounts = {}, // Include multiplier counts
  specialWorksApplied = [],
  collab = null, // Add collab as a parameter
  questBonus = 0, // Add quest bonus parameter
  collabBonus = 0, // Add collab bonus parameter
  groupMemeBonus = false,
}) {
  // Base Token Calculation with individual counts
  const baseTotal = baseSelections.reduce((total, base) => {
    const baseValue = artModule.baseTokens[base] || 0;
    // Handle both Map objects and plain objects for baseCounts
    const baseCount = (baseCounts instanceof Map ? baseCounts.get(base) : baseCounts[base]) || 1; // Default to 1 if no count specified
    return total + baseValue * baseCount;
  }, 0);
  


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

  // Regular Total Calculation (base tokens only - no bonuses)
  const regularTotal = Math.ceil(baseTotal * typeMultiplierTotal * productMultiplier + addOnTotal);
  
  // Art total before split; apply Group Meme 1.5x if applicable
  let artTotal = regularTotal + specialWorksTotal;
  if (groupMemeBonus) {
    artTotal = Math.ceil(artTotal * 1.5);
  }
  
  // Calculate base tokens per person (split only base tokens, not bonuses)
  let baseTokensPerPerson = artTotal;
  let tokensPerPerson = baseTokensPerPerson;
  const hasCollab = collab && ((Array.isArray(collab) && collab.length > 0) || typeof collab === 'string');
  const totalParticipants = hasCollab ? (Array.isArray(collab) ? 1 + collab.length : 2) : 1;
  
  if (hasCollab) {
    baseTokensPerPerson = Math.floor(artTotal / totalParticipants);
    tokensPerPerson = baseTokensPerPerson + questBonus + collabBonus;
  } else {
    // No collab - single person gets everything
    tokensPerPerson = baseTokensPerPerson + questBonus;
  }
  
  // Calculate total tokens (for display/reference)
  const totalTokens = tokensPerPerson * totalParticipants;

  return {
    totalTokens,
    tokensPerPerson,
    splitTokens: tokensPerPerson, // For backward compatibility
    breakdown: {
      baseTotal,
      typeMultiplierTotal,
      productMultiplier,
      addOnTotal,
      specialWorksTotal,
      regularTotal,
      baseTokensPerPerson,
      questBonus,
      collabBonus: hasCollab ? collabBonus : 0,
      tokensPerPerson,
      finalTotal: tokensPerPerson,
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
  questBonus = 0, // Add quest bonus parameter
  groupMemeBonus = false,
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
  
  // Group Meme bonus
  if (groupMemeBonus) {
    breakdown += `× Group Meme Bonus (1.5)\n`;
  }
  
  // Quest bonus
  if (questBonus > 0) {
    breakdown += `+ Quest Bonus (${questBonus})\n`;
  }
  
  breakdown += `-----------------------------\n`;
  breakdown += ` ${finalTokenAmount} Tokens`;
  
  // Calculate collaboration token split
  if (collab) {
    let splitTokens;
    if (Array.isArray(collab) && collab.length > 0) {
      const totalParticipants = 1 + collab.length; // 1 submitter + collaborators
      splitTokens = Math.floor(finalTokenAmount / totalParticipants);
      breakdown += `\n\nCollab Total Each (${totalParticipants} people): ${splitTokens} Tokens`;
    } else if (typeof collab === 'string') {
      // Legacy support for single collaborator
      splitTokens = Math.floor(finalTokenAmount / 2);
      breakdown += `\n\nCollab Total Each: ${splitTokens} Tokens`;
    }
  }
  
  breakdown += '```';

  return breakdown;
}

// ------------------- Calculate Writing Tokens -------------------
// Calculates tokens for writing submissions based on word count
function calculateWritingTokens(wordCount) {
  return Math.round(wordCount / 100 * 10); // 10 tokens per 100 words
}

// ------------------- Calculate Writing Tokens with Collaboration -------------------
// Calculates tokens for writing submissions with collaboration splitting
// Only base tokens are split; quest bonus and collab bonus are given to each person
function calculateWritingTokensWithCollab(wordCount, collab = null, questBonus = 0, collabBonus = 0) {
  const baseTokens = Math.round(wordCount / 100 * 10); // 10 tokens per 100 words
  
  // Calculate tokens per person
  let tokensPerPerson = baseTokens;
  let baseTokensPerPerson = baseTokens;
  
  if (collab && Array.isArray(collab) && collab.length > 0) {
    const totalParticipants = 1 + collab.length; // 1 submitter + collaborators
    baseTokensPerPerson = Math.floor(baseTokens / totalParticipants);
    tokensPerPerson = baseTokensPerPerson + questBonus + collabBonus;
  } else if (collab && typeof collab === 'string') {
    // Legacy support for single collaborator string
    baseTokensPerPerson = Math.floor(baseTokens / 2);
    tokensPerPerson = baseTokensPerPerson + questBonus + collabBonus;
  } else {
    // No collab - single person gets everything
    tokensPerPerson = baseTokens + questBonus;
  }
  
  // Calculate total tokens (for display/reference, but distribution uses tokensPerPerson)
  const totalParticipants = collab && ((Array.isArray(collab) && collab.length > 0) || typeof collab === 'string')
    ? (Array.isArray(collab) ? 1 + collab.length : 2)
    : 1;
  const totalTokens = tokensPerPerson * totalParticipants;
  
  return {
    totalTokens,
    tokensPerPerson,
    splitTokens: tokensPerPerson, // For backward compatibility
    breakdown: {
      wordCount,
      tokensPerHundredWords: 10,
      baseTokens,
      baseTokensPerPerson,
      questBonus,
      collabBonus: collab && ((Array.isArray(collab) && collab.length > 0) || typeof collab === 'string') ? collabBonus : 0,
      tokensPerPerson,
      calculation: (() => {
        const parts = [];
        if (baseTokensPerPerson !== baseTokens) {
          parts.push(`${baseTokens} base ÷ ${totalParticipants} = ${baseTokensPerPerson} each`);
        } else {
          parts.push(`${baseTokens} base`);
        }
        if (questBonus > 0) {
          parts.push(`+ ${questBonus} quest bonus (each)`);
        }
        if (collab && ((Array.isArray(collab) && collab.length > 0) || typeof collab === 'string') && collabBonus > 0) {
          parts.push(`+ ${collabBonus} collab bonus (each)`);
        }
        return parts.join(' ') + ` = ${tokensPerPerson} tokens per person`;
      })(),
      finalTotal: tokensPerPerson,
    }
  };
}

// ------------------- Handle Token Errors -------------------
// Provides consistent error handling and user guidance for token-related issues
function handleTokenError(error, interaction) {
    const message = error instanceof Error ? error.message : String(error);

    // Only log actual system errors, not common user-facing errors.
    if (
        !message.includes('Insufficient tokens') &&
        !message.includes('Unknown interaction') &&
        !message.includes('Invalid token change value') &&
        !message.includes('Database queries temporarily blocked')
    ) {
        console.error('[tokenUtils.js]: ❌ System error:', error);
    }

    const errorEmbed = new EmbedBuilder()
        .setColor(0xFF0000)
        .setTimestamp();

    if (message.includes('Insufficient tokens')) {
        errorEmbed
            .setTitle('❌ Not Enough Tokens')
            .setDescription('You do not have enough tokens to complete that action.');
    } else if (message.includes('Unknown interaction')) {
        errorEmbed
            .setTitle('❌ Interaction Expired')
            .setDescription('This interaction expired. Please run the command again.');
    } else if (message.includes('Database queries temporarily blocked')) {
        errorEmbed
            .setTitle('⚠️ Please Try Again')
            .setDescription('The database is temporarily throttling requests. Please try again in a moment.');
    } else {
        errorEmbed
            .setTitle('❌ Token Error')
            .setDescription('An error occurred while processing tokens. Please try again later.');
    }

    const title = errorEmbed.data?.title || '❌ Token Error';
    const description = errorEmbed.data?.description || 'An error occurred.';
    const firstField = errorEmbed.data?.fields?.[0]?.value || '';
    const fullMessage = [title, description, firstField].filter(Boolean).join('\n\n');

    return { errorEmbed, fullMessage };
}

// ------------------- Log Token Balance Change -------------------
function logTokenBalanceChange(user, amount, action) {
    const oldBalance = user.tokens;
    const newBalance = oldBalance + amount;
    console.log(`[tokenUtils.js]: 💰 Initial token balance: ${oldBalance}`);
    console.log(`[tokenUtils.js]: 💸 ${action} ${Math.abs(amount)} tokens from user's balance`);
    console.log(`[tokenUtils.js]: 💰 New token balance: ${newBalance}`);
}

// ------------------- Get Quest Bonus -------------------
// Retrieves quest bonus from quest data based on quest ID
async function getQuestBonus(questId, userId = null) {
    try {
        if (!questId || questId === 'N/A') {
            console.log(`[tokenUtils.js]: ⚠️ No quest ID provided or quest ID is N/A`);
            return 0;
        }

        console.log(`[tokenUtils.js]: 🔍 Looking up quest bonus for quest ID: ${questId}`);
        const quest = await Quest.findOne({ questID: questId });
        if (!quest) {
            console.log(`[tokenUtils.js]: ⚠️ Quest ${questId} not found in database`);
            return 0;
        }

        // If userId is provided, check if the user is a participant in the quest
        if (userId) {
            const participant = quest.getParticipant(userId);
            if (!participant) {
                console.log(`[tokenUtils.js]: ⚠️ User ${userId} is not a participant in quest ${questId} - no quest bonus will be awarded`);
                return 0;
            }
            console.log(`[tokenUtils.js]: ✅ User ${userId} is a participant in quest ${questId}`);
        }

        console.log(`[tokenUtils.js]: 📋 Found quest: ${quest.title} (${quest.questType})`);
        console.log(`[tokenUtils.js]: 💰 Quest token reward: ${quest.tokenReward}`);

        // Parse quest bonus from token reward
        const tokenReward = quest.tokenReward;
        if (!tokenReward || typeof tokenReward !== 'string') {
            console.log(`[tokenUtils.js]: ⚠️ No valid token reward string found for quest ${questId}`);
            return 0;
        }

        // Look for different quest bonus formats in the token reward string
        // Format 1: "per_unit:222 unit:submission max:3 quest_bonus:50"
        // Format 2: "per_unit:222 unit:submission max:3 collab_bonus:50" (collab bonus is separate, not quest bonus)
        // Format 3: "flat:300 quest_bonus:50"
        // Format 4: "flat:300 collab_bonus:200" (flat amount is quest bonus, collab_bonus is separate)
        
        let questBonus = 0;
        
        // Check for explicit quest_bonus
        const questBonusMatch = tokenReward.match(/quest_bonus:(\d+)/);
        if (questBonusMatch) {
            questBonus = parseInt(questBonusMatch[1], 10);
            console.log(`[tokenUtils.js]: 🎯 Found explicit quest bonus: ${questBonus} for quest ${questId}`);
            return questBonus;
        }
        
        // Check for flat format - use flat amount as quest bonus
        const flatMatch = tokenReward.match(/flat:(\d+)/);
        if (flatMatch) {
            questBonus = parseInt(flatMatch[1], 10);
            console.log(`[tokenUtils.js]: 🎯 Found flat format, using flat amount as quest bonus: ${questBonus} for quest ${questId}`);
            return questBonus;
        }

        // Check for per_unit format - use per_unit amount as quest bonus
        const perUnitMatch = tokenReward.match(/per_unit:(\d+)/);
        if (perUnitMatch) {
            questBonus = parseInt(perUnitMatch[1], 10);
            console.log(`[tokenUtils.js]: 🎯 Found per_unit format, using per_unit amount as quest bonus: ${questBonus} for quest ${questId}`);
            return questBonus;
        }

        // If no quest bonus found, return 0
        console.log(`[tokenUtils.js]: ⚠️ No quest bonus found in token reward for quest ${questId}`);
        return 0;
    } catch (error) {
        console.error(`[tokenUtils.js]: ❌ Error retrieving quest bonus for quest ${questId}:`, error);
        return 0;
    }
}

// ------------------- Get Collab Bonus -------------------
// Retrieves collab bonus from quest data based on quest ID
async function getCollabBonus(questId) {
    try {
        if (!questId || questId === 'N/A') {
            console.log(`[tokenUtils.js]: ⚠️ No quest ID provided or quest ID is N/A for collab bonus`);
            return 0;
        }

        console.log(`[tokenUtils.js]: 🔍 Looking up collab bonus for quest ID: ${questId}`);
        const quest = await Quest.findOne({ questID: questId });
        if (!quest) {
            console.log(`[tokenUtils.js]: ⚠️ Quest ${questId} not found in database for collab bonus`);
            return 0;
        }

        const tokenReward = quest.tokenReward;
        if (!tokenReward || typeof tokenReward !== 'string') {
            console.log(`[tokenUtils.js]: ⚠️ No valid token reward string found for quest ${questId}`);
            return 0;
        }

        // Look for collab_bonus in the token reward string
        // Format: "flat:300 collab_bonus:200" or "per_unit:222 unit:submission max:3 collab_bonus:50"
        const collabBonusMatch = tokenReward.match(/collab_bonus:(\d+)/);
        if (collabBonusMatch) {
            const collabBonus = parseInt(collabBonusMatch[1], 10);
            console.log(`[tokenUtils.js]: 🎯 Found collab bonus: ${collabBonus} for quest ${questId}`);
            return collabBonus;
        }

        // If no collab bonus found, return 0
        console.log(`[tokenUtils.js]: ⚠️ No collab bonus found in token reward for quest ${questId}`);
        return 0;
    } catch (error) {
        console.error(`[tokenUtils.js]: ❌ Error retrieving collab bonus for quest ${questId}:`, error);
        return 0;
    }
}

// ------------------- Exported Functions -------------------
// Exporting the unified `calculateTokens` and other utility functions.
module.exports = {
  resetSubmissionState,
  calculateTokens,
  calculateWritingTokens,
  calculateWritingTokensWithCollab,
  generateTokenBreakdown,
  handleTokenError,
  logTokenBalanceChange,
  getQuestBonus,
  getCollabBonus,
};
