// ============================================================================
// ---- Imports ----
// ============================================================================

// ------------------- Third-party Library Imports -------------------
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');

// ------------------- Local Module Imports -------------------
const { handleError } = require('../../utils/globalErrorHandler');
const { fetchCharacterByName, getCharacterInventoryCollection, fetchItemRarityByName, connectToInventoriesForItems } = require('../../database/db');
const { removeItemInventoryDatabase, addItemInventoryDatabase, syncToInventoryDatabase } = require('../../utils/inventoryUtils');
const { getNPCItems, NPCs, getStealFlavorText, getStealFailText } = require('../../modules/NPCsModule');
const { authorizeSheets, appendSheetData, safeAppendDataToSheet } = require('../../utils/googleSheetsUtils');
const { isValidGoogleSheetsUrl, extractSpreadsheetId } = require('../../utils/validation');
const ItemModel = require('../../models/ItemModel');
const Character = require('../../models/CharacterModel');
const User = require('../../models/UserModel');
const { hasPerk, getJobPerk, normalizeJobName, isValidJob } = require('../../modules/jobsModule');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');
const { capitalizeWords } = require('../../modules/formattingModule');
const { applyStealingBoost, applyStealingJailBoost, applyStealingLootBoost } = require('../../modules/boostIntegration');
const { getActiveBuffEffects } = require('../../modules/elixirModule');

// Add StealStats model
const StealStats = require('../../models/StealStatsModel');

// Add NPC model for global steal protection tracking
const NPC = require('../../models/NPCModel');

// ============================================================================
// ---- Constants ----
// ============================================================================

// ------------------- System Constants -------------------
const STEAL_COOLDOWN = 5 * 60 * 1000; // 5 minutes in milliseconds
const STREAK_BONUS = 0.05; // 5% bonus per streak
const MAX_STREAK = 5; // Maximum streak bonus
const PROTECTION_DURATION = 2 * 60 * 60 * 1000; // 2 hours protection

// ------------------- Global Cooldown System -------------------
// New system to prevent steal abuse, especially for NPCs with rare items
const GLOBAL_FAILURE_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours global cooldown on failure
const GLOBAL_SUCCESS_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours global cooldown on success (resets at midnight EST)

// ------------------- Village Channels -------------------
const villageChannels = {
  Rudania: process.env.RUDANIA_TOWNHALL,
  Inariko: process.env.INARIKO_TOWNHALL,
  Vhintl: process.env.VHINTL_TOWNHALL,
};

// ------------------- Rarity Constants -------------------
const RARITY_COOLDOWN_MULTIPLIERS = {
    common: 1,
    uncommon: 1.5,
    rare: 2
};

const RARITY_WEIGHTS = {
    '1': 20, '2': 18, '3': 15, '4': 13, '5': 11, '6': 9, '7': 7, '8': 5, '9': 2, '10': 1
};

const FAILURE_CHANCES = {
    common: 10,
    uncommon: 50,
    rare: 80
};

// ------------------- NPC Difficulty Modifiers -------------------
// Zone and Peddler are harder to steal from due to rare items
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



// ------------------- NPC Item Cache -------------------
// Cache NPC items to avoid repeated database queries
const npcItemCache = new Map();
const NPC_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache duration

// ------------------- Preload Common NPC Items -------------------
// Preload items for commonly used NPCs to avoid database queries
const COMMON_NPC_CATEGORIES = {
    'Lukan': ['Apple', 'Dazzlefruit', 'Fire Fruit', 'Fleet-Lotus Seeds', 'Golden Apple', 'Hearty Durian', 'Hydromelon', 'Ice Fruit', 'Mighty Bananas', 'Palm Fruit', 'Shock Fruit', 'Spicy Pepper', 'Splash Fruit', 'Thornberry', 'Voltfruit', 'Wild berry'],
    'Hank': ['Swift Carrot', 'Endura Carrot', 'Hearty Radish', 'Mighty Thistle', 'Silent Princess', 'Sunshroom', 'Zapshroom', 'Rushroom', 'Razorshroom', 'Ironshroom', 'Stamellashroom', 'Chillshroom', 'Sunshroom', 'Zapshroom', 'Rushroom', 'Razorshroom', 'Ironshroom', 'Stamellashroom', 'Chillshroom'],
    'Sue': ['Hearty Bass', 'Hyrule Bass', 'Staminoka Bass', 'Armored Carp', 'Mighty Carp', 'Sanke Carp', 'Bright-Eyed Crab', 'Ironshell Crab', 'Razorclaw Crab']
};

// Preload common NPC items on startup
function preloadCommonNPCItems() {
    for (const [npcName, items] of Object.entries(COMMON_NPC_CATEGORIES)) {
        // Set default rarity of 1 (common) for preloaded items
        const itemsWithRarity = items.map(itemName => ({
            itemName,
            itemRarity: 1,
            quantity: Infinity,
            isNPC: true
        }));
        setCachedNPCItems(npcName, itemsWithRarity);
                    console.log(`[steal.js]: 💾 Preloaded ${items.length} items for ${npcName}`);
    }
}

// Initialize preloaded items
preloadCommonNPCItems();

// ------------------- NPC Item Cache Management -------------------
function getCachedNPCItems(npcName) {
    const cacheEntry = npcItemCache.get(npcName);
    if (cacheEntry && Date.now() - cacheEntry.timestamp < NPC_CACHE_DURATION) {
        return cacheEntry.items;
    }
    return null;
}

function setCachedNPCItems(npcName, items) {
    npcItemCache.set(npcName, {
        items: items,
        timestamp: Date.now()
    });
}

function clearExpiredNPCCache() {
    const now = Date.now();
    for (const [npcName, cacheEntry] of npcItemCache.entries()) {
        if (now - cacheEntry.timestamp >= NPC_CACHE_DURATION) {
            npcItemCache.delete(npcName);
        }
    }
}

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

// ------------------- Daily Steal Limit Functions -------------------
// Check if a daily steal is available for a specific activity
function canUseDailySteal(character, activity) {
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
  
  // If steal was used today, deny the action
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
    await character.save();
  } catch (error) {
    console.error(`[steal.js]: ❌ Failed to update daily steal for ${character.name}:`, error);
    throw error;
  }
}

// ------------------- Item Selection with Fallback Hierarchy -------------------
// Centralized item selection system that handles rarity-based fallback logic
// 
// FALLBACK HIERARCHY:
// - Rare items (rarity 8-10): rare -> uncommon -> common -> any available
// - Uncommon items (rarity 5-7): uncommon -> common -> any available  
// - Common items (rarity 1-4): common -> any available
//
// This system ensures that if the requested rarity isn't available, the system
// gracefully falls back to lower rarities rather than failing completely.
// The fallback is transparent to the user but provides feedback when it occurs.
async function selectItemsWithFallback(itemsWithRarity, targetRarity) {
    // Rarity mapping: 1-4 = common, 5-7 = uncommon, 8-10 = rare
    const RARITY_MAPPING = {
        common: { min: 1, max: 4 },
        uncommon: { min: 5, max: 7 },
        rare: { min: 8, max: 10 }
    };
    
    // Fallback hierarchy: rare -> uncommon -> common -> any available
    const FALLBACK_HIERARCHY = {
        rare: ['rare', 'uncommon', 'common', 'any'],
        uncommon: ['uncommon', 'common', 'any'],
        common: ['common', 'any']
    };
    
    // Process items with rarity and tier assignment
    const processedItems = itemsWithRarity
        .filter(({ itemRarity }) => itemRarity)
        .map(({ itemName, itemRarity }) => {
            let tier = 'common';
            if (itemRarity >= 8) tier = 'rare';
            else if (itemRarity >= 5) tier = 'uncommon';
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
        rare: '⚠️ No rare items found! But you did find something else...',
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
            const { fetchModCharacterByNameAndUserId } = require('../../database/db');
            character = await fetchModCharacterByNameAndUserId(characterName, userId);
        }
        
        if (!character) {
            return { valid: false, error: `❌ **Character "${characterName}" not found.** Please check the spelling and make sure the character exists.` };
        }
        
        if (userId && character.userId !== userId) {
            return { valid: false, error: '❌ **You can only perform this action with your own characters.**' };
        }
        
        if (requireInventorySync && !character.inventorySynced) {
            return { valid: false, error: ERROR_MESSAGES.INVENTORY_NOT_SYNCED };
        }
        
        return { valid: true, character };
    } catch (error) {
        console.error(`[steal.js]: ❌ Error validating character "${characterName}":`, error);
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

async function createStealResultEmbed(thiefCharacter, targetCharacter, item, quantity, roll, failureThreshold, isSuccess, isNPC = false) {
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
    
    const embed = createBaseEmbed(isSuccess ? '💰 Item Stolen!' : '💢 Failed Steal!', isSuccess ? '#AA926A' : '#ff0000')
        .setDescription(`${npcFlavorText}\n\n[**${thiefCharacter.name}**](${thiefCharacter.inventory || thiefCharacter.inventoryLink}) ${isSuccess ? 'successfully stole from' : 'tried to steal from'} ${isNPC ? targetCharacter : `[**${targetCharacter.name}**](${targetCharacter.inventory || targetCharacter.inventoryLink})`}`)
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
            text: isSuccess ? 'Steal successful!' : 'Steal failed!', 
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
        // Calculate next steal availability (8 AM EST / 12:00 UTC)
        const now = new Date();
        const nextRollover = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 12, 0, 0, 0));
        const timeUntilNextSteal = nextRollover.getTime() - now.getTime();
        const hoursUntilNext = Math.floor(timeUntilNextSteal / (60 * 60 * 1000));
        const minutesUntilNext = Math.floor((timeUntilNextSteal % (60 * 60 * 1000)) / (60 * 1000));
        
        let cooldownText;
        if (hoursUntilNext > 0) {
            cooldownText = `> **${hoursUntilNext}h ${minutesUntilNext}m** until next steal`;
        } else {
            cooldownText = `> **${minutesUntilNext}m** until next steal`;
        }
        
        embed.addFields({
            name: '⏰ Next Steal Available',
            value: cooldownText,
            inline: false
        });
    }
    
    // Add protection information for failed steals
    if (!isSuccess) {
        // Calculate 2-hour cooldown from now
        const now = new Date();
        const cooldownEnd = new Date(now.getTime() + (2 * 60 * 60 * 1000)); // 2 hours from now
        const timeUntilCooldownEnd = cooldownEnd.getTime() - now.getTime();
        const hoursUntilEnd = Math.floor(timeUntilCooldownEnd / (60 * 60 * 1000));
        const minutesUntilEnd = Math.floor((timeUntilCooldownEnd % (60 * 60 * 1000)) / (60 * 1000));
        
        let cooldownText;
        if (hoursUntilEnd > 0) {
            cooldownText = `> **${hoursUntilEnd}h ${minutesUntilEnd}m** until protection expires`;
        } else {
            cooldownText = `> **${minutesUntilEnd}m** until protection expires`;
        }
        
        // Add target protection information (failed attempts handled separately)
        embed.addFields({
            name: '🛡️ Target Protection',
            value: `> **${isNPC ? targetCharacter : targetCharacter.name}** is now protected from theft for **2 hours** due to this failed attempt!`,
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
    // Convert minutes to hours and minutes for better display
    let timeDisplay;
    if (timeLeftMinutes >= 60) {
        const hours = Math.floor(timeLeftMinutes / 60);
        const minutes = timeLeftMinutes % 60;
        if (minutes > 0) {
            timeDisplay = `**${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}**`;
        } else {
            timeDisplay = `**${timeLeftMinutes} minute${timeLeftMinutes !== 1 ? 's' : ''}**`;
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
        console.error('[steal.js]: Error checking protection:', error);
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
                console.error(`[steal.js]: Failed to set protection for NPC: ${targetId}`);
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
                console.error(`[steal.js]: Character not found for protection: ${targetId}`);
            }
        }
    } catch (error) {
        console.error('[steal.js]: Error setting protection:', error);
    }
}

// Clear protection
async function clearProtection(targetId) {
    try {
        if (typeof targetId === 'string' && !targetId.includes('_')) {
            // This is an NPC
            const result = await NPC.clearProtection(targetId);
            if (!result) {
                console.error(`[steal.js]: Failed to clear protection for NPC: ${targetId}`);
            }
        } else {
            // This is a player character
            const character = await Character.findById(targetId);
            if (character) {
                character.clearProtection();
                await character.save();
            } else {
                console.error(`[steal.js]: Character not found for clearing protection: ${targetId}`);
            }
        }
    } catch (error) {
        console.error('[steal.js]: Error clearing protection:', error);
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
    console.error('[steal.js]: Error setting global success protection:', error);
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
    console.error('[steal.js]: Error setting global failure protection:', error);
  }
}

// Note: Protection methods simplified to use unified isProtectionExpired and getProtectionTimeLeft functions

// Reset all protections (called by scheduler at midnight EST)
async function resetAllStealProtections() {
  try {
    console.log('[steal.js]: 🛡️ Starting steal protection reset...');
    
    // Reset NPC protections
    const npcResult = await NPC.resetAllProtections();
    console.log(`[steal.js]: ✅ Reset ${npcResult.modifiedCount} NPC protections`);
    
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
    console.log(`[steal.js]: ✅ Reset ${characterResult.modifiedCount} player protections`);
    
    console.log('[steal.js]: 🛡️ All steal protection reset completed');
  } catch (error) {
    console.error('[steal.js]: ❌ Error resetting steal protections:', error);
  }
}

// ------------------- Cleanup expired protections -------------------
function cleanupExpiredProtections() {
    // Database models now handle their own cleanup via pre-save middleware
    // Just clear expired NPC cache
    clearExpiredNPCCache();
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
                    uncommon: 0,
                    rare: 0
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
        console.error('[steal.js]: Error updating steal stats:', error);
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
                    uncommon: 0,
                    rare: 0
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
        console.error('[steal.js]: Error getting steal stats:', error);
        return {
            totalAttempts: 0,
            successfulSteals: 0,
            failedSteals: 0,
            successRate: 0,
            itemsByRarity: {
                common: 0,
                uncommon: 0,
                rare: 0
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
        console.error('[steal.js]: Error getting item emoji:', error);
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
        } else if (item.tier === 'rare') {
            quantityToSteal = 1;
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
    } else if (item.tier === 'rare') {
        quantityToSteal = Math.min(availableQuantity, 1);
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
        console.error('[steal.js]: ❌ Error checking if item is custom weapon:', error);
        return false; // Default to allowing theft if check fails
    }
}

// ------------------- Jail Management Functions -------------------
// Centralized jail system to prevent race conditions and ensure consistency
const JAIL_DURATION = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

async function checkAndUpdateJailStatus(character) {
    // If not in jail, no action needed
    if (!character.inJail) {
        return { isInJail: false, timeLeft: 0 };
    }
    
    // Handle missing or invalid jailReleaseTime
    if (!character.jailReleaseTime || isNaN(new Date(character.jailReleaseTime).getTime())) {
        character.inJail = false;
        character.jailReleaseTime = null;
        await character.save();
        return { isInJail: false, timeLeft: 0 };
    }
    
    const now = Date.now();
    const releaseTime = new Date(character.jailReleaseTime).getTime();
    const timeLeft = releaseTime - now;
    
    // If jail time has expired, release the character
    if (timeLeft <= 0) {
        character.inJail = false;
        character.jailReleaseTime = null;
        await character.save();
        return { isInJail: false, timeLeft: 0 };
    }
    
    // Calculate the date when the character was jailed (3 days before release)
    const jailedDate = new Date(releaseTime - (3 * 24 * 60 * 60 * 1000));
    
    return { 
        isInJail: true, 
        timeLeft,
        jailedDate: jailedDate
    };
}

async function sendToJail(character) {
    // Mod characters are immune to jail
    if (character.isModCharacter) {
        console.log(`[steal.js]: 👑 Mod character ${character.name} is immune to jail.`);
        return {
            success: false,
            message: `👑 ${character.name} is a mod character and cannot be sent to jail.`
        };
    }
    
    // Calculate release time: 3 days from now at midnight EST
    const now = new Date();
    const estNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const releaseDateEST = new Date(estNow.getFullYear(), estNow.getMonth(), estNow.getDate() + 3, 0, 0, 0, 0);
    
    // Store the EST midnight time directly
    character.inJail = true;
    character.jailReleaseTime = releaseDateEST;
    character.failedStealAttempts = 0; // Reset counter
    await character.save();
    
    return {
        success: true,
        releaseTime: character.jailReleaseTime,
        timeLeft: character.jailReleaseTime.getTime() - Date.now()
    };
}

function getJailTimeLeft(character) {
    if (!character.inJail || !character.jailReleaseTime) {
        return 0;
    }
    
    const now = Date.now();
    const releaseTime = new Date(character.jailReleaseTime).getTime();
    const timeLeft = releaseTime - now;
    
    return timeLeft > 0 ? timeLeft : 0;
}

function formatJailTimeLeft(timeLeft) {
    if (timeLeft <= 0) return '0 minutes';
    
    const hours = Math.floor(timeLeft / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

function formatJailTimeLeftDaysHours(timeLeft) {
    if (timeLeft <= 0) return '0 minutes';
    
    const days = Math.floor(timeLeft / (24 * 60 * 60 * 1000));
    const hours = Math.floor((timeLeft % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
    
    if (days > 0) {
        return `${days}d ${hours}h`;
    } else if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else {
        return `${minutes}m`;
    }
}

// ------------------- Centralized Error Handling -------------------
// Centralized error handling for steal operations to eliminate duplication
async function handleStealError(error, interaction, operationType) {
    console.error(`[steal.js]: ❌ Critical error during ${operationType} flow:`, error);
    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.editReply({ 
                content: '❌ **An error occurred while processing the steal. If you see an item in your inventory that shouldn\'t be there, please contact staff.**' 
            });
        } else {
            await interaction.reply({ 
                content: '❌ **An error occurred while processing the steal. If you see an item in your inventory that shouldn\'t be there, please contact staff.**', 
                ephemeral: true 
            });
        }
    } catch (followUpError) {
        console.error('[steal.js]: ❌ Failed to send error message:', followUpError);
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
        const deactivationResult = await deactivateJobVoucher(thiefCharacter._id);
        if (!deactivationResult.success) {
            console.error(`[steal.js]: ❌ Failed to deactivate job voucher for ${thiefCharacter.name}`);
        } else {
            console.log(`[steal.js]: ✅ Job voucher deactivated for ${thiefCharacter.name}`);
        }
    }
}

// ------------------- Centralized Failed Attempts Handling -------------------
// Centralized failed attempts logic to eliminate duplication
async function handleFailedAttempts(thiefCharacter, embed) {
    // Increment failed attempts counter
    thiefCharacter.failedStealAttempts = (thiefCharacter.failedStealAttempts || 0) + 1;
    await thiefCharacter.save();
    
    const attemptsLeft = 3 - thiefCharacter.failedStealAttempts;
    let warningMessage = '';
    let attemptsText = '';
    
    if (attemptsLeft === 1) {
        warningMessage = '⚠️ **Final Warning:** One more failed attempt and you\'ll be sent to jail!';
        attemptsText = 'You have 1 attempt remaining before jail time!';
    } else if (attemptsLeft <= 0) {
        // Send to jail using centralized function
        const jailResult = await sendToJail(thiefCharacter);
        warningMessage = '⛔ **You have been sent to jail for 3 days!**';
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
        thiefCharacter.blighted = true;
        thiefCharacter.blightedAt = new Date();
        thiefCharacter.blightStage = 1; // Start at stage 1
        thiefCharacter.blightPaused = false;
        
        // Set death deadline (7 days from now)
        const deathDeadline = new Date();
        deathDeadline.setDate(deathDeadline.getDate() + 7);
        thiefCharacter.deathDeadline = deathDeadline;
        
        await thiefCharacter.save();
        
        // Assign blighted role
        const guild = interaction.guild;
        if (guild) {
            const member = await guild.members.fetch(interaction.user.id);
            await member.roles.add('798387447967910');
        }
        
        // Update user's blightedcharacter status
        const user = await User.findOne({ discordId: interaction.user.id });
        if (user) {
            user.blightedcharacter = true;
            await user.save();
        }
        
        return { 
            infected: true, 
            message: `⚠️ **Blight Infection!** ${thiefCharacter.name} has been infected with blight while stealing from ${targetCharacter.name} (Stage ${targetCharacter.blightStage} blight).\n\n🦠 **Blight Stage:** 1\n⏰ **Death Deadline:** <t:${Math.floor(deathDeadline.getTime() / 1000)}:F>\n💊 **Seek healing immediately!**`
        };
    } catch (error) {
        console.error(`[steal.js]: ❌ Failed to infect ${thiefCharacter.name} with blight:`, error);
        return { infected: false, message: null };
    }
}

// ------------------- Centralized Success Handling -------------------
// Centralized success handling to eliminate duplication
async function handleStealSuccess(thiefCharacter, targetCharacter, selectedItem, quantity, roll, failureThreshold, isNPC, interaction, voucherCheck, usedFallback, targetRarity, selectedTier) {
    incrementStreak(interaction.user.id);
    await updateStealStats(thiefCharacter._id, true, selectedItem.tier, isNPC ? null : targetCharacter, isNPC, isNPC ? targetCharacter : null);
    
    // Check for blight infection
    const blightResult = await checkBlightInfection(thiefCharacter, targetCharacter, isNPC, interaction);
    
    // Set protection on target until midnight EST (prevents farming the same target)
    try {
        if (isNPC) {
            await setProtection(targetCharacter, 'midnight'); // targetCharacter is NPC name string
        } else {
            await setProtection(targetCharacter._id, 'midnight');
        }
    } catch (error) {
        console.error('[steal.js]: Error setting protection after successful steal:', error);
        // Continue with success logic even if protection setting fails
    }
    
    const stolenItem = {
        itemName: selectedItem.itemName,
        quantity: quantity,
        obtain: isNPC ? `Stolen from NPC ${targetCharacter}` : `Stolen from ${targetCharacter.name}`,
        date: new Date()
    };
    
    try {
        // Perform the inventory sync
        await syncToInventoryDatabase(thiefCharacter, stolenItem, interaction);
        
        // For player steals, also remove item from target's inventory
        if (!isNPC) {
            const removedItem = {
                itemName: selectedItem.itemName,
                quantity: -quantity,
                obtain: `Item stolen by ${thiefCharacter.name}`,
                date: new Date()
            };
            await syncToInventoryDatabase(targetCharacter, removedItem, interaction);
        }
        
        // Create and send the embed
        const embed = await createStealResultEmbed(thiefCharacter, targetCharacter, selectedItem, quantity, roll, failureThreshold, true, isNPC);
        
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
        
        // Add target protection information
        if (isNPC) {
            embed.addFields({
                name: '🛡️ Target Protection',
                value: `> **${targetCharacter}** is now protected from theft until **midnight tonight** due to this successful steal!`,
                inline: false
            });
        } else {
            embed.addFields({
                name: '🛡️ Target Protection',
                value: `> **${targetCharacter.name}** is now protected from theft until **midnight tonight** due to this successful steal!`,
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
          console.log(`[steal.js]: 🧪 Clearing boost for ${thiefCharacter.name}`);
          thiefCharacter.boostedBy = null;
          await thiefCharacter.save();
        }
        
        // Always deactivate job voucher after any attempt
        await deactivateJobVoucherIfNeeded(thiefCharacter, voucherCheck);
        
        if (isNPC) {
            await interaction.editReply({ embeds: [embed] });
        } else {
            await interaction.editReply({
                content: `Hey! <@${targetCharacter.userId}>! Your character **${targetCharacter.name}** was stolen from!`,
                embeds: [embed]
            });
        }
    } catch (error) {
        await handleStealError(error, interaction, isNPC ? 'NPC steal success' : 'player steal success');
    }
}

// ------------------- Centralized Failure Handling -------------------
// Centralized failure handling to eliminate duplication
async function handleStealFailure(thiefCharacter, targetCharacter, selectedItem, roll, failureThreshold, isNPC, interaction, voucherCheck, usedFallback, targetRarity, selectedTier) {
    resetStreak(interaction.user.id);
    await updateStealStats(thiefCharacter._id, false, selectedItem.tier);
    
    // Set protection on the target to prevent immediate retry from anyone
    if (isNPC) {
        await setProtection(targetCharacter); // targetCharacter is NPC name string
    } else {
        await setProtection(targetCharacter._id);
    }
    
    try {
        const embed = await createStealResultEmbed(thiefCharacter, targetCharacter, selectedItem, 0, roll, failureThreshold, false, isNPC);
        
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
          console.log(`[steal.js]: 🧪 Clearing boost for ${thiefCharacter.name}`);
          thiefCharacter.boostedBy = null;
          await thiefCharacter.save();
        }
        
        // Always deactivate job voucher after any attempt
        await deactivateJobVoucherIfNeeded(thiefCharacter, voucherCheck);
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleStealError(error, interaction, isNPC ? 'NPC steal failure' : 'player steal failure');
    }
}

// ------------------- Centralized Roll Generation -------------------
// Centralized roll generation to eliminate duplication
async function generateStealRoll(character = null) {
    let roll = Math.floor(Math.random() * 99) + 1;
    
    // Apply Stealing boosts to the roll
    roll = await applyStealingBoost(character.name, roll);
    
    // Apply elixir stealth buff if active
    if (character) {
        const buffEffects = getActiveBuffEffects(character);
        if (buffEffects && buffEffects.stealthBoost > 0) {
            roll += buffEffects.stealthBoost;
            console.log(`[steal.js]: 🧪 Stealth buff applied - Steal roll increased by ${buffEffects.stealthBoost} to ${roll}`);
        }
    }
    
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
        // Some NPCs are harder to steal from due to rare items
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
function escapeRegexString(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
        console.error('[steal.js]: ❌ Error in processItemsWithRarity:', error);
        // Fallback to individual processing if batch fails
        console.log('[steal.js]: ⚠️ Falling back to individual item processing');
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
                const jailStatus = await checkAndUpdateJailStatus(character);
                
                if (!jailStatus.isInJail) {
                    const notInJailEmbed = createBaseEmbed('✅ Not in Jail', '#00ff00')
                        .setDescription(`**${character.name}** is not currently in jail.`)
                        .setThumbnail(character.icon)
                        .setImage('https://storage.googleapis.com/tinglebot/Graphics/border.png');
                    
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
                const isCharacterProtected = await isProtected(character._id);
                const protectionTimeLeft = await getProtectionTimeLeft(character._id);
                const protectionStatus = isCharacterProtected && protectionTimeLeft > 0
                    ? `🛡️ Protected (${Math.ceil(protectionTimeLeft / (60 * 1000))}m remaining)`
                    : '✅ Not protected';
                
                // Check jail status
                let jailStatus = '';
                if (character.inJail && character.jailReleaseTime) {
                    const now = new Date();
                    const releaseTime = new Date(character.jailReleaseTime);
                    const timeUntilRelease = releaseTime.getTime() - now.getTime();
                    
                    if (timeUntilRelease > 0) {
                        const daysUntilRelease = Math.ceil(timeUntilRelease / (24 * 60 * 60 * 1000));
                        const jailedDate = releaseTime.toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'long', 
                            day: 'numeric',
                            timeZone: 'America/New_York'
                        });
                        jailStatus = `⛔ **In Jail** - Released on ${jailedDate} (${daysUntilRelease} day${daysUntilRelease !== 1 ? 's' : ''} remaining)`;
                    } else {
                        // Jail time is up, character should be released
                        character.inJail = false;
                        character.jailReleaseTime = null;
                        await character.save();
                    }
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
                
                // Add jail status if applicable
                if (jailStatus && jailStatus.trim() !== '') {
                    embed.addFields({ name: '__⛔ Jail Status__', value: `> ${jailStatus}`, inline: false });
                }
                
                // Add items by rarity
                embed.addFields({ 
                    name: '__✨ Items by Rarity__', 
                    value: `> Common: ${stats.itemsByRarity.common}\n> Uncommon: ${stats.itemsByRarity.uncommon}\n> Rare: ${stats.itemsByRarity.rare}`, 
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

            // If we get here, we're handling the 'commit' subcommand
            if (!targetName || !targetType || !raritySelection) {
                await interaction.reply({ content: '❌ **Missing required options for steal command.**', ephemeral: true });
                return;
            }

            // Performance timing log
            console.log(`[steal.js]: 🚀 Starting steal command - ${targetType}: ${targetName}, rarity: ${raritySelection || 'any'}`);

            // ---- Target Type Validation ----
            if (targetType !== 'npc' && targetType !== 'player') {
                await interaction.reply({ 
                    content: `❌ **Invalid target type: "${targetType}"**\n\n**Valid target types:**\n• **NPC** - Steal from non-player characters\n• **Player** - Steal from other player characters\n\n**Tip:** Make sure to select a target type from the dropdown menu.`, 
                    ephemeral: true 
                });
                return;
            }

            // ---- Rarity Validation ----
            const allowedRarities = ['common', 'uncommon', 'rare'];
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
                    console.log(`[steal.js]: ❌ Player target validation failed - targetName: "${targetName}"`);
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
                    console.log(`[steal.js]: ✅ NPC steal completed (${npcEndTime - startTime}ms)`);
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
                    console.log(`[steal.js]: ✅ Player steal completed (${playerEndTime - startTime}ms)`);
                }
            }
        } catch (error) {
            const errorTime = Date.now();
            const totalTime = errorTime - startTime;
            console.log(`[steal.js]: ❌ Steal command failed after ${totalTime}ms`);
            
            handleError(error, 'steal.js', {
                commandName: 'steal',
                userTag: interaction.user.tag,
                userId: interaction.user.id,
                characterName: characterName,
                options: {
                    targetType,
                    targetName,
                    raritySelection
                }
            });
            console.error('[steal.js]: Error executing command:', error);
            
            // Check if interaction has already been replied to
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ **An error occurred while processing the command.**', ephemeral: true });
            } else {
                await interaction.editReply({ content: '❌ **An error occurred while processing the command.**' });
            }
        }
    },
    
    // Utility function for external use
    resetAllStealProtections
};

// ------------------- NPC Validation Helper -------------------
function validateNPCTarget(targetName) {
    // Safety check: ensure NPCs is available
    if (!NPCs || typeof NPCs !== 'object') {
        console.error('[steal.js]: ❌ Critical error - NPCs object is not available');
        return { 
            valid: false, 
            error: '❌ **System Error: NPC data not available**\n\n**Please contact staff immediately.**\n\n**Error Details:** NPCs module failed to load properly.'
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
                console.log(`[steal.js]: ❌ NPC validation failed - targetName: "${targetName}"`);
                return { valid: false, error: npcValidation.error };
            }
            
            const mappedNPCName = npcValidation.npcName;
            
            // Check if NPC is protected
            const npcProtection = await isProtected(mappedNPCName);
            if (npcProtection.protected) {
                const timeLeftMinutes = Math.ceil(npcProtection.timeLeft / (60 * 1000));
                const npcIcon = NPCs[mappedNPCName]?.icon || null;
                const protectionEmbed = createProtectionEmbed(mappedNPCName, timeLeftMinutes, true, npcProtection.type, npcIcon);
                await interaction.editReply({ embeds: [protectionEmbed] });
                return { valid: false, error: 'NPC is protected' };
            }
            
            return { valid: true, target: mappedNPCName, isNPC: true };
        } else {
            // Player target validation
            const targetValidation = await validateCharacter(targetName, null);
            if (!targetValidation.valid) {
                console.log(`[steal.js]: ❌ Player target validation failed - targetName: "${targetName}"`);
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
            const targetJailStatus = await checkAndUpdateJailStatus(targetCharacter);
            if (targetJailStatus.isInJail) {
                const timeLeft = formatJailTimeLeftDaysHours(targetJailStatus.timeLeft);
                const jailEmbed = createJailBlockEmbed(targetCharacter.name, timeLeft, targetCharacter.icon, thiefCharacter.icon);
                await interaction.editReply({ embeds: [jailEmbed] });
                return { valid: false, error: 'Target is in jail' };
            }
            
            // Check if target is debuffed
            if (targetCharacter.debuff && targetCharacter.debuff.active) {
                return { 
                    valid: false, 
                    error: `❌ **You cannot steal from a character who is debuffed!**\n💊 ${targetCharacter.name} is currently under a debuff effect.` 
                };
            }
            
            // Check if target is KO'd
            if (targetCharacter.ko) {
                return { 
                    valid: false, 
                    error: `❌ **You cannot steal from a character who is KO'd!**\n💀 ${targetCharacter.name} is currently unconscious.` 
                };
            }
            
            // Check if target has synced inventory
            if (!targetCharacter.inventorySynced) {
                return { 
                    valid: false, 
                    error: `❌ **You cannot steal from a character whose inventory is not synced!**\n📦 ${targetCharacter.name} needs to sync their inventory first.` 
                };
            }
            
            // Check village restriction
            if (thiefCharacter.currentVillage !== targetCharacter.currentVillage && interaction.channelId !== '1391812848099004578') {
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
        console.error('[steal.js]: Error in validateStealTarget:', error);
        return { valid: false, error: '❌ **An error occurred while validating the target.**' };
    }
}

// ------------------- Centralized Item Processing for Stealing -------------------
// Centralized function to process items for stealing from both NPCs and players
async function processItemsForStealing(targetName, targetType, raritySelection, targetCharacter = null) {
    try {
        if (targetType === 'npc') {
            // Handle Peddler special case
            if (targetName === 'Peddler') {
                const Item = require('../../models/ItemModel');
                const allItems = await Item.find({}, 'itemName');
                let npcInventory = allItems.map(item => item.itemName);
                
                // Filter out custom weapons from Peddler inventory
                const peddlerInventoryWithoutCustomWeapons = [];
                for (const itemName of npcInventory) {
                    const isCustom = await isCustomWeapon(itemName);
                    if (!isCustom) {
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
            } else {
                // For other NPCs, use cached items or fetch from database
                const cachedItems = getCachedNPCItems(targetName);
                if (cachedItems) {
                    npcInventory = cachedItems;
                } else {
                    npcInventory = await getNPCItems(targetName);
                    
                    // Cache the results for future use
                    if (Array.isArray(npcInventory) && npcInventory.length > 0) {
                        setCachedNPCItems(targetName, npcInventory);
                    }
                }
                
                // Check if we got a valid inventory
                if (!Array.isArray(npcInventory) || npcInventory.length === 0) {
                    return { 
                        success: false, 
                        error: `❌ **No items available to steal from ${targetName}!**\n🛡️ This NPC may not have any stealable items.` 
                    };
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
                        console.warn(`[steal.js]: ⚠️ Unexpected item format in NPC inventory:`, item);
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
                    const isCustom = await isCustomWeapon(itemName);
                    if (!isCustom) {
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
            const itemsWithRarity = await processItemsWithRarity(npcInventory, true);
            const { items: filteredItems, selectedTier, usedFallback } = await selectItemsWithFallback(itemsWithRarity, raritySelection);
            
            if (filteredItems.length === 0) {
                const fallbackMessage = getFallbackMessage(raritySelection, selectedTier);
                if (fallbackMessage) {
                    return { success: false, error: fallbackMessage };
                } else {
                    return { 
                        success: false, 
                        error: `❌ **No items available to steal from ${targetName}!**\n🛡️ All available items are protected from theft.` 
                    };
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
            const targetInventoryCollection = await getCharacterInventoryCollection(targetCharacter.name);
            const inventoryEntries = await targetInventoryCollection.find({ characterId: targetCharacter._id }).toArray();
            const rawItemNames = inventoryEntries.map(entry => entry.itemName);

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
                const isCustom = await isCustomWeapon(itemName);
                if (!isCustom) {
                    availableItemNamesWithoutCustomWeapons.push(itemName);
                }
            }
            
            if (availableItemNamesWithoutCustomWeapons.length === 0) {
                return { 
                    success: false, 
                    error: `❌ **Looks like ${targetCharacter.name} didn't have any items to steal!**\n🛡️ All available items are protected from theft (Custom Weapons, Spirit Orbs, and vouchers).` 
                };
            }
            
            const itemsWithRarity = await processItemsWithRarity(availableItemNamesWithoutCustomWeapons, false, inventoryEntries);
            const { items: filteredItems, selectedTier, usedFallback } = await selectItemsWithFallback(itemsWithRarity, raritySelection);

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
        console.error('[steal.js]: Error in processItemsForStealing:', error);
        return { 
            success: false, 
            error: '❌ **An error occurred while processing items for stealing.**' 
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
                console.error(`[Steal Command]: ❌ Failed to update daily steal:`, error);
                await interaction.editReply({
                    content: `❌ **An error occurred while updating your daily steal. Please try again.**`,
                    ephemeral: true
                });
                return;
            }
        }

        const selectedItem = getRandomItemByWeight(items);
        const roll = await generateStealRoll(thiefCharacter);
        const failureThreshold = await calculateFailureThreshold(selectedItem.tier, thiefCharacter, targetName);
        const isSuccess = roll > failureThreshold;

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
                selectedTier
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
        console.error('[steal.js]: Error in executeStealAttempt:', error);
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
                console.log(`[steal.js]: 🎫 Voucher override - village: ${requiredVillage}`);
            }
        }

        // Allow testing in specific channel
        const testingChannelId = '1391812848099004578';
        const isTestingChannel = interaction.channelId === testingChannelId;

        // If allowedChannel is undefined, allow the command to proceed (for testing)
        if (!allowedChannel) {
            console.log(`[steal.js]: ⚠️ No channel configured for village ${currentVillage} - allowing command`);
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
        console.error('[steal.js]: Error in validateChannelAccess:', error);
        return { valid: false, error: 'Channel validation error' };
    }
}

// ------------------- Job Voucher Validation -------------------
// Centralized function to validate and activate job vouchers for stealing
async function validateAndActivateJobVoucher(thiefCharacter, job, interaction) {
    try {
        let voucherCheck;
        if (thiefCharacter.jobVoucher) {
            console.log(`[steal.js]: 🎫 Validating job voucher for ${thiefCharacter.name}`);
            voucherCheck = await validateJobVoucher(thiefCharacter, job, 'STEALING');
            
            if (voucherCheck.skipVoucher) {
                console.log(`[steal.js]: ✅ Voucher skipped - ${thiefCharacter.name} already has job "${job}"`);
            } else if (!voucherCheck.success) {
                console.error(`[steal.js]: ❌ Voucher validation failed: ${voucherCheck.message}`);
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
        console.error('[steal.js]: Error in validateAndActivateJobVoucher:', error);
        return { success: false, error: '❌ **An error occurred while validating the job voucher.**' };
    }
}

// ------------------- Character Status Validation -------------------
// Centralized function to validate character status for stealing
async function validateCharacterStatus(thiefCharacter, interaction) {
    try {
        // Check if thief's inventory is set up
        if (!thiefCharacter.inventorySynced) {
            await interaction.editReply({ 
                content: '❌ **Your inventory is not set up yet.** Use `/inventory test charactername:NAME` then `/inventory sync charactername:NAME` to initialize.', 
                ephemeral: true 
            });
            return { valid: false, error: 'Inventory not synced' };
        }

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
            await interaction.editReply({ 
                content: '❌ **You cannot steal while debuffed!**\n💊 You need to wait for your debuff to expire or get healed first.', 
                ephemeral: true 
            });
            return { valid: false, error: 'Character is debuffed' };
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
        if (typeof thiefInventoryLink !== 'string' || !isValidGoogleSheetsUrl(thiefInventoryLink)) {
            await interaction.editReply({ 
                content: `❌ **Invalid Google Sheets URL for "${thiefCharacter.name}".**`, 
                ephemeral: true 
            });
            return { valid: false, error: 'Invalid inventory URL' };
        }
        
        return { valid: true };
    } catch (error) {
        console.error('[steal.js]: Error in validateCharacterStatus:', error);
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
            const errorMessage = '❌ **Bandit characters cannot steal while debuffed!**\n💊 You need to wait for your debuff to expire or get healed first.';
            await interaction.editReply({ 
                content: errorMessage, 
                ephemeral: true 
            });
            console.log(`[steal.js]: ⚠️ Steal blocked - debuffed bandit: ${thiefCharacter.name}`);
            return { valid: false, error: errorMessage };
        }

        // Check if bandit character is KO'd
        if (thiefCharacter.ko) {
            const errorMessage = '❌ **Bandit characters cannot steal while KO\'d!**\n💀 You need to be healed first before you can steal.';
            await interaction.editReply({ 
                content: errorMessage, 
                ephemeral: true 
            });
            console.log(`[steal.js]: ⚠️ Steal blocked - KO'd bandit: ${thiefCharacter.name}`);
            return { valid: false, error: errorMessage };
        }

        // Check if character is in jail
        const jailStatus = await checkAndUpdateJailStatus(thiefCharacter);
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
            // Check if steal has been used today
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
                        description: `*${thiefCharacter.name} seems exhausted from their earlier stealing...*\n\n**Daily stealing limit reached.**\nThe next opportunity to steal will be available at <t:${unixTimestamp}:F>.\n\n*Tip: A job voucher would allow you to steal again today.*`,
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
        console.error('[steal.js]: Error in validateThiefCharacter:', error);
        return { valid: false, error: '❌ **An error occurred while validating the thief character.**' };
    }
}



