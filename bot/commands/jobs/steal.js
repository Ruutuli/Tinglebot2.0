// ============================================================================
// ---- Imports ----
// ============================================================================

// ------------------- Third-party Library Imports -------------------
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');

// ------------------- Local Module Imports -------------------
const { handleInteractionError } = require('@/utils/globalErrorHandler');
const { 
    fetchCharacterByName, 
    getCharacterInventoryCollection, 
    fetchItemRarityByName, 
    connectToInventoriesForItems,
    fetchModCharacterByNameAndUserId 
} = require('@/database/db');
const { removeItemInventoryDatabase, addItemInventoryDatabase, syncToInventoryDatabase, logItemAcquisitionToDatabase, logItemRemovalToDatabase } = require('@/utils/inventoryUtils');
const { getNPCItems, NPCs, getStealFlavorText, getStealFailText } = require('../../modules/NPCsModule');
// Google Sheets functionality removed
// Google Sheets validation removed - isValidGoogleSheetsUrl and extractSpreadsheetId no longer available
const ItemModel = require('@/models/ItemModel');
const Character = require('@/models/CharacterModel');
const User = require('@/models/UserModel');
const { finalizeBlightApplication } = require('../../handlers/blightHandler');
const { hasPerk, getJobPerk, normalizeJobName, isValidJob } = require('../../modules/jobsModule');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');
const { capitalizeWords } = require('../../modules/formattingModule');
const { applyStealingBoost, applyStealingJailBoost, applyStealingLootBoost } = require('../../modules/boostIntegration');
const { generateBoostFlavorText } = require('../../modules/flavorTextModule');
const { getBoostInfo, addBoostFlavorText, buildFooterText } = require('../../embeds/embeds');
const { getActiveBuffEffects } = require('../../modules/elixirModule');
const logger = require('@/utils/logger');
const { retrieveBoostingRequestFromTempDataByCharacter, saveBoostingRequestToTempData, clearBoostAfterUse } = require('../jobs/boosting');
const { checkJailStatus, sendToJail, formatJailTimeLeftDaysHours, DEFAULT_JAIL_DURATION_MS } = require('@/utils/jailCheck');

// Add StealStats model
const StealStats = require('@/models/StealStatsModel');

// Add NPC model for global steal protection tracking
const NPC = require('@/models/NPCModel');

// ============================================================================
// ---- Constants ----
// ============================================================================

// ------------------- System Constants -------------------
const PROTECTION_DURATION = 2 * 60 * 60 * 1000; // 2 hours protection

// ------------------- Global Cooldown System -------------------
// New system to prevent steal abuse, especially for NPCs with uncommon items
const GLOBAL_FAILURE_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours global cooldown on failure
const GLOBAL_SUCCESS_COOLDOWN = 7 * 24 * 60 * 60 * 1000; // 1 week global cooldown on success

// Individual NPC cooldown for each character (30 days)
const NPC_COOLDOWN = 30 * 24 * 60 * 60 * 1000; // 30 days

// ------------------- Village Channels -------------------
const villageChannels = {
  Rudania: process.env.RUDANIA_TOWNHALL,
  Inariko: process.env.INARIKO_TOWNHALL,
  Vhintl: process.env.VHINTL_TOWNHALL,
};

// ------------------- Rarity Constants -------------------
const RARITY_COOLDOWN_MULTIPLIERS = {
    common: 1,
    uncommon: 1.5
};

const RARITY_WEIGHTS = {
    '1': 20, '2': 18, '3': 15, '4': 13, '5': 11
};

const FAILURE_CHANCES = {
    common: 10,
    uncommon: 50
};

// ------------------- NPC Difficulty Modifiers -------------------
// Zone and Peddler are harder to steal from due to uncommon items
const NPC_DIFFICULTY_MODIFIERS = {
    Zone: 18,      // +18 to failure threshold (harder to succeed)
    Peddler: 15    // +15 to failure threshold (harder to succeed)
};

// ------------------- Error Messages -------------------
const ERROR_MESSAGES = {
    CHARACTER_NOT_FOUND: '❌ **Character not found.**',
    INVENTORY_NOT_SYNCED: '❌ **Inventory is not set up yet.** Use `/inventory test charactername:NAME` then `/inventory sync charactername:NAME` to initialize.',
    IN_JAIL: '⛔ **You are currently in jail and cannot steal!**',
    PROTECTED: '🛡️ **This character is currently protected from theft!**',

    COOLDOWN: '⏰ **Please wait {time} seconds before attempting to steal again.**',
    NO_ITEMS: '❌ **No items available to steal!**',
    INVALID_TARGET: '❌ **Invalid target selected!**',
    INVALID_NPC_TARGET: '❌ **Invalid NPC target selected!**\n\n**Available NPCs:**\n{availableNPCs}\n\n**Tip:** Make sure to select an NPC from the dropdown menu, not type the name manually.',
    INVALID_PLAYER_TARGET: '❌ **Invalid player target selected!**\n\n**Tip:** Make sure to select a character from the dropdown menu, not type the name manually.'
};

// ------------------- NPC Data -------------------
// Remove hardcoded mapping and use dynamic NPC lookup instead
// const NPC_NAME_MAPPING = {
//     'Hank': 'Hank',
//     'Sue': 'Sue',
//     'Lukan': 'Lukan',
//     'Myti': 'Myti',
//     'Cree': 'Cree',
//     'Cece': 'Cece',
//     'Walton': 'Walton',
//     'Jengo': 'Jengo',
//     'Jasz': 'Jasz',
//     'Lecia': 'Lecia',
//     'Tye': 'Tye',
//     'Lil Tim': 'Lil Tim',
//     'Zone': 'Zone',
//     'Peddler': 'Peddler'
// };

// ============================================================================
// ---- State Management ----
// ============================================================================

// ------------------- User State Tracking -------------------
// const userCooldowns = new Map(); // Track user cooldowns
const stealStreaks = new Map(); // Track successful steal streaks

// ------------------- New Cooldown Tracking -------------------
// Note: Individual NPC cooldowns are now stored in the NPC model database
// instead of in-memory Map for persistence across bot restarts


// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ------------------- Daily Steal Limit Functions -------------------
// Check if a daily steal is available for a specific activity
function canUseDailySteal(character, activity) {
  // If character has an active job voucher, they can always use the command
  if (character.jobVoucher) {
    return true;
  }

  // Special case for test characters
  if (character.name === 'Tingle test' || character.name === 'Tingle' || character.name === 'John') {
    return true;
  }

  const now = new Date();
  // Compute the most recent 12:00 UTC (8am EST) rollover
  const rollover = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0));
  if (now < rollover) {
    // If before today's 12:00 UTC, use yesterday's 12:00 UTC
    rollover.setUTCDate(rollover.getUTCDate() - 1);
  }

  // Check steal activity
  const lastStealRoll = character.dailyRoll?.get('steal');
  
  if (!lastStealRoll) {
    return true;
  }

  const lastStealDate = new Date(lastStealRoll);
  
  // If steal was used today (after rollover), deny the action
  if (lastStealDate >= rollover) {
    return false;
  }

  return true;
}

// Update the daily steal timestamp for an activity
async function updateDailySteal(character, activity) {
  try {
    if (!character.dailyRoll) {
      character.dailyRoll = new Map();
    }
    const now = new Date().toISOString();
    character.dailyRoll.set(activity, now);
    character.markModified('dailyRoll'); // Required for Mongoose to track Map changes
    await character.save();
  } catch (error) {
        logger.error('JOB', `❌ Failed to update daily steal for ${character.name}`, error);
    
            // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'updateDailySteal',
            characterName: character?.name
        });
    
    throw error;
  }
}

// ------------------- Item Selection with Fallback Hierarchy -------------------
// Centralized item selection system that handles rarity-based fallback logic
// 
// FALLBACK HIERARCHY:
// - Uncommon items (rarity 5): uncommon -> common -> any available  
// - Common items (rarity 1-4): common -> any available
//
// This system ensures that if the requested rarity isn't available, the system
// gracefully falls back to lower rarities rather than failing completely.
// The fallback is transparent to the user but provides feedback when it occurs.
async function selectItemsWithFallback(itemsWithRarity, targetRarity) {
    // Rarity mapping: 1-4 = common, 5 = uncommon (only rarity 1-5 allowed)
    const RARITY_MAPPING = {
        common: { min: 1, max: 4 },
        uncommon: { min: 5, max: 5 }
    };
    
    // Fallback hierarchy: uncommon -> common -> any available (no rare items)
    const FALLBACK_HIERARCHY = {
        uncommon: ['uncommon', 'common', 'any'],
        common: ['common', 'any']
    };
    
    // Process items with rarity and tier assignment
    // Filter out items with rarity 6+ (only allow rarity 1-5)
    const processedItems = itemsWithRarity
        .filter(({ itemRarity }) => itemRarity && itemRarity <= 5)
        .map(({ itemName, itemRarity }) => {
            let tier = 'common';
            if (itemRarity >= 5) tier = 'uncommon';
            return { itemName, itemRarity, tier, weight: RARITY_WEIGHTS[itemRarity] };
        });
    
    // Try each tier in the fallback hierarchy
    const fallbackTiers = FALLBACK_HIERARCHY[targetRarity] || ['any'];
    
    for (const tier of fallbackTiers) {
        let filteredItems;
        
        if (tier === 'any') {
            // Final fallback: return all available items
            filteredItems = processedItems;
        } else {
            // Filter by specific tier
            filteredItems = processedItems.filter(item => item.tier === tier);
        }
        
        if (filteredItems.length > 0) {
            return {
                items: filteredItems,
                selectedTier: tier,
                usedFallback: tier !== targetRarity
            };
        }
    }
    
    // No items found at all
    return {
        items: [],
        selectedTier: null,
        usedFallback: false
    };
}

// ------------------- Fallback Message Generator -------------------
// Generates user-friendly messages when the fallback system is used
// Returns null if no fallback was needed (target rarity was found)
function getFallbackMessage(targetRarity, selectedTier) {
    if (targetRarity === selectedTier) return null;
    
    const messages = {
        uncommon: '⚠️ No uncommon items found! But you did find something else...'
    };
    
    return messages[targetRarity] || null;
}

// ------------------- Character Validation -------------------
async function validateCharacter(characterName, userId, requireInventorySync = false) {
    try {
        let character = await fetchCharacterByName(characterName);
        
        // If not found as regular character, try as mod character
        if (!character) {
            character = await fetchModCharacterByNameAndUserId(characterName, userId);
        }
        
        if (!character) {
            return { valid: false, error: `❌ **Character "${characterName}" not found.** Please check the spelling and make sure the character exists.` };
        }
        
        if (userId && character.userId !== userId) {
            return { valid: false, error: '❌ **You can only perform this action with your own characters.**' };
        }
        
        // Inventory sync check removed - no longer required
        
        return { valid: true, character };
    } catch (error) {
        logger.error('JOB', `❌ Error validating character "${characterName}"`, error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'validateCharacter',
            characterName: characterName,
            userId: userId
        });
        
        return { valid: false, error: `❌ **An error occurred while validating character "${characterName}".** Please try again later.` };
    }
}

// ------------------- Embed Creation -------------------
function createBaseEmbed(title, color = '#AA926A') {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setTimestamp();
}

async function createStealResultEmbed(thiefCharacter, targetCharacter, item, quantity, roll, failureThreshold, isSuccess, isNPC = false, boostDetails = null) {
    const itemEmoji = item.emoji || await getItemEmoji(item.itemName);
    const successField = `Roll: **${roll}** / 99 = ${isSuccess ? '✅ Success!' : '❌ Failure!'}`;
    
    // Get NPC flavor text and icon if it's an NPC
    let npcFlavorText = '';
    let npcIcon = null;
    if (isNPC) {
        const npcName = typeof targetCharacter === 'string' ? targetCharacter : targetCharacter.name;
        const npcData = NPCs[npcName];
        if (npcData) {
            if (isSuccess) {
                // Use success flavor text for successful steals
                if (npcData.flavorText) {
                    // Use the new random flavor text function for variety
                    const randomFlavorText = getStealFlavorText(npcName);
                    npcFlavorText = `*${randomFlavorText}*`;
                } else {
                    npcFlavorText = `*${npcName} didn't notice you taking something...*`;
                }
            } else {
                // Use fail text for failed steal attempts
                if (npcData.failText) {
                    const randomFailText = getStealFailText(npcName);
                    npcFlavorText = `*${randomFailText}*`;
                } else {
                    npcFlavorText = `*${npcName} caught you trying to take something...*`;
                }
            }
            // Use the actual NPC icon if available
            if (npcData.icon) {
                npcIcon = npcData.icon;
            }
        } else {
            npcFlavorText = `*${npcName} ${isSuccess ? 'didn\'t notice you taking' : 'caught you trying to take'} something...*`;
        }
    }
    
    const baseDescription = `${npcFlavorText}${npcFlavorText ? '\n\n' : ''}[**${thiefCharacter.name}**](${thiefCharacter.inventory || thiefCharacter.inventoryLink}) ${isSuccess ? 'successfully stole from' : 'tried to steal from'} ${isNPC ? targetCharacter : `[**${targetCharacter.name}**](${targetCharacter.inventory || targetCharacter.inventoryLink})`}`;
    let contextualBoostDetails = boostDetails;
    if (boostDetails && boostDetails.boosterJob) {
        const contextualFlavor = generateBoostFlavorText(boostDetails.boosterJob, 'Stealing', { outcome: isSuccess ? 'success' : 'failure' });
        contextualBoostDetails = {
            ...boostDetails,
            boostFlavorText: contextualFlavor
        };
    }
    const descriptionWithBoost = addBoostFlavorText(baseDescription, contextualBoostDetails);

    const embed = createBaseEmbed(isSuccess ? '💰 Item Stolen!' : '💢 Failed Steal!', isSuccess ? '#AA926A' : '#ff0000')
        .setDescription(descriptionWithBoost)
        .addFields(
            { name: '📦 Item', value: `> **${itemEmoji} ${item.itemName}**${isSuccess ? ` x**${quantity}**` : ''}`, inline: false },
            { name: '🎲 Roll', value: `> ${successField}`, inline: false },
            { name: '✨ Rarity', value: `> **${item.tier.toUpperCase()}** (${item.itemRarity})`, inline: false }
        )
        .setThumbnail(isNPC ? (npcIcon || null) : targetCharacter.icon)
        .setAuthor({ 
            name: `${thiefCharacter.name} the ${thiefCharacter.job ? thiefCharacter.job.charAt(0).toUpperCase() + thiefCharacter.job.slice(1).toLowerCase() : 'No Job'}`, 
            iconURL: thiefCharacter.icon 
        })
        .setFooter({ 
            text: buildFooterText(isSuccess ? 'Steal successful!' : 'Steal failed!', thiefCharacter, boostDetails), 
            iconURL: isNPC ? npcIcon : targetCharacter.icon 
        });

    // Add job voucher indicator if active
    if (thiefCharacter.jobVoucher && thiefCharacter.jobVoucherJob) {
        embed.addFields({
            name: '🎫 Job Voucher',
            value: `> Using **${thiefCharacter.jobVoucherJob}** voucher`,
            inline: false
        });
    }

    // Add elixir buff indicator if active
    if (thiefCharacter.buff?.active) {
        const buffEffects = getActiveBuffEffects(thiefCharacter);
        if (buffEffects && buffEffects.stealthBoost > 0) {
            embed.addFields({
                name: '🧪 Active Elixir',
                value: `> **${thiefCharacter.buff.type}** buff (Level ${thiefCharacter.buff.level}) - Stealth +${buffEffects.stealthBoost}`,
                inline: false
            });
        }
    }

    // Add cooldown information for successful steals
    if (isSuccess && !thiefCharacter.jobVoucher) {
        // Calculate next steal availability (8 AM EST rollover)
        const nextRollover = new Date();
        nextRollover.setUTCHours(12, 0, 0, 0); // 8AM EST = 12:00 UTC
        if (nextRollover < new Date()) {
            nextRollover.setUTCDate(nextRollover.getUTCDate() + 1);
        }
        
        const now = new Date();
        const timeUntilNextSteal = nextRollover.getTime() - now.getTime();
        const hoursUntilNext = Math.floor(timeUntilNextSteal / (60 * 60 * 1000));
        const minutesUntilNext = Math.floor((timeUntilNextSteal % (60 * 60 * 1000)) / (60 * 1000));
        
        let cooldownText;
        if (hoursUntilNext > 0) {
            cooldownText = `> **${hoursUntilNext}h ${minutesUntilNext}m** until next steal (resets at 8 AM EST)`;
        } else {
            cooldownText = `> **${minutesUntilNext}m** until next steal (resets at 8 AM EST)`;
        }
        
        embed.addFields({
            name: '⏰ Next Steal Available',
            value: cooldownText,
            inline: false
        });
    }
    
    // Add protection information for failed steals (only for NPCs)
    if (!isSuccess && isNPC) {
        // Calculate 24-hour cooldown from now
        const now = new Date();
        const cooldownEnd = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // 24 hours from now
        const timeUntilCooldownEnd = cooldownEnd.getTime() - now.getTime();
        const hoursUntilEnd = Math.floor(timeUntilCooldownEnd / (60 * 60 * 1000));
        const minutesUntilEnd = Math.floor((timeUntilCooldownEnd % (60 * 60 * 1000)) / (60 * 1000));
        
        let cooldownText;
        if (hoursUntilEnd > 0) {
            cooldownText = `> **${hoursUntilEnd}h ${minutesUntilEnd}m** until protection expires`;
        } else {
            cooldownText = `> **${minutesUntilEnd}m** until protection expires`;
        }
        
        // Add target protection information (failed attempts - NPCs only)
        embed.addFields({
            name: '🛡️ Target Protection',
            value: `> **${targetCharacter}** is now protected from theft for **24 hours** due to this failed attempt!`,
            inline: false
        });
        
        // Add personal lockout information for failed attempts
        embed.addFields({
            name: '🔒 Personal Lockout',
            value: `> **${targetCharacter}** is now protected for **1 month** from being stolen from **${thiefCharacter.name}**. Please try stealing from other NPCs!`,
            inline: false
        });
    }

    if (isSuccess) {
        // Always use the default success image, NPC icon is only used for thumbnail
        embed.setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
    } else {
        // Add image for failed steals
        embed.setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
    }

    return embed;
}

function createProtectionEmbed(targetName, timeLeftMinutes, isNPC = false, protectionType = 'local', targetIcon = null) {
    // Convert minutes to days, hours, and minutes for better display
    let timeDisplay;
    if (timeLeftMinutes >= 1440) { // 24 hours = 1440 minutes
        const days = Math.floor(timeLeftMinutes / 1440);
        const remainingMinutes = timeLeftMinutes % 1440;
        const hours = Math.floor(remainingMinutes / 60);
        const minutes = remainingMinutes % 60;
        
        if (hours > 0 && minutes > 0) {
            timeDisplay = `**${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}**`;
        } else if (hours > 0) {
            timeDisplay = `**${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}**`;
        } else if (minutes > 0) {
            timeDisplay = `**${days} day${days !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}**`;
        } else {
            timeDisplay = `**${days} day${days !== 1 ? 's' : ''}**`;
        }
    } else if (timeLeftMinutes >= 60) {
        const hours = Math.floor(timeLeftMinutes / 60);
        const minutes = timeLeftMinutes % 60;
        if (minutes > 0) {
            timeDisplay = `**${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}**`;
        } else {
            timeDisplay = `**${hours} hour${hours !== 1 ? 's' : ''}**`;
        }
    } else {
        timeDisplay = `**${timeLeftMinutes} minute${timeLeftMinutes !== 1 ? 's' : ''}**`;
    }
    
    let title, description, footerText;
    
    if (protectionType === 'global') {
        title = '🛡️ Global Theft Protection Active';
        description = `**${targetName}** is globally protected from all theft attempts!`;
        footerText = 'Global protection active';
    } else {
        title = '🛡️ Theft Protection Active';
        description = `**${targetName}** is currently protected from theft!`;
        footerText = 'Protection active';
    }
    
    const embed = new EmbedBuilder()
        .setColor(0x4169E1) // Royal blue color for protection
        .setTitle(title)
        .setDescription(description)
        .addFields(
            { name: '⏰ Protection Duration', value: `Expires in ${timeDisplay}`, inline: false },
            { name: '💡 What This Means', value: 'This target cannot be stolen from until the protection expires', inline: false }
        )
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .setFooter({ 
            text: footerText
        })
        .setTimestamp();
    
    // Add thumbnail if icon is provided
    if (targetIcon) {
        embed.setThumbnail(targetIcon);
    }
    
    return embed;
}

// ------------------- Function: createJailBlockEmbed -------------------
// Creates a roleplay-friendly embed for when stealing from jailed characters is blocked
function createJailBlockEmbed(targetName, timeLeft, targetIcon, thiefIcon) {
    const jailMessages = [
        `*${targetName} rattles their chains. Pretty bold of you to think you can rob someone behind iron bars.*`,
        `*The guards glare at you. Sneaking into jail isn't exactly a stealthy move.*`,
        `*${targetName} is already locked up—what more could you possibly take from them?*`,
        `*You reach for ${targetName}'s pockets… but the bars say no.*`,
        `*The jail cell smells like damp hay and regret. Not exactly prime looting grounds.*`,
        `*A guard coughs loudly. Maybe don't test your luck by sticking your hands through the bars.*`,
        `*${targetName} smirks from behind the cell door. "Good luck stealing from me in here."*`,
        `*Chains clink as ${targetName} shifts. You realize robbing prisoners isn't just rude—it's dumb.*`,
        `*Even bandits have standards… right?*`,
        `*You'd have better luck stealing from the guards than from someone locked up.*`
    ];
    
    const randomMessage = jailMessages[Math.floor(Math.random() * jailMessages.length)];
    
    const embed = new EmbedBuilder()
        .setColor(0x8B4513) // Brown color for jail theme
        .setTitle('Jail Break Attempt Blocked!')
        .setDescription(randomMessage)
        .addFields(
            { name: '⏰ Release Time', value: `${targetName} will be released in **${timeLeft}**\n🕛 Jail releases happen at **midnight EST**`, inline: false },
            { name: '💡 Stealing Tip', value: 'Try stealing from characters who are actually free to roam around!', inline: false }
        )
        .setThumbnail(targetIcon || null)
        .setAuthor({ 
            name: 'Steal Attempt', 
            iconURL: thiefIcon || null 
        })
        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
        .setFooter({ 
            text: 'Jail protection active - even thieves have standards!'
        })
        .setTimestamp();
    
    return embed;
}

// ------------------- Streak Management Functions -------------------
function getCurrentStreak(userId) {
    return stealStreaks.get(userId) || 0;
}

function incrementStreak(userId) {
    const currentStreak = getCurrentStreak(userId);
    stealStreaks.set(userId, currentStreak + 1);
    return currentStreak + 1;
}

function resetStreak(userId) {
    stealStreaks.set(userId, 0);
}

// ------------------- Protection Management Functions -------------------
// Check if a target is protected
async function isProtected(targetId) {
    try {
        if (typeof targetId === 'string' && !targetId.includes('_')) {
            // This is an NPC
            const npc = await NPC.findOne({ name: targetId });
            if (!npc) return { protected: false };
            
            // Check protection
            if (npc.stealProtection?.isProtected) {
                if (npc.isProtectionExpired && npc.isProtectionExpired()) {
                    await NPC.clearProtection(targetId);
                } else {
                    const timeLeft = npc.getProtectionTimeLeft ? npc.getProtectionTimeLeft() : 0;
                    if (timeLeft > 0) {
                        return { 
                            protected: true, 
                            type: 'protection', 
                            endTime: npc.stealProtection.protectionEndTime,
                            timeLeft: timeLeft
                        };
                    }
                }
            }
        } else {
            // This is a player character
            const character = await Character.findById(targetId);
            if (!character) return { protected: false };
            
            // Check protection
            if (character.stealProtection?.isProtected) {
                if (character.isProtectionExpired && character.isProtectionExpired()) {
                    if (character.clearProtection) {
                        character.clearProtection();
                        await character.save();
                    } else {
                        // Fallback if method doesn't exist
                        character.stealProtection.isProtected = false;
                        character.stealProtection.protectionEndTime = null;
                        await character.save();
                    }
                } else {
                    const timeLeft = character.getProtectionTimeLeft ? character.getProtectionTimeLeft() : 0;
                    if (timeLeft > 0) {
                        return { 
                            protected: true, 
                            type: 'protection', 
                            endTime: character.stealProtection.protectionEndTime,
                            timeLeft: timeLeft
                        };
                    }
                }
            }
        }
        
        return { protected: false };
    } catch (error) {
        logger.error('NPC', 'Error checking protection', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'isProtected check',
            targetId: targetId
        });
        
        return { protected: false };
    }
}

// Set protection (2-hour cooldown after failed steal, midnight EST after successful steal)
async function setProtection(targetId, duration = '2hours') {
    try {
        let protectionDuration;
        
        if (duration === 'midnight') {
            // Calculate next midnight EST for successful steals
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            tomorrow.setUTCHours(5, 0, 0, 0); // 5 AM UTC = midnight EST
            protectionDuration = tomorrow.getTime() - now.getTime();
        } else {
            // Default 2 hours for failed steals
            protectionDuration = PROTECTION_DURATION;
        }
        
        if (typeof targetId === 'string' && !targetId.includes('_')) {
            // This is an NPC
            const result = await NPC.setProtection(targetId, protectionDuration);
            if (!result) {
                logger.error('NPC', `Failed to set protection for NPC: ${targetId}`);
            }
        } else {
            // This is a player character
            const character = await Character.findById(targetId);
            if (character) {
                // Ensure the character has the new protection structure
                if (!character.stealProtection) {
                    character.stealProtection = {
                        isProtected: false,
                        protectionEndTime: null
                    };
                }
                character.setProtection(protectionDuration);
                await character.save();
            } else {
                logger.error('NPC', `Character not found for protection: ${targetId}`);
            }
        }
    } catch (error) {
        logger.error('NPC', 'Error setting protection', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'setProtection',
            targetId: targetId,
            duration: duration
        });
    }
}

// Clear protection
async function clearProtection(targetId) {
    try {
        if (typeof targetId === 'string' && !targetId.includes('_')) {
            // This is an NPC
            const result = await NPC.clearProtection(targetId);
            if (!result) {
                logger.error('NPC', `Failed to clear protection for NPC: ${targetId}`);
            }
        } else {
            // This is a player character
            const character = await Character.findById(targetId);
            if (character) {
                character.clearProtection();
                await character.save();
            } else {
                logger.error('NPC', `Character not found for clearing protection: ${targetId}`);
            }
        }
    } catch (error) {
        logger.error('NPC', 'Error clearing protection', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'clearProtection',
            targetId: targetId
        });
    }
}

// Get protection time left (works for both local and global)
async function getProtectionTimeLeft(targetId) {
    const protectionStatus = await isProtected(targetId);
    if (!protectionStatus.protected) {
        return 0;
    }
    return protectionStatus.timeLeft || 0;
}

// Note: isGloballyProtected function removed - now handled by unified isProtected function

// Set global protection after successful steal (24 hour cooldown)
async function setGlobalSuccessProtection(targetId) {
  try {
    // Calculate next midnight EST
    // EST is UTC-5, so midnight EST = 5 AM UTC the next day
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(5, 0, 0, 0); // 5 AM UTC = midnight EST
    
    const endTime = tomorrow;
    
    if (typeof targetId === 'string' && !targetId.includes('_')) {
      // This is an NPC
      await NPC.setProtection(targetId, endTime.getTime() - Date.now());
    } else {
      // This is a player character
      const character = await Character.findById(targetId);
      if (character) {
        // Ensure the character has the protection structure
        if (!character.stealProtection) {
          character.stealProtection = {
            isProtected: false,
            protectionEndTime: null
          };
        }
        character.setProtection(endTime.getTime() - Date.now());
        await character.save();
      }
    }
  } catch (error) {
    logger.error('NPC', 'Error setting global success protection', error);
    
            // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'setGlobalSuccessProtection',
            targetId: targetId
        });
  }
}

// Set global protection after failed steal (2 hour cooldown)
async function setGlobalFailureProtection(targetId) {
  try {
    const endTime = new Date(Date.now() + GLOBAL_FAILURE_COOLDOWN);
    
    if (typeof targetId === 'string' && !targetId.includes('_')) {
      // This is an NPC
      await NPC.setProtection(targetId, endTime.getTime() - Date.now());
    } else {
      // This is a player character
      const character = await Character.findById(targetId);
      if (character) {
        // Ensure the character has the protection structure
        if (!character.stealProtection) {
          character.stealProtection = {
            isProtected: false,
            protectionEndTime: null
          };
        }
        character.setProtection(endTime.getTime() - Date.now());
        await character.save();
      }
    }
  } catch (error) {
    logger.error('NPC', 'Error setting global failure protection', error);
    
            // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'setGlobalFailureProtection',
            targetId: targetId
        });
  }
}

// Note: Protection methods simplified to use unified isProtectionExpired and getProtectionTimeLeft functions

// ============================================================================
// ---- New Cooldown System Functions ----
// ============================================================================

// ------------------- Check Target Protection -------------------
// Check if a target is protected from theft (applies to ALL thieves)
async function checkTargetProtection(targetId, isNPCTarget) {
    try {
        if (isNPCTarget) {
            // For NPCs, check if they have global protection
            const npc = await NPC.findOne({ name: targetId });
            if (npc && npc.stealProtection?.isProtected && !npc.isProtectionExpired()) {
                return {
                    protected: true,
                    timeLeft: npc.getProtectionTimeLeft(),
                    protectionType: 'NPC global'
                };
            }
        } else {
            // For player targets, check if they have global protection
            const character = await Character.findById(targetId);
            if (character && character.stealProtection?.isProtected && !character.isProtectionExpired()) {
                return {
                    protected: true,
                    timeLeft: character.getProtectionTimeLeft(),
                    protectionType: 'player global'
                };
            }
        }
        
        return { protected: false };
    } catch (error) {
        logger.error('NPC', 'Error checking target protection', error);
        return { protected: false };
    }
}

// ------------------- Check Individual NPC Cooldown -------------------
// Check if a character can steal from a specific NPC (30-day cooldown for the thief)
async function checkIndividualNPCCooldown(characterId, npcName) {
    try {
        const npc = await NPC.findOne({ name: npcName });
        if (!npc) {
            return { onCooldown: false };
        }
        
        // Check if character has an active personal lockout
        const personalLockout = npc.personalLockouts?.find(lockout => 
            lockout.characterId.toString() === characterId.toString() && 
            lockout.lockoutEndTime > new Date()
        );
        
        if (personalLockout) {
            return {
                onCooldown: true,
                timeLeft: personalLockout.lockoutEndTime.getTime() - Date.now(),
                cooldownType: 'NPC individual'
            };
        }
        
        return { onCooldown: false };
    } catch (error) {
        logger.error('NPC', 'Error checking individual NPC cooldown', error);
        return { onCooldown: false };
    }
}

// ------------------- Set Target Protection -------------------
// Set global protection on target (applies to ALL thieves)
async function setTargetProtection(targetId, isNPCTarget, wasSuccessful) {
    try {
        let protectionDuration;
        
        if (wasSuccessful) {
            protectionDuration = GLOBAL_SUCCESS_COOLDOWN; // 1 week
        } else {
            protectionDuration = GLOBAL_FAILURE_COOLDOWN; // 24 hours
        }
        
        if (isNPCTarget) {
            // For NPCs, set global protection
            await NPC.setProtection(targetId, protectionDuration);
        } else {
            // For player targets, set global protection
            const character = await Character.findById(targetId);
            if (character) {
                character.setProtection(protectionDuration);
                await character.save();
            }
        }
        
        logger.info('NPC', `Set target protection for ${targetId} (${isNPCTarget ? 'NPC' : 'player'}) for ${wasSuccessful ? '1 week' : '24 hours'}`);
    } catch (error) {
        logger.error('NPC', 'Error setting target protection', error);
    }
}

// ------------------- Set Individual NPC Cooldown -------------------
// Set individual cooldown for thief stealing from specific NPC (30 days)
async function setIndividualNPCCooldown(characterId, npcName) {
    try {
        await NPC.setPersonalLockout(npcName, characterId, NPC_COOLDOWN);
        logger.info('NPC', `Set individual NPC cooldown for ${characterId} -> ${npcName} for 30 days`);
    } catch (error) {
        logger.error('NPC', 'Error setting individual NPC cooldown', error);
    }
}

// Note: Cleanup of expired personal lockouts is now handled automatically
// by the NPC model's pre-save middleware

// ------------------- Format Cooldown Time -------------------
// Format remaining cooldown time for display
function formatCooldownTime(timeLeft) {
    const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
    const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
    
    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
            return `${minutes}m`;
    }
}

// ------------------- Get All Cooldown Information -------------------
// Get all cooldown information for a character (NPCs and player targets)
// characterId is optional - if not provided, only global cooldowns are shown
async function getAllCooldownInfo(characterId = null) {
    try {
        const cooldowns = {
            npcs: [],
            players: []
        };

        // Get all NPCs from the NPCs object (source of truth)
        const allNPCNames = Object.keys(NPCs);
        
        for (const npcName of allNPCNames) {
            // Get NPC from database if it exists
            const npc = await NPC.findOne({ name: npcName });
            
            // Check global protection (applies to all thieves)
            let globalCooldown = null;
            if (npc?.stealProtection?.isProtected && !npc.isProtectionExpired()) {
                const timeLeft = npc.getProtectionTimeLeft();
                globalCooldown = {
                    active: true,
                    timeLeft: timeLeft,
                    formatted: formatCooldownTime(timeLeft),
                    type: 'global'
                };
            }

            // Check personal lockout (30-day cooldown for this character) - only if characterId is provided
            let personalCooldown = null;
            if (characterId && npc?.personalLockouts) {
                const personalLockout = npc.personalLockouts.find(lockout => 
                    lockout.characterId.toString() === characterId.toString() && 
                    lockout.lockoutEndTime > new Date()
                );
                
                if (personalLockout) {
                    const timeLeft = personalLockout.lockoutEndTime.getTime() - Date.now();
                    personalCooldown = {
                        active: true,
                        timeLeft: timeLeft,
                        formatted: formatCooldownTime(timeLeft),
                        type: 'personal'
                    };
                }
            }

            // Always include NPCs in the list (with or without cooldowns)
            cooldowns.npcs.push({
                name: npcName,
                global: globalCooldown,
                personal: personalCooldown,
                icon: NPCs[npcName]?.icon || null
            });
        }

        // Get all player characters that have protection - only if characterId is provided
        if (characterId) {
            const protectedCharacters = await Character.find({
                'stealProtection.isProtected': true,
                _id: { $ne: characterId } // Exclude self
            });

            for (const char of protectedCharacters) {
                // Check if protection is still active
                if (char.stealProtection?.isProtected && !char.isProtectionExpired()) {
                    const timeLeft = char.getProtectionTimeLeft();
                    if (timeLeft > 0) {
                        cooldowns.players.push({
                            name: char.name,
                            global: {
                                active: true,
                                timeLeft: timeLeft,
                                formatted: formatCooldownTime(timeLeft),
                                type: 'global'
                            },
                            icon: char.icon || null
                        });
                    }
                }
            }
        }

        // Sort NPCs: ones with cooldowns first, then by name
        cooldowns.npcs.sort((a, b) => {
            const aHasCooldown = a.global || a.personal;
            const bHasCooldown = b.global || b.personal;
            
            if (aHasCooldown && !bHasCooldown) return -1;
            if (!aHasCooldown && bHasCooldown) return 1;
            return a.name.localeCompare(b.name);
        });
        // Sort players by name
        cooldowns.players.sort((a, b) => a.name.localeCompare(b.name));

        return cooldowns;
    } catch (error) {
        logger.error('NPC', 'Error getting all cooldown info', error);
        return { npcs: [], players: [] };
    }
}

// ------------------- Get Single Target Cooldown Information -------------------
// Get cooldown information for a specific NPC or player target
async function getTargetCooldownInfo(characterId, targetName, isNPC) {
    try {
        if (isNPC) {
            const npc = await NPC.findOne({ name: targetName });
            if (!npc) {
                return null;
            }

            // Check global protection
            let globalCooldown = null;
            if (npc.stealProtection?.isProtected && !npc.isProtectionExpired()) {
                const timeLeft = npc.getProtectionTimeLeft();
                globalCooldown = {
                    active: true,
                    timeLeft: timeLeft,
                    formatted: formatCooldownTime(timeLeft),
                    type: 'global'
                };
            }

            // Check personal lockout
            let personalCooldown = null;
            const personalLockout = npc.personalLockouts?.find(lockout => 
                lockout.characterId.toString() === characterId.toString() && 
                lockout.lockoutEndTime > new Date()
            );
            
            if (personalLockout) {
                const timeLeft = personalLockout.lockoutEndTime.getTime() - Date.now();
                personalCooldown = {
                    active: true,
                    timeLeft: timeLeft,
                    formatted: formatCooldownTime(timeLeft),
                    type: 'personal'
                };
            }

            return {
                name: npc.name,
                isNPC: true,
                global: globalCooldown,
                personal: personalCooldown,
                icon: NPCs[npc.name]?.icon || null
            };
        } else {
            const character = await Character.findOne({ name: targetName });
            if (!character) {
                return null;
            }

            // Check global protection
            let globalCooldown = null;
            if (character.stealProtection?.isProtected && !character.isProtectionExpired()) {
                const timeLeft = character.getProtectionTimeLeft();
                if (timeLeft > 0) {
                    globalCooldown = {
                        active: true,
                        timeLeft: timeLeft,
                        formatted: formatCooldownTime(timeLeft),
                        type: 'global'
                    };
                }
            }

            return {
                name: character.name,
                isNPC: false,
                global: globalCooldown,
                icon: character.icon || null
            };
        }
    } catch (error) {
        logger.error('NPC', 'Error getting target cooldown info', error);
        return null;
    }
}

// Reset all protections
async function resetAllStealProtections() {
  try {
    logger.info('SYNC', 'Starting steal protection reset');
    
    // Reset NPC protections and personal lockouts
    const npcProtectionResult = await NPC.resetAllProtections();
    const npcLockoutResult = await NPC.resetAllPersonalLockouts();
    
    // Reset player character protections
    const characterResult = await Character.updateMany(
      { 'stealProtection.isProtected': true },
      {
        $set: {
          'stealProtection.isProtected': false,
          'stealProtection.protectionEndTime': null
        }
      }
    );
    
    const totalNpcResets = npcProtectionResult.modifiedCount + npcLockoutResult.modifiedCount;
    logger.success('SYNC', `Steal protection reset complete: ${totalNpcResets} NPC protections, ${characterResult.modifiedCount} player protections`);
  } catch (error) {
    logger.error('JOB', '❌ Error resetting steal protections', error);
    
            // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'resetAllStealProtections'
        });
  }
}

// ------------------- Cleanup expired protections -------------------
function cleanupExpiredProtections() {
    // Database models now handle their own cleanup via pre-save middleware
}

// ------------------- Statistics Functions -------------------
async function updateStealStats(characterId, success, itemRarity, victimCharacter = null, isNPC = false, npcName = null) {
    try {
        let stats = await StealStats.findOne({ characterId });
        
        if (!stats) {
            stats = new StealStats({
                characterId,
                totalAttempts: 0,
                successfulSteals: 0,
                failedSteals: 0,
                itemsByRarity: {
                    common: 0,
                    uncommon: 0
                },
                victims: []
            });
        }
        
        stats.totalAttempts++;
        if (success) {
            stats.successfulSteals++;
            stats.itemsByRarity[itemRarity]++;
            
            // Update victim tracking if this was a successful steal
            if (victimCharacter && !isNPC) {
                // Player character victim
                const victimIndex = stats.victims.findIndex(v => 
                    v.characterId && v.characterId.toString() === victimCharacter._id.toString()
                );
                
                if (victimIndex === -1) {
                    // Add new victim
                    stats.victims.push({
                        characterId: victimCharacter._id,
                        characterName: victimCharacter.name,
                        count: 1,
                        isNPC: false
                    });
                } else {
                    // Increment existing victim count
                    stats.victims[victimIndex].count++;
                }
            } else if (isNPC && npcName) {
                // NPC victim
                const victimIndex = stats.victims.findIndex(v => 
                    v.isNPC && v.characterName === npcName
                );
                
                if (victimIndex === -1) {
                    // Add new NPC victim
                    stats.victims.push({
                        characterId: null,
                        characterName: npcName,
                        count: 1,
                        isNPC: true
                    });
                } else {
                    // Increment existing NPC victim count
                    stats.victims[victimIndex].count++;
                }
            }
        } else {
            stats.failedSteals++;
        }
        
        await stats.save();
    } catch (error) {
        logger.error('JOB', 'Error updating steal stats', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'updateStealStats',
            characterId: characterId,
            success: success,
            itemRarity: itemRarity
        });
    }
}

async function getStealStats(characterId) {
    try {
        const stats = await StealStats.findOne({ characterId });
        if (!stats) {
            return {
                totalAttempts: 0,
                successfulSteals: 0,
                failedSteals: 0,
                successRate: 0,
                itemsByRarity: {
                    common: 0,
                    uncommon: 0
                },
                victims: []
            };
        }
        
        const successRate = stats.totalAttempts > 0 
            ? ((stats.successfulSteals / stats.totalAttempts) * 100).toFixed(1)
            : 0;
            
        return {
            ...stats.toObject(),
            successRate
        };
    } catch (error) {
        logger.error('JOB', 'Error getting steal stats', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'getStealStats',
            characterId: characterId
        });
        
        return {
            totalAttempts: 0,
            successfulSteals: 0,
            failedSteals: 0,
            successRate: 0,
            itemsByRarity: {
                common: 0,
                uncommon: 0
            },
            victims: []
        };
    }
}

// ------------------- Item Management Functions -------------------
async function getItemEmoji(itemName) {
    try {
        const item = await ItemModel.findOne({ itemName: new RegExp(`^${escapeRegexString(itemName)}$`, 'i') }).select('emoji').exec();
        if (item && item.emoji) {
            return item.emoji;
        }
        const itemDetails = await ItemModel.findOne({ itemName: new RegExp(`^${escapeRegexString(itemName)}$`, 'i') }).select('type category').exec();
        if (itemDetails) {
            if (itemDetails.type?.includes('Weapon')) return '⚔️';
            if (itemDetails.type?.includes('Armor')) return '🛡️';
            if (itemDetails.category?.includes('Material')) return '📦';
            if (itemDetails.category?.includes('Food')) return '🍖';
            if (itemDetails.category?.includes('Potion')) return '🧪';
        }
        return '📦';
    } catch (error) {
        logger.error('JOB', 'Error getting item emoji', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'getItemEmoji',
            itemName: itemName
        });
        
        return '📦';
    }
}

// ------------------- Updated Quantity Determination -------------------
// Updated to handle different item types properly
function determineStealQuantity(item) {
    // For NPC items (unlimited quantity)
    if (item.isNPC) {
        let quantityToSteal = 1;
        if (item.tier === 'common') {
            quantityToSteal = Math.floor(Math.random() * 3) + 1; // 1-3
        } else if (item.tier === 'uncommon') {
            quantityToSteal = Math.floor(Math.random() * 2) + 1; // 1-2
        }
        return quantityToSteal;
    }
    
    // For player items (limited by actual inventory quantity)
    const availableQuantity = item.quantity || 1;
    let quantityToSteal = 1;
    
    if (item.tier === 'common') {
        quantityToSteal = Math.min(availableQuantity, Math.floor(Math.random() * 3) + 1);
    } else if (item.tier === 'uncommon') {
        quantityToSteal = Math.min(availableQuantity, Math.floor(Math.random() * 2) + 1);
    }
    
    return quantityToSteal;
}

function getRandomItemByWeight(items) {
    const totalWeight = items.reduce(
        (acc, item) => acc + (item.weight !== undefined ? item.weight : RARITY_WEIGHTS[item.itemRarity]),
        0
    );
    let randomValue = Math.random() * totalWeight;
    for (const item of items) {
        const currentWeight = item.weight !== undefined ? item.weight : RARITY_WEIGHTS[item.itemRarity];
        randomValue -= currentWeight;
        if (randomValue <= 0) return item;
    }
    return null;
}

// ------------------- Custom Weapon Protection Functions -------------------
// Function to check if an item is a custom weapon (protected from theft)
async function isCustomWeapon(itemName) {
    try {
        const db = await connectToInventoriesForItems();
        const item = await db.collection("items").findOne(
            { itemName: new RegExp(`^${escapeRegexString(itemName)}$`, 'i') },
            { category: 1 }
        );
        
        if (item && item.category && Array.isArray(item.category)) {
            return item.category.includes('Custom Weapon');
        }
        return false;
    } catch (error) {
        logger.error('LOOT', '❌ Error checking if item is custom weapon', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'isCustomWeapon check',
            itemName: itemName
        });
        
        return false; // Default to allowing theft if check fails
    }
}

// ------------------- Jail Management Functions -------------------
// Jail functions are now imported from shared/utils/jailCheck.js
// Only roleplay-specific jail embed function remains here

// ------------------- Centralized Error Handling -------------------
// Centralized error handling for steal operations to eliminate duplication
async function handleStealError(error, interaction, operationType) {
    logger.error('JOB', `❌ Critical error during ${operationType} flow: ${operationType}`, error);
    
    // Call global error handler with enhanced context
    handleInteractionError(error, 'steal.js', {
        commandName: 'steal',
        userTag: interaction.user.tag,
        userId: interaction.user.id,
        subcommand: interaction.options?.getSubcommand?.() || 'unknown',
        operationType: operationType,
        options: {
            characterName: interaction.options?.getString('charactername'),
            targetType: interaction.options?.getString('targettype'),
            targetName: interaction.options?.getString('target'),
            raritySelection: interaction.options?.getString('rarity')
        }
    });
    
    // Provide more specific error messages based on the error type
    let errorMessage = '❌ **An error occurred while processing the steal.**';
    
    if (error.name === 'MongoError' || error.name === 'MongoServerError') {
        if (error.code === 11000) {
            errorMessage = '❌ **Database duplicate key error during steal processing.**\n🔄 Please try again in a moment.';
        } else if (error.code === 121) {
            errorMessage = '❌ **Database validation error during steal processing.**\n🔄 Please try again in a moment.';
        } else {
            errorMessage = `❌ **Database error during steal processing (Code: ${error.code}).**\n🔄 Please try again in a moment.`;
        }
    } else if (error.name === 'TypeError') {
        if (error.message.includes('Cannot read properties of undefined') || error.message.includes('Cannot read properties of null')) {
            errorMessage = '❌ **Data structure error during steal processing.**\n🔄 The target may have invalid data. Please try again or contact a mod and submit an error report.';
        } else {
            errorMessage = '❌ **Data type error during steal processing.**\n🔄 Please try again or contact a mod and submit an error report.';
        }
    } else if (error.name === 'ReferenceError') {
        errorMessage = '❌ **System configuration error during steal processing.**\n🔄 Please contact a mod immediately and submit an error report.';
    } else if (error.message && error.message.includes('timeout')) {
        errorMessage = '❌ **Database operation timed out during steal processing.**\n🔄 Please try again in a moment.';
    } else if (error.message && error.message.includes('network')) {
        errorMessage = '❌ **Network error during steal processing.**\n🔄 Please check your connection and try again.';
    }
    
    // Add debugging information for staff
    const debugInfo = `\n\n**Debug Info:**\n• Operation: ${operationType}\n• Error: ${error.name}: ${error.message}`;
    
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ 
                content: errorMessage + debugInfo + '\n\n⚠️ **Note:** If you see an item in your inventory that shouldn\'t be there, please contact a mod immediately and submit an error report.' 
            });
        } else {
            await interaction.reply({ 
                content: errorMessage + debugInfo + '\n\n⚠️ **Note:** If you see an item in your inventory that shouldn\'t be there, please contact a mod immediately and submit an error report.', 
                ephemeral: true 
            });
        }
    } catch (followUpError) {
        logger.error('JOB', '❌ Failed to send error message', followUpError);
    }
}

// ------------------- Centralized Job Voucher Management -------------------
// Centralized job voucher deactivation to eliminate duplication
// 
// This function handles the deactivation of job vouchers after steal attempts.
// It only deactivates vouchers that were actually activated (not skipped).
//
// Parameters:
// - thiefCharacter: The character who attempted the steal
// - voucherCheck: The result from validateJobVoucher() or undefined if no voucher
//
// Voucher Deactivation Logic:
// - If character has jobVoucher = true AND voucherCheck exists AND not skipVoucher = true
// - Then deactivate the voucher (it was activated for this steal attempt)
// - Otherwise, no deactivation needed (no voucher or was skipped)
async function deactivateJobVoucherIfNeeded(thiefCharacter, voucherCheck) {
    // Only deactivate if character has a voucher and it's not a skip case
    if (thiefCharacter.jobVoucher && voucherCheck && !voucherCheck.skipVoucher) {
        const deactivationResult = await deactivateJobVoucher(thiefCharacter._id, { afterUse: true });
        if (!deactivationResult.success) {
            logger.error('JOB', `❌ Failed to deactivate job voucher for ${thiefCharacter.name}`);
        } else {
            logger.success('JOB', `✅ Job voucher deactivated for ${thiefCharacter.name}`);
        }
    }
}

// ------------------- Failed Attempts Calculation Helper -------------------
// Calculate max attempts, current attempts, and attempts remaining before jail
async function getFailedAttemptsInfo(character) {
    const currentAttempts = character.failedStealAttempts || 0;
    let maxAttempts = 3; // Base: 3 failed attempts before jail
    let hasTeacherBoost = false;
    
    // Check if character is boosted by a Teacher (increases max attempts to 4)
    if (character.boostedBy) {
        const { fetchCharacterByName } = require('@/database/db');
        const boosterChar = await fetchCharacterByName(character.boostedBy);
        if (boosterChar && boosterChar.job === 'Teacher') {
            maxAttempts = 4;
            hasTeacherBoost = true;
        }
    }
    
    const attemptsRemaining = Math.max(0, maxAttempts - currentAttempts);
    
    return {
        maxAttempts,
        currentAttempts,
        attemptsRemaining,
        hasTeacherBoost
    };
}

// ------------------- Centralized Failed Attempts Handling -------------------
// Centralized failed attempts logic to eliminate duplication
async function handleFailedAttempts(thiefCharacter, embed) {
    const priorAttempts = thiefCharacter.failedStealAttempts || 0;
    let maxAttempts = 3; // Base: 3 failed attempts before jail
    let teacherFreeFailApplied = false;
    let boosterChar = null;
    
    if (thiefCharacter.boostedBy) {
        const { fetchCharacterByName } = require('@/database/db');
        boosterChar = await fetchCharacterByName(thiefCharacter.boostedBy);
        if (boosterChar && boosterChar.job === 'Teacher') {
            teacherFreeFailApplied = true;
            logger.info('BOOST', '📖 Teacher boost - Tactical Risk absorbed this failed attempt (no strike recorded)');
        }
    }
    
    if (!teacherFreeFailApplied) {
        thiefCharacter.failedStealAttempts = priorAttempts + 1;
        await thiefCharacter.save();
        
        if (boosterChar && boosterChar.job === 'Teacher') {
            maxAttempts = 4;
            logger.info('BOOST', '📖 Teacher boost - Tactical Risk (+1 extra attempt before jail)');
        }
    }
    
    const attemptsAfter = teacherFreeFailApplied ? priorAttempts : (thiefCharacter.failedStealAttempts || 0);
    const attemptsLeft = maxAttempts - attemptsAfter;
    let warningMessage = '';
    let attemptsText = '';
    
    if (teacherFreeFailApplied) {
        const remaining = Math.max(0, attemptsLeft);
        attemptsText = `Tactical Risk absorbed this failure. You still have ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before jail time!`;
    } else if (attemptsLeft === 1) {
        warningMessage = '⚠️ **Final Warning:** One more failed attempt and you\'ll be sent to jail!';
        attemptsText = 'You have 1 attempt remaining before jail time!';
    } else if (attemptsLeft <= 0) {
        // Send to jail using centralized function
        const jailResult = await sendToJail(thiefCharacter);
        const dayMs = 24 * 60 * 60 * 1000;
        const jailDurationMs = thiefCharacter.jailDurationMs || (jailResult.success ? Math.ceil(jailResult.timeLeft / dayMs) * dayMs : DEFAULT_JAIL_DURATION_MS);
        const jailDays = Math.max(1, Math.round(jailDurationMs / dayMs));
        warningMessage = `⛔ **You have been sent to jail for ${jailDays} day${jailDays !== 1 ? 's' : ''}!**`;
        attemptsText = 'Too many failed attempts!';
    } else {
        attemptsText = `You have ${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} remaining before jail time!`;
    }
    
    embed.addFields({
        name: '⚠️ Failed Attempts',
        value: warningMessage ? `${warningMessage}\n${attemptsText}` : attemptsText,
        inline: false
    });
}

// ------------------- Blight Infection Helper Function -------------------
// Check if thief should be infected with blight when stealing from a blighted target
async function checkBlightInfection(thiefCharacter, targetCharacter, isNPC, interaction) {
    // Only check for blight infection when stealing from players (not NPCs)
    if (isNPC) {
        return { infected: false, message: null };
    }

    // Mod characters are immune to blight infection
    if (thiefCharacter.isModCharacter) {
        return { infected: false, message: null };
    }

    // Check if target has stage 3 or higher blight
    if (!targetCharacter.blighted || targetCharacter.blightStage < 3) {
        return { infected: false, message: null };
    }

    // 50% chance of infection
    const infectionRoll = Math.random();
    if (infectionRoll > 0.5) {
        return { infected: false, message: null };
    }

    // Infect the thief with blight
    try {
        // Use shared finalize helper - each step has its own try/catch for resilience
        // Note: deathDeadline is only set at stage 5, not stage 1, so we don't set it here
        await finalizeBlightApplication(
            thiefCharacter,
            interaction.user.id,
            {
                client: interaction.client,
                guild: interaction.guild,
                source: `stealing from ${targetCharacter.name} (Stage ${targetCharacter.blightStage} blight)`,
                alreadySaved: false
            }
        );
        
        return { 
            infected: true, 
            message: `⚠️ **Blight Infection!** ${thiefCharacter.name} has been infected with blight while stealing from ${targetCharacter.name} (Stage ${targetCharacter.blightStage} blight).\n\n🦠 **Blight Stage:** 1\n💊 **Seek healing immediately!**`
        };
    } catch (error) {
        logger.error('BLIGHT', `❌ Failed to infect ${thiefCharacter.name} with blight`, error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'blight infection',
            thiefCharacterName: thiefCharacter?.name,
            targetCharacterName: targetCharacter?.name
        });
        
        return { infected: false, message: null };
    }
}

// ------------------- Centralized Success Handling -------------------
// Centralized success handling to eliminate duplication
async function handleStealSuccess(thiefCharacter, targetCharacter, selectedItem, quantity, roll, failureThreshold, isNPC, interaction, voucherCheck, usedFallback, targetRarity, selectedTier, boostInfo = null) {
    incrementStreak(interaction.user.id);
    await updateStealStats(thiefCharacter._id, true, selectedItem.tier, isNPC ? null : targetCharacter, isNPC, isNPC ? targetCharacter : null);
    const isSuccess = true;
    
    // Check for blight infection
    const blightResult = await checkBlightInfection(thiefCharacter, targetCharacter, isNPC, interaction);
    
            // Set target protection (applies to ALL thieves) and individual NPC cooldown
        try {
            if (isNPC) {
                // Set global protection on NPC (1 week for all thieves)
                await setTargetProtection(targetCharacter, true, true);
                // Set individual cooldown for this thief (30 days)
                await setIndividualNPCCooldown(thiefCharacter._id, targetCharacter);
            }
            // Note: Player targets do not get global protection on successful steals
        } catch (error) {
        logger.error('NPC', 'Error setting protection after successful steal', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            userTag: interaction.user.tag,
            userId: interaction.user.id,
            subcommand: interaction.options?.getSubcommand?.() || 'commit',
            operationType: 'set protection after successful steal',
            options: {
                targetType: isNPC ? 'NPC' : 'player',
                targetName: isNPC ? targetCharacter : targetCharacter?.name,
                characterName: thiefCharacter?.name
            }
        });
        
        // Continue with success logic even if protection setting fails
    }
    
    let finalQuantity = quantity;
    
    // ============================================================================
    // ------------------- Apply Job-Specific Stealing Boosts -------------------
    // ============================================================================
    let scholarCalculatedGrabApplied = false;
    let scholarBoosterName = null;
    if (thiefCharacter.boostedBy) {
        const { fetchCharacterByName } = require('@/database/db');
        const boosterChar = await fetchCharacterByName(thiefCharacter.boostedBy);
        
        if (boosterChar) {
            // Scholar: Calculated Grab (+1 extra item)
            if (boosterChar.job === 'Scholar') {
                finalQuantity += 1;
                scholarCalculatedGrabApplied = true;
                scholarBoosterName = boosterChar.name;
                logger.info('BOOST', `📚 Scholar boost - Calculated Grab (+1 extra item) by ${boosterChar.name}`);
            }
        }
    }

    if (!selectedItem.isNPC && Number.isFinite(selectedItem.quantity)) {
        const maxAvailable = Math.max(1, selectedItem.quantity || 1);
        if (finalQuantity > maxAvailable) {
            logger.warn('BOOST', `📚 Scholar boost capped by available quantity | requested: ${finalQuantity} | available: ${maxAvailable} | item: ${selectedItem.itemName}`);
            finalQuantity = maxAvailable;
        }
    }
    
    const stolenItem = {
        itemName: selectedItem.itemName,
        quantity: finalQuantity,
        obtain: isNPC ? `Stolen from NPC ${targetCharacter}` : `Stolen from ${targetCharacter.name}`,
        date: new Date()
    };
    
    try {
        // Perform the inventory sync
        await syncToInventoryDatabase(thiefCharacter, stolenItem, interaction);
        
        // Log acquisition so it appears under "All Transactions" on the dashboard
        const stealInteractionUrl = interaction ? `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}` : '';
        await logItemAcquisitionToDatabase(thiefCharacter, stolenItem, {
            quantity: finalQuantity,
            obtain: stolenItem.obtain,
            location: thiefCharacter.currentLocation || thiefCharacter.homeVillage || thiefCharacter.currentVillage || '',
            link: stealInteractionUrl,
            dateTime: stolenItem.date
        });
        
        // For player steals, also remove item from target's inventory
        if (!isNPC) {
            const removedItem = {
                itemName: selectedItem.itemName,
                quantity: -finalQuantity,
                obtain: `Item stolen by ${thiefCharacter.name}`,
                date: new Date()
            };
            await syncToInventoryDatabase(targetCharacter, removedItem, interaction);
            // Log removal for victim so it appears in their "All Transactions"
            await logItemRemovalToDatabase(targetCharacter, { itemName: selectedItem.itemName }, {
                quantity: finalQuantity,
                obtain: removedItem.obtain,
                location: targetCharacter.currentLocation || targetCharacter.homeVillage || targetCharacter.currentVillage || '',
                link: stealInteractionUrl,
                dateTime: removedItem.date
            });
        }
        
        // Create and send the embed
        const embedBoostDetails = await getBoostInfo(thiefCharacter, 'Stealing');
        const embed = await createStealResultEmbed(thiefCharacter, targetCharacter, selectedItem, finalQuantity, roll, failureThreshold, true, isNPC, embedBoostDetails);
        
        // Add boost flavor and impact summary (if any)
        if (boostInfo && boostInfo.boosterJob) {
            const boostFlavor = generateBoostFlavorText(boostInfo.boosterJob, 'Stealing', {
                selectedTier: boostInfo.selectedTier,
                selectedItemName: boostInfo.selectedItemName,
            });
            const impactLines = [];
            if (boostInfo.mode === 'highest-rarity') {
                // No extra info in the embed for highest rarity focus
            } else if (boostInfo.baseline && boostInfo.boosted) {
                impactLines.push(`> Uncommon weight: ${boostInfo.baseline.uncommon} → ${boostInfo.boosted.uncommon}`);
                impactLines.push(`> Common weight: ${boostInfo.baseline.common} → ${boostInfo.boosted.common}`);
                impactLines.push(`> Selected: ${boostInfo.selectedTier} (${boostInfo.selectedItemName})`);
            }
            const embedValue = impactLines.length > 0
                ? `${boostFlavor}\n${impactLines.join('\n')}`
                : boostFlavor;
            embed.addFields({
                name: '🎵 Elegy of Emptiness',
                value: embedValue,
                inline: false,
            });
        } else if (embedBoostDetails) {
            const boostName = embedBoostDetails.boostName || 'Active Boost';
            const boostValue = generateBoostFlavorText(embedBoostDetails.boosterJob, 'Stealing', { outcome: isSuccess ? 'success' : 'failure' });
            embed.addFields({
                name: `⚡ ${boostName}`,
                value: boostValue,
                inline: false,
            });
        }
        
        // Add Scholar Calculated Grab flavor text if boost was applied
        if (scholarCalculatedGrabApplied) {
            const originalQuantity = finalQuantity - 1;
            const scholarFlavorText = `📚 **Calculated Grab:** ${scholarBoosterName}'s meticulous notes revealed an extra opportunity! Stole ${originalQuantity} → **${finalQuantity}** items (+1 bonus item)`;
            embed.addFields({
                name: '📚 Calculated Grab',
                value: scholarFlavorText,
                inline: false,
            });
        }

        // Add blight infection message if applicable
        if (blightResult.infected) {
            embed.addFields({
                name: '🦠 Blight Infection',
                value: blightResult.message,
                inline: false
            });
        }
        
        // Add failed attempts count for tracking
        const failedAttempts = thiefCharacter.failedStealAttempts || 0;
        if (failedAttempts > 0) {
            embed.addFields({
                name: '📊 Failed Attempts',
                value: `> You have **${failedAttempts}** failed attempt${failedAttempts !== 1 ? 's' : ''} on record`,
                inline: false
            });
        }
        
            // Add target protection information (only for NPCs)
    if (isNPC) {
        embed.addFields({
            name: '🛡️ Target Protection',
            value: `> **${targetCharacter}** is now protected from theft for **1 week** due to this successful steal!`,
            inline: false
        });
        
        // Add personal lockout information
        embed.addFields({
            name: '🔒 Personal Lockout',
            value: `> **${targetCharacter}** is now protected for **1 month** from being stolen from **${thiefCharacter.name}**. Please try stealing from other NPCs!`,
            inline: false
        });
    }
        
        // Add fallback message if needed
        if (usedFallback) {
            const fallbackMessage = getFallbackMessage(targetRarity, selectedTier);
            if (fallbackMessage) {
                embed.addFields({ name: 'Note', value: fallbackMessage, inline: false });
            }
        }
        
        // ------------------- Clear Boost After Use -------------------
        if (thiefCharacter.boostedBy) {
          await clearBoostAfterUse(thiefCharacter, {
            client: interaction?.client,
            context: 'stealing (success)'
          });
        }
        
        // Always deactivate job voucher after any attempt
        await deactivateJobVoucherIfNeeded(thiefCharacter, voucherCheck);
        
        if (isNPC) {
            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply({ embeds: [embed] });
            // Send a separate ping to notify the victim they were stolen from
            if (targetCharacter.userId && interaction.channel) {
                try {
                    await interaction.channel.send({
                        content: `⚠️ <@${targetCharacter.userId}> Your character **${targetCharacter.name}** was stolen from by **${thiefCharacter.name}**!`,
                        allowedMentions: { users: [targetCharacter.userId] }
                    });
                } catch (e) {
                    logger.warn('JOB', `Could not send steal victim ping: ${e.message}`);
                }
            }
        }
    } catch (error) {
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            userTag: interaction.user.tag,
            userId: interaction.user.id,
            subcommand: interaction.options?.getSubcommand?.() || 'commit',
            operationType: isNPC ? 'NPC steal success' : 'player steal success',
            options: {
                targetType: isNPC ? 'NPC' : 'player',
                targetName: isNPC ? targetCharacter : targetCharacter?.name,
                characterName: thiefCharacter?.name
            }
        });
        
        await handleStealError(error, interaction, isNPC ? 'NPC steal success' : 'player steal success');
    }
}

// ------------------- Centralized Failure Handling -------------------
// Centralized failure handling to eliminate duplication
async function handleStealFailure(thiefCharacter, targetCharacter, selectedItem, roll, failureThreshold, isNPC, interaction, voucherCheck, usedFallback, targetRarity, selectedTier) {
    resetStreak(interaction.user.id);
    await updateStealStats(thiefCharacter._id, false, selectedItem.tier);
    
            // Set target protection (applies to ALL thieves) and individual NPC cooldown
        try {
            if (isNPC) {
                // Set global protection on NPC (24 hours for all thieves)
                await setTargetProtection(targetCharacter, true, false);
                // Set individual cooldown for this thief (30 days)
                await setIndividualNPCCooldown(thiefCharacter._id, targetCharacter);
            }
            // Note: Player targets do not get global protection on failed steals
        } catch (error) {
        logger.error('NPC', 'Error setting protection after failed steal', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            userTag: interaction.user.tag,
            userId: interaction.user.id,
            subcommand: interaction.options?.getSubcommand?.() || 'commit',
            operationType: 'set protection after failed steal',
            options: {
                targetType: isNPC ? 'NPC' : 'player',
                targetName: isNPC ? targetCharacter : targetCharacter?.name,
                characterName: thiefCharacter?.name
            }
        });
        
        // Continue with failure logic even if protection setting fails
    }
    
    try {
        const embedBoostDetails = await getBoostInfo(thiefCharacter, 'Stealing');
        const embed = await createStealResultEmbed(thiefCharacter, targetCharacter, selectedItem, 0, roll, failureThreshold, false, isNPC, embedBoostDetails);
        
        // Add fallback message if needed
        if (usedFallback) {
            const fallbackMessage = getFallbackMessage(targetRarity, selectedTier);
            if (fallbackMessage) {
                embed.addFields({ name: 'Note', value: fallbackMessage, inline: false });
            }
        }
        
        // Handle failed attempts and jail logic
        await handleFailedAttempts(thiefCharacter, embed);
        
        // ------------------- Clear Boost After Use -------------------
        if (thiefCharacter.boostedBy) {
          await clearBoostAfterUse(thiefCharacter, {
            client: interaction?.client,
            context: 'stealing (failure)'
          });
        }
        
        // Always deactivate job voucher after any attempt
        await deactivateJobVoucherIfNeeded(thiefCharacter, voucherCheck);
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            userTag: interaction.user.tag,
            userId: interaction.user.id,
            subcommand: interaction.options?.getSubcommand?.() || 'commit',
            operationType: isNPC ? 'NPC steal failure' : 'player steal failure',
            options: {
                targetType: isNPC ? 'NPC' : 'player',
                targetName: isNPC ? targetCharacter : targetCharacter?.name,
                characterName: thiefCharacter?.name
            }
        });
        
        await handleStealError(error, interaction, isNPC ? 'NPC steal failure' : 'player steal failure');
    }
}

// ------------------- Centralized Roll Generation -------------------
// Centralized roll generation to eliminate duplication
async function generateStealRoll(character = null) {
    let roll = Math.floor(Math.random() * 99) + 1;
    logger.debug('JOB', `🎲 Base steal roll: ${roll}${character ? ` | character: ${character.name}` : ''}`);
    
    // ============================================================================
    // ------------------- Apply Fortune Teller Boost (Predicted Opportunity) -------------------
    // ============================================================================
    if (character && character.boostedBy) {
        const { fetchCharacterByName } = require('@/database/db');
        const boosterChar = await fetchCharacterByName(character.boostedBy);
        
        if (boosterChar && boosterChar.job === 'Fortune Teller') {
            // Fortune Teller adds +20 to the roll (effectively +20% success rate)
            roll = Math.min(roll + 20, 99);
            logger.info('BOOST', '🔮 Fortune Teller boost - Predicted Opportunity (+20 to roll, capped at 99)');
        }
    }
    
    // Apply elixir stealth buff if active
    if (character) {
        const buffEffects = getActiveBuffEffects(character);
        if (buffEffects && buffEffects.stealthBoost > 0) {
            roll += buffEffects.stealthBoost;
            logger.info('BUFF', `🧪 Stealth buff applied - Steal roll increased by ${buffEffects.stealthBoost} to ${roll}`);
        }
    }
    
    logger.info('JOB', `🎲 Final steal roll: ${roll}${character ? ` | character: ${character.name}` : ''}`);
    return roll;
}

// ------------------- Centralized Failure Threshold Calculation -------------------
// Centralized failure threshold calculation to eliminate duplication
async function calculateFailureThreshold(itemTier, character = null, targetName = null) {
    let threshold = FAILURE_CHANCES[itemTier];
    
    // Apply Stealing boosts to the failure threshold
    threshold = await applyStealingJailBoost(character.name, threshold);
    
    // Apply NPC-specific difficulty modifiers
    if (targetName && NPC_DIFFICULTY_MODIFIERS[targetName]) {
        // Some NPCs are harder to steal from due to uncommon items
        const difficultyBonus = NPC_DIFFICULTY_MODIFIERS[targetName];
        threshold += difficultyBonus;
        
        // Cap the threshold at 95 to prevent impossible steals
        threshold = Math.min(threshold, 95);
    }
    
    return threshold;
}

// ------------------- Centralized Item Processing -------------------
// Centralized item processing with rarity to eliminate duplication
// OPTIMIZED: Now batches database queries instead of individual calls

// Helper function to escape regex special characters
// Properly escape all regex special characters including +
function escapeRegexString(str) {
  return str.replace(/[.*?^${}()|[\]\\+]/g, '\\$&');
}

async function processItemsWithRarity(itemNames, isNPC = false, inventoryEntries = null) {
    if (!Array.isArray(itemNames) || itemNames.length === 0) {
        return [];
    }
    
    try {
        if (isNPC) {
            // NPC items: batch fetch all rarities at once
            const uniqueItemNames = [...new Set(itemNames)]; // Remove duplicates
            
            // Batch fetch all item rarities in one database query
            const db = await connectToInventoriesForItems();
            const items = await db.collection("items").find({
                itemName: { $in: uniqueItemNames.map(name => new RegExp(`^${escapeRegexString(name)}$`, 'i')) }
            }, { itemName: 1, itemRarity: 1 }).toArray();
            
            // Create a map for fast lookup
            const rarityMap = new Map();
            items.forEach(item => {
                rarityMap.set(item.itemName.toLowerCase(), item.itemRarity);
            });
            
            // Process items with batched rarities
            return itemNames.map(itemName => {
                const itemRarity = rarityMap.get(itemName.toLowerCase()) || 1; // Default to common if not found
                return { 
                    itemName, 
                    itemRarity,
                    quantity: Infinity, // NPCs have unlimited quantities
                    isNPC: true
                };
            });
        } else {
            // Player items: preserve quantity information from inventory
            const uniqueItemNames = [...new Set(itemNames)]; // Remove duplicates
            
            // Batch fetch all item rarities in one database query
            const db = await connectToInventoriesForItems();
            const items = await db.collection("items").find({
                itemName: { $in: uniqueItemNames.map(name => new RegExp(`^${escapeRegexString(name)}$`, 'i')) }
            }, { itemName: 1, itemRarity: 1 }).toArray();
            
            // Create a map for fast lookup
            const rarityMap = new Map();
            items.forEach(item => {
                rarityMap.set(item.itemName.toLowerCase(), item.itemRarity);
            });
            
            // Process items with batched rarities and inventory quantities
            return itemNames.map(itemName => {
                const itemRarity = rarityMap.get(itemName.toLowerCase()) || 1; // Default to common if not found
                const inventoryEntry = inventoryEntries?.find(entry => entry.itemName === itemName);
                const quantity = inventoryEntry?.quantity || 1;
                
                return { 
                    itemName, 
                    itemRarity,
                    quantity: quantity,
                    isNPC: false
                };
            });
        }
    } catch (error) {
        logger.error('LOOT', '❌ Error in processItemsWithRarity', error);
        
        // Log additional context for debugging
        logger.debug('LOOT', `📊 Debug info - Item names count: ${itemNames?.length || 0}, isNPC: ${isNPC}`);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'processItemsWithRarity',
            itemNames: itemNames,
            isNPC: isNPC
        });
        
        // Fallback to individual processing if batch fails
        logger.warn('LOOT', '⚠️ Falling back to individual item processing');
        return await processItemsWithRarityFallback(itemNames, isNPC, inventoryEntries);
    }
}

// ------------------- Fallback Item Processing -------------------
// Fallback method if batch processing fails
async function processItemsWithRarityFallback(itemNames, isNPC = false, inventoryEntries = null) {
    if (isNPC) {
        // NPC items: convert strings to objects with unlimited quantity
        return await Promise.all(
            itemNames.map(async itemName => {
                const itemRarity = await fetchItemRarityByName(itemName);
                return { 
                    itemName, 
                    itemRarity,
                    quantity: Infinity, // NPCs have unlimited quantities
                    isNPC: true
                };
            })
        );
    } else {
        // Player items: preserve quantity information from inventory
        return await Promise.all(
            itemNames.map(async itemName => {
                const itemRarity = await fetchItemRarityByName(itemName);
                // Find the corresponding inventory entry to get actual quantity
                const inventoryEntry = inventoryEntries?.find(entry => entry.itemName === itemName);
                const quantity = inventoryEntry?.quantity || 1;
                
                return { 
                    itemName, 
                    itemRarity,
                    quantity: quantity,
                    isNPC: false
                };
            })
        );
    }
}

// ============================================================================
// ---- Command Definition ----
// ============================================================================

module.exports = {
    data: new SlashCommandBuilder()
        .setName('steal')
        .setDescription('Steal an item from another character or NPC.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('commit')
                .setDescription('Commit a theft from another character or NPC.')
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Your character name')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('targettype')
                        .setDescription('Choose NPC or Player as target')
                        .setRequired(true)
                        .addChoices(
                            { name: 'NPC', value: 'npc' },
                            { name: 'Player', value: 'player' }
                        ))
                .addStringOption(option =>
                    option.setName('target')
                        .setDescription('Target character or NPC name')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('rarity')
                        .setDescription('Rarity of the item to steal')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Toggle whether your character can be stolen from.')
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Your character name')
                        .setRequired(true)
                        .setAutocomplete(true))
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Whether to allow stealing from this character')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('jailtime')
                .setDescription('Check remaining jail time for your character.')
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Your character name')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View your stealing statistics.')
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Your character name')
                        .setRequired(true)
                        .setAutocomplete(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cooldown')
                .setDescription('Check cooldown times for stealing from NPCs and characters.')
                .addStringOption(option =>
                    option.setName('targettype')
                        .setDescription('Choose NPC or Player as target (required when checking a specific target)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'NPC', value: 'npc' },
                            { name: 'Player', value: 'player' }
                        ))
                .addStringOption(option =>
                    option.setName('charactername')
                        .setDescription('Your character name (optional - required for personal cooldowns)')
                        .setRequired(false)
                        .setAutocomplete(true))
                .addStringOption(option =>
                    option.setName('target')
                        .setDescription('Specific NPC or character to check (optional)')
                        .setRequired(false)
                        .setAutocomplete(true))),

    // ============================================================================
    // ---- Command Handlers ----
    // ============================================================================

    // ------------------- Main Execute Handler -------------------
    async execute(interaction) {
        // Performance timing - declare at function start so it's available throughout
        const startTime = Date.now();
        
        try {
            // Clean up expired protections at the start of each command
            cleanupExpiredProtections();
            
            const subcommand = interaction.options.getSubcommand();
            const characterName = interaction.options.getString('charactername');
            const targetName = interaction.options.getString('target');
            const targetType = interaction.options.getString('targettype');
            const raritySelection = interaction.options.getString('rarity')?.toLowerCase();

            // Handle subcommands first
            if (subcommand === 'toggle') {
                const enabled = interaction.options.getBoolean('enabled');

                const { valid, error, character } = await validateCharacter(characterName, interaction.user.id);
                if (!valid) {
                    await interaction.reply({ content: error, ephemeral: true });
                    return;
                }

                // Prevent Bandits from disabling canBeStolenFrom
                if (!enabled && character.job === 'Bandit') {
                    await interaction.reply({ 
                        content: '❌ **Bandits cannot disable the "can be stolen from" setting.** This is a permanent restriction for characters with the Bandit job.', 
                        ephemeral: true 
                    });
                    return;
                }

                await interaction.deferReply();

                character.canBeStolenFrom = enabled;
                await character.save();

                const embed = createBaseEmbed('🔒 Steal Permissions Updated', enabled ? '#00ff00' : '#ff0000')
                    .setDescription(`Steal permissions for **${character.name}** have been ${enabled ? 'enabled' : 'disabled'}.`)
                    .addFields(
                        { name: 'Status', value: enabled ? '✅ Can be stolen from' : '❌ Cannot be stolen from', inline: false }
                    )
                    .setThumbnail(character.icon);

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            if (subcommand === 'jailtime') {
                const { valid, error, character } = await validateCharacter(characterName, interaction.user.id);
                if (!valid) {
                    await interaction.reply({ content: error, ephemeral: true });
                    return;
                }

                await interaction.deferReply();

                // Use centralized jail status check
                const jailStatus = await checkJailStatus(character);
                
                if (!jailStatus.isInJail) {
                    // Get failed attempts information
                    const attemptsInfo = await getFailedAttemptsInfo(character);
                    
                    const notInJailEmbed = createBaseEmbed('✅ Not in Jail', '#00ff00')
                        .setDescription(`**${character.name}** is not currently in jail.`)
                        .setThumbnail(character.icon)
                        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
                    
                    // Add failed attempts information
                    let attemptsValue = `> **${attemptsInfo.currentAttempts}** failed attempt${attemptsInfo.currentAttempts !== 1 ? 's' : ''} on record\n`;
                    attemptsValue += `> **${attemptsInfo.attemptsRemaining}** attempt${attemptsInfo.attemptsRemaining !== 1 ? 's' : ''} remaining before jail time`;
                    if (attemptsInfo.hasTeacherBoost) {
                        attemptsValue += `\n> 📖 *Teacher boost active (max ${attemptsInfo.maxAttempts} attempts)*`;
                    }
                    
                    const attemptsFieldName = attemptsInfo.attemptsRemaining === 1 
                        ? '⚠️ Failed Attempts (Final Warning!)' 
                        : '⚠️ Failed Attempts';
                    
                    notInJailEmbed.addFields({
                        name: attemptsFieldName,
                        value: attemptsValue,
                        inline: false
                    });
                    
                    await interaction.editReply({ embeds: [notInJailEmbed] });
                    return;
                }

                // The stored time is already in EST midnight
                const estReleaseDate = new Date(character.jailReleaseTime);
                
                const embed = createBaseEmbed('⏰ Jail Time Remaining', '#ff0000')
                    .setDescription(`**${character.name}** is currently in jail.`)
                    .addFields(
                        { name: '⏰ Time Remaining', value: `<t:${Math.floor((Date.now() + jailStatus.timeLeft) / 1000)}:R>`, inline: false },
                        { name: '📅 Release Date', value: `${estReleaseDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' })} (Midnight EST)`, inline: false },
                        { name: '📅 Jailed Date', value: `${jailStatus.jailedDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' })}`, inline: false },
                        { name: '📅 Formatted Time', value: formatJailTimeLeftDaysHours(jailStatus.timeLeft), inline: false }
                    )
                    .setThumbnail(character.icon)
                    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            if (subcommand === 'stats') {
                const { valid, error, character } = await validateCharacter(characterName, interaction.user.id);
                if (!valid) {
                    await interaction.reply({ content: error, ephemeral: true });
                    return;
                }

                await interaction.deferReply();

                const stats = await getStealStats(character._id);
                
                // Sort victims by count
                const sortedVictims = stats.victims.sort((a, b) => b.count - a.count);
                const victimsList = sortedVictims.length > 0 
                    ? sortedVictims.map(v => {
                        const npcIndicator = v.isNPC ? ' (NPC)' : '';
                        return `**${v.characterName}**${npcIndicator}: ${v.count} time${v.count > 1 ? 's' : ''}`;
                    }).join('\n')
                    : 'No successful steals yet';
                
                // Check protection status
                const protectionStatusResult = await isProtected(character._id);
                const protectionStatus = protectionStatusResult.protected && protectionStatusResult.timeLeft > 0
                    ? `🛡️ Protected (${Math.ceil(protectionStatusResult.timeLeft / (60 * 1000))}m remaining)`
                    : '✅ Not protected';
                
                // Check jail status using centralized function
                let jailStatus = '';
                const jailStatusResult = await checkJailStatus(character);
                if (jailStatusResult.isInJail) {
                    const daysUntilRelease = Math.ceil(jailStatusResult.timeLeft / (24 * 60 * 60 * 1000));
                    const releaseDate = new Date(character.jailReleaseTime).toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        timeZone: 'America/New_York'
                    });
                    jailStatus = `⛔ **In Jail** - Released on ${releaseDate} (${daysUntilRelease} day${daysUntilRelease !== 1 ? 's' : ''} remaining)`;
                }
                
                // Get failed attempts information (only if not in jail, since attempts reset when jailed)
                let attemptsInfo = null;
                if (!jailStatusResult.isInJail) {
                    attemptsInfo = await getFailedAttemptsInfo(character);
                }
                
                const embed = createBaseEmbed('📊 Steal Statistics')
                    .setDescription(`Statistics for **${character.name}** the ${character.job ? character.job.charAt(0).toUpperCase() + character.job.slice(1).toLowerCase() : 'No Job'}`)
                    .setThumbnail(character.icon)
                    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
                    .addFields(
                        { name: '__🎯 Total Attempts__', value: `> ${stats.totalAttempts}`, inline: true },
                        { name: '__✅ Successful Steals__', value: `> ${stats.successfulSteals}`, inline: true },
                        { name: '__❌ Failed Steals__', value: `> ${stats.failedSteals}`, inline: true },
                        { name: '__📈 Success Rate__', value: `> ${stats.successRate}%`, inline: true },
                        { name: '__🛡️ Protection Status__', value: `> ${protectionStatus}`, inline: true }
                    );
                
                // Add failed attempts information if not in jail
                if (attemptsInfo) {
                    let attemptsValue = `> **${attemptsInfo.currentAttempts}** failed attempt${attemptsInfo.currentAttempts !== 1 ? 's' : ''} on record\n`;
                    attemptsValue += `> **${attemptsInfo.attemptsRemaining}** attempt${attemptsInfo.attemptsRemaining !== 1 ? 's' : ''} remaining before jail time`;
                    if (attemptsInfo.hasTeacherBoost) {
                        attemptsValue += `\n> 📖 *Teacher boost active (max ${attemptsInfo.maxAttempts} attempts)*`;
                    }
                    
                    const attemptsFieldName = attemptsInfo.attemptsRemaining === 1 
                        ? '__⚠️ Failed Attempts (Final Warning!)__' 
                        : '__⚠️ Failed Attempts__';
                    
                    embed.addFields({ name: attemptsFieldName, value: attemptsValue, inline: false });
                }
                
                // Add jail status if applicable
                if (jailStatus && jailStatus.trim() !== '') {
                    embed.addFields({ name: '__⛔ Jail Status__', value: `> ${jailStatus}`, inline: false });
                }
                
                // Add items by rarity
                embed.addFields({ 
                    name: '__✨ Items by Rarity__', 
                    value: `> Common: ${stats.itemsByRarity.common}\n> Uncommon: ${stats.itemsByRarity.uncommon}`, 
                    inline: false 
                });
                
                // Add victims list
                const victimsFormatted = sortedVictims.length > 0 
                    ? sortedVictims.map(v => {
                        const npcIndicator = v.isNPC ? ' (NPC)' : '';
                        return `> **${v.characterName}**${npcIndicator}: ${v.count} time${v.count > 1 ? 's' : ''}`;
                    }).join('\n')
                    : '> No successful steals yet';
                
                embed.addFields({ name: '__👥 Victims__', value: victimsFormatted, inline: false });
                
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            if (subcommand === 'cooldown') {
                await interaction.deferReply();

                const targetName = interaction.options.getString('target');
                const targetType = interaction.options.getString('targettype');
                
                // Validate character only if needed (when checking specific target or showing personal cooldowns)
                let character = null;
                if (targetName || characterName) {
                    const { valid, error, character: validatedCharacter } = await validateCharacter(characterName, interaction.user.id);
                    if (!valid) {
                        await interaction.editReply({ content: error, ephemeral: true });
                        return;
                    }
                    character = validatedCharacter;
                }

                if (targetName) {
                    // Validate that targettype is provided when target is provided
                    if (!targetType) {
                        await interaction.editReply({
                            content: '❌ **Target type is required when checking a specific target.**\n\nPlease specify whether you are checking an NPC or Player character.',
                            ephemeral: true
                        });
                        return;
                    }

                    // Character name is required for checking specific targets (to show personal cooldowns)
                    if (!character) {
                        await interaction.editReply({
                            content: '❌ **Character name is required when checking a specific target.**\n\nPlease provide your character name to check personal cooldowns.',
                            ephemeral: true
                        });
                        return;
                    }

                    // Check specific target based on targettype
                    const isNPC = targetType === 'npc';
                    const targetCooldown = await getTargetCooldownInfo(character._id, targetName, isNPC);
                    
                    if (!targetCooldown) {
                        await interaction.editReply({
                            content: `❌ **${isNPC ? 'NPC' : 'Player character'} "${targetName}" not found.**\n\n**Tip:** Make sure to select ${isNPC ? 'an NPC' : 'a character'} from the dropdown menu.`,
                            ephemeral: true
                        });
                        return;
                    }

                    const embed = createBaseEmbed('⏰ Steal Cooldown Check', '#FF6B35')
                        .setDescription(`Cooldown information for **${targetName}** (${isNPC ? 'NPC' : 'Player'})`)
                        .setThumbnail(targetCooldown.icon)
                        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

                    const fields = [];
                    
                    if (targetCooldown.global) {
                        fields.push({
                            name: '🌍 Global Cooldown',
                            value: `> **${targetCooldown.global.formatted}** remaining\n> *Applies to all thieves*`,
                            inline: false
                        });
                    } else {
                        fields.push({
                            name: '🌍 Global Cooldown',
                            value: `> ✅ **No global cooldown**\n> *This ${isNPC ? 'NPC' : 'character'} is available for all thieves*`,
                            inline: false
                        });
                    }

                    // Personal cooldown only applies to NPCs
                    if (isNPC) {
                        if (targetCooldown.personal) {
                            fields.push({
                                name: '👤 Personal Cooldown',
                                value: `> **${targetCooldown.personal.formatted}** remaining\n> *Your 30-day cooldown for this NPC*`,
                                inline: false
                            });
                        } else {
                            fields.push({
                                name: '👤 Personal Cooldown',
                                value: '> ✅ **No personal cooldown**\n> *You can steal from this NPC*',
                                inline: false
                            });
                        }
                    }

                    // Summary
                    const canSteal = isNPC 
                        ? !targetCooldown.global && !targetCooldown.personal
                        : !targetCooldown.global;
                    fields.push({
                        name: '📊 Status',
                        value: canSteal 
                            ? '> ✅ **Available to steal from**' 
                            : '> ❌ **On cooldown - cannot steal yet**',
                        inline: false
                    });

                    embed.addFields(fields);
                    await interaction.editReply({ embeds: [embed] });
                    return;
                } else {
                    // Show all cooldowns
                    // If targettype is specified, filter to that type only
                    // If character is provided, show personal cooldowns; otherwise only global
                    const characterId = character ? character._id : null;
                    const allCooldowns = await getAllCooldownInfo(characterId);

                    // Filter based on targettype if provided
                    let displayNPCs = allCooldowns.npcs;
                    let displayPlayers = allCooldowns.players;
                    
                    if (targetType === 'npc') {
                        displayPlayers = [];
                    } else if (targetType === 'player') {
                        displayNPCs = [];
                    }

                    const embed = createBaseEmbed('⏰ Steal Cooldowns', '#FF6B35')
                        .setDescription(character 
                            ? `Cooldown information for **${character.name}**`
                            : 'Cooldown information (Global only - provide character name for personal cooldowns)')
                        .setThumbnail(character?.icon || null)
                        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');

                    // NPC Cooldowns - Show all NPCs
                    if (displayNPCs.length > 0) {
                        const npcFields = [];
                        for (const npc of displayNPCs.slice(0, 25)) { // Increased limit to show more NPCs
                            let npcText = `**${npc.name}**\n`;
                            
                            if (npc.global) {
                                npcText += `🌍 Global: ${npc.global.formatted}\n`;
                            } else {
                                npcText += `🌍 Global: ✅ Available\n`;
                            }
                            
                            if (npc.personal) {
                                npcText += `👤 Personal: ${npc.personal.formatted}`;
                            } else if (character) {
                                npcText += `👤 Personal: ✅ Available`;
                            }
                            
                            npcFields.push({
                                name: '\u200b',
                                value: npcText,
                                inline: true
                            });
                        }

                        embed.addFields([
                            { 
                                name: `__🤖 All NPCs (${displayNPCs.length} total)__`, 
                                value: displayNPCs.length > 25 
                                    ? `*Showing first 25 of ${displayNPCs.length} NPCs*` 
                                    : '\u200b',
                                inline: false 
                            },
                            ...npcFields
                        ]);
                    }

                    // Player Cooldowns
                    if (displayPlayers.length > 0) {
                        const playerFields = [];
                        for (const player of displayPlayers.slice(0, 10)) { // Limit to 10 players per embed
                            let playerText = `**${player.name}**\n`;
                            
                            if (player.global) {
                                playerText += `🌍 Global: ${player.global.formatted}`;
                            } else {
                                playerText += `🌍 Global: ✅ Available`;
                            }
                            
                            playerFields.push({
                                name: '\u200b',
                                value: playerText,
                                inline: true
                            });
                        }

                        embed.addFields([
                            { 
                                name: `__👥 Player Cooldowns (${displayPlayers.length} total)__`, 
                                value: displayPlayers.length > 10 
                                    ? `*Showing first 10 of ${displayPlayers.length} players with cooldowns*` 
                                    : '\u200b',
                                inline: false 
                            },
                            ...playerFields
                        ]);
                    } else if (targetType === 'player' || (!targetType && character)) {
                        embed.addFields({
                            name: '__👥 Player Cooldowns__',
                            value: '> ✅ **No players on cooldown**\n> *All players are available*',
                            inline: false
                        });
                    }

                    // Add summary
                    const npcsOnCooldown = displayNPCs.filter(npc => npc.global || npc.personal).length;
                    const totalOnCooldown = npcsOnCooldown + displayPlayers.length;
                    embed.addFields({
                        name: '__📊 Summary__',
                        value: totalOnCooldown > 0
                            ? `> **${totalOnCooldown}** target${totalOnCooldown !== 1 ? 's' : ''} currently on cooldown (${npcsOnCooldown} NPC${npcsOnCooldown !== 1 ? 's' : ''}, ${displayPlayers.length} player${displayPlayers.length !== 1 ? 's' : ''})\n> Use \`/steal cooldown target:<name>\` to check a specific target`
                            : `> ✅ **All targets are available!**\n> Showing all ${displayNPCs.length} NPC${displayNPCs.length !== 1 ? 's' : ''} with cooldown status`,
                        inline: false
                    });

                    await interaction.editReply({ embeds: [embed] });
                    return;
                }
            }

            // If we get here, we're handling the 'commit' subcommand
            if (!targetName || !targetType || !raritySelection) {
                await interaction.reply({ content: '❌ **Missing required options for steal command.**', ephemeral: true });
                return;
            }

            // Performance timing log
            logger.info('COMMAND', `Starting steal command - ${targetType}: ${targetName}, rarity: ${raritySelection || 'any'}`);

            // ---- Target Type Validation ----
            if (targetType !== 'npc' && targetType !== 'player') {
                await interaction.reply({ 
                    content: `❌ **Invalid target type: "${targetType}"**\n\n**Valid target types:**\n• **NPC** - Steal from non-player characters\n• **Player** - Steal from other player characters\n\n**Tip:** Make sure to select a target type from the dropdown menu.`, 
                    ephemeral: true 
                });
                return;
            }

            // ---- Rarity Validation ----
            const allowedRarities = ['common', 'uncommon'];
            if (!allowedRarities.includes(raritySelection)) {
                await interaction.reply({ content: '❌ **Invalid rarity. Please select a rarity from the dropdown menu.**', ephemeral: true });
                return;
            }

            // Validate the thief character
            const thiefValidation = await validateThiefCharacter(characterName, interaction.user.id, interaction);
            if (!thiefValidation.valid) {
                return;
            }

            const { character: thiefCharacter, jailStatus } = thiefValidation;
            
            // ---- Bandit Job or Voucher Restriction ----
            const isBanditJob = (thiefCharacter.job && thiefCharacter.job.toLowerCase() === 'bandit');
            const isBanditVoucher = (thiefCharacter.jobVoucher && thiefCharacter.jobVoucherJob && thiefCharacter.jobVoucherJob.toLowerCase() === 'bandit');
            if (!isBanditJob && !isBanditVoucher) {
                await interaction.editReply({
                    embeds: [{
                        color: 0x008B8B, // Dark cyan color
                        description: `*${thiefCharacter.name} looks at their hands, unsure of how to proceed...*\n\n**Job Skill Mismatch**\n${thiefCharacter.name} cannot use the stealing perk as a ${capitalizeWords(thiefCharacter.job)} because they lack the necessary stealing skills.\n\n💡 **Tip:** Only Bandits or those with a valid Bandit job voucher can steal!`,
                        image: {
                            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
                        },
                        footer: {
                            text: 'Job Skill Check'
                        }
                    }],
                    ephemeral: true
                });
                return;
            }

            // Basic target validation (detailed validation happens in validateStealTarget)
            if (targetType === 'player') {
                const targetValidation = await validateCharacter(targetName, null);
                if (!targetValidation.valid) {
                    logger.warn('JOB', `❌ Player target validation failed - targetName: "${targetName}"`);
                    const errorMessage = targetValidation.error.includes('not found') 
                        ? `❌ **Player target not found: "${targetName}"**\n\n**Tip:** Make sure to select a character from the dropdown menu, not type the name manually.`
                        : targetValidation.error;
                    await interaction.editReply({ content: errorMessage });
                    return;
                }
            }

            // ------------------- Validate Interaction Channel -------------------
            const channelValidation = await validateChannelAccess(thiefCharacter, interaction);
            if (!channelValidation.valid) {
                return;
            }

            // Initialize job variable early
            let job = (thiefCharacter.jobVoucher && thiefCharacter.jobVoucherJob) ? thiefCharacter.jobVoucherJob : thiefCharacter.job;

            // ------------------- Job Voucher Validation and Activation -------------------
            const voucherResult = await validateAndActivateJobVoucher(thiefCharacter, job, interaction);
            if (!voucherResult.success) {
                return;
            }
            const voucherCheck = voucherResult.voucherCheck;

            // Validate character status
            const statusValidation = await validateCharacterStatus(thiefCharacter, interaction);
            if (!statusValidation.valid) {
                return;
            }

            // Daily steal will be updated only when actually attempting the steal

            // Handle NPC stealing
            if (targetType === 'npc') {
                // Use centralized validation
                const validationResult = await validateStealTarget(targetName, targetType, thiefCharacter, interaction);
                if (!validationResult.valid) {
                    return;
                }
                
                const mappedNPCName = validationResult.target;
                
                // Process items for stealing
                const itemResult = await processItemsForStealing(mappedNPCName, targetType, raritySelection);
                if (!itemResult.success) {
                    await interaction.editReply({ content: itemResult.error });
                    return;
                }
                
                // Execute the steal attempt
                const success = await executeStealAttempt(
                    thiefCharacter, 
                    mappedNPCName, 
                    targetType, 
                    raritySelection, 
                    null, 
                    itemResult.items, 
                    itemResult.selectedTier, 
                    itemResult.usedFallback, 
                    interaction, 
                    voucherCheck
                );
                
                if (success) {
                    // Performance timing for NPC steals
                    const npcEndTime = Date.now();
                    logger.success('COMMAND', `✅ NPC steal completed (${npcEndTime - startTime}ms)`);
                }
            }

            // Handle player stealing
            if (targetType === 'player') {
                // Use centralized validation
                const validationResult = await validateStealTarget(targetName, targetType, thiefCharacter, interaction);
                if (!validationResult.valid) {
                    return;
                }
                
                const targetCharacter = validationResult.target;
                
                // Process items for stealing
                const itemResult = await processItemsForStealing(targetName, targetType, raritySelection, targetCharacter);
                if (!itemResult.success) {
                    await interaction.editReply({ content: itemResult.error });
                    return;
                }
                
                // Execute the steal attempt
                const success = await executeStealAttempt(
                    thiefCharacter, 
                    targetName, 
                    targetType, 
                    raritySelection, 
                    targetCharacter, 
                    itemResult.items, 
                    itemResult.selectedTier, 
                    itemResult.usedFallback, 
                    interaction, 
                    voucherCheck
                );
                
                if (success) {
                    // Performance timing for player steals
                    const playerEndTime = Date.now();
                    logger.success('COMMAND', `✅ Player steal completed (${playerEndTime - startTime}ms)`);
                }
            }
        } catch (error) {
            const errorTime = Date.now();
            const totalTime = errorTime - startTime;
            logger.error('COMMAND', `❌ Steal command failed after ${totalTime}ms`);
            
            // Enhanced error context for better debugging
            await handleInteractionError(error, interaction, {
                source: 'steal.js',
                subcommand: interaction.options.getSubcommand(),
                characterName: characterName,
                options: {
                    targetType,
                    targetName,
                    raritySelection,
                    characterName
                }
            });
        }
    },
    
    // Utility function for external use
    resetAllStealProtections
};

// ------------------- NPC Validation Helper -------------------
function validateNPCTarget(targetName) {
    // Safety check: ensure NPCs is available
    if (!NPCs || typeof NPCs !== 'object') {
        logger.error('NPC', '❌ Critical error - NPCs object is not available');
        return { 
            valid: false, 
            error: '❌ **System Error: NPC data not available**\n\n**Please contact a mod immediately and submit an error report.**\n\n**Error Details:** NPCs module failed to load properly.'
        };
    }
    
    // Check if the target name exists in the NPCs object
    if (NPCs[targetName]) {
        return { valid: true, npcName: targetName };
    }
    
    // If not found, check if it might be a display name (e.g., "Lukan | Orchard Keeper")
    // Extract the actual NPC name from the display format
    if (targetName.includes(' | ')) {
        const actualNPCName = targetName.split(' | ')[0];
        if (NPCs[actualNPCName]) {
            return { valid: true, npcName: actualNPCName };
        }
    }
    
    // If still not found, return available NPCs for error message
    const availableNPCs = Object.keys(NPCs).map(npc => {
        const profession = NPCs[npc].profession;
        let role = profession;
        if (npc === 'Lil Tim') {
            role = 'Cucco';
        }
        return `• **${npc}** (${role})`;
    }).join('\n');
    
    return { 
        valid: false, 
        availableNPCs,
        error: `❌ **Invalid NPC target: "${targetName}"**\n\n**Available NPCs:**\n${availableNPCs}\n\n**Tip:** Make sure to select an NPC from the dropdown menu, not type the name manually.`
    };
}

// ------------------- Centralized Target Validation -------------------
// Centralized validation for both NPC and player targets to eliminate duplication
async function validateStealTarget(targetName, targetType, thiefCharacter, interaction) {
    try {
        if (targetType === 'npc') {
            const npcValidation = validateNPCTarget(targetName);
            if (!npcValidation.valid) {
                logger.warn('NPC', `❌ NPC validation failed - targetName: "${targetName}"`);
                return { valid: false, error: npcValidation.error };
            }
            
            const mappedNPCName = npcValidation.npcName;
            
            // Special validation for Zone NPC to catch common issues
            if (mappedNPCName === 'Zone') {
                try {
                    // Check if Zone NPC data is properly loaded
                    if (!NPCs || !NPCs[mappedNPCName]) {
                        logger.error('NPC', '❌ Zone NPC data not available');
                        return { 
                            valid: false, 
                            error: '❌ **Zone NPC data is currently unavailable.**\n🔄 Please try again in a moment or contact a mod and submit an error report if the issue persists.' 
                        };
                    }
                    
                    // Check if Zone has any items available
                    const zoneItems = await getNPCItems(mappedNPCName);
                    if (!zoneItems || zoneItems.length === 0) {
                        logger.warn('NPC', '⚠️ Zone NPC has no items available');
                        return { 
                            valid: false, 
                            error: '❌ **Zone currently has no items available to steal.**\n🔄 Please try again later or try stealing from a different NPC.' 
                        };
                    }
                } catch (zoneError) {
                    logger.error('NPC', '❌ Error validating Zone NPC', zoneError);
                    
                    // Call global error handler for tracking
                    handleInteractionError(zoneError, 'steal.js', {
                        commandName: 'steal',
                        operationType: 'Zone NPC validation',
                        targetName: 'Zone'
                    });
                    
                    return { 
                        valid: false, 
                        error: '❌ **Error validating Zone NPC data.**\n🔄 Please try again in a moment or contact a mod and submit an error report if the issue persists.' 
                    };
                }
            }
            
            // Check if NPC is protected
            const npcProtection = await isProtected(mappedNPCName);
            if (npcProtection.protected) {
                const timeLeftMinutes = Math.ceil(npcProtection.timeLeft / (60 * 1000));
                const npcIcon = NPCs[mappedNPCName]?.icon || null;
                const protectionEmbed = createProtectionEmbed(mappedNPCName, timeLeftMinutes, true, npcProtection.type, npcIcon);
                await interaction.editReply({ embeds: [protectionEmbed] });
                return { valid: false, error: 'NPC is protected' };
            }
            
            // Check individual NPC cooldown for this character (30 days)
            const individualCooldown = await checkIndividualNPCCooldown(thiefCharacter._id, mappedNPCName);
            if (individualCooldown.onCooldown) {
                const timeLeft = formatCooldownTime(individualCooldown.timeLeft);
                const cooldownEmbed = new EmbedBuilder()
                    .setColor(0xFF6B35)
                    .setTitle('⏰ NPC Cooldown Active')
                    .setDescription(`❌ **You cannot steal from ${mappedNPCName} yet!**`)
                    .addFields(
                        { name: '⏰ Time Remaining', value: `> **${timeLeft}** until you can steal from this NPC again`, inline: false },
                        { name: '💡 Tip', value: 'Try stealing from other NPCs instead! Each NPC has its own 30-day cooldown.', inline: false }
                    )
                    .setThumbnail(NPCs[mappedNPCName]?.icon || null)
                    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
                    .setFooter({ text: 'Individual NPC cooldown active' })
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [cooldownEmbed] });
                return { valid: false, error: 'Individual NPC cooldown active' };
            }
            
            return { valid: true, target: mappedNPCName, isNPC: true };
        } else {
            // Player target validation
            const targetValidation = await validateCharacter(targetName, null);
            if (!targetValidation.valid) {
                logger.warn('JOB', `❌ Player target validation failed - targetName: "${targetName}"`);
                const errorMessage = targetValidation.error.includes('not found') 
                    ? `❌ **Player target not found: "${targetName}"**\n\n**Tip:** Make sure to select a character from the dropdown menu, not type the name manually.`
                    : targetValidation.error;
                return { valid: false, error: errorMessage };
            }
            
            const targetCharacter = targetValidation.character;
            
            // Mod character immunity check
            if (targetCharacter.isModCharacter) {
                return { 
                    valid: false, 
                    error: `❌ **You cannot steal from a mod character!**\n👑 ${targetCharacter.name} is a ${targetCharacter.modTitle} of ${targetCharacter.modType} and is immune to theft.` 
                };
            }
            
            // Prevent stealing from self
            if (thiefCharacter._id.toString() === targetCharacter._id.toString()) {
                return { valid: false, error: '❌ **You cannot steal from yourself!**' };
            }
            
            // Check target's jail status
            const targetJailStatus = await checkJailStatus(targetCharacter);
            if (targetJailStatus.isInJail) {
                const timeLeft = formatJailTimeLeftDaysHours(targetJailStatus.timeLeft);
                const jailEmbed = createJailBlockEmbed(targetCharacter.name, timeLeft, targetCharacter.icon, thiefCharacter.icon);
                await interaction.editReply({ embeds: [jailEmbed] });
                return { valid: false, error: 'Target is in jail' };
            }
            
            // Check if target is debuffed
            if (targetCharacter.debuff && targetCharacter.debuff.active) {
                const debuffEndDate = new Date(targetCharacter.debuff.endDate);
                const now = new Date();
                
                // Check if debuff has actually expired
                if (debuffEndDate <= now) {
                    // Debuff has expired, clear it
                    targetCharacter.debuff.active = false;
                    targetCharacter.debuff.endDate = null;
                    await targetCharacter.save();
                } else {
                    // Debuff is still active
                    return { 
                        valid: false, 
                        error: `❌ **You cannot steal from a character who is debuffed!**\n💊 ${targetCharacter.name} is currently under a debuff effect.` 
                    };
                }
            }
            
            // Check if target is KO'd
            if (targetCharacter.ko) {
                return { 
                    valid: false, 
                    error: `❌ **You cannot steal from a character who is KO'd!**\n💀 ${targetCharacter.name} is currently unconscious.` 
                };
            }
            
            // Inventory sync check removed - no longer required
            
            // Check village restriction
            const testingChannelId = '1391812848099004578';
            const isTestingChannelOrThread = interaction.channelId === testingChannelId || interaction.channel?.parentId === testingChannelId;
            if (thiefCharacter.currentVillage !== targetCharacter.currentVillage && !isTestingChannelOrThread) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF6B35)
                    .setTitle('📍 Village Restriction')
                    .setDescription(`❌ **You can only steal from characters in the same village!**`)
                    .addFields(
                        { name: '📍 Your Location', value: `${thiefCharacter.currentVillage}`, inline: true },
                        { name: '📍 Target Location', value: `${targetCharacter.currentVillage}`, inline: true },
                        { name: '💡 Travel Tip', value: 'Use </travel:1379850586987430009> to travel between villages and access characters in different locations!', inline: false }
                    )
                    .setThumbnail(thiefCharacter.icon || null)
                    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
                    .setFooter({ text: 'Village restriction active' })
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed], ephemeral: true });
                return { valid: false, error: 'Village restriction' };
            }
            
            // Check protection status
            const playerProtection = await isProtected(targetCharacter._id);
            if (playerProtection.protected) {
                const timeLeftMinutes = Math.ceil(playerProtection.timeLeft / (60 * 1000));
                const characterIcon = targetCharacter.icon || null;
                const protectionEmbed = createProtectionEmbed(targetCharacter.name, timeLeftMinutes, false, playerProtection.type, characterIcon);
                await interaction.editReply({ embeds: [protectionEmbed] });
                return { valid: false, error: 'Target is protected' };
            }
            
            // Check if target can be stolen from
            if (!targetCharacter.canBeStolenFrom) {
                const embed = new EmbedBuilder()
                    .setColor(0xFF6B35)
                    .setTitle('⚠️ Steal Blocked')
                    .setDescription(`**${targetCharacter.name}** cannot be stolen from.`)
                    .addFields(
                        { name: '🛡️ Protection Status', value: 'This character is protected from theft', inline: false },
                        { name: '💡 Tip', value: 'Try stealing from other characters or NPCs instead', inline: false }
                    )
                    .setThumbnail(targetCharacter.icon || null)
                    .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
                    .setFooter({ text: 'Steal protection active' })
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [embed] });
                return { valid: false, error: 'Target cannot be stolen from' };
            }
            
            return { valid: true, target: targetCharacter, isNPC: false };
        }
    } catch (error) {
        logger.error('JOB', 'Error in validateStealTarget', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'validateStealTarget',
            targetName: targetName,
            targetType: targetType,
            thiefCharacterName: thiefCharacter?.name
        });
        
        return { valid: false, error: '❌ **An error occurred while validating the target.**' };
    }
}

// ------------------- Centralized Item Processing for Stealing -------------------
// Centralized function to process items for stealing from both NPCs and players
async function processItemsForStealing(targetName, targetType, raritySelection, targetCharacter = null) {
    try {
        if (targetType === 'npc') {
            let npcInventory = []; // Declare at function scope to avoid reference errors
            
            // Handle Peddler special case
            if (targetName === 'Peddler') {
                try {
                    const allItems = await ItemModel.find({}, 'itemName');
                    npcInventory = allItems.map(item => item.itemName);
                    
                    // Filter out custom weapons from Peddler inventory
                    const peddlerInventoryWithoutCustomWeapons = [];
                    for (const itemName of npcInventory) {
                        try {
                            const isCustom = await isCustomWeapon(itemName);
                            if (!isCustom) {
                                peddlerInventoryWithoutCustomWeapons.push(itemName);
                            }
                        } catch (customWeaponError) {
                            logger.error('LOOT', `❌ Error checking if Peddler item is custom weapon: ${itemName}`, customWeaponError);
                            
                            // Call global error handler for tracking
                            handleInteractionError(customWeaponError, 'steal.js', {
                                commandName: 'steal',
                                operationType: 'Peddler custom weapon check',
                                itemName: itemName,
                                targetName: 'Peddler'
                            });
                            
                            // Continue processing other items instead of failing completely
                            peddlerInventoryWithoutCustomWeapons.push(itemName);
                        }
                    }
                    
                    if (peddlerInventoryWithoutCustomWeapons.length === 0) {
                        return { 
                            success: false, 
                            error: `❌ **No items available to steal from Peddler!**\n🛡️ All available items are protected from theft (Custom Weapons).` 
                        };
                    }
                    
                    npcInventory = peddlerInventoryWithoutCustomWeapons;
                } catch (peddlerError) {
                    logger.error('LOOT', '❌ Error processing Peddler inventory', peddlerError);
                    
                    // Call global error handler for tracking
                    handleInteractionError(peddlerError, 'steal.js', {
                        commandName: 'steal',
                        operationType: 'Peddler inventory processing',
                        targetName: 'Peddler'
                    });
                    
                    return { 
                        success: false, 
                        error: `❌ **Error processing Peddler inventory!**\n🔄 Please try again in a moment.\n\n**Debug Info:**\n• NPC: Peddler\n• Error: ${peddlerError.name}: ${peddlerError.message}\n\n**Tip:** This may indicate a system issue. Please contact a mod and submit an error report if the problem persists.` 
                    };
                }
            } else {
                // For other NPCs, fetch from database
                try {
                    npcInventory = await getNPCItems(targetName);
                } catch (npcError) {
                    logger.error('LOOT', `❌ Error fetching items for NPC ${targetName}`, npcError);
                        
                        // Call global error handler for tracking
                        handleInteractionError(npcError, 'steal.js', {
                            commandName: 'steal',
                            operationType: 'NPC items fetch',
                            targetName: targetName
                        });
                        
                        // Special handling for Zone NPC
                        if (targetName === 'Zone') {
                            return { 
                                success: false, 
                                error: `❌ **Error fetching items from Zone!**\n🔄 Please try again in a moment.\n\n**Debug Info:**\n• NPC: ${targetName}\n• Error: ${npcError.name}: ${npcError.message}\n\n**Tip:** This may indicate a system issue. Please contact a mod and submit an error report if the problem persists.` 
                            };
                        } else {
                            return { 
                                success: false, 
                                error: `❌ **Error fetching items from ${targetName}!**\n🔄 Please try again in a moment.\n\n**Debug Info:**\n• NPC: ${targetName}\n• Error: ${npcError.name}: ${npcError.message}` 
                            };
                        }
                }
                
                // Check if we got a valid inventory
                if (!Array.isArray(npcInventory) || npcInventory.length === 0) {
                    // Special handling for Zone NPC
                    if (targetName === 'Zone') {
                        return { 
                            success: false, 
                            error: `❌ **No items available to steal from Zone!**\n🛡️ This NPC may not have any stealable items.\n\n**Debug Info:**\n• NPC: ${targetName}\n• Inventory type: ${typeof npcInventory}\n• Inventory length: ${Array.isArray(npcInventory) ? npcInventory.length : 'N/A'}\n\n**Tip:** This may indicate a system issue. Please contact a mod and submit an error report if the problem persists.` 
                        };
                    } else {
                        return { 
                            success: false, 
                            error: `❌ **No items available to steal from ${targetName}!**\n🛡️ This NPC may not have any stealable items.` 
                        };
                    }
                }
                
                // Normalize npcInventory to ensure all items are strings
                const normalizedNPCInventory = npcInventory.map(item => {
                    if (typeof item === 'string') {
                        return item;
                    } else if (item && typeof item === 'object' && item.itemName) {
                        return item.itemName;
                    } else if (item && typeof item === 'object' && item.name) {
                        return item.name;
                    } else {
                        logger.warn('LOOT', `⚠️ Unexpected item format in NPC inventory`);
                        return String(item);
                    }
                }).filter(Boolean);
                
                // Filter out protected items
                const protectedItems = ['spirit orb', 'voucher'];
                const filteredNPCInventory = normalizedNPCInventory.filter(itemName => {
                    const lowerItemName = itemName.toLowerCase();
                    return !protectedItems.some(protected => lowerItemName.includes(protected));
                });
                
                // Filter out custom weapons
                const filteredNPCInventoryWithoutCustomWeapons = [];
                for (const itemName of filteredNPCInventory) {
                    try {
                        const isCustom = await isCustomWeapon(itemName);
                        if (!isCustom) {
                            filteredNPCInventoryWithoutCustomWeapons.push(itemName);
                        }
                    } catch (customWeaponError) {
                        logger.error('LOOT', `❌ Error checking if item is custom weapon: ${itemName}`, customWeaponError);
                        // Continue processing other items instead of failing completely
                        filteredNPCInventoryWithoutCustomWeapons.push(itemName);
                    }
                }
                
                if (filteredNPCInventoryWithoutCustomWeapons.length === 0) {
                    return { 
                        success: false, 
                        error: `❌ **No items available to steal from ${targetName}!**\n🛡️ All available items are protected from theft (Custom Weapons, Spirit Orbs, and vouchers).` 
                    };
                }
                
                npcInventory = filteredNPCInventoryWithoutCustomWeapons;
            }
            
            // Process NPC items through rarity selection
            let itemsWithRarity, filteredItems, selectedTier, usedFallback;
            
            try {
                itemsWithRarity = await processItemsWithRarity(npcInventory, true);
                const fallbackResult = await selectItemsWithFallback(itemsWithRarity, raritySelection);
                filteredItems = fallbackResult.items;
                selectedTier = fallbackResult.selectedTier;
                usedFallback = fallbackResult.usedFallback;
            } catch (rarityError) {
                logger.error('LOOT', `❌ Error processing items with rarity for NPC ${targetName}`, rarityError);
                
                // Call global error handler for tracking
                handleInteractionError(rarityError, 'steal.js', {
                    commandName: 'steal',
                    operationType: 'NPC rarity processing',
                    targetName: targetName,
                    raritySelection: raritySelection,
                    npcInventoryLength: npcInventory.length
                });
                
                // Special handling for Zone NPC
                if (targetName === 'Zone') {
                    return { 
                        success: false, 
                        error: `❌ **Error processing items with rarity from Zone!**\n🔄 Please try again in a moment.\n\n**Debug Info:**\n• NPC: ${targetName}\n• Inventory length: ${npcInventory.length}\n• Rarity: ${raritySelection}\n• Error: ${rarityError.name}: ${rarityError.message}\n\n**Tip:** This may indicate a system issue. Please contact a mod and submit an error report if the problem persists.` 
                    };
                } else {
                    return { 
                        success: false, 
                        error: `❌ **Error processing items with rarity from ${targetName}!**\n🔄 Please try again in a moment.\n\n**Debug Info:**\n• NPC: ${targetName}\n• Error: ${rarityError.name}: ${rarityError.message}` 
                    };
                }
            }
            
            if (filteredItems.length === 0) {
                const fallbackMessage = getFallbackMessage(raritySelection, selectedTier);
                if (fallbackMessage) {
                    return { success: false, error: fallbackMessage };
                } else {
                    // Special message for Zone NPC to help with debugging
                    if (targetName === 'Zone') {
                        return { 
                            success: false, 
                            error: `❌ **No items available to steal from Zone!**\n🛡️ All available items are protected from theft.\n\n**Debug Info:**\n• Total items found: ${npcInventory.length}\n• Items after rarity filtering: ${filteredItems.length}\n• Selected tier: ${selectedTier}\n• Used fallback: ${usedFallback}\n\n**Tip:** This may indicate a system issue. Please contact a mod and submit an error report if the problem persists.` 
                        };
                    } else {
                        return { 
                            success: false, 
                            error: `❌ **No items available to steal from ${targetName}!**\n🛡️ All available items are protected from theft.` 
                        };
                    }
                }
            }
            
            return { 
                success: true, 
                items: filteredItems, 
                selectedTier, 
                usedFallback,
                isNPC: true 
            };
        } else {
            // Player target processing
            let targetInventoryCollection, inventoryEntries, rawItemNames;
            
            try {
                targetInventoryCollection = await getCharacterInventoryCollection(targetCharacter.name);
                inventoryEntries = await targetInventoryCollection.find({ characterId: targetCharacter._id }).toArray();
                rawItemNames = inventoryEntries.map(entry => entry.itemName);
            } catch (inventoryError) {
                logger.error('LOOT', `❌ Error fetching player inventory for ${targetCharacter.name}`, inventoryError);
                
                // Call global error handler for tracking
                handleInteractionError(inventoryError, 'steal.js', {
                    commandName: 'steal',
                    operationType: 'player inventory fetch',
                    targetCharacterName: targetCharacter.name,
                    targetCharacterId: targetCharacter._id
                });
                
                return { 
                    success: false, 
                    error: `❌ **Error fetching inventory from ${targetCharacter.name}!**\n🔄 Please try again in a moment.\n\n**Debug Info:**\n• Target: ${targetCharacter.name}\n• Error: ${inventoryError.name}: ${inventoryError.message}\n\n**Tip:** This may indicate a system issue. Please contact a mod and submit an error report if the problem persists.` 
                };
            }

            const equippedItems = [
                targetCharacter.gearWeapon?.name,
                targetCharacter.gearShield?.name,
                targetCharacter.gearArmor?.head?.name,
                targetCharacter.gearArmor?.chest?.name,
                targetCharacter.gearArmor?.legs?.name,
            ].filter(Boolean);

            // Filter out protected items
            const protectedItems = ['spirit orb', 'voucher'];
            const availableItemNames = rawItemNames.filter(itemName => {
                const lowerItemName = itemName.toLowerCase();
                const isEquipped = equippedItems.includes(itemName);
                const isItemProtected = protectedItems.some(protected => lowerItemName.includes(protected));
                return !isEquipped && !isItemProtected;
            });
            
            // Filter out custom weapons
            const availableItemNamesWithoutCustomWeapons = [];
            for (const itemName of availableItemNames) {
                try {
                    const isCustom = await isCustomWeapon(itemName);
                    if (!isCustom) {
                        availableItemNamesWithoutCustomWeapons.push(itemName);
                    }
                } catch (customWeaponError) {
                    logger.error('LOOT', `❌ Error checking if item is custom weapon: ${itemName}`, customWeaponError);
                    
                    // Call global error handler for tracking
                    handleInteractionError(customWeaponError, 'steal.js', {
                        commandName: 'steal',
                        operationType: 'custom weapon check',
                        itemName: itemName,
                        targetCharacterName: targetCharacter.name
                    });
                    
                    // Continue processing other items instead of failing completely
                    availableItemNamesWithoutCustomWeapons.push(itemName);
                }
            }
            
            if (availableItemNamesWithoutCustomWeapons.length === 0) {
                return { 
                    success: false, 
                    error: `❌ **Looks like ${targetCharacter.name} didn't have any items to steal!**\n🛡️ All available items are protected from theft (Custom Weapons, Spirit Orbs, and vouchers).` 
                };
            }
            
            let itemsWithRarity, filteredItems, selectedTier, usedFallback;
            
            try {
                itemsWithRarity = await processItemsWithRarity(availableItemNamesWithoutCustomWeapons, false, inventoryEntries);
                const fallbackResult = await selectItemsWithFallback(itemsWithRarity, raritySelection);
                filteredItems = fallbackResult.items;
                selectedTier = fallbackResult.selectedTier;
                usedFallback = fallbackResult.usedFallback;
            } catch (rarityError) {
                logger.error('LOOT', `❌ Error processing items with rarity for player ${targetCharacter.name}`, rarityError);
                
                // Call global error handler for tracking
                handleInteractionError(rarityError, 'steal.js', {
                    commandName: 'steal',
                    operationType: 'player rarity processing',
                    targetCharacterName: targetCharacter.name,
                    availableItemsCount: availableItemNamesWithoutCustomWeapons.length,
                    raritySelection: raritySelection
                });
                
                return { 
                    success: false, 
                    error: `❌ **Error processing items with rarity from ${targetCharacter.name}!**\n🔄 Please try again in a moment.\n\n**Debug Info:**\n• Target: ${targetCharacter.name}\n• Available items: ${availableItemNamesWithoutCustomWeapons.length}\n• Rarity: ${raritySelection}\n• Error: ${rarityError.name}: ${rarityError.message}\n\n**Tip:** This may indicate a system issue. Please contact a mod and submit an error report if the problem persists.` 
                };
            }

            if (filteredItems.length === 0) {
                const fallbackMessage = getFallbackMessage(raritySelection, selectedTier);
                if (fallbackMessage) {
                    return { success: false, error: fallbackMessage };
                } else {
                    return { 
                        success: false, 
                        error: `❌ **Looks like ${targetCharacter.name} didn't have any items to steal!**\n🛡️ All available items are protected from theft.` 
                    };
                }
            }
            
            return { 
                success: true, 
                items: filteredItems, 
                selectedTier, 
                usedFallback,
                isNPC: false 
            };
        }
    } catch (error) {
        logger.error('LOOT', 'Error in processItemsForStealing', error);
        
        // Provide more specific error messages based on the error type
        let errorMessage = '❌ **An error occurred while processing items for stealing.**';
        
        if (error.name === 'MongoError' || error.name === 'MongoServerError') {
            if (error.code === 11000) {
                errorMessage = '❌ **Database duplicate key error while processing items.**\n🔄 Please try again in a moment.';
            } else if (error.code === 121) {
                errorMessage = '❌ **Database validation error while processing items.**\n🔄 Please try again in a moment.';
            } else {
                errorMessage = `❌ **Database error while processing items (Code: ${error.code}).**\n🔄 Please try again in a moment.`;
            }
        } else if (error.name === 'TypeError') {
            if (error.message.includes('Cannot read properties of undefined') || error.message.includes('Cannot read properties of null')) {
                            errorMessage = '❌ **Data structure error while processing items.**\n🔄 The target may have invalid inventory data. Please try again or contact a mod and submit an error report.';
        } else {
            errorMessage = '❌ **Data type error while processing items.**\n🔄 Please try again or contact a mod and submit an error report.';
        }
        } else if (error.name === 'ReferenceError') {
            errorMessage = '❌ **System configuration error while processing items.**\n🔄 Please contact a mod immediately and submit an error report.';
        } else if (error.message && error.message.includes('timeout')) {
            errorMessage = '❌ **Database operation timed out while processing items.**\n🔄 Please try again in a moment.';
        } else if (error.message && error.message.includes('network')) {
            errorMessage = '❌ **Network error while processing items.**\n🔄 Please check your connection and try again.';
        }
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'processItemsForStealing',
            targetName: targetName,
            targetType: targetType,
            raritySelection: raritySelection
        });
        
        // Add debugging information for mods
        const debugInfo = `\n\n**Debug Info:**\n• Target: ${targetName}\n• Type: ${targetType}\n• Rarity: ${raritySelection}\n• Error: ${error.name}: ${error.message}`;
        
        return { 
            success: false, 
            error: errorMessage + debugInfo
        };
    }
}

// ------------------- Centralized Steal Execution -------------------
// Centralized function to execute the actual steal attempt for both NPCs and players
async function executeStealAttempt(thiefCharacter, targetName, targetType, raritySelection, targetCharacter, items, selectedTier, usedFallback, interaction, voucherCheck) {
    try {
                    // Update daily steal only when actually attempting the steal
            if (!thiefCharacter.jobVoucher) {
                try {
                    await updateDailySteal(thiefCharacter, 'steal');
                } catch (error) {
                    logger.error('JOB', '❌ Failed to update daily steal', error);
                    
                    // Call global error handler for tracking
                    handleInteractionError(error, 'steal.js', {
                        commandName: 'steal',
                        operationType: 'daily steal update',
                        characterName: thiefCharacter?.name
                    });
                    
                    await interaction.editReply({
                        content: `❌ **An error occurred while updating your daily steal. Please try again.**`,
                        ephemeral: true
                    });
                    return;
                }
            }

        // ============================================================================
        // ------------------- Apply Entertainer Boost (Elegy of Emptiness) -------------------
        // ============================================================================
        let modifiedItems = items;
        let boostInfo = null;
        if (thiefCharacter.boostedBy) {
            const { fetchCharacterByName } = require('@/database/db');
            const boosterChar = await fetchCharacterByName(thiefCharacter.boostedBy);
            
        if (boosterChar && boosterChar.job === 'Entertainer') {
                // Focus selection on the highest rarity available within the resolved tier
                const preferenceOrder = [];
                if (selectedTier && selectedTier !== 'any') {
                    preferenceOrder.push(selectedTier);
                }
                if (raritySelection && !preferenceOrder.includes(raritySelection)) {
                    preferenceOrder.push(raritySelection);
                }
                preferenceOrder.push('any');

                let resolvedTier = 'any';
                let candidatePool = items;
                for (const tier of preferenceOrder) {
                    if (tier === 'any') {
                        resolvedTier = 'any';
                        candidatePool = items;
                        break;
                    }
                    const matches = items.filter(it => it.tier === tier);
                    if (matches.length > 0) {
                        resolvedTier = tier;
                        candidatePool = matches;
                        break;
                    }
                }

                const availableRarities = [...new Set(candidatePool.map(it => it.itemRarity).filter(Boolean))].sort((a, b) => a - b);
                const highestRarity = availableRarities.length > 0 ? availableRarities[availableRarities.length - 1] : null;

                if (highestRarity !== null) {
                    const narrowedPool = candidatePool.filter(it => it.itemRarity === highestRarity);
                    if (narrowedPool.length > 0) {
                        modifiedItems = narrowedPool.map(item => ({
                            ...item,
                            weight: item.weight !== undefined ? item.weight : (RARITY_WEIGHTS[item.itemRarity] || 1)
                        }));
                        boostInfo = {
                            boosterJob: 'Entertainer',
                            mode: 'highest-rarity',
                            requestedTier: raritySelection || 'any',
                            resolvedTier,
                            candidateCount: candidatePool.length,
                            narrowedCount: narrowedPool.length,
                            highestRarity,
                            availableRarities,
                            narrowedItemNames: narrowedPool.map(it => it.itemName)
                        };
                        logger.info('BOOST', `🎵 Entertainer boost - Elegy of Emptiness (highest rarity focus) | requested: ${raritySelection || 'any'} | resolvedTier: ${resolvedTier} | pool ${candidatePool.length} → ${narrowedPool.length} | highestRarity: ${highestRarity}`);
                    } else {
                        boostInfo = {
                            boosterJob: 'Entertainer',
                            mode: 'highest-rarity',
                            requestedTier: raritySelection || 'any',
                            resolvedTier,
                            candidateCount: candidatePool.length,
                            narrowedCount: 0,
                            highestRarity,
                            availableRarities,
                            narrowedItemNames: []
                        };
                        logger.warn('BOOST', `🎵 Entertainer boost - Elegy of Emptiness could not narrow pool (no items matched highest rarity ${highestRarity}).`);
                    }
                } else {
                    logger.warn('BOOST', '🎵 Entertainer boost - Elegy of Emptiness found no item rarities to prioritize.');
                }
            } else if (!boosterChar) {
                logger.warn('BOOST', `BoostedBy set to "${thiefCharacter.boostedBy}" but booster character not found`);
            } else {
                logger.debug('BOOST', `BoostedBy is "${thiefCharacter.boostedBy}" (job: ${boosterChar.job}) but no Entertainer effect applied in item weighting`);
            }
        }

        const selectedItem = getRandomItemByWeight(modifiedItems);
        if (boostInfo) {
            boostInfo.selectedTier = selectedItem.tier;
            boostInfo.selectedItemName = selectedItem.itemName;
        }
        logger.info('LOOT', `🎯 Selected item: ${selectedItem.itemName} (tier ${selectedItem.tier})`);
        const roll = await generateStealRoll(thiefCharacter);
        const failureThreshold = await calculateFailureThreshold(selectedItem.tier, thiefCharacter, targetName);
        logger.info('JOB', `📐 Failure threshold: ${failureThreshold} | Roll: ${roll}`);
        const isSuccess = roll > failureThreshold;
        logger.info('JOB', `🏁 Steal outcome: ${isSuccess ? 'SUCCESS' : 'FAILURE'}`);

        if (isSuccess) {
            const quantity = determineStealQuantity(selectedItem);
            await handleStealSuccess(
                thiefCharacter, 
                targetType === 'npc' ? targetName : targetCharacter, 
                selectedItem, 
                quantity, 
                roll, 
                failureThreshold, 
                targetType === 'npc', 
                interaction, 
                voucherCheck, 
                usedFallback, 
                raritySelection, 
                selectedTier,
                boostInfo
            );
        } else {
            await handleStealFailure(
                thiefCharacter, 
                targetType === 'npc' ? targetName : targetCharacter, 
                selectedItem, 
                roll, 
                failureThreshold, 
                targetType === 'npc', 
                interaction, 
                voucherCheck, 
                usedFallback, 
                raritySelection, 
                selectedTier
            );
        }
        
        return true;
    } catch (error) {
        logger.error('JOB', 'Error in executeStealAttempt', error);
        await handleStealError(error, interaction, `${targetType} steal execution`);
        return false;
    }
}

// ------------------- Channel Validation -------------------
// Centralized function to validate if the command can be used in the current channel
async function validateChannelAccess(thiefCharacter, interaction) {
    try {
        let currentVillage = capitalizeWords(thiefCharacter.currentVillage);
        let allowedChannel = villageChannels[currentVillage];

        // If using a job voucher for a village-exclusive job, override to required village
        if (thiefCharacter.jobVoucher && thiefCharacter.jobVoucherJob) {
            const voucherPerk = getJobPerk(thiefCharacter.jobVoucherJob);
            if (voucherPerk && voucherPerk.village) {
                const requiredVillage = capitalizeWords(voucherPerk.village);
                currentVillage = requiredVillage;
                allowedChannel = villageChannels[requiredVillage];
                logger.info('JOB', `🎫 Voucher override - village: ${requiredVillage}`);
            }
        }

        // Allow testing in specific channel and any threads in that channel
        const testingChannelId = '1391812848099004578';
        const isTestingChannel = interaction.channelId === testingChannelId || interaction.channel?.parentId === testingChannelId;

        // If allowedChannel is undefined, allow the command to proceed (for testing)
        if (!allowedChannel) {
            logger.warn('JOB', `⚠️ No channel configured for village ${currentVillage} - allowing command`);
            return { valid: true };
        } else if (interaction.channelId !== allowedChannel && !isTestingChannel) {
            const channelMention = `<#${allowedChannel}>`;
            await interaction.editReply({
                embeds: [{
                    color: 0x008B8B, // Dark cyan color
                    description: `*${thiefCharacter.name} looks around, confused by their surroundings...*\n\n**Channel Restriction**\nYou can only use this command in the ${currentVillage} Town Hall channel!\n\n📍 **Current Location:** ${capitalizeWords(thiefCharacter.currentVillage)}\n💬 **Command Allowed In:** ${channelMention}`,
                    image: {
                        url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
                    },
                    footer: {
                        text: 'Channel Restriction'
                    }
                }],
                ephemeral: true
            });
            return { valid: false, error: 'Channel restriction' };
        }
        
        return { valid: true };
    } catch (error) {
        logger.error('JOB', 'Error in validateChannelAccess', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'validateChannelAccess',
            characterName: thiefCharacter?.name,
            currentVillage: thiefCharacter?.currentVillage,
            channelId: interaction.channelId
        });
        
        return { valid: false, error: 'Channel validation error' };
    }
}

// ------------------- Job Voucher Validation -------------------
// Centralized function to validate and activate job vouchers for stealing
async function validateAndActivateJobVoucher(thiefCharacter, job, interaction) {
    try {
        let voucherCheck;
        if (thiefCharacter.jobVoucher) {
            logger.info('JOB', `🎫 Validating job voucher for ${thiefCharacter.name}`);
            voucherCheck = await validateJobVoucher(thiefCharacter, job, 'STEALING');
            
            if (voucherCheck.skipVoucher) {
                logger.info('JOB', `✅ Voucher skipped - ${thiefCharacter.name} already has job "${job}"`);
            } else if (!voucherCheck.success) {
                logger.error('JOB', `❌ Voucher validation failed: ${voucherCheck.message}`);
                await interaction.editReply({
                    content: voucherCheck.message,
                    ephemeral: true,
                });
                return { success: false, error: voucherCheck.message };
            } else {
                // Fetch the job voucher item for activation
                const { success: itemSuccess, item: jobVoucherItem, message: itemError } = await fetchJobVoucherItem();
                if (!itemSuccess) {
                    await interaction.editReply({ content: itemError, ephemeral: true });
                    return { success: false, error: itemError };
                }
                
                const activationResult = await activateJobVoucher(thiefCharacter, job, jobVoucherItem, 1, interaction);
                if (!activationResult.success) {
                    await interaction.editReply({
                        content: activationResult.message,
                        ephemeral: true,
                    });
                    return { success: false, error: activationResult.message };
                }
            }
        }
        
        return { success: true, voucherCheck };
    } catch (error) {
        logger.error('JOB', 'Error in validateAndActivateJobVoucher', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'validateAndActivateJobVoucher',
            characterName: thiefCharacter?.name,
            job: job
        });
        
        return { success: false, error: '❌ **An error occurred while validating the job voucher.**' };
    }
}

// ------------------- Character Status Validation -------------------
// Centralized function to validate character status for stealing
async function validateCharacterStatus(thiefCharacter, interaction) {
    try {
        // Inventory sync check removed - no longer required

        // Prevent characters with canBeStolenFrom disabled from using job vouchers to steal
        if (!thiefCharacter.canBeStolenFrom && thiefCharacter.jobVoucher) {
            await interaction.editReply({ 
                content: '❌ **You cannot use a job voucher to steal while your "can be stolen from" setting is disabled.**\n🔒 You must enable this setting first before you can use job vouchers for stealing.', 
                ephemeral: true 
            });
            return { valid: false, error: 'Cannot use voucher while protected' };
        }

        // Check if thief is debuffed or KO'd
        if (thiefCharacter.debuff && thiefCharacter.debuff.active) {
            const debuffEndDate = new Date(thiefCharacter.debuff.endDate);
            const now = new Date();
            
            // Check if debuff has actually expired
            if (debuffEndDate <= now) {
                // Debuff has expired, clear it
                thiefCharacter.debuff.active = false;
                thiefCharacter.debuff.endDate = null;
                await thiefCharacter.save();
            } else {
                // Debuff is still active
                await interaction.editReply({ 
                    content: '❌ **You cannot steal while debuffed!**\n💊 You need to wait for your debuff to expire or get healed first.', 
                    ephemeral: true 
                });
                return { valid: false, error: 'Character is debuffed' };
            }
        }

        if (thiefCharacter.ko) {
            await interaction.editReply({ 
                content: '❌ **You cannot steal while KO\'d!**\n💀 You need to be healed first before you can steal.', 
                ephemeral: true 
            });
            return { valid: false, error: 'Character is KO\'d' };
        }

        // Check if thief has a valid inventory URL
        const thiefInventoryLink = thiefCharacter.inventory || thiefCharacter.inventoryLink;
        // Google Sheets validation removed - just check if it's a string
        if (typeof thiefInventoryLink !== 'string') {
            await interaction.editReply({ 
                content: `❌ **Invalid Google Sheets URL for "${thiefCharacter.name}".**`, 
                ephemeral: true 
            });
            return { valid: false, error: 'Invalid inventory URL' };
        }
        
        return { valid: true };
    } catch (error) {
        logger.error('JOB', 'Error in validateCharacterStatus', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'validateCharacterStatus',
            characterName: thiefCharacter?.name
        });
        
        return { valid: false, error: '❌ **An error occurred while validating character status.**' };
    }
}

// ------------------- Initial Character Validation -------------------
// Centralized function to validate the thief character before any other checks
async function validateThiefCharacter(characterName, userId, interaction) {
    try {
        // Validate the thief character
        const validationResult = await validateCharacter(characterName, userId, true);
        if (!validationResult.valid) {
            await interaction.reply({ content: validationResult.error, ephemeral: true });
            return { valid: false, error: validationResult.error };
        }

        const thiefCharacter = validationResult.character;

        // Defer the reply immediately to prevent timeout
        await interaction.deferReply();

        // Check if bandit character is debuffed
        if (thiefCharacter.debuff && thiefCharacter.debuff.active) {
            const debuffEndDate = new Date(thiefCharacter.debuff.endDate);
            const now = new Date();
            
            // Check if debuff has actually expired
            if (debuffEndDate <= now) {
                // Debuff has expired, clear it
                thiefCharacter.debuff.active = false;
                thiefCharacter.debuff.endDate = null;
                await thiefCharacter.save();
            } else {
                // Debuff is still active
                const errorMessage = '❌ **Bandit characters cannot steal while debuffed!**\n💊 You need to wait for your debuff to expire or get healed first.';
                await interaction.editReply({ 
                    content: errorMessage, 
                    ephemeral: true 
                });
                logger.warn('JOB', `⚠️ Steal blocked - debuffed bandit: ${thiefCharacter.name}`);
                return { valid: false, error: errorMessage };
            }
        }

        // Check if bandit character is KO'd
        if (thiefCharacter.ko) {
            const errorMessage = '❌ **Bandit characters cannot steal while KO\'d!**\n💀 You need to be healed first before you can steal.';
            await interaction.editReply({ 
                content: errorMessage, 
                ephemeral: true 
            });
            logger.warn('JOB', `⚠️ Steal blocked - KO'd bandit: ${thiefCharacter.name}`);
            return { valid: false, error: errorMessage };
        }

        // Check if character is in jail
        const jailStatus = await checkJailStatus(thiefCharacter);
        if (jailStatus.isInJail) {
            const timeLeft = formatJailTimeLeftDaysHours(jailStatus.timeLeft);
            const embed = new EmbedBuilder()
                .setColor(0x8B0000) // Dark red color for jail
                .setTitle('⛔ Jail Restriction')
                .setDescription('**You are currently in jail and cannot steal!**')
                .addFields(
                    { name: '⏰ Time Remaining', value: timeLeft, inline: true }
                )
                .setThumbnail(thiefCharacter.icon || null)
                .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png')
                .setFooter({ 
                    text: 'Jail restriction active'
                })
                .setTimestamp();
            
            await interaction.editReply({ embeds: [embed], ephemeral: true });
            return { valid: false, error: 'Character is in jail' };
        }

        // Check daily steal limit AFTER job validation
        if (!thiefCharacter.jobVoucher) {
            // Check if steal has been used within the last day
            const canSteal = canUseDailySteal(thiefCharacter, 'steal');
            
            if (!canSteal) {
                const nextRollover = new Date();
                nextRollover.setUTCHours(12, 0, 0, 0); // 8AM EST = 12:00 UTC
                if (nextRollover < new Date()) {
                  nextRollover.setUTCDate(nextRollover.getUTCDate() + 1);
                }
                const unixTimestamp = Math.floor(nextRollover.getTime() / 1000);
                
                const errorMessage = `Daily stealing limit reached. The next opportunity to steal will be available at <t:${unixTimestamp}:F>.`;
                await interaction.editReply({
                    embeds: [{
                        color: 0x008B8B, // Dark cyan color
                        description: `*${thiefCharacter.name} seems exhausted from their earlier stealing...*\n\n**Daily stealing limit reached.**\nThe next opportunity to steal will be available at <t:${unixTimestamp}:F> (8 AM EST rollover).\n\n*Tip: A job voucher would allow you to steal again today.*`,
                        image: {
                            url: 'https://storage.googleapis.com/tinglebot/Graphics/border.png'
                        },
                        footer: {
                            text: 'Daily Activity Limit'
                        }
                    }],
                    ephemeral: true
                });
                return { valid: false, error: errorMessage };
            }
        }
        
        return { valid: true, character: thiefCharacter, jailStatus };
    } catch (error) {
        logger.error('JOB', 'Error in validateThiefCharacter', error);
        
        // Call global error handler for tracking
        handleInteractionError(error, 'steal.js', {
            commandName: 'steal',
            operationType: 'validateThiefCharacter',
            characterName: characterName,
            userId: userId
        });
        
        return { valid: false, error: '❌ **An error occurred while validating the thief character.**' };
    }
}







