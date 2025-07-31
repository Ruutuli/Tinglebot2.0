// ============================================================================
// ---- Imports ----
// ============================================================================

// ------------------- Third-party Library Imports -------------------
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { v4: uuidv4 } = require('uuid');

// ------------------- Local Module Imports -------------------
const { handleError } = require('../../utils/globalErrorHandler');
const { fetchCharacterByName, getCharacterInventoryCollection, fetchItemRarityByName } = require('../../database/db');
const { removeItemInventoryDatabase, addItemInventoryDatabase, syncToInventoryDatabase } = require('../../utils/inventoryUtils');
const { getNPCItems, NPCs } = require('../../modules/stealingNPCSModule');
const { authorizeSheets, appendSheetData, safeAppendDataToSheet } = require('../../utils/googleSheetsUtils');
const { isValidGoogleSheetsUrl, extractSpreadsheetId } = require('../../utils/validation');
const ItemModel = require('../../models/ItemModel');
const { fetchActiveBoost } = require('../../utils/boostingUtils');
const Character = require('../../models/CharacterModel');
const { hasPerk, getJobPerk, normalizeJobName, isValidJob } = require('../../modules/jobsModule');
const { validateJobVoucher, activateJobVoucher, fetchJobVoucherItem, deactivateJobVoucher, getJobVoucherErrorMessage } = require('../../modules/jobVoucherModule');
const { capitalizeWords } = require('../../modules/formattingModule');

// Add StealStats model
const StealStats = require('../../models/StealStatsModel');

// ============================================================================
// ---- Constants ----
// ============================================================================

// ------------------- System Constants -------------------
const STEAL_COOLDOWN = 5 * 60 * 1000; // 5 minutes in milliseconds
const STREAK_BONUS = 0.05; // 5% bonus per streak
const MAX_STREAK = 5; // Maximum streak bonus
const PROTECTION_DURATION = 30 * 60 * 1000; // 30 minutes protection

// ------------------- Village Channels -------------------
const villageChannels = {
  Rudania: process.env.RUDANIA_TOWN_HALL,
  Inariko: process.env.INARIKO_TOWN_HALL,
  Vhintl: process.env.VHINTL_TOWN_HALL,
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

// ------------------- Error Messages -------------------
const ERROR_MESSAGES = {
    CHARACTER_NOT_FOUND: '❌ **Character not found.**',
    INVENTORY_NOT_SYNCED: '❌ **Inventory is not set up yet.** Use `/inventory test charactername:NAME` then `/inventory sync charactername:NAME` to initialize.',
    IN_JAIL: '⛔ **You are currently in jail and cannot steal!**',
    PROTECTED: '🛡️ **This character is currently protected from theft!**',
    COOLDOWN: '⏰ **Please wait {time} seconds before attempting to steal again.**',
    NO_ITEMS: '❌ **No items available to steal!**',
    INVALID_TARGET: '❌ **Invalid target selected!**'
};

// ------------------- NPC Data -------------------
const NPC_NAME_MAPPING = {
    'Hank': 'Hank',
    'Sue': 'Sue',
    'Lukan': 'Lukan',
    'Myti': 'Myti',
    'Cree': 'Cree',
    'Cece': 'Cece',
    'Walton': 'Walton',
    'Jengo': 'Jengo',
    'Jasz': 'Jasz',
    'Lecia': 'Lecia',
    'Tye': 'Tye',
    'Lil Tim': 'Lil Tim'
};

// ============================================================================
// ---- State Management ----
// ============================================================================

// ------------------- User State Tracking -------------------
// const userCooldowns = new Map(); // Track user cooldowns
const stealStreaks = new Map(); // Track successful steal streaks
const stealProtection = new Map(); // Track protection after being stolen from (30 minutes)

// ============================================================================
// ---- Helper Functions ----
// ============================================================================

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
        const character = await fetchCharacterByName(characterName);
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
    
    // Get NPC flavor text if it's an NPC
    let npcFlavorText = '';
    if (isNPC) {
        const npcName = typeof targetCharacter === 'string' ? targetCharacter : targetCharacter.name;
        const npcData = NPCs[npcName];
        if (npcData && npcData.flavorText) {
            npcFlavorText = `*${npcData.flavorText}*`;
        } else {
            npcFlavorText = `*${npcName} ${isSuccess ? 'didn\'t notice you taking' : 'caught you trying to take'} something...*`;
        }
    }
    
    const embed = createBaseEmbed(isSuccess ? '💰 Item Stolen!' : '💢 Failed Steal!', isSuccess ? '#AA926A' : '#ff0000')
        .setDescription(`${npcFlavorText}\n\n[**${thiefCharacter.name}**](${thiefCharacter.inventory || thiefCharacter.inventoryLink}) ${isSuccess ? 'successfully stole from' : 'tried to steal from'} ${isNPC ? targetCharacter : `[**${targetCharacter.name}**](${targetCharacter.inventory || targetCharacter.inventoryLink})`}`)
        .addFields(
            { name: '📦 Item', value: `> **${itemEmoji} ${item.itemName}**${isSuccess ? ` x**${quantity}**` : ''}`, inline: false },
            { name: '🎲 Roll', value: `> ${successField}`, inline: false },
            { name: '✨ Rarity', value: `> **${item.tier.toUpperCase()}**`, inline: false }
        )
        .setThumbnail(isNPC ? 'https://i.pinimg.com/736x/3b/fb/7b/3bfb7bd4ea33b017d58d289e130d487a.jpg' : targetCharacter.icon)
        .setAuthor({ 
            name: `${thiefCharacter.name} the ${thiefCharacter.job ? thiefCharacter.job.charAt(0).toUpperCase() + thiefCharacter.job.slice(1).toLowerCase() : 'No Job'}`, 
            iconURL: thiefCharacter.icon 
        })
        .setFooter({ 
            text: isSuccess ? 'Steal successful!' : 'Steal failed!', 
            iconURL: isNPC ? null : targetCharacter.icon 
        });

    // Add job voucher indicator if active
    if (thiefCharacter.jobVoucher && thiefCharacter.jobVoucherJob) {
        embed.addFields({
            name: '🎫 Job Voucher',
            value: `> Using **${thiefCharacter.jobVoucherJob}** voucher`,
            inline: false
        });
    }

    if (isSuccess) {
        embed.setImage('https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png');
    }

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
function isProtected(targetId) {
    const protectionEnd = stealProtection.get(targetId);
    if (!protectionEnd) {
        return false;
    }
    
    // Clean up expired protection
    if (Date.now() >= protectionEnd) {
        stealProtection.delete(targetId);
        return false;
    }
    
    return true;
}

function setProtection(targetId) {
    stealProtection.set(targetId, Date.now() + PROTECTION_DURATION);
}

function clearProtection(targetId) {
    stealProtection.delete(targetId);
}

function getProtectionTimeLeft(targetId) {
    const protectionEnd = stealProtection.get(targetId);
    if (!protectionEnd) {
        return 0;
    }
    
    const timeLeft = protectionEnd - Date.now();
    return timeLeft > 0 ? timeLeft : 0;
}

// ------------------- Cleanup expired protections -------------------
function cleanupExpiredProtections() {
    const now = Date.now();
    for (const [targetId, protectionEnd] of stealProtection.entries()) {
        if (now >= protectionEnd) {
            stealProtection.delete(targetId);
        }
    }
}

// ------------------- Statistics Functions -------------------
async function updateStealStats(characterId, success, itemRarity, victimCharacter = null) {
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
            if (victimCharacter) {
                const victimIndex = stats.victims.findIndex(v => 
                    v.characterId.toString() === victimCharacter._id.toString()
                );
                
                if (victimIndex === -1) {
                    // Add new victim
                    stats.victims.push({
                        characterId: victimCharacter._id,
                        characterName: victimCharacter.name,
                        count: 1
                    });
                } else {
                    // Increment existing victim count
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
        const stats = await StealStats.findOne({ characterId }) || {
            totalAttempts: 0,
            successfulSteals: 0,
            failedSteals: 0,
            itemsByRarity: {
                common: 0,
                uncommon: 0,
                rare: 0
            },
            victims: []
        };
        
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
        const item = await ItemModel.findOne({ itemName: new RegExp(`^${itemName}$`, 'i') }).select('emoji').exec();
        if (item && item.emoji) {
            return item.emoji;
        }
        const itemDetails = await ItemModel.findOne({ itemName: new RegExp(`^${itemName}$`, 'i') }).select('type category').exec();
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

// ------------------- Jail Management Functions -------------------
// Centralized jail system to prevent race conditions and ensure consistency
const JAIL_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

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
    
    return { isInJail: true, timeLeft };
}

async function sendToJail(character) {
    character.inJail = true;
    character.jailReleaseTime = new Date(Date.now() + JAIL_DURATION);
    character.failedStealAttempts = 0; // Reset counter
    await character.save();
    
    return {
        success: true,
        releaseTime: character.jailReleaseTime,
        timeLeft: JAIL_DURATION
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
        warningMessage = '⛔ **You have been sent to jail for 24 hours!**';
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

// ------------------- Centralized Success Handling -------------------
// Centralized success handling to eliminate duplication
async function handleStealSuccess(thiefCharacter, targetCharacter, selectedItem, quantity, roll, failureThreshold, isNPC, interaction, voucherCheck, usedFallback, targetRarity, selectedTier) {
    incrementStreak(interaction.user.id);
    await updateStealStats(thiefCharacter._id, true, selectedItem.tier, isNPC ? null : targetCharacter);
    
    // Set protection for target
    if (isNPC) {
        setProtection(targetCharacter); // targetCharacter is NPC name string
    } else {
        setProtection(targetCharacter._id);
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
        
        // Add fallback message if needed
        if (usedFallback) {
            const fallbackMessage = getFallbackMessage(targetRarity, selectedTier);
            if (fallbackMessage) {
                embed.addFields({ name: 'Note', value: fallbackMessage, inline: false });
            }
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
    
    try {
        const embed = await createStealResultEmbed(thiefCharacter, targetCharacter, selectedItem, 0, roll, failureThreshold, false, isNPC);
        
        // Add fallback message if needed
        if (usedFallback) {
            const fallbackMessage = getFallbackMessage(targetRarity, selectedTier);
            if (fallbackMessage) {
                embed.addFields({ name: 'Note', value: fallbackMessage, inline: false });
            }
        }
        
        // Handle failed attempts
        await handleFailedAttempts(thiefCharacter, embed);
        
        // Always deactivate job voucher after any attempt
        await deactivateJobVoucherIfNeeded(thiefCharacter, voucherCheck);
        
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        await handleStealError(error, interaction, isNPC ? 'NPC steal failure' : 'player steal failure');
    }
}

// ------------------- Centralized Roll Generation -------------------
// Centralized roll generation to eliminate duplication
function generateStealRoll() {
    return Math.floor(Math.random() * 99) + 1;
}

// ------------------- Centralized Failure Threshold Calculation -------------------
// Centralized failure threshold calculation to eliminate duplication
function calculateFailureThreshold(itemTier) {
    return FAILURE_CHANCES[itemTier];
}

// ------------------- Centralized Item Processing -------------------
// Centralized item processing with rarity to eliminate duplication
// Updated to preserve quantity information for player items while handling NPC items
async function processItemsWithRarity(itemNames, isNPC = false, inventoryEntries = null) {
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
                    await interaction.editReply({ content: `✅ **${character.name}** is not in jail.` });
                    return;
                }

                const embed = createBaseEmbed('⏰ Jail Time Remaining', '#ff0000')
                    .setDescription(`**${character.name}** is currently in jail.`)
                    .addFields(
                        { name: 'Time Remaining', value: `<t:${Math.floor((Date.now() + jailStatus.timeLeft) / 1000)}:R>`, inline: false },
                        { name: 'Release Time', value: `<t:${Math.floor((Date.now() + jailStatus.timeLeft) / 1000)}:F>`, inline: false },
                        { name: 'Formatted Time', value: formatJailTimeLeft(jailStatus.timeLeft), inline: false }
                    )
                    .setThumbnail(character.icon);

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
                    ? sortedVictims.map(v => `**${v.characterName}**: ${v.count} time${v.count > 1 ? 's' : ''}`).join('\n')
                    : 'No successful steals yet';
                
                // Check protection status
                const isCharacterProtected = isProtected(character._id);
                const protectionTimeLeft = getProtectionTimeLeft(character._id);
                const protectionStatus = isCharacterProtected 
                    ? `🛡️ Protected (${Math.ceil(protectionTimeLeft / (60 * 1000))}m remaining)`
                    : '✅ Not protected';
                
                const embed = createBaseEmbed('📊 Steal Statistics')
                    .setDescription(`Statistics for **${character.name}** the ${character.job ? character.job.charAt(0).toUpperCase() + character.job.slice(1).toLowerCase() : 'No Job'}`)
                    .addFields(
                        { name: '🎯 Total Attempts', value: stats.totalAttempts.toString(), inline: true },
                        { name: '✅ Successful Steals', value: stats.successfulSteals.toString(), inline: true },
                        { name: '❌ Failed Steals', value: stats.failedSteals.toString(), inline: true },
                        { name: '📈 Success Rate', value: `${stats.successRate}%`, inline: true },
                        { name: '🛡️ Protection Status', value: protectionStatus, inline: true },
                        { name: '✨ Items by Rarity', value: 
                            `Common: ${stats.itemsByRarity.common}\n` +
                            `Uncommon: ${stats.itemsByRarity.uncommon}\n` +
                            `Rare: ${stats.itemsByRarity.rare}`, inline: false },
                        { name: '👥 Victims', value: victimsList, inline: false }
                    );
                
                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // If we get here, we're handling the 'commit' subcommand
            if (!targetName || !targetType || !raritySelection) {
                await interaction.reply({ content: '❌ **Missing required options for steal command.**', ephemeral: true });
                return;
            }

            // ---- Rarity Validation ----
            const allowedRarities = ['common', 'uncommon', 'rare'];
            if (!allowedRarities.includes(raritySelection)) {
                await interaction.reply({ content: '❌ **Invalid rarity. Please select a rarity from the dropdown menu.**', ephemeral: true });
                return;
            }

            // Validate the thief character
            const validationResult = await validateCharacter(characterName, interaction.user.id, true);
            if (!validationResult.valid) {
                await interaction.reply({ content: validationResult.error, ephemeral: true });
                return;
            }

            const thiefCharacter = validationResult.character;

            // Defer the reply immediately to prevent timeout
            await interaction.deferReply();

            // ---- Centralized Jail Status Check ----
            const jailStatus = await checkAndUpdateJailStatus(thiefCharacter);
            
            // ---- Bandit Job or Voucher Restriction ----
            console.log(`[steal.js]: job=${thiefCharacter.job}, voucher=${thiefCharacter.jobVoucher}, voucherJob=${thiefCharacter.jobVoucherJob}`);
            const isBanditJob = (thiefCharacter.job && thiefCharacter.job.toLowerCase() === 'bandit');
            const isBanditVoucher = (thiefCharacter.jobVoucher && thiefCharacter.jobVoucherJob && thiefCharacter.jobVoucherJob.toLowerCase() === 'bandit');
            if (!isBanditJob && !isBanditVoucher) {
                await interaction.editReply({ content: '❌ Only Bandits or those with a valid Bandit job voucher can steal!' });
                return;
            }

            // Check if character is in jail
            if (jailStatus.isInJail) {
                const timeLeft = formatJailTimeLeft(jailStatus.timeLeft);
                await interaction.editReply({ 
                    content: `⛔ **You are currently in jail and cannot steal!**\n⏰ Time remaining: ${timeLeft}` 
                });
                return;
            }

            // Validate target character
            const targetValidation = await validateCharacter(targetName, null);
            if (!targetValidation.valid && targetType === 'player') {
                await interaction.editReply({ content: targetValidation.error });
                return;
            }

            const targetCharacter = targetType === 'player' ? targetValidation.character : null;

            // ---- Prevent Stealing from Self ----
            if (targetType === 'player' && thiefCharacter._id.toString() === targetCharacter._id.toString()) {
                await interaction.editReply({ content: '❌ **You cannot steal from yourself!**' });
                return;
            }

            // ------------------- Validate Interaction Channel -------------------
            let currentVillage = capitalizeWords(thiefCharacter.currentVillage);
            let allowedChannel = villageChannels[currentVillage];

            // If using a job voucher for a village-exclusive job, override to required village
            if (thiefCharacter.jobVoucher && thiefCharacter.jobVoucherJob) {
                const voucherPerk = getJobPerk(thiefCharacter.jobVoucherJob);
                if (voucherPerk && voucherPerk.village) {
                    const requiredVillage = capitalizeWords(voucherPerk.village);
                    currentVillage = requiredVillage;
                    allowedChannel = villageChannels[requiredVillage];
                }
            }

            if (!allowedChannel || interaction.channelId !== allowedChannel) {
                const channelMention = `<#${allowedChannel}>`;
                await interaction.editReply({
                    embeds: [{
                        color: 0x008B8B, // Dark cyan color
                        description: `*${thiefCharacter.name} looks around, confused by their surroundings...*\n\n**Channel Restriction**\nYou can only use this command in the ${currentVillage} Town Hall channel!\n\n📍 **Current Location:** ${capitalizeWords(thiefCharacter.currentVillage)}\n💬 **Command Allowed In:** ${channelMention}`,
                        image: {
                            url: 'https://static.wixstatic.com/media/7573f4_9bdaa09c1bcd4081b48bbe2043a7bf6a~mv2.png'
                        },
                        footer: {
                            text: 'Channel Restriction'
                        }
                    }],
                    ephemeral: true
                });
                return;
            }

            // Initialize job variable early
            let job = (thiefCharacter.jobVoucher && thiefCharacter.jobVoucherJob) ? thiefCharacter.jobVoucherJob : thiefCharacter.job;

            // ------------------- Job Voucher Validation and Activation -------------------
            // Job vouchers allow characters to temporarily gain the "Bandit" job for stealing.
            // 
            // VOUCHER FLOW:
            // 1. If character has jobVoucher = true, validate the voucher
            // 2. validateJobVoucher() returns:
            //    - { success: true, skipVoucher: false } = Valid voucher, needs activation
            //    - { success: true, skipVoucher: true } = Character already has the job, skip activation
            //    - { success: false, message: "error" } = Invalid voucher, show error
            // 3. If valid and needs activation, fetch voucher item and activate
            // 4. After steal attempt (success/failure), deactivate voucher
            //
            // VOUCHER STATES:
            // - No voucher: character.jobVoucher = false, voucherCheck = undefined
            // - Has voucher: character.jobVoucher = true, voucherCheck = validation result
            // - Skip case: character already has the job, no activation needed
            // - Activation case: voucher is activated for this steal attempt
            let voucherCheck;
            if (thiefCharacter.jobVoucher) {
                console.log(`[steal.js]: 🎫 Validating job voucher for ${thiefCharacter.name}`);
                voucherCheck = await validateJobVoucher(thiefCharacter, job, 'STEALING');
                
                if (voucherCheck.skipVoucher) {
                    console.log(`[steal.js]: ✅ ${thiefCharacter.name} already has job "${job}" - skipping voucher`);
                } else if (!voucherCheck.success) {
                    console.error(`[steal.js]: ❌ Voucher validation failed: ${voucherCheck.message}`);
                    await interaction.editReply({
                        content: voucherCheck.message,
                        ephemeral: true,
                    });
                    return;
                } else {
                    // Fetch the job voucher item for activation
                    const { success: itemSuccess, item: jobVoucherItem, message: itemError } = await fetchJobVoucherItem();
                    if (!itemSuccess) {
                        await interaction.editReply({ content: itemError, ephemeral: true });
                        return;
                    }
                    
                    const activationResult = await activateJobVoucher(thiefCharacter, job, jobVoucherItem, 1, interaction);
                    if (!activationResult.success) {
                        await interaction.editReply({
                            content: activationResult.message,
                            ephemeral: true,
                        });
                        return;
                    }
                }
            }

            // Check if thief's inventory is set up
            if (!thiefCharacter.inventorySynced) {
                await interaction.editReply({ 
                    content: '❌ **Your inventory is not set up yet.** Use `/inventory test charactername:NAME` then `/inventory sync charactername:NAME` to initialize.', 
                    ephemeral: true 
                });
                return;
            }

            // Check if thief has a valid inventory URL
            const thiefInventoryLink = thiefCharacter.inventory || thiefCharacter.inventoryLink;
            if (typeof thiefInventoryLink !== 'string' || !isValidGoogleSheetsUrl(thiefInventoryLink)) {
                await interaction.editReply({ 
                    content: `❌ **Invalid Google Sheets URL for "${thiefCharacter.name}".**`, 
                    ephemeral: true 
                });
                return;
            }

            // Handle NPC stealing
            if (targetType === 'npc') {
                const mappedNPCName = NPC_NAME_MAPPING[targetName];
                if (!mappedNPCName) {
                    await interaction.editReply({ content: ERROR_MESSAGES.INVALID_TARGET });
                    return;
                }

                // Check if NPC is protected (using NPC name as ID)
                if (isProtected(mappedNPCName)) {
                    const timeLeft = getProtectionTimeLeft(mappedNPCName);
                    const timeLeftMinutes = Math.ceil(timeLeft / (60 * 1000));
                    await interaction.editReply({ 
                        content: `🛡️ **${mappedNPCName}** is currently protected from theft!\n⏰ Protection expires in ${timeLeftMinutes} minute${timeLeftMinutes !== 1 ? 's' : ''}.` 
                    });
                    return;
                }

                const npcInventory = getNPCItems(mappedNPCName);
                const itemsWithRarity = await processItemsWithRarity(npcInventory, true);

                const { items: filteredItems, selectedTier: npcSelectedTier, usedFallback: npcUsedFallback } = await selectItemsWithFallback(itemsWithRarity, raritySelection);

                if (filteredItems.length === 0) {
                    const fallbackMessage = getFallbackMessage(raritySelection, npcSelectedTier);
                    if (fallbackMessage) {
                        await interaction.editReply({ content: fallbackMessage });
                    } else {
                        await interaction.editReply({ content: ERROR_MESSAGES.NO_ITEMS });
                    }
                    return;
                }

                const selectedItem = getRandomItemByWeight(filteredItems);
                const roll = generateStealRoll();
                const failureThreshold = calculateFailureThreshold(selectedItem.tier);
                const isSuccess = roll > failureThreshold;

                if (isSuccess) {
                    const quantity = determineStealQuantity(selectedItem);
                    await handleStealSuccess(thiefCharacter, mappedNPCName, selectedItem, quantity, roll, failureThreshold, true, interaction, voucherCheck, npcUsedFallback, raritySelection, npcSelectedTier);
                } else {
                    await handleStealFailure(thiefCharacter, mappedNPCName, selectedItem, roll, failureThreshold, true, interaction, voucherCheck, npcUsedFallback, raritySelection, npcSelectedTier);
                }
            }

            // Handle player stealing
            if (targetType === 'player') {
                // Check target character's jail status
                const targetJailStatus = await checkAndUpdateJailStatus(targetCharacter);
                if (targetJailStatus.isInJail) {
                    const timeLeft = formatJailTimeLeft(targetJailStatus.timeLeft);
                    await interaction.editReply({ 
                        content: `❌ **You cannot steal from a character who is in jail!**\n⏰ ${targetCharacter.name} will be released in ${timeLeft}` 
                    });
                    console.log(`[steal.js]: ⚠️ Attempted to steal from jailed character: ${targetCharacter.name}`);
                    return;
                }

                if (thiefCharacter.currentVillage !== targetCharacter.currentVillage) {
                    await interaction.editReply({ 
                        content: `❌ **You can only steal from characters in the same village!**\n📍 **Your Location:** ${thiefCharacter.currentVillage}\n📍 **Target Location:** ${targetCharacter.currentVillage}`, 
                        ephemeral: true 
                    });
                    return;
                }

                if (isProtected(targetCharacter._id)) {
                    const timeLeft = getProtectionTimeLeft(targetCharacter._id);
                    const timeLeftMinutes = Math.ceil(timeLeft / (60 * 1000));
                    await interaction.editReply({ 
                        content: `🛡️ **${targetCharacter.name}** is currently protected from theft!\n⏰ Protection expires in ${timeLeftMinutes} minute${timeLeftMinutes !== 1 ? 's' : ''}.` 
                    });
                    return;
                }

                if (!targetCharacter.canBeStolenFrom) {
                    await interaction.editReply({ content: `⚠️ **${targetCharacter.name}** cannot be stolen from.` });
                    return;
                }

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

                const availableItemNames = rawItemNames.filter(itemName => !equippedItems.includes(itemName));
                const itemsWithRarity = await processItemsWithRarity(availableItemNames, false, inventoryEntries);

                const { items: filteredItemsPlayer, selectedTier: playerSelectedTier, usedFallback: playerUsedFallback } = await selectItemsWithFallback(itemsWithRarity, raritySelection);

                if (filteredItemsPlayer.length === 0) {
                    const fallbackMessage = getFallbackMessage(raritySelection, playerSelectedTier);
                    if (fallbackMessage) {
                        await interaction.editReply({ content: fallbackMessage });
                    } else {
                        await interaction.editReply({ content: `❌ **Looks like ${targetName || targetCharacter.name} didn't have any items to steal!**` });
                    }
                    return;
                }

                const selectedItem = getRandomItemByWeight(filteredItemsPlayer);
                const roll = generateStealRoll();
                const failureThreshold = calculateFailureThreshold(selectedItem.tier);
                const success = roll > failureThreshold;

                if (success) {
                    await handleStealSuccess(thiefCharacter, targetCharacter, selectedItem, determineStealQuantity(selectedItem), roll, failureThreshold, false, interaction, voucherCheck, playerUsedFallback, raritySelection, playerSelectedTier);
                } else {
                    await handleStealFailure(thiefCharacter, targetCharacter, selectedItem, roll, failureThreshold, false, interaction, voucherCheck, playerUsedFallback, raritySelection, playerSelectedTier);
                }
            }
        } catch (error) {
            handleError(error, 'steal.js');
            console.error('[steal.js]: Error executing command:', error);
            console.warn(`[steal.js]: ⚠️ Steal attempt not counted due to error or timeout for user ${interaction.user.id}`);
            await interaction.reply({ content: '❌ **An error occurred while processing the command.**', ephemeral: true });
        }
    },
};

